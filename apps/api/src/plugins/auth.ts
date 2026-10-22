import type { FastifyReply, FastifyRequest } from "fastify";
import { authenticate, type AuthContext } from "../lib/auth.js";
import { forbidden, unauthorized } from "../lib/errors.js";
import type { Permission } from "../lib/permissions.js";

declare module "fastify" {
  interface FastifyRequest {
    auth?: AuthContext;
  }
}

function extractToken(request: FastifyRequest): string | undefined {
  const header = request.headers.authorization;
  if (!header) return undefined;
  const [scheme, value] = header.split(" ");
  if (!scheme || scheme.toLowerCase() !== "bearer" || !value) return undefined;
  return value;
}

export async function authenticateRequest(request: FastifyRequest, _reply: FastifyReply) {
  const token = extractToken(request);
  if (!token) throw unauthorized();
  request.auth = await authenticate(token);
}

export function requirePermission(permission: Permission) {
  return async function guard(request: FastifyRequest, reply: FastifyReply) {
    if (!request.auth) throw unauthorized();
    if (!request.auth.permissions.includes(permission)) {
      throw forbidden(`Missing permission: ${permission}`);
    }
    void reply;
  };
}

/**
 * Guard that accepts any one of the given permissions.
 * Used by endpoints that are readable both by back-office roles and by the
 * merchant itself; the row level scoping stays the responsibility of the route.
 */
export function requireAnyPermission(...permissions: Permission[]) {
  return async function guard(request: FastifyRequest, reply: FastifyReply) {
    if (!request.auth) throw unauthorized();
    const granted = permissions.some((permission) =>
      request.auth!.permissions.includes(permission)
    );
    if (!granted) {
      throw forbidden(`Missing permission: one of ${permissions.join(", ")}`);
    }
    void reply;
  };
}
