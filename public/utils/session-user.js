/**
 * The signed-in user, as the page learns about them.
 *
 * Until 2026-09-18 the component read `globalThis.user`, with a comment saying
 * the server "injects" it. Nothing ever did: no placeholder, no writer, no
 * test. So `this.user` was always null, which silently removed the avatar and
 * name in the drawer AND the desktop avatar button that is the only way to
 * open the account menu (and therefore the only desktop route to Log out).
 *
 * The user now arrives as an injected meta tag, the same mechanism APP_NAME
 * uses: `index.html` carries `{{SESSION_USER_NAME}}`, the server fills it per
 * request from the session (server/session-user.js), and this module reads it.
 *
 * Deliberately no third-party image: the Google avatar host is not in the
 * page's `img-src`, and the page should not phone Google on every load just to
 * decorate a button. The avatar is the name's initial, rendered locally.
 */

/**
 * The initial an avatar circle shows: the first code point of the name, upper
 * cased. Code-point aware so names starting with an accented letter or an emoji
 * are not cut in half.
 * @param {string} name - A non-blank display name
 * @returns {string} One character
 */
export function initialOf(name) {
  const first = [...name.trim()][0];
  return first === undefined ? "" : first.toUpperCase();
}

/**
 * Build the user object from the injected name, or null when there is none.
 * @param {unknown} name - Contents of the injected meta tag (usually a string)
 * @returns {{ name: string, initial: string } | null}
 */
export function parseSessionUser(name) {
  const clean = typeof name === "string" ? name.trim() : "";
  if (clean.length === 0) return null;
  return { name: clean, initial: initialOf(clean) };
}

/**
 * Read the user the server injected into this document.
 * @param {(name: string) => string} getMeta - Reads a meta tag's content
 * @returns {{ name: string, initial: string } | null}
 */
export function readSessionUser(getMeta = defaultGetMeta) {
  return parseSessionUser(getMeta("session-user-name"));
}

/**
 * The real DOM read, kept separate so everything above is testable without one.
 * @param {string} name - The meta tag's name attribute
 * @returns {string}
 */
function defaultGetMeta(name) {
  const meta = globalThis.document?.querySelector(`meta[name="${name}"]`);
  return meta?.getAttribute("content") ?? "";
}
