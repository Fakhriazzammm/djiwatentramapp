import { Djiwa3DIcon, type Djiwa3DIconName } from "@yumipos/web-shared";
import type { Doc, Id } from "@/types/backend-compat";
import {
	AlertCircle,
	AlertTriangle,
	Banknote,
	BarChart3,
	Bot,
	CheckCircle,
	Circle,
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
	CheckCircle2,
	ArrowDownCircle,
	ArrowUpCircle,
	Trash2,
	TrendingDown,
	TrendingUp,
	Wallet,
	X,
	Copy,
	RefreshCw,
	ChefHat,
	ChevronDown,
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
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { YumiAIChat } from "@/components/pos/yumi-ai-chat";
import { AntrianTab } from "@/components/pos/antrian-tab";
import { HomeAnalyticsDashboard } from "@/components/home/home-analytics-dashboard";
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
	useHybridCurrentMonthProgress,
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
import { createClient } from "@/lib/client";
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
	illustration?: Djiwa3DIconName;
}

type OnlineFoodStatus = "pending" | "active" | "problem" | "not_used";
type OnlineFoodPlatform = "gofood" | "grabfood" | "shopeefood";
type OnlineFoodChecklist = Record<OnlineFoodPlatform, {
	status: OnlineFoodStatus;
	note: string;
}>;

const ONLINE_FOOD_PLATFORMS: Array<{ key: OnlineFoodPlatform; label: string }> = [
	{ key: "gofood", label: "GoFood" },
	{ key: "grabfood", label: "GrabFood" },
	{ key: "shopeefood", label: "ShopeeFood" },
];

const ONLINE_FOOD_STATUS_OPTIONS: Array<{ value: OnlineFoodStatus; label: string }> = [
	{ value: "pending", label: "Belum dicek" },
	{ value: "active", label: "Aktif dan siap menerima order" },
	{ value: "problem", label: "Bermasalah" },
	{ value: "not_used", label: "Tidak digunakan" },
];

