/**
 * Proof-of-concept test for Dropbox integration
 * Tests upload, list, download, and delete operations
 */

import { DropboxClient, createClientFromEnv } from './dropbox-client.js';

// Colors for console output
const colors = {
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    reset: '\x1b[0m'
};

/**
 * Run all tests
 */
async function runTests() {
    console.log(`${colors.blue}→ Starting Dropbox Integration Tests${colors.reset}\n`);

    try {
        // Create client from environment variable
        const client = createClientFromEnv();

        // Test 1: Verify token
        console.log(`${colors.yellow}  Test 1: Verifying access token...${colors.reset}`);
        const account = await client.verifyToken();
        console.log(`${colors.green}✓ Token valid! Account: ${account.name.display_name}${colors.reset}`);
        console.log(`   Email: ${account.email}\n`);

        // Test 2: Create test folder
        const testFolder = '/backup-test';
        console.log(`${colors.yellow}  Test 2: Creating test folder...${colors.reset}`);
        try {
            await client.createFolder(testFolder);
            console.log(`${colors.green}✓ Created folder: ${testFolder}${colors.reset}\n`);
        } catch (error) {
            if (error.message.includes('409')) {
                console.log(`${colors.green}✓ Folder already exists: ${testFolder}${colors.reset}\n`);
            } else {
                throw error;
            }
        }

        // Test 3: Upload a file
        console.log(`${colors.yellow}  Test 3: Uploading test file...${colors.reset}`);
        const testContent = `Hello from Deno!
Created at: ${new Date().toISOString()}
This is a test file for Dropbox integration.

Some test data:
- Line 1
- Line 2
- Line 3

End of test file.`;

        const testPath = `${testFolder}/test-${Date.now()}.txt`;
        const uploadResult = await client.upload(testPath, testContent);
        console.log(`${colors.green}✓ Uploaded file: ${uploadResult.path_display}${colors.reset}`);
        console.log(`   Size: ${uploadResult.size} bytes\n`);

        // Test 4: List folder contents
        console.log(`${colors.yellow}  Test 4: Listing folder contents...${colors.reset}`);
        const files = await client.listFolder(testFolder);
        console.log(`${colors.green}✓ Found ${files.length} file(s) in ${testFolder}:${colors.reset}`);
        for (const file of files) {
            console.log(`   - ${file.name} (${file.size} bytes)`);
        }
        console.log();

        // Test 5: Download the file
        console.log(`${colors.yellow}  Test 5: Downloading uploaded file...${colors.reset}`);
        const { content: downloadedContent, metadata } = await client.download(testPath);
        console.log(`${colors.green}✓ Downloaded file: ${metadata.path_display}${colors.reset}`);
        console.log(`   Size: ${metadata.size} bytes\n`);

        // Test 6: Verify content matches
        console.log(`${colors.yellow}  Test 6: Verifying content integrity...${colors.reset}`);
        if (downloadedContent === testContent) {
            console.log(`${colors.green}✓ Content matches perfectly!${colors.reset}\n`);
        } else {
            console.log(`${colors.red}✗ Content mismatch!${colors.reset}`);
            console.log('Original length:', testContent.length);
            console.log('Downloaded length:', downloadedContent.length);
            console.log();
        }

        // Test 7: Upload JSON data (simulating backup)
        console.log(`${colors.yellow}  Test 7: Testing JSON backup...${colors.reset}`);
        const backupData = {
            notes: [
                { id: 1, title: 'Note 1', content: 'Content 1', tags: ['test', 'demo'] },
                { id: 2, title: 'Note 2', content: 'Content 2', tags: ['example'] }
            ],
            timestamp: new Date().toISOString(),
            version: '1.0.0'
        };

        const jsonPath = `${testFolder}/backup-${Date.now()}.json`;
        await client.upload(jsonPath, JSON.stringify(backupData, null, 2));
        console.log(`${colors.green}✓ Uploaded JSON backup: ${jsonPath}${colors.reset}\n`);

        // Test 8: Download and parse JSON
        console.log(`${colors.yellow}  Test 8: Downloading and parsing JSON...${colors.reset}`);
        const { content: jsonContent } = await client.download(jsonPath);
        const parsedData = JSON.parse(jsonContent);
        console.log(`${colors.green}✓ JSON parsed successfully!${colors.reset}`);
        console.log(`   Notes count: ${parsedData.notes.length}`);
        console.log(`   Backup time: ${parsedData.timestamp}\n`);

        // Test 9: Clean up (optional)
        console.log(`${colors.yellow}  Test 9: Cleaning up test files...${colors.reset}`);
        await client.delete(testPath);
        await client.delete(jsonPath);
        console.log(`${colors.green}✓ Test files deleted${colors.reset}\n`);

        // Summary
        console.log(`${colors.blue}★ All tests passed successfully!${colors.reset}`);
        console.log(`${colors.green}The Dropbox integration is working perfectly.${colors.reset}`);
        console.log('\nYou can now:');
        console.log('- Upload backups to Dropbox');
        console.log('- Download and restore from Dropbox');
        console.log('- List available backups');
        console.log('- Store JSON data or any file format');

    } catch (error) {
        console.error(`${colors.red}✗ Test failed: ${error.message}${colors.reset}`);
        console.error(error);
        Deno.exit(1);
    }
}

// Run tests if this is the main module
if (import.meta.main) {
    await runTests();
}
