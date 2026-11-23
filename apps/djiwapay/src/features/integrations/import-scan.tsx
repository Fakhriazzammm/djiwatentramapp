import { useEffect, useRef, useState } from "react";
import type { ImportState } from "../../lib/finance/integrations";

const counts = new Intl.NumberFormat("id-ID");
const months = new Intl.DateTimeFormat("id-ID", { month: "short", year: "numeric" });
const STEPS = ["Menghubungi Gmail", "Membaca email bank dan e-wallet", "Memisahkan transaksi dari promo", "Mencocokkan nominal dan penerima", "Melewati yang sudah tercatat"];

/** A number that glides to its new value, so progress is felt between the server's updates. Plain requestAnimationFrame: no library, nothing to break in a WebView. */
function useTween(target: number, ms = 800) {
  const [value, setValue] = useState(target), from = useRef(target), shown = useRef(target);
  useEffect(() => {
    if (typeof window === "undefined" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { shown.current = target; setValue(target); return; }
    const start = performance.now(), a = shown.current; from.current = a;
    let raf = 0;
    const tick = (t: number) => { const k = Math.min(1, (t - start) / ms), e = 1 - Math.pow(1 - k, 3); shown.current = a + (target - a) * e; setValue(shown.current); if (k < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return value;
}

const Envelope = () => <svg viewBox="0 0 56 40" width="56" height="40" aria-hidden="true"><rect x="1.5" y="1.5" width="53" height="37" rx="7" fill="#fff" stroke="currentColor" strokeWidth="2" /><path d="M5 9l23 17L51 9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;

/** The scan while it runs: mail floating under a sweeping beam, a bar that always moves (even at 0%), numbers that glide and pop when they grow, and a line that says what is being done. */
export function ImportScanning({ imp }: { imp: ImportState }) {
  const [step, setStep] = useState(0);
  useEffect(() => { if (imp.error) return; const t = window.setInterval(() => setStep((s) => (s + 1) % STEPS.length), 2600); return () => window.clearInterval(t); }, [imp.error]);
  const percent = Math.round(Math.max(0, Math.min(1, imp.progress)) * 100), shownPct = Math.round(useTween(percent)), scanned = Math.round(useTween(imp.scanned)), staged = Math.round(useTween(imp.staged));
  const month = imp.scanningTo ? months.format(new Date(imp.scanningTo)) : null;
  const waiting = Boolean(imp.error), indeterminate = percent < 3 && !waiting;
  return <div className={`dpx-isc ${waiting ? "is-wait" : ""}`} role="status" aria-live="polite" aria-label={`Memindai email, ${percent} persen`}>
    <div className="dpx-isc-stage" aria-hidden="true">
      <i className="halo" />
      <div className="stack"><span className="m m1"><Envelope /></span><span className="m m2"><Envelope /></span><span className="m m3"><Envelope /></span></div>
      <i className="beam" />
    </div>
    <div className="dpx-isc-pct"><b>{shownPct}%</b>{month ? <span>sampai <em key={month}>{month}</em></span> : null}</div>
    <div className="dpx-isc-bar" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}><i className={indeterminate ? "indet" : ""} style={indeterminate ? undefined : { width: `${Math.max(percent, 3)}%` }} /></div>
    <div className="dpx-isc-line"><span key={waiting ? "wait" : step}>{waiting ? "Menunggu pemindaian dilanjutkan" : `${STEPS[step]}…`}</span></div>
    <div className="dpx-isc-stats">
      <div><b key={`s${imp.scanned}`} className="pop">{counts.format(scanned)}</b><span>email diperiksa</span></div>
      <div><b key={`t${imp.staged}`} className="pop">{counts.format(staged)}</b><span>transaksi ditemukan</span></div>
    </div>
  </div>;
}
