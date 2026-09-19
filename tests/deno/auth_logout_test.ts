/**
 * POST /api/auth/logout - logging out of this device.
 *
 * Found missing by the route-contract test on 2026-09-18: the client's
 * `logout()` posts to `/api/auth/logout`, while the only handler was the
 * page-level `/auth/logout` in main.js. The request 404'd, the client redirected
 * to `/login` regardless, and the still-valid session bounced the user straight
 * back into the app - a "Log out" button that quietly did nothing.
 */
import { assertEquals, assertMatch } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { testing } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { createAuthRouter } from "../../server/api/auth.js";

/**
 * A route as exposed by Oak's Router iterator
 */
type RouteLike = {
  path: string;
  methods: string[];
  middleware: Array<(ctx: unknown) => Promise<void>>;
};

const authRoutes =
  () => [...createAuthRouter({ sessionStore: {} }) as unknown as Iterable<RouteLike>];

/**
 * Pull the POST /logout handler out of the auth router
 */
function logoutHandler() {
  for (const route of authRoutes()) {
    if (route.path === "/logout" && route.methods.includes("POST")) {
      return route.middleware[route.middleware.length - 1];
    }
  }
  throw new Error("No POST /logout route registered");
}

/**
 * A fake db whose query() returns queued results and records calls
 * @param {Array} results
 */
function fakeDb(results: Array<{ rows: unknown[] }> = []) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  return {
    calls,
    // deno-lint-ignore require-await
    query: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      return results.shift() ?? { rows: [] };
    },
  };
}

/**
 * Build a mock Oak context for POST /api/auth/logout
 * @param {Object} options
 */
function logoutContext(
  { user = { id: 7 }, db = fakeDb(), authHandler = { revokeToken: () => Promise.resolve(true) } }: {
    user?: unknown;
    db?: unknown;
    authHandler?: unknown;
  } = {},
) {
  const ctx = testing.createMockContext({ method: "POST", path: "/logout" });
  const state = ctx.state as unknown as Record<string, unknown>;
  state.user = user;
  state.db = db;
  state.authHandler = authHandler;
  const deleted: boolean[] = [];
  state.session = {
    // deno-lint-ignore require-await
    get: async (_key: string) => user,
    // deno-lint-ignore require-await
    deleteSession: async () => {
      deleted.push(true);
    },
  };
  return { ctx, sessionDeletions: deleted };
}

Deno.test("POST /api/auth/logout: the route exists, alongside logout-all", () => {
  const paths = authRoutes().map((route) => `${route.methods.join(",")} ${route.path}`).sort();

  assertEquals(paths, ["POST /logout", "POST /logout-all"]);
});

Deno.test("POST /api/auth/logout: drops the session making the request", async () => {
  const { ctx, sessionDeletions } = logoutContext();

  await logoutHandler()(ctx);

  assertEquals(sessionDeletions.length, 1, "this device's session must be gone");
  assertEquals(ctx.response.status, 200);
  assertEquals(ctx.response.body, { success: true, redirectTo: "/" });
});

Deno.test("POST /api/auth/logout: 401 when unauthenticated, and nothing is deleted", async () => {
  const { ctx, sessionDeletions } = logoutContext({ user: null });

  await logoutHandler()(ctx);

  assertEquals(ctx.response.status, 401);
  assertEquals(ctx.response.body, {
    error: "Authentication required",
    redirectTo: "/auth/login",
  });
  assertEquals(sessionDeletions.length, 0);
});

Deno.test("POST /api/auth/logout: revokes the Google token for the user", async () => {
  const db = fakeDb([{ rows: [{ access_token: "ya29.stored" }] }]);
  const revoked: string[] = [];
  const authHandler = {
    // deno-lint-ignore require-await
    revokeToken: async (token: string) => {
      revoked.push(token);
      return true;
    },
  };
  const { ctx } = logoutContext({ db, authHandler });

  await logoutHandler()(ctx);
  // Revocation is fire-and-forget; let the microtask queue drain
  await new Promise((resolve) => setTimeout(resolve, 0));

  assertEquals(revoked, ["ya29.stored"]);
  assertMatch(db.calls[0].sql, /FROM auth_providers/i);
  assertEquals(db.calls[0].params, [7]);
});

Deno.test("POST /api/auth/logout: a failing Google revoke does not fail the logout", async () => {
  const db = fakeDb([{ rows: [{ access_token: "ya29.stored" }] }]);
  const authHandler = { revokeToken: () => Promise.reject(new Error("google is down")) };
  const { ctx, sessionDeletions } = logoutContext({ db, authHandler });

  await logoutHandler()(ctx);
  await new Promise((resolve) => setTimeout(resolve, 0));

  assertEquals(ctx.response.status, 200);
  assertEquals(ctx.response.body, { success: true, redirectTo: "/" });
  assertEquals(sessionDeletions.length, 1);
});
