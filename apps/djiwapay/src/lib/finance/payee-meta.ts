import { useCallback, useEffect, useState } from "react";
import type { Meta, PayeeKind } from "./payees";

const key = (profileId: string) => `djiwa-payee-meta:${profileId}`;
const EVENT = "djiwa-payee-meta";
const read = (profileId: string): Meta => { try { const v = JSON.parse(window.localStorage.getItem(key(profileId)) || "{}") as Partial<Meta>; return { kinds: v.kinds ?? {}, labels: v.labels ?? {} }; } catch { return { kinds: {}, labels: {} }; } };
const write = (profileId: string, m: Meta) => { try { window.localStorage.setItem(key(profileId), JSON.stringify(m)); } catch { /* optional */ } window.dispatchEvent(new CustomEvent(EVENT, { detail: profileId })); };

/** What the person told us about a payee: its kind (orang, toko, layanan) and a label (Keluarga, Teman, Kerja...). Kept on this phone; every screen using it updates together. */
export function usePayeeMeta(profileId: string) {
  const [meta, setMeta] = useState<Meta>(() => read(profileId));
  useEffect(() => { const f = (e: Event) => { if ((e as CustomEvent).detail === profileId) setMeta(read(profileId)); }; window.addEventListener(EVENT, f); return () => window.removeEventListener(EVENT, f); }, [profileId]);
  const setKind = useCallback((k: string, kind: PayeeKind | null) => { const m = read(profileId); if (kind) m.kinds[k] = kind; else delete m.kinds[k]; write(profileId, m); }, [profileId]);
  const setLabel = useCallback((k: string, label: string) => { const m = read(profileId); if (label) m.labels[k] = label.slice(0, 20); else delete m.labels[k]; write(profileId, m); }, [profileId]);
  return { meta, setKind, setLabel };
}
export const readPayeeMeta = read;
