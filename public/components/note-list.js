/**
 * Note List Component
 */
import { css, html, LitElement } from "lit";
import { unsafeHTML } from "https://cdn.jsdelivr.net/npm/lit@3.1.0/directives/unsafe-html.js/+esm";
import { highlightText } from "../utils/text.js";
import { icons } from "../utils/icons.js";

export class NoteList extends LitElement {
  static properties = {
    notes: { type: Array },
    searchQuery: { type: String },
    selectedTags: { type: Array },
    hasMore: { type: Boolean },
    loadingMore: { type: Boolean },
    viewType: { type: String }, // 'grid' or 'list'
    sortField: { type: String }, // 'modified', 'created', 'title'
    sortDirection: { type: String }, // 'asc' or 'desc'
  };

  static styles = css`
    :host {
      display: block;
      height: 100%;
      overflow-y: auto;
      padding: 1.5rem;
    }

    .notes-container {
      max-width: 1200px;
      margin: 0 auto;
    }

    .notes-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.5rem;
    }

    .notes-title {
      font-size: 1.25rem;
      font-weight: 600;
      color: var(--gray-800);
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .view-toggle {
      display: flex;
      gap: 0.25rem;
      background: var(--gray-100);
      padding: 0.25rem;
      border-radius: 0.5rem;
    }

    .view-toggle button {
      padding: 0.5rem;
      min-width: 40px;
      min-height: 40px;
      background: transparent;
      border: none;
      border-radius: 0.375rem;
      cursor: pointer;
      color: var(--gray-600);
      transition: all 0.2s;
      display: flex;
      align-items: center;
      justify-content: center;
      -webkit-tap-highlight-color: transparent;
    }

    .view-toggle button svg {
      width: 16px;
      height: 16px;
    }

    @media (hover: hover) {
      .view-toggle button:hover {
        color: var(--gray-800);
      }
    }

    .view-toggle button.active {
      background: var(--white);
      color: var(--primary);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }

    .sort-controls {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .sort-select {
      padding: 0.375rem 0.5rem;
      min-height: 40px;
      max-width: 100%;
      border: 1px solid var(--gray-300);
      border-radius: 0.375rem;
      background: var(--white);
      font-size: 0.875rem;
      color: var(--gray-700);
      cursor: pointer;
    }

    .sort-select:focus {
      outline: none;
      border-color: var(--primary);
    }

    .sort-direction {
      padding: 0.375rem;
      min-width: 40px;
      min-height: 40px;
      background: var(--gray-100);
      border: none;
      border-radius: 0.375rem;
      cursor: pointer;
      color: var(--gray-600);
      transition: all 0.2s;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      -webkit-tap-highlight-color: transparent;
    }

    @media (hover: hover) {
      .sort-direction:hover {
        background: var(--gray-200);
        color: var(--gray-800);
      }
    }

    .sort-direction svg {
      width: 15px;
      height: 15px;
    }

    /* We only have one chevron icon, so ascending order is just the same
    * icon flipped upside down rather than a second dedicated asset. */
    .sort-direction .flip {
      display: flex;
      transform: rotate(180deg);
    }

    .header-controls {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .notes-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 1.5rem;
    }

    .notes-list {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .notes-list .note-card {
      padding: 0.75rem;
      display: flex;
      align-items: center;
      gap: 1rem;
      min-height: auto;
    }

    .notes-list .note-card:hover {
      transform: none;
    }

    .notes-list .note-main {
      flex: 1;
      min-width: 0;
    }

    .notes-list .note-title {
      font-size: 1rem;
      font-weight: 600;
      margin-bottom: 0.25rem;
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .notes-list .note-content {
      font-size: 0.875rem;
      color: var(--gray-600);
      margin-bottom: 0;
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .notes-list .note-footer {
      margin-bottom: 0;
      flex-direction: column;
      align-items: flex-end;
      gap: 0.25rem;
      flex-shrink: 0;
    }

    .notes-list .note-tags {
      justify-content: flex-end;
    }

    .notes-list .note-date {
      font-size: 0.75rem;
      white-space: nowrap;
    }

    .notes-list .pin-indicator {
      position: static;
      display: inline-flex;
      vertical-align: -3px;
      margin-right: 0.4rem;
    }

    .note-card {
      background: var(--white);
      border: 1px solid var(--gray-200);
      border-radius: 0.75rem;
      padding: 1.25rem;
      cursor: pointer;
      transition: all 0.2s;
      position: relative;
      overflow: hidden;
      /* A pasted URL is one unbreakable "word" - without this it pushes the
        card wider than the phone screen. */
      overflow-wrap: anywhere;
      -webkit-tap-highlight-color: transparent;
    }

    /*
    * Hover-only: on a touch screen the lift "sticks" after a tap because
    * the browser keeps :hover on the last-tapped element, leaving a card
    * raised and outlined until you tap elsewhere.
    */
    @media (hover: hover) {
      .note-card:hover {
        border-color: var(--primary);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        transform: translateY(-2px);
      }
    }

    .note-card:active {
      border-color: var(--primary);
      background: var(--gray-50);
    }

    .note-card.pinned {
      border-color: var(--accent);
      background: linear-gradient(135deg, var(--white) 0%, rgb(var(--accent-rgb) / 0.06) 100%);
    }

    /* Renders the actual pin icon passed in from renderNoteCard() - previously
    * this was a styled but empty element, so pinned notes had no visible mark. */
    .pin-indicator {
      position: absolute;
      top: 0.75rem;
      right: 0.75rem;
      color: var(--accent);
      width: 16px;
      height: 16px;
    }

    .pin-indicator svg {
      width: 100%;
      height: 100%;
    }

    .note-title {
      font-family: var(--font-serif);
      font-size: 1.15rem;
      font-weight: 400;
      color: var(--gray-900);
      margin-bottom: 0.5rem;
      padding-right: 1.25rem;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .untitled {
      color: var(--gray-400);
      font-style: italic;
    }

    .note-content {
      font-size: 0.875rem;
      color: var(--gray-600);
      line-height: 1.5;
      margin-bottom: 1rem;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .note-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.5rem;
    }

    .note-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 0.25rem;
    }

    .tag-badge {
      display: inline-flex;
      align-items: center;
      padding: 0.125rem 0.5rem;
      background: var(--gray-100);
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 500;
    }

    .tag-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      margin-right: 0.25rem;
    }

    .note-date {
      font-size: 0.75rem;
      color: var(--gray-500);
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
      margin-bottom: 1.5rem;
    }

    .load-more {
      display: flex;
      justify-content: center;
      padding: 1.5rem 0;
    }

    .load-more button {
      padding: 0.625rem 1.5rem;
      background: var(--gray-100);
      border: 1px solid var(--gray-300);
      border-radius: 0.5rem;
      cursor: pointer;
      font-size: 0.875rem;
      color: var(--gray-700);
      transition: all 0.2s;
    }

    .load-more button:hover:not(:disabled) {
      background: var(--gray-200);
      border-color: var(--gray-400);
    }

    .load-more button:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    /* Explicit dark ink: the inherited body colour is near-white in dark mode,
      which was invisible on the yellow highlight. */
    .highlight {
      background: #ffe27a;
      color: #1b1f1d;
      padding: 0.125rem 0.25rem;
      border-radius: 0.125rem;
    }

    .load-more button {
      min-height: 44px;
    }

    @media (max-width: 768px) {
      :host {
        padding: 0.75rem;
      }

      /*
      * Single row instead of two stacked ones. The count text shrinks and
      * ellipsises; the controls keep their full tap targets.
      */
      .notes-header {
        gap: 0.5rem;
        margin-bottom: 0.75rem;
      }

      .notes-title {
        font-size: 1rem;
        flex: 1 1 auto;
      }

      .header-controls {
        gap: 0.5rem;
        flex-shrink: 0;
      }

      .sort-controls {
        gap: 0.25rem;
      }

      /* 16px minimum, otherwise iOS Safari zooms the whole page in when the
        select is tapped and never zooms back out. */
      .sort-select {
        font-size: 1rem;
        padding: 0.375rem 0.25rem;
        max-width: 6.5rem;
      }

      .notes-grid {
        grid-template-columns: 1fr;
        gap: 0.75rem;
      }

      .note-card {
        padding: 1rem;
      }

      .note-content {
        margin-bottom: 0.75rem;
      }

      .view-toggle button,
      .sort-direction,
      .sort-select {
        min-width: 44px;
        min-height: 44px;
      }
    }

    @media (pointer: coarse) {
      .view-toggle button,
      .sort-direction {
        min-width: 44px;
        min-height: 44px;
      }

      .sort-select {
        min-height: 44px;
      }
    }
  `;

