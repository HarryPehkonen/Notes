import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { stripMarkdown } from "../../server/database/client.js";

Deno.test("stripMarkdown: removes headers", () => {
  assertEquals(stripMarkdown("# Hello"), "Hello");
  assertEquals(stripMarkdown("## World"), "World");
  assertEquals(stripMarkdown("###### Deep"), "Deep");
});

Deno.test("stripMarkdown: removes bold and italic formatting", () => {
  assertEquals(stripMarkdown("**bold** and *italic*"), "bold and italic");
});

Deno.test("stripMarkdown: removes strikethrough", () => {
  assertEquals(stripMarkdown("~~deleted~~"), "deleted");
});

Deno.test("stripMarkdown: extracts link text", () => {
  assertEquals(stripMarkdown("[click here](https://example.com)"), "click here");
});

Deno.test("stripMarkdown: handles images (link regex consumes bracket content)", () => {
  // The link regex runs before image regex, so ![alt](url) -> !alt
  assertEquals(stripMarkdown("![alt text](image.png)"), "!alt text");
});

Deno.test("stripMarkdown: strips backticks from code blocks (formatting regex runs first)", () => {
  // Formatting regex strips backticks before the code block regex can match
  assertEquals(stripMarkdown("before\n```\ncode\n```\nafter"), "before\ncode\nafter");
});

Deno.test("stripMarkdown: strips backticks from inline code (formatting regex runs first)", () => {
  // Backticks are removed by formatting regex, leaving content intact
  assertEquals(stripMarkdown("use `console.log` here"), "use console.log here");
});

Deno.test("stripMarkdown: removes unordered list markers", () => {
  assertEquals(stripMarkdown("- item one\n- item two"), "item one\nitem two");
  // A bullet is a bullet: since the emphasis rule only fires on a *pair* of markers
  // (a "* " at the start of a line has no partner), the list rule strips it cleanly.
  // This used to expect "item one\n item two" -- the stray leading space was the
  // blanket formatting strip eating the bullet before the list rule saw it.
  assertEquals(stripMarkdown("* item one\n* item two"), "item one\nitem two");
  assertEquals(stripMarkdown("+ item one\n+ item two"), "item one\nitem two");
});

Deno.test("stripMarkdown: removes numbered list markers", () => {
  assertEquals(stripMarkdown("1. first\n2. second"), "first\nsecond");
});

Deno.test("stripMarkdown: collapses multiple newlines", () => {
  assertEquals(stripMarkdown("para one\n\n\npara two"), "para one\npara two");
});

Deno.test("stripMarkdown: handles null input", () => {
  assertEquals(stripMarkdown(null), "");
});

Deno.test("stripMarkdown: handles undefined input", () => {
  assertEquals(stripMarkdown(undefined), "");
});

Deno.test("stripMarkdown: handles empty string", () => {
  assertEquals(stripMarkdown(""), "");
});

Deno.test("stripMarkdown: handles plain text without markdown", () => {
  assertEquals(stripMarkdown("just plain text"), "just plain text");
});

Deno.test("stripMarkdown: handles nested markdown", () => {
  const input = "# Title\n\n**bold [link](url)** and *italic*";
  const result = stripMarkdown(input);
  assertEquals(result, "Title\nbold link and italic");
});

Deno.test("stripMarkdown: keeps underscores inside identifiers", () => {
  // The underscore in std::size_t is not emphasis, and eating it made C++ notes
  // unsearchable by the names they are about.
  assertEquals(stripMarkdown("std::size_t"), "std::size_t");
  assertEquals(stripMarkdown("std::erase_if"), "std::erase_if");
  assertEquals(stripMarkdown("a_b_c"), "a_b_c");
  assertEquals(
    stripMarkdown("for (std::size_t i = 0; i < v.size(); ++i)"),
    "for (std::size_t i = 0; i < v.size(); ++i)",
  );
});

Deno.test("stripMarkdown: still removes emphasis, and leaves arithmetic alone", () => {
  assertEquals(stripMarkdown("_a subtitle_"), "a subtitle");
  assertEquals(stripMarkdown("*italic*"), "italic");
  assertEquals(stripMarkdown("~~gone~~"), "gone");
  assertEquals(stripMarkdown("int *p = &x;"), "int *p = &x;");
});
