const CACHE = "de1na-offline-v1";
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.add("/offline.html")),
  );
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter(
                (key) => key.startsWith("de1na-offline-") && key !== CACHE,
              )
              .map((key) => caches.delete(key)),
          ),
        ),
    ]),
  );
});
// Only the public offline page is cached. Never cache sessions or trip data.
self.addEventListener("fetch", (event) => {
  if (
    event.request.mode !== "navigate" ||
    new URL(event.request.url).origin !== self.location.origin
  )
    return;
  event.respondWith(
    fetch(event.request).catch(() =>
      caches
        .match("/offline.html")
        .then(
          (response) =>
            response ||
            new Response("Sin conexión. Vuelve a intentarlo.", {
              status: 503,
              headers: { "Content-Type": "text/plain; charset=utf-8" },
            }),
        ),
    ),
  );
});
