import type { Asset, Entry, FinanceState } from "./types";
import { isGoldAsset, priceOn, type GoldPoint } from "./assets";
import { daysIn, debtTotals, inMonth, spendByCategory, totals } from "./calc";

/** Pure maths behind the "Cerita" Beranda: net-worth history, calendar, pace and statistics. No UI, no I/O. */

const dayStr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const net = (e: Entry) => (e.kind === "in" ? e.amount : e.kind === "out" ? -e.amount : 0);

/** One asset's value on a given day; gold follows the price, others keep their entered value. Null = not owned yet. */
export function assetValueOn(a: Asset, points: GoldPoint[] | null, day: string): number | null {
  if (a.boughtOn && a.boughtOn > day) return null;
  if (!isGoldAsset(a) || !points?.length) return a.value;
  if (a.cost && a.boughtOn) return Math.round(a.cost * (priceOn(points, day) / priceOn(points, a.boughtOn)));
  return Math.round((a.weight ?? 0) * (a.purity ?? 0.9999) * priceOn(points, day));
}

export type WealthPoint = { label: string; value: number; year: number; month: number };
/**
 * Month-end net worth rebuilt from what is on record: cash is today's cash minus every movement after that day,
 * gold follows its price, other assets and debts keep today's amounts. The current month ends today.
 * Only months from the first entry onwards are returned.
 */
export function wealthHistory(state: FinanceState, entries: Entry[], cashNow: number, points: GoldPoint[] | null, months = 12, now = new Date()): WealthPoint[] {
  if (!entries.length) return [];
  const first = entries.reduce((m, e) => (e.at < m ? e.at : m), entries[0].at), fd = new Date(first);
  const debt = debtTotals(state.debts), fixed = debt.owedToMe - debt.iOwe;
  const out: WealthPoint[] = [];
  for (let i = months - 1; i >= 0; i -= 1) {
    const ref = new Date(now.getFullYear(), now.getMonth() - i, 1), last = i === 0 ? now : new Date(ref.getFullYear(), ref.getMonth() + 1, 0, 23, 59, 59);
    if (ref.getFullYear() * 12 + ref.getMonth() < fd.getFullYear() * 12 + fd.getMonth()) continue;
    const cut = +last, cash = cashNow - entries.filter((e) => +new Date(e.at) > cut).reduce((s, e) => s + net(e), 0), day = dayStr(last);
    const assets = state.assets.reduce((s, a) => s + (assetValueOn(a, points, day) ?? 0), 0);
    out.push({ label: ref.toLocaleDateString("id-ID", { month: "short" }), year: ref.getFullYear(), month: ref.getMonth(), value: Math.round(cash + assets + fixed) });
  }
  return out;
}

export type HeatCell = { day: number; level: 0 | 1 | 2 | 3 | 4; state: "calm" | "spent" | "future" | "before"; amount: number };
/** Spending intensity per day. A "calm day" is a past day with no spending, counted only from the first entry onwards. */
export function spendCalendar(entries: Entry[], now = new Date()): { cells: HeatCell[]; calm: number; offset: number } {
  const y = now.getFullYear(), m = now.getMonth(), dim = daysIn(y, m), today = now.getDate();
  const amounts = Array.from({ length: dim }, () => 0);
  for (const e of entries) if (e.kind === "out" && inMonth(e, y, m)) amounts[new Date(e.at).getDate() - 1] += e.amount;
  const firstAt = entries.length ? entries.reduce((a, e) => (e.at < a ? e.at : a), entries[0].at) : null, fd = firstAt ? new Date(firstAt) : null;
  const startDay = fd && fd.getFullYear() === y && fd.getMonth() === m ? fd.getDate() : fd && fd > now ? dim + 1 : 1;
  const spent = amounts.filter((a) => a > 0).sort((a, b) => a - b), q = (p: number) => spent[Math.min(spent.length - 1, Math.floor(spent.length * p))] ?? 0;
  const t1 = q(0.25), t2 = q(0.5), t3 = q(0.75);
  let calm = 0;
  const cells = amounts.map((amount, i): HeatCell => {
    const day = i + 1;
    if (day > today) return { day, level: 0, state: "future", amount: 0 };
    if (day < startDay) return { day, level: 0, state: "before", amount: 0 };
    if (amount <= 0) { calm += 1; return { day, level: 0, state: "calm", amount: 0 }; }
    return { day, level: amount <= t1 ? 1 : amount <= t2 ? 2 : amount <= t3 ? 3 : 4, state: "spent", amount };
  });
  const dow = new Date(y, m, 1).getDay();            // 0 = Sunday
  return { cells, calm, offset: (dow + 6) % 7 };     // Monday first
}

