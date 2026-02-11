/**
 * Persistence Layer - IndexedDB wrapper for offline storage and crash recovery
 *
 * Provides:
 * - Drafts store: Auto-save every keystroke locally
 * - Pending queue: Failed requests waiting for retry
 * - Version tracking: Detect conflicts with server
 */

const DB_NAME = 'notes-app';
const DB_VERSION = 1;
const DRAFTS_STORE = 'drafts';
const PENDING_STORE = 'pending';

class PersistenceService {
    constructor() {
        this.db = null;
        this.initPromise = null;
    }

    /**
     * Initialize IndexedDB connection
     * @returns {Promise<IDBDatabase>}
     */
    init() {
        if (this.db) return Promise.resolve(this.db);
        if (this.initPromise) return this.initPromise;

        this.initPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => {
                console.error('Failed to open IndexedDB:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Drafts store: keyed by noteId, stores unsaved content
                if (!db.objectStoreNames.contains(DRAFTS_STORE)) {
                    const draftsStore = db.createObjectStore(DRAFTS_STORE, { keyPath: 'noteId' });
                    draftsStore.createIndex('updatedAt', 'updatedAt', { unique: false });
                }

                // Pending operations store: queued network requests
                if (!db.objectStoreNames.contains(PENDING_STORE)) {
                    const pendingStore = db.createObjectStore(PENDING_STORE, { keyPath: 'id', autoIncrement: true });
                    pendingStore.createIndex('timestamp', 'timestamp', { unique: false });
                    pendingStore.createIndex('noteId', 'noteId', { unique: false });
                }
            };
        });

