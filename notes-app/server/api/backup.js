/**
 * Backup API Routes
 * Handles Dropbox backup and restore operations
 */

import { Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { DropboxClient } from "../services/dropbox.js";

export function createBackupRouter() {
    const router = new Router();

    // Helper function to get Dropbox client
    function getDropboxClient() {
        const accessToken = Deno.env.get("DROPBOX_ACCESS_TOKEN");
        if (!accessToken) {
            throw new Error("Dropbox access token not configured");
        }
        return new DropboxClient(accessToken);
    }

    // POST /api/backup/create - Create a backup of user's data
    router.post("/create", async (ctx) => {
        const { user, db } = ctx.state;

        try {
            const dropbox = getDropboxClient();

            // Get all user data
            const userData = {
                user: {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    picture: user.picture
                },
                notes: await db.getNotes(user.id, { limit: 1000 }), // Get all notes
                tags: await db.getUserTags(user.id),
                backup_info: {
                    created_at: new Date().toISOString(),
                    version: "1.0.0",
                    app: "notes-app"
                }
            };

            // Create backup filename
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupPath = `/notes-app-backups/user-${user.id}/backup-${timestamp}.json`;

            // Upload to Dropbox
            const backupContent = JSON.stringify(userData, null, 2);
            await dropbox.upload(backupPath, backupContent);

            // Record backup in database (optional - for tracking)
            await db.query(
                `INSERT INTO user_backups (user_id, backup_path, backup_size, created_at)
                 VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
                 ON CONFLICT DO NOTHING`,
                [user.id, backupPath, backupContent.length]
            ).catch(() => {
                // Ignore if table doesn't exist - this is optional
            });

            ctx.response.status = 201;
            ctx.response.body = {
                success: true,
                data: {
                    backup_path: backupPath,
                    size: backupContent.length,
                    notes_count: userData.notes.length,
                    tags_count: userData.tags.length,
                    created_at: userData.backup_info.created_at
                }
            };
        } catch (error) {
            console.error("Error creating backup:", error);
            ctx.response.status = 500;
            ctx.response.body = {
                success: false,
                error: "Failed to create backup",
                details: error.message
            };
        }
    });

    // GET /api/backup/list - List available backups for the user
    router.get("/list", async (ctx) => {
        const { user } = ctx.state;

        try {
            const dropbox = getDropboxClient();
            const backupFolder = `/notes-app-backups/user-${user.id}`;

            const files = await dropbox.listFiles(backupFolder);

            // Filter and format backup files
            const backups = files
                .filter(file => file.name.endsWith('.json') && file.name.startsWith('backup-'))
                .map(file => ({
                    path: file.path_display,
                    name: file.name,
                    size: file.size,
                    created_at: file.server_modified,
                    download_url: `/api/backup/download?path=${encodeURIComponent(file.path_display)}`
                }))
                .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

            ctx.response.body = {
                success: true,
                data: {
                    backups,
                    total: backups.length
                }
            };
        } catch (error) {
            console.error("Error listing backups:", error);

            if (error.message.includes("not_found")) {
                ctx.response.body = {
                    success: true,
                    data: {
                        backups: [],
                        total: 0
                    }
                };
            } else {
                ctx.response.status = 500;
                ctx.response.body = {
                    success: false,
                    error: "Failed to list backups",
                    details: error.message
                };
            }
        }
    });

    // GET /api/backup/download - Download a specific backup
    router.get("/download", async (ctx) => {
        const { user } = ctx.state;
        const backupPath = ctx.request.url.searchParams.get("path");

        if (!backupPath) {
            ctx.response.status = 400;
            ctx.response.body = {
                success: false,
                error: "Backup path is required"
            };
            return;
        }

        // Verify the backup belongs to the user
        if (!backupPath.includes(`/user-${user.id}/`)) {
            ctx.response.status = 403;
            ctx.response.body = {
                success: false,
                error: "Access denied: backup does not belong to you"
            };
            return;
        }

        try {
            const dropbox = getDropboxClient();
            const content = await dropbox.download(backupPath);

            ctx.response.type = "application/json";
            ctx.response.headers.set("Content-Disposition", `attachment; filename="${backupPath.split('/').pop()}"`);
            ctx.response.body = content;
        } catch (error) {
            console.error("Error downloading backup:", error);
            ctx.response.status = 500;
            ctx.response.body = {
                success: false,
                error: "Failed to download backup",
                details: error.message
            };
        }
    });

    // POST /api/backup/restore - Restore data from a backup
    router.post("/restore", async (ctx) => {
        const { user, db } = ctx.state;

        if (!ctx.request.hasBody) {
            ctx.response.status = 400;
            ctx.response.body = {
                success: false,
                error: "Request body is required"
            };
            return;
        }

        try {
            const body = await ctx.request.body({ type: "json" }).value;
            const { backup_path, merge_mode = "merge" } = body;

            if (!backup_path) {
                ctx.response.status = 400;
                ctx.response.body = {
                    success: false,
                    error: "backup_path is required"
                };
                return;
            }

            // Verify the backup belongs to the user
            if (!backup_path.includes(`/user-${user.id}/`)) {
                ctx.response.status = 403;
                ctx.response.body = {
                    success: false,
                    error: "Access denied: backup does not belong to you"
                };
                return;
            }

            const dropbox = getDropboxClient();
            const backupContent = await dropbox.download(backup_path);
            const backupData = JSON.parse(backupContent);

            // Validate backup data
            if (!backupData.notes || !backupData.tags || !backupData.user) {
                ctx.response.status = 400;
                ctx.response.body = {
                    success: false,
                    error: "Invalid backup format"
                };
                return;
            }

            const stats = {
                notes_restored: 0,
                tags_restored: 0,
                notes_skipped: 0,
                tags_skipped: 0
            };

            await db.transaction(async (tx) => {
                // Restore tags first
                for (const tag of backupData.tags) {
                    try {
                        await tx.query(
                            `INSERT INTO tags (user_id, name, color)
                             VALUES ($1, $2, $3)
                             ON CONFLICT (user_id, name) DO UPDATE SET color = $3`,
                            [user.id, tag.name, tag.color]
                        );
                        stats.tags_restored++;
                    } catch (error) {
                        console.warn(`Skipped tag ${tag.name}:`, error.message);
                        stats.tags_skipped++;
                    }
                }

                // Restore notes
                for (const note of backupData.notes) {
                    try {
                        // Check if note already exists (by title and content hash)
                        const contentHash = await crypto.subtle.digest(
                            "SHA-256",
                            new TextEncoder().encode(note.content)
                        );
                        const hashHex = Array.from(new Uint8Array(contentHash))
                            .map(b => b.toString(16).padStart(2, '0'))
                            .join('');

                        if (merge_mode === "skip_existing") {
                            const existing = await tx.query(
                                `SELECT id FROM notes
                                 WHERE user_id = $1 AND title = $2
                                 AND encode(sha256(content::bytea), 'hex') = $3`,
                                [user.id, note.title, hashHex]
                            );

                            if (existing.rows.length > 0) {
                                stats.notes_skipped++;
                                continue;
                            }
                        }

                        // Create the note
                        const noteResult = await tx.query(
                            `INSERT INTO notes (user_id, title, content, content_plain, is_pinned)
                             VALUES ($1, $2, $3, $4, $5)
                             RETURNING id`,
                            [
                                user.id,
                                note.title,
                                note.content,
                                note.content.replace(/[#*_~`]/g, ''), // Simple markdown strip
                                note.is_pinned || false
                            ]
                        );

                        const newNoteId = noteResult.rows[0].id;

                        // Add tags to the note
                        if (note.tags && note.tags.length > 0) {
                            for (const tagName of note.tags) {
                                const tagResult = await tx.query(
                                    `SELECT id FROM tags WHERE user_id = $1 AND name = $2`,
                                    [user.id, tagName]
                                );

                                if (tagResult.rows.length > 0) {
                                    await tx.query(
                                        `INSERT INTO note_tags (note_id, tag_id)
                                         VALUES ($1, $2)
                                         ON CONFLICT DO NOTHING`,
                                        [newNoteId, tagResult.rows[0].id]
                                    );
                                }
                            }
                        }

                        stats.notes_restored++;
                    } catch (error) {
                        console.warn(`Skipped note ${note.title}:`, error.message);
                        stats.notes_skipped++;
                    }
                }
            });

            ctx.response.body = {
                success: true,
                data: {
                    backup_path,
                    merge_mode,
                    stats,
                    restored_at: new Date().toISOString()
                }
            };
        } catch (error) {
            console.error("Error restoring backup:", error);
            ctx.response.status = 500;
            ctx.response.body = {
                success: false,
                error: "Failed to restore backup",
                details: error.message
            };
        }
    });

    // DELETE /api/backup/:path - Delete a backup file
    router.delete("/:path*", async (ctx) => {
        const { user } = ctx.state;
        const backupPath = `/${ctx.params.path}`;

        // Verify the backup belongs to the user
        if (!backupPath.includes(`/user-${user.id}/`)) {
            ctx.response.status = 403;
            ctx.response.body = {
                success: false,
                error: "Access denied: backup does not belong to you"
            };
            return;
        }

        try {
            const dropbox = getDropboxClient();
            await dropbox.delete(backupPath);

            ctx.response.body = {
                success: true,
                data: {
                    deleted_path: backupPath,
                    deleted_at: new Date().toISOString()
                }
            };
        } catch (error) {
            console.error("Error deleting backup:", error);
            ctx.response.status = 500;
            ctx.response.body = {
                success: false,
                error: "Failed to delete backup",
                details: error.message
            };
        }
    });

    // GET /api/backup/status - Get backup status and settings
    router.get("/status", async (ctx) => {
        const { user, db } = ctx.state;

        try {
            // Get user's note count and last backup info
            const notesCount = await db.query(
                `SELECT COUNT(*) as count FROM notes WHERE user_id = $1 AND NOT is_archived`,
                [user.id]
            );

            const tagsCount = await db.query(
                `SELECT COUNT(*) as count FROM tags WHERE user_id = $1`,
                [user.id]
            );

            // Try to get last backup info
            let lastBackup = null;
            try {
                const dropbox = getDropboxClient();
                const backupFolder = `/notes-app-backups/user-${user.id}`;
                const files = await dropbox.listFiles(backupFolder);

                const backupFiles = files
                    .filter(file => file.name.endsWith('.json') && file.name.startsWith('backup-'))
                    .sort((a, b) => new Date(b.server_modified) - new Date(a.server_modified));

                if (backupFiles.length > 0) {
                    lastBackup = {
                        path: backupFiles[0].path_display,
                        created_at: backupFiles[0].server_modified,
                        size: backupFiles[0].size
                    };
                }
            } catch (error) {
                // Ignore errors when getting backup info
            }

            ctx.response.body = {
                success: true,
                data: {
                    user: {
                        id: user.id,
                        notes_count: parseInt(notesCount.rows[0].count),
                        tags_count: parseInt(tagsCount.rows[0].count)
                    },
                    backup: {
                        last_backup: lastBackup,
                        auto_backup_enabled: Deno.env.get("AUTO_BACKUP_ENABLED") === "true",
                        backup_interval_hours: parseInt(Deno.env.get("BACKUP_INTERVAL_HOURS") || "24")
                    },
                    dropbox: {
                        configured: !!Deno.env.get("DROPBOX_ACCESS_TOKEN")
                    }
                }
            };
        } catch (error) {
            console.error("Error getting backup status:", error);
            ctx.response.status = 500;
            ctx.response.body = {
                success: false,
                error: "Failed to get backup status"
            };
        }
    });

    return router;
}
