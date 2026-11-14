import { normalize } from "./store";
import type { FinanceState } from "./types";

/** Local-first sync helpers. Pure: the network lives in use-finance. */
export type Table = "accounts" | "categories" | "entries" | "budgets" | "goals" | "debts";
export const TABLES: Table[] = ["accounts", "categories", "entries", "budgets", "goals", "debts"];
const keyOf: Record<Table, (x: any) => string> = { accounts: (x) => x.id, categories: (x) => x.id, entries: (x) => x.id, budgets: (x) => x.categoryId, goals: (x) => x.id, debts: (x) => x.id };

export type Snapshot = Record<Table, Record<string, string>> & { profile: string };
export type SyncBody = { upserts: Partial<Record<Table, unknown[]>>; deletes: Partial<Record<Table, string[]>>; profile?: { onboarded: boolean; overrides: FinanceState["overrides"] } };

const profileOf = (s: FinanceState) => JSON.stringify([s.onboarded, s.overrides]);
export const emptySnapshot = (): Snapshot => ({ accounts: {}, categories: {}, entries: {}, budgets: {}, goals: {}, debts: {}, profile: "" });
export function snapshotOf(state: FinanceState): Snapshot {
  const snap = emptySnapshot();
  for (const t of TABLES) for (const item of state[t] as unknown[]) snap[t][keyOf[t](item)] = JSON.stringify(item);
  snap.profile = profileOf(state);
  return snap;
}

/** What changed since `snap`; `body === null` when nothing did. */
export function diffState(snap: Snapshot, state: FinanceState): SyncBody | null {
  const body: SyncBody = { upserts: {}, deletes: {} };
  let dirty = false;
  for (const t of TABLES) {
    const seen = new Set<string>(), up: unknown[] = [];
    for (const item of state[t] as unknown[]) { const k = keyOf[t](item); seen.add(k); if (snap[t][k] !== JSON.stringify(item)) up.push(item); }
    const del = Object.keys(snap[t]).filter((k) => !seen.has(k));
    if (up.length) { body.upserts[t] = up; dirty = true; }
    if (del.length) { body.deletes[t] = del; dirty = true; }
  }
  if (snap.profile !== profileOf(state)) { body.profile = { onboarded: state.onboarded, overrides: state.overrides }; dirty = true; }
  return dirty ? body : null;
}

/** First contact between a device's local data and the server's: union by id, the server wins on conflicts. */
export function mergeStates(local: FinanceState, server: FinanceState): FinanceState {
  const union = <T,>(a: T[], b: T[], key: (x: T) => string) => { const m = new Map<string, T>(); for (const x of a) m.set(key(x), x); for (const x of b) m.set(key(x), x); return [...m.values()]; };
  return normalize({
    v: 1, onboarded: local.onboarded || server.onboarded,
    accounts: union(local.accounts, server.accounts, (x) => x.id), categories: union(local.categories, server.categories, (x) => x.id),
    entries: union(local.entries, server.entries, (x) => x.id).sort((x, y) => Date.parse(y.at) - Date.parse(x.at)),
    budgets: union(local.budgets, server.budgets, (x) => x.categoryId), goals: union(local.goals, server.goals, (x) => x.id), debts: union(local.debts, server.debts, (x) => x.id),
    overrides: { ...local.overrides, ...server.overrides },
  });
}

const BASE = "/api/finance";
export type ServerState = { exists: boolean; version: number; state: FinanceState };
export class Unauthorized extends Error {}
async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { credentials: "include", ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  if (res.status === 401) throw new Unauthorized();
  if (!res.ok) throw new Error(`HTTP_${res.status}`);
  return res.json() as Promise<T>;
}
export const fetchServerState = async (): Promise<ServerState> => { const r = await call<ServerState & { success: boolean }>("/state"); return { exists: r.exists, version: r.version, state: normalize(r.state) }; };
export const pushDiff = (body: SyncBody) => call<{ version: number }>("/sync", { method: "POST", body: JSON.stringify(body) });

export const metaKey = (profileId: string) => `djiwa-finance-sync:v1:${profileId}`;
export function loadSnapshot(profileId: string): Snapshot | null { try { const raw = window.localStorage.getItem(metaKey(profileId)); return raw ? (JSON.parse(raw) as Snapshot) : null; } catch { return null; } }
export function saveSnapshot(profileId: string, snap: Snapshot) { try { window.localStorage.setItem(metaKey(profileId), JSON.stringify(snap)); } catch { /* quota: next sync resends */ } }
