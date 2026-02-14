# Notes Application — Full Specification

A personal notes application built with the **minimal web stack philosophy**: no build process, minimal dependencies, and direct browser execution. Designed for a single user who values data sovereignty, offline resilience, and a clean mobile-first interface.

**Core philosophy**: Code runs directly without compilation or bundling. Frontend JavaScript is served straight to the browser via ES modules. Deno executes backend code without transpilation. Development code = Production code.

For developer setup, deployment instructions, and operational details see [README.md](README.md).

---

## Implemented Features

### Authentication

- **Google OAuth 2.0** — authorization code flow, no local passwords
- **CSRF protection** — random `state` token generated per login, validated on callback
- **Rate limiting** — auth endpoints limited to 10 requests/minute per IP (uses `X-Forwarded-For` behind proxy)
- **Secure sessions** — HTTP-only cookies, `secure` flag in production, `sameSite: lax`, 7-day expiry
- **Session data** — stores `{ id, email, name, picture }` from Google profile
- **Middleware** — `requireAuth` (API routes, returns 401), `optionalAuth` (root route), `redirectIfAuthenticated` (login page)
- **Dev bypass** — `DEV_USER_EMAIL` env var auto-authenticates for LAN/staging testing (non-production only)

### Note Editor

- **Markdown editing** — plain textarea with GitHub Flavored Markdown support (via `marked` library)
- **Edit/Preview toggle** — segmented button switches between raw Markdown editing and rendered preview; preference persisted in `localStorage`
- **Collapsible header** — title and tag chips collapse to a single-line bar; state persisted in `localStorage`
- **Tag chips** — clickable tag toggles in the editor header to assign/remove tags from the current note
- **Content limits** — title max 500 characters, content max 1MB (validated server-side)
- **Image uploads** — paste from clipboard or file picker button; inserts Markdown image syntax at cursor position
- **Save status indicator** — colored dot + text showing: Saved, Saving..., Unsaved changes, Saved locally, Save failed
- **Keyboard hides footer** — on mobile, the editor footer hides when the virtual keyboard is open (detected via `visualViewport` resize)
- **Markdown preview** — rendered via `marked` + sanitized with `DOMPurify`; supports headings, lists, code blocks, tables, blockquotes, images, links, horizontal rules
- **Close button** — saves pending changes, waits for sync (3s timeout), then navigates back to list view

### Auto-Save & Sync

- **3-second debounce** — auto-save triggers after 3 seconds of inactivity in the editor
- **SyncManager** — central coordinator that handles all save operations:
  - Saves to IndexedDB immediately (crash protection)
  - Queues network request with retry
  - Manages online/offline state transitions
  - Emits events for UI feedback (`sync-started`, `sync-completed`, `sync-failed`, `sync-pending`, `sync-offline`, `sync-online`)
- **IndexedDB persistence** — two object stores:
  - `drafts` — keyed by noteId, stores unsaved content with timestamp
  - `pending` — auto-increment queue of failed network requests
- **Crash recovery** — on startup, checks for drafts newer than server version; auto-recovers with toast notification
- **Retry with backoff** — up to 3 attempts with exponential backoff (1s, 2s, 4s; max 8s); retries on network errors, 5xx, and 429
- **Navigation guards** — `beforeunload` warns if there are pending syncs or unsaved editor changes
- **Offline queueing** — when offline, saves are queued in IndexedDB; on reconnection, queued operations are replayed in order
- **Sync status indicators** — visual indicator in top bar showing: Syncing..., N pending, Offline, Sync error (with pulsing animation)

### Image Uploads

