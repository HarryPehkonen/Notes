import {
  assert,
  assertEquals,
  assertMatch,
  assertNotEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  buildCspPolicy,
  cspMiddleware,
  generateNonce,
  injectNonce,
} from "../../server/security-headers.js";

const CSP_HEADER = "Content-Security-Policy";

/**
 * Pull a single directive out of a policy string
 * @param {string} policy - Full policy header value
 * @param {string} name - Directive name, e.g. "script-src"
 */
function directive(policy: string, name: string): string {
  const found = policy
    .split(";")
    .map((part) => part.trim())
    .find((part) => part === name || part.startsWith(`${name} `));
  if (!found) throw new Error(`No ${name} directive in policy: ${policy}`);
  return found;
}

// buildCspPolicy tests

Deno.test("buildCspPolicy: script-src allows self, the CDN and the nonce", () => {
  const policy = buildCspPolicy("abc123");
  assertStringIncludes(policy, "script-src 'self' https://cdn.jsdelivr.net 'nonce-abc123'");
});

Deno.test("buildCspPolicy: script-src has no 'unsafe-inline'", () => {
  const policy = buildCspPolicy("abc123");
  assertEquals(directive(policy, "script-src").includes("'unsafe-inline'"), false);
});

Deno.test("buildCspPolicy: style-src allows the CDN and inline styles (Lit shadow styles)", () => {
  const styleSrc = directive(buildCspPolicy("abc123"), "style-src");
  assertStringIncludes(styleSrc, "'self'");
  assertStringIncludes(styleSrc, "https://cdn.jsdelivr.net");
  assertStringIncludes(styleSrc, "'unsafe-inline'");
});

Deno.test("buildCspPolicy: img-src allows data: and blob: for paste/upload previews", () => {
  const imgSrc = directive(buildCspPolicy("abc123"), "img-src");
  assertStringIncludes(imgSrc, "data:");
  assertStringIncludes(imgSrc, "blob:");
});

Deno.test("buildCspPolicy: connect-src allows websockets for live sync", () => {
  const connectSrc = directive(buildCspPolicy("abc123"), "connect-src");
  assertStringIncludes(connectSrc, "wss:");
  assertStringIncludes(connectSrc, "ws:");
});

Deno.test("buildCspPolicy: locks down framing, base, form action and objects", () => {
  const policy = buildCspPolicy("abc123");
  assertStringIncludes(policy, "frame-ancestors 'none'");
  assertStringIncludes(policy, "base-uri 'self'");
  assertStringIncludes(policy, "form-action 'self'");
  assertStringIncludes(policy, "object-src 'none'");
});

Deno.test("buildCspPolicy: embeds the nonce it is given", () => {
  assertStringIncludes(buildCspPolicy("zzz-999"), "'nonce-zzz-999'");
  assertEquals(buildCspPolicy("zzz-999").includes("'nonce-abc123'"), false);
});

// generateNonce tests

Deno.test("generateNonce: returns a fresh value each call", () => {
  assertNotEquals(generateNonce(), generateNonce());
});

Deno.test("generateNonce: uses characters that are safe inside a CSP token", () => {
  for (let i = 0; i < 20; i++) {
    assertMatch(generateNonce(), /^[A-Za-z0-9_-]{16,}$/);
  }
});

// injectNonce tests

const IMPORTMAP_HTML = `<!DOCTYPE html>
<html>
  <head>
    <script type="importmap">
      { "imports": { "lit": "https://cdn.jsdelivr.net/npm/lit@3.1.0/+esm" } }
    </script>
  </head>
  <body>
    <script>console.log("inline");</script>
    <script type="module" src="/static/app.js"></script>
  </body>
</html>`;

Deno.test("injectNonce: adds the nonce to the importmap script tag", () => {
  const html = injectNonce(IMPORTMAP_HTML, "n0nce");
  assertMatch(html, /<script nonce="n0nce" type="importmap">/);
});

Deno.test("injectNonce: adds the nonce to every inline script", () => {
  const html = injectNonce(IMPORTMAP_HTML, "n0nce");
  assertMatch(html, /<script nonce="n0nce">console\.log/);
});

Deno.test("injectNonce: leaves external scripts untouched", () => {
  const html = injectNonce(IMPORTMAP_HTML, "n0nce");
  assertStringIncludes(html, `<script type="module" src="/static/app.js"></script>`);
});

