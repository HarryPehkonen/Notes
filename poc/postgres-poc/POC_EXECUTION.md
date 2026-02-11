# Notes Application - Proof of Concept Execution Guide

This guide provides step-by-step instructions for running all three proof-of-concepts that form the foundation of the Notes application using the minimal web stack (Deno + Oak + PostgreSQL + Lit Web Components).

## Overview

We have built three independent proof-of-concepts:

1. **Dropbox POC** - File backup and restore functionality
2. **Google OAuth POC** - Authentication and session management
3. **PostgreSQL POC** - Database operations and full-text search

Each POC can be run independently to verify functionality before integration.

## Prerequisites

### System Requirements

- **Deno** 1.40+ installed
- **PostgreSQL** 12+ installed and running
- **Internet connection** for API calls
- **Modern web browser** for OAuth testing

### Install Deno (if not already installed)

```bash
# Linux/macOS
curl -fsSL https://deno.land/install.sh | sh

# Add to PATH (add to ~/.bashrc or ~/.zshrc)
export PATH="$HOME/.deno/bin:$PATH"

# Verify installation
deno --version
```

### Install PostgreSQL (if not already installed)

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install postgresql postgresql-contrib

# macOS (Homebrew)
brew install postgresql
brew services start postgresql

# Arch Linux
sudo pacman -S postgresql
sudo systemctl enable postgresql
sudo systemctl start postgresql
```

## Project Structure

```
Notes/
├── dropbox-poc/
│   ├── dropbox-client.js
│   ├── test.js
│   ├── .env.example
│   └── README.md
├── google-auth-poc/
│   ├── server.js
│   ├── auth-handler.js
│   ├── public/
│   │   ├── index.html
│   │   └── dashboard.html
│   ├── .env.example
│   └── README.md
└── postgres-poc/
    ├── db-client.js
    ├── schema.sql
    ├── test.js
    ├── seed.js
    ├── .env.example
    └── README.md
```

---

## 1. Dropbox POC

**Purpose:** Test file upload, download, and listing with Dropbox API

### Setup

1. **Get Dropbox Access Token:**
   - Go to https://www.dropbox.com/developers/apps
   - Click "Create app"
   - Choose "Scoped access" → "Full Dropbox" → Enter app name
   - Go to "Permissions" tab and enable:
     - `files.metadata.write`
     - `files.content.write`
     - `files.content.read`
   - Generate access token in "Settings" tab

2. **Configure Environment:**
   ```bash
   cd dropbox-poc
   cp .env.example .env
   # Edit .env and add your token:
   # DROPBOX_ACCESS_TOKEN=your_actual_token_here
   ```

### Execution

```bash
cd dropbox-poc

# Run the test suite
deno run --allow-net --allow-read --allow-env test.js
```

### Expected Output

```
→ Dropbox Integration Tests

  Test 1: Upload File...
✓ Upload File - PASSED

  Test 2: List Files...
✓ List Files - PASSED

  Test 3: Download File...
✓ Download File - PASSED

  Test 4: Backup Structure...
✓ Backup Structure - PASSED

  Test Summary
✓ Passed: 4/4
  All tests passed! Dropbox integration is working perfectly.
```

### Features Demonstrated

- ✓ File upload to Dropbox
- ✓ File listing and metadata
- ✓ File download and content verification
- ✓ Structured backup organization
- ✓ Error handling and retry logic

---

## 2. Google OAuth POC

**Purpose:** Test OAuth 2.0 authentication flow with Google

### Setup

1. **Get Google OAuth Credentials:**
   - Go to https://console.cloud.google.com/apis/credentials
   - Create a new project or select existing
   - Click "Create Credentials" → "OAuth 2.0 Client IDs"
   - Application type: "Web application"
   - Add authorized redirect URI: `http://localhost:8000/auth/callback`
   - Copy Client ID and Client Secret

2. **Configure Environment:**
   ```bash
   cd google-auth-poc
   cp .env.example .env
   # Edit .env with your credentials:
   # GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com
   # GOOGLE_CLIENT_SECRET=your_client_secret
   # GOOGLE_REDIRECT_URI=http://localhost:8000/auth/callback
   # PORT=8000
   ```

### Execution

```bash
cd google-auth-poc

# Start the OAuth server
deno run --allow-net --allow-read --allow-env server.js
```

### Testing OAuth Flow

1. **Open browser:** http://localhost:8000
2. **Click "Login with Google"**
3. **Complete OAuth flow** in Google's consent screen
4. **Verify redirect** to dashboard with user information
5. **Test logout** functionality

### Expected Behavior

- ✓ Redirect to Google OAuth consent screen
- ✓ Successful authentication and user profile retrieval
- ✓ Session management with secure cookies
- ✓ Protected dashboard route
- ✓ Clean logout process

### Features Demonstrated

- ✓ OAuth 2.0 authorization code flow
- ✓ Token exchange and validation
- ✓ User profile retrieval
- ✓ Session management
- ✓ Route protection
- ✓ No external libraries (pure OAuth implementation)

---

## 3. PostgreSQL POC

**Purpose:** Test database operations, search, and schema management

### Setup

