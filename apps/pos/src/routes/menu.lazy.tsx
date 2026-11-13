import { useManualStockMode } from "@yumipos/web-shared/lib/manual-stock";
﻿import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import type { Id } from "@/types/backend-compat";
import {
	BarChart3,
	Bell,
	Bot,
	Check,
	Clock,
	Coffee,
	FileText,
	Minus,
	Package,
	Plus,
	Search,
	Settings2,
	ShoppingBag,
	ShoppingCart,
	ScanLine,
	Wallet,
	X,
	Printer,
	User,
	TrendingUp,
	ChevronUp,
	ChevronDown,
	ClipboardList,
	Receipt,
	MoreHorizontal,
	ShieldCheck,
} from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { MenuSidebar } from "@/components/pos/menu-sidebar";
import { CartDrawer } from "@/components/pos/cart-drawer";
import { CheckoutSidebar } from "@/components/pos/checkout-sidebar";
import { BarcodeTransactionScanner } from "@/components/pos/barcode-transaction-scanner";
import { getDisplayOrderNumber } from "@yumipos/web-shared/lib/order-number";
import { PaymentConfirmationModal } from "@/components/pos/payment-modal";
import {
	useHybridActiveDiscounts,
	useHybridAllDiscounts,
	useHybridCategories,
	useHybridCurrentMonthProgress,
	useHybridOrders,
	useHybridOrderStatus,
	useHybridShiftStatus,
	useHybridProducts,
	useHybridAllProducts,
	useHybridStaffRoles,
	useHybridStaffUsers,
	useHybridSiteSettings,
} from "@/hooks/use-hybrid-pos-data";
import { triggerHybridRefresh } from "@/hooks/use-hybrid-pos-data";
import { useHybridMayarConfig } from "@/hooks/use-hybrid-ops-data";
import {
	useHybridCreateOrder,
	useHybridMayarCreateInvoice,
	useHybridUpdateOrder,
} from "@/hooks/use-hybrid-write-actions";
import { useCart } from "@/context/cart-context";
import { calculateEffectivePrice } from "@/lib/utils/pricing";
import {
	bluetoothPrinter,
	type OrderItem,
	type ReceiptPrintMode,
} from "@/lib/bluetooth-printer";
import { cn } from "@/lib/utils";
import { getOfflineManager, queueOfflineAction } from "@/lib/offline-manager";
import {
	buildReceiptMetaFromCart,
	buildReceiptMetaFromOrder,
} from "@/lib/receipt-data";
import { enqueueTransactionVoice } from "@/lib/transaction-voice-queue";
import { resolveTransactionVoice } from "@/lib/transaction-voice-resolver";
import { NotificationsScreen } from "@/components/pos-ios/notifications-screen";
import { OrderNotificationSheet } from "@/components/pos-ios/order-notification-sheet";
import { IosSheet } from "@/components/pos-ios/ios-kit";
import { TransactionAlertStack } from "@/components/pos/transaction-alert-popup";
import { DeliveryCustomerQueue } from "@/components/pos/delivery-customer-queue";
import { usePosNotifications } from "@/hooks/use-pos-notifications";
import { createClient } from "@/lib/client";
import { MenuScreen, type MenuProductVM } from "@/components/pos-ios/menu-screen";
import { QueueSheet, useProductionQueue } from "@/components/pos-ios/queue-sheet";
import { BonusSheet, type BonusVM } from "@/components/pos-ios/bonus-sheet";
import { ProductOptionsSheet } from "@/components/pos-ios/product-options-sheet";
import { MarketingInfoStrip } from "@/components/pos/marketing-info-strip";
import { StockToolbarPanel } from "@/components/pos/stock-toolbar-panel";
import { StockTutorial, shouldShowStockTutorial } from "@/components/pos/stock-tutorial";
import { Djiwa3DIcon, type Djiwa3DIconName } from "@yumipos/web-shared";
import { getAdditionalOrderDiscount } from "@yumipos/web-shared/lib/order-pricing";
import { calculateOrderTax } from "@yumipos/web-shared/lib/tax-calculator";
import { canAccessAdminRoute } from "@/lib/route-metadata";
import { useYumiAuth } from "@/hooks/useYumiAuth";
import { usePosPanel } from "@/hooks/use-pos-panel";
import { getShiftClosingTasks, type PosPanel } from "@/lib/pos-panels";
import type { CheckoutSubmissionResult } from "@/lib/pos-checkout";
import { OfflineSyncCenter } from "@/components/pos/offline-sync-center";
import { PosWorkspaceMenu, PosReadinessSheet, type WorkspaceAction } from "@/components/pos/pos-workspace-menu";
import { getOrderRequestKey, clearOrderRequestKey, readPendingCheckoutRecovery, type CheckoutRecoveryRequest } from "@/lib/pos-order-request";

const fmt = (n: number) =>
	new Intl.NumberFormat("id-ID", {
		style: "currency",
		currency: "IDR",
		maximumFractionDigits: 0,
	}).format(n);

type BonusBasis = "shift" | "daily" | "monthly";
type BonusTier = { thresholdPct: number; bonusAmount: number };
type RoleBonusConfig = {
	roleName: string;
	basis: BonusBasis;
	tiers: BonusTier[];
};

type MemberBonusSummary = {
	memberName: string;
	roleName: string;
	basis: BonusBasis;
	achievementPct: number;
	achievedBonus: number;
	reachedThresholds: number[];
	nextTier: BonusTier | null;
	allTiers: BonusTier[];
};

function normalizePersonName(value?: string | null) {
	return (value || "").trim().toLowerCase();
}

function resolveProductionTrack(
	item: any,
	products: any[] | undefined,
	categories: any[] | undefined
): "bar" | "kitchen" {
	const product = products?.find((candidate) => String(candidate?._id ?? candidate?.id) === String(item?.productId));
	const categoryId = item?.categoryId ?? item?.category ?? product?.categoryId;
	const category = categories?.find((candidate) => String(candidate?._id ?? candidate?.id) === String(categoryId));
	const rawTrack = item?.track ?? item?.categoryTrack ?? product?.track ?? category?.track;
	const normalized = String(rawTrack ?? item?.category ?? category?.name ?? "").trim().toLowerCase();

	if (normalized === "bar" || normalized.includes("barista") || normalized.includes("minum") || normalized.includes("drink") || normalized.includes("beverage")) {
		return "bar";
	}
	return "kitchen";
}

function normalizeRoleBonusConfig(role: any): RoleBonusConfig | null {
	const config = role?.bonusTargetConfig;
	if (!config?.basis || !Array.isArray(config?.tiers)) return null;
	const basis = config.basis as BonusBasis;
	if (basis !== "shift" && basis !== "daily" && basis !== "monthly") return null;

	const tiers = config.tiers
		.map((tier: any) => ({
			thresholdPct: Number(tier?.thresholdPct ?? 0),
			bonusAmount: Number(tier?.bonusAmount ?? 0),
		}))
		.filter((tier: BonusTier) => tier.thresholdPct > 0)
		.sort((a: BonusTier, b: BonusTier) => a.thresholdPct - b.thresholdPct);

	if (tiers.length === 0) return null;

	return {
		roleName: role?.name || "Role",
		basis,
		tiers,
	};
}

function summarizeRoleBonus(achievementPct: number, config: RoleBonusConfig) {
	const safePct = Number.isFinite(achievementPct) ? Math.max(achievementPct, 0) : 0;
	const reached = config.tiers.filter((tier) => safePct >= tier.thresholdPct);
	const nextTier = config.tiers.find((tier) => safePct < tier.thresholdPct) ?? null;
	const achievedBonus = reached.reduce((sum, tier) => sum + tier.bonusAmount, 0);

	return {
		roleName: config.roleName,
		achievementPct: safePct,
		achievedBonus,
		reachedThresholds: reached.map((tier) => tier.thresholdPct),
		nextTier,
		allTiers: config.tiers,
	};
}

const AUTO_PRINTED_CUSTOMER_ORDERS_KEY = "pos_auto_printed_customer_orders_v1";

export const Route = createLazyFileRoute("/menu")({
	component: MenuPage,
});

// Menu Sidebar items for the header
const SIDEBAR_MENU_ITEMS = [
	{ id: "dashboard", label: "Dashboard", icon: BarChart3 },
	{ id: "transaksi", label: "Transaksi", icon: Receipt },
	{ id: "kas", label: "Kas", icon: Wallet },
	{ id: "antrian", label: "Antrian", icon: ClipboardList },
	{ id: "stok", label: "Stok", icon: Package },
	{ id: "yumi", label: "Chat AI", icon: Bot },
	{ id: "settings", label: "Pengaturan", icon: Settings2 },
];

const BOTTOM_NAV_ITEMS = [
	SIDEBAR_MENU_ITEMS[0],
	{ id: "transaksi", label: "Transaksi", icon: Receipt, illustration: "order-receipt" as Djiwa3DIconName },
	SIDEBAR_MENU_ITEMS.find((item) => item.id === "kas")!,
	SIDEBAR_MENU_ITEMS.find((item) => item.id === "antrian")!,
];

const BOTTOM_NAV_3D_ICONS: Record<string, Djiwa3DIconName> = {
	dashboard: "dashboard-overview",
	transaksi: "order-receipt",
	kas: "payment-wallet",
	antrian: "order-queue",
};

const BOTTOM_NAV_REPORT_ICON: Djiwa3DIconName = "sales-report";

const INITIAL_PRODUCTS_BATCH = 12;
const LOAD_MORE_PRODUCTS_BATCH = 8;
const LOAD_MORE_DELAY_MS = 180;

type ShiftSchedule = {
	name: string;
	openTime?: string;
	closeTime?: string;
};

function parseTimeToMinutes(time?: string) {
	if (!time || !time.includes(":")) return null;
	const [hours, minutes] = time.split(":").map(Number);
	if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
	return hours * 60 + minutes;
}

function isHappyHourCurrentlyActive(discounts: any[] | undefined, now: Date) {
	const currentDay = now.getDay();
	const currentMinutes = now.getHours() * 60 + now.getMinutes();
	const timestamp = now.getTime();

	return (discounts ?? []).some((discount) => {
		if (!discount?.isActive || !discount?.isHappyHour) return false;
		if (discount.startDate && timestamp < Number(discount.startDate)) return false;
		if (discount.endDate) {
			const endOfDay = new Date(Number(discount.endDate));
			endOfDay.setHours(23, 59, 59, 999);
			if (timestamp > endOfDay.getTime()) return false;
		}
		if (Array.isArray(discount.days) && discount.days.length > 0 && !discount.days.includes(currentDay)) {
			return false;
		}

		const start = parseTimeToMinutes(discount.startTime);
		const end = parseTimeToMinutes(discount.endTime);
		if (start === null || end === null) return false;
		return start <= end
			? currentMinutes >= start && currentMinutes <= end
			: currentMinutes >= start || currentMinutes <= end;
	});
}


function formatClockTime(time?: string) {
	return time || "--:--";
}

function getShiftSchedule(
	schedules: ShiftSchedule[] | undefined,
	shiftName?: string | null
) {
	if (!shiftName || !schedules?.length) return null;
	return schedules.find((schedule) => schedule.name === shiftName) ?? null;
}

function MenuProductCardSkeleton() {
	return (
		<div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
			<div className="relative h-28 sm:h-32 w-full bg-muted shrink-0">
				<Skeleton className="h-full w-full rounded-none" />
				<Skeleton className="absolute left-2 top-2 h-5 w-20 rounded-full bg-muted-foreground/20" />
				<Skeleton className="absolute left-2 bottom-2 h-5 w-12 rounded bg-muted-foreground/20" />
				<Skeleton className="absolute right-2 bottom-2 h-5 w-14 rounded bg-muted-foreground/20" />
			</div>
			<div className="flex flex-col gap-2 p-2.5 pt-2">
				<Skeleton className="h-4 w-4/5" />
				<div className="flex items-center gap-1.5">
					<Skeleton className="h-5 w-24" />
					<Skeleton className="h-3 w-16" />
				</div>
			</div>
		</div>
	);
}

type MenuImageWithSkeletonProps = {
	src?: string | null;
	alt: string;
	imageClassName?: string;
	iconClassName?: string;
	loading?: "eager" | "lazy";
};

