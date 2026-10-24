/* khlaas service worker. Hand-written, no dependencies.
 * Scope is BASE + "/" (e.g. /khlaas/); BASE is derived from the registration scope. */
const VERSION = "v1";
const CACHE_PREFIX = "khlaas-";
const STATIC_CACHE = `${CACHE_PREFIX}static-${VERSION}`;
const PAGES_CACHE = `${CACHE_PREFIX}pages-${VERSION}`;
const KEEP = [STATIC_CACHE, PAGES_CACHE];

// "https://host/khlaas/" -> "/khlaas"
const BASE = new URL(self.registration.scope).pathname.replace(/\/$/, "");
const OFFLINE_URL = `${BASE}/offline`;
const PRECACHE_ICONS = [
  `${BASE}/icons/icon-192.png`,
  `${BASE}/icons/icon-512.png`,
  `${BASE}/icons/apple-touch-icon.png`,
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const pages = await caches.open(PAGES_CACHE);
      const statics = await caches.open(STATIC_CACHE);
      const res = await fetch(OFFLINE_URL, { cache: "reload" });
      if (!res.ok) throw new Error("offline page unavailable");
      const html = await res.clone().text();
      await pages.put(OFFLINE_URL, res);
      // Precache the Next assets the offline page needs to hydrate (Retry button).
      const assets = new Set(
        (html.match(/\/[^"'\s()\\]*\/_next\/static\/[^"'\s()\\]+|\/_next\/static\/[^"'\s()\\]+/g) || []).map(
          (p) => p.replace(/\\u0026/g, "&"),
        ),
      );
      await Promise.all(
        [...assets, ...PRECACHE_ICONS].map((u) =>
          statics.add(u).catch(() => undefined),
        ),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith(CACHE_PREFIX) && !KEEP.includes(k))
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith(`${BASE}/_next/static/`) ||
    url.pathname.startsWith(`${BASE}/icons/`)
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Never touch cross-origin (Clerk, fonts, analytics) or API requests.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith(`${BASE}/api/`) || url.pathname.startsWith("/api/")) return;
  if (url.pathname.includes("clerk") || url.searchParams.has("__clerk_db_jwt")) return;
  if (!url.pathname.startsWith(`${BASE}/`) && url.pathname !== BASE) return;

  // Cache-first for immutable static assets and icons.
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(STATIC_CACHE).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  // Network-first for navigations, offline fallback page on failure.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(async () => {
        const cache = await caches.open(PAGES_CACHE);
        return (
          (await cache.match(OFFLINE_URL)) ||
          new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } })
        );
      }),
    );
  }
});
