import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AnimatedNumber, Bar, Btn, Chev, Header, I3, IconSwap, Ic, Reveal, Row, Seg, Sheet, Sky, SuccessMark, Wiggle, ease, serviceIcon, serviceTone, spring, type IconName } from "./dpx-ui";
import { dayLabel, firstName, formatDateTime, formatTime, greeting, rupiah, signedRupiah, transactionTitle, transactionVisual } from "../../lib/djiwa-pay-format";
import { heatLevel, monthLabel, summarizeMonth, summaryCategory } from "../../lib/djiwa-pay-summary";
import { paymentMethodLabel, transactionMethodLine, type WalletNotification, type WalletTransaction } from "../../lib/wallet-adapter";
import { walletQuickActionState } from "../../lib/djiwa-pay-availability";
import type { CustomerProfile } from "../../lib/identity-adapter";

export const SERVICE_LIST = [
  ["pulsa", "Pulsa", "Semua operator"], ["data", "Paket Data", "Internet & kuota"], ["pln-token", "Token PLN", "Listrik prabayar"],
  ["pln-bill", "Tagihan PLN", "Listrik bulanan"], ["pdam", "PDAM", "Tagihan air"], ["bpjs", "BPJS", "Kesehatan"],
  ["tv", "TV & Streaming", "Langganan"], ["game", "Voucher Game", "Top up game"], ["multifinance", "Cicilan", "Pembiayaan"],
] as const;
const COMING_SOON = new Set(["bpjs", "tv", "multifinance"]);
const toneForVisual = (tone: string) => tone;

export type Nav = { go: (path: string) => void; openService: (key: string, label: string) => void; openSheet: (name: "pay" | "all" | "card" | "soon") => void };

/* ---------- small pieces ---------- */
function SkeletonBlock({ h, w }: { h: number; w?: number | string }) { return <div className="dpx-skel" style={{ height: h, width: w }} />; }

export function TxRow({ entry, onOpen, i = 0 }: { entry: WalletTransaction; onOpen: (id: string) => void; i?: number }) {
  const v = transactionVisual(entry);
  const pending = entry.status !== "success" && entry.status !== "completed";
  return <Btn type="button" className="dpx-row" onClick={() => onOpen(String(entry.id))} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: Math.min(i, 10) * 0.045 }} whileTap={{ scale: 0.985, backgroundColor: "rgba(15,35,71,.04)" }}>
    <span className={`dpx-cat dpx-c-${toneForVisual(v.tone)}`}><Ic n={v.icon as IconName} /></span>
    <span className="dpx-main"><b>{transactionTitle(entry)}</b><span>{transactionMethodLine(entry)}</span></span>
    <span className="dpx-trail"><b className={entry.direction === "credit" ? "dpx-in" : ""}>{entry.direct ? rupiah(entry.amount) : signedRupiah(entry.amount, entry.direction)}</b>{pending ? <span className="dpx-tag dpx-warn">Diproses</span> : formatTime(entry.created_at)}</span>
  </Btn>;
}

export function TabBar({ active, go, openPay }: { active: "home" | "services" | "history" | "wallet" | null; go: (path: string) => void; openPay: () => void }) {
  const items = [["home", "Beranda", "/", "navigation-home"], ["services", "Layanan", "/layanan", "order-receipt"], ["history", "Riwayat", "/riwayat", "navigation-history"], ["wallet", "Dompet", "/dompet", "navigation-wallet"]] as const;
  return <motion.nav className="dpx-tabbar" aria-label="Navigasi utama" initial={{ y: 90, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ ...spring, delay: 0.05 }}>
    {items.map(([key, label, path, icon]) => <Btn key={key} type="button" className={`dpx-tb ${active === key ? "dpx-on" : ""}`} aria-current={active === key ? "page" : undefined} onClick={() => go(path)}>{active === key ? <motion.span layoutId="dpx-tabpill" className="dpx-tabpill" transition={spring} /> : null}<motion.span style={{ display: "grid" }} animate={active === key ? { scale: 1.14, y: -1 } : { scale: 1, y: 0 }} transition={{ type: "spring", stiffness: 500, damping: 18 }}><I3 name={icon} px={26} /></motion.span><span>{label}</span></Btn>)}
    <Btn type="button" className="dpx-fab" onClick={openPay} aria-label="Bayar atau kirim saldo" initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 300, damping: 16, delay: 0.1 }} whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.88, rotate: -6 }}><Ic n="scan" /><span>Bayar</span></Btn>
  </motion.nav>;
}

export function ComingSoonSheet({ title = "Segera hadir", message, onClose }: { title?: string; message: string; onClose: () => void }) {
  return <Sheet title={title} onClose={onClose}>
    <div className="dpx-center" style={{ padding: "6px 0 4px" }}><I3 name="customer-benefit-wallet" px={110} style={{ margin: "0 auto" }} /><p className="dpx-sub" style={{ maxWidth: 280, margin: "10px auto 0", fontSize: 14.5 }}>{message}</p></div>
    <Btn type="button" className="dpx-btn" onClick={onClose}>Mengerti</Btn>
  </Sheet>;
}

export function CardSheet({ onClose }: { onClose: () => void }) {
  return <Sheet title="Kartu Djiwa" onClose={onClose}>
    <div className="dpx-center" style={{ padding: "6px 0 4px" }}><img src="/assets/djiwa-pay-actions/card.webp" width={132} height={132} alt="" style={{ margin: "0 auto" }} /><b style={{ fontSize: 20, display: "block", marginTop: 8 }}>Segera hadir</b><p className="dpx-sub" style={{ maxWidth: 270, margin: "6px auto 0" }}>Kartu virtual untuk belanja online dan langganan, terhubung ke saldo Djiwa Pay.</p></div>
    <Btn type="button" className="dpx-btn" onClick={onClose}>Mengerti</Btn>
  </Sheet>;
}

