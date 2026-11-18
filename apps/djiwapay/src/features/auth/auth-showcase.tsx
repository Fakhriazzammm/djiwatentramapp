import { useEffect, useState } from "react";
import { AnimatePresence, animate, motion, useMotionValue, useMotionValueEvent, useReducedMotion, useTransform } from "framer-motion";
import type { DayPart } from "../shell/dpx-ui";
import { daypart } from "../../lib/djiwa-pay-format";

const PARTS: { id: DayPart; label: string; emoji: string }[] = [
  { id: "pagi", label: "Pagi", emoji: "🌅" }, { id: "siang", label: "Siang", emoji: "☀️" },
  { id: "sore", label: "Sore", emoji: "🌇" }, { id: "malam", label: "Malam", emoji: "🌙" },
];
const rp = (n: number) => "Rp" + Math.round(n).toLocaleString("id-ID");
const ease = [0.32, 0.72, 0, 1] as const;

/** Picker for the day part; the scene itself is the shared Sky used by Beranda. */
export function DayBackdrop({ part, onPick }: { part: DayPart; onPick: (p: DayPart) => void }) {
  return <div className="dpx-auth-parts" role="group" aria-label="Waktu">
    {PARTS.map((p) => <button key={p.id} type="button" className={p.id === part ? "on" : ""} onClick={() => onPick(p.id)} aria-pressed={p.id === part}>
      {p.id === part ? <motion.i layoutId="auth-part" className="dpx-auth-part-pill" transition={{ type: "spring", stiffness: 420, damping: 34 }} /> : null}
      <span>{p.emoji} {p.id === part ? p.label : ""}</span>
    </button>)}
  </div>;
}

function Count({ to, format = rp, delay = 0 }: { to: number; format?: (n: number) => string; delay?: number }) {
  const v = useMotionValue(0), [text, setText] = useState(format(0)), reduce = useReducedMotion();
  useMotionValueEvent(v, "change", (n) => setText(format(n)));
  useEffect(() => { if (reduce) { v.set(to); return; } v.set(0); const c = animate(v, to, { duration: 1.4, delay, ease }); return () => c.stop(); }, [to, delay, reduce, v]);
  return <>{text}</>;
}

/** Floating stat chips around the mascot. */
export function FloatingStats() {
  const reduce = useReducedMotion();
  const chips = [
    { cls: "a", k: "Saldo", node: <Count to={1250000} delay={0.4} />, d: 0.5 },
    { cls: "b", k: "Hemat bulan ini", node: <Count to={18} format={(n) => `+${Math.round(n)}%`} delay={0.7} />, d: 0.8 },
  ];
  return <>{chips.map((c) => <motion.div key={c.cls} className={`dpx-auth-chip ${c.cls}`} initial={{ opacity: 0, scale: 0.6, y: 12 }} animate={{ opacity: 1, scale: 1, y: reduce ? 0 : [0, -7, 0] }}
    transition={{ opacity: { delay: c.d }, scale: { delay: c.d, type: "spring", stiffness: 300, damping: 16 }, y: reduce ? { duration: 0 } : { delay: c.d + 0.5, duration: 4 + c.d, repeat: Infinity, ease: "easeInOut" } }}
    whileTap={{ scale: 0.92 }}><small>{c.k}</small><b>{c.node}</b></motion.div>)}</>;
}

const TABS = [
  { id: "catat", label: "Catat" }, { id: "anggaran", label: "Anggaran" }, { id: "struk", label: "Scan Struk" },
] as const;
type Tab = typeof TABS[number]["id"];

function Typing({ text }: { text: string }) {
  const [n, setN] = useState(0), reduce = useReducedMotion();
  useEffect(() => { if (reduce) { setN(text.length); return; } setN(0); const t = setInterval(() => setN((x) => (x >= text.length ? x : x + 1)), 70); return () => clearInterval(t); }, [text, reduce]);
  return <span>{text.slice(0, n)}<motion.i className="dpx-auth-caret" animate={{ opacity: [1, 0, 1] }} transition={{ duration: 0.9, repeat: Infinity }} /></span>;
}

