import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { adminFetch, dTime, nf, useAdmin } from "./admin-data";
import { Empty, Kpis, Loading, Panel, Pill, Table } from "./admin-ui";

/** Marketing push (web app + Android). Same shape as the email pages: list, composer, one campaign. */
type Overview = {
  channels: { web: boolean; android: boolean };
  devices: { web: number; android: number; total: number; users: number };
  prefs: { off: number; on_: number; fitur: number; promo: number; tips: number };
  campaigns: number; topics: Record<string, string>; segments: { key: string; label: string }[];
  caps: { perDay: number; perWeek: number; quiet: string };
};
type Campaign = { id: string; name: string; title: string; body: string; route: string; image_url: string | null; topic: string; segment: string; platform: string; respect_quiet: boolean; status: string; scheduled_at: string | null; total: number; created_at: string; started_at: string | null; finished_at: string | null; last_error: string | null; stats?: Record<string, number>; opened?: number };
type Detail = { campaign: Campaign; stats: Record<string, number>; opened: number; platforms: { platform: string; sent: number; opened: number }[]; errors: { status: string; error: string; n: number }[]; running: boolean; quietNow: boolean };
type Reach = { devices: number; users: number; byPlatform: { web: number; android: number }; skipped: { noChannel: number; optedOut: number; notInSegment: number; capped: number }; channels: { web: boolean; android: boolean } };

const STATUS: Record<string, [string, "ok" | "warn" | "bad" | "info" | ""]> = { draft: ["Draf", ""], scheduled: ["Terjadwal", "info"], sending: ["Mengirim", "warn"], paused: ["Dijeda", "warn"], done: ["Selesai", "ok"], canceled: ["Dibatalkan", "bad"] };
const ROUTES: [string, string][] = [["/", "Beranda"], ["/catat", "Catat transaksi"], ["/laporan", "Laporan"], ["/rencana", "Anggaran dan rencana"], ["/kekayaan", "Kekayaan"], ["/riwayat", "Riwayat"], ["/integrasi", "Hubungkan Gmail"], ["/akun", "Akun"]];
const PLATFORM: Record<string, string> = { all: "Android dan web", android: "Android", web: "Web" };
const post = <T,>(path: string, body?: unknown) => adminFetch<T>(`push/${path}`, { method: "POST", body: JSON.stringify(body ?? {}) });
const del = <T,>(path: string) => adminFetch<T>(`push/${path}`, { method: "DELETE" });
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");
const Note = ({ tone = "", children }: { tone?: "bad" | "warn" | ""; children: ReactNode }) => <motion.div className={`adm-em-note ${tone}`} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>{children}</motion.div>;
const fill = (s: string) => s.replace(/\{\{\s*nama\s*\}\}/gi, "Rina");

export function PushPage({ sub, go, refreshVersion }: { sub: string; go: (to: string, state?: Record<string, unknown>) => void; refreshVersion: number }) {
  if (sub === "baru") return <Composer go={go} refreshVersion={refreshVersion} seed={window.history.state?.pushSeed} />;
  if (sub) return <CampaignPage key={sub} id={sub} go={go} refreshVersion={refreshVersion} />;
  return <Home go={go} refreshVersion={refreshVersion} />;
}

