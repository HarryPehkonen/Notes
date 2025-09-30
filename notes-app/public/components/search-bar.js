/**
 * Search Bar Component
 */
import { LitElement, html, css } from 'lit';

export class SearchBar extends LitElement {
    static properties = {
        query: { type: String },
        suggestions: { type: Array },
        showSuggestions: { type: Boolean },
        selectedIndex: { type: Number },
        loading: { type: Boolean }
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
            box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }

        .search-icon {
            position: absolute;
            left: 1rem;
            color: var(--gray-500);
            pointer-events: none;
        }

        .search-input {
            width: 100%;
            padding: 0.75rem 2.5rem;
            border: none;
            background: transparent;
            font-size: 0.875rem;
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
            right: 0.75rem;
            padding: 0.25rem;
            background: transparent;
            border: none;
            color: var(--gray-500);
            cursor: pointer;
            border-radius: 0.25rem;
            transition: all 0.2s;
        }

        .clear-button:hover {
            background: var(--gray-100);
            color: var(--gray-700);
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
            cursor: pointer;
            transition: background-color 0.1s;
            display: flex;
            align-items: center;
            gap: 0.75rem;
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
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
        }

        @media (max-width: 768px) {
            :host {
                max-width: 100%;
            }
        }
    `;

    constructor() {
        super();
        this.query = '';
        this.suggestions = [];
        this.showSuggestions = false;
        this.selectedIndex = -1;
        this.loading = false;
        this.debounceTimer = null;
    }

    connectedCallback() {
        super.connectedCallback();
        // Add keyboard shortcut listener
        document.addEventListener('keydown', this.handleGlobalKeydown.bind(this));
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        document.removeEventListener('keydown', this.handleGlobalKeydown.bind(this));
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
    }

    handleGlobalKeydown(e) {
        // Ctrl/Cmd + K to focus search
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            this.focus();
        }
    }

    focus() {
        const input = this.shadowRoot.querySelector('.search-input');
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
                // Only search if query is at least 2 characters
                if (value.trim().length >= 2) {
                    this.performSearch(value);
                    this.loadSuggestions(value);
                } else {
                    this.loading = false;
                    this.suggestions = [];
                    this.showSuggestions = false;
                }
            }, 300);
        } else {
            // Clear search
            this.suggestions = [];
            this.showSuggestions = false;
            this.loading = false;
            this.dispatchSearchEvent('');
        }
    }

    async performSearch(query) {
        this.dispatchSearchEvent(query);
        this.loading = false;
    }

    async loadSuggestions(query) {
        try {
            const result = await window.NotesApp.getSearchSuggestions(query, 8);
            if (result && result.data && result.data.suggestions) {
                this.suggestions = result.data.suggestions;
                this.showSuggestions = this.suggestions.length > 0;
            } else {
                this.suggestions = [];
                this.showSuggestions = false;
            }
        } catch (error) {
            console.error('Failed to load suggestions:', error);
            this.suggestions = [];
            this.showSuggestions = false;
        }
    }

    handleKeydown(e) {
        if (!this.showSuggestions) {
            if (e.key === 'Escape' && this.query) {
                e.preventDefault();
                this.clearSearch();
            }
            return;
        }

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                this.selectedIndex = Math.min(
                    this.selectedIndex + 1,
                    this.suggestions.length - 1
                );
                break;
            case 'ArrowUp':
                e.preventDefault();
                this.selectedIndex = Math.max(this.selectedIndex - 1, -1);
                break;
            case 'Enter':
                e.preventDefault();
                if (this.selectedIndex >= 0) {
                    this.selectSuggestion(this.suggestions[this.selectedIndex]);
                } else {
                    this.performSearch(this.query);
                    this.showSuggestions = false;
                }
                break;
            case 'Escape':
                e.preventDefault();
                this.showSuggestions = false;
                this.selectedIndex = -1;
                break;
        }
    }

    handleFocus() {
        if (this.query && this.suggestions.length > 0) {
            this.showSuggestions = true;
        }
    }

    handleBlur(e) {
        // Delay hiding to allow click on suggestion
        setTimeout(() => {
            this.showSuggestions = false;
            this.selectedIndex = -1;
        }, 200);
    }

    selectSuggestion(suggestion) {
        if (suggestion.type === 'tag') {
            this.query = `#${suggestion.text}`;
        } else {
            this.query = suggestion.text;
        }
        this.showSuggestions = false;
        this.selectedIndex = -1;
        this.performSearch(this.query);
    }

    clearSearch() {
        this.query = '';
        this.suggestions = [];
        this.showSuggestions = false;
        this.selectedIndex = -1;
        this.loading = false;
        this.dispatchSearchEvent('');
        this.focus();
    }

    dispatchSearchEvent(query) {
        this.dispatchEvent(new CustomEvent('search-query', {
            detail: { query: query.trim() },
            bubbles: true,
            composed: true
        }));
    }

    render() {
        return html`
            <div class="search-container">
                <div class="search-input-wrapper">
                    <svg class="search-icon" width="18" height="18" fill="currentColor" viewBox="0 0 16 16">
                        <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z"/>
                    </svg>

                    <input
                        type="text"
                        class="search-input"
                        placeholder="Search notes... (Ctrl+K)"
                        .value=${this.query}
                        @input=${this.handleInput}
                        @keydown=${this.handleKeydown}
                        @focus=${this.handleFocus}
                        @blur=${this.handleBlur}
                    />

                    ${this.loading ? html`
                        <svg class="loading-spinner" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                            <path opacity="0.3" d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0-1A6 6 0 1 0 8 2a6 6 0 0 0 0 12z"/>
                            <path d="M8 1a7 7 0 0 1 7 7h-1a6 6 0 0 0-6-6V1z"/>
                        </svg>
                    ` : ''}

                    ${this.query && !this.loading ? html`
                        <button class="clear-button" @click=${this.clearSearch} title="Clear search">
                            <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                                <path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8 2.146 2.854Z"/>
                            </svg>
                        </button>
                    ` : !this.query && !this.loading ? html`
                        <span class="keyboard-hint">⌘K</span>
                    ` : ''}
                </div>

                ${this.showSuggestions ? html`
                    <div class="suggestions-dropdown">
                        ${this.suggestions.length > 0 ? this.suggestions.map((suggestion, index) => html`
                            <div
                                class="suggestion-item ${index === this.selectedIndex ? 'selected' : ''}"
                                @click=${() => this.selectSuggestion(suggestion)}
                            >
                                ${suggestion.type === 'tag' ? html`
                                    <span class="tag-color-dot" style="background-color: ${suggestion.color}"></span>
                                ` : html`
                                    <svg class="suggestion-icon" width="14" height="14" fill="currentColor" viewBox="0 0 16 16">
                                        <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z"/>
                                    </svg>
                                `}
                                <span class="suggestion-text">${suggestion.display || suggestion.text}</span>
                                <span class="suggestion-type">${suggestion.type}</span>
                            </div>
                        `) : html`
                            <div class="no-suggestions">No suggestions found</div>
                        `}
                    </div>
                ` : ''}
            </div>
        `;
    }
}

customElements.define('search-bar', SearchBar);