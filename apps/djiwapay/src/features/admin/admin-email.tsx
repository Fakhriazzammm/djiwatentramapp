import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { adminFetch, dTime, nf, useAdmin } from "./admin-data";
import { Empty, Kpis, Loading, Panel, Pill, Rank, Table, Tabs } from "./admin-ui";

type Segment = { key: string; label: string; eligible: number; members: number };
type Template = { id: string; name: string; description: string; subject: string; html: string; segment?: string; updated_at?: string };
type Quota = { plan: string; limit: number; used: number; remaining: number | null; dailyLeft: number | null; payg: boolean; expiredAt: string | null } | null;
type Overview = { segments: Segment[]; customers: { total: number; pay: number; payConsented: number; consented: number; suppressed: number }; quota: Quota; from: string; builtinTemplates: Template[]; customTemplates: Template[] };
type Campaign = { id: string; name: string; subject: string; html: string; segment: string; status: string; scheduled_at: string | null; from_address: string; total_recipients: number; created_at: string; started_at: string | null; finished_at: string | null; last_error: string | null; stats: Record<string, number>; opened?: number; clicked?: number };
type Recipient = { id: number; email: string; name: string; status: string; error: string | null; sent_at: string | null; delivered_at: string | null; opened_at: string | null; clicked_at: string | null };
type Detail = { campaign: Campaign; recipients: Recipient[]; stats: Record<string, number>; opened: number; clicked: number; running: boolean };

const STATUS: Record<string, [string, "ok" | "warn" | "bad" | "info" | ""]> = { draft: ["Draf", ""], scheduled: ["Terjadwal", "info"], sending: ["Mengirim", "warn"], paused: ["Dijeda", "warn"], done: ["Selesai", "ok"], canceled: ["Dibatalkan", "bad"] };
const RSTATUS: Record<string, [string, "ok" | "warn" | "bad" | "info" | ""]> = { queued: ["Antre", ""], sent: ["Terkirim", "info"], delivered: ["Sampai", "ok"], bounced: ["Pentalan", "bad"], complained: ["Dilaporkan spam", "bad"], failed: ["Gagal", "bad"], skipped: ["Dilewati", ""] };
const post = <T,>(path: string, body?: unknown) => adminFetch<T>(`email/${path}`, { method: "POST", body: JSON.stringify(body ?? {}) });
const del = <T,>(path: string) => adminFetch<T>(`email/${path}`, { method: "DELETE" });
const sent = (s: Record<string, number>) => (s.sent ?? 0) + (s.delivered ?? 0) + (s.bounced ?? 0) + (s.complained ?? 0);
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");
const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const SAMPLE: Record<string, string> = { nama: "Budi", saldo: "Rp25.000", jumlah_catatan: "12", hari_tidak_aktif: "45", link: "https://djiwapay.web.id", unsubscribe_url: "#" };
const fill = (src: string) => src.replace(/\{\{\{\s*([a-z_]+)\s*\}\}\}/gi, (_, k: string) => SAMPLE[k] ?? "").replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, k: string) => esc(SAMPLE[k] ?? ""));
const VARS = ["nama", "saldo", "jumlah_catatan", "hari_tidak_aktif", "link"];

const Progress = ({ done, total }: { done: number; total: number }) => <div className="adm-em-bar" role="progressbar" aria-valuenow={done} aria-valuemax={total}><motion.i initial={{ width: 0 }} animate={{ width: total ? `${Math.min(100, (done / total) * 100)}%` : 0 }} transition={{ type: "spring", stiffness: 160, damping: 24 }} /></div>;
const Note = ({ tone = "", children }: { tone?: "bad" | "warn" | ""; children: ReactNode }) => <motion.div className={`adm-em-note ${tone}`} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>{children}</motion.div>;

type Suppression = { email: string; reason: string; source: string | null; created_at: string };
type ComposeSeed = Pick<Template, "name" | "subject" | "html" | "segment"> & { templateId?: string };
const EMAIL_TABS = [["kampanye", "Kampanye"], ["audiens", "Audiens"], ["template", "Template"], ["berhenti", "Alamat diblokir"]] as const;
const REASONS: Record<string, string> = { unsubscribed: "Berhenti berlangganan", bounce: "Email memantul", complaint: "Laporan spam", manual: "Blokir manual" };
const SOURCES: Record<string, string> = { link: "Tautan email", webhook: "Laporan pengiriman", provider: "Penyedia email", admin: "Admin Djiwa Tentram", "admin-djiwapay": "Admin Djiwa Pay" };

export function EmailPage({ sub, go, refreshVersion }: {
  sub: string;
  go: (to: string, state?: Record<string, unknown>) => void;
  refreshVersion: number;
}) {
  const compose = (seed?: ComposeSeed) => go("/admin/email/baru", { emailSeed: seed });
  if (sub === "baru") return <Composer go={go} refreshVersion={refreshVersion} seed={window.history.state?.emailSeed} />;
  if (sub) return <CampaignPage key={sub} id={sub} go={go} compose={compose} refreshVersion={refreshVersion} />;
  return <EmailHome go={go} compose={compose} refreshVersion={refreshVersion} />;
}

function EmailHome({ go, compose, refreshVersion }: {
  go: (to: string) => void;
  compose: (seed?: ComposeSeed) => void;
  refreshVersion: number;
}) {
  const ov = useAdmin<Overview>("email/overview", 0, refreshVersion);
  const list = useAdmin<{ campaigns: Campaign[] }>("email/campaigns", 5000, refreshVersion);
  const [tab, setTab] = useState<(typeof EMAIL_TABS)[number][0]>("kampanye");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [segment, setSegment] = useState("");
  if (!ov.data) return ov.error ? <div className="adm-err" role="alert">Email marketing belum bisa dimuat ({ov.error}). <button type="button" onClick={ov.reload}>Coba lagi</button></div> : <Loading />;
  const o = ov.data;
  const q = o.quota;
  const camps = list.data?.campaigns ?? [];
  const term = search.trim().toLowerCase();
  const matching = camps.filter((campaign) =>
    (!status || campaign.status === status) &&
    (!segment || campaign.segment === segment) &&
    [campaign.name, campaign.subject].some((value) => value.toLowerCase().includes(term))
  );
  return <div className="adm-stack">
    <div className="adm-toolbar"><span className="adm-sub">Pengirim: <b>{o.from}</b></span><motion.button type="button" className="adm-btn adm-primary" onClick={() => compose()} whileTap={{ scale: 0.96 }} whileHover={{ y: -1 }}>+ Kampanye baru</motion.button></div>
    {!q ? <Note tone="bad">Penyedia email tidak merespons: kunci API belum terpasang atau paket Helipod Email tidak aktif. Kampanye tidak bisa dikirim sampai ini beres.</Note> : q.expiredAt && new Date(q.expiredAt).getTime() < Date.now() ? <Note tone="bad">Paket Helipod Email sudah berakhir ({dTime(q.expiredAt)}). Perpanjang di dashboard Helipod.</Note> : q.remaining !== null && q.remaining < 50 && !q.payg ? <Note tone="warn">Kuota bulan ini tinggal {nf(q.remaining)} email.</Note> : null}
    <Kpis items={[
      { label: "Pengguna Djiwa Pay", value: nf(o.customers.pay), hint: `dari ${nf(o.customers.total)} pelanggan` },
      { label: "Setuju menerima email", value: nf(o.customers.payConsented), hint: `${pct(o.customers.payConsented, o.customers.pay)} pengguna Pay` },
      { label: "Alamat diblokir", value: nf(o.customers.suppressed), hint: "Berhenti langganan, pantulan, spam, dan manual" },
      { label: "Kuota email bulan ini", value: q?.limit ? nf(q.remaining ?? 0) : "—", hint: q ? `terpakai ${nf(q.used)} dari ${nf(q.limit)} · paket ${q.plan || "?"}` : "tidak terbaca", tone: q && q.remaining !== null && q.remaining < 50 ? "warn" : undefined },
    ]} />
    <Tabs items={EMAIL_TABS} value={tab} onChange={setTab} />
    {tab === "kampanye" ? <Panel title="Kampanye" meta={`${nf(matching.length)} dari ${nf(camps.length)} kampanye`} flush>
      <div className="adm-toolbar adm-em-filter">
        <input className="adm-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Cari kampanye" placeholder="Cari nama kampanye atau subjek" />
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status kampanye">
          <option value="">Semua status</option>
          {Object.entries(STATUS).map(([key, [label]]) => <option key={key} value={key}>{label}</option>)}
        </select>
        <select value={segment} onChange={(e) => setSegment(e.target.value)} aria-label="Segmen kampanye">
          <option value="">Semua segmen</option>
          {o.segments.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
        </select>
      </div>
      {list.error ? <div className="adm-err" role="alert">Daftar kampanye gagal dimuat ({list.error}). <button type="button" onClick={list.reload}>Coba lagi</button></div> : null}
      {!list.data && !list.error ? <Loading /> : null}
      {list.data ? <Table rowKey={(c) => c.id} rows={matching} onRow={(c) => go(`/admin/email/${c.id}`)} empty={camps.length ? "Tidak ada kampanye yang cocok." : <>Belum ada kampanye. <button type="button" className="adm-link" onClick={() => compose()}>Buat yang pertama</button>.</>} cols={[
        { head: "Kampanye", cell: (c) => <><b>{c.name}</b><small className="adm-sub">{c.subject}</small></>, sort: (c) => c.name },
        { head: "Segmen", cell: (c) => o.segments.find((s) => s.key === c.segment)?.label ?? c.segment, hideSm: true },
        { head: "Status", cell: (c) => <Pill tone={STATUS[c.status]?.[1]}>{STATUS[c.status]?.[0] ?? c.status}</Pill>, sort: (c) => c.status },
        { head: "Terkirim", cell: (c) => <><span>{nf(sent(c.stats))} / {nf(c.total_recipients)}</span><Progress done={sent(c.stats)} total={c.total_recipients} /></>, sort: (c) => sent(c.stats), w: "150px" },
        { head: "Dibuka", cell: (c) => pct(c.opened ?? 0, sent(c.stats)), right: true, sort: (c) => c.opened ?? 0, hideSm: true },
        { head: "Klik", cell: (c) => pct(c.clicked ?? 0, sent(c.stats)), right: true, sort: (c) => c.clicked ?? 0, hideSm: true },
        { head: "Dibuat", cell: (c) => c.scheduled_at && c.status === "scheduled" ? `jadwal ${dTime(c.scheduled_at)}` : dTime(c.created_at), sort: (c) => c.created_at },
        { head: "Aksi", noSort: true, right: true, cell: (c) => <div className="adm-em-actions adm-em-row-actions" onClick={(event) => event.stopPropagation()}>
          <button type="button" className="adm-link" aria-label={`Detail kampanye ${c.name}`} onClick={() => go(`/admin/email/${c.id}`)}>Detail</button>
          <button type="button" className="adm-link" aria-label={`Salin kampanye ${c.name}`} onClick={() => compose({ name: `Salinan ${c.name}`.slice(0, 120), subject: c.subject, html: c.html, segment: c.segment })}>Salin</button>
        </div> },
      ]} /> : null}
    </Panel> : null}
    {tab === "audiens" ? <div className="adm-grid2">
      <Panel title="Segmen audiens" meta="bisa dikirimi sekarang (sudah setuju, email valid, tidak berhenti langganan)"><Rank color="#16161a" rows={o.segments.map((s) => ({ label: s.label, value: s.eligible, sub: `${nf(s.members)} anggota segmen` }))} /></Panel>
      <Panel title="Aturan kirim"><ul className="adm-em-rules"><li>Hanya pengguna yang <b>setuju menerima info</b> (opsi di profil Djiwa App).</li><li>Alamat yang berhenti berlangganan, memantul, atau melapor spam dilewati otomatis, bersama dengan email Djiwa Tentram.</li><li>Satu orang tidak dikirimi lebih dari satu kampanye per <b>72 jam</b>.</li><li>Setiap email memuat tombol berhenti berlangganan satu klik.</li></ul></Panel>
    </div> : null}
    {tab === "template" ? <TemplateLibrary overview={o} compose={compose} /> : null}
    {tab === "berhenti" ? <SuppressionPanel total={o.customers.suppressed} onChange={ov.reload} refreshVersion={refreshVersion} /> : null}
  </div>;
}

function TemplateLibrary({ overview, compose }: { overview: Overview; compose: (seed: ComposeSeed) => void }) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("");
  const [selected, setSelected] = useState<Template>();
  const term = query.trim().toLowerCase();
  const builtins = overview.builtinTemplates;
  const custom = overview.customTemplates;
  const rows = (kind === "builtin" ? builtins : kind === "custom" ? custom : [...builtins, ...custom])
    .filter((item) => [item.name, item.subject, item.description].some((value) => (value ?? "").toLowerCase().includes(term)));
  return <>
    <Panel title="Template email" meta={`${nf(rows.length)} template`} flush>
      <div className="adm-toolbar adm-em-filter">
        <input className="adm-search" type="search" aria-label="Cari template" placeholder="Cari nama template atau subjek" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select aria-label="Jenis template" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">Semua template</option><option value="builtin">Bawaan</option><option value="custom">Tersimpan</option>
        </select>
      </div>
      <Table rows={rows} rowKey={(item) => item.id} empty="Tidak ada template yang cocok." cols={[
        { head: "Template", cell: (item) => <><b>{item.name}</b><small className="adm-sub">{item.subject}</small></> },
        { head: "Jenis", cell: (item) => <Pill>{item.id.startsWith("builtin") ? "Bawaan" : "Tersimpan"}</Pill> },
        { head: "Aksi", noSort: true, right: true, cell: (item) => <div className="adm-em-actions adm-em-row-actions">
          <button className="adm-link" type="button" onClick={() => setSelected(item)}>Pratinjau</button>
          <button className="adm-link" type="button" onClick={() => compose({ ...item, templateId: item.id })}>Gunakan</button>
        </div> },
      ]} />
    </Panel>
    {selected ? <Panel title={`Pratinjau · ${selected.name}`} action={<button className="adm-link" type="button" onClick={() => setSelected(undefined)}>Tutup</button>}>
      <div className="adm-em-prev"><div className="adm-em-subj">{fill(selected.subject)}</div><iframe title="Pratinjau template email" sandbox="" srcDoc={fill(selected.html)} /></div>
    </Panel> : null}
  </>;
}

