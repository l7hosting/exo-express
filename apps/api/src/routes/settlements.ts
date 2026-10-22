import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { authenticateRequest, requirePermission } from "../plugins/auth.js";
import { badRequest, conflict, forbidden, notFound, isUniqueConstraintError } from "../lib/errors.js";
import {
  assertNoDuplicateShipments,
  assertNonEmpty,
  assertSegregationOfDuties,
  assertSettlementTransition,
  buildSettlementReference,
  computeSettlementTotals
} from "../lib/settlements.js";
import { money } from "../lib/money.js";

const createSchema = z
  .object({
    merchantId: z.string().uuid(),
    shipmentIds: z.array(z.string().uuid()).min(1).max(500),
    periodStart: z.coerce.date().optional(),
    periodEnd: z.coerce.date().optional(),
    adjustments: z.number().min(-10_000_000).max(10_000_000).default(0),
    note: z.string().max(300).optional()
  })
  .refine(
    (value) =>
      !value.periodStart ||
      !value.periodEnd ||
      value.periodStart.getTime() <= value.periodEnd.getTime(),
    { message: "periodStart must be before or equal to periodEnd", path: ["periodEnd"] }
  );

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  merchantId: z.string().uuid().optional(),
  status: z.enum(["PENDING", "APPROVED", "PAID", "CANCELLED"]).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional()
});

const CSV_EXPORT_LIMIT = 5000;

/**
 * Neutralises spreadsheet formula injection (CSV injection). A cell that a
 * spreadsheet would interpret as a formula is prefixed with an apostrophe so
 * it is displayed literally.
 */
function sanitizeCsvCell(value: string): string {
  if (/^[=+@\t\r]/.test(value) || /^-(?![0-9])/.test(value)) {
    return `'${value}`;
  }
  return value;
}

