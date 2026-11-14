import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { allEntries } from "./calc";
import { load, reduce, save, storageKey, type Action } from "./store";
import { diffState, emptySnapshot, fetchServerState, loadSnapshot, mergeStates, pushDiff, saveSnapshot, snapshotOf, type Snapshot } from "./sync";
import type { Entry, FinanceState } from "./types";
import type { WalletTransaction } from "../wallet-adapter";

export type SyncStatus = "starting" | "syncing" | "ok" | "offline";

/** Local-first finance data mirrored to the Djiwa Pay Postgres through /api/finance. Works fully offline; syncs when it can. */
export function useFinance(profileId: string, transactions: WalletTransaction[]) {
  const [state, setState] = useState<FinanceState>(() => load(profileId));
  const [sync, setSync] = useState<{ status: SyncStatus; at?: number }>({ status: "starting" });
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
    try {
      await pushDiff(body);
      snap.current = snapshotOf(sent); saveSnapshot(profileId, snap.current);
      setSync({ status: "ok", at: Date.now() });
    } catch { setSync((s) => ({ ...s, status: "offline" })); }
    finally { busy.current = false; if (diffState(snap.current!, stateRef.current)) timer.current = setTimeout(push, 1500); }
  }, [profileId]);

  const pull = useCallback(async () => {
    if (busy.current) return;
    busy.current = true; lastPull.current = Date.now(); setSync((s) => ({ ...s, status: "syncing" }));
    try {
      const server = await fetchServerState();
      const local = stateRef.current, stored = snap.current;
      const pending = !stored || diffState(stored, local) !== null;
      const merged = server.exists ? (pending ? mergeStates(local, server.state) : server.state) : local;
      snap.current = server.exists ? snapshotOf(server.state) : emptySnapshot();
      saveSnapshot(profileId, snap.current);
      if (merged !== local) setState(merged);
      stateRef.current = merged; ready.current = true;
      busy.current = false;
      await push();
    } catch { busy.current = false; setSync((s) => ({ ...s, status: "offline" })); }
  }, [profileId, push]);

  useEffect(() => { void pull(); const onVisible = () => { if (document.visibilityState === "visible" && Date.now() - lastPull.current > 20_000) void pull(); }; document.addEventListener("visibilitychange", onVisible); return () => { document.removeEventListener("visibilitychange", onVisible); clearTimeout(timer.current); }; }, [pull]);
  useEffect(() => { if (!ready.current) return; clearTimeout(timer.current); timer.current = setTimeout(push, 1500); return () => clearTimeout(timer.current); }, [state, push]);

  const dispatch = useCallback((action: Action) => setState((current) => reduce(current, action)), []);
  const entries: Entry[] = useMemo(() => allEntries(state, transactions), [state, transactions]);
  return { state, dispatch, entries, sync, retrySync: pull };
}
export type Finance = ReturnType<typeof useFinance>;
