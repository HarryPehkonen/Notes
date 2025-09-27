/**
 * Minimal Dropbox API client for Deno
 * Uses direct HTTP API calls - no SDK needed
 */

/**
 * @typedef {Object} DropboxFile
 * @property {string} path - File path in Dropbox
 * @property {string} name - File name
 * @property {number} size - File size in bytes
 * @property {Date} modified - Last modified date
 */

/**
 * Simple Dropbox API client
 */
export class DropboxClient {
    /**
     * @param {string} accessToken - Dropbox access token
     */
    constructor(accessToken) {
        this.accessToken = accessToken;
        this.contentApiBase = 'https://content.dropboxapi.com/2';
        this.apiBase = 'https://api.dropboxapi.com/2';
    }

    /**
     * Upload a file to Dropbox
     * @param {string} path - Destination path in Dropbox (must start with /)
     * @param {string|Uint8Array} content - File content
     * @returns {Promise<Object>} Upload result
     */
    async upload(path, content) {
        const response = await fetch(`${this.contentApiBase}/files/upload`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.accessToken}`,
                'Content-Type': 'application/octet-stream',
                'Dropbox-API-Arg': JSON.stringify({
                    path: path,
                    mode: 'overwrite',
                    autorename: false,
                    mute: false
                })
            },
            body: content
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Upload failed: ${response.status} - ${error}`);
        }

        return await response.json();
    }

    /**
     * Download a file from Dropbox
     * @param {string} path - File path in Dropbox
     * @returns {Promise<{content: string, metadata: Object}>} File content and metadata
     */
    async download(path) {
        const response = await fetch(`${this.contentApiBase}/files/download`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.accessToken}`,
                'Dropbox-API-Arg': JSON.stringify({
                    path: path
                })
            }
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Download failed: ${response.status} - ${error}`);
        }

        // Dropbox returns metadata in response header
        const metadataHeader = response.headers.get('dropbox-api-result');
        const metadata = metadataHeader ? JSON.parse(metadataHeader) : {};

        const content = await response.text();

        return { content, metadata };
    }

    /**
     * List files in a folder
     * @param {string} path - Folder path in Dropbox (empty string for root)
     * @returns {Promise<DropboxFile[]>} List of files
     */
    async listFolder(path = '') {
        const response = await fetch(`${this.apiBase}/files/list_folder`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                path: path,
                recursive: false,
                include_media_info: false,
                include_deleted: false,
                include_has_explicit_shared_members: false
            })
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`List folder failed: ${response.status} - ${error}`);
        }

        const data = await response.json();

        // Transform to simpler format
        return data.entries.map(entry => ({
            path: entry.path_display,
            name: entry.name,
            size: entry.size || 0,
            modified: entry.client_modified ? new Date(entry.client_modified) : null,
            isFolder: entry['.tag'] === 'folder'
        }));
    }

    /**
     * Delete a file or folder
     * @param {string} path - Path to delete
     * @returns {Promise<Object>} Deletion result
     */
    async delete(path) {
        const response = await fetch(`${this.apiBase}/files/delete_v2`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                path: path
            })
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Delete failed: ${response.status} - ${error}`);
        }

        return await response.json();
    }

    /**
     * Create a folder
     * @param {string} path - Folder path to create
     * @returns {Promise<Object>} Creation result
     */
    async createFolder(path) {
        const response = await fetch(`${this.apiBase}/files/create_folder_v2`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                path: path,
                autorename: false
            })
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Create folder failed: ${response.status} - ${error}`);
        }

        return await response.json();
    }

    /**
     * Check if the access token is valid
     * @returns {Promise<Object>} Account info if valid
     */
    async verifyToken() {
        const response = await fetch(`${this.apiBase}/users/get_current_account`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.accessToken}`,
                'Content-Type': 'application/json'
            },
            body: 'null'
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Token verification failed: ${response.status} - ${error}`);
        }

        return await response.json();
    }
}

/**
 * Helper function to create client from environment
 * @returns {DropboxClient}
 */
export function createClientFromEnv() {
    const token = Deno.env.get('DROPBOX_ACCESS_TOKEN');
    if (!token) {
        throw new Error('DROPBOX_ACCESS_TOKEN environment variable not set');
    }
    return new DropboxClient(token);
}