- **Paste support** — paste images directly from clipboard into the editor
- **File picker** — toolbar button opens native file picker for image selection
- **Allowed types** — JPEG, PNG, GIF, WebP, SVG
- **Size limit** — 5MB per file (validated both client-side and server-side)
- **Magic byte validation** — server verifies file content matches declared MIME type (JPEG: `FF D8 FF`, PNG: `89 50 4E 47`, GIF: `GIF8`, WebP: `RIFF...WEBP`, SVG: checks for `<svg` or `<?xml`)
- **Per-user storage** — files stored in `./uploads/user-{id}/` with UUID filenames
- **Database tracking** — `images` table records filename, original name, MIME type, size
- **Immutable caching** — served with `Cache-Control: public, max-age=31536000, immutable`
- **SVG Content Security Policy** — images served with `Content-Security-Policy: script-src 'none'` to prevent script execution

### Full-Text Search

- **PostgreSQL tsvector** — generated column combining weighted title (A) and content (B) vectors
- **GIN index** — for fast full-text lookups
- **`plainto_tsquery`** — user-friendly query parsing (no special syntax required)
- **Weighted ranking** — title matches rank higher than content matches via `ts_rank`
- **Tag search** — queries starting with `#` search by tag name instead of content
- **Search suggestions** — live dropdown showing matching tag names and note title keywords
- **Keyboard navigation** — Arrow Up/Down to select suggestions, Enter to apply, Escape to dismiss
- **Keyboard shortcut** — Ctrl/Cmd+K focuses the search bar from anywhere
- **Debounced input** — 150ms debounce on search input to avoid excessive API calls
- **Advanced search** — POST endpoint combining text query, tag IDs, date range, and pinned filter

### Tag System

- **CRUD operations** — create, rename, recolor, and delete tags
- **Hex color picker** — each tag has a user-chosen `#RRGGBB` color
- **AND filtering** — selecting multiple tags shows notes that have ALL selected tags
- **Usage counts** — tag list shows note count per tag (excluding archived notes)
- **Lowercase normalization** — tag names are lowercased on creation
- **Unique constraint** — per-user tag names are unique (enforced at database level)
- **Cascade delete** — deleting a tag removes its associations but does not delete notes
- **"All Notes" option** — clicking clears tag filter, shows total note count

### Note Organization

- **Grid/List toggle** — two view modes with preference persisted in `localStorage`
- **Sorting** — by modified date, created date, or title; ascending or descending; persisted in `localStorage`
- **Pinned notes** — pinned notes always sort to top regardless of sort field
- **Soft delete** — DELETE sets `is_archived = true` (notes are never hard-deleted); unarchive via `PUT /api/notes/:id` with `is_archived: false`
- **Empty states** — context-specific messages for: no notes, no search results, no notes with selected tags
- **Search highlighting** — search query terms highlighted in note titles and content in the list view
- **Relative dates** — "Just now", "5 minutes ago", "3 days ago", then full date after 7 days

### Version History

- **Trigger-based** — PostgreSQL `BEFORE UPDATE` trigger captures old title + content into `note_versions` table whenever either changes
- **Auto-incrementing version number** — per-note version counter
- **Restore API** — `POST /api/notes/:id/restore/:versionId` replaces current note content with a previous version
- **Version listing** — `GET /api/notes/:id/versions` returns all versions ordered by version number

### Offline & PWA

- **Service worker** — caches app shell (HTML, JS, CSS) for offline access
- **Cache versioning** — `CACHE_NAME` constant (currently `notes-app-v24`) bumped on deployments; old caches cleaned on activate
- **Network-first for API** — API, auth, and health routes always bypass cache
- **Cache-first for static** — static assets served from cache with network fallback
- **`skipWaiting` + `clients.claim`** — new service worker activates immediately
- **Manifest** — `manifest.json` for installable PWA on mobile devices
- **IndexedDB persistence** — drafts and pending operations survive browser restarts

### Mobile Optimization

