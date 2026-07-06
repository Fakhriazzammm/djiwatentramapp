import { createLazyFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bell, FileText, Calendar, Info, X, Megaphone,
  CheckCheck, ExternalLink, Clock, AlertCircle,
} from "lucide-react";
import { createClient } from "@yumipos/web-shared/lib/client";
import { useStaffProfile } from "../$username.lazy";

const NOTIF_DISMISS_KEY = "yumi_notif_dismissed_v2_";

type NotifType = "announcement" | "payslip" | "contract" | "leave" | "info";

interface NotifItem {
  id: string;
  title: string;
  message: string;
  type: NotifType;
  date: string;
  actionUrl?: string;
  actionLabel?: string;
  /** ISO timestamp for sorting */
  rawTs: string;
}

interface NotificationSource {
  label: string;
  icon: React.ReactNode;
  key: NotifType | "all";
}

const SOURCES: NotificationSource[] = [
  { label: "Semua", icon: <Bell className="h-3 w-3" />, key: "all" },
  { label: "Pengumuman", icon: <Megaphone className="h-3 w-3" />, key: "announcement" },
  { label: "Penggajian", icon: <FileText className="h-3 w-3" />, key: "payslip" },
  { label: "Izin", icon: <Calendar className="h-3 w-3" />, key: "leave" },
];

export const Route = createLazyFileRoute("/$username/notifikasi")({
  component: NotifikasiPage,
});

