/**
 * Tag Manager Component
 */
import { LitElement, html, css } from 'lit';

export class TagManager extends LitElement {
    static properties = {
        tags: { type: Array },
        selectedTags: { type: Array },
        showCreateForm: { type: Boolean },
        editingTag: { type: Object },
        onTagsSelected: { type: Function }
    };

    static styles = css`
        :host {
            display: block;
        }

        .tags-container {
            display: flex;
            flex-direction: column;
            gap: 0.75rem;
        }

        .tag-item {
            display: flex;
            align-items: center;
            padding: 0.5rem 0.75rem;
            background: var(--white);
            border: 1px solid var(--gray-200);
            border-radius: 0.5rem;
            cursor: pointer;
            transition: all 0.2s;
            position: relative;
        }

        .tag-item:hover {
            background: var(--gray-50);
            border-color: var(--gray-300);
        }

        .tag-item.selected {
            background: var(--primary);
            color: white;
            border-color: var(--primary);
        }

        .tag-item.selected .tag-name,
        .tag-item.selected .tag-count {
            color: white;
        }

        .tag-color {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            margin-right: 0.75rem;
            flex-shrink: 0;
        }

        .tag-name {
            flex: 1;
            font-size: 0.875rem;
            font-weight: 500;
            color: var(--gray-700);
        }

        .tag-count {
            font-size: 0.75rem;
            color: var(--gray-500);
            margin-left: 0.5rem;
        }

        .tag-actions {
            display: none;
            gap: 0.25rem;
            margin-left: 0.5rem;
        }

        .tag-item:hover .tag-actions {
            display: flex;
        }

        .tag-action-btn {
            padding: 0.25rem;
            background: transparent;
            border: none;
            cursor: pointer;
            color: var(--gray-500);
            border-radius: 0.25rem;
            transition: all 0.2s;
        }

        .tag-action-btn:hover {
            background: var(--gray-200);
            color: var(--gray-700);
        }

        .tag-item.selected .tag-action-btn {
            color: rgba(255, 255, 255, 0.8);
        }

        .tag-item.selected .tag-action-btn:hover {
            background: rgba(255, 255, 255, 0.2);
            color: white;
        }

        .add-tag-btn {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 0.5rem;
            width: 100%;
            padding: 0.5rem 0.75rem;
            background: var(--gray-50);
            border: 1px dashed var(--gray-300);
            border-radius: 0.5rem;
            color: var(--gray-600);
            font-size: 0.875rem;
            cursor: pointer;
            transition: all 0.2s;
        }

        .add-tag-btn:hover {
            background: var(--gray-100);
            border-color: var(--gray-400);
            color: var(--gray-700);
        }

        .tag-form {
            background: var(--white);
            border: 1px solid var(--gray-200);
            border-radius: 0.5rem;
            padding: 1rem;
            margin-bottom: 0.75rem;
        }

        .form-group {
            margin-bottom: 0.75rem;
        }

        .form-label {
            display: block;
            font-size: 0.75rem;
            font-weight: 500;
            color: var(--gray-700);
            margin-bottom: 0.25rem;
        }

        .form-input {
            width: 100%;
            padding: 0.5rem;
            border: 1px solid var(--gray-300);
            border-radius: 0.375rem;
            font-size: 0.875rem;
            font-family: var(--font-family);
        }

        .form-input:focus {
            outline: none;
            border-color: var(--primary);
            box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }

        .color-picker {
            display: flex;
            gap: 0.5rem;
            align-items: center;
        }

        .color-input {
            width: 50px;
            height: 36px;
            padding: 0.25rem;
            border: 1px solid var(--gray-300);
            border-radius: 0.375rem;
            cursor: pointer;
        }

        .color-preview {
            flex: 1;
            padding: 0.5rem;
            border: 1px solid var(--gray-300);
            border-radius: 0.375rem;
            font-size: 0.875rem;
            font-family: monospace;
            background: var(--gray-50);
        }

        .form-actions {
            display: flex;
            gap: 0.5rem;
            margin-top: 1rem;
        }

        .btn {
            padding: 0.375rem 0.75rem;
            border-radius: 0.375rem;
            font-size: 0.875rem;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s;
            border: none;
        }

        .btn-primary {
            background: var(--primary);
            color: white;
        }

        .btn-primary:hover {
            background: var(--primary-dark);
        }

        .btn-secondary {
            background: var(--gray-100);
            color: var(--gray-700);
            border: 1px solid var(--gray-300);
        }

        .btn-secondary:hover {
            background: var(--gray-200);
        }

        .all-tags-option {
            margin-bottom: 0.75rem;
            padding-bottom: 0.75rem;
            border-bottom: 1px solid var(--gray-200);
        }

        .empty-state {
            text-align: center;
            padding: 1.5rem;
            color: var(--gray-500);
            font-size: 0.875rem;
        }
    `;