function SuppressionPanel({ total, onChange, refreshVersion }: { total: number; onChange: () => void; refreshVersion: number }) {
  const sup = useAdmin<{ suppressions: Suppression[] }>("email/suppressions", 0, refreshVersion);
  const [addr, setAddr] = useState("");
  const [search, setSearch] = useState("");
  const [reason, setReason] = useState("");
  const [source, setSource] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string }>();
  const addresses = sup.data?.suppressions ?? [];
  const sources = [...new Set(addresses.map((item) => item.source ?? ""))].sort();
  const reasons = [...new Set(addresses.map((item) => item.reason))].sort();
  const rows = addresses.filter((item) => item.email.toLowerCase().includes(search.trim().toLowerCase()) &&
    (!reason || item.reason === reason) && (!source || (item.source ?? "-") === source));
  const mutate = async (request: () => Promise<unknown>, text: string) => {
    setBusy(true);
    setMessage(undefined);
    try {
      await request();
      sup.reload();
      onChange();
      setMessage({ error: false, text });
    } catch (error) {
      setMessage({ error: true, text: (error as Error).message });
    } finally {
      setBusy(false);
    }
  };
  return <Panel title="Daftar alamat diblokir" meta={`${nf(rows.length)} ditampilkan · ${nf(total)} alamat bersama Djiwa Tentram`} flush>
    <div className="adm-toolbar adm-em-filter">
      <input type="search" className="adm-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari alamat email" aria-label="Cari alamat diblokir" />
      <select value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Alasan pemblokiran">
        <option value="">Semua alasan</option>
        {reasons.map((key) => <option key={key} value={key}>{REASONS[key] ?? key}</option>)}
      </select>
      <select value={source} onChange={(e) => setSource(e.target.value)} aria-label="Sumber pemblokiran">
        <option value="">Semua sumber</option>
        {sources.map((key) => <option key={key} value={key || "-"}>{(SOURCES[key] ?? key) || "Tidak tercatat"}</option>)}
      </select>
    </div>
    <form className="adm-add adm-em-filter" onSubmit={(e) => {
      e.preventDefault();
      if (busy || !addr.trim()) return;
      const email = addr.trim().toLowerCase();
      if (addresses.some((item) => item.email.toLowerCase() === email)) {
        setMessage({ error: true, text: "Alamat ini sudah diblokir." });
        return;
      }
      void mutate(async () => { await post("suppressions", { email }); setAddr(""); }, "Alamat ditambahkan ke daftar blokir.");
    }}>
      <input type="email" required value={addr} onChange={(e) => setAddr(e.target.value)} placeholder="Tambah alamat yang perlu diblokir" aria-label="Alamat email untuk diblokir" />
      <button type="submit" disabled={busy || !addr.trim()}>Blokir alamat</button>
    </form>
    {total > addresses.length && sup.data ? <p className="adm-hint adm-em-filter">Pencarian mencakup {nf(addresses.length)} alamat terbaru.</p> : null}
    {message ? <div className={message.error ? "adm-err" : "adm-em-feedback"} role={message.error ? "alert" : "status"}>{message.text}</div> : null}
    {sup.error ? <div className="adm-err" role="alert">Daftar gagal dimuat ({sup.error}). <button type="button" onClick={sup.reload}>Coba lagi</button></div> : null}
    {sup.data ? <Table rowKey={(item) => item.email} rows={rows} empty={addresses.length ? "Tidak ada alamat yang cocok." : "Belum ada alamat diblokir."} cols={[
      { head: "Email", cell: (item) => item.email },
      { head: "Alasan", cell: (item) => <Pill tone={item.reason === "complaint" ? "bad" : item.reason === "bounce" ? "warn" : ""}>{REASONS[item.reason] ?? item.reason}</Pill> },
      { head: "Sumber", cell: (item) => (SOURCES[item.source ?? ""] ?? item.source) || "—", hideSm: true },
      { head: "Sejak", cell: (item) => dTime(item.created_at), sort: (item) => item.created_at, hideSm: true },
      { head: "Aksi", right: true, noSort: true, cell: (item) => <button type="button" className="adm-link" disabled={busy} onClick={() => {
        if (!window.confirm(`Lepas ${item.email} dari daftar blokir bersama Djiwa Pay dan Djiwa Tentram?`)) return;
        void mutate(() => del(`suppressions/${encodeURIComponent(item.email)}`), "Alamat dilepas dari daftar blokir.");
      }}>Lepas blokir</button> },
    ]} /> : sup.loading ? <Loading /> : null}
  </Panel>;
}

