import type { ShipmentStatus } from "@prisma/client";
import { config } from "./config.js";
import { badRequest, conflict, forbidden } from "./errors.js";

/**
 * Statuses for which a shipment may be handed over to a courier.
 * A shipment is assigned while it is still `CREATED`; the assignment itself
 * moves it to `PICKUP_ASSIGNED`.
 */
export const ASSIGNABLE_STATUSES: ShipmentStatus[] = ["CREATED"];

/** Status a shipment takes when an assignment is created. */
export const ASSIGNED_STATUS: ShipmentStatus = "PICKUP_ASSIGNED";

export function assertAssignable(shipment: { status: ShipmentStatus; courierId: string | null }): void {
  if (!ASSIGNABLE_STATUSES.includes(shipment.status)) {
    throw badRequest(`Shipment in status ${shipment.status} cannot be assigned`, {
      allowedStatuses: ASSIGNABLE_STATUSES
    });
  }
}

export function assertCourierEligible(courier: { isActive: boolean; role: string }): void {
  if (!courier.isActive) {
    throw badRequest("Cannot assign a shipment to a deactivated courier");
  }
  if (courier.role !== "COURIER") {
    throw badRequest("Target user is not a courier");
  }
}

export function assertNotAlreadyAssigned(shipment: { courierId: string | null }): void {
  if (shipment.courierId) {
    throw conflict("Shipment is already assigned to a courier");
  }
}

export function assertSameCourier(currentCourierId: string | null, targetCourierId: string): void {
  if (currentCourierId === targetCourierId) {
    throw conflict("Shipment is already assigned to this courier");
  }
}

/**
 * A courier may only act on shipments that are currently assigned to them.
 */
export function assertCourierOwnsShipment(shipment: { courierId: string | null }, courierId: string): void {
  if (shipment.courierId !== courierId) {
    throw forbidden("Shipment is not assigned to you");
  }
}

/**
 * Maximum number of active shipments a courier can hold at once.
 * Kept configurable so dispatchers can tune it without code changes.
 */
export const MAX_ACTIVE_SHIPMENTS_PER_COURIER = config.maxActiveShipmentsPerCourier;

export function assertCourierCapacity(activeCount: number): void {
  if (activeCount >= MAX_ACTIVE_SHIPMENTS_PER_COURIER) {
    throw conflict(`Courier reached the maximum of ${MAX_ACTIVE_SHIPMENTS_PER_COURIER} active shipments`);
  }
}
