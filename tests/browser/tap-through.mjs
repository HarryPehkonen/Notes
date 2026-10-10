/**
 * The tap-through regression, as a browser check: nothing may relocate under the finger.
 *
 * The bug this exists for (Harri's phone, unreproducible on desktop): tapping "+ Add Tag"
 * in the tags drawer opened the create form, and a second contact at the same screen
 * position opened *a tag row's edit form* for whichever tag had slid under the thumb.
 *
 * Root cause, measured: the form was rendered at the TOP of `.tags-container` while its
 * trigger sits at the BOTTOM. Opening the form inserted its height (226px) above the
 * current scroll offset, the browser's scroll anchoring advanced `scrollTop` by exactly
 * that much, and a live row landed under the finger that was still touching the screen.
 * Same cause, second symptom: the form itself opened off-screen above a scrolled drawer
 * (measured top of -239px), so the user hunted for the form they had just requested.
 *
 * A clean synthetic single tap does NOT reproduce the "wrong form opens" outcome (it
 * correctly opens the create form), so this script asserts on WHAT IS UNDER THE POINT —
 * element identity, the scroll offset, and the tag filter state — not on which form
 * happened to open. The probe descends through open shadow roots
 * (`el.shadowRoot.elementFromPoint(x, y)`), because the app's components render into them.
 *
 * The in-gate half of this regression is tests/deno/tag_form_slot_test.ts, which holds the
 * ordering invariant ("the form occupies the slot of the control that opened it") and runs
 * in milliseconds without a browser. This file is the end-to-end proof on a real engine.
 *
 * Running it (needs the dev server and a browser):
 *
 *     cd ~/hermes-workspace/Notes
 *     NODE_ENV=development DEV_USER_EMAIL=<you@example.com> HOST=127.0.0.1 PORT=8000 \
 *         deno task start                                  # in another terminal
 *     node tests/browser/tap-through.mjs [out-dir]
 *
 * Playwright is resolved from PLAYWRIGHT_MODULE, then `playwright`, then the screenshot
 * rig's copy (~/hermes-workspace/ui-shots/node_modules/playwright). It is deliberately not
 * a dependency of this repo: the app ships without a build step, and this check is not part
 * of the gate (no browser, no database, no server in the gate).
 *
 * Exits 0 when every check passes, 1 with the failing checks printed otherwise.
 */
const BASE = process.env.NOTES_BASE || "http://127.0.0.1:8000";
const OUT = (process.argv[2] || ".").replace(/\/$/, "");
const MOBILE = { width: 427, height: 952 };

async function loadPlaywright() {
  const candidates = [
    process.env.PLAYWRIGHT_MODULE,
    "playwright",
    `${process.env.HOME}/hermes-workspace/ui-shots/node_modules/playwright/index.mjs`,
  ].filter(Boolean);
  let last;
  for (const spec of candidates) {
    try {
      return await import(spec);
    } catch (error) {
      last = error;
    }
  }
  throw new Error(
    `playwright is not importable (tried: ${candidates.join(", ")})\n${last?.message ?? ""}`,
  );
}

const { chromium } = await loadPlaywright();

