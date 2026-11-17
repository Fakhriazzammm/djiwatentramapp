import { useId, useState } from "react";
import { Btn } from "../shell/dpx-ui";
import type { GoldPoint } from "../../lib/finance/assets";
import type { HeatCell, WealthPoint } from "../../lib/finance/story";
import { short } from "../kelola/kelola-ui";

/** Charts for the Cerita Beranda. Plain SVG, no chart library; every number is drawn on one scale. */
const ACC = "#c9461b", OK = "#4f7a2b", NAVY = "#2b2620", GOLD = "#c9962e", GRID = "rgba(43,38,32,.1)";
export const CAT_COLORS = [ACC, NAVY, GOLD, OK];
const rp = (n: number) => `Rp ${short(n)}`;
const niceMax = (v: number) => { if (v <= 0) return 1; const p = 10 ** Math.floor(Math.log10(v)), n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; };

/* ---------- kekayaan ---------- */
export function WealthChart({ history, visible }: { history: WealthPoint[]; visible: boolean }) {
  const [range, setRange] = useState<3 | 6 | 12>(6), [scrub, setScrub] = useState<number | null>(null), gid = useId().replace(/:/g, "");
  const v = history.slice(-range), n = v.length;
  if (history.length < 2) return <p className="dpx-st-empty">Grafik muncul setelah ada catatan dari dua bulan. Sampai saat itu, angka kekayaanmu tetap dihitung di atas.</p>;
  const W = 300, H = 140, pl = 34, pr = 10, pt = 10, pb = 20;
  const mn = Math.min(...v.map((p) => p.value)), mx = Math.max(...v.map((p) => p.value)), pad = (mx - mn) * 0.12 || Math.abs(mx) * 0.05 || 1, lo = mn - pad, hi = mx + pad;
  const X = (i: number) => pl + ((W - pl - pr) * i) / Math.max(1, n - 1), Y = (a: number) => pt + (H - pt - pb) * (1 - (a - lo) / (hi - lo));
  const i = scrub ?? n - 1, cur = v[i], d = cur.value - v[0].value, pct = v[0].value !== 0 ? (d / Math.abs(v[0].value)) * 100 : 0;
  const path = v.map((p, k) => `${k ? "L" : "M"}${X(k).toFixed(1)} ${Y(p.value).toFixed(1)}`).join(" ");
  const move = (e: React.PointerEvent<SVGSVGElement>) => { const r = e.currentTarget.getBoundingClientRect(), x = ((e.clientX - r.left) / r.width) * W; setScrub(Math.max(0, Math.min(n - 1, Math.round(((x - pl) / (W - pl - pr)) * (n - 1))))); };
  const step = n > 8 ? 2 : 1, ticks = [0, 1, 2].map((g) => lo + ((hi - lo) * g) / 2);
  return <>
    <div className="dpx-st-seg" role="group" aria-label="Rentang grafik">{([3, 6, 12] as const).map((r) => <Btn key={r} type="button" aria-pressed={range === r} onClick={() => { setRange(r); setScrub(null); }}>{r === 12 ? "1T" : `${r}B`}</Btn>)}</div>
    <div className="dpx-st-read"><b>{visible ? rp(cur.value) : "Rp •••••"}</b><span className="dpx-sub">{cur.label} · <span className={d >= 0 ? "dpx-up" : "dpx-dn"}>{visible ? `${d >= 0 ? "▲ +" : "▼ −"}${short(Math.abs(d))} (${d >= 0 ? "+" : "−"}${Math.abs(pct).toFixed(1).replace(".", ",")}%)` : "•••"}</span></span></div>
    <svg className="dpx-st-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Grafik total kekayaan per bulan" onPointerMove={move} onPointerDown={move} onPointerLeave={() => setScrub(null)}>
      <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={ACC} stopOpacity=".28" /><stop offset="1" stopColor={ACC} stopOpacity="0" /></linearGradient></defs>
      {ticks.map((g) => <g key={g}><line x1={pl} x2={W - pr} y1={Y(g)} y2={Y(g)} stroke={GRID} /><text x={pl - 5} y={Y(g) + 3} textAnchor="end">{visible ? short(g) : ""}</text></g>)}
      {lo < 0 && hi > 0 ? <line x1={pl} x2={W - pr} y1={Y(0)} y2={Y(0)} stroke="#c42a1e" strokeDasharray="4 4" opacity=".5" /> : null}
      <path d={`${path} L${X(n - 1)} ${H - pb} L${X(0)} ${H - pb}Z`} fill={`url(#${gid})`} />
      <path d={path} fill="none" stroke={ACC} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {v.map((p, k) => (k % step === 0 || k === n - 1) ? <text key={k} x={X(k)} y={H - 5} textAnchor="middle">{p.label}</text> : null)}
      {scrub !== null && scrub !== n - 1 ? <line x1={X(i)} x2={X(i)} y1={pt} y2={H - pb} stroke={NAVY} strokeDasharray="3 3" opacity=".7" /> : null}
      <circle cx={X(i)} cy={Y(cur.value)} r="5" fill={ACC} stroke="#fff" strokeWidth="2" />
    </svg>
  </>;
}

