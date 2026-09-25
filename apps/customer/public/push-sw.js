/* Customer PWA background notification handler. */
self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = { body: event.data?.text?.() || "Ada pembaruan baru." }; }
  const title = payload.title || "Djiwa Tentram";
  const options = {
    body: payload.body || "Ada pembaruan untuk pesananmu.",
    icon: payload.icon || "/pwa-app-192.png",
    badge: payload.badge || "/pwa-app-192.png",
    tag: payload.notificationId ? `customer-${payload.notificationId}` : "customer-notification",
    renotify: false,
    data: { url: payload.url || "/", notificationId: payload.notificationId || null },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => "focus" in client);
      if (existing) {
        existing.navigate(target);
        return existing.focus();
      }
      return self.clients.openWindow(target);
    }),
  );
});
