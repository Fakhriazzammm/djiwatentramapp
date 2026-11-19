import { useEffect, useSyncExternalStore } from "react";
import { call } from "./integrations";

export type BiRate = {
  current: { rate: number; day: string; previous: number | null; lastChange: { day: string; from: number; to: number; bps: number } | null } | null;
  history: { day: string; rate: number }[]; source: string; sourceUrl: string; checkedAt: string | null; lastOkAt: string | null; error: string | null; stale: boolean;
};

let snap: BiRate | null = null, inflight: Promise<void> | null = null, loadedAt = 0;
const subs = new Set<() => void>();
const load = () => (inflight ??= call<BiRate & { success: true }>("/rates/bi").then((r) => { snap = r; loadedAt = Date.now(); subs.forEach((f) => f()); }).catch(() => {}).finally(() => { inflight = null; }));

/** Bank Indonesia's policy rate, shared by every screen that shows it. Refreshed when the app comes back to the foreground (at most hourly). */
export function useBiRate() {
  const state = useSyncExternalStore((cb) => { subs.add(cb); return () => { subs.delete(cb); }; }, () => snap, () => null);
  useEffect(() => {
    if (!snap || Date.now() - loadedAt > 3600_000) void load();
    const on = () => { if (document.visibilityState === "visible" && Date.now() - loadedAt > 3600_000) void load(); };
    document.addEventListener("visibilitychange", on); return () => document.removeEventListener("visibilitychange", on);
  }, []);
  return state;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
export const dayLabel = (day: string) => { const [y, m, d] = day.split("-").map(Number); return `${d} ${MONTHS[m - 1]} ${y}`; };
export const pct2 = (n: number) => `${n.toFixed(2).replace(".", ",")}%`;
export const bpsLabel = (bps: number) => (bps === 0 ? "tetap" : `${bps > 0 ? "naik" : "turun"} ${Math.abs(bps)} bps`);
