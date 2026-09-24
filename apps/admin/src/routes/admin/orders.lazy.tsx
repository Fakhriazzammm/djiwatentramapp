import { createLazyFileRoute } from "@tanstack/react-router";
import type { Id } from "@/types/backend-compat";
import { formatPaymentLabel } from "@yumipos/web-shared/lib/payment-label";
import { getDisplayOrderNumber } from "@yumipos/web-shared/lib/order-number";
import {
	endOfDay,
	endOfMonth,
	endOfWeek,
	format,
	startOfDay,
	startOfMonth,
	startOfWeek,
	subDays,
	subMonths,
	subWeeks,
} from "date-fns";
import { id } from "date-fns/locale/id";
import {
	CheckCircle,
	ChevronDown,
	Clock,
	Copy,
	CreditCard,
	Eye,
	Filter,
	Loader2,
	RefreshCw,
	Search,
	ShoppingBag,
	Star,
	User,
	XCircle,
	Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { playSuccessSound } from "@/lib/play-success-sound";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	useHybridHppProductMap,
	useHybridOrders,
	useHybridShiftReportRows,
} from "@/hooks/use-hybrid-pos-data";
import { triggerHybridRefresh } from "@/hooks/use-hybrid-pos-data";
import { useHybridOrdersCogs } from "@/hooks/use-hybrid-finance-analytics-data";
import { useHybridBookingOrders } from "@/hooks/use-hybrid-booking-data";
import {
	useHybridDeleteBookingOrder,
	useHybridDeleteOrder,
	useHybridUpdateBookingStatus,
	useHybridUpdateB2BDeliveryStatus,
	useHybridUpdateMieYaminDeliveryStatus,
	useHybridUpdateOrderStatus,
} from "@/hooks/use-hybrid-write-actions";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";

export const Route = createLazyFileRoute("/admin/orders")({
	component: AdminOrders,
});

// Define types locally since they might not be fully exported from dataModel yet
interface OrderItem {
	productId: Id<"products">;
	productName: string;
	variant?: string;
	quantity: number;
	price: number;
}

interface Order {
	_id: Id<"orders">;
	_creationTime: number;
	orderNumber: string;
	status: "pending" | "paid" | "completed" | "cancelled";
	deliveryStatus?: string | null;
	totalAmount: number;
	paymentMethod: string;
	customerName?: string;
	customerEmail?: string | null;
	customerPhone?: string | null;
	deliveryContactPhone?: string | null;
	deliveryAddress?: string | null;
	customer_source_id?: string;
	items: OrderItem[];
	createdAt: number;
	type?: string;
	displayId?: string;
	[key: string]: any;
}

