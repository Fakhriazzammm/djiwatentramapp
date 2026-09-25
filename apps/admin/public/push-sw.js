self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : "Ada notifikasi operasional baru." };
  }

  const title = typeof payload.title === "string" ? payload.title : "Djiwa Tentram Admin";
  const body = typeof payload.body === "string" ? payload.body : "Ada notifikasi operasional baru.";
  const url = typeof payload.url === "string" && payload.url.startsWith("/admin/") ? payload.url : "/admin";
  const notificationId = typeof payload.notificationId === "string" ? payload.notificationId : "generic";

  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: "/pwa-192x192.png",
    badge: "/pwa-192x192.png",
    tag: `pos-notification:${notificationId}`,
    renotify: true,
    data: { url, notificationId },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data && event.notification.data.url
    ? event.notification.data.url
    : "/admin";

  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
    const existing = clients.find((client) => "focus" in client);
    if (existing) {
      existing.navigate(targetUrl);
      return existing.focus();
    }
    return self.clients.openWindow(targetUrl);
  }));
});
