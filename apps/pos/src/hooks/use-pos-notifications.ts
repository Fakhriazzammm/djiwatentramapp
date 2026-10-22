import { useCallback, useEffect, useMemo, useState } from "react";
import { useYumiAuth } from "@/hooks/useYumiAuth";
import { createClient } from "@/lib/client";

export type PosNotification = {
  id: string;
  notification_type: "order_cashier_pending" | "order_mayar_pending" | "order_paid" | "order_payment_failed" | "order_cancelled" | "admin_info" | "admin_briefing";
  priority: "normal" | "high" | "urgent";
  title: string;
  message: string;
  order_source_id?: string | null;
  order_number?: string | null;
  source?: string | null;
  action_type?: string | null;
  action_payload?: Record<string, unknown> | null;
  created_at: string;
  expires_at?: string | null;
  isRead: boolean;
  readAt?: string | null;
  acknowledgedAt?: string | null;
};

export function isDeliveryNotification(item: PosNotification | null | undefined) {
  const payload = item?.action_payload ?? {};
  const orderType = String(payload.orderType ?? payload.order_type ?? "").toLowerCase();
  return orderType === "delivery" || orderType.includes("delivery")
    || Boolean(payload.deliveryAddress ?? payload.delivery_address ?? payload.deliveryProvider ?? payload.shippingProvider);
}

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pos-notifications`;

async function callNotifications(token: string, payload: Record<string, unknown> = {}) {
  const response = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.error) throw new Error(result.error || "Gagal memuat notifikasi");
  return result;
}

export function usePosNotifications(orderRefreshKey?: string) {
  const { token } = useYumiAuth();
  const getEffectiveToken = useCallback(() => {
    if (token) return token;
    if (typeof window !== "undefined") return window.localStorage.getItem("yumi_session_token");
    return null;
  }, [token]);
  const [notifications, setNotifications] = useState<PosNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState<"connecting" | "connected" | "fallback">("connecting");

  const refresh = useCallback(async (syncOrders = true) => {
    const effectiveToken = getEffectiveToken();
    if (!effectiveToken) {
      setNotifications([]);
      setError("Sesi POS belum siap. Silakan tunggu sebentar atau login ulang.");
      setIsLoading(false);
      return;
    }
    try {
      setError(null);
      if (syncOrders) {
        try {
          await callNotifications(effectiveToken, { action: "sync_recent" });
        } catch (syncError) {
          console.warn("Gagal sinkronisasi order notifikasi; tetap memuat notifikasi admin", syncError);
        }
      }
      const result = await callNotifications(effectiveToken, { action: "list" });
      setNotifications(Array.isArray(result.notifications) ? result.notifications : []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Gagal memuat notifikasi");
    } finally {
      setIsLoading(false);
    }
  }, [getEffectiveToken]);

  useEffect(() => {
    void refresh(true);
    const supabase = createClient();
    const channel = supabase
      .channel(`pos-notifications-live:${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pos_notifications" },
        () => { void refresh(false); },
      );
    channel.subscribe((status: string) => {
      if (status === "SUBSCRIBED") setRealtimeStatus("connected");
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") setRealtimeStatus("fallback");
    });
    const timer = window.setInterval(() => void refresh(false), 15000);
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(false); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      void supabase.removeChannel(channel);
    };
  }, [refresh, orderRefreshKey]);

  const unreadCount = useMemo(() => notifications.filter((item) => !item.isRead).length, [notifications]);

  const removeNotification = useCallback(async (notificationId: string) => {
    const effectiveToken = getEffectiveToken();
    if (!effectiveToken) return;
    setNotifications((current) => current.filter((item) => item.id !== notificationId));
    try {
      await callNotifications(effectiveToken, { action: "dismiss", notificationId });
    } catch {
      void refresh(false);
    }
  }, [getEffectiveToken, refresh]);

  const markRead = useCallback(async (notificationId: string, acknowledge = false) => {
    const effectiveToken = getEffectiveToken();
    if (!effectiveToken) return;
    setNotifications((current) => current.map((item) => item.id === notificationId
      ? { ...item, isRead: true, readAt: new Date().toISOString(), acknowledgedAt: acknowledge ? new Date().toISOString() : item.acknowledgedAt }
      : item));
    try {
      await callNotifications(effectiveToken, { action: acknowledge ? "acknowledge" : "mark_read", notificationId });
    } catch {
      void refresh(false);
    }
  }, [getEffectiveToken, refresh]);

  return { notifications, unreadCount, isLoading, error, refresh, markRead, removeNotification, realtimeStatus };
}

export function useCreatePosAdminNotification() {
  const { token } = useYumiAuth();
  return useCallback(async (payload: Record<string, unknown>) => {
    if (!token) throw new Error("Sesi admin tidak tersedia");
    return callNotifications(token, { action: "create_admin", ...payload });
  }, [token]);
}

export function getNotificationOrderId(notification: PosNotification) {
  return String(notification.action_payload?.orderId ?? notification.order_source_id ?? "");
}
