import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Btn, Header, Ic, Sky } from "../shell/dpx-ui";
import { CatIcon, catOf } from "./fin-sheets";
import type { FinCtx } from "./fin-pages";
import { CAT_COLORS, CashflowChart, DailyBars, Donut, HeatGrid, PaceChart, WealthChart, rpFull } from "./story-charts";
import { FlowCard } from "./sankey";
import { useCash } from "../kelola/kelola-pages";
import { short } from "../kelola/kelola-ui";
import { daysIn, inMonth, monthlySeries, spendByCategory, toCsv, totals } from "../../lib/finance/calc";
import { cashflowGraph, pace, spendCalendar, spendStats, wealthHistory } from "../../lib/finance/story";
import { useGold } from "../../lib/finance/assets";
import { monthLabel } from "../../lib/djiwa-pay-summary";
import { rupiah } from "../../lib/djiwa-pay-format";
import type { Entry } from "../../lib/finance/types";

type Tab = "sum" | "cat" | "trend" | "flow";
const TABS: [Tab, string][] = [["sum", "Ringkasan"], ["cat", "Kategori"], ["trend", "Tren"], ["flow", "Arus uang"]];
const mk = (v: boolean, t: string) => (v ? t : "•••••");
const chg = (cur: number, was: number) => (was > 0 ? Math.round(((cur - was) / was) * 100) : null);
const Chg = ({ d, goodWhenDown = true }: { d: number | null; goodWhenDown?: boolean }) => d === null ? <span className="dpx-sub">baru</span> : d === 0 ? <span className="dpx-sub">▬ sama</span> : <span className={(d < 0) === goodWhenDown ? "dpx-up" : "dpx-dn"}>{d > 0 ? "▲" : "▼"} {Math.abs(d)}%</span>;
function Card({ title, right, children }: { title?: string; right?: React.ReactNode; children: React.ReactNode }) {
  return <section className="dpx-st-card">{title ? <div className="dpx-st-ch"><h2>{title}</h2>{right}</div> : null}{children}</section>;
}

