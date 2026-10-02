/**
 * The wording of the "Waiting on" page, kept out of the template so it stays
 * testable. The three states must read differently:
 *   - fresh, with items ("1 title waiting") or without ("Nothing waiting on
 *     right now");
 *   - stale (the last known list, said so plainly);
 *   - error (never "nothing waiting" - the feed could not be read).
 */

import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.208.0/assert/mod.ts";

import {
  episodeLabel,
  formatWaitingAge,
  stateChipLabel,
  typeLabel,
  waitingOnFreshness,
  waitingOnHeadline,
  waitingOnNotice,
  waitingOnReason,
} from "../../public/utils/waiting-on.js";

// ------------------------------------------------------------------- age

Deno.test("formatWaitingAge: reads in the largest useful unit", () => {
  assertEquals(formatWaitingAge(0), "less than a minute");
  assertEquals(formatWaitingAge(59), "less than a minute");
  assertEquals(formatWaitingAge(60), "1 minute");
  assertEquals(formatWaitingAge(189), "3 minutes");
  assertEquals(formatWaitingAge(3600), "1 hour");
  assertEquals(formatWaitingAge(7200), "2 hours");
  assertEquals(formatWaitingAge(3 * 86400), "3 days");
});

Deno.test("formatWaitingAge: an unknown age is said, not shown as zero", () => {
  assertEquals(formatWaitingAge(null), "an unknown time");
  assertEquals(formatWaitingAge(undefined), "an unknown time");
  assertEquals(formatWaitingAge(-5), "an unknown time");
  assertEquals(formatWaitingAge(Number.NaN), "an unknown time");
});

// --------------------------------------------------------------- labels

Deno.test("stateChipLabel: known states are words, unknown states are de-underscored", () => {
  assertEquals(stateChipLabel("AWAITING_RELEASE"), "Awaiting release");
  assertEquals(stateChipLabel("DOWNLOADING"), "Downloading");
  assertEquals(stateChipLabel("BRAND_NEW_STATE"), "Brand new state");
  assertEquals(stateChipLabel(""), "");
});

Deno.test("typeLabel and episodeLabel: only shown when there is something to show", () => {
  assertEquals(typeLabel("movie"), "Movie");
  assertEquals(typeLabel("show"), "Show");
  assertEquals(typeLabel(null), "");
  assertEquals(episodeLabel({ season: 4, episode: 10 }), "S04E10");
  assertEquals(episodeLabel({ season: null, episode: 3 }), "S??E03");
  assertEquals(episodeLabel({ season: 2, episode: null }), "S02E??");
  assertEquals(episodeLabel({}), "");
});

// --------------------------------------------------------------- headline

Deno.test("waitingOnHeadline: fresh list, empty list and unreadable feed all differ", () => {
  assertEquals(waitingOnHeadline({ status: "ok", items: [{}, {}] }), "2 titles waiting");
  assertEquals(waitingOnHeadline({ status: "ok", items: [{}] }), "1 title waiting");
  assertEquals(waitingOnHeadline({ status: "ok", items: [] }), "Nothing waiting on right now");
  assertEquals(waitingOnHeadline({ status: "error", items: [] }), "Can't reach media-watch");
  assertEquals(waitingOnHeadline(null), "Waiting on");
});

Deno.test("waitingOnHeadline: an empty STALE list is not claimed to be current", () => {
  assertEquals(
    waitingOnHeadline({ status: "stale", items: [] }),
    "Nothing waiting in the last known list",
  );
});

// ----------------------------------------------------------------- notice

Deno.test("waitingOnNotice: fresh data has no banner", () => {
  assertEquals(waitingOnNotice({ status: "ok", items: [{}] }), null);
  assertEquals(waitingOnNotice(null), null);
});

Deno.test("waitingOnNotice: stale data warns, naming how old it is", () => {
  const notice = waitingOnNotice({
    status: "stale",
    generated_at: "2026-10-02T12:39:33Z",
    age_seconds: 3 * 3600,
    items: [{}],
  });
  assertEquals(notice.kind, "warning");
  assertStringIncludes(notice.text, "Stale data");
  assertStringIncludes(notice.text, "3 hours");
  assertStringIncludes(notice.text, "not live");
});

Deno.test("waitingOnNotice: stale with no generation time still warns", () => {
  const notice = waitingOnNotice({
    status: "stale",
    generated_at: null,
    age_seconds: null,
    items: [],
  });
  assertEquals(notice.kind, "warning");
  assertStringIncludes(notice.text, "no usable generation time");
});

Deno.test("waitingOnNotice: an error says it is not an empty list", () => {
  const notice = waitingOnNotice({ status: "error", error: "endpoint unreachable", items: [] });
  assertEquals(notice.kind, "error");
  assertStringIncludes(notice.text, "endpoint unreachable");
  assertStringIncludes(notice.text, "not an empty list");
});

// -------------------------------------------------------------- freshness

Deno.test("waitingOnFreshness: the age of the feed, or nothing when unreadable", () => {
  assertEquals(
    waitingOnFreshness({ status: "ok", generated_at: "2026-10-02T12:39:33Z", age_seconds: 120 }),
    "Updated 2 minutes ago",
  );
  assertEquals(waitingOnFreshness({ status: "error", error: "x" }), "");
  assertEquals(waitingOnFreshness(null), "");
});

// ---------------------------------------------------------------- reason

Deno.test("waitingOnReason: label and detail, without saying one twice", () => {
  assertEquals(
    waitingOnReason({ state_label: "Waiting for a release", detail: "no qualifying release yet" }),
    "Waiting for a release — no qualifying release yet",
  );
  // The detail already inside the label is not repeated.
  assertEquals(
    waitingOnReason({ state_label: "Downloading (72%)", detail: "downloading" }),
    "Downloading (72%)",
  );
  assertEquals(waitingOnReason({ state_label: "", detail: "just the detail" }), "just the detail");
  assertEquals(waitingOnReason({ state: "DOWNLOADING" }), "Downloading");
});
