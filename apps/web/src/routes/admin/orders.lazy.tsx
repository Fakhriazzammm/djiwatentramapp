import { createLazyFileRoute } from "@tanstack/react-router";
import { api } from "@yumipos/backend/convex/_generated/api";
import type { Id } from "@yumipos/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
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
	Clock,
	CreditCard,
	Eye,
	Filter,
	Loader2,
	Search,
	ShoppingBag,
	User,
	XCircle,
	Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
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
	const allOrders = useQuery(api.orders.getOrders, {});
	const allBookingOrders = useQuery(api.booking.getBookingOrders, { slug: "booking" });
	
	const updateStatus = useMutation(api.orders.updateOrderStatus);
	const updateBookingStatus = useMutation(api.booking.updateBookingStatus);
	const deleteOrder = useMutation(api.orders.deleteOrder);
	const deleteBookingOrder = useMutation(api.booking.deleteBookingOrder);
	
	const hppProductMap = useQuery(api.hpp.getHppProductMap);
	const hppCogs = useQuery(api.hpp.getOrdersCogs);
	const historicalShifts = useQuery(api.finance.getHistoricalShifts, {});

	const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
	const [statusFilter, setStatusFilter] = useState<string>("all");
	const [searchQuery, setSearchQuery] = useState("");
	const [quickDateFilter, setQuickDateFilter] =
		useState<QuickDateFilter>("all");
	const [isDetailOpen, setIsDetailOpen] = useState(false);
	const [hasAppliedFocus, setHasAppliedFocus] = useState(false);

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
			toast.success("Berhasil dihapus");
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

	const getStatusColor = (status: string) => {
		switch (status) {
			case "paid":
			case "completed":
				return "bg-green-100 text-green-700 border-green-200";
			case "pending":
				return "bg-yellow-100 text-yellow-700 border-yellow-200";
			case "cancelled":
				return "bg-red-100 text-red-700 border-red-200";
			default:
				return "bg-gray-100 text-gray-700 border-gray-200";
		}
	};

	const getStatusLabel = (status: string) => {
		switch (status) {
			case "paid":
				return "Dibayar";
			case "completed":
				return "Selesai";
			case "pending":
				return "Tertunda";
			case "cancelled":
				return "Dibatalkan";
			default:
				return status;
		}
	};

	if (unifiedOrders === undefined) {
		return (
			<div className="space-y-4 md:space-y-6">
				<div>
					<Skeleton className="h-8 w-48 mb-2" />
					<Skeleton className="h-4 w-64" />
				</div>

				{/* Profit Summary Skeleton */}
				<div className="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-3">
					{Array.from({ length: 4 }).map((_, i) => (
						<div key={i} className="rounded-lg border border-border bg-card p-2.5 md:p-3">
							<Skeleton className="h-3 w-16 mb-2" />
							<Skeleton className="h-6 w-24" />
						</div>
					))}
				</div>

				{/* Filters Skeleton */}
				<div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3 md:flex-row md:items-center md:gap-4 md:p-4">
					<Skeleton className="h-10 flex-1 rounded-md" />
					<Skeleton className="h-10 w-full md:w-[180px] rounded-md" />
				</div>

				{/* Table/List Skeleton */}
				<div className="rounded-xl border border-border bg-card overflow-hidden">
					<div className="hidden md:block">
						<div className="bg-muted/50 p-4 flex justify-between">
							{Array.from({ length: 6 }).map((_, i) => (
								<Skeleton key={i} className="h-4 w-20" />
							))}
						</div>
						<div className="divide-y divide-border">
							{Array.from({ length: 5 }).map((_, i) => (
								<div key={i} className="p-4 flex justify-between items-center">
									<Skeleton className="h-4 w-24" />
									<Skeleton className="h-4 w-32" />
									<Skeleton className="h-4 w-20" />
									<Skeleton className="h-4 w-16" />
									<Skeleton className="h-4 w-24" />
									<Skeleton className="h-8 w-20" />
								</div>
							))}
						</div>
					</div>
					<div className="md:hidden space-y-2 p-2">
						{Array.from({ length: 5 }).map((_, i) => (
							<div key={i} className="p-3 border border-border rounded-xl">
								<div className="flex justify-between mb-2">
									<Skeleton className="h-4 w-24" />
									<Skeleton className="h-4 w-20" />
								</div>
								<div className="flex justify-between">
									<Skeleton className="h-3 w-32" />
									<Skeleton className="h-3 w-16" />
								</div>
							</div>
						))}
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="fade-in slide-in-from-bottom-4 flex h-full animate-in flex-col space-y-3 duration-500 md:space-y-6">
			<div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between md:gap-4">
				<div>
					<h2 className="font-bold text-lg tracking-tight md:text-2xl">
						Riwayat Pesanan
					</h2>
					<p className="text-muted-foreground text-xs md:text-sm">
						Kelola dan pantau semua transaksi pesanan masuk.
					</p>
				</div>
			</div>

			{/* Profit Summary */}
			{hppCogs && hppCogs.matchedOrders > 0 && (
				<div className="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-3">
					<div className="rounded-lg border border-border bg-card p-2.5 md:p-3">
						<p className="text-[10px] text-muted-foreground uppercase">
							Revenue
						</p>
						<p className="font-bold text-sm md:text-lg">
							{formatrupiah(hppCogs.totalRevenue)}
						</p>
					</div>
					<div className="rounded-lg border border-border bg-card p-2.5 md:p-3">
						<p className="text-[10px] text-muted-foreground uppercase">COGS</p>
						<p className="font-bold text-orange-600 text-sm md:text-lg">
							{formatrupiah(hppCogs.totalCogs)}
						</p>
					</div>
					<div className="rounded-lg border border-border bg-card p-2.5 md:p-3">
						<p className="text-[10px] text-muted-foreground uppercase">Laba</p>
						<p
							className={`font-bold text-sm md:text-lg ${hppCogs.totalProfit >= 0 ? "text-green-600" : "text-red-600"}`}
						>
							{formatrupiah(hppCogs.totalProfit)}
						</p>
					</div>
					<div className="rounded-lg border border-border bg-card p-2.5 md:p-3">
						<p className="text-[10px] text-muted-foreground uppercase">
							Margin
						</p>
						<p className="font-bold text-primary text-sm md:text-lg">
							{hppCogs.grossMargin.toFixed(1)}%
						</p>
					</div>
				</div>
			)}

			{/* Filters - compact on mobile */}
			<div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 shadow-sm md:gap-4 md:p-4">
				<div className="flex flex-wrap gap-2">
					<Button
						className="h-8 rounded-full px-3 text-xs"
						onClick={() => setQuickDateFilter("all")}
						size="sm"
						variant={quickDateFilter === "all" ? "default" : "outline"}
					>
						Semua Tanggal
					</Button>
					{quickDateFilterOptions.map((option) => (
						<Button
							className="h-8 rounded-full px-3 text-xs"
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
				<div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-4">
				<div className="relative flex-1">
					<Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						className="h-10 pl-9 text-sm"
						onChange={(e) => setSearchQuery(e.target.value)}
						placeholder="Cari pesanan..."
						value={searchQuery}
					/>
				</div>
				<div className="flex items-center gap-2">
					<Filter className="h-4 w-4 shrink-0 text-muted-foreground" />
					<Select 
						onValueChange={(val: string | null) => val && setStatusFilter(val)} 
						value={statusFilter}
					>
						<SelectTrigger className="w-full md:w-[180px]">
							<SelectValue placeholder="Status" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">Semua Status</SelectItem>
							<SelectItem value="pending">Tertunda</SelectItem>
							<SelectItem value="paid">Dibayar</SelectItem>
							<SelectItem value="completed">Selesai</SelectItem>
							<SelectItem value="cancelled">Dibatalkan</SelectItem>
						</SelectContent>
					</Select>
				</div>
				</div>
			</div>

			{/* Mobile: Card-based order list */}
			<div className="flex-1 space-y-2 overflow-y-auto md:hidden">
				{filteredOrders?.length === 0 ? (
					<p className="py-12 text-center text-muted-foreground text-sm">
						Tidak ada pesanan ditemukan.
					</p>
				) : (
					filteredOrders?.map((order: Order) => (
						<div
							className="rounded-xl border border-border bg-card p-3 transition-colors active:bg-muted/50"
							key={order._id}
							onClick={() => {
								setSelectedOrder(order as any);
								setIsDetailOpen(true);
							}}
						>
							<div className="flex items-start justify-between">
								<div className="min-w-0 flex-1">
									<div className="flex items-center gap-2">
										<span className="font-bold font-mono text-primary text-xs">
											{order.type === "booking" ? "BK-" : "#"}{order.displayId}
										</span>
										{order.type === "booking" && (
											<Badge className="bg-blue-50 text-blue-600 border-blue-200 text-[8px] px-1 py-0" variant="outline">Booking</Badge>
										)}
										<Badge
											className={`rounded-md px-1.5 py-0 font-normal text-[9px] ${getStatusColor(order.status)}`}
											variant="outline"
										>
											{getStatusLabel(order.status)}
										</Badge>
									</div>
									<div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
										<span>{order.customerName || "Pelanggan Umum"}</span>
										<span>&middot;</span>
										<span className="capitalize">{order.paymentMethod}</span>
										{order.orderType && (
											<>
												<span>&middot;</span>
												<span className="font-bold text-primary uppercase">
													{order.orderType === "dine_in" ? `Meja ${order.tableNumber || "-"}` : "Takeaway"}
												</span>
											</>
										)}
									</div>
								</div>
								<div className="text-right">
									<p className="font-bold text-sm">
										{formatrupiah(order.totalAmount)}
									</p>
									<p className="text-[10px] text-muted-foreground">
										{format(order.createdAt, "dd MMM HH:mm", { locale: id })}
									</p>
								</div>
							</div>
						</div>
					))
				)}
			</div>

			{/* Desktop: Table view */}
			<div className="relative hidden flex-1 overflow-hidden rounded-xl border border-border bg-card shadow-sm md:block">
				<div className="absolute inset-0 overflow-auto">
					<table className="w-full text-left text-sm">
						<thead className="sticky top-0 z-10 bg-muted/50 font-semibold text-muted-foreground text-[10px] uppercase tracking-wider">
							<tr>
								<th className="px-4 py-3">ID Pesanan</th>
								<th className="px-4 py-3">Shift</th>
								<th className="px-4 py-3">Pelanggan</th>
								<th className="px-4 py-3 text-right">Total</th>
								<th className="px-4 py-3 text-right">Laba</th>
								<th className="px-4 py-3 text-center">Status</th>
								<th className="px-4 py-3">Tipe/Metode</th>
								<th className="px-4 py-3 text-right">Waktu</th>
								<th className="px-4 py-3 text-center">Aksi</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-border">
							{filteredOrders?.length === 0 ? (
								<tr>
									<td
										className="h-40 text-center text-muted-foreground"
										colSpan={9}
									>
										Tidak ada pesanan yang ditemukan.
									</td>
								</tr>
							) : (
								filteredOrders?.map((order: Order) => {
									let shiftName = "-";
									if (historicalShifts) {
										const shift = historicalShifts.find((s: any) => order.createdAt >= s.startTime && (!s.endTime || order.createdAt <= s.endTime));
										if (shift) {
											shiftName = shift.shiftName || "Shift Aktif";
										}
									}

									return (
										<tr
											className="group cursor-pointer transition-colors hover:bg-muted/30"
											key={order._id}
											onClick={() => {
												setSelectedOrder(order as any);
												setIsDetailOpen(true);
											}}
										>
											<td className="px-4 py-3 font-medium font-mono text-primary text-xs">
												<div className="flex flex-col">
													<span>{order.displayId}</span>
													{order.type === "booking" && (
														<span className="text-[9px] text-blue-500 font-sans font-bold">BOOKING</span>
													)}
												</div>
											</td>
											<td className="px-4 py-3">
												{shiftName !== "-" ? (
													<span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-1 text-[9px] font-bold text-primary uppercase">
														{shiftName}
													</span>
												) : (
													<span className="text-muted-foreground text-xs">-</span>
												)}
											</td>
											<td className="px-4 py-3">
											<div className="flex flex-col gap-0.5">
												<div className="flex items-center gap-1.5">
													<div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[9px] text-primary">
														<User className="h-3 w-3" />
													</div>
													<span className="font-medium text-xs truncate max-w-[120px]">
														{order.customerName || "Pelanggan Umum"}
													</span>
												</div>
												{order.orderType && (
													<span className="text-[9px] font-bold text-primary uppercase ml-6">
														{order.orderType === "dine_in" ? `Meja ${order.tableNumber || "-"}` : "Takeaway"}
													</span>
												)}
											</div>
										</td>
										<td className="px-4 py-3 font-bold text-xs text-right whitespace-nowrap">
											{formatrupiah(order.totalAmount)}
										</td>
										<td className="px-4 py-3 text-right whitespace-nowrap">
											{(() => {
												if (!hppProductMap) {
													return (
														<span className="text-muted-foreground text-xs">
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
														<span className="text-muted-foreground text-xs">
															-
														</span>
													);
												}
												const profit = order.totalAmount - orderCogs;
												return (
													<span
														className={`font-semibold text-[11px] ${profit >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
													>
														{formatrupiah(profit)}
													</span>
												);
											})()}
										</td>
										<td className="px-4 py-3 text-center">
											<Badge
												className={`rounded-md px-1.5 py-0 font-normal text-[10px] ${getStatusColor(order.status)}`}
												variant="outline"
											>
												{getStatusLabel(order.status)}
											</Badge>
										</td>
										<td className="px-4 py-3">
											<div className="flex flex-col gap-0.5">
												<Badge className={`text-[9px] w-fit px-1.5 py-0 ${order.type === "booking" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-700"}`} variant="outline">
													{order.type === "booking" ? "Reservasi" : "POS"}
												</Badge>
												<span className="capitalize text-[10px] text-muted-foreground font-medium">
													{order.paymentMethod}
												</span>
											</div>
										</td>
										<td className="px-4 py-3 text-right text-muted-foreground text-[10px] tabular-nums whitespace-nowrap">
											<div className="flex flex-col">
												<span>{format(order.createdAt, "dd MMM", { locale: id })}</span>
												<span>{format(order.createdAt, "HH:mm", { locale: id })}</span>
											</div>
										</td>
										<td className="px-4 py-3 text-center">
												<div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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

			{/* Order Detail Sheet */}
			<Sheet onOpenChange={setIsDetailOpen} open={isDetailOpen}>
				<SheetContent className="flex w-full flex-col sm:max-w-lg">
					<SheetHeader className="border-border border-b px-4 py-3">
						<div className="flex items-center justify-between">
							<SheetTitle className="text-lg">Detail Pesanan</SheetTitle>
							<Badge
								className={`${selectedOrder ? getStatusColor(selectedOrder.status) : ""} px-2 py-0.5 text-[10px] capitalize`}
								variant="outline"
							>
								{selectedOrder ? getStatusLabel(selectedOrder.status) : ""}
							</Badge>
						</div>
						<SheetDescription className="font-mono text-[10px] text-primary">
							{(selectedOrder as any)?.type === "booking" ? "BK-" : "#"}{selectedOrder?.displayId}
						</SheetDescription>
					</SheetHeader>

					{selectedOrder && (
						<div className="flex flex-1 flex-col overflow-hidden">
							<ScrollArea className="flex-1 px-4 py-3">
								<div className="space-y-4 pb-4">
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
														{selectedOrder.customerName || "Tanpa Nama"}
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
											{selectedOrder.items.map((item, _idx) => (
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
														<p className="text-[9px] text-muted-foreground">
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
													{selectedOrder.paymentMethod}
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

									{/* Status Actions */}
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
								</div>
							</ScrollArea>

							<div className="border-border border-t p-3 flex gap-2">
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
					)}
				</SheetContent>
			</Sheet>
		</div>
	);
}
