import { useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AnimatedNumber, Bar, Btn, Header, I3, IconSwap, Ic, Reveal, Row, Seg, Sky, Wiggle, iconOr, spring, type IconName } from "../shell/dpx-ui";
import type { Nav } from "../shell/dpx-pages";
import { AccountEditSheet, AccountSheet, BudgetSheet, CatIcon, CategoryEditSheet, CategorySheet, DebtSheet, EntrySheet, GoalDetailSheet, GoalSheet, CatatSheet, SplitSheet, StreakSheet, MoneyInput, accName, catOf, type Notify } from "./fin-sheets";
import { accountBalance, budgetStatuses, buildInsights, dailySpend, daysIn, debtTotals, detectSubscriptions, goalProjection, goalSaved, inMonth, monthlySeries, safeToSpend, spendByCategory, streak, toCsv, totals, uid } from "../../lib/finance/calc";
import { PAY_ACCOUNT_ID } from "../../lib/finance/categories";
import { emptyState, normalize } from "../../lib/finance/store";
import { dayLabel, firstName, formatTime, greeting, rupiah } from "../../lib/djiwa-pay-format";
import { heatLevel, monthLabel } from "../../lib/djiwa-pay-summary";
import type { Entry, FinanceState, Kind } from "../../lib/finance/types";
import type { Finance } from "../../lib/finance/use-finance";
import type { CustomerProfile } from "../../lib/identity-adapter";
import type { WalletTransaction } from "../../lib/wallet-adapter";

export type FinSheet =
  | { k: "catat" } | { k: "entry"; id: string } | { k: "budget"; cid?: string } | { k: "goal"; id?: string } | { k: "goal-detail"; id: string }
  | { k: "debt"; id?: string } | { k: "split" } | { k: "streak" } | { k: "account"; id?: string } | { k: "category"; id?: string } | { k: "pay-category"; id: string };

export type FinCtx = {
  fin: Finance; notify: Notify; nav: Nav; profile: CustomerProfile; transactions: WalletTransaction[]; payBalance: number; loading: boolean;
  visible: boolean; onToggleVisible: () => void; unread: number; onOpenNotifications: () => void; open: (s: FinSheet) => void; onPayDetail: (id: string) => void;
};

const COLORS: Record<string, string> = { orange: "#e8833a", blue: "#1a5dc6", violet: "#7a5af0", amber: "#d9a21a", rose: "#e0568a", indigo: "#4a5fd6", cyan: "#16a3b8", emerald: "#1f9d62", slate: "#7b8497" };
export const useBalances = (state: FinanceState, entries: Entry[], payBalance: number) => useMemo(() => { const m: Record<string, number> = {}; for (const a of state.accounts) m[a.id] = accountBalance(a, entries, payBalance); m[PAY_ACCOUNT_ID] = payBalance; return m; }, [state.accounts, entries, payBalance]);
const sourceBadge = (s: Entry["source"]) => s === "pay" ? <span className="dpx-tx-badge dpx-auto">Djiwa Pay · otomatis</span> : s === "voice" ? <span className="dpx-tx-badge">Suara</span> : null;

export function EntryRow({ entry, state, onOpen, i = 0 }: { entry: Entry; state: FinanceState; onOpen: (id: string) => void; i?: number }) {
  const c = catOf(state, entry.categoryId);
  const sign = entry.kind === "in" ? "+" : entry.kind === "out" ? "−" : "";
  return <Btn type="button" className="dpx-row" onClick={() => onOpen(entry.id)} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: Math.min(i, 10) * 0.04 }} whileTap={{ scale: 0.985, backgroundColor: "rgba(15,35,71,.04)" }}>
    <CatIcon cat={c} />
    <span className="dpx-main"><b>{entry.note || c.name}</b><span>{entry.kind === "tf" ? "Transfer" : c.name} · {accName(state, entry.accountId)}{sourceBadge(entry.source)}</span></span>
    <span className="dpx-trail"><b className={entry.kind === "in" ? "dpx-in" : ""}>{sign}{rupiah(entry.amount)}</b>{formatTime(entry.at)}</span>
  </Btn>;
}

const Empty = ({ img, title, text, children }: { img: "order-receipt" | "sales-report" | "restaurant-cafe" | "loyalty-points"; title: string; text: string; children?: ReactNode }) => <div className="dpx-empty"><I3 name={img} px={112} /><b>{title}</b><p>{text}</p>{children}</div>;

/* ---------- Onboarding ---------- */
export function Onboarding({ ctx }: { ctx: FinCtx }) {
  const [step, setStep] = useState(0);
  const [cash, setCash] = useState("");
  const [bank, setBank] = useState("");
  const [bankBal, setBankBal] = useState("");
  const finish = () => {
    const accounts: FinanceState["accounts"] = [{ id: "tunai", name: "Tunai", type: "cash", opening: Number(cash || 0) }];
    if (bank.trim()) accounts.push({ id: uid(), name: bank.trim(), type: "bank", opening: Number(bankBal || 0) });
    ctx.fin.dispatch({ type: "onboard", accounts });
    ctx.notify("Siap! Ketuk Catat untuk mencatat yang pertama.");
  };
  const steps = [
    { img: <I3 name="payment-wallet" px={170} style={{ filter: "drop-shadow(0 16px 24px rgba(15,35,71,.18))" }} />, title: "Tahu uangmu pergi ke mana.", sub: "Catat dengan satu kalimat, lihat anggaran, dan semua pembayaran Djiwa Pay otomatis tercatat.", body: null, cta: "Mulai" },
    { img: <I3 name="customer-benefit-wallet" px={110} />, title: "Berapa uang tunaimu sekarang?", sub: "Saldo awal dompet Tunai. Boleh dikosongkan dan diubah nanti.", body: <MoneyInput big value={cash} onChange={setCash} label="Saldo tunai" />, cta: "Lanjut" },
    { img: <I3 name="loyalty-points" px={110} />, title: "Punya rekening yang ingin dicatat?", sub: "Opsional. Djiwa Pay sudah terhubung otomatis.", body: <><label className="dpx-field" style={{ textAlign: "left" }}><span>Nama rekening</span><div className="dpx-input"><input value={bank} onChange={(e) => setBank(e.target.value)} placeholder="Contoh: BCA" maxLength={30} /></div></label>{bank.trim() ? <label className="dpx-field" style={{ textAlign: "left" }}><span>Saldo awal</span><MoneyInput value={bankBal} onChange={setBankBal} /></label> : null}</>, cta: "Selesai" },
  ];
  const s = steps[step];
  return <div className="dpx-page"><Sky deep><div className="dpx-pad dpx-nobar" style={{ display: "flex", flexDirection: "column", minHeight: "100dvh" }}>
    <div className="dpx-steps">{steps.map((_, i) => <i key={i} className={i <= step ? "dpx-on" : ""} />)}</div>
    <AnimatePresence mode="wait" initial={false}><motion.div key={step} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.22 }} style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center" }}>
      {s.img}<h1 className="dpx-title" style={{ fontSize: 28, marginTop: 14 }}>{s.title}</h1><p className="dpx-sub" style={{ maxWidth: 300, marginTop: 8, fontSize: 15 }}>{s.sub}</p><div style={{ width: "100%", marginTop: 18 }}>{s.body}</div>
    </motion.div></AnimatePresence>
    <Btn type="button" className="dpx-btn" onClick={() => (step === steps.length - 1 ? finish() : setStep(step + 1))}>{s.cta}</Btn>
    {step > 0 ? <Btn type="button" className="dpx-btn dpx-soft" style={{ marginTop: 10 }} onClick={() => (step === 1 ? setStep(0) : finish())}>{step === 1 ? "Kembali" : "Lewati"}</Btn> : null}
  </div></Sky></div>;
}

