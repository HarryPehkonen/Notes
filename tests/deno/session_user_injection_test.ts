/**
 * Injecting the signed-in user into the page, and the guards that keep the
 * promise honest.
 *
 * The original bug was a promise with no implementation: a comment said the
 * server "injects" `globalThis.user`, and nothing did. Two guards here make
 * that shape of bug fail loudly next time:
 *   - every `{{...}}` placeholder in index.html must be gone after the page's
 *     full injection chain runs (a placeholder nobody fills is a broken page);
 *   - the component must read the injected meta tag, and must not read a global
 *     that nothing sets.
 */

import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { injectAppName } from "../../server/branding.js";
import { injectNonce } from "../../server/security-headers.js";
import { injectSessionUser } from "../../server/session-user.js";

const read = (path: string) => Deno.readTextFile(new URL(path, import.meta.url));
const indexHtml = () => read("../../public/index.html");
const component = () => read("../../public/components/notes-app.js");
const serverMain = () => read("../../server/main.js");

Deno.test("injectSessionUser: the placeholder becomes the signed-in name", async () => {
  const html = await indexHtml();
  const out = injectSessionUser(html, { name: "Harri Pehkonen" });
  assert(out.includes('content="Harri Pehkonen"'), "the name must reach the meta tag");
  assert(!out.includes("SESSION_USER_NAME"), "the placeholder must be consumed");
});

Deno.test("injectSessionUser: no session leaves an empty value, not a placeholder", async () => {
  const html = await indexHtml();
  for (const nobody of [null, undefined, {}, { name: "" }, { name: "   " }, { name: 42 }]) {
    const out = injectSessionUser(html, nobody);
    assert(!out.includes("SESSION_USER_NAME"), "no placeholder may survive");
    assert(out.includes('<meta name="session-user-name" content="">'), "expected an empty value");
  }
});

Deno.test("injectSessionUser: a name containing HTML cannot break out of the attribute", async () => {
  const html = await indexHtml();
  const out = injectSessionUser(html, { name: '<script>alert(1)</script>" onload="x' });
  assert(!out.includes("<script>alert(1)"), "the name must be escaped");
  assert(out.includes("&lt;script&gt;"), "escaped, not dropped");
  assert(!out.includes('onload="x"'), "attribute breakout must be impossible");
});

Deno.test("index.html carries the placeholder the server fills", async () => {
  const html = await indexHtml();
  assert(
    html.includes('<meta name="session-user-name" content="{{SESSION_USER_NAME}}">'),
    "index.html must carry the session-user meta tag",
  );
});

Deno.test("the page's injection chain leaves no placeholder unfilled", async () => {
  const html = await indexHtml();
  const served = injectSessionUser(
    injectAppName(injectNonce(html, "test-nonce"), { full: "Notes App", short: "Notes" }),
    { name: "Harri Pehkonen" },
  );
  const leftovers = [...served.matchAll(/\{\{[^}]*\}\}/g)].map((match) => match[0]);
  assertEquals(leftovers, [], `placeholders nobody fills: ${leftovers.join(", ")}`);
});

Deno.test("server: the / route injects the session user into index.html", async () => {
  const main = await serverMain();
  const start = main.indexOf("// Serve main app.");
  assert(start > -1, "the main-app route must exist");
  const route = main.slice(start, main.indexOf('router.get("/login"', start));
  assert(route.includes("index.html"), "it serves index.html");
  assert(route.includes("injectSessionUser"), "it injects the session user");
  assert(
    /injectSessionUser\([\s\S]*session\.get\("user"\)/.test(route),
    "the injected value must come from the session, not from nowhere",
  );
});

/** Every .js file under public/, recursively (mirrors tests/deno/api_paths_test.ts). */
async function collectJsFiles(dirUrl: URL): Promise<URL[]> {
  const files: URL[] = [];
  for await (const entry of Deno.readDir(dirUrl)) {
    const entryUrl = new URL(entry.name, dirUrl.href.endsWith("/") ? dirUrl : `${dirUrl}/`);
    if (entry.isDirectory) {
      files.push(...(await collectJsFiles(entryUrl)));
    } else if (entry.isFile && entry.name.endsWith(".js")) {
      files.push(entryUrl);
    }
  }
  return files;
}

/** Drop comment lines: prose may name the thing a guard forbids in code. */
function codeOnly(source: string): string {
  return source
    .split("\n")
    .filter((line) => {
      const trimmed = line.trimStart();
      return !(trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*"));
    })
    .join("\n");
}

Deno.test("client: no public/**/*.js reads a global nobody sets", async () => {
  const files = await collectJsFiles(new URL("../../public/", import.meta.url));
  const offenders: string[] = [];
  for (const fileUrl of files) {
    const code = codeOnly(await Deno.readTextFile(fileUrl));
    if (/globalThis\.user\b/.test(code)) offenders.push(fileUrl.pathname);
  }
  assertEquals(
    offenders,
    [],
    "`globalThis.user` is the promise that was never kept (no injection ever wrote it, so " +
      "the avatar and name never rendered): read the injected meta tag instead - " +
      offenders.join(", "),
  );
});

Deno.test("client: the component reads the injected user helper", async () => {
  const app = await component();
  assert(app.includes("readSessionUser("), "the component must use the session-user helper");
});

Deno.test("client: the avatar is drawn locally - the CSP allows no Google image", async () => {
  const app = await component();
  assert(
    !/<img src="\$\{this\.user\.picture\}/.test(app),
    "no third-party avatar image: img-src is 'self' data: blob:",
  );
  assert(app.includes("user.initial"), "the avatar shows the name's initial");
});

Deno.test("client: the account row and popover still show the name", async () => {
  const app = await component();
  assert(app.includes('<span class="user-name">${this.user.name}</span>'), "drawer shows the name");
  assert(app.includes("this.user?.name"), "the popover shows the name");
});
