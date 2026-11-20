import { DEFAULT_ACCOUNTS, DEFAULT_CATEGORIES } from "./categories";
import { billOf, isDone, monthKeyOf, payExtra, payRegular } from "./loans";
import type { Account, Asset, Bill, Budget, Category, Debt, Entry, FinanceState, Goal, Loan, Override, Pocket } from "./types";

export const emptyState = (): FinanceState => ({ v: 1, onboarded: false, accounts: DEFAULT_ACCOUNTS.map((a) => ({ ...a })), categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })), entries: [], budgets: [], goals: [], debts: [], loans: [], overrides: {}, bills: [], pockets: [], assets: [] });

export type Action =
  | { type: "onboard"; accounts: Account[] }
  | { type: "entry/add"; entry: Entry } | { type: "entry/addMany"; entries: Entry[] } | { type: "entry/update"; entry: Entry } | { type: "entry/delete"; id: string } | { type: "entry/restore"; entry: Entry }
  | { type: "override/set"; id: string; override: Override }
  | { type: "account/upsert"; account: Account } | { type: "account/archive"; id: string }
  | { type: "category/upsert"; category: Category } | { type: "category/delete"; id: string }
  | { type: "budget/set"; budget: Budget } | { type: "budget/setMany"; budgets: Budget[] } | { type: "budget/delete"; categoryId: string }
  | { type: "goal/upsert"; goal: Goal } | { type: "goal/delete"; id: string } | { type: "goal/deposit"; id: string; at: string; amount: number } | { type: "goal/depositEdit"; id: string; index: number; amount: number } | { type: "goal/depositDelete"; id: string; index: number }
  | { type: "debt/upsert"; debt: Debt } | { type: "debt/delete"; id: string } | { type: "debt/settle"; id: string } | { type: "debt/unsettle"; id: string } | { type: "debt/pay"; id: string; at: string; amount: number } | { type: "debt/payDelete"; id: string; index: number }
  | { type: "loan/upsert"; loan: Loan } | { type: "loan/delete"; id: string } | { type: "loan/pay"; id: string; at: string; amount: number; extra?: boolean; mode?: "shorter" | "lower" }
  | { type: "bill/upsert"; bill: Bill } | { type: "bill/delete"; id: string } | { type: "bill/pay"; id: string; month: string; paid: boolean }
  | { type: "pocket/set"; pockets: Pocket[] }
  | { type: "asset/upsert"; asset: Asset } | { type: "asset/delete"; id: string }
  | { type: "import"; state: FinanceState } | { type: "reset" };

const upsert = <T extends { id: string }>(list: T[], item: T) => (list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item]);

