import { randomBytes } from "node:crypto";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import type { ShipmentStatus } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildServer } from "../app.js";
import { prisma } from "../lib/prisma.js";
import { hashPassword } from "../lib/password.js";
import { createSession, revokeSession } from "../lib/auth.js";
import { config } from "../lib/config.js";
import { registerGlobalRateLimit } from "../lib/rate-limit.js";

const runIntegration = Boolean(process.env.DATABASE_URL);
const describeIntegration = runIntegration ? describe : describe.skip;

const PASSWORD = "SecurityPassword123";

describeIntegration("Security and integrity regressions (real PostgreSQL)", () => {
  let app: FastifyInstance;

  let adminToken: string;
  let merchantAToken: string;
  let merchantBToken: string;
  let courierAToken: string;

  let merchantAUserId: string;
  let merchantBUserId: string;
  let courierAId: string;
  let courierBId: string;

  let merchantAId: string;
  let merchantBId: string;
  let zoneId: string;

  let merchantBShipmentId: string;
  let courierBShipmentId: string;
  let courierBCodShipmentId: string;
  let concurrentStatusShipmentId: string;
  let concurrentReverseShipmentId: string;
  let podShipmentId: string;
  let unsafePodShipmentId: string;

  let collectionAId: string;
  let collectionBId: string;
  let reverseCollectionId: string;
  let concurrentSettlementShipmentId: string;

  let settlementAId: string;
  let settlementBId: string;
  let settlementAReference: string;
  let settlementBReference: string;
  let concurrentApproveSettlementId: string;

  const merchantAIdList: string[] = [];

  const businessNameA = "=Security Merchant A";
  const businessNameB = "Security Merchant B";

  function trackingNumber(): string {
    return `EXO-${randomBytes(5).toString("hex").toUpperCase()}`;
  }

  function reference(prefix: string): string {
    return `${prefix}-SEC-${randomBytes(4).toString("hex").toUpperCase()}`;
  }

  async function createUser(email: string, fullName: string, role: "SUPER_ADMIN" | "MERCHANT" | "COURIER") {
    return prisma.user.create({
      data: { email, fullName, role, passwordHash: await hashPassword(PASSWORD) }
    });
  }

  async function login(email: string): Promise<string> {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email, password: PASSWORD }
    });
    expect(response.statusCode).toBe(200);
    return response.json().token as string;
  }

  async function createShipment(options: {
    merchantId: string;
    status?: ShipmentStatus;
    courierId?: string | null;
    codAmount?: number;
    paymentStatus?: "PENDING" | "COLLECTED";
  }) {
    return prisma.shipment.create({
      data: {
        trackingNumber: trackingNumber(),
        merchantId: options.merchantId,
        recipientName: "Security Recipient",
        recipientPhone: "+212600009999",
        address: "1 Rue Security, Casablanca",
        city: "Casablanca",
        zoneId,
        status: options.status ?? "CREATED",
        codAmount: options.codAmount ?? 0,
        deliveryFee: 17,
        returnFee: 5,
        courierId: options.courierId ?? null,
        paymentStatus: options.paymentStatus ?? "PENDING"
      }
    });
  }

  beforeAll(async () => {
    app = await buildServer();

    const zone = await prisma.zone.findFirst({ where: { name: "Casablanca" } });
    if (!zone) throw new Error("Seed data missing: run prisma db seed first");
    zoneId = zone.id;

    const [admin, merchantAUser, merchantBUser, courierA, courierB] = await Promise.all([
      createUser("security.admin@exo.test", "Security Admin", "SUPER_ADMIN"),
      createUser("security.merchant.a@exo.test", "Security Merchant A User", "MERCHANT"),
      createUser("security.merchant.b@exo.test", "Security Merchant B User", "MERCHANT"),
      createUser("security.courier.a@exo.test", "Security Courier A", "COURIER"),
      createUser("security.courier.b@exo.test", "Security Courier B", "COURIER")
    ]);

    merchantAUserId = merchantAUser.id;
    merchantBUserId = merchantBUser.id;
    courierAId = courierA.id;
    courierBId = courierB.id;

    const [merchantA, merchantB] = await Promise.all([
      prisma.merchant.create({
        data: { businessName: businessNameA, contactName: "Security Contact A", phone: "+212522900001" }
      }),
      prisma.merchant.create({
        data: { businessName: businessNameB, contactName: "Security Contact B", phone: "+212522900002" }
      })
    ]);

    merchantAId = merchantA.id;
    merchantBId = merchantB.id;
    merchantAIdList.push(merchantAId, merchantBId);

    await Promise.all([
      prisma.merchantUser.create({ data: { merchantId: merchantAId, userId: merchantAUserId } }),
      prisma.merchantUser.create({ data: { merchantId: merchantBId, userId: merchantBUserId } })
    ]);

    [adminToken, merchantAToken, merchantBToken, courierAToken] = await Promise.all([
      login("security.admin@exo.test"),
      login("security.merchant.a@exo.test"),
      login("security.merchant.b@exo.test"),
      login("security.courier.a@exo.test")
    ]);
    await login("security.courier.b@exo.test");

    const [
      merchantAShipment,
      merchantBShipment,
      courierAShipment,
      courierBShipment,
      courierACodShipment,
      courierBCodShipment,
      concurrentStatusShipment,
      concurrentReverseShipment,
      podShipment,
      unsafePodShipment
    ] = await Promise.all([
      createShipment({ merchantId: merchantAId }),
      createShipment({ merchantId: merchantBId }),
      createShipment({ merchantId: merchantAId, status: "PICKUP_ASSIGNED", courierId: courierA.id }),
      createShipment({ merchantId: merchantBId, status: "PICKUP_ASSIGNED", courierId: courierB.id }),
      createShipment({
        merchantId: merchantAId,
        status: "DELIVERED",
        courierId: courierA.id,
        codAmount: 120,
        paymentStatus: "COLLECTED"
      }),
      createShipment({
        merchantId: merchantBId,
        status: "DELIVERED",
        courierId: courierB.id,
        codAmount: 130,
        paymentStatus: "COLLECTED"
      }),
      createShipment({ merchantId: merchantAId, status: "CREATED" }),
      createShipment({
        merchantId: merchantAId,
        status: "DELIVERED",
        courierId: courierA.id,
        codAmount: 75,
        paymentStatus: "COLLECTED"
      }),
      createShipment({ merchantId: merchantAId, status: "OUT_FOR_DELIVERY", courierId: courierA.id }),
      createShipment({ merchantId: merchantAId, status: "OUT_FOR_DELIVERY", courierId: courierA.id })
    ]);

    merchantBShipmentId = merchantBShipment.id;
    courierBShipmentId = courierBShipment.id;
    concurrentStatusShipmentId = concurrentStatusShipment.id;
    concurrentReverseShipmentId = concurrentReverseShipment.id;
    podShipmentId = podShipment.id;
    unsafePodShipmentId = unsafePodShipment.id;
    courierBCodShipmentId = courierBCodShipment.id;

    const [collectionA, collectionB, reverseCollection] = await Promise.all([
      prisma.codCollection.create({
        data: {
          shipmentId: courierACodShipment.id,
          courierId: courierA.id,
          amount: 120,
          reference: reference("COD-A"),
          status: "COLLECTED"
        }
      }),
      prisma.codCollection.create({
        data: {
          shipmentId: courierBCodShipment.id,
          courierId: courierB.id,
          amount: 130,
          reference: reference("COD-B"),
          status: "COLLECTED"
        }
      }),
      prisma.codCollection.create({
        data: {
          shipmentId: concurrentReverseShipment.id,
          courierId: courierA.id,
          amount: 75,
          reference: reference("COD-R"),
          status: "COLLECTED"
        }
      })
    ]);

    collectionAId = collectionA.id;
    collectionBId = collectionB.id;
    reverseCollectionId = reverseCollection.id;

    // Delivered and collected but not settled yet, used to exercise concurrent
    // settlement creation.
    const concurrentSettlementShipment = await createShipment({
      merchantId: merchantAId,
      status: "DELIVERED",
      courierId: courierA.id,
      codAmount: 60,
      paymentStatus: "COLLECTED"
    });
    concurrentSettlementShipmentId = concurrentSettlementShipment.id;
    await prisma.codCollection.create({
      data: {
        shipmentId: concurrentSettlementShipment.id,
        courierId: courierA.id,
        amount: 60,
        reference: reference("COD-SET"),
        status: "COLLECTED"
      }
    });

    const [settlementA, settlementB, concurrentApproveSettlement] = await Promise.all([
      prisma.merchantSettlement.create({
        data: {
          merchantId: merchantAId,
          periodStart: new Date(Date.now() - 24 * 60 * 60 * 1000),
          periodEnd: new Date(),
          grossCod: 120,
          deliveryFees: 17,
          returnFees: 0,
          adjustments: 0,
          netPayable: 103,
          status: "PENDING",
          reference: reference("SET-A"),
          items: {
            create: [
              {
                shipmentId: courierACodShipment.id,
                codAmount: 120,
                deliveryFee: 17,
                returnFee: 0
              }
            ]
          }
        }
      }),
      prisma.merchantSettlement.create({
        data: {
          merchantId: merchantBId,
          periodStart: new Date(Date.now() - 24 * 60 * 60 * 1000),
          periodEnd: new Date(),
          grossCod: 130,
          deliveryFees: 17,
          returnFees: 0,
          adjustments: 0,
          netPayable: 113,
          status: "PENDING",
          reference: reference("SET-B"),
          items: {
            create: [
              {
                shipmentId: courierBCodShipment.id,
                codAmount: 130,
                deliveryFee: 17,
                returnFee: 0
              }
            ]
          }
        }
      }),
      prisma.merchantSettlement.create({
        data: {
          merchantId: merchantAId,
          periodStart: new Date(Date.now() - 24 * 60 * 60 * 1000),
          periodEnd: new Date(),
          grossCod: 0,
          deliveryFees: 0,
          returnFees: 0,
          adjustments: 0,
          netPayable: 0,
          status: "PENDING",
          reference: reference("SET-APPROVE")
        }
      })
    ]);

    settlementAId = settlementA.id;
    settlementBId = settlementB.id;
    settlementAReference = settlementA.reference;
    settlementBReference = settlementB.reference;
    concurrentApproveSettlementId = concurrentApproveSettlement.id;
  }, 60_000);

  afterAll(async () => {
    if (!app) return;
    await app.close();

    const merchantIds = merchantAIdList;
    if (merchantIds.length === 0) {
      await prisma.$disconnect();
      return;
    }

    await prisma.shipmentEvent.deleteMany({ where: { shipment: { merchantId: { in: merchantIds } } } });
    await prisma.auditLog.deleteMany({ where: { actor: { email: { contains: "security" } } } });
    await prisma.codTransaction.deleteMany({
      where: { collection: { shipment: { merchantId: { in: merchantIds } } } }
    });
    await prisma.codCollection.deleteMany({ where: { shipment: { merchantId: { in: merchantIds } } } });
    await prisma.settlementItem.deleteMany({ where: { settlement: { merchantId: { in: merchantIds } } } });
    await prisma.merchantSettlement.deleteMany({ where: { merchantId: { in: merchantIds } } });
    await prisma.shipmentAssignment.deleteMany({ where: { shipment: { merchantId: { in: merchantIds } } } });
    await prisma.proofOfDelivery.deleteMany({ where: { shipment: { merchantId: { in: merchantIds } } } });
    await prisma.shipment.deleteMany({ where: { merchantId: { in: merchantIds } } });
    await prisma.session.deleteMany({ where: { user: { email: { contains: "security" } } } });
    await prisma.merchantUser.deleteMany({ where: { merchantId: { in: merchantIds } } });
    await prisma.user.deleteMany({ where: { email: { contains: "security" } } });
    await prisma.merchant.deleteMany({ where: { id: { in: merchantIds } } });
    await prisma.$disconnect();
  });

  /* ------------------------------------------------------------------ */
  /* Authentication and sessions                                         */
  /* ------------------------------------------------------------------ */

  it("rejects unauthenticated access", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/shipments" });
    expect(response.statusCode).toBe(401);
    expect(response.json().error).toBe("UNAUTHORIZED");
  });

  it("rejects an expired session", async () => {
    const { session, token } = await createSession(courierAId);
    await prisma.session.update({
      where: { id: session.id },
      data: { expiresAt: new Date(Date.now() - 60_000) }
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: { authorization: `Bearer ${token}` }
    });
    expect(response.statusCode).toBe(401);
  });

  it("rejects a revoked session", async () => {
    const { session, token } = await createSession(courierAId);
    await revokeSession(session.id);

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: { authorization: `Bearer ${token}` }
    });
    expect(response.statusCode).toBe(401);
  });

  /* ------------------------------------------------------------------ */
  /* Merchant isolation                                                  */
  /* ------------------------------------------------------------------ */

  it("scopes shipment detail and listing to the merchant", async () => {
    const forbidden = await app.inject({
      method: "GET",
      url: `/api/v1/shipments/${merchantBShipmentId}`,
      headers: { authorization: `Bearer ${merchantAToken}` }
    });
    expect(forbidden.statusCode).toBe(403);

    const list = await app.inject({
      method: "GET",
      url: "/api/v1/shipments?pageSize=100",
      headers: { authorization: `Bearer ${merchantAToken}` }
    });
    expect(list.statusCode).toBe(200);
    const items = list.json().items as { id: string; merchantId: string }[];
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((item) => item.merchantId === merchantAId)).toBe(true);
    expect(items.some((item) => item.id === merchantBShipmentId)).toBe(false);
  });

  it("scopes settlements to the merchant", async () => {
    const list = await app.inject({
      method: "GET",
      url: "/api/v1/settlements?pageSize=100",
      headers: { authorization: `Bearer ${merchantAToken}` }
    });
    expect(list.statusCode).toBe(200);
    const items = list.json().items as { id: string; merchantId: string }[];
    expect(items.some((item) => item.id === settlementAId)).toBe(true);
    expect(items.some((item) => item.id === settlementBId)).toBe(false);
    expect(items.every((item) => item.merchantId === merchantAId)).toBe(true);

    const forbidden = await app.inject({
      method: "GET",
      url: `/api/v1/settlements/${settlementBId}`,
      headers: { authorization: `Bearer ${merchantAToken}` }
    });
    expect(forbidden.statusCode).toBe(403);
  });

  it("exports only the merchant's settlements with formula-safe CSV cells", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/settlements/report.csv",
      headers: { authorization: `Bearer ${merchantAToken}` }
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/csv");
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body).toContain(settlementAReference);
    expect(response.body).not.toContain(settlementBReference);
    expect(response.body).not.toContain(businessNameB);
    // A spreadsheet formula in the merchant name must be neutralised with a
    // leading apostrophe, not exported verbatim.
    expect(response.body).toContain(`"'${businessNameA}"`);
  });

  /* ------------------------------------------------------------------ */
  /* Courier isolation                                                   */
  /* ------------------------------------------------------------------ */

  it("scopes missions, shipment detail and COD to the courier", async () => {
    const missions = await app.inject({
      method: "GET",
      url: "/api/v1/courier/missions?activeOnly=false",
      headers: { authorization: `Bearer ${courierAToken}` }
    });
    expect(missions.statusCode).toBe(200);
    const missionItems = missions.json().items as { id: string; courierId: string }[];
    expect(missionItems.length).toBeGreaterThan(0);
    expect(missionItems.every((item) => item.courierId === courierAId)).toBe(true);
    expect(missionItems.some((item) => item.id === courierBShipmentId)).toBe(false);

    const forbiddenShipment = await app.inject({
      method: "GET",
      url: `/api/v1/shipments/${courierBCodShipmentId}`,
      headers: { authorization: `Bearer ${courierAToken}` }
    });
    expect(forbiddenShipment.statusCode).toBe(403);

    const cod = await app.inject({
      method: "GET",
      url: "/api/v1/cod?pageSize=100",
      headers: { authorization: `Bearer ${courierAToken}` }
    });
    expect(cod.statusCode).toBe(200);
    const codItems = cod.json().items as { id: string; courierId: string }[];
    expect(codItems.length).toBeGreaterThan(0);
    expect(codItems.every((item) => item.courierId === courierAId)).toBe(true);
    expect(codItems.some((item) => item.id === collectionAId)).toBe(true);
    expect(codItems.some((item) => item.id === collectionBId)).toBe(false);
  });

  it("forbids a courier from reading global COD reconciliation", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/cod/reconciliation",
      headers: { authorization: `Bearer ${courierAToken}` }
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error).toBe("FORBIDDEN");
  });

  it("forbids a courier from reversing another courier's collection", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/cod/${collectionBId}/reverse`,
      headers: { authorization: `Bearer ${courierAToken}` },
      payload: { reason: "security cross-courier attempt" }
    });
    expect(response.statusCode).toBe(403);
  });

  /* ------------------------------------------------------------------ */
  /* Concurrency                                                         */
  /* ------------------------------------------------------------------ */

  it("applies only one of two concurrent shipment transitions", async () => {
    // Hold a row lock so both requests read the same original status before
    // either transaction can apply its conditional update.
    const lock = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Shipment" WHERE id = ${concurrentStatusShipmentId} FOR UPDATE`;
      await new Promise((resolve) => setTimeout(resolve, 750));
    });

    const [, first, second] = await Promise.all([
      lock,
      app.inject({
        method: "PATCH",
        url: `/api/v1/shipments/${concurrentStatusShipmentId}/status`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { status: "PICKUP_ASSIGNED" }
      }),
      app.inject({
        method: "PATCH",
        url: `/api/v1/shipments/${concurrentStatusShipmentId}/status`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { status: "CANCELLED" }
      })
    ]);

    const results = [first, second];
    expect(results.filter((result) => result.statusCode === 200)).toHaveLength(1);
    const conflicts = results.filter((result) => result.statusCode === 409);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].json().message).toContain("concurrently");

    const events = await prisma.shipmentEvent.count({
      where: { shipmentId: concurrentStatusShipmentId }
    });
    expect(events).toBe(1);
  });

  it("reverses a COD collection only once under concurrent requests", async () => {
    const [first, second] = await Promise.all([
      app.inject({
        method: "POST",
        url: `/api/v1/cod/${reverseCollectionId}/reverse`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { reason: "security concurrent reversal" }
      }),
      app.inject({
        method: "POST",
        url: `/api/v1/cod/${reverseCollectionId}/reverse`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { reason: "security concurrent reversal" }
      })
    ]);

    const results = [first, second];
    expect(results.filter((result) => result.statusCode === 200)).toHaveLength(1);
    expect(results.filter((result) => result.statusCode === 409)).toHaveLength(1);

    const reversals = await prisma.codTransaction.count({
      where: { collectionId: reverseCollectionId, type: "REVERSAL" }
    });
    expect(reversals).toBe(1);
  });

  it("approves a settlement only once under concurrent requests", async () => {
    const [first, second] = await Promise.all([
      app.inject({
        method: "POST",
        url: `/api/v1/settlements/${concurrentApproveSettlementId}/approve`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {}
      }),
      app.inject({
        method: "POST",
        url: `/api/v1/settlements/${concurrentApproveSettlementId}/approve`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {}
      })
    ]);

    const results = [first, second];
    expect(results.filter((result) => result.statusCode === 200)).toHaveLength(1);
    expect(results.filter((result) => result.statusCode === 409)).toHaveLength(1);

    const audits = await prisma.auditLog.count({
      where: { action: "SETTLEMENT_APPROVED", entityId: concurrentApproveSettlementId }
    });
    expect(audits).toBe(1);
  });

  it("creates a settlement only once under concurrent requests", async () => {
    const payload = {
      merchantId: merchantAId,
      shipmentIds: [concurrentSettlementShipmentId]
    };

    const [first, second] = await Promise.all([
      app.inject({
        method: "POST",
        url: "/api/v1/settlements",
        headers: { authorization: `Bearer ${adminToken}` },
        payload
      }),
      app.inject({
        method: "POST",
        url: "/api/v1/settlements",
        headers: { authorization: `Bearer ${adminToken}` },
        payload
      })
    ]);

    const results = [first, second];
    expect(results.filter((result) => result.statusCode === 201)).toHaveLength(1);
    expect(results.filter((result) => result.statusCode === 409)).toHaveLength(1);

    const items = await prisma.settlementItem.count({
      where: { shipmentId: concurrentSettlementShipmentId }
    });
    expect(items).toBe(1);
  });

  /* ------------------------------------------------------------------ */
  /* Proof of delivery                                                   */
  /* ------------------------------------------------------------------ */

  it("rejects a duplicate proof of delivery and unsafe references", async () => {
    const first = await app.inject({
      method: "POST",
      url: `/api/v1/shipments/${podShipmentId}/proof-of-delivery`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { type: "PHOTO", photoRef: "uploads/pod/security.jpg" }
    });
    expect(first.statusCode).toBe(201);

    const duplicate = await app.inject({
      method: "POST",
      url: `/api/v1/shipments/${podShipmentId}/proof-of-delivery`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { type: "PHOTO", photoRef: "uploads/pod/security-retry.jpg" }
    });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json().error).toBe("CONFLICT");

    const unsafe = await app.inject({
      method: "POST",
      url: `/api/v1/shipments/${unsafePodShipmentId}/proof-of-delivery`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { type: "PHOTO", photoRef: "javascript:alert(1)" }
    });
    expect(unsafe.statusCode).toBe(400);

    const unsafeLeadingWhitespace = await app.inject({
      method: "POST",
      url: `/api/v1/shipments/${unsafePodShipmentId}/proof-of-delivery`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { type: "SIGNATURE", signatureRef: "   JaVaScRiPt:alert(1)" }
    });
    expect(unsafeLeadingWhitespace.statusCode).toBe(400);
  });

  /* ------------------------------------------------------------------ */
  /* Rate limiting and health                                            */
  /* ------------------------------------------------------------------ */

  it("rate limits requests with a Retry-After header", async () => {
    const limited = Fastify();
    registerGlobalRateLimit(limited, { enabled: true, max: 2, windowMs: 60_000 });
    limited.get("/limited", async () => ({ ok: true }));

    try {
      await limited.ready();
      const first = await limited.inject({ method: "GET", url: "/limited" });
      const second = await limited.inject({ method: "GET", url: "/limited" });
      const third = await limited.inject({ method: "GET", url: "/limited" });

      expect([first.statusCode, second.statusCode, third.statusCode]).toEqual([200, 200, 429]);
      expect(third.headers["retry-after"]).toBeTruthy();
    } finally {
      await limited.close();
    }
  });

  it("throttles repeated failed logins before touching the account", async () => {
    const email = "security.throttle@exo.test";
    const remoteAddress = "198.51.100.77";
    const max = config.rateLimit.loginAccountMax;

    for (let attempt = 0; attempt < max; attempt += 1) {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        remoteAddress,
        payload: { email, password: "WrongPassword123" }
      });
      expect(response.statusCode).toBe(401);
    }

    const blocked = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      remoteAddress,
      payload: { email, password: "WrongPassword123" }
    });
    expect(blocked.statusCode).toBe(429);
    expect(blocked.headers["retry-after"]).toBeTruthy();
    expect(blocked.json().error).toBe("RATE_LIMITED");
  }, 30_000);

  it("serves health and database readiness", async () => {
    const health = await app.inject({ method: "GET", url: "/health" });
    expect(health.statusCode).toBe(200);
    expect(health.json().status).toBe("ok");

    const ready = await app.inject({ method: "GET", url: "/health/ready" });
    expect(ready.statusCode).toBe(200);
    expect(ready.json().checks.database).toBe("up");
  });

  /* ------------------------------------------------------------------ */
  /* Merchant user linking                                               */
  /* ------------------------------------------------------------------ */

  it("validates merchant user linking", async () => {
    const nonMerchant = await app.inject({
      method: "POST",
      url: `/api/v1/merchants/${merchantAId}/users`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { userId: courierAId }
    });
    expect(nonMerchant.statusCode).toBe(400);

    const extra = await createUser(
      "security.merchant.extra@exo.test",
      "Security Extra Merchant",
      "MERCHANT"
    );

    const first = await app.inject({
      method: "POST",
      url: `/api/v1/merchants/${merchantBId}/users`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { userId: extra.id }
    });
    expect(first.statusCode).toBe(201);

    const duplicate = await app.inject({
      method: "POST",
      url: `/api/v1/merchants/${merchantAId}/users`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { userId: extra.id }
    });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json().error).toBe("CONFLICT");
  });

  /* ------------------------------------------------------------------ */
  /* Secret leakage                                                      */
  /* ------------------------------------------------------------------ */

  it("never exposes courier password hashes", async () => {
    const list = await app.inject({
      method: "GET",
      url: "/api/v1/couriers",
      headers: { authorization: `Bearer ${adminToken}` }
    });
    expect(list.statusCode).toBe(200);
    expect(JSON.stringify(list.json())).not.toContain("passwordHash");

    const detail = await app.inject({
      method: "GET",
      url: `/api/v1/couriers/${courierAId}`,
      headers: { authorization: `Bearer ${adminToken}` }
    });
    expect(detail.statusCode).toBe(200);
    expect(JSON.stringify(detail.json())).not.toContain("passwordHash");
  });
});
