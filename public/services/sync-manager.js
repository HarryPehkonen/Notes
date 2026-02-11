/**
 * Sync Manager - Central coordinator for reliable data synchronization
 *
 * Responsibilities:
 * - Receives save requests from components
 * - Saves to IndexedDB immediately (crash protection)
 * - Queues network requests with retry
 * - Manages online/offline state
 * - Provides blocking waitForSync() for navigation guards
 * - Emits sync events for UI feedback
 */

import { persistence } from "./persistence.js";

// Sync states
const SYNC_STATE = {
  IDLE: "idle",
  SYNCING: "syncing",
  PENDING: "pending",
  ERROR: "error",
  OFFLINE: "offline",
};

// Retry configuration
const RETRY_CONFIG = {
  maxAttempts: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 8000, // 8 seconds
};

class SyncManager {
  constructor() {
    this.state = SYNC_STATE.IDLE;
    this.pendingSaves = new Map(); // noteId -> { data, promise, resolve, reject }
    this.activeSyncs = new Map(); // noteId -> AbortController
    this.isOnline = navigator.onLine;
    this.retryTimers = new Map(); // noteId -> timer
    this.syncPromises = []; // Array of pending sync promises
    this.initialized = false;

    // Bind event handlers
    this._handleOnline = this._handleOnline.bind(this);
    this._handleOffline = this._handleOffline.bind(this);
  }

  /**
   * Initialize the sync manager
   */
  async init() {
    if (this.initialized) return;

    // Initialize persistence layer
    await persistence.init();

    // Set up online/offline listeners
    globalThis.addEventListener("online", this._handleOnline);
    globalThis.addEventListener("offline", this._handleOffline);

    // Process any pending operations from previous session
    await this._processPendingQueue();

    // Check for drafts that need recovery
    await this._checkForRecovery();

    this.initialized = true;
  }

  /**
   * Handle coming back online
   */
  async _handleOnline() {
    this.isOnline = true;
    this._emitEvent("sync-online");

    // Retry any pending operations
    await this._processPendingQueue();
  }

  /**
   * Handle going offline
   */
  _handleOffline() {
    this.isOnline = false;
    this.state = SYNC_STATE.OFFLINE;
    this._emitEvent("sync-offline");
  }

  /**
   * Save a note - main entry point for components
   *
   * @param {string|number} noteId - Note ID
   * @param {Object} updates - { title, content, tags }
   * @param {string} serverUpdatedAt - Server's last updated_at (for conflict detection)
   * @returns {Promise<Object>} - Resolves when saved to IndexedDB (not necessarily synced)
   */
  async saveNote(noteId, updates, serverUpdatedAt = null) {
    // 1. Save to IndexedDB immediately (crash protection)
    await persistence.saveDraft(noteId, updates, serverUpdatedAt);
    this._emitEvent("sync-draft-saved", { noteId });

    // 2. Cancel any existing sync for this note
    this._cancelSync(noteId);

    // 3. Create sync promise and queue the network request
    return this._queueSync(noteId, updates);
  }

