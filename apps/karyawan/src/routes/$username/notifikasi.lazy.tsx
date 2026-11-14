import { createLazyFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { DsButton, DsEmpty, DsGroupLabel, DsIcon, DsPageTitle, DsPills, DsTag, ds3d } from "@yumipos/web-shared/components/ds";
import { X } from "lucide-react";
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
  { label: "Semua", icon: null, key: "all" },
  { label: "Info", icon: null, key: "announcement" },
  { label: "Gaji", icon: null, key: "payslip" },
  { label: "Izin", icon: null, key: "leave" },
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
                message: `Status: ${p.status === "sent" ? "Telah dikirim" : p.status === "acknowledged" ? "Sudah diterima" : p.status === "disputed" ? "Ada yang perlu dicek" : "Tersedia"}`,
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
                l.status === "approved" ? "Disetujui" :
                l.status === "rejected" ? "Ditolak" :
                l.status === "cancelled" ? "Dibatalkan" :
                "Menunggu";
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

  const iconName = (t: NotifType) => (t === "payslip" ? "employee-payslip" : t === "leave" ? "employee-leave" : t === "contract" ? "employee-contract" : "notifications-alerts") as Parameters<typeof DsIcon>[0]["name"];
  const dates = [...new Set(filtered.map((n) => n.date))];
  const { navigate } = useStaffProfile();

  return (
    <div>
      <DsPageTitle left={<button type="button" className="ds-iconbtn" aria-label="Kembali ke beranda" onClick={() => navigate({ to: `/${username}/beranda` as any })}>‹</button>} right={visible.length > 0 ? <DsButton size="sm" variant="ghost" onClick={markAllRead}>Tandai dibaca</DsButton> : undefined}>Notifikasi</DsPageTitle>
      <DsPills
        value={filterType}
        onChange={(v) => setFilterType(v as NotifType | "all")}
        items={SOURCES.map((s): [string, string] => [s.key, s.label])}
      />
      {isLoading && <div className="ds-skeleton" style={{ height: 120, marginTop: 16, borderRadius: 30 }} role="status" aria-label="Memuat notifikasi" />}
      {!isLoading && filtered.length === 0 && <DsEmpty icon={ds3d("notifications-alerts")}>Tidak ada notifikasi</DsEmpty>}
      {!isLoading && dates.map((d) => (
        <div key={d}>
          <DsGroupLabel>{d}</DsGroupLabel>
          {filtered.filter((n) => n.date === d).map((n) => (
            <div key={n.id} style={{display:"flex", alignItems:"flex-start", gap:14, padding:"14px 16px", borderRadius:26, background:"var(--ds-group)", marginBottom:10, position:"relative"}}>
              <span aria-label="Belum dibaca" style={{position:"absolute", left:5, top:"50%", width:6, height:6, borderRadius:"50%", background:"var(--ds-blue)"}} />
              {n.actionUrl ? <button type="button" onClick={() => navigate({ to: n.actionUrl as any })} style={{flex:1, display:"flex", gap:14, minWidth:0, alignSelf:"stretch", textAlign:"left", background:"none", border:0, padding:0, cursor:"pointer"}}>
                <DsIcon name={iconName(n.type)} /><span style={{flex:1,minWidth:0}}><strong style={{display:"block", fontSize:15}}>{n.title}</strong>
                <span style={{display:"block", fontSize:13, color:"var(--ds-mute)"}}>{n.message}</span>
                {n.actionLabel && <span style={{display:"block", paddingTop:8}}><DsTag tone="info">{n.actionLabel}</DsTag></span>}</span>
              </button> : <div style={{flex:1, minWidth:0, display:"flex", gap:14}}><DsIcon name={iconName(n.type)} /><div><strong style={{display:"block", fontSize:15}}>{n.title}</strong><span style={{display:"block", fontSize:13, color:"var(--ds-mute)"}}>{n.message}</span></div></div>}
              <button type="button" aria-label={`Tutup notifikasi ${n.title}`} onClick={() => dismissOne(n.id)} style={{background:"none", border:0, minHeight:44, minWidth:44, color:"var(--ds-faint)", cursor:"pointer"}}><X size={16} /></button>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
