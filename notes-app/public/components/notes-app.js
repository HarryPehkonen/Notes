/**
 * Main Notes App Component
 * Root component that manages the overall app layout and state
 */

import { LitElement, html, css } from 'lit';

class NotesApp extends LitElement {
    static properties = {
        notes: { type: Array },
        tags: { type: Array },
        currentNote: { type: Object },
        searchQuery: { type: String },
        selectedTags: { type: Array },
        loading: { type: Boolean },
        viewMode: { type: String }, // 'list', 'edit', 'search'
        sidebarOpen: { type: Boolean },
    };

    static styles = css`
        :host {
            display: block;
            height: 100vh;
            overflow: hidden;
        }

        .app-layout {
            display: flex;
            height: 100%;
            background: var(--gray-50);
        }

        .sidebar {
            width: 280px;
            background: var(--white);
            border-right: 1px solid var(--gray-200);
            display: flex;
            flex-direction: column;
            transition: transform 0.3s ease;
        }

        .sidebar-header {
            padding: 1rem;
            border-bottom: 1px solid var(--gray-200);
            background: var(--primary);
            color: white;
        }

        .app-title {
            font-size: 1.25rem;
            font-weight: 600;
            margin: 0;
        }

        .sidebar-content {
            flex: 1;
            overflow-y: auto;
            padding: 1rem;
        }

        .sidebar-section {
            margin-bottom: 1.5rem;
        }

        .section-title {
            font-size: 0.875rem;
            font-weight: 600;
            color: var(--gray-700);
            margin-bottom: 0.5rem;
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }

        .main-content {
            flex: 1;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }

        .top-bar {
            height: 64px;
            background: var(--white);
            border-bottom: 1px solid var(--gray-200);
            display: flex;
            align-items: center;
            padding: 0 1rem;
            gap: 1rem;
        }

        .content-area {
            flex: 1;
            overflow: hidden;
            position: relative;
        }

        .new-note-btn {
            width: 100%;
            padding: 0.75rem;
            background: var(--primary);
            color: white;
            border: none;
            border-radius: 0.5rem;
            font-weight: 500;
            cursor: pointer;
            transition: background 0.2s;
            margin-bottom: 1rem;
        }

        .new-note-btn:hover {
            background: var(--primary-dark);
        }

        .stats {
            display: flex;
            gap: 1rem;
            margin-bottom: 1rem;
        }

        .stat {
            text-align: center;
            padding: 0.75rem;
            background: var(--gray-50);
            border-radius: 0.5rem;
            flex: 1;
        }

        .stat.clickable {
            cursor: pointer;
            transition: all 0.2s;
        }

        .stat.clickable:hover {
            background: var(--gray-100);
            transform: translateY(-1px);
        }

        .stat-number {
            display: block;
            font-size: 1.25rem;
            font-weight: 600;
            color: var(--primary);
        }

        .stat-label {
            font-size: 0.75rem;
            color: var(--gray-600);
        }

        .user-menu {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            margin-left: auto;
        }

        .user-avatar {
            width: 32px;
            height: 32px;
            border-radius: 50%;
            object-fit: cover;
        }

        .user-name {
            font-size: 0.875rem;
            color: var(--gray-700);
        }

        .logout-btn {
            padding: 0.25rem 0.5rem;
            background: transparent;
            border: 1px solid var(--gray-300);
            border-radius: 0.25rem;
            font-size: 0.75rem;
            color: var(--gray-600);
            cursor: pointer;
        }

        .logout-btn:hover {
            background: var(--gray-50);
        }

        .mobile-header {
            display: none;
            padding: 1rem;
            background: var(--white);
            border-bottom: 1px solid var(--gray-200);
            align-items: center;
            gap: 1rem;
        }

        .menu-toggle {
            background: none;
            border: none;
            cursor: pointer;
            padding: 0.25rem;
        }

        .loading-overlay {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(255, 255, 255, 0.8);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10;
        }

        /* Mobile styles */
        @media (max-width: 768px) {
            .sidebar {
                position: absolute;
                top: 0;
                left: 0;
                bottom: 0;
                z-index: 20;
                transform: translateX(-100%);
            }

            .sidebar.open {
                transform: translateX(0);
            }

            .mobile-header {
                display: flex;
            }

            .top-bar {
                display: none;
            }

            .main-content {
                height: 100%;
            }
        }

        /* Toast container */
        .toast-container {
            position: fixed;
            top: 1rem;
            right: 1rem;
            z-index: 1000;
            pointer-events: none;
        }

        .toast {
            background: var(--white);
            border: 1px solid var(--gray-200);
            border-radius: 0.5rem;
            box-shadow: var(--shadow-lg);
            padding: 1rem;
            margin-bottom: 0.5rem;
            max-width: 400px;
            pointer-events: auto;
            animation: slide-in 0.3s ease;
        }

        .toast.success {
            border-left: 4px solid var(--success);
        }

        .toast.error {
            border-left: 4px solid var(--error);
        }

        .toast.warning {
            border-left: 4px solid var(--warning);
        }

        .toast.info {
            border-left: 4px solid var(--info);
        }

        @keyframes slide-in {
            from {
                transform: translateX(100%);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
    `;