export function PaySheet({ nav, onClose, withdrawSupported }: { nav: Nav; onClose: () => void; withdrawSupported: boolean }) {
  const go = (path: string) => { onClose(); nav.go(path); };
  const actions: [string, string, string, string, boolean][] = [["send", "Kirim", "/wallet/transfer", "send.webp", true], ["receive", "Terima", "/wallet/receive", "receive.webp", true], ["topup", "Isi saldo", "/wallet/topup", "topup.webp", true], ["withdraw", "Tarik", "", "withdraw.webp", withdrawSupported]];
  return <Sheet title="Mau bayar apa?" onClose={onClose}>
    <Btn type="button" className="dpx-btn" style={{ marginTop: 4, minHeight: 68, justifyContent: "flex-start", gap: 14, paddingLeft: 12 }} onClick={() => go("/wallet/transfer?mode=scan")}>
      <span className="dpx-av" style={{ width: 46, height: 46, background: "rgba(255,255,255,.16)", color: "#fff", boxShadow: "none" }}><Ic n="scan" /></span>
      <span style={{ textAlign: "left" }}><b style={{ display: "block" }}>Scan QR</b><span style={{ fontWeight: 400, fontSize: 13, opacity: 0.75 }}>QR Djiwa Pay</span></span>
    </Btn>
    <div className="dpx-tile3" style={{ gridTemplateColumns: "repeat(4,1fr)", gap: 6, marginTop: 16 }}>
      {actions.map(([key, label, path, asset, ok]) => <Btn key={key} type="button" className="dpx-q" disabled={!ok} style={ok ? undefined : { opacity: 0.55 }} onClick={() => ok && go(path)} aria-label={ok ? label : `${label}, segera hadir`}>
        <span className="dpx-qi" style={{ background: "var(--group)", width: 64, height: 64, borderRadius: 22, display: "grid", placeItems: "center" }}><img src={`/assets/djiwa-pay-actions/${asset}`} width={40} height={40} alt="" /></span>{label}{ok ? null : <span className="dpx-tag" style={{ marginTop: -4 }}>Segera</span>}
      </Btn>)}
    </div>
    <div className="dpx-group dpx-flush" style={{ marginTop: 14 }}>
      <Row icon="receipt" tone="blue" title="Bayar tagihan & isi pulsa" sub="PLN, PDAM, pulsa, data, game" onClick={() => go("/layanan")} />
      <Row i3="order-receipt" title="Lihat riwayat" sub="Semua transaksi saldo" onClick={() => go("/riwayat")} />
    </div>
  </Sheet>;
}

export function AllServicesSheet({ nav, onClose }: { nav: Nav; onClose: () => void }) {
  return <Sheet title="Semua layanan" onClose={onClose}>
    <p className="dpx-sub" style={{ margin: "-6px 4px 12px" }}>Pilih layanan yang ingin dibayar dengan saldo Djiwa Pay.</p>
    <div className="dpx-tile3" style={{ gap: 8 }}>
      {SERVICE_LIST.map(([key, label]) => <Btn key={key} type="button" className="dpx-q" style={{ padding: "10px 0", background: "var(--group)", borderRadius: 22 }} onClick={() => { onClose(); nav.openService(key, label); }}>
        <span className={`dpx-qi dpx-c-${serviceTone[key]}`} style={{ width: 52, height: 52, borderRadius: 18, display: "grid", placeItems: "center" }}><Ic n={serviceIcon[key]} size="lg" /></span>
        <b style={{ fontSize: 13 }}>{label}</b>{COMING_SOON.has(key) ? <span className="dpx-tag" style={{ marginTop: -4 }}>Segera</span> : null}
      </Btn>)}
    </div>
  </Sheet>;
}

