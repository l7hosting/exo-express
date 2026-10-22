import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authenticateRequest, requirePermission } from "../plugins/auth.js";
import { conflict, notFound } from "../lib/errors.js";
import {
  assertAssignable,
  assertCourierCapacity,
  assertCourierEligible,
  assertNotAlreadyAssigned,
  assertSameCourier,
  ASSIGNED_STATUS,
  MAX_ACTIVE_SHIPMENTS_PER_COURIER
} from "../lib/assignments.js";

const assignSchema = z.object({
  courierId: z.string().uuid(),
  shipmentIds: z.array(z.string().uuid()).min(1).max(50),
  note: z.string().max(300).optional()
});

const reassignSchema = z.object({
  courierId: z.string().uuid(),
  reason: z.string().max(300).optional()
});

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  courierId: z.string().uuid().optional(),
  shipmentId: z.string().uuid().optional(),
  status: z.enum(["ACTIVE", "REASSIGNED", "UNASSIGNED"]).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional()
});

async function countActiveShipments(courierId: string): Promise<number> {
  return prisma.shipment.count({
    where: {
      courierId,
      status: {
        in: ["PICKUP_ASSIGNED", "PICKED_UP", "AT_DEPOT", "OUT_FOR_DELIVERY", "DELIVERY_FAILED", "RETURN_REQUESTED", "RETURNING"]
      }
    }
  });
}

