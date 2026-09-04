import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { normalizeNoteFields } from "../../server/api/note-fields.js";

Deno.test("normalizeNoteFields: trims title whitespace", () => {
  assertEquals(normalizeNoteFields({ title: "  hello  " }).title, "hello");
});

Deno.test("normalizeNoteFields: preserves content trailing whitespace", () => {
  // Two trailing spaces = Markdown hard line break; must survive.
  assertEquals(
    normalizeNoteFields({ content: "line one  \nline two" }).content,
    "line one  \nline two",
  );
});

Deno.test("normalizeNoteFields: preserves content leading whitespace", () => {
  assertEquals(normalizeNoteFields({ content: "  indented" }).content, "  indented");
});

Deno.test("normalizeNoteFields: preserves trailing newlines in content", () => {
  assertEquals(normalizeNoteFields({ content: "para\n\n\n" }).content, "para\n\n\n");
});

Deno.test("normalizeNoteFields: preserves content exactly, including tabs and blank lines", () => {
  const content = "\tleading tab\n\n  trailing spaces  \n";
  assertEquals(normalizeNoteFields({ content }).content, content);
});

Deno.test("normalizeNoteFields: title-only leaves content key absent", () => {
  const out = normalizeNoteFields({ title: " x " });
  assertEquals("content" in out, false);
  assertEquals(out.title, "x");
});

Deno.test("normalizeNoteFields: content-only leaves title key absent", () => {
  const out = normalizeNoteFields({ content: "body" });
  assertEquals("title" in out, false);
});

Deno.test("normalizeNoteFields: empty string content is preserved, not dropped", () => {
  assertEquals(normalizeNoteFields({ content: "" }).content, "");
});

Deno.test("normalizeNoteFields: non-string values are ignored", () => {
  const out = normalizeNoteFields({ title: 42, content: null });
  assertEquals("title" in out, false);
  assertEquals("content" in out, false);
});
