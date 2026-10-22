import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authenticateRequest, requirePermission } from "../plugins/auth.js";
import { badRequest, conflict, isUniqueConstraintError } from "../lib/errors.js";
import { assertTransition, generateTrackingNumber, SHIPMENT_STATUSES, DELIVERY_OUTCOMES, assertOutcomeMatchesStatus } from "../lib/shipments.js";
import { assertSafePodReference } from "../lib/pod.js";
import { randomInt } from "node:crypto";

const createSchema = z.object({
  merchantId: z.string().uuid(),
  recipientName: z.string().min(2).max(120),
  recipientPhone: z.string().min(6).max(20),
  address: z.string().min(5).max(300),
  city: z.string().min(2).max(80).default("Casablanca"),
  zoneId: z.string().uuid(),
  codAmount: z.number().min(0).max(1_000_000).default(0),
  notes: z.string().max(500).optional()
});

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(SHIPMENT_STATUSES as [string, ...string[]]).optional(),
  merchantId: z.string().uuid().optional(),
  zoneId: z.string().uuid().optional(),
  courierId: z.string().uuid().optional(),
  search: z.string().trim().min(2).max(120).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional()
});

const transitionSchema = z.object({
  status: z.enum(SHIPMENT_STATUSES as [string, ...string[]]),
  note: z.string().max(500).optional(),
  outcome: z.enum(DELIVERY_OUTCOMES as [string, ...string[]]).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional()
});

const podSchema = z.object({
  type: z.enum(["PHOTO", "SIGNATURE", "OTP"]),
  signatureRef: z.string().min(3).max(300).optional(),
  photoRef: z.string().min(3).max(300).optional(),
  otpCode: z.string().regex(/^\d{4,8}$/, "OTP must be 4 to 8 digits").optional(),
  note: z.string().max(300).optional()
});

