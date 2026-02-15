/**
 * Notes API Routes
 * Handles CRUD operations for notes
 */

import { Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";

/**
 * Extract image filenames from note content
 */
function extractImageFilenames(content) {
  if (!content) return new Set();
  const pattern = /\/api\/images\/([a-f0-9-]+\.\w+)/g;
  const filenames = new Set();
  let match;
  while ((match = pattern.exec(content)) !== null) {
    filenames.add(match[1]);
  }
  return filenames;
}

/**
 * Delete orphaned images that are no longer referenced in any note
 */
async function cleanupOrphanedImages(db, userId, removedFilenames) {
  for (const filename of removedFilenames) {
    try {
      // Check if the image is referenced in any note by this user
      const refCheck = await db.query(
        `SELECT COUNT(*)::int as count FROM notes
         WHERE user_id = $1 AND NOT is_archived
         AND position($2 in content) > 0`,
        [userId, filename],
      );

      if (refCheck.rows[0].count === 0) {
        // Delete from database
        await db.query(
          `DELETE FROM images WHERE user_id = $1 AND filename = $2`,
          [userId, filename],
        );

        // Delete from disk
        try {
          await Deno.remove(`./uploads/user-${userId}/${filename}`);
        } catch (err) {
          if (!(err instanceof Deno.errors.NotFound)) {
            console.error("Failed to delete image file:", err);
          }
        }
      }
    } catch (error) {
      console.error(`Failed to cleanup image ${filename}:`, error);
    }
  }
}

export function createNotesRouter() {
  const router = new Router();

  // GET /api/notes - Get all notes for the authenticated user
  router.get("/", async (ctx) => {
    const { user, db } = ctx.state;

    // Properly extract parameters from URLSearchParams
    const limit = ctx.request.url.searchParams.get("limit") || 20;
    const offset = ctx.request.url.searchParams.get("offset") || 0;
    const tags = ctx.request.url.searchParams.get("tags");
    const search = ctx.request.url.searchParams.get("search");
    const pinned = ctx.request.url.searchParams.get("pinned");
    const archived = ctx.request.url.searchParams.get("archived");

    try {
      const options = {
        limit: Math.min(parseInt(limit) || 20, 100),
        offset: Math.max(parseInt(offset) || 0, 0),
      };

      if (tags) {
        options.tags = tags.split(",").map((tag) => parseInt(tag.trim()));
      }

      if (search) {
        options.search = search;
      }

      if (pinned === "true" || pinned === "false") {
        options.pinned = pinned === "true";
      }

      if (archived === "true") {
        options.archived = true;
      }

      const notes = await db.getNotes(user.id, options);

      ctx.response.body = {
        success: true,
        data: { notes },
        meta: {
          limit: options.limit,
          offset: options.offset,
          hasMore: notes.length === options.limit,
        },
      };
    } catch (error) {
      console.error("Error fetching notes:", error);
      ctx.response.status = 500;
      ctx.response.body = {
        success: false,
        error: "Failed to fetch notes",
      };
    }
  });

  // GET /api/notes/:id - Get a specific note
  router.get("/:id", async (ctx) => {
    const { user, db } = ctx.state;
    const noteId = parseInt(ctx.params.id);

    if (!noteId) {
      ctx.response.status = 400;
      ctx.response.body = {
        success: false,
        error: "Invalid note ID",
      };
      return;
    }

    try {
      const result = await db.query(
        `SELECT n.*,
                        ARRAY(
                            SELECT json_build_object('id', t.id, 'name', t.name, 'color', t.color)
                            FROM tags t
                            JOIN note_tags nt ON t.id = nt.tag_id
                            WHERE nt.note_id = n.id
                        ) as tags
                 FROM notes n
                 WHERE n.id = $1 AND n.user_id = $2`,
        [noteId, user.id],
      );

      if (result.rows.length === 0) {
        ctx.response.status = 404;
        ctx.response.body = {
          success: false,
          error: "Note not found",
        };
        return;
      }

      ctx.response.body = {
        success: true,
        data: result.rows[0],
      };
    } catch (error) {
      console.error("Error fetching note:", error);
      ctx.response.status = 500;
      ctx.response.body = {
        success: false,
        error: "Failed to fetch note",
      };
    }
  });

  // POST /api/notes - Create a new note
  router.post("/", async (ctx) => {
    const { user, db } = ctx.state;

    if (!ctx.request.hasBody) {
      ctx.response.status = 400;
      ctx.response.body = {
        success: false,
        error: "Request body is required",
      };
      return;
    }

    try {
      const body = await ctx.request.body({ type: "json" }).value;
      const { title, content, tags = [] } = body;

      if (!title || !content) {
        ctx.response.status = 400;
        ctx.response.body = {
          success: false,
          error: "Title and content are required",
        };
        return;
      }

      if (title.length > 500) {
        ctx.response.status = 400;
        ctx.response.body = {
          success: false,
          error: "Title must be 500 characters or less",
        };
        return;
      }

      if (content.length > 1_000_000) {
        ctx.response.status = 400;
        ctx.response.body = {
          success: false,
          error: "Content must be 1MB or less",
        };
        return;
      }

      const note = await db.createNote({
        userId: user.id,
        title: title.trim(),
        content: content.trim(),
        tags: Array.isArray(tags) ? tags : [],
      });

      ctx.response.status = 201;
      ctx.response.body = {
        success: true,
        data: note,
      };
    } catch (error) {
      console.error("Error creating note:", error);
      ctx.response.status = 500;
      ctx.response.body = {
        success: false,
        error: "Failed to create note",
      };
    }
  });

  // PUT /api/notes/:id - Update a note
  router.put("/:id", async (ctx) => {
    const { user, db } = ctx.state;
    const noteId = parseInt(ctx.params.id);

    if (!noteId) {
      ctx.response.status = 400;
      ctx.response.body = {
        success: false,
        error: "Invalid note ID",
      };
      return;
    }

    if (!ctx.request.hasBody) {
      ctx.response.status = 400;
      ctx.response.body = {
        success: false,
        error: "Request body is required",
      };
      return;
    }

    try {
      const body = await ctx.request.body({ type: "json" }).value;
      const { title, content, tags, is_pinned, is_archived } = body;

      // Verify note exists and belongs to user, fetch old content for image cleanup
      const existingNote = await db.query(
        `SELECT id, content FROM notes WHERE id = $1 AND user_id = $2`,
        [noteId, user.id],
      );

      if (existingNote.rows.length === 0) {
        ctx.response.status = 404;
        ctx.response.body = {
          success: false,
          error: "Note not found",
        };
        return;
      }

      const oldContent = existingNote.rows[0].content;

      const updates = {};
      if (title !== undefined) updates.title = title.trim();
      if (content !== undefined) updates.content = content.trim();
      if (tags !== undefined) updates.tags = Array.isArray(tags) ? tags : [];
      if (is_pinned !== undefined) updates.is_pinned = Boolean(is_pinned);
      if (is_archived !== undefined) updates.is_archived = Boolean(is_archived);

      if (Object.keys(updates).length === 0) {
        ctx.response.status = 400;
        ctx.response.body = {
          success: false,
          error: "At least one field must be provided for update",
        };
        return;
      }

      const note = await db.updateNote(noteId, updates, user.id);

      // Clean up images that were removed from the content
      if (content !== undefined) {
        const oldImages = extractImageFilenames(oldContent);
        const newImages = extractImageFilenames(updates.content);
        const removed = [...oldImages].filter((f) => !newImages.has(f));
        if (removed.length > 0) {
          // Run cleanup in background — don't block the response
          cleanupOrphanedImages(db, user.id, removed);
        }
      }

      ctx.response.body = {
        success: true,
        data: note,
      };
    } catch (error) {
      console.error("Error updating note:", error);
      ctx.response.status = 500;
      ctx.response.body = {
        success: false,
        error: "Failed to update note",
      };
    }
  });

  // DELETE /api/notes/:id - Delete a note (soft delete by archiving)
  router.delete("/:id", async (ctx) => {
    const { user, db } = ctx.state;
    const noteId = parseInt(ctx.params.id);

    if (!noteId) {
      ctx.response.status = 400;
      ctx.response.body = {
        success: false,
        error: "Invalid note ID",
      };
      return;
    }

    try {
      const result = await db.query(
        `UPDATE notes SET is_archived = true
                 WHERE id = $1 AND user_id = $2 AND NOT is_archived
                 RETURNING id, content`,
        [noteId, user.id],
      );

      if (result.rows.length === 0) {
        ctx.response.status = 404;
        ctx.response.body = {
          success: false,
          error: "Note not found",
        };
        return;
      }

      // Clean up images from the archived note
      const archivedContent = result.rows[0].content;
      const images = extractImageFilenames(archivedContent);
      if (images.size > 0) {
        cleanupOrphanedImages(db, user.id, [...images]);
      }

      ctx.response.body = {
        success: true,
        data: { id: noteId, archived: true },
      };
    } catch (error) {
      console.error("Error deleting note:", error);
      ctx.response.status = 500;
      ctx.response.body = {
        success: false,
        error: "Failed to delete note",
      };
    }
  });

  // GET /api/notes/:id/versions - Get version history for a note
  router.get("/:id/versions", async (ctx) => {
    const { user, db } = ctx.state;
    const noteId = parseInt(ctx.params.id);

    if (!noteId) {
      ctx.response.status = 400;
      ctx.response.body = {
        success: false,
        error: "Invalid note ID",
      };
      return;
    }

    try {
      // Verify note belongs to user
      const noteCheck = await db.query(
        `SELECT id FROM notes WHERE id = $1 AND user_id = $2`,
        [noteId, user.id],
      );

      if (noteCheck.rows.length === 0) {
        ctx.response.status = 404;
        ctx.response.body = {
          success: false,
          error: "Note not found",
        };
        return;
      }

      const versions = await db.getNoteVersions(noteId);

      ctx.response.body = {
        success: true,
        data: versions,
      };
    } catch (error) {
      console.error("Error fetching note versions:", error);
      ctx.response.status = 500;
      ctx.response.body = {
        success: false,
        error: "Failed to fetch note versions",
      };
    }
  });

  // POST /api/notes/:id/restore/:versionId - Restore a note version
  router.post("/:id/restore/:versionId", async (ctx) => {
    const { user, db } = ctx.state;
    const noteId = parseInt(ctx.params.id);
    const versionId = parseInt(ctx.params.versionId);

    if (!noteId || !versionId) {
      ctx.response.status = 400;
      ctx.response.body = {
        success: false,
        error: "Invalid note ID or version ID",
      };
      return;
    }

    try {
      // Verify note belongs to user
      const noteCheck = await db.query(
        `SELECT id FROM notes WHERE id = $1 AND user_id = $2`,
        [noteId, user.id],
      );

      if (noteCheck.rows.length === 0) {
        ctx.response.status = 404;
        ctx.response.body = {
          success: false,
          error: "Note not found",
        };
        return;
      }

      const restoredNote = await db.restoreNoteVersion(noteId, versionId);

      ctx.response.body = {
        success: true,
        data: restoredNote,
      };
    } catch (error) {
      console.error("Error restoring note version:", error);
      ctx.response.status = 500;
      ctx.response.body = {
        success: false,
        error: "Failed to restore note version",
      };
    }
  });

  return router;
}
