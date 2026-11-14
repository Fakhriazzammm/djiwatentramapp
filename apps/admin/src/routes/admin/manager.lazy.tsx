import { createLazyFileRoute } from "@tanstack/react-router";
import { createPortal } from "react-dom";
import { ListTodo, ShieldCheck, FileText, BookOpen, Settings, ArrowLeft } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useYumiAuth } from "@/hooks/useYumiAuth";
import { isAdminLevelRole } from "@/lib/admin-access";
import { ManagerWorkspace } from "./-manager/ManagerWorkspace";
import "./-manager/manager.css";
import "./-manager/proto-scoped.css";
import { requestAdminConfirm } from "@/lib/admin-dialogs";

export const Route = createLazyFileRoute("/admin/manager")({ component: AdminManager });

// The Admin build's VITE_AUTH_URL may point to the staff login UI (or localhost).
// Manager APIs live on the auth-server host and have their own explicit override.
const API = String(import.meta.env.VITE_MANAGER_API_URL?.trim() || "https://api.djiwatentram.web.id").replace(/\/$/, "");
type Membership = { user_id: string; email: string | null; display_name: string | null; requested_role: "manager" | "supervisor"; role: string | null; status: string; requested_at: string };
type Report = { id: string; title: string; kind: string; body: Record<string, string>; from_name: string | null; from_role: string; status: string; review_note: string | null; created_at: string };
type Section = "ringkasan" | "akses" | "tugas" | "laporan" | "panduan" | "stok" | "format" | "kebijakan";
const ROLE_LABEL: Record<string, string> = { manager: "Manager", supervisor: "Supervisor / Purchasing" };
const STATUS_LABEL: Record<string, string> = { pending: "Menunggu", approved: "Aktif", rejected: "Ditolak", revoked: "Dicabut", sent: "Terkirim", read: "Dibaca", needs_revision: "Perlu revisi", acknowledged: "Diterima" };
const SECTIONS: { id: Section; label: string }[] = [
  { id: "ringkasan", label: "Ringkasan" },
  { id: "akses", label: "Akun" },
  { id: "tugas", label: "Penugasan" },
  { id: "laporan", label: "Laporan" },
  { id: "panduan", label: "Playbook & Dokumen" },
  { id: "stok", label: "Stok & Opname" },
  { id: "format", label: "Format & Bot" },
  { id: "kebijakan", label: "Kebijakan & AI" },
];
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

  if (authLoading) return <div className="mgr-proto"><div className="empty" role="status">MEMERIKSA SESI ADMIN…</div></div>;
  if (!allowed) return <div className="mgr-proto"><div className="empty">HALAMAN INI KHUSUS OWNER / ADMIN</div></div>;

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
  const navTarget = document.getElementById("manager-owner-navigation");
  const sectionIcons = {tugas:ListTodo,akses:ShieldCheck,laporan:FileText,panduan:BookOpen,stok:Settings,format:FileText,kebijakan:Settings,ringkasan:ListTodo};
  const counts: Partial<Record<Section, number>> = { akses: pendingMembers, laporan: reports.filter((r) => r.status === "sent").length };
  return (
    <div className="mgr-proto" style={{ padding: "0 4px 18px" }}>
      {navTarget && createPortal(<nav className="manager-rail" aria-label="Navigasi Manager"><a href="/admin" title="Kembali ke Admin"><ArrowLeft size={18}/><span>Kembali ke Admin</span></a>{SECTIONS.filter(item=>item.id !== "ringkasan").map(({id,label}) => { const Icon = sectionIcons[id]; return <button key={id} aria-current={section === id ? "page" : undefined} title={label} onClick={() => setSection(id)}><Icon size={18}/><span>{label}</span></button>; })}</nav>, navTarget)}
      <div className="fh" style={{ marginBottom: 12 }}>
        <div className="tabs" style={{ margin: 0 }}>
          {SECTIONS.filter(({ id }) => id !== "ringkasan").map(({ id, label }) => <button key={id} className={section === id ? "on" : ""} onClick={() => setSection(id)}>{label}{counts[id] ? ` ${counts[id]}` : ""}</button>)}
        </div>
        <button className="btn" style={{ marginLeft: "auto" }} onClick={() => void load(true)} disabled={refreshing}>{refreshing ? "Memuat…" : "Muat ulang"}</button>
      </div>
      {section === "tugas" && <ManagerWorkspace call={call} />}
      {section === "akses" && <AccessPanel members={members} loading={loading} error={errors.members} busy={busy} onDecide={decide} onRetry={() => void load(true)} />}
      {section === "laporan" && <ReportsPanel reports={reports} loading={loading} error={errors.reports} busy={busy} onReview={review} onRetry={() => void load(true)} />}
      {section === "panduan" && <ContentSections call={call} />}
      {section === "stok" && <OpnamePanel call={call} />}
      {section === "format" && <FormatPanel call={call} />}
      {section === "kebijakan" && <PolicySection call={call} />}
    </div>
  );
}

