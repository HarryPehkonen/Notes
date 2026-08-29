/**
 * Search Bar Component
 */
import { css, html, LitElement } from "lit";
import { icons } from "../utils/icons.js";
import { shouldSendSemantic } from "../utils/search-mode.js";
import {
  clearTagSelection,
  filterTagOptions,
  isTagSelected,
  removeTagFromSelection,
  tagFilterLabel,
  tagSelectionDetail,
  toggleTagSelection,
} from "../utils/tag-filter.js";

export class SearchBar extends LitElement {
  static properties = {
    query: { type: String },
    suggestions: { type: Array },
    showSuggestions: { type: Boolean },
    selectedIndex: { type: Number },
    loading: { type: Boolean },
    semanticMode: { type: Boolean },
    tags: { type: Array },
    selectedTags: { type: Array },
    showTagPicker: { type: Boolean },
    tagFilterText: { type: String },
  };

  static styles = css`
    :host {
      display: block;
      position: relative;
      width: 100%;
      max-width: 600px;
    }

    .search-container {
      position: relative;
      width: 100%;
    }

    /* The input and the Tags button sit side by side, so tag filtering is
      visible right where searching happens instead of behind the rail flyout. */
    .search-row {
      display: flex;
      align-items: stretch;
      gap: 0.5rem;
      width: 100%;
    }

    /* Anchors the suggestions dropdown to the input, not to the whole
      container, so the semantic toggle below cannot push it down. */
    .search-field {
      position: relative;
      flex: 1;
      min-width: 0;
    }

    .search-input-wrapper {
      position: relative;
      display: flex;
      align-items: center;
      background: var(--white);
      border: 1px solid var(--gray-300);
      border-radius: 0.5rem;
      transition: all 0.2s;
    }

    .search-input-wrapper:focus-within {
      border-color: var(--primary);
      box-shadow: 0 0 0 3px rgb(var(--primary-rgb) / 0.15);
    }

    .search-icon {
      position: absolute;
      left: 1rem;
      color: var(--gray-500);
      pointer-events: none;
      width: 17px;
      height: 17px;
      display: flex;
    }

    .search-icon svg {
      width: 100%;
      height: 100%;
    }

    .search-input {
      width: 100%;
      min-width: 0;
      padding: 0.75rem 2.5rem;
      border: none;
      background: transparent;
      /* Must stay >= 16px: iOS Safari zooms the page in on focus for anything
        smaller, and never zooms back out. */
      font-size: 1rem;
      font-family: var(--font-family);
      color: var(--gray-900);
    }

    .search-input:focus {
      outline: none;
    }

    .search-input::placeholder {
      color: var(--gray-400);
    }

    .clear-button {
      position: absolute;
      right: 0.25rem;
      width: 40px;
      height: 40px;
      padding: 0;
      background: transparent;
      border: none;
      color: var(--gray-500);
      cursor: pointer;
      border-radius: 0.375rem;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
      -webkit-tap-highlight-color: transparent;
    }

    .clear-button svg {
      width: 15px;
      height: 15px;
    }

    @media (hover: hover) {
      .clear-button:hover {
        background: var(--gray-100);
        color: var(--gray-700);
      }
    }

    .keyboard-hint {
      position: absolute;
      right: 0.75rem;
      padding: 0.25rem 0.5rem;
      background: var(--gray-100);
      border-radius: 0.25rem;
      font-size: 0.75rem;
      color: var(--gray-500);
      font-family: monospace;
      pointer-events: none;
    }

    /* Deliberately large and always visible: this switches search between two
      very different behaviours, so it must be readable at a glance. */
    .semantic-toggle {
      display: flex;
      align-items: center;
      gap: 0.625rem;
      margin-top: 0.5rem;
      padding: 0.25rem 0.125rem;
      min-height: 44px;
      cursor: pointer;
      user-select: none;
      -webkit-tap-highlight-color: transparent;
    }

    .semantic-checkbox {
      width: 22px;
      height: 22px;
      margin: 0;
      flex-shrink: 0;
      accent-color: var(--primary);
      cursor: pointer;
    }

    .semantic-label {
      font-size: 1rem;
      font-weight: 600;
      line-height: 1.2;
      color: var(--gray-900);
      font-family: var(--font-family);
    }

    .suggestions-dropdown {
      position: absolute;
      top: calc(100% + 0.5rem);
      left: 0;
      right: 0;
      background: var(--white);
      border: 1px solid var(--gray-200);
      border-radius: 0.5rem;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
      max-height: 300px;
      overflow-y: auto;
      z-index: 1000;
    }

    .suggestion-item {
      padding: 0.75rem 1rem;
      min-height: 44px;
      cursor: pointer;
      transition: background-color 0.1s;
      display: flex;
      align-items: center;
      gap: 0.75rem;
      -webkit-tap-highlight-color: transparent;
    }

    .suggestion-item:hover,
    .suggestion-item.selected {
      background: var(--gray-50);
    }

    .suggestion-item.selected {
      background: var(--primary-light);
    }

    .suggestion-icon {
      color: var(--gray-500);
      flex-shrink: 0;
      width: 14px;
      height: 14px;
      display: flex;
    }

    .suggestion-icon svg {
      width: 100%;
      height: 100%;
    }

    .suggestion-text {
      flex: 1;
      font-size: 0.875rem;
      color: var(--gray-700);
    }

    .suggestion-type {
      font-size: 0.75rem;
      color: var(--gray-500);
      padding: 0.125rem 0.5rem;
      background: var(--gray-100);
      border-radius: 0.25rem;
    }

    .tag-color-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .no-suggestions {
      padding: 1rem;
      text-align: center;
      color: var(--gray-500);
      font-size: 0.875rem;
    }

    .loading-spinner {
      position: absolute;
      right: 0.75rem;
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      from {
        transform: rotate(0deg);
      }
      to {
        transform: rotate(360deg);
      }
    }

    /* Anchors the picker under the button on desktop. */
    .tag-filter {
      position: relative;
      flex-shrink: 0;
    }

    /* Spelled out, not a '#' glyph: an icon alone gives no clue that tag
      filtering exists at all. */
    .tag-filter-button {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      height: 100%;
      min-height: 44px;
      padding: 0 1rem;
      background: var(--white);
      border: 1px solid var(--gray-300);
      border-radius: 0.5rem;
      font-size: 1rem;
      font-weight: 600;
      font-family: var(--font-family);
      color: var(--gray-900);
      cursor: pointer;
      white-space: nowrap;
      -webkit-tap-highlight-color: transparent;
    }

    .tag-filter-button.active {
      background: var(--primary);
      border-color: var(--primary);
      color: var(--white);
    }

    .tag-filter-button:focus-visible {
      outline: 3px solid var(--primary);
      outline-offset: 2px;
    }

    @media (hover: hover) {
      .tag-filter-button:hover {
        border-color: var(--primary);
      }
    }

    .tag-filter-caret {
      font-size: 0.7rem;
      line-height: 1;
    }

    /* Wraps to as many rows as it needs: with many tags selected, nothing may
      disappear behind an ellipsis. */
    .tag-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-top: 0.5rem;
    }

    .tag-chip {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      min-height: 36px;
      padding: 0.25rem 0.25rem 0.25rem 0.75rem;
      background: var(--gray-100);
      border: 1px solid var(--gray-300);
      border-radius: var(--radius-full);
      font-size: 1rem;
      color: var(--gray-900);
      max-width: 100%;
    }

    .tag-chip-name {
      font-weight: 600;
      overflow-wrap: anywhere;
    }

    .tag-chip-remove {
      width: 32px;
      height: 32px;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      background: transparent;
      border: none;
      border-radius: 50%;
      color: var(--gray-700);
      font-size: 1.125rem;
      line-height: 1;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
    }

    @media (hover: hover) {
      .tag-chip-remove:hover {
        background: var(--gray-300);
        color: var(--gray-900);
      }
    }

    .tag-chips-clear {
      min-height: 36px;
      padding: 0.25rem 0.875rem;
      background: transparent;
      border: 1px solid var(--gray-400);
      border-radius: var(--radius-full);
      font-size: 1rem;
      font-weight: 600;
      font-family: var(--font-family);
      color: var(--gray-700);
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
    }

    @media (hover: hover) {
      .tag-chips-clear:hover {
        border-color: var(--gray-700);
        color: var(--gray-900);
      }
    }

    .tag-picker-scrim {
      display: none;
    }

    .tag-picker {
      position: absolute;
      top: calc(100% + 0.5rem);
      right: 0;
      width: 20rem;
      max-width: 90vw;
      background: var(--white);
      border: 1px solid var(--gray-200);
      border-radius: 0.5rem;
      box-shadow: var(--shadow-lg);
      z-index: 1001;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .tag-picker-header {
      padding: 0.75rem 1rem 0.5rem;
      font-size: 1rem;
      font-weight: 700;
      color: var(--gray-900);
    }

    .tag-picker-filter {
      margin: 0 1rem 0.5rem;
      padding: 0.625rem 0.75rem;
      min-height: 44px;
      border: 1px solid var(--gray-300);
      border-radius: 0.375rem;
      /* >= 16px or iOS Safari zooms in on focus and never zooms back out. */
      font-size: 1rem;
      font-family: var(--font-family);
      color: var(--gray-900);
    }

    /* Scrolls rather than growing: the tag list is expected to get long. */
    .tag-picker-list {
      max-height: 16rem;
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
    }

    .tag-picker-option {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      width: 100%;
      min-height: 44px;
      padding: 0.5rem 1rem;
      background: transparent;
      border: none;
      font-size: 1rem;
      font-family: var(--font-family);
      color: var(--gray-900);
      text-align: left;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
    }

    .tag-picker-option.selected {
      background: var(--primary-light);
      font-weight: 700;
    }

    @media (hover: hover) {
      .tag-picker-option:hover {
        background: var(--gray-50);
      }
    }

    .tag-picker-option-name {
      flex: 1;
      overflow-wrap: anywhere;
    }

    .tag-picker-check {
      flex-shrink: 0;
      font-weight: 700;
      color: var(--primary-dark);
    }

    .tag-picker-empty {
      padding: 1rem;
      text-align: center;
      font-size: 1rem;
      color: var(--gray-500);
    }

    .tag-picker-footer {
      display: flex;
      gap: 0.5rem;
      padding: 0.75rem 1rem;
      border-top: 1px solid var(--gray-200);
    }

    .tag-picker-footer button {
      flex: 1;
      min-height: 44px;
      border-radius: 0.375rem;
      font-size: 1rem;
      font-weight: 600;
      font-family: var(--font-family);
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
    }

    .tag-picker-clear {
      background: var(--white);
      border: 1px solid var(--gray-400);
      color: var(--gray-700);
    }

    .tag-picker-done {
      background: var(--primary);
      border: 1px solid var(--primary);
      color: var(--white);
    }

    @media (max-width: 768px) {
      :host {
        max-width: 100%;
      }

      /* No Ctrl+K on a phone, and the chip steals room from a narrow field. */
      .keyboard-hint {
        display: none;
      }

      .search-input {
        padding: 0.6rem 2.25rem;
        min-height: 44px;
      }

      .clear-button {
        width: 44px;
        height: 44px;
      }

      .search-icon {
        left: 0.75rem;
      }

      /* Chips are finger targets on a phone, so everything on them grows to
        the 44px minimum. On desktop they stay compact for the mouse. */
      .tag-chip {
        min-height: 44px;
        padding: 0.25rem 0.25rem 0.25rem 0.875rem;
      }

      .tag-chip-remove {
        width: 44px;
        height: 44px;
        font-size: 1.25rem;
      }

      .tag-chips-clear {
        min-height: 44px;
      }

      /* A bottom sheet, anchored to the viewport rather than to the button, so
        the picker never runs off the side of a narrow screen. It is part of the
        search bar - it does not depend on the nav drawer being open. */
      .tag-picker {
        position: fixed;
        top: auto;
        right: 0;
        bottom: 0;
        left: 0;
        width: auto;
        max-width: none;
        max-height: 75vh;
        border-radius: 1rem 1rem 0 0;
        padding-bottom: env(safe-area-inset-bottom);
      }

      .tag-picker-list {
        max-height: none;
        flex: 1;
      }

      .tag-picker-scrim {
        display: block;
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.35);
        z-index: 1000;
      }
    }
  `;

