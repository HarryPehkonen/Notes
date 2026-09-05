/**
 * Note Editor Component
 * Uses SyncManager for reliable saves with offline support
 * Supports Markdown preview and version history
 */
import { css, html, LitElement } from "lit";
import { unsafeHTML } from "https://cdn.jsdelivr.net/npm/lit@3.1.0/directives/unsafe-html.js/+esm";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { icons } from "../utils/icons.js";
import { parseCheckboxTokens, toggleCheckbox, tokenizeCheckboxes } from "../utils/checkboxes.js";
import { isSameNoteUpdate, resolveSaveContent } from "../utils/editor-state.js";
import { checkboxesToPrintGlyphs, printDocumentTitle } from "../utils/print.js";
import { createInertHtmlRenderer } from "../utils/inert-html.js";

// Configure marked for safe rendering. Raw HTML typed into a note is shown
// as inert literal text, never interpreted (audit #10); DOMPurify below
// stays as a second layer behind that.
marked.use({
  breaks: true, // Convert \n to <br>
  gfm: true, // GitHub Flavored Markdown
  renderer: createInertHtmlRenderer(),
});

export class NoteEditor extends LitElement {
  static properties = {
    note: { type: Object },
    tags: { type: Array },
    loading: { type: Boolean },
    selectedTags: { type: Array },
    saveStatus: { type: String }, // 'saved', 'saving', 'unsaved', 'pending', 'error'
    hasUnsavedChanges: { type: Boolean },
    pendingCount: { type: Number },
    previewMode: { type: Boolean },
    uploadingImage: { type: Boolean },
    historyOpen: { type: Boolean },
    versions: { type: Array },
    loadingVersions: { type: Boolean },
    restoringVersionId: { type: Number },
    printing: { type: Boolean },
  };

