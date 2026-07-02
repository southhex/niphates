// Minimal but solid service worker: precache the app shell for offline launch,
// serve navigations network-first (so updates land), serve Next's content-hashed
// build output cache-first, and never cache API calls, redirects, or error
// responses. Bump CACHE whenever this file's caching behavior changes — the old
// cache is then dropped on activate.
//
// Note: browsers only register a service worker in a secure context (HTTPS or
// localhost). Served over plain HTTP on a LAN IP this file never runs, so the
// app has no offline support there — see README.

const CACHE = "niphates-v4";
const APP_SHELL = ["/", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)).catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

// Only Next's content-hashed, immutable build output and static PWA assets are
// safe to serve cache-first. Everything else (HTML routes, RSC payloads, other
// dynamic responses) is left to the network so a stale entry can't be pinned.
function isImmutableAsset(url) {
  return (
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/_next/static/") ||
      url.pathname.startsWith("/icons/") ||
      url.pathname === "/manifest.webmanifest")
  );
}

// A response is only worth caching if it actually succeeded and is a plain
// same-origin response. Caching a non-2xx (e.g. the unstyled error page),
// opaque, or redirected response would let it replay as a broken page later.
function isCacheable(res) {
  return Boolean(res && res.ok && res.type === "basic" && !res.redirected);
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Never cache API or chat streams.
  if (url.pathname.startsWith("/api/")) return;

  // Network-first for page navigations; fall back to the cached shell offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (isCacheable(res)) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(() => caches.match(request).then((m) => m || caches.match("/"))),
    );
    return;
  }

  // Cache-first only for immutable build output / static assets.
  if (isImmutableAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((res) => {
            if (isCacheable(res)) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(request, copy));
            }
            return res;
          }),
      ),
    );
  }
  // Other same-origin GETs fall through to the network (no SW handling).
});
