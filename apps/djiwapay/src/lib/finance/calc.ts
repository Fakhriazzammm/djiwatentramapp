import type { WalletTransaction } from "../wallet-adapter";
import { PAY_ACCOUNT_ID } from "./categories";
import type { Account, Budget, Category, Debt, Entry, FinanceState, Goal } from "./types";

export const uid = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

/* ---------- Djiwa Pay → entries (read-only, derived on the fly) ---------- */
export function payCategory(t: Pick<WalletTransaction, "type" | "category" | "direction" | "direct">): { kind: Entry["kind"]; categoryId: string } {
  if (t.category === "topup" || t.type === "topup_completed") return { kind: "tf", categoryId: "transfer" };
  if (t.type === "wallet_hold" || t.type === "wallet_release") return { kind: "tf", categoryId: "transfer" };
  if (t.direction === "credit") return { kind: "in", categoryId: t.category === "refund" ? "belanja" : "bonus" };
  if (t.type === "wallet_transfer_sent" || t.category === "transfer") return { kind: "out", categoryId: "transfer" };
  if (t.type === "order_debit") return { kind: "out", categoryId: "makan" };
  return { kind: "out", categoryId: "tagihan" };
}

export function payEntries(transactions: WalletTransaction[], overrides: FinanceState["overrides"] = {}): Entry[] {
  return transactions
    .filter((t) => t.status === "success" || t.status === "completed")
    .map((t) => {
      const id = `pay:${t.id}`;
      const base = payCategory(t);
      const o = overrides[id];
      return { id, kind: base.kind, amount: t.amount, categoryId: o?.categoryId ?? base.categoryId, accountId: PAY_ACCOUNT_ID, at: t.created_at, note: o?.note ?? (t.direct && t.title ? t.title : t.note || t.counterparty_name || ""), tags: [], source: "pay" as const, createdAt: t.created_at };
    });
}

export const allEntries = (state: FinanceState, transactions: WalletTransaction[]): Entry[] => [...state.entries, ...payEntries(transactions, state.overrides)].sort((a, b) => +new Date(b.at) - +new Date(a.at));

/* ---------- aggregates ---------- */
export const inMonth = (entry: Entry, year: number, month: number) => { const d = new Date(entry.at); return d.getFullYear() === year && d.getMonth() === month; };
export function totals(entries: Entry[]) {
  let out = 0, income = 0;
  for (const e of entries) { if (e.kind === "out") out += e.amount; else if (e.kind === "in") income += e.amount; }
  return { out, in: income, net: income - out };
}
export function spendByCategory(entries: Entry[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const e of entries) if (e.kind === "out") m.set(e.categoryId, (m.get(e.categoryId) ?? 0) + e.amount);
  return m;
}
export const daysIn = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
export function dailySpend(entries: Entry[], year: number, month: number): number[] {
  const days = Array.from({ length: daysIn(year, month) }, () => 0);
  for (const e of entries) if (e.kind === "out" && inMonth(e, year, month)) days[new Date(e.at).getDate() - 1] += e.amount;
  return days;
}
export function monthlySeries(entries: Entry[], months: number, now = new Date()) {
  return Array.from({ length: months }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (months - 1 - i), 1);
    const list = entries.filter((e) => inMonth(e, d.getFullYear(), d.getMonth()));
    return { year: d.getFullYear(), month: d.getMonth(), label: d.toLocaleDateString("id-ID", { month: "short" }), ...totals(list) };
  });
}