/** Cumulative spending per day for this month (up to today) and the full last month, plus a straight-line projection. */
export function pace(entries: Entry[], now = new Date()) {
  const y = now.getFullYear(), m = now.getMonth(), dim = daysIn(y, m), today = now.getDate(), pm = new Date(y, m - 1, 1);
  const daily = (yy: number, mm: number, n: number) => { const a = Array.from({ length: n }, () => 0); for (const e of entries) if (e.kind === "out" && inMonth(e, yy, mm)) a[new Date(e.at).getDate() - 1] += e.amount; return a; };
  const cum = (a: number[]) => { let t = 0; return a.map((v) => (t += v)); };
  const cur = cum(daily(y, m, dim)).slice(0, today), prev = cum(daily(pm.getFullYear(), pm.getMonth(), daysIn(pm.getFullYear(), pm.getMonth())));
  const spent = cur[today - 1] ?? 0, projected = today > 0 ? Math.round((spent / today) * dim) : 0, lastTotal = prev[prev.length - 1] ?? 0;
  return { cur, prev, spent, projected, lastTotal, diff: lastTotal > 0 ? projected - lastTotal : null, dim, today };
}

export function spendStats(entries: Entry[], now = new Date()) {
  const y = now.getFullYear(), m = now.getMonth(), today = now.getDate();
  const month = entries.filter((e) => e.kind === "out" && inMonth(e, y, m)), prevM = new Date(y, m - 1, 1);
  const prevTo = entries.filter((e) => e.kind === "out" && inMonth(e, prevM.getFullYear(), prevM.getMonth()) && new Date(e.at).getDate() <= today);
  const total = month.reduce((s, e) => s + e.amount, 0), prevTotal = prevTo.reduce((s, e) => s + e.amount, 0);
  const perDay = today ? total / today : 0, prevPerDay = today ? prevTotal / today : 0;
  const byDay = new Map<number, number>(); for (const e of month) byDay.set(new Date(e.at).getDate(), (byDay.get(new Date(e.at).getDate()) ?? 0) + e.amount);
  const top = [...byDay.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;
  const places = new Map<string, { name: string; n: number; sum: number }>();
  for (const e of month) { const k = e.note.trim().toLowerCase(); if (!k) continue; const p = places.get(k) ?? { name: e.note.trim(), n: 0, sum: 0 }; p.n += 1; p.sum += e.amount; places.set(k, p); }
  const fav = [...places.values()].sort((a, b) => b.n - a.n || b.sum - a.sum)[0] ?? null;
  return {
    perDay, perDayChange: prevPerDay > 0 ? Math.round(((perDay - prevPerDay) / prevPerDay) * 100) : null,
    costly: top ? { day: new Date(y, m, top[0]), amount: top[1] } : null, count: month.length, perDayCount: today ? month.length / today : 0, fav,
  };
}

/** Category shares this month and how each moved against the same days last month. */
export function categoryShares(entries: Entry[], now = new Date(), limit = 4) {
  const y = now.getFullYear(), m = now.getMonth(), today = now.getDate(), pm = new Date(y, m - 1, 1);
  const cur = spendByCategory(entries.filter((e) => inMonth(e, y, m))), prev = spendByCategory(entries.filter((e) => inMonth(e, pm.getFullYear(), pm.getMonth()) && new Date(e.at).getDate() <= today));
  const total = [...cur.values()].reduce((s, v) => s + v, 0);
  const rows = [...cur.entries()].sort((a, b) => b[1] - a[1]).map(([id, amount]) => { const p = prev.get(id) ?? 0; return { id, amount, pct: total ? (amount / total) * 100 : 0, change: p > 0 ? Math.round(((amount - p) / p) * 100) : null }; });
  const head = rows.slice(0, limit - 1), rest = rows.slice(limit - 1), restSum = rest.reduce((s, r) => s + r.amount, 0);
  return { total, rows: rest.length ? [...head, { id: "_rest", amount: restSum, pct: total ? (restSum / total) * 100 : 0, change: null as number | null }] : head };
}

export const monthTotals = (entries: Entry[], year: number, month: number) => totals(entries.filter((e) => inMonth(e, year, month)));
