/**
 * Personal API tokens - the self-service half.
 *
 * Before this router, tokens could only be minted and revoked from a shell on
 * the server (`deno task token:create --email ...`), which meant the owner of
 * an account could not hand their own agent a credential. These endpoints let a
 * signed-in person manage their own tokens from the app: list them, create one,
 * revoke one.
 *
 * Two rules hold the security line, and both are tested:
 *
 *   1. **Session only.** A token may never list, create or revoke tokens, even
 *      a `write` token. A credential that can mint credentials is a
 *      credential that can outlive its own revocation, and no agent needs this
 *      API - so `authMethod` must be `session` for every route here.
 *   2. **The plaintext is shown exactly once**, in the create response, and is
 *      never readable again: only the SHA-256 digest is stored (pgcrypto, as
 *      before). Nothing in this file ever returns `token_hash`.
 *
 * Ownership is enforced in SQL (`WHERE user_id = $1`) rather than by checking a
 * fetched row afterwards, so a token id belonging to somebody else is a 404 -
 * not a 403 that confirms the id exists.
 */

import { Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { generateApiToken } from "../auth/api-tokens.js";
import { describeToken, parseExpiryDays, parseScopes } from "../auth/token-scope.js";

/** Longest accepted token name, matching the column (`VARCHAR(100)`) */
const MAX_NAME_LENGTH = 100;

/** Columns the list/create responses are built from - never `token_hash` */
const TOKEN_COLUMNS = "id, name, scopes, created_at, last_used_at, expires_at, revoked_at";

export function createTokensRouter() {
  const router = new Router();

  // Rule 1: a token must not manage tokens. Mounted before every route below.
  router.use(async (ctx, next) => {
    if (ctx.state.authMethod !== "session") {
      ctx.response.status = 403;
      ctx.response.body = {
        success: false,
        error:
          "API tokens are managed from a signed-in browser session. A token cannot create or revoke tokens.",
        code: "session_required",
      };
      return;
    }
    await next();
  });

  // GET /api/tokens - this user's tokens, active first. Never a secret: the
  // digest is not selected and the plaintext is not recoverable.
  router.get("/", async (ctx) => {
    const { user, db } = ctx.state;

    try {
      const result = await db.query(
        `SELECT ${TOKEN_COLUMNS}
         FROM api_tokens
         WHERE user_id = $1
         ORDER BY (revoked_at IS NULL) DESC, created_at DESC`,
        [user.id],
      );

      ctx.response.body = {
        success: true,
        data: result.rows.map((row) => describeToken(row)),
        meta: {
          // The same `meta` shape the notes list uses, so a client reads counts
          // the same way everywhere.
          total: result.rows.length,
          active: result.rows.filter((row) => describeToken(row).state === "active").length,
        },
      };
    } catch (error) {
      console.error("Error listing API tokens:", error);
      ctx.response.status = 500;
      ctx.response.body = { success: false, error: "Failed to list API tokens" };
    }
  });

  // POST /api/tokens - create one. The plaintext token is in this response and
  // nowhere else, ever.
  router.post("/", async (ctx) => {
    const { user, db } = ctx.state;

    if (!ctx.request.hasBody) {
      ctx.response.status = 400;
      ctx.response.body = { success: false, error: "Request body is required" };
      return;
    }

    let body;
    try {
      body = await ctx.request.body({ type: "json" }).value;
    } catch (_error) {
      ctx.response.status = 400;
      ctx.response.body = { success: false, error: "Request body must be valid JSON" };
      return;
    }

    const name = String(body?.name ?? "").trim();
    if (name.length === 0) {
      ctx.response.status = 400;
      ctx.response.body = { success: false, error: "name is required" };
      return;
    }
    if (name.length > MAX_NAME_LENGTH) {
      ctx.response.status = 400;
      ctx.response.body = {
        success: false,
        error: `name must be at most ${MAX_NAME_LENGTH} characters`,
      };
      return;
    }

    const scopes = parseScopes(body?.scopes);
    if (scopes.error) {
      ctx.response.status = 400;
      ctx.response.body = { success: false, error: scopes.error };
      return;
    }

    const expiry = parseExpiryDays(body?.expires_in_days);
    if (expiry.error) {
      ctx.response.status = 400;
      ctx.response.body = { success: false, error: expiry.error };
      return;
    }

    const token = generateApiToken();

    try {
      const result = await db.query(
        `INSERT INTO api_tokens (user_id, name, token_hash, scopes, expires_at)
         VALUES (
           $1,
           $2,
           digest($3, 'sha256'),
           $4::text[],
           CASE WHEN $5::int IS NULL THEN NULL
                ELSE CURRENT_TIMESTAMP + make_interval(days => $5::int) END
         )
         RETURNING ${TOKEN_COLUMNS}`,
        [user.id, name, token, `{${scopes.scopes.join(",")}}`, expiry.days],
      );

      ctx.response.status = 201;
      ctx.response.body = {
        success: true,
        data: {
          ...describeToken(result.rows[0]),
          // Shown once. Storing it is the reader's job; nothing can show it again.
          token,
        },
        meta: { tokenShownOnce: true },
      };
    } catch (error) {
      // A name is unique per user: the same name twice is a conflict, not a
      // second token that is indistinguishable in the list.
      if (error.fields?.code === "23505" || error.message?.includes("duplicate key")) {
        ctx.response.status = 409;
        ctx.response.body = {
          success: false,
          error: "You already have a token with that name. Revoke it, or choose another name.",
        };
        return;
      }
      console.error("Error creating API token:", error);
      ctx.response.status = 500;
      ctx.response.body = { success: false, error: "Failed to create API token" };
    }
  });

  // DELETE /api/tokens/:id - revoke. Idempotent for this user's own token:
  // revoking an already-revoked token is a no-op success, because the caller's
  // desired end state ("that token cannot be used") already holds.
  router.delete("/:id", async (ctx) => {
    const { user, db } = ctx.state;
    const id = Number(ctx.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      ctx.response.status = 400;
      ctx.response.body = { success: false, error: "Invalid token ID" };
      return;
    }

    try {
      const result = await db.query(
        `UPDATE api_tokens
         SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP)
         WHERE id = $1 AND user_id = $2
         RETURNING id`,
        [id, user.id],
      );

      if (result.rows.length === 0) {
        ctx.response.status = 404;
        ctx.response.body = { success: false, error: "API token not found" };
        return;
      }

      // 204 with NO body (a body on 204 kills the process - see commit 5cb1910).
      ctx.response.status = 204;
    } catch (error) {
      console.error("Error revoking API token:", error);
      ctx.response.status = 500;
      ctx.response.body = { success: false, error: "Failed to revoke API token" };
    }
  });

  return router;
}
