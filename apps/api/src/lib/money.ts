import { Prisma } from "@prisma/client";

export type Money = Prisma.Decimal;

/** Two decimal places, the canonical monetary scale used by EXO EXPRESS. */
export const MONEY_SCALE = 2;

export function money(value: Prisma.Decimal | number | string): Money {
  return new Prisma.Decimal(value).toDecimalPlaces(MONEY_SCALE, Prisma.Decimal.ROUND_HALF_UP);
}

export function zero(): Money {
  return new Prisma.Decimal(0).toDecimalPlaces(MONEY_SCALE);
}

export function add(a: Money, b: Money): Money {
  return money(a.add(b));
}

export function subtract(a: Money, b: Money): Money {
  return money(a.sub(b));
}

export function sum(values: (Money | number | string)[]): Money {
  return values.reduce<Money>((total, value) => add(total, money(value)), zero());
}

export function isPositive(value: Money): boolean {
  return value.greaterThan(0);
}

export function isNegative(value: Money): boolean {
  return value.lessThan(0);
}

/**
 * Converts a Prisma Decimal into a plain JSON-safe string with a fixed scale.
 * Keeps monetary values exact in API payloads and reports.
 */
export function toMoneyString(value: Prisma.Decimal | number | string): string {
  return money(value).toFixed(MONEY_SCALE);
}
