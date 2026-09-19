/**
 * The client/server URL contract: every path the browser asks for must be a
 * route the server actually serves.
 *
 * Why this file exists: on 2026-09-18 a tag tap had been fetching
 * `/api/api/notes/:id/tags/:id` - a doubled prefix, no such route, 404, and the
 * user saw "check your connection". One test pinned that one URL afterwards,
 * but the same class of bug could hide at any of the other call sites, and a
 * dead route is invisible to every other kind of test in this suite (no DOM
 * renders, no server runs).
 *
 * So the contract is DERIVED FROM THE SOURCES, not listed by hand:
 *   - client paths: the literal arguments of `this.request(...)` and
 *     `fetch(`${this.apiUrl}...`)` in `public/app.js`
 *   - server routes: `router.get|post|put|delete` in every router file, with
 *     each router's mount prefix read out of `server/main.js`
 *   - the composition rule: every client path is relative to `apiUrl`
 * Nothing here needs a browser, a database, or a running server - it is text
 * analysis, so it runs in the gate on every push and every night.
 *
 * Two rules keep it from passing vacuously (both learned the hard way):
 *   1. the extractor must FIND a plausible number of calls and routes - a
 *      parser that silently matches nothing would otherwise "prove" anything;
 *   2. the checker must be shown to fail on a planted mismatch (see the
 *      synthetic tests in the *_test.ts next to this file).
 */

export type ClientCall = {
  file: string;
  method: string;
  /** Path as written at the call site, relative to apiUrl, params normalized. */
  path: string;
  /** The call site source, for readable failure messages. */
  raw: string;
};

export type ServerRoute = {
  file: string;
  method: string;
  /** Full pattern including the mount prefix, Oak's `:param` / `:path*` syntax. */
  pattern: string;
};

export type Extraction = {
  calls: ClientCall[];
  /** Call sites whose path is built dynamically, so no literal can be read. */
  skipped: number;
};

export type Mismatch = { call: ClientCall; fullPath: string; reason: string };

