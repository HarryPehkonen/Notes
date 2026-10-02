/**
 * The media-watch "waiting on" projection: shape validation, sort order, the
 * staleness verdict and honest failure.
 *
 * The point these tests defend: a broken feed must never look like an empty
 * one. "Nothing waiting on right now" is only ever the verdict for a VALID
 * payload whose items array is empty; malformed JSON, a wrong shape, a non-200
 * and an unreachable endpoint each become `status: "error"`.
 */

import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.208.0/assert/mod.ts";

import {
  DEFAULT_STALE_MINUTES,
  DEFAULT_TIMEOUT_MS,
  errorWaitingOn,
  isWaitingOnPayload,
  loadWaitingOn,
  payloadEpochSeconds,
  sortWaitingItems,
  summarizeWaitingOn,
} from "../../server/waiting-on.js";

/** The live payload the endpoint actually returns (2026-10-02). */
const LIVE_PAYLOAD = {
  schema_version: 1,
  generated_at: "2026-10-02T12:39:33Z",
  generated_at_epoch: 1790944773,
  source: "media-watch/watch.db (host hermes, ~/hermes-workspace/media-watch)",
  count: 1,
  counts_by_state: { AWAITING_RELEASE: 1 },
  items: [
    {
      slug: "coyote",
      title: "Coyote vs Acme (2026)",
      type: "movie",
      state: "AWAITING_RELEASE",
      state_label: "Waiting for a qualifying release on the tracker",
      detail: "no qualifying release yet",
      since: "2026-10-02T12:36:24Z",
      age_seconds: 189,
      season: null,
      episode: null,
      release: null,
    },
  ],
  not_waiting: [
    { slug: "dsz", reason: "retired (active=0)" },
    { slug: "snw", reason: "retired (active=0)" },
  ],
  warnings: [],
};

const item = (over) => ({
  slug: over.slug ?? "x",
  title: over.title ?? "X",
  type: over.type ?? "show",
  state: over.state ?? "AWAITING_RELEASE",
  state_label: over.state_label ?? "label",
  detail: over.detail ?? "detail",
  since: null,
  age_seconds: over.age_seconds ?? 0,
});

// ------------------------------------------------------------- shape validation

Deno.test("isWaitingOnPayload: the live envelope is accepted", () => {
  assert(isWaitingOnPayload(LIVE_PAYLOAD));
});

Deno.test("isWaitingOnPayload: valid JSON of the wrong shape is rejected", () => {
  // Each of these is something a misconfigured proxy or DB dump could return;
  // none may read as an empty list.
  assertEquals(isWaitingOnPayload(null), false);
  assertEquals(isWaitingOnPayload([]), false);
  assertEquals(isWaitingOnPayload("nope"), false);
  assertEquals(isWaitingOnPayload({ error: "Not Found" }), false);
  assertEquals(isWaitingOnPayload({ items: [] }), false, "items without a freshness marker");
  assertEquals(
    isWaitingOnPayload({ generated_at: "2026-10-02T12:39:33Z" }),
    false,
    "no items array",
  );
  assertEquals(
    isWaitingOnPayload({ generated_at_epoch: 1, items: "x" }),
    false,
    "items is not an array",
  );
});

Deno.test("isWaitingOnPayload: a freshness marker may be the ISO string or the epoch", () => {
  assert(isWaitingOnPayload({ items: [], generated_at: "2026-10-02T12:39:33Z" }));
  assert(isWaitingOnPayload({ items: [], generated_at_epoch: 1790944773 }));
  assertEquals(isWaitingOnPayload({ items: [], generated_at: "not-a-date" }), false);
  assertEquals(isWaitingOnPayload({ items: [], generated_at_epoch: Number.NaN }), false);
});