  static styles = css`
    :host {
      display: block;
      height: 100%;
      background: var(--white);
    }

    .editor-container {
      display: flex;
      flex-direction: column;
      height: 100%;
    }

    /* ---------- Sticky top bar ---------- */
    .topbar {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.6rem 1rem;
      border-bottom: 1px solid var(--gray-200);
      background: var(--white);
      flex-shrink: 0;
      position: relative;
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
      .icon-btn:hover:not(:disabled) {
        background: var(--gray-100);
        color: var(--gray-900);
      }
    }

    .icon-btn:active:not(:disabled) {
      background: var(--gray-200);
      color: var(--gray-900);
    }

    .icon-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .icon-btn.active {
      background: var(--primary-light);
      color: var(--primary-dark);
    }

    .icon-btn.uploading {
      color: var(--info);
    }

    /* A labeled button, for actions whose icon alone would be a guess. */
    .text-btn {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      height: 40px;
      padding: 0 0.7rem;
      border: 1px solid var(--gray-200);
      background: var(--white);
      border-radius: 8px;
      color: var(--gray-700);
      font-family: inherit;
      font-size: 0.85rem;
      white-space: nowrap;
      cursor: pointer;
      flex-shrink: 0;
      -webkit-tap-highlight-color: transparent;
    }

    .text-btn svg {
      width: 18px;
      height: 18px;
    }

    @media (hover: hover) {
      .text-btn:hover {
        background: var(--gray-100);
        color: var(--gray-900);
      }
    }

    .text-btn:active {
      background: var(--gray-200);
      color: var(--gray-900);
    }

    .crumb {
      font-family: var(--font-mono);
      font-size: 0.75rem;
      color: var(--gray-500);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .topbar-spacer {
      flex: 1;
    }

    .save-pill {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.25rem 0.65rem;
      border-radius: 999px;
      font-size: 0.72rem;
      font-family: var(--font-mono);
      white-space: nowrap;
      background: var(--gray-100);
      color: var(--gray-600);
      min-width: 0;
      overflow: hidden;
    }

    .save-pill .dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: currentColor;
      flex-shrink: 0;
    }

    .save-pill .save-label {
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .save-pill.saved {
      background: var(--primary-light);
      color: var(--primary-dark);
    }

    .save-pill.saving,
    .save-pill.pending {
      background: var(--gray-100);
      color: var(--info);
    }

    .save-pill.saving .dot,
    .save-pill.pending .dot {
      animation: pulse 1.5s infinite;
    }

    .save-pill.unsaved {
      color: var(--warning);
    }

    .save-pill.error {
      background: var(--error-light, #fee2e2);
      color: var(--error);
    }

    @keyframes pulse {
      0%,
      100% {
        opacity: 1;
      }
      50% {
        opacity: 0.5;
      }
    }

    .hidden-file-input {
      display: none;
    }

    /* ---------- Version history panel ---------- */
    .history-scrim {
      position: fixed;
      inset: 0;
      z-index: 14;
      background: transparent;
    }

    .history-panel {
      position: absolute;
      top: calc(100% + 0.4rem);
      right: 1rem;
      width: 300px;
      max-height: 360px;
      overflow-y: auto;
      background: var(--white);
      border: 1px solid var(--gray-200);
      border-radius: 0.6rem;
      box-shadow: var(--shadow-lg);
      z-index: 15;
      padding: 0.5rem;
    }

    .history-title {
      font-family: var(--font-mono);
      font-size: 0.68rem;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--gray-500);
      padding: 0.4rem 0.5rem 0.6rem;
    }

    .history-empty {
      padding: 1rem 0.5rem;
      font-size: 0.85rem;
      color: var(--gray-500);
      text-align: center;
    }

    .history-row {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      padding: 0.5rem;
      border-radius: 0.4rem;
    }

    .history-row:hover {
      background: var(--gray-50);
    }

    .history-info {
      flex: 1;
      min-width: 0;
    }

    .history-version {
      font-size: 0.85rem;
      color: var(--gray-800);
      font-weight: 500;
    }

    .history-date {
      font-size: 0.72rem;
      color: var(--gray-500);
      font-family: var(--font-mono);
    }

    .history-restore-btn {
      padding: 0.3rem 0.6rem;
      background: var(--gray-100);
      border: 1px solid var(--gray-300);
      border-radius: 0.4rem;
      font-size: 0.75rem;
      color: var(--gray-700);
      cursor: pointer;
      flex-shrink: 0;
    }

    .history-restore-btn:hover:not(:disabled) {
      background: var(--gray-200);
    }

    .history-restore-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    /* ---------- Canvas ---------- */
    .canvas {
      flex: 1;
      overflow-y: auto;
      display: flex;
      justify-content: center;
      padding: 2rem 1.25rem 3rem;
    }

    .canvas-col {
      width: 100%;
      max-width: 680px;
      display: flex;
      flex-direction: column;
    }

    .doc-title {
      width: 100%;
      border: none;
      background: transparent;
      font-family: var(--font-serif);
      font-size: 1.9rem;
      color: var(--gray-900);
      padding: 0;
      margin-bottom: 0.6rem;
    }

    .doc-title:focus {
      outline: none;
    }

    .doc-title::placeholder {
      color: var(--gray-400);
    }

    .doc-meta {
      font-family: var(--font-mono);
      font-size: 0.72rem;
      color: var(--gray-400);
      margin-bottom: 1rem;
    }

    .doc-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
      margin-bottom: 1.5rem;
    }

    .tag-chip {
      display: inline-flex;
      align-items: center;
      padding: 0.25rem 0.7rem;
      background: var(--gray-100);
      border: 1px solid var(--gray-200);
      border-radius: 1rem;
      font-size: 0.8rem;
      color: var(--gray-700);
      cursor: pointer;
      transition: all 0.15s;
    }

    .tag-chip:hover {
      border-color: var(--gray-400);
    }

    .tag-chip.selected {
      background: var(--primary);
      color: var(--white);
      border-color: var(--primary);
    }

    .tag-color-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      margin-right: 0.45rem;
    }

    .doc-body {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-height: 0;
    }

    /*
    * The textarea used to be height:100% with its own scrollbar, which made
    * the editor a scroller inside a scroller - on a phone you could not
    * flick-scroll a long note reliably, and the caret regularly ended up
    * under the on-screen keyboard because the browser can only auto-scroll
    * the outer document. It now grows to fit its content (see
    * _autoGrowTextarea) so .canvas is the single scroller and the caret
    * stays in normal document flow.
    */
    .content-textarea {
      width: 100%;
      flex: 1 0 auto;
      min-height: 45vh;
      overflow-y: hidden;
      border: none;
      background: transparent;
      font-family: var(--font-family);
      /* >= 16px, or iOS Safari zooms in on focus */
      font-size: 1rem;
      line-height: 1.75;
      color: var(--gray-900);
      resize: none;
      padding: 0;
    }

    .content-textarea:focus {
      outline: none;
    }

    .content-textarea::placeholder {
      color: var(--gray-400);
    }

    .markdown-preview {
      min-height: 45vh;
      line-height: 1.75;
      color: var(--gray-900);
      /* Long URLs and code spans must not push the page wider than the phone */
      overflow-wrap: anywhere;
    }

    .markdown-preview h1 {
      font-family: var(--font-serif);
      font-size: 1.6rem;
      font-weight: 400;
      margin: 1.5rem 0 1rem 0;
      padding-bottom: 0.5rem;
      border-bottom: 1px solid var(--gray-200);
    }

    .markdown-preview h2 {
      font-family: var(--font-serif);
      font-size: 1.35rem;
      font-weight: 400;
      margin: 1.25rem 0 0.75rem 0;
    }

    .markdown-preview h3 {
      font-family: var(--font-serif);
      font-size: 1.15rem;
      font-weight: 400;
      margin: 1rem 0 0.5rem 0;
    }

    .markdown-preview p {
      margin: 0.75rem 0;
    }

    .markdown-preview ul,
    .markdown-preview ol {
      margin: 0.75rem 0;
      padding-left: 1.5rem;
    }

    .markdown-preview li {
      margin: 0.25rem 0;
    }

    /* Checkboxes rendered from [ ] / [x] markers - sized for thumbs. */
    .markdown-preview input[type="checkbox"] {
      width: 1.15em;
      height: 1.15em;
      margin: 0 0.4em 0 0;
      vertical-align: -0.15em;
      cursor: pointer;
      accent-color: var(--primary);
    }

    .markdown-preview code {
      background: var(--gray-100);
      padding: 0.125rem 0.375rem;
      border-radius: 0.25rem;
      font-family: var(--font-mono);
      font-size: 0.875em;
    }

    .markdown-preview pre {
      background: var(--gray-100);
      padding: 1rem;
      border-radius: 0.5rem;
      overflow-x: auto;
      margin: 1rem 0;
    }

    .markdown-preview pre code {
      background: transparent;
      padding: 0;
    }

    .markdown-preview blockquote {
      border-left: 3px solid var(--primary);
      margin: 1rem 0;
      padding: 0.4rem 1rem;
      background: var(--gray-50);
      color: var(--gray-700);
    }

    .markdown-preview a {
      color: var(--primary);
      text-decoration: underline;
    }

    .markdown-preview img {
      max-width: 100%;
      height: auto;
      border-radius: 0.5rem;
    }

    .markdown-preview hr {
      border: none;
      border-top: 1px solid var(--gray-200);
      margin: 1.5rem 0;
    }

    /* A table with more than two or three columns cannot fit a phone; let it
      scroll sideways on its own rather than widening the whole document. */
    .markdown-preview table {
      display: block;
      width: fit-content;
      max-width: 100%;
      overflow-x: auto;
      border-collapse: collapse;
      margin: 1rem 0;
    }

    .markdown-preview th,
    .markdown-preview td {
      border: 1px solid var(--gray-300);
      padding: 0.5rem;
      text-align: left;
    }

    .markdown-preview th {
      background: var(--gray-50);
      font-weight: 600;
    }

    .empty-preview {
      color: var(--gray-500);
      font-style: italic;
    }

    /* Only ever visible on paper - see the @media print block below. */
    .print-doc {
      display: none;
    }

    @media (max-width: 768px) {
      .topbar {
        padding: 0.35rem 0.4rem;
        gap: 0.1rem;
      }

      .crumb {
        display: none;
      }

      /*
      * "Saved" is the boring steady state and it was crowding five buttons
      * off a 320px screen, so on mobile it collapses to just its dot. Any
      * status that actually wants attention (unsaved / saving / failed)
      * keeps its words.
      */
      .save-pill {
        margin-right: 0.15rem;
      }

      .save-pill.saved .save-label {
        display: none;
      }

      .canvas {
        padding: 1rem 1rem 2rem;
      }

      .doc-title {
        font-size: 1.5rem;
        min-height: 44px;
      }

      .doc-tags {
        margin-bottom: 1rem;
      }

      .history-panel {
        right: 0.5rem;
        left: 0.5rem;
        width: auto;
      }

      .history-row {
        min-height: 44px;
      }

      /* The save pill is the only flexible item in the toolbar, so the
        buttons keep their full 44px even at 320px and the pill absorbs it. */
      .icon-btn {
        width: 44px;
        height: 44px;
      }

      /* The label stays: an unlabeled printer glyph is a guess. */
      .text-btn {
        height: 44px;
        padding: 0 0.55rem;
      }

      .tag-chip {
        min-height: 36px;
        padding: 0.35rem 0.8rem;
      }
    }

    @media (pointer: coarse) {
      .icon-btn {
        width: 44px;
        height: 44px;
      }

      .text-btn {
        height: 44px;
      }

      .tag-chip {
        min-height: 36px;
        padding: 0.35rem 0.8rem;
      }

      .history-restore-btn {
        min-height: 40px;
      }
    }

    /* ---------- Print ----------
    *
    * On paper the app stops being an app: every control is hidden and what
    * is left is the note itself, rendered (never the raw textarea) and set
    * in the same serif the preview already uses for headings.
    *
    * The .print-doc element is only in the DOM while a print is in flight -
    * see _enterPrintView() - so none of this can affect the screen.
    *
    * The page gutter is padding here rather than an @page margin: the
    * zero margin (in app.css, since a shadow root cannot set page context)
    * is what leaves Chrome's URL/date/page-number line nowhere to draw.
    * That line is still the browser's to decide - unchecking "Headers and
    * footers" in the print dialog is the user's switch, not ours.
    */
    @media print {
      :host {
        height: auto;
        background: var(--white);
      }

      .editor-container {
        display: block;
        height: auto;
      }

      /* Every screen-only surface: the toolbar and its history panel, and
        the whole editable canvas - title input, metadata, tag chips and
        the textarea/preview body. */
      .topbar,
      .history-scrim,
      .history-panel,
      .canvas {
        display: none !important;
      }

      .print-doc {
        display: block;
        padding: 16mm 18mm;
        color: #000;
        background: none;
      }

      .print-title {
        font-family: var(--font-serif);
        font-size: 20pt;
        font-weight: 400;
        line-height: 1.25;
        margin: 0 0 6mm;
        padding-bottom: 3mm;
        border-bottom: 0.5pt solid #999;
      }

      .print-doc .markdown-preview {
        min-height: 0;
        font-family: var(--font-serif);
        font-size: 11pt;
        line-height: 1.5;
        color: #000;
      }

      .print-doc h1,
      .print-doc h2,
      .print-doc h3 {
        color: #000;
        /* A heading alone at the foot of a page reads as a mistake. */
        break-after: avoid;
        page-break-after: avoid;
      }

      .print-doc h1 {
        font-size: 15pt;
        margin: 6mm 0 3mm;
        padding-bottom: 1.5mm;
        border-bottom: 0.5pt solid #bbb;
      }

      .print-doc h2 {
        font-size: 13pt;
        margin: 5mm 0 2.5mm;
      }

      .print-doc h3 {
        font-size: 11.5pt;
        margin: 4mm 0 2mm;
      }

      .print-doc p,
      .print-doc ul,
      .print-doc ol {
        margin: 0 0 3mm;
        orphans: 2;
        widows: 2;
      }

      .print-doc li {
        margin: 0 0 1mm;
      }

      /* Ink, not screen: no fills, no hover tints, no accent colors. */
      .print-doc a {
        color: #000;
        text-decoration: underline;
      }

      .print-doc code {
        background: none;
        border: 0.5pt solid #bbb;
        border-radius: 0;
        font-size: 9.5pt;
      }

      .print-doc pre {
        background: none;
        border: 0.5pt solid #bbb;
        border-radius: 0;
        padding: 3mm;
        /* A code block cannot scroll on paper, and splitting one across a
          page break makes it unreadable. */
        overflow: visible;
        white-space: pre-wrap;
        break-inside: avoid;
        page-break-inside: avoid;
      }

      .print-doc pre code {
        border: none;
        font-size: 9pt;
      }

      .print-doc blockquote {
        background: none;
        border-left: 1pt solid #666;
        color: #000;
        break-inside: avoid;
        page-break-inside: avoid;
      }

      .print-doc hr {
        border-top: 0.5pt solid #999;
        margin: 5mm 0;
      }

      .print-doc table {
        display: table;
        width: 100%;
        overflow: visible;
        break-inside: avoid;
        page-break-inside: avoid;
      }

      .print-doc th,
      .print-doc td {
        border: 0.5pt solid #999;
        padding: 1.5mm 2mm;
      }

      .print-doc th {
        background: none;
      }

      .print-doc img {
        max-width: 100%;
        border-radius: 0;
        break-inside: avoid;
        page-break-inside: avoid;
      }

      /* Checkboxes come through as [x] / [ ] text (checkboxesToPrintGlyphs),
        so there is no tappable control left to tint or size. */
      .print-checkbox {
        font-family: var(--font-mono);
        margin-right: 0.35em;
      }

      .print-doc .empty-preview {
        color: #555;
      }
    }
  `;

