/**
 * Search query parsing
 *
 * Splits a raw search query into bare text tokens and '#tag' tokens so that
 * hybrid search can match bare tokens against text OR tag names, while '#tag'
 * tokens stay strict tag filters. Pure and unit-testable - no DB access.
 */

/**
 * @typedef {Object} ParsedSearchQuery
 * @property {string[]} tokens - Bare words (no '#'), in the order given
 * @property {string[]} tagTokens - Tag names from '#'-prefixed words, without the '#'
 */

/**
 * Parse a raw search query into bare tokens and tag tokens.
 *
 * Whitespace-separated. Leading '#' characters mark a tag token and are all
 * stripped ("###home" -> "home"); a '#' with no name after it is dropped
 * entirely. Token case is preserved - callers fold case where they need to.
 *
 * @param {string} rawQuery - Raw user query, e.g. "led #home"
 * @returns {ParsedSearchQuery}
 */
export function parseSearchQuery(rawQuery) {
  /** @type {ParsedSearchQuery} */
  const parsed = { tokens: [], tagTokens: [] };

  if (!rawQuery || typeof rawQuery !== "string") return parsed;

  for (const part of rawQuery.split(/\s+/)) {
    if (part.length === 0) continue;

    if (part.startsWith("#")) {
      const name = part.replace(/^#+/, "");
      if (name.length > 0) parsed.tagTokens.push(name);
    } else {
      parsed.tokens.push(part);
    }
  }

  return parsed;
}
