import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { DEFAULT_CATEGORIES } from "../../lib/finance/categories";
import { ago, compact, dLong, dShort, dTime, nf, rp, useAdmin, adminFetch, type Overview } from "./admin-data";
import { Delta, Donut, Empty, Kpis, Loading, Panel, Pill, Rank, Table, Tabs, TimeChart, COLORS } from "./admin-ui";

type Q = { from: string; to: string };
const qs = (r: Q) => `from=${r.from}&to=${r.to}`;
const catName = (id: string) => DEFAULT_CATEGORIES.find((c) => c.id === id)?.name ?? id;
const Err = ({ e, retry }: { e: string; retry: () => void }) => <div className="adm-err" role="alert">Data belum bisa dimuat ({e}). <button type="button" onClick={retry}>Coba lagi</button></div>;
const rangeLabel = (r: Q) => (r.from === r.to ? dLong(r.from) : `${dShort(r.from)} – ${dLong(r.to)}`);

/* ============ Ringkasan ============ */
export function OverviewPage({ range, go }: { range: Q; go: (p: string) => void }) {
  const { data, error, reload } = useAdmin<Overview>(`overview?${qs(range)}`, 60_000);
  if (!data) return error ? <Err e={error} retry={reload} /> : <Loading />;
  const { current: c, before: b, daily, totals: t } = data, days = daily.map((d) => d.day);
  const sp = (k: keyof Overview["daily"][number]) => daily.map((d) => Number(d[k]));
  return <div className="adm-stack">
    <Kpis items={[
      { label: "Pengunjung", value: nf(c.visitors), cur: c.visitors, prev: b.visitors, hint: `${nf(c.views)} tampilan`, spark: sp("visitors") },
      { label: "Pengguna baru", value: nf(c.newUsers), cur: c.newUsers, prev: b.newUsers, hint: `${nf(t.users)} total`, spark: sp("newUsers") },
      { label: "Pengguna aktif", value: nf(c.activeUsers), cur: c.activeUsers, prev: b.activeUsers, hint: "login terlacak" },
      { label: "Catatan keuangan", value: nf(c.entries), cur: c.entries, prev: b.entries, hint: `${nf(c.entryUsers)} pengguna`, spark: sp("entries") },
      { label: "Isi saldo", value: rp(c.topups), cur: c.topups, prev: b.topups, hint: `${nf(c.topupCount)} transaksi`, spark: sp("topup") },
      { label: "Belanja dari saldo", value: rp(c.spend), cur: c.spend, prev: b.spend, hint: `${nf(c.txCount)} mutasi`, spark: sp("spend") },
      { label: "Scan struk", value: nf(c.scans), cur: c.scans, prev: b.scans, hint: `${nf(c.receipts)} tersimpan` },
      { label: "Email pembayaran", value: nf(c.mails), cur: c.mails, prev: b.mails, hint: `${nf(c.mailsReview)} perlu ditinjau`, tone: c.mailsReview > 20 ? "warn" : undefined },
    ]} />
    <div className="adm-grid2">
      <Panel title="Lalu lintas" meta={rangeLabel(range)}><TimeChart labels={days} series={[{ name: "Pengunjung", values: sp("visitors") }, { name: "Tampilan", values: sp("views"), color: "#9a9aa6" }]} /></Panel>
      <Panel title="Pengguna baru" meta="pendaftaran per hari"><TimeChart kind="bar" labels={days} series={[{ name: "Pengguna baru", values: sp("newUsers"), color: "#166534" }]} /></Panel>
    </div>
    <div className="adm-grid2">
      <Panel title="Pemasukan vs pengeluaran tercatat" meta="catatan pengguna"><TimeChart labels={days} series={[{ name: "Pemasukan", values: sp("income"), color: "#166534", money: true }, { name: "Pengeluaran", values: sp("spent"), color: "#c73822", money: true }]} /></Panel>
      <Panel title="Saldo Djiwa Pay" meta="isi saldo & belanja"><TimeChart kind="bar" labels={days} series={[{ name: "Isi saldo", values: sp("topup"), color: "#1a5dc6", money: true }, { name: "Belanja", values: sp("spend"), color: "#9a6200", money: true }]} /></Panel>
    </div>
    <div className="adm-grid3">
      <Panel title="Seluruh waktu" meta="semua pengguna"><dl className="adm-dl">
        <div><dt>Pelanggan terdaftar</dt><dd>{nf(t.users)}</dd></div><div><dt>Memakai Djiwa Pay (keuangan)</dt><dd>{nf(t.financeUsers)}</dd></div><div><dt>Dompet</dt><dd>{nf(t.wallets)}</dd></div>
        <div><dt>Total saldo dompet</dt><dd>{rp(t.balance)}</dd></div><div><dt>Saldo tertahan</dt><dd>{rp(t.held)}</dd></div><div><dt>Punya PIN</dt><dd>{nf(t.pins)}</dd></div></dl></Panel>
      <Panel title="Fitur dipakai" meta="seluruh waktu"><dl className="adm-dl">
        <div><dt>Catatan keuangan</dt><dd>{nf(t.entries)}</dd></div><div><dt>Struk tersimpan</dt><dd>{nf(t.receipts)}</dd></div><div><dt>Aset dicatat</dt><dd>{nf(t.assets)}</dd></div>
        <div><dt>Google terhubung</dt><dd>{nf(t.google)}</dd></div><div><dt>Sumber email</dt><dd>{nf(t.mailSources)}</dd></div><div><dt>Notifikasi push</dt><dd>{nf(t.pushUsers)} pengguna</dd></div></dl></Panel>
      <Panel title="Kualitas email" meta={rangeLabel(range)}><Donut rows={[{ label: "Otomatis/disetujui", value: c.mailsOk }, { label: "Perlu ditinjau", value: c.mailsReview }, { label: "Lainnya", value: Math.max(0, c.mails - c.mailsOk - c.mailsReview) }]} center={<><b>{nf(c.mails)}</b><small>email</small></>} /></Panel>
    </div>
    <div className="adm-quick">{[["Lihat traffic lengkap", "/admin/traffic"], ["Kelola pengguna", "/admin/pengguna"], ["Statistik keuangan", "/admin/keuangan"], ["Dompet & saldo", "/admin/dompet"]].map(([l, p], i) => <motion.button key={p} type="button" onClick={() => go(p)} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 + i * 0.05 }} whileHover={{ y: -2 }} whileTap={{ scale: 0.96 }}>{l} →</motion.button>)}</div>
  </div>;
}