Deno.test("payloadEpochSeconds: epoch first, ISO as the fallback, null when unreadable", () => {
  assertEquals(payloadEpochSeconds({ generated_at_epoch: 1790944773 }), 1790944773);
  assertEquals(payloadEpochSeconds({ generated_at: "1970-01-01T00:00:10Z" }), 10);
  assertEquals(payloadEpochSeconds({}), null);
});

// ------------------------------------------------------------------- sort order

Deno.test("sortWaitingItems: state order first, then longest-waiting first", () => {
  const items = [
    item({ slug: "post", state: "AWAITING_POST", age_seconds: 99999 }),
    item({ slug: "release-new", state: "AWAITING_RELEASE", age_seconds: 10 }),
    item({ slug: "download", state: "DOWNLOADING", age_seconds: 5 }),
    item({ slug: "release-old", state: "AWAITING_RELEASE", age_seconds: 5000 }),
    item({ slug: "grab", state: "AWAITING_GRAB", age_seconds: 1 }),
  ];

  assertEquals(sortWaitingItems(items).map((i) => i.slug), [
    "release-old",
    "release-new",
    "grab",
    "download",
    "post",
  ]);
});

Deno.test("sortWaitingItems: an unknown state sorts last, and the sort is total", () => {
  const items = [
    item({ slug: "weird", state: "SOMETHING_NEW", age_seconds: 500 }),
    item({ slug: "b", state: "AWAITING_RELEASE", age_seconds: 5, title: "B" }),
    item({ slug: "a", state: "AWAITING_RELEASE", age_seconds: 5, title: "A" }),
  ];
  assertEquals(sortWaitingItems(items).map((i) => i.slug), ["a", "b", "weird"]);
});

Deno.test("sortWaitingItems: does not mutate its input", () => {
  const items = [
    item({ slug: "a", state: "AWAITING_POST" }),
    item({ slug: "b", state: "AWAITING_RELEASE" }),
  ];
  const before = items.map((i) => i.slug);
  sortWaitingItems(items);
  assertEquals(items.map((i) => i.slug), before);
});

// --------------------------------------------------------------- the verdict

Deno.test("summarizeWaitingOn: a fresh payload is ok, with the count and the items", () => {
  const now = 1790944773 * 1000 + 189 * 1000; // 189 s after generation
  const view = summarizeWaitingOn(LIVE_PAYLOAD, { now, upstreamUrl: "http://x/y.json" });

  assertEquals(view.status, "ok");
  assertEquals(view.error, null);
  assertEquals(view.count, 1);
  assertEquals(view.age_seconds, 189);
  assertEquals(view.upstream_url, "http://x/y.json");
  assertEquals(view.items.map((i) => i.slug), ["coyote"]);
  assertEquals(view.not_waiting.length, 2);
});

Deno.test("summarizeWaitingOn: older than the window is stale", () => {
  const generated = LIVE_PAYLOAD.generated_at_epoch;
  const justInside = summarizeWaitingOn(LIVE_PAYLOAD, {
    now: (generated + DEFAULT_STALE_MINUTES * 60) * 1000,
  });
  assertEquals(justInside.status, "ok", "exactly at the window is not yet stale");

  const justOutside = summarizeWaitingOn(LIVE_PAYLOAD, {
    now: (generated + DEFAULT_STALE_MINUTES * 60 + 1) * 1000,
  });
  assertEquals(justOutside.status, "stale");
  assertEquals(
    justOutside.error,
    null,
    "stale is not an error: the last known list is still shown",
  );
  assertEquals(justOutside.items.length, 1);
});

Deno.test("summarizeWaitingOn: no usable generation time is stale, never fresh", () => {
  const view = summarizeWaitingOn({ items: [item({})], generated_at_epoch: Number.NaN }, {
    now: 1_000_000,
  });
  assertEquals(view.status, "stale");
  assertStringIncludes(String(view.stale_reason), "no usable generation time");
});

Deno.test("summarizeWaitingOn: an empty valid payload is ok with zero items", () => {
  const view = summarizeWaitingOn({ items: [], generated_at_epoch: 100 }, { now: 100_000 });
  assertEquals(view.status, "ok");
  assertEquals(view.count, 0);
});

