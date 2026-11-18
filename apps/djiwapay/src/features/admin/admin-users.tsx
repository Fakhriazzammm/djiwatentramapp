import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ago, dLong, dTime, nf, rp, useAdmin } from "./admin-data";
import { Empty, Kpis, Loading, Panel, Pill, Table, Tabs } from "./admin-ui";

type Row = { id: string; name: string | null; email: string | null; phone: string | null; photo_url: string | null; is_active: boolean; created_at: string; last_active_at: string | null; total_orders: number; total_spent: number; balance: number; held: number; has_pin: boolean; finance: { entries: number; google: boolean; seen: string | null } | null };
type List = { total: number; page: number; size: number; rows: Row[] };
const SORTS = [["new", "Terbaru"], ["active", "Aktif terakhir"], ["spent", "Belanja terbanyak"], ["balance", "Saldo terbesar"], ["name", "Nama A–Z"], ["old", "Terlama"]] as const;
const FILTERS = [["", "Semua"], ["wallet", "Ada saldo"], ["pin", "Punya PIN"], ["inactive", "Nonaktif"]] as const;

const Av = ({ r, size = 34 }: { r: { name: string | null; photo_url: string | null }; size?: number }) => <motion.span className="adm-av" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 380, damping: 20 }} style={{ width: size, height: size, fontSize: size * 0.42 }}>{r.photo_url ? <img src={r.photo_url} alt="" referrerPolicy="no-referrer" loading="lazy" /> : (r.name ?? "?").trim()[0]?.toUpperCase() ?? "?"}</motion.span>;

export function UsersPage({ open }: { open: (id: string) => void }) {
  const [q, setQ] = useState(""), [term, setTerm] = useState(""), [sort, setSort] = useState<(typeof SORTS)[number][0]>("new"), [filter, setFilter] = useState<(typeof FILTERS)[number][0]>(""), [page, setPage] = useState(1);
  useEffect(() => { const t = window.setTimeout(() => { setTerm(q); setPage(1); }, 300); return () => window.clearTimeout(t); }, [q]);
  const { data, error, loading, reload } = useAdmin<List>(`users?q=${encodeURIComponent(term)}&sort=${sort}&filter=${filter}&page=${page}`);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.size)) : 1;
  return <div className="adm-stack">
    <div className="adm-toolbar">
      <motion.input whileFocus={{ scale: 1.01 }} className="adm-search" type="search" placeholder="Cari nama, email, nomor HP, atau ID…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cari pengguna" />
      <select value={sort} onChange={(e) => { setSort(e.target.value as typeof sort); setPage(1); }} aria-label="Urutkan">{SORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
    </div>
    <Tabs items={FILTERS} value={filter} onChange={(f) => { setFilter(f); setPage(1); }} />
    <Panel title={data ? `${nf(data.total)} pengguna` : "Pengguna"} meta={loading ? "memuat…" : `halaman ${page}/${pages}`} flush>
      {error && !data ? <div className="adm-err">Gagal memuat ({error}). <button type="button" onClick={reload}>Coba lagi</button></div> : !data ? <Loading /> :
        <Table rowKey={(r) => r.id} rows={data.rows} onRow={(r) => open(r.id)} empty="Tidak ada pengguna yang cocok." cols={[
          { head: "Pengguna", cell: (r) => <div className="adm-who"><Av r={r} /><div><b>{r.name || "Tanpa nama"}</b><small className="adm-sub">{r.email || r.phone || r.id.slice(0, 10)}</small></div></div> },
          { head: "Saldo", cell: (r) => rp(r.balance), right: true }, { head: "Belanja", cell: (r) => <>{rp(r.total_spent)}<small className="adm-sub">{nf(r.total_orders)} pesanan</small></>, right: true, hideSm: true },
          { head: "Keuangan", cell: (r) => (r.finance ? <>{nf(r.finance.entries)} catatan{r.finance.google ? <Pill tone="info">Google</Pill> : null}</> : <span className="adm-mute">—</span>), hideSm: true },
          { head: "Status", cell: (r) => <>{r.is_active ? null : <Pill tone="bad">nonaktif</Pill>}{r.has_pin ? <Pill tone="ok">PIN</Pill> : null}<small className="adm-sub">{ago(r.last_active_at)}</small></>, hideSm: true },
          { head: "Daftar", cell: (r) => dLong(r.created_at.slice(0, 10)), right: true, hideSm: true }]} />}
      {data && pages > 1 ? <div className="adm-pager"><button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Sebelumnya</button><span>{page} / {pages}</span><button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)}>Berikutnya →</button></div> : null}
    </Panel>
  </div>;
}

