import { describe, expect, it } from "vitest";
import { hasPermission, permissionsFor, ROLES } from "./permissions.js";

describe("role permissions", () => {
  it("grants full access to super admins", () => {
    expect(hasPermission("SUPER_ADMIN", "user:manage")).toBe(true);
    expect(hasPermission("SUPER_ADMIN", "settlement:write")).toBe(true);
  });

  it("limits couriers to shipment work", () => {
    expect(hasPermission("COURIER", "shipment:read")).toBe(true);
    expect(hasPermission("COURIER", "shipment:transition")).toBe(true);
    expect(hasPermission("COURIER", "merchant:write")).toBe(false);
    expect(hasPermission("COURIER", "user:manage")).toBe(false);
  });

  it("lets merchants read but not write shipments", () => {
    expect(hasPermission("MERCHANT", "shipment:read")).toBe(true);
    expect(hasPermission("MERCHANT", "shipment:write")).toBe(false);
    expect(hasPermission("MERCHANT", "merchant:write")).toBe(false);
  });

  it("keeps support read-only", () => {
    expect(hasPermission("SUPPORT", "shipment:read")).toBe(true);
    expect(hasPermission("SUPPORT", "shipment:transition")).toBe(false);
    expect(hasPermission("SUPPORT", "tariff:write")).toBe(false);
  });

  it("defines a non-empty permission set for every role", () => {
    for (const role of ROLES) {
      expect(permissionsFor(role).length).toBeGreaterThan(0);
    }
  });
});
