/**
 * Service Worker for Notes App
 */

const CACHE_NAME = "notes-app-v12";
const urlsToCache = [
  "/",
  "/static/app.js",
  "/static/styles/app.css",
  "/static/components/notes-app.js",
  "/static/components/note-editor.js",
  "/static/components/note-list.js",
  "/static/components/search-bar.js",
  "/static/components/tag-manager.js",
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
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Return cached version or fetch from network
        return response || fetch(event.request);
      }),
  );
});
