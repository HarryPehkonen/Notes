# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a notes application built with the **minimal web stack philosophy**: no build process, minimal dependencies, and direct browser execution. The app features secure OAuth authentication, full-text search, offline support, and a mobile-first design.

**Key principle**: Code runs directly without compilation or bundling. Frontend JavaScript is served straight to the browser, and Deno executes backend code without transpilation.

## Development Commands

### Running the Application

```bash
# Development with auto-reload (localhost:8000)
deno task dev

# Production start (localhost:8000, behind reverse proxy)
deno task start

# Staging (0.0.0.0:8000, direct external access)
deno task staging

# Lint code
deno task lint

# Format code
deno task fmt
```

### Testing

```bash
# Run Deno unit tests
deno task test
```

**Before committing or pushing, run the gate:** `scripts/gate.sh` — lint, the
full suite (currently 705 tests passing), `deno fmt --check` on the files this
branch touched, and the version-bump invariant (a `public/` change must move
`public/version.js`, checked by `tests/deno/app_version_test.ts` keeping
`APP_VERSION` and `CACHE_NAME` equal). It runs in three places: by hand, as a
pre-push hook (arm once per clone with `git config core.hooksPath
.githooks` — `.githooks/pre-push` just execs `scripts/gate.sh`), and nightly on
a clean checkout (`notes-gate-watch`, 07:30, clones fresh and also probes
harrisnotes.ca for wire-only invariants — 401 not 404 on a protected route,
static assets serving 200; silent unless something is wrong). See README "The
gate" for detail. A new test file must be named `*_test.ts` or `deno test
tests/deno/` silently never discovers it.

**Guard suites worth knowing by name** — each exists because something broke
in production first: `route_contract_test.ts` (client/server URL contract, see
below), `session_user_injection_test.ts` (the `{{SESSION_USER_NAME}}` HTML
injection is escaped and empty-safe), `drawer_logout_test.ts` (logout is
labelled, reachable, and not in the pinned footer), `auth_logout_test.ts`
(`POST /api/auth/logout(-all)` exist and behave), `api_paths_test.ts` (the two
dynamically-built client URLs), and `note_ref_test.ts` (note id display
formatting).

**The URL contract is tested, not assumed.** `tests/deno/route_contract_test.ts`
reads every client call site in `public/app.js` and every server route (with
each router's mount prefix, derived from `server/main.js`) and fails if a call
has no route — by name, with the URL. Add a client call and it must resolve.
Exactly two call sites (`getNotes`, `setNoteTag`) build their path dynamically
and are counted explicitly; the tag one's composed URL is pinned in
`tests/deno/api_paths_test.ts`.

### Database Operations

The server uses a single schema file:

- **`schema.sql`** - Production-safe with `IF NOT EXISTS` (idempotent)

```bash
# Normal startup (preserves data)
deno task start

# Reset database (DESTROYS ALL DATA)
RESET_DATABASE=true deno task dev

# Database backup
pg_dump -U notes_user notes_app > backup.sql

# Database restore
psql -U notes_user -d notes_app < backup.sql

