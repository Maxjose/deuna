const CACHE = "de1na-offline-v1";
self.addEventListener('push', event => {
  let data;
  try { data = event.data?.json(); } catch { data = null; }
  const title = typeof data?.title === 'string' ? data.title.slice(0,80) : 'De1na';
  const body = typeof data?.body === 'string' ? data.body.slice(0,240) : 'Tienes una actualización. Abre De1na para consultarla.';
  event.waitUntil(self.registration.showNotification(title, {
    body, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png',
    tag: typeof data?.tag === 'string' ? data.tag : 'de1na',
    data: { url: '/dashboard#home' },
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL('/dashboard#home', self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find(client => new URL(client.url).origin === self.location.origin);
    if (existing) { await existing.navigate(target); await existing.focus(); }
    else await self.clients.openWindow(target);
  })());
});
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