/* ---------- Beranda ---------- */
export function FinHome({ ctx }: { ctx: FinCtx }) {
  const { fin, nav, profile } = ctx; const { state, entries } = fin;
  const now = new Date(); const y = now.getFullYear(), m = now.getMonth();
  const month = useMemo(() => entries.filter((e) => inMonth(e, y, m)), [entries]);
  const prev = useMemo(() => entries.filter((e) => inMonth(e, m === 0 ? y - 1 : y, (m + 11) % 12)), [entries]);
  const t = totals(month); const pt = totals(prev);
  const statuses = useMemo(() => budgetStatuses(state.budgets, month), [state.budgets, month]);
  const safe = safeToSpend(state.budgets, month, now);
  const insights = useMemo(() => buildInsights(state.categories, month, prev, statuses), [state.categories, month, prev, statuses]);
  const st = streak(entries);
  const empty = entries.length === 0;
  const templates = useMemo(() => { const seen = new Map<string, Entry>(); for (const e of state.entries) if (e.kind === "out" && e.note.trim() && !seen.has(e.note.trim().toLowerCase())) seen.set(e.note.trim().toLowerCase(), e); return [...seen.values()].slice(0, 3); }, [state.entries]);
  const addTemplate = (e: Entry) => { const copy: Entry = { ...e, id: uid(), at: new Date().toISOString(), createdAt: new Date().toISOString() }; fin.dispatch({ type: "entry/add", entry: copy }); ctx.notify(`${copy.note} ${rupiah(copy.amount)} tercatat`, () => fin.dispatch({ type: "entry/delete", id: copy.id })); };
  const over = safe ? safe.left < 0 : false;
  const remaining = t.in - t.out;
  const showIncomeBased = t.in > 0;
  const trend = pt.out > 0 ? Math.round(((t.out - pt.out) / pt.out) * 100) : null;
  return <div className="dpx-page"><Sky><div className="dpx-pad" style={{ paddingBottom: 0 }}>
    <div className="dpx-hdr" style={{ paddingTop: 0 }}>
      <Btn type="button" className="dpx-av" onClick={() => nav.go("/akun")} aria-label="Akun saya">{firstName(profile.name, profile.email)[0]?.toUpperCase()}</Btn><div className="dpx-grow" />
      <Btn type="button" className="dpx-pill-info" onClick={() => ctx.open({ k: "streak" })} aria-label={`Streak ${st.count} hari`}><Ic n="flame" size="sm" /> {st.count}</Btn>
      <Btn type="button" className="dpx-rb" onClick={ctx.onOpenNotifications} aria-label={`Notifikasi${ctx.unread ? `, ${ctx.unread} belum dibaca` : ""}`}><Wiggle active={ctx.unread > 0}><Ic n="bell" /></Wiggle>{ctx.unread ? <span className="dpx-bd">{ctx.unread > 9 ? "9+" : ctx.unread}</span> : null}</Btn>
    </div>
    <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.05 }} className="dpx-title" style={{ fontSize: 30, letterSpacing: "-.04em", marginTop: 10 }}>{greeting(now)}, {firstName(profile.name, profile.email)}.</motion.h1>
    <div className="dpx-flex dpx-mt8" style={{ color: "var(--mute)", font: "600 15px var(--font)" }}>{showIncomeBased ? "Sisa uang bulan ini" : "Pengeluaran bulan ini"}
      <Btn type="button" onClick={ctx.onToggleVisible} aria-label={ctx.visible ? "Sembunyikan angka" : "Tampilkan angka"} aria-pressed={!ctx.visible}><IconSwap k={ctx.visible ? "eye" : "eyeoff"}><Ic n={ctx.visible ? "eye" : "eyeoff"} size="sm" /></IconSwap></Btn></div>
    <div style={{ marginTop: 6 }}><span className="dpx-display" style={{ fontSize: 52 }}><small>Rp</small>{ctx.visible ? <>{showIncomeBased && remaining < 0 ? "−" : ""}<AnimatedNumber value={Math.abs(showIncomeBased ? remaining : t.out)} /></> : "•••••••"}</span></div>
    {trend !== null && trend !== 0 ? <div className="dpx-sub dpx-mt8" style={{ fontSize: 14 }}>Pengeluaran <b style={{ color: trend < 0 ? "var(--ok)" : "var(--danger)" }}>{trend < 0 ? "turun" : "naik"} {Math.abs(trend)}%</b> dibanding bulan lalu</div> : null}

    <Reveal i={1}>{empty && !safe ? <div className="dpx-hero-day"><I3 name="sales-report" px={110} style={{ position: "absolute", right: -6, top: -6 }} /><div className="dpx-sub">Belum ada catatan</div><div className="dpx-title" style={{ marginTop: 2, maxWidth: 200 }}>Mulai dari satu catatan.</div><div className="dpx-sub" style={{ marginTop: 6, maxWidth: 210 }}>Tulis “kopi 25rb” atau atur anggaran agar kami hitung sisa uang harianmu.</div><Btn type="button" className="dpx-btn dpx-sm" style={{ marginTop: 14 }} onClick={() => ctx.open({ k: "catat" })}><Ic n="plus" size="sm" /> Catat pertama</Btn></div>
      : safe ? <div className="dpx-hero-day"><div className="dpx-flex" style={{ gap: 16 }}><Ring percent={Math.min(100, safe.percent)} big={over ? "Lewat" : `${Math.round(safe.percent)}%`} small={over ? "anggaran" : "terpakai"} color={over ? "#d23a2a" : "#1a5dc6"} />
        <div style={{ flex: 1, minWidth: 0 }}><div className="dpx-sub">{over ? "Anggaran bulan ini terlampaui" : "Aman dibelanjakan hari ini"}</div><div className="dpx-money" style={{ fontSize: 28, color: over ? "var(--danger)" : "var(--navy)" }}>{ctx.visible ? (over ? "−" : "") + rupiah(over ? -safe.left : safe.perDay) : "••••••"}</div><div className="dpx-sub" style={{ marginTop: 4, fontSize: 12.5 }}>{over ? "Kurangi pengeluaran atau naikkan anggaran." : `Sisa ${rupiah(safe.left)} untuk ${safe.daysLeft} hari lagi.`}</div></div></div>
        {templates.length ? <div className="dpx-chips2" style={{ marginTop: 14 }}>{templates.map((e) => <Btn key={e.id} type="button" className="dpx-chip3" onClick={() => addTemplate(e)}>+ {e.note} {Math.round(e.amount / 1000)} rb</Btn>)}</div> : null}</div>
        : <div className="dpx-hero-day"><div className="dpx-sub">Belum ada anggaran</div><div className="dpx-title" style={{ marginTop: 2 }}>Atur anggaran bulanan</div><div className="dpx-sub" style={{ marginTop: 6 }}>Kami hitung berapa yang aman dibelanjakan tiap hari.</div><Btn type="button" className="dpx-btn dpx-sm" style={{ marginTop: 14 }} onClick={() => ctx.open({ k: "budget" })}>Atur anggaran</Btn>{templates.length ? <div className="dpx-chips2" style={{ marginTop: 12 }}>{templates.map((e) => <Btn key={e.id} type="button" className="dpx-chip3" onClick={() => addTemplate(e)}>+ {e.note} {Math.round(e.amount / 1000)} rb</Btn>)}</div> : null}</div>}</Reveal>

    {empty ? null : <Reveal i={2}><div className="dpx-kpi" style={{ marginTop: 12 }}><Btn type="button" className="dpx-group" style={{ textAlign: "left" }} onClick={() => nav.go("/ringkasan")}><small>Masuk bulan ini</small><b className="dpx-up">{ctx.visible ? rupiah(t.in) : "•••••"}</b></Btn><Btn type="button" className="dpx-group" style={{ textAlign: "left" }} onClick={() => nav.go("/ringkasan")}><small>Keluar bulan ini</small><b>{ctx.visible ? rupiah(t.out) : "•••••"}</b></Btn></div></Reveal>}

    {statuses.length ? <><div className="dpx-sec"><h2>Anggaran bulan ini</h2><Btn type="button" onClick={() => nav.go("/anggaran")}>Semua</Btn></div><div className="dpx-group dpx-white">{statuses.slice(0, 3).map((s) => <BudgetRow key={s.budget.categoryId} status={s} state={state} onOpen={() => ctx.open({ k: "budget", cid: s.budget.categoryId })} />)}</div></> : null}
    {insights.length ? <><div className="dpx-sec"><h2>Insight untukmu</h2></div><div className="dpx-next">{insights.map((i) => <div key={i.id} className="dpx-group" style={{ flex: "none", width: 236 }}><span className={`dpx-cat dpx-c-${i.tone === "warn" ? "amber" : i.tone === "ok" ? "emerald" : "violet"}`} style={{ marginBottom: 8 }}><Ic n={i.tone === "warn" ? "warn" : i.tone === "ok" ? "spark" : "trend"} /></span><b>{i.title}</b><div className="dpx-sub">{i.body}</div></div>)}</div></> : null}
    {empty ? null : <><div className="dpx-sec"><h2>Catatan terbaru</h2><Btn type="button" onClick={() => nav.go("/riwayat")}>Lihat semua</Btn></div><div className="dpx-group dpx-flush">{entries.slice(0, 4).map((e, i) => <EntryRow key={e.id} entry={e} state={state} i={i} onOpen={(id) => ctx.open({ k: "entry", id })} />)}</div></>}

    <div className="dpx-sec"><h2>Dompet & Bayar</h2><Btn type="button" onClick={() => nav.go("/dompet")}>Buka</Btn></div>
    <div className="dpx-group"><div className="dpx-spread"><div><div className="dpx-sub">Saldo Djiwa Pay</div><div className="dpx-money" style={{ fontSize: 26 }}>{ctx.visible ? rupiah(ctx.payBalance) : "•••••"}</div></div><span className="dpx-tag dpx-ok">Otomatis tercatat</span></div>
      <div className="dpx-tile3 dpx-mt" style={{ gridTemplateColumns: "repeat(4,1fr)", gap: 6 }}>{([["topup", "Isi saldo", "/wallet/topup"], ["send", "Kirim", "/wallet/transfer"], ["scan-qr", "Scan", "/wallet/transfer?mode=scan"], ["bills", "Layanan", "/bayar"]] as const).map(([a, l, p]) => <Btn key={a} type="button" className="dpx-q" onClick={() => nav.go(p)}><img src={`/assets/djiwa-pay-actions/${a}.webp`} width={38} height={38} alt="" />{l}</Btn>)}</div></div>
  </div></Sky></div>;
}

