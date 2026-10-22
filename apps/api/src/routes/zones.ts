import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authenticateRequest, requirePermission } from "../plugins/auth.js";

const zoneSchema = z.object({
  name: z.string().min(2).max(80),
  city: z.string().min(2).max(80).default("Casablanca"),
  deliveryFee: z.number().min(0).max(10_000),
  returnFee: z.number().min(0).max(10_000).default(5),
  isActive: z.boolean().default(true)
});

const tariffSchema = z.object({
  label: z.string().min(2).max(80),
  price: z.number().min(0).max(10_000),
  returnFee: z.number().min(0).max(10_000).default(5),
  isDefault: z.boolean().default(false)
});

export async function zoneRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateRequest);

  app.get("/api/v1/zones", { preHandler: requirePermission("zone:read") }, async () => {
    const items = await prisma.zone.findMany({
      orderBy: [{ city: "asc" }, { name: "asc" }],
      include: { tariffs: { orderBy: { validFrom: "desc" } } }
    });
    return { items, total: items.length };
  });

  app.post("/api/v1/zones", { preHandler: requirePermission("zone:write") }, async (request, reply) => {
    const body = zoneSchema.parse(request.body);
    const zone = await prisma.zone.create({ data: body });
    await prisma.auditLog.create({
      data: { actorId: request.auth!.user.id, action: "ZONE_CREATED", entity: "Zone", entityId: zone.id }
    });
    return reply.code(201).send(zone);
  });

  app.patch("/api/v1/zones/:id", { preHandler: requirePermission("zone:write") }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = zoneSchema.partial().parse(request.body);
    const existing = await prisma.zone.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: "NOT_FOUND", message: "Zone not found" });
    const zone = await prisma.zone.update({ where: { id }, data: body });
    await prisma.auditLog.create({
      data: { actorId: request.auth!.user.id, action: "ZONE_UPDATED", entity: "Zone", entityId: id }
    });
    return zone;
  });

  app.post("/api/v1/zones/:id/tariffs", { preHandler: requirePermission("tariff:write") }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = tariffSchema.parse(request.body);
    const zone = await prisma.zone.findUnique({ where: { id } });
    if (!zone) return reply.code(404).send({ error: "NOT_FOUND", message: "Zone not found" });

    const tariff = await prisma.$transaction(async (tx) => {
      if (body.isDefault) {
        await tx.zoneTariff.updateMany({
          where: { zoneId: id, isDefault: true, validTo: null },
          data: { validTo: new Date() }
        });
      }
      return tx.zoneTariff.create({
        data: {
          zoneId: id,
          label: body.label,
          price: body.price,
          returnFee: body.returnFee,
          isDefault: body.isDefault
        }
      });
    });

    await prisma.auditLog.create({
      data: { actorId: request.auth!.user.id, action: "TARIFF_CREATED", entity: "ZoneTariff", entityId: tariff.id }
    });
    return reply.code(201).send(tariff);
  });
}
