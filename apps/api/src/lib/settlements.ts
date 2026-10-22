import type { SettlementStatus } from "@prisma/client";
import { badRequest, conflict, forbidden } from "./errors.js";
import { add, money, subtract, sum, zero, type Money } from "./money.js";
/**
 * EXO EXPRESS settlement formula (documented business rule)
 * -------------------------------------------------------------
 * For a merchant settlement batch covering a set of shipments:
 *
 *   grossCod     = sum of COD amounts *collected* (CodCollection.status = COLLECTED)
 *                  for the shipments included in the batch.
 *   deliveryFees = sum of the shipment delivery fees (Zone.deliveryFee snapshot on
 *                  the shipment) charged to the merchant for those shipments.
 *   returnFees   = sum of the shipment return fees for shipments that were not
 *                  delivered (returned / failed attempts), 0 otherwise.
 *   adjustments  = manual adjustment, default 0.
 *
 *   netPayable = grossCod - deliveryFees - returnFees + adjustments
 *
 * A shipment may only be settled once: `SettlementItem.shipmentId` is unique,
 * which makes a second settlement of the same shipment impossible.
 */
export interface SettlementLineInput {
  shipmentId: string;
  codAmount: Money;
  deliveryFee: Money;
  returnFee: Money;
}

export interface SettlementTotals {
  grossCod: Money;
  deliveryFees: Money;
  returnFees: Money;
  adjustments: Money;
  netPayable: Money;
  itemCount: number;
}

export function computeSettlementTotals(
  lines: SettlementLineInput[],
  adjustments: Money = zero()
): SettlementTotals {
  const grossCod = sum(lines.map((line) => line.codAmount));
  const deliveryFees = sum(lines.map((line) => line.deliveryFee));
  const returnFees = sum(lines.map((line) => line.returnFee));

  const netPayable = add(subtract(subtract(grossCod, deliveryFees), returnFees), adjustments);

  return {
    grossCod,
    deliveryFees,
    returnFees,
    adjustments: money(adjustments),
    netPayable,
    itemCount: lines.length
  };
}

const TRANSITIONS: Record<SettlementStatus, SettlementStatus[]> = {
  PENDING: ["APPROVED", "CANCELLED"],
  APPROVED: ["PAID", "CANCELLED"],
  PAID: [],
  CANCELLED: []
};

export function allowedSettlementTransitions(status: SettlementStatus): SettlementStatus[] {
  return TRANSITIONS[status] ?? [];
}

export function assertSettlementTransition(from: SettlementStatus, to: SettlementStatus): void {
  if (from === to) {
    throw conflict(`Settlement is already ${to}`);
  }
  if (!allowedSettlementTransitions(from).includes(to)) {
    throw badRequest(`Invalid settlement transition from ${from} to ${to}`, {
      from,
      to,
      allowed: allowedSettlementTransitions(from)
    });
  }
}

/**
 * Separation of duties: the user who created a settlement may not approve or
 * pay it. The platform owner (SUPER_ADMIN) is exempt so a single administrator
 * can still operate the finance flow.
 */
export function assertSegregationOfDuties(
  actor: { id: string; role: string },
  settlement: { createdById: string | null }
): void {
  if (actor.role === "SUPER_ADMIN") return;
  if (settlement.createdById && settlement.createdById === actor.id) {
    throw forbidden("A settlement must be approved and paid by someone other than its creator");
  }
}

export function buildSettlementReference(merchantCode: string): string {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const random = Math.floor(Math.random() * 100_000)
    .toString()
    .padStart(5, "0");
  return `SET-${merchantCode}-${stamp}-${random}`;
}

export function assertNonEmpty(lines: SettlementLineInput[]): void {
  if (lines.length === 0) {
    throw badRequest("A settlement must contain at least one shipment");
  }
}

export function assertNoDuplicateShipments(lines: SettlementLineInput[]): void {
  const seen = new Set<string>();
  for (const line of lines) {
    if (seen.has(line.shipmentId)) {
      throw conflict(`Shipment ${line.shipmentId} appears twice in the settlement`);
    }
    seen.add(line.shipmentId);
  }
}

/** Convenience helper for reporting: adds two monetary values safely. */
export function sumMoney(values: (Money | number | string)[]): Money {
  return sum(values);
}

export function netFrom(gross: Money, fees: Money, returns: Money, adjustments: Money): Money {
  return add(subtract(subtract(gross, fees), returns), adjustments);
}
