/**
 * Authenticated account routes (mounted at /api/auth)
 */

import { Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { revokeGoogleToken } from "../auth/auth-handler.js";

/** Body returned whenever a request is not authenticated */
const UNAUTHORIZED_BODY = {
  error: "Authentication required",
  redirectTo: "/auth/login",
};

/**
 * Build the /api/auth router
 *
 * @param {Object} deps
 * @param {Object} deps.sessionStore - PostgresSessionStore instance
 * @returns {Router} Oak router
 */
export function createAuthRouter({ sessionStore }) {
  const router = new Router();

  /**
   * Log out from all devices: drop every session this user owns, including the
   * one making the request. This is the kill-switch that makes the 7-day
   * sliding session safe to keep — a stolen cookie stops working the moment the
   * owner uses it.
   */
  router.post("/logout-all", async (ctx) => {
    const user = ctx.state.user;

    if (!user?.id) {
      ctx.response.status = 401;
      ctx.response.body = { ...UNAUTHORIZED_BODY };
      return;
    }

    await sessionStore.deleteAllSessionsForUser(user.id);

    // Fire-and-forget: Google's revoke endpoint must never delay or fail logout
    revokeGoogleToken(ctx.state.db, ctx.state.authHandler, user.id)
      .catch((error) => console.error("Google token revocation failed:", error));

    // Clears the cookie as well; the row itself is already gone above
    await ctx.state.session.deleteSession();

    ctx.response.body = { success: true, redirectTo: "/" };
  });

  return router;
}
