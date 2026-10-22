import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../app.js";
import { prisma } from "../lib/prisma.js";
import { hashPassword } from "../lib/password.js";

const runIntegration = Boolean(process.env.DATABASE_URL);
const describeIntegration = runIntegration ? describe : describe.skip;

const PASSWORD = "Phase2TestPassword123";

describeIntegration("Phase 2 — courier operations and finance", () => {
  let app: FastifyInstance;

  let adminToken: string;
  let dispatcherToken: string;
  let courierToken: string;
  let otherCourierToken: string;
  let tempCourierToken: string;
  let accountantToken: string;
  let merchantToken: string;

  let courierId: string;
  let otherCourierId: string;
  let tempCourierId: string;
  let merchantId: string;
  let zoneId: string;
  let shipmentIds: string[] = [];

  async function login(email: string): Promise<string> {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email, password: PASSWORD }
    });
    expect(response.statusCode).toBe(200);
    return response.json().token as string;
  }

  async function createShipment(options: { codAmount?: number } = {}) {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/shipments",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        merchantId,
        zoneId,
        recipientName: "Yassine El Amrani",
        recipientPhone: "+212661234567",
        address: "88 Avenue Hassan II, Casablanca",
        city: "Casablanca",
        codAmount: options.codAmount ?? 750
      }
    });
    expect(response.statusCode).toBe(201);
    return response.json() as { id: string; trackingNumber: string };
  }

  beforeAll(async () => {
    app = await buildServer();

    const zone = await prisma.zone.findFirst({ where: { name: "Casablanca" } });
    if (!zone) throw new Error("Seed data missing: run prisma db seed first");
    zoneId = zone.id;

    const merchant = await prisma.merchant.create({
      data: { businessName: "Phase2 Marchand", contactName: "Hicham", phone: "+212522000111" }
    });
    merchantId = merchant.id;

    const passwordHash = await hashPassword(PASSWORD);
    const emails = [
      "phase2.admin@exo.test",
      "phase2.dispatcher@exo.test",
      "phase2.courier@exo.test",
      "phase2.courier2@exo.test",
      "phase2.accountant@exo.test",
      "phase2.merchant@exo.test",
      "phase2.courier3@exo.test"
    ];

    const [admin, dispatcher, courier, otherCourier, accountant, merchantUser, tempCourier] =
      await Promise.all([
        prisma.user.create({
          data: { email: emails[0], fullName: "Admin Phase2", role: "SUPER_ADMIN", passwordHash }
        }),
        prisma.user.create({
          data: { email: emails[1], fullName: "Dispatcher Phase2", role: "DISPATCHER", passwordHash }
        }),
        prisma.user.create({
          data: { email: emails[2], fullName: "Courier Phase2", role: "COURIER", passwordHash }
        }),
        prisma.user.create({
          data: { email: emails[3], fullName: "Courier Deux", role: "COURIER", passwordHash }
        }),
        prisma.user.create({
          data: { email: emails[4], fullName: "Accountant Phase2", role: "ACCOUNTANT", passwordHash }
        }),
        prisma.user.create({
          data: { email: emails[5], fullName: "Merchant Phase2", role: "MERCHANT", passwordHash }
        }),
        prisma.user.create({
          data: { email: emails[6], fullName: "Courier Trois", role: "COURIER", passwordHash }
        })
      ]);

    courierId = courier.id;
    otherCourierId = otherCourier.id;
    tempCourierId = tempCourier.id;

    await prisma.merchantUser.create({ data: { merchantId, userId: merchantUser.id } });

    adminToken = await login(emails[0]);
    dispatcherToken = await login(emails[1]);
    courierToken = await login(emails[2]);
    otherCourierToken = await login(emails[3]);
    accountantToken = await login(emails[4]);
    merchantToken = await login(emails[5]);
    tempCourierToken = await login(emails[6]);

    void admin;
    void dispatcher;
  }, 60_000);

  afterAll(async () => {
    if (!app) return;
    await app.close();

    await prisma.shipmentEvent.deleteMany({ where: { shipment: { merchantId } } });
    await prisma.shipmentAssignment.deleteMany({ where: { shipment: { merchantId } } });
    await prisma.codTransaction.deleteMany({ where: { collection: { shipment: { merchantId } } } });
    await prisma.codCollection.deleteMany({ where: { shipment: { merchantId } } });
    await prisma.proofOfDelivery.deleteMany({ where: { shipment: { merchantId } } });
    await prisma.settlementItem.deleteMany({ where: { shipment: { merchantId } } });
    await prisma.merchantSettlement.deleteMany({ where: { merchantId } });
    await prisma.shipment.deleteMany({ where: { merchantId } });
    await prisma.auditLog.deleteMany({ where: { actor: { email: { contains: "phase2" } } } });
    await prisma.session.deleteMany({ where: { user: { email: { contains: "phase2" } } } });
    await prisma.merchantUser.deleteMany({ where: { merchantId } });
    await prisma.user.deleteMany({ where: { email: { contains: "phase2" } } });
    await prisma.merchant.deleteMany({ where: { id: merchantId } });
    await prisma.$disconnect();
  });

  /* ------------------------------------------------------------------ */
  /* Courier management                                                  */
  /* ------------------------------------------------------------------ */

  it("lists couriers with their live workload", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/couriers",
      headers: { authorization: `Bearer ${dispatcherToken}` }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    const courier = body.items.find((item: { id: string }) => item.id === courierId);
    expect(courier).toBeTruthy();
    expect(courier.fullName).toBe("Courier Phase2");
    expect(courier.activeShipments).toBe(0);
    expect(courier).not.toHaveProperty("passwordHash");
  });

  it("refuses courier management to a merchant", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/couriers",
      headers: { authorization: `Bearer ${merchantToken}` }
    });
    expect(response.statusCode).toBe(403);
  });

  it("creates a courier with a hashed password", async () => {
    const email = "phase2.created@exo.test";
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/couriers",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { email, password: "AnotherPassword123", fullName: "Nouveau Livreur", phone: "+212661000111" }
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.role).toBe("COURIER");
    expect(body.email).toBe(email);
    expect(JSON.stringify(body)).not.toContain("passwordHash");

    const stored = await prisma.user.findUnique({ where: { email } });
    expect(stored?.passwordHash).not.toContain("AnotherPassword123");
    expect(stored?.passwordHash.startsWith("scrypt$")).toBe(true);
  });

  /* ------------------------------------------------------------------ */
  /* Assignment                                                          */
  /* ------------------------------------------------------------------ */

  it("assigns a shipment and moves it to PICKUP_ASSIGNED", async () => {
    const shipment = await createShipment();
    shipmentIds.push(shipment.id);

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/assignments",
      headers: { authorization: `Bearer ${dispatcherToken}` },
      payload: { courierId, shipmentIds: [shipment.id], note: "Tourne du matin" }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().count).toBe(1);

    const updated = await app.inject({
      method: "GET",
      url: `/api/v1/shipments/${shipment.id}`,
      headers: { authorization: `Bearer ${adminToken}` }
    });

    const body = updated.json();
    expect(body.status).toBe("PICKUP_ASSIGNED");
    expect(body.courierId).toBe(courierId);
    expect(body.events.some((event: { note: string | null }) => event.note?.includes("Courier Phase2"))).toBe(true);
  });

  it("records the assignment with actor and timestamp", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/assignments?courierId=${courierId}`,
      headers: { authorization: `Bearer ${dispatcherToken}` }
    });

    expect(response.statusCode).toBe(200);
    const assignment = response.json().items[0];
    expect(assignment.status).toBe("ACTIVE");
    expect(assignment.assignedBy.fullName).toBe("Dispatcher Phase2");
    expect(assignment.assignedAt).toBeTruthy();
  });

  it("rejects a duplicate assignment of the same shipment", async () => {
    const shipment = await createShipment();
    shipmentIds.push(shipment.id);

    const first = await app.inject({
      method: "POST",
      url: "/api/v1/assignments",
      headers: { authorization: `Bearer ${dispatcherToken}` },
      payload: { courierId, shipmentIds: [shipment.id] }
    });
    expect(first.statusCode).toBe(201);

    const second = await app.inject({
      method: "POST",
      url: "/api/v1/assignments",
      headers: { authorization: `Bearer ${dispatcherToken}` },
      payload: { courierId: otherCourierId, shipmentIds: [shipment.id] }
    });
    expect(second.statusCode).toBe(409);
    expect(second.json().error).toBe("CONFLICT");
  });

  it("rejects an assignment to a deactivated courier", async () => {
    const deactivate = await app.inject({
      method: "PATCH",
      url: `/api/v1/couriers/${tempCourierId}/status`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { isActive: false, reason: "Congé" }
    });
    expect(deactivate.statusCode).toBe(200);
    expect(deactivate.json().isActive).toBe(false);

    const shipment = await createShipment();
    shipmentIds.push(shipment.id);

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/assignments",
      headers: { authorization: `Bearer ${dispatcherToken}` },
      payload: { courierId: tempCourierId, shipmentIds: [shipment.id] }
    });
    expect(response.statusCode).toBe(400);
  });

  it("revokes the sessions of a deactivated courier", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: { authorization: `Bearer ${tempCourierToken}` }
    });
    expect(response.statusCode).toBe(401);
  });

  it("reactivates a courier and lets them sign in again", async () => {
    const reactivate = await app.inject({
      method: "PATCH",
      url: `/api/v1/couriers/${tempCourierId}/status`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { isActive: true, reason: "Retour de congé" }
    });
    expect(reactivate.statusCode).toBe(200);

    const fresh = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "phase2.courier3@exo.test", password: PASSWORD }
    });
    expect(fresh.statusCode).toBe(200);
  });

  it("rejects an assignment made by a merchant", async () => {
    const shipment = await createShipment();
    shipmentIds.push(shipment.id);

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/assignments",
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: { courierId, shipmentIds: [shipment.id] }
    });
    expect(response.statusCode).toBe(403);
  });

  it("rejects a bulk assignment that mixes existing and new shipments", async () => {
    const already = await createShipment();
    const fresh = await createShipment();
    shipmentIds.push(already.id, fresh.id);

    const assign = await app.inject({
      method: "POST",
      url: "/api/v1/assignments",
      headers: { authorization: `Bearer ${dispatcherToken}` },
      payload: { courierId, shipmentIds: [already.id] }
    });
    expect(assign.statusCode).toBe(201);

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/assignments",
      headers: { authorization: `Bearer ${dispatcherToken}` },
      payload: { courierId: otherCourierId, shipmentIds: [already.id, fresh.id] }
    });
    expect(response.statusCode).toBe(409);

    const freshShipment = await prisma.shipment.findUnique({ where: { id: fresh.id } });
    expect(freshShipment?.courierId).toBeNull();
  });

  it("reassigns an active assignment to another courier", async () => {
    const shipment = await createShipment();
    shipmentIds.push(shipment.id);

    const assign = await app.inject({
      method: "POST",
      url: "/api/v1/assignments",
      headers: { authorization: `Bearer ${dispatcherToken}` },
      payload: { courierId, shipmentIds: [shipment.id] }
    });
    const assignmentId = assign.json().assignmentIds[0];

    const reassign = await app.inject({
      method: "POST",
      url: `/api/v1/assignments/${assignmentId}/reassign`,
      headers: { authorization: `Bearer ${dispatcherToken}` },
      payload: { courierId: otherCourierId, reason: "Réorganisation de tournée" }
    });
    expect(reassign.statusCode).toBe(201);
    expect(reassign.json().courierId).toBe(otherCourierId);

    const updated = await prisma.shipment.findUnique({ where: { id: shipment.id } });
    expect(updated?.courierId).toBe(otherCourierId);

    const history = await prisma.shipmentAssignment.findMany({
      where: { shipmentId: shipment.id },
      orderBy: { assignedAt: "asc" }
    });
    expect(history).toHaveLength(2);
    expect(history[0].status).toBe("REASSIGNED");
    expect(history[1].status).toBe("ACTIVE");
  });

  it("scopes a courier to its own shipments", async () => {
    const mine = await createShipment();
    const theirs = await createShipment();
    shipmentIds.push(mine.id, theirs.id);

    await app.inject({
      method: "POST",
      url: "/api/v1/assignments",
      headers: { authorization: `Bearer ${dispatcherToken}` },
      payload: { courierId, shipmentIds: [mine.id] }
    });

    const list = await app.inject({
      method: "GET",
      url: "/api/v1/shipments",
      headers: { authorization: `Bearer ${courierToken}` }
    });
    const ids = (list.json().items as { id: string }[]).map((item) => item.id);
    expect(ids).toContain(mine.id);
    expect(ids).not.toContain(theirs.id);

    const forbidden = await app.inject({
      method: "GET",
      url: `/api/v1/shipments/${theirs.id}`,
      headers: { authorization: `Bearer ${courierToken}` }
    });
    expect(forbidden.statusCode).toBe(403);
  });

  it("lists only the eligible shipments for assignment", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/assignments/eligible-shipments",
      headers: { authorization: `Bearer ${dispatcherToken}` }
    });

    expect(response.statusCode).toBe(200);
    const items = response.json().items as { id: string; status: string }[];
    expect(items.every((item) => item.status === "CREATED")).toBe(true);
  });

  /* ------------------------------------------------------------------ */
  /* Delivery flow and COD                                              */
  /* ------------------------------------------------------------------ */

  async function assignShipment(shipmentId: string, targetCourierId: string = courierId): Promise<void> {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/assignments",
      headers: { authorization: `Bearer ${dispatcherToken}` },
      payload: { courierId: targetCourierId, shipmentIds: [shipmentId] }
    });
    expect(response.statusCode).toBe(201);
  }

  async function deliverShipment(shipmentId: string): Promise<void> {
    for (const status of ["PICKED_UP", "AT_DEPOT", "OUT_FOR_DELIVERY"]) {
      const response = await app.inject({
        method: "PATCH",
        url: `/api/v1/shipments/${shipmentId}/status`,
        headers: { authorization: `Bearer ${courierToken}` },
        payload: { status }
      });
      expect(response.statusCode).toBe(200);
    }
  }

  async function markDelivered(shipmentId: string): Promise<void> {
    const response = await app.inject({
      method: "PATCH",
      url: `/api/v1/shipments/${shipmentId}/status`,
      headers: { authorization: `Bearer ${courierToken}` },
      payload: { status: "DELIVERED", outcome: "DELIVERED" }
    });
    expect(response.statusCode).toBe(200);
  }

  /** Creates a shipment that is delivered but whose COD is not collected yet. */
  async function deliveredShipment(codAmount: number): Promise<string> {
    const shipment = await createShipment({ codAmount });
    shipmentIds.push(shipment.id);
    await assignShipment(shipment.id);
    await deliverShipment(shipment.id);
    await markDelivered(shipment.id);
    return shipment.id;
  }

  /** Creates a delivered shipment whose COD has been collected. */
  async function settleableShipment(codAmount: number): Promise<string> {
    const shipmentId = await deliveredShipment(codAmount);
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/cod",
      headers: { authorization: `Bearer ${courierToken}` },
      payload: { shipmentId, amount: codAmount }
    });
    expect(response.statusCode).toBe(201);
    return shipmentId;
  }

  it("walks a shipment through the delivery flow", async () => {
    const shipment = await createShipment({ codAmount: 500 });
    shipmentIds.push(shipment.id);

    await app.inject({
      method: "POST",
      url: "/api/v1/assignments",
      headers: { authorization: `Bearer ${dispatcherToken}` },
      payload: { courierId, shipmentIds: [shipment.id] }
    });

    await deliverShipment(shipment.id);

    const delivered = await app.inject({
      method: "PATCH",
      url: `/api/v1/shipments/${shipment.id}/status`,
      headers: { authorization: `Bearer ${courierToken}` },
      payload: { status: "DELIVERED", outcome: "DELIVERED" }
    });
    expect(delivered.statusCode).toBe(200);
    expect(delivered.json().deliveryOutcome).toBe("DELIVERED");
  });

  it("rejects an invalid outcome for the status", async () => {
    const shipment = await createShipment();
    shipmentIds.push(shipment.id);

    await app.inject({
      method: "POST",
      url: "/api/v1/assignments",
      headers: { authorization: `Bearer ${dispatcherToken}` },
      payload: { courierId, shipmentIds: [shipment.id] }
    });
    await deliverShipment(shipment.id);

    const response = await app.inject({
      method: "PATCH",
      url: `/api/v1/shipments/${shipment.id}/status`,
      headers: { authorization: `Bearer ${courierToken}` },
      payload: { status: "DELIVERED", outcome: "REFUSED" }
    });
    expect(response.statusCode).toBe(400);
  });

  it("records a COD collection for a delivered shipment", async () => {
    const shipment = await createShipment({ codAmount: 899.5 });
    shipmentIds.push(shipment.id);

    await app.inject({
      method: "POST",
      url: "/api/v1/assignments",
      headers: { authorization: `Bearer ${dispatcherToken}` },
      payload: { courierId, shipmentIds: [shipment.id] }
    });
    await deliverShipment(shipment.id);

    await app.inject({
      method: "PATCH",
      url: `/api/v1/shipments/${shipment.id}/status`,
      headers: { authorization: `Bearer ${courierToken}` },
      payload: { status: "DELIVERED", outcome: "DELIVERED" }
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/cod",
      headers: { authorization: `Bearer ${courierToken}` },
      payload: { shipmentId: shipment.id, amount: 899.5, paymentMethod: "CASH" }
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(Number(body.amount)).toBe(899.5);
    expect(body.status).toBe("COLLECTED");
    expect(body.reference).toMatch(/^COD-/);

    const stored = await prisma.shipment.findUnique({ where: { id: shipment.id } });
    expect(stored?.paymentStatus).toBe("COLLECTED");
  });

  it("rejects a duplicate COD collection", async () => {
    const shipment = await createShipment({ codAmount: 300 });
    shipmentIds.push(shipment.id);

    await app.inject({
      method: "POST",
      url: "/api/v1/assignments",
      headers: { authorization: `Bearer ${dispatcherToken}` },
      payload: { courierId, shipmentIds: [shipment.id] }
    });
    await deliverShipment(shipment.id);
    await app.inject({
      method: "PATCH",
      url: `/api/v1/shipments/${shipment.id}/status`,
      headers: { authorization: `Bearer ${courierToken}` },
      payload: { status: "DELIVERED", outcome: "DELIVERED" }
    });

    const first = await app.inject({
      method: "POST",
      url: "/api/v1/cod",
      headers: { authorization: `Bearer ${courierToken}` },
      payload: { shipmentId: shipment.id, amount: 300 }
    });
    expect(first.statusCode).toBe(201);

    const second = await app.inject({
      method: "POST",
      url: "/api/v1/cod",
      headers: { authorization: `Bearer ${courierToken}` },
      payload: { shipmentId: shipment.id, amount: 300 }
    });
    expect(second.statusCode).toBe(409);
  });

  it("rejects a COD collection with a wrong amount", async () => {
    const shipment = await createShipment({ codAmount: 400 });
    shipmentIds.push(shipment.id);

    await app.inject({
      method: "POST",
      url: "/api/v1/assignments",
      headers: { authorization: `Bearer ${dispatcherToken}` },
      payload: { courierId, shipmentIds: [shipment.id] }
    });
    await deliverShipment(shipment.id);
    await app.inject({
      method: "PATCH",
      url: `/api/v1/shipments/${shipment.id}/status`,
      headers: { authorization: `Bearer ${courierToken}` },
      payload: { status: "DELIVERED", outcome: "DELIVERED" }
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/cod",
      headers: { authorization: `Bearer ${courierToken}` },
      payload: { shipmentId: shipment.id, amount: 10 }
    });
    expect(response.statusCode).toBe(400);
  });

  it("refuses a COD collection on a shipment that is not delivered", async () => {
    const shipment = await createShipment({ codAmount: 120 });
    shipmentIds.push(shipment.id);

    await app.inject({
      method: "POST",
      url: "/api/v1/assignments",
      headers: { authorization: `Bearer ${dispatcherToken}` },
      payload: { courierId, shipmentIds: [shipment.id] }
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/cod",
      headers: { authorization: `Bearer ${courierToken}` },
      payload: { shipmentId: shipment.id, amount: 120 }
    });
    expect(response.statusCode).toBe(400);
  });

  it("refuses a COD collection by a courier on somebody else's shipment", async () => {
    const shipment = await createShipment({ codAmount: 120 });
    shipmentIds.push(shipment.id);

    await app.inject({
      method: "POST",
      url: "/api/v1/assignments",
      headers: { authorization: `Bearer ${dispatcherToken}` },
      payload: { courierId, shipmentIds: [shipment.id] }
    });
    await deliverShipment(shipment.id);
    await app.inject({
      method: "PATCH",
      url: `/api/v1/shipments/${shipment.id}/status`,
      headers: { authorization: `Bearer ${courierToken}` },
      payload: { status: "DELIVERED", outcome: "DELIVERED" }
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/cod",
      headers: { authorization: `Bearer ${otherCourierToken}` },
      payload: { shipmentId: shipment.id, amount: 120 }
    });
    expect(response.statusCode).toBe(403);
  });

  it("reverses a collection and keeps the transaction history", async () => {
    const shipment = await createShipment({ codAmount: 250 });
    shipmentIds.push(shipment.id);

    await app.inject({
      method: "POST",
      url: "/api/v1/assignments",
      headers: { authorization: `Bearer ${dispatcherToken}` },
      payload: { courierId, shipmentIds: [shipment.id] }
    });
    await deliverShipment(shipment.id);
    await app.inject({
      method: "PATCH",
      url: `/api/v1/shipments/${shipment.id}/status`,
      headers: { authorization: `Bearer ${courierToken}` },
      payload: { status: "DELIVERED", outcome: "DELIVERED" }
    });

    const collection = await app.inject({
      method: "POST",
      url: "/api/v1/cod",
      headers: { authorization: `Bearer ${courierToken}` },
      payload: { shipmentId: shipment.id, amount: 250 }
    });
    const collectionId = collection.json().id;

    const reverse = await app.inject({
      method: "POST",
      url: `/api/v1/cod/${collectionId}/reverse`,
      headers: { authorization: `Bearer ${accountantToken}` },
      payload: { reason: "Espèces non remises par le client" }
    });
    expect(reverse.statusCode).toBe(200);
    expect(reverse.json().status).toBe("REVERSED");

    const history = await app.inject({
      method: "GET",
      url: `/api/v1/cod/${collectionId}/transactions`,
      headers: { authorization: `Bearer ${accountantToken}` }
    });
    const types = (history.json().transactions as { type: string }[]).map((entry) => entry.type);
    expect(types).toContain("COLLECTION");
    expect(types).toContain("REVERSAL");

    const stored = await prisma.shipment.findUnique({ where: { id: shipment.id } });
    expect(stored?.paymentStatus).toBe("PENDING");
  });

  it("rejects a COD reversal from a courier who did not collect it", async () => {
    const shipment = await createShipment({ codAmount: 90 });
    shipmentIds.push(shipment.id);

    await app.inject({
      method: "POST",
      url: "/api/v1/assignments",
      headers: { authorization: `Bearer ${dispatcherToken}` },
      payload: { courierId, shipmentIds: [shipment.id] }
    });
    await deliverShipment(shipment.id);
    await app.inject({
      method: "PATCH",
      url: `/api/v1/shipments/${shipment.id}/status`,
      headers: { authorization: `Bearer ${courierToken}` },
      payload: { status: "DELIVERED", outcome: "DELIVERED" }
    });

    const collection = await app.inject({
      method: "POST",
      url: "/api/v1/cod",
      headers: { authorization: `Bearer ${courierToken}` },
      payload: { shipmentId: shipment.id, amount: 90 }
    });
    const collectionId = collection.json().id;

    const response = await app.inject({
      method: "POST",
      url: `/api/v1/cod/${collectionId}/reverse`,
      headers: { authorization: `Bearer ${otherCourierToken}` },
      payload: { reason: "tentative" }
    });
    expect(response.statusCode).toBe(403);
  });

  it("reconciles collected COD against delivered shipments", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/cod/reconciliation?merchantId=${merchantId}`,
      headers: { authorization: `Bearer ${accountantToken}` }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.deliveredShipments).toBeGreaterThan(0);
    expect(Number(body.collectedTotal)).toBeGreaterThan(0);
    expect(Array.isArray(body.uncollectedDelivered)).toBe(true);
  });

  /* ------------------------------------------------------------------ */
  /* Proof of delivery                                                   */
  /* ------------------------------------------------------------------ */

  it("records a proof of delivery with the required reference", async () => {
    const shipment = await createShipment({ codAmount: 60 });
    shipmentIds.push(shipment.id);

    await app.inject({
      method: "POST",
      url: "/api/v1/assignments",
      headers: { authorization: `Bearer ${dispatcherToken}` },
      payload: { courierId, shipmentIds: [shipment.id] }
    });
    await deliverShipment(shipment.id);

    const missing = await app.inject({
      method: "POST",
      url: `/api/v1/shipments/${shipment.id}/proof-of-delivery`,
      headers: { authorization: `Bearer ${courierToken}` },
      payload: { type: "PHOTO" }
    });
    expect(missing.statusCode).toBe(400);

    const response = await app.inject({
      method: "POST",
      url: `/api/v1/shipments/${shipment.id}/proof-of-delivery`,
      headers: { authorization: `Bearer ${courierToken}` },
      payload: { type: "PHOTO", photoRef: "uploads/pod/phase2.jpg" }
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().type).toBe("PHOTO");
  });

  it("rejects a proof of delivery for a shipment that was never dispatched", async () => {
    const shipment = await createShipment();
    shipmentIds.push(shipment.id);

    // The shipment is assigned but still waiting for pickup, so a proof of
    // delivery is not allowed yet.
    await assignShipment(shipment.id);

    const response = await app.inject({
      method: "POST",
      url: `/api/v1/shipments/${shipment.id}/proof-of-delivery`,
      headers: { authorization: `Bearer ${courierToken}` },
      payload: { type: "SIGNATURE", signatureRef: "sig-1" }
    });
    expect(response.statusCode).toBe(400);
  });

  it("refuses a proof of delivery on a shipment assigned to another courier", async () => {
    const shipment = await createShipment();
    shipmentIds.push(shipment.id);
    await assignShipment(shipment.id, otherCourierId);

    const response = await app.inject({
      method: "POST",
      url: `/api/v1/shipments/${shipment.id}/proof-of-delivery`,
      headers: { authorization: `Bearer ${courierToken}` },
      payload: { type: "SIGNATURE", signatureRef: "sig-1" }
    });
    expect(response.statusCode).toBe(403);
  });

  /* ------------------------------------------------------------------ */
  /* Settlements                                                         */
  /* ------------------------------------------------------------------ */

  it("computes a settlement from delivered shipments", async () => {
    const shipmentId = await settleableShipment(1000);

    const preview = await app.inject({
      method: "GET",
      url: `/api/v1/settlements/settleable/${merchantId}`,
      headers: { authorization: `Bearer ${accountantToken}` }
    });
    expect(preview.statusCode).toBe(200);
    const previewBody = preview.json();
    expect(previewBody.items.length).toBeGreaterThan(0);
    // The preview must always satisfy the documented formula.
    expect(Number(previewBody.preview.netPayable)).toBe(
      Number(previewBody.preview.grossCod) - Number(previewBody.preview.deliveryFees)
    );
    expect(
      previewBody.items.find((item: { id: string }) => item.id === shipmentId)
    ).toBeTruthy();

    const created = await app.inject({
      method: "POST",
      url: "/api/v1/settlements",
      headers: { authorization: `Bearer ${accountantToken}` },
      payload: { merchantId, shipmentIds: [shipmentId] }
    });

    expect(created.statusCode).toBe(201);
    const body = created.json();
    expect(body.status).toBe("PENDING");
    expect(Number(body.grossCod)).toBe(1000);
    expect(Number(body.netPayable)).toBe(983);
    expect(body.reference).toMatch(/^SET-/);
    expect(body.createdBy.fullName).toBe("Accountant Phase2");
  });

  it("rejects settling the same shipment twice", async () => {
    const shipmentId = await settleableShipment(640);

    const first = await app.inject({
      method: "POST",
      url: "/api/v1/settlements",
      headers: { authorization: `Bearer ${accountantToken}` },
      payload: { merchantId, shipmentIds: [shipmentId] }
    });
    expect(first.statusCode).toBe(201);

    const second = await app.inject({
      method: "POST",
      url: "/api/v1/settlements",
      headers: { authorization: `Bearer ${accountantToken}` },
      payload: { merchantId, shipmentIds: [shipmentId] }
    });
    expect(second.statusCode).toBe(409);
  });

  it("rejects settling a shipment without a collected COD", async () => {
    const shipment = await createShipment({ codAmount: 55 });
    shipmentIds.push(shipment.id);

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/settlements",
      headers: { authorization: `Bearer ${accountantToken}` },
      payload: { merchantId, shipmentIds: [shipment.id] }
    });
    expect(response.statusCode).toBe(400);
  });

  it("rejects a settlement created by a merchant", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/settlements",
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: { merchantId, shipmentIds: [] }
    });
    expect(response.statusCode).toBe(403);
  });

  it("moves a settlement through approve and pay", async () => {
    const shipmentId = await settleableShipment(300);
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/settlements",
      headers: { authorization: `Bearer ${accountantToken}` },
      payload: { merchantId, shipmentIds: [shipmentId] }
    });
    const settlementId = created.json().id;

    const invalid = await app.inject({
      method: "POST",
      url: `/api/v1/settlements/${settlementId}/pay`,
      headers: { authorization: `Bearer ${accountantToken}` },
      payload: {}
    });
    expect(invalid.statusCode).toBe(400);

    const approved = await app.inject({
      method: "POST",
      url: `/api/v1/settlements/${settlementId}/approve`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {}
    });
    expect(approved.statusCode).toBe(200);
    expect(approved.json().status).toBe("APPROVED");
    expect(approved.json().approvedBy.fullName).toBe("Admin Phase2");
    expect(approved.json().approvedAt).toBeTruthy();

    const paid = await app.inject({
      method: "POST",
      url: `/api/v1/settlements/${settlementId}/pay`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {}
    });
    expect(paid.statusCode).toBe(200);
    expect(paid.json().status).toBe("PAID");
    expect(paid.json().paidAt).toBeTruthy();

    const again = await app.inject({
      method: "POST",
      url: `/api/v1/settlements/${settlementId}/pay`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {}
    });
    // A settlement is a state machine: paying it twice is a conflict.
    expect(again.statusCode).toBe(409);
    expect(again.json().error).toBe("CONFLICT");
  });

  it("cancels a settlement and releases its shipments", async () => {
    const shipmentId = await settleableShipment(200);
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/settlements",
      headers: { authorization: `Bearer ${accountantToken}` },
      payload: { merchantId, shipmentIds: [shipmentId] }
    });
    const settlementId = created.json().id;

    const cancelled = await app.inject({
      method: "POST",
      url: `/api/v1/settlements/${settlementId}/cancel`,
      headers: { authorization: `Bearer ${accountantToken}` },
      payload: { reason: "Erreur de saisie" }
    });
    expect(cancelled.statusCode).toBe(200);
    expect(cancelled.json().status).toBe("CANCELLED");

    const settleable = await prisma.shipment.findUnique({
      where: { id: shipmentId },
      include: { settlementItems: true }
    });
    expect(settleable?.settlementItems).toHaveLength(0);
  });

  it("prevents the creator from approving their own settlement", async () => {
    const shipmentId = await settleableShipment(120);
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/settlements",
      headers: { authorization: `Bearer ${accountantToken}` },
      payload: { merchantId, shipmentIds: [shipmentId] }
    });
    const settlementId = created.json().id;

    const response = await app.inject({
      method: "POST",
      url: `/api/v1/settlements/${settlementId}/approve`,
      headers: { authorization: `Bearer ${accountantToken}` },
      payload: {}
    });
    expect(response.statusCode).toBe(403);
  });

  it("exports settlements as CSV", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/settlements/report.csv",
      headers: { authorization: `Bearer ${accountantToken}` }
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/csv");
    expect(response.body).toContain("reference");
    expect(response.body).toContain("net_payable");
  });

  /* ------------------------------------------------------------------ */
  /* Dashboard and concurrency                                           */
  /* ------------------------------------------------------------------ */

  it("returns real dashboard KPIs", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/dashboard/kpis",
      headers: { authorization: `Bearer ${adminToken}` }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.shipments.total).toBeGreaterThan(0);
    expect(body.couriers.active).toBeGreaterThan(0);
    expect(body.cod.expectedTotal).toBeTruthy();
    expect(body.settlements.pending).toBeGreaterThanOrEqual(0);
  });

  it("returns merchant balances with collected and outstanding amounts", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/dashboard/merchant-balances",
      headers: { authorization: `Bearer ${adminToken}` }
    });

    expect(response.statusCode).toBe(200);
    const balance = response.json().items.find(
      (item: { merchantId: string }) => item.merchantId === merchantId
    );
    expect(balance).toBeTruthy();
    expect(Number(balance.collected)).toBeGreaterThan(0);
  });

  it("lets a merchant see only its own balance", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/dashboard/merchant-balances",
      headers: { authorization: `Bearer ${merchantToken}` }
    });

    expect(response.statusCode).toBe(200);
    const items = response.json().items as { merchantId: string }[];
    expect(items).toHaveLength(1);
    expect(items[0].merchantId).toBe(merchantId);
  });

  it("exposes the courier mission list to its owner only", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/courier/missions?activeOnly=false",
      headers: { authorization: `Bearer ${courierToken}` }
    });

    expect(response.statusCode).toBe(200);
    const items = response.json().items as { courierId: string }[];
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((item) => item.courierId === courierId)).toBe(true);
  });

  it("refuses the mission list to a dispatcher", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/courier/missions",
      headers: { authorization: `Bearer ${dispatcherToken}` }
    });
    expect(response.statusCode).toBe(400);
  });

  it("assigns a shipment only once under concurrent requests", async () => {
    const shipment = await createShipment();
    shipmentIds.push(shipment.id);

    const results = await Promise.all([
      app.inject({
        method: "POST",
        url: "/api/v1/assignments",
        headers: { authorization: `Bearer ${dispatcherToken}` },
        payload: { courierId, shipmentIds: [shipment.id] }
      }),
      app.inject({
        method: "POST",
        url: "/api/v1/assignments",
        headers: { authorization: `Bearer ${dispatcherToken}` },
        payload: { courierId: otherCourierId, shipmentIds: [shipment.id] }
      })
    ]);

    const created = results.filter((result) => result.statusCode === 201);
    const rejected = results.filter((result) => result.statusCode === 409);
    expect(created).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const assignments = await prisma.shipmentAssignment.count({
      where: { shipmentId: shipment.id, status: "ACTIVE" }
    });
    expect(assignments).toBe(1);
  });

  it("records a COD collection only once under concurrent requests", async () => {
    const shipmentId = await deliveredShipment(777);

    const results = await Promise.all([
      app.inject({
        method: "POST",
        url: "/api/v1/cod",
        headers: { authorization: `Bearer ${courierToken}` },
        payload: { shipmentId, amount: 777 }
      }),
      app.inject({
        method: "POST",
        url: "/api/v1/cod",
        headers: { authorization: `Bearer ${courierToken}` },
        payload: { shipmentId, amount: 777 }
      })
    ]);

    const created = results.filter((result) => result.statusCode === 201);
    expect(created).toHaveLength(1);

    const collections = await prisma.codCollection.count({ where: { shipmentId } });
    expect(collections).toBe(1);
  });
});
