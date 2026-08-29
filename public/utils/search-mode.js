/**
 * Search mode helpers
 *
 * The semantic-search toggle is an exclusive switch: checked means the query
 * goes to the embedding search only, unchecked means the usual full-text
 * search. Keeping the flag decision here makes it testable without a DOM.
 */

/**
 * Should the request carry the `semantic=1` flag?
 *
 * Deliberately strict: only a real checked checkbox (boolean true) turns
 * semantic mode on, so a stray string like "false" from an attribute or a
 * stored preference can never flip the search into the wrong mode.
 *
 * @param {unknown} checkboxState - The checkbox's `checked` value
 * @returns {boolean} true when the semantic flag should be sent
 */
export function shouldSendSemantic(checkboxState) {
  return checkboxState === true;
}

/**
 * Build the query string for GET /api/search.
 *
 * Shaping the request here rather than in the API client keeps the wire
 * format - including the `tags` filter the semantic path now honours - under
 * test without a network or a DOM.
 *
 * @param {string} query - Raw search text
 * @param {Object} [options] - Request options
 * @param {number} [options.limit] - Max results
 * @param {number} [options.offset] - Pagination offset
 * @param {unknown} [options.semantic] - Semantic checkbox state
 * @param {number[]} [options.tags] - Selected tag ids
 * @returns {string} Encoded query string, without the leading "?"
 */
export function buildSearchParams(query, options = {}) {
  const params = new URLSearchParams();
  params.set("q", query);

  if (options.limit) params.set("limit", options.limit);
  if (options.offset) params.set("offset", options.offset);
  if (shouldSendSemantic(options.semantic)) params.set("semantic", "1");

  // Comma-separated, the shape the server's parseTagIds expects. Sent in both
  // modes: semantic search filters by tags now instead of dropping them.
  if (Array.isArray(options.tags) && options.tags.length > 0) {
    params.set("tags", options.tags.join(","));
  }

  return params.toString();
}
