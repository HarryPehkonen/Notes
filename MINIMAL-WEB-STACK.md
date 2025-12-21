# Minimal Web Stack

A reusable, no-build, minimal-dependency web application stack using modern web standards.

## Philosophy & Principles

1. **No Build Process** - Code runs directly without compilation or bundling
2. **Minimal Dependencies** - Use web standards and CDN imports
3. **Self-Hosted** - Complete control over infrastructure and data
4. **Type Safety Without TypeScript** - JSDoc annotations provide IDE support
5. **Progressive Enhancement** - Works everywhere, enhanced where supported

## Core Technology Stack

### Frontend
- **Lit Web Components** (5KB) - Google's modern web components framework
- **Plain JavaScript** - No transpilation required
- **JSDoc Annotations** - Type documentation and checking
- **CDN Imports** - No npm or node_modules
- **Native CSS** - CSS Grid, Flexbox, Custom Properties (no frameworks)

### Backend
- **Deno Runtime** - Secure, modern JavaScript runtime
- **Oak Framework** - Lightweight middleware framework
- **Plain JavaScript** - With JSDoc type annotations
- **URL Imports** - Direct dependency management

### Deployment
- **Linux VPS** - Ubuntu/Debian recommended
- **Caddy Server** - Automatic HTTPS, reverse proxy
- **systemd** - Service management
- **Git** - Direct deployment via pull

## Project Structure Template

```
project-name/
├── frontend/
│   ├── index.html          # Entry point
│   ├── app.js             # Main application
│   ├── components/        # Web Components
│   │   └── example.js     # Individual components
│   ├── services/          # API clients, utilities
│   ├── styles.css         # Global styles
│   └── manifest.json      # PWA manifest
├── backend/
│   ├── server.js          # Main server file
│   ├── routes/            # API route handlers
│   │   └── api.js
│   ├── services/          # Business logic
│   ├── middleware/        # Oak middleware
│   └── config.js          # Configuration
├── shared/
│   └── types.js           # Shared JSDoc type definitions
├── static/                # Static assets (images, fonts)
├── scripts/
│   ├── deploy.sh          # Deployment script
│   └── dev.sh             # Development script
└── README.md
```

## Frontend Template

### Main HTML (index.html)
```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>App Name</title>
    <link rel="manifest" href="/manifest.json">
    <link rel="stylesheet" href="/styles.css">
    <script type="module" src="/app.js"></script>
</head>
<body>
    <app-root></app-root>
</body>
</html>
```

### Main App (app.js)
```javascript
import { LitElement, html, css } from 'https://cdn.jsdelivr.net/npm/lit@2/index.js';

/**
 * @typedef {Object} AppState
 * @property {boolean} authenticated
 * @property {Object} user
 */

class AppRoot extends LitElement {
    static properties = {
        /** @type {AppState} */
        state: { type: Object }
    };

    constructor() {
        super();
        this.state = { authenticated: false, user: null };
    }

    render() {
        return html`
            <main>
                ${this.state.authenticated
                    ? html`<app-dashboard></app-dashboard>`
                    : html`<app-login></app-login>`
                }
            </main>
        `;
    }
}

customElements.define('app-root', AppRoot);
```

### Component Template (components/example.js)
```javascript
import { LitElement, html, css } from 'https://cdn.jsdelivr.net/npm/lit@2/index.js';

/**
 * Example component demonstrating structure
 * @extends {LitElement}
 */
export class ExampleComponent extends LitElement {
    static styles = css`
        :host {
            display: block;
            padding: 1rem;
        }
    `;

    static properties = {
        /** @type {string} */
        title: { type: String },
        /** @type {number} */
        count: { type: Number }
    };

    /**
     * @param {Event} e
     */
    handleClick(e) {
        this.count++;
        this.dispatchEvent(new CustomEvent('count-changed', {
            detail: { count: this.count }
        }));
    }

    render() {
        return html`
            <h2>${this.title}</h2>
            <button @click=${this.handleClick}>
                Count: ${this.count}
            </button>
        `;
    }
}

customElements.define('example-component', ExampleComponent);
```

## Backend Template

