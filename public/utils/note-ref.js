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
 *
 * How the fragment moves the history stack lives here too: `planHashNavigation`
 * decides, and the component is the only part that touches `history`.
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

/**
 * The marker we write into `history.state` when we push an entry for a note.
 *
 * It is how the app tells its own entries apart from the ones the browser made -
 * the list entry, or an entry from a bookmark, a shared link or a hand-typed
 * URL. That distinction decides whether Back has a list entry to land on, so it
 * cannot be inferred from the URL alone: `/#18` looks the same either way.
 *
 * Plain data on purpose. `pushState` clones its state argument with the
 * structured clone algorithm, so a marker holding a function or a class instance
 * would throw at runtime, on a phone, with no test to catch it.
 *
 * @type {{ noteHash: true }}
 */
export const NOTE_HISTORY_STATE = { noteHash: true };

/**
 * Was this history entry one we pushed for a note?
 *
 * `history.state` is `null` for entries the browser created, so the check is
 * deliberately total: anything that is not exactly the marker is "not ours".
 *
 * @param {unknown} state e.g. globalThis.history.state
 * @returns {boolean}
 */
export function isNoteHistoryEntry(state) {
  return state?.noteHash === true;
}

/**
 * How the fragment and the history stack should move when the view changes.
 *
 * Pure, so the shape of the stack is testable without a browser; the caller is
 * the only part that touches `history`. Harri asked for Back from a note to
 * return to the list (2026-10-21), and the stack is what makes that true: reading
 * a note leaves ONE entry above the list, so Back pops it and lands on the list.
 * Switching note while reading one replaces instead of pushing, so browsing ten
 * notes still leaves one entry to walk back through rather than ten. And because
 * the entry we pushed is consumed when the note closes, Back from the list itself
 * still leaves the app, exactly as before.
 *
 * `currentEntryIsNote` is what keeps the two ways of arriving at a note honest. A
 * note opened from the list already has the list beneath it; a note the browser
 * landed on directly (a bookmark, a shared link) does not, and "seed" gives it
 * one - otherwise Back would leave the app from a bookmarked note but return to
 * the list from a tapped one.
 *
 * @param {object} state
 * @param {string} state.currentHash `location.hash` right now - "#18", or ""
 * @param {string} state.nextHash the fragment the app now wants - "#18", or ""
 * @param {boolean} state.currentEntryIsNote true when the entry we are sitting on
 *   is one we pushed for a note (see `isNoteHistoryEntry`)
 * @returns {"hold"|"seed"|"push"|"swap"|"clear"|"back"} "hold" leaves the URL
 *   alone; "seed" rewrites the current entry as the list and then pushes the note;
 *   "push" adds the note entry above the list; "swap" rewrites our own note entry
 *   in place, so switching notes cannot grow the stack; "clear" rewrites the
 *   current entry as the list (an entry that was never ours); "back" pops the
 *   entry we pushed
 */
export function planHashNavigation({ currentHash, nextHash, currentEntryIsNote }) {
  if (currentHash === nextHash) {
    if (nextHash === "") return "hold";

    // The URL already names this note. If we put it there, the list is already
    // beneath us. If the browser did, nothing is - so seed the list under it and
    // push, and Back lands on the list either way. A reload of a note we pushed
    // keeps the marker in history.state, so it takes the "hold" branch and no
    // second entry is added.
    return currentEntryIsNote ? "hold" : "seed";
  }

  if (nextHash !== "") {
    // Opening a note. One entry above the list, always: from the list, push;
    // switching note while already reading one, swap, so the stack cannot grow
    // with every note browsed.
    return currentEntryIsNote ? "swap" : "push";
  }

  // Closing a note. The entry we pushed is ours to consume, so Back from the list
  // still leaves the app. An entry we did not push has nothing to consume: the
  // fragment is simply cleared where it stands.
  return currentEntryIsNote ? "back" : "clear";
}
