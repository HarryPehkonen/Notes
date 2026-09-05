/**
 * Google OAuth Handler
 * Minimal OAuth 2.0 implementation without external libraries
 */

/**
 * @typedef {Object} TokenResponse
 * @property {string} access_token
 * @property {string} token_type
 * @property {number} expires_in
 * @property {string} refresh_token
 * @property {string} scope
 * @property {string} id_token
 */

/**
 * @typedef {Object} UserInfo
 * @property {string} id
 * @property {string} email
 * @property {boolean} verified_email
 * @property {string} name
 * @property {string} given_name
 * @property {string} family_name
 * @property {string} picture
 * @property {string} locale
 */

/**
 * Revoke a user's stored Google access token, best effort
 *
 * Called on logout so the token we obtained during sign-in stops being valid on
 * Google's side too. Deliberately total: it never throws and never rejects, so
 * callers can fire-and-forget it without risking the logout itself. A user with
 * no stored provider row (or no access token) is simply a no-op.
 * @param {Object} db - Database client with a query(sql, params) method
 * @param {GoogleAuthHandler} authHandler - Handler exposing revokeToken()
 * @param {number} userId - Owner of the token
 * @returns {Promise<boolean>} True only when Google accepted the revocation
 */
export async function revokeGoogleToken(db, authHandler, userId) {
  try {
    const result = await db.query(
      `SELECT access_token FROM auth_providers
       WHERE user_id = $1 AND provider = 'google'
       ORDER BY updated_at DESC NULLS LAST
       LIMIT 1`,
      [userId],
    );

    const accessToken = result.rows[0]?.access_token;
    if (!accessToken) return false;

    return await authHandler.revokeToken(accessToken) === true;
  } catch (error) {
    // Never let a failed revoke break logging out
    console.error("Google token revocation failed:", error.message);
    return false;
  }
}

/**
 * Decide whether an OAuth userinfo payload identifies a verified user
 *
 * Accounts are keyed by email, so an UNVERIFIED email must never sign in: a
 * Google account claiming (but not owning) an existing user's address would
 * otherwise take that account over. Google's v2 userinfo endpoint reports
 * `verified_email`; OIDC-style payloads call it `email_verified`. Only an
 * explicit boolean true on either counts.
 * @param {Object|null|undefined} userInfo - Payload from the userinfo endpoint
 * @returns {boolean} True only for a payload with a usable, verified email
 */
export function isVerifiedOAuthUser(userInfo) {
  if (!userInfo || typeof userInfo.email !== "string" || userInfo.email.length === 0) {
    return false;
  }
  return userInfo.verified_email === true || userInfo.email_verified === true;
}

export class GoogleAuthHandler {
  /**
   * @param {string} clientId - Google OAuth client ID
   * @param {string} clientSecret - Google OAuth client secret
   * @param {string} redirectUri - Callback URL
   */
  constructor(clientId, clientSecret, redirectUri) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.redirectUri = redirectUri;

    // Google OAuth endpoints
    this.authEndpoint = "https://accounts.google.com/o/oauth2/v2/auth";
    this.tokenEndpoint = "https://oauth2.googleapis.com/token";
    this.userInfoEndpoint = "https://www.googleapis.com/oauth2/v2/userinfo";

    // Scopes we need
    this.scopes = [
      "openid",
      "email",
      "profile",
    ];
  }

  /**
   * Generate the OAuth authorization URL
   * @param {string} [state] - Optional state parameter for security
   * @returns {string} Authorization URL
   */
  getAuthorizationUrl(state = null) {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: "code",
      scope: this.scopes.join(" "),
      access_type: "offline", // Get refresh token
      prompt: "consent", // Always show consent screen
    });

    if (state) {
      params.append("state", state);
    }

    return `${this.authEndpoint}?${params.toString()}`;
  }

  /**
   * Exchange authorization code for tokens
   * @param {string} code - Authorization code from Google
   * @returns {Promise<TokenResponse>} Token response
   */
  async exchangeCodeForTokens(code) {
    const params = new URLSearchParams({
      code: code,
      client_id: this.clientId,
      client_secret: this.clientSecret,
      redirect_uri: this.redirectUri,
      grant_type: "authorization_code",
    });

    const response = await fetch(this.tokenEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token exchange failed: ${response.status} - ${error}`);
    }

    const tokens = await response.json();
    return tokens;
  }

  /**
   * Get user information using access token
   * @param {string} accessToken - Access token from Google
   * @returns {Promise<UserInfo>} User information
   */
  async getUserInfo(accessToken) {
    const response = await fetch(this.userInfoEndpoint, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to get user info: ${response.status} - ${error}`);
    }

    const userInfo = await response.json();
    return userInfo;
  }

  /**
   * Refresh an access token using a refresh token
   * @param {string} refreshToken - Refresh token
   * @returns {Promise<TokenResponse>} New token response
   */
  async refreshAccessToken(refreshToken) {
    const params = new URLSearchParams({
      refresh_token: refreshToken,
      client_id: this.clientId,
      client_secret: this.clientSecret,
      grant_type: "refresh_token",
    });

    const response = await fetch(this.tokenEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token refresh failed: ${response.status} - ${error}`);
    }

    const tokens = await response.json();
    return tokens;
  }

  /**
   * Revoke a token (logout from Google's side)
   * @param {string} token - Access or refresh token to revoke
   * @returns {Promise<boolean>} Success status
   */
  async revokeToken(token) {
    const response = await fetch(`https://oauth2.googleapis.com/revoke?token=${token}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    return response.ok;
  }

  /**
   * Decode JWT ID token (basic decode, no verification)
   * @param {string} idToken - JWT ID token from Google
   * @returns {Object} Decoded token payload
   */
  decodeIdToken(idToken) {
    try {
      const parts = idToken.split(".");
      if (parts.length !== 3) {
        throw new Error("Invalid JWT format");
      }

      // Decode base64url payload (handle UTF-8 via TextDecoder)
      const payload = parts[1];
      const binary = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
      const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
      const decoded = new TextDecoder().decode(bytes);
      return JSON.parse(decoded);
    } catch (error) {
      console.error("Failed to decode ID token:", error);
      return null;
    }
  }

  /**
   * Validate configuration
   * @returns {boolean} True if configuration is valid
   */
  isConfigured() {
    return !!(this.clientId && this.clientSecret && this.redirectUri);
  }
}
