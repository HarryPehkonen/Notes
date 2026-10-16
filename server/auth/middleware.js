/**
 * Authentication middleware for protecting API routes
 */

import { extractBearerToken } from "./api-tokens.js";
import { hasScope, isExpired, requiredScopeFor, scopeSummary } from "./token-scope.js";

/** Body returned whenever a request is not authenticated */
const UNAUTHORIZED_BODY = {
  error: "Authentication required",
  redirectTo: "/auth/login",
};

/**
 * Look up the user behind a personal API token
 *
 * The token is hashed by pgcrypto inside the query, so the plaintext never
 * needs a JS-side digest and revoked tokens are filtered in SQL. An expired
 * token is returned rather than filtered, so the caller can say "expired"
 * instead of the indistinguishable "wrong token".
 * @param {Object} db - Database client (`ctx.state.db`)
 * @param {string} token - Plaintext bearer token
 * @returns {Promise<Object|null>} Token row joined with its user, or null
 */
async function findUserByApiToken(db, token) {
  const result = await db.query(
    `SELECT t.id, t.user_id, t.scopes, t.expires_at, u.email, u.name, u.picture
     FROM api_tokens t
     JOIN users u ON u.id = t.user_id
     WHERE t.token_hash = digest($1, 'sha256') AND t.revoked_at IS NULL`,
    [token],
  );

  return result.rows[0] || null;
}

/**
 * Middleware to require authentication for protected routes
 *
 * Accepts either a browser session cookie or an `Authorization: Bearer <token>`
 * personal API token, so machine clients can use the same API as the UI.
 *
 * An API token is a narrower credential than a session: it does what its
 * scopes say and no more (`read` for GET/HEAD, `write` for anything that can
 * change state), and it stops working at its expiry. A session is the whole
 * app, always - the browser is its owner sitting in front of it.
 * @param {Object} ctx - Oak context
 * @param {Function} next - Next middleware function
 */
export async function requireAuth(ctx, next) {
  const user = await ctx.state.session.get("user");

  if (user) {
    // Add user to context for use in API handlers
    ctx.state.user = user;
    ctx.state.authMethod = "session";
    await next();
    return;
  }

  const token = extractBearerToken(ctx.request);

  if (!token) {
    ctx.response.status = 401;
    ctx.response.body = UNAUTHORIZED_BODY;
    return;
  }

  let tokenRow;
  try {
    tokenRow = await findUserByApiToken(ctx.state.db, token);
  } catch (error) {
    console.error("API token lookup failed:", error);
    ctx.response.status = 500;
    ctx.response.body = {
      success: false,
      error: "Authentication error",
    };
    return;
  }

  if (!tokenRow) {
    ctx.response.status = 401;
    ctx.response.body = UNAUTHORIZED_BODY;
    return;
  }

  if (isExpired(tokenRow.expires_at)) {
    ctx.response.status = 401;
    ctx.response.body = {
      success: false,
      error: "This API token has expired. Create a new one in Settings > API tokens.",
      code: "token_expired",
    };
    return;
  }

  const needed = requiredScopeFor(ctx.request.method);
  if (!hasScope(tokenRow.scopes, needed)) {
    ctx.response.status = 403;
    ctx.response.body = {
      success: false,
      error: `This API token may only read (scope: ${scopeSummary(tokenRow.scopes)}). It cannot ${
        needed === "write" ? "change anything" : "read"
      }.`,
      code: "insufficient_scope",
      required: needed,
      granted: Array.isArray(tokenRow.scopes) ? tokenRow.scopes : [],
    };
    return;
  }

  // Fire-and-forget: last_used_at is telemetry, not worth delaying the response
  ctx.state.db
    .query("UPDATE api_tokens SET last_used_at = CURRENT_TIMESTAMP WHERE id = $1", [tokenRow.id])
    .catch((error) => console.error("Failed to update token last_used_at:", error));

  ctx.state.user = {
    id: tokenRow.user_id,
    email: tokenRow.email,
    name: tokenRow.name,
    picture: tokenRow.picture,
  };
  ctx.state.authMethod = "api_token";
  // Which token, and what it may do: for handlers that must treat a machine
  // client differently from the browser (managing tokens is session-only).
  ctx.state.token = {
    id: tokenRow.id,
    scopes: Array.isArray(tokenRow.scopes) ? tokenRow.scopes : [],
  };
  await next();
}

/**
 * Middleware to optionally add user info if authenticated
 * @param {Object} ctx - Oak context
 * @param {Function} next - Next middleware function
 */
export async function optionalAuth(ctx, next) {
  const user = await ctx.state.session.get("user");

  if (user) {
    ctx.state.user = user;
  }

  await next();
}

/**
 * Middleware to redirect authenticated users away from login pages
 * @param {Object} ctx - Oak context
 * @param {Function} next - Next middleware function
 */
export async function redirectIfAuthenticated(ctx, next) {
  const user = await ctx.state.session.get("user");

  if (user) {
    ctx.response.redirect("/");
    return;
  }

  await next();
}