/* ---------- Beranda ---------- */
export type HomeProps = {
  profile: CustomerProfile; balance: number; loading: boolean; error: string | null; hasWallet: boolean; visible: boolean; onToggleVisible: () => void; onRefresh: () => void;
  transactions: WalletTransaction[]; unread: number; nav: Nav; onOpenNotifications: () => void; onOpenTx: (id: string) => void; previewOnly: boolean;
};
export function HomeTab(p: HomeProps) {
  const now = new Date();
  const summary = useMemo(() => summarizeMonth(p.transactions, now.getFullYear(), now.getMonth()), [p.transactions]);
  const prev = useMemo(() => { const d = new Date(now.getFullYear(), now.getMonth() - 1, 1); return summarizeMonth(p.transactions, d.getFullYear(), d.getMonth()); }, [p.transactions]);
  const trend = prev.out > 0 ? Math.round(((summary.out - prev.out) / prev.out) * 100) : null;
  const todayOut = summary.perDay[now.getDate() - 1] ?? 0;
  const todayCount = p.transactions.filter((t) => { const d = new Date(t.created_at); return d.toDateString() === now.toDateString() && t.direction === "debit"; }).length;
  const empty = p.transactions.length === 0;
  const failed = !p.hasWallet && !!p.error;
  const dateText = now.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long" });
  const quick: [string, string][] = [["pulsa", "Pulsa"], ["data", "Data"], ["pln-token", "Token PLN"], ["pln-bill", "Tagihan"]];
  return <div className="dpx-page"><Sky>
    <div className="dpx-pad" style={{ paddingBottom: 0 }}>
      <div className="dpx-hdr" style={{ paddingTop: 0 }}>
        <Btn type="button" className="dpx-av" onClick={() => p.nav.go("/akun")} aria-label="Akun saya">{firstName(p.profile.name, p.profile.email)[0]?.toUpperCase()}</Btn>
        <div className="dpx-grow" />
        <Btn type="button" className="dpx-rb" onClick={p.onRefresh} disabled={p.loading} aria-label="Segarkan saldo"><motion.span style={{ display: "grid" }} animate={{ rotate: p.loading ? 360 : 0 }} transition={p.loading ? { repeat: Infinity, duration: 0.9, ease: "linear" } : { duration: 0.3 }}><Ic n="refresh" /></motion.span></Btn>
        <Btn type="button" className="dpx-rb" onClick={p.onOpenNotifications} aria-label={`Notifikasi${p.unread ? `, ${p.unread} belum dibaca` : ""}`}><Wiggle active={p.unread > 0}><Ic n="bell" /></Wiggle>{p.unread ? <span className="dpx-bd">{p.unread > 9 ? "9+" : p.unread}</span> : null}</Btn>
      </div>
      <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.05 }} className="dpx-title" style={{ fontSize: 34, letterSpacing: "-.04em", marginTop: 14 }}>{greeting(now)}, {firstName(p.profile.name, p.profile.email)}.</motion.h1>
      <div className="dpx-flex dpx-mt8" style={{ color: "var(--mute)", font: "600 15px var(--font)" }}>Hari ini · {dateText}
        <Btn type="button" onClick={p.onToggleVisible} aria-label={p.visible ? "Sembunyikan saldo" : "Tampilkan saldo"} aria-pressed={!p.visible} style={{ marginLeft: 2 }}><IconSwap k={p.visible ? "eye" : "eyeoff"}><Ic n={p.visible ? "eye" : "eyeoff"} size="sm" /></IconSwap></Btn>
      </div>
      {p.previewOnly ? <p className="dpx-note dpx-info" role="status" style={{ marginTop: 10 }}>Pratinjau lokal · data contoh · transaksi dinonaktifkan</p> : null}
      {p.loading && !p.hasWallet ? <><SkeletonBlock h={56} w={220} /><div style={{ height: 14 }} /><SkeletonBlock h={16} w={260} /></>
        : failed ? <div className="dpx-note dpx-danger" role="alert" style={{ marginTop: 22, background: "rgba(255,255,255,.85)" }}><Ic n="warn" /><div><b>Saldo belum dapat dimuat</b>{p.error}<br /><Btn type="button" className="dpx-linkbtn" style={{ marginTop: 8, fontWeight: 600 }} onClick={p.onRefresh}>Coba lagi</Btn></div></div>
        : <><div style={{ marginTop: 18 }}><span className="dpx-display" aria-label={p.visible ? rupiah(p.balance) : "Saldo disembunyikan"}><small>Rp</small>{p.visible ? <AnimatedNumber value={p.balance} /> : "•••••••"}</span></div>
          <div className="dpx-sub dpx-mt8" style={{ fontSize: 15 }}>{empty ? "Isi saldo atau scan QR untuk mulai." : <>Bulan ini keluar {rupiah(summary.out)}{trend !== null && trend !== 0 ? <> · <span style={{ color: trend < 0 ? "var(--ok)" : "var(--danger)", fontWeight: 600 }}>{trend < 0 ? "turun" : "naik"} {Math.abs(trend)}%</span></> : null}</>}</div></>}
      <Btn type="button" className="dpx-ask" initial={{ opacity: 0, y: 14, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ ...spring, delay: 0.18 }} whileTap={{ scale: 0.98 }} onClick={() => p.nav.go("/layanan?cari=1")} aria-label="Cari layanan atau nomor"><I3 name="payment-wallet" px={30} /><span>Cari layanan atau nomor</span><i className="dpx-go"><Ic n="search" /></i></Btn>
      <div className="dpx-body-sheet">
        {p.loading && !p.hasWallet ? <><SkeletonBlock h={112} /><div style={{ height: 12 }} /><SkeletonBlock h={80} /></> : <>
          <Reveal i={0}><div className="dpx-tile3">
            <Btn type="button" className="dpx-tile dpx-t-peach" onClick={() => p.nav.go("/wallet/topup")}><I3 name="customer-benefit-wallet" px={52} /><span className="dpx-chip2">QRIS</span><span>Isi saldo</span></Btn>
            <Btn type="button" className="dpx-tile dpx-t-mint" onClick={() => p.nav.go("/ringkasan")}><I3 name="sales-report" px={52} /><span>Ikuti uangmu</span></Btn>
            <Btn type="button" className="dpx-tile dpx-t-lav" onClick={() => p.nav.openService("pln-bill", "Tagihan PLN")}><I3 name="order-receipt" px={52} /><span>Bayar tagihan</span></Btn>
          </div></Reveal>
          <Reveal i={1}><div className="dpx-quick">
            {quick.map(([key, label], idx) => <Btn key={key} type="button" className="dpx-q" whileHover={{ y: -3 }} onClick={() => p.nav.openService(key, label)}><span className={`dpx-qi dpx-c-${serviceTone[key]}`}><Ic n={serviceIcon[key]} size="lg" /></span>{label}</Btn>)}
            <Btn type="button" className="dpx-q" onClick={() => p.nav.openSheet("all")}><span className="dpx-qi" style={{ background: "var(--group)", color: "var(--navy)" }}><Ic n="grid" size="lg" /></span>Lainnya</Btn>
          </div></Reveal>
          <Reveal i={2}><div className="dpx-group" style={{ marginTop: 22, display: "flex", alignItems: "center", gap: 12, padding: "14px" }}>
            <span className="dpx-ico" style={{ width: 44, height: 44, borderRadius: "50%", background: "#fff", display: "grid", placeItems: "center", color: "var(--navy)" }}><Ic n="cal" /></span>
            <div style={{ flex: 1, minWidth: 0 }}><div className="dpx-sub">Hari ini</div><b style={{ fontSize: 17, whiteSpace: "nowrap" }}>{todayCount === 0 ? "Belum ada transaksi" : `Keluar ${rupiah(todayOut)}`}</b></div>
            {todayCount === 0 ? <Btn type="button" className="dpx-btn dpx-sm" onClick={() => p.nav.go("/wallet/topup")}>Isi saldo</Btn> : <Btn type="button" className="dpx-btn dpx-sm" style={{ background: "var(--group)", color: "var(--navy)", boxShadow: "0 0 0 1px var(--line)" }} onClick={() => p.nav.go("/riwayat")}>Lihat</Btn>}
          </div></Reveal>
          {empty ? <><div className="dpx-sec" style={{ marginTop: 24 }}><h2>Berikutnya</h2></div>
            <div className="dpx-next">
              <Btn type="button" className="dpx-group dpx-flex" style={{ flex: "none", width: 250 }} onClick={() => p.nav.go("/wallet/topup")}><span className="dpx-cat dpx-c-blue"><Ic n="down" /></span><span style={{ textAlign: "left" }}><b>Isi saldo pertama</b><div className="dpx-sub">Mulai dari Rp 20.000</div></span></Btn>
              <Btn type="button" className="dpx-group dpx-flex" style={{ flex: "none", width: 250 }} onClick={() => p.nav.go("/wallet/receive")}><span className="dpx-cat dpx-c-emerald"><Ic n="qr" /></span><span style={{ textAlign: "left" }}><b>Terima saldo</b><div className="dpx-sub">Bagikan QR atau nomor HP</div></span></Btn>
            </div></>
            : <><div className="dpx-sec"><h2>Aktivitas terbaru</h2><Btn type="button" onClick={() => p.nav.go("/riwayat")}>Lihat semua</Btn></div><div className="dpx-group dpx-flush">{p.transactions.slice(0, 3).map((t, idx) => <TxRow key={t.id} entry={t} onOpen={p.onOpenTx} i={idx + 3} />)}</div></>}
        </>}
      </div>
    </div>
  </Sky></div>;
}

