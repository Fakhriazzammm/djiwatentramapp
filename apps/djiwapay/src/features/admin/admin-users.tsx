import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { DEFAULT_CATEGORIES } from "../../lib/finance/categories";
import { ago, compact, dLong, dShort, dTime, nf, rp, useAdmin } from "./admin-data";
import { Donut, Empty, Kpis, Loading, Panel, Pill, Rank, Table, Tabs, TimeChart } from "./admin-ui";

export type Cohort = "baru" | "lama_pay" | "lama_belum";
const COHORT: Record<Cohort, { label: string; tone: "ok" | "info" | ""; hint: string }> = {
  baru: { label: "Baru di Pay", tone: "ok", hint: "Akun dibuat setelah Pay rilis" },
  lama_pay: { label: "Existing → Pay", tone: "info", hint: "Akun lama yang mulai memakai Pay" },
  lama_belum: { label: "Existing, belum buka Pay", tone: "", hint: "Akun lama tanpa jejak di Pay" },
};
const catName = (id: string) => DEFAULT_CATEGORIES.find((c) => c.id === id)?.name ?? id;
const CohortPill = ({ c }: { c: Cohort }) => <Pill tone={COHORT[c].tone}>{COHORT[c].label}</Pill>;

type PayInfo = { first: string | null; entries: number; views: number; seen: string | null; google: boolean; push: boolean; pwa: boolean; onboarded: boolean };
type Row = { id: string; name: string | null; email: string | null; phone: string | null; photo_url: string | null; is_active: boolean; created_at: string; last_active_at: string | null; total_orders: number; total_spent: number; balance: number; held: number; has_pin: boolean; cohort: Cohort; pay: PayInfo };
type List = { total: number; page: number; size: number; rows: Row[]; launch: string | null; cohorts: { baru: number; lama_pay: number; lama_belum: number; total: number } };
const SORTS = [["new", "Terbaru"], ["payfirst", "Pertama di Pay"], ["seen", "Terakhir dilihat di Pay"], ["entries", "Catatan terbanyak"], ["active", "Aktif terakhir"], ["spent", "Belanja terbanyak"], ["balance", "Saldo terbesar"], ["name", "Nama A–Z"], ["old", "Terlama"]] as const;
const FILTERS = [["", "Semua kriteria"], ["entries", "Punya catatan"], ["onboarded", "Selesai onboarding"], ["google", "Google terhubung"], ["push", "Notifikasi aktif"], ["pwa", "Pakai PWA"], ["wallet", "Ada saldo"], ["pin", "Punya PIN"], ["inactive", "Nonaktif"]] as const;
const COHORT_TABS = [["", "Semua"], ["baru", "Baru di Pay"], ["lama_pay", "Existing → Pay"], ["lama_belum", "Belum buka Pay"]] as const;

const Av = ({ r, size = 34 }: { r: { name: string | null; photo_url: string | null }; size?: number }) => <motion.span className="adm-av" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 380, damping: 20 }} style={{ width: size, height: size, fontSize: size * 0.42 }}>{r.photo_url ? <img src={r.photo_url} alt="" referrerPolicy="no-referrer" loading="lazy" /> : (r.name ?? "?").trim()[0]?.toUpperCase() ?? "?"}</motion.span>;

export function UsersPage({ open }: { open: (id: string) => void }) {
  const [view, setView] = useState<"daftar" | "tumbuh">("daftar");
  return <div className="adm-stack">
    <Tabs items={[["daftar", "Daftar pengguna"], ["tumbuh", "Pertumbuhan & analisis"]] as const} value={view} onChange={setView} />
    {view === "daftar" ? <UserList open={open} /> : <GrowthView open={open} />}
  </div>;
}