export async function assignmentRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateRequest);

  /**
   * Assignment history with filters on courier, shipment, status and date.
   */
  app.get("/api/v1/assignments", { preHandler: requirePermission("assignment:read") }, async (request) => {
    const query = listQuerySchema.parse(request.query);

    const where: Record<string, unknown> = {};
    if (query.courierId) where.courierId = query.courierId;
    if (query.shipmentId) where.shipmentId = query.shipmentId;
    if (query.status) where.status = query.status;
    if (query.from || query.to) {
      where.assignedAt = {
        ...(query.from ? { gte: query.from } : {}),
        ...(query.to ? { lte: query.to } : {})
      };
    }

    const [items, total] = await Promise.all([
      prisma.shipmentAssignment.findMany({
        where,
        orderBy: { assignedAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          courier: { select: { id: true, fullName: true, phone: true } },
          assignedBy: { select: { id: true, fullName: true, role: true } },
          shipment: {
            select: {
              id: true,
              trackingNumber: true,
              recipientName: true,
              city: true,
              status: true,
              zoneId: true,
              createdAt: true
            }
          }
        }
      }),
      prisma.shipmentAssignment.count({ where })
    ]);

    return { items, page: query.page, pageSize: query.pageSize, total };
  });

  /**
   * Assigns one or several shipments to a courier in a single transaction.
   * Every shipment gets its own assignment record so the history stays auditable.
   */
  app.post("/api/v1/assignments", { preHandler: requirePermission("assignment:write") }, async (request, reply) => {
    const body = assignSchema.parse(request.body);
    const actor = request.auth!.user;

    const courier = await prisma.user.findUnique({ where: { id: body.courierId } });
    if (!courier) throw notFound("Courier not found");
    assertCourierEligible(courier);

    const shipments = await prisma.shipment.findMany({
      where: { id: { in: body.shipmentIds } },
      select: { id: true, status: true, courierId: true, trackingNumber: true }
    });

    if (shipments.length !== body.shipmentIds.length) {
      throw notFound("One or more shipments do not exist");
    }

    for (const shipment of shipments) {
      // Order matters: an already assigned shipment is a conflict, not a
      // request for an invalid transition.
      assertNotAlreadyAssigned(shipment);
      assertAssignable(shipment);
    }

    const activeCount = await countActiveShipments(courier.id);
    assertCourierCapacity(activeCount + shipments.length);

    const results = await prisma.$transaction(async (tx) => {
      const created: string[] = [];

      for (const shipment of shipments) {
        // Conditional update: the row is only claimed when it is still unassigned.
        // This makes concurrent assignments of the same shipment safe.
        const claimed = await tx.shipment.updateMany({
          where: { id: shipment.id, courierId: null, status: "CREATED" },
          data: { courierId: courier.id, status: ASSIGNED_STATUS }
        });

        if (claimed.count !== 1) {
          throw conflict(`Shipment ${shipment.trackingNumber} was assigned concurrently`);
        }

        const assignment = await tx.shipmentAssignment.create({
          data: {
            shipmentId: shipment.id,
            courierId: courier.id,
            assignedById: actor.id,
            status: "ACTIVE",
            note: body.note ?? null
          }
        });

        await tx.shipmentEvent.create({
          data: {
            shipmentId: shipment.id,
            actorId: actor.id,
            fromStatus: shipment.status,
            toStatus: ASSIGNED_STATUS,
            note: `Assigned to ${courier.fullName}`
          }
        });

        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            action: "SHIPMENT_ASSIGNED",
            entity: "Shipment",
            entityId: shipment.id,
            metadata: { courierId: courier.id, assignmentId: assignment.id }
          }
        });

        created.push(assignment.id);
      }

      return created;
    });

    return reply.code(201).send({ assignmentIds: results, courierId: courier.id, count: results.length });
  });

  /**
   * Reassigns an active assignment to another courier.
   */
  app.post("/api/v1/assignments/:id/reassign", { preHandler: requirePermission("assignment:write") }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = reassignSchema.parse(request.body);
    const actor = request.auth!.user;

    const assignment = await prisma.shipmentAssignment.findUnique({
      where: { id },
      include: { shipment: { select: { id: true, status: true, courierId: true, trackingNumber: true } } }
    });
    if (!assignment) throw notFound("Assignment not found");
    if (assignment.status !== "ACTIVE") {
      throw conflict(`Assignment is ${assignment.status} and can no longer be changed`);
    }

    const courier = await prisma.user.findUnique({ where: { id: body.courierId } });
    if (!courier) throw notFound("Courier not found");
    assertCourierEligible(courier);
    assertSameCourier(assignment.courierId, courier.id);

    const activeCount = await countActiveShipments(courier.id);
    assertCourierCapacity(activeCount + 1);

    const result = await prisma.$transaction(async (tx) => {
      const claim = await tx.shipmentAssignment.updateMany({
        where: { id, status: "ACTIVE" },
        data: { status: "REASSIGNED", endedAt: new Date() }
      });

      if (claim.count !== 1) {
        throw conflict("Assignment changed concurrently; reload and retry");
      }

      const next = await tx.shipmentAssignment.create({
        data: {
          shipmentId: assignment.shipmentId,
          courierId: courier.id,
          assignedById: actor.id,
          status: "ACTIVE",
          note: body.reason ?? null
        }
      });

      const moved = await tx.shipment.updateMany({
        where: { id: assignment.shipmentId, courierId: assignment.courierId },
        data: { courierId: courier.id }
      });
      if (moved.count !== 1) {
        throw conflict("Shipment assignment changed concurrently, retry the reassignment");
      }

      await tx.shipmentEvent.create({
        data: {
          shipmentId: assignment.shipmentId,
          actorId: actor.id,
          fromStatus: assignment.shipment.status,
          toStatus: assignment.shipment.status,
          note: `Reassigned to ${courier.fullName}${body.reason ? ` — ${body.reason}` : ""}`
        }
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "SHIPMENT_REASSIGNED",
          entity: "Shipment",
          entityId: assignment.shipmentId,
          metadata: {
            previousCourierId: assignment.courierId,
            newCourierId: courier.id,
            assignmentId: next.id
          }
        }
      });

      return next;
    });

    return reply.code(201).send(result);
  });

  /**
   * Removes an active assignment and puts the shipment back in the pool.
   */
  app.delete("/api/v1/assignments/:id", { preHandler: requirePermission("assignment:write") }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const actor = request.auth!.user;

    const assignment = await prisma.shipmentAssignment.findUnique({
      where: { id },
      include: { shipment: { select: { id: true, status: true, courierId: true } } }
    });
    if (!assignment) throw notFound("Assignment not found");
    if (assignment.status !== "ACTIVE") {
      throw conflict(`Assignment is already ${assignment.status}`);
    }

    await prisma.$transaction(async (tx) => {
      await tx.shipmentAssignment.update({
        where: { id },
        data: { status: "UNASSIGNED", endedAt: new Date() }
      });

      const released = await tx.shipment.updateMany({
        where: { id: assignment.shipmentId, courierId: assignment.courierId },
        data: {
          courierId: null,
          ...(assignment.shipment.status === "PICKUP_ASSIGNED" ? { status: "CREATED" } : {})
        }
      });
      if (released.count !== 1) {
        throw conflict("Shipment assignment changed concurrently, retry the removal");
      }

      await tx.shipmentEvent.create({
        data: {
          shipmentId: assignment.shipmentId,
          actorId: actor.id,
          fromStatus: assignment.shipment.status,
          toStatus: assignment.shipment.status === "PICKUP_ASSIGNED" ? "CREATED" : assignment.shipment.status,
          note: "Assignment removed"
        }
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "SHIPMENT_UNASSIGNED",
          entity: "Shipment",
          entityId: assignment.shipmentId,
          metadata: { previousCourierId: assignment.courierId }
        }
      });
    });

    return reply.code(204).send();
  });

  /**
   * Eligible shipments for assignment: not yet assigned and in an assignable status.
   */
  app.get("/api/v1/assignments/eligible-shipments", { preHandler: requirePermission("assignment:read") }, async (request) => {
    const query = z
      .object({
        zoneId: z.string().uuid().optional(),
        status: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(50)
      })
      .parse(request.query);

    const where: Record<string, unknown> = {
      courierId: null,
      status: "CREATED"
    };
    if (query.zoneId) where.zoneId = query.zoneId;
    if (query.status) where.status = query.status;

    const items = await prisma.shipment.findMany({
      where,
      orderBy: { createdAt: "asc" },
      take: query.limit,
      select: {
        id: true,
        trackingNumber: true,
        recipientName: true,
        city: true,
        status: true,
        codAmount: true,
        deliveryFee: true,
        createdAt: true,
        zone: { select: { id: true, name: true } },
        merchant: { select: { id: true, businessName: true } }
      }
    });

    return { items, total: items.length, maxPerCourier: MAX_ACTIVE_SHIPMENTS_PER_COURIER };
  });
}
