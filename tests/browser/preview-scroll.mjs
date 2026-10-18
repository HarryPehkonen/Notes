/**
 * The preview-scroll regression, as a browser check: ticking a checkbox must not move the view.
 *
 * The bug this exists for (Harri's phone, notes #123/#124): in View mode, tapping a
 * checklist box scrolled the note back towards its top, so the box that had just been
 * ticked was off-screen. Measured on a 390x844 touch viewport before the fix, on the
 * same tap that ticked the box: scrollTop 150 -> 0, 400 -> 0, 700 -> 234, 1000 -> 78.
 *
 * Root cause, measured: the tap marks the note dirty, Lit re-renders, `renderMarkdown`
 * returns new HTML because one `[ ]` became `[x]`, and replacing every node under
 * `.markdown-preview` makes the browser drop the scroller. The input is already ticked
 * by the browser before any of that runs, so the markup does not need to change at all -
 * `public/utils/preview-cache.js` keeps the rendered string while only the source
 * content advances. Freezing `renderMarkdown` in place reproduced the fixed behaviour
 * exactly (0px movement, still saves), which is what this check locks in.
 *
 * The in-gate half is tests/deno/preview_cache_test.ts (the cache invariant, no browser).
 * This file is the end-to-end proof on a real engine, against a note with checkboxes.
 *
 * Running it (needs the dev server and a browser):
 *
 *     cd ~/hermes-workspace/Notes
 *     NODE_ENV=development DEV_USER_EMAIL=<you@example.com> HOST=127.0.0.1 PORT=8000 \
 *         deno task start                                  # in another terminal
 *     NOTE_ID=<a note with several [ ] markers> node tests/browser/preview-scroll.mjs
 *
 * Playwright is resolved from PLAYWRIGHT_MODULE, then `playwright`, then the screenshot
 * rig's copy (~/hermes-workspace/ui-shots/node_modules/playwright). It is deliberately
 * not a dependency of this repo, and this check is not part of the gate.
 *
 * Exits 0 when every check passes, 1 with the failing checks printed otherwise.
 */
const BASE = process.env.NOTES_BASE || "http://127.0.0.1:8000";
const NOTE_ID = Number(process.env.NOTE_ID || 0);
const MOBILE = { width: 390, height: 844 };

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

if (!NOTE_ID) {
  console.error("NOTE_ID is required: pick a note that has several [ ] / [x] markers.");
  process.exit(1);
}

const { chromium } = await loadPlaywright();

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

const staticFailures = [];
page.on("response", (response) => {
  const path = new URL(response.url()).pathname;
  if (response.status() >= 400 && path.startsWith("/static/")) {
    staticFailures.push(`${response.status()} ${path}`);
  }
});

await page.goto(`${BASE}/`, { waitUntil: "load" });
try {
  await page.waitForSelector('button[aria-label="Open menu"]', { state: "visible", timeout: 30000 });
} catch (error) {
  if (staticFailures.length) {
    throw new Error(
      `${error.message}\nThis is a dev-server boot failure, not the scroll bug: the page ` +
        `never rendered because these static modules came back\n  ${staticFailures.join("\n  ")}`,
    );
  }
  throw error;
}
await page.waitForTimeout(2500);

/** Put the note on screen in View mode, at the top. */
async function openPreview() {
  await page.evaluate(async (id) => {
    const app = document.querySelector("notes-app");
    const res = await NotesApp.getNote(id);
    app.currentNote = res.data;
    app.viewMode = "edit";
    await new Promise((r) => setTimeout(r, 700));
    app.shadowRoot.querySelector("note-editor").previewMode = true;
    await new Promise((r) => setTimeout(r, 700));
  }, NOTE_ID);
}