function errorMessage(error: unknown) {
  if (error instanceof TypeError) return "Server tidak dapat dijangkau. Periksa koneksi lalu coba lagi.";
  return error instanceof Error ? error.message : "Terjadi kesalahan saat memuat data.";
}
const Empty = ({ children }: { children: React.ReactNode }) => <div className="empty">{children}</div>;
const Err = ({ message, onRetry }: { message: string; onRetry?: () => void }) => <div className="empty" role="alert">DATA BELUM BERHASIL DIMUAT · {message} {onRetry && <button className="btn s" onClick={onRetry}>Coba lagi</button>}</div>;
function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Waktu tidak tersedia";
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(date);
}

function AccessPanel({ members, loading, error, busy, onDecide, onRetry }: { members: Membership[]; loading: boolean; error?: string; busy: string | null; onDecide: (m: Membership, d: "approve" | "reject" | "revoke") => void; onRetry: () => void }) {
  const pending = members.filter((m) => m.status === "pending");
  const active = members.filter((m) => m.status === "approved");
  const rest = members.filter((m) => m.status !== "pending" && m.status !== "approved");
  const row = (m: Membership) => {
    const ini = (m.display_name || m.email || "?").split(/\s+/).map((x) => x[0]).join("").slice(0, 2).toUpperCase();
    return (
      <div key={m.user_id} className="mr" style={{ padding: "12px 16px" }}>
        <span style={{ display: "flex", gap: 12, alignItems: "center", minWidth: 0 }}>
          <span className="avatar" style={{ marginTop: 0, flex: "none" }}>{ini}</span>
          <span style={{ minWidth: 0 }}><b style={{ fontWeight: 550 }}>{m.display_name || m.email || "Akun tanpa nama"}</b> <span className={`tg ${m.status === "approved" ? "ok" : m.status === "pending" ? "md" : "hi"}`}>{STATUS_LABEL[m.status] ?? m.status}</span>
            <div className="meta">{m.email || "Email tidak tersedia"} · {ROLE_LABEL[m.requested_role] ?? m.requested_role} · {formatDate(m.requested_at)}</div></span>
        </span>
        <span style={{ display: "flex", gap: 6, flex: "none" }}>
          {m.status !== "approved" && <button className="btn s p" disabled={busy !== null} onClick={() => onDecide(m, "approve")}>{busy === m.user_id ? "…" : "Setujui"}</button>}
          {m.status === "pending" && <button className="btn s" disabled={busy !== null} onClick={() => onDecide(m, "reject")}>Tolak</button>}
          {m.status === "approved" && <button className="btn s" disabled={busy !== null} onClick={() => onDecide(m, "revoke")}>Cabut akses</button>}
        </span>
      </div>
    );
  };
  return (
    <>
      <div className="kpis" style={{ gridTemplateColumns: "repeat(3,1fr)", marginBottom: 12 }}>
        <div><b>{loading ? "—" : pending.length}</b><div className="kl">Permintaan akses</div></div>
        <div><b>{loading ? "—" : active.length}</b><div className="kl">Akun aktif</div></div>
        <div><b>{loading ? "—" : rest.length}</b><div className="kl">Ditolak / dicabut</div></div>
      </div>
      <div className="panel">
        <div className="ph"><span className="lab">Persetujuan akun</span><span className="meta">Satu akun aktif per peran · berlaku langsung di aplikasi Manager</span></div>
        {loading ? <Empty>MEMUAT…</Empty> : error ? <Err message={error} onRetry={onRetry} /> : members.length === 0 ? <Empty>BELUM ADA PERMINTAAN AKSES</Empty> : <>{pending.map(row)}{active.map(row)}{rest.map(row)}</>}
      </div>
    </>
  );
}

