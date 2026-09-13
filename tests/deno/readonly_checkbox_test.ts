/**
 * Read-only checkbox rendering — the bug this fixes (found live 2026-09-12):
 *
 * The editor listens for `input`/`change` on ITSELF, so a native checkbox toggle
 * anywhere inside the component marks the note dirty. In the read-only version
 * preview that meant tapping a checkbox flagged the note "unsaved" — a read-only
 * view that could still write. These tests pin the source-level fix: rendered
 * checkboxes in that view carry `disabled`, so there is no event to begin with.
 */
import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { disableCheckboxInputs } from "../../public/utils/checkboxes.js";

Deno.test("disableCheckboxInputs: a rendered checkbox can no longer be toggled", () => {
  const html = '<input type="checkbox" data-cb-index="0"></li>';
  const out = disableCheckboxInputs(html);
  assertStringIncludes(out, "disabled");
  assertStringIncludes(out, 'data-cb-index="0"');
  assertEquals(/<input[^>]*type="checkbox"[^>]*>/.test(out), true);
});

Deno.test("disableCheckboxInputs: an already-disabled checkbox is left alone", () => {
  const html = '<input type="checkbox" disabled data-cb-index="2">';
  assertEquals(disableCheckboxInputs(html), html);
  assertEquals(disableCheckboxInputs(html).match(/disabled/g).length, 1);
});

Deno.test("disableCheckboxInputs: is idempotent", () => {
  const once = disableCheckboxInputs('<input type="checkbox" checked>');
  assertEquals(disableCheckboxInputs(once), once);
});

Deno.test("disableCheckboxInputs: handles single quotes and attribute order", () => {
  const out = disableCheckboxInputs("<input data-cb-index='1' type='checkbox' checked>");
  assertStringIncludes(out, "disabled");
  assertEquals(out.match(/disabled/g).length, 1);
});

Deno.test("disableCheckboxInputs: leaves other inputs and markup untouched", () => {
  const html = '<input type="text" value="hi"><p>plain</p>';
  assertEquals(disableCheckboxInputs(html), html);
});

Deno.test("disableCheckboxInputs: keeps the self-closing form self-closing", () => {
  const out = disableCheckboxInputs('<input type="checkbox" />');
  assertStringIncludes(out, "disabled />");
});

Deno.test("disableCheckboxInputs: many checkboxes all get disabled", () => {
  const html = '<input type="checkbox">a<input type="checkbox">b<input type="checkbox" disabled>c';
  const out = disableCheckboxInputs(html);
  assertEquals(out.match(/disabled/g).length, 3);
});

Deno.test("disableCheckboxInputs: non-string input passes straight through", () => {
  assertEquals(disableCheckboxInputs(undefined), undefined);
  assertEquals(disableCheckboxInputs(null), null);
});

Deno.test("disableCheckboxInputs: text that merely mentions a checkbox is untouched", () => {
  const html = "the word checkbox and an input type=checkbox in prose";
  assertEquals(disableCheckboxInputs(html), html);
});
