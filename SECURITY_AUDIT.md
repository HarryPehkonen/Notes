# Security Audit - Remaining Items

Findings from security audit (2026-02-15). Items #1, #2, #3, #4, #5, #8, #12, #13, #15 have been fixed.

## HIGH

### #6 - No Content Security Policy on HTML pages
**File:** `server/main.js`

No CSP header is set on the main app. A CSP would provide defense-in-depth beyond DOMPurify and Lit's escaping. Hard to do right with CDN imports and Lit's rendering model — revisit if self-hosting dependencies.

### #7 - No security headers
**File:** `server/main.js`

Missing: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Strict-Transport-Security`, `Referrer-Policy`. Caddy may add some in production, but dev/staging are unprotected.

## MEDIUM

### #9 - CDN dependencies without integrity checks
**File:** `public/index.html`

Lit, marked, and DOMPurify are loaded from jsdelivr.net without SRI hashes (import maps don't support SRI). If the CDN is compromised, the app loads malicious code. Self-hosting would eliminate this risk.

### #10 - DOMPurify allows style, form, input
**File:** `public/components/note-editor.js:1088`

Default DOMPurify config allows `<style>`, `<form>`, `<input>` in Markdown preview. Currently self-XSS only (single-user notes), but would be critical if note sharing is ever added.

### #11 - No rate limiting on API endpoints
**File:** `server/main.js`

Only auth endpoints are rate-limited. Single-user app, so low risk currently.

## LOW

### #14 - DEV_USER_EMAIL bypass when NODE_ENV unset
**File:** `server/main.js:164`

Requires both `NODE_ENV` unset AND `DEV_USER_EMAIL` set. Two simultaneous misconfigurations needed.

### #16 - Logout doesn't revoke Google token
**File:** `server/main.js:279`

The `revokeToken()` method exists but isn't called during logout. Most apps don't revoke — they just kill the local session.

### #17 - No absolute session lifetime

Cookie `maxAge` is 7 days (sliding). No forced re-auth after an absolute time period.

### #18 - Unbounded note_versions growth

No pruning of version history. Could grow indefinitely. Add pruning when growth is noticed.
