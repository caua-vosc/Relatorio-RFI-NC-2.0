self.addEventListener("install",e=>{
    e.waitUntil(caches.open("checklist-v1").then(c=>c.addAll(["index.html","app.js","db.js","onedrive.js"])));
});
self.addEventListener("fetch",e=>{
    e.respondWith(fetch(e.request).catch(()=>caches.match(e.request)));
});