- **Drawer sidebar** — on mobile (<768px), sidebar slides in from the left as an overlay with backdrop
- **Keyboard detection** — uses `visualViewport` resize events to detect virtual keyboard; hides editor footer when keyboard is visible (150px threshold)
- **Responsive breakpoints** — mobile (<768px), tablet (768–1024px), desktop (>1024px)
- **Touch-friendly** — large tap targets, no hover-dependent interactions on mobile
- **Login page responsive** — smaller padding and font sizes on screens <375px
- **Sticky preferences** — view type, sort field, sort direction, preview mode, and header collapse state all persist in `localStorage`

### Security

- **Path traversal prevention** — static file serving resolves to absolute path and verifies it stays within `./public/`
- **CSRF state token** — OAuth login generates `crypto.randomUUID()` state, stored in session, validated on callback
- **SQL parameterization** — all database queries use parameterized statements (no string concatenation)
- **SVG CSP** — served images include `Content-Security-Policy: script-src 'none'`
- **Content size limits** — note title max 500 chars, note content max 1MB, image max 5MB
- **ETag caching** — static files served with SHA-1 content hash ETag for cache validation
- **Magic byte validation** — uploaded files verified against declared MIME type
- **XSS prevention** — Lit templates auto-escape; Markdown preview sanitized with DOMPurify; search highlighting escapes HTML before injecting
- **Rate limiting** — auth endpoints rate-limited per client IP
- **Row-level isolation** — all database queries filter by authenticated `user_id`
- **Session security** — HTTP-only, secure (production), sameSite lax, 7-day expiry

### UI Feedback

- **Toast notifications** — slide-in messages (success/error/warning/info) with 5-second auto-dismiss; color-coded left border
- **Sync status indicator** — top bar badge showing syncing/pending/offline/error state
- **Loading overlay** — semi-transparent overlay with spinner during data loading
- **Save status** — colored dot indicator in editor footer (saved/saving/unsaved/pending/error)
- **Login button state** — loading spinner and "Signing in..." text after click

---

## Planned / Future Features

- **[PLANNED] PDF export** — browser-native print-to-PDF via `window.print()` with print-optimized CSS
- **[FUTURE] Dark theme** — CSS custom properties already used throughout; would add alternate color scheme
- **[FUTURE] Multiple OAuth providers** — `auth_providers` table already supports multiple providers per user; GitHub, etc.
- **[FUTURE] Rich content embedding** — YouTube, Twitter, etc. embedded in Markdown preview
- **[FUTURE] Code syntax highlighting** — highlight.js or Prism integration for fenced code blocks
- **[FUTURE] Bi-directional linking** — `[[Note Title]]` wiki-style links between notes
- **[FUTURE] Interactive task lists** — clickable Markdown checkboxes (`- [ ]` / `- [x]`)
- **[FUTURE] User-specific encryption keys** — encrypt note content at rest with per-user keys

---

## Screens

### Login Screen

- **Purpose**: Authenticate the user via Google OAuth
- **Layout**: Centered card on a gradient background (`#667eea` → `#764ba2`)
- **Components**:
  - App name heading ("Notes App")
  - Tagline paragraph
  - "Login with Google" button — links to `/auth/login`
  - Loading state: button changes to "Signing in..." with spinner on click
  - Feedback message: "Redirecting to Google..." fades in
- **Mobile behavior**: Reduced padding/font at <375px
- **Routing**: `redirectIfAuthenticated` middleware — already logged-in users are redirected to `/`

### Main App Shell (`notes-app`)

- **Purpose**: Root component orchestrating all child components and managing global state
- **State**: `notes`, `tags`, `currentNote`, `searchQuery`, `selectedTags`, `loading`, `viewMode` (list/edit/search), `sidebarOpen`, `pendingSyncCount`, `syncStatus`
- **Layout**:
  - **Desktop**: sidebar (280px) + main content area with top bar
  - **Mobile**: full-width main content with hamburger menu toggle; sidebar as drawer overlay (240px)
