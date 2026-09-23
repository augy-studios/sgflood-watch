// Bump on every change to anything this worker serves. The browser only sees
// an update when this file's bytes change, so a deploy that leaves VERSION
// alone never reaches anyone with the site already installed.
const VERSION = "v8";
const CACHE = `sgfw-${VERSION}`;

const ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/js/theme.js',
  '/js/icons.js',
  '/js/ui.js',
  '/js/sw-register.js',
  '/manifest.json',
  '/favicon.ico',
  '/SGFW-main.png',
  '/SGFW-192.png',
  '/SGFW-512.png',
  'https://fonts.googleapis.com/css2?family=Jua&display=swap',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
];

// A new worker installs and then waits. It never promotes itself: no
// skipWaiting() here and no clients.claim() in activate. The only thing that
// swaps versions is somebody pressing Reload on the update bar, which posts
// 'skip-waiting' to the message handler below.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      // Cache each asset individually so one failed request (e.g. a CDN
      // hiccup) doesn't abort caching for every other asset like addAll() would.
      // 'reload' skips the HTTP cache, so the new version precaches the files
      // just deployed rather than whatever the browser still had lying around.
      Promise.allSettled(
        ASSETS.map((url) =>
          fetch(url, { cache: 'reload' }).then((res) => res.ok && cache.put(url, res))
        )
      )
    )
  );
});

// Only runs once nothing is on the old version: every tab closed, or the
// reader accepted the update, so deleting the old cache strands nobody.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))
      )
    )
  );
});

self.addEventListener('message', (event) => {
  const type = typeof event.data === 'string' ? event.data : event.data?.type;

  // The only place either of these is ever called.
  if (type === 'skip-waiting') {
    event.waitUntil(self.skipWaiting().then(() => self.clients.claim()));
  }
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Network-first for API calls
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() => new Response(JSON.stringify({
        ok: false,
        error: 'offline',
        alerts: []
      }), {
        headers: {
          'Content-Type': 'application/json'
        }
      }))
    );
    return;
  }

  // Let all other cross-origin requests (e.g. Nominatim geocoding) go straight
  // to the network untouched, only proxy same-origin requests and the
  // whitelisted third-party assets we actually want to cache.
  if (url.origin !== self.location.origin && !ASSETS.includes(event.request.url)) {
    return;
  }

  // Cache-first for static assets. Matched against this worker's own cache,
  // not caches.match() across all of them: while a new version waits, its
  // cache already exists, and the page on screen must keep getting the files
  // it booted with rather than a mix of old and new.
  event.respondWith(
    caches.open(CACHE).then(cache => cache.match(event.request).then(cached => cached || fetch(event.request).then(res => {
      if (res.ok && event.request.method === 'GET') {
        cache.put(event.request, res.clone());
      }
      return res;
    }).catch(err => {
      // Offline and not cached, e.g. the start URL with a query string on it.
      // A page navigation still gets the app shell rather than the browser's
      // offline error.
      if (event.request.mode === 'navigate') {
        return cache.match('/').then(shell => shell || Promise.reject(err));
      }
      throw err;
    })))
  );
});

// Push notifications
self.addEventListener('push', event => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || 'SG Flood Watch', {
      body: data.body || 'A new flood alert has been issued.',
      icon: '/SGFW-192.png',
      badge: '/SGFW-192.png',
      tag: 'flood-alert',
      renotify: true,
      data: {
        url: data.url || '/'
      }
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(clients.openWindow(url));
});