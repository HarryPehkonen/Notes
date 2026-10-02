/**
 * media-watch "waiting on" projection: the read-only feed the Notes app shows.
 *
 * The Notes page cannot fetch the endpoint from the browser (a private http
 * URL would be mixed-content blocked), so the server fetches it here and hands
 * the client a normalized view. This module holds everything worth testing and
 * no Oak at all:
 *
 *   - the endpoint URL, timeout and staleness window (configuration, never
 *     hardcoded in a component);
 *   - `summarizeWaitingOn` - a pure function that turns the upstream envelope
 *     into the view the page renders, including the ok/stale decision;
 *   - `loadWaitingOn` - the fetch plus that summary, with the transport
 *     injected so it can be exercised with no network.
 *
 * Failure is a first-class state, not an empty list: unreachable, non-200,
 * malformed JSON and an unexpected shape each become `status: "error"` with a
 * message. An empty `items` array is only ever "nothing waiting on right now"
 * when the upstream payload was valid, so a broken feed can never masquerade
 * as an empty one.
 */

/** The systemd --user service on host hermes, bound to the WireGuard address. */
export const DEFAULT_WAITING_ON_URL = "http://10.99.0.6:8787/waiting-on.json";

/** Hard cap on the server-side fetch; the page must not hang on a dead feed. */
export const DEFAULT_TIMEOUT_MS = 2500;

/**
 * The upstream file is rewritten every 30 min by the media-watch cron. More
 * than three missed cycles means we must say so rather than pass it off as live.
 */
export const DEFAULT_STALE_MINUTES = 90;

/**
 * The pipeline states, in the order they are shown: waiting for a release,
 * waiting for an episode, then work already in flight.
 */
export const WAITING_STATE_ORDER = [
  "AWAITING_RELEASE",
  "AWAITING_EPISODE",
  "AWAITING_GRAB",
  "DOWNLOADING",
  "AWAITING_POST",
];

/**
 * @typedef {Object} WaitingOnItem
 * @property {string} slug
 * @property {string} title
 * @property {"show"|"movie"} type
 * @property {string} state
 * @property {string} state_label
 * @property {string} detail
 * @property {string|null} since
 * @property {number|null} age_seconds
 */

/**
 * Is this the envelope the contract describes?
 *
 * Deliberately strict: valid JSON of the wrong shape (a proxy's error object,
 * a bare array, a DB dump) must read as malformed, not as "no items". The two
 * load-bearing fields are `items` (the list) and a freshness marker.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isWaitingOnPayload(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const payload = /** @type {Record<string, unknown>} */ (value);
  if (!Array.isArray(payload.items)) return false;
  return hasFreshnessMarker(payload);
}

/**
 * The freshness marker, either as the epoch seconds or the ISO string.
 * @param {Record<string, unknown>} payload
 * @returns {boolean}
 */
function hasFreshnessMarker(payload) {
  if (
    typeof payload.generated_at_epoch === "number" && Number.isFinite(payload.generated_at_epoch)
  ) {
    return true;
  }
  return typeof payload.generated_at === "string" &&
    !Number.isNaN(Date.parse(payload.generated_at));
}

/**
 * The generation time in epoch seconds, or null when it cannot be read.
 * @param {Record<string, unknown>} payload
 * @returns {number|null}
 */
export function payloadEpochSeconds(payload) {
  if (
    typeof payload.generated_at_epoch === "number" && Number.isFinite(payload.generated_at_epoch)
  ) {
    return Math.floor(payload.generated_at_epoch);
  }
  if (typeof payload.generated_at === "string") {
    const parsed = Date.parse(payload.generated_at);
    if (!Number.isNaN(parsed)) return Math.floor(parsed / 1000);
  }
  return null;
}

/**
 * Order items by state (the pipeline order above, unknown states last), then
 * longest-waiting first, then title so the order is total and stable.
 * @param {WaitingOnItem[]} items
 * @returns {WaitingOnItem[]}
 */
export function sortWaitingItems(items) {
  const rank = (state) => {
    const index = WAITING_STATE_ORDER.indexOf(state);
    return index === -1 ? WAITING_STATE_ORDER.length : index;
  };
  const age = (item) => (typeof item.age_seconds === "number" ? item.age_seconds : -1);

  return [...items].sort((a, b) => {
    const byState = rank(a.state) - rank(b.state);
    if (byState !== 0) return byState;
    const byAge = age(b) - age(a);
    if (byAge !== 0) return byAge;
    return String(a.title || a.slug).localeCompare(String(b.title || b.slug));
  });
}

/**
 * The view the page renders, plus the freshness verdict. Never throws.
 *
 * @param {Record<string, unknown>} payload - a validated upstream envelope
 * @param {{ now?: number, staleMinutes?: number, upstreamUrl?: string, httpStatus?: number|null }} [options]
 * @returns {Record<string, unknown>}
 */