function ReportsPanel({ reports, loading, error, busy, onReview, onRetry }: { reports: Report[]; loading: boolean; error?: string; busy: string | null; onReview: (r: Report, s: "acknowledged" | "needs_revision") => void; onRetry: () => void }) {
  const [sel, setSel] = useState<string | null>(null);
  const cur = reports.find((r) => r.id === sel) ?? null;
  const tag = (st: string) => (st === "sent" ? "" : st === "acknowledged" ? "ok" : st === "needs_revision" ? "md" : "ai");
  return (
    <div className="work rp" data-m={cur ? "main" : "list"} style={{ gridTemplateColumns: "340px minmax(0,1fr)" }}>
      <div className="panel fill">
        <div className="ph"><span className="lab">Laporan masuk</span><span className="meta">{reports.filter((r) => r.status === "sent").length} baru</span></div>
        <div className="sc" style={{ maxHeight: 620, overflowY: "auto" }}>
          {loading ? <Empty>MEMUAT…</Empty> : error ? <Err message={error} onRetry={onRetry} /> : reports.length === 0 ? <Empty>BELUM ADA LAPORAN MASUK</Empty> : reports.map((r) => (
            <div key={r.id} className={`tr ${sel === r.id ? "open" : ""} ${r.status === "sent" ? "nw" : ""}`} style={{ gridTemplateColumns: "minmax(0,1fr) auto" }} onClick={() => setSel(r.id)}>
              <div style={{ minWidth: 0 }}><div className="tt">{r.title}</div><div className="ts"><span>{r.from_name || ROLE_LABEL[r.from_role] || r.from_role}</span><span>{formatDate(r.created_at)}</span></div></div>
              <div className="tm"><span className={`tg ${tag(r.status)}`}>{STATUS_LABEL[r.status] ?? r.status}</span></div>
            </div>
          ))}
        </div>
      </div>
      <div className="panel fill" style={{ minWidth: 0 }}>
        {!cur ? <div className="empty" style={{ margin: "auto" }}>Pilih laporan di kiri.</div> : (<>
          <div className="ph"><div style={{ minWidth: 0 }}><span className="lab">{cur.title}</span><div className="meta">{cur.from_name || ROLE_LABEL[cur.from_role]} → Owner · {formatDate(cur.created_at)}</div></div><span className={`tg ${tag(cur.status)}`}>{STATUS_LABEL[cur.status] ?? cur.status}</span></div>
          <div className="sc pad">
            {Object.entries(cur.body ?? {}).map(([k, v]) => <div key={k}><label style={{ marginTop: 0 }}>{k}</label><div style={{ whiteSpace: "pre-wrap" }}>{String(v) || "—"}</div></div>)}
            {cur.review_note && <div className="box w"><b>Catatan tinjauan</b>{cur.review_note}</div>}
            {cur.status === "sent" && <div className="crow" style={{ marginTop: 12 }}>
              <button className="btn p" disabled={busy !== null} onClick={() => onReview(cur, "acknowledged")}>Terima</button>
              <button className="btn" disabled={busy !== null} onClick={() => onReview(cur, "needs_revision")}>Minta revisi</button>
            </div>}
          </div>
        </>)}
      </div>
    </div>
  );
}

type ContentRow = { slug: string; title: string; position: number; category?: string; roles: string[]; body: unknown; updated_at?: string };
const CONTENT_LABELS: Record<string, string> = { goal: "Tujuan", purpose: "Tujuan", steps: "Langkah-langkah", auto: "Yang dilakukan sistem otomatis", draft: "Perlu validasi Owner", when: "Kapan", sources: "Sumber data", issue: "Kalau bermasalah", table: "Referensi", th: "Kolom referensi", fmt: "Format", to: "Penerima", docs: "Dokumen terkait", open: "Aplikasi terkait", blocks: "Isi dokumen", example: "Contoh", fields: "Isian", tips: "Tips", mistakes: "Kesalahan umum" };
const HIDDEN = ["id", "ic", "who", "t", "cat", "ex", "ed", "fin", "noBlank"];
const editable = (v: Record<string, unknown>) => Object.entries(v).filter(([k, item]) => !HIDDEN.includes(k) && (typeof item === "string" || (Array.isArray(item) && item.every((x) => typeof x === "string"))));

