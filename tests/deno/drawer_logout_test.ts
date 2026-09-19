/**
 * Logout: visible, labelled, and not under your thumb.
 *
 * Two reports from the same phone, one day apart (2026-09-18):
 *   1. "I don't see Logout on mobile. It should be under the hamburger."
 *      It was there - as an icon-only button with a `title` tooltip (a phone
 *      cannot hover), inside a `this.user ? ... : ""` that never rendered
 *      because nothing populates `globalThis.user`.
 *   2. "It's too easy! ... too prominent, and create a fat-fingers danger."
 *      With it labelled, it sat in `.drawer-footer` - a flex SIBLING of the
 *      scrolling content, so it is on screen the entire time the drawer is
 *      open, in the band a thumb rests in.
 *
 * The fix for (2) is placement, not size: the logout block moved to the end of
 * `.drawer-content`, below the tags, so reaching it means scrolling past them.
 * These tests pin the placement, the reason it works (`.drawer-content` is the
 * scroll container), the labels, and the touch size.
 */

import { assert } from "https://deno.land/std@0.208.0/assert/mod.ts";

const source = await Deno.readTextFile(
  new URL("../../public/components/notes-app.js", import.meta.url),
);

const read = (path: string) => Deno.readTextFile(new URL(path, import.meta.url));

/** The markup between two anchors (end excluded). */
function region(text: string, from: string, to: string): string {
  const start = text.indexOf(from);
  assert(start > -1, `could not find ${from}`);
  const end = text.indexOf(to, start);
  assert(end > start, `could not find ${to} after ${from}`);
  return text.slice(start, end);
}

/** A method's body, by name. Both helpers are 2-space-indented class methods. */
function methodBody(text: string, name: string): string {
  const start = text.indexOf(`${name}() {`);
  assert(start > -1, `could not find ${name}()`);
  const end = text.indexOf("\n  }", start);
  assert(end > start, `could not find the end of ${name}()`);
  return text.slice(start, end);
}

const isLogoutBlock = (text: string) => text.indexOf("_renderDrawerLogout()") > -1;
const isLogoutInsideContent = (text: string) =>
  isLogoutBlock(region(text, 'class="drawer-content"', 'class="drawer-footer"'));
const isLogoutInsideFooter = (text: string) =>
  isLogoutBlock(region(text, 'class="drawer-footer"', "</aside>"));
const hasVisibleLogoutLabel = (text: string) => /icons\.logout\}\s*Log out\b/.test(text);
const hasIconOnlyLogout = (text: string) =>
  /<button[^>]*class="icon-btn"[\s\S]{0,200}?this\.logout/.test(text);

Deno.test("the placement check: logout in the pinned footer is what fails it", () => {
  const inFooter = `<div class="drawer-content"><tag-manager></tag-manager></div>
        <div class="drawer-footer">\${this._renderDrawerLogout()}</div>
      </aside>`;
  const inContent = `<div class="drawer-content"><tag-manager></tag-manager>
          <div class="drawer-logout">\${this._renderDrawerLogout()}</div>
        </div>
        <div class="drawer-footer">\${this._renderDrawerAccount()}</div>
      </aside>`;

  assert(isLogoutInsideFooter(inFooter), "the old shape must trip the pinned-footer check");
  assert(!isLogoutInsideContent(inFooter), "the old shape was not inside the scroll area");
  assert(isLogoutInsideContent(inContent), "the new shape must read as inside the scroll area");
  assert(!isLogoutInsideFooter(inContent), "logout must not be back in the pinned footer");
});

Deno.test("drawer: logout sits at the END of the scrolling content, below the tags", () => {
  const content = region(source, 'class="drawer-content"', 'class="drawer-footer"');
  assert(isLogoutInsideContent(source), "logout must live inside .drawer-content");
  assert(
    content.indexOf("_renderDrawerLogout()") > content.indexOf("</tag-manager>"),
    "logout must come after the tag list, so it is reached by scrolling past it",
  );
});

Deno.test("drawer: the pinned footer is not a tap target any more", () => {
  const footer = region(source, 'class="drawer-footer"', "</aside>");
  assert(!isLogoutBlock(footer), "the pinned footer must hold no logout control");
  // It keeps the non-interactive bits: who you are, and which build you run.
  assert(footer.includes("_renderDrawerAccount()"), "the footer still shows the account row");
  assert(footer.includes("drawer-version"), "the footer still shows the build number");
});

Deno.test("drawer: 'only after scrolling' depends on .drawer-content scrolling", () => {
  const css = region(source, "    .drawer-content {", "\n    }");
  assert(
    /overflow-y:\s*auto/.test(css),
    "the scroll container must keep overflow-y: auto, or the logout block would be visible without scrolling",
  );
  const footerCss = region(source, "    .drawer-footer {", "\n    }");
  assert(
    !/position:\s*(fixed|sticky)/.test(footerCss),
    "a pinned footer would put the buttons back on screen permanently",
  );
});

Deno.test("drawer: the logout block is styled where it now lives", () => {
  const css = region(source, "    .drawer-logout {", "\n    }");
  assert(css.includes("border-top"), "the block is separated from the tag list");
  const buttonCss = region(source, "    .drawer-logout .user-popover-logout {", "\n    }");
  assert(
    /min-height:\s*44px/.test(buttonCss),
    "labelled and big enough to tap - the risk was placement, not size",
  );
  assert(
    !source.includes(".drawer-footer .user-popover-logout {"),
    "the old pinned-footer selector must be gone, or it would style nothing",
  );
});

Deno.test("drawer: both logout actions are labelled with words, not just an icon", () => {
  // The words live in the helper, not at the call site.
  const logout = methodBody(source, "_renderDrawerLogout");
  assert(hasVisibleLogoutLabel(logout), "the drawer must show the words 'Log out'");
  assert(
    logout.includes(`${"${icons.logout}"} Log out from all devices`),
    "the all-devices action must be labelled too",
  );
  assert(!hasIconOnlyLogout(logout), "no logout action may be an icon with only a tooltip");
});

Deno.test("drawer: logout does not depend on knowing who the user is", () => {
  const logout = methodBody(source, "_renderDrawerLogout");
  assert(
    !logout.includes("this.user"),
    "logging out ends a session, not a name - a null user must not hide it",
  );
  const footer = region(source, 'class="drawer-footer"', "</aside>");
  assert(
    !/\$\{this\.user[\s\S]{0,120}_renderDrawerLogout/.test(footer),
    "the logout block must not be gated on this.user",
  );
});

Deno.test("drawer: the account row may hide itself, and says so", () => {
  const account = methodBody(source, "_renderDrawerAccount");
  assert(
    /if \(!this\.user\) return ""/.test(account),
    "identification returns nothing without a user - that is the deliberate trade-off",
  );
});

Deno.test("desktop: the account popover keeps both labelled actions", async () => {
  const app = await read("../../public/components/notes-app.js");
  const popover = region(app, 'class="user-popover-logout"', "drawer-overlay");
  assert(popover.includes("Log out"), "the popover keeps a labelled Log out");
  assert(popover.includes("Log out from all devices"), "and the all-devices action");
});

Deno.test("the fixture itself is a real file with a real drawer", () => {
  assert(source.includes('class="drawer-overlay'), "the drawer overlay markup is present");
  assert(source.length > 1000, "sanity: the component was read");
});
