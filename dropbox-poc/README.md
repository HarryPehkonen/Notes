# Dropbox Integration Proof of Concept

This is a minimal proof-of-concept demonstrating Dropbox integration with Deno for the Notes application backup feature.

## Features Demonstrated

- ✅ Upload files to Dropbox
- ✅ Download files from Dropbox
- ✅ List folder contents
- ✅ Create folders
- ✅ Delete files
- ✅ JSON data backup/restore
- ✅ Content integrity verification

## Setup

### 1. Get a Dropbox Access Token

1. Go to [Dropbox App Console](https://www.dropbox.com/developers/apps)
2. Click "Create app"
3. Choose:
   - API: "Scoped access"
   - Access: "Full Dropbox" (or "App folder" for limited access)
   - Name: "Notes App Backup" (or your preferred name)
4. After creation, go to the "Permissions" tab and enable:
   - `files.metadata.write`
   - `files.metadata.read`
   - `files.content.write`
   - `files.content.read`
5. Go to "Settings" tab
6. Click "Generate" under "Generated access token"
7. Copy the token

### 2. Set Environment Variable

```bash
# Option 1: Export in terminal
export DROPBOX_ACCESS_TOKEN="your_token_here"

# Option 2: Create .env file
cp .env.example .env
# Edit .env and add your token
```

### 3. Run the Test

```bash
# Make sure you're in the dropbox-poc directory
cd dropbox-poc

# Run with environment variable
deno run --allow-net --allow-env test.js

# Or with .env file
deno run --allow-net --allow-env --allow-read test.js
```

## What the Test Does

1. **Verifies Token** - Confirms authentication works
2. **Creates Folder** - Makes a `/backup-test` folder
3. **Uploads Text File** - Saves a test file with timestamp
4. **Lists Files** - Shows folder contents
5. **Downloads File** - Retrieves the uploaded file
6. **Verifies Content** - Confirms data integrity
7. **Tests JSON Backup** - Simulates real backup data
8. **Parses JSON** - Confirms structured data works
9. **Cleans Up** - Deletes test files

## Expected Output

```
🚀 Starting Dropbox Integration Tests

📋 Test 1: Verifying access token...
✅ Token valid! Account: Your Name
   Email: your.email@example.com

📋 Test 2: Creating test folder...
✅ Created folder: /backup-test

📋 Test 3: Uploading test file...
✅ Uploaded file: /backup-test/test-1234567890.txt
   Size: 156 bytes

[... more test results ...]

✨ All tests passed successfully!
The Dropbox integration is working perfectly.
```

## Integration with Notes App

This proves we can implement:

### Automatic Backups
```javascript
// Backup all user notes
const backup = {
    notes: await getAllUserNotes(userId),
    timestamp: new Date().toISOString()
};

await dropboxClient.upload(
    `/notes-backup/user-${userId}/backup-${Date.now()}.json`,
    JSON.stringify(backup)
);
```

### Manual Restore
```javascript
// List available backups
const backups = await dropboxClient.listFolder(`/notes-backup/user-${userId}`);

// Download selected backup
const { content } = await dropboxClient.download(selectedBackup.path);
const data = JSON.parse(content);

// Restore notes
await restoreNotes(data.notes);
```

### Export as Markdown
```javascript
// Export each note as markdown
for (const note of notes) {
    await dropboxClient.upload(
        `/notes-export/${note.title}.md`,
        note.content
    );
}
```

## File Structure

- `dropbox-client.js` - Minimal Dropbox API wrapper
- `test.js` - Proof-of-concept test script
- `.env.example` - Environment variable template
- `README.md` - This file

## Security Notes

- **Never commit tokens** - Use environment variables
- **Use OAuth in production** - This POC uses access tokens for simplicity
- **Scope permissions** - Only request needed permissions
- **Token refresh** - Implement refresh for long-lived apps

## Next Steps

1. ✅ Basic API integration proven
2. ⬜ Implement OAuth flow for production
3. ⬜ Add to main Notes application
4. ⬜ Create backup scheduler
5. ⬜ Build restore UI

## Troubleshooting

### "Token verification failed"
- Check token is correctly set in environment
- Verify token hasn't expired
- Ensure token has required permissions

### "Upload failed: 409"
- File/folder already exists
- Use different name or delete existing

### "DROPBOX_ACCESS_TOKEN environment variable not set"
- Export the variable: `export DROPBOX_ACCESS_TOKEN="your_token"`
- Or create `.env` file with the token

## Resources

- [Dropbox API Documentation](https://www.dropbox.com/developers/documentation/http/documentation)
- [OAuth 2.0 Guide](https://www.dropbox.com/developers/documentation/http/documentation#oauth2)
- [API Explorer](https://dropbox.github.io/dropbox-api-v2-explorer/)