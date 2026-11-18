import { useEffect, useState } from "react";
import { AnimatePresence, animate, motion, useMotionValue, useMotionValueEvent, useReducedMotion, useTransform } from "framer-motion";
import type { DayPart } from "../shell/dpx-ui";

const PARTS: { id: DayPart; label: string; emoji: string }[] = [
  { id: "pagi", label: "Pagi", emoji: "🌅" }, { id: "siang", label: "Siang", emoji: "☀️" },
  { id: "sore", label: "Sore", emoji: "🌇" }, { id: "malam", label: "Malam", emoji: "🌙" },
];
const rp = (n: number) => "Rp" + Math.round(n).toLocaleString("id-ID");
const ease = [0.32, 0.72, 0, 1] as const;

/** Background that drifts through the day on its own; the dots let a visitor jump to any moment. */
export function DayBackdrop({ part, onPick }: { part: DayPart; onPick: (p: DayPart) => void }) {
  return <>
    <div className="dpx-auth-bg" aria-hidden="true">
      {PARTS.map((p) => <motion.img key={p.id} src={`/bg/${p.id}.webp`} alt="" decoding="async" initial={false}
        animate={{ opacity: p.id === part ? 1 : 0, scale: p.id === part ? 1.06 : 1 }} transition={{ opacity: { duration: 1.4 }, scale: { duration: 9, ease: "linear" } }} />)}
    </div>
    <div className="dpx-auth-parts" role="group" aria-label="Waktu">
      {PARTS.map((p) => <button key={p.id} type="button" className={p.id === part ? "on" : ""} onClick={() => onPick(p.id)} aria-pressed={p.id === part}>
        {p.id === part ? <motion.i layoutId="auth-part" className="dpx-auth-part-pill" transition={{ type: "spring", stiffness: 420, damping: 34 }} /> : null}
        <span>{p.emoji} {p.id === part ? p.label : ""}</span>
      </button>)}
    </div>
  </>;
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
  { id: "catat", label: "Catat" }, { id: "anggaran", label: "Anggaran" }, { id: "bayar", label: "Bayar" },
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

const ACTIONS = [
  { n: "Isi Saldo", i: "topup", msg: "Isi saldo lewat QRIS & VA" }, { n: "Tagihan", i: "bills", msg: "Listrik, air, BPJS, internet" },
  { n: "Pulsa", i: "send", msg: "Pulsa & paket data semua operator" }, { n: "Scan QR", i: "scan-qr", msg: "Bayar di merchant mana pun" },
];
function BayarPane() {
  const [pick, setPick] = useState(0);
  return <div>
    <div className="dpx-auth-acts">{ACTIONS.map((a, i) => <motion.button key={a.n} type="button" className={pick === i ? "on" : ""} onClick={() => setPick(i)}
      initial={{ opacity: 0, y: 18, scale: 0.8 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: i * 0.08, type: "spring", stiffness: 340, damping: 18 }} whileHover={{ y: -4 }} whileTap={{ scale: 0.9 }}>
      <img src={`/assets/djiwa-pay-actions/${a.i}.webp`} alt="" width={40} height={40} /><span>{a.n}</span>
    </motion.button>)}</div>
    <div className="dpx-auth-say"><AnimatePresence mode="wait"><motion.p key={pick} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22 }}>✨ {ACTIONS[pick].msg} — otomatis tercatat.</motion.p></AnimatePresence></div>
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
        {tab === "catat" ? <CatatPane /> : tab === "anggaran" ? <AnggaranPane /> : <BayarPane />}
      </motion.div></AnimatePresence>
      {!still && !reduce ? <motion.div key={tab} className="dpx-auth-timer" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 6.5, ease: "linear" }} /> : null}
    </div>
  </motion.section>;
}

/** Day part from the clock, then drifting through the rest. */
export function useDrift() {
  const h = new Date().getHours();
  const start: DayPart = h < 5 ? "malam" : h < 11 ? "pagi" : h < 15 ? "siang" : h < 18 ? "sore" : "malam";
  const [part, setPart] = useState<DayPart>(start), [held, setHeld] = useState(false), reduce = useReducedMotion();
  useEffect(() => {
    if (held || reduce) return;
    const t = setTimeout(() => setPart((p) => PARTS[(PARTS.findIndex((x) => x.id === p) + 1) % PARTS.length].id), 5000);
    return () => clearTimeout(t);
  }, [part, held, reduce]);
  return { part, pick: (p: DayPart) => { setHeld(true); setPart(p); } };
}

