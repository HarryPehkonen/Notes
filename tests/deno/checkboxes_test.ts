import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  parseCheckboxTokens,
  toggleCheckbox,
  tokenizeCheckboxes,
} from "../../public/utils/checkboxes.js";

// tokenizeCheckboxes tests

Deno.test("tokenizeCheckboxes: unchecked marker becomes an unchecked token", () => {
  assertEquals(tokenizeCheckboxes("- [ ] buy milk"), "- @@CBU0@@ buy milk");
});

Deno.test("tokenizeCheckboxes: checked marker becomes a checked token", () => {
  assertEquals(tokenizeCheckboxes("- [x] buy milk"), "- @@CBC0@@ buy milk");
});

Deno.test("tokenizeCheckboxes: uppercase [X] is treated as checked", () => {
  assertEquals(tokenizeCheckboxes("- [X] buy milk"), "- @@CBC0@@ buy milk");
});

Deno.test("tokenizeCheckboxes: multiple markers get distinct indices in order", () => {
  assertEquals(
    tokenizeCheckboxes("- [ ] one\n- [x] two\n- [ ] three"),
    "- @@CBU0@@ one\n- @@CBC1@@ two\n- @@CBU2@@ three",
  );
});

Deno.test("tokenizeCheckboxes: works outside list items too", () => {
  assertEquals(tokenizeCheckboxes("status [ ] pending"), "status @@CBU0@@ pending");
});

Deno.test("tokenizeCheckboxes: text without markers is unchanged", () => {
  const markdown = "# Title\n\nJust some prose with [a link](http://x) and [brackets].";
  assertEquals(tokenizeCheckboxes(markdown), markdown);
});

Deno.test("tokenizeCheckboxes: empty string is unchanged", () => {
  assertEquals(tokenizeCheckboxes(""), "");
});

Deno.test("tokenizeCheckboxes: markers inside a fenced code block are not tokenized", () => {
  const markdown = "- [ ] real\n\n```\n- [ ] fake\n- [x] fake\n```\n\n- [x] real";
  assertEquals(
    tokenizeCheckboxes(markdown),
    "- @@CBU0@@ real\n\n```\n- [ ] fake\n- [x] fake\n```\n\n- @@CBC1@@ real",
  );
});

Deno.test("tokenizeCheckboxes: tilde fences are respected", () => {
  assertEquals(
    tokenizeCheckboxes("~~~\n[ ] fake\n~~~\n[ ] real"),
    "~~~\n[ ] fake\n~~~\n@@CBU0@@ real",
  );
});

Deno.test("tokenizeCheckboxes: an unclosed fence swallows the rest of the note", () => {
  assertEquals(tokenizeCheckboxes("```\n[ ] fake\n[x] fake"), "```\n[ ] fake\n[x] fake");
});

Deno.test("tokenizeCheckboxes: markers inside inline code spans are not tokenized", () => {
  assertEquals(
    tokenizeCheckboxes("type `[ ]` to get [ ] a box"),
    "type `[ ]` to get @@CBU0@@ a box",
  );
});

Deno.test("tokenizeCheckboxes: double-backtick spans are respected", () => {
  assertEquals(tokenizeCheckboxes("``a [ ] b`` [x] c"), "``a [ ] b`` @@CBC0@@ c");
});

Deno.test("tokenizeCheckboxes: an unmatched backtick does not hide later markers", () => {
  assertEquals(tokenizeCheckboxes("a ` b [ ] c"), "a ` b @@CBU0@@ c");
});

Deno.test("tokenizeCheckboxes: backslash-escaped bracket is not a checkbox", () => {
  assertEquals(tokenizeCheckboxes("\\[ ] literal [ ] real"), "\\[ ] literal @@CBU0@@ real");
});

Deno.test("tokenizeCheckboxes: near-miss markers are left alone", () => {
  const markdown = "[] empty [  ] wide [y] letter [ x] padded";
  assertEquals(tokenizeCheckboxes(markdown), markdown);
});

Deno.test("tokenizeCheckboxes: non-string input is returned as-is", () => {
  assertEquals(tokenizeCheckboxes(null), null);
  assertEquals(tokenizeCheckboxes(undefined), undefined);
});

// parseCheckboxTokens tests

Deno.test("parseCheckboxTokens: unchecked token becomes an unchecked input", () => {
  assertEquals(
    parseCheckboxTokens("<li>@@CBU0@@ buy milk</li>"),
    '<li><input type="checkbox" data-cb-index="0"> buy milk</li>',
  );
});

Deno.test("parseCheckboxTokens: checked token becomes a checked input", () => {
  assertEquals(
    parseCheckboxTokens("<li>@@CBC3@@ done</li>"),
    '<li><input type="checkbox" data-cb-index="3" checked> done</li>',
  );
});

Deno.test("parseCheckboxTokens: replaces every token in the html", () => {
  assertEquals(
    parseCheckboxTokens("<p>@@CBU0@@ a @@CBC1@@ b</p>"),
    '<p><input type="checkbox" data-cb-index="0"> a <input type="checkbox" data-cb-index="1" checked> b</p>',
  );
});

Deno.test("parseCheckboxTokens: unknown or malformed tokens are left alone", () => {
  const html = "<p>@@CB0@@ @@CBX1@@ @@CBU@@ @@@@</p>";
  assertEquals(parseCheckboxTokens(html), html);
});

Deno.test("parseCheckboxTokens: html without tokens is unchanged", () => {
  const html = "<h1>Title</h1><p>nothing to see</p>";
  assertEquals(parseCheckboxTokens(html), html);
});

Deno.test("parseCheckboxTokens: non-string input is returned as-is", () => {
  assertEquals(parseCheckboxTokens(null), null);
});

// toggleCheckbox tests

Deno.test("toggleCheckbox: unchecked becomes checked", () => {
  assertEquals(toggleCheckbox("- [ ] buy milk", 0), "- [x] buy milk");
});

Deno.test("toggleCheckbox: checked becomes unchecked", () => {
  assertEquals(toggleCheckbox("- [x] buy milk", 0), "- [ ] buy milk");
});

Deno.test("toggleCheckbox: uppercase [X] becomes unchecked", () => {
  assertEquals(toggleCheckbox("- [X] buy milk", 0), "- [ ] buy milk");
});

Deno.test("toggleCheckbox: flips only the requested occurrence", () => {
  const markdown = "- [ ] one\n- [ ] two\n- [ ] three";
  assertEquals(toggleCheckbox(markdown, 1), "- [ ] one\n- [x] two\n- [ ] three");
});

Deno.test("toggleCheckbox: flips the last occurrence", () => {
  const markdown = "- [ ] one\n- [x] two\n- [ ] three";
  assertEquals(toggleCheckbox(markdown, 2), "- [ ] one\n- [x] two\n- [x] three");
});

Deno.test("toggleCheckbox: indices skip markers inside code blocks", () => {
  const markdown = "- [ ] real one\n\n```\n- [ ] fake\n```\n\n- [ ] real two";
  assertEquals(
    toggleCheckbox(markdown, 1),
    "- [ ] real one\n\n```\n- [ ] fake\n```\n\n- [x] real two",
  );
});

Deno.test("toggleCheckbox: indices skip markers inside inline code", () => {
  assertEquals(toggleCheckbox("`[ ]` and [ ] here", 0), "`[ ]` and [x] here");
});

Deno.test("toggleCheckbox: preserves surrounding whitespace and content", () => {
  const markdown = "# Todo\n\n  - [ ] indented item  \n\nTrailing prose.\n";
  assertEquals(
    toggleCheckbox(markdown, 0),
    "# Todo\n\n  - [x] indented item  \n\nTrailing prose.\n",
  );
});

Deno.test("toggleCheckbox: out-of-range index leaves markdown unchanged", () => {
  const markdown = "- [ ] one";
  assertEquals(toggleCheckbox(markdown, 5), markdown);
  assertEquals(toggleCheckbox(markdown, -1), markdown);
});

Deno.test("toggleCheckbox: no markers at all leaves markdown unchanged", () => {
  const markdown = "just prose";
  assertEquals(toggleCheckbox(markdown, 0), markdown);
});

Deno.test("toggleCheckbox: toggling twice round-trips to the original", () => {
  const markdown = "- [ ] one\n- [x] two";
  assertEquals(toggleCheckbox(toggleCheckbox(markdown, 0), 0), markdown);
  assertEquals(toggleCheckbox(toggleCheckbox(markdown, 1), 1), markdown);
});

Deno.test("toggleCheckbox: toggling [X] twice normalizes it to lowercase [x]", () => {
  assertEquals(toggleCheckbox(toggleCheckbox("- [X] one", 0), 0), "- [x] one");
});

Deno.test("toggleCheckbox: non-string input is returned as-is", () => {
  assertEquals(toggleCheckbox(null, 0), null);
});

// Pipeline: the token indices tokenizeCheckboxes emits are the ones
// toggleCheckbox flips, and they survive the markdown -> html round trip.

Deno.test("pipeline: token index from tokenize matches the index toggle flips", () => {
  const markdown = "notes\n\n```\n[ ] fake\n```\n\n- [ ] alpha\n- [x] beta";
  const tokenized = tokenizeCheckboxes(markdown);
  assertEquals(tokenized.includes("@@CBU0@@"), true);
  assertEquals(tokenized.includes("@@CBC1@@"), true);

  // marked.parse would wrap the tokens in list markup; simulate that shape.
  const html = parseCheckboxTokens(
    `<ul><li>@@CBU0@@ alpha</li><li>@@CBC1@@ beta</li></ul>`,
  );
  assertEquals(
    html,
    '<ul><li><input type="checkbox" data-cb-index="0"> alpha</li>' +
      '<li><input type="checkbox" data-cb-index="1" checked> beta</li></ul>',
  );

  // Clicking the input with data-cb-index="0" flips "alpha", not the fenced marker.
  assertEquals(
    toggleCheckbox(markdown, 0),
    "notes\n\n```\n[ ] fake\n```\n\n- [x] alpha\n- [x] beta",
  );
});
