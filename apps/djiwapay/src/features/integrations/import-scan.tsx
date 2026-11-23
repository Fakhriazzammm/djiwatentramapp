import { useEffect, useState } from "react";
import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion } from "framer-motion";
import { Ic } from "../shell/dpx-ui";
import type { ImportState } from "../../lib/finance/integrations";

const STEPS = ["Menghubungi Gmail…", "Membaca email bank dan e-wallet…", "Memisahkan transaksi dari promo…", "Mencocokkan nominal dan penerima…", "Mencari yang sudah pernah tercatat…"];

/** A number that glides to its new value, so progress is felt between the server's updates. */
function Tween({ to, format = (n: number) => String(Math.round(n)) }: { to: number; format?: (n: number) => string }) {
  const v = useMotionValue(to), [text, setText] = useState(format(to)), reduce = useReducedMotion();
  useEffect(() => { if (reduce) { setText(format(to)); return; } const c = animate(v, to, { duration: 0.9, ease: [0.22, 1, 0.36, 1], onUpdate: (n) => setText(format(n)) }); return () => c.stop(); }, [to]);   // eslint-disable-line react-hooks/exhaustive-deps
  return <>{text}</>;
}

/** The scan while it runs: a radar that pings, mail drifting into the tray, a bar that shines and a line that says what is being done. Never a static card. */
export function ImportScanning({ imp }: { imp: ImportState }) {
  const reduce = useReducedMotion(), [step, setStep] = useState(0);
  useEffect(() => { const t = window.setInterval(() => setStep((s) => (s + 1) % STEPS.length), 2600); return () => window.clearInterval(t); }, []);
  const pct = Math.max(2, Math.round(imp.progress * 100));
  const month = imp.scanningTo ? new Date(imp.scanningTo).toLocaleDateString("id-ID", { month: "short", year: "numeric" }) : "";
  return <div className="dpx-isc" role="status" aria-live="polite" aria-label={`Memindai email, ${pct} persen`}>
    <div className="dpx-isc-radar" aria-hidden="true">
      {!reduce ? [0, 1, 2].map((i) => <motion.i key={i} className="ring" initial={{ scale: 0.45, opacity: 0.55 }} animate={{ scale: 1.5, opacity: 0 }} transition={{ duration: 2.4, repeat: Infinity, ease: "easeOut", delay: i * 0.8 }} />) : <i className="ring still" />}
      {!reduce ? <motion.i className="sweep" animate={{ rotate: 360 }} transition={{ duration: 3.2, repeat: Infinity, ease: "linear" }} /> : null}
      <motion.span className="core" animate={reduce ? undefined : { scale: [1, 1.12, 1] }} transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}><Ic n="dl" /></motion.span>
      {!reduce ? [0, 1, 2, 3].map((i) => <motion.b key={i} className="mail" style={{ top: `${14 + i * 21}%` }} initial={{ x: -70, opacity: 0, scale: 0.7 }} animate={{ x: [-70, 0, 0], opacity: [0, 1, 0], scale: [0.7, 1, 0.5] }} transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut", delay: i * 0.55, times: [0, 0.55, 1] }}><Ic n="receipt" size="sm" /></motion.b>) : null}
    </div>
    <div className="dpx-isc-pct"><b><Tween to={pct} />%</b>{month ? <span>sampai <AnimatePresence mode="popLayout" initial={false}><motion.em key={month} initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -10, opacity: 0 }} transition={{ duration: 0.3 }}>{month}</motion.em></AnimatePresence></span> : null}</div>
    <div className="dpx-isc-bar" aria-hidden="true"><motion.i animate={{ width: `${pct}%` }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}>{!reduce ? <motion.u animate={{ x: ["-120%", "320%"] }} transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }} /> : null}</motion.i></div>
    <div className="dpx-isc-line"><AnimatePresence mode="wait" initial={false}><motion.span key={step} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.25 }}>{STEPS[step]}</motion.span></AnimatePresence></div>
    <div className="dpx-isc-stats"><div><b><Tween to={imp.scanned} /></b><span>email diperiksa</span></div><div><b><Tween to={imp.staged} /></b><span>transaksi ditemukan</span></div></div>
  </div>;
}
