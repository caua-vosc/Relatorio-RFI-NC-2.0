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

  // NÃO interceptar o upload
  if (event.request.url.includes("workers.dev")) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(resp => resp || fetch(event.request))
  );
});


