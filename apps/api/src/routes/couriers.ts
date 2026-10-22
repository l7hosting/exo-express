import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authenticateRequest, requirePermission } from "../plugins/auth.js";
import { badRequest } from "../lib/errors.js";
import { hashPassword, passwordSchema } from "../lib/password.js";

/**
 * Statuses that count as an open workload for a courier.
 */
export const ACTIVE_SHIPMENT_STATUSES = [
  "PICKUP_ASSIGNED",
  "PICKED_UP",
  "AT_DEPOT",
  "OUT_FOR_DELIVERY",
  "DELIVERY_FAILED",
  "RETURN_REQUESTED",
  "RETURNING"
] as const;

const courierListQuery = z.object({
  search: z.string().trim().min(2).max(120).optional(),
  isActive: z.enum(["true", "false"]).optional()
});

const createCourierSchema = z.object({
  email: z.string().email(),
  password: passwordSchema,
  fullName: z.string().min(2).max(120),
  phone: z.string().min(6).max(20).optional()
});

const statusSchema = z.object({
  isActive: z.boolean(),
  reason: z.string().max(300).optional()
});

export async function courierRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateRequest);

  /**
   * Lists couriers with their current workload.
   * The workload is computed from live shipment rows, never from a stored counter.
   */
  app.get("/api/v1/couriers", { preHandler: requirePermission("courier:read") }, async (request) => {
    const query = courierListQuery.parse(request.query);

    const where: Record<string, unknown> = { role: "COURIER" };
    if (query.isActive) where.isActive = query.isActive === "true";
    if (query.search) {
      where.OR = [
        { fullName: { contains: query.search, mode: "insensitive" } },
        { email: { contains: query.search, mode: "insensitive" } },
        { phone: { contains: query.search } }
      ];
    }

    const couriers = await prisma.user.findMany({
      where,
      orderBy: { fullName: "asc" },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        isActive: true,
        createdAt: true,
        _count: {
          select: {
            shipmentsAsCourier: { where: { status: { in: [...ACTIVE_SHIPMENT_STATUSES] } } },
            codCollections: true
          }
        }
      }
    });

    const items = couriers.map((courier) => ({
      id: courier.id,
      fullName: courier.fullName,
      email: courier.email,
      phone: courier.phone,
      isActive: courier.isActive,
      createdAt: courier.createdAt,
      activeShipments: courier._count.shipmentsAsCourier,
      collectedCodEntries: courier._count.codCollections
    }));

    return { items, total: items.length };
  });

  app.get("/api/v1/couriers/:id", { preHandler: requirePermission("courier:read") }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const courier = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        isActive: true,
        role: true,
        createdAt: true,
        shipmentsAsCourier: {
          orderBy: { createdAt: "desc" },
          take: 50,
          select: {
            id: true,
            trackingNumber: true,
            recipientName: true,
            city: true,
            status: true,
            codAmount: true,
            deliveryFee: true,
            createdAt: true
          }
        },
        assignmentsOwned: {
          orderBy: { assignedAt: "desc" },
          take: 50,
          select: {
            id: true,
            shipmentId: true,
            status: true,
            assignedAt: true,
            endedAt: true,
            note: true,
            assignedBy: { select: { id: true, fullName: true } }
          }
        }
      }
    });

    if (!courier || courier.role !== "COURIER") {
      return reply.code(404).send({ error: "NOT_FOUND", message: "Courier not found" });
    }

    const activeShipments = courier.shipmentsAsCourier.filter((shipment) =>
      (ACTIVE_SHIPMENT_STATUSES as readonly string[]).includes(shipment.status)
    ).length;

    return {
      ...courier,
      activeShipments,
      totalShipments: courier.shipmentsAsCourier.length
    };
  });

  /**
   * Creates a courier account. The password is hashed server-side and never
   * returned or logged.
   */
  app.post("/api/v1/couriers", { preHandler: requirePermission("courier:manage") }, async (request, reply) => {
    const body = createCourierSchema.parse(request.body);
    const actor = request.auth!.user;

    const existing = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });
    if (existing) {
      return reply
        .code(409)
        .send({ error: "CONFLICT", message: "A user with this email already exists" });
    }

    const courier = await prisma.user.create({
      data: {
        email: body.email.toLowerCase(),
        passwordHash: await hashPassword(body.password),
        fullName: body.fullName,
        phone: body.phone ?? null,
        role: "COURIER"
      },
      select: { id: true, email: true, fullName: true, phone: true, role: true, isActive: true, createdAt: true }
    });

    await prisma.auditLog.create({
      data: {
        actorId: actor.id,
        action: "COURIER_CREATED",
        entity: "User",
        entityId: courier.id,
        metadata: { email: courier.email }
      }
    });

    return reply.code(201).send(courier);
  });

  /**
   * Activates or deactivates a courier.
   * Deactivating a courier revokes their open sessions so no token survives.
   */
  app.patch("/api/v1/couriers/:id/status", { preHandler: requirePermission("courier:manage") }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = statusSchema.parse(request.body);
    const actor = request.auth!.user;

    const courier = await prisma.user.findUnique({ where: { id } });
    if (!courier || courier.role !== "COURIER") {
      return reply.code(404).send({ error: "NOT_FOUND", message: "Courier not found" });
    }
    if (courier.id === actor.id) {
      throw badRequest("You cannot change the status of your own account");
    }

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.user.update({
        where: { id },
        data: { isActive: body.isActive },
        select: { id: true, fullName: true, email: true, isActive: true }
      });

      if (!body.isActive) {
        await tx.session.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() }
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: body.isActive ? "COURIER_ACTIVATED" : "COURIER_DEACTIVATED",
          entity: "User",
          entityId: id,
          metadata: { reason: body.reason ?? null }
        }
      });

      return result;
    });

    return updated;
  });
}
