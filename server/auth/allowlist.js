/**
 * Signup allowlist for OAuth sign-in.
 *
 * `ALLOWED_EMAILS` restricts who may create a NEW account. Users that already
 * exist are grandfathered so turning the list on never locks anyone out.
 *
 * @param {string} email - Verified email from the OAuth provider
 * @param {string | null | undefined} allowedEmailsRaw - Raw ALLOWED_EMAILS value
 * @param {() => Promise<boolean> | boolean} userExists - Looked up only when needed
 * @returns {Promise<{ allowed: boolean, reason: string }>}
 */
export async function checkAllowlist(email, allowedEmailsRaw, userExists) {
  if (!allowedEmailsRaw || allowedEmailsRaw.trim().length === 0) {
    return { allowed: true, reason: "open-signup" };
  }

  const allowed = allowedEmailsRaw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0);

  if (allowed.includes(String(email).trim().toLowerCase())) {
    return { allowed: true, reason: "on-allowlist" };
  }

  if (await userExists()) {
    return { allowed: true, reason: "existing-user" };
  }

  return { allowed: false, reason: "not-on-allowlist" };
}
