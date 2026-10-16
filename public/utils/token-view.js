/**
 * API-token view helpers - pure, no DOM, no fetch.
 *
 * The settings page (`public/tokens.js`) renders what these return and nothing
 * else, so the wording a person reads on a screen ("Read only", "Expired",
 * "Never used") and the request body a create form sends are both checkable
 * without a browser - the same split the rest of `public/utils/` uses.
 */

/** Month names for the short, unambiguous date format the list uses. */
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * What a scope list means, in words
 *
 * Says the narrower thing first: a list without `write` is read-only whatever
 * else it carries, and that is the sentence a person has to be able to trust.
 * @param {unknown} scopes - Scope names from the API
 * @returns {string} Human label
 */
export function scopeLabel(scopes) {
  const list = Array.isArray(scopes) ? scopes : [];
  if (list.includes("write")) return "Read and write";
  if (list.includes("read")) return "Read only";
  return "No access";
}

/**
 * What a token's state means, in words
 * @param {string} state - `active`, `revoked` or `expired`
 * @returns {string} Human label
 */
export function stateLabel(state) {
  if (state === "revoked") return "Revoked";
  if (state === "expired") return "Expired";
  return "Active";
}

/**
 * A timestamp as "3 Oct 2026", or a stand-in when there is none
 *
 * UTC parts on purpose: the same row read on two machines must read the same,
 * and a date is all this list needs to say.
 * @param {string|Date|null|undefined} value - Timestamp from the API
 * @param {string} [empty] - Text when there is no timestamp
 * @returns {string} Formatted date
 */
export function formatDate(value, empty = "Never") {
  if (!value) return empty;
  const at = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(at.getTime())) return empty;
  return `${at.getUTCDate()} ${MONTHS[at.getUTCMonth()]} ${at.getUTCFullYear()}`;
}

/**
 * The one-line summary under a token's name
 * @param {Object} row - Token row from `GET /api/tokens`
 * @returns {string} e.g. "Read only - created 3 Oct 2026 - last used 4 Oct 2026"
 */
export function tokenSummary(row) {
  const parts = [
    scopeLabel(row?.scopes),
    `created ${formatDate(row?.created_at, "unknown")}`,
    `last used ${formatDate(row?.last_used_at, "never")}`,
  ];
  if (row?.expires_at) parts.push(`expires ${formatDate(row.expires_at)}`);
  return parts.join(" \u00b7 ");
}

/**
 * The request body for creating a token
 *
 * A hidden/absent choice falls back to the SAFE one: read-only, no expiry
 * asked for means "never", which is the behaviour that existed before expiries
 * were offered at all.
 * @param {{name?: unknown, scope?: unknown, expiresInDays?: unknown}} input - Form values
 * @returns {{name: string, scopes: string[], expires_in_days: number}} Body for POST /api/tokens
 */
export function createTokenBody(input = {}) {
  const name = String(input.name ?? "").trim();
  const scope = String(input.scope ?? "read").trim().toLowerCase();
  const rawDays = Number(input.expiresInDays ?? 0);
  const days = Number.isInteger(rawDays) && rawDays > 0 ? rawDays : 0;

  return {
    name,
    scopes: scope === "write" ? ["read", "write"] : ["read"],
    expires_in_days: days,
  };
}
