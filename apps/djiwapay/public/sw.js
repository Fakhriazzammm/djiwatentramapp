/* Djiwa Pay service worker: offline fallback, light caching, and Web Push for the installed app. */
const VERSION = "djiwapay-v1";
const SHELL = `${VERSION}-shell`, RUNTIME = `${VERSION}-runtime`;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(["/offline.html", "/pwa-192.png", "/favicon-32.png"])));   // no skipWaiting: the app asks the person before it swaps versions
});
self.addEventListener("message", (event) => { if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting(); });
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (!k.startsWith(VERSION)) await caches.delete(k);
    await self.clients.claim();
  })());
});

const sameOrigin = (url) => url.origin === self.location.origin;
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (!sameOrigin(url) || url.pathname.startsWith("/api/") || url.pathname === "/sw.js" || url.pathname === "/version.json" || url.pathname === "/manifest.webmanifest") return;
  if (req.mode === "navigate") {   // pages: always the network; offline gets a calm explanation
    event.respondWith(fetch(req).catch(async () => (await caches.match("/offline.html")) || Response.error()));
    return;
  }
  if (url.pathname.startsWith("/assets/") && /-[A-Za-z0-9_-]{6,}\.(js|css)$/.test(url.pathname)) {   // hashed build files never change
    event.respondWith(caches.open(RUNTIME).then(async (c) => { const hit = await c.match(req); if (hit) return hit; const res = await fetch(req); if (res.ok) c.put(req, res.clone()); return res; }));
    return;
  }
  if (/\.(png|webp|jpg|jpeg|svg|ico|woff2?)$/.test(url.pathname)) {   // pictures and fonts: show what is cached, refresh in the background
    event.respondWith(caches.open(RUNTIME).then(async (c) => { const hit = await c.match(req); const net = fetch(req).then((res) => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => hit); return hit || net; }));
  }
});

/* ---- Web Push ---- */
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: "Djiwa Pay", message: event.data ? event.data.text() : "" }; }
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const open = wins.find((w) => w.visibilityState === "visible");
    if (open) { open.postMessage({ type: "djiwa-island", item: data }); return; }   // the app is on screen: show the in-app island, no second banner
    const amount = typeof data.amount === "number" ? ` ${data.sign === "+" ? "+" : data.sign === "−" ? "−" : ""}Rp ${data.amount.toLocaleString("id-ID")}` : "";
    const promo = data.kind === "marketing";
    await self.registration.showNotification(`${data.title || "Djiwa Pay"}${amount}`, { body: data.message || "", icon: "/pwa-192.png", badge: "/favicon-32.png", tag: data.id || "djiwapay", data, lang: "id", vibrate: data.tone === "warn" ? [70, 50, 70] : [60, 40, 60], ...(promo && typeof data.image === "string" && data.image.startsWith("https://") ? { image: data.image } : {}) });
  })());
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  if (typeof data.did === "string" && data.did) event.waitUntil(fetch("/api/finance/push/opened", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ did: data.did }), keepalive: true }).catch(() => undefined));   // marketing push: count the tap
  const route = typeof data.route === "string" && data.route.startsWith("/") ? data.route : "/";
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const win = wins.find((w) => new URL(w.url).origin === self.location.origin);
    if (win) { await win.focus(); win.postMessage({ type: "djiwa-open", route, item: data }); return; }
    let p = ""; try { p = btoa(unescape(encodeURIComponent(JSON.stringify(data)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); } catch { /* optional */ }
    await self.clients.openWindow(`${route}${route.includes("?") ? "&" : "?"}${p && p.length < 1800 ? `p=${p}` : "src=push"}`);
  })());
});
