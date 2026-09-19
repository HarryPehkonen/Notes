/**
 * Logout, where the user actually looks for it.
 *
 * Reported on a phone (2026-09-18): "I don't see Logout on mobile. It should be
 * under the hamburger." It *was* there - as a 44px icon with a `title` tooltip
 * and no visible word. A phone has no hover, so the label never appeared and
 * the door icon meant nothing.
 *
 * So the rule this file pins is about what a control SAYS, not just that it
 * exists: in the drawer, both logout actions carry visible text and a 44px
 * touch height. The check is exercised against the old markup first, because a
 * guard that has never failed is a guess.
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
  const footer = drawerFooter(source);

  assert(hasVisibleLogoutLabel(footer), "the drawer's Log out must say so");
  assertStringIncludes(footer, "${icons.logout} Log out from all devices");
});

Deno.test("drawer: no logout action is icon-only any more", () => {
  assert(
    !hasIconOnlyLogout(drawerFooter(source)),
    "an icon with a title tooltip is invisible on a phone",
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
