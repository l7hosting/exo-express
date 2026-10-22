import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authenticateRequest, requireAnyPermission, requirePermission } from "../plugins/auth.js";
import { conflict, forbidden, notFound, isUniqueConstraintError } from "../lib/errors.js";
import {
  assertAmountMatchesShipment,
  assertCanReverse,
  assertCollectable,
  assertNotAlreadyCollected,
  assertReversible,
  buildCodReference
} from "../lib/cod.js";
import { money } from "../lib/money.js";

const COLLECTED_AT_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;
const COLLECTED_AT_FUTURE_SKEW_MS = 5 * 60 * 1000;

const collectedAtSchema = z.coerce
  .date()
  .optional()
  .refine(
    (value) => !value || value.getTime() <= Date.now() + COLLECTED_AT_FUTURE_SKEW_MS,
    { message: "collectedAt cannot be in the future (5 minutes of clock skew allowed)" }
  )
  .refine(
    (value) => !value || value.getTime() >= Date.now() - COLLECTED_AT_MAX_AGE_MS,
    { message: "collectedAt cannot be older than 365 days" }
  );

const collectSchema = z.object({
  shipmentId: z.string().uuid(),
  amount: z.number().positive().max(10_000_000),
  paymentMethod: z.enum(["CASH", "CARD", "MOBILE_PAYMENT", "BANK_TRANSFER"]).default("CASH"),
  collectedAt: collectedAtSchema,
  note: z.string().max(300).optional()
});

const reverseSchema = z.object({
  reason: z.string().min(3).max(300)
});

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  courierId: z.string().uuid().optional(),
  shipmentId: z.string().uuid().optional(),
  status: z.enum(["COLLECTED", "REVERSED"]).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional()
});

