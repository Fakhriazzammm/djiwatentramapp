import { useCallback, useEffect, useRef, useState } from "react";
import { call } from "./integrations";

/**
 * The "Baru" badge, one standard for every new feature.
 * Rule: a person sees it for 2 days counted from the moment THEY first saw the feature (it scrolled into view), not from the release.
 * The first-seen time is kept on the server per person (so every device agrees; the earliest wins) and on this phone (works offline).
 * An unseen feature shows the badge and starts no clock; a seen one shows it until first-seen + 2 days, then the badge goes away by itself.
 */
export const NEW_DAYS = 2;
export const NEW_TTL = NEW_DAYS * 86_400_000;
const EVENT = "djiwa-new-seen";
const store = (p: string) => `djiwa-new:${p}`;

export type Seen = Record<string, string>;
/** Still new: never seen (the clock has not started) or seen less than 2 days ago. */
export const isFresh = (firstSeen: string | undefined, now: number) => !firstSeen || now < Date.parse(firstSeen) + NEW_TTL;
/** Milliseconds until the badge goes away, or null when it has not started counting. */
export const expiresIn = (firstSeen: string | undefined, now: number) => (firstSeen ? Math.max(0, Date.parse(firstSeen) + NEW_TTL - now) : null);
/** Two records of the same person's first sightings (this phone, the server): the earlier time wins for each feature. */
export const mergeSeen = (a: Seen, b: Seen): Seen => { const out: Seen = { ...a }; for (const [k, v] of Object.entries(b)) if (!out[k] || Date.parse(v) < Date.parse(out[k])) out[k] = v; return out; };

let profile = "";
const read = (): Seen => { try { return JSON.parse(window.localStorage.getItem(store(profile)) || "{}") as Seen; } catch { return {}; } };
const write = (s: Seen) => { try { window.localStorage.setItem(store(profile), JSON.stringify(s)); } catch { /* optional */ } window.dispatchEvent(new Event(EVENT)); };

/** Whose "seen" this is: set once the person is known. */
export function setBadgeProfile(id: string) { profile = id; window.dispatchEvent(new Event(EVENT)); }
/** Pulls the server's record and keeps the earlier time of each. */
export async function syncSeen() { if (!profile) return; try { const r = await call<{ seen?: Seen }>("/discoveries"); write(mergeSeen(read(), r.seen ?? {})); } catch { /* offline: this phone's record stands */ } }
/** The person has seen this feature: remember when, once. */
export async function markSeen(id: string) {
  if (!profile) return;
  const now = read();
  if (now[id]) return;
  write({ ...now, [id]: new Date().toISOString() });
  try { const r = await call<{ seen?: Seen }>("/discoveries/seen", { method: "POST", body: JSON.stringify({ ids: [id] }) }); write(mergeSeen(read(), r.seen ?? {})); } catch { /* sent with the next sync */ }
}

/** `fresh` drives the badge and any highlight; attach `ref` to the element the person has to see: the clock starts once it has been in view for a moment. */
export function useNewFeature<T extends Element = HTMLElement>(id: string) {
  const ref = useRef<T | null>(null), [, bump] = useState(0), [now, setNow] = useState(() => Date.now());
  useEffect(() => { const f = () => bump((n) => n + 1); window.addEventListener(EVENT, f); return () => window.removeEventListener(EVENT, f); }, []);
  const seen = profile ? read()[id] : undefined, fresh = Boolean(profile) && isFresh(seen, now);
  useEffect(() => {   // the badge leaves exactly when its two days are up
    const left = expiresIn(seen, Date.now()); if (left === null) return;
    if (left === 0) { setNow(Date.now()); return; }
    const t = window.setTimeout(() => setNow(Date.now()), Math.min(left + 50, 2 ** 31 - 1)); return () => window.clearTimeout(t);
  }, [seen]);
  const watch = useCallback((el: T | null) => { ref.current = el; }, []);
  useEffect(() => {
    const el = ref.current; if (!fresh || seen || !el || !profile) return;
    if (typeof IntersectionObserver === "undefined") { void markSeen(id); return; }
    let timer: number | undefined;
    const io = new IntersectionObserver((es) => { for (const e of es) { if (e.isIntersecting && e.intersectionRatio >= 0.5) { if (timer === undefined) timer = window.setTimeout(() => { void markSeen(id); io.disconnect(); }, 700); } else if (timer !== undefined) { window.clearTimeout(timer); timer = undefined; } } }, { threshold: [0, 0.5, 1] });
    io.observe(el);
    return () => { io.disconnect(); if (timer !== undefined) window.clearTimeout(timer); };
  }, [id, fresh, seen]);
  return { fresh, ref: watch, seen };
}
