/**
 * Tests for the sync manager service
 * Run with: deno task test
 */

// Setup must be imported first to polyfill browser APIs
import "./setup.ts";

import { assertEquals, assertNotEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { persistence } from "../../public/services/persistence.js";
import { syncManager } from "../../public/services/sync-manager.js";

// deno-lint-ignore no-explicit-any
const g = globalThis as any;

// Helper to reset state between tests
async function resetState() {
  try {
    await persistence.clearAll();
  } catch (_e) {
    // Ignore if not initialized
  }
  persistence.db = null;
  persistence.initPromise = null;

  // Reset sync manager state
  syncManager.initialized = false;
  syncManager.pendingSaves = new Map();
  syncManager.activeSyncs = new Map();
  syncManager.isOnline = true;
  syncManager.state = "idle";

  // Reset mock NotesApp
  g.NotesApp = {
    updateNote: () =>
      Promise.resolve({
        data: {
          id: 1,
          title: "Saved",
          content: "Saved content",
          updated_at: new Date().toISOString(),
        },
      }),
  };
}

// Test options to disable sanitizers
const opts = { sanitizeOps: false, sanitizeResources: false };

// ==================== INITIALIZATION TESTS ====================

Deno.test({
  name: "SyncManager: should initialize successfully",
  ...opts,
  fn: async () => {
    await resetState();
    await syncManager.init();

    assertEquals(syncManager.initialized, true);

    await resetState();
  },
});

Deno.test({
  name: "SyncManager: should set online status",
  ...opts,
  fn: async () => {
    await resetState();
    await syncManager.init();

    assertEquals(syncManager.isOnline, true);

    await resetState();
  },
});

// ==================== SAVE NOTE TESTS ====================

Deno.test({
  name: "SyncManager: should save draft to IndexedDB",
  ...opts,
  fn: async () => {
    await resetState();
    await syncManager.init();

    // Make sync slow
    let resolveSync: () => void;
    g.NotesApp.updateNote = async () => {
      await new Promise<void>((resolve) => {
        resolveSync = resolve;
      });
      return { data: { id: "123" } };
    };

    const savePromise = syncManager.saveNote("123", {
      title: "Test",
      content: "Content",
      tags: [],
    });

    await new Promise((r) => setTimeout(r, 20));
    const draft = await persistence.getDraft("123");
    assertNotEquals(draft, null);
    assertEquals(draft!.title, "Test");

    resolveSync!();
    await savePromise;
    await resetState();
  },
});

Deno.test({
  name: "SyncManager: should call updateNote",
  ...opts,
  fn: async () => {
    await resetState();
    await syncManager.init();

    let called = false;
    g.NotesApp.updateNote = () => {
      called = true;
      return Promise.resolve({ data: { id: "456" } });
    };

    await syncManager.saveNote("456", { title: "Test", content: "Content", tags: [] });

    assertEquals(called, true);

    await resetState();
  },
});

Deno.test({
  name: "SyncManager: should clear draft after sync",
  ...opts,
  fn: async () => {
    await resetState();
    await syncManager.init();

    await syncManager.saveNote("789", { title: "Test", content: "Content", tags: [] });
    await new Promise((r) => setTimeout(r, 50));

    const draft = await persistence.getDraft("789");
    assertEquals(draft, null);

    await resetState();
  },
});

Deno.test({
  name: "SyncManager: should queue when offline",
  ...opts,
  fn: async () => {
    await resetState();
    await syncManager.init();
    syncManager.isOnline = false;

    const result = await syncManager.saveNote("111", { title: "Offline", content: "C", tags: [] });

    assertEquals(result.queued, true);

    const pending = await persistence.getPendingCount();
    assertNotEquals(pending, 0);

    await resetState();
  },
});

// ==================== WAIT FOR SYNC TESTS ====================

Deno.test({
  name: "SyncManager: waitForSync resolves immediately when idle",
  ...opts,
  fn: async () => {
    await resetState();
    await syncManager.init();

    const result = await syncManager.waitForSync(1000);
    assertEquals(result.success, true);

    await resetState();
  },
});

Deno.test({
  name: "SyncManager: waitForSync waits for active syncs",
  ...opts,
  fn: async () => {
    await resetState();
    await syncManager.init();

    g.NotesApp.updateNote = async () => {
      await new Promise((r) => setTimeout(r, 50));
      return { data: { id: 1 } };
    };

    const savePromise = syncManager.saveNote("333", { title: "Test", content: "C" });
    const waitPromise = syncManager.waitForSync(5000);

    const [, waitResult] = await Promise.all([savePromise, waitPromise]);

    assertEquals(waitResult.success, true);

    await resetState();
  },
});

// ==================== STATE MANAGEMENT TESTS ====================

Deno.test({
  name: "SyncManager: should report syncing state",
  ...opts,
  fn: async () => {
    await resetState();
    await syncManager.init();

    g.NotesApp.updateNote = async () => {
      await new Promise((r) => setTimeout(r, 100));
      return { data: { id: 1 } };
    };

    const savePromise = syncManager.saveNote("777", { title: "Test", content: "C" });

    await new Promise((r) => setTimeout(r, 10));
    assertEquals(syncManager.isSyncing(), true);

    await savePromise;
    await resetState();
  },
});

Deno.test({
  name: "SyncManager: should track pending count",
  ...opts,
  fn: async () => {
    await resetState();
    await syncManager.init();
    syncManager.isOnline = false;

    await syncManager.saveNote("888", { title: "Test 1", content: "C1" });
    await syncManager.saveNote("999", { title: "Test 2", content: "C2" });

    const count = await syncManager.getPendingCount();
    assertEquals(count, 2);

    await resetState();
  },
});

Deno.test({
  name: "SyncManager: should check hasUnsavedChanges",
  ...opts,
  fn: async () => {
    await resetState();
    await syncManager.init();
    syncManager.isOnline = false;

    await syncManager.saveNote("1010", { title: "Test", content: "C" });

    const hasChanges = await syncManager.hasUnsavedChanges("1010");
    assertEquals(hasChanges, true);

    await resetState();
  },
});

// ==================== EVENTS TESTS ====================

Deno.test({
  name: "SyncManager: should emit sync-draft-saved event",
  ...opts,
  fn: async () => {
    await resetState();
    await syncManager.init();

    let eventFired = false;
    const handler = () => {
      eventFired = true;
    };
    g.document.addEventListener("sync-draft-saved", handler);

    await syncManager.saveNote("1111", { title: "Test", content: "C" });
    await new Promise((r) => setTimeout(r, 10));

    assertEquals(eventFired, true);

    g.document.removeEventListener("sync-draft-saved", handler);
    await resetState();
  },
});

Deno.test({
  name: "SyncManager: should emit sync-completed event",
  ...opts,
  fn: async () => {
    await resetState();
    await syncManager.init();

    let eventFired = false;
    const handler = () => {
      eventFired = true;
    };
    g.document.addEventListener("sync-completed", handler);

    await syncManager.saveNote("1212", { title: "Test", content: "C" });
    await new Promise((r) => setTimeout(r, 100));

    assertEquals(eventFired, true);

    g.document.removeEventListener("sync-completed", handler);
    await resetState();
  },
});

Deno.test({
  name: "SyncManager: should emit sync-pending when offline",
  ...opts,
  fn: async () => {
    await resetState();
    await syncManager.init();
    syncManager.isOnline = false;

    let eventFired = false;
    const handler = () => {
      eventFired = true;
    };
    g.document.addEventListener("sync-pending", handler);

    await syncManager.saveNote("1313", { title: "Test", content: "C" });
    await new Promise((r) => setTimeout(r, 100));

    assertEquals(eventFired, true);

    g.document.removeEventListener("sync-pending", handler);
    await resetState();
  },
});
