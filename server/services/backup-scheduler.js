/**
 * Automatic Backup Scheduler
 * Handles periodic backup of user data to Dropbox
 */

import { DropboxClient } from "./dropbox.js";

export class BackupScheduler {
    constructor(db) {
        this.db = db;
        this.isRunning = false;
        this.intervalId = null;
        this.backupInterval = parseInt(Deno.env.get("BACKUP_INTERVAL_HOURS") || "24") * 60 * 60 * 1000; // Convert hours to ms
        this.autoBackupEnabled = Deno.env.get("AUTO_BACKUP_ENABLED") === "true";
        this.dropboxClient = null;

        // Initialize Dropbox client if token is available
        const dropboxToken = Deno.env.get("DROPBOX_ACCESS_TOKEN");
        if (dropboxToken) {
            this.dropboxClient = new DropboxClient(dropboxToken);
        }
    }

    /**
     * Start the backup scheduler
     */
    start() {
        if (!this.autoBackupEnabled) {
            console.log("▶ Automatic backups are disabled");
            return;
        }

        if (!this.dropboxClient) {
            console.log("⚠  Automatic backups disabled: Dropbox access token not configured");
            return;
        }

        if (this.isRunning) {
            console.log("▶ Backup scheduler is already running");
            return;
        }

        this.isRunning = true;
        console.log(`▶ Starting automatic backup scheduler (every ${this.backupInterval / (60 * 60 * 1000)} hours)`);

        // Run initial backup after 1 minute
        setTimeout(() => {
            this.runScheduledBackup();
        }, 60 * 1000);

        // Set up recurring backups
        this.intervalId = setInterval(() => {
            this.runScheduledBackup();
        }, this.backupInterval);
    }

    /**
     * Stop the backup scheduler
     */
    stop() {
        if (!this.isRunning) {
            return;
        }

        this.isRunning = false;
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        console.log("▶ Backup scheduler stopped");
    }

    /**
     * Run a scheduled backup for all users
     */
    async runScheduledBackup() {
        if (!this.dropboxClient) {
            console.log("⚠  Skipping backup: Dropbox not configured");
            return;
        }

        console.log("▶ Starting scheduled backup...");

        try {
            // Get all users who have notes
            const users = await this.db.query(`
                SELECT DISTINCT u.id, u.email, u.name, u.picture
                FROM users u
                JOIN notes n ON u.id = n.user_id
                WHERE NOT n.is_archived
            `);

            console.log(`▶ Found ${users.rows.length} users with notes to backup`);

            let successCount = 0;
            let errorCount = 0;

            for (const user of users.rows) {
                try {
                    await this.backupUserData(user);
                    successCount++;
                } catch (error) {
                    console.error(`✗ Backup failed for user ${user.email}:`, error.message);
                    errorCount++;
                }
            }

            console.log(`▶ Scheduled backup completed: ${successCount} successful, ${errorCount} failed`);
        } catch (error) {
            console.error("✗ Scheduled backup failed:", error);
        }
    }

    /**
     * Backup data for a specific user
     */
    async backupUserData(user) {
        try {
            console.log(`▶ Backing up data for user: ${user.email}`);

            // Get all user data
            const userData = {
                user: {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    picture: user.picture
                },
                notes: await this.db.getNotes(user.id, { limit: 1000 }),
                tags: await this.db.getUserTags(user.id),
                backup_info: {
                    created_at: new Date().toISOString(),
                    version: "1.0.0",
                    app: "notes-app",
                    type: "automatic"
                }
            };

            // Create backup filename
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupPath = `/notes-app-backups/user-${user.id}/auto-backup-${timestamp}.json`;

            // Upload to Dropbox
            const backupContent = JSON.stringify(userData, null, 2);
            await this.dropboxClient.upload(backupPath, backupContent);

            // Record backup in database (optional - for tracking)
            try {
                await this.db.query(
                    `INSERT INTO user_backups (user_id, backup_path, backup_size, backup_type, created_at)
                     VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
                     ON CONFLICT DO NOTHING`,
                    [user.id, backupPath, backupContent.length, "automatic"]
                );
            } catch (dbError) {
                // Ignore if table doesn't exist - this is optional
            }

            console.log(`✓ Backup completed for ${user.email}: ${userData.notes.length} notes, ${userData.tags.length} tags`);

            // Clean up old automatic backups (keep last 10)
            await this.cleanupOldBackups(user.id);

        } catch (error) {
            console.error(`✗ Failed to backup user ${user.email}:`, error);
            throw error;
        }
    }

    /**
     * Clean up old automatic backups for a user
     */
    async cleanupOldBackups(userId) {
        try {
            const backupFolder = `/notes-app-backups/user-${userId}`;
            const files = await this.dropboxClient.listFiles(backupFolder);

            // Filter automatic backup files and sort by date (newest first)
            const autoBackups = files
                .filter(file => file.name.startsWith('auto-backup-') && file.name.endsWith('.json'))
                .sort((a, b) => new Date(b.server_modified) - new Date(a.server_modified));

            // Keep only the last 10 automatic backups
            const backupsToDelete = autoBackups.slice(10);

            for (const backup of backupsToDelete) {
                try {
                    await this.dropboxClient.delete(backup.path_display);
                    console.log(`   Deleted old backup: ${backup.name}`);
                } catch (error) {
                    console.warn(`⚠  Failed to delete old backup ${backup.name}:`, error.message);
                }
            }

            if (backupsToDelete.length > 0) {
                console.log(`  Cleaned up ${backupsToDelete.length} old backups for user ${userId}`);
            }
        } catch (error) {
            console.warn(`⚠  Failed to cleanup old backups for user ${userId}:`, error.message);
        }
    }

    /**
     * Get backup scheduler status
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            autoBackupEnabled: this.autoBackupEnabled,
            backupIntervalHours: this.backupInterval / (60 * 60 * 1000),
            dropboxConfigured: !!this.dropboxClient,
            nextBackupTime: this.isRunning && this.intervalId ?
                new Date(Date.now() + this.backupInterval).toISOString() :
                null
        };
    }

    /**
     * Manually trigger a backup for all users
     */
    async triggerManualBackup() {
        console.log("▶ Manual backup triggered");
        await this.runScheduledBackup();
    }

    /**
     * Backup specific user (for testing or manual backup)
     */
    async backupUser(userId) {
        if (!this.dropboxClient) {
            throw new Error("Dropbox not configured");
        }

        const userResult = await this.db.query(
            `SELECT id, email, name, picture FROM users WHERE id = $1`,
            [userId]
        );

        if (userResult.rows.length === 0) {
            throw new Error("User not found");
        }

        await this.backupUserData(userResult.rows[0]);
    }
}

/**
 * Create and configure backup scheduler
 */
export function createBackupScheduler(db) {
    return new BackupScheduler(db);
}
