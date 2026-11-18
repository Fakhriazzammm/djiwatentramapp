import { useMemo, useState, type ReactNode } from "react";
import { Btn, I3, Ic, Sky, type IconName } from "../shell/dpx-ui";
import { CatIcon, catOf } from "./fin-sheets";
import type { FinCtx } from "./fin-pages";
import { DragRow, DailyBars } from "./story-charts";
import { budgetStatuses, daysIn, daysUntil, debtPaid, debtRemaining, debtTotals, detectSubscriptions, goalPlan, inMonth, safeToSpend, spendByCategory, totals, uid } from "../../lib/finance/calc";
import { allocate, payday, pocketUsage, pocketsOf, payoffPlan } from "../../lib/finance/kelola";
import { rpFull } from "./story-charts";
import { monthLabel } from "../../lib/djiwa-pay-summary";
import { rupiah } from "../../lib/djiwa-pay-format";
import type { Budget, Debt } from "../../lib/finance/types";

type Tab = "bud" | "pocket" | "goal" | "debt";
const TABS: [Tab, string][] = [["bud", "Anggaran"], ["pocket", "Kantong"], ["goal", "Tujuan"], ["debt", "Hutang"]];
const mk = (v: boolean, t: string) => (v ? t : "•••••");
const COLORS = ["#c9461b", "#2b2620", "#c9962e", "#4f7a2b", "#3b6ea5", "#8a5ba8"];
const dateShort = (iso: string) => new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short" });

function Card({ title, right, children, className = "" }: { title?: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`dpx-st-card ${className}`}>{title ? <div className="dpx-st-ch"><h2>{title}</h2>{right}</div> : null}{children}</section>;
}
const Empty = ({ img, title, text, children }: { img: "order-receipt" | "sales-report" | "restaurant-cafe" | "loyalty-points"; title: string; text: string; children?: ReactNode }) => <div className="dpx-empty"><I3 name={img} px={112} /><b>{title}</b><p>{text}</p>{children}</div>;
const Chip = ({ tone, children }: { tone: "ok" | "warn" | "bad" | "mute"; children: ReactNode }) => <span className={`dpx-pl-chip ${tone}`}>{children}</span>;
const Meter = ({ pct, tone, mark }: { pct: number; tone?: "ok" | "warn" | "bad"; mark?: number }) => <div className={`dpx-pl-meter ${tone ?? ""}`}><i style={{ width: `${Math.max(2, Math.min(100, pct))}%` }} />{mark !== undefined && mark > 0 && mark < 100 ? <b style={{ left: `${mark}%` }} /> : null}</div>;

