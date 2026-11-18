import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { animate, AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { compact, dShort, nf, pctChange } from "./admin-data";

export const COLORS = ["#1a5dc6", "#c73822", "#166534", "#9a6200", "#7a3fb0", "#0e7490", "#be185d", "#555560"];

const EASE = [0.22, 1, 0.36, 1] as const;
export function Panel({ title, meta, action, children, flush, className = "" }: { title?: ReactNode; meta?: ReactNode; action?: ReactNode; children: ReactNode; flush?: boolean; className?: string }) {
  return <motion.section className={`adm-panel ${className}`} initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "0px 0px -40px 0px" }} transition={{ duration: 0.38, ease: EASE }}>{title !== undefined ? <header><span className="adm-lab">{title}</span>{action ?? (meta !== undefined ? <span className="adm-meta">{meta}</span> : null)}</header> : null}<div className={flush ? "adm-flush" : "adm-pad"}>{children}</div></motion.section>;
}

/** Counts every number inside a formatted string up from zero ("Rp4.200.000", "37,3%", "1.840 tampilan"). Falls back to plain text when motion is reduced. */
const NUM = /\d[\d.]*(?:,\d+)?/g;
export function AnimText({ text, duration = 0.9 }: { text: string; duration?: number }) {
  const reduce = useReducedMotion(), [shown, setShown] = useState(text);
  useEffect(() => {
    if (reduce) { setShown(text); return; }
    const toks = text.match(NUM) ?? []; if (!toks.length) { setShown(text); return; }
    const vals = toks.map((t) => Number(t.replace(/\./g, "").replace(",", "."))), dec = toks.map((t) => (t.includes(",") ? t.split(",")[1].length : 0));
    const c = animate(0, 1, { duration, ease: EASE, onUpdate: (p) => { let i = 0; setShown(text.replace(NUM, () => { const k = i++, v = vals[k] * p; return v.toLocaleString("id-ID", { minimumFractionDigits: dec[k], maximumFractionDigits: dec[k] }); })); } });
    return () => c.stop();
  }, [text, reduce, duration]);
  return <>{shown}</>;
}

export function Delta({ cur, prev, invert = false }: { cur: number; prev: number; invert?: boolean }) {
  const p = pctChange(cur, prev); if (p === null) return <span className="adm-delta">—</span>;
  const up = p >= 0, good = invert ? !up : up;
  return <motion.span className={`adm-delta ${Math.abs(p) < 0.05 ? "" : good ? "up" : "dn"}`} initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.5, type: "spring", stiffness: 380, damping: 18 }}>{up ? <motion.i className="adm-arrow" initial={{ y: 5 }} animate={{ y: 0 }}>▲</motion.i> : <motion.i className="adm-arrow" initial={{ y: -5 }} animate={{ y: 0 }}>▼</motion.i>} {Math.abs(p).toFixed(Math.abs(p) >= 100 ? 0 : 1).replace(".", ",")}%</motion.span>;
}

export type KpiItem = { label: string; value: ReactNode; cur?: number; prev?: number; invert?: boolean; hint?: string; spark?: number[]; tone?: "ok" | "warn" | "bad" };
export function Kpis({ items, cols }: { items: KpiItem[]; cols?: number }) {
  return <div className="adm-kpis" style={cols ? { ["--cols" as string]: cols } : undefined}>{items.map((k, i) => <motion.div key={k.label} className={`adm-kpi ${k.tone ?? ""}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04, duration: 0.4, ease: EASE }} whileHover={{ y: -2 }}>
    <span className="adm-lab">{k.label}</span><b>{typeof k.value === "string" ? <AnimText text={k.value} /> : k.value}</b>
    <div className="adm-kfoot">{k.cur !== undefined && k.prev !== undefined ? <Delta cur={k.cur} prev={k.prev} invert={k.invert} /> : null}{k.hint ? <span className="adm-hint">{k.hint}</span> : null}</div>
    {k.spark && k.spark.length > 1 ? <Spark values={k.spark} /> : null}</motion.div>)}</div>;
}

export function Spark({ values, color = "#1a5dc6" }: { values: number[]; color?: string }) {
  const w = 100, h = 26, max = Math.max(...values, 1), min = Math.min(...values, 0), span = max - min || 1;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * w).toFixed(1)},${(h - 2 - ((v - min) / span) * (h - 4)).toFixed(1)}`).join(" ");
  return <svg className="adm-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true"><motion.polyline points={pts} fill="none" stroke={color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.9, delay: 0.2, ease: EASE }} /></svg>;
}

export function Tabs<T extends string>({ items, value, onChange }: { items: readonly (readonly [T, string])[]; value: T; onChange: (v: T) => void }) {
  const id = useId();
  return <div className="adm-tabs" role="tablist">{items.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={value === k} className={value === k ? "on" : ""} onClick={() => onChange(k)}>{value === k ? <motion.span layoutId={`hl${id}`} className="adm-hl" transition={{ type: "spring", stiffness: 420, damping: 34 }} /> : null}<span className="adm-t">{l}</span></button>)}</div>;
}

export const Empty = ({ children = "Belum ada data pada rentang ini." }: { children?: ReactNode }) => <motion.div className="adm-empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>{children}</motion.div>;
export const Loading = () => <div className="adm-loading" aria-busy="true"><i /><i /><i /></div>;

/** Time series as lines or bars, with a crosshair readout. Handles any number of days by thinning the x labels. */
export type Serie = { name: string; color?: string; values: number[]; money?: boolean };
export function TimeChart({ labels, series, kind = "line", height = 190, fmtLabel = dShort, stacked = false }: { labels: string[]; series: Serie[]; kind?: "line" | "bar"; height?: number; fmtLabel?: (l: string) => string; stacked?: boolean }) {
  const id = useId().replace(/:/g, ""), ref = useRef<SVGSVGElement>(null), [hover, setHover] = useState<number | null>(null), sig = `${kind}${labels.length}${labels[0]}${series.map((x) => x.values.reduce((a, b) => a + b, 0)).join(",")}`;
  const W = 640, PL = 44, PR = 8, PT = 8, PB = 20, n = labels.length;
  const totals = useMemo(() => labels.map((_, i) => series.reduce((s, x) => s + (x.values[i] || 0), 0)), [labels, series]);
  const max = Math.max(1, ...(stacked ? totals : series.flatMap((s) => s.values))), nice = (() => { const p = Math.pow(10, Math.floor(Math.log10(max))), m = max / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p; })();
  if (n === 0) return <Empty />;
  const X = (i: number) => (kind === "bar" ? PL + ((i + 0.5) / n) * (W - PL - PR) : PL + (n === 1 ? 0.5 : i / (n - 1)) * (W - PL - PR)), Y = (v: number) => PT + (1 - v / nice) * (height - PT - PB);
  const bw = Math.max(2, ((W - PL - PR) / n) * 0.7 / (stacked ? 1 : series.length));
  const step = Math.max(1, Math.ceil(n / 7)), ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => nice * t);
  const move = (e: React.PointerEvent) => { const r = ref.current?.getBoundingClientRect(); if (!r) return; const x = ((e.clientX - r.left) / r.width) * W; setHover(Math.max(0, Math.min(n - 1, Math.round(kind === "bar" ? ((x - PL) / (W - PL - PR)) * n - 0.5 : ((x - PL) / (W - PL - PR)) * (n - 1))))); };
  const fmtV = (s: Serie, v: number) => (s.money ? `Rp${nf(v)}` : nf(v));
  return <div className="adm-chart">
    <svg ref={ref} viewBox={`0 0 ${W} ${height}`} role="img" onPointerMove={move} onPointerDown={move} onPointerLeave={() => setHover(null)}>
      {ticks.map((t) => <g key={t}><line x1={PL} x2={W - PR} y1={Y(t)} y2={Y(t)} className="adm-grid" /><text x={PL - 5} y={Y(t) + 3} textAnchor="end" className="adm-ax">{compact(t)}</text></g>)}
      {labels.map((l, i) => (i % step === 0 || i === n - 1) && (i === n - 1 ? (n - 1) % step === 0 || n < 8 : true) ? <text key={l} x={X(i)} y={height - 5} textAnchor="middle" className="adm-ax">{fmtLabel(l)}</text> : null)}
      {kind === "line" ? series.map((s, k) => { const c = s.color ?? COLORS[k % COLORS.length], d = s.values.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(" ");
        return <g key={s.name}>{k === 0 && series.length === 1 ? <><defs><linearGradient id={`${id}g`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={c} stopOpacity=".18" /><stop offset="1" stopColor={c} stopOpacity="0" /></linearGradient></defs><motion.path key={sig} d={`${d} L${X(n - 1)} ${Y(0)} L${X(0)} ${Y(0)} Z`} fill={`url(#${id}g)`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5, duration: 0.6 }} /></> : null}<motion.path key={sig + k} d={d} fill="none" stroke={c} strokeWidth="2" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.9, delay: k * 0.12, ease: EASE }} /></g>; })
        : series.map((s, k) => { const c = s.color ?? COLORS[k % COLORS.length]; return <g key={s.name}>{s.values.map((v, i) => { const base = stacked ? series.slice(0, k).reduce((t, x) => t + (x.values[i] || 0), 0) : 0, x = stacked ? X(i) - bw / 2 : X(i) - (bw * series.length) / 2 + k * bw; return <motion.rect key={`${sig}${i}`} x={x} y={Y(base + v)} width={bw} height={Math.max(0, Y(base) - Y(base + v))} fill={c} style={{ transformBox: "fill-box", transformOrigin: "bottom" }} initial={{ scaleY: 0 }} animate={{ scaleY: 1, opacity: hover === null || hover === i ? 1 : 0.45 }} transition={{ scaleY: { duration: 0.5, delay: Math.min(i * 0.012, 0.5), ease: EASE }, opacity: { duration: 0.15 } }} />; })}</g>; })}
      {hover !== null ? <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }}><line x1={X(hover)} x2={X(hover)} y1={PT} y2={height - PB} className="adm-cross" />{kind === "line" ? series.map((s, k) => <circle key={s.name} cx={X(hover)} cy={Y(s.values[hover] || 0)} r="3.5" fill="#fff" stroke={s.color ?? COLORS[k % COLORS.length]} strokeWidth="2" />) : null}</motion.g> : null}
    </svg>
    <AnimatePresence>{hover !== null ? <motion.div key="tip" className="adm-tip" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0, left: `${Math.min(70, Math.max(0, (X(hover) / W) * 100 - 14))}%` }} exit={{ opacity: 0 }} transition={{ type: "spring", stiffness: 500, damping: 36, opacity: { duration: 0.12 } }}><b>{fmtLabel(labels[hover])}</b>{series.map((s, k) => <span key={s.name}><i style={{ background: s.color ?? COLORS[k % COLORS.length] }} />{s.name} <b>{fmtV(s, s.values[hover] || 0)}</b></span>)}</motion.div> : null}</AnimatePresence>
    {series.length > 1 ? <div className="adm-legend">{series.map((s, k) => <span key={s.name}><i style={{ background: s.color ?? COLORS[k % COLORS.length] }} />{s.name}</span>)}</div> : null}
  </div>;
}