/* ---------- budgets ---------- */
export type BudgetStatus = { budget: Budget; used: number; remaining: number; percent: number; level: "ok" | "warn" | "over" };
export function budgetStatuses(budgets: Budget[], monthEntries: Entry[]): BudgetStatus[] {
  const spend = spendByCategory(monthEntries);
  return budgets.map((budget) => {
    const used = spend.get(budget.categoryId) ?? 0;
    const percent = budget.limit > 0 ? (used / budget.limit) * 100 : 0;
    return { budget, used, remaining: budget.limit - used, percent, level: (percent > 100 ? "over" : percent >= 80 ? "warn" : "ok") as BudgetStatus["level"] };
  }).sort((a, b) => b.percent - a.percent);
}
/** Money that is safe to spend today: what is left of the total budget divided by the remaining days (today included). */
export function safeToSpend(budgets: Budget[], monthEntries: Entry[], now = new Date()) {
  if (!budgets.length) return null;
  const limit = budgets.reduce((s, b) => s + b.limit, 0);
  const ids = new Set(budgets.map((b) => b.categoryId));
  const used = monthEntries.filter((e) => e.kind === "out" && ids.has(e.categoryId)).reduce((s, e) => s + e.amount, 0);
  const daysLeft = Math.max(1, daysIn(now.getFullYear(), now.getMonth()) - now.getDate() + 1);
  const left = limit - used;
  return { limit, used, left, daysLeft, perDay: Math.floor(left / daysLeft), percent: limit > 0 ? (used / limit) * 100 : 0 };
}

/* ---------- accounts, goals, debts ---------- */
export function accountBalance(account: Account, entries: Entry[], payBalance = 0): number {
  if (account.id === PAY_ACCOUNT_ID) return payBalance;
  let bal = account.opening;
  for (const e of entries) {
    if (e.accountId === account.id) bal += e.kind === "in" ? e.amount : -e.amount;
    if (e.kind === "tf" && e.toAccountId === account.id) bal += e.amount;
  }
  return bal;
}
export const goalSaved = (g: Goal) => g.deposits.reduce((s, d) => s + d.amount, 0);
export function goalProjection(g: Goal, now = new Date()) {
  const saved = goalSaved(g);
  if (saved >= g.target) return { done: true as const, perMonth: 0, eta: null };
  const first = g.deposits.length ? new Date(g.deposits.reduce((m, d) => (d.at < m ? d.at : m), g.deposits[0].at)) : new Date(g.createdAt);
  const months = Math.max(1, (now.getFullYear() - first.getFullYear()) * 12 + now.getMonth() - first.getMonth() + 1);
  const perMonth = saved / months;
  if (perMonth <= 0) return { done: false as const, perMonth: 0, eta: null };
  const need = Math.ceil((g.target - saved) / perMonth);
  return { done: false as const, perMonth, eta: new Date(now.getFullYear(), now.getMonth() + need, 1) };
}
export function debtTotals(debts: Debt[]) {
  const open = debts.filter((d) => !d.settled);
  return { owedToMe: open.filter((d) => d.direction === "owed_to_me").reduce((s, d) => s + d.amount, 0), iOwe: open.filter((d) => d.direction === "i_owe").reduce((s, d) => s + d.amount, 0) };
}

/* ---------- habits & insights ---------- */
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
export function streak(entries: Entry[], now = new Date()) {
  const days = new Set(entries.filter((e) => e.source !== "pay").map((e) => dayKey(new Date(e.at))));
  const payDays = new Set(entries.map((e) => dayKey(new Date(e.at))));
  const has = (d: Date) => days.has(dayKey(d)) || payDays.has(dayKey(d));
  let count = 0;
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (!has(cursor)) cursor.setDate(cursor.getDate() - 1); // today not logged yet: the streak is still alive until midnight
  while (has(cursor)) { count += 1; cursor.setDate(cursor.getDate() - 1); }
  const week = Array.from({ length: 7 }, (_, i) => { const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (6 - i)); return { date: d, logged: has(d), today: i === 6 }; });
  return { count, loggedToday: has(new Date(now.getFullYear(), now.getMonth(), now.getDate())), week };
}

