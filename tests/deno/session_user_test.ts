/**
 * Reading the signed-in user out of the injected meta tag.
 *
 * The bug this replaces: `notes-app.js` read `globalThis.user`, a promise made
 * in a comment and never implemented, so the avatar and name never rendered on
 * either platform. The reader is a pure function over the meta tag's content, so
 * it can be tested without a DOM.
 */

import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { initialOf, parseSessionUser, readSessionUser } from "../../public/utils/session-user.js";

Deno.test("parseSessionUser: a name yields a user with its initial", () => {
  assertEquals(parseSessionUser("Harri Pehkonen"), { name: "Harri Pehkonen", initial: "H" });
});

Deno.test("parseSessionUser: whitespace and non-strings are 'no user'", () => {
  for (const empty of ["", "   ", "\t\n", undefined, null, 42, {}, []]) {
    assertEquals(parseSessionUser(empty), null, `expected null for ${JSON.stringify(empty)}`);
  }
});

Deno.test("parseSessionUser: the name is trimmed, not the identity lost", () => {
  assertEquals(parseSessionUser("  Harri  "), { name: "Harri", initial: "H" });
});

Deno.test("initialOf: code-point aware, upper-cased", () => {
  assertEquals(initialOf("harri"), "H");
  assertEquals(initialOf("Ärlig Persson"), "Ä");
  assertEquals(initialOf("🎉 Party"), "🎉");
  assertEquals(initialOf(""), "");
});

Deno.test("readSessionUser: reads the meta tag through an injected reader", () => {
  const metas: Record<string, string> = { "session-user-name": "Harri Pehkonen" };
  const get = (name: string) => metas[name] ?? "";
  assertEquals(readSessionUser(get), { name: "Harri Pehkonen", initial: "H" });
});

Deno.test("readSessionUser: a missing meta tag is no user, not an error", () => {
  assertEquals(readSessionUser(() => ""), null);
});