const API_URL_RE = /apiUrl:\s*"([^"]+)"/;
const REQUEST_RE = /this\.request\(\s*([`"'])([\s\S]*?)\1\s*(?:,\s*(\{[\s\S]*?\}))?\s*\)/g;
const FETCH_API_RE = /fetch\(\s*`\$\{this\.apiUrl\}([\s\S]*?)`\s*(?:,\s*(\{[\s\S]*?\}))?\s*\)/g;
const REQUEST_SITE_RE = /this\.request\(/g;
const METHOD_RE = /method:\s*"([A-Z]+)"/;
const ROUTE_RE = /router\.(get|post|put|delete)\(\s*([`"'])([\s\S]*?)\2/g;
const FACTORY_IMPORT_RE = /import\s*\{\s*create(\w+)Router\s*\}\s*from\s*"\.\/(api\/\w+\.js)"/g;
const ROUTER_VAR_RE = /const\s+(\w+Router)\s*=\s*create(\w+)Router\([^)]*\)/g;
const MOUNT_RE = /router\.use\(\s*"(\/api\/[^"]*)"[^\n]*?(\w+Router)\.routes\(\)/g;
const WEBSOCKET_RE = /new WebSocket\(\s*`[^`]*\}([^`]*)`/;
const NEW_WEBSOCKET_VAR_RE = /new WebSocket\(\s*(\w+)\s*\)/;
const TEMPLATE_ASSIGNMENT_RE = /const\s+(\w+)\s*=\s*`([^`]*)`/g;

/**
 * The API prefix the client composes every path onto (`app.js` owns it).
 * @param {string} appSource
 * @returns {string|null}
 */
export function apiPrefix(appSource: string): string | null {
  const match = appSource.match(API_URL_RE);
  return match ? match[1] : null;
}

/**
 * Normalize a path written in a template literal into a comparable path:
 * a query string is dropped (whatever built it), and each `${...}` becomes one
 * opaque segment, because that is what it is at the wire level.
 * @param {string} raw
 * @returns {string}
 */
export function normalizePath(raw: string): string {
  const path = raw.split("?")[0].replace(/\$\{[^}]*\}/g, ":param").replace(/\/{2,}/g, "/");
  if (!path.startsWith("/")) return `/${path}`;
  return path === "" ? "/" : path;
}

/**
 * Every literal client call in one source file. The method comes from the
 * options object when there is one; `this.request` defaults to GET.
 * @param {string} source
 * @param {string} file
 * @returns {Extraction}
 */
export function clientCalls(source: string, file: string): Extraction {
  const calls: ClientCall[] = [];

  let totalSites = 0;
  for (const _ of source.matchAll(REQUEST_SITE_RE)) totalSites++;

  let literalSites = 0;
  for (const match of source.matchAll(REQUEST_RE)) {
    literalSites++;
    const options = match[3] ?? "";
    calls.push({
      file,
      method: options.match(METHOD_RE)?.[1] ?? "GET",
      path: normalizePath(match[2]),
      raw: match[0].replace(/\s+/g, " ").slice(0, 80),
    });
  }

  for (const match of source.matchAll(FETCH_API_RE)) {
    calls.push({
      file,
      method: (match[2] ?? "").match(METHOD_RE)?.[1] ?? "GET",
      path: normalizePath(match[1]),
      raw: match[0].replace(/\s+/g, " ").slice(0, 80),
    });
  }

  // A `this.request(...)` whose first argument is not a literal (a variable, or
  // a path assembled elsewhere) cannot be read statically. Counted, not guessed:
  // the test asserts the exact number, so a new dynamic site has to be reviewed.
  return { calls, skipped: totalSites - literalSites };
}

/**
 * The path a WebSocket URL opens, if the source builds one out of
 * `location.host` (live sync is the only such client, and being a WebSocket it
 * is not a `request()` call). Handles both shapes in the wild: the template
 * passed straight to the constructor, and the template assigned to a variable
 * first - the real live-sync.js does the latter.
 * @param {string} source
 * @returns {string|null}
 */
export function websocketPath(source: string): string | null {
  const direct = source.match(WEBSOCKET_RE);
  if (direct) return normalizePath(direct[1]);

  const templates = new Map<string, string>();
  for (const match of source.matchAll(TEMPLATE_ASSIGNMENT_RE)) {
    templates.set(match[1], match[2]);
  }

  const named = source.match(NEW_WEBSOCKET_VAR_RE);
  const template = named ? templates.get(named[1]) : undefined;
  if (template === undefined) return null;

  // Everything after the host expression is the path.
  return normalizePath(template.slice(template.lastIndexOf("}") + 1));
}

/**
 * Every route a router file declares, before any mount prefix is applied.
 * @param {string} source
 * @param {string} file
 * @returns {ServerRoute[]}
 */
export function declaredRoutes(source: string, file: string): ServerRoute[] {
  const routes: ServerRoute[] = [];
  for (const match of source.matchAll(ROUTE_RE)) {
    routes.push({ file, method: match[1].toUpperCase(), pattern: match[3] });
  }
  return routes;
}

/**
 * Which file each mounted router comes from, read out of the server entry
 * point: the import gives factory -> file, the const gives variable ->
 * factory, and the `router.use` line gives prefix -> variable -> file. Nothing
 * is hard-coded, so a new router cannot slip past the contract by being new.
 * @param {string} mainSource
 * @returns {Map<string, string>} file -> mount prefix
 */
export function mountedRouters(mainSource: string): Map<string, string> {
  const factoryToFile = new Map<string, string>();
  for (const match of mainSource.matchAll(FACTORY_IMPORT_RE)) {
    factoryToFile.set(`create${match[1]}Router`, `server/${match[2]}`);
  }

  const varToFactory = new Map<string, string>();
  for (const match of mainSource.matchAll(ROUTER_VAR_RE)) {
    varToFactory.set(match[1], `create${match[2]}Router`);
  }

  const fileToPrefix = new Map<string, string>();
  for (const match of mainSource.matchAll(MOUNT_RE)) {
    const factory = varToFactory.get(match[2]);
    const file = factory ? factoryToFile.get(factory) : undefined;
    if (file) fileToPrefix.set(file, match[1]);
  }
  return fileToPrefix;
}

/**
 * All routes the server serves, with mount prefixes applied. The entry point's
 * own routes (/, /login, /static/:path*, /ws, ...) are included unprefixed.
 * @param {Array<{file: string, source: string}>} sources - `server/main.js` first
 * @returns {ServerRoute[]}
 */
export function serverRoutes(sources: Array<{ file: string; source: string }>): ServerRoute[] {
  const mounts = mountedRouters(sources[0].source);
  const routes: ServerRoute[] = [];

  for (const { file, source } of sources) {
    const prefix = mounts.get(file) ?? "";
    for (const route of declaredRoutes(source, file)) {
      const joined = `${prefix}${route.pattern === "/" ? "" : route.pattern}`.replace(
        /\/{2,}/g,
        "/",
      );
      routes.push({ ...route, pattern: joined === "" ? "/" : joined });
    }
  }
  return routes;
}

/**
 * Does a route pattern serve a concrete path? `:name` matches exactly one
 * segment, `:path*` matches one or more (Oak's wildcard), literals must match.
 * @param {string} pattern
 * @param {string} path
 * @returns {boolean}
 */
export function routeMatches(pattern: string, path: string): boolean {
  const patternSegments = pattern.split("/").filter(Boolean);
  const pathSegments = path.split("/").filter(Boolean);

  for (let i = 0; i < patternSegments.length; i++) {
    const segment = patternSegments[i];
    const isLast = i === patternSegments.length - 1;

    if (segment.endsWith("*")) {
      return isLast && pathSegments.length > i;
    }
    if (i >= pathSegments.length) return false;
    if (!segment.startsWith(":") && segment !== pathSegments[i]) return false;
    if (segment.startsWith(":") && pathSegments[i] === "") return false;
  }

  return patternSegments.length === pathSegments.length;
}

/**
 * The whole check: every client call must resolve to a route, with the method
 * it uses. Returns the mismatches (empty means the contract holds).
 * @param {{calls: ClientCall[], routes: ServerRoute[], prefix: string}} input
 * @returns {Mismatch[]}
 */
export function checkContract(
  { calls, routes, prefix }: { calls: ClientCall[]; routes: ServerRoute[]; prefix: string },
): Mismatch[] {
  const mismatches: Mismatch[] = [];

  for (const call of calls) {
    const fullPath = normalizePath(`${prefix}${call.path}`);
    const forMethod = routes.filter((route) => route.method === call.method);
    if (forMethod.some((route) => routeMatches(route.pattern, fullPath))) continue;

    const anyMethod = routes.some((route) => routeMatches(route.pattern, fullPath));
    mismatches.push({
      call,
      fullPath,
      reason: anyMethod
        ? `a route serves ${fullPath}, but not for ${call.method}`
        : `no route serves ${call.method} ${fullPath}`,
    });
  }

  return mismatches;
}
