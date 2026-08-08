import {
  assert,
  assertEquals,
  assertMatch,
  assertNotEquals,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { extractBearerToken, generateApiToken, hashToken } from "../../server/auth/api-tokens.js";
import { requireAuth } from "../../server/auth/middleware.js";
import { parseTokenArgs } from "../../server/cli/args.js";

// generateApiToken tests

Deno.test("generateApiToken: starts with nt_ prefix", () => {
  assert(generateApiToken().startsWith("nt_"));
});

Deno.test("generateApiToken: is 46 characters long", () => {
  assertEquals(generateApiToken().length, 46);
});

Deno.test("generateApiToken: uses base64url charset only (no +, /, =)", () => {
  for (let i = 0; i < 20; i++) {
    const token = generateApiToken();
    assertMatch(token, /^nt_[A-Za-z0-9_-]{43}$/);
  }
});

Deno.test("generateApiToken: two calls produce different tokens", () => {
  assertNotEquals(generateApiToken(), generateApiToken());
});

// hashToken tests

Deno.test("hashToken: is deterministic", async () => {
  const token = "nt_abc123";
  assertEquals(await hashToken(token), await hashToken(token));
});

Deno.test("hashToken: returns 64 lowercase hex characters", async () => {
  const hash = await hashToken(generateApiToken());
  assertEquals(hash.length, 64);
  assertMatch(hash, /^[0-9a-f]{64}$/);
});

Deno.test("hashToken: differs for different input", async () => {
  assertNotEquals(await hashToken("token-a"), await hashToken("token-b"));
});

Deno.test("hashToken: matches known SHA-256 vector", async () => {
  // SHA-256 of the empty string
  assertEquals(
    await hashToken(""),
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  );
});

// extractBearerToken tests

/**
 * Build a minimal request-like object carrying the given headers
 * @param {Record<string, string>} headers
 */
function fakeRequest(headers: Record<string, string> = {}) {
  return { headers: new Headers(headers) };
}

Deno.test("extractBearerToken: extracts token from valid header", () => {
  const req = fakeRequest({ authorization: "Bearer nt_abc123" });
  assertEquals(extractBearerToken(req), "nt_abc123");
});

Deno.test("extractBearerToken: accepts lowercase bearer scheme", () => {
  const req = fakeRequest({ authorization: "bearer nt_abc123" });
  assertEquals(extractBearerToken(req), "nt_abc123");
});

Deno.test("extractBearerToken: accepts mixed-case BeArEr scheme", () => {
  const req = fakeRequest({ authorization: "BeArEr nt_abc123" });
  assertEquals(extractBearerToken(req), "nt_abc123");
});

Deno.test("extractBearerToken: returns null for wrong scheme", () => {
  assertEquals(extractBearerToken(fakeRequest({ authorization: "Basic dXNlcjpwYXNz" })), null);
  assertEquals(extractBearerToken(fakeRequest({ authorization: "Token nt_abc123" })), null);
});

Deno.test("extractBearerToken: returns null when header is missing", () => {
  assertEquals(extractBearerToken(fakeRequest()), null);
});

Deno.test("extractBearerToken: returns null for empty token", () => {
  assertEquals(extractBearerToken(fakeRequest({ authorization: "Bearer" })), null);
  assertEquals(extractBearerToken(fakeRequest({ authorization: "Bearer " })), null);
  assertEquals(extractBearerToken(fakeRequest({ authorization: "" })), null);
});

Deno.test("extractBearerToken: returns null for malformed header with extra parts", () => {
  assertEquals(extractBearerToken(fakeRequest({ authorization: "Bearer a b" })), null);
});

Deno.test("extractBearerToken: tolerates extra whitespace around the token", () => {
  assertEquals(extractBearerToken(fakeRequest({ authorization: "Bearer   nt_abc " })), "nt_abc");
});

// requireAuth tests

/**
 * Build a fake Oak context for middleware tests
 * @param {Object} options
 */
function fakeContext(
  { sessionUser = null, authorization = null, db = null }: {
    sessionUser?: unknown;
    authorization?: string | null;
    db?: unknown;
  } = {},
) {
  const headers: Record<string, string> = {};
  if (authorization !== null) headers.authorization = authorization;

  return {
    request: { headers: new Headers(headers) },
    response: { status: 200, body: null as unknown },
    state: {
      db,
      session: {
        // deno-lint-ignore require-await
        get: async (_key: string) => sessionUser,
      },
      user: undefined as unknown,
      authMethod: undefined as unknown,
    },
  };
}

/**
 * Build a fake db whose query() returns queued results and records calls
 * @param {Array} results
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

Deno.test("requireAuth: passes through when session user exists", async () => {
  const ctx = fakeContext({ sessionUser: { id: 7, email: "a@b.c" } });
  let called = false;

  await requireAuth(ctx, () => {
    called = true;
    return Promise.resolve();
  });

  assert(called);
  assertEquals(ctx.state.user, { id: 7, email: "a@b.c" });
  assertEquals(ctx.state.authMethod, "session");
  assertEquals(ctx.response.status, 200);
});

Deno.test("requireAuth: prefers the session over a bearer header", async () => {
  const db = fakeDb([]);
  const ctx = fakeContext({
    sessionUser: { id: 7, email: "a@b.c" },
    authorization: "Bearer nt_whatever",
    db,
  });

  await requireAuth(ctx, () => Promise.resolve());

  assertEquals(db.calls.length, 0);
  assertEquals(ctx.state.authMethod, "session");
});

Deno.test("requireAuth: returns 401 with no session and no header", async () => {
  const ctx = fakeContext();
  let called = false;

  await requireAuth(ctx, () => {
    called = true;
    return Promise.resolve();
  });

  assertEquals(called, false);
  assertEquals(ctx.response.status, 401);
  assertEquals(ctx.response.body, {
    error: "Authentication required",
    redirectTo: "/auth/login",
  });
});

Deno.test("requireAuth: authenticates a valid API token", async () => {
  const db = fakeDb([
    { rows: [{ id: 3, user_id: 42, email: "bot@example.com", name: "Bot", picture: null }] },
    { rows: [] },
  ]);
  const ctx = fakeContext({ authorization: "Bearer nt_valid", db });
  let called = false;

  await requireAuth(ctx, () => {
    called = true;
    return Promise.resolve();
  });

  assert(called);
  assertEquals(ctx.state.user, {
    id: 42,
    email: "bot@example.com",
    name: "Bot",
    picture: null,
  });
  assertEquals(ctx.state.authMethod, "api_token");
  assertEquals(ctx.response.status, 200);
});

Deno.test("requireAuth: hashes the token in SQL and never binds a plaintext hash", async () => {
  const db = fakeDb([
    { rows: [{ id: 3, user_id: 42, email: "bot@example.com", name: "Bot", picture: null }] },
    { rows: [] },
  ]);
  const ctx = fakeContext({ authorization: "Bearer nt_valid", db });

  await requireAuth(ctx, () => Promise.resolve());

  const lookup = db.calls[0];
  assertMatch(lookup.sql, /digest\(\$1, 'sha256'\)/);
  assertMatch(lookup.sql, /revoked_at IS NULL/);
  assertEquals(lookup.params, ["nt_valid"]);
});

Deno.test("requireAuth: updates last_used_at for a valid token", async () => {
  const db = fakeDb([
    { rows: [{ id: 3, user_id: 42, email: "bot@example.com", name: "Bot", picture: null }] },
    { rows: [] },
  ]);
  const ctx = fakeContext({ authorization: "Bearer nt_valid", db });

  await requireAuth(ctx, () => Promise.resolve());
  // The update is fire-and-forget; let the microtask queue drain
  await new Promise((resolve) => setTimeout(resolve, 0));

  assertEquals(db.calls.length, 2);
  assertMatch(db.calls[1].sql, /UPDATE api_tokens SET last_used_at/);
  assertEquals(db.calls[1].params, [3]);
});

Deno.test("requireAuth: returns 401 for a revoked or unknown token", async () => {
  const db = fakeDb([{ rows: [] }]);
  const ctx = fakeContext({ authorization: "Bearer nt_revoked", db });
  let called = false;

  await requireAuth(ctx, () => {
    called = true;
    return Promise.resolve();
  });

  assertEquals(called, false);
  assertEquals(ctx.response.status, 401);
  assertEquals(ctx.response.body, {
    error: "Authentication required",
    redirectTo: "/auth/login",
  });
});

Deno.test("requireAuth: returns 401 for a malformed Authorization header", async () => {
  const db = fakeDb([]);
  const ctx = fakeContext({ authorization: "Basic dXNlcjpwYXNz", db });

  await requireAuth(ctx, () => Promise.resolve());

  assertEquals(db.calls.length, 0);
  assertEquals(ctx.response.status, 401);
});

Deno.test("requireAuth: returns 500 when the token lookup fails", async () => {
  const db = fakeDb(new Error("connection refused"));
  const ctx = fakeContext({ authorization: "Bearer nt_valid", db });
  let called = false;

  await requireAuth(ctx, () => {
    called = true;
    return Promise.resolve();
  });

  assertEquals(called, false);
  assertEquals(ctx.response.status, 500);
  assertEquals(ctx.response.body, {
    success: false,
    error: "Authentication error",
  });
});

// parseTokenArgs tests

Deno.test("parseTokenArgs: parses create with email and name", () => {
  const result = parseTokenArgs(["create", "--email", "a@b.c", "--name", "hermes"]);
  assertEquals(result, {
    command: "create",
    email: "a@b.c",
    name: "hermes",
    help: false,
    error: null,
  });
});

Deno.test("parseTokenArgs: parses --flag=value form", () => {
  const result = parseTokenArgs(["create", "--email=a@b.c", "--name=hermes"]);
  assertEquals(result.email, "a@b.c");
  assertEquals(result.name, "hermes");
  assertEquals(result.error, null);
});

Deno.test("parseTokenArgs: parses list with optional email", () => {
  assertEquals(parseTokenArgs(["list"]).email, null);
  assertEquals(parseTokenArgs(["list", "--email", "a@b.c"]).email, "a@b.c");
});

Deno.test("parseTokenArgs: parses revoke with name and email", () => {
  const result = parseTokenArgs(["revoke", "--email", "a@b.c", "--name", "hermes"]);
  assertEquals(result.command, "revoke");
  assertEquals(result.name, "hermes");
  assertEquals(result.error, null);
});

Deno.test("parseTokenArgs: sets help when --help is present", () => {
  assertEquals(parseTokenArgs(["--help"]).help, true);
  assertEquals(parseTokenArgs(["create", "--help"]).help, true);
  assertEquals(parseTokenArgs(["-h"]).help, true);
});

Deno.test("parseTokenArgs: reports missing command", () => {
  const result = parseTokenArgs([]);
  assertEquals(result.command, null);
  assertMatch(String(result.error), /command/i);
});

Deno.test("parseTokenArgs: reports unknown command", () => {
  assertMatch(String(parseTokenArgs(["frobnicate"]).error), /unknown command/i);
});

Deno.test("parseTokenArgs: reports unknown flag", () => {
  assertMatch(String(parseTokenArgs(["list", "--verbose"]).error), /unknown flag/i);
});

Deno.test("parseTokenArgs: reports a flag with a missing value", () => {
  assertMatch(String(parseTokenArgs(["create", "--email"]).error), /--email/);
  assertMatch(String(parseTokenArgs(["create", "--name", "--email"]).error), /--name/);
});

Deno.test("parseTokenArgs: reports missing required flags for create", () => {
  assertMatch(String(parseTokenArgs(["create", "--email", "a@b.c"]).error), /--name/);
  assertMatch(String(parseTokenArgs(["create", "--name", "hermes"]).error), /--email/);
});

Deno.test("parseTokenArgs: reports missing required flag for revoke", () => {
  assertMatch(String(parseTokenArgs(["revoke"]).error), /--name/);
});

Deno.test("parseTokenArgs: reports positional arguments", () => {
  assertMatch(String(parseTokenArgs(["list", "extra"]).error), /unexpected argument/i);
});

Deno.test("parseTokenArgs: does not report errors when --help is present", () => {
  assertEquals(parseTokenArgs(["create", "--help"]).error, null);
});