/* ---------- Layanan ---------- */
export function ServicesTab({ nav, focusSearch, recentNumbers }: { nav: Nav; focusSearch: boolean; recentNumbers: string[] }) {
  const [q, setQ] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (focusSearch) ref.current?.focus(); }, [focusSearch]);
  const term = q.trim().toLowerCase();
  const digits = q.replace(/\D/g, "");
  const list = SERVICE_LIST.filter(([, label, desc]) => !term || `${label} ${desc}`.toLowerCase().includes(term));
  return <div className="dpx-page"><Sky><div className="dpx-pad">
    <div className="dpx-hdr" style={{ paddingTop: 0 }}><h1 className="dpx-page-title" style={{ flex: 1 }}>Layanan</h1></div>
    <label className="dpx-search dpx-mt8"><Ic n="search" size="sm" /><input ref={ref} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari layanan atau nomor" aria-label="Cari layanan atau nomor" inputMode="search" /></label>
    {digits.length >= 8 ? <div className="dpx-group dpx-flush" style={{ marginTop: 12 }}><Row icon="phone" tone="blue" title={`Isi pulsa ke ${q.trim()}`} sub="Pilih operator dan nominal" onClick={() => nav.openService("pulsa", "Pulsa")} /><Row icon="wifi" tone="violet" title={`Beli paket data ke ${q.trim()}`} sub="Internet & kuota" onClick={() => nav.openService("data", "Paket Data")} /></div> : null}
    <div className="dpx-glabel">Semua layanan</div>
    {list.length === 0 ? <div className="dpx-empty"><I3 name="restaurant-cafe" px={112} /><b>Tidak ada hasil</b><p>Coba kata kunci lain, misalnya “pulsa” atau “listrik”.</p></div> :
      <div className="dpx-group dpx-white"><div className="dpx-tile3" style={{ gap: "6px 8px" }}>
        {list.map(([key, label], idx) => <Btn key={key} type="button" className="dpx-q" style={{ padding: "8px 0" }} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ ...spring, delay: idx * 0.035 }} whileTap={{ scale: 0.92 }} onClick={() => nav.openService(key, label)}><span className={`dpx-qi dpx-c-${serviceTone[key]}`} style={{ width: 56, height: 56, borderRadius: 20, display: "grid", placeItems: "center" }}><Ic n={serviceIcon[key]} size="lg" /></span><span style={{ fontSize: 13, fontWeight: 600 }}>{label}</span>{COMING_SOON.has(key) ? <span className="dpx-tag" style={{ marginTop: -4 }}>Segera</span> : null}</Btn>)}
      </div></div>}
    {recentNumbers.length ? <><div className="dpx-glabel">Nomor terakhir dipakai</div><div className="dpx-group dpx-flush">{recentNumbers.slice(0, 5).map((n) => <Row key={n} icon="phone" tone="blue" title={n} sub="Pulsa & data" trail="Beli lagi" chev={false} onClick={() => nav.openService("pulsa", "Pulsa")} />)}</div></> : null}
    <div className="dpx-group dpx-flex" style={{ background: "linear-gradient(135deg,#e1ecff,#c9dcff)", marginTop: 16 }}><div style={{ flex: 1 }}><span className="dpx-tag dpx-info">REWARD</span><div className="dpx-title" style={{ fontSize: 19, marginTop: 6 }}>Saldo +Rp 1.000 tiap transaksi</div><div className="dpx-sub">Bayar PPOB dengan Djiwa Pay, reward masuk setelah berhasil.</div></div><I3 name="promo-voucher" px={76} /></div>
  </div></Sky></div>;
}

