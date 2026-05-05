import type { Doc, Id } from "@/types/backend-compat";
import {
	AlertCircle,
	Banknote,
	BarChart3,
	Bot,
	ClipboardList,
	Clock,
	CreditCard,
	Eye,
	EyeOff,
	Loader2,
	type LucideIcon,
	Menu,
	Minus,
	Package,
	Pencil,
	Plus,
	Printer,
	Search,
	Save,
	Settings2,
	ShoppingCart,
	Sparkles,
	SquarePlay,
	SquarePower,
	Trash2,
	TrendingDown,
	TrendingUp,
	Wallet,
	X,
	Copy,
	RefreshCw,
	ChefHat,
	CupSoda,
	FileText,
	Receipt
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { YumiAIChat } from "@/components/pos/yumi-ai-chat";
import {
	bluetoothPrinter,
	type OrderItem,
	type ReceiptPrintMode,
} from "@/lib/bluetooth-printer";
import { useCart } from "@/context/cart-context";
import {
	useHybridAllDiscounts,
	useHybridAllProducts,
	useHybridCategories,
	useHybridInventory,
	useHybridLowStockItems,
	useHybridOrders,
	useHybridProducts,
	useHybridShiftStatus,
	useHybridStaffUsers,
	useHybridSiteSettings,
	fetchShiftStatus,
} from "@/hooks/use-hybrid-pos-data";
import {
	useHybridAllTransactions,
	useHybridFinancialSummary,
} from "@/hooks/use-hybrid-finance-analytics-data";
import { useHybridRecipes } from "@/hooks/use-hybrid-inventory-admin-data";
import {
	useHybridAdjustMenuStockWithRecipe,
	useHybridCreateOrder,
	useHybridCreateTransaction,
	useHybridRecordExpenseIntake,
	useHybridDeleteOrder,
	useHybridEndShift,
	useHybridSendShiftReportEmail,
	useHybridStartShift,
	useHybridUpdateOrder,
	useHybridUpdateSiteSettings,
	useHybridSyncMenuStockFromInventory,
} from "@/hooks/use-hybrid-write-actions";
import { cn } from "@/lib/utils";
import { useYumiAuth } from "@/hooks/useYumiAuth";
import {
	buildReceiptMetaFromCart,
	buildReceiptMetaFromOrder,
} from "@/lib/receipt-data";

interface ConfirmConfig {
	isOpen: boolean;
	title: string;
	message: string;
	onConfirm: () => void;
	variant?: "danger" | "warning" | "info";
}

interface TabItem {
	value: string;
	label: string;
	icon: LucideIcon;
	iconColor: string;
}

export function MenuSidebar({ 
	triggerOpen, 
	onOpenChange,
	initialTab = "dashboard",
	hideTabs = false,
	hideTrigger = false
}: { 
	triggerOpen?: boolean; 
	onOpenChange?: (open: boolean) => void;
	initialTab?: string;
	hideTabs?: boolean;
	hideTrigger?: boolean;
}) {
	const TABS: TabItem[] = [
		{
			value: "dashboard",
			label: "Dashboard",
			icon: BarChart3,
			iconColor: "text-primary",
		},
		{ value: "parkir", label: "Simpan Orderan", icon: ShoppingCart, iconColor: "text-orange-500" },
		{ value: "history", label: "Riwayat Order", icon: Clock, iconColor: "text-blue-500" },
		{ value: "kas", label: "Shift & Kas", icon: Wallet, iconColor: "text-primary" },
		{ value: "stok", label: "Stok", icon: Package, iconColor: "text-accent" },
		{
			value: "yumi",
			label: "Yumi AI",
			icon: Bot,
			iconColor: "text-primary",
		},
		{
			value: "settings",
			label: "Pengaturan",
			icon: Settings2,
			iconColor: "text-muted-foreground",
		},
	];

	const [isOpen, setIsOpen] = useState(false);
	const [activeTab, setActiveTab] = useState(initialTab);

	useEffect(() => {
		if (triggerOpen !== undefined) {
			setIsOpen(triggerOpen);
		}
	}, [triggerOpen]);

	useEffect(() => {
		if (initialTab && isOpen) {
			setActiveTab(initialTab);
		}
	}, [initialTab, isOpen]);

	const handleOpenChange = (open: boolean) => {
		setIsOpen(open);
		if (onOpenChange) {
			onOpenChange(open);
		}
	};
	const [selectedOrder, setSelectedOrder] = useState<Doc<"orders"> | null>(null);
	const [isEditMode, setIsEditMode] = useState(false);
	const [isParkDialogOpen, setIsParkDialogOpen] = useState(false);

	const [confirmConfig, setConfirmConfig] = useState<ConfirmConfig>({
		isOpen: false,
		title: "",
		message: "",
		onConfirm: () => {
			/* no-op */
		},
	});

	const lowStockItems = useHybridLowStockItems();
	const lowStockCount = lowStockItems?.length || 0;

	const updateOrder = useHybridUpdateOrder();
	const deleteOrder = useHybridDeleteOrder();
	const createOrder = useHybridCreateOrder();
	const {
		items,
		finalTotal,
		clearCart,
		appliedVoucher,
		discountAmount,
		promoDiscountAmount,
		voucherDiscountAmount,
		taxAmount,
		serviceChargeAmount,
		customerInfo,
	} = useCart();
	const siteSettings = useHybridSiteSettings();
	const shiftStatus = useHybridShiftStatus();
	const isShiftOpen = shiftStatus?.isOpen ?? false;

	const today = useMemo(() => {
		const d = new Date();
		d.setHours(0, 0, 0, 0);
		return d;
	}, []);

	const todayTransactions = useHybridAllTransactions({
		startDate: today.getTime(),
	});

	const categories = useHybridCategories();

	const handleParkOrder = async (data: { customerName: string; tableNumber: string; notes: string }) => {
		if (!isShiftOpen) {
			toast.error("Buka shift terlebih dahulu di Dashboard");
			return;
		}
		if (items.length === 0) {
			toast.error("Keranjang kosong");
			return;
		}

		try {
			await createOrder({
				items: items.map((i) => ({
					productId: i.productId as Id<"products">,
					productName: i.name,
					variant: i.variant,
					quantity: i.quantity,
					price: i.price,
					originalPrice: i.originalPrice,
				})),
				totalAmount: finalTotal,
				paymentMethod: "cash",
				customerName: data.customerName || customerInfo.name,
				tableNumber: data.tableNumber || customerInfo.tableNumber,
				notes: data.notes || customerInfo.notes,
				orderType: customerInfo.orderType,
				voucherId: appliedVoucher?._id as Id<"discounts"> | undefined,
				discountAmount,
				taxAmount,
				serviceChargeAmount,
				receiptMeta: buildReceiptMetaFromCart({
					items,
					allDiscounts,
					appliedVoucher,
					promoDiscountAmount,
					voucherDiscountAmount,
					taxAmount,
					serviceChargeAmount,
				}),
				isOpenBill: true,
				autoComplete: false,
			});
			
			toast.success("Pesanan disimpan");
			clearCart();
			setIsParkDialogOpen(false);
			setIsOpen(false);
		} catch (error) {
			console.error(error);
			toast.error("Gagal menyimpan pesanan");
		}
	};

	const handleUpdateOrder = async (
		id: Id<"orders">,
		data: { customerName?: string; paymentMethod?: string; status?: any }
	) => {
		try {
			await updateOrder({ id, ...data });
			toast.success("Pesanan berhasil diperbarui");
			setIsEditMode(false);
			if (selectedOrder && selectedOrder._id === id) {
				setSelectedOrder({ ...selectedOrder, ...data });
			}
		} catch (error) {
			console.error(error);
			toast.error("Gagal memperbarui pesanan");
		}
	};

	const { setCart, updateCustomerInfo } = useCart();
	const allDiscounts = useHybridAllDiscounts();

	const handleRestoreOrder = async (order: Doc<"orders">) => {
		try {
			const cartItems = order.items.map((i: any) => ({
				productId: i.productId,
				name: i.productName,
				variant: i.variant,
				quantity: i.quantity,
				price: i.price,
				originalPrice: i.originalPrice,
			}));

			let voucher = null;
			if (order.voucherId && allDiscounts) {
				const found = allDiscounts.find((d: any) => d._id === order.voucherId);
				if (found) {
					voucher = {
						_id: found._id,
						name: found.name,
						type: found.type,
						value: found.value,
						targetType: found.targetType,
						targetIds: found.targetIds,
					};
				}
			}

			setCart(cartItems, voucher);
			updateCustomerInfo({
				name: order.customerName || "",
				tableNumber: order.tableNumber || "",
				orderType: (order.orderType as any) || "dine_in",
				notes: order.notes || "",
			});
			await deleteOrder({ id: order._id });
			toast.success("Pesanan dipulihkan ke keranjang");
			setIsOpen(false);
		} catch (error) {
			console.error(error);
			toast.error("Gagal memulihkan pesanan");
		}
	};

	const handleDeleteOrder = async (id: Id<"orders">) => {
		try {
			await deleteOrder({ id });
			toast.success("Pesanan berhasil dihapus");
			setSelectedOrder(null);
		} catch (error) {
			console.error(error);
			toast.error("Gagal menghapus pesanan");
		}
	};
	
	const handlePrintOrder = async (order: Doc<"orders">, mode?: ReceiptPrintMode) => {
	if (!siteSettings) {
		toast.error("Data toko belum siap. Coba lagi sebentar.", { id: "printing" });
		return;
	}

	try {
		if (!bluetoothPrinter.isConnected()) {
			await bluetoothPrinter.autoReconnectIfNeeded(0);
		}

		toast.loading(
				mode === "open_bill"
					? "Mencetak open bill..."
					: mode === "kitchen"
						? "Mencetak tiket kitchen..."
						: "Mencetak struk...",
				{ id: "printing" }
			);
			const items = order.items.map((i: any) => ({
				productId: i.productId,
				name: i.productName,
				variant: i.variant,
				price: i.price,
				originalPrice: i.originalPrice,
				quantity: i.quantity,
			}));
			const subtotal = items.reduce(
				(sum: number, item: OrderItem) =>
					sum + (item.originalPrice ?? item.price) * item.quantity,
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
		const message =
			error instanceof Error ? error.message : "Gagal mencetak";
		toast.error(`Gagal mencetak: ${message}. ${!bluetoothPrinter.isConnected() ? 'Pastikan printer Bluetooth sudah terhubung — klik "Hubungkan Printer".' : ""}`, { id: "printing" });
		}
	};

	return (
		<>
			<Sheet onOpenChange={handleOpenChange} open={isOpen}>
				{!hideTrigger && (
					<SheetTrigger className="relative shrink-0 flex h-9 w-9 items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
						<Menu className="h-5 w-5" />
						{lowStockCount > 0 && (
							<span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive font-bold text-[9px] text-destructive-foreground">
								{lowStockCount > 9 ? "9+" : lowStockCount}
							</span>
						)}
						<span className="sr-only">Menu Operasional</span>
					</SheetTrigger>
				)}
				<SheetContent
					side="right"
					className="flex flex-col gap-0 p-0 w-full sm:max-w-md overflow-hidden border-l shadow-2xl"
					showCloseButton={false}
				>
					<SheetTitle className="sr-only">Menu Navigasi</SheetTitle>
					<div className="flex flex-1 flex-col overflow-hidden bg-background relative w-full h-full">
						{/* Dynamic Header based on active tab */}
						<div className="flex items-center justify-between border-b border-border bg-card px-4 py-3 shrink-0">
							<div className="flex items-center gap-2">
								{TABS.map(tab => tab.value === activeTab && (
									<div key={tab.value} className="flex items-center gap-2 fade-in animate-in slide-in-from-left-2 duration-300">
										<div className={`flex h-8 w-8 items-center justify-center rounded-lg bg-muted ${tab.iconColor}`}>
											<tab.icon className="h-4 w-4" />
										</div>
										<h2 className="font-bold text-sm uppercase tracking-wider">{tab.label}</h2>
									</div>
								))}
							</div>
							<Button 
								variant="ghost" 
								size="sm" 
								className="h-8 w-8 p-0 rounded-full shrink-0 bg-muted/50 hover:bg-muted" 
								onClick={() => {
									setIsOpen(false);
									onOpenChange?.(false);
								}}
								aria-label="Tutup"
							>
								<X className="h-4 w-4" />
							</Button>
						</div>

						{/* Content Area - Full height */}
						<div className="flex-1 flex flex-col bg-background overflow-hidden relative">
							{activeTab === "dashboard" && (
								<div className="flex-1 overflow-y-auto min-h-0 scrollbar-thin bg-background">
									<div className="p-4 pb-20">
										<DashboardTab
											onClose={() => setIsOpen(false)}
											onNavigate={setActiveTab}
											onSelectOrder={setSelectedOrder}
											onParkOrder={() => setIsParkDialogOpen(true)}
											todayTransactions={todayTransactions}
											categoriesList={categories}
										/>
									</div>
								</div>
							)}
							{activeTab === "parkir" && (
								<div className="flex-1 overflow-y-auto min-h-0 scrollbar-thin bg-background">
									<div className="p-4 pb-20">
										<ParkirTab
											onClose={() => setIsOpen(false)}
											onRestore={handleRestoreOrder}
											onPrint={
												siteSettings?.allowOpenBillPrint !== false
													? handlePrintOrder
													: undefined
											}
										/>
									</div>
								</div>
							)}
							{activeTab === "history" && (
								<div className="flex-1 overflow-y-auto min-h-0 scrollbar-thin bg-background">
									<div className="p-4 pb-20">
										<HistoryTab
											onSelectOrder={setSelectedOrder}
										/>
									</div>
								</div>
							)}
							{activeTab === "kas" && (
								<div className="flex-1 overflow-y-auto min-h-0 bg-background scrollbar-thin">
									<div className="p-4 pb-12">
										<KasTab onClose={() => setIsOpen(false)} />
									</div>
								</div>
							)}
							{activeTab === "stok" && (
								<div className="flex-1 overflow-y-auto min-h-0 scrollbar-thin bg-background">
									<div className="p-4 pb-20">
										<StokTab />
									</div>
								</div>
							)}
							{activeTab === "yumi" && (
								<div className="h-full">
									<YumiAIChat />
								</div>
							)}
							{activeTab === "settings" && (
								<div className="flex-1 overflow-y-auto min-h-0 scrollbar-thin bg-background">
									<div className="p-4 pb-20">
										<SettingsTab onClose={() => setIsOpen(false)} />
									</div>
								</div>
							)}
						</div>
					</div>
				</SheetContent>
			</Sheet>

				<Dialog
					onOpenChange={(open) => {
						if (!open) {
							setSelectedOrder(null);
							setIsEditMode(false);
						}
					}}
					open={!!selectedOrder}
				>
					<DialogContent className="max-w-md p-0 overflow-hidden sm:max-w-[440px]">
						{selectedOrder && (
							<div className="flex flex-col max-h-[90vh]">
								<DialogHeader className="border-b p-4">
									<DialogTitle className="flex items-center gap-2">
										<ClipboardList className="h-5 w-5 text-primary" />
										Detail Pesanan
									</DialogTitle>
								</DialogHeader>
								<div className="flex-1 overflow-y-auto">
									<OrderSimpleDetail
										isEditMode={isEditMode}
										key={selectedOrder._id}
										onDelete={() => {
											setConfirmConfig({
												isOpen: true,
												title: "Hapus Pesanan",
												message: "Apakah Anda yakin ingin menghapus pesanan ini?",
												variant: "danger",
												onConfirm: () => handleDeleteOrder(selectedOrder._id),
											});
										}}
										onEdit={() => setIsEditMode(true)}
										onSave={(data) => handleUpdateOrder(selectedOrder._id, data)}
										onPrint={(mode) => handlePrintOrder(selectedOrder, mode)}
										order={selectedOrder}
									/>
								</div>
							</div>
						)}
					</DialogContent>
				</Dialog>

				<ConfirmationModal
					isOpen={confirmConfig.isOpen}
					message={confirmConfig.message}
					onClose={() => setConfirmConfig({ ...confirmConfig, isOpen: false })}
					onConfirm={confirmConfig.onConfirm}
					title={confirmConfig.title}
					variant={confirmConfig.variant}
				/>

				<ParkOrderDialog
					isOpen={isParkDialogOpen}
					onClose={() => setIsParkDialogOpen(false)}
					onPark={handleParkOrder}
				/>
		</>
	);
}

function ParkOrderDialog({
	isOpen,
	onClose,
	onPark,
}: {
	isOpen: boolean;
	onClose: () => void;
	onPark: (data: {
		customerName: string;
		tableNumber: string;
		notes: string;
	}) => void;
}) {
	const { customerInfo } = useCart();
	const [customerName, setCustomerName] = useState("");
	const [tableNumber, setTableNumber] = useState("");
	const [notes, setNotes] = useState("");

	useEffect(() => {
		if (isOpen) {
			setCustomerName(customerInfo.name);
			setTableNumber(customerInfo.tableNumber);
			setNotes(customerInfo.notes);
		}
	}, [isOpen, customerInfo]);

	return (
		<Dialog onOpenChange={onClose} open={isOpen}>
			<DialogContent className="max-w-sm rounded-2xl p-6">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Clock className="h-5 w-5 text-orange-500" />
						Simpan Orderan (Tunda)
					</DialogTitle>
				</DialogHeader>

				<div className="space-y-4 pt-4">
					<div className="space-y-2">
						<Label className="text-xs uppercase text-muted-foreground">
							Nama Pelanggan (Opsional)
						</Label>
						<Input
							onChange={(e) => setCustomerName(e.target.value)}
							placeholder="e.g. Budi"
							value={customerName}
						/>
					</div>

					<div className="space-y-2">
						<Label className="text-xs uppercase text-muted-foreground">
							Nomor Meja (Opsional)
						</Label>
						<Input
							onChange={(e) => setTableNumber(e.target.value)}
							placeholder="e.g. 05"
							value={tableNumber}
						/>
					</div>

					<div className="space-y-2">
						<Label className="text-xs uppercase text-muted-foreground">
							Catatan Tambahan
						</Label>
						<Textarea
							onChange={(e) => setNotes(e.target.value)}
							placeholder="Catatan untuk pesanan ini..."
							value={notes}
						/>
					</div>

					<div className="grid grid-cols-2 gap-3 pt-2">
						<Button onClick={onClose} variant="outline">
							Batal
						</Button>
						<Button
							className="bg-orange-500 hover:bg-orange-600"
							onClick={() => onPark({ customerName, tableNumber, notes })}
						>
							Simpan Orderan
						</Button>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}

function OrderSimpleDetail({
	order,
	isEditMode,
	onEdit,
	onDelete,
	onSave,
	onPrint,
}: {
	order: Doc<"orders">;
	isEditMode: boolean;
	onEdit: () => void;
	onDelete: () => void;
	onSave: (data: any) => void;
	onPrint?: (mode: ReceiptPrintMode) => void;
}) {
	const [customerName, setCustomerName] = useState(order.customerName || "");
	const [paymentMethod, setPaymentMethod] = useState(order.paymentMethod);
	const [status, setStatus] = useState(order.status);

	const statusLabels: Record<string, string> = {
		pending: "Pending",
		paid: "Lunas",
		completed: "Selesai",
		cancelled: "Batal",
	};

	const formatCurrency = (value: number) =>
		new Intl.NumberFormat("id-ID", {
			style: "currency",
			currency: "IDR",
			maximumFractionDigits: 0,
		}).format(value);

	return (
		<div className="space-y-6 p-4">
			<div className="flex items-start justify-between">
				<div>
					<p className="font-mono text-lg font-bold">#{order.orderNumber}</p>
					<p className="text-xs text-muted-foreground">
						{new Date(order.createdAt).toLocaleString("id-ID")}
					</p>
				</div>
				<div className="flex gap-1">
					{!isEditMode ? (
						<>
							<Button size="icon" variant="ghost" onClick={onEdit} className="h-8 w-8">
								<Pencil className="h-4 w-4" />
							</Button>
							<Button size="icon" variant="ghost" onClick={onDelete} className="h-8 w-8 text-destructive">
								<Trash2 className="h-4 w-4" />
							</Button>
						</>
					) : (
						<Button
							size="icon"
							variant="ghost"
							onClick={() => onSave({ customerName, paymentMethod, status })}
							className="h-8 w-8 text-primary"
						>
							<Save className="h-4 w-4" />
						</Button>
					)}
					{!isEditMode && onPrint && (
				<DropdownMenu>
					<DropdownMenuTrigger>
						<Button
							size="icon"
							variant="ghost"
							className="h-8 w-8 text-primary hover:bg-primary/10"
							title={order.status === "pending" ? "Cetak Open Bill" : "Cetak Struk"}
						>
							<Printer className="h-4 w-4" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-52">
						<DropdownMenuItem onClick={() => onPrint("paid")} className="gap-2 cursor-pointer">
							<Receipt className="h-4 w-4 text-blue-500" />
							<span>Cetak Struk Lunas</span>
						</DropdownMenuItem>
						<DropdownMenuItem onClick={() => onPrint("open_bill")} className="gap-2 cursor-pointer">
							<FileText className="h-4 w-4 text-amber-500" />
							<span>Cetak Open Bill</span>
						</DropdownMenuItem>
						<DropdownMenuItem onClick={() => onPrint("kitchen")} className="gap-2 cursor-pointer">
							<ChefHat className="h-4 w-4 text-green-500" />
							<span>Cetak Tiket Kitchen</span>
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			)}
				</div>
			</div>

			<div className="space-y-4 rounded-xl border bg-muted/20 p-4">
				<div className="space-y-1.5">
					<Label className="text-[10px] uppercase text-muted-foreground">Pelanggan</Label>
					{isEditMode ? (
						<Input
							value={customerName}
							onChange={(e) => setCustomerName(e.target.value)}
							className="h-9"
						/>
					) : (
						<p className="font-medium">{order.customerName || "-"}</p>
					)}
				</div>

				<div className="space-y-1.5">
					<Label className="text-[10px] uppercase text-muted-foreground">Metode</Label>
					{isEditMode ? (
						<Select value={paymentMethod} onValueChange={(v) => v && setPaymentMethod(v)}>
							<SelectTrigger className="h-9">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="cash">Tunai</SelectItem>
								<SelectItem value="qris">QRIS</SelectItem>
								<SelectItem value="transfer">Transfer</SelectItem>
							</SelectContent>
						</Select>
					) : (
						<p className="font-medium capitalize">{order.paymentMethod}</p>
					)}
				</div>

				<div className="space-y-1.5">
					<Label className="text-[10px] uppercase text-muted-foreground">Status</Label>
					{isEditMode ? (
						<Select value={status} onValueChange={(v) => v && setStatus(v as any)}>
							<SelectTrigger className="h-9">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="pending">Pending</SelectItem>
								<SelectItem value="paid">Lunas</SelectItem>
								<SelectItem value="completed">Selesai</SelectItem>
								<SelectItem value="cancelled">Batal</SelectItem>
							</SelectContent>
						</Select>
					) : (
						<p className="font-medium">{statusLabels[order.status] || order.status}</p>
					)}
				</div>
			</div>

			<div className="space-y-3">
				<h4 className="text-xs font-bold uppercase text-muted-foreground">Daftar Item</h4>
				<div className="space-y-2">
					{order.items.map((item: { quantity: number; productName: string; price: number }, idx: number) => (
						<div key={idx} className="flex justify-between text-sm">
							<div className="flex gap-2">
								<span className="font-bold">{item.quantity}x</span>
								<span>{item.productName}</span>
							</div>
							<span className="font-medium">{formatCurrency(item.price * item.quantity)}</span>
						</div>
					))}
				</div>
				<div className="mt-4 flex justify-between border-t pt-3 font-bold">
					<span>Total</span>
					<span className="text-primary">{formatCurrency(order.totalAmount)}</span>
				</div>
			</div>
		</div>
	);
}

function DashboardTab({
	onClose,
	onNavigate,
	onSelectOrder,
	onParkOrder,
	todayTransactions,
	categoriesList,
}: {
	onClose: () => void;
	onNavigate: (tab: string) => void;
	onSelectOrder: (order: Doc<"orders">) => void;
	onParkOrder: () => void;
	todayTransactions: any;
	categoriesList: any;
}) {
	const orders = useHybridOrders();
	const lowStockItems = useHybridLowStockItems();
	const products = useHybridProducts();

	const today = new Date();
	today.setHours(0, 0, 0, 0);

	const financialSummary = useHybridFinancialSummary({
		startDate: today.getTime(),
	});

	const shiftStatus = useHybridShiftStatus();
	const isShiftOpen = shiftStatus?.isOpen ?? false;
	const siteSettings = useHybridSiteSettings();

	const income = financialSummary?.totalIncome || 0;
	const expense = financialSummary?.totalExpense || 0;
	const balance = financialSummary?.netBalance || 0;

	const todayOrders =
		orders?.filter((o: Doc<"orders">) => o.createdAt >= today.getTime()) || [];
	const totalSales = todayOrders
		.filter(
			(o: Doc<"orders">) => o.status === "paid" || o.status === "completed"
		)
		.reduce((acc: number, o: Doc<"orders">) => acc + o.totalAmount, 0);

	const recentOrders = orders?.slice(0, 5) || [];

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

	const todayLabel = new Date().toLocaleDateString("id-ID", {
		weekday: "long",
		day: "numeric",
		month: "short",
	});

	// Minute-tick for shift close reminder
	const [reminderTick, setReminderTick] = useState(() => new Date());
	const [shiftCloseReminderShown, setShiftCloseReminderShown] = useState(false);
	useEffect(() => {
		const timer = setInterval(() => setReminderTick(new Date()), 60_000);
		return () => clearInterval(timer);
	}, []);

	// Show popup reminder N minutes before scheduled shift close
	useEffect(() => {
		if (!isShiftOpen || !siteSettings?.shiftSettings?.shiftSchedules) return;
		const reminderMinutes: number = siteSettings.shiftSettings.reminderMinutesBeforeClose ?? 15;
		const shiftName = shiftStatus?.shiftInfo?.shiftName;
		const schedule = siteSettings.shiftSettings.shiftSchedules.find(
			(s: any) => s.name === shiftName
		);
		if (!schedule?.closeTime) return;
		const [closeH, closeM] = (schedule.closeTime as string).split(":").map(Number);
		const now = reminderTick;
		const closeMinutes = closeH * 60 + closeM;
		const currentMinutes = now.getHours() * 60 + now.getMinutes();
		const remaining = closeMinutes - currentMinutes;
		if (remaining > 0 && remaining <= reminderMinutes && !shiftCloseReminderShown) {
			setShiftCloseReminderShown(true);
			toast.warning(
				`⏰ Shift akan berakhir dalam ${remaining} menit. Segera tutup shift!`,
				{ duration: 15_000 }
			);
		}
		if (remaining > reminderMinutes) setShiftCloseReminderShown(false);
	}, [reminderTick, isShiftOpen, siteSettings, shiftStatus, shiftCloseReminderShown]);

	// Shared daily report text (used by card display, Salin, and Kirim ke Telegram)
	const dailyReportText = useMemo(() => {
		const dateStr = new Date().toLocaleDateString("id-ID", {
			day: "2-digit", month: "2-digit", year: "numeric",
		});
		const completedOrders = todayOrders.filter(
			(o: Doc<"orders">) => o.status === "completed" || o.status === "paid"
		);
		const totalCash = completedOrders
			.filter((o: Doc<"orders">) => o.paymentMethod === "cash" || o.paymentMethod === "tunai")
			.reduce((acc: number, o: Doc<"orders">) => acc + o.totalAmount, 0);
		const totalQris = completedOrders
			.filter((o: Doc<"orders">) => o.paymentMethod === "qris" || o.paymentMethod === "transfer")
			.reduce((acc: number, o: Doc<"orders">) => acc + o.totalAmount, 0);
		const totalOther = completedOrders
			.filter((o: Doc<"orders">) => o.paymentMethod !== "cash" && o.paymentMethod !== "tunai" && o.paymentMethod !== "qris" && o.paymentMethod !== "transfer")
			.reduce((acc: number, o: Doc<"orders">) => acc + o.totalAmount, 0);
		const totalItems = completedOrders.reduce(
			(acc: number, o: Doc<"orders">) => acc + o.items.reduce((s: number, i: any) => s + i.quantity, 0),
			0
		);
		const totalDiscountAmount = completedOrders.reduce(
			(acc: number, o: Doc<"orders">) => acc + (o.discountAmount || 0),
			0
		);
		const totalRevenue = totalCash + totalQris + totalOther;
		const totalGrossRevenue = totalRevenue + totalDiscountAmount;

		const itemsByCatAndProd: Record<string, Record<string, number>> = {};
		const itemsByName: Record<string, number> = {};
		completedOrders.forEach((o: Doc<"orders">) => {
			o.items.forEach((item: any) => {
				const product = products?.find((p: any) => p._id === item.productId);
				const cat = categoriesList?.find((c: any) => c._id === product?.categoryId)?.name || "Lainnya";
				const name = item.productName || "Unknown";
				if (!itemsByCatAndProd[cat]) itemsByCatAndProd[cat] = {};
				itemsByCatAndProd[cat][name] = (itemsByCatAndProd[cat][name] || 0) + item.quantity;
				itemsByName[name] = (itemsByName[name] || 0) + item.quantity;
			});
		});
		let productsText = "";
		Object.entries(itemsByCatAndProd).forEach(([cat, prods]) => {
			const catTotal = Object.values(prods).reduce((a, b) => a + b, 0);
			productsText += `- ${cat} (${catTotal}):\n`;
			Object.entries(prods).forEach(([name, qty]) => {
				productsText += `  • ${name}: ${qty}\n`;
			});
		});
		if (!productsText) productsText = "-";
		else productsText = productsText.trimEnd();
		const topProductsText = Object.entries(itemsByName)
			.sort((a, b) => b[1] - a[1])
			.slice(0, 3)
			.map(([name, qty]) => `- ${name}: ${qty}`)
			.join("\n") || "-";

		const expensesByCategory: Record<string, number> = {};
		let totalExpenseVal = 0;
		todayTransactions?.filter((t: any) => t.type === "expense" && t.status === "completed").forEach((t: any) => {
			const cat = t.category || "Lainnya";
			expensesByCategory[cat] = (expensesByCategory[cat] || 0) + t.amount;
			totalExpenseVal += t.amount;
		});
		const netBalance = totalRevenue - totalExpenseVal;
		const expensesText = Object.entries(expensesByCategory)
			.map(([cat, amount]) => `${cat}: Rp. ${amount.toLocaleString("id-ID")}`)
			.join("\n") || "Tidak ada pengeluaran hari ini";

		const shopName = siteSettings?.storeName || "YUMI POS";

		let allShiftsText = "";
		if (shiftStatus?.allShifts && shiftStatus.allShifts.length > 0) {
			shiftStatus.allShifts.forEach((shiftObj: any, index: number) => {
				const sStart = shiftObj.startTime;
				const sEnd = shiftObj.endTime || Date.now();
				const sOrders = todayOrders.filter((o: Doc<"orders">) => o.createdAt >= sStart && o.createdAt <= sEnd);
				const sCompleted = sOrders.filter((o: Doc<"orders">) => o.status === "completed" || o.status === "paid");
				const sCash = sCompleted.filter((o: Doc<"orders">) => o.paymentMethod === "cash" || o.paymentMethod === "tunai").reduce((acc: number, o: Doc<"orders">) => acc + o.totalAmount, 0);
				const sQris = sCompleted.filter((o: Doc<"orders">) => o.paymentMethod === "qris" || o.paymentMethod === "transfer").reduce((acc: number, o: Doc<"orders">) => acc + o.totalAmount, 0);
				const sOther = sCompleted.filter((o: Doc<"orders">) => o.paymentMethod !== "cash" && o.paymentMethod !== "tunai" && o.paymentMethod !== "qris" && o.paymentMethod !== "transfer").reduce((acc: number, o: Doc<"orders">) => acc + o.totalAmount, 0);
				const sItems = sCompleted.reduce((acc: number, o: Doc<"orders">) => acc + o.items.reduce((s: number, i: any) => s + i.quantity, 0), 0);
				const sDiscountAmount = sCompleted.reduce((acc: number, o: Doc<"orders">) => acc + (o.discountAmount || 0), 0);
				const sRevenue = sCash + sQris + sOther;
				const sGrossRevenue = sRevenue + sDiscountAmount;

				const sItemsByCatAndProd: Record<string, Record<string, number>> = {};
				const sItemsByName: Record<string, number> = {};
				sCompleted.forEach((o: Doc<"orders">) => {
					o.items.forEach((item: any) => {
						const product = products?.find((p: any) => p._id === item.productId);
						const cat = categoriesList?.find((c: any) => c._id === product?.categoryId)?.name || "Lainnya";
						const name = item.productName || "Unknown";
						if (!sItemsByCatAndProd[cat]) sItemsByCatAndProd[cat] = {};
						sItemsByCatAndProd[cat][name] = (sItemsByCatAndProd[cat][name] || 0) + item.quantity;
						sItemsByName[name] = (sItemsByName[name] || 0) + item.quantity;
					});
				});
				let sProductsText = "";
				Object.entries(sItemsByCatAndProd).forEach(([cat, prods]) => {
					const catTotal = Object.values(prods).reduce((a, b) => a + b, 0);
					sProductsText += `- ${cat} (${catTotal}):\n`;
					Object.entries(prods).forEach(([name, qty]) => {
						sProductsText += `  • ${name}: ${qty}\n`;
					});
				});
				if (!sProductsText) sProductsText = "-";
				else sProductsText = sProductsText.trimEnd();
				const sTopProductsText = Object.entries(sItemsByName).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name, qty]) => `- ${name}: ${qty}`).join("\n") || "-";

				const sTransactions = todayTransactions?.filter((t: any) => t.date >= sStart && t.date <= sEnd) || [];
				let sExpenseVal = 0;
				let sModalVal = 0;
				sTransactions.filter((t: any) => t.status === "completed").forEach((t: any) => {
					if (t.type === "expense") sExpenseVal += t.amount;
					if (t.type === "income" && t.category?.toLowerCase().includes("modal")) sModalVal += t.amount;
				});

				const statusLabel = shiftObj.endTime ? " (SELESAI)" : " (AKTIF)";
				const teamLabel = shiftObj.teamMembers ? `\nTim: ${shiftObj.teamMembers}` : "";
				allShiftsText += `👥 ${(shiftObj.shiftName?.toUpperCase() || `SHIFT ${index + 1}`)}${statusLabel}
Modal Kasir: Rp. ${sModalVal.toLocaleString("id-ID")}
Tunai: Rp. ${sCash.toLocaleString("id-ID")}
Debit/QRIS: Rp. ${sQris.toLocaleString("id-ID")}
Lainnya (Poin/Lain): Rp. ${sOther.toLocaleString("id-ID")}

Total Penjualan Bruto: Rp. ${sGrossRevenue.toLocaleString("id-ID")}
Total Potongan (Diskon): Rp. ${sDiscountAmount.toLocaleString("id-ID")}
Total Revenue Bersih ${shiftObj.shiftName || "Shift"}: Rp. ${sRevenue.toLocaleString("id-ID")}

Produk Terjual: ${sItems}
Rincian Produk:
${sProductsText}

⭐ TOP 3 PRODUK TERLARIS (SHIFT INI):
${sTopProductsText}

Pengeluaran Shift: Rp. ${sExpenseVal.toLocaleString("id-ID")}

Kasir: ${shiftObj.cashierName || "Kasir"}${teamLabel}
---\n`;
			});
		} else {
			allShiftsText = `👥 BELUM ADA SHIFT\n---\n`;
		}

		return `📊 Daily Revenue Report
${shopName} -
📅 Tanggal: ${dateStr}
---
${allShiftsText}
💰 TOTAL REVENUE HARIAN (NET):
Rp. ${totalRevenue.toLocaleString("id-ID")}
📦 TOTAL PRODUK TERJUAL: ${totalItems}
Total Penjualan Bruto (Gross): Rp. ${totalGrossRevenue.toLocaleString("id-ID")}
Total Potongan (Diskon/Voucher): Rp. ${totalDiscountAmount.toLocaleString("id-ID")}
Net Revenue Harian: Rp. ${totalRevenue.toLocaleString("id-ID")}

Rincian Produk Harian:
${productsText}

⭐ TOP 3 PRODUK TERLARIS (HARIAN):
${topProductsText}
---
📝 RINGKASAN PENGELUARAN HARIAN
${expensesText}
Total Pengeluaran: Rp. ${totalExpenseVal.toLocaleString("id-ID")}
---
📝 RINGKASAN HARIAN
${dateStr} :
Grand Total Revenue (Net): Rp. ${totalRevenue.toLocaleString("id-ID")}
Total Penjualan Bruto: Rp. ${totalGrossRevenue.toLocaleString("id-ID")}
Total Potongan: Rp. ${totalDiscountAmount.toLocaleString("id-ID")}
Total Pengeluaran: Rp. ${totalExpenseVal.toLocaleString("id-ID")}
Kas Bersih (Net): Rp. ${netBalance.toLocaleString("id-ID")}
Total Produk Terjual: ${totalItems}`;
	}, [todayOrders, products, categoriesList, shiftStatus, siteSettings, todayTransactions]);

	return (
		<div className="space-y-3">
			<div className="flex items-center justify-between">
				<span className="font-semibold text-foreground text-sm">{todayLabel}</span>
				<span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">Live</span>
			</div>

			{/* Shift Status Card & Report - Moved to top */}
			<div className="space-y-3">
				<Card className="border-border bg-muted/30 overflow-hidden shadow-sm">
					<div className="flex items-center justify-between p-3">
						<div className="flex items-center gap-3">
							<div className={`p-2 rounded-full ${isShiftOpen ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
								<SquarePlay className="h-4 w-4" />
							</div>
							<div>
								<div className="flex items-center gap-2">
									<p className="font-bold text-sm">Status Shift</p>
									{isShiftOpen && shiftStatus?.shiftInfo?.shiftName && (
										<span className="rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-bold text-primary uppercase tracking-tighter">
											{shiftStatus.shiftInfo.shiftName}
										</span>
									)}
								</div>
								<p className="text-[10px] text-muted-foreground uppercase mt-0.5">
									{isShiftOpen 
										? `Aktif • Kasir: ${shiftStatus?.shiftInfo?.cashierName || 'Kasir'}` 
										: "Tutup (Belum Mulai)"}
								</p>
							</div>
						</div>
						<Button 
							size="sm" 
							variant={isShiftOpen ? "outline" : "default"}
							onClick={() => onNavigate("kas")}
							className="text-xs h-8"
						>
							{isShiftOpen ? "Kelola Shift" : "Buka Shift"}
						</Button>
					</div>
				</Card>

				<div className="flex items-center justify-between">
					<h3 className="font-bold text-sm">Ringkasan Hari Ini</h3>
					<div className="flex items-center gap-0.5">
						<Button
							variant="ghost"
							size="sm"
							className="h-7 px-2 text-[10px] text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-all"
							disabled={!dailyReportText || dailyReportText.trim() === ""}
							onClick={() => {
								if (!dailyReportText || dailyReportText.trim() === "") {
									toast.error("Data laporan belum tersedia. Silakan tunggu data dimuat.");
									return;
								}
								navigator.clipboard.writeText(dailyReportText);
								toast.success("Laporan Harian Berhasil Disalin!");
							}}
							title="Salin Laporan"
						>
							<Copy className="h-3.5 w-3.5 mr-1" />
							Salin
						</Button>
						<Button
							variant="ghost"
							size="sm"
							className="h-7 px-2 text-[10px] text-muted-foreground hover:text-blue-600 hover:bg-blue-500/10 rounded-lg transition-all"
							disabled={!dailyReportText || dailyReportText.trim() === ""}
							onClick={async () => {
								if (!dailyReportText || dailyReportText.trim() === "") {
									toast.error("Data laporan belum tersedia. Silakan tunggu data dimuat.");
									return;
								}
								try {
									const { sendTelegramReport } = await import("@/lib/telegram-report");
									const result = await sendTelegramReport(dailyReportText);
									if (result.ok) {
										toast.success("Laporan berhasil dikirim ke Telegram!");
									} else {
										toast.error(result.error || "Gagal mengirim ke Telegram");
									}
								} catch (err: any) {
									toast.error(err?.message || "Gagal mengirim ke Telegram");
								}
							}}
							title="Kirim ke Telegram"
						>
							<svg className="h-3.5 w-3.5 mr-1" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
							Telegram
						</Button>
						<Button 
							variant="ghost" 
							size="icon" 
							className="h-7 w-7 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-full transition-all"
							onClick={() => {
								toast.success("Data sudah real-time!");
							}}
							title="Refresh Data"
						>
							<RefreshCw className="h-3.5 w-3.5" />
						</Button>
					</div>
				</div>
								<Card className="border-border bg-card shadow-sm text-xs font-mono whitespace-pre-wrap p-4 overflow-x-auto">
					{dailyReportText}
				</Card>
			</div>

			<div className="space-y-3">
				<div className="flex items-center justify-between">
					<h3 className="font-bold text-sm">Aksi Cepat</h3>
				</div>
				<div className="grid grid-cols-2 gap-2">
					<Button
						className="h-auto flex-col gap-1.5 py-3 border-border shadow-sm hover:border-primary/50 hover:bg-primary/5 transition-all active:scale-95"
						onClick={() => onNavigate("kas")}
						variant="outline"
					>
						<SquarePlay className="h-4 w-4 text-primary" />
						<span className="text-[10px] font-semibold">Mulai Shift</span>
					</Button>
					<Button
						className="h-auto flex-col gap-1.5 py-3 border-border shadow-sm hover:border-orange-500/50 hover:bg-orange-500/5 transition-all active:scale-95"
						onClick={onParkOrder}
						variant="outline"
					>
						<Clock className="h-4 w-4 text-orange-500" />
						<span className="text-[10px] font-semibold">Tunda Order</span>
					</Button>
					<Button
						className="h-auto flex-col gap-1.5 py-3 border-border shadow-sm hover:border-blue-500/50 hover:bg-blue-500/5 transition-all active:scale-95"
						onClick={() => onNavigate("yumi")}
						variant="outline"
					>
						<Bot className="h-4 w-4 text-blue-500" />
						<span className="text-[10px] font-semibold">Tanya AI</span>
					</Button>
					<Button
						className="h-auto flex-col gap-1.5 py-3 border-border shadow-sm hover:border-accent/50 hover:bg-accent/5 transition-all active:scale-95"
						onClick={() => onNavigate("stok")}
						variant="outline"
					>
						<Package className="h-4 w-4 text-accent" />
						<span className="text-[10px] font-semibold">Update Stok</span>
					</Button>
				</div>
			</div>

			{(lowStockItems?.length || 0) > 0 && (
				<Card className="border-destructive/20 bg-destructive/5">
					<CardContent className="p-3">
						<div className="flex items-center gap-2">
							<AlertCircle className="h-4 w-4 text-destructive" />
							<span className="font-medium text-destructive text-sm">
								{lowStockItems?.length} item stok rendah!
							</span>
						</div>
					</CardContent>
				</Card>
			)}

			<div className="space-y-2">
				<div className="flex items-center justify-between">
					<h3 className="font-bold text-sm">Transaksi Terakhir</h3>
					<button 
						className="text-[10px] text-primary hover:underline font-medium"
						onClick={() => onNavigate("history")}
					>
						Lihat Semua
					</button>
				</div>
				{recentOrders.length === 0 ? (
					<div className="rounded-lg border border-dashed py-6 text-center text-muted-foreground text-sm">
						Belum ada transaksi hari ini
					</div>
				) : (
					<div className="space-y-2">
						{recentOrders.map((order: Doc<"orders">) => (
							<button
								className="flex w-full items-center justify-between rounded-lg border bg-muted/30 p-2 text-left transition-colors hover:bg-muted/50"
								key={order._id}
								onClick={() => onSelectOrder(order)}
								type="button"
							>
								<div className="flex items-center gap-2">
									<div
										className={`h-2 w-2 rounded-full ${
											order.status === "completed" || order.status === "paid"
												? "bg-primary"
												: order.status === "pending"
													? "bg-accent"
													: "bg-destructive"
										}`}
									/>
									<div>
										<p className="font-medium text-xs">
											{order.items?.[0]?.productName || "Pesanan"}
											{order.items?.length > 1 && ` +${order.items.length - 1}`}
										</p>
										<p className="text-[10px] text-muted-foreground">
											{formatTime(order.createdAt)}
										</p>
									</div>
								</div>
								<span className="font-bold text-sm">
									{formatCurrency(order.totalAmount)}
								</span>
							</button>
						))}
					</div>
				)}
			</div>

			<div className="h-6" />
		</div>
	);
}

function ParkirTab({
	onClose,
	onRestore,
	onPrint,
}: {
	onClose: () => void;
	onRestore: (order: Doc<"orders">) => void;
	onPrint?: (order: Doc<"orders">, mode: ReceiptPrintMode) => void;
}) {
	const orders = useHybridOrders({ status: "pending" });

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

	return (
		<div className="space-y-4 pt-2">
			<div className="space-y-2 text-center">
				<h3 className="font-medium text-lg">Simpan Orderan (Antrean)</h3>
				<p className="text-muted-foreground text-sm">
					Daftar pesanan yang ditunda atau belum dibayar.
				</p>
			</div>

			{orders === undefined ? (
				<div className="flex flex-col items-center justify-center py-10 gap-3">
					<Loader2 className="h-6 w-6 animate-spin text-primary" />
					<p className="text-xs text-muted-foreground">Memuat antrean...</p>
				</div>
			) : orders.length === 0 ? (
				<div className="flex flex-col items-center justify-center py-12 border-2 border-dashed rounded-2xl bg-muted/30">
					<ShoppingCart className="h-10 w-10 text-muted-foreground/30 mb-3" />
					<p className="font-medium text-sm text-muted-foreground">Antrean Kosong</p>
					<p className="text-[10px] text-muted-foreground/60">Semua pesanan sudah selesai</p>
				</div>
			) : (
				<div className="grid gap-3">
					{orders.map((order: Doc<"orders">) => (
						<Card
							className="group relative overflow-hidden border-border transition-all hover:border-orange-500/50 hover:shadow-md"
							key={order._id}
						>
							<CardContent className="p-4">
								<div className="flex items-start justify-between mb-3">
									<div className="space-y-1">
										<div className="flex items-center gap-2">
											<span className="font-mono text-sm font-bold text-primary">
												#{order.orderNumber}
											</span>
											<span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-bold text-orange-600 uppercase tracking-tighter">
												DISIMPAN
											</span>
										</div>
										<p className="font-bold text-foreground">
											{order.customerName || "Pelanggan Tanpa Nama"}
										</p>
										{order.tableNumber && (
											<p className="text-[10px] text-muted-foreground">
												MEJA: <span className="font-bold text-foreground">{order.tableNumber}</span>
											</p>
										)}
									</div>
									<div className="text-right">
										<p className="text-[10px] text-muted-foreground mb-1">
											{formatTime(order.createdAt)}
										</p>
										<p className="font-bold text-primary">
											{formatCurrency(order.totalAmount)}
										</p>
									</div>
								</div>

								<div className="flex items-center justify-between border-t border-dashed border-border/50 pt-3">
									<div className="text-[10px] text-muted-foreground">
										{order.items.length} item • {order.items.reduce((acc: number, i: any) => acc + i.quantity, 0)} qty
									</div>
									<div className="flex items-center gap-2">
									{onPrint && (
										<DropdownMenu>
										<DropdownMenuTrigger>
												<Button
													variant="ghost"
													size="icon"
													className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10"
													title="Cetak Struk"
												>
													<Printer className="h-4 w-4" />
												</Button>
											</DropdownMenuTrigger>
											<DropdownMenuContent align="end" className="w-52">
												<DropdownMenuItem onClick={() => onPrint(order, "paid")} className="gap-2 cursor-pointer">
													<Receipt className="h-4 w-4 text-blue-500" />
													<span>Cetak Struk Lunas</span>
												</DropdownMenuItem>
												<DropdownMenuItem onClick={() => onPrint(order, "open_bill")} className="gap-2 cursor-pointer">
													<FileText className="h-4 w-4 text-amber-500" />
													<span>Cetak Open Bill</span>
												</DropdownMenuItem>
												<DropdownMenuItem onClick={() => onPrint(order, "kitchen")} className="gap-2 cursor-pointer">
													<ChefHat className="h-4 w-4 text-green-500" />
													<span>Cetak Tiket Kitchen</span>
												</DropdownMenuItem>
											</DropdownMenuContent>
										</DropdownMenu>
									)}
										<Button
											className="h-8 rounded-lg bg-orange-500 px-3 text-[10px] font-bold uppercase tracking-wider text-white shadow-sm hover:bg-orange-600 active:scale-95"
											onClick={() => onRestore(order)}
											size="sm"
										>
											Pulihkan Order
										</Button>
									</div>
								</div>
							</CardContent>
						</Card>
					))}
				</div>
			)}

			<div className="h-6" />
		</div>
	);
}

function HistoryTab({ onSelectOrder }: { onSelectOrder: (order: Doc<"orders">) => void }) {
	const orders = useHybridOrders();
	const shiftStatus = useHybridShiftStatus();

	const [timeFilter, setTimeFilter] = useState("today");
	const [sortOrder, setSortOrder] = useState("desc");
	const [shiftFilter, setShiftFilter] = useState("active");

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
		});

	const shifts = useMemo(() => shiftStatus?.allShifts ?? [], [shiftStatus?.allShifts]);

	const getShiftForOrder = useCallback(
		(orderCreatedAt: number) =>
			shifts.find((shift: any) => {
				const shiftEnd = shift.endTime ?? Date.now();
				return orderCreatedAt >= shift.startTime && orderCreatedAt <= shiftEnd;
			}),
		[shifts]
	);

	const filteredOrders = useMemo(() => {
		if (!orders) return [];

		let filtered = [...orders];
		const now = new Date();
		const todayStart = new Date(
			now.getFullYear(),
			now.getMonth(),
			now.getDate()
		).getTime();
		const yesterdayStart = todayStart - 86400000;
		const currentDayOfWeek = now.getDay() || 7;
		const thisWeekStart = todayStart - (currentDayOfWeek - 1) * 86400000;
		const lastWeekStart = thisWeekStart - 7 * 86400000;
		const thisMonthStart = new Date(
			now.getFullYear(),
			now.getMonth(),
			1
		).getTime();
		const lastMonthStart = new Date(
			now.getFullYear(),
			now.getMonth() - 1,
			1
		).getTime();

		switch (timeFilter) {
			case "today":
				filtered = filtered.filter((o) => o.createdAt >= todayStart);
				break;
			case "yesterday":
				filtered = filtered.filter(
					(o) => o.createdAt >= yesterdayStart && o.createdAt < todayStart
				);
				break;
			case "this_week":
				filtered = filtered.filter((o) => o.createdAt >= thisWeekStart);
				break;
			case "last_week":
				filtered = filtered.filter(
					(o) => o.createdAt >= lastWeekStart && o.createdAt < thisWeekStart
				);
				break;
			case "this_month":
				filtered = filtered.filter((o) => o.createdAt >= thisMonthStart);
				break;
			case "last_month":
				filtered = filtered.filter(
					(o) => o.createdAt >= lastMonthStart && o.createdAt < thisMonthStart
				);
				break;
		}

		if (shiftFilter === "active") {
			const activeShift = shifts.find((shift: any) => !shift.endTime);
			if (!activeShift) {
				return [];
			}
			const activeShiftEnd = activeShift.endTime ?? Date.now();
			filtered = filtered.filter(
				(o) =>
					o.createdAt >= activeShift.startTime &&
					o.createdAt <= activeShiftEnd
			);
		} else if (shiftFilter !== "all") {
			const selectedShift = shifts.find((shift: any) => shift._id === shiftFilter);
			if (!selectedShift) {
				return [];
			}
			const selectedShiftEnd = selectedShift.endTime ?? Date.now();
			filtered = filtered.filter(
				(o) =>
					o.createdAt >= selectedShift.startTime &&
					o.createdAt <= selectedShiftEnd
			);
		}

		filtered.sort((a, b) => {
			if (sortOrder === "asc") return a.createdAt - b.createdAt;
			return b.createdAt - a.createdAt;
		});

		return filtered;
	}, [orders, shiftFilter, shifts, sortOrder, timeFilter]);

	const activeShiftName =
		shifts.find((shift: any) => !shift.endTime)?.shiftName ??
		shiftStatus?.shiftInfo?.shiftName;

	return (
		<div className="space-y-4 pt-2">
			<div className="space-y-2 text-center">
				<h3 className="font-medium text-lg">Riwayat Order</h3>
				<p className="text-muted-foreground text-sm">
					Riwayat pesanan dibedakan per shift agar tidak tercampur.
				</p>
			</div>

			<div className="rounded-2xl border bg-muted/30 p-3">
				<p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
					Shift
				</p>
				<div className="mt-2">
					<Select value={shiftFilter} onValueChange={(v) => setShiftFilter(v || "active")}>
						<SelectTrigger className="h-8 text-xs bg-background">
							<SelectValue placeholder="Pilih Shift" />
						</SelectTrigger>
						<SelectContent className="z-[9999]">
							<SelectItem value="active">
								{activeShiftName ? `Shift Aktif: ${activeShiftName}` : "Shift Aktif"}
							</SelectItem>
							<SelectItem value="all">Semua Shift</SelectItem>
							{shifts.map((shift: any) => {
								const shiftOptionLabel = `${shift.shiftName || "Tanpa Nama"} - ${shift.cashierName || "Kasir"}`;
								return (
									<SelectItem key={shift._id} value={shift._id}>
										{shiftOptionLabel}
									</SelectItem>
								);
							})}
						</SelectContent>
					</Select>
				</div>
				<p className="mt-2 text-[11px] text-muted-foreground">
					{shiftFilter === "active"
						? activeShiftName
							? `Menampilkan order untuk ${activeShiftName}.`
							: "Belum ada shift aktif."
						: shiftFilter === "all"
							? "Menampilkan order dari semua shift yang tercatat hari ini."
							: "Menampilkan order dari shift yang dipilih."}
				</p>
			</div>

			<div className="flex items-center gap-2">
				<Select value={timeFilter} onValueChange={(v) => setTimeFilter(v || "today")}>
					<SelectTrigger className="h-8 text-xs flex-1">
						<SelectValue placeholder="Pilih Waktu" />
					</SelectTrigger>
					<SelectContent className="z-[9999]">
						<SelectItem value="today">Hari Ini</SelectItem>
						<SelectItem value="yesterday">Kemarin</SelectItem>
						<SelectItem value="this_week">Minggu Ini</SelectItem>
						<SelectItem value="last_week">Minggu Kemarin</SelectItem>
						<SelectItem value="this_month">Bulan Ini</SelectItem>
						<SelectItem value="last_month">Bulan Kemarin</SelectItem>
						<SelectItem value="all">Semua Waktu</SelectItem>
					</SelectContent>
				</Select>
				<Select value={sortOrder} onValueChange={(v) => setSortOrder(v || "desc")}>
					<SelectTrigger className="h-8 text-xs w-[120px]">
						<SelectValue placeholder="Urutkan" />
					</SelectTrigger>
					<SelectContent className="z-[9999]">
						<SelectItem value="desc">Terbaru</SelectItem>
						<SelectItem value="asc">Terlama</SelectItem>
					</SelectContent>
				</Select>
			</div>

			{orders === undefined ? (
				<div className="flex flex-col items-center justify-center gap-3 py-10">
					<Loader2 className="h-6 w-6 animate-spin text-primary" />
					<p className="text-xs text-muted-foreground">Memuat riwayat...</p>
				</div>
			) : filteredOrders.length === 0 ? (
				<div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed bg-muted/30 py-12">
					<ClipboardList className="mb-3 h-10 w-10 text-muted-foreground/30" />
					<p className="font-medium text-sm text-muted-foreground">Belum Ada Transaksi</p>
					<p className="mt-1 text-[11px] text-muted-foreground">
						Coba ganti filter shift atau rentang waktu.
					</p>
				</div>
			) : (
				<div className="space-y-2">
					{filteredOrders.map((order: Doc<"orders">) => {
						const matchedShift = getShiftForOrder(order.createdAt) as any;
						const shiftLabel = matchedShift?.shiftName || "Di luar shift";
						const shiftMeta = matchedShift?.cashierName
							? `Kasir: ${matchedShift.cashierName}`
							: "Kasir tidak tercatat";

						return (
							<button
								key={order._id}
								onClick={() => onSelectOrder(order)}
								className="flex w-full items-center justify-between rounded-xl border bg-card p-3 text-left transition-all hover:border-primary/50 hover:shadow-sm active:scale-[0.98]"
								type="button"
							>
								<div className="flex items-center gap-3">
									<div
										className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
											order.status === "completed" || order.status === "paid"
												? "bg-emerald-100 text-emerald-600"
												: order.status === "pending"
													? "bg-orange-100 text-orange-600"
													: "bg-rose-100 text-rose-600"
										}`}
									>
										<ClipboardList className="h-5 w-5" />
									</div>
									<div>
										<div className="flex items-center gap-2 flex-wrap">
											<p className="font-bold text-sm">#{order.orderNumber}</p>
											<span className={`text-[9px] font-bold uppercase tracking-wider ${
												order.status === "completed" || order.status === "paid"
													? "text-emerald-600"
													: order.status === "pending"
														? "text-orange-600"
														: "text-rose-600"
											}`}>
												{order.status === "paid"
													? "Lunas"
													: order.status === "completed"
														? "Selesai"
														: order.status === "pending"
															? "Pending"
															: "Batal"}
											</span>
											<span className="rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-primary">
												{shiftLabel}
											</span>
										</div>
										<p className="text-[10px] text-muted-foreground">
											{formatDate(order.createdAt)} - {formatTime(order.createdAt)}
										</p>
										<p className="mt-0.5 text-[10px] font-medium text-muted-foreground">
											{shiftMeta}
										</p>
										<p className="mt-0.5 text-xs font-medium">
											{order.customerName || "Tanpa Nama"}
										</p>
									</div>
								</div>
								<div className="text-right">
									<p className="font-bold text-primary">
										{formatCurrency(order.totalAmount)}
									</p>
									<p className="mt-1 text-[10px] text-muted-foreground">
										{order.items?.length || 0} item
									</p>
								</div>
							</button>
						);
					})}
				</div>
			)}
			<div className="h-6" />
		</div>
	);
}

