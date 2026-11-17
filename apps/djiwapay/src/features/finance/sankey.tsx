import { useState } from "react";
import { Btn, Ic } from "../shell/dpx-ui";
import { FullPage } from "../kelola/asset-ui";
import { catOf } from "./fin-sheets";
import { short } from "../kelola/kelola-ui";
import type { FlowGraph, FlowNode } from "../../lib/finance/story";
import type { FinanceState } from "../../lib/finance/types";

const W = 420, XL = 120, XM = 208, XR = 296, BW = 8, GAP = 10, LINE = 12;
const COLOR = { in: "#2e9e57", out: "#d9483b", net: "#1f7a46", gap: "#8b8173", mid: "#4a5568" };
const FLOW = { in: "rgba(46,158,87,.22)", out: "rgba(217,72,59,.2)", net: "rgba(31,122,70,.3)", gap: "rgba(139,129,115,.25)" };
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

type Placed = FlowNode & { y: number; h: number; used: number; ly: number };
function place(nodes: FlowNode[], s: number, H: number): Placed[] {
  const hs = nodes.map((n) => Math.max(4, s * n.amount)), total = hs.reduce((a, b) => a + b, 0) + GAP * Math.max(0, nodes.length - 1);
  let y = (H - total) / 2;
  const out = nodes.map((n, i) => { const p: Placed = { ...n, y, h: hs[i], used: 0, ly: 0 }; y += hs[i] + GAP; return p; });
  // spread the 3-line labels so none overlap, keeping each as close to its bar as possible
  const need = LINE * 3 + 6; let prev = -Infinity;
  for (const p of out) { p.ly = Math.max(p.y + p.h / 2 - need / 2, prev + need); prev = p.ly; }
  const over = prev + need - H; if (over > 0) for (const p of out) p.ly -= over;
  return out;
}
const ribbon = (x1: number, y1: number, x2: number, y2: number, f: number) => { const m = (x1 + x2) / 2; return `M${x1} ${y1} C${m} ${y1} ${m} ${y2} ${x2} ${y2} L${x2} ${y2 + f} C${m} ${y2 + f} ${m} ${y1 + f} ${x1} ${y1 + f}Z`; };

/** Money-flow diagram: income sources into one total, then out to spending categories and what is left. */
export function Sankey({ graph, state, visible, className = "" }: { graph: FlowGraph; state: FinanceState; visible: boolean; className?: string }) {
  const { left, right, total, income } = graph;
  const nameOf = (n: FlowNode) => (n.id === "_net" ? "Kas bersih" : n.id === "_gap" ? "Dari saldo" : n.id === "_inrest" ? "Pemasukan lain" : n.id === "_outrest" ? "Lainnya" : catOf(state, n.id).name);
  const maxN = Math.max(left.length, right.length, 1), H = Math.max(230, Math.min(560, maxN * 44 + 40));
  const s = (H - 36 - GAP * (maxN - 1)) / Math.max(1, total), mh = s * total, my = (H - mh) / 2;
  const L = place(left, s, H), R = place(right, s, H);
  let mIn = my, mOut = my;
  const base = total, baseWord = income >= total ? "pemasukan" : "total dana";
  const money = (v: number) => (visible ? `Rp${short(v)}` : "Rp •••");
  const pct = (n: FlowNode) => (visible && base > 0 ? `${Math.round((n.amount / base) * 100)}% dari ${baseWord}` : "");
  const chgTxt = (n: FlowNode) => (visible && n.change !== null ? `${n.change > 0 ? "+" : "−"}${Math.abs(n.change).toFixed(1).replace(".", ",")}%` : "");
  return <svg className={`dpx-fl ${className}`} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Diagram arus uang: dari sumber pemasukan ke pengeluaran dan kas bersih">
    {L.map((n) => { const f = s * n.amount, d = mIn; mIn += f; const p = ribbon(XL + BW, n.y + n.used, XM, d, f); n.used += f; return <path key={`l${n.id}`} d={p} fill={FLOW[n.kind]} />; })}
    {R.map((n) => { const f = s * n.amount, d = mOut; mOut += f; const p = ribbon(XM + BW, d, XR, n.y + n.used, f); n.used += f; return <path key={`r${n.id}`} d={p} fill={FLOW[n.kind]} />; })}
    {L.map((n) => <g key={`ln${n.id}`}><rect x={XL} y={n.y} width={BW} height={n.h} rx="2" fill={COLOR[n.kind]} />
      <text x={XL - 6} y={n.ly + 11} textAnchor="end" className="fl-n">{clip(nameOf(n), 15)}</text>
      <text x={XL - 6} y={n.ly + 11 + LINE} textAnchor="end" className="fl-v" fill={COLOR[n.kind]}>{money(n.amount)}<tspan className="fl-c"> {chgTxt(n)}</tspan></text></g>)}
    <rect x={XM} y={my} width={BW} height={mh} rx="2" fill={COLOR.mid} />
    <text x={XM + BW / 2} y={Math.max(10, my - 22)} textAnchor="middle" className="fl-n">Total dana masuk</text>
    <text x={XM + BW / 2} y={Math.max(10, my - 22) + LINE} textAnchor="middle" className="fl-v" fill={COLOR.in}>{money(total)}</text>
    {R.map((n) => <g key={`rn${n.id}`}><rect x={XR} y={n.y} width={BW} height={n.h} rx="2" fill={COLOR[n.kind]} />
      <text x={XR + BW + 6} y={n.ly + 11} className="fl-n">{clip(nameOf(n), 15)}</text>
      <text x={XR + BW + 6} y={n.ly + 11 + LINE} className="fl-v" fill={COLOR[n.kind]}>{money(n.amount)}<tspan className="fl-c"> {chgTxt(n)}</tspan></text>
      <text x={XR + BW + 6} y={n.ly + 11 + LINE * 2} className="fl-p">{pct(n)}</text></g>)}
  </svg>;
}

/** The diagram as a tappable card face that opens a larger, zoomable version. */
export function FlowCard({ graph, state, visible, title = "Arus uang bulan ini" }: { graph: FlowGraph; state: FinanceState; visible: boolean; title?: string }) {
  const [open, setOpen] = useState(false), [zoom, setZoom] = useState(1.6);
  if (graph.total <= 0) return <p className="dpx-st-empty">Belum ada pemasukan atau pengeluaran bulan ini.</p>;
  return <>
    <Btn type="button" className="dpx-fl-btn" onClick={() => setOpen(true)} aria-label="Perbesar diagram arus uang"><Sankey graph={graph} state={state} visible={visible} /><span className="dpx-fl-hint"><Ic n="search" size="sm" /> Ketuk untuk memperbesar</span></Btn>
    {open ? <FullPage title={title} onBack={() => setOpen(false)} right={<span className="dpx-fl-zoom"><Btn type="button" onClick={() => setZoom((z) => Math.max(1, +(z - 0.4).toFixed(1)))} aria-label="Perkecil">−</Btn><Btn type="button" onClick={() => setZoom((z) => Math.min(3, +(z + 0.4).toFixed(1)))} aria-label="Perbesar">+</Btn></span>}>
      <div className="dpx-fl-scroll"><div style={{ width: `${zoom * 100}%`, minWidth: 380 }}><Sankey graph={graph} state={state} visible={visible} /></div></div>
      <p className="dpx-st-foot" style={{ padding: "0 16px 24px" }}>Lebar pita sebanding dengan jumlah uang. Persentase kecil di samping angka adalah perubahan dibanding bulan pembanding. Total {short(graph.total)}.</p>
    </FullPage> : null}
  </>;
}
