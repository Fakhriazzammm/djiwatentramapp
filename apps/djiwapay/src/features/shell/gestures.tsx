import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** The four bottom tabs, left to right. Swiping sideways on one of these pages moves to the neighbour. */
export const SWIPE_TABS = ["/", "/ringkasan", "/rencana", "/kekayaan"] as const;
const PULL_AT = 72, PULL_MAX = 120, EDGE = 24;

const blocked = (t: EventTarget | null) => {
  let el = t instanceof Element ? t : null;
  while (el && el !== document.body) {
    if (el.matches("input,textarea,select,[contenteditable='true'],[data-nogesture],.dpx-tabbar")) return true;
    const cs = getComputedStyle(el);
    if (/(auto|scroll)/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 2) return true;   // a row that scrolls sideways keeps its own swipe
    el = el.parentElement;
  }
  return false;
};
const overlayOpen = () => Boolean(document.querySelector('[role="dialog"],.dpx-pin,.dpx-sheetwrap,.dpx-ib'));

/**
 * Pull down at the top of a page to refresh its data, and swipe left or right on a tab page to move between tabs.
 * Works in the browser and in the Android app; it only listens to touches, so mouse and keyboard use is unchanged.
 */
export function GestureHost({ enabled, onRefresh, go }: { enabled: boolean; onRefresh: () => Promise<unknown> | void; go: (path: string) => void }) {
  const [pull, setPull] = useState(0), [busy, setBusy] = useState(false);
  const live = useRef({ enabled, onRefresh, go, busy }); live.current = { enabled, onRefresh, go, busy };
  useEffect(() => {
    let sx = 0, sy = 0, st = 0, mode: "none" | "pull" | "swipe" | "skip" = "none", dist = 0, raf = 0;
    const reset = () => { mode = "none"; dist = 0; setPull(0); };
    const start = (e: TouchEvent) => {
      const t = e.touches[0]; sx = t.clientX; sy = t.clientY; st = Date.now(); dist = 0;
      mode = e.touches.length > 1 || !live.current.enabled || live.current.busy || overlayOpen() || blocked(e.target) ? "skip" : "none";
    };
    const move = (e: TouchEvent) => {
      if (mode === "skip") return;
      const t = e.touches[0], dx = t.clientX - sx, dy = t.clientY - sy;
      if (mode === "none") {
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
        if (dy > 0 && dy > Math.abs(dx) && window.scrollY <= 0) mode = "pull";
        else if (Math.abs(dx) > Math.abs(dy) * 1.4 && sx > EDGE && sx < window.innerWidth - EDGE) mode = "swipe";
        else mode = "skip";
      }
      if (mode === "pull") { dist = Math.min(PULL_MAX, dy * 0.5); cancelAnimationFrame(raf); raf = requestAnimationFrame(() => setPull(dist)); }
    };
    const end = (e: TouchEvent) => {
      const t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy, fast = Date.now() - st < 700;
      if (mode === "pull" && dist >= PULL_AT * 0.5 * 1.4 - 0) {
        setBusy(true); setPull(PULL_AT * 0.7); mode = "none";
        Promise.resolve(live.current.onRefresh()).catch(() => undefined).finally(() => window.setTimeout(() => { setBusy(false); setPull(0); }, 600));
        return;
      }
      if (mode === "swipe" && fast && Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.6) {
        const i = (SWIPE_TABS as readonly string[]).indexOf(window.location.pathname.replace(/\/+$/, "") || "/");
        const next = i < 0 ? -1 : i + (dx < 0 ? 1 : -1);
        if (next >= 0 && next < SWIPE_TABS.length) live.current.go(SWIPE_TABS[next]);
      }
      reset();
    };
    document.addEventListener("touchstart", start, { passive: true });
    document.addEventListener("touchmove", move, { passive: true });
    document.addEventListener("touchend", end, { passive: true });
    document.addEventListener("touchcancel", reset, { passive: true });
    return () => { document.removeEventListener("touchstart", start); document.removeEventListener("touchmove", move); document.removeEventListener("touchend", end); document.removeEventListener("touchcancel", reset); cancelAnimationFrame(raf); };
  }, []);
  if (typeof document === "undefined" || (pull <= 0 && !busy)) return null;
  const ready = pull >= PULL_AT * 0.7;
  return createPortal(<div className="dpx-ptr" aria-live="polite" role="status" style={{ transform: `translateY(${Math.max(0, pull - 36)}px)`, opacity: Math.min(1, pull / 40) }}>
    <span className={`dpx-ptr-dot ${busy ? "spin" : ready ? "ready" : ""}`} aria-hidden="true" />
    <span>{busy ? "Memperbarui…" : ready ? "Lepas untuk memperbarui" : "Tarik untuk memperbarui"}</span>
  </div>, document.body);
}