function Home({ go, refreshVersion }: { go: (to: string, state?: Record<string, unknown>) => void; refreshVersion: number }) {
  const ov = useAdmin<Overview>("push/overview", 0, refreshVersion), list = useAdmin<{ campaigns: Campaign[] }>("push/campaigns", 5000, refreshVersion);
  if (!ov.data) return ov.error ? <div className="adm-err" role="alert">Push belum bisa dimuat ({ov.error}). <button type="button" onClick={ov.reload}>Coba lagi</button></div> : <Loading />;
  const o = ov.data, camps = list.data?.campaigns ?? [];
  return <div className="adm-stack">
    <Kpis items={[
      { label: "Perangkat terdaftar", value: nf(o.devices.total), hint: `${nf(o.devices.users)} orang` },
      { label: "Android", value: nf(o.devices.android), hint: o.channels.android ? "pengiriman aktif" : "belum dikonfigurasi", tone: o.channels.android ? undefined : "warn" },
      { label: "Web", value: nf(o.devices.web), hint: o.channels.web ? "pengiriman aktif" : "kunci VAPID belum ada", tone: o.channels.web ? undefined : "warn" },
      { label: "Setuju kabar dan tawaran", value: nf(o.prefs.on_), hint: `${nf(o.prefs.off)} mematikan` },
      { label: "Topik promo", value: nf(o.prefs.promo), hint: `${nf(o.prefs.fitur)} fitur · ${nf(o.prefs.tips)} tips` },
    ]} cols={5} />
    {!o.channels.android ? <Note tone="warn"><b>Android belum aktif.</b> Perangkat Android tetap terdaftar, tetapi pengiriman menunggu kunci akun layanan Firebase (<code>FCM_SERVICE_ACCOUNT</code>) dipasang di server dan aplikasi baru dirilis. Kampanye hanya dikirim ke web sampai itu selesai.</Note> : null}
    <Panel title="Aturan kirim" meta="berlaku untuk semua kampanye"><p className="adm-hint">Hanya orang yang membiarkan "kabar dan tawaran" menyala dan memilih topiknya. Maksimal {o.caps.perDay} push per hari dan {o.caps.perWeek} per minggu per orang. Tidak dikirim pukul {o.caps.quiet}; kampanye yang melewati jam itu menunggu pagi. Perangkat yang tidak aktif lagi dibuang otomatis.</p></Panel>
    <Panel title="Kampanye push" meta={`${nf(camps.length)} kampanye`} action={<button type="button" className="adm-btn adm-primary" onClick={() => go("/admin/push/baru")}>Kampanye baru</button>} flush>
      <Table rowKey={(c) => c.id} rows={camps} onRow={(c) => go(`/admin/push/${c.id}`)} empty={<Empty>Belum ada kampanye push. Buat yang pertama dan kirim uji ke perangkatmu sendiri dulu.</Empty>} cols={[
        { head: "Kampanye", cell: (c) => <><b>{c.name}</b><small className="adm-sub">{c.title}</small></>, sort: (c) => c.name },
        { head: "Status", cell: (c) => <Pill tone={(STATUS[c.status] ?? ["", ""])[1]}>{(STATUS[c.status] ?? [c.status])[0]}</Pill> },
        { head: "Tujuan", cell: (c) => PLATFORM[c.platform] ?? c.platform, hideSm: true },
        { head: "Terkirim", right: true, cell: (c) => <>{nf(c.stats?.sent ?? 0)}<small className="adm-sub">dari {nf(c.total)}</small></>, sort: (c) => c.stats?.sent ?? 0 },
        { head: "Dibuka", right: true, cell: (c) => <>{nf(c.opened ?? 0)}<small className="adm-sub">{pct(c.opened ?? 0, c.stats?.sent ?? 0)}</small></>, sort: (c) => c.opened ?? 0, hideSm: true },
        { head: "Dibuat", right: true, cell: (c) => dTime(c.created_at), sort: (c) => c.created_at, hideSm: true },
      ]} />
    </Panel>
  </div>;
}

