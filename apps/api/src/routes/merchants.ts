import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authenticateRequest, requirePermission } from "../plugins/auth.js";
import { badRequest, conflict, isUniqueConstraintError, notFound } from "../lib/errors.js";

const merchantSchema = z.object({
  businessName: z.string().min(2).max(120),
  contactName: z.string().min(2).max(120),
  phone: z.string().min(6).max(20),
  email: z.string().email().optional(),
  isActive: z.boolean().default(true)
});

export async function merchantRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateRequest);

  app.get("/api/v1/merchants", { preHandler: requirePermission("merchant:read") }, async (request) => {
    const query = z.object({ search: z.string().trim().min(2).max(120).optional() }).parse(request.query);
    const auth = request.auth!;

    const where: Record<string, unknown> = {};
    if (query.search) {
      where.OR = [
        { businessName: { contains: query.search, mode: "insensitive" } },
        { contactName: { contains: query.search, mode: "insensitive" } },
        { phone: { contains: query.search } }
      ];
    }
    if (auth.user.role === "MERCHANT") {
      if (!auth.user.merchantId) return { items: [], total: 0 };
      where.id = auth.user.merchantId;
    }

    const items = await prisma.merchant.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { shipments: true } } }
    });
    return { items, total: items.length };
  });

  app.get("/api/v1/merchants/:id", { preHandler: requirePermission("merchant:read") }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const merchant = await prisma.merchant.findUnique({
      where: { id },
      include: {
        users: { include: { user: { select: { id: true, fullName: true, email: true, role: true, isActive: true } } } },
        _count: { select: { shipments: true } }
      }
    });
    if (!merchant) return reply.code(404).send({ error: "NOT_FOUND", message: "Merchant not found" });
    const auth = request.auth!;
    if (auth.user.role === "MERCHANT" && auth.user.merchantId !== merchant.id) {
      return reply.code(403).send({ error: "FORBIDDEN", message: "Access denied" });
    }
    return merchant;
  });

  app.post("/api/v1/merchants", { preHandler: requirePermission("merchant:write") }, async (request, reply) => {
    const body = merchantSchema.parse(request.body);
    const merchant = await prisma.merchant.create({ data: body });
    await prisma.auditLog.create({
      data: {
        actorId: request.auth!.user.id,
        action: "MERCHANT_CREATED",
        entity: "Merchant",
        entityId: merchant.id
      }
    });
    return reply.code(201).send(merchant);
  });

  app.patch("/api/v1/merchants/:id", { preHandler: requirePermission("merchant:write") }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = merchantSchema.partial().parse(request.body);
    const existing = await prisma.merchant.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: "NOT_FOUND", message: "Merchant not found" });
    const merchant = await prisma.merchant.update({ where: { id }, data: body });
    await prisma.auditLog.create({
      data: {
        actorId: request.auth!.user.id,
        action: "MERCHANT_UPDATED",
        entity: "Merchant",
        entityId: id
      }
    });
    return merchant;
  });

  app.post("/api/v1/merchants/:id/users", { preHandler: requirePermission("merchant:write") }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = z.object({ userId: z.string().uuid() }).parse(request.body);
    const merchant = await prisma.merchant.findUnique({ where: { id } });
    if (!merchant) throw badRequest("Merchant not found");

    const user = await prisma.user.findUnique({ where: { id: body.userId } });
    if (!user) throw notFound("User not found");
    if (user.role !== "MERCHANT") {
      throw badRequest("Only a user with the MERCHANT role can be linked to a merchant");
    }

    // `authenticate()` reads `merchantUsers[0]`, so a user linked to more than
    // one merchant would get an arbitrary scope. Reject that explicitly.
    const existingLink = await prisma.merchantUser.findFirst({ where: { userId: body.userId } });
    if (existingLink) {
      throw conflict("This user is already linked to a merchant");
    }

    let link;
    try {
      link = await prisma.merchantUser.create({ data: { merchantId: id, userId: body.userId } });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw conflict("This user is already linked to a merchant");
      }
      throw error;
    }

    await prisma.auditLog.create({
      data: {
        actorId: request.auth!.user.id,
        action: "MERCHANT_USER_ADDED",
        entity: "MerchantUser",
        entityId: link.id
      }
    });
    return reply.code(201).send(link);
  });
}
