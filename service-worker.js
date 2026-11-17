/*
 * Service worker: offline-first.
 * - App shell: cache-first (aggiorna CACHE_VERSION quando modifichi HTML/CSS/JS).
 * - data/: network-first con fallback alla cache, così i nuovi dati arrivano appena sei online.
 */
const CACHE_VERSION = 'v2';
const CACHE = 'liste40k-' + CACHE_VERSION;
const SHELL = [
  './',
  './index.html',
  './css/style.css',
  './js/parser.js',
  './js/app.js',
  './manifest.json',
  './icons/icon.svg',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './data/datasheets.json',
  './data/lista-templari.txt'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('liste40k-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // link esterni (Wahapedia) non passano dalla cache

  if (url.pathname.includes('/data/')) {
    // network-first per i dati
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
          return res;
        })
        .catch(() => caches.match(req, { ignoreSearch: true }))
    );
    return;
  }

  // cache-first per l'app shell; le navigazioni ricadono su index.html
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(req).catch(() => (req.mode === 'navigate' ? caches.match('./index.html') : Response.error()));
    })
  );
});
