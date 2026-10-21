/**
 * The note's numeric id, formatted for on-screen display and for the URL
 * fragment that names an open note.
 *
 * Terminal tooling (`hn`) already shows the id; the web UI didn't, so users
 * who think of a note as "note 63" had no way to find that number without
 * leaving the browser. This is the one place that turns an id into the label
 * shown next to it - pure, so the display rule is testable without a DOM.
 *
 * The same label is the deep link: `#18` in the URL opens note 18, so a reload
 * while reading a note lands back in that note. `formatNoteRef` writes the
 * fragment and `parseNoteHash` reads it, both here, because what the UI shows
 * and what the URL accepts have to be one rule or they drift apart.
 */

/**
 * The display label for a note's id, e.g. "#18".
 *
 * Only a positive integer (or a string of digits) counts as a usable id.
 * Anything else - missing note, missing id, zero, negative, fractional,
 * NaN, non-numeric strings, booleans, arrays, objects - returns "" so the
 * caller can skip rendering rather than showing "#undefined" or "#NaN".
 *
 * @param {Object|null} note
 * @returns {string}
 */
export function formatNoteRef(note) {
  const id = note?.id;

  if (typeof id !== "number" && typeof id !== "string") return "";
  if (typeof id === "string" && id.trim() === "") return "";

  const num = Number(id);
  if (!Number.isInteger(num) || num <= 0) return "";

  return `#${num}`;
}

/**
 * The note id carried by a URL fragment, or null when there is not one.
 *
 * The fragment is the same label the UI already shows next to a note ("#18"),
 * so a URL ending in `#18` opens note 18: reloading the page while reading a
 * note keeps you in that note instead of dropping you back to the list. The
 * label and the fragment are one rule, which is why both functions live here -
 * what the UI renders must be what the URL accepts.
 *
 * Strict on purpose: only a plain positive integer with no leading zeros
 * counts. Everything else - "", "#", "#abc", "#18x", "#1.5", "#-1", "#018",
 * "#18 " - returns null, so the caller falls back to the list instead of
 * asking the API for a note that cannot exist.
 *
 * @param {string} hash e.g. globalThis.location.hash - "#18", or "" when absent
 * @returns {number|null}
 */
export function parseNoteHash(hash) {
  if (typeof hash !== "string") return null;

  const match = /^#([1-9]\d*)$/.exec(hash);
  if (!match) return null;

  const id = Number(match[1]);
  return Number.isSafeInteger(id) ? id : null;
}