  constructor() {
    super();
    this.query = "";
    this.suggestions = [];
    this.showSuggestions = false;
    this.selectedIndex = -1;
    this.loading = false;
    this.semanticMode = false;
    this.tags = [];
    this.selectedTags = [];
    this.showTagPicker = false;
    this.tagFilterText = "";
    this.debounceTimer = null;
    this._isFocused = false;

    // Store bound handler to prevent memory leak
    // (bind() creates a new function each call, so we need to store the reference)
    this._boundHandleGlobalKeydown = this.handleGlobalKeydown.bind(this);
    this._boundHandleDocumentClick = this._handleDocumentClick.bind(this);
  }

  connectedCallback() {
    super.connectedCallback();
    // Add keyboard shortcut listener using stored bound handler
    document.addEventListener("keydown", this._boundHandleGlobalKeydown);
    document.addEventListener("click", this._boundHandleDocumentClick);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    // Remove using the same bound handler reference
    document.removeEventListener("keydown", this._boundHandleGlobalKeydown);
    document.removeEventListener("click", this._boundHandleDocumentClick);
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
  }

  updated(changedProperties) {
    super.updated(changedProperties);
    // Restore focus if we were focused before the update
    // This prevents keyboard from hiding on mobile during re-renders (e.g., sync status changes)
    if (this._isFocused && !this.showTagPicker) {
      const input = this.shadowRoot?.querySelector(".search-input");
      if (input && document.activeElement !== input) {
        // Use requestAnimationFrame to ensure DOM is ready
        requestAnimationFrame(() => {
          input.focus();
        });
      }
    }
  }

