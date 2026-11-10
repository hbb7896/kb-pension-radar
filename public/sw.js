const CACHE_NAME = 'kb-pension-etf-v2';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './kb-etf.html',
  './kb-etf.css',
  './kb-etf.js',
  './kb-etf-data.js',
  './manifest-kb.json',
  './style.css',
  './app.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const cloned = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned));
        return res;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match('./kb-etf.html')))
  );
});
