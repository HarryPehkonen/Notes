/**
 * Service Worker for Notes App
 *
 * Strategy:
 * - API/auth routes: network-only (never cached)
 * - Root path (/): network-first (fresh auth state, fallback to cache offline)
 * - Static assets: stale-while-revalidate. The revalidate fetch goes through
 *   the browser's HTTP cache with `cache: "no-cache"`, so it sends
 *   If-None-Match and an unchanged file comes back as a 304 with no body.
 *   Bump CACHE_NAME with any public/ change.
 */

const CACHE_NAME = "notes-app-v20";

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

  // For the root path, use network-first to ensure fresh auth state.
  // `cache: "reload"` bypasses the browser's HTTP cache: these files carry their
  // own max-age, so trusting it is how a deploy stays invisible on a device.
  if (url.pathname === "/") {
    event.respondWith(
      fetch(event.request, { cache: "reload" })
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

  // Static assets: stale-while-revalidate. The revalidate fetch uses
  // `cache: "no-cache"`, which revalidates *through* the browser's HTTP cache:
  // the browser sends If-None-Match against the stored content-hash ETag and an
  // unchanged file comes back as a 304 with no body. `reload` would instead
  // skip the cache entirely and re-download the whole body every time - and a
  // plain fetch would let a day-long max-age hide a shipped change on a phone.
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.match(event.request).then((cached) => {
        const fetched = fetch(event.request, { cache: "no-cache" }).then((response) => {
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
