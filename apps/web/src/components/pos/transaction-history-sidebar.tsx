import { api } from "@yumipos/backend/convex/_generated/api";
import type { Doc, Id } from "@yumipos/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import {
	ChevronLeft,
	ClipboardList,
	History,
	Loader2,
	Pencil,
	Printer,
	Save,
	Trash2,
	X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@/components/ui/sheet";

type FilterType =
	| "today"
	| "yesterday"
	| "this_week"
	| "last_week"
	| "this_month"
	| "last_month";

interface FilterOption {
	value: FilterType;
	label: string;
}

const FILTER_OPTIONS: FilterOption[] = [
	{ value: "today", label: "Hari Ini" },
	{ value: "yesterday", label: "Kemarin" },
	{ value: "this_week", label: "Minggu Ini" },
	{ value: "last_week", label: "Minggu Kemarin" },
	{ value: "this_month", label: "Bulan Ini" },
	{ value: "last_month", label: "Bulan Lalu" },
];

function getDateRange(filter: FilterType): { start: number; end: number } {
	const now = new Date();
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

	switch (filter) {
		case "today": {
			return {
				start: today.getTime(),
				end: today.getTime() + 24 * 60 * 60 * 1000 - 1,
			};
		}
		case "yesterday": {
			const yesterday = new Date(today);
			yesterday.setDate(yesterday.getDate() - 1);
			return {
				start: yesterday.getTime(),
				end: yesterday.getTime() + 24 * 60 * 60 * 1000 - 1,
			};
		}
		case "this_week": {
			const startOfWeek = new Date(today);
			startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
			const endOfWeek = new Date(startOfWeek);
			endOfWeek.setDate(endOfWeek.getDate() + 6);
			return {
				start: startOfWeek.getTime(),
				end: endOfWeek.getTime() + 24 * 60 * 60 * 1000 - 1,
			};
		}
		case "last_week": {
			const startOfLastWeek = new Date(today);
			startOfLastWeek.setDate(
				startOfLastWeek.getDate() - startOfLastWeek.getDay() - 7
			);
			const endOfLastWeek = new Date(startOfLastWeek);
			endOfLastWeek.setDate(endOfLastWeek.getDate() + 6);
			return {
				start: startOfLastWeek.getTime(),
				end: endOfLastWeek.getTime() + 24 * 60 * 60 * 1000 - 1,
			};
		}
		case "this_month": {
			const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
			const endOfMonth = new Date(
				now.getFullYear(),
				now.getMonth() + 1,
				0,
				23,
				59,
				59,
				999
			);
			return {
				start: startOfMonth.getTime(),
				end: endOfMonth.getTime(),
			};
		}
		case "last_month": {
			const startOfLastMonth = new Date(
				now.getFullYear(),
				now.getMonth() - 1,
				1
			);
			const endOfLastMonth = new Date(
				now.getFullYear(),
				now.getMonth(),
				0,
				23,
				59,
				59,
				999
			);
			return {
				start: startOfLastMonth.getTime(),
				end: endOfLastMonth.getTime(),
			};
		}
		default: {
			return {
				start: today.getTime(),
				end: today.getTime() + 24 * 60 * 60 * 1000 - 1,
			};
		}
	}
}

const formatCurrency = (value: number) =>
	new Intl.NumberFormat("id-ID", {
		style: "currency",
		currency: "IDR",
		maximumFractionDigits: 0,
	}).format(value);

const formatTime = (timestamp: number) =>
	new Date(timestamp).toLocaleTimeString("id-ID", {
		hour: "2-digit",
		minute: "2-digit",
	});

const formatDate = (timestamp: number) =>
	new Date(timestamp).toLocaleDateString("id-ID", {
		day: "numeric",
		month: "short",
		year: "numeric",
	});

