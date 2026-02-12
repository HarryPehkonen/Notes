# Notes Application

A complete, production-ready notes application built with the minimal web stack philosophy. Features secure authentication, full-text search, automatic backups, and a mobile-first design.

## ★ Features

### Core Functionality

- ✓ **Secure Authentication** - Google OAuth 2.0, no local passwords
- ✓ **Rich Note Editor** - Markdown support with live preview
- ✓ **Full-Text Search** - PostgreSQL native search with ranking
- ✓ **Tag System** - Organize notes with colored tags
- ✓ **Version History** - Automatic versioning with restore capability
- ✓ **Automatic Backups** - Scheduled Dropbox synchronization

### Technical Features

- ✓ **Mobile-First Design** - Responsive, touch-friendly interface
- ✓ **Progressive Web App** - Installable with offline capabilities
- ✓ **Real-Time Updates** - Live search and auto-save
- ✓ **Offline Support** - IndexedDB persistence with automatic sync when online
- ✓ **Crash Recovery** - Local drafts protect against browser crashes and network failures
- ✓ **No Build Process** - Direct browser execution with ES modules
- ✓ **Minimal Dependencies** - Clean, maintainable codebase

## Architecture

### Technology Stack

- **Backend**: Deno + Oak framework
- **Database**: PostgreSQL with full-text search
- **Frontend**: Lit Web Components + Vanilla CSS
- **Authentication**: Google OAuth 2.0
- **Backup**: Dropbox API integration
- **Deployment**: Self-hosted with systemd + Caddy

### Project Structure

```
├── server/
│   ├── main.js              # Main Oak server
│   ├── auth/
│   │   ├── auth-handler.js  # OAuth 2.0 implementation
│   │   └── middleware.js    # Authentication middleware
│   ├── database/
│   │   ├── client.js        # PostgreSQL client wrapper
│   │   └── schema.sql       # Database schema
│   ├── api/
│   │   ├── notes.js         # Notes CRUD endpoints
│   │   ├── tags.js          # Tag management endpoints
│   │   ├── search.js        # Search endpoints
│   │   └── backup.js        # Backup/restore endpoints
│   └── services/
│       ├── dropbox.js       # Dropbox API wrapper
│       └── backup-scheduler.js # Automatic backup service
├── public/
│   ├── index.html           # Main app shell
│   ├── components/
│   │   ├── notes-app.js     # Root component
│   │   ├── note-editor.js   # Note editing interface
│   │   ├── note-list.js     # Notes listing component
│   │   ├── search-bar.js    # Search interface
│   │   └── tag-manager.js   # Tag management UI
│   ├── services/
│   │   ├── persistence.js   # IndexedDB offline storage
│   │   └── sync-manager.js  # Sync coordinator with retry
│   ├── styles/
│   │   └── app.css          # Mobile-first CSS
│   └── app.js               # Main application logic
├── tests/
│   └── deno/                # Deno unit tests
├── poc/                     # Proof-of-concept projects
├── deno.json                # Deno configuration
├── .env.example             # Environment template
└── README.md                # This file
```

## → Quick Start

### Prerequisites

