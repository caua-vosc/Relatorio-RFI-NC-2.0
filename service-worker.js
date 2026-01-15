self.addEventListener("install", event => {
  event.waitUntil(
    caches.open("rfi-cache-v1").then(cache => {
      return cache.addAll([
        "./",
        "./index.html",
        "./manifest.json"
      ]);
    })
  );
});

self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);

  // NÃO INTERCEPTAR API
  if (url.pathname.startsWith("/api/")) return;

  event.respondWith(
    caches.match(event.request).then(resp => {
      return resp || fetch(event.request);
    })
  );
});
