const CACHE_NAME = "rfi-cache-v3";
const APP_SHELL = [
  "./",
  "./index.html",
  "./app.js",
  "./upload.js",
  "./manifest.json"
];

// instala e guarda arquivos essenciais
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

// ativa e limpa caches antigos
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// estratégia:
// 1) NÃO interceptar Cloudflare Worker / API / Nominatim
// 2) HTML -> network first, fallback cache
// 3) JS/CSS/manifest -> cache first, fallback network
// 4) imagens locais -> cache first
self.addEventListener("fetch", event => {
  const req = event.request;
  const url = new URL(req.url);

  // não mexer com uploads, worker, reverse geocoding, nem requests não-GET
  if (
    req.method !== "GET" ||
    url.hostname.includes("workers.dev") ||
    url.hostname.includes("openstreetmap.org") ||
    url.hostname.includes("nominatim.openstreetmap.org")
  ) {
    return;
  }

  // navegação/html: tenta rede primeiro, fallback cache
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put("./index.html", copy));
          return res;
        })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  // app shell: cache first
  if (
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith(".json") ||
    url.pathname.endsWith(".html") ||
    url.pathname.endsWith(".webmanifest")
  ) {
    event.respondWith(
      caches.match(req).then(cached => {
        if (cached) return cached;

        return fetch(req).then(res => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
          return res;
        });
      })
    );
    return;
  }

  // imagens locais do app
  if (
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".jpg") ||
    url.pathname.endsWith(".jpeg") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".webp") ||
    url.pathname.endsWith(".ico")
  ) {
    event.respondWith(
      caches.match(req).then(cached => {
        if (cached) return cached;

        return fetch(req).then(res => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
          return res;
        });
      })
    );
  }
});
