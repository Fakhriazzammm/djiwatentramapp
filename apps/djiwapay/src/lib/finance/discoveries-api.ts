import { useCallback, useEffect, useMemo, useState } from "react";
import { call } from "./integrations";
import { findDiscoveries, type Decision, type Discovery } from "./discover";
import type { Finance } from "./use-finance";

const post = (path: string, body: unknown) => call<{ success: true }>(path, { method: "POST", body: JSON.stringify(body) });
const cacheKey = (id: string) => `djiwa-disc-decisions:${id}`;
const readCache = (id: string): Decision[] => { try { return JSON.parse(window.localStorage.getItem(cacheKey(id)) || "[]") as Decision[]; } catch { return []; } };
const writeCache = (id: string, list: Decision[]) => { try { window.localStorage.setItem(cacheKey(id), JSON.stringify(list.slice(-400))); } catch { /* optional */ } };

/** What was found in the records and not answered yet. Answers live on the server (every device agrees) and in a local copy (works offline). */
export function useDiscoveries(fin: Finance) {
  const [decisions, setDecisions] = useState<Decision[]>(() => readCache(fin.profileId));
  const [ready, setReady] = useState(false);
  const refresh = useCallback(async () => {
    try { const r = await call<{ decisions: Decision[] }>("/discoveries"); setDecisions(r.decisions); writeCache(fin.profileId, r.decisions); } catch { /* keep the local copy */ } finally { setReady(true); }
  }, [fin.profileId]);
  useEffect(() => { void refresh(); const f = () => { if (document.visibilityState === "visible") void refresh(); }; document.addEventListener("visibilitychange", f); return () => document.removeEventListener("visibilitychange", f); }, [refresh]);

  const items: Discovery[] = useMemo(() => findDiscoveries(fin.raw, fin.raw.entries, decisions, new Date()), [fin.raw, decisions]);

  const decide = useCallback(async (keys: string[], status: Decision["status"], days = 7) => {
    const until = status === "snoozed" ? new Date(Date.now() + days * 86_400_000).toISOString() : null;
    const next = [...decisions.filter((d) => !keys.includes(d.key)), ...keys.map((key) => ({ key, status, until }))];
    setDecisions(next); writeCache(fin.profileId, next);
    try { await post("/discoveries/decide", { keys, status, days }); } catch { /* the local copy still hides it; the next refresh reconciles */ }
  }, [decisions, fin.profileId]);
  const undo = useCallback(async (keys: string[]) => {
    const next = decisions.filter((d) => !keys.includes(d.key));
    setDecisions(next); writeCache(fin.profileId, next);
    try { await post("/discoveries/undo", { keys }); } catch { /* reconciled on refresh */ }
  }, [decisions, fin.profileId]);
  const merge = (from: string, to: string) => post("/discoveries/merge", { from, to });
  const unmerge = (from: string) => post("/discoveries/unmerge", { from });
  return { items, ready, decide, undo, merge, unmerge, refresh };
}
export type Discoveries = ReturnType<typeof useDiscoveries>;