  /**
   * Queue a sync operation with deduplication
   */
  _queueSync(noteId, updates) {
    const noteKey = String(noteId);

    // If there's already a pending save for this note, update it
    if (this.pendingSaves.has(noteKey)) {
      const existing = this.pendingSaves.get(noteKey);
      existing.data = updates;
      return existing.promise;
    }

    // Create new pending save entry
    let resolve, reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });

    this.pendingSaves.set(noteKey, {
      data: updates,
      promise,
      resolve,
      reject,
    });

    // Track this for waitForSync
    this.syncPromises.push(promise.catch(() => {})); // Catch to prevent unhandled rejection

    // Start the sync
    this._startSync(noteId, updates);

    return promise;
  }

  /**
   * Start syncing a note to the server
   */
  async _startSync(noteId, updates) {
    const noteKey = String(noteId);

    if (!this.isOnline) {
      // Queue for later and resolve immediately
      await persistence.queueOperation({
        type: "update",
        noteId: noteKey,
        data: updates,
      });
      this._resolvePending(noteId, {
        queued: true,
        message: "Saved locally, will sync when online",
      });
      this.state = SYNC_STATE.PENDING;
      this._emitEvent("sync-pending", { noteId, count: await this.getPendingCount() });
      return;
    }

    this.state = SYNC_STATE.SYNCING;
    this._emitEvent("sync-started", { noteId });

    // Create abort controller for this sync
    const controller = new AbortController();
    this.activeSyncs.set(noteKey, controller);

    try {
      const result = await this._syncWithRetry(noteId, updates, controller.signal);

      // Success - clear draft and resolve
      await persistence.clearDraft(noteId);
      await persistence.clearPendingForNote(noteId);

      this._resolvePending(noteId, result);
      this.state = await this.getPendingCount() > 0 ? SYNC_STATE.PENDING : SYNC_STATE.IDLE;
      this._emitEvent("sync-completed", { noteId, result });
    } catch (error) {
      if (error.name === "AbortError") {
        // Cancelled, don't queue - a new save is coming
        return;
      }

      console.error(`Sync failed for note ${noteId}:`, error);

      // Queue for retry
      await persistence.queueOperation({
        type: "update",
        noteId: noteKey,
        data: updates,
      });

      this.state = SYNC_STATE.ERROR;
      this._emitEvent("sync-failed", { noteId, error: error.message, willRetry: true });

      // Still resolve the promise - data is safe locally
      this._resolvePending(noteId, {
        queued: true,
        error: error.message,
        message: "Saved locally, will retry",
      });
    } finally {
      this.activeSyncs.delete(noteKey);
    }
  }

  /**
   * Sync with exponential backoff retry
   */
  async _syncWithRetry(noteId, updates, signal, attempt = 0) {
    try {
      const response = await globalThis.NotesApp.updateNote(noteId, updates, { signal });
      return response;
    } catch (error) {
      if (signal.aborted) throw error;
      if (error.name === "AbortError") throw error;

      // Check if we should retry
      if (attempt < RETRY_CONFIG.maxAttempts - 1 && this._isRetryableError(error)) {
        const delay = Math.min(
          RETRY_CONFIG.baseDelay * Math.pow(2, attempt),
          RETRY_CONFIG.maxDelay,
        );

        this._emitEvent("sync-retrying", { noteId, attempt: attempt + 1, delay });

        await this._delay(delay, signal);
        return this._syncWithRetry(noteId, updates, signal, attempt + 1);
      }

      throw error;
    }
  }

  /**
   * Check if an error is retryable
   */
  _isRetryableError(error) {
    // Network errors
    if (error.name === "TypeError" && error.message.includes("fetch")) {
      return true;
    }
    // 5xx server errors
    if (error.status >= 500) {
      return true;
    }
    // Rate limiting
    if (error.status === 429) {
      return true;
    }
    return false;
  }

  /**
   * Delay helper with abort support
   */
  _delay(ms, signal) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, ms);
      if (signal) {
        signal.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(new DOMException("Aborted", "AbortError"));
        });
      }
    });
  }

  /**
   * Cancel an in-progress sync
   */
  _cancelSync(noteId) {
    const noteKey = String(noteId);
    const controller = this.activeSyncs.get(noteKey);
    if (controller) {
      controller.abort();
      this.activeSyncs.delete(noteKey);
    }

    // Clear any retry timer
    const timer = this.retryTimers.get(noteKey);
    if (timer) {
      clearTimeout(timer);
      this.retryTimers.delete(noteKey);
    }
  }

  /**
   * Resolve a pending save promise
   */
  _resolvePending(noteId, result) {
    const noteKey = String(noteId);
    const pending = this.pendingSaves.get(noteKey);
    if (pending) {
      pending.resolve(result);
      this.pendingSaves.delete(noteKey);
    }
  }

  /**
   * Reject a pending save promise
   */
  _rejectPending(noteId, error) {
    const noteKey = String(noteId);
    const pending = this.pendingSaves.get(noteKey);
    if (pending) {
      pending.reject(error);
      this.pendingSaves.delete(noteKey);
    }
  }

  /**
   * Process queued operations (on startup or coming online)
   */
  async _processPendingQueue() {
    if (!this.isOnline) return;

    const operations = await persistence.getPendingOperations();
    if (operations.length === 0) return;

    this._emitEvent("sync-queue-processing", { count: operations.length });

    for (const op of operations) {
      if (!this.isOnline) break;

      try {
        if (op.type === "update") {
          await globalThis.NotesApp.updateNote(op.noteId, op.data);
          await persistence.removeOperation(op.id);
          await persistence.clearDraft(op.noteId);
          this._emitEvent("sync-completed", { noteId: op.noteId });
        }
      } catch (error) {
        console.error(`Failed to process queued operation:`, error);

        // Update retry count
        await persistence.updateOperation(op.id, {
          retryCount: (op.retryCount || 0) + 1,
          lastError: error.message,
        });
      }
    }

    const remaining = await persistence.getPendingCount();
    if (remaining > 0) {
      this.state = SYNC_STATE.PENDING;
      this._emitEvent("sync-pending", { count: remaining });
    } else {
      this.state = SYNC_STATE.IDLE;
    }
  }

  /**
   * Check for drafts that need recovery (crash recovery)
   */
  async _checkForRecovery() {
    const drafts = await persistence.getAllDrafts();
    if (drafts.length > 0) {
      this._emitEvent("sync-recovery-found", { drafts });
    }
  }

  /**
   * Get draft for a note (for conflict resolution)
   */
  getDraft(noteId) {
    return persistence.getDraft(noteId);
  }

  /**
   * Clear a draft (after user dismisses recovery)
   */
  clearDraft(noteId) {
    return persistence.clearDraft(noteId);
  }

  /**
   * Wait for all pending syncs to complete
   * Used for navigation guards
   *
   * @param {number} timeout - Maximum wait time in ms (default: 5000)
   * @returns {Promise<{ success: boolean, pending: number }>}
   */
  async waitForSync(timeout = 5000) {
    const startTime = Date.now();

    // Wait for any active syncs
    while (this.pendingSaves.size > 0 || this.activeSyncs.size > 0) {
      if (Date.now() - startTime > timeout) {
        const pending = await this.getPendingCount();
        return { success: false, pending, message: "Timeout waiting for sync" };
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    const pending = await this.getPendingCount();
    return { success: pending === 0, pending };
  }

  /**
   * Get count of pending operations
   */
  getPendingCount() {
    return persistence.getPendingCount();
  }

  /**
   * Check if there are unsaved changes for a note
   */
  async hasUnsavedChanges(noteId) {
    const noteKey = String(noteId);
    if (this.pendingSaves.has(noteKey)) return true;
    if (this.activeSyncs.has(noteKey)) return true;

    const draft = await persistence.getDraft(noteId);
    return draft !== null;
  }

  /**
   * Get current sync state
   */
  getState() {
    return this.state;
  }

  /**
   * Check if currently syncing
   */
  isSyncing() {
    return this.activeSyncs.size > 0;
  }

  /**
   * Emit a sync event
   */
  _emitEvent(name, detail = {}) {
    document.dispatchEvent(
      new CustomEvent(name, {
        detail: { ...detail, timestamp: Date.now() },
      }),
    );
  }

  /**
   * Cleanup on logout
   */
  async cleanup() {
    // Cancel all active syncs
    for (const [_noteId, controller] of this.activeSyncs) {
      controller.abort();
    }
    this.activeSyncs.clear();

    // Clear all timers
    for (const timer of this.retryTimers.values()) {
      clearTimeout(timer);
    }
    this.retryTimers.clear();

    // Clear pending saves
    this.pendingSaves.clear();

    // Clear local storage
    await persistence.clearAll();

    // Remove event listeners
    globalThis.removeEventListener("online", this._handleOnline);
    globalThis.removeEventListener("offline", this._handleOffline);

    this.initialized = false;
  }
}

// Export singleton instance
export const syncManager = new SyncManager();
export default syncManager;