    constructor() {
        super();
        this.tags = [];
        this.selectedTags = [];
        this.showCreateForm = false;
        this.editingTag = null;
    }

    toggleTag(tag) {
        console.log('  SIMPLE - toggleTag called with tag:', tag);
        const index = this.selectedTags.findIndex(t => t.id === tag.id);
        let newSelection;

        if (index === -1) {
            newSelection = [...this.selectedTags, tag];
        } else {
            newSelection = this.selectedTags.filter(t => t.id !== tag.id);
        }

        console.log('  SIMPLE - New tag selection:', newSelection);
        this.selectedTags = newSelection;

        // Use direct callback instead of events
        if (this.onTagsSelected) {
            console.log('  SIMPLE - Calling onTagsSelected callback');
            this.onTagsSelected(newSelection);
        } else {
            console.log('  SIMPLE - No onTagsSelected callback found');
        }
    }

    clearSelection() {
        this.selectedTags = [];
        if (this.onTagsSelected) {
            this.onTagsSelected([]);
        }
    }

    showCreateTagForm() {
        this.showCreateForm = true;
        this.editingTag = null;
        this.requestUpdate();
    }

    showEditTagForm(e, tag) {
        e.stopPropagation();
        this.editingTag = { ...tag };
        this.showCreateForm = true;
        this.requestUpdate();
    }

    async handleSubmit(e) {
        e.preventDefault();
        const form = e.target;
        const formData = new FormData(form);
        const name = formData.get('name').trim();
        const color = formData.get('color');

        if (!name) {
            this.showToast('Tag name is required', 'error');
            return;
        }

        try {
            let savedTag;
            if (this.editingTag) {
                // Update existing tag
                const result = await window.NotesApp.updateTag(this.editingTag.id, { name, color });
                savedTag = result.data;

                this.dispatchEvent(new CustomEvent('tag-updated', {
                    detail: { tag: savedTag },
                    bubbles: true,
                    composed: true
                }));
            } else {
                // Create new tag
                const result = await window.NotesApp.createTag({ name, color });
                savedTag = result.data;

                this.dispatchEvent(new CustomEvent('tag-created', {
                    detail: { tag: savedTag },
                    bubbles: true,
                    composed: true
                }));
            }

            // Refresh tags
            const result = await window.NotesApp.getTags();
            this.tags = result.data || [];

            // Reset form
            this.showCreateForm = false;
            this.editingTag = null;
        } catch (error) {
            console.error('Failed to save tag:', error);
            this.showToast('Failed to save tag. Please try again.', 'error');
        }
    }

    async deleteTag(e, tag) {
        e.stopPropagation();
        if (!confirm(`Delete tag "${tag.name}"?`)) return;

        try {
            await window.NotesApp.deleteTag(tag.id);

            // Dispatch tag-deleted event
            this.dispatchEvent(new CustomEvent('tag-deleted', {
                detail: { tagId: tag.id },
                bubbles: true,
                composed: true
            }));

            // Refresh tags
            const result = await window.NotesApp.getTags();
            this.tags = result.data || [];

            // Remove from selection if it was selected
            this.selectedTags = this.selectedTags.filter(t => t.id !== tag.id);
            this.dispatchEvent(new CustomEvent('tags-selected', {
                detail: { tags: this.selectedTags },
                bubbles: true,
                composed: true
            }));
        } catch (error) {
            console.error('Failed to delete tag:', error);
            this.showToast('Failed to delete tag. Please try again.', 'error');
        }
    }

