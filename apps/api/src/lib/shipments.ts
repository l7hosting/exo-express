import type { DeliveryOutcome, ShipmentStatus } from "@prisma/client";
import { badRequest, notFound } from "./errors.js";

export const SHIPMENT_STATUSES: ShipmentStatus[] = [
  "CREATED",
  "PICKUP_ASSIGNED",
  "PICKED_UP",
  "AT_DEPOT",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "DELIVERY_FAILED",
  "RETURN_REQUESTED",
  "RETURNING",
  "RETURNED",
  "CANCELLED"
];

const TRANSITIONS: Record<ShipmentStatus, ShipmentStatus[]> = {
  CREATED: ["PICKUP_ASSIGNED", "CANCELLED"],
  PICKUP_ASSIGNED: ["PICKED_UP", "CANCELLED"],
  PICKED_UP: ["AT_DEPOT", "DELIVERY_FAILED"],
  AT_DEPOT: ["OUT_FOR_DELIVERY", "DELIVERY_FAILED"],
  OUT_FOR_DELIVERY: ["DELIVERED", "DELIVERY_FAILED"],
  DELIVERED: [],
  DELIVERY_FAILED: ["RETURN_REQUESTED", "OUT_FOR_DELIVERY"],
  RETURN_REQUESTED: ["RETURNING"],
  RETURNING: ["RETURNED"],
  RETURNED: [],
  CANCELLED: []
};

export function allowedTransitions(status: ShipmentStatus): ShipmentStatus[] {
  return TRANSITIONS[status] ?? [];
}

export function canTransition(from: ShipmentStatus, to: ShipmentStatus): boolean {
  return allowedTransitions(from).includes(to);
}

export function assertTransition(from: ShipmentStatus, to: ShipmentStatus) {
  if (!canTransition(from, to)) {
    throw badRequest(`Invalid status transition from ${from} to ${to}`, {
      from,
      to,
      allowed: allowedTransitions(from)
    });
  }
}

const TRACKING_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateTrackingNumber(seed: () => number = Math.random): string {
  let body = "";
  for (let i = 0; i < 10; i += 1) {
    body += TRACKING_ALPHABET[Math.floor(seed() * TRACKING_ALPHABET.length)];
  }
  return `EXO-${body}`;
}

export function assertTrackingNumberFormat(value: string) {
  if (!/^EXO-[A-Z2-9]{10}$/.test(value)) {
    throw badRequest("Invalid tracking number format");
  }
}

export function normalizeSearch(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export async function requireShipment<T extends { id: string }>(shipment: T | null): Promise<T> {
  if (!shipment) throw notFound("Shipment not found");
  return shipment;
}

/**
 * Delivery outcomes are only meaningful for the statuses that describe a
 * delivery attempt. Mapping keeps the recorded outcome consistent with the
 * shipment status, so the history can never say "delivered" on a failed
 * delivery.
 */
const OUTCOMES_BY_STATUS: Partial<Record<ShipmentStatus, DeliveryOutcome[]>> = {
  DELIVERED: ["DELIVERED"],
  DELIVERY_FAILED: ["RECIPIENT_UNAVAILABLE", "REFUSED", "INCORRECT_ADDRESS", "RESCHEDULED"],
  RETURNED: ["RETURNED"]
};

export const DELIVERY_OUTCOMES: DeliveryOutcome[] = [
  "DELIVERED",
  "RECIPIENT_UNAVAILABLE",
  "REFUSED",
  "INCORRECT_ADDRESS",
  "RESCHEDULED",
  "RETURNED"
];

export function allowedOutcomes(status: ShipmentStatus): DeliveryOutcome[] {
  return OUTCOMES_BY_STATUS[status] ?? [];
}

export function assertOutcomeMatchesStatus(status: ShipmentStatus, outcome: DeliveryOutcome): void {
  const allowed = allowedOutcomes(status);
  if (!allowed.includes(outcome)) {
    throw badRequest(`Outcome ${outcome} is not valid for status ${status}`, {
      status,
      outcome,
      allowed
    });
  }
}
