import { Outlet, createLazyFileRoute, Link, useNavigate } from "@tanstack/react-router";
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
	Truck,
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
type SortFilter = "newest" | "oldest" | "amountHigh" | "amountLow";

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
	if (brandSlug === "merchandise") {
		return { label: "Merchandise · Pre-order", className: "bg-sky-100 text-sky-700" };
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

function compactRupiah(amount: number) {
	if (amount >= 1_000_000) return `Rp${(amount / 1_000_000).toFixed(1).replace(".0", "")} jt`;
	if (amount >= 1_000) return `Rp${Math.round(amount / 1_000)} rb`;
	return `Rp${Math.round(amount).toLocaleString("id-ID")}`;
}

function AdminOrders() {
	const navigate = useNavigate();
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
	const [sortFilter, setSortFilter] = useState<SortFilter>("newest");
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
	}).sort((a: any, b: any) => {
		switch (sortFilter) {
			case "oldest": return a.date - b.date;
			case "amountHigh": return Number(b.totalAmount || 0) - Number(a.totalAmount || 0);
			case "amountLow": return Number(a.totalAmount || 0) - Number(b.totalAmount || 0);
			default: return b.date - a.date;
		}
	});

	const totalFiltered = filteredOrders?.length || 0;
	const filteredRevenue = (filteredOrders ?? []).reduce((sum: number, order: any) => sum + Number(order.totalAmount || 0), 0);
	const pendingCount = (filteredOrders ?? []).filter((order: any) => order.status === "pending").length;
	const completedCount = (filteredOrders ?? []).filter((order: any) => order.status === "completed").length;
	const activeFilterCount = [searchQuery.trim(), statusFilter !== "all" ? statusFilter : "", businessFilter !== "all" ? businessFilter : "", quickDateFilter !== "all" ? quickDateFilter : ""].filter(Boolean).length;
	const resetFilters = () => { setSearchQuery(""); setStatusFilter("all"); setBusinessFilter("all"); setQuickDateFilter("all"); setSortFilter("newest"); setSelectedOrderIds(new Set()); };
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

	const formatCount = (value: number) => new Intl.NumberFormat("id-ID").format(value);

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

	if (typeof window !== "undefined" && /^\/admin\/orders\/[^/]+/.test(window.location.pathname)) return <Outlet />;

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

	const visibleOrders = filteredOrders ?? [];
	const visibleRevenue = filteredRevenue;
	const openCount = pendingCount;
	const paidCount = visibleOrders.filter((order: any) => order.status === "paid").length;

	return (
		<div className="flex min-w-0 flex-col gap-3 pb-6">
			<header className="flex min-w-0 items-center justify-between gap-3 rounded-[24px] bg-[#123b73] px-4 py-4 text-white shadow-[0_14px_36px_rgba(18,59,115,0.18)] sm:px-5">
				<div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-blue-100/75">Djiwa Tentram · Operational queue</p><div className="mt-1 flex items-center gap-2"><h1 className="font-display truncate text-[24px] font-bold tracking-tight">Pesanan</h1><span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-blue-50">{totalFiltered} terlihat</span></div><p className="mt-1 text-xs text-blue-100/80">Pantau transaksi, pembayaran, dan tindakan berikutnya.</p></div>
				<div className="flex shrink-0 items-center gap-2"><Link className="hidden h-10 items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-3 text-xs font-bold text-white transition hover:bg-white/20 sm:inline-flex" to="/admin/delivery"><Truck className="h-4 w-4" />Pantau Delivery</Link><div className="hidden text-right sm:block"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-blue-100/60">Periode aktif</p><p className="text-xs font-semibold text-white">{activeQuickDateLabel}</p></div><Button aria-label="Refresh daftar pesanan" className="h-10 w-10 rounded-xl border-white/15 bg-white/10 text-white hover:bg-white/20 hover:text-white" onClick={() => triggerHybridRefresh()} size="icon" variant="outline"><RefreshCw className="h-4 w-4" /></Button></div>
			</header>

			<section aria-label="Ringkasan nilai dan status pesanan" className="rounded-2xl border border-border/80 bg-card px-3 py-3 shadow-sm sm:px-4"><div className="flex items-center justify-between gap-4"><div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Nilai transaksi</p><p className="mt-0.5 truncate font-display text-xl font-bold tracking-tight text-foreground tabular-nums sm:text-2xl">{formatrupiah(visibleRevenue)}</p></div><div className="shrink-0 text-right"><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Pesanan</p><p className="mt-0.5 font-display text-xl font-bold tracking-tight text-primary tabular-nums sm:text-2xl">{formatCount(totalFiltered)}</p><p className="text-[10px] text-muted-foreground">sesuai filter</p></div></div><div className="mt-3 grid grid-cols-3 divide-x border-t border-border/70 pt-2.5"><div className="flex items-baseline gap-1 pr-2"><span className="text-[11px] font-semibold text-amber-700">Open</span><span className="font-display text-base font-bold tabular-nums text-amber-700">{formatCount(openCount)}</span></div><div className="flex items-baseline gap-1 px-2"><span className="text-[11px] font-semibold text-sky-700">Lunas</span><span className="font-display text-base font-bold tabular-nums text-sky-700">{formatCount(paidCount)}</span></div><div className="flex items-baseline gap-1 pl-2"><span className="text-[11px] font-semibold text-emerald-700">Selesai</span><span className="font-display text-base font-bold tabular-nums text-emerald-700">{formatCount(completedCount)}</span></div></div></section>

			<section aria-label="Filter pesanan" className="rounded-[22px] border border-border/80 bg-card p-2.5 shadow-[0_8px_24px_rgba(9,9,11,0.045)]">
				<div className="flex flex-col gap-2 lg:flex-row lg:items-center"><div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label="Cari pesanan" className="h-10 pl-9 text-sm" onChange={(e) => setSearchQuery(e.target.value)} placeholder="Cari ID atau nama pelanggan" value={searchQuery} /></div><div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:flex lg:shrink-0">
					<Select onValueChange={(val: string | null) => val && setStatusFilter(val)} value={statusFilter}><SelectTrigger aria-label="Filter pembayaran" className="h-10 min-w-0 text-xs sm:min-w-[138px]"><SelectValue placeholder="Pembayaran: Semua" /></SelectTrigger><SelectContent><SelectItem value="all">Pembayaran: Semua</SelectItem><SelectItem value="pending">Pembayaran: Open</SelectItem><SelectItem value="paid">Pembayaran: Lunas</SelectItem><SelectItem value="completed">Status: Selesai</SelectItem><SelectItem value="cancelled">Status: Dibatalkan</SelectItem></SelectContent></Select>
					<Select onValueChange={(value: string | null) => value && setBusinessFilter(value as BusinessFilter)} value={businessFilter}><SelectTrigger aria-label="Filter bisnis" className="h-10 min-w-0 text-xs sm:min-w-[142px]"><SelectValue placeholder="Bisnis: Semua" /></SelectTrigger><SelectContent><SelectItem value="all">Bisnis: Semua</SelectItem><SelectItem value="pos">Bisnis: POS Reguler</SelectItem><SelectItem value="mieyamin">Bisnis: Mie Yamin</SelectItem><SelectItem value="booking">Bisnis: Booking</SelectItem></SelectContent></Select>
					<Button aria-label="Reset filter" className="h-10 text-xs" onClick={() => { setSearchQuery(""); setStatusFilter("all"); setBusinessFilter("all"); setQuickDateFilter("all"); }} size="sm" variant="outline">Reset</Button></div></div>
				<div className="mt-2 flex items-center gap-1.5 overflow-x-auto pb-0.5"><span className="mr-1 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Periode</span><Button className="h-7 shrink-0 rounded-full px-3 text-xs" onClick={() => setQuickDateFilter("all")} size="sm" variant={quickDateFilter === "all" ? "default" : "outline"}>Semua</Button>{quickDateFilterOptions.map((option) => <Button className="h-7 shrink-0 rounded-full px-3 text-xs" key={option.value} onClick={() => setQuickDateFilter(option.value)} size="sm" variant={quickDateFilter === option.value ? "default" : "outline"}>{option.label}</Button>)}</div>
			</section>

			<section aria-label="Daftar pesanan" className="overflow-hidden rounded-[22px] border border-border/80 bg-card shadow-[0_8px_24px_rgba(9,9,11,0.045)]"><div className="flex items-center justify-between border-b border-border/70 px-3 py-2.5"><div className="flex items-center gap-2"><ShoppingBag className="h-4 w-4 text-primary" /><h2 className="text-sm font-bold">Daftar transaksi</h2><span className="text-xs text-muted-foreground">{totalFiltered} baris</span></div><p className="hidden text-[11px] text-muted-foreground md:block">Klik baris untuk detail</p></div>
				<div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-xs"><thead className="border-b border-border/70 bg-muted/35"><tr className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground"><th className="sticky left-0 z-10 bg-muted/95 px-3 py-2.5">Pesanan</th><th className="px-3 py-2.5">Pelanggan</th><th className="px-3 py-2.5">Lokasi / Shift</th><th className="px-3 py-2.5 text-right">Nilai</th><th className="px-3 py-2.5 text-right">Laba kotor</th><th className="px-3 py-2.5">Pembayaran</th><th className="px-3 py-2.5">Channel</th><th className="px-3 py-2.5">Waktu</th><th className="px-3 py-2.5 text-right">Aksi</th></tr></thead><tbody className="divide-y divide-border/60">
					{visibleOrders.length === 0 ? <tr><td className="h-56 text-center" colSpan={9}><div className="flex flex-col items-center gap-2 text-muted-foreground"><ShoppingBag className="h-8 w-8 opacity-35" /><p className="font-semibold text-foreground">Tidak ada transaksi</p><p className="text-xs">Coba ubah kata kunci, status, bisnis, atau periode.</p></div></td></tr> : visibleOrders.map((order: any) => { const shiftMeta = getShiftMeta(order); const channel = resolveOrderChannel(order); let orderCogs = 0; let hasHpp = false; for (const item of order.items || []) { const hpp = hppProductMap?.[item.productId]; if (hpp) { orderCogs += hpp.hppPerServing * item.quantity; hasHpp = true; } } const profit = order.totalAmount - orderCogs; return <tr className="group cursor-pointer transition-colors hover:bg-primary/[0.035] focus-within:bg-primary/[0.035]" key={order._id} onClick={() => navigate({ to: `/admin/orders/${encodeURIComponent(order.displayId || order.orderNumber || order._id)}` })} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); navigate({ to: `/admin/orders/${encodeURIComponent(order.displayId || order.orderNumber || order._id)}` }); } }} role="button" tabIndex={0}><td className="sticky left-0 z-[1] bg-card px-3 py-2.5 align-middle group-hover:bg-[#fbfdff]"><p className="font-mono text-[11px] font-bold text-primary">{order.type === "booking" ? "BK-" : "#"}{order.displayId}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{order.type === "booking" ? "Reservasi" : order.orderType === "dine_in" ? "Dine in" : "Takeaway"}</p></td><td className="px-3 py-2.5 align-middle"><p className="max-w-[170px] truncate font-semibold">{order.customerName || "Pelanggan Umum"}</p><p className="mt-0.5 max-w-[190px] truncate text-[10px] text-muted-foreground">{formatPaymentLabel({ source: order.source, paymentMethod: order.paymentMethod, paymentReceiptKind: order.paymentReceiptKind, paymentGateway: order.paymentGateway })}{order.customer_source_id ? " · Member" : ""}</p></td><td className="px-3 py-2.5 align-middle"><p className="font-medium">{getOrderLocationLabel(order)}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{shiftMeta.shiftName} · {shiftMeta.cashierName}</p></td><td className="px-3 py-2.5 text-right align-middle font-semibold tabular-nums">{formatrupiah(order.totalAmount)}</td><td className="px-3 py-2.5 text-right align-middle font-semibold tabular-nums">{hasHpp ? <span className={profit >= 0 ? "text-emerald-700" : "text-red-600"}>{formatrupiah(profit)}</span> : <span className="text-muted-foreground">—</span>}</td><td className="px-3 py-2.5 align-middle"><Badge className="rounded-full px-2 py-0.5 text-[10px]" variant={getStatusBadgeVariant(order.status)}>{getStatusLabel(order.status)}</Badge></td><td className="px-3 py-2.5 align-middle"><Badge className={`rounded-full border-0 px-2 py-0.5 text-[10px] ${channel.className}`} variant="outline">{channel.label}</Badge></td><td className="px-3 py-2.5 align-middle text-[10px] tabular-nums text-muted-foreground">{format(order.createdAt, "dd MMM", { locale: id })} {format(order.createdAt, "HH:mm", { locale: id })}</td><td className="px-3 py-2.5 text-right align-middle"><Button aria-label={`Buka detail ${order.displayId}`} className="h-8 w-8 text-muted-foreground hover:bg-primary/10 hover:text-primary" onClick={(event) => { event.stopPropagation(); navigate({ to: `/admin/orders/${encodeURIComponent(order.displayId || order.orderNumber || order._id)}` }); }} size="icon" variant="ghost"><Eye className="h-4 w-4" /></Button></td></tr>; })}
				</tbody></table></div><div className="border-t border-border/60 bg-muted/20 px-3 py-2 text-[10px] text-muted-foreground md:hidden">Geser tabel ke samping untuk melihat kolom lengkap · Ketuk baris untuk detail</div></section>


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