export function TransactionHistorySidebar() {
	const [isOpen, setIsOpen] = useState(false);
	const [activeFilter, setActiveFilter] = useState<FilterType>("today");
	const [selectedOrder, setSelectedOrder] = useState<Doc<"orders"> | null>(
		null
	);
	const [isEditMode, setIsEditMode] = useState(false);
	const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);

	const orders = useQuery(api.orders.getOrders, {});
	const updateOrder = useMutation(api.orders.updateOrder);
	const deleteOrder = useMutation(api.orders.deleteOrder);

	const filteredOrders = useMemo(() => {
		if (!orders) return [];

		const { start, end } = getDateRange(activeFilter);

		return orders.filter((order: Doc<"orders">) => {
			const orderTime = order.createdAt;
			return orderTime >= start && orderTime <= end;
		});
	}, [orders, activeFilter]);

	const totalAmount = useMemo(() => {
		return filteredOrders
			.filter((o: Doc<"orders">) => o.status === "paid" || o.status === "completed")
			.reduce((acc: number, o: Doc<"orders">) => acc + o.totalAmount, 0);
	}, [filteredOrders]);

	const paidOrdersCount = filteredOrders.filter(
		(o: Doc<"orders">) => o.status === "paid" || o.status === "completed"
	).length;

	const handleUpdateOrder = async (
		id: Id<"orders">,
		data: { customerName?: string; paymentMethod?: string; status?: any }
	) => {
		try {
			await updateOrder({ id, ...data });
			toast.success("Pesanan berhasil diperbarui");
			setIsEditMode(false);
			// Update local selected order if it's the one being edited
			if (selectedOrder && selectedOrder._id === id) {
				setSelectedOrder({ ...selectedOrder, ...data });
			}
		} catch (error) {
			console.error(error);
			toast.error("Gagal memperbarui pesanan");
		}
	};

	const handleDeleteOrder = async (id: Id<"orders">) => {
		try {
			await deleteOrder({ id });
			toast.success("Pesanan berhasil dihapus");
			setSelectedOrder(null);
			setIsConfirmDeleteOpen(false);
		} catch (error) {
			console.error(error);
			toast.error("Gagal menghapus pesanan");
		}
	};

	return (
		<>
			<Sheet
				onOpenChange={(open) => {
					setIsOpen(open);
					if (!open) {
						setTimeout(() => {
							setSelectedOrder(null);
							setIsEditMode(false);
						}, 300);
					}
				}}
				open={isOpen}
			>
				<SheetTrigger>
					<Button
						className="shrink-0 gap-1.5 bg-background"
						onClick={() => setIsOpen(true)}
						size="sm"
						variant="outline"
					>
						<History className="h-4 w-4" />
						<span className="hidden sm:inline">Riwayat</span>
						<span className="sr-only">Riwayat Transaksi</span>
					</Button>
				</SheetTrigger>
				<SheetContent
					className="flex w-full flex-col p-0 sm:w-[450px]"
					side="right"
				>
					{selectedOrder ? (
						<OrderDetailView
							isEditMode={isEditMode}
							onBack={() => {
								setSelectedOrder(null);
								setIsEditMode(false);
							}}
							onDelete={() => setIsConfirmDeleteOpen(true)}
							onEdit={() => setIsEditMode(true)}
							onSave={(data) => handleUpdateOrder(selectedOrder._id, data)}
							order={selectedOrder}
						/>
					) : (
						<>
							<SheetHeader className="border-b p-4">
								<SheetTitle className="flex items-center gap-2">
									<ClipboardList className="h-5 w-5 text-primary" />
									Riwayat Transaksi
								</SheetTitle>
							</SheetHeader>

							{/* Filter Buttons */}
							<div className="border-b bg-muted/30 p-3">
								<div className="flex flex-wrap gap-1.5">
									{FILTER_OPTIONS.map((option) => (
										<button
											className={`rounded-full px-3 py-1.5 font-medium text-xs transition-all ${
												activeFilter === option.value
													? "bg-primary text-primary-foreground"
													: "bg-muted text-muted-foreground hover:bg-muted/80"
											}`}
											key={option.value}
											onClick={() => setActiveFilter(option.value)}
											type="button"
										>
											{option.label}
										</button>
									))}
								</div>
							</div>

							{/* Orders List */}
							<div className="flex-1 overflow-hidden">
								{orders === undefined && (
									<div className="flex h-full items-center justify-center">
										<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
									</div>
								)}
								{orders !== undefined && filteredOrders.length === 0 && (
									<div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
										<ClipboardList className="h-12 w-12 text-muted-foreground/30" />
										<p className="font-medium text-muted-foreground text-sm">
											Tidak ada transaksi
										</p>
										<p className="text-muted-foreground text-xs">
											{
												FILTER_OPTIONS.find((f) => f.value === activeFilter)
													?.label
											}
										</p>
									</div>
								)}
								{orders !== undefined && filteredOrders.length > 0 && (
									<ScrollArea className="h-full">
										<div className="space-y-2 p-3">
											{filteredOrders.map((order: Doc<"orders">) => (
												<OrderCard
													key={order._id}
													onClick={() => setSelectedOrder(order)}
													order={order}
												/>
											))}
										</div>
									</ScrollArea>
								)}
							</div>

							{/* Total Footer */}
							<div className="shrink-0 border-t bg-card p-4">
								<div className="mb-2 flex items-center justify-between">
									<span className="text-muted-foreground text-sm">
										{paidOrdersCount} transaksi selesai
									</span>
								</div>
								<div className="flex items-center justify-between">
									<span className="font-semibold text-foreground">
										Total Penjualan
									</span>
									<span className="font-bold text-primary text-xl">
										{formatCurrency(totalAmount)}
									</span>
								</div>
							</div>
						</>
					)}
				</SheetContent>
			</Sheet>

			<ConfirmationModal
				isOpen={isConfirmDeleteOpen}
				message="Apakah Anda yakin ingin menghapus pesanan ini? Tindakan ini juga akan menghapus transaksi keuangan terkait."
				onClose={() => setIsConfirmDeleteOpen(false)}
				onConfirm={() => selectedOrder && handleDeleteOrder(selectedOrder._id)}
				title="Hapus Pesanan"
				variant="danger"
			/>
		</>
	);
}