  constructor() {
    super();
    this.notes = [];
    this.searchQuery = "";
    this.selectedTags = [];
    this.hasMore = false;
    this.loadingMore = false;
    // Load preferences from localStorage
    this.viewType = localStorage.getItem("notes-viewType") || "grid";
    this.sortField = localStorage.getItem("notes-sortField") || "modified";
    this.sortDirection = localStorage.getItem("notes-sortDirection") || "desc";
  }

  toggleView(type) {
    this.viewType = type;
    localStorage.setItem("notes-viewType", type);
    this.requestUpdate();
  }

  handleNoteClick(note) {
    this.dispatchEvent(
      new CustomEvent("note-selected", {
        detail: { note },
        bubbles: true,
        composed: true,
      }),
    );
  }

  formatDate(dateString) {
    if (!dateString) return "";

    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;

    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes} minute${minutes > 1 ? "s" : ""} ago`;
    if (hours < 24) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
    if (days < 7) return `${days} day${days > 1 ? "s" : ""} ago`;

    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
    });
  }

  getFilteredNotes() {
    const filtered = [...this.notes];

    // Sort based on current sort settings
    filtered.sort((a, b) => {
      // Pinned notes always first
      if (a.is_pinned && !b.is_pinned) return -1;
      if (!a.is_pinned && b.is_pinned) return 1;

      let comparison = 0;
      switch (this.sortField) {
        case "title":
          comparison = (a.title || "").localeCompare(b.title || "");
          break;
        case "created":
          comparison = new Date(a.created_at) - new Date(b.created_at);
          break;
        case "modified":
        default:
          comparison = new Date(a.updated_at || a.created_at) -
            new Date(b.updated_at || b.created_at);
          break;
      }

      return this.sortDirection === "asc" ? comparison : -comparison;
    });

    return filtered;
  }

  handleSortFieldChange(e) {
    this.sortField = e.target.value;
    localStorage.setItem("notes-sortField", this.sortField);
  }

  handleLoadMore() {
    this.dispatchEvent(
      new CustomEvent("load-more", {
        bubbles: true,
        composed: true,
      }),
    );
  }

  toggleSortDirection() {
    this.sortDirection = this.sortDirection === "asc" ? "desc" : "asc";
    localStorage.setItem("notes-sortDirection", this.sortDirection);
  }

  renderEmptyState() {
    let message = "No notes found";
    let submessage = "Create your first note to get started";

    if (this.searchQuery) {
      message = "No results found";
      submessage = `No notes match "${this.searchQuery}"`;
    } else if (this.selectedTags?.length > 0) {
      message = "No notes with selected tags";
      submessage = "Try selecting different tags";
    }

    return html`
      <div class="empty-state">
        <div class="empty-icon">${icons.doc}</div>
        <div class="empty-title">${message}</div>
        <div class="empty-message">${submessage}</div>
      </div>
    `;
  }

  /**
   * Notes can be saved without a title, so fall back to a muted stand-in
   * rather than rendering a blank line where the title should be.
   */
  renderTitle(note) {
    if (!note.title || !note.title.trim()) {
      return html`
        <span class="untitled">Untitled</span>
      `;
    }
    return this.searchQuery ? unsafeHTML(highlightText(note.title, this.searchQuery)) : note.title;
  }

  renderNoteCard(note) {
    const isListView = this.viewType === "list";

    if (isListView) {
      return html`
        <div
          class="note-card ${note.is_pinned ? "pinned" : ""}"
          @click="${() => this.handleNoteClick(note)}"
        >
          <div class="note-main">
            <div class="note-title">
              ${note.is_pinned
                ? html`
                  <span class="pin-indicator">${icons.pin}</span>
                `
                : ""} ${this.renderTitle(note)}
            </div>
            <div class="note-content">
              ${this.searchQuery
                ? unsafeHTML(highlightText(note.content, this.searchQuery))
                : note.content}
            </div>
          </div>

