/**
 * Conditional-GET helpers for the /static/ route.
 *
 * The route sets a content-hash entity-tag and then answers a matching
 * `If-None-Match` with a bodiless 304, so an unchanged file costs response
 * headers only. Both pieces live here, pure and separate from the route, so
 * they stay under test.
 */

/**
 * The quoted, lowercase hex SHA-1 entity-tag for a representation's bytes.
 *
 * @param {Uint8Array} bytes the exact bytes that will be sent as the body
 * @returns {Promise<string>} the entity-tag, quoted (e.g. `"aaf4c61d..."`)
 */
export async function contentHashEtag(bytes) {
  const digest = await crypto.subtle.digest("SHA-1", bytes);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `"${hex}"`;
}

/**
 * The opaque-tag value of a single `If-None-Match` / `ETag` list element, or
 * null when it is not a well-formed (optionally weak) quoted token.
 *
 * @param {string} candidate one trimmed list element, e.g. `W/"abc"` or `"abc"`
 * @returns {string|null} the text inside the quotes, weak prefix discarded
 */
function opaqueTag(candidate) {
  const unweak = candidate.startsWith("W/") ? candidate.slice(2) : candidate;
  if (unweak.length < 2 || !unweak.startsWith('"') || !unweak.endsWith('"')) {
    return null;
  }
  return unweak.slice(1, -1);
}

/**
 * Whether an `If-None-Match` header matches the current entity-tag, per
 * RFC 9110 s13.1.2. The comparison is weak on both sides: `If-None-Match` only
 * asks "did the representation change?", so a `W/` prefix on either the header
 * candidate or the etag is ignored. Nothing here throws - malformed input
 * (including a malformed `etag`) is simply "no match".
 *
 * @param {string|null|undefined} ifNoneMatch the raw header value
 * @param {string} etag the current entity-tag, quoted
 * @returns {boolean}
 */
export function ifNoneMatchMatches(ifNoneMatch, etag) {
  if (typeof ifNoneMatch !== "string") return false;

  const trimmed = ifNoneMatch.trim();
  if (trimmed === "") return false;
  if (trimmed === "*") return true;

  if (typeof etag !== "string") return false;
  const current = opaqueTag(etag.trim());
  if (current === null) return false;

  return trimmed
    .split(",")
    .map((part) => opaqueTag(part.trim()))
    .some((tag) => tag !== null && tag === current);
}