/* ============ Traffic ============ */
type Traffic = { range: Q; pages: { path: string; views: number; visitors: number }[]; referrers: { ref: string; n: number }[]; devices: { device: string; n: number; visitors: number }[]; browsers: { browser: string; n: number }[]; hours: { h: number; n: number }[]; weekdays: { d: number; n: number }[]; daily: { day: string; views: number; visitors: number; pwa: number }[]; recent: { at: string; path: string; device: string; browser: string; standalone: boolean; user_id: string | null; v: string }[]; live: number; visitors: { fresh: number; returning: number } };
const DOW = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
export function TrafficPage({ range }: { range: Q }) {
  const { data, error, reload } = useAdmin<Traffic>(`traffic?${qs(range)}`, 30_000);
  if (!data) return error ? <Err e={error} retry={reload} /> : <Loading />;
  const days = data.daily.map((d) => d.day), views = data.daily.reduce((s, d) => s + d.views, 0), vis = data.daily.reduce((s, d) => s + d.visitors, 0), pwa = data.daily.reduce((s, d) => s + d.pwa, 0);
  const hours = Array.from({ length: 24 }, (_, h) => data.hours.find((x) => x.h === h)?.n ?? 0), dows = Array.from({ length: 7 }, (_, i) => data.weekdays.find((x) => x.d === i + 1)?.n ?? 0);
  const device = { desktop: "Desktop", mobile: "Ponsel", tablet: "Tablet" } as Record<string, string>;
  return <div className="adm-stack">
    <Kpis items={[
      { label: "Sedang aktif", value: nf(data.live), hint: "5 menit terakhir", tone: data.live ? "ok" : undefined },
      { label: "Tampilan halaman", value: nf(views), hint: `${nf(Math.round(views / Math.max(1, days.length)))}/hari` },
      { label: "Pengunjung unik", value: nf(vis), hint: "jumlah per hari" },
      { label: "Pengunjung baru", value: nf(data.visitors.fresh), hint: `${nf(data.visitors.returning)} kembali` },
      { label: "Dari aplikasi terpasang", value: views ? `${Math.round((pwa / views) * 100)}%` : "0%", hint: `${nf(pwa)} tampilan` },
      { label: "Halaman per kunjungan", value: vis ? (views / vis).toFixed(1).replace(".", ",") : "0", hint: "rata-rata" },
    ]} />
    <Panel title="Pengunjung & tampilan" meta={rangeLabel(range)}><TimeChart labels={days} series={[{ name: "Tampilan", values: data.daily.map((d) => d.views), color: "#9a9aa6" }, { name: "Pengunjung", values: data.daily.map((d) => d.visitors) }, { name: "Aplikasi terpasang", values: data.daily.map((d) => d.pwa), color: "#166534" }]} /></Panel>
    <div className="adm-grid2">
      <Panel title="Halaman terpopuler" meta="tampilan"><Rank rows={data.pages.map((p) => ({ label: <code>{p.path}</code>, value: p.views, sub: `${nf(p.visitors)} pengunjung` }))} empty="Belum ada kunjungan terlacak. Pelacakan mulai merekam sejak versi ini dipasang." /></Panel>
      <Panel title="Sumber kunjungan" meta="perujuk"><Rank rows={data.referrers.map((r) => ({ label: r.ref, value: r.n }))} color="#7a3fb0" /></Panel>
    </div>
    <div className="adm-grid3">
      <Panel title="Perangkat"><Donut rows={data.devices.map((d) => ({ label: device[d.device] ?? d.device, value: d.n }))} /></Panel>
      <Panel title="Peramban"><Donut rows={data.browsers.map((d) => ({ label: d.browser, value: d.n }))} /></Panel>
      <Panel title="Hari dalam minggu"><TimeChart kind="bar" labels={DOW} series={[{ name: "Tampilan", values: dows, color: "#0e7490" }]} height={150} fmtLabel={(l) => l} /></Panel>
    </div>
    <Panel title="Jam tersibuk" meta="WIB"><TimeChart kind="bar" labels={hours.map((_, h) => String(h).padStart(2, "0"))} series={[{ name: "Tampilan", values: hours, color: "#1a5dc6" }]} height={150} fmtLabel={(l) => l} /></Panel>
    <Panel title="Aktivitas terbaru" meta="langsung" flush><Table rowKey={(r) => r.at + r.v + r.path} rows={data.recent} empty="Belum ada aktivitas." cols={[
      { head: "Waktu", cell: (r) => <span title={dTime(r.at)}>{ago(r.at)}</span> }, { head: "Halaman", cell: (r) => <code>{r.path}</code> }, { head: "Perangkat", cell: (r) => `${device[r.device] ?? r.device} · ${r.browser}`, hideSm: true },
      { head: "Mode", cell: (r) => (r.standalone ? <Pill tone="ok">aplikasi</Pill> : <Pill>web</Pill>), hideSm: true }, { head: "Pengunjung", cell: (r) => <code>{r.v}</code>, hideSm: true }]} /></Panel>
  </div>;
}

