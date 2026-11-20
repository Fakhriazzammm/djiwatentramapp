import { useEffect, useMemo, useState, type ReactNode } from "react";
import { markAutoSeen, readAutoSeen } from "../../lib/finance/integrations";
import { AnimatePresence, motion } from "framer-motion";
import { CeritaBody } from "./beranda-cerita";
import { WalletDeck } from "./wallet-deck";
import { quoteDeck } from "../../lib/quotes";
import { wealthHistory } from "../../lib/finance/story";
import { Avatar, payAsset, AnimatedNumber, Bar, Mascot, MascotBuddy, Btn, Header, I3, IconSwap, Ic, Reveal, Row, Seg, Sky, Wiggle, iconOr, spring, type IconName } from "../shell/dpx-ui";
import type { Nav } from "../shell/dpx-pages";
import { AccountEditSheet, AccountSheet, BudgetSheet, CatIcon, CategoryEditSheet, CategorySheet, DebtSheet, EntrySheet, GoalDetailSheet, GoalSheet, PocketSheet, CatatSheet, SplitSheet, StreakSheet, MoneyInput, accName, catOf, type Notify } from "./fin-sheets";
import { debtRemaining, accountBalance, budgetStatuses, buildInsights, dailySpend, daysIn, debtTotals, detectSubscriptions, goalProjection, goalSaved, inMonth, monthlySeries, safeToSpend, spendByCategory, streak, toCsv, totals, uid } from "../../lib/finance/calc";
import { PAY_ACCOUNT_ID } from "../../lib/finance/categories";
import { emptyState, normalize } from "../../lib/finance/store";
import { dayLabel, daypart, firstName, formatTime, greeting, rupiah } from "../../lib/djiwa-pay-format";
import { heatLevel, monthLabel } from "../../lib/djiwa-pay-summary";
import type { Entry, FinanceState, Kind } from "../../lib/finance/types";
import { GoogleNudge, ReviewChip, useInbound } from "../integrations/integrations-pages";
import type { Finance } from "../../lib/finance/use-finance";
import { KelolaHome, PocketsPanel, useCash } from "../kelola/kelola-pages";
import { assetValue, assetsChange, gainOf, useGold } from "../../lib/finance/assets";
import { Sticker } from "../kelola/asset-ui";
import { short } from "../kelola/kelola-ui";
import { AssetFlow } from "../kelola/asset-flow";
import { AssetDetail } from "../kelola/asset-detail";
import { BillPaySheet, BillSheet, PayoffSheet, PocketRuleSheet, WeeklySheet } from "../kelola/kelola-sheets";
import { ASSET_KINDS, netWorth, pocketsOf } from "../../lib/finance/kelola";
import { KewajibanPanel } from "./fin-plan";
import { LoanDetail, LoanPaySheet, LoanRateSheet, LoanSheet } from "../kelola/loan-ui";
import { Onboard, SahamTab, StockActivate, StockAdd, StockDetail, StockFeeSheet, StockManualSheet, StockTradeSheet } from "./fin-saham";
import { percent, portfolio, stockValue, useStocks } from "../../lib/finance/stocks";
import type { CustomerProfile } from "../../lib/identity-adapter";
import type { WalletTransaction } from "../../lib/wallet-adapter";

export type FinSheet =
  | { k: "catat" } | { k: "entry"; id: string } | { k: "budget"; cid?: string } | { k: "goal"; id?: string } | { k: "goal-detail"; id: string }
  | { k: "debt"; id?: string } | { k: "split" } | { k: "streak" } | { k: "account"; id?: string } | { k: "category"; id?: string } | { k: "pay-category"; id: string }
  | { k: "bill"; id?: string } | { k: "bill-pay"; id: string } | { k: "asset"; id?: string } | { k: "asset-new"; noPhoto?: boolean } | { k: "loan"; id?: string; draft?: import("../../lib/finance/loans").LoanInput } | { k: "loan-view"; id: string } | { k: "loan-pay"; id: string; extra?: boolean } | { k: "loan-rate"; id: string } | { k: "stock-activate" } | { k: "stock-add"; ticker?: string; side?: "buy" | "sell"; first?: boolean } | { k: "stock-view"; ticker: string } | { k: "stock-trade"; id: string } | { k: "stock-fee" } | { k: "stock-manual"; ticker: string } | { k: "asset-view"; id: string } | { k: "pockets" } | { k: "pocket"; id?: string } | { k: "payoff" } | { k: "weekly" };

export type FinCtx = {
  fin: Finance; notify: Notify; nav: Nav; profile: CustomerProfile; transactions: WalletTransaction[]; payBalance: number; loading: boolean;
  visible: boolean; onToggleVisible: () => void; unread: number; onOpenNotifications: () => void; open: (s: FinSheet) => void; onPayDetail: (id: string) => void;
};

const COLORS: Record<string, string> = { orange: "#e8833a", blue: "#d14b1a", violet: "#eeb866", amber: "#d9a21a", rose: "#e0568a", indigo: "#e45825", cyan: "#16a3b8", emerald: "#1f9d62", slate: "#958a7d" };
export const useBalances = (state: FinanceState, entries: Entry[], payBalance: number) => useMemo(() => { const m: Record<string, number> = {}; for (const a of state.accounts) m[a.id] = accountBalance(a, entries, payBalance); m[PAY_ACCOUNT_ID] = payBalance; return m; }, [state.accounts, entries, payBalance]);
const SOURCE_LABEL: Record<Entry["source"], string> = { manual: "Manual", voice: "Suara", pay: "Djiwa Pay", receipt: "Scan struk", email: "Email", sheet: "Sheets" };
const sourceBadge = (s: Entry["source"]) => <span className={`dpx-tx-badge dpx-src-${s}`}>{SOURCE_LABEL[s] ?? "Manual"}</span>;
/** Corner mark on the category icon: up = money in, down = money out, ⇄ = moved between own accounts, ? = not sorted yet. */
function DirMark({ entry }: { entry: Entry }) {
  const unsorted = entry.kind !== "tf" && entry.categoryId === "lainnya";
  const [glyph, cls, label] = unsorted ? ["?", "q", "Belum dikategorikan"] : entry.kind === "in" ? ["↑", "in", "Pemasukan"] : entry.kind === "out" ? ["↓", "out", "Pengeluaran"] : ["⇄", "tf", "Pindah dana"];
  return <i className={`dpx-dir dpx-dir-${cls}`} role="img" aria-label={label} title={label}>{glyph}</i>;
}

