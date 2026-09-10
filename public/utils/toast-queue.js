/**
 * Toast identity.
 *
 * A toast carries an id so its own five-second timer removes that toast and no
 * other. `Date.now()` was used directly, so two toasts created inside the same
 * millisecond shared an id and one removal swept away both.
 */

/**
 * An id that is not already on screen.
 *
 * @param {{id?: unknown}[]|null|undefined} existingToasts
 * @param {number} [now] The current time, injectable for tests.
 * @returns {number}
 */
export function makeToastId(existingToasts, now = Date.now()) {
  const taken = new Set((existingToasts ?? []).map((toast) => toast?.id));

  let id = now;
  while (taken.has(id)) id += 1;
  return id;
}
