/**
 * The media-watch "waiting on" projection, served to the app's own session.
 *
 * Mounted at /api/waiting-on behind requireAuth (see server/main.js). The
 * upstream endpoint is only on the WireGuard mesh and only answers plain HTTP,
 * so the browser can never call it directly: this route fetches it server-side
 * and returns the normalized view (server/waiting-on.js owns the shape and the
 * staleness rule).
 *
 * It is read-only in both directions: GET only, and nothing is ever sent back
 * upstream. There is no new auth on the endpoint; the app's session is the
 * access control, exactly as for every other /api route.
 */

import { Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { DEFAULT_STALE_MINUTES, DEFAULT_TIMEOUT_MS, loadWaitingOn } from "../waiting-on.js";

/**
 * Build the /api/waiting-on router.
 *
 * @param {Object} [deps]
 * @param {string} [deps.url] - endpoint URL (config; from server/main.js)
 * @param {number} [deps.timeoutMs]
 * @param {number} [deps.staleMinutes]
 * @param {typeof fetch} [deps.fetchImpl] - transport, injected for tests
 * @returns {Router} Oak router
 */
export function createWaitingRouter(deps = {}) {
  const router = new Router();

  router.get("/", async (ctx) => {
    const data = await loadWaitingOn({
      url: deps.url,
      timeoutMs: deps.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      staleMinutes: deps.staleMinutes ?? DEFAULT_STALE_MINUTES,
      fetchImpl: deps.fetchImpl,
    });

    // Always 200: a failure is a rendered state on the page, not a broken
    // request. The status lives in the body (`status: ok | stale | error`).
    ctx.response.type = "application/json";
    ctx.response.body = { success: true, data };
  });

  return router;
}
