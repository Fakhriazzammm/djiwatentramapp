import { createPortal } from "react-dom";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { adminProtectedRpc } from "@/lib/admin-protected-read";
import { requestAdminPrompt } from "@/lib/admin-dialogs";
import type { FeedEvent } from "@/lib/dashboard-analytics";
import { describeEvent } from "../-dashboard/OpsSection";
import { formatAgo } from "../-dashboard/ui";


const ICONS: Record<string, string> = {
  send: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
  clip: '<path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  img: '<rect x="3" y="3" width="18" height="18"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
  vid: '<path d="m22 8-6 4 6 4V8z"/><rect x="2" y="6" width="14" height="12"/>',
};
function Ic({ n }: { n: string }) {
  return <svg className="ic" viewBox="0 0 24 24" dangerouslySetInnerHTML={{ __html: ICONS[n] ?? "" }} />;
}
type Call = <T>(path: string, method?: string, body?: unknown) => Promise<T>;
type Attachment = { type: string; url: string; name: string };
type Task = {
  id: string;
  title: string;
  detail: string | null;
  source: string;
  assignee_role: string;
  priority: string;
  kind: string;
  status: string;
  due_at: string | null;
  done_at: string | null;
  created_at: string;
  attachments: Attachment[];
  comment_count: number;
};
const money = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);
const sourceLabel = (s: string) =>
  s === "ai"
    ? "✦ AI"
    : s === "owner"
      ? "Dari Owner"
      : s === "manager"
        ? "Dari Manager"
        : "Supervisor";
const roleLabel = (s: string) => (s === "manager" ? "Manager" : "Supervisor");
const dueLabel = (s: string | null) =>
  s
    ? new Intl.DateTimeFormat("id-ID", {
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Jakarta",
      }).format(new Date(s))
    : "Tanpa tenggat";