/* ---------- Riwayat ---------- */
type Seg = "all" | "credit" | "debit" | "transfer";
const PERIODS = ["Hari ini", "7 hari terakhir", "Bulan ini", "Bulan lalu", "3 bulan terakhir", "Semua waktu"] as const;
type Period = typeof PERIODS[number];
function inPeriod(value: string, period: Period, now = new Date()) {
  if (period === "Semua waktu") return true;
  const d = new Date(value); if (Number.isNaN(d.getTime())) return false;
  const sod = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (period === "Hari ini") return d.getTime() >= sod;
  if (period === "7 hari terakhir") return d.getTime() >= sod - 6 * 86400000;
  if (period === "Bulan ini") return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  if (period === "Bulan lalu") { const p = new Date(now.getFullYear(), now.getMonth() - 1, 1); return d.getFullYear() === p.getFullYear() && d.getMonth() === p.getMonth(); }
  return d.getTime() >= new Date(now.getFullYear(), now.getMonth() - 2, 1).getTime();
}
export function HistoryTab({ transactions, loading, nav, selected, onOpenTx, onCloseTx }: { transactions: WalletTransaction[]; loading: boolean; nav: Nav; selected: WalletTransaction | null; onOpenTx: (id: string) => void; onCloseTx: () => void }) {
  const [seg, setSeg] = useState<Seg>("all");
  const [q, setQ] = useState("");
  const [period, setPeriod] = useState<Period>("Semua waktu");
  const [cat, setCat] = useState("all");
  const [sheet, setSheet] = useState<null | "filter" | "period">(null);
  const cats = useMemo(() => { const m = new Map<string, string>(); transactions.forEach((t) => { if (t.direction === "debit") { const c = summaryCategory(t); m.set(c.key, c.label); } }); return [...m.entries()]; }, [transactions]);
  const list = transactions.filter((t) => (seg === "all" || (seg === "transfer" ? t.category === "transfer" : t.direction === seg && !t.direct)) && inPeriod(t.created_at, period) && (cat === "all" || (t.direction === "debit" && summaryCategory(t).key === cat)) && (!q || `${transactionTitle(t)} ${transactionMethodLine(t)} ${t.note ?? ""} ${t.counterparty_name ?? ""}`.toLowerCase().includes(q.toLowerCase())));
  const days = [...new Set(list.map((t) => dayLabel(t.created_at)))];
  const filtered = cat !== "all" || seg !== "all" || q !== "" || period !== "Semua waktu";
  return <div className="dpx-page"><Sky><div className="dpx-pad">
    <div className="dpx-hdr" style={{ paddingTop: 0 }}><h1 className="dpx-page-title" style={{ flex: 1 }}>Riwayat</h1><Btn type="button" className="dpx-rb" onClick={() => nav.go("/ringkasan")} aria-label="Ringkasan bulanan"><Ic n="chart" /></Btn></div>
    <label className="dpx-search dpx-mt8"><Ic n="search" size="sm" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari transaksi" aria-label="Cari transaksi" /></label>
    <div className="dpx-chips dpx-mt8"><Btn type="button" className={`dpx-chip ${period !== "Semua waktu" ? "dpx-on" : ""}`} onClick={() => setSheet("period")}><Ic n="cal" size="sm" /> {period}</Btn><Btn type="button" className={`dpx-chip ${cat !== "all" ? "dpx-on" : ""}`} onClick={() => setSheet("filter")}><Ic n="filter" size="sm" /> {cat === "all" ? "Filter" : cats.find(([k]) => k === cat)?.[1] ?? "Filter"}</Btn></div>
    <div className="dpx-mt8"><Seg id="hist" label="Jenis transaksi" value={seg} onChange={setSeg} options={[["all", "Semua"], ["credit", "Masuk"], ["debit", "Keluar"], ["transfer", "Transfer"]] as const} /></div>
    <div aria-live="polite">
      {loading && transactions.length === 0 ? <div style={{ marginTop: 18 }}><SkeletonBlock h={200} /></div>
        : transactions.length === 0 ? <div className="dpx-empty"><I3 name="order-receipt" px={112} /><b>Belum ada transaksi</b><p>Isi saldo atau bayar tagihan pertamamu — semua tercatat rapi di sini.</p><Btn type="button" className="dpx-btn" style={{ maxWidth: 300 }} onClick={() => nav.go("/wallet/topup")}><Ic n="plus" size="sm" /> Isi saldo</Btn></div>
        : list.length === 0 ? <div className="dpx-empty"><I3 name="restaurant-cafe" px={112} /><b>Tidak ada hasil</b><p>Coba ubah kata kunci, periode, atau filter.</p>{filtered ? <Btn type="button" className="dpx-btn dpx-soft" style={{ maxWidth: 240 }} onClick={() => { setSeg("all"); setQ(""); setPeriod("Semua waktu"); setCat("all"); }}>Atur ulang</Btn> : null}</div>
        : days.map((d) => { const items = list.filter((t) => dayLabel(t.created_at) === d); const spent = items.filter((t) => t.direction === "debit" && !t.direct).reduce((s, t) => s + t.amount, 0); return <div key={d}><div className="dpx-dayh"><span>{d}</span><span>{spent ? `−${rupiah(spent)}` : ""}</span></div><div className="dpx-group dpx-flush dpx-white">{items.map((t, idx) => <TxRow key={t.id} entry={t} onOpen={onOpenTx} i={idx} />)}</div></div>; })}
    </div>
  </div></Sky>
  <AnimatePresence>{sheet === "period" ? <Sheet key="period" title="Periode" onClose={() => setSheet(null)}><div className="dpx-group dpx-flush">{PERIODS.map((p) => <Btn key={p} type="button" className="dpx-row" onClick={() => { setPeriod(p); setSheet(null); }}><span className="dpx-main"><b>{p}</b></span>{period === p ? <Ic n="check" size="sm" /> : null}</Btn>)}</div></Sheet> : null}
  {sheet === "filter" ? <Sheet key="filter" title="Filter" onClose={() => setSheet(null)}><div className="dpx-glabel" style={{ marginTop: 0 }}>Kategori pengeluaran</div><div className="dpx-chips" style={{ flexWrap: "wrap", margin: 0, padding: 0, overflow: "visible" }}>{[["all", "Semua"] as [string, string], ...cats].map(([k, l]) => <Btn key={k} type="button" className={`dpx-chip ${cat === k ? "dpx-on" : ""}`} style={{ background: cat === k ? undefined : "var(--group)" }} onClick={() => setCat(k)}>{l}</Btn>)}</div><Btn type="button" className="dpx-btn" onClick={() => setSheet(null)}>Terapkan</Btn><Btn type="button" className="dpx-btn dpx-soft" onClick={() => { setCat("all"); setSheet(null); }}>Atur ulang</Btn></Sheet> : null}
  {selected ? <TxnSheet key="txn" entry={selected} onClose={onCloseTx} onHelp={() => nav.go("/wallet/help")} /> : null}</AnimatePresence>
  </div>;
}

