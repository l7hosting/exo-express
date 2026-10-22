/**
 * Runtime configuration.
 *
 * Every value is read from the environment exactly once at process start.
 * Production deployments must provide `DATABASE_URL` and `CORS_ORIGINS`;
 * missing critical configuration fails fast instead of silently starting in an
 * insecure mode.
 */

function readBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === "") return fallback;
  const normalised = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalised)) return true;
  if (["0", "false", "no", "off"].includes(normalised)) return false;
  return fallback;
}

function readInt(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const rounded = Math.trunc(parsed);
  if (rounded < min || rounded > max) return fallback;
  return rounded;
}

function readList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

/**
 * A browser origin is a scheme, host and optional port. Accepting a URL with a
 * path or trailing slash silently breaks CORS, so production configuration is
 * validated against the canonical `URL.origin` value.
 */
function isExactHttpsOrigin(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && parsed.origin === value;
  } catch {
    return false;
  }
}

const nodeEnv = process.env.NODE_ENV ?? "development";
const isProduction = nodeEnv === "production";
const isTest = nodeEnv === "test";

/**
 * In development the dashboard runs on :3000 and Expo dev tools may originate
 * from :8081. Production must always declare its own allowlist.
 */
const defaultCorsOrigins = isProduction
  ? []
  : ["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:8081"];

export const config = {
  nodeEnv,
  isProduction,
  isTest,
  port: readInt(process.env.API_PORT ?? process.env.PORT, 3001, 1, 65_535),
  host: process.env.HOST?.trim() || "0.0.0.0",
  databaseUrl: process.env.DATABASE_URL?.trim() ?? "",
  /**
   * A JSON API must never answer a browser origin it does not know. When the
   * list is empty, cross-origin browser calls are refused; native apps do not
   * send an Origin header and are therefore unaffected.
   */
  corsOrigins: readList(process.env.CORS_ORIGINS).length > 0
    ? readList(process.env.CORS_ORIGINS)
    : defaultCorsOrigins,
  /**
   * Only enable when the API sits behind a reverse proxy that overwrites
   * X-Forwarded-For. Otherwise clients could spoof their IP and bypass the
   * per-IP rate limiter.
   */
  trustProxy: readBoolean(process.env.TRUST_PROXY, false),
  logLevel: process.env.LOG_LEVEL?.trim() || (isTest ? "silent" : isProduction ? "info" : "debug"),
  sessionTtlDays: readInt(process.env.SESSION_TTL_DAYS, 7, 1, 30),
  /**
   * Maximum number of active shipments a courier may hold. Parsed here so a
   * malformed environment value falls back to the safe default instead of
   * becoming `NaN`, which would make the capacity comparison always false.
   */
  maxActiveShipmentsPerCourier: readInt(process.env.MAX_ACTIVE_SHIPMENTS_PER_COURIER, 30, 1, 1_000),
  rateLimit: {
    /** Disabled automatically under `NODE_ENV=test` to keep the suite fast. */
    enabled: readBoolean(process.env.RATE_LIMIT_ENABLED, !isTest),
    windowMs: readInt(process.env.RATE_LIMIT_WINDOW_MS, 60_000, 1_000, 3_600_000),
    max: readInt(process.env.RATE_LIMIT_MAX, 600, 1, 1_000_000),
    loginWindowMs: readInt(process.env.LOGIN_RATE_LIMIT_WINDOW_MS, 15 * 60_000, 1_000, 86_400_000),
    /** All login attempts from one IP (shared offices/NAT need headroom). */
    loginIpMax: readInt(process.env.LOGIN_RATE_LIMIT_IP_MAX, 40, 1, 10_000),
    /** Failed attempts for one IP + account pair. */
    loginAccountMax: readInt(process.env.LOGIN_RATE_LIMIT_ACCOUNT_MAX, 8, 1, 100)
  }
};

/**
 * Validates configuration that is unsafe to default. Called from the server
 * entrypoint (not at module import time) so tests can build the app without a
 * full production environment.
 */
export function assertRuntimeConfig(): void {
  if (!config.databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }
  if (config.isProduction && config.corsOrigins.length === 0) {
    throw new Error(
      "CORS_ORIGINS must list the browser origins allowed to call the API in production (e.g. https://app.exoexpress.ma)"
    );
  }
  if (config.isProduction && config.corsOrigins.includes("*")) {
    throw new Error("CORS_ORIGINS may not contain a wildcard in production");
  }
  if (config.isProduction) {
    const invalidOrigin = config.corsOrigins.find((origin) => !isExactHttpsOrigin(origin));
    if (invalidOrigin) {
      throw new Error(
        `CORS_ORIGINS entries must be exact HTTPS origins without a path or trailing slash (invalid: ${invalidOrigin})`
      );
    }
  }
}
