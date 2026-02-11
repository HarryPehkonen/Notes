# PostgreSQL Integration Proof of Concept

A complete database layer implementation for the Notes application using PostgreSQL with Deno.

## Features Demonstrated

- ✓ **Complete Schema** - Users, notes, tags, versions, auth providers
- ✓ **Full-Text Search** - PostgreSQL native search with ranking
- ✓ **Version History** - Automatic note versioning on updates
- ✓ **Connection Pooling** - Efficient database connections
- ✓ **Transactions** - ACID compliance with rollback support
- ✓ **Tag System** - Many-to-many relationships
- ✓ **No ORM** - Clean SQL with type safety via JSDoc
- ✓ **Performance** - Proper indexing and query optimization

## Prerequisites

- PostgreSQL 12+ installed and running
- Deno installed
- Database user with appropriate permissions

## Setup

### 1. Database Setup

```bash
# Create database and user
sudo -u postgres createuser notes_user
sudo -u postgres createdb notes_app -O notes_user

# Set password
sudo -u postgres psql
ALTER USER notes_user WITH PASSWORD 'your_secure_password';
\q
```

### 2. Environment Configuration

```bash
# Copy environment template
cp .env.example .env

# Edit with your database credentials
nano .env
```

Required environment variables:

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=notes_app
DB_USER=notes_user
DB_PASSWORD=your_secure_password
```

### 3. Initialize Schema

```bash
# Create all tables, indexes, and functions
deno run --allow-net --allow-read --allow-env test.js
```

### 4. Seed with Sample Data (Optional)

```bash
# Populate with realistic sample data
deno run --allow-net --allow-read --allow-env seed.js
```

## Running Tests

```bash
# Run comprehensive test suite
deno run --allow-net --allow-read --allow-env test.js
```

Expected output:

```
→ PostgreSQL Integration Tests

  Test 1: Initialize Database Schema...
✓ Initialize Database Schema - PASSED

  Test 2: Create Users...
✓ Create Users - PASSED

[... 15 tests total ...]

  Test Summary
✓ Passed: 15/15
  All tests passed!
```

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
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    preferences JSONB DEFAULT '{}'::jsonb
);
```

#### Notes

```sql
CREATE TABLE notes (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    title VARCHAR(500) NOT NULL,
    content TEXT,
    content_plain TEXT, -- For full-text search
    is_pinned BOOLEAN DEFAULT FALSE,
    is_archived BOOLEAN DEFAULT FALSE,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    search_vector tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('english', COALESCE(title, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(content_plain, '')), 'B')
    ) STORED
);
```

#### Tags & Relationships

```sql
CREATE TABLE tags (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    name VARCHAR(100) NOT NULL,
    color VARCHAR(7) DEFAULT '#667eea',
    UNIQUE(user_id, name)
);

CREATE TABLE note_tags (
    note_id INTEGER NOT NULL REFERENCES notes(id),
    tag_id INTEGER NOT NULL REFERENCES tags(id),
    PRIMARY KEY (note_id, tag_id)
);
```

#### Version History

```sql
CREATE TABLE note_versions (
    id SERIAL PRIMARY KEY,
    note_id INTEGER NOT NULL REFERENCES notes(id),
    title VARCHAR(500) NOT NULL,
    content TEXT,
    version_number INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(note_id, version_number)
);
```

### Key Features

#### Full-Text Search

```sql
-- Automatic search vector generation
search_vector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english', COALESCE(title, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(content_plain, '')), 'B')
) STORED

-- GIN index for fast search
CREATE INDEX idx_notes_search ON notes USING GIN(search_vector);

-- Search function with ranking
CREATE FUNCTION search_notes(user_id, query, limit, offset)
RETURNS TABLE (id, title, content, rank, created_at, updated_at, tags)
```

#### Automatic Version History

```sql
-- Trigger creates version on note update
CREATE TRIGGER create_note_version_trigger
BEFORE UPDATE ON notes
FOR EACH ROW EXECUTE FUNCTION create_note_version();
```

## API Usage Examples

### Database Client

```javascript
import { DatabaseClient } from "./db-client.js";

const db = new DatabaseClient({
  user: "notes_user",
  database: "notes_app",
  password: "your_password",
});
```

### User Operations

```javascript
// Create user (from OAuth)
const user = await db.createUser({
  email: "user@example.com",
  name: "John Doe",
  picture: "https://example.com/avatar.jpg",
});

// Find user by email
const user = await db.findUserByEmail("user@example.com");
```

### Note Operations

```javascript
// Create note with tags
const note = await db.createNote({
  userId: user.id,
  title: "My First Note",
  content: "# Hello World\n\nThis is **markdown** content!",
  tags: ["personal", "getting-started"],
});

// Get user's notes with filters
const notes = await db.getNotes(user.id, {
  tags: ["personal"],
  search: "hello world",
  limit: 10,
});

// Update note (automatically creates version)
const updated = await db.updateNote(note.id, {
  content: "# Updated Content\n\nNew information added.",
  tags: ["personal", "updated"],
});
```

### Search Operations

```javascript
// Full-text search with ranking
const results = await db.searchNotes(user.id, "project management");

// Filter by tags
const taggedNotes = await db.getNotes(user.id, {
  tags: ["work", "urgent"],
});

// Get pinned notes only
const pinned = await db.getNotes(user.id, { pinned: true });
```

### Tag Management

