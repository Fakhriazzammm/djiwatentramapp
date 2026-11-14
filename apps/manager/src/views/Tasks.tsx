import { useCallback, useEffect, useState } from "react";
import { Check, Link2, Plus, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { api, type Attachment, type Role, type Task } from "../lib/api";

const SOURCE: Record<string, string> = { ai: "AI", owner: "Owner", manager: "Manager", supervisor: "Supervisor", self: "Sendiri" };
const KIND: Record<string, string> = { general: "Umum", purchasing: "Belanja", ops: "Operasional", people: "Tim", finance: "Keuangan" };

export function TasksView({ role }: { role: Role }) {
  const [tab, setTab] = useState<"open" | "done">("open");
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try {
      setTasks((await api<{ tasks: Task[] }>(`/api/manager/tasks?status=${tab}`)).tasks);
    } catch {
      toast.error("Tugas belum bisa dimuat");
      setTasks([]);
    }
  }, [tab]);
  useEffect(() => { setTasks(null); void load(); }, [load]);
  // Keep the list fresh: AI/Owner/Manager can add tasks at any time.
  useEffect(() => {
    const id = setInterval(() => { if (document.visibilityState === "visible") void load(); }, 30_000);
    return () => clearInterval(id);
  }, [load]);

  const toggle = async (t: Task) => {
    try {
      await api(`/api/manager/tasks/${t.id}`, { method: "PATCH", body: { status: t.status === "done" ? "open" : "done" } });
      void load();
    } catch { toast.error("Status belum tersimpan"); }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {(["open", "done"] as const).map((s) => (
            <button key={s} onClick={() => setTab(s)} className={`btn ${tab === s ? "btn-dark" : ""}`}>{s === "open" ? "Aktif" : "Selesai"}</button>
          ))}
        </div>
        <button className="btn btn-dark" onClick={() => setAdding((v) => !v)}><Plus size={15} />Tugas</button>
      </div>
      {adding && <NewTask role={role} onDone={() => { setAdding(false); void load(); }} />}
      {tasks === null && <div className="label">Memuat…</div>}
      {tasks?.length === 0 && <div className="panel p-6 text-center text-sm text-mute">{tab === "open" ? "Tidak ada tugas aktif." : "Belum ada tugas selesai."}</div>}
      <ul className="space-y-2">
        {tasks?.map((t) => (
          <li key={t.id} className="panel flex items-start gap-3 p-3">
            <button onClick={() => toggle(t)} aria-label={t.status === "done" ? "Buka lagi" : "Selesai"} className="btn mt-0.5 !min-h-8 !px-2">{t.status === "done" ? <Undo2 size={14} /> : <Check size={14} />}</button>
            <div className="min-w-0 flex-1">
              <div className={`text-sm font-semibold ${t.status === "done" ? "text-mute line-through" : ""}`}>{t.title}</div>
              {t.detail && <p className="mt-0.5 text-[13px] text-mute">{t.detail}</p>}
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="label">{SOURCE[t.source] ?? t.source}</span>
                <span className="label">{KIND[t.kind] ?? t.kind}</span>
                {t.priority === "high" && <span className="label !text-brand">Penting</span>}
                {t.due_at && <span className="label">{new Date(t.due_at).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Jakarta" })}</span>}
                {t.source_ref && <span className="label">dasar: {t.source_ref}</span>}
              </div>
              {t.attachments?.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {t.attachments.map((a) => (
                    <a key={a.url} href={a.url} target="_blank" rel="noopener noreferrer" className="btn !min-h-7 !px-2 text-xs"><Link2 size={12} />{a.name}</a>
                  ))}
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function NewTask({ role, onDone }: { role: Role; onDone: () => void }) {
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [kind, setKind] = useState("general");
  const [priority, setPriority] = useState("normal");
  const [assignee, setAssignee] = useState<Role>(role);
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!title.trim()) return;
    setBusy(true);
    const attachments: Attachment[] = link.trim() ? [{ type: "link", name: link.trim(), url: link.trim() }] : [];
    try {
      await api("/api/manager/tasks", { method: "POST", body: { title, detail, kind, priority, assigneeRole: assignee, attachments } });
      toast.success(assignee === role ? "Tugas dibuat" : "Tugas dikirim ke Supervisor");
      onDone();
    } catch { toast.error("Tugas belum tersimpan (cek tautan https://)"); } finally { setBusy(false); }
  };

  return (
    <div className="panel space-y-2 p-3">
      <input className="input" placeholder="Judul tugas" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
      <textarea className="input" rows={2} placeholder="Detail (opsional)" value={detail} onChange={(e) => setDetail(e.target.value)} />
      <input className="input" placeholder="Tautan (https://…) — opsional" value={link} onChange={(e) => setLink(e.target.value)} />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <select className="input" value={kind} onChange={(e) => setKind(e.target.value)}>{Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <select className="input" value={priority} onChange={(e) => setPriority(e.target.value)}><option value="low">Rendah</option><option value="normal">Normal</option><option value="high">Penting</option></select>
        {role === "manager" && (
          <select className="input col-span-2 sm:col-span-1" value={assignee} onChange={(e) => setAssignee(e.target.value as Role)}>
            <option value="manager">Untuk saya</option><option value="supervisor">Untuk Supervisor</option>
          </select>
        )}
      </div>
      <button className="btn btn-dark w-full" disabled={busy || !title.trim()} onClick={submit}>Simpan</button>
    </div>
  );
}
