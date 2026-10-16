/**
 * The API-tokens page's contract: every path it calls is a route the server
 * serves, the page itself is reachable, and the one rule that makes a token
 * safe to hand out (a token cannot manage tokens) is still in the code.
 *
 * This is the `route_contract_test.ts` idea applied to the settings page: that
 * guard reads `public/app.js`, this page is a second client, and a client whose
 * URLs silently 404 is exactly the failure mode the guard exists for - a person
 * clicking "Create token" and seeing "check your connection".
 *
 * Text analysis, no browser and no server: it runs in the gate on every push.
 */

import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";

const read = (path: string) => Deno.readTextFile(new URL(path, import.meta.url));

const pageJs = await read("../../public/tokens.js");
const pageHtml = await read("../../public/tokens.html");
const tokensApi = await read("../../server/api/tokens.js");
const mainJs = await read("../../server/main.js");

type Call = { method: string; path: string; raw: string };

/** The API constant the page builds every path from. */
function apiConstant(source: string): string {
  const match = source.match(/const\s+API\s*=\s*"([^"]+)"/);
  assert(match, 'public/tokens.js must declare `const API = "/api/..."`');
  return match![1];
}

/**
 * Call sites in the page: `call(API)`, `call(`${API}/x`)`, with an optional
 * options object carrying `method: "..."`. Anything dynamic is normalized to
 * `:id`, the same convention `route_contract.ts` uses.
 */
function clientCalls(source: string, api: string): Call[] {
  const calls: Call[] = [];
  const callRe = /call\(\s*(`([^`]*)`|API)\s*(?:,\s*\{([\s\S]*?)\})?\s*\)/g;

  for (const match of source.matchAll(callRe)) {
    const literal = match[2];
    const suffix = literal === undefined ? "" : literal.replace(/\$\{API\}/g, "").replace(
      /\$\{[^}]*\}/g,
      ":id",
    );
    const options = match[3] ?? "";
    const methodMatch = options.match(/method:\s*"([A-Z]+)"/);

    calls.push({
      method: methodMatch ? methodMatch![1] : "GET",
      path: `${api}${suffix}`,
      raw: match[0],
    });
  }

  return calls;
}

/** Routes declared in the tokens router, with `/api/tokens` as the mount. */
function serverRoutes(source: string, mount: string) {
  const routes: { method: string; pattern: string }[] = [];
  const routeRe = /router\.(get|post|put|delete)\(\s*"([^"]+)"/g;

  for (const match of source.matchAll(routeRe)) {
    const suffix = match![2] === "/" ? "" : match![2];
    routes.push({ method: match![1].toUpperCase(), pattern: `${mount}${suffix}` });
  }

  return routes;
}

/** Client `:id` matches server `:id`; everything else must be literal. */
function matches(call: Call, route: { method: string; pattern: string }): boolean {
  if (call.method !== route.method) return false;
  const segments = (value: string) => value.split("/").filter(Boolean);
  const called = segments(call.path);
  const declared = segments(route.pattern);
  if (called.length !== declared.length) return false;

  return declared.every((segment, index) =>
    segment.startsWith(":") ? called[index].length > 0 : segment === called[index]
  );
}

const API = apiConstant(pageJs);
const calls = clientCalls(pageJs, API);
const routes = serverRoutes(tokensApi, API);

Deno.test("tokens page: the extractors found something (a silent parser proves nothing)", () => {
  assert(calls.length >= 3, `expected several client calls, found ${calls.length}`);
  assert(routes.length >= 3, `expected list/create/revoke routes, found ${routes.length}`);
  assertEquals(routes.map((r) => `${r.method} ${r.pattern}`).sort(), [
    "DELETE /api/tokens/:id",
    "GET /api/tokens",
    "POST /api/tokens",
  ]);
});

Deno.test("tokens page: every call it makes is a route the server serves", () => {
  assert(calls.length > 0, "no call sites found - the parser or the page changed shape");
  for (const call of calls) {
    assert(
      routes.some((route) => matches(call, route)),
      `public/tokens.js calls ${call.method} ${call.path}, which no route matches (${call.raw})`,
    );
  }
});

Deno.test("the checker is shown to fail on a planted mismatch", () => {
  // Same discipline as route_contract_test.ts: a checker that cannot fail is
  // not evidence. ADD is a method no route declares.
  const planted: Call = { method: "ADD", path: `${API}/:id`, raw: "call(...)" };
  assert(!routes.some((route) => matches(planted, route)), "ADD must not match any route");
  const wrongPath: Call = { method: "DELETE", path: `${API}/:id/extra`, raw: "call(...)" };
  assert(!routes.some((route) => matches(wrongPath, route)), "a longer path must not match");
});

Deno.test("the tokens router is mounted behind requireAuth", () => {
  assert(
    /router\.use\(\s*"\/api\/tokens",\s*requireAuth,/.test(mainJs),
    "the tokens API must be mounted with requireAuth",
  );
});

Deno.test("a token may never manage tokens: the guard is session-only", () => {
  assert(
    tokensApi.includes('ctx.state.authMethod !== "session"'),
    "server/api/tokens.js must refuse anything that is not a session",
  );
  // The guard is router-wide, not per-route: a route added later inherits it.
  assert(
    /router\.use\(async \(ctx, next\) => \{[\s\S]*?authMethod !== "session"[\s\S]*?\}\);/.test(
      tokensApi,
    ),
    "the session check must be router-level `router.use(...)`, so new routes inherit it",
  );
});

Deno.test("no response from the tokens API can carry a token hash", () => {
  assert(
    !/RETURNING[\s\S]{0,40}token_hash/.test(tokensApi),
    "no query may return the stored digest",
  );
  const columns = tokensApi.match(/const TOKEN_COLUMNS\s*=\s*"([^"]+)"/);
  assert(columns, "the selected columns must be named in one place");
  assert(!columns![1].includes("token_hash"), "TOKEN_COLUMNS must never include token_hash");
});

Deno.test("the page is reachable: route, file, and the script it loads", () => {
  assert(
    /router\.get\(\s*"\/settings\/tokens"/.test(mainJs),
    "main.js must serve GET /settings/tokens",
  );
  assert(pageHtml.includes("/static/tokens.js"), "tokens.html must load its script from /static");
  assert(pageHtml.includes("/static/favicon.svg"), "the page keeps the app's icon");
  assert(
    pageHtml.includes('href="/"'),
    "the page needs a way back to the notes, since it replaces the app shell",
  );
});

Deno.test("the page never writes API data as markup", () => {
  // Every value the server sends (a token name, a token) is user input; the
  // page builds rows with createElement/textContent, never innerHTML.
  assert(!pageJs.includes("innerHTML"), "public/tokens.js must not use innerHTML");
  assert(pageJs.includes("textContent"), "rows are built with textContent");
  assert(
    pageJs.includes("confirm("),
    "revoking is destructive and immediate - it must ask first",
  );
});

Deno.test("the page says the token is shown once, next to where it is shown", () => {
  assert(
    /only once/i.test(pageHtml),
    "the one-time nature of the token must be on the page, not just in a comment",
  );
});

Deno.test("the app itself links to the page, on both surfaces", () => {
  return read("../../public/components/notes-app.js").then((app) => {
    const links = app.match(/href="\/settings\/tokens"/g) ?? [];
    assert(
      links.length >= 2,
      `expected the mobile drawer and the desktop popover to link to the page, found ${links.length}`,
    );
  });
});
