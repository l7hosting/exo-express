import { badRequest, conflict, forbidden } from "./errors.js";
import { money, type Money } from "./money.js";

export const COD_COLLECTABLE_STATUSES = ["DELIVERED"] as const;

export function assertCollectable(shipment: { status: string; codAmount: unknown }): void {
  if (!COD_COLLECTABLE_STATUSES.includes(shipment.status as (typeof COD_COLLECTABLE_STATUSES)[number])) {
    throw badRequest(`COD can only be collected on delivered shipments (current status: ${shipment.status})`);
  }
  const amount = money(shipment.codAmount as never);
  if (amount.lessThanOrEqualTo(0)) {
    throw badRequest("Shipment has no COD amount to collect");
  }
}

export function assertAmountMatchesShipment(amount: Money, expected: Money): void {
  if (!amount.equals(expected)) {
    throw badRequest("Collected amount does not match the shipment COD amount", {
      expected: expected.toFixed(2),
      received: amount.toFixed(2)
    });
  }
}

export function assertNotAlreadyCollected(existing: { status: string } | null): void {
  if (existing && existing.status === "COLLECTED") {
    throw conflict("COD has already been collected for this shipment");
  }
  if (existing && existing.status === "REVERSED") {
    throw conflict("A reversed collection must be cancelled before a new one can be recorded");
  }
}

export function assertReversible(collection: { status: string }): void {
  if (collection.status !== "COLLECTED") {
    throw conflict("Only a collected COD entry can be reversed");
  }
}

export function assertCanReverse(actor: { role: string }, collectionCourierId: string, actorId: string): void {
  if (actor.role === "COURIER" && collectionCourierId !== actorId) {
    throw forbidden("Couriers can only reverse their own collections");
  }
}

export function buildCodReference(prefix = "COD"): string {
  const random = Math.floor(Math.random() * 1_000_000)
    .toString()
    .padStart(6, "0");
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${random}`;
}
