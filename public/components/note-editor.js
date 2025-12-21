/**
 * Note Editor Component
 */
import { LitElement, html, css } from 'lit';

export class NoteEditor extends LitElement {
    static properties = {
        note: { type: Object },
        tags: { type: Array },
        loading: { type: Boolean },
        selectedTags: { type: Array },
        saveStatus: { type: String }, // 'saved', 'saving', 'unsaved'
        hasUnsavedChanges: { type: Boolean }
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

        .editor-header {
            padding: 1.5rem;
            border-bottom: 1px solid var(--gray-200);
            background: var(--gray-50);
        }

        .title-input {
            width: 100%;
            font-size: 1.5rem;
            font-weight: 600;
            padding: 0.75rem;
            border: 1px solid var(--gray-300);
            border-radius: 0.5rem;
            margin-bottom: 1rem;
            font-family: var(--font-family);
        }

        .title-input:focus {
            outline: none;
            border-color: var(--primary);
            box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }

        .tags-section {
            margin-bottom: 1rem;
        }

        .tags-label {
            display: block;
            font-size: 0.875rem;
            font-weight: 500;
            color: var(--gray-700);
            margin-bottom: 0.5rem;
        }

        .tags-container {
            display: flex;
            flex-wrap: wrap;
            gap: 0.5rem;
        }

        .tag-chip {
            display: inline-flex;
            align-items: center;
            padding: 0.25rem 0.75rem;
            background: var(--gray-100);
            border: 1px solid var(--gray-300);
            border-radius: 1rem;
            font-size: 0.875rem;
            cursor: pointer;
            transition: all 0.2s;
        }

        .tag-chip:hover {
            background: var(--gray-200);
        }

        .tag-chip.selected {
            background: var(--primary);
            color: white;
            border-color: var(--primary);
        }

        .tag-color-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            margin-right: 0.5rem;
        }

        .editor-content {
            flex: 1;
            padding: 1.5rem;
            overflow-y: auto;
        }

        .content-textarea {
            width: 100%;
            height: 100%;
            min-height: 400px;
            padding: 1rem;
            border: 1px solid var(--gray-300);
            border-radius: 0.5rem;
            font-family: var(--font-family);
            font-size: 1rem;
            line-height: 1.6;
            resize: vertical;
        }

        .content-textarea:focus {
            outline: none;
            border-color: var(--primary);
            box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }

        .editor-footer {
            padding: 1.5rem;
            border-top: 1px solid var(--gray-200);
            background: var(--gray-50);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .metadata {
            font-size: 0.875rem;
            color: var(--gray-600);
            display: flex;
            align-items: center;
            gap: 1rem;
        }

        .save-status {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            font-size: 0.75rem;
        }

        .save-status.saved {
            color: var(--success);
        }

        .save-status.saving {
            color: var(--info);
        }

        .save-status.unsaved {
            color: var(--warning);
        }

        .save-indicator {
            width: 8px;
            height: 8px;
            border-radius: 50%;
        }

        .save-indicator.saved {
            background: var(--success);
        }

        .save-indicator.saving {
            background: var(--info);
            animation: pulse 1.5s infinite;
        }

        .save-indicator.unsaved {
            background: var(--warning);
        }

        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }

        .actions {
            display: flex;
            gap: 0.75rem;
        }

        .btn {
            padding: 0.5rem 1.25rem;
            border-radius: 0.5rem;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s;
            border: none;
            font-size: 0.875rem;
        }

        .btn-primary {
            background: var(--primary);
            color: white;
        }

        .btn-primary:hover:not(:disabled) {
            background: var(--primary-dark);
        }

        .btn-secondary {
            background: white;
            color: var(--gray-700);
            border: 1px solid var(--gray-300);
        }

        .btn-secondary:hover:not(:disabled) {
            background: var(--gray-50);
        }