function Ring({ percent, big, small, color }: { percent: number; big: string; small: string; color: string }) {
  const r = 54, c = 2 * Math.PI * r;
  return <div className="dpx-ring"><svg viewBox="0 0 132 132"><circle cx="66" cy="66" r={r} fill="none" stroke="rgba(15,35,71,.08)" strokeWidth="13" /><motion.circle cx="66" cy="66" r={r} fill="none" stroke={color} strokeWidth="13" strokeLinecap="round" strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - Math.min(percent, 100) / 100) }} transition={{ duration: 1, ease: [0.32, 0.72, 0, 1] }} /></svg><div className="dpx-c"><div><b>{big}</b><span>{small}</span></div></div></div>;
}

function BudgetRow({ status, state, onOpen }: { status: ReturnType<typeof budgetStatuses>[number]; state: FinanceState; onOpen: () => void }) {
  const c = catOf(state, status.budget.categoryId);
  return <Btn type="button" className="dpx-bud" style={{ width: "100%", textAlign: "left" }} onClick={onOpen}><div className="dpx-top"><CatIcon cat={c} /><div className="dpx-main"><b>{c.name}</b><span>{status.level === "over" ? <span className="dpx-dn">Lewat {rupiah(-status.remaining)}</span> : `Sisa ${rupiah(status.remaining)}`} · {rupiah(status.used)} dari {rupiah(status.budget.limit)}</span></div><b style={{ fontSize: 14, color: status.level === "over" ? "var(--danger)" : "var(--navy)" }}>{Math.round(status.percent)}%</b></div>
    <div className="dpx-bar" style={{ marginTop: 10 }}><motion.i className={status.level === "over" ? "dpx-over" : status.level === "warn" ? "dpx-warn" : ""} initial={{ width: 0 }} animate={{ width: `${Math.min(100, status.percent)}%` }} transition={{ duration: 0.8, ease: [0.32, 0.72, 0, 1] }} /></div></Btn>;
}

/* ---------- Catatan ---------- */
export function FinRecords({ ctx, selected }: { ctx: FinCtx; selected?: ReactNode }) {
  const { fin, nav } = ctx; const { state, entries } = fin;
  const today = new Date();
  const [cursor, setCursor] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const [seg, setSeg] = useState<"all" | "in" | "out" | "tf">("all");
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [sheet, setSheet] = useState<null | "filter">(null);
  const month = entries.filter((e) => inMonth(e, cursor.y, cursor.m));
  const t = totals(month);
  const isCurrent = cursor.y === today.getFullYear() && cursor.m === today.getMonth();
  const shift = (d: number) => setCursor((c) => { const n = new Date(c.y, c.m + d, 1); return { y: n.getFullYear(), m: n.getMonth() }; });
  const list = month.filter((e) => (seg === "all" || e.kind === seg) && (cat === "all" || e.categoryId === cat) && (!q || `${e.note} ${catOf(state, e.categoryId).name} ${accName(state, e.accountId)} ${e.tags.join(" ")}`.toLowerCase().includes(q.toLowerCase())));
  const days = [...new Set(list.map((e) => dayLabel(e.at)))];
  return <div className="dpx-page"><Sky><div className="dpx-pad">
    <div className="dpx-hdr" style={{ paddingTop: 0 }}><h1 className="dpx-page-title" style={{ flex: 1 }}>Catatan</h1><Btn type="button" className="dpx-rb" onClick={() => nav.go("/ringkasan")} aria-label="Laporan"><Ic n="chart" /></Btn></div>
    <div className="dpx-spread" style={{ margin: "2px 0 4px" }}><Btn type="button" className="dpx-rb" onClick={() => shift(-1)} aria-label="Bulan sebelumnya"><Ic n="back" size="sm" /></Btn><b style={{ fontSize: 17, textTransform: "capitalize" }}>{monthLabel(cursor.y, cursor.m)}</b><Btn type="button" className="dpx-rb" style={isCurrent ? { opacity: 0.4 } : undefined} disabled={isCurrent} onClick={() => shift(1)} aria-label="Bulan berikutnya"><Ic n="chev" size="sm" /></Btn></div>
    <div className="dpx-kpi"><div className="dpx-group"><small>Masuk</small><b className="dpx-up">{ctx.visible ? rupiah(t.in) : "•••••"}</b></div><div className="dpx-group"><small>Keluar</small><b>{ctx.visible ? rupiah(t.out) : "•••••"}</b></div></div>
    <label className="dpx-search dpx-mt"><Ic n="search" size="sm" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari catatan, kategori, dompet" aria-label="Cari catatan" /></label>
    <div className="dpx-chips dpx-mt8"><Btn type="button" className={`dpx-chip ${cat !== "all" ? "dpx-on" : ""}`} onClick={() => setSheet("filter")}><Ic n="filter" size="sm" /> {cat === "all" ? "Kategori" : catOf(state, cat).name}</Btn></div>
    <div className="dpx-mt8"><Seg id="rec" label="Jenis catatan" value={seg} onChange={setSeg} options={[["all", "Semua"], ["in", "Masuk"], ["out", "Keluar"], ["tf", "Transfer"]] as const} /></div>
    <div aria-live="polite">{entries.length === 0 ? <Empty img="order-receipt" title="Belum ada catatan" text="Catat pengeluaran pertamamu — satu kalimat cukup. Pembayaran Djiwa Pay otomatis ikut tercatat."><Btn type="button" className="dpx-btn" style={{ maxWidth: 300 }} onClick={() => ctx.open({ k: "catat" })}><Ic n="plus" size="sm" /> Catat sekarang</Btn></Empty>
      : list.length === 0 ? <Empty img="restaurant-cafe" title="Tidak ada hasil" text="Coba ubah bulan, kata kunci, atau filter." />
      : days.map((d) => { const items = list.filter((e) => dayLabel(e.at) === d); const spent = items.filter((e) => e.kind === "out").reduce((s, e) => s + e.amount, 0); return <div key={d}><div className="dpx-dayh"><span>{d}</span><span>{spent ? `−${rupiah(spent)}` : ""}</span></div><div className="dpx-group dpx-flush dpx-white">{items.map((e, i) => <EntryRow key={e.id} entry={e} state={state} i={i} onOpen={(id) => ctx.open({ k: "entry", id })} />)}</div></div>; })}</div>
  </div></Sky>
  <AnimatePresence>{sheet === "filter" ? <CategorySheet key="f" categories={[{ id: "all", name: "Semua", icon: "grid", tone: "slate", income: false }, ...state.categories]} income={false} value={cat} onPick={setCat} onClose={() => setSheet(null)} /> : null}</AnimatePresence>
  {selected}</div>;
}

