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
            "profile"
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

            // Decode base64url payload
            const payload = parts[1];
            const decoded = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
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