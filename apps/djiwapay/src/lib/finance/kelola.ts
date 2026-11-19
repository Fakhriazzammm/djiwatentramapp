import type { Asset, Bill, Entry, FinanceState, Pocket } from "./types";
import { assetValue } from "./assets";
import { daysIn, debtTotals, goalSaved, inMonth, totals } from "./calc";

/** Pure money-management maths behind Rencana, Kesehatan, Prakiraan and the tools. No UI, no I/O. */

export const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export const DEFAULT_POCKETS: Pocket[] = [
  { id: "kebutuhan", name: "Kebutuhan", percent: 50, categoryIds: ["makan", "transport", "tagihan", "rumah", "kesehatan", "pendidikan"], tone: "blue", icon: "home" },
  { id: "keinginan", name: "Keinginan", percent: 30, categoryIds: ["belanja", "hiburan", "lainnya"], tone: "violet", icon: "game" },
  { id: "tabungan", name: "Tabungan", percent: 20, categoryIds: [], tone: "emerald", icon: "target" },
];
export const pocketsOf = (state: FinanceState): Pocket[] => (state.pockets.length ? state.pockets : DEFAULT_POCKETS);
export const allocate = (income: number, pockets: Pocket[]) => pockets.map((p) => ({ pocket: p, amount: Math.round((income * p.percent) / 100) }));
export function pocketUsage(pocket: Pocket, monthEntries: Entry[], income: number) {
  const budget = Math.round((income * pocket.percent) / 100);
  const used = pocket.categoryIds.length ? monthEntries.filter((e) => e.kind === "out" && pocket.categoryIds.includes(e.categoryId)).reduce((s, e) => s + e.amount, 0) : 0;
  return { budget, used, left: budget - used, percent: budget > 0 ? (used / budget) * 100 : 0 };
}

/* ---------- bills ---------- */
export type BillStatus = "paid" | "late" | "today" | "soon" | "later";
export type BillView = { bill: Bill; due: Date; status: BillStatus; daysLeft: number };
export function billsFor(bills: Bill[], now = new Date()): BillView[] {
  const key = monthKey(now), today = startOfDay(now), dim = daysIn(now.getFullYear(), now.getMonth());
  return bills.map((bill) => {
    const due = new Date(now.getFullYear(), now.getMonth(), Math.min(bill.day, dim));
    const daysLeft = Math.round((+due - +today) / 86_400_000);
    const status: BillStatus = bill.paid.includes(key) ? "paid" : daysLeft < 0 ? "late" : daysLeft === 0 ? "today" : daysLeft <= 7 ? "soon" : "later";
    return { bill, due, status, daysLeft };
  }).sort((a, b) => (a.status === "paid" ? 1 : 0) - (b.status === "paid" ? 1 : 0) || +a.due - +b.due);
}
export const unpaidTotal = (views: BillView[]) => views.filter((v) => v.status !== "paid").reduce((s, v) => s + v.bill.amount, 0);

/* ---------- forecast ---------- */
export type ForecastEvent = { day: number; label: string; amount: number };
export type Forecast = { pts: number[]; days: number[]; end: number; min: number; minDay: number; perDay: number; events: ForecastEvent[]; runsOutDay: number | null; endLabel: string };

/** Average daily spending over the last 30 days, excluding what the bills list already accounts for. */
export function dailyBurn(entries: Entry[], billNames: string[], now = new Date()) {
  const from = +startOfDay(now) - 30 * 86_400_000, names = billNames.map((n) => n.trim().toLowerCase()).filter(Boolean);
  const spent = entries.filter((e) => e.kind === "out" && +new Date(e.at) >= from && !names.some((n) => e.note.toLowerCase().includes(n))).reduce((s, e) => s + e.amount, 0);
  return Math.round(spent / 30);
}
/** Day of the month the user usually gets paid: the latest salary entry, else null. */
export function payday(entries: Entry[]): { day: number; amount: number } | null {
  const sal = entries.filter((e) => e.kind === "in" && e.categoryId === "gaji").sort((a, b) => +new Date(b.at) - +new Date(a.at))[0];
  return sal ? { day: new Date(sal.at).getDate(), amount: sal.amount } : null;
}
export function forecast(cash: number, entries: Entry[], bills: Bill[], now = new Date(), cut = 0): Forecast {
  const dim = daysIn(now.getFullYear(), now.getMonth()), today = now.getDate();
  const perDay = Math.round(dailyBurn(entries, bills.map((b) => b.name), now) * (1 - cut));
  const pay = payday(entries), views = billsFor(bills, now);
  let bal = cash, min = cash, minDay = today, runsOutDay: number | null = null;
  const pts = [cash], days = [today], events: ForecastEvent[] = [];
  for (let d = today + 1; d <= dim; d += 1) {
    bal -= perDay;
    for (const v of views) if (v.status !== "paid" && v.due.getDate() === d) { bal -= v.bill.amount; events.push({ day: d, label: v.bill.name, amount: -v.bill.amount }); }
    if (pay && pay.day === d) { bal += pay.amount; events.push({ day: d, label: "Gajian", amount: pay.amount }); }
    pts.push(bal); days.push(d);
    if (bal < min) { min = bal; minDay = d; }
    if (bal < 0 && runsOutDay === null) runsOutDay = d;
  }
  const end = pts[pts.length - 1];
  return { pts, days, end, min, minDay, perDay, events, runsOutDay, endLabel: `${dim} ${now.toLocaleDateString("id-ID", { month: "short" })}` };
}