export async function codRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateRequest);

  /**
   * COD ledger listing. A courier only ever sees their own collections.
   */
  app.get("/api/v1/cod", { preHandler: requirePermission("cod:read") }, async (request) => {
    const query = listQuerySchema.parse(request.query);
    const actor = request.auth!.user;

    const where: Record<string, unknown> = {};
    if (query.courierId) where.courierId = query.courierId;
    if (query.shipmentId) where.shipmentId = query.shipmentId;
    if (query.status) where.status = query.status;
    if (query.from || query.to) {
      where.collectedAt = {
        ...(query.from ? { gte: query.from } : {}),
        ...(query.to ? { lte: query.to } : {})
      };
    }
    if (actor.role === "COURIER") where.courierId = actor.id;

    const [items, total, totals] = await Promise.all([
      prisma.codCollection.findMany({
        where,
        orderBy: { collectedAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          courier: { select: { id: true, fullName: true } },
          shipment: {
            select: {
              id: true,
              trackingNumber: true,
              recipientName: true,
              merchantId: true,
              merchant: { select: { id: true, businessName: true } },
              codAmount: true,
              status: true
            }
          }
        }
      }),
      prisma.codCollection.count({ where }),
      prisma.codCollection.aggregate({
        where: { ...where, status: "COLLECTED" },
        _sum: { amount: true }
      })
    ]);

    return {
      items,
      page: query.page,
      pageSize: query.pageSize,
      total,
      collectedTotal: money(totals._sum.amount ?? 0).toFixed(2)
    };
  });

  /**
   * Records a COD collection made by a courier on a delivered shipment.
   * The amount must match the shipment COD amount exactly.
   */
  app.post("/api/v1/cod", { preHandler: requirePermission("cod:write") }, async (request, reply) => {
    const body = collectSchema.parse(request.body);
    const actor = request.auth!.user;

    const shipmentId = body.shipmentId;

    const shipment = await prisma.shipment.findUnique({
      where: { id: shipmentId },
      select: {
        id: true,
        trackingNumber: true,
        status: true,
        codAmount: true,
        courierId: true,
        merchantId: true
      }
    });
    if (!shipment) throw notFound("Shipment not found");

    if (actor.role === "COURIER" && shipment.courierId !== actor.id) {
      throw forbidden("Shipment is not assigned to you");
    }

    assertCollectable(shipment);

    const expected = money(shipment.codAmount);
    const amount = money(body.amount);
    assertAmountMatchesShipment(amount, expected);

    const existing = await prisma.codCollection.findUnique({ where: { shipmentId } });
    assertNotAlreadyCollected(existing);

    let collection;
    try {
      collection = await prisma.$transaction(async (tx) => {
        const created = await tx.codCollection.create({
          data: {
            shipmentId,
            courierId: actor.id,
            amount,
            paymentMethod: body.paymentMethod,
            reference: buildCodReference(),
            collectedAt: body.collectedAt ?? new Date(),
            status: "COLLECTED",
            transactions: {
              create: {
                type: "COLLECTION",
                amount,
                actorId: actor.id,
                note: body.note ?? null
              }
            }
          },
          include: {
            courier: { select: { id: true, fullName: true } },
            shipment: { select: { id: true, trackingNumber: true, codAmount: true } }
          }
        });

        await tx.shipment.update({
          where: { id: shipmentId },
          data: { paymentStatus: "COLLECTED" }
        });

        await tx.shipmentEvent.create({
          data: {
            shipmentId,
            actorId: actor.id,
            fromStatus: shipment.status,
            toStatus: shipment.status,
            note: `COD collected (${amount.toFixed(2)} DH, ${body.paymentMethod})`
          }
        });

        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            action: "COD_COLLECTED",
            entity: "CodCollection",
            entityId: created.id,
            metadata: { shipmentId, amount: amount.toFixed(2), paymentMethod: body.paymentMethod }
          }
        });

        return created;
      });
    } catch (error) {
      // Two couriers collecting the same shipment at the same time: the unique
      // constraint on `CodCollection.shipmentId` is the final guard.
      if (isUniqueConstraintError(error)) {
        throw conflict("This shipment has already been collected");
      }
      throw error;
    }

    return reply.code(201).send(collection);
  });

  /**
   * Reverses a collection. The original record is kept and flipped to REVERSED,
   * a REVERSAL transaction is appended, and the shipment payment status returns
   * to PENDING so the money can be collected again.
   */
  app.post("/api/v1/cod/:id/reverse", { preHandler: requirePermission("cod:reverse") }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = reverseSchema.parse(request.body);
    const actor = request.auth!.user;

    const collection = await prisma.codCollection.findUnique({
      where: { id },
      include: { shipment: { select: { id: true, trackingNumber: true, status: true } } }
    });
    if (!collection) throw notFound("COD collection not found");
    assertReversible(collection);
    assertCanReverse(actor, collection.courierId, actor.id);

    const updated = await prisma.$transaction(async (tx) => {
      // Conditional claim: both concurrent reversals pass the pre-check, but
      // only the one still seeing COLLECTED wins and appends a REVERSAL.
      const claim = await tx.codCollection.updateMany({
        where: { id, status: "COLLECTED" },
        data: {
          status: "REVERSED",
          reversedAt: new Date(),
          reversedById: actor.id,
          reversalNote: body.reason
        }
      });

      if (claim.count !== 1) {
        throw conflict("This COD collection was already reversed or changed concurrently");
      }

      await tx.codTransaction.create({
        data: {
          collectionId: id,
          type: "REVERSAL",
          amount: collection.amount,
          actorId: actor.id,
          note: body.reason
        }
      });

      await tx.shipment.update({
        where: { id: collection.shipmentId },
        data: { paymentStatus: "PENDING" }
      });

      await tx.shipmentEvent.create({
        data: {
          shipmentId: collection.shipmentId,
          actorId: actor.id,
          fromStatus: collection.shipment.status,
          toStatus: collection.shipment.status,
          note: `COD reversed — ${body.reason}`
        }
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "COD_REVERSED",
          entity: "CodCollection",
          entityId: id,
          metadata: { shipmentId: collection.shipmentId, reason: body.reason }
        }
      });

      return tx.codCollection.findUniqueOrThrow({
        where: { id },
        include: {
          courier: { select: { id: true, fullName: true } },
          reversedBy: { select: { id: true, fullName: true } }
        }
      });
    });

    return updated;
  });

  /**
   * Immutable transaction history of a collection.
   */
  app.get("/api/v1/cod/:id/transactions", { preHandler: requirePermission("cod:read") }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const collection = await prisma.codCollection.findUnique({ where: { id } });
    if (!collection) return reply.code(404).send({ error: "NOT_FOUND", message: "COD collection not found" });

    const actor = request.auth!.user;
    if (actor.role === "COURIER" && collection.courierId !== actor.id) {
      return reply.code(403).send({ error: "FORBIDDEN", message: "Not your collection" });
    }

    const transactions = await prisma.codTransaction.findMany({
      where: { collectionId: id },
      orderBy: { createdAt: "asc" },
      include: { actor: { select: { id: true, fullName: true, role: true } } }
    });

    return { collection, transactions };
  });

  /**
   * Reconciliation report: collected COD versus delivered shipments.
   * `uncollectedDelivered` lists delivered shipments whose COD was never recorded.
   */
  app.get("/api/v1/cod/reconciliation", { preHandler: requirePermission("cod:read") }, async (request) => {
    const query = z
      .object({
        from: z.coerce.date().optional(),
        to: z.coerce.date().optional(),
        merchantId: z.string().uuid().optional()
      })
      .parse(request.query);

    const actor = request.auth!.user;

    // Reconciliation exposes global financial totals and every merchant's
    // delivered recipient names, so it is back-office only.
    if (actor.role === "COURIER") {
      throw forbidden("Couriers cannot read the global COD reconciliation");
    }

    const deliveredWhere: Record<string, unknown> = {
      status: "DELIVERED",
      codAmount: { gt: 0 }
    };
    if (query.from || query.to) {
      deliveredWhere.updatedAt = {
        ...(query.from ? { gte: query.from } : {}),
        ...(query.to ? { lte: query.to } : {})
      };
    }
    if (query.merchantId) deliveredWhere.merchantId = query.merchantId;

    const collectedWhere: Record<string, unknown> = { status: "COLLECTED" };
    if (query.from || query.to) {
      collectedWhere.collectedAt = {
        ...(query.from ? { gte: query.from } : {}),
        ...(query.to ? { lte: query.to } : {})
      };
    }

    const [collected, reversed, deliveredShipments, expectedTotal] = await Promise.all([
      prisma.codCollection.aggregate({ where: collectedWhere, _sum: { amount: true }, _count: { _all: true } }),
      prisma.codCollection.aggregate({ where: { status: "REVERSED" }, _sum: { amount: true }, _count: { _all: true } }),
      prisma.shipment.findMany({
        where: deliveredWhere,
        select: {
          id: true,
          trackingNumber: true,
          recipientName: true,
          codAmount: true,
          merchant: { select: { id: true, businessName: true } },
          codCollection: { select: { id: true, status: true, amount: true, courier: { select: { fullName: true } } } }
        },
        orderBy: { updatedAt: "desc" },
        take: 200
      }),
      prisma.shipment.aggregate({ where: deliveredWhere, _sum: { codAmount: true }, _count: { _all: true } })
    ]);

    const collectedTotal = money(collected._sum.amount ?? 0);
    const reversedTotal = money(reversed._sum.amount ?? 0);
    const expectedCodTotal = money(expectedTotal._sum.codAmount ?? 0);

    const uncollectedDelivered = deliveredShipments.filter(
      (shipment) => !shipment.codCollection || shipment.codCollection.status !== "COLLECTED"
    );

    const body: Record<string, unknown> = {
      deliveredShipments: expectedTotal._count._all,
      expectedCodTotal: expectedCodTotal.toFixed(2),
      collectedTotal: collectedTotal.toFixed(2),
      reversedTotal: reversedTotal.toFixed(2),
      collections: collected._count._all,
      reversals: reversed._count._all,
      outstandingTotal: expectedCodTotal.minus(collectedTotal).toFixed(2),
      uncollectedDelivered: uncollectedDelivered.map((shipment) => ({
        id: shipment.id,
        trackingNumber: shipment.trackingNumber,
        recipientName: shipment.recipientName,
        codAmount: money(shipment.codAmount).toFixed(2),
        merchant: shipment.merchant.businessName,
        collectionStatus: shipment.codCollection?.status ?? null
      }))
    };

    return body;
  });

  /**
   * Merchant COD balance: what was collected versus what is still outstanding.
   * Readable by back-office roles and by the merchant itself (own line only).
   */
  app.get(
    "/api/v1/cod/merchant-balances",
    { preHandler: requireAnyPermission("cod:read", "settlement:read") },
    async (request) => {
      const actor = request.auth!.user;

      if (actor.role === "COURIER") {
        throw forbidden("Couriers cannot read merchant balances");
      }

      const merchants = await prisma.merchant.findMany({
        orderBy: { businessName: "asc" },
        select: { id: true, businessName: true }
      });

      const balances = [];
      for (const merchant of merchants) {
        const [collected, outstanding] = await Promise.all([
          prisma.codCollection.aggregate({
            where: { status: "COLLECTED", shipment: { merchantId: merchant.id } },
            _sum: { amount: true }
          }),
          prisma.shipment.aggregate({
            where: {
              merchantId: merchant.id,
              status: "DELIVERED",
              codAmount: { gt: 0 },
              // A reversed collection is no longer money in hand, so the
              // shipment becomes outstanding again instead of disappearing.
              OR: [{ codCollection: null }, { codCollection: { status: "REVERSED" } }]
            },
            _sum: { codAmount: true }
          })
        ]);

        balances.push({
          merchantId: merchant.id,
          businessName: merchant.businessName,
          collected: money(collected._sum.amount ?? 0).toFixed(2),
          outstanding: money(outstanding._sum.codAmount ?? 0).toFixed(2)
        });
      }

      if (actor.role === "MERCHANT" && actor.merchantId) {
        return { items: balances.filter((balance) => balance.merchantId === actor.merchantId) };
      }

      return { items: balances };
    }
  );
}