/** Rencana: budgets, pockets, goals and debts. Every list can be created, opened, edited and deleted. */
export function FinBudget({ ctx }: { ctx: FinCtx }) {
  const { fin, nav, visible } = ctx, { state, entries } = fin, today = new Date();
  const [tab, setTab] = useState<Tab>(() => { const q = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("bagian") : null; return q === "kantong" ? "pocket" : q === "tujuan" ? "goal" : q === "hutang" ? "debt" : "bud"; });
  const [cursor, setCursor] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const [debtView, setDebtView] = useState<"all" | "i_owe" | "owed_to_me">("all"), [showSettled, setShowSettled] = useState(false);
  const isCurrent = cursor.y === today.getFullYear() && cursor.m === today.getMonth();
  const shift = (d: number) => setCursor((c) => { const n = new Date(c.y, c.m + d, 1); return { y: n.getFullYear(), m: n.getMonth() }; });
  const dim = daysIn(cursor.y, cursor.m), elapsed = isCurrent ? today.getDate() : dim, daysLeft = isCurrent ? dim - today.getDate() + 1 : 0;
  const month = useMemo(() => entries.filter((e) => inMonth(e, cursor.y, cursor.m)), [entries, cursor]);
  const statuses = useMemo(() => budgetStatuses(state.budgets, month), [state.budgets, month]);
  const spendAll = useMemo(() => spendByCategory(month), [month]);
  const refNow = isCurrent ? today : new Date(cursor.y, cursor.m, dim, 12);
  const safe = safeToSpend(state.budgets, month, refNow);
  const totalLimit = state.budgets.reduce((s, b) => s + b.limit, 0), usedAll = statuses.reduce((s, x) => s + x.used, 0), pctAll = totalLimit > 0 ? (usedAll / totalLimit) * 100 : 0;
  const projected = elapsed > 0 ? (usedAll / elapsed) * dim : 0, projPct = totalLimit > 0 ? (projected / totalLimit) * 100 : 0;
  const perDay = useMemo(() => { const a = Array.from({ length: dim }, () => 0); const ids = new Set(state.budgets.map((b) => b.categoryId)); for (const e of month) if (e.kind === "out" && ids.has(e.categoryId)) a[new Date(e.at).getDate() - 1] += e.amount; return a; }, [month, dim, state.budgets]);
  const unbudgeted = useMemo(() => [...spendAll.entries()].filter(([id]) => !state.budgets.some((b) => b.categoryId === id) && !catOf(state, id).income).sort((a, b) => b[1] - a[1]).slice(0, 5), [spendAll, state.budgets]);
  const avg3 = useMemo(() => { const out = new Map<string, number>(); for (let i = 1; i <= 3; i++) { const d = new Date(today.getFullYear(), today.getMonth() - i, 1); for (const [id, v] of spendByCategory(entries.filter((e) => inMonth(e, d.getFullYear(), d.getMonth())))) out.set(id, (out.get(id) ?? 0) + v / 3); } return out; }, [entries]);   // eslint-disable-line react-hooks/exhaustive-deps
  const autoFill = () => {
    const picks = [...avg3.entries()].filter(([id, v]) => v >= 50_000 && !state.budgets.some((b) => b.categoryId === id) && !catOf(state, id).income && id !== "transfer").sort((a, b) => b[1] - a[1]).slice(0, 6);
    if (!picks.length) { ctx.notify("Belum ada pengeluaran 3 bulan terakhir untuk dijadikan anggaran"); return; }
    const before = state.budgets;
    fin.dispatch({ type: "budget/setMany", budgets: picks.map(([categoryId, v]) => ({ categoryId, limit: Math.max(50_000, Math.round((v * 1.05) / 10_000) * 10_000), rollover: false }) satisfies Budget) });
    ctx.notify(`${picks.length} anggaran dibuat dari rata-rata 3 bulan`, () => { for (const [id] of picks) if (!before.some((b) => b.categoryId === id)) fin.dispatch({ type: "budget/delete", categoryId: id }); });
  };
  const dt = debtTotals(state.debts), subs = useMemo(() => detectSubscriptions(state.entries), [state.entries]);
  const activeDebts = state.debts.filter((d) => !d.settled), doneDebts = state.debts.filter((d) => d.settled);
  const listDebts = activeDebts.filter((d) => debtView === "all" || d.direction === debtView).sort((a, b) => (daysUntil(a.due) ?? 9999) - (daysUntil(b.due) ?? 9999));
  const dueSoon = activeDebts.filter((d) => { const n = daysUntil(d.due); return n !== null && n <= 7; });
  const income = Math.max(totals(month).in, payday(entries)?.amount ?? 0), pockets = pocketsOf(state), alloc = allocate(income, pockets), pctSum = pockets.reduce((n, p) => n + p.percent, 0);
  const goals = state.goals.map((g) => ({ g, p: goalPlan(g) })), goalSum = goals.reduce((n, x) => ({ saved: n.saved + x.p.saved, target: n.target + x.g.target }), { saved: 0, target: 0 });
  const badge: Record<Tab, number> = { bud: statuses.filter((s) => s.level !== "ok").length, pocket: 0, goal: 0, debt: dueSoon.length };

  return <div className="dpx-page"><Sky><div className="dpx-pad">
    <div className="dpx-hdr" style={{ paddingTop: 0 }}><h1 className="dpx-page-title" style={{ flex: 1 }}>Rencana</h1><Btn type="button" className="dpx-rb" onClick={() => nav.go("/kalender")} aria-label="Kalender tagihan"><Ic n="cal" /></Btn></div>
    <div className="dpx-rp-tabs" role="tablist">{TABS.map(([k, l]) => <Btn key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}{badge[k] ? <i className="dpx-pl-badge">{badge[k]}</i> : null}</Btn>)}</div>
    <div className="dpx-st-body" style={{ paddingTop: 10 }}>

    {tab === "bud" ? <>
      <div className="dpx-rp-month"><Btn type="button" className="dpx-rb" onClick={() => shift(-1)} aria-label="Bulan sebelumnya"><Ic n="back" size="sm" /></Btn><b>{monthLabel(cursor.y, cursor.m)}</b><Btn type="button" className="dpx-rb" style={isCurrent ? { opacity: 0.4 } : undefined} disabled={isCurrent} onClick={() => shift(1)} aria-label="Bulan berikutnya"><span style={{ display: "inline-flex", transform: "scaleX(-1)" }}><Ic n="back" size="sm" /></span></Btn></div>
      {state.budgets.length === 0 ? <Card><Empty img="sales-report" title="Belum ada anggaran" text="Tentukan batas per kategori. Kami hitung berapa yang aman dibelanjakan setiap hari.">
        <div className="dpx-pl-actions"><Btn type="button" className="dpx-btn" onClick={() => ctx.open({ k: "budget" })}><Ic n="plus" size="sm" /> Atur anggaran</Btn><Btn type="button" className="dpx-btn dpx-ghost" onClick={autoFill}>Isi dari rata-rata 3 bulan</Btn></div></Empty></Card> : <>
        <Card>
          <div className="dpx-pl-hero"><svg viewBox="0 0 132 132" className="dpx-pl-ring" role="img" aria-label={`${Math.round(pctAll)} persen terpakai`}><circle cx="66" cy="66" r="54" fill="none" stroke="rgba(45,36,29,.08)" strokeWidth="13" /><circle cx="66" cy="66" r="54" fill="none" stroke={pctAll > 100 ? "#c42a1e" : pctAll >= 80 ? "#d9941a" : "#4f7a2b"} strokeWidth="13" strokeLinecap="round" strokeDasharray={339.3} strokeDashoffset={339.3 * (1 - Math.min(1, pctAll / 100))} transform="rotate(-90 66 66)" /><text x="66" y="64" textAnchor="middle" style={{ font: "800 26px var(--font)", fill: "#241f1a" }}>{Math.round(pctAll)}%</text><text x="66" y="82" textAnchor="middle" style={{ font: "11px var(--font)", fill: "#74695a" }}>terpakai</text></svg>
            <div style={{ minWidth: 0 }}><span className="dpx-st-up">{usedAll > totalLimit ? "Melebihi" : "Sisa anggaran"}</span><div className="dpx-rp-big" style={{ fontSize: 26 }}>{mk(visible, rpFull(Math.abs(totalLimit - usedAll)))}</div><div className="dpx-sub">dari {mk(visible, rpFull(totalLimit))}</div></div></div>
          <div className="dpx-pl-facts">
            {isCurrent && safe ? <div><span className="dpx-st-up">Aman hari ini</span><b>{mk(visible, rpFull(Math.max(0, safe.perDay)))}</b></div> : null}
            {isCurrent ? <div><span className="dpx-st-up">Sisa hari</span><b>{daysLeft} hari</b></div> : <div><span className="dpx-st-up">Total terpakai</span><b>{mk(visible, rpFull(usedAll))}</b></div>}
            <div><span className="dpx-st-up">{isCurrent ? "Perkiraan akhir" : "Rata-rata harian"}</span><b>{mk(visible, rpFull(Math.round(isCurrent ? projected : usedAll / Math.max(1, dim))))}</b></div></div>
          {isCurrent && totalLimit > 0 ? <div className={`dpx-st-tip ${projPct > 100 ? "dpx-st-warn" : ""}`}><span className={`dpx-cat dpx-c-${projPct > 100 ? "amber" : "emerald"}`}><Ic n={projPct > 100 ? "warn" : "spark"} /></span><div><b>{projPct > 100 ? "Laju sekarang melebihi anggaran" : "Lajumu masih aman"}</b><span className="dpx-sub">{projPct > 100 ? `Jika sama terus, akhir bulan Rp ${Math.round(projected - totalLimit).toLocaleString("id-ID")} di atas batas.` : `Jika sama terus, akhir bulan sisa Rp ${Math.round(totalLimit - projected).toLocaleString("id-ID")}.`}</span></div></div> : null}</Card>
        <Card title="Pengeluaran harian" right={<span className="dpx-sub">kategori beranggaran</span>}><DailyBars perDay={perDay} elapsed={elapsed} today={isCurrent ? today.getDate() : null} visible={visible} /></Card>
        <div className="dpx-sec dpx-st-sec"><h2>Per kategori</h2><Btn type="button" onClick={() => ctx.open({ k: "budget" })}>+ Tambah</Btn></div>
        <div className="dpx-pl-list">{statuses.map((s) => { const c = catOf(state, s.budget.categoryId), projC = elapsed > 0 ? (s.used / elapsed) * dim : 0, left = s.remaining, perD = daysLeft > 0 && left > 0 ? left / daysLeft : 0;
          return <Btn key={s.budget.categoryId} type="button" className="dpx-st-card dpx-pl-row" onClick={() => ctx.open({ k: "budget", cid: s.budget.categoryId })}>
            <div className="dpx-pl-row-t"><CatIcon cat={c} /><div><b>{c.name}</b><span className="dpx-sub">{mk(visible, rupiah(s.used))} dari {mk(visible, rupiah(s.budget.limit))}{s.budget.rollover ? " · rollover" : ""}</span></div><Chip tone={s.level === "over" ? "bad" : s.level === "warn" ? "warn" : "ok"}>{s.level === "over" ? "Lewat" : s.level === "warn" ? "Mepet" : "Aman"} {Math.round(s.percent)}%</Chip></div>
            <Meter pct={s.percent} tone={s.level === "over" ? "bad" : s.level === "warn" ? "warn" : "ok"} mark={isCurrent && s.budget.limit > 0 ? (projC / s.budget.limit) * 100 : undefined} />
            <span className="dpx-sub">{s.level === "over" ? `Lewat ${mk(visible, rupiah(-left))}` : `Sisa ${mk(visible, rupiah(left))}`}{isCurrent && perD > 0 ? ` · ±${mk(visible, rupiah(Math.round(perD)))} per hari` : ""}{isCurrent && projC > s.budget.limit && s.level !== "over" ? " · diperkirakan lewat" : ""}</span></Btn>; })}</div>
        {unbudgeted.length ? <Card title="Belum dianggarkan" right={<span className="dpx-sub">pengeluaran bulan ini</span>}><div className="dpx-rp-list">{unbudgeted.map(([id, v]) => { const c = catOf(state, id); return <div key={id} className="dpx-rp-row"><CatIcon cat={c} /><div><b>{c.name}</b><span className="dpx-sub">{mk(visible, rupiah(v))}{avg3.get(id) ? ` · rata-rata ${mk(visible, rupiah(avg3.get(id) ?? 0))}` : ""}</span></div><Btn type="button" className="dpx-pl-mini" onClick={() => ctx.open({ k: "budget", cid: id })}>Atur</Btn></div>; })}</div></Card> : null}
        <Btn type="button" className="dpx-btn dpx-ghost" onClick={autoFill}>Isi kategori lain dari rata-rata 3 bulan</Btn></>}
    </> : null}

    {tab === "pocket" ? <>
      <div className="dpx-st-tip"><span className="dpx-cat dpx-c-blue"><Ic n="pie" /></span><div><b>Bagi pemasukan ke kantong</b><span className="dpx-sub">Kebutuhan, keinginan, tabungan, atau kantong buatanmu. Ini pembagian catatan; saldo Djiwa Pay tetap satu dompet.</span></div></div>
      <Card><div className="dpx-st-ch"><span className="dpx-st-up">Dasar pembagian bulan ini</span><span className={`dpx-pl-chip ${pctSum === 100 ? "ok" : "warn"}`}>Total {pctSum}%</span></div>
        <div className="dpx-rp-big" style={{ fontSize: 28 }}>{income > 0 ? mk(visible, rpFull(income)) : "Belum ada pemasukan"}</div>
        {income <= 0 ? <p className="dpx-sub">Catat pemasukan (gaji) agar kantong bisa dihitung.</p> : null}
        <div className="dpx-pl-stack">{pockets.map((p, i) => <i key={p.id} style={{ width: `${p.percent}%`, background: COLORS[i % COLORS.length] }} title={`${p.name} ${p.percent}%`} />)}{pctSum < 100 ? <i style={{ width: `${100 - pctSum}%`, background: "rgba(43,38,32,.08)" }} /> : null}</div>
        <div className="dpx-st-legend">{pockets.map((p, i) => <span key={p.id}><i style={{ background: COLORS[i % COLORS.length] }} />{p.name} {p.percent}%</span>)}</div>
        {pctSum !== 100 ? <p className="dpx-sub" style={{ color: pctSum > 100 ? "var(--danger)" : "var(--warn)" }}>{pctSum > 100 ? `Total ${pctSum}%, kurangi ${pctSum - 100}% dari salah satu kantong.` : `${100 - pctSum}% belum dibagi.`}</p> : null}</Card>
      <div className="dpx-pl-list">{alloc.map(({ pocket, amount }, i) => { const u = pocketUsage(pocket, month, income), over = u.percent > 100, hasCats = pocket.categoryIds.length > 0;
        return <Btn key={pocket.id} type="button" className="dpx-st-card dpx-pl-row" onClick={() => ctx.open({ k: "pocket", id: pocket.id })}>
          <div className="dpx-pl-row-t"><span className={`dpx-cat dpx-c-${pocket.tone}`}><Ic n={pocket.icon as IconName} /></span><div><b>{pocket.name} · {pocket.percent}%</b><span className="dpx-sub">{hasCats ? `Terpakai ${mk(visible, rupiah(u.used))} dari ${mk(visible, rupiah(amount))}` : `Disisihkan ${mk(visible, rupiah(amount))} per bulan`}</span></div>{hasCats ? <Chip tone={over ? "bad" : u.percent >= 80 ? "warn" : "ok"}>{Math.round(u.percent)}%</Chip> : null}</div>
          {hasCats ? <Meter pct={u.percent} tone={over ? "bad" : u.percent >= 80 ? "warn" : "ok"} /> : null}
          {hasCats ? <span className="dpx-sub">{over ? `Lewat ${mk(visible, rupiah(-u.left))}` : `Sisa ${mk(visible, rupiah(u.left))}`} · {pocket.categoryIds.map((id) => catOf(state, id).name).slice(0, 4).join(", ")}{pocket.categoryIds.length > 4 ? "…" : ""}</span> : <span className="dpx-sub">Tanpa kategori. Tambahkan kategori agar pemakaiannya terhitung.</span>}</Btn>; })}</div>
      <div className="dpx-pl-actions"><Btn type="button" className="dpx-btn" onClick={() => ctx.open({ k: "pocket" })}><Ic n="plus" size="sm" /> Kantong baru</Btn><Btn type="button" className="dpx-btn dpx-ghost" onClick={() => ctx.open({ k: "pockets" })}>Pakai pola 50/30/20</Btn></div>
    </> : null}

    {tab === "goal" ? <>
      {goals.length === 0 ? <Card><Empty img="loyalty-points" title="Belum ada tujuan" text="Menabung untuk dana darurat, liburan, atau gadget baru. Pantau progresnya di sini."><Btn type="button" className="dpx-btn" style={{ maxWidth: 300 }} onClick={() => ctx.open({ k: "goal" })}><Ic n="plus" size="sm" /> Tujuan baru</Btn></Empty></Card> : <>
        <Card><span className="dpx-st-up">Total tertabung</span><div className="dpx-rp-big" style={{ fontSize: 28 }}>{mk(visible, rpFull(goalSum.saved))}</div><div className="dpx-sub">dari target {mk(visible, rpFull(goalSum.target))} · {goals.length} tujuan</div><Meter pct={goalSum.target > 0 ? (goalSum.saved / goalSum.target) * 100 : 0} tone="ok" /></Card>
        <div className="dpx-pl-list">{goals.map(({ g, p }) => <Btn key={g.id} type="button" className="dpx-st-card dpx-pl-row" onClick={() => ctx.open({ k: "goal-detail", id: g.id })}>
          <div className="dpx-pl-row-t"><span className="dpx-cat dpx-c-emerald"><Ic n="target" /></span><div><b>{g.name}</b><span className="dpx-sub">{mk(visible, rupiah(p.saved))} dari {mk(visible, rupiah(g.target))}</span></div>{p.done ? <Chip tone="ok">Tercapai</Chip> : p.onTrack === false ? <Chip tone="warn">Tertinggal</Chip> : p.onTrack ? <Chip tone="ok">Di jalur</Chip> : <Chip tone="mute">{Math.round(p.pct)}%</Chip>}</div>
          <Meter pct={p.pct} tone={p.done ? "ok" : p.onTrack === false ? "warn" : undefined} />
          <span className="dpx-sub">{p.done ? "Selamat, target terpenuhi." : <>{g.due ? `Target ${new Date(g.due).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}${p.days !== null ? p.days >= 0 ? ` · ${p.days} hari lagi` : ` · lewat ${-p.days} hari` : ""}` : p.eta ? `Perkiraan tercapai ${p.eta.toLocaleDateString("id-ID", { month: "short", year: "numeric" })}` : "Setor pertama untuk mulai"}{p.perMonthNeeded ? ` · butuh ${mk(visible, rupiah(p.perMonthNeeded))}/bulan` : ""}</>}</span></Btn>)}</div>
        <Btn type="button" className="dpx-btn dpx-ghost" onClick={() => ctx.open({ k: "goal" })}><Ic n="plus" size="sm" /> Tujuan baru</Btn></>}
    </> : null}

    {tab === "debt" ? <>
      <div className="dpx-st-stats"><div><span className="dpx-st-up">Orang berutang padamu</span><b className="dpx-up">{mk(visible, rpFull(dt.owedToMe))}</b></div><div><span className="dpx-st-up">Kamu berutang</span><b className="dpx-dn">{mk(visible, rpFull(dt.iOwe))}</b></div></div>
      {dueSoon.length ? <Card title="Perlu perhatian"><div className="dpx-rp-list">{dueSoon.map((d) => { const n = daysUntil(d.due) ?? 0; return <Btn key={d.id} type="button" className="dpx-rp-row" onClick={() => ctx.open({ k: "debt", id: d.id })}><span className={`dpx-cat dpx-c-${n < 0 ? "rose" : "amber"}`}><Ic n="warn" /></span><div><b>{d.person}</b><span className="dpx-sub">{d.direction === "i_owe" ? "Kamu harus bayar" : "Dia harus bayar"} · {n < 0 ? `terlambat ${-n} hari` : n === 0 ? "hari ini" : `${n} hari lagi`}</span></div><b>{mk(visible, rupiah(debtRemaining(d)))}</b></Btn>; })}</div></Card> : null}
      <div className="dpx-sec dpx-st-sec"><h2>Aktif ({activeDebts.length})</h2><Btn type="button" onClick={() => ctx.open({ k: "debt" })}>+ Tambah</Btn></div>
      {activeDebts.length ? <DragRow className="dpx-st-tabs" role="tablist">{([["all", "Semua"], ["i_owe", "Hutangku"], ["owed_to_me", "Piutang"]] as const).map(([k, l]) => <Btn key={k} type="button" role="tab" aria-selected={debtView === k} className={debtView === k ? "on" : ""} onClick={() => setDebtView(k)}>{l}</Btn>)}</DragRow> : null}
      {activeDebts.length === 0 ? <Card><Empty img="order-receipt" title="Belum ada hutang atau piutang" text="Catat pinjaman supaya tidak lupa. Cicilan bisa dicatat sebagian-sebagian."><Btn type="button" className="dpx-btn" style={{ maxWidth: 300 }} onClick={() => ctx.open({ k: "debt" })}><Ic n="plus" size="sm" /> Catat hutang atau piutang</Btn></Empty></Card> :
        <div className="dpx-pl-list">{listDebts.map((d) => <DebtRow key={d.id} d={d} visible={visible} onOpen={() => ctx.open({ k: "debt", id: d.id })} />)}{listDebts.length === 0 ? <p className="dpx-st-empty">Tidak ada catatan di filter ini.</p> : null}</div>}
      {dt.iOwe > 0 ? <Btn type="button" className="dpx-st-tip" onClick={() => ctx.open({ k: "payoff" })}><span className="dpx-cat dpx-c-rose"><Ic n="trend" /></span><div><b>Rencana pelunasan</b><span className="dpx-sub">Hitung kapan bebas hutang dengan cicilan per bulan.</span></div></Btn> : null}
      {doneDebts.length ? <><div className="dpx-sec dpx-st-sec"><h2>Lunas ({doneDebts.length})</h2><Btn type="button" onClick={() => setShowSettled((v) => !v)}>{showSettled ? "Sembunyikan" : "Lihat"}</Btn></div>{showSettled ? <div className="dpx-pl-list">{doneDebts.map((d) => <DebtRow key={d.id} d={d} visible={visible} onOpen={() => ctx.open({ k: "debt", id: d.id })} />)}</div> : null}</> : null}
      <div className="dpx-sec dpx-st-sec"><h2>Alat lain</h2></div>
      <Btn type="button" className="dpx-st-card dpx-pl-row" onClick={() => ctx.open({ k: "split" })}><div className="dpx-pl-row-t"><span className="dpx-cat dpx-c-orange"><Ic n="split" /></span><div><b>Patungan / bagi tagihan</b><span className="dpx-sub">Hitung bagian tiap orang</span></div></div></Btn>
      <Card title="Langganan terdeteksi" right={subs.length ? <span className="dpx-sub">{mk(visible, rupiah(subs.reduce((s, x) => s + x.amount, 0)))}/bulan</span> : undefined}>
        {subs.length === 0 ? <p className="dpx-sub" style={{ margin: 0 }}>Muncul otomatis bila pengeluaran dengan catatan yang sama berulang di 2 bulan berbeda.</p> : <div className="dpx-rp-list">{subs.map((s) => { const has = state.bills.some((b) => b.name.trim().toLowerCase() === s.name.trim().toLowerCase()); return <div key={s.name} className="dpx-rp-row"><span className="dpx-cat dpx-c-violet"><Ic n="repeat" /></span><div><b>{s.name}</b><span className="dpx-sub">Tiap tgl {s.day} · {s.months} bulan</span></div><div className="dpx-rp-amt"><b>{mk(visible, rupiah(s.amount))}</b>{has ? <span className="dpx-sub">Sudah jadi tagihan</span> : <Btn type="button" className="dpx-pl-mini" onClick={() => { fin.dispatch({ type: "bill/upsert", bill: { id: uid(), name: s.name, amount: s.amount, day: s.day, icon: "repeat", tone: "violet", paid: [] } }); ctx.notify(`${s.name} masuk kalender tagihan`); }}>Jadikan tagihan</Btn>}</div></div>; })}</div>}</Card>
    </> : null}
    </div>
  </div></Sky></div>;
}

