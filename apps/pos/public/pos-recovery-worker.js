// Emergency recovery for clients stuck on a cached application entry document.
// Only disposable application assets are removed. Sessions, IndexedDB and
// pending/offline transaction records are retained.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) =>
      name === "pos-pages" || name === "pos-assets" || name.startsWith("workbox-precache-")
    ).map((name) => caches.delete(name)));
    await self.registration.unregister();
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    await Promise.all(windows.map(async (client) => {
      const url = new URL(client.url);
      if (url.origin !== self.location.origin || url.searchParams.has("pos_recovered")) return;
      url.searchParams.set("pos_recovered", "20261026");
      await client.navigate(url.href).catch(() => undefined);
    }));
  })());
});
