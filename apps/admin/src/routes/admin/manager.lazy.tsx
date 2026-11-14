import { createLazyFileRoute } from "@tanstack/react-router";
import { createPortal } from "react-dom";
import { ListTodo, ShieldCheck, FileText, BookOpen, Settings, ArrowLeft, Check, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useYumiAuth } from "@/hooks/useYumiAuth";
import { isAdminLevelRole } from "@/lib/admin-access";
import { ManagerWorkspace } from "./-manager/ManagerWorkspace";
import "./-manager/manager.css";
import { requestAdminConfirm } from "@/lib/admin-dialogs";

export const Route = createLazyFileRoute("/admin/manager")({ component: AdminManager });

// The Admin build's VITE_AUTH_URL may point to the staff login UI (or localhost).
// Manager APIs live on the auth-server host and have their own explicit override.
const API = String(import.meta.env.VITE_MANAGER_API_URL?.trim() || "https://api.djiwatentram.web.id").replace(/\/$/, "");
type Membership = { user_id: string; email: string | null; display_name: string | null; requested_role: "manager" | "supervisor"; role: string | null; status: string; requested_at: string };
type Report = { id: string; title: string; kind: string; body: Record<string, string>; from_name: string | null; from_role: string; status: string; review_note: string | null; created_at: string };
type Section = "ringkasan" | "akses" | "tugas" | "laporan" | "panduan" | "kebijakan";
const ROLE_LABEL: Record<string, string> = { manager: "Manager", supervisor: "Supervisor / Purchasing" };
const STATUS_LABEL: Record<string, string> = { pending: "Menunggu", approved: "Aktif", rejected: "Ditolak", revoked: "Dicabut", sent: "Terkirim", read: "Dibaca", needs_revision: "Perlu revisi", acknowledged: "Diterima" };
const SECTIONS: { id: Section; label: string }[] = [
  { id: "ringkasan", label: "Ringkasan" },
  { id: "akses", label: "Akun" },
  { id: "tugas", label: "Penugasan" },
  { id: "laporan", label: "Laporan" },
  { id: "panduan", label: "Playbook & Dokumen" },
  { id: "kebijakan", label: "Kebijakan" },
];
const panelClass = "rounded-2xl border border-border/70 bg-card shadow-sm";
const EMPTY_POLICY_VALUE: Record<string, unknown> = {};

