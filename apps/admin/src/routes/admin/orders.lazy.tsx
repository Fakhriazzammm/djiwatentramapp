import { createLazyFileRoute } from "@tanstack/react-router";
import type { Id } from "@/types/backend-compat";
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
	CreditCard,
	Eye,
	Filter,
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
	totalAmount: number;
	paymentMethod: string;
	customerName?: string;
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
	const updateBookingStatus = useHybridUpdateBookingStatus();
	const deleteOrder = useHybridDeleteOrder();
	const deleteBookingOrder = useHybridDeleteBookingOrder();
	
	const hppProductMap = useHybridHppProductMap();
	const hppCogs = useHybridOrdersCogs();
	const historicalShifts = useHybridShiftReportRows();

	const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
	const [statusFilter, setStatusFilter] = useState<string>("all");
	const [searchQuery, setSearchQuery] = useState("");
	const [quickDateFilter, setQuickDateFilter] =
		useState<QuickDateFilter>("all");
	const [isDetailOpen, setIsDetailOpen] = useState(false);
	const [hasAppliedFocus, setHasAppliedFocus] = useState(false);
	const [showMobileOverview, setShowMobileOverview] = useState(false);

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
			id: o._id,
			displayId: o.orderNumber,
			date: o.createdAt,
		}));
		
		const bookings = (allBookingOrders || []).map((b: any) => ({
			...b,
			type: "booking",
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
		const matchesStatus =
			statusFilter === "all" || order.status === statusFilter;
		const matchesSearch =
			order.displayId.toLowerCase().includes(searchQuery.toLowerCase()) ||
			(order.customerName || "")
				.toLowerCase()
				.includes(searchQuery.toLowerCase());
		const activeDateRange = getQuickDateRange(quickDateFilter);
		const matchesQuickDate =
			!activeDateRange ||
			(order.createdAt >= activeDateRange.start &&
				order.createdAt <= activeDateRange.end);
		return matchesStatus && matchesSearch && matchesQuickDate;
	});

	const totalFiltered = filteredOrders?.length || 0;
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

	const handleDeleteOrder = async (order: any) => {
		if (!confirm(`Hapus ${order.type === "booking" ? "booking" : "pesanan"} ini?`)) return;
		
		try {
			if (order.type === "booking") {
				await deleteBookingOrder({ id: order._id });
			} else {
				await deleteOrder({ id: order._id });
			}
			toast.success("Berhasil dihapus"); triggerHybridRefresh();
			setIsDetailOpen(false);
		} catch (_e) {
			toast.error("Gagal menghapus");
		}
	};

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
		<div className="fade-in slide-in-from-bottom-4 flex animate-in flex-col gap-2 duration-500 md:gap-2">
			<div className="p-1 md:rounded-xl md:border md:border-border md:bg-card md:p-3 md:shadow-sm">
				<div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
					<div>
						<h2 className="font-bold text-xl tracking-tight md:text-2xl">
							Riwayat Pesanan
						</h2>
						<p className="hidden text-muted-foreground text-xs md:block">
							Fokus data pesanan.
						</p>
					</div>
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
					</div>
				</div>
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
							<p className="text-[10px] text-muted-foreground uppercase">COGS</p>
							<p className="font-semibold text-orange-600 text-sm md:text-base">
								{formatrupiah(hppCogs.totalCogs)}
							</p>
						</div>
						<div className="rounded-lg border border-border bg-card px-3 py-2 shadow-sm">
							<p className="text-[10px] text-muted-foreground uppercase">Laba</p>
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
									<p className="text-[11px] text-muted-foreground uppercase">COGS</p>
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
				<div className="grid grid-cols-1 gap-2 lg:grid-cols-[1fr_220px]">
					<div className="relative">
					<Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						className="h-9 pl-9 text-sm"
						onChange={(e) => setSearchQuery(e.target.value)}
						placeholder="Cari ID pesanan atau nama pelanggan..."
						value={searchQuery}
					/>
				</div>
				<div className="flex items-center gap-2">
					<Filter className="h-4 w-4 shrink-0 text-muted-foreground" />
					<Select
						onValueChange={(val: string | null) => val && setStatusFilter(val)}
						value={statusFilter}
					>
						<SelectTrigger size="sm">
							<SelectValue placeholder="Status" />
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
			</div>

			<div className="sticky top-0 z-20 -mx-3 border-border border-y bg-background/95 px-3 py-2 backdrop-blur md:hidden">
				<div className="space-y-2">
					<div className="grid grid-cols-[1fr_120px] gap-2">
						<div className="relative">
							<Search className="absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
							<Input
								className="h-9 pl-8 text-xs"
								onChange={(e) => setSearchQuery(e.target.value)}
								placeholder="Cari pesanan..."
								value={searchQuery}
							/>
						</div>
						<Select
							onValueChange={(val: string | null) => val && setStatusFilter(val)}
							value={statusFilter}
						>
							<SelectTrigger className="text-xs" size="sm">
								<SelectValue placeholder="Status" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">Semua</SelectItem>
								<SelectItem value="pending">Open Bill</SelectItem>
								<SelectItem value="paid">Lunas</SelectItem>
								<SelectItem value="completed">Selesai</SelectItem>
								<SelectItem value="cancelled">Batal</SelectItem>
							</SelectContent>
						</Select>
					</div>

					<div className="-mx-1 overflow-x-auto">
						<div className="flex w-max min-w-full gap-1 px-1">
							<Button
								className="h-7 rounded-full px-2.5 text-[11px]"
								onClick={() => setQuickDateFilter("all")}
								size="sm"
								variant={quickDateFilter === "all" ? "default" : "outline"}
							>
								Semua
							</Button>
							{quickDateFilterOptions.map((option) => (
								<Button
									className="h-7 rounded-full px-2.5 text-[11px]"
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
				</div>
			</div>

			<div>
				<div className="space-y-2 pb-24 md:hidden">
					{filteredOrders?.length === 0 ? (
						<div className="rounded-xl border border-dashed border-border bg-card py-12 text-center text-muted-foreground text-sm">
							Tidak ada pesanan ditemukan.
						</div>
					) : (
						filteredOrders?.map((order: Order) => {
							const shiftMeta = getShiftMeta(order);
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
										<div className="min-w-0 flex-1 space-y-1">
											<div className="flex flex-wrap items-center gap-1.5">
												<span className="font-bold font-mono text-[11px] text-primary">
													{order.type === "booking" ? "BK-" : "#"}
													{order.displayId}
												</span>
												{order.type === "booking" && (
													<Badge
														className="border-blue-200 bg-blue-50 px-1.5 py-0 text-[11px] text-blue-700"
														variant="outline"
													>
														Booking
													</Badge>
												)}
												<Badge
													className="rounded-md px-1.5 py-0 font-normal text-[11px]"
													variant={getStatusBadgeVariant(order.status)}
												>
													{getStatusLabel(order.status)}
												</Badge>
											</div>
											<div className="text-[11px] text-muted-foreground">
												{order.customerName || "Pelanggan Umum"}{order.customer_source_id && order.customer_source_id.trim() ? <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[11px] font-black text-amber-700 uppercase ml-1">⭐ Member</span> : null} ·{" "}
												{(order.paymentMethod || "-").toUpperCase()}
											</div>
											<div className="text-[10px] text-muted-foreground">
												{getOrderLocationLabel(order)} · {shiftMeta.shiftName}
											</div>
											<div className="text-[10px] text-muted-foreground">
												Kasir: {shiftMeta.cashierName}
											</div>
										</div>
										<div className="shrink-0 text-right">
											<p className="font-bold text-sm">
												{formatrupiah(order.totalAmount)}
											</p>
										{order.customer_source_id && (
											<span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0 text-[10px] font-black text-amber-700 uppercase tracking-wider">
												<Star className="h-2.5 w-2.5 fill-amber-400" /> Member
											</span>
										)}
											<p className="text-[10px] text-muted-foreground tabular-nums">
												{format(order.createdAt, "dd MMM HH:mm", { locale: id })}
											</p>
										</div>
									</div>
								</Button>
							);
						})
					)}
				</div>

				<div className="hidden rounded-2xl border border-border bg-card shadow-sm md:block">
					<div className="overflow-x-auto">
						<table className="w-full min-w-[980px] text-left text-sm">
							<thead className="sticky top-0 z-10 bg-muted/70 uppercase tracking-wider">
								<tr className="text-[11px] text-muted-foreground">
									<th className="px-3 py-2.5">ID</th>
									<th className="px-3 py-2.5">Pelanggan</th>
									<th className="px-3 py-2.5">Lokasi</th>
									<th className="px-3 py-2.5">Shift</th>
									<th className="px-3 py-2.5 text-right">Total</th>
									<th className="px-3 py-2.5 text-right">Laba</th>
									<th className="px-3 py-2.5">Status</th>
									<th className="px-3 py-2.5">Channel</th>
									<th className="px-3 py-2.5 text-right">Waktu</th>
									<th className="px-3 py-2.5 text-center">Aksi</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-border">
								{filteredOrders?.length === 0 ? (
									<tr>
										<td
											className="h-44 text-center text-muted-foreground text-sm"
											colSpan={10}
										>
											Tidak ada pesanan yang cocok dengan filter.
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
											>
												<td className="px-3 py-2.5 align-top">
													<div className="flex flex-col leading-tight">
														<span className="font-bold font-mono text-[11px] text-primary">
															{order.type === "booking" ? "BK-" : "#"}
															{order.displayId}
														</span>
														{order.type === "booking" && (
															<span className="text-[11px] text-blue-600 uppercase">
																Reservasi
															</span>
														)}
													</div>
												</td>
												<td className="px-3 py-2.5 align-top">
													<div className="flex items-center gap-2">
														<div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-primary">
															<User className="h-3 w-3" />
														</div>
														<div className="min-w-0 leading-tight">
															<p className="max-w-[170px] truncate font-medium text-[11px]">
																{order.customerName || "Pelanggan Umum"}{order.customer_source_id && order.customer_source_id.trim() ? <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[11px] font-black text-amber-700 uppercase ml-1">⭐ Member</span> : null}
															</p>
															<p className="text-[10px] text-muted-foreground uppercase">
																{(order.paymentMethod || "-").toUpperCase()}
															</p>
														</div>
													</div>
												</td>
												<td className="px-3 py-2.5 align-top text-[11px]">
													{getOrderLocationLabel(order)}
												</td>
												<td className="px-3 py-2.5 align-top">
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
												<td className="px-3 py-2.5 text-right align-top font-semibold text-[11px] tabular-nums">
													{formatrupiah(order.totalAmount)}
												</td>
												<td className="px-3 py-2.5 text-right align-top">
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
															<span
																className={`font-semibold text-[11px] ${profit >= 0 ? "text-green-600" : "text-red-600"}`}
															>
																{formatrupiah(profit)}
															</span>
														);
													})()}
												</td>
												<td className="px-3 py-2.5 align-top">
													<Badge
														className="rounded-md px-1.5 py-0 font-normal text-[10px]"
														variant={getStatusBadgeVariant(order.status)}
													>
														{getStatusLabel(order.status)}
													</Badge>
												</td>
												<td className="px-3 py-2.5 align-top">
													<div className="flex flex-col gap-1 leading-tight">
														<Badge
															className={`w-fit px-1.5 py-0 text-[11px] ${order.type === "booking" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-700"}`}
															variant="outline"
														>
															{order.type === "booking" ? "Booking" : "POS"}
														</Badge>
														<span className="text-[10px] text-muted-foreground">
															{order.orderType === "dine_in" ? "Dine in" : "Takeaway"}
														</span>
													</div>
												</td>
												<td className="px-3 py-2.5 text-right align-top text-[10px] text-muted-foreground tabular-nums">
													<div className="leading-tight">
														<div>{format(order.createdAt, "dd MMM", { locale: id })}</div>
														<div>{format(order.createdAt, "HH:mm", { locale: id })}</div>
													</div>
												</td>
												<td className="px-3 py-2.5 text-center align-top">
													<div className="flex items-center justify-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
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
					<SheetHeader className="border-border border-b px-4 py-3">
						<div className="flex items-center justify-between">
							<SheetTitle className="text-lg">Detail Pesanan</SheetTitle>
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
														{selectedOrder.customerName || "Tanpa Nama"}{selectedOrder.customer_source_id && selectedOrder.customer_source_id.trim() ? <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[11px] font-black text-amber-700 uppercase ml-1">⭐ Member</span> : null}
													</p>
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
													{selectedOrder.paymentMethod || "-"}
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
											className="h-9 w-9 text-destructive"
											onClick={() => handleDeleteOrder(selectedOrder)}
											variant="ghost"
											size="icon"
										>
											<Trash2 className="h-4 w-4" />
										</Button>
									</div>
								</div>
							</div>
						</div>
					)}
				</SheetContent>
			</Sheet>
		</div>
	);
}





