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

## Review (2026-09-05) — OAuth, API tokens, cross-site

Focused re-review of the auth surface. Verified good: no CORS headers are set
anywhere (API is same-origin only), API tokens are 256-bit with only a SHA-256
digest at rest and header-only extraction, session key is rotated on login,
`/static` path traversal is blocked via `realPath`, CSP is nonce-based, and
SameSite=Lax covers CSRF on state-changing endpoints. The production Caddyfile
was also reviewed: it sets no `Access-Control-*` headers either, so the
same-origin posture holds end to end. New findings: #22-#28; the two MEDIUMs
(#22, #23) and #24 were fixed in the same session.

### #22 - OAuth state fallback: LIKE-wildcard bypass + not browser-bound — FIXED

**File:** `server/session-store.js`, `server/main.js`

The callback's fallback lookup `findSessionByState(state)` interpolated the
attacker-controlled `state` into a `LIKE` pattern, so `state=%` matched ANY
session with ANY pending `oauth_state` and the CSRF check passed — and the
attacker could arrange a pending state by hitting `/auth/login` themselves.
Even a literal match accepted a state issued to a _different browser_,
enabling login CSRF (victim silently signed into the attacker's account); the
matched state was also never cleared, so it was replayable.

**Fixed (2026-09-05):** the state now lives in a dedicated short-lived cookie
(HttpOnly, SameSite=Lax, 10-min max age) set by `/auth/login` and checked +
cleared by the callback with an exact comparison. This binds the flow to the
browser, is single-use, and is immune to the session-replacement race that
motivated the fallback — `findSessionByState` is deleted entirely.

### #23 - Rate-limit IP key trusted client-supplied X-Forwarded-For — FIXED

**File:** `server/rate-limit.js` (`getClientIp`), `server/main.js`

`getClientIp` returned the FIRST entry of `X-Forwarded-For`. Caddy _appends_
the real client IP to any incoming XFF, so a client sending
`X-Forwarded-For: 1.2.3.4` controlled that first entry — in production too.
This defeated the per-IP auth and API limits and let one client mint unlimited
bucket keys (unbounded Map growth). In staging (direct `0.0.0.0`,
`proxy: true`) the header was entirely attacker-controlled.

**Fixed (2026-09-05):** `getClientIp(ctx, trustProxy)` now ignores XFF unless
explicitly told a proxy fronts the app, and then uses only the LAST entry (the
one Caddy appended). `main.js` passes `trustProxy: isProduction` and creates
the Oak app with `proxy: isProduction`, so dev/staging use the raw socket
address. Regression tests added in `tests/deno/rate_limit_test.ts`.

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

### #24 - OAuth callback did not check `verified_email` — FIXED

**File:** `server/auth/auth-handler.js`, `server/main.js`

Account lookup/creation keyed on `userInfo.email` alone; Google's
`verified_email` flag was never checked, so a Google account carrying an
unverified email equal to an existing user's address could sign in as that
user.

**Fixed (2026-09-05):** `isVerifiedOAuthUser(userInfo)` (pure, unit-tested in
`tests/deno/auth_handler_test.ts`) requires a non-empty string email plus an
explicit `verified_email: true` (Google v2) or `email_verified: true` (OIDC);
the callback returns 403 otherwise.

### #25 - Google token revocation (#16) is a no-op — tokens never stored

**File:** `server/auth/auth-handler.js:40`, `server/main.js:264`

Nothing ever writes to `auth_providers`: the callback discards the token
response after fetching userinfo, so `revokeGoogleToken`'s
`SELECT access_token FROM auth_providers` always finds nothing and the #16
"revoke on logout" fix never revokes anything. Upside: no Google
access/refresh tokens at rest (good — keep it that way). Either remove the
dead revoke path and the unused `access_token`/`refresh_token` columns, or
revoke the token inline in the callback right after userinfo. Related nit:
`revokeToken()` puts the token in the URL query string; Google accepts it in
the POST body, which keeps it out of intermediary logs.

### #26 - `/ws` accepts cross-origin handshakes (no Origin check)

**File:** `server/main.js:358`

The WebSocket endpoint authenticates by session cookie only and never checks
the `Origin` header. Cross-site WebSocket handshakes are not blocked by the
same-origin policy; today SameSite=Lax keeps the cookie off cross-site
handshakes, so this is defense-in-depth — reject upgrades whose Origin isn't
the app's own origin.

### #27 - CSP `connect-src` allows WebSockets to any host

**File:** `server/security-headers.js:34`

`connect-src 'self' wss: ws:` permits a socket to ANY origin, giving injected
script a ready exfiltration channel (fetch is limited to 'self', sockets are
not). Script injection is already hard (nonce-based script-src), so LOW — in
production pin to the app's own `wss://` host and keep the bare schemes for
dev/staging only.

### #28 - Sessions expired 7 days after LOGIN, not 7 days after last use — FIXED

**File:** `server/session-store.js`, `server/database/schema.sql`

Not a vulnerability — the opposite: expiry was stricter than intended. #17
records the design decision as a "7-day sliding session", but the hourly
cleanup deleted on `created_at`, so a login died a week after it was created
no matter how actively the app was used.

**Fixed (2026-09-05):** a `last_seen_at` column (in `CREATE TABLE` for new
installs, plus an idempotent `ADD COLUMN IF NOT EXISTS` migration applied
automatically on the next production restart — no data touched). oak_sessions
already re-sets the cookie and persists the session row on every request, so
`persistSessionData` bumps `last_seen_at` in that same UPDATE (zero extra
queries) and `deleteExpiredSessions` keys on
`COALESCE(last_seen_at, created_at)`. Result: an active login never expires;
a stolen-but-idle session still dies after 7 days, and the logout-all
kill-switch is unchanged. Unit tests in `tests/deno/session_store_test.ts`.
