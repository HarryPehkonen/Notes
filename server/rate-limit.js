/**
 * In-memory sliding-window rate limiting
 *
 * Same Map-of-timestamps pattern the auth endpoints have always used, pulled
 * out into a reusable, testable module so the API can be limited too. State is
 * per-process: good enough for a single-instance self-hosted deployment.
 */

import { extractBearerToken, hashToken } from "./auth/api-tokens.js";

/** Body returned on every 429, matching the existing auth limiter */
const TOO_MANY_BODY = { error: "Too many requests. Please try again later." };

/** Default window for every limiter here */
const DEFAULT_WINDOW_MS = 60 * 1000;

/**
 * Resolve the real client IP, honouring the reverse proxy's header
 * @param {Object} ctx - Oak context
 * @returns {string} Client IP address
 */
export function getClientIp(ctx) {
  const forwarded = ctx.request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return ctx.request.ip;
}

/**
 * Create a sliding-window rate limiter
 *
 * @param {Object} options
 * @param {number} [options.windowMs] - Width of the sliding window
 * @param {number} [options.max] - Requests allowed per key per window
 * @param {Function} [options.keyFn] - Derives the bucket key from an Oak ctx.
 *   Returning null/undefined means "do not limit this request".
 * @returns {{
 *   check: Function, cleanup: Function, middleware: Function,
 *   size: Function, keys: Function
 * }}
 */
export function createRateLimiter(
  { windowMs = DEFAULT_WINDOW_MS, max = 60, keyFn = null } = {},
) {
  /** @type {Map<string, number[]>} key -> hit timestamps inside the window */
  const buckets = new Map();

  /**
   * Record a hit and report whether it is allowed
   * @param {string|null} key - Bucket key; null means unlimited
   * @param {number} [now] - Timestamp, injectable for tests
   * @returns {boolean} True when the request is under the limit
   */
  function check(key, now = Date.now()) {
    if (key === null || key === undefined) return true;

    const windowStart = now - windowMs;
    const hits = (buckets.get(key) || []).filter((t) => t > windowStart);

    if (hits.length >= max) {
      // Keep the pruned list so the bucket does not grow while blocked
      buckets.set(key, hits);
      return false;
    }

    hits.push(now);
    buckets.set(key, hits);
    return true;
  }

  /**
   * Drop keys whose hits have all aged out of the window
   * @param {number} [now] - Timestamp, injectable for tests
   */
  function cleanup(now = Date.now()) {
    const windowStart = now - windowMs;
    for (const [key, hits] of buckets) {
      const fresh = hits.filter((t) => t > windowStart);
      if (fresh.length === 0) {
        buckets.delete(key);
      } else {
        buckets.set(key, fresh);
      }
    }
  }

  /**
   * Oak middleware form of the limiter
   * @param {Object} ctx - Oak context
   * @param {Function} next - Next middleware
   */
  async function middleware(ctx, next) {
    const key = keyFn ? await keyFn(ctx) : getClientIp(ctx) || "unknown";

    if (!check(key)) {
      ctx.response.status = 429;
      ctx.response.body = { ...TOO_MANY_BODY };
      return;
    }

    await next();
  }

  return {
    check,
    cleanup,
    middleware,
    size: () => buckets.size,
    keys: () => buckets.keys(),
  };
}

/**
 * Build the composite limiter guarding `/api/*`
 *
 * Three independent budgets are charged per request:
 * - per IP, for everyone (catches unauthenticated floods)
 * - per API token, for machine clients (keyed by the token's SHA-256 digest,
 *   never the plaintext, so a bucket key can safely reach a log)
 * - per user id, for browser sessions
 *
 * Limits are deliberately generous; the owner's own machine client must never
 * trip them under normal use.
 * @param {Object} options
 * @param {number} [options.windowMs]
 * @param {number} [options.ipMax]
 * @param {number} [options.tokenMax]
 * @param {number} [options.userMax]
 * @returns {{ middleware: Function, cleanup: Function, limiters: Object }}
 */
export function createApiRateLimiter(
  { windowMs = DEFAULT_WINDOW_MS, ipMax = 120, tokenMax = 300, userMax = 120 } = {},
) {
  const ip = createRateLimiter({ windowMs, max: ipMax });
  const token = createRateLimiter({ windowMs, max: tokenMax });
  const user = createRateLimiter({ windowMs, max: userMax });

  /**
   * @param {Object} ctx - Oak context
   * @param {Function} next - Next middleware
   */
  async function middleware(ctx, next) {
    /** @param {Object} c - Oak context to reject */
    const deny = (c) => {
      c.response.status = 429;
      c.response.body = { ...TOO_MANY_BODY };
    };

    if (!ip.check(getClientIp(ctx) || "unknown")) {
      deny(ctx);
      return;
    }

    const bearer = extractBearerToken(ctx.request);
    if (bearer) {
      // Hash before bucketing: the plaintext token never becomes a map key
      if (!token.check(await hashToken(bearer))) {
        deny(ctx);
        return;
      }
    } else {
      const sessionUser = await ctx.state.session?.get("user");
      if (sessionUser?.id !== undefined && !user.check(`user:${sessionUser.id}`)) {
        deny(ctx);
        return;
      }
    }

    await next();
  }

  /** @param {number} [now] - Timestamp, injectable for tests */
  function cleanup(now = Date.now()) {
    ip.cleanup(now);
    token.cleanup(now);
    user.cleanup(now);
  }

  return { middleware, cleanup, limiters: { ip, token, user } };
}
