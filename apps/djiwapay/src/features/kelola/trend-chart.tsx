import { useMemo, useRef, useState } from "react";
import { Seg } from "../shell/dpx-ui";
import { short } from "./kelola-ui";
import { rupiah } from "../../lib/djiwa-pay-format";
import { estimateOn, isEstimated, type GoldPoint } from "../../lib/finance/assets";
import { assetValueOn } from "../../lib/finance/story";
import type { Asset } from "../../lib/finance/types";

export type TPoint = { day: string; value: number };
type Range = "7h" | "1b" | "3b" | "6b" | "1t" | "all";
type Gran = "d" | "w" | "m";
const DAYS: Record<Range, number> = { "7h": 7, "1b": 30, "3b": 90, "6b": 180, "1t": 365, all: 100000 };
const AUTO: Record<Range, Gran> = { "7h": "d", "1b": "d", "3b": "w", "6b": "w", "1t": "m", all: "m" };
const GRAN_WORD: Record<Gran, string> = { d: "hari", w: "minggu", m: "bulan" };

const dt = (d: string) => new Date(`${d}T00:00:00`);
const fmt = (d: string, o: Intl.DateTimeFormatOptions) => dt(d).toLocaleDateString("id-ID", o);
const dayLabel = (d: string) => fmt(d, { day: "numeric", month: "short", year: "numeric" });
const weekKey = (d: string) => { const x = dt(d), dow = (x.getDay() + 6) % 7; x.setDate(x.getDate() - dow); return x.toISOString().slice(0, 10); };
const monthKey = (d: string) => d.slice(0, 7);
const pct = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(1).replace(".", ",")}%`;
const signed = (n: number) => `${n >= 0 ? "+" : "−"}${rupiah(Math.abs(Math.round(n)))}`;

/** Last value of every day / week / month bucket, labelled with the bucket's last day. */
export function bucketize(rows: TPoint[], g: Gran): TPoint[] {
  if (g === "d") return rows;
  const key = g === "w" ? weekKey : monthKey, out: TPoint[] = [];
  for (const r of rows) { const k = key(r.day), last = out[out.length - 1]; if (last && key(last.day) === k) out[out.length - 1] = r; else out.push(r); }
  return out;
}

/** One value per calendar day between two dates, filled by `valueOn`. */
export function dailySeries(from: string, to: string, valueOn: (day: string) => number): TPoint[] {
  const out: TPoint[] = [], end = dt(to);
  for (let d = dt(from); d <= end && out.length < 4000; d.setDate(d.getDate() + 1)) { const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; out.push({ day, value: valueOn(day) }); }
  return out;
}

const W = 340, H = 190, PL = 46, PR = 8, PT = 10, PB = 22;

/**
 * Price / value history with a range picker (7 days to all), day-week-month steps, a finger-scrub readout,
 * statistics and a table of every step. Pure SVG, no animation work while scrubbing.
 */
export function TrendChart({ series, color = "#c9961b", label, visible = true, unit = "", defaultRange = "3b", id }: { series: TPoint[]; color?: string; label: string; visible?: boolean; unit?: string; defaultRange?: Range; id: string }) {
  const [range, setRange] = useState<Range>(defaultRange), [gran, setGran] = useState<Gran>(AUTO[defaultRange]), [cursor, setCursor] = useState<number | null>(null), [more, setMore] = useState(false);
  const ref = useRef<SVGSVGElement>(null);
  const pick = (r: Range) => { setRange(r); setGran(AUTO[r]); setCursor(null); };
  const rows = useMemo(() => {
    const last = series[series.length - 1]?.day; if (!last) return [];
    const cut = new Date(dt(last).getTime() - DAYS[range] * 864e5).toISOString().slice(0, 10);
    const inRange = series.filter((s) => s.day >= cut);
    return bucketize(inRange.length >= 2 ? inRange : series.slice(-2), gran);
  }, [series, range, gran]);
  const m = (s: string) => (visible ? s : "•••••");
  if (rows.length < 2) return <p className="dpx-sub dpx-as-note">Grafik muncul setelah ada lebih dari satu hari data.</p>;

  const vals = rows.map((r) => r.value), hi = Math.max(...vals), lo = Math.min(...vals), pad = (hi - lo || hi * 0.02 || 1) * 0.12, top = hi + pad, bot = lo - pad;
  const X = (i: number) => PL + (i / (rows.length - 1)) * (W - PL - PR), Y = (v: number) => PT + (1 - (v - bot) / (top - bot)) * (H - PT - PB);
  const line = rows.map((r, i) => `${i ? "L" : "M"}${X(i).toFixed(1)} ${Y(r.value).toFixed(1)}`).join(" ");
  const area = `${line} L${X(rows.length - 1)} ${H - PB} L${X(0)} ${H - PB} Z`;
  const first = rows[0], lastRow = rows[rows.length - 1], i = cursor ?? rows.length - 1, cur = rows[i];
  const change = cur.value - first.value, changePct = first.value ? (change / first.value) * 100 : 0, up = change >= 0;
  const ticks = [0, 1, 2, 3].map((k) => bot + ((top - bot) * k) / 3);
  const xl = Array.from(new Set([0, Math.round((rows.length - 1) / 3), Math.round(((rows.length - 1) * 2) / 3), rows.length - 1]));
  const xlabel = (d: string) => (gran === "m" || range === "1t" || range === "all" ? fmt(d, { month: "short", year: "2-digit" }) : fmt(d, { day: "numeric", month: "short" }));
  const hiRow = rows[vals.indexOf(hi)], loRow = rows[vals.indexOf(lo)], avg = vals.reduce((s, v) => s + v, 0) / vals.length;
  let ups = 0, downs = 0; for (let k = 1; k < vals.length; k += 1) { if (vals[k] > vals[k - 1]) ups += 1; else if (vals[k] < vals[k - 1]) downs += 1; }
  const move = (e: React.PointerEvent) => { const r = ref.current?.getBoundingClientRect(); if (!r) return; const x = ((e.clientX - r.left) / r.width) * W; setCursor(Math.max(0, Math.min(rows.length - 1, Math.round(((x - PL) / (W - PL - PR)) * (rows.length - 1))))); };
  const table = [...rows].reverse().slice(0, more ? 40 : 8);

  return <div className="dpx-tc">
    <Seg id={`${id}-range`} label="Rentang grafik" value={range} onChange={pick} options={[["7h", "7H"], ["1b", "1B"], ["3b", "3B"], ["6b", "6B"], ["1t", "1T"], ["all", "Semua"]] as const} />
    <div className="dpx-tc-read" aria-live="polite">
      <div><b>{m(rupiah(Math.round(cur.value)))}{unit}</b><span>{dayLabel(cur.day)}</span></div>
      <div className={up ? "dpx-up" : "dpx-dn"}><b>{visible ? `${up ? "▲" : "▼"} ${pct(changePct)}` : "•••"}</b><span>{m(signed(change))} sejak {xlabel(first.day)}</span></div>
    </div>
    <svg ref={ref} className="dpx-tc-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} onPointerMove={move} onPointerDown={move} onPointerLeave={() => setCursor(null)}>
      <defs><linearGradient id={`${id}-g`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={color} stopOpacity=".3" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      {ticks.map((t) => <g key={t}><line x1={PL} x2={W - PR} y1={Y(t)} y2={Y(t)} stroke="rgba(45,36,29,.1)" strokeDasharray="3 4" /><text x={PL - 5} y={Y(t) + 3} textAnchor="end" className="dpx-tc-ax">{visible ? short(t) : ""}</text></g>)}
      {xl.map((k) => <text key={k} x={X(k)} y={H - 6} textAnchor={k === 0 ? "start" : k === rows.length - 1 ? "end" : "middle"} className="dpx-tc-ax">{xlabel(rows[k].day)}</text>)}
      <path d={area} fill={`url(#${id}-g)`} /><path d={line} fill="none" stroke={color} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
      {cursor !== null ? <line x1={X(i)} x2={X(i)} y1={PT} y2={H - PB} stroke={color} strokeOpacity=".5" /> : null}
      <circle cx={X(i)} cy={Y(cur.value)} r="4.5" fill="#fff" stroke={color} strokeWidth="2.5" />
    </svg>
    <p className="dpx-sub dpx-tc-hint">Sentuh dan geser di grafik untuk melihat nilai tiap {GRAN_WORD[gran]}.</p>
    <Seg id={`${id}-gran`} label="Interval data" value={gran} onChange={(g: Gran) => { setGran(g); setCursor(null); }} options={[["d", "Harian"], ["w", "Mingguan"], ["m", "Bulanan"]] as const} />
    <div className="dpx-as-stats dpx-tc-stats">
      <div><span>Terakhir</span><b>{m(rupiah(Math.round(lastRow.value)))}</b></div>
      <div><span>Perubahan</span><b className={lastRow.value >= first.value ? "dpx-up" : "dpx-dn"}>{visible ? pct(first.value ? ((lastRow.value - first.value) / first.value) * 100 : 0) : "•••"}</b></div>
      <div><span>Rata-rata</span><b>{m(rupiah(Math.round(avg)))}</b></div>
      <div><span>Tertinggi · {fmt(hiRow.day, { day: "numeric", month: "short" })}</span><b>{m(rupiah(Math.round(hi)))}</b></div>
      <div><span>Terendah · {fmt(loRow.day, { day: "numeric", month: "short" })}</span><b>{m(rupiah(Math.round(lo)))}</b></div>
      <div><span>Naik / turun</span><b>{ups}× / {downs}×</b></div>
    </div>
    <div className="dpx-sec"><h2>Riwayat per {GRAN_WORD[gran]}</h2></div>
    <div className="dpx-group dpx-white dpx-flush dpx-tc-tbl" role="table" aria-label={`Riwayat ${label}`}>
      {table.map((r) => { const idx = rows.indexOf(r), prev = idx > 0 ? rows[idx - 1].value : null, d = prev === null ? null : r.value - prev, p = prev ? (d! / prev) * 100 : null;
        return <div key={r.day} role="row"><span>{gran === "m" ? fmt(r.day, { month: "long", year: "numeric" }) : gran === "w" ? `Pekan ${fmt(r.day, { day: "numeric", month: "short" })}` : fmt(r.day, { weekday: "short", day: "numeric", month: "short" })}</span><b>{m(rupiah(Math.round(r.value)))}</b><em className={d === null ? "" : d >= 0 ? "dpx-up" : "dpx-dn"}>{d === null || p === null || !visible ? "—" : `${d >= 0 ? "▲" : "▼"} ${pct(p)}`}</em></div>; })}
    </div>
    {rows.length > 8 ? <button type="button" className="dpx-linkbtn" onClick={() => setMore((v) => !v)}>{more ? "Tampilkan lebih sedikit" : `Lihat lebih banyak (${Math.min(rows.length, 40)})`}</button> : null}
  </div>;
}

const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const daysAgo = (n: number) => { const d = new Date(Date.now() - n * 864e5); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
/** Value of one asset on a day: estimated assets follow their yearly rate, gold follows the price, the rest keep their entered value. */
export const assetAt = (a: Asset, points: GoldPoint[] | null, day: string): number => (a.boughtOn && a.boughtOn > day ? 0 : isEstimated(a) ? estimateOn(a, day) : assetValueOn(a, points, day) ?? 0);
/** Day-by-day value of one asset from its purchase date (or the last 180 days when no date is known). */
export const assetDaily = (a: Asset, points: GoldPoint[] | null): TPoint[] => dailySeries(a.boughtOn ?? daysAgo(180), todayStr(), (day) => assetAt(a, points, day));
/** Day-by-day total of several assets from the earliest purchase date. */
export function portfolioDaily(assets: Asset[], points: GoldPoint[] | null): TPoint[] {
  if (!assets.length) return [];
  const from = assets.reduce((m, a) => (a.boughtOn && a.boughtOn < m ? a.boughtOn : m), daysAgo(180));
  return dailySeries(from, todayStr(), (day) => assets.reduce((t, a) => t + assetAt(a, points, day), 0));
}
