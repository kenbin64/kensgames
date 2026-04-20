/**
 * Fast Track PWA Service Worker
 * NETWORK-FIRST for everything — cache is ONLY an offline fallback
 */

const CACHE_NAME = 'fasttrack-v3.2.1-local-libs';
const PRECACHE_URLS = [
  '/fasttrack/3d.html',
  '/assets/masterImageFile/icon.svg',
  '/assets/masterImageFile/icon.svg',
  '/fasttrack/assets/images/icon-512.png',
  '/fasttrack/manifest.json',
  // Three.js and OrbitControls are now served from /lib/ — no CDN dependency
  '/lib/three/three.min.js',
  '/lib/three/OrbitControls.js'
];

// Install — precache a small shell, then take over immediately
self.addEventListener('install', (event) => {
  console.log('[SW] Install v3 — network-first');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS.filter(u => !u.startsWith('http'))))
      .then(() => self.skipWaiting())
  );
});

// Activate — purge old caches only; do NOT claim() existing clients.
// clients.claim() would hijack any page that's mid-load under the old (or no)
// SW, causing the "void" blank-screen bug. Pages opened after this SW
// activates will be controlled automatically; existing pages stay as-is until
// they navigate or reload.
self.addEventListener('activate', (event) => {
  console.log('[SW] Activate v3 — no clients.claim() to avoid void-reset');
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter(n => n !== CACHE_NAME).map(n => {
        console.log('[SW] Purging old cache:', n);
        return caches.delete(n);
      }))
    )
  );
});

// Fetch — ALWAYS try network first, cache result, fall back to cache only when offline
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (event.request.url.includes('/ws')) return;

  // All third-party libraries (Three.js, Chart.js, jQuery, Bootstrap, Font Awesome)
  // are now served locally from /lib/ — no external CDN requests to intercept.
  // Only cache same-origin requests.
  const url = event.request.url;

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            if (url.startsWith(self.location.origin)) {
              cache.put(event.request, clone);
            }
          });
        }
        return networkResponse;
      })
      .catch(() =>
        caches.match(event.request)
          .then((cached) => cached || caches.match('/fasttrack/3d.html'))
      )
  );
});

// Background sync for game state (if supported)
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-game-state') {
    console.log('[ServiceWorker] Syncing game state');
    // Could sync saved game state when back online
  }
});

// Push notifications for multiplayer
self.addEventListener('push', (event) => {
  if (!event.data) return;

  const data = event.data.json();
  const options = {
    body: data.body || 'Your turn!',
    icon: '/assets/masterImageFile/icon.svg',
    badge: '/fasttrack/assets/images/icon-72.png',
    vibrate: [200, 100, 200],
    data: { url: data.url || '/fasttrack/mobile.html' },
    actions: [
      { action: 'play', title: 'Play Now', icon: '/fasttrack/assets/images/icon-72.png' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Fast Track', options)
  );
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = event.notification.data?.url || '/fasttrack/mobile.html';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        // Focus existing window if open
        for (const client of windowClients) {
          if (client.url.includes('/fasttrack/') && 'focus' in client) {
            return client.focus();
          }
        }
        // Open new window
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
  );
});
