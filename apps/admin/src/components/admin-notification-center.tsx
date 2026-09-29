import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Bell, Check, ChevronRight, X } from "lucide-react";
import { toast } from "sonner";
import { Djiwa3DIcon } from "@yumipos/web-shared";
import {
	formatNotificationTime,
	type AdminNotification,
	useAdminNotifications,
} from "@/hooks/use-admin-notifications";
import { useAdminPush } from "@/hooks/use-admin-push";

const spring = { type: "spring" as const, stiffness: 360, damping: 28, mass: 0.7 };

function notificationTone(notification: AdminNotification) {
	if (notification.priority === "urgent") return "bg-rose-50 text-rose-700";
	if (notification.priority === "high") return "bg-amber-50 text-amber-700";
	return "bg-primary/10 text-primary";
}

function notificationRoute(notification: AdminNotification) {
	const payload = notification.action_payload ?? {};
	if (notification.action_type === "open_order") return "/admin/orders";
	if (notification.action_type === "open_inventory") return "/admin/inventory";
	if (notification.action_type === "open_shift") return "/admin/finance/shift-reports";
	if (notification.action_type === "open_finance") return "/admin/finance/transactions";
	if (notification.action_type === "open_approval") return "/admin/finance";
	if (typeof payload.route === "string" && payload.route.startsWith("/admin/")) return payload.route;
	return null;
}

