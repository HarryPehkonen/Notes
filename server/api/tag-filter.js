/**
 * Tri-state tag filtering
 *
 * A tag is in one of three states for a query:
 *
 *   any       - not mentioned; it says nothing about which notes match
 *   required  - the note must carry it (all required tags are ANDed)
 *   excluded  - the note must not carry it (any match drops the note)
 *
 * The notes list, advanced search and semantic search all filter by tags, so
 * the parameter parsing and the SQL fragment live here, once, and are unit
 * tested without a database. Wire format: `tags` carries the required ids and
 * `exclude_tags` (`excludeTags` in the advanced-search JSON body) carries the
 * excluded ones.
 */

/**
 * Pull unique positive integer ids out of a comma-separated string or an array.
 *
 * Only positive integers survive - anything else (names, zero, negatives,
 * fractions) can never be a tag id, so it is dropped rather than bound into
 * the query. Duplicates collapse, because the required filter counts DISTINCT
 * matches and a repeated id would otherwise make it unsatisfiable.
 *
 * @param {unknown} raw - Comma-separated ids or an array of ids
 * @returns {number[]} Unique positive tag ids, in the order given
 */
function collectIds(raw) {
  const parts = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(",") : [];

  const ids = [];
  for (const part of parts) {
    const trimmed = String(part ?? "").trim();
    if (trimmed.length === 0) continue;

    const id = Number(trimmed);
    if (!Number.isInteger(id) || id <= 0) continue;
    if (!ids.includes(id)) ids.push(id);
  }

  return ids;
}

/**
 * Did the caller actually ask for a tag filter?
 *
 * Distinguishes "no filter" from "a filter I could not read": the handlers
 * answer the second with a 400 rather than with silently unfiltered results.
 *
 * @param {unknown} raw - Raw parameter value
 * @returns {boolean}
 */
function wasRequested(raw) {
  if (Array.isArray(raw)) return raw.length > 0;
  if (typeof raw === "string") return raw.trim().length > 0;
  return false;
}

/**
 * Parse the `tags` query parameter into tag ids.
 *
 * Kept string-only, the shape query parameters arrive in; the JSON body of
 * /api/search/advanced goes through parseTagFilterParams instead.
 *
 * @param {unknown} raw - Raw `tags` query parameter, e.g. "3,5"
 * @returns {number[]} Unique positive tag ids, in the order given
 */
export function parseTagIds(raw) {
  if (typeof raw !== "string") return [];
  return collectIds(raw);
}

/**
 * @typedef {Object} TagFilterRequest
 * @property {number[]} tagIds - Tags the note must carry
 * @property {number[]} excludeTagIds - Tags the note must not carry
 * @property {boolean} invalid - A filter was asked for but no id could be read
 */

/**
 * Read the required/excluded tag selection out of a request.
 *
 * Accepts both wire shapes: comma-separated strings (query parameters) and
 * arrays (the advanced-search JSON body).
 *
 * @param {Object} raw - Raw values
 * @param {unknown} [raw.tags] - Required tag ids
 * @param {unknown} [raw.excludeTags] - Excluded tag ids
 * @returns {TagFilterRequest}
 */
export function parseTagFilterParams({ tags, excludeTags } = {}) {
  const tagIds = collectIds(tags);
  const excludeTagIds = collectIds(excludeTags);

  const invalid = (wasRequested(tags) && tagIds.length === 0) ||
    (wasRequested(excludeTags) && excludeTagIds.length === 0);

  return { tagIds, excludeTagIds, invalid };
}

/**
 * Build the tag conditions for a query, sign and all.
 *
 * Both fragments are ANDed on, so the caller can append the clause after any
 * WHERE it has already built. Required tags use a grouped membership test with
 * a DISTINCT count, so a note must carry every one of them; excluded tags use
 * a correlated NOT EXISTS, so a single match drops the note (and, unlike
 * NOT IN, no NULL can swallow the whole result set).
 *
 * @param {Object} spec - Filter inputs
 * @param {number[]} [spec.tagIds] - Tags the note must carry
 * @param {number[]} [spec.excludeTagIds] - Tags the note must not carry
 * @param {number} [spec.startIndex] - First free bind-parameter slot
 * @param {string} [spec.column] - The note-id column in the outer query
 * @returns {{clause: string, params: unknown[], nextIndex: number}}
 */
export function buildTagFilterClause(
  { tagIds = [], excludeTagIds = [], startIndex = 1, column = "n.id" } = {},
) {
  const params = [];
  let index = startIndex;
  let clause = "";

  if (tagIds.length > 0) {
    clause += `
            AND ${column} IN (
                SELECT nt.note_id
                FROM note_tags nt
                WHERE nt.tag_id = ANY($${index}::int[])
                GROUP BY nt.note_id
                HAVING COUNT(DISTINCT nt.tag_id) = $${index + 1}
            )`;
    params.push(tagIds, tagIds.length);
    index += 2;
  }

  if (excludeTagIds.length > 0) {
    clause += `
            AND NOT EXISTS (
                SELECT 1
                FROM note_tags ntx
                WHERE ntx.note_id = ${column}
                  AND ntx.tag_id = ANY($${index}::int[])
            )`;
    params.push(excludeTagIds);
    index += 1;
  }

  return { clause, params, nextIndex: index };
}