# Connect to database for debugging
psql -U notes_user -d notes_app
```

## Architecture

### Technology Stack

- **Backend**: Deno runtime with Oak framework
- **Database**: PostgreSQL with native `tsvector`/GIN full-text search, plus
  `pgvector` for semantic search over note embeddings
- **Frontend**: Lit Web Components v3.1.0 (CDN imports, no npm)
- **Authentication**: Google OAuth 2.0
- **Deployment**: Self-hosted with systemd + Caddy

### Core Principle: No Build Process

- Frontend JavaScript uses ES modules loaded directly from CDN (Lit Web Components v3.1.0)
- Backend uses Deno with URL imports (no node_modules)
- Development code = Production code
- JSDoc annotations provide type safety without TypeScript compilation
- Static files served directly by Caddy in production

### Project Structure

```
├── server/
│   ├── main.js               # Oak server, routes, and initialization
│   ├── session-user.js       # Injects the signed-in user's name into index.html
│   ├── branding.js           # Injects APP_NAME/APP_SHORT_NAME; escapeHtml()
│   ├── security-headers.js   # CSP middleware (per-request nonce; img-src has no photo host)
│   ├── session-store.js      # PostgresSessionStore (oak_sessions backed by Postgres)
│   ├── rate-limit.js         # In-memory sliding-window rate limiting
│   ├── static-cache.js       # Cache-Control policy for /static/
│   ├── static-conditions.js  # ETag / If-None-Match helpers for /static/
│   ├── auth/
│   │   ├── auth-handler.js   # Google OAuth 2.0 implementation
│   │   ├── api-tokens.js     # Personal API token generation/hashing/extraction
│   │   └── middleware.js     # requireAuth, optionalAuth, redirectIfAuthenticated
│   ├── cli/
│   │   ├── args.js           # Pure arg parsing for the token CLI
│   │   └── tokens.js         # token:create / token:list / token:revoke
│   ├── database/
│   │   ├── client.js         # PostgreSQL connection and query wrapper
│   │   └── schema.sql        # Database schema (auto-applied on startup)
│   ├── services/
│   │   └── ws-connections.js # Per-user WebSocket registry for live-sync broadcasts
│   └── api/
│       ├── notes.js          # CRUD endpoints for notes
│       ├── note-fields.js    # Normalizes note fields before persisting
│       ├── tags.js           # Tag management endpoints
│       ├── tag-filter.js     # buildTagFilterClause - shared by notes/search/semantic
│       ├── tag-input.js      # Tag input validation and name normalization
│       ├── search.js         # Full-text search with PostgreSQL
│       ├── search-query.js   # Splits a query into text tokens and '#tag' tokens
│       ├── semantic.js       # Embedding (semantic) search over note_embeddings
│       ├── embed.js          # Embedding client (local llama.cpp server)
│       ├── auth.js           # /api/auth: logout, logout-all
│       └── images.js         # Note image upload/serve/delete
├── public/
│   ├── index.html            # Main app shell (served to authenticated users)
│   ├── app.js                # Main application logic
│   ├── version.js            # APP_VERSION/CACHE_NAME - gate fails if public/ moves without it
│   ├── components/           # Lit Web Components (loaded via ES modules)
│   │   ├── notes-app.js      # Root component orchestrating the app
│   │   ├── note-editor.js    # Markdown note editing interface
│   │   ├── note-list.js      # Notes listing with filtering
│   │   ├── search-bar.js     # Search interface with live results
│   │   └── tag-manager.js    # Tag CRUD and color management
│   ├── services/
│   │   ├── live-sync.js      # WebSocket client for live updates
│   │   ├── persistence.js    # Local/offline persistence
│   │   └── sync-manager.js   # Reconciles local state with the server
│   ├── utils/                # Pure, unit-tested helpers - one concern each
│   │   ├── text.js           # HTML escaping and search highlighting
│   │   ├── icons.js          # Shared inline SVG icon set
│   │   ├── branding.js       # Reads injected app-name/app-short-name meta tags
│   │   ├── session-user.js   # Reads the injected session-user-name meta tag
│   │   ├── note-ref.js       # Note id, formatted for on-screen display
│   │   ├── notes-query.js    # GET /api/notes request shape (tag-only list)
│   │   ├── notes-response.js # Parses a notes payload: rows, total, hasMore
│   │   ├── tag-endpoint.js   # Routes a single tag attach/detach edit
│   │   ├── tag-filter.js     # Tri-state tag filtering (any/required/excluded)
│   │   ├── search-mode.js    # Search request shape; semantic-mode toggle
│   │   ├── search-match.js   # Match-badge helpers for semantic search results
│   │   ├── pin-state.js      # Pin toggle wording and note pin state
│   │   ├── version-list.js   # Version-history rows: Current, then newest-first
│   │   ├── editor-state.js   # Pure editor state decisions (no DOM)
│   │   ├── checkboxes.js     # Clickable checkbox markers in markdown notes
│   │   ├── inert-html.js     # Inerts raw HTML embedded in the markdown preview
│   │   ├── list-summary.js   # Notes-header count/summary text
│   │   ├── toast-queue.js    # Toast id/queue management
│   │   └── print.js          # Pure helpers for printing a note
│   ├── styles/
│   │   └── app.css           # Mobile-first CSS (no frameworks)
│   └── sw.js                 # Service worker for PWA functionality
├── tests/
│   └── deno/                 # ~54 *_test.ts files, plus setup.ts and
│                              # route_contract.ts (shared, not itself a test)
├── scripts/
│   ├── gate.sh                # lint + test + fmt + version-bump gate (see Testing)
│   └── embed-notes.ts         # Backfills note_embeddings for semantic search
├── .githooks/
│   └── pre-push                # Runs scripts/gate.sh; opt in with core.hooksPath
└── poc/                      # Proof-of-concept projects (not part of main app)
    ├── dropbox-poc/          # Dropbox API integration testing
    ├── google-auth-poc/      # Google OAuth flow prototyping
    └── postgres-poc/         # PostgreSQL full-text search experiments
