/**
 * The notes-list request shape.
 *
 * Filtering with no text query goes to GET /api/notes rather than to search,
 * so it needs its own query string - including the tri-state tag filter, where
 * sending an exclusion as a requirement would show exactly the notes the user
 * asked to hide. Pure, so that shape stays under test without a network.
 */

/**
 * Build the query string for GET /api/notes.
 *
 * @param {Object} [options] - List filters
 * @param {number} [options.limit] - Max results
 * @param {number} [options.offset] - Pagination offset
 * @param {number[]} [options.tags] - Tags a note must carry
 * @param {number[]} [options.excludeTags] - Tags a note must not carry
 * @param {string} [options.search] - Full-text query
 * @param {boolean} [options.pinned] - Pinned filter
 * @returns {string} Encoded query string, without the leading "?"
 */
export function buildNotesParams(options = {}) {
  const params = new URLSearchParams();

  if (options.limit) params.set("limit", options.limit);
  if (options.offset) params.set("offset", options.offset);

  // Comma-separated ids, the shape the server's parseTagFilterParams expects
  if (options.tags?.length) params.set("tags", options.tags.join(","));
  if (options.excludeTags?.length) params.set("exclude_tags", options.excludeTags.join(","));

  if (options.search) params.set("search", options.search);
  if (options.pinned !== undefined) params.set("pinned", options.pinned);

  return params.toString();
}