function Composer({ go, seed, refreshVersion }: { go: (to: string) => void; seed?: Partial<Campaign>; refreshVersion: number }) {
  const ov = useAdmin<Overview>("push/overview", 0, refreshVersion);
  const [name, setName] = useState(seed?.name ?? ""), [title, setTitle] = useState(seed?.title ?? ""), [body, setBody] = useState(seed?.body ?? "");
  const [route, setRoute] = useState(seed?.route ?? "/catat"), [image, setImage] = useState(seed?.image_url ?? ""), [topic, setTopic] = useState(seed?.topic ?? "fitur");
  const [segment, setSegment] = useState(seed?.segment ?? "devices"), [platform, setPlatform] = useState(seed?.platform ?? "all"), [quiet, setQuiet] = useState(seed?.respect_quiet ?? true);
  const [when, setWhen] = useState(""), [busy, setBusy] = useState<string | null>(null), [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null), [reach, setReach] = useState<Reach | null>(null);
  useEffect(() => {
    if (!ov.data) return; setReach(null); let live = true;
    const t = window.setTimeout(() => { adminFetch<Reach>("push/preview", { method: "POST", body: JSON.stringify({ topic, segment, platform }) }).then((r) => live && setReach(r), () => {}); }, 250);
    return () => { live = false; window.clearTimeout(t); };
  }, [topic, segment, platform, ov.data]);
  if (!ov.data) return ov.error ? <div className="adm-err">Tidak bisa memuat ({ov.error}). <button type="button" onClick={ov.reload}>Coba lagi</button></div> : <Loading />;
  const run = async (key: string, fn: () => Promise<void>) => { setBusy(key); setMsg(null); try { await fn(); } catch (e) { setMsg({ tone: "bad", text: (e as Error).message }); } finally { setBusy(null); } };
  const payload = { name, title, body, route, imageUrl: image || undefined, topic, segment, platform, respectQuiet: quiet };
  const ready = name.trim() && title.trim() && body.trim();
  const create = async (start: boolean, at?: string) => { const r = await post<{ campaign: Campaign }>("campaigns", { ...payload, scheduledAt: at }); if (start) await post(`campaigns/${r.campaign.id}/start`); go(`/admin/push/${r.campaign.id}`); };
  return <div className="adm-stack">
    <motion.button type="button" className="adm-back" onClick={() => go("/admin/push")} whileHover={{ x: -3 }} whileTap={{ scale: 0.96 }}>← Semua kampanye</motion.button>
    <div className="adm-grid2">
      <Panel title="1 · Isi notifikasi">
        <label className="adm-em-f">Nama kampanye (internal)<input value={name} onChange={(e) => setName(e.target.value)} placeholder="mis. Ajak coba foto struk" /></label>
        <label className="adm-em-f">Judul <small className="adm-sub">{title.length}/65</small><input value={title} maxLength={65} onChange={(e) => setTitle(e.target.value)} placeholder="{{nama}}, struk hari ini sudah dicatat?" /></label>
        <label className="adm-em-f">Isi pesan <small className="adm-sub">{body.length}/178</small><textarea value={body} maxLength={178} rows={3} onChange={(e) => setBody(e.target.value)} placeholder="Foto struknya, item dan total terbaca otomatis." /></label>
        <div className="adm-em-row"><label className="adm-em-f" style={{ flex: 1 }}>Buka halaman<select value={route} onChange={(e) => setRoute(e.target.value)}>{ROUTES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <label className="adm-em-f" style={{ flex: 1 }}>Topik<select value={topic} onChange={(e) => setTopic(e.target.value)}>{Object.entries(ov.data.topics).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label></div>
        <label className="adm-em-f">Gambar besar (opsional, alamat https)<input value={image} onChange={(e) => setImage(e.target.value)} placeholder="https://djiwapay.web.id/assets/push/promo.jpg" /></label>
        <p className="adm-hint">Variabel: <code>{"{{nama}}"}</code>. Judul dan isi dipotong di ponsel yang layarnya kecil, jadi buat singkat.</p>
        <div className="adm-pushprev" aria-label="Pratinjau notifikasi"><div className="adm-pushnoti"><span className="adm-pushtop"><i />Djiwa Pay · sekarang</span><b>{fill(title) || "Judul"}</b><span>{fill(body) || "Isi pesan"}</span>{image ? <img src={image} alt="" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} /> : null}</div></div>
      </Panel>
      <div className="adm-stack">
        <Panel title="2 · Audiens" meta={reach ? `${nf(reach.devices)} perangkat · ${nf(reach.users)} orang` : "menghitung…"}>
          <label className="adm-em-f">Siapa<select value={segment} onChange={(e) => setSegment(e.target.value)}><option value="devices">Semua perangkat terdaftar</option>{ov.data.segments.filter((s) => s.key !== "android_testers" && s.key !== "everyone").map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select></label>
          <label className="adm-em-f">Platform<select value={platform} onChange={(e) => setPlatform(e.target.value)}>{Object.entries(PLATFORM).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          <AnimatePresence initial={false}>{reach ? <motion.div key={`${topic}${segment}${platform}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="adm-em-aud">
            <p className="adm-hint">Android {nf(reach.byPlatform.android)} · Web {nf(reach.byPlatform.web)}. Dilewati: {nf(reach.skipped.optedOut)} mematikan topik ini · {nf(reach.skipped.capped)} sudah menerima hari ini atau minggu ini · {nf(reach.skipped.notInSegment)} di luar audiens{reach.skipped.noChannel ? ` · ${nf(reach.skipped.noChannel)} perangkat belum bisa dikirimi (kanal belum aktif)` : ""}.</p></motion.div> : null}</AnimatePresence>
          {!ov.data.channels.android ? <Note tone="warn">Android belum aktif; hanya perangkat web yang akan menerima.</Note> : null}
        </Panel>
        <Panel title="3 · Uji lalu kirim">
          <label className="adm-em-sw"><input type="checkbox" checked={quiet} onChange={(e) => setQuiet(e.target.checked)} /> Hormati jam tenang ({ov.data.caps.quiet})</label>
          <label className="adm-em-f">Jadwalkan (opsional)<input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></label>
          <div className="adm-em-actions">
            <button type="button" className="adm-btn" disabled={!ready || busy !== null} onClick={() => run("test", async () => { const r = await post<{ sent: number; devices: number }>("test", payload); setMsg({ tone: "ok", text: `Uji terkirim ke ${r.sent} dari ${r.devices} perangkatmu.` }); })}>{busy === "test" ? "Mengirim…" : "Kirim uji ke perangkatku"}</button>
            <button type="button" className="adm-btn" disabled={!ready || busy !== null} onClick={() => run("draft", () => create(false))}>Simpan draf</button>
            {when ? <button type="button" className="adm-btn adm-primary" disabled={!ready || busy !== null} onClick={() => run("sched", () => create(false, new Date(when).toISOString()))}>Jadwalkan</button>
              : <button type="button" className="adm-btn adm-primary" disabled={!ready || !reach?.devices || busy !== null} onClick={() => { if (window.confirm(`Kirim "${fill(title)}" ke ${nf(reach?.devices ?? 0)} perangkat sekarang?`)) run("send", () => create(true)); }}>{busy === "send" ? "Memulai…" : `Kirim ke ${nf(reach?.devices ?? 0)} perangkat`}</button>}
          </div>
          <AnimatePresence>{msg ? <Note tone={msg.tone === "bad" ? "bad" : ""}>{msg.text}</Note> : null}</AnimatePresence>
        </Panel>
      </div>
    </div>
  </div>;
}

function CampaignPage({ id, go, refreshVersion }: { id: string; go: (to: string, state?: Record<string, unknown>) => void; refreshVersion: number }) {
  const d = useAdmin<Detail>(`push/campaigns/${id}`, 3000, refreshVersion), [busy, setBusy] = useState(false), [err, setErr] = useState<string | null>(null), [gone, setGone] = useState(false);
  if (gone) return null;
  if (!d.data) return d.error ? <div className="adm-err">Kampanye tidak ditemukan ({d.error}). <button type="button" onClick={() => go("/admin/push")}>Kembali</button></div> : <Loading />;
  const { campaign: c, stats } = d.data, sent = stats.sent ?? 0, st = STATUS[c.status] ?? [c.status, ""];
  const act = async (path: string, confirm?: string) => { if (confirm && !window.confirm(confirm)) return; setBusy(true); setErr(null); try { await post(`campaigns/${id}/${path}`); d.reload(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); } };
  const remove = async () => { if (!window.confirm("Hapus kampanye ini?")) return; setBusy(true); try { await del(`campaigns/${id}`); setGone(true); go("/admin/push"); } catch (e) { setErr((e as Error).message); setBusy(false); } };
  return <div className="adm-stack">
    <motion.button type="button" className="adm-back" onClick={() => go("/admin/push")} whileHover={{ x: -3 }} whileTap={{ scale: 0.96 }}>← Semua kampanye</motion.button>
    <Panel><div className="adm-em-head"><div><h2>{c.name}</h2><span className="adm-sub">{c.title}</span><div className="adm-tags"><Pill tone={st[1]}>{st[0]}</Pill><Pill>{PLATFORM[c.platform]}</Pill>{c.scheduled_at ? <Pill tone="info">jadwal {dTime(c.scheduled_at)}</Pill> : null}</div></div>
      <div className="adm-em-actions">
        <button type="button" className="adm-btn" onClick={() => go("/admin/push/baru", { pushSeed: { ...c, name: `Salinan ${c.name}`.slice(0, 120) } })}>Salin kampanye</button>
        {["draft", "scheduled", "paused"].includes(c.status) ? <button type="button" className="adm-btn adm-primary" disabled={busy} onClick={() => act("start", c.status === "paused" ? undefined : "Kirim kampanye ini sekarang?")}>{c.status === "paused" ? "Lanjutkan" : "Kirim sekarang"}</button> : null}
        {c.status === "sending" ? <button type="button" className="adm-btn" disabled={busy} onClick={() => act("pause")}>Jeda</button> : null}
        {["draft", "scheduled", "sending", "paused"].includes(c.status) ? <button type="button" className="adm-btn" disabled={busy} onClick={() => act("cancel", "Batalkan kampanye? Yang belum terkirim tidak akan dikirim.")}>Batalkan</button> : null}
        {["draft", "scheduled", "canceled"].includes(c.status) ? <button type="button" className="adm-btn" disabled={busy} onClick={remove}>Hapus</button> : null}</div></div>
      {c.total ? <><div className="adm-em-bar" role="progressbar" aria-valuenow={sent} aria-valuemax={c.total}><motion.i initial={{ width: 0 }} animate={{ width: `${Math.min(100, (sent / c.total) * 100)}%` }} /></div><p className="adm-hint">{nf(sent)} dari {nf(c.total)} terkirim{c.status === "sending" ? (d.data.quietNow && c.respect_quiet ? " · menunggu jam tenang selesai (07.00 WIB)" : " · sedang berjalan, halaman menyegarkan otomatis") : ""}.</p></> : null}
      {c.last_error ? <Note tone="bad">{c.last_error}</Note> : null}{err ? <Note tone="bad">{err}</Note> : null}</Panel>
    <Kpis items={[
      { label: "Perangkat", value: nf(c.total), hint: `${nf(stats.queued ?? 0)} masih antre` },
      { label: "Terkirim", value: nf(sent), hint: pct(sent, c.total) },
      { label: "Dibuka", value: nf(d.data.opened), hint: pct(d.data.opened, sent) },
      { label: "Gagal", value: nf(stats.failed ?? 0), hint: `${nf(stats.skipped ?? 0)} dilewati`, tone: (stats.failed ?? 0) > 0 ? "warn" : undefined },
    ]} cols={4} />
    <div className="adm-grid2">
      <Panel title="Per platform"><Table rowKey={(r) => r.platform} rows={d.data.platforms} empty="Belum ada pengiriman." cols={[{ head: "Platform", cell: (r) => PLATFORM[r.platform] ?? r.platform }, { head: "Terkirim", right: true, cell: (r) => nf(r.sent) }, { head: "Dibuka", right: true, cell: (r) => <>{nf(r.opened)}<small className="adm-sub">{pct(r.opened, r.sent)}</small></> }]} /></Panel>
      <Panel title="Masalah pengiriman">{d.data.errors.length ? <Table rowKey={(r) => `${r.status}${r.error}`} rows={d.data.errors} cols={[{ head: "Penyebab", cell: (r) => r.error }, { head: "Status", cell: (r) => r.status }, { head: "Jumlah", right: true, cell: (r) => nf(r.n) }]} /> : <Empty>Tidak ada masalah.</Empty>}</Panel>
    </div>
    <Panel title="Isi notifikasi"><div className="adm-pushprev"><div className="adm-pushnoti"><span className="adm-pushtop"><i />Djiwa Pay</span><b>{fill(c.title)}</b><span>{fill(c.body)}</span>{c.image_url ? <img src={c.image_url} alt="" /> : null}</div></div><p className="adm-hint">Membuka halaman <code>{c.route}</code> · topik {c.topic}</p></Panel>
  </div>;
}
