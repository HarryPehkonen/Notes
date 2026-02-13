/**
 * Notes App - Main Application
 * Lit Web Components based frontend
 */

// Import services
import { syncManager } from "./services/sync-manager.js";

// Import all components
import "./components/notes-app.js";
import "./components/note-editor.js";
import "./components/note-list.js";
import "./components/search-bar.js";
import "./components/tag-manager.js";

// Global app state and utilities
window.NotesApp = {
  // API base URL
  apiUrl: "/api",

  // User session info
  user: null,

  // App state
  notes: [],
  tags: [],
  currentNote: null,
  searchQuery: "",
  selectedTags: [],

  // Sync manager reference
  syncManager,

  // Track active requests for deduplication
  _activeRequests: new Map(),

  // API helper methods with AbortController support
  async request(endpoint, options = {}) {
    const url = `${this.apiUrl}${endpoint}`;

    // Extract signal from options if provided
    const { signal: externalSignal, ...restOptions } = options;

    const config = {
      headers: {
        "Content-Type": "application/json",
      },
      ...restOptions,
    };

    // Add signal to config
    if (externalSignal) {
      config.signal = externalSignal;
    }

    if (config.body && typeof config.body === "object") {
      config.body = JSON.stringify(config.body);
    }

    try {
      const response = await fetch(url, config);

      // Handle 401 Unauthorized - redirect to login
      if (response.status === 401) {
        window.location.href = "/login";
        return;
      }

      const data = await response.json();

      if (!response.ok) {
        const error = new Error(data.error || `HTTP ${response.status}`);
        error.status = response.status;
        throw error;
      }

      return data;
    } catch (error) {
      // Re-throw abort errors without logging
      if (error.name === "AbortError") {
        throw error;
      }
      console.error(`API Error (${endpoint}):`, error);
      throw error;
    }
  },

  /**
   * Create an AbortController for a request
   * @returns {AbortController}
   */
  createAbortController() {
    return new AbortController();
  },

  // Notes API
  async getNotes(options = {}) {
    const params = new URLSearchParams();
    if (options.limit) params.set("limit", options.limit);
    if (options.offset) params.set("offset", options.offset);
    if (options.tags?.length) params.set("tags", options.tags.join(","));
    if (options.search) params.set("search", options.search);
    if (options.pinned !== undefined) params.set("pinned", options.pinned);

    const queryString = params.toString();
    const endpoint = `/notes${queryString ? `?${queryString}` : ""}`;

    return this.request(endpoint);
  },

  async getNote(id) {
    return this.request(`/notes/${id}`);
  },

  async createNote(noteData) {
    return this.request("/notes", {
      method: "POST",
      body: noteData,
    });
  },

  async updateNote(id, updates, options = {}) {
    return this.request(`/notes/${id}`, {
      method: "PUT",
      body: updates,
      ...options,
    });
  },

  /**
   * Save a note through the sync manager (recommended for UI components)
   * This provides offline support, retry logic, and crash protection
   */
  async saveNoteWithSync(id, updates, serverUpdatedAt = null) {
    return syncManager.saveNote(id, updates, serverUpdatedAt);
  },

  /**
   * Wait for all pending syncs to complete
   * Use before navigation or closing the editor
   */
  async waitForSync(timeout = 5000) {
    return syncManager.waitForSync(timeout);
  },

  /**
   * Get count of pending sync operations
   */
  async getPendingSyncCount() {
    return syncManager.getPendingCount();
  },

  /**
   * Check if there are unsaved changes for a note
   */
  async hasUnsavedChanges(noteId) {
    return syncManager.hasUnsavedChanges(noteId);
  },

  async deleteNote(id) {
    return this.request(`/notes/${id}`, {
      method: "DELETE",
    });
  },

  async getNoteVersions(id) {
    return this.request(`/notes/${id}/versions`);
  },

  async restoreNoteVersion(noteId, versionId) {
    return this.request(`/notes/${noteId}/restore/${versionId}`, {
      method: "POST",
    });
  },

  // Tags API
  async getTags() {
    return this.request("/tags");
  },

  async createTag(tagData) {
    return this.request("/tags", {
      method: "POST",
      body: tagData,
    });
  },

  async updateTag(id, updates) {
    return this.request(`/tags/${id}`, {
      method: "PUT",
      body: updates,
    });
  },

  async deleteTag(id) {
    return this.request(`/tags/${id}`, {
      method: "DELETE",
    });
  },

  // Search API
  async searchNotes(query, options = {}) {
    const params = new URLSearchParams();
    params.set("q", query);
    if (options.limit) params.set("limit", options.limit);
    if (options.offset) params.set("offset", options.offset);

    return this.request(`/search?${params.toString()}`);
  },

  async getSearchSuggestions(query, limit = 10) {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    params.set("limit", limit);

    return this.request(`/search/suggestions?${params.toString()}`);
  },

  async advancedSearch(criteria) {
    return this.request("/search/advanced", {
      method: "POST",
      body: criteria,
    });
  },

  // Logout
  async logout() {
    try {
      await this.request("/auth/logout", { method: "POST" });
      window.location.href = "/login";
    } catch (error) {
      console.error("Logout error:", error);
      // Force redirect even if logout fails
      window.location.href = "/login";
    }
  },

  // Utility methods
  showToast(message, type = "info") {
    const event = new CustomEvent("show-toast", {
      detail: { message, type },
    });
    document.dispatchEvent(event);
  },

  formatDate(date) {
    const d = new Date(date);
    const now = new Date();
    const diff = now - d;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 7) {
      return d.toLocaleDateString();
    } else if (days > 0) {
      return `${days} day${days > 1 ? "s" : ""} ago`;
    } else if (hours > 0) {
      return `${hours} hour${hours > 1 ? "s" : ""} ago`;
    } else if (minutes > 0) {
      return `${minutes} minute${minutes > 1 ? "s" : ""} ago`;
    } else {
      return "Just now";
    }
  },

  stripMarkdown(text) {
    return text
      .replace(/#{1,6}\s/g, "") // Headers
      .replace(/[*_~`]/g, "") // Formatting
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // Links
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1") // Images
      .replace(/```[\s\S]*?```/g, "") // Code blocks
      .replace(/`[^`]+`/g, "") // Inline code
      .replace(/^\s*[-*+]\s/gm, "") // Lists
      .replace(/^\s*\d+\.\s/gm, "") // Numbered lists
      .replace(/\n{2,}/g, "\n") // Multiple newlines
      .trim();
  },

  truncateText(text, maxLength = 100) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength).trim() + "...";
  },

  // Event system for component communication
  emit(eventName, data) {
    const event = new CustomEvent(eventName, { detail: data });
    document.dispatchEvent(event);
  },

  on(eventName, callback) {
    document.addEventListener(eventName, callback);
  },

  off(eventName, callback) {
    document.removeEventListener(eventName, callback);
  },
};

