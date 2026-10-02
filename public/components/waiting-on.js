/**
 * The "Waiting on" page: what the media-watch pipeline is currently waiting
 * for, read from the server-side projection at /api/waiting-on.
 *
 * Presentational only - notes-app.js owns the fetch and hands this component
 * `data`, `loading` and `error`. See public/utils/waiting-on.js for the wording
 * and server/waiting-on.js for the shape and the staleness rule.
 *
 * The three states the page must keep distinct, and does:
 *   - fresh (items, or "Nothing waiting on right now" when the list is empty);
 *   - stale (items are shown, but behind a warning that they are not live);
 *   - error (the feed could not be read - never rendered as an empty list).
 */

import { css, html, LitElement } from "lit";
import { icons } from "../utils/icons.js";
import {
  episodeLabel,
  formatWaitingAge,
  stateChipLabel,
  typeLabel,
  waitingOnFreshness,
  waitingOnHeadline,
  waitingOnNotice,
  waitingOnReason,
} from "../utils/waiting-on.js";

class WaitingOn extends LitElement {
  static properties = {
    data: { type: Object },
    loading: { type: Boolean },
    error: { type: String },
  };

  static styles = css`
    :host {
      display: block;
      height: 100%;
      overflow-y: auto;
      padding: 1.25rem;
      background: var(--gray-50);
    }

    .page {
      max-width: 46rem;
      margin: 0 auto;
    }

    .page-header {
      display: flex;
      align-items: flex-start;
      gap: 1rem;
      margin-bottom: 1rem;
    }

    .page-title {
      font-family: var(--font-serif);
      font-size: 1.4rem;
      font-weight: 600;
      color: var(--gray-900);
    }

    .page-sub {
      margin-top: 0.15rem;
      font-size: 0.9rem;
      color: var(--gray-600);
    }

    .refresh {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      margin-left: auto;
      min-height: 44px;
      padding: 0.5rem 0.9rem;
      border: 1px solid var(--gray-300);
      border-radius: var(--radius-lg);
      background: var(--white);
      color: var(--gray-700);
      font-size: 0.85rem;
      font-weight: 500;
      cursor: pointer;
      flex-shrink: 0;
    }

    .refresh svg {
      width: 16px;
      height: 16px;
    }

    .refresh:hover:not(:disabled) {
      background: var(--gray-100);
      color: var(--gray-900);
    }

    .refresh:disabled {
      opacity: 0.55;
      cursor: default;
    }

    .notice {
      display: flex;
      gap: 0.6rem;
      align-items: flex-start;
      padding: 0.75rem 0.9rem;
      border-radius: var(--radius-lg);
      margin-bottom: 1rem;
      font-size: 0.9rem;
      line-height: 1.45;
    }

    .notice.warning {
      background: #fdf3e3;
      border: 1px solid var(--warning);
      color: #6d4413;
    }

    .notice.error {
      background: #fbeae7;
      border: 1px solid var(--error);
      color: #7a2b1d;
    }

    .notice strong {
      display: block;
      font-weight: 600;
    }

    .list {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .item {
      background: var(--white);
      border: 1px solid var(--gray-200);
      border-left: 4px solid var(--primary);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-sm);
      padding: 0.9rem 1rem;
    }

    .item-head {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.5rem;
    }

    .item-title {
      font-size: 1.05rem;
      font-weight: 600;
      color: var(--gray-900);
    }

    .chip {
      font-family: var(--font-mono);
      font-size: 0.68rem;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      padding: 0.1rem 0.45rem;
      border-radius: var(--radius-full);
      background: var(--gray-100);
      color: var(--gray-700);
    }

    .chip.state {
      background: var(--primary-light);
      color: var(--primary-dark);
    }

    .chip.episode {
      background: var(--white);
      border: 1px solid var(--gray-300);
      color: var(--gray-600);
    }

    .item-reason {
      margin-top: 0.45rem;
      font-size: 0.95rem;
      color: var(--gray-800);
    }

    .item-age {
      margin-top: 0.3rem;
      font-size: 0.85rem;
      color: var(--gray-500);
    }

    .item-release {
      margin-top: 0.3rem;
      font-size: 0.85rem;
      color: var(--gray-600);
      overflow-wrap: anywhere;
    }

    .foot {
      margin-top: 1.5rem;
      padding-top: 0.9rem;
      border-top: 1px solid var(--gray-200);
      font-size: 0.85rem;
      color: var(--gray-500);
    }

    .foot h2 {
      font-family: var(--font-mono);
      font-size: 0.68rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--gray-500);
      margin-bottom: 0.5rem;
    }

    .foot ul {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
    }

    .empty-state {
      text-align: center;
      padding: 3rem 1.5rem;
    }

    .empty-icon {
      width: 44px;
      height: 44px;
      margin: 0 auto 1rem;
      color: var(--gray-400);
    }

    .empty-title {
      font-size: 1.25rem;
      font-weight: 600;
      color: var(--gray-700);
      margin-bottom: 0.5rem;
    }

    .empty-message {
      color: var(--gray-500);
    }

    @media (max-width: 768px) {
      :host {
        padding: 0.75rem;
      }

      .page-title {
        font-size: 1.2rem;
      }

      .refresh {
        padding: 0.5rem 0.7rem;
      }
    }
  `;