/* ---------- health ---------- */
export type Pillar = { id: string; name: string; score: number; note: string; action: string };
export type Health = { score: number; label: "Sehat" | "Cukup" | "Perlu perhatian"; tone: "ok" | "warn" | "bad"; pillars: Pillar[] };
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
export function healthScore(input: { entries: Entry[]; state: FinanceState; cash: number; now?: Date }): Health {
  const now = input.now ?? new Date(), { entries, state, cash } = input;
  const month = entries.filter((e) => inMonth(e, now.getFullYear(), now.getMonth()));
  const t = totals(month), burn = dailyBurn(entries, [], now) * 30;
  const rate = t.in > 0 ? (t.in - t.out) / t.in : 0;
  const savings = clamp((rate / 0.2) * 100);
  const goalCash = state.goals.reduce((s, g) => s + goalSaved(g), 0);
  const emergencyTarget = Math.max(burn, 1) * 6, emergency = clamp(((Math.max(0, cash) + goalCash) / emergencyTarget) * 100);
  const income = Math.max(t.in, payday(entries)?.amount ?? 0), owe = debtTotals(state.debts).iOwe;
  const debt = owe === 0 ? 100 : income > 0 ? clamp(100 - (owe / (income * 6)) * 100) : 50;
  const budgetsOk = state.budgets.length ? state.budgets.filter((b) => month.filter((e) => e.kind === "out" && e.categoryId === b.categoryId).reduce((s, e) => s + e.amount, 0) <= b.limit).length / state.budgets.length * 100 : 50;
  const logged = new Set(entries.filter((e) => +now - +new Date(e.at) < 14 * 86_400_000).map((e) => startOfDay(new Date(e.at)).getTime())).size;
  const consistency = clamp((logged / 14) * 100);
  const pillars: Pillar[] = [
    { id: "savings", name: "Rasio menabung", score: savings, note: t.in > 0 ? `Kamu menyisihkan ${Math.max(0, Math.round(rate * 100))}% dari pemasukan` : "Belum ada pemasukan bulan ini", action: "Sisihkan 20% begitu gaji masuk" },
    { id: "emergency", name: "Dana darurat", score: emergency, note: `Cukup untuk ${(Math.max(0, cash + goalCash) / Math.max(burn, 1)).toFixed(1).replace(".", ",")} bulan pengeluaran`, action: "Tambah tabungan ke tujuan Dana darurat" },
    { id: "debt", name: "Beban hutang", score: debt, note: owe ? "Ada hutang yang belum lunas" : "Tidak ada hutang aktif", action: "Lunasi hutang terkecil lebih dulu" },
    { id: "budget", name: "Anggaran terkendali", score: clamp(budgetsOk), note: state.budgets.length ? "Kategori yang masih di bawah batas" : "Belum ada anggaran", action: "Atur anggaran untuk kategori terbesar" },
    { id: "habit", name: "Konsistensi catat", score: consistency, note: `Mencatat ${logged} dari 14 hari terakhir`, action: "Catat satu transaksi setiap hari" },
  ];
  const score = Math.round(pillars.reduce((s, p) => s + p.score, 0) / pillars.length);
  const tone = score >= 75 ? "ok" : score >= 55 ? "warn" : "bad";
  return { score, tone, label: tone === "ok" ? "Sehat" : tone === "warn" ? "Cukup" : "Perlu perhatian", pillars };
}

/* ---------- tools ---------- */
export type AffordMode = "tunai" | "3" | "6" | "12";
export function afford(input: { price: number; mode: AffordMode; cash: number; unpaidBills: number; perDay: number; daysLeft: number }) {
  const months = input.mode === "tunai" ? 1 : Number(input.mode);
  const now = input.mode === "tunai" ? input.price : Math.ceil(input.price / months / 100) * 100;
  const free = input.cash - input.unpaidBills - input.perDay * input.daysLeft;
  const after = free - now;
  const level: "ok" | "warn" | "bad" = after > input.perDay * 5 ? "ok" : after >= 0 ? "warn" : "bad";
  return { payNow: now, free, after, level, months };
}
export const emergencyFund = (monthlyNeed: number, months: number, saved: number) => { const target = monthlyNeed * months; return { target, saved, gap: Math.max(0, target - saved), percent: target > 0 ? Math.min(100, (saved / target) * 100) : 0 }; };
export function zakatMaal(wealth: number, goldPricePerGram: number) {
  const nisab = goldPricePerGram * 85;
  return { nisab, due: wealth >= nisab, amount: wealth >= nisab ? Math.round(wealth * 0.025) : 0 };
}
/** Fixed-payment loan (annuity) and flat-rate loan, side by side. `annualRate` is a percentage. */
export function loan(principal: number, annualRate: number, months: number) {
  const r = annualRate / 100 / 12;
  const annuity = r === 0 ? principal / months : (principal * r) / (1 - (1 + r) ** -months);
  const flat = (principal + principal * (annualRate / 100) * (months / 12)) / months;
  return { annuity: Math.round(annuity), annuityTotal: Math.round(annuity * months), flat: Math.round(flat), flatTotal: Math.round(flat * months), interestAnnuity: Math.round(annuity * months - principal), interestFlat: Math.round(flat * months - principal) };
}

