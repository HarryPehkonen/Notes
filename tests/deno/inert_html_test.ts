import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { Marked } from "https://cdn.jsdelivr.net/npm/marked@12.0.0/+esm";
import { createInertHtmlRenderer } from "../../public/utils/inert-html.js";
import { parseCheckboxTokens, tokenizeCheckboxes } from "../../public/utils/checkboxes.js";

/** A fresh marked instance configured exactly like the note editor's */
function editorMarked() {
  const instance = new Marked();
  instance.use({ breaks: true, gfm: true, renderer: createInertHtmlRenderer() });
  return instance;
}

// Renderer factory (unit)

Deno.test("createInertHtmlRenderer: escapes a raw-string html token (marked v12 shape)", () => {
  const renderer = createInertHtmlRenderer();
  assertEquals(renderer.html("<b>hi</b>"), "&lt;b&gt;hi&lt;/b&gt;");
});

Deno.test("createInertHtmlRenderer: escapes a token-object html token (newer marked shape)", () => {
  // A future CDN version bump must not silently turn raw HTML back on
  const renderer = createInertHtmlRenderer();
  assertEquals(renderer.html({ text: "<script>x</script>" }), "&lt;script&gt;x&lt;/script&gt;");
});

Deno.test("createInertHtmlRenderer: empty and malformed input renders as nothing", () => {
  const renderer = createInertHtmlRenderer();
  assertEquals(renderer.html(""), "");
  assertEquals(renderer.html(null), "");
  assertEquals(renderer.html(undefined), "");
  assertEquals(renderer.html({}), "");
});

// End-to-end through marked@12.0.0 (the pinned CDN version)

Deno.test("markdown preview: block-level raw HTML comes out as visible, inert text", () => {
  const out = editorMarked().parse("<style>body{display:none}</style>\n\nhello");
  assert(!out.includes("<style>"), `style tag survived: ${out}`);
  assert(out.includes("&lt;style&gt;"), `expected escaped literal, got: ${out}`);
  assert(out.includes("hello"));
});

Deno.test("markdown preview: inline raw HTML comes out as visible, inert text", () => {
  const out = editorMarked().parse("before <b onmouseover=x>bold?</b> after");
  assert(!out.includes("<b "), `inline tag survived: ${out}`);
  assert(out.includes("&lt;b onmouseover=x&gt;"), `expected escaped literal, got: ${out}`);
});

Deno.test("markdown preview: real markdown still renders normally", () => {
  const out = editorMarked().parse("# Title\n\nSome **bold** and a [link](https://example.com)");
  assert(out.includes("<h1"), `heading lost: ${out}`);
  assert(out.includes("<strong>bold</strong>"), `emphasis lost: ${out}`);
  assert(out.includes('<a href="https://example.com"'), `link lost: ${out}`);
});

Deno.test("markdown preview: autolinks in angle brackets are links, not escaped text", () => {
  // <https://...> is markdown autolink syntax, tokenized before raw HTML
  const out = editorMarked().parse("see <https://example.com> please");
  assert(out.includes('<a href="https://example.com"'), `autolink lost: ${out}`);
});

Deno.test("markdown preview: checkbox placeholder tokens pass through untouched", () => {
  // tokenizeCheckboxes emits plain-text @@CB..@@ tokens; escaping must not eat them
  const out = editorMarked().parse("@@CBU0@@ buy milk");
  assert(out.includes("@@CBU0@@"), `checkbox token mangled: ${out}`);
});

Deno.test("markdown preview: full checkbox pipeline still yields toggleable inputs", () => {
  // The editor's exact renderMarkdown pipeline (minus DOMPurify): tokenize,
  // parse with the inert renderer, convert tokens to <input> elements. The
  // data-cb-index attribute is what makes tap-to-toggle work in view mode.
  const source = "- [ ] buy milk\n- [x] done thing\n\n<b>not a checkbox</b>";
  const out = parseCheckboxTokens(editorMarked().parse(tokenizeCheckboxes(source)));

  assert(
    out.includes('<input type="checkbox" data-cb-index="0">'),
    `unchecked box lost: ${out}`,
  );
  assert(
    out.includes('<input type="checkbox" data-cb-index="1" checked>'),
    `checked box lost: ${out}`,
  );
  assert(out.includes("&lt;b&gt;"), `raw HTML not inert alongside checkboxes: ${out}`);
});