type Detail = { profile: Record<string, any>; ledger: { id: string; amount: number; direction: string; status: string; transaction_type: string; balance_after: number; note: string | null; created_at: string; source_app: string | null }[]; topups: { amount: number; status: string; created_at: string; paid_at: string | null }[]; finance: Record<string, any>; kinds: { kind: string; n: number; sum: number }[]; traffic: { n: number; last: string | null; days: number; recent: { at: string; path: string; device: string; browser: string; standalone: boolean }[] }; google: { connected: boolean }; push: number };
const TYPE: Record<string, string> = { topup_completed: "Isi saldo", order_debit: "Belanja", transaction_reward: "Hadiah", adjustment: "Penyesuaian", wallet_release: "Dana dilepas", wallet_hold: "Ditahan" };
export function UserDetailPage({ id, back }: { id: string; back: () => void }) {
  const { data, error, reload } = useAdmin<Detail>(`users/${encodeURIComponent(id)}`);
  const [tab, setTab] = useState<"ringkas" | "dompet" | "aktivitas">("ringkas");
  if (!data) return error ? <div className="adm-err">Pengguna tidak ditemukan ({error}). <button type="button" onClick={back}>Kembali</button> <button type="button" onClick={reload}>Muat ulang</button></div> : <Loading />;
  const p = data.profile, f = data.finance, kind = (k: string) => data.kinds.find((x) => x.kind === k);
  const rows: [string, string][] = [["ID", p.source_id], ["Email", p.email || "—"], ["Nomor HP", p.phone || "—"], ["Username", p.username || "—"], ["Kota", [p.city, p.province].filter(Boolean).join(", ") || "—"], ["Jenis kelamin", p.gender || "—"], ["Terdaftar", dLong(String(p.created_at).slice(0, 10))], ["Aktif terakhir", dTime(p.last_active_at)], ["Kunjungan aplikasi", nf(p.djiwaapp_visit_count ?? 0)], ["Poin", nf(p.total_points ?? 0)], ["Member hingga", p.membership_expires_at ? dLong(String(p.membership_expires_at).slice(0, 10)) : "—"]];
  return <div className="adm-stack">
    <motion.button type="button" className="adm-back" onClick={back} whileHover={{ x: -3 }} whileTap={{ scale: 0.96 }}>← Semua pengguna</motion.button>
    <Panel><div className="adm-prof"><Av r={p as any} size={56} /><div><h2>{p.name || "Tanpa nama"}</h2><span className="adm-sub">{p.email} {p.phone ? `· ${p.phone}` : ""}</span><div className="adm-tags">{p.is_active ? <Pill tone="ok">aktif</Pill> : <Pill tone="bad">nonaktif</Pill>}{p.has_pin ? <Pill tone="ok">PIN aktif</Pill> : <Pill>tanpa PIN</Pill>}{p.locked_until && new Date(p.locked_until) > new Date() ? <Pill tone="bad">PIN terkunci</Pill> : null}{data.google.connected ? <Pill tone="info">Google terhubung</Pill> : null}{data.push ? <Pill>push {data.push}</Pill> : null}</div></div></div></Panel>
    <Kpis items={[{ label: "Saldo dompet", value: rp(p.available_balance), hint: `tertahan ${rp(p.held_balance)}` }, { label: "Total masuk", value: rp(p.total_credited) }, { label: "Total keluar", value: rp(p.total_debited) }, { label: "Belanja pesanan", value: rp(p.total_spent), hint: `${nf(p.total_orders ?? 0)} pesanan` }, { label: "Catatan keuangan", value: nf(f.entries), hint: `${nf(f.accounts)} dompet` }, { label: "Hari aktif di Pay", value: nf(data.traffic.days), hint: `${nf(data.traffic.n)} tampilan` }]} />
    <Tabs items={[["ringkas", "Ringkasan"], ["dompet", "Dompet"], ["aktivitas", "Aktivitas"]] as const} value={tab} onChange={setTab} />
    {tab === "ringkas" ? <div className="adm-grid2">
      <Panel title="Profil"><dl className="adm-dl">{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd className="adm-wrap">{v}</dd></div>)}</dl></Panel>
      <Panel title="Keuangan pribadi"><dl className="adm-dl">
        <div><dt>Pengeluaran tercatat</dt><dd>{rp(kind("out")?.sum ?? 0)} <small>({nf(kind("out")?.n ?? 0)})</small></dd></div><div><dt>Pemasukan tercatat</dt><dd>{rp(kind("in")?.sum ?? 0)} <small>({nf(kind("in")?.n ?? 0)})</small></dd></div><div><dt>Transfer</dt><dd>{rp(kind("tf")?.sum ?? 0)} <small>({nf(kind("tf")?.n ?? 0)})</small></dd></div>
        <div><dt>Anggaran</dt><dd>{nf(f.budgets)}</dd></div><div><dt>Tujuan</dt><dd>{nf(f.goals)}</dd></div><div><dt>Hutang piutang</dt><dd>{nf(f.debts)}</dd></div><div><dt>Aset</dt><dd>{nf(f.assets)}</dd></div><div><dt>Struk</dt><dd>{nf(f.receipts)}</dd></div><div><dt>Sumber email</dt><dd>{nf(f.sources)}</dd></div></dl></Panel>
    </div> : null}
    {tab === "dompet" ? <div className="adm-grid2">
      <Panel title="Mutasi terakhir" flush><Table rowKey={(r) => r.id} rows={data.ledger} empty="Belum ada mutasi." cols={[{ head: "Jenis", cell: (r) => <><b>{TYPE[r.transaction_type] ?? r.transaction_type}</b><small className="adm-sub">{dTime(r.created_at)}{r.status !== "completed" ? ` · ${r.status}` : ""}</small></> }, { head: "Jumlah", cell: (r) => <span className={r.direction === "credit" ? "adm-up" : "adm-dn"}>{r.direction === "credit" ? "+" : "−"}{rp(r.amount)}</span>, right: true }, { head: "Saldo", cell: (r) => rp(r.balance_after), right: true, hideSm: true }]} /></Panel>
      <Panel title="Isi saldo" flush><Table rowKey={(r) => r.created_at} rows={data.topups} empty="Belum pernah isi saldo." cols={[{ head: "Tanggal", cell: (r) => dTime(r.created_at) }, { head: "Status", cell: (r) => <Pill tone={r.status === "paid" ? "ok" : "warn"}>{r.status === "paid" ? "dibayar" : r.status}</Pill> }, { head: "Jumlah", cell: (r) => rp(r.amount), right: true }]} /></Panel>
    </div> : null}
    {tab === "aktivitas" ? <Panel title="Kunjungan terakhir" meta={`terakhir ${ago(data.traffic.last)}`} flush>{data.traffic.recent.length ? <Table rowKey={(r) => r.at + r.path} rows={data.traffic.recent} cols={[{ head: "Waktu", cell: (r) => dTime(r.at) }, { head: "Halaman", cell: (r) => <code>{r.path}</code> }, { head: "Perangkat", cell: (r) => `${r.device} · ${r.browser}`, hideSm: true }, { head: "Mode", cell: (r) => (r.standalone ? <Pill tone="ok">aplikasi</Pill> : <Pill>web</Pill>), hideSm: true }]} /> : <Empty>Belum ada kunjungan terlacak untuk pengguna ini.</Empty>}</Panel> : null}
  </div>;
}
