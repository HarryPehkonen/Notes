/**
 * Service Worker for Notes App
 */

const CACHE_NAME = 'notes-app-v1';
const urlsToCache = [
    '/',
    '/static/app.js',
    '/static/styles/app.css',
    '/static/components/notes-app.js',
    '/static/components/note-editor.js',
    '/static/components/note-list.js',
    '/static/components/search-bar.js',
    '/static/components/tag-manager.js'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(urlsToCache))
    );
});

self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                // Return cached version or fetch from network
                return response || fetch(event.request);
            })
    );
});
