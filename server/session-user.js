/**
 * The signed-in user, injected into the served page.
 *
 * Until 2026-09-18 the client read `globalThis.user` and a comment promised the
 * server injected it. Nothing did: the avatar and name in the drawer never
 * rendered, and because the desktop avatar button is what opens the account
 * menu, desktop had no route to Log out at all. This module is that promise,
 * kept: index.html carries `{{SESSION_USER_NAME}}` and the `/` handler fills it
 * from the session, exactly as APP_NAME is filled per request.
 *
 * Deliberately the NAME ONLY. The email and the Google picture stay out of the
 * HTML: the picture host is not in the page's `img-src` (a photo would mean
 * widening the CSP and phoning Google on every load), and every field written
 * into a served document is one more thing to leak.
 */

import { escapeHtml } from "./branding.js";

/**
 * Replace `{{SESSION_USER_NAME}}` with the session's display name, HTML-escaped.
 * With no session (or no name) the value is an empty string, so the client's
 * reader sees "no user" rather than the literal placeholder.
 * @param {string} html - Document text
 * @param {{ name?: unknown } | null | undefined} user - Session user, if any
 * @returns {string} HTML with the placeholder replaced
 */
export function injectSessionUser(html, user) {
  const raw = user && typeof user.name === "string" ? user.name.trim() : "";
  return html.replace(/\{\{\s*SESSION_USER_NAME\s*\}\}/g, escapeHtml(raw));
}
