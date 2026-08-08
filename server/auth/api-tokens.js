/**
 * Personal API tokens for machine clients
 *
 * Tokens look like `nt_<43 base64url chars>` and carry 256 bits of entropy.
 * Only the SHA-256 digest of a token is ever persisted; the plaintext is shown
 * once at creation time and never stored or logged.
 */

/** Number of random bytes behind a token (256-bit entropy) */
const TOKEN_BYTES = 32;

/** Prefix that makes tokens recognisable in logs and secret scanners */
export const TOKEN_PREFIX = "nt_";

/**
 * Encode bytes as unpadded base64url
 * @param {Uint8Array} bytes - Raw bytes
 * @returns {string} base64url string without padding
 */
function toBase64Url(bytes) {
  const binary = String.fromCharCode(...bytes);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Generate a new plaintext API token
 * @returns {string} Token of the form `nt_<43 base64url chars>`
 */
export function generateApiToken() {
  const bytes = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  return `${TOKEN_PREFIX}${toBase64Url(bytes)}`;
}

/**
 * Hash a token with SHA-256
 *
 * This mirrors pgcrypto's `digest(token, 'sha256')`, which is what the database
 * lookup uses. It exists for tests and for displaying a digest; the
 * authoritative comparison always happens in SQL.
 * @param {string} token - Plaintext token
 * @returns {Promise<string>} Lowercase hex digest (64 characters)
 */
export async function hashToken(token) {
  const data = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Extract a bearer token from a request's Authorization header
 *
 * Tokens are only ever accepted from the Authorization header - never from
 * query parameters or the request body, where they would leak into logs.
 * @param {{ headers: Headers }} req - Request (Oak's `ctx.request` works)
 * @returns {string|null} The token, or null if missing/malformed
 */
export function extractBearerToken(req) {
  const header = req?.headers?.get("authorization");
  if (!header) return null;

  const parts = header.trim().split(/\s+/);
  if (parts.length !== 2) return null;
  if (parts[0].toLowerCase() !== "bearer") return null;
  if (!parts[1]) return null;

  return parts[1];
}
