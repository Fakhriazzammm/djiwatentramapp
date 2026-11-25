import { useCallback, useEffect, useRef, useState } from "react";
import { invokeEdgeFunction } from "./api-helper";

/**
 * Tanda "Baru" untuk fitur baru di aplikasi customer (Djiwa Tentram).
 * Satu standar yang sama dengan Djiwa Pay: seseorang melihat tandanya selama 2 hari,
 * dihitung sejak DIA pertama kali melihat fiturnya (elemennya masuk layar), bukan sejak rilis.
 * Waktu pertama kali dilihat disimpan per orang di server (`pos.customer_feature_seen`)
 * dan di ponsel ini (bekerja luring). Yang tercatat pertama menang dan tidak pernah digeser.
 */
export const NEW_DAYS = 2;
export const NEW_TTL = NEW_DAYS * 86_400_000;
const EVENT = "djiwa-new-seen";
const store = (p: string) => `djiwa-new:${p}`;

export type Seen = Record<string, string>;
/** Masih baru: belum pernah dilihat (jam belum jalan) atau dilihat kurang dari 2 hari lalu. */
export const isFresh = (firstSeen: string | undefined, now: number) => !firstSeen || now < Date.parse(firstSeen) + NEW_TTL;
/** Milidetik sampai tanda hilang, atau null saat jam belum mulai. */
export const expiresIn = (firstSeen: string | undefined, now: number) => (firstSeen ? Math.max(0, Date.parse(firstSeen) + NEW_TTL - now) : null);
/** Dua catatan "dilihat" orang yang sama (ponsel ini vs server): waktu yang lebih awal menang per fitur. */
export const mergeSeen = (a: Seen, b: Seen): Seen => { const out: Seen = { ...a }; for (const [k, v] of Object.entries(b)) if (!out[k] || Date.parse(v) < Date.parse(out[k])) out[k] = v; return out; };

let profile = "";
let email = "";
const read = (): Seen => { try { return JSON.parse(window.localStorage.getItem(store(profile)) || "{}") as Seen; } catch { return {}; } };
const write = (s: Seen) => { try { window.localStorage.setItem(store(profile), JSON.stringify(s)); } catch { /* optional */ } window.dispatchEvent(new Event(EVENT)); };

/** Milik siapa catatan "dilihat" ini: dipasang begitu pelanggan diketahui. */
export function setBadgeProfile(id: string, profileEmail?: string | null) { profile = id; email = profileEmail ?? ""; window.dispatchEvent(new Event(EVENT)); }
/** Ambil catatan server dan pertahankan waktu yang lebih awal di tiap fitur. */
export async function syncSeen() {
  if (!profile || !email) return;
  try {
    const r = await invokeEdgeFunction<{ seen?: Seen }>("customer-features", { action: "get", sourceId: profile, email });
    write(mergeSeen(read(), r.seen ?? {}));
  } catch { /* luring: catatan ponsel ini yang berlaku */ }
}
/** Orang ini sudah melihat fitur ini: ingat waktunya, sekali saja. */
export async function markSeen(id: string) {
  if (!profile || !email) return;
  const now = read();
  if (now[id]) return;
  write({ ...now, [id]: new Date().toISOString() });
  try {
    const r = await invokeEdgeFunction<{ seen?: Seen }>("customer-features", { action: "seen", sourceId: profile, email, ids: [id] });
    write(mergeSeen(read(), r.seen ?? {}));
  } catch { /* terkirim pada sinkron berikutnya */ }
}

/** `fresh` menggerakkan tanda dan sorotan; pasang `ref` pada elemen yang harus dilihat orang itu: jam mulai begitu elemen berada di layar sebentar. */
export function useNewFeature<T extends Element = HTMLElement>(id: string) {
  const ref = useRef<T | null>(null), [, bump] = useState(0), [now, setNow] = useState(() => Date.now());
  useEffect(() => { const f = () => bump((n) => n + 1); window.addEventListener(EVENT, f); return () => window.removeEventListener(EVENT, f); }, []);
  const seen = profile ? read()[id] : undefined, fresh = Boolean(profile) && isFresh(seen, now);
  useEffect(() => {   // tanda pergi tepat saat dua harinya habis
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
