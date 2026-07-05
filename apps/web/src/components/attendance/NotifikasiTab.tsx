import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, FileText, Calendar, Info, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/client";

interface Notification {
  id: string;
  title: string;
  message: string;
  type: "announcement" | "payslip" | "contract" | "leave" | "info";
  date: string;
  isRead?: boolean;
}

interface NotifikasiTabProps {
  userId: string;
  userName: string;
}

export function NotifikasiTab({ userId, userName }: NotifikasiTabProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setIsLoading(true);

    (async () => {
      try {
        const supabase = createClient();

        // Fetch active announcements
        const { data: announcements } = await supabase
          .from("announcements")
          .select("id, title, subtitle, created_at")
          .eq("is_active", true)
          .order("created_at", { ascending: false })
          .limit(5);

        const items: Notification[] = [];

        if (announcements) {
          for (const a of announcements) {
            items.push({
              id: `ann-${a.id}`,
              title: a.title,
              message: a.subtitle || "",
              type: "announcement",
              date: new Date(a.created_at).toLocaleDateString("id-ID", {
                day: "numeric",
                month: "short",
              }),
            });
          }
        }

        // Fallback jika tidak ada notifikasi
        if (items.length === 0) {
          items.push({
            id: "welcome",
            title: "Selamat Datang!",
            message: `Halo ${userName}, aplikasi karyawan Djiwa Tentram siap digunakan.`,
            type: "info",
            date: "Hari ini",
          });
        }

        if (mounted) setNotifications(items);
      } catch (e) {
        console.warn("[Notifikasi] fetch error:", e);
        if (mounted) {
          setNotifications([
            {
              id: "default",
              title: "Tidak Ada Notifikasi",
              message: "Belum ada notifikasi terbaru untuk Anda.",
              type: "info",
              date: "",
            },
          ]);
        }
      } finally {
        if (mounted) setIsLoading(false);
      }
    })();

    return () => { mounted = false; };
  }, [userId, userName]);

  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const handleDismiss = useCallback((id: string) => {
    setDismissed((prev) => new Set(prev).add(id));
  }, []);

  const typeIcon = (type: string) => {
    switch (type) {
      case "announcement": return <Bell className="h-4 w-4 text-blue-500" />;
      case "payslip": return <FileText className="h-4 w-4 text-emerald-500" />;
      case "contract": return <FileText className="h-4 w-4 text-orange-500" />;
      case "leave": return <Calendar className="h-4 w-4 text-purple-500" />;
      default: return <Info className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const visible = notifications.filter((n) => !dismissed.has(n.id));

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      <div className="flex items-center gap-2 px-1">
        <Bell className="h-4 w-4 text-primary" />
        <h2 className="text-xs font-black uppercase tracking-wider text-foreground">
          Notifikasi
        </h2>
        {visible.length > 0 && (
          <span className="ml-auto rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-bold text-primary">
            {visible.length}
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="animate-pulse rounded-xl border bg-card p-4 flex items-start gap-3"
            >
              <div className="h-8 w-8 rounded-lg bg-muted" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-32 rounded bg-muted" />
                <div className="h-2.5 w-48 rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border bg-card p-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Bell className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="font-bold text-sm">Semua sudah dibaca</p>
          <p className="text-xs text-muted-foreground mt-1">
            Tidak ada notifikasi baru.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <AnimatePresence>
            {visible.map((n) => (
              <motion.div
                key={n.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20, height: 0, marginBottom: 0 }}
                className="group relative rounded-xl border bg-card p-4 overflow-hidden"
              >
                <button
                  onClick={() => handleDismiss(n.id)}
                  className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted transition-colors opacity-0 group-hover:opacity-100"
                >
                  <X className="h-3 w-3" />
                </button>
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                    {typeIcon(n.type)}
                  </div>
                  <div className="flex-1 min-w-0 pr-4">
                    <p className="font-bold text-xs">{n.title}</p>
                    {n.message && (
                      <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">
                        {n.message}
                      </p>
                    )}
                    {n.date && (
                      <p className="text-[8px] text-muted-foreground/60 mt-1 font-medium">
                        {n.date}
                      </p>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </motion.div>
  );
}
