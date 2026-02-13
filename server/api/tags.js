/**
 * Tags API Routes
 * Handles tag management operations
 */

import { Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";

export function createTagsRouter() {
  const router = new Router();

  // GET /api/tags - Get all tags for the authenticated user
  router.get("/", async (ctx) => {
    const { user, db } = ctx.state;

    try {
      const tags = await db.getUserTags(user.id);

      ctx.response.body = {
        success: true,
        data: tags,
      };
    } catch (error) {
      console.error("Error fetching tags:", error);
      ctx.response.status = 500;
      ctx.response.body = {
        success: false,
        error: "Failed to fetch tags",
      };
    }
  });

  // POST /api/tags - Create a new tag
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
      const { name, color = "#667eea" } = body;

      if (!name || name.trim().length === 0) {
        ctx.response.status = 400;
        ctx.response.body = {
          success: false,
          error: "Tag name is required",
        };
        return;
      }

      // Validate color format (hex color)
      const colorRegex = /^#[0-9A-Fa-f]{6}$/;
      if (!colorRegex.test(color)) {
        ctx.response.status = 400;
        ctx.response.body = {
          success: false,
          error: "Invalid color format. Use hex format like #ff0000",
        };
        return;
      }

      const tag = await db.createTag(user.id, name.trim().toLowerCase(), color);

      ctx.response.status = 201;
      ctx.response.body = {
        success: true,
        data: tag,
      };
    } catch (error) {
      console.error("Error creating tag:", error);

      // Handle unique constraint violation
      if (error.message.includes("duplicate key")) {
        ctx.response.status = 409;
        ctx.response.body = {
          success: false,
          error: "Tag already exists",
        };
      } else {
        ctx.response.status = 500;
        ctx.response.body = {
          success: false,
          error: "Failed to create tag",
        };
      }
    }
  });

  // PUT /api/tags/:id - Update a tag
  router.put("/:id", async (ctx) => {
    const { user, db } = ctx.state;
    const tagId = parseInt(ctx.params.id);

    if (!tagId) {
      ctx.response.status = 400;
      ctx.response.body = {
        success: false,
        error: "Invalid tag ID",
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
      const { name, color } = body;

      // Build update query dynamically
      const updates = [];
      const params = [tagId, user.id];
      let paramIndex = 3;

      if (name !== undefined) {
        if (name.trim().length === 0) {
          ctx.response.status = 400;
          ctx.response.body = {
            success: false,
            error: "Tag name cannot be empty",
          };
          return;
        }
        updates.push(`name = $${paramIndex++}`);
        params.push(name.trim().toLowerCase());
      }

      if (color !== undefined) {
        const colorRegex = /^#[0-9A-Fa-f]{6}$/;
        if (!colorRegex.test(color)) {
          ctx.response.status = 400;
          ctx.response.body = {
            success: false,
            error: "Invalid color format. Use hex format like #ff0000",
          };
          return;
        }
        updates.push(`color = $${paramIndex++}`);
        params.push(color);
      }

      if (updates.length === 0) {
        ctx.response.status = 400;
        ctx.response.body = {
          success: false,
          error: "At least one field (name or color) must be provided",
        };
        return;
      }

      const result = await db.query(
        `UPDATE tags SET ${updates.join(", ")}
                 WHERE id = $1 AND user_id = $2
                 RETURNING *`,
        params,
      );

      if (result.rows.length === 0) {
        ctx.response.status = 404;
        ctx.response.body = {
          success: false,
          error: "Tag not found",
        };
        return;
      }

      ctx.response.body = {
        success: true,
        data: result.rows[0],
      };
    } catch (error) {
      console.error("Error updating tag:", error);

      // Handle unique constraint violation
      if (error.message.includes("duplicate key")) {
        ctx.response.status = 409;
        ctx.response.body = {
          success: false,
          error: "Tag name already exists",
        };
      } else {
        ctx.response.status = 500;
        ctx.response.body = {
          success: false,
          error: "Failed to update tag",
        };
      }
    }
  });

  // DELETE /api/tags/:id - Delete a tag
  router.delete("/:id", async (ctx) => {
    const { user, db } = ctx.state;
    const tagId = parseInt(ctx.params.id);

    if (!tagId) {
      ctx.response.status = 400;
      ctx.response.body = {
        success: false,
        error: "Invalid tag ID",
      };
      return;
    }

    try {
      // Check if tag exists and belongs to user
      const tagCheck = await db.query(
        `SELECT id, name FROM tags WHERE id = $1 AND user_id = $2`,
        [tagId, user.id],
      );

      if (tagCheck.rows.length === 0) {
        ctx.response.status = 404;
        ctx.response.body = {
          success: false,
          error: "Tag not found",
        };
        return;
      }

      // Get count of notes using this tag
      const usageCheck = await db.query(
        `SELECT COUNT(*) as count FROM note_tags WHERE tag_id = $1`,
        [tagId],
      );

      const notesCount = parseInt(usageCheck.rows[0].count);

      // Delete the tag (CASCADE will remove note_tags relationships)
      await db.query(
        `DELETE FROM tags WHERE id = $1 AND user_id = $2`,
        [tagId, user.id],
      );

      ctx.response.body = {
        success: true,
        data: {
          id: tagId,
          name: tagCheck.rows[0].name,
          notesAffected: notesCount,
        },
      };
    } catch (error) {
      console.error("Error deleting tag:", error);
      ctx.response.status = 500;
      ctx.response.body = {
        success: false,
        error: "Failed to delete tag",
      };
    }
  });

  // GET /api/tags/:id/notes - Get all notes with a specific tag
  router.get("/:id/notes", async (ctx) => {
    const { user, db } = ctx.state;
    const tagId = parseInt(ctx.params.id);
    const limit = ctx.request.url.searchParams.get("limit") || 20;
    const offset = ctx.request.url.searchParams.get("offset") || 0;

    if (!tagId) {
      ctx.response.status = 400;
      ctx.response.body = {
        success: false,
        error: "Invalid tag ID",
      };
      return;
    }

    try {
      // Verify tag exists and belongs to user
      const tagCheck = await db.query(
        `SELECT name FROM tags WHERE id = $1 AND user_id = $2`,
        [tagId, user.id],
      );

      if (tagCheck.rows.length === 0) {
        ctx.response.status = 404;
        ctx.response.body = {
          success: false,
          error: "Tag not found",
        };
        return;
      }

      const tagName = tagCheck.rows[0].name;

      // Get notes with this tag
      const cappedLimit = Math.min(parseInt(limit) || 20, 100);
      const cappedOffset = Math.max(parseInt(offset) || 0, 0);

      const notes = await db.getNotes(user.id, {
        tags: [tagName],
        limit: cappedLimit,
        offset: cappedOffset,
      });

      ctx.response.body = {
        success: true,
        data: {
          tag: {
            id: tagId,
            name: tagName,
          },
          notes: notes,
          meta: {
            limit: cappedLimit,
            offset: cappedOffset,
            hasMore: notes.length === cappedLimit,
          },
        },
      };
    } catch (error) {
      console.error("Error fetching notes for tag:", error);
      ctx.response.status = 500;
      ctx.response.body = {
        success: false,
        error: "Failed to fetch notes for tag",
      };
    }
  });

  return router;
}