export function EntryRow({ entry, state, onOpen, i = 0, fresh = false }: { entry: Entry; state: FinanceState; onOpen: (id: string) => void; i?: number; fresh?: boolean }) {
  const c = catOf(state, entry.categoryId);
  const sign = entry.kind === "in" ? "+" : entry.kind === "out" ? "−" : "";
  return <Btn type="button" className="dpx-row" onClick={() => onOpen(entry.id)} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: Math.min(i, 10) * 0.04 }} whileTap={{ scale: 0.985, backgroundColor: "rgba(45,36,29,.04)" }}>
    <span className="dpx-ent-av"><CatIcon cat={c} /><DirMark entry={entry} /></span>
    <span className="dpx-main"><b>{entry.note || c.name}</b><span>{entry.kind === "tf" ? "Transfer" : c.name} · {accName(state, entry.accountId)}{sourceBadge(entry.source)}{fresh ? <span className="dpx-tx-badge dpx-new">Baru</span> : null}</span></span>
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
    { img: <Mascot px={170} style={{ filter: "drop-shadow(0 16px 24px rgba(45,36,29,.18))" }} />, title: "Tahu uangmu pergi ke mana.", sub: "Catat dengan satu kalimat, lihat anggaran, dan semua pembayaran Djiwa Pay otomatis tercatat.", body: null, cta: "Mulai" },
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
  const inbound = useInbound();
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
  const plan = useMemo(() => {
    const day = now.getDate(), total = daysIn(y, m), spent = t.out, perDay = day ? spent / day : 0;
    const prevToDate = prev.filter((e) => e.kind === "out" && new Date(e.at).getDate() <= day).reduce((n, e) => n + e.amount, 0);
    const past = monthlySeries(entries, 4, now).slice(0, 3).filter((x) => x.out > 0), avgPrev = past.length ? past.reduce((n, x) => n + x.out, 0) / past.length : null;
    const basis = avgPrev ?? (perDay * total || null), suggested = basis ? Math.max(250_000, Math.round(basis / 250_000) * 250_000) : null;
    const top = [...spendByCategory(month)].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([id, amount]) => ({ id, name: catOf(state, id).name, amount, pct: spent ? Math.round((amount / spent) * 100) : 0 }));
    return { day, total, spent, perDay, projected: perDay * total, prevToDate, prevOut: pt.out, avgPrev, suggested, top };
  }, [entries, month, prev, state.categories]);   // eslint-disable-line react-hooks/exhaustive-deps
  const over = safe ? safe.left < 0 : false;
  const remaining = t.in - t.out;
  const showIncomeBased = t.in > 0;
  const goldData = useGold();
  const cashNow = useCash(ctx), stocksNow = useStocks(), wealth = netWorth(state, cashNow, stockValue(stocksNow.state));
  const trend = pt.out > 0 ? Math.round(((t.out - pt.out) / pt.out) * 100) : null;
  const quotes = useMemo(() => quoteDeck(), []);
  const history = useMemo(() => wealthHistory(state, entries, cashNow, goldData?.points ?? null, 12, now), [state, entries, cashNow, goldData]);
  const sinceStart = history.length >= 2 ? wealth.total - history[history.length - 2].value : null;
  const monthName = now.toLocaleDateString("id-ID", { month: "long" });
  return <div className="dpx-page"><Sky scene={daypart(now)}><div className="dpx-pad">
    <div className="dpx-st-sky">
      <div className="dpx-hdr" style={{ paddingTop: 0 }}>
        <Btn type="button" className="dpx-av" onClick={() => nav.go("/akun")} aria-label="Akun saya"><Avatar url={profile.photo_url} initial={firstName(profile.name, profile.email)[0]?.toUpperCase() ?? ""} /></Btn><div className="dpx-grow" />
        <Btn type="button" className="dpx-pill-info" onClick={() => ctx.open({ k: "streak" })} aria-label={`Streak ${st.count} hari`}><Ic n="flame" size="sm" /> {st.count}</Btn>
        <Btn type="button" className="dpx-rb" onClick={ctx.onOpenNotifications} aria-label={`Notifikasi${ctx.unread ? `, ${ctx.unread} belum dibaca` : ""}`}><Wiggle active={ctx.unread > 0}><Ic n="bell" /></Wiggle>{ctx.unread ? <span className="dpx-bd">{ctx.unread > 9 ? "9+" : ctx.unread}</span> : null}</Btn>
      </div>
      <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.05 }} className="dpx-title dpx-onsky" style={{ fontSize: 24, letterSpacing: "-.035em", marginTop: 6 }}>{greeting(now)}, {firstName(profile.name, profile.email)}.</motion.h1>
      <div className="dpx-flex dpx-mt8 dpx-onsky" style={{ color: "var(--mute)", font: "600 13px var(--font)" }}>Total kekayaan
        <Btn type="button" onClick={ctx.onToggleVisible} aria-label={ctx.visible ? "Sembunyikan angka" : "Tampilkan angka"} aria-pressed={!ctx.visible}><IconSwap k={ctx.visible ? "eye" : "eyeoff"}><Ic n={ctx.visible ? "eye" : "eyeoff"} size="sm" /></IconSwap></Btn></div>
      <div className="dpx-onsky" style={{ marginTop: 6 }}><span className="dpx-display" style={{ fontSize: 40 }}><small>Rp</small>{ctx.visible ? <>{wealth.total < 0 ? "−" : ""}<AnimatedNumber value={Math.abs(wealth.total)} /></> : "•••••••"}</span></div>
      {ctx.visible && sinceStart !== null ? <div className="dpx-sub dpx-mt8 dpx-onsky" style={{ fontSize: 13 }}><b className={sinceStart >= 0 ? "dpx-up" : "dpx-dn"}>{sinceStart >= 0 ? "▲ +" : "▼ −"}{rupiah(Math.abs(sinceStart))}</b> sejak akhir bulan lalu</div> : null}
      {ctx.visible ? <div className="dpx-sub dpx-onsky" style={{ fontSize: 13, marginTop: 4 }}>Dompet {rupiah(wealth.cash)} · Aset {rupiah(wealth.assets)}{wealth.receivables ? ` · Piutang ${rupiah(wealth.receivables)}` : ""}{wealth.liabilities ? ` · Hutang −${rupiah(wealth.liabilities)}` : ""}</div> : null}
      <div className="dpx-st-mascot"><MascotBuddy quotes={quotes} messages={[
        `Halo ${firstName(profile.name, profile.email)}! Ketuk aku kalau butuh tips.`,
        over ? "Anggaran bulan ini sudah terlampaui. Tahan belanja dulu ya." : safe ? `Aman dibelanjakan hari ini ${ctx.visible ? rupiah(safe.perDay) : "•••••"}.` : "Atur anggaran dulu, nanti aku hitung jatah harianmu.",
        st.count > 0 ? `Streak ${st.count} hari. Jangan putus ya!` : "Catat satu pengeluaran hari ini untuk mulai streak.",
        "Tulis “kopi 25rb” di kolom catat, aku bantu rapikan.",
      ]} /></div>
      <div className="dpx-st-hint dpx-onsky">Cerita {monthName} ada di bawah ↓</div>
    </div>
    <CeritaBody ctx={ctx} entries={entries} cash={cashNow} gold={goldData} now={now} templates={templates} onAddTemplate={addTemplate} />
  </div></Sky></div>;
}