function NotificationRow({ notification, onOpen }: { notification: AdminNotification; onOpen: (notification: AdminNotification) => void }) {
	const reduceMotion = useReducedMotion();
	return (
		<motion.button
			type="button"
			initial={reduceMotion ? false : { opacity: 0, y: 5 }}
			animate={{ opacity: 1, y: 0 }}
			transition={spring}
			whileTap={reduceMotion ? undefined : { scale: 0.985 }}
			onClick={() => onOpen(notification)}
			className={`flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-muted/70 ${notification.isRead ? "opacity-65" : "bg-primary/[0.035]"}`}
		>
			<span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${notificationTone(notification)}`}>
				{notification.isRead ? <Check className="h-3 w-3" /> : <Bell className="h-3 w-3" />}
			</span>
			<span className="min-w-0 flex-1">
				<span className="flex items-center gap-1.5">
					<span className="truncate text-[11px] font-bold text-foreground">{notification.title}</span>
					{!notification.isRead && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-label="Belum dibaca" />}
				</span>
				<span className="mt-0.5 block truncate text-[10px] text-muted-foreground">{notification.message}</span>
				<span className="mt-1 block text-[9px] text-muted-foreground/80">{formatNotificationTime(notification.created_at)}</span>
			</span>
			<ChevronRight className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
		</motion.button>
	);
}

export function AdminNotificationCenter({ onNavigate }: { onNavigate: (path: string) => void }) {
	const reduceMotion = useReducedMotion();
	const {
		notifications,
		unreadCount,
		isLoading,
		error,
		popupNotification,
		markRead,
		markAllRead,
		closePopup,
	} = useAdminNotifications();
	const { supported: pushSupported, isSubscribed: pushSubscribed, isBusy: pushBusy, enable: enablePush } = useAdminPush();
	const [isOpen, setIsOpen] = useState(false);
	const [isMobile, setIsMobile] = useState(false);
	const [iconFailed, setIconFailed] = useState(false);

	useEffect(() => {
		const media = window.matchMedia("(max-width: 767px)");
		const sync = () => setIsMobile(media.matches);
		sync();
		media.addEventListener("change", sync);
		return () => media.removeEventListener("change", sync);
	}, []);

	const openNotification = async (notification: AdminNotification) => {
		if (!notification.isRead) await markRead(notification.id).catch(() => toast.error("Notifikasi gagal ditandai"));
		setIsOpen(false);
		const route = notificationRoute(notification);
		if (route) onNavigate(route);
	};

	return (
		<div className="relative">
			<motion.button
				type="button"
				aria-label={unreadCount > 0 ? `${unreadCount} notifikasi belum dibaca` : "Notifikasi"}
				aria-expanded={isOpen}
				onClick={() => {
					if (isMobile) {
						onNavigate("/admin/notifications");
						return;
					}
					setIsOpen((current) => !current);
				}}
				whileTap={reduceMotion ? undefined : { scale: 0.94 }}
				className="relative flex h-10 w-10 items-center justify-center rounded-full bg-primary/5 transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
			>
				<motion.span
					animate={unreadCount > 0 && !reduceMotion ? { rotate: [0, -7, 7, -4, 0] } : { rotate: 0 }}
					transition={unreadCount > 0 && !reduceMotion ? { duration: 0.7, delay: 0.15 } : spring}
					className="flex h-7 w-7 items-center justify-center"
				>
					{iconFailed ? <Bell aria-hidden="true" className="h-5 w-5 text-primary" /> : <Djiwa3DIcon name="notifications-alerts" size="micro" alt="" onError={() => setIconFailed(true)} className="h-6 w-6 object-contain" />}
				</motion.span>
				{unreadCount > 0 && <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[9px] font-black leading-none text-white ring-2 ring-card">{unreadCount > 9 ? "9+" : unreadCount}</span>}
			</motion.button>

			<AnimatePresence>
				{isOpen && (
					<motion.div
						initial={reduceMotion ? false : { opacity: 0, y: -5, scale: 0.98 }}
						animate={{ opacity: 1, y: 0, scale: 1 }}
						exit={reduceMotion ? undefined : { opacity: 0, y: -4, scale: 0.98 }}
						transition={spring}
						className="absolute left-1/2 right-auto top-1 z-[9999] w-[min(340px,calc(100vw-24px))] -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-card shadow-[0_18px_48px_rgba(9,9,11,0.16)] sm:left-auto sm:right-0 sm:translate-x-0"
					>
						<div className="flex items-center justify-between border-b border-border/70 px-3 py-2">
							<div><p className="text-xs font-black">Notifikasi</p><p className="text-[10px] text-muted-foreground">{unreadCount ? `${unreadCount} belum dibaca` : "Semua sudah dibaca"}</p></div>
							{unreadCount > 0 && <button type="button" onClick={() => void markAllRead().catch(() => toast.error("Gagal menandai semua"))} className="text-[10px] font-bold text-primary hover:underline">Tandai semua</button>}
						</div>
						{pushSupported && !pushSubscribed && (
							<button type="button" disabled={pushBusy} onClick={() => void enablePush()} className="mx-1.5 mt-1.5 flex w-[calc(100%-12px)] items-center justify-between rounded-lg bg-primary/[0.06] px-2.5 py-2 text-left text-[10px] font-semibold text-primary disabled:opacity-60">
								<span>Dapatkan notifikasi saat app tertutup</span><span>{pushBusy ? "Menyiapkan..." : "Aktifkan"}</span>
							</button>
						)}
						<div className="max-h-[min(360px,calc(100dvh-150px))] overflow-y-auto p-1.5">
							{isLoading && notifications.length === 0 ? <div className="space-y-1.5 p-1"><div className="h-11 animate-pulse rounded-lg bg-muted" /><div className="h-11 animate-pulse rounded-lg bg-muted" /></div> : error && notifications.length === 0 ? <div className="p-4 text-center text-[11px] text-muted-foreground"><p>Notifikasi gagal dimuat.</p><button type="button" onClick={() => window.location.reload()} className="mt-1 font-bold text-primary">Coba lagi</button></div> : notifications.length === 0 ? <div className="p-5 text-center text-[11px] text-muted-foreground">Tidak ada notifikasi penting</div> : notifications.slice(0, 8).map((notification) => <NotificationRow key={notification.id} notification={notification} onOpen={openNotification} />)}
						</div>
					</motion.div>
				)}
			</AnimatePresence>

			<AnimatePresence>
				{popupNotification && !isMobile && !isOpen && (
					<motion.div
						initial={reduceMotion ? false : { opacity: 0, y: -8, scale: 0.96 }}
						animate={{ opacity: 1, y: 0, scale: 1 }}
						exit={reduceMotion ? undefined : { opacity: 0, y: -5, scale: 0.98 }}
						transition={spring}
						className="fixed right-4 top-2 z-[10000] w-[min(320px,calc(100vw-24px))] rounded-2xl border border-primary/15 bg-card p-2.5 shadow-[0_14px_34px_rgba(9,9,11,0.16)]"
					>
						<div className="flex items-start gap-2">
							<span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${notificationTone(popupNotification)}`}><Djiwa3DIcon name="notifications-alerts" size="micro" alt="" className="h-5 w-5 object-contain" /></span>
							<button type="button" aria-label="Tutup popup notifikasi" onClick={closePopup} className="absolute right-1.5 top-1.5 rounded-md p-1 text-muted-foreground hover:bg-muted"><X className="h-3.5 w-3.5" /></button>
							<button type="button" onClick={() => void openNotification(popupNotification)} className="min-w-0 flex-1 pr-4 text-left"><p className="truncate text-[11px] font-black">{popupNotification.title}</p><p className="mt-0.5 truncate text-[10px] text-muted-foreground">{popupNotification.message}</p><p className="mt-1 text-[9px] font-semibold text-primary">Buka detail · {formatNotificationTime(popupNotification.created_at)}</p></button>
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}