/* ============ Keuangan ============ */
type Fin = { range: Q; byCategory: { id: string; n: number; s: number }[]; bySource: { source: string; n: number; s: number }[]; kinds: { kind: string; n: number; s: number }[]; topUsers: { id: string; name: string; email: string; n: number; spent: number; income: number }[]; receipts: { status: string; n: number; conf: number }[]; mail: { status: string; n: number }[]; mailChannels: { channel: string; n: number; ok: number }[]; assets: { kind: string; n: number; v: number }[]; goals: { n: number; u: number }; sizes: { budgets: number; bills: number; debts: number; accounts: number } };
const KIND: Record<string, string> = { out: "Pengeluaran", in: "Pemasukan", tf: "Transfer" }, SOURCE: Record<string, string> = { manual: "Manual", scan: "Scan struk", email: "Email", voice: "Suara", sheet: "Sheets", import: "Impor", djiwapay: "Djiwa Pay" };
const ASSET: Record<string, string> = { gold: "Emas", property: "Properti", vehicle: "Kendaraan", electronics: "Elektronik", cash: "Tunai", stock: "Saham", crypto: "Kripto", other: "Lainnya" };
export function FinancePage({ range, openUser }: { range: Q; openUser: (id: string) => void }) {
  const { data, error, reload } = useAdmin<Fin>(`finance?${qs(range)}`, 0);
  const ov = useAdmin<Overview>(`overview?${qs(range)}`, 0);
  if (!data) return error ? <Err e={error} retry={reload} /> : <Loading />;
  const o = ov.data, days = o?.daily.map((d) => d.day) ?? [], n = data.kinds.reduce((s, k) => s + k.n, 0);
  return <div className="adm-stack">
    <Kpis items={[...data.kinds.map((k) => ({ label: KIND[k.kind] ?? k.kind, value: rp(k.s), hint: `${nf(k.n)} catatan` })), { label: "Total catatan", value: nf(n), hint: rangeLabel(range) }, { label: "Struk dipindai", value: nf(data.receipts.reduce((s, r) => s + r.n, 0)), hint: `${nf(data.receipts.find((r) => r.status === "failed")?.n ?? 0)} gagal baca` }, { label: "Tujuan tabungan", value: nf(data.goals.n), hint: `${nf(data.goals.u)} pengguna` }]} />
    {o ? <Panel title="Catatan per hari" meta="jumlah & nilai"><TimeChart labels={days} kind="bar" series={[{ name: "Catatan", values: o.daily.map((d) => d.entries), color: "#1a5dc6" }]} /></Panel> : null}
    <div className="adm-grid2">
      <Panel title="Pengeluaran per kategori" meta="nilai"><Rank color="#c73822" fmt={compact} rows={data.byCategory.map((c) => ({ label: catName(c.id), value: c.s, sub: `${nf(c.n)} catatan` }))} /></Panel>
      <Panel title="Cara mencatat"><Donut rows={data.bySource.map((s) => ({ label: SOURCE[s.source] ?? s.source, value: s.n }))} center={<><b>{nf(n)}</b><small>catatan</small></>} /></Panel>
    </div>
    <div className="adm-grid2">
      <Panel title="Email pembayaran" meta="status"><Donut rows={data.mail.map((m) => ({ label: m.status, value: m.n }))} /></Panel>
      <Panel title="Penerbit email" meta="otomatis / total"><Rank rows={data.mailChannels.map((m) => ({ label: m.channel || "tak dikenal", value: m.n, sub: `${nf(m.ok)} otomatis` }))} color="#0e7490" /></Panel>
    </div>
    <div className="adm-grid2">
      <Panel title="Aset yang dicatat" meta="seluruh waktu"><Rank fmt={nf} color="#9a6200" rows={data.assets.map((a) => ({ label: ASSET[a.kind] ?? a.kind, value: a.n, sub: rp(a.v) }))} /></Panel>
      <Panel title="Fitur perencanaan" meta="seluruh waktu"><dl className="adm-dl"><div><dt>Rekening/dompet</dt><dd>{nf(data.sizes.accounts)}</dd></div><div><dt>Anggaran</dt><dd>{nf(data.sizes.budgets)}</dd></div><div><dt>Tagihan</dt><dd>{nf(data.sizes.bills)}</dd></div><div><dt>Hutang piutang</dt><dd>{nf(data.sizes.debts)}</dd></div></dl></Panel>
    </div>
    <Panel title="Pencatat teraktif" meta={rangeLabel(range)} flush><Table rowKey={(r) => r.id} rows={data.topUsers} onRow={(r) => openUser(r.id)} cols={[{ head: "Pengguna", cell: (r) => <><b>{r.name}</b><small className="adm-sub">{r.email}</small></> }, { head: "Catatan", cell: (r) => nf(r.n), right: true }, { head: "Pengeluaran", cell: (r) => rp(r.spent), right: true, hideSm: true }, { head: "Pemasukan", cell: (r) => rp(r.income), right: true, hideSm: true }]} /></Panel>
  </div>;
}

