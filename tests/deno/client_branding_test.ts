import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { readAppShortName } from "../../public/utils/branding.js";

/** Fake `document` carrying just enough of the querySelector surface */
function fakeDoc(metaContent) {
  return {
    querySelector(selector) {
      if (selector !== 'meta[name="app-short-name"]') return null;
      if (metaContent === undefined) return null;
      return { content: metaContent };
    },
  };
}

Deno.test("readAppShortName: reads the server-injected meta tag", () => {
  assertEquals(readAppShortName(fakeDoc("Harri's Notes")), "Harri's Notes");
});

Deno.test("readAppShortName: trims the meta tag's content", () => {
  assertEquals(readAppShortName(fakeDoc("  Harri's Notes  ")), "Harri's Notes");
});

Deno.test("readAppShortName: falls back to 'Notes' when the tag is missing", () => {
  assertEquals(readAppShortName(fakeDoc(undefined)), "Notes");
});

Deno.test("readAppShortName: falls back to 'Notes' when the tag is blank", () => {
  assertEquals(readAppShortName(fakeDoc("   ")), "Notes");
});

Deno.test("readAppShortName: falls back when no document is available at all", () => {
  assertEquals(readAppShortName(null), "Notes");
  assertEquals(readAppShortName(undefined), "Notes");
});

Deno.test("readAppShortName: a custom fallback can be supplied", () => {
  assertEquals(readAppShortName(fakeDoc(undefined), "Custom"), "Custom");
});
