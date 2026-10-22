import { describe, expect, it } from "vitest";
import {
  assertAssignable,
  assertCourierCapacity,
  assertCourierEligible,
  assertCourierOwnsShipment,
  assertNotAlreadyAssigned,
  assertSameCourier,
  ASSIGNABLE_STATUSES,
  MAX_ACTIVE_SHIPMENTS_PER_COURIER
} from "./assignments.js";
import { ApiError } from "./errors.js";

describe("assignment rules", () => {
  it("only allows assignment of created shipments", () => {
    expect(ASSIGNABLE_STATUSES).toEqual(["CREATED"]);
    expect(() => assertAssignable({ status: "CREATED", courierId: null })).not.toThrow();
    expect(() => assertAssignable({ status: "PICKED_UP", courierId: null })).toThrow(ApiError);
    expect(() => assertAssignable({ status: "DELIVERED", courierId: null })).toThrow(ApiError);
  });

  it("rejects a deactivated courier", () => {
    expect(() => assertCourierEligible({ isActive: true, role: "COURIER" })).not.toThrow();
    expect(() => assertCourierEligible({ isActive: false, role: "COURIER" })).toThrow(ApiError);
  });

  it("rejects a target that is not a courier", () => {
    expect(() => assertCourierEligible({ isActive: true, role: "DISPATCHER" })).toThrow(/not a courier/i);
  });

  it("rejects an already assigned shipment", () => {
    expect(() => assertNotAlreadyAssigned({ courierId: null })).not.toThrow();
    expect(() => assertNotAlreadyAssigned({ courierId: "courier-1" })).toThrow(ApiError);
  });

  it("rejects reassignment to the same courier", () => {
    expect(() => assertSameCourier("courier-1", "courier-2")).not.toThrow();
    expect(() => assertSameCourier("courier-1", "courier-1")).toThrow(ApiError);
  });

  it("scopes couriers to their own shipments", () => {
    expect(() => assertCourierOwnsShipment({ courierId: "courier-1" }, "courier-1")).not.toThrow();
    expect(() => assertCourierOwnsShipment({ courierId: "courier-2" }, "courier-1")).toThrow(ApiError);
    expect(() => assertCourierOwnsShipment({ courierId: null }, "courier-1")).toThrow(ApiError);
  });

  it("enforces the courier workload ceiling", () => {
    expect(() => assertCourierCapacity(MAX_ACTIVE_SHIPMENTS_PER_COURIER - 1)).not.toThrow();
    expect(() => assertCourierCapacity(MAX_ACTIVE_SHIPMENTS_PER_COURIER)).toThrow(ApiError);
  });
});
