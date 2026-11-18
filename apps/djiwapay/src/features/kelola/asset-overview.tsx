import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Bar, Btn, Header, Ic, Row, Sky, spring } from "../shell/dpx-ui";
import { GainText, Sticker } from "./asset-ui";
import { TrendChart, assetDaily, portfolioDaily } from "./trend-chart";
import { assetValue, gainOf, useGold } from "../../lib/finance/assets";
import { ASSET_KINDS } from "../../lib/finance/kelola";
import { rupiah } from "../../lib/djiwa-pay-format";
import type { FinCtx } from "../finance/fin-pages";

const COLORS = ["#d9a21a", "#c9461b", "#16a3b8", "#13804a", "#958a7d", "#e0568a", "#eeb866"];

/** All assets in one screen: total, modal, composition and the biggest movers. */
export function AssetOverview({ ctx, onBack }: { ctx: FinCtx; onBack: () => void }) {
  const gold = useGold(), assets = ctx.fin.state.assets;
  const rows = useMemo(() => assets.map((a) => ({ a, value: assetValue(a, gold?.points ?? null), g: gainOf(a) })), [assets, gold]);
  const total = rows.reduce((s, r) => s + r.value, 0), cost = rows.reduce((s, r) => s + (r.a.cost ?? 0), 0), valueWithCost = rows.reduce((s, r) => s + (r.a.cost ? r.value : 0), 0);
  const pct = cost > 0 ? ((valueWithCost - cost) / cost) * 100 : null;
  const byKind = useMemo(() => { const m = new Map<string, number>(); for (const r of rows) m.set(r.a.kind, (m.get(r.a.kind) ?? 0) + r.value); return [...m.entries()].sort((x, y) => y[1] - x[1]); }, [rows]);
  const movers = rows.filter((r) => r.g).sort((x, y) => Math.abs(y.g!.pct) - Math.abs(x.g!.pct)).slice(0, 5);
  const mask = (s: string) => (ctx.visible ? s : "•••••");
  const [pickId, setPickId] = useState<string>("all"), picked = assets.find((a) => a.id === pickId) ?? null;
  const series = useMemo(() => (picked ? assetDaily(picked, gold?.points ?? null) : portfolioDaily(assets, gold?.points ?? null)), [picked, assets, gold]);
  const hasGold = Boolean(gold?.points.length) && assets.some((a) => a.kind === "gold");
  const goldSeries = useMemo(() => (gold?.points ?? []).map(([day, value]) => ({ day, value })), [gold]);
  let acc = 0;
  return <div className="dpx-page"><Sky><div className="dpx-pad dpx-nobar" style={{ paddingBottom: "calc(200px + env(safe-area-inset-bottom, 0px))" }}>
    <Header title="Nilai aset" onBack={onBack} right={<Btn type="button" className="dpx-rb" onClick={() => ctx.open({ k: "asset-new" })} aria-label="Tambah aset"><Ic n="plus" size="sm" /></Btn>} />
    {rows.length === 0 ? <div className="dpx-empty"><Sticker size={72} /><b>Belum ada aset</b><p className="dpx-sub">Foto emas atau perhiasan Anda, jadikan stiker, dan pantau nilainya.</p><Btn type="button" className="dpx-btn" onClick={() => ctx.open({ k: "asset-new" })}>Foto aset pertama</Btn></div> : <>
      <motion.div className="dpx-group dpx-white" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
        <div className="dpx-sub">Nilai semua aset</div><div className="dpx-as-big">{mask(rupiah(total))}</div>
        {cost > 0 && pct !== null ? <div className="dpx-sub">Modal <b style={{ color: "var(--ink)" }}>{mask(rupiah(cost))}</b> · {ctx.visible ? <GainText pct={pct} plain /> : "•••"}</div> : <div className="dpx-sub">{rows.length} aset</div>}
      </motion.div>
      <div className="dpx-group dpx-white dpx-as-donut">
        <svg viewBox="0 0 42 42" width="96" height="96" role="img" aria-label="Komposisi aset"><circle cx="21" cy="21" r="15.9" fill="none" stroke="#f2eadb" strokeWidth="7" />
          {byKind.map(([k, v], i) => { const p = total ? (v / total) * 100 : 0, el = <circle key={k} cx="21" cy="21" r="15.9" fill="none" stroke={COLORS[i % COLORS.length]} strokeWidth="7" strokeDasharray={`${p} ${100 - p}`} strokeDashoffset={-acc} transform="rotate(-90 21 21)" />; acc += p; return el; })}</svg>
        <div className="dpx-as-legend">{byKind.map(([k, v], i) => <span key={k}><i style={{ background: COLORS[i % COLORS.length] }} />{ASSET_KINDS[k as keyof typeof ASSET_KINDS].label} {total ? Math.round((v / total) * 100) : 0}%</span>)}</div>
      </div>
      <div className="dpx-sec"><h2>Grafik nilai</h2><span className="dpx-sub">{picked ? picked.name : "semua aset"}</span></div>
      {assets.length > 1 ? <div className="dpx-tc-chips" role="tablist" aria-label="Pilih aset"><button type="button" role="tab" aria-selected={pickId === "all"} className={pickId === "all" ? "on" : ""} onClick={() => setPickId("all")}>Semua</button>{assets.map((a) => <button key={a.id} type="button" role="tab" aria-selected={pickId === a.id} className={pickId === a.id ? "on" : ""} onClick={() => setPickId(a.id)}>{a.name}</button>)}</div> : null}
      <div className="dpx-group dpx-white"><TrendChart key={pickId} id="as-ov" series={series} label={`Grafik nilai ${picked ? picked.name : "semua aset"}`} visible={ctx.visible} color={picked && (picked.rate ?? 0) < 0 ? "#c9461b" : "#c9961b"} /></div>
      {hasGold ? <><div className="dpx-sec"><h2>Harga emas per gram</h2><span className="dpx-sub">acuan 24K</span></div>
        <div className="dpx-group dpx-white"><TrendChart id="as-gp" series={goldSeries} label="Grafik harga emas per gram" visible={ctx.visible} color="#d9a21a" unit="/g" defaultRange="1b" /></div></> : null}
      {movers.length ? <><div className="dpx-sec"><h2>Naik turun terbesar</h2><span className="dpx-sub">sejak beli</span></div>
        <div className="dpx-group dpx-white dpx-as-movers">{movers.map(({ a, g }) => <div key={a.id}><div className="dpx-as-mv"><span>{a.name}</span><b className={g!.pct >= 0 ? "dpx-up" : "dpx-dn"}>{g!.pct >= 0 ? "+" : "−"}{Math.abs(g!.pct).toFixed(1).replace(".", ",")}%</b></div><Bar percent={Math.min(100, Math.abs(g!.pct) * 4)} /></div>)}</div></> : null}
      <div className="dpx-sec"><h2>Semua aset</h2></div>
      <div className="dpx-group dpx-flush dpx-white">{rows.map(({ a, value, g }, i) => <Row key={a.id} i={i} icon="wallet" tone="amber" title={a.name} sub={g ? `${g.pct >= 0 ? "▲" : "▼"} ${Math.abs(g.pct).toFixed(1).replace(".", ",")}%` : ASSET_KINDS[a.kind].label} trail={<b>{mask(rupiah(value))}</b>} onClick={() => ctx.open({ k: "asset-view", id: a.id })} />)}</div>
    </>}
  </div></Sky></div>;
}