  constructor() {
    super();
    this.loading = false;
    this.selectedTags = [];
    this.saveStatus = "saved";
    this.hasUnsavedChanges = false;
    this.autoSaveTimer = null;
    this.originalNote = null;
    this.pendingCount = 0;
    this.previewMode = localStorage.getItem("notes-previewMode") === "true";
    this.uploadingImage = false;
    this.historyOpen = false;
    this.versions = [];
    this.loadingVersions = false;
    this.restoringVersionId = null;
    this.printing = false;
    this._editingContent = null; // Track textarea content across preview toggles
    this._isSaving = false; // Non-reactive guard against concurrent saves
    this._scrollTopBeforeUpdate = null; // Canvas position to restore after a re-render

    // Store bound handlers to fix memory leak
    this._boundHandleInput = this.handleInputChange.bind(this);
    this._boundHandleChange = this.handleInputChange.bind(this);
    this._boundHandleSyncStarted = this._handleSyncStarted.bind(this);
    this._boundHandleSyncCompleted = this._handleSyncCompleted.bind(this);
    this._boundHandleSyncFailed = this._handleSyncFailed.bind(this);
    this._boundHandleSyncPending = this._handleSyncPending.bind(this);
    this._boundHandleDraftSaved = this._handleDraftSaved.bind(this);
    this._boundHandlePaste = this._handlePaste.bind(this);
    this._boundHandleBeforePrint = this._handleBeforePrint.bind(this);
    this._boundHandleAfterPrint = this._handleAfterPrint.bind(this);
    this._titleBeforePrint = null; // document.title to put back after printing
  }