### Server Setup (server.js)
```javascript
import { Application, Router } from "https://deno.land/x/oak/mod.ts";

/**
 * @typedef {import('../shared/types.js').Config} Config
 */

const app = new Application();
const router = new Router();

// Load environment
const PORT = Deno.env.get("PORT") || "8000";

// Middleware
app.use(async (ctx, next) => {
    try {
        await next();
    } catch (err) {
        ctx.response.status = err.status || 500;
        ctx.response.body = { error: err.message };
    }
});

// Routes
router
    .get("/api/health", (ctx) => {
        ctx.response.body = { status: "ok" };
    })
    .get("/api/data", async (ctx) => {
        // Your API logic here
        ctx.response.body = { data: [] };
    });

app.use(router.routes());
app.use(router.allowedMethods());

console.log(`Server running on port ${PORT}`);
await app.listen({ port: parseInt(PORT) });
```

## Shared Types (shared/types.js)

```javascript
/**
 * @typedef {Object} User
 * @property {number} id
 * @property {string} email
 * @property {string} name
 * @property {Date} createdAt
 */

/**
 * @typedef {Object} Config
 * @property {string} databaseUrl
 * @property {number} port
 * @property {string} jwtSecret
 */

// Export empty object to make this a module
export {};
```

## Server Configuration

### Caddy Configuration (/etc/caddy/Caddyfile)
```
yourdomain.com {
    # API routes to backend
    handle /api/* {
        reverse_proxy localhost:8000
    }

    # WebSocket support (if needed)
    @websockets {
        header Connection *Upgrade*
        header Upgrade websocket
    }
    handle @websockets {
        reverse_proxy localhost:8000
    }

    # Frontend static files
    handle {
        root * /var/www/your-app/frontend
        try_files {path} /index.html
        file_server
    }

    # Security headers
    header {
        X-Content-Type-Options nosniff
        X-Frame-Options DENY
        X-XSS-Protection "1; mode=block"
    }
}
```

### systemd Service (/etc/systemd/system/app-backend.service)
```ini
[Unit]
Description=App Backend Service
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/your-app/backend
Environment="PORT=8000"
ExecStart=/usr/bin/deno run \
    --allow-net \
    --allow-read \
    --allow-env \
    server.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

## If a Database is Required

### Option 1: PostgreSQL (Full-Featured)

#### Installation
```bash
sudo apt install postgresql postgresql-contrib
sudo -u postgres createuser --interactive
sudo -u postgres createdb your_app_db
```

#### Connection (backend/db.js)
```javascript
import { Client } from "https://deno.land/x/postgres/mod.ts";

/**
 * @typedef {Object} DatabaseConfig
 * @property {string} user
 * @property {string} database
 * @property {string} hostname
 * @property {number} port
 * @property {string} password
 */

/** @type {DatabaseConfig} */
const dbConfig = {
    user: Deno.env.get("DB_USER") || "app_user",
    database: Deno.env.get("DB_NAME") || "app_db",
    hostname: Deno.env.get("DB_HOST") || "localhost",
    port: parseInt(Deno.env.get("DB_PORT") || "5432"),
    password: Deno.env.get("DB_PASS") || "",
};

const client = new Client(dbConfig);
await client.connect();

export default client;
```

#### Schema Setup
```sql
-- migrations/001_initial.sql
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_email ON users(email);
```

### Option 2: SQLite (Simpler Applications)

```javascript
import { DB } from "https://deno.land/x/sqlite/mod.ts";

const db = new DB("app.db");

db.execute(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        name TEXT
    )
`);

export default db;
```

### Option 3: Deno KV (Key-Value Store)

```javascript
const kv = await Deno.openKv();

// Set a value
await kv.set(["users", userId], userData);

// Get a value
const result = await kv.get(["users", userId]);

// List values
const entries = kv.list({ prefix: ["users"] });
for await (const entry of entries) {
    console.log(entry.key, entry.value);
}
```

## Development Workflow

### Local Development (scripts/dev.sh)
```bash
#!/bin/bash

# Start backend with watch mode
deno run \
    --allow-net \
    --allow-read \
    --allow-env \
    --watch \
    backend/server.js &

# Optionally start a local file server for frontend
python3 -m http.server 3000 -d frontend &

echo "Backend: http://localhost:8000"
echo "Frontend: http://localhost:3000"
```

### Deployment (scripts/deploy.sh)
```bash
#!/bin/bash

echo "Deploying application..."

# Pull latest code
git pull origin main

# Restart backend
sudo systemctl restart app-backend

# Reload Caddy
sudo systemctl reload caddy

echo "Deployment complete!"
```

## Environment Variables (.env.example)