- **Top bar** (desktop only): search bar, active filter badges, sync status indicator, user avatar + name + logout button
- **Mobile header**: hamburger menu + "Notes" title + sync status
- **Event handling**: listens for `note-selected`, `note-created`, `note-updated`, `note-deleted`, `search-query`, `tags-selected`, `tag-created`, `tag-updated`, `tag-deleted`, plus document-level `focus-search`, `new-note`, `escape-pressed`, `show-toast`
- **Auto-save on navigation**: saves pending editor changes before switching notes, switching views, or applying tag filters

### Sidebar

- **Purpose**: Navigation and organization
- **Components**:
  - App title ("Notes") with close button (mobile only)
  - Search bar (mobile only — desktop has it in top bar)
  - "New Note" button
  - Stats: note count (clickable — shows all notes) + tag count
  - Tag manager section

### Note List View (`note-list`)

- **Purpose**: Display and browse notes
- **Components**:
  - Header: note count with context (search query, tag filter), sort controls, grid/list toggle
  - Sort dropdown: Modified / Created / Title
  - Sort direction toggle: ascending/descending
  - Note cards: title, content preview (truncated), tag badges with color dots, relative date
  - Empty state: icon + contextual message + submessage
- **Grid view**: responsive grid (`minmax(300px, 1fr)`), cards with hover lift effect
- **List view**: single-column, compact cards with inline layout
- **Pinned notes**: always sorted to top; highlighted with subtle gradient background
- **Search highlighting**: query terms wrapped in `<span class="highlight">` (yellow background)
- **Mobile**: single-column grid, stacked header controls

### Note Editor View (`note-editor`)

- **Purpose**: Create and edit notes with Markdown support
- **Layout**: header (collapsible) → toolbar + content area → footer
- **Header (expanded)**: title input, tag chip toggles with color dots, collapse button
- **Header (collapsed)**: single-line showing note title + expand button; click anywhere to expand
- **Toolbar**: image upload button, Edit/Preview segmented toggle
- **Edit mode**: full-height textarea with Markdown placeholder text
- **Preview mode**: rendered Markdown in styled container (headings, lists, code, tables, blockquotes, images, links)
- **Footer**: last updated date, save status indicator, Close button
- **Mobile**: reduced padding, footer stacks vertically, footer hidden when virtual keyboard is open

### Search Interface (`search-bar`)

- **Purpose**: Full-text search with live suggestions
- **Layout**: search input with icon, clear button, keyboard hint (`⌘K`)
- **Suggestions dropdown**: appears below input with tag suggestions (color dot + `#name`) and term suggestions (search icon + word)
- **Keyboard navigation**: Arrow Up/Down moves selection, Enter selects or searches, Escape dismisses
- **Loading state**: spinner replaces keyboard hint while fetching suggestions
- **Focus management**: preserves focus during re-renders (prevents mobile keyboard dismissal)

### Tag Manager (`tag-manager`)

- **Purpose**: CRUD for tags and tag-based filtering
- **Layout**: vertical list of tag items with "All Notes" option at top
- **Tag items**: color dot, name, usage count, edit/delete buttons (visible on hover)
- **Selection**: click to toggle; selected tags shown with primary color background
- **Create/Edit form**: inline form with name input, color picker, save/cancel buttons
- **"Add Tag" button**: dashed-border button at bottom of list
- **Empty state**: "No tags yet. Create your first tag!"

---

## Technology Stack

| Layer | Technology | Version | Source |
|-------|-----------|---------|--------|
| Runtime | Deno | 1.40+ | System install |
| Web framework | Oak | v12.6.1 | URL import |
| Database | PostgreSQL | 12+ | System install |
| PostgreSQL driver | deno-postgres | v0.17.0 | deno.json import map |
| Session management | oak_sessions | v4.1.9 | URL import in main.js |
| Frontend framework | Lit | 3.1.0 | CDN via importmap in index.html |
| Markdown rendering | marked | latest | CDN import |
| HTML sanitization | DOMPurify | latest | CDN import |
| Assertions (tests) | Deno std/assert | 0.208.0 | URL import |