function Ring({ percent, big, small, color }: { percent: number; big: string; small: string; color: string }) {
  const r = 54, c = 2 * Math.PI * r;
  return <div className="dpx-ring"><svg viewBox="0 0 132 132"><circle cx="66" cy="66" r={r} fill="none" stroke="rgba(45,36,29,.08)" strokeWidth="13" /><motion.circle cx="66" cy="66" r={r} fill="none" stroke={color} strokeWidth="13" strokeLinecap="round" strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - Math.min(percent, 100) / 100) }} transition={{ duration: 1, ease: [0.32, 0.72, 0, 1] }} /></svg><div className="dpx-c"><div><b>{big}</b><span>{small}</span></div></div></div>;
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
  const [cursor, setCursor] = useState(() => {   // ?bulan=2026-05 opens that month (e.g. from "Lihat di Catatan" after approving imported mail)
    const m = /^(\d{4})-(\d{2})$/.exec(new URLSearchParams(window.location.search).get("bulan") ?? "");
    return m && Number(m[2]) >= 1 && Number(m[2]) <= 12 ? { y: Number(m[1]), m: Number(m[2]) - 1 } : { y: today.getFullYear(), m: today.getMonth() };
  });
  const [seg, setSeg] = useState<"all" | "in" | "out" | "tf">("all");
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [acc, setAcc] = useState("all");
  const [sheet, setSheet] = useState<null | "filter" | "wallet">(null);
  const balances = useBalances(state, entries, ctx.payBalance);
  // Entries the person has not yet seen that came in by e-mail on their own; opened from the "catatan baru dari email" notice.
  const [fresh] = useState(() => { const seen = readAutoSeen(); return new Set(entries.filter((e) => e.source === "email" && e.createdAt && Date.now() - Date.parse(e.createdAt) < 36 * 36e5 && (!seen || Date.parse(e.createdAt) > Date.parse(seen))).map((e) => e.id)); });
  useEffect(() => { if (new URLSearchParams(window.location.search).get("baru") === "1") markAutoSeen(); }, []);   // opening from the e-mail notice counts as seen; rows keep their "Baru" mark for this visit
  const month = entries.filter((e) => inMonth(e, cursor.y, cursor.m));
  const inWallet = (e: Entry) => acc === "all" || e.accountId === acc || e.toAccountId === acc;
  const t = totals(month.filter(inWallet));
  const isCurrent = cursor.y === today.getFullYear() && cursor.m === today.getMonth();
  const shift = (d: number) => setCursor((c) => { const n = new Date(c.y, c.m + d, 1); return { y: n.getFullYear(), m: n.getMonth() }; });
  const list = month.filter((e) => inWallet(e) && (seg === "all" || e.kind === seg) && (cat === "all" || e.categoryId === cat) && (!q || `${e.note} ${catOf(state, e.categoryId).name} ${accName(state, e.accountId)} ${e.tags.join(" ")}`.toLowerCase().includes(q.toLowerCase())));
  const days = [...new Set(list.map((e) => dayLabel(e.at)))];
  // Which months hold records, newest first: imported mail lands in past months that the month view would otherwise hide.
  const monthsWith = useMemo(() => { const c = new Map<string, number>(); for (const e of entries) { const d = new Date(e.at); const k = `${d.getFullYear()}-${d.getMonth()}`; c.set(k, (c.get(k) ?? 0) + 1); } return [...c].map(([k, n]) => { const [y, mo] = k.split("-").map(Number); return { y, m: mo, n }; }).sort((a, b) => b.y * 12 + b.m - (a.y * 12 + a.m)); }, [entries]);
  const showStrip = monthsWith.length > 1 || (monthsWith.length === 1 && month.length === 0);
  return <div className="dpx-page"><Sky><div className="dpx-pad">
    <div className="dpx-hdr" style={{ paddingTop: 0 }}><h1 className="dpx-page-title" style={{ flex: 1 }}>Catatan</h1><Btn type="button" className="dpx-rb" onClick={() => nav.go("/ringkasan")} aria-label="Laporan"><Ic n="chart" /></Btn></div>
    <div className="dpx-spread" style={{ margin: "2px 0 4px" }}><Btn type="button" className="dpx-rb" onClick={() => shift(-1)} aria-label="Bulan sebelumnya"><Ic n="back" size="sm" /></Btn><b style={{ fontSize: 17, textTransform: "capitalize" }}>{monthLabel(cursor.y, cursor.m)}</b><Btn type="button" className="dpx-rb" style={isCurrent ? { opacity: 0.4 } : undefined} disabled={isCurrent} onClick={() => shift(1)} aria-label="Bulan berikutnya"><Ic n="chev" size="sm" /></Btn></div>
    {showStrip ? <div className="dpx-chips dpx-mt8" role="group" aria-label="Bulan yang punya catatan">{monthsWith.slice(0, 24).map((x) => { const on = x.y === cursor.y && x.m === cursor.m; return <Btn key={`${x.y}-${x.m}`} type="button" className={`dpx-chip ${on ? "dpx-on" : ""}`} aria-pressed={on} onClick={() => setCursor({ y: x.y, m: x.m })}>{monthLabel(x.y, x.m)} · {x.n}</Btn>; })}</div> : null}
    {month.length === 0 && entries.length > 0 ? <div className="dpx-note dpx-info" style={{ marginTop: 8 }} role="status"><Ic n="info" /><div><b>Tidak ada catatan di {monthLabel(cursor.y, cursor.m)}.</b> Ada {entries.length} catatan di bulan lain.<div className="dpx-flex" style={{ marginTop: 8 }}><Btn type="button" className="dpx-btn dpx-sm" style={{ margin: 0 }} onClick={() => setCursor({ y: monthsWith[0].y, m: monthsWith[0].m })}>Lihat {monthLabel(monthsWith[0].y, monthsWith[0].m)}</Btn></div></div></div> : null}
    <div className="dpx-kpi"><div className="dpx-group"><small>Masuk</small><b className="dpx-up">{ctx.visible ? rupiah(t.in) : "•••••"}</b></div><div className="dpx-group"><small>Keluar</small><b>{ctx.visible ? rupiah(t.out) : "•••••"}</b></div></div>
    <label className="dpx-search dpx-mt"><Ic n="search" size="sm" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari catatan, kategori, dompet" aria-label="Cari catatan" /></label>
    <div className="dpx-chips dpx-mt8"><Btn type="button" className={`dpx-chip ${cat !== "all" ? "dpx-on" : ""}`} onClick={() => setSheet("filter")}><Ic n="filter" size="sm" /> {cat === "all" ? "Kategori" : catOf(state, cat).name}</Btn><Btn type="button" className={`dpx-chip ${acc !== "all" ? "dpx-on" : ""}`} onClick={() => setSheet("wallet")}><Ic n="wallet" size="sm" /> {acc === "all" ? "Dompet" : accName(state, acc)}</Btn>{cat !== "all" || acc !== "all" ? <Btn type="button" className="dpx-chip" onClick={() => { setCat("all"); setAcc("all"); }}>Reset filter</Btn> : null}</div>
    <div className="dpx-mt8"><Seg id="rec" label="Jenis catatan" value={seg} onChange={setSeg} options={[["all", "Semua"], ["in", "Masuk"], ["out", "Keluar"], ["tf", "Transfer"]] as const} /></div>
    <div aria-live="polite">{entries.length === 0 ? <Empty img="order-receipt" title="Belum ada catatan" text="Catat pengeluaran pertamamu — satu kalimat cukup. Pembayaran Djiwa Pay otomatis ikut tercatat."><Btn type="button" className="dpx-btn" style={{ maxWidth: 300 }} onClick={() => ctx.open({ k: "catat" })}><Ic n="plus" size="sm" /> Catat sekarang</Btn></Empty>
      : list.length === 0 ? <Empty img="restaurant-cafe" title="Tidak ada hasil" text="Coba ubah bulan, kata kunci, atau filter." />
      : days.map((d) => { const items = list.filter((e) => dayLabel(e.at) === d); const spent = items.filter((e) => e.kind === "out").reduce((s, e) => s + e.amount, 0); return <div key={d}><div className="dpx-dayh"><span>{d}</span><span>{spent ? `−${rupiah(spent)}` : ""}</span></div><div className="dpx-group dpx-flush dpx-white">{items.map((e, i) => <EntryRow key={e.id} entry={e} state={state} i={i} fresh={fresh.has(e.id)} onOpen={(id) => ctx.open({ k: "entry", id })} />)}</div></div>; })}</div>
  </div></Sky>
  <AnimatePresence>{sheet === "wallet" ? <AccountSheet key="w" state={state} balances={balances} value={acc} includePay allLabel="Semua dompet" title="Filter dompet" onPick={setAcc} onClose={() => setSheet(null)} /> : null}{sheet === "filter" ? <CategorySheet key="f" categories={[{ id: "all", name: "Semua", icon: "grid", tone: "slate", income: false }, ...state.categories]} income={false} value={cat} onPick={setCat} onClose={() => setSheet(null)} /> : null}</AnimatePresence>
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
export { FinBudget } from "./fin-plan";

