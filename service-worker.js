const CACHE_NAME = "checklist-v2";

const FILES_TO_CACHE = [
    "./",
    "./index.html",
    "./app.js",
    "./db.js",
    "./upload.js",
    "./manifest.json"
];

self.addEventListener("install", event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(FILES_TO_CACHE))
            .catch(err => console.error("Erro ao criar cache:", err))
    );
});

self.addEventListener("fetch", event => {
    event.respondWith(
        fetch(event.request).catch(() => caches.match(event.request))
    );
});
