import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Btn, Header, Ic, Reveal, Seg, Sky, spring } from "../shell/dpx-ui";
import { CategorySheet, catOf } from "./fin-sheets";
import type { FinCtx } from "./fin-pages";
import { useTween } from "../integrations/import-scan";
import { analyze, billKey, periodRange, type Payee, type PayeeKind, type PayeeMode, type PayeePeriod } from "../../lib/finance/payees";
import { usePayeeMeta } from "../../lib/finance/payee-meta";
import { rupiah } from "../../lib/djiwa-pay-format";
import type { Entry } from "../../lib/finance/types";
import "./payees.css";

const COLORS = ["#c9461b", "#e8833a", "#8a5cc2", "#16a3b8", "#d9a21a", "#1f9d62", "#e0568a", "#6f7bd9"];
const PERIODS: readonly (readonly [PayeePeriod, string])[] = [["bulan", "Bulan ini"], ["3", "3 bulan"], ["6", "6 bulan"], ["12", "1 tahun"], ["semua", "Semua"]];
const KINDS: readonly (readonly [PayeeKind | "all", string])[] = [["all", "Semua"], ["orang", "Orang"], ["toko", "Toko"], ["layanan", "Layanan"]];
const KIND_NAME: Record<PayeeKind, string> = { orang: "Orang", toko: "Toko", layanan: "Layanan" };
export const LABELS = ["Keluarga", "Teman", "Kerja"];
const short = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(1).replace(".", ",")} M` : n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(/\.0$/, "").replace(".", ",")} jt` : `${Math.round(n / 1e3)} rb`);
const date = (iso: string) => new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short" });
const colorOf = (i: number) => COLORS[i % COLORS.length];

/** Rising spend is the warning when money goes out, and the good news when it comes in. */
const trendTone = (p: Payee, mode: PayeeMode) => (p.trend === null || p.trend === 0 ? "" : (p.trend > 0) === (mode === "out") ? "warn" : "good");
const trendText = (p: Payee) => (p.trend === null ? "baru" : p.trend === 0 ? "tetap" : `${p.trend > 0 ? "▲" : "▼"} ${Math.abs(p.trend)}%`);

/** The donut: each of the top five sweeps in, the rest is the quiet remainder. */
function Donut({ list, total, label, reduce }: { list: Payee[]; total: number; label: string; reduce: boolean }) {
  const R = 46, C = 2 * Math.PI * R, top = list.slice(0, 5);
  let acc = 0;
  const tween = useTween(total, 800);
  return <div className="dpx-py-donut" role="img" aria-label={`Porsi lima teratas dari total ${rupiah(total)}`}>
    <svg viewBox="0 0 112 112" width="112" height="112" aria-hidden="true"><g transform="rotate(-90 56 56)">
      <circle cx="56" cy="56" r={R} fill="none" stroke="#e9dfcb" strokeWidth="18" />
      {top.map((p, i) => { const len = Math.max(0, (p.total / (total || 1)) * C - 1.5), off = acc; acc += (p.total / (total || 1)) * C;
        return <motion.circle key={p.key} cx="56" cy="56" r={R} fill="none" stroke={colorOf(i)} strokeWidth="18" strokeDashoffset={-off} initial={reduce ? false : { strokeDasharray: `0 ${C}` }} animate={{ strokeDasharray: `${len} ${C - len}` }} transition={{ duration: 0.9, delay: 0.1 + i * 0.1, ease: [0.22, 1, 0.36, 1] }} />; })}
    </g></svg>
    <div className="mid"><small>{label}</small><b>{short(tween)}</b></div>
  </div>;
}

function Row({ p, i, mode, onOpen }: { p: Payee; i: number; mode: PayeeMode; onOpen: () => void }) {
  return <motion.button type="button" layout="position" className="dpx-py-row" onClick={onOpen} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 24 }} transition={{ ...spring, delay: Math.min(i, 8) * 0.04 }} whileTap={{ scale: 0.985 }}>
    <span className="av" style={{ background: colorOf(i) }} aria-hidden="true">{p.name.replace(/[^A-Za-z]/g, "").slice(0, 1).toUpperCase() || "?"}</span>
    <span className="tx">
      <span className="top"><b>{p.name}{p.label ? <em>{p.label}</em> : null}</b><span>{mode === "out" ? "−" : "+"}{rupiah(p.total)}</span></span>
      <span className="bar"><motion.i style={{ background: colorOf(i) }} initial={{ width: 0 }} animate={{ width: `${Math.max(4, p.share)}%` }} transition={{ duration: 0.7, delay: 0.1 + Math.min(i, 8) * 0.04, ease: [0.22, 1, 0.36, 1] }} /></span>
      <span className="meta"><span>{p.count} kali · {KIND_NAME[p.kind].toLowerCase()}</span><span className={`tr ${trendTone(p, mode)}`}>{trendText(p)}</span></span>
    </span>
  </motion.button>;
}

/** The categories the person uses most for this direction, with the one this payee already has first. */
function useChoices(ctx: FinCtx, mode: PayeeMode, current: string) {
  return useMemo(() => {
    const m = new Map<string, number>();
    for (const e of ctx.fin.allRecords) if (e.kind === mode && e.categoryId !== "lainnya") m.set(e.categoryId, (m.get(e.categoryId) ?? 0) + 1);
    const ids = [...m.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id).filter((id) => ctx.fin.raw.categories.some((c) => c.id === id && c.income === (mode === "in")));
    return [...new Set([current, ...ids])].filter((id) => id && id !== "lainnya" && ctx.fin.raw.categories.some((c) => c.id === id)).slice(0, 5);
  }, [ctx.fin.allRecords, ctx.fin.raw.categories, mode, current]);
}

function Detail({ ctx, p, i, mode, onKind, onLabel }: { ctx: FinCtx; p: Payee; i: number; mode: PayeeMode; onKind: (k: PayeeKind) => void; onLabel: (l: string) => void }) {
  const { fin } = ctx, [month, setMonth] = useState(5), [pick, setPick] = useState(false), [custom, setCustom] = useState(false), [draft, setDraft] = useState(p.label);
  const all = p.entries, totalAll = all.reduce((s, e) => s + e.amount, 0), peak = Math.max(1, ...p.months.map((m) => m.total));
  const avg6 = p.months.reduce((s, m) => s + m.total, 0) / 6, sel = p.months[month], diff = avg6 ? Math.round((sel.total / avg6 - 1) * 100) : 0;
  const choices = useChoices(ctx, mode, p.categoryId), tween = useTween(totalAll, 800);
  const billId = `payee-${p.key.replace(/\s+/g, "-")}`, own = fin.raw.bills.find((b) => b.id === billId), other = fin.raw.bills.find((b) => b.id !== billId && billKey(b.name) === p.key);
  const put = (e: Entry, categoryId: string) => { if (e.source === "pay") fin.dispatch({ type: "override/set", id: e.id, override: { categoryId } }); else fin.dispatch({ type: "entry/update", entry: { ...e, categoryId } }); };
  const apply = (categoryId: string) => {
    const before = all.map((e) => ({ e, was: e.categoryId })), name = catOf(fin.raw, categoryId).name;
    for (const e of all) put(e, categoryId);
    setPick(false);
    ctx.notify(`${all.length} catatan ${p.name} masuk ${name}`, () => { for (const b of before) put(b.e, b.was); });
  };
  const remind = () => {
    if (other) { ctx.notify(`Sudah ada di Tagihan: ${other.name}`); return; }
    if (own) { fin.dispatch({ type: "bill/delete", id: billId }); ctx.notify("Pengingat bulanan dimatikan", () => fin.dispatch({ type: "bill/upsert", bill: own })); return; }
    const bill = { id: billId, name: p.name, amount: Math.max(1, p.typicalAmount || Math.round(p.avg)), day: p.typicalDay, icon: "repeat", tone: "violet", paid: [] as string[] };
    fin.dispatch({ type: "bill/upsert", bill });
    ctx.notify(`${p.name} diingatkan tiap tanggal ${bill.day}`, () => fin.dispatch({ type: "bill/delete", id: billId }));
  };
  const on = Boolean(own || other);
  const word = mode === "out" ? "dikirim" : "diterima";
  return <motion.div className="dpx-py-detail" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={spring}>
    <div className="dpx-py-hero">
      <div className="who"><span className="av" style={{ background: colorOf(i) }}>{p.name.replace(/[^A-Za-z]/g, "").slice(0, 1).toUpperCase() || "?"}</span>
        <span><b>{p.name}</b><small>{KIND_NAME[p.kind]}{p.label ? ` · ${p.label}` : ""} · sejak {new Date(p.firstAt).toLocaleDateString("id-ID", { month: "short", year: "numeric" })}</small></span></div>
      <small className="lb">Total {word}, semua catatan</small>
      <b className="big">{rupiah(tween)}</b>
      <div className="stats">
        <div><small>Transaksi</small><b>{all.length} kali</b></div><div><small>Rata-rata</small><b>Rp {short(totalAll / (all.length || 1))}</b></div><div><small>Terakhir</small><b>{date(p.lastAt)}</b></div>
      </div>
    </div>

    <div className="dpx-py-card">
      <div className="hd"><b>Per bulan</b><span>{sel.label} · {rupiah(sel.total)}</span></div>
      <div className="bars" role="group" aria-label="Total per bulan">
        {p.months.map((m, k) => <button key={m.key} type="button" className="bc" onClick={() => setMonth(k)} aria-pressed={month === k} aria-label={`${m.label} ${rupiah(m.total)}`}>
          <motion.span className="col" style={{ background: k === month ? "#c9461b" : "#e9b99f" }} initial={{ height: 0 }} animate={{ height: Math.max(8, (m.total / peak) * 110) }} transition={{ duration: 0.7, delay: k * 0.06, ease: [0.22, 1, 0.36, 1] }} /><span className="ml">{m.label}</span></button>)}
      </div>
      <AnimatePresence mode="wait" initial={false}><motion.p key={month} className="tip" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
        {sel.label} {diff >= 0 ? `${rupiah(sel.total - avg6)} di atas` : `${rupiah(avg6 - sel.total)} di bawah`} rata-rata 6 bulan ({rupiah(avg6)}). {diff > 15 ? "Lebih tinggi dari biasanya." : diff < -15 ? "Lebih rendah dari biasanya." : "Masih wajar."}</motion.p></AnimatePresence>
    </div>

    <div className="dpx-py-card">
      <b>Jenis dan label</b>
      <div className="seg" role="group" aria-label="Jenis">{(["orang", "toko", "layanan"] as const).map((k) => <Btn key={k} type="button" className={p.kind === k ? "on" : ""} aria-pressed={p.kind === k} onClick={() => onKind(k)}>{KIND_NAME[k]}</Btn>)}</div>
      <div className="chips">{LABELS.map((l) => <Btn key={l} type="button" className={`chip ${p.label === l ? "on" : ""}`} aria-pressed={p.label === l} onClick={() => onLabel(p.label === l ? "" : l)} whileTap={{ scale: 0.95 }}>{l}</Btn>)}
        {custom ? <input className="chip-in" value={draft} maxLength={20} autoFocus placeholder="Label" onChange={(e) => setDraft(e.target.value)} onBlur={() => { onLabel(draft.trim()); setCustom(false); }} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} aria-label="Label baru" />
          : <Btn type="button" className={`chip other ${p.label && !LABELS.includes(p.label) ? "on" : ""}`} onClick={() => setCustom(true)}>{p.label && !LABELS.includes(p.label) ? p.label : "Label lain…"}</Btn>}</div>
    </div>

    <div className="dpx-py-card">
      <b>Kategori semua catatannya</b>
      <p className="sub">Satu pilihan merapikan {all.length} catatan.</p>
      <div className="chips">{choices.map((id) => { const c = catOf(fin.raw, id), par = c.parentId ? fin.raw.categories.find((x) => x.id === c.parentId) : null; return <Btn key={id} type="button" className={`chip ${p.categoryId === id ? "on" : ""}`} aria-pressed={p.categoryId === id} onClick={() => apply(id)} whileTap={{ scale: 0.95 }}>{par ? `${par.name} › ${c.name}` : c.name}</Btn>; })}
        <Btn type="button" className="chip other" onClick={() => setPick(true)}>Pilih lainnya…</Btn></div>
      {mode === "out" ? <div className="sw">
        <span><b>Ingatkan tiap bulan</b><small>{other ? `Sudah ada di Tagihan: ${other.name}` : p.monthly ? `Terdeteksi sekitar tanggal ${p.typicalDay}, ${rupiah(p.typicalAmount)}` : `Belum ada pola bulanan. Dipakai tanggal ${p.typicalDay}, ${rupiah(p.typicalAmount || Math.round(p.avg))}`}</small></span>
        <button type="button" role="switch" aria-checked={on} aria-label="Ingatkan tiap bulan" className={`dpx-py-switch ${on ? "on" : ""}`} onClick={remind}><motion.i layout transition={spring} /></button>
      </div> : null}
    </div>

    <div className="dpx-py-card flush">
      <b className="pad">Transaksi terakhir</b>
      {all.slice(0, 8).map((e, k) => <motion.button key={e.id} type="button" className="tx" onClick={() => ctx.open({ k: "entry", id: e.id })} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: k * 0.04 }}>
        <span><b>{e.note}</b><small>{new Date(e.at).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}, {new Date(e.at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }).replace(":", ".")} · {catOf(fin.raw, e.categoryId).name}</small></span>
        <em>{mode === "out" ? "−" : "+"}{rupiah(e.amount)}</em></motion.button>)}
    </div>
    <AnimatePresence>{pick ? <CategorySheet key="pick" categories={fin.raw.categories} income={mode === "in"} value={p.categoryId} onPick={apply} onClose={() => setPick(false)} /> : null}</AnimatePresence>
  </motion.div>;
}

export function PayeesPage({ ctx, onBack }: { ctx: FinCtx; onBack: () => void }) {
  const { fin } = ctx, reduce = Boolean(useReducedMotion()), { meta, setKind, setLabel } = usePayeeMeta(fin.profileId);
  const [mode, setMode] = useState<PayeeMode>(() => (new URLSearchParams(window.location.search).get("m") === "in" ? "in" : "out")), [period, setPeriod] = useState<PayeePeriod>("bulan"), [kind, setKindFilter] = useState<PayeeKind | "all">("all");
  const [sel, setSel] = useState<string | null>(() => new URLSearchParams(window.location.search).get("k"));
  useEffect(() => { if (window.location.search) window.history.replaceState({}, "", window.location.pathname); }, []);
  const now = useMemo(() => new Date(), []), range = useMemo(() => periodRange(period, now), [period, now]);
  const a = useMemo(() => analyze(fin.allRecords, { mode, ...range, meta, now }), [fin.allRecords, mode, range, meta, now]);
  const wide = useMemo(() => analyze(fin.allRecords, { mode, ...periodRange("semua", now), meta, now }), [fin.allRecords, mode, meta, now]);
  const list = kind === "all" ? a.list : a.list.filter((p) => p.kind === kind);
  const chosen = sel ? (a.list.find((p) => p.key === sel) ?? wide.list.find((p) => p.key === sel)) ?? null : null;
  const idx = chosen ? Math.max(0, a.list.findIndex((p) => p.key === chosen.key)) : 0;
  const perLabel = PERIODS.find(([k]) => k === period)![1].toLowerCase();
  const ins = a.insights, often = ins.often, total = a.total;

  return <div className="dpx-page dpx-py"><Sky><div className="dpx-pad">
    <Header title={chosen ? "Detail penerima" : "Penerima dan pengirim"} onBack={chosen ? () => setSel(null) : onBack} />
    <AnimatePresence mode="wait" initial={false}>{chosen ? <Detail key={`d-${chosen.key}-${mode}`} ctx={ctx} p={chosen} i={idx} mode={mode} onKind={(k) => setKind(chosen.key, k)} onLabel={(l) => setLabel(chosen.key, l)} /> :
      <motion.div key="list" className="dpx-py-list" initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }} transition={spring}>
        <Seg id="py-mode" label="Arah uang" fit value={mode} onChange={(v) => { setMode(v); setKindFilter("all"); }} options={[["out", "Keluar ke"], ["in", "Masuk dari"]] as const} />
        <div className="dpx-py-chips" role="group" aria-label="Periode">{PERIODS.map(([k, l]) => <Btn key={k} type="button" className={period === k ? "on" : ""} aria-pressed={period === k} onClick={() => setPeriod(k)} whileTap={{ scale: 0.95 }}>{l}</Btn>)}</div>

        {a.list.length === 0 ? <motion.div className="dpx-empty" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={spring}><Ic n="users" size="lg" /><b>Belum ada {mode === "out" ? "pengeluaran" : "pemasukan"} {perLabel}</b><p>Catatan dengan nama penerima atau pengirim akan dihitung di sini.</p></motion.div> : <>
          <Reveal><div className="dpx-py-top">
            <Donut key={`${mode}${period}`} list={a.list} total={total} label={mode === "out" ? "keluar" : "masuk"} reduce={reduce} />
            <div className="cn"><small>Konsentrasi</small><b>{Math.round(a.topShare)}%</b><span>{mode === "out" ? `dari seluruh pengeluaran, ${perLabel}, pergi ke ${Math.min(5, a.list.length)} penerima teratas.` : `dari seluruh pemasukan, ${perLabel}, datang dari ${Math.min(5, a.list.length)} sumber teratas.`}</span></div>
          </div></Reveal>

          <div className="dpx-py-ins">{[
            { l: mode === "out" ? "Terbesar" : "Sumber terbesar", v: ins.largest?.name ?? "—", n: ins.largest ? rupiah(ins.largest.total) : "", t: "" },
            { l: "Paling sering", v: often?.name ?? "—", n: often ? `${often.count} kali` : "", t: "" },
            { l: "Rata-rata per transaksi", v: rupiah(a.avg), n: `${a.count} transaksi`, t: "" },
            { l: mode === "out" ? "Naik paling tajam" : "Naik paling tajam", v: ins.rise?.name ?? "Tidak ada", n: ins.rise ? `+${ins.rise.trend}% dari periode lalu` : ins.fresh.length ? `${ins.fresh.length} penerima baru` : "", t: ins.rise ? (mode === "out" ? "warn" : "good") : "" },
          ].map((c, k) => <motion.div key={`${mode}${period}${c.l}`} className="c" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.15 + k * 0.06 }}><small>{c.l}</small><b>{c.v}</b><span className={c.t}>{c.n}</span></motion.div>)}</div>

          <div className="dpx-py-chips kinds" role="group" aria-label="Jenis">{KINDS.map(([k, l]) => <Btn key={k} type="button" className={kind === k ? "on" : ""} aria-pressed={kind === k} onClick={() => setKindFilter(k)} whileTap={{ scale: 0.95 }}>{l}</Btn>)}</div>

          <div className="dpx-py-rows">
            <AnimatePresence initial={false} mode="popLayout">{list.map((p, i) => <Row key={`${mode}${p.key}`} p={p} i={i} mode={mode} onOpen={() => setSel(p.key)} />)}</AnimatePresence>
            <p className="foot">{list.length ? "Ketuk baris untuk melihat rincian" : "Tidak ada pada jenis ini"}</p>
          </div>
        </>}
      </motion.div>}</AnimatePresence>
  </div></Sky></div>;
}

/** Laporan > Ringkasan: the five biggest, the share they take, and the way into the whole page. */
export function PayeeCard({ ctx, y, m }: { ctx: FinCtx; y: number; m: number }) {
  const { fin } = ctx, { meta } = usePayeeMeta(fin.profileId), reduce = Boolean(useReducedMotion());
  const range = useMemo(() => periodRange("bulan", new Date(), { y, m }), [y, m]);
  const a = useMemo(() => analyze(fin.allRecords, { mode: "out", ...range, meta }), [fin.allRecords, range, meta]);
  if (!a.list.length) return null;
  const top = a.top, others = Math.max(0, 100 - top.reduce((s, p) => s + p.share, 0));
  return <motion.section className="dpx-py-card dpx-py-rep" initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={spring} aria-label="Ke mana uangmu pergi">
    <span className="new">Baru</span>
    <b className="ttl">Ke mana uangmu pergi</b>
    <small className="sub">Pengeluaran ke orang dan toko bulan ini</small>
    <div className="stack" aria-hidden="true">{top.map((p, i) => <motion.i key={p.key} style={{ background: colorOf(i) }} initial={reduce ? false : { width: 0 }} animate={{ width: `${p.share}%` }} transition={{ duration: 0.8, delay: 0.1 + i * 0.08, ease: [0.22, 1, 0.36, 1] }} />)}<i style={{ background: "#e9dfcb", flexGrow: 1, minWidth: others > 0 ? 4 : 0 }} /></div>
    <p className="say"><b>{top.length} penerima</b> menyerap <b>{Math.round(a.topShare)}%</b> dari pengeluaranmu.</p>
    <div className="rows">{top.map((p, i) => <motion.button key={p.key} type="button" className="r" onClick={() => ctx.nav.go(`/penerima?k=${encodeURIComponent(p.key)}`)} initial={reduce ? false : { opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ ...spring, delay: 0.15 + i * 0.05 }} whileTap={{ scale: 0.98 }}>
      <span className="av" style={{ background: colorOf(i) }}>{p.name.replace(/[^A-Za-z]/g, "").slice(0, 1).toUpperCase() || "?"}</span>
      <span className="tx"><b>{p.name}</b><small>{p.count} transaksi · {KIND_NAME[p.kind].toLowerCase()}</small></span>
      <span className="am"><b>{rupiah(p.total)}</b><small>{Math.round(p.share)}%</small></span></motion.button>)}</div>
    <Btn type="button" className="all" onClick={() => ctx.nav.go("/penerima")} whileTap={{ scale: 0.98 }}>Lihat semua penerima <Ic n="chev" size="sm" /></Btn>
  </motion.section>;
}