- [Deno](https://deno.land/) 1.40+
- [PostgreSQL](https://www.postgresql.org/) 12+
- Google OAuth credentials
- Dropbox API access token

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/HarryPehkonen/Notes.git
   cd Notes
   ```

2. **Set up PostgreSQL:**
   ```bash
   # Create database and user
   sudo -u postgres createuser notes_user
   sudo -u postgres createdb notes_app -O notes_user

   # Set password
   sudo -u postgres psql
   ALTER USER notes_user WITH PASSWORD 'your_secure_password';
   \q
   ```

3. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your credentials
   ```

4. **Get API credentials:**
   - **Google OAuth**: [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
   - **Dropbox**: [Dropbox Developers](https://www.dropbox.com/developers/apps)

5. **Start the application:**
   ```bash
   deno task dev
   ```

6. **Open browser:**
   Navigate to `http://localhost:8000`

## Configuration

### Environment Variables

```env
# Server Configuration
PORT=8000
HOST=localhost
NODE_ENV=development

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=notes_app
DB_USER=notes_user
DB_PASSWORD=your_secure_password

# Google OAuth Configuration
GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REDIRECT_URI=http://localhost:8000/auth/callback

# Dropbox Configuration
DROPBOX_ACCESS_TOKEN=your_dropbox_access_token

# Session Configuration
SESSION_SECRET=your_super_secret_session_key

# Backup Configuration
BACKUP_INTERVAL_HOURS=24
AUTO_BACKUP_ENABLED=true
```

### Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create a new project or select existing
3. Enable the Google+ API
4. Create OAuth 2.0 Client ID credentials
5. Add authorized redirect URI: `http://localhost:8000/auth/callback`
6. Copy Client ID and Client Secret to `.env`

### Dropbox API Setup

1. Go to [Dropbox Developers](https://www.dropbox.com/developers/apps)
2. Create a new app with "Scoped access" and "Full Dropbox"
3. Enable required permissions in the Permissions tab:
   - `files.metadata.write`
   - `files.content.write`
   - `files.content.read`
4. Generate an access token
5. Copy token to `.env`

## Development

### Available Commands

```bash
# Development with auto-reload (localhost:8000)
deno task dev

# Production start (localhost:8000, use behind reverse proxy)
deno task start

# Staging (0.0.0.0:8000, direct external access)
deno task staging

# Run tests
deno task test

# Lint code
deno task lint

# Format code
deno task fmt
```

| Task | Host | Watch | Use case |
|------|------|-------|----------|
| `dev` | localhost | Yes | Local development |
| `start` | localhost | No | Production behind Caddy |
| `staging` | 0.0.0.0 | No | Direct external access |

### Database Management

The server uses two schema files:
- **`schema-init.sql`** - Production-safe, uses `IF NOT EXISTS` (default)
- **`schema.sql`** - Development reset, drops all tables first

```bash
# Normal startup (preserves data)
deno task start

# Reset database (DESTROYS ALL DATA - development only)
RESET_DATABASE=true deno task dev

# Database backup
pg_dump -U notes_user notes_app > backup.sql

# Database restore
psql -U notes_user -d notes_app < backup.sql
```

### Development Workflow

1. **Code Changes**: Edit files in `server/` or `public/`
2. **Auto-Reload**: Development server automatically restarts
3. **Browser Refresh**: Frontend changes require browser refresh
4. **Database Changes**: Update `schema.sql` and restart server
5. **API Testing**: Use browser dev tools or curl for API testing

## Mobile-First Design

The application is built mobile-first with:

- **Responsive Layout**: Adapts to any screen size
- **Touch-Friendly**: Large touch targets and gestures
- **Offline-Ready**: PWA capabilities with service worker
- **Fast Loading**: Minimal CSS and JS footprint
- **Accessibility**: Semantic HTML and ARIA labels

### Responsive Breakpoints

- **Mobile**: < 768px (primary focus)
- **Tablet**: 768px - 1024px
- **Desktop**: > 1024px

## Security

### Authentication

- Google OAuth 2.0 with secure token exchange
- No password storage or management
- Secure session cookies with CSRF protection
- Automatic session expiration

### Database Security

- Parameterized queries prevent SQL injection
- Row-level security with user ID filtering
- Connection pooling with secure credentials
- Regular schema updates and patches

### API Security

- Authentication required for all endpoints
- Input validation and sanitization
- Rate limiting and error handling
- CORS configuration for browser safety

## Database Schema

### Core Tables

#### Users

```sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255),
    picture TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    preferences JSONB DEFAULT '{}'
);
```

#### Notes

```sql
CREATE TABLE notes (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    title VARCHAR(500) NOT NULL,
    content TEXT,
    content_plain TEXT, -- For full-text search
    is_pinned BOOLEAN DEFAULT FALSE,
    is_archived BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    search_vector tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('english', title), 'A') ||
        setweight(to_tsvector('english', content_plain), 'B')
    ) STORED
);
```

#### Tags & Relationships

```sql
CREATE TABLE tags (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    name VARCHAR(100) NOT NULL,
    color VARCHAR(7) DEFAULT '#667eea',
    UNIQUE(user_id, name)
);

CREATE TABLE note_tags (
    note_id INTEGER REFERENCES notes(id) ON DELETE CASCADE,
    tag_id INTEGER REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (note_id, tag_id)
);
```

### Key Features

- **Full-Text Search**: Automatic search vector generation
- **Version History**: Trigger-based versioning on updates
- **Efficient Indexing**: GIN indexes for search, B-tree for queries
- **Data Integrity**: Foreign key constraints and cascading deletes

## Backup System

### Automatic Backups

- **Schedule**: Every 24 hours (configurable)
- **Storage**: Dropbox `/notes-app-backups/` folder
- **Format**: JSON with complete user data
- **Retention**: Last 10 automatic backups per user
- **Cleanup**: Automatic deletion of old backups

### Manual Backups

- **On-Demand**: Create backup via API or UI
- **Custom Naming**: User-defined backup names
- **Immediate**: No scheduling delays
- **Download**: Direct download capability

### Restore Process

- **Selective**: Choose specific backup to restore
- **Merge Modes**: Append or replace existing data
- **Validation**: Backup format verification
- **Rollback**: Database transaction protection

## API Documentation

### Authentication Endpoints

```http
GET  /auth/login              # Redirect to Google OAuth
GET  /auth/callback           # OAuth callback handler
POST /auth/logout             # End session
```

### Notes Endpoints

```http
GET    /api/notes             # Get user notes
POST   /api/notes             # Create new note
GET    /api/notes/:id         # Get specific note
PUT    /api/notes/:id         # Update note
DELETE /api/notes/:id         # Archive note
GET    /api/notes/:id/versions # Get version history
POST   /api/notes/:id/restore/:versionId # Restore version
```

### Search Endpoints

```http
GET  /api/search              # Full-text search
GET  /api/search/suggestions  # Search suggestions
GET  /api/search/recent       # Recent activity
POST /api/search/advanced     # Advanced search
```

### Tags Endpoints

```http
GET    /api/tags              # Get user tags
POST   /api/tags              # Create tag
PUT    /api/tags/:id          # Update tag
DELETE /api/tags/:id          # Delete tag
GET    /api/tags/:id/notes    # Get notes with tag
```

### Backup Endpoints

```http
POST   /api/backup/create     # Create backup
GET    /api/backup/list       # List backups
GET    /api/backup/download   # Download backup
POST   /api/backup/restore    # Restore backup
DELETE /api/backup/:path      # Delete backup
GET    /api/backup/status     # Backup status
```

## → Deployment

### Production Setup

1. **Server Preparation:**
   ```bash
   # Update system
   sudo apt update && sudo apt upgrade -y

   # Install PostgreSQL
   sudo apt install postgresql postgresql-contrib

   # Install Caddy
   sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
   curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
   curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
   sudo apt update && sudo apt install caddy
   ```

2. **Database Setup:**
   ```bash
   sudo -u postgres createuser notes_user
   sudo -u postgres createdb notes_app -O notes_user
   sudo -u postgres psql -c "ALTER USER notes_user WITH PASSWORD 'secure_production_password';"
   ```

3. **Application Deployment:**
   ```bash
   # Clone application
   git clone https://github.com/HarryPehkonen/Notes.git /opt/notes-app
   cd /opt/notes-app

   # Configure environment
   cp .env.example .env
   # Edit .env with production values

   # Test application
   deno task start
   ```

4. **Systemd Service:**
   ```ini
   # /etc/systemd/system/notes-app.service
   [Unit]
   Description=Notes Application
   After=network.target postgresql.service

   [Service]
   Type=simple
   User=notes
   WorkingDirectory=/opt/notes-app
   ExecStart=/home/notes/.deno/bin/deno run --allow-net --allow-read --allow-env --allow-write server/main.js
   Restart=always
   Environment=NODE_ENV=production

   [Install]
   WantedBy=multi-user.target
   ```

5. **Caddy Configuration:**
   ```caddy
   # /etc/caddy/Caddyfile
   notes.yourdomain.com {
       reverse_proxy localhost:8000

       # Security headers
       header {
           Strict-Transport-Security "max-age=31536000; includeSubDomains"
           X-Frame-Options "DENY"
           X-Content-Type-Options "nosniff"
           Referrer-Policy "strict-origin-when-cross-origin"
       }
   }
   ```

6. **SSL & Domain:**
   ```bash
   # Update DNS to point to your server
   # Caddy automatically handles SSL certificates

   # Start services
   sudo systemctl enable --now notes-app
   sudo systemctl enable --now caddy
   ```

### Production Considerations

- **Security**: Use strong passwords and session secrets
- **Backups**: Regular database backups beyond Dropbox
- **Monitoring**: Set up logs and health checks
- **Updates**: Regular security patches and updates
- **SSL**: HTTPS-only with secure headers
- **Firewall**: Restrict access to necessary ports only

## Testing

### Manual Testing

1. **Authentication Flow:**
   - Visit `/login` and test Google OAuth
   - Verify user profile and session
   - Test logout functionality

2. **Notes Operations:**
   - Create, edit, and delete notes
   - Test markdown rendering
   - Verify version history

3. **Search Functionality:**
   - Test full-text search
   - Verify search suggestions
   - Test tag filtering

4. **Backup System:**
   - Create manual backup
   - Test restore functionality
   - Verify automatic backups

### Unit Tests

```bash
# Run all Deno tests
deno task test
```

Tests cover:

- **Persistence layer** - IndexedDB operations for drafts and pending operations
- **Sync manager** - Save flow, offline queueing, retry logic, event emission

### API Testing

```bash
# Test authentication (requires session cookie)
curl -X GET http://localhost:8000/api/notes \
  -H "Cookie: session=your_session_cookie"

# Test note creation
curl -X POST http://localhost:8000/api/notes \
  -H "Content-Type: application/json" \
  -H "Cookie: session=your_session_cookie" \
  -d '{"title":"Test Note","content":"Test content","tags":["test"]}'

# Test search
curl -X GET "http://localhost:8000/api/search?q=test" \
  -H "Cookie: session=your_session_cookie"
```

## Troubleshooting

### Common Issues

#### Database Connection Errors

```bash
# Check PostgreSQL status
sudo systemctl status postgresql

# Test connection
psql -U notes_user -d notes_app -c "SELECT version();"

# Check permissions
sudo -u postgres psql -c "\du notes_user"
```

#### OAuth Authentication Errors

- Verify redirect URI matches Google Console exactly
- Check client ID and secret in environment
- Ensure HTTPS in production (required by Google)

#### Dropbox API Errors

- Verify access token permissions
- Check token expiration
- Ensure proper scopes are enabled

#### Performance Issues

```sql
-- Check database performance
EXPLAIN ANALYZE SELECT * FROM notes WHERE search_vector @@ plainto_tsquery('english', 'test');

-- Update statistics
ANALYZE notes;

-- Check index usage
SELECT schemaname, tablename, indexname, idx_scan, idx_tup_read, idx_tup_fetch
FROM pg_stat_user_indexes ORDER BY idx_scan;
```

### Log Analysis

```bash
# Application logs
journalctl -u notes-app -f

# Database logs
sudo tail -f /var/log/postgresql/postgresql-*.log

# Caddy logs
journalctl -u caddy -f
```

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/new-feature`
3. Commit changes: `git commit -am 'Add new feature'`
4. Push to branch: `git push origin feature/new-feature`
5. Submit a pull request

### Development Guidelines

- Follow existing code style and conventions
- Add tests for new functionality
- Update documentation for API changes
- Use semantic commit messages
- Ensure mobile compatibility

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [Deno](https://deno.land/) for the modern JavaScript runtime
- [Oak](https://oakserver.github.io/oak/) for the web framework
- [Lit](https://lit.dev/) for efficient web components
- [PostgreSQL](https://www.postgresql.org/) for powerful database features
- [Google](https://developers.google.com/identity) for OAuth 2.0
- [Dropbox](https://www.dropbox.com/developers) for API integration

## Support

For questions, issues, or contributions:

- ▶ Issues: [GitHub Issues](https://github.com/HarryPehkonen/Notes/issues)
- Documentation: [Wiki](https://github.com/HarryPehkonen/Notes/wiki)
- Discussions: [GitHub Discussions](https://github.com/HarryPehkonen/Notes/discussions)

---

Built with using the minimal web stack philosophy.
