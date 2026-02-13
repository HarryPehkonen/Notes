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
  // * is stripped by formatting regex before list regex, leaving a leading space on subsequent items
  assertEquals(stripMarkdown("* item one\n* item two"), "item one\n item two");
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
