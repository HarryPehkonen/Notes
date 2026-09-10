import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { contentHashEtag, ifNoneMatchMatches } from "../../server/static-conditions.js";

// contentHashEtag

Deno.test("contentHashEtag quotes the lowercase SHA-1 hex of the bytes", async () => {
  assertEquals(
    await contentHashEtag(new TextEncoder().encode("hello")),
    '"aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d"',
  );
});

Deno.test("contentHashEtag is content-addressed (a different input differs)", async () => {
  const a = await contentHashEtag(new TextEncoder().encode("hello"));
  const b = await contentHashEtag(new TextEncoder().encode("world"));
  assertEquals(a === b, false);
});

// ifNoneMatchMatches

Deno.test("ifNoneMatchMatches: true for the exact quoted tag", () => {
  assertEquals(ifNoneMatchMatches('"tag"', '"tag"'), true);
});

Deno.test("ifNoneMatchMatches: weak comparison both ways", () => {
  assertEquals(ifNoneMatchMatches('W/"tag"', '"tag"'), true);
  assertEquals(ifNoneMatchMatches('"tag"', 'W/"tag"'), true);
});

Deno.test("ifNoneMatchMatches: true for *", () => {
  assertEquals(ifNoneMatchMatches("*", '"tag"'), true);
});

Deno.test("ifNoneMatchMatches: true when the match is later in a comma list", () => {
  assertEquals(ifNoneMatchMatches('"other", "tag"', '"tag"'), true);
});

Deno.test("ifNoneMatchMatches: false for non-matches and malformed input", () => {
  assertEquals(ifNoneMatchMatches('"nope"', '"tag"'), false);
  assertEquals(ifNoneMatchMatches(null, '"tag"'), false);
  assertEquals(ifNoneMatchMatches(undefined, '"tag"'), false);
  assertEquals(ifNoneMatchMatches("", '"tag"'), false);
  assertEquals(ifNoneMatchMatches("   ", '"tag"'), false);
  assertEquals(ifNoneMatchMatches("tag", '"tag"'), false);
  assertEquals(ifNoneMatchMatches('"tag"', "tag"), false);
});

Deno.test("ifNoneMatchMatches: never throws on garbage", () => {
  assertEquals(ifNoneMatchMatches('"a', "b"), false);
  // deno-lint-ignore no-explicit-any
  assertEquals(ifNoneMatchMatches(123 as any, '"a"'), false);
});

// Source-level pins - a pure unit test cannot see the route/SW wiring.

Deno.test("the /static/ route honours If-None-Match with a 304", async () => {
  const main = await Deno.readTextFile("./server/main.js");
  assertEquals(
    main.includes('ifNoneMatchMatches(ctx.request.headers.get("if-none-match")'),
    true,
    "the route must ask ifNoneMatchMatches about the request header",
  );
  assertEquals(
    main.includes("ctx.response.status = 304"),
    true,
    "the route must answer 304 when the representation is unchanged",
  );
  assertEquals(
    main.includes("contentHashEtag(file)"),
    true,
    "the route must build the ETag through contentHashEtag, not an inline digest",
  );
  assertEquals(
    main.includes('crypto.subtle.digest("SHA-1", file)'),
    false,
    "the inline digest must be gone",
  );
});

Deno.test("sw.js revalidates static assets through the HTTP cache", async () => {
  const sw = await Deno.readTextFile("./public/sw.js");
  assertEquals(
    sw.includes('cache: "no-cache"'),
    true,
    "static assets must revalidate with cache: no-cache so If-None-Match is sent",
  );
  assertEquals(
    (sw.match(/\{ cache: "reload" \}/g) || []).length,
    1,
    'exactly one `cache: "reload"` fetch remains (the "/" branch)',
  );
});
