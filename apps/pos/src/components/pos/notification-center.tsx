import { useMemo, useState } from "react";
import { Bell, Check, ChevronRight, Info, Megaphone, WalletCards, X } from "lucide-react";
import { Djiwa3DIcon } from "@yumipos/web-shared";
import { getDisplayOrderNumber } from "@yumipos/web-shared/lib/order-number";
import type { PosNotification } from "@/hooks/use-pos-notifications";

function formatAge(value: string) {
  const diff = Math.max(0, Date.now() - Date.parse(value));
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Baru saja";
  if (minutes < 60) return `${minutes} menit lalu`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;
  return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short" }).format(new Date(value));
}

function typeMeta(item: PosNotification) {
  if (item.notification_type === "order_cashier_pending") {
    return { Icon: WalletCards, label: "Bayar di kasir", className: "border-amber-200 bg-amber-50 text-amber-900" };
  }
  if (item.notification_type === "order_mayar_pending") {
    return { Icon: WalletCards, label: "Menunggu DjiwaApp", className: "border-violet-200 bg-violet-50 text-violet-900" };
  }
  if (item.notification_type === "order_payment_failed") {
    return { Icon: X, label: "Pembayaran gagal", className: "border-rose-200 bg-rose-50 text-rose-900" };
  }
  if (item.notification_type === "order_paid") {
    return { Icon: Check, label: "Lunas", className: "border-emerald-200 bg-emerald-50 text-emerald-900" };
  }
  if (item.notification_type === "admin_briefing") {
    return { Icon: Megaphone, label: "Briefing admin", className: "border-blue-200 bg-blue-50 text-blue-900" };
  }
  return { Icon: Info, label: "Info admin", className: "border-sky-200 bg-sky-50 text-sky-900" };
}