export function TxnSheet({ entry, onClose, onHelp }: { entry: WalletTransaction; onClose: () => void; onHelp: () => void }) {
  const [copied, setCopied] = useState(false);
  const v = transactionVisual(entry);
  const id = String(entry.transfer_id ?? entry.id);
  const done = entry.status === "success" || entry.status === "completed";
  const rows: [string, string][] = [["Waktu", formatDateTime(entry.created_at)], ["Metode pembayaran", paymentMethodLabel(entry)]];
  if (entry.direct && entry.app) rows.push(["Aplikasi", entry.app]);
  if (entry.counterparty_name) rows.push([entry.direction === "credit" ? "Dari" : "Kepada", entry.counterparty_name]);
  if (entry.counterparty_phone) rows.push(["Nomor HP", entry.counterparty_phone]);
  if (entry.note) rows.push(["Catatan", entry.note]);
  rows.push(["ID transaksi", id]);
  return <Sheet title="Detail transaksi" onClose={onClose}>
    <div className="dpx-center" style={{ margin: "-4px 0 10px" }}><span className={`dpx-cat dpx-c-${v.tone}`} style={{ width: 64, height: 64, margin: "0 auto 8px" }}><Ic n={v.icon as IconName} size="lg" /></span><div className="dpx-money" style={entry.direction === "credit" ? { color: "var(--ok)" } : undefined}>{entry.direct ? rupiah(entry.amount) : signedRupiah(entry.amount, entry.direction)}</div><div className="dpx-sub">{transactionTitle(entry)}</div><div className="dpx-mt8"><span className={`dpx-tag ${done ? "dpx-ok" : "dpx-warn"}`}>{done ? "Selesai" : entry.status}</span></div></div>
    <div className="dpx-group">{rows.map(([k, val]) => <div className="dpx-kv" key={k}><span>{k}</span><b style={k === "ID transaksi" ? { fontFamily: "ui-monospace,monospace", fontSize: 13, wordBreak: "break-all" } : undefined}>{val}</b></div>)}</div>
    <div className="dpx-flex dpx-mt"><Btn type="button" className="dpx-btn dpx-ghost" style={{ margin: 0 }} onClick={() => { void navigator.clipboard?.writeText(id).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1800); }); }}><Ic n={copied ? "check" : "copy"} size="sm" /> {copied ? "ID tersalin" : "Salin ID"}</Btn><Btn type="button" className="dpx-btn dpx-soft" style={{ margin: 0 }} onClick={onHelp}><Ic n="help" size="sm" /> Bantuan</Btn></div>
  </Sheet>;
}

/* ---------- Ringkasan ---------- */
export function SummaryPage({ transactions, onBack }: { transactions: WalletTransaction[]; onBack: () => void }) {
  const today = new Date();
  const [cursor, setCursor] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const s = useMemo(() => summarizeMonth(transactions, cursor.y, cursor.m), [transactions, cursor]);
  const isCurrent = cursor.y === today.getFullYear() && cursor.m === today.getMonth();
  const shift = (d: number) => setCursor((c) => { const n = new Date(c.y, c.m + d, 1); return { y: n.getFullYear(), m: n.getMonth() }; });
  const max = Math.max(0, ...s.perDay);
  const offset = (new Date(cursor.y, cursor.m, 1).getDay() + 6) % 7; // Monday first
  const cells: ReactNode[] = Array.from({ length: offset }, (_, i) => <span key={`b${i}`} />);
  s.perDay.forEach((amount, i) => { const day = i + 1; const future = isCurrent && day > today.getDate(); const lvl = heatLevel(amount, max); cells.push(<motion.div key={`${cursor.y}-${cursor.m}-${day}`} initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ ...spring, delay: Math.min(day, 31) * 0.012 }} whileHover={{ scale: 1.12 }} className={`dpx-d ${future ? "dpx-fut" : lvl ? "dpx-l" + lvl : ""} ${isCurrent && day === today.getDate() ? "dpx-today" : ""}`} title={amount ? `${day}: ${rupiah(amount)}` : String(day)}>{day}</motion.div>); });
  const tones = ["blue", "amber", "violet", "orange", "emerald", "slate"];
  return <div className="dpx-page"><Sky><div className="dpx-pad dpx-nobar">
    <Header title="Ringkasan" onBack={onBack} />
    <div className="dpx-spread" style={{ margin: "4px 0" }}><Btn type="button" className="dpx-rb" onClick={() => shift(-1)} aria-label="Bulan sebelumnya"><Ic n="back" size="sm" /></Btn><b style={{ fontSize: 18, textTransform: "capitalize" }}>{monthLabel(cursor.y, cursor.m)}</b><Btn type="button" className="dpx-rb" style={isCurrent ? { opacity: 0.4 } : undefined} disabled={isCurrent} onClick={() => shift(1)} aria-label="Bulan berikutnya"><Ic n="chev" size="sm" /></Btn></div>
    <div className="dpx-mt"><div className="dpx-sub">Uang keluar</div><div className="dpx-display" style={{ fontSize: 44 }}><small style={{ fontSize: 22 }}>Rp</small><AnimatedNumber value={s.out} /></div></div>
    <div className="dpx-tile3 dpx-mt" style={{ gridTemplateColumns: "1fr 1fr" }}><div className="dpx-group dpx-white"><div className="dpx-sub">Uang masuk</div><b style={{ fontSize: 20, color: "var(--ok)" }}>{rupiah(s.in)}</b></div><div className="dpx-group dpx-white"><div className="dpx-sub">Rata-rata / hari</div><b style={{ fontSize: 20 }}>{rupiah(s.averagePerDay)}</b></div></div>
    <div className="dpx-sec"><h2>Tren harian</h2></div>
    <div className="dpx-heatw">{["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"].map((d) => <span key={d}>{d}</span>)}</div>
    <div className="dpx-heat">{cells}</div>
    <div className="dpx-sec"><h2>Per kategori</h2></div>
    <div className="dpx-group dpx-white">{s.categories.length ? s.categories.map((c, i) => <div key={c.key} style={{ padding: "8px 0" }}><div className="dpx-spread"><span className="dpx-flex"><span className={`dpx-cat dpx-c-${tones[i % tones.length]}`} style={{ width: 12, height: 12 }} /><b style={{ fontSize: 14.5 }}>{c.label}</b></span><span className="dpx-sub">{rupiah(c.total)} · {c.percent}%</span></div><div style={{ marginTop: 8 }}><Bar percent={c.percent} delay={0.1 + i * 0.08} /></div></div>) : <div className="dpx-sub dpx-center" style={{ padding: 14 }}>Belum ada pengeluaran bulan ini.</div>}</div>
  </div></Sky></div>;
}