const editorState = () =>
  page.evaluate(() => {
    const ed = document.querySelector("notes-app").shadowRoot.querySelector("note-editor");
    const canvas = ed.shadowRoot.querySelector(".canvas");
    const inputs = [...ed.shadowRoot.querySelectorAll('input[data-cb-index]')];
    return {
      scrollTop: Math.round(canvas.scrollTop),
      checked: inputs.map((i) => (i.checked ? 1 : 0)).join(""),
      dirty: ed.hasUnsavedChanges,
      status: ed.saveStatus,
      boxes: inputs.length,
    };
  });

/** Scroll to `pos`, tap the middle visible checkbox, report how far the view moved. */
async function tapAt(pos) {
  const spot = await page.evaluate(async (p) => {
    const ed = document.querySelector("notes-app").shadowRoot.querySelector("note-editor");
    const canvas = ed.shadowRoot.querySelector(".canvas");
    canvas.scrollTop = p;
    await new Promise((r) => setTimeout(r, 250));
    const inputs = [...ed.shadowRoot.querySelectorAll('input[data-cb-index]')];
    const visible = inputs.filter((i) => {
      const r = i.getBoundingClientRect();
      return r.top > 90 && r.bottom < 760;
    });
    if (!visible.length) return null;
    const el = visible[Math.floor(visible.length / 2)];
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, before: Math.round(canvas.scrollTop) };
  }, pos);
  if (!spot) return null;
  await page.touchscreen.tap(spot.x, spot.y);
  await page.waitForTimeout(500);
  const after = await editorState();
  return { pos, before: spot.before, after: after.scrollTop, delta: after.scrollTop - spot.before, dirty: after.dirty };
}

await openPreview();
const initial = await editorState();
check("the note renders at least four tappable checkboxes", initial.boxes >= 4, `found ${initial.boxes}`);
if (initial.boxes < 4) {
  await browser.close();
  process.exit(1);
}

for (const pos of [0, 150, 400, 700, 1000]) {
  const trial = await tapAt(pos);
  if (!trial) {
    check(`scroll ${pos}: a checkbox is visible to tap`, false);
    continue;
  }
  check(
    `scroll ${pos}: ticking a box does not move the view`,
    trial.delta === 0,
    `scrollTop ${trial.before} -> ${trial.after} (${trial.delta}px)`,
  );
  check(`scroll ${pos}: the tap still marks the note dirty`, trial.dirty === true);

  // Each trial must start from a clean note: markAsChanged() only triggers a render on
  // the first change since the last save, so a still-dirty editor would never re-render
  // and the check would pass without exercising the bug at all.
  await page.waitForFunction(() => {
    const ed = document.querySelector("notes-app").shadowRoot.querySelector("note-editor");
    return ed.saveStatus === "saved" && ed.hasUnsavedChanges === false;
  }, null, { timeout: 10000 });
}

await page.waitForTimeout(3200);
const saved = await editorState();
check("the toggles autosave", saved.status === "saved", `status ${saved.status}`);

const afterFlip = await page.evaluate(async () => {
  const ed = document.querySelector("notes-app").shadowRoot.querySelector("note-editor");
  ed.previewMode = false;
  await new Promise((r) => setTimeout(r, 300));
  ed.previewMode = true;
  await new Promise((r) => setTimeout(r, 500));
  const inputs = [...ed.shadowRoot.querySelectorAll('input[data-cb-index]')];
  return inputs.map((i) => (i.checked ? 1 : 0)).join("");
});
const stored = await page.evaluate(async (id) => {
  const res = await NotesApp.getNote(id);
  return res.data.content;
}, NOTE_ID);
const storedBoxes = [...stored.matchAll(/\[([ xX])\]/g)].map((m) => (m[1] === " " ? "0" : "1")).join("");
check(
  "a view-mode flip after the taps shows what was saved",
  afterFlip === storedBoxes,
  `on screen ${afterFlip}, stored ${storedBoxes}`,
);

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log("FAILED:");
  for (const f of failed) console.log(`  - ${f.label}`);
  process.exit(1);
}
console.log("preview-scroll: ok");