function createEmptyOnlineFoodChecklist(): OnlineFoodChecklist {
	return {
		gofood: { status: "pending", note: "" },
		grabfood: { status: "pending", note: "" },
		shopeefood: { status: "pending", note: "" },
	};
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
			illustration: "dashboard-overview",
		},
		{ value: "transaksi", label: "Transaksi", icon: Receipt, iconColor: "text-blue-500", illustration: "order-receipt" },
		{ value: "kas", label: "Shift & Kas", icon: Wallet, iconColor: "text-primary", illustration: "shift-closing" },
		{ value: "stok", label: "Stok", icon: Package, iconColor: "text-accent", illustration: "inventory-stock" },
		{ value: "antrian", label: "Antrian", icon: ClipboardList, iconColor: "text-emerald-600", illustration: "order-queue" },
		{
			value: "yumi",
			label: "Djiwa Tentram AI",
			icon: Bot,
			iconColor: "text-primary",
			illustration: "business-ai-assistant",
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
	const [transactionPage, setTransactionPage] = useState<"history" | "open_bill">("history");

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
		data: { customerName?: string; paymentMethod?: string; status?: any; notes?: string; orderType?: string; tableNumber?: string }
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
							<span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive font-bold text-[11px] text-destructive-foreground">
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
										<div className={`flex h-12 w-12 items-center justify-center rounded-xl bg-muted ${tab.iconColor}`}>
											{tab.illustration ? <Djiwa3DIcon name={tab.illustration} size="sm" alt="" className="h-12 w-12" /> : <tab.icon className="h-4 w-4" />}
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
							{activeTab === "transaksi" && (
								<div className="flex-1 overflow-y-auto min-h-0 scrollbar-thin bg-background">
									<div className="p-4 pb-20">
										<div className="grid min-w-0 grid-cols-2 gap-1 border-b border-border/60 pb-1">
											<button
												type="button"
												onClick={() => setTransactionPage("history")}
												className={cn("min-w-0 truncate rounded-xl px-2 py-3 text-center text-[12px] font-bold transition-colors sm:text-sm", transactionPage === "history" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted")}
											>
												Riwayat Pesanan
											</button>
											<button
												type="button"
												onClick={() => setTransactionPage("open_bill")}
												className={cn("min-w-0 truncate rounded-xl px-2 py-3 text-center text-[12px] font-bold transition-colors sm:text-sm", transactionPage === "open_bill" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted")}
											>
												Open Bill
											</button>
										</div>
										<div className="mt-4 min-w-0">
											{transactionPage === "history" ? (
												<HistoryTab onSelectOrder={setSelectedOrder} onPrint={siteSettings?.allowOpenBillPrint !== false ? handlePrintOrder : undefined} />
											) : (
												<ParkirTab
													onClose={() => setIsOpen(false)}
													onRestore={handleRestoreOrder}
												onSelectOrder={setSelectedOrder}
												onPrint={siteSettings?.allowOpenBillPrint !== false ? handlePrintOrder : undefined}
												/>
											)}
										</div>
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
							{activeTab === "antrian" && (
								<div className="flex-1 overflow-y-auto min-h-0 scrollbar-thin bg-background">
									<div className="p-4 pb-20">
										<AntrianTab onClose={() => setIsOpen(false)} />
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
	const [notes, setNotes] = useState(order.notes || "");
	const [orderType, setOrderType] = useState(order.orderType || "dine_in");
	const [tableNumber, setTableNumber] = useState(order.tableNumber || "");

	const statusLabels: Record<string, string> = {
		pending: "Bayar di Kasir",
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

	const totalQty = order.items?.reduce((acc: number, i: any) => acc + (i.quantity || 0), 0) || 0;
	const promoLabels: string[] = (order.receiptMeta?.promotionLabels ?? []).map((label: string) => normalizePromotionLabel(label, order.createdAt));
	const subtotal = order.items?.reduce((sum: number, i: any) => sum + (i.originalPrice ?? i.price) * (i.quantity || 0), 0) ?? 0;
	const totalDiscount = order.discountAmount ?? 0;
	const orderTypeLabel =
		order.orderType === "dine_in" ? "Makan di Tempat"
		: order.orderType === "takeaway" ? "Bungkus"
		: order.orderType === "online" ? "Online"
		: order.orderType ?? "—";
	const payMethodLabel =
		order.paymentMethod === "tunai" ? "Tunai"
		: order.paymentMethod === "qris" ? "QRIS"
		: order.paymentMethod === "transfer" ? "Transfer"
		: order.paymentMethod ?? "—";
	const statusBg =
		order.status === "paid" || order.status === "completed"
			? "bg-emerald-50 text-emerald-600 border-emerald-200"
			: order.status === "pending"
				? "bg-orange-50 text-orange-600 border-orange-200"
				: "bg-rose-50 text-rose-600 border-rose-200";

	return (
		<div className="flex flex-col gap-5 p-4">
			{/* Header Row */}
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<div className="flex items-center gap-2 flex-wrap">
						<p className="font-mono text-base font-bold truncate">#{order.orderNumber}</p>
						<span className={`rounded-lg border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider ${statusBg}`}>
							{statusLabels[order.status] || order.status}
						</span>
					</div>
					<p className="mt-0.5 text-[10px] text-muted-foreground">
						{new Date(order.createdAt).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}
						{" · "}
						{new Date(order.createdAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
					</p>
				</div>
				<div className="flex gap-0.5 shrink-0">
					{!isEditMode ? (
						<>
							{onPrint && (
								<DropdownMenu>
									<DropdownMenuTrigger render={<Button size="icon" variant="ghost" className="h-8 w-8 text-primary hover:bg-primary/10" title="Cetak" />}>
										<Printer className="h-4 w-4" />
									</DropdownMenuTrigger>
									<DropdownMenuContent align="end" className="w-48">
										<DropdownMenuItem onClick={() => onPrint("paid")} className="gap-2 cursor-pointer text-xs">
											<Receipt className="h-3.5 w-3.5 text-blue-500" />
											<span>Cetak Struk Lunas</span>
										</DropdownMenuItem>
										<DropdownMenuItem onClick={() => onPrint("open_bill")} className="gap-2 cursor-pointer text-xs">
											<FileText className="h-3.5 w-3.5 text-amber-500" />
											<span>Cetak Open Bill</span>
										</DropdownMenuItem>
										<DropdownMenuItem onClick={() => onPrint("kitchen")} className="gap-2 cursor-pointer text-xs">
											<ChefHat className="h-3.5 w-3.5 text-green-500" />
											<span>Cetak Tiket Kitchen</span>
										</DropdownMenuItem>
									</DropdownMenuContent>
								</DropdownMenu>
							)}
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
							onClick={() => onSave({ customerName, paymentMethod, status, notes, orderType, tableNumber })}
							className="h-8 w-8 text-primary"
						>
							<Save className="h-4 w-4" />
						</Button>
					)}
				</div>
			</div>

			{/* Detail Grid */}
			<div className="grid grid-cols-2 gap-x-4 gap-y-2.5 rounded-xl border bg-muted/20 p-3.5 text-[11px]">
				<div>
					<span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Pelanggan</span>
					<p className="mt-0.5 font-medium">{order.customerName || "—"}</p>
				</div>
				<div>
					<span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Tipe Order</span>
					<p className="mt-0.5 font-medium">{orderTypeLabel}{order.tableNumber ? ` · Meja ${order.tableNumber}` : ""}</p>
				</div>
				<div>
					<span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Pembayaran</span>
					<p className="mt-0.5 font-medium capitalize">{payMethodLabel}</p>
				</div>
				<div>
					<span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Status</span>
					{isEditMode ? (
						<Select value={status} onValueChange={(v) => v && setStatus(v as any)}>
							<SelectTrigger className="h-7 text-[11px] mt-0.5">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="pending">Bayar di Kasir</SelectItem>
								<SelectItem value="paid">Lunas</SelectItem>
								<SelectItem value="completed">Selesai</SelectItem>
								<SelectItem value="cancelled">Batal</SelectItem>
							</SelectContent>
						</Select>
					) : (
						<p className="mt-0.5 font-medium">{statusLabels[order.status] || order.status}</p>
					)}
				</div>
				{promoLabels.length > 0 && (
					<div className="col-span-2">
						<span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Promo</span>
						<div className="mt-0.5 flex flex-wrap gap-1">
							{promoLabels.map((label: string, idx: number) => (
								<span key={idx} className="rounded bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-600 uppercase tracking-wider leading-none">
									{label}
								</span>
							))}
						</div>
					</div>
				)}
			</div>

			{/* Edit mode fields */}
			{isEditMode && (
				<div className="space-y-3 rounded-xl border bg-muted/20 p-3.5">
					<div className="space-y-1">
						<Label className="text-[11px] uppercase text-muted-foreground">Nama Pelanggan</Label>
						<Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="h-8 text-xs" />
					</div>
					<div className="space-y-1">
						<Label className="text-[11px] uppercase text-muted-foreground">Tipe Order</Label>
						<Select value={orderType} onValueChange={(v) => v && setOrderType(v)}>
							<SelectTrigger className="h-8 text-xs">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="dine_in">Makan di Tempat</SelectItem>
								<SelectItem value="takeaway">Bungkus</SelectItem>
								<SelectItem value="online">Online</SelectItem>
							</SelectContent>
						</Select>
					</div>
					<div className="space-y-1">
						<Label className="text-[11px] uppercase text-muted-foreground">Nomor Meja</Label>
						<Input value={tableNumber} onChange={(e) => setTableNumber(e.target.value)} placeholder="Cth: 7" className="h-8 text-xs" />
					</div>
					<div className="space-y-1">
						<Label className="text-[11px] uppercase text-muted-foreground">Metode Pembayaran</Label>
						<Select value={paymentMethod} onValueChange={(v) => v && setPaymentMethod(v)}>
							<SelectTrigger className="h-8 text-xs">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="tunai">Tunai</SelectItem>
								<SelectItem value="qris">QRIS</SelectItem>
								<SelectItem value="transfer">Transfer</SelectItem>
								<SelectItem value="edc">EDC</SelectItem>
							</SelectContent>
						</Select>
					</div>
					<div className="space-y-1">
						<Label className="text-[11px] uppercase text-muted-foreground">Catatan</Label>
						<Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Catatan pesanan..." className="h-8 text-xs" />
					</div>
				</div>
			)}

			{/* Items List */}
			<div className="space-y-2.5">
				<div className="flex items-center justify-between">
					<h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Daftar Item ({totalQty})</h4>
					<span className="text-[11px] text-muted-foreground">{order.items?.length || 0} jenis</span>
				</div>
				<div className="divide-y divide-border/50 rounded-xl border">
					{order.items.map((item: { quantity: number; productName: string; variant?: string; price: number; originalPrice?: number | null; status?: string | null }, idx: number) => {
						const itemSubtotal = (item.originalPrice ?? item.price) * item.quantity;
						const hasDiscount = item.originalPrice != null && item.originalPrice > item.price;
						return (
							<div key={idx} className="flex items-center justify-between px-3 py-2">
								<div className="min-w-0 flex-1">
									<div className="flex items-center gap-1.5">
										<span className="font-bold text-xs">{item.quantity}x</span>
										<span className="text-xs font-medium truncate">{item.productName}</span>
										{item.variant && <span className="text-[11px] text-muted-foreground truncate">({item.variant})</span>}
									</div>
									{hasDiscount && (
										<div className="mt-0.5 flex items-center gap-1">
											<span className="text-[11px] text-rose-500 line-through">{formatCurrency(item.originalPrice!)}</span>
											<span className="text-[11px] text-emerald-500">{formatCurrency(item.price)}/item</span>
										</div>
									)}
								</div>
								<span className="text-xs font-medium shrink-0 ml-2">{formatCurrency(itemSubtotal)}</span>
							</div>
						);
					})}
				</div>
			</div>

			{/* Totals */}
			<div className="space-y-1 rounded-xl border bg-muted/20 p-3.5 text-[11px]">
				<div className="flex justify-between">
					<span className="text-muted-foreground">Subtotal</span>
					<span>{formatCurrency(subtotal)}</span>
				</div>
				{totalDiscount > 0 && (
					<div className="flex justify-between">
						<span className="text-muted-foreground">Diskon</span>
						<span className="text-rose-500">-{formatCurrency(totalDiscount)}</span>
					</div>
				)}
				{order.serviceChargeAmount != null && order.serviceChargeAmount > 0 && (
					<div className="flex justify-between">
						<span className="text-muted-foreground">Service Charge</span>
						<span>{formatCurrency(order.serviceChargeAmount)}</span>
					</div>
				)}
				{order.taxAmount != null && order.taxAmount > 0 && (
					<div className="flex justify-between">
						<span className="text-muted-foreground">Pajak</span>
						<span>{formatCurrency(order.taxAmount)}</span>
					</div>
				)}
				<div className="flex justify-between border-t border-border/50 pt-1.5 font-bold text-sm">
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
	const allStaffUsers = useHybridStaffUsers();
	const today = new Date();
	today.setHours(0, 0, 0, 0);

	const shiftStatus = useHybridShiftStatus();
	const isShiftOpen = shiftStatus?.isOpen ?? false;
	const siteSettings = useHybridSiteSettings();

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
	// ── Team attendance status ──
	const [teamAttendance, setTeamAttendance] = useState<Record<string, "active" | "checked_out" | "no_show">>({});
	const [teamAttendanceLoading, setTeamAttendanceLoading] = useState(false);
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

	// ── Fetch team attendance status for open shift ──
	useEffect(() => {
		const ongoingShift = shiftStatus?.ongoingShift;
		if (!isShiftOpen || !ongoingShift?.teamMembers || !allStaffUsers?.length) {
			setTeamAttendance({});
			return;
		}
		const fetchAttendance = async () => {
			setTeamAttendanceLoading(true);
			const supabase = createClient();
			const memberNames = (ongoingShift.teamMembers ?? "")
				.split(",")
				.map((n: string) => n.trim())
				.filter(Boolean);
			const memberIds: string[] = [];
			const nameToId: Record<string, string> = {};
			memberNames.forEach((name: string) => {
				const user = allStaffUsers.find(
					(u: any) => u.name?.trim()?.toLowerCase() === name.toLowerCase()
				);
				if (user?._id) {
					memberIds.push(user._id);
					nameToId[name] = user._id;
				}
			});
			if (memberIds.length === 0) { setTeamAttendance({}); setTeamAttendanceLoading(false); return; }
			const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
			const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
			const { data: logs } = await supabase
				.from("pos_attendance_logs")
				.select("userId, type, timestamp")
				.in("userId", memberIds)
				.gte("timestamp", todayStart.getTime())
				.lte("timestamp", todayEnd.getTime())
				.order("timestamp", { ascending: false });
			const status: Record<string, "active" | "checked_out" | "no_show"> = {};
			memberNames.forEach((name: string) => {
				const uid = nameToId[name];
				if (!uid) { status[name] = "no_show"; return; }
				const userLogs = logs?.filter((l: any) => l.userId === uid) ?? [];
				const hasCheckOut = userLogs.some((l: any) => l.type === "check_out");
				const hasCheckIn = userLogs.some((l: any) => l.type === "check_in");
				if (hasCheckOut) status[name] = "checked_out";
				else if (hasCheckIn) status[name] = "active";
				else status[name] = "no_show";
			});
			setTeamAttendance(status);
			setTeamAttendanceLoading(false);
		};
		fetchAttendance();
	}, [isShiftOpen, shiftStatus?.ongoingShift?.teamMembers, allStaffUsers]);

	// ── Compute team status display data ──
	const teamStatusDisplay = useMemo(() => {
		const keys = Object.keys(teamAttendance);
		if (!keys.length) return null;
		const grouped = new Map<string, string[]>();
		const activeNames: string[] = [];
		keys.forEach((name) => {
			const user = allStaffUsers?.find((u: any) => u.name?.trim()?.toLowerCase() === name.toLowerCase());
			const role = user?.roleName?.trim() || "Lainnya";
			if (!grouped.has(role)) grouped.set(role, []);
			grouped.get(role)!.push(name);
			if (teamAttendance[name] === "active") activeNames.push(name);
		});
		const roleOrder = ["Barista", "Kitchen", "Kasir", "Waitress", "Waiters", "Manajer"];
		const sortedRoles = [...grouped.keys()].sort((a, b) => {
			const ai = roleOrder.findIndex(r => r.toLowerCase() === a.toLowerCase());
			const bi = roleOrder.findIndex(r => r.toLowerCase() === b.toLowerCase());
			return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
		});
		return { grouped, sortedRoles, activeCount: activeNames.length };
	}, [teamAttendance, allStaffUsers]);

	// Shared daily report text (used by card display, Salin, and Kirim ke Telegram)
	// Ringkasan Hari Ini — dihapus, fitur pindah ke halaman /laporan

	return (
		<div className="space-y-3">
			<div className="flex items-center justify-between">
				<span className="font-semibold text-foreground text-sm">{todayLabel}</span>
				<span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">Live</span>
			</div>

			{/* Shift Status — Paling atas */}
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
										<span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary uppercase tracking-tighter">
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
					{isShiftOpen && shiftStatus?.ongoingShift?.teamMembers && (
						<div className="border-t border-border/50 px-3 py-2 space-y-1.5">
							<div className="flex items-center justify-between">
								<p className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-widest text-muted-foreground/70"><ClipboardList aria-hidden="true" className="h-3 w-3" /> Tim Shift</p>
								{teamAttendanceLoading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
							</div>
							{!teamAttendanceLoading && teamStatusDisplay && (
								<div className="space-y-1">
									{teamStatusDisplay.sortedRoles.map((role) => (
										<div key={role}>
											<p className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-wider mt-1 first:mt-0">{role}</p>
											{teamStatusDisplay.grouped.get(role)!.map((name) => {
												const s = teamAttendance[name];
												const dotClass = s === "active" ? "bg-emerald-500" : s === "checked_out" ? "bg-rose-500" : "bg-muted-foreground/40";
												const label = s === "active" ? "Aktif" : s === "checked_out" ? "Absen Keluar" : "Belum Absen";
												const bg = s === "active" ? "bg-emerald-50 text-emerald-700" : s === "checked_out" ? "bg-rose-50 text-rose-600" : "bg-muted text-muted-foreground";
												return (
													<div key={name} className="flex items-center justify-between py-0.5">
														<span className="flex items-center gap-1.5 text-[10px] font-medium"><span aria-hidden="true" className={`h-2 w-2 rounded-full ${dotClass}`} /> {name}</span>
														<span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${bg}`}>{label}</span>
													</div>
												);
											})}
										</div>
									))}
									{teamStatusDisplay.activeCount > 0 && (
										<div className="mt-1.5 pt-1.5 border-t border-border/30 flex items-center gap-1">
											<AlertTriangle aria-hidden="true" className="h-3.5 w-3.5 text-amber-600" />
											<span className="text-[11px] font-bold text-amber-700">{teamStatusDisplay.activeCount} orang masih aktif</span>
										</div>
									)}
								</div>
							)}
						</div>
					)}
					</Card>
					</div>

			<HomeAnalyticsDashboard />

			<div className="h-6" />
		</div>
	);
}

function ParkirTab({
	onClose,
	onRestore,
	onSelectOrder,
	onPrint,
}: {
	onClose: () => void;
	onRestore: (order: Doc<"orders">) => void;
	onSelectOrder?: (order: Doc<"orders">) => void;
	onPrint?: (order: Doc<"orders">, mode: ReceiptPrintMode) => void;
}) {
	const orders = useHybridOrders({ status: "pending" });
	const deleteOrder = useHybridDeleteOrder();
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
	const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);

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

	const toggleSelected = (id: string) => {
		setSelectedIds((current) => {
			const next = new Set(current);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	};

	const allSelected = Boolean(orders?.length) && selectedIds.size === orders.length;

	const handleSelectAll = () => {
		if (!orders) return;
		setSelectedIds(allSelected ? new Set() : new Set(orders.map((order: Doc<"orders">) => String(order._id))));
	};

	const handleBulkDelete = async () => {
		const ids = [...selectedIds];
		if (ids.length === 0) return;
		setIsDeleteConfirmOpen(false);
		setIsDeleting(true);
		try {
			for (const id of ids) {
				await deleteOrder({ id });
			}
			setSelectedIds(new Set());
			toast.success(`${ids.length} Open Bill berhasil dihapus`);
		} catch (error) {
			console.error("[open-bill-bulk-delete] failed", error);
			toast.error("Sebagian Open Bill gagal dihapus. Coba lagi.");
		} finally {
			setIsDeleting(false);
		}
	};

	return (
		<div className="space-y-3 pt-1">
			<div className="flex items-end justify-between gap-3">
				<div className="min-w-0">
					<h3 className="text-lg font-black tracking-tight text-foreground">Open Bill</h3>
					<p className="mt-0.5 text-xs text-muted-foreground">Pesanan tersimpan dan belum dibayar.</p>
				</div>
				{orders && orders.length > 0 ? <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-black text-amber-700">{orders.length} aktif</span> : null}
			</div>

			{orders && orders.length > 0 ? (
				<div className="flex items-center justify-between gap-2 rounded-xl border border-border/60 bg-muted/30 px-3 py-2">
					<label className="flex min-h-10 min-w-0 cursor-pointer items-center gap-2 text-xs font-bold text-muted-foreground">
						<Checkbox checked={allSelected} onCheckedChange={handleSelectAll} aria-label="Pilih semua Open Bill" />
						<span>{selectedIds.size > 0 ? `${selectedIds.size} dipilih` : "Pilih semua"}</span>
					</label>
					{selectedIds.size > 0 ? (
						<Button type="button" variant="destructive" size="sm" disabled={isDeleting} onClick={() => setIsDeleteConfirmOpen(true)} className="min-h-10 gap-1.5 rounded-xl px-3 text-xs font-bold">
							<Trash2 className="h-3.5 w-3.5" />
							{isDeleting ? "Menghapus..." : `Hapus ${selectedIds.size}`}
						</Button>
					) : null}
				</div>
			) : null}

			{orders === undefined ? (
				<div className="space-y-2">
					{[1, 2, 3].map((item) => <div key={item} className="h-24 animate-pulse rounded-2xl bg-muted" />)}
				</div>
			) : orders.length === 0 ? (
				<div className="flex flex-col items-center justify-center rounded-2xl border border-dashed bg-muted/20 px-5 py-12 text-center">
					<ShoppingCart className="h-9 w-9 text-muted-foreground/30" />
					<p className="mt-3 text-sm font-black text-foreground">Tidak ada Open Bill</p>
					<p className="mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">Pesanan yang disimpan atau menunggu pembayaran akan muncul di sini.</p>
				</div>
			) : (
				<div className="space-y-2">
					{orders.map((order: Doc<"orders">) => {
						const totalQty = order.items?.reduce((sum: number, item: any) => sum + Number(item.quantity ?? 0), 0) ?? 0;
						const selected = selectedIds.has(String(order._id));
						return (
							<article key={order._id} className={`rounded-2xl border bg-card p-3 shadow-sm transition ${selected ? "border-primary bg-primary/[0.03] ring-1 ring-primary/20" : "border-border/70 hover:border-primary/30"}`}>
								<div className="flex items-start gap-3">
									<Checkbox checked={selected} onCheckedChange={() => toggleSelected(String(order._id))} onClick={(event) => event.stopPropagation()} aria-label={`Pilih ${order.orderNumber}`} className="mt-1 h-5 w-5 shrink-0" />
									<button type="button" onClick={() => onSelectOrder?.(order)} className="min-w-0 flex-1 text-left">
										<div className="flex items-start justify-between gap-3">
											<div className="min-w-0">
												<p className="truncate text-sm font-black text-primary">#{order.orderNumber}</p>
												<p className="mt-1 truncate text-xs font-semibold text-foreground">{order.customerName || "Tanpa nama"}{order.tableNumber ? ` · Meja ${order.tableNumber}` : ""}</p>
												<p className="mt-1 text-[11px] text-muted-foreground">{formatTime(order.createdAt)} · {order.items?.length ?? 0} item · {totalQty} qty</p>
											</div>
											<div className="shrink-0 text-right">
												<p className="text-sm font-black text-foreground">{formatCurrency(order.totalAmount)}</p>
												<span className="mt-1 inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">Belum dibayar</span>
											</div>
										</div>
									</button>
								</div>
								<div className="mt-3 flex items-center justify-end gap-2 border-t border-border/60 pt-2">
									{onPrint ? <Button type="button" variant="ghost" size="sm" className="min-h-10 rounded-xl px-3 text-xs font-bold text-muted-foreground" onClick={(event) => { event.stopPropagation(); onPrint(order, "open_bill"); }}><Printer className="mr-1.5 h-3.5 w-3.5" /> Cetak</Button> : null}
									<Button type="button" size="sm" className="min-h-10 rounded-xl bg-primary px-4 text-xs font-bold" onClick={() => onRestore(order)}>Lanjutkan</Button>
								</div>
							</article>
						);
					})}
				</div>
			)}

			<ConfirmationModal
				isOpen={isDeleteConfirmOpen}
				title={`Hapus ${selectedIds.size} Open Bill?`}
				message="Open Bill yang dipilih, item pesanan, dan catatan transaksinya akan dihapus. Tindakan ini tidak dapat dibatalkan."
				variant="danger"
				onClose={() => setIsDeleteConfirmOpen(false)}
				onConfirm={handleBulkDelete}
			/>
		</div>
	);
}

function normalizePromotionLabel(label: string, timestamp?: number) {
	const normalized = label.trim();
	const lower = normalized.toLowerCase();
	if (lower.includes("happy hour") || lower.includes("happyhour")) {
		if (lower.includes("siang") || lower.includes("lunch")) return "Happy Hour Makan Siang";
		if (lower.includes("malam") || lower.includes("dinner")) return "Happy Hour Makan Malam";
		if (timestamp) {
			const hour = new Date(timestamp).getHours();
			if (hour >= 11 && hour < 16) return "Happy Hour Makan Siang";
			if (hour >= 17 && hour < 22) return "Happy Hour Makan Malam";
		}
		return "Happy Hour";
	}
	if (lower === "promosi aktif" || lower === "diskon" || lower === "promosi / diskon") return "Promo";
	if (lower.startsWith("promosi - ")) return normalized.replace(/^Promosi - /i, "Promo - ");
	return normalized;
}

function getOrderPromotionLabel(order: Doc<"orders">, discounts: Doc<"discounts">[] | null | undefined) {
	const storedLabels = (order.receiptMeta?.promotionLabels ?? [])
		.map((label: string) => normalizePromotionLabel(label, order.createdAt))
		.filter(Boolean);
	if (storedLabels.length > 0) return storedLabels;
	if (!(order.discountAmount > 0)) return [];

	const orderDate = new Date(order.createdAt);
	const orderMinutes = orderDate.getHours() * 60 + orderDate.getMinutes();
	const matchedHappyHour = (discounts ?? []).find((discount: any) => {
		if (!discount?.isHappyHour || !discount?.startTime || !discount?.endTime) return false;
		const [startHour, startMinute] = String(discount.startTime).split(":").map(Number);
		const [endHour, endMinute] = String(discount.endTime).split(":").map(Number);
		const start = startHour * 60 + startMinute;
		const end = endHour * 60 + endMinute;
		return start <= end ? orderMinutes >= start && orderMinutes <= end : orderMinutes >= start || orderMinutes <= end;
	});
	if (matchedHappyHour) return [normalizePromotionLabel(String(matchedHappyHour.name ?? "Happy Hour"), order.createdAt)];
	return ["Promo"];
}

function HistoryTab({ onSelectOrder, onPrint }: { onSelectOrder: (order: Doc<"orders">) => void; onPrint?: (order: Doc<"orders">, mode: ReceiptPrintMode) => void }) {
	const orders = useHybridOrders();
	const allDiscounts = useHybridAllDiscounts();
	const shiftStatus = useHybridShiftStatus();

	const [timeFilter, setTimeFilter] = useState("today");
	const [sortOrder, setSortOrder] = useState("desc");
	const [shiftFilter, setShiftFilter] = useState("active");
	const [deliveredToggles, setDeliveredToggles] = useState<Set<string>>(new Set());
	const [cashierPaidIds, setCashierPaidIds] = useState<Set<string>>(new Set());
	const updateOrder = useHybridUpdateOrder();
	const markCashierPaid = useCallback(async (order: Doc<"orders">) => {
		try {
			await updateOrder({ id: order._id, status: "paid", paymentMethod: "cash", paymentReceiptKind: "cashier" });
			setCashierPaidIds((current) => new Set(current).add(String(order._id)));
			toast.success(`Pesanan #${order.orderNumber} ditandai sudah dibayar`);
		} catch (error) {
			console.error("[history-cashier-paid] failed", error);
			toast.error("Gagal menandai pesanan sudah dibayar");
		}
	}, [updateOrder]);

	// Optimistic is_delivered: local toggle overrides DB value
	const getIsDelivered = useCallback(
		(orderId: string, dbValue: boolean) => {
			if (deliveredToggles.has(orderId)) return !dbValue;
			return dbValue;
		},
		[deliveredToggles]
	);

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

		// Kasir POS adalah sumber utama transaksi; jangan hilangkan order kasir
		// hanya karena shift aktif belum ter-resolve di client.
		let filtered = [...orders].filter((order: any) => order.source === "pos" || order.source == null);
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
			if (activeShift) {
				const activeShiftEnd = activeShift.endTime ?? Date.now();
				filtered = filtered.filter((o) => o.createdAt >= activeShift.startTime && o.createdAt <= activeShiftEnd);
			}
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
				<h3 className="font-medium text-lg">Riwayat Pesanan</h3>
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
				<div className="space-y-1.5">
					{filteredOrders.map((order: Doc<"orders">) => {
						const matchedShift = getShiftForOrder(order.createdAt) as any;
						const shiftLabel = matchedShift?.shiftName || "Di luar shift";
						const cashierName = matchedShift?.cashierName || "—";
						const totalQty = order.items?.reduce((acc: number, i: any) => acc + (i.quantity || 0), 0) || 0;
						const subtotal = order.items?.reduce((sum: number, i: any) => sum + (i.originalPrice ?? i.price) * (i.quantity || 0), 0) ?? 0;
						const promoLabels = getOrderPromotionLabel(order, allDiscounts);
						const delivered = getIsDelivered(order._id, !!order.is_delivered);
						const isCashierPending = order.status === "pending" && ["cash", "cashier", "tunai"].includes(String(order.paymentMethod ?? "").toLowerCase());
						const displayStatus = cashierPaidIds.has(String(order._id)) ? "paid" : order.status;
						const orderTypeLabel =
							order.orderType === "dine_in" ? "Makan di Tempat"
							: order.orderType === "takeaway" ? "Bungkus"
							: order.orderType === "online" ? "Online"
							: order.orderType ?? "—";
						const payMethodLabel =
							order.paymentMethod === "tunai" ? "Tunai"
							: order.paymentMethod === "qris" ? "QRIS"
							: order.paymentMethod === "transfer" ? "Transfer"
							: order.paymentMethod ?? "—";
						const statusBadge =
							displayStatus === "paid" || displayStatus === "completed"
								? "text-emerald-600"
								: displayStatus === "pending"
									? "text-orange-600"
									: "text-rose-600";
						const statusLabel =
							displayStatus === "paid" ? "Lunas"
							: displayStatus === "completed" ? "Selesai"
							: displayStatus === "pending" ? (isCashierPending ? "Bayar di Kasir" : "Menunggu Pembayaran")
							: "Batal";
						const statusBg =
							displayStatus === "paid" || displayStatus === "completed"
								? "bg-emerald-50"
								: displayStatus === "pending"
									? "bg-orange-50"
									: "bg-rose-50";
						const isDineIn = order.orderType === "dine_in";

						return (
							<div
								key={order._id}
								className="flex items-stretch gap-2"
							>
								{/* LEFT CARD: Data transaksi */}
								<div className="flex-[3] rounded-xl border bg-card transition-all hover:border-primary/30 hover:shadow-sm">
									<button
										onClick={() => onSelectOrder(order)}
										className="flex flex-col gap-0.5 p-2.5 w-full min-w-0 text-left"
										type="button"
									>
										{/* Line 0: Urutan transaksi + Status */}
										<div className="flex items-center gap-1.5 flex-wrap">
											{order.dailyReceiptNo ? (
												<span className="font-extrabold text-sm text-foreground tracking-tight">
													#{order.dailyReceiptNo}
												</span>
											) : (
												<span className="font-extrabold text-sm text-foreground tracking-tight">
													#{order.orderNumber}
												</span>
											)}
											<span className={`text-[11px] font-bold uppercase tracking-wider ${statusBadge}`}>
												● {statusLabel}
											</span>
											{order.source === "booking" ? (
												<>
													<span className="rounded-full bg-violet-50 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-violet-700">Booking</span>
													{order.arrivalTime && <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[9px] font-extrabold tracking-wide text-blue-700">Tiba {order.arrivalTime}</span>}
												</>
											) : order.source === "customer_self_service" ? (
												<span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-blue-700">
													DjiwaApp
												</span>
											) : null}
										</div>
										{/* Line 1: Order ID */}
										<div className="text-[10px] text-muted-foreground">
											{order.orderNumber}
										</div>
										{/* Line 2: shift + type */}
										<div className="flex items-center gap-1 flex-wrap text-[11px] text-muted-foreground">
											<span>{shiftLabel}</span>
											<span className="text-muted-foreground/40">•</span>
											<span>{orderTypeLabel}</span>
											{isDineIn && order.tableNumber && (
												<>
													<span className="text-muted-foreground/40">•</span>
													<span className="font-medium text-primary/70">Meja {order.tableNumber}</span>
												</>
											)}
										</div>
										{/* Line 3: Date/Time + Kasir */}
										<div className="flex items-center gap-1 flex-wrap text-[10px] text-muted-foreground">
											<span>{formatDate(order.createdAt)} {formatTime(order.createdAt)}</span>
											<span className="text-muted-foreground/40">•</span>
											<span>{cashierName} (kasir)</span>
										</div>
										{/* Line 4: Customer + Items + Amount + Method + Promo */}
										<div className="flex items-center gap-1 flex-wrap text-[10px] text-muted-foreground">
											<span className="truncate max-w-[120px]">{(order.customerName && order.customerName !== "Pelanggan") ? order.customerName : "Pelanggan"} (customer)</span>
											<span className="text-muted-foreground/40">•</span>
											<span className="font-medium text-foreground/80">
												{totalQty} item ·{" "}
												{(order.receiptMeta?.promotionLabels?.length ?? 0) > 0 && subtotal > order.totalAmount ? (
													<>
														<span className="line-through text-muted-foreground/50">{formatCurrency(subtotal)}</span>{" "}
														{formatCurrency(order.totalAmount)}
													</>
												) : (
													formatCurrency(order.totalAmount)
												)}
											</span>
											<span className="text-muted-foreground/40">•</span>
											<span>{payMethodLabel}</span>
											{promoLabels.length > 0 && (
												<>
													<span className="text-muted-foreground/40">•</span>
													<span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-600 uppercase tracking-wider leading-none">
														{promoLabels[0].length > 20 ? promoLabels[0].slice(0, 20) + "…" : promoLabels[0]}
													</span>
												</>
											)}
											{order.discountAmount > 0 && !promoLabels.length && (
												<>
													<span className="text-muted-foreground/40">•</span>
													<span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-600 uppercase tracking-wider leading-none">Promo</span>
												</>
											)}
										</div>
									</button>
									</div>
									{/* RIGHT COLUMN: 4 tombol vertikal */}
									<div className="flex-[1] flex flex-col gap-1.5 justify-center items-stretch px-1">
										{/* 1. Payment confirmation */}
										{isCashierPending && !cashierPaidIds.has(String(order._id)) && (
											<button type="button" onClick={(event) => { event.stopPropagation(); void markCashierPaid(order); }} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-1 rounded-xl border border-emerald-200 bg-emerald-50 px-2 text-[11px] font-bold text-emerald-700 transition-colors hover:bg-emerald-100">
												<CheckCircle className="h-3.5 w-3.5" /> Sudah Dibayar
											</button>
										)}
										{/* 2. Delivered toggle */}
										<button
											onClick={async (e) => {
												e.stopPropagation();
												setDeliveredToggles(prev => {
													const next = new Set(prev);
													if (next.has(order._id)) next.delete(order._id);
													else next.add(order._id);
													return next;
												});
												try {
													const supabase = createClient();
													await supabase.schema("pos").from("orders")
														.update({ is_delivered: !delivered })
														.eq("_id", order._id);
												} catch (err) {
													console.warn("[delivered-toggle] failed", err);
												}
											}}
											className={`shrink-0 inline-flex items-center justify-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] font-medium transition-colors whitespace-nowrap ${
												delivered
													? "bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100"
													: "bg-red-50 border-red-200 text-red-500 hover:bg-red-100 hover:text-red-600"
											}`}
											type="button"
										>
											{delivered ? <CheckCircle className="h-2.5 w-2.5" /> : <Circle className="h-2.5 w-2.5" />}
											{delivered ? "Diantar" : "Sudah diantar?"}
										</button>
										{/* 2-4: Print buttons */}
										{onPrint && (
											<>
												<button
													onClick={(e) => { e.stopPropagation(); onPrint(order, "paid"); }}
													className="shrink-0 inline-flex items-center justify-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium bg-blue-50 border-blue-200 text-blue-600 hover:bg-blue-100 transition-colors whitespace-nowrap"
													type="button"
												>
													<Receipt className="h-2.5 w-2.5" />
													Struk Lunas
												</button>
												<button
													onClick={(e) => { e.stopPropagation(); onPrint(order, "open_bill"); }}
													className="shrink-0 inline-flex items-center justify-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium bg-amber-50 border-amber-200 text-amber-600 hover:bg-amber-100 transition-colors whitespace-nowrap"
													type="button"
												>
													<FileText className="h-2.5 w-2.5" />
													Open Bill
												</button>
												<button
													onClick={(e) => { e.stopPropagation(); onPrint(order, "kitchen"); }}
													className="shrink-0 inline-flex items-center justify-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium bg-green-50 border-green-200 text-green-600 hover:bg-green-100 transition-colors whitespace-nowrap"
													type="button"
												>
													<ChefHat className="h-2.5 w-2.5" />
													Kitchen
												</button>
											</>
										)}
									</div>
									</div>
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
								<p className="text-[11px] font-bold text-muted-foreground uppercase">Transaksi Shift</p>
								<p className="font-bold text-sm">{shiftTransactionCount}</p>
							</div>
						</div>
						
						<div className="grid grid-cols-2 gap-3 pt-4 border-t border-border/50">
							<div className="space-y-1">
								<p className="text-[11px] font-bold text-emerald-600 uppercase">Total Masuk (+)</p>
								<p className="font-bold text-xs">{formatCurrency(shiftIncome)}</p>
								<p className="text-[11px] text-muted-foreground mt-0.5">(Termasuk modal {formatCurrency(modalAwal)})</p>
							</div>
							<div className="space-y-1 text-right">
								<p className="text-[11px] font-bold text-rose-600 uppercase">Total Keluar (-)</p>
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
	const createTransaction = useHybridCreateTransaction();

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
	// Pengeluaran saat tutup shift
	const [endShiftExpenses, setEndShiftExpenses] = useState<{id: number; category: string; amount: string; description: string}[]>([]);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [submitError, setSubmitError] = useState<string | null>(null);
	const [submitNotice, setSubmitNotice] = useState<string | null>(null);
	const [showEndConfirm, setShowEndConfirm] = useState(false);
	const [showStartConfirm, setShowStartConfirm] = useState(false);
	const [showStartChecklist, setShowStartChecklist] = useState(false);
	const [onlineFoodChecklist, setOnlineFoodChecklist] = useState<OnlineFoodChecklist>(() => createEmptyOnlineFoodChecklist());
	const [openRequestId, setOpenRequestId] = useState<string | null>(null);
	
	// Cash Breakdown State
	const [breakdown, setBreakdown] = useState<Record<string, number>>({
		bill100000: 0, bill50000: 0, bill20000: 0, bill10000: 0, bill5000: 0, bill2000: 0, bill1000: 0, bill500: 0, bill200: 0, bill100: 0
	});

	const [shiftRefreshTrigger, setShiftRefreshTrigger] = useState(0);
	const shiftStatus = useHybridShiftStatus(shiftRefreshTrigger);
	const siteSettings = useHybridSiteSettings();
	const [closingAttendance, setClosingAttendance] = useState<Array<{ name: string; userId: string; status: "active" | "checked_out" | "no_show" }>>([]);
	const [closingAttendanceLoading, setClosingAttendanceLoading] = useState(false);
	const [closingAttendanceError, setClosingAttendanceError] = useState<string | null>(null);
	const activeClosingStaff = closingAttendance.filter((member) => member.status === "active");
	const [clockTick, setClockTick] = useState(() => Date.now());
	useEffect(() => {
		const timer = window.setInterval(() => setClockTick(Date.now()), 30_000);
		return () => window.clearInterval(timer);
	}, []);
	useEffect(() => {
		const teamText = shiftStatus?.ongoingShift?.teamMembers;
		const shiftStart = Number(shiftStatus?.ongoingShift?.startTime ?? 0);
		if (!shiftStatus?.isOpen || !teamText || !allUsers?.length || !shiftStart) {
			setClosingAttendance([]);
			setClosingAttendanceError(null);
			return;
		}
		let cancelled = false;
		const fetchClosingAttendance = async () => {
			setClosingAttendanceLoading(true);
			setClosingAttendanceError(null);
			try {
				const members = teamText.split(",").map((name: string) => name.trim()).filter(Boolean).map((name: string) => {
					const user = allUsers.find((candidate: any) => candidate.name?.trim()?.toLowerCase() === name.toLowerCase());
					return { name, userId: String(user?._id ?? "") };
				});
				const userIds = members.map((member) => member.userId).filter(Boolean);
				if (!userIds.length) { if (!cancelled) setClosingAttendance(members.map((member) => ({ ...member, status: "no_show" as const }))); return; }
				const { data, error } = await createClient().from("pos_attendance_logs").select("userId,type,timestamp").in("userId", userIds).gte("timestamp", shiftStart).lte("timestamp", Date.now()).order("timestamp", { ascending: false });
				if (error) throw error;
				const latestByUser = new Map<string, any>();
				for (const log of data ?? []) if (!latestByUser.has(String(log.userId))) latestByUser.set(String(log.userId), log);
				const result = members.map((member) => {
					const latest = latestByUser.get(member.userId);
					const status = !latest ? "no_show" : latest.type === "check_in" ? "active" : "checked_out";
					return { ...member, status } as { name: string; userId: string; status: "active" | "checked_out" | "no_show" };
				});
				if (!cancelled) setClosingAttendance(result);
			} catch (error) {
				console.error("[shift-close-attendance]", error);
				if (!cancelled) setClosingAttendanceError("Status absensi belum bisa dimuat. Refresh sebelum menutup kasir.");
			} finally { if (!cancelled) setClosingAttendanceLoading(false); }
		};
		void fetchClosingAttendance();
		const refresh = window.setInterval(() => void fetchClosingAttendance(), 30_000);
		return () => { cancelled = true; window.clearInterval(refresh); };
	}, [shiftStatus?.isOpen, shiftStatus?.ongoingShift?.teamMembers, shiftStatus?.ongoingShift?.startTime, allUsers]);
	const todayOrders = useHybridOrders();
	const selectedShiftSchedule = useMemo(() => {
		const activeShiftName = shiftStatus?.shiftInfo?.shiftName || shiftName;
		return siteSettings?.shiftSettings?.shiftSchedules?.find(
			(schedule: { name: string; openTime?: string; closeTime?: string }) =>
				schedule.name === activeShiftName
		);
	}, [siteSettings?.shiftSettings?.shiftSchedules, shiftName, shiftStatus?.shiftInfo?.shiftName]);
	const shiftTimeGate = useMemo(() => {
		if (!shiftStatus?.isOpen) return { blocked: false, message: "" };
		const displayShiftName = (shiftStatus.shiftInfo?.shiftName || shiftName || "").replace(/^shift\s+/i, "");
		const closeTimeStr = selectedShiftSchedule?.closeTime;
		if (!closeTimeStr) return { blocked: true, message: `Jadwal tutup untuk ${displayShiftName || "shift ini"} belum dikonfigurasi. Tutup kasir diblokir.` };
		const [closeHour, closeMin] = closeTimeStr.split(":").map(Number);
		if (!Number.isFinite(closeHour) || !Number.isFinite(closeMin)) return { blocked: true, message: "Format jam tutup shift tidak valid. Tutup kasir diblokir." };
		const now = new Date(clockTick);
		const nowWib = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
		const closeWib = new Date(nowWib);
		closeWib.setHours(closeHour, closeMin, 0, 0);
		if (nowWib.getTime() < closeWib.getTime()) {
			return { blocked: true, message: `Shift ${displayShiftName || "ini"} baru bisa ditutup setelah ${String(closeHour).padStart(2, "0")}:${String(closeMin).padStart(2, "0")} WIB.` };
		}
		return { blocked: false, message: "" };
	}, [clockTick, selectedShiftSchedule?.closeTime, shiftName, shiftStatus?.isOpen, shiftStatus?.shiftInfo?.shiftName]);

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

	// Auto-add cashier ke team members saat buka shift
	useEffect(() => {
		if (shiftType !== "mulai") return;
		if (cashierName && !teamMembers.includes(cashierName)) {
			setTeamMembers((prev) => [...prev, cashierName]);
		}
	}, [cashierName, shiftType]);

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

	// Auto-fill nonCashConfirmed from shiftQris
	useEffect(() => {
		if (shiftQris > 0 && !nonCashConfirmed) {
			setNonCashConfirmed(shiftQris.toString());
		}
	}, [shiftQris]);

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

	// ── Helper: Format team per-role ──
	const formatTeamByRole = useCallback((members: string[], allStaff: any[]): string => {
		if (!members.length) return "-";
		const roleOrder = ["Barista", "Kitchen", "Kasir", "Waitress", "Waiters", "Manajer"];
		const normalize = new Map<string, string>();
		for (const r of roleOrder) { normalize.set(r.toUpperCase(), r); normalize.set(r.toLowerCase(), r); }
		normalize.set("CHEF", "Kitchen"); normalize.set("MANAGER", "Manajer"); normalize.set("WAITERS", "Waitress");
		const grouped = new Map<string, string[]>();
		members.forEach((name) => {
			const user = allStaff.find((u: any) => u.name?.trim()?.toLowerCase() === name.toLowerCase());
			const rawRole = user?.roleName?.trim() || "Lainnya";
			const role = normalize.get(rawRole.toUpperCase()) ?? rawRole;
			if (!grouped.has(role)) grouped.set(role, []);
			grouped.get(role)!.push(name);
		});
		const sorted = [...grouped.keys()].sort((a, b) => {
			const ai = roleOrder.findIndex(r => r.toLowerCase() === a.toLowerCase());
			const bi = roleOrder.findIndex(r => r.toLowerCase() === b.toLowerCase());
			return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
		});
		return sorted.map(r => {
			if (r === "Lainnya") return `  ${grouped.get(r)!.join(", ")}`;
			return `${r.charAt(0).toUpperCase() + r.slice(1).toLowerCase()}: ${grouped.get(r)!.join(", ")}`;
		}).join("\n");
	}, []);

	// ── Staff sections for shift form (grouped by role) ──
	const staffSections = useMemo(() => {
		if (!staffUsers?.length) return null;
		const roleOrder = ["Barista", "Kitchen", "Kasir", "Waitress", "Waiters", "Manajer"];
		const grouped = new Map<string, any[]>();
		const others: any[] = [];
		staffUsers.forEach((u: any) => {
			const rn = (u.roleName || "").trim();
			if (roleOrder.some(r => r.toLowerCase() === rn.toLowerCase())) {
				const key = rn.charAt(0).toUpperCase() + rn.slice(1).toLowerCase();
				if (!grouped.has(key)) grouped.set(key, []);
				grouped.get(key)!.push(u);
			} else {
				others.push(u);
			}
		});
		const sections = roleOrder
			.filter(r => grouped.has(r))
			.map(r => ({ role: r, users: grouped.get(r)! }));
		if (others.length) sections.push({ role: "Lainnya", users: others });
		return sections;
	}, [staffUsers]);

	// ── Helper: Kirim notifikasi Telegram ──
	const sendTelegramNotif = useCallback(async (title: string, details: Record<string, string>, timeExtras?: { startTime?: number; endTime?: number }) => {
		const supabase = createClient();
		const fmtTime3 = (ms?: number) => {
			if (!ms) return "";
			const d = new Date(ms);
			return d.toLocaleTimeString("en-US", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", hour12: false });
		};
		const fmtDate3 = (ms?: number) => {
			if (!ms) return "";
			const d = new Date(ms);
			return d.toLocaleDateString("en-US", { timeZone: "Asia/Jakarta", weekday: "long", day: "numeric", month: "long", year: "numeric" });
		};
		const timeLine = timeExtras?.startTime
			? `🕐 ${fmtDate3(timeExtras.startTime)} — ${fmtTime3(timeExtras.startTime)} sd ${fmtTime3(timeExtras.endTime || Date.now())} WIB`
			: `🕐 ${new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "full", timeStyle: "short" })}`;
		const lines = [
			`📋 ${title}`,
			`━━━━━━━━━━━━━━━`,
			...Object.entries(details).map(([k, v]) => `${k} ${v}`),
			`━━━━━━━━━━━━━━━`,
			timeLine,
		];
		try {
			const targetChatIds = [-1003991897388, -1003927364523];
			const results = await Promise.allSettled(targetChatIds.map((chat_id) => supabase.functions.invoke("send-telegram-report", {
				body: { text: lines.join("\n"), chat_id, sender: chat_id === -1003927364523 ? "supervisor" : "report" }
			})));
			const delivered = results.every((result) => result.status === "fulfilled" && !result.value.error);
			results.forEach((result, index) => {
				if (result.status === "rejected" || result.value.error) console.error(`[shift-notif] Gagal kirim ke chat ${targetChatIds[index]}:`, result.status === "rejected" ? result.reason : result.value.error);
			});
			return delivered;
		} catch (e) {
			console.error("[shift-notif] Gagal kirim notifikasi:", e);
			return false;
		}
	}, []);

	const handleEndShift = async () => {
		if (shiftTimeGate.blocked) {
			setSubmitError(null);
			setSubmitNotice(`⏰ ${shiftTimeGate.message}`);
			toast.info(shiftTimeGate.message);
			setShowEndConfirm(false);
			return;
		}
		if (closingAttendanceLoading) {
			toast.error("Status absensi tim masih dimuat. Tunggu sebentar lalu coba lagi.");
			return;
		}
		if (closingAttendanceError) {
			toast.error(closingAttendanceError);
			return;
		}
		if (activeClosingStaff.length > 0) {
			const staffNames = activeClosingStaff.map((member) => member.name).join(", ");
			const message = `Belum bisa tutup kasir. ${staffNames} harus absen keluar terlebih dahulu melalui bot Telegram Yumi HRD.`;
			setSubmitError(null);
			setSubmitNotice(`⏳ ${message}`);
			toast.info(message);
			return;
		}
		if (!shiftStatus?.shiftInfo?.shiftId) {
			// Fallback if it's a legacy shift without ID
			toast.error("Shift ini dimulai dari versi lama. Mohon gunakan tombol legacy.");
			setIsSubmitting(false);
			return;
		}

		setIsSubmitting(true);
		setSubmitError(null);
		setSubmitNotice(null);
		try {
			// Record any end-of-shift expenses first
			for (const exp of endShiftExpenses) {
				const amt = Number(exp.amount);
				if (amt <= 0) continue;
				await createTransaction({
					type: "expense",
					amount: amt,
					category: exp.category || "Lainnya",
					description: exp.description || "",
					date: Date.now(),
					status: "completed",
					paymentMethod: "tunai",
				});
			}
			const completedShiftStartTime =
				shiftStatus?.ongoingShift?.startTime || Date.now();
			const result = await endShift({
				shiftId: shiftStatus.shiftInfo.shiftId as Id<"shifts">,
				endingCashPhysical: Number(cashInRegister),
				nonCashConfirmed: Number(nonCashConfirmed),
				cashBreakdown: breakdown as any,
				notes,
			});
			
			const shiftInfo = result?.shift;
			const summary = result?.summary;
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
			
			// Kirim notifikasi text ke grup Report
			if (summary && shiftInfo) {
				const { summary: s, shift: si } = { summary, shift: shiftInfo };
				
				// Format non-tunai breakdown
				const pb = s.paymentBreakdown || {};
				const ntLines = [
					`   ├ QRIS: Rp ${(pb.qris ?? 0).toLocaleString("id-ID")}`,
					`   ├ EDC: Rp ${((pb.debit ?? 0) + (pb.credit ?? 0)).toLocaleString("id-ID")}`,
					...(pb.onlineFoodPlatforms && Object.keys(pb.onlineFoodPlatforms).length > 0
						? [
							`   ├ Online Food:`,
							...Object.entries(pb.onlineFoodPlatforms as Record<string, number>)
								.filter(([_, v]) => Number(v) > 0)
								.map(([platform, val], i, arr) => {
									const isLast = i === arr.length - 1;
									const prefix = isLast ? "   │  └" : "   │  ├";
									const label = platform === "grab" ? "GrabFood" : platform === "gofood" ? "GoFood" : platform === "maxim" ? "Maxim" : platform === "shopeefood" ? "ShopeeFood" : platform;
									return `${prefix} ${label}: Rp ${Number(val).toLocaleString("id-ID")}`;
								}),
						]
						: []),
					`   └ Transfer: Rp ${(pb.transfer ?? 0).toLocaleString("id-ID")}`,
				];
				
				const pecahanTxt = Object.entries(breakdown)
					.filter(([_, c]) => Number(c) > 0)
					.sort(([a], [b]) => Number(b.replace("bill","")) - Number(a.replace("bill","")))
					.map(([key, count]) => {
						const nominal = Number(key.replace("bill",""));
						return `Rp ${nominal.toLocaleString("id-ID")} × ${count} = Rp ${(nominal * Number(count)).toLocaleString("id-ID")}`;
					});
				
				const teamFmt = formatTeamByRole(teamMembers.length ? teamMembers : (si.teamMembers?.split(", ").filter(Boolean) || []), staffUsers);
				const teamIndented = teamFmt.split("\n").map((ln: string) => ln.trim() ? `   ${ln}` : "").filter(Boolean).join("\n");
				const cashInRegisterVal = Number(cashInRegister || 0);
				const modalKasir = Number(si.startingCash ?? 0);
				const totalNonTunai = (pb.qris ?? 0) + (pb.debit ?? 0) + (pb.credit ?? 0) + (pb.transfer ?? 0) +
					Object.values(pb.onlineFoodPlatforms || {}).reduce((sum: number, v: any) => sum + Number(v), 0);
				const ntLabelParts2: string[] = [];
				if (pb.qris) ntLabelParts2.push("QRIS");
				if ((pb.debit ?? 0) + (pb.credit ?? 0) > 0) ntLabelParts2.push("EDC");
				if (pb.transfer) ntLabelParts2.push("Transfer");
				const ofp2 = pb.onlineFoodPlatforms || {};
				const pfLabels2: Record<string, string> = { grab: "GrabFood", gofood: "GoFood", maxim: "Maxim", shopeefood: "ShopeeFood" };
				Object.entries(ofp2).filter(([_, v]) => Number(v) > 0).forEach(([p]) => ntLabelParts2.push(pfLabels2[p] || p));
				const ntLabel2 = ntLabelParts2.length ? ` (${ntLabelParts2.join(" + ")})` : "";
				const totalNonTunaiStr = `Rp ${totalNonTunai.toLocaleString("id-ID")}${ntLabel2}`;
				const diffTunai = cashInRegisterVal - s.cashRevenue;
				const fmtSelisih = (v: number) => v === 0 ? "✅ Rp 0" : v > 0 ? `⬆️ Rp ${v.toLocaleString("id-ID")}` : `⬇️ Rp ${Math.abs(v).toLocaleString("id-ID")}`;
				
				sendTelegramNotif("📊 LAPORAN SHIFT", {
					"🏪": "Djiwa Tentram",
					"🔄 Shift": si.shiftName || shiftName || "-",
					"👥 Tim": `\n${teamIndented}`,
					"━━━ DI SISTEM ━━━": "━━━",
					"💰 Modal Kasir": `Rp ${Number(si.startingCash ?? 0).toLocaleString("id-ID")}`,
					"💵 Penjualan Tunai": `Rp ${s.cashRevenue.toLocaleString("id-ID")}`,
					"💳 Non-Tunai:": totalNonTunaiStr,
					"💸 Pengeluaran": `Rp ${s.totalExpenses.toLocaleString("id-ID")}`,
					"📦 Item Terjual": `${s.totalItemsSold}`,
					"🏷 Diskon": `Rp ${s.totalDiscount.toLocaleString("id-ID")}`,
					"━━━ DI LACI ━━━": "━━━",
					"💰 Modal (Laci)": `Rp ${modalKasir.toLocaleString("id-ID")}`,
					"💵 Uang (Laci)": `Rp ${cashInRegisterVal.toLocaleString("id-ID")}`,
					"🔢 Pecahan:": `
${pecahanTxt.length ? pecahanTxt.join("\n") : "(tidak diisi)"}`,
					"━━━ SELISIH ━━━": "━━━",
					"💵 Penjualan (Laci)": `Rp ${s.cashRevenue.toLocaleString("id-ID")}`,
					"💵 Uang (Fisik)": `Rp ${cashInRegisterVal.toLocaleString("id-ID")}`,
					"📊 Selisih:": fmtSelisih(diffTunai),
					"📝 Catatan:": notes || "-",
				}, { startTime: si.startTime || undefined, endTime: Date.now() });
				console.log("[shift-notif] End shift notification sent successfully");
				
				// Generate HTML laporan & upload ke Supabase Storage (best-effort)
				import("@/lib/shift-report-pdf").then(async ({ buildReportHTML, loadLogoBase64 }) => {
					try {
						const pbData = s.paymentBreakdown || {};
						const [logoB64] = await Promise.all([loadLogoBase64()]);						const html = buildReportHTML({
							shiftName: si.shiftName || shiftName || "-",
							cashierName: si.cashierName || cashierName || "-",
							teamMembers: teamMembers.join(", ") || si.teamMembers || "",
							teamFormatted: teamFmt,
							startTime: si.startTime || Date.now(),
							endTime: Date.now(),
							startingCash: Number(si.startingCash ?? 0),
							cashRevenue: s.cashRevenue,
							paymentBreakdown: pbData,
							totalExpenses: s.totalExpenses,
							totalDiscount: s.totalDiscount,
							totalItemsSold: s.totalItemsSold,
							cashInRegister: Number(cashInRegister || 0),
							cashBreakdown: breakdown,
							notes: notes || "",
						}, logoB64);
						
												// Kirim HTML ke bot - simpan di VPS + kirim link ke grup
						fetch("http://localhost:8001/save-report", {
							method: "POST",
							headers: { "Content-Type": "application/json" },
							body: JSON.stringify({
								html: html,
								shift_name: si.shiftName || shiftName || "shift",
							}),
						}).then(async (res) => {
							const data = await res.json();
							if (data.ok && data.url) {
								const supabase4 = createClient();
								supabase4.functions.invoke("send-telegram-report", {
									body: {
										text: "\xf0\x9f\x93\x8a Laporan: " + data.url,
										chat_id: -1003991897388,
									}
								}).catch(() => {});
							}
						}).catch((e) => {
							console.error("[shift-html] Gagal simpan HTML:", e);
						});
					} catch (e) {
						console.error("[shift-html] Gagal generate HTML:", e);
					}
				});

			}
			
			setAmount("");
			setCashInRegister("");
			setNonCashConfirmed("");
			setNotes("");
			setEndShiftExpenses([]);
			setCashierName("");
			setTeamMembers([]);
			onClose();
		} catch (error) {
			console.error(error);
			const message = error instanceof Error ? error.message : "Gagal memproses data shift";
			if (/baru tutup jam|baru bisa ditutup setelah|belum waktunya|tunggu sampai|belum bisa.*tutup|belum.*tutup/i.test(message)) {
				setSubmitError(null);
				setSubmitNotice(`⏰ ${message}`);
				toast.info(message);
			} else {
				setSubmitError(message);
				toast.error(message);
			}
		} finally {
			setIsSubmitting(false);
		}
	};

	const confirmStartShift = async () => {
		setIsSubmitting(true);
		setSubmitError(null);
		setSubmitNotice(null);
		try {
			const startingCash = Number(amount);
			if (!cashierName.trim()) throw new Error("Nama kasir wajib diisi");
			if (!shiftName.trim()) throw new Error("Nama shift wajib diisi");
			if (!Number.isFinite(startingCash) || startingCash < 0) throw new Error("Modal kasir tidak valid");
			const cashier = staffUsers.find((u: any) => u.name?.trim()?.toLowerCase() === cashierName.trim().toLowerCase());
			const selectedTeamIds = teamMembers
				.map((name) => staffUsers.find((u: any) => u.name?.trim()?.toLowerCase() === name.trim().toLowerCase())?._id)
				.filter(Boolean);
			const incompletePlatforms = ONLINE_FOOD_PLATFORMS.filter(({ key }) => onlineFoodChecklist[key].status === "pending");
			if (incompletePlatforms.length > 0) {
				throw new Error(`Checklist belum selesai: ${incompletePlatforms.map(({ label }) => label).join(", ")}`);
			}
			const checklistLines = ONLINE_FOOD_PLATFORMS.map(({ key, label }) => {
				const item = onlineFoodChecklist[key];
				const statusLabel = ONLINE_FOOD_STATUS_OPTIONS.find((option) => option.value === item.status)?.label ?? item.status;
				return `${label}: ${statusLabel}${item.note.trim() ? ` — ${item.note.trim()}` : ""}`;
			}).join("\n");
			await startShift({
				cashierName: cashierName.trim(),
				cashierUserId: cashier?._id ?? null,
				shiftName: shiftName.trim(),
				teamMembers: teamMembers.join(", "),
				teamMemberIds: selectedTeamIds,
				startingCash,
				notes,
				onlineFoodChecklist,
				openRequestId: openRequestId ?? undefined,
			});
			setShowStartConfirm(false);
			setShowStartChecklist(false);
			toast.success("Shift berhasil dimulai");
			const teamFormatted = formatTeamByRole(teamMembers, staffUsers);
			const notificationDelivered = await sendTelegramNotif("✅ SHIFT DIBUKA", {
				"🏪": "Djiwa Tentram",
				"🔄 Shift": shiftName.trim(),
				"👤 Kasir": cashierName.trim(),
				"👥 Tim": `\n${teamFormatted}`,
				"💰 Modal Kasir": `Rp ${startingCash.toLocaleString("id-ID")}`,
				"📱 Online Food": `\n${checklistLines}`,
			});
			if (!notificationDelivered) {
				toast.warning("Shift sudah dibuka, tetapi notifikasi belum terkirim ke semua grup.");
			} else {
				toast.success("Notifikasi pembukaan shift terkirim");
			}
			setShiftRefreshTrigger((c) => c + 1);
			setOpenRequestId(null);
			setAmount("");
			setNotes("");
			setCashierName("");
			setTeamMembers([]);
			onClose();
		} catch (error) {
			console.error(error);
			const message = error instanceof Error ? error.message : "Gagal membuka shift";
			setSubmitError(message);
			toast.error(message);
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setSubmitError(null);
		setSubmitNotice(null);
		if (shiftType === "mulai") {
			const startingCash = Number(amount);
			if (!cashierName.trim() || !shiftName.trim()) {
				toast.error("Nama kasir dan nama shift wajib diisi");
				return;
			}
			if (!Number.isFinite(startingCash) || startingCash < 0) {
				toast.error("Modal kasir harus berupa angka 0 atau lebih");
				return;
			}
			if (!openRequestId) {
				setOpenRequestId(
					typeof crypto !== "undefined" && "randomUUID" in crypto
						? crypto.randomUUID()
						: `${Date.now()}-${Math.random().toString(36).slice(2)}`
				);
			}
			setShowStartConfirm(true);
			return;
		}

		// "akhiri" — open confirmation dialog instead of direct submit
		setIsSubmitting(true);
		setShowEndConfirm(true);
		setIsSubmitting(false);
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
					title={shiftType === "mulai" ? "Buka shift baru" : "Tutup shift aktif terlebih dahulu"}
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
				{shiftType === "akhiri" && selectedShiftSchedule?.closeTime && (
					<div className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 text-[11px] font-semibold ${
						shiftTimeGate.blocked
							? "border-amber-300 bg-amber-50 text-amber-900"
							: "border-emerald-200 bg-emerald-50 text-emerald-800"
					}`}>
						<Clock className="mt-0.5 h-4 w-4 shrink-0" />
						<div>
							<p className="font-black">Informasi Tutup Kasir</p>
							<p>
								Shift {shiftStatus?.shiftInfo?.shiftName || shiftName} dijadwalkan tutup pukul {selectedShiftSchedule.closeTime} WIB.
								{shiftTimeGate.blocked
									? " Belum waktunya tutup kasir. Tombol akan aktif setelah jadwal tersebut."
									: " Waktu tutup sudah tercapai, silakan lanjutkan pemeriksaan kas."}
							</p>
						</div>
					</div>
				)}
				{shiftType === "mulai" ? (
					<>
						<div className="grid grid-cols-2 gap-3">
							<div className="space-y-1.5">
								<Label className="text-[10px] font-bold uppercase text-muted-foreground">Kasir <span className="text-destructive">*</span></Label>
								{cashierName === currentUser?.name ? (
									<div className="flex items-center justify-between h-9 px-3 rounded-md border bg-muted/30">
										<span className="text-xs font-bold">{cashierName}</span>
										<span className="text-[11px] text-muted-foreground">· diri sendiri</span>
										<button type="button" onClick={() => setCashierName("")} className="text-[11px] text-primary font-bold hover:underline ml-auto">Ganti</button>
									</div>
								) : (
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
								)}
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
							<div className="rounded-md border bg-background p-2 space-y-2 max-h-48 overflow-y-auto">
																{!staffSections ? (
																	<p className="text-[10px] text-muted-foreground italic px-1">Memuat data staff...</p>
																) : staffSections.map(({ role, users }) => (
																	<div key={role}>
																		<p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground/70 mb-1 px-1">{role}</p>
																		{users.map((u: any) => (
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
																		))}
																	</div>
																))}
							</div>
							{teamMembers.length > 0 && (
								<p className="text-[10px] text-muted-foreground">
									Dipilih: <span className="font-semibold text-foreground">{teamMembers.join(", ")}</span>
								</p>
							)}
						</div>
						<div className="space-y-1.5">
							<Label className="text-[10px] font-bold uppercase text-muted-foreground">Modal Kasir (Rp) <span className="text-destructive">*</span></Label>
							<div className="relative">
								<span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">Rp</span>
								<Input
									className="pl-9 h-11 text-lg font-black tracking-tighter"
									min={0}
									onChange={(e) => setAmount(e.target.value)}
									placeholder="0"
									required
									type="number"
									inputMode="numeric"
									value={amount}
								/>
							</div>
						</div>
					</>
				) : (
					/* AKHIRI SHIFT UI */
					<div className="space-y-3">
						<Card className={`border ${activeClosingStaff.length > 0 ? "border-amber-300 bg-amber-50/50" : "border-emerald-200 bg-emerald-50/30"}`}>
							<CardContent className="p-3">
								<div className="flex items-center justify-between gap-2">
									<h4 className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-foreground"><ClipboardList className="h-3.5 w-3.5 text-primary" /> Status Absensi Tim</h4>
									{closingAttendanceLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
								</div>
								{shiftTimeGate.blocked && <div className="mt-2 flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] font-bold text-amber-800"><Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{shiftTimeGate.message}</span></div>}
								{closingAttendanceError ? <p className="mt-2 text-[11px] font-semibold text-destructive">{closingAttendanceError}</p> : closingAttendanceLoading ? <p className="mt-2 text-[11px] text-muted-foreground">Memuat status absensi...</p> : closingAttendance.length === 0 ? <p className="mt-2 text-[11px] text-muted-foreground">Tidak ada anggota tim yang terdaftar pada shift ini.</p> : <div className="mt-2 space-y-1.5">{closingAttendance.map((member) => { const isActive = member.status === "active"; const isCheckedOut = member.status === "checked_out"; return <div key={`${member.userId}-${member.name}`} className="flex items-center justify-between gap-2 rounded-lg bg-background/70 px-2 py-1.5"><span className="flex min-w-0 items-center gap-1.5 text-[11px] font-semibold"><span className={`h-2 w-2 shrink-0 rounded-full ${isActive ? "bg-amber-500" : isCheckedOut ? "bg-emerald-500" : "bg-muted-foreground/40"}`} /> <span className="truncate">{member.name}</span></span><span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${isActive ? "bg-amber-100 text-amber-800" : isCheckedOut ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"}`}>{isActive ? "Belum Absen Keluar" : isCheckedOut ? "Absen Keluar" : "Belum Absen Masuk"}</span></div>; })}</div>}
								{activeClosingStaff.length > 0 && <div className="mt-2 flex items-start gap-1.5 border-t border-amber-200 pt-2 text-[11px] font-bold text-amber-800"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>Belum bisa tutup kasir. Minta {activeClosingStaff.map((member) => member.name).join(", ")} absen keluar melalui bot Telegram Yumi HRD.</span></div>}
								{!closingAttendanceLoading && !closingAttendanceError && closingAttendance.length > 0 && activeClosingStaff.length === 0 && <p className="mt-2 text-[11px] font-bold text-emerald-700">Semua karyawan yang sudah masuk telah absen keluar. Data tutup kasir dapat dilanjutkan.</p>}
							</CardContent>
						</Card>
						{/* Ringkasan Real-time */}
						<Card className="border-border bg-emerald-50/30 overflow-hidden">
							<CardContent className="p-2.5">
								<div className="flex justify-between items-center mb-1">
									<h4 className="text-[11px] font-black uppercase tracking-widest text-emerald-700 flex items-center gap-1">
										<TrendingUp className="h-2.5 w-2.5" /> Ringkasan Shift Ini
									</h4>
								</div>
								<div className="grid grid-cols-2 gap-2">
									<div className="space-y-0.5">
										<p className="text-[10px] font-bold text-muted-foreground/70 uppercase">Cash (Laci)</p>
										<p className="text-[11px] font-black text-emerald-700">Rp {shiftCash.toLocaleString('id-ID')}</p>
									</div>
									<div className="space-y-0.5 text-right">
										<p className="text-[10px] font-bold text-muted-foreground/70 uppercase">Non-Tunai</p>
										<p className="text-[11px] font-black text-primary">Rp {shiftQris.toLocaleString('id-ID')}</p>
									</div>
								</div>
								<div className="mt-1.5 pt-1.5 border-t border-emerald-100 flex justify-between items-center">
									<p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Saran Setoran:</p>
									<p className="text-[10px] font-black text-foreground">Rp {(((shiftStatus?.ongoingShift?.startingCash ?? 0) + shiftCash - shiftExpense)).toLocaleString('id-ID')}</p>
								</div>
							</CardContent>
						</Card>

						{/* Detail Pengeluaran */}
						{shiftExpense > 0 && (
							<Card className="border-border bg-rose-50/30 overflow-hidden">
								<CardContent className="p-2.5">
									<div className="flex items-center justify-between mb-1">
										<h4 className="text-[11px] font-black uppercase tracking-widest text-rose-700 flex items-center gap-1">
											<TrendingDown className="h-2.5 w-2.5" /> Pengeluaran Shift
										</h4>
										<span className="text-[10px] font-black text-rose-700">Rp {shiftExpense.toLocaleString('id-ID')}</span>
									</div>
									<div className="space-y-1">
										{todayTransactions?.filter((t: any) => t.type === 'expense' && t.status === 'completed' && t.date >= (shiftStatus?.latestMulai || 0)).map((t: any, i: number) => (
											<div key={i} className="flex items-center justify-between text-[10px]">
												<span className="text-muted-foreground">{t.category || "Lainnya"}{t.description ? ` — ${t.description}` : ""}</span>
												<span className="font-semibold text-rose-600">Rp {Number(t.amount).toLocaleString('id-ID')}</span>
											</div>
										))}
									</div>
								</CardContent>
							</Card>
						)}

						{/* ── Pengeluaran Tambahan Saat Tutup Shift ── */}
						<Collapsible className="border border-border/50 rounded-lg overflow-hidden">
							<CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-3 py-2.5 hover:bg-muted/30 transition-colors">
								<div className="flex items-center gap-2">
									<TrendingDown className="h-3.5 w-3.5 text-rose-500" />
									<span className="text-[10px] font-black uppercase tracking-widest text-foreground">Input Pengeluaran</span>
								</div>
								<div className="flex items-center gap-2">
									{endShiftExpenses.length > 0 && (
										<span className="text-[11px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded-full">{endShiftExpenses.length}</span>
									)}
									<ChevronDown className="h-3 w-3 text-muted-foreground" />
								</div>
							</CollapsibleTrigger>
							<CollapsibleContent className="px-3 pb-3 space-y-2.5">
								<p className="text-[11px] text-muted-foreground font-medium">Catat pengeluaran langsung saat tutup shift (token listrik, dll).</p>
								{endShiftExpenses.length === 0 ? (
									<div className="rounded-lg border border-dashed border-border p-4 text-center">
										<p className="text-[10px] text-muted-foreground">Belum ada pengeluaran. Klik "+ Tambah" untuk menambah.</p>
									</div>
								) : (
									<div className="space-y-2">
										{endShiftExpenses.map((exp, idx) => (
											<div key={exp.id} className="rounded-lg border border-border bg-muted/20 p-2.5 space-y-2">
												<div className="flex items-center justify-between">
													<span className="text-[11px] font-bold uppercase text-muted-foreground">Pengeluaran #{idx + 1}</span>
													<button
														type="button"
														onClick={() => setEndShiftExpenses(prev => prev.filter(e => e.id !== exp.id))}
														className="text-[11px] font-bold text-destructive hover:underline"
													>
														Hapus
													</button>
												</div>
												<div className="grid grid-cols-5 gap-1.5">
													<div className="col-span-2 space-y-1">
														<Label className="text-[10px] font-bold uppercase text-muted-foreground">Kategori</Label>
														<select
															className="w-full rounded-md border border-border bg-background px-1.5 py-1.5 text-[10px] font-medium"
															value={exp.category}
															onChange={(ev) => setEndShiftExpenses(prev => prev.map(x => x.id === exp.id ? {...x, category: ev.target.value} : x))}
														>
															<option value="Token Listrik">Token Listrik</option>
															<option value="Bahan Baku">Bahan Baku</option>
															<option value="Operasional">Operasional</option>
															<option value="Lainnya">Lainnya</option>
														</select>
													</div>
													<div className="col-span-1 space-y-1">
														<Label className="text-[10px] font-bold uppercase text-muted-foreground">Jumlah</Label>
														<div className="relative">
															<span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[11px] font-bold text-muted-foreground">Rp</span>
															<input
																type="number"
																min={0}
																placeholder="0"
																className="w-full rounded-md border border-border bg-background pl-6 pr-1.5 py-1.5 text-[10px] font-black text-right"
																value={exp.amount}
																onChange={(ev) => setEndShiftExpenses(prev => prev.map(x => x.id === exp.id ? {...x, amount: ev.target.value} : x))}
															/>
														</div>
													</div>
													<div className="col-span-2 space-y-1">
														<Label className="text-[10px] font-bold uppercase text-muted-foreground">Keterangan</Label>
														<input
															placeholder="Misal: token 200rb..."
															className="w-full rounded-md border border-border bg-background px-1.5 py-1.5 text-[10px] font-medium"
															value={exp.description}
															onChange={(ev) => setEndShiftExpenses(prev => prev.map(x => x.id === exp.id ? {...x, description: ev.target.value} : x))}
														/>
													</div>
												</div>
											</div>
										))}
									</div>
								)}
								<button
									type="button"
									onClick={() => setEndShiftExpenses(prev => [...prev, {id: Date.now(), category: "Token Listrik", amount: "", description: ""}])}
									className="w-full rounded-lg border border-dashed border-border py-2 text-[10px] font-bold text-muted-foreground hover:text-primary hover:border-primary/50 transition-colors flex items-center justify-center gap-1"
								>
									<Plus className="h-3 w-3" /> Tambah Pengeluaran
								</button>
							</CollapsibleContent>
						</Collapsible>

						{/* Pecahan Uang Section */}
						<div className="space-y-1.5">
							<div className="flex items-center justify-between">
								<Label className="text-[11px] font-bold uppercase text-muted-foreground">Pecahan Uang Kertas & Logam</Label>
								<button 
									type="button"
									onClick={handleAutofill}
									className="text-[11px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full hover:bg-primary/20 transition-colors"
								>
									Auto-fill
								</button>
							</div>
							{(() => {
								const billKeys = Object.keys(breakdown).filter(k => Number(k.replace('bill', '')) >= 1000);
								const coinKeys = Object.keys(breakdown).filter(k => Number(k.replace('bill', '')) < 1000);
								return (
									<>
										<div className="space-y-1">
											<p className="text-[10px] font-bold uppercase text-muted-foreground/70">Kertas</p>
											<div className="grid grid-cols-2 gap-1">
												{billKeys.map((val) => (
													<div key={val} className="flex items-center gap-1 group">
														<div className="w-10 text-[11px] font-black text-muted-foreground shrink-0">
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
										<Collapsible className="space-y-1">
											<CollapsibleTrigger className="flex items-center gap-1 text-[10px] font-bold uppercase text-muted-foreground/70 hover:text-muted-foreground transition-colors">
												<ChevronDown className="h-3 w-3" />
												Logam / Koin
											</CollapsibleTrigger>
											<CollapsibleContent>
												<div className="grid grid-cols-2 gap-1 pt-1">
													{coinKeys.map((val) => (
														<div key={val} className="flex items-center gap-1 group">
															<div className="w-10 text-[11px] font-black text-muted-foreground shrink-0">
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
											</CollapsibleContent>
										</Collapsible>
									</>
								);
							})()}
						</div>

						{/* Actual Inputs */}
						<div className="space-y-2 pt-1">
							<div className="space-y-1">
								<Label className="text-[11px] font-bold uppercase text-muted-foreground">Total Uang Fisik (Laci)</Label>
								<div className="relative">
									<span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted-foreground">Rp</span>
									<Input
										className="pl-8 h-9 text-sm font-black tracking-tighter bg-muted/30"
										min={0}
										placeholder="0"
										type="number"
										inputMode="numeric"
										value={cashInRegister}
										onChange={(e) => setCashInRegister(e.target.value)}
									/>
								</div>
								<p className="text-[10px] text-muted-foreground italic font-medium">* Otomatis dari input pecahan</p>
							{/* Selisih Real-time */}
							{cashInRegister && Number(cashInRegister) > 0 && (() => {
								const expected = shiftCash;
								const actual = Number(cashInRegister);
								const diff = actual - expected;
								const isExact = diff === 0;
								const absDiff = Math.abs(diff);
								const statusColor = isExact ? 'text-emerald-600 bg-emerald-50 border-emerald-200' : absDiff > 50000 ? 'text-rose-600 bg-rose-50 border-rose-200' : 'text-amber-600 bg-amber-50 border-amber-200';
								const icon = isExact ? <CheckCircle2 className="h-3 w-3 inline-block" /> : diff > 0 ? <ArrowUpCircle className="h-3 w-3 inline-block" /> : <ArrowDownCircle className="h-3 w-3 inline-block" />;
								const label = isExact ? 'Pas' : diff > 0 ? `Lebih Rp ${absDiff.toLocaleString('id-ID')}` : `Kurang Rp ${absDiff.toLocaleString('id-ID')}`;
								return (
									<div className={`mt-2 flex items-center justify-between rounded-lg border px-3 py-1.5 text-[10px] font-bold ${statusColor}`}>
										<span>Selisih:</span>
										<span>{icon} {label}</span>
									</div>
								);
							})()}
						</div>

							<div className="space-y-1">
								<Label className="text-[11px] font-bold uppercase text-muted-foreground">Konfirmasi QRIS/EDC (Rp)</Label>
								<div className="relative">
									<span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted-foreground">Rp</span>
									<Input
										className="pl-8 h-9 text-sm font-black tracking-tighter border-primary/20"
										min={0}
										onChange={(e) => setNonCashConfirmed(e.target.value)}
										placeholder="Input sesuai EDC/Dashboard"
										type="number"
										inputMode="numeric"
										value={nonCashConfirmed}
									/>
								</div>
								<p className="text-[10px] text-muted-foreground font-medium flex items-center gap-0.5 mt-0.5">
									<AlertCircle className="h-2.5 w-2.5 text-amber-500" /> Total dari dashboard pembayaran (QRIS/EDC)
								</p>
							</div>
						</div>
					</div>
				)}

				<div className="space-y-1 pt-1">
					<Label className="text-[11px] font-bold uppercase text-muted-foreground">Catatan / Kendala Shift</Label>
					<Textarea
						placeholder="Contoh: Selisih uang Rp 2.000, barang rusak..."
						className="text-[11px] resize-none min-h-[48px]"
						value={notes}
						onChange={(e) => setNotes(e.target.value)}
					/>
				</div>

				{submitNotice && (
					<div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-[11px] font-semibold text-amber-800">
						{submitNotice}
					</div>
				)}
				{submitError && (
					<div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-[11px] font-medium text-destructive">
						{submitError}
					</div>
				)}

				<Button
					className={`w-full h-9 font-black uppercase tracking-widest text-[11px] shadow-lg transition-all active:scale-95 ${shiftType === 'mulai' ? 'bg-primary hover:bg-primary/90' : shiftTimeGate.blocked ? 'bg-amber-500 hover:bg-amber-500 cursor-not-allowed' : 'bg-destructive hover:bg-destructive/90'}`}
					disabled={shiftType === "akhiri" ? isSubmitting || closingAttendanceLoading || Boolean(closingAttendanceError) || activeClosingStaff.length > 0 || shiftTimeGate.blocked : isSubmitting}
					type={shiftType === 'mulai' ? 'submit' : 'button'}
					onClick={shiftType === 'akhiri' ? () => setShowEndConfirm(true) : undefined}
				>
					{isSubmitting ? (
						<Loader2 className="mr-2 h-3 w-3 animate-spin text-white" />
					) : (
						shiftType === "mulai" ? <div className="flex items-center gap-1.5"><SquarePlay className="h-3.5 w-3.5" /> Buka Shift</div> : shiftTimeGate.blocked ? <div className="flex items-center justify-center gap-1.5"><Clock className="h-3.5 w-3.5" /> Tunggu sampai {selectedShiftSchedule?.closeTime} WIB</div> : <div className="flex items-center gap-1.5"><SquarePower className="h-3.5 w-3.5" /> Akhiri & Kirim Laporan</div>
					)}
				</Button>
			</form>

			{/* Checklist aktivasi online food */}
			<Dialog open={showStartChecklist} onOpenChange={(open) => { if (!isSubmitting) setShowStartChecklist(open); }}>
				<DialogContent className="max-w-md rounded-2xl">
					<DialogHeader>
						<DialogTitle className="flex items-center gap-2 text-sm font-black uppercase tracking-tight">
							<CreditCard className="h-4 w-4 text-primary" />
							Checklist Online Food
						</DialogTitle>
					</DialogHeader>
					<div className="space-y-2 text-xs">
						<div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-[11px] text-muted-foreground">
							Buka aplikasi merchant masing-masing, pastikan siap menerima pesanan, lalu pilih statusnya. Jangan masukkan password atau data login ke sini.
						</div>
						{ONLINE_FOOD_PLATFORMS.map(({ key, label }) => {
							const item = onlineFoodChecklist[key];
							const isProblem = item.status === "problem";
							return (
								<div key={key} className={`rounded-xl border p-3 space-y-2 ${item.status === "active" ? "border-emerald-200 bg-emerald-50/50" : isProblem ? "border-amber-200 bg-amber-50/60" : "border-border bg-background"}`}>
									<div className="flex items-center justify-between gap-2">
										<div className="flex items-center gap-2 font-black"><span className={`h-2 w-2 rounded-full ${item.status === "active" ? "bg-emerald-500" : isProblem ? "bg-amber-500" : item.status === "not_used" ? "bg-muted-foreground/50" : "bg-muted-foreground/30"}`} />{label}</div>
										{item.status === "active" && <span className="text-[10px] font-bold text-emerald-700">Siap menerima order</span>}
									</div>
									<select
										className="h-9 w-full rounded-md border border-border bg-background px-2 text-xs font-semibold"
										value={item.status}
										onChange={(event) => setOnlineFoodChecklist((current) => ({ ...current, [key]: { ...current[key], status: event.target.value as OnlineFoodStatus } }))}
									>
										{ONLINE_FOOD_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
									</select>
									{isProblem && <Input className="h-9 text-xs" placeholder="Contoh: aplikasi logout / printer offline" value={item.note} onChange={(event) => setOnlineFoodChecklist((current) => ({ ...current, [key]: { ...current[key], note: event.target.value } }))} />}
								</div>
							);
						})}
						{onlineFoodChecklist && !ONLINE_FOOD_PLATFORMS.every(({ key }) => onlineFoodChecklist[key].status !== "pending") && <p className="text-[11px] font-semibold text-amber-700">Semua platform harus diberi status sebelum kasir dibuka.</p>}
						{submitError && <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-destructive">{submitError}</div>}
						{isSubmitting && <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 font-semibold"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Menyimpan shift, modal, dan checklist...</div>}
					</div>
					<div className="flex gap-2">
						<Button type="button" variant="outline" className="flex-1 h-9 text-xs font-bold" disabled={isSubmitting} onClick={() => { setShowStartChecklist(false); setShowStartConfirm(true); }}>Kembali</Button>
						<Button type="button" className="flex-1 h-9 text-xs font-bold" disabled={isSubmitting || !ONLINE_FOOD_PLATFORMS.every(({ key }) => onlineFoodChecklist[key].status !== "pending")} onClick={confirmStartShift}>
							{isSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
							{isSubmitting ? "Menyimpan..." : "Buka Kasir & Kirim Notifikasi"}
						</Button>
					</div>
				</DialogContent>
			</Dialog>

			{/* Preview & konfirmasi buka shift */}
			<Dialog open={showStartConfirm} onOpenChange={(open) => { if (!isSubmitting) setShowStartConfirm(open); }}>
				<DialogContent className="max-w-sm rounded-2xl">
					<DialogHeader>
						<DialogTitle className="flex items-center gap-2 text-sm font-black uppercase tracking-tight">
							<Wallet className="h-4 w-4 text-primary" />
							Konfirmasi Buka Kasir
						</DialogTitle>
					</DialogHeader>
					<div className="space-y-3 text-xs">
						<div className="rounded-xl border bg-muted/30 p-3 space-y-2">
							<div className="flex justify-between gap-3"><span className="text-muted-foreground">Kasir</span><span className="font-bold text-right">{cashierName || "-"}</span></div>
							<div className="flex justify-between gap-3"><span className="text-muted-foreground">Shift</span><span className="font-bold text-right">{shiftName || "-"}</span></div>
							{selectedShiftSchedule?.openTime && selectedShiftSchedule?.closeTime && <div className="flex justify-between gap-3"><span className="text-muted-foreground">Jadwal</span><span className="font-bold text-right">{selectedShiftSchedule.openTime}–{selectedShiftSchedule.closeTime} WIB</span></div>}
							<div className="flex justify-between gap-3 border-t pt-2"><span className="flex items-center gap-1 text-muted-foreground"><Banknote className="h-3.5 w-3.5" /> Modal awal</span><span className="font-black text-primary">Rp {Number(amount || 0).toLocaleString("id-ID")}</span></div>
						</div>
						<div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-[11px] text-muted-foreground">
							Shift dan transaksi <span className="font-bold text-foreground">Modal Awal</span> akan disimpan atomically. Jika koneksi timeout, jangan klik ulang dengan membuka form baru—request ini aman untuk dicoba ulang.
						</div>
						{isSubmitting && <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 font-semibold"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Menyimpan shift dan mencatat modal...</div>}
						{submitError && <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-destructive">{submitError}</div>}
					</div>
					<div className="flex gap-2">
						<Button type="button" variant="outline" className="flex-1 h-9 text-xs font-bold" disabled={isSubmitting} onClick={() => setShowStartConfirm(false)}>Kembali</Button>
						<Button type="button" className="flex-1 h-9 text-xs font-bold" onClick={() => { setShowStartConfirm(false); setShowStartChecklist(true); }}>
							<ArrowDownCircle className="h-3.5 w-3.5" />
							Lanjut Checklist Online Food
						</Button>
					</div>
				</DialogContent>
			</Dialog>

			{/* Konfirmasi Akhiri Shift */}
			<Dialog open={showEndConfirm} onOpenChange={setShowEndConfirm}>
				<DialogContent className="max-w-sm">
					<DialogHeader>
						<DialogTitle className="text-sm font-black uppercase tracking-tight">Konfirmasi Tutup Shift</DialogTitle>
					</DialogHeader>
					<div className="space-y-2 text-sm">
						<div className="rounded-xl bg-muted/30 p-3 space-y-1.5 text-xs">
							<div className="flex justify-between"><span className="text-muted-foreground">Shift</span><span className="font-bold">{shiftName || shiftStatus?.shiftInfo?.shiftName}</span></div>
							<div className="flex justify-between"><span className="text-muted-foreground">Kasir</span><span className="font-bold">{cashierName || shiftStatus?.shiftInfo?.cashierName}</span></div>
							<div className="flex justify-between"><span className="flex items-center gap-1 text-muted-foreground"><Banknote aria-hidden="true" className="h-3.5 w-3.5" /> Uang Fisik</span><span className="font-bold">Rp {Number(cashInRegister || 0).toLocaleString('id-ID')}</span></div>
							<div className="flex justify-between"><span className="flex items-center gap-1 text-muted-foreground"><CreditCard aria-hidden="true" className="h-3.5 w-3.5" /> QRIS/EDC</span><span className="font-bold">Rp {Number(nonCashConfirmed || 0).toLocaleString('id-ID')}</span></div>
							{(() => {
								const expected = shiftCash;
								const actual = Number(cashInRegister || 0);
								const diff = actual - expected;
								return (
									<div className={`flex justify-between ${diff === 0 ? 'text-emerald-600' : diff > 0 ? 'text-amber-600' : 'text-rose-600'}`}>
										<span className="flex items-center gap-1"><BarChart3 aria-hidden="true" className="h-3.5 w-3.5" /> Selisih</span>
										<span className="flex items-center gap-1 font-black">{diff === 0 ? <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5" /> : diff > 0 ? <ArrowUpCircle aria-hidden="true" className="h-3.5 w-3.5" /> : <ArrowDownCircle aria-hidden="true" className="h-3.5 w-3.5" />}{diff === 0 ? 'Pas' : diff > 0 ? `+ Rp ${diff.toLocaleString('id-ID')}` : `- Rp ${Math.abs(diff).toLocaleString('id-ID')}`}</span>
									</div>
								);
							})()}
							{shiftExpense > 0 && <div className="flex justify-between"><span className="flex items-center gap-1 text-muted-foreground"><TrendingDown aria-hidden="true" className="h-3.5 w-3.5" /> Pengeluaran</span><span className="font-bold text-rose-600">-Rp {shiftExpense.toLocaleString('id-ID')}</span></div>}
							{notes && <div className="border-t border-border pt-1.5 mt-1.5"><span className="flex items-center gap-1 text-muted-foreground"><FileText aria-hidden="true" className="h-3.5 w-3.5" /> Catatan:</span><p className="font-medium mt-0.5">{notes}</p></div>}
						</div>
					</div>
					<div className="flex gap-2">
						<Button variant="outline" size="sm" className="flex-1 h-9 text-xs font-bold" onClick={() => setShowEndConfirm(false)}>Kembali</Button>
						<Button variant="destructive" size="sm" className="flex-1 h-9 text-xs font-bold" disabled={isSubmitting} onClick={handleEndShift}>
							{isSubmitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle aria-hidden="true" className="h-3.5 w-3.5" />}
							Akhiri Shift
						</Button>
					</div>
				</DialogContent>
			</Dialog>
			<div className="h-6 shrink-0" />
		</div>
	);
}

function IncomeForm({ onClose }: { onClose: () => void }) {
	const createTransaction = useHybridCreateTransaction();
	const [amount, setAmount] = useState("");
	const [category, setCategory] = useState("Shift Pagi");
	const [description, setDescription] = useState("");
	const [paymentMethod, setPaymentMethod] = useState("tunai");
	const [merchant, setMerchant] = useState("");
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
				merchant: merchant || undefined,
				date: Date.now(),
				status: "completed",
				paymentMethod: paymentMethod || "tunai",
			});
			toast.success("Pemasukan berhasil dicatat");
			setAmount("");
			setDescription("");
			setPaymentMethod("tunai");
			setMerchant("");
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
						inputMode="numeric"
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

				{/* ── Metode Bayar & Merchant ── */}
				<div className="grid grid-cols-2 gap-2">
					<div className="space-y-1.5">
						<Label className="text-[10px] font-bold uppercase text-muted-foreground">Metode Bayar</Label>
						<select
							className="w-full rounded-lg border border-border bg-background px-2 py-2 text-xs"
							value={paymentMethod}
							onChange={(e) => setPaymentMethod(e.target.value)}
						>
							<option value="tunai">Tunai</option>
							<option value="QRIS">QRIS</option>
							<option value="BANK_TRANSFER">Transfer Bank</option>
							<option value="CREDIT_CARD">Kartu Kredit</option>
						</select>
					</div>
					<div className="space-y-1.5">
						<Label className="text-[10px] font-bold uppercase text-muted-foreground">Merchant / Sumber</Label>
						<Input
							placeholder="Misal: Pelanggan, Katering..."
							value={merchant}
							onChange={(e) => setMerchant(e.target.value)}
						/>
					</div>
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
	const recordExpenseIntake = useHybridRecordExpenseIntake();
	const syncMenuStock = useHybridSyncMenuStockFromInventory();
	const inventory = useHybridInventory();
	const [amount, setAmount] = useState("");
	const [category, setCategory] = useState("Bahan Baku");
	const [description, setDescription] = useState("");
	const [paymentMethod, setPaymentMethod] = useState("tunai");
	const [merchant, setMerchant] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [itemName, setItemName] = useState("");
	const [itemQty, setItemQty] = useState("1");
	const [itemUnit, setItemUnit] = useState("");
	const [allowNewInventoryItem, setAllowNewInventoryItem] = useState(false);
	const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
	const [isItemDropdownOpen, setIsItemDropdownOpen] = useState(false);
	const [aiParsing, setAiParsing] = useState(false);
	const [aiBantuUsed, setAiBantuUsed] = useState(false);

	// Detect apakah deskripsi sudah dalam format terstruktur (ada separator "—" + payment method)
	const isStructuredDescription = useMemo(() => {
		const text = description?.trim() || "";
		if (!text || text.length < 5) return false;
		const STRUCTURED_RE = /(?:—|--|–|-)\s*(?:QRIS|Tunai|Transfer|Bank|Cash|Cashless|Kartu|Debit|Gopay|Ovo|Dana)/i;
		return STRUCTURED_RE.test(text);
	}, [description]);

	// Wajib pakai AI Bantu kalau deskripsi free-text & belum pernah diklik
	const needsAiBantu = description?.trim().length >= 5 && !isStructuredDescription && !aiBantuUsed;

	const inventoryItems = useMemo(() => inventory ?? [], [inventory]);
	const selectedInventoryItem = useMemo(() => {
		const normalizedName = itemName.trim().toLowerCase();
		if (!normalizedName) return null;
		return (
			inventoryItems.find(
				(item: any) => String(item?.ingredientName || "").trim().toLowerCase() === normalizedName
			) ?? null
		);
	}, [inventoryItems, itemName]);
	const categoryOptions = useMemo(() => {
		const values = new Set(["Bahan Baku", "Belanja Stok", "Operasional", "Lainnya"]);
		for (const item of inventoryItems as any[]) {
			const inventoryCategory =
				item?.category ||
				item?.itemCategory ||
				item?.group ||
				item?.type ||
				item?.raw?.category;
			if (inventoryCategory) values.add(String(inventoryCategory));
		}
		return Array.from(values).filter(Boolean).sort((a, b) => a.localeCompare(b, "id"));
	}, [inventoryItems]);
	const filteredCategoryOptions = useMemo(() => {
		const query = category.trim().toLowerCase();
		return categoryOptions
			.filter((option) => !query || option.toLowerCase().includes(query))
			.slice(0, 8);
	}, [category, categoryOptions]);
	const filteredInventoryItems = useMemo(() => {
		const query = itemName.trim().toLowerCase();
		return inventoryItems
			.filter((item: any) => {
				const name = String(item?.ingredientName || "").toLowerCase();
				const unit = String(item?.unit || "").toLowerCase();
				const categoryName = String(item?.category || item?.itemCategory || item?.group || item?.type || "").toLowerCase();
				return !query || name.includes(query) || unit.includes(query) || categoryName.includes(query);
			})
			.slice(0, 10);
	}, [inventoryItems, itemName]);

	const handleItemNameChange = (value: string) => {
		setItemName(value);
		const matched = inventoryItems.find(
			(item: any) => String(item?.ingredientName || "").trim().toLowerCase() === value.trim().toLowerCase()
		) as any | undefined;
		if (matched?.unit) {
			setItemUnit(String(matched.unit));
		}
		if (matched) {
			setAllowNewInventoryItem(false);
		}
		setIsItemDropdownOpen(true);
	};
	const selectInventoryItem = (item: any) => {
		setItemName(String(item?.ingredientName || ""));
		setItemUnit(String(item?.unit || ""));
		setAllowNewInventoryItem(false);
		setIsItemDropdownOpen(false);
	};

	const handleAiParse = async () => {
		const textToParse = (description || amount)?.trim();
		if (!textToParse || textToParse.length < 5) {
			toast.warning("Ketik deskripsi dulu (min 5 karakter)");
			return;
		}
		setAiParsing(true);
		setAiBantuUsed(false); // reset dulu, nanti di-set true kalau sukses
		try {
			const res = await fetch("http://localhost:8002/ai-parse-text", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ text: textToParse }),
			});
			const data = await res.json();
			if (!data.ok) throw new Error(data.error || "AI parsing gagal");

			if (data.category) setCategory(data.category);
			if (data.merchant) setMerchant(data.merchant);
			if (data.payment_method && !["CASH", "cash", "tunai"].includes(data.payment_method)) {
				setPaymentMethod(data.payment_method.toLowerCase());
			}
			if (data.description && data.description !== description) {
				setDescription(data.description);
			}
			if (data.items && data.items.length > 0) {
				const firstItem = data.items[0];
				setItemName(firstItem.name || "");
				setItemQty(String(firstItem.qty || 1));
				setItemUnit(firstItem.unit || "");
			}
			toast.success(`AI: ${data.reply || "Form terisi"}`);
			setAiBantuUsed(true); // AI Bantu berhasil — unlock submit
		} catch (err: any) {
			toast.error(err.message || "Gagal hubungi AI");
		} finally {
			setAiParsing(false);
		}
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();

		// Wajib klik AI Bantu dulu kalau deskripsi free-text
		if (needsAiBantu) {
			toast.error("Ketik deskripsi dengan format '— QRIS — Toko' atau klik AI Bantu untuk parsing otomatis");
			return;
		}

		const numericAmount = Number(amount);
		if (!amount || !Number.isFinite(numericAmount) || numericAmount <= 0) {
			toast.error("Jumlah pengeluaran harus lebih dari Rp 0");
			return;
		}

		const hasItem = itemName.trim().length > 0;
		if (hasItem && !selectedInventoryItem && !allowNewInventoryItem) {
			toast.error("Pilih item dari database inventory, atau centang 'item baru' jika memang belum ada.");
			return;
		}

		setIsSubmitting(true);
		try {
			const quantity = Number(itemQty) || 1;
			const normalizedItemName = selectedInventoryItem?.ingredientName || itemName.trim();
			const normalizedUnit = itemUnit.trim() || selectedInventoryItem?.unit || undefined;
			const items = hasItem
				? [
						{
							name: normalizedItemName,
							quantity,
							unit: normalizedUnit,
							price: numericAmount / quantity,
							total: numericAmount,
						},
				  ]
				: [];

			await recordExpenseIntake({
				source: "pos_menu_sidebar",
				syncMode: hasItem ? "finance_plus_inventory" : "finance_only",
				allowCreateInventoryItem: allowNewInventoryItem,
				transaction: {
					type: "expense",
					amount: numericAmount,
					category,
					description: description || normalizedItemName,
					merchant: merchant || undefined,
					date: Date.now(),
					status: "completed",
					paymentMethod: paymentMethod || "tunai",
				},
				items: items.length > 0 ? items : undefined,
				metadata: {
					inputMode: "pos_menu_sidebar_expense",
					sourceLabel: "Menu Kas",
					inventoryItemId: selectedInventoryItem?._id,
					allowNewInventoryItem,
				},
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
		setAllowNewInventoryItem(false);
		setPaymentMethod("tunai");
		setMerchant("");
		setAiBantuUsed(false);
		onClose();
		} catch (error: any) {
			console.error(error);
			toast.error(error?.message || "Gagal mencatat pengeluaran");
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
					<div className="relative">
						<Input
							placeholder="Ketik untuk cari kategori..."
							value={category}
							onBlur={() => setTimeout(() => setIsCategoryDropdownOpen(false), 120)}
							onChange={(e) => {
								setCategory(e.target.value);
								setIsCategoryDropdownOpen(true);
							}}
							onFocus={() => setIsCategoryDropdownOpen(true)}
							required
						/>
						{isCategoryDropdownOpen && filteredCategoryOptions.length > 0 && (
							<div className="absolute z-50 mt-1 max-h-44 w-full overflow-auto rounded-md border bg-background p-1 shadow-lg">
								{filteredCategoryOptions.map((option) => (
									<button
										className="flex w-full items-center rounded-sm px-2 py-1.5 text-left text-xs hover:bg-muted"
										key={option}
										onMouseDown={(event) => {
											event.preventDefault();
											setCategory(option);
											setIsCategoryDropdownOpen(false);
										}}
										type="button"
									>
										{option}
									</button>
								))}
							</div>
						)}
					</div>
					<p className="text-[10px] text-muted-foreground">
						Dropdown muncul saat mengetik. Untuk restok otomatis pakai kategori bahan/stok.
					</p>
				</div>

				{/* ── Metode Bayar & Merchant ── */}
				<div className="grid grid-cols-2 gap-2">
					<div className="space-y-1.5">
						<Label className="text-[10px] font-bold uppercase text-muted-foreground">Metode Bayar</Label>
						<select
							className="w-full rounded-lg border border-border bg-background px-2 py-2 text-xs"
							value={paymentMethod}
							onChange={(e) => setPaymentMethod(e.target.value)}
						>
							<option value="tunai">Tunai</option>
							<option value="QRIS">QRIS</option>
							<option value="BANK_TRANSFER">Transfer Bank</option>
							<option value="CREDIT_CARD">Kartu Kredit</option>
						</select>
					</div>
					<div className="space-y-1.5">
						<Label className="text-[10px] font-bold uppercase text-muted-foreground">Merchant / Toko</Label>
						<Input
							placeholder="Misal: Yogya, Plaza Asia..."
							value={merchant}
							onChange={(e) => setMerchant(e.target.value)}
						/>
					</div>
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
						inputMode="numeric"
						value={amount}
					/>
				</div>

				{/* ── Item (untuk restok inventory) ── */}
				<div className="rounded-lg border border-border/50 bg-muted/30 p-3 space-y-3">
					<div className="flex items-center gap-2">
						<Package className="h-3.5 w-3.5 text-muted-foreground" />
						<span className="text-xs font-medium text-muted-foreground">
							Item Belanja (search inventory untuk auto-restok stok)
						</span>
					</div>
					<div className="grid grid-cols-3 gap-2">
						<div className="relative col-span-3">
							<Input
								placeholder="Ketik untuk cari item inventory..."
								value={itemName}
								onBlur={() => setTimeout(() => setIsItemDropdownOpen(false), 120)}
								onChange={(e) => handleItemNameChange(e.target.value)}
								onFocus={() => setIsItemDropdownOpen(true)}
							/>
							{isItemDropdownOpen && filteredInventoryItems.length > 0 && (
								<div className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-md border bg-background p-1 shadow-lg">
									{filteredInventoryItems.map((item: any) => (
										<button
											className="flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-muted"
											key={String(item._id)}
											onMouseDown={(event) => {
												event.preventDefault();
												selectInventoryItem(item);
											}}
											type="button"
										>
											<span className="truncate font-medium">{String(item.ingredientName || "")}</span>
											<span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
												{String(item.unit || "pcs")}
											</span>
										</button>
									))}
								</div>
							)}
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
					{itemName.trim() && !selectedInventoryItem && (
						<label className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-2 text-[10px] text-amber-800">
							<Checkbox
								checked={allowNewInventoryItem}
								onCheckedChange={(checked) => setAllowNewInventoryItem(Boolean(checked))}
							/>
							<span>
								Item belum ada di database inventory. Centang hanya jika ingin membuat item inventory baru.
							</span>
						</label>
					)}
					{itemName.trim() && (
						<div className={`text-[10px] font-medium ${selectedInventoryItem || allowNewInventoryItem ? "text-emerald-600" : "text-amber-700"}`}>
							{selectedInventoryItem || allowNewInventoryItem
								? `Stok akan otomatis bertambah +${Number(itemQty) || 1} ${itemUnit.trim() || selectedInventoryItem?.unit || "pcs"} "${selectedInventoryItem?.ingredientName || itemName.trim()}"`
								: "Pilih item inventory yang sudah ada sebelum menyimpan."}
						</div>
					)}
				</div>

				<div className="space-y-2">
					<div className="flex items-center justify-between">
						<Label>Keterangan</Label>
						<button
							type="button"
							onClick={handleAiParse}
							disabled={aiParsing || !((description || amount)?.trim().length >= 5)}
							className="inline-flex items-center gap-1 rounded-md bg-gradient-to-r from-purple-500 to-indigo-500 px-2 py-1 text-[10px] font-bold text-white shadow-xs transition-all hover:from-purple-600 hover:to-indigo-600 disabled:opacity-40"
						>
							{aiParsing ? (
								<><Loader2 className="h-3 w-3 animate-spin" /> Memproses...</>
							) : (
								<><Sparkles className="h-3 w-3" /> AI Bantu</>
							)}
						</button>
					</div>
					<Textarea
						onChange={(e) => {
							setDescription(e.target.value);
							if (aiBantuUsed) setAiBantuUsed(false);
						}}
						placeholder="Rincian belanja..."
						required
						value={description}
					/>
				</div>

					{/* ── Warning: wajib pakai AI Bantu ── */}
					{needsAiBantu && (
						<div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
							<AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
							<span>
								Deskripsi belum terstruktur. Klik <strong>AI Bantu</strong> di atas untuk isi otomatis kategori, merchant &amp; metode bayar. Atau gunakan format: <code>"— QRIS — Toko"</code>
							</span>
						</div>
					)}

				<Button
					className="w-full"
					disabled={isSubmitting || needsAiBantu || (itemName.trim().length > 0 && !selectedInventoryItem && !allowNewInventoryItem)}
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
						{menuProductsWithoutRecipe.length} menu belum punya recipe
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
								<span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive font-bold text-[11px] text-destructive-foreground">
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









