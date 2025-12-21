/**
 * Notes App - Main Application
 * Lit Web Components based frontend
 */

// Import all components
import './components/notes-app.js';
import './components/note-editor.js';
import './components/note-list.js';
import './components/search-bar.js';
import './components/tag-manager.js';

// Global app state and utilities
window.NotesApp = {
    // API base URL
    apiUrl: '/api',

    // User session info
    user: null,

    // App state
    notes: [],
    tags: [],
    currentNote: null,
    searchQuery: '',
    selectedTags: [],

    // API helper methods
    async request(endpoint, options = {}) {
        const url = `${this.apiUrl}${endpoint}`;
        const config = {
            headers: {
                'Content-Type': 'application/json',
            },
            ...options,
        };

        if (config.body && typeof config.body === 'object') {
            config.body = JSON.stringify(config.body);
        }

        try {
            const response = await fetch(url, config);

            // Handle 401 Unauthorized - redirect to login
            if (response.status === 401) {
                window.location.href = '/login';
                return;
            }

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || `HTTP ${response.status}`);
            }

            return data;
        } catch (error) {
            console.error(`API Error (${endpoint}):`, error);
            throw error;
        }
    },

    // Notes API
    async getNotes(options = {}) {
        const params = new URLSearchParams();
        if (options.limit) params.set('limit', options.limit);
        if (options.offset) params.set('offset', options.offset);
        if (options.tags?.length) params.set('tags', options.tags.join(','));
        if (options.search) params.set('search', options.search);
        if (options.pinned !== undefined) params.set('pinned', options.pinned);

        const queryString = params.toString();
        const endpoint = `/notes${queryString ? `?${queryString}` : ''}`;

        return this.request(endpoint);
    },

    async getNote(id) {
        return this.request(`/notes/${id}`);
    },

    async createNote(noteData) {
        return this.request('/notes', {
            method: 'POST',
            body: noteData,
        });
    },

    async updateNote(id, updates) {
        return this.request(`/notes/${id}`, {
            method: 'PUT',
            body: updates,
        });
    },

    async deleteNote(id) {
        return this.request(`/notes/${id}`, {
            method: 'DELETE',
        });
    },

    async getNoteVersions(id) {
        return this.request(`/notes/${id}/versions`);
    },

    async restoreNoteVersion(noteId, versionId) {
        return this.request(`/notes/${noteId}/restore/${versionId}`, {
            method: 'POST',
        });
    },

    // Tags API
    async getTags() {
        return this.request('/tags');
    },

    async createTag(tagData) {
        return this.request('/tags', {
            method: 'POST',
            body: tagData,
        });
    },

    async updateTag(id, updates) {
        return this.request(`/tags/${id}`, {
            method: 'PUT',
            body: updates,
        });
    },

    async deleteTag(id) {
        return this.request(`/tags/${id}`, {
            method: 'DELETE',
        });
    },

    // Search API
    async searchNotes(query, options = {}) {
        const params = new URLSearchParams();
        params.set('q', query);
        if (options.limit) params.set('limit', options.limit);
        if (options.offset) params.set('offset', options.offset);

        return this.request(`/search?${params.toString()}`);
    },

    async getSearchSuggestions(query, limit = 10) {
        const params = new URLSearchParams();
        if (query) params.set('q', query);
        params.set('limit', limit);

        return this.request(`/search/suggestions?${params.toString()}`);
    },

    async advancedSearch(criteria) {
        return this.request('/search/advanced', {
            method: 'POST',
            body: criteria,
        });
    },

    // Backup API
    async createBackup() {
        return this.request('/backup/create', {
            method: 'POST',
        });
    },

    async listBackups() {
        return this.request('/backup/list');
    },

    async restoreBackup(backupPath, mergeMode = 'merge') {
        return this.request('/backup/restore', {
            method: 'POST',
            body: { backup_path: backupPath, merge_mode: mergeMode },
        });
    },

    async getBackupStatus() {
        return this.request('/backup/status');
    },

    // Logout
    async logout() {
        try {
            await this.request('/auth/logout', { method: 'POST' });
            window.location.href = '/login';
        } catch (error) {
            console.error('Logout error:', error);
            // Force redirect even if logout fails
            window.location.href = '/login';
        }
    },

    // Utility methods
    showToast(message, type = 'info') {
        const event = new CustomEvent('show-toast', {
            detail: { message, type }
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
            return `${days} day${days > 1 ? 's' : ''} ago`;
        } else if (hours > 0) {
            return `${hours} hour${hours > 1 ? 's' : ''} ago`;
        } else if (minutes > 0) {
            return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
        } else {
            return 'Just now';
        }
    },

    stripMarkdown(text) {
        return text
            .replace(/#{1,6}\s/g, '') // Headers
            .replace(/[*_~`]/g, '') // Formatting
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Links
            .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1') // Images
            .replace(/```[\s\S]*?```/g, '') // Code blocks
            .replace(/`[^`]+`/g, '') // Inline code
            .replace(/^\s*[-*+]\s/gm, '') // Lists
            .replace(/^\s*\d+\.\s/gm, '') // Numbered lists
            .replace(/\n{2,}/g, '\n') // Multiple newlines
            .trim();
    },

    truncateText(text, maxLength = 100) {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength).trim() + '...';
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
    }
};

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('※ Notes App initialized');

    // Set up global error handling
    window.addEventListener('error', (event) => {
        console.error('Global error:', event.error);
        NotesApp.showToast('An error occurred. Please try again.', 'error');
    });

    window.addEventListener('unhandledrejection', (event) => {
        console.error('Unhandled promise rejection:', event.reason);
        NotesApp.showToast('An error occurred. Please try again.', 'error');
        event.preventDefault();
    });

    // Handle keyboard shortcuts
    document.addEventListener('keydown', (event) => {
        // Cmd/Ctrl + K for search
        if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
            event.preventDefault();
            NotesApp.emit('focus-search');
        }

        // Cmd/Ctrl + N for new note
        if ((event.metaKey || event.ctrlKey) && event.key === 'n') {
            event.preventDefault();
            NotesApp.emit('new-note');
        }

        // Escape to close modals/editors
        if (event.key === 'Escape') {
            NotesApp.emit('escape-pressed');
        }
    });

    // Set up online/offline detection
    window.addEventListener('online', () => {
        NotesApp.showToast('Back online', 'success');
    });

    window.addEventListener('offline', () => {
        NotesApp.showToast('You are offline', 'warning');
    });
});

// Export for use in components
export default window.NotesApp;
