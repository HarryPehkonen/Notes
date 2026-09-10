/**
 * The client build number, and the rule that keeps it honest.
 *
 * The number is shown in the app's account menu so a device can be asked which
 * build it is running - the question that cost an evening of cache forensics.
 * It is only useful if it can be trusted, and the way it breaks is drift: the
 * page says one build while the service worker caches under another, so a phone
 * runs yesterday's code with today's label.
 *
 * These tests read the two files directly and insist they agree.
 */
import { assert, assertEquals, assertMatch } from "https://deno.land/std@0.208.0/assert/mod.ts";

const VERSION_FILE = new URL("../../public/version.js", import.meta.url);
const SW_FILE = new URL("../../public/sw.js", import.meta.url);
const APP_FILE = new URL("../../public/components/notes-app.js", import.meta.url);

async function read(url) {
  return await Deno.readTextFile(url);
}

Deno.test("the client build number is a small positive integer", async () => {
  const source = await read(VERSION_FILE);
  const match = source.match(/export const APP_VERSION = (\d+);/);
  assert(match, "version.js should export APP_VERSION as a plain number");
  const version = Number(match[1]);
  assert(Number.isInteger(version) && version > 0);
});

Deno.test("sw.js caches under the same build number the page displays", async () => {
  const versionSource = await read(VERSION_FILE);
  const version = Number(versionSource.match(/APP_VERSION = (\d+)/)[1]);

  const swSource = await read(SW_FILE);
  const cacheName = swSource.match(/const CACHE_NAME = "([^"]+)";/)[1];

  assertMatch(cacheName, /^notes-app-v\d+$/, "CACHE_NAME keeps the notes-app-vN shape");
  assertEquals(
    cacheName,
    `notes-app-v${version}`,
    "sw.js CACHE_NAME and version.js APP_VERSION must be bumped together",
  );
});

Deno.test("the app actually renders the build number", async () => {
  const source = await read(APP_FILE);
  assertMatch(source, /import \{ APP_VERSION \}/, "notes-app.js should import APP_VERSION");
  assertMatch(source, /Version \$\{APP_VERSION\}/, "the account menu should display it");
});
