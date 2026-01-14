self.addEventListener("fetch", event => {
  if (event.request.url.includes("/api/")) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then(resp => resp || fetch(event.request))
  );
});
