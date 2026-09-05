/**
 * Inert raw HTML for the markdown preview (audit #10)
 *
 * Markdown permits embedded raw HTML, and `marked` passes it through to the
 * output. The preview must instead show it as harmless literal text: the
 * renderer override below escapes every block- and inline-level `html` token
 * at RENDER time only. The note's stored markdown is never modified, so
 * nothing ever needs un-escaping — the editor textarea always shows exactly
 * what was typed.
 *
 * Markdown's own constructs (headings, emphasis, links, `<https://…>`
 * autolinks) are separate token types and render normally.
 */

import { escapeHtml } from "./text.js";

/**
 * Build a marked renderer override that neutralises raw HTML tokens.
 *
 * Handles both the marked v12 signature (a raw HTML string) and the
 * token-object shape newer marked versions pass, so a future CDN version
 * bump cannot silently turn raw HTML back on.
 * @param {(text: string) => string} [escape] - Injectable for tests
 * @returns {{ html: (input: unknown) => string }} Overrides for marked.use()
 */
export function createInertHtmlRenderer(escape = escapeHtml) {
  return {
    /** @param {unknown} input - Raw HTML string (v12) or token object */
    html(input) {
      const raw = typeof input === "string" ? input : (input?.text ?? "");
      return typeof raw === "string" ? escape(raw) : "";
    },
  };
}