export async function shipmentRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateRequest);

  app.get("/api/v1/shipments", { preHandler: requirePermission("shipment:read") }, async (request) => {
    const query = listQuerySchema.parse(request.query);
    const where: Record<string, unknown> = {};

    if (query.status) where.status = query.status;
    if (query.merchantId) where.merchantId = query.merchantId;
    if (query.zoneId) where.zoneId = query.zoneId;
    if (query.courierId) where.courierId = query.courierId;
    if (query.from || query.to) {
      where.createdAt = {
        ...(query.from ? { gte: query.from } : {}),
        ...(query.to ? { lte: query.to } : {})
      };
    }
    if (query.search) {
      where.OR = [
        { trackingNumber: { contains: query.search, mode: "insensitive" } },
        { recipientName: { contains: query.search, mode: "insensitive" } },
        { recipientPhone: { contains: query.search } }
      ];
    }

    const auth = request.auth!;
    if (auth.user.role === "MERCHANT") {
      if (!auth.user.merchantId) return { items: [], page: query.page, pageSize: query.pageSize, total: 0 };
      where.merchantId = auth.user.merchantId;
    }
    if (auth.user.role === "COURIER") {
      where.courierId = auth.user.id;
    }

    const [items, total] = await Promise.all([
      prisma.shipment.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { merchant: { select: { id: true, businessName: true } }, zone: { select: { id: true, name: true } } }
      }),
      prisma.shipment.count({ where })
    ]);

    return { items, page: query.page, pageSize: query.pageSize, total };
  });

  app.get("/api/v1/shipments/summary", { preHandler: requirePermission("shipment:read") }, async (request) => {
    const auth = request.auth!;
    const scope: Record<string, unknown> = {};
    if (auth.user.role === "MERCHANT") {
      if (!auth.user.merchantId) return { total: 0, byStatus: {}, codTotal: 0 };
      scope.merchantId = auth.user.merchantId;
    }
    if (auth.user.role === "COURIER") scope.courierId = auth.user.id;

    const grouped = await prisma.shipment.groupBy({
      by: ["status"],
      where: scope,
      _count: { _all: true },
      _sum: { codAmount: true }
    });

    const byStatus: Record<string, number> = {};
    let codTotal = 0;
    for (const row of grouped) {
      byStatus[row.status] = row._count._all;
      codTotal += Number(row._sum.codAmount ?? 0);
    }
    const total = grouped.reduce((sum, row) => sum + row._count._all, 0);
    return { total, byStatus, codTotal };
  });

  app.get("/api/v1/shipments/:id", { preHandler: requirePermission("shipment:read") }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const shipment = await prisma.shipment.findUnique({
      where: { id },
      include: {
        merchant: { select: { id: true, businessName: true } },
        zone: { select: { id: true, name: true, city: true } },
        courier: { select: { id: true, fullName: true, phone: true } },
        codCollection: {
          select: { id: true, status: true, amount: true, reference: true, collectedAt: true }
        },
        proofOfDelivery: {
          select: { id: true, type: true, createdAt: true, collectedById: true }
        },
        events: { orderBy: { createdAt: "desc" }, include: { actor: { select: { id: true, fullName: true } } } }
      }
    });
    if (!shipment) return reply.code(404).send({ error: "NOT_FOUND", message: "Shipment not found" });

    const auth = request.auth!;
    if (auth.user.role === "MERCHANT" && shipment.merchantId !== auth.user.merchantId) {
      return reply.code(403).send({ error: "FORBIDDEN", message: "Shipment belongs to another merchant" });
    }
    if (auth.user.role === "COURIER" && shipment.courierId !== auth.user.id) {
      return reply.code(403).send({ error: "FORBIDDEN", message: "Shipment is not assigned to you" });
    }
    return shipment;
  });

  app.post("/api/v1/shipments", { preHandler: requirePermission("shipment:write") }, async (request, reply) => {
    const body = createSchema.parse(request.body);
    const auth = request.auth!;

    if (auth.user.role === "MERCHANT") {
      if (!auth.user.merchantId || auth.user.merchantId !== body.merchantId) {
        throw badRequest("Merchants may only create shipments for their own account");
      }
    }

    const zone = await prisma.zone.findUnique({ where: { id: body.zoneId } });
    if (!zone) throw badRequest("Unknown delivery zone");
    if (!zone.isActive) throw badRequest("Delivery zone is inactive");

    const merchant = await prisma.merchant.findUnique({ where: { id: body.merchantId } });
    if (!merchant) throw badRequest("Unknown merchant");

    const trackingNumber = await generateUniqueTrackingNumber();

    const shipment = await prisma.$transaction(async (tx) => {
      const created = await tx.shipment.create({
        data: {
          trackingNumber,
          merchantId: body.merchantId,
          recipientName: body.recipientName,
          recipientPhone: body.recipientPhone,
          address: body.address,
          city: body.city,
          zoneId: body.zoneId,
          codAmount: body.codAmount,
          deliveryFee: zone.deliveryFee,
          returnFee: zone.returnFee,
          notes: body.notes ?? null,
          events: {
            create: {
              toStatus: "CREATED",
              actorId: auth.user.id,
              note: "Shipment created"
            }
          }
        }
      });
      await tx.auditLog.create({
        data: { actorId: auth.user.id, action: "SHIPMENT_CREATED", entity: "Shipment", entityId: created.id }
      });
      return created;
    });

    return reply.code(201).send(shipment);
  });

  app.patch("/api/v1/shipments/:id/status", { preHandler: requirePermission("shipment:transition") }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = transitionSchema.parse(request.body);
    const auth = request.auth!;

    const existing = await prisma.shipment.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: "NOT_FOUND", message: "Shipment not found" });
    if (auth.user.role === "COURIER" && existing.courierId !== auth.user.id) {
      return reply.code(403).send({ error: "FORBIDDEN", message: "Shipment is not assigned to you" });
    }
    assertTransition(existing.status, body.status as never);
    if (body.outcome) {
      assertOutcomeMatchesStatus(body.status as never, body.outcome as never);
    }

    const updated = await prisma.$transaction(async (tx) => {
      // Claim the transition conditionally: only the request that still sees the
      // status it read outside the transaction may apply it. A concurrent
      // transition (or an approve/cancel race) leaves count at 0 and loses.
      const claim = await tx.shipment.updateMany({
        where: { id, status: existing.status },
        data: {
          status: body.status as never,
          ...(body.outcome ? { deliveryOutcome: body.outcome as never } : {}),
          ...(body.status === "DELIVERY_FAILED"
            ? { deliveryAttemptCount: { increment: 1 } }
            : {})
        }
      });

      if (claim.count !== 1) {
        throw conflict("Shipment status changed concurrently, reload and retry");
      }

      await tx.shipmentEvent.create({
        data: {
          shipmentId: id,
          actorId: auth.user.id,
          fromStatus: existing.status,
          toStatus: body.status as never,
          note: body.note ?? (body.outcome ? `Outcome: ${body.outcome}` : null),
          latitude: body.latitude ?? null,
          longitude: body.longitude ?? null
        }
      });
      await tx.auditLog.create({
        data: {
          actorId: auth.user.id,
          action: "SHIPMENT_STATUS_CHANGED",
          entity: "Shipment",
          entityId: id,
          metadata: { from: existing.status, to: body.status }
        }
      });
      return tx.shipment.findUniqueOrThrow({ where: { id } });
    });

    return updated;
  });

  /**
   * Records a proof of delivery. The reference required depends on the type,
   * and the shipment must be assigned to the acting courier.
   */
  app.post("/api/v1/shipments/:id/proof-of-delivery", { preHandler: requirePermission("shipment:transition") }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = podSchema.parse(request.body);
    const auth = request.auth!;

    const existing = await prisma.shipment.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: "NOT_FOUND", message: "Shipment not found" });
    if (auth.user.role === "COURIER" && existing.courierId !== auth.user.id) {
      return reply.code(403).send({ error: "FORBIDDEN", message: "Shipment is not assigned to you" });
    }
    if (!["OUT_FOR_DELIVERY", "DELIVERED"].includes(existing.status)) {
      throw badRequest("Proof of delivery can only be recorded during or after delivery");
    }

    if (body.type === "PHOTO" && !body.photoRef) {
      throw badRequest("photoRef is required for a PHOTO proof of delivery");
    }
    if (body.type === "SIGNATURE" && !body.signatureRef) {
      throw badRequest("signatureRef is required for a SIGNATURE proof of delivery");
    }
    if (body.type === "OTP" && !body.otpCode) {
      throw badRequest("otpCode is required for an OTP proof of delivery");
    }

    // Reject stored-XSS/URL-scheme payloads before they reach the database.
    assertSafePodReference(body.photoRef, "photoRef");
    assertSafePodReference(body.signatureRef, "signatureRef");

    // `ProofOfDelivery.shipmentId` is unique. Check first so a retried upload
    // gets a clean 409, and keep the P2002 catch for the concurrent window.
    const existingPod = await prisma.proofOfDelivery.findUnique({ where: { shipmentId: id } });
    if (existingPod) {
      throw conflict("A proof of delivery is already recorded for this shipment");
    }

    let pod;
    try {
      pod = await prisma.$transaction(async (tx) => {
        const created = await tx.proofOfDelivery.create({
          data: {
            shipmentId: id,
            type: body.type as never,
            signatureRef: body.signatureRef ?? null,
            photoRef: body.photoRef ?? null,
            otpCode: body.otpCode ?? null,
            collectedById: auth.user.id,
            note: body.note ?? null
          },
          include: { collectedBy: { select: { id: true, fullName: true } } }
        });

        await tx.shipmentEvent.create({
          data: {
            shipmentId: id,
            actorId: auth.user.id,
            fromStatus: existing.status,
            toStatus: existing.status,
            note: `Proof of delivery recorded (${body.type})`
          }
        });

        await tx.auditLog.create({
          data: {
            actorId: auth.user.id,
            action: "POD_RECORDED",
            entity: "ProofOfDelivery",
            entityId: created.id,
            metadata: { shipmentId: id, type: body.type }
          }
        });

        return created;
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw conflict("A proof of delivery is already recorded for this shipment");
      }
      throw error;
    }

    return reply.code(201).send(pod);
  });

  /**
   * Public tracking — anyone can look up a shipment by tracking number.
   * No authentication required; the response is the same as for authenticated users,
   * but without merchant/courier scope restrictions.
   */
  app.get("/api/v1/track/:trackingNumber", async (request, reply) => {
    const { trackingNumber } = request.params as { trackingNumber: string };
    const shipment = await prisma.shipment.findUnique({
      where: { trackingNumber },
      include: {
        merchant: { select: { id: true, businessName: true } },
        zone: { select: { id: true, name: true, city: true } },
        courier: { select: { id: true, fullName: true, phone: true } },
        codCollection: {
          select: { id: true, status: true, amount: true, reference: true, collectedAt: true }
        },
        proofOfDelivery: {
          select: { id: true, type: true, createdAt: true, collectedById: true }
        }
      }
    });
    if (!shipment) return reply.code(404).send({ error: "NOT_FOUND", message: "Shipment not found" });
    return shipment;
  });

  /**
   * Missions of the authenticated courier. Recipient details are only returned
   * for shipments actually assigned to that courier.
   */
  app.get("/api/v1/courier/missions", { preHandler: requirePermission("shipment:read") }, async (request) => {
    const auth = request.auth!;
    if (auth.user.role !== "COURIER") {
      throw badRequest("Only a courier account can list its missions");
    }

    const query = z
      .object({
        status: z.enum(SHIPMENT_STATUSES as [string, ...string[]]).optional(),
        activeOnly: z.enum(["true", "false"]).default("true")
      })
      .parse(request.query);

    const where: Record<string, unknown> = { courierId: auth.user.id };
    if (query.status) where.status = query.status;
    if (query.activeOnly === "true") {
      where.status = {
        in: ["PICKUP_ASSIGNED", "PICKED_UP", "AT_DEPOT", "OUT_FOR_DELIVERY", "DELIVERY_FAILED"]
      };
    }

    const items = await prisma.shipment.findMany({
      where,
      orderBy: { createdAt: "asc" },
      include: {
        merchant: { select: { id: true, businessName: true } },
        zone: { select: { id: true, name: true, city: true } },
        codCollection: { select: { id: true, status: true, amount: true, reference: true, collectedAt: true } },
        proofOfDelivery: { select: { id: true, type: true, createdAt: true } }
      }
    });

    const totals = items.reduce(
      (accumulator, shipment) => {
        accumulator.cod += Number(shipment.codAmount ?? 0);
        accumulator.fees += Number(shipment.deliveryFee ?? 0);
        return accumulator;
      },
      { cod: 0, fees: 0 }
    );

    return {
      items,
      total: items.length,
      totals: { codTotal: totals.cod.toFixed(2), deliveryFeesTotal: totals.fees.toFixed(2) }
    };
  });
}

async function generateUniqueTrackingNumber(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = generateTrackingNumber(() => randomInt(0, 1_000_000) / 1_000_000);
    const existing = await prisma.shipment.findUnique({ where: { trackingNumber: candidate } });
    if (!existing) return candidate;
  }
  throw badRequest("Unable to generate a unique tracking number, retry");
}
