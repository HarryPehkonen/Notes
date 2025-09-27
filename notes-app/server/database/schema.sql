-- PostgreSQL Schema for Notes Application
-- Drop existing tables if they exist (for testing)
DROP TABLE IF EXISTS note_versions CASCADE;
DROP TABLE IF EXISTS note_tags CASCADE;
DROP TABLE IF EXISTS tags CASCADE;
DROP TABLE IF EXISTS notes CASCADE;
DROP TABLE IF EXISTS auth_providers CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For fuzzy text search

-- Users table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255),
    picture TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP,
    preferences JSONB DEFAULT '{}'::jsonb
);

-- Auth providers (Google, GitHub, Dropbox)
CREATE TABLE auth_providers (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL, -- 'google', 'github', 'dropbox'
    provider_id VARCHAR(255) NOT NULL,
    access_token TEXT,
    refresh_token TEXT,
    token_expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(provider, provider_id)
);

-- Notes table
CREATE TABLE notes (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    content TEXT,
    content_plain TEXT, -- Plain text for search
    is_pinned BOOLEAN DEFAULT FALSE,
    is_archived BOOLEAN DEFAULT FALSE,
    metadata JSONB DEFAULT '{}'::jsonb, -- Flexible metadata storage
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Full-text search
    search_vector tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('english', COALESCE(title, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(content_plain, '')), 'B')
    ) STORED
);

-- Tags table
CREATE TABLE tags (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    color VARCHAR(7) DEFAULT '#667eea', -- Hex color
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, name)
);

-- Many-to-many relationship between notes and tags
CREATE TABLE note_tags (
    note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (note_id, tag_id)
);

-- Version history for notes
CREATE TABLE note_versions (
    id SERIAL PRIMARY KEY,
    note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    content TEXT,
    version_number INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER REFERENCES users(id),
    change_summary TEXT,
    UNIQUE(note_id, version_number)
);

-- Indexes for performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_auth_providers_user ON auth_providers(user_id);
CREATE INDEX idx_notes_user ON notes(user_id);
CREATE INDEX idx_notes_created ON notes(created_at DESC);
CREATE INDEX idx_notes_updated ON notes(updated_at DESC);
CREATE INDEX idx_notes_pinned ON notes(is_pinned) WHERE is_pinned = true;
CREATE INDEX idx_notes_search ON notes USING GIN(search_vector);
CREATE INDEX idx_tags_user ON tags(user_id);
CREATE INDEX idx_note_tags_note ON note_tags(note_id);
CREATE INDEX idx_note_tags_tag ON note_tags(tag_id);
CREATE INDEX idx_note_versions_note ON note_versions(note_id);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_notes_updated_at BEFORE UPDATE ON notes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger to create version on note update
CREATE OR REPLACE FUNCTION create_note_version()
RETURNS TRIGGER AS $$
DECLARE
    v_number INTEGER;
BEGIN
    -- Only create version if content actually changed
    IF OLD.content IS DISTINCT FROM NEW.content OR OLD.title IS DISTINCT FROM NEW.title THEN
        -- Get next version number
        SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_number
        FROM note_versions WHERE note_id = NEW.id;

        -- Insert version record
        INSERT INTO note_versions (note_id, title, content, version_number, created_by)
        VALUES (OLD.id, OLD.title, OLD.content, v_number, NEW.user_id);
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER create_note_version_trigger BEFORE UPDATE ON notes
    FOR EACH ROW EXECUTE FUNCTION create_note_version();

-- Helper functions

-- Search notes with full-text search
CREATE OR REPLACE FUNCTION search_notes(
    p_user_id INTEGER,
    p_query TEXT,
    p_limit INTEGER DEFAULT 20,
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
    id INTEGER,
    title VARCHAR,
    content TEXT,
    rank REAL,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    tags TEXT[]
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        n.id,
        n.title,
        n.content,
        ts_rank(n.search_vector, plainto_tsquery('english', p_query)) as rank,
        n.created_at,
        n.updated_at,
        ARRAY(
            SELECT t.name
            FROM tags t
            JOIN note_tags nt ON t.id = nt.tag_id
            WHERE nt.note_id = n.id
        ) as tags
    FROM notes n
    WHERE n.user_id = p_user_id
        AND n.search_vector @@ plainto_tsquery('english', p_query)
        AND NOT n.is_archived
    ORDER BY rank DESC, n.updated_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;

-- Get notes with tags
CREATE OR REPLACE FUNCTION get_notes_with_tags(
    p_user_id INTEGER,
    p_tag_names TEXT[] DEFAULT NULL,
    p_limit INTEGER DEFAULT 20,
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
    id INTEGER,
    title VARCHAR,
    content TEXT,
    is_pinned BOOLEAN,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    tags TEXT[]
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        n.id,
        n.title,
        n.content,
        n.is_pinned,
        n.created_at,
        n.updated_at,
        ARRAY(
            SELECT t.name
            FROM tags t
            JOIN note_tags nt ON t.id = nt.tag_id
            WHERE nt.note_id = n.id
        ) as tags
    FROM notes n
    WHERE n.user_id = p_user_id
        AND NOT n.is_archived
        AND (
            p_tag_names IS NULL
            OR n.id IN (
                SELECT DISTINCT nt.note_id
                FROM note_tags nt
                JOIN tags t ON t.id = nt.tag_id
                WHERE t.name = ANY(p_tag_names)
                    AND t.user_id = p_user_id
            )
        )
    ORDER BY n.is_pinned DESC, n.updated_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;

-- Sample data insertion (commented out, will be used in seed.js)
/*
INSERT INTO users (email, name) VALUES
    ('test@example.com', 'Test User'),
    ('demo@example.com', 'Demo User');

INSERT INTO tags (user_id, name, color) VALUES
    (1, 'personal', '#4CAF50'),
    (1, 'work', '#2196F3'),
    (1, 'ideas', '#FF9800');

INSERT INTO notes (user_id, title, content, content_plain) VALUES
    (1, 'Welcome Note', '# Welcome to Notes App\n\nThis is your first note!', 'Welcome to Notes App This is your first note!'),
    (1, 'Todo List', '## Tasks\n- [ ] Setup database\n- [x] Create schema\n- [ ] Build UI', 'Tasks Setup database Create schema Build UI');
*/

-- Grant permissions (adjust as needed)
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO notes_user;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO notes_user;
-- GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO notes_user;
