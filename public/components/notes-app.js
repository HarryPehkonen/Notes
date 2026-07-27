/**
 * Main Notes App Component
 * Root component that manages the overall app layout and state
 */

import { css, html, LitElement } from "lit";
import { icons } from "../utils/icons.js";

class NotesApp extends LitElement {
  static properties = {
    notes: { type: Array },
    tags: { type: Array },
    currentNote: { type: Object },
    searchQuery: { type: String },
    selectedTags: { type: Array },
    pinnedOnly: { type: Boolean },
    loading: { type: Boolean },
    viewMode: { type: String }, // 'list', 'edit', 'search'
    sidebarOpen: { type: Boolean }, // mobile nav drawer
    flyoutOpen: { type: Boolean }, // desktop tags flyout
    userMenuOpen: { type: Boolean },
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
      position: relative;
    }

    .logo-mark {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      background: var(--primary);
      color: var(--white);
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: var(--font-serif);
      font-size: 1.1rem;
      flex-shrink: 0;
    }

    /* ---------- Desktop rail ---------- */
    .rail {
      display: none;
      width: 68px;
      flex-shrink: 0;
      background: var(--white);
      border-right: 1px solid var(--gray-200);
      flex-direction: column;
      align-items: center;
      padding: 0.9rem 0;
      gap: 0.35rem;
      position: relative;
    }

    .rail .logo-mark {
      margin-bottom: 0.6rem;
    }

    .rail-btn {
      width: 42px;
      height: 42px;
      border-radius: 10px;
      border: none;
      background: transparent;
      color: var(--gray-500);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: background 0.15s, color 0.15s;
    }

    .rail-btn svg {
      width: 19px;
      height: 19px;
    }

    .rail-btn:hover {
      background: var(--gray-100);
      color: var(--gray-800);
    }

    .rail-btn.active {
      background: var(--primary-light);
      color: var(--primary-dark);
    }

    .rail-btn.accent {
      color: var(--primary);
    }

    .rail-btn.accent:hover {
      background: var(--primary-light);
      color: var(--primary-dark);
    }

    .rail-spacer {
      flex: 1;
    }

    .rail-footer {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.6rem;
    }

