import { describe, expect, it } from "vitest";
import {
  allowedSettlementTransitions,
  assertNoDuplicateShipments,
  assertNonEmpty,
  assertSegregationOfDuties,
  assertSettlementTransition,
  buildSettlementReference,
  computeSettlementTotals
} from "./settlements.js";
import { money } from "./money.js";
import { ApiError } from "./errors.js";

describe("settlement formula", () => {
  it("computes net payable as gross COD minus fees and returns plus adjustments", () => {
    const totals = computeSettlementTotals(
      [
        { shipmentId: "a", codAmount: money(100), deliveryFee: money(17), returnFee: money(0) },
        { shipmentId: "b", codAmount: money(250.5), deliveryFee: money(20), returnFee: money(0) }
      ],
      money(0)
    );

    expect(totals.grossCod.toFixed(2)).toBe("350.50");
    expect(totals.deliveryFees.toFixed(2)).toBe("37.00");
    expect(totals.returnFees.toFixed(2)).toBe("0.00");
    expect(totals.netPayable.toFixed(2)).toBe("313.50");
    expect(totals.itemCount).toBe(2);
  });

  it("subtracts return fees for non delivered shipments", () => {
    const totals = computeSettlementTotals([
      { shipmentId: "a", codAmount: money(60), deliveryFee: money(17), returnFee: money(5) }
    ]);
    expect(totals.netPayable.toFixed(2)).toBe("38.00");
  });

  it("applies manual adjustments", () => {
    const totals = computeSettlementTotals(
      [{ shipmentId: "a", codAmount: money(100), deliveryFee: money(0), returnFee: money(0) }],
      money(12.5)
    );
    expect(totals.netPayable.toFixed(2)).toBe("112.50");
  });

  it("keeps cent-level precision across many lines", () => {
    const lines = Array.from({ length: 33 }, (_, index) => ({
      shipmentId: `s${index}`,
      codAmount: money(0.1),
      deliveryFee: money(0),
      returnFee: money(0)
    }));
    const totals = computeSettlementTotals(lines);
    expect(totals.grossCod.toFixed(2)).toBe("3.30");
  });
});

describe("settlement state machine", () => {
  it("allows the documented path", () => {
    expect(allowedSettlementTransitions("PENDING")).toContain("APPROVED");
    expect(allowedSettlementTransitions("APPROVED")).toContain("PAID");
  });

  it("treats PAID and CANCELLED as terminal", () => {
    expect(allowedSettlementTransitions("PAID")).toEqual([]);
    expect(allowedSettlementTransitions("CANCELLED")).toEqual([]);
  });

  it("rejects an invalid transition", () => {
    expect(() => assertSettlementTransition("PENDING", "PAID")).toThrow(ApiError);
    expect(() => assertSettlementTransition("PAID", "PENDING")).toThrow(ApiError);
  });

  it("rejects a repeated transition", () => {
    expect(() => assertSettlementTransition("APPROVED", "APPROVED")).toThrow(/already/i);
  });
});

describe("settlement guards", () => {
  it("requires at least one shipment", () => {
    expect(() => assertNonEmpty([])).toThrow(ApiError);
  });

  it("rejects a duplicated shipment inside one batch", () => {
    const lines = [
      { shipmentId: "a", codAmount: money(1), deliveryFee: money(0), returnFee: money(0) },
      { shipmentId: "a", codAmount: money(1), deliveryFee: money(0), returnFee: money(0) }
    ];
    expect(() => assertNoDuplicateShipments(lines)).toThrow(ApiError);
  });

  it("prevents the creator from approving their own settlement", () => {
    expect(() =>
      assertSegregationOfDuties({ id: "u1", role: "ACCOUNTANT" }, { createdById: "u1" })
    ).toThrow(ApiError);
  });

  it("allows a different approver", () => {
    expect(() =>
      assertSegregationOfDuties({ id: "u2", role: "ACCOUNTANT" }, { createdById: "u1" })
    ).not.toThrow();
  });

  it("exempts the super admin from segregation of duties", () => {
    expect(() =>
      assertSegregationOfDuties({ id: "u1", role: "SUPER_ADMIN" }, { createdById: "u1" })
    ).not.toThrow();
  });
});

describe("settlement references", () => {
  it("builds unique references", () => {
    const references = new Set(Array.from({ length: 200 }, () => buildSettlementReference("ABC")));
    expect(references.size).toBeGreaterThan(1);
    expect(buildSettlementReference("ABC")).toMatch(/^SET-ABC-\d{8}-\d{5}$/);
  });
});