  connectedCallback() {
    super.connectedCallback();
    if (this.note && this.note.tags) {
      this.selectedTags = [...this.note.tags];
    }
    this.setupAutoSave();
    this._setupSyncListeners();
    this._checkForDraft();
    this._setupPasteListener();
    this._setupPrintListeners();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.clearAutoSaveTimer();
    this._removeSyncListeners();
    this._removePasteListener();
    this._removePrintListeners();
    this._exitPrintView();
  }

  /**
   * Set up sync manager event listeners
   */
  _setupSyncListeners() {
    document.addEventListener("sync-started", this._boundHandleSyncStarted);
    document.addEventListener("sync-completed", this._boundHandleSyncCompleted);
    document.addEventListener("sync-failed", this._boundHandleSyncFailed);
    document.addEventListener("sync-pending", this._boundHandleSyncPending);
    document.addEventListener("sync-draft-saved", this._boundHandleDraftSaved);
  }

  /**
   * Remove sync manager event listeners
   */
  _removeSyncListeners() {
    document.removeEventListener("sync-started", this._boundHandleSyncStarted);
    document.removeEventListener("sync-completed", this._boundHandleSyncCompleted);
    document.removeEventListener("sync-failed", this._boundHandleSyncFailed);
    document.removeEventListener("sync-pending", this._boundHandleSyncPending);
    document.removeEventListener("sync-draft-saved", this._boundHandleDraftSaved);
  }

  _handleSyncStarted(event) {
    if (this.note && String(event.detail.noteId) === String(this.note.id)) {
      this.saveStatus = "saving";
    }
  }

  _handleSyncCompleted(event) {
    if (this.note && String(event.detail.noteId) === String(this.note.id)) {
      this.saveStatus = "saved";
      this.hasUnsavedChanges = false;
    }
  }

  _handleSyncFailed(event) {
    if (this.note && String(event.detail.noteId) === String(this.note.id)) {
      this.saveStatus = event.detail.willRetry ? "pending" : "error";
    }
  }

  _handleSyncPending(event) {
    this.pendingCount = event.detail.count;
  }

  _handleDraftSaved(event) {
    if (this.note && String(event.detail.noteId) === String(this.note.id)) {
      // Draft saved to IndexedDB - data is safe
      this.hasUnsavedChanges = false;
    }
  }

  /**
   * Check for recovered draft on load
   */
  async _checkForDraft() {
    if (!this.note || !globalThis.NotesApp.syncManager) return;

    try {
      const draft = await globalThis.NotesApp.syncManager.getDraft(this.note.id);
      if (draft && draft.updatedAt > new Date(this.note.updated_at).getTime()) {
        // Draft is newer than server version - offer recovery
        this._offerDraftRecovery(draft);
      }
    } catch (error) {
      console.error("Failed to check for draft:", error);
    }
  }

  /**
   * Offer to recover a draft that's newer than server version
   */
  _offerDraftRecovery(draft) {
    // For now, auto-recover. Could add a UI prompt later.
    const titleInput = this.shadowRoot?.querySelector(".doc-title");
    const contentTextarea = this.shadowRoot?.querySelector(".content-textarea");

    if (titleInput && contentTextarea) {
      titleInput.value = draft.title;
      contentTextarea.value = draft.content;
      this.selectedTags = draft.tags || [];
      this.hasUnsavedChanges = true;
      this.saveStatus = "unsaved";
      this._autoGrowTextarea();
      this.showToast("Recovered unsaved changes", "info");
    }
  }

  /**
   * Note where the reader is *before* Lit re-renders. A completed save swaps in
   * the server's copy of the note, and re-fitting the textarea against it can
   * clamp .canvas back towards the top; updated() puts the position back.
   * Only for same-note refreshes -- a genuine note switch gets its own scroll.
   */
  willUpdate(changedProperties) {
    this._scrollTopBeforeUpdate = null;
    if (
      changedProperties.has("note") &&
      isSameNoteUpdate(changedProperties.get("note"), this.note)
    ) {
      this._scrollTopBeforeUpdate = this.shadowRoot?.querySelector(".canvas")?.scrollTop ?? null;
    }
  }