function UserList({ open }: { open: (id: string) => void }) {
  const [q, setQ] = useState(""), [term, setTerm] = useState(""), [sort, setSort] = useState<(typeof SORTS)[number][0]>("new"), [filter, setFilter] = useState<(typeof FILTERS)[number][0]>(""), [cohort, setCohort] = useState<(typeof COHORT_TABS)[number][0]>(""), [page, setPage] = useState(1), [busy, setBusy] = useState(false);
  useEffect(() => { const t = window.setTimeout(() => { setTerm(q); setPage(1); }, 300); return () => window.clearTimeout(t); }, [q]);
  const qs = `q=${encodeURIComponent(term)}&sort=${sort}&filter=${filter}&cohort=${cohort}`;
  const { data, error, loading, reload } = useAdmin<List>(`users?${qs}&page=${page}`);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.size)) : 1;
  const exportCsv = async () => {
    setBusy(true);
    try { const res = await fetch(`/api/finance/admin/users/export?${qs}`, { credentials: "include" }); if (!res.ok) throw new Error(String(res.status)); const url = URL.createObjectURL(await res.blob()), a = document.createElement("a"); a.href = url; a.download = "pengguna-djiwa-pay.csv"; a.click(); URL.revokeObjectURL(url); }
    catch { window.alert("Ekspor gagal. Coba lagi."); } finally { setBusy(false); }
  };
  const c = data?.cohorts;
  return <>
    {c ? <Kpis cols={4} items={[
      { label: "Total akun", value: nf(c.total), hint: data?.launch ? `Pay rilis ${dLong(data.launch.slice(0, 10))}` : undefined },
      { label: "Baru di Pay", value: nf(c.baru), hint: c.total ? `${Math.round((c.baru / c.total) * 100)}% dari semua akun` : undefined, tone: "ok" },
      { label: "Existing → Pay", value: nf(c.lama_pay), hint: "akun lama yang mencoba Pay" },
      { label: "Belum buka Pay", value: nf(c.lama_belum), hint: c.total ? `${Math.round((c.lama_belum / c.total) * 100)}% dari semua akun` : undefined }]} /> : null}
    <div className="adm-toolbar">
      <motion.input whileFocus={{ scale: 1.01 }} className="adm-search" type="search" placeholder="Cari nama, email, nomor HP, atau ID…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cari pengguna" />
      <select value={sort} onChange={(e) => { setSort(e.target.value as typeof sort); setPage(1); }} aria-label="Urutkan">{SORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      <select value={filter} onChange={(e) => { setFilter(e.target.value as typeof filter); setPage(1); }} aria-label="Kriteria">{FILTERS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      <motion.button type="button" className="adm-btn" disabled={busy} onClick={() => void exportCsv()} whileTap={{ scale: 0.95 }}>{busy ? "Menyiapkan…" : "Ekspor CSV"}</motion.button>
    </div>
    <Tabs items={COHORT_TABS} value={cohort} onChange={(v) => { setCohort(v); setPage(1); }} />
    <Panel title={data ? `${nf(data.total)} pengguna` : "Pengguna"} meta={loading ? "memuat…" : `halaman ${page}/${pages}`} flush>
      {error && !data ? <div className="adm-err">Gagal memuat ({error}). <button type="button" onClick={reload}>Coba lagi</button></div> : !data ? <Loading /> :
        <Table rowKey={(r) => r.id} rows={data.rows} onRow={(r) => open(r.id)} empty="Tidak ada pengguna yang cocok." cols={[
          { head: "Pengguna", cell: (r) => <div className="adm-who"><Av r={r} /><div><b>{r.name || "Tanpa nama"}</b><small className="adm-sub">{r.email || r.phone || r.id.slice(0, 10)}</small></div></div> },
          { head: "Kelompok", cell: (r) => <><CohortPill c={r.cohort} /><small className="adm-sub">{r.pay.first ? `di Pay sejak ${dLong(r.pay.first.slice(0, 10))}` : "belum terlihat di Pay"}</small></> },
          { head: "Di Pay", cell: (r) => (r.pay.first ? <>{nf(r.pay.entries)} catatan<small className="adm-sub">{r.pay.seen ? `dilihat ${ago(r.pay.seen)}` : `${nf(r.pay.views)} tampilan`}</small></> : <span className="adm-mute">—</span>), hideSm: true },
          { head: "Fitur", cell: (r) => <>{r.pay.onboarded ? <Pill tone="ok">onboarding</Pill> : null}{r.pay.google ? <Pill tone="info">Google</Pill> : null}{r.pay.push ? <Pill>notif</Pill> : null}{r.pay.pwa ? <Pill>PWA</Pill> : null}{!r.pay.first ? <span className="adm-mute">—</span> : null}</>, hideSm: true },
          { head: "Saldo", cell: (r) => <>{rp(r.balance)}<small className="adm-sub">{r.is_active ? `${nf(r.total_orders)} pesanan` : "nonaktif"}</small></>, right: true },
          { head: "Daftar", cell: (r) => dLong(r.created_at.slice(0, 10)), right: true, hideSm: true }]} />}
      {data && pages > 1 ? <div className="adm-pager"><button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Sebelumnya</button><span>{page} / {pages}</span><button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)}>Berikutnya →</button></div> : null}
    </Panel>
  </>;
}

