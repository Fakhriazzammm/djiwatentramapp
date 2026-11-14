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

export function TabBar({ active, go, openPay }: { active: "home" | "budget" | "history" | "wallet" | null; go: (path: string) => void; openPay: () => void }) {
  const items = [["home", "Beranda", "/", "navigation-home"], ["history", "Catatan", "/riwayat", "navigation-history"], ["budget", "Anggaran", "/anggaran", "sales-report"], ["wallet", "Dompet", "/dompet", "navigation-wallet"]] as const;
  return <motion.nav className="dpx-tabbar" aria-label="Navigasi utama" initial={{ y: 90, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ ...spring, delay: 0.05 }}>
    {items.map(([key, label, path, icon]) => <Btn key={key} type="button" className={`dpx-tb ${active === key ? "dpx-on" : ""}`} aria-current={active === key ? "page" : undefined} onClick={() => go(path)}>{active === key ? <motion.span layoutId="dpx-tabpill" className="dpx-tabpill" transition={spring} /> : null}<motion.span style={{ display: "grid" }} animate={active === key ? { scale: 1.14, y: -1 } : { scale: 1, y: 0 }} transition={{ type: "spring", stiffness: 500, damping: 18 }}><I3 name={icon} px={26} /></motion.span><span>{label}</span></Btn>)}
    <Btn type="button" className="dpx-fab" onClick={openPay} aria-label="Catat transaksi" initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 300, damping: 16, delay: 0.1 }} whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.88, rotate: -6 }}><Ic n="plus" /><span>Catat</span></Btn>
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
/* ---------- Dompet ---------- */
/* ---------- Akun, notifikasi, bantuan ---------- */
export function AccountPage({ profile, unread, customerHome, onBack, nav, onOpenNotifications, embedded }: { profile: CustomerProfile; unread: number; customerHome: string; onBack: () => void; nav: Nav; onOpenNotifications: () => void; embedded: boolean }) {
  return <div className="dpx-page"><Sky><div className="dpx-pad">
    <Header title="Akun" onBack={onBack} />
    <div className="dpx-center" style={{ marginTop: 4 }}><div className="dpx-av" style={{ width: 84, height: 84, fontSize: 32, margin: "0 auto 10px" }}>{firstName(profile.name, profile.email)[0]?.toUpperCase()}</div><b style={{ fontSize: 22 }}>{profile.name || profile.email || "Pengguna Djiwa Pay"}</b><div className="dpx-sub">{[profile.phone, profile.email].filter(Boolean).join(" · ") || "Akun Djiwa Tentram"}</div><div className="dpx-flex" style={{ justifyContent: "center", marginTop: 8 }}><span className={`dpx-tag ${profile.wallet_status === "blocked" ? "dpx-danger" : "dpx-ok"}`}>{profile.wallet_status === "blocked" ? "Diblokir" : "Aktif"}</span></div></div>
    <div className="dpx-glabel">Preferensi</div>
    <div className="dpx-group dpx-flush dpx-white"><Row icon="bell" tone="amber" title="Notifikasi" sub="Aktivitas saldo & transfer" trail={unread ? <span className="dpx-tag dpx-info">{unread} baru</span> : undefined} onClick={onOpenNotifications} /><Row icon="tag" tone="violet" title="Pengaturan keuangan" sub="Kategori, ekspor, cadangan" onClick={() => nav.go("/pengaturan")} /><Row icon="help" tone="cyan" title="Bantuan" sub="FAQ & keamanan" onClick={() => nav.go("/wallet/help")} /></div>
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
