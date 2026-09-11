/**
 * The pin toggle: what the button says, and what the note looks like after it.
 *
 * Pinning is a state change, not an edit - but it does move the note's
 * updated_at on the server (a DB trigger), and the sync layer uses that
 * timestamp for conflict detection. So these helpers keep two things honest:
 * the label the user taps, and the timestamp we remember afterwards.
 */
import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { describePin, withPinResult } from "../../public/utils/pin-state.js";

Deno.test("describePin: an unpinned note offers to pin it", () => {
  const state = describePin({ id: 1, is_pinned: false });
  assertEquals(state.pinned, false);
  assertEquals(state.title, "Pin this note to the top");
  assertEquals(state.nextValue, true);
});

Deno.test("describePin: a pinned note offers to unpin it", () => {
  const state = describePin({ id: 1, is_pinned: true });
  assertEquals(state.pinned, true);
  assertEquals(state.title, "Unpin this note");
  assertEquals(state.nextValue, false);
});

Deno.test("describePin: the button shows no visible text (icon only)", () => {
  // The control is an icon, so the wording exists only as the accessible name.
  // `label` was the visible text; it must not come back without its own test.
  for (const note of [{ id: 1, is_pinned: false }, { id: 1, is_pinned: true }, null]) {
    assert(!("label" in describePin(note)), "no visible text label");
  }
});

Deno.test("the pin button keeps an accessible name while showing only an icon", async () => {
  const source = await Deno.readTextFile(
    new URL("../../public/components/note-editor.js", import.meta.url),
  );
  assert(
    source.includes('aria-label="${this.pinState.title}"'),
    "icon-only controls still need a name for screen readers",
  );
  assert(
    !source.includes("<span>${this.pinState.label}</span>"),
    "the visible text label is gone; the icon carries the meaning",
  );
});

Deno.test("describePin: a missing flag reads as unpinned, never undefined", () => {
  assertEquals(describePin({ id: 1 }).pinned, false);
  assertEquals(describePin({ id: 1 }).title, "Pin this note to the top");
  assertEquals(describePin(null).pinned, false);
});

Deno.test("withPinResult: an optimistic flip keeps every other field", () => {
  const note = {
    id: 7,
    title: "Flight",
    content: "AC123",
    is_pinned: false,
    updated_at: "2026-09-06T16:53:00Z",
    tags: [{ id: 2 }],
  };
  const next = withPinResult(note, { is_pinned: true });
  assertEquals(next.is_pinned, true);
  assertEquals(next.title, "Flight");
  assertEquals(next.tags, note.tags);
  assertEquals(next.updated_at, "2026-09-06T16:53:00Z");
});

Deno.test("withPinResult: the server's timestamp wins over the local one", () => {
  const note = { id: 7, is_pinned: false, updated_at: "2026-09-06T16:53:00Z" };
  const next = withPinResult(note, {
    is_pinned: true,
    updated_at: "2026-09-10T18:00:00Z",
  });
  assertEquals(next.is_pinned, true);
  assertEquals(next.updated_at, "2026-09-10T18:00:00Z");
});

Deno.test("withPinResult: unpinning clears the flag", () => {
  const next = withPinResult({ id: 7, is_pinned: true }, { is_pinned: false });
  assertEquals(next.is_pinned, false);
});

Deno.test("withPinResult: a non-boolean flag is coerced, not stored raw", () => {
  assertEquals(withPinResult({ id: 7 }, { is_pinned: 1 }).is_pinned, true);
  assertEquals(withPinResult({ id: 7 }, { is_pinned: undefined }).is_pinned, false);
});

Deno.test("withPinResult: no note, no crash", () => {
  assertEquals(withPinResult(null, { is_pinned: true }), null);
});