export function reduce(state: FinanceState, action: Action): FinanceState {
  switch (action.type) {
    case "onboard": return { ...state, onboarded: true, accounts: action.accounts.length ? action.accounts : state.accounts };
    case "entry/add": case "entry/restore": return { ...state, entries: [action.entry, ...state.entries.filter((e) => e.id !== action.entry.id)] };
    case "entry/addMany": return { ...state, entries: [...action.entries, ...state.entries] };
    case "entry/update": return { ...state, entries: state.entries.map((e) => (e.id === action.entry.id ? action.entry : e)) };
    case "entry/delete": return { ...state, entries: state.entries.filter((e) => e.id !== action.id) };
    case "override/set": return { ...state, overrides: { ...state.overrides, [action.id]: { ...state.overrides[action.id], ...action.override } } };
    case "account/upsert": return { ...state, accounts: upsert(state.accounts, action.account) };
    case "account/archive": return { ...state, accounts: state.accounts.map((a) => (a.id === action.id ? { ...a, archived: true } : a)) };
    case "category/upsert": return { ...state, categories: upsert(state.categories, action.category) };
    case "category/delete": return { ...state, categories: state.categories.filter((c) => c.id !== action.id || !c.custom).map((c) => (c.parentId === action.id ? { ...c, parentId: undefined } : c)), budgets: state.budgets.filter((b) => b.categoryId !== action.id), entries: state.entries.map((e) => (e.categoryId === action.id ? { ...e, categoryId: e.kind === "in" ? "bonus" : "lainnya" } : e)) };
    case "budget/set": return { ...state, budgets: state.budgets.some((b) => b.categoryId === action.budget.categoryId) ? state.budgets.map((b) => (b.categoryId === action.budget.categoryId ? action.budget : b)) : [...state.budgets, action.budget] };
    case "budget/setMany": { const ids = new Set(action.budgets.map((b) => b.categoryId)); return { ...state, budgets: [...state.budgets.filter((b) => !ids.has(b.categoryId)), ...action.budgets] }; }
    case "budget/delete": return { ...state, budgets: state.budgets.filter((b) => b.categoryId !== action.categoryId) };
    case "goal/upsert": return { ...state, goals: upsert(state.goals, action.goal) };
    case "goal/delete": return { ...state, goals: state.goals.filter((g) => g.id !== action.id) };
    case "goal/deposit": return { ...state, goals: state.goals.map((g) => (g.id === action.id ? { ...g, deposits: [...g.deposits, { at: action.at, amount: action.amount }] } : g)) };
    case "goal/depositEdit": return { ...state, goals: state.goals.map((g) => (g.id === action.id ? { ...g, deposits: g.deposits.map((d, i) => (i === action.index ? { ...d, amount: action.amount } : d)) } : g)) };
    case "goal/depositDelete": return { ...state, goals: state.goals.map((g) => (g.id === action.id ? { ...g, deposits: g.deposits.filter((_, i) => i !== action.index) } : g)) };
    case "debt/unsettle": return { ...state, debts: state.debts.map((d) => (d.id === action.id ? { ...d, settled: false } : d)) };
    case "debt/pay": return { ...state, debts: state.debts.map((d) => { if (d.id !== action.id) return d; const payments = [...(d.payments ?? []), { at: action.at, amount: action.amount }]; return { ...d, payments, settled: payments.reduce((s, p) => s + p.amount, 0) >= d.amount }; }) };
    case "debt/payDelete": return { ...state, debts: state.debts.map((d) => { if (d.id !== action.id) return d; const payments = (d.payments ?? []).filter((_, i) => i !== action.index); return { ...d, payments, settled: payments.reduce((s, p) => s + p.amount, 0) >= d.amount }; }) };
    case "debt/upsert": return { ...state, debts: upsert(state.debts, action.debt) };
    case "debt/delete": return { ...state, debts: state.debts.filter((d) => d.id !== action.id) };
    case "debt/settle": return { ...state, debts: state.debts.map((d) => (d.id === action.id ? { ...d, settled: true } : d)) };
    case "loan/upsert": return withLoanBill({ ...state, loans: upsert(state.loans, action.loan) }, action.loan);
    case "loan/delete": { const l = state.loans.find((x) => x.id === action.id); return { ...state, loans: state.loans.filter((x) => x.id !== action.id), bills: l ? state.bills.filter((b) => b.id !== (l.billId ?? `ln-${l.id}`)) : state.bills }; }
    case "loan/pay": {
      const l = state.loans.find((x) => x.id === action.id);
      if (!l) return state;
      const next = action.extra ? payExtra(l, action.amount, action.at, action.mode) : payRegular(l, action.amount, action.at);
      const out = withLoanBill({ ...state, loans: upsert(state.loans, next) }, next);
      if (action.extra || isDone(next)) return out;
      const id = next.billId ?? `ln-${next.id}`, month = monthKeyOf(action.at);
      return { ...out, bills: out.bills.map((b) => (b.id === id ? { ...b, paid: [...new Set([...b.paid, month])] } : b)) };
    }
    case "bill/upsert": return { ...state, bills: upsert(state.bills, action.bill) };
    case "bill/delete": return { ...state, bills: state.bills.filter((b) => b.id !== action.id) };
    case "bill/pay": return { ...state, bills: state.bills.map((b) => (b.id === action.id ? { ...b, paid: action.paid ? [...new Set([...b.paid, action.month])] : b.paid.filter((m) => m !== action.month) } : b)) };
    case "pocket/set": return { ...state, pockets: action.pockets };
    case "asset/upsert": return { ...state, assets: upsert(state.assets, action.asset) };
    case "asset/delete": return { ...state, assets: state.assets.filter((a) => a.id !== action.id) };
    case "import": return normalize(action.state);
    case "reset": return emptyState();
  }
}

