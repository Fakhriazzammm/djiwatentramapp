// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { api } from "@yumipos/backend/convex/_generated/api";
import type { Id } from "@yumipos/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { format } from "date-fns";
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
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
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

export const Route = createFileRoute("/admin/orders")({
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
}

function AdminOrders() {
	const allOrders = useQuery(api.orders.getOrders, {});
	const updateStatus = useMutation(api.orders.updateOrderStatus);
	const hppProductMap = useQuery(api.hpp.getHppProductMap);
	const hppCogs = useQuery(api.hpp.getOrdersCogs);

	const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
	const [statusFilter, setStatusFilter] = useState<string>("all");
	const [searchQuery, setSearchQuery] = useState("");
	const [isDetailOpen, setIsDetailOpen] = useState(false);

	// Client-side filtering
	const filteredOrders = allOrders?.filter((order) => {
		const matchesStatus =
			statusFilter === "all" || order.status === statusFilter;
		const matchesSearch =
			order.orderNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
			(order.customerName || "")
				.toLowerCase()
				.includes(searchQuery.toLowerCase());
		return matchesStatus && matchesSearch;
	});

	const handleStatusUpdate = async (
		newStatus: "pending" | "paid" | "completed" | "cancelled"
	) => {
		if (!selectedOrder) {
			return;
		}
		try {
			await updateStatus({ id: selectedOrder._id, status: newStatus });
			toast.success(
				`Status pesanan diperbarui menjadi ${getStatusLabel(newStatus)}`
			);
			// Update the selected order locally to reflect change immediately in UI
			setSelectedOrder({ ...selectedOrder, status: newStatus });
		} catch (_error) {
			toast.error("Gagal memperbarui status pesanan");
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

	if (allOrders === undefined) {
		return (
			<div className="flex h-full w-full items-center justify-center">
				<Loader2 className="h-8 w-8 animate-spin text-primary" />
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
			<div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3 shadow-sm md:flex-row md:items-center md:gap-4 md:p-4">
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
					<Select onValueChange={setStatusFilter} value={statusFilter}>
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

			{/* Mobile: Card-based order list */}
			<div className="flex-1 space-y-2 overflow-y-auto md:hidden">
				{filteredOrders?.length === 0 ? (
					<p className="py-12 text-center text-muted-foreground text-sm">
						Tidak ada pesanan ditemukan.
					</p>
				) : (
					filteredOrders?.map((order) => (
						<div
							className="rounded-xl border border-border bg-card p-3 transition-colors active:bg-muted/50"
							key={order._id}
							onClick={() => {
								// @ts-expect-error
								setSelectedOrder(order);
								setIsDetailOpen(true);
							}}
						>
							<div className="flex items-start justify-between">
								<div className="min-w-0 flex-1">
									<div className="flex items-center gap-2">
										<span className="font-bold font-mono text-primary text-xs">
											#{order.orderNumber}
										</span>
										<Badge
											className={`rounded-md px-1.5 py-0 font-normal text-[9px] ${getStatusColor(order.status)}`}
											variant="outline"
										>
											{getStatusLabel(order.status)}
										</Badge>
									</div>
									<div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
										<span>{order.customerName || "Pelanggan Umum"}</span>
										<span>&middot;</span>
										<span className="capitalize">{order.paymentMethod}</span>
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
						<thead className="sticky top-0 z-10 bg-muted/50 font-semibold text-muted-foreground text-xs uppercase">
							<tr>
								<th className="px-6 py-4">ID Pesanan</th>
								<th className="px-6 py-4">Pelanggan</th>
								<th className="px-6 py-4">Total</th>
								<th className="px-6 py-4">Laba</th>
								<th className="px-6 py-4">Status</th>
								<th className="px-6 py-4">Metode</th>
								<th className="px-6 py-4 text-right">Waktu</th>
								<th className="px-6 py-4 text-center">Aksi</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-border">
							{filteredOrders?.length === 0 ? (
								<tr>
									<td
										className="h-40 text-center text-muted-foreground"
										colSpan={8}
									>
										Tidak ada pesanan yang ditemukan.
									</td>
								</tr>
							) : (
								filteredOrders?.map((order) => (
									<tr
										className="group cursor-pointer transition-colors hover:bg-muted/30"
										key={order._id}
										onClick={() => {
											// @ts-expect-error
											setSelectedOrder(order);
											setIsDetailOpen(true);
										}}
									>
										<td className="px-6 py-4 font-medium font-mono text-primary">
											{order.orderNumber}
										</td>
										<td className="px-6 py-4">
											<div className="flex items-center gap-2">
												<div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-[10px] text-primary">
													<User className="h-3 w-3" />
												</div>
												<span className="font-medium">
													{order.customerName || "Pelanggan Umum"}
												</span>
											</div>
										</td>
										<td className="px-6 py-4 font-bold">
											{formatrupiah(order.totalAmount)}
										</td>
										<td className="px-6 py-4">
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
														className={`font-semibold text-xs ${profit >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
													>
														{formatrupiah(profit)}
													</span>
												);
											})()}
										</td>
										<td className="px-6 py-4">
											<Badge
												className={`rounded-md px-2 py-0.5 font-normal ${getStatusColor(order.status)}`}
												variant="outline"
											>
												{getStatusLabel(order.status)}
											</Badge>
										</td>
										<td className="px-6 py-4">
											<div className="flex items-center gap-2 text-muted-foreground text-xs">
												<CreditCard className="h-3.5 w-3.5" />
												<span className="capitalize">
													{order.paymentMethod}
												</span>
											</div>
										</td>
										<td className="px-6 py-4 text-right text-muted-foreground text-xs tabular-nums">
											{format(order.createdAt, "dd MMM HH:mm", { locale: id })}
										</td>
										<td className="px-6 py-4 text-center">
											<Button
												className="h-8 w-8 text-muted-foreground hover:text-primary"
												onClick={(e) => {
													e.stopPropagation();
													// @ts-expect-error
													setSelectedOrder(order);
													setIsDetailOpen(true);
												}}
												size="icon"
												variant="ghost"
											>
												<Eye className="h-4 w-4" />
											</Button>
										</td>
									</tr>
								))
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
							#{selectedOrder?.orderNumber}
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
											<div className="flex justify-between text-sm">
												<span className="font-bold">Total Pembayaran</span>
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

							<div className="border-border border-t p-3">
								<Button
									className="h-9 w-full text-xs"
									onClick={() => setIsDetailOpen(false)}
									variant="outline"
								>
									Tutup Detail
								</Button>
							</div>
						</div>
					)}
				</SheetContent>
			</Sheet>
		</div>
	);
}
