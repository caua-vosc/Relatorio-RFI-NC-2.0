self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);

  // NÃO interceptar chamadas de API
  if (url.pathname.startsWith("/api/")) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});
