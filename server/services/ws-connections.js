/**
 * WebSocket connection registry.
 * Tracks active WebSocket connections per user for live sync broadcasts.
 */

/** @type {Map<number, Set<WebSocket>>} */
const connections = new Map();

/**
 * Register a WebSocket connection for a user.
 */
export function addConnection(userId, ws) {
  if (!connections.has(userId)) {
    connections.set(userId, new Set());
  }
  connections.get(userId).add(ws);
}

/**
 * Remove a WebSocket connection for a user.
 */
export function removeConnection(userId, ws) {
  const userSet = connections.get(userId);
  if (!userSet) return;
  userSet.delete(ws);
  if (userSet.size === 0) {
    connections.delete(userId);
  }
}

/**
 * Broadcast a message to all of a user's connections, optionally
 * excluding one (e.g. the connection that triggered the update).
 */
export function broadcastToUser(userId, message, excludeWs = null) {
  const userSet = connections.get(userId);
  if (!userSet) return;

  const data = JSON.stringify(message);
  for (const ws of userSet) {
    if (ws !== excludeWs && ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  }
}

/**
 * Close and remove all connections. Called on server shutdown.
 */
export function closeAll() {
  for (const [_userId, userSet] of connections) {
    for (const ws of userSet) {
      try {
        ws.close(1001, "Server shutting down");
      } catch { /* ignore */ }
    }
  }
  connections.clear();
}
