/**
 * Fast Track service worker — KILL SWITCH (2026-06-06)
 *
 * The app no longer uses a service worker. State and assets are served live
 * (manifold-first: nothing is precached or shadow-served, so a deploy is
 * always what the browser runs). Nothing in the codebase registers this
 * worker anymore — but a previously-registered worker keeps running and
 * serving its stale precache until it is explicitly evicted, which is what
 * caused old builds to keep loading after a deploy.
 *
 * This file replaces the old caching worker with one whose only job is to
 * remove itself: on activate it deletes every cache, unregisters itself, and
 * reloads any open page so it immediately picks up live files. Because the
 * browser byte-compares sw.js on navigation, any client still holding the old
 * worker will install this one on its next load and self-evict for good.
 */

self.addEventListener('install', () => {
  // Take over from the old worker as soon as possible.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // 1) Drop every cache this origin accumulated under the old worker.
    try {
      const names = await caches.keys();
      await Promise.all(names.map((n) => caches.delete(n)));
    } catch (_) { /* ignore */ }
    // 2) Unregister self — nothing re-registers, so this is permanent.
    try {
      await self.registration.unregister();
    } catch (_) { /* ignore */ }
    // 3) Reload open pages so they re-fetch live (now uncontrolled) files.
    try {
      const windows = await self.clients.matchAll({ type: 'window' });
      for (const client of windows) {
        try { client.navigate(client.url); } catch (_) { /* ignore */ }
      }
    } catch (_) { /* ignore */ }
  })());
});

// While winding down, never serve from cache — always go to the network so a
// page loading under this worker gets live files.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(fetch(event.request));
});