  updated(changedProperties) {
    // Re-fit whenever a different note loads or we come back from preview.
    if (changedProperties.has("note") || changedProperties.has("previewMode")) {
      this._autoGrowTextarea();
    }

    this._restoreCanvasScroll();

    if (changedProperties.has("note") && this.note) {
      const prevNote = changedProperties.get("note");
      const isSameNote = isSameNoteUpdate(prevNote, this.note);

      if (isSameNote) {
        // Same note updated (e.g. after auto-save) — update tracking
        // without resetting editor state or disrupting focus
        this.originalNote = this.deepCopy(this.note);
      } else {
        // Switching to a different note — full reset
        this._editingContent = null;
        this.selectedTags = this.note.tags || [];
        this.originalNote = this.deepCopy(this.note);
        this.saveStatus = "saved";
        this.hasUnsavedChanges = false;
        this.historyOpen = false;
        this.versions = [];
      }
    }
  }

  toggleTag(tagId) {
    const index = this.selectedTags.findIndex((t) => t && t.id === tagId);
    if (index === -1) {
      const tag = this.tags.find((t) => t && t.id === tagId);
      if (tag) {
        this.selectedTags = [...this.selectedTags, tag];
      } else {
        console.error("Tag not found with ID:", tagId);
        return;
      }
    } else {
      this.selectedTags = this.selectedTags.filter((t) => t && t.id !== tagId);
    }
    this.markAsChanged();
    this.requestUpdate();
  }

  setupAutoSave() {
    // Set up event listeners for input changes using stored bound handlers
    this.addEventListener("input", this._boundHandleInput);
    this.addEventListener("change", this._boundHandleChange);
  }

  handleInputChange(e) {
    if (e?.target?.classList?.contains("content-textarea")) {
      this._editingContent = e.target.value;
      this._autoGrowTextarea();
    }
    this.markAsChanged();
  }

  /**
   * Size the textarea to its content so .canvas stays the only scroller.
   * Cheap enough to run per keystroke: one forced reflow on a single element.
   *
   * Measuring costs a scroll position: collapsing the textarea to `auto`
   * shortens the document, and .canvas clamps its scrollTop to the shorter
   * range -- which is what used to throw the reader back to the top of a long
   * note every time a save landed. So the growing case, where scrollHeight
   * already reports the full content height, skips the collapse entirely, and
   * the shrinking case restores the scroller in the same synchronous block,
   * before the browser gets a chance to paint the collapsed frame.
   */
  _autoGrowTextarea() {
    if (this.previewMode) return;
    const textarea = this.shadowRoot?.querySelector(".content-textarea");
    if (!textarea) return;

    // Content overflows its box: scrollHeight is the exact height we want.
    if (textarea.scrollHeight > textarea.clientHeight) {
      textarea.style.height = `${textarea.scrollHeight}px`;
      return;
    }

    // Otherwise the box is at least as tall as its content and scrollHeight is
    // clamped to it, so the natural height can only be had by collapsing.
    const canvas = this.shadowRoot?.querySelector(".canvas");
    const scrollTop = canvas?.scrollTop;
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
    if (canvas && scrollTop !== undefined && canvas.scrollTop !== scrollTop) {
      canvas.scrollTop = scrollTop;
    }
  }

  /**
   * Put .canvas back where willUpdate() found it. Runs after the re-render has
   * been laid out; the rAF pass covers a height that only settles on the next
   * frame, and both passes no-op when the position never moved.
   */
  _restoreCanvasScroll() {
    const target = this._scrollTopBeforeUpdate;
    this._scrollTopBeforeUpdate = null;
    if (target === null) return;

    const canvas = this.shadowRoot?.querySelector(".canvas");
    if (!canvas || canvas.scrollTop === target) return;
    canvas.scrollTop = target;

    const noteId = this.note?.id;
    requestAnimationFrame(() => {
      // A note switch in the meantime owns the scroller now -- don't fight it.
      if (this.note?.id !== noteId) return;
      const later = this.shadowRoot?.querySelector(".canvas");
      if (later && later.scrollTop !== target) later.scrollTop = target;
    });
  }

  markAsChanged() {
    if (!this.hasUnsavedChanges) {
      this.hasUnsavedChanges = true;
      this.saveStatus = "unsaved";
    }

    // Reset the auto-save timer
    this.clearAutoSaveTimer();
    this.autoSaveTimer = setTimeout(() => {
      if (this.hasUnsavedChanges) {
        this.autoSave();
      }
    }, 3000); // Auto-save after 3 seconds of inactivity
  }

  clearAutoSaveTimer() {
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }

  deepCopy(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  hasChanges() {
    if (!this.originalNote) return true;

    const titleInput = this.shadowRoot.querySelector(".doc-title");
    const contentTextarea = this.shadowRoot.querySelector(".content-textarea");

    if (!contentTextarea) return false;

    const currentTitle = titleInput ? titleInput.value.trim() : this.note.title;
    const currentContent = contentTextarea.value;
    const currentTagIds = this.selectedTags.map((t) => t.id).sort();
    const originalTagIds = (this.originalNote.tags || []).map((t) => t.id).sort();

    return currentTitle !== this.originalNote.title ||
      currentContent !== this.originalNote.content ||
      JSON.stringify(currentTagIds) !== JSON.stringify(originalTagIds);
  }

  async autoSave() {
    if (!this.note || this._isSaving || !this.hasUnsavedChanges) return;

    const titleInput = this.shadowRoot.querySelector(".doc-title");
    const contentTextarea = this.shadowRoot.querySelector(".content-textarea");

    // In preview mode there is no textarea, and if the user only clicked a tag
    // chip there is no editing buffer either -- fall back to the persisted
    // content so a tag-only change still gets saved instead of leaving the
    // note stuck on "unsaved" forever.
    const content = resolveSaveContent(
      contentTextarea?.value,
      this._editingContent,
      this.note.content,
    );
    if (content === null) return;

    const updates = {
      title: titleInput ? titleInput.value.trim() : this.note.title,
      content: content,
      tags: this.selectedTags.filter((t) => t && t.id).map((t) => t.id),
    };

    this.saveStatus = "saving";
    this._isSaving = true;

    try {
      // Use sync manager for reliable saves with offline support
      const result = await globalThis.NotesApp.saveNoteWithSync(
        this.note.id,
        updates,
        this.note.updated_at,
      );

      // If queued for later (offline), update UI accordingly
      if (result.queued) {
        this.saveStatus = "pending";
        this.hasUnsavedChanges = false; // Data is safe in IndexedDB
        this.showToast(result.message || "Changes saved locally", "info");
        return;
      }

      // Successful sync - use the tags from the server response
      const updatedNote = {
        ...result.data,
        tags: result.data.tags || this.selectedTags,
      };

      this.dispatchEvent(
        new CustomEvent("note-updated", {
          detail: { note: updatedNote },
          bubbles: true,
          composed: true,
        }),
      );

      // Update our tracking
      this.originalNote = this.deepCopy(updatedNote);
      this.hasUnsavedChanges = false;
      this.saveStatus = "saved";
    } catch (error) {
      console.error("Failed to auto-save note:", error);
      // Don't show error toast if data is safe locally
      if (await globalThis.NotesApp.hasUnsavedChanges(this.note.id)) {
        this.saveStatus = "pending";
        this.hasUnsavedChanges = false;
        this.showToast("Changes saved locally, will sync when online", "warning");
      } else {
        this.showToast("Failed to save changes", "error");
        this.saveStatus = "error";
      }
    } finally {
      this._isSaving = false;
    }
  }

  async handleClose() {
    // Save if there are unsaved changes
    if (this.hasUnsavedChanges) {
      await this.autoSave();
    }

    // Clear any pending auto-save timer
    this.clearAutoSaveTimer();

    // Wait for sync to complete (with timeout)
    if (this.note && globalThis.NotesApp.waitForSync) {
      const syncResult = await globalThis.NotesApp.waitForSync(3000);
      if (!syncResult.success && syncResult.pending > 0) {
        // Data is safe locally, user can proceed
        this.showToast("Changes saved locally", "info");
      }
    }

    this.dispatchEvent(
      new CustomEvent("close-editor", {
        bubbles: true,
        composed: true,
      }),
    );
  }

  showToast(message, type = "info") {
    document.dispatchEvent(
      new CustomEvent("show-toast", {
        detail: { message, type },
      }),
    );
  }

  formatDate(dateString) {
    if (!dateString) return "";
    const date = new Date(dateString);
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  togglePreviewMode(toPreview) {
    // Capture textarea content before it gets destroyed by the re-render
    if (toPreview) {
      const textarea = this.shadowRoot?.querySelector(".content-textarea");
      if (textarea) {
        this._editingContent = textarea.value;
      }
    }
    this.previewMode = toPreview;
    localStorage.setItem("notes-previewMode", this.previewMode);
  }

  /**
   * Toggle the version history panel, loading versions on first open
   */
  async toggleHistory() {
    this.historyOpen = !this.historyOpen;
    if (this.historyOpen && this.versions.length === 0) {
      await this.loadVersions();
    }
  }

  /**
   * Fetch the version history list for the current note from
   * GET /api/notes/:id/versions. Populates `this.versions`, newest first
   * (the server already orders by version_number DESC).
   */
  async loadVersions() {
    if (!this.note) return;
    this.loadingVersions = true;
    try {
      const result = await globalThis.NotesApp.getNoteVersions(this.note.id);
      this.versions = result.data || [];
    } catch (error) {
      console.error("Failed to load version history:", error);
      this.showToast("Failed to load version history", "error");
    } finally {
      this.loadingVersions = false;
    }
  }

  /**
   * Restore a prior version's title/content via POST /notes/:id/restore/:versionId,
   * after an explicit confirm since this overwrites the current draft.
   * On success we treat the restored note exactly like a normal autosave result
   * (dispatch note-updated, refresh our change-tracking snapshot) so the rest
   * of the editor doesn't need to know a restore happened.
   */
  async restoreVersion(version) {
    if (
      !confirm(
        `Restore version ${version.version_number}? This replaces the current title and content.`,
      )
    ) {
      return;
    }

    this.restoringVersionId = version.id;
    try {
      const result = await globalThis.NotesApp.restoreNoteVersion(this.note.id, version.id);
      const updatedNote = {
        ...result.data,
        tags: result.data.tags || this.selectedTags,
      };

      this._editingContent = null;
      this.selectedTags = updatedNote.tags || [];

      this.dispatchEvent(
        new CustomEvent("note-updated", {
          detail: { note: updatedNote },
          bubbles: true,
          composed: true,
        }),
      );

      this.originalNote = this.deepCopy(updatedNote);
      this.hasUnsavedChanges = false;
      this.saveStatus = "saved";
      this.historyOpen = false;
      this.versions = [];
      this.showToast(`Restored version ${version.version_number}`, "success");
    } catch (error) {
      console.error("Failed to restore version:", error);
      this.showToast("Failed to restore version", "error");
    } finally {
      this.restoringVersionId = null;
    }
  }

  /**
   * Trigger file input click
   */
  _triggerFileInput() {
    const fileInput = this.shadowRoot?.querySelector(".hidden-file-input");
    fileInput?.click();
  }

  /**
   * Handle file input change
   */
  async _handleFileInputChange(event) {
    const file = event.target.files?.[0];
    if (file) {
      await this._uploadImage(file);
    }
    // Reset the input so the same file can be selected again
    event.target.value = "";
  }

  _setupPasteListener() {
    this.addEventListener("paste", this._boundHandlePaste);
  }

  _removePasteListener() {
    this.removeEventListener("paste", this._boundHandlePaste);
  }

  _setupPrintListeners() {
    globalThis.addEventListener("beforeprint", this._boundHandleBeforePrint);
    globalThis.addEventListener("afterprint", this._boundHandleAfterPrint);
  }

  _removePrintListeners() {
    globalThis.removeEventListener("beforeprint", this._boundHandleBeforePrint);
    globalThis.removeEventListener("afterprint", this._boundHandleAfterPrint);
  }

  /**
   * Swap in the printable rendering of the note (see the @media print block).
   *
   * It is rendered only while a print is in flight rather than kept hidden in
   * the DOM, so typing a note does not re-render its markdown twice per
   * keystroke. `document.title` carries the note's title for the duration
   * because that is what browsers offer as the "Save as PDF" filename.
   */
  _enterPrintView() {
    if (this.printing) return;
    this._titleBeforePrint = document.title;
    document.title = this._printTitle();
    this.printing = true;
  }

  /**
   * The note's title as it stands on screen, so a title typed but not yet
   * saved still prints. Same precedence autoSave() uses: input, then note.
   * @returns {string} A non-empty title, falling back to a placeholder
   */
  _printTitle() {
    const titleInput = this.shadowRoot?.querySelector(".doc-title");
    return printDocumentTitle({ title: titleInput?.value ?? this.note?.title });
  }

  /** Undo _enterPrintView(). Safe to call when no print is in flight. */
  _exitPrintView() {
    if (!this.printing) return;
    this.printing = false;
    if (this._titleBeforePrint !== null) {
      document.title = this._titleBeforePrint;
      this._titleBeforePrint = null;
    }
  }

  /**
   * The browser's own Print command (Ctrl+P, or the app menu). Lit renders on
   * a microtask, which is too late for a print that has already begun, so the
   * print view is flushed synchronously here.
   */
  _handleBeforePrint() {
    this._enterPrintView();
    this.performUpdate();
  }

  _handleAfterPrint() {
    this._exitPrintView();
  }

  /**
   * Print button. beforeprint would normally do the preparation, but not
   * every browser fires it, so this path prepares the view itself - both
   * are idempotent.
   */
  async handlePrint() {
    this._enterPrintView();
    await this.updateComplete;
    globalThis.print();
    // print() blocks until the dialog is dismissed, so by here the job is
    // done; afterprint may have restored the view already, which is fine.
    this._exitPrintView();
  }

  /**
   * Handle paste events to detect image content
   */
  async _handlePaste(event) {
    // Only handle paste in edit mode
    if (this.previewMode) return;

    const items = event.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.startsWith("image/")) {
        event.preventDefault();
        const file = item.getAsFile();
        if (file) {
          await this._uploadImage(file);
        }
        return;
      }
    }
  }