  handleGlobalKeydown(e) {
    // Ctrl/Cmd + K to focus search
    if ((e.ctrlKey || e.metaKey) && e.key === "k") {
      e.preventDefault();
      this.focus();
    }

    if (e.key === "Escape" && this.showTagPicker) {
      e.preventDefault();
      this._closeTagPicker();
    }
  }

  /** A click anywhere outside this component closes the tag picker. */
  _handleDocumentClick(e) {
    if (!this.showTagPicker) return;
    if (e.composedPath().includes(this)) return;
    this._closeTagPicker();
  }

  focus() {
    const input = this.shadowRoot.querySelector(".search-input");
    if (input) {
      input.focus();
      input.select();
    }
  }

  handleInput(e) {
    const value = e.target.value;
    this.query = value;

    // Clear existing timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    // Debounce search
    if (value.trim()) {
      this.loading = true;
      this.debounceTimer = setTimeout(() => {
        // Only search if query is at least 1 character
        if (value.trim().length >= 1) {
          this.performSearch(value);
          this.loadSuggestions(value);
        } else {
          this.loading = false;
          this.suggestions = [];
          this.showSuggestions = false;
        }
      }, 150);
    } else {
      // Clear search
      this.suggestions = [];
      this.showSuggestions = false;
      this.loading = false;
      this.dispatchSearchEvent("");
    }
  }

