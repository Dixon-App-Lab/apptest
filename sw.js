// Cache-first for everything. The whole app is a handful of static files plus a
// dataset that only changes when a new draw is added, so there is nothing here
// worth going to the network for first.
//
// Bump CACHE on every deploy: the version string is what evicts the old files.
const CACHE = 'freshdraw-d2608-1ebf6ea8';

const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './data/draws.json',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  event.respondWith(
    caches.match(request).then((hit) => {
      if (hit) return hit;

      return fetch(request)
        .then((response) => {
          // Only cache our own successful responses; opaque cross-origin ones
          // would fill the cache with entries we can't inspect.
          if (response.ok && new URL(request.url).origin === self.location.origin) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => {
          // Offline and not cached. For a navigation, the shell is better than
          // the browser's error page.
          if (request.mode === 'navigate') return caches.match('./index.html');
          return Response.error();
        });
    }),
  );
});
