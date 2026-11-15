import { useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AnimatedNumber, Bar, Btn, Header, I3, Ic, Reveal, Row, Seg, Sky, spring, type IconName } from "../shell/dpx-ui";
import { MoneyInput } from "../finance/fin-sheets";
import type { FinCtx } from "../finance/fin-pages";
import { AreaChart, ScoreRing, short, toneColor } from "./kelola-ui";
import { accountBalance, daysIn, debtTotals, goalSaved, inMonth, totals } from "../../lib/finance/calc";
import { PAY_ACCOUNT_ID } from "../../lib/finance/categories";
import { ASSET_KINDS, afford, allocate, assetMix, billsFor, dailyBurn, emergencyFund, forecast, healthScore, loan, netWorth, payday, pocketUsage, pocketsOf, unpaidTotal, zakatMaal, type AffordMode, type BillView } from "../../lib/finance/kelola";
import { rupiah } from "../../lib/djiwa-pay-format";

/** Total cash across wallets, Djiwa Pay included. */
export function useCash(ctx: FinCtx) {
  const { state, entries } = ctx.fin;
  return useMemo(() => state.accounts.filter((a) => !a.archived).reduce((s, a) => s + accountBalance(a, entries, ctx.payBalance), 0) + ctx.payBalance, [state.accounts, entries, ctx.payBalance]);
}
const mask = (ctx: FinCtx, v: string) => (ctx.visible ? v : "•••••");
const statusTag = (v: BillView) => v.status === "paid" ? <span className="dpx-tag dpx-ok">Lunas</span> : v.status === "late" ? <span className="dpx-tag dpx-danger">Terlambat</span> : v.status === "today" ? <span className="dpx-tag dpx-warn">Hari ini</span> : <span className="dpx-tag">{v.daysLeft} hari lagi</span>;
const Note = ({ tone = "info", icon = "info", children }: { tone?: "info" | "danger"; icon?: IconName; children: ReactNode }) => <div className={`dpx-note dpx-${tone}`}><Ic n={icon} /><div>{children}</div></div>;
const Disclaimer = () => <p className="dpx-sub" style={{ marginTop: 12 }}>Perkiraan berdasarkan catatanmu, bukan nasihat keuangan.</p>;

function useKelola(ctx: FinCtx) {
  const { state, entries } = ctx.fin, now = new Date(), cash = useCash(ctx);
  const month = useMemo(() => entries.filter((e) => inMonth(e, now.getFullYear(), now.getMonth())), [entries]);
  const views = useMemo(() => billsFor(state.bills, now), [state.bills]);
  const health = useMemo(() => healthScore({ entries, state, cash }), [entries, state, cash]);
  const fc = useMemo(() => forecast(cash, entries, state.bills, now), [cash, entries, state.bills]);
  return { state, entries, now, cash, month, views, health, fc };
}

/* ---------- Beranda: kartu pengelolaan ---------- */
export function KelolaHome({ ctx }: { ctx: FinCtx }) {
  const k = useKelola(ctx), { nav } = ctx;
  const due = k.views.filter((v) => v.status !== "paid").slice(0, 3);
  const bad = k.fc.runsOutDay !== null;
  return <>
    <Reveal i={2}><Btn type="button" className="dpx-hero-day" style={{ width: "100%", textAlign: "left", marginTop: 12 }} onClick={() => nav.go("/kesehatan")}>
      <div className="dpx-flex" style={{ gap: 14 }}><ScoreRing score={k.health.score} tone={k.health.tone} />
        <div style={{ flex: 1, minWidth: 0 }}><div className="dpx-sub">Kesehatan keuangan</div><div className="dpx-money" style={{ color: toneColor(k.health.tone) }}>{k.health.label}</div>
          <div className="dpx-sub" style={{ marginTop: 3 }}>Langkah tercepat: {[...k.health.pillars].sort((a, b) => a.score - b.score)[0].action.toLowerCase()}.</div></div></div>
      <div className="dpx-chips2" style={{ marginTop: 8 }}>{k.health.pillars.slice(0, 2).map((p) => <span key={p.id} className="dpx-chip3">{p.name} {p.score}</span>)}</div>
    </Btn></Reveal>
    <Reveal i={3}><Btn type="button" className="dpx-group dpx-white" style={{ width: "100%", textAlign: "left", marginTop: 10 }} onClick={() => nav.go("/prakiraan")}>
      <div className="dpx-spread"><div><div className="dpx-sub">{bad ? `Kas diperkirakan habis tgl ${k.fc.runsOutDay}` : `Kas sampai akhir bulan`}</div><div className="dpx-money" style={{ color: k.fc.end < 0 ? "var(--danger)" : "var(--navy)" }}>{mask(ctx, rupiah(k.fc.end))}</div></div><span className={`dpx-tag ${bad ? "dpx-danger" : "dpx-ok"}`}>{bad ? "Defisit" : "Aman"}</span></div>
      <div style={{ marginTop: 6 }}><AreaChart points={k.fc.pts} height={64} color={bad ? "#d23a2a" : "#1a5dc6"} label="Prakiraan saldo sampai akhir bulan" /></div>
    </Btn></Reveal>
    <Reveal i={4}><Btn type="button" className="dpx-group dpx-flex" style={{ width: "100%", textAlign: "left", marginTop: 10 }} onClick={() => ctx.open({ k: "weekly" })}><span className="dpx-cat dpx-c-emerald"><Ic n="spark" /></span><span style={{ flex: 1 }}><b>Review mingguan</b><div className="dpx-sub">Bandingkan belanja 7 hari ini dengan minggu lalu</div></span><Ic n="chev" size="sm" /></Btn></Reveal>
    <div className="dpx-sec"><h2>Tagihan terdekat</h2><Btn type="button" onClick={() => nav.go("/kalender")}>Kalender</Btn></div>
    {due.length ? <div className="dpx-group dpx-white">{due.map((v, i) => <motion.div key={v.bill.id} className="dpx-row" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: i * 0.05 }}>
      <span className={`dpx-cat dpx-c-${v.bill.tone}`}><Ic n={v.bill.icon as IconName} /></span><span className="dpx-main"><b>{v.bill.name}</b><span>{statusTag(v)}</span></span>
      <span className="dpx-trail"><b>{rupiah(v.bill.amount)}</b></span><Btn type="button" className="dpx-btn dpx-sm" style={{ margin: "0 0 0 8px" }} onClick={() => ctx.open({ k: "bill-pay", id: v.bill.id })}>Bayar</Btn></motion.div>)}</div>
      : <div className="dpx-group dpx-center"><div className="dpx-sub">{ctx.fin.state.bills.length ? "Semua tagihan bulan ini sudah lunas." : "Tambahkan tagihan rutin agar tidak ada yang terlewat."}</div><Btn type="button" className="dpx-btn dpx-sm dpx-ghost" style={{ display: "inline-flex" }} onClick={() => ctx.open({ k: "bill" })}><Ic n="plus" size="sm" /> Tambah tagihan</Btn></div>}
    <div className="dpx-sec"><h2>Rencana & alat</h2></div>
    <div className="dpx-tile3" style={{ gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>{([["Kantong", "pie", "t-sky", "/rencana?bagian=kantong"], ["Tujuan", "target", "t-mint", "/rencana?bagian=tujuan"], ["Bisa beli?", "bag", "t-peach", "/alat"], ["Alat", "grid", "t-lav", "/alat"]] as const).map(([l, ic, t, p], i) => <Btn key={l} type="button" className={`dpx-tile ${t}`} onClick={() => nav.go(p)} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ ...spring, delay: 0.1 + i * 0.05 }} whileTap={{ scale: 0.94 }}><Ic n={ic} size="lg" /><span>{l}</span></Btn>)}</div>
  </>;
}

/* ---------- Rencana: kantong ---------- */
export function PocketsPanel({ ctx }: { ctx: FinCtx }) {
  const { state, entries } = ctx.fin, now = new Date();
  const month = entries.filter((e) => inMonth(e, now.getFullYear(), now.getMonth()));
  const income = Math.max(totals(month).in, payday(entries)?.amount ?? 0);
  const pockets = pocketsOf(state), alloc = allocate(income, pockets);
  return <>
    <Note icon="pie">Bagi gaji ke <b>kantong</b>: kebutuhan, keinginan, tabungan. Ini pembagian catatan, saldo Djiwa Pay tetap satu dompet.</Note>
    {income > 0 ? <div className="dpx-group dpx-white dpx-center" style={{ marginTop: 10 }}><div className="dpx-sub">Dasar pembagian bulan ini</div><div className="dpx-money">{mask(ctx, rupiah(income))}</div></div> : <Note icon="warn">Catat pemasukan gaji agar kantong bisa dihitung.</Note>}
    <div className="dpx-group dpx-white" style={{ marginTop: 10 }}>{alloc.map(({ pocket, amount }, i) => { const u = pocketUsage(pocket, month, income); return <motion.div key={pocket.id} className="dpx-bud" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: i * 0.06 }}>
      <div className="dpx-top"><span className={`dpx-cat dpx-c-${pocket.tone}`}><Ic n={pocket.icon as IconName} /></span><div className="dpx-main"><b>{pocket.name} · {pocket.percent}%</b><span>{pocket.categoryIds.length ? `Terpakai ${mask(ctx, rupiah(u.used))} dari ${mask(ctx, rupiah(amount))}` : `Target ${mask(ctx, rupiah(amount))} per bulan`}</span></div>{pocket.categoryIds.length ? <b style={{ color: u.percent > 100 ? "var(--danger)" : undefined }}>{Math.round(u.percent)}%</b> : null}</div>
      {pocket.categoryIds.length ? <Bar percent={u.percent} delay={0.1 + i * 0.08} /> : null}</motion.div>; })}</div>
    <Btn type="button" className="dpx-btn" onClick={() => ctx.open({ k: "pockets" })}>Ubah pola pembagian</Btn>
  </>;
}

/* ---------- Kekayaan ---------- */
export function WealthExtras({ ctx }: { ctx: FinCtx }) {
  const { state } = ctx.fin, cash = useCash(ctx), nw = netWorth(state, cash), mix = assetMix(state, cash), debt = debtTotals(state.debts);
  const colors = ["#13804a", "#d9a21a", "#1a5dc6", "#4a5fd6", "#7a5af0", "#16a3b8", "#7b8497", "#e0568a"];
  return <>
    <div className="dpx-glabel">Komposisi</div>
    <div className="dpx-group dpx-white"><div style={{ display: "flex", height: 10, borderRadius: 99, overflow: "hidden", background: "var(--group)" }}>{mix.map((p, i) => <motion.i key={p.id} style={{ background: colors[i % colors.length], display: "block" }} initial={{ width: 0 }} animate={{ width: `${p.percent}%` }} transition={{ duration: 0.8, delay: 0.1 + i * 0.06, ease: [0.32, 0.72, 0, 1] }} />)}</div>
      <div className="dpx-chips2" style={{ marginTop: 8 }}>{mix.map((p, i) => <span key={p.id} className="dpx-chip3"><i style={{ width: 8, height: 8, borderRadius: 99, background: colors[i % colors.length], display: "inline-block" }} /> {p.label} {Math.round(p.percent)}%</span>)}</div></div>
    <div className="dpx-sec"><h2>Aset</h2><Btn type="button" onClick={() => ctx.open({ k: "asset" })}>+ Tambah</Btn></div>
    <div className="dpx-group dpx-flush dpx-white">
      <Row i={0} icon="wallet" tone="emerald" title="Kas & dompet" sub="Otomatis dari semua dompet" trail={<b>{mask(ctx, rupiah(cash))}</b>} />
      {state.assets.map((a, i) => <Row key={a.id} i={i + 1} icon={ASSET_KINDS[a.kind].icon as IconName} tone={ASSET_KINDS[a.kind].tone} title={a.name} sub={`${ASSET_KINDS[a.kind].label} · nilai manual`} trail={<b>{mask(ctx, rupiah(a.value))}</b>} onClick={() => ctx.open({ k: "asset", id: a.id })} />)}
    </div>
    {state.assets.length === 0 ? <p className="dpx-sub" style={{ margin: "8px 4px 0" }}>Tambahkan emas, reksa dana, saham, kendaraan, atau properti. Nilainya kamu perbarui sendiri.</p> : null}
    <div className="dpx-sec"><h2>Kewajiban</h2><Btn type="button" onClick={() => ctx.nav.go("/rencana?bagian=hutang")}>Kelola</Btn></div>
    <div className="dpx-group dpx-flush dpx-white"><Row icon="down" tone="rose" title="Hutang saya" sub="Belum lunas" trail={<b className="dpx-dn">−{mask(ctx, rupiah(debt.iOwe))}</b>} /><Row i={1} icon="up" tone="emerald" title="Piutang" sub="Orang berutang padamu" trail={<b className="dpx-up">{mask(ctx, rupiah(debt.owedToMe))}</b>} /></div>
    <Btn type="button" className="dpx-group dpx-flex" style={{ width: "100%", marginTop: 12, textAlign: "left" }} onClick={() => ctx.nav.go("/alat")}><span className="dpx-cat dpx-c-violet"><Ic n="grid" /></span><span style={{ flex: 1 }}><b>Alat keuangan</b><div className="dpx-sub">Bisa beli?, dana darurat, zakat, simulasi cicilan</div></span><Ic n="chev" size="sm" /></Btn>
    <Disclaimer />
    <span hidden>{nw.total}</span>
  </>;
}
export function networthTotal(ctx: FinCtx, cash: number) { return netWorth(ctx.fin.state, cash).total; }

/* ---------- Kalender ---------- */
export function CalendarPage({ ctx, onBack }: { ctx: FinCtx; onBack: () => void }) {
  const k = useKelola(ctx), [day, setDay] = useState(k.now.getDate());
  const y = k.now.getFullYear(), m = k.now.getMonth(), dim = daysIn(y, m), lead = (new Date(y, m, 1).getDay() + 6) % 7;
  const pay = payday(k.entries);
  const byDay = (d: number) => k.views.filter((v) => v.due.getDate() === d);
  const list = byDay(day);
  return <div className="dpx-page"><Sky><div className="dpx-pad dpx-nobar" style={{ paddingBottom: 110 }}>
    <Header title="Kalender tagihan" onBack={onBack} right={<Btn type="button" className="dpx-rb" onClick={() => ctx.open({ k: "bill" })} aria-label="Tambah tagihan"><Ic n="plus" /></Btn>} />
    <div className="dpx-sub" style={{ textAlign: "center", marginBottom: 6 }}>{k.now.toLocaleDateString("id-ID", { month: "long", year: "numeric" })} · belum dibayar <b style={{ color: "var(--ink)" }}>{mask(ctx, rupiah(unpaidTotal(k.views)))}</b></div>
    <div className="dpx-group dpx-white"><div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 3, textAlign: "center" }}>
      {["S", "S", "R", "K", "J", "S", "M"].map((d, i) => <span key={i} className="dpx-sub" style={{ fontWeight: 600 }}>{d}</span>)}
      {Array.from({ length: lead }, (_, i) => <span key={`l${i}`} />)}
      {Array.from({ length: dim }, (_, i) => { const d = i + 1, bs = byDay(d), sel = d === day, today = d === k.now.getDate(); return <Btn key={d} type="button" aria-pressed={sel} aria-label={`Tanggal ${d}${bs.length ? `, ${bs.length} tagihan` : ""}`} onClick={() => setDay(d)} style={{ position: "relative", height: 38, borderRadius: 12, fontWeight: 600, fontSize: 13, color: sel ? "#fff" : "var(--ink)", boxShadow: today && !sel ? "inset 0 0 0 1.5px var(--navy)" : undefined }}>
        {sel ? <motion.span layoutId="cal-sel" style={{ position: "absolute", inset: 0, borderRadius: 12, background: "var(--navy)" }} transition={spring} /> : null}
        <span style={{ position: "relative" }}>{d}</span>
        <span style={{ position: "absolute", bottom: 3, left: 0, right: 0, display: "flex", gap: 2, justifyContent: "center" }}>{bs.map((b) => <i key={b.bill.id} style={{ width: 5, height: 5, borderRadius: 9, background: b.status === "paid" ? "#13804a" : b.status === "late" ? "#d23a2a" : "#d9941a" }} />)}{pay?.day === d ? <i style={{ width: 5, height: 5, borderRadius: 9, background: "#1a5dc6" }} /> : null}</span></Btn>; })}
    </div></div>
    <div className="dpx-sec"><h2>{day} {k.now.toLocaleDateString("id-ID", { month: "long" })}</h2></div>
    <AnimatePresence mode="wait" initial={false}><motion.div key={day} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
      {list.length || pay?.day === day ? <div className="dpx-group dpx-flush dpx-white">
        {pay?.day === day ? <Row icon="down" tone="emerald" title="Gajian" sub="Perkiraan dari gaji terakhir" trail={<b className="dpx-up">+{mask(ctx, rupiah(pay.amount))}</b>} chev={false} /> : null}
        {list.map((v) => <div key={v.bill.id} className="dpx-row"><span className={`dpx-cat dpx-c-${v.bill.tone}`}><Ic n={v.bill.icon as IconName} /></span><Btn type="button" className="dpx-main" style={{ textAlign: "left" }} onClick={() => ctx.open({ k: "bill", id: v.bill.id })}><b>{v.bill.name}</b><span>{statusTag(v)}</span></Btn><span className="dpx-trail"><b>{rupiah(v.bill.amount)}</b></span>{v.status !== "paid" ? <Btn type="button" className="dpx-btn dpx-sm" style={{ margin: "0 0 0 8px" }} onClick={() => ctx.open({ k: "bill-pay", id: v.bill.id })}>Bayar</Btn> : null}</div>)}</div>
        : <div className="dpx-group dpx-center"><div className="dpx-sub">Tidak ada tagihan di tanggal ini.</div></div>}
    </motion.div></AnimatePresence>
    <div className="dpx-sec"><h2>Semua tagihan</h2></div>
    {k.views.length ? <div className="dpx-group dpx-flush dpx-white">{k.views.map((v, i) => <Row key={v.bill.id} i={i} icon={v.bill.icon as IconName} tone={v.bill.tone} title={v.bill.name} sub={`Tiap tanggal ${v.bill.day}`} trail={<><b>{rupiah(v.bill.amount)}</b>{statusTag(v)}</>} onClick={() => ctx.open({ k: "bill", id: v.bill.id })} />)}</div>
      : <div className="dpx-group dpx-center"><I3 name="order-receipt" px={88} style={{ margin: "0 auto" }} /><b>Belum ada tagihan</b><p className="dpx-sub">Tambahkan listrik, internet, cicilan, atau langganan. Kami ingatkan sebelum jatuh tempo.</p><Btn type="button" className="dpx-btn" onClick={() => ctx.open({ k: "bill" })}><Ic n="plus" size="sm" /> Tambah tagihan</Btn></div>}
  </div></Sky></div>;
}

/* ---------- Skor kesehatan ---------- */
export function HealthPage({ ctx, onBack }: { ctx: FinCtx; onBack: () => void }) {
  const k = useKelola(ctx), worst = [...k.health.pillars].sort((a, b) => a.score - b.score).slice(0, 2);
  return <div className="dpx-page"><Sky><div className="dpx-pad dpx-nobar">
    <Header title="Kesehatan keuangan" onBack={onBack} />
    <Reveal><div className="dpx-group dpx-white dpx-center" style={{ display: "grid", placeItems: "center", gap: 6 }}><ScoreRing score={k.health.score} tone={k.health.tone} /><div className="dpx-money" style={{ color: toneColor(k.health.tone) }}>{k.health.label}</div><div className="dpx-sub">Rata-rata lima pilar, diperbarui otomatis</div></div></Reveal>
    <div className="dpx-sec"><h2>Lima pilar</h2></div>
    <div className="dpx-group dpx-white">{k.health.pillars.map((p, i) => { const t = p.score >= 75 ? "ok" : p.score >= 55 ? "warn" : "bad"; return <motion.div key={p.id} className="dpx-bud" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: i * 0.06 }}><div className="dpx-top"><div className="dpx-main"><b>{p.name}</b><span>{p.note}</span></div><b style={{ color: toneColor(t) }}>{p.score}</b></div><Bar percent={p.score} delay={0.1 + i * 0.08} /></motion.div>; })}</div>
    <div className="dpx-sec"><h2>Cara menaikkan skor</h2></div>
    <div className="dpx-group dpx-flush dpx-white">{worst.map((p, i) => <Row key={p.id} i={i} icon="spark" tone="emerald" title={p.action} sub={`Memperbaiki: ${p.name}`} onClick={() => ctx.nav.go(p.id === "habit" ? "/catat" : p.id === "emergency" ? "/rencana?bagian=tujuan" : p.id === "debt" ? "/rencana?bagian=hutang" : "/rencana")} />)}</div>
    <Disclaimer />
  </div></Sky></div>;
}

/* ---------- Prakiraan kas ---------- */
export function ForecastPage({ ctx, onBack }: { ctx: FinCtx; onBack: () => void }) {
  const k = useKelola(ctx), [cut, setCut] = useState<"0" | "1">("0");
  const f = useMemo(() => forecast(k.cash, k.entries, k.state.bills, k.now, cut === "1" ? 0.1 : 0), [k.cash, k.entries, k.state.bills, cut]);
  const base = useMemo(() => forecast(k.cash, k.entries, k.state.bills, k.now, 0), [k.cash, k.entries, k.state.bills]);
  const bad = f.runsOutDay !== null;
  const marks = f.events.map((e) => ({ i: f.days.indexOf(e.day), color: e.amount > 0 ? "#13804a" : "#d9941a" })).filter((m) => m.i > 0);
  return <div className="dpx-page"><Sky><div className="dpx-pad dpx-nobar">
    <Header title="Prakiraan kas" onBack={onBack} />
    <Seg id="fc" label="Skenario" value={cut} onChange={setCut} options={[["0", "Kondisi sekarang"], ["1", "Hemat 10%"]] as const} />
    <div className="dpx-group dpx-white dpx-mt"><div className="dpx-sub">Saldo diperkirakan pada {f.endLabel}</div><div className="dpx-money" style={{ color: f.end < 0 ? "var(--danger)" : "var(--navy)", fontSize: 28 }}>{mask(ctx, `${f.end < 0 ? "−" : ""}${rupiah(Math.abs(f.end))}`)}</div>
      <div style={{ marginTop: 6 }}><AreaChart key={cut} points={f.pts} height={130} color={bad ? "#d23a2a" : "#1a5dc6"} marks={marks} label="Prakiraan saldo harian" /></div>
      <div className="dpx-spread dpx-sub" style={{ marginTop: 4 }}><span>Hari ini</span><span>{f.endLabel}</span></div></div>
    <div className="dpx-kpi dpx-mt"><div className="dpx-group dpx-white"><small>Saldo sekarang</small><b>{mask(ctx, rupiah(k.cash))}</b></div><div className="dpx-group dpx-white"><small>Terendah (tgl {f.minDay})</small><b style={{ color: f.min < 0 ? "var(--danger)" : undefined }}>{mask(ctx, rupiah(f.min))}</b></div></div>
    <Note tone={bad ? "danger" : "info"} icon={bad ? "warn" : "info"}>{bad ? <>Dengan kebiasaanmu sekarang, kas habis tanggal <b>{f.runsOutDay}</b>. {cut === "0" ? "Coba skenario Hemat 10% di atas." : "Masih perlu menunda belanja non-primer."}</> : cut === "1" ? <>Hemat 10% menambah saldo akhir bulan sekitar <b>{rupiah(f.end - base.end)}</b>.</> : <>Rata-rata belanja harianmu <b>{rupiah(f.perDay)}</b>. Saldo aman sampai akhir bulan.</>}</Note>
    <div className="dpx-sec"><h2>Kejadian yang diperhitungkan</h2></div>
    {f.events.length ? <div className="dpx-group dpx-flush dpx-white">{f.events.map((e, i) => <Row key={`${e.day}${e.label}`} i={i} icon={e.amount > 0 ? "down" : "receipt"} tone={e.amount > 0 ? "emerald" : "amber"} title={e.label} sub={`Tanggal ${e.day}`} trail={<b className={e.amount > 0 ? "dpx-up" : ""}>{e.amount > 0 ? "+" : "−"}{rupiah(Math.abs(e.amount))}</b>} chev={false} />)}</div>
      : <div className="dpx-group dpx-center"><div className="dpx-sub">Tambahkan tagihan dan catat gaji agar prakiraan lebih akurat.</div></div>}
    <Disclaimer />
  </div></Sky></div>;
}

/* ---------- Alat ---------- */
type Tool = "afford" | "emergency" | "zakat" | "loan";
export function ToolsPage({ ctx, onBack }: { ctx: FinCtx; onBack: () => void }) {
  const [tool, setTool] = useState<Tool>("afford");
  return <div className="dpx-page"><Sky><div className="dpx-pad dpx-nobar">
    <Header title="Alat keuangan" onBack={onBack} />
    <div className="dpx-chips" style={{ marginBottom: 6 }}>{([["afford", "Bisa beli?"], ["emergency", "Dana darurat"], ["zakat", "Zakat"], ["loan", "Cicilan"]] as const).map(([k, l]) => <Btn key={k} type="button" className={`dpx-chip ${tool === k ? "dpx-on" : ""}`} aria-pressed={tool === k} onClick={() => setTool(k)}>{l}</Btn>)}</div>
    <AnimatePresence mode="wait" initial={false}><motion.div key={tool} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
      {tool === "afford" ? <Afford ctx={ctx} /> : tool === "emergency" ? <Emergency ctx={ctx} /> : tool === "zakat" ? <Zakat ctx={ctx} /> : <Loan />}
    </motion.div></AnimatePresence>
    <Disclaimer />
  </div></Sky></div>;
}
function Afford({ ctx }: { ctx: FinCtx }) {
  const k = useKelola(ctx), [price, setPrice] = useState("2400000"), [mode, setMode] = useState<AffordMode>("tunai");
  const r = afford({ price: Number(price) || 0, mode, cash: k.cash, unpaidBills: unpaidTotal(k.views), perDay: k.fc.perDay, daysLeft: daysIn(k.now.getFullYear(), k.now.getMonth()) - k.now.getDate() });
  const msg = { ok: "Aman dibeli. Sisa uang bebas masih nyaman sampai akhir bulan.", warn: "Bisa, tapi sisanya tipis. Pertimbangkan cicilan.", bad: "Belum aman. Uang bebas tidak cukup setelah tagihan dan belanja harian." }[r.level];
  return <div className="dpx-group dpx-white"><label className="dpx-field" style={{ marginTop: 0 }}><span>Harga barang</span><MoneyInput value={price} onChange={setPrice} /></label>
    <Seg id="aff" label="Cara bayar" value={mode} onChange={setMode} options={[["tunai", "Tunai"], ["3", "3×"], ["6", "6×"], ["12", "12×"]] as const} />
    <motion.div key={r.level} initial={{ scale: 0.97, opacity: 0.6 }} animate={{ scale: 1, opacity: 1 }} transition={spring} className={`dpx-note dpx-${r.level === "bad" ? "danger" : "info"}`} style={{ marginTop: 10, background: r.level === "ok" ? "var(--ok-soft)" : r.level === "warn" ? "var(--warn-soft)" : undefined, color: r.level === "ok" ? "var(--ok)" : r.level === "warn" ? "var(--warn)" : undefined }}><Ic n={r.level === "ok" ? "check" : "warn"} /><div><b>{msg}</b></div></motion.div>
    <div className="dpx-kpi dpx-mt"><div className="dpx-group"><small>{mode === "tunai" ? "Bayar sekarang" : `Per bulan (${mode}×)`}</small><b>{rupiah(r.payNow)}</b></div><div className="dpx-group"><small>Sisa uang bebas</small><b style={{ color: r.after < 0 ? "var(--danger)" : undefined }}>{rupiah(r.after)}</b></div></div></div>;
}
function Emergency({ ctx }: { ctx: FinCtx }) {
  const k = useKelola(ctx), burn = dailyBurn(k.entries, k.state.bills.map((b) => b.name), k.now) * 30 + unpaidTotal(k.views);
  const [need, setNeed] = useState(String(Math.max(0, Math.round(burn / 100_000) * 100_000))), [months, setMonths] = useState<"3" | "6" | "12">("6");
  const saved = k.state.goals.filter((g) => /darurat/i.test(g.name)).reduce((s, g) => s + goalSaved(g), 0) + Math.max(0, 0);
  const e = emergencyFund(Number(need) || 0, Number(months), saved);
  return <div className="dpx-group dpx-white"><label className="dpx-field" style={{ marginTop: 0 }}><span>Kebutuhan bulanan</span><MoneyInput value={need} onChange={setNeed} /></label>
    <Seg id="em" label="Lama" value={months} onChange={setMonths} options={[["3", "3 bulan"], ["6", "6 bulan"], ["12", "12 bulan"]] as const} />
    <div className="dpx-money dpx-mt" style={{ fontSize: 26 }}>{rupiah(e.target)}</div><div className="dpx-sub">Target dana darurat. Sudah terkumpul {rupiah(e.saved)} di tujuan "Dana darurat".</div>
    <div className="dpx-mt8"><Bar percent={e.percent} /></div>
    <Btn type="button" className="dpx-btn dpx-ghost" onClick={() => ctx.open({ k: "goal" })}><Ic n="target" size="sm" /> Buat tujuan Dana darurat</Btn></div>;
}
function Zakat({ ctx }: { ctx: FinCtx }) {
  const k = useKelola(ctx), nw = netWorth(k.state, k.cash).total;
  const [wealth, setWealth] = useState(String(Math.max(0, Math.round(nw)))), [gold, setGold] = useState("1500000");
  const z = zakatMaal(Number(wealth) || 0, Number(gold) || 0);
  return <div className="dpx-group dpx-white"><label className="dpx-field" style={{ marginTop: 0 }}><span>Harta yang sudah dimiliki 1 tahun</span><MoneyInput value={wealth} onChange={setWealth} /></label>
    <label className="dpx-field"><span>Harga emas per gram</span><MoneyInput value={gold} onChange={setGold} /></label>
    <div className={`dpx-note dpx-${z.due ? "info" : "info"}`} style={{ background: z.due ? "var(--ok-soft)" : "var(--group)", color: z.due ? "var(--ok)" : "var(--mute)" }}><Ic n={z.due ? "check" : "info"} /><div><b>{z.due ? `Zakat maal ${rupiah(z.amount)}` : "Belum mencapai nisab"}</b><div>Nisab 85 gram emas = {rupiah(z.nisab)}. Kadar zakat 2,5%.</div></div></div>
    <p className="dpx-sub" style={{ marginTop: 8 }}>Hitungan sederhana. Tanyakan ke lembaga zakat resmi untuk kondisi khusus.</p></div>;
}
function Loan() {
  const [p, setP] = useState("12000000"), [rate, setRate] = useState("12"), [m, setM] = useState<"6" | "12" | "24" | "36">("12");
  const l = loan(Number(p) || 0, Number(rate) || 0, Number(m));
  return <div className="dpx-group dpx-white"><label className="dpx-field" style={{ marginTop: 0 }}><span>Pokok pinjaman</span><MoneyInput value={p} onChange={setP} /></label>
    <label className="dpx-field"><span>Bunga per tahun (%)</span><div className="dpx-input"><input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value.replace(/[^\d.]/g, "").slice(0, 5))} aria-label="Bunga per tahun" /></div></label>
    <Seg id="ln" label="Tenor" value={m} onChange={setM} options={[["6", "6"], ["12", "12"], ["24", "24"], ["36", "36 bln"]] as const} />
    <div className="dpx-kpi dpx-mt"><div className="dpx-group"><small>Anuitas / bulan</small><b><AnimatedNumber value={l.annuity} format={(n) => rupiah(n)} /></b><small>Bunga total {rupiah(l.interestAnnuity)}</small></div><div className="dpx-group"><small>Flat / bulan</small><b><AnimatedNumber value={l.flat} format={(n) => rupiah(n)} /></b><small>Bunga total {rupiah(l.interestFlat)}</small></div></div>
    <p className="dpx-sub" style={{ marginTop: 8 }}>Bunga flat dihitung dari pokok awal, jadi biasanya lebih mahal dari anuitas dengan angka yang sama.</p></div>;
}