export type Subscription = { name: string; amount: number; day: number; months: number };
export function detectSubscriptions(entries: Entry[]): Subscription[] {
  const groups = new Map<string, Entry[]>();
  for (const e of entries) { if (e.kind !== "out" || !e.note.trim()) continue; const k = e.note.trim().toLowerCase(); groups.set(k, [...(groups.get(k) ?? []), e]); }
  const subs: Subscription[] = [];
  for (const list of groups.values()) {
    const months = new Set(list.map((e) => { const d = new Date(e.at); return `${d.getFullYear()}-${d.getMonth()}`; }));
    if (months.size < 2) continue;
    const amounts = list.map((e) => e.amount);
    const avg = amounts.reduce((s, a) => s + a, 0) / amounts.length;
    if (amounts.some((a) => Math.abs(a - avg) / avg > 0.15)) continue;
    const latest = list.reduce((m, e) => (e.at > m.at ? e : m), list[0]);
    subs.push({ name: latest.note, amount: latest.amount, day: new Date(latest.at).getDate(), months: months.size });
  }
  return subs.sort((a, b) => b.amount - a.amount);
}

export type Insight = { id: string; tone: "warn" | "ok" | "info"; title: string; body: string };
export function buildInsights(categories: Category[], current: Entry[], previous: Entry[], statuses: BudgetStatus[]): Insight[] {
  const name = (id: string) => categories.find((c) => c.id === id)?.name ?? id;
  const out: Insight[] = [];
  for (const s of statuses.filter((x) => x.level === "over").slice(0, 2)) out.push({ id: `over-${s.budget.categoryId}`, tone: "warn", title: `${name(s.budget.categoryId)} melebihi anggaran`, body: `Terpakai ${Math.round(s.percent)}% — lewat ${Math.round(-s.remaining).toLocaleString("id-ID")} rupiah.` });
  const cur = spendByCategory(current), prev = spendByCategory(previous);
  const rises = [...cur.entries()].map(([id, v]) => ({ id, v, p: prev.get(id) ?? 0 })).filter((x) => x.p > 0 && x.v > x.p * 1.15 && x.v - x.p > 50_000).sort((a, b) => b.v - b.p - (a.v - a.p));
  if (rises[0]) out.push({ id: `rise-${rises[0].id}`, tone: "info", title: `${name(rises[0].id)} naik ${Math.round(((rises[0].v - rises[0].p) / rises[0].p) * 100)}%`, body: "Dibandingkan bulan lalu pada periode yang sama." });
  const drops = [...prev.entries()].map(([id, p]) => ({ id, p, v: cur.get(id) ?? 0 })).filter((x) => x.p > 100_000 && x.v < x.p * 0.8).sort((a, b) => b.p - b.v - (a.p - a.v));
  if (drops[0]) out.push({ id: `drop-${drops[0].id}`, tone: "ok", title: `Hemat di ${name(drops[0].id)}`, body: `Turun ${Math.round(((drops[0].p - drops[0].v) / drops[0].p) * 100)}% dibanding bulan lalu.` });
  return out;
}

/* ---------- export ---------- */
export function toCsv(entries: Entry[], categories: Category[], accounts: Account[]): string {
  const cat = (id: string) => categories.find((c) => c.id === id)?.name ?? id;
  const acc = (id: string) => (id === PAY_ACCOUNT_ID ? "Djiwa Pay" : accounts.find((a) => a.id === id)?.name ?? id);
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const rows = [["Tanggal", "Jenis", "Jumlah", "Kategori", "Dompet", "Catatan", "Tag", "Sumber"].join(",")];
  for (const e of entries) rows.push([esc(new Date(e.at).toISOString().slice(0, 10)), esc(e.kind === "out" ? "Keluar" : e.kind === "in" ? "Masuk" : "Transfer"), e.amount, esc(cat(e.categoryId)), esc(acc(e.accountId)), esc(e.note), esc(e.tags.join(" ")), esc(e.source === "pay" ? "Djiwa Pay" : e.source === "voice" ? "Suara" : "Manual")].join(","));
  return rows.join("\n");
}
