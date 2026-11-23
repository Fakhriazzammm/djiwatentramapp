/** Daily reference exchange rates into rupiah (ECB reference rates through Frankfurter), kept per day so an old entry never changes. */
import type { Q } from "./sync.js";

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;
export type FxRate = { currency: string; day: string; rate: number; source: string };
export const isCurrency = (v: unknown): v is string => typeof v === "string" && /^[A-Z]{3}$/.test(v);
const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** Rate of one unit of `currency` in rupiah on `day` (or the last day before it that had one). */
export async function fxRate(db: Q, currency: string, day: string, f: Fetch = fetch): Promise<FxRate | null> {
  if (!isCurrency(currency) || !isDay(day)) return null;
  if (currency === "IDR") return { currency, day, rate: 1, source: "idr" };
  const hit = (await db.query("select rate, source from finance.fx_rates where currency=$1 and day=$2", [currency, day])).rows[0];
  if (hit) return { currency, day, rate: Number(hit.rate), source: String(hit.source) };
  const today = new Date().toISOString().slice(0, 10), asked = day > today ? today : day;
  try {
    const res = await f(`https://api.frankfurter.dev/v1/${asked}?base=${currency}&symbols=IDR`, { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const j = (await res.json()) as { rates?: { IDR?: number } };
      const rate = Number(j.rates?.IDR);
      if (Number.isFinite(rate) && rate > 0) {
        await db.query("insert into finance.fx_rates(day,currency,rate) values($1,$2,$3) on conflict do nothing", [day, currency, rate]);
        return { currency, day, rate, source: "frankfurter" };
      }
    }
  } catch { /* fall through to the nearest stored rate */ }
  const near = (await db.query("select day::text, rate from finance.fx_rates where currency=$1 order by abs(day - $2::date) limit 1", [currency, day])).rows[0];
  return near ? { currency, day: String(near.day), rate: Number(near.rate), source: "terdekat" } : null;
}

/** Rupiah for an amount in another currency, rounded to whole rupiah. */
export const toRupiah = (amount: number, rate: number) => Math.round(amount * rate);
