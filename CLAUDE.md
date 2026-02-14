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

### Database Operations

The server uses two schema files:
- **`schema-init.sql`** - Production-safe with `IF NOT EXISTS` (default)
- **`schema.sql`** - Development reset, drops all tables

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
- **Database**: PostgreSQL with full-text search (pg_trgm extension)
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
│   ├── main.js              # Oak server, routes, and initialization
│   ├── auth/
│   │   ├── auth-handler.js  # Google OAuth 2.0 implementation
│   │   └── middleware.js    # requireAuth, optionalAuth, redirectIfAuthenticated
│   ├── database/
│   │   ├── client.js        # PostgreSQL connection and query wrapper
│   │   └── schema.sql       # Database schema (auto-applied on startup)
│   └── api/
│       ├── notes.js         # CRUD endpoints for notes
│       ├── tags.js          # Tag management endpoints
│       └── search.js        # Full-text search with PostgreSQL
├── public/
│   ├── index.html           # Main app shell (served to authenticated users)
│   ├── app.js               # Main application logic
│   ├── components/          # Lit Web Components (loaded via ES modules)
│   │   ├── notes-app.js     # Root component orchestrating the app
│   │   ├── note-editor.js   # Markdown note editing interface
│   │   ├── note-list.js     # Notes listing with filtering
│   │   ├── search-bar.js    # Search interface with live results
│   │   └── tag-manager.js   # Tag CRUD and color management
│   ├── utils/
│   │   └── text.js          # HTML escaping and search highlighting
│   ├── styles/
│   │   └── app.css          # Mobile-first CSS (no frameworks)
│   └── sw.js                # Service worker for PWA functionality
├── tests/
│   └── deno/                # Deno unit tests for pure functions
└── poc/                     # Proof-of-concept projects (not part of main app)
    ├── dropbox-poc/         # Dropbox API integration testing
    ├── google-auth-poc/     # Google OAuth flow prototyping
    └── postgres-poc/        # PostgreSQL full-text search experiments
```

### Request Flow

1. **Unauthenticated user** → `/` → Redirected to `/login` (inline HTML with Google OAuth button)
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

**Key features**:

- Full-text search using PostgreSQL's native `tsvector` with weighted search (title=A, content=B)
- GIN indexes for fast text search
- Automatic version history via database triggers (captures old content before UPDATE)
- Automatic `updated_at` timestamps via database triggers
- Row-level security: all queries filtered by `user_id`

**Database triggers**:

- `update_note_timestamp` - Automatically sets `updated_at` on note modifications
- `save_note_version` - Creates version history entry before note updates

## Important Implementation Details

### Authentication Flow

- Uses Google OAuth 2.0 (no local passwords)
- OAuth flow in `server/auth/auth-handler.js` using standard authorization code flow
- Sessions managed by `oak_sessions` middleware
- User data stored in session: `{ id, email, name, picture }`
- Middleware functions in `server/auth/middleware.js`:
  - `requireAuth`: Protects API routes (returns 401 if not authenticated)
  - `optionalAuth`: Allows anonymous + authenticated access
  - `redirectIfAuthenticated`: For login page (redirects to `/` if already logged in)

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

2. **Tag filtering** (`/api/notes?tags=1,2,3`)
   - Many-to-many relationship via `note_tags` junction table
   - Multiple tags use AND logic (note must have ALL selected tags)
   - Efficient JOIN queries at database level

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
POST /auth/logout             # End session
```

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
- `tags` - Comma-separated tag IDs (e.g., `tags=1,2,3`)
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
GET  /api/search?q=query      # Full-text search
```

Response includes highlighted snippets and relevance ranking.

### Tags Endpoints

```http
GET    /api/tags              # Get user tags with usage counts
POST   /api/tags              # Create tag (409 if duplicate)
PUT    /api/tags/:id          # Update tag color
DELETE /api/tags/:id          # Soft delete tag
```

## Testing Strategy

- **Unit tests**: Deno tests in `tests/deno/` for pure functions (text utils, SQL parser, markdown stripping, auth handler)
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
- **Session security**: HTTP-only cookies with secure flag in production
- **Row-level security**: All database queries filter by authenticated user ID
- **CORS**: Configured in Oak middleware for same-origin by default
- **Environment secrets**: Never commit `.env` file (use `.env.example` template)
