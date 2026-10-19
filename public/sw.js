/* reclu.cl — Service Worker mínimo (F7 PWA).
 * Estrategia:
 *  - App shell + páginas estáticas: cache-first con actualización en fondo.
 *  - Navegaciones: network-first con fallback a caché y luego a /offline.
 *  - APIs (/api/*), Supabase y assets remotos: siempre red (nunca cachear).
 */
const VERSION = "reclu-v1";
const STATIC_CACHE = `${VERSION}-static`;
const PAGE_CACHE = `${VERSION}-pages`;
const OFFLINE_URL = "/offline";

// Precache del shell mínimo al instalar.
const PRECACHE_URLS = [OFFLINE_URL, "/icon.svg", "/favicon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/** URLs que nunca deben cachearse (datos vivos, auth, terceros). */
function isNeverCache(url) {
  return (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/auth/") ||
    url.hostname.endsWith("supabase.co") ||
    url.hostname !== self.location.hostname
  );
}

/** Páginas del sitio (navegaciones y assets estáticos propios). */
function isSameSitePageOrAsset(url) {
  if (isNeverCache(url)) return false;
  if (url.pathname.startsWith("/icons/")) return true;
  if (url.pathname.startsWith("/_next/static/")) return true;
  return false;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Nunca interceptar datos vivos ni terceros: red directa.
  if (isNeverCache(url)) return;

  // Navegaciones: network-first → caché → /offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(PAGE_CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() =>
          caches
            .match(request)
            .then((cached) => cached || caches.match(OFFLINE_URL)),
        ),
    );
    return;
  }

  // Assets estáticos propios: cache-first con revalidación en fondo.
  if (isSameSitePageOrAsset(url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const fetchPromise = fetch(request)
          .then((response) => {
            if (response && response.status === 200) {
              const copy = response.clone();
              caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          })
          .catch(() => cached);
        return cached || fetchPromise;
      }),
    );
  }
});
