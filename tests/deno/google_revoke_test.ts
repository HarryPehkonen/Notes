import { assertEquals, assertMatch } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { revokeGoogleToken } from "../../server/auth/auth-handler.js";

/**
 * Build a fake db whose query() returns queued results and records calls
 * @param {Array|Error} results - Queued result sets, or an error to throw
 */
function fakeDb(results: Array<{ rows: unknown[] }> | Error) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  return {
    calls,
    // deno-lint-ignore require-await
    query: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (results instanceof Error) throw results;
      return results.shift() ?? { rows: [] };
    },
  };
}

/**
 * Build a fake auth handler recording revokeToken calls
 * @param {boolean|Error} outcome - Return value, or an error to throw
 */
function fakeAuthHandler(outcome: boolean | Error = true) {
  const revoked: unknown[] = [];
  return {
    revoked,
    // deno-lint-ignore require-await
    revokeToken: async (token: string) => {
      revoked.push(token);
      if (outcome instanceof Error) throw outcome;
      return outcome;
    },
  };
}

Deno.test("revokeGoogleToken: revokes the stored access token", async () => {
  const db = fakeDb([{ rows: [{ access_token: "ya29.stored" }] }]);
  const auth = fakeAuthHandler(true);

  assertEquals(await revokeGoogleToken(db, auth, 7), true);
  assertEquals(auth.revoked, ["ya29.stored"]);
});

Deno.test("revokeGoogleToken: looks the token up by user id and provider", async () => {
  const db = fakeDb([{ rows: [{ access_token: "ya29.stored" }] }]);

  await revokeGoogleToken(db, fakeAuthHandler(), 7);

  assertEquals(db.calls.length, 1);
  assertMatch(db.calls[0].sql, /FROM auth_providers/i);
  assertMatch(db.calls[0].sql, /provider = 'google'/i);
  assertEquals(db.calls[0].params, [7]);
});

Deno.test("revokeGoogleToken: skips silently when there is no provider row", async () => {
  const db = fakeDb([{ rows: [] }]);
  const auth = fakeAuthHandler();

  assertEquals(await revokeGoogleToken(db, auth, 7), false);
  assertEquals(auth.revoked, []);
});

Deno.test("revokeGoogleToken: skips when the row has no access token", async () => {
  const db = fakeDb([{ rows: [{ access_token: null }] }]);
  const auth = fakeAuthHandler();

  assertEquals(await revokeGoogleToken(db, auth, 7), false);
  assertEquals(auth.revoked, []);
});

Deno.test("revokeGoogleToken: swallows revoke errors instead of throwing", async () => {
  const db = fakeDb([{ rows: [{ access_token: "ya29.stored" }] }]);
  const auth = fakeAuthHandler(new Error("google is down"));

  assertEquals(await revokeGoogleToken(db, auth, 7), false);
  assertEquals(auth.revoked, ["ya29.stored"]);
});

Deno.test("revokeGoogleToken: swallows database errors instead of throwing", async () => {
  const db = fakeDb(new Error("connection refused"));
  const auth = fakeAuthHandler();

  assertEquals(await revokeGoogleToken(db, auth, 7), false);
  assertEquals(auth.revoked, []);
});

Deno.test("revokeGoogleToken: reports a rejected revoke without throwing", async () => {
  const db = fakeDb([{ rows: [{ access_token: "ya29.stale" }] }]);

  assertEquals(await revokeGoogleToken(db, fakeAuthHandler(false), 7), false);
});

Deno.test("revokeGoogleToken: tolerates a missing user id", async () => {
  const db = fakeDb([{ rows: [] }]);
  const auth = fakeAuthHandler();

  assertEquals(await revokeGoogleToken(db, auth, undefined), false);
  assertEquals(auth.revoked, []);
});
