import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { allEntries } from "./calc";
import { load, reduce, save, storageKey, type Action } from "./store";
import type { Entry, FinanceState } from "./types";
import type { WalletTransaction } from "../wallet-adapter";

/** Local-first finance data: one JSON document per signed-in user, mirrored across tabs. */
export function useFinance(profileId: string, transactions: WalletTransaction[]) {
  const [state, setState] = useState<FinanceState>(() => load(profileId));
  const first = useRef(true);
  useEffect(() => { if (first.current) { first.current = false; return; } save(profileId, state); }, [profileId, state]);
  useEffect(() => {
    const onStorage = (event: StorageEvent) => { if (event.key === storageKey(profileId)) setState(load(profileId)); };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [profileId]);
  const dispatch = useCallback((action: Action) => setState((current) => reduce(current, action)), []);
  const entries: Entry[] = useMemo(() => allEntries(state, transactions), [state, transactions]);
  return { state, dispatch, entries };
}
export type Finance = ReturnType<typeof useFinance>;