/* ---------- growth & analysis ---------- */
type Person = { id: string; name: string; email: string; photo_url: string | null; entries: number; seen: string | null };
type Growth = {
  launch: string | null; activeUsers: { dau: number; wau: number; mau: number }; payUsers: number; totalAccounts: number; newAccounts: number; wallets: number;
  signups: { day: string; n: number; pay: number }[]; months: { m: string; n: number; pay: number }[];
  funnel: { label: string; all: number; baru: number }[]; retention: { week: string; size: number; weeks: number[] }[];
  features: { label: string; users: number; total: number; pct: number }[]; segments: { title: string; hint: string; count: number; people: Person[] }[];
};

function GrowthView({ open }: { open: (id: string) => void }) {
  const { data, error, reload } = useAdmin<Growth>("users/growth", 60_000);
  const [scope, setScope] = useState<"all" | "baru">("all");
  if (!data) return error ? <div className="adm-err">Gagal memuat ({error}). <button type="button" onClick={reload}>Coba lagi</button></div> : <Loading />;
  const top = Math.max(1, ...data.funnel.map((f) => f[scope]));
  return <div className="adm-stack">
    <Kpis cols={4} items={[{ label: "Pengguna Pay", value: nf(data.payUsers), hint: `dari ${nf(data.totalAccounts)} akun` }, { label: "Aktif hari ini", value: nf(data.activeUsers.dau), hint: "DAU" }, { label: "Aktif 7 hari", value: nf(data.activeUsers.wau), hint: "WAU" }, { label: "Aktif 30 hari", value: nf(data.activeUsers.mau), hint: "MAU" }]} />
    <div className="adm-grid2">
      <Panel title="Pendaftar baru per hari" meta="60 hari terakhir"><TimeChart kind="bar" stacked labels={data.signups.map((d) => d.day)} series={[{ name: "Sudah buka Pay", color: "#166534", values: data.signups.map((d) => d.pay) }, { name: "Belum buka Pay", color: "#c9cad2", values: data.signups.map((d) => d.n - d.pay) }]} /></Panel>
      <Panel title="Pendaftar per bulan" meta="akun baru dan yang sudah buka Pay"><Rank color="#1a5dc6" rows={data.months.slice().reverse().map((m) => ({ label: m.m, value: m.n, sub: `${nf(m.pay)} sudah buka Pay` }))} /></Panel>
    </div>
    <Panel title="Corong aktivasi" meta={<span className="adm-seg"><button type="button" className={scope === "all" ? "on" : ""} onClick={() => setScope("all")}>Semua akun</button><button type="button" className={scope === "baru" ? "on" : ""} onClick={() => setScope("baru")}>Baru di Pay</button></span>}>
      <ul className="adm-funnel">{data.funnel.map((f, i) => { const v = f[scope], prev = i ? data.funnel[i - 1][scope] : v; return <motion.li key={f.label} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06 }}>
        <div className="adm-funnel-t"><span>{f.label}</span><b>{nf(v)}</b><small>{i ? `${prev ? Math.round((v / prev) * 100) : 0}% dari langkah sebelumnya` : "semua akun"}</small></div>
        <div className="adm-funnel-bar"><motion.i initial={{ width: 0 }} animate={{ width: `${(v / top) * 100}%` }} transition={{ duration: 0.7, delay: 0.1 + i * 0.06 }} /></div></motion.li>; })}</ul>
    </Panel>
    <div className="adm-grid2">
      <Panel title="Retensi mingguan" meta="pengguna yang kembali per minggu sejak pertama aktif">
        {data.retention.length ? <div className="adm-heat"><table><thead><tr><th>Minggu masuk</th><th>Pengguna</th>{data.retention[0] ? Array.from({ length: Math.max(...data.retention.map((r) => r.weeks.length)) }, (_, i) => <th key={i}>M{i}</th>) : null}</tr></thead>
          <tbody>{data.retention.map((r) => <tr key={r.week}><th>{dShort(r.week)}</th><td>{nf(r.size)}</td>{Array.from({ length: Math.max(...data.retention.map((x) => x.weeks.length)) }, (_, i) => { const v = r.weeks[i]; const p = v === undefined || !r.size ? null : v / r.size; return <td key={i} className={p === null ? "na" : ""} style={p === null ? undefined : { background: `rgba(22,101,52,${0.08 + p * 0.8})`, color: p > 0.5 ? "#fff" : undefined }} title={v === undefined ? "" : `${v} pengguna`}>{p === null ? "" : `${Math.round(p * 100)}%`}</td>; })}</tr>)}</tbody></table><small className="adm-hint">Data aktivitas baru mulai tercatat sejak pelacakan dinyalakan, jadi kolom baru terisi seiring waktu.</small></div> : <Empty>Belum cukup data aktivitas.</Empty>}
      </Panel>
      <Panel title="Fitur yang dipakai" meta={`dari ${nf(data.payUsers)} pengguna Pay`}><Rank color="#7a3fb0" rows={data.features.map((f) => ({ label: f.label, value: f.users, sub: `${f.pct}% · ${nf(f.total)} data` }))} /></Panel>
    </div>
    <div className="adm-grid2">{data.segments.map((s, i) => <Panel key={s.title} title={s.title} meta={`${nf(s.count)} orang`}>
      <p className="adm-hint" style={{ marginTop: 0 }}>{s.hint}</p>
      {s.people.length ? <ul className="adm-seglist">{s.people.map((p, k) => <motion.li key={p.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: k * 0.04 + i * 0.05 }}><button type="button" onClick={() => open(p.id)}><Av r={{ name: p.name, photo_url: p.photo_url }} size={28} /><span><b>{p.name}</b><small className="adm-sub">{p.email}</small></span><em>{nf(p.entries)} catatan{p.seen ? ` · ${ago(p.seen)}` : ""}</em></button></motion.li>)}</ul> : <Empty>Tidak ada saat ini.</Empty>}
    </Panel>)}</div>
  </div>;
}

