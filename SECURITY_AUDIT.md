# Security Audit - Remaining Items

Findings from security audit (2026-02-15). Items #1, #2, #3, #4 have been fixed.

## HIGH

### #5 - LIKE pattern injection in search
**File:** `server/api/search.js:116,140`

User search input is wrapped in `%...%` for ILIKE queries without escaping `%` and `_` wildcards. Searching `%` matches everything; complex patterns could be a DoS vector. Fix: escape `%` and `_` in the search term before interpolation.

### #6 - No Content Security Policy on HTML pages
**File:** `server/main.js`

No CSP header is set on the main app. A CSP would provide defense-in-depth beyond DOMPurify and Lit's escaping.

### #7 - No security headers
**File:** `server/main.js`

Missing: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Strict-Transport-Security`, `Referrer-Policy`. Caddy may add some in production, but dev/staging are unprotected.

### #8 - SVG uploads allow stored XSS
**File:** `server/api/images.js`

SVGs can contain JavaScript. The `script-src 'none'` CSP on served images is good but incomplete (`<foreignObject>`, `xlink:href="javascript:..."` can bypass it). Consider disallowing SVG uploads or adding `Content-Disposition: attachment` for SVGs.

## MEDIUM

### #9 - CDN dependencies without integrity checks
**File:** `public/index.html`

Lit, marked, and DOMPurify are loaded from jsdelivr.net without SRI hashes (import maps don't support SRI). If the CDN is compromised, the app loads malicious code. Self-hosting would eliminate this risk.

### #10 - DOMPurify allows style, form, input
**File:** `public/components/note-editor.js:1088`

Default DOMPurify config allows `<style>`, `<form>`, `<input>` in Markdown preview. `<style>` enables CSS-based attacks; `<form>`/`<input>` enable phishing within the preview. Currently self-XSS only (single-user notes), but would be critical if note sharing is ever added.

### #11 - No rate limiting on API endpoints
**File:** `server/main.js`

Only auth endpoints are rate-limited. An authenticated user could flood search (expensive full-text queries), upload unlimited images (disk exhaustion), or create unlimited notes.

### #12 - LIKE injection in orphan image cleanup
**File:** `server/api/notes.js:29-34`

The `LIKE '%' || $2 || '%'` pattern relies on the regex extracting only safe characters (UUID filenames). Safe by coincidence, not by design.

### #13 - Search offset/limit not validated
**File:** `server/api/search.js:41-42`

Unlike the notes endpoint, the search endpoint doesn't clamp offset or provide NaN fallbacks for limit. `parseInt(undefined)` = `NaN` would produce a SQL error.

## LOW

### #14 - DEV_USER_EMAIL bypass when NODE_ENV unset
**File:** `server/main.js:164`

The dev auth bypass activates when `NODE_ENV !== "production"` AND `DEV_USER_EMAIL` is set. If both conditions are met in a deployment, the bypass is live.

### #15 - Service worker caches error responses
**File:** `public/sw.js:59-62`

The root path handler caches responses without checking `response.ok`. An error page would be cached and served offline.

### #16 - Logout doesn't revoke Google token
**File:** `server/main.js:279`

The `revokeToken()` method exists but isn't called during logout.

### #17 - No absolute session lifetime

Cookie `maxAge` is 7 days (sliding). No forced re-auth after an absolute time period.

### #18 - Unbounded note_versions growth

No pruning of version history. Could grow indefinitely.
