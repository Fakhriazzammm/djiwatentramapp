import { createLazyFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, FileText, Calendar, Info, X } from "lucide-react";
import { createClient } from "@yumipos/web-shared/lib/client";
import { useStaffProfile } from "../$username.lazy";

interface NotifItem {
  id: string;
  title: string;
  message: string;
  type: "announcement" | "payslip" | "contract" | "leave" | "info";
  date: string;
}

export const Route = createLazyFileRoute("/$username/notifikasi")({
  component: NotifikasiPage,
});

function NotifikasiPage() {
  const { staff, username } = useStaffProfile();
  const [notifications, setNotifications] = useState<NotifItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    let mounted = true;
    setIsLoading(true);
    (async () => {
      try {
        const supabase = createClient();
        const { data: announcements } = await supabase
          .from("announcements")
          .select("id, title, subtitle, created_at")
          .eq("is_active", true)
          .order("created_at", { ascending: false })
          .limit(5);

        const items: NotifItem[] = [];
        if (announcements) {
          for (const a of announcements) {
            items.push({
              id: `ann-${a.id}`,
              title: a.title,
              message: a.subtitle || "",
              type: "announcement",
              date: new Date(a.created_at).toLocaleDateString("id-ID", { day: "numeric", month: "short" }),
            });
          }
        }
        if (items.length === 0) {
          items.push({ id: "welcome", title: "Selamat Datang!", message: `Halo ${staff?.name}, aplikasi karyawan siap digunakan.`, type: "info", date: "Hari ini" });
        }
        if (mounted) setNotifications(items);
      } catch {
        if (mounted) setNotifications([{ id: "default", title: "Tidak Ada Notifikasi", message: "Belum ada notifikasi terbaru.", type: "info", date: "" }]);
      } finally {
        if (mounted) setIsLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [staff]);

  const visible = notifications.filter((n) => !dismissed.has(n.id));

  const iconMap: Record<string, React.ReactNode> = {
    announcement: <Bell className="h-4 w-4 text-blue-500" />,
    payslip: <FileText className="h-4 w-4 text-emerald-500" />,
    contract: <FileText className="h-4 w-4 text-orange-500" />,
    leave: <Calendar className="h-4 w-4 text-purple-500" />,
    info: <Info className="h-4 w-4 text-muted-foreground" />,
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Bell className="h-4 w-4 text-blue-600" />
        <h2 className="text-xs font-black uppercase tracking-wider">Notifikasi</h2>
        {visible.length > 0 && (
          <span className="ml-auto rounded-full bg-blue-100 px-2 py-0.5 text-[9px] font-bold text-blue-700">{visible.length}</span>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse rounded-xl border bg-card p-3 flex items-start gap-3">
              <div className="h-8 w-8 rounded-lg bg-muted" />
              <div className="space-y-1.5 flex-1"><div className="h-3 w-32 rounded bg-muted" /><div className="h-2.5 w-48 rounded bg-muted" /></div>
            </div>
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border bg-card p-6 text-center">
          <Bell className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="font-bold text-sm">Semua sudah dibaca</p>
          <p className="text-xs text-muted-foreground">Tidak ada notifikasi baru.</p>
        </div>
      ) : (
        <div className="space-y-2">
          <AnimatePresence>
            {visible.map((n) => (
              <motion.div
                key={n.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                className="group relative rounded-xl border bg-card p-3 overflow-hidden"
              >
                <button
                  onClick={() => setDismissed(new Set(dismissed).add(n.id))}
                  className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground/30 hover:text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="h-3 w-3" />
                </button>
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">{iconMap[n.type]}</div>
                  <div className="min-w-0 pr-4">
                    <p className="font-bold text-xs">{n.title}</p>
                    {n.message && <p className="text-[10px] text-muted-foreground mt-0.5">{n.message}</p>}
                    {n.date && <p className="text-[8px] text-muted-foreground/50 mt-1">{n.date}</p>}
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