/** Collect results, print them, and make the exit status the verdict. */
const results = [];
function check(label, ok, detail = "") {
  results.push({ label, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `\n        ${detail}` : ""}`);
}

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: MOBILE,
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  userAgent:
    "Mozilla/5.0 (Linux; Android 14; Pixel 9 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Mobile Safari/537.36",
});
const page = await context.newPage();

/** What is under (x, y) right now: the element chain, its tag-row ancestry, the form it is
 *  inside of, and the drawer's geometry and filter state. */
const probe = ([x, y]) =>
  page.evaluate(([x, y]) => {
    const chain = [];
    let el = document.elementFromPoint(x, y);
    let guard = 0;
    while (el && guard++ < 16) {
      const cls = typeof el.className === "string" && el.className.trim()
        ? "." + el.className.trim().split(/\s+/).join(".")
        : "";
      chain.push(el.tagName.toLowerCase() + cls);
      const shadowRoot = el.shadowRoot;
      const inner = shadowRoot ? shadowRoot.elementFromPoint(x, y) : null;
      if (!inner || inner === el) break;
      el = inner;
    }

    let node = el;
    let row = null;
    let action = null;
    let form = null;
    let formName = null;
    let formTop = null;
    let formSubmit = null;
    const seen = new Set();
    while (node && !seen.has(node)) {
      seen.add(node);
      if (typeof node.classList?.contains === "function") {
        if (node.classList.contains("tag-item")) row = row ?? node;
        if (node.classList.contains("tag-action-btn")) action = action ?? (node.title || "action");
        if (node.classList.contains("tag-form")) {
          form = form ?? "form";
          formTop = formTop ?? node.getBoundingClientRect().top;
          formSubmit = formSubmit ??
            (node.querySelector(".btn-primary")?.textContent ?? "").trim();
          formName = formName ?? node.querySelector(".form-input")?.value;
        }
      }
      node = node.parentNode instanceof ShadowRoot ? node.parentNode.host : node.parentNode;
    }

    let drawerTop = null;
    let scrollTop = null;
    let swatch = null;
    let selection = [];
    let rowTops = [];
    {
      const host = document.querySelector("notes-app");
      const drawer = host?.shadowRoot?.querySelector(".drawer-content") ?? null;
      const manager = host?.shadowRoot?.querySelector("tag-manager") ?? null;
      const root = manager?.shadowRoot ?? null;
      if (drawer) {
        drawerTop = drawer.getBoundingClientRect().top;
        scrollTop = drawer.scrollTop;
      }
      if (root) {
        const rows = [...root.querySelectorAll(".tag-item")];
        selection = rows.map((r) => {
          const name = r.querySelector(".tag-name")?.textContent?.trim() ?? "(All Notes)";
          const state = [...r.classList].find((c) => c.startsWith("state-")) ?? "state-any";
          return `${name}:${state}`;
        });
        rowTops = rows.map((r) => ({
          name: r.querySelector(".tag-name")?.textContent?.trim() ?? "(All Notes)",
          top: r.getBoundingClientRect().top,
          height: r.getBoundingClientRect().height,
        }));
        const colorInput = root.querySelector(".color-input");
        if (colorInput) {
          const r = colorInput.getBoundingClientRect();
          swatch = { width: r.width, height: r.height };
        }
      }
    }

    return {
      chain,
      row: row ? row.querySelector(".tag-name")?.textContent?.trim() ?? "(All Notes)" : null,
      action,
      form,
      formName,
      formTop,
      formSubmit,
      drawerTop,
      scrollTop,
      swatch,
      selection,
      rowTops,
    };
  }, [x, y]);

const box = async (selector) => await page.locator(selector).first().boundingBox();
const centre = (b) => [b.x + b.width / 2, b.y + b.height / 2];
const short = (p) => JSON.stringify(p.chain.slice(-3));

await page.goto(`${BASE}/`, { waitUntil: "load" });
await page.waitForSelector('button[aria-label="Open menu"]', { state: "visible", timeout: 30000 });
await page.waitForTimeout(2500); // let the components fetch and render
await page.click('button[aria-label="Open menu"]');
await page.waitForTimeout(1200);

// ---------------------------------------------------------------- create form in place
await page.locator(".add-tag-btn").first().scrollIntoViewIfNeeded();
const addBox = await box(".add-tag-btn");
const [cx, cy] = centre(addBox);
const before = await probe([cx, cy]);
check(
  "the tap point is on the + Add Tag button",
  before.chain.at(-1) === "button.add-tag-btn",
  short(before),
);

await page.touchscreen.tap(cx, cy);
await page.waitForTimeout(150);
const after = await probe([cx, cy]);
await page.screenshot({ path: `${OUT}/tap-through-create-open.png` });

check(
  "activating + Add Tag leaves no tag row under the tap point",
  after.row === null,
  short(after),
);
check("no tag action button is under the tap point", after.action === null, short(after));
check(
  "the drawer did not scroll under the finger",
  after.scrollTop === before.scrollTop,
  `scrollTop ${before.scrollTop} -> ${after.scrollTop}`,
);
check("the create form is under the tap point", after.formSubmit === "Create", short(after));
check(
  "the create form opens at the finger, not above the fold",
  after.formTop !== null && after.formTop <= cy + 4 && after.formTop >= (after.drawerTop ?? 0),
  `form top ${after.formTop}, tap y ${cy}, drawer top ${after.drawerTop}`,
);

const selectionBefore = after.selection.join(",");
await page.touchscreen.tap(cx, cy);
await page.waitForTimeout(600);
const second = await probe([cx, cy]);
await page.screenshot({ path: `${OUT}/tap-through-create-second-contact.png` });

check(
  "a second contact at the point opens no tag's edit form",
  second.formSubmit !== "Update",
  `form=${second.formSubmit}`,
);
check(
  "a second contact changes no tag's filter state",
  second.selection.join(",") === selectionBefore,
  `${selectionBefore} -> ${second.selection.join(",")}`,
);
check("a second contact still leaves no tag row under the point", second.row === null);

// ---------------------------------------------------------------- swatch, on the open form
check(
  "the colour swatch renders square and touch-sized",
  !!after.swatch && Math.abs(after.swatch.width - after.swatch.height) <= 1 &&
    after.swatch.width >= 44,
  `measured ${after.swatch?.width}x${after.swatch?.height}`,
);

// ---------------------------------------------------------------- edit form in place
await page.locator(".tag-form .btn-secondary").first().click();
await page.waitForTimeout(300);

const targetIndex = 2; // a row in the middle of the list, not the one under the phone's thumb
const editBox = await page.locator('[title="Edit tag"]').nth(targetIndex).boundingBox();
const targetRow = second.rowTops[targetIndex + 1]; // rows[0] is the "All Notes" option
const [ex, ey] = centre(editBox);
await page.touchscreen.tap(ex, ey);
await page.waitForTimeout(300);
const editing = await probe([ex, ey]);
await page.screenshot({ path: `${OUT}/tap-through-edit-open.png` });

check(
  "opening a tag's edit form puts it in that row's place",
  editing.formSubmit === "Update" && editing.formTop !== null &&
    Math.abs(editing.formTop - targetRow.top) <= 4,
  `row ${targetRow.name} top ${targetRow.top}, form top ${editing.formTop}`,
);
check(
  "the edit tap point belongs to that form, not to another row",
  editing.row === null,
  short(editing),
);

// ---------------------------------------------------------------- verdict
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log("FAILED:");
  for (const f of failed) console.log(`  - ${f.label}`);
  process.exit(1);
}
console.log("tap-through: ok");