        return this.initPromise;
    }

    /**
     * Ensure database is ready
     * @returns {Promise<IDBDatabase>}
     */
    async getDb() {
        if (!this.db) {
            await this.init();
        }
        return this.db;
    }

    // ==================== DRAFTS ====================

    /**
     * Save a draft to local storage
     * @param {string|number} noteId - Note ID (or 'new' for unsaved notes)
     * @param {Object} data - Draft data { title, content, tags }
     * @param {string} serverUpdatedAt - Last known server updated_at timestamp
     */
    async saveDraft(noteId, data, serverUpdatedAt = null) {
        const db = await this.getDb();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction([DRAFTS_STORE], 'readwrite');
            const store = transaction.objectStore(DRAFTS_STORE);

            const draft = {
                noteId: String(noteId),
                title: data.title,
                content: data.content,
                tags: data.tags || [],
                updatedAt: Date.now(),
                serverUpdatedAt: serverUpdatedAt
            };

            const request = store.put(draft);
            request.onsuccess = () => resolve(draft);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get a draft by note ID
     * @param {string|number} noteId
     * @returns {Promise<Object|null>}
     */
    async getDraft(noteId) {
        const db = await this.getDb();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction([DRAFTS_STORE], 'readonly');
            const store = transaction.objectStore(DRAFTS_STORE);
            const request = store.get(String(noteId));

            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Clear a draft after successful save
     * @param {string|number} noteId
     */
    async clearDraft(noteId) {
        const db = await this.getDb();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction([DRAFTS_STORE], 'readwrite');
            const store = transaction.objectStore(DRAFTS_STORE);
            const request = store.delete(String(noteId));

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get all drafts (for crash recovery)
     * @returns {Promise<Object[]>}
     */
    async getAllDrafts() {
        const db = await this.getDb();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction([DRAFTS_STORE], 'readonly');
            const store = transaction.objectStore(DRAFTS_STORE);
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Check if a draft is newer than server version
     * @param {string|number} noteId
     * @param {string} serverUpdatedAt - Server's updated_at timestamp
     * @returns {Promise<boolean>}
     */
    async hasDraftNewerThan(noteId, serverUpdatedAt) {
        const draft = await this.getDraft(noteId);
        if (!draft) return false;

        const serverTime = new Date(serverUpdatedAt).getTime();
        return draft.updatedAt > serverTime;
    }

    // ==================== PENDING OPERATIONS ====================

    /**
     * Queue an operation for retry
     * @param {Object} operation - { type: 'update'|'create'|'delete', noteId, data }
     * @returns {Promise<number>} - Operation ID
     */
    async queueOperation(operation) {
        const db = await this.getDb();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction([PENDING_STORE], 'readwrite');
            const store = transaction.objectStore(PENDING_STORE);

            const op = {
                ...operation,
                timestamp: Date.now(),
                retryCount: 0,
                lastError: null
            };

            const request = store.add(op);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get all pending operations
     * @returns {Promise<Object[]>}
     */
    async getPendingOperations() {
        const db = await this.getDb();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction([PENDING_STORE], 'readonly');
            const store = transaction.objectStore(PENDING_STORE);
            const index = store.index('timestamp');
            const request = index.getAll();

            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get pending operations for a specific note
     * @param {string|number} noteId
     * @returns {Promise<Object[]>}
     */
    async getPendingForNote(noteId) {
        const db = await this.getDb();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction([PENDING_STORE], 'readonly');
            const store = transaction.objectStore(PENDING_STORE);
            const index = store.index('noteId');
            const request = index.getAll(String(noteId));

            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Update a pending operation (e.g., after retry attempt)
     * @param {number} operationId
     * @param {Object} updates
     */
    async updateOperation(operationId, updates) {
        const db = await this.getDb();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction([PENDING_STORE], 'readwrite');
            const store = transaction.objectStore(PENDING_STORE);

            const getRequest = store.get(operationId);
            getRequest.onsuccess = () => {
                if (!getRequest.result) {
                    resolve(null);
                    return;
                }

                const updated = { ...getRequest.result, ...updates };
                const putRequest = store.put(updated);
                putRequest.onsuccess = () => resolve(updated);
                putRequest.onerror = () => reject(putRequest.error);
            };
            getRequest.onerror = () => reject(getRequest.error);
        });
    }

    /**
     * Remove a completed operation
     * @param {number} operationId
     */
    async removeOperation(operationId) {
        const db = await this.getDb();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction([PENDING_STORE], 'readwrite');
            const store = transaction.objectStore(PENDING_STORE);
            const request = store.delete(operationId);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Remove all pending operations for a note (e.g., after successful sync)
     * @param {string|number} noteId
     */
    async clearPendingForNote(noteId) {
        const operations = await this.getPendingForNote(noteId);

        for (const op of operations) {
            await this.removeOperation(op.id);
        }
    }

    /**
     * Get count of pending operations
     * @returns {Promise<number>}
     */
    async getPendingCount() {
        const db = await this.getDb();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction([PENDING_STORE], 'readonly');
            const store = transaction.objectStore(PENDING_STORE);
            const request = store.count();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // ==================== CLEANUP ====================

    /**
     * Clear all local data (for debugging or logout)
     */
    async clearAll() {
        const db = await this.getDb();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction([DRAFTS_STORE, PENDING_STORE], 'readwrite');

            transaction.objectStore(DRAFTS_STORE).clear();
            transaction.objectStore(PENDING_STORE).clear();

            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
    }

    /**
     * Clear old drafts (older than maxAge in milliseconds)
     * @param {number} maxAge - Maximum age in milliseconds (default: 7 days)
     */
    async clearOldDrafts(maxAge = 7 * 24 * 60 * 60 * 1000) {
        const db = await this.getDb();
        const cutoff = Date.now() - maxAge;

        return new Promise((resolve, reject) => {
            const transaction = db.transaction([DRAFTS_STORE], 'readwrite');
            const store = transaction.objectStore(DRAFTS_STORE);
            const index = store.index('updatedAt');
            const range = IDBKeyRange.upperBound(cutoff);

            const request = index.openCursor(range);
            const deleted = [];

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    deleted.push(cursor.value.noteId);
                    cursor.delete();
                    cursor.continue();
                } else {
                    resolve(deleted);
                }
            };
            request.onerror = () => reject(request.error);
        });
    }
}

// Export singleton instance
export const persistence = new PersistenceService();
export default persistence;
