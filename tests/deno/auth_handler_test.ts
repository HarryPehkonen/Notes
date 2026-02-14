import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { GoogleAuthHandler } from "../../server/auth/auth-handler.js";

const handler = new GoogleAuthHandler(
  "test-client-id",
  "test-client-secret",
  "http://localhost:8000/auth/callback",
);

// decodeIdToken tests

Deno.test("decodeIdToken: decodes valid JWT payload", () => {
  const payload = { sub: "123", email: "test@example.com", name: "Test User" };
  const encodedPayload = btoa(JSON.stringify(payload));
  const fakeJwt = `eyJhbGciOiJSUzI1NiJ9.${encodedPayload}.fakesignature`;

  const result = handler.decodeIdToken(fakeJwt);
  assertEquals(result.sub, "123");
  assertEquals(result.email, "test@example.com");
  assertEquals(result.name, "Test User");
});

Deno.test("decodeIdToken: returns null for invalid format (not 3 parts)", () => {
  assertEquals(handler.decodeIdToken("not.a.valid.jwt.token"), null);
  assertEquals(handler.decodeIdToken("onlyone"), null);
  assertEquals(handler.decodeIdToken("two.parts"), null);
});

Deno.test("decodeIdToken: returns null for malformed base64 payload", () => {
  const result = handler.decodeIdToken("header.!!!invalid!!!.signature");
  assertEquals(result, null);
});

Deno.test("decodeIdToken: returns null for non-JSON payload", () => {
  const encoded = btoa("this is not json");
  const result = handler.decodeIdToken(`header.${encoded}.signature`);
  assertEquals(result, null);
});

Deno.test("decodeIdToken: handles UTF-8 characters in payload", () => {
  const payload = { sub: "456", name: "José García", email: "jose@example.com" };
  // Encode with TextEncoder to handle UTF-8 properly
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const binary = String.fromCharCode(...bytes);
  const encoded = btoa(binary);
  const fakeJwt = `header.${encoded}.signature`;

  const result = handler.decodeIdToken(fakeJwt);
  assertEquals(result.name, "José García");
  assertEquals(result.email, "jose@example.com");
});

Deno.test("decodeIdToken: handles base64url encoding (- and _ chars)", () => {
  const payload = { url: "https://example.com/path?q=1&r=2" };
  // Create base64url encoded string
  const base64 = btoa(JSON.stringify(payload));
  const base64url = base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const fakeJwt = `header.${base64url}.signature`;

  const result = handler.decodeIdToken(fakeJwt);
  assertEquals(result.url, "https://example.com/path?q=1&r=2");
});

// getAuthorizationUrl tests

Deno.test("getAuthorizationUrl: contains required OAuth parameters", () => {
  const url = handler.getAuthorizationUrl();

  assertEquals(url.includes("client_id=test-client-id"), true);
  assertEquals(url.includes("redirect_uri="), true);
  assertEquals(url.includes("response_type=code"), true);
  assertEquals(url.includes("scope="), true);
  assertEquals(url.includes("access_type=offline"), true);
});

Deno.test("getAuthorizationUrl: uses Google auth endpoint", () => {
  const url = handler.getAuthorizationUrl();
  assertEquals(url.startsWith("https://accounts.google.com/o/oauth2/v2/auth?"), true);
});

Deno.test("getAuthorizationUrl: includes state when provided", () => {
  const url = handler.getAuthorizationUrl("my-state-token");
  assertEquals(url.includes("state=my-state-token"), true);
});

Deno.test("getAuthorizationUrl: omits state when not provided", () => {
  const url = handler.getAuthorizationUrl();
  assertEquals(url.includes("state="), false);
});

Deno.test("getAuthorizationUrl: includes required scopes", () => {
  const url = handler.getAuthorizationUrl();
  // URL encoded spaces become +
  assertEquals(url.includes("openid"), true);
  assertEquals(url.includes("email"), true);
  assertEquals(url.includes("profile"), true);
});

// isConfigured tests

Deno.test("isConfigured: returns true when all fields set", () => {
  assertEquals(handler.isConfigured(), true);
});

Deno.test("isConfigured: returns false when client ID missing", () => {
  const incomplete = new GoogleAuthHandler("", "secret", "http://localhost/callback");
  assertEquals(incomplete.isConfigured(), false);
});
