import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  DEFAULT_SCOPES,
  describeToken,
  hasScope,
  isExpired,
  parseExpiryDays,
  parseScopes,
  requiredScopeFor,
  scopeSummary,
  tokenState,
} from "../../server/auth/token-scope.js";

// ---------------------------------------------------------------- parseScopes

Deno.test("scopes: a create with no scopes named keeps pre-scopes behaviour", () => {
  assertEquals(parseScopes(undefined), { scopes: DEFAULT_SCOPES });
  assertEquals(parseScopes(null), { scopes: DEFAULT_SCOPES });
  assertEquals(DEFAULT_SCOPES, ["read", "write"]);
});

Deno.test("scopes: read-only is the narrow one, and stays narrow", () => {
  assertEquals(parseScopes(["read"]), { scopes: ["read"] });
  assertEquals(parseScopes("read"), { scopes: ["read"] });
});

Deno.test("scopes: write implies read - a token that writes but cannot read is a foot-gun", () => {
  assertEquals(parseScopes(["write"]), { scopes: ["read", "write"] });
  assertEquals(parseScopes("write"), { scopes: ["read", "write"] });
});

Deno.test("scopes: names are trimmed, lower-cased and de-duplicated", () => {
  assertEquals(parseScopes([" READ ", "read", "Read"]), { scopes: ["read"] });
  assertEquals(parseScopes("read,write"), { scopes: ["read", "write"] });
});

Deno.test("scopes: an unknown name is an error, never a silently dropped scope", () => {
  // The danger this pins: a caller asks for "admin", gets a token that means
  // something else, and believes it got what it asked for.
  for (const raw of [["admin"], ["read", "share"], "share"]) {
    const result = parseScopes(raw);
    assert(result.error, `expected an error for ${JSON.stringify(raw)}`);
    assert(result.error.includes("unknown scope"));
  }
});

Deno.test("scopes: an empty list is an error - a token that may do nothing is a mistake", () => {
  for (const raw of [[], "", "  ", [""], [null]]) {
    const result = parseScopes(raw);
    assert(result.error, `expected an error for ${JSON.stringify(raw)}`);
  }
});

// ----------------------------------------------------------- parseExpiryDays

Deno.test("expiry: no expiry is the default, said four ways", () => {
  for (const raw of [undefined, null, "", "never", 0, "0"]) {
    assertEquals(parseExpiryDays(raw), { days: null });
  }
});

Deno.test("expiry: a whole number of days is accepted", () => {
  assertEquals(parseExpiryDays(30), { days: 30 });
  assertEquals(parseExpiryDays("90"), { days: 90 });
  assertEquals(parseExpiryDays(3650), { days: 3650 });
});

Deno.test("expiry: nonsense and negatives are refused, not coerced", () => {
  for (const raw of [-1, 1.5, "abc", "30 days", {}, true]) {
    const result = parseExpiryDays(raw);
    assert(result.error, `expected an error for ${JSON.stringify(raw)}`);
  }
});

Deno.test("expiry: absurdly long expiries are refused", () => {
  const result = parseExpiryDays(3651);
  assert(result.error);
  assert(result.error.includes("3650"));
});

// ---------------------------------------------------------- requiredScopeFor

Deno.test("required scope: reads are read, everything else is write", () => {
  assertEquals(requiredScopeFor("GET"), "read");
  assertEquals(requiredScopeFor("get"), "read");
  assertEquals(requiredScopeFor("HEAD"), "read");
  assertEquals(requiredScopeFor("OPTIONS"), "read");
  for (const method of ["POST", "PUT", "PATCH", "DELETE", "post", " delete "]) {
    assertEquals(requiredScopeFor(method), "write", `${method} must need write`);
  }
});

Deno.test("required scope: an unknown method is not a read", () => {
  // Fails closed: anything this function does not recognise gets the write
  // check, so a new method can never slip through as harmless.
  assertEquals(requiredScopeFor("FROBNICATE"), "write");
  assertEquals(requiredScopeFor(""), "write");
  assertEquals(requiredScopeFor(undefined), "write");
});

