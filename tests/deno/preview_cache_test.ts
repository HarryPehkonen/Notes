/**
 * The preview must not be re-rendered when nothing about it changed.
 *
 * The bug this locks out (Harri's phone, notes #123/#124): tapping a checkbox
 * in View mode threw the view back up the note. Measured on a touch viewport:
 * scrollTop 150 -> 0, 400 -> 0, 700 -> 234 on the tap that ticked the box.
 * Re-rendering the preview replaces every node, and the browser drops the
 * scroller when that happens; the browser has already ticked the input, so the
 * markup does not need to move at all.
 *
 * Invariant: the markup handed to the DOM is only replaced when the markdown
 * source it came from actually changed - never for a checkbox tap, and never
 * for an unrelated re-render (a save status change, a tag reload).
 */
import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { advancePreviewSource, previewMarkup } from "../../public/utils/preview-cache.js";

const content = "- [ ] one\n- [x] two";
let renders = 0;
const render = (source: string) => {
  renders++;
  return `<html from ${JSON.stringify(source)}>`;
};

Deno.test("previewMarkup: first render has no cache to reuse", () => {
  renders = 0;
  const cache = previewMarkup(null, content, render);
  assertEquals(renders, 1);
  assertEquals(cache.source, content);
});

Deno.test("previewMarkup: unchanged content hands the SAME markup back", () => {
  const cache = previewMarkup(null, content, render);
  renders = 0;
  const again = previewMarkup(cache, content, render);
  assertEquals(renders, 0, "no re-render means no node replacement, so the scroller stays put");
  assertEquals(again.html, cache.html);
});

Deno.test("previewMarkup: edited content renders fresh", () => {
  const cache = previewMarkup(null, content, render);
  renders = 0;
  const next = previewMarkup(cache, content + "\n- [ ] three", render);
  assertEquals(renders, 1);
  assert(next.html !== cache.html);
  assertEquals(next.source, content + "\n- [ ] three");
});

Deno.test("advancePreviewSource: a ticked box keeps the markup already on screen", () => {
  const cache = previewMarkup(null, content, render);
  const ticked = content.replace("- [ ] one", "- [x] one");
  const advanced = advancePreviewSource(cache, ticked);

  assertEquals(
    advanced?.html,
    cache.html,
    "the browser already ticked the input; do not replace the DOM",
  );
  assertEquals(
    advanced?.source,
    ticked,
    "the source must move forward or the next render would re-render",
  );

  renders = 0;
  const after = previewMarkup(advanced, ticked, render);
  assertEquals(
    renders,
    0,
    "the render that follows the tap (markAsChanged) must not rebuild the preview",
  );
  assertEquals(after.html, cache.html);

  renders = 0;
  const later = previewMarkup(after, ticked + "\nmore", render);
  assertEquals(renders, 1, "a real edit still re-renders");
  assert(later.html !== cache.html);
});

Deno.test("advancePreviewSource: null cache stays null (preview never rendered)", () => {
  assertEquals(advancePreviewSource(null, content), null);
});

Deno.test("a cleared cache (view mode flip / note switch) renders fresh", () => {
  const cache = previewMarkup(null, content, render);
  renders = 0;
  const afterFlip = previewMarkup(null, content, render);
  assertEquals(renders, 1, "cached checked attributes must not survive a preview teardown");
  assert(afterFlip.html === cache.html, "same source renders the same markup");
});