// ------------------------------------------------------- the transport (stubbed)

const jsonResponse = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: () => Promise.resolve(body),
});

Deno.test("loadWaitingOn: a good fetch summarizes the payload", async () => {
  const view = await loadWaitingOn({
    url: "http://endpoint/waiting-on.json",
    now: 1790944773 * 1000 + 60_000,
    fetchImpl: () => Promise.resolve(jsonResponse(LIVE_PAYLOAD)),
  });

  assertEquals(view.status, "ok");
  assertEquals(view.http_status, 200);
  assertEquals(view.count, 1);
});

Deno.test("loadWaitingOn: a non-200 is an error, not an empty list", async () => {
  const view = await loadWaitingOn({
    url: "http://endpoint/waiting-on.json",
    fetchImpl: () => Promise.resolve(jsonResponse({ error: "nope" }, 500)),
  });

  assertEquals(view.status, "error");
  assertEquals(view.count, 0);
  assertStringIncludes(String(view.error), "HTTP 500");
});

Deno.test("loadWaitingOn: malformed JSON is an error, not an empty list", async () => {
  const view = await loadWaitingOn({
    url: "http://endpoint/waiting-on.json",
    fetchImpl: () =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.reject(new SyntaxError("Unexpected token < in JSON")),
      }),
  });

  assertEquals(view.status, "error");
  assertEquals(view.items, []);
  assertStringIncludes(String(view.error), "malformed JSON");
});

Deno.test("loadWaitingOn: valid JSON of the wrong shape is an error, not an empty list", async () => {
  const view = await loadWaitingOn({
    url: "http://endpoint/waiting-on.json",
    fetchImpl: () => Promise.resolve(jsonResponse({ hello: "world" })),
  });

  assertEquals(view.status, "error");
  assertStringIncludes(String(view.error), "expected shape");
});

Deno.test("loadWaitingOn: an unreachable endpoint is an error naming the failure", async () => {
  const view = await loadWaitingOn({
    url: "http://endpoint/waiting-on.json",
    fetchImpl: () => Promise.reject(new TypeError("error sending request for url")),
  });

  assertEquals(view.status, "error");
  assertStringIncludes(String(view.error), "unreachable");
});

Deno.test("loadWaitingOn: a timeout is named as a timeout", async () => {
  const view = await loadWaitingOn({
    url: "http://endpoint/waiting-on.json",
    timeoutMs: 1234,
    fetchImpl: () => Promise.reject(Object.assign(new Error("aborted"), { name: "TimeoutError" })),
  });

  assertEquals(view.status, "error");
  assertStringIncludes(String(view.error), "timed out after 1234 ms");
});

Deno.test("loadWaitingOn: the fetch is given a bounded signal and asks for JSON", async () => {
  let seen = null;
  await loadWaitingOn({
    url: "http://endpoint/waiting-on.json",
    timeoutMs: DEFAULT_TIMEOUT_MS,
    fetchImpl: (url, options) => {
      seen = { url, options };
      return Promise.resolve(jsonResponse(LIVE_PAYLOAD));
    },
  });

  assertEquals(seen.url, "http://endpoint/waiting-on.json");
  assert(seen.options.signal instanceof AbortSignal, "a timeout signal must be attached");
  assertEquals(seen.options.redirect, "error");
  assertEquals(seen.options.headers.accept, "application/json");
});

Deno.test("errorWaitingOn: the error view has the same keys as a success", () => {
  const view = errorWaitingOn({ error: "boom", upstreamUrl: "http://x/y.json" });
  assertEquals(view.status, "error");
  assertEquals(view.items, []);
  assertEquals(view.count, 0);
  assertEquals(
    Object.keys(view).sort(),
    Object.keys(summarizeWaitingOn({ items: [], generated_at_epoch: 0 })).sort(),
  );
});