**No-build philosophy**: All frontend JS uses ES module `import` statements resolved by the browser's importmap. No webpack, Vite, Rollup, or npm. No TypeScript compilation — JSDoc provides type hints. Backend uses Deno URL imports (no `node_modules`).

---

## Architecture

### Component Model

All frontend components are Lit Web Components (`LitElement`). Each component:
- Defines `static properties` for reactive state
- Defines `static styles` for scoped CSS (Shadow DOM)
- Implements `render()` returning Lit `html` templates
- Is registered via `customElements.define()`

### State Management

- **Root component** (`notes-app`) maintains global state: `notes`, `tags`, `currentNote`, `viewMode`, `searchQuery`, `selectedTags`
- **One-way data flow**: root passes state down to children via properties
- **Events up**: children dispatch `CustomEvent`s (`bubbles: true, composed: true`) to communicate changes
- **Direct callbacks**: tag-manager uses `onTagsSelected` property callback in addition to events

### Event-Driven Communication

Key custom events:
- `note-selected` — user clicks a note in list → root loads editor
- `note-created` / `note-updated` / `note-deleted` — CRUD outcomes → root updates state
- `search-query` — search input changes → root triggers search/filter
- `tags-selected` — tag filter changes → root switches to list view and filters
- `tag-created` / `tag-updated` / `tag-deleted` — tag CRUD → root updates tags array
- `close-editor` — editor close button → root switches to list view
- Document-level: `focus-search`, `new-note`, `escape-pressed`, `show-toast`
- Sync events: `sync-started`, `sync-completed`, `sync-failed`, `sync-pending`, `sync-offline`, `sync-online`, `sync-draft-saved`, `sync-recovery-found`

### Sync Architecture

```
Component (note-editor)
  → autoSave() after 3s debounce
  → NotesApp.saveNoteWithSync(id, updates, serverUpdatedAt)
    → SyncManager.saveNote()
      → 1. Save to IndexedDB (crash protection)
      → 2. Queue network request
      → 3. If online: POST to API with retry (3 attempts, exponential backoff)
         If offline: queue in IndexedDB pending store
      → 4. Emit sync events for UI feedback
```

### Global API Client

`window.NotesApp` (defined in `app.js`) provides:
- `request(endpoint, options)` — base fetch wrapper with auth redirect on 401
- CRUD methods for notes, tags, search, images
- `saveNoteWithSync()` — sync-manager-backed save
- `waitForSync(timeout)` — blocking wait for pending syncs
- Keyboard shortcut handlers (Ctrl+K search, Ctrl+N new note, Escape)
- Toast notification helper

---

## Data Model

### Tables

#### `users`
| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| email | VARCHAR(255) | UNIQUE NOT NULL |
| name | VARCHAR(255) | |
| picture | TEXT | |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |
| updated_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |
| last_login | TIMESTAMP | |
| preferences | JSONB | DEFAULT '{}' |

#### `auth_providers`
| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| user_id | INTEGER | NOT NULL, FK → users(id) ON DELETE CASCADE |
| provider | VARCHAR(50) | NOT NULL |
| provider_user_id | VARCHAR(255) | NOT NULL |
| access_token | TEXT | |
| refresh_token | TEXT | |
| token_expires_at | TIMESTAMP | |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |
| updated_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |

UNIQUE(provider, provider_user_id)

#### `notes`
| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| user_id | INTEGER | NOT NULL, FK → users(id) ON DELETE CASCADE |
| title | VARCHAR(500) | NOT NULL |
| content | TEXT | DEFAULT '' |
| content_plain | TEXT | DEFAULT '' |
| is_pinned | BOOLEAN | DEFAULT FALSE |
| is_archived | BOOLEAN | DEFAULT FALSE |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |
| updated_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |
| search_vector | tsvector | GENERATED ALWAYS AS (weighted title A + content_plain B) STORED |

#### `tags`
| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| user_id | INTEGER | NOT NULL, FK → users(id) ON DELETE CASCADE |
| name | VARCHAR(100) | NOT NULL |
| color | VARCHAR(7) | DEFAULT '#667eea' |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |

UNIQUE(user_id, name)

#### `note_tags`
| Column | Type | Constraints |
|--------|------|-------------|
| note_id | INTEGER | NOT NULL, FK → notes(id) ON DELETE CASCADE |
| tag_id | INTEGER | NOT NULL, FK → tags(id) ON DELETE CASCADE |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |

PRIMARY KEY (note_id, tag_id)

#### `note_versions`
| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| note_id | INTEGER | NOT NULL, FK → notes(id) ON DELETE CASCADE |
| title | VARCHAR(500) | NOT NULL |
| content | TEXT | |
| version_number | INTEGER | NOT NULL |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |
| created_by | INTEGER | FK → users(id) |

#### `images`
| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| user_id | INTEGER | NOT NULL, FK → users(id) ON DELETE CASCADE |
| filename | VARCHAR(255) | NOT NULL |
| original_name | VARCHAR(500) | |
| mime_type | VARCHAR(100) | NOT NULL |
| size_bytes | INTEGER | NOT NULL |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |

UNIQUE(user_id, filename)

### Extensions

- `uuid-ossp` — UUID generation
- `pg_trgm` — trigram matching for similarity search

### Triggers

- **`update_users_updated_at`** — BEFORE UPDATE on `users`: sets `updated_at = CURRENT_TIMESTAMP`
- **`update_notes_updated_at`** — BEFORE UPDATE on `notes`: sets `updated_at = CURRENT_TIMESTAMP`
- **`create_note_version_trigger`** — BEFORE UPDATE on `notes`: if title or content changed, inserts old values into `note_versions` with incremented version number

### Indexes

- `idx_users_email` — B-tree on `users(email)`
- `idx_auth_providers_user` — B-tree on `auth_providers(user_id)`
- `idx_notes_user` — B-tree on `notes(user_id)`
- `idx_notes_created` — B-tree on `notes(created_at DESC)`
- `idx_notes_updated` — B-tree on `notes(updated_at DESC)`
- `idx_notes_pinned` — partial B-tree on `notes(is_pinned) WHERE is_pinned = true`
- `idx_notes_search` — GIN on `notes(search_vector)`
- `idx_tags_user` — B-tree on `tags(user_id)`
- `idx_note_tags_note` — B-tree on `note_tags(note_id)`
- `idx_note_tags_tag` — B-tree on `note_tags(tag_id)`
- `idx_note_versions_note` — B-tree on `note_versions(note_id)`
- `idx_images_user` — B-tree on `images(user_id)`

---

## API Contracts

All API endpoints require authentication via session cookie (enforced by `requireAuth` middleware). Unauthenticated requests return `401`. All responses are JSON.

### Health Check

```
GET /health
→ 200 { status: "healthy", timestamp: "...", version: "1.0.0" }
```

No authentication required.

### Authentication

```
GET  /auth/login     → 302 redirect to Google OAuth (rate limited)
GET  /auth/callback  → 302 redirect to / on success (validates CSRF state)
POST /auth/logout    → 200 { success: true, redirectTo: "/" }
```

### Notes

**List notes**
```
GET /api/notes?limit=20&offset=0&tags=1,2,3&search=query&pinned=true&archived=true
→ 200 {
    success: true,
    data: { notes: [ { id, user_id, title, content, content_plain, is_pinned, is_archived,
              created_at, updated_at, tags: [{id, name, color}] } ] },
    meta: { limit, offset, hasMore }
  }
```

When `archived=true`, returns only archived notes. Otherwise returns only non-archived notes (default).

**Get single note**
```
GET /api/notes/:id
→ 200 { success: true, data: { ...note, tags: [{id, name, color}] } }
→ 404 { success: false, error: "Note not found" }
```

