import { describe, expect, it } from "vitest";
import { add, isNegative, isPositive, money, subtract, sum, toMoneyString, zero } from "./money.js";

describe("money helpers", () => {
  it("rounds to two decimals with half-up", () => {
    expect(toMoneyString(10.005)).toBe("10.01");
    expect(toMoneyString(10.004)).toBe("10.00");
    expect(toMoneyString(0.1 + 0.2)).toBe("0.30");
  });

  it("does not drift on repeated addition", () => {
    const cents = Array.from({ length: 100 }, () => 0.1);
    expect(toMoneyString(sum(cents))).toBe("10.00");
  });

  it("adds and subtracts exactly", () => {
    const a = money(17.5);
    const b = money(2.25);
    expect(toMoneyString(add(a, b))).toBe("19.75");
    expect(toMoneyString(subtract(a, b))).toBe("15.25");
  });

  it("keeps values negative without clamping", () => {
    const result = subtract(money(10), money(30));
    expect(toMoneyString(result)).toBe("-20.00");
    expect(isNegative(result)).toBe(true);
    expect(isPositive(result)).toBe(false);
  });

  it("starts from an exact zero", () => {
    expect(toMoneyString(zero())).toBe("0.00");
  });

  it("accepts string inputs coming from the database", () => {
    expect(toMoneyString("899.50")).toBe("899.50");
    expect(toMoneyString("0")).toBe("0.00");
  });
});