/* ============ Dompet ============ */
type Wal = { range: Q; empty?: boolean; daily: { day: string; credit: number; debit: number; n: number }[]; types: { t: string; direction: string; n: number; s: number }[]; topups: { status: string; n: number; s: number }[]; topBalances: { id: string; name: string; email: string; b: number }[]; recent: { id: string; amount: number; direction: string; t: string; status: string; created_at: string; note: string | null; name: string | null; email: string | null }[]; pending: { n: number; s: number }; sources: { app: string; n: number; s: number }[] };
const TYPE: Record<string, string> = { topup_completed: "Isi saldo", order_debit: "Belanja pesanan", transaction_reward: "Hadiah transaksi", adjustment: "Penyesuaian", wallet_release: "Dana dilepas", wallet_hold: "Dana ditahan", wallet_transfer_received: "Transfer masuk", wallet_transfer_sent: "Transfer keluar" };
export function WalletPage({ range, openUser }: { range: Q; openUser: (id: string) => void }) {
  const { data, error, reload } = useAdmin<Wal>(`wallet?${qs(range)}`, 60_000);
  if (!data) return error ? <Err e={error} retry={reload} /> : <Loading />;
  if (data.empty) return <Empty>Database pelanggan belum terhubung.</Empty>;
  const credit = data.daily.reduce((s, d) => s + d.credit, 0), debit = data.daily.reduce((s, d) => s + d.debit, 0), paid = data.topups.find((t) => t.status === "paid");
  return <div className="adm-stack">
    <Kpis items={[{ label: "Dana masuk", value: rp(credit), hint: "selesai" }, { label: "Dana keluar", value: rp(debit), hint: "selesai" }, { label: "Isi saldo dibayar", value: rp(paid?.s ?? 0), hint: `${nf(paid?.n ?? 0)} transaksi` }, { label: "Isi saldo tertunda", value: nf(data.pending.n), hint: rp(data.pending.s), tone: data.pending.n > 20 ? "warn" : undefined }, { label: "Mutasi", value: nf(data.daily.reduce((s, d) => s + d.n, 0)), hint: rangeLabel(range) }]} />
    <Panel title="Arus dana harian" meta="masuk vs keluar"><TimeChart kind="bar" labels={data.daily.map((d) => d.day)} series={[{ name: "Masuk", values: data.daily.map((d) => d.credit), color: "#166534", money: true }, { name: "Keluar", values: data.daily.map((d) => d.debit), color: "#c73822", money: true }]} /></Panel>
    <div className="adm-grid2">
      <Panel title="Jenis transaksi" meta="nilai"><Rank fmt={compact} rows={data.types.map((t) => ({ label: `${TYPE[t.t] ?? t.t} ${t.direction === "credit" ? "▲" : "▼"}`, value: t.s, sub: `${nf(t.n)} transaksi` }))} color="#1a5dc6" /></Panel>
      <Panel title="Asal transaksi"><Donut fmt={compact} rows={data.sources.map((s) => ({ label: s.app === "djiwapay" ? "Djiwa Pay" : s.app, value: s.s }))} /></Panel>
    </div>
    <div className="adm-grid2">
      <Panel title="Saldo terbesar" flush><Table rowKey={(r) => r.id} rows={data.topBalances} onRow={(r) => openUser(r.id)} cols={[{ head: "Pengguna", cell: (r) => <><b>{r.name}</b><small className="adm-sub">{r.email}</small></> }, { head: "Saldo", cell: (r) => rp(r.b), right: true }]} /></Panel>
      <Panel title="Mutasi terbaru" flush><Table rowKey={(r) => r.id} rows={data.recent} cols={[{ head: "Pengguna", cell: (r) => <><b>{r.name ?? "—"}</b><small className="adm-sub">{TYPE[r.t] ?? r.t} · {ago(r.created_at)}</small></> }, { head: "Jumlah", cell: (r) => <span className={r.direction === "credit" ? "adm-up" : "adm-dn"}>{r.direction === "credit" ? "+" : "−"}{rp(r.amount)}</span>, right: true }]} /></Panel>
    </div>
  </div>;
}

