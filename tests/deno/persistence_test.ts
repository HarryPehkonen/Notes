/**
 * Tests for the persistence service (IndexedDB operations)
 * Run with: deno task test
 */

// Setup must be imported first to polyfill IndexedDB
import "./setup.ts";

import { assertEquals, assertNotEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { persistence } from "../../public/services/persistence.js";

// Helper to reset persistence between tests
async function resetPersistence() {
  try {
    await persistence.clearAll();
  } catch (_e) {
    // Ignore if not initialized
  }
  persistence.db = null;
  persistence.initPromise = null;
}

// Test options to disable sanitizers (fake-indexeddb uses timers internally)
const opts = { sanitizeOps: false, sanitizeResources: false };

// ==================== DRAFTS TESTS ====================

Deno.test({
  name: "Drafts: should save and retrieve a draft",
  ...opts,
  fn: async () => {
    await resetPersistence();
    await persistence.init();

    const noteId = "123";
    const data = { title: "Test Note", content: "Test content", tags: [1, 2] };

    await persistence.saveDraft(noteId, data);
    const retrieved = await persistence.getDraft(noteId);

    assertNotEquals(retrieved, null);
    assertEquals(retrieved!.noteId, noteId);
    assertEquals(retrieved!.title, data.title);
    assertEquals(retrieved!.content, data.content);

    await resetPersistence();
  },
});

Deno.test({
  name: "Drafts: should return null for non-existent draft",
  ...opts,
  fn: async () => {
    await resetPersistence();
    await persistence.init();

    const retrieved = await persistence.getDraft("nonexistent");
    assertEquals(retrieved, null);

    await resetPersistence();
  },
});

Deno.test({
  name: "Drafts: should clear a draft",
  ...opts,
  fn: async () => {
    await resetPersistence();
    await persistence.init();

    await persistence.saveDraft("456", { title: "Test", content: "Content" });
    await persistence.clearDraft("456");
    const retrieved = await persistence.getDraft("456");

    assertEquals(retrieved, null);

    await resetPersistence();
  },
});

Deno.test({
  name: "Drafts: should get all drafts",
  ...opts,
  fn: async () => {
    await resetPersistence();
    await persistence.init();

    await persistence.saveDraft("1", { title: "Note 1", content: "Content 1" });
    await persistence.saveDraft("2", { title: "Note 2", content: "Content 2" });
    await persistence.saveDraft("3", { title: "Note 3", content: "Content 3" });

    const allDrafts = await persistence.getAllDrafts();

    assertEquals(allDrafts.length, 3);

    await resetPersistence();
  },
});

Deno.test({
  name: "Drafts: should update existing draft on re-save",
  ...opts,
  fn: async () => {
    await resetPersistence();
    await persistence.init();

    await persistence.saveDraft("789", { title: "Original", content: "Original content" });
    await persistence.saveDraft("789", { title: "Updated", content: "Updated content" });

    const retrieved = await persistence.getDraft("789");

    assertEquals(retrieved!.title, "Updated");
    assertEquals(retrieved!.content, "Updated content");

    await resetPersistence();
  },
});

Deno.test({
  name: "Drafts: should track server updated_at",
  ...opts,
  fn: async () => {
    await resetPersistence();
    await persistence.init();

    const serverTime = "2024-01-01T12:00:00Z";
    await persistence.saveDraft("999", { title: "Test", content: "Content" }, serverTime);
    const retrieved = await persistence.getDraft("999");

    assertEquals(retrieved!.serverUpdatedAt, serverTime);

    await resetPersistence();
  },
});

Deno.test({
  name: "Drafts: should detect draft newer than server",
  ...opts,
  fn: async () => {
    await resetPersistence();
    await persistence.init();

    await persistence.saveDraft("111", { title: "Test", content: "Content" });
    const isNewer = await persistence.hasDraftNewerThan("111", "2020-01-01T00:00:00Z");

    assertEquals(isNewer, true);

    await resetPersistence();
  },
});

Deno.test({
  name: "Drafts: should detect draft not newer than server",
  ...opts,
  fn: async () => {
    await resetPersistence();
    await persistence.init();

    await persistence.saveDraft("222", { title: "Test", content: "Content" });
    const isNewer = await persistence.hasDraftNewerThan("222", "2099-01-01T00:00:00Z");

    assertEquals(isNewer, false);

    await resetPersistence();
  },
});

// ==================== PENDING OPERATIONS TESTS ====================

Deno.test({
  name: "Pending: should queue an operation",
  ...opts,
  fn: async () => {
    await resetPersistence();
    await persistence.init();

    const id = await persistence.queueOperation({
      type: "update",
      noteId: "123",
      data: { title: "Test", content: "Content" },
    });

    assertNotEquals(id, undefined);
    assertEquals(typeof id, "number");

    await resetPersistence();
  },
});

Deno.test({
  name: "Pending: should retrieve pending operations",
  ...opts,
  fn: async () => {
    await resetPersistence();
    await persistence.init();

    await persistence.queueOperation({ type: "update", noteId: "1", data: {} });
    await persistence.queueOperation({ type: "update", noteId: "2", data: {} });

    const pending = await persistence.getPendingOperations();

    assertEquals(pending.length, 2);

    await resetPersistence();
  },
});

Deno.test({
  name: "Pending: should get pending for specific note",
  ...opts,
  fn: async () => {
    await resetPersistence();
    await persistence.init();

    await persistence.queueOperation({ type: "update", noteId: "1", data: {} });
    await persistence.queueOperation({ type: "update", noteId: "2", data: {} });
    await persistence.queueOperation({ type: "update", noteId: "1", data: {} });

    const pending = await persistence.getPendingForNote("1");

    assertEquals(pending.length, 2);

    await resetPersistence();
  },
});

Deno.test({
  name: "Pending: should remove an operation",
  ...opts,
  fn: async () => {
    await resetPersistence();
    await persistence.init();

    const id = await persistence.queueOperation({ type: "update", noteId: "1", data: {} });
    await persistence.removeOperation(id);
    const pending = await persistence.getPendingOperations();

    assertEquals(pending.length, 0);

    await resetPersistence();
  },
});

Deno.test({
  name: "Pending: should clear all pending for a note",
  ...opts,
  fn: async () => {
    await resetPersistence();
    await persistence.init();

    await persistence.queueOperation({ type: "update", noteId: "1", data: {} });
    await persistence.queueOperation({ type: "update", noteId: "1", data: {} });
    await persistence.queueOperation({ type: "update", noteId: "2", data: {} });

    await persistence.clearPendingForNote("1");

    const pending = await persistence.getPendingOperations();
    assertEquals(pending.length, 1);
    assertEquals(pending[0].noteId, "2");

    await resetPersistence();
  },
});

Deno.test({
  name: "Pending: should get pending count",
  ...opts,
  fn: async () => {
    await resetPersistence();
    await persistence.init();

    await persistence.queueOperation({ type: "update", noteId: "1", data: {} });
    await persistence.queueOperation({ type: "update", noteId: "2", data: {} });

    const count = await persistence.getPendingCount();

    assertEquals(count, 2);

    await resetPersistence();
  },
});

Deno.test({
  name: "Pending: should update an operation",
  ...opts,
  fn: async () => {
    await resetPersistence();
    await persistence.init();

    const id = await persistence.queueOperation({ type: "update", noteId: "1", data: {} });
    await persistence.updateOperation(id, { retryCount: 3, lastError: "Network error" });

    const pending = await persistence.getPendingOperations();
    assertEquals(pending[0].retryCount, 3);
    assertEquals(pending[0].lastError, "Network error");

    await resetPersistence();
  },
});

// ==================== CLEANUP TESTS ====================

Deno.test({
  name: "Cleanup: should clear all data",
  ...opts,
  fn: async () => {
    await resetPersistence();
    await persistence.init();

    await persistence.saveDraft("1", { title: "Test", content: "Content" });
    await persistence.queueOperation({ type: "update", noteId: "1", data: {} });

    await persistence.clearAll();

    const drafts = await persistence.getAllDrafts();
    const pending = await persistence.getPendingOperations();

    assertEquals(drafts.length, 0);
    assertEquals(pending.length, 0);

    await resetPersistence();
  },
});