```

### Request Flow

1. **Unauthenticated user** → `/` → Redirected to `/login` (serves `public/login.html`)
2. **Login** → `/auth/login` → Redirects to Google OAuth → `/auth/callback` → Creates/updates user in database → Creates session → Redirects to `/`
3. **Authenticated user** → `/` → Serves `public/index.html` → Loads Lit components from `/components/` → Components make API calls to `/api/*`
4. **API requests** → Pass through `requireAuth` middleware (checks session) → Routed to appropriate handler → Database operations via `DatabaseClient`

### Component Communication Pattern

The frontend uses an **event-driven architecture** where:

- **Root component** (`notes-app.js`) maintains global state: `notes`, `tags`, `currentNote`, `viewMode`
- **Child components** receive state via properties (one-way data flow)
- **Children communicate up** via custom events dispatched to parent
- **Root listens to events** and updates state, triggering re-renders

Example flow:

```javascript
// Child component dispatches event
this.dispatchEvent(new CustomEvent('note-selected', {
  detail: { noteId: 123 }
}));

// Root component listens and updates state
handleNoteSelected(e) {
  this.currentNote = await NotesApp.getNote(e.detail.noteId);
  this.viewMode = 'edit';
}
```

Key events:

- `note-selected` - User selects a note from list
- `note-updated` - Note has been modified
- `tags-selected` - User filters by tags
- `search-query` - User performs search

### Database Schema

PostgreSQL with the following key tables:

- **users**: User profiles (email, name, picture from OAuth)
- **auth_providers**: OAuth provider linkage (Google, GitHub)
- **notes**: Core notes table with `search_vector` (generated tsvector column for full-text search)
- **tags**: User-specific tags with colors
- **note_tags**: Many-to-many relationship between notes and tags
- **note_versions**: Automatic version history (created via database trigger)
- **sessions**: Server-side session storage for `oak_sessions`; `last_seen_at`
  slides on every request so active logins never expire
- **images**: Uploaded note images (`UNIQUE(user_id, filename)`)
- **note_embeddings**: One BGE-M3 vector (`vector(1024)`) per note for semantic search
- **api_tokens**: Personal API tokens for machine clients (SHA-256 digest only, `UNIQUE(user_id, name)`)

**Key features**:

- Full-text search using PostgreSQL's native `tsvector` with weighted search (title=A, content=B)
- GIN indexes for fast text search
- Automatic version history via database triggers (captures old content before UPDATE)
- Automatic `updated_at` timestamps via database triggers
- Row-level security: all queries filtered by `user_id`

**Database triggers**:

- `update_notes_updated_at` - Automatically sets `updated_at` on note modifications
- `create_note_version_trigger` - Creates version history entry before note updates

## Important Implementation Details

### Authentication Flow

- Uses Google OAuth 2.0 (no local passwords)
- OAuth flow in `server/auth/auth-handler.js` using standard authorization code flow
- Sessions managed by `oak_sessions`, backed by `server/session-store.js`
  (`PostgresSessionStore`, the `sessions` table); cookie is `httpOnly`,
  `sameSite: "lax"`, 7-day sliding expiry. `secure` is deliberately `false` even
  in production — Caddy terminates TLS and forwards plain HTTP, and Oak's
  `SecureCookieMap` rejects a secure cookie over that non-TLS hop; Caddy's HSTS
  header is what keeps the browser from ever sending it over plain HTTP
- User data stored in session: `{ id, email, name, picture }`
- `POST /auth/logout` (page-level, this device only) sits alongside two
  session-scoped routes at `/api/auth`: `POST /api/auth/logout` (this device)
  and `POST /api/auth/logout-all` (every session the user owns — the kill
  switch that makes the 7-day sliding session safe to keep)
- Middleware functions in `server/auth/middleware.js`:
  - `requireAuth`: Protects API routes (returns 401 if not authenticated)
  - `optionalAuth`: Allows anonymous + authenticated access
  - `redirectIfAuthenticated`: For login page (redirects to `/` if already logged in)

### Session User & Avatar

The page learns who is signed in from an injected `<meta name="session-user-name">`
tag in `public/index.html`, filled per request by `server/session-user.js` from
the session (same mechanism as `APP_NAME`) and read by
`public/utils/session-user.js`. **There is no `globalThis.user`** — a comment
promised one for months and nothing ever wrote it, which is why the drawer
avatar/name and the desktop-only route to Log out silently never rendered
until 2026-09-18. Only the display name is injected: no email, no picture.

The avatar is the name's initial in a circle, not the Google photo: the page's
CSP `img-src` is `'self' data: blob:` (`server/security-headers.js`), so a
photo would mean widening the CSP and calling Google on every load.

### Frontend Component Architecture

- All components use Lit Web Components imported from CDN via importmap: `lit@3.1.0`
- Components are self-contained with internal styles using Lit's `static styles`
- State management through component properties and custom events
- API calls using native `fetch()` with credentials included
- Root component (`notes-app.js`) orchestrates child components and handles app-level state
- Global API client available at `window.NotesApp` with methods like `getNotes()`, `updateNote()`, etc.

### Auto-Save Behavior

The `note-editor` component implements auto-save with:

- `hasUnsavedChanges` flag tracks dirty state
- Auto-save triggers when:
  - User switches views (edit → list)
  - User switches notes
  - User applies tag filters
- Debounced saves prevent excessive API calls
- Visual feedback during save operations

### Database Client Pattern

- `DatabaseClient` class in `server/database/client.js` wraps PostgreSQL connection
- All queries are parameterized to prevent SQL injection
- Connection pooling configured with 3 concurrent connections
- Schema automatically initialized on server startup via `db.initializeSchema()`
- Schema initialization uses SQL parser that:
  1. Categorizes statements (CREATE EXTENSION, CREATE TABLE, CREATE INDEX, etc.)
  2. Executes in proper order (extensions → tables → indexes → triggers)
  3. Handles dependencies between statements
- Database operations return plain JavaScript objects (not ORM models)
- Transaction support with explicit `BEGIN`/`COMMIT`/`ROLLBACK`

### Search and Filtering System

The application supports **three types of filtering** that can be combined:

1. **Full-text search** (`/api/search`)
   - Uses PostgreSQL `tsvector` with `plainto_tsquery()`
   - Weighted ranking: title matches (weight A) > content matches (weight B)
   - Results include highlighted snippets using `ts_headline()`
   - Search is case-insensitive and handles partial words

2. **Tri-state tag filtering** (`/api/notes?tags=1,2,3&exclude_tags=4,5`)
   - Many-to-many relationship via `note_tags` junction table
   - Each tag is in one of three states: **any** (not filtered on), **required**
     (`tags`) or **excluded** (`exclude_tags`)
   - Required tags use AND logic (note must have ALL of them); excluded tags drop
     a note that carries ANY of them. Both may be present in one query
   - Efficient JOIN queries at database level; the SQL fragment is built once in
     `server/api/tag-filter.js` (`buildTagFilterClause`) and shared by the notes
     list, advanced search and semantic search so they cannot drift apart
   - **UI**: selection lives at the search bar - a labeled "Tags (n)" button opens
     a filterable, scrolling picker (dropdown on desktop, bottom sheet on mobile),
     and the selected tags render as chips under the search input. A click cycles
     any → required → excluded → any on picker rows, chips and sidebar rows alike;
     the chip's "x" takes the tag out of the filter entirely. The
     sidebar/flyout `tag-manager` still manages tags and shares the same
     `notes-app.selectedTags` state, so both surfaces stay in sync.
   - `selectedTags` entries carry a `filterState` (`"required"` / `"excluded"`);
     an entry with none counts as required
   - Selection logic is pure and unit-tested in `public/utils/tag-filter.js`; the
     request shapes are in `public/utils/search-mode.js` (search) and
     `public/utils/notes-query.js` (the tag-only list)

3. **Status filtering** (`/api/notes?pinned=true`)
   - Filter by pinned status
   - Filter by archived status
   - Combines with search and tag filters

All filtering happens at the **database level** (not in-memory) for scalability.

### Full-Text Search Implementation

- Uses PostgreSQL's `tsvector` generated column with GIN index
- Search query in `server/api/search.js` uses `plainto_tsquery()` for user-friendly queries
- Weighted ranking: title matches rank higher than content matches
- Search results include highlighted snippets using `ts_headline()`
- Supports combining with tag filters and status filters

## Environment Configuration

Copy `.env.example` to `.env` and configure:

**Required variables**:

- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`: From Google Cloud Console OAuth credentials
- `GOOGLE_REDIRECT_URI`: Must match Google Console exactly (e.g., `http://localhost:8000/auth/callback`)
- `DB_USER` / `DB_NAME` / `DB_PASSWORD`: PostgreSQL credentials
- `SESSION_SECRET`: Random string for session encryption

**Optional variables**:

- `DEBUG_SQL`: Enable SQL query logging
- `APP_NAME`: Display name shown in the browser tab, PWA install name, login
  screen and sidebar (e.g. `APP_NAME="Harri's Notes"`). Unset keeps the
  defaults "Notes App" / "Notes". Applied server-side in `server/branding.js`.

## Common Development Tasks

### Adding a New API Endpoint

1. Create or modify route handler in `server/api/*.js`
2. Export a router created with `new Router()` from Oak
3. Mount in `server/main.js` with appropriate middleware:
   ```javascript
   router.use("/api/your-route", requireAuth, yourRouter.routes(), yourRouter.allowedMethods());
   ```
4. Use `ctx.state.db` to access database client
5. Access authenticated user via `await ctx.state.session.get("user")`

### Adding a New Database Table

1. Add table definition to `server/database/schema.sql`
2. Add corresponding indexes
3. Server will automatically apply schema on next startup
4. Add query methods to `server/database/client.js` as needed

### Creating a New Frontend Component

1. Create file in `public/components/your-component.js`
2. Import Lit: `import { LitElement, html, css } from 'https://cdn.jsdelivr.net/npm/lit@3.1.0/index.js';`
3. Define component class extending `LitElement`
4. Define `static styles` for scoped CSS
5. Define `static properties` for reactive properties
6. Implement `render()` method returning Lit's `html` template
7. Register: `customElements.define('your-component', YourComponent);`
8. Import in parent component or `app.js`
9. Communicate with parent via custom events:
   ```javascript
   this.dispatchEvent(
     new CustomEvent("your-event", {
       detail: { data: value },
     }),
   );
   ```

### Working with Database Transactions

When you need multi-step database operations to be atomic:

```javascript
async updateNoteWithTags(noteId, updates, tagIds) {
  const client = await this.pool.connect();
  try {
    await client.queryObject('BEGIN');

    // Update note
    await client.queryObject(
      'UPDATE notes SET title = $1 WHERE id = $2',
      [updates.title, noteId]
    );

    // Update tags
    await client.queryObject('DELETE FROM note_tags WHERE note_id = $1', [noteId]);
    for (const tagId of tagIds) {
      await client.queryObject(
        'INSERT INTO note_tags (note_id, tag_id) VALUES ($1, $2)',
        [noteId, tagId]
      );
    }

    await client.queryObject('COMMIT');
  } catch (error) {
    await client.queryObject('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
```

### Debugging Tips

- **Backend**: Console logs appear in terminal where `deno task dev` is running
- **Frontend**: Use browser DevTools console and Network tab
- **Database**: Enable `DEBUG_SQL=true` in `.env` to log all queries
- **Sessions**: Check session data in Oak middleware or browser cookies
- **Authentication**: OAuth errors appear in browser URL as `?error=...` param
- **Component state**: Use Lit DevTools browser extension to inspect component properties
- **Event flow**: Add console.logs in event handlers to trace event propagation

### Common Development Gotchas

1. **Component state vs root state**:
   - Only `notes-app.js` should maintain global state
   - Child components receive state via properties, never fetch directly
   - Use events to communicate state changes up to root

2. **Auto-save timing**:
   - Auto-save triggers when navigating away from editor
   - If adding new navigation actions, ensure auto-save is called first

3. **Database schema changes**:
   - After modifying `schema.sql`, restart the server
   - Schema is applied idempotently (safe to run multiple times)
   - Complex changes may require manual migration

4. **Lit importmap version**:
   - Always use `lit@3.1.0` (not `lit@2`)
   - Version specified in `index.html` importmap

5. **Service worker cache**:
   - Frontend files are cached by the service worker (`public/sw.js`)
   - After modifying any frontend file, bump `CACHE_NAME` version (e.g., `notes-app-v5` → `notes-app-v6`)
   - Users may need to clear site data or hard refresh to get updates
   - The service worker uses `skipWaiting()` and `clients.claim()` for faster updates

6. **The Lit backtick trap**:
   - Never write a backtick inside a `css\`` / `html\`` template literal — not
     even inside a comment. It ends the template early and the file becomes a
     `SyntaxError`
   - No component test can catch this (tests read components as text, not as
     parsed JS) — `deno lint` in the gate and the pre-push hook are what catch it
   - See the comment at the top of the avatar CSS in `notes-app.js` for a
     worked example of writing around it

7. **UI conventions** (mobile-first; see `drawer_logout_test.ts` for the
   incident that established these):
   - Every control needs a visible word label — a `title` tooltip is invisible
     on a phone (no hover)
   - Touch targets are ≥44px
   - No control may be gated on `this.user`: display data (name, avatar) can
     hide when there's no user, but a session-level action (Log out) must not
     — a null user must never remove the only way to end the session
   - The drawer's logout actions live at the end of `.drawer-content` (the
     scrolling area), not in the pinned `.drawer-footer` — an always-on-screen
     destructive control in the thumb band was a reported hazard

## API Documentation

### Health Check

```http
GET /health
```

Returns server health status (no authentication required)

Response:

```json
{
  "status": "healthy"
}
```

### Authentication Endpoints

```http
GET  /auth/login              # Redirect to Google OAuth
GET  /auth/callback           # OAuth callback handler
POST /auth/logout             # Page-level: end this device's session
POST /api/auth/logout         # Same, behind requireAuth (401 JSON if not authenticated)
POST /api/auth/logout-all     # End every session this user owns, this one included
```

### API Tokens (machine access)

Machine clients (scripts, AI agents) authenticate with a personal API token
instead of the browser session cookie. Both paths run through the same
`requireAuth` middleware, so every `/api/*` endpoint accepts either.

**Managing tokens** (run on the server host, needs DB env vars from `.env`):

```bash
# Create — prints the plaintext token exactly once; it is never stored or logged
deno task token:create --email you@example.com --name hermes

# List — id, name, created_at, last_used_at, revoked_at (never token values)
deno task token:list --email you@example.com

# Revoke — idempotent; pass --email if the name is ambiguous across users
deno task token:revoke --name hermes
```

**Using a token**:

```bash
curl -H "Authorization: Bearer nt_..." https://notes.example.com/api/notes
```

**Implementation notes**:

- Token format: `nt_` + 43 base64url chars (32 random bytes, 256-bit entropy),
  generated in `server/auth/api-tokens.js`
- Storage: `api_tokens.token_hash` is `BYTEA` holding `digest(token, 'sha256')`
  (pgcrypto). The plaintext is never persisted, so a lost token must be revoked
  and recreated
- Lookup: `requireAuth` hashes the presented token **in SQL**
  (`WHERE token_hash = digest($1, 'sha256') AND revoked_at IS NULL`), so the
  plaintext never round-trips through a JS digest on the auth path
- Tokens are read from the `Authorization` header only — never query params or
  request bodies, where they would leak into logs
- `ctx.state.authMethod` is `"session"` or `"api_token"`; `ctx.state.user` has
  the same shape either way, so handlers need no changes
- `last_used_at` is updated fire-and-forget (not awaited) so it never delays a
  response

### Notes Endpoints

```http
GET    /api/notes             # Get user notes (supports filtering)
POST   /api/notes             # Create new note
GET    /api/notes/:id         # Get specific note with tags
PUT    /api/notes/:id         # Update note
DELETE /api/notes/:id         # Soft delete (archive) note
GET    /api/notes/:id/versions # Get version history
POST   /api/notes/:id/restore/:versionId # Restore version
```

**Query parameters for GET /api/notes**:

- `limit` - Number of results (default: 50)
- `offset` - Pagination offset (default: 0)
- `tags` - Comma-separated tag IDs a note must ALL carry (e.g., `tags=1,2,3`)
- `exclude_tags` - Comma-separated tag IDs a note must NOT carry (e.g., `exclude_tags=4,5`);
  a non-empty `tags`/`exclude_tags` with no usable ID is a 400, never an unfiltered list
- `search` - Search query string
- `pinned` - Filter by pinned status (`true`/`false`)
- `archived` - Include archived notes (`true`/`false`)

**Response format**:

```json
{
  "success": true,
  "data": {
    "notes": [...]
  },
  "meta": {
    "limit": 50,
    "offset": 0,
    "hasMore": false
  }
}
```

### Search Endpoint

```http
GET  /api/search?q=query                    # Full-text search
GET  /api/search?q=query&semantic=1         # Embedding (semantic) search
GET  /api/search?q=query&semantic=1&tags=3,5&exclude_tags=9  # Semantic, tag-filtered
```

Response includes highlighted snippets and relevance ranking.

**`tags` / `exclude_tags` (semantic mode)**: comma-separated tag IDs, same shape
as `/api/notes` (and as `tags`/`excludeTags` in the `/api/search/advanced` JSON
body). Required tags are AND-ed - a result must carry ALL of them - and excluded
tags drop any result carrying one. The embedding distance stays the only sort
key, so results are (tag-filtered, similarity-ranked). `meta.tagsApplied`,
`meta.tags`, `meta.excludeTagsApplied` and `meta.excludeTags` echo back what was
actually applied. A non-empty tag parameter with no usable ID is a 400, never a
silently unfiltered result set. Note this is separate from `#tag` tokens inside
`q`, which semantic mode still does not resolve (the raw query is embedded
as-is).

The **text** path of `GET /api/search` ignores both parameters: text search
combined with a tag filter goes to `POST /api/search/advanced`
(`{ query, tags, excludeTags, ... }`), which is where the client sends it.

### Tags Endpoints

```http
GET    /api/tags              # Get user tags with usage counts
POST   /api/tags              # Create tag (409 if duplicate)
PUT    /api/tags/:id          # Update tag color
DELETE /api/tags/:id          # Soft delete tag
```

## Testing Strategy

- **Unit tests**: ~54 `*_test.ts` files in `tests/deno/` for pure functions
  (text utils, SQL parser, markdown stripping, auth handler, tag filtering,
  version history, and more)
- **Guard/contract tests**: wire-level checks that catch a client/server
  mismatch no pure-function test can — see "Guard suites worth knowing by
  name" under Testing above
- **API testing**: Use `curl` or test scripts
- **Database testing**: Use separate test database (update `.env` when running tests)

## Deployment Notes

- **Production environment**: Set `NODE_ENV=production` in systemd service
- **Deno permissions**: Must grant `--allow-net --allow-read --allow-env --allow-write`
- **Caddy serves frontend**: Static files from `public/` directory
- **Caddy proxies API**: Requests to `/api/*` proxied to Deno backend on `localhost:8000`
- **Database migrations**: Currently manual via `schema.sql` (no migration framework)
- **HTTPS**: Caddy handles automatic HTTPS certificates via Let's Encrypt

## POC Directories

The repository includes proof-of-concept directories in the `poc/` folder that were used during development:

- `poc/google-auth-poc/`: Google OAuth flow prototyping
- `poc/postgres-poc/`: PostgreSQL full-text search experiments

These are **not part of the main application** and can be ignored for regular development.

## Key Dependencies

### Backend (Deno)

- `oak@v12.6.1`: Web framework (imported in deno.json)
- `postgres@v0.17.0`: PostgreSQL driver (imported in deno.json)
- `oak_sessions@v4.1.9`: Session management (imported in main.js)

### Frontend (Browser)

- `lit@3.1.0`: Web Components framework (CDN import via importmap)

### Testing

- `std@0.208.0/assert`: Deno standard library assertions (URL import)

## Mobile-First Design

The application is primarily designed for mobile phone browsers:

- Touch-friendly UI with large tap targets
- Responsive breakpoints: mobile (<768px), tablet (768-1024px), desktop (>1024px)
- PWA capabilities via `manifest.json` and `sw.js`
- Offline viewing of cached notes (service worker)
- No external CSS frameworks (uses CSS Grid and Flexbox)

## Security Considerations

- **No password storage**: OAuth-only authentication
- **SQL injection prevention**: All queries use parameterized statements
- **XSS prevention**: Lit templates automatically escape user content
- **Session security**: HTTP-only, `sameSite: "lax"` cookies. `secure` is
  `false` even in production, deliberately — Caddy terminates TLS and forwards
  plain HTTP, and its HSTS header is what keeps the cookie HTTPS-only in the
  browser instead (see Authentication Flow)
- **Row-level security**: All database queries filter by authenticated user ID
- **CORS**: No CORS headers are set anywhere in the app — cross-origin requests
  are blocked by the browser's same-origin default, not by explicit config
- **Environment secrets**: Never commit `.env` file (use `.env.example` template)