**Create note**
```
POST /api/notes
Body: { title: string, content: string, tags: number[] }
→ 201 { success: true, data: { ...note } }
→ 400 { success: false, error: "Title and content are required" }
→ 400 { success: false, error: "Title must be 500 characters or less" }
→ 400 { success: false, error: "Content must be 1MB or less" }
```

**Update note**
```
PUT /api/notes/:id
Body: { title?, content?, tags?: number[], is_pinned?: boolean, is_archived?: boolean }
→ 200 { success: true, data: { ...note, tags: [{id, name, color}] } }
→ 404 { success: false, error: "Note not found" }
```

Setting `is_archived: false` unarchives a previously deleted note. The ownership check does not filter by archive status, so archived notes can be updated/unarchived.

**Delete note (soft)**
```
DELETE /api/notes/:id
→ 200 { success: true, data: { id, archived: true } }
→ 404 { success: false, error: "Note not found" }
```

**Get version history**
```
GET /api/notes/:id/versions
→ 200 { success: true, data: [ { id, note_id, title, content, version_number, created_at } ] }
```

**Restore version**
```
POST /api/notes/:id/restore/:versionId
→ 200 { success: true, data: { ...restoredNote, tags: [{id, name, color}] } }
```

### Tags

**List tags** (with usage counts, excluding archived notes)
```
GET /api/tags
→ 200 { success: true, data: [ { id, name, color, note_count } ] }
```

**Create tag**
```
POST /api/tags
Body: { name: string, color?: "#RRGGBB" }
→ 201 { success: true, data: { id, name, color } }
→ 409 { success: false, error: "Tag already exists" }
```

**Update tag**
```
PUT /api/tags/:id
Body: { name?: string, color?: "#RRGGBB" }
→ 200 { success: true, data: { ...tag } }
→ 404 { success: false, error: "Tag not found" }
→ 409 { success: false, error: "Tag name already exists" }
```

**Delete tag**
```
DELETE /api/tags/:id
→ 200 { success: true, data: { id, name, notesAffected: number } }
→ 404 { success: false, error: "Tag not found" }
```

**Get notes by tag**
```
GET /api/tags/:id/notes?limit=20&offset=0
→ 200 { success: true, data: { tag: {id, name}, notes: [...] }, meta: {limit, offset, hasMore} }
```

### Search

**Full-text search**
```
GET /api/search?q=query&limit=20&offset=0
→ 200 { success: true, data: { query, results: [...] }, meta: {total, limit, offset, hasMore} }
→ 400 { success: false, error: "Search query (q) is required" }
```

Supports `#tagname` prefix to search by tag instead of content.

**Search suggestions**
```
GET /api/search/suggestions?q=query&limit=10
→ 200 { success: true, data: { query, suggestions: [
    { type: "tag", text, color, display },
    { type: "term", text, display }
  ] } }
```

**Recent activity**
```
GET /api/search/recent?limit=10
→ 200 { success: true, data: { recentNotes: [...], popularTags: [...] } }
```

**Advanced search**
```
POST /api/search/advanced
Body: { query?, tags?: number[], dateFrom?, dateTo?, isPinned?: boolean, limit?: 20, offset?: 0 }
→ 200 { success: true, data: { criteria, results: [...] }, meta: {total, limit, offset, hasMore} }
```

Tags parameter accepts tag IDs (integers), consistent with `GET /api/notes?tags=1,2,3`.

### Images

**Upload image**
```
POST /api/images
Body: multipart/form-data with "file" field
→ 201 { success: true, data: { filename, url, originalName, mimeType, size } }
→ 400 { success: false, error: "No file uploaded" }
→ 400 { success: false, error: "Invalid file type: ..." }
→ 400 { success: false, error: "File content does not match declared type" }
→ 400 { success: false, error: "File too large. Maximum size is 5MB" }
```