// Initialize app when DOM is ready
document.addEventListener("DOMContentLoaded", async () => {
  console.log("※ Notes App initialized");

  // Initialize sync manager for offline support and crash recovery
  try {
    await syncManager.init();
    console.log("※ Sync manager initialized");
  } catch (error) {
    console.error("Failed to initialize sync manager:", error);
  }

  // Set up global error handling
  window.addEventListener("error", (event) => {
    console.error("Global error:", event.error);
    NotesApp.showToast("An error occurred. Please try again.", "error");
  });

  window.addEventListener("unhandledrejection", (event) => {
    console.error("Unhandled promise rejection:", event.reason);
    NotesApp.showToast("An error occurred. Please try again.", "error");
    event.preventDefault();
  });

  // Handle keyboard shortcuts
  document.addEventListener("keydown", (event) => {
    // Cmd/Ctrl + K for search
    if ((event.metaKey || event.ctrlKey) && event.key === "k") {
      event.preventDefault();
      NotesApp.emit("focus-search");
    }

    // Cmd/Ctrl + N for new note
    if ((event.metaKey || event.ctrlKey) && event.key === "n") {
      event.preventDefault();
      NotesApp.emit("new-note");
    }

    // Escape to close modals/editors
    if (event.key === "Escape") {
      NotesApp.emit("escape-pressed");
    }
  });

  // Sync manager events are now handled by sync manager itself
  // Just show toasts for online/offline state changes
  document.addEventListener("sync-online", () => {
    NotesApp.showToast("Back online - syncing changes", "success");
  });

  document.addEventListener("sync-offline", () => {
    NotesApp.showToast("You are offline - changes saved locally", "warning");
  });

  document.addEventListener("sync-failed", (event) => {
    const { error, willRetry } = event.detail;
    if (willRetry) {
      NotesApp.showToast("Save failed, will retry automatically", "warning");
    } else {
      NotesApp.showToast(`Save failed: ${error}`, "error");
    }
  });

  document.addEventListener("sync-recovery-found", (event) => {
    const { drafts } = event.detail;
    if (drafts.length > 0) {
      NotesApp.showToast(`Found ${drafts.length} unsaved change(s) from previous session`, "info");
    }
  });
});

// Export for use in components
export default window.NotesApp;
