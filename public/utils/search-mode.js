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