  /**
   * Upload an image and insert markdown at cursor
   */
  async _uploadImage(file) {
    if (this.uploadingImage) return;

    // Validate file type client-side
    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"];
    if (!allowedTypes.includes(file.type)) {
      this.showToast("Invalid file type. Allowed: JPEG, PNG, GIF, WebP, SVG", "error");
      return;
    }

    // Validate file size (5MB)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      this.showToast("File too large. Maximum size is 5MB", "error");
      return;
    }

    this.uploadingImage = true;

    try {
      const result = await globalThis.NotesApp.uploadImage(file);

      if (result.success) {
        const markdown = `![${result.data.originalName || "image"}](${result.data.url})`;
        this._insertTextAtCursor(markdown);
        this.markAsChanged();
        this.showToast("Image uploaded", "success");
      } else {
        throw new Error(result.error || "Upload failed");
      }
    } catch (error) {
      console.error("Image upload failed:", error);
      this.showToast(error.message || "Failed to upload image", "error");
    } finally {
      this.uploadingImage = false;
    }
  }

  /**
   * Insert text at the current cursor position in the textarea
   */
  _insertTextAtCursor(text) {
    const textarea = this.shadowRoot?.querySelector(".content-textarea");
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const value = textarea.value;

    // Insert the text at cursor position
    textarea.value = value.substring(0, start) + text + value.substring(end);

    // Move cursor to after inserted text
    const newCursorPos = start + text.length;
    textarea.setSelectionRange(newCursorPos, newCursorPos);

    // Focus the textarea
    textarea.focus();

    // Trigger input event to mark as changed
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  }

  getMarkdownContent() {
    const contentTextarea = this.shadowRoot?.querySelector(".content-textarea");
    return contentTextarea?.value ?? this._editingContent ?? this.note?.content ?? "";
  }

  renderMarkdown(content) {
    if (!content || !content.trim()) {
      return '<p class="empty-preview">Nothing to preview. Start writing in Edit mode.</p>';
    }
    try {
      // Checkbox markers are swapped for tokens before parsing and turned into
      // inputs after, so `marked` never has to render task lists itself.
      const parsed = parseCheckboxTokens(marked.parse(tokenizeCheckboxes(content)));
      return DOMPurify.sanitize(parsed, {
        ADD_TAGS: ["input"],
        ADD_ATTR: ["type", "checked", "data-cb-index"],
      });
    } catch (error) {
      console.error("Markdown parsing error:", error);
      return `<p>Error rendering markdown</p>`;
    }
  }

  /**
   * Toggle a checkbox tapped in the preview. The input's data-cb-index is the
   * marker's position in the markdown source, so the edit is a pure text swap;
   * markAsChanged() then hands persistence to the existing auto-save.
   * @param {MouseEvent} event
   */
  _handlePreviewClick(event) {
    const target = /** @type {HTMLElement} */ (event.target);
    if (!target?.matches?.('input[type="checkbox"][data-cb-index]')) return;

    const index = Number.parseInt(target.dataset.cbIndex, 10);
    if (Number.isNaN(index)) return;

    const current = this.getMarkdownContent();
    const updated = toggleCheckbox(current, index);
    if (updated === current) return;

    // autoSave() reads _editingContent when the textarea is absent (preview mode).
    this._editingContent = updated;
    this.markAsChanged();
  }

  /** Short label shown in the sticky save-status pill for the current saveStatus. */
  _saveStatusLabel() {
    switch (this.saveStatus) {
      case "saving":
        return "Saving";
      case "saved":
        return "Saved";
      case "pending":
        return "Saved locally";
      case "error":
        return "Save failed";
      default:
        return "Unsaved";
    }
  }

  /**
   * Render the version-history dropdown anchored under the clock icon in the
   * top bar, plus a full-screen transparent scrim so clicking anywhere
   * outside the panel closes it. Returns "" when closed so it costs nothing
   * in the normal render path.
   */
  _renderHistoryPanel() {
    if (!this.historyOpen) return "";

    return html`
      <div class="history-scrim" @click="${() => this.historyOpen = false}"></div>
      <div class="history-panel">
        <div class="history-title">Version history</div>
        ${this.loadingVersions
          ? html`
            <div class="history-empty">Loading…</div>
          `
          : this.versions.length === 0
          ? html`
            <div class="history-empty">No earlier versions yet</div>
          `
          : this.versions.map((version) =>
            html`
              <div class="history-row">
                <div class="history-info">
                  <div class="history-version">Version ${version.version_number}</div>
                  <div class="history-date">${this.formatDate(version.created_at)}</div>
                </div>
                <button
                  class="history-restore-btn"
                  ?disabled="${this.restoringVersionId === version.id}"
                  @click="${() => this.restoreVersion(version)}"
                >
                  ${this.restoringVersionId === version.id ? "Restoring…" : "Restore"}
                </button>
              </div>
            `
          )}
      </div>
    `;
  }

  render() {
    if (!this.note) {
      return html`
        <div>No note selected</div>
      `;
    }

    const primaryTag = this.selectedTags?.[0];

    return html`
      <div class="editor-container">
        <div class="topbar">
          <button class="icon-btn" @click="${this.handleClose}" title="Back to notes">
            ${icons.chevronLeft}
          </button>
          ${primaryTag
            ? html`
              <span class="crumb">${primaryTag.name}</span>
            `
            : ""}

          <div class="topbar-spacer"></div>

          <div class="save-pill ${this.saveStatus}" title="${this._saveStatusLabel()}">
            <span class="dot"></span>
            <span class="save-label">${this._saveStatusLabel()}</span>
          </div>

          <input
            type="file"
            class="hidden-file-input"
            accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml"
            @change="${this._handleFileInputChange}"
          />
          <button
            class="icon-btn ${this.uploadingImage ? "uploading" : ""}"
            @click="${this._triggerFileInput}"
            ?disabled="${this.uploadingImage || this.previewMode}"
            title="Upload image (or paste from clipboard)"
          >
            ${icons.image}
          </button>
          <button
            class="icon-btn ${this.historyOpen ? "active" : ""}"
            @click="${this.toggleHistory}"
            title="Version history"
          >
            ${icons.clock}
          </button>
          <button
            class="text-btn"
            @click="${this.handlePrint}"
            title="Print or save as PDF - uncheck 'Headers and footers' in the print dialog for a clean page"
          >
            ${icons.printer}<span>Print</span>
          </button>
          <button
            class="icon-btn"
            @click="${() => this.togglePreviewMode(!this.previewMode)}"
            title="${this.previewMode ? "Back to editing" : "Preview"}"
            aria-label="${this.previewMode ? "Back to editing" : "Preview"}"
          >
            ${this.previewMode ? icons.edit : icons.eye}
          </button>

          ${this._renderHistoryPanel()}
        </div>

        <div class="canvas">
          <div class="canvas-col">
            <input
              type="text"
              class="doc-title"
              .value="${this.note.title || ""}"
              placeholder="Note title..."
              ?disabled="${this.loading}"
            />

            <div class="doc-meta">
              ${this.note.updated_at
                ? html`
                  Updated ${this.formatDate(this.note.updated_at)}
                `
                : html`
                  Created ${this.formatDate(this.note.created_at)}
                `}
            </div>

            <div class="doc-tags">
              ${this.tags?.map((tag) => {
                const isSelected = this.selectedTags.some((t) => t.id === tag.id);
                return html`
                  <div
                    class="tag-chip ${isSelected ? "selected" : ""}"
                    @click="${() => this.toggleTag(tag.id)}"
                  >
                    <span
                      class="tag-color-dot"
                      style="background-color: ${tag.color}"
                    ></span>
                    ${tag.name}
                  </div>
                `;
              })}
            </div>

            <div class="doc-body">
              ${this.previewMode
                ? html`
                  <div class="markdown-preview" @click="${this._handlePreviewClick}">
                    ${unsafeHTML(this.renderMarkdown(this.getMarkdownContent()))}
                  </div>
                `
                : html`
                  <textarea
                    class="content-textarea"
                    .value="${this._editingContent ?? this.note.content ?? ""}"
                    placeholder="Start writing your note (Markdown supported)..."
                    ?disabled="${this.loading}"
                  ></textarea>
                `}
            </div>
          </div>
        </div>

        ${this.printing ? this._renderPrintDoc() : ""}
      </div>
    `;
  }

  /**
   * The note as it goes on paper: its title and the rendered markdown, with
   * the tappable checkboxes turned into text. Everything else - the toolbar,
   * the title input, the metadata line, the tag chips - is hidden by the
   * @media print styles.
   */
  _renderPrintDoc() {
    const rendered = this.renderMarkdown(this.getMarkdownContent());
    return html`
      <div class="print-doc">
        <h1 class="print-title">${this._printTitle()}</h1>
        <div class="markdown-preview">
          ${unsafeHTML(checkboxesToPrintGlyphs(rendered))}
        </div>
      </div>
    `;
  }
}

customElements.define("note-editor", NoteEditor);
