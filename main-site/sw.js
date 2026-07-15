const CACHE = "sgfw-v4";

const ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/manifest.json',
  '/favicon.ico',
  '/SGFW-main.png',
  '/SGFW-192.png',
  '/SGFW-512.png',
  'https://fonts.googleapis.com/css?family=Jua',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css',
  'https://use.fontawesome.com/releases/v6.5.2/js/all.js',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      // Cache each asset individually so one failed request (e.g. a CDN
      // hiccup) doesn't abort caching for every other asset like addAll() would.
      Promise.allSettled(
        ASSETS.map((url) =>
          fetch(url).then((res) => res.ok && cache.put(url, res))
        )
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
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

  // Cache-first for static assets
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request).then(res => {
      if (res.ok && event.request.method === 'GET') {
        const clone = res.clone();
        caches.open(CACHE).then(cache => cache.put(event.request, clone));
      }
      return res;
    }))
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