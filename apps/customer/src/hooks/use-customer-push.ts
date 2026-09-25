import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useCustomerAuth } from "@/hooks/use-customer-auth";

export type CustomerPushState = "unsupported" | "default" | "denied" | "ready" | "subscribed";

function base64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const decoded = atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

function getPublicKey() {
  return String(import.meta.env.VITE_VAPID_PUBLIC_KEY ?? "").trim();
}

export function useCustomerPush() {
  const { isAuthenticated } = useCustomerAuth();
  const [state, setState] = useState<CustomerPushState>("unsupported");
  const [busy, setBusy] = useState(false);
  const supported = typeof window !== "undefined"
    && "Notification" in window
    && "serviceWorker" in navigator
    && "PushManager" in window;
  const publicKey = useMemo(getPublicKey, []);

  const getRegistration = useCallback(async () => navigator.serviceWorker.ready, []);

  const refresh = useCallback(async () => {
    if (!supported || !publicKey || !isAuthenticated) {
      setState(supported && isAuthenticated ? "ready" : "unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setState("denied");
      return;
    }
    if (Notification.permission !== "granted") {
      setState("default");
      return;
    }
    const subscription = await (await getRegistration()).pushManager.getSubscription();
    setState(subscription ? "subscribed" : "ready");
  }, [getRegistration, isAuthenticated, publicKey, supported]);

  useEffect(() => { void refresh(); }, [refresh]);

  const enable = useCallback(async () => {
    if (!supported || !publicKey || !isAuthenticated) return false;
    setBusy(true);
    try {
      const permission = Notification.permission === "granted"
        ? "granted"
        : await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "default");
        return false;
      }
      const registration = await getRegistration();
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64ToUint8Array(publicKey),
      });
      const response = await fetch("/api/customer/push/subscribe", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...subscription.toJSON(), userAgent: navigator.userAgent }),
      });
      if (!response.ok) throw new Error("Pendaftaran notifikasi gagal");
      setState("subscribed");
      toast.success("Notifikasi pesanan diaktifkan.");
      return true;
    } catch (error) {
      console.error("[customer-push] enable failed", error);
      toast.error("Notifikasi belum dapat diaktifkan. Coba lagi.");
      await refresh();
      return false;
    } finally {
      setBusy(false);
    }
  }, [getRegistration, isAuthenticated, publicKey, refresh, supported]);

  const disable = useCallback(async () => {
    if (!supported) return;
    setBusy(true);
    try {
      const registration = await getRegistration();
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) { setState("ready"); return; }
      await fetch("/api/customer/push/unsubscribe", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });
      await subscription.unsubscribe();
      setState("ready");
      toast.success("Notifikasi dimatikan di perangkat ini.");
    } catch (error) {
      console.error("[customer-push] disable failed", error);
      toast.error("Notifikasi belum dapat dimatikan.");
    } finally {
      setBusy(false);
    }
  }, [getRegistration, supported]);

  return { state, busy, supported: supported && Boolean(publicKey), enable, disable, refresh };
}