/* ---------- Kekayaan (Brankas) ---------- */
type VaultTab = "aset" | "saham" | "dompet" | "kewajiban";
const needsOpening = (a: { opening: number }, bal?: number) => a.opening === 0 && (bal === undefined || bal < 0);

export function FinWallet({ ctx }: { ctx: FinCtx }) {
  const { fin, nav } = ctx; const { state, entries } = fin;
  const gold = useGold();
  const balances = useBalances(state, entries, ctx.payBalance);
  const accounts = state.accounts.filter((a) => !a.archived);
  const stocks = useStocks(), stockPf = portfolio(stocks.state), hasStocks = Boolean(stocks.state?.activated && stockPf.rows.length);
  const cash = useCash(ctx); const nw = netWorth(state, cash, stockValue(stocks.state)), net = nw.total;
  const debt = debtTotals(state.debts);
  const [tab, setTab] = useState<VaultTab>(() => { try { const t = sessionStorage.getItem("dpx-vault-tab"); return t === "dompet" || t === "kewajiban" || t === "saham" ? t : "aset"; } catch { return "aset"; } });
  const pick = (t: VaultTab) => { setTab(t); try { sessionStorage.setItem("dpx-vault-tab", t); } catch { /* optional */ } };
  useEffect(() => {   // back from Google's consent screen with the Drive permission: continue where the person left off
    const q = new URLSearchParams(window.location.search), part = q.get("bagian");
    if (part === "aset" || part === "saham" || part === "dompet" || part === "kewajiban") { window.history.replaceState({}, "", window.location.pathname); pick(part); return; }
    if (q.get("saham") !== "aktifkan") return;
    window.history.replaceState({}, "", window.location.pathname);
    pick("saham"); ctx.open({ k: "stock-activate" });
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  const change = useMemo(() => assetsChange(state.assets, gold?.points ?? null), [state.assets, gold]);
  const changePct = change && net - change.delta !== 0 ? (change.delta / Math.abs(net - change.delta)) * 100 : null;
  const rows = useMemo(() => state.assets.map((a) => ({ a, v: assetValue(a, gold?.points ?? null), g: gainOf(a) })), [state.assets, gold]);
  const sv = hasStocks ? stockPf.value : 0, sc = hasStocks ? stockPf.cost : 0;
  const assetTotal = rows.reduce((s, r) => s + r.v, 0), cost = rows.reduce((s, r) => s + (r.a.cost ?? 0), 0), costed = rows.reduce((s, r) => s + (r.a.cost ? r.v : 0), 0);
  const costAll = cost + sc, valueAll = costed + (hasStocks ? (stockPf.priced ? sv : sc) : 0), gainPct = costAll > 0 ? ((valueAll - costAll) / costAll) * 100 : null;
  const totalAll = assetTotal + sv;
  const byKind = useMemo(() => { const m = new Map<string, number>(); for (const r of rows) m.set(r.a.kind, (m.get(r.a.kind) ?? 0) + r.v); if (sv > 0) m.set("stock", (m.get("stock") ?? 0) + sv); return [...m.entries()].sort((x, y) => y[1] - x[1]); }, [rows, sv]);
  const shelves: typeof rows[] = []; for (let i = 0; i < rows.length; i += 3) shelves.push(rows.slice(i, i + 3));
  const missing = accounts.filter((a) => needsOpening(a, balances[a.id]));
  const acts: [string, string, string][] = [["topup", "Isi saldo", "/wallet/topup"], ["send", "Kirim", "/wallet/transfer"], ["receive", "Terima", "/wallet/receive"], ["scan-qr", "Scan QR", "/wallet/transfer?mode=scan"]];
  const m = (s: string) => (ctx.visible ? s : "•••••");
  const KIND_COLORS = ["#d9a21a", "#c9461b", "#16a3b8", "#13804a", "#958a7d", "#e0568a", "#eeb866"];
  return <div className="dpx-page"><Sky><div className="dpx-pad">
    <div className="dpx-hdr" style={{ paddingTop: 0 }}><h1 className="dpx-page-title" style={{ flex: 1 }}>Kekayaan</h1></div>
    <motion.div className="dpx-vt-net" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="dpx-sub">Kekayaan bersih</div>
        <div className="dpx-vt-amt"><small>Rp</small>{ctx.visible ? <>{net < 0 ? "−" : ""}<AnimatedNumber value={Math.abs(net)} /></> : "•••••••"}
          <Btn type="button" onClick={ctx.onToggleVisible} aria-label={ctx.visible ? "Sembunyikan saldo" : "Tampilkan saldo"} style={{ color: "var(--mute)" }}><IconSwap k={ctx.visible ? "eye" : "eyeoff"}><Ic n={ctx.visible ? "eye" : "eyeoff"} size="sm" /></IconSwap></Btn></div>
      </div>
      {ctx.visible && hasStocks && stockPf.priced ? <div style={{ textAlign: "right" }}><div className={stockPf.pl >= 0 ? "dpx-up" : "dpx-dn"} style={{ fontWeight: 700 }}>{percent(stockPf.plPct)}</div><div className="dpx-sub">saham</div></div> : ctx.visible && change && changePct !== null ? <div style={{ textAlign: "right" }}><div className={change.delta >= 0 ? "dpx-up" : "dpx-dn"} style={{ fontWeight: 700 }}>{change.delta >= 0 ? "▲" : "▼"} {Math.abs(changePct).toFixed(1).replace(".", ",")}%</div><div className="dpx-sub">aset 30 hari</div></div> : null}
    </motion.div>
    <Seg id="vault-tab" label="Bagian kekayaan" fit value={tab} onChange={pick} options={[["aset", `Aset · ${state.assets.length}`], ["saham", <>Saham{hasStocks ? ` · ${stockPf.rows.length}` : null}{stocks.loaded && !stocks.state?.activated ? <i className="dpx-sk-dot" aria-label="baru" /> : null}</>], ["dompet", `Dompet · ${accounts.length + 1}`], ["kewajiban", "Kewajiban"]] as const} />

    {tab === "aset" ? <div key="aset" className="dpx-vt-pn">
      {rows.length === 0 && !hasStocks ? <Onboard asset="scan" title="Simpan nilai aset Anda" desc="Foto emas, perhiasan, atau aset lain. Latarnya dipotong jadi stiker, lalu nilainya dipantau di sini."
        bullets={[["Stiker di rak, ", "seperti koleksi pribadi."], ["Nilai emas otomatis ", "mengikuti harga pasar."], ["Ikut dihitung ", "ke kekayaan bersih."]]}
        primary="Foto aset pertama" onPrimary={() => ctx.open({ k: "asset-new" })} secondary="Isi manual tanpa foto" onSecondary={() => ctx.open({ k: "asset-new", noPhoto: true })} /> : <>
      {shelves.map((row, si) => <div className="dpx-vt-shelf" key={si}>{row.map(({ a, v, g }, i) => <motion.button type="button" key={a.id} className="dpx-vt-slot" onClick={() => ctx.open({ k: "asset-view", id: a.id })} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: (si * 3 + i) * 0.05 }} whileTap={{ scale: 0.95 }}>
        <span className="dpx-vt-stk"><Sticker asset={a} size={72} /></span><b>{a.name}</b><span className="dpx-sub">{m(rupiah(v))}</span>{g ? <span className={g.pct >= 0 ? "dpx-up" : "dpx-dn"} style={{ fontSize: 10.5, fontWeight: 700 }}>{g.pct >= 0 ? "▲" : "▼"} {Math.abs(g.pct).toFixed(1).replace(".", ",")}%</span> : <span className="dpx-sub" style={{ fontSize: 10.5 }}>{ASSET_KINDS[a.kind].label}</span>}</motion.button>)}</div>)}
      <div className="dpx-vt-shelf"><button type="button" className="dpx-vt-slot dpx-vt-add" onClick={() => ctx.open({ k: "asset-new" })}><span className="dpx-vt-stk"><span className="dpx-vt-plus"><Ic n="plus" /></span></span><b style={{ color: "var(--mute)" }}>Foto aset</b></button></div>
      {rows.length || hasStocks ? <div className="dpx-group dpx-white dpx-vt-sum">
        <div className="dpx-sub">Nilai semua aset</div><div className="dpx-vt-sumamt">{m(rupiah(totalAll))}</div>
        <div className="dpx-sub">{costAll > 0 && gainPct !== null ? <>Modal {m(rupiah(costAll))} · {ctx.visible ? <span className={gainPct >= 0 ? "dpx-up" : "dpx-dn"} style={{ fontWeight: 700 }}>{gainPct >= 0 ? "▲ +" : "▼ −"}{Math.abs(gainPct).toFixed(1).replace(".", ",")}%</span> : "•••"}</> : `${rows.length} aset`}</div>
        <div className="dpx-vt-bar" role="img" aria-label="Komposisi aset">{byKind.map(([k, v], i) => <i key={k} style={{ width: `${totalAll ? (v / totalAll) * 100 : 0}%`, background: KIND_COLORS[i % KIND_COLORS.length] }} />)}</div>
        <div className="dpx-vt-leg">{byKind.map(([k, v], i) => <span key={k}><i style={{ background: KIND_COLORS[i % KIND_COLORS.length] }} />{ASSET_KINDS[k as keyof typeof ASSET_KINDS].label} {totalAll ? Math.round((v / totalAll) * 100) : 0}%</span>)}</div>
        <div className="dpx-vt-sumacts">
          {hasStocks ? <Btn type="button" className="dpx-btn dpx-ghost" onClick={() => pick("saham")}>Lihat saham</Btn> : null}
          <Btn type="button" className="dpx-btn dpx-ghost" onClick={() => nav.go("/aset")}>Nilai &amp; grafik</Btn>
        </div>
      </div> : null}
      </>}
    </div> : null}

    {tab === "saham" ? <SahamTab ctx={ctx} /> : null}

    {tab === "dompet" ? <div key="dompet" className="dpx-vt-pn">
      {accounts.length === 0 ? <Onboard asset="wallet" title="Kumpulkan semua dompet" desc="Tunai, rekening bank, dan e-wallet dalam satu tempat, supaya saldo dan kekayaan bersih akurat."
        bullets={[["Saldo awal ", "membuat angka kekayaan benar."], ["Djiwa Pay ", "sudah ada sebagai dompet utama."], ["Transfer antar dompet ", "tercatat otomatis."]]}
        primary="Tambah dompet pertama" onPrimary={() => ctx.open({ k: "account" })} /> : null}
      <WalletDeck ctx={ctx} accounts={accounts} balances={balances} />
      {missing.length ? <div className="dpx-vt-note"><Ic n="warn" /><span>{missing.length} rekening hanya berisi pengeluaran tercatat, jadi saldonya minus. Ketuk rekening lalu isi saldo awal agar kekayaan bersih akurat.</span></div> : null}
    <div className="dpx-sec"><h2>Bayar & layanan</h2><Btn type="button" onClick={() => nav.go("/bayar")}>Semua layanan</Btn></div>
    <div className="dpx-group"><div className="dpx-tile3" style={{ gridTemplateColumns: "repeat(4,1fr)", gap: 6 }}>{acts.map(([a, l, p]) => <Btn key={a} type="button" className="dpx-q" onClick={() => nav.go(p)}><img src={payAsset(a)} width={42} height={42} alt="" />{l}</Btn>)}</div></div>
    <Btn type="button" className="dpx-group dpx-flex" style={{ width: "100%", marginTop: 12, textAlign: "left" }} onClick={() => nav.openSheet("card")}><img src={payAsset("card")} width={56} height={56} alt="" /><span style={{ flex: 1 }}><b style={{ fontSize: 16 }}>Kartu Djiwa</b><div className="dpx-sub">Kartu virtual untuk belanja online.</div></span><span className="dpx-tag">Segera</span></Btn>
    </div> : null}

    {tab === "kewajiban" ? <div key="kewajiban" className="dpx-vt-pn">
      {state.debts.length === 0 && state.bills.length === 0 && state.loans.length === 0 ? <Onboard asset="users" title="Catat hutang, piutang, dan tagihan" desc="Semua yang harus kamu bayar atau akan kamu terima, di satu tempat: pinjaman, KPR, cicilan, dan tagihan bulanan."
        bullets={[["Hutang dan piutang ", "dipisah dengan jelas, cicilan dicatat sebagian-sebagian."], ["Tagihan bulanan ", "(listrik, internet, kartu) lengkap dengan jatuh tempo."], ["Dari email ", "tagihan baru diusulkan otomatis, kamu yang menyetujui."]]}
        notice={<Btn type="button" className="dpx-linkbtn" style={{ margin: "4px 0 2px" }} onClick={() => ctx.open({ k: "loan" })}>Punya KPR atau cicilan? Tambah pinjaman ›</Btn>} primary="Catat hutang atau piutang" onPrimary={() => ctx.open({ k: "debt" })} secondary="Tambah tagihan bulanan" onSecondary={() => ctx.open({ k: "bill" })} /> : <KewajibanPanel ctx={ctx} />}
      <p className="dpx-sub" style={{ margin: "8px 4px 0" }}>Perkiraan berdasarkan catatanmu, bukan nasihat keuangan.</p>
    </div> : null}
    {tab === "aset" ? <div className="dpx-vt-fab"><motion.button type="button" className="dpx-vt-photo" onClick={() => ctx.open({ k: "asset-new" })} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={spring} whileTap={{ scale: 0.95 }}><Ic n="scan" size="sm" /> Foto aset</motion.button></div> : tab === "saham" && hasStocks ? <div className="dpx-vt-fab"><motion.button type="button" className="dpx-vt-photo" onClick={() => ctx.open({ k: "stock-add" })} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={spring} whileTap={{ scale: 0.95 }}><Ic n="plus" size="sm" /> Catat saham</motion.button></div> : null}
  </div></Sky></div>;
}