function normalizeReferenceCode(value?: string | null) {
	return String(value || "")
		.trim()
		.replace(/^#/, "")
		.replace(/^BK-/i, "")
		.replace(/\s+/g, "")
		.toUpperCase();
}

type QuickDateFilter =
	| "all"
	| "today"
	| "yesterday"
	| "thisWeek"
	| "lastWeek"
	| "thisMonth"
	| "lastMonth";

type BusinessFilter = "all" | "pos" | "mieyamin" | "b2b" | "booking";

type OrderChannel = {
	label: string;
	className: string;
};

function resolveOrderChannel(order: any): OrderChannel {
	const businessUnit = String(order.businessUnit ?? order.business_unit ?? "").trim().toLowerCase();
	const brandSlug = String(order.brandSlug ?? order.brand_slug ?? "").trim().toLowerCase();
	const source = String(order.source ?? order.sourceApp ?? order.source_app ?? "").trim().toLowerCase();
	const orderType = String(order.orderType ?? "").trim().toLowerCase();
	const joined = `${source} ${orderType}`;

	if (order.type === "booking" || order.businessCategory === "booking") {
		return { label: "Booking", className: "bg-blue-100 text-blue-700" };
	}
	if (businessUnit === "ordermieyamin" || businessUnit === "mieyamin") {
		return { label: "Mie Yamin", className: "bg-amber-100 text-amber-800" };
	}
	if (brandSlug === "b2b" || businessUnit === "b2b") {
		return { label: "B2B", className: "bg-slate-900 text-amber-300" };
	}
	if (joined.includes("gofood") || joined.includes("go_food")) {
		return { label: "GoFood", className: "bg-green-100 text-green-700" };
	}
	if (joined.includes("grabfood") || joined.includes("grab_food")) {
		return { label: "GrabFood", className: "bg-green-100 text-green-700" };
	}
	if (joined.includes("shopeefood") || joined.includes("shopee_food")) {
		return { label: "ShopeeFood", className: "bg-orange-100 text-orange-700" };
	}
	if (joined.includes("djiwaapp") || joined.includes("customer_self_service") || joined.includes("customer-app")) {
		return { label: "DjiwaApp", className: "bg-violet-100 text-violet-700" };
	}
	if (joined.includes("telegram")) {
		return { label: "Telegram", className: "bg-sky-100 text-sky-700" };
	}
	if (source && !["pos", "kasir", "internal"].includes(source)) {
		return { label: source.replace(/[_-]+/g, " ").replace(/\b\w/g, (char: string) => char.toUpperCase()), className: "bg-muted text-muted-foreground" };
	}
	return { label: "POS", className: "bg-gray-100 text-gray-700" };
}

const MIE_YAMIN_DELIVERY_STATUSES = [
	{ value: "pending_payment", label: "Menunggu pembayaran" },
	{ value: "paid", label: "Pembayaran diterima" },
	{ value: "preparing", label: "Sedang dibuat" },
	{ value: "packing", label: "Sedang dipacking" },
	{ value: "ready_to_ship", label: "Siap dikirim" },
	{ value: "out_for_delivery", label: "Sedang dikirim" },
	{ value: "delivered", label: "Selesai" },
	{ value: "failed", label: "Gagal" },
	{ value: "cancelled", label: "Dibatalkan" },
] as const;

type MieYaminDeliveryStatus = (typeof MIE_YAMIN_DELIVERY_STATUSES)[number]["value"];

const B2B_DELIVERY_STATUSES = [
	{ value: "pending_payment", label: "Menunggu pembayaran" },
	{ value: "paid", label: "Diterima" },
	{ value: "preparing", label: "Sedang dibuat" },
	{ value: "packing", label: "Dikemas" },
	{ value: "ready_to_ship", label: "Siap dikirim" },
	{ value: "out_for_delivery", label: "Sedang dikirim" },
	{ value: "delivered", label: "Selesai" },
] as const;

type B2BDeliveryStatus = (typeof B2B_DELIVERY_STATUSES)[number]["value"];

const quickDateFilterOptions: Array<{
	value: QuickDateFilter;
	label: string;
}> = [
	{ value: "today", label: "Hari Ini" },
	{ value: "yesterday", label: "Kemarin" },
	{ value: "thisWeek", label: "Minggu Ini" },
	{ value: "lastWeek", label: "Minggu Kemarin" },
	{ value: "thisMonth", label: "Bulan Ini" },
	{ value: "lastMonth", label: "Bulan Kemarin" },
];

function AdminOrders() {
	const allOrders = useHybridOrders();
	const allBookingOrders = useHybridBookingOrders({ slug: "booking" });
	
	const updateStatus = useHybridUpdateOrderStatus();
	const updateB2BDeliveryStatus = useHybridUpdateB2BDeliveryStatus();
	const updateMieYaminDeliveryStatus = useHybridUpdateMieYaminDeliveryStatus();
	const updateBookingStatus = useHybridUpdateBookingStatus();
	const deleteOrder = useHybridDeleteOrder();
	const deleteBookingOrder = useHybridDeleteBookingOrder();
	
	const hppProductMap = useHybridHppProductMap();
	const hppCogs = useHybridOrdersCogs();
	const historicalShifts = useHybridShiftReportRows();

	const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
	const [statusFilter, setStatusFilter] = useState<string>("all");
	const [businessFilter, setBusinessFilter] = useState<BusinessFilter>(() => {
		if (typeof window === "undefined") return "all";
		const value = new URLSearchParams(window.location.search).get("business");
		return value === "pos" || value === "mieyamin" || value === "b2b" || value === "booking" ? value : "all";
	});
	const [searchQuery, setSearchQuery] = useState("");
	const [quickDateFilter, setQuickDateFilter] =
		useState<QuickDateFilter>("all");
	const [isDetailOpen, setIsDetailOpen] = useState(false);
	const [hasAppliedFocus, setHasAppliedFocus] = useState(false);
	const [showMobileOverview, setShowMobileOverview] = useState(false);
	const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
	const [updatingDeliveryId, setUpdatingDeliveryId] = useState<string | null>(null);
	const [isBulkDeleting, setIsBulkDeleting] = useState(false);
	const [deleteConfirmation, setDeleteConfirmation] = useState<{ ids: string[]; singleOrder?: Order } | null>(null);

	const getQuickDateRange = (filter: QuickDateFilter) => {
		const now = new Date();

		switch (filter) {
			case "today":
				return {
					start: startOfDay(now).getTime(),
					end: endOfDay(now).getTime(),
				};
			case "yesterday": {
				const yesterday = subDays(now, 1);
				return {
					start: startOfDay(yesterday).getTime(),
					end: endOfDay(yesterday).getTime(),
				};
			}
			case "thisWeek":
				return {
					start: startOfWeek(now, { weekStartsOn: 1 }).getTime(),
					end: endOfWeek(now, { weekStartsOn: 1 }).getTime(),
				};
			case "lastWeek": {
				const lastWeek = subWeeks(now, 1);
				return {
					start: startOfWeek(lastWeek, { weekStartsOn: 1 }).getTime(),
					end: endOfWeek(lastWeek, { weekStartsOn: 1 }).getTime(),
				};
			}
			case "thisMonth":
				return {
					start: startOfMonth(now).getTime(),
					end: endOfMonth(now).getTime(),
				};
			case "lastMonth": {
				const lastMonth = subMonths(now, 1);
				return {
					start: startOfMonth(lastMonth).getTime(),
					end: endOfMonth(lastMonth).getTime(),
				};
			}
			default:
				return null;
		}
	};

	// Unified orders list
	const unifiedOrders = (() => {
		if (!allOrders && !allBookingOrders) return undefined;
		
		const orders = (allOrders || []).map((o: any) => ({
			...o,
			type: "regular",
			businessCategory: o.businessCategory ?? (o.businessUnit === "ordermieyamin" || o.business_unit === "ordermieyamin")
				? "mieyamin"
				: o.brandSlug === "b2b" || o.brand_slug === "b2b" || o.businessUnit === "b2b" || o.business_unit === "b2b"
					? "b2b"
					: "pos",
			id: o._id,
			displayId: getDisplayOrderNumber(o.orderNumber, {
				sequence: o.dailyReceiptNo ?? o.daily_receipt_no,
				createdAt: o.createdAt,
				source: o.source,
				sourceApp: o.sourceApp,
				businessUnit: o.businessUnit,
				brandSlug: o.brandSlug ?? o.brand_slug,
				orderType: o.orderType,
				platform: o.platform,
			}),
			date: o.createdAt,
		}));
		
		const bookings = (allBookingOrders || []).map((b: any) => ({
			...b,
			items: Array.isArray(b.items)
				? b.items.map((item: any) => ({
						...item,
						productName: item.productName ?? item.name ?? "Item booking",
					}))
				: [],
			type: "booking",
			businessCategory: "booking",
			id: b._id,
			displayId: b.bookingCode,
			status: b.bookingStatus, // Map bookingStatus to status for filtering
			date: b.createdAt,
			orderNumber: b.bookingCode, // For search compatibility
		}));
		
		return [...orders, ...bookings].sort((a, b) => b.date - a.date);
	})();

	// Client-side filtering
	const filteredOrders = unifiedOrders?.filter((order: any) => {
		const matchesBusiness = businessFilter === "all" || order.businessCategory === businessFilter;
		const matchesStatus =
			statusFilter === "all" || order.status === statusFilter;
		const normalizedSearch = searchQuery.trim().toLowerCase();
		const matchesSearch = !normalizedSearch || [order.displayId, order.orderNumber, order.bookingCode, order.customerName, order.customerPhone, order.paymentMethod, resolveOrderChannel(order).label].some((value) => String(value || "").toLowerCase().includes(normalizedSearch));
		const activeDateRange = getQuickDateRange(quickDateFilter);
		const matchesQuickDate =
			!activeDateRange ||
			(order.createdAt >= activeDateRange.start &&
				order.createdAt <= activeDateRange.end);
		return matchesBusiness && matchesStatus && matchesSearch && matchesQuickDate;
	});

	const totalFiltered = filteredOrders?.length || 0;
	const filteredRevenue = (filteredOrders ?? []).reduce((sum: number, order: any) => sum + Number(order.totalAmount || 0), 0);
	const pendingCount = (filteredOrders ?? []).filter((order: any) => order.status === "pending").length;
	const completedCount = (filteredOrders ?? []).filter((order: any) => order.status === "completed").length;
	const activeFilterCount = [searchQuery.trim(), statusFilter !== "all" ? statusFilter : "", businessFilter !== "all" ? businessFilter : "", quickDateFilter !== "all" ? quickDateFilter : ""].filter(Boolean).length;
	const resetFilters = () => { setSearchQuery(""); setStatusFilter("all"); setBusinessFilter("all"); setQuickDateFilter("all"); setSelectedOrderIds(new Set()); };
	const activeQuickDateLabel =
		quickDateFilter === "all"
			? "Semua tanggal"
			: quickDateFilterOptions.find((option) => option.value === quickDateFilter)
					?.label || "Semua tanggal";

	const getShiftMeta = (order: Order) => {
		if (!historicalShifts) {
			return { shiftName: "-", cashierName: "-" };
		}

		const shift = historicalShifts.find(
			(s: any) =>
				order.createdAt >= s.startTime && (!s.endTime || order.createdAt <= s.endTime)
		);
		if (!shift) {
			return { shiftName: "-", cashierName: "-" };
		}
		return {
			shiftName: shift.shiftName || "Shift Aktif",
			cashierName: shift.cashierName || "-",
		};
	};

	const getOrderLocationLabel = (order: Order) => {
		if (!order.orderType) {
			return "-";
		}
		return order.orderType === "dine_in"
			? `Meja ${order.tableNumber || "-"}`
			: "Takeaway";
	};

	useEffect(() => {
		if (hasAppliedFocus || !unifiedOrders) {
			return;
		}

		const params = new URLSearchParams(window.location.search);
		const focusBooking = params.get("focusBooking");
		const focusOrder = params.get("focusOrder");
		const focusValue = focusBooking || focusOrder;

		if (!focusValue) {
			setHasAppliedFocus(true);
			return;
		}

		const normalizedTarget = normalizeReferenceCode(focusValue);
		const matchedOrder = unifiedOrders.find((order: any) => {
			if (focusBooking && order.type !== "booking") {
				return false;
			}

			const candidates = [
				order.displayId,
				order.orderNumber,
				order.bookingCode,
				order._id,
			];

			return candidates.some(
				(candidate) => normalizeReferenceCode(String(candidate || "")) === normalizedTarget
			);
		});

		setStatusFilter("all");
		setQuickDateFilter("all");
		setSearchQuery(focusValue);

		if (matchedOrder) {
			setSelectedOrder(matchedOrder as any);
			setIsDetailOpen(true);
		}

		const nextUrl = new URL(window.location.href);
		nextUrl.searchParams.delete("focusOrder");
		nextUrl.searchParams.delete("focusBooking");
		window.history.replaceState({}, "", nextUrl.toString());
		setHasAppliedFocus(true);
	}, [hasAppliedFocus, unifiedOrders]);

	const handleStatusUpdate = async (
		newStatus: "pending" | "paid" | "completed" | "cancelled"
	) => {
		if (!selectedOrder) {
			return;
		}
		try {
			if ((selectedOrder as any).type === "booking") {
				await updateBookingStatus({ 
					id: (selectedOrder as any)._id, 
					bookingStatus: newStatus as any,
					paymentStatus: newStatus === "paid" ? "paid" : undefined
				});
			} else {
				await updateStatus({ id: selectedOrder._id, status: newStatus });
			}
			toast.success(
				`Status pesanan diperbarui menjadi ${getStatusLabel(newStatus)}`
			);
			setSelectedOrder({ ...selectedOrder, status: newStatus });
			if (newStatus === "paid" || newStatus === "completed") {
				playSuccessSound();
			}
		} catch (_error) {
			toast.error("Gagal memperbarui status pesanan");
		}
	};

	const getOrderTrackingOptions = (order: Order): readonly { value: string; label: string }[] =>
		resolveOrderChannel(order).label === "B2B" ? B2B_DELIVERY_STATUSES : MIE_YAMIN_DELIVERY_STATUSES;

	const getOrderTrackingLabel = (order: Order, status: string) =>
		getOrderTrackingOptions(order).find((item) => item.value === status)?.label ?? "Belum diatur";

	const handleDetailDeliveryStatusUpdate = async (newStatus: string) => {
		if (!selectedOrder) return;
		const channel = resolveOrderChannel(selectedOrder).label;
		if (channel !== "Mie Yamin" && channel !== "B2B") return;
		try {
			if (channel === "B2B") {
				await updateB2BDeliveryStatus({ id: String(selectedOrder._id), deliveryStatus: newStatus as B2BDeliveryStatus });
			} else {
				await updateMieYaminDeliveryStatus({ id: String(selectedOrder._id), deliveryStatus: newStatus as MieYaminDeliveryStatus });
			}
			setSelectedOrder({ ...selectedOrder, deliveryStatus: newStatus });
			triggerHybridRefresh();
			toast.success(`Tracking ${channel} diperbarui menjadi ${getOrderTrackingLabel(selectedOrder, newStatus)}`);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : `Gagal memperbarui tracking ${channel}`);
		}
	};

	const handleInlineDeliveryStatusUpdate = async (order: Order, newStatus: string) => {
		const channel = resolveOrderChannel(order).label;
		if (channel !== "Mie Yamin" && channel !== "B2B") return;
		setUpdatingDeliveryId(String(order._id));
		try {
			if (channel === "B2B") {
				await updateB2BDeliveryStatus({ id: String(order._id), deliveryStatus: newStatus as B2BDeliveryStatus });
			} else {
				await updateMieYaminDeliveryStatus({ id: String(order._id), deliveryStatus: newStatus as MieYaminDeliveryStatus });
			}
			if (selectedOrder?._id === order._id) {
				setSelectedOrder({ ...selectedOrder, deliveryStatus: newStatus });
			}
			triggerHybridRefresh();
			toast.success(`Tracking diperbarui menjadi ${getOrderTrackingLabel(order, newStatus)}`);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : `Gagal memperbarui tracking ${channel}`);
		} finally {
			setUpdatingDeliveryId(null);
		}
	};

	const toggleOrderSelection = (id: string) => {
		setSelectedOrderIds((current) => {
			const next = new Set(current);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	};

	const toggleAllVisibleOrders = () => {
		const visibleIds = (filteredOrders ?? []).map((order: Order) => String(order._id));
		setSelectedOrderIds((current) =>
			visibleIds.length > 0 && visibleIds.every((id) => current.has(id))
				? new Set()
				: new Set(visibleIds),
		);
	};

	const handleBulkDelete = async () => {
		const ids = Array.from(selectedOrderIds);
		if (!ids.length || isBulkDeleting) return;
		setDeleteConfirmation({ ids });
	};

	const confirmDelete = async () => {
		if (!deleteConfirmation || isBulkDeleting) return;
		const ids = deleteConfirmation.ids;
		setIsBulkDeleting(true);
		try {
			for (const id of ids) {
				const order = unifiedOrders?.find((item: any) => String(item._id) === id);
				if (!order) continue;
				if (order.type === "booking") await deleteBookingOrder({ id: order._id });
				else await deleteOrder({ id: order._id });
			}
			setSelectedOrderIds(new Set());
			setDeleteConfirmation(null);
			setIsDetailOpen(false);
			triggerHybridRefresh();
			toast.success(`${ids.length} pesanan berhasil dihapus`);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Sebagian pesanan gagal dihapus");
		} finally {
			setIsBulkDeleting(false);
		}
	};

	const allVisibleSelected = Boolean(
		filteredOrders?.length && filteredOrders.every((order: Order) => selectedOrderIds.has(String(order._id))),
	);

	const handleDeleteOrder = async (order: any) => {
		setDeleteConfirmation({ ids: [String(order._id)], singleOrder: order as Order });
	};

	const copyOrderId = async (order: Order) => {
		const value = `${order.type === "booking" ? "BK-" : "#"}${order.displayId}`;
		try {
			await navigator.clipboard.writeText(value);
			toast.success("ID order disalin");
		} catch {
			toast.error("ID order gagal disalin");
		}
	};

	const getPaymentLabel = (order: Order) => {
		if (order.status === "paid" || order.status === "completed") return "Lunas";
		if (order.status === "cancelled") return "Dibatalkan";
		return "Belum bayar";
	};

	const getTrackingValue = (order: Order) =>
		order.deliveryStatus || (order.status === "paid" || order.status === "completed" ? "paid" : "pending_payment");

	const formatrupiah = (amount: number) => {
		return new Intl.NumberFormat("id-ID", {
			style: "currency",
			currency: "IDR",
			minimumFractionDigits: 0,
		}).format(amount);
	};

	const getStatusBadgeVariant = (
		status: string
	): "warning" | "info" | "success" | "destructive" | "secondary" => {
		switch (status) {
			case "pending":
				return "warning";
			case "paid":
				return "info";
			case "completed":
				return "success";
			case "cancelled":
				return "destructive";
			default:
				return "secondary";
		}
	};

	const getStatusLabel = (status: string) => {
		switch (status) {
			case "paid":
				return "Lunas";
			case "completed":
				return "Selesai";
			case "pending":
				return "Open Bill";
			case "cancelled":
				return "Dibatalkan";
			default:
				return status;
		}
	};

	if (unifiedOrders === undefined) {
		return (
			<div className="space-y-3 md:space-y-5">
				<div className="space-y-2">
					<Skeleton className="h-8 w-52" />
					<Skeleton className="h-4 w-72" />
				</div>

				<div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
					{Array.from({ length: 4 }).map((_, i) => (
						<div
							key={i}
							className="rounded-xl border border-border bg-card p-3 shadow-sm"
						>
							<Skeleton className="mb-2 h-3 w-16" />
							<Skeleton className="h-6 w-24" />
						</div>
					))}
				</div>

				<div className="space-y-3 rounded-xl border border-border bg-card p-3 shadow-sm">
					<Skeleton className="h-10 w-full" />
					<Skeleton className="h-10 w-full" />
					<div className="flex gap-2">
						{Array.from({ length: 3 }).map((_, i) => (
							<Skeleton className="h-8 w-24 rounded-full" key={i} />
						))}
					</div>
				</div>

				<div className="space-y-2">
					{Array.from({ length: 6 }).map((_, i) => (
						<div
							key={i}
							className="rounded-xl border border-border bg-card p-3 shadow-sm"
						>
							<div className="mb-2 flex items-center justify-between">
								<Skeleton className="h-4 w-24" />
								<Skeleton className="h-4 w-20" />
							</div>
							<Skeleton className="h-3 w-40" />
						</div>
					))}
				</div>
			</div>
		);
	}

	return (
		<div className="fade-in slide-in-from-bottom-4 flex animate-in flex-col gap-3 duration-500 md:gap-3">
			<div className="p-1 md:rounded-xl md:border md:border-border md:bg-card md:p-3 md:shadow-sm">
				<div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
					<div>
						<h1 className="font-display text-xl font-bold tracking-tight md:text-2xl">
							Pesanan
						</h1>
						<p className="hidden text-muted-foreground text-xs md:block">
							Pantau pembayaran, tracking, dan aktivitas order.
						</p>
					</div>
					<Button aria-label="Refresh data pesanan" className="h-10 w-10 shrink-0 rounded-xl" onClick={() => triggerHybridRefresh()} size="icon" variant="outline"><RefreshCw className="h-4 w-4" /></Button>
					<div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground md:gap-2 md:text-[11px]">
						<span className="rounded-md bg-muted px-2 py-1">
							{totalFiltered} pesanan
						</span>
						<span className="rounded-md bg-muted px-2 py-1">
							{activeQuickDateLabel}
						</span>
						<span className="rounded-md bg-muted px-2 py-1">
							{statusFilter === "all"
								? "Semua status"
								: getStatusLabel(statusFilter)}
						</span>
						{activeFilterCount > 0 && <span className="rounded-md bg-primary/10 px-2 py-1 font-semibold text-primary">{activeFilterCount} filter aktif</span>}
					</div>
				</div>
			</div>

			<div className="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-3">
				{[["Total pesanan", String(totalFiltered), "bg-primary/10"], ["Nilai transaksi", formatrupiah(filteredRevenue), "bg-emerald-50"], ["Open bill", String(pendingCount), "bg-amber-50"], ["Selesai", String(completedCount), "bg-blue-50"]].map(([label, value, tone]) => (
					<div className="rounded-[20px] border border-border/70 bg-card p-3.5 shadow-sm md:p-4" key={label}>
						<div className="mb-3 flex items-center justify-between gap-2"><p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p><span className={`h-2 w-2 rounded-full ${tone}`} /></div>
						<p className="font-display text-lg font-bold tracking-tight md:text-xl">{value}</p>
					</div>
				))}
			</div>

			{hppCogs && hppCogs.matchedOrders > 0 && (
				<>
					<div className="hidden gap-2 md:grid md:grid-cols-4">
						<div className="rounded-lg border border-border bg-card px-3 py-2 shadow-sm">
							<p className="text-[10px] text-muted-foreground uppercase">Revenue</p>
							<p className="font-semibold text-sm md:text-base">
								{formatrupiah(hppCogs.totalRevenue)}
							</p>
						</div>
						<div className="rounded-lg border border-border bg-card px-3 py-2 shadow-sm">
							<p className="text-[10px] text-muted-foreground uppercase">COGS (HPP)</p>
							<p className="font-semibold text-orange-600 text-sm md:text-base">
								{formatrupiah(hppCogs.totalCogs)}
							</p>
						</div>
						<div className="rounded-lg border border-border bg-card px-3 py-2 shadow-sm">
							<p className="text-[10px] text-muted-foreground uppercase">Laba kotor</p>
							<p
								className={`font-semibold text-sm md:text-base ${hppCogs.totalProfit >= 0 ? "text-green-600" : "text-red-600"}`}
							>
								{formatrupiah(hppCogs.totalProfit)}
							</p>
						</div>
						<div className="rounded-lg border border-border bg-card px-3 py-2 shadow-sm">
							<p className="text-[10px] text-muted-foreground uppercase">Margin</p>
							<p className="font-semibold text-primary text-sm md:text-base">
								{hppCogs.grossMargin.toFixed(1)}%
							</p>
						</div>
					</div>

					<div className="rounded-xl border border-border bg-card p-2.5 shadow-sm md:hidden">
						<Button
							className="h-auto w-full justify-between rounded-md px-1 py-1 text-left"
							onClick={() => setShowMobileOverview((prev) => !prev)}
							type="button"
							variant="ghost"
						>
							<div>
								<p className="font-semibold text-xs">Ringkasan Finansial</p>
								<p className="text-[10px] text-muted-foreground">
									Revenue {formatrupiah(hppCogs.totalRevenue)} · Laba{" "}
									{formatrupiah(hppCogs.totalProfit)}
								</p>
							</div>
							<ChevronDown
								className={`h-4 w-4 text-muted-foreground transition-transform ${
									showMobileOverview ? "rotate-180" : ""
								}`}
							/>
						</Button>
						{showMobileOverview && (
							<div className="mt-2 grid grid-cols-2 gap-1.5 border-border border-t pt-2">
								<div className="rounded-lg bg-muted/40 p-2">
									<p className="text-[11px] text-muted-foreground uppercase">COGS (HPP)</p>
									<p className="font-semibold text-[11px] text-orange-600">
										{formatrupiah(hppCogs.totalCogs)}
									</p>
								</div>
								<div className="rounded-lg bg-muted/40 p-2">
									<p className="text-[11px] text-muted-foreground uppercase">Margin</p>
									<p className="font-semibold text-[11px] text-primary">
										{hppCogs.grossMargin.toFixed(1)}%
									</p>
								</div>
							</div>
						)}
					</div>
				</>
			)}

			<div className="hidden space-y-2 rounded-xl border border-border bg-card p-2.5 shadow-sm md:block">
				<div className="grid grid-cols-1 gap-2 lg:grid-cols-[1fr_360px]">
					<div className="relative">
					<Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						className="h-9 pl-9 text-sm"
						onChange={(e) => setSearchQuery(e.target.value)}
						placeholder="Cari ID pesanan atau nama pelanggan..."
						value={searchQuery}
					/>
				</div>
						<div className="grid min-w-0 grid-cols-[16px_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2 overflow-hidden">
							<Filter className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
							<div className="min-w-0">
								<label className="sr-only" htmlFor="orders-status-filter">Status pembayaran</label>
								<Select
								onValueChange={(val: string | null) => val && setStatusFilter(val)}
								value={statusFilter}
							>
								<SelectTrigger id="orders-status-filter" className="w-full min-w-0 overflow-hidden" size="sm">
									<SelectValue className="min-w-0 truncate">{statusFilter === "all" ? "Pembayaran: Semua" : statusFilter === "pending" ? "Pembayaran: Open Bill" : statusFilter === "paid" ? "Pembayaran: Lunas" : statusFilter === "completed" ? "Pembayaran: Selesai" : "Pembayaran: Dibatalkan"}</SelectValue>
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">Semua Status</SelectItem>
									<SelectItem value="pending">Open Bill</SelectItem>
									<SelectItem value="paid">Lunas</SelectItem>
									<SelectItem value="completed">Selesai</SelectItem>
									<SelectItem value="cancelled">Dibatalkan</SelectItem>
								</SelectContent>
							</Select>
						</div>
								<div className="min-w-0">
									<label className="sr-only" htmlFor="orders-business-filter">Bisnis</label>
									<Select value={businessFilter} onValueChange={(value: string | null) => value && setBusinessFilter(value as BusinessFilter)}>
										<SelectTrigger id="orders-business-filter" className="w-full min-w-0 overflow-hidden" size="sm"><SelectValue className="min-w-0 truncate">{businessFilter === "all" ? "Bisnis: Semua" : businessFilter === "pos" ? "Bisnis: POS Reguler" : businessFilter === "mieyamin" ? "Bisnis: Mie Yamin" : businessFilter === "b2b" ? "Bisnis: Djiwa B2B" : "Bisnis: Booking"}</SelectValue></SelectTrigger>
										<SelectContent className="min-w-[210px]">
											<SelectItem className="whitespace-nowrap" value="all">Semua bisnis</SelectItem>
											<SelectItem className="whitespace-nowrap" value="pos">POS Reguler</SelectItem>
											<SelectItem className="whitespace-nowrap" value="mieyamin">Order Mie Yamin</SelectItem>
											<SelectItem className="whitespace-nowrap" value="b2b">Djiwa B2B</SelectItem>
											<SelectItem className="whitespace-nowrap" value="booking">Booking</SelectItem>
								</SelectContent>
							</Select>
						</div>
					</div>
				</div>

				<div className="-mx-1 overflow-x-auto">
					<div className="flex w-max min-w-full gap-1.5 px-1">
						<Button
							className="h-7 rounded-full px-3 text-xs"
							onClick={() => setQuickDateFilter("all")}
							size="sm"
							variant={quickDateFilter === "all" ? "default" : "outline"}
						>
							Semua Tanggal
						</Button>
						{quickDateFilterOptions.map((option) => (
							<Button
								className="h-7 rounded-full px-3 text-xs"
								key={option.value}
								onClick={() => setQuickDateFilter(option.value)}
								size="sm"
								variant={
									quickDateFilter === option.value ? "default" : "outline"
								}
							>
								{option.label}
							</Button>
						))}
					</div>
				</div>
				{activeFilterCount > 0 && <Button className="h-8 rounded-full px-3 text-xs" onClick={resetFilters} size="sm" variant="ghost"><XCircle className="mr-1.5 h-3.5 w-3.5" />Reset filter</Button>}
				{selectedOrderIds.size > 0 && (
					<div className="flex flex-wrap items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2">
						<div className="flex items-center gap-2 text-xs">
							<span className="font-semibold text-foreground">{selectedOrderIds.size} pesanan dipilih</span>
							<span className="text-muted-foreground">dari {totalFiltered} terlihat</span>
						</div>
						<Button className="ml-auto h-8 text-xs" disabled={isBulkDeleting} onClick={handleBulkDelete} size="sm" variant="destructive">
							{isBulkDeleting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Trash2 className="mr-1.5 h-3.5 w-3.5" />}
							Hapus {selectedOrderIds.size} pesanan
						</Button>
						<Button className="h-8 text-xs" disabled={isBulkDeleting} onClick={() => setSelectedOrderIds(new Set())} size="sm" variant="ghost">
							Batal pilih
						</Button>
					</div>
				)}
			</div>

			<div className="space-y-2 pb-1 md:hidden">
				<div className="relative">
					<Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						className="h-11 rounded-xl border-border bg-card pl-10 text-sm shadow-sm"
						onChange={(e) => setSearchQuery(e.target.value)}
						placeholder="Cari pesanan atau pelanggan"
						value={searchQuery}
					/>
				</div>
				<div className="grid grid-cols-2 gap-2">
					<Select
						onValueChange={(val: string | null) => val && setStatusFilter(val)}
						value={statusFilter}
					>
						<SelectTrigger id="orders-status-filter-mobile" className="h-10 min-w-0 rounded-xl bg-card text-xs shadow-sm" size="sm">
							<SelectValue className="truncate" placeholder="Status" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">Semua status</SelectItem>
							<SelectItem value="pending">Open Bill</SelectItem>
							<SelectItem value="paid">Lunas</SelectItem>
							<SelectItem value="completed">Selesai</SelectItem>
							<SelectItem value="cancelled">Dibatalkan</SelectItem>
						</SelectContent>
					</Select>
					<Select value={businessFilter} onValueChange={(value: string | null) => value && setBusinessFilter(value as BusinessFilter)}>
						<SelectTrigger className="h-10 min-w-0 rounded-xl bg-card text-xs shadow-sm" size="sm">
							<SelectValue className="truncate" placeholder="Bisnis" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">Semua bisnis</SelectItem>
							<SelectItem value="pos">POS Reguler</SelectItem>
							<SelectItem value="mieyamin">Mie Yamin</SelectItem>
							<SelectItem value="b2b">Djiwa B2B</SelectItem>
							<SelectItem value="booking">Booking</SelectItem>
						</SelectContent>
					</Select>
				</div>
				<div className="-mx-1 overflow-x-auto px-1 pb-0.5" role="tablist" aria-label="Periode pesanan">
					<div className="flex w-max gap-1.5">
						{[{ value: "all" as QuickDateFilter, label: "Semua" }, ...quickDateFilterOptions.map((option) => ({
							...option,
							label: option.label,
						}))].map((option) => (
							<Button
								aria-selected={quickDateFilter === option.value}
								className="h-8 rounded-full px-3 text-[11px]"
								key={option.value}
								onClick={() => setQuickDateFilter(option.value)}
								size="sm"
								variant={quickDateFilter === option.value ? "default" : "outline"}
							>
								{option.label}
							</Button>
						))}
					</div>
				</div>
				{activeFilterCount > 0 && <Button className="h-9 w-full rounded-xl text-xs" onClick={resetFilters} size="sm" variant="ghost"><XCircle className="mr-1.5 h-3.5 w-3.5" />Reset semua filter ({activeFilterCount})</Button>}
			</div>

			<div>
				<div className="space-y-2 pb-32 md:hidden">
					{filteredOrders?.length === 0 ? (
						<div className="flex flex-col items-center rounded-[20px] border border-dashed border-border bg-card px-4 py-12 text-center">
							<ShoppingBag className="mb-3 h-9 w-9 text-muted-foreground/40" />
							<p className="font-display text-base font-bold text-foreground">Tidak ada pesanan ditemukan</p>
							<p className="mt-1 text-sm text-muted-foreground">Coba ubah pencarian, status, atau periode tanggal.</p>
							{activeFilterCount > 0 && <Button className="mt-4 rounded-xl" onClick={resetFilters} size="sm" variant="outline">Reset filter</Button>}
						</div>
					) : (
						filteredOrders?.map((order: Order) => {
							return (
								<Button
									className="h-auto w-full rounded-xl border border-border bg-card p-3 text-left shadow-sm transition-colors active:bg-muted/40"
									key={order._id}
									onClick={() => {
										setSelectedOrder(order as any);
										setIsDetailOpen(true);
									}}
									type="button"
									variant="ghost"
								>
									<div className="flex items-start justify-between gap-3">
										<div className="min-w-0 flex-1">
											<div className="flex items-start justify-between gap-2">
												<p className="min-w-0 truncate font-semibold text-[15px] text-foreground">
													{order.customerName || "Pelanggan Umum"}
												</p>
												<p className="shrink-0 font-semibold text-[15px] tabular-nums">{formatrupiah(order.totalAmount)}</p>
											</div>
											<div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
												<span className="truncate">{formatPaymentLabel({ source: order.source, paymentMethod: order.paymentMethod, paymentReceiptKind: order.paymentReceiptKind, paymentGateway: order.paymentGateway })}</span>
												<span aria-hidden="true">·</span>
												<span className="shrink-0">{resolveOrderChannel(order).label}</span>
												{order.customer_source_id && <span className="shrink-0 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">Member</span>}
											</div>
											<div className="mt-2 flex items-center gap-1.5">
												<span className="max-w-[52%] truncate font-mono text-[10px] text-muted-foreground">
													{order.type === "booking" ? "BK-" : "#"}{order.displayId}
												</span>
												<span className="text-[10px] text-muted-foreground">·</span>
												<span className="text-[10px] text-muted-foreground tabular-nums">{format(order.createdAt, "dd MMM, HH:mm", { locale: id })}</span>
											</div>
										</div>
										<div className="flex shrink-0 flex-col items-end gap-2">
										<Badge className="rounded-full px-2 py-0.5 text-[10px]" variant={order.status === "pending" ? "warning" : order.status === "cancelled" ? "destructive" : "info"}>{getPaymentLabel(order)}</Badge>
										<Badge className="rounded-full px-2 py-0.5 text-[10px]" variant={getStatusBadgeVariant(order.status)}>{getStatusLabel(order.status)}</Badge>
										<ChevronDown className="h-4 w-4 -rotate-90 text-muted-foreground/60" />
										</div>
									</div>
								</Button>
							);
						})
					)}
				</div>

				<div className="hidden rounded-[20px] border border-border bg-card shadow-sm md:block">
					<div className="overflow-x-auto">
						<table className="w-full min-w-[980px] text-left text-sm">
							<thead className="sticky top-0 z-10 bg-muted/70 uppercase tracking-wider">
								<tr className="text-[11px] text-muted-foreground">
									<th className="whitespace-nowrap w-10 px-3 py-2.5 text-center">
										<input aria-label="Pilih semua pesanan yang terlihat" checked={allVisibleSelected} onChange={toggleAllVisibleOrders} type="checkbox" />
									</th>
									<th className="whitespace-nowrap w-[190px] px-3 py-2.5">ID order</th>
									<th className="whitespace-nowrap min-w-[190px] px-3 py-2.5">Pelanggan</th>
									<th className="whitespace-nowrap px-3 py-2.5">Lokasi</th>
									<th className="whitespace-nowrap px-3 py-2.5">Shift</th>
									<th className="whitespace-nowrap px-3 py-2.5 text-right">Total</th>
									<th className="whitespace-nowrap px-3 py-2.5 text-right">Laba / HPP</th>
									<th className="whitespace-nowrap min-w-[120px] px-3 py-2.5">Status</th>
									<th className="whitespace-nowrap px-3 py-2.5">Channel</th>
									<th className="whitespace-nowrap px-3 py-2.5 text-right">Waktu</th>
									<th className="whitespace-nowrap px-3 py-2.5 text-center">Aksi</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-border">
								{filteredOrders?.length === 0 ? (
									<tr>
										<td
											className="h-44 text-center text-muted-foreground text-sm"
											colSpan={11}
										>
											Tidak ada pesanan yang cocok dengan filter.{activeFilterCount > 0 && <Button className="mt-3 rounded-xl" onClick={resetFilters} size="sm" variant="outline">Reset filter</Button>}
										</td>
									</tr>
								) : (
									filteredOrders?.map((order: Order) => {
										const shiftMeta = getShiftMeta(order);
										return (
											<tr
												className="group cursor-pointer transition-colors hover:bg-muted/30"
												key={order._id}
												onClick={() => {
													setSelectedOrder(order as any);
													setIsDetailOpen(true);
												}}
												onKeyDown={(event) => {
													if (event.key === "Enter" || event.key === " ") {
														event.preventDefault();
														setSelectedOrder(order as any);
														setIsDetailOpen(true);
													}
												}}
												role="button"
												tabIndex={0}
											>
												<td className="whitespace-nowrap px-3 py-2.5 text-center align-top" onClick={(event) => event.stopPropagation()}>
													<input aria-label={`Pilih pesanan ${order.displayId}`} checked={selectedOrderIds.has(String(order._id))} onChange={() => toggleOrderSelection(String(order._id))} type="checkbox" />
												</td>
												<td className="whitespace-nowrap px-3 py-2.5 align-top">
													<div className="flex items-start gap-1.5">
														<div className="min-w-0 leading-tight">
															<span className="block whitespace-nowrap font-bold font-mono text-xs text-primary" title={`${order.type === "booking" ? "BK-" : "#"}${order.displayId}`}>
																{order.type === "booking" ? "BK-" : "#"}{order.displayId}
															</span>
															{order.type === "booking" && <span className="text-[11px] text-blue-600 uppercase">Reservasi</span>}
														</div>
														<Button aria-label={`Salin ID ${order.displayId}`} className="h-7 w-7 shrink-0 text-muted-foreground hover:text-primary" onClick={(event) => { event.stopPropagation(); void copyOrderId(order); }} size="icon" title="Salin ID" variant="ghost">
															<Copy className="h-3.5 w-3.5" />
														</Button>
													</div>
												</td>
												<td className="whitespace-nowrap px-3 py-2.5 align-top">
													<div className="flex items-center gap-2">
														<div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-primary">
															<User className="h-3 w-3" />
														</div>
														<div className="min-w-0 leading-tight">
														<p className="max-w-[190px] break-words font-medium text-xs">
																{order.customerName || "Pelanggan Umum"}{order.customer_source_id && order.customer_source_id.trim() ? <span className="ml-1 inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[11px] font-black uppercase text-amber-700"><Star className="h-2.5 w-2.5" /> Member</span> : null}
															</p>
															<p className="text-[10px] text-muted-foreground uppercase">
																{formatPaymentLabel({ source: order.source, paymentMethod: order.paymentMethod, paymentReceiptKind: order.paymentReceiptKind, paymentGateway: order.paymentGateway })}
															</p>
														</div>
													</div>
												</td>
												<td className="whitespace-nowrap px-3 py-2.5 align-top text-[11px]">
													{getOrderLocationLabel(order)}
												</td>
												<td className="whitespace-nowrap px-3 py-2.5 align-top">
													<div className="flex flex-col gap-1">
														{shiftMeta.shiftName !== "-" ? (
															<span className="inline-flex w-fit rounded-md bg-primary/10 px-2 py-1 font-semibold text-[10px] text-primary uppercase">
																{shiftMeta.shiftName}
															</span>
														) : (
															<span className="text-[11px] text-muted-foreground">-</span>
														)}
														<span className="text-[10px] text-muted-foreground">
															Kasir: {shiftMeta.cashierName}
														</span>
													</div>
												</td>
												<td className="whitespace-nowrap px-3 py-2.5 text-right align-top font-semibold text-xs tabular-nums">
													{formatrupiah(order.totalAmount)}
												</td>
												<td className="whitespace-nowrap px-3 py-2.5 text-right align-top">
													{(() => {
														if (!hppProductMap || !order.items?.length) {
															return (
																<span className="text-[11px] text-muted-foreground">
																	-
																</span>
															);
														}
														let orderCogs = 0;
														let hasHpp = false;
														for (const item of order.items) {
															const hpp = hppProductMap[item.productId];
															if (hpp) {
																orderCogs += hpp.hppPerServing * item.quantity;
																hasHpp = true;
															}
														}
														if (!hasHpp) {
															return (
																<span className="text-[11px] text-muted-foreground">
																	-
																</span>
															);
														}
														const profit = order.totalAmount - orderCogs;
														return (
															<span title="Laba = total penjualan dikurangi HPP recipe yang terhubung" className={`font-semibold text-xs ${profit >= 0 ? "text-green-600" : "text-red-600"}`}>
																{formatrupiah(profit)}
															</span>
														);
													})()}
												</td>
														<td className="whitespace-nowrap px-3 py-2.5 align-top" onClick={(event) => event.stopPropagation()}>
															<div className="min-w-[120px] space-y-1.5">
																<div className="flex items-center gap-2">
																	<Badge className="rounded-md px-1.5 py-0 text-[10px]" variant={getStatusBadgeVariant(order.status)}>{getPaymentLabel(order)}</Badge>
											<Badge className="rounded-full px-1.5 py-0 text-[10px]" variant={getStatusBadgeVariant(order.status)}>{getStatusLabel(order.status)}</Badge>
																</div>
																{(["Mie Yamin", "B2B"] as string[]).includes(resolveOrderChannel(order).label) && (
																	<div className="flex items-center justify-between gap-2">
																		<span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Tracking</span>
																		<div className="min-w-0 flex-1">
																			<Select disabled={updatingDeliveryId === String(order._id)} onValueChange={(value: string | null) => value && handleInlineDeliveryStatusUpdate(order, value)} value={getTrackingValue(order)}>
																				<SelectTrigger aria-label={`Ubah tracking order ${order.displayId}`} className="h-8 w-full text-[10px]" size="sm">
																					{updatingDeliveryId === String(order._id) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <SelectValue />}
																				</SelectTrigger>
																				<SelectContent>{getOrderTrackingOptions(order).map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
																			</Select>
																		</div>
																	</div>
																)}
															</div>
													</td>
												<td className="whitespace-nowrap px-3 py-2.5 align-top">
													<div className="flex flex-col gap-1 leading-tight">
														{(() => {
															const channel = resolveOrderChannel(order);
															return <Badge className={`w-fit px-1.5 py-0 text-[11px] ${channel.className}`} variant="outline">{channel.label}</Badge>;
														})()}
														<span className="text-[10px] text-muted-foreground">
															{order.orderType === "dine_in" ? "Dine in" : order.orderType === "delivery" ? "Delivery" : order.orderType === "online" ? "Online" : "Takeaway"}
														</span>
													</div>
												</td>
												<td className="whitespace-nowrap px-3 py-2.5 text-right align-top text-[10px] text-muted-foreground tabular-nums">
													<div className="leading-tight">
														<div>{format(order.createdAt, "dd MMM", { locale: id })}</div>
														<div>{format(order.createdAt, "HH:mm", { locale: id })}</div>
													</div>
												</td>
												<td className="whitespace-nowrap px-3 py-2.5 text-center align-top">
													<div className="flex items-center justify-center gap-0.5">
														<Button
															className="h-7 w-7 text-muted-foreground hover:text-primary hover:bg-primary/10"
															onClick={(e) => {
																e.stopPropagation();
																setSelectedOrder(order as any);
																setIsDetailOpen(true);
															}}
															size="icon"
															variant="ghost"
															title="Detail"
														>
															<Eye className="h-3.5 w-3.5" />
														</Button>
														<Button
															className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
															onClick={(e) => {
																e.stopPropagation();
																handleDeleteOrder(order);
															}}
															size="icon"
															variant="ghost"
															title="Hapus"
														>
															<Trash2 className="h-3.5 w-3.5" />
														</Button>
													</div>
												</td>
											</tr>
										);
									})
								)}
							</tbody>
						</table>
					</div>
				</div>
			</div>

			{/* Order Detail Sheet */}
			<Sheet onOpenChange={setIsDetailOpen} open={isDetailOpen}>
				<SheetContent className="flex w-full flex-col sm:max-w-lg">
					<SheetHeader className="border-border border-b px-4 py-3 pr-16">
						<div className="flex items-center justify-between">
							<SheetTitle className="text-lg">
								{(selectedOrder as any)?.type === "booking" ? "Detail Booking / Reservasi" : "Detail Pesanan"}
							</SheetTitle>
							<div className="flex items-center gap-2">
								{(selectedOrder as any)?.type === "booking" && (
									<Badge className="bg-blue-100 px-2 py-0.5 text-[10px] text-blue-700 hover:bg-blue-100">BOOKING</Badge>
								)}
								<Badge
								className="px-2 py-0.5 text-[10px] capitalize"
								variant={
									selectedOrder
										? getStatusBadgeVariant(selectedOrder.status)
										: "secondary"
								}
							>
								{selectedOrder ? getStatusLabel(selectedOrder.status) : ""}
							</Badge>
							</div>
						</div>
						<SheetDescription className="font-mono text-[10px] text-primary">
							{(selectedOrder as any)?.type === "booking" ? "BK-" : "#"}{selectedOrder?.displayId}
						</SheetDescription>
					</SheetHeader>

					{selectedOrder && (
						<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
							<ScrollArea className="min-h-0 flex-1">
								<div className="space-y-4 px-4 py-3 pb-6">
									{/* Customer Info */}
									<Card className="border-dashed bg-muted/20 shadow-none">
										<CardContent className="flex items-center justify-between p-3">
											<div className="flex items-center gap-2">
												<div className="rounded-full bg-background p-1.5 shadow-sm">
													<User className="h-4 w-4 text-primary" />
												</div>
												<div>
													<p className="font-medium text-[10px] text-muted-foreground">
														Pelanggan
													</p>
													<p className="font-bold text-sm">
														{selectedOrder.customerName || "Pelanggan Umum"}{selectedOrder.customer_source_id && selectedOrder.customer_source_id.trim() ? <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0 text-[10px] font-black text-amber-700 uppercase ml-1"><Star className="h-3 w-3" aria-hidden="true" /> Member</span> : null}
													</p>
													{selectedOrder.customerPhone || selectedOrder.deliveryContactPhone ? <p className="mt-1 text-[11px] text-muted-foreground">WA: {selectedOrder.customerPhone || selectedOrder.deliveryContactPhone}</p> : null}
													{selectedOrder.customerEmail ? <p className="text-[11px] text-muted-foreground">{selectedOrder.customerEmail}</p> : null}
													{selectedOrder.deliveryAddress ? <p className="mt-1 max-w-[220px] text-[11px] leading-relaxed text-muted-foreground">{selectedOrder.deliveryAddress}</p> : <p className="mt-1 text-[11px] text-muted-foreground">Kontak pelanggan tersimpan di order</p>}
												</div>
											</div>
											<div className="text-right">
												<p className="font-medium text-[10px] text-muted-foreground">
													Waktu Pesanan
												</p>
												<p className="font-medium text-xs">
													{format(
														selectedOrder.createdAt,
														"dd MMM yyyy, HH:mm",
														{ locale: id }
													)}
												</p>
												<p className="mt-1 text-[10px] text-muted-foreground">
													Kasir: {getShiftMeta(selectedOrder).cashierName}
												</p>
											</div>
										</CardContent>
									</Card>

									<div className="grid grid-cols-2 gap-2 rounded-2xl border border-border/70 bg-muted/20 p-3">
										<div><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Sumber transaksi</p><p className="mt-1 text-sm font-semibold">{resolveOrderChannel(selectedOrder).label}</p></div>
										<div className="text-right"><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Pembayaran</p><p className="mt-1 text-sm font-semibold">{formatPaymentLabel({ source: selectedOrder.source, paymentMethod: selectedOrder.paymentMethod, paymentReceiptKind: selectedOrder.paymentReceiptKind, paymentGateway: selectedOrder.paymentGateway })}</p></div>
										{selectedOrder.orderNumber && <div><p className="text-[10px] text-muted-foreground">Nomor transaksi</p><p className="font-mono text-xs">{selectedOrder.orderNumber}</p></div>}
										{(selectedOrder as any).bookingCode && <div className="text-right"><p className="text-[10px] text-muted-foreground">Kode booking</p><p className="font-mono text-xs">{(selectedOrder as any).bookingCode}</p></div>}
									</div>

									{(selectedOrder as any).type === "booking" && (
										<Card className="border-blue-200 bg-blue-50/60 shadow-none">
											<CardContent className="space-y-3 p-3">
												<div className="flex items-center justify-between">
													<p className="text-[10px] font-bold uppercase tracking-widest text-blue-700">Detail Reservasi</p>
													<span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">BOOKING</span>
												</div>
												<div className="grid grid-cols-2 gap-3">
													<div>
														<p className="text-[10px] text-blue-700/70">Tanggal kedatangan</p>
														<p className="text-sm font-bold text-blue-950">{(selectedOrder as any).bookingDate || "-"}</p>
													</div>
													<div>
														<p className="text-[10px] text-blue-700/70">Jam kedatangan</p>
														<p className="text-sm font-bold text-blue-950">{(selectedOrder as any).arrivalTime || "-"} WIB</p>
													</div>
													<div>
														<p className="text-[10px] text-blue-700/70">Jumlah tamu</p>
														<p className="text-sm font-bold text-blue-950">{Number((selectedOrder as any).guestCount ?? 0)} orang</p>
													</div>
													<div>
														<p className="text-[10px] text-blue-700/70">Meja</p>
														<p className="text-sm font-bold text-blue-950">{Number((selectedOrder as any).tableCount ?? 0)} meja</p>
													</div>
												</div>
											</CardContent>
										</Card>
									)}

									{/* Items List */}
									{selectedOrder.notes && (
										<div className="rounded-lg border border-primary/20 bg-primary/5 p-3 mb-4">
											<p className="text-[10px] font-bold text-primary uppercase tracking-widest mb-1">Catatan Pesanan</p>
											<p className="text-sm italic text-foreground">"{selectedOrder.notes}"</p>
										</div>
									)}
									<div className="space-y-2">
										<h4 className="flex items-center gap-2 font-semibold text-xs">
											<ShoppingBag className="h-3.5 w-3.5 text-primary" />
											Daftar Item
										</h4>
										<div className="divide-y divide-border rounded-lg border border-border bg-card">
											{selectedOrder.items?.map((item) => (
												<div
													className="flex items-start justify-between p-2.5"
													key={item.productId}
												>
													<div className="flex items-start gap-2">
														<div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted font-bold text-[10px] text-muted-foreground">
															{item.quantity}x
														</div>
														<div>
															<p className="font-medium text-xs">
																{item.productName}
															</p>
															{item.variant && (
																<p className="text-[10px] text-muted-foreground">
																	{item.variant}
																</p>
															)}
														</div>
													</div>
													<div className="text-right">
														<p className="font-medium text-xs">
															{formatrupiah(item.price * item.quantity)}
														</p>
														<p className="text-[11px] text-muted-foreground">
															@ {formatrupiah(item.price)}
														</p>
													</div>
												</div>
											))}
										</div>
									</div>

									{/* Payment Info */}
									<div className="space-y-2">
										<h4 className="flex items-center gap-2 font-semibold text-xs">
											<CreditCard className="h-3.5 w-3.5 text-primary" />
											Rincian Pembayaran
										</h4>
										<div className="rounded-lg border border-border bg-muted/10 p-3">
											<div className="flex justify-between text-xs">
												<span className="text-muted-foreground">
													Metode Pembayaran
												</span>
												<span className="font-medium capitalize">
													{formatPaymentLabel({ source: selectedOrder.source, paymentMethod: selectedOrder.paymentMethod, paymentReceiptKind: selectedOrder.paymentReceiptKind, paymentGateway: selectedOrder.paymentGateway })}
												</span>
											</div>
											<div className="my-1.5 border-border/50 border-t" />
											<div className="flex justify-between text-xs">
												<span className="text-muted-foreground">
													Subtotal (Bruto)
												</span>
												<span className="font-medium">
													{formatrupiah(selectedOrder.totalAmount + (selectedOrder.discountAmount || 0))}
												</span>
											</div>
											<div className="flex justify-between text-xs mt-1">
												<span className="text-muted-foreground">
													Potongan (Diskon)
												</span>
												<span className="font-medium text-orange-600">
													-{formatrupiah(selectedOrder.discountAmount || 0)}
												</span>
											</div>
											<div className="my-1.5 border-border/50 border-t" />
											<div className="flex justify-between text-sm">
												<span className="font-bold">Total Pembayaran (Net)</span>
												<span className="font-bold text-primary">
													{formatrupiah(selectedOrder.totalAmount)}
												</span>
											</div>
											{/* HPP Profit Analysis */}
											{hppProductMap &&
												(() => {
													let orderCogs = 0;
													let hasHpp = false;
													for (const item of selectedOrder.items) {
														const hpp = hppProductMap[item.productId];
														if (hpp) {
															orderCogs += hpp.hppPerServing * item.quantity;
															hasHpp = true;
														}
													}
													if (!hasHpp) {
														return null;
													}
													const profit = selectedOrder.totalAmount - orderCogs;
													const margin =
														selectedOrder.totalAmount > 0
															? (profit / selectedOrder.totalAmount) * 100
															: 0;
													return (
														<>
															<div className="my-1.5 border-border/50 border-t" />
															<div className="flex justify-between text-xs">
																<span className="text-muted-foreground">
																	HPP (COGS)
																</span>
																<span className="font-medium text-orange-600">
																	{formatrupiah(orderCogs)}
																</span>
															</div>
															<div className="flex justify-between text-xs">
																<span className="font-bold">Laba Kotor</span>
																<span
																	className={`font-bold ${profit >= 0 ? "text-green-600" : "text-red-600"}`}
																>
																	{formatrupiah(profit)} ({margin.toFixed(1)}%)
																</span>
															</div>
														</>
													);
												})()}
										</div>
									</div>

								</div>
							</ScrollArea>

							<div className="sticky bottom-0 border-t border-border bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
								<div className="space-y-3">
									<div className="space-y-2">
										{(() => {
											const channel = resolveOrderChannel(selectedOrder).label;
											const isTrackingChannel = channel === "Mie Yamin" || channel === "B2B";
											if (!isTrackingChannel) return null;
											const isB2B = channel === "B2B";
											const options: readonly { value: string; label: string }[] = isB2B ? B2B_DELIVERY_STATUSES : MIE_YAMIN_DELIVERY_STATUSES;
											const currentStatus = selectedOrder.deliveryStatus || (selectedOrder.status === "paid" || selectedOrder.status === "completed" ? "paid" : "pending_payment");
											const currentLabel = options.find((item) => item.value === currentStatus)?.label ?? "Belum diatur";
											return (
												<div className={isB2B ? "rounded-xl border border-slate-800 bg-slate-900 p-3" : "rounded-xl border border-amber-200 bg-amber-50/70 p-3"}>
													<div className="flex items-start justify-between gap-3">
														<div>
															<h4 className={`text-xs font-black ${isB2B ? "text-amber-300" : "text-amber-900"}`}>Tracking {channel}</h4>
															<p className={`mt-0.5 text-[10px] leading-relaxed ${isB2B ? "text-slate-300" : "text-amber-800/80"}`}>Pilih status di kotak bawah. Perubahannya tampil real-time di tracking customer.</p>
														</div>
														<div className="text-right">
															<p className={`text-[9px] font-bold uppercase tracking-wide ${isB2B ? "text-slate-400" : "text-amber-800/70"}`}>Status saat ini</p>
															<Badge className={`mt-0.5 px-1.5 py-0 text-[10px] ${isB2B ? "border-amber-300 bg-slate-800 text-amber-300" : "border-amber-200 bg-white text-amber-800"}`} variant="outline">{currentLabel}</Badge>
														</div>
													</div>
													<Select
														value={currentStatus}
														onValueChange={(value: string | null) => { if (value) void handleDetailDeliveryStatusUpdate(value); }}
													>
														<SelectTrigger aria-label={`Ubah status tracking ${channel}`} className={`mt-2 h-11 w-full text-sm font-semibold shadow-sm ${isB2B ? "border-slate-700 bg-slate-800 text-white" : "border-amber-200 bg-background"}`}><SelectValue placeholder="Pilih status tracking" /></SelectTrigger>
														<SelectContent>
															{options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
														</SelectContent>
													</Select>
												</div>
											);
										})()}
										{!(["Mie Yamin", "B2B"] as string[]).includes(resolveOrderChannel(selectedOrder).label) && (
											<>
											<h4 className="font-medium text-[10px] text-muted-foreground uppercase tracking-widest">
												Ubah Status Pesanan
											</h4>
										<div className="grid grid-cols-2 gap-1.5">
											<Button
												className={`h-9 text-xs ${
													selectedOrder.status === "pending"
														? "bg-yellow-500 hover:bg-yellow-600"
														: ""
												}`}
												disabled={selectedOrder.status === "pending"}
												onClick={() => handleStatusUpdate("pending")}
												size="sm"
												variant={
													selectedOrder.status === "pending"
														? "default"
														: "outline"
												}
											>
												<Clock className="mr-1.5 h-3.5 w-3.5" />
												Tertunda
											</Button>
											<Button
												className={`h-9 text-xs ${
													selectedOrder.status === "paid"
														? "bg-green-500 hover:bg-green-600"
														: ""
												}`}
												disabled={selectedOrder.status === "paid"}
												onClick={() => handleStatusUpdate("paid")}
												size="sm"
												variant={
													selectedOrder.status === "paid"
														? "default"
														: "outline"
												}
											>
												<CheckCircle className="mr-1.5 h-3.5 w-3.5" />
												Dibayar
											</Button>
											<Button
												className={`h-9 text-xs ${
													selectedOrder.status === "completed"
														? "bg-green-500 hover:bg-green-600"
														: ""
												}`}
												disabled={selectedOrder.status === "completed"}
												onClick={() => handleStatusUpdate("completed")}
												size="sm"
												variant={
													selectedOrder.status === "completed"
														? "default"
														: "outline"
												}
											>
												<CheckCircle className="mr-1.5 h-3.5 w-3.5" />
												Selesai
											</Button>
											<Button
												className={`h-9 text-xs ${
													selectedOrder.status === "cancelled"
														? "bg-destructive hover:bg-destructive/90"
														: "text-destructive hover:bg-destructive/10"
												}`}
												disabled={selectedOrder.status === "cancelled"}
												onClick={() => handleStatusUpdate("cancelled")}
												size="sm"
												variant={
													selectedOrder.status === "cancelled"
														? "default"
														: "outline"
												}
											>
												<XCircle className="mr-1.5 h-3.5 w-3.5" />
												Dibatalkan
											</Button>
										</div>
										</>
									)}
									</div>

									<div className="flex gap-2 border-t border-border/60 pt-3">
										<Button
											className="h-9 flex-1 text-xs"
											onClick={() => setIsDetailOpen(false)}
											variant="outline"
										>
											Tutup Detail
										</Button>
										<Button
											className="h-9 flex-1 gap-1.5 text-xs text-destructive hover:bg-destructive/10"
											onClick={() => handleDeleteOrder(selectedOrder)}
											variant="ghost"
										>
											<Trash2 className="h-4 w-4" />
											Hapus pesanan
										</Button>
									</div>
								</div>
							</div>
						</div>
					)}
				</SheetContent>
			</Sheet>
			<ConfirmationModal
				isOpen={deleteConfirmation !== null}
				onClose={() => { if (!isBulkDeleting) setDeleteConfirmation(null); }}
				onConfirm={() => void confirmDelete()}
				title={deleteConfirmation?.ids.length === 1 ? "Hapus pesanan?" : `Hapus ${deleteConfirmation?.ids.length ?? 0} pesanan?`}
				subtitle="Tindakan permanen"
				message="Item, tracking, dan histori order terkait akan ikut dihapus. Tindakan ini tidak dapat dibatalkan."
				confirmText={deleteConfirmation?.ids.length === 1 ? "Hapus pesanan" : `Hapus ${deleteConfirmation?.ids.length ?? 0} pesanan`}
				loading={isBulkDeleting}
			/>
		</div>
	);
}





