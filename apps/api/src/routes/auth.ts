import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { login, logout, revokeAllSessions } from "../lib/auth.js";
import { ApiError } from "../lib/errors.js";
import { loginThrottle } from "../lib/rate-limit.js";
import { authenticateRequest } from "../plugins/auth.js";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200)
});

export async function authRoutes(app: FastifyInstance) {
  app.post("/api/v1/auth/login", async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "VALIDATION_ERROR", message: "Invalid credentials payload", details: parsed.error.flatten() });
    }
    const email = parsed.data.email;

    try {
      loginThrottle.assertAllowed(request.ip, email);
      const result = await login(email, parsed.data.password, {
        userAgent: request.headers["user-agent"],
        ipAddress: request.ip
      });
      loginThrottle.recordSuccess(request.ip, email);
      return reply.send(result);
    } catch (error) {
      if (error instanceof ApiError && error.statusCode === 429) {
        const retryAfter = (error.details as { retryAfterSeconds?: number } | undefined)?.retryAfterSeconds;
        if (retryAfter !== undefined) {
          reply.header("Retry-After", String(retryAfter));
        }
      }
      // Only rejected credentials count towards the brute-force budget. A
      // database or server error must not lock a legitimate account out.
      if (error instanceof ApiError && error.statusCode === 401) {
        loginThrottle.recordFailure(request.ip, email);
      }
      throw error;
    }
  });

  app.post("/api/v1/auth/logout", { preHandler: authenticateRequest }, async (request, reply) => {
    await logout(request.auth!.sessionId);
    return reply.code(204).send();
  });

  app.post("/api/v1/auth/logout-all", { preHandler: authenticateRequest }, async (request, reply) => {
    await revokeAllSessions(request.auth!.user.id);
    return reply.code(204).send();
  });

  app.get("/api/v1/auth/me", { preHandler: authenticateRequest }, async (request) => {
    const { user, permissions } = request.auth!;
    return { user, permissions };
  });
}