        .btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        @media (max-width: 768px) {
            .editor-header,
            .editor-content,
            .editor-footer {
                padding: 1rem;
            }

            .title-input {
                font-size: 1.25rem;
            }

            .content-textarea {
                min-height: 300px;
            }

            .editor-footer {
                flex-direction: column;
                gap: 1rem;
            }

            .metadata {
                text-align: center;
            }

            .actions {
                width: 100%;
            }

            .btn {
                flex: 1;
            }
        }
    `;

    constructor() {
        super();
        this.loading = false;
        this.selectedTags = [];
        this.saveStatus = 'saved';
        this.hasUnsavedChanges = false;
        this.autoSaveTimer = null;
        this.originalNote = null;
    }

    connectedCallback() {
        super.connectedCallback();
        if (this.note && this.note.tags) {
            this.selectedTags = [...this.note.tags];
        }
        this.setupAutoSave();
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this.clearAutoSaveTimer();
    }

    updated(changedProperties) {
        if (changedProperties.has('note') && this.note) {
            this.selectedTags = this.note.tags || [];
            this.originalNote = this.deepCopy(this.note);
            this.saveStatus = 'saved';
            this.hasUnsavedChanges = false;
        }
    }

    toggleTag(tagId) {
        const index = this.selectedTags.findIndex(t => t && t.id === tagId);
        if (index === -1) {
            const tag = this.tags.find(t => t && t.id === tagId);
            if (tag) {
                this.selectedTags = [...this.selectedTags, tag];
            } else {
                console.error('Tag not found with ID:', tagId);
                return;
            }
        } else {
            this.selectedTags = this.selectedTags.filter(t => t && t.id !== tagId);
        }
        this.markAsChanged();
        this.requestUpdate();
    }

    setupAutoSave() {
        // Set up event listeners for input changes
        this.addEventListener('input', this.handleInputChange.bind(this));
        this.addEventListener('change', this.handleInputChange.bind(this));
    }

    handleInputChange() {
        this.markAsChanged();
    }

    markAsChanged() {
        if (!this.hasUnsavedChanges) {
            this.hasUnsavedChanges = true;
            this.saveStatus = 'unsaved';
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

        const titleInput = this.shadowRoot.querySelector('.title-input');
        const contentTextarea = this.shadowRoot.querySelector('.content-textarea');

        if (!titleInput || !contentTextarea) return false;

        const currentTitle = titleInput.value.trim();
        const currentContent = contentTextarea.value;
        const currentTagIds = this.selectedTags.map(t => t.id).sort();
        const originalTagIds = (this.originalNote.tags || []).map(t => t.id).sort();

        return currentTitle !== this.originalNote.title ||
               currentContent !== this.originalNote.content ||
               JSON.stringify(currentTagIds) !== JSON.stringify(originalTagIds);
    }

    async autoSave() {
        if (!this.note || this.loading || !this.hasUnsavedChanges) return;

        const titleInput = this.shadowRoot.querySelector('.title-input');
        const contentTextarea = this.shadowRoot.querySelector('.content-textarea');

        if (!titleInput || !contentTextarea) return;

        const updates = {
            title: titleInput.value.trim(),
            content: contentTextarea.value,
            tags: this.selectedTags.filter(t => t && t.id).map(t => t.id)
        };

        if (!updates.title) {
            this.showToast('Title is required', 'error');
            return;
        }

        this.saveStatus = 'saving';
        this.loading = true;

        try {
            const result = await window.NotesApp.updateNote(this.note.id, updates);
            // Use the tags from the server response (which should be full tag objects)
            const updatedNote = {
                ...result.data,
                tags: result.data.tags || this.selectedTags
            };

            this.dispatchEvent(new CustomEvent('note-updated', {
                detail: { note: updatedNote },
                bubbles: true,
                composed: true
            }));

            // Update our tracking
            this.originalNote = this.deepCopy(updatedNote);
            this.hasUnsavedChanges = false;
            this.saveStatus = 'saved';

        } catch (error) {
            console.error('Failed to auto-save note:', error);
            this.showToast('Failed to save changes', 'error');
            this.saveStatus = 'unsaved';
        } finally {
            this.loading = false;
        }
    }

    async handleClose() {
        // Save if there are unsaved changes
        if (this.hasUnsavedChanges) {
            await this.autoSave();
        }

        // Clear any pending auto-save timer
        this.clearAutoSaveTimer();

        this.dispatchEvent(new CustomEvent('close-editor', {
            bubbles: true,
            composed: true
        }));
    }

    showToast(message, type = 'info') {
        document.dispatchEvent(new CustomEvent('show-toast', {
            detail: { message, type }
        }));
    }

    formatDate(dateString) {
        if (!dateString) return '';
        const date = new Date(dateString);
        return date.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    render() {
        if (!this.note) {
            return html`<div>No note selected</div>`;
        }

        return html`
            <div class="editor-container">
                <div class="editor-header">
                    <input
                        type="text"
                        class="title-input"
                        .value=${this.note.title || ''}
                        placeholder="Note title..."
                        ?disabled=${this.loading}
                    />

                    <div class="tags-section">
                        <label class="tags-label">Tags</label>
                        <div class="tags-container">
                            ${this.tags?.map(tag => {
                                const isSelected = this.selectedTags.some(t => t.id === tag.id);
                                return html`
                                    <div
                                        class="tag-chip ${isSelected ? 'selected' : ''}"
                                        @click=${() => this.toggleTag(tag.id)}
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
                    </div>
                </div>

                <div class="editor-content">
                    <textarea
                        class="content-textarea"
                        .value=${this.note.content || ''}
                        placeholder="Start writing your note..."
                        ?disabled=${this.loading}
                    ></textarea>
                </div>

                <div class="editor-footer">
                    <div class="metadata">
                        <div>
                            ${this.note.updated_at ? html`
                                Last updated: ${this.formatDate(this.note.updated_at)}
                            ` : html`
                                Created: ${this.formatDate(this.note.created_at)}
                            `}
                        </div>
                        <div class="save-status ${this.saveStatus}">
                            <span class="save-indicator ${this.saveStatus}"></span>
                            ${this.saveStatus === 'saving' ? 'Saving...' :
                              this.saveStatus === 'saved' ? 'Saved' :
                              'Unsaved changes'}
                        </div>
                    </div>
                    <div class="actions">
                        <button
                            class="btn btn-secondary"
                            @click=${this.handleClose}
                            ?disabled=${this.loading}
                        >
                            <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16" style="margin-right: 0.5rem;">
                                <path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8 2.146 2.854Z"/>
                            </svg>
                            Close
                        </button>
                    </div>
                </div>
            </div>
        `;
    }
}

customElements.define('note-editor', NoteEditor);
