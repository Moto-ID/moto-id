// Moto ID — minimal service worker.
//
// This app is almost entirely dynamic and personal (account data, vehicle
// records, payment status), so this worker is deliberately conservative:
// it never caches pages or POST requests, only the static, rarely-changing
// files under /media/ (icons, the plate photo/video). Its main job is to
// satisfy the browser's installability requirements (a registered service
// worker is required for Chrome/Android's "Add to Home Screen" / install
// prompt) and to show a friendly offline page instead of the browser's
// default error when there's genuinely no connection.

const CACHE_NAME = "moto-id-static-v1";
const PRECACHE_URLS = [
  "/offline.html",
  "/media/icons/icon-192.png",
  "/media/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Never intercept non-GET requests (logins, checkout, form posts, the
  // Stripe webhook) - those must always hit the network for real.
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Static, rarely-changing media: cache-first, refreshing the cache in the
  // background from the network.
  if (url.pathname.startsWith("/media/")) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req)
          .then((res) => {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  // Full-page navigations: always try the network first (this is where
  // account balances, credits and vehicle data live), and only fall back to
  // the offline page if the network is genuinely unreachable.
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match("/offline.html")));
  }

  // Everything else (API-style POSTs are already excluded above; this
  // covers any other GET such as document/photo downloads) passes straight
  // through to the network untouched.
});
