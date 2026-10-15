// MeteoAI — service worker de coquille applicative.
//
// Philosophie : AUCUNE donnée météo n'est mise en cache. Seule la coquille
// (document HTML et actifs statiques) peut être servie hors ligne ; les
// requêtes météo passent toujours au réseau et échouent proprement sans lui.

const SHELL_CACHE = "meteoai-shell-v1";

const SHELL_PRECACHE_URLS = ["/", "/manifest.webmanifest"];

// Préfixes exclus du cache : API, données météo, stockage et internes de la
// plateforme. Ces requêtes ne sont jamais servies depuis le cache.
const NEVER_CACHE_PREFIXES = [
  "/api/",
  "/manus-storage/",
  "/__manus__/",
  "/health",
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then(cache => cache.addAll(SHELL_PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(key => key !== SHELL_CACHE)
            .map(key => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;

  if (request.method !== "GET") {
    return;
  }

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  if (url.origin !== self.location.origin) {
    return;
  }

  if (NEVER_CACHE_PREFIXES.some(prefix => url.pathname.startsWith(prefix))) {
    return;
  }

  if (request.mode === "navigate") {
    // Navigations : réseau d'abord, coquille en cache en secours hors ligne.
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches
            .open(SHELL_CACHE)
            .then(cache => cache.put("/", copy))
            .catch(() => {});
          return response;
        })
        .catch(() =>
          caches.open(SHELL_CACHE).then(cache => cache.match("/")),
        ),
    );
    return;
  }

  // Actifs statiques : cache d'abord, puis réseau.
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) {
        return cached;
      }
      return fetch(request).then(response => {
        if (response.ok && response.type === "basic") {
          const copy = response.clone();
          caches
            .open(SHELL_CACHE)
            .then(cache => cache.put(request, copy))
            .catch(() => {});
        }
        return response;
      });
    }),
  );
});
