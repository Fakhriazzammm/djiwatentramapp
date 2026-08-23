import type { Doc, Id } from "@/types/backend-compat";
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
import { Skeleton } from "@/components/ui/skeleton";
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
import { useHybridOrders, useHybridShiftStatus, useHybridSiteSettings } from "@/hooks/use-hybrid-pos-data";
import {
	useHybridDeleteOrder,
	useHybridUpdateOrder,
} from "@/hooks/use-hybrid-write-actions";
import { bluetoothPrinter, type OrderItem, type ReceiptPrintMode } from "@/lib/bluetooth-printer";
import { buildReceiptMetaFromOrder } from "@/lib/receipt-data";

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

export function TransactionHistorySidebar({ trigger }: { trigger?: React.ReactElement }) {
	const [isOpen, setIsOpen] = useState(false);
	const [activeFilter, setActiveFilter] = useState<FilterType>("today");
	const [selectedOrder, setSelectedOrder] = useState<Doc<"orders"> | null>(
		null
	);
	const [isEditMode, setIsEditMode] = useState(false);
	const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);

	const orders = useHybridOrders();
	const siteSettings = useHybridSiteSettings();
	const updateOrder = useHybridUpdateOrder();
	const deleteOrder = useHybridDeleteOrder();

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

	const shiftStatus = useHybridShiftStatus();

	const handlePrintOrder = async (order: Doc<"orders">, mode?: ReceiptPrintMode) => {
		if (!siteSettings) {
			toast.error("Data toko belum siap. Coba lagi sebentar.", { id: "printing" });
			return;
		}

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

			toast.loading(
				mode === "open_bill"
					? "Mencetak open bill..."
					: mode === "kitchen"
						? "Mencetak tiket kitchen..."
						: "Mencetak struk...",
				{ id: "printing" }
			);
			const items = order.items.map((i: (typeof order.items)[0]) => ({
				productId: i.productId,
				name: i.productName,
				variant: i.variant,
				price: i.price,
				originalPrice: i.originalPrice,
				quantity: i.quantity,
			}));
			const subtotal = items.reduce(
				(sum: number, item: OrderItem) => sum + (item.originalPrice ?? item.price) * item.quantity,
				0
			);
			const receiptMode: ReceiptPrintMode =
				mode ?? (order.status === "pending" ? "open_bill" : "paid");
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
						allDiscounts: null,
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
			toast.success(
				receiptMode === "kitchen"
					? "Tiket kitchen sedang dicetak"
					: receiptMode === "open_bill"
						? "Open bill sedang dicetak"
						: "Struk sedang dicetak",
				{ id: "printing" }
			);
		} catch (error) {
			console.error("Print failed:", error);
			const message = error instanceof Error ? error.message : "Gagal mencetak";
			toast.error(
				`Gagal mencetak: ${message}. ${!bluetoothPrinter.isConnected() ? 'Pastikan printer Bluetooth sudah terhubung — klik "Hubungkan Printer".' : ""}`,
				{ id: "printing" }
			);
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
				<SheetTrigger
					render={
						trigger || (
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
						)
					}
				/>
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
							onPrint={(mode) => handlePrintOrder(selectedOrder, mode)}
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
									<div className="space-y-2 p-3">
										{Array.from({ length: 6 }).map((_, i: number) => (
											<div key={i} className="rounded-lg border bg-card p-3 space-y-3">
												<div className="flex justify-between">
													<Skeleton className="h-4 w-16" />
													<Skeleton className="h-4 w-20" />
												</div>
												<div className="space-y-1">
													<Skeleton className="h-3 w-full" />
													<Skeleton className="h-3 w-2/3" />
												</div>
												<div className="flex justify-between border-t pt-2">
													<Skeleton className="h-3 w-12" />
													<Skeleton className="h-4 w-20" />
												</div>
											</div>
										))}
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
		pending: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
		paid: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
		completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
		cancelled: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
	};

	const statusLabels: Record<string, string> = {
		pending: "Open Bill",
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
				{order.customerDescription ? <p className="rounded-md bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-800">👤 Ciri: {order.customerDescription}</p> : null}
				{order.items.slice(0, 3).map((item: (typeof order.items)[0], idx: number) => (
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
	onPrint,
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
	onPrint: (mode: ReceiptPrintMode) => void;
}) {
	const [customerName, setCustomerName] = useState(order.customerName || "");
	const [paymentMethod, setPaymentMethod] = useState(order.paymentMethod);
	const [status, setStatus] = useState(order.status);

	const statusColors: Record<string, string> = {
		pending: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
		paid: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
		completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
		cancelled: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
	};

	const statusLabels: Record<string, string> = {
		pending: "Open Bill",
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
								<Select onValueChange={(v) => v && setPaymentMethod(v)} value={paymentMethod}>
									<SelectTrigger>
										<SelectValue placeholder="Pilih Metode" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="cash">Tunai</SelectItem>
										<SelectItem value="qris">QRIS</SelectItem>
										<SelectItem value="transfer">Transfer Bank</SelectItem>
										<SelectItem value="wallet">DJIWA PAY</SelectItem>
									</SelectContent>
								</Select>
							) : (
								<p className="font-medium capitalize">{order.paymentMethod}</p>
							)}
						</div>

						<div className="space-y-2">
							<Label className="text-muted-foreground">Status Pesanan</Label>
							{isEditMode ? (
								<Select onValueChange={(v) => v && setStatus(v as any)} value={status}>
									<SelectTrigger>
										<SelectValue placeholder="Pilih Status" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="pending">Open Bill</SelectItem>
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
							{order.items.map((item: (typeof order.items)[0], idx: number) => (
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
				variant="outline"
				onClick={() => onPrint(order.status === "pending" ? "open_bill" : "paid")}
			>
				<Printer className="h-4 w-4" />
				Cetak Ulang Struk
			</Button>
			</div>
		</>
	);
}




