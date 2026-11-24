import { useSyncExternalStore } from "react";
import { isNativeApp, setupNativeChrome } from "./native";

/** Installing Djiwa Pay on the phone: detection, the install prompt, updates, and Web Push for the installed app. */
export type Platform = "ios-safari" | "ios-other" | "android-chrome" | "android-samsung" | "android-firefox" | "android-other" | "desktop-chromium" | "desktop-safari" | "desktop-firefox" | "desktop-other";

export function detectPlatform(ua: string, maxTouchPoints = 0): Platform {
  const ios = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1);
  if (ios) return /CriOS|FxiOS|EdgiOS|OPiOS|GSA\/|DuckDuckGo|Instagram|FBAN|FBAV|Line\/|MicroMessenger/.test(ua) ? "ios-other" : "ios-safari";
  if (/Android/i.test(ua)) return /SamsungBrowser/.test(ua) ? "android-samsung" : /Firefox/.test(ua) ? "android-firefox" : /Chrome|EdgA/.test(ua) ? "android-chrome" : "android-other";
  if (/Edg\//.test(ua) || (/Chrome\//.test(ua) && !/OPR\//.test(ua))) return "desktop-chromium";
  if (/Safari\//.test(ua) && !/Chrome/.test(ua)) return "desktop-safari";
  if (/Firefox/.test(ua)) return "desktop-firefox";
  return "desktop-other";
}
export type StepIcon = "share" | "menu" | "plus" | "install" | "home" | "bell" | "safari";
export type Step = { text: string; icon?: StepIcon };
export const GUIDE: Record<Platform, { title: string; steps: Step[]; note?: string }> = {
  "ios-safari": { title: "iPhone dan iPad (Safari)", steps: [{ text: "Pastikan kamu membuka djiwapay.web.id di Safari.", icon: "safari" }, { text: "Ketuk tombol Bagikan di bar bawah, kotak dengan panah ke atas.", icon: "share" }, { text: "Gulir ke bawah lalu pilih “Tambahkan ke Layar Utama”.", icon: "plus" }, { text: "Ketuk “Tambah” di pojok kanan atas.", icon: "plus" }, { text: "Buka Djiwa Pay dari ikon barunya di layar utama. Notifikasi bisa diaktifkan dari Akun setelah itu.", icon: "bell" }], note: "Notifikasi di iPhone butuh iOS 16.4 atau lebih baru dan hanya jalan dari aplikasi yang sudah dipasang." },
  "ios-other": { title: "iPhone dan iPad (browser lain)", steps: [{ text: "Di iPhone, aplikasi web hanya bisa dipasang lewat Safari. Salin tautan di bawah.", icon: "safari" }, { text: "Buka Safari, tempel tautannya, lalu ketuk Bagikan.", icon: "share" }, { text: "Pilih “Tambahkan ke Layar Utama”, lalu “Tambah”.", icon: "plus" }] },
  "android-chrome": { title: "Android (Chrome)", steps: [{ text: "Ketuk tombol Pasang di bawah. Jika tidak muncul, ketuk menu ⋮ di pojok kanan atas Chrome.", icon: "menu" }, { text: "Pilih “Instal aplikasi” atau “Tambahkan ke layar utama”.", icon: "install" }, { text: "Ketuk “Instal”, lalu buka Djiwa Pay dari layar utama.", icon: "home" }] },
  "android-samsung": { title: "Android (Samsung Internet)", steps: [{ text: "Ketuk menu ≡ di bar bawah.", icon: "menu" }, { text: "Pilih “Tambahkan halaman ke” lalu “Layar utama”, atau “Instal” bila ada.", icon: "install" }, { text: "Konfirmasi, lalu buka dari layar utama.", icon: "home" }] },
  "android-firefox": { title: "Android (Firefox)", steps: [{ text: "Ketuk menu ⋮ di pojok kanan atas.", icon: "menu" }, { text: "Pilih “Instal” atau “Tambahkan ke layar utama”.", icon: "install" }, { text: "Konfirmasi, lalu buka dari layar utama.", icon: "home" }] },
  "android-other": { title: "Android", steps: [{ text: "Buka menu browser kamu.", icon: "menu" }, { text: "Cari “Instal aplikasi” atau “Tambahkan ke layar utama”.", icon: "install" }, { text: "Jika tidak ada, buka djiwapay.web.id di Chrome lalu ulangi.", icon: "home" }] },
  "desktop-chromium": { title: "Komputer (Chrome atau Edge)", steps: [{ text: "Klik ikon instal di ujung kanan kolom alamat, atau tombol Pasang di bawah.", icon: "install" }, { text: "Klik “Instal”. Djiwa Pay terbuka di jendelanya sendiri.", icon: "home" }] },
  "desktop-safari": { title: "Komputer (Safari)", steps: [{ text: "Klik menu File, lalu “Tambahkan ke Dock”.", icon: "share" }, { text: "Klik “Tambah”.", icon: "plus" }] },
  "desktop-firefox": { title: "Komputer (Firefox)", steps: [{ text: "Firefox di komputer belum bisa memasang aplikasi web. Buka djiwapay.web.id di Chrome atau Edge.", icon: "install" }] },
  "desktop-other": { title: "Komputer", steps: [{ text: "Buka djiwapay.web.id di Chrome atau Edge, lalu klik ikon instal di kolom alamat.", icon: "install" }] },
};

export const isStandalone = (): boolean => isNativeApp() || typeof window !== "undefined" && (window.matchMedia?.("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true);
export const currentPlatform = (): Platform => (typeof navigator === "undefined" ? "desktop-other" : detectPlatform(navigator.userAgent, navigator.maxTouchPoints));
export const isIos = (p: Platform = currentPlatform()) => p.startsWith("ios");

/* ---- install prompt and update state ---- */
type BIPE = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
type State = { canPrompt: boolean; installed: boolean; updateReady: boolean };
let state: State = { canPrompt: false, installed: false, updateReady: false }, deferred: BIPE | null = null, waiting: ServiceWorker | null = null, started = false;
const listeners = new Set<() => void>();
const set = (patch: Partial<State>) => { state = { ...state, ...patch }; listeners.forEach((l) => l()); };
export const usePwaState = () => useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => state, () => state);

export function initPwa() {
  if (started || typeof window === "undefined") return; started = true;
  set({ installed: isStandalone() });
  setupNativeChrome();
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e as BIPE; set({ canPrompt: true }); });
  window.addEventListener("appinstalled", () => { deferred = null; set({ canPrompt: false, installed: true }); });
  window.matchMedia?.("(display-mode: standalone)").addEventListener?.("change", () => set({ installed: isStandalone() }));
  if (!("serviceWorker" in navigator) || !import.meta.env.PROD) return;
  navigator.serviceWorker.register("/sw.js").then((reg) => {
    const watch = (w: ServiceWorker | null) => { if (!w) return; w.addEventListener("statechange", () => { if (w.state === "installed" && navigator.serviceWorker.controller) { waiting = w; set({ updateReady: true }); } }); };
    if (reg.waiting && navigator.serviceWorker.controller) { waiting = reg.waiting; set({ updateReady: true }); }
    reg.addEventListener("updatefound", () => watch(reg.installing));
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") void reg.update().catch(() => undefined); });
  }).catch(() => undefined);
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (reloading) return; reloading = true; window.location.reload(); });
}
export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  if (!deferred) return "unavailable";
  const d = deferred; deferred = null; set({ canPrompt: false });
  await d.prompt(); const r = await d.userChoice.catch(() => ({ outcome: "dismissed" as const })); return r.outcome;
}
export const applyUpdate = () => {
  const go = (w: ServiceWorker | null | undefined) => { if (w) { w.postMessage({ type: "SKIP_WAITING" }); return true; } return false; };
  if (go(waiting)) { setTimeout(() => window.location.reload(), 1500); return; }   // fallback if controllerchange never fires
  navigator.serviceWorker?.getRegistration().then((r) => { if (!go(r?.waiting)) window.location.reload(); else setTimeout(() => window.location.reload(), 1500); }, () => window.location.reload());
};