export function ManagerWorkspace({ call }: { call: Call }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [error, setError] = useState("");
  const [feedError, setFeedError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [updated, setUpdated] = useState<number | null>(null);
  const [filter, setFilter] = useState("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [roles, setRoles] = useState(["manager"]);
  const [kind, setKind] = useState("general");
  const [priority, setPriority] = useState("normal");
  const [due, setDue] = useState("today");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const load = useCallback(async () => {
    await Promise.all([
      call<{ tasks: Task[] }>("/api/admin-manager/tasks")
        .then((r) => {
          setTasks(r.tasks);
          setError("");
          setUpdated(Date.now());
        })
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false)),
      adminProtectedRpc<FeedEvent[]>("activity_feed", { p_limit: 30 })
        .then((r) => {
          setEvents(r);
          setFeedError("");
        })
        .catch((e) => setFeedError(e.message)),
    ]);
  }, [call]);
  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, 30000);
    const clock = setInterval(() => setNow(Date.now()), 10000);
    return () => {
      clearInterval(timer);
      clearInterval(clock);
    };
  }, [load]);
  const open = tasks.filter((t) => t.status === "open");
  const done = tasks.filter((t) => t.status === "done");
  const late = (t: Task) =>
    t.status === "open" && t.due_at && Date.parse(t.due_at) < now;
  const todayWib = (s: string) =>
    new Date(s).toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
  const counts = [
    open.length,
    done.filter(
      (t) =>
        t.done_at &&
        todayWib(t.done_at) === todayWib(new Date(now).toISOString()),
    ).length,
    tasks.filter(late).length,
    tasks.filter((t) => t.source === "ai").length,
    tasks.filter((t) => t.source === "owner").length,
  ];
  const visible = tasks.filter((t) =>
    filter === "done"
      ? t.status === "done"
      : t.status === "open" && (filter === "all" || t.source === filter),
  );
  const send = async () => {
    if (!title.trim() || saving) return;
    const mentions = [...title.matchAll(/@(manager|supervisor|spv)\b/gi)].map(
      (m) => (m[1].toLowerCase() === "manager" ? "manager" : "supervisor"),
    );
    const targets =
      kind === "purchasing"
        ? ["supervisor"]
        : [...new Set(mentions.length ? mentions : roles)];
    if (!targets.length) {
      toast.error("Pilih penerima tugas");
      return;
    }
    const wibDay = Math.floor((Date.now() + 7 * 3600000) / 86400000);
    const dayOffset = due === "tomorrow" ? 1 : due === "week" ? 6 : 0;
    const end = new Date(
      (wibDay + dayOffset + 1) * 86400000 - 7 * 3600000 - 60000,
    );
    setSaving(true);
    // Remove each successful recipient from this submission so retry cannot duplicate it.
    const failed: string[] = [];
    for (const assigneeRole of targets) {
      try {
        await call("/api/admin-manager/tasks", "POST", {
          title: title.trim(),
          assigneeRole,
          kind,
          priority,
          dueAt: end.toISOString(),
          attachments,
        });
      } catch {
        failed.push(assigneeRole);
      }
    }
    if (failed.length) {
      setRoles(failed);
      setTitle(title.replace(/@(manager|supervisor|spv)\b/gi, "").trim());
      toast.error(
        `Gagal mengirim ke ${failed.map(roleLabel).join(", ")}. Coba lagi.`,
      );
    } else {
      setTitle("");
      setAttachments([]);
      toast.success("Tugas terkirim");
    }
    setSaving(false);
    await load();
  };
  const attach = async (type: string) => {
    const url = await requestAdminPrompt({
      title: `Tambah ${type === "link" ? "link" : "lampiran " + type}`,
      message: "Masukkan URL HTTPS berkas yang dapat diakses penerima.",
      placeholder: "https://…",
      confirmText: "Tambahkan",
    });
    if (!url) return;
    try {
      const u = new URL(url);
      if (!["https:", "http:"].includes(u.protocol)) throw Error();
      setAttachments((a) =>
        [
          ...a,
          {
            type,
            url: u.href,
            name: u.pathname.split("/").pop() || u.hostname,
          },
        ].slice(0, 10),
      );
    } catch {
      toast.error("URL lampiran tidak valid");
    }
  };
  const statusTarget = document.getElementById("admin-dashboard-live-status");
  const PRI: Record<string, [string, string]> = { high: ["Tinggi", "hi"], normal: ["Sedang", "md"], low: ["Rendah", ""] };
  const filters: [string, string][] = [["all", "Semua"], ["ai", "✦ AI"], ["manager", "Dari Manager"], ["supervisor", "Dari Supervisor"], ["owner", "Buatan saya"]];
  const list = tasks.filter((t) => (filter === "done" ? t.status === "done" : t.status === "open" && (filter === "all" || t.source === filter)))
    .sort((a, b) => (Number(b.source === "owner") - Number(a.source === "owner")) || ((a.priority === "high" ? 0 : a.priority === "normal" ? 1 : 2) - (b.priority === "high" ? 0 : b.priority === "normal" ? 1 : 2)));
  const ICON: Record<string, string> = { file: "clip", link: "link", photo: "img", video: "vid" };
  return (
    <>
      {statusTarget && createPortal(<span className="mgr-proto"><span className="live">{error || feedError ? "SEBAGIAN DATA BELUM TERHUBUNG" : updated ? "LIVE · DIPERBARUI " + formatAgo(updated, now).toUpperCase() : "MENGHUBUNGKAN…"}</span></span>, statusTarget)}
      <div className="kpis" style={{ gridTemplateColumns: "repeat(5,1fr)" }}>
        {["Tugas aktif", "Selesai hari ini", "Terlambat", "Dari AI", "Dari Owner"].map((label, i) => (
          <div key={label}><b>{loading || error ? "—" : counts[i]}</b><div className="kl">{label}</div></div>
        ))}
      </div>
      <div className="work" style={{ marginTop: 12 }}>
        <div className="col">
          <div className="panel fill">
            <div className="ph"><span className="lab">Semua tugas</span><span className="meta">{loading ? "Memuat…" : error ? "Data belum tersedia" : `${open.length} aktif · ${done.length} selesai`}</span></div>
            <div className="comp">
              <div className="cin">
                <input type="text" aria-label="Tulis tugas" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void send(); }}
                  placeholder={kind === "purchasing" ? "Catatan untuk Supervisor: barang, jumlah, merek, kapan dibutuhkan…" : "Tulis tugas untuk Manager / Supervisor… ketik @manager atau @supervisor"} />
                <button className="btn r" disabled={saving || !title.trim()} onClick={() => void send()}><Ic n="send" />{saving ? "Mengirim…" : "Buat"}</button>
              </div>
              <div className="crow"><span className="meta">Jenis</span>
                <button className={`chipb ${kind === "general" ? "on" : ""}`} onClick={() => setKind("general")}>Tugas umum</button>
                <button className={`chipb ${kind === "purchasing" ? "on" : ""}`} onClick={() => setKind("purchasing")}>Permintaan belanja → Supervisor</button>
              </div>
              {kind !== "purchasing" && (
                <div className="crow"><span className="meta">Untuk</span>
                  {["manager", "supervisor"].map((r) => (
                    <button key={r} className={`chipb ${roles.includes(r) ? "on" : ""}`} aria-pressed={roles.includes(r)} onClick={() => setRoles((v) => (v.includes(r) ? v.filter((x) => x !== r) : [...v, r]))}>@{r}</button>
                  ))}
                </div>
              )}
              <div className="crow">
                <select className="sel" aria-label="Prioritas" value={priority} onChange={(e) => setPriority(e.target.value)}><option value="normal">Sedang</option><option value="high">Tinggi</option><option value="low">Rendah</option></select>
                <select className="sel" aria-label="Tenggat" value={due} onChange={(e) => setDue(e.target.value)}><option value="today">Hari ini</option><option value="tomorrow">Besok</option><option value="week">Minggu ini</option></select>
                <span className="meta" style={{ marginLeft: 6 }}>Lampiran</span>
                {["file", "link", "photo", "video"].map((type) => (
                  <button key={type} className="btn s" disabled={attachments.length >= 10} onClick={() => void attach(type)}><Ic n={ICON[type]} />{type === "photo" ? "foto" : type}</button>
                ))}
              </div>
              {!!attachments.length && <div className="pend">{attachments.map((a, i) => <span key={i} className="att"><Ic n={ICON[a.type] ?? "clip"} /><span>{a.name}</span><button onClick={() => setAttachments((v) => v.filter((_, n) => n !== i))}>×</button></span>)}</div>}
            </div>
            <div className="tabs">
              {filters.map(([id, label]) => <button key={id} className={filter === id ? "on" : ""} onClick={() => setFilter(id)}>{label}</button>)}
              <button className={filter === "done" ? "on" : ""} style={{ marginLeft: "auto" }} onClick={() => setFilter("done")}>Selesai {done.length}</button>
            </div>
            <div className="sc" style={{ maxHeight: 520, overflowY: "auto" }}>
              {loading ? <div className="empty">MEMUAT TUGAS…</div>
                : error ? <div className="empty">GAGAL MEMUAT TUGAS: {error} <button className="btn s" onClick={() => void load()}>Coba lagi</button></div>
                : !list.length ? <div className="empty">{filter === "done" ? "BELUM ADA TUGAS SELESAI" : "TIDAK ADA TUGAS PADA KATEGORI INI"}</div>
                : list.map((t) => {
                  const pr = PRI[t.priority] ?? PRI.normal;
                  return (
                    <div key={t.id} className={`tr ${expanded === t.id ? "open" : ""}`} onClick={() => setExpanded(expanded === t.id ? null : t.id)}>
                      <span className={`cb ${t.status === "done" ? "on" : ""}`}>{t.status === "done" ? "✓" : ""}</span>
                      <div style={{ minWidth: 0 }}>
                        <div className={`tt ${t.status === "done" ? "dn2" : ""}`}>{t.title}</div>
                        <div className="ts">
                          <span className={`tg ${t.source === "ai" ? "ai" : t.source === "owner" ? "o" : ""}`}>{sourceLabel(t.source)}</span>
                          {t.kind === "purchasing" && <span className="tg md">Belanja</span>}
                          <span>→ @{roleLabel(t.assignee_role)}</span>
                          {Number(t.comment_count) > 0 && <span>💬 {t.comment_count}</span>}
                          {t.attachments?.length > 0 && <span><Ic n="clip" /> {t.attachments.length}</span>}
                        </div>
                      </div>
                      <div className="tm">
                        {late(t) ? <span className="tg hi">TERLAMBAT</span> : <span className={`tg ${pr[1]}`}>{pr[0]}</span>}
                        <span>{dueLabel(t.due_at)}</span>
                      </div>
                      {expanded === t.id && (
                        <div className="det" onClick={(e) => e.stopPropagation()}>
                          <p>{t.detail || "Tidak ada detail tambahan."}</p>
                          {t.attachments?.length > 0 && <div className="gal">{t.attachments.map((a, i) => <a key={i} className="lk" href={a.url} target="_blank" rel="noopener noreferrer"><Ic n={a.type === "link" ? "link" : "file"} />{a.name}</a>)}</div>}
                          <div className="meta">Status tugas diperbarui dari aplikasi penerima.</div>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
        <div className="col">
          <div className="panel fill" style={{ flex: 1.2 }}>
            <div className="ph"><span className="lab g">Aktivitas langsung · semua aplikasi</span></div>
            <div className="ph" style={{ padding: "6px 14px" }}><span className="meta">{updated ? `diperbarui ${formatAgo(updated, now)}` : "Menghubungkan…"} · {events.length} kejadian</span></div>
            <div className="sc feed" style={{ maxHeight: 420, overflowY: "auto" }}>
              {feedError ? <div className="empty">AKTIVITAS BELUM TERSEDIA <button className="btn s" onClick={() => void load()}>Coba lagi</button></div>
                : !events.length ? <div className="empty">BELUM ADA AKTIVITAS TERBARU</div>
                : events.map((e, i) => (
                  <div className="fr" key={`${e.at}-${i}`}><span className="s">{e.app}</span><span>{describeEvent(e, money)}</span><span className="a">{formatAgo(e.at, now)}</span></div>
                ))}
            </div>
          </div>
          <div className="panel">
            <div className="ph"><span className="lab">Per penerima</span></div>
            {["manager", "supervisor"].map((r) => (
              <div className="mr" key={r}><span>{roleLabel(r)}</span><span className="meta">{error ? "Data belum tersedia" : `${done.filter((t) => t.assignee_role === r).length}/${tasks.filter((t) => t.assignee_role === r).length} selesai`}</span></div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
