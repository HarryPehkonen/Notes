/**
 * The note's numeric id, formatted for on-screen display.
 *
 * Terminal tooling (`hn`) already shows the id; the web UI didn't, so users
 * who think of a note as "note 63" had no way to find that number without
 * leaving the browser. This is the one place that turns an id into the label
 * shown next to it - pure, so the display rule is testable without a DOM.
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