function NotifikasiPage() {
  const { staff, username } = useStaffProfile();
  const [notifications, setNotifications] = useState<NotifItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterType, setFilterType] = useState<NotifType | "all">("all");
  const [dismissed, setDismissed] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(NOTIF_DISMISS_KEY + (staff?._id || username));
      return new Set<string>(raw ? JSON.parse(raw) : []);
    } catch { return new Set<string>(); }
  });

  // Persist dismissed to localStorage
  const persistDismissed = (updated: Set<string>) => {
    setDismissed(updated);
    try {
      localStorage.setItem(
        NOTIF_DISMISS_KEY + (staff?._id || username),
        JSON.stringify([...updated]),
      );
    } catch { /* */ }
  };

  const dismissOne = (id: string) => {
    const next = new Set(dismissed);
    next.add(id);
    persistDismissed(next);
    updateBadgeCount(next);
  };

  const dismissAll = () => {
    const allIds = new Set(notifications.map((n) => n.id));
    persistDismissed(allIds);
    updateBadgeCount(allIds);
  };

  const markAllRead = () => {
    dismissAll();
  };

  const updateBadgeCount = (dismissedSet: Set<string>) => {
    try {
      const undismissed = notifications.filter((n) => !dismissedSet.has(n.id)).length;
      localStorage.setItem(`yumi_notif_count_${staff?._id || username}`, String(undismissed));
      // Trigger storage event so layout picks it up
      window.dispatchEvent(new Event("storage"));
    } catch { /* */ }
  };

  // ── Fetch notifications from multiple sources ──
  useEffect(() => {
    let mounted = true;
    setIsLoading(true);
    (async () => {
      const items: NotifItem[] = [];
      try {
        const supabase = createClient();

        // 1. Announcements
        const { data: announcements } = await supabase
          .from("announcements")
          .select("id, title, subtitle, created_at")
          .eq("is_active", true)
          .order("created_at", { ascending: false })
          .limit(10);

        if (announcements) {
          for (const a of announcements) {
            items.push({
              id: `ann-${a.id}`,
              title: a.title,
              message: a.subtitle || "",
              type: "announcement" as NotifType,
              date: new Date(a.created_at).toLocaleDateString("id-ID", {
                day: "numeric", month: "short",
              }),
              rawTs: a.created_at,
            });
          }
        }
      } catch { /* announcements fail silently */ }

      // 2. Payslips — only if staff._id exists
      if (staff?._id) {
        try {
          const supabase = createClient();
          const { data: payslips } = await supabase
            .from("pos_payslips")
            .select("id, period_name, net_pay, status, created_at")
            .eq("user_id", staff._id)
            .order("created_at", { ascending: false })
            .limit(5);

          if (payslips) {
            for (const p of payslips) {
              if (p.status === "draft") continue;
              items.push({
                id: `slip-${p.id}`,
                title: `Slip Gaji ${p.period_name || ""}`.trim(),
                message: `Status: ${p.status === "sent" ? "Telah dikirim 💌" : p.status === "acknowledged" ? "Sudah diterima ✅" : p.status === "disputed" ? "Ada yang perlu dicek ⚠️" : "Tersedia"}`,
                type: "payslip" as NotifType,
                date: new Date(p.created_at).toLocaleDateString("id-ID", {
                  day: "numeric", month: "short",
                }),
                actionUrl: `/${username}/profil?tab=payslip`,
                actionLabel: "Lihat Slip Gaji",
                rawTs: p.created_at,
              });
            }
          }
        } catch { /* payslips fail silently */ }
      }

      // 3. Leave requests
      if (staff?._id) {
        try {
          const supabase = createClient();
          const { data: leaves } = await supabase
            .from("attendance_leave_requests")
            .select("id, leave_type, start_date, end_date, status, created_at")
            .eq("user_id", staff._id)
            .order("created_at", { ascending: false })
            .limit(5);

          if (leaves) {
            for (const l of leaves) {
              const statusLabel =
                l.status === "approved" ? "Disetujui ✅" :
                l.status === "rejected" ? "Ditolak ❌" :
                l.status === "cancelled" ? "Dibatalkan" :
                "Menunggu ⏳";
              const period = l.start_date === l.end_date
                ? new Date(l.start_date).toLocaleDateString("id-ID", { day: "numeric", month: "short" })
                : `${new Date(l.start_date).toLocaleDateString("id-ID", { day: "numeric" })}-${new Date(l.end_date).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}`;
              items.push({
                id: `leave-${l.id}`,
                title: `${l.leave_type || "Izin"}`,
                message: `${period} — ${statusLabel}`,
                type: "leave" as NotifType,
                date: new Date(l.created_at).toLocaleDateString("id-ID", {
                  day: "numeric", month: "short",
                }),
                actionUrl: `/${username}/profil`,
                actionLabel: "Lihat Detail",
                rawTs: l.created_at,
              });
            }
          }
        } catch { /* leaves fail silently */ }
      }

      // 4. Sort: newest first
      items.sort((a, b) => new Date(b.rawTs).getTime() - new Date(a.rawTs).getTime());

      // 5. Fallback welcome
      if (items.length === 0) {
        items.push({
          id: "welcome",
          title: "Selamat Datang!",
          message: `Halo ${staff?.name || "Karyawan"}, aplikasi karyawan siap digunakan. Belum ada notifikasi terbaru.`,
          type: "info",
          date: "Hari ini",
          rawTs: new Date().toISOString(),
        });
      }

      if (mounted) setNotifications(items);
      if (mounted) setIsLoading(false);
      // Write unread count to localStorage for navbar badge
      try {
        const dismissed = JSON.parse(localStorage.getItem(NOTIF_DISMISS_KEY + (staff?._id || username)) || "[]");
        const dismissedSet = new Set<string>(dismissed);
        const undismissed = items.filter((n) => !dismissedSet.has(n.id)).length;
        localStorage.setItem(`yumi_notif_count_${staff?._id || username}`, String(undismissed));
      } catch { /* */ }
    })();
    return () => { mounted = false; };
  }, [staff?._id, staff?.name, username]);

  // ── Filter & dismiss logic ──
  const visible = useMemo(
    () => notifications.filter((n) => !dismissed.has(n.id)),
    [notifications, dismissed],
  );

  const filtered = useMemo(
    () => (filterType === "all" ? visible : visible.filter((n) => n.type === filterType)),
    [visible, filterType],
  );

  const iconMap: Record<string, React.ReactNode> = {
    announcement: <Megaphone className="h-4 w-4 text-blue-500" />,
    payslip: <FileText className="h-4 w-4 text-emerald-500" />,
    contract: <FileText className="h-4 w-4 text-orange-500" />,
    leave: <Calendar className="h-4 w-4 text-purple-500" />,
    info: <Info className="h-4 w-4 text-muted-foreground" />,
  };

  const typeBadge: Record<string, string> = {
    announcement: "bg-blue-100 text-blue-700",
    payslip: "bg-emerald-100 text-emerald-700",
    contract: "bg-orange-100 text-orange-700",
    leave: "bg-purple-100 text-purple-700",
    info: "bg-gray-100 text-gray-600",
  };

  return (
    <div className="space-y-4">
      {/* ─── Header ─── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-blue-600" />
          <h2 className="text-xs font-black uppercase tracking-wider">Notifikasi</h2>
          {visible.length > 0 && (
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[9px] font-bold text-blue-700">
              {visible.length}
            </span>
          )}
        </div>
        {visible.length > 1 && (
          <button
            onClick={markAllRead}
            className="flex items-center gap-1 rounded-lg bg-muted px-2.5 py-1 text-[9px] font-bold text-muted-foreground hover:bg-muted/80 transition-colors"
          >
            <CheckCheck className="h-3 w-3" />
            Tandai Semua Dibaca
          </button>
        )}
      </div>

      {/* ─── Filter Tabs ─── */}
      <div className="flex gap-1 overflow-x-auto -mx-1 px-1 scrollbar-none">
        {SOURCES.map((s) => {
          const isActive = filterType === s.key;
          const count = s.key === "all"
            ? visible.length
            : visible.filter((n) => n.type === s.key).length;
          return (
            <button
              key={s.key}
              onClick={() => setFilterType(s.key)}
              className={`flex items-center gap-1.5 shrink-0 rounded-full px-3 py-1.5 text-[10px] font-bold transition-all ${
                isActive
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-muted text-muted-foreground hover:bg-muted/70"
              }`}
            >
              {s.icon}
              <span>{s.label}</span>
              {count > 0 && (
                <span className={`ml-0.5 rounded-full px-1.5 py-0 text-[8px] font-black ${
                  isActive ? "bg-white/20 text-white" : "bg-blue-100 text-blue-700"
                }`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ─── Content ─── */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse rounded-xl border bg-card p-3 flex items-start gap-3">
              <div className="h-8 w-8 rounded-lg bg-muted" />
              <div className="space-y-1.5 flex-1">
                <div className="h-3 w-32 rounded bg-muted" />
                <div className="h-2.5 w-48 rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border bg-card p-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            {filterType === "all" ? (
              <CheckCheck className="h-6 w-6 text-emerald-500" />
            ) : (
              <Bell className="h-6 w-6 text-muted-foreground/40" />
            )}
          </div>
          <p className="font-bold text-sm">
            {filterType === "all"
              ? "Semua sudah dibaca"
              : `Tidak ada notifikasi ${SOURCES.find((s) => s.key === filterType)?.label.toLowerCase() || ""}`}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {filterType === "all"
              ? "Kamu sudah membaca semua notifikasi."
              : "Belum ada notifikasi jenis ini."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <AnimatePresence initial={false}>
            {filtered.map((n) => (
              <motion.div
                key={n.id}
                layout
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 25, mass: 0.8 }}
                className="group relative rounded-xl border bg-card p-3 overflow-hidden"
              >
                <button
                  onClick={() => dismissOne(n.id)}
                  className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground/30 hover:text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="h-3 w-3" />
                </button>
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                    {iconMap[n.type]}
                  </div>
                  <div className="min-w-0 flex-1 pr-4">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="font-bold text-xs">{n.title}</p>
                      <span className={`rounded px-1.5 py-0 text-[7px] font-bold uppercase tracking-wider ${typeBadge[n.type] || "bg-gray-100 text-gray-600"}`}>
                        {n.type === "announcement" ? "Info" :
                         n.type === "payslip" ? "Gaji" :
                         n.type === "leave" ? "Izin" : ""}
                      </span>
                    </div>
                    {n.message && (
                      <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">{n.message}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1.5">
                      {n.date && (
                        <span className="text-[8px] text-muted-foreground/50 flex items-center gap-1">
                          <Clock className="h-2.5 w-2.5" />
                          {n.date}
                        </span>
                      )}
                      {n.actionUrl && n.actionLabel && (
                        <a
                          href={n.actionUrl}
                          className="inline-flex items-center gap-0.5 rounded-md bg-primary/10 px-2 py-0.5 text-[8px] font-bold text-primary hover:bg-primary/20 transition-colors"
                        >
                          {n.actionLabel}
                          <ExternalLink className="h-2.5 w-2.5" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