    .sync-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--gray-300);
    }

    .sync-dot.syncing,
    .sync-dot.pending {
      background: var(--info);
      animation: syncPulse 1.5s infinite;
    }

    .sync-dot.offline {
      background: var(--gray-400);
    }

    .sync-dot.error {
      background: var(--error);
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

    .avatar-btn {
      width: 34px;
      height: 34px;
      border-radius: 50%;
      border: none;
      padding: 0;
      cursor: pointer;
      overflow: hidden;
      background: var(--primary-light);
      flex-shrink: 0;
    }

    .avatar-btn img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    .avatar-btn.sm {
      width: 26px;
      height: 26px;
    }

    .avatar-btn.static {
      display: block;
      cursor: default;
    }

    .user-popover {
      position: absolute;
      left: 60px;
      bottom: 0.75rem;
      background: var(--white);
      border: 1px solid var(--gray-200);
      border-radius: 0.6rem;
      box-shadow: var(--shadow-lg);
      padding: 0.6rem;
      min-width: 170px;
      z-index: 25;
    }

    .user-popover-name {
      font-size: 0.85rem;
      font-weight: 500;
      color: var(--gray-800);
      padding: 0.3rem 0.5rem 0.6rem;
      border-bottom: 1px solid var(--gray-200);
      margin-bottom: 0.4rem;
    }

    .user-popover-logout {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      width: 100%;
      padding: 0.4rem 0.5rem;
      background: transparent;
      border: none;
      border-radius: 0.4rem;
      font-size: 0.85rem;
      color: var(--gray-700);
      cursor: pointer;
      text-align: left;
    }

    .user-popover-logout svg {
      width: 16px;
      height: 16px;
      color: var(--gray-500);
    }

    .user-popover-logout:hover {
      background: var(--gray-100);
    }

    .popover-scrim {
      position: fixed;
      inset: 0;
      z-index: 24;
      background: transparent;
    }

    /* ---------- Desktop tags flyout ---------- */
    .flyout-scrim {
      position: fixed;
      inset: 0;
      z-index: 18;
      background: transparent;
    }

    .flyout {
      width: 240px;
      flex-shrink: 0;
      background: var(--white);
      border-right: 1px solid var(--gray-200);
      padding: 1.1rem 1rem;
      overflow-y: auto;
      z-index: 19;
      position: relative;
    }

    .flyout-header {
      font-family: var(--font-mono);
      font-size: 0.68rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--gray-500);
      margin-bottom: 0.8rem;
    }

    .icon-btn {
      width: 40px;
      height: 40px;
      border: none;
      background: transparent;
      border-radius: 8px;
      color: var(--gray-600);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      flex-shrink: 0;
      -webkit-tap-highlight-color: transparent;
    }

    .icon-btn svg {
      width: 18px;
      height: 18px;
    }

    @media (hover: hover) {
      .icon-btn:hover {
        background: var(--gray-100);
        color: var(--gray-900);
      }
    }

    .icon-btn:active {
      background: var(--gray-200);
      color: var(--gray-900);
    }

    /* The hamburger and "new note" buttons live in the libbar but are only
      shown on mobile - on desktop the rail already provides both. */
    .libbar-mobile-only {
      display: none;
    }

    /* ---------- Mobile-only nav drawer ---------- */
    .drawer {
      display: none;
    }

    .drawer-overlay {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(15, 20, 18, 0.45);
      z-index: 19;
      opacity: 0;
      transition: opacity 0.25s ease;
      pointer-events: none;
    }

    .drawer-overlay.visible {
      opacity: 1;
      pointer-events: auto;
    }

    .drawer-header {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      padding: 1rem;
      border-bottom: 1px solid var(--gray-200);
    }

    .drawer-title {
      font-family: var(--font-serif);
      font-size: 1.2rem;
      color: var(--gray-900);
      flex: 1;
    }

    .drawer-content {
      flex: 1;
      overflow-y: auto;
      padding: 1rem;
    }

    .new-note-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      width: 100%;
      padding: 0.65rem;
      min-height: 44px;
      background: var(--primary);
      color: var(--white);
      border: none;
      border-radius: 0.5rem;
      font-weight: 500;
      font-size: 0.9rem;
      cursor: pointer;
      margin-bottom: 1.1rem;
    }

    .new-note-btn svg {
      width: 16px;
      height: 16px;
    }

    .new-note-btn:hover {
      background: var(--primary-dark);
    }

    .nav-list {
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
      margin-bottom: 1.3rem;
    }

    .nav-row {
      display: flex;
      align-items: center;
      gap: 0.65rem;
      padding: 0.55rem 0.6rem;
      min-height: 44px;
      border: none;
      background: transparent;
      border-radius: 0.5rem;
      font-size: 0.9rem;
      color: var(--gray-700);
      cursor: pointer;
      text-align: left;
      width: 100%;
      -webkit-tap-highlight-color: transparent;
    }

    .nav-row svg {
      width: 17px;
      height: 17px;
      color: var(--gray-500);
      flex-shrink: 0;
    }

    .nav-row:hover {
      background: var(--gray-100);
    }

    .nav-row.active {
      background: var(--primary-light);
      color: var(--primary-dark);
    }

    .nav-row.active svg {
      color: var(--primary-dark);
    }

    .nav-row .cnt {
      margin-left: auto;
      font-family: var(--font-mono);
      font-size: 0.72rem;
      color: var(--gray-400);
    }

    .nav-section-title {
      font-family: var(--font-mono);
      font-size: 0.68rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--gray-500);
      margin-bottom: 0.6rem;
    }

    .drawer-footer {
      border-top: 1px solid var(--gray-200);
      padding: 0.85rem 1rem;
    }

    .drawer-user {
      display: flex;
      align-items: center;
      gap: 0.6rem;
    }

    .drawer-user .user-name {
      flex: 1;
      font-size: 0.85rem;
      color: var(--gray-700);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /* ---------- Library bar (always visible, mobile + desktop) ---------- */
    .main-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      min-width: 0;
    }

    .libbar {
      display: flex;
      align-items: center;
      gap: 0.85rem;
      padding: 0.75rem 1.25rem;
      border-bottom: 1px solid var(--gray-200);
      background: var(--white);
      flex-wrap: wrap;
    }

    .crumb {
      font-family: var(--font-mono);
      font-size: 0.75rem;
      color: var(--gray-500);
      white-space: nowrap;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .clear-btn {
      display: flex;
      align-items: center;
      gap: 0.3rem;
      padding: 0.3rem 0.65rem;
      background: var(--gray-100);
      border: 1px solid var(--gray-200);
      border-radius: 999px;
      font-size: 0.78rem;
      color: var(--gray-600);
      cursor: pointer;
      white-space: nowrap;
    }

    .clear-btn svg {
      width: 13px;
      height: 13px;
    }

    .clear-btn:hover {
      background: var(--gray-200);
      color: var(--gray-900);
    }

    .clear-btn-label {
      display: inline;
    }

    .libbar-spacer {
      flex: 1;
    }

    .sync-status {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.25rem 0.75rem;
      border-radius: 1rem;
      font-size: 0.75rem;
      font-weight: 500;
      white-space: nowrap;
    }

    .sync-status.idle {
      display: none;
    }

    .sync-status.syncing {
      background: var(--info-light, #e0f2fe);
      color: var(--info);
    }

    .sync-status.pending {
      background: var(--gray-100);
      color: var(--gray-600);
    }

    .sync-status.offline {
      background: var(--gray-100);
      color: var(--gray-600);
    }

    .sync-status.error {
      background: var(--error-light, #fee2e2);
      color: var(--error);
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

    .content-area {
      flex: 1;
      overflow: hidden;
      position: relative;
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

    /* ---------- Mobile ---------- */
    @media (max-width: 768px) {
      .app-layout {
        flex-direction: column;
      }

      .rail {
        display: none !important;
      }

      .drawer {
        display: flex;
        position: absolute;
        top: 0;
        left: 0;
        bottom: 0;
        width: 250px;
        max-width: 80vw;
        z-index: 20;
        background: var(--white);
        flex-direction: column;
        transform: translateX(-100%);
        transition: transform 0.25s ease;
      }

      .drawer.open {
        transform: translateX(0);
      }

      .drawer-overlay {
        display: block;
      }

      /*
      * The mobile header used to be two stacked bars - a logo strip and then
      * a wrapped libbar - which ate ~160px before a single note was visible.
      * On mobile it collapses into one row: [menu] [search] [clear] [new note].
      * The breadcrumb is dropped because <note-list>'s own header already
      * states the active filter ("5 Notes matching ... with 2 tags").
      */
      .libbar {
        padding: 0.5rem 0.75rem;
        gap: 0.5rem;
      }

      .libbar-mobile-only {
        display: flex;
      }

      /* Phone-width screens are touch in practice, so meet the 44px minimum
        here as well as under (pointer: coarse) below. */
      .icon-btn {
        width: 44px;
        height: 44px;
      }

      .avatar-btn.sm {
        width: 34px;
        height: 34px;
      }

      .crumb,
      .libbar-spacer {
        display: none;
      }

      search-bar {
        flex: 1 1 120px;
        min-width: 0;
      }

      .clear-btn {
        width: 44px;
        height: 44px;
        padding: 0;
        justify-content: center;
        border-radius: 8px;
      }

      .clear-btn-label {
        display: none;
      }

      .clear-btn svg {
        width: 16px;
        height: 16px;
      }
    }

    /* Touch devices: meet the 44px minimum tap target regardless of width. */
    @media (pointer: coarse) {
      .icon-btn {
        width: 44px;
        height: 44px;
      }
    }

    /* ---------- Desktop ---------- */
    @media (min-width: 769px) {
      .rail {
        display: flex;
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
    this.pinnedOnly = false;
    this.loading = false;
    this.viewMode = "list";
    this.sidebarOpen = false;
    this.flyoutOpen = false;
    this.userMenuOpen = false;
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
        this.showToast(
          "This note was updated on another device. Save to overwrite, or reload the page.",
          "warning",
        );
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
      this.showToast(
        "Save conflict — this note was updated elsewhere. Reload to get the latest version.",
        "warning",
      );
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
      this.flyoutOpen = false;
      this.userMenuOpen = false;
    });

    document.addEventListener("show-toast", (event) => {
      this.showToast(event.detail.message, event.detail.type);
    });

    // Listen for component events
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
      this.sidebarOpen = false; // Close drawer on mobile
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

      // Blank on purpose - the editor's placeholders prompt the user instead
      // of real text they would have to select and delete first.
      const newNote = {
        title: "",
        content: "",
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
      // If no search query, filter by tags/pinned only (or show all)
      this.filterNotes();
      return;
    }

    // Use filterNotes which handles search, tag, and pinned filtering
    this.filterNotes();
  }

  /**
   * Re-fetch notes for the current combination of search text, tag
   * selection, and pinned-only filter. Routes to whichever endpoint
   * supports that combination: advancedSearch when a query is paired with
   * tags and/or pinned, plain searchNotes for query-only, and getNotes for
   * tag/pinned filtering with no search text.
   */
  async filterNotes() {
    try {
      this.loading = true;
      this.hasMore = false;

      const hasSearchQuery = this.searchQuery && this.searchQuery.trim();
      const hasTagFilter = this.selectedTags.length > 0;
      const hasPinnedFilter = this.pinnedOnly;

      if (hasSearchQuery && (hasTagFilter || hasPinnedFilter)) {
        // Search combined with tags and/or pinned - use advanced search
        const result = await globalThis.NotesApp.advancedSearch({
          query: this.searchQuery,
          tags: this.selectedTags.map((tag) => tag.id),
          isPinned: hasPinnedFilter || undefined,
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
        // No search query, filter by tags/pinned (or show all)
        const options = {};
        if (hasTagFilter) {
          options.tags = this.selectedTags.map((tag) => tag.id);
        }
        if (hasPinnedFilter) {
          options.pinned = true;
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

  /** Pagination for the "Load more" button - mirrors filterNotes()'s routing logic with an offset. */
  async loadMoreNotes() {
    if (this.loadingMore || !this.hasMore) return;

    try {
      this.loadingMore = true;
      const offset = this.notes.length;

      const hasSearchQuery = this.searchQuery && this.searchQuery.trim();
      const hasTagFilter = this.selectedTags.length > 0;
      const hasPinnedFilter = this.pinnedOnly;

      let result;
      if (hasSearchQuery && (hasTagFilter || hasPinnedFilter)) {
        result = await globalThis.NotesApp.advancedSearch({
          query: this.searchQuery,
          tags: this.selectedTags.map((tag) => tag.id),
          isPinned: hasPinnedFilter || undefined,
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
        if (hasPinnedFilter) {
          options.pinned = true;
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

  /**
   * Toggle the "Pinned" quick filter from the rail/drawer nav.
   * Mirrors the tag-filter flow: saves any in-progress edit first, then
   * switches to list view and re-queries with the pinned flag applied.
   */
  async togglePinnedFilter() {
    // Save any pending changes before switching views
    if (this.viewMode === "edit" && this.currentNote) {
      const editor = this.shadowRoot.querySelector("note-editor");
      if (editor && editor.hasUnsavedChanges) {
        await editor.autoSave();
      }
    }

    this.pinnedOnly = !this.pinnedOnly;
    this.flyoutOpen = false;
    this.viewMode = "list";
    this.currentNote = null;
    this.sidebarOpen = false;
    this.filterNotes();
  }

  /**
   * Open or close a desktop-only flyout panel by name (currently just "tags").
   * Passing the same name again closes it; opening one closes the user menu
   * so only one popover is ever visible at a time.
   */
  toggleFlyout(name) {
    this.flyoutOpen = this.flyoutOpen === name ? false : name;
    this.userMenuOpen = false;
  }

  /** Toggle the small account popover anchored to the rail avatar. */
  toggleUserMenu() {
    this.userMenuOpen = !this.userMenuOpen;
    this.flyoutOpen = false;
  }

  /** Open/close the mobile-only nav drawer (hamburger menu). */
  toggleSidebar() {
    this.sidebarOpen = !this.sidebarOpen;
  }

  closeSidebar() {
    this.sidebarOpen = false;
  }

  /** Clicking the dimmed backdrop behind the mobile drawer closes it. */
  handleOverlayClick() {
    this.closeSidebar();
  }

  /**
   * Reset every active filter (search text, tag selection, pinned-only) and
   * reload the unfiltered note list. Also resets both <tag-manager> instances
   * (one lives in the desktop flyout, one in the mobile drawer) since either
   * could hold a stale selection.
   */
  clearAllFilters() {
    this.searchQuery = "";
    this.selectedTags = [];
    this.pinnedOnly = false;
    this.viewMode = "list";

    // Clear search bar
    const searchBar = this.shadowRoot.querySelector("search-bar");
    if (searchBar) {
      searchBar.query = "";
    }

    // Clear tag manager selection (rendered in both the flyout and the drawer)
    this.shadowRoot.querySelectorAll("tag-manager").forEach((tagManager) => {
      tagManager.selectedTags = [];
    });

    // Reload all notes
    this.loadInitialData();
  }

  /** Whether any of search text, tag selection, or the pinned filter is active. */
  hasActiveFilters() {
    return !!(
      (this.searchQuery && this.searchQuery.trim()) ||
      (this.selectedTags && this.selectedTags.length > 0) ||
      this.pinnedOnly
    );
  }

  /**
   * Build the short breadcrumb-style label shown in the libbar
   * (e.g. "Pinned · Recipes · "shakshuka"", or "All notes" when nothing is filtered).
   */
  _libraryLabel() {
    const parts = [];
    if (this.pinnedOnly) parts.push("Pinned");
    if (this.selectedTags.length === 1) {
      parts.push(this.selectedTags[0].name);
    } else if (this.selectedTags.length > 1) {
      parts.push(`${this.selectedTags.length} tags`);
    }
    if (this.searchQuery && this.searchQuery.trim()) {
      parts.push(`"${this.searchQuery.trim()}"`);
    }
    return parts.length > 0 ? parts.join(" · ") : "All notes";
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
    this.pinnedOnly = false;
    this.viewMode = "list";
    this.currentNote = null;
    this.flyoutOpen = false;

    // Load fresh data to make sure we have all notes
    this.loadInitialData();

    // Close drawer on mobile
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
   * Render sync status indicator (libbar)
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
        return "Synced";
    }
  }

  /**
   * Render the user's avatar button for the desktop rail footer. Clicking it
   * opens the account popover, which is rendered inside the rail.
   */
  _renderAvatar() {
    if (!this.user) return "";
    return html`
      <button
        class="avatar-btn"
        @click="${this.toggleUserMenu}"
        title="${this.user.name}"
      >
        <img src="${this.user.picture}" alt="${this.user.name}">
      </button>
    `;
  }

  /**
   * Avatar for the mobile drawer footer. Deliberately not a button: the
   * account popover it used to open lives inside the rail, which is
   * display:none on mobile, so tapping it did nothing at all. Log out sits
   * next to it in the same footer, so this is just identification.
   */
  _renderDrawerAvatar() {
    if (!this.user) return "";
    return html`
      <span class="avatar-btn sm static">
        <img src="${this.user.picture}" alt="">
      </span>
    `;
  }

  render() {
    return html`
      <div class="app-layout">
        <div
          class="drawer-overlay ${this.sidebarOpen ? "visible" : ""}"
          @click="${this.handleOverlayClick}"
        >
        </div>

        <aside class="drawer ${this.sidebarOpen ? "open" : ""}">
          <div class="drawer-header">
            <span class="logo-mark">n</span>
            <span class="drawer-title">Notes</span>
            <button class="icon-btn" @click="${this.closeSidebar}" aria-label="Close menu">
              ${icons.close}
            </button>
          </div>

          <div class="drawer-content">
            <button class="new-note-btn" @click="${this.createNewNote}">
              ${icons.plus} New note
            </button>

            <nav class="nav-list">
              <button
                class="nav-row ${!this.hasActiveFilters() ? "active" : ""}"
                @click="${this.showAllNotes}"
              >
                ${icons.home}<span>Home</span><span class="cnt">${this.notes.length}</span>
              </button>
              <button
                class="nav-row ${this.pinnedOnly ? "active" : ""}"
                @click="${this.togglePinnedFilter}"
              >
                ${icons.pin}<span>Pinned</span>
              </button>
            </nav>

            <div class="nav-section-title">Tags</div>
            <tag-manager
              .tags="${this.tags}"
              .selectedTags="${this.selectedTags}"
              .offline="${this.syncStatus === "offline"}"
            ></tag-manager>
          </div>

          <div class="drawer-footer">
            ${this.user
              ? html`
                <div class="drawer-user">
                  ${this._renderDrawerAvatar()}
                  <span class="user-name">${this.user.name}</span>
                  <button class="icon-btn" @click="${this.logout}" title="Log out">
                    ${icons.logout}
                  </button>
                </div>
              `
              : ""}
          </div>
        </aside>

        <nav class="rail">
          <span class="logo-mark">n</span>
          <button
            class="rail-btn ${!this.hasActiveFilters() ? "active" : ""}"
            @click="${this.showAllNotes}"
            title="Home"
          >
            ${icons.home}
          </button>
          <button
            class="rail-btn ${this.pinnedOnly ? "active" : ""}"
            @click="${this.togglePinnedFilter}"
            title="Pinned"
          >
            ${icons.pin}
          </button>
          <button
            class="rail-btn ${this.flyoutOpen === "tags" ? "active" : ""}"
            @click="${() => this.toggleFlyout("tags")}"
            title="Tags"
          >
            ${icons.hash}
          </button>

          <div class="rail-spacer"></div>

          <button class="rail-btn accent" @click="${this.createNewNote}" title="New note">
            ${icons.plus}
          </button>

          <div class="rail-footer">
            <span
              class="sync-dot ${this.syncStatus}"
              title="${this._getSyncStatusTitle()}"
            ></span>
            ${this._renderAvatar()}
          </div>

          ${this.userMenuOpen
            ? html`
              <div class="popover-scrim" @click="${() => this.userMenuOpen = false}"></div>
              <div class="user-popover">
                <div class="user-popover-name">${this.user?.name}</div>
                <button class="user-popover-logout" @click="${this.logout}">
                  ${icons.logout} Log out
                </button>
              </div>
            `
            : ""}
        </nav>

        ${this.flyoutOpen === "tags"
          ? html`
            <div class="flyout-scrim" @click="${() => this.flyoutOpen = false}"></div>
            <div class="flyout">
              <div class="flyout-header">Tags</div>
              <tag-manager
                .tags="${this.tags}"
                .selectedTags="${this.selectedTags}"
                .offline="${this.syncStatus === "offline"}"
              ></tag-manager>
            </div>
          `
          : ""}

        <main class="main-content">
          ${this.viewMode !== "edit"
            ? html`
              <div class="libbar">
                <button
                  class="icon-btn libbar-mobile-only"
                  @click="${this.toggleSidebar}"
                  aria-label="Open menu"
                >
                  ${icons.menu}
                </button>
                <span class="crumb">${this._libraryLabel()}</span>
                <search-bar
                  .query="${this.searchQuery}"
                  @search-query="${(e) => {
                    this.searchQuery = e.detail.query;
                    this.performSearch();
                  }}"
                ></search-bar>
                ${this.hasActiveFilters()
                  ? html`
                    <button
                      class="clear-btn"
                      @click="${this.clearAllFilters}"
                      title="Clear all filters"
                      aria-label="Clear all filters"
                    >
                      ${icons.close}<span class="clear-btn-label">Clear</span>
                    </button>
                  `
                  : ""}
                <div class="libbar-spacer"></div>
                ${this._renderSyncStatus()}
                <button
                  class="icon-btn libbar-mobile-only"
                  @click="${this.createNewNote}"
                  aria-label="New note"
                >
                  ${icons.plus}
                </button>
              </div>
            `
            : ""}

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