function MenuImageWithSkeleton({
	src,
	alt,
	imageClassName,
	iconClassName = "h-10 w-10 text-muted-foreground/25",
	loading = "lazy",
}: MenuImageWithSkeletonProps) {
	const [imageState, setImageState] = useState<"loading" | "loaded" | "error">(
		src ? "loading" : "error"
	);
	const loadStartedAtRef = useRef(Date.now());
	const loadTimerRef = useRef<number | null>(null);

	useEffect(() => {
		if (loadTimerRef.current !== null) window.clearTimeout(loadTimerRef.current);
		loadStartedAtRef.current = Date.now();
		setImageState(src ? "loading" : "error");

		return () => {
			if (loadTimerRef.current !== null) window.clearTimeout(loadTimerRef.current);
		};
	}, [src]);

	const handleLoad = () => {
		const remaining = Math.max(0, 220 - (Date.now() - loadStartedAtRef.current));
		loadTimerRef.current = window.setTimeout(() => setImageState("loaded"), remaining);
	};

	const handleError = () => {
		if (loadTimerRef.current !== null) window.clearTimeout(loadTimerRef.current);
		setImageState("error");
	};

	if (!src || imageState === "error") {
		return (
			<div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-muted/60 text-muted-foreground/50">
				<ShoppingBag className={iconClassName} />
				<span className="text-[10px] font-semibold uppercase tracking-wide">
					Tanpa Gambar
				</span>
			</div>
		);
	}

	return (
		<>
			{imageState === "loading" && (
				<div className="absolute inset-0 z-[1] flex h-full w-full items-center justify-center bg-muted/35">
					<Skeleton className="absolute inset-0 h-full w-full rounded-none opacity-60" />
					<ShoppingBag className="relative z-[1] h-8 w-8 text-muted-foreground/35" />
				</div>
			)}
			<img
				src={src}
				alt={alt}
				className={cn(
					"absolute inset-0 h-full w-full object-cover transition-[filter,opacity] duration-500 ease-out",
					imageState === "loaded" ? "opacity-100 blur-0" : "opacity-60 blur-md",
					imageClassName
				)}
				loading={loading}
				decoding="async"
				onLoad={handleLoad}
				onError={handleError}
			/>
		</>
	);
}