export function summarizeWaitingOn(payload, options = {}) {
  const now = options.now ?? Date.now();
  const staleMinutes = options.staleMinutes ?? DEFAULT_STALE_MINUTES;
  const generatedEpoch = payloadEpochSeconds(payload);
  const ageSeconds = generatedEpoch === null
    ? null
    : Math.max(0, Math.floor(now / 1000) - generatedEpoch);

  // An unknown age is not the same as fresh: without the marker we cannot claim
  // the data is current, so it is reported as stale with that reason.
  const stale = ageSeconds === null || ageSeconds > staleMinutes * 60;

  const items = Array.isArray(payload.items) ? /** @type {WaitingOnItem[]} */ (payload.items) : [];

  return {
    status: stale ? "stale" : "ok",
    error: null,
    stale_reason: ageSeconds === null ? "the feed carries no usable generation time" : null,
    stale_after_seconds: staleMinutes * 60,
    generated_at: typeof payload.generated_at === "string" ? payload.generated_at : null,
    generated_at_epoch: generatedEpoch,
    age_seconds: ageSeconds,
    fetched_at: new Date(now).toISOString(),
    upstream_url: options.upstreamUrl ?? DEFAULT_WAITING_ON_URL,
    http_status: options.httpStatus ?? null,
    count: items.length,
    counts_by_state: payload.counts_by_state ?? {},
    items: sortWaitingItems(items),
    not_waiting: Array.isArray(payload.not_waiting) ? payload.not_waiting : [],
    warnings: Array.isArray(payload.warnings) ? payload.warnings : [],
  };
}

/**
 * The error view: same shape as a success, so the client has one thing to
 * render and cannot mistake a failure for an empty list.
 * @param {{ upstreamUrl?: string, error: string, httpStatus?: number|null, staleMinutes?: number, now?: number }} options
 * @returns {Record<string, unknown>}
 */
export function errorWaitingOn({ upstreamUrl, error, httpStatus = null, staleMinutes, now }) {
  return {
    status: "error",
    error,
    stale_reason: null,
    stale_after_seconds: (staleMinutes ?? DEFAULT_STALE_MINUTES) * 60,
    generated_at: null,
    generated_at_epoch: null,
    age_seconds: null,
    fetched_at: new Date(now ?? Date.now()).toISOString(),
    upstream_url: upstreamUrl ?? DEFAULT_WAITING_ON_URL,
    http_status: httpStatus,
    count: 0,
    counts_by_state: {},
    items: [],
    not_waiting: [],
    warnings: [],
  };
}

/**
 * Fetch the projection and summarize it. Network and transport failures are
 * returned as an error view, never thrown: the route always answers, and the
 * page always has something honest to show.
 *
 * @param {Object} [options]
 * @param {string} [options.url]
 * @param {number} [options.timeoutMs]
 * @param {number} [options.staleMinutes]
 * @param {typeof fetch} [options.fetchImpl]
 * @param {number} [options.now]
 * @returns {Promise<Record<string, unknown>>}
 */
export async function loadWaitingOn(options = {}) {
  const url = options.url ?? DEFAULT_WAITING_ON_URL;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const staleMinutes = options.staleMinutes ?? DEFAULT_STALE_MINUTES;
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now();

  let response;
  try {
    response = await fetchImpl(url, {
      headers: { accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    return errorWaitingOn({
      upstreamUrl: url,
      staleMinutes,
      now,
      error: `media-watch endpoint unreachable: ${describeFetchError(error, timeoutMs)}`,
    });
  }

  if (!response.ok) {
    return errorWaitingOn({
      upstreamUrl: url,
      staleMinutes,
      now,
      httpStatus: response.status,
      error: `media-watch endpoint returned HTTP ${response.status}`,
    });
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    return errorWaitingOn({
      upstreamUrl: url,
      staleMinutes,
      now,
      httpStatus: response.status,
      error: "media-watch endpoint returned malformed JSON",
    });
  }

  if (!isWaitingOnPayload(payload)) {
    return errorWaitingOn({
      upstreamUrl: url,
      staleMinutes,
      now,
      httpStatus: response.status,
      error: "media-watch payload did not match the expected shape",
    });
  }

  return summarizeWaitingOn(payload, {
    now,
    staleMinutes,
    upstreamUrl: url,
    httpStatus: response.status,
  });
}

/**
 * A short, non-leaky description of a fetch failure (a timeout is the case
 * worth naming; anything else reports its name/message).
 * @param {unknown} error
 * @param {number} timeoutMs
 * @returns {string}
 */
function describeFetchError(error, timeoutMs) {
  const err = /** @type {{ name?: string, message?: string }} */ (error ?? {});
  if (err.name === "TimeoutError" || err.name === "AbortError") {
    return `timed out after ${timeoutMs} ms`;
  }
  return err.message ? `${err.name ?? "error"}: ${err.message}` : String(error);
}
