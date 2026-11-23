import { motion } from "framer-motion";
import { dShort, nf, useAdmin } from "./admin-data";
import { Donut, Kpis, Loading, Panel, Pill, Rank, Table, TimeChart } from "./admin-ui";

type Health = {
  range: { from: string; to: string; days: number };
  mail: { total: number; recorded: number; waiting: number; failed: number; duplicate: number; rejected: number; ignored: number; readRate: number | null; unreadable: number };
  banks: { channel: string; total: number; ok: number; bad: number; rejected: number; waiting: number; readRate: number | null }[]; worstBanks: { channel: string; total: number; ok: number; bad: number; readRate: number | null }[];
  skips: { reason: string; n: number }[]; senders: { domain: string; reason: string; n: number }[];
  ai: { calls: number; users: number; atLimit: number; dailyLimit: number; days: { day: string; calls: number; users: number }[]; cacheRows: number; cacheHits: number };
  jobs: { gmail: { total: number; enabled: number; failing: number }; hooks: { total: number; active: number; weak: number }; notif: { users: number; received: number; active: number }; imports: Record<string, number>; importErrors: { error: string; n: number }[]; scans: Record<string, number>; sheets: Record<string, number>; sheetErrors: { error: string; n: number }[] };
};
const SKIP: Record<string, string> = { "sender-not-allowed": "Pengirim tidak terdaftar", "auth-failed": "Verifikasi pengirim gagal", secret: "Kode OTP atau rahasia", promo: "Promosi", report: "Laporan periodik", failed: "Transaksi gagal", notice: "Pengumuman", bill: "Pengingat tagihan", "not-payment": "Bukan pembayaran", limit: "Batas harian", unreadable: "Nominal tidak terbaca" };
const REASON: Record<string, string> = { "auth-failed": "verifikasi gagal", "sender-not-allowed": "tidak terdaftar", secret: "kode rahasia" };
const bankName = (id: string) => id.replace(/(^|-)([a-z])/g, (_m, a: string, b: string) => (a ? " " : "") + b.toUpperCase());
const tone = (rate: number | null): "ok" | "warn" | "bad" | "" => (rate === null ? "" : rate >= 90 ? "ok" : rate >= 70 ? "warn" : "bad");
const qs = (r: { from: string; to: string }) => `from=${r.from}&to=${r.to}`;

