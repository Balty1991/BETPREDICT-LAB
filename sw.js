// BETPREDICT Service Worker — auto-update on deploy
const VERSION = 'bp-lab-final-menu-v1-20260529-1300';
const CACHE = `betpredict-${VERSION}`;

const SHELL = [
  './',
  './index.html',
  './assets/modern.css',
  './assets/betpredict_20.css',
  './assets/betpredict_20.js',
  './assets/betpredict_upgrade.css',
  './assets/betpredict_upgrade.js',
  './assets/safe_picks_ui.js',
  './assets/shared-utils.js',
  './assets/sanitize.js',
  './manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then(clients => clients.forEach(c => c.postMessage({ type: 'SW_UPDATED', version: VERSION })))
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.pathname.endsWith('/') || url.pathname.endsWith('.html')) {
    event.respondWith(
      fetch(req, { cache: 'no-store' })
        .then(res => {
          if (res.ok) caches.open(CACHE).then(c => c.put(req, res.clone()));
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  if (url.pathname.includes('/data/')) {
    event.respondWith(
      fetch(req, { cache: 'no-store' })
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(req, clone));
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(cached => {
      const networkUpdate = fetch(req, { cache: 'no-store' })
        .then(res => {
          if (res.ok) caches.open(CACHE).then(c => c.put(req, res.clone()));
          return res;
        })
        .catch(() => cached);
      return cached || networkUpdate;
    })
  );
});