export async function settlementRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateRequest);

  app.get("/api/v1/settlements", { preHandler: requirePermission("settlement:read") }, async (request) => {
    const query = listQuerySchema.parse(request.query);
    const actor = request.auth!.user;

    const where: Record<string, unknown> = {};
    if (query.merchantId) where.merchantId = query.merchantId;
    if (query.status) where.status = query.status;
    if (query.from || query.to) {
      where.createdAt = {
        ...(query.from ? { gte: query.from } : {}),
        ...(query.to ? { lte: query.to } : {})
      };
    }
    if (actor.role === "MERCHANT") {
      if (!actor.merchantId) return { items: [], page: query.page, pageSize: query.pageSize, total: 0 };
      where.merchantId = actor.merchantId;
    }

    const [items, total] = await Promise.all([
      prisma.merchantSettlement.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          merchant: { select: { id: true, businessName: true } },
          createdBy: { select: { id: true, fullName: true } },
          approvedBy: { select: { id: true, fullName: true } },
          paidBy: { select: { id: true, fullName: true } },
          _count: { select: { items: true } }
        }
      }),
      prisma.merchantSettlement.count({ where })
    ]);

    return { items, page: query.page, pageSize: query.pageSize, total };
  });

  app.get("/api/v1/settlements/:id", { preHandler: requirePermission("settlement:read") }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const actor = request.auth!.user;

    const settlement = await prisma.merchantSettlement.findUnique({
      where: { id },
      include: {
        merchant: { select: { id: true, businessName: true } },
        createdBy: { select: { id: true, fullName: true, role: true } },
        approvedBy: { select: { id: true, fullName: true, role: true } },
        paidBy: { select: { id: true, fullName: true, role: true } },
        cancelledBy: { select: { id: true, fullName: true, role: true } },
        items: {
          include: {
            shipment: {
              select: {
                id: true,
                trackingNumber: true,
                recipientName: true,
                status: true,
                createdAt: true
              }
            }
          }
        }
      }
    });

    if (!settlement) return reply.code(404).send({ error: "NOT_FOUND", message: "Settlement not found" });
    if (actor.role === "MERCHANT" && settlement.merchantId !== actor.merchantId) {
      return reply.code(403).send({ error: "FORBIDDEN", message: "Access denied" });
    }

    return settlement;
  });

  /**
   * Creates a settlement batch from delivered shipments that have a recorded
   * COD collection and have not been settled yet.
   */
  app.post("/api/v1/settlements", { preHandler: requirePermission("settlement:write") }, async (request, reply) => {
    const body = createSchema.parse(request.body);
    const actor = request.auth!.user;

    const merchant = await prisma.merchant.findUnique({ where: { id: body.merchantId } });
    if (!merchant) throw notFound("Merchant not found");

    const shipments = await prisma.shipment.findMany({
      where: { id: { in: body.shipmentIds }, merchantId: body.merchantId },
      include: {
        codCollection: true,
        settlementItems: { select: { id: true, settlementId: true } }
      }
    });

    if (shipments.length !== body.shipmentIds.length) {
      throw badRequest("One or more shipments do not exist for this merchant");
    }

    const lines = shipments.map((shipment) => ({
      shipmentId: shipment.id,
      codAmount: money(shipment.codCollection?.status === "COLLECTED" ? shipment.codCollection.amount : 0),
      deliveryFee: money(shipment.deliveryFee),
      returnFee: money(shipment.status === "DELIVERED" ? 0 : shipment.returnFee)
    }));

    assertNonEmpty(lines);
    assertNoDuplicateShipments(lines);

    const alreadySettled = shipments.filter((shipment) => shipment.settlementItems.length > 0);
    if (alreadySettled.length > 0) {
      throw conflict(
        `Shipment ${alreadySettled[0].trackingNumber} is already part of a settlement`
      );
    }

    const withoutCollection = shipments.filter(
      (shipment) => shipment.codCollection?.status !== "COLLECTED"
    );
    if (withoutCollection.length > 0) {
      throw badRequest(
        `Shipment ${withoutCollection[0].trackingNumber} has no collected COD and cannot be settled`
      );
    }

    const adjustments = money(body.adjustments);
    const totals = computeSettlementTotals(lines, adjustments);

    const periodStart =
      body.periodStart ??
      shipments.reduce(
        (earliest, shipment) => (shipment.createdAt < earliest ? shipment.createdAt : earliest),
        shipments[0].createdAt
      );
    const periodEnd =
      body.periodEnd ??
      shipments.reduce(
        (latest, shipment) => (shipment.updatedAt > latest ? shipment.updatedAt : latest),
        shipments[0].updatedAt
      );

    const reference = buildSettlementReference(merchant.businessName.replace(/[^A-Z0-9]/gi, "").slice(0, 6).toUpperCase() || "MRC");

    let settlement;
    try {
      settlement = await prisma.$transaction(async (tx) => {
        // Serialise batch creation on the shipment rows. Without this lock two
        // concurrent requests can both pass the re-check (SettlementItem is
        // only unique per settlement), so the lock makes the re-check
        // authoritative. Ids are sorted to keep lock ordering deterministic.
        const lockedIds = [...body.shipmentIds].sort();
        await tx.$queryRaw`
          SELECT id FROM "Shipment"
          WHERE id IN (${Prisma.join(lockedIds)})
          ORDER BY id
          FOR UPDATE
        `;

        // Re-verify the batch contents inside the transaction. Between the
        // read above and this write another request may have settled a
        // shipment or reversed its collection.
        const stillEligible = await tx.shipment.count({
          where: {
            id: { in: body.shipmentIds },
            merchantId: merchant.id,
            codCollection: { is: { status: "COLLECTED" } },
            settlementItems: { none: {} }
          }
        });

        if (stillEligible !== body.shipmentIds.length) {
          throw conflict("Settlement contents changed while the batch was being created; reload and retry");
        }

        const created = await tx.merchantSettlement.create({
          data: {
            merchantId: merchant.id,
            periodStart,
            periodEnd,
            grossCod: totals.grossCod,
            deliveryFees: totals.deliveryFees,
            returnFees: totals.returnFees,
            adjustments: totals.adjustments,
            netPayable: totals.netPayable,
            status: "PENDING",
            reference,
            createdById: actor.id,
            cancelReason: body.note ?? null,
            items: {
              create: lines.map((line) => ({
                shipmentId: line.shipmentId,
                codAmount: line.codAmount,
                deliveryFee: line.deliveryFee,
                returnFee: line.returnFee
              }))
            }
          },
          include: {
            merchant: { select: { id: true, businessName: true } },
            createdBy: { select: { id: true, fullName: true, role: true } },
            items: true
          }
        });

        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            action: "SETTLEMENT_CREATED",
            entity: "MerchantSettlement",
            entityId: created.id,
            metadata: {
              reference,
              netPayable: totals.netPayable.toFixed(2),
              itemCount: lines.length
            }
          }
        });

        return created;
      });
    } catch (error) {
      // `SettlementItem.shipmentId` is unique: a concurrent settlement of the
      // same shipment is rejected by the database.
      if (isUniqueConstraintError(error)) {
        throw conflict("One of the shipments is already part of a settlement");
      }
      throw error;
    }

    return reply.code(201).send(settlement);
  });

  /**
   * Approves a pending settlement.
   */
  app.post("/api/v1/settlements/:id/approve", { preHandler: requirePermission("settlement:approve") }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const actor = request.auth!.user;

    const settlement = await prisma.merchantSettlement.findUnique({ where: { id } });
    if (!settlement) throw notFound("Settlement not found");
    assertSettlementTransition(settlement.status, "APPROVED");
    assertSegregationOfDuties(actor, settlement);

    const updated = await prisma.$transaction(async (tx) => {
      const claim = await tx.merchantSettlement.updateMany({
        where: { id, status: settlement.status },
        data: { status: "APPROVED", approvedById: actor.id, approvedAt: new Date() }
      });

      if (claim.count !== 1) {
        throw conflict("Settlement changed concurrently; reload and retry");
      }

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "SETTLEMENT_APPROVED",
          entity: "MerchantSettlement",
          entityId: id,
          metadata: { reference: settlement.reference }
        }
      });

      return tx.merchantSettlement.findUniqueOrThrow({
        where: { id },
        include: {
          merchant: { select: { id: true, businessName: true } },
          createdBy: { select: { id: true, fullName: true, role: true } },
          approvedBy: { select: { id: true, fullName: true, role: true } },
          _count: { select: { items: true } }
        }
      });
    });

    return updated;
  });

  /**
   * Marks an approved settlement as paid.
   */
  app.post("/api/v1/settlements/:id/pay", { preHandler: requirePermission("settlement:pay") }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const actor = request.auth!.user;

    const settlement = await prisma.merchantSettlement.findUnique({ where: { id } });
    if (!settlement) throw notFound("Settlement not found");
    assertSettlementTransition(settlement.status, "PAID");
    assertSegregationOfDuties(actor, settlement);

    const updated = await prisma.$transaction(async (tx) => {
      const claim = await tx.merchantSettlement.updateMany({
        where: { id, status: settlement.status },
        data: { status: "PAID", paidById: actor.id, paidAt: new Date() }
      });

      if (claim.count !== 1) {
        throw conflict("Settlement changed concurrently; reload and retry");
      }

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "SETTLEMENT_PAID",
          entity: "MerchantSettlement",
          entityId: id,
          metadata: {
            reference: settlement.reference,
            netPayable: money(settlement.netPayable).toFixed(2)
          }
        }
      });

      return tx.merchantSettlement.findUniqueOrThrow({
        where: { id },
        include: {
          merchant: { select: { id: true, businessName: true } },
          createdBy: { select: { id: true, fullName: true, role: true } },
          approvedBy: { select: { id: true, fullName: true, role: true } },
          paidBy: { select: { id: true, fullName: true, role: true } },
          _count: { select: { items: true } }
        }
      });
    });

    return updated;
  });

  /**
   * Cancels a settlement. The shipments it contains become settleable again.
   */
  app.post("/api/v1/settlements/:id/cancel", { preHandler: requirePermission("settlement:write") }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = z.object({ reason: z.string().min(3).max(300) }).parse(request.body);
    const actor = request.auth!.user;

    const settlement = await prisma.merchantSettlement.findUnique({ where: { id } });
    if (!settlement) throw notFound("Settlement not found");
    assertSettlementTransition(settlement.status, "CANCELLED");

    const updated = await prisma.$transaction(async (tx) => {
      const claim = await tx.merchantSettlement.updateMany({
        where: { id, status: settlement.status },
        data: {
          status: "CANCELLED",
          cancelledById: actor.id,
          cancelledAt: new Date(),
          cancelReason: body.reason
        }
      });

      if (claim.count !== 1) {
        throw conflict("Settlement changed concurrently; reload and retry");
      }

      // Snapshot the financial lines before they are released, so the audit
      // trail still records exactly what was cancelled.
      const items = await tx.settlementItem.findMany({
        where: { settlementId: id },
        select: { shipmentId: true, codAmount: true, deliveryFee: true, returnFee: true }
      });

      await tx.settlementItem.deleteMany({ where: { settlementId: id } });

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "SETTLEMENT_CANCELLED",
          entity: "MerchantSettlement",
          entityId: id,
          metadata: {
            reference: settlement.reference,
            reason: body.reason,
            items: items.map((item) => ({
              shipmentId: item.shipmentId,
              codAmount: money(item.codAmount).toFixed(2),
              deliveryFee: money(item.deliveryFee).toFixed(2),
              returnFee: money(item.returnFee).toFixed(2)
            }))
          }
        }
      });

      return tx.merchantSettlement.findUniqueOrThrow({
        where: { id },
        include: {
          merchant: { select: { id: true, businessName: true } },
          createdBy: { select: { id: true, fullName: true, role: true } },
          cancelledBy: { select: { id: true, fullName: true, role: true } },
          _count: { select: { items: true } }
        }
      });
    });

    return updated;
  });

  /**
   * Settleable shipments for a merchant: delivered, COD collected, not settled yet.
   */
  app.get("/api/v1/settlements/settleable/:merchantId", { preHandler: requirePermission("settlement:read") }, async (request, reply) => {
    const { merchantId } = request.params as { merchantId: string };
    const actor = request.auth!.user;

    if (actor.role === "MERCHANT" && actor.merchantId !== merchantId) {
      return reply.code(403).send({ error: "FORBIDDEN", message: "Access denied" });
    }

    const merchant = await prisma.merchant.findUnique({ where: { id: merchantId } });
    if (!merchant) return reply.code(404).send({ error: "NOT_FOUND", message: "Merchant not found" });

    const shipments = await prisma.shipment.findMany({
      where: {
        merchantId,
        status: "DELIVERED",
        codCollection: { is: { status: "COLLECTED" } },
        settlementItems: { none: {} }
      },
      orderBy: { updatedAt: "asc" },
      select: {
        id: true,
        trackingNumber: true,
        recipientName: true,
        codAmount: true,
        deliveryFee: true,
        returnFee: true,
        updatedAt: true,
        codCollection: { select: { id: true, amount: true, collectedAt: true, reference: true } }
      }
    });

    const items = shipments.map((shipment) => ({
      id: shipment.id,
      trackingNumber: shipment.trackingNumber,
      recipientName: shipment.recipientName,
      codAmount: money(shipment.codCollection?.amount ?? 0).toFixed(2),
      deliveryFee: money(shipment.deliveryFee).toFixed(2),
      // Only delivered shipments are settleable, so no return fee is charged.
      returnFee: money(0).toFixed(2),
      collectedAt: shipment.codCollection?.collectedAt ?? null,
      reference: shipment.codCollection?.reference ?? null
    }));

    const totals = computeSettlementTotals(
      shipments.map((shipment) => ({
        shipmentId: shipment.id,
        codAmount: money(shipment.codCollection?.amount ?? 0),
        deliveryFee: money(shipment.deliveryFee),
        returnFee: money(0)
      }))
    );

    return {
      items,
      total: items.length,
      preview: {
        grossCod: totals.grossCod.toFixed(2),
        deliveryFees: totals.deliveryFees.toFixed(2),
        returnFees: totals.returnFees.toFixed(2),
        netPayable: totals.netPayable.toFixed(2)
      }
    };
  });

  /**
   * Exportable settlement report as CSV.
   */
  app.get("/api/v1/settlements/report.csv", { preHandler: requirePermission("settlement:read") }, async (request, reply) => {
    const query = listQuerySchema.parse(request.query);
    const actor = request.auth!.user;

    const where: Record<string, unknown> = {};
    if (query.merchantId) where.merchantId = query.merchantId;
    if (query.status) where.status = query.status;
    if (actor.role === "MERCHANT") {
      if (!actor.merchantId) throw forbidden("No merchant linked to this account");
      where.merchantId = actor.merchantId;
    }

    const settlements = await prisma.merchantSettlement.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: CSV_EXPORT_LIMIT,
      include: {
        merchant: { select: { businessName: true } },
        _count: { select: { items: true } }
      }
    });

    const header = [
      "reference",
      "merchant",
      "status",
      "period_start",
      "period_end",
      "items",
      "gross_cod",
      "delivery_fees",
      "return_fees",
      "adjustments",
      "net_payable",
      "created_at"
    ];

    const rows = settlements.map((settlement) =>
      [
        settlement.reference,
        settlement.merchant.businessName,
        settlement.status,
        settlement.periodStart.toISOString(),
        settlement.periodEnd.toISOString(),
        String(settlement._count.items),
        money(settlement.grossCod).toFixed(2),
        money(settlement.deliveryFees).toFixed(2),
        money(settlement.returnFees).toFixed(2),
        money(settlement.adjustments).toFixed(2),
        money(settlement.netPayable).toFixed(2),
        settlement.createdAt.toISOString()
      ]
        .map((value) => `"${sanitizeCsvCell(value).replace(/"/g, '""')}"`)
        .join(",")
    );

    const csv = [header.join(","), ...rows].join("\n");

    reply
      .header("Content-Type", "text/csv; charset=utf-8")
      .header("Content-Disposition", "attachment; filename=exo-settlements.csv")
      .header("Cache-Control", "no-store");

    if (settlements.length === CSV_EXPORT_LIMIT) {
      reply.header("X-Export-Truncated", "true");
    }

    return reply.send(csv);
  });
}
