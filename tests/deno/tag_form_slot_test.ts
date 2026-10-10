/**
 * The tap-through: a form must occupy the slot of the control that opened it.
 *
 * The bug this locks out (Harri's phone, 2026-10-10, unreproducible on desktop): tapping
 * "+ Add Tag" opened the create form 226px ABOVE the current scroll offset, because the
 * form was rendered at the top of the tag list while its trigger sits at the bottom. The
 * browser's scroll anchoring advanced `scrollTop` by exactly the form's height, a live tag
 * row landed under the finger that was still touching the screen, and the next contact hit
 * that row. Same cause, second symptom: the form opened off-screen above a scrolled drawer
 * (measured top of -239px), so the user could not see what they had just asked for.
 *
 * The assertion is the invariant, not the symptom: activating the form must change nothing
 * at an earlier index of the rendered list, because an element that moves is an element
 * that can move under the finger. The browser-level proof of the same property (element
 * identity under the tap point, on a touch-emulated 427x952 viewport) is
 * tests/browser/tap-through.mjs; this one runs in the gate, in milliseconds.
 */
import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { createSlotIndex, tagManagerSlots } from "../../public/utils/tag-form-slot.js";

const TAGS = [{ id: 1, name: "hermes" }, { id: 2, name: "home" }, { id: 3, name: "tng" }];

const kinds = (slots) => slots.map((slot) => slot.kind);

Deno.test("slot model: the list is the tags, then the create control", () => {
  assertEquals(kinds(tagManagerSlots({ tags: TAGS })), ["row", "row", "row", "add-button"]);
});

Deno.test("slot model: opening the create form changes nothing above it", () => {
  const closed = tagManagerSlots({ tags: TAGS });
  const open = tagManagerSlots({ tags: TAGS, showCreateForm: true });

  const button = createSlotIndex(closed);
  const form = createSlotIndex(open);

  // Everything before the activation point is byte-for-byte the same list. An element that
  // moves is an element that can move under the finger.
  assertEquals(kinds(closed).slice(0, button), kinds(open).slice(0, form));
  assertEquals(
    form,
    button,
    "the create form must be the slot the + Add Tag button was - any other index moves rows " +
      "under the activation point (that is the tap-through)",
  );
  assert(
    form > 0 && form === open.length - 1,
    "the trigger is the last slot, so the form is too: a form above the list is the bug",
  );
});

Deno.test("slot model: an edit form takes its own row's place", () => {
  const slots = tagManagerSlots({ tags: TAGS, editingTagId: 2, showCreateForm: true });

  assertEquals(kinds(slots), ["row", "edit-form", "row", "add-button"]);
  assertEquals(slots[1].tagId, 2);
  assertEquals(
    kinds(slots).filter((kind) => kind === "add-button").length,
    1,
    "an edit form must not take over the create slot as well",
  );
});

Deno.test("slot model: offline offers neither form nor trigger", () => {
  assertEquals(kinds(tagManagerSlots({ tags: TAGS, offline: true })), ["row", "row", "row"]);
  assertEquals(kinds(tagManagerSlots({ offline: true })), []);
  assertEquals(createSlotIndex(tagManagerSlots({ tags: TAGS, offline: true })), -1);
});

Deno.test("slot model: editing without a create form still shows the edit form", () => {
  // showCreateForm is the component's single "a form is open" flag; the editing tag decides
  // which slot it takes, and with none it is the create form.
  assertEquals(kinds(tagManagerSlots({ tags: TAGS, editingTagId: 3 })), [
    "row",
    "row",
    "edit-form",
    "add-button",
  ]);
});

Deno.test("tag-manager: the component renders from the slot model", async () => {
  const source = await Deno.readTextFile(
    new URL("../../public/components/tag-manager.js", import.meta.url),
  );

  assert(
    source.includes('from "../utils/tag-form-slot.js"') && source.includes("tagManagerSlots({"),
    "render() must take its order from the slot model, or the rule is just a comment",
  );

  // The shape of the bug, as source: the form was emitted before the All Notes row.
  const formAt = source.indexOf("this.renderTagForm()");
  const listAt = source.indexOf('class="all-tags-option"');
  assert(formAt > -1 && listAt > -1, "expected both the form and the tag list in the template");
  assert(
    formAt > listAt,
    "the first renderTagForm() call sits above the tag list: a form rendered before the rows " +
      "is the tap-through again",
  );
});
