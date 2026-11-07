/* ============================================================
   sw.js — Offline Service Worker for Progress Companion
   Caches static assets for reliable offline daily tracking.
   ============================================================ */

const CACHE_NAME = 'progress-companion-merged-v14';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './content.js',
  './bodymap.js',
  './icon.svg',
  './manifest.webmanifest',
  './obsidian.css',
  './obsidian.js',
  './fixes.css',
  './v7.css',
  './tour.css',
  './tour.js'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(ASSETS);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.map(function (key) {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function (event) {
  if (event.request.method !== 'GET') return;
  // Ignore external font requests or analytics
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  // Network-first: fetch freshest from server when online, fall back to cache when offline
  event.respondWith(
    fetch(event.request).then(function (response) {
      if (response && response.status === 200 && response.type === 'basic') {
        var copy = response.clone();
        caches.open(CACHE_NAME).then(function (cache) {
          cache.put(event.request, copy);
        }).catch(function () {});
      }
      return response;
    }).catch(function () {
      return caches.match(event.request, { ignoreSearch: true }).then(function (cached) {
        if (cached) return cached;
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
        return new Response('', { status: 504, statusText: 'Offline' });
      });
    })
  );
});
