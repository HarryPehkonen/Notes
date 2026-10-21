/**
 * The note id shown on screen: "#18" next to the timestamp in the list, and
 * in front of "Updated ..." in the editor. Terminal tooling already exposes
 * the id; this is the pure formatting rule plus the wiring guards that keep
 * both call sites (list has two - grid and list view) actually using it.
 */
import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  formatNoteRef,
  isNoteHistoryEntry,
  NOTE_HISTORY_STATE,
  parseNoteHash,
  planHashNavigation,
} from "../../public/utils/note-ref.js";

Deno.test("formatNoteRef: a positive integer id becomes #id", () => {
  assertEquals(formatNoteRef({ id: 18 }), "#18");
  assertEquals(formatNoteRef({ id: 1 }), "#1");
});

Deno.test("formatNoteRef: a digit string id becomes #id too", () => {
  assertEquals(formatNoteRef({ id: "18" }), "#18");
});

Deno.test("formatNoteRef: no note, no id, no crash", () => {
  assertEquals(formatNoteRef(null), "");
  assertEquals(formatNoteRef(undefined), "");
  assertEquals(formatNoteRef({}), "");
});

Deno.test("formatNoteRef: zero and negative ids are not usable", () => {
  assertEquals(formatNoteRef({ id: 0 }), "");
  assertEquals(formatNoteRef({ id: -1 }), "");
  assertEquals(formatNoteRef({ id: "-1" }), "");
});

Deno.test("formatNoteRef: fractional and NaN ids are not usable", () => {
  assertEquals(formatNoteRef({ id: 1.5 }), "");
  assertEquals(formatNoteRef({ id: NaN }), "");
});

Deno.test("formatNoteRef: non-numeric strings are not usable", () => {
  assertEquals(formatNoteRef({ id: "" }), "");
  assertEquals(formatNoteRef({ id: "abc" }), "");
});

Deno.test("formatNoteRef: an already-prefixed id is not the caller's job to double-handle", () => {
  assertEquals(formatNoteRef({ id: "#18" }), "");
});

Deno.test("formatNoteRef: booleans, arrays and objects are not usable ids", () => {
  assertEquals(formatNoteRef({ id: true }), "");
  assertEquals(formatNoteRef({ id: false }), "");
  assertEquals(formatNoteRef({ id: [18] }), "");
  assertEquals(formatNoteRef({ id: { value: 18 } }), "");
});

Deno.test("formatNoteRef: never renders #undefined or #NaN", () => {
  for (const note of [null, undefined, {}, { id: undefined }, { id: NaN }, { id: "abc" }]) {
    const label = formatNoteRef(note);
    assert(!label.includes("undefined"), `unexpected: ${label}`);
    assert(!label.includes("NaN"), `unexpected: ${label}`);
  }
});

Deno.test("wiring: note-list.js renders the id in both grid and list views", async () => {
  const source = await Deno.readTextFile(
    new URL("../../public/components/note-list.js", import.meta.url),
  );
  assert(
    source.includes('from "../utils/note-ref.js"'),
    "note-list.js must import formatNoteRef",
  );
  // The ref is computed once per card (`const ref = formatNoteRef(note)`) and
  // reused, so the call site itself is singular - what must not regress is
  // that BOTH the list-view and grid-view branches actually render it. One
  // view is the known trap: easy to wire the other and forget it.
  const renderSites = source.match(/class="note-id"/g) || [];
  assertEquals(
    renderSites.length,
    2,
    "expected the id span in both the list-view and grid-view branches",
  );
});

