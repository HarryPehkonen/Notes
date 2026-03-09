# TODO

Improvements identified from code review (March 2025).

## High Priority

- [x] **Validate image filenames** — In `server/api/images.js`, validate that filenames match the expected UUID pattern (e.g., `/^[a-f0-9-]+\.\w+$/`) before constructing file paths. Prevents directory traversal even though `realpath` catches it on read.
- [x] **Session cleanup** — Sessions accumulate in the DB forever. Add a periodic cleanup job (e.g., delete sessions older than 30 days) or add an `expires_at` column and clean up on a timer.
- [x] **Fix unbounded syncPromises array** — In `public/services/sync-manager.js`, resolved promises in `syncPromises` are never removed. Filter out settled promises after `waitForAll()` or use a counter instead.

## Medium Priority

- [x] **Add note list pagination** — Currently loads up to 50 notes with no infinite scroll or "load more". Will degrade with hundreds of notes.
- [x] **Use error codes for constraint detection** — In `server/api/tags.js`, replace `error.message.includes("duplicate key")` with PostgreSQL error code `23505` check.
- [x] **Remove dead `stripMarkdown()`** — Was in `public/app.js` but never called. Removed. Canonical version lives in `server/database/client.js`.
- [ ] **Offline tag operations** — Tag create/edit/delete fails immediately when offline. Notes queue via IndexedDB but tags don't. Add similar queueing or at minimum show a clear error.

## Low Priority

- [x] **Remove dead `clearOldDrafts()`** — Removed from `public/services/persistence.js`.
- [x] **Extract login page HTML** — Moved to `public/login.html`, served via `Deno.readTextFile`.
- [x] **Automate service worker cache versioning** — Replaced cache-first with stale-while-revalidate strategy. No manual version bumping needed; sw.js served with `no-cache` so browser always checks for updates.
- [x] **DELETE response codes** — Return 204 No Content instead of 200 for DELETE endpoints.
