/**
 * Note List Component
 */
import { css, html, LitElement } from "lit";

export class NoteList extends LitElement {
  static properties = {
    notes: { type: Array },
    searchQuery: { type: String },
    selectedTags: { type: Array },
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
      background: transparent;
      border: none;
      border-radius: 0.375rem;
      cursor: pointer;
      color: var(--gray-600);
      transition: all 0.2s;
    }

    .view-toggle button:hover {
      color: var(--gray-800);
    }

    .view-toggle button.active {
      background: white;
      color: var(--primary);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }

    .sort-controls {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .sort-select {
      padding: 0.375rem 0.75rem;
      border: 1px solid var(--gray-300);
      border-radius: 0.375rem;
      background: white;
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
      background: var(--gray-100);
      border: none;
      border-radius: 0.375rem;
      cursor: pointer;
      color: var(--gray-600);
      transition: all 0.2s;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .sort-direction:hover {
      background: var(--gray-200);
      color: var(--gray-800);
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
      margin-right: 0.5rem;
      font-size: 1rem;
    }

    .note-card {
      background: white;
      border: 1px solid var(--gray-200);
      border-radius: 0.75rem;
      padding: 1.25rem;
      cursor: pointer;
      transition: all 0.2s;
      position: relative;
      overflow: hidden;
    }

    .note-card:hover {
      border-color: var(--primary);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
      transform: translateY(-2px);
    }

    .note-card.pinned {
      border-color: var(--primary-light);
      background: linear-gradient(135deg, var(--white) 0%, rgba(102, 126, 234, 0.05) 100%);
    }

    .pin-indicator {
      position: absolute;
      top: 0.75rem;
      right: 0.75rem;
      color: var(--primary);
      font-size: 1.125rem;
    }

    .note-title {
      font-size: 1.125rem;
      font-weight: 600;
      color: var(--gray-900);
      margin-bottom: 0.5rem;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
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
      font-size: 3rem;
      margin-bottom: 1rem;
      opacity: 0.5;
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

    .highlight {
      background: yellow;
      padding: 0.125rem 0.25rem;
      border-radius: 0.125rem;
    }

    @media (max-width: 768px) {
      :host {
        padding: 1rem;
      }

      .notes-header {
        flex-direction: column;
        align-items: flex-start;
        gap: 0.75rem;
      }

      .header-controls {
        width: 100%;
        justify-content: space-between;
      }

      .sort-select {
        flex: 1;
        min-width: 0;
      }

      .notes-grid {
        grid-template-columns: 1fr;
        gap: 1rem;
      }

      .note-card {
        padding: 1rem;
      }
    }
  `;

  constructor() {
    super();
    this.notes = [];
    this.searchQuery = "";
    this.selectedTags = [];
    this.viewType = "grid";
    this.sortField = "modified";
    this.sortDirection = "desc";
  }

  toggleView(type) {
    this.viewType = type;
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

  highlightText(text, query) {
    if (!query || !text) return text;

    const regex = new RegExp(`(${query})`, "gi");
    return text.replace(regex, '<span class="highlight">$1</span>');
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
    let filtered = [...this.notes];

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
          comparison = new Date(a.updated_at || a.created_at) - new Date(b.updated_at || b.created_at);
          break;
      }

      return this.sortDirection === "asc" ? comparison : -comparison;
    });

    return filtered;
  }

  handleSortFieldChange(e) {
    this.sortField = e.target.value;
  }

  toggleSortDirection() {
    this.sortDirection = this.sortDirection === "asc" ? "desc" : "asc";
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
        <div class="empty-icon">※</div>
        <div class="empty-title">${message}</div>
        <div class="empty-message">${submessage}</div>
      </div>
    `;
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
              ${note.is_pinned ? "  " : ""}${this.searchQuery
                ? html`
                  <span .innerHTML="${this.highlightText(note.title, this.searchQuery)}"></span>
                `
                : note.title}
            </div>
            <div class="note-content">
              ${this.searchQuery
                ? html`
                  <span .innerHTML="${this.highlightText(note.content, this.searchQuery)}"></span>
                `
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
            <div class="pin-indicator"></div>
          `
          : ""}

        <div class="note-title">
          ${this.searchQuery
            ? html`
              <span .innerHTML="${this.highlightText(note.title, this.searchQuery)}"></span>
            `
            : note.title}
        </div>

        <div class="note-content">
          ${this.searchQuery
            ? html`
              <span .innerHTML="${this.highlightText(note.content, this.searchQuery)}"></span>
            `
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
                ${this.sortDirection === "asc"
                  ? html`<svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                      <path fill-rule="evenodd" d="M8 15a.5.5 0 0 0 .5-.5V2.707l3.146 3.147a.5.5 0 0 0 .708-.708l-4-4a.5.5 0 0 0-.708 0l-4 4a.5.5 0 1 0 .708.708L7.5 2.707V14.5a.5.5 0 0 0 .5.5z"/>
                    </svg>`
                  : html`<svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                      <path fill-rule="evenodd" d="M8 1a.5.5 0 0 1 .5.5v11.793l3.146-3.147a.5.5 0 0 1 .708.708l-4 4a.5.5 0 0 1-.708 0l-4-4a.5.5 0 0 1 .708-.708L7.5 13.293V1.5A.5.5 0 0 1 8 1z"/>
                    </svg>`
                }
              </button>
            </div>

            <div class="view-toggle">
              <button
                class="${this.viewType === "grid" ? "active" : ""}"
                @click="${() => this.toggleView("grid")}"
                title="Grid view"
              >
                <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                  <path
                    d="M1 2.5A1.5 1.5 0 0 1 2.5 1h3A1.5 1.5 0 0 1 7 2.5v3A1.5 1.5 0 0 1 5.5 7h-3A1.5 1.5 0 0 1 1 5.5v-3zM2.5 2a.5.5 0 0 0-.5.5v3a.5.5 0 0 0 .5.5h3a.5.5 0 0 0 .5-.5v-3a.5.5 0 0 0-.5-.5h-3zm6.5.5A1.5 1.5 0 0 1 10.5 1h3A1.5 1.5 0 0 1 15 2.5v3A1.5 1.5 0 0 1 13.5 7h-3A1.5 1.5 0 0 1 9 5.5v-3zm1.5-.5a.5.5 0 0 0-.5.5v3a.5.5 0 0 0 .5.5h3a.5.5 0 0 0 .5-.5v-3a.5.5 0 0 0-.5-.5h-3zM1 10.5A1.5 1.5 0 0 1 2.5 9h3A1.5 1.5 0 0 1 7 10.5v3A1.5 1.5 0 0 1 5.5 15h-3A1.5 1.5 0 0 1 1 13.5v-3zm1.5-.5a.5.5 0 0 0-.5.5v3a.5.5 0 0 0 .5.5h3a.5.5 0 0 0 .5-.5v-3a.5.5 0 0 0-.5-.5h-3zm6.5.5A1.5 1.5 0 0 1 10.5 9h3a1.5 1.5 0 0 1 1.5 1.5v3a1.5 1.5 0 0 1-1.5 1.5h-3A1.5 1.5 0 0 1 9 13.5v-3zm1.5-.5a.5.5 0 0 0-.5.5v3a.5.5 0 0 0 .5.5h3a.5.5 0 0 0 .5-.5v-3a.5.5 0 0 0-.5-.5h-3z"
                  />
                </svg>
              </button>
              <button
                class="${this.viewType === "list" ? "active" : ""}"
                @click="${() => this.toggleView("list")}"
                title="List view"
              >
                <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                  <path
                    fill-rule="evenodd"
                    d="M2.5 12a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5zm0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5zm0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5z"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>

        ${filteredNotes.length === 0 ? this.renderEmptyState() : html`
          <div class="${this.viewType === "grid" ? "notes-grid" : "notes-list"}">
            ${filteredNotes.map((note) => this.renderNoteCard(note))}
          </div>
        `}
      </div>
    `;
  }
}

customElements.define("note-list", NoteList);
