import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { createApiRateLimiter, createRateLimiter, getClientIp } from "../../server/rate-limit.js";
import { hashToken } from "../../server/auth/api-tokens.js";

const TOO_MANY = { error: "Too many requests. Please try again later." };

/**
 * Build a fake Oak context for rate limit middleware tests
 * @param {Object} options
 */
function fakeContext(
  { ip = "10.0.0.1", forwardedFor = null, authorization = null, sessionUser = null }: {
    ip?: string;
    forwardedFor?: string | null;
    authorization?: string | null;
    sessionUser?: unknown;
  } = {},
) {
  const headers: Record<string, string> = {};
  if (forwardedFor !== null) headers["x-forwarded-for"] = forwardedFor;
  if (authorization !== null) headers.authorization = authorization;

  return {
    request: { ip, headers: new Headers(headers) },
    response: { status: 200, body: null as unknown },
    state: {
      session: {
        // deno-lint-ignore require-await
        get: async (_key: string) => sessionUser,
      },
    },
  };
}

/**
 * Run a middleware n times against fresh contexts, returning the last context
 * @param {Function} middleware
 * @param {Function} makeCtx - Factory producing a fresh context per call
 * @param {number} times
 */
async function hit(
  middleware: (ctx: unknown, next: () => Promise<void>) => Promise<void>,
  makeCtx: () => ReturnType<typeof fakeContext>,
  times: number,
) {
  let ctx = makeCtx();
  let passed = 0;
  for (let i = 0; i < times; i++) {
    ctx = makeCtx();
    await middleware(ctx, () => {
      passed++;
      return Promise.resolve();
    });
  }
  return { ctx, passed };
}

// getClientIp tests

Deno.test("getClientIp: ignores x-forwarded-for unless the proxy is trusted", () => {
  const ctx = fakeContext({ ip: "127.0.0.1", forwardedFor: "203.0.113.9, 70.41.3.18" });
  assertEquals(getClientIp(ctx), "127.0.0.1");
});

Deno.test("getClientIp: behind the proxy, only the LAST x-forwarded-for entry counts", () => {
  // Caddy appends the real client IP; earlier entries are client-supplied
  const ctx = fakeContext({ ip: "127.0.0.1", forwardedFor: "6.6.6.6, 203.0.113.9" });
  assertEquals(getClientIp(ctx, true), "203.0.113.9");
});

Deno.test("getClientIp: falls back to the socket ip", () => {
  assertEquals(getClientIp(fakeContext({ ip: "192.168.1.5" })), "192.168.1.5");
  assertEquals(getClientIp(fakeContext({ ip: "192.168.1.5" }), true), "192.168.1.5");
});

// check() tests

Deno.test("check: allows requests up to the max then denies", () => {
  const limiter = createRateLimiter({ windowMs: 1000, max: 3 });
  assertEquals(limiter.check("a", 0), true);
  assertEquals(limiter.check("a", 0), true);
  assertEquals(limiter.check("a", 0), true);
  assertEquals(limiter.check("a", 0), false);
});

Deno.test("check: keeps denying while the window is still full", () => {
  const limiter = createRateLimiter({ windowMs: 1000, max: 2 });
  limiter.check("a", 0);
  limiter.check("a", 0);
  assertEquals(limiter.check("a", 500), false);
  assertEquals(limiter.check("a", 999), false);
});

Deno.test("check: different keys have independent budgets", () => {
  const limiter = createRateLimiter({ windowMs: 1000, max: 1 });
  assertEquals(limiter.check("a", 0), true);
  assertEquals(limiter.check("b", 0), true);
  assertEquals(limiter.check("a", 0), false);
  assertEquals(limiter.check("b", 0), false);
  assertEquals(limiter.check("c", 0), true);
});

Deno.test("check: the window slides so old entries expire", () => {
  const limiter = createRateLimiter({ windowMs: 1000, max: 2 });
  assertEquals(limiter.check("a", 0), true);
  assertEquals(limiter.check("a", 100), true);
  assertEquals(limiter.check("a", 200), false);
  // The first two hits fall out of the window at t=1101
  assertEquals(limiter.check("a", 1101), true);
});

Deno.test("check: treats a null key as not rate limited", () => {
  const limiter = createRateLimiter({ windowMs: 1000, max: 1 });
  assertEquals(limiter.check(null, 0), true);
  assertEquals(limiter.check(null, 0), true);
  assertEquals(limiter.check(undefined, 0), true);
});

// cleanup() tests

Deno.test("cleanup: removes keys whose hits have all expired", () => {
  const limiter = createRateLimiter({ windowMs: 1000, max: 5 });
  limiter.check("a", 0);
  limiter.check("b", 0);
  assertEquals(limiter.size(), 2);

  limiter.cleanup(500);
  assertEquals(limiter.size(), 2);

  limiter.cleanup(2000);
  assertEquals(limiter.size(), 0);
});

Deno.test("cleanup: keeps keys that are still inside the window", () => {
  const limiter = createRateLimiter({ windowMs: 1000, max: 5 });
  limiter.check("a", 0);
  limiter.check("b", 900);
  limiter.cleanup(1500);
  assertEquals(limiter.size(), 1);
});

// middleware tests

Deno.test("middleware: passes through under the limit", async () => {
  const limiter = createRateLimiter({ windowMs: 60_000, max: 3 });
  const { ctx, passed } = await hit(limiter.middleware, () => fakeContext(), 3);

  assertEquals(passed, 3);
  assertEquals(ctx.response.status, 200);
});

Deno.test("middleware: 429s after max with the shared error body", async () => {
  const limiter = createRateLimiter({ windowMs: 60_000, max: 2 });
  const { ctx, passed } = await hit(limiter.middleware, () => fakeContext(), 3);

  assertEquals(passed, 2);
  assertEquals(ctx.response.status, 429);
  assertEquals(ctx.response.body, TOO_MANY);
});