/* ---------- arus kas ---------- */
export function CashflowChart({ rows }: { rows: { label: string; in: number; out: number }[] }) {
  const W = 300, H = 150, pl = 30, pt = 10, pb = 20, mx = niceMax(Math.max(...rows.flatMap((r) => [r.in, r.out]), 1));
  const Y = (a: number) => pt + (H - pt - pb) * (1 - a / mx), bw = (W - 4 - pl) / rows.length;
  const nets = rows.map((r, k) => [pl + bw * k + bw / 2, Y(Math.max(0, r.in - r.out))] as const), last = rows[rows.length - 1];
  return <svg className="dpx-st-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Pemasukan dan pengeluaran per bulan">
    {[0, mx / 2, mx].map((g) => <g key={g}><line x1={pl} x2={W - 4} y1={Y(g)} y2={Y(g)} stroke={GRID} /><text x={pl - 5} y={Y(g) + 3} textAnchor="end">{g ? short(g) : "0"}</text></g>)}
    {rows.map((r, k) => { const x = pl + bw * k + bw / 2; return <g key={k}>
      <rect x={x - 13} y={Y(r.in)} width="12" height={Math.max(0, Y(0) - Y(r.in))} rx="4" fill={OK} /><rect x={x + 1} y={Y(r.out)} width="12" height={Math.max(0, Y(0) - Y(r.out))} rx="4" fill={ACC} />
      <text x={x} y={H - 5} textAnchor="middle">{r.label}</text></g>; })}
    <path d={nets.map(([x, y], k) => `${k ? "L" : "M"}${x} ${y}`).join(" ")} fill="none" stroke={NAVY} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    {nets.map(([x, y], k) => <circle key={k} cx={x} cy={y} r="3" fill={NAVY} />)}
    {last.in - last.out > 0 ? <text x={nets[nets.length - 1][0] - 2} y={nets[nets.length - 1][1] - 8} textAnchor="end" style={{ fill: NAVY, fontWeight: 700 }}>{short(last.in - last.out)}</text> : null}
  </svg>;
}

/* ---------- donat ---------- */
export function Donut({ rows, total, visible }: { rows: { amount: number; pct: number }[]; total: number; visible: boolean }) {
  const r = 44, c = 2 * Math.PI * r; let o = 0;
  return <svg className="dpx-st-donut" viewBox="0 0 120 120" role="img" aria-label="Pengeluaran per kategori">
    <circle cx="60" cy="60" r={r} fill="none" stroke="rgba(43,38,32,.07)" strokeWidth="16" />
    {rows.map((x, k) => { const len = (c * x.pct) / 100, el = <circle key={k} cx="60" cy="60" r={r} fill="none" stroke={CAT_COLORS[k % CAT_COLORS.length]} strokeWidth="16" strokeDasharray={`${Math.max(0, len - 2)} ${c - Math.max(0, len - 2)}`} strokeDashoffset={-o} transform="rotate(-90 60 60)" />; o += len; return el; })}
    <text x="60" y="58" textAnchor="middle" style={{ font: "800 15px var(--font)", fill: "#241f1a" }}>{visible ? short(total) : "•••"}</text><text x="60" y="72" textAnchor="middle">keluar</text>
  </svg>;
}

