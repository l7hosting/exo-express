import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../app.js";
import { prisma } from "../lib/prisma.js";
import { hashPassword } from "../lib/password.js";

const runIntegration = Boolean(process.env.DATABASE_URL);

const describeIntegration = runIntegration ? describe : describe.skip;

describeIntegration("API integration (real PostgreSQL)", () => {
  let app: FastifyInstance;
  let adminToken: string;
  let courierToken: string;
  let merchantId: string;
  let zoneId: string;
  let courierId: string;

  beforeAll(async () => {
    app = await buildServer();

    const zone = await prisma.zone.findFirst({ where: { name: "Casablanca" } });
    if (!zone) throw new Error("Seed data missing: run prisma db seed first");
    zoneId = zone.id;

    const merchant = await prisma.merchant.create({
      data: { businessName: "Marchand Test", contactName: "Contact Test", phone: "+212600000001" }
    });
    merchantId = merchant.id;

    const passwordHash = await hashPassword("TestPassword123");
    const admin = await prisma.user.create({
      data: { email: "admin@test.exo", fullName: "Admin Test", role: "SUPER_ADMIN", passwordHash }
    });
    const courier = await prisma.user.create({
      data: { email: "courier@test.exo", fullName: "Courier Test", role: "COURIER", passwordHash }
    });
    courierId = courier.id;

    await prisma.merchantUser.create({ data: { merchantId, userId: courier.id } });

    const adminLogin = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "admin@test.exo", password: "TestPassword123" }
    });
    adminToken = adminLogin.json().token;

    const courierLogin = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "courier@test.exo", password: "TestPassword123" }
    });
    courierToken = courierLogin.json().token;
  }, 60_000);

  afterAll(async () => {
    if (!app) return;
    await app.close();
    await prisma.shipment.deleteMany({ where: { merchantId } });
    await prisma.auditLog.deleteMany({ where: { actor: { email: { in: ["admin@test.exo", "courier@test.exo"] } } } });
    await prisma.session.deleteMany({ where: { user: { email: { in: ["admin@test.exo", "courier@test.exo"] } } } });
    await prisma.user.deleteMany({ where: { email: { in: ["admin@test.exo", "courier@test.exo"] } } });
    await prisma.merchantUser.deleteMany({ where: { merchantId } });
    await prisma.merchant.deleteMany({ where: { id: merchantId } });
    await prisma.$disconnect();
  });

  it("rejects unauthenticated access to shipments", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/shipments" });
    expect(response.statusCode).toBe(401);
    expect(response.json().error).toBe("UNAUTHORIZED");
  });

  it("rejects invalid credentials", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "admin@test.exo", password: "WrongPassword123" }
    });
    expect(response.statusCode).toBe(401);
  });

  it("never returns the password hash in the login response", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "admin@test.exo", password: "TestPassword123" }
    });
    expect(response.statusCode).toBe(200);
    expect(JSON.stringify(response.json())).not.toContain("passwordHash");
    expect(response.json().token).toBeTruthy();
  });

  it("creates a shipment with server-computed fees and a tracking number", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/shipments",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        merchantId,
        zoneId,
        recipientName: "Achmad Test",
        recipientPhone: "+212611111111",
        address: "12 Rue Test, Casablanca",
        city: "Casablanca",
        codAmount: 350
      }
    });

    expect(response.statusCode).toBe(201);
    const shipment = response.json();
    expect(shipment.trackingNumber).toMatch(/^EXO-[A-Z2-9]{10}$/);
    expect(Number(shipment.deliveryFee)).toBe(17);
    expect(Number(shipment.returnFee)).toBe(5);
  });

  it("records a CREATED event for a new shipment", async () => {
    const list = await app.inject({
      method: "GET",
      url: "/api/v1/shipments",
      headers: { authorization: `Bearer ${adminToken}` }
    });
    const items = list.json().items as { id: string }[];
    expect(items.length).toBeGreaterThan(0);

    const detail = await app.inject({
      method: "GET",
      url: `/api/v1/shipments/${items[0].id}`,
      headers: { authorization: `Bearer ${adminToken}` }
    });
    expect(detail.statusCode).toBe(200);
    const events = detail.json().events as { toStatus: string; actor: { fullName: string } }[];
    expect(events.some((event) => event.toStatus === "CREATED")).toBe(true);
    expect(events.some((event) => event.actor?.fullName === "Admin Test")).toBe(true);
  });

  it("rejects an invalid status transition", async () => {
    const list = await app.inject({
      method: "GET",
      url: "/api/v1/shipments",
      headers: { authorization: `Bearer ${adminToken}` }
    });
    const shipmentId = (list.json().items as { id: string }[])[0].id;

    const response = await app.inject({
      method: "PATCH",
      url: `/api/v1/shipments/${shipmentId}/status`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { status: "DELIVERED" }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("VALIDATION_ERROR");
  });

  it("accepts a valid status transition and writes the event", async () => {
    const list = await app.inject({
      method: "GET",
      url: "/api/v1/shipments",
      headers: { authorization: `Bearer ${adminToken}` }
    });
    const shipmentId = (list.json().items as { id: string }[])[0].id;

    const response = await app.inject({
      method: "PATCH",
      url: `/api/v1/shipments/${shipmentId}/status`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { status: "PICKUP_ASSIGNED", note: "Affectation test" }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe("PICKUP_ASSIGNED");

    const detail = await app.inject({
      method: "GET",
      url: `/api/v1/shipments/${shipmentId}`,
      headers: { authorization: `Bearer ${adminToken}` }
    });
    const events = detail.json().events as { toStatus: string; note: string | null }[];
    expect(events.some((event) => event.toStatus === "PICKUP_ASSIGNED" && event.note === "Affectation test")).toBe(true);
  });

  it("forbids a courier from creating shipments", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/shipments",
      headers: { authorization: `Bearer ${courierToken}` },
      payload: {
        merchantId,
        zoneId,
        recipientName: "Achmad Test",
        recipientPhone: "+212611111111",
        address: "12 Rue Test, Casablanca",
        city: "Casablanca",
        codAmount: 100
      }
    });
    expect(response.statusCode).toBe(403);
  });

  it("validates the shipment payload", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/shipments",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { merchantId, zoneId }
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("VALIDATION_ERROR");
  });

  it("filters shipments by status", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/shipments?status=PICKUP_ASSIGNED",
      headers: { authorization: `Bearer ${adminToken}` }
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.items.every((item: { status: string }) => item.status === "PICKUP_ASSIGNED")).toBe(true);
  });

  it("searches shipments by recipient name", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/shipments?search=Achmad",
      headers: { authorization: `Bearer ${adminToken}` }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().total).toBeGreaterThan(0);
  });

  it("paginates shipments", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/shipments?page=1&pageSize=1",
      headers: { authorization: `Bearer ${adminToken}` }
    });
    const body = response.json();
    expect(body.items.length).toBeLessThanOrEqual(1);
    expect(body.pageSize).toBe(1);
  });

  it("returns the shipment summary with real counts", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/shipments/summary",
      headers: { authorization: `Bearer ${adminToken}` }
    });
    expect(response.statusCode).toBe(200);
    const summary = response.json();
    expect(summary.total).toBeGreaterThan(0);
    expect(summary.codTotal).toBeGreaterThan(0);
  });

  it("rejects a shipment for an unknown zone", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/shipments",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        merchantId,
        zoneId: "00000000-0000-0000-0000-000000000000",
        recipientName: "Achmad Test",
        recipientPhone: "+212611111111",
        address: "12 Rue Test, Casablanca",
        city: "Casablanca",
        codAmount: 100
      }
    });
    expect(response.statusCode).toBe(400);
  });

  it("lists zones with their configured tariffs", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/zones",
      headers: { authorization: `Bearer ${adminToken}` }
    });
    expect(response.statusCode).toBe(200);
    const items = response.json().items as { name: string; deliveryFee: string | number }[];
    const casablanca = items.find((zone) => zone.name === "Casablanca");
    expect(casablanca).toBeTruthy();
    expect(Number(casablanca!.deliveryFee)).toBe(17);
  });

  it("lists merchants for an admin", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/merchants",
      headers: { authorization: `Bearer ${adminToken}` }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().total).toBeGreaterThan(0);
  });

  it("revokes the session on logout", async () => {
    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "admin@test.exo", password: "TestPassword123" }
    });
    const token = login.json().token;

    const logout = await app.inject({
      method: "POST",
      url: "/api/v1/auth/logout",
      headers: { authorization: `Bearer ${token}` }
    });
    expect(logout.statusCode).toBe(204);

    const afterLogout = await app.inject({
      method: "GET",
      url: "/api/v1/shipments",
      headers: { authorization: `Bearer ${token}` }
    });
    expect(afterLogout.statusCode).toBe(401);
  });

  it("exposes the authenticated profile with permissions", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: { authorization: `Bearer ${courierToken}` }
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.user.email).toBe("courier@test.exo");
    expect(body.permissions).toContain("shipment:read");
    expect(body.permissions).not.toContain("merchant:write");
    expect(JSON.stringify(body)).not.toContain("passwordHash");
  });

  it("keeps the courier restricted to its own shipments", async () => {
    const list = await app.inject({
      method: "GET",
      url: "/api/v1/shipments",
      headers: { authorization: `Bearer ${courierToken}` }
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().total).toBe(0);
  });

  it("returns the health endpoint", async () => {
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe("ok");
  });
});