function AdminManager() {
  const { token, isAdmin, role, isLoading: authLoading } = useYumiAuth();
  const allowed = Boolean(token && (isAdmin || isAdminLevelRole(role?.name)));
  const [members, setMembers] = useState<Membership[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errors, setErrors] = useState<{ members?: string; reports?: string }>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [section, setSection] = useState<Section>("tugas");
  useEffect(() => { window.dispatchEvent(new CustomEvent("manager-panel-title", {detail: SECTIONS.find(item => item.id === section)?.label || "Penugasan"})); }, [section]);

  const call = useCallback(async <T,>(path: string, method = "GET", body?: unknown): Promise<T> => {
    if (!token) throw new Error("Sesi Admin tidak tersedia. Masuk kembali lalu coba lagi.");
    const res = await fetch(`${API}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
    return data as T;
  }, [token]);

  const load = useCallback(async (quiet = false) => {
    if (!allowed) return;
    quiet ? setRefreshing(true) : setLoading(true);
    const [membersResult, reportsResult] = await Promise.allSettled([
      call<{ memberships: Membership[] }>("/api/admin-manager/memberships"),
      call<{ reports: Report[] }>("/api/admin-manager/reports"),
    ]);
    const nextErrors: { members?: string; reports?: string } = {};
    if (membersResult.status === "fulfilled") setMembers(membersResult.value.memberships ?? []);
    else nextErrors.members = errorMessage(membersResult.reason);
    if (reportsResult.status === "fulfilled") setReports(reportsResult.value.reports ?? []);
    else nextErrors.reports = errorMessage(reportsResult.reason);
    setErrors(nextErrors);
    setLoading(false);
    setRefreshing(false);
  }, [allowed, call]);
  useEffect(() => { void load(); }, [load]);

  if (authLoading) return <div className="mx-auto max-w-6xl p-4"><div className={`${panelClass} p-6 text-sm text-muted-foreground`} role="status">Memeriksa sesi Admin…</div></div>;
  if (!allowed) return <div className="mx-auto max-w-6xl p-4"><div className={`${panelClass} p-6 text-sm text-muted-foreground`}>Halaman ini khusus Owner/Admin.</div></div>;

  const decide = async (m: Membership, decision: "approve" | "reject" | "revoke") => {
    if (decision === "revoke" && !(await requestAdminConfirm({ title: "Cabut akses akun?", message: `Akun ${m.display_name || m.email || "ini"} tidak lagi dapat membuka aplikasi Manager. Akses dapat diberikan kembali nanti.`, confirmText: "Cabut akses" }))) return;
    setBusy(m.user_id);
    try {
      await call(`/api/admin-manager/memberships/${encodeURIComponent(m.user_id)}/decision`, "POST", { decision, role: m.requested_role });
      toast.success(decision === "approve" ? "Akun disetujui" : decision === "reject" ? "Permintaan ditolak" : "Akses akun dicabut");
      await load(true);
    } catch (e) { toast.error((e as Error).message === "ROLE_TAKEN" ? "Peran itu sudah dipegang akun lain. Cabut dulu akun lama." : `Gagal: ${(e as Error).message}`); }
    finally { setBusy(null); }
  };

  const review = async (r: Report, status: "acknowledged" | "needs_revision") => {
    if (busy) return;
    setBusy(r.id);
    try { await call(`/api/admin-manager/reports/${r.id}`, "PATCH", { status }); toast.success(status === "acknowledged" ? "Laporan diterima" : "Laporan diminta untuk direvisi"); await load(true); }
    catch (e) { toast.error(`Gagal: ${(e as Error).message}`); }
    finally { setBusy(null); }
  };

  const pendingMembers = members.filter((m) => m.status === "pending").length;
  const activeMembers = members.filter((m) => m.status === "approved").length;
  const reportsToReview = reports.filter((r) => r.status === "sent").length;

  const navTarget = document.getElementById("manager-owner-navigation");
  const sectionIcons = {tugas:ListTodo,akses:ShieldCheck,laporan:FileText,panduan:BookOpen,kebijakan:Settings,ringkasan:ListTodo};
  return (
    <div className="manager-owner">
      {navTarget && createPortal(<nav className="manager-rail" aria-label="Navigasi Manager"><a href="/admin" title="Kembali ke Admin"><ArrowLeft size={18}/><span>Kembali ke Admin</span></a>{SECTIONS.filter(item=>item.id !== "ringkasan").map(({id,label})=>{const Icon=sectionIcons[id];return <button title={label} key={id} aria-label={label} aria-current={section === id ? "page" : undefined} onClick={()=>setSection(id)}><Icon size={18}/><span>{label}</span></button>;})}</nav>,navTarget)}
      <div className="manager-toolbar"><nav aria-label="Bagian Manager & Supervisor">
        {SECTIONS.filter(({id}) => id !== "ringkasan").map(({id,label}) => <button key={id} aria-current={section === id ? "page" : undefined} onClick={() => setSection(id)}>{label}</button>)}
      </nav><button className="manager-refresh" onClick={() => void load(true)} disabled={refreshing}><RefreshCw size={14} /> Muat ulang</button></div>
      {section === "tugas" && <ManagerWorkspace call={call} />}
      {section === "ringkasan" && <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <MetricCard title="Permintaan akses" value={loading ? "…" : pendingMembers} detail="Perlu ditinjau Owner" onClick={() => setSection("akses")} />
          <MetricCard title="Akun aktif" value={loading ? "…" : activeMembers} detail="Manager & Supervisor" onClick={() => setSection("akses")} />
          <MetricCard title="Laporan baru" value={loading ? "…" : reportsToReview} detail="Menunggu tinjauan Owner" onClick={() => setSection("laporan")} />
        </div>
        <div className="grid gap-5 xl:grid-cols-2">
          <Panel title="Permintaan akses terbaru" description="Setujui atau tolak permintaan peran dari aplikasi Manager.">
            <MemberList members={members.filter((m) => m.status === "pending").slice(0, 5)} loading={loading} error={errors.members} busy={busy} onDecide={decide} />
            <SectionLink onClick={() => setSection("akses")}>Lihat semua akun</SectionLink>
          </Panel>
          <Panel title="Laporan yang perlu ditinjau" description="Laporan Manager dan Supervisor yang baru dikirim.">
            <ReportList reports={reports.filter((r) => r.status === "sent").slice(0, 4)} loading={loading} error={errors.reports} busy={busy} onReview={review} />
            <SectionLink onClick={() => setSection("laporan")}>Buka kotak masuk</SectionLink>
          </Panel>
        </div>
      </div>}

      {section === "akses" && <Panel title="Akses Manager & Supervisor" description="Satu akun aktif untuk setiap peran. Perubahan akses langsung berlaku di aplikasi Manager.">
        <MemberList members={members} loading={loading} error={errors.members} busy={busy} onDecide={decide} onRetry={() => void load(true)} />
      </Panel>}

      {section === "laporan" && <Panel title="Laporan masuk" description="Tinjau laporan dari Manager dan Supervisor. Status dan catatan tinjauan tersimpan di server.">
        <ReportList reports={reports} loading={loading} error={errors.reports} busy={busy} onReview={review} onRetry={() => void load(true)} />
      </Panel>}

      {section === "panduan" && <ContentSections call={call} />}
      {section === "kebijakan" && <PolicySection call={call} />}
    </div>
  );
}

function errorMessage(error: unknown) {
  if (error instanceof TypeError) return "Server tidak dapat dijangkau. Periksa koneksi lalu coba lagi.";
  return error instanceof Error ? error.message : "Terjadi kesalahan saat memuat data.";
}

function Panel({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <Card className={panelClass}>
    <CardHeader className="border-b border-border/70 px-4 py-3 sm:px-5">
      <CardTitle className="text-base font-semibold">{title}</CardTitle>
      <p className="text-sm text-muted-foreground">{description}</p>
    </CardHeader>
    <CardContent className="space-y-4 p-4 sm:p-5">{children}</CardContent>
  </Card>;
}

function MetricCard({ title, value, detail, onClick }: { title: string; value: string | number; detail: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`${panelClass} flex min-h-28 w-full items-center p-4 text-left transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}>
    <span className="min-w-0"><span className="block text-sm font-medium text-muted-foreground">{title}</span><span className="block text-2xl font-bold tracking-tight">{value}</span><span className="block truncate text-xs text-muted-foreground">{detail}</span></span>
  </button>;
}

function SectionLink({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return <div className="border-t border-border/70 pt-3"><Button variant="ghost" size="sm" onClick={onClick}>{children} <span aria-hidden="true">→</span></Button></div>;
}

function MemberList({ members, loading, error, busy, onDecide, onRetry }: { members: Membership[]; loading: boolean; error?: string; busy: string | null; onDecide: (member: Membership, decision: "approve" | "reject" | "revoke") => void; onRetry?: () => void }) {
  if (loading) return <div className="space-y-3" role="status" aria-label="Memuat akun">{[1, 2, 3].map((item) => <div key={item} className="h-[72px] animate-pulse rounded-xl bg-muted/70" />)}</div>;
  if (error) return <ErrorNotice message={error} onRetry={onRetry} />;
  if (!members.length) return <EmptyState title="Belum ada akun" detail="Permintaan akses Manager atau Supervisor akan tampil di sini." />;
  return <div className="divide-y divide-border/70 rounded-xl border border-border/70">
    {members.map((member) => <div key={member.user_id} className="flex flex-wrap items-center justify-between gap-3 p-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2"><span className="truncate font-semibold">{member.display_name || member.email || "Akun tanpa nama"}</span><Badge variant={member.status === "pending" ? "warning" : member.status === "approved" ? "success" : "secondary"}>{STATUS_LABEL[member.status] ?? member.status}</Badge></div>
        <p className="mt-1 break-all text-sm text-muted-foreground">{member.email || "Email tidak tersedia"} · {ROLE_LABEL[member.requested_role] ?? member.requested_role}</p>
        <p className="mt-1 text-xs text-muted-foreground">Meminta akses {formatDate(member.requested_at)}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {member.status !== "approved" && <Button size="sm" disabled={busy !== null} loading={busy === member.user_id} onClick={() => onDecide(member, "approve")}>Setujui</Button>}
        {member.status === "pending" && <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => onDecide(member, "reject")}>Tolak</Button>}
        {member.status === "approved" && <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => onDecide(member, "revoke")}>Cabut akses</Button>}
      </div>
    </div>)}
  </div>;
}

function ReportList({ reports, loading, error, busy, onReview, onRetry }: { reports: Report[]; loading: boolean; error?: string; busy: string | null; onReview: (report: Report, status: "acknowledged" | "needs_revision") => void; onRetry?: () => void }) {
  if (loading) return <div className="space-y-3" role="status" aria-label="Memuat laporan">{[1, 2].map((item) => <div key={item} className="h-28 animate-pulse rounded-xl bg-muted/70" />)}</div>;
  if (error) return <ErrorNotice message={error} onRetry={onRetry} />;
  if (!reports.length) return <EmptyState title="Belum ada laporan baru" detail="Laporan yang dikirim ke Owner akan muncul di kotak masuk ini." />;
  return <div className="space-y-3">
    {reports.map((report) => <article key={report.id} className="rounded-xl border border-border/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><h3 className="font-semibold">{report.title}</h3><p className="mt-1 text-sm text-muted-foreground">{report.from_name || ROLE_LABEL[report.from_role] || report.from_role} · {formatDate(report.created_at)}</p></div>
        <Badge variant={report.status === "sent" ? "info" : report.status === "needs_revision" ? "warning" : report.status === "acknowledged" ? "success" : "secondary"}>{STATUS_LABEL[report.status] ?? report.status}</Badge>
      </div>
      {Object.keys(report.body ?? {}).length > 0 && <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        {Object.entries(report.body ?? {}).map(([key, value]) => <div key={key} className="min-w-0"><dt className="text-xs font-medium text-muted-foreground">{key}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm">{String(value)}</dd></div>)}
      </dl>}
      {report.review_note && <p className="mt-3 rounded-lg bg-muted/60 p-3 text-sm text-muted-foreground">Catatan tinjauan: {report.review_note}</p>}
      {report.status === "sent" && <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" disabled={busy !== null} loading={busy === report.id} onClick={() => onReview(report, "acknowledged")}><Check /> Terima</Button>
        <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => onReview(report, "needs_revision")}>Minta revisi</Button>
      </div>}
    </article>)}
  </div>;
}

function ErrorNotice({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
    <p className="font-semibold text-destructive">Data belum berhasil dimuat</p><p className="mt-1 text-muted-foreground">{message}</p>
    {onRetry && <Button className="mt-3" size="sm" variant="outline" onClick={onRetry}>Coba lagi</Button>}
  </div>;
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="rounded-xl border border-dashed border-border p-6 text-center"><p className="font-medium">{title}</p><p className="mt-1 text-sm text-muted-foreground">{detail}</p></div>;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Waktu tidak tersedia";
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(date);
}

type ContentRow = {
  slug: string; title: string; position: number; category?: string; roles: string[]; body: unknown; updated_at?: string;
};

function ContentSections({ call }: { call: <T,>(path: string, method?: string, body?: unknown) => Promise<T> }) {
  const [kind, setKind] = useState<"playbook" | "documents">("playbook");
  const [items, setItems] = useState<ContentRow[]>([]);
  const [selected, setSelected] = useState<ContentRow | null>(null);
  const [draft, setDraft] = useState<ContentRow | null>(null);
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [roles, setRoles] = useState<string[]>(["manager", "supervisor"]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (next = kind) => {
    setLoading(true);
    setError("");
    try {
      const data = await call<{ items: ContentRow[] }>(`/api/admin-manager/${next}`);
      setItems(data.items ?? []);
      setSelected(data.items?.[0] ?? null);
      setDraft(null);
    } catch (e) { setError(errorMessage(e)); }
    finally { setLoading(false); }
  }, [call, kind]);
  useEffect(() => { void load(kind); }, [kind, load]);

  const edit = (row: ContentRow) => {
    setDraft(row);
    setTitle(row.title);
    setCategory(row.category ?? "");
    setRoles(row.roles ?? ["manager", "supervisor"]);
    setText(JSON.stringify(row.body, null, 2));
  };

  const save = async () => {
    if (!draft) return;
    if (!title.trim()) { toast.error("Judul wajib diisi"); return; }
    if (roles.length === 0) { toast.error("Pilih minimal satu peran penerima"); return; }
    let body: unknown;
    try { body = JSON.parse(text); }
    catch { toast.error("Isi JSON belum valid"); return; }
    setSaving(true);
    try {
      await call(`/api/admin-manager/${kind}/${encodeURIComponent(draft.slug)}`, "PUT", { title, body, roles, category, position: draft.position });
      toast.success("Tersimpan");
      await load();
    } catch (e) { toast.error(`Gagal: ${(e as Error).message}`); }
    finally { setSaving(false); }
  };

  return (
    <Panel title="Playbook & Dokumen" description="Atur konten dan templat yang dibaca Manager dan Supervisor.">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Jenis konten">
        <Button size="sm" className={kind === "playbook" ? "manager-selected" : ""} variant="outline" aria-pressed={kind === "playbook"} onClick={() => setKind("playbook")}>Playbook</Button>
        <Button size="sm" className={kind === "documents" ? "manager-selected" : ""} variant="outline" aria-pressed={kind === "documents"} onClick={() => setKind("documents")}>Dokumen</Button>
      </div>
      {error && <ErrorNotice message={error} onRetry={() => void load()} />}
      {loading ? <div className="space-y-2" role="status" aria-label="Memuat konten">{[1, 2, 3].map((item) => <div key={item} className="h-16 animate-pulse rounded-xl bg-muted/70" />)}</div> : !error && <div className="divide-y divide-border/70 rounded-xl border border-border/70">
        {items.map((row) => <div key={row.slug} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm sm:p-4">
          <div className="min-w-0"><div className="truncate font-semibold">{row.title}</div><div className="mt-1 truncate text-xs text-muted-foreground">{row.slug}{row.category ? ` · ${row.category}` : ""} · {row.roles?.map((r) => ROLE_LABEL[r] ?? r).join(", ") || "Tanpa penerima"}</div></div>
          <Button size="sm" variant="outline" onClick={() => { setSelected(row); setDraft(null); }}>Buka</Button>
        </div>)}
        {items.length === 0 && <div className="p-5"><EmptyState title="Belum ada konten" detail="Konten yang tersedia di aplikasi Manager akan tampil di sini." /></div>}
      </div>}
      {selected && !draft && <article className="manager-reading"><p className="manager-reading-label">{kind === "playbook" ? "Playbook SOP" : selected.category || "Dokumen"}</p><div className="manager-reading-title"><h2>{selected.title}</h2><Button size="sm" variant="outline" onClick={() => edit(selected)}>Edit konten</Button></div><ContentBody value={selected.body} /></article>}
      {draft && <div className="space-y-4 rounded-xl border border-border/70 bg-muted/20 p-4">
        <div><p className="text-xs font-semibold uppercase tracking-wide text-primary">Mengedit {kind === "playbook" ? "Playbook" : "dokumen"}</p><p className="mt-1 font-semibold">{draft.slug}</p></div>
        <label className="block space-y-1.5 text-sm font-medium">Judul<Input value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder="Judul" /></label>
        {kind === "documents" && <label className="block space-y-1.5 text-sm font-medium">Kategori<Input value={category} maxLength={60} onChange={(e) => setCategory(e.target.value)} placeholder="Kategori dokumen" /></label>}
        <fieldset className="flex flex-wrap gap-x-5 gap-y-2 text-sm"><legend className="mb-2 font-medium">Tampilkan kepada</legend>
          {["manager", "supervisor"].map((r) => <label key={r} className="flex min-h-11 items-center gap-2"><input className="size-4 accent-primary" type="checkbox" checked={roles.includes(r)} onChange={(e) => setRoles(e.target.checked ? [...roles, r] : roles.filter((x) => x !== r))} />{ROLE_LABEL[r]}</label>)}
        </fieldset>
        <ContentBodyEditor value={JSON.parse(text || "{}")} onChange={(value) => setText(JSON.stringify(value))} />
        <div className="flex flex-wrap gap-2"><Button size="sm" loading={saving} disabled={saving} onClick={() => void save()}>Simpan perubahan</Button><Button size="sm" variant="outline" disabled={saving} onClick={() => setDraft(null)}>Batal</Button></div>
      </div>}
    </Panel>
  );
}

const CONTENT_LABELS: Record<string,string> = {goal:"Tujuan", purpose:"Tujuan",steps:"Langkah kerja",auto:"Otomatis oleh sistem",draft:"Catatan validasi Owner",when:"Kapan digunakan",sources:"Sumber data",issue:"Kendala & penanganan",table:"Referensi",th:"Kolom referensi",fmt:"Format",to:"Penerima",docs:"Dokumen terkait",open:"Aplikasi terkait",blocks:"Isi dokumen",example:"Contoh",fields:"Isian"};
function ContentBody({value}: {value: unknown}) {
  if (value == null) return null;
  if (typeof value !== "object") return <p className="whitespace-pre-wrap">{String(value)}</p>;
  if (Array.isArray(value)) return <ul>{value.map((item,index) => <li key={index}><ContentBody value={item} /></li>)}</ul>;
  return <div>{Object.entries(value).filter(([key]) => !["id","ic","who","t"].includes(key)).map(([key,item]) => <section key={key}><h3>{CONTENT_LABELS[key] || key}</h3><ContentBody value={item}/></section>)}</div>;
}
function ContentBodyEditor({value,onChange}: {value: Record<string, unknown>;onChange:(value:Record<string,unknown>)=>void}) {
  return <div className="space-y-4">{Object.entries(value).filter(([key,item]) => !["id","ic","who","t"].includes(key) && (typeof item === "string" || (Array.isArray(item) && item.every(v => typeof v === "string")))).map(([key,item]) => <label key={key} className="block space-y-1.5 text-sm font-medium">{CONTENT_LABELS[key] || key}{Array.isArray(item) && <span className="ml-2 text-xs font-normal text-muted-foreground">Satu butir per baris</span>}<Textarea rows={Array.isArray(item)?5:3} value={Array.isArray(item)?item.join("\n"):String(item)} onChange={e=>onChange({...value,[key]:Array.isArray(item)?e.target.value.split("\n"):e.target.value})}/></label>)}</div>;
}

type SettingRow = { key: string; value: Record<string, unknown> };
const POLICY: { key: string; label: string; fields: [string, string][] }[] = [
  { key: "expense_policy", label: "Kebijakan pengeluaran", fields: [["approvalAbove", "Persetujuan Manager di atas (Rp)"], ["photoMin", "Wajib foto bukti di atas (Rp)"]] },
  { key: "opname_policy", label: "Kebijakan opname", fields: [["tolDefault", "Toleransi selisih (%)"], ["tolImportant", "Toleransi bahan penting (%)"]] },
  { key: "payroll_policy", label: "Kebijakan gaji", fields: [["adjustmentLimit", "Batas penyesuaian Manager (Rp)"]] },
];

function PolicySection({ call }: { call: <T,>(path: string, method?: string, body?: unknown) => Promise<T> }) {
  const [settings, setSettings] = useState<SettingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await call<{ settings: SettingRow[] }>("/api/admin-manager/overview");
      setSettings(data.settings ?? []);
    } catch (e) { setError(errorMessage(e)); }
    finally { setLoading(false); }
  }, [call]);
  useEffect(() => { void load(); }, [load]);

  const save = async (key: string, value: Record<string, unknown>) => {
    try { await call(`/api/admin-manager/settings/${key}`, "PUT", { value }); toast.success("Kebijakan tersimpan"); await load(); }
    catch (e) { toast.error(`Gagal: ${(e as Error).message}`); }
  };

  return (
    <Panel title="Kebijakan Owner" description="Atur batas pengeluaran, ketelitian opname, dan penyesuaian gaji.">
      {error && <ErrorNotice message={error} onRetry={() => void load()} />}
      {loading ? <div className="space-y-3" role="status" aria-label="Memuat kebijakan">{[1, 2, 3].map((item) => <div key={item} className="h-32 animate-pulse rounded-xl bg-muted/70" />)}</div> : !error && <div className="grid gap-4 xl:grid-cols-2">
        {POLICY.map((policy) => {
          const row = settings.find((setting) => setting.key === policy.key);
          return <PolicyEditor key={policy.key} label={policy.label} fieldKey={policy.key} fields={policy.fields} value={row?.value ?? EMPTY_POLICY_VALUE} onSave={save} />;
        })}
      </div>}
    </Panel>
  );
}