/* ---------- kalender ---------- */
export function HeatGrid({ cells, offset, today }: { cells: HeatCell[]; offset: number; today: number }) {
  return <div className="dpx-st-heat" role="img" aria-label="Kalender belanja bulan ini">
    {"SSRKJSM".split("").map((d, k) => <span key={`w${k}`} className="dpx-st-wd">{d}</span>)}
    {Array.from({ length: offset }, (_, k) => <span key={`b${k}`} className="dpx-st-blank" />)}
    {cells.map((c) => <span key={c.day} className={`dpx-st-hc ${c.state === "calm" ? "calm" : c.state === "spent" ? `l${c.level}` : c.state === "future" ? "fut" : "bef"} ${c.day === today ? "today" : ""}`}>{c.day}</span>)}
  </div>;
}

/* ---------- laju belanja ---------- */
export function PaceChart({ cur, prev, projected, dim }: { cur: number[]; prev: number[]; projected: number; dim: number }) {
  const W = 300, H = 140, pl = 34, pt = 10, pb = 18, mx = niceMax(Math.max(projected, ...cur, ...prev, 1));
  const X = (d: number) => pl + ((W - pl - 4) * (d - 1)) / Math.max(1, dim - 1), Y = (a: number) => pt + (H - pt - pb) * (1 - a / mx);
  const line = (a: number[]) => a.map((v, k) => `${k ? "L" : "M"}${X(k + 1).toFixed(1)} ${Y(v).toFixed(1)}`).join(" "), n = cur.length;
  return <svg className="dpx-st-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Pengeluaran kumulatif bulan ini dibanding bulan lalu">
    {[0, mx / 2, mx].map((g) => <g key={g}><line x1={pl} x2={W - 4} y1={Y(g)} y2={Y(g)} stroke={GRID} /><text x={pl - 5} y={Y(g) + 3} textAnchor="end">{g ? short(g) : "0"}</text></g>)}
    {prev.length ? <path d={line(prev)} fill="none" stroke="#c9b99c" strokeWidth="2" strokeLinejoin="round" /> : null}
    {n > 0 ? <><path d={`M${X(n)} ${Y(cur[n - 1])} L${X(dim)} ${Y(projected)}`} fill="none" stroke={ACC} strokeWidth="2" strokeDasharray="4 4" />
      <path d={line(cur)} fill="none" stroke={ACC} strokeWidth="2.75" strokeLinejoin="round" strokeLinecap="round" /><circle cx={X(n)} cy={Y(cur[n - 1])} r="4.5" fill={ACC} stroke="#fff" strokeWidth="2" /></> : null}
    {[1, 10, 20, dim].map((d) => <text key={d} x={X(d)} y={H - 4} textAnchor="middle">{d}</text>)}
  </svg>;
}

/* ---------- emas ---------- */
export function GoldSpark({ points }: { points: GoldPoint[] }) {
  const gid = useId().replace(/:/g, ""), v = points.slice(-30).map((p) => p[1]);
  if (v.length < 2) return null;
  const W = 300, H = 70, mn = Math.min(...v), mx = Math.max(...v), span = mx - mn || 1, X = (i: number) => 4 + (292 * i) / (v.length - 1), Y = (a: number) => 6 + (H - 14) * (1 - (a - mn) / span);
  const p = v.map((a, i) => `${i ? "L" : "M"}${X(i).toFixed(1)} ${Y(a).toFixed(1)}`).join(" ");
  return <svg className="dpx-st-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Harga emas 30 hari terakhir">
    <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={GOLD} stopOpacity=".3" /><stop offset="1" stopColor={GOLD} stopOpacity="0" /></linearGradient></defs>
    <path d={`${p} L296 ${H} L4 ${H}Z`} fill={`url(#${gid})`} /><path d={p} fill="none" stroke={GOLD} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx={X(v.length - 1)} cy={Y(v[v.length - 1])} r="4.5" fill={GOLD} stroke="#fff" strokeWidth="2" />
  </svg>;
}