/* ---------- Dompet ---------- */
export function WalletTab({ balance, visible, onToggleVisible, incoming, outgoing, transactions, nav, loading }: { balance: number; visible: boolean; onToggleVisible: () => void; incoming: number; outgoing: number; transactions: WalletTransaction[]; nav: Nav; loading: boolean }) {
  const now = new Date();
  const cur = useMemo(() => summarizeMonth(transactions, now.getFullYear(), now.getMonth()), [transactions]);
  const prev = useMemo(() => { const d = new Date(now.getFullYear(), now.getMonth() - 1, 1); return summarizeMonth(transactions, d.getFullYear(), d.getMonth()); }, [transactions]);
  const trend = prev.out > 0 ? Math.round(((cur.out - prev.out) / prev.out) * 100) : null;
  const withdraw = walletQuickActionState("withdraw");
  const acts: [string, string, string, string, boolean][] = [["topup", "Isi saldo", "/wallet/topup", "topup.webp", true], ["send", "Kirim", "/wallet/transfer", "send.webp", true], ["receive", "Terima", "/wallet/receive", "receive.webp", true], ["withdraw", "Tarik", "", "withdraw.webp", withdraw.supported]];
  return <div className="dpx-page"><Sky><div className="dpx-pad">
    <div className="dpx-hdr" style={{ paddingTop: 0 }}><h1 className="dpx-page-title" style={{ flex: 1 }}>Dompet</h1><Btn type="button" className="dpx-rb" onClick={() => nav.go("/akun")} aria-label="Akun saya"><Ic n="user" /></Btn></div>
    <div className="dpx-label" style={{ marginTop: 6 }}>Saldo Djiwa Pay</div>
    <div className="dpx-flex" style={{ marginTop: 4 }}>{loading && !balance ? <SkeletonBlock h={56} w={220} /> : <span className="dpx-display"><small>Rp</small>{visible ? <AnimatedNumber value={balance} /> : "•••••••"}</span>}<Btn type="button" onClick={onToggleVisible} aria-label={visible ? "Sembunyikan saldo" : "Tampilkan saldo"} style={{ color: "var(--mute)" }}><IconSwap k={visible ? "eye" : "eyeoff"}><Ic n={visible ? "eye" : "eyeoff"} /></IconSwap></Btn></div>
    <div className="dpx-chips" style={{ marginTop: 12 }}><span className="dpx-chip" style={{ background: "rgba(255,255,255,.9)", color: "var(--navy)" }}>{transactions.length === 0 ? "Riwayatmu dimulai hari ini" : trend === null ? "Aktif" : `${trend <= 0 ? "▼" : "▲"} ${Math.abs(trend)}% pengeluaran vs bulan lalu`}</span></div>
    <div className="dpx-tile3 dpx-mt" style={{ gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>{acts.map(([key, label, path, asset, ok], idx) => <Btn key={key} type="button" className="dpx-q" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.1 + idx * 0.05 }} disabled={!ok} style={ok ? undefined : { opacity: 0.55 }} onClick={() => ok && nav.go(path)} aria-label={ok ? label : `${label}, segera hadir`}><span className="dpx-qi" style={{ background: "#fff", boxShadow: "var(--soft)", width: 64, height: 64, borderRadius: 22, display: "grid", placeItems: "center" }}><img src={`/assets/djiwa-pay-actions/${asset}`} width={40} height={40} alt="" /></span>{label}{ok ? null : <span className="dpx-tag" style={{ marginTop: -4 }}>Segera</span>}</Btn>)}</div>
    <div className="dpx-glabel">Ringkasan saldo</div>
    <div className="dpx-tile3" style={{ gridTemplateColumns: "1fr 1fr" }}><div className="dpx-group dpx-white"><div className="dpx-sub">Total masuk</div><b style={{ fontSize: 18, color: "var(--ok)" }}>{rupiah(incoming)}</b></div><div className="dpx-group dpx-white"><div className="dpx-sub">Total digunakan</div><b style={{ fontSize: 18 }}>{rupiah(outgoing)}</b></div></div>
    <Btn type="button" className="dpx-group dpx-flex" style={{ width: "100%", marginTop: 14, textAlign: "left" }} onClick={() => nav.openSheet("card")}><img src="/assets/djiwa-pay-actions/card.webp" width={64} height={64} alt="" /><span style={{ flex: 1 }}><b style={{ fontSize: 17 }}>Kartu Djiwa</b><div className="dpx-sub">Kartu virtual untuk belanja online.</div></span><span className="dpx-tag">Segera</span></Btn>
    <div className="dpx-sec"><h2>Dompetmu</h2><span className="dpx-sub">{visible ? rupiah(balance) : "•••••"}</span></div>
    <div className="dpx-group dpx-flush"><Row i3="payment-wallet" title="Djiwa Pay" sub="Saldo utama" trail={<b>{visible ? rupiah(balance) : "•••••"}</b>} onClick={() => nav.go("/riwayat")} /><Row icon="chart" tone="emerald" title="Ringkasan bulanan" sub="Uang keluar & kategori" onClick={() => nav.go("/ringkasan")} /><Row icon="help" tone="cyan" title="Bantuan" sub="Pertanyaan umum & keamanan" onClick={() => nav.go("/wallet/help")} /></div>
  </div></Sky></div>;
}

