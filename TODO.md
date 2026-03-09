# TODO

Improvements identified from code review (March 2025).

## High Priority

- [x] **Validate image filenames** — In `server/api/images.js`, validate that filenames match the expected UUID pattern (e.g., `/^[a-f0-9-]+\.\w+$/`) before constructing file paths. Prevents directory traversal even though `realpath` catches it on read.
- [x] **Session cleanup** — Sessions accumulate in the DB forever. Add a periodic cleanup job (e.g., delete sessions older than 30 days) or add an `expires_at` column and clean up on a timer.
- [x] **Fix unbounded syncPromises array** — In `public/services/sync-manager.js`, resolved promises in `syncPromises` are never removed. Filter out settled promises after `waitForAll()` or use a counter instead.

## Medium Priority

- [ ] **Break up large components** — `notes-app.js` (~1100 lines) and `note-editor.js` (~1260 lines) do too much. Extract sub-components: image upload, tag selector, markdown preview, editor toolbar.
- [ ] **Add note list pagination** — Currently loads up to 50 notes with no infinite scroll or "load more". Will degrade with hundreds of notes.
- [x] **Use error codes for constraint detection** — In `server/api/tags.js`, replace `error.message.includes("duplicate key")` with PostgreSQL error code `23505` check.
- [x] **Remove dead `stripMarkdown()`** — Was in `public/app.js` but never called. Removed. Canonical version lives in `server/database/client.js`.
- [ ] **Offline tag operations** — Tag create/edit/delete fails immediately when offline. Notes queue via IndexedDB but tags don't. Add similar queueing or at minimum show a clear error.

## Low Priority

- [ ] **Wire up `clearOldDrafts()`** — Defined in `public/services/persistence.js` but never called. Either call it on startup or remove the dead code.
- [ ] **Extract login page HTML** — Move the ~130-line login page template literal out of `server/main.js` into a separate HTML file.
- [ ] **Automate service worker cache versioning** — Currently manual bump (`v30`). Consider generating the version from a file hash or build timestamp.
- [ ] **DELETE response codes** — Return 204 No Content instead of 200 for DELETE endpoints (REST convention).