/* ---- Web Push ---- */
export type PushState = { supported: boolean; permission: NotificationPermission | "unsupported"; subscribed: boolean; needsInstall: boolean };
/* Android app (Capacitor): the WebView has no Web Push, so the native plugin registers a Firebase token instead. */
type NativePush = { checkPermissions: () => Promise<{ receive: string }>; requestPermissions: () => Promise<{ receive: string }>; register: () => Promise<void>; unregister?: () => Promise<void>; createChannel?: (c: Record<string, unknown>) => Promise<void>; addListener: (ev: string, fn: (e: any) => void) => Promise<unknown> };
const nativePlugin = (): NativePush | null => { try { const c = (window as any).Capacitor; return c?.isNativePlatform?.() ? (c.Plugins?.PushNotifications as NativePush) ?? null : null; } catch { return null; } };
export const isNative = () => { try { return Boolean((window as any).Capacitor?.isNativePlatform?.()); } catch { return false; } };
const TOKEN = "djiwa-fcm-token";
const readTok = () => { try { return localStorage.getItem(TOKEN) || ""; } catch { return ""; } };
const postJson = (path: string, body: unknown) => fetch(path, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
let nativeReady = false;
/** Called once when the Android app starts: keeps the token fresh and routes taps on a notification. */
export function initNativePush(onTap: (route: string) => void, onForeground: (n: { title?: string; body?: string; data?: Record<string, string> }) => void) {
  const pl = nativePlugin(); if (!pl || nativeReady) return; nativeReady = true;
  void pl.createChannel?.({ id: "promo", name: "Promo dan kabar fitur", description: "Tawaran dan fitur baru dari Djiwa Pay", importance: 3 }).catch?.(() => undefined);
  void pl.createChannel?.({ id: "transaksi", name: "Transaksi", description: "Pemasukan, pengeluaran, dan email pembayaran", importance: 4 }).catch?.(() => undefined);
  void pl.addListener("registration", (t: { value?: string }) => { if (!t?.value) return; try { localStorage.setItem(TOKEN, t.value); } catch { /* optional */ } void postJson("/api/finance/push/fcm", { token: t.value, appVersion: (window as any).__djiwaVersion ?? "" }).catch(() => undefined); });
  void pl.addListener("pushNotificationActionPerformed", (a: { notification?: { data?: Record<string, string> } }) => {
    const d = a?.notification?.data ?? {};
    if (d.did) void postJson("/api/finance/push/opened", { did: d.did }).catch(() => undefined);
    if (typeof d.route === "string" && d.route.startsWith("/")) onTap(d.route);
  });
  void pl.addListener("pushNotificationReceived", (n: any) => onForeground({ title: n?.title, body: n?.body, data: n?.data }));
}
export async function getPushState(): Promise<PushState> {
  const pl = nativePlugin();
  if (pl) { const p = await pl.checkPermissions().catch(() => ({ receive: "prompt" })); return { supported: true, permission: p.receive === "granted" ? "granted" : p.receive === "denied" ? "denied" : "default", subscribed: p.receive === "granted" && Boolean(readTok()), needsInstall: false }; }
  const supported = typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const needsInstall = isIos() && !isStandalone();
  if (!supported) return { supported: false, permission: "unsupported", subscribed: false, needsInstall };
  const reg = await navigator.serviceWorker.getRegistration("/").catch(() => undefined);
  const sub = await reg?.pushManager.getSubscription().catch(() => null);
  return { supported: true, permission: Notification.permission, subscribed: Boolean(sub), needsInstall };
}
const keyBytes = (b64: string) => { const pad = "=".repeat((4 - (b64.length % 4)) % 4), raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(raw, (c) => c.charCodeAt(0)); };
export async function enablePush(): Promise<{ ok: true } | { ok: false; reason: "denied" | "unsupported" | "server" | "need-install" }> {
  const pl = nativePlugin();
  if (pl) {
    const perm = (await pl.checkPermissions().catch(() => ({ receive: "prompt" }))).receive === "granted" ? "granted" : (await pl.requestPermissions().catch(() => ({ receive: "denied" }))).receive;
    if (perm !== "granted") return { ok: false, reason: "denied" };
    try { await pl.register(); } catch { return { ok: false, reason: "server" }; }
    for (let i = 0; i < 30 && !readTok(); i++) await new Promise((r) => setTimeout(r, 200));   // the token arrives through the "registration" event
    return readTok() ? { ok: true } : { ok: false, reason: "server" };
  }
  const st = await getPushState();
  if (!st.supported) return { ok: false, reason: "unsupported" };
  if (st.needsInstall) return { ok: false, reason: "need-install" };
  const perm = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (perm !== "granted") return { ok: false, reason: "denied" };
  const k = await fetch("/api/finance/push/key", { credentials: "include" }).then((r) => (r.ok ? r.json() : null)).catch(() => null) as { key?: string } | null;
  if (!k?.key) return { ok: false, reason: "server" };
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(k.key) });
  const res = await fetch("/api/finance/push/subscribe", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
  return res.ok ? { ok: true } : { ok: false, reason: "server" };
}
export async function disablePush(): Promise<void> {
  if (nativePlugin()) { const t = readTok(); if (t) await postJson("/api/finance/push/fcm/remove", { token: t }).catch(() => undefined); try { localStorage.removeItem(TOKEN); } catch { /* optional */ } return; }
  const reg = await navigator.serviceWorker.getRegistration("/"), sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await fetch("/api/finance/push/unsubscribe", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => undefined);
  await sub.unsubscribe().catch(() => undefined);
}
export async function sendTestPush(): Promise<boolean> { const r = await fetch("/api/finance/push/test", { method: "POST", credentials: "include" }).catch(() => null); return Boolean(r?.ok); }

/* ---- what the person wants to hear about ---- */
export type PushPrefs = { marketing: boolean; topics: string[]; topicList: Record<string, string> };
export async function loadPushPrefs(): Promise<PushPrefs | null> { const r = await fetch("/api/finance/push/prefs", { credentials: "include" }).catch(() => null); const j = r?.ok ? await r.json().catch(() => null) : null; return j?.success ? { marketing: j.marketing, topics: j.topics, topicList: j.topicList } : null; }
export async function savePushPrefs(p: { marketing?: boolean; topics?: string[] }): Promise<boolean> { const r = await postJson("/api/finance/push/prefs", p).catch(() => null); return Boolean(r?.ok); }
