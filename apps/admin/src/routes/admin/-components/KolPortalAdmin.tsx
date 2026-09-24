import {
  CalendarDays,
  Check,
  Clipboard,
  FileText,
  Megaphone,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useYumiAuth } from "@/hooks/useYumiAuth";
import { isAdminLevelRole } from "@/lib/admin-access";

const API_URL = `${import.meta.env.VITE_SUPABASE_URL ?? ""}/functions/v1/kol-portal-admin`;
type Tab = "portfolio" | "submissions" | "campaigns" | "badges" | "visits";
type Overview = { portfolio: any[]; submissions: any[]; campaigns: any[]; badges: any[]; visits: any[]; creators?: Array<{ source_id: string; name: string; username?: string; location?: string; category?: string }> };
type Invite = {
  id: string;
  kol_id?: string;
  kol_creators?: { name?: string; username?: string };
  status: string;
  expires_at?: string;
  created_at?: string;
  updated_at?: string;
  linked_auth_user_id?: string | null;
  booking_status?: string | null;
};
type VisitCalendarItem = {
  id: number;
  booking_date: string;
  status: string;
  visit_note?: string | null;
  kol_creators?: { name?: string; username?: string };
};
type InviteCreateResponse = { invitationId: string; inviteUrl: string; expiresAt: string; status: string };
type BulkInviteResponse = {
  created: Array<{ invitationId: string; kolId: string; name: string; username?: string | null; inviteUrl: string; expiresAt: string; status: string }>;
  skipped: Array<{ kolId: string; reason: string }>;
  summary: { requested: number; created: number; skipped: number };
};

async function callAdmin<T>(token: string, action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action, ...payload }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.error) throw new Error(body.error || `Request gagal (${response.status})`);
  return body.data as T;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-5 p-4 sm:p-6">
      <header>
        <p className="text-[10px] font-black uppercase tracking-[.18em] text-sky-700">CREATOR PORTAL ADMIN</p>
        <h1 className="mt-1 text-2xl font-black tracking-tight">Review & operasional creator</h1>
        <p className="mt-1 text-sm text-muted-foreground">Kelola portfolio, bukti konten, campaign, badge, dan jadwal visit dalam satu workspace.</p>
      </header>
      {children}
    </div>
  );
}
function Badge({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-bold text-slate-700">{children}</span>;
}
function Empty({ text, action }: { text: string; action?: React.ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground"><p>{text}</p>{action}</div>;
}
function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"><span>{message}</span>{retry && <button onClick={retry} className="min-h-10 rounded-xl border border-red-300 px-3 font-bold">Coba lagi</button>}</div>;
}
function InviteSkeleton() {
  return <div className="space-y-3" aria-label="Memuat undangan"><div className="h-20 animate-pulse rounded-2xl bg-muted" /><div className="h-20 animate-pulse rounded-2xl bg-muted" /></div>;
}
function formatDate(value?: string) { return value ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: "Asia/Jakarta" }).format(new Date(value)) : "—"; }

export function KolPortalAdminPage() {
  const { token, isAdmin, role } = useYumiAuth();
  const canManage = isAdmin || isAdminLevelRole(role?.name);
  const [tab, setTab] = useState<Tab>("portfolio");
  const [data, setData] = useState<Overview>({ portfolio: [], submissions: [], campaigns: [], badges: [], visits: [], creators: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [campaign, setCampaign] = useState({ title: "", slug: "", description: "", benefitDescription: "", deliverableSummary: "", status: "draft" });
  const [invites, setInvites] = useState<Invite[]>([]);
  const [calendar, setCalendar] = useState<VisitCalendarItem[]>([]);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [calendarError, setCalendarError] = useState("");
  const [inviteForm, setInviteForm] = useState({ kolId: "", expiresAt: "" });
  const [createdInvite, setCreatedInvite] = useState<InviteCreateResponse | null>(null);
  const [copied, setCopied] = useState(false);
  const [selectedDate, setSelectedDate] = useState("");
  const [creatorOptions, setCreatorOptions] = useState<Array<{ source_id: string; name: string; username?: string }>>([]);

  const load = async () => {
    if (!token || !canManage) { setLoading(false); return; }
    setLoading(true); setError("");
    try { setData(await callAdmin<Overview>(token, "overview")); }
    catch (e) { setError(e instanceof Error ? e.message : "Gagal memuat Creator Portal admin."); }
    finally { setLoading(false); }
  };
  const loadVisits = async () => {
    if (!token) return;
    setCalendarLoading(true); setCalendarError("");
    try { setCalendar(await callAdmin<VisitCalendarItem[]>(token, "visit_calendar")); }
    catch (e) { setCalendarError(e instanceof Error ? e.message : "Kalender Visit belum dapat dimuat."); }
    finally { setCalendarLoading(false); }
  };
  const loadInvites = async () => {
    if (!token) return;
    setInviteLoading(true); setInviteError("");
    try { setInvites(await callAdmin<Invite[]>(token, "invite_list")); }
    catch (e) { setInviteError(e instanceof Error ? e.message : "Daftar undangan belum dapat dimuat."); }
    finally { setInviteLoading(false); }
  };
  useEffect(() => { void load(); }, [token, canManage]);
  useEffect(() => { if (tab === "visits" && token) { void loadInvites(); void loadVisits(); void callAdmin<Array<{ source_id: string; name: string; username?: string }>>(token, "creator_list").then(setCreatorOptions).catch(() => setCreatorOptions([])); } }, [tab, token]);

    const selectedBookings = calendar.filter((item) => !selectedDate || item.booking_date.slice(0, 10) === selectedDate);
  const calendarDates = [...new Set(calendar.map((item) => item.booking_date.slice(0, 10)))].sort();

  const review = async (action: string, id: number, status: string) => {
    if (!token) return;
    setBusy(`${action}:${id}`);
    try { await callAdmin(token, action, { id, status, note: status === "approved" ? "Disetujui admin Creator Portal" : "Perlu diperbaiki sesuai catatan admin." }); await load(); if (tab === "visits") await loadVisits(); }
    catch (e) { setError(e instanceof Error ? e.message : "Perubahan belum tersimpan."); }
    finally { setBusy(""); }
  };
  const saveCampaign = async (e: React.FormEvent) => {
    e.preventDefault(); if (!token) return; setBusy("campaign");
    try { await callAdmin(token, "campaign_save", { ...campaign }); setCampaign({ title: "", slug: "", description: "", benefitDescription: "", deliverableSummary: "", status: "draft" }); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Campaign belum tersimpan."); }
    finally { setBusy(""); }
  };
  const createInvite = async (e: React.FormEvent) => {
    e.preventDefault(); if (!token || !inviteForm.kolId) return;
    setBusy("invite_create"); setInviteError(""); setCreatedInvite(null);
    try { const result = await callAdmin<InviteCreateResponse>(token, "invite_create", { kolId: inviteForm.kolId, expiresAt: inviteForm.expiresAt || undefined }); setCreatedInvite(result); await loadInvites(); }
    catch (e) { setInviteError(e instanceof Error ? e.message : "Link undangan belum dibuat. Tidak ada perubahan yang diklaim berhasil."); }
    finally { setBusy(""); }
  };
  const copyInvite = async (url?: string) => {
    if (!url) return;
    try { await navigator.clipboard.writeText(url); setCopied(true); window.setTimeout(() => setCopied(false), 2500); }
    catch { setInviteError("Link siap, tetapi clipboard browser tidak tersedia. Salin link secara manual."); }
  };
  const inviteAction = async (action: "invite_revoke" | "invite_resend", invitationId: string) => {
    if (!token) return;
    if (action === "invite_revoke" && !window.confirm("Cabut link undangan ini? Link tidak akan dapat digunakan lagi.")) return;
    setBusy(`${action}:${invitationId}`); setInviteError("");
    try {
      const result = await callAdmin<InviteCreateResponse | undefined>(token, action, { invitationId });
      if (action === "invite_resend" && result?.inviteUrl) setCreatedInvite(result);
      await loadInvites();
    } catch (e) { setInviteError(e instanceof Error ? e.message : "Perubahan undangan belum tersimpan."); }
    finally { setBusy(""); }
  };

  if (!canManage) return <Shell><div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">Akses admin Creator Portal diperlukan.</div></Shell>;
  if (loading) return <Shell><div className="space-y-3"><div className="h-20 animate-pulse rounded-2xl bg-muted" /><div className="h-40 animate-pulse rounded-2xl bg-muted" /></div></Shell>;
  return <Shell>
    <div className="grid gap-3 sm:grid-cols-5">{[["Portfolio", data.portfolio.length, FileText], ["Bukti konten", data.submissions.length, Check], ["Campaign", data.campaigns.length, Megaphone], ["Badge", data.badges.length, ShieldCheck], ["Visit", data.visits.length, CalendarDays]].map(([label, count, Icon]: any) => <button onClick={() => setTab(String(label).toLowerCase().replace("bukti konten", "submissions") as Tab)} key={label} className="rounded-2xl border border-border bg-card p-4 text-left shadow-sm"><Icon className="h-4 w-4 text-sky-600" /><p className="mt-3 text-[10px] font-black uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-black">{count}</p></button>)}</div>
    {error && <ErrorState message={error} retry={() => void load()} />}
    <nav className="flex flex-wrap gap-2 rounded-2xl border border-border bg-card p-2">{([["portfolio", "Portfolio review"], ["submissions", "Bukti konten"], ["campaigns", "Campaign"], ["badges", "Badge"], ["visits", "Visit calendar"]] as Array<[Tab, string]>).map(([key, label]) => <button key={key} onClick={() => setTab(key)} className={`min-h-10 rounded-xl px-3 text-sm font-bold ${tab === key ? "bg-sky-600 text-white" : "text-muted-foreground hover:bg-muted"}`}>{label}</button>)}<button onClick={() => void load()} className="ml-auto grid h-10 w-10 place-items-center rounded-xl border border-border" aria-label="Refresh"><RefreshCw className="h-4 w-4" /></button></nav>
    {tab === "portfolio" && <section className="space-y-3">{data.portfolio.map((item) => <article key={item.id} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"><div><p className="font-bold">{item.title}</p><p className="mt-1 text-xs text-muted-foreground">{item.kol_creators?.name} · {item.platform} · <a className="text-sky-700 underline" href={item.content_url} target="_blank" rel="noreferrer">Buka konten</a></p><p className="mt-2 text-sm text-muted-foreground">{item.description || "Tanpa deskripsi"}</p></div><div className="flex items-center gap-2"><Badge>{item.review_status}</Badge><button disabled={busy === `portfolio_review:${item.id}`} onClick={() => void review("portfolio_review", item.id, "approved")} className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-600 text-white" aria-label="Approve portfolio"><Check className="h-4 w-4" /></button><button disabled={busy === `portfolio_review:${item.id}`} onClick={() => void review("portfolio_review", item.id, "rejected")} className="grid h-10 w-10 place-items-center rounded-xl bg-red-600 text-white" aria-label="Reject portfolio"><X className="h-4 w-4" /></button></div></article>)}{!data.portfolio.length && <Empty text="Belum ada portfolio untuk direview." />}</section>}
    {tab === "submissions" && <section className="space-y-3">{data.submissions.map((item) => <article key={item.id} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"><div><p className="font-bold">{item.kol_campaign_assignments?.kol_creators?.name || "Creator"} · {item.kol_campaign_assignments?.kol_campaigns?.title || "Campaign"}</p><p className="mt-1 text-xs text-muted-foreground">{item.deliverable_type} · <a className="text-sky-700 underline" href={item.content_url} target="_blank" rel="noreferrer">Buka bukti</a></p><p className="mt-2 text-sm text-muted-foreground">Status: {item.status}</p></div><div className="flex gap-2"><Badge>{item.status}</Badge><button onClick={() => void review("submission_review", item.id, "approved")} className="min-h-10 rounded-xl bg-emerald-600 px-3 text-xs font-bold text-white">Approve</button><button onClick={() => void review("submission_review", item.id, "needs_revision")} className="min-h-10 rounded-xl border border-amber-300 px-3 text-xs font-bold text-amber-700">Minta revisi</button></div></article>)}{!data.submissions.length && <Empty text="Belum ada bukti konten." />}</section>}
    {tab === "campaigns" && <section className="grid gap-4 lg:grid-cols-[.8fr_1.2fr]"><form onSubmit={saveCampaign} className="space-y-3 rounded-2xl border border-border bg-card p-5 shadow-sm"><h2 className="font-black">Buat campaign</h2>{(["title", "slug", "description", "benefitDescription", "deliverableSummary"] as const).map((key) => key === "description" || key === "benefitDescription" || key === "deliverableSummary" ? <textarea key={key} className="min-h-20 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" value={campaign[key]} onChange={(e) => setCampaign((x) => ({ ...x, [key]: e.target.value }))} placeholder={key} /> : <input key={key} className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" value={campaign[key]} onChange={(e) => setCampaign((x) => ({ ...x, [key]: e.target.value }))} placeholder={key} />)}<select className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" value={campaign.status} onChange={(e) => setCampaign((x) => ({ ...x, status: e.target.value }))}><option value="draft">Draft</option><option value="published">Publish</option><option value="closed">Tutup</option></select><button disabled={busy === "campaign"} className="min-h-11 w-full rounded-xl bg-sky-600 font-bold text-white">{busy === "campaign" ? "Menyimpan…" : "Simpan campaign"}</button></form><div className="space-y-3">{data.campaigns.map((item) => <article key={item.id} className="rounded-2xl border border-border bg-card p-5 shadow-sm"><div className="flex items-start justify-between"><div><h3 className="font-black">{item.title}</h3><p className="mt-1 text-xs text-muted-foreground">{item.slug}</p></div><Badge>{item.status}</Badge></div><p className="mt-3 text-sm text-muted-foreground">{item.description || "Tanpa deskripsi"}</p></article>)}{!data.campaigns.length && <Empty text="Belum ada campaign." />}</div></section>}
    {tab === "badges" && <section className="space-y-3">{data.badges.map((item) => <article key={`${item.kol_id}-${item.badge_id}`} className="flex items-center justify-between rounded-2xl border border-border bg-card p-4"><div><p className="font-bold">{item.kol_creators?.name || item.kol_id}</p><p className="text-sm text-muted-foreground">{item.kol_badges?.name || "Badge"}</p></div><Badge>Visible: {item.is_visible ? "Ya" : "Tidak"}</Badge></article>)}{!data.badges.length && <Empty text="Belum ada badge yang diberikan." />}</section>}
    {tab === "visits" && <VisitWorkspace {...{ token, invites, inviteLoading, inviteError, calendar, calendarLoading, calendarError, selectedDate, selectedBookings, calendarDates, inviteForm, setInviteForm, createdInvite, copied, setSelectedDate, createInvite, copyInvite, inviteAction, busy, loadInvites, loadVisits, creatorOptions, onDone: () => void loadInvites() }} />}
  </Shell>;
}

type BulkInvitePanelProps = { token: string | null; creatorOptions: Array<{ source_id: string; name: string; username?: string }>; busy: string; onDone: () => void };
function BulkInvitePanel({ token, creatorOptions, onDone }: BulkInvitePanelProps) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [expiresAt, setExpiresAt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<BulkInviteResponse | null>(null);
  const filtered = creatorOptions.filter((creator) => `${creator.name} ${creator.username ?? ""}`.toLowerCase().includes(query.toLowerCase()));
  const allVisibleSelected = filtered.length > 0 && filtered.every((creator) => selected.includes(creator.source_id));
  const toggle = (id: string) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const toggleVisible = () => setSelected((current) => allVisibleSelected ? current.filter((id) => !filtered.some((creator) => creator.source_id === id)) : [...new Set([...current, ...filtered.map((creator) => creator.source_id)])]);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token || !selected.length) return;
    setSubmitting(true); setError(""); setResult(null);
    try { const data = await callAdmin<BulkInviteResponse>(token, "invite_bulk_create", { kolIds: selected, expiresAt: expiresAt || undefined }); setResult(data); setSelected([]); onDone(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Link massal belum berhasil dibuat."); }
    finally { setSubmitting(false); }
  };
  const copyAll = async () => { if (result?.created.length) await navigator.clipboard.writeText(result.created.map((item) => item.inviteUrl).join("\n")); };
  const downloadCsv = () => {
    if (!result?.created.length) return;
    const rows = [["Nama", "Username", "Creator ID", "Link undangan", "Berlaku sampai"], ...result.created.map((item) => [item.name, item.username ?? "", item.kolId, item.inviteUrl, item.expiresAt])];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
    const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); link.download = "visit-invites.csv"; link.click(); URL.revokeObjectURL(link.href);
  };
  return <section className="rounded-2xl border border-sky-200 bg-sky-50/50 p-5 shadow-sm">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-[10px] font-black uppercase tracking-[.16em] text-sky-700">BULK INVITE</p><h2 className="mt-1 font-black">Buat link undangan massal</h2><p className="mt-1 text-xs text-muted-foreground">Satu link unik per creator. Creator yang masih memiliki link aktif otomatis dilewati.</p></div><span className="rounded-full bg-white px-3 py-1 text-xs font-black text-sky-700">{selected.length} dipilih</span></div>
    <form onSubmit={submit} className="mt-4 space-y-3"><div className="grid gap-2 sm:grid-cols-[1fr_220px]"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari creator atau username" className="h-11 rounded-xl border border-sky-200 bg-white px-3 text-sm" /><input type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} className="h-11 rounded-xl border border-sky-200 bg-white px-3 text-sm" aria-label="Berlaku sampai" /></div><div className="flex flex-wrap items-center gap-2"><button type="button" onClick={toggleVisible} className="min-h-10 rounded-xl border border-sky-200 bg-white px-3 text-xs font-bold text-sky-700">{allVisibleSelected ? "Batalkan semua terlihat" : "Pilih semua terlihat"}</button><button type="button" onClick={() => setSelected([])} className="min-h-10 rounded-xl border border-border bg-white px-3 text-xs font-bold text-muted-foreground">Kosongkan</button><span className="text-xs text-muted-foreground">Maksimal 200 creator per batch</span></div><div className="grid max-h-56 gap-2 overflow-y-auto rounded-xl border border-sky-100 bg-white p-2 sm:grid-cols-2">{filtered.map((creator) => <label key={creator.source_id} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-2 hover:bg-sky-50"><input type="checkbox" checked={selected.includes(creator.source_id)} onChange={() => toggle(creator.source_id)} className="h-4 w-4 accent-sky-600" /><span className="min-w-0 truncate text-sm font-semibold">{creator.name}<span className="ml-1 font-normal text-muted-foreground">{creator.username ? `@${creator.username}` : ""}</span></span></label>)}{!filtered.length && <p className="p-4 text-sm text-muted-foreground">Creator tidak ditemukan.</p>}</div><button disabled={submitting || !selected.length} className="min-h-11 w-full rounded-xl bg-sky-600 font-bold text-white disabled:opacity-50">{submitting ? "Membuat link…" : `Buat ${selected.length || ""} link undangan`}</button></form>
    {error && <div className="mt-3"><ErrorState message={error} /></div>}
    {result && <div className="mt-3 space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950"><p className="font-bold">{result.summary.created} link berhasil dibuat · {result.summary.skipped} creator dilewati</p>{result.skipped.length > 0 && <p className="text-xs">Creator dilewati karena tidak eligible atau masih memiliki link aktif.</p>}<div className="flex flex-wrap gap-2"><button type="button" onClick={() => void copyAll()} className="min-h-10 rounded-lg bg-emerald-700 px-3 text-xs font-bold text-white">Salin semua link</button><button type="button" onClick={downloadCsv} className="min-h-10 rounded-lg border border-emerald-300 px-3 text-xs font-bold text-emerald-800">Download CSV</button></div></div>}
  </section>;
}

type VisitWorkspaceProps = { creatorOptions: Array<{ source_id: string; name: string; username?: string }>; token: string | null; invites: Invite[]; inviteLoading: boolean; inviteError: string; calendar: VisitCalendarItem[]; calendarLoading: boolean; calendarError: string; selectedDate: string; selectedBookings: VisitCalendarItem[]; calendarDates: string[]; inviteForm: { kolId: string; expiresAt: string }; setInviteForm: React.Dispatch<React.SetStateAction<{ kolId: string; expiresAt: string }>>; createdInvite: InviteCreateResponse | null; copied: boolean; setSelectedDate: (value: string) => void; createInvite: (e: React.FormEvent) => Promise<void>; copyInvite: (url?: string) => Promise<void>; inviteAction: (action: "invite_revoke" | "invite_resend", invitationId: string) => Promise<void>; busy: string; loadInvites: () => Promise<void>; loadVisits: () => Promise<void>; onDone: () => void };
function VisitWorkspace(props: VisitWorkspaceProps) {
  const { creatorOptions, token, invites, inviteLoading, inviteError, calendar, calendarLoading, calendarError, selectedDate, selectedBookings, calendarDates, inviteForm, setInviteForm, createdInvite, copied, setSelectedDate, createInvite, copyInvite, inviteAction, busy, loadInvites, loadVisits, onDone } = props;
  return <section className="space-y-4">
    <BulkInvitePanel token={token} creatorOptions={creatorOptions} busy={busy} onDone={onDone} />
    <div className="grid gap-4 lg:grid-cols-[.85fr_1.15fr]">
      <form onSubmit={createInvite} className="space-y-3 rounded-2xl border border-border bg-card p-5 shadow-sm"><div><h2 className="font-black">Undang creator memilih jadwal Visit</h2><p className="mt-1 text-xs text-muted-foreground">Backend akan membuat token aman dan hanya mengembalikan raw link saat berhasil.</p></div><label className="block text-xs font-bold text-muted-foreground">Creator ID<select required value={inviteForm.kolId} onChange={(e) => setInviteForm((x) => ({ ...x, kolId: e.target.value }))} className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"><option value="">Pilih creator</option>{creatorOptions.map((creator) => <option key={creator.source_id} value={creator.source_id}>{creator.name}{creator.username ? ` · @${String(creator.username).replace(/^@+/, "")}` : ""}</option>)}</select></label><label className="block text-xs font-bold text-muted-foreground">Berlaku sampai (opsional)<input type="datetime-local" value={inviteForm.expiresAt} onChange={(e) => setInviteForm((x) => ({ ...x, expiresAt: e.target.value }))} className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" /></label><button disabled={busy === "invite_create" || !inviteForm.kolId} className="min-h-11 w-full rounded-xl bg-sky-600 font-bold text-white disabled:opacity-60">{busy === "invite_create" ? "Membuat link…" : "Buat link undangan"}</button>{inviteError && <ErrorState message={inviteError} retry={() => void loadInvites()} />}{createdInvite && <div className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"><p className="font-bold">Link undangan siap · berlaku {formatDate(createdInvite.expiresAt)}</p><div className="flex gap-2"><input readOnly value={createdInvite.inviteUrl} className="min-w-0 flex-1 rounded-lg border border-emerald-200 bg-white px-2 text-xs" /><button type="button" onClick={() => void copyInvite(createdInvite.inviteUrl)} className="inline-flex min-h-10 items-center gap-1 rounded-lg bg-emerald-700 px-3 text-xs font-bold text-white"><Clipboard className="h-3.5 w-3.5" />{copied ? "Tersalin" : "Salin"}</button></div></div>}</form>
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm"><div className="mb-3 flex items-center justify-between"><div><h2 className="font-black">Kalender booking Visit</h2><p className="text-xs text-muted-foreground">Sumber data: action visit_calendar · klik tanggal untuk detail.</p></div><button onClick={() => void loadVisits()} className="grid h-10 w-10 place-items-center rounded-xl border border-border" aria-label="Muat ulang kalender"><RefreshCw className="h-4 w-4" /></button></div>{calendarError && <ErrorState message={calendarError} retry={() => void loadVisits()} />}{calendarLoading ? <div className="space-y-2"><div className="h-10 animate-pulse rounded-xl bg-muted" /><div className="h-24 animate-pulse rounded-xl bg-muted" /></div> : <><div className="flex flex-wrap gap-2">{calendarDates.map((date) => <button key={date} onClick={() => setSelectedDate(date === selectedDate ? "" : date)} className={`rounded-xl border px-3 py-2 text-xs font-bold ${date === selectedDate ? "border-sky-600 bg-sky-600 text-white" : "border-border hover:bg-muted"}`}>{formatDate(date)} <span className="ml-1 opacity-70">{calendar.filter((x) => x.booking_date.slice(0, 10) === date).length}</span></button>)}{!calendarDates.length && <Empty text="Belum ada booking Visit." />}</div><div className="mt-4 space-y-2">{selectedBookings.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3"><div><p className="text-sm font-bold">{item.kol_creators?.name || "Creator"}</p><p className="text-xs text-muted-foreground">{formatDate(item.booking_date)} · {item.visit_note || "Tanpa catatan"}</p></div><Badge>{item.status}</Badge></div>)}{calendarDates.length > 0 && !selectedBookings.length && <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">Pilih tanggal untuk melihat booking.</p>}</div></>}</div>
    </div>
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm"><div className="mb-3 flex items-center justify-between"><div><h2 className="font-black">Daftar undangan Visit</h2><p className="text-xs text-muted-foreground">Raw link tidak ditampilkan kembali setelah create/resend.</p></div><button onClick={() => void loadInvites()} className="grid h-10 w-10 place-items-center rounded-xl border border-border" aria-label="Muat ulang undangan"><RefreshCw className="h-4 w-4" /></button></div>{inviteLoading ? <InviteSkeleton /> : invites.length ? <div className="space-y-2">{invites.map((invite) => <div key={invite.id} className="flex flex-col gap-3 rounded-xl border border-border p-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-bold">{invite.kol_creators?.name || invite.kol_id || "Creator"}</p><p className="mt-1 text-xs text-muted-foreground">{invite.kol_creators?.username ? `@${invite.kol_creators.username} · ` : ""}Berlaku {formatDate(invite.expires_at)} · {invite.linked_auth_user_id ? "Google terhubung" : "Belum terhubung"}</p></div><div className="flex flex-wrap items-center gap-2"><Badge>{invite.status}</Badge>{invite.booking_status && <Badge>Visit: {invite.booking_status}</Badge>}{["created", "opened", "authenticated", "linked", "schedule_selected"].includes(invite.status) && <button disabled={busy === `invite_revoke:${invite.id}`} onClick={() => void inviteAction("invite_revoke", invite.id)} className="min-h-10 rounded-xl border border-red-200 px-3 text-xs font-bold text-red-700">Cabut</button>}{["expired", "revoked"].includes(invite.status) && <button disabled={busy === `invite_resend:${invite.id}`} onClick={() => void inviteAction("invite_resend", invite.id)} className="min-h-10 rounded-xl border border-sky-200 px-3 text-xs font-bold text-sky-700">{busy === `invite_resend:${invite.id}` ? "Mengirim…" : "Buat ulang"}</button>}</div></div>)}</div> : <Empty text="Belum ada undangan Visit." />}</div>
  </section>;
}
