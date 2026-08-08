/**
 * Authentication middleware for protecting API routes
 */

import { extractBearerToken } from "./api-tokens.js";

/** Body returned whenever a request is not authenticated */
const UNAUTHORIZED_BODY = {
  error: "Authentication required",
  redirectTo: "/auth/login",
};

/**
 * Look up the user behind a personal API token
 *
 * The token is hashed by pgcrypto inside the query, so the plaintext never
 * needs a JS-side digest and revoked tokens are filtered in SQL.
 * @param {Object} db - Database client (`ctx.state.db`)
 * @param {string} token - Plaintext bearer token
 * @returns {Promise<Object|null>} Token row joined with its user, or null
 */
async function findUserByApiToken(db, token) {
  const result = await db.query(
    `SELECT t.id, t.user_id, u.email, u.name, u.picture
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
