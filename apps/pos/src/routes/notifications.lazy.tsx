import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { NotificationsScreen } from "@/components/pos-ios/notifications-screen";
import { OrderNotificationSheet } from "@/components/pos-ios/order-notification-sheet";
import { usePosNotifications, getNotificationOrderId, type PosNotification } from "@/hooks/use-pos-notifications";
import { triggerHybridRefresh, useHybridOrders } from "@/hooks/use-hybrid-pos-data";
import { useHybridUpdateOrder } from "@/hooks/use-hybrid-write-actions";

export const Route = createLazyFileRoute("/notifications")({
  component: NotificationsPage,
});

function NotificationsPage() {
  const navigate = useNavigate();
  const orders = useHybridOrders({ limit: 2000 });
  const updateOrder = useHybridUpdateOrder();
  const [selected, setSelected] = useState<PosNotification | null>(null);
  const paidInFlight = useRef<Set<string>>(new Set());
  const { notifications, isLoading, error, refresh, markRead, removeNotification, realtimeStatus } = usePosNotifications();

  // Aturan sama dengan panel notifikasi di halaman Menu: tandai lunas tunai kasir, lalu segarkan data.
  const markCashierPaid = useCallback(async (notification: PosNotification) => {
    const orderId = String(notification.action_payload?.orderId ?? notification.order_source_id ?? "");
    if (!orderId) return void toast.error("Order tidak ditemukan");
    if (paidInFlight.current.has(orderId)) return;
    paidInFlight.current.add(orderId);
    try {
      await updateOrder({ id: orderId, status: "paid", paymentMethod: "cash", paymentReceiptKind: "cashier" });
      if (!String(notification.id).startsWith("barcode:")) await removeNotification(notification.id);
      triggerHybridRefresh();
      window.setTimeout(() => triggerHybridRefresh(), 350);
      window.setTimeout(() => triggerHybridRefresh(), 1_200);
      await refresh(true);
      setSelected(null);
      toast.success("Pembayaran kasir berhasil dicatat");
    } catch (failure) {
      console.error("[cashier-paid] failed", failure);
      toast.error(failure instanceof Error ? failure.message : "Gagal mencatat pembayaran kasir");
    } finally {
      paidInFlight.current.delete(orderId);
    }
  }, [refresh, removeNotification, updateOrder]);

  return (
    <main className="mx-auto flex h-[100dvh] w-full max-w-xl flex-col bg-background text-foreground">
      <NotificationsScreen
        notifications={notifications}
        isLoading={isLoading}
        error={error}
        onRetry={() => refresh(true)}
        onRefresh={() => refresh(true)}
        onMarkRead={markRead}
        onDismiss={removeNotification}
        onOpenOrder={(notification) => {
          markRead(notification.id);
          setSelected(notification);
        }}
        onBack={() => navigate({ to: "/menu" })}
        title="Pusat Notifikasi"
        statusLabel={realtimeStatus === "connected" ? "Terhubung · realtime" : "Pembaruan berkala"}
      />
      <OrderNotificationSheet
        open={Boolean(selected)}
        order={selected ? (orders ?? []).find((order: any) => String(order._id ?? "") === getNotificationOrderId(selected) || String(order.orderNumber ?? "") === String(selected.order_number ?? "")) ?? null : null}
        notification={selected}
        onClose={() => setSelected(null)}
        onMarkCashierPaid={selected ? () => markCashierPaid(selected) : undefined}
      />
    </main>
  );
}
