# Security Audit - Status

Findings from security audit (2026-02-15). Items #1, #2, #3, #4, #5, #8, #12,
#13, #15 fixed at audit time.

## Session update (2026-08-08) — security hardening batch

Fixed in this session (commit `d8a7345`):
- **#6** CSP implemented in-app (nonce-based, no `unsafe-inline` scripts)
- **#11** API rate limiting (120/min per IP, 300/min per token, 120/min per user)
- **#16** Google OAuth token revoked on logout / logout-all (fire-and-forget)
- **#18** `note_versions` pruning (keep newest 50 per note, daily job)
- **#17** Resolved by design decision: 7-day sliding session kept (user
  preference), with a "Log out from all devices" kill-switch
  (`POST /api/auth/logout-all`) instead of an absolute session lifetime

## Remaining items

### MEDIUM

### #7 - Security headers only in production (partial)
**File:** `server/main.js` / Caddyfile

`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
`Strict-Transport-Security`, `Referrer-Policy` are set by Caddy in
production only. Dev/staging (Oak direct) lack them. CSP is now in-app (all
environments); the four Caddy-only headers remain production-only.

### #9 - CDN dependencies without integrity checks
**File:** `public/index.html`

Lit, marked, and DOMPurify are loaded from jsdelivr.net without SRI hashes
(import maps don't support SRI). If the CDN is compromised, the app loads
malicious code. Mitigated by the in-app CSP (script-src allows only
cdn.jsdelivr.net + self + nonce). Self-hosting would eliminate this risk.

### #10 - DOMPurify allows style, form, input
**File:** `public/components/note-editor.js:1088`

Default DOMPurify config allows `<style>`, `<form>`, `<input>` in Markdown
preview. Currently self-XSS only (single-user notes); would be critical if
note sharing is ever added.

## LOW

### #14 - DEV_USER_EMAIL bypass when NODE_ENV unset
**File:** `server/main.js:164`

Requires both `NODE_ENV` unset AND `DEV_USER_EMAIL` set. Two simultaneous
misconfigurations needed.

### #20 - Anonymous session churn from API-token requests
**File:** `server/main.js` (session middleware)

Every request passing through the session middleware mints an anonymous
`sessions` row (no user data) — API-token requests included. Bounded by the
7-day hourly cleanup; noise, not growth. Optimization: skip session lookup
when a valid Bearer token is present.

### #21 - Postgres TLS uses self-signed cert (plaintext fallback on loopback)
**File:** `server/database/client.js` / Postgres config

`ssl=on` with a snakeoil cert; the Deno client can't verify it, so
connections log "TLS connection failed ... Defaulting to non-encrypted" and
run plaintext over localhost. Low risk (loopback + scram-sha-256), but
cosmetic noise — either disable the TLS attempt or install a trusted cert.
