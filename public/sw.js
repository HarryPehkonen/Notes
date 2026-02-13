/**
 * Service Worker for Notes App
 */

const CACHE_NAME = "notes-app-v24";
const urlsToCache = [
  "/",
  "/static/app.js",
  "/static/styles/app.css",
  "/static/components/notes-app.js",
  "/static/components/note-editor.js",
  "/static/components/note-list.js",
  "/static/components/search-bar.js",
  "/static/components/tag-manager.js",
  "/static/utils/text.js",
  "/static/services/persistence.js",
  "/static/services/sync-manager.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
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
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request)),
    );
    return;
  }

  // For static assets, use cache-first strategy
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        return response || fetch(event.request);
      }),
  );
});
