const CACHE_NAME = "checklist-v3";

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
    );
});

self.addEventListener("fetch", event => {

    // ⚠️ IGNORA requisições externas (Vercel, APIs)
    if (!event.request.url.startsWith(self.location.origin)) {
        return;
    }

    event.respondWith(
        fetch(event.request)
            .catch(() => caches.match(event.request))
    );
});
