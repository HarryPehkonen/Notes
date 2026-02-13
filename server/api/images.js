/**
 * Images API Routes
 * Handles image upload, serving, and deletion
 */

import { Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";

// Allowed MIME types for image uploads
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
]);

// File extension mapping
const MIME_TO_EXT = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

// Maximum file size: 5MB
const MAX_FILE_SIZE = 5 * 1024 * 1024;

// Magic byte signatures for image types
const MAGIC_BYTES = {
  "image/jpeg": [[0xFF, 0xD8, 0xFF]],
  "image/png": [[0x89, 0x50, 0x4E, 0x47]],
  "image/gif": [[0x47, 0x49, 0x46, 0x38]], // GIF8
  "image/webp": null, // RIFF header checked separately
  "image/svg+xml": null, // Text-based, checked separately
};

/**
 * Validate that file content matches declared MIME type
 */
function validateMagicBytes(content, mimeType) {
  if (mimeType === "image/webp") {
    // RIFF....WEBP
    return content.length >= 12 &&
      content[0] === 0x52 && content[1] === 0x49 && content[2] === 0x46 && content[3] === 0x46 &&
      content[8] === 0x57 && content[9] === 0x45 && content[10] === 0x42 && content[11] === 0x50;
  }
  if (mimeType === "image/svg+xml") {
    // SVG is text-based; check for XML/SVG markers in first 256 bytes
    const head = new TextDecoder().decode(content.slice(0, 256)).toLowerCase();
    return head.includes("<svg") || head.includes("<?xml");
  }
  const signatures = MAGIC_BYTES[mimeType];
  if (!signatures) return false;
  return signatures.some((sig) =>
    sig.every((byte, i) => content.length > i && content[i] === byte)
  );
}

// Base upload directory
const UPLOADS_DIR = "./uploads";

/**
 * Ensure the uploads directory exists for a user
 */
async function ensureUserDir(userId) {
  const userDir = `${UPLOADS_DIR}/user-${userId}`;
  try {
    await Deno.mkdir(userDir, { recursive: true });
  } catch (error) {
    if (!(error instanceof Deno.errors.AlreadyExists)) {
      throw error;
    }
  }
  return userDir;
}

/**
 * Generate a unique filename using UUID
 */
function generateFilename(mimeType) {
  const ext = MIME_TO_EXT[mimeType] || "bin";
  const uuid = crypto.randomUUID();
  return `${uuid}.${ext}`;
}

