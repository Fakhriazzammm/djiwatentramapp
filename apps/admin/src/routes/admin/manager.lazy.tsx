import { createLazyFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useYumiAuth } from "@/hooks/useYumiAuth";
import { isAdminLevelRole } from "@/lib/admin-access";

export const Route = createLazyFileRoute("/admin/manager")({ component: AdminManager });

const API = String(import.meta.env.VITE_AUTH_URL ?? "https://api.djiwatentram.web.id").replace(/\/$/, "");
type Membership = { user_id: string; email: string | null; display_name: string | null; requested_role: "manager" | "supervisor"; role: string | null; status: string; requested_at: string };
type Report = { id: string; title: string; kind: string; body: Record<string, string>; from_name: string | null; from_role: string; status: string; review_note: string | null; created_at: string };
const ROLE_LABEL: Record<string, string> = { manager: "Manager", supervisor: "Supervisor / Purchasing" };
const STATUS_LABEL: Record<string, string> = { pending: "Menunggu", approved: "Aktif", rejected: "Ditolak", revoked: "Dicabut", sent: "Terkirim", read: "Dibaca", needs_revision: "Perlu revisi", acknowledged: "Diterima" };

function AdminManager() {
  const { token, isAdmin, role } = useYumiAuth();
  const allowed = Boolean(token && (isAdmin || isAdminLevelRole(role?.name)));
  const [members, setMembers] = useState<Membership[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [busy, setBusy] = useState(false);
  const [task, setTask] = useState({ title: "", detail: "", assigneeRole: "manager", kind: "general", priority: "normal" });

  const call = useCallback(async <T,>(path: string, method = "GET", body?: unknown): Promise<T> => {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
    return data as T;
  }, [token]);

  const load = useCallback(async () => {
    if (!allowed) return;
    try {
      const [m, r] = await Promise.all([
        call<{ memberships: Membership[] }>("/api/admin-manager/memberships"),
        call<{ reports: Report[] }>("/api/admin-manager/reports"),
      ]);
      setMembers(m.memberships);
      setReports(r.reports);
    } catch (e) { toast.error(`Gagal memuat: ${(e as Error).message}`); }
  }, [allowed, call]);
  useEffect(() => { void load(); }, [load]);

  if (!allowed) return <div className="p-6 text-sm text-muted-foreground">Halaman ini khusus Owner/Admin.</div>;

  const decide = async (m: Membership, decision: "approve" | "reject" | "revoke") => {
    setBusy(true);
    try {
      await call(`/api/admin-manager/memberships/${encodeURIComponent(m.user_id)}/decision`, "POST", { decision, role: m.requested_role });
      toast.success("Tersimpan");
      await load();
    } catch (e) { toast.error((e as Error).message === "ROLE_TAKEN" ? "Peran itu sudah dipegang akun lain. Cabut dulu akun lama." : `Gagal: ${(e as Error).message}`); }
    finally { setBusy(false); }
  };

  const sendTask = async () => {
    if (!task.title.trim()) return;
    setBusy(true);
    try { await call("/api/admin-manager/tasks", "POST", task); toast.success("Tugas terkirim"); setTask({ ...task, title: "", detail: "" }); }
    catch (e) { toast.error(`Gagal: ${(e as Error).message}`); }
    finally { setBusy(false); }
  };

  const review = async (r: Report, status: string) => {
    try { await call(`/api/admin-manager/reports/${r.id}`, "PATCH", { status }); await load(); }
    catch (e) { toast.error(`Gagal: ${(e as Error).message}`); }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4">
      <section>
        <h2 className="mb-2 text-base font-semibold">Akses Manager & Supervisor</h2>
        <div className="divide-y rounded-lg border">
          {members.length === 0 && <div className="p-4 text-sm text-muted-foreground">Belum ada permintaan akses.</div>}
          {members.map((m) => (
            <div key={m.user_id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
              <div>
                <div className="font-medium">{m.display_name ?? m.email}</div>
                <div className="text-xs text-muted-foreground">{m.email} · minta {ROLE_LABEL[m.requested_role]} · {STATUS_LABEL[m.status] ?? m.status}</div>
              </div>
              <div className="flex gap-2">
                {m.status !== "approved" && <Button size="sm" disabled={busy} onClick={() => decide(m, "approve")}>Setujui</Button>}
                {m.status === "pending" && <Button size="sm" variant="outline" disabled={busy} onClick={() => decide(m, "reject")}>Tolak</Button>}
                {m.status === "approved" && <Button size="sm" variant="outline" disabled={busy} onClick={() => decide(m, "revoke")}>Cabut</Button>}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-base font-semibold">Beri tugas</h2>
        <div className="space-y-2 rounded-lg border p-3">
          <Input placeholder="Judul tugas" value={task.title} onChange={(e) => setTask({ ...task, title: e.target.value })} />
          <Textarea rows={2} placeholder="Detail (opsional)" value={task.detail} onChange={(e) => setTask({ ...task, detail: e.target.value })} />
          <div className="flex flex-wrap gap-2">
            <select className="h-9 rounded-md border bg-background px-2 text-sm" value={task.assigneeRole} onChange={(e) => setTask({ ...task, assigneeRole: e.target.value })}>
              <option value="manager">Manager</option><option value="supervisor">Supervisor / Purchasing</option>
            </select>
            <select className="h-9 rounded-md border bg-background px-2 text-sm" value={task.kind} onChange={(e) => setTask({ ...task, kind: e.target.value })}>
              <option value="general">Umum</option><option value="purchasing">Belanja</option><option value="ops">Operasional</option><option value="people">Tim</option><option value="finance">Keuangan</option>
            </select>
            <select className="h-9 rounded-md border bg-background px-2 text-sm" value={task.priority} onChange={(e) => setTask({ ...task, priority: e.target.value })}>
              <option value="low">Rendah</option><option value="normal">Normal</option><option value="high">Penting</option>
            </select>
            <Button size="sm" disabled={busy || !task.title.trim()} onClick={sendTask}>Kirim</Button>
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-base font-semibold">Laporan masuk dari Manager/Supervisor</h2>
        <div className="space-y-2">
          {reports.length === 0 && <div className="rounded-lg border p-4 text-sm text-muted-foreground">Belum ada laporan.</div>}
          {reports.map((r) => (
            <div key={r.id} className="rounded-lg border p-3 text-sm">
              <div className="flex items-start justify-between gap-2"><b>{r.title}</b><span className="text-xs text-muted-foreground">{STATUS_LABEL[r.status] ?? r.status}</span></div>
              <div className="text-xs text-muted-foreground">{r.from_name ?? r.from_role} · {new Date(r.created_at).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Jakarta" })}</div>
              <dl className="mt-2 space-y-1">{Object.entries(r.body).map(([k, v]) => <div key={k}><dt className="text-xs text-muted-foreground">{k}</dt><dd className="whitespace-pre-wrap">{String(v)}</dd></div>)}</dl>
              {r.status === "sent" && (
                <div className="mt-2 flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => review(r, "acknowledged")}>Terima</Button>
                  <Button size="sm" variant="outline" onClick={() => review(r, "needs_revision")}>Minta revisi</Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      <ContentSections call={call} />
      <PolicySection call={call} />
    </div>
  );
}

type ContentRow = {
  slug: string; title: string; position: number; category?: string; roles: string[]; body: unknown; updated_at?: string;
};

function ContentSections({ call }: { call: <T,>(path: string, method?: string, body?: unknown) => Promise<T> }) {
  const [kind, setKind] = useState<"playbook" | "documents">("playbook");
  const [items, setItems] = useState<ContentRow[]>([]);
  const [draft, setDraft] = useState<ContentRow | null>(null);
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [roles, setRoles] = useState<string[]>(["manager", "supervisor"]);

  const load = useCallback(async (next = kind) => {
    try {
      const data = await call<{ items: ContentRow[] }>(`/api/admin-manager/${next}`);
      setItems(data.items);
      setDraft(null);
    } catch (e) { toast.error(`Gagal memuat: ${(e as Error).message}`); }
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
    let body: unknown;
    try { body = JSON.parse(text); }
    catch { toast.error("Isi JSON belum valid"); return; }
    try {
      await call(`/api/admin-manager/${kind}/${encodeURIComponent(draft.slug)}`, "PUT", { title, body, roles, category, position: draft.position });
      toast.success("Tersimpan");
      await load();
    } catch (e) { toast.error(`Gagal: ${(e as Error).message}`); }
  };

  return (
    <section>
      <h2 className="mb-2 text-base font-semibold">Playbook &amp; dokumen Manager</h2>
      <div className="mb-2 flex gap-2">
        <Button size="sm" variant={kind === "playbook" ? "default" : "outline"} onClick={() => setKind("playbook")}>Playbook</Button>
        <Button size="sm" variant={kind === "documents" ? "default" : "outline"} onClick={() => setKind("documents")}>Dokumen</Button>
      </div>
      <div className="space-y-2">
        {items.map((row) => (
          <div key={row.slug} className="flex items-center justify-between gap-2 rounded-lg border p-3 text-sm">
            <div className="min-w-0">
              <div className="truncate font-medium">{row.title}</div>
              <div className="text-xs text-muted-foreground">{row.slug}{row.category ? ` · ${row.category}` : ""} · {row.roles.join(", ")}</div>
            </div>
            <Button size="sm" variant="outline" onClick={() => edit(row)}>Edit</Button>
          </div>
        ))}
        {items.length === 0 && <div className="rounded-lg border p-4 text-sm text-muted-foreground">Belum ada isi.</div>}
      </div>
      {draft && (
        <div className="mt-3 space-y-2 rounded-lg border p-3">
          <div className="text-sm font-semibold">{draft.slug}</div>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Judul" />
          {kind === "documents" && <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Kategori dokumen" />}
          <div className="flex gap-3 text-sm">
            {["manager", "supervisor"].map((r) => (
              <label key={r} className="flex items-center gap-1.5">
                <input type="checkbox" checked={roles.includes(r)} onChange={(e) => setRoles(e.target.checked ? [...roles, r] : roles.filter((x) => x !== r))} />
                {ROLE_LABEL[r]}
              </label>
            ))}
          </div>
          <Textarea rows={12} className="font-mono text-xs" value={text} onChange={(e) => setText(e.target.value)} />
          <div className="flex gap-2">
            <Button size="sm" onClick={save}>Simpan</Button>
            <Button size="sm" variant="outline" onClick={() => setDraft(null)}>Batal</Button>
          </div>
        </div>
      )}
    </section>
  );
}

type SettingRow = { key: string; value: Record<string, unknown> };
const POLICY: { key: string; label: string; fields: [string, string][] }[] = [
  { key: "expense_policy", label: "Kebijakan pengeluaran", fields: [["approvalAbove", "Persetujuan Manager di atas (Rp)"], ["photoMin", "Wajib foto bukti di atas (Rp)"]] },
  { key: "opname_policy", label: "Kebijakan opname", fields: [["tolDefault", "Toleransi selisih (%)"], ["tolImportant", "Toleransi bahan penting (%)"]] },
  { key: "payroll_policy", label: "Kebijakan gaji", fields: [["adjustmentLimit", "Batas penyesuaian Manager (Rp)"]] },
];

function PolicySection({ call }: { call: <T,>(path: string, method?: string, body?: unknown) => Promise<T> }) {
  const [settings, setSettings] = useState<SettingRow[]>([]);
  const load = useCallback(async () => {
    try {
      const data = await call<{ settings: SettingRow[] }>("/api/admin-manager/overview");
      setSettings(data.settings ?? []);
    } catch (e) { toast.error(`Gagal memuat: ${(e as Error).message}`); }
  }, [call]);
  useEffect(() => { void load(); }, [load]);

  const save = async (key: string, value: Record<string, unknown>) => {
    try { await call(`/api/admin-manager/settings/${key}`, "PUT", { value }); toast.success("Tersimpan"); await load(); }
    catch (e) { toast.error(`Gagal: ${(e as Error).message}`); }
  };

  return (
    <section>
      <h2 className="mb-2 text-base font-semibold">Kebijakan Manager</h2>
      <div className="space-y-2">
        {POLICY.map((p) => {
          const row = settings.find((s) => s.key === p.key);
          return <PolicyEditor key={p.key} label={p.label} fieldKey={p.key} fields={p.fields} value={row?.value ?? {}} onSave={save} />;
        })}
      </div>
    </section>
  );
}

function PolicyEditor({ label, fieldKey, fields, value, onSave }: { label: string; fieldKey: string; fields: [string, string][]; value: Record<string, unknown>; onSave: (key: string, value: Record<string, unknown>) => void }) {
  const [local, setLocal] = useState<Record<string, string>>(() => Object.fromEntries(fields.map(([k]) => [k, value[k] === undefined ? "" : String(value[k])])));
  return (
    <div className="rounded-lg border p-3 text-sm">
      <div className="mb-2 font-medium">{label}</div>
      <div className="grid gap-2 sm:grid-cols-2">
        {fields.map(([k, lbl]) => (
          <label key={k} className="space-y-1">
            <span className="text-xs text-muted-foreground">{lbl}</span>
            <Input type="number" value={local[k] ?? ""} onChange={(e) => setLocal({ ...local, [k]: e.target.value })} />
          </label>
        ))}
      </div>
      <Button size="sm" className="mt-2" onClick={() => onSave(fieldKey, { ...value, ...Object.fromEntries(Object.entries(local).filter(([, v]) => v !== "").map(([k, v]) => [k, Number(v)])) })}>Simpan</Button>
    </div>
  );
}

