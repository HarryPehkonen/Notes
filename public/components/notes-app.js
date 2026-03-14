/**
 * Main Notes App Component
 * Root component that manages the overall app layout and state
 */

import { css, html, LitElement } from "lit";

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
    hasMore: { type: Boolean },
    loadingMore: { type: Boolean },
    pendingSyncCount: { type: Number },
    syncStatus: { type: String }, // 'idle', 'syncing', 'pending', 'offline', 'error'
  };

  static styles = css`
    :host {
      display: block;
      height: 100vh;
      height: 100dvh;
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
      position: relative;
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

    .mobile-search {
      display: none;
      margin-bottom: 1rem;
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

    .active-filters {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 1rem;
      background: var(--gray-50);
      border-radius: 0.5rem;
    }

    .filter-info {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.875rem;
      color: var(--gray-600);
    }

    .filter-tag {
      padding: 0.25rem 0.5rem;
      background: var(--white);
      border: 1px solid var(--gray-300);
      border-radius: 0.25rem;
      font-size: 0.75rem;
    }

    .clear-filters-btn {
      padding: 0.25rem 0.75rem;
      background: var(--primary);
      color: white;
      border: none;
      border-radius: 0.25rem;
      font-size: 0.75rem;
      cursor: pointer;
      transition: background 0.2s;
    }

    .clear-filters-btn:hover {
      background: var(--primary-dark);
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

    .sync-status {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.25rem 0.75rem;
      border-radius: 1rem;
      font-size: 0.75rem;
      font-weight: 500;
    }

    .sync-status.idle {
      display: none;
    }

    .sync-status.syncing {
      background: var(--info-light, #e0f2fe);
      color: var(--info, #0284c7);
    }

    .sync-status.pending {
      background: var(--warning-light, #fef3c7);
      color: var(--warning, #d97706);
    }

    .sync-status.offline {
      background: var(--gray-100);
      color: var(--gray-600);
    }

    .sync-status.error {
      background: var(--error-light, #fee2e2);
      color: var(--error, #dc2626);
    }

    .sync-indicator {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: currentColor;
    }

    .sync-status.syncing .sync-indicator,
    .sync-status.pending .sync-indicator {
      animation: syncPulse 1.5s infinite;
    }

    @keyframes syncPulse {
      0%, 100% {
        opacity: 1;
        transform: scale(1);
      }
      50% {
        opacity: 0.5;
        transform: scale(0.8);
      }
    }

    .mobile-header {
      display: none;
      padding: 1rem;
      background: var(--white);
      border-bottom: 1px solid var(--gray-200);
      align-items: center;
      gap: 1rem;
    }

    .mobile-header-left {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .mobile-header .sync-status {
      margin-left: auto;
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

    .sidebar-overlay {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      z-index: 19;
      opacity: 0;
      transition: opacity 0.3s ease;
    }

    .sidebar-overlay.visible {
      display: block;
      opacity: 1;
    }

    .sidebar-close {
      display: none;
      position: absolute;
      top: 1rem;
      right: 1rem;
      background: transparent;
      border: none;
      color: white;
      font-size: 1.5rem;
      cursor: pointer;
      padding: 0.25rem;
      line-height: 1;
      transition: transform 0.2s ease;
    }

    .sidebar-close:hover {
      transform: scale(1.1);
    }

    /* Mobile styles */
    @media (max-width: 768px) {
      .app-layout {
        flex-direction: column;
      }

      .sidebar {
        position: absolute;
        top: 0;
        left: 0;
        bottom: 0;
        width: 240px;
        z-index: 20;
        transform: translateX(-100%);
      }

      .sidebar.open {
        transform: translateX(0);
      }

      .mobile-header {
        display: flex;
      }

      .mobile-header.editing {
        display: none;
      }

      .sidebar-close {
        display: block;
      }

      .sidebar-overlay {
        display: block;
        opacity: 0;
        pointer-events: none;
      }

      .sidebar-overlay.visible {
        opacity: 1;
        pointer-events: auto;
      }

      .top-bar {
        display: none;
      }

      .main-content {
        flex: 1;
        min-height: 0;
      }

      .mobile-search {
        display: block;
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
    this.searchQuery = "";
    this.selectedTags = [];
    this.loading = false;
    this.viewMode = "list";
    this.sidebarOpen = false;
    this.toasts = [];
    this.hasMore = false;
    this.loadingMore = false;
    this.pendingSyncCount = 0;
    this.syncStatus = "idle";

    // Get user info from global context (set by server)
    this.user = globalThis.user || null;

    // Store bound handlers for proper cleanup
    this._boundHandleBeforeUnload = this._handleBeforeUnload.bind(this);
    this._boundHandleSyncPending = this._handleSyncPending.bind(this);
    this._boundHandleSyncCompleted = this._handleSyncCompleted.bind(this);
    this._boundHandleSyncStarted = this._handleSyncStarted.bind(this);
    this._boundHandleSyncOffline = this._handleSyncOffline.bind(this);
    this._boundHandleSyncOnline = this._handleSyncOnline.bind(this);
    this._boundHandleRecoveryFound = this._handleRecoveryFound.bind(this);
  }

  connectedCallback() {
    super.connectedCallback();
    this.loadInitialData();
    this.setupEventListeners();
    this._setupNavigationGuards();
    this._setupSyncListeners();
    this._setupLiveSyncListeners();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._removeNavigationGuards();
    this._removeSyncListeners();
    this._removeLiveSyncListeners();
  }

  /**
   * Set up navigation guards to prevent data loss
   */
  _setupNavigationGuards() {
    globalThis.addEventListener("beforeunload", this._boundHandleBeforeUnload);
  }

  _removeNavigationGuards() {
    globalThis.removeEventListener("beforeunload", this._boundHandleBeforeUnload);
  }

  /**
   * Handle beforeunload event - warn about unsaved changes
   */
  async _handleBeforeUnload(event) {
    // Check if there are pending syncs
    if (globalThis.NotesApp && globalThis.NotesApp.getPendingSyncCount) {
      const pendingCount = await globalThis.NotesApp.getPendingSyncCount();
      if (pendingCount > 0) {
        event.preventDefault();
        event.returnValue =
          "You have unsaved changes that are still syncing. Are you sure you want to leave?";
        return event.returnValue;
      }
    }

    // Check if current editor has unsaved changes
    const editor = this.shadowRoot?.querySelector("note-editor");
    if (editor && editor.hasUnsavedChanges) {
      event.preventDefault();
      event.returnValue = "You have unsaved changes. Are you sure you want to leave?";
      return event.returnValue;
    }
  }

  /**
   * Set up sync manager event listeners
   */
  _setupSyncListeners() {
    document.addEventListener("sync-pending", this._boundHandleSyncPending);
    document.addEventListener("sync-completed", this._boundHandleSyncCompleted);
    document.addEventListener("sync-started", this._boundHandleSyncStarted);
    document.addEventListener("sync-offline", this._boundHandleSyncOffline);
    document.addEventListener("sync-online", this._boundHandleSyncOnline);
    document.addEventListener("sync-recovery-found", this._boundHandleRecoveryFound);
  }

  _removeSyncListeners() {
    document.removeEventListener("sync-pending", this._boundHandleSyncPending);
    document.removeEventListener("sync-completed", this._boundHandleSyncCompleted);
    document.removeEventListener("sync-started", this._boundHandleSyncStarted);
    document.removeEventListener("sync-offline", this._boundHandleSyncOffline);
    document.removeEventListener("sync-online", this._boundHandleSyncOnline);
    document.removeEventListener("sync-recovery-found", this._boundHandleRecoveryFound);
  }

  _setupLiveSyncListeners() {
    this._boundHandleNoteUpdatedWs = this._handleNoteUpdatedWs.bind(this);
    this._boundHandleSyncConflict = this._handleSyncConflict.bind(this);
    this._boundHandleReconnected = this._handleReconnected.bind(this);
    globalThis.NotesApp?.liveSync?.on("note-updated", this._boundHandleNoteUpdatedWs);
    globalThis.NotesApp?.liveSync?.on("reconnected", this._boundHandleReconnected);
    document.addEventListener("sync-conflict", this._boundHandleSyncConflict);
  }

  _removeLiveSyncListeners() {
    globalThis.NotesApp?.liveSync?.off("note-updated", this._boundHandleNoteUpdatedWs);
    globalThis.NotesApp?.liveSync?.off("reconnected", this._boundHandleReconnected);
    document.removeEventListener("sync-conflict", this._boundHandleSyncConflict);
  }

  async _handleNoteUpdatedWs(message) {
    const { noteId, updatedAt } = message;

    // Currently editing this note?
    if (this.viewMode === "edit" && this.currentNote?.id === noteId) {
      // Ignore our own update (timestamps match)
      if (this.currentNote.updated_at === updatedAt) return;

      const editor = this.shadowRoot?.querySelector("note-editor");
      if (editor && editor.hasUnsavedChanges) {
        this.showToast("This note was updated on another device. Save to overwrite, or reload the page.", "warning");
        return;
      }

      // No unsaved changes — auto-reload
      try {
        const result = await globalThis.NotesApp.getNote(noteId);
        this.currentNote = result.data;
        const idx = this.notes.findIndex((n) => n.id === noteId);
        if (idx !== -1) {
          this.notes[idx] = result.data;
          this.notes = [...this.notes];
        }
        this.showToast("Note updated from another device", "info");
      } catch (e) {
        console.error("Failed to reload note:", e);
      }
      return;
    }

    // Not editing this note — refresh list
    this.filterNotes();
  }

  async _handleReconnected() {
    // Re-fetch current note if editing (may have been updated while disconnected)
    if (this.viewMode === "edit" && this.currentNote) {
      const editor = this.shadowRoot?.querySelector("note-editor");
      if (editor && editor.hasUnsavedChanges) {
        this.showToast("Reconnected. You have unsaved changes — save to keep them.", "warning");
      } else {
        try {
          const result = await globalThis.NotesApp.getNote(this.currentNote.id);
          if (result.data.updated_at !== this.currentNote.updated_at) {
            this.currentNote = result.data;
            this.showToast("Note refreshed after reconnect", "info");
          }
        } catch (e) {
          console.error("Failed to refresh note after reconnect:", e);
        }
      }
    }

    // Refresh the note list to catch any changes
    this.filterNotes();
  }

  _handleSyncConflict(event) {
    const { noteId } = event.detail;
    if (this.currentNote?.id === noteId) {
      this.showToast("Save conflict — this note was updated elsewhere. Reload to get the latest version.", "warning");
    }
  }

  _handleSyncPending(event) {
    this.pendingSyncCount = event.detail.count;
    this.syncStatus = "pending";
  }

  _handleSyncCompleted() {
    this._updatePendingCount();
  }

  _handleSyncStarted() {
    this.syncStatus = "syncing";
  }

  _handleSyncOffline() {
    this.syncStatus = "offline";
  }

  _handleSyncOnline() {
    this.syncStatus = "idle";
    this._updatePendingCount();
  }

  _handleRecoveryFound(event) {
    const { drafts } = event.detail;
    if (drafts.length > 0) {
      this.showToast(`Found ${drafts.length} unsaved note(s) from previous session`, "info");
    }
  }

  async _updatePendingCount() {
    if (globalThis.NotesApp && globalThis.NotesApp.getPendingSyncCount) {
      this.pendingSyncCount = await globalThis.NotesApp.getPendingSyncCount();
      if (this.pendingSyncCount === 0) {
        this.syncStatus = "idle";
      }
    }
  }

  async loadInitialData() {
    this.loading = true;
    try {
      // Wait for NotesApp to be available
      await this.waitForNotesApp();

      const [notesResult, tagsResult] = await Promise.all([
        globalThis.NotesApp.getNotes(),
        globalThis.NotesApp.getTags(),
      ]);

      this.notes = notesResult.data?.notes || [];
      this.tags = tagsResult.data || [];
    } catch (error) {
      console.error("Failed to load initial data:", error);
      this.showToast("Failed to load data. Please refresh the page.", "error");
    } finally {
      this.loading = false;
    }
  }

  async loadTags() {
    try {
      const result = await globalThis.NotesApp.getTags();
      this.tags = result.data || [];
    } catch (error) {
      console.error("Failed to load tags:", error);
    }
  }

  async waitForNotesApp() {
    while (!globalThis.NotesApp || !globalThis.NotesApp.getNotes) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  setupEventListeners() {
    // Listen for global events
    document.addEventListener("focus-search", () => {
      this.shadowRoot.querySelector("search-bar")?.focus();
    });

    document.addEventListener("new-note", () => {
      this.createNewNote();
    });

    document.addEventListener("escape-pressed", () => {
      if (this.viewMode === "edit") {
        this.viewMode = "list";
        this.currentNote = null;
      }
      this.sidebarOpen = false;
    });

    document.addEventListener("show-toast", (event) => {
      this.showToast(event.detail.message, event.detail.type);
    });

    // Listen for component events
    this.addEventListener("toggle-sidebar", () => {
      this.toggleSidebar();
    });

    this.addEventListener("note-selected", async (event) => {
      // Save any pending changes before switching notes
      if (this.viewMode === "edit" && this.currentNote) {
        const editor = this.shadowRoot.querySelector("note-editor");
        if (editor && editor.hasUnsavedChanges) {
          await editor.autoSave();
        }
      }

      this.currentNote = event.detail.note;
      this.viewMode = "edit";
      this.sidebarOpen = false; // Close sidebar on mobile
    });

    this.addEventListener("note-created", (event) => {
      this.notes = [event.detail.note, ...this.notes];
      this.currentNote = event.detail.note;
      this.viewMode = "edit";
    });

    this.addEventListener("note-updated", async (event) => {
      const index = this.notes.findIndex((n) => n.id === event.detail.note.id);
      if (index !== -1) {
        this.notes[index] = event.detail.note;
        this.notes = [...this.notes]; // Trigger reactivity
      }
      this.currentNote = event.detail.note;

      // Refresh tags to update usage counts
      await this.loadTags();
    });

    this.addEventListener("load-more", () => {
      this.loadMoreNotes();
    });

    this.addEventListener("note-deleted", (event) => {
      this.notes = this.notes.filter((n) => n.id !== event.detail.noteId);
      if (this.currentNote?.id === event.detail.noteId) {
        this.currentNote = null;
        this.viewMode = "list";
      }
    });

    this.addEventListener("search-query", (event) => {
      this.searchQuery = event.detail.query;
      this.performSearch();
    });

    this.addEventListener("tags-selected", async (event) => {
      this.selectedTags = event.detail.tags;

      // When tags are selected, switch to list view to show filtered results
      if (this.selectedTags.length > 0) {
        // Save any pending changes before switching views
        if (this.viewMode === "edit" && this.currentNote) {
          const editor = this.shadowRoot.querySelector("note-editor");
          if (editor && editor.hasUnsavedChanges) {
            await editor.autoSave();
          }
        }

        this.viewMode = "list";
        this.currentNote = null;
      }

      this.filterNotes();
    });

    this.addEventListener("tag-created", (event) => {
      this.tags = [...this.tags, event.detail.tag];
    });

    this.addEventListener("tag-updated", (event) => {
      const index = this.tags.findIndex((t) => t.id === event.detail.tag.id);
      if (index !== -1) {
        this.tags[index] = event.detail.tag;
        this.tags = [...this.tags];
      }
    });

    this.addEventListener("tag-deleted", (event) => {
      this.tags = this.tags.filter((t) => t.id !== event.detail.tagId);
    });
  }

  async createNewNote() {
    try {
      // If we're currently editing a note, save any pending changes first
      if (this.viewMode === "edit" && this.currentNote) {
        const editor = this.shadowRoot.querySelector("note-editor");
        if (editor && editor.hasUnsavedChanges) {
          await editor.autoSave();
        }
      }

      const newNote = {
        title: "Untitled Note",
        content: "Start writing your note...",
        tags: [],
      };

      const result = await globalThis.NotesApp.createNote(newNote);
      this.dispatchEvent(
        new CustomEvent("note-created", {
          detail: { note: result.data },
        }),
      );
    } catch (error) {
      console.error("Failed to create note:", error);
      this.showToast("Failed to create note", "error");
    }
  }

  performSearch() {
    if (!this.searchQuery.trim()) {
      // If no search query, filter by tags only (or show all)
      this.filterNotes();
      return;
    }

    // Use filterNotes which handles both search and tag filtering
    this.filterNotes();
  }

  async filterNotes() {
    try {
      this.loading = true;
      this.hasMore = false;

      const hasSearchQuery = this.searchQuery && this.searchQuery.trim();
      const hasTagFilter = this.selectedTags.length > 0;

      if (hasSearchQuery && hasTagFilter) {
        // Both search and tags - use advanced search (expects tag IDs)
        const result = await globalThis.NotesApp.advancedSearch({
          query: this.searchQuery,
          tags: this.selectedTags.map((tag) => tag.id),
        });
        this.notes = result.data?.results || [];
        this.hasMore = result.meta?.hasMore || false;
        this.viewMode = "search";
      } else if (hasSearchQuery) {
        // Just search query
        const result = await globalThis.NotesApp.searchNotes(this.searchQuery);
        this.notes = result.data?.results || [];
        this.hasMore = result.meta?.hasMore || false;
        this.viewMode = "search";
      } else {
        // No search query, just filter by tags (or show all)
        const options = {};
        if (hasTagFilter) {
          options.tags = this.selectedTags.map((tag) => tag.id);
        }
        const result = await globalThis.NotesApp.getNotes(options);
        this.notes = result.data?.notes || [];
        this.hasMore = result.meta?.hasMore || false;
        this.viewMode = "list";
      }
      this.requestUpdate(); // Force re-render
    } catch (error) {
      console.error("Failed to filter notes:", error);
      this.showToast("Failed to filter notes", "error");
    } finally {
      this.loading = false;
    }
  }

  async loadMoreNotes() {
    if (this.loadingMore || !this.hasMore) return;

    try {
      this.loadingMore = true;
      const offset = this.notes.length;

      const hasSearchQuery = this.searchQuery && this.searchQuery.trim();
      const hasTagFilter = this.selectedTags.length > 0;

      let result;
      if (hasSearchQuery && hasTagFilter) {
        result = await globalThis.NotesApp.advancedSearch({
          query: this.searchQuery,
          tags: this.selectedTags.map((tag) => tag.id),
          offset,
        });
        this.notes = [...this.notes, ...(result.data?.results || [])];
      } else if (hasSearchQuery) {
        result = await globalThis.NotesApp.searchNotes(this.searchQuery, { offset });
        this.notes = [...this.notes, ...(result.data?.results || [])];
      } else {
        const options = { offset };
        if (hasTagFilter) {
          options.tags = this.selectedTags.map((tag) => tag.id);
        }
        result = await globalThis.NotesApp.getNotes(options);
        this.notes = [...this.notes, ...(result.data?.notes || [])];
      }

      this.hasMore = result.meta?.hasMore || false;
    } catch (error) {
      console.error("Failed to load more notes:", error);
      this.showToast("Failed to load more notes", "error");
    } finally {
      this.loadingMore = false;
    }
  }

  toggleSidebar() {
    this.sidebarOpen = !this.sidebarOpen;
  }

  closeSidebar() {
    this.sidebarOpen = false;
  }

  handleOverlayClick(e) {
    if (e.target.classList.contains("sidebar-overlay")) {
      this.closeSidebar();
    }
  }

  clearAllFilters() {
    this.searchQuery = "";
    this.selectedTags = [];
    this.viewMode = "list";

    // Clear search bar
    const searchBar = this.shadowRoot.querySelector("search-bar");
    if (searchBar) {
      searchBar.query = "";
    }

    // Clear tag manager selection
    const tagManager = this.shadowRoot.querySelector("tag-manager");
    if (tagManager) {
      tagManager.selectedTags = [];
    }

    // Reload all notes
    this.loadInitialData();
  }

  hasActiveFilters() {
    return (this.searchQuery && this.searchQuery.trim()) ||
      (this.selectedTags && this.selectedTags.length > 0);
  }

  async showAllNotes() {
    // If we're currently editing a note, save any pending changes first
    if (this.viewMode === "edit" && this.currentNote) {
      const editor = this.shadowRoot.querySelector("note-editor");
      if (editor && editor.hasUnsavedChanges) {
        await editor.autoSave();
      }
    }

    // Clear any active filters and show all notes
    this.selectedTags = [];
    this.searchQuery = "";
    this.viewMode = "list";
    this.currentNote = null;

    // Load fresh data to make sure we have all notes
    this.loadInitialData();

    // Close sidebar on mobile
    if (globalThis.innerWidth <= 768) {
      this.sidebarOpen = false;
    }
  }

  async logout() {
    try {
      await globalThis.NotesApp.logout();
    } catch (error) {
      console.error("Logout failed:", error);
      this.showToast("Logout failed", "error");
    }
  }

  showToast(message, type = "info") {
    const toast = { id: Date.now(), message, type };
    this.toasts = [...this.toasts, toast];

    // Auto-remove after 5 seconds
    setTimeout(() => {
      this.toasts = this.toasts.filter((t) => t.id !== toast.id);
    }, 5000);
  }

  removeToast(toastId) {
    this.toasts = this.toasts.filter((t) => t.id !== toastId);
  }

  /**
   * Handle closing the editor - note-editor.handleClose already saves and waits
   */
  _handleCloseEditor() {
    this.viewMode = "list";
    this.currentNote = null;
  }

  /**
   * Render sync status indicator
   */
  _renderSyncStatus() {
    if (this.syncStatus === "idle" && this.pendingSyncCount === 0) {
      return "";
    }

    const statusText = {
      syncing: "Syncing...",
      pending: `${this.pendingSyncCount} pending`,
      offline: "Offline",
      error: "Sync error",
    };

    const text = statusText[this.syncStatus] || "";
    if (!text) return "";

    return html`
      <div class="sync-status ${this.syncStatus}" title="${this._getSyncStatusTitle()}">
        <span class="sync-indicator"></span>
        ${text}
      </div>
    `;
  }

  /**
   * Get detailed sync status for tooltip
   */
  _getSyncStatusTitle() {
    switch (this.syncStatus) {
      case "syncing":
        return "Syncing changes to server...";
      case "pending":
        return `${this.pendingSyncCount} change(s) saved locally, waiting to sync`;
      case "offline":
        return "You are offline. Changes will sync when back online.";
      case "error":
        return "Some changes failed to sync. Will retry automatically.";
      default:
        return "";
    }
  }

  render() {
    return html`
      <div class="app-layout">
        <div class="mobile-header ${this.viewMode === "edit" ? "editing" : ""}">
          <div class="mobile-header-left">
            <button class="menu-toggle" @click="${this.toggleSidebar}">
              ☰
            </button>
            <h1 class="app-title">Notes</h1>
          </div>
          ${this._renderSyncStatus()}
        </div>

        <div class="sidebar-overlay ${this.sidebarOpen ? "visible" : ""}" @click="${this
          .handleOverlayClick}"></div>

        <aside class="sidebar ${this.sidebarOpen ? "open" : ""}">
          <div class="sidebar-header">
            <h1 class="app-title">※ Notes</h1>
            <button class="sidebar-close" @click="${this.closeSidebar}" aria-label="Close sidebar">
              ✕
            </button>
          </div>

          <div class="sidebar-content">
            <div class="mobile-search">
              <search-bar
                .query="${this.searchQuery}"
                @search-query="${(e) => {
                  this.searchQuery = e.detail.query;
                  this.performSearch();
                  this.sidebarOpen = false;
                }}"
              ></search-bar>
            </div>

            <button class="new-note-btn" @click="${this.createNewNote}">
              New Note
            </button>

            <div class="stats">
              <div class="stat clickable" @click="${this
                .showAllNotes}" title="Click to view all notes">
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
                .tags="${this.tags}"
                .selectedTags="${this.selectedTags}"
                .offline="${this.syncStatus === "offline"}"
              ></tag-manager>
            </div>
          </div>
        </aside>

        <main class="main-content">
          <div class="top-bar">
            <search-bar
              .query="${this.searchQuery}"
              @search-query="${(e) => this.searchQuery = e.detail.query}"
            ></search-bar>

            ${this.hasActiveFilters()
              ? html`
                <div class="active-filters">
                  <span class="filter-info">
                    ${this.searchQuery
                      ? html`
                        <span class="filter-tag">Search: "${this.searchQuery}"</span>
                      `
                      : ""} ${this.selectedTags.length > 0
                      ? html`
                        <span class="filter-tag">${this.selectedTags
                          .length} tag${this.selectedTags.length > 1 ? "s" : ""}</span>
                      `
                      : ""}
                  </span>
                  <button class="clear-filters-btn" @click="${this
                    .clearAllFilters}" title="Clear all filters">
                    Clear all
                  </button>
                </div>
              `
              : ""} ${this._renderSyncStatus()}

            <div class="user-menu">
              ${this.user
                ? html`
                  <img class="user-avatar" src="${this.user.picture}" alt="${this.user.name}">
                  <span class="user-name">${this.user.name}</span>
                  <button class="logout-btn" @click="${this.logout}">Logout</button>
                `
                : ""}
            </div>
          </div>

          <div class="content-area">
            ${this.loading
              ? html`
                <div class="loading-overlay">
                  <div class="loading"></div>
                </div>
              `
              : ""} ${this.viewMode === "edit" && this.currentNote
              ? html`
                <note-editor
                  .note="${this.currentNote}"
                  .tags="${this.tags}"
                  @note-updated="${(e) => this.currentNote = e.detail.note}"
                  @close-editor="${this._handleCloseEditor}"
                ></note-editor>
              `
              : html`
                <note-list
                  .notes="${this.notes}"
                  .searchQuery="${this.searchQuery}"
                  .selectedTags="${this.selectedTags}"
                  .hasMore="${this.hasMore}"
                  .loadingMore="${this.loadingMore}"
                ></note-list>
              `}
          </div>
        </main>
      </div>

      <div class="toast-container">
        ${this.toasts.map((toast) =>
          html`
            <div class="toast ${toast.type}" @click="${() => this.removeToast(toast.id)}">
              ${toast.message}
            </div>
          `
        )}
      </div>
    `;
  }
}

customElements.define("notes-app", NotesApp);