function ContentSections({ call }: { call: <T,>(path: string, method?: string, body?: unknown) => Promise<T> }) {
  const [kind, setKind] = useState<"playbook" | "documents">("playbook");
  const [items, setItems] = useState<ContentRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [roles, setRoles] = useState<string[]>(["manager", "supervisor"]);
  const [body, setBody] = useState<Record<string, unknown>>({});
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (next = kind) => {
    setLoading(true); setError("");
    try {
      const data = await call<{ items: ContentRow[] }>(`/api/admin-manager/${next}`);
      setItems(data.items ?? []); setSelected((cur) => (cur && data.items?.some((i) => i.slug === cur) ? cur : data.items?.[0]?.slug ?? null)); setEditing(false);
    } catch (e) { setError(errorMessage(e)); } finally { setLoading(false); }
  }, [call, kind]);
  useEffect(() => { void load(kind); }, [kind, load]);

  const cur = items.find((i) => i.slug === selected) ?? null;
  const list = items.filter((i) => !q || `${i.title} ${i.slug}`.toLowerCase().includes(q.toLowerCase()));
  const startEdit = (row: ContentRow) => { setEditing(true); setTitle(row.title); setCategory(row.category ?? ""); setRoles(row.roles ?? ["manager", "supervisor"]); setBody((row.body && typeof row.body === "object" && !Array.isArray(row.body) ? row.body : {}) as Record<string, unknown>); };

  const save = async () => {
    if (!cur) return;
    if (!title.trim()) { toast.error("Judul wajib diisi"); return; }
    if (roles.length === 0) { toast.error("Pilih minimal satu peran penerima"); return; }
    setSaving(true);
    try {
      await call(`/api/admin-manager/${kind}/${encodeURIComponent(cur.slug)}`, "PUT", { title, body: { ...body, ...(kind === "playbook" ? { t: title } : {}) }, roles, category, position: cur.position });
      toast.success("Tersimpan · langsung terbit di aplikasi Manager"); await load();
    } catch (e) { toast.error(`Gagal: ${(e as Error).message}`); } finally { setSaving(false); }
  };

  const b = (cur?.body ?? {}) as Record<string, unknown>;
  return (
    <div className="pb">
      <div className="panel gl">
        <div className="gh">
          <div className="tabs" style={{ margin: 0 }}>
            <button className={kind === "playbook" ? "on" : ""} onClick={() => { setKind("playbook"); setSelected(null); }}>Playbook</button>
            <button className={kind === "documents" ? "on" : ""} onClick={() => { setKind("documents"); setSelected(null); }}>Dokumen</button>
          </div>
          <input type="text" className="f" placeholder="Cari…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="sc" style={{ maxHeight: 640, overflowY: "auto" }}>
          {loading ? <Empty>MEMUAT…</Empty> : error ? <Err message={error} onRetry={() => void load()} /> : list.length === 0 ? <Empty>BELUM ADA KONTEN</Empty> : list.map((row, i) => (
            <button key={row.slug} className={`chap ${row.slug === selected ? "on" : ""}`} onClick={() => { setSelected(row.slug); setEditing(false); }}>
              <div><b style={{ fontWeight: 500 }}>{kind === "playbook" ? `${i + 1}. ` : ""}{row.title}</b><small>{row.slug}{row.category ? ` · ${row.category}` : ""} · {(row.roles ?? []).map((r) => ROLE_LABEL[r] ?? r).join(", ")}</small></div>
            </button>
          ))}
        </div>
      </div>
      <div className="panel sc pad" style={{ maxHeight: 700, overflowY: "auto" }}>
        {!cur ? <Empty>PILIH KONTEN DI KIRI</Empty> : !editing ? (<>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}><span className="tg">{kind === "playbook" ? "Playbook SOP" : cur.category || "Dokumen"}</span>{(cur.roles ?? []).map((r) => <span key={r} className="tg">{ROLE_LABEL[r] ?? r}</span>)}</div>
          <div className="ph" style={{ padding: 0, border: 0 }}><h2 style={{ margin: "0 0 4px", font: "650 20px var(--sans)", letterSpacing: "-.02em" }}>{cur.title}</h2><button className="btn" onClick={() => startEdit(cur)}>Edit konten</button></div>
          {editable(b).map(([k, v]) => (
            <div key={k}><label>{CONTENT_LABELS[k] || k}</label>
              {Array.isArray(v) ? v.map((x, i) => <div key={i} className="step"><span className="tg ai" style={{ height: "fit-content" }}>{i + 1}</span><div className="tx">{x}</div></div>) : <p style={{ margin: 0 }}>{String(v)}</p>}
            </div>
          ))}
        </>) : (<>
          <div className="ph" style={{ padding: 0, border: 0, marginBottom: 8 }}><span className="lab">Mengedit {kind === "playbook" ? "bab Playbook" : "dokumen"} · {cur.slug}</span></div>
          <label style={{ marginTop: 0 }}>Judul</label><input className="f" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
          {kind === "documents" && <><label>Kategori</label><input className="f" value={category} maxLength={60} onChange={(e) => setCategory(e.target.value)} /></>}
          <label>Tampilkan kepada</label>
          <div>{["manager", "supervisor"].map((r) => <span key={r}><button className={`chipb ${roles.includes(r) ? "on" : ""}`} onClick={() => setRoles((v) => (v.includes(r) ? v.filter((x) => x !== r) : [...v, r]))}>{ROLE_LABEL[r]}</button> </span>)}</div>
          {editable(body).map(([k, v]) => (
            <div key={k}><label>{CONTENT_LABELS[k] || k}{Array.isArray(v) ? " · satu butir per baris" : ""}</label>
              <textarea rows={Array.isArray(v) ? 6 : 3} value={Array.isArray(v) ? v.join("\n") : String(v)} onChange={(e) => setBody({ ...body, [k]: Array.isArray(v) ? e.target.value.split("\n") : e.target.value })} /></div>
          ))}
          <div className="crow" style={{ marginTop: 14 }}><button className="btn r" disabled={saving} onClick={() => void save()}>{saving ? "Menyimpan…" : "Simpan & terbitkan"}</button><button className="btn" disabled={saving} onClick={() => setEditing(false)}>Batal</button></div>
        </>)}
      </div>
    </div>
  );
}