const WEEK = [38, 62, 30, 80, 54, 92, 46];
const DAYS = ["S", "S", "R", "K", "J", "S", "M"];

function CatatPane() {
  const [hot, setHot] = useState<number | null>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => { const t = setTimeout(() => setShown(true), 1500); return () => clearTimeout(t); }, []);
  return <div>
    <div className="dpx-auth-input"><span>💬</span><Typing text="makan siang 25rb" /></div>
    <AnimatePresence>{shown ? <motion.div className="dpx-auth-row" initial={{ opacity: 0, y: 10, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: "spring", stiffness: 320, damping: 22 }}>
      <em>🍜</em><div><b>Makan siang</b><small>Makanan · hari ini</small></div><strong>-Rp25.000</strong>
    </motion.div> : <div className="dpx-auth-row ghost" />}</AnimatePresence>
    <div className="dpx-auth-bars" aria-label="Pengeluaran minggu ini">
      {WEEK.map((h, i) => <button key={i} type="button" onPointerEnter={() => setHot(i)} onPointerLeave={() => setHot(null)} onClick={() => setHot(i)} aria-label={`Hari ${i + 1}: ${rp(h * 1000)}`}>
        <AnimatePresence>{hot === i ? <motion.u initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>{rp(h * 1000)}</motion.u> : null}</AnimatePresence>
        <motion.span initial={{ height: 0 }} animate={{ height: `${h}%`, opacity: hot === null || hot === i ? 1 : 0.4 }} transition={{ height: { delay: 0.2 + i * 0.07, type: "spring", stiffness: 140, damping: 16 } }} />
        <small>{DAYS[i]}</small>
      </button>)}
    </div>
  </div>;
}

const SLICES = [{ n: "Makan", p: 42, c: "#c9461b" }, { n: "Transport", p: 26, c: "#e9a23b" }, { n: "Tagihan", p: 20, c: "#2b2620" }, { n: "Lainnya", p: 12, c: "#b8a98f" }];
function AnggaranPane() {
  const [hot, setHot] = useState<number | null>(null);
  const R = 34, C = 2 * Math.PI * R; let acc = 0;
  return <div className="dpx-auth-budget">
    <div className="dpx-auth-donut">
      <svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r={R} fill="none" stroke="rgba(43,38,32,.08)" strokeWidth="13" />
        {SLICES.map((s, i) => { const len = (s.p / 100) * C, off = acc; acc += len;
          return <motion.circle key={s.n} cx="50" cy="50" r={R} fill="none" stroke={s.c} strokeWidth={hot === i ? 16 : 13} strokeDasharray={`${len - 1.5} ${C}`} strokeDashoffset={-off} strokeLinecap="butt" transform="rotate(-90 50 50)"
            initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: hot === null || hot === i ? 1 : 0.3 }} transition={{ pathLength: { delay: 0.15 + i * 0.18, duration: 0.7, ease }, opacity: { duration: 0.2 } }} />; })}
      </svg>
      <div><small>{hot === null ? "Terpakai" : SLICES[hot].n}</small><b><Count key={hot ?? "all"} to={hot === null ? 68 : SLICES[hot].p} format={(n) => `${Math.round(n)}%`} /></b></div>
    </div>
    <ul>{SLICES.map((s, i) => <motion.li key={s.n} onPointerEnter={() => setHot(i)} onPointerLeave={() => setHot(null)} onClick={() => setHot(hot === i ? null : i)} initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 + i * 0.08 }} whileTap={{ scale: 0.97 }}>
      <i style={{ background: s.c }} /><span>{s.n}</span>
      <div className="bar"><motion.div style={{ background: s.c }} initial={{ width: 0 }} animate={{ width: `${s.p * 2}%` }} transition={{ delay: 0.3 + i * 0.1, duration: 0.8, ease }} /></div>
    </motion.li>)}</ul>
  </div>;
}

