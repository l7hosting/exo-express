import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { UserRole } from "@prisma/client";
import { prisma } from "./prisma.js";
import { hashPassword, verifyPassword } from "./password.js";
import { unauthorized, forbidden } from "./errors.js";
import { permissionsFor, type Permission } from "./permissions.js";
import { config } from "./config.js";

/**
 * Pre-computed scrypt hash used to keep the cost of a login for an unknown
 * email identical to a login for a known email. Without it, response timing
 * would reveal which addresses have accounts (user enumeration).
 */
const DUMMY_PASSWORD_HASH =
  "scrypt$bbdf7c146765e3f38c3fbd2ba9eb374a$2d921f60317a9176be7fa77a0956d1047b4e2c52986b717cd0d3f3b294cdb6c1808c666daa9df4b8f2f16ef1c33c21b5976b8212201b3e20e7eebf08cc63e0e";

export interface AuthenticatedUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  merchantId: string | null;
}

export interface AuthContext {
  user: AuthenticatedUser;
  permissions: Permission[];
  sessionId: string;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateSessionToken(): string {
  return randomBytes(48).toString("base64url");
}

export async function createSession(userId: string, meta: { userAgent?: string; ipAddress?: string } = {}) {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + config.sessionTtlDays * 24 * 60 * 60 * 1000);
  const session = await prisma.session.create({
    data: {
      userId,
      refreshTokenHash: hashToken(token),
      expiresAt,
      userAgent: meta.userAgent ?? null,
      ipAddress: meta.ipAddress ?? null
    }
  });
  return { session, token };
}

export async function revokeSession(sessionId: string) {
  await prisma.session.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date() }
  });
}

export async function logout(sessionId: string) {
  await revokeSession(sessionId);
}

export async function revokeAllSessions(userId: string) {
  await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() }
  });
}

export async function authenticate(token: string): Promise<AuthContext> {
  if (!token) throw unauthorized();
  const session = await prisma.session.findUnique({
    where: { refreshTokenHash: hashToken(token) },
    include: {
      user: {
        include: { merchantUsers: { select: { merchantId: true } } }
      }
    }
  });
  if (!session || session.revokedAt || session.expiresAt.getTime() < Date.now()) {
    throw unauthorized("Session expired or revoked");
  }
  if (!session.user.isActive) throw forbidden("Account deactivated");

  const user: AuthenticatedUser = {
    id: session.user.id,
    email: session.user.email,
    fullName: session.user.fullName,
    role: session.user.role,
    merchantId: session.user.merchantUsers[0]?.merchantId ?? null
  };
  return {
    user,
    permissions: permissionsFor(user.role as Parameters<typeof permissionsFor>[0]),
    sessionId: session.id
  };
}

export async function login(email: string, password: string, meta: { userAgent?: string; ipAddress?: string } = {}) {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });

  // Always run one scrypt verification, even for unknown emails, so the
  // response time does not disclose whether the account exists.
  const valid = await verifyPassword(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
  if (!user || !valid) throw unauthorized("Invalid credentials");

  // A disabled account is reported exactly like bad credentials: the caller
  // must not be able to probe for suspended accounts.
  if (!user.isActive) throw unauthorized("Invalid credentials");

  const { session, token } = await createSession(user.id, meta);
  await prisma.auditLog.create({
    data: { actorId: user.id, action: "AUTH_LOGIN", entity: "Session", entityId: session.id }
  });

  return {
    token,
    expiresAt: session.expiresAt,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role
    }
  };
}

export async function registerUser(input: {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
  role: UserRole;
  merchantId?: string;
}) {
  const existing = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
  if (existing) throw forbidden("Email already registered");

  const passwordHash = await hashPassword(input.password);
  const user = await prisma.user.create({
    data: {
      email: input.email.toLowerCase(),
      passwordHash,
      fullName: input.fullName,
      phone: input.phone ?? null,
      role: input.role,
      ...(input.merchantId
        ? { merchantUsers: { create: { merchantId: input.merchantId } } }
        : {})
    },
    select: { id: true, email: true, fullName: true, phone: true, role: true, isActive: true, createdAt: true }
  });
  await prisma.auditLog.create({
    data: { action: "USER_CREATED", entity: "User", entityId: user.id, metadata: { role: user.role } }
  });
  return user;
}