```bash
# Server
PORT=8000

# Database (if used)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=app_db
DB_USER=app_user
DB_PASS=secure_password

# OAuth (if used)
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_secret

# External Services (if used)
DROPBOX_TOKEN=your_token
```

## Common Patterns

### Authentication with OAuth

```javascript
// Simple OAuth flow example
router.get('/auth/google', (ctx) => {
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
    ctx.response.redirect(authUrl);
});

router.get('/auth/callback', async (ctx) => {
    const { code } = ctx.request.url.searchParams;
    // Exchange code for token
    // Create or update user
    // Set session
});
```

### State Management (Frontend)

```javascript
// Simple event-based state management
class StateManager extends EventTarget {
    constructor() {
        super();
        this.state = {};
    }

    /**
     * @param {string} key
     * @param {any} value
     */
    set(key, value) {
        this.state[key] = value;
        this.dispatchEvent(new CustomEvent('change', {
            detail: { key, value }
        }));
    }

    /**
     * @param {string} key
     * @returns {any}
     */
    get(key) {
        return this.state[key];
    }
}

export const appState = new StateManager();
```

### PWA Configuration (manifest.json)

```json
{
    "name": "App Name",
    "short_name": "App",
    "start_url": "/",
    "display": "standalone",
    "theme_color": "#000000",
    "background_color": "#ffffff",
    "icons": [
        {
            "src": "/icon-192.png",
            "sizes": "192x192",
            "type": "image/png"
        },
        {
            "src": "/icon-512.png",
            "sizes": "512x512",
            "type": "image/png"
        }
    ]
}
```

## Minimal Dependencies Guide

### Essential Only
- **Frontend**: Lit (5KB)
- **Backend**: Oak + Database driver
- **Nothing else unless absolutely necessary**

### When You Might Add Dependencies

| Need | Consider | Avoid |
|------|----------|-------|
| Date handling | Native Date API first | moment.js |
| HTTP requests | Native fetch | axios |
| State management | Custom events | Redux |
| Routing | Native History API | React Router |
| Forms | Native FormData | Formik |
| Styling | Native CSS | Bootstrap |
| Icons | SVG icons | Icon fonts |
| Markdown | markdown-it (50KB) | Heavy editors |

### Performance Budget
- Frontend total: < 50KB gzipped
- Initial load: < 2 seconds on 3G
- No bundle > 200KB uncompressed

## Testing Approach

```javascript
// Simple Deno test example
Deno.test("API health check", async () => {
    const response = await fetch("http://localhost:8000/api/health");
    const data = await response.json();
    assertEquals(data.status, "ok");
});
```

Run tests:
```bash
deno test --allow-net
```

## Security Checklist

- [ ] HTTPS only (Caddy handles this)
- [ ] Environment variables for secrets
- [ ] Input validation on all endpoints
- [ ] SQL injection prevention (parameterized queries)
- [ ] XSS prevention (sanitize user content)
- [ ] CSRF tokens for state-changing operations
- [ ] Rate limiting on API endpoints
- [ ] Secure headers (via Caddy)

## Monitoring

Simple health endpoint:
```javascript
router.get('/health', (ctx) => {
    ctx.response.body = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: performance.now()
    };
});
```

Monitor with systemd:
```bash
systemctl status app-backend
journalctl -u app-backend -f
```

## Advantages of This Stack

1. **No Build Process** - Develop = Deploy
2. **Minimal Dependencies** - Less to break, update, or secure
3. **Fast Development** - No waiting for builds
4. **Easy Debugging** - Source maps unnecessary
5. **Future Proof** - Based on web standards
6. **Small Size** - Fast loading, mobile-friendly
7. **Self-Contained** - No external service dependencies

## When This Stack Works Best

✓ **Perfect for:**
- Internal tools
- Small to medium web apps
- PWAs
- Admin panels
- Personal projects
- Prototypes that may become products

✗ **Not ideal for:**
- Large teams (need build process for consistency)
- Complex SPAs (might need framework)
- Heavy real-time apps (consider dedicated solutions)
- SEO-critical content sites (need SSR)

## Quick Start

```bash
# 1. Clone this template
git clone <template-repo> my-app

# 2. Update configuration
cd my-app
nano backend/config.js

# 3. Run locally
./scripts/dev.sh

# 4. Deploy
./scripts/deploy.sh
```

Your app is now running with zero build time!