/* ---------- composer ---------- */
function Composer({ go, seed, refreshVersion }: { go: (to: string) => void; seed?: ComposeSeed; refreshVersion: number }) {
  const ov = useAdmin<Overview>("email/overview", 0, refreshVersion);
  const [name, setName] = useState(seed?.name ?? "");
  const [subject, setSubject] = useState(seed?.subject ?? "");
  const [html, setHtml] = useState(seed?.html ?? "");
  const [segment, setSegment] = useState(seed?.segment ?? "all");
  const [tplId, setTplId] = useState<string | null>(seed?.templateId ?? null);
  const [when, setWhen] = useState(""), [testTo, setTestTo] = useState(""), [busy, setBusy] = useState<string | null>(null), [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [aud, setAud] = useState<{ total: number; skipped: Record<string, number>; sample: { name: string; email: string }[] } | null>(null);
  const [view, setView] = useState<"edit" | "preview">("edit");
  useEffect(() => { setAud(null); if (!ov.data) return; let live = true; adminFetch<NonNullable<typeof aud>>("email/preview", { method: "POST", body: JSON.stringify({ segment }) }).then((r) => live && setAud(r), () => {}); return () => { live = false; }; }, [segment, ov.data]);
  const all = useMemo(() => (ov.data ? [...ov.data.builtinTemplates, ...ov.data.customTemplates] : []), [ov.data]);
  if (!ov.data) return ov.error ? <div className="adm-err">Tidak bisa memuat ({ov.error}). <button type="button" onClick={ov.reload}>Coba lagi</button></div> : <Loading />;
  const pick = (t: Template | null) => { setTplId(t?.id ?? null); if (t) { setSubject(t.subject); setHtml(t.html); if (t.segment) setSegment(t.segment); if (!name) setName(t.name); } else { setSubject(""); setHtml(""); } };
  const run = async (key: string, fn: () => Promise<void>) => { setBusy(key); setMsg(null); try { await fn(); } catch (e) { setMsg({ tone: "bad", text: (e as Error).message }); } finally { setBusy(null); } };
  const body = { name, subject, html, segment, templateId: tplId?.startsWith("builtin") ? null : tplId };
  const ready = name.trim() && subject.trim() && html.trim().length > 20;
  const create = async (start: boolean, schedule?: string) => { const r = await post<{ campaign: Campaign }>("campaigns", { ...body, scheduledAt: schedule || undefined }); if (start) await post(`campaigns/${r.campaign.id}/start`); go(`/admin/email/${r.campaign.id}`); };
  const quotaShort = ov.data.quota?.remaining !== null && ov.data.quota?.remaining !== undefined && !ov.data.quota.payg && aud && aud.total > ov.data.quota.remaining;
  return <div className="adm-stack">
    <motion.button type="button" className="adm-back" onClick={() => go("/admin/email")} whileHover={{ x: -3 }} whileTap={{ scale: 0.96 }}>← Semua kampanye</motion.button>
    <Panel title="1 · Mulai dari template" meta="pilih satu, lalu ubah sesuka hati">
      <div className="adm-em-tpls"><motion.button type="button" className={tplId === null && !html ? "on" : ""} onClick={() => pick(null)} whileTap={{ scale: 0.97 }}><b>Kosong</b><small>Tulis HTML sendiri</small></motion.button>
        {all.map((t) => <motion.button key={t.id} type="button" className={tplId === t.id ? "on" : ""} onClick={() => pick(t)} whileTap={{ scale: 0.97 }} layout><b>{t.name}</b><small>{t.description}</small>{t.id.startsWith("builtin") ? null : <Pill>tersimpan</Pill>}</motion.button>)}</div>
    </Panel>
    <div className="adm-grid2">
      <Panel title="2 · Isi email" action={<Tabs items={[["edit", "Ubah"], ["preview", "Pratinjau"]] as const} value={view} onChange={setView} />}>
        <label className="adm-em-f">Nama kampanye (internal)<input value={name} onChange={(e) => setName(e.target.value)} placeholder="mis. Ajakan kembali November" /></label>
        <label className="adm-em-f">Subjek<input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="{{nama}}, ada kabar baru" /></label>
        {view === "edit" ? <label className="adm-em-f">Isi (HTML)<textarea value={html} onChange={(e) => setHtml(e.target.value)} rows={16} spellCheck={false} placeholder="Pilih template di atas atau tempel HTML. Wajib memuat {{{unsubscribe_url}}}" /></label>
          : <div className="adm-em-prev"><div className="adm-em-subj">{fill(subject) || "(tanpa subjek)"}</div>{html ? <iframe title="Pratinjau email" sandbox="" srcDoc={fill(html)} /> : <Empty>Belum ada isi.</Empty>}</div>}
        <p className="adm-hint">Variabel: {VARS.map((v) => <code key={v}>{`{{${v}}}`}</code>)} · tombol berhenti langganan <code>{"{{{unsubscribe_url}}}"}</code> wajib ada.</p>
      </Panel>
      <div className="adm-stack">
        <Panel title="3 · Audiens" meta={aud ? `${nf(aud.total)} penerima` : "menghitung…"}>
          <div className="adm-em-segs" role="radiogroup" aria-label="Segmen">{ov.data.segments.map((s) => <motion.button key={s.key} type="button" role="radio" aria-checked={segment === s.key} className={segment === s.key ? "on" : ""} onClick={() => setSegment(s.key)} whileTap={{ scale: 0.98 }}><span>{s.label}</span><b>{nf(s.eligible)}</b></motion.button>)}</div>
          <AnimatePresence initial={false}>{aud ? <motion.div key={segment} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="adm-em-aud">
            <p className="adm-hint">Dilewati: {nf(aud.skipped.noConsent)} belum setuju · {nf(aud.skipped.suppressed)} berhenti langganan · {nf(aud.skipped.recent)} baru dikirimi (≤72 jam) · {nf(aud.skipped.invalid)} email tidak valid.</p>
            {aud.sample.length ? <p className="adm-hint">Contoh: {aud.sample.map((s) => `${s.name} <${s.email}>`).join(", ")}</p> : null}</motion.div> : null}</AnimatePresence>
          {quotaShort ? <Note tone="warn">Kuota bulan ini tersisa {nf(ov.data.quota!.remaining!)} email, kurang dari {nf(aud!.total)} penerima.</Note> : null}
        </Panel>
        <Panel title="4 · Uji lalu kirim">
          <div className="adm-em-row"><input type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="kirim uji ke email kamu" aria-label="Email uji" /><button type="button" className="adm-btn" disabled={!ready || !testTo || busy !== null} onClick={() => run("test", async () => { await post("test", { to: testTo, subject, html }); setMsg({ tone: "ok", text: `Email uji terkirim ke ${testTo}.` }); })}>{busy === "test" ? "Mengirim…" : "Kirim uji"}</button></div>
          <label className="adm-em-f">Jadwalkan (opsional)<input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></label>
          <div className="adm-em-actions">
            <button type="button" className="adm-btn" disabled={!ready || busy !== null} onClick={() => run("draft", () => create(false))}>Simpan draf</button>
            <button type="button" className="adm-btn" disabled={!ready || !subject || busy !== null} onClick={() => { const n = window.prompt("Nama template", name); if (n) run("tpl", async () => { await post("templates", { name: n, subject, html }); ov.reload(); setMsg({ tone: "ok", text: "Template tersimpan." }); }); }}>Simpan sebagai template</button>
            {when ? <button type="button" className="adm-btn adm-primary" disabled={!ready || busy !== null} onClick={() => run("sched", () => create(false, new Date(when).toISOString()))}>Jadwalkan</button>
              : <button type="button" className="adm-btn adm-primary" disabled={!ready || !aud?.total || busy !== null} onClick={() => { if (window.confirm(`Kirim "${subject}" ke ${nf(aud?.total ?? 0)} orang sekarang?`)) run("send", () => create(true)); }}>{busy === "send" ? "Memulai…" : `Kirim ke ${nf(aud?.total ?? 0)} orang`}</button>}
          </div>
          <AnimatePresence>{msg ? <Note tone={msg.tone === "bad" ? "bad" : ""}>{msg.text}</Note> : null}</AnimatePresence>
        </Panel>
      </div>
    </div>
  </div>;
}

/* ---------- one campaign ---------- */
function CampaignPage({ id, go, compose, refreshVersion }: { id: string; go: (to: string) => void; compose: (seed: ComposeSeed) => void; refreshVersion: number }) {
  const [filter, setFilter] = useState("");
  const d = useAdmin<Detail>(`email/campaigns/${id}${filter ? `?status=${filter}` : ""}`, 3000, refreshVersion), [busy, setBusy] = useState(false), [err, setErr] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  if (gone) return null;
  if (!d.data) return d.error ? <div className="adm-err">Kampanye tidak ditemukan ({d.error}). <button type="button" onClick={() => go("/admin/email")}>Kembali</button></div> : <Loading />;
  const { campaign: c, stats, recipients } = d.data, total = c.total_recipients, done = sent(stats);
  const act = async (path: string, confirm?: string) => { if (confirm && !window.confirm(confirm)) return; setBusy(true); setErr(null); try { await post(`campaigns/${id}/${path}`); d.reload(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); } };
  const remove = async () => { if (!window.confirm("Hapus kampanye ini?")) return; setBusy(true); try { await del(`campaigns/${id}`); setGone(true); go("/admin/email"); } catch (e) { setErr((e as Error).message); setBusy(false); } };
  const st = STATUS[c.status] ?? [c.status, ""];
  return <div className="adm-stack">
    <motion.button type="button" className="adm-back" onClick={() => go("/admin/email")} whileHover={{ x: -3 }} whileTap={{ scale: 0.96 }}>← Semua kampanye</motion.button>
    <Panel><div className="adm-em-head"><div><h2>{c.name}</h2><span className="adm-sub">{c.subject}</span><div className="adm-tags"><Pill tone={st[1]}>{st[0]}</Pill><Pill>{c.segment}</Pill>{c.scheduled_at ? <Pill tone="info">jadwal {dTime(c.scheduled_at)}</Pill> : null}</div></div>
      <div className="adm-em-actions">
        <button type="button" className="adm-btn" onClick={() => compose({ name: `Salinan ${c.name}`.slice(0, 120), subject: c.subject, html: c.html, segment: c.segment })}>Salin kampanye</button>
        {["draft", "scheduled", "paused"].includes(c.status) ? <button type="button" className="adm-btn adm-primary" disabled={busy} onClick={() => act("start", c.status === "paused" ? undefined : `Kirim kampanye ini sekarang?`)}>{c.status === "paused" ? "Lanjutkan" : "Kirim sekarang"}</button> : null}
        {c.status === "sending" ? <button type="button" className="adm-btn" disabled={busy} onClick={() => act("pause")}>Jeda</button> : null}
        {["draft", "scheduled", "sending", "paused"].includes(c.status) ? <button type="button" className="adm-btn" disabled={busy} onClick={() => act("cancel", "Batalkan kampanye? Email yang belum terkirim tidak akan dikirim.")}>Batalkan</button> : null}
        {["draft", "scheduled", "canceled"].includes(c.status) ? <button type="button" className="adm-btn" disabled={busy} onClick={remove}>Hapus</button> : null}</div></div>
      {total ? <><Progress done={done} total={total} /><p className="adm-hint">{nf(done)} dari {nf(total)} terkirim{c.status === "sending" ? " · sedang berjalan, halaman ini menyegarkan otomatis" : ""}.</p></> : null}
      {c.last_error ? <Note tone="bad">{c.last_error}</Note> : null}{err ? <Note tone="bad">{err}</Note> : null}</Panel>
    <Kpis items={[
      { label: "Penerima", value: nf(total), hint: `${nf(stats.queued ?? 0)} masih antre` },
      { label: "Terkirim", value: nf(done), hint: pct(done, total) },
      { label: "Dikonfirmasi sampai", value: nf(stats.delivered ?? 0), hint: pct(stats.delivered ?? 0, done) },
      { label: "Dibuka", value: nf(d.data.opened), hint: pct(d.data.opened, done) },
      { label: "Diklik", value: nf(d.data.clicked), hint: pct(d.data.clicked, done) },
      { label: "Gagal / memantul", value: nf((stats.failed ?? 0) + (stats.bounced ?? 0) + (stats.complained ?? 0)), hint: `${nf(stats.skipped ?? 0)} dilewati`, tone: (stats.failed ?? 0) + (stats.bounced ?? 0) > 0 ? "warn" : undefined },
    ]} cols={6} />
    <div className="adm-grid2">
      <Panel title="Isi email"><div className="adm-em-prev"><div className="adm-em-subj">{fill(c.subject)}</div><iframe title="Isi email" sandbox="" srcDoc={fill(c.html)} /></div></Panel>
      <Panel title="Penerima" meta="300 pertama" action={<select className="adm-em-sel" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Saring status"><option value="">Semua status</option>{Object.entries(RSTATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select>} flush>
        <Table rowKey={(r) => String(r.id)} rows={recipients} empty="Belum ada penerima." cols={[{ head: "Penerima", cell: (r) => <><b>{r.name}</b><small className="adm-sub">{r.email}</small></> }, { head: "Status", cell: (r) => <><Pill tone={RSTATUS[r.status]?.[1]}>{RSTATUS[r.status]?.[0] ?? r.status}</Pill>{r.error ? <small className="adm-sub">{r.error}</small> : null}</> }, { head: "Waktu", cell: (r) => <>{dTime(r.sent_at)}{r.opened_at ? <small className="adm-sub">dibuka {dTime(r.opened_at)}</small> : null}</>, hideSm: true }]} />
      </Panel>
    </div>
  </div>;
}
