import { useCallback, useEffect, useMemo, useState } from "react";
import { useYumiAuth } from "@/hooks/useYumiAuth";

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pos-notifications`;
const VAPID_PUBLIC_KEY = String(import.meta.env.VITE_VAPID_PUBLIC_KEY ?? "").trim();

type PushStatusResponse = { subscribed?: boolean };

type PushSubscriptionPayload = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
}

async function pushRequest<T>(token: string, body: Record<string, unknown>) {
  const response = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.error) throw new Error(result.error || "Push notification gagal");
  return result as T;
}

function getSupportState() {
  return typeof window !== "undefined"
    && "serviceWorker" in navigator
    && "PushManager" in window
    && "Notification" in window
    && Boolean(VAPID_PUBLIC_KEY);
}

export function useAdminPush() {
  const { token, isAuthenticated } = useYumiAuth();
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supported = useMemo(getSupportState, []);

  const refresh = useCallback(async () => {
    if (!supported || !token || !isAuthenticated) return;
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        setIsSubscribed(false);
        return;
      }
      const result = await pushRequest<PushStatusResponse>(token, { action: "push_status", endpoint: subscription.endpoint });
      setIsSubscribed(Boolean(result.subscribed));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Status push gagal dimuat");
    }
  }, [isAuthenticated, supported, token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const enable = useCallback(async () => {
    if (!supported || !token || isBusy) return false;
    setIsBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Izin notifikasi perangkat belum diberikan");
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
      const json = subscription.toJSON() as PushSubscriptionPayload;
      await pushRequest(token, {
        action: "push_subscribe",
        endpoint: json.endpoint,
        keys: json.keys,
        userAgent: navigator.userAgent,
      });
      setIsSubscribed(true);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Push notification gagal diaktifkan");
      return false;
    } finally {
      setIsBusy(false);
    }
  }, [isBusy, supported, token]);

  const disable = useCallback(async () => {
    if (!token || isBusy) return false;
    setIsBusy(true);
    setError(null);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await pushRequest(token, { action: "push_unsubscribe", endpoint: subscription.endpoint });
        await subscription.unsubscribe();
      }
      setIsSubscribed(false);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Push notification gagal dimatikan");
      return false;
    } finally {
      setIsBusy(false);
    }
  }, [isBusy, token]);

  return { supported, isSubscribed, isBusy, error, enable, disable, refresh };
}
