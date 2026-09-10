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
import { cacheControlFor } from "../../server/static-cache.js";

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
