import { afterEach, describe, expect, it, vi } from "vitest";

const ENV_KEYS = ["NODE_ENV", "DATABASE_URL", "CORS_ORIGINS", "MAX_ACTIVE_SHIPMENTS_PER_COURIER"] as const;
const originalEnv = new Map(ENV_KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of ENV_KEYS) {
    const original = originalEnv.get(key);
    if (original === undefined) delete process.env[key];
    else process.env[key] = original;
  }
  vi.resetModules();
});

async function loadProductionConfig(corsOrigins: string) {
  process.env.NODE_ENV = "production";
  process.env.DATABASE_URL = "postgresql://user:password@db.example.invalid:5432/exo?schema=public";
  process.env.CORS_ORIGINS = corsOrigins;
  vi.resetModules();
  return import("./config.js");
}

describe("production runtime configuration", () => {
  it("accepts the exact dashboard HTTPS origin", async () => {
    const { assertRuntimeConfig } = await loadProductionConfig("https://www.exoexpress.ma");
    expect(() => assertRuntimeConfig()).not.toThrow();
  });

  it("rejects a non-HTTPS or non-exact browser origin", async () => {
    for (const origin of [
      "http://www.exoexpress.ma",
      "https://www.exoexpress.ma/",
      "https://www.exoexpress.ma/dashboard"
    ]) {
      const { assertRuntimeConfig } = await loadProductionConfig(origin);
      expect(() => assertRuntimeConfig()).toThrow(/exact HTTPS origins/i);
    }
  });

  it("falls back to a safe courier limit when the value is malformed", async () => {
    process.env.MAX_ACTIVE_SHIPMENTS_PER_COURIER = "not-a-number";
    vi.resetModules();
    const { config } = await import("./config.js");
    expect(config.maxActiveShipmentsPerCourier).toBe(30);
  });
});