/* ---------- one person ---------- */
type Detail = {
  profile: Record<string, any>; ledger: { id: string; amount: number; direction: string; status: string; transaction_type: string; balance_after: number; note: string | null; created_at: string; source_app: string | null }[]; topups: { amount: number; status: string; created_at: string; paid_at: string | null }[];
  finance: Record<string, any>; kinds: { kind: string; n: number; sum: number }[]; traffic: { n: number; last: string | null; days: number; recent: { at: string; path: string; device: string; browser: string; standalone: boolean }[] }; google: { connected: boolean }; push: number;
  cohort: Cohort; launch: string | null; payFirst: string | null; score: number; idleDays: number | null; health: { tone: string; text: string }[]; timeline: { at: string; label: string; tone: string; hint: string }[]; features: { label: string; n: number }[];
  money: { months: { m: string; out: number; inc: number; n: number }[]; categories: { id: string; n: number; sum: number }[]; sources: { source: string; n: number; sum: number }[]; out: number; inc: number; outN: number; avgOut: number };
  behaviour: { hour: number[]; dow: number[]; devices: { device: string; browser: string; standalone: boolean; n: number; last: string }[]; pages: { path: string; n: number }[]; views: number; days: number; visitors: number; perDay: number; first: string | null };
  quality: { mail: { status: string; n: number }[]; receipts: { n: number; ok: number; conf: number }; emailEntries: number; emailWithReceipt: number; scans: number; scanDays: number };
  wallet: { topups: number; paid: number; paidSum: number; avg: number; first: string | null; last: string | null; pending: number };
};
const TYPE: Record<string, string> = { topup_completed: "Isi saldo", order_debit: "Belanja", transaction_reward: "Hadiah", adjustment: "Penyesuaian", wallet_release: "Dana dilepas", wallet_hold: "Ditahan" };
const SRC: Record<string, string> = { manual: "Manual", voice: "Suara / teks", pay: "Djiwa Pay", receipt: "Scan struk", email: "Email", sheet: "Google Sheets" };
const MAIL: Record<string, string> = { auto: "Otomatis tercatat", review: "Perlu ditinjau", approved: "Disetujui", rejected: "Ditolak", ignored: "Diabaikan", duplicate: "Duplikat", failed: "Gagal" };
const DAYS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
const TABS = [["ringkas", "Ringkasan"], ["linimasa", "Linimasa"], ["keuangan", "Keuangan"], ["perilaku", "Perilaku"], ["dompet", "Dompet"], ["aktivitas", "Aktivitas"]] as const;

