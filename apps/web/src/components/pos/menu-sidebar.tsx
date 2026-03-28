import { api } from "@yumipos/backend/convex/_generated/api";
import type { Doc, Id } from "@yumipos/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import {
	AlertCircle,
	Banknote,
	BarChart3,
	Bot,
	ClipboardList,
	Clock,
	CreditCard,
	Loader2,
	type LucideIcon,
	Menu,
	Minus,
	Package,
	Pencil,
	Plus,
	Printer,
	Save,
	Settings2,
	ShoppingCart,
	Sparkles,
	SquarePlay,
	Trash2,
	TrendingDown,
	TrendingUp,
	Wallet,
	X,
} from "lucide-react";
import { useCallback, useEffect, useState, useMemo } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { YumiAIChat } from "@/components/pos/yumi-ai-chat";
import { bluetoothPrinter } from "@/lib/bluetooth-printer";
import { useCart } from "@/context/cart-context";

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
		{ value: "kas", label: "Kas", icon: Wallet, iconColor: "text-primary" },
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
		if (initialTab) {
			setActiveTab(initialTab);
		}
	}, [initialTab]);

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

	const lowStockItems = useQuery(api.inventory.getLowStockItems);
	const lowStockCount = lowStockItems?.length || 0;

	const updateOrder = useMutation(api.orders.updateOrder);
	const deleteOrder = useMutation(api.orders.deleteOrder);
	const createOrder = useMutation(api.orders.createOrder);
	const { items, totalAmount, clearCart, appliedVoucher, discountAmount, customerInfo } = useCart();
	const shiftStatus = useQuery(api.finance.getShiftStatus);
	const isShiftOpen = shiftStatus?.isOpen ?? false;

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
				})),
				totalAmount,
				paymentMethod: "cash",
				customerName: data.customerName || customerInfo.name,
				tableNumber: data.tableNumber || customerInfo.tableNumber,
				notes: data.notes || customerInfo.notes,
				orderType: customerInfo.orderType,
				voucherId: appliedVoucher?._id as Id<"discounts"> | undefined,
				discountAmount,
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
	const allDiscounts = useQuery(api.discounts.getActiveDiscounts);

	const handleRestoreOrder = async (order: Doc<"orders">) => {
		try {
			const cartItems = order.items.map((i: any) => ({
				productId: i.productId,
				name: i.productName,
				variant: i.variant,
				quantity: i.quantity,
				price: i.price,
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
						<div className="flex-1 overflow-y-auto p-4 bg-background">
							{activeTab === "dashboard" && (
								<DashboardTab
									onClose={() => setIsOpen(false)}
									onNavigate={setActiveTab}
									onSelectOrder={setSelectedOrder}
									onParkOrder={() => setIsParkDialogOpen(true)}
								/>
							)}
							{activeTab === "parkir" && (
								<ParkirTab
									onClose={() => setIsOpen(false)}
									onRestore={handleRestoreOrder}
								/>
							)}
							{activeTab === "history" && (
								<HistoryTab
									onSelectOrder={setSelectedOrder}
								/>
							)}
							{activeTab === "kas" && (
								<KasTab onClose={() => setIsOpen(false)} />
							)}
							{activeTab === "stok" && (
								<StokTab setConfirmConfig={setConfirmConfig} />
							)}
							{activeTab === "yumi" && (
								<div className="-mx-4 -mt-4 h-[calc(100%+2rem)]">
									<YumiAIChat />
								</div>
							)}
							{activeTab === "settings" && (
								<SettingsTab onClose={() => setIsOpen(false)} />
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
}: {
	order: Doc<"orders">;
	isEditMode: boolean;
	onEdit: () => void;
	onDelete: () => void;
	onSave: (data: any) => void;
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
}: {
	onClose: () => void;
	onNavigate: (tab: string) => void;
	onSelectOrder: (order: Doc<"orders">) => void;
	onParkOrder: () => void;
}) {
	const orders = useQuery(api.orders.getOrders, {});
	const lowStockItems = useQuery(api.inventory.getLowStockItems);
	const [showShiftManagement, setShowShiftManagement] = useState(false);

	const today = new Date();
	today.setHours(0, 0, 0, 0);

	const financialSummary = useQuery(api.finance.getFinancialSummary, {
		startDate: today.getTime(),
	});

	const shiftStatus = useQuery(api.finance.getShiftStatus);
	const isShiftOpen = shiftStatus?.isOpen ?? false;

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

	if (showShiftManagement) {
		return (
			<div className="space-y-4">
				<Button 
					variant="ghost" 
					size="sm" 
					onClick={() => setShowShiftManagement(false)}
					className="h-8 px-2 text-muted-foreground hover:text-foreground"
				>
					<X className="mr-2 h-4 w-4" />
					Kembali ke Dashboard
				</Button>
				<ShiftManagement onClose={() => setShowShiftManagement(false)} />
			</div>
		);
	}

	return (
		<div className="space-y-3">
			<div className="flex items-center justify-between">
				<span className="font-semibold text-foreground text-sm">{todayLabel}</span>
				<span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">Live</span>
			</div>

			{/* Shift Status Card */}
			<Card className="border-border bg-muted/30 overflow-hidden">
				<div className="flex items-center justify-between p-3">
					<div className="flex items-center gap-3">
						<div className={`p-2 rounded-full ${isShiftOpen ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
							<SquarePlay className="h-4 w-4" />
						</div>
						<div>
							<p className="font-bold text-sm">Status Shift</p>
							<p className="text-[10px] text-muted-foreground uppercase">{isShiftOpen ? "Aktif (Sedang Berjalan)" : "Tutup (Belum Mulai)"}</p>
						</div>
					</div>
					<Button 
						size="sm" 
						variant={isShiftOpen ? "outline" : "default"}
						onClick={() => setShowShiftManagement(true)}
						className="text-xs h-8"
					>
						{isShiftOpen ? "Tutup Shift" : "Buka Shift"}
					</Button>
				</div>
			</Card>

			<div className="grid grid-cols-3 gap-2">
				<Card className="border-primary/20 bg-primary/5">
					<CardContent className="p-3 text-center">
						<TrendingUp className="mx-auto mb-1 h-4 w-4 text-primary" />
						<p className="text-[9px] text-primary/70 uppercase tracking-tight">
							Pemasukan
						</p>
						<p className="font-bold text-primary text-sm">
							{formatCurrency(income)}
						</p>
					</CardContent>
				</Card>
				<Card className="border-destructive/20 bg-destructive/5">
					<CardContent className="p-3 text-center">
						<TrendingDown className="mx-auto mb-1 h-4 w-4 text-destructive" />
						<p className="text-[9px] text-destructive/70 uppercase tracking-tight">
							Pengeluaran
						</p>
						<p className="font-bold text-destructive text-sm">
							{formatCurrency(expense)}
						</p>
					</CardContent>
				</Card>
				<Card className="border-accent/20 bg-accent/5">
					<CardContent className="p-3 text-center">
						<Banknote className="mx-auto mb-1 h-4 w-4 text-accent" />
						<p className="text-[9px] text-accent/70 uppercase tracking-tight">
							Kas Bersih
						</p>
						<p
							className={`font-bold text-sm ${balance >= 0 ? "text-primary" : "text-destructive"}`}
						>
							{formatCurrency(balance)}
						</p>
					</CardContent>
				</Card>
			</div>

			<div className="grid grid-cols-2 gap-2">
				<Card className="border-border bg-muted/30">
					<CardContent className="p-3 text-center">
						<ClipboardList className="mx-auto mb-1 h-4 w-4 text-muted-foreground" />
						<p className="font-bold text-foreground text-lg">
							{todayOrders.length}
						</p>
						<p className="text-[9px] text-muted-foreground uppercase">
							Pesanan Hari Ini
						</p>
					</CardContent>
				</Card>
				<Card className="border-border bg-muted/30">
					<CardContent className="p-3 text-center">
						<Wallet className="mx-auto mb-1 h-4 w-4 text-muted-foreground" />
						<p className="font-bold text-foreground text-lg">
							{formatCurrency(totalSales)}
						</p>
						<p className="text-[9px] text-muted-foreground uppercase">
							Total Penjualan
						</p>
					</CardContent>
				</Card>
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
					<span className="text-[10px] text-muted-foreground">5 terbaru</span>
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

			<div className="space-y-2">
				<h3 className="font-bold text-sm">Aksi Cepat</h3>
				<div className="grid grid-cols-2 gap-2">
					<Button
						className="h-auto flex-col gap-1 py-3"
						onClick={() => onNavigate("kas")}
						variant="outline"
					>
						<SquarePlay className="h-4 w-4" />
						<span className="text-[10px]">Mulai Shift</span>
					</Button>
					<Button
						className="h-auto flex-col gap-1 py-3"
						onClick={onParkOrder}
						variant="outline"
					>
						<Clock className="h-4 w-4" />
						<span className="text-[10px]">Tunda Order</span>
					</Button>
				</div>
			</div>

			<div className="h-6" />
		</div>
	);
}

function ParkirTab({
	onClose,
	onRestore,
}: {
	onClose: () => void;
	onRestore: (order: Doc<"orders">) => void;
}) {
	const orders = useQuery(api.orders.getOrders, { status: "pending" });

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
									<Button
										className="h-8 rounded-lg bg-orange-500 px-3 text-[10px] font-bold uppercase tracking-wider text-white shadow-sm hover:bg-orange-600 active:scale-95"
										onClick={() => onRestore(order)}
										size="sm"
									>
										Pulihkan Order
									</Button>
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
	const orders = useQuery(api.orders.getOrders, {});
	
	const [timeFilter, setTimeFilter] = useState("today"); // today, yesterday, this_week, last_week, this_month, last_month
	const [sortOrder, setSortOrder] = useState("desc"); // desc, asc

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

	const filteredOrders = useMemo(() => {
		if (!orders) return [];

		let filtered = [...orders];
		const now = new Date();
		const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
		const yesterdayStart = todayStart - 86400000;
		const currentDayOfWeek = now.getDay() || 7; // Make Sunday 7
		const thisWeekStart = todayStart - (currentDayOfWeek - 1) * 86400000;
		const lastWeekStart = thisWeekStart - 7 * 86400000;
		const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
		const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();

		switch (timeFilter) {
			case "today":
				filtered = filtered.filter((o) => o.createdAt >= todayStart);
				break;
			case "yesterday":
				filtered = filtered.filter((o) => o.createdAt >= yesterdayStart && o.createdAt < todayStart);
				break;
			case "this_week":
				filtered = filtered.filter((o) => o.createdAt >= thisWeekStart);
				break;
			case "last_week":
				filtered = filtered.filter((o) => o.createdAt >= lastWeekStart && o.createdAt < thisWeekStart);
				break;
			case "this_month":
				filtered = filtered.filter((o) => o.createdAt >= thisMonthStart);
				break;
			case "last_month":
				filtered = filtered.filter((o) => o.createdAt >= lastMonthStart && o.createdAt < thisMonthStart);
				break;
		}

		filtered.sort((a, b) => {
			if (sortOrder === "asc") return a.createdAt - b.createdAt;
			return b.createdAt - a.createdAt; // desc
		});

		return filtered;
	}, [orders, timeFilter, sortOrder]);

	return (
		<div className="space-y-4 pt-2">
			<div className="space-y-2 text-center">
				<h3 className="font-medium text-lg">Riwayat Order</h3>
				<p className="text-muted-foreground text-sm">
					Daftar pesanan terbaru Anda.
				</p>
			</div>

			<div className="flex items-center gap-2">
				<Select value={timeFilter} onValueChange={(v) => setTimeFilter(v || "today")}>
					<SelectTrigger className="h-8 text-xs flex-1">
						<SelectValue placeholder="Pilih Waktu" />
					</SelectTrigger>
					<SelectContent>
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
					<SelectContent>
						<SelectItem value="desc">Terbaru</SelectItem>
						<SelectItem value="asc">Terlama</SelectItem>
					</SelectContent>
				</Select>
			</div>

			{orders === undefined ? (
				<div className="flex flex-col items-center justify-center py-10 gap-3">
					<Loader2 className="h-6 w-6 animate-spin text-primary" />
					<p className="text-xs text-muted-foreground">Memuat riwayat...</p>
				</div>
			) : filteredOrders.length === 0 ? (
				<div className="flex flex-col items-center justify-center py-12 border-2 border-dashed rounded-2xl bg-muted/30">
					<ClipboardList className="h-10 w-10 text-muted-foreground/30 mb-3" />
					<p className="font-medium text-sm text-muted-foreground">Belum Ada Transaksi</p>
				</div>
			) : (
				<div className="space-y-2">
					{filteredOrders.map((order: Doc<"orders">) => (
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
									<div className="flex items-center gap-2">
										<p className="font-bold text-sm">#{order.orderNumber}</p>
										<span className={`text-[9px] font-bold uppercase tracking-wider ${
											order.status === "completed" || order.status === "paid" ? "text-emerald-600" :
											order.status === "pending" ? "text-orange-600" : "text-rose-600"
										}`}>
											{order.status === "paid" ? "Lunas" : 
											 order.status === "completed" ? "Selesai" : 
											 order.status === "pending" ? "Pending" : "Batal"}
										</span>
									</div>
									<p className="text-[10px] text-muted-foreground">
										{formatDate(order.createdAt)} • {formatTime(order.createdAt)}
									</p>
									<p className="text-xs font-medium mt-0.5">
										{order.customerName || "Tanpa Nama"}
									</p>
								</div>
							</div>
							<div className="text-right">
								<p className="font-bold text-primary">
									{formatCurrency(order.totalAmount)}
								</p>
								<p className="text-[10px] text-muted-foreground mt-1">
									{order.items?.length || 0} item
								</p>
							</div>
						</button>
					))}
				</div>
			)}
			<div className="h-6" />
		</div>
	);
}

function KasTab({ onClose }: { onClose: () => void }) {
	const [activeForm, setActiveForm] = useState<
		"menu" | "masuk" | "keluar"
	>("menu");

	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const financialSummary = useQuery(api.finance.getFinancialSummary, {
		startDate: today.getTime(),
	});

	const shiftStatus = useQuery(api.finance.getShiftStatus);
	const isShiftOpen = shiftStatus?.isOpen ?? false;

	const formatCurrency = (value: number) =>
		new Intl.NumberFormat("id-ID", {
			style: "currency",
			currency: "IDR",
			maximumFractionDigits: 0,
		}).format(value);

	const ACTIONS = [
		{ id: "masuk" as const, label: "Input Pemasukan", icon: TrendingUp, color: "text-emerald-600", bg: "bg-emerald-50" },
		{ id: "keluar" as const, label: "Input Pengeluaran", icon: TrendingDown, color: "text-rose-600", bg: "bg-rose-50" },
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
					Kembali ke Kas
				</Button>
				{activeForm === "masuk" && <IncomeForm onClose={onClose} />}
				{activeForm === "keluar" && <ExpenseForm onClose={onClose} />}
			</div>
		);
	}

	return (
		<div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
			{/* Financial Summary Header */}
			<div className="space-y-3">
				<div className="flex items-center justify-between">
					<h3 className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Status Kas Hari Ini</h3>
					{isShiftOpen ? (
						<span className="text-[10px] font-bold text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full uppercase tracking-tighter">Shift Aktif</span>
					) : (
						<span className="text-[10px] font-bold text-rose-600 bg-rose-100 px-2 py-0.5 rounded-full uppercase tracking-tighter">Shift Tutup</span>
					)}
				</div>
				
				<Card className="overflow-hidden border-none bg-gradient-to-br from-primary/10 via-primary/5 to-transparent shadow-none">
					<CardContent className="p-4">
						<div className="space-y-3">
							<div className="flex justify-between items-end">
								<div className="space-y-0.5">
									<p className="text-[10px] font-bold text-muted-foreground uppercase">Saldo Kasir</p>
									<p className="text-2xl font-black tracking-tighter text-primary">
										{formatCurrency(financialSummary?.netBalance || 0)}
									</p>
								</div>
								<div className="text-right">
									<p className="text-[9px] font-bold text-muted-foreground uppercase">Transaksi</p>
									<p className="font-bold text-sm">{financialSummary?.totalTransactions || 0}</p>
								</div>
							</div>
							
							<div className="grid grid-cols-2 gap-3 pt-3 border-t border-primary/10">
								<div className="space-y-0.5">
									<p className="text-[9px] font-bold text-emerald-600 uppercase">Pemasukan (+)</p>
									<p className="font-bold text-xs">{formatCurrency(financialSummary?.totalIncome || 0)}</p>
								</div>
								<div className="space-y-0.5 text-right">
									<p className="text-[9px] font-bold text-rose-600 uppercase">Pengeluaran (-)</p>
									<p className="font-bold text-xs">{formatCurrency(financialSummary?.totalExpense || 0)}</p>
								</div>
							</div>
						</div>
					</CardContent>
				</Card>
			</div>

			{/* Quick Actions Grid */}
			<div className="space-y-3">
				<h3 className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Aksi Cepat</h3>
				<div className="grid grid-cols-1 gap-2.5">
					{ACTIONS.map((action) => {
						const Icon = action.icon;
						return (
							<button
								key={action.id}
								onClick={() => setActiveForm(action.id)}
								className="flex items-center gap-4 p-4 w-full rounded-2xl border border-border bg-white text-left shadow-sm transition-all hover:border-primary/30 hover:shadow-md active:scale-[0.98]"
								type="button"
							>
								<div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${action.bg}`}>
									<Icon className={`h-6 w-6 ${action.color}`} />
								</div>
								<div className="flex-1">
									<p className="font-black text-sm text-foreground uppercase tracking-tight">{action.label}</p>
									<p className="text-[10px] text-muted-foreground font-medium">
										{action.id === 'masuk' ? 'Tambah modal atau setoran manual' : 
										 'Catat biaya operasional harian'}
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
					Pastikan setiap uang yang masuk atau keluar dari kasir dicatat agar laporan harian tetap akurat dan seimbang.
				</p>
			</div>
		</div>
	);
}

function ShiftManagement({ onClose }: { onClose: () => void }) {
	const createTransaction = useMutation(api.finance.createTransaction);
	const [shiftType, setShiftType] = useState<"mulai" | "akhiri">("mulai");
	const [amount, setAmount] = useState("");
	const [cashInRegister, setCashInRegister] = useState("");
	const [notes, setNotes] = useState("");
	const [cashierName, setCashierName] = useState("");
	const [shiftName, setShiftName] = useState("Shift Pagi");
	const [teamMembers, setTeamMembers] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);

	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const financialSummary = useQuery(api.finance.getFinancialSummary, {
		startDate: today.getTime(),
	});

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!amount) {
			toast.error("Masukkan jumlah uang");
			return;
		}

		if (shiftType === "mulai" && !cashierName) {
			toast.error("Nama kasir wajib diisi");
			return;
		}

		setIsSubmitting(true);
		try {
			const descParts = [];
			if (cashierName) descParts.push(`Kasir: ${cashierName}`);
			if (shiftName) descParts.push(`Shift: ${shiftName}`);
			if (teamMembers) descParts.push(`Tim: ${teamMembers}`);
			if (notes) descParts.push(`Catatan: ${notes}`);
			if (shiftType === "akhiri" && cashInRegister) descParts.push(`Fisik Laci: Rp ${new Intl.NumberFormat("id-ID").format(Number(cashInRegister))}`);

			const finalDescription = descParts.length > 0 ? descParts.join(" | ") : (shiftType === "mulai" ? "Mulai Shift" : "Akhiri Shift");

			await createTransaction({
				type: "income",
				amount: Number(amount),
				category: shiftType === "mulai" ? "Modal Awal" : "Setoran Akhir",
				description: finalDescription,
				date: Date.now(),
				status: "completed",
				paymentMethod: "tunai",
			});
			toast.success(shiftType === "mulai" ? "Shift dimulai" : "Shift diakhiri");
			setAmount("");
			setCashInRegister("");
			setNotes("");
			setCashierName("");
			setTeamMembers("");
			onClose();
		} catch (error) {
			console.error(error);
			toast.error("Gagal menyimpan data shift");
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<div className="space-y-4 pt-2">
			<div className="space-y-2 text-center">
				<h3 className="font-medium text-lg">Manajemen Shift</h3>
				<p className="text-muted-foreground text-sm">
					Catat modal awal/akhir shift kasir
				</p>
			</div>

			<div className="flex gap-2 rounded-lg bg-muted/50 p-1">
				<button
					className={`flex-1 rounded-md px-3 py-2 font-medium text-sm transition-all ${
						shiftType === "mulai"
							? "bg-primary text-primary-foreground"
							: "text-muted-foreground hover:text-foreground"
					}`}
					onClick={() => setShiftType("mulai")}
					type="button"
				>
					Mulai Shift
				</button>
				<button
					className={`flex-1 rounded-md px-3 py-2 font-medium text-sm transition-all ${
						shiftType === "akhiri"
							? "bg-destructive text-destructive-foreground"
							: "text-muted-foreground hover:text-foreground"
					}`}
					onClick={() => setShiftType("akhiri")}
					type="button"
				>
					Akhiri Shift
				</button>
			</div>

			<form className="space-y-4" onSubmit={handleSubmit}>
				{shiftType === "mulai" && (
					<>
						<div className="grid grid-cols-2 gap-3">
							<div className="space-y-2">
								<Label>Nama Kasir <span className="text-destructive">*</span></Label>
								<Input
									placeholder="Contoh: Budi"
									value={cashierName}
									onChange={(e) => setCashierName(e.target.value)}
									required
								/>
							</div>
							<div className="space-y-2">
								<Label>Shift <span className="text-destructive">*</span></Label>
								<Input
									placeholder="Contoh: Shift Pagi"
									value={shiftName}
									onChange={(e) => setShiftName(e.target.value)}
									required
								/>
							</div>
						</div>
						<div className="space-y-2">
							<Label>Tim yang Bertugas (Opsional)</Label>
							<Input
								placeholder="Contoh: Andi (Barista), Siska (Waiter)"
								value={teamMembers}
								onChange={(e) => setTeamMembers(e.target.value)}
							/>
							<p className="text-[10px] text-muted-foreground">Catat nama rekan tim lain yang bekerja di shift ini.</p>
						</div>
					</>
				)}

				<div className="space-y-2">
					<Label>
						{shiftType === "mulai" ? "Modal Kembalian (Rp)" : "Setoran Bersih (Rp)"}
					</Label>
					<Input
						className="text-lg font-bold"
						min={0}
						onChange={(e) => setAmount(e.target.value)}
						placeholder="0"
						required
						type="number"
						value={amount}
					/>
				</div>

				{shiftType === "akhiri" && (
					<div className="space-y-2">
						<Label>Uang Fisik di Laci (Rp)</Label>
						<Input
							className="text-lg font-bold"
							min={0}
							onChange={(e) => setCashInRegister(e.target.value)}
							placeholder="0"
							type="number"
							value={cashInRegister}
						/>
						<p className="text-[10px] text-muted-foreground">Hitung seluruh uang fisik di laci kasir saat ini.</p>
					</div>
				)}

				<div className="space-y-2">
					<Label>Catatan (Opsional)</Label>
					<Textarea
						onChange={(e) => setNotes(e.target.value)}
						placeholder={shiftType === "mulai" ? "Catatan tambahan..." : "Contoh: Ada selisih uang, mati lampu, dll"}
						value={notes}
					/>
				</div>

				{financialSummary && shiftType === "akhiri" && (
					<Card className="border-border bg-muted/30">
						<CardContent className="p-3">
							<p className="mb-1 text-[10px] text-muted-foreground uppercase">
								Ringkasan Hari Ini
							</p>
							<div className="space-y-1 text-xs">
								<div className="flex justify-between">
									<span>Pemasukan:</span>
									<span className="font-bold text-primary">
										{new Intl.NumberFormat("id-ID", {
											style: "currency",
											currency: "IDR",
											maximumFractionDigits: 0,
										}).format(financialSummary.totalIncome || 0)}
									</span>
								</div>
								<div className="flex justify-between">
									<span>Pengeluaran:</span>
									<span className="font-bold text-destructive">
										{new Intl.NumberFormat("id-ID", {
											style: "currency",
											currency: "IDR",
											maximumFractionDigits: 0,
										}).format(financialSummary.totalExpense || 0)}
									</span>
								</div>
							</div>
						</CardContent>
					</Card>
				)}

				<Button
					className="w-full"
					disabled={isSubmitting}
					type="submit"
					variant={shiftType === "mulai" ? "default" : "destructive"}
				>
					{isSubmitting ? (
						<Loader2 className="mr-2 h-4 w-4 animate-spin" />
					) : null}
					{shiftType === "mulai" ? "Mulai Shift" : "Akhiri Shift"}
				</Button>
			</form>
		</div>
	);
}

function IncomeForm({ onClose }: { onClose: () => void }) {
	const createTransaction = useMutation(api.finance.createTransaction);
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
	const createTransaction = useMutation(api.finance.createTransaction);
	const [amount, setAmount] = useState("");
	const [category, setCategory] = useState("Bahan Baku");
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
				type: "expense",
				amount: Number(amount),
				category,
				description,
				date: Date.now(),
				status: "completed",
				paymentMethod: "tunai",
			});
			toast.success("Pengeluaran berhasil dicatat");
			setAmount("");
			setDescription("");
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

function StokTab({
	setConfirmConfig,
}: {
	setConfirmConfig: (config: ConfirmConfig) => void;
}) {
	const [activeSubTab, setActiveSubTab] = useState<"update" | "beli">("update");

	const lowStockItems = useQuery(api.inventory.getLowStockItems);
	const lowStockCount = lowStockItems?.length || 0;

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
		<div className="space-y-4">
			<div className="flex gap-1 rounded-lg bg-muted/50 p-1">
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

			{activeSubTab === "update" && (
				<InventoryTab setConfirmConfig={setConfirmConfig} />
			)}
			{activeSubTab === "beli" && <MarketList />}
		</div>
	);
}

function InventoryTab({
	setConfirmConfig,
}: {
	setConfirmConfig: (config: ConfirmConfig) => void;
}) {
	const inventory = useQuery(api.inventory.getInventory);
	const restockInventory = useMutation(api.inventory.addStock);
	const usageStock = useMutation(api.inventory.usageStock);
	const adjustStock = useMutation(api.inventory.adjustStock);
	const produceBatch = useMutation(api.inventory.produceBaseRecipeBatch);

	const [editingId, setEditingId] = useState<Id<"inventory"> | null>(null);
	const [manualQty, setManualQty] = useState<string>("");

	const handleUpdate = async (
		id: Id<"inventory">,
		type: "add" | "usage",
		currentQty: number
	) => {
		try {
			if (type === "add") {
				await restockInventory({
					inventoryId: id,
					quantity: 1,
					notes: "Quick Update via Menu",
				});
			} else {
				if (currentQty <= 0) {
					return;
				}
				await usageStock({
					inventoryId: id,
					quantity: 1,
					notes: "Quick Update via Menu",
				});
			}
			toast.success("Stok diperbarui");
		} catch (_e) {
			toast.error("Gagal update stok");
		}
	};

	const handleManualAdjust = async (
		id: Id<"inventory">,
		action: "add" | "usage" | "set"
	) => {
		const qty = Number(manualQty);
		if (Number.isNaN(qty) || qty <= 0) {
			toast.error("Masukkan jumlah yang valid");
			return;
		}

		try {
			if (action === "add") {
				await restockInventory({
					inventoryId: id,
					quantity: qty,
					notes: "Manual Adjustment",
				});
			} else if (action === "usage") {
				await usageStock({
					inventoryId: id,
					quantity: qty,
					notes: "Manual Adjustment",
				});
			} else {
				await adjustStock({
					inventoryId: id,
					quantity: qty,
					notes: "Opname/Adjustment",
				});
			}
			toast.success("Stok berhasil diperbarui");
			setEditingId(null);
			setManualQty("");
		} catch (_e) {
			toast.error("Gagal update stok");
		}
	};

	if (inventory === undefined) {
		return (
			<div className="p-4 text-center text-muted-foreground">
				Memuat data...
			</div>
		);
	}

	return (
		<div className="space-y-3">
			<div className="flex items-center justify-between">
				<h3 className="font-bold text-sm">Update Stok</h3>
				<span className="text-[10px] text-muted-foreground">
					{inventory.length} item
				</span>
			</div>
			<ScrollArea className="h-[52vh] pr-2">
				<div className="space-y-2">
					{inventory.map((item: Doc<"inventory">) => {
						const isEditing = editingId === item._id;
						const isLowStock = item.quantity <= item.lowStockThreshold;

						return (
							<Card
								className={`overflow-hidden ${
									isLowStock
										? "border-destructive/30 bg-destructive/5"
										: "border-border bg-card/50"
								}`}
								key={item._id}
							>
								<CardContent className="p-3">
									<div className="flex items-center justify-between">
										<div className="flex flex-col">
											<div className="flex items-center gap-1.5">
												<span className="font-bold text-sm">
													{item.ingredientName}
												</span>
												{isLowStock && (
													<AlertCircle className="h-3 w-3 text-destructive" />
												)}
											</div>
											<div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
												Stok:{" "}
												<span
													className={`font-bold ${
														isLowStock ? "text-destructive" : "text-foreground"
													}`}
												>
													{item.displayUnit &&
													item.conversionFactor &&
													item.conversionFactor > 0
														? (item.quantity / item.conversionFactor).toFixed(2)
														: item.quantity}
												</span>{" "}
												{item.displayUnit || item.unit}
												{item.displayUnit && (
													<span className="text-[9px] italic opacity-70">
														({item.quantity} {item.unit})
													</span>
												)}
											</div>
										</div>

										<div className="flex items-center gap-1">
											{item.baseRecipeId && (
												<Button
													className="h-7 px-2 font-bold text-[9px]"
													onClick={() => {
														setConfirmConfig({
															isOpen: true,
															title: "Konfirmasi Produksi",
															message: `Buat 1 batch ${item.ingredientName}?`,
															onConfirm: async () => {
																try {
																	if (!item.baseRecipeId) {
																		return;
																	}
																	await produceBatch({
																		baseRecipeId: item.baseRecipeId,
																		inventoryId: item._id,
																		batchMultiplier: 1,
																	});
																	toast.success("Produksi berhasil");
																} catch (e: unknown) {
																	const error = e as Error;
																	toast.error(error.message);
																}
															},
														});
													}}
													size="sm"
													variant="outline"
												>
													<Sparkles className="mr-1 h-3 w-3 text-accent" />
													Produksi
												</Button>
											)}

											{isEditing ? (
												<Button
													className="h-7 w-7"
													onClick={() => setEditingId(null)}
													size="icon"
													variant="ghost"
												>
													<X className="h-4 w-4" />
												</Button>
											) : (
												<>
													<Button
														className="h-7 w-7 rounded-md"
														disabled={item.quantity <= 0}
														onClick={() =>
															handleUpdate(item._id, "usage", item.quantity)
														}
														size="icon"
														variant="outline"
													>
														<Minus className="h-3 w-3" />
													</Button>
													<Button
														className="h-7 w-7 rounded-md"
														onClick={() =>
															handleUpdate(item._id, "add", item.quantity)
														}
														size="icon"
														variant="outline"
													>
														<Plus className="h-3 w-3" />
													</Button>
													<Button
														className="h-7 w-7 rounded-md text-muted-foreground hover:text-primary"
														onClick={() => {
															setEditingId(item._id);
															setManualQty("");
														}}
														size="icon"
														variant="ghost"
													>
														<Pencil className="h-3 w-3" />
													</Button>
												</>
											)}
										</div>
									</div>

									{isEditing && (
										<div className="mt-2 flex flex-col gap-2 rounded-lg bg-muted/50 p-2">
											<div className="flex items-center gap-2">
												<Input
													autoFocus
													className="h-8 font-bold text-sm"
													onChange={(e) => setManualQty(e.target.value)}
													onKeyDown={(e) => {
														if (e.key === "Enter") {
															handleManualAdjust(item._id, "add");
														}
														if (e.key === "Escape") {
															setEditingId(null);
														}
													}}
													placeholder="Jumlah..."
													type="number"
													value={manualQty}
												/>
												<div className="flex gap-1">
													<Button
														className="h-8 px-2 font-bold text-[10px]"
														onClick={() => handleManualAdjust(item._id, "add")}
														size="sm"
														variant="outline"
													>
														+
													</Button>
													<Button
														className="h-8 px-2 font-bold text-[10px]"
														onClick={() =>
															handleManualAdjust(item._id, "usage")
														}
														size="sm"
														variant="outline"
													>
														-
													</Button>
													<Button
														className="h-8 px-2 font-bold text-[10px]"
														onClick={() => handleManualAdjust(item._id, "set")}
														size="sm"
														variant="default"
													>
														Set
													</Button>
												</div>
											</div>
											<p className="text-[9px] text-muted-foreground italic">
												* Tentukan jumlah lalu pilih aksi (+ / - / Set Total)
											</p>
										</div>
									)}
								</CardContent>
							</Card>
						);
					})}
				</div>
			</ScrollArea>
		</div>
	);
}

function MarketList() {
	const lowStockItems = useQuery(api.inventory.getLowStockItems);

	if (lowStockItems === undefined) {
		return <div className="p-4 text-center">Memuat data...</div>;
	}

	return (
		<div className="space-y-3">
			<div className="flex items-center justify-between">
				<h3 className="font-bold text-sm">Daftar Belanja</h3>
				<span className="rounded-full bg-destructive/10 px-2 py-0.5 font-medium text-[10px] text-destructive">
					{lowStockItems.length} item perlu dibeli
				</span>
			</div>

			{lowStockItems.length === 0 ? (
				<div className="rounded-lg border border-dashed py-10 text-center text-muted-foreground">
					<Package className="mx-auto mb-2 h-10 w-10 opacity-20" />
					<p className="font-medium">Stok aman semua!</p>
					<p className="text-xs">Tidak ada item yang perlu dibeli</p>
				</div>
			) : (
				<ScrollArea className="h-[52vh] pr-2">
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
				</ScrollArea>
			)}
		</div>
	);
}

function SettingsTab({ onClose }: { onClose: () => void }) {
	const siteSettings = useQuery(api.site_settings.getSettings);
	const updateSiteSettings = useMutation(api.site_settings.updateSettings);

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
