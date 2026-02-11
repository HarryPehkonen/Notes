/**
 * Test setup - Mock browser APIs for Deno environment
 */

// Import fake-indexeddb to polyfill IndexedDB
import "npm:fake-indexeddb/auto";

// Mock navigator.onLine
Object.defineProperty(globalThis, "navigator", {
  value: {
    onLine: true,
  },
  writable: true,
  configurable: true,
});

// Mock globalThis event listeners (for online/offline events)
const globalListeners = new Map<string, Array<() => void>>();
(globalThis as unknown as { addEventListener: typeof addEventListener }).addEventListener = function (
  type: string,
  handler: () => void,
) {
  if (!globalListeners.has(type)) {
    globalListeners.set(type, []);
  }
  globalListeners.get(type)!.push(handler);
};
(globalThis as unknown as { removeEventListener: typeof removeEventListener }).removeEventListener = function (
  type: string,
  handler: () => void,
) {
  if (globalListeners.has(type)) {
    const handlers = globalListeners.get(type)!;
    const index = handlers.indexOf(handler);
    if (index > -1) {
      handlers.splice(index, 1);
    }
  }
};

// Mock CustomEvent if not available
if (typeof CustomEvent === "undefined") {
  (globalThis as unknown as { CustomEvent: typeof CustomEvent }).CustomEvent = class CustomEvent extends Event {
    detail: unknown;
    constructor(type: string, options: CustomEventInit = {}) {
      super(type, options);
      this.detail = options.detail || null;
    }
  } as typeof CustomEvent;
}

// Mock document for event dispatching
const documentListeners = new Map<string, Array<(e: Event) => void>>();
(globalThis as unknown as { document: Document }).document = {
  addEventListener(type: string, handler: (e: Event) => void) {
    if (!documentListeners.has(type)) {
      documentListeners.set(type, []);
    }
    documentListeners.get(type)!.push(handler);
  },
  removeEventListener(type: string, handler: (e: Event) => void) {
    if (documentListeners.has(type)) {
      const handlers = documentListeners.get(type)!;
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  },
  dispatchEvent(event: Event) {
    if (documentListeners.has(event.type)) {
      documentListeners.get(event.type)!.forEach((handler) => handler(event));
    }
    return true;
  },
} as unknown as Document;

// Mock NotesApp
(globalThis as unknown as { NotesApp: Record<string, unknown> }).NotesApp = {
  updateNote: async () => ({ data: { id: 1, title: "Test", content: "Test content" } }),
};

export { documentListeners, globalListeners };