function OrderCard({
	order,
	onClick,
}: {
	order: Doc<"orders">;
	onClick: () => void;
}) {
	const statusColors: Record<string, string> = {
		pending: "bg-accent text-accent-foreground",
		paid: "bg-primary text-primary-foreground",
		completed: "bg-primary text-primary-foreground",
		cancelled: "bg-destructive text-destructive-foreground",
	};

	const statusLabels: Record<string, string> = {
		pending: "Pending",
		paid: "Lunas",
		completed: "Selesai",
		cancelled: "Batal",
	};

	return (
		<button
			className="w-full cursor-pointer rounded-lg border bg-card p-3 text-left transition-colors hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/50"
			onClick={onClick}
			type="button"
		>
			<div className="mb-2 flex items-start justify-between">
				<div>
					<p className="font-medium text-sm">#{order.orderNumber}</p>
					<p className="text-muted-foreground text-xs">
						{formatDate(order.createdAt)} - {formatTime(order.createdAt)}
					</p>
				</div>
				<span
					className={`rounded-full px-2 py-0.5 font-medium text-[10px] ${
						statusColors[order.status] || "bg-muted"
					}`}
				>
					{statusLabels[order.status] || order.status}
				</span>
			</div>

			<div className="mb-2 space-y-1">
				{order.items.slice(0, 3).map((item, idx) => (
					<div
						className="flex items-center justify-between text-xs"
						key={`${item.productId}-${idx}`}
					>
						<span className="text-muted-foreground">
							{item.quantity}x {item.productName}
						</span>
						<span>{formatCurrency(item.price * item.quantity)}</span>
					</div>
				))}
				{order.items.length > 3 && (
					<p className="text-muted-foreground text-xs">
						+{order.items.length - 3} item lainnya
					</p>
				)}
			</div>

			<div className="flex items-center justify-between border-t pt-2">
				<span className="text-muted-foreground text-xs">
					{order.paymentMethod}
				</span>
				<span className="font-bold text-sm">
					{formatCurrency(order.totalAmount)}
				</span>
			</div>
		</button>
	);
}

