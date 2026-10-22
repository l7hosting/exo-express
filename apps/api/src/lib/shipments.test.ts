import { describe, expect, it } from "vitest";
import { allowedTransitions, assertTransition, canTransition, generateTrackingNumber } from "./shipments.js";
import { ApiError } from "./errors.js";

describe("shipment status transitions", () => {
  it("allows the happy path", () => {
    expect(canTransition("CREATED", "PICKUP_ASSIGNED")).toBe(true);
    expect(canTransition("PICKUP_ASSIGNED", "PICKED_UP")).toBe(true);
    expect(canTransition("PICKED_UP", "AT_DEPOT")).toBe(true);
    expect(canTransition("AT_DEPOT", "OUT_FOR_DELIVERY")).toBe(true);
    expect(canTransition("OUT_FOR_DELIVERY", "DELIVERED")).toBe(true);
  });

  it("rejects illegal jumps", () => {
    expect(canTransition("CREATED", "DELIVERED")).toBe(false);
    expect(canTransition("DELIVERED", "OUT_FOR_DELIVERY")).toBe(false);
    expect(canTransition("RETURNED", "DELIVERED")).toBe(false);
  });

  it("rejects transitions out of a terminal state", () => {
    expect(allowedTransitions("DELIVERED")).toEqual([]);
    expect(allowedTransitions("CANCELLED")).toEqual([]);
  });

  it("throws a validation error listing the allowed transitions", () => {
    try {
      assertTransition("CREATED", "DELIVERED");
      throw new Error("assertTransition should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).statusCode).toBe(400);
      expect((error as ApiError).code).toBe("VALIDATION_ERROR");
    }
  });

  it("supports the return workflow", () => {
    expect(canTransition("DELIVERY_FAILED", "RETURN_REQUESTED")).toBe(true);
    expect(canTransition("RETURN_REQUESTED", "RETURNING")).toBe(true);
    expect(canTransition("RETURNING", "RETURNED")).toBe(true);
  });
});

describe("tracking numbers", () => {
  it("generates values with the EXO prefix and 10 characters", () => {
    const tracking = generateTrackingNumber();
    expect(tracking).toMatch(/^EXO-[A-Z2-9]{10}$/);
  });

  it("generates distinct values across calls", () => {
    const values = new Set(Array.from({ length: 50 }, () => generateTrackingNumber()));
    expect(values.size).toBeGreaterThan(1);
  });
});
