import type { FastifyInstance } from "fastify";
import type { ShipmentStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { authenticateRequest, requireAnyPermission, requirePermission } from "../plugins/auth.js";
import { badRequest, forbidden } from "../lib/errors.js";
import { money } from "../lib/money.js";

const IN_DELIVERY_STATUSES: ShipmentStatus[] = ["PICKED_UP", "AT_DEPOT", "OUT_FOR_DELIVERY"];
const ACTIVE_COURIER_STATUSES: ShipmentStatus[] = [
  "PICKUP_ASSIGNED",
  "PICKED_UP",
  "AT_DEPOT",
  "OUT_FOR_DELIVERY",
  "DELIVERY_FAILED",
  "RETURN_REQUESTED",
  "RETURNING"
];

/**
 * Operational and financial KPIs.
 * Every number is computed from live rows; nothing is stubbed or cached.
 */
export async function dashboardRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateRequest);

  app.get("/api/v1/dashboard/kpis", { preHandler: requirePermission("shipment:read") }, async (request) => {
    const actor = request.auth!.user;

    const shipmentScope: Record<string, unknown> = {};
    if (actor.role === "MERCHANT") {
      if (!actor.merchantId) throw badRequest("This account is not linked to a merchant");
      shipmentScope.merchantId = actor.merchantId;
    }
    if (actor.role === "COURIER") shipmentScope.courierId = actor.id;

    const [
      activeCouriers,
      awaitingAssignment,
      inDelivery,
      delivered,
      returned,
      deliveredFailed,
      totalShipments,
      codCollected,
      codExpected,
      codReversed,
      uncollectedCount,
      pendingSettlements,
      settlementTotal
    ] = await Promise.all([
      actor.role === "COURIER"
        ? Promise.resolve(1)
        : prisma.user.count({ where: { role: "COURIER", isActive: true } }),
      prisma.shipment.count({ where: { ...shipmentScope, courierId: null, status: "CREATED" } }),
      prisma.shipment.count({ where: { ...shipmentScope, status: { in: IN_DELIVERY_STATUSES } } }),
      prisma.shipment.count({ where: { ...shipmentScope, status: "DELIVERED" } }),
      prisma.shipment.count({ where: { ...shipmentScope, status: "RETURNED" } }),
      prisma.shipment.count({ where: { ...shipmentScope, status: "DELIVERY_FAILED" } }),
      prisma.shipment.count({ where: shipmentScope }),
      prisma.codCollection.aggregate({
        where: { status: "COLLECTED", ...(actor.role === "COURIER" ? { courierId: actor.id } : {}) },
        _sum: { amount: true }
      }),
      prisma.shipment.aggregate({
        where: { ...shipmentScope, status: "DELIVERED", codAmount: { gt: 0 } },
        _sum: { codAmount: true }
      }),
      prisma.codCollection.aggregate({
        where: { status: "REVERSED", ...(actor.role === "COURIER" ? { courierId: actor.id } : {}) },
        _sum: { amount: true }
      }),
      prisma.shipment.count({
        where: {
          ...shipmentScope,
          status: "DELIVERED",
          codAmount: { gt: 0 },
          // Reversed collections are outstanding again.
          OR: [{ codCollection: null }, { codCollection: { status: "REVERSED" } }]
        }
      }),
      prisma.merchantSettlement.count({
        where: actor.role === "MERCHANT" && actor.merchantId ? { merchantId: actor.merchantId, status: "PENDING" } : { status: "PENDING" }
      }),
      prisma.merchantSettlement.aggregate({
        where: actor.role === "MERCHANT" && actor.merchantId ? { merchantId: actor.merchantId, status: "PENDING" } : { status: "PENDING" },
        _sum: { netPayable: true }
      })
    ]);

    const collectedTotal = money(codCollected._sum.amount ?? 0);
    const expectedTotal = money(codExpected._sum.codAmount ?? 0);
    const reversedTotal = money(codReversed._sum.amount ?? 0);

    return {
      generatedAt: new Date().toISOString(),
      shipments: {
        total: totalShipments,
        awaitingAssignment,
        inDelivery,
        delivered,
        returned,
        deliveryFailed: deliveredFailed
      },
      couriers: {
        active: activeCouriers
      },
      cod: {
        expectedTotal: expectedTotal.toFixed(2),
        collectedTotal: collectedTotal.toFixed(2),
        reversedTotal: reversedTotal.toFixed(2),
        awaitingReconciliationTotal: expectedTotal.minus(collectedTotal).toFixed(2),
        uncollectedShipments: uncollectedCount
      },
      settlements: {
        // Couriers must never see company-wide settlement aggregates.
        pending: actor.role === "COURIER" ? 0 : pendingSettlements,
        pendingNetPayable:
          actor.role === "COURIER"
            ? money(0).toFixed(2)
            : money(settlementTotal._sum.netPayable ?? 0).toFixed(2)
      },
      activeCourierShipmentStatuses: ACTIVE_COURIER_STATUSES
    };
  });

  /**
   * Per-merchant balances: collected COD versus outstanding amounts.
   * Readable by back-office roles and by the merchant itself, which only ever
   * receives its own line.
   */
  app.get(
    "/api/v1/dashboard/merchant-balances",
    { preHandler: requireAnyPermission("merchant:read", "settlement:read") },
    async (request) => {
      const actor = request.auth!.user;

      if (actor.role === "COURIER") {
        throw forbidden("Couriers cannot read merchant balances");
      }

      const merchants = await prisma.merchant.findMany({
        orderBy: { businessName: "asc" },
        select: { id: true, businessName: true, isActive: true }
      });

      const items = [];
      for (const merchant of merchants) {
        const [collected, outstanding, pendingSettlement] = await Promise.all([
          prisma.codCollection.aggregate({
            where: { status: "COLLECTED", shipment: { merchantId: merchant.id } },
            _sum: { amount: true }
          }),
          prisma.shipment.aggregate({
            where: {
              merchantId: merchant.id,
              status: "DELIVERED",
              codAmount: { gt: 0 },
              // Include reversed collections in the outstanding balance.
              OR: [{ codCollection: null }, { codCollection: { status: "REVERSED" } }]
            },
            _sum: { codAmount: true }
          }),
          prisma.merchantSettlement.aggregate({
            where: { merchantId: merchant.id, status: { in: ["PENDING", "APPROVED"] } },
            _sum: { netPayable: true }
          })
        ]);

        items.push({
          merchantId: merchant.id,
          businessName: merchant.businessName,
          isActive: merchant.isActive,
          collected: money(collected._sum.amount ?? 0).toFixed(2),
          outstanding: money(outstanding._sum.codAmount ?? 0).toFixed(2),
          pendingSettlement: money(pendingSettlement._sum.netPayable ?? 0).toFixed(2)
        });
      }

      if (actor.role === "MERCHANT" && actor.merchantId) {
        return { items: items.filter((item) => item.merchantId === actor.merchantId) };
      }

      return { items };
    }
  );
}
