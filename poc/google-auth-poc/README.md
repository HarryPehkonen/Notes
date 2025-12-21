# Google OAuth Proof of Concept

A minimal implementation of Google OAuth 2.0 authentication using Deno and Oak, without any OAuth libraries.

## Features

- ✓ Complete OAuth 2.0 flow
- ✓ No external OAuth libraries (pure fetch API)
- ✓ User profile retrieval
- ✓ Session management
- ✓ Clean, modern UI
- ✓ Token refresh support
- ✓ Fully typed with JSDoc

## Prerequisites

- Deno installed
- Google Cloud Console account
- A Google Cloud project with OAuth configured

## Setup

### 1. Create Google OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Select or create a project
3. Navigate to **APIs & Services > Credentials**
4. Click **Create Credentials > OAuth client ID**
5. Choose **Web application**
6. Configure:
   - **Name**: Notes App (or your preference)
   - **Authorized JavaScript origins**:
     - `http://localhost:8000`
   - **Authorized redirect URIs**:
     - `http://localhost:8000/auth/callback`
7. Click **Create**
8. Copy the **Client ID** and **Client Secret**

### 2. Enable Google+ API

1. In Google Cloud Console, go to **APIs & Services > Library**
2. Search for "Google+ API"
3. Click on it and press **Enable**

### 3. Configure Environment

```bash
# Copy the example file
cp .env.example .env

# Edit .env and add your credentials
nano .env
```

Add your credentials:
```env
GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REDIRECT_URI=http://localhost:8000/auth/callback
```

### 4. Run the Server

```bash
# With environment variables from .env file
deno run --allow-net --allow-read --allow-env server.js

# Or export them directly
export GOOGLE_CLIENT_ID="your_client_id"
export GOOGLE_CLIENT_SECRET="your_secret"
export GOOGLE_REDIRECT_URI="http://localhost:8000/auth/callback"
deno run --allow-net --allow-env server.js
```

### 5. Test the Flow

1. Open http://localhost:8000
2. Click "Sign in with Google"
3. Authorize the application
4. View your profile on the dashboard

## How It Works

### OAuth Flow

1. **User clicks "Sign in"** → Redirected to Google
2. **User authorizes** → Google redirects back with code
3. **Server exchanges code** → Gets access token
4. **Server fetches profile** → Gets user data
5. **Session created** → User logged in

### File Structure

```
google-auth-poc/
├── server.js           # Oak server with routes
├── auth-handler.js     # Google OAuth logic
├── public/
│   ├── index.html     # Login page
│   └── dashboard.html # Success page
├── .env.example       # Environment template
└── README.md          # This file
```

### Key Components

#### `auth-handler.js`
- `getAuthorizationUrl()` - Builds Google OAuth URL
- `exchangeCodeForTokens()` - Trades code for tokens
- `getUserInfo()` - Fetches user profile
- `refreshAccessToken()` - Refreshes expired tokens

#### `server.js`
- `/` - Home page (login)
- `/auth/google` - Starts OAuth flow
- `/auth/callback` - Handles Google redirect
- `/dashboard` - Shows user info
- `/auth/logout` - Clears session
- `/api/user` - API endpoint for user data

## Security Notes

### For Production

1. **Use HTTPS** - OAuth requires secure connections
2. **Implement CSRF protection** - Add state parameter
3. **Secure session storage** - Use Redis or database
4. **Validate tokens** - Verify JWT signatures
5. **Implement rate limiting** - Prevent abuse

### Example CSRF Protection

```javascript
// Generate state
const state = crypto.randomUUID();
sessions.set(state, { timestamp: Date.now() });

// Add to auth URL
const authUrl = auth.getAuthorizationUrl(state);

// Verify on callback
if (state !== receivedState) {
    throw new Error("Invalid state");
}
```

## Integration with Notes App

This POC proves the authentication foundation for the Notes app:

### User Creation
```javascript
// After successful OAuth
const user = await createOrUpdateUser({
    email: userInfo.email,
    name: userInfo.name,
    googleId: userInfo.id,
    picture: userInfo.picture
});
```

### Multiple Providers
```javascript
// Same pattern for GitHub, Dropbox
class GitHubAuthHandler { /* ... */ }
class DropboxAuthHandler { /* ... */ }

// Link accounts by email
await linkProviderAccount(user.email, provider, providerId);
```

### Database Schema
```sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255),
    picture TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE auth_providers (
    user_id INTEGER REFERENCES users(id),
    provider VARCHAR(50),
    provider_id VARCHAR(255),
    access_token TEXT,
    refresh_token TEXT,
    PRIMARY KEY (provider, provider_id)
);
```

## Troubleshooting

### "Invalid client" Error
- Check Client ID and Secret are correct
- Ensure they're properly set in environment

### "Redirect URI mismatch"
- Verify redirect URI matches exactly in Google Console
- Include protocol (http://) and port (:8000)

### "Access blocked" Error
- Enable Google+ API in Cloud Console
- Check OAuth consent screen is configured

### Session Not Persisting
- Cookies might be blocked
- Try incognito mode or different browser

## Next Steps

1. ✓ Basic OAuth flow working
2.   Add GitHub OAuth
3.   Add Dropbox OAuth
4.   Integrate with PostgreSQL
5.   Implement account linking
6.   Add CSRF protection
7.   Deploy with HTTPS

## Resources

- [Google OAuth 2.0 Documentation](https://developers.google.com/identity/protocols/oauth2)
- [OAuth 2.0 Playground](https://developers.google.com/oauthplayground/)
- [Google API Console](https://console.cloud.google.com/apis/)
- [Oak Documentation](https://oakserver.github.io/oak/)

## License

MIT - Use freely for your projects!
