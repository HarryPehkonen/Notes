import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { escapeHtml, highlightText } from "../../public/utils/text.js";

// escapeHtml tests

Deno.test("escapeHtml: escapes ampersands", () => {
  assertEquals(escapeHtml("foo & bar"), "foo &amp; bar");
});

Deno.test("escapeHtml: escapes angle brackets", () => {
  assertEquals(escapeHtml("<script>alert('xss')</script>"), "&lt;script&gt;alert(&#039;xss&#039;)&lt;/script&gt;");
});

Deno.test("escapeHtml: escapes quotes", () => {
  assertEquals(escapeHtml('He said "hello"'), "He said &quot;hello&quot;");
});

Deno.test("escapeHtml: escapes single quotes", () => {
  assertEquals(escapeHtml("it's"), "it&#039;s");
});

Deno.test("escapeHtml: handles empty string", () => {
  assertEquals(escapeHtml(""), "");
});

Deno.test("escapeHtml: passes through plain text", () => {
  assertEquals(escapeHtml("hello world"), "hello world");
});

Deno.test("escapeHtml: handles already-escaped input (double escapes)", () => {
  assertEquals(escapeHtml("&amp;"), "&amp;amp;");
});

Deno.test("escapeHtml: handles all special chars together", () => {
  assertEquals(escapeHtml(`<div class="x" data-val='a&b'>`), `&lt;div class=&quot;x&quot; data-val=&#039;a&amp;b&#039;&gt;`);
});

// highlightText tests

Deno.test("highlightText: highlights basic match", () => {
  const result = highlightText("hello world", "world");
  assertEquals(result, 'hello <span class="highlight">world</span>');
});

Deno.test("highlightText: case insensitive match", () => {
  const result = highlightText("Hello World", "hello");
  assertEquals(result, '<span class="highlight">Hello</span> World');
});

Deno.test("highlightText: escapes regex special chars in query", () => {
  const result = highlightText("price is $5.00", "$5.00");
  assertEquals(result, 'price is <span class="highlight">$5.00</span>');
});

Deno.test("highlightText: escapes HTML in text before highlighting", () => {
  const result = highlightText("<b>bold</b> text", "bold");
  assertEquals(result, '&lt;b&gt;<span class="highlight">bold</span>&lt;/b&gt; text');
});

Deno.test("highlightText: escapes HTML in query", () => {
  const result = highlightText("use <br> for breaks", "<br>");
  assertEquals(result, 'use <span class="highlight">&lt;br&gt;</span> for breaks');
});

Deno.test("highlightText: returns text unchanged when no match", () => {
  const result = highlightText("hello world", "xyz");
  assertEquals(result, "hello world");
});

Deno.test("highlightText: returns text as-is when query is empty", () => {
  const result = highlightText("hello world", "");
  assertEquals(result, "hello world");
});

Deno.test("highlightText: returns text as-is when query is null/undefined", () => {
  assertEquals(highlightText("hello", null), "hello");
  assertEquals(highlightText("hello", undefined), "hello");
});

Deno.test("highlightText: returns falsy text as-is when text is empty", () => {
  assertEquals(highlightText("", "query"), "");
  assertEquals(highlightText(null, "query"), null);
});

Deno.test("highlightText: highlights multiple occurrences", () => {
  const result = highlightText("the cat sat on the mat", "the");
  assertEquals(
    result,
    '<span class="highlight">the</span> cat sat on <span class="highlight">the</span> mat',
  );
});
