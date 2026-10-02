/**
 * Pure presentation helpers for the media-watch "waiting on" page.
 *
 * The server (server/waiting-on.js) owns the data shape, the sort order and the
 * ok/stale/error verdict; these helpers only turn that view into English, so
 * the component stays a template and the wording stays under test.
 */

/** Short, human labels for the pipeline states (badges on each row). */
const STATE_LABELS = {
  AWAITING_RELEASE: "Awaiting release",
  AWAITING_EPISODE: "Awaiting episode",
  AWAITING_GRAB: "Awaiting grab",
  DOWNLOADING: "Downloading",
  AWAITING_POST: "Awaiting post",
};

/**
 * @typedef {Object} WaitingOnView
 * @property {"ok"|"stale"|"error"} status
 * @property {string|null} error
 * @property {string|null} generated_at
 * @property {number|null} age_seconds
 * @property {number} count
 * @property {Array<Record<string, unknown>>} items
 * @property {Array<{slug?: string, reason?: string}>} not_waiting
 * @property {string[]} warnings
 */

/**
 * A short badge label for a state; unknown states are de-underscored rather
 * than shown raw.
 * @param {string} state
 * @returns {string}
 */
export function stateChipLabel(state) {
  if (STATE_LABELS[state]) return STATE_LABELS[state];
  return String(state ?? "").replaceAll("_", " ").toLowerCase().replace(
    /^\w/,
    (c) => c.toUpperCase(),
  );
}

/**
 * How long something has been waiting, in words. null (unknown) is said out
 * loud rather than rendered as "0 seconds".
 * @param {number|null|undefined} seconds
 * @returns {string}
 */
export function formatWaitingAge(seconds) {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0) {
    return "an unknown time";
  }
  if (seconds < 60) return "less than a minute";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"}`;
}

/**
 * The page headline: what is (or is not) waiting, or that the feed is unreadable.
 * @param {WaitingOnView|null|undefined} data
 * @returns {string}
 */
export function waitingOnHeadline(data) {
  if (!data) return "Waiting on";
  if (data.status === "error") return "Can't reach media-watch";
  const count = Array.isArray(data.items) ? data.items.length : 0;
  if (count === 0) {
    // An empty list from a stale feed is the last known list, not live state.
    return data.status === "stale"
      ? "Nothing waiting in the last known list"
      : "Nothing waiting on right now";
  }
  return count === 1 ? "1 title waiting" : `${count} titles waiting`;
}

/**
 * The banner shown above the list: a stale warning or a hard error. Fresh and
 * empty both yield null.
 * @param {WaitingOnView|null|undefined} data
 * @returns {{ kind: "warning"|"error", text: string } | null}
 */
export function waitingOnNotice(data) {
  if (!data) return null;

  if (data.status === "error") {
    return {
      kind: "error",
      text: `The media-watch feed could not be read (${
        data.error || "unknown error"
      }). This is not an empty list.`,
    };
  }

  if (data.status === "stale") {
    const reason = data.generated_at
      ? `last generated ${formatWaitingAge(data.age_seconds)} ago`
      : "the feed carries no usable generation time";
    return {
      kind: "warning",
      text: `Stale data: ${reason}. Showing the last known list, not live state.`,
    };
  }

  return null;
}

/**
 * A one-line summary of the feed's freshness, for the page header.
 * @param {WaitingOnView|null|undefined} data
 * @returns {string}
 */
export function waitingOnFreshness(data) {
  if (!data || data.status === "error") return "";
  if (data.generated_at && typeof data.age_seconds === "number") {
    return `Updated ${formatWaitingAge(data.age_seconds)} ago`;
  }
  return "Update time unknown";
}

/**
 * A row's waiting-on text: the state label plus its detail, without repeating
 * one inside the other.
 * @param {Record<string, unknown>} item
 * @returns {string}
 */
export function waitingOnReason(item) {
  const label = typeof item.state_label === "string" ? item.state_label.trim() : "";
  const detail = typeof item.detail === "string" ? item.detail.trim() : "";
  if (label && detail && !label.toLowerCase().includes(detail.toLowerCase())) {
    return `${label} — ${detail}`;
  }
  return label || detail || stateChipLabel(String(item.state ?? ""));
}

/**
 * Type shown next to a title: "Show"/"Movie" (anything else passes through
 * capitalized).
 * @param {unknown} type
 * @returns {string}
 */
export function typeLabel(type) {
  const text = String(type ?? "").trim();
  if (!text) return "";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * "S04E10" for a show episode, or "" when there is none.
 * @param {Record<string, unknown>} item
 * @returns {string}
 */
export function episodeLabel(item) {
  const season = typeof item.season === "number" ? item.season : null;
  const episode = typeof item.episode === "number" ? item.episode : null;
  if (season === null && episode === null) return "";
  const s = season === null ? "??" : String(season).padStart(2, "0");
  const e = episode === null ? "??" : String(episode).padStart(2, "0");
  return `S${s}E${e}`;
}
