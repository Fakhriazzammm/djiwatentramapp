import { useMemo, useState } from "react";
import { Bell, Check, ChevronRight, Info, Megaphone, WalletCards, X } from "lucide-react";
import { Djiwa3DIcon } from "@yumipos/web-shared";
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
        className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors hover:bg-muted/80"
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
}) {
  const [tab, setTab] = useState<"all" | "orders" | "admin">("all");
  const visible = useMemo(() => notifications.filter((item) => {
    if (tab === "orders") return item.notification_type.startsWith("order_");
    if (tab === "admin") return item.notification_type.startsWith("admin_");
    return true;
  }), [notifications, tab]);

  if (!open) return null;

  return (
    <>
      <button type="button" aria-label="Tutup notifikasi" className="fixed inset-0 z-40 cursor-default bg-black/20" onClick={onClose} />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-border bg-background shadow-2xl" aria-label="Pusat notifikasi">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">Operasional POS</p>
            <h2 className="text-base font-black">Notifikasi</h2>
          </div>
          <button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-xl hover:bg-muted" aria-label="Tutup">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-1 border-b border-border p-2">
          {(["all", "orders", "admin"] as const).map((value) => {
            const label = value === "all" ? "Semua" : value === "orders" ? "Pesanan" : "Admin";
            return <button key={value} type="button" onClick={() => setTab(value)} className={`rounded-lg px-2 py-2 text-xs font-bold transition ${tab === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>{label}</button>;
          })}
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {isLoading ? <div className="space-y-2">{[1, 2, 3].map((item) => <div key={item} className="h-24 animate-pulse rounded-2xl bg-muted" />)}</div> : null}
          {!isLoading && error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800">{error}</div> : null}
          {!isLoading && !error && visible.length === 0 ? <div className="flex min-h-48 flex-col items-center justify-center text-center"><Bell className="h-8 w-8 text-muted-foreground/40" /><p className="mt-3 text-sm font-bold">Belum ada notifikasi</p><p className="mt-1 text-xs text-muted-foreground">Pesanan baru dan briefing admin akan muncul di sini.</p></div> : null}
          <div className="space-y-2">
            {visible.map((item) => {
              const meta = typeMeta(item);
              const Icon = meta.Icon;
              const isOrder = item.notification_type.startsWith("order_");
              return (
                <article key={item.id} className={`relative rounded-2xl border p-3 pr-11 shadow-sm transition ${meta.className} ${item.isRead ? "opacity-70" : "ring-1 ring-current/10"}`}>
                  <button type="button" onClick={() => void onDismiss(item.id)} aria-label="Hapus notifikasi" className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-lg opacity-60 hover:bg-white/70 hover:opacity-100"><X className="h-4 w-4" /></button>
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/70"><Icon className="h-4 w-4" /></div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2"><div><p className="text-[10px] font-black uppercase tracking-wide opacity-70">{meta.label}</p><h3 className="text-sm font-black leading-tight">{item.title}</h3></div>{!item.isRead ? <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-rose-500" /> : null}</div>
                      {item.order_number ? <p className="mt-1 text-xs font-bold">#{item.order_number} · DjiwaApp</p> : null}
                      <p className="mt-1 text-xs leading-relaxed opacity-80">{item.message}</p>
                      <p className="mt-2 text-[10px] font-semibold opacity-60">{formatAge(item.created_at)}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {isOrder && onOpenOrder ? <button type="button" onClick={() => { onMarkRead(item.id); onOpenOrder(item); }} className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-white/80 px-2.5 text-[11px] font-black hover:bg-white">Buka detail <ChevronRight className="h-3 w-3" /></button> : null}
                        {item.notification_type === "order_cashier_pending" && onMarkCashierPaid ? <button type="button" onClick={() => void onMarkCashierPaid(item)} className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-emerald-600 px-2.5 text-[11px] font-black text-white hover:bg-emerald-700"><Check className="h-3 w-3" /> Sudah Dibayar</button> : null}
                        {!item.isRead ? <button type="button" onClick={() => onMarkRead(item.id)} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-current/20 px-2.5 text-[11px] font-bold hover:bg-white/50"><Check className="h-3 w-3" /> Tandai dibaca</button> : null}
                        {item.notification_type === "admin_briefing" && !item.acknowledgedAt ? <button type="button" onClick={() => onMarkRead(item.id, true)} className="inline-flex min-h-9 items-center rounded-lg border border-current/20 px-2.5 text-[11px] font-bold hover:bg-white/50">Saya sudah membaca</button> : null}
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