function DebtRow({ d, visible, onOpen }: { d: Debt; visible: boolean; onOpen: () => void }) {
  const mine = d.direction === "i_owe", paid = debtPaid(d), rem = debtRemaining(d), n = daysUntil(d.due), pct = d.settled ? 100 : d.amount > 0 ? (paid / d.amount) * 100 : 0;
  return <Btn type="button" className="dpx-st-card dpx-pl-row" onClick={onOpen}>
    <div className="dpx-pl-row-t"><span className={`dpx-cat dpx-c-${mine ? "rose" : "emerald"}`}><Ic n={mine ? "up" : "down"} /></span><div><b>{d.person}</b><span className="dpx-sub">{mine ? "Kamu berutang" : "Berutang padamu"}{d.note ? ` · ${d.note}` : ""}</span></div><div className="dpx-rp-amt"><b className={mine ? "dpx-dn" : "dpx-up"}>{d.settled ? "Lunas" : mk(visible, rupiah(rem))}</b>{!d.settled && paid > 0 ? <span className="dpx-sub">dari {mk(visible, rupiah(d.amount))}</span> : null}</div></div>
    {d.settled ? null : <Meter pct={pct} tone={mine ? undefined : "ok"} />}
    {!d.settled && (n !== null || paid > 0) ? <span className="dpx-sub">{paid > 0 ? `${mine ? "Dibayar" : "Diterima"} ${mk(visible, rupiah(paid))}` : ""}{paid > 0 && n !== null ? " · " : ""}{n !== null ? (n < 0 ? <span className="dpx-dn">terlambat {-n} hari</span> : n === 0 ? "jatuh tempo hari ini" : `jatuh tempo ${dateShort(d.due!)} (${n} hari)`) : ""}</span> : null}</Btn>;
}
export { payoffPlan };
