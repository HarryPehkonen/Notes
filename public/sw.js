/**
 * Service Worker for Notes App
 *
 * Strategy:
 * - API/auth routes: network-only (never cached)
 * - Root path (/): network-first (fresh auth state, fallback to cache offline)
 * - Static assets: stale-while-revalidate (instant from cache, background
 *   refresh keeps assets fresh without manual cache version bumping)
 */

const CACHE_NAME = "notes-app-v3";

self.addEventListener("install", (event) => {
  // Skip waiting so the new SW activates immediately
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  // Clean up old versioned caches from previous SW strategy
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        }),
      );
    }).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Never cache API, auth, or health routes - always go to network
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/auth/") ||
    url.pathname === "/health"
  ) {
    event.respondWith(fetch(event.request));
    return;
  }

  // For the root path, use network-first to ensure fresh auth state
  if (url.pathname === "/") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request)),
    );
    return;
  }

  // Static assets: stale-while-revalidate
  // Serve instantly from cache, then fetch in the background to update the
  // cache for next load. No manual version bumping needed — the server's
  // ETag ensures the background fetch is cheap (304) when nothing changed.
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.match(event.request).then((cached) => {
        const fetched = fetch(event.request).then((response) => {
          if (response.ok) {
            cache.put(event.request, response.clone());
          }
          return response;
        });

        return cached || fetched;
      });
    }),
  );
});