export function NotificationBell({ unreadCount, onClick }: { unreadCount: number; onClick: () => void }) {
  const hasUnread = unreadCount > 0;
  return (
    <>
      <style>{`@keyframes notification-bell-wiggle { 0%, 100% { transform: rotate(0deg); } 12% { transform: rotate(14deg); } 24% { transform: rotate(-12deg); } 36% { transform: rotate(9deg); } 48% { transform: rotate(-6deg); } 60%, 100% { transform: rotate(0deg); } } @media (prefers-reduced-motion: reduce) { .notification-bell-wiggle { animation: none !important; } }`}</style>
      <button
        type="button"
        onClick={onClick}
        aria-label={hasUnread ? `${unreadCount} notifikasi belum dibaca` : "Buka notifikasi"}
        className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors hover:bg-muted/80"
      >
        <span className={hasUnread ? "notification-bell-wiggle inline-flex origin-top" : "inline-flex"} style={hasUnread ? { animation: "notification-bell-wiggle 1.8s ease-in-out infinite" } : undefined}>
          <Djiwa3DIcon name="notifications-alerts" size="sm" alt="" className="h-7 w-7" />
        </span>
        {hasUnread ? (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-black leading-none text-white ring-2 ring-background">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>
    </>
  );
}

export function NotificationCenter({
  open,
  onClose,
  notifications,
  isLoading,
  error,
  onMarkRead,
  onDismiss,
  onMarkCashierPaid,
  onOpenOrder,
  fullPage = false,
  onRetry,
}: {
  open: boolean;
  onClose: () => void;
  notifications: PosNotification[];
  isLoading: boolean;
  error: string | null;
  onMarkRead: (id: string, acknowledge?: boolean) => void;
  onDismiss: (id: string) => void | Promise<void>;
  onMarkCashierPaid?: (notification: PosNotification) => void | Promise<void>;
  onOpenOrder?: (notification: PosNotification) => void;
  fullPage?: boolean;
  onRetry?: () => void | Promise<void>;
}) {
  const [tab, setTab] = useState<"all" | "orders" | "admin">("all");
  const [filter, setFilter] = useState<"all" | "unread" | "payment">("all");
  const visible = useMemo(() => notifications.filter((item) => {
    if (tab === "orders" && !item.notification_type.startsWith("order_")) return false;
    if (tab === "admin" && !item.notification_type.startsWith("admin_")) return false;
    if (filter === "unread" && item.isRead) return false;
    if (filter === "payment" && !item.notification_type.includes("payment") && item.notification_type !== "order_paid") return false;
    return true;
  }), [filter, notifications, tab]);

  if (!open) return null;

  return (
    <>
      {!fullPage && <button type="button" aria-label="Tutup notifikasi" className="fixed inset-0 z-40 cursor-default bg-black/20" onClick={onClose} />}
      <aside className={fullPage ? "flex min-h-[calc(100vh-4rem)] w-full flex-col bg-background" : "fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col border-l border-border bg-background shadow-2xl"} aria-label="Pusat notifikasi">
        {!fullPage && <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
          <div className="min-w-0">
            <p className="text-[9px] font-black uppercase tracking-[0.16em] text-primary">Operasional POS</p>
            <h2 className="text-sm font-black leading-tight">Notifikasi</h2>
          </div>
          <button type="button" onClick={onClose} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg hover:bg-muted" aria-label="Tutup">
            <X className="h-4 w-4" />
          </button>
        </div>}

        <div className="grid grid-cols-3 gap-1 border-b border-border px-2 py-1.5">
          {(["all", "orders", "admin"] as const).map((value) => {
            const label = value === "all" ? "Semua" : value === "orders" ? "Pesanan" : "Admin";
            return <button key={value} type="button" onClick={() => setTab(value)} aria-pressed={tab === value} className={`min-h-11 rounded-md px-2 py-1.5 text-sm font-bold transition ${tab === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>{label}</button>;
          })}
        </div>
        <div className="flex flex-wrap gap-1.5 border-b border-border px-2.5 py-1.5">
          {(["all", "unread", "payment"] as const).map((value) => {
            const label = value === "all" ? "Semua" : value === "unread" ? "Belum dibaca" : "Pembayaran";
            return <button key={value} type="button" onClick={() => setFilter(value)} aria-pressed={filter === value} className={`min-h-11 rounded-full border px-3 py-1 text-xs font-bold leading-none transition ${filter === value ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted"}`}>{label}</button>;
          })}
        </div>

        <div className="flex-1 overflow-y-auto p-2.5">
          {isLoading ? <div className="space-y-1.5">{[1, 2, 3].map((item) => <div key={item} className="h-20 animate-pulse rounded-xl bg-muted" />)}</div> : null}
          {!isLoading && error ? <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"><p>Notifikasi belum dapat dimuat.</p>{onRetry ? <button type="button" onClick={() => void onRetry()} className="mt-2 min-h-11 rounded-lg border border-rose-300 px-3 font-semibold hover:bg-rose-100">Coba lagi</button> : null}</div> : null}
          {!isLoading && !error && visible.length === 0 ? <div className="flex min-h-40 flex-col items-center justify-center px-4 text-center"><Bell className="h-7 w-7 text-muted-foreground/40" /><p className="mt-2 text-sm font-bold">{notifications.length ? "Tidak ada notifikasi di filter ini" : "Belum ada notifikasi"}</p><p className="mt-1 text-sm text-muted-foreground">{notifications.length ? "Coba pilih filter lain." : "Pesanan dan info admin akan muncul di sini."}</p></div> : null}
          <div className={fullPage ? "grid grid-cols-1 gap-2 md:grid-cols-2" : "space-y-1.5"}>
            {visible.map((item) => {
              const meta = typeMeta(item);
              const Icon = meta.Icon;
              const isOrder = item.notification_type.startsWith("order_");
              return (
                <article key={item.id} className={`relative rounded-lg border p-3 pr-14 shadow-sm transition ${meta.className} ${item.isRead ? "opacity-70" : "ring-1 ring-current/10"}`}>
                  <button type="button" onClick={() => void onDismiss(item.id)} aria-label="Hapus notifikasi" className="absolute right-1 top-1 flex h-11 w-11 items-center justify-center rounded-lg opacity-70 hover:bg-white/70 hover:opacity-100"><X className="h-3 w-3" /></button>
                  <div className="flex items-start gap-1.5">
                    <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white/70"><Icon className="h-3 w-3" /></div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2"><div><p className="text-xs font-black uppercase tracking-wide opacity-70">{meta.label}</p><h3 className="text-sm font-black leading-tight">{item.title}</h3></div>{!item.isRead ? <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-rose-500" /> : null}</div>
                      {item.order_number ? <p className="mt-1 text-xs font-bold">#{getDisplayOrderNumber(item.order_number, { sequence: (item as any).daily_receipt_no, createdAt: (item as any).created_at, source: (item as any).source, orderType: (item as any).order_type })} · {item.source === "pos" ? "POS Kasir" : item.source === "customer_self_service" || item.source === "djiwaapp" ? "DjiwaApp" : item.source || "Operasional"}</p> : null}
                      <p className="mt-1 text-sm leading-relaxed">{item.message}</p>
                      <p className="mt-2 text-xs font-semibold opacity-60">{formatAge(item.created_at)}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {isOrder && onOpenOrder ? <button type="button" onClick={() => { onMarkRead(item.id); onOpenOrder(item); }} className="inline-flex min-h-11 items-center gap-1 rounded-lg bg-white/80 px-2.5 text-sm font-black hover:bg-white">Buka detail <ChevronRight className="h-3 w-3" /></button> : null}
                        {item.notification_type === "order_cashier_pending" && onMarkCashierPaid ? <button type="button" onClick={() => void onMarkCashierPaid(item)} className="inline-flex min-h-11 items-center gap-1 rounded-lg bg-emerald-600 px-2.5 text-sm font-black text-white hover:bg-emerald-700"><Check className="h-3 w-3" /> Sudah Dibayar</button> : null}
                        {!item.isRead ? <button type="button" onClick={() => onMarkRead(item.id)} className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-current/20 px-2.5 text-sm font-bold hover:bg-white/50"><Check className="h-3 w-3" /> Tandai dibaca</button> : null}
                        {item.notification_type === "admin_briefing" && !item.acknowledgedAt ? <button type="button" onClick={() => onMarkRead(item.id, true)} className="inline-flex min-h-11 items-center rounded-lg border border-current/20 px-2.5 text-sm font-bold hover:bg-white/50">Saya sudah membaca</button> : null}
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </aside>
    </>
  );
}