/** Kesehatan data: seberapa banyak email dan notifikasi yang menjadi catatan, bank dan pengirim yang sering gagal, pemakaian kuota AI, dan pekerjaan latar. */
export function HealthPage({ range }: { range: { from: string; to: string } }) {
  const { data: h, error, reload } = useAdmin<Health>(`health?${qs(range)}`, 60_000);
  if (!h) return error ? <div className="adm-err" role="alert">Gagal memuat ({error}). <button type="button" className="adm-link" onClick={reload}>Coba lagi</button></div> : <Loading />;
  const m = h.mail, jobs = h.jobs, hit = h.ai.cacheRows ? Math.round((h.ai.cacheHits / (h.ai.cacheHits + h.ai.cacheRows)) * 100) : null;
  const sheetsBad = (jobs.sheets.failed ?? 0) + (jobs.sheets.missing ?? 0) + (jobs.sheets.held ?? 0);
  return <div className="adm-stack">
    <Kpis items={[
      { label: "Email terbaca", value: m.readRate === null ? "—" : `${m.readRate}%`, tone: tone(m.readRate) || undefined, hint: `${nf(m.recorded + m.waiting)} jadi catatan atau antrean, ${nf(m.failed + m.unreadable)} gagal` },
      { label: "Tercatat", value: nf(m.recorded), hint: `${nf(m.duplicate)} duplikat dilewati` },
      { label: "Menunggu tinjau", value: nf(m.waiting), tone: m.waiting > 200 ? "warn" : undefined, hint: `${nf(m.rejected)} ditolak pengguna` },
      { label: "Gagal dibaca", value: nf(m.failed + m.unreadable), tone: m.failed + m.unreadable > 0 ? "warn" : "ok", hint: "nominal atau arah tidak terbaca" },
    ]} />
    <div className="adm-grid2">
      <Panel title="Bank dan penerbit" meta="kecepatan terbaca, terendah dulu" flush>
        <Table rowKey={(r) => r.channel} rows={[...h.banks].sort((a, b) => (a.readRate ?? 101) - (b.readRate ?? 101))} empty="Belum ada email pada rentang ini." cols={[
          { head: "Penerbit", cell: (r) => bankName(r.channel), sort: (r) => r.channel },
          { head: "Email", cell: (r) => nf(r.total), right: true, sort: (r) => r.total },
          { head: "Gagal", cell: (r) => nf(r.bad), right: true, sort: (r) => r.bad },
          { head: "Terbaca", cell: (r) => r.readRate === null ? "—" : <Pill tone={tone(r.readRate)}>{r.readRate}%</Pill>, right: true, sort: (r) => r.readRate ?? 101 },
        ]} />
      </Panel>
      <Panel title="Pengirim bermasalah" meta="14 hari terakhir, tidak diproses">
        <Rank rows={h.senders.map((s) => ({ label: s.domain, value: s.n, sub: REASON[s.reason] ?? s.reason }))} color="#c73822" empty="Tidak ada pengirim bermasalah." />
      </Panel>
    </div>
    <div className="adm-grid2">
      <Panel title="Kenapa email dilewati" meta="alasan, semua pengguna"><Donut rows={h.skips.slice(0, 8).map((s) => ({ label: SKIP[s.reason] ?? s.reason, value: s.n }))} center={<b>{nf(h.skips.reduce((a, b) => a + b.n, 0))}</b>} /></Panel>
      <Panel title="Kuota AI" meta={`batas ${h.ai.dailyLimit} panggilan per orang per hari`}>
        <div className="adm-mini">
          <div><small>Hari ini</small><b>{nf(h.ai.calls)}</b><span>panggilan, {nf(h.ai.users)} pengguna</span></div>
          <div><small>Mencapai batas</small><b className={h.ai.atLimit ? "bad" : ""}>{nf(h.ai.atLimit)}</b><span>pengguna hari ini</span></div>
          <div><small>Ingatan toko</small><b>{nf(h.ai.cacheRows)}</b><span>{hit === null ? "belum ada" : `${hit}% terjawab tanpa AI`}</span></div>
        </div>
        <TimeChart labels={h.ai.days.map((d) => d.day)} series={[{ name: "Panggilan", values: h.ai.days.map((d) => d.calls), color: "#7a3fb0" }]} kind="bar" height={140} fmtLabel={dShort} />
      </Panel>
    </div>
    <Panel title="Pekerjaan latar" meta="jalur yang mengisi catatan">
      <ul className="adm-jobs">
        <Job name="Gmail langsung" ok={jobs.gmail.enabled - jobs.gmail.failing} bad={jobs.gmail.failing} detail={`${nf(jobs.gmail.enabled)} aktif dari ${nf(jobs.gmail.total)}`} />
        <Job name="Apps Script" ok={jobs.hooks.active} bad={jobs.hooks.weak} detail={`${nf(jobs.hooks.active)} aktif 3 hari terakhir dari ${nf(jobs.hooks.total)}`} />
        <Job name="Notifikasi ponsel" ok={jobs.notif.active} bad={0} detail={`${nf(jobs.notif.users)} pengguna, ${nf(jobs.notif.received)} notifikasi dibaca`} />
        <Job name="Impor email lama" ok={(jobs.imports.done ?? 0)} bad={(jobs.imports.failed ?? 0)} detail={`${nf(jobs.imports.scanning ?? 0)} berjalan, ${nf(jobs.imports.ready ?? 0)} menunggu pratinjau`} />
        <Job name="Scan struk" ok={jobs.scans.ready ?? 0} bad={jobs.scans.failed ?? 0} detail="foto yang terbaca vs gagal" />
        <Job name="Spreadsheet" ok={jobs.sheets.synced ?? 0} bad={sheetsBad} detail={`${nf(jobs.sheets.synced ?? 0)} tersinkron`} />
      </ul>
      {[...jobs.importErrors.map((e) => ({ e: `Impor: ${e.error}`, n: e.n })), ...jobs.sheetErrors.map((e) => ({ e: `Spreadsheet: ${e.error}`, n: e.n }))].length ? <div className="adm-errs"><b>Kesalahan terbanyak</b><Rank color="#c73822" rows={[...jobs.importErrors.map((e) => ({ label: `Impor: ${e.error}`, value: e.n })), ...jobs.sheetErrors.map((e) => ({ label: `Spreadsheet: ${e.error}`, value: e.n }))]} /></div> : null}
    </Panel>
  </div>;
}

function Job({ name, ok, bad, detail }: { name: string; ok: number; bad: number; detail: string }) {
  const total = ok + bad, rate = total ? Math.round((ok / total) * 100) : null;
  return <motion.li layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
    <span className="n"><b>{name}</b><small>{detail}</small></span>
    <span className="bar" aria-hidden="true"><motion.i style={{ background: bad ? "#c73822" : "#166534" }} initial={{ width: 0 }} animate={{ width: `${rate ?? 0}%` }} transition={{ duration: 0.7 }} /></span>
    <Pill tone={rate === null ? "" : bad ? (rate < 70 ? "bad" : "warn") : "ok"}>{rate === null ? "—" : bad ? `${nf(bad)} bermasalah` : "Sehat"}</Pill>
  </motion.li>;
}