Deno.test("injectNonce: does not alter the document otherwise", () => {
  const html = injectNonce(IMPORTMAP_HTML, "n0nce");
  assertStringIncludes(html, `"lit": "https://cdn.jsdelivr.net/npm/lit@3.1.0/+esm"`);
  assertStringIncludes(html, "<!DOCTYPE html>");
});

Deno.test("injectNonce: returns the html unchanged when there is no nonce", () => {
  assertEquals(injectNonce(IMPORTMAP_HTML, ""), IMPORTMAP_HTML);
  assertEquals(injectNonce(IMPORTMAP_HTML, null), IMPORTMAP_HTML);
});

Deno.test("injectNonce: the real index.html importmap gets a nonce", async () => {
  const template = await Deno.readTextFile("./public/index.html");
  const html = injectNonce(template, "real-nonce");
  assertMatch(html, /<script nonce="real-nonce" type="importmap">/);
  // The template itself must stay free of hardcoded nonces
  assertEquals(template.includes("nonce="), false);
});

// cspMiddleware tests

/**
 * Build a fake Oak context for middleware tests
 * @param {string|null} type - Value the handler sets on ctx.response.type
 */
function fakeContext(type: string | null = null) {
  return {
    request: { url: new URL("http://localhost:8000/") },
    response: {
      status: 200,
      type: type as string | null,
      body: null as unknown,
      headers: new Headers(),
    },
    state: {} as Record<string, unknown>,
  };
}

Deno.test("cspMiddleware: sets the header on HTML responses", async () => {
  const ctx = fakeContext();
  await cspMiddleware()(ctx, () => {
    ctx.response.type = "text/html";
    return Promise.resolve();
  });

  const header = ctx.response.headers.get(CSP_HEADER);
  assert(header, "expected a Content-Security-Policy header on an HTML response");
  assertStringIncludes(header, "script-src 'self' https://cdn.jsdelivr.net 'nonce-");
});

Deno.test("cspMiddleware: does not set the header on JSON API responses", async () => {
  const ctx = fakeContext();
  await cspMiddleware()(ctx, () => {
    ctx.response.type = "application/json";
    ctx.response.body = { success: true };
    return Promise.resolve();
  });

  assertEquals(ctx.response.headers.get(CSP_HEADER), null);
});

Deno.test("cspMiddleware: does not set the header when no type was set", async () => {
  const ctx = fakeContext();
  await cspMiddleware()(ctx, () => Promise.resolve());

  assertEquals(ctx.response.headers.get(CSP_HEADER), null);
});

Deno.test("cspMiddleware: exposes a per-request nonce on ctx.state before the handler runs", async () => {
  const ctx = fakeContext();
  let seen: unknown = undefined;
  await cspMiddleware()(ctx, () => {
    seen = ctx.state.cspNonce;
    ctx.response.type = "text/html";
    return Promise.resolve();
  });

  assert(typeof seen === "string" && seen.length > 0, "handler must see a nonce");
  assertStringIncludes(ctx.response.headers.get(CSP_HEADER) ?? "", `'nonce-${seen}'`);
});

Deno.test("cspMiddleware: uses a different nonce for each request", async () => {
  const nonces: unknown[] = [];
  for (let i = 0; i < 2; i++) {
    const ctx = fakeContext();
    await cspMiddleware()(ctx, () => {
      ctx.response.type = "text/html";
      return Promise.resolve();
    });
    nonces.push(ctx.state.cspNonce);
  }
  assertNotEquals(nonces[0], nonces[1]);
});

Deno.test("cspMiddleware: served HTML nonce matches the header nonce", async () => {
  const template = await Deno.readTextFile("./public/index.html");
  const ctx = fakeContext();

  await cspMiddleware()(ctx, () => {
    ctx.response.type = "text/html";
    ctx.response.body = injectNonce(template, ctx.state.cspNonce as string);
    return Promise.resolve();
  });

  const header = ctx.response.headers.get(CSP_HEADER) ?? "";
  const headerNonce = header.match(/'nonce-([^']+)'/)?.[1];
  assert(headerNonce, "header must carry a nonce");

  const bodyNonce = String(ctx.response.body).match(
    /<script nonce="([^"]+)" type="importmap">/,
  )?.[1];
  assertEquals(bodyNonce, headerNonce);
});