  performSearch(query) {
    this.dispatchSearchEvent(query);
    this.loading = false;
  }

  async loadSuggestions(query) {
    try {
      const result = await globalThis.NotesApp.getSearchSuggestions(query, 8);
      if (result && result.data && result.data.suggestions) {
        this.suggestions = result.data.suggestions;
        this.showSuggestions = this.suggestions.length > 0;
      } else {
        this.suggestions = [];
        this.showSuggestions = false;
      }
    } catch (error) {
      console.error("Failed to load suggestions:", error);
      this.suggestions = [];
      this.showSuggestions = false;
    }
  }

  handleKeydown(e) {
    if (!this.showSuggestions) {
      if (e.key === "Escape" && this.query) {
        e.preventDefault();
        this.clearSearch();
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        this.selectedIndex = Math.min(
          this.selectedIndex + 1,
          this.suggestions.length - 1,
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        this.selectedIndex = Math.max(this.selectedIndex - 1, -1);
        break;
      case "Enter":
        e.preventDefault();
        if (this.selectedIndex >= 0) {
          this.selectSuggestion(this.suggestions[this.selectedIndex]);
        } else {
          this.performSearch(this.query);
          this.showSuggestions = false;
        }
        break;
      case "Escape":
        e.preventDefault();
        this.showSuggestions = false;
        this.selectedIndex = -1;
        break;
    }
  }

  handleFocus() {
    this._isFocused = true;
    if (this.query && this.suggestions.length > 0) {
      this.showSuggestions = true;
    }
  }

  handleBlur(_e) {
    this._isFocused = false;
    // Delay hiding to allow click on suggestion
    setTimeout(() => {
      this.showSuggestions = false;
      this.selectedIndex = -1;
    }, 200);
  }

  selectSuggestion(suggestion) {
    if (suggestion.type === "tag") {
      this.query = `#${suggestion.text}`;
    } else {
      this.query = suggestion.text;
    }
    this.showSuggestions = false;
    this.selectedIndex = -1;
    this.performSearch(this.query);
  }

  clearSearch() {
    this.query = "";
    this.suggestions = [];
    this.showSuggestions = false;
    this.selectedIndex = -1;
    this.loading = false;
    this.dispatchSearchEvent("");
    this.focus();
  }

  /**
   * Flip between full-text and semantic search, re-running the current query
   * so the results match the switch straight away.
   */
  _onSemanticToggle(e) {
    this.semanticMode = e.target.checked;
    if (this.query.trim()) {
      this.performSearch(this.query);
    }
  }

  _toggleTagPicker() {
    this.showTagPicker = !this.showTagPicker;
    if (!this.showTagPicker) this.tagFilterText = "";
  }

  _closeTagPicker() {
    this.showTagPicker = false;
    this.tagFilterText = "";
  }

  _onTagFilterInput(e) {
    this.tagFilterText = e.target.value;
  }

  /**
   * Tap a row in the picker. The picker stays open so several tags can be
   * chosen in one go; the chips below the input show the running selection.
   */
  _onTagOptionClick(tag) {
    this._emitTagSelection(toggleTagSelection(this.selectedTags, tag));
  }

  _onChipRemove(tagId) {
    this._emitTagSelection(removeTagFromSelection(this.selectedTags, tagId));
  }

  _onClearAllTags() {
    this._emitTagSelection(clearTagSelection());
  }

  /**
   * Publish a new selection.
   *
   * The local property is updated for an immediate render, but notes-app owns
   * the state: it re-queries and pushes the same array back down here and into
   * tag-manager, so both surfaces show one selection.
   */
  _emitTagSelection(newSelection) {
    this.selectedTags = newSelection;
    this.dispatchEvent(
      new CustomEvent("tags-selected", {
        detail: tagSelectionDetail(newSelection),
        bubbles: true,
        composed: true,
      }),
    );
  }

  dispatchSearchEvent(query) {
    this.dispatchEvent(
      new CustomEvent("search-query", {
        detail: {
          query: query.trim(),
          semantic: shouldSendSemantic(this.semanticMode),
        },
        bubbles: true,
        composed: true,
      }),
    );
  }

  /**
   * The selected tags, always visible under the input while a filter is on.
   * Wraps to as many rows as needed - nothing is hidden behind an ellipsis.
   */
  _renderTagChips() {
    return html`
      <div class="tag-chips">
        ${this.selectedTags.map((tag) =>
          html`
            <span class="tag-chip">
              <span class="tag-color-dot" style="background-color: ${tag.color}"></span>
              <span class="tag-chip-name">${tag.name}</span>
              <button
                class="tag-chip-remove"
                @click="${() => this._onChipRemove(tag.id)}"
                aria-label="Remove tag ${tag.name}"
                title="Remove tag ${tag.name}"
              >×</button>
            </span>
          `
        )}
        <button class="tag-chips-clear" @click="${this._onClearAllTags}">
          Clear all tags
        </button>
      </div>
    `;
  }

  /**
   * Dropdown on desktop, bottom sheet on mobile (see the media query). The
   * list scrolls and the filter field narrows it, so it stays usable however
   * many tags exist.
   */
  _renderTagPicker() {
    const options = filterTagOptions(this.tags, this.tagFilterText);

    return html`
      <div class="tag-picker-scrim" @click="${this._closeTagPicker}"></div>
      <div class="tag-picker" role="dialog" aria-label="Filter by tags">
        <div class="tag-picker-header">Filter by tags</div>

        <input
          type="text"
          class="tag-picker-filter"
          placeholder="Find a tag..."
          .value="${this.tagFilterText}"
          @input="${this._onTagFilterInput}"
        />

        <div class="tag-picker-list">
          ${options.length > 0
            ? options.map((tag) =>
              html`
                <button
                  class="tag-picker-option ${isTagSelected(this.selectedTags, tag.id)
                    ? "selected"
                    : ""}"
                  @click="${() => this._onTagOptionClick(tag)}"
                  aria-pressed="${isTagSelected(this.selectedTags, tag.id)}"
                >
                  <span class="tag-color-dot" style="background-color: ${tag.color}"></span>
                  <span class="tag-picker-option-name">${tag.name}</span>
                  ${isTagSelected(this.selectedTags, tag.id)
                    ? html`
                      <span class="tag-picker-check">✓</span>
                    `
                    : ""}
                </button>
              `
            )
            : html`
              <div class="tag-picker-empty">No tags match</div>
            `}
        </div>

        <div class="tag-picker-footer">
          <button class="tag-picker-clear" @click="${this._onClearAllTags}">Clear all</button>
          <button class="tag-picker-done" @click="${this._closeTagPicker}">Done</button>
        </div>
      </div>
    `;
  }

  render() {
    return html`
      <div class="search-container">
        <div class="search-row">
          <div class="search-field">
            <div class="search-input-wrapper">
              <span class="search-icon">${icons.search}</span>

              <input
                type="text"
                class="search-input"
                placeholder="Search notes... (Ctrl+K)"
                .value="${this.query}"
                @input="${this.handleInput}"
                @keydown="${this.handleKeydown}"
                @focus="${this.handleFocus}"
                @blur="${this.handleBlur}"
              />

              ${this.loading
                ? html`
                  <svg class="loading-spinner" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                    <path opacity="0.3" d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0-1A6 6 0 1 0 8 2a6 6 0 0 0 0 12z" />
                    <path d="M8 1a7 7 0 0 1 7 7h-1a6 6 0 0 0-6-6V1z" />
                  </svg>
                `
                : ""} ${this.query && !this.loading
                ? html`
                  <button class="clear-button" @click="${this.clearSearch}" title="Clear search">
                    ${icons.close}
                  </button>
                `
                : !this.query && !this.loading
                ? html`
                  <span class="keyboard-hint">⌘K</span>
                `
                : ""}
            </div>

            ${this.showSuggestions
              ? html`
                <div class="suggestions-dropdown">
                  ${this.suggestions.length > 0
                    ? this.suggestions.map((suggestion, index) =>
                      html`
                        <div
                          class="suggestion-item ${index === this.selectedIndex ? "selected" : ""}"
                          @click="${() => this.selectSuggestion(suggestion)}"
                        >
                          ${suggestion.type === "tag"
                            ? html`
                              <span class="tag-color-dot" style="background-color: ${suggestion
                                .color}"></span>
                            `
                            : html`
                              <span class="suggestion-icon">${icons.search}</span>
                            `}
                          <span class="suggestion-text">${suggestion.display ||
                            suggestion.text}</span>
                          <span class="suggestion-type">${suggestion.type}</span>
                        </div>
                      `
                    )
                    : html`
                      <div class="no-suggestions">No suggestions found</div>
                    `}
                </div>
              `
              : ""}
          </div>

          <div class="tag-filter">
            <button
              class="tag-filter-button ${this.selectedTags.length > 0 ? "active" : ""}"
              @click="${this._toggleTagPicker}"
              aria-haspopup="true"
              aria-expanded="${this.showTagPicker}"
            >
              <span>${tagFilterLabel(this.selectedTags)}</span>
              <span class="tag-filter-caret">${this.showTagPicker ? "▲" : "▼"}</span>
            </button>

            ${this.showTagPicker ? this._renderTagPicker() : ""}
          </div>
        </div>

        ${this.selectedTags.length > 0 ? this._renderTagChips() : ""}

        <label class="semantic-toggle">
          <input
            type="checkbox"
            class="semantic-checkbox"
            ?checked="${this.semanticMode}"
            @change="${this._onSemanticToggle}"
          />
          <span class="semantic-label">Semantic search</span>
        </label>
      </div>
    `;
  }
}

customElements.define("search-bar", SearchBar);
