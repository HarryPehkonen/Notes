import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  createTokenBody,
  formatDate,
  scopeLabel,
  stateLabel,
  tokenSummary,
} from "../../public/utils/token-view.js";

Deno.test("scopeLabel: read-only is named before anything else", () => {
  assertEquals(scopeLabel(["read"]), "Read only");
  assertEquals(scopeLabel(["read", "write"]), "Read and write");
});

Deno.test("scopeLabel: a list without write is read-only, whatever else it carries", () => {
  // The sentence a person has to be able to trust when they hand this token to
  // a program: a scope this page does not know must not read as "can write".
  assertEquals(scopeLabel(["read", "share"]), "Read only");
  assertEquals(scopeLabel([]), "No access");
  assertEquals(scopeLabel(null), "No access");
  assertEquals(scopeLabel(undefined), "No access");
});

Deno.test("scopeLabel: write wins when both are present, in any order", () => {
  assertEquals(scopeLabel(["write", "read"]), "Read and write");
});

Deno.test("stateLabel: the three states, and an unknown one reads as active", () => {
  assertEquals(stateLabel("revoked"), "Revoked");
  assertEquals(stateLabel("expired"), "Expired");
  assertEquals(stateLabel("active"), "Active");
  assertEquals(stateLabel(undefined), "Active");
});

Deno.test("formatDate: a UTC date, so two devices read the same row the same way", () => {
  assertEquals(formatDate("2026-10-03T23:30:00Z"), "3 Oct 2026");
  assertEquals(formatDate("2026-01-09T00:00:00Z"), "9 Jan 2026");
});

Deno.test("formatDate: nothing there says so, and never says 1 Jan 1970", () => {
  for (const value of [null, undefined, "", "not a date"]) {
    assertEquals(formatDate(value), "Never");
  }
  assertEquals(formatDate(null, "unknown"), "unknown");
});

Deno.test("formatDate: an expiry that exists is spelled out", () => {
  assertEquals(formatDate("2027-04-01T00:00:00Z"), "1 Apr 2027");
});

Deno.test("tokenSummary: scopes, creation and last use, in that order", () => {
  const summary = tokenSummary({
    scopes: ["read"],
    created_at: "2026-10-03T10:00:00Z",
    last_used_at: "2026-10-04T10:00:00Z",
    expires_at: null,
  });
  assertEquals(summary, "Read only \u00b7 created 3 Oct 2026 \u00b7 last used 4 Oct 2026");
});

Deno.test("tokenSummary: an unused token says never, and an expiry is added when set", () => {
  const summary = tokenSummary({
    scopes: ["read", "write"],
    created_at: "2026-10-03T10:00:00Z",
    last_used_at: null,
    expires_at: "2026-11-02T10:00:00Z",
  });
  assertEquals(
    summary,
    "Read and write \u00b7 created 3 Oct 2026 \u00b7 last used never \u00b7 expires 2 Nov 2026",
  );
});

Deno.test("createTokenBody: the default is the narrow one", () => {
  // A form that sends nothing (or something unrecognised) must not produce a
  // read-write token: the safe answer is the fallback, always.
  for (const scope of [undefined, null, "", "READ", "read", "anything else"]) {
    const body = createTokenBody({ name: "agent", scope });
    assertEquals(body.scopes, ["read"], `scope ${JSON.stringify(scope)} must be read-only`);
  }
  assertEquals(createTokenBody({ name: "agent" }).scopes, ["read"]);
});

Deno.test("createTokenBody: write asks for both scopes explicitly", () => {
  assertEquals(createTokenBody({ name: "agent", scope: "write" }).scopes, ["read", "write"]);
  assertEquals(createTokenBody({ name: "agent", scope: " WRITE " }).scopes, ["read", "write"]);
});

Deno.test("createTokenBody: no expiry asked for means no expiry", () => {
  for (const days of [undefined, null, 0, "0", "", -5, 1.5, "soon"]) {
    assertEquals(createTokenBody({ name: "x", expiresInDays: days }).expires_in_days, 0);
  }
  assertEquals(createTokenBody({ name: "x", expiresInDays: "30" }).expires_in_days, 30);
  assertEquals(createTokenBody({ name: "x", expiresInDays: 90 }).expires_in_days, 90);
});

Deno.test("createTokenBody: the name is trimmed, and may be empty for the caller to catch", () => {
  assertEquals(createTokenBody({ name: "  Hermes on the Pi  " }).name, "Hermes on the Pi");
  assertEquals(createTokenBody({ name: "   " }).name, "");
  assertEquals(createTokenBody({}).name, "");
});

Deno.test("createTokenBody: nothing but the three known keys is sent", () => {
  const body = createTokenBody({ name: "x", scope: "read", expiresInDays: 30, user_id: 4 });
  assertEquals(Object.keys(body).sort(), ["expires_in_days", "name", "scopes"]);
  assert(!("user_id" in body), "a client must not be able to name the owner");
});