/** A loan keeps one monthly bill in step with it (amount follows the next instalment); a finished loan has none. */
function withLoanBill(state: FinanceState, loan: Loan): FinanceState {
  const id = loan.billId ?? `ln-${loan.id}`, rest = state.bills.filter((b) => b.id !== id);
  if (isDone(loan)) return { ...state, bills: rest };
  const prior = state.bills.find((b) => b.id === id);
  return { ...state, bills: [...rest, billOf({ ...loan, billId: id }, prior?.paid ?? [])] };
}

/** Accepts anything that was serialized earlier (or imported) and returns a valid state. */
export function normalize(raw: unknown): FinanceState {
  const base = emptyState();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Partial<FinanceState>;
  const arr = <T,>(v: unknown, fallback: T[]): T[] => (Array.isArray(v) ? (v as T[]) : fallback);
  const categories = arr<Category>(r.categories, base.categories);
  for (const d of DEFAULT_CATEGORIES) if (!categories.some((c) => c.id === d.id)) categories.push(d);
  const entries = arr<Entry>(r.entries, []).filter((e) => e && typeof e.id === "string" && Number.isFinite(e.amount) && e.amount > 0 && !Number.isNaN(Date.parse(e.at)));
  return { v: 1, onboarded: Boolean(r.onboarded), accounts: arr<Account>(r.accounts, base.accounts).filter((a) => a && a.id && a.name), categories, entries, budgets: arr<Budget>(r.budgets, []).filter((b) => b && b.categoryId && b.limit > 0), goals: arr<Goal>(r.goals, []), debts: arr<Debt>(r.debts, []), loans: arr<Loan>(r.loans, []).filter((l) => l && l.id && l.name && Number(l.principal) > 0 && Number(l.months) >= 1).map((l) => ({ ...l, balance: Math.max(0, Number(l.balance) || 0), paid: Math.max(0, Number(l.paid) || 0), payments: Array.isArray(l.payments) ? l.payments : [], installment: Number(l.installment) > 0 ? Number(l.installment) : null, note: l.note ?? "" })), overrides: r.overrides && typeof r.overrides === "object" ? (r.overrides as FinanceState["overrides"]) : {},
    bills: arr<Bill>(r.bills, []).filter((b) => b && b.id && b.amount > 0 && b.day >= 1 && b.day <= 31).map((b) => ({ ...b, paid: Array.isArray(b.paid) ? b.paid : [] })),
    pockets: arr<Pocket>(r.pockets, []).filter((p) => p && p.id && p.percent >= 0),
    assets: arr<Asset>(r.assets, []).filter((a) => a && a.id && Number.isFinite(a.value) && a.value >= 0) };
}

export const storageKey = (profileId: string) => `djiwa-finance:v1:${profileId}`;
export function load(profileId: string, storage: Pick<Storage, "getItem"> | null = typeof window !== "undefined" ? window.localStorage : null): FinanceState {
  try { const raw = storage?.getItem(storageKey(profileId)); return raw ? normalize(JSON.parse(raw)) : emptyState(); } catch { return emptyState(); }
}
export function save(profileId: string, state: FinanceState, storage: Pick<Storage, "setItem"> | null = typeof window !== "undefined" ? window.localStorage : null): boolean {
  try { storage?.setItem(storageKey(profileId), JSON.stringify(state)); return true; } catch { return false; }
}