/* ---------- Akun, notifikasi, bantuan ---------- */
export function AccountPage({ profile, unread, customerHome, onBack, nav, onOpenNotifications, embedded }: { profile: CustomerProfile; unread: number; customerHome: string; onBack: () => void; nav: Nav; onOpenNotifications: () => void; embedded: boolean }) {
  return <div className="dpx-page"><Sky><div className="dpx-pad">
    <Header title="Akun" onBack={onBack} />
    <div className="dpx-center" style={{ marginTop: 4 }}><div className="dpx-av" style={{ width: 84, height: 84, fontSize: 32, margin: "0 auto 10px" }}>{firstName(profile.name, profile.email)[0]?.toUpperCase()}</div><b style={{ fontSize: 22 }}>{profile.name || profile.email || "Pengguna Djiwa Pay"}</b><div className="dpx-sub">{[profile.phone, profile.email].filter(Boolean).join(" · ") || "Akun Djiwa Tentram"}</div><div className="dpx-flex" style={{ justifyContent: "center", marginTop: 8 }}><span className={`dpx-tag ${profile.wallet_status === "blocked" ? "dpx-danger" : "dpx-ok"}`}>{profile.wallet_status === "blocked" ? "Diblokir" : "Aktif"}</span></div></div>
    <div className="dpx-glabel">Preferensi</div>
    <div className="dpx-group dpx-flush dpx-white"><Row icon="bell" tone="amber" title="Notifikasi" sub="Aktivitas saldo & transfer" trail={unread ? <span className="dpx-tag dpx-info">{unread} baru</span> : undefined} onClick={onOpenNotifications} /><Row icon="help" tone="cyan" title="Bantuan" sub="FAQ & keamanan" onClick={() => nav.go("/wallet/help")} /></div>
    {embedded ? null : <><div className="dpx-glabel">Lainnya</div><div className="dpx-group dpx-flush dpx-white"><a className="dpx-row" href={customerHome}><span className="dpx-ico dpx-c-orange" style={{ boxShadow: "none" }}><Ic n="link" /></span><span className="dpx-main"><b>Kembali ke Djiwa Tentram</b><span>Pesan makanan & komunitas</span></span><Chev /></a></div></>}
    <p className="dpx-sub dpx-center" style={{ marginTop: 16 }}>Djiwa Pay · Digital wallet</p>
  </div></Sky></div>;
}

export function NotificationsPage({ items, loading, busy, onBack, onRead, onReadAll }: { items: WalletNotification[]; loading: boolean; busy: boolean; onBack: () => void; onRead: (n: WalletNotification) => void; onReadAll: () => void }) {
  const unread = items.filter((n) => n.unread).length;
  return <div className="dpx-page"><Sky><div className="dpx-pad dpx-nobar">
    <Header title="Notifikasi" onBack={onBack} right={<Btn type="button" className="dpx-linkbtn" style={{ width: 64, textAlign: "right", opacity: unread && !busy ? 1 : 0.4 }} disabled={busy || unread === 0} onClick={onReadAll}>{busy ? "Memproses" : "Baca"}</Btn>} />
    {loading && items.length === 0 ? <SkeletonBlock h={160} /> : items.length === 0 ? <div className="dpx-empty"><I3 name="notifications-alerts" px={112} /><b>Belum ada notifikasi</b><p>Aktivitas saldo dan transfer akan muncul di sini.</p></div>
      : <div className="dpx-group dpx-flush dpx-white">{items.map((n) => <Btn type="button" key={n.id} className="dpx-row" onClick={() => onRead(n)}><span className="dpx-cat dpx-c-blue"><Ic n="bell" /></span><span className="dpx-main"><b>{n.title}</b><span style={{ whiteSpace: "normal" }}>{n.message}</span></span><span className="dpx-trail">{formatTime(n.created_at)}{n.unread ? <div style={{ marginTop: 6 }}><span className="dpx-unread" aria-label="Belum dibaca" /></div> : null}</span></Btn>)}</div>}
  </div></Sky></div>;
}

export function HelpPage({ onBack, nav }: { onBack: () => void; nav: Nav }) {
  const faq: [string, string][] = [["Bagaimana cara mengisi saldo?", "Buka Isi saldo, pilih atau masukkan nominal, lalu selesaikan pembayaran QRIS. Saldo masuk setelah pembayaran dikonfirmasi."], ["Mengapa saldo belum bertambah?", "Buka kembali halaman Isi saldo untuk memeriksa status invoice. Jangan membuat pembayaran berulang selama status masih menunggu konfirmasi."], ["Bagaimana mengirim saldo dengan aman?", "Masukkan nomor HP penerima lalu tekan Cek penerima. Pastikan nama yang terverifikasi sudah benar sebelum mengirim."], ["Di mana melihat bukti transaksi?", "Semua aktivitas saldo tersedia di Riwayat. Pilih transaksi untuk melihat waktu, nominal, pihak terkait, dan ID transaksi."]];
  return <div className="dpx-page"><Sky><div className="dpx-pad dpx-nobar">
    <Header title="Bantuan" onBack={onBack} />
    <div className="dpx-group dpx-white dpx-flex" style={{ marginTop: 6 }}><I3 name="customer-benefit-wallet" px={60} /><div><b>Transaksi Anda tetap terkendali</b><div className="dpx-sub">Periksa penerima, nominal, dan status transaksi sebelum melanjutkan pembayaran.</div></div></div>
    <div className="dpx-tile3 dpx-mt"><Btn type="button" className="dpx-tile dpx-t-sky" style={{ minHeight: 90 }} onClick={() => nav.go("/wallet/topup")}><Ic n="plus" size="lg" /><span style={{ fontSize: 13 }}>Isi saldo</span></Btn><Btn type="button" className="dpx-tile dpx-t-mint" style={{ minHeight: 90 }} onClick={() => nav.go("/riwayat")}><Ic n="clock" size="lg" /><span style={{ fontSize: 13 }}>Riwayat</span></Btn><Btn type="button" className="dpx-tile dpx-t-lav" style={{ minHeight: 90 }} onClick={() => nav.go("/ringkasan")}><Ic n="chart" size="lg" /><span style={{ fontSize: 13 }}>Ringkasan</span></Btn></div>
    <div className="dpx-glabel">Pertanyaan umum</div>
    <div className="dpx-group dpx-white dpx-flush">{faq.map(([q, a]) => <details key={q} className="dpx-faq"><summary>{q}<span aria-hidden="true">+</span></summary><p className="dpx-sub">{a}</p></details>)}</div>
    <p className="dpx-sub dpx-center" style={{ marginTop: 14, display: "flex", gap: 6, justifyContent: "center", alignItems: "center" }}><Ic n="clock" size="sm" /> Status provider dapat memerlukan waktu untuk diperbarui.</p>
  </div></Sky></div>;
}
