import { useEffect } from "react";
import { CheckCircle2, ChevronRight, CreditCard, X } from "lucide-react";
import type { PosNotification } from "@/hooks/use-pos-notifications";

type TransactionAlertStackProps = {
  notifications: PosNotification[];
  onOpenOrder: (notification: PosNotification) => void;
  onDismiss: (notificationId: string) => void;
};

function isDjiwaAppTransaction(item: PosNotification) {
  const source = String(item.source ?? item.action_payload?.source ?? "").toLowerCase();
  return source === "customer_self_service" || source === "djiwaapp" || item.notification_type === "order_cashier_pending" || item.notification_type === "order_paid";
}

function getTransactionAlerts(notifications: PosNotification[]) {
  return notifications
    .filter((item) => isDjiwaAppTransaction(item))
    .filter((item) => item.notification_type === "order_cashier_pending" || item.notification_type === "order_paid")
    .filter((item) => !item.isRead)
    .slice(0, 3);
}

function formatCurrency(value: unknown) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(value ?? 0));
}

function getAlertCopy(item: PosNotification) {
  if (item.notification_type === "order_paid") {
    return {
      title: "Pembayaran QRIS Berhasil",
      subtitle: "Pesanan DjiwaApp Sudah Lunas",
      label: "DJIWAAPP · QRIS BERHASIL",
      className: "border-emerald-200 bg-emerald-50 text-emerald-950",
      Icon: CheckCircle2,
    };
  }
  return {
    title: "Pesanan Baru dari DjiwaApp",
    subtitle: "Menunggu Pembayaran di Kasir",
    label: "DJIWAAPP · BAYAR DI KASIR",
    className: "border-amber-200 bg-amber-50 text-amber-950",
    Icon: CreditCard,
  };
}

function TransactionAlert({ item, onOpenOrder, onDismiss }: { item: PosNotification; onOpenOrder: () => void; onDismiss: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, 30_000);
    return () => window.clearTimeout(timer);
  }, [onDismiss]);

  const copy = getAlertCopy(item);
  const Icon = copy.Icon;
  const payload = item.action_payload ?? {};
  const itemCount = Number(payload.itemCount ?? 0);
  const totalAmount = Number(payload.totalAmount ?? 0);
  const customerName = String(payload.customerName ?? "").trim();
  const summary = [customerName, itemCount > 0 ? `${itemCount} item${itemCount === 1 ? "" : "s"}` : "", totalAmount > 0 ? formatCurrency(totalAmount) : ""].filter(Boolean).join(" · ");

  return (
    <article className={`pointer-events-auto relative w-full max-w-[min(420px,calc(100vw-1.5rem))] rounded-2xl border p-3 shadow-xl backdrop-blur-sm ${copy.className}`}>
      <button type="button" onClick={onDismiss} aria-label="Tutup alert transaksi" className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-lg hover:bg-black/5">
        <X className="h-4 w-4" />
      </button>
      <button type="button" onClick={onOpenOrder} className="block w-full pr-8 text-left">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/75"><Icon className="h-5 w-5" /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-black leading-tight">{copy.title}</span>
            <span className="mt-0.5 block text-xs font-bold opacity-80">{copy.subtitle}</span>
            {item.order_number ? <span className="mt-2 block text-xs font-black">#{item.order_number}</span> : null}
            {summary ? <span className="mt-0.5 block text-xs opacity-80">{summary}</span> : null}
            <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-white/70 px-2 py-1 text-[9px] font-black tracking-wide">{copy.label} <ChevronRight className="h-3 w-3" /></span>
          </span>
        </div>
      </button>
    </article>
  );
}

export function TransactionAlertStack({ notifications, onOpenOrder, onDismiss }: TransactionAlertStackProps) {
  const alerts = getTransactionAlerts(notifications);
  if (alerts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[70] flex flex-col items-center gap-2 px-3 sm:inset-x-auto sm:right-4 sm:items-end sm:px-0" aria-live="polite" aria-label="Alert transaksi baru">
      {alerts.map((item) => (
        <TransactionAlert key={item.id} item={item} onOpenOrder={() => onOpenOrder(item)} onDismiss={() => onDismiss(item.id)} />
      ))}
    </div>
  );
}
