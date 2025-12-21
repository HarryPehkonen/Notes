Core Editor:
Live WYSIWYG-style Markdown editor.
Rich content embedding (YouTube, etc.).
Code syntax highlighting.
Interactive task lists.
Easy-to-use tables.
Organization & Search:
Powerful full-text search using PostgreSQL's native capabilities.
Flexible tagging system.
Bi-directional note linking ([[Note Title]]).
Pinning/Favoriting notes.
Advanced Features:
Version History: Automatically save previous versions of notes and allow users to view or restore them.
Backup & Sync:
Automatic Dropbox Export: Periodically export all user notes to their connected Dropbox as Markdown files.
Import from Dropbox: Allow users to bulk import Markdown files from Dropbox.
Export formats: Individual Markdown files organized by folders/tags, or a single JSON backup file.
Scheduled backups: Daily/weekly automatic backup options.
Authentication & Multi-tenancy:
Provider-based Login: Use OAuth/OpenID Connect for authentication.
Account Linking: Automatically link multiple providers to a single user account based on a verified email address. No local passwords.
Data Isolation: Complete separation of user data - no user can access another user's notes.
User-specific encryption keys for sensitive data.
Responsive Design & PWA:
Mobile-First Design: Primary usage via mobile phone browsers.
Progressive Web App (PWA): Installable on mobile devices with offline viewing of cached notes.
Responsive layout that adapts from mobile phones to laptop screens.
Touch-optimized controls for mobile interaction.

## Technology Stack

Frontend:
- **Lit Web Components** (5KB) - Google's modern web components framework
- **Plain JavaScript** - No TypeScript compilation needed
- **JSDoc Annotations** - Type safety through documentation
- **No Build Process** - Direct browser execution
- **CDN Imports** - No npm/node_modules required

Backend:
- **Deno Runtime** - Secure, modern JavaScript/TypeScript runtime
- **Oak Framework** - Modern middleware framework for Deno
- **PostgreSQL** - Database with native full-text search
- **Plain JavaScript** - With JSDoc for type documentation

Deployment:
- **Self-Hosted Linux VPS** - Complete control and data sovereignty
- **Caddy Server** - Automatic HTTPS and reverse proxy
- **systemd** - Service management
- **No External Services** - Except OAuth providers and Dropbox for backup

## Architecture Details

No Build Process:
- Frontend JavaScript served directly to browser
- Deno executes backend code without compilation
- No webpack, babel, or bundlers required
- Development code = Production code

Component Model:
- Web Components via Lit
- Native browser support
- No virtual DOM overhead
- Works with any framework or vanilla JS

Type Safety:
- JSDoc annotations throughout
- Deno's built-in type checking for JavaScript
- IDE autocomplete and IntelliSense support
- No TypeScript compilation step

## Development Approach

Minimal Dependencies:
- Core: Lit (frontend) + Oak (backend) + PostgreSQL driver
- OAuth: Deno OAuth2 client
- Markdown: Markdown-it or similar lightweight parser
- Dropbox: Official SDK or REST API directly

File Structure:
```
/var/www/notes/
├── frontend/
│   ├── index.html        # Main HTML entry point
│   ├── app.js           # Main app with Web Components
│   ├── components/      # Lit components
│   ├── styles.css       # Simple CSS, no framework
│   └── manifest.json    # PWA manifest
├── backend/
│   ├── server.js        # Main Deno server
│   ├── routes/          # API routes
│   ├── services/        # Business logic
│   └── db/              # Database queries
├── shared/
│   └── types.js         # JSDoc type definitions
└── scripts/
    └── deploy.sh        # Deployment script

```

Deployment Flow:
1. Git push to repository
2. SSH to VPS and git pull
3. Restart Deno service via systemd
4. No build step required
5. Caddy handles HTTPS automatically

## Server Configuration

Caddy Configuration (/etc/caddy/Caddyfile):
```
notes.yourdomain.com {
    # API requests to Deno backend
    handle /api/* {
        reverse_proxy localhost:8000
    }

    # Serve frontend files
    handle {
        root * /var/www/notes/frontend
        try_files {path} /index.html
        file_server
    }
}
```

systemd Service (/etc/systemd/system/notes-backend.service):
```
[Unit]
Description=Notes App Backend
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/notes/backend
ExecStart=/usr/bin/deno run --allow-net --allow-read --allow-env --allow-write server.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

PostgreSQL Setup:
```sql
-- Create database and user
CREATE DATABASE notes_app;
CREATE USER notes_user WITH PASSWORD 'secure_password';
GRANT ALL PRIVILEGES ON DATABASE notes_app TO notes_user;

-- Enable full-text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

## 1. The Login Screen  
This is the front door to your application. Since you're not using email/passwords, this screen would be very simple.
Purpose: Authenticate the user.
Components:
A clean, minimal page with your app's name or logo.
A set of "Sign in with..." buttons for each provider you support (e.g., Google, GitHub, Dropbox).
There are no traditional input fields for username or password.

## 2. The Main Application View  
This is the user's workspace and where they'll spend almost all of their time. It's best imagined as a multi-pane layout.
Purpose: Navigate, create, and edit notes.
Components:
A) The Sidebar / Note List: A column on the left that lists all the user's notes.
Can be sorted by date, title, etc.
Includes a prominent "New Note" button.
May include filters for tags.
A link to the Account Settings screen.
B) The Editor Pane: The main, largest area of the screen.
If no note is selected, it might show a welcome message or instructions.
When a note is selected from the sidebar, its content appears here for viewing and editing. This is where your live Markdown editor lives.
It would also contain the controls for the current note, like a "delete" button, tag editor, and a menu to access Version History.

## 3. The Search Interface ⚙
This is less of a full "screen" and more of an interactive state or overlay built on top of the Main View.
Purpose: Allow the user to quickly find notes.
Implementation Idea: When a user clicks a search icon or types in a search bar (likely located at the top of the sidebar), a full-screen modal or overlay appears.
This overlay would have a large text input field.
As the user types, a list of results appears below, showing the note title and a small snippet of the text where the search term was found.
Clicking a result would close the search interface and open that note in the Editor Pane.

## 4. The Version History View  
This screen is dedicated to viewing and restoring older versions of a single note.
Purpose: Compare and restore previous note versions.
Components:
A list or timeline (perhaps in a sidebar) showing all saved versions with their timestamps (e.g., "Sept 26, 2025, 6:15 AM").
A large, read-only pane showing the content of the selected historical version.
A prominent "Restore This Version" button. This would copy the content of the old version into a new version for the note.

## 5. Account Settings Screen  
This is a simple, form-based page for user management.
Purpose: Allow the user to manage their profile and linked logins.
Components:
Display the user's name and primary email.
A section titled "Linked Accounts" that shows which providers are currently connected (e.g., "Google - connected").
Buttons to "Link another account" which would start the OAuth flow for a new provider.
Backup Settings section:
Connect/disconnect Dropbox for backups.
Set backup frequency (daily, weekly, manual only).
"Backup Now" button for manual backups.
"Import from Dropbox" button with folder selection.
Last backup timestamp display.
Could also include application preferences, like switching between a light and dark theme.

