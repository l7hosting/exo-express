import type { FastifyInstance } from "fastify";
import { ApiError } from "./errors.js";
import { config } from "./config.js";

export const tooManyRequests = (message: string, retryAfterSeconds: number) =>
  new ApiError(429, "RATE_LIMITED", message, { retryAfterSeconds });

export interface LimiterResult {
  allowed: boolean;
  remaining: number;
  /** Unix epoch (ms) at which the current window resets. */
  resetAt: number;
  retryAfterSeconds: number;
}

/**
 * Process-local fixed-window limiter.
 *
 * The API is deployed as a single Node process today; the limiter therefore
 * lives in memory. If the API is scaled horizontally the limiter must be moved
 * to a shared store (see docs/DEPLOYMENT.md, "Horizontal scaling"). Keeping it
 * dependency-free means a limiter outage can never lock the API out.
 */
export class FixedWindowLimiter {
  private readonly buckets = new Map<string, { count: number; resetAt: number }>();
  private operations = 0;

  constructor(private readonly options: { max: number; windowMs: number }) {}

  consume(key: string, now = Date.now()): LimiterResult {
    this.maybeSweep(now);

    const existing = this.buckets.get(key);
    const bucket =
      existing && existing.resetAt > now
        ? existing
        : { count: 0, resetAt: now + this.options.windowMs };

    bucket.count += 1;
    this.buckets.set(key, bucket);

    const allowed = bucket.count <= this.options.max;
    return {
      allowed,
      remaining: Math.max(0, this.options.max - bucket.count),
      resetAt: bucket.resetAt,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))
    };
  }

  reset(key: string): void {
    this.buckets.delete(key);
  }

  /** Current counter, without incrementing it. */
  peek(key: string, now = Date.now()): LimiterResult {
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      return { allowed: true, remaining: this.options.max, resetAt: now + this.options.windowMs, retryAfterSeconds: 0 };
    }
    return {
      allowed: bucket.count < this.options.max,
      remaining: Math.max(0, this.options.max - bucket.count),
      resetAt: bucket.resetAt,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))
    };
  }

  get size(): number {
    return this.buckets.size;
  }

  private maybeSweep(now: number): void {
    this.operations += 1;
    if (this.operations % 500 !== 0 && this.buckets.size < 10_000) return;
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
  }
}

/**
 * Brute-force protection for the login endpoint.
 *
 * Two independent counters:
 *  - per IP: every failed attempt (success does not reset it, otherwise an
 *    attacker with one valid account could reset the shield at will);
 *  - per IP + account: failed attempts, reset after a successful login so a
 *    legitimate user who mistyped their password is not punished.
 */
export class LoginThrottle {
  private readonly perIp: FixedWindowLimiter;
  private readonly perAccount: FixedWindowLimiter;

  constructor(
    private readonly options: {
      windowMs: number;
      ipMax: number;
      accountMax: number;
    }
  ) {
    this.perIp = new FixedWindowLimiter({ max: options.ipMax, windowMs: options.windowMs });
    this.perAccount = new FixedWindowLimiter({ max: options.accountMax, windowMs: options.windowMs });
  }

  /** Throws a 429 when the caller is already over either limit. */
  assertAllowed(ip: string, email: string, now = Date.now()): void {
    const accountKey = this.accountKey(ip, email);
    const account = this.perAccount.peek(accountKey, now);
    if (!account.allowed) {
      throw tooManyRequests(
        "Too many failed sign-in attempts for this account. Try again later.",
        account.retryAfterSeconds
      );
    }
    const address = this.perIp.peek(this.ipKey(ip), now);
    if (!address.allowed) {
      throw tooManyRequests(
        "Too many failed sign-in attempts from this network. Try again later.",
        address.retryAfterSeconds
      );
    }
  }

  recordFailure(ip: string, email: string, now = Date.now()): void {
    this.perIp.consume(this.ipKey(ip), now);
    this.perAccount.consume(this.accountKey(ip, email), now);
  }

  recordSuccess(ip: string, email: string, now = Date.now()): void {
    // Only the account counter is cleared; the IP counter keeps track of
    // failures across all accounts on the network.
    void ip;
    void now;
    this.perAccount.reset(this.accountKey(ip, email));
  }

  private ipKey(ip: string): string {
    return `login:ip:${ip}`;
  }

  private accountKey(ip: string, email: string): string {
    return `login:account:${ip}:${email.trim().toLowerCase()}`;
  }
}

export const loginThrottle = new LoginThrottle({
  windowMs: config.rateLimit.loginWindowMs,
  ipMax: config.rateLimit.loginIpMax,
  accountMax: config.rateLimit.loginAccountMax
});

const HEALTH_PATHS = new Set(["/health", "/health/live", "/health/ready"]);

function isHealthPath(url: string): boolean {
  const path = url.split("?")[0];
  return HEALTH_PATHS.has(path);
}

/**
 * Global request limiter. Health endpoints are exempt so a Kubernetes probe
 * can never be throttled.
 */
export function registerGlobalRateLimit(
  app: FastifyInstance,
  options: { enabled?: boolean; max?: number; windowMs?: number } = {}
): void {
  const enabled = options.enabled ?? config.rateLimit.enabled;
  if (!enabled) return;

  const max = options.max ?? config.rateLimit.max;
  const windowMs = options.windowMs ?? config.rateLimit.windowMs;
  const limiter = new FixedWindowLimiter({ max, windowMs });

  app.addHook("onRequest", async (request, reply) => {
    if (isHealthPath(request.url)) return;

    const result = limiter.consume(request.ip);
    reply.header("X-RateLimit-Limit", String(max));
    reply.header("X-RateLimit-Remaining", String(result.remaining));
    reply.header("X-RateLimit-Reset", String(Math.ceil(result.resetAt / 1000)));

    if (!result.allowed) {
      reply.header("Retry-After", String(result.retryAfterSeconds));
      throw tooManyRequests("Too many requests. Try again shortly.", result.retryAfterSeconds);
    }
  });
}