  constructor() {
    super();
    this.data = null;
    this.loading = false;
    this.error = null;
  }

  /** Ask the parent (notes-app) to re-fetch; it owns the fetch. */
  requestRefresh() {
    this.dispatchEvent(new CustomEvent("waiting-refresh", { bubbles: true, composed: true }));
  }

  render() {
    return html`
      <div class="page">
        <div class="page-header">
          <div>
            <div class="page-title">Waiting on</div>
            <div class="page-sub">${this._subtitle()}</div>
          </div>
          <button
            class="refresh"
            @click="${this.requestRefresh}"
            ?disabled="${this.loading}"
            title="Re-read the media-watch feed"
          >
            ${icons.clock} ${this.loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        ${this._renderNotice()} ${this._renderBody()} ${this._renderFoot()}
      </div>
    `;
  }

  /** Headline plus freshness, e.g. "1 title waiting · Updated 3 minutes ago". */
  _subtitle() {
    if (this.loading && !this.data) return "Reading the media-watch feed…";
    const headline = waitingOnHeadline(this.data);
    const freshness = waitingOnFreshness(this.data);
    return freshness ? `${headline} · ${freshness}` : headline;
  }

  _renderNotice() {
    if (this.error) {
      return html`
        <div class="notice error" role="alert">
          <div>
            <strong>Can't reach media-watch</strong>
            ${this.error} — this is not an empty list.
          </div>
        </div>
      `;
    }

    const notice = waitingOnNotice(this.data);
    if (!notice) return "";
    return html`
      <div class="notice ${notice.kind}" role="alert">
        <div>${notice.text}</div>
      </div>
    `;
  }

  _renderBody() {
    // A thrown request (401 handled by the client, otherwise a transport error)
    // is the hard error; the fresh/stale/empty render comes from `data`.
    if (!this.error && this.data && Array.isArray(this.data.items) && this.data.items.length > 0) {
      return html`<ul class="list">${this.data.items.map((item) => this._renderItem(item))}</ul>`;
    }

    const title = this.error ? "Can't reach media-watch" : waitingOnHeadline(this.data);
    const message = this._emptyMessage();
    return html`
      <div class="empty-state">
        <div class="empty-icon">${icons.clock}</div>
        <div class="empty-title">${title}</div>
        <div class="empty-message">${message}</div>
      </div>
    `;
  }

  _emptyMessage() {
    if (this.error) {
      return "The feed could not be read. Nothing is shown rather than a list we cannot vouch for.";
    }
    if (!this.data) return "Reading the media-watch feed…";
    if (this.data.status === "error") {
      return "The feed could not be read. Nothing is shown rather than a list we cannot vouch for.";
    }
    if (this.data.status === "stale") {
      return "No items in the last known list, and that list is stale.";
    }
    return "The pipeline is not tracking anything that is waiting right now.";
  }

  _renderItem(item) {
    const episode = episodeLabel(item);
    const release = item.release && typeof item.release === "object" ? item.release : null;

    return html`
      <li class="item">
        <div class="item-head">
          <span class="item-title">${item.title || item.slug}</span>
          ${typeLabel(item.type) ? html`<span class="chip">${typeLabel(item.type)}</span>` : ""}
          ${episode ? html`<span class="chip episode">${episode}</span>` : ""}
          <span class="chip state">${stateChipLabel(String(item.state ?? ""))}</span>
        </div>
        <div class="item-reason">${waitingOnReason(item)}</div>
        <div class="item-age">
          Waiting ${formatWaitingAge(
            typeof item.age_seconds === "number" ? item.age_seconds : null,
          )}
        </div>
        ${release && release.name
          ? html`<div class="item-release">Release: ${release.name}</div>`
          : ""}
      </li>
    `;
  }

  _renderFoot() {
    const notWaiting = this.data && Array.isArray(this.data.not_waiting)
      ? this.data.not_waiting
      : [];
    const warnings = this.data && Array.isArray(this.data.warnings) ? this.data.warnings : [];
    if (notWaiting.length === 0 && warnings.length === 0) return "";

    return html`
      <div class="foot">
        ${warnings.length > 0
          ? html`
            <h2>Feed warnings</h2>
            <ul>${warnings.map((warning) => html`<li>${warning}</li>`)}</ul>
          `
          : ""}
        ${notWaiting.length > 0
          ? html`
            <h2>Not waiting (${notWaiting.length})</h2>
            <ul>
              ${notWaiting.map(
                (entry) =>
                  html`<li>${entry.slug || "?"} — ${entry.reason || "no reason given"}</li>`,
              )}
            </ul>
          `
          : ""}
      </div>
    `;
  }
}

customElements.define("waiting-on", WaitingOn);