/** Laporan: four tabs for one month, all numbers in full and every chart readable on a phone. */
export function FinReport({ ctx, onBack }: { ctx: FinCtx; onBack: () => void }) {
  const { fin, visible } = ctx, { state, entries } = fin, today = new Date(), gold = useGold(), cash = useCash(ctx);
  const [cursor, setCursor] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const [tab, setTab] = useState<Tab>("sum"), [kind, setKind] = useState<"out" | "in">("out"), [range, setRange] = useState<6 | 12>(6);
  const isCurrent = cursor.y === today.getFullYear() && cursor.m === today.getMonth();
  const shift = (d: number) => setCursor((c) => { const n = new Date(c.y, c.m + d, 1); return { y: n.getFullYear(), m: n.getMonth() }; });
  const dim = daysIn(cursor.y, cursor.m), elapsed = isCurrent ? today.getDate() : dim, ref = isCurrent ? today : new Date(cursor.y, cursor.m, dim, 12);
  const month = useMemo(() => entries.filter((e) => inMonth(e, cursor.y, cursor.m)), [entries, cursor]);
  const pd = new Date(cursor.y, cursor.m - 1, 1);
  const prevAll = useMemo(() => entries.filter((e) => inMonth(e, pd.getFullYear(), pd.getMonth())), [entries, cursor]);   // eslint-disable-line react-hooks/exhaustive-deps
  const prev = useMemo(() => prevAll.filter((e) => new Date(e.at).getDate() <= elapsed), [prevAll, elapsed]);
  const t = totals(month), pt = totals(prev), ptAll = totals(prevAll);
  const st = useMemo(() => spendStats(entries, ref), [entries, cursor]);   // eslint-disable-line react-hooks/exhaustive-deps
  const cal = useMemo(() => spendCalendar(entries, ref), [entries, cursor]);   // eslint-disable-line react-hooks/exhaustive-deps
  const pc = useMemo(() => pace(entries, ref), [entries, cursor]);   // eslint-disable-line react-hooks/exhaustive-deps
  const perDay = useMemo(() => { const a = Array.from({ length: dim }, () => 0); for (const e of month) if (e.kind === "out") a[new Date(e.at).getDate() - 1] += e.amount; return a; }, [month, dim]);
  const graph = useMemo(() => cashflowGraph(month, prev), [month, prev]);
  const top = useMemo(() => month.filter((e) => e.kind === "out").sort((a, b) => b.amount - a.amount).slice(0, 5), [month]);
  const rows = useMemo(() => {
    const cur = new Map<string, number>(), was = new Map<string, number>();
    for (const e of month) if (e.kind === kind) cur.set(e.categoryId, (cur.get(e.categoryId) ?? 0) + e.amount);
    for (const e of prev) if (e.kind === kind) was.set(e.categoryId, (was.get(e.categoryId) ?? 0) + e.amount);
    const total = [...cur.values()].reduce((s, v) => s + v, 0);
    return { total, list: [...cur.entries()].sort((a, b) => b[1] - a[1]).map(([id, amount]) => ({ id, amount, pct: total ? (amount / total) * 100 : 0, change: chg(amount, was.get(id) ?? 0) })) };
  }, [month, prev, kind]);
  const donut = useMemo(() => { const head = rows.list.slice(0, 7), rest = rows.list.slice(7).reduce((s, r) => s + r.amount, 0); return rest > 0 ? [...head, { id: "_rest", amount: rest, pct: rows.total ? (rest / rows.total) * 100 : 0, change: null }] : head; }, [rows]);
  const series = useMemo(() => monthlySeries(entries, range, new Date(cursor.y, cursor.m, 1)), [entries, cursor, range]);
  const history = useMemo(() => wealthHistory(state, entries, cash, gold?.points ?? null, 12, today).filter((p) => p.year * 12 + p.month <= cursor.y * 12 + cursor.m), [state, entries, cash, gold, cursor]);   // eslint-disable-line react-hooks/exhaustive-deps
  const nameOf = (id: string) => (id === "_rest" ? "Lainnya" : catOf(state, id).name);
  const exportCsv = () => { const blob = new Blob(["﻿" + toCsv(entries, state.categories, state.accounts)], { type: "text/csv;charset=utf-8" }); const url = URL.createObjectURL(blob), a = document.createElement("a"); a.href = url; a.download = `djiwa-pay-catatan-${cursor.y}-${String(cursor.m + 1).padStart(2, "0")}.csv`; a.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); ctx.notify("CSV diunduh"); };
  const rate = t.in > 0 ? Math.round((t.net / t.in) * 100) : null, outChange = chg(t.out, pt.out);
  const compareLabel = isCurrent ? `tanggal 1–${elapsed} bulan lalu` : "bulan sebelumnya";

  return <div className="dpx-page"><Sky><div className="dpx-pad dpx-nobar">
    <Header title="Laporan" onBack={onBack} right={<Btn type="button" className="dpx-rb" onClick={exportCsv} aria-label="Ekspor CSV"><Ic n="dl" /></Btn>} />
    <div className="dpx-rp-tabs" role="tablist">{TABS.map(([k, l]) => <Btn key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</Btn>)}</div>
    <div className="dpx-rp-month"><Btn type="button" className="dpx-rb" onClick={() => shift(-1)} aria-label="Bulan sebelumnya"><Ic n="back" size="sm" /></Btn><b>{monthLabel(cursor.y, cursor.m)}</b><Btn type="button" className="dpx-rb" style={isCurrent ? { opacity: 0.4 } : undefined} disabled={isCurrent} onClick={() => shift(1)} aria-label="Bulan berikutnya"><span style={{ display: "inline-flex", transform: "scaleX(-1)" }}><Ic n="back" size="sm" /></span></Btn></div>
    {month.length === 0 && tab !== "trend" ? <Card><p className="dpx-st-empty">Belum ada catatan di {monthLabel(cursor.y, cursor.m)}. Catat pemasukan atau pengeluaran agar laporan terisi.</p></Card> :
    <AnimatePresence mode="wait" initial={false}><motion.div key={`${tab}${kind}`} className="dpx-rp-body" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>

      {tab === "sum" ? <>
        <Card><span className="dpx-st-up">Uang keluar</span>
          <div className="dpx-rp-big">{mk(visible, rpFull(t.out))}</div>
          <div className="dpx-sub">{pt.out > 0 ? <><Chg d={outChange} /> dibanding {compareLabel} ({mk(visible, rpFull(pt.out))})</> : "Belum ada pembanding dari bulan sebelumnya."}</div></Card>
        <div className="dpx-st-stats">
          <div><span className="dpx-st-up">Uang masuk</span><b className="dpx-up">{mk(visible, rpFull(t.in))}</b><span className="dpx-sub">{pt.in > 0 ? <><Chg d={chg(t.in, pt.in)} goodWhenDown={false} /> vs {compareLabel}</> : "bulan ini"}</span></div>
          <div><span className="dpx-st-up">Selisih</span><b className={t.net >= 0 ? "dpx-up" : "dpx-dn"}>{mk(visible, `${t.net < 0 ? "−" : "+"}${rpFull(Math.abs(t.net))}`)}</b><span className="dpx-sub">masuk dikurangi keluar</span></div>
          <div><span className="dpx-st-up">Rasio menabung</span><b>{rate === null ? "—" : `${Math.max(0, rate)}%`}</b><span className="dpx-sub">target sehat 20%</span></div>
          <div><span className="dpx-st-up">Rata-rata harian</span><b>{mk(visible, rpFull(Math.round(st.perDay)))}</b>{st.perDayChange !== null ? <span className="dpx-sub"><Chg d={st.perDayChange} /> vs bulan lalu</span> : <span className="dpx-sub">per hari</span>}</div>
          <div><span className="dpx-st-up">Hari terboros</span><b>{st.costly ? st.costly.day.toLocaleDateString("id-ID", { weekday: "short", day: "numeric", month: "short" }) : "—"}</b><span className="dpx-sub">{st.costly ? mk(visible, rpFull(st.costly.amount)) : "belum ada"}</span></div>
          <div><span className="dpx-st-up">Transaksi keluar</span><b>{st.count}</b><span className="dpx-sub">{cal.calm} hari tanpa belanja</span></div>
        </div>
        <Card title="Pengeluaran harian"><DailyBars perDay={perDay} elapsed={elapsed} today={isCurrent ? today.getDate() : null} visible={visible} />
          <div className="dpx-st-legend"><span><i style={{ background: "#c9461b" }} />Ada belanja</span><span><i style={{ background: "#4f7a2b" }} />Hari tenang</span><span>┄ Rata-rata</span></div></Card>
        <Card title="Laju belanja" right={<span className="dpx-sub">kumulatif per hari</span>}>
          <PaceChart cur={pc.cur} prev={pc.prev} projected={isCurrent ? pc.projected : pc.spent} dim={pc.dim} />
          <div className="dpx-st-legend"><span><i style={{ background: "#c9461b" }} />Bulan ini</span><span><i style={{ background: "#c9b99c" }} />Bulan lalu</span>{isCurrent ? <span>┄ Perkiraan</span> : null}</div>
          {isCurrent ? <div className="dpx-st-tip"><span className="dpx-cat dpx-c-blue"><Ic n="trend" /></span><div><b>Perkiraan akhir bulan {mk(visible, rpFull(pc.projected))}</b><span className="dpx-sub">{pc.diff === null ? "Belum ada data bulan lalu." : pc.diff <= 0 ? `Lebih hemat ${mk(visible, rpFull(-pc.diff))} dari bulan lalu jika lajunya tetap.` : `Lebih boros ${mk(visible, rpFull(pc.diff))} dari bulan lalu jika lajunya tetap.`}</span></div></div> : null}</Card>
        <Card title="Kalender belanja" right={<span className="dpx-up" style={{ fontSize: 12.5 }}>{cal.calm} hari tenang</span>}><HeatGrid cells={cal.cells} offset={cal.offset} today={isCurrent ? today.getDate() : 0} />
          <div className="dpx-st-legend"><span><i className="calm" />Tanpa belanja</span><span>Sedikit <i className="l1" /><i className="l2" /><i className="l3" /><i className="l4" /> Banyak</span></div></Card>
        {top.length ? <Card title="Pengeluaran terbesar"><div className="dpx-rp-list">{top.map((e, i) => { const c = catOf(state, e.categoryId); return <Btn key={e.id} type="button" className="dpx-rp-row" onClick={() => ctx.open({ k: "entry", id: e.id })}><span className="dpx-rp-rank">{i + 1}</span><CatIcon cat={c} /><div><b>{e.note || c.name}</b><span className="dpx-sub">{c.name} · {new Date(e.at).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}</span></div><b>{mk(visible, rpFull(e.amount))}</b></Btn>; })}</div></Card> : null}
      </> : null}

      {tab === "cat" ? <>
        <div className="dpx-st-seg" role="group" aria-label="Jenis">{([["out", "Pengeluaran"], ["in", "Pemasukan"]] as const).map(([k, l]) => <Btn key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>{l}</Btn>)}</div>
        {rows.list.length ? <>
          <Card><div className="dpx-st-donutw"><Donut rows={donut} total={rows.total} visible={visible} />
            <div className="dpx-st-catl">{donut.slice(0, 6).map((r, k) => <div key={r.id}><i style={{ background: CAT_COLORS[k % CAT_COLORS.length] }} />{nameOf(r.id)}<b>{Math.round(r.pct)}%</b></div>)}</div></div>
            <p className="dpx-st-foot">{kind === "out" ? "Total keluar" : "Total masuk"} {mk(visible, rpFull(rows.total))}</p></Card>
          <Card title="Rincian per kategori" right={<span className="dpx-sub">vs {compareLabel}</span>}><div className="dpx-rp-list">{rows.list.map((r, k) => { const c = catOf(state, r.id); return <div key={r.id} className="dpx-rp-cat"><div className="dpx-rp-cat-t"><CatIcon cat={c} /><div><b>{c.name}</b><span className="dpx-sub">{r.pct.toFixed(1).replace(".", ",")}% dari total</span></div><div className="dpx-rp-amt"><b>{mk(visible, rpFull(r.amount))}</b><Chg d={r.change} goodWhenDown={kind === "out"} /></div></div>
            <div className="dpx-bar"><i style={{ width: `${Math.max(2, r.pct)}%`, background: CAT_COLORS[k % CAT_COLORS.length] }} /></div></div>; })}</div></Card>
        </> : <Card><p className="dpx-st-empty">Belum ada {kind === "out" ? "pengeluaran" : "pemasukan"} bulan ini.</p></Card>}
      </> : null}

      {tab === "trend" ? <>
        <div className="dpx-st-seg" role="group" aria-label="Rentang">{([6, 12] as const).map((r) => <Btn key={r} type="button" aria-pressed={range === r} onClick={() => setRange(r)}>{r === 12 ? "12 bulan" : "6 bulan"}</Btn>)}</div>
        <Card title="Masuk vs keluar"><CashflowChart rows={series} />
          <div className="dpx-st-legend"><span><i style={{ background: "#4f7a2b" }} />Masuk</span><span><i style={{ background: "#c9461b" }} />Keluar</span><span><i style={{ background: "#2b2620" }} />Tabungan bersih</span></div></Card>
        <Card title="Perjalanan kekayaan"><WealthChart history={history} visible={visible} /></Card>
        <Card title="Per bulan"><div className="dpx-rp-table" role="table"><div className="dpx-rp-th" role="row"><span>Bulan</span><span>Masuk</span><span>Keluar</span><span>Selisih</span></div>
          {[...series].reverse().map((s) => { const n = s.in - s.out; return <div key={`${s.year}${s.month}`} className="dpx-rp-tr" role="row"><span>{s.label} {String(s.year).slice(2)}</span><span className="dpx-up">{mk(visible, short(s.in))}</span><span>{mk(visible, short(s.out))}</span><span className={n >= 0 ? "dpx-up" : "dpx-dn"}>{mk(visible, `${n < 0 ? "−" : "+"}${short(Math.abs(n))}`)}</span></div>; })}</div></Card>
        {month.length ? <Card title={`${monthLabel(cursor.y, cursor.m)} vs bulan lalu`}><div className="dpx-rp-list">{[...spendByCategory(month).entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([id, v]) => { const c = catOf(state, id), p = spendByCategory(prevAll).get(id) ?? 0, d = chg(v, p); return <div key={id} className="dpx-rp-row"><CatIcon cat={c} /><div><b>{c.name}</b><span className="dpx-sub">{p ? `Bulan lalu ${mk(visible, rpFull(p))}` : "Baru bulan ini"}</span></div><div className="dpx-rp-amt"><b>{mk(visible, rpFull(v))}</b><Chg d={d} /></div></div>; })}</div>
          <p className="dpx-st-foot">Total keluar bulan lalu {mk(visible, rupiah(ptAll.out))}.</p></Card> : null}
      </> : null}

      {tab === "flow" ? <>
        <div className="dpx-st-tip"><span className="dpx-cat dpx-c-blue"><Ic n="info" /></span><div><b>Ke mana uang bulan ini mengalir</b><span className="dpx-sub">Dari sumber pemasukan ke kategori pengeluaran dan kas bersih. Ketuk diagram untuk memperbesar.</span></div></div>
        <Card><FlowCard graph={graph} state={state} visible={visible} title={`Arus uang ${monthLabel(cursor.y, cursor.m)}`} /></Card>
        <div className="dpx-st-stats"><div><span className="dpx-st-up">Masuk</span><b className="dpx-up">{mk(visible, rpFull(graph.income))}</b></div><div><span className="dpx-st-up">Keluar</span><b>{mk(visible, rpFull(graph.spent))}</b></div><div><span className="dpx-st-up">{graph.net >= 0 ? "Kas bersih" : "Kekurangan"}</span><b className={graph.net >= 0 ? "dpx-up" : "dpx-dn"}>{mk(visible, rpFull(Math.abs(graph.net)))}</b></div><div><span className="dpx-st-up">Porsi tersisa</span><b>{graph.income > 0 ? `${Math.max(0, Math.round((graph.net / graph.income) * 100))}%` : "—"}</b></div></div>
        <Card title="Sumber pemasukan"><div className="dpx-rp-list">{graph.left.map((n) => <div key={n.id} className="dpx-rp-row"><div><b>{n.id === "_gap" ? "Dari saldo" : n.id === "_inrest" ? "Pemasukan lain" : catOf(state, n.id).name}</b></div><b className="dpx-up">{mk(visible, rpFull(n.amount))}</b></div>)}</div></Card>
        <Card title="Tujuan uang"><div className="dpx-rp-list">{graph.right.map((n) => <div key={n.id} className="dpx-rp-row"><div><b>{n.id === "_net" ? "Kas bersih" : nameOf(n.id === "_outrest" ? "_rest" : n.id)}</b><span className="dpx-sub">{graph.total > 0 ? `${Math.round((n.amount / graph.total) * 100)}% dari ${graph.income >= graph.total ? "pemasukan" : "total dana"}` : ""}</span></div><b className={n.kind === "net" ? "dpx-up" : ""}>{mk(visible, rpFull(n.amount))}</b></div>)}</div></Card>
      </> : null}
    </motion.div></AnimatePresence>}
  </div></Sky></div>;
}