// ------------------------------------------------------------------ hasScope

Deno.test("hasScope: the scope has to be in the list", () => {
  assertEquals(hasScope(["read"], "read"), true);
  assertEquals(hasScope(["read", "write"], "write"), true);
  assertEquals(hasScope(["read"], "write"), false);
});

Deno.test("hasScope: an unrecognised scope list fails closed", () => {
  // Every one of these would be a permissive answer under a truthy check.
  for (const scopes of [null, undefined, "read", "read,write", {}, 1]) {
    assertEquals(hasScope(scopes, "read"), false, `${JSON.stringify(scopes)} must not be allowed`);
    assertEquals(hasScope(scopes, "write"), false, `${JSON.stringify(scopes)} must not be allowed`);
  }
});

Deno.test("hasScope: scope names from the database are matched case-insensitively", () => {
  assertEquals(hasScope(["READ"], "read"), true);
  assertEquals(hasScope([" Read "], "read"), true);
});

Deno.test("scopeSummary: the text of a refusal must never be the thing that throws", () => {
  assertEquals(scopeSummary(["read"]), "read");
  assertEquals(scopeSummary(["write", "read"]), "write, read");
  assert(scopeSummary([]) === "none");
  for (const scopes of [null, undefined, "read", {}, 1]) {
    assertEquals(scopeSummary(scopes), "none");
  }
});

// ------------------------------------------------------------ expiry / state

Deno.test("isExpired: no expiry means no expiry, forever", () => {
  assertEquals(isExpired(null), false);
  assertEquals(isExpired(undefined), false);
});

Deno.test("isExpired: a past date is expired, a future date is not", () => {
  const now = Date.parse("2026-10-14T12:00:00Z");
  assertEquals(isExpired(new Date(now - 1000), now), true);
  assertEquals(isExpired(new Date(now + 1000), now), false);
  assertEquals(isExpired("2026-10-01T00:00:00Z", now), true);
  assertEquals(isExpired("2027-01-01T00:00:00Z", now), false);
});

Deno.test("isExpired: the moment of expiry counts as expired", () => {
  const now = Date.parse("2026-10-14T12:00:00Z");
  assertEquals(isExpired(new Date(now), now), true);
});

Deno.test("isExpired: an unparseable value is not treated as expired", () => {
  // The expiry check must not be the thing that locks a working token out; a
  // malformed value falls through to the scope check instead.
  assertEquals(isExpired("not a date"), false);
});

Deno.test("tokenState: revoked beats expired, and active is the default", () => {
  const past = new Date(Date.now() - 1000);
  assertEquals(tokenState({ revoked_at: new Date(), expires_at: past }), "revoked");
  assertEquals(tokenState({ revoked_at: null, expires_at: past }), "expired");
  assertEquals(tokenState({ revoked_at: null, expires_at: null }), "active");
  assertEquals(tokenState({}), "active");
});

// -------------------------------------------------------------- describeToken

Deno.test("describeToken: never carries the hash, even when the row has one", () => {
  const row = {
    id: 7,
    user_id: 1,
    name: "hermes",
    token_hash: new Uint8Array([1, 2, 3]),
    scopes: ["read"],
    created_at: "2026-10-01T00:00:00Z",
    last_used_at: null,
    expires_at: null,
    revoked_at: null,
  };

  const described = describeToken(row);
  assertEquals(Object.keys(described).sort(), [
    "created_at",
    "expires_at",
    "id",
    "last_used_at",
    "name",
    "revoked_at",
    "scopes",
    "state",
  ]);
  assert(!JSON.stringify(described).includes("token_hash"));
});

Deno.test("describeToken: a missing scope list reads as no access, not as full access", () => {
  assertEquals(describeToken({ id: 1, name: "x" }).scopes, []);
});