type SettingRow = { key: string; value: Record<string, unknown> };
type Field = { k: string; label: string; type: "number" | "text" | "bool" };
const POLICY: { key: string; label: string; hint: string; fields: Field[] }[] = [
  { key: "ai_config", label: "Pengaturan AI", hint: "Model dan jadwal tugas harian dari data nyata", fields: [{ k: "enabled", label: "AI aktif", type: "bool" }, { k: "model", label: "Model utama", type: "text" }, { k: "fallbackModel", label: "Model cadangan", type: "text" }, { k: "planHourWib", label: "Jam rencana harian (WIB)", type: "number" }] },
  { key: "expense_policy", label: "Kebijakan pengeluaran", hint: "Berlaku di aplikasi dan bot Telegram", fields: [{ k: "approvalAbove", label: "Persetujuan Manager di atas (Rp)", type: "number" }, { k: "photoMin", label: "Wajib foto bukti di atas (Rp)", type: "number" }] },
  { key: "payroll_policy", label: "Kebijakan gaji", hint: "Batas penyesuaian oleh Manager", fields: [{ k: "adjustmentLimit", label: "Batas penyesuaian Manager (Rp)", type: "number" }] },
];

function PolicySection({ call }: { call: <T,>(path: string, method?: string, body?: unknown) => Promise<T> }) {
  const [settings, setSettings] = useState<SettingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setSettings((await call<{ settings: SettingRow[] }>("/api/admin-manager/overview")).settings ?? []); }
    catch (e) { setError(errorMessage(e)); } finally { setLoading(false); }
  }, [call]);
  useEffect(() => { void load(); }, [load]);
  const save = async (key: string, value: Record<string, unknown>) => {
    try { await call(`/api/admin-manager/settings/${key}`, "PUT", { value }); toast.success("Tersimpan · langsung berlaku"); await load(); }
    catch (e) { toast.error(`Gagal: ${(e as Error).message}`); }
  };
  if (loading) return <div className="panel"><Empty>MEMUAT…</Empty></div>;
  if (error) return <div className="panel"><Err message={error} onRetry={() => void load()} /></div>;
  return (
    <div className="row2" style={{ alignItems: "start" }}>
      {POLICY.map((p) => <PolicyEditor key={p.key} def={p} value={settings.find((x) => x.key === p.key)?.value ?? EMPTY_POLICY_VALUE} onSave={save} />)}
    </div>
  );
}

