/**
 * Text utility functions for HTML escaping and search highlighting
 */

/**
 * Escape HTML special characters to prevent XSS
 * @param {string} text - Raw text to escape
 * @returns {string} HTML-escaped text
 */
export function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Highlight search terms in text with HTML escaping for safety
 * @param {string} text - Raw text to highlight within
 * @param {string} query - Search query to highlight
 * @returns {string} HTML string with highlighted matches
 */
export function highlightText(text, query) {
  if (!query || !text) return text;

  const escaped = escapeHtml(text);
  const escapedQuery = escapeHtml(query).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escapedQuery})`, "gi");
  return escaped.replace(regex, '<span class="highlight">$1</span>');
}
