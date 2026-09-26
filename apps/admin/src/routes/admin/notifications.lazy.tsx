import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { Bell, Check, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAdminNotifications, formatNotificationTime, type AdminNotification } from "@/hooks/use-admin-notifications";
import { useAdminPush } from "@/hooks/use-admin-push";

export const Route = createLazyFileRoute("/admin/notifications")({
  component: AdminNotificationsPage,
});

function tone(notification: AdminNotification) {
  if (notification.priority === "urgent") return "bg-rose-50 text-rose-700";
  if (notification.priority === "high") return "bg-amber-50 text-amber-700";
  return "bg-primary/10 text-primary";
}

function routeFor(notification: AdminNotification) {
  const payload = notification.action_payload ?? {};
  if (notification.action_type === "open_order") return "/admin/orders";
  if (notification.action_type === "open_inventory") return "/admin/inventory";
  if (notification.action_type === "open_shift") return "/admin/finance/shift-reports";
  if (notification.action_type === "open_finance") return "/admin/finance/transactions";
  if (notification.action_type === "open_approval") return "/admin/finance";
  return typeof payload.route === "string" && payload.route.startsWith("/admin/") ? payload.route : null;
}

function AdminNotificationsPage() {
  const navigate = useNavigate();
  const { notifications, unreadCount, isLoading, error, markRead, markAllRead } = useAdminNotifications();
  const { supported, isSubscribed, isBusy, enable } = useAdminPush();
  const [isMarkingAll, setIsMarkingAll] = useState(false);

  const openNotification = async (notification: AdminNotification) => {
    if (!notification.isRead) await markRead(notification.id).catch(() => toast.error("Notifikasi gagal ditandai"));
    const route = routeFor(notification);
    if (route) navigate({ to: route as any });
  };

  const markEverythingRead = async () => {
    setIsMarkingAll(true);
    try {
      await markAllRead();
    } catch {
      toast.error("Gagal menandai semua notifikasi");
    } finally {
      setIsMarkingAll(false);
    }
  };

  return (
    <div className="min-h-full bg-background px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-2 md:px-6 md:pb-8 md:pt-4">
      <div className="mx-auto w-full max-w-2xl">
        {supported && !isSubscribed && (
          <button type="button" disabled={isBusy} onClick={() => void enable()} className="mt-4 flex min-h-12 w-full items-center justify-between rounded-2xl border border-primary/15 bg-primary/[0.06] px-3.5 text-left text-xs font-semibold text-primary disabled:opacity-60">
            <span><span className="block font-black">Notifikasi saat app tertutup</span><span className="mt-0.5 block text-[11px] font-medium text-muted-foreground">Tetap dapatkan alert operasional di mobile.</span></span>
            <span>{isBusy ? "Menyiapkan..." : "Aktifkan"}</span>
          </button>
        )}

        <section className="mt-2 md:mt-4">
          <div className="flex items-center justify-between gap-3 border-b border-border/70 pb-3">
            <div><p className="text-sm font-black">Aktivitas terbaru</p><p className="text-[10px] text-muted-foreground">{unreadCount ? `${unreadCount} belum dibaca` : "Semua sudah dibaca"}</p></div>
            {unreadCount > 0 && (
              <button type="button" disabled={isMarkingAll} onClick={() => void markEverythingRead()} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-[11px] font-bold text-primary disabled:opacity-60">
                {isMarkingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Tandai semua
              </button>
            )}
          </div>
          {isLoading && notifications.length === 0 ? <div className="space-y-2 p-3"><div className="h-16 animate-pulse rounded-xl bg-muted" /><div className="h-16 animate-pulse rounded-xl bg-muted" /></div> : error && notifications.length === 0 ? <div className="p-8 text-center text-xs text-muted-foreground"><p>Notifikasi gagal dimuat.</p><button type="button" onClick={() => window.location.reload()} className="mt-2 font-bold text-primary">Coba lagi</button></div> : notifications.length === 0 ? <div className="p-10 text-center text-xs text-muted-foreground">Tidak ada notifikasi penting</div> : <div className="divide-y divide-border/70">{notifications.map((notification) => <button key={notification.id} type="button" onClick={() => void openNotification(notification)} className={`flex w-full items-start gap-3 px-1 py-4 text-left transition-colors hover:bg-muted/40 ${notification.isRead ? "opacity-70" : "bg-primary/[0.025]"}`}><span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tone(notification)}`}>{notification.isRead ? <Check className="h-3.5 w-3.5" /> : <Bell className="h-3.5 w-3.5" />}</span><span className="min-w-0 flex-1"><span className="flex items-center gap-1.5"><span className="truncate text-xs font-bold">{notification.title}</span>{!notification.isRead && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}</span><span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">{notification.message}</span><span className="mt-1 block text-[10px] text-muted-foreground/80">{formatNotificationTime(notification.created_at)}</span></span></button>)}</div>}
        </section>
      </div>
    </div>
  );
}
