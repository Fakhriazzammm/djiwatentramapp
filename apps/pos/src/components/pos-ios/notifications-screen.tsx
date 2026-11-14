import { getDisplayOrderNumber } from "@djiwaapps/web-shared/lib/order-number";
import { AnimatePresence, motion, useMotionValue, useTransform } from "framer-motion";
import { AlertTriangle, ArrowLeft, Bell, Check, CreditCard, Info, Megaphone, RefreshCw, WalletCards, X } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import type { PosNotification } from "@/hooks/use-pos-notifications";
import { cn } from "@/lib/utils";
import { IOS_SPRING, IOS_SPRING_SOFT, IosChip, IosSegmented, IosSheet, StatusPill, type StatusTone } from "./ios-kit";

type Tab = "all" | "orders" | "admin";
type Filter = "all" | "unread" | "payment";

export function formatAge(value: string): string {
	const minutes = Math.floor(Math.max(0, Date.now() - Date.parse(value)) / 60000);
	if (minutes < 1) return "Baru saja";
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours} jam lalu`;
	return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short" }).format(new Date(value));
}

interface Meta { Icon: typeof Bell; label: string; tone: StatusTone }
export function notificationMeta(item: PosNotification): Meta {
	switch (item.notification_type) {
		case "order_cashier_pending": return { Icon: WalletCards, label: "Bayar di kasir", tone: "info" };
		case "order_mayar_pending": return { Icon: CreditCard, label: "Menunggu DjiwaApp", tone: "warn" };
		case "order_payment_failed": return { Icon: AlertTriangle, label: "Pembayaran gagal", tone: "bad" };
		case "order_cancelled": return { Icon: X, label: "Dibatalkan", tone: "bad" };
		case "order_paid": return { Icon: Check, label: "Lunas", tone: "ok" };
		case "admin_briefing": return { Icon: Megaphone, label: "Briefing admin", tone: "info" };
		default: return { Icon: Info, label: "Info admin", tone: "info" };
	}
}
const TONE_TILE: Record<StatusTone, string> = { ok: "bg-emerald-50 text-emerald-700", warn: "bg-amber-50 text-amber-700", info: "bg-primary/10 text-primary", bad: "bg-rose-50 text-rose-700", neutral: "bg-muted text-muted-foreground" };

function isSameDay(a: number, b: number) {
	return new Date(a).toDateString() === new Date(b).toDateString();
}

function SwipeRow({ children, onMarkRead, onDismiss, onTap, canMarkRead }: { children: ReactNode; onMarkRead: () => void; onDismiss: () => void; onTap: () => void; canMarkRead: boolean }) {
	const x = useMotionValue(0);
	const readOpacity = useTransform(x, [0, 70], [0, 1]);
	const delOpacity = useTransform(x, [0, -70], [0, 1]);
	return (
		<motion.div layout exit={{ opacity: 0, height: 0 }} transition={IOS_SPRING_SOFT} className="relative overflow-hidden border-b border-border/70">
			<motion.div style={{ opacity: readOpacity }} className="absolute inset-y-0 left-0 flex w-1/2 items-center bg-primary pl-5 text-[13px] font-bold text-primary-foreground" aria-hidden="true">{canMarkRead ? "Dibaca" : ""}</motion.div>
			<motion.div style={{ opacity: delOpacity }} className="absolute inset-y-0 right-0 flex w-1/2 items-center justify-end bg-rose-600 pr-5 text-[13px] font-bold text-white" aria-hidden="true">Hapus</motion.div>
			<motion.div
				drag="x"
				dragConstraints={{ left: 0, right: 0 }}
				dragElastic={{ left: 0.45, right: canMarkRead ? 0.45 : 0 }}
				dragSnapToOrigin
				style={{ x }}
				onDragEnd={(_, info) => {
					if (info.offset.x > 85 && canMarkRead) onMarkRead();
					else if (info.offset.x < -85) onDismiss();
				}}
				onTap={onTap}
				className="relative cursor-pointer bg-background"
			>
				{children}
			</motion.div>
		</motion.div>
	);
}

export interface NotificationsScreenProps {
	notifications: PosNotification[];
	isLoading: boolean;
	error: string | null;
	onRetry: () => void | Promise<void>;
	onRefresh: () => void | Promise<void>;
	onMarkRead: (id: string, acknowledge?: boolean) => void | Promise<void>;
	onDismiss: (id: string) => void | Promise<void>;
	onOpenOrder: (notification: PosNotification) => void;
	onBack?: () => void;
	statusLabel?: string;
	title?: string;
}

/** Inbox notifikasi gaya iOS Mail: grup Baru / Hari ini / Sebelumnya, swipe untuk tandai dibaca atau hapus. */
export function NotificationsScreen({ notifications, isLoading, error, onRetry, onRefresh, onMarkRead, onDismiss, onOpenOrder, onBack, statusLabel, title = "Notifikasi" }: NotificationsScreenProps) {
	const [tab, setTab] = useState<Tab>("all");
	const [filter, setFilter] = useState<Filter>("all");
	const [refreshing, setRefreshing] = useState(false);
	const [notice, setNotice] = useState<PosNotification | null>(null);

	const unread = notifications.filter((item) => !item.isRead).length;
	const visible = useMemo(
		() =>
			notifications.filter((item) => {
				if (tab === "orders" && !item.notification_type.startsWith("order_")) return false;
				if (tab === "admin" && !item.notification_type.startsWith("admin_")) return false;
				if (filter === "unread" && item.isRead) return false;
				if (filter === "payment" && !item.notification_type.includes("payment") && item.notification_type !== "order_paid" && item.notification_type !== "order_cashier_pending" && item.notification_type !== "order_mayar_pending") return false;
				return true;
			}),
		[notifications, tab, filter],
	);
	const groups = useMemo(() => {
		const now = Date.now();
		const fresh = visible.filter((item) => !item.isRead);
		const today = visible.filter((item) => item.isRead && isSameDay(Date.parse(item.created_at), now));
		const older = visible.filter((item) => item.isRead && !isSameDay(Date.parse(item.created_at), now));
		return [
			{ key: "Baru", items: fresh },
			{ key: "Hari ini", items: today },
			{ key: "Sebelumnya", items: older },
		].filter((group) => group.items.length > 0);
	}, [visible]);

	const refresh = async () => {
		setRefreshing(true);
		try { await onRefresh(); } finally { setTimeout(() => setRefreshing(false), 400); }
	};
	const open = (item: PosNotification) => {
		void onMarkRead(item.id);
		if (item.notification_type.startsWith("order_")) onOpenOrder(item);
		else setNotice(item);
	};

	return (
		<div className="flex min-h-0 flex-1 flex-col bg-background">
			<div className="flex items-center gap-2.5 px-4 pb-2 pt-3">
				{onBack ? <motion.button type="button" whileTap={{ scale: 0.9 }} onClick={onBack} aria-label="Kembali ke POS" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-muted"><ArrowLeft className="h-5 w-5" /></motion.button> : null}
				<div className="min-w-0 flex-1">
					<h1 className="text-[22px] font-extrabold leading-tight tracking-tight">{title}</h1>
					{statusLabel ? <p className="text-[12px] text-muted-foreground">{statusLabel}</p> : null}
				</div>
				<motion.button type="button" whileTap={{ scale: 0.94 }} onClick={() => void refresh()} disabled={isLoading || refreshing} className="flex h-10 items-center gap-1.5 rounded-full bg-muted px-3.5 text-[13px] font-bold disabled:opacity-60"><RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} aria-hidden="true" />Segarkan</motion.button>
			</div>
			<div className="px-4">
				<IosSegmented id="notif-tab" value={tab} onChange={setTab} options={[{ value: "all", label: <>Semua{unread > 0 ? <motion.span key={unread} initial={{ scale: 1.4 }} animate={{ scale: 1 }} transition={IOS_SPRING} className="ml-1.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10.5px] font-extrabold text-white">{unread}</motion.span> : null}</> }, { value: "orders", label: "Pesanan" }, { value: "admin", label: "Admin" }]} />
			</div>
			<div className="flex gap-2 overflow-x-auto px-4 py-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
				{([["all", "Semua"], ["unread", "Belum dibaca"], ["payment", "Pembayaran"]] as const).map(([value, label]) => <IosChip key={value} active={filter === value} onClick={() => setFilter(value)}>{label}</IosChip>)}
			</div>

			<div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[calc(1rem+env(safe-area-inset-bottom))]">
				{isLoading && notifications.length === 0 ? [1, 2, 3, 4].map((i) => <div key={i} className="mx-4 my-2 h-[60px] animate-pulse rounded-2xl bg-muted" />) : null}
				{!isLoading && error ? (
					<div role="alert" className="mx-4 mt-2 rounded-2xl bg-rose-50 p-4 text-[14px] text-rose-800">
						<p className="font-bold">Notifikasi belum dapat dimuat.</p>
						<p className="mt-0.5 text-[13px]">{error}</p>
						<button type="button" onClick={() => void onRetry()} className="mt-3 h-10 rounded-xl bg-rose-600 px-4 text-[13px] font-bold text-white">Coba lagi</button>
					</div>
				) : null}
				{!isLoading && !error && visible.length === 0 ? (
					<motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center px-6 py-16 text-center">
						<Bell className="mb-3 h-10 w-10 text-muted-foreground/30" aria-hidden="true" />
						<p className="text-[15px] font-bold text-muted-foreground">Tidak ada notifikasi</p>
						<p className="mt-1 text-[13px] text-muted-foreground/80">{filter === "unread" ? "Semua sudah dibaca." : "Notifikasi pesanan dan pengumuman admin akan muncul di sini."}</p>
					</motion.div>
				) : null}
				{groups.map((group) => (
					<section key={group.key} aria-label={group.key}>
						<div className="flex items-center justify-between px-4 pb-1.5 pt-4 text-[11px] font-bold tracking-[0.08em] text-muted-foreground">
							<span>{group.key.toUpperCase()}</span>
							{group.key === "Baru" ? <button type="button" onClick={() => group.items.forEach((item) => void onMarkRead(item.id))} className="text-[12px] font-bold normal-case tracking-normal text-primary">Tandai semua dibaca</button> : null}
						</div>
						<AnimatePresence initial={false}>
							{group.items.map((item) => {
								const meta = notificationMeta(item);
								const orderNo = item.order_number ? `#${getDisplayOrderNumber(item.order_number, { sequence: (item as any).daily_receipt_no, createdAt: (item as any).created_at, source: item.source })}` : null;
								return (
									<SwipeRow key={item.id} canMarkRead={!item.isRead} onMarkRead={() => void onMarkRead(item.id)} onDismiss={() => void onDismiss(item.id)} onTap={() => open(item)}>
										<div className="flex items-start gap-3 px-4 py-3">
											<span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", TONE_TILE[meta.tone])}><meta.Icon className="h-[18px] w-[18px]" aria-hidden="true" /></span>
											<div className="min-w-0 flex-1">
												<div className="flex items-baseline justify-between gap-2">
													<p className={cn("truncate text-[14px]", item.isRead ? "font-semibold" : "font-extrabold")}>{item.title}</p>
													<span className="shrink-0 text-[12px] font-semibold text-muted-foreground">{formatAge(item.created_at)}</span>
												</div>
												<p className="mt-0.5 line-clamp-1 text-[13px] text-muted-foreground">{orderNo ? `${orderNo} · ` : ""}{item.message}</p>
											</div>
											<motion.span animate={{ scale: item.isRead ? 0 : 1, opacity: item.isRead ? 0 : 1 }} transition={IOS_SPRING} className="mt-1.5 h-[9px] w-[9px] shrink-0 rounded-full bg-primary" aria-label={item.isRead ? undefined : "Belum dibaca"} />
										</div>
									</SwipeRow>
								);
							})}
						</AnimatePresence>
					</section>
				))}
			</div>

			<IosSheet open={Boolean(notice)} onClose={() => setNotice(null)} title={notice?.title} heightClass="max-h-[70dvh]" footer={notice ? (
				<div className="flex gap-2.5">
					<button type="button" onClick={() => setNotice(null)} className="h-12 flex-1 rounded-2xl bg-muted text-[15px] font-bold">Tutup</button>
					{notice.notification_type === "admin_briefing" && !notice.acknowledgedAt ? <motion.button type="button" whileTap={{ scale: 0.97 }} onClick={() => { void onMarkRead(notice.id, true); setNotice(null); }} className="h-12 flex-[1.4] rounded-2xl bg-primary text-[15px] font-bold text-primary-foreground">Mengerti</motion.button> : null}
				</div>
			) : undefined}>
				{notice ? (
					<div className="pb-2">
						<div className="mb-3 flex items-center gap-2"><StatusPill tone={notificationMeta(notice).tone}>{notificationMeta(notice).label}</StatusPill><span className="text-[12px] text-muted-foreground">{formatAge(notice.created_at)}</span></div>
						<p className="whitespace-pre-wrap text-[15px] leading-relaxed">{notice.message}</p>
					</div>
				) : null}
			</IosSheet>
		</div>
	);
}
