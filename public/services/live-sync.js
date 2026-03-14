/**
 * Live Sync - WebSocket client for real-time note updates.
 *
 * Connects to /ws, receives broadcast messages when notes are updated
 * by other tabs/devices, and emits events for the UI to react.
 * Auto-reconnects with exponential backoff on disconnect.
 */

class LiveSync {
  constructor() {
    this.ws = null;
    this.reconnectAttempt = 0;
    this.maxReconnectDelay = 30000;
    this.baseDelay = 1000;
    this.reconnectTimer = null;
    this._handlers = new Map();
    this._hasConnectedBefore = false;
  }

  connect() {
    if (this.ws) return;

    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${location.host}/ws`;

    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      const isReconnect = this._hasConnectedBefore;
      this._hasConnectedBefore = true;
      this.reconnectAttempt = 0;
      this._emit("connected");
      if (isReconnect) {
        this._emit("reconnected");
      }
    };

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === "ping") return; // ignore keepalive
        this._emit(message.type, message);
      } catch (e) {
        console.error("LiveSync: invalid message", e);
      }
    };

    this.ws.onclose = (event) => {
      this.ws = null;
      if (event.code !== 1000) {
        this._scheduleReconnect();
      }
    };

    this.ws.onerror = () => {
      // onclose fires after this
    };
  }

  _scheduleReconnect() {
    const delay = Math.min(
      this.baseDelay * Math.pow(2, this.reconnectAttempt),
      this.maxReconnectDelay,
    );
    this.reconnectAttempt++;
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  on(type, callback) {
    if (!this._handlers.has(type)) {
      this._handlers.set(type, new Set());
    }
    this._handlers.get(type).add(callback);
  }

  off(type, callback) {
    const set = this._handlers.get(type);
    if (set) set.delete(callback);
  }

  _emit(type, data) {
    const set = this._handlers.get(type);
    if (!set) return;
    for (const cb of set) {
      try {
        cb(data);
      } catch (e) {
        console.error("LiveSync handler error:", e);
      }
    }
  }

  disconnect() {
    clearTimeout(this.reconnectTimer);
    if (this.ws) {
      this.ws.close(1000);
      this.ws = null;
    }
  }
}

export const liveSync = new LiveSync();
