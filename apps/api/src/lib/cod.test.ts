import { describe, expect, it } from "vitest";
import {
  assertAmountMatchesShipment,
  assertCanReverse,
  assertCollectable,
  assertNotAlreadyCollected,
  assertReversible,
  buildCodReference
} from "./cod.js";
import { money } from "./money.js";
import { ApiError } from "./errors.js";

describe("COD collection rules", () => {
  it("only allows collection on delivered shipments", () => {
    expect(() => assertCollectable({ status: "DELIVERED", codAmount: 100 })).not.toThrow();
    expect(() => assertCollectable({ status: "OUT_FOR_DELIVERY", codAmount: 100 })).toThrow(ApiError);
    expect(() => assertCollectable({ status: "CREATED", codAmount: 100 })).toThrow(ApiError);
  });

  it("rejects a shipment without COD", () => {
    expect(() => assertCollectable({ status: "DELIVERED", codAmount: 0 })).toThrow(/no COD/i);
  });

  it("requires the collected amount to match the shipment amount", () => {
    expect(() => assertAmountMatchesShipment(money(899.5), money(899.5))).not.toThrow();
    expect(() => assertAmountMatchesShipment(money(900), money(899.5))).toThrow(ApiError);
    expect(() => assertAmountMatchesShipment(money(899.49), money(899.5))).toThrow(ApiError);
  });

  it("rejects a duplicate collection", () => {
    expect(() => assertNotAlreadyCollected({ status: "COLLECTED" })).toThrow(/already been collected/i);
  });

  it("rejects a new collection on a reversed entry", () => {
    expect(() => assertNotAlreadyCollected({ status: "REVERSED" })).toThrow(ApiError);
  });

  it("accepts a first collection", () => {
    expect(() => assertNotAlreadyCollected(null)).not.toThrow();
  });

  it("only reverses a collected entry", () => {
    expect(() => assertReversible({ status: "COLLECTED" })).not.toThrow();
    expect(() => assertReversible({ status: "REVERSED" })).toThrow(ApiError);
  });

  it("limits couriers to their own collections", () => {
    expect(() =>
      assertCanReverse({ role: "COURIER" }, "courier-1", "courier-2")
    ).toThrow(ApiError);
    expect(() =>
      assertCanReverse({ role: "COURIER" }, "courier-1", "courier-1")
    ).not.toThrow();
    expect(() =>
      assertCanReverse({ role: "ACCOUNTANT" }, "courier-1", "accountant-1")
    ).not.toThrow();
  });

  it("builds unique references", () => {
    const references = new Set(Array.from({ length: 200 }, () => buildCodReference()));
    expect(references.size).toBeGreaterThan(1);
    expect(buildCodReference()).toMatch(/^COD-[A-Z0-9]+-\d{6}$/);
  });
});