Deno.test("middleware: keys on the client ip by default", async () => {
  const limiter = createRateLimiter({ windowMs: 60_000, max: 1 });
  await hit(limiter.middleware, () => fakeContext({ ip: "1.1.1.1" }), 1);

  const { ctx: other, passed } = await hit(
    limiter.middleware,
    () => fakeContext({ ip: "2.2.2.2" }),
    1,
  );
  assertEquals(passed, 1);
  assertEquals(other.response.status, 200);

  const { ctx: same } = await hit(limiter.middleware, () => fakeContext({ ip: "1.1.1.1" }), 1);
  assertEquals(same.response.status, 429);
});

Deno.test("middleware: a keyFn returning null skips rate limiting entirely", async () => {
  const limiter = createRateLimiter({ windowMs: 60_000, max: 1, keyFn: () => null });
  const { ctx, passed } = await hit(limiter.middleware, () => fakeContext(), 5);

  assertEquals(passed, 5);
  assertEquals(ctx.response.status, 200);
});

// createApiRateLimiter tests

Deno.test("createApiRateLimiter: allows 120 requests per ip per minute", async () => {
  const api = createApiRateLimiter();
  const { passed, ctx } = await hit(api.middleware, () => fakeContext({ ip: "9.9.9.9" }), 121);

  assertEquals(passed, 120);
  assertEquals(ctx.response.status, 429);
  assertEquals(ctx.response.body, TOO_MANY);
});

Deno.test("createApiRateLimiter: spoofed x-forwarded-for cannot escape the ip bucket", async () => {
  const api = createApiRateLimiter({ ipMax: 2, trustProxy: true });
  let n = 0;
  // Attacker varies the first (client-supplied) entry; Caddy's appended real
  // IP stays the same, so every request must land in the same bucket
  const ctxFor = () => fakeContext({ forwardedFor: `6.6.6.${n++}, 203.0.113.9` });
  const { passed, ctx } = await hit(api.middleware, ctxFor, 3);

  assertEquals(passed, 2);
  assertEquals(ctx.response.status, 429);
});

Deno.test("createApiRateLimiter: token requests get a 300/min budget", async () => {
  // Raise the ip ceiling so the token limit is the one under test
  const api = createApiRateLimiter({ ipMax: 10_000 });
  const ctxFor = () => fakeContext({ authorization: "Bearer nt_machine" });
  const { passed, ctx } = await hit(api.middleware, ctxFor, 301);

  assertEquals(passed, 300);
  assertEquals(ctx.response.status, 429);
});

Deno.test("createApiRateLimiter: token buckets are keyed by hash, not raw token", async () => {
  const api = createApiRateLimiter({ ipMax: 10_000, tokenMax: 1 });
  await hit(api.middleware, () => fakeContext({ authorization: "Bearer nt_one" }), 1);

  const { ctx: second } = await hit(
    api.middleware,
    () => fakeContext({ authorization: "Bearer nt_two" }),
    1,
  );
  assertEquals(second.response.status, 200);

  const { ctx: repeat } = await hit(
    api.middleware,
    () => fakeContext({ authorization: "Bearer nt_one" }),
    1,
  );
  assertEquals(repeat.response.status, 429);

  const keys = [...api.limiters.token.keys()];
  assertEquals(keys.includes("nt_one"), false, "raw token must never be used as a bucket key");
  assert(keys.includes(await hashToken("nt_one")), "expected the sha256 digest as the bucket key");
});

Deno.test("createApiRateLimiter: session users get a 120/min budget keyed by user id", async () => {
  const api = createApiRateLimiter({ ipMax: 10_000 });
  const ctxFor = () => fakeContext({ sessionUser: { id: 42 } });
  const { passed, ctx } = await hit(api.middleware, ctxFor, 121);

  assertEquals(passed, 120);
  assertEquals(ctx.response.status, 429);

  // A different user is unaffected
  const { ctx: other } = await hit(
    api.middleware,
    () => fakeContext({ sessionUser: { id: 43 } }),
    1,
  );
  assertEquals(other.response.status, 200);
});

Deno.test("createApiRateLimiter: anonymous requests are only limited by ip", async () => {
  const api = createApiRateLimiter({ ipMax: 2 });
  const { passed, ctx } = await hit(api.middleware, () => fakeContext(), 3);

  assertEquals(passed, 2);
  assertEquals(ctx.response.status, 429);
  assertEquals(api.limiters.user.size(), 0);
  assertEquals(api.limiters.token.size(), 0);
});

Deno.test("createApiRateLimiter: a token request is not also charged to the user bucket", async () => {
  const api = createApiRateLimiter({ ipMax: 10_000 });
  await hit(
    api.middleware,
    () => fakeContext({ authorization: "Bearer nt_x", sessionUser: { id: 5 } }),
    1,
  );

  assertEquals(api.limiters.user.size(), 0);
  assertEquals(api.limiters.token.size(), 1);
});

Deno.test("createApiRateLimiter: cleanup clears all three buckets", async () => {
  const api = createApiRateLimiter();
  await hit(api.middleware, () => fakeContext({ sessionUser: { id: 1 } }), 1);
  await hit(api.middleware, () => fakeContext({ authorization: "Bearer nt_y" }), 1);

  assert(api.limiters.ip.size() > 0);
  assert(api.limiters.user.size() > 0);
  assert(api.limiters.token.size() > 0);

  api.cleanup(Date.now() + 10 * 60 * 1000);

  assertEquals(api.limiters.ip.size(), 0);
  assertEquals(api.limiters.user.size(), 0);
  assertEquals(api.limiters.token.size(), 0);
});
