import { useCallback, useEffect, useSyncExternalStore } from "react";
import { call } from "./integrations";

export type StockSide = "buy" | "sell";
export type StockTrade = { id: string; ticker: string; side: StockSide; lots: number; price: number; fee: number; at: string; note: string };
export type StockHolding = { ticker: string; shares: number; lots: number; cost: number; avg: number; realized: number };
export type StockPrice = { price: number | null; asOf: string | null; checkedAt: string | null; manual: number | null };
export type StockFees = { buy: number; sell: number };
export type StockState = {
  activated: boolean; drive: boolean; fees: StockFees; trades: StockTrade[]; holdings: StockHolding[]; prices: Record<string, StockPrice>;
  sheet: { ready: boolean; url: string | null; error: string | null; lastSyncedAt: string | null; pending: boolean };
};

export const LOT = 100;
export const DEFAULT_FEES: StockFees = { buy: 0.15, sell: 0.35 };
export const feeFor = (side: StockSide, gross: number, fees: StockFees) => Math.round((gross * fees[side]) / 100);
export const grossOf = (lots: number, price: number) => Math.round(lots * LOT * price * 100) / 100;

/* ---------- valuation ---------- */
export type Valued = StockHolding & { price: number; source: "sheet" | "manual" | "none"; value: number; pl: number; plPct: number; asOf: string | null };
/** The sheet's price wins; the user's own price fills in only where Google has none; otherwise the average cost stands in. */
export function valuate(h: StockHolding, p: StockPrice | undefined, priced: boolean): Valued {
  const sheet = priced ? p?.price ?? null : null, manual = priced ? p?.manual ?? null : null;
  const price = sheet ?? manual ?? h.avg, source = sheet !== null ? "sheet" : manual !== null ? "manual" : "none";
  const value = Math.round(h.shares * price), pl = value - h.cost;
  return { ...h, price, source, value, pl, plPct: h.cost ? (pl / h.cost) * 100 : 0, asOf: sheet !== null ? p?.asOf ?? null : null };
}
export type Portfolio = { rows: Valued[]; cost: number; value: number; pl: number; plPct: number; realized: number; priced: boolean; asOf: string | null };
export function portfolio(s: StockState | null): Portfolio {
  const priced = Boolean(s?.drive);
  const rows = (s?.holdings ?? []).filter((h) => h.shares > 0).map((h) => valuate(h, s?.prices[h.ticker], priced));
  const cost = rows.reduce((a, r) => a + r.cost, 0), value = rows.reduce((a, r) => a + (priced ? r.value : r.cost), 0), pl = value - cost;
  const times = rows.map((r) => (r.asOf ? Date.parse(r.asOf) : 0)).filter(Boolean);
  return { rows, cost, value, pl, plPct: cost ? (pl / cost) * 100 : 0, realized: (s?.holdings ?? []).reduce((a, h) => a + h.realized, 0), priced, asOf: times.length ? new Date(Math.min(...times)).toISOString() : null };
}
/** What goes into Kekayaan bersih. */
export const stockValue = (s: StockState | null) => (s?.activated ? portfolio(s).value : 0);
/** Exchange prices can legitimately be days old over a long weekend; beyond four days the sheet is not recalculating. */
export const isStale = (asOf: string | null, now = Date.now()) => asOf !== null && now - Date.parse(asOf) > 4 * 86_400_000;

const wib = (iso: string) => new Date(Date.parse(iso) + 7 * 3600_000);
export function stampLabel(iso: string | null, now = Date.now()) {
  if (!iso) return "";
  const t = wib(iso), n = wib(new Date(now).toISOString()), hm = `${String(t.getUTCHours()).padStart(2, "0")}:${String(t.getUTCMinutes()).padStart(2, "0")}`;
  const days = Math.round((Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()) - Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate())) / 86_400_000);
  if (days <= 0) return hm; if (days === 1) return `kemarin ${hm}`;
  return `${t.getUTCDate()} ${["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"][t.getUTCMonth()]} ${hm}`;
}
export const percent = (n: number) => `${n >= 0 ? "▲" : "▼"} ${Math.abs(n).toFixed(1).replace(".", ",")}%`;
export const signedRupiah = (n: number) => `${n >= 0 ? "+" : "−"}Rp${Math.abs(Math.round(n)).toLocaleString("id-ID")}`;

/* ---------- API ---------- */
type Res = StockState & { success: true };
const get = () => call<Res>("/stocks");
export const stockMessage = (code?: string) => ({
  OVERSELL: "Lot yang dijual melebihi kepemilikan.", WOULD_OVERSELL: "Transaksi beli ini dipakai oleh penjualan sesudahnya. Hapus penjualannya dulu.", INVALID_TICKER: "Kode saham harus 4 huruf.", INVALID_LOTS: "Jumlah lot tidak valid.",
  INVALID_PRICE: "Harga tidak valid.", INVALID_DATE: "Tanggal tidak valid.", INVALID_FEES: "Fee harus antara 0 dan 5 persen.", NOT_ACTIVATED: "Aktifkan fitur Saham dulu.", NOT_FOUND: "Transaksi tidak ditemukan.",
} as Record<string, string>)[code ?? ""] ?? "Gagal menyimpan. Coba lagi.";

/* ---------- shared store: every page that needs the stock value reads one copy ---------- */
let snap: StockState | null = null, inflight: Promise<void> | null = null;
const subs = new Set<() => void>();
const emit = (s: StockState) => { snap = s; subs.forEach((f) => f()); };
export const reloadStocks = () => (inflight ??= get().then((r) => emit(r)).catch(() => {}).finally(() => { inflight = null; }));
const apply = async (p: Promise<Res>) => { const r = await p; emit(r); return r; };

export function useStocks() {
  const state = useSyncExternalStore((cb) => { subs.add(cb); return () => { subs.delete(cb); }; }, () => snap, () => null);
  useEffect(() => { if (!snap) void reloadStocks(); }, []);
  const reload = useCallback(() => reloadStocks(), []);
  return { state, loaded: state !== null, reload };
}

export const activateStocks = () => apply(call<Res>("/stocks/activate", { method: "POST" }));
export const addStockTrade = (t: { ticker: string; side: StockSide; lots: number; price: number; at?: string; note?: string }) => apply(call<Res>("/stocks/trades", { method: "POST", body: JSON.stringify(t) }));
export const deleteStockTrade = (id: string) => apply(call<Res>(`/stocks/trades/${encodeURIComponent(id)}`, { method: "DELETE" }));
export const saveStockFees = (f: StockFees) => apply(call<Res>("/stocks/settings", { method: "PUT", body: JSON.stringify(f) }));
export const saveManualPrice = (ticker: string, price: number | null) => apply(call<Res>("/stocks/prices/manual", { method: "PUT", body: JSON.stringify({ ticker, price }) }));
/** Ask the worker to make Sheets recalculate, then look at the result a few times while it settles. */
export async function refreshStockPrices() {
  const r = await call<{ queued: boolean }>("/stocks/refresh", { method: "POST" });
  if (r.queued) for (const ms of [5000, 14000, 30000]) setTimeout(() => void reloadStocks(), ms);
  return r.queued;
}
export const stocksErrorCode = (e: unknown) => (e as { code?: string })?.code;
