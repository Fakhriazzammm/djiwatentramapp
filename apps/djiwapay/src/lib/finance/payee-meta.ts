import { useCallback, useEffect, useState } from "react";
import { call } from "./integrations";
import type { Meta, PayeeKind } from "./payees";

/**
 * What the person told us about a payee: its kind (orang, toko, layanan) and a label (Keluarga, Teman, Kerja...).
 * Kept on this phone and on the account, so every device agrees: each answer carries the time it was given and the newest answer per payee wins.
 * A cleared answer stays as an empty, dated entry so the clearing reaches the other devices too.
 */
export type Item = { kind?: PayeeKind; label?: string; at: number };
export type Store = Record<string, Item>;
type Server = { key: string; kind: PayeeKind | null; label: string | null; at: number };
const KEY = (p: string) => `djiwa-payee-meta:${p}`, EVENT = "djiwa-payee-meta";

/** Reads this phone's copy; the first version stored {kinds, labels} without times: those are taken in with the oldest possible time, so the account's answers win. */
export function readStore(profileId: string): Store {
  try {
    const v = JSON.parse(window.localStorage.getItem(KEY(profileId)) || "{}") as { items?: Store; kinds?: Record<string, PayeeKind>; labels?: Record<string, string> };
    if (v.items) return v.items;
    const out: Store = {};
    for (const [k, kind] of Object.entries(v.kinds ?? {})) out[k] = { ...(out[k] ?? { at: 1 }), kind };
    for (const [k, label] of Object.entries(v.labels ?? {})) out[k] = { ...(out[k] ?? { at: 1 }), label };
    return out;
  } catch { return {}; }
}
const writeStore = (profileId: string, items: Store) => { try { window.localStorage.setItem(KEY(profileId), JSON.stringify({ v: 2, items })); } catch { /* optional */ } window.dispatchEvent(new CustomEvent(EVENT, { detail: profileId })); };
export const metaOf = (items: Store): Meta => { const m: Meta = { kinds: {}, labels: {} }; for (const [k, i] of Object.entries(items)) { if (i.kind) m.kinds[k] = i.kind; if (i.label) m.labels[k] = i.label; } return m; };
export const readPayeeMeta = (profileId: string): Meta => metaOf(readStore(profileId));

/** Newest answer per payee between this phone and the account. Returns what to keep and what the account has not heard yet. */
export function mergeStores(local: Store, server: Server[]): { next: Store; push: Server[] } {
  const next: Store = { ...local }, known = new Map(server.map((s) => [s.key, s]));
  for (const s of server) { const l = next[s.key]; if (!l || s.at > l.at) next[s.key] = { ...(s.kind ? { kind: s.kind } : {}), ...(s.label ? { label: s.label } : {}), at: s.at }; }
  const push: Server[] = [];
  for (const [key, l] of Object.entries(next)) { const s = known.get(key); if (!s || l.at > s.at) push.push({ key, kind: l.kind ?? null, label: l.label ?? null, at: l.at }); }
  return { next, push };
}

const syncing = new Map<string, Promise<void>>(), lastSync = new Map<string, number>();
export function syncPayeeMeta(profileId: string, force = false): Promise<void> {
  if (!force && Date.now() - (lastSync.get(profileId) ?? 0) < 20_000) return Promise.resolve();
  const running = syncing.get(profileId); if (running) return running;
  const job = (async () => {
    try {
      const got = await call<{ items: Server[] }>("/payee-meta");
      const { next, push } = mergeStores(readStore(profileId), got.items);
      writeStore(profileId, next);
      if (push.length) { const back = await call<{ items: Server[] }>("/payee-meta", { method: "POST", body: JSON.stringify({ items: push }) }); const merged = mergeStores(readStore(profileId), back.items); writeStore(profileId, merged.next); }
      lastSync.set(profileId, Date.now());
    } catch { /* offline: this phone's copy stands and is sent next time */ } finally { syncing.delete(profileId); }
  })();
  syncing.set(profileId, job); return job;
}

export function usePayeeMeta(profileId: string) {
  const [meta, setMeta] = useState<Meta>(() => readPayeeMeta(profileId));
  useEffect(() => {
    const f = (e: Event) => { if ((e as CustomEvent).detail === profileId) setMeta(readPayeeMeta(profileId)); };
    window.addEventListener(EVENT, f);
    void syncPayeeMeta(profileId);
    const v = () => { if (document.visibilityState === "visible") void syncPayeeMeta(profileId); };
    document.addEventListener("visibilitychange", v);
    return () => { window.removeEventListener(EVENT, f); document.removeEventListener("visibilitychange", v); };
  }, [profileId]);
  const change = useCallback((k: string, patch: Partial<Item>) => { const s = readStore(profileId), cur = s[k] ?? { at: 0 }; s[k] = { ...cur, ...patch, at: Date.now() }; writeStore(profileId, s); void syncPayeeMeta(profileId, true); }, [profileId]);
  const setKind = useCallback((k: string, kind: PayeeKind | null) => change(k, { kind: kind ?? undefined }), [change]);
  const setLabel = useCallback((k: string, label: string) => change(k, { label: label.trim().slice(0, 20) || undefined }), [change]);
  return { meta, setKind, setLabel };
}
