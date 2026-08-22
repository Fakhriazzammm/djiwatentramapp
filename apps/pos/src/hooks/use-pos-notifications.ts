import { useCallback, useEffect, useMemo, useState } from "react";
import { useYumiAuth } from "@/hooks/useYumiAuth";

export type PosNotification = {
  id: string;
  notification_type: "order_cashier_pending" | "order_mayar_pending" | "order_paid" | "admin_info" | "admin_briefing";
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
    const timer = window.setInterval(() => void refresh(true), 15000);
    return () => window.clearInterval(timer);
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

  return { notifications, unreadCount, isLoading, error, refresh, markRead, removeNotification };
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
