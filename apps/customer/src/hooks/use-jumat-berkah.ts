import { useCallback, useEffect, useRef, useState } from "react";
import { useCustomerAuth } from "@/hooks/use-customer-auth";
import { fetchJumatBerkah } from "@/lib/jumat-berkah-api";
import type { JumatBerkahOverview, JumatBerkahPrayer } from "@/lib/jumat-berkah-logic";

const REFRESH_MS = 60_000;
const SHARE_TTL_MS = 5_000;

// Banner, ikon Layanan, dan halaman program memakai data yang sama: satu permintaan dibagi bersama.
const shared = new Map<string, { at: number; promise: Promise<JumatBerkahOverview> }>();
function loadOverview(key: string, identity: { sourceId: string | null; email: string | null }, force: boolean): Promise<JumatBerkahOverview> {
  const hit = shared.get(key);
  if (hit && !force && Date.now() - hit.at < SHARE_TTL_MS) return hit.promise;
  const promise = fetchJumatBerkah(identity);
  shared.set(key, { at: Date.now(), promise });
  promise.catch(() => { if (shared.get(key)?.promise === promise) shared.delete(key); });
  return promise;
}

export type JumatBerkahState = "loading" | "ready" | "error";

/** Overview Jumat Berkah (kampanye, doa, galeri). Segar tiap menit dan saat tab kembali aktif. */
export function useJumatBerkah() {
  const { customer, isLoading: authLoading } = useCustomerAuth();
  const sourceId = customer?.sourceId ?? null;
  const email = customer?.email ?? null;
  const [overview, setOverview] = useState<JumatBerkahOverview | null>(null);
  const [state, setState] = useState<JumatBerkahState>("loading");
  const requestId = useRef(0);

  const reload = useCallback(async (force = false) => {
    const current = ++requestId.current;
    try {
      const next = await loadOverview(`${sourceId ?? ""}|${email ?? ""}`, { sourceId, email }, force);
      if (current !== requestId.current) return;
      setOverview(next);
      setState("ready");
    } catch {
      if (current !== requestId.current) return;
      setState((prev) => (prev === "ready" ? prev : "error"));
    }
  }, [sourceId, email]);

  useEffect(() => {
    if (authLoading) return;
    void reload();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void reload(); }, REFRESH_MS);
    const onVisible = () => { if (document.visibilityState === "visible") void reload(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [authLoading, reload]);

  const patchPrayer = useCallback((prayerId: string, patch: Partial<JumatBerkahPrayer>) => {
    setOverview((prev) => (prev && prev.enabled ? { ...prev, prayers: prev.prayers.map((p) => (p.prayerId === prayerId ? { ...p, ...patch } : p)) } : prev));
  }, []);

  return { overview, state, reload, patchPrayer, customer };
}
