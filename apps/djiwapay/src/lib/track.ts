/** First-party page-view beacon. Sends the path, the referrer host and an anonymous random id kept on this device. */
const KEY = "djiwapay-vid";
function visitorId(): string {
  try { let v = localStorage.getItem(KEY); if (!v) { v = crypto.randomUUID(); localStorage.setItem(KEY, v); } return v; } catch { return "anon-" + Math.random().toString(36).slice(2, 12); }
}
let last = "", lastAt = 0;
function hit() {
  const path = window.location.pathname;
  if (path.startsWith("/admin") || (path === last && Date.now() - lastAt < 30_000)) return;
  last = path; lastAt = Date.now();
  const body = JSON.stringify({ v: visitorId(), p: path, r: document.referrer, s: window.matchMedia?.("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true });
  try { if (navigator.sendBeacon?.("/api/finance/track", new Blob([body], { type: "text/plain" }))) return; } catch { /* fall through */ }
  void fetch("/api/finance/track", { method: "POST", body, keepalive: true, credentials: "include" }).catch(() => undefined);
}
export function startTracking(): () => void {
  hit();
  const wrap = (k: "pushState" | "replaceState") => { const orig = history[k]; history[k] = function (this: History, ...a: Parameters<History["pushState"]>) { const r = orig.apply(this, a); queueMicrotask(hit); return r; } as History["pushState"]; return () => { history[k] = orig; }; };
  const undo = [wrap("pushState")], on = () => hit();
  window.addEventListener("popstate", on);
  return () => { undo.forEach((u) => u()); window.removeEventListener("popstate", on); };
}