export function UserDetailPage({ id, back }: { id: string; back: () => void }) {
  const { data, error, reload } = useAdmin<Detail>(`users/${encodeURIComponent(id)}`);
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("ringkas");
  const hourMax = useMemo(() => Math.max(1, ...(data?.behaviour.hour ?? [1])), [data]);
  if (!data) return error ? <div className="adm-err">Pengguna tidak ditemukan ({error}). <button type="button" onClick={back}>Kembali</button> <button type="button" onClick={reload}>Muat ulang</button></div> : <Loading />;
  const p = data.profile, f = data.finance, b = data.behaviour, m = data.money, q = data.quality, w = data.wallet;
  const rows: [string, string][] = [["ID", p.source_id], ["Email", p.email || "—"], ["Nomor HP", p.phone || "—"], ["Username", p.username || "—"], ["Kota", [p.city, p.province].filter(Boolean).join(", ") || "—"], ["Jenis kelamin", p.gender || "—"], ["Terdaftar", dLong(String(p.created_at).slice(0, 10))], ["Aktif terakhir", dTime(p.last_active_at)], ["Kunjungan Djiwa App", nf(p.djiwaapp_visit_count ?? 0)], ["Setuju pemasaran", p.marketing_consent ? "Ya" : "Tidak"]];
  const emailPct = q.emailEntries ? Math.round((q.emailWithReceipt / q.emailEntries) * 100) : 0;
  return <div className="adm-stack">
    <motion.button type="button" className="adm-back" onClick={back} whileHover={{ x: -3 }} whileTap={{ scale: 0.96 }}>← Semua pengguna</motion.button>
    <Panel><div className="adm-prof"><Av r={p as any} size={56} /><div><h2>{p.name || "Tanpa nama"}</h2><span className="adm-sub">{p.email} {p.phone ? `· ${p.phone}` : ""}</span>
      <div className="adm-tags"><CohortPill c={data.cohort} />{p.is_active ? <Pill tone="ok">aktif</Pill> : <Pill tone="bad">nonaktif</Pill>}{p.has_pin ? <Pill tone="ok">PIN aktif</Pill> : <Pill>tanpa PIN</Pill>}{data.google.connected ? <Pill tone="info">Google</Pill> : null}{data.push ? <Pill>notifikasi</Pill> : null}</div>
      <span className="adm-sub">{data.payFirst ? `Pertama terlihat di Pay ${dTime(data.payFirst)}` : "Belum pernah terlihat di Pay"} · {COHORT[data.cohort].hint}</span></div>
      <div className="adm-score" title="Seberapa jauh pengguna ini memanfaatkan Pay"><svg viewBox="0 0 42 42"><circle cx="21" cy="21" r="17" fill="none" stroke="#efeff2" strokeWidth="5" /><motion.circle cx="21" cy="21" r="17" fill="none" stroke={data.score >= 60 ? "#166534" : data.score >= 30 ? "#9a6200" : "#c73822"} strokeWidth="5" strokeLinecap="round" strokeDasharray={`${(data.score / 100) * 106.8} 106.8`} initial={{ strokeDasharray: "0 106.8" }} animate={{ strokeDasharray: `${(data.score / 100) * 106.8} 106.8` }} transition={{ duration: 0.9 }} transform="rotate(-90 21 21)" /></svg><b>{data.score}</b><small>skor aktivasi</small></div></div></Panel>
    <Kpis items={[{ label: "Saldo dompet", value: rp(p.available_balance), hint: `tertahan ${rp(p.held_balance)}` }, { label: "Catatan keuangan", value: nf(f.entries), hint: `${nf(f.accounts)} dompet · ${nf(f.budgets)} anggaran` }, { label: "Pengeluaran tercatat", value: rp(m.out), hint: `${nf(m.outN)} catatan · rata-rata ${rp(m.avgOut)}` }, { label: "Pemasukan tercatat", value: rp(m.inc) }, { label: "Hari aktif di Pay", value: nf(b.days), hint: `${nf(b.views)} tampilan · ${b.perDay}/hari` }, { label: "Terakhir aktif", value: data.idleDays === null ? "—" : data.idleDays === 0 ? "hari ini" : `${data.idleDays} hari lalu`, tone: data.idleDays !== null && data.idleDays > 14 ? "warn" : undefined }]} />
    <Panel title="Kesehatan akun" meta="otomatis"><ul className="adm-health">{data.health.map((h, i) => <motion.li key={i} className={h.tone} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}>{h.text}</motion.li>)}</ul></Panel>
    <Tabs items={TABS} value={tab} onChange={setTab} />
    {tab === "ringkas" ? <div className="adm-grid2">
      <Panel title="Profil"><dl className="adm-dl">{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd className="adm-wrap">{v}</dd></div>)}</dl></Panel>
      <Panel title="Fitur yang dipakai" meta="jumlah data"><Rank color="#7a3fb0" rows={data.features.filter((x) => x.n > 0).map((x) => ({ label: x.label, value: x.n }))} empty="Belum memakai fitur apa pun." />{data.features.filter((x) => x.n === 0).length ? <p className="adm-hint">Belum dicoba: {data.features.filter((x) => x.n === 0).map((x) => x.label).join(", ")}</p> : null}</Panel>
    </div> : null}
    {tab === "linimasa" ? <Panel title="Perjalanan pengguna" meta={`${data.timeline.length} kejadian`}><ol className="adm-tl">{data.timeline.map((e, i) => <motion.li key={i} className={e.tone} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i, 12) * 0.04 }}><i /><div><b>{e.label}</b>{e.hint ? <small className="adm-sub">{e.hint}</small> : null}</div><time>{dTime(e.at)}</time></motion.li>)}</ol></Panel> : null}
    {tab === "keuangan" ? <div className="adm-stack">
      <div className="adm-grid2">
        <Panel title="Masuk dan keluar per bulan" meta="12 bulan terakhir">{m.months.length ? <TimeChart kind="bar" labels={m.months.map((x) => `${x.m}-01`)} fmtLabel={(l) => l.slice(0, 7)} series={[{ name: "Pemasukan", color: "#166534", values: m.months.map((x) => x.inc), money: true }, { name: "Pengeluaran", color: "#c73822", values: m.months.map((x) => x.out), money: true }]} /> : <Empty>Belum ada catatan.</Empty>}</Panel>
        <Panel title="Pengeluaran per kategori" meta="nilai"><Rank color="#c73822" fmt={compact} rows={m.categories.map((c) => ({ label: catName(c.id), value: c.sum, sub: `${nf(c.n)} catatan` }))} empty="Belum ada pengeluaran." /></Panel>
      </div>
      <div className="adm-grid2">
        <Panel title="Asal catatan"><Donut rows={m.sources.map((s) => ({ label: SRC[s.source] ?? s.source, value: s.n }))} center={<b>{nf(f.entries)}</b>} /></Panel>
        <Panel title="Kualitas data" meta="seberapa lengkap"><dl className="adm-dl">
          <div><dt>Catatan dari email</dt><dd>{nf(q.emailEntries)}</dd></div><div><dt>…yang sudah dilengkapi struk</dt><dd>{nf(q.emailWithReceipt)} <small>({emailPct}%)</small></dd></div>
          <div><dt>Struk dipindai</dt><dd>{nf(q.receipts.n)} <small>({nf(q.receipts.ok)} terbaca)</small></dd></div><div><dt>Rata-rata keyakinan baca struk</dt><dd>{q.receipts.n ? `${Math.round(q.receipts.conf * 100)}%` : "—"}</dd></div>
          <div><dt>Scan struk total / hari berbeda</dt><dd>{nf(q.scans)} / {nf(q.scanDays)}</dd></div>
          {q.mail.map((x) => <div key={x.status}><dt>Email: {MAIL[x.status] ?? x.status}</dt><dd>{nf(x.n)}</dd></div>)}</dl></Panel>
      </div>
    </div> : null}
    {tab === "perilaku" ? <div className="adm-stack">
      <div className="adm-grid2">
        <Panel title="Jam paling aktif" meta="WIB"><div className="adm-hours">{b.hour.map((n, h) => <motion.span key={h} title={`${h}.00 — ${n} aktivitas`} initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ delay: h * 0.015 }} style={{ height: `${Math.max(4, (n / hourMax) * 100)}%`, opacity: n ? 1 : 0.25 }}><em>{h % 6 === 0 ? h : ""}</em></motion.span>)}</div></Panel>
        <Panel title="Hari paling aktif"><Rank color="#0e7490" rows={b.dow.map((n, i) => ({ label: DAYS[i], value: n }))} /></Panel>
      </div>
      <div className="adm-grid2">
        <Panel title="Perangkat" flush><Table rowKey={(r) => `${r.device}${r.browser}${r.standalone}`} rows={b.devices} empty="Belum ada data." cols={[{ head: "Perangkat", cell: (r) => <>{r.device} · {r.browser}{r.standalone ? <Pill tone="ok">PWA</Pill> : null}</> }, { head: "Tampilan", cell: (r) => nf(r.n), right: true }, { head: "Terakhir", cell: (r) => ago(r.last), right: true, hideSm: true }]} /></Panel>
        <Panel title="Halaman paling sering dibuka"><Rank rows={b.pages.map((x) => ({ label: <code>{x.path}</code>, value: x.n }))} empty="Belum ada data." /></Panel>
      </div>
    </div> : null}
    {tab === "dompet" ? <div className="adm-stack">
      <Kpis items={[{ label: "Percobaan isi saldo", value: nf(w.topups), hint: `${nf(w.paid)} berhasil · ${nf(w.pending)} menunggu` }, { label: "Total isi saldo", value: rp(w.paidSum), hint: `rata-rata ${rp(w.avg)}` }, { label: "Isi saldo pertama", value: w.first ? dLong(w.first.slice(0, 10)) : "—" }, { label: "Isi saldo terakhir", value: w.last ? dLong(w.last.slice(0, 10)) : "—" }, { label: "Total masuk", value: rp(p.total_credited) }, { label: "Total keluar", value: rp(p.total_debited), hint: `belanja ${rp(p.total_spent)} (${nf(p.total_orders ?? 0)} pesanan)` }]} />
      <div className="adm-grid2">
        <Panel title="Mutasi terakhir" flush><Table rowKey={(r) => r.id} rows={data.ledger} empty="Belum ada mutasi." cols={[{ head: "Jenis", cell: (r) => <><b>{TYPE[r.transaction_type] ?? r.transaction_type}</b><small className="adm-sub">{dTime(r.created_at)}{r.status !== "completed" ? ` · ${r.status}` : ""}{r.source_app ? ` · ${r.source_app}` : ""}</small></> }, { head: "Jumlah", cell: (r) => <span className={r.direction === "credit" ? "adm-up" : "adm-dn"}>{r.direction === "credit" ? "+" : "−"}{rp(r.amount)}</span>, right: true }, { head: "Saldo", cell: (r) => rp(r.balance_after), right: true, hideSm: true }]} /></Panel>
        <Panel title="Isi saldo" flush><Table rowKey={(r) => r.created_at} rows={data.topups} empty="Belum pernah isi saldo." cols={[{ head: "Tanggal", cell: (r) => dTime(r.created_at) }, { head: "Status", cell: (r) => <Pill tone={r.status === "paid" ? "ok" : "warn"}>{r.status === "paid" ? "dibayar" : r.status}</Pill> }, { head: "Jumlah", cell: (r) => rp(r.amount), right: true }]} /></Panel>
      </div>
    </div> : null}
    {tab === "aktivitas" ? <Panel title="Kunjungan terakhir" meta={`terakhir ${ago(data.traffic.last)}`} flush>{data.traffic.recent.length ? <Table rowKey={(r) => r.at + r.path} rows={data.traffic.recent} cols={[{ head: "Waktu", cell: (r) => dTime(r.at) }, { head: "Halaman", cell: (r) => <code>{r.path}</code> }, { head: "Perangkat", cell: (r) => `${r.device} · ${r.browser}`, hideSm: true }, { head: "Mode", cell: (r) => (r.standalone ? <Pill tone="ok">PWA</Pill> : <Pill>browser</Pill>), hideSm: true }]} /> : <Empty>Belum ada kunjungan tercatat.</Empty>}</Panel> : null}
  </div>;
}
