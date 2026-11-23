import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Ic, spring } from "../shell/dpx-ui";

export type Proc = { label: string; done: number; total: number; phase: "run" | "done"; doneText?: string };

/** Approving or ignoring takes a moment: this says so while it happens (rows flowing into the ledger, a bar that always moves, the count climbing) and then confirms with a check. */
export function ProcessingOverlay({ proc }: { proc: Proc | null }) {
  if (typeof document === "undefined") return null;
  return createPortal(<AnimatePresence>{proc ? <motion.div key="proc" className="dpx dpx-proc" role="status" aria-live="polite" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
    <motion.div className="dpx-proc-card" initial={{ scale: 0.92, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, y: 8, opacity: 0 }} transition={spring}>
      <AnimatePresence mode="wait" initial={false}>
        {proc.phase === "run" ? <motion.div key="run" className="run" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 0.9 }}>
          <div className="ledger" aria-hidden="true"><i /><i /><i /><u /></div>
          <b>{proc.label}</b>
          <Count proc={proc} />
          <div className="bar" aria-hidden="true"><i className={proc.total > 1 ? "" : "indet"} style={proc.total > 1 ? { width: `${Math.max(6, Math.round((proc.done / proc.total) * 100))}%` } : undefined} /></div>
        </motion.div> : <motion.div key="done" className="ok" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={spring}>
          <span className="burst"><motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ ...spring, delay: 0.05 }}><Ic n="check" size="lg" /></motion.span></span>
          <b>{proc.doneText ?? "Selesai"}</b>
        </motion.div>}
      </AnimatePresence>
    </motion.div>
  </motion.div> : null}</AnimatePresence>, document.body);
}

function Count({ proc }: { proc: Proc }) {
  const [shown, setShown] = useState(proc.done);
  useEffect(() => { let raf = 0; const from = shown, to = proc.done, start = performance.now(); const tick = (t: number) => { const k = Math.min(1, (t - start) / 450); setShown(from + (to - from) * (1 - Math.pow(1 - k, 3))); if (k < 1) raf = requestAnimationFrame(tick); }; raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf); }, [proc.done]);   // eslint-disable-line react-hooks/exhaustive-deps
  return proc.total > 1 ? <span className="n"><em>{Math.round(shown)}</em> dari {proc.total}</span> : <span className="n">Sebentar ya…</span>;
}
