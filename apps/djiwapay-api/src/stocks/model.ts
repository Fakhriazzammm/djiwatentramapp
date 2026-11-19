/** Pure rules of the stock tracker: validation, fees and the average-cost ledger. No network, no database. */
export type Side = "buy" | "sell";
export type Trade = { id: string; ticker: string; side: Side; lots: number; price: number; fee: number; at: string; note: string };
export type Fees = { buy: number; sell: number };            // percent of the transaction value
export type Holding = { ticker: string; shares: number; lots: number; cost: number; avg: number; realized: number };

export const LOT = 100;                                         // 1 lot = 100 shares on the IDX
export const DEFAULT_FEES: Fees = { buy: 0.15, sell: 0.35 };    // sell includes the 0.1% final income tax
export const TICKER_RE = /^[A-Z]{4}$/;
export const MAX_PRICE = 10_000_000, MAX_LOTS = 1_000_000;

export const feeOf = (side: Side, gross: number, fees: Fees) => Math.round((gross * fees[side]) / 100);
export const grossOf = (lots: number, price: number) => Math.round(lots * LOT * price * 100) / 100;

export type TradeInput = { ticker: string; side: Side; lots: number; price: number; at: string; note: string };
export function parseTrade(body: unknown, now = new Date()): { ok: true; trade: TradeInput } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const ticker = String(b.ticker ?? "").trim().toUpperCase();
  if (!TICKER_RE.test(ticker)) return { ok: false, error: "INVALID_TICKER" };
  const side = b.side === "sell" ? "sell" : b.side === "buy" ? "buy" : null;
  if (!side) return { ok: false, error: "INVALID_SIDE" };
  const lots = Number(b.lots), price = Number(b.price);
  if (!Number.isInteger(lots) || lots < 1 || lots > MAX_LOTS) return { ok: false, error: "INVALID_LOTS" };
  if (!Number.isFinite(price) || price <= 0 || price > MAX_PRICE) return { ok: false, error: "INVALID_PRICE" };
  const at = b.at === undefined || b.at === null || b.at === "" ? now : new Date(String(b.at));
  if (Number.isNaN(at.getTime()) || at.getTime() > now.getTime() + 36 * 3600_000 || at.getFullYear() < 1990) return { ok: false, error: "INVALID_DATE" };
  return { ok: true, trade: { ticker, side, lots, price: Math.round(price * 100) / 100, at: at.toISOString(), note: String(b.note ?? "").trim().slice(0, 120) } };
}

export function parseFees(body: unknown): Fees | null {
  const b = (body ?? {}) as Record<string, unknown>;
  const buy = Number(b.buy), sell = Number(b.sell);
  if (![buy, sell].every((v) => Number.isFinite(v) && v >= 0 && v <= 5)) return null;
  return { buy: Math.round(buy * 10000) / 10000, sell: Math.round(sell * 10000) / 10000 };
}

/** Average-cost ledger. Selling realises (price − average) and leaves the average untouched. Cost excludes fees. */
export function replay(trades: Trade[]): { holdings: Holding[]; error?: { id: string; ticker: string } } {
  const ordered = trades.map((t, i) => ({ t, i })).sort((a, b) => Date.parse(a.t.at) - Date.parse(b.t.at) || a.i - b.i).map((x) => x.t);
  const m = new Map<string, { shares: number; cost: number; realized: number }>();
  for (const t of ordered) {
    const h = m.get(t.ticker) ?? { shares: 0, cost: 0, realized: 0 }, shares = t.lots * LOT;
    if (t.side === "buy") { h.cost += shares * t.price; h.shares += shares; }
    else {
      if (shares > h.shares) return { holdings: [], error: { id: t.id, ticker: t.ticker } };
      const avg = h.cost / h.shares;
      h.realized += shares * (t.price - avg); h.cost -= avg * shares; h.shares -= shares;
      if (h.shares === 0) h.cost = 0;
    }
    m.set(t.ticker, h);
  }
  const holdings = [...m].map(([ticker, h]) => ({ ticker, shares: h.shares, lots: h.shares / LOT, cost: Math.round(h.cost), avg: h.shares ? Math.round((h.cost / h.shares) * 100) / 100 : 0, realized: Math.round(h.realized) }))
    .filter((h) => h.shares > 0 || h.realized !== 0).sort((a, b) => b.cost - a.cost || a.ticker.localeCompare(b.ticker));
  return { holdings };
}

/** Lots the user may still sell of a ticker, as of all trades. */
export const heldLots = (trades: Trade[], ticker: string) => (replay(trades).holdings.find((h) => h.ticker === ticker)?.lots ?? 0);
