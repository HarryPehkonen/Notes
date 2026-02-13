/**
 * PostgreSQL Database Client for Notes App
 * Minimal wrapper around Deno's postgres driver
 */

import { Pool } from "https://deno.land/x/postgres@v0.17.0/mod.ts";

/**
 * @typedef {Object} User
 * @property {number} id
 * @property {string} email
 * @property {string} name
 * @property {string} picture
 * @property {Date} created_at
 * @property {Date} updated_at
 * @property {Object} preferences
 */

/**
 * @typedef {Object} Note
 * @property {number} id
 * @property {number} user_id
 * @property {string} title
 * @property {string} content
 * @property {boolean} is_pinned
 * @property {boolean} is_archived
 * @property {Date} created_at
 * @property {Date} updated_at
 * @property {string[]} tags
 */

/**
 * @typedef {Object} Tag
 * @property {number} id
 * @property {number} user_id
 * @property {string} name
 * @property {string} color
 */

/**
 * Strip markdown formatting for plain text search
 * @param {string} markdown - Markdown text
 * @returns {string} Plain text
 */
export function stripMarkdown(markdown) {
  if (!markdown) return "";
  return markdown
    .replace(/#{1,6}\s/g, "") // Headers
    .replace(/[*_~`]/g, "") // Formatting
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // Links
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1") // Images
    .replace(/```[\s\S]*?```/g, "") // Code blocks
    .replace(/`[^`]+`/g, "") // Inline code
    .replace(/^\s*[-*+]\s/gm, "") // Lists
    .replace(/^\s*\d+\.\s/gm, "") // Numbered lists
    .replace(/\n{2,}/g, "\n") // Multiple newlines
    .trim();
}

/**
 * Parse PostgreSQL statements with dollar-quote handling and proper execution ordering
 * @param {string} sql - Raw SQL content
 * @returns {string[]} Array of individual statements in proper execution order
 */
export function parsePostgreSQLStatements(sql) {
  // Remove single-line comments (but preserve content)
  const cleaned = sql.replace(/--.*$/gm, "");

  // Split by semicolons, but handle dollar-quoted strings properly
  const statements = [];
  let current = "";
  let inDollarQuote = false;
  let dollarTag = "";

  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i];
    const remaining = cleaned.substring(i);

    // Check for dollar quote start/end
    if (char === "$" && !inDollarQuote) {
      const match = remaining.match(/^\$([^$]*)\$/);
      if (match) {
        inDollarQuote = true;
        dollarTag = match[1];
        current += match[0];
        i += match[0].length - 1;
        continue;
      }
    } else if (char === "$" && inDollarQuote) {
      const expectedEnd = `$${dollarTag}$`;
      if (remaining.startsWith(expectedEnd)) {
        inDollarQuote = false;
        dollarTag = "";
        current += expectedEnd;
        i += expectedEnd.length - 1;
        continue;
      }
    }

    // If we hit a semicolon and we're not in a dollar quote
    if (char === ";" && !inDollarQuote) {
      current += char;
      const trimmed = current.trim();
      if (trimmed && trimmed.match(/^(DROP|CREATE|ALTER|GRANT|DELETE|UPDATE)/i)) {
        statements.push(trimmed);
      }
      current = "";
    } else {
      current += char;
    }
  }

  // Add final statement if exists
  const trimmed = current.trim();
  if (trimmed && trimmed.match(/^(DROP|CREATE|ALTER|GRANT|DELETE|UPDATE)/i)) {
    statements.push(trimmed);
  }

  // Clean up statements - remove extra whitespace and comments
  const cleanedStatements = statements
    .map((stmt) => stmt.trim())
    .filter((stmt) => stmt.length > 0 && !stmt.startsWith("/*"))
    .filter((stmt) => !stmt.match(/^\s*\/\*/)); // Remove comment blocks

  // Categorize statements by type
  const drops = [];
  const extensions = [];
  const tables = [];
  const indexes = [];
  const triggers = [];
  const functions = [];
  const other = [];

  for (const stmt of cleanedStatements) {
    const upperStmt = stmt.toUpperCase().replace(/\s+/g, " ").trim();

    if (upperStmt.startsWith("DROP")) {
      drops.push(stmt);
    } else if (upperStmt.startsWith("CREATE EXTENSION")) {
      extensions.push(stmt);
    } else if (upperStmt.startsWith("CREATE TABLE")) {
      tables.push(stmt);
    } else if (
      upperStmt.startsWith("CREATE INDEX") || upperStmt.startsWith("CREATE UNIQUE INDEX")
    ) {
      indexes.push(stmt);
    } else if (upperStmt.startsWith("CREATE TRIGGER")) {
      triggers.push(stmt);
    } else if (
      upperStmt.includes("CREATE OR REPLACE FUNCTION") || upperStmt.includes("CREATE FUNCTION")
    ) {
      functions.push(stmt);
    } else {
      other.push(stmt);
    }
  }

  // Return in proper execution order
  return [
    ...drops, // Drop existing objects first
    ...extensions, // Create extensions
    ...tables, // Create tables
    ...functions, // Create functions
    ...indexes, // Create indexes (after tables exist)
    ...triggers, // Create triggers (after functions exist)
    ...other, // Everything else
  ];
}

/**
 * Database client with connection pooling
 */
export class DatabaseClient {
  /**
   * @param {Object} config - Database configuration
   */
  constructor(config) {
    this.config = {
      user: config.user || Deno.env.get("DB_USER"),
      database: config.database || Deno.env.get("DB_NAME"),
      hostname: config.hostname || Deno.env.get("DB_HOST") || "localhost",
      port: config.port || parseInt(Deno.env.get("DB_PORT") || "5432"),
      password: config.password || Deno.env.get("DB_PASSWORD"),
    };

    // Use connection pool for better performance
    this.pool = new Pool(this.config, 3); // 3 concurrent connections
  }

  /**
   * Execute a query
   * @param {string} query - SQL query
   * @param {Array} params - Query parameters
   * @returns {Promise<Object>} Query result
   */
  async query(query, params = []) {
    const client = await this.pool.connect();
    try {
      const result = await client.queryObject(query, params);
      return result;
    } finally {
      client.release();
    }
  }

  /**
   * Execute multiple queries in a transaction
   * @param {Function} callback - Async function that receives a transaction client
   * @returns {Promise<any>} Transaction result
   */
  async transaction(callback) {
    const client = await this.pool.connect();
    try {
      await client.queryObject("BEGIN");
      const result = await callback({
        query: (sql, params) => client.queryObject(sql, params),
      });
      await client.queryObject("COMMIT");
      return result;
    } catch (error) {
      await client.queryObject("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  // User Operations

  /**
   * Create a new user
   * @param {Object} userData - User data
   * @returns {Promise<User>} Created user
   */
  async createUser(userData) {
    const { email, name, picture } = userData;
    const result = await this.query(
      `INSERT INTO users (email, name, picture)
             VALUES ($1, $2, $3)
             RETURNING *`,
      [email, name, picture],
    );
    return result.rows[0];
  }

  /**
   * Find user by email
   * @param {string} email
   * @returns {Promise<User|null>}
   */
  async findUserByEmail(email) {
    const result = await this.query(
      `SELECT * FROM users WHERE email = $1`,
      [email],
    );
    return result.rows[0] || null;
  }

  /**
   * Update user's last login
   * @param {number} userId
   * @returns {Promise<void>}
   */
  async updateLastLogin(userId) {
    await this.query(
      `UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1`,
      [userId],
    );
  }

  // Note Operations

  /**
   * Create a new note
   * @param {Object} noteData
   * @returns {Promise<Note>}
   */
  async createNote({ userId, title, content, tags = [] }) {
    return await this.transaction(async (tx) => {
      // Create note
      const noteResult = await tx.query(
        `INSERT INTO notes (user_id, title, content, content_plain)
                 VALUES ($1, $2, $3, $4)
                 RETURNING *`,
        [userId, title, content, this.stripMarkdown(content)],
      );
      const note = noteResult.rows[0];

      // Add tags if provided (expecting tag IDs)
      if (tags.length > 0) {
        for (const tagId of tags) {
          await tx.query(
            `INSERT INTO note_tags (note_id, tag_id)
                         VALUES ($1, $2)
                         ON CONFLICT DO NOTHING`,
            [note.id, tagId],
          );
        }
      }

      // Get the full tag objects for the note
      const tagResult = await tx.query(
        `SELECT t.id, t.name, t.color
                 FROM tags t
                 JOIN note_tags nt ON t.id = nt.tag_id
                 WHERE nt.note_id = $1`,
        [note.id],
      );
      const fullTags = tagResult.rows;

      return { ...note, tags: fullTags };
    });
  }

  /**
   * Update a note
   * @param {number} noteId
   * @param {Object} updates
   * @returns {Promise<Note>}
   */
  async updateNote(noteId, updates) {
    const { title, content, tags, is_pinned } = updates;

    return await this.transaction(async (tx) => {
      // Build dynamic update query
      const updateFields = [];
      const params = [];
      let paramIndex = 1;

      if (title !== undefined) {
        updateFields.push(`title = $${paramIndex++}`);
        params.push(title);
      }
      if (content !== undefined) {
        updateFields.push(`content = $${paramIndex++}`);
        params.push(content);
        updateFields.push(`content_plain = $${paramIndex++}`);
        params.push(this.stripMarkdown(content));
      }
      if (is_pinned !== undefined) {
        updateFields.push(`is_pinned = $${paramIndex++}`);
        params.push(is_pinned);
      }

      let note;
      if (updateFields.length > 0) {
        params.push(noteId);
        const result = await tx.query(
          `UPDATE notes SET ${updateFields.join(", ")} WHERE id = $${paramIndex} RETURNING *`,
          params,
        );
        note = result.rows[0];
      } else {
        // No fields to update, just get the note
        const result = await tx.query(`SELECT * FROM notes WHERE id = $1`, [noteId]);
        note = result.rows[0];
      }

      // Update tags if provided
      if (tags !== undefined) {
        // Remove existing tags
        await tx.query(`DELETE FROM note_tags WHERE note_id = $1`, [noteId]);

        // Add new tags by ID
        if (tags.length > 0) {
          for (const tagId of tags) {
            await tx.query(
              `INSERT INTO note_tags (note_id, tag_id)
                             VALUES ($1, $2)
                             ON CONFLICT DO NOTHING`,
              [noteId, tagId],
            );
          }
        }
      }

      // Get the full tag objects for the updated note
      const tagResult = await tx.query(
        `SELECT t.id, t.name, t.color
                 FROM tags t
                 JOIN note_tags nt ON t.id = nt.tag_id
                 WHERE nt.note_id = $1`,
        [noteId],
      );
      const fullTags = tagResult.rows;

      return { ...note, tags: fullTags };
    });
  }

  /**
   * Get notes for a user
   * @param {number} userId
   * @param {Object} options
   * @returns {Promise<Note[]>}
   */
  async getNotes(userId, options = {}) {
    const { limit = 20, offset = 0, tags, search, pinned } = options;

    let query = `
            SELECT n.*,
                   ARRAY(
                       SELECT json_build_object('id', t.id, 'name', t.name, 'color', t.color)
                       FROM tags t
                       JOIN note_tags nt ON t.id = nt.tag_id
                       WHERE nt.note_id = n.id
                   ) as tags
            FROM notes n
            WHERE n.user_id = $1 AND NOT n.is_archived
        `;
    const params = [userId];
    let paramIndex = 2;

    if (search) {
      query += ` AND n.search_vector @@ plainto_tsquery('english', $${paramIndex})`;
      params.push(search);
      paramIndex++;
    }

    if (pinned !== undefined) {
      query += ` AND n.is_pinned = $${paramIndex}`;
      params.push(pinned);
      paramIndex++;
    }

    if (tags && tags.length > 0) {
      query += ` AND n.id IN (
                SELECT nt.note_id
                FROM note_tags nt
                WHERE nt.tag_id = ANY($${paramIndex}::int[])
                GROUP BY nt.note_id
                HAVING COUNT(DISTINCT nt.tag_id) = $${paramIndex + 1}
            )`;
      params.push(tags);
      params.push(tags.length);
      paramIndex += 2;
    }

    query += ` ORDER BY n.is_pinned DESC, n.updated_at DESC`;
    query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await this.query(query, params);
    return result.rows;
  }

  /**
   * Delete a note
   * @param {number} noteId
   * @param {number} userId
   * @returns {Promise<boolean>}
   */
  async deleteNote(noteId, userId) {
    const result = await this.query(
      `DELETE FROM notes WHERE id = $1 AND user_id = $2`,
      [noteId, userId],
    );
    return result.rowCount > 0;
  }

  /**
   * Search notes with full-text search
   * @param {number} userId
   * @param {string} query
   * @param {number} limit
   * @returns {Promise<Note[]>}
   */
  async searchNotes(userId, query, limit = 20) {
    // Sanitize query for PostgreSQL full-text search
    // Remove special characters that break tsquery and normalize spaces
    const sanitizedQuery = query
      .replace(/[#@&|!():<>]/g, " ") // Replace special chars with spaces
      .replace(/\s+/g, " ") // Collapse multiple spaces to single space
      .trim(); // Remove leading/trailing spaces

    const result = await this.query(
      `WITH fts_results AS (
                -- Full-text search results (higher rank)
                SELECT
                    n.id,
                    n.title,
                    n.content,
                    ts_rank(n.search_vector, plainto_tsquery('english', $2)) as rank,
                    n.created_at,
                    n.updated_at
                FROM notes n
                WHERE n.user_id = $1
                    AND n.search_vector @@ plainto_tsquery('english', $2)
                    AND NOT n.is_archived
            ),
            partial_results AS (
                -- Partial text search results (lower rank)
                SELECT
                    n.id,
                    n.title,
                    n.content,
                    0.1 as rank,
                    n.created_at,
                    n.updated_at
                FROM notes n
                WHERE n.user_id = $1
                    AND (
                        n.title ILIKE $4 OR n.content ILIKE $4 OR
                        ($5 != '' AND n.search_vector @@ to_tsquery('english', $5 || ':*'))  -- Stem matching with prefix
                    )
                    AND NOT n.is_archived
                    AND n.id NOT IN (SELECT id FROM fts_results)
            ),
            all_results AS (
                SELECT * FROM fts_results
                UNION ALL
                SELECT * FROM partial_results
            )
            SELECT
                ar.*,
                ARRAY(
                    SELECT json_build_object('id', t.id, 'name', t.name, 'color', t.color)
                    FROM tags t
                    JOIN note_tags nt ON t.id = nt.tag_id
                    WHERE nt.note_id = ar.id
                ) as tags
            FROM all_results ar
            ORDER BY ar.rank DESC, ar.updated_at DESC
            LIMIT $3`,
      [userId, sanitizedQuery, limit, `%${query}%`, sanitizedQuery],
    );
    return result.rows;
  }

  // Tag Operations

  /**
   * Create a tag
   * @param {number} userId
   * @param {string} name
   * @param {string} color
   * @returns {Promise<Tag>}
   */
  async createTag(userId, name, color = "#667eea") {
    const result = await this.query(
      `INSERT INTO tags (user_id, name, color)
             VALUES ($1, $2, $3)
             ON CONFLICT (user_id, name) DO UPDATE SET color = $3
             RETURNING *`,
      [userId, name, color],
    );
    return result.rows[0];
  }

  /**
   * Get all tags for a user
   * @param {number} userId
   * @returns {Promise<Tag[]>}
   */
  async getUserTags(userId) {
    const result = await this.query(
      `SELECT t.*, COUNT(nt.note_id)::int as note_count
             FROM tags t
             LEFT JOIN note_tags nt ON t.id = nt.tag_id
             WHERE t.user_id = $1
             GROUP BY t.id
             ORDER BY t.name`,
      [userId],
    );
    return result.rows;
  }

  // Version History

  /**
   * Get version history for a note
   * @param {number} noteId
   * @returns {Promise<Array>}
   */
  async getNoteVersions(noteId) {
    const result = await this.query(
      `SELECT nv.*, u.name as created_by_name
             FROM note_versions nv
             LEFT JOIN users u ON nv.created_by = u.id
             WHERE nv.note_id = $1
             ORDER BY nv.version_number DESC`,
      [noteId],
    );
    return result.rows;
  }

  /**
   * Restore a note version
   * @param {number} noteId
   * @param {number} versionId
   * @returns {Promise<Note>}
   */
  async restoreNoteVersion(noteId, versionId) {
    return await this.transaction(async (tx) => {
      // Get the version
      const versionResult = await tx.query(
        `SELECT * FROM note_versions WHERE id = $1 AND note_id = $2`,
        [versionId, noteId],
      );
      const version = versionResult.rows[0];

      if (!version) {
        throw new Error("Version not found");
      }

      // Update the note with version content
      const noteResult = await tx.query(
        `UPDATE notes
                 SET title = $1, content = $2, content_plain = $3
                 WHERE id = $4
                 RETURNING *`,
        [version.title, version.content, this.stripMarkdown(version.content), noteId],
      );

      return noteResult.rows[0];
    });
  }

  /**
   * Initialize database schema
   * @param {string} schemaPath - Path to schema.sql file
   * @returns {Promise<void>}
   */
  async initializeSchema(schemaPath) {
    const schema = await Deno.readTextFile(schemaPath);
    const statements = this.parsePostgreSQLStatements(schema);

    for (const statement of statements) {
      if (statement.trim()) {
        try {
          await this.query(statement);
        } catch (error) {
          console.error(`Error executing: ${statement.substring(0, 100)}...`);
          throw error;
        }
      }
    }
  }

  /**
   * Parse PostgreSQL statements - delegates to standalone function
   * @private
   */
  parsePostgreSQLStatements(sql) {
    return parsePostgreSQLStatements(sql);
  }

  // Helper Methods

  /**
   * Add tags to a note (internal helper)
   * @private
   */
  async addTagsToNote(tx, noteId, userId, tagNames) {
    for (const tagName of tagNames) {
      // Create tag if it doesn't exist
      const tagResult = await tx.query(
        `INSERT INTO tags (user_id, name)
                 VALUES ($1, $2)
                 ON CONFLICT (user_id, name) DO UPDATE SET name = $2
                 RETURNING id`,
        [userId, tagName],
      );
      const tagId = tagResult.rows[0].id;

      // Link tag to note
      await tx.query(
        `INSERT INTO note_tags (note_id, tag_id)
                 VALUES ($1, $2)
                 ON CONFLICT DO NOTHING`,
        [noteId, tagId],
      );
    }
  }

  /**
   * Strip markdown - delegates to standalone function
   * @private
   */
  stripMarkdown(markdown) {
    return stripMarkdown(markdown);
  }

  /**
   * Close all connections
   */
  async close() {
    await this.pool.end();
  }
}

/**
 * Create a database client from environment variables
 * @returns {DatabaseClient}
 */
export function createDatabaseClient() {
  return new DatabaseClient({
    user: Deno.env.get("DB_USER"),
    database: Deno.env.get("DB_NAME"),
    hostname: Deno.env.get("DB_HOST") || "localhost",
    port: parseInt(Deno.env.get("DB_PORT") || "5432"),
    password: Deno.env.get("DB_PASSWORD"),
  });
}
