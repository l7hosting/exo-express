import Fastify, { type FastifyInstance } from "fastify";
import helmet from "@fastify/helmet";
import cors from "@fastify/cors";
import { ZodError } from "zod";
import { authRoutes } from "./routes/auth.js";
import { shipmentRoutes } from "./routes/shipments.js";
import { merchantRoutes } from "./routes/merchants.js";
import { zoneRoutes } from "./routes/zones.js";
import { courierRoutes } from "./routes/couriers.js";
import { assignmentRoutes } from "./routes/assignments.js";
import { codRoutes } from "./routes/cod.js";
import { settlementRoutes } from "./routes/settlements.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { errorPayload } from "./lib/errors.js";
import { config } from "./lib/config.js";
import { registerGlobalRateLimit } from "./lib/rate-limit.js";
import { prisma } from "./lib/prisma.js";

const SERVICE_NAME = "exo-express-api";
const SERVICE_VERSION = "0.3.0";
const READINESS_TIMEOUT_MS = 2_000;
const startedAt = Date.now();

async function checkDatabase(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const begin = Date.now();
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("database readiness check timed out")), READINESS_TIMEOUT_MS);
      })
    ]);
    return { ok: true, latencyMs: Date.now() - begin };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - begin,
      error: error instanceof Error ? error.message : "unknown database error"
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: config.isTest
      ? false
      : {
          level: config.logLevel,
          // Never let bearer tokens or cookies reach the log stream.
          redact: {
            paths: ["req.headers.authorization", "req.headers.cookie", "res.headers['set-cookie']"],
            censor: "[redacted]"
          }
        },
    // Only trust X-Forwarded-* when explicitly deployed behind a proxy that
    // overwrites the header. A forged header would otherwise defeat per-IP
    // rate limiting and pollute the audit trail.
    trustProxy: config.trustProxy,
    bodyLimit: 1_048_576
  });

  await app.register(helmet, {
    // This service only returns JSON/CSV; a restrictive policy is safe and
    // stops any accidental HTML response from being framed or executed.
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        "default-src": ["'none'"],
        "frame-ancestors": ["'none'"],
        "base-uri": ["'none'"],
        "form-action": ["'none'"]
      }
    },
    crossOriginEmbedderPolicy: false,
    // HSTS only makes sense over TLS in a real deployment. Browsers ignore it
    // on localhost, but keeping it off in development avoids sticky surprises.
    hsts: config.isProduction
      ? { maxAge: 15_552_000, includeSubDomains: true, preload: false }
      : false,
    referrerPolicy: { policy: "no-referrer" },
    xFrameOptions: { action: "deny" }
  });

  await app.register(cors, {
    /**
     * Allowlisted browser origins only. Requests without an Origin header
     * (native courier app, server-to-server, curl) are allowed: CORS is a
     * browser control and cannot protect against non-browser clients anyway.
     */
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (config.corsOrigins.includes(origin)) return callback(null, true);
      return callback(null, false);
    },
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type", "Accept"],
    exposedHeaders: ["X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset", "Retry-After"],
    credentials: false,
    maxAge: 600
  });

  registerGlobalRateLimit(app);

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: "VALIDATION_ERROR",
        message: "Invalid request payload",
        details: error.flatten()
      });
    }

    const statusCode = (error as { statusCode?: number }).statusCode ?? 500;
    if (statusCode >= 500) {
      request.log.error({ err: error }, "request failed");
    } else {
      request.log.warn({ code: (error as { code?: string }).code, statusCode }, "request rejected");
    }

    const payload = errorPayload(error);
    return reply.code(statusCode).send(payload);
  });

  app.setNotFoundHandler((_request, reply) => {
    return reply.code(404).send({ error: "NOT_FOUND", message: "Route not found" });
  });

  /** Liveness: the process is up and can answer HTTP. Never touches the DB. */
  app.get("/health", async () => ({
    status: "ok",
    service: SERVICE_NAME,
    version: SERVICE_VERSION,
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    timestamp: new Date().toISOString()
  }));
  app.get("/health/live", async () => ({ status: "alive", service: SERVICE_NAME }));

  /** Readiness: the API can actually serve queries (database reachable). */
  app.get("/health/ready", async (_request, reply) => {
    const database = await checkDatabase();
    if (!database.ok) {
      return reply.code(503).send({
        status: "unavailable",
        service: SERVICE_NAME,
        checks: { database: "down" },
        timestamp: new Date().toISOString()
      });
    }
    return {
      status: "ready",
      service: SERVICE_NAME,
      version: SERVICE_VERSION,
      checks: { database: "up" },
      databaseLatencyMs: database.latencyMs,
      timestamp: new Date().toISOString()
    };
  });

  app.get("/api/v1", async () => ({
    name: "EXO EXPRESS API",
    version: SERVICE_VERSION,
    phase: "production-readiness"
  }));

  await app.register(authRoutes);
  await app.register(shipmentRoutes);
  await app.register(merchantRoutes);
  await app.register(zoneRoutes);
  await app.register(courierRoutes);
  await app.register(assignmentRoutes);
  await app.register(codRoutes);
  await app.register(settlementRoutes);
  await app.register(dashboardRoutes);

  return app;
}
