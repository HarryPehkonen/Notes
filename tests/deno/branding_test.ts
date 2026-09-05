import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  DEFAULT_APP_NAME,
  DEFAULT_APP_SHORT_NAME,
  injectAppName,
  injectAppNameIntoManifest,
  resolveAppName,
} from "../../server/branding.js";

// resolveAppName

Deno.test("resolveAppName: uses the fallback when unset", () => {
  assertEquals(resolveAppName(undefined, "Notes App"), "Notes App");
  assertEquals(resolveAppName(null, "Notes App"), "Notes App");
});

Deno.test("resolveAppName: uses the fallback for a blank/whitespace-only value", () => {
  assertEquals(resolveAppName("", "Notes App"), "Notes App");
  assertEquals(resolveAppName("   ", "Notes App"), "Notes App");
});

Deno.test("resolveAppName: uses the configured value, trimmed", () => {
  assertEquals(resolveAppName("  Harri's Notes  ", "Notes App"), "Harri's Notes");
});

Deno.test("resolveAppName: the same override applies regardless of fallback", () => {
  // This is what makes APP_NAME land the SAME name in every surface at once
  assertEquals(resolveAppName("Harri's Notes", "Notes App"), "Harri's Notes");
  assertEquals(resolveAppName("Harri's Notes", "Notes"), "Harri's Notes");
});

// injectAppName (HTML placeholders)

Deno.test("injectAppName: replaces both placeholders, HTML-escaped", () => {
  // Apostrophes are escaped too: the same placeholder also lands inside a
  // meta content="..." attribute, where an unescaped ' would break the markup.
  const html = "<title>{{APP_NAME}}</title><h1>{{APP_SHORT_NAME}}</h1>";
  const out = injectAppName(html, { full: "Harri's <Notes>", short: "H&N" });
  assertEquals(out, "<title>Harri&#039;s &lt;Notes&gt;</title><h1>H&amp;N</h1>");
});

Deno.test("injectAppName: replaces every occurrence of a placeholder", () => {
  const html = "{{APP_NAME}} - Login ({{APP_NAME}})";
  const out = injectAppName(html, { full: "Harri's Notes", short: "Notes" });
  assertEquals(out, "Harri&#039;s Notes - Login (Harri&#039;s Notes)");
});

Deno.test("injectAppName: tolerates the spaced form deno fmt writes ({{ APP_NAME }})", () => {
  // `deno fmt` reformats "{{X}}" to "{{ X }}" inside HTML text content, so the
  // matcher must not depend on the exact spacing surviving a future fmt run.
  const html = "<title>{{ APP_NAME }}</title><h1>{{ APP_SHORT_NAME }}</h1>";
  const out = injectAppName(html, { full: "Harri's Notes", short: "Notes" });
  assertEquals(out, "<title>Harri&#039;s Notes</title><h1>Notes</h1>");
});

Deno.test("injectAppName: leaves the rest of the document untouched", () => {
  const html = '<meta name="description" content="unrelated">{{APP_NAME}}';
  const out = injectAppName(html, { full: "X", short: "Y" });
  assertEquals(out, '<meta name="description" content="unrelated">X');
});

Deno.test("injectAppName: defaults produce the original hardcoded strings", () => {
  const html = "<title>{{APP_NAME}}</title>";
  const out = injectAppName(html, { full: DEFAULT_APP_NAME, short: DEFAULT_APP_SHORT_NAME });
  assertEquals(out, "<title>Notes App</title>");
});

// injectAppNameIntoManifest

Deno.test("injectAppNameIntoManifest: overrides name and short_name", () => {
  const manifest = JSON.stringify({
    name: "Notes App",
    short_name: "Notes",
    description: "unchanged",
    icons: [{ src: "/static/favicon.svg" }],
  });

  const out = JSON.parse(injectAppNameIntoManifest(manifest, { full: "H's Notes", short: "HN" }));

  assertEquals(out.name, "H's Notes");
  assertEquals(out.short_name, "HN");
  assertEquals(out.description, "unchanged");
  assertEquals(out.icons, [{ src: "/static/favicon.svg" }]);
});

Deno.test("injectAppNameIntoManifest: correctly escapes quotes for JSON (not HTML entities)", () => {
  const manifest = JSON.stringify({ name: "Notes App", short_name: "Notes" });
  const out = JSON.parse(
    injectAppNameIntoManifest(manifest, { full: 'Harri "the notetaker"', short: "Notes" }),
  );
  assertEquals(out.name, 'Harri "the notetaker"');
});

Deno.test("injectAppNameIntoManifest: output is still valid, parseable JSON", () => {
  const manifest = JSON.stringify({ name: "Notes App", short_name: "Notes" });
  const out = injectAppNameIntoManifest(manifest, { full: "X", short: "Y" });
  // Throws if invalid; assertion is just that parsing succeeds
  JSON.parse(out);
});