function PolicyEditor({ def, value, onSave }: { def: (typeof POLICY)[number]; value: Record<string, unknown>; onSave: (key: string, value: Record<string, unknown>) => Promise<void> }) {
  const [local, setLocal] = useState<Record<string, unknown>>(value);
  const [saving, setSaving] = useState(false);
  useEffect(() => setLocal(value), [value]);
  const bad = def.fields.some((f) => f.type === "number" && local[f.k] !== undefined && local[f.k] !== "" && (!Number.isFinite(Number(local[f.k])) || Number(local[f.k]) < 0));
  const submit = async () => {
    setSaving(true);
    try { await onSave(def.key, { ...value, ...Object.fromEntries(def.fields.filter((f) => local[f.k] !== undefined && local[f.k] !== "").map((f) => [f.k, f.type === "number" ? Number(local[f.k]) : f.type === "bool" ? Boolean(local[f.k]) : String(local[f.k])])) }); }
    finally { setSaving(false); }
  };
  return (
    <div className="panel">
      <div className="ph"><span className="lab">{def.label}</span><span className="meta">{def.hint}</span></div>
      <div className="pad" style={{ paddingTop: 4 }}>
        {def.fields.map((f) => f.type === "bool" ? (
          <div key={f.k} className="mr" style={{ padding: "9px 0" }}><span>{f.label}</span>
            <button className={`chipb ${local[f.k] === false ? "" : "on"}`} onClick={() => setLocal({ ...local, [f.k]: local[f.k] === false })}>{local[f.k] === false ? "Mati" : "Aktif"}</button></div>
        ) : (
          <div key={f.k}><label>{f.label}</label><input className="f" type={f.type === "number" ? "number" : "text"} min={f.type === "number" ? 0 : undefined} value={local[f.k] === undefined ? "" : String(local[f.k])} onChange={(e) => setLocal({ ...local, [f.k]: e.target.value })} /></div>
        ))}
        <button className="btn r" style={{ marginTop: 14 }} disabled={saving || bad} onClick={() => void submit()}>{saving ? "Menyimpan…" : "Simpan"}</button>
      </div>
    </div>
  );
}