function HeaderClock() {
	const [now, setNow] = useState(() => new Date());
	useEffect(() => {
		const id = setInterval(() => setNow(new Date()), 30000);
		return () => clearInterval(id);
	}, []);
	return (
		<span className="whitespace-nowrap leading-none">
			{now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
		</span>
	);
}

function PrinterStatusBadge() {
	const [connected, setConnected] = useState(() => bluetoothPrinter.isConnected());
	const [connecting, setConnecting] = useState(false);
	const mountedRef = useRef(false);

	const handleConnect = useCallback(async (e: React.MouseEvent) => {
		e.stopPropagation();
		if (connecting) return;
		setConnecting(true);
		try {
			const name = await bluetoothPrinter.connect();
			setConnected(true);
			toast.success(`Terhubung ke printer: ${name}`);
		} catch (error) {
			toast.error((error as Error).message || "Gagal hubungkan printer");
		} finally {
			setConnecting(false);
		}
	}, [connecting]);

	// Auto-connect on mount (pakai getDevices — tanpa dialog, pakai device yg sudah di-pair)
	useEffect(() => {
		let cancelled = false;
		const init = async () => {
			mountedRef.current = true;
			// Cek dulu — barangkali session GATT masih hidup
			if (bluetoothPrinter.isConnected()) {
				setConnected(true);
				return;
			}
			// Coba auto-connect via getDevices (tanpa dialog user)
			try {
				const name = await bluetoothPrinter.autoConnect();
				if (!cancelled && name) {
					setConnected(true);
				}
			} catch {
				// autoConnect gagal — user harus klik "Hubungkan"
			}
		};
		init();
		return () => { cancelled = true; mountedRef.current = false; };
	}, []);

	// Polling berkala
	useEffect(() => {
		const id = setInterval(() => {
			if (mountedRef.current) {
				setConnected(bluetoothPrinter.isConnected());
			}
		}, 5000);
		return () => clearInterval(id);
	}, []);

	if (connected) {
		return (
			<div className="flex flex-nowrap items-center gap-1 px-1.5 py-0.5 rounded-md whitespace-nowrap bg-emerald-50 text-emerald-600">
				<Printer className="h-3 w-3 shrink-0" />
				<span className="leading-none text-[10px] sm:text-xs font-semibold">Terhubung</span>
			</div>
		);
	}

	return (
		<button
			type="button"
			onClick={handleConnect}
			disabled={connecting}
			className="flex flex-nowrap items-center gap-1 px-1.5 py-0.5 rounded-md whitespace-nowrap bg-red-50 text-red-500 hover:bg-red-100 hover:text-red-600 transition-colors disabled:opacity-50 cursor-pointer select-none"
		>
			<Printer className="h-3 w-3 shrink-0" />
			<span className="leading-none text-[10px] sm:text-xs font-semibold">
				{connecting ? "..." : "Hubungkan"}
			</span>
		</button>
	);
}

function MenuPage() {
	const { mode: stockMode } = useManualStockMode();
	const integratedStock = stockMode === "integrated";
	const reduceMotion = useReducedMotion();
	const navigate = useNavigate();
	const { user: currentUser, role, isAdmin, logout } = useYumiAuth();
	const { panel, openPanel } = usePosPanel();
	const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
	const [isOnline, setIsOnline] = useState(() => navigator.onLine);
	useEffect(() => {
		const update = () => setIsOnline(navigator.onLine);
		window.addEventListener("online", update);
		window.addEventListener("offline", update);
		return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
	}, []);
	// Queries
	const siteSettings = useHybridSiteSettings();
	const mayarConfig = useHybridMayarConfig();
	const categories = useHybridCategories();
	const [ordersRealtimeVersion, setOrdersRealtimeVersion] = useState(0);
	const onOrdersRealtimeUpdate = useCallback(() => setOrdersRealtimeVersion((version) => version + 1), []);
	const orders = useHybridOrders({ onRealtimeUpdate: onOrdersRealtimeUpdate });
	const orderRefreshKey = useMemo(() => (orders ?? []).slice(0, 50).map((order: any) => `${order._id}:${order.status}:${order.createdAt}`).join("|"), [orders]);
	const { notifications, unreadCount, isLoading: notificationsLoading, error: notificationsError, refresh: refreshNotifications, markRead: markNotificationRead, removeNotification } = usePosNotifications(orderRefreshKey);
	const activeDiscounts = useHybridActiveDiscounts();
	const allDiscounts = useHybridAllDiscounts();
	const roles = useHybridStaffRoles();
	const users = useHybridStaffUsers();
	const createOrder = useHybridCreateOrder();
	const createMayarInvoice = useHybridMayarCreateInvoice();
	const updateOrder = useHybridUpdateOrder();

	const handleMarkCashierPaid = useCallback(async (notification: any) => {
		const orderId = String(notification.action_payload?.orderId ?? notification.order_source_id ?? "");
		if (!orderId) {
			toast.error("Order tidak ditemukan");
			return;
		}
		if (cashierPaidInFlightRef.current.has(orderId)) return;
		cashierPaidInFlightRef.current.add(orderId);
		try {
			await updateOrder({ id: orderId, status: "paid", paymentMethod: "cash", paymentReceiptKind: "cashier" });
			if (!String(notification.id).startsWith("barcode:")) {
				await removeNotification(notification.id);
			}
			setTransactionAlertIds((current) => current.filter((id) => id !== notification.id));
			// Refresh orders + financial transactions so history, dashboard, and target progress update immediately.
			triggerHybridRefresh();
			window.setTimeout(() => triggerHybridRefresh(), 350);
			window.setTimeout(() => triggerHybridRefresh(), 1_200);
			await refreshNotifications(true);
			toast.success("Pembayaran kasir berhasil dicatat");
		} catch (error) {
			console.error("[cashier-paid] failed", error);
			const message = error instanceof Error ? error.message : "Gagal mencatat pembayaran kasir";
			toast.error(message);
		} finally {
			cashierPaidInFlightRef.current.delete(orderId);
		}
	}, [refreshNotifications, removeNotification, updateOrder]);

	// Cart context
	const {
		items: cartItems,
		addToCart,
		removeFromCart,
		updateQuantity,
		clearCart,
		grossAmount,
		totalAmount,
		discountAmount,
		promoDiscountAmount,
		totalItems,
		finalTotal,
		taxAmount,
		serviceChargeAmount,
		voucherDiscountAmount,
		appliedVoucher,
		customerInfo,
		checkoutDraft,
	} = useCart();

	// Local state
	const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
	const [searchQuery, setSearchQuery] = useState("");
	const [isBarcodeScannerOpen, setIsBarcodeScannerOpen] = useState(false);
	const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
	const isCartOpen = panel === "cart";
	const setIsCartOpen = (open: boolean) => openPanel(open ? "cart" : null);
	const [isPaymentOpen, setIsPaymentOpen] = useState(false);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [pendingCheckoutRequest, setPendingCheckoutRequest] = useState(() => readPendingCheckoutRecovery());
	const submitInFlightRef = useRef(false);
	const paymentRequestIdRef = useRef<string | null>(null);
	const isSidebarOpen = panel !== null && ["dashboard", "transaksi", "kas", "antrian", "stok", "yumi", "settings"].includes(panel);
	const setIsSidebarOpen = (open: boolean) => openPanel(open ? "dashboard" : null);
	const isStockPanelOpen = panel === "stock";
	const setIsStockPanelOpen = (open: boolean) => openPanel(open ? "stock" : null);
	const [stockTutorialOpen, setStockTutorialOpen] = useState(false);
	const [stockTutorialShiftName, setStockTutorialShiftName] = useState("");
	const shiftStateObservedRef = useRef(false);
	const previousShiftOpenRef = useRef(false);
	const [productRefreshTick, setProductRefreshTick] = useState(0);
	const isNotificationCenterOpen = panel === "notifications";
	const setIsNotificationCenterOpen = (open: boolean) => openPanel(open ? "notifications" : null);
	const [transactionAlertIds, setTransactionAlertIds] = useState<string[]>([]);
	const cashierPaidInFlightRef = useRef<Set<string>>(new Set());
	const [selectedOrderNotification, setSelectedOrderNotification] = useState<any | null>(null);
	const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
	const notificationIdsRef = useRef<Set<string>>(new Set());
	const hasSeededNotificationsRef = useRef(false);
const notificationSeedTimerRef = useRef<number | undefined>(undefined);
const notificationSeedCompletedAtRef = useRef<number | null>(null);
	const activeSidebarTab = isSidebarOpen ? panel! : "dashboard";
	const [lastOrderId, setLastOrderId] = useState<Id<"orders"> | null>(null);
	const djiwaAppOrderStatusRef = useRef<Map<string, string>>(new Map());
	const djiwaAppOrderSeedTimerRef = useRef<number | undefined>(undefined);
	const djiwaAppOrderSeedCompletedAtRef = useRef<number | null>(null);
	const transactionSoundIdsRef = useRef<Set<string>>(new Set());
	const announcedSettledOrderIdsRef = useRef<Set<string>>(new Set());
	const processedOrdersRealtimeVersionRef = useRef(0);
	const autoPrintedCustomerOrderIdsRef = useRef<Set<string>>(new Set());
	const autoPrintRetryTimersRef = useRef<Map<string, number>>(new Map());
	const customerAutoPrintStatusRef = useRef<Map<string, string>>(new Map());
	const hasSeededCustomerAutoPrintRef = useRef(false);
	const hasSeededDjiwaAppOrdersRef = useRef(false);
	const [offlinePendingCount, setOfflinePendingCount] = useState(0);
	const [visibleProductsCount, setVisibleProductsCount] = useState(INITIAL_PRODUCTS_BATCH);
const [priceDialogProduct, setPriceDialogProduct] = useState<{ product: Record<string, any>; defaultPrice: number } | null>(null);
const [priceDialogValue, setPriceDialogValue] = useState("");
	const [isLoadingMoreProducts, setIsLoadingMoreProducts] = useState(false);

	const [shiftStatusMountKey, setShiftStatusMountKey] = useState(0);
	useEffect(() => { setShiftStatusMountKey(c => c + 1); }, []);
	const shiftStatus = useHybridShiftStatus(shiftStatusMountKey);
	const isShiftOpen = shiftStatus?.isOpen ?? false;
	const closingTasks = getShiftClosingTasks((orders ?? []) as any[], String(shiftStatus?.ongoingShift?._id ?? shiftStatus?.shiftInfo?.shiftId ?? "") || null, offlinePendingCount, Number(shiftStatus?.ongoingShift?.startTime ?? 0));
	const canViewReports = isAdmin || Boolean(role?.permissions?.includes("finance:view") || role?.permissions?.includes("analytics:view"));
	const canOpenAdmin = isAdmin || Boolean(role?.permissions?.some((permission: string) => ["analytics:view", "orders:view", "finance:view", "products:manage", "inventory:manage", "users:manage", "settings:manage"].includes(permission)));
	function handleWorkspaceAction(action: WorkspaceAction) {
		if (["dashboard", "transaksi", "kas", "antrian", "stock", "yumi", "settings", "sync", "readiness"].includes(action)) {openPanel(action as PosPanel); return;}
		if (action === "logout") {setLogoutConfirmOpen(true); return;}
		if (action === "report") {if (canViewReports) void navigate({to:"/laporan"} as any); return;}
		if (action === "admin") {
			const destination = ["/admin", "/admin/orders", "/admin/finance", "/admin/products", "/admin/inventory", "/admin/operational-team", "/admin/settings"].find(path => canAccessAdminRoute(path, isAdmin, role?.permissions ?? []));
			if (canOpenAdmin && destination) void navigate({to:destination} as any);
			return;
		}
		if (action === "profile") {const username = currentUser?.slug || currentUser?.username; if (username) void navigate({to:"/karyawan/$username",params:{username}} as any); return;}
		void navigate({to:action === "booking" ? "/booking" : "/attendance"} as any);
	}

	useEffect(() => {
		if (!shiftStatus) return;
		const wasOpen = previousShiftOpenRef.current;
		if (shiftStateObservedRef.current && !wasOpen && isShiftOpen) {
			const shiftName = String(shiftStatus.shiftInfo?.shiftName ?? "").trim();
			if (shouldShowStockTutorial(shiftName)) {
				setStockTutorialShiftName(shiftName);
				setStockTutorialOpen(true);
			}
		}
		previousShiftOpenRef.current = isShiftOpen;
		shiftStateObservedRef.current = true;
	}, [isShiftOpen, shiftStatus]);

	const [currentTime, setCurrentTime] = useState(new Date());
	const [happyHourNoticeOpen, setHappyHourNoticeOpen] = useState(false);
	const [shiftReminderOpen, setShiftReminderOpen] = useState(false);
	const [shiftReminderState, setShiftReminderState] = useState<"soon" | "overdue" | null>(null);

	// Clock tick — 30s is enough for a header clock; keeps full-page re-render cheap.
	// Printer status is handled by <PrinterStatusBadge /> (own state/interval) so it no
	// longer forces the whole product grid + bonus panel to re-render every few seconds.
	useEffect(() => {
		const id = setInterval(() => setCurrentTime(new Date()), 30000);
		return () => clearInterval(id);
	}, []);

	useEffect(() => {
		if (!isHappyHourCurrentlyActive(activeDiscounts, currentTime) || typeof window === "undefined") {
			return;
		}

		const activeIds = (activeDiscounts ?? [])
			.filter((discount: any) => discount?.isActive && discount?.isHappyHour)
			.map((discount: any) => String(discount._id ?? discount.name ?? "happy-hour"))
			.sort()
			.join("-");
		const noticeKey = `pos-happy-hour-notice-${currentTime.toISOString().slice(0, 10)}-${activeIds}`;
		if (window.sessionStorage.getItem(noticeKey) !== "seen") {
			setHappyHourNoticeOpen(true);
			window.sessionStorage.setItem(noticeKey, "seen");
		}
	}, [activeDiscounts, currentTime]);

	useEffect(() => {
		if (!orders) return;

		const currentStatuses = new Map<string, string>();
		const newlySettledOrderIds: string[] = [];
		orders.forEach((order: any) => {
			const source = String(order.source ?? order.sourceApp ?? order.source_app ?? "")
				.trim()
				.toLowerCase();
			if (source !== "customer_self_service") return;

			const orderId = String(order._id ?? order.sourceId ?? order.orderNumber ?? "");
			const status = String(order.status ?? "").toLowerCase();
			if (!orderId) return;
			currentStatuses.set(orderId, status);

			if (hasSeededDjiwaAppOrdersRef.current) {
				const previousStatus = djiwaAppOrderStatusRef.current.get(orderId);
				const wasAnnounced = announcedSettledOrderIdsRef.current.has(orderId);
				const isNewOrderAfterSeed = djiwaAppOrderSeedCompletedAtRef.current !== null
					&& Number(order.createdAt ?? 0) > djiwaAppOrderSeedCompletedAtRef.current;
				const isSettled = status === "paid" || status === "completed";
				const isStatusTransition = previousStatus !== undefined && previousStatus !== status;
				if (!wasAnnounced && isSettled && (isNewOrderAfterSeed || isStatusTransition)) {
					newlySettledOrderIds.push(orderId);
				}
			}
		});

		if (!hasSeededDjiwaAppOrdersRef.current) {
			djiwaAppOrderStatusRef.current = currentStatuses;
			if (djiwaAppOrderSeedTimerRef.current) window.clearTimeout(djiwaAppOrderSeedTimerRef.current);
			djiwaAppOrderSeedTimerRef.current = window.setTimeout(() => {
				hasSeededDjiwaAppOrdersRef.current = true;
				djiwaAppOrderSeedCompletedAtRef.current = Date.now();
				djiwaAppOrderSeedTimerRef.current = undefined;
			}, 1500);
			return;
		}

		if (ordersRealtimeVersion === 0 || ordersRealtimeVersion === processedOrdersRealtimeVersionRef.current) return;
		processedOrdersRealtimeVersionRef.current = ordersRealtimeVersion;

		newlySettledOrderIds.forEach((orderId) => {
			if (transactionSoundIdsRef.current.has(orderId)) return;
			const order = (orders as any[]).find((item) => String(item._id ?? item.sourceId ?? item.orderNumber ?? "") === orderId);
			if (!order) return;
			transactionSoundIdsRef.current.add(orderId);
			announcedSettledOrderIdsRef.current.add(orderId);
			const voiceEvent = resolveTransactionVoice({
				eventKey: `order:${orderId}`,
				source: String(order.source ?? order.sourceApp ?? order.source_app ?? ""),
				eventType: "order_paid",
				paymentMethod: order.paymentMethod ?? order.payment_method,
				orderId,
				customerName: order.customerName ?? order.customer_name,
			});
			enqueueTransactionVoice(voiceEvent);
		});

		djiwaAppOrderStatusRef.current = currentStatuses;
	}, [orders, ordersRealtimeVersion]);

	useEffect(() => {
		if (!notifications || notificationsLoading) return;
		const nextIds = new Set(notifications.map((item) => item.id));
		if (!hasSeededNotificationsRef.current) {
			notificationIdsRef.current = nextIds;
			if (notificationSeedTimerRef.current) window.clearTimeout(notificationSeedTimerRef.current);
			notificationSeedTimerRef.current = window.setTimeout(() => {
				hasSeededNotificationsRef.current = true;
				notificationSeedCompletedAtRef.current = Date.now();
				notificationSeedTimerRef.current = undefined;
			}, 1500);
			return;
		}
		const newTransactionAlerts = notifications.filter((item) =>
			!notificationIdsRef.current.has(item.id) &&
			notificationSeedCompletedAtRef.current !== null &&
			new Date(item.created_at).getTime() > notificationSeedCompletedAtRef.current &&
			(item.notification_type === "order_cashier_pending" || item.notification_type === "order_paid") &&
			String(item.source ?? item.action_payload?.source ?? "").toLowerCase() !== "admin"
		);
		if (newTransactionAlerts.length > 0) {
			setTransactionAlertIds((current) => Array.from(new Set([...current, ...newTransactionAlerts.map((item) => item.id)])).slice(-3));
		}
		notificationIdsRef.current = nextIds;
	}, [notifications, notificationsLoading]);

	useEffect(() => {
		const offlineManager = getOfflineManager();
		offlineManager.registerExecutor("createOrder", async (action) => {
			await createOrder(action.data as any);
		});

		return offlineManager.subscribe((state) => {
			setOfflinePendingCount(state.pendingSyncCount);
		});
	}, [createOrder]);

	const activeShiftSchedule = useMemo(
		() =>
			getShiftSchedule(
				siteSettings?.shiftSettings?.shiftSchedules as ShiftSchedule[] | undefined,
				shiftStatus?.shiftInfo?.shiftName
			),
		[siteSettings?.shiftSettings?.shiftSchedules, shiftStatus?.shiftInfo?.shiftName]
	);

	const shiftReminderMinutes = Math.max(
		1,
		siteSettings?.shiftSettings?.reminderMinutesBeforeClose ?? 15
	);

	useEffect(() => {
		if (!isShiftOpen || !activeShiftSchedule?.closeTime) {
			setShiftReminderState(null);
			setShiftReminderOpen(false);
			return;
		}

		const closeMinutes = parseTimeToMinutes(activeShiftSchedule.closeTime);
		if (closeMinutes == null) {
			setShiftReminderState(null);
			setShiftReminderOpen(false);
			return;
		}

		const nowMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();
		const minutesUntilClose = closeMinutes - nowMinutes;
		const nextState =
			minutesUntilClose < 0
				? "overdue"
				: minutesUntilClose <= shiftReminderMinutes
					? "soon"
					: null;

		setShiftReminderState((prev) => {
			if (nextState && prev !== nextState) {
				setShiftReminderOpen(true);
			}
			if (!nextState) {
				setShiftReminderOpen(false);
			}
			return nextState;
		});
	}, [
		activeShiftSchedule?.closeTime,
		currentTime,
		isShiftOpen,
		shiftReminderMinutes,
	]);


	const progress = useHybridCurrentMonthProgress();

	const shiftPct = useMemo(
		() => Math.max(0, progress?.shiftTarget ? (progress.shiftCollected / progress.shiftTarget) * 100 : 0),
		[progress?.shiftCollected, progress?.shiftTarget]
	);
	const dailyPct = useMemo(
		() => Math.max(0, progress?.dailyTarget ? (progress.dailyCollected / progress.dailyTarget) * 100 : 0),
		[progress?.dailyCollected, progress?.dailyTarget]
	);
	const monthlyPct = useMemo(
		() => Math.max(0, progress?.progressPct ?? 0),
		[progress?.progressPct]
	);

	const roleBonusConfigById = useMemo(() => {
		const map = new Map<string, RoleBonusConfig>();
		(roles ?? []).forEach((role: any) => {
			const config = normalizeRoleBonusConfig(role);
			if (config) {
				map.set(String(role._id), config);
			}
		});
		return map;
	}, [roles]);

	const onDutyNameList = useMemo(() => {
		const names = new Set<string>();
		const cashierName = shiftStatus?.ongoingShift?.cashierName || shiftStatus?.shiftInfo?.cashierName;
		if (cashierName) names.add(cashierName.trim());

		const teamRaw = shiftStatus?.ongoingShift?.teamMembers || "";
		teamRaw
			.split(/[,\n;|]/g)
			.map((name: string) => name.trim())
			.filter(Boolean)
			.forEach((name: string) => names.add(name));

		return Array.from(names);
	}, [shiftStatus?.ongoingShift?.cashierName, shiftStatus?.ongoingShift?.teamMembers, shiftStatus?.shiftInfo?.cashierName]);

	const onDutyMembers = useMemo(() => {
		const allUsers = users ?? [];
		return onDutyNameList.map((name) => {
			const matched = allUsers.find(
				(user: any) => normalizePersonName(user.name) === normalizePersonName(name)
			);
			return {
				name,
				roleId: matched?.roleId ?? null,
				roleName: matched?.roleName ?? "-",
			};
		});
	}, [onDutyNameList, users]);

	const memberBonusSummary = useMemo((): MemberBonusSummary[] => {
		return onDutyMembers
			.map((member) => {
				if (!member.roleId) return null;
				const config = roleBonusConfigById.get(String(member.roleId));
				if (!config) return null;
				const achievementPct =
					config.basis === "shift"
						? shiftPct
						: config.basis === "daily"
							? dailyPct
							: monthlyPct;
				const summary = summarizeRoleBonus(achievementPct, config);
				return {
					memberName: member.name,
					roleName: member.roleName,
					basis: config.basis,
					achievementPct: summary.achievementPct,
					achievedBonus: summary.achievedBonus,
					reachedThresholds: summary.reachedThresholds,
					nextTier: summary.nextTier,
					allTiers: summary.allTiers,
				};
			})
			.filter((item): item is MemberBonusSummary => item !== null);
	}, [onDutyMembers, roleBonusConfigById, shiftPct, dailyPct, monthlyPct]);

	const shiftBonusSummary = useMemo(
		() =>
			memberBonusSummary.filter((item) => item.basis === "shift"),
		[memberBonusSummary]
	);

	const dailyBonusSummary = useMemo(
		() =>
			memberBonusSummary.filter((item) => item.basis === "daily"),
		[memberBonusSummary]
	);

	const monthlyBonusSummary = useMemo(
		() =>
			memberBonusSummary.filter((item) => item.basis === "monthly"),
		[memberBonusSummary]
	);

	const totalShiftBonusNow = useMemo(
		() => shiftBonusSummary.reduce((sum, item) => sum + item.achievedBonus, 0),
		[shiftBonusSummary]
	);
	const totalDailyBonusNow = useMemo(
		() => dailyBonusSummary.reduce((sum, item) => sum + item.achievedBonus, 0),
		[dailyBonusSummary]
	);

	// Checkout opens only on intent; landing and restored URL panels must stay visible.

	// Refs for scrolling
	const productGridRef = useRef<HTMLDivElement>(null);
	const mainScrollRef = useRef<HTMLDivElement>(null);
	const loadMoreTriggerRef = useRef<HTMLDivElement>(null);
	const isLoadingMoreRef = useRef(false);

	// Products query with category filter
	const products = useHybridProducts(
		activeCategoryId && activeCategoryId !== "all" ? activeCategoryId : null
	);

	// All products for search
	const allProducts = useHybridAllProducts(productRefreshTick);
	const transactionSuggestions = useMemo(() => (orders ?? [])
		.map((order: any) => {
			const displayNumber = getDisplayOrderNumber(order.orderNumber, { sequence: order.dailyReceiptNo ?? order.daily_receipt_no, createdAt: order.createdAt ?? order._creationTime, source: order.source, sourceApp: order.sourceApp, businessUnit: order.businessUnit, orderType: order.orderType });
			const match = displayNumber.match(/-(\d{4})-(\d{6})$/);
			const status = String(order.status ?? "").toLowerCase();
			const statusLabel = status === "pending" ? "Belum lunas" : status === "completed" ? "Selesai" : status === "paid" ? "Lunas" : status || "Status tidak diketahui";
			return { value: match ? `${match[1]}-${match[2]}` : displayNumber, label: order.customerName || "Pelanggan", detail: `Rp${Number(order.totalAmount ?? 0).toLocaleString("id-ID")} · ${statusLabel}` };
		}), [orders]);

	// Filtered products based on search
	const filteredProducts = useMemo(() => {
		if (!searchQuery.trim()) return products ?? allProducts;
		if (!allProducts) return [];
		
		const query = searchQuery.toLowerCase();
		return allProducts.filter((p: any) => {
			const matchName = p.name.toLowerCase().includes(query);
			const matchMenuNumber = p.menuNumber?.toString().includes(query);
			
			// Match category name
			let matchCategory = false;
			if (p.categoryId && categories) {
				const category = categories.find((c: any) => c._id === p.categoryId);
				if (category && category.name.toLowerCase().includes(query)) {
					matchCategory = true;
				}
			}
			
			// Match description
			const matchDescription = p.description?.toLowerCase().includes(query);
			
			return matchName || matchMenuNumber || matchCategory || matchDescription;
		});
	}, [searchQuery, products, allProducts, categories]);
	const isLoading = (products === undefined && allProducts === undefined) || categories === undefined;
	const filteredProductsLength = filteredProducts?.length ?? 0;
	const displayedProducts = useMemo(
		() => (filteredProducts ?? []).slice(0, visibleProductsCount),
		[filteredProducts, visibleProductsCount]
	);
	const hasMoreProducts = displayedProducts.length < filteredProductsLength;

	// Store info
	const storeName = siteSettings?.storeName || "Djiwa Tentram";
	const logoUrl = siteSettings?.logoUrl;
	const themeColor = siteSettings?.themeColor;

	// Derive active parent ID
	const activeParentId = useMemo(() => {
		if (!categories || !activeCategoryId || activeCategoryId === "all") return null;
		const activeCat = categories.find((c: any) => c._id === activeCategoryId);
		if (activeCat) {
			return activeCat.parentId ? activeCat.parentId : activeCat._id;
		}
		return null;
	}, [categories, activeCategoryId]);

	// Category lists for Point 2: Main tabs vs Local chips
	const { categoryTabs, activeSubcategories, activeParentName } = useMemo(() => {
		if (!categories) return { categoryTabs: [{ _id: "all", name: "Semua" }], activeSubcategories: [], activeParentName: "" };
		
			const parents = categories.filter((c: any) => !c.parentId && c.track !== "hidden");
		const tabs = [{ _id: "all", name: "Semua" }, ...parents];
		
		let subs: any[] = [];
		let parentName = "";
		if (activeParentId) {
			subs = categories.filter((c: any) => c.parentId === activeParentId);
			const parent = categories.find((c: any) => c._id === activeParentId);
			if (parent) parentName = parent.name;
		}

		return { categoryTabs: tabs, activeSubcategories: subs, activeParentName: parentName };
	}, [categories, activeParentId]);

	const handleBarcodeDetected = useCallback(
		async (code: string) => {
			const normalizedCode = code.trim().toLowerCase();
			const compactCode = normalizedCode.replace(/[^a-z0-9]/g, "");
			const shortCodeMatch = compactCode.match(/(?:ordappd|ordapp|appd)?(\d{1,4})(\d{6})$/i);
			const shortSequence = shortCodeMatch ? String(Number(shortCodeMatch[1])) : null;
			const shortDate = shortCodeMatch?.[2] ?? null;
			let order = (orders ?? []).find((candidate: any) => {
				const displayNumber = getDisplayOrderNumber(candidate.orderNumber, {
					sequence: candidate.dailyReceiptNo ?? candidate.daily_receipt_no,
					createdAt: candidate.createdAt ?? candidate.created_at ?? candidate._creationTime,
					source: candidate.source,
					sourceApp: candidate.sourceApp,
					businessUnit: candidate.businessUnit,
					orderType: candidate.orderType,
				});
				const displayMatch = String(displayNumber).match(/-(\d{4})-(\d{6})$/);
				const candidateSequence = displayMatch?.[1] ? String(Number(displayMatch[1])) : null;
				const candidateDate = displayMatch?.[2] ?? null;
				const shortMatch = Boolean(shortSequence && shortDate && candidateSequence === shortSequence && candidateDate === shortDate);
				return shortMatch || [displayNumber, candidate.orderNumber, candidate._id].some((value) => String(value ?? "").trim().toLowerCase() === normalizedCode);
			});
			if (!order && shortSequence && shortDate) {
				try {
					const { data: receiptMatches, error: receiptError } = await createClient()
						.from("pos_orders")
						.select("*")
						.eq("daily_receipt_no", Number(shortSequence))
						.order("createdAt", { ascending: false })
						.limit(100);
					if (receiptError) throw receiptError;
					order = (receiptMatches ?? []).find((candidate: any) => {
						const rawCreatedAt = candidate.createdAt ?? candidate.created_at ?? candidate._creationTime;
						const timestamp = typeof rawCreatedAt === "number" ? rawCreatedAt : Date.parse(String(rawCreatedAt ?? ""));
						if (!Number.isFinite(timestamp)) return false;
						const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", day: "2-digit", month: "2-digit", year: "2-digit" }).formatToParts(new Date(timestamp));
						const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
						return `${values.day}${values.month}${values.year}` === shortDate;
					}) as any;
				} catch (lookupError) {
					console.error("[barcode] failed to lookup receipt:", lookupError);
				}
			}
			if (order) {
				setSelectedOrderId(String(order._id));
				setSelectedOrderNotification({ id: `barcode:${order._id}`, notification_type: "order_cashier_pending", priority: "high", title: "Order dari Barcode", message: "Order ditemukan dari scanner POS", order_source_id: order._id, order_number: order.orderNumber, source: order.source, action_payload: { orderId: order._id, orderNumber: order.orderNumber, customerName: order.customerName, totalAmount: order.totalAmount, paymentMethod: order.paymentMethod }, created_at: new Date().toISOString(), isRead: false } as any);
				toast.success(`Order ${getDisplayOrderNumber(order.orderNumber, { sequence: order.dailyReceiptNo ?? order.daily_receipt_no, createdAt: order.createdAt ?? order.created_at ?? order._creationTime, source: order.source, orderType: order.orderType })} ditemukan`);
				return;
			}
			const product = (allProducts ?? []).find((candidate: any) =>
				[String(candidate.barcode ?? ""), String(candidate.sku ?? ""), String(candidate.productCode ?? ""), String(candidate.menuNumber ?? "")]
					.some((value) => value.trim().toLowerCase() === normalizedCode)
			);
			if (!product) {
				toast.error(`Produk dengan barcode ${code} belum ditemukan`);
				return;
			}
			if (product.isAvailable === false || (integratedStock && Number(product.quantity ?? 0) <= 0)) {
				toast.error(`${product.name} sedang SOLD atau stok habis`);
				return;
			}
			setSelectedProduct(product);
			toast.success(`${product.name} ditemukan — konfirmasi sebelum masuk keranjang`);
		},
		[allProducts, orders, integratedStock]
	);

	const handleCategorySelect = useCallback(
		(index: number) => {
			mainScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
			if (index === 0) {
				setActiveCategoryId(null);
			} else {
				const cat = categoryTabs[index];
				if (cat && cat._id !== "all") {
					setActiveCategoryId(cat._id);
				}
			}
		},
		[categoryTabs]
	);

	useEffect(() => {
		setVisibleProductsCount(
			Math.min(INITIAL_PRODUCTS_BATCH, filteredProductsLength)
		);
		setIsLoadingMoreProducts(false);
		isLoadingMoreRef.current = false;
	}, [activeCategoryId, filteredProductsLength, searchQuery]);

	useEffect(() => {
		const root = mainScrollRef.current;
		const trigger = loadMoreTriggerRef.current;
		if (!root || !trigger || isLoading || !hasMoreProducts) return;

		let timeoutId: number | undefined;

		const observer = new IntersectionObserver(
			(entries) => {
				const entry = entries[0];
				if (!entry?.isIntersecting || isLoadingMoreRef.current) return;

				isLoadingMoreRef.current = true;
				setIsLoadingMoreProducts(true);
				timeoutId = window.setTimeout(() => {
					setVisibleProductsCount((prev) =>
						Math.min(prev + LOAD_MORE_PRODUCTS_BATCH, filteredProductsLength)
					);
					setIsLoadingMoreProducts(false);
					isLoadingMoreRef.current = false;
					timeoutId = undefined;
					observer.unobserve(trigger);
					requestAnimationFrame(() => { if (trigger.isConnected) observer.observe(trigger); });
				}, LOAD_MORE_DELAY_MS);
			},
			{
				root,
				rootMargin: "220px 0px 220px 0px",
				threshold: 0.01,
			}
		);

		observer.observe(trigger);

		return () => {
			observer.disconnect();
			if (timeoutId != null) {
				window.clearTimeout(timeoutId);
			}
		};
	}, [filteredProductsLength, hasMoreProducts, isLoading]);

	// Get cart quantity for a product
	const getCartQty = (productId: string) =>
		cartItems
			.filter((i) => i.productId === productId)
			.reduce((s, i) => s + i.quantity, 0);

	// Format currency
	const fmt = (n: number) =>
		new Intl.NumberFormat("id-ID", {
			style: "currency",
			currency: "IDR",
			maximumFractionDigits: 0,
		}).format(n);

	// Handle product click
	const handleProductClick = (product: any) => {
		const hasVariations = product.variations && product.variations.length > 0;
		if (hasVariations) {
			setSelectedProduct(product);
		} else {
			const pricing = calculateEffectivePrice(
				{
					_id: product._id,
					price: product.price,
					categoryId: product.categoryId,
				},
				activeDiscounts,
				{ allowHappyHour: false }
			);
			addToCart({
				productId: product._id,
				name: product.name,
				price: pricing.finalPrice,
				originalPrice: pricing.originalPrice,
				quantity: 1,
				image: product.image,
				category: product.categoryId,
			});
			toast.success(`${product.name} ditambahkan ke keranjang`);
		}
	};

	const handlePrint = useCallback(async (
		orderId: Id<"orders">,
		modeOverride?: ReceiptPrintMode
	): Promise<boolean> => {
		if (!siteSettings) {
			toast.error("Data toko belum siap. Coba lagi sebentar.", { id: "printing" });
			return false;
		}

		try {
			if (!navigator.bluetooth) {
				toast.error("Browser ini tidak mendukung Web Bluetooth (gunakan Chrome/Edge).", { id: "printing" });
				return false;
			}

			if (!bluetoothPrinter.isConnected()) {
				const connected = await bluetoothPrinter.autoReconnectIfNeeded(0);
				if (!connected) {
					toast.loading("Pilih printer Bluetooth untuk mencetak...", { id: "printing" });
					await bluetoothPrinter.connect();
				}
			}

			let order = orders?.find((candidate: any) => candidate._id === orderId);

			// ⚡ Fallback: order mungkin belum masuk cache (race condition setelah auto-print)
			if (!order) {
				const supabase = createClient();
				const { data: freshOrder } = await supabase
					.from("pos_orders")
					.select("*")
					.eq("_id", orderId)
					.maybeSingle();
				order = freshOrder as any;
			}

			if (!order) {
				console.warn("[Print] Order not found:", orderId);
				toast.error("Order tidak ditemukan untuk dicetak", { id: "printing" });
				return false;
			}

			toast.loading("Mencetak struk...", { id: "printing" });
			const items = order.items.map((i: any) => ({
				productId: i.productId,
				name: i.productName,
				variant: i.variant,
				price: i.price,
				originalPrice: i.originalPrice,
				quantity: i.quantity,
				track: resolveProductionTrack(i, allProducts ?? products, categories),
			}));
			
			const subtotal = items.reduce(
				(sum: number, item: OrderItem) => sum + (item.originalPrice ?? item.price) * item.quantity,
				0
			);
			const receiptMode =
				modeOverride ?? (order.status === "pending" ? "open_bill" : "paid");
			const paymentStatusLabel =
				receiptMode === "kitchen"
					? "TIKET KITCHEN"
					: receiptMode === "open_bill"
						? "OPEN BILL"
						: "LUNAS";

				await bluetoothPrinter.print(
					{
						orderNumber: order.orderNumber,
						items,
						totalAmount: order.totalAmount,
						subtotal,
						discountAmount: order.discountAmount,
						paymentMethod: order.paymentMethod,
						createdAt: order.createdAt,
						customerName: order.customerName,
						customerDescription: order.customerDescription,
						orderType: order.orderType,
						tableNumber: order.tableNumber,
						notes: order.notes,
						cashierName: shiftStatus?.shiftInfo?.cashierName || undefined,
						shiftName: shiftStatus?.shiftInfo?.shiftName || undefined,
						receiptMode,
						paymentStatusLabel,
						receiptMeta: buildReceiptMetaFromOrder({
							order: {
								discountAmount: order.discountAmount,
								taxAmount: order.taxAmount,
								serviceChargeAmount: order.serviceChargeAmount,
								voucherId: order.voucherId,
								receiptMeta: (order as { receiptMeta?: any }).receiptMeta,
								items,
							},
							allDiscounts,
						}),
						dailyReceiptNo: order.dailyReceiptNo,
						receiptKind: order.receiptKind,
					},
					{
						storeName: siteSettings.storeName,
						storeAddress: siteSettings.storeAddress,
						storePhone: siteSettings.storePhone,
						receiptFooter: siteSettings.receiptFooter,
						receiptLogo: siteSettings.receiptLogo,
						receiptHeader: siteSettings.receiptHeader,
						receiptShowLogo: siteSettings.receiptShowLogo,
						receiptShowAddress: siteSettings.receiptShowAddress,
						receiptShowPhone: siteSettings.receiptShowPhone,
						receiptShowOrderNumber: siteSettings.receiptShowOrderNumber,
						receiptShowCustomerName: siteSettings.receiptShowCustomerName,
						receiptShowCashierName: siteSettings.receiptShowCashierName,
						receiptShowNotes: siteSettings.receiptShowNotes,
						receiptFontSize: siteSettings.receiptFontSize,
					}
				);
			toast.success("Struk berhasil dicetak", { id: "printing" }); triggerHybridRefresh();
			return true;
		} catch (error) {
			console.error("Print failed:", error);
			const message =
				error instanceof Error ? error.message : "Gagal mencetak";
			toast.error(`Gagal mencetak: ${message}. ${!bluetoothPrinter.isConnected() ? 'Pastikan printer Bluetooth sudah terhubung — klik "Hubungkan Printer".' : ""}`, { id: "printing" });
			return false;
		}
	}, [allDiscounts, allProducts, categories, orders, products, siteSettings, shiftStatus]);

	const handleAutoPrintSettledCustomerOrder = useCallback(async (orderId: string) => {
		let storedIds: string[] = [];
		try {
			const raw = window.localStorage.getItem(AUTO_PRINTED_CUSTOMER_ORDERS_KEY);
			const parsed = raw ? JSON.parse(raw) : [];
			if (Array.isArray(parsed)) storedIds = parsed.filter((value): value is string => typeof value === "string");
		} catch {
			storedIds = [];
		}

		if (storedIds.includes(orderId) || autoPrintedCustomerOrderIdsRef.current.has(orderId)) return true;
		if (!bluetoothPrinter.isConnected()) {
			const connected = await bluetoothPrinter.autoReconnectIfNeeded(0);
			if (!connected) {
				if (!autoPrintRetryTimersRef.current.has(orderId)) {
					const timerId = window.setTimeout(() => {
						autoPrintRetryTimersRef.current.delete(orderId);
						void handleAutoPrintSettledCustomerOrder(orderId);
					}, 15000);
					autoPrintRetryTimersRef.current.set(orderId, timerId);
				}
				toast.warning("Printer belum terhubung. Hubungkan printer untuk mencetak struk customer.", { id: "auto-print" });
				return false;
			}
		}

		autoPrintedCustomerOrderIdsRef.current.add(orderId);
		const nextStoredIds = [...new Set([...storedIds, orderId])].slice(-300);
		try {
			window.localStorage.setItem(AUTO_PRINTED_CUSTOMER_ORDERS_KEY, JSON.stringify(nextStoredIds));
		} catch {
			// Printing still proceeds; the in-memory guard protects this render.
		}

		const printed = await handlePrint(orderId as Id<"orders">, "kitchen");
		if (!printed) {
			autoPrintedCustomerOrderIdsRef.current.delete(orderId);
			try {
				window.localStorage.setItem(AUTO_PRINTED_CUSTOMER_ORDERS_KEY, JSON.stringify(storedIds));
			} catch {
				// Retry remains possible through the live status update.
			}
		}
		return printed;
	}, [handlePrint]);

	useEffect(() => {
		if (!orders) return;
		const currentStatuses = new Map<string, string>();
		const newlySettledOrderIds: string[] = [];
		for (const order of orders as any[]) {
			const source = String(order.source ?? order.sourceApp ?? order.source_app ?? "").trim().toLowerCase();
			if (source !== "customer_self_service") continue;
			const orderId = String(order._id ?? order.sourceId ?? "");
			const status = String(order.status ?? "").toLowerCase();
			if (!orderId) continue;
			currentStatuses.set(orderId, status);
			if (hasSeededCustomerAutoPrintRef.current && customerAutoPrintStatusRef.current.get(orderId) !== status && (status === "paid" || status === "completed")) {
				newlySettledOrderIds.push(orderId);
			}
		}
		if (!hasSeededCustomerAutoPrintRef.current) {
			hasSeededCustomerAutoPrintRef.current = true;
		} else {
			newlySettledOrderIds.forEach((orderId) => { void handleAutoPrintSettledCustomerOrder(orderId); });
		}
		customerAutoPrintStatusRef.current = currentStatuses;
	}, [handleAutoPrintSettledCustomerOrder, orders]);

	const handlePrintCurrentOpenBill = useCallback(async () => {
		if (!siteSettings || cartItems.length === 0) return;

		try {
			if (!navigator.bluetooth) {
				toast.error("Browser ini tidak mendukung Web Bluetooth (gunakan Chrome/Edge).", { id: "printing" });
				return;
			}
			
			if (!bluetoothPrinter.isConnected()) {
				const connected = await bluetoothPrinter.autoReconnectIfNeeded(0);
				if (!connected) {
					toast.loading("Pilih printer Bluetooth untuk mencetak...", { id: "printing" });
					await bluetoothPrinter.connect();
				}
			}

			toast.loading("Mencetak open bill...", { id: "printing-open-bill" });
			const items = cartItems.map((item) => ({
				productId: item.productId,
				name: item.name,
				variant: item.variant,
				price: item.price,
				originalPrice: item.originalPrice,
				quantity: item.quantity,
			}));

			await bluetoothPrinter.print(
				{
					orderNumber: `ORD-X-OPEN${Date.now().toString().slice(-4)}`,
					items,
					totalAmount: finalTotal,
					subtotal: grossAmount,
					paymentMethod: "open_bill",
					createdAt: Date.now(),
					customerName: customerInfo.name || "Pelanggan",
					orderType: customerInfo.orderType,
					tableNumber: customerInfo.tableNumber,
					notes: customerInfo.notes,
					cashierName: shiftStatus?.shiftInfo?.cashierName || undefined,
					shiftName: shiftStatus?.shiftInfo?.shiftName || undefined,
					receiptMode: "open_bill",
					paymentStatusLabel: "OPEN BILL",
					receiptMeta: buildReceiptMetaFromCart({
						items: cartItems,
						allDiscounts: activeDiscounts,
						appliedVoucher,
						promoDiscountAmount,
						voucherDiscountAmount,
						taxAmount,
						serviceChargeAmount,
					}),
				},
				{
					storeName: siteSettings.storeName,
					storeAddress: siteSettings.storeAddress,
					storePhone: siteSettings.storePhone,
					receiptFooter: siteSettings.receiptFooter,
					receiptLogo: siteSettings.receiptLogo,
					receiptHeader: siteSettings.receiptHeader,
					receiptShowLogo: siteSettings.receiptShowLogo,
					receiptShowAddress: siteSettings.receiptShowAddress,
					receiptShowPhone: siteSettings.receiptShowPhone,
					receiptShowOrderNumber: siteSettings.receiptShowOrderNumber,
					receiptShowCustomerName: siteSettings.receiptShowCustomerName,
					receiptShowNotes: siteSettings.receiptShowNotes,
					receiptShowCashierName: siteSettings.receiptShowCashierName,
					receiptFontSize: siteSettings.receiptFontSize,
				}
			);
			toast.success("Open bill berhasil dicetak", { id: "printing-open-bill" }); triggerHybridRefresh();
		} catch (error) {
			console.error("Open bill print failed:", error);
			toast.error("Gagal mencetak open bill.", { id: "printing-open-bill" });
		}
	}, [
		activeDiscounts,
		appliedVoucher,
		cartItems,
		customerInfo.name,
		customerInfo.notes,
		customerInfo.orderType,
		customerInfo.tableNumber,
		finalTotal,
		grossAmount,
		promoDiscountAmount,
		serviceChargeAmount,
		siteSettings,
		shiftStatus,
		taxAmount,
		voucherDiscountAmount,
	]);

	// Handle order submission from payment modal or sidebar
	const checkoutSnapshot: CheckoutRecoveryRequest["snapshot"] = {
		cartItems, customerInfo, appliedVoucher, promoDiscountAmount, voucherDiscountAmount, activeDiscounts,
		taxPolicy: {taxEnabled: siteSettings?.taxEnabled ?? false, taxRate: Number(siteSettings?.taxRate ?? 0), serviceChargeRate: Number(siteSettings?.serviceChargeRate ?? 0)},
		shiftId: shiftStatus?.ongoingShift?._id ?? shiftStatus?.shiftInfo?.shiftId ?? null,
	};
	const handlePaymentConfirm = useCallback(
		async (
				finalAmount: number,
				discountId?: string,
				paymentMethod?: string,
				orderData?: {
					tableNumber?: string;
					orderType?: string;
					notes?: string;
					autoComplete?: boolean;
					isOpenBill?: boolean;
					cashReceived?: number;
					changeAmount?: number;
					assignments?: { groupType: "barista" | "kitchen"; assignedTo: string; items: { productName: string; quantity: number; assignedTo: string }[] }[];
				},
				recoverySnapshot?: CheckoutRecoveryRequest["snapshot"],
			): Promise<CheckoutSubmissionResult> => {
			const snapshot = recoverySnapshot ?? checkoutSnapshot;
			const {cartItems, customerInfo, appliedVoucher, promoDiscountAmount, voucherDiscountAmount, activeDiscounts} = snapshot;
			if (submitInFlightRef.current) {
				throw new Error("Pesanan sedang diproses. Tunggu hasilnya sebelum mencoba lagi.");
			}
			if (pendingCheckoutRequest && !recoverySnapshot) {
				throw new Error("Pulihkan pesanan awal terlebih dahulu agar tidak membuat transaksi ganda.");
			}
			if (!isShiftOpen && !recoverySnapshot) {
				throw new Error("Buka shift terlebih dahulu melalui menu Shift.");
			}
			if (cartItems.length === 0) throw new Error("Pilih menu terlebih dahulu.");
			submitInFlightRef.current = true;
			setIsSubmitting(true);
			try {
					const useMayarGateway = paymentMethod === "qris_mayar";
					if (useMayarGateway && !navigator.onLine) throw new Error("QRIS dinamis membutuhkan koneksi. Pilih tunai atau sambungkan internet terlebih dahulu.");
					const normalizedPaymentMethod = useMayarGateway
						? "mayar"
						: paymentMethod === "tunai" ? "cash" : paymentMethod || "cash";
					let mayarInvoice:
						| { id?: string; transactionId?: string; link?: string }
						| undefined;
					if (useMayarGateway) {
						if (!siteSettings?.mayarEnabled) {
							throw new Error("Pembayaran QRIS belum diaktifkan di pengaturan sistem");
						}
						if (!mayarConfig?.configured) {
							throw new Error("Konfigurasi pembayaran QRIS belum lengkap");
						}
						const mayarCustomerName = customerInfo.name.trim();
						const mayarCustomerEmail = customerInfo.email?.trim() || "";
						const mayarCustomerPhone = customerInfo.phone?.trim() || "";
						if (!mayarCustomerName) throw new Error("Nama customer wajib diisi sebelum pembayaran");
						if (!mayarCustomerEmail) throw new Error("Email customer wajib diisi sebelum pembayaran");
						if (!mayarCustomerPhone) throw new Error("Nomor WhatsApp customer wajib diisi sebelum pembayaran");
					}

					const shouldOpenBill = Boolean(orderData?.isOpenBill || useMayarGateway);
					const { taxAmount, serviceChargeAmount } = calculateOrderTax({
						items: cartItems,
						voucherDiscountAmount,
						...snapshot.taxPolicy,
						source: "pos",
						paymentMethod: paymentMethod || "tunai",
					});
					// Allocate the stable request identity only after local validation and
					// tax calculation have succeeded. A locally invalid draft must not
					// become an unrecoverable remote-write attempt.
					const idempotencyKey = getOrderRequestKey(JSON.stringify({snapshot, finalAmount, paymentMethod, discountId, orderData}));
					paymentRequestIdRef.current = idempotencyKey;
					const orderPayload = {
						items: cartItems.map((i) => ({
							productId: i.productId as Id<"products">,
							productName: i.name,
							categoryId: i.category,
							variant: i.variant,
							quantity: i.quantity,
							price: i.price,
							originalPrice: i.originalPrice,
							platformPrice: i.platformPrice,
						})),
						totalAmount: finalAmount,
						paymentMethod: normalizedPaymentMethod,
						source: "pos" as const,
						createdAt: Date.now(),
						cashReceived: orderData?.cashReceived,
						changeAmount: orderData?.changeAmount,
						freeRefillSelected: customerInfo.isFreeRefill,
						shiftId: snapshot.shiftId,
						customerName: customerInfo.name || "Pelanggan",
						customerEmail: customerInfo.email?.trim() || null,
						customerPhone: customerInfo.phone?.trim() || null,
						deliveryContactName: customerInfo.name?.trim() || null,
						deliveryContactPhone: customerInfo.phone?.trim() || null,
						tableNumber: orderData?.tableNumber,
						orderType: orderData?.orderType,
						notes: orderData?.notes || customerInfo.notes,
						platform: customerInfo.platform,
						platformCommission: customerInfo.platformCommission,
						voucherId: discountId as Id<"discounts"> | undefined,
						// Promo/Happy Hour sudah tercermin di item.price.
						// Hanya voucher yang boleh dikurangkan lagi oleh tax authority,
						// agar diskon promo tidak terhitung dua kali.
						discountAmount: getAdditionalOrderDiscount(promoDiscountAmount, voucherDiscountAmount),
						taxAmount,
						serviceChargeAmount,
					receiptMeta: buildReceiptMetaFromCart({
						items: cartItems,
						allDiscounts: activeDiscounts,
						appliedVoucher,
						promoDiscountAmount,
						voucherDiscountAmount,
						taxAmount,
						serviceChargeAmount,
					}),
					paymentGateway: mayarInvoice
						? {
								provider: "mayar",
								invoiceId: mayarInvoice.id!,
								transactionId: mayarInvoice.transactionId,
								invoiceUrl: mayarInvoice.link,
								status: "created" as const,
						  }
						: undefined,
					paymentReceiptKind: mayarInvoice ? "gateway_pending" as const : undefined,
					idempotencyKey,
					reconcileOnly: Boolean(recoverySnapshot && !isShiftOpen),
					isOpenBill: shouldOpenBill,
					autoComplete: shouldOpenBill ? false : orderData?.autoComplete,
					assignments: orderData?.assignments,
				};

				if (!navigator.onLine) {
					queueOfflineAction("createOrder", orderPayload);
					paymentRequestIdRef.current = null;
					clearOrderRequestKey();
					toast.warning("Offline: pesanan masuk antrean sinkronisasi");
					clearCart();
					setIsPaymentOpen(false);
					return {orderId:null,status:"queued",paymentMethod:normalizedPaymentMethod,total:finalAmount,customerName:customerInfo.name,cashReceived:orderData?.cashReceived,changeAmount:orderData?.changeAmount};
				}

				const orderId = await createOrder(orderPayload);

				if (useMayarGateway) {
					const invoiceResult = await createMayarInvoice({
						orderId: String(orderId),
						idempotencyKey,
						paymentMethod: "qris",
						redirectUrl: typeof window !== "undefined" ? window.location.href : undefined,
					});
					if (!invoiceResult.data?.id || !invoiceResult.data?.link) {
						throw new Error(invoiceResult.messages || "Gagal membuat invoice pembayaran");
					}
					mayarInvoice = invoiceResult.data;
				}

				if (shouldOpenBill) {
					if (useMayarGateway) {
						toast.success("Invoice pembayaran berhasil dibuat"); triggerHybridRefresh();
					} else {
						toast.success("Open bill berhasil disimpan!"); triggerHybridRefresh();
					}
					setLastOrderId(orderId);
				} else {
					toast.success("Pesanan berhasil dibuat!"); triggerHybridRefresh();
					setLastOrderId(orderId);

					if (siteSettings?.autoPrintKitchenReceipt !== false) {
						void handlePrint(orderId, "kitchen");
					}
				}

				paymentRequestIdRef.current = null;
				clearOrderRequestKey();
				clearCart();
				setIsPaymentOpen(false);
				return {orderId:String(orderId),status:shouldOpenBill?"pending":"paid",paymentMethod:normalizedPaymentMethod,total:finalAmount,invoiceUrl:mayarInvoice?.link,customerName:customerInfo.name,cashReceived:orderData?.cashReceived,changeAmount:orderData?.changeAmount};
			} catch (error) {
				console.error(error);
				throw error;
			} finally {
				submitInFlightRef.current = false;
				setIsSubmitting(false);
				setPendingCheckoutRequest(readPendingCheckoutRecovery());
			}
		},
		[
			activeDiscounts,
			checkoutSnapshot,
			appliedVoucher,
			cartItems,
			createOrder,
			clearCart,
			createMayarInvoice,
			discountAmount,
			handlePrint,
			isShiftOpen,
			mayarConfig?.configured,
			pendingCheckoutRequest,
			promoDiscountAmount,
			serviceChargeAmount,
			siteSettings?.autoPrintKitchenReceipt,
			siteSettings?.mayarEnabled,
			siteSettings?.storeName,
			siteSettings?.storePhone,
			taxAmount,
			voucherDiscountAmount,
				customerInfo,
				shiftStatus,
			]
		);
	const handleRecoverCheckout = useCallback(async (): Promise<CheckoutSubmissionResult> => {
		const attempt = readPendingCheckoutRecovery();
		if (!attempt) {
			setPendingCheckoutRequest(null);
			throw new Error("Data pemulihan tidak tersedia. Periksa riwayat pesanan sebelum mencoba lagi.");
		}
		return handlePaymentConfirm(
			attempt.finalAmount,
			attempt.discountId,
			attempt.paymentMethod,
			attempt.orderData,
			attempt.snapshot,
		);
	}, [handlePaymentConfirm]);

	const cartDiscountPreview = Math.max(0, discountAmount || 0);
	const printerStatus = bluetoothPrinter.getStatus();

	const handleOpenSidebar = (tabId: string) => {
		openPanel(tabId as PosPanel);
	};

	// ── View-model untuk layar Menu baru (logika tetap, hanya bentuk datanya) ──
	const productionQueue = useProductionQueue();
	const [queueOpen, setQueueOpen] = useState(false);
	const [queueTab, setQueueTab] = useState<"active" | "done">("active");
	const [bonusOpen, setBonusOpen] = useState(false);

	const productVMs = useMemo<MenuProductVM[]>(() => {
		const categoryNameById = new Map<string, string>((categories ?? []).map((category: any) => [String(category._id), String(category.name)]));
		return displayedProducts.map((product: any) => {
			const pricing = calculateEffectivePrice({ _id: product._id, price: product.price, categoryId: product.categoryId }, activeDiscounts, { allowHappyHour: false });
			const quantity = Number(product.quantity ?? 0);
			return {
				id: String(product._id),
				raw: product,
				name: String(product.name ?? ""),
				image: product.image,
				menuNumber: product.menuNumber,
				price: pricing.finalPrice,
				originalPrice: pricing.originalPrice,
				promoLabel: pricing.isPromo ? (pricing.isHappyHour ? "HAPPY HOUR" : "PROMO") : null,
				cartQty: cartItems.filter((item) => item.productId === product._id).reduce((sum, item) => sum + item.quantity, 0),
				sold: product.isAvailable === false || (integratedStock && quantity <= 0),
				stock: integratedStock ? quantity : null,
				categoryName: categoryNameById.get(String(product.categoryId)) ?? "Lainnya",
			};
		});
	}, [displayedProducts, activeDiscounts, cartItems, categories, integratedStock]);

	const handleDecrementProduct = useCallback(
		(vm: MenuProductVM) => {
			const line = [...cartItems].reverse().find((item) => item.productId === vm.id);
			if (line) updateQuantity(line.productId, line.variant, -1);
		},
		[cartItems, updateQuantity],
	);

	const bonusVM = useMemo<BonusVM | null>(
		() =>
			progress && progress.hasTarget
				? {
						shiftPct,
						dailyPct,
						shiftCollected: progress.shiftCollected,
						shiftTarget: progress.shiftTarget,
						dailyCollected: progress.dailyCollected,
						dailyTarget: progress.dailyTarget,
						shiftBonusTotal: totalShiftBonusNow,
						dailyBonusTotal: totalDailyBonusNow,
						shiftMembers: shiftBonusSummary,
						dailyMembers: dailyBonusSummary,
					}
				: null,
		[progress, shiftPct, dailyPct, totalShiftBonusNow, totalDailyBonusNow, shiftBonusSummary, dailyBonusSummary],
	);

	return (
		<div className="flex h-app flex-row bg-background overflow-hidden relative">
			<Dialog open={happyHourNoticeOpen} onOpenChange={setHappyHourNoticeOpen}>
				<DialogContent className="max-w-sm rounded-3xl border-primary/15 p-5 shadow-2xl sm:p-6">
					<DialogHeader className="text-center">
						<div className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
							<ShoppingBag className="h-5 w-5" />
						</div>
						<DialogTitle className="text-xl font-black tracking-tight">Happy Hour sedang berlangsung</DialogTitle>
						<DialogDescription className="text-sm leading-relaxed">
							Benefit menu pilihan seharga <strong className="text-primary">Rp15.000</strong> khusus member DjiwaApp.
						</DialogDescription>
					</DialogHeader>
					<div className="mt-4 space-y-4">
						<div className="flex justify-center rounded-2xl bg-white p-3 shadow-inner ring-1 ring-border">
							<img
								alt="Scan untuk membuka DjiwaApp dan mendapatkan benefit Happy Hour"
								className="h-52 w-52 rounded-xl object-contain sm:h-56 sm:w-56"
								src="/djiwaapp-happy-hour-qr.jpg"
							/>
						</div>
						<div className="rounded-2xl bg-primary/[0.06] px-4 py-3 text-sm leading-relaxed text-foreground">
							<p className="font-bold text-primary">Arahkan customer untuk:</p>
							<ol className="mt-1 list-inside list-decimal text-muted-foreground">
								<li>Scan QR DjiwaApp</li>
								<li>Login atau daftar sebagai member</li>
								<li>Pesan melalui DjiwaApp</li>
							</ol>
						</div>
						<p className="text-center text-xs font-medium text-muted-foreground">
							Harga Happy Hour tidak berlaku untuk transaksi kasir biasa.
						</p>
						<button
							className="w-full rounded-2xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 transition-opacity hover:opacity-90"
							onClick={() => setHappyHourNoticeOpen(false)}
							type="button"
						>
							Mengerti
						</button>
					</div>
				</DialogContent>
			</Dialog>
			{/* LEFT CONTENT: Menu Area */}
			<div className="flex flex-1 flex-col overflow-hidden relative">
				<Sheet open={isStockPanelOpen} onOpenChange={setIsStockPanelOpen}>
					<SheetContent side="bottom" showCloseButton={false} className="h-[min(92dvh,760px)] max-h-[calc(100dvh-0.5rem)] overflow-hidden rounded-t-3xl p-0 sm:mx-auto sm:max-w-xl">
						<StockToolbarPanel
							products={(allProducts ?? products ?? []) as any[]}
							categories={(categories ?? []) as any[]}
							onClose={() => setIsStockPanelOpen(false)}
							onRefresh={() => { triggerHybridRefresh(); setProductRefreshTick((value) => value + 1); }}
						/>
					</SheetContent>
				</Sheet>

			<DeliveryCustomerQueue
				notifications={notifications}
				onOpenOrder={(notification) => {
					markNotificationRead(notification.id);
					setTransactionAlertIds((current) => current.filter((id) => id !== notification.id));
					setSelectedOrderNotification(notification);
					setSelectedOrderId(String(notification.action_payload?.orderId ?? notification.order_source_id ?? ""));
				}}
			/>

			<TransactionAlertStack
				notifications={notifications.filter((item) => transactionAlertIds.includes(item.id))}
				onDismiss={(notificationId) => { void removeNotification(notificationId); setTransactionAlertIds((current) => current.filter((id) => id !== notificationId)); }}
				onMarkCashierPaid={handleMarkCashierPaid}
				onOpenOrder={(notification) => {
					markNotificationRead(notification.id);
					setTransactionAlertIds((current) => current.filter((id) => id !== notification.id));
					setSelectedOrderNotification(notification);
					setSelectedOrderId(String(notification.action_payload?.orderId ?? notification.order_source_id ?? ""));
				}}
			/>

			<IosSheet open={isNotificationCenterOpen} onClose={() => setIsNotificationCenterOpen(false)} bare heightClass="h-[92dvh]" label="Notifikasi">
				<NotificationsScreen
					notifications={notifications}
					isLoading={notificationsLoading}
					error={notificationsError}
					onRetry={() => refreshNotifications(true)}
					onRefresh={() => refreshNotifications(true)}
					onMarkRead={markNotificationRead}
					onDismiss={(notificationId) => { void removeNotification(notificationId); setTransactionAlertIds((current) => current.filter((id) => id !== notificationId)); }}
					onOpenOrder={(notification) => {
						markNotificationRead(notification.id);
						setTransactionAlertIds((current) => current.filter((id) => id !== notification.id));
						setSelectedOrderNotification(notification);
						setSelectedOrderId(String(notification.action_payload?.orderId ?? notification.order_source_id ?? ""));
						setIsNotificationCenterOpen(false);
					}}
				/>
			</IosSheet>

			<OrderNotificationSheet
				open={Boolean(selectedOrderNotification)}
				order={(orders ?? []).find((order: any) => String(order._id ?? "") === selectedOrderId || String(order.orderNumber ?? "") === String(selectedOrderNotification?.order_number ?? "")) ?? null}
				notification={selectedOrderNotification}
				onClose={() => { setSelectedOrderNotification(null); setSelectedOrderId(null); }}
				onMarkCashierPaid={selectedOrderNotification ? () => handleMarkCashierPaid(selectedOrderNotification) : undefined}
			/>

				{/* Hidden MenuSidebar for control */}
				<MenuSidebar 
					hideTrigger
					triggerOpen={isSidebarOpen} 
					onOpenChange={setIsSidebarOpen} 
					initialTab={activeSidebarTab}
					onTabChange={tab => openPanel(tab as PosPanel)}
				/>
				<BarcodeTransactionScanner
					open={isBarcodeScannerOpen}
					onOpenChange={setIsBarcodeScannerOpen}
					onDetected={handleBarcodeDetected}
					transactionSuggestions={transactionSuggestions}
				/>

				<MenuScreen
					shiftOpen={shiftStatus === undefined ? undefined : isShiftOpen}
					cashierName={shiftStatus?.shiftInfo?.cashierName}
					shiftName={shiftStatus?.shiftInfo?.shiftName}
					statusSlot={<><HeaderClock /><PrinterStatusBadge /></>}
					offlinePending={offlinePendingCount}
					onOpenSync={() => openPanel("sync")}
					unread={unreadCount}
					categoryTabs={categoryTabs}
					activeCategoryId={activeCategoryId}
					activeParentId={activeParentId}
					subcategories={activeSubcategories}
					activeParentName={activeParentName}
					onSelectCategory={handleCategorySelect}
					onSelectSubcategory={(id) => setActiveCategoryId(id ?? activeParentId)}
					search={searchQuery}
					onSearch={setSearchQuery}
					products={productVMs}
					loading={isLoading}
					hasMore={hasMoreProducts}
					loadingMore={isLoadingMoreProducts}
					sentinelRef={loadMoreTriggerRef}
					scrollRef={mainScrollRef}
					onTapProduct={(vm) => handleProductClick(vm.raw)}
					onDecrement={handleDecrementProduct}
					cartCount={totalItems}
					cartTotal={finalTotal}
					hasCheckoutResult={Boolean(checkoutDraft.result)}
					onOpenCart={() => setIsCartOpen(true)}
					queueActive={productionQueue.active.length}
					queueDone={productionQueue.done.length}
					onOpenQueue={(tab) => { setQueueTab(tab); setQueueOpen(true); }}
					bonusPct={progress?.hasTarget ? dailyPct : null}
					onOpenBonus={() => setBonusOpen(true)}
					onScan={() => setIsBarcodeScannerOpen(true)}
					onOpenStock={() => setIsStockPanelOpen(true)}
					onOpenNotifications={() => { void navigate({ to: "/notifications" }); }}
					activePanel={panel}
					onNavigate={(id) => openPanel(id as PosPanel | null)}
					onOpenShift={() => openPanel("kas")}
					stockButtonProps={{ "data-stock-tutorial-target": "stock-button" }}
				/>
				<QueueSheet open={queueOpen} onClose={() => setQueueOpen(false)} initialTab={queueTab} queue={productionQueue} />
				<BonusSheet open={bonusOpen} onClose={() => setBonusOpen(false)} data={bonusVM} />
				<StockTutorial
					open={stockTutorialOpen}
					onOpenStock={() => setIsStockPanelOpen(true)}
					onFinish={() => {
						const dateKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
						const normalizedShift = stockTutorialShiftName.toLowerCase();
						const shiftKey = normalizedShift.includes("pagi") ? "pagi" : normalizedShift.includes("sore") ? "sore" : "lainnya";
						if (shiftKey !== "lainnya") window.localStorage.setItem(`pos-stock-tutorial:${dateKey}:${shiftKey}`, "done");
						setStockTutorialOpen(false);
					}}
				/>
			</div>

			{/* RIGHT CONTENT: Checkout Sidebar (Desktop/Tablet) */}
			<div className="hidden md:block w-[320px] lg:w-[380px] shrink-0 overflow-hidden relative">
				<CheckoutSidebar 
					onConfirmPayment={handlePaymentConfirm} 
					isSubmitting={isSubmitting} 
					lastOrderId={lastOrderId}
					onPrintOrder={(orderId, mode) => { void handlePrint(orderId as Id<"orders">, mode); }}
					onPrintLastOrder={() => lastOrderId && handlePrint(lastOrderId)}
					onPrintOpenBill={handlePrintCurrentOpenBill}
					onPrintKitchen={() => lastOrderId && handlePrint(lastOrderId, "kitchen")}
					canPrintOpenBill={siteSettings?.allowOpenBillPrint !== false}
					pendingPayment={pendingCheckoutRequest ? { customerName: pendingCheckoutRequest.snapshot.customerInfo.name, total: pendingCheckoutRequest.finalAmount } : undefined}
					onRecoverPayment={handleRecoverCheckout}
				/>
			</div>

			<ProductOptionsSheet
				product={selectedProduct}
				activeDiscounts={activeDiscounts}
				onClose={() => setSelectedProduct(null)}
				onAdd={(line) => {
					addToCart(line);
					setSelectedProduct(null);
					toast.success(`${line.name} ditambahkan ke keranjang`);
				}}
			/>

			{/* === CART DRAWER === */}
			<CartDrawer
				isOpen={isCartOpen}
				onClose={() => setIsCartOpen(false)}
				onConfirmPayment={handlePaymentConfirm}
				isSubmitting={isSubmitting}
				lastOrderId={lastOrderId}
				onPrintOrder={(orderId, mode) => { void handlePrint(orderId as Id<"orders">, mode); }}
				onPrintLastOrder={() => lastOrderId && handlePrint(lastOrderId)}
				onPrintOpenBill={handlePrintCurrentOpenBill}
				onPrintKitchen={() => lastOrderId && handlePrint(lastOrderId, "kitchen")}
				canPrintOpenBill={siteSettings?.allowOpenBillPrint !== false}
				pendingPayment={pendingCheckoutRequest ? { customerName: pendingCheckoutRequest.snapshot.customerInfo.name, total: pendingCheckoutRequest.finalAmount } : undefined}
				onRecoverPayment={handleRecoverCheckout}
			/>
			<PosWorkspaceMenu open={panel === "more"} onOpenChange={open => openPanel(open ? "more" : null)} onAction={handleWorkspaceAction} userName={currentUser?.name || "Kasir"} canAdmin={canOpenAdmin} canReport={canViewReports} hasProfile={Boolean(currentUser?.slug || currentUser?.username)} pendingCount={offlinePendingCount}/>
			<PosReadinessSheet open={panel === "readiness"} onOpenChange={open => openPanel(open ? "readiness" : null)} shiftOpen={isShiftOpen} shiftKnown={shiftStatus !== undefined} cashierName={shiftStatus?.shiftInfo?.cashierName || ""} online={isOnline} pendingCount={offlinePendingCount} unpaidCount={closingTasks.unpaid} onAction={handleWorkspaceAction}/>
			<OfflineSyncCenter open={panel === "sync"} onOpenChange={open => openPanel(open ? "sync" : null)}/>
			<Dialog open={logoutConfirmOpen} onOpenChange={setLogoutConfirmOpen}><DialogContent className="max-w-sm rounded-3xl p-5"><DialogHeader><DialogTitle>Keluar akun kasir?</DialogTitle><DialogDescription>{cartItems.length ? "Pesanan yang belum dikirim akan dihapus saat keluar." : "Pesanan offline yang sudah masuk antrean tetap tersimpan."}</DialogDescription></DialogHeader><div className="grid grid-cols-2 gap-3"><button type="button" onClick={() => setLogoutConfirmOpen(false)} className="min-h-12 rounded-xl border text-sm font-semibold">Tetap di sini</button><button type="button" onClick={async () => { await logout(); clearCart(); void navigate({to:"/kasir/login",replace:true} as any); }} className="min-h-12 rounded-xl bg-destructive text-sm font-semibold text-white">{cartItems.length ? "Keluar & hapus" : "Keluar akun"}</button></div></DialogContent></Dialog>

			{/* === PAYMENT MODAL === */}
			<PaymentConfirmationModal
				isOpen={isPaymentOpen}
				onClose={() => {
					if (!submitInFlightRef.current) paymentRequestIdRef.current = null;
					setIsPaymentOpen(false);
				}}
				isSubmitting={isSubmitting}
				onConfirm={async (...args) => { try { await handlePaymentConfirm(...args); } catch(error) {toast.error(error instanceof Error ? error.message : "Pesanan belum tersimpan. Coba lagi.");} }}
			/>

			<Dialog open={shiftReminderOpen} onOpenChange={setShiftReminderOpen}>
				<DialogContent className="max-w-md">
					<DialogHeader>
						<DialogTitle className="text-lg font-black tracking-tight">
							{shiftReminderState === "overdue"
								? "Shift Sudah Lewat Jam Tutup"
								: "Shift Akan Segera Ditutup"}
						</DialogTitle>
						<DialogDescription className="text-sm">
							{shiftReminderState === "overdue"
								? `Shift ${shiftStatus?.shiftInfo?.shiftName || ""} sudah melewati jam tutup ${formatClockTime(
										activeShiftSchedule?.closeTime
								  )}. Kasir sebaiknya segera tutup shift.`
								: `Shift ${shiftStatus?.shiftInfo?.shiftName || ""} akan tutup pada ${formatClockTime(
										activeShiftSchedule?.closeTime
								  )}. Popup ini muncul ${shiftReminderMinutes} menit sebelumnya agar kasir bisa bersiap.`}
						</DialogDescription>
					</DialogHeader>

					<div className="rounded-2xl border border-border bg-muted/40 p-4 text-sm">
						<div className="flex items-center justify-between gap-3">
							<span className="text-muted-foreground">Kasir</span>
							<span className="font-bold text-foreground">
								{shiftStatus?.shiftInfo?.cashierName || "-"}
							</span>
						</div>
						<div className="mt-2 flex items-center justify-between gap-3">
							<span className="text-muted-foreground">Jam buka</span>
							<span className="font-bold text-foreground">
								{formatClockTime(activeShiftSchedule?.openTime)}
							</span>
						</div>
						<div className="mt-2 flex items-center justify-between gap-3">
							<span className="text-muted-foreground">Jam tutup</span>
							<span className="font-bold text-foreground">
								{formatClockTime(activeShiftSchedule?.closeTime)}
							</span>
						</div>
					</div>

					<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
						<button
							type="button"
							onClick={() => setShiftReminderOpen(false)}
							className="rounded-xl border border-border px-4 py-2.5 font-bold text-foreground transition-all hover:bg-muted"
						>
							Nanti Lagi
						</button>
						<button
							type="button"
							onClick={() => {
								setShiftReminderOpen(false);
								openPanel("kas");
							}}
							className="rounded-xl bg-primary px-4 py-2.5 font-bold text-primary-foreground transition-all hover:opacity-90"
						>
							Buka Panel Shift
						</button>
					</div>
				</DialogContent>
			</Dialog>

			{priceDialogProduct && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setPriceDialogProduct(null)}>
					<div className="mx-4 w-full max-w-sm rounded-2xl bg-white p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
						<h3 className="text-center text-xs font-black uppercase tracking-wider text-foreground">Harga Online</h3>
						<p className="mb-4 text-center text-xs text-muted-foreground">{priceDialogProduct.product.name}</p>
						<div className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 p-3 mb-3">
							<span className="text-sm font-bold text-muted-foreground">Rp</span>
							<input autoFocus type="text" inputMode="numeric" className="flex-1 bg-transparent text-base font-black text-foreground outline-none"
								value={priceDialogValue}
								onChange={(e) => { const v = e.target.value.replace(/\D/g, ""); setPriceDialogValue(v); }}
								onKeyDown={(e) => {
									if (e.key === "Enter") {
										const customPrice = parseInt(priceDialogValue) || priceDialogProduct.defaultPrice;
										const p = priceDialogProduct.product;
										addToCart({ productId: p._id, name: p.name, price: customPrice, originalPrice: p.price, platformPrice: customPrice, quantity: 1, image: p.image, category: p.categoryId });
										toast.success(p.name + " ditambahkan (Rp " + customPrice.toLocaleString("id-ID") + ")");
										setPriceDialogProduct(null);
									}
									if (e.key === "Escape") setPriceDialogProduct(null);
								}}
							/>
						</div>
						<div className="text-center text-[11px] text-muted-foreground mb-4">Menu: {fmt(priceDialogProduct.product.price)}</div>
						<div className="flex gap-2">
							<button type="button" onClick={() => setPriceDialogProduct(null)} className="flex-1 rounded-xl border border-border bg-background py-2 text-xs font-bold text-muted-foreground hover:bg-muted">Batal</button>
							<button type="button" onClick={() => {
								const customPrice = parseInt(priceDialogValue) || priceDialogProduct.defaultPrice;
								const p = priceDialogProduct.product;
								addToCart({ productId: p._id, name: p.name, price: customPrice, originalPrice: p.price, platformPrice: customPrice, quantity: 1, image: p.image, category: p.categoryId });
								toast.success(p.name + " ditambahkan (Rp " + customPrice.toLocaleString("id-ID") + ")");
								setPriceDialogProduct(null);
							}} className="flex-1 rounded-xl bg-orange-500 py-2.5 text-sm font-bold text-white shadow-md shadow-orange-500/20 hover:opacity-90">Tambah</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}

// Product Detail Sheet Component
function ProductDetailSheet({
	product,
	activeDiscounts,
	onClose,
	onAddToCart,
}: {
	product: any;
	activeDiscounts: any;
	onClose: () => void;
	onAddToCart: (item: { productId: string; name: string; price: number; originalPrice?: number; quantity: number; variant?: string; image?: string; category?: string }) => void;
}) {
	const [quantity, setQuantity] = useState(1);
	const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({});
	const rawVariationGroups = Array.isArray(product?.variations) ? product.variations : [];
	const variationGroups = rawVariationGroups
		.map((group: any, index: number) => ({
			key: "variation-" + index,
			label: String(group?.name ?? group?.type ?? "").trim() || "Pilihan " + (index + 1),
			options: Array.isArray(group?.options) ? group.options : [],
		}))
		.filter((group: any) => group.options.length > 0);

	useEffect(() => {
		if (!product) return;
		setQuantity(1);
		const defaults: [string, string][] = rawVariationGroups.flatMap((group: any, index: number) => {
			const firstOption = Array.isArray(group?.options) ? group.options[0] : undefined;
			return firstOption?.name ? [["variation-" + index, firstOption.name]] : [];
		});
		setSelectedVariants(Object.fromEntries(defaults));
	}, [product]);

	if (!product) return null;

	const pricing = calculateEffectivePrice(
		{
			_id: product._id,
			price: product.price,
			categoryId: product.categoryId,
		},
		activeDiscounts,
		{ allowHappyHour: false }
	);

	const variantPrice = variationGroups.reduce((sum: number, group: any) => {
		const option = group.options.find((item: any) => item.name === selectedVariants[group.key]);
		return sum + (Number(option?.price) || 0);
	}, 0);
	const unitPrice = pricing.finalPrice + variantPrice;
	const totalPrice = unitPrice * quantity;
	const isSelectionComplete = variationGroups.every((group: any) => Boolean(selectedVariants[group.key]));
	const variantLabel = variationGroups
		.map((group: any) => selectedVariants[group.key])
		.filter(Boolean)
		.join(" · ");

	const handleAdd = () => {
		onAddToCart({
			productId: product._id,
			name: product.name,
			price: unitPrice,
			originalPrice: pricing.originalPrice + variantPrice,
			quantity,
			variant: variantLabel || undefined,
			image: product.image,
			category: product.categoryId,
		});
	};

	return (
		<div className="flex max-h-[84dvh] min-h-0 flex-col bg-background">
			<header className="shrink-0 px-4 pb-2 pt-2">
				<div className="mx-auto mb-2 h-1 w-8 rounded-full bg-muted-foreground/25" aria-hidden="true" />
				<div className="flex items-start justify-between gap-3">
					<div className="min-w-0">
						<SheetTitle className="text-lg leading-tight tracking-tight text-foreground">{product.name}</SheetTitle>
						{product.description && <p className="mt-1 line-clamp-2 text-xs leading-snug text-muted-foreground">{product.description}</p>}
					</div>
					<button
						type="button"
						onClick={onClose}
						className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted/70 text-muted-foreground transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
						aria-label="Tutup detail produk"
					>
						<X className="h-5 w-5" />
					</button>
				</div>
				<div className="mt-2 flex min-h-9 items-center justify-between gap-3 rounded-xl bg-muted/45 px-3 py-1.5">
					<div className="flex min-w-0 items-center gap-2">
						{pricing.isPromo && <span className="truncate text-xs font-medium text-muted-foreground line-through">{fmt(pricing.originalPrice)}</span>}
						<span className="truncate text-base font-bold tabular-nums text-foreground">{fmt(pricing.finalPrice)}</span>
					</div>
					{pricing.isPromo && pricing.discountName && <span className="shrink-0 rounded-full bg-red-500/10 px-2.5 py-1 text-[11px] font-semibold text-red-600">{pricing.discountName}</span>}
				</div>
			</header>

			<div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain border-t border-border/60 px-3 py-3">
				{variationGroups.length > 0 && (
					<div className="space-y-2.5">
						{variationGroups.map((group: any) => (
							<section key={group.key} className="rounded-2xl border border-border/60 bg-muted/20 p-2.5" aria-labelledby={group.key + "-title"}>
								<div className="mb-2 flex items-center justify-between gap-3">
									<div className="min-w-0">
										<h3 id={group.key + "-title"} className="truncate text-sm font-semibold text-foreground">{group.label}</h3>
									</div>
									<span className="shrink-0 text-[11px] font-medium text-muted-foreground" aria-live="polite">
										{selectedVariants[group.key] ? "Dipilih" : "Belum dipilih"}
									</span>
								</div>
								<div className="flex gap-2 overflow-x-auto overscroll-x-contain pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="radiogroup" aria-labelledby={group.key + "-title"}>
									{group.options.map((option: any) => {
										const selected = selectedVariants[group.key] === option.name;
										const optionPrice = Number(option.price) || 0;
										return (
											<button
												key={option.name}
												type="button"
												role="radio"
												aria-checked={selected}
												tabIndex={selected ? 0 : -1}
												onKeyDown={(event) => {
													const direction = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
													if (!direction) return;
													event.preventDefault();
													const options = Array.from(event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]') ?? []);
													const currentIndex = options.indexOf(event.currentTarget);
													const nextIndex = (currentIndex + direction + options.length) % options.length;
													options[nextIndex]?.focus();
													options[nextIndex]?.click();
												}}
												onClick={() => setSelectedVariants((previous) => ({ ...previous, [group.key]: option.name }))}
												className={cn(
												"flex h-10 min-w-[9.5rem] flex-1 items-center justify-between gap-1.5 rounded-xl border px-2.5 text-left transition-colors active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
													selected
														? "border-primary bg-primary text-primary-foreground shadow-sm"
														: "border-border/80 bg-background text-foreground hover:border-primary/40"
												)}
											>
												<span className="min-w-0 truncate whitespace-nowrap text-[13px] font-semibold leading-tight">{option.name}</span>
												<span className="flex shrink-0 items-center gap-1 text-[11px] font-medium tabular-nums">
													{optionPrice > 0 ? "+" + fmt(optionPrice) : "Gratis"}
													{selected ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : null}
												</span>
											</button>
										);
									})}
								</div>
							</section>
						))}
					</div>
				)}

				<section className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-muted/20 p-2.5" aria-label="Jumlah pesanan">
					<div className="min-w-0">
						<h3 className="text-sm font-semibold text-foreground">Jumlah</h3>
						<p className="mt-0.5 text-xs text-muted-foreground">Atur porsi</p>
					</div>
					<div className="flex h-10 shrink-0 items-center gap-1 rounded-full bg-muted/60 p-1">
						<button type="button" onClick={() => setQuantity((value) => Math.max(1, value - 1))} className="flex h-8 w-8 items-center justify-center rounded-full bg-background text-foreground shadow-sm transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label="Kurangi jumlah">
							<Minus className="h-4 w-4" />
						</button>
						<span className="min-w-7 text-center text-sm font-bold tabular-nums text-foreground" aria-live="polite">{quantity}</span>
						<button type="button" onClick={() => setQuantity((value) => value + 1)} className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2" aria-label="Tambah jumlah">
							<Plus className="h-4 w-4" />
						</button>
					</div>
				</section>
			</div>

			<footer className="shrink-0 border-t border-border/70 bg-background px-3 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2">
				<div className="mb-2 flex items-center justify-between gap-3 rounded-xl bg-muted/45 px-3 py-2">
					<div className="min-w-0">
						<p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Total · {quantity} item</p>
						<p className="mt-0.5 truncate text-base font-bold tabular-nums text-foreground">{fmt(totalPrice)}</p>
					</div>
					<p className="max-w-[48%] truncate text-right text-xs font-medium text-muted-foreground" aria-live="polite">
						{variantLabel || "Tanpa variasi"}
					</p>
				</div>
				<button
					type="button"
					onClick={handleAdd}
					disabled={!isSelectionComplete}
					className="flex min-h-12 w-full items-center justify-between rounded-xl bg-primary px-3.5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-transform active:scale-[.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
				>
					<span>Tambah ke keranjang</span>
					<span className="tabular-nums">{fmt(totalPrice)}</span>
				</button>
			</footer>
		</div>
	);
}