          <div class="note-footer">
            ${note.tags && note.tags.length > 0
              ? html`
                <div class="note-tags">
                  ${note.tags.map((tag) =>
                    html`
                      <span class="tag-badge">
                        <span class="tag-dot" style="background-color: ${tag.color}"></span>
                        ${tag.name}
                      </span>
                    `
                  )}
                </div>
              `
              : ""}

            <div class="note-date">
              ${this.formatDate(note.updated_at || note.created_at)}
            </div>
          </div>
        </div>
      `;
    }

    // Grid view (original layout)
    return html`
      <div
        class="note-card ${note.is_pinned ? "pinned" : ""}"
        @click="${() => this.handleNoteClick(note)}"
      >
        ${note.is_pinned
          ? html`
            <div class="pin-indicator">${icons.pin}</div>
          `
          : ""}

        <div class="note-title">
          ${this.renderTitle(note)}
        </div>

        <div class="note-content">
          ${this.searchQuery
            ? unsafeHTML(highlightText(note.content, this.searchQuery))
            : note.content}
        </div>

        <div class="note-footer">
          ${note.tags && note.tags.length > 0
            ? html`
              <div class="note-tags">
                ${note.tags.map((tag) =>
                  html`
                    <span class="tag-badge">
                      <span class="tag-dot" style="background-color: ${tag.color}"></span>
                      ${tag.name}
                    </span>
                  `
                )}
              </div>
            `
            : html`
              <div></div>
            `}