/* ---------- Catat manual ---------- */
export function ManualForm({ ctx, editId, initialKind, onDone }: { ctx: FinCtx; editId?: string; initialKind?: Kind; onDone: () => void }) {
  const { fin } = ctx; const { state } = fin;
  const existing = editId ? state.entries.find((e) => e.id === editId) : undefined;
  const firstAcc = state.accounts.find((a) => !a.archived)?.id ?? "tunai";
  const [kind, setKind] = useState<Kind>(existing?.kind ?? initialKind ?? "out");
  const [amount, setAmount] = useState(existing ? String(existing.amount) : "");
  const [categoryId, setCategoryId] = useState(existing?.categoryId ?? (initialKind === "in" ? "gaji" : "makan"));
  const [accountId, setAccountId] = useState(existing?.accountId ?? firstAcc);
  const [toId, setToId] = useState(existing?.toAccountId ?? "");
  const [date, setDate] = useState((existing ? new Date(existing.at) : new Date()).toISOString().slice(0, 10));
  const [note, setNote] = useState(existing?.note ?? "");
  const [pick, setPick] = useState<null | "cat" | "acc" | "to">(null);
  const balances = useBalances(state, fin.entries, ctx.payBalance);
  const n = Number(amount || 0);
  const c = catOf(state, categoryId);
  const key = (k: string) => setAmount((a) => { if (k === "del") return a.slice(0, -1); const next = (a + k).replace(/^0+/, ""); return next.length > 11 ? a : next; });
  const setType = (k: Kind) => { setKind(k); const cur = catOf(state, categoryId); if ((k === "in") !== cur.income) setCategoryId(k === "in" ? "gaji" : k === "tf" ? "transfer" : "makan"); if (k === "tf" && !toId) setToId(state.accounts.find((a) => a.id !== accountId && !a.archived)?.id ?? PAY_ACCOUNT_ID); };
  const valid = n > 0 && (kind !== "tf" || (toId && toId !== accountId));
  const save = () => {
    const at = new Date(`${date}T${existing ? new Date(existing.at).toTimeString().slice(0, 8) : new Date().toTimeString().slice(0, 8)}`).toISOString();
    const entry: Entry = { id: existing?.id ?? uid(), kind, amount: n, categoryId: kind === "tf" ? "transfer" : categoryId, accountId, toAccountId: kind === "tf" ? toId : undefined, at, note: note.trim(), tags: existing?.tags ?? [], source: existing?.source ?? "manual", createdAt: existing?.createdAt ?? new Date().toISOString() };
    fin.dispatch({ type: existing ? "entry/update" : "entry/add", entry });
    ctx.notify(existing ? "Perubahan disimpan" : "Catatan tersimpan", existing ? undefined : () => fin.dispatch({ type: "entry/delete", id: entry.id }));
    onDone();
  };
  return <div className="dpx-page"><Sky><div className="dpx-pad dpx-nobar" style={{ paddingBottom: 20 }}>
    <Header title={existing ? "Ubah catatan" : "Catat manual"} onBack={onDone} />
    <Seg id="kind" label="Jenis" value={kind} onChange={setType} options={[["out", "Keluar"], ["in", "Masuk"], ["tf", "Transfer"]] as const} />
    <div className="dpx-amount-xl" style={{ marginTop: 20 }} aria-live="polite"><small>Rp</small>{n ? n.toLocaleString("id-ID") : "0"}</div>
    <div className="dpx-chips2" style={{ justifyContent: "center", marginTop: 14 }}>
      {kind !== "tf" ? <Btn type="button" className="dpx-chip3" onClick={() => setPick("cat")} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><span className={`dpx-cat dpx-c-${c.tone}`} style={{ width: 20, height: 20 }}><Ic n={iconOr(c.icon)} size="sm" /></span>{c.name}</Btn> : null}
      <Btn type="button" className="dpx-chip3" onClick={() => setPick("acc")}>{kind === "tf" ? "Dari: " : ""}{accName(state, accountId)}</Btn>
      {kind === "tf" ? <Btn type="button" className="dpx-chip3" onClick={() => setPick("to")}>Ke: {toId ? accName(state, toId) : "pilih"}</Btn> : null}
      <label className="dpx-chip3 dpx-datefield" style={{ cursor: "pointer" }}><Ic n="cal" size="sm" /> {new Date(`${date}T12:00`).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}<input type="date" value={date} max={new Date().toISOString().slice(0, 10)} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Tanggal" /></label>
    </div>
    <div className="dpx-input" style={{ marginTop: 14 }}><Ic n="edit" size="sm" /><input value={note} maxLength={80} placeholder="Catatan (opsional)" aria-label="Catatan" onChange={(e) => setNote(e.target.value)} /></div>
    <div className="dpx-kp">{["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((k) => <Btn key={k} type="button" onClick={() => key(k)}>{k}</Btn>)}<Btn type="button" style={{ fontSize: 18 }} onClick={() => key("000")}>000</Btn><Btn type="button" onClick={() => key("0")}>0</Btn><Btn type="button" onClick={() => key("del")} aria-label="Hapus angka"><Ic n="del" /></Btn></div>
    {kind === "tf" && toId === accountId ? <p className="dpx-hint dpx-err dpx-center">Dompet asal dan tujuan tidak boleh sama.</p> : null}
    <Btn type="button" className={`dpx-btn ${valid ? "" : "dpx-off"}`} disabled={!valid} onClick={save}>{existing ? "Simpan perubahan" : "Simpan catatan"}</Btn>
  </div></Sky>
  <AnimatePresence>
    {pick === "cat" ? <CategorySheet key="c" categories={state.categories} income={kind === "in"} value={categoryId} onPick={setCategoryId} onClose={() => setPick(null)} onAdd={() => { setPick(null); ctx.open({ k: "category" }); }} /> : null}
    {pick === "acc" ? <AccountSheet key="a" state={state} balances={balances} value={accountId} onPick={setAccountId} onClose={() => setPick(null)} includePay={false} onAdd={() => { setPick(null); ctx.open({ k: "account" }); }} /> : null}
    {pick === "to" ? <AccountSheet key="t" state={state} balances={balances} value={toId} onPick={setToId} onClose={() => setPick(null)} includePay /> : null}
  </AnimatePresence></div>;
}

/* ---------- Anggaran, tujuan, hutang ---------- */
export function FinBudget({ ctx }: { ctx: FinCtx }) {
  const { fin, nav } = ctx; const { state, entries } = fin;
  const [seg, setSeg] = useState<"bud" | "goal" | "debt">("bud");
  const now = new Date(); const month = entries.filter((e) => inMonth(e, now.getFullYear(), now.getMonth()));
  const statuses = budgetStatuses(state.budgets, month);
  const total = state.budgets.reduce((s, b) => s + b.limit, 0);
  const used = statuses.reduce((s, x) => s + x.used, 0);
  const pct = total > 0 ? (used / total) * 100 : 0;
  const dt = debtTotals(state.debts);
  const subs = useMemo(() => detectSubscriptions(state.entries), [state.entries]);
  return <div className="dpx-page"><Sky><div className="dpx-pad">
    <div className="dpx-hdr" style={{ paddingTop: 0 }}><h1 className="dpx-page-title" style={{ flex: 1 }}>Anggaran</h1></div>
    <div style={{ marginBottom: 14 }}><Seg id="bseg" label="Bagian" value={seg} onChange={setSeg} options={[["bud", "Anggaran"], ["goal", "Tujuan"], ["debt", "Hutang & lainnya"]] as const} /></div>
    {seg === "bud" ? <>
      {state.budgets.length === 0 ? <Empty img="sales-report" title="Belum ada anggaran" text="Tentukan batas per kategori. Kami hitung berapa yang aman dibelanjakan setiap hari."><Btn type="button" className="dpx-btn" style={{ maxWidth: 300 }} onClick={() => ctx.open({ k: "budget" })}><Ic n="plus" size="sm" /> Atur anggaran</Btn></Empty> : <>
        <div className="dpx-group dpx-white"><div className="dpx-flex" style={{ gap: 16 }}><Ring percent={Math.min(100, pct)} big={`${Math.round(pct)}%`} small="terpakai" color={pct > 100 ? "#d23a2a" : "#1a5dc6"} /><div><div className="dpx-sub">Sisa anggaran</div><div className="dpx-money" style={{ fontSize: 26 }}>{rupiah(Math.max(0, total - used))}</div><div className="dpx-sub">dari {rupiah(total)}</div></div></div></div>
        <div className="dpx-sec"><h2>Per kategori</h2></div><div className="dpx-group dpx-white">{statuses.map((s) => <BudgetRow key={s.budget.categoryId} status={s} state={state} onOpen={() => ctx.open({ k: "budget", cid: s.budget.categoryId })} />)}</div>
        <Btn type="button" className="dpx-btn dpx-ghost" onClick={() => ctx.open({ k: "budget" })}><Ic n="plus" size="sm" /> Tambah anggaran</Btn></>}
    </> : seg === "goal" ? <>
      {state.goals.length === 0 ? <Empty img="loyalty-points" title="Belum ada tujuan" text="Menabung untuk dana darurat, liburan, atau gadget baru — pantau progresnya di sini."><Btn type="button" className="dpx-btn" style={{ maxWidth: 300 }} onClick={() => ctx.open({ k: "goal" })}><Ic n="plus" size="sm" /> Tujuan baru</Btn></Empty> :
        <>{state.goals.map((g) => { const saved = goalSaved(g); const p = Math.min(100, (saved / g.target) * 100); const proj = goalProjection(g); return <Btn key={g.id} type="button" className="dpx-group dpx-white" style={{ width: "100%", textAlign: "left", marginBottom: 10 }} onClick={() => ctx.open({ k: "goal-detail", id: g.id })}><div className="dpx-flex"><span className="dpx-cat dpx-c-emerald"><Ic n="target" /></span><div style={{ flex: 1 }}><b>{g.name}</b><div className="dpx-sub">{rupiah(saved)} dari {rupiah(g.target)}{proj.eta ? ` · ± ${proj.eta.toLocaleDateString("id-ID", { month: "short", year: "numeric" })}` : ""}</div></div><b>{Math.round(p)}%</b></div><div style={{ marginTop: 10 }}><Bar percent={p} /></div></Btn>; })}
          <Btn type="button" className="dpx-btn dpx-ghost" onClick={() => ctx.open({ k: "goal" })}><Ic n="plus" size="sm" /> Tujuan baru</Btn></>}
    </> : <>
      <div className="dpx-kpi"><div className="dpx-group dpx-white"><small>Orang berutang padamu</small><b className="dpx-up">{rupiah(dt.owedToMe)}</b></div><div className="dpx-group dpx-white"><small>Kamu berutang</small><b className="dpx-dn">{rupiah(dt.iOwe)}</b></div></div>
      <div className="dpx-glabel">Aktif <Btn type="button" onClick={() => ctx.open({ k: "debt" })}>+ Tambah</Btn></div>
      {state.debts.filter((d) => !d.settled).length === 0 ? <div className="dpx-group dpx-white dpx-center"><p className="dpx-sub" style={{ margin: 0 }}>Belum ada hutang atau piutang aktif.</p></div> :
        <div className="dpx-group dpx-flush dpx-white">{state.debts.filter((d) => !d.settled).map((d) => <Row key={d.id} icon={d.direction === "owed_to_me" ? "down" : "up"} tone={d.direction === "owed_to_me" ? "emerald" : "rose"} title={d.person} sub={`${d.direction === "owed_to_me" ? "Piutang" : "Hutang"}${d.note ? ` · ${d.note}` : ""}${d.due ? ` · jatuh tempo ${new Date(d.due).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}` : ""}`} trail={<b className={d.direction === "owed_to_me" ? "dpx-up" : "dpx-dn"}>{rupiah(d.amount)}</b>} onClick={() => ctx.open({ k: "debt", id: d.id })} />)}</div>}
      <div className="dpx-glabel">Alat lain</div>
      <div className="dpx-group dpx-flush dpx-white"><Row icon="split" tone="orange" title="Patungan / bagi tagihan" sub="Hitung bagian tiap orang" onClick={() => ctx.open({ k: "split" })} /></div>
      <div className="dpx-glabel">Langganan terdeteksi</div>
      {subs.length === 0 ? <div className="dpx-group dpx-white"><p className="dpx-sub" style={{ margin: 0 }}>Muncul otomatis bila pengeluaran dengan catatan yang sama berulang di 2 bulan berbeda.</p></div> : <><div className="dpx-group dpx-flush dpx-white">{subs.map((s) => <Row key={s.name} icon="repeat" tone="violet" title={s.name} sub={`Tiap tgl ${s.day} · ${s.months} bulan`} trail={<b>{rupiah(s.amount)}</b>} />)}</div><p className="dpx-sub dpx-center" style={{ marginTop: 8 }}>Total {rupiah(subs.reduce((s, x) => s + x.amount, 0))} per bulan</p></>}
    </>}
  </div></Sky></div>;
}

/* ---------- Dompet ---------- */
export function FinWallet({ ctx }: { ctx: FinCtx }) {
  const { fin, nav } = ctx; const { state, entries } = fin;
  const balances = useBalances(state, entries, ctx.payBalance);
  const accounts = state.accounts.filter((a) => !a.archived);
  const net = accounts.reduce((s, a) => s + (balances[a.id] ?? 0), 0) + ctx.payBalance;
  const acts: [string, string, string][] = [["topup", "Isi saldo", "/wallet/topup"], ["send", "Kirim", "/wallet/transfer"], ["receive", "Terima", "/wallet/receive"], ["scan-qr", "Scan QR", "/wallet/transfer?mode=scan"]];
  return <div className="dpx-page"><Sky><div className="dpx-pad">
    <div className="dpx-hdr" style={{ paddingTop: 0 }}><h1 className="dpx-page-title" style={{ flex: 1 }}>Dompet</h1><Btn type="button" className="dpx-rb" onClick={() => nav.go("/akun")} aria-label="Akun saya"><Ic n="user" /></Btn></div>
    <div className="dpx-label" style={{ marginTop: 6 }}>Total kekayaan bersih</div>
    <div className="dpx-flex" style={{ marginTop: 4 }}><span className="dpx-display"><small>Rp</small>{ctx.visible ? <>{net < 0 ? "−" : ""}<AnimatedNumber value={Math.abs(net)} /></> : "•••••••"}</span><Btn type="button" onClick={ctx.onToggleVisible} aria-label={ctx.visible ? "Sembunyikan saldo" : "Tampilkan saldo"} style={{ color: "var(--mute)" }}><IconSwap k={ctx.visible ? "eye" : "eyeoff"}><Ic n={ctx.visible ? "eye" : "eyeoff"} /></IconSwap></Btn></div>
    <div className="dpx-glabel">Akun & dompet</div>
    <div className="dpx-group dpx-flush dpx-white">
      <Btn type="button" className="dpx-row" onClick={() => nav.openSheet("pay")}><span className="dpx-ico dpx-c-violet" style={{ boxShadow: "none" }}><I3 name="payment-wallet" px={28} /></span><span className="dpx-main"><b>Djiwa Pay</b><span>Terhubung · transaksi otomatis tercatat</span></span><span className="dpx-trail"><b>{ctx.visible ? rupiah(ctx.payBalance) : "•••••"}</b></span></Btn>
      {accounts.map((a) => <Btn key={a.id} type="button" className="dpx-row" onClick={() => ctx.open({ k: "account", id: a.id })}><span className={`dpx-ico dpx-c-${a.type === "bank" ? "blue" : a.type === "card" ? "rose" : a.type === "ewallet" ? "indigo" : "emerald"}`} style={{ boxShadow: "none" }}><Ic n={a.type === "bank" ? "bank" : a.type === "card" ? "card" : "wallet"} /></span><span className="dpx-main"><b>{a.name}</b><span>Catat manual</span></span><span className="dpx-trail"><b className={(balances[a.id] ?? 0) < 0 ? "dpx-dn" : ""}>{ctx.visible ? `${(balances[a.id] ?? 0) < 0 ? "−" : ""}${rupiah(balances[a.id] ?? 0)}` : "•••••"}</b></span></Btn>)}
    </div>
    <Btn type="button" className="dpx-btn dpx-ghost" onClick={() => ctx.open({ k: "account" })}><Ic n="plus" size="sm" /> Tambah dompet</Btn>
    <div className="dpx-sec"><h2>Bayar & layanan</h2><Btn type="button" onClick={() => nav.go("/bayar")}>Semua layanan</Btn></div>
    <div className="dpx-group"><div className="dpx-tile3" style={{ gridTemplateColumns: "repeat(4,1fr)", gap: 6 }}>{acts.map(([a, l, p]) => <Btn key={a} type="button" className="dpx-q" onClick={() => nav.go(p)}><img src={`/assets/djiwa-pay-actions/${a}.webp`} width={42} height={42} alt="" />{l}</Btn>)}</div></div>
    <Btn type="button" className="dpx-group dpx-flex" style={{ width: "100%", marginTop: 12, textAlign: "left" }} onClick={() => nav.openSheet("card")}><img src="/assets/djiwa-pay-actions/card.webp" width={56} height={56} alt="" /><span style={{ flex: 1 }}><b style={{ fontSize: 16 }}>Kartu Djiwa</b><div className="dpx-sub">Kartu virtual untuk belanja online.</div></span><span className="dpx-tag">Segera</span></Btn>
  </div></Sky></div>;
}

/* ---------- Laporan ---------- */
export function FinReport({ ctx, onBack }: { ctx: FinCtx; onBack: () => void }) {
  const { fin } = ctx; const { state, entries } = fin;
  const today = new Date();
  const [cursor, setCursor] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const [tab, setTab] = useState<"sum" | "cat" | "trend" | "flow">("sum");
  const isCurrent = cursor.y === today.getFullYear() && cursor.m === today.getMonth();
  const shift = (d: number) => setCursor((c) => { const n = new Date(c.y, c.m + d, 1); return { y: n.getFullYear(), m: n.getMonth() }; });
  const month = entries.filter((e) => inMonth(e, cursor.y, cursor.m));
  const prevD = new Date(cursor.y, cursor.m - 1, 1);
  const prev = entries.filter((e) => inMonth(e, prevD.getFullYear(), prevD.getMonth()));
  const t = totals(month), pt = totals(prev);
  const cats = useMemo(() => [...spendByCategory(month).entries()].sort((a, b) => b[1] - a[1]), [month]);
  const prevCats = useMemo(() => spendByCategory(prev), [prev]);
  const perDay = useMemo(() => dailySpend(entries, cursor.y, cursor.m), [entries, cursor]);
  const max = Math.max(0, ...perDay);
  const series = useMemo(() => monthlySeries(entries, 6, new Date(cursor.y, cursor.m, 1)), [entries, cursor]);
  const smax = Math.max(1, ...series.map((s) => Math.max(s.out, s.in)));
  const elapsed = isCurrent ? today.getDate() : daysIn(cursor.y, cursor.m);
  const offset = (new Date(cursor.y, cursor.m, 1).getDay() + 6) % 7;
  const incomeBy = useMemo(() => { const m = new Map<string, number>(); for (const e of month) if (e.kind === "in") m.set(e.categoryId, (m.get(e.categoryId) ?? 0) + e.amount); return [...m.entries()].sort((a, b) => b[1] - a[1]); }, [month]);
  const exportCsv = () => { const blob = new Blob(["﻿" + toCsv(entries, state.categories, state.accounts)], { type: "text/csv;charset=utf-8" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `djiwa-pay-catatan-${cursor.y}-${String(cursor.m + 1).padStart(2, "0")}.csv`; a.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); ctx.notify("CSV diunduh"); };
  const donutR = 48, circ = 2 * Math.PI * donutR; let off = 0;
  return <div className="dpx-page"><Sky><div className="dpx-pad dpx-nobar">
    <Header title="Laporan" onBack={onBack} right={<Btn type="button" className="dpx-rb" onClick={exportCsv} aria-label="Ekspor CSV"><Ic n="dl" /></Btn>} />
    <div className="dpx-chips" style={{ marginTop: 2 }}>{([["sum", "Ringkasan"], ["cat", "Kategori"], ["trend", "Tren"], ["flow", "Arus uang"]] as const).map(([k, l]) => <Btn key={k} type="button" className={`dpx-chip ${tab === k ? "dpx-on" : ""}`} onClick={() => setTab(k)}>{l}</Btn>)}</div>
    <div className="dpx-spread" style={{ margin: "6px 0 4px" }}><Btn type="button" className="dpx-rb" onClick={() => shift(-1)} aria-label="Bulan sebelumnya"><Ic n="back" size="sm" /></Btn><b style={{ fontSize: 17, textTransform: "capitalize" }}>{monthLabel(cursor.y, cursor.m)}</b><Btn type="button" className="dpx-rb" style={isCurrent ? { opacity: 0.4 } : undefined} disabled={isCurrent} onClick={() => shift(1)} aria-label="Bulan berikutnya"><Ic n="chev" size="sm" /></Btn></div>
    {month.length === 0 ? <Empty img="sales-report" title="Belum ada data bulan ini" text="Catat pengeluaran atau pemasukan agar laporan terisi." /> : <AnimatePresence mode="wait" initial={false}><motion.div key={tab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
      {tab === "sum" ? <>
        <div className="dpx-mt"><div className="dpx-sub">Uang keluar</div><div className="dpx-display" style={{ fontSize: 46 }}><small style={{ fontSize: 22 }}>Rp</small><AnimatedNumber value={t.out} /></div>{pt.out > 0 ? <div className="dpx-sub dpx-mt8"><b style={{ color: t.out <= pt.out ? "var(--ok)" : "var(--danger)" }}>{t.out <= pt.out ? "▼" : "▲"} {Math.abs(Math.round(((t.out - pt.out) / pt.out) * 100))}%</b> dibanding bulan lalu ({rupiah(pt.out)})</div> : null}</div>
        <div className="dpx-kpi dpx-mt"><div className="dpx-group dpx-white"><small>Masuk</small><b className="dpx-up">{rupiah(t.in)}</b></div><div className="dpx-group dpx-white"><small>Selisih</small><b>{t.net < 0 ? "−" : ""}{rupiah(t.net)}</b></div><div className="dpx-group dpx-white"><small>Rasio menabung</small><b>{t.in > 0 ? `${Math.max(0, Math.round((t.net / t.in) * 100))}%` : "—"}</b></div><div className="dpx-group dpx-white"><small>Rata-rata / hari</small><b>{rupiah(t.out / elapsed)}</b></div></div>
        <div className="dpx-sec"><h2>Kalender harian</h2></div><div className="dpx-heatw">{["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"].map((d) => <span key={d}>{d}</span>)}</div>
        <div className="dpx-heat">{Array.from({ length: offset }, (_, i) => <span key={`b${i}`} />)}{perDay.map((a, i) => { const day = i + 1; const fut = isCurrent && day > today.getDate(); const l = heatLevel(a, max); return <motion.div key={day} initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ ...spring, delay: day * 0.01 }} className={`dpx-d ${fut ? "dpx-fut" : l ? "dpx-l" + l : ""} ${isCurrent && day === today.getDate() ? "dpx-today" : ""}`} title={a ? `${day}: ${rupiah(a)}` : String(day)}>{day}</motion.div>; })}</div>
      </> : tab === "cat" ? <>
        <div className="dpx-group dpx-white dpx-mt" style={{ display: "flex", justifyContent: "center", padding: 22 }}><div className="dpx-ring" style={{ width: 170, height: 170 }}><svg viewBox="0 0 132 132">{cats.map(([id, v]) => { const len = (v / (t.out || 1)) * circ; const el = <circle key={id} cx="66" cy="66" r={donutR} fill="none" stroke={COLORS[catOf(state, id).tone]} strokeWidth="18" strokeDasharray={`${Math.max(0, len - 2)} ${circ - len + 2}`} strokeDashoffset={-off} />; off += len; return el; })}</svg><div className="dpx-c"><div><b style={{ fontSize: 17 }}>{rupiah(t.out)}</b><span>keluar</span></div></div></div></div>
        <div className="dpx-glabel">Per kategori</div>
        <div className="dpx-group dpx-white">{cats.map(([id, v], i) => { const c = catOf(state, id); const p = prevCats.get(id) ?? 0; const d = p > 0 ? Math.round(((v - p) / p) * 100) : null; return <div className="dpx-bud" key={id}><div className="dpx-top"><CatIcon cat={c} /><div className="dpx-main"><b>{c.name}</b><span>{Math.round((v / (t.out || 1)) * 100)}% dari total{d !== null ? <> · <span className={d <= 0 ? "dpx-up" : "dpx-dn"}>{d <= 0 ? "▼" : "▲"} {Math.abs(d)}%</span> vs bulan lalu</> : ""}</span></div><b style={{ fontSize: 14 }}>{rupiah(v)}</b></div><div style={{ marginTop: 8 }}><Bar percent={(v / (cats[0]?.[1] || 1)) * 100} delay={i * 0.06} /></div></div>; })}</div>
      </> : tab === "trend" ? <>
        <div className="dpx-sec"><h2>Masuk vs keluar · 6 bulan</h2></div>
        <div className="dpx-group dpx-white"><div className="dpx-bars">{series.map((s, i) => <div key={s.label + i}><div className="dpx-bars2" style={{ height: 110 }}><motion.i initial={{ height: 0 }} animate={{ height: `${(s.in / smax) * 100}%` }} transition={{ duration: 0.7, delay: i * 0.05 }} style={{ background: "linear-gradient(180deg,#7fd1a6,var(--ok))", borderRadius: "6px 6px 2px 2px" }} /><motion.i className="dpx-out" initial={{ height: 0 }} animate={{ height: `${(s.out / smax) * 100}%` }} transition={{ duration: 0.7, delay: i * 0.05 + 0.05 }} style={{ borderRadius: "6px 6px 2px 2px" }} /></div>{s.label}</div>)}</div><div className="dpx-legend" style={{ flexDirection: "row", gap: 16, justifyContent: "center", marginTop: 8 }}><div><i style={{ background: "var(--ok)" }} />Masuk</div><div><i style={{ background: "var(--danger)" }} />Keluar</div></div></div>
        <div className="dpx-glabel">Perbandingan dengan bulan lalu</div>
        <div className="dpx-group dpx-flush dpx-white">{cats.slice(0, 6).map(([id, v]) => { const c = catOf(state, id); const p = prevCats.get(id) ?? 0; const d = p > 0 ? Math.round(((v - p) / p) * 100) : null; return <Row key={id} icon={iconOr(c.icon)} tone={c.tone} title={c.name} sub={d === null ? "Baru bulan ini" : d <= 0 ? "Lebih hemat" : "Lebih boros"} trail={d === null ? <b>{rupiah(v)}</b> : <b className={d <= 0 ? "dpx-up" : "dpx-dn"}>{d <= 0 ? "▼" : "▲"} {Math.abs(d)}%</b>} />; })}</div>
      </> : <>
        <div className="dpx-note dpx-info" style={{ marginTop: 6 }}><Ic n="info" /><div>Ke mana uang bulan ini mengalir: dari sumber pemasukan ke kategori pengeluaran dan tabungan.</div></div>
        <div className="dpx-group dpx-white dpx-mt"><div className="dpx-flow">
          <div className="dpx-col">{incomeBy.length ? incomeBy.map(([id, v]) => <div key={id} className="dpx-node dpx-c-emerald" style={{ flex: v }}><span>{catOf(state, id).name.split(" ")[0]}</span><span>{rupiah(v)}</span></div>) : <div className="dpx-node dpx-c-slate" style={{ flex: 1 }}><span>Belum ada pemasukan</span></div>}</div>
          <div className="dpx-mid"><Ic n="chev" /></div>
          <div className="dpx-col">{cats.map(([id, v]) => <div key={id} className={`dpx-node dpx-c-${catOf(state, id).tone}`} style={{ flex: Math.max(v, t.in * 0.04) }}><span>{catOf(state, id).name.split(" ")[0]}</span><span>{rupiah(v)}</span></div>)}{t.net > 0 ? <div className="dpx-node dpx-c-emerald" style={{ flex: t.net }}><span>Tersisa</span><span>{rupiah(t.net)}</span></div> : null}</div>
        </div></div>
      </>}
    </motion.div></AnimatePresence>}
  </div></Sky></div>;
}

/* ---------- Pengaturan keuangan ---------- */
export function FinSettings({ ctx, onBack }: { ctx: FinCtx; onBack: () => void }) {
  const { fin } = ctx; const { state, entries } = fin;
  const [confirmReset, setConfirmReset] = useState(false);
  const file = (name: string, type: string, content: string) => { const url = URL.createObjectURL(new Blob([content], { type })); const a = document.createElement("a"); a.href = url; a.download = name; a.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); };
  const importJson = (f: File | undefined) => { if (!f) return; void f.text().then((txt) => { try { const next = normalize(JSON.parse(txt)); fin.dispatch({ type: "import", state: { ...next, onboarded: true } }); ctx.notify(`Data dipulihkan: ${next.entries.length} catatan`); } catch { ctx.notify("Berkas cadangan tidak valid"); } }); };
  return <div className="dpx-page"><Sky><div className="dpx-pad dpx-nobar">
    <Header title="Pengaturan keuangan" onBack={onBack} />
    <div className="dpx-note dpx-info" style={{ marginTop: 6 }}><Ic n="shield" /><div><b>Data tersimpan di perangkat ini.</b> Catatan pribadi tidak dikirim ke server. Buat cadangan berkala agar tidak hilang saat ganti perangkat. Transaksi Djiwa Pay tetap aman di akunmu.</div></div>
    <div className="dpx-glabel">Kategori <Btn type="button" onClick={() => ctx.open({ k: "category" })}>+ Tambah</Btn></div>
    <div className="dpx-group dpx-flush dpx-white">{state.categories.map((c) => <Row key={c.id} icon={iconOr(c.icon)} tone={c.tone} title={c.name} sub={`${c.income ? "Pemasukan" : "Pengeluaran"}${c.custom ? " · buatanmu" : ""}`} onClick={() => ctx.open({ k: "category", id: c.id })} />)}</div>
    <div className="dpx-glabel">Data</div>
    <div className="dpx-group dpx-flush dpx-white">
      <Row icon="dl" tone="emerald" title="Ekspor semua catatan (CSV)" sub={`${entries.length} catatan termasuk Djiwa Pay`} onClick={() => file("djiwa-pay-catatan.csv", "text/csv;charset=utf-8", "﻿" + toCsv(entries, state.categories, state.accounts))} />
      <Row icon="share" tone="blue" title="Cadangkan data (JSON)" sub="Simpan ke Files / kirim ke dirimu" onClick={() => file("djiwa-pay-cadangan.json", "application/json", JSON.stringify(state, null, 2))} />
      <label className="dpx-row" style={{ cursor: "pointer" }}><span className="dpx-ico dpx-c-violet" style={{ boxShadow: "none" }}><Ic n="up" /></span><span className="dpx-main"><b>Pulihkan dari cadangan</b><span>Pilih berkas JSON</span></span><input type="file" accept="application/json,.json" style={{ display: "none" }} onChange={(e) => { importJson(e.target.files?.[0]); e.target.value = ""; }} /><Ic n="chev" size="sm" /></label>
    </div>
    <div className="dpx-glabel">Zona hati-hati</div>
    <div className="dpx-group dpx-flush dpx-white"><Row icon="trash" tone="rose" title="Hapus semua data keuangan" sub="Catatan, anggaran, tujuan, hutang" onClick={() => setConfirmReset(true)} chev={false} /></div>
    {confirmReset ? <div className="dpx-note dpx-danger" role="alert"><Ic n="warn" /><div><b>Hapus semua data keuangan di perangkat ini?</b> Tidak bisa dibatalkan. Transaksi Djiwa Pay tidak terpengaruh.<div className="dpx-flex" style={{ marginTop: 10 }}><Btn type="button" className="dpx-btn dpx-danger dpx-sm" onClick={() => { fin.dispatch({ type: "reset" }); setConfirmReset(false); ctx.notify("Data keuangan dihapus"); onBack(); }}>Hapus semua</Btn><Btn type="button" className="dpx-btn dpx-soft dpx-sm" onClick={() => setConfirmReset(false)}>Batal</Btn></div></div></div> : null}
  </div></Sky></div>;
}

/* ---------- sheet host ---------- */
export function FinSheetHost({ ctx, sheet, close, goManual, openPaySheet }: { ctx: FinCtx; sheet: FinSheet | null; close: () => void; goManual: (kind: Kind, editId?: string) => void; openPaySheet: () => void }) {
  const { fin, notify } = ctx; const { state, entries } = fin;
  const balances = useBalances(state, entries, ctx.payBalance);
  const suggested = useMemo(() => { const now = new Date(); const out: Record<string, number> = {}; for (let i = 1; i <= 3; i++) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); for (const [id, v] of spendByCategory(entries.filter((e) => inMonth(e, d.getFullYear(), d.getMonth())))) out[id] = (out[id] ?? 0) + v / 3; } for (const k of Object.keys(out)) out[k] = Math.round(out[k] / 1000) * 1000; return out; }, [entries]);
  if (!sheet) return null;
  switch (sheet.k) {
    case "catat": return <CatatSheet key="catat" fin={fin} notify={notify} balances={balances} onClose={close} onManual={(k) => { close(); goManual(k); }} onPay={() => { close(); openPaySheet(); }} />;
    case "entry": { const e = entries.find((x) => x.id === sheet.id); if (!e) return null; return <EntrySheet key="entry" entry={e} fin={fin} notify={notify} onClose={close} onEdit={() => { close(); goManual(e.kind, e.id); }} onPickCategory={() => ctx.open({ k: "pay-category", id: e.id })} />; }
    case "pay-category": { const e = entries.find((x) => x.id === sheet.id); if (!e) return null; return <CategorySheet key="paycat" categories={state.categories} income={e.kind === "in"} value={e.categoryId} onPick={(id) => { fin.dispatch({ type: "override/set", id: e.id, override: { categoryId: id } }); notify("Kategori diubah"); }} onClose={close} />; }
    case "budget": return <BudgetSheet key="budget" fin={fin} categoryId={sheet.cid} suggested={suggested} notify={notify} onClose={close} />;
    case "goal": return <GoalSheet key="goal" fin={fin} goal={state.goals.find((g) => g.id === sheet.id)} notify={notify} onClose={close} />;
    case "goal-detail": { const g = state.goals.find((x) => x.id === sheet.id); return g ? <GoalDetailSheet key="gd" fin={fin} goal={g} notify={notify} onClose={close} onEdit={() => ctx.open({ k: "goal", id: g.id })} /> : null; }
    case "debt": return <DebtSheet key="debt" fin={fin} debt={state.debts.find((d) => d.id === sheet.id)} notify={notify} onClose={close} />;
    case "split": return <SplitSheet key="split" notify={notify} onClose={close} />;
    case "streak": return <StreakSheet key="streak" entries={entries} onClose={close} onCatat={() => ctx.open({ k: "catat" })} />;
    case "account": return <AccountEditSheet key="acc" fin={fin} account={state.accounts.find((a) => a.id === sheet.id)} notify={notify} onClose={close} />;
    case "category": return <CategoryEditSheet key="cat" fin={fin} category={state.categories.find((c) => c.id === sheet.id)} notify={notify} onClose={close} />;
  }
}

export { emptyState };
