/**
 * The note id shown on screen: "#18" next to the timestamp in the list, and
 * in front of "Updated ..." in the editor. Terminal tooling already exposes
 * the id; this is the pure formatting rule plus the wiring guards that keep
 * both call sites (list has two - grid and list view) actually using it.
 */
import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { formatNoteRef, parseNoteHash } from "../../public/utils/note-ref.js";

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

Deno.test("wiring: notes-app.js keeps the URL fragment and the open note in step", async () => {
  const source = await Deno.readTextFile(
    new URL("../../public/components/notes-app.js", import.meta.url),
  );

  assert(
    source.includes('import { formatNoteRef, parseNoteHash } from "../utils/note-ref.js";'),
    "notes-app.js must import both halves of the id rule from note-ref.js",
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

  // replaceState, not pushState: the fragment tracks the state, it does not add
  // a history entry per note browsed. A pushState here would also let the
  // hashchange listener re-enter itself.
  const syncHash = source.slice(
    source.indexOf("  _syncHash()"),
    source.indexOf("  _openNoteFromHash()"),
  );
  assert(
    syncHash.includes("globalThis.history.replaceState(null,"),
    "_syncHash must use replaceState",
  );
  assert(
    syncHash.includes("formatNoteRef({ id })"),
    "the fragment must be the same label the UI renders",
  );
  assert(
    syncHash.includes("if (this._pendingHashOpen) return;"),
    "_syncHash must not clobber an incoming fragment while the deep link resolves",
  );
  assert(
    !source.includes("history.pushState"),
    "nothing in notes-app.js may push history entries for a fragment change",
  );
});