          <div class="note-date">
            ${this.formatDate(note.updated_at || note.created_at)}
          </div>
        </div>
      </div>
    `;
  }

  render() {
    const filteredNotes = this.getFilteredNotes();

    return html`
      <div class="notes-container">
        <div class="notes-header">
          <div class="notes-title">
            ${filteredNotes.length} ${filteredNotes.length === 1
              ? "Note"
              : "Notes"} ${this.searchQuery
              ? html`
                matching "${this.searchQuery}"
              `
              : ""} ${this.selectedTags && this.selectedTags.length > 0
              ? html`
                with ${this.selectedTags.length} tag${this.selectedTags.length > 1 ? "s" : ""}
              `
              : ""}
          </div>

          <div class="header-controls">
            <div class="sort-controls">
              <select
                class="sort-select"
                .value="${this.sortField}"
                @change="${this.handleSortFieldChange}"
                title="Sort by"
              >
                <option value="modified">Modified</option>
                <option value="created">Created</option>
                <option value="title">Title</option>
              </select>
              <button
                class="sort-direction"
                @click="${this.toggleSortDirection}"
                title="${this.sortDirection === "asc" ? "Ascending" : "Descending"}"
              >
                <span class="${this.sortDirection === "asc" ? "flip" : ""}">${icons
                  .chevronDown}</span>
              </button>
            </div>

            <div class="view-toggle">
              <button
                class="${this.viewType === "grid" ? "active" : ""}"
                @click="${() => this.toggleView("grid")}"
                title="Grid view"
              >
                ${icons.grid}
              </button>
              <button
                class="${this.viewType === "list" ? "active" : ""}"
                @click="${() => this.toggleView("list")}"
                title="List view"
              >
                ${icons.list}
              </button>
            </div>
          </div>
        </div>

        ${filteredNotes.length === 0 ? this.renderEmptyState() : html`
          <div class="${this.viewType === "grid" ? "notes-grid" : "notes-list"}">
            ${filteredNotes.map((note) => this.renderNoteCard(note))}
          </div>
          ${this.hasMore
            ? html`
              <div class="load-more">
                <button
                  @click="${this.handleLoadMore}"
                  ?disabled="${this.loadingMore}"
                >
                  ${this.loadingMore ? "Loading..." : "Load more"}
                </button>
              </div>
            `
            : ""}
        `}
      </div>
    `;
  }
}

customElements.define("note-list", NoteList);
