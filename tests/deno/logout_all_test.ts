import {
  assert,
  assertEquals,
  assertMatch,
  assertStringIncludes,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { testing } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { PostgresSessionStore } from "../../server/session-store.js";
import { createAuthRouter } from "../../server/api/auth.js";

/**
 * A route as exposed by Oak's Router iterator
 */
type RouteLike = {
  path: string;
  methods: string[];
  middleware: Array<(ctx: unknown) => Promise<void>>;
};

/**
 * Build a fake pg pool recording every query issued through it
 * @param {Array|Error} results - Queued result sets, or an error to throw
 */
function fakePool(results: Array<{ rows: unknown[] }> | Error = []) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  let released = 0;
  return {
    calls,
    releases: () => released,
    // deno-lint-ignore require-await
    connect: async () => ({
      // deno-lint-ignore require-await
      queryObject: async (sql: string, params: unknown[] = []) => {
        calls.push({ sql, params });
        if (results instanceof Error) throw results;
        return results.shift() ?? { rows: [] };
      },
      release: () => released++,
    }),
  };
}

// deleteAllSessionsForUser tests

Deno.test("deleteAllSessionsForUser: matches sessions by JSONB containment on user.id", async () => {
  const pool = fakePool([{ rows: [{ id: "s1" }, { id: "s2" }] }]);
  const store = new PostgresSessionStore(pool);

  await store.deleteAllSessionsForUser(42);

  assertEquals(pool.calls.length, 1);
  const { sql, params } = pool.calls[0];
  assertMatch(sql, /DELETE FROM sessions/i);
  assertMatch(sql, /data::jsonb @> \$1::jsonb/);
  assertEquals(params, [JSON.stringify({ user: { id: 42 } })]);
});

Deno.test("deleteAllSessionsForUser: returns the number of deleted sessions", async () => {
  const pool = fakePool([{ rows: [{ id: "s1" }, { id: "s2" }, { id: "s3" }] }]);
  const store = new PostgresSessionStore(pool);

  assertEquals(await store.deleteAllSessionsForUser(42), 3);
});

Deno.test("deleteAllSessionsForUser: returns 0 when the user has no sessions", async () => {
  const store = new PostgresSessionStore(fakePool([{ rows: [] }]));
  assertEquals(await store.deleteAllSessionsForUser(42), 0);
});

Deno.test("deleteAllSessionsForUser: only casts rows that look like JSON objects", async () => {
  const pool = fakePool([{ rows: [] }]);
  await new PostgresSessionStore(pool).deleteAllSessionsForUser(1);

  // sessions.data is TEXT and may hold shapes other than {"user":{...}};
  // an unguarded ::jsonb cast on a non-JSON row would abort the whole DELETE.
  const sql = pool.calls[0].sql;
  assertStringIncludes(sql, "MATERIALIZED");
  assertMatch(sql, /data LIKE '\{%'/);
});

Deno.test("deleteAllSessionsForUser: releases the pooled connection", async () => {
  const pool = fakePool([{ rows: [] }]);
  await new PostgresSessionStore(pool).deleteAllSessionsForUser(42);
  assertEquals(pool.releases(), 1);
});

Deno.test("deleteAllSessionsForUser: does nothing without a user id", async () => {
  const pool = fakePool([{ rows: [] }]);
  const store = new PostgresSessionStore(pool);

  assertEquals(await store.deleteAllSessionsForUser(undefined), 0);
  assertEquals(await store.deleteAllSessionsForUser(null), 0);
  assertEquals(pool.calls.length, 0);
});

// POST /api/auth/logout-all tests

/**
 * Build a fake session store recording deleteAllSessionsForUser calls
 * @param {number} deleted - Number of sessions the store reports deleting
 */
function fakeSessionStore(deleted = 2) {
  const calls: unknown[] = [];
  return {
    calls,
    // deno-lint-ignore require-await
    deleteAllSessionsForUser: async (userId: unknown) => {
      calls.push(userId);
      return deleted;
    },
  };
}

/**
 * Build a fake db whose query() returns queued results and records calls
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
 * Pull the POST /logout-all handler out of the auth router
 * @param {Object} deps - Dependencies passed to createAuthRouter
 */