export { FinReport } from "./fin-report";

/* ---------- Pengaturan keuangan ---------- */
export function FinSettings({ ctx, onBack }: { ctx: FinCtx; onBack: () => void }) {
  const { fin } = ctx; const { state, entries } = fin;
  const [confirmReset, setConfirmReset] = useState(false);
  const file = (name: string, type: string, content: string) => { const url = URL.createObjectURL(new Blob([content], { type })); const a = document.createElement("a"); a.href = url; a.download = name; a.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); };
  const importJson = (f: File | undefined) => { if (!f) return; void f.text().then((txt) => { try { const next = normalize(JSON.parse(txt)); fin.dispatch({ type: "import", state: { ...next, onboarded: true } }); ctx.notify(`Data dipulihkan: ${next.entries.length} catatan`); } catch { ctx.notify("Berkas cadangan tidak valid"); } }); };
  return <div className="dpx-page"><Sky><div className="dpx-pad dpx-nobar">
    <Header title="Pengaturan keuangan" onBack={onBack} />
    {fin.sync.status === "loan-conflict" || fin.loanConflict ? <div className="dpx-note" role="status"><Ic n="warn" /><div>Pinjaman diperbarui dari email. Periksa riwayat sebelum mencatat angsuran atau mengulang perubahan pinjaman. {fin.sync.status === "loan-conflict" ? <Btn type="button" className="dpx-chip3" onClick={() => void fin.retrySync()}>Muat data terbaru</Btn> : null}</div></div> : null}
    <div className="dpx-note dpx-info" style={{ marginTop: 6 }} role="status"><Ic n="shield" /><div><b>{fin.sync.status === "ok" ? "Tersinkron ke akun Djiwa Pay." : fin.sync.status === "syncing" || fin.sync.status === "starting" ? "Menyinkronkan…" : "Belum tersinkron — data aman di perangkat ini."}</b> Catatan disimpan di perangkat dan dicadangkan otomatis ke server Djiwa Pay, jadi tetap ada saat ganti perangkat.{fin.sync.status === "offline" ? <> <Btn type="button" className="dpx-chip3" onClick={() => void fin.retrySync()}>Coba lagi</Btn></> : null}</div></div>
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
    {confirmReset ? <div className="dpx-note dpx-danger" role="alert"><Ic n="warn" /><div><b>Hapus semua data keuangan (perangkat dan server)?</b> Tidak bisa dibatalkan. Transaksi Djiwa Pay tidak terpengaruh.<div className="dpx-flex" style={{ marginTop: 10 }}><Btn type="button" className="dpx-btn dpx-danger dpx-sm" onClick={() => { fin.dispatch({ type: "reset" }); setConfirmReset(false); ctx.notify("Data keuangan dihapus"); onBack(); }}>Hapus semua</Btn><Btn type="button" className="dpx-btn dpx-soft dpx-sm" onClick={() => setConfirmReset(false)}>Batal</Btn></div></div></div> : null}
  </div></Sky></div>;
}