function KasTab({ onClose }: { onClose: () => void }) {
	const [activeForm, setActiveForm] = useState<
		"menu" | "masuk" | "keluar" | "shift"
	>("menu");

	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const todayTransactions = useHybridAllTransactions({
		startDate: today.getTime(),
	});

	const shiftStatus = useHybridShiftStatus();
	const isShiftOpen = shiftStatus?.isOpen ?? false;

	// Detect if the last completed shift was auto-closed
	const lastAutoClosedShift = useMemo(() => {
		if (isShiftOpen) return null;
		const completed = (shiftStatus?.allShifts ?? []).filter(s => s.endTime !== undefined);
		const last = completed.sort((a, b) => (b.endTime ?? 0) - (a.endTime ?? 0))[0];
		return last?.isAutoClosed ? last : null;
	}, [isShiftOpen, shiftStatus?.allShifts]);

	const formatCurrency = (value: number) =>
		new Intl.NumberFormat("id-ID", {
			style: "currency",
			currency: "IDR",
			maximumFractionDigits: 0,
		}).format(value);

	// Calculate SHIFT specific summary (not daily)
	let shiftIncome = 0;
	let shiftExpense = 0;
	let modalAwal = 0;

	if (isShiftOpen && shiftStatus?.latestMulai) {
		const shiftTxs = todayTransactions?.filter((t: any) => t.date >= shiftStatus.latestMulai) || [];
		shiftTxs.filter((t: any) => t.status === 'completed').forEach((t: any) => {
			if (t.type === 'income') {
				shiftIncome += t.amount;
				if (t.category?.toLowerCase().includes('modal')) {
					modalAwal += t.amount;
				}
			} else if (t.type === 'expense') {
				shiftExpense += t.amount;
			}
		});
	}

	const shiftNetBalance = shiftIncome - shiftExpense;
	const shiftTransactionCount = isShiftOpen && shiftStatus?.latestMulai 
		? (todayTransactions?.filter((t: any) => t.date >= shiftStatus.latestMulai && t.status === 'completed').length || 0)
		: 0;

	const ACTIONS = [
		{ id: "masuk" as const, label: "Input Pemasukan", icon: TrendingUp, color: "text-emerald-600", bg: "bg-emerald-50", disabled: !isShiftOpen },
		{ id: "keluar" as const, label: "Input Pengeluaran", icon: TrendingDown, color: "text-rose-600", bg: "bg-rose-50", disabled: !isShiftOpen },
	];

	if (activeForm !== "menu") {
		return (
			<div className="space-y-4">
				<Button 
					variant="ghost" 
					size="sm" 
					onClick={() => setActiveForm("menu")}
					className="h-8 px-2 text-muted-foreground hover:text-foreground"
				>
					<X className="mr-2 h-4 w-4" />
					Kembali
				</Button>
				{activeForm === "masuk" && <IncomeForm onClose={() => setActiveForm("menu")} />}
				{activeForm === "keluar" && <ExpenseForm onClose={() => setActiveForm("menu")} />}
				{activeForm === "shift" && <ShiftManagement onClose={() => setActiveForm("menu")} />}
			</div>
		);
	}

	if (!isShiftOpen) {
		return (
			<div className="flex flex-col items-center justify-center py-12 px-4 text-center space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
				<div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted border-4 border-background shadow-sm">
					<Wallet className="h-10 w-10 text-muted-foreground/50" />
				</div>
				<div className="space-y-2">
					<h3 className="font-black text-xl tracking-tight">Shift Kasir Tertutup</h3>
					<p className="text-muted-foreground text-sm leading-relaxed max-w-[250px] mx-auto">
						Anda harus membuka shift terlebih dahulu untuk mulai mencatat arus kas dan melayani pelanggan.
					</p>
				</div>
				<Button 
					size="lg" 
					className="w-full font-bold shadow-md active:scale-95 transition-all"
					onClick={() => setActiveForm("shift")}
				>
					<SquarePlay className="mr-2 h-5 w-5" />
					Buka Shift Sekarang
				</Button>
			</div>
		);
	}

	return (
		<div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
			{/* Auto-close notification banner */}
			{lastAutoClosedShift && (
				<div className="rounded-xl border border-orange-400/30 bg-orange-50 dark:bg-orange-950/20 p-3 flex gap-2 items-start">
					<AlertCircle className="h-4 w-4 text-orange-500 mt-0.5 shrink-0" />
					<div className="text-xs">
						<p className="font-bold text-orange-700 dark:text-orange-400">
							Shift {lastAutoClosedShift.shiftName} ditutup otomatis
						</p>
						<p className="text-orange-600 dark:text-orange-300 mt-0.5">
							Shift sebelumnya telah melewati jadwal dan ditutup oleh sistem. Buka shift baru untuk memulai kembali.
						</p>
					</div>
				</div>
			)}

			{/* Shift Header Actions */}
			<div className="flex items-center justify-between">
				<div>
					<h3 className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Laci Kasir</h3>
					<p className="text-[10px] font-bold text-emerald-600 mt-0.5">SHIFT AKTIF • {shiftStatus?.shiftInfo?.cashierName || "Kasir"}</p>
				</div>
				<Button
					variant="destructive"
					size="sm"
					className="h-8 text-[10px] font-bold shadow-sm"
					onClick={() => setActiveForm("shift")}
				>
					Akhiri Shift
				</Button>
			</div>

			<Card className="overflow-hidden border-border bg-card shadow-sm">
				<CardContent className="p-4">
					<div className="space-y-4">
						<div className="flex justify-between items-end">
							<div className="space-y-1">
								<p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
									<Wallet className="h-3 w-3" /> Estimasi Uang Laci
								</p>
								<p className="text-2xl font-black tracking-tighter text-primary">
									{formatCurrency(shiftNetBalance)}
								</p>
							</div>
							<div className="text-right">
								<p className="text-[9px] font-bold text-muted-foreground uppercase">Transaksi Shift</p>
								<p className="font-bold text-sm">{shiftTransactionCount}</p>
							</div>
						</div>
						
						<div className="grid grid-cols-2 gap-3 pt-4 border-t border-border/50">
							<div className="space-y-1">
								<p className="text-[9px] font-bold text-emerald-600 uppercase">Total Masuk (+)</p>
								<p className="font-bold text-xs">{formatCurrency(shiftIncome)}</p>
								<p className="text-[9px] text-muted-foreground mt-0.5">(Termasuk modal {formatCurrency(modalAwal)})</p>
							</div>
							<div className="space-y-1 text-right">
								<p className="text-[9px] font-bold text-rose-600 uppercase">Total Keluar (-)</p>
								<p className="font-bold text-xs">{formatCurrency(shiftExpense)}</p>
							</div>
						</div>
					</div>
				</CardContent>
			</Card>

			{/* Quick Actions Grid */}
			<div className="space-y-3">
				<h3 className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Pencatatan Kas Manual</h3>
				<div className="grid grid-cols-1 gap-2.5">
					{ACTIONS.map((action) => {
						const Icon = action.icon;
						return (
							<button
								key={action.id}
								disabled={action.disabled}
								onClick={() => setActiveForm(action.id)}
								className={cn(
									"flex items-center gap-4 p-4 w-full rounded-2xl border text-left transition-all",
									action.disabled 
										? "opacity-50 cursor-not-allowed bg-muted/50 border-border" 
										: "bg-card border-border shadow-sm hover:border-primary/30 hover:shadow-md active:scale-[0.98]"
								)}
								type="button"
							>
								<div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${action.bg} ${action.disabled ? 'grayscale' : ''}`}>
									<Icon className={`h-6 w-6 ${action.color}`} />
								</div>
								<div className="flex-1">
									<p className="font-black text-sm text-foreground uppercase tracking-tight">{action.label}</p>
									<p className="text-[10px] text-muted-foreground font-medium mt-0.5">
										{action.id === 'masuk' ? 'Catat tambahan modal / uang masuk manual' : 
										 'Catat biaya operasional (beli es, galon, dll)'}
									</p>
								</div>
								<Plus className="h-4 w-4 text-muted-foreground/30" />
							</button>
						);
					})}
				</div>
			</div>

			{/* Info Tip */}
			<div className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 border border-amber-100">
				<AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
				<p className="text-[10px] text-amber-800 leading-relaxed font-medium">
					Selalu catat pengeluaran operasional (seperti beli bahan baku mendadak) melalui menu ini agar perhitungan "Estimasi Uang Laci" tetap akurat saat tutup shift.
				</p>
			</div>
		</div>
	);
}

function ShiftManagement({ onClose }: { onClose: () => void }) {
	const { user: currentUser } = useYumiAuth();
	const allUsers = useHybridStaffUsers();

	const staffUsers = useMemo(() =>
		(allUsers || []).filter(
			(u: any) => u.isActive && (u.roleName || "").toLowerCase() !== "admin"
		).sort((a: any, b: any) => a.name.localeCompare(b.name)),
		[allUsers]
	);

	const startShift = useHybridStartShift();
	const endShift = useHybridEndShift();
	const sendShiftReportEmail = useHybridSendShiftReportEmail();

	const [shiftType, setShiftType] = useState<"mulai" | "akhiri">("mulai");

	// Mulai Shift State
	const [amount, setAmount] = useState("");
	const [cashierName, setCashierName] = useState("");
	const [shiftName, setShiftName] = useState("Shift Pagi");
	const [isCustomShift, setIsCustomShift] = useState(false);
	const [teamMembers, setTeamMembers] = useState<string[]>([]);
	
	// Akhiri Shift State
	const [cashInRegister, setCashInRegister] = useState("");
	const [nonCashConfirmed, setNonCashConfirmed] = useState("");
	const [notes, setNotes] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [submitError, setSubmitError] = useState<string | null>(null);
	
	// Cash Breakdown State
	const [breakdown, setBreakdown] = useState<Record<string, number>>({
		bill100000: 0, bill50000: 0, bill20000: 0, bill10000: 0, bill5000: 0, bill2000: 0, bill1000: 0, bill500: 0, bill200: 0, bill100: 0
	});

	const [shiftRefreshTrigger, setShiftRefreshTrigger] = useState(0);
	const shiftStatus = useHybridShiftStatus(shiftRefreshTrigger);
	const siteSettings = useHybridSiteSettings();
	const todayOrders = useHybridOrders();
	const selectedShiftSchedule = useMemo(() => {
		return siteSettings?.shiftSettings?.shiftSchedules?.find(
			(schedule: { name: string; openTime?: string; closeTime?: string }) =>
				schedule.name === shiftName
		);
	}, [siteSettings?.shiftSettings?.shiftSchedules, shiftName]);

	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const todayTransactions = useHybridAllTransactions({
		startDate: today.getTime(),
	});

	// Compatibility: If shift is open, set type to 'akhiri'
	useEffect(() => {
		if (shiftStatus?.isOpen) {
			setShiftType("akhiri");
		} else {
			setShiftType("mulai");
		}
	}, [shiftStatus?.isOpen]);

	// Auto-fill cashier name from current authenticated user
	useEffect(() => {
		if (currentUser?.name && !cashierName) {
			setCashierName(currentUser.name);
		}
	}, [currentUser?.name]);

	// Auto-fill default starting cash and first predefined shift
	useEffect(() => {
		if (shiftType === "mulai" && siteSettings?.shiftSettings) {
			if (siteSettings.shiftSettings.defaultStartingCash && !amount) {
				setAmount(siteSettings.shiftSettings.defaultStartingCash.toString());
			}
			if (
				siteSettings.shiftSettings.predefinedShifts?.length &&
				(!shiftName || shiftName === "Shift Pagi")
			) {
				setShiftName(siteSettings.shiftSettings.predefinedShifts[0]);
			}
		}
	}, [shiftType, siteSettings, amount, shiftName]);

	// Auto-calculated shift summary for UI display
	let shiftIncome = 0;
	let shiftExpense = 0;
	let shiftCash = 0;
	let shiftQris = 0;
	let modalAwal = 0;
	let shiftItems = 0;

	if (shiftStatus?.latestMulai) {
		const shiftTxs = todayTransactions?.filter((t: any) => t.date >= shiftStatus.latestMulai) || [];
		shiftTxs.filter((t: any) => t.status === 'completed').forEach((t: any) => {
			if (t.type === 'income') {
				shiftIncome += t.amount;
				if (t.category?.toLowerCase().includes('modal')) {
					modalAwal += t.amount;
				}
			} else if (t.type === 'expense') {
				shiftExpense += t.amount;
			}
		});

		const shiftOrdersData = todayOrders?.filter((o: Doc<"orders">) => o.createdAt >= shiftStatus.latestMulai) || [];
		shiftCash = shiftOrdersData
			.filter((o: Doc<"orders">) => (o.status === 'completed' || o.status === 'paid') && o.paymentMethod === 'cash')
			.reduce((acc: number, o: Doc<"orders">) => acc + o.totalAmount, 0);
		shiftQris = shiftOrdersData
			.filter((o: Doc<"orders">) => (o.status === 'completed' || o.status === 'paid') && (o.paymentMethod === 'qris' || o.paymentMethod === 'transfer'))
			.reduce((acc: number, o: Doc<"orders">) => acc + o.totalAmount, 0);
		shiftItems = shiftOrdersData
			.filter((o: Doc<"orders">) => o.status === 'completed' || o.status === 'paid')
			.reduce((acc: number, o: Doc<"orders">) => acc + o.items.reduce((sum: number, item: any) => sum + item.quantity, 0), 0);
	}

	const calculateBreakdownTotal = () => {
		return Object.entries(breakdown).reduce((sum, [val, count]) => sum + (Number(val.replace('bill', '')) * (count || 0)), 0);
	};

	// When breakdown changes, update cashInRegister
	useEffect(() => {
		const total = calculateBreakdownTotal();
		if (total > 0) setCashInRegister(total.toString());
	}, [breakdown]);

	const handleAutofill = () => {
		const expectedTotal = (shiftStatus?.ongoingShift?.startingCash || 0) + shiftCash - shiftExpense;
		if (expectedTotal <= 0) return;

		const denominations = [100000, 50000, 20000, 10000, 5000, 2000, 1000, 500, 200, 100];
		const nextBreakdown: Record<string, number> = {};
		let remaining = expectedTotal;

		denominations.forEach((den) => {
			const count = Math.floor(remaining / den);
			nextBreakdown[`bill${den}`] = count;
			remaining %= den;
		});

		setBreakdown(nextBreakdown as any);
		toast.info("Pecahan diisi otomatis sesuai estimasi laci");
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		
		setIsSubmitting(true);
		setSubmitError(null);
		try {
			if (shiftType === "mulai") {
				if (!amount || !cashierName) {
					toast.error("Nama kasir dan modal awal wajib diisi");
					setIsSubmitting(false);
					return;
				}
				await startShift({
					cashierName,
					shiftName,
					teamMembers: teamMembers.join(", "),
					startingCash: Number(amount),
					notes,
				});
				toast.success("Shift berhasil dimulai");
				setShiftRefreshTrigger((c) => c + 1);
			} else {
				if (!shiftStatus?.shiftInfo?.shiftId) {
					// Fallback if it's a legacy shift without ID
					toast.error("Shift ini dimulai dari versi lama. Mohon gunakan tombol legacy.");
					setIsSubmitting(false);
					return;
				}
				const completedShiftStartTime =
					shiftStatus?.ongoingShift?.startTime || Date.now();
				await endShift({
					shiftId: shiftStatus.shiftInfo.shiftId as Id<"shifts">,
					endingCashPhysical: Number(cashInRegister),
					nonCashConfirmed: Number(nonCashConfirmed),
					cashBreakdown: breakdown as any,
					notes,
				});
				if (siteSettings?.shiftSettings?.autoSendShiftReportEmail) {
					try {
						await sendShiftReportEmail({
							startTime: completedShiftStartTime,
						});
						toast.success("Shift berhasil diakhiri dan email laporan terkirim");
					} catch (emailError) {
						console.error("Shift report email failed:", emailError);
						toast.success("Shift berhasil diakhiri");
						const message =
							emailError instanceof Error
								? emailError.message
								: "Laporan shift gagal dikirim email. Cek konfigurasi Resend.";
						toast.warning(message);
					}
				} else {
					toast.success("Shift berhasil diakhiri");
				}
			}
			
			setAmount("");
			setCashInRegister("");
			setNonCashConfirmed("");
			setNotes("");
			setCashierName("");
			setTeamMembers([]);
			onClose();
		} catch (error) {
			console.error(error);
			const message = error instanceof Error ? error.message : "Gagal memproses data shift";
			setSubmitError(message);
			toast.error(message);
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<div className="space-y-2 pt-1">
			<div className="space-y-0.5 text-center">
				<h3 className="font-bold text-sm tracking-tight">Manajemen Shift</h3>
				<p className="text-muted-foreground text-[10px] font-medium">
					Pencatatan arus kas operasional harian
				</p>
			</div>

			<div className="flex gap-1 rounded-lg bg-muted/50 p-1">
				<button
					className={`flex-1 rounded-md px-3 py-2 font-black text-xs transition-all ${
						shiftType === "mulai"
							? "bg-primary text-white shadow-sm"
							: "text-muted-foreground hover:text-foreground opacity-50 grayscale pointer-events-none"
					}`}
					type="button"
				>
					Mulai Shift
				</button>
				<button
					className={`flex-1 rounded-md px-3 py-2 font-black text-xs transition-all ${
						shiftType === "akhiri"
							? "bg-destructive text-white shadow-sm"
							: "text-muted-foreground hover:text-foreground opacity-50 grayscale pointer-events-none"
					}`}
					type="button"
				>
					Akhiri Shift
				</button>
			</div>

			<form className="space-y-3 pb-6" onSubmit={handleSubmit}>
				{shiftType === "mulai" ? (
					<>
						<div className="grid grid-cols-2 gap-3">
							<div className="space-y-1.5">
								<Label className="text-[10px] font-bold uppercase text-muted-foreground">Kasir <span className="text-destructive">*</span></Label>
								<Select
									value={cashierName}
									onValueChange={(value) => setCashierName(value ?? "")}
								>
									<SelectTrigger className="h-9 text-xs">
										<SelectValue placeholder="Pilih Kasir" />
									</SelectTrigger>
									<SelectContent className="z-[9999]">
										{staffUsers.map((u: any) => (
											<SelectItem key={u._id} value={u.name}>
												{u.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							<div className="space-y-1.5">
								<Label className="text-[10px] font-bold uppercase text-muted-foreground">Shift <span className="text-destructive">*</span></Label>
								{siteSettings?.shiftSettings?.predefinedShifts?.length ? (
									<Select 
										value={isCustomShift ? "CUSTOM" : shiftName} 
										onValueChange={(val) => {
											if (val === "CUSTOM") {
												setIsCustomShift(true);
												setShiftName("");
											} else {
												setIsCustomShift(false);
												setShiftName(val || "");
											}
										}}
									>
										<SelectTrigger className="h-9 text-xs">
											<SelectValue placeholder="Pilih Shift" />
										</SelectTrigger>
										<SelectContent className="z-[9999]">
											{siteSettings.shiftSettings.predefinedShifts.map((name: string) => (
												<SelectItem key={name} value={name}>
													{name}
												</SelectItem>
											))}
											<SelectItem value="CUSTOM">-- Lainnya --</SelectItem>
										</SelectContent>
									</Select>
								) : (
									<Input
										placeholder="Nama Shift"
										className="h-9 text-xs"
										value={shiftName}
										onChange={(e) => setShiftName(e.target.value)}
										required
									/>
								)}
								{isCustomShift && (
									<Input
										placeholder="Masukkan nama shift custom"
										className="h-9 text-xs mt-2"
										value={shiftName}
										onChange={(e) => setShiftName(e.target.value)}
										autoFocus
									/>
								)}
								{selectedShiftSchedule?.openTime && selectedShiftSchedule?.closeTime && (
									<p className="text-[10px] font-semibold text-primary mt-1">
										Jadwal shift: {selectedShiftSchedule.openTime} - {selectedShiftSchedule.closeTime}
									</p>
								)}
							</div>
						</div>
						<div className="space-y-1.5">
							<Label className="text-[10px] font-bold uppercase text-muted-foreground">Tim Bertugas (Opsional)</Label>
							<div className="rounded-md border bg-background p-2 space-y-1.5 max-h-32 overflow-y-auto">
								{staffUsers.length === 0 ? (
									<p className="text-[10px] text-muted-foreground italic px-1">Memuat data staff...</p>
								) : (
									staffUsers.map((u: any) => (
										<label
											key={u._id}
											className="flex items-center gap-2 px-1 py-0.5 rounded hover:bg-muted/50 cursor-pointer"
										>
											<Checkbox
												checked={teamMembers.includes(u.name)}
												onCheckedChange={(checked: boolean) => {
													setTeamMembers(prev =>
														checked
															? [...prev, u.name]
															: prev.filter(n => n !== u.name)
													);
												}}
											/>
											<span className="text-xs">{u.name}</span>
										</label>
									))
								)}
							</div>
							{teamMembers.length > 0 && (
								<p className="text-[10px] text-muted-foreground">
									Dipilih: <span className="font-semibold text-foreground">{teamMembers.join(", ")}</span>
								</p>
							)}
						</div>
						<div className="space-y-1.5">
							<Label className="text-[10px] font-bold uppercase text-muted-foreground">Modal Awal (Rp) <span className="text-destructive">*</span></Label>
							<div className="relative">
								<span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">Rp</span>
								<Input
									className="pl-9 h-11 text-lg font-black tracking-tighter"
									min={0}
									onChange={(e) => setAmount(e.target.value)}
									placeholder="0"
									required
									type="number"
									value={amount}
								/>
							</div>
						</div>
					</>
				) : (
					/* AKHIRI SHIFT UI */
					<div className="space-y-3">
						{/* Ringkasan Real-time */}
						<Card className="border-border bg-emerald-50/30 overflow-hidden">
							<CardContent className="p-2.5">
								<div className="flex justify-between items-center mb-1">
									<h4 className="text-[9px] font-black uppercase tracking-widest text-emerald-700 flex items-center gap-1">
										<TrendingUp className="h-2.5 w-2.5" /> Ringkasan Shift Ini
									</h4>
								</div>
								<div className="grid grid-cols-2 gap-2">
									<div className="space-y-0.5">
										<p className="text-[8px] font-bold text-muted-foreground/70 uppercase">Cash (Laci)</p>
										<p className="text-[11px] font-black text-emerald-700">Rp {shiftCash.toLocaleString('id-ID')}</p>
									</div>
									<div className="space-y-0.5 text-right">
										<p className="text-[8px] font-bold text-muted-foreground/70 uppercase">Non-Tunai</p>
										<p className="text-[11px] font-black text-primary">Rp {shiftQris.toLocaleString('id-ID')}</p>
									</div>
								</div>
								<div className="mt-1.5 pt-1.5 border-t border-emerald-100 flex justify-between items-center">
									<p className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest">Saran Setoran:</p>
									<p className="text-[10px] font-black text-foreground">Rp {(((shiftStatus?.ongoingShift?.startingCash ?? 0) + shiftCash - shiftExpense)).toLocaleString('id-ID')}</p>
								</div>
							</CardContent>
						</Card>

						{/* Pecahan Uang Section */}
						<div className="space-y-1.5">
							<div className="flex items-center justify-between">
								<Label className="text-[9px] font-bold uppercase text-muted-foreground">Pecahan Uang Kertas & Logam</Label>
								<button 
									type="button"
									onClick={handleAutofill}
									className="text-[9px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full hover:bg-primary/20 transition-colors"
								>
									Auto-fill
								</button>
							</div>
							<div className="grid grid-cols-2 gap-1">
								{Object.keys(breakdown).map((val) => (
									<div key={val} className="flex items-center gap-1 group">
										<div className="w-10 text-[9px] font-black text-muted-foreground shrink-0">
											{Number(val.replace('bill', '')) >= 1000 ? `${Number(val.replace('bill', ''))/1000}k` : val.replace('bill', '')}
										</div>
										<Input
											type="number"
											min={0}
											placeholder="0"
											className="h-7 text-[10px] font-bold text-center group-hover:border-primary/50"
											value={breakdown[val] || ""}
											onChange={(e) => setBreakdown({...breakdown, [val]: Number(e.target.value)})}
										/>
									</div>
								))}
							</div>
						</div>

						{/* Actual Inputs */}
						<div className="space-y-2 pt-1">
							<div className="space-y-1">
								<Label className="text-[9px] font-bold uppercase text-muted-foreground">Total Uang Fisik (Laci)</Label>
								<div className="relative">
									<span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted-foreground">Rp</span>
									<Input
										className="pl-8 h-9 text-sm font-black tracking-tighter bg-muted/30"
										min={0}
										placeholder="0"
										type="number"
										value={cashInRegister}
										onChange={(e) => setCashInRegister(e.target.value)}
									/>
								</div>
								<p className="text-[8px] text-muted-foreground italic font-medium">* Otomatis dari input pecahan</p>
							</div>

							<div className="space-y-1">
								<Label className="text-[9px] font-bold uppercase text-muted-foreground">Konfirmasi QRIS/EDC (Rp)</Label>
								<div className="relative">
									<span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted-foreground">Rp</span>
									<Input
										className="pl-8 h-9 text-sm font-black tracking-tighter border-primary/20"
										min={0}
										onChange={(e) => setNonCashConfirmed(e.target.value)}
										placeholder="Input sesuai EDC/Dashboard"
										type="number"
										value={nonCashConfirmed}
									/>
								</div>
								<p className="text-[8px] text-muted-foreground font-medium flex items-center gap-0.5 mt-0.5">
									<AlertCircle className="h-2.5 w-2.5 text-amber-500" /> Total dari dashboard provider (Mayar/EDC)
								</p>
							</div>
						</div>
					</div>
				)}

				<div className="space-y-1 pt-1">
					<Label className="text-[9px] font-bold uppercase text-muted-foreground">Catatan / Kendala Shift</Label>
					<Textarea
						placeholder="Contoh: Selisih uang Rp 2.000, barang rusak..."
						className="text-[11px] resize-none min-h-[48px]"
						value={notes}
						onChange={(e) => setNotes(e.target.value)}
					/>
				</div>

				{submitError && (
					<div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-[11px] font-medium text-destructive">
						{submitError}
					</div>
				)}

				<Button
					className={`w-full h-9 font-black uppercase tracking-widest text-[11px] shadow-lg transition-all active:scale-95 ${shiftType === 'mulai' ? 'bg-primary hover:bg-primary/90' : 'bg-destructive hover:bg-destructive/90'}`}
					disabled={isSubmitting}
					type="submit"
				>
					{isSubmitting ? (
						<Loader2 className="mr-2 h-3 w-3 animate-spin text-white" />
					) : (
						shiftType === "mulai" ? <div className="flex items-center gap-1.5"><SquarePlay className="h-3.5 w-3.5" /> Buka Shift</div> : <div className="flex items-center gap-1.5"><SquarePower className="h-3.5 w-3.5" /> Akhiri & Cetak Laporan</div>
					)}
				</Button>
			</form>
			<div className="h-6 shrink-0" />
		</div>
	);
}

function IncomeForm({ onClose }: { onClose: () => void }) {
	const createTransaction = useHybridCreateTransaction();
	const [amount, setAmount] = useState("");
	const [category, setCategory] = useState("Shift Pagi");
	const [description, setDescription] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!amount) {
			return;
		}

		setIsSubmitting(true);
		try {
			await createTransaction({
				type: "income",
				amount: Number(amount),
				category,
				description,
				date: Date.now(),
				status: "completed",
				paymentMethod: "tunai",
			});
			toast.success("Pemasukan berhasil dicatat");
			setAmount("");
			setDescription("");
			onClose();
		} catch (error) {
			console.error(error);
			toast.error("Gagal mencatat pemasukan");
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<div className="space-y-4 pt-2">
			<div className="space-y-2 text-center">
				<h3 className="font-medium text-lg">Input Pemasukan</h3>
				<p className="text-muted-foreground text-sm">
					Catat modal awal, tambahan modal, atau setoran shift.
				</p>
			</div>

			<form className="space-y-4" onSubmit={handleSubmit}>
				<div className="space-y-2">
					<Label>Kategori <span className="text-destructive">*</span></Label>
					<Input
						placeholder="Contoh: Shift Pagi, Modal Awal"
						value={category}
						onChange={(e) => setCategory(e.target.value)}
						required
					/>
				</div>

				<div className="space-y-2">
					<Label>Jumlah (Rp)</Label>
					<Input
						className="text-lg"
						min={0}
						onChange={(e) => setAmount(e.target.value)}
						placeholder="0"
						required
						type="number"
						value={amount}
					/>
				</div>

				<div className="space-y-2">
					<Label>Keterangan (Opsional)</Label>
					<Textarea
						onChange={(e) => setDescription(e.target.value)}
						placeholder="Catatan tambahan..."
						value={description}
					/>
				</div>

				<Button className="w-full" disabled={isSubmitting} type="submit">
					{isSubmitting ? (
						<Loader2 className="mr-2 h-4 w-4 animate-spin" />
					) : null}
					Simpan Pemasukan
				</Button>
			</form>
		</div>
	);
}

function ExpenseForm({ onClose }: { onClose: () => void }) {
	const createTransaction = useHybridCreateTransaction();
	const recordExpenseIntake = useHybridRecordExpenseIntake();
	const syncMenuStock = useHybridSyncMenuStockFromInventory();
	const [amount, setAmount] = useState("");
	const [category, setCategory] = useState("Bahan Baku");
	const [description, setDescription] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [itemName, setItemName] = useState("");
	const [itemQty, setItemQty] = useState("1");
	const [itemUnit, setItemUnit] = useState("");

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!amount) {
			return;
		}

		setIsSubmitting(true);
		try {
			const hasItem = itemName.trim().length > 0;
			const items = hasItem
				? [
						{
							name: itemName.trim(),
							quantity: Number(itemQty) || 1,
							unit: itemUnit.trim() || undefined,
							price: Number(amount) / (Number(itemQty) || 1),
							total: Number(amount),
						},
				  ]
				: [];

			await recordExpenseIntake({
				source: "pos_menu_sidebar",
				syncMode: "auto",
				transaction: {
					type: "expense",
					amount: Number(amount),
					category,
					description: description || itemName,
					date: Date.now(),
					status: "completed",
					paymentMethod: "tunai",
				},
				items: items.length > 0 ? items : undefined,
			});

			// Sync menu stock from inventory after expense intake
			if (hasItem) {
				try {
					await syncMenuStock();
				} catch (syncError) {
					console.error("[ExpenseForm] syncMenuStock failed", syncError);
				}
			}

			toast.success(
				hasItem
					? "Pengeluaran & stok berhasil dicatat"
					: "Pengeluaran berhasil dicatat",
			);
			setAmount("");
			setDescription("");
			setItemName("");
			setItemQty("1");
			setItemUnit("");
			onClose();
		} catch (error) {
			console.error(error);
			toast.error("Gagal mencatat pengeluaran");
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<div className="space-y-4 pt-2">
			<div className="space-y-2 text-center">
				<h3 className="font-medium text-lg">Input Pengeluaran</h3>
				<p className="text-muted-foreground text-sm">
					Catat belanja harian, es batu, galon, dll dari uang kasir.
				</p>
			</div>

			<form className="space-y-4" onSubmit={handleSubmit}>
				<div className="space-y-2">
					<Label>Kategori <span className="text-destructive">*</span></Label>
					<Input
						placeholder="Contoh: Bahan Baku, Operasional"
						value={category}
						onChange={(e) => setCategory(e.target.value)}
						required
					/>
				</div>

				<div className="space-y-2">
					<Label>Jumlah (Rp)</Label>
					<Input
						className="text-lg"
						min={0}
						onChange={(e) => setAmount(e.target.value)}
						placeholder="0"
						required
						type="number"
						value={amount}
					/>
				</div>

				{/* ── Item (untuk restok inventory) ── */}
				<div className="rounded-lg border border-border/50 bg-muted/30 p-3 space-y-3">
					<div className="flex items-center gap-2">
						<Package className="h-3.5 w-3.5 text-muted-foreground" />
						<span className="text-xs font-medium text-muted-foreground">
							Item Belanja (isi untuk auto-restok stok)
						</span>
					</div>
					<div className="grid grid-cols-3 gap-2">
						<div className="col-span-3">
							<Input
								placeholder="Nama barang (contoh: Minyak Goreng)"
								value={itemName}
								onChange={(e) => setItemName(e.target.value)}
							/>
						</div>
						<Input
							placeholder="Qty"
							type="number"
							min={0}
							step="any"
							value={itemQty}
							onChange={(e) => setItemQty(e.target.value)}
						/>
						<Input
							placeholder="Satuan"
							value={itemUnit}
							onChange={(e) => setItemUnit(e.target.value)}
						/>
						<div className="flex items-center text-[10px] text-muted-foreground px-1">
							contoh: liter, kg, pcs
						</div>
					</div>
					{itemName.trim() && (
						<div className="text-[10px] text-emerald-600 font-medium">
							✅ Stok akan otomatis bertambah +{Number(itemQty) || 1}{" "}
							{itemUnit.trim() || "pcs"} "{itemName.trim()}"
						</div>
					)}
				</div>

				<div className="space-y-2">
					<Label>Keterangan</Label>
					<Textarea
						onChange={(e) => setDescription(e.target.value)}
						placeholder="Rincian belanja..."
						required
						value={description}
					/>
				</div>

				<Button
					className="w-full"
					disabled={isSubmitting}
					type="submit"
					variant="destructive"
				>
					{isSubmitting ? (
						<Loader2 className="mr-2 h-4 w-4 animate-spin" />
					) : null}
					Simpan Pengeluaran
				</Button>
			</form>
		</div>
	);
}

function StokTab() {
	const [activeSubTab, setActiveSubTab] = useState<"update" | "beli">("update");

	const lowStockItems = useHybridLowStockItems();
	const lowStockCount = lowStockItems?.length || 0;
	const allProducts = useHybridAllProducts();
	const categories = useHybridCategories();
	const recipes = useHybridRecipes();

	const menuCategoryIds = useMemo(() => {
		if (!categories) return new Set<string>();
		const rootIds = new Set(
			categories
				.filter((category: any) => {
					const name = String(category?.name || "").toLowerCase();
					return name.includes("bar") || name.includes("kitchen");
				})
				.map((category: any) => String(category._id))
		);

		const allMenuIds = new Set<string>(rootIds);
		let changed = true;
		while (changed) {
			changed = false;
			for (const category of categories) {
				const parentId = category.parentId ? String(category.parentId) : null;
				const categoryId = String(category._id);
				if (parentId && allMenuIds.has(parentId) && !allMenuIds.has(categoryId)) {
					allMenuIds.add(categoryId);
					changed = true;
				}
			}
		}

		return allMenuIds;
	}, [categories]);

	const menuProductsWithoutRecipe = useMemo(() => {
		if (!allProducts?.length || menuCategoryIds.size === 0) return [] as any[];
		return allProducts.filter((product: any) => {
			const categoryId = String(product.categoryId || "");
			if (!menuCategoryIds.has(categoryId)) return false;
			return !recipes?.some((recipe: any) => recipe.productId === product._id && !recipe.variantName);
		});
	}, [allProducts, menuCategoryIds, recipes]);

	const subTabs = [
		{ value: "update" as const, label: "Update Stok", icon: Package },
		{
			value: "beli" as const,
			label: "Daftar Beli",
			icon: ShoppingCart,
			badge: lowStockCount,
		},
	];

	return (
		<div className="flex-1 flex flex-col gap-4 p-4 overflow-hidden min-h-0">
			<div className="grid grid-cols-2 gap-2 shrink-0">
				<Button 
					variant="outline" 
					className="h-11 flex-col gap-1 border-primary/20 bg-primary/5 text-primary hover:bg-primary/10 transition-all font-bold"
					onClick={() => window.location.href = "/admin/kitchen"}
				>
					<ChefHat className="h-4 w-4" />
					<span className="text-[10px] uppercase tracking-wider">Monitor Dapur</span>
				</Button>
				<Button 
					variant="outline" 
					className="h-11 flex-col gap-1 border-orange-500/20 bg-orange-500/5 text-orange-600 hover:bg-orange-500/10 transition-all font-bold"
					onClick={() => window.location.href = "/admin/bar"}
				>
					<CupSoda className="h-4 w-4" />
					<span className="text-[10px] uppercase tracking-wider">Monitor Bar</span>
				</Button>
			</div>

			{menuProductsWithoutRecipe.length > 0 && (
				<div className="shrink-0 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900">
					<p className="font-bold text-[11px] uppercase tracking-wide">
						⚠ {menuProductsWithoutRecipe.length} menu belum punya recipe
					</p>
					<p className="mt-1 text-[11px]">
						Lengkapi recipe agar stok menu bisa sinkron dengan bahan baku.
					</p>
					<button
						className="mt-2 inline-flex rounded-md bg-amber-600 px-2 py-1 text-[11px] font-semibold text-white"
						onClick={() => {
							window.location.href = "/admin/recipe";
						}}
					>
						Buka Recipe Admin
					</button>
				</div>
			)}

			<div className="flex shrink-0 gap-1 rounded-lg bg-muted/50 p-1">
				{subTabs.map((tab) => {
					const Icon = tab.icon;
					return (
						<button
							className={`relative flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-2 font-medium text-xs transition-all ${
								activeSubTab === tab.value
									? "bg-background text-foreground font-semibold shadow-sm"
									: "text-muted-foreground hover:text-foreground"
							}`}
							key={tab.value}
							onClick={() => setActiveSubTab(tab.value)}
							type="button"
						>
							<Icon className="h-3.5 w-3.5" />
							<span>{tab.label}</span>
							{tab.badge && tab.badge > 0 && (
								<span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive font-bold text-[9px] text-destructive-foreground">
									{tab.badge > 9 ? "9+" : tab.badge}
								</span>
							)}
						</button>
					);
				})}
			</div>

			<div className="flex-1 overflow-hidden">
				{activeSubTab === "update" && <InventoryTab />}
				{activeSubTab === "beli" && <MarketList />}
			</div>
		</div>
	);
}

function InventoryTab() {
	const allProducts = useHybridAllProducts();
	const categories = useHybridCategories();
	const inventory = useHybridInventory();
	const recipes = useHybridRecipes();
	const adjustMenuStockWithRecipe = useHybridAdjustMenuStockWithRecipe();

	const [searchQuery, setSearchQuery] = useState("");
	const [syncingProductIds, setSyncingProductIds] = useState<Set<string>>(new Set());
	const [stockInputValues, setStockInputValues] = useState<Record<string, string>>({});
	const [hideSoldOut, setHideSoldOut] = useState(false);

	const menuCategoryIds = useMemo(() => {
		if (!categories?.length) return new Set<string>();
		const rootIds = new Set(
			categories
				.filter((category: any) => {
					const name = String(category?.name || "").toLowerCase();
					return (
						name.includes("bar") ||
						name.includes("kitchen") ||
						name.includes("makanan") ||
						name.includes("minuman")
					);
				})
				.map((category: any) => String(category._id))
		);
		const allMenuIds = new Set<string>(rootIds);
		let changed = true;
		while (changed) {
			changed = false;
			for (const category of categories) {
				const parentId = category.parentId ? String(category.parentId) : null;
				const categoryId = String(category._id);
				if (parentId && allMenuIds.has(parentId) && !allMenuIds.has(categoryId)) {
					allMenuIds.add(categoryId);
					changed = true;
				}
			}
		}
		return allMenuIds;
	}, [categories]);

	const menuProducts = useMemo(() => {
		if (!allProducts?.length || menuCategoryIds.size === 0) return [] as any[];
		const query = searchQuery.trim().toLowerCase();
		return allProducts
			.filter((product: any) => menuCategoryIds.has(String(product.categoryId || "")))
			.filter((product: any) =>
				query ? String(product.name || "").toLowerCase().includes(query) : true
			)
			.filter((product: any) =>
				hideSoldOut ? Number(product.quantity ?? 0) > 0 : true
			);
	}, [allProducts, menuCategoryIds, searchQuery, hideSoldOut]);

	const handleStockChangeDirect = useCallback(
		async (product: any, newQuantity: number) => {
			if (newQuantity < 0) {
				toast.error("Stok tidak boleh negatif");
				return;
			}
			const current = Number(product.quantity ?? 0);
			const delta = newQuantity - current;
			if (delta === 0) return;
			const recipe = recipes?.find(
				(recipeItem: any) =>
					String(recipeItem.productId) === String(product._id) && !recipeItem.variantName
			);
			if (!recipe) {
				toast.error(`Menu ${product.name} belum punya recipe. Buat recipe dulu.`);
				return;
			}

			setSyncingProductIds((prev) => {
				const next = new Set(prev);
				next.add(String(product._id));
				return next;
			});

			try {
				await adjustMenuStockWithRecipe({
					productId: String(product._id),
					deltaMenu: delta,
					currentQuantity: current,
					source: "/menu?tab=stok",
					recipe,
					notes: `Sinkron stok menu ${product.name} (${delta > 0 ? "+" : ""}${delta} porsi) dari /menu`,
				});
				toast.success(
					`Stok ${product.name} ${delta > 0 ? "bertambah" : "berkurang"} ${Math.abs(delta)} porsi dan bahan baku tersinkron.`
				);
			} catch (error: any) {
				toast.error(error?.message || "Gagal sinkron stok menu");
			} finally {
				setSyncingProductIds((prev) => {
					const next = new Set(prev);
					next.delete(String(product._id));
					return next;
				});
			}
		},
		[adjustMenuStockWithRecipe, recipes]
	);

	if (!allProducts || !categories || !recipes || !inventory) {
		return (
			<div className="p-4 text-center text-muted-foreground">
				Memuat data...
			</div>
		);
	}

	return (
		<div className="flex-1 flex flex-col gap-3 min-h-0">
			<div className="flex items-center justify-between gap-2 shrink-0">
				<h3 className="font-bold text-sm">Update Stok per Menu</h3>
				<div className="flex items-center gap-2">
					<button
						type="button"
						onClick={() => setHideSoldOut(!hideSoldOut)}
						className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-all ${
							hideSoldOut
								? "bg-primary text-primary-foreground shadow-sm"
								: "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
						}`}
					>
						{hideSoldOut ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
						<span>Sembunyikan Habis</span>
					</button>
					<span className="text-[10px] text-muted-foreground">
						{menuProducts.length} menu
					</span>
				</div>
			</div>

			<div className="relative shrink-0">
				<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
				<Input
					className="h-9 pl-9 text-sm"
					onChange={(event) => setSearchQuery(event.target.value)}
					placeholder="Cari menu..."
					value={searchQuery}
				/>
			</div>

			<div className="flex-1 overflow-y-auto pr-2 min-h-0 scrollbar-thin pb-12">
				{menuProducts.length === 0 ? (
					<div className="rounded-lg border border-dashed py-10 text-center text-muted-foreground">
						<Package className="mx-auto mb-2 h-10 w-10 opacity-20" />
						<p className="font-medium">Belum ada menu yang cocok</p>
						<p className="text-xs">Coba ubah pencarian atau kategori menu</p>
					</div>
				) : (
					<div className="space-y-2">
						{menuProducts.map((product: any) => {
							const recipe = recipes.find(
								(recipeItem: any) =>
									String(recipeItem.productId) === String(product._id) &&
									!recipeItem.variantName
							);
							const recipeMissing = !recipe;
							const isSyncing = syncingProductIds.has(String(product._id));
							const currentQuantity = Number(product.quantity ?? 0);

							let potentialStock: number | null = null;
							if (recipe?.ingredients?.length) {
								const limits = recipe.ingredients
									.map((ingredient: any) => {
										const item = inventory.find(
											(inv: any) => String(inv._id) === String(ingredient.inventoryId)
										);
										if (!item || Number(ingredient.amount ?? 0) <= 0) return 0;
										return Math.floor(Number(item.quantity ?? 0) / Number(ingredient.amount ?? 0));
									})
									.filter((value: number) => Number.isFinite(value));
								potentialStock = limits.length ? Math.min(...limits) : 0;
							}

							return (
								<Card className="border-border bg-card/50 overflow-hidden" key={product._id}>
									<CardContent className="p-3">
										<div className="flex items-start justify-between gap-2">
							<div>
								<p className="font-semibold text-sm text-foreground">
									{product.name}
								</p>
								{(() => {
									const qty = currentQuantity;
									const maxStock = potentialStock !== null ? Math.max(potentialStock, qty) : Math.max(qty * 2, 10);
									const pct = maxStock > 0 ? Math.min(qty / maxStock, 1) : 0;
									const barColor = qty === 0
										? "bg-red-500"
										: pct > 0.5
											? "bg-green-500"
											: pct >= 0.2
												? "bg-yellow-500"
												: "bg-red-500";
									const barBg = qty === 0 ? "bg-red-100" : "bg-muted";
									return (
										<div className="mt-1.5 flex items-center gap-2">
											<div className={`flex-1 h-1.5 rounded-full overflow-hidden ${barBg}`}>
												<div
													className={`h-full rounded-full transition-all ${barColor}`}
													style={{ width: `${qty === 0 ? 100 : pct * 100}%` }}
												/>
											</div>
											{qty === 0 ? (
												<span className="text-[10px] font-bold text-red-600 uppercase leading-none">Habis</span>
											) : (
												<span className="text-[10px] font-medium text-muted-foreground tabular-nums leading-none">{qty}</span>
											)}
										</div>
									);
								})()}
								<div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
													<span className="flex items-center gap-1">
														Ready:{" "}
														<input
															type="number"
															min={0}
															className="w-14 h-8 rounded border bg-background text-center font-bold text-foreground text-[13px] px-1 md:h-5 md:text-[10px] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
															disabled={recipeMissing || isSyncing}
															value={stockInputValues[String(product._id)] ?? String(currentQuantity)}
															onChange={(e) => setStockInputValues(prev => ({...prev, [String(product._id)]: e.target.value}))}
															onBlur={(e) => {
																const newVal = Number(e.target.value);
																if (isNaN(newVal) || newVal < 0 || newVal === currentQuantity) {
																	setStockInputValues(prev => {
																		const next = {...prev};
																		delete next[String(product._id)];
																		return next;
																	});
																	return;
																}
																void handleStockChangeDirect(product, newVal);
															}}
															onKeyDown={(e) => {
																if (e.key === 'Enter') e.currentTarget.blur();
															}}
														/>
													</span>
													{potentialStock !== null && (
														<span>
															Potensi:{" "}
															<span className="font-bold text-foreground">{potentialStock} porsi</span>
														</span>
													)}
												</div>
											</div>


										</div>

										{recipeMissing && (
											<div className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900">
												Menu belum punya recipe.
												<button
													className="ml-1 font-semibold underline"
													onClick={() => {
														window.location.href = "/admin/recipe";
													}}
													type="button"
												>
													Buat recipe dulu
												</button>
											</div>
										)}
									</CardContent>
								</Card>
							);
						})}
					</div>
				)}
			</div>
		</div>
	);
}

function MarketList() {
	const lowStockItems = useHybridLowStockItems();

	if (lowStockItems === undefined) {
		return <div className="p-4 text-center">Memuat data...</div>;
	}

	return (
		<div className="flex-1 flex flex-col gap-3 min-h-0">
			<div className="flex items-center justify-between shrink-0">
				<h3 className="font-bold text-sm">Daftar Belanja</h3>
				<span className="rounded-full bg-destructive/10 px-2 py-0.5 font-medium text-[10px] text-destructive">
					{lowStockItems.length} item perlu dibeli
				</span>
			</div>

			{lowStockItems.length === 0 ? (
				<div className="shrink-0 rounded-lg border border-dashed py-10 text-center text-muted-foreground">
					<Package className="mx-auto mb-2 h-10 w-10 opacity-20" />
					<p className="font-medium">Stok aman semua!</p>
					<p className="text-xs">Tidak ada item yang perlu dibeli</p>
				</div>
			) : (
				<div className="flex-1 overflow-y-auto pr-2 min-h-0 scrollbar-thin pb-12">
					<div className="space-y-2">
						{lowStockItems.map((item: Doc<"inventory">) => (
							<Card
								className="border-destructive/30 bg-destructive/5"
								key={item._id}
							>
								<CardContent className="flex items-start gap-3 p-3">
									<AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
									<div className="flex-1">
										<div className="font-medium text-destructive text-sm">
											{item.ingredientName}
										</div>
										<div className="text-muted-foreground text-xs">
											Sisa:{" "}
											<span className="font-bold">
												{item.displayUnit &&
												item.conversionFactor &&
												item.conversionFactor > 0
													? (item.quantity / item.conversionFactor).toFixed(2)
													: item.quantity}
											</span>{" "}
											{item.displayUnit || item.unit}
											<span className="mx-1 text-muted-foreground/30">|</span>
											Min:{" "}
											<span className="font-bold">
												{item.displayUnit &&
												item.conversionFactor &&
												item.conversionFactor > 0
													? (
															item.lowStockThreshold / item.conversionFactor
														).toFixed(2)
													: item.lowStockThreshold}
											</span>
										</div>
									</div>
								</CardContent>
							</Card>
						))}
					</div>
				</div>
			)}
		</div>
	);
}

function SettingsTab({ onClose }: { onClose: () => void }) {
	const siteSettings = useHybridSiteSettings();
	const updateSiteSettings = useHybridUpdateSiteSettings();

	const [isSaving, setIsSaving] = useState(false);
	const [autoPrint, setAutoPrint] = useState(siteSettings?.autoPrint ?? false);
	const [isConnected, setIsConnected] = useState(bluetoothPrinter.isConnected());
	const [printerName, setPrinterName] = useState<string | null>(bluetoothPrinter.getDeviceName());

	// Sync local state when siteSettings loads
	useEffect(() => {
		if (siteSettings) {
			setAutoPrint(siteSettings.autoPrint ?? false);
		}
	}, [siteSettings]);

	useEffect(() => {
		// Periodically check connection status as it might change outside this component
		const interval = setInterval(() => {
			setIsConnected(bluetoothPrinter.isConnected());
			setPrinterName(bluetoothPrinter.getDeviceName());
		}, 2000);
		return () => clearInterval(interval);
	}, []);

	const handleConnectPrinter = async () => {
		try {
			const name = await bluetoothPrinter.connect();
			setPrinterName(name);
			setIsConnected(true);
			toast.success(`Terhubung ke printer: ${name}`);
		} catch (error) {
			toast.error((error as Error).message || "Gagal menghubungkan printer");
		}
	};

	const handleSave = async (overrides?: Partial<Doc<"siteSettings">>) => {
		setIsSaving(true);
		try {
			await updateSiteSettings({
				autoPrint: overrides?.autoPrint ?? autoPrint,
			});
			if (!overrides) {
				toast.success("Pengaturan POS disimpan!");
			}
		} catch (error) {
			toast.error("Gagal menyimpan pengaturan");
			console.error(error);
		} finally {
			setIsSaving(false);
		}
	};

	const handleToggleAutoPrint = async () => {
		const newVal = !autoPrint;
		setAutoPrint(newVal);
		await handleSave({ autoPrint: newVal });
		toast.success(`Cetak otomatis: ${newVal ? "Aktif" : "Nonaktif"}`);
	};

	return (
		<div className="space-y-4 pt-2">
			<div className="space-y-2 text-center border-b pb-3">
				<h3 className="font-medium text-lg">Pengaturan Kasir</h3>
				<p className="text-muted-foreground text-xs px-4">
					Atur koneksi printer bluetooth dan cetak otomatis langsung dari menu kasir
				</p>
			</div>

			<div className="space-y-4 pb-10">
				{/* Printer Connection Card */}
				<Card className="border-border bg-card shadow-sm">
					<CardContent className="p-4 space-y-4">
						<div className="flex items-center gap-3 border-b border-border/50 pb-3">
							<div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
								<Printer className="h-4 w-4 text-primary" />
							</div>
							<div>
								<h4 className="font-bold text-sm">Printer Bluetooth</h4>
								<p className="text-[10px] text-muted-foreground">Koneksikan ke printer thermal</p>
							</div>
						</div>

						<div className="flex flex-col gap-3">
							<div className="flex items-center justify-between rounded-lg bg-muted/40 p-3">
								<div className="flex items-center gap-2">
									<div
										className={`h-2.5 w-2.5 rounded-full ${isConnected ? "bg-green-500" : "bg-destructive"}`}
									/>
									<span className="text-xs font-medium">
										{isConnected
											? `Terhubung: ${printerName || "Printer"}`
											: "Belum terhubung"}
									</span>
								</div>
								<Button
									size="sm"
									variant={isConnected ? "outline" : "default"}
									onClick={handleConnectPrinter}
									className="h-7 text-[10px]"
								>
									{isConnected ? "Hubungkan Ulang" : "Hubungkan"}
								</Button>
							</div>

							{!isConnected && (
								<p className="text-[10px] text-amber-600 bg-amber-500/10 p-2 rounded border border-amber-500/20">
									<AlertCircle className="inline h-3 w-3 mr-1" />
									Pastikan bluetooth & lokasi aktif.
								</p>
							)}
						</div>
					</CardContent>
				</Card>

				{/* POS Configuration Card */}
				<Card className="border-border bg-card shadow-sm">
					<CardContent className="p-4 space-y-4">
						<div className="flex items-center gap-3 border-b border-border/50 pb-3">
							<div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
								<CreditCard className="h-4 w-4 text-primary" />
							</div>
							<div>
								<h4 className="font-bold text-sm">Alur Kasir</h4>
								<p className="text-[10px] text-muted-foreground">Otomatisasi pos & struk</p>
							</div>
						</div>

						<div className="flex flex-col gap-4">
							<div className="flex items-center justify-between">
								<div className="space-y-0.5 max-w-[70%]">
									<Label className="text-sm font-medium">Cetak Struk Otomatis</Label>
									<p className="text-[10px] text-muted-foreground leading-tight">
										Struk langsung dicetak setelah pembayaran berhasil menggunakan printer aktif
									</p>
								</div>
								<button
									type="button"
									onClick={handleToggleAutoPrint}
									className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ease-in-out ${autoPrint ? 'bg-primary' : 'bg-muted-foreground/30'}`}
								>
									<span
										className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition duration-200 ease-in-out ${autoPrint ? 'translate-x-6' : 'translate-x-1'}`}
									/>
								</button>
							</div>
							
							<div className="flex items-center justify-between">
								<div className="space-y-0.5 max-w-[80%]">
									<Label className="text-sm font-medium">Admin & Pengaturan Lanjut</Label>
									<p className="text-[10px] text-muted-foreground leading-tight">
										Buka pengaturan pajak, nama toko, dan integrasi payments di halaman admin
									</p>
								</div>
								<Button
									size="sm"
									variant="outline"
									onClick={() => {
										onClose();
										window.location.href = "/admin/settings";
									}}
									className="h-7 px-2"
								>
									Buka
								</Button>
							</div>
						</div>
					</CardContent>
				</Card>

				{/* Save Configs Bottom Fixed */}
				<div className="mt-4 pt-2">
					<Button
						className="w-full font-bold shadow-md"
						disabled={isSaving}
						onClick={() => handleSave()}
					>
						{isSaving ? (
							<Loader2 className="mr-2 h-4 w-4 animate-spin" />
						) : (
							<Save className="mr-2 h-4 w-4" />
						)}
						{isSaving ? "Menyimpan..." : "Simpan Pengaturan"}
					</Button>
				</div>
			</div>
		</div>
	);
}