type LogRow = { id: number; at: string; actor_name: string | null; source_app: string; what: string; from_value: string | null; to_value: string | null };
const OP_DEFAULTS: Record<string, unknown> = { blind: true, cycle: true, perDay: 12, tolDefault: 2, tolImportant: 1, tolAction: "review", recount: true, recountAbove: 3, photoAbove: 100000, finalJournal: false, clockoutBar: true, clockoutDapur: true, schedBar: "Harian", schedDapur: "Rabu", schedGudang: "Bulanan", mgrNeedsOwner: false, lockHigh: true };
const SCHED = ["Harian", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Mingguan", "Bulanan", "Tidak ada"];

function OpnamePanel({ call }: { call: <T,>(path: string, method?: string, body?: unknown) => Promise<T> }) {
  const [pol, setPol] = useState<Record<string, unknown> | null>(null);
  const [log, setLog] = useState<LogRow[]>([]);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const load = useCallback(async () => {
    try {
      const [o, l] = await Promise.all([call<{ settings: SettingRow[] }>("/api/admin-manager/overview"), call<{ log: LogRow[] }>("/api/admin-manager/stock-log")]);
      setPol({ ...OP_DEFAULTS, ...(o.settings.find((x) => x.key === "opname_policy")?.value ?? {}) }); setLog(l.log); setError("");
    } catch (e) { setError(errorMessage(e)); }
  }, [call]);
  useEffect(() => { void load(); }, [load]);
  const set = async (patch: Record<string, unknown>) => {
    if (!pol) return;
    const next = { ...pol, ...patch };
    setPol(next);
    try { await call("/api/admin-manager/settings/opname_policy", "PUT", { value: next }); setSaved(`Tersimpan · ${new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })} · Aplikasi Manager ikut diperbarui`); const l = await call<{ log: LogRow[] }>("/api/admin-manager/stock-log"); setLog(l.log); }
    catch (e) { toast.error(`Gagal: ${(e as Error).message}`); void load(); }
  };
  if (error) return <div className="panel"><Err message={error} onRetry={() => void load()} /></div>;
  if (!pol) return <div className="panel"><Empty>MEMUAT…</Empty></div>;
  const chip = (k: string, label: string) => <button className={`chipb ${pol[k] ? "on" : ""}`} onClick={() => set({ [k]: !pol[k] })}>{pol[k] ? "✓ " : ""}{label}</button>;
  const num = (k: string, w = 64) => <input type="text" inputMode="decimal" className="f opn" style={{ width: w }} defaultValue={String(pol[k] ?? "")} key={k + String(pol[k])} onBlur={(e) => { const n = Number(e.target.value.replace(",", ".")); if (Number.isFinite(n) && n >= 0 && n !== pol[k]) void set({ [k]: n }); else e.target.value = String(pol[k] ?? ""); }} />;
  const tog = (k: string, label: string, hint?: string) => <div className="mr" style={{ padding: "9px 0" }}><span><b style={{ fontWeight: 550 }}>{label}</b>{hint && <><br /><span className="meta">{hint}</span></>}</span><button className={`cb ${pol[k] ? "on" : ""}`} onClick={() => set({ [k]: !pol[k] })}>{pol[k] ? "✓" : ""}</button></div>;
  const sel = (k: string, label: string) => <div><label style={{ marginTop: 0 }}>{label}</label><select className="f" value={String(pol[k])} onChange={(e) => void set({ [k]: e.target.value })}>{SCHED.map((x) => <option key={x}>{x}</option>)}</select></div>;
  return (
    <div className="fin">
      <div className="fh"><div className="meta">Aturan opname dan kunci pengisian. Perubahan langsung berlaku di aplikasi Manager, Supervisor, dan Karyawan.</div><span className="xlink flash"><i className="dotc ok" />{saved || "Sinkron dengan Aplikasi Manager"}</span></div>
      <div className="panel pad opstrip">
        <span className="lab n" style={{ marginRight: 4 }}>Aturan opname</span>
        {chip("blind", "Hitung tanpa lihat stok")}{chip("cycle", "Opname bertahap")}{pol.cycle ? <span className="opi">{num("perDay")}<span className="meta">bahan / hari</span></span> : null}
        <span className="opi"><span className="meta">Selisih wajar: bahan biasa</span>{num("tolDefault")}<span className="meta">%  penting ★</span>{num("tolImportant")}<span className="meta">%</span></span>
        <span className="opi"><span className="meta">Bila melebihi</span><select className="sel" value={String(pol.tolAction)} onChange={(e) => void set({ tolAction: e.target.value })}><option value="review">Perlu ditinjau</option><option value="auto">Koreksi otomatis</option></select></span>
        {chip("finalJournal", "Jurnal otomatis saat selesai")}
      </div>
      <div className="panel pad"><div className="row2" style={{ alignItems: "start" }}>
        <div>{tog("recount", "Hitung ulang oleh orang lain bila selisih besar")}
          <div className="row2"><div><label style={{ marginTop: 0 }}>Hitung ulang bila selisih lebih dari (%)</label>{num("recountAbove", 120)}</div><div><label style={{ marginTop: 0 }}>Foto wajib bila nilai selisih (Rp)</label>{num("photoAbove", 120)}</div></div>
          {tog("clockoutBar", "Opname Bar wajib saat clock-out")}{tog("clockoutDapur", "Opname Dapur wajib saat clock-out")}</div>
        <div><div className="row2">{sel("schedBar", "Jadwal Bar")}{sel("schedDapur", "Jadwal Dapur")}{sel("schedGudang", "Jadwal Gudang")}</div>
          <div style={{ marginTop: 8 }}>{tog("mgrNeedsOwner", "Aturan yang diubah Manager perlu persetujuan Owner")}{tog("lockHigh", "Kunci isi kemasan bahan penting (★) untuk Supervisor")}</div></div>
      </div></div>
      <div className="panel"><div className="ph"><span className="lab">Riwayat perubahan</span><span className="meta">Aplikasi Manager ⇄ Admin</span></div>
        <div className="tw2"><table><thead><tr><th>Waktu</th><th>Oleh</th><th>Dari</th><th>Perubahan</th><th>Sebelum → sesudah</th></tr></thead>
          <tbody>{log.map((l) => <tr key={l.id}><td className="mono">{formatDate(l.at)}</td><td>{l.actor_name ?? "—"}</td><td><span className={`tg ${l.source_app === "Admin" ? "o" : ""}`}>{l.source_app}</span></td><td>{l.what}</td><td className="mono">{l.from_value} → {l.to_value}</td></tr>)}</tbody></table>
          {log.length === 0 && <Empty>BELUM ADA PERUBAHAN</Empty>}</div></div>
      <div className="meta">Isi kemasan per bahan dan bahan penting ★ dikelola Manager/Supervisor di aplikasi Manager (tabel Stok &amp; Opname), dan tersimpan di Inventaris Admin.</div>
    </div>
  );
}

const FMT_DEFAULTS: Record<string, unknown> = { header: "💸 Pengeluaran Tercatat!", footer: "", showNo: true, showPay: true, showIcons: true, showConf: false };

function FormatPanel({ call }: { call: <T,>(path: string, method?: string, body?: unknown) => Promise<T> }) {
  const [fmt, setFmt] = useState<Record<string, unknown> | null>(null);
  const [orig, setOrig] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try { const o = await call<{ settings: SettingRow[] }>("/api/admin-manager/overview"); const v = { ...FMT_DEFAULTS, ...(o.settings.find((x) => x.key === "expense_format")?.value ?? {}) }; setFmt(v); setOrig(JSON.stringify(v)); setError(""); }
    catch (e) { setError(errorMessage(e)); }
  }, [call]);
  useEffect(() => { void load(); }, [load]);
  if (error) return <div className="panel"><Err message={error} onRetry={() => void load()} /></div>;
  if (!fmt) return <div className="panel"><Empty>MEMUAT…</Empty></div>;
  const changed = JSON.stringify(fmt) !== orig;
  const tog = (k: string, label: string, hint: string) => <div className="mr" style={{ padding: "9px 0" }}><span><b style={{ fontWeight: 550 }}>{label}</b><br /><span className="meta">{hint}</span></span><button className={`cb ${fmt[k] ? "on" : ""}`} onClick={() => setFmt({ ...fmt, [k]: !fmt[k] })}>{fmt[k] ? "✓" : ""}</button></div>;
  const publish = async () => {
    setSaving(true);
    try { await call("/api/admin-manager/settings/expense_format", "PUT", { value: fmt }); setOrig(JSON.stringify(fmt)); toast.success("Diterbitkan · aplikasi Manager dan bot Telegram memakai format ini"); }
    catch (e) { toast.error(`Gagal: ${(e as Error).message}`); } finally { setSaving(false); }
  };
  const lines = [String(fmt.header || ""), "", "🏪 UD Segar Jaya", "💰 Total: Rp432.000", ...(fmt.showPay ? ["💳 Tunai"] : []), "", `${fmt.showNo ? "1." : "•"} ${fmt.showIcons ? "☕ " : ""}Susu UHT — 2 karton · Rp432.000`, ...(fmt.footer ? ["", String(fmt.footer)] : [])];
  return (
    <div className="work" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1.1fr)" }}>
      <div className="col"><div className="panel">
        <div className="ph"><span className="lab">Format & sinkron bot</span><span className="meta">satu templat untuk aplikasi dan Telegram</span></div>
        <div className="pad">
          <label style={{ marginTop: 0 }}>Judul pesan</label><input className="f" value={String(fmt.header ?? "")} onChange={(e) => setFmt({ ...fmt, header: e.target.value })} />
          <label>Catatan kaki</label><input className="f" value={String(fmt.footer ?? "")} onChange={(e) => setFmt({ ...fmt, footer: e.target.value })} />
          {tog("showNo", "Nomor item", "1. 2. 3. di daftar item")}{tog("showPay", "Metode pembayaran", "Tampilkan Tunai / QRIS / Transfer")}{tog("showIcons", "Ikon kategori", "Emoji kategori di tiap item")}{tog("showConf", "Tingkat keyakinan AI", "Tampilkan bila bot kurang yakin")}
          <div className="crow" style={{ marginTop: 14 }}><button className="btn r" disabled={!changed || saving} onClick={() => void publish()}>{saving ? "Menerbitkan…" : changed ? "Terbitkan perubahan" : "Sudah terbit"}</button>{changed && <button className="btn" onClick={() => setFmt(JSON.parse(orig))}>Batalkan</button>}</div>
        </div>
      </div></div>
      <div className="col"><div className="tgp">
        <div className="tgh"><div className="tgav">Y</div><div><b>Yumi Finance</b><small>pratinjau pesan di Telegram</small></div></div>
        <div className="tgc"><div className="tgbub">{lines.join("\n")}</div></div>
      </div></div>
    </div>
  );
}
