import { useEffect, useRef, useState } from "react";

const POLL_MS = 60_000;
const readHash = async (): Promise<string | null> => {
  try {
    const r = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
    if (!r.ok) return null;
    const j = await r.json() as { commitHash?: string };
    return j.commitHash ?? null;
  } catch { return null; }
};
const busy = () => {
  const el = document.activeElement;
  return Boolean(document.querySelector('[role="dialog"]')) || (el instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
};

/** Detects a newer deploy (version.json) so an open tab or PWA never keeps running stale code. */
export function UpdateWatcher() {
  const base = useRef<string | null>(null);
  const [stale, setStale] = useState(false);
  const hiddenAt = useRef(0);
  useEffect(() => {
    if (import.meta.env.DEV) return;
    let alive = true;
    const check = async () => {
      const hash = await readHash();
      if (!alive || !hash) return;
      if (base.current === null) { base.current = hash; return; }
      if (hash !== base.current) setStale(true);
    };
    void check();
    const timer = setInterval(() => void check(), POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "hidden") { hiddenAt.current = Date.now(); return; }
      void check().then(() => {
        // Coming back after a while with nothing open: apply the update silently.
        setStale((was) => { if (was && Date.now() - hiddenAt.current > 20_000 && !busy()) window.location.reload(); return was; });
      });
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => { alive = false; clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, []);
  if (!stale) return null;
  return <div className="dpx-update" role="status"><span>Versi baru Djiwa Pay tersedia.</span><button type="button" onClick={() => window.location.reload()}>Muat ulang</button></div>;
}
