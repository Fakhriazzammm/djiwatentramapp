import { useCallback, useEffect, useRef, useState } from "react";
import { useYumiAuth } from "@/hooks/useYumiAuth";

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pos-notifications`;

export type AdminNotification = {
	id: string;
	notification_type: string;
	priority: "normal" | "high" | "urgent" | string;
	title: string;
	message: string;
	action_type: string | null;
	action_payload: Record<string, unknown> | null;
	created_at: string;
	expires_at: string | null;
	is_active: boolean;
	isRead: boolean;
	readAt: string | null;
	acknowledgedAt: string | null;
};

type NotificationResponse = { notifications?: AdminNotification[] };
type NotificationAction = "mark_read" | "acknowledge" | "dismiss";

function notificationTime(value: string) {
	const timestamp = Date.parse(value);
	if (!Number.isFinite(timestamp)) return "Baru saja";
	const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
	if (minutes < 1) return "Baru saja";
	if (minutes < 60) return `${minutes} menit lalu`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours} jam lalu`;
	return `${Math.floor(hours / 24)} hari lalu`;
}

export function formatNotificationTime(value: string) {
	return notificationTime(value);
}

async function notificationRequest<T>(token: string, body: Record<string, unknown>): Promise<T> {
	const response = await fetch(FUNCTION_URL, {
		method: "POST",
		headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
		body: JSON.stringify(body),
	});
	const result = await response.json().catch(() => ({}));
	if (!response.ok || result.error) throw new Error(result.error || "Notifikasi gagal dimuat");
	return result as T;
}

export function useAdminNotifications() {
	const { token, isAuthenticated, isLoading } = useYumiAuth();
	const [notifications, setNotifications] = useState<AdminNotification[]>([]);
	const [isLoadingNotifications, setIsLoadingNotifications] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [popupNotification, setPopupNotification] = useState<AdminNotification | null>(null);
	const seenIdsRef = useRef<Set<string>>(new Set());
	const popupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const requestRef = useRef(false);

	useEffect(() => {
		if (typeof window === "undefined") return;
		try {
			const stored = JSON.parse(sessionStorage.getItem("admin-notification-seen-ids") ?? "[]");
			if (Array.isArray(stored)) seenIdsRef.current = new Set(stored.filter((value): value is string => typeof value === "string"));
		} catch {
			seenIdsRef.current = new Set();
		}
	}, []);

	const fetchNotifications = useCallback(async (silent = false) => {
		if (!isAuthenticated || !token || requestRef.current) return;
		requestRef.current = true;
		if (!silent) setIsLoadingNotifications(true);
		try {
			const result = await notificationRequest<NotificationResponse>(token, { action: "list" });
			const next = (result.notifications ?? [])
				.filter((notification) => notification.is_active && (!notification.expires_at || Date.parse(notification.expires_at) > Date.now()))
				.sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at));
			const unread = next.filter((notification) => !notification.isRead);
			const newUnread = unread.filter((notification) => !seenIdsRef.current.has(notification.id));
			next.forEach((notification) => seenIdsRef.current.add(notification.id));
			if (typeof window !== "undefined") {
				const recentSeen = Array.from(seenIdsRef.current).slice(-200);
				sessionStorage.setItem("admin-notification-seen-ids", JSON.stringify(recentSeen));
			}
			if (newUnread.length > 0) {
				if (popupTimerRef.current) clearTimeout(popupTimerRef.current);
				setPopupNotification(newUnread[0]);
				popupTimerRef.current = setTimeout(() => setPopupNotification(null), 6500);
			}
			setNotifications(next);
			setError(null);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Notifikasi gagal dimuat");
		} finally {
			requestRef.current = false;
			setIsLoadingNotifications(false);
		}
	}, [isAuthenticated, token]);

	useEffect(() => {
		if (isLoading || !isAuthenticated) return;
		void fetchNotifications();
		const interval = window.setInterval(() => void fetchNotifications(true), 45000);
		return () => {
			window.clearInterval(interval);
			if (popupTimerRef.current) clearTimeout(popupTimerRef.current);
		};
	}, [fetchNotifications, isAuthenticated, isLoading]);

	const runAction = useCallback(async (action: NotificationAction, notificationId: string) => {
		if (!token) return;
		await notificationRequest(token, { action, notificationId });
		setNotifications((current) => current.map((notification) => notification.id === notificationId
			? { ...notification, isRead: true, readAt: new Date().toISOString(), ...(action === "acknowledge" ? { acknowledgedAt: new Date().toISOString() } : {}) }
			: notification));
		setPopupNotification((current) => current?.id === notificationId ? null : current);
	}, [token]);

	const markRead = useCallback((notificationId: string) => runAction("mark_read", notificationId), [runAction]);
	const dismiss = useCallback((notificationId: string) => runAction("dismiss", notificationId), [runAction]);
	const markAllRead = useCallback(async () => {
		const unread = notifications.filter((notification) => !notification.isRead);
		await Promise.all(unread.map((notification) => runAction("mark_read", notification.id)));
	}, [notifications, runAction]);
	const closePopup = useCallback(() => {
		if (popupTimerRef.current) clearTimeout(popupTimerRef.current);
		setPopupNotification(null);
	}, []);

	return {
		notifications,
		unreadCount: notifications.filter((notification) => !notification.isRead).length,
		isLoading: isLoadingNotifications,
		error: error,
		popupNotification,
		fetchNotifications,
		markRead,
		markAllRead,
		dismiss,
		closePopup,
	};
}
