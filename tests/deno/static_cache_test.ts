/**
 * Cache-Control policy for /static/.
 *
 * The filenames under /static/ are not content-hashed, so a long max-age on
 * code is how a deploy goes invisible: the phone keeps serving the old
 * component and a shipped button never appears. Code revalidates instead (the
 * route sets a content-hash ETag, so an unchanged file is a cheap 304); images
 * and fonts keep the long cache because a new image is not a deploy.
 */
import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { cacheControlFor, staticCacheEnvironment } from "../../server/static-cache.js";

Deno.test("code revalidates instead of being cached for a day", () => {
  for (
    const filePath of ["components/note-editor.js", "styles/app.css", "index.html", "manifest.json"]
  ) {
    assertEquals(
      cacheControlFor({ filePath, environment: "production" }),
      "no-cache",
      `${filePath} must revalidate`,
    );
  }
});

Deno.test("the service worker always revalidates", () => {
  assertEquals(cacheControlFor({ filePath: "sw.js", environment: "production" }), "no-cache");
});

Deno.test("images and fonts keep the long cache (24x the asset max-age)", () => {
  for (const filePath of ["icon.png", "favicon.svg", "photo.jpg", "font.woff2"]) {
    assertEquals(
      cacheControlFor({ filePath, environment: "production" }),
      "public, max-age=2073600",
      `${filePath} should keep the long cache`,
    );
  }
});

Deno.test("anything else gets the plain asset max-age", () => {
  assertEquals(
    cacheControlFor({ filePath: "notes.txt", environment: "production" }),
    "public, max-age=86400",
  );
  assertEquals(
    cacheControlFor({ filePath: "notes.txt", environment: "development" }),
    "public, max-age=3600",
  );
});

Deno.test("an explicit extension wins over the filename", () => {
  assertEquals(
    cacheControlFor({ filePath: "bundle.1234", ext: "js", environment: "production" }),
    "no-cache",
  );
});

Deno.test("no arguments is not a crash", () => {
  assertEquals(cacheControlFor(), "public, max-age=3600");
});

Deno.test("the /static/ route uses the helper and no other variable name", async () => {
  // Unit-testing the helper still cannot see the call site, so pin it: the
  // route must pass staticCacheEnvironment() and the repo must not look up
  // ENVIRONMENT (nothing sets it - that was the production bug).
  const main = await Deno.readTextFile("./server/main.js");
  assertEquals(
    main.includes("environment: staticCacheEnvironment()"),
    true,
    "the /static/ route must read the environment through staticCacheEnvironment()",
  );
  assertEquals(
    main.includes('"ENVIRONMENT"'),
    false,
    "server/main.js must not read ENVIRONMENT - the runtime exports NODE_ENV",
  );
});

// The tests above pass `environment` in directly, so they cannot see which
// variable the route actually reads. These two exercise that wiring: a wrong
// env-var name at the call site is exactly how every image and font quietly
// fell back to `public, max-age=86400` in production (2026-09-10).

Deno.test({
  name: "the cache policy is wired to NODE_ENV, the variable the runtime sets",
  permissions: { env: true },
  fn() {
    const originalNodeEnv = Deno.env.get("NODE_ENV");
    try {
      // systemd Notes.service and /opt/Notes/.env both export this in production.
      Deno.env.set("NODE_ENV", "production");

      assertEquals(staticCacheEnvironment(), "production");
      assertEquals(
        cacheControlFor({ filePath: "favicon.svg", environment: staticCacheEnvironment() }),
        "public, max-age=2073600",
      );

      Deno.env.set("NODE_ENV", "development");
      assertEquals(staticCacheEnvironment(), "development");
      assertEquals(
        cacheControlFor({ filePath: "favicon.svg", environment: staticCacheEnvironment() }),
        "public, max-age=86400",
      );
    } finally {
      if (originalNodeEnv === undefined) Deno.env.delete("NODE_ENV");
      else Deno.env.set("NODE_ENV", originalNodeEnv);
    }
  },
});

Deno.test({
  name: "staticCacheEnvironment ignores ENVIRONMENT, which nothing sets",
  permissions: { env: true },
  fn() {
    const originalNodeEnv = Deno.env.get("NODE_ENV");
    try {
      Deno.env.delete("NODE_ENV");
      Deno.env.set("ENVIRONMENT", "production");

      assertEquals(staticCacheEnvironment(), null);
      // The pre-fix bug: null environment means the 1-hour fallback, so the
      // favicon got `max-age=86400` instead of the 24-day image max-age.
      assertEquals(
        cacheControlFor({ filePath: "favicon.svg", environment: staticCacheEnvironment() }),
        "public, max-age=86400",
      );
    } finally {
      Deno.env.delete("ENVIRONMENT");
      if (originalNodeEnv !== undefined) Deno.env.set("NODE_ENV", originalNodeEnv);
    }
  },
});