```javascript
// Create custom tag
const tag = await db.createTag(user.id, "important", "#ff0000");

// Get all user tags with usage counts
const tags = await db.getUserTags(user.id);
```

### Version History

```javascript
// Get note history
const versions = await db.getNoteVersions(note.id);

// Restore previous version
const restored = await db.restoreNoteVersion(note.id, versions[1].id);
```

### Transactions

```javascript
// Complex operations with rollback support
const result = await db.transaction(async (tx) => {
  const note = await tx.query(
    "INSERT INTO notes (user_id, title, content) VALUES ($1, $2, $3) RETURNING *",
    [userId, title, content],
  );

  // Add tags
  for (const tag of tags) {
    await tx.query(
      "INSERT INTO note_tags (note_id, tag_id) VALUES ($1, $2)",
      [note.rows[0].id, tag.id],
    );
  }

  return note.rows[0];
});
```

## Performance Features

### Indexing Strategy

```sql
-- User-specific queries
CREATE INDEX idx_notes_user ON notes(user_id);
CREATE INDEX idx_tags_user ON tags(user_id);

-- Time-based sorting
CREATE INDEX idx_notes_updated ON notes(updated_at DESC);
CREATE INDEX idx_notes_created ON notes(created_at DESC);

-- Search optimization
CREATE INDEX idx_notes_search ON notes USING GIN(search_vector);

-- Pinned notes filter
CREATE INDEX idx_notes_pinned ON notes(is_pinned) WHERE is_pinned = true;
```

### Connection Pooling

```javascript
// Pool of 3 concurrent connections
this.pool = new Pool(this.config, 3);

// Automatic connection management
const client = await this.pool.connect();
try {
  const result = await client.queryObject(query, params);
  return result;
} finally {
  client.release(); // Return to pool
}
```

## Integration with Notes App

This database layer provides everything needed for the Notes application:

### Authentication Integration

```javascript
// After successful OAuth
const user = await db.findUserByEmail(oauthUser.email) ||
  await db.createUser(oauthUser);

// Store provider information
await db.query(
  "INSERT INTO auth_providers (user_id, provider, provider_id, access_token) VALUES ($1, $2, $3, $4)",
  [user.id, "google", oauthUser.id, tokens.access_token],
);
```

### API Endpoints

```javascript
// GET /api/notes
app.get("/api/notes", async (ctx) => {
  const notes = await db.getNotes(ctx.user.id, ctx.query);
  ctx.response.body = notes;
});

// POST /api/notes
app.post("/api/notes", async (ctx) => {
  const note = await db.createNote({
    userId: ctx.user.id,
    ...ctx.request.body,
  });
  ctx.response.body = note;
});

// GET /api/search
app.get("/api/search", async (ctx) => {
  const results = await db.searchNotes(ctx.user.id, ctx.query.q);
  ctx.response.body = results;
});
```

### Backup Integration

```javascript
// Export all user data for Dropbox backup
const exportData = {
  user: await db.findUserByEmail(email),
  notes: await db.getNotes(userId),
  tags: await db.getUserTags(userId),
};

await dropboxClient.upload(
  `/backup/user-${userId}/backup-${Date.now()}.json`,
  JSON.stringify(exportData),
);
```

## Migration Strategy

For existing applications:

1. **Schema Migration**: Run `schema.sql` to create tables
2. **Data Migration**: Convert existing data to new schema
3. **API Update**: Replace ORM calls with direct SQL
4. **Testing**: Run test suite to verify functionality

## Monitoring & Maintenance

### Query Performance

```sql
-- Enable slow query logging
SET log_min_duration_statement = 1000; -- Log queries > 1 second

-- Analyze query plans
EXPLAIN ANALYZE SELECT * FROM notes WHERE user_id = 1;
```

### Database Maintenance

```sql
-- Regular maintenance
VACUUM ANALYZE notes;
REINDEX INDEX idx_notes_search;

-- Monitor table sizes
SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables WHERE schemaname = 'public';
```

## Security Considerations

- **Row-level security**: All queries filter by `user_id`
- **SQL injection prevention**: Parameterized queries only
- **Connection pooling**: Prevents connection exhaustion
- **Password hashing**: Use bcrypt for local passwords (if needed)
- **Audit logging**: Track sensitive operations

## Next Steps

1. ✓ **Database layer proven**
2. **Integrate with OAuth system**
3. **Connect to Dropbox backup**
4. **Build REST API with Oak**
5. **Create frontend with Lit**
6. **Deploy with systemd + Caddy**

## Troubleshooting

### Connection Issues

```bash
# Test connection
psql -U notes_user -d notes_app -h localhost -c "SELECT version();"
```

### Permission Errors

```sql
-- Grant all permissions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO notes_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO notes_user;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO notes_user;
```

### Performance Issues

```sql
-- Check for missing indexes
SELECT schemaname, tablename, attname, n_distinct, correlation
FROM pg_stats WHERE schemaname = 'public';

-- Monitor active queries
SELECT pid, now() - pg_stat_activity.query_start AS duration, query
FROM pg_stat_activity WHERE state = 'active';
```

## Resources

- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Deno Postgres Driver](https://deno.land/x/postgres)
- [Full-Text Search Guide](https://www.postgresql.org/docs/current/textsearch.html)
- [Performance Tuning](https://wiki.postgresql.org/wiki/Performance_Optimization)