const ITEMS = [{ n: "Nasi ayam geprek", v: 28000 }, { n: "Es teh manis", v: 8000 }, { n: "Kerupuk", v: 4000 }];
function StrukPane() {
  const [run, setRun] = useState(0), [found, setFound] = useState(0), reduce = useReducedMotion();
  useEffect(() => {
    setFound(reduce ? 4 : 0); if (reduce) return;
    const ts = [0, 1, 2, 3].map((i) => setTimeout(() => setFound(i + 1), 700 + i * 650));
    return () => ts.forEach(clearTimeout);
  }, [run, reduce]);
  const total = ITEMS.reduce((a, x) => a + x.v, 0);
  return <div className="dpx-auth-scan">
    <motion.button type="button" className="dpx-auth-paper" onClick={() => setRun((n) => n + 1)} aria-label="Pindai ulang struk" whileTap={{ scale: 0.96, rotate: -2 }} whileHover={{ y: -3 }}>
      <b>WARUNG DJIWA</b>
      {[0, 1, 2, 3, 4, 5].map((i) => <i key={i} style={{ width: `${90 - i * 9}%` }} />)}
      {reduce ? null : <motion.span key={run} className="dpx-auth-laser" initial={{ top: "0%" }} animate={{ top: ["0%", "100%", "0%"] }} transition={{ duration: 2.6, ease: "easeInOut" }} />}
    </motion.button>
    <div className="dpx-auth-found">
      <AnimatePresence>{ITEMS.map((x, i) => found > i ? <motion.div key={`${run}-${x.n}`} className="it" initial={{ opacity: 0, x: 16, scale: 0.9 }} animate={{ opacity: 1, x: 0, scale: 1 }} transition={{ type: "spring", stiffness: 320, damping: 20 }}><span>{x.n}</span><b>{rp(x.v)}</b></motion.div> : null)}</AnimatePresence>
      {found >= 4 ? <motion.div key={`t${run}`} className="tot" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 14 }}>✅ Tercatat · <b>{rp(total)}</b></motion.div> : <div className="tot ghost">Memindai…</div>}
      <small>Ketuk struk untuk memindai ulang</small>
    </div>
  </div>;
}

/** Auto-advancing, tappable preview of what the app does. */
export function FeatureShowcase() {
  const [tab, setTab] = useState<Tab>("catat"), [still, setStill] = useState(false), reduce = useReducedMotion();
  useEffect(() => {
    if (still || reduce) return;
    const t = setTimeout(() => setTab((c) => TABS[(TABS.findIndex((x) => x.id === c) + 1) % TABS.length].id), 6500);
    return () => clearTimeout(t);
  }, [tab, still, reduce]);
  const pick = (id: Tab) => { setStill(true); setTab(id); };
  return <motion.section className="dpx-auth-show" initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25, duration: 0.6, ease }} aria-label="Fitur Djiwa Pay">
    <div className="dpx-auth-tabs" role="tablist">{TABS.map((t) => <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? "on" : ""} onClick={() => pick(t.id)}>
      {tab === t.id ? <motion.i layoutId="auth-tab" className="dpx-auth-tab-pill" transition={{ type: "spring", stiffness: 420, damping: 34 }} /> : null}<span>{t.label}</span></button>)}</div>
    <div className="dpx-auth-pane">
      <AnimatePresence mode="wait"><motion.div key={tab} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.26, ease }}>
        {tab === "catat" ? <CatatPane /> : tab === "anggaran" ? <AnggaranPane /> : <StrukPane />}
      </motion.div></AnimatePresence>
      {!still && !reduce ? <motion.div key={tab} className="dpx-auth-timer" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 6.5, ease: "linear" }} /> : null}
    </div>
  </motion.section>;
}

/** Day part from the clock, then drifting through the rest. */
export function useDrift() {
  const [part, setPart] = useState<DayPart>(() => daypart()), [held, setHeld] = useState(false), reduce = useReducedMotion();
  useEffect(() => {
    if (held || reduce) return;
    const t = setTimeout(() => setPart((p) => PARTS[(PARTS.findIndex((x) => x.id === p) + 1) % PARTS.length].id), 5000);
    return () => clearTimeout(t);
  }, [part, held, reduce]);
  return { part, pick: (p: DayPart) => { setHeld(true); setPart(p); } };
}

