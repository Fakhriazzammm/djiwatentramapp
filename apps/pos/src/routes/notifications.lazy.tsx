import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { NotificationCenter } from "@/components/pos/notification-center";
import { usePosNotifications } from "@/hooks/use-pos-notifications";

export const Route = createLazyFileRoute("/notifications")({
  component: NotificationsPage,
});

function NotificationsPage() {
  const navigate = useNavigate();
  const {
    notifications,
    unreadCount,
    isLoading,
    error,
    refresh,
    markRead,
    removeNotification,
    realtimeStatus,
  } = usePosNotifications();

  return (
    <main className="min-h-screen bg-muted/10 text-foreground">
      <div className="mx-auto w-full max-w-5xl px-3 py-3 sm:px-5 sm:py-5">
        <header className="mb-3 flex items-center gap-2 rounded-xl border border-border/70 bg-background px-3 py-2.5 shadow-sm sm:mb-4 sm:px-4">
          <button
            type="button"
            onClick={() => navigate({ to: "/menu" })}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
            aria-label="Kembali ke POS"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-black uppercase tracking-[0.16em] text-primary">Workspace POS</p>
            <h1 className="text-sm font-black leading-tight sm:text-base">Pusat Notifikasi</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className={`hidden rounded-full px-2 py-1 text-[10px] font-bold sm:inline-flex ${realtimeStatus === "connected" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
              {realtimeStatus === "connected" ? "Realtime aktif" : "Polling cadangan"}
            </span>
            <span className="hidden rounded-full bg-primary/10 px-2 py-1 text-[10px] font-bold text-primary sm:inline-flex">
              {unreadCount} belum dibaca
            </span>
            <button
              type="button"
              onClick={() => void refresh(true)}
              className="rounded-lg border border-border px-2.5 py-1.5 text-[10px] font-bold text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              Segarkan
            </button>
          </div>
        </header>

        <section className="overflow-hidden rounded-xl border border-border/70 bg-background shadow-sm">
          <NotificationCenter
            open
            fullPage
            onClose={() => navigate({ to: "/menu" })}
            notifications={notifications}
            isLoading={isLoading}
            error={error}
            onMarkRead={markRead}
            onDismiss={removeNotification}
            onOpenOrder={(notification) => navigate({
              to: "/admin/orders",
              search: { focusOrder: notification.order_number ?? undefined } as any,
            })}
          />
        </section>
      </div>
    </main>
  );
}