/** Ranked horizontal bars. */
export function Rank({ rows, fmt = nf, color = "#1a5dc6", empty }: { rows: { label: ReactNode; value: number; sub?: ReactNode }[]; fmt?: (n: number) => string; color?: string; empty?: ReactNode }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <Empty>{empty}</Empty>;
  return <ul className="adm-rank">{rows.map((r, i) => <motion.li key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.035, duration: 0.3 }} whileHover={{ x: 3 }}><div className="adm-rank-t"><span title={typeof r.label === "string" ? r.label : undefined}>{r.label}</span><b>{fmt(r.value)}</b></div><div className="adm-rank-b"><motion.i style={{ background: color }} initial={{ width: 0 }} animate={{ width: `${Math.max(2, (r.value / max) * 100)}%` }} transition={{ duration: 0.7, delay: 0.1 + i * 0.04, ease: EASE }} /></div>{r.sub ? <small>{r.sub}</small> : null}</motion.li>)}</ul>;
}

export function Donut({ rows, fmt = nf, center }: { rows: { label: string; value: number }[]; fmt?: (n: number) => string; center?: ReactNode }) {
  const total = rows.reduce((s, r) => s + r.value, 0), [hot, setHot] = useState<number | null>(null); let acc = 0;
  if (!total) return <Empty />;
  return <div className="adm-donut"><div className="adm-donut-c"><svg viewBox="0 0 42 42" aria-hidden="true"><circle cx="21" cy="21" r="15.9" fill="none" stroke="#efeff2" strokeWidth="6" />{rows.map((r, i) => { const p = (r.value / total) * 100, off = -acc, el = <motion.circle key={r.label} cx="21" cy="21" r="15.9" fill="none" stroke={COLORS[i % COLORS.length]} strokeDashoffset={off} transform="rotate(-90 21 21)" initial={{ strokeDasharray: "0 100", strokeWidth: 6 }} animate={{ strokeDasharray: `${Math.max(0, p - 0.6)} ${100 - Math.max(0, p - 0.6)}`, strokeWidth: hot === i ? 8 : 6, opacity: hot === null || hot === i ? 1 : 0.35 }} transition={{ strokeDasharray: { duration: 0.8, delay: i * 0.1, ease: EASE }, strokeWidth: { duration: 0.15 }, opacity: { duration: 0.15 } }} />; acc += p; return el; })}</svg>{center ? <div className="adm-donut-n">{center}</div> : null}</div>
    <ul>{rows.map((r, i) => <motion.li key={r.label} onMouseEnter={() => setHot(i)} onMouseLeave={() => setHot(null)} onPointerDown={() => setHot(i)} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 + i * 0.05 }}><i style={{ background: COLORS[i % COLORS.length] }} /><span>{r.label}</span><b>{fmt(r.value)}</b><em>{Math.round((r.value / total) * 100)}%</em></motion.li>)}</ul></div>;
}

export type Col<T> = { head: string; cell: (r: T) => ReactNode; right?: boolean; w?: string; hideSm?: boolean };
export function Table<T>({ rows, cols, onRow, empty, rowKey }: { rows: T[]; cols: Col<T>[]; onRow?: (r: T) => void; empty?: ReactNode; rowKey: (r: T) => string }) {
  if (!rows.length) return <Empty>{empty}</Empty>;
  return <div className="adm-tbl-wrap"><table className="adm-tbl"><thead><tr>{cols.map((c) => <th key={c.head} className={`${c.right ? "r" : ""} ${c.hideSm ? "sm" : ""}`} style={c.w ? { width: c.w } : undefined}>{c.head}</th>)}</tr></thead>
    <tbody>{rows.map((r, i) => <motion.tr key={rowKey(r)} className={onRow ? "click" : ""} onClick={onRow ? () => onRow(r) : undefined} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i, 14) * 0.025, duration: 0.28 }} whileTap={onRow ? { scale: 0.995 } : undefined}>{cols.map((c) => <td key={c.head} className={`${c.right ? "r" : ""} ${c.hideSm ? "sm" : ""}`}>{c.cell(r)}</td>)}</motion.tr>)}</tbody></table></div>;
}

export const Pill = ({ tone = "", children }: { tone?: "ok" | "warn" | "bad" | "info" | ""; children: ReactNode }) => <motion.span className={`adm-pill ${tone}`} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: "spring", stiffness: 400, damping: 22 }}>{children}</motion.span>;
