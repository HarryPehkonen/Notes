/**
 * API token scopes and expiry - the pure half.
 *
 * A token carries a list of scope names and an optional expiry date. The
 * vocabulary is deliberately a LIST rather than a `read_only` boolean: the next
 * thing that needs a narrower token (sharing one note with one person) becomes
 * a new name here instead of a new column and a new migration.
 *
 * Everything in this file is pure and unit-tested in
 * `tests/deno/token_scope_test.ts`, because the security decisions ("may this
 * token do this?") should be readable and testable without a database.
 */

/** Every scope name the app knows. `write` implies `read`. */
export const KNOWN_SCOPES = ["read", "write"];

/** What a token gets when the caller names no scopes - the pre-scopes behaviour. */
export const DEFAULT_SCOPES = ["read", "write"];

/** Longest expiry a caller may ask for (10 years): a foot-gun guard, not a policy. */
export const MAX_EXPIRY_DAYS = 3650;

/**
 * Reduce one scope name to its canonical form
 * @param {unknown} value - Raw name
 * @returns {string} Trimmed, lower-cased name
 */
function canonicalScope(value) {
  return String(value ?? "").trim().toLowerCase();
}

/**
 * Validate a requested scope list
 *
 * Unknown names are an ERROR rather than something quietly dropped: a caller
 * that asks for a scope this app does not have must not be handed a token that
 * silently means something else. An empty list is an error too - a token with
 * no scopes can do nothing, so it is a mistake every time.
 * @param {unknown} raw - `undefined`/`null` (use the default), a string, or an array
 * @returns {{scopes: string[]} | {error: string}}
 */
export function parseScopes(raw) {
  if (raw === undefined || raw === null) return { scopes: [...DEFAULT_SCOPES] };

  const list = Array.isArray(raw) ? raw : String(raw).split(",");
  const wanted = new Set(list.map(canonicalScope).filter((name) => name.length > 0));

  if (wanted.size === 0) {
    return { error: `scopes must name at least one of: ${KNOWN_SCOPES.join(", ")}` };
  }

  const unknown = [...wanted].filter((name) => !KNOWN_SCOPES.includes(name));
  if (unknown.length > 0) {
    return {
      error: `unknown scope(s): ${unknown.join(", ")} - known scopes are ${
        KNOWN_SCOPES.join(", ")
      }`,
    };
  }

  // write implies read: a token that may change a note but not read one is a
  // foot-gun, not a feature.
  if (wanted.has("write")) wanted.add("read");

  return { scopes: KNOWN_SCOPES.filter((name) => wanted.has(name)) };
}

/**
 * Validate a requested expiry
 *
 * `0`, `"never"`, `null` and `undefined` all mean "no expiry" - the default,
 * because a token that stops working on its own is a surprise when you did not
 * ask for one.
 * @param {unknown} raw - Days as a number or numeric string, or "never"
 * @returns {{days: number|null} | {error: string}}
 */
export function parseExpiryDays(raw) {
  if (raw === undefined || raw === null || raw === "" || raw === "never") return { days: null };

  // Strictly a number, or digits in a string: `true` is not "one day", and a
  // value the caller did not mean must not quietly become an expiry.
  const numeric = typeof raw === "number" || (typeof raw === "string" && /^\d+$/.test(raw.trim()));
  const days = numeric ? Number(raw) : NaN;

  if (!Number.isInteger(days) || days < 0) {
    return { error: "expires_in_days must be a whole number of days, or 0 for no expiry" };
  }
  if (days === 0) return { days: null };
  if (days > MAX_EXPIRY_DAYS) {
    return { error: `expires_in_days must be at most ${MAX_EXPIRY_DAYS}` };
  }

  return { days };
}

/**
 * The scope a request needs, from its HTTP method alone
 *
 * Reads are `read`; everything that can change state is `write`. A rule this
 * small is checkable by reading it, and it cannot drift per-endpoint.
 * @param {string} method - HTTP method
 * @returns {"read"|"write"} Required scope
 */
export function requiredScopeFor(method) {
  const normalized = String(method ?? "").trim().toUpperCase();
  return normalized === "GET" || normalized === "HEAD" || normalized === "OPTIONS"
    ? "read"
    : "write";
}

/**
 * Does a token's scope list allow the needed scope?
 *
 * Fails CLOSED on a missing or malformed list: an unrecognised shape must never
 * be read as permissive.
 * @param {unknown} scopes - Scope list from the database row
 * @param {"read"|"write"} needed - Scope the request requires
 * @returns {boolean} True only when the list is an array and names the scope
 */
export function hasScope(scopes, needed) {
  if (!Array.isArray(scopes)) return false;
  return scopes.map(canonicalScope).includes(needed);
}

/**
 * Has this token passed its expiry?
 * @param {Date|string|null|undefined} expiresAt - Expiry from the database row
 * @param {number} [now] - Milliseconds since epoch (injectable for tests)
 * @returns {boolean} True when there is an expiry and it is in the past
 */
export function isExpired(expiresAt, now = Date.now()) {
  if (!expiresAt) return false;
  const at = expiresAt instanceof Date ? expiresAt.getTime() : Date.parse(String(expiresAt));
  if (Number.isNaN(at)) return false;
  return at <= now;
}

/**
 * A token's state, for the list a person reads
 * @param {Object} row - api_tokens row
 * @param {number} [now] - Milliseconds since epoch
 * @returns {"active"|"expired"|"revoked"} State name
 */
export function tokenState(row, now = Date.now()) {
  if (row?.revoked_at) return "revoked";
  if (isExpired(row?.expires_at, now)) return "expired";
  return "active";
}

/**
 * A scope list as words for an error message
 *
 * Tolerates the same unrecognised shapes `hasScope` refuses - this is the text
 * of a refusal, so it must not be the thing that throws.
 * @param {unknown} scopes - Scope list from the database row
 * @returns {string} e.g. "read", "read, write", or "none"
 */
export function scopeSummary(scopes) {
  if (!Array.isArray(scopes)) return "none";
  const names = scopes.map(canonicalScope).filter((name) => name.length > 0);
  return names.length > 0 ? names.join(", ") : "none";
}

/**
 * The shape a token is ever shown in - never the hash, never the plaintext
 * @param {Object} row - api_tokens row
 * @param {number} [now] - Milliseconds since epoch
 * @returns {Object} Public token fields
 */
export function describeToken(row, now = Date.now()) {
  return {
    id: row.id,
    name: row.name,
    scopes: Array.isArray(row.scopes) ? row.scopes : [],
    created_at: row.created_at ?? null,
    last_used_at: row.last_used_at ?? null,
    expires_at: row.expires_at ?? null,
    revoked_at: row.revoked_at ?? null,
    state: tokenState(row, now),
  };
}
