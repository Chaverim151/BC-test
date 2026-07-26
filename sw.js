// sw.js — minimal service worker for Chaverim Bergen County Dispatch.
//
// Purpose: satisfy PWA installability requirements (Chrome/Android require a
// service worker with a fetch handler before showing the install prompt) and
// cache the static app shell (index.html) so it loads instantly on repeat
// visits, even on a flaky connection.
//
// This deliberately does NOT cache or intercept:
//   - Firebase (call numbers, colors, makes/models)
//   - Google Maps / Places
//   - The EZ Spare, Telzio, and i911 proxy workers
// Those always need live data, so they're left to hit the network normally.
//
// v2: the navigation fetch now explicitly bypasses the browser's own HTTP
// cache (`cache: 'no-store'`) — previously a plain fetch() could be quietly
// satisfied by the browser's disk cache instead of actually hitting the
// network, so a freshly-deployed index.html could sit unseen behind a stale
// cached copy even though this worker "successfully" re-fetched it. The
// cache name is also bumped so the old (possibly stale) cached shell from
// v1 gets purged on activate instead of lingering.

const CACHE_NAME = 'bc-dispatch-shell-v2';
const SHELL_URL = './index.html';

self.addEventListener('install', function (event) {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.add(new Request(SHELL_URL, { cache: 'no-store' })).catch(function () {
        // Ignore — e.g. if install happens while offline
      });
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys
          .filter(function (key) { return key !== CACHE_NAME; })
          .map(function (key) { return caches.delete(key); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function (event) {
  var url = new URL(event.request.url);

  // Only handle same-origin page navigations for the app shell.
  // Everything else (API calls, images, fonts, etc.) is left to the browser's
  // normal network fetch — we don't want to shadow or cache live dispatch data.
  if (event.request.mode === 'navigate' && url.origin === self.location.origin) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .then(function (response) {
          // Keep the cached shell fresh whenever we do get a live copy
          var responseClone = response.clone();
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put(SHELL_URL, responseClone);
          });
          return response;
        })
        .catch(function () {
          // Offline / network failure — fall back to the cached shell so the
          // form at least opens; live data (Firebase, Maps) still won't load.
          return caches.match(SHELL_URL);
        })
    );
  }
});