/* ---------- sheet host ---------- */
export function FinSheetHost({ ctx, sheet, close, goManual, openPaySheet }: { ctx: FinCtx; sheet: FinSheet | null; close: () => void; goManual: (kind: Kind, editId?: string) => void; openPaySheet: () => void }) {
  const { fin, notify } = ctx; const { state, entries } = fin;
  const balances = useBalances(state, entries, ctx.payBalance);
  const suggested = useMemo(() => { const now = new Date(); const out: Record<string, number> = {}; for (let i = 1; i <= 3; i++) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); for (const [id, v] of spendByCategory(entries.filter((e) => inMonth(e, d.getFullYear(), d.getMonth())))) out[id] = (out[id] ?? 0) + v / 3; } for (const k of Object.keys(out)) out[k] = Math.round(out[k] / 1000) * 1000; return out; }, [entries]);
  if (!sheet) return null;
  switch (sheet.k) {
    case "catat": return <CatatSheet key="catat" fin={fin} notify={notify} balances={balances} onClose={close} onManual={(k) => { close(); goManual(k); }} onPay={() => { close(); openPaySheet(); }} onAsset={() => { close(); ctx.open({ k: "asset-new" }); }} />;
    case "entry": { const e = entries.find((x) => x.id === sheet.id); if (!e) return null; return <EntrySheet key="entry" entry={e} fin={fin} notify={notify} onClose={close} onEdit={() => { close(); goManual(e.kind, e.id); }} onPickCategory={() => ctx.open({ k: "pay-category", id: e.id })} />; }
    case "pay-category": { const e = entries.find((x) => x.id === sheet.id); if (!e) return null; return <CategorySheet key="paycat" categories={state.categories} income={e.kind === "in"} value={e.categoryId} onPick={(id) => { fin.dispatch({ type: "override/set", id: e.id, override: { categoryId: id } }); notify("Kategori diubah"); }} onClose={close} />; }
    case "budget": return <BudgetSheet key="budget" fin={fin} categoryId={sheet.cid} suggested={suggested} notify={notify} onClose={close} />;
    case "goal": return <GoalSheet key="goal" fin={fin} goal={state.goals.find((g) => g.id === sheet.id)} notify={notify} onClose={close} />;
    case "goal-detail": { const g = state.goals.find((x) => x.id === sheet.id); return g ? <GoalDetailSheet key="gd" fin={fin} goal={g} notify={notify} onClose={close} onEdit={() => ctx.open({ k: "goal", id: g.id })} /> : null; }
    case "debt": return <DebtSheet key="debt" fin={fin} debt={state.debts.find((d) => d.id === sheet.id)} notify={notify} onClose={close} />;
    case "bill": { const loan = state.loans.find((l) => (l.billId ?? `ln-${l.id}`) === sheet.id); if (loan) return <LoanDetail key={`lv-${loan.id}`} ctx={ctx} id={loan.id} onClose={close} />; return <BillSheet key="bill" fin={fin} bill={state.bills.find((b) => b.id === sheet.id)} notify={notify} onClose={close} />; }
    case "bill-pay": { const loan = state.loans.find((l) => (l.billId ?? `ln-${l.id}`) === sheet.id); if (loan) return <LoanPaySheet key={`lp-${loan.id}`} ctx={ctx} loan={loan} extra={false} onClose={close} />; const b = state.bills.find((x) => x.id === sheet.id); return b ? <BillPaySheet key="billpay" fin={fin} bill={b} notify={notify} onClose={close} goPay={() => ctx.nav.go("/bayar")} accounts={[{ id: PAY_ACCOUNT_ID, name: "Djiwa Pay" }, ...state.accounts.filter((a) => !a.archived).map((a) => ({ id: a.id, name: a.name }))]} /> : null; }
    case "asset": case "asset-new": return <AssetFlow key={`asset-${"id" in sheet ? sheet.id ?? "" : ""}`} fin={fin} asset={"id" in sheet ? state.assets.find((a) => a.id === sheet.id) : undefined} noPhoto={sheet.k === "asset-new" && sheet.noPhoto} notify={notify} onClose={close} />;
    case "loan": return <LoanSheet key={`loan-${sheet.id ?? "new"}`} fin={fin} loan={state.loans.find((l) => l.id === sheet.id)} draft={sheet.draft} notify={notify} onClose={close} />;
    case "loan-view": return <LoanDetail key={`lv-${sheet.id}`} ctx={ctx} id={sheet.id} onClose={close} />;
    case "loan-pay": { const l = state.loans.find((x) => x.id === sheet.id); return l ? <LoanPaySheet key={`lp-${sheet.id}-${sheet.extra ? "x" : "r"}`} ctx={ctx} loan={l} extra={Boolean(sheet.extra)} onClose={() => ctx.open({ k: "loan-view", id: l.id })} /> : null; }
    case "loan-rate": { const l = state.loans.find((x) => x.id === sheet.id); return l ? <LoanRateSheet key="lr" fin={fin} loan={l} notify={notify} onClose={() => ctx.open({ k: "loan-view", id: l.id })} /> : null; }
    case "stock-activate": return <StockActivate key="st-act" ctx={ctx} onClose={close} />;
    case "stock-add": return <StockAdd key={`st-add-${sheet.ticker ?? ""}-${sheet.side ?? ""}`} ctx={ctx} ticker={sheet.ticker} side={sheet.side} first={sheet.first} onClose={close} />;
    case "stock-view": return <StockDetail key={`st-${sheet.ticker}`} ctx={ctx} ticker={sheet.ticker} onClose={close} />;
    case "stock-trade": return <StockTradeSheet key="st-trade" id={sheet.id} notify={notify} onClose={close} />;
    case "stock-fee": return <StockFeeSheet key="st-fee" notify={notify} onClose={close} />;
    case "stock-manual": return <StockManualSheet key="st-man" ticker={sheet.ticker} notify={notify} onClose={close} />;
    case "asset-view": { const a = state.assets.find((x) => x.id === sheet.id); if (!a) return null; return <AssetDetail key="asset-view" asset={a} loans={state.loans} visible={ctx.visible} onClose={close} onEdit={() => ctx.open({ k: "asset", id: a.id })} onDelete={() => { fin.dispatch({ type: "asset/delete", id: a.id }); close(); notify("Aset dihapus", () => fin.dispatch({ type: "asset/upsert", asset: a })); }} />; }
    case "pocket": return <PocketSheet key={`pocket-${sheet.id ?? ""}`} fin={fin} pocket={pocketsOf(state).find((p) => p.id === sheet.id)} others={pocketsOf(state)} notify={notify} onClose={close} />;
    case "pockets": return <PocketRuleSheet key="pockets" fin={fin} current={pocketsOf(state)} notify={notify} onClose={close} />;
    case "payoff": return <PayoffSheet key="payoff" debts={state.debts.filter((d) => !d.settled && d.direction === "i_owe").map((d) => ({ person: d.person, amount: debtRemaining(d) }))} onClose={close} />;
    case "weekly": return <WeeklySheet key="weekly" entries={entries} categoryName={(id) => catOf(state, id).name} onClose={close} />;
    case "split": return <SplitSheet key="split" notify={notify} onClose={close} />;
    case "streak": return <StreakSheet key="streak" entries={entries} onClose={close} onCatat={() => ctx.open({ k: "catat" })} />;
    case "account": return <AccountEditSheet key="acc" fin={fin} account={state.accounts.find((a) => a.id === sheet.id)} notify={notify} onClose={close} />;
    case "category": return <CategoryEditSheet key="cat" fin={fin} category={state.categories.find((c) => c.id === sheet.id)} notify={notify} onClose={close} />;
  }
}

export { emptyState };
