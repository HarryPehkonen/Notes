/**
 * The build number has to be reachable from a phone.
 *
 * It shipped in the account popover first, which is desktop-shaped: on mobile
 * that popover is not how you open the menu - the hamburger is. The number is
 * the entire diagnosis when a device is holding stale code ("what does your
 * phone say?"), so it belongs in the drawer too.
 */
import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";

const app = await Deno.readTextFile(
  new URL("../../public/components/notes-app.js", import.meta.url),
);

const occurrences = app.match(/Version \$\{APP_VERSION\}/g) ?? [];

Deno.test("the build number is rendered from APP_VERSION, never a literal", () => {
  assert(occurrences.length > 0, "no version marker rendered at all");
  assert(
    !/Version\s+\d+/.test(app),
    "the number must come from APP_VERSION, not be hard-coded",
  );
});

Deno.test("it appears in the desktop account popover", () => {
  // Anchor on the template markup, not the CSS rule of the same name.
  const start = app.indexOf('class="user-popover-name"');
  assert(start > -1, "popover markup not found");
  const popover = app.slice(start, start + 600);
  assert(popover.includes("Version ${APP_VERSION}"), "popover lost its version line");
});

Deno.test("it appears in the mobile drawer, where the popover is out of reach", () => {
  const drawer = app.slice(app.indexOf('class="drawer '), app.indexOf('class="drawer '));
  const footerStart = app.indexOf('class="drawer-footer"');
  assert(footerStart > -1, "drawer footer not found");
  const footer = app.slice(footerStart, footerStart + 1600);
  assert(
    footer.includes("Version ${APP_VERSION}"),
    "the hamburger drawer must show the build number too",
  );
});

Deno.test("both places label it, so the number is never cryptic", () => {
  assertEquals(
    occurrences.length >= 2,
    true,
    `expected 2+ renderings, found ${occurrences.length}`,
  );
});