/* ---------- wealth ---------- */
export const ASSET_KINDS: Record<Asset["kind"], { label: string; icon: string; tone: string }> = {
  gold: { label: "Emas", icon: "gift", tone: "amber" }, fund: { label: "Reksa dana", icon: "pie", tone: "blue" }, stock: { label: "Saham", icon: "trend", tone: "indigo" },
  crypto: { label: "Kripto", icon: "flash", tone: "violet" }, property: { label: "Properti", icon: "home", tone: "cyan" }, vehicle: { label: "Kendaraan", icon: "car", tone: "slate" }, electronics: { label: "Elektronik", icon: "phone", tone: "cyan" }, other: { label: "Lainnya", icon: "tag", tone: "slate" },
};
export function netWorth(state: FinanceState, cash: number, stocks = 0) {
  const assets = state.assets.reduce((s, a) => s + assetValue(a), 0), goals = state.goals.reduce((s, g) => s + goalSaved(g), 0), debt = debtTotals(state.debts);
  const loans = state.loans.reduce((s, l) => s + Math.max(0, l.balance), 0);
  const liabilities = debt.iOwe + loans, receivables = debt.owedToMe;
  return { cash, assets, stocks, goals, receivables, liabilities, loans, total: cash + assets + stocks + receivables - liabilities };
}
export function assetMix(state: FinanceState, cash: number) {
  const parts = [{ id: "cash", label: "Kas & dompet", value: Math.max(0, cash) }, ...(Object.keys(ASSET_KINDS) as Asset["kind"][]).map((k) => ({ id: k, label: ASSET_KINDS[k].label, value: state.assets.filter((a) => a.kind === k).reduce((s, a) => s + assetValue(a), 0) }))].filter((p) => p.value > 0);
  const sum = parts.reduce((s, p) => s + p.value, 0) || 1;
  return parts.map((p) => ({ ...p, percent: (p.value / sum) * 100 }));
}

/* ---------- debt payoff ---------- */
/** Pays the smallest balance first with a fixed monthly amount; freed money rolls into the next debt. */
export function payoffPlan(debts: { person: string; amount: number }[], monthly: number) {
  const order = [...debts].filter((d) => d.amount > 0).sort((a, b) => a.amount - b.amount).map((d) => ({ person: d.person, left: d.amount, total: d.amount, doneMonth: 0 }));
  if (!order.length || monthly <= 0) return { order, months: 0, feasible: order.length === 0 };
  let month = 0;
  while (order.some((d) => d.left > 0) && month < 600) {
    month += 1; let pool = monthly;
    for (const d of order) { if (d.left <= 0) continue; const pay = Math.min(d.left, pool); d.left -= pay; pool -= pay; if (d.left <= 0 && !d.doneMonth) d.doneMonth = month; if (pool <= 0) break; }
  }
  return { order, months: month, feasible: order.every((d) => d.left <= 0) };
}

/* ---------- weekly review ---------- */
export function weeklyReview(entries: Entry[], now = new Date()) {
  const day = startOfDay(now).getTime(), wk = 7 * 86_400_000;
  const within = (e: Entry, from: number, to: number) => { const t = new Date(e.at).getTime(); return e.kind === "out" && t >= from && t < to; };
  const cur = entries.filter((e) => within(e, day - 6 * 86_400_000, day + 86_400_000)), prev = entries.filter((e) => within(e, day - 6 * 86_400_000 - wk, day - 6 * 86_400_000));
  const sum = (l: Entry[]) => l.reduce((s, e) => s + e.amount, 0), c = sum(cur), p = sum(prev);
  const byCat = new Map<string, number>(); for (const e of cur) byCat.set(e.categoryId, (byCat.get(e.categoryId) ?? 0) + e.amount);
  const top = [...byCat.entries()].sort((a, b) => b[1] - a[1])[0];
  return { spent: c, previous: p, delta: p > 0 ? Math.round(((c - p) / p) * 100) : null, topCategory: top ? { id: top[0], amount: top[1] } : null, count: cur.length };
}