function logoutAllHandler(deps: Record<string, unknown>) {
  const router = createAuthRouter(deps) as unknown as Iterable<RouteLike>;
  for (const route of router) {
    if (route.path === "/logout-all" && route.methods.includes("POST")) {
      return route.middleware[route.middleware.length - 1];
    }
  }
  throw new Error("No POST /logout-all route registered");
}

/**
 * Build a mock Oak context for POST /api/auth/logout-all
 * @param {Object} options
 */
function logoutAllContext(
  { user = { id: 7 }, db = fakeDb(), authHandler = { revokeToken: () => Promise.resolve(true) } }: {
    user?: unknown;
    db?: unknown;
    authHandler?: unknown;
  } = {},
) {
  const ctx = testing.createMockContext({ method: "POST", path: "/logout-all" });
  const deleted: boolean[] = [];
  const state = ctx.state as unknown as Record<string, unknown>;
  state.user = user;
  state.db = db;
  state.authHandler = authHandler;
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

Deno.test("POST /logout-all: deletes every session belonging to the user", async () => {
  const sessionStore = fakeSessionStore();
  const { ctx } = logoutAllContext();

  await logoutAllHandler({ sessionStore })(ctx);

  assertEquals(sessionStore.calls, [7]);
});

Deno.test("POST /logout-all: clears the current session too", async () => {
  const { ctx, sessionDeletions } = logoutAllContext();

  await logoutAllHandler({ sessionStore: fakeSessionStore() })(ctx);

  assertEquals(sessionDeletions.length, 1);
});

Deno.test("POST /logout-all: returns the success shape", async () => {
  const { ctx } = logoutAllContext();

  await logoutAllHandler({ sessionStore: fakeSessionStore() })(ctx);

  assertEquals(ctx.response.status, 200);
  assertEquals(ctx.response.body, { success: true, redirectTo: "/" });
});

Deno.test("POST /logout-all: returns 401 when unauthenticated", async () => {
  const sessionStore = fakeSessionStore();
  const { ctx, sessionDeletions } = logoutAllContext({ user: null });

  await logoutAllHandler({ sessionStore })(ctx);

  assertEquals(ctx.response.status, 401);
  assertEquals(ctx.response.body, {
    error: "Authentication required",
    redirectTo: "/auth/login",
  });
  assertEquals(sessionStore.calls.length, 0);
  assertEquals(sessionDeletions.length, 0);
});

Deno.test("POST /logout-all: revokes the Google token for the user", async () => {
  const db = fakeDb([{ rows: [{ access_token: "ya29.stored" }] }]);
  const revoked: string[] = [];
  const authHandler = {
    // deno-lint-ignore require-await
    revokeToken: async (token: string) => {
      revoked.push(token);
      return true;
    },
  };
  const { ctx } = logoutAllContext({ db, authHandler });

  await logoutAllHandler({ sessionStore: fakeSessionStore() })(ctx);
  // Revocation is fire-and-forget; let the microtask queue drain
  await new Promise((resolve) => setTimeout(resolve, 0));

  assertEquals(revoked, ["ya29.stored"]);
  assertMatch(db.calls[0].sql, /FROM auth_providers/i);
  assertEquals(db.calls[0].params, [7]);
});

Deno.test("POST /logout-all: a failing Google revoke does not fail the logout", async () => {
  const db = fakeDb([{ rows: [{ access_token: "ya29.stored" }] }]);
  const authHandler = { revokeToken: () => Promise.reject(new Error("google is down")) };
  const { ctx, sessionDeletions } = logoutAllContext({ db, authHandler });

  await logoutAllHandler({ sessionStore: fakeSessionStore() })(ctx);
  await new Promise((resolve) => setTimeout(resolve, 0));

  assertEquals(ctx.response.status, 200);
  assertEquals(ctx.response.body, { success: true, redirectTo: "/" });
  assertEquals(sessionDeletions.length, 1);
});

Deno.test("POST /logout-all: the auth router mounts exactly one route", () => {
  const router = createAuthRouter({ sessionStore: fakeSessionStore() }) as unknown as Iterable<
    RouteLike
  >;
  const paths = [...router].map((route) => `${route.methods.join(",")} ${route.path}`);
  assert(
    paths.some((p) => p.includes("POST") && p.endsWith("/logout-all")),
    `expected a POST /logout-all route, got ${JSON.stringify(paths)}`,
  );
});
