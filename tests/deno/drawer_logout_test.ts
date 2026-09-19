/**
 * Logout, where the user actually looks for it.
 *
 * Reported from a phone (2026-09-18): "I don't see Logout on mobile. It should
 * be under the hamburger." Two separate faults were hiding it:
 *   1. the single-device action was an icon with a `title` tooltip and no
 *      visible word - and a phone has no hover to reveal a tooltip;
 *   2. it was rendered inside `this.user ? ... : ""`, and `this.user` is
 *      ALWAYS null - the comment in the constructor promises a
 *      `globalThis.user` injection that was never written (nothing in
 *      public/, index.html or the server sets it). So the whole account block,
 *      logout included, never rendered at all.
 *
 * Hence the two rules this file pins: the drawer's logout controls carry
 * visible words, and they render whether or not a user object exists. The
 * checks are exercised against the old markup first, because a guard that has
 * never failed is a guess.
 */
import { assert, assertStringIncludes } from "https://deno.land/std@0.208.0/assert/mod.ts";

const source = await Deno.readTextFile(
  new URL("../../public/components/notes-app.js", import.meta.url),
);

/** The drawer's footer, where the account controls live on a phone. */
function drawerFooter(text: string): string {
  const start = text.indexOf('class="drawer-footer"');
  const end = text.indexOf("</aside>", start);
  assert(start > -1 && end > start, "drawer footer not found");
  return text.slice(start, end);
}

/** The body of a method on the root component, by name. */
function methodBody(text: string, name: string): string {
  const start = text.indexOf(`${name}() {`);
  assert(start > -1, `${name} not found`);
  const end = text.indexOf("\n  }", start);
  assert(end > start, `end of ${name} not found`);
  return text.slice(start, end);
}

/** The desktop account popover, which must keep behaving as it did. */
function accountPopover(text: string): string {
  const start = text.indexOf('<div class="user-popover">');
  const end = text.indexOf("</div>", text.indexOf("Log out from all devices", start));
  assert(start > -1 && end > start, "account popover not found");
  return text.slice(start, end);
}

/** Is a logout action labelled with a visible word? */
const hasVisibleLogoutLabel = (region: string) => /icons\.logout\}\s*Log out\b/.test(region);

/** Is there still an icon-only logout button with only a tooltip to explain it? */
const hasIconOnlyLogout = (region: string) =>
  /class="icon-btn"[\s\S]{0,160}?this\.logout/.test(region);

/** Would a missing user object hide these logout controls? */
const dependsOnTheUser = (region: string) => region.includes("this.user");

const OLD_DRAWER =
  `<div class="drawer-user"><button class="icon-btn" @click="\${this.logout}" title="Log out">
     \${icons.logout}
   </button></div>`;

const NEW_DRAWER = `<button class="user-popover-logout" @click="\${this.logout}">
     \${icons.logout} Log out
   </button>`;

Deno.test("the check: icon-only drawer markup fails it, the labelled markup passes", () => {
  assert(hasIconOnlyLogout(OLD_DRAWER), "the old markup must trip the icon-only check");
  assert(!hasVisibleLogoutLabel(OLD_DRAWER), "the old markup carried no visible label");

  assert(!hasIconOnlyLogout(NEW_DRAWER), "a labelled button is not icon-only");
  assert(hasVisibleLogoutLabel(NEW_DRAWER), "the label must be there to be read");
});

Deno.test("drawer: both logout actions are labelled with words", () => {
  const logout = methodBody(source, "_renderDrawerLogout");

  assert(hasVisibleLogoutLabel(logout), "the drawer's Log out must say so");
  assertStringIncludes(logout, "${icons.logout} Log out from all devices");
});

Deno.test("drawer: no logout action is icon-only any more", () => {
  assert(
    !hasIconOnlyLogout(methodBody(source, "_renderDrawerLogout")),
    "an icon with a title tooltip is invisible on a phone",
  );
});

Deno.test("drawer: logout renders whether or not the user object exists", () => {
  const footer = drawerFooter(source);

  assertStringIncludes(footer, "${this._renderDrawerLogout()}", "the footer must call it");
  assert(
    !dependsOnTheUser(footer),
    "nothing in the drawer footer may be conditional on a user that is never set",
  );
  assert(
    !dependsOnTheUser(methodBody(source, "_renderDrawerLogout")),
    "Log out must not be hidden by a missing user object",
  );
});

Deno.test("drawer: identification is still conditional, logout is not", () => {
  // The avatar and name DO need the user object; keeping that condition is
  // deliberate - it must simply never sit around the logout controls.
  assert(
    dependsOnTheUser(methodBody(source, "_renderDrawerAccount")),
    "the account row renders nothing without a user",
  );
});

Deno.test("drawer: both logout buttons meet the 44px touch minimum, and read large", () => {
  const css = source.slice(
    source.indexOf(".drawer-footer .user-popover-logout {"),
    source.indexOf(".drawer-user .user-name"),
  );

  assertStringIncludes(css, "min-height: 44px");
  assert(/font-size:\s*0\.9[5-9]?rem/.test(css) || /font-size:\s*1rem/.test(css));
  assert(/color:\s*var\(--gray-900\)/.test(css), "the label must be readable at arm's length");
});

Deno.test("popover: the desktop account menu keeps both labelled buttons", () => {
  const popover = accountPopover(source);

  assertStringIncludes(popover, "${icons.logout} Log out");
  assertStringIncludes(popover, "${icons.logout} Log out from all devices");
  assertStringIncludes(popover, '@click="${this.logout}"');
  assertStringIncludes(popover, '@click="${this.logoutAllDevices}"');
});