function PolicyEditor({ label, fieldKey, fields, value, onSave }: { label: string; fieldKey: string; fields: [string, string][]; value: Record<string, unknown>; onSave: (key: string, value: Record<string, unknown>) => Promise<void> }) {
  const [local, setLocal] = useState<Record<string, string>>(() => Object.fromEntries(fields.map(([k]) => [k, value[k] === undefined ? "" : String(value[k])])));
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setLocal(Object.fromEntries(fields.map(([key]) => [key, value[key] === undefined ? "" : String(value[key])] )));
  }, [fields, value]);
  const submit = async () => {
    setSaving(true);
    try {
      await onSave(fieldKey, { ...value, ...Object.fromEntries(Object.entries(local).filter(([, item]) => item !== "").map(([key, item]) => [key, Number(item)])) });
    } finally { setSaving(false); }
  };
  return (
    <div className="rounded-xl border border-border/70 p-4 text-sm">
      <div className="mb-4 font-semibold">{label}</div>
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map(([k, lbl]) => (
          <label key={k} className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">{lbl}</span>
            <Input type="number" min="0" step="1" inputMode="numeric" value={local[k] ?? ""} onChange={(e) => setLocal({ ...local, [k]: e.target.value })} />
          </label>
        ))}
      </div>
      <Button size="sm" className="mt-4" loading={saving} disabled={saving || Object.values(local).some((item) => item !== "" && (!Number.isFinite(Number(item)) || Number(item) < 0))} onClick={() => void submit()}>Simpan kebijakan</Button>
    </div>
  );
}