function OrderDetailView({
	order,
	onBack,
	onEdit,
	onDelete,
	isEditMode,
	onSave,
}: {
	order: Doc<"orders">;
	onBack: () => void;
	onEdit: () => void;
	onDelete: () => void;
	isEditMode: boolean;
	onSave: (data: {
		customerName: string;
		paymentMethod: string;
		status: any;
	}) => void;
}) {
	const [customerName, setCustomerName] = useState(order.customerName || "");
	const [paymentMethod, setPaymentMethod] = useState(order.paymentMethod);
	const [status, setStatus] = useState(order.status);

	const statusColors: Record<string, string> = {
		pending: "bg-accent text-accent-foreground",
		paid: "bg-primary text-primary-foreground",
		completed: "bg-primary text-primary-foreground",
		cancelled: "bg-destructive text-destructive-foreground",
	};

	const statusLabels: Record<string, string> = {
		pending: "Pending",
		paid: "Lunas",
		completed: "Selesai",
		cancelled: "Batal",
	};

	return (
		<>
			<SheetHeader className="border-b p-4">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2">
						<Button
							className="-ml-2 h-8 w-8 shrink-0 rounded-full"
							onClick={onBack}
							size="icon"
							variant="ghost"
						>
							<ChevronLeft className="h-5 w-5" />
							<span className="sr-only">Kembali</span>
						</Button>
						<SheetTitle className="text-lg">Detail Pesanan</SheetTitle>
					</div>
					<div className="flex items-center gap-2">
						{!isEditMode && (
							<>
								<Button
									className="h-8 w-8"
									onClick={onEdit}
									size="icon"
									variant="ghost"
								>
									<Pencil className="h-4 w-4" />
									<span className="sr-only">Edit</span>
								</Button>
								<Button
									className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
									onClick={onDelete}
									size="icon"
									variant="ghost"
								>
									<Trash2 className="h-4 w-4" />
									<span className="sr-only">Hapus</span>
								</Button>
							</>
						)}
						{isEditMode && (
							<Button
								className="h-8 w-8"
								onClick={() => {
									onSave({ customerName, paymentMethod, status });
								}}
								size="icon"
								variant="ghost"
							>
								<Save className="h-4 w-4 text-primary" />
								<span className="sr-only">Simpan</span>
							</Button>
						)}
					</div>
				</div>
			</SheetHeader>

			<ScrollArea className="flex-1">
				<div className="space-y-6 p-4">
					{/* Header Info */}
					<div className="flex items-start justify-between">
						<div>
							<h3 className="font-bold font-mono text-xl">
								#{order.orderNumber}
							</h3>
							<p className="text-muted-foreground text-sm">
								{formatDate(order.createdAt)} • {formatTime(order.createdAt)}
							</p>
						</div>
						{!isEditMode && (
							<span
								className={`rounded-full px-2.5 py-0.5 font-semibold text-xs ${statusColors[order.status] || "bg-muted"}`}
							>
								{statusLabels[order.status] || order.status}
							</span>
						)}
					</div>

					{/* Customer Info */}
					<div className="space-y-4 rounded-lg border bg-muted/30 p-4 text-sm">
						<div className="space-y-2">
							<Label className="text-muted-foreground">Pelanggan</Label>
							{isEditMode ? (
								<Input
									onChange={(e) => setCustomerName(e.target.value)}
									placeholder="Nama Pelanggan"
									value={customerName}
								/>
							) : (
								<p className="font-medium">{order.customerName || "-"}</p>
							)}
						</div>

						<div className="space-y-2">
							<Label className="text-muted-foreground">Metode Pembayaran</Label>
							{isEditMode ? (
								<Select onValueChange={setPaymentMethod} value={paymentMethod}>
									<SelectTrigger>
										<SelectValue placeholder="Pilih Metode" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="cash">Tunai</SelectItem>
										<SelectItem value="qris">QRIS</SelectItem>
										<SelectItem value="transfer">Transfer Bank</SelectItem>
									</SelectContent>
								</Select>
							) : (
								<p className="font-medium capitalize">{order.paymentMethod}</p>
							)}
						</div>

						<div className="space-y-2">
							<Label className="text-muted-foreground">Status Pesanan</Label>
							{isEditMode ? (
								<Select onValueChange={setStatus} value={status}>
									<SelectTrigger>
										<SelectValue placeholder="Pilih Status" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="pending">Pending</SelectItem>
										<SelectItem value="paid">Lunas</SelectItem>
										<SelectItem value="completed">Selesai</SelectItem>
										<SelectItem value="cancelled">Batal</SelectItem>
									</SelectContent>
								</Select>
							) : (
								<p className="font-medium capitalize">
									{statusLabels[order.status] || order.status}
								</p>
							)}
						</div>
					</div>

					{/* Items List */}
					<div>
						<h4 className="mb-3 font-semibold text-sm">Daftar Item</h4>
						<div className="space-y-3">
							{order.items.map((item, idx) => (
								<div
									className="flex justify-between text-sm"
									key={`${item.productId}-${idx}`}
								>
									<div className="flex gap-2">
										<span className="font-medium">{item.quantity}x</span>
										<div>
											<p className="font-medium">{item.productName}</p>
											{item.variant && (
												<p className="mt-0.5 text-muted-foreground text-xs">
													{item.variant}
												</p>
											)}
										</div>
									</div>
									<span className="font-medium">
										{formatCurrency(item.price * item.quantity)}
									</span>
								</div>
							))}
						</div>
					</div>
				</div>
			</ScrollArea>

			<div className="shrink-0 space-y-4 border-t bg-card p-4">
				<div className="flex items-center justify-between">
					<span className="font-semibold text-base">Total Keseluruhan</span>
					<span className="font-bold text-primary text-xl">
						{formatCurrency(order.totalAmount)}
					</span>
				</div>
				<Button
					className="w-full gap-2"
					onClick={() => {
						// Optional receipt printing integration can be added here later
					}}
					variant="outline"
				>
					<Printer className="h-4 w-4" />
					Cetak Ulang Struk
				</Button>
			</div>
		</>
	);
}
