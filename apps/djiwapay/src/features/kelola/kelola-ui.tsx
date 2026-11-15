import { motion } from "framer-motion";
import { useId } from "react";
import { ease } from "../shell/dpx-ui";

/** Area chart that draws itself. Zero line is dashed when the series dips below it. */
export function AreaChart({ points, height = 96, color = "#d14b1a", marks = [], label }: { points: number[]; height?: number; color?: string; marks?: { i: number; color: string }[]; label: string }) {
  const id = useId().replace(/:/g, ""), w = 340;
  if (points.length < 2) return null;
  const min = Math.min(...points, 0), max = Math.max(...points, 1), span = max - min || 1;
  const x = (i: number) => (i / (points.length - 1)) * w, y = (v: number) => height - 8 - ((v - min) / span) * (height - 18);
  const d = points.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  return <svg viewBox={`0 0 ${w} ${height}`} style={{ width: "100%", height, display: "block" }} preserveAspectRatio="none" role="img" aria-label={label}>
    <defs><linearGradient id={id} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={color} stopOpacity=".28" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
    {min < 0 ? <line x1="0" x2={w} y1={y(0)} y2={y(0)} stroke="#d23a2a" strokeDasharray="4 4" opacity=".55" /> : null}
    <motion.path d={`${d} L${w} ${height} L0 ${height} Z`} fill={`url(#${id})`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.3 }} />
    <motion.path d={d} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.9, ease }} />
    {marks.map((m) => <motion.circle key={m.i} cx={x(m.i)} cy={y(points[m.i])} r="4.5" fill="#fff" stroke={m.color} strokeWidth="2.5" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.8 + m.i * 0.01, type: "spring", stiffness: 300, damping: 14 }} style={{ transformOrigin: `${x(m.i)}px ${y(points[m.i])}px` }} />)}
  </svg>;
}

/** Score ring that sweeps in. */
export function ScoreRing({ score, tone, small = "/ 100" }: { score: number; tone: "ok" | "warn" | "bad"; small?: string }) {
  const r = 54, c = 2 * Math.PI * r, color = tone === "ok" ? "#13804a" : tone === "warn" ? "#d9941a" : "#d23a2a";
  return <div className="dpx-ring" role="img" aria-label={`Skor ${score} dari 100`}><svg viewBox="0 0 132 132"><circle cx="66" cy="66" r={r} fill="none" stroke="rgba(45,36,29,.08)" strokeWidth="13" /><motion.circle cx="66" cy="66" r={r} fill="none" stroke={color} strokeWidth="13" strokeLinecap="round" strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - Math.min(100, score) / 100) }} transition={{ duration: 1, ease }} /></svg>
    <div className="dpx-c"><b>{score}</b><span>{small}</span></div></div>;
}

export const short = (n: number) => { const a = Math.abs(n), s = n < 0 ? "−" : ""; return a >= 1e9 ? `${s}${(a / 1e9).toFixed(1).replace(".", ",")} M` : a >= 1e6 ? `${s}${(a / 1e6).toFixed(1).replace(".", ",").replace(",0", "")} jt` : a >= 1e3 ? `${s}${Math.round(a / 1e3)} rb` : `${s}${a}`; };
export const toneColor = (t: "ok" | "warn" | "bad") => (t === "ok" ? "var(--ok)" : t === "warn" ? "var(--warn)" : "var(--danger)");
