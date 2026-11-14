import { createPortal } from "react-dom";
import { useCallback, useEffect, useState } from "react";
import {
  Send,
  Link as LinkIcon,
  Paperclip,
  Image,
  Video,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { adminProtectedRpc } from "@/lib/admin-protected-read";
import { requestAdminPrompt } from "@/lib/admin-dialogs";
import type { FeedEvent } from "@/lib/dashboard-analytics";
import { describeEvent } from "../-dashboard/OpsSection";
import { formatAgo } from "../-dashboard/ui";

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
  return (
    <div className="manager-workspace">
      {statusTarget &&
        createPortal(
          <span
            className={`manager-live ${error || feedError ? "failed" : ""}`}
          >
            {error || feedError
              ? "Sebagian data belum terhubung"
              : updated
                ? "LIVE · DIPERBARUI " + formatAgo(updated, now)
                : "Menghubungkan…"}
          </span>,
          statusTarget,
        )}
      <div className="manager-kpis">
        {[
          "Tugas aktif",
          "Selesai hari ini",
          "Terlambat",
          "Dari AI",
          "Dari Owner",
        ].map((label, i) => (
          <div key={label}>
            <b>{loading || error ? "—" : counts[i]}</b>
            <span>{label}</span>
          </div>
        ))}
      </div>
      <div className="manager-work">
        <section className="manager-panel manager-tasks">
          <div className="manager-panel-head">
            <h2>Semua tugas</h2>
            <span>
              {loading
                ? "Memuat…"
                : error
                  ? "Data belum tersedia"
                  : `${open.length} aktif · ${done.length} selesai`}
            </span>
          </div>
          <div className="manager-composer">
            <div className="manager-compose-line">
              <input
                aria-label="Tulis tugas"
                value={title}
                maxLength={200}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void send();
                }}
                placeholder="Tulis tugas untuk Manager / Supervisor… ketik @ untuk memilih"
              />
              <button
                className="manager-create"
                disabled={saving || !title.trim()}
                onClick={() => void send()}
              >
                <Send size={17} />
                {saving ? "Mengirim…" : "Buat"}
              </button>
            </div>
            <div className="manager-compose-row">
              <span>Jenis</span>
              <button
                className={kind === "general" ? "on" : ""}
                onClick={() => setKind("general")}
              >
                Tugas umum
              </button>
              <button
                className={kind === "purchasing" ? "on" : ""}
                onClick={() => setKind("purchasing")}
              >
                Permintaan belanja → Supervisor
              </button>
            </div>
            {kind !== "purchasing" && (
              <div className="manager-compose-row">
                <span>Untuk</span>
                {["manager", "supervisor"].map((r) => (
                  <button
                    key={r}
                    className={roles.includes(r) ? "on" : ""}
                    aria-pressed={roles.includes(r)}
                    onClick={() =>
                      setRoles((v) =>
                        v.includes(r) ? v.filter((x) => x !== r) : [...v, r],
                      )
                    }
                  >
                    @{r}
                  </button>
                ))}
              </div>
            )}
            <div className="manager-compose-row manager-options">
              <select
                aria-label="Prioritas"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
              >
                <option value="normal">Sedang</option>
                <option value="high">Tinggi</option>
                <option value="low">Rendah</option>
              </select>
              <select
                aria-label="Tenggat"
                value={due}
                onChange={(e) => setDue(e.target.value)}
              >
                <option value="today">Hari ini</option>
                <option value="tomorrow">Besok</option>
                <option value="week">Minggu ini</option>
              </select>
              <span>Lampiran</span>
              {[
                ["file", Paperclip],
                ["link", LinkIcon],
                ["photo", Image],
                ["video", Video],
              ].map(([type, Icon]) => {
                const I = Icon as typeof Paperclip;
                return (
                  <button
                    key={String(type)}
                    disabled={attachments.length >= 10}
                    onClick={() => void attach(String(type))}
                  >
                    <I size={16} />
                    {type === "photo" ? "Foto" : String(type)}
                  </button>
                );
              })}
            </div>
            {!!attachments.length && (
              <div className="manager-compose-row">
                {attachments.map((a, i) => (
                  <button
                    key={i}
                    onClick={() =>
                      setAttachments((v) => v.filter((_, n) => n !== i))
                    }
                  >
                    {a.name} ×
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="manager-filters">
            {[
              ["all", "Semua"],
              ["ai", "✦ AI"],
              ["manager", "Dari Manager"],
              ["done", `Selesai ${done.length}`],
            ].map(([id, label]) => (
              <button
                key={id}
                className={filter === id ? "on" : ""}
                aria-pressed={filter === id}
                onClick={() => setFilter(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="manager-task-scroll">
            {loading ? (
              <p className="manager-empty" role="status">
                Memuat tugas…
              </p>
            ) : error ? (
              <div className="manager-empty" role="alert">
                Gagal memuat tugas: {error}
                <button onClick={() => void load()}>Coba lagi</button>
              </div>
            ) : !visible.length ? (
              <p className="manager-empty">
                Belum ada tugas{" "}
                {filter === "done" ? "selesai" : "pada kategori ini"}.
              </p>
            ) : (
              visible.map((t) => (
                <article key={t.id} className="manager-task">
                  <span
                    className={`manager-checkbox ${t.status === "done" ? "done" : ""}`}
                    aria-label={
                      t.status === "done" ? "Selesai" : "Belum selesai"
                    }
                  >
                    {t.status === "done" ? "✓" : ""}
                  </span>
                  <div>
                    <button
                      className="manager-task-title"
                      aria-expanded={expanded === t.id}
                      onClick={() =>
                        setExpanded(expanded === t.id ? null : t.id)
                      }
                    >
                      {t.title}
                      <ChevronDown size={13} />
                    </button>
                    <div className="manager-task-meta">
                      <span
                        className={`manager-tag ${t.source === "ai" ? "ai" : t.source === "owner" ? "owner" : ""}`}
                      >
                        {sourceLabel(t.source)}
                      </span>
                      <span>→ @{roleLabel(t.assignee_role)}</span>
                      {Number(t.comment_count) > 0 && (
                        <span>· {t.comment_count} komentar</span>
                      )}
                      {t.attachments?.length > 0 && (
                        <span>
                          <Paperclip size={13} /> {t.attachments.length}
                        </span>
                      )}
                    </div>
                    {expanded === t.id && (
                      <div className="manager-detail">
                        <p>{t.detail || "Tidak ada detail tambahan."}</p>
                        {t.attachments?.map((a, i) => (
                          <a
                            key={i}
                            href={a.url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {a.name} ↗
                          </a>
                        ))}
                        <small>
                          Status tugas diperbarui dari aplikasi penerima.
                        </small>
                      </div>
                    )}
                  </div>
                  <div className="manager-task-due">
                    <span
                      className={`manager-tag ${late(t) || t.priority === "high" ? "high" : t.priority === "normal" ? "medium" : ""}`}
                    >
                      {late(t)
                        ? "Terlambat"
                        : t.priority === "high"
                          ? "Tinggi"
                          : t.priority === "low"
                            ? "Rendah"
                            : "Sedang"}
                    </span>
                    <span>{dueLabel(t.due_at)}</span>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
        <aside className="manager-side">
          <section className="manager-panel manager-feed">
            <div className="manager-panel-head green">
              <h2>Aktivitas langsung · semua aplikasi</h2>
            </div>
            <p className="manager-feed-meta">
              {updated
                ? `diperbarui ${formatAgo(updated, now)}`
                : "Menghubungkan…"}{" "}
              · {events.length} kejadian
            </p>
            <div className="manager-feed-scroll">
              {feedError ? (
                <div className="manager-empty" role="alert">
                  Aktivitas belum tersedia.
                  <button onClick={() => void load()}>Coba lagi</button>
                </div>
              ) : !events.length ? (
                <p className="manager-empty">Belum ada aktivitas terbaru.</p>
              ) : (
                events.map((e, i) => (
                  <div className="manager-event" key={`${e.at}-${i}`}>
                    <span>{e.app}</span>
                    <p>{describeEvent(e, money)}</p>
                    <time>{formatAgo(e.at, now)}</time>
                  </div>
                ))
              )}
            </div>
          </section>
          <section className="manager-panel">
            <div className="manager-panel-head">
              <h2>Per penerima</h2>
            </div>
            {["manager", "supervisor"].map((r) => (
              <div className="manager-recipient" key={r}>
                <span>{roleLabel(r)}</span>
                <span>
                  {error
                    ? "Data belum tersedia"
                    : `${done.filter((t) => t.assignee_role === r).length}/${tasks.filter((t) => t.assignee_role === r).length} selesai`}
                </span>
              </div>
            ))}
          </section>
        </aside>
      </div>
    </div>
  );
}
