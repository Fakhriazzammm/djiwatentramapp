import { DEFAULT_ACCOUNTS, DEFAULT_CATEGORIES } from "./categories";
import type { Account, Budget, Category, Debt, Entry, FinanceState, Goal, Override } from "./types";

export const emptyState = (): FinanceState => ({ v: 1, onboarded: false, accounts: DEFAULT_ACCOUNTS.map((a) => ({ ...a })), categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })), entries: [], budgets: [], goals: [], debts: [], overrides: {} });

export type Action =
  | { type: "onboard"; accounts: Account[] }
  | { type: "entry/add"; entry: Entry } | { type: "entry/addMany"; entries: Entry[] } | { type: "entry/update"; entry: Entry } | { type: "entry/delete"; id: string } | { type: "entry/restore"; entry: Entry }
  | { type: "override/set"; id: string; override: Override }
  | { type: "account/upsert"; account: Account } | { type: "account/archive"; id: string }
  | { type: "category/upsert"; category: Category } | { type: "category/delete"; id: string }
  | { type: "budget/set"; budget: Budget } | { type: "budget/delete"; categoryId: string }
  | { type: "goal/upsert"; goal: Goal } | { type: "goal/delete"; id: string } | { type: "goal/deposit"; id: string; at: string; amount: number }
  | { type: "debt/upsert"; debt: Debt } | { type: "debt/delete"; id: string } | { type: "debt/settle"; id: string }
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
    case "category/delete": return { ...state, categories: state.categories.filter((c) => c.id !== action.id || !c.custom), budgets: state.budgets.filter((b) => b.categoryId !== action.id), entries: state.entries.map((e) => (e.categoryId === action.id ? { ...e, categoryId: e.kind === "in" ? "bonus" : "lainnya" } : e)) };
    case "budget/set": return { ...state, budgets: state.budgets.some((b) => b.categoryId === action.budget.categoryId) ? state.budgets.map((b) => (b.categoryId === action.budget.categoryId ? action.budget : b)) : [...state.budgets, action.budget] };
    case "budget/delete": return { ...state, budgets: state.budgets.filter((b) => b.categoryId !== action.categoryId) };
    case "goal/upsert": return { ...state, goals: upsert(state.goals, action.goal) };
    case "goal/delete": return { ...state, goals: state.goals.filter((g) => g.id !== action.id) };
    case "goal/deposit": return { ...state, goals: state.goals.map((g) => (g.id === action.id ? { ...g, deposits: [...g.deposits, { at: action.at, amount: action.amount }] } : g)) };
    case "debt/upsert": return { ...state, debts: upsert(state.debts, action.debt) };
    case "debt/delete": return { ...state, debts: state.debts.filter((d) => d.id !== action.id) };
    case "debt/settle": return { ...state, debts: state.debts.map((d) => (d.id === action.id ? { ...d, settled: true } : d)) };
    case "import": return normalize(action.state);
    case "reset": return emptyState();
  }
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
  return { v: 1, onboarded: Boolean(r.onboarded), accounts: arr<Account>(r.accounts, base.accounts).filter((a) => a && a.id && a.name), categories, entries, budgets: arr<Budget>(r.budgets, []).filter((b) => b && b.categoryId && b.limit > 0), goals: arr<Goal>(r.goals, []), debts: arr<Debt>(r.debts, []), overrides: r.overrides && typeof r.overrides === "object" ? (r.overrides as FinanceState["overrides"]) : {} };
}

export const storageKey = (profileId: string) => `djiwa-finance:v1:${profileId}`;
export function load(profileId: string, storage: Pick<Storage, "getItem"> | null = typeof window !== "undefined" ? window.localStorage : null): FinanceState {
  try { const raw = storage?.getItem(storageKey(profileId)); return raw ? normalize(JSON.parse(raw)) : emptyState(); } catch { return emptyState(); }
}
export function save(profileId: string, state: FinanceState, storage: Pick<Storage, "setItem"> | null = typeof window !== "undefined" ? window.localStorage : null): boolean {
  try { storage?.setItem(storageKey(profileId), JSON.stringify(state)); return true; } catch { return false; }
}