export function createImagesRouter() {
  const router = new Router();

  // POST /api/images - Upload an image
  router.post("/", async (ctx) => {
    const { user, db } = ctx.state;

    try {
      // Parse multipart form data
      const body = ctx.request.body({ type: "form-data" });
      const formData = await body.value.read({ maxSize: MAX_FILE_SIZE });

      // Get the uploaded file
      const file = formData.files?.[0];
      if (!file) {
        ctx.response.status = 400;
        ctx.response.body = {
          success: false,
          error: "No file uploaded",
        };
        return;
      }

      // Validate MIME type
      const mimeType = file.contentType;
      if (!ALLOWED_MIME_TYPES.has(mimeType)) {
        ctx.response.status = 400;
        ctx.response.body = {
          success: false,
          error: `Invalid file type: ${mimeType}. Allowed types: JPEG, PNG, GIF, WebP, SVG`,
        };
        return;
      }

      // Validate file content matches declared MIME type
      const fileContent = file.content;
      if (fileContent && !validateMagicBytes(fileContent, mimeType)) {
        ctx.response.status = 400;
        ctx.response.body = {
          success: false,
          error: "File content does not match declared type",
        };
        return;
      }

      // Check file size (formData.read already enforces maxSize, but double-check)
      if (!fileContent || fileContent.length > MAX_FILE_SIZE) {
        ctx.response.status = 400;
        ctx.response.body = {
          success: false,
          error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB`,
        };
        return;
      }

      // Generate unique filename and ensure user directory exists
      const filename = generateFilename(mimeType);
      const userDir = await ensureUserDir(user.id);
      const filePath = `${userDir}/${filename}`;

      // Write the file
      await Deno.writeFile(filePath, fileContent);

      // Store metadata in database
      await db.query(
        `INSERT INTO images (user_id, filename, original_name, mime_type, size_bytes)
         VALUES ($1, $2, $3, $4, $5)`,
        [user.id, filename, file.originalName || file.filename, mimeType, fileContent.length],
      );

      // Return the URL for the image
      const imageUrl = `/api/images/${filename}`;

      ctx.response.status = 201;
      ctx.response.body = {
        success: true,
        data: {
          filename,
          url: imageUrl,
          originalName: file.originalName || file.filename,
          mimeType,
          size: fileContent.length,
        },
      };
    } catch (error) {
      console.error("Error uploading image:", error);

      // Handle specific error for file too large
      if (error.message?.includes("maxSize")) {
        ctx.response.status = 400;
        ctx.response.body = {
          success: false,
          error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB`,
        };
        return;
      }

      ctx.response.status = 500;
      ctx.response.body = {
        success: false,
        error: "Failed to upload image",
      };
    }
  });

  // GET /api/images/:filename - Serve an image
  router.get("/:filename", async (ctx) => {
    const { user, db } = ctx.state;
    const filename = ctx.params.filename;

    if (!filename) {
      ctx.response.status = 400;
      ctx.response.body = {
        success: false,
        error: "Filename is required",
      };
      return;
    }

    try {
      // Verify the image belongs to the user
      const result = await db.query(
        `SELECT mime_type FROM images WHERE user_id = $1 AND filename = $2`,
        [user.id, filename],
      );

      if (result.rows.length === 0) {
        ctx.response.status = 404;
        ctx.response.body = {
          success: false,
          error: "Image not found",
        };
        return;
      }

      const { mime_type: mimeType } = result.rows[0];
      const filePath = `${UPLOADS_DIR}/user-${user.id}/${filename}`;

      // Check if file exists
      try {
        await Deno.stat(filePath);
      } catch {
        ctx.response.status = 404;
        ctx.response.body = {
          success: false,
          error: "Image file not found",
        };
        return;
      }

      // Read and serve the file
      const fileContent = await Deno.readFile(filePath);

      ctx.response.type = mimeType;
      ctx.response.headers.set("Cache-Control", "public, max-age=31536000, immutable");
      // Prevent script execution in SVGs opened directly in browser
      ctx.response.headers.set("Content-Security-Policy", "script-src 'none'");
      ctx.response.body = fileContent;
    } catch (error) {
      console.error("Error serving image:", error);
      ctx.response.status = 500;
      ctx.response.body = {
        success: false,
        error: "Failed to serve image",
      };
    }
  });

  // DELETE /api/images/:filename - Delete an image
  router.delete("/:filename", async (ctx) => {
    const { user, db } = ctx.state;
    const filename = ctx.params.filename;

    if (!filename) {
      ctx.response.status = 400;
      ctx.response.body = {
        success: false,
        error: "Filename is required",
      };
      return;
    }

    try {
      // Verify the image belongs to the user
      const result = await db.query(
        `DELETE FROM images WHERE user_id = $1 AND filename = $2 RETURNING id`,
        [user.id, filename],
      );

      if (result.rows.length === 0) {
        ctx.response.status = 404;
        ctx.response.body = {
          success: false,
          error: "Image not found",
        };
        return;
      }

      // Delete the file from disk
      const filePath = `${UPLOADS_DIR}/user-${user.id}/${filename}`;
      try {
        await Deno.remove(filePath);
      } catch (error) {
        // Log but don't fail if file doesn't exist (already deleted)
        if (!(error instanceof Deno.errors.NotFound)) {
          console.error("Error deleting image file:", error);
        }
      }

      ctx.response.body = {
        success: true,
        data: { filename, deleted: true },
      };
    } catch (error) {
      console.error("Error deleting image:", error);
      ctx.response.status = 500;
      ctx.response.body = {
        success: false,
        error: "Failed to delete image",
      };
    }
  });

  return router;
}
