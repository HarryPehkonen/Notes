import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { PostgresSessionStore } from "../../server/session-store.js";

/**
 * Fake deno-postgres Pool capturing every query so tests can assert on the
 * SQL the store actually runs.
 */
function fakePool(rows: unknown[] = []) {
  const calls: { sql: string; params: unknown[] }[] = [];
  const pool = {
    connect() {
      return Promise.resolve({
        queryObject(sql: string, params: unknown[]) {
          calls.push({ sql, params });
          return Promise.resolve({ rows });
        },
        release() {},
      });
    },
  };
  return { calls, pool };
}

/** Collapse whitespace so SQL assertions survive reformatting */
function flat(sql: string) {
  return sql.replace(/\s+/g, " ").trim();
}

// Sliding sessions (audit #28): activity must push expiry out

Deno.test("persistSessionData: bumps last_seen_at in the same UPDATE that saves data", async () => {
  const { calls, pool } = fakePool();
  const store = new PostgresSessionStore(pool);

  await store.persistSessionData("sid-1", { user: { id: 7 } });

  assertEquals(calls.length, 1);
  const sql = flat(calls[0].sql);
  assert(
    sql.includes("last_seen_at = CURRENT_TIMESTAMP"),
    `expected the per-request UPDATE to slide last_seen_at, got: ${sql}`,
  );
  assertEquals(calls[0].params, [JSON.stringify({ user: { id: 7 } }), "sid-1"]);
});

Deno.test("deleteExpiredSessions: expires on last activity, not creation time", async () => {
  const { calls, pool } = fakePool([{ id: "a" }, { id: "b" }]);
  const store = new PostgresSessionStore(pool);

  const deleted = await store.deleteExpiredSessions(7);

  assertEquals(deleted, 2);
  const sql = flat(calls[0].sql);
  assert(
    sql.includes("COALESCE(last_seen_at, created_at)"),
    `expected expiry keyed on last activity (created_at only as fallback), got: ${sql}`,
  );
  assertEquals(calls[0].params, [7]);
});

Deno.test("deleteExpiredSessions: defaults to a 7 day idle window", async () => {
  const { calls, pool } = fakePool([]);
  const store = new PostgresSessionStore(pool);

  const deleted = await store.deleteExpiredSessions();

  assertEquals(deleted, 0);
  assertEquals(calls[0].params, [7]);
});