**Serve image**
```
GET /api/images/:filename
→ 200 (binary image with appropriate Content-Type)
→ 404 { success: false, error: "Image not found" }
```

Headers: `Cache-Control: public, max-age=31536000, immutable`, `Content-Security-Policy: script-src 'none'`

**Delete image**
```
DELETE /api/images/:filename
→ 200 { success: true, data: { filename, deleted: true } }
→ 404 { success: false, error: "Image not found" }
```

---

## Project Structure

```
├── server/
│   ├── main.js                  # Oak server, routes, middleware, rate limiting
│   ├── auth/
│   │   ├── auth-handler.js      # Google OAuth 2.0 token exchange + user info
│   │   └── middleware.js        # requireAuth, optionalAuth, redirectIfAuthenticated
│   ├── database/
│   │   ├── client.js            # PostgreSQL connection pool + query wrapper
│   │   └── schema.sql            # Database schema (IF NOT EXISTS, idempotent)
│   └── api/
│       ├── notes.js             # Notes CRUD + versions + restore
│       ├── tags.js              # Tags CRUD + notes-by-tag
│       ├── search.js            # Full-text search + suggestions + recent + advanced
│       └── images.js            # Image upload + serve + delete
├── public/
│   ├── index.html               # App shell with importmap
│   ├── app.js                   # Global API client, keyboard shortcuts, sync init
│   ├── components/
│   │   ├── notes-app.js         # Root component (state management, event orchestration)
│   │   ├── note-editor.js       # Markdown editor with preview, auto-save, image upload
│   │   ├── note-list.js         # Grid/list view with sorting and search highlighting
│   │   ├── search-bar.js        # Search input with live suggestions
│   │   └── tag-manager.js       # Tag CRUD and filter selection
│   ├── services/
│   │   ├── persistence.js       # IndexedDB wrapper (drafts + pending queue)
│   │   └── sync-manager.js      # Save coordinator with retry and offline support
│   ├── utils/
│   │   └── text.js              # HTML escaping and search term highlighting
│   ├── styles/
│   │   └── app.css              # Mobile-first CSS with custom properties
│   ├── sw.js                    # Service worker (cache-first static, network-first API)
│   └── manifest.json            # PWA manifest
├── uploads/                     # User-uploaded images (gitignored)
│   └── user-{id}/               # Per-user image directories
├── tests/
│   └── deno/                    # Unit tests (text utils, strip markdown, SQL parser, auth handler)
├── poc/                         # Proof-of-concept experiments (not part of main app)
├── deno.json                    # Deno config with tasks and import map
├── .env.example                 # Environment variable template
├── CLAUDE.md                    # AI coding assistant instructions
├── README.md                    # Developer quickstart and deployment guide
└── REQUIREMENTS.md              # This file — full specification
```

---

## Environment Configuration

### Required

| Variable | Description |
|----------|-------------|
| `GOOGLE_CLIENT_ID` | Google Cloud Console OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret |
| `GOOGLE_REDIRECT_URI` | Must match Console exactly (e.g., `http://localhost:8000/auth/callback`) |
| `DB_USER` | PostgreSQL user |
| `DB_NAME` | PostgreSQL database name |
| `DB_PASSWORD` | PostgreSQL password |
| `SESSION_SECRET` | Random string for session encryption |

### Optional

| Variable | Description |
|----------|-------------|
| `PORT` | Server port (default: 8000) |
| `HOST` | Bind address (default: localhost) |
| `DB_HOST` | Database host (default: localhost) |
| `DB_PORT` | Database port (default: 5432) |
| `NODE_ENV` | `production` enables secure cookies |
| `DEBUG_SQL` | Enable SQL query logging |
| `RESET_DATABASE` | `true` to use drop-and-recreate schema on startup |
| `DEV_USER_EMAIL` | Auto-authenticate as this user (non-production only) |
