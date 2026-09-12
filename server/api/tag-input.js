/**
 * Tag input validation and name normalization.
 *
 * Why this module exists: the tag-writing paths answered the same wrong input
 * four different ways —
 *   `tags: ["c++"]` on create  -> 500 (raw Postgres FK error)
 *   `tags: "c++"`   on update  -> 200 OK, and every tag on the note was WIPED
 *   `tags: [999]`   on update  -> 200 OK, silently ignored
 *   `tags: [999]`   on create  -> 500
 *
 * The contract now: a `tags` field is either ABSENT (leave the tags alone) or an
 * array of positive integer tag ids (deduplicated). Anything else is a 400 with
 * one message. Notes reference tags by id, never by name — names live in
 * `POST /api/tags`, which normalizes them.
 */

const TAG_ID_ERROR = "tags must be an array of tag ids";
const MAX_TAG_NAME = 100; // matches tags.name VARCHAR(100)

/**
 * Validate a `tags` value from a request body.
 *
 * @param {unknown} value - The raw `tags` field (may be absent)
 * @returns {{ok: true, ids: number[]|null} | {ok: false, error: string}}
 *   `ids === null` means "field absent, leave the existing tags untouched";
 *   `ids === []` means "clear them". Both are successes; the distinction is the
 *   whole point.
 */
export function parseTagIds(value) {
  if (value === undefined) return { ok: true, ids: null };
  if (!Array.isArray(value)) return { ok: false, error: TAG_ID_ERROR };

  const ids = [];
  for (const raw of value) {
    if (typeof raw !== "number" || !Number.isInteger(raw) || raw <= 0) {
      return { ok: false, error: TAG_ID_ERROR };
    }
    if (!ids.includes(raw)) ids.push(raw);
  }
  return { ok: true, ids };
}

/**
 * Normalize a tag name: trimmed and lower-case, so `CPP`, `cpp` and ` cpp `
 * are one tag rather than three.
 *
 * Length is checked after trimming, and the check happens here rather than in
 * the database so the caller gets a 400 instead of a 500 from the column limit.
 *
 * @param {unknown} raw - The raw name from a request body
 * @returns {{ok: true, name: string} | {ok: false, error: string}}
 */
export function normalizeTagName(raw) {
  if (typeof raw !== "string") return { ok: false, error: "Tag name is required" };

  const name = raw.trim().toLowerCase();
  if (name.length === 0) return { ok: false, error: "Tag name is required" };
  if (name.length > MAX_TAG_NAME) {
    return { ok: false, error: `Tag name must be ${MAX_TAG_NAME} characters or fewer` };
  }
  return { ok: true, name };
}

/**
 * Which requested tag ids the user does not own.
 *
 * Used to turn a silent skip (or a raw FK violation) into a 400 naming the
 * offending id. A tag belonging to another user is reported exactly like one
 * that does not exist, so the API is not an oracle for other users' tag ids.
 *
 * @param {number[]} requested
 * @param {number[]} ownedIds
 * @returns {number[]} The unknown ids, in request order
 */
export function findUnknownTagIds(requested, ownedIds) {
  const owned = new Set(ownedIds);
  return requested.filter((id) => !owned.has(id));
}
