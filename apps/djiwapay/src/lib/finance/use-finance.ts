import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { allEntries } from "./calc";
import { effectiveScope, entriesInScope, hasBusiness, scopedState, type Scope } from "./scope";
import { load, reduce, save, storageKey, type Action } from "./store";
import { diffState, emptySnapshot, fetchServerState, loadSnapshot, mergeStates, pushDiff, rebaseLoanChanges, saveSnapshot, snapshotOf, type Snapshot } from "./sync";
import type { Entry, FinanceState } from "./types";
import type { WalletTransaction } from "../wallet-adapter";

const scopeKey = (profileId: string) => `djiwa-fin-scope:${profileId}`;
const loadScope = (profileId: string): Scope => { try { const v = window.localStorage.getItem(scopeKey(profileId)); return v === "personal" || v === "business" ? v : "all"; } catch { return "all"; } };

export type SyncStatus = "starting" | "syncing" | "ok" | "offline" | "loan-conflict";

/** Local-first finance data mirrored to the Djiwa Pay Postgres through /api/finance. Works fully offline; syncs when it can. */
export function useFinance(profileId: string, transactions: WalletTransaction[]) {
  const [state, setState] = useState<FinanceState>(() => load(profileId));
  const [sync, setSync] = useState<{ status: SyncStatus; at?: number }>({ status: "starting" });
  const [loanConflict, setLoanConflict] = useState(false);
  const [scopePick, setScopePick] = useState<Scope>(() => loadScope(profileId));
  const first = useRef(true);
  const stateRef = useRef(state); stateRef.current = state;
  const snap = useRef<Snapshot | null>(loadSnapshot(profileId));
  const ready = useRef(false);   // true once the first pull settled
  const busy = useRef(false);
  const lastPull = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => { if (first.current) { first.current = false; return; } save(profileId, state); }, [profileId, state]);
  useEffect(() => {
    const onStorage = (event: StorageEvent) => { if (event.key === storageKey(profileId)) setState(load(profileId)); };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [profileId]);

  const push = useCallback(async () => {
    if (busy.current || !ready.current || !snap.current) return;
    const sent = stateRef.current, body = diffState(snap.current, sent);
    if (!body) { setSync({ status: "ok", at: Date.now() }); return; }
    busy.current = true; setSync((s) => ({ ...s, status: "syncing" }));
    let conflict = false;
    try {
      await pushDiff(body);
      snap.current = snapshotOf(sent); saveSnapshot(profileId, snap.current);
      setSync({ status: "ok", at: Date.now() });
    } catch (error) {
      conflict = error instanceof Error && error.message === "LOAN_CHANGED_BY_EMAIL";
      setSync((s) => ({ ...s, status: conflict ? "loan-conflict" : "offline" }));
    }
    finally { busy.current = false; if (!conflict && diffState(snap.current!, stateRef.current)) timer.current = setTimeout(push, 1500); }
  }, [profileId]);

  const pull = useCallback(async () => {
    if (busy.current) return;
    busy.current = true; lastPull.current = Date.now(); setSync((s) => ({ ...s, status: "syncing" }));
    try {
      const server = await fetchServerState();
      const local = stateRef.current, stored = snap.current;
      const pending = !stored || diffState(stored, local) !== null;
      const rebased = server.exists && stored && pending ? rebaseLoanChanges(local, server.state, stored) : null;
      if (rebased?.conflict) setLoanConflict(true);
      const merged = server.exists ? (pending ? mergeStates(rebased?.state ?? local, server.state) : server.state) : local;
      snap.current = server.exists ? snapshotOf(server.state) : emptySnapshot();
      saveSnapshot(profileId, snap.current);
      if (merged !== local) setState(merged);
      stateRef.current = merged; ready.current = true;
      busy.current = false;
      await push();
    } catch { busy.current = false; setSync((s) => ({ ...s, status: "offline" })); }
  }, [profileId, push]);

  useEffect(() => { void pull(); const onVisible = () => { if (document.visibilityState === "visible" && Date.now() - lastPull.current > 20_000) void pull(); }; document.addEventListener("visibilitychange", onVisible); // Edits made in the user's Google Sheet arrive on the server; while the app is open, look for them every minute.
    const poll = window.setInterval(() => { if (document.visibilityState === "visible" && Date.now() - lastPull.current > 55_000) void pull(); }, 60_000);
    return () => { document.removeEventListener("visibilitychange", onVisible); window.clearInterval(poll); clearTimeout(timer.current); }; }, [pull]);
  useEffect(() => { if (!ready.current) return; clearTimeout(timer.current); timer.current = setTimeout(push, 1500); return () => clearTimeout(timer.current); }, [state, push]);

  const dispatch = useCallback((action: Action) => setState((current) => reduce(current, action)), []);
  const scope = effectiveScope(scopePick, state.accounts);
  const setScope = useCallback((next: Scope) => { setScopePick(next); try { window.localStorage.setItem(scopeKey(profileId), next); } catch { /* optional */ } }, [profileId]);
  const allRecords: Entry[] = useMemo(() => allEntries(state, transactions), [state, transactions]);
  // Pages compute from `state` and `entries`, which are the slice for the chosen scope; `raw` and `allRecords` are everything.
  const view = useMemo(() => scopedState(state, scope), [state, scope]);
  const entries: Entry[] = useMemo(() => entriesInScope(allRecords, state.accounts, scope), [allRecords, state.accounts, scope]);
  const business = useMemo(() => hasBusiness(state.accounts), [state.accounts]);
  return { state: view, raw: state, dispatch, entries, allRecords, scope, setScope, hasBusiness: business, sync, loanConflict, retrySync: pull };
}
export type Finance = ReturnType<typeof useFinance>;