1. **Create Database and User:**
   ```bash
   # Switch to postgres user
   sudo -u postgres psql

   # Create database and user
   CREATE USER notes_user WITH PASSWORD 'your_secure_password';
   CREATE DATABASE notes_app OWNER notes_user;

   # Grant permissions
   GRANT ALL PRIVILEGES ON DATABASE notes_app TO notes_user;

   # Exit psql
   \q
   ```

2. **Configure Environment:**
   ```bash
   cd postgres-poc
   cp .env.example .env
   # Edit .env with your database credentials:
   # DB_HOST=localhost
   # DB_PORT=5432
   # DB_NAME=notes_app
   # DB_USER=notes_user
   # DB_PASSWORD=your_secure_password
   ```

### Execution

```bash
cd postgres-poc

# Run the comprehensive test suite
deno run --allow-net --allow-read --allow-env test.js
```

### Expected Output

```
→ PostgreSQL Integration Tests

  Test 1: Initialize Database Schema...
✓ Initialize Database Schema - PASSED

  Test 2: Create Users...
✓ Create Users - PASSED

[... 15 tests total ...]

  Test Summary
✓ Passed: 15/15
  All tests passed! PostgreSQL integration is working perfectly.

  What this proves:
• Database schema creation and management
• User management and authentication support
• Full CRUD operations for notes
• Tag system with many-to-many relationships
• Full-text search with ranking
• Automatic version history
• Connection pooling and transactions
• High performance with proper indexing
```

### Features Demonstrated

- ✓ Schema initialization with SQL parsing
- ✓ User CRUD operations
- ✓ Note CRUD with markdown support
- ✓ Tag system with many-to-many relationships
- ✓ Full-text search with PostgreSQL native search
- ✓ Version history with automatic triggers
- ✓ Connection pooling (3 concurrent connections)
- ✓ Transaction support with rollback
- ✓ Performance testing (10 notes in ~80ms)
- ✓ Complex search queries with ranking

---

## Integration Architecture

### How the POCs Work Together

```
[Browser] ←→ [OAuth Server] ←→ [Database]
    ↓              ↓              ↓
[Session]     [User Profile]  [Notes Data]
    ↓              ↓              ↓
[Dashboard] ←→ [Notes API] ←→ [Full-text Search]
    ↓              ↓              ↓
[Backup] ←→ [Dropbox API] ←→ [File Storage]
```

### Data Flow

1. **Authentication:** User authenticates via Google OAuth
2. **Session:** Server creates secure session with user profile
3. **Database:** User notes stored in PostgreSQL with search indexing
4. **Backup:** Notes periodically backed up to Dropbox
5. **Restore:** Notes can be restored from Dropbox backups

### Integration Points

- **OAuth → Database:** User profile stored in `users` table
- **Database → Dropbox:** Notes exported as JSON for backup
- **Dropbox → Database:** Backup files restored to database
- **All Components:** Unified user ID for data association

---

## ▶ Troubleshooting

### Common Issues

#### Dropbox POC

**Error: "Invalid access token"**

- Verify token in .env file
- Check token permissions include required scopes
- Regenerate token if expired

**Error: "Network request failed"**

- Check internet connection
- Verify Dropbox API endpoint accessibility

#### Google OAuth POC

**Error: "Invalid client credentials"**

- Verify CLIENT_ID and CLIENT_SECRET in .env
- Check redirect URI matches Google Cloud Console exactly
- Ensure project has OAuth consent screen configured

**Error: "Redirect URI mismatch"**

- Verify GOOGLE_REDIRECT_URI in .env matches console
- Check server is running on correct port (8000)

#### PostgreSQL POC

**Error: "Connection refused"**

- Ensure PostgreSQL is running: `sudo systemctl status postgresql`
- Check connection parameters in .env
- Verify user permissions: `psql -U notes_user -d notes_app -c "SELECT version();"`

**Error: "Schema initialization failed"**

- Check PostgreSQL extensions are available
- Verify user has CREATE permissions
- Review schema.sql for syntax errors

**Error: "Function does not exist"**

- Ensure schema initialization completed successfully
- Check PostgreSQL version supports required features
- Verify plpgsql language is available

### Performance Issues

**Slow search queries:**

- Verify GIN index on search_vector: `\d+ notes`
- Check ANALYZE has been run: `ANALYZE notes;`
- Monitor query plans: `EXPLAIN ANALYZE SELECT ...`

### Environment Issues

**Deno permission errors:**

- Ensure all required flags: `--allow-net --allow-read --allow-env`
- Add `--allow-write` if creating files
- Use specific permissions for production

## Next Steps

Once all POCs are working:

1. **Integration Phase:**
   - Combine OAuth, Database, and Dropbox into unified API
   - Create REST endpoints for notes operations
   - Implement automatic backup scheduling

2. **Frontend Development:**
   - Build Lit Web Components for notes interface
   - Implement markdown editor and preview
   - Add search and tag filtering UI

3. **Deployment:**
   - Configure systemd service for auto-start
   - Set up Caddy reverse proxy with HTTPS
   - Configure production database settings
   - Set up monitoring and logging

## ★ Success Criteria

All POCs should pass their respective test suites:

- **Dropbox:** ✓ 4/4 tests passed
- **Google OAuth:** ✓ Manual flow verification
- **PostgreSQL:** ✓ 15/15 tests passed

When all three are working, you have a solid foundation for the complete Notes application!