    cancelForm() {
        this.showCreateForm = false;
        this.editingTag = null;
        this.requestUpdate();
    }

    showToast(message, type = 'info') {
        document.dispatchEvent(new CustomEvent('show-toast', {
            detail: { message, type }
        }));
    }

    renderTagForm() {
        const isEditing = !!this.editingTag;
        const tag = this.editingTag || { name: '', color: '#667eea' };

        return html`
            <form class="tag-form" @submit=${this.handleSubmit}>
                <div class="form-group">
                    <label class="form-label">Tag Name</label>
                    <input
                        type="text"
                        name="name"
                        class="form-input"
                        .value=${tag.name}
                        placeholder="Enter tag name..."
                        required
                    />
                </div>

                <div class="form-group">
                    <label class="form-label">Color</label>
                    <div class="color-picker">
                        <input
                            type="color"
                            name="color"
                            class="color-input"
                            .value=${tag.color}
                        />
                        <input
                            type="text"
                            class="color-preview"
                            .value=${tag.color}
                            readonly
                        />
                    </div>
                </div>

                <div class="form-actions">
                    <button type="submit" class="btn btn-primary">
                        ${isEditing ? 'Update' : 'Create'}
                    </button>
                    <button type="button" class="btn btn-secondary" @click=${this.cancelForm}>
                        Cancel
                    </button>
                </div>
            </form>
        `;
    }

    render() {
        const hasSelection = this.selectedTags.length > 0;

        return html`
            <div class="tags-container">
                ${this.showCreateForm ? this.renderTagForm() : ''}

                <div class="all-tags-option">
                    <div
                        class="tag-item ${!hasSelection ? 'selected' : ''}"
                        @click=${() => this.clearSelection()}
                    >
                        <div class="tag-color" style="background: var(--gray-400)"></div>
                        <div class="tag-name">All Notes</div>
                        <div class="tag-count">${this.tags.reduce((sum, t) => sum + (t.note_count || 0), 0)}</div>
                    </div>
                </div>

                ${this.tags.length === 0 && !this.showCreateForm ? html`
                    <div class="empty-state">
                        No tags yet. Create your first tag!
                    </div>
                ` : ''}

                ${this.tags.map(tag => {
                    const isSelected = this.selectedTags.some(t => t.id === tag.id);
                    return html`
                        <div
                            class="tag-item ${isSelected ? 'selected' : ''}"
                            @click=${() => this.toggleTag(tag)}
                        >
                            <div class="tag-color" style="background-color: ${tag.color}"></div>
                            <div class="tag-name">${tag.name}</div>
                            <div class="tag-count">${tag.note_count || 0}</div>
                            <div class="tag-actions">
                                <button
                                    class="tag-action-btn"
                                    @click=${(e) => this.showEditTagForm(e, tag)}
                                    title="Edit tag"
                                >
                                    <svg width="14" height="14" fill="currentColor" viewBox="0 0 16 16">
                                        <path d="M12.146.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1 0 .708l-10 10a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168l10-10zM11.207 2.5 13.5 4.793 14.793 3.5 12.5 1.207 11.207 2.5zm1.586 3L10.5 3.207 4 9.707V10h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.293l6.5-6.5zm-9.761 5.175-.106.106-1.528 3.821 3.821-1.528.106-.106A.5.5 0 0 1 5 12.5V12h-.5a.5.5 0 0 1-.5-.5V11h-.5a.5.5 0 0 1-.468-.325z"/>
                                    </svg>
                                </button>
                                <button
                                    class="tag-action-btn"
                                    @click=${(e) => this.deleteTag(e, tag)}
                                    title="Delete tag"
                                >
                                    <svg width="14" height="14" fill="currentColor" viewBox="0 0 16 16">
                                        <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/>
                                        <path fill-rule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/>
                                    </svg>
                                </button>
                            </div>
                        </div>
                    `;
                })}

                ${!this.showCreateForm ? html`
                    <button class="add-tag-btn" @click=${this.showCreateTagForm}>
                        <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                            <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"/>
                        </svg>
                        Add Tag
                    </button>
                ` : ''}
            </div>
        `;
    }
}

customElements.define('tag-manager', TagManager);