/* ============ Sistem & admin ============ */
type Sys = { tables: { t: string; n: number }[]; hooks: number; pageViews: number; trackingSince: string | null; authDb: boolean; node: string; uptime: number; memoryMb: number; time: string };
type Admins = { admins: { email: string; added_by: string | null; created_at: string }[] };
export function SystemPage({ me }: { me: string }) {
  const sys = useAdmin<Sys>("system", 30_000), admins = useAdmin<Admins>("admins"), [email, setEmail] = useState(""), [msg, setMsg] = useState<string | null>(null), [busy, setBusy] = useState(false);
  const add = async () => { setBusy(true); setMsg(null); try { await adminFetch("admins", { method: "POST", body: JSON.stringify({ email }) }); setEmail(""); admins.reload(); } catch { setMsg("Email tidak valid."); } setBusy(false); };
  const del = async (e: string) => { if (!window.confirm(`Cabut akses admin dari ${e}?`)) return; try { await adminFetch(`admins?email=${encodeURIComponent(e)}`, { method: "DELETE" }); admins.reload(); } catch { setMsg("Admin utama atau akun Anda sendiri tidak bisa dihapus."); } };
  const s = sys.data, up = s ? `${Math.floor(s.uptime / 3600)} j ${Math.floor((s.uptime % 3600) / 60)} m` : "—";
  const total = useMemo(() => (s?.tables ?? []).reduce((a, t) => a + t.n, 0), [s]);
  return <div className="adm-stack">
    <Kpis items={[{ label: "API", value: s ? "Aktif" : "…", tone: s ? "ok" : undefined, hint: s ? `Bun · aktif ${up}` : "" }, { label: "Database pelanggan", value: s?.authDb ? "Terhubung" : "Tidak", tone: s?.authDb ? "ok" : "bad" }, { label: "Memori API", value: s ? `${s.memoryMb} MB` : "…" }, { label: "Page view tersimpan", value: nf(s?.pageViews ?? 0), hint: s?.trackingSince ? `sejak ${dLong(s.trackingSince.slice(0, 10))}` : "belum ada" }, { label: "Total baris tabel", value: compact(total) }]} />
    <div className="adm-grid2">
      <Panel title="Admin" meta="akses halaman ini">
        <ul className="adm-admins"><AnimatePresence initial={false}>{(admins.data?.admins ?? []).map((a) => <motion.li key={a.email} layout initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}><div><b>{a.email}</b><small>{a.added_by === "env" || a.added_by === "seed" ? "admin utama" : `ditambah ${a.added_by ?? "—"}`} · {dLong(a.created_at.slice(0, 10))}</small></div>{a.email === me.toLowerCase() ? <Pill tone="info">Anda</Pill> : a.added_by === "env" || a.added_by === "seed" ? <Pill>utama</Pill> : <button type="button" className="adm-link dn" onClick={() => void del(a.email)}>Cabut</button>}</motion.li>)}</AnimatePresence></ul>
        <form className="adm-add" onSubmit={(e) => { e.preventDefault(); if (email.trim()) void add(); }}><input type="email" inputMode="email" placeholder="email@contoh.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email admin baru" /><button type="submit" disabled={busy || !email.trim()}>Tambah admin</button></form>
        <AnimatePresence>{msg ? <motion.p className="adm-err" role="alert" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>{msg}</motion.p> : null}</AnimatePresence>
        <p className="adm-note">Admin harus masuk ke Djiwa Pay dengan email yang sama.</p>
      </Panel>
      <Panel title="Tabel keuangan" meta="perkiraan baris" flush><Table rowKey={(r) => r.t} rows={s?.tables ?? []} cols={[{ head: "Tabel", cell: (r) => <code>{r.t}</code> }, { head: "Baris", cell: (r) => nf(r.n), right: true }]} /></Panel>
    </div>
  </div>;
}

export { Delta, Tabs, COLORS };