    constructor() {
        super();
        this.notes = [];
        this.tags = [];
        this.currentNote = null;
        this.searchQuery = '';
        this.selectedTags = [];
        this.loading = false;
        this.viewMode = 'list';
        this.sidebarOpen = false;
        this.toasts = [];

        // Get user info from global context (set by server)
        this.user = window.user || null;
    }

    connectedCallback() {
        super.connectedCallback();
        this.loadInitialData();
        this.setupEventListeners();
    }

    async loadInitialData() {
        this.loading = true;
        try {
            // Wait for NotesApp to be available
            await this.waitForNotesApp();

            const [notesResult, tagsResult] = await Promise.all([
                window.NotesApp.getNotes(),
                window.NotesApp.getTags()
            ]);

            this.notes = notesResult.data || [];
            this.tags = tagsResult.data || [];
        } catch (error) {
            console.error('Failed to load initial data:', error);
            this.showToast('Failed to load data. Please refresh the page.', 'error');
        } finally {
            this.loading = false;
        }
    }

    async waitForNotesApp() {
        while (!window.NotesApp || !window.NotesApp.getNotes) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    setupEventListeners() {
        // Listen for global events
        document.addEventListener('focus-search', () => {
            this.shadowRoot.querySelector('search-bar')?.focus();
        });

        document.addEventListener('new-note', () => {
            this.createNewNote();
        });

        document.addEventListener('escape-pressed', () => {
            if (this.viewMode === 'edit') {
                this.viewMode = 'list';
                this.currentNote = null;
            }
            this.sidebarOpen = false;
        });

        document.addEventListener('show-toast', (event) => {
            this.showToast(event.detail.message, event.detail.type);
        });

        // Listen for component events
        this.addEventListener('note-selected', (event) => {
            this.currentNote = event.detail.note;
            this.viewMode = 'edit';
            this.sidebarOpen = false; // Close sidebar on mobile
        });

        this.addEventListener('note-created', (event) => {
            this.notes = [event.detail.note, ...this.notes];
            this.currentNote = event.detail.note;
            this.viewMode = 'edit';
        });

        this.addEventListener('note-updated', (event) => {
            const index = this.notes.findIndex(n => n.id === event.detail.note.id);
            if (index !== -1) {
                this.notes[index] = event.detail.note;
                this.notes = [...this.notes]; // Trigger reactivity
            }
            this.currentNote = event.detail.note;
        });

        this.addEventListener('note-deleted', (event) => {
            this.notes = this.notes.filter(n => n.id !== event.detail.noteId);
            if (this.currentNote?.id === event.detail.noteId) {
                this.currentNote = null;
                this.viewMode = 'list';
            }
        });

        this.addEventListener('search-query', (event) => {
            this.searchQuery = event.detail.query;
            this.performSearch();
        });

        this.addEventListener('tags-selected', async (event) => {
            console.log('  notes-app received tags-selected event:', event.detail);
            this.selectedTags = event.detail.tags;

            // When tags are selected, switch to list view to show filtered results
            if (this.selectedTags.length > 0) {
                console.log('  Switching to list view for filtering');
                // Save any pending changes before switching views
                if (this.viewMode === 'edit' && this.currentNote) {
                    const editor = this.shadowRoot.querySelector('note-editor');
                    if (editor && editor.hasUnsavedChanges) {
                        await editor.autoSave();
                    }
                }

                this.viewMode = 'list';
                this.currentNote = null;
            }

            console.log('  Calling filterNotes');
            this.filterNotes();
        });

        this.addEventListener('tag-created', (event) => {
            this.tags = [...this.tags, event.detail.tag];
        });

        this.addEventListener('tag-updated', (event) => {
            const index = this.tags.findIndex(t => t.id === event.detail.tag.id);
            if (index !== -1) {
                this.tags[index] = event.detail.tag;
                this.tags = [...this.tags];
            }
        });

        this.addEventListener('tag-deleted', (event) => {
            this.tags = this.tags.filter(t => t.id !== event.detail.tagId);
        });
    }

    async createNewNote() {
        try {
            // If we're currently editing a note, save any pending changes first
            if (this.viewMode === 'edit' && this.currentNote) {
                const editor = this.shadowRoot.querySelector('note-editor');
                if (editor && editor.hasUnsavedChanges) {
                    await editor.autoSave();
                }
            }

            const newNote = {
                title: 'Untitled Note',
                content: 'Start writing your note...',
                tags: []
            };

            const result = await window.NotesApp.createNote(newNote);
            this.dispatchEvent(new CustomEvent('note-created', {
                detail: { note: result.data }
            }));
        } catch (error) {
            console.error('Failed to create note:', error);
            this.showToast('Failed to create note', 'error');
        }
    }

    async performSearch() {
        if (!this.searchQuery.trim()) {
            // If no search query, reload all notes
            this.loadInitialData();
            return;
        }

        try {
            this.loading = true;
            const result = await window.NotesApp.searchNotes(this.searchQuery);
            this.notes = result.data.results || [];
            this.viewMode = 'search';
        } catch (error) {
            console.error('Search failed:', error);
            this.showToast('Search failed', 'error');
        } finally {
            this.loading = false;
        }
    }

    async handleTagsSelected(tags) {
        console.log('  DIRECT CALLBACK - handleTagsSelected called with:', tags);
        this.selectedTags = tags || [];

        // Save any unsaved changes before switching views
        if (this.currentView === 'editor' && this.editorRef && this.editorRef.hasUnsavedChanges) {
            console.log('  Auto-saving editor before filtering');
            await this.editorRef.autoSave();
        }

        // Switch to notes view and filter
        this.currentView = 'notes';
        console.log('  Switched view to notes, calling filterNotes');
        await this.filterNotes();
    }

    async filterNotes() {
        try {
            console.log('  filterNotes called with selectedTags:', this.selectedTags);
            this.loading = true;
            const options = {};
            if (this.selectedTags.length > 0) {
                options.tags = this.selectedTags.map(tag => tag.id);
            }
            console.log('  Filtering with options:', options);

            const result = await window.NotesApp.getNotes(options);
            console.log('  Filter result:', result);
            this.notes = result.data || [];
            console.log('  Updated notes:', this.notes);
        } catch (error) {
            console.error('Failed to filter notes:', error);
            this.showToast('Failed to filter notes', 'error');
        } finally {
            this.loading = false;
        }
    }

    toggleSidebar() {
        this.sidebarOpen = !this.sidebarOpen;
    }

    async showAllNotes() {
        // If we're currently editing a note, save any pending changes first
        if (this.viewMode === 'edit' && this.currentNote) {
            const editor = this.shadowRoot.querySelector('note-editor');
            if (editor && editor.hasUnsavedChanges) {
                await editor.autoSave();
            }
        }

        // Clear any active filters and show all notes
        this.selectedTags = [];
        this.searchQuery = '';
        this.viewMode = 'list';
        this.currentNote = null;

        // Load fresh data to make sure we have all notes
        this.loadInitialData();

        // Close sidebar on mobile
        if (window.innerWidth <= 768) {
            this.sidebarOpen = false;
        }
    }

    async logout() {
        try {
            await window.NotesApp.logout();
        } catch (error) {
            console.error('Logout failed:', error);
            this.showToast('Logout failed', 'error');
        }
    }

    showToast(message, type = 'info') {
        const toast = { id: Date.now(), message, type };
        this.toasts = [...this.toasts, toast];

        // Auto-remove after 5 seconds
        setTimeout(() => {
            this.toasts = this.toasts.filter(t => t.id !== toast.id);
        }, 5000);
    }

    removeToast(toastId) {
        this.toasts = this.toasts.filter(t => t.id !== toastId);
    }

    render() {
        return html`
            <div class="app-layout">
                <div class="mobile-header">
                    <button class="menu-toggle" @click=${this.toggleSidebar}>
                        ☰
                    </button>
                    <h1 class="app-title">Notes</h1>
                </div>

                <aside class="sidebar ${this.sidebarOpen ? 'open' : ''}">
                    <div class="sidebar-header">
                        <h1 class="app-title">※ Notes</h1>
                    </div>

                    <div class="sidebar-content">
                        <button class="new-note-btn" @click=${this.createNewNote}>
                              New Note
                        </button>

                        <div class="stats">
                            <div class="stat clickable" @click=${this.showAllNotes} title="Click to view all notes">
                                <span class="stat-number">${this.notes.length}</span>
                                <span class="stat-label">Notes</span>
                            </div>
                            <div class="stat">
                                <span class="stat-number">${this.tags.length}</span>
                                <span class="stat-label">Tags</span>
                            </div>
                        </div>

                        <div class="sidebar-section">
                            <div class="section-title">Tags</div>
                            <tag-manager
                                .tags=${this.tags}
                                .selectedTags=${this.selectedTags}
                                .onTagsSelected=${(tags) => this.handleTagsSelected(tags)}
                            ></tag-manager>
                        </div>
                    </div>
                </aside>

                <main class="main-content">
                    <div class="top-bar">
                        <search-bar
                            .query=${this.searchQuery}
                            @search-query=${(e) => this.searchQuery = e.detail.query}
                        ></search-bar>

                        <div class="user-menu">
                            ${this.user ? html`
                                <img class="user-avatar" src="${this.user.picture}" alt="${this.user.name}">
                                <span class="user-name">${this.user.name}</span>
                                <button class="logout-btn" @click=${this.logout}>Logout</button>
                            ` : ''}
                        </div>
                    </div>

                    <div class="content-area">
                        ${this.loading ? html`
                            <div class="loading-overlay">
                                <div class="loading"></div>
                            </div>
                        ` : ''}

                        ${this.viewMode === 'edit' && this.currentNote ? html`
                            <note-editor
                                .note=${this.currentNote}
                                .tags=${this.tags}
                                @note-updated=${(e) => this.currentNote = e.detail.note}
                                @close-editor=${() => { this.viewMode = 'list'; this.currentNote = null; }}
                            ></note-editor>
                        ` : html`
                            <note-list
                                .notes=${this.notes}
                                .searchQuery=${this.searchQuery}
                                .selectedTags=${this.selectedTags}
                                @note-selected=${(e) => {
                                    this.currentNote = e.detail.note;
                                    this.viewMode = 'edit';
                                }}
                            ></note-list>
                        `}
                    </div>
                </main>
            </div>

            <div class="toast-container">
                ${this.toasts.map(toast => html`
                    <div class="toast ${toast.type}" @click=${() => this.removeToast(toast.id)}>
                        ${toast.message}
                    </div>
                `)}
            </div>
        `;
    }
}

customElements.define('notes-app', NotesApp);
