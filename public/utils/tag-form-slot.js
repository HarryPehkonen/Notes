/**
 * Where the tag form sits in the tags drawer.
 *
 * The defect this models away (reported from a phone, 2026-10-10): the create form was
 * rendered at the TOP of `.tags-container` while its trigger, `+ Add Tag`, sits at the
 * BOTTOM. Opening the form inserted its height (226px) above the current scroll offset,
 * the browser's scroll anchoring advanced `scrollTop` by exactly that much, and a live tag
 * row landed under the finger that was still touching the screen - the next contact opened
 * that row's edit form. Same cause, second symptom: the form itself opened off-screen above
 * a scrolled drawer (measured top of -239px), so the user hunted for the form they had just
 * asked for.
 *
 * The rule that replaces it: a form occupies the slot of the control that opened it - the
 * create form where `+ Add Tag` was, an edit form in place of that tag's row. Nothing above
 * the activation point moves, so nothing can relocate under the finger.
 *
 * It is a pure sequence rather than template logic so that the invariant is testable
 * without a browser (`tests/deno/tag_form_slot_test.ts`) and so `render()` has one
 * source of order. The rule, stated as the test's assertion: swapping `add-button` for
 * `create-form` changes no earlier slot.
 */

/**
 * @typedef {{kind: "row"|"edit-form"|"create-form"|"add-button", tagId?: number}} TagSlot
 */

/**
 * The tag list and its form, in render order.
 *
 * @param {Object} [state]
 * @param {Array<{id: number}>} [state.tags] - The user's tags, in list order
 * @param {number|null} [state.editingTagId] - The tag whose edit form is open
 * @param {boolean} [state.showCreateForm] - Whether a form is open
 * @param {boolean} [state.offline] - Offline: neither form nor trigger is offered
 * @returns {TagSlot[]}
 */
export function tagManagerSlots({
  tags = [],
  editingTagId = null,
  showCreateForm = false,
  offline = false,
} = {}) {
  const slots = tags.map((tag) => ({
    kind: tag.id === editingTagId ? "edit-form" : "row",
    tagId: tag.id,
  }));

  if (!offline) {
    // An edit form is not the create form: it belongs in its row's slot, wherever that is,
    // so the trigger keeps its own place at the end.
    const creating = showCreateForm && editingTagId === null;
    slots.push(creating ? { kind: "create-form" } : { kind: "add-button" });
  }

  return slots;
}

/**
 * The index of the create form, or of the `+ Add Tag` trigger standing in for it.
 *
 * The two kinds are one slot seen in two states, which is what keeps the activation point
 * stable: whichever one is rendered, it is this index.
 *
 * @param {TagSlot[]} slots
 * @returns {number} -1 when neither is rendered (offline)
 */
export function createSlotIndex(slots) {
  return slots.findIndex((slot) => slot.kind === "create-form" || slot.kind === "add-button");
}