Deno.test("wiring: note-editor.js renders the id before 'Updated' in the doc-meta line", async () => {
  const source = await Deno.readTextFile(
    new URL("../../public/components/note-editor.js", import.meta.url),
  );
  assert(
    source.includes('from "../utils/note-ref.js"'),
    "note-editor.js must import formatNoteRef",
  );
  const callSites = source.match(/formatNoteRef\(/g) || [];
  assertEquals(callSites.length, 1, "expected exactly one formatNoteRef( call site");

  const metaStart = source.indexOf('class="doc-meta"');
  assert(metaStart !== -1, "doc-meta block not found");
  const metaRegion = source.slice(metaStart, metaStart + 400);
  const refIndex = metaRegion.indexOf("noteRef");
  const updatedIndex = metaRegion.indexOf("Updated");
  assert(refIndex !== -1, "noteRef not rendered in doc-meta region");
  assert(updatedIndex !== -1, "Updated text not found in doc-meta region");
  assert(refIndex < updatedIndex, "the id must render before the word 'Updated'");
});

// ---------------------------------------------------------------------------
// The deep link: the URL fragment names the open note, so reloading the page
// while reading a note lands back in that note.
// ---------------------------------------------------------------------------

Deno.test("parseNoteHash: a fragment with a plain positive id is that id", () => {
  assertEquals(parseNoteHash("#18"), 18);
  assertEquals(parseNoteHash("#1"), 1);
  assertEquals(parseNoteHash("#1234567"), 1234567);
});

Deno.test("parseNoteHash: no fragment, or a fragment without an id, is null", () => {
  assertEquals(parseNoteHash(""), null);
  assertEquals(parseNoteHash("#"), null);
  assertEquals(parseNoteHash("#abc"), null);
  assertEquals(parseNoteHash("#18x"), null);
  assertEquals(parseNoteHash("#18 "), null);
  assertEquals(parseNoteHash(" #18"), null);
  assertEquals(parseNoteHash("18"), null);
});

Deno.test("parseNoteHash: zero, negatives, fractions and leading zeros are null", () => {
  assertEquals(parseNoteHash("#0"), null);
  assertEquals(parseNoteHash("#-1"), null);
  assertEquals(parseNoteHash("#1.5"), null);
  // "#018" is not a label the UI writes ("018" renders as #18), so it is not
  // one the URL accepts either - the two halves of the rule stay one rule.
  assertEquals(parseNoteHash("#018"), null);
});

Deno.test("parseNoteHash: a non-string argument is null, never a crash", () => {
  assertEquals(parseNoteHash(null), null);
  assertEquals(parseNoteHash(undefined), null);
  assertEquals(parseNoteHash(18), null);
  assertEquals(parseNoteHash({ hash: "#18" }), null);
});

Deno.test("parseNoteHash: an id too large to be a safe integer is null", () => {
  assertEquals(parseNoteHash("#99999999999999999999"), null);
});

Deno.test("round trip: every label formatNoteRef writes, parseNoteHash reads back", () => {
  // The fragment IS the label shown next to the note, so these two must agree
  // for every id the app can render - a drift here would deep-link to the
  // wrong note, or to no note at all.
  for (const id of [1, 18, 63, 1234567, "18", "1"]) {
    const label = formatNoteRef({ id });
    assert(label !== "", `expected a label for id ${id}`);
    assertEquals(parseNoteHash(label), Number(id));
  }
});

// -------------------------------------------------------------------- history plan
// Harri, 2026-10-21: "Back should return to the list." So reading a note puts ONE
// entry above the list and Back pops it. Browsing ten notes must still leave one
// entry, not ten - which is why switching notes replaces rather than pushes. The
// plan is pure, so the shape of the stack is testable without a browser;
// _syncHash is the only part that touches history.

Deno.test("planHashNavigation: opening a note from the list pushes one entry", () => {
  assertEquals(
    planHashNavigation({ currentHash: "", nextHash: "#18", currentEntryIsNote: false }),
    "push",
  );
});

Deno.test("planHashNavigation: a bookmarked note seeds the list beneath it", () => {
  // The browser made this entry (a bookmark, a shared link, a hand-typed URL), so
  // there is no list entry under it to go back to. Rewrite it as the list, then
  // push the note - otherwise Back would leave the app instead of returning to
  // the list, and the two ways of arriving at a note would behave differently.
  assertEquals(
    planHashNavigation({ currentHash: "#18", nextHash: "#18", currentEntryIsNote: false }),
    "seed",
  );
});

Deno.test("planHashNavigation: a note we already pushed holds the URL still", () => {
  // Also the reload case: the pushed entry keeps its state, so a reload of a
  // deep link must not seed or push a second time.
  assertEquals(
    planHashNavigation({ currentHash: "#18", nextHash: "#18", currentEntryIsNote: true }),
    "hold",
  );
});

Deno.test("planHashNavigation: switching notes swaps, so the stack cannot grow", () => {
  assertEquals(
    planHashNavigation({ currentHash: "#18", nextHash: "#63", currentEntryIsNote: true }),
    "swap",
  );
});

Deno.test("planHashNavigation: closing a note consumes the entry it pushed", () => {
  assertEquals(
    planHashNavigation({ currentHash: "#18", nextHash: "", currentEntryIsNote: true }),
    "back",
  );
  // An entry we did not push has nothing to consume - clear the fragment in place.
  assertEquals(
    planHashNavigation({ currentHash: "#18", nextHash: "", currentEntryIsNote: false }),
    "clear",
  );
});

Deno.test("planHashNavigation: the list with no fragment holds the URL still", () => {
  assertEquals(
    planHashNavigation({ currentHash: "", nextHash: "", currentEntryIsNote: false }),
    "hold",
  );
});

Deno.test("planHashNavigation: at most one note entry above the list, ever", () => {
  // Walk a browsing session - list, open a note, switch notes twice, close - and
  // count the pushes. A second push means Back walks back through notes instead
  // of returning to the list, which is the whole point of the plan.
  //
  // The bookkeeping here is the caller's, and it is not obvious: after opening or
  // switching, the entry we sit on is OURS (that is what "swap" preserves); after
  // closing, it is the list's again, whichever action got us there.
  let currentHash = "";
  let currentEntryIsNote = false;
  const actions = [];
  for (const nextHash of ["#18", "#63", "#92", ""]) {
    const action = planHashNavigation({ currentHash, nextHash, currentEntryIsNote });
    actions.push(action);
    currentEntryIsNote = nextHash !== "";
    currentHash = nextHash;
  }
  assertEquals(actions, ["push", "swap", "swap", "back"]);
  assertEquals(actions.filter((a) => a === "push").length, 1);
});

Deno.test("the history marker survives the structured clone pushState performs", () => {
  // pushState clones its state argument with the structured clone algorithm, so a
  // marker holding a function or a class instance throws at runtime - in a
  // browser, on a phone. Guard the shape here instead.
  const cloned = JSON.parse(JSON.stringify(NOTE_HISTORY_STATE));
  assertEquals(isNoteHistoryEntry(cloned), true);
  assertEquals(isNoteHistoryEntry(null), false);
  assertEquals(isNoteHistoryEntry(undefined), false);
  assertEquals(isNoteHistoryEntry({}), false);
  assertEquals(isNoteHistoryEntry({ noteHash: "yes" }), false);
  assertEquals(isNoteHistoryEntry({ noteHash: true, other: 1 }), true);
});

Deno.test("wiring: notes-app.js keeps the URL fragment and the open note in step", async () => {
  const source = await Deno.readTextFile(
    new URL("../../public/components/notes-app.js", import.meta.url),
  );

  assert(
    source.includes('} from "../utils/note-ref.js";') &&
      source.includes("formatNoteRef,") &&
      source.includes("parseNoteHash,") &&
      source.includes("planHashNavigation,") &&
      source.includes("isNoteHistoryEntry,"),
    "notes-app.js must import every half of the id rule from note-ref.js",
  );

  // The fragment is read when it changes under us...
  assert(
    source.includes('globalThis.addEventListener("hashchange", this._boundHandleHashChange)'),
    "the hashchange listener must be registered",
  );
  // ...and unregistered, because the element can be disconnected and rebuilt.
  assert(
    source.includes('globalThis.removeEventListener("hashchange", this._boundHandleHashChange)'),
    "the hashchange listener must be removed on disconnect",
  );

  // Without this call the fragment would be written but never read on load:
  // the URL would look right and the refresh would still drop you on the list.
  const setup = source.slice(
    source.indexOf("  _setupHashSync()"),
    source.indexOf("  _removeHashSync()"),
  );
  assert(
    setup.includes("this._openNoteFromHash()"),
    "_setupHashSync must open the note the URL names",
  );

  // The wait for NotesApp is load-bearing, not decoration. index.html parses
  // <notes-app> into the document and app.js imports this module at the top of
  // its own, so this runs while app.js's body is still pending and
  // globalThis.NotesApp is not published yet. Without the wait a reload of a
  // deep link threw "Cannot read properties of undefined (reading 'getNote')"
  // and then cleared the fragment - the exact bug the fragment exists to fix.
  // Measured in a browser (probe2) before and after the fix.
  const openFromHash = source.slice(
    source.indexOf("  async _openNoteFromHash()"),
    source.indexOf("  async _handleHashChange()"),
  );
  assert(
    openFromHash.includes("await this.waitForNotesApp()"),
    "_openNoteFromHash must wait for NotesApp before opening a deep link",
  );
  assert(
    openFromHash.indexOf("await this.waitForNotesApp()") <
      openFromHash.indexOf("this._openNoteById("),
    "the wait must come before the open, not after it",
  );

  // Written from the one hook that sees every open and close (open, close,
  // filter change, waiting-on, delete), not from each of those call sites.
  const updated = source.slice(
    source.indexOf("  updated(changedProperties)"),
    source.indexOf("  _setupHashSync()"),
  );
  assert(updated.includes("this._syncHash()"), "updated() must sync the fragment");
  assert(
    updated.includes('changedProperties.has("currentNote")') &&
      updated.includes('changedProperties.has("viewMode")'),
    "updated() must sync on both the open note and the view mode",
  );

  // The decision lives in planHashNavigation, which the tests above pin down one
  // case at a time; _syncHash is only the part that touches history. Back from a
  // note must land on the list (Harri, 2026-10-21), which is what the pushed
  // entry is for - and "back" is how the entry we pushed gets consumed, so Back
  // from the list itself still leaves the app.
  //
  // The end marker matters: `_openNoteFromHash` is declared `async`, so a slice
  // bounded by the bare name finds nothing, indexOf returns -1, and the slice
  // runs to the end of the file - where every OTHER switch in the app lives.
  // Assertions that only check `includes` survive that silently; the table check
  // below does not.
  const syncHash = source.slice(
    source.indexOf("  _syncHash()"),
    source.indexOf("  async _openNoteFromHash()"),
  );
  assert(
    syncHash.includes("planHashNavigation({"),
    "_syncHash must delegate the history decision to planHashNavigation",
  );
  assert(
    syncHash.includes("isNoteHistoryEntry("),
    "_syncHash must ask whether the current entry is one we pushed",
  );
  assert(
    syncHash.includes("globalThis.history.pushState("),
    "opening a note must push a history entry, so Back returns to the list",
  );
  assert(
    syncHash.includes("globalThis.history.replaceState(null,"),
    "_syncHash must still be able to write without adding an entry",
  );
  assert(
    syncHash.includes("globalThis.history.back()"),
    "closing a note we pushed must consume that entry",
  );
  assert(
    syncHash.includes("formatNoteRef({ id })"),
    "the fragment must be the same label the UI renders",
  );
  assert(
    syncHash.includes("if (this._pendingHashOpen) return;"),
    "_syncHash must not clobber an incoming fragment while the deep link resolves",
  );
  // One entry per note view, and only ever from _syncHash: a pushState anywhere
  // else would grow the stack behind _syncHash's back, and Back would stop
  // landing on the list. `history.back()` is the only other history call.
  const pushes = source.match(/globalThis\.history\.pushState\(/g) || [];
  assertEquals(pushes.length, 2, "pushState belongs in _syncHash's two open actions, nowhere else");
  assertEquals(
    source.match(/globalThis\.history\.back\(/g)?.length,
    1,
    "history.back() belongs in _syncHash's close action only",
  );
});

Deno.test("wiring: every action _syncHash's switch handles makes the right history call", async () => {
  // The switch IS the wiring between the plan and the browser, and the first
  // sabotage round walked straight through the string checks above: renaming the
  // "back" label while leaving its body in place kept the old assertions green
  // and the app broken. So read the switch as a table - label to history calls -
  // and pin the whole table, so a renamed or reordered case fails by name.
  const source = await Deno.readTextFile(
    new URL("../../public/components/notes-app.js", import.meta.url),
  );
  const syncHash = source.slice(
    source.indexOf("  _syncHash()"),
    source.indexOf("  async _openNoteFromHash()"),
  );
  const switchBlock = syncHash.slice(syncHash.indexOf("switch (action) {"));

  const parts = switchBlock.split(/case "([a-z]+)":/);
  const calls = {};
  for (let i = 1; i < parts.length; i += 2) {
    calls[parts[i]] = (parts[i + 1].match(/globalThis\.history\.(\w+)\(/g) || [])
      .map((call) => call.slice("globalThis.history.".length, -1));
  }

  assertEquals(calls, {
    hold: [],
    seed: ["replaceState", "pushState"],
    push: ["pushState"],
    swap: ["replaceState"],
    clear: ["replaceState"],
    back: ["back"],
  });
});
