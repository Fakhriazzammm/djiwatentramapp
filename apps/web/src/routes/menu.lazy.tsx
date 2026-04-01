import { createLazyFileRoute } from "@tanstack/react-router";
import { api } from "@yumipos/backend/convex/_generated/api";
import type { Id } from "@yumipos/backend/convex/_generated/dataModel";
import { useMutation, useQuery, useConvex } from "convex/react";
import {
	BarChart3,
	Bot,
	Clock,
	Coffee,
	Minus,
	Package,
	Plus,
	Search,
	Settings2,
	ShoppingBag,
	ShoppingCart,
	Wallet,
	X,
	Printer,
	User
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { MenuSidebar } from "@/components/pos/menu-sidebar";
import { CartDrawer } from "@/components/pos/cart-drawer";
import { CheckoutSidebar } from "@/components/pos/checkout-sidebar";
import { PaymentConfirmationModal } from "@/components/pos/payment-modal";
import { useMenuKeyboardNav, type FocusZone } from "@/hooks/use-menu-keyboard-nav";
import { useCart } from "@/context/cart-context";
import { calculateEffectivePrice } from "@/lib/utils/pricing";
import { bluetoothPrinter, type OrderItem } from "@/lib/bluetooth-printer";
import { cn } from "@/lib/utils";
import { ShiftTargetBanner } from "@/components/pos/ShiftTargetBanner";
import { getOfflineManager, queueOfflineAction } from "@/lib/offline-manager";

export const Route = createLazyFileRoute("/menu")({
	component: MenuPage,
});

// Menu Sidebar items for the header
const SIDEBAR_MENU_ITEMS = [
	{ id: "dashboard", label: "Dashboard", icon: BarChart3 },
	{ id: "parkir", label: "Simpan Orderan", icon: ShoppingCart },
	{ id: "history", label: "Riwayat Order", icon: Clock },
	{ id: "kas", label: "Kas", icon: Wallet },
	{ id: "stok", label: "Stok", icon: Package },
	{ id: "yumi", label: "Chat AI", icon: Bot },
	{ id: "settings", label: "Pengaturan", icon: Settings2 },
];

type ShiftSchedule = {
	name: string;
	openTime?: string;
	closeTime?: string;
};

function parseTimeToMinutes(time?: string) {
	if (!time || !time.includes(":")) return null;
	const [hours, minutes] = time.split(":").map(Number);
	if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
	return hours * 60 + minutes;
}

function formatClockTime(time?: string) {
	return time || "--:--";
}

function getShiftSchedule(
	schedules: ShiftSchedule[] | undefined,
	shiftName?: string | null
) {
	if (!shiftName || !schedules?.length) return null;
	return schedules.find((schedule) => schedule.name === shiftName) ?? null;
}

function MenuPage() {
	// Queries
	const convex = useConvex();
	const siteSettings = useQuery(api.site_settings.getSettings);
	const categories = useQuery(api.products.getCategories);
	const activeDiscounts = useQuery(api.discounts.getActiveDiscounts);
	const createOrder = useMutation(api.orders.createOrder);

	// Cart context
	const {
		items: cartItems,
		addToCart,
		removeFromCart,
		updateQuantity,
		clearCart,
		totalAmount,
		discountAmount,
		totalItems,
		finalTotal,
		taxAmount,
		serviceChargeAmount,
		customerInfo,
	} = useCart();

	// Local state
	const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
	const [searchQuery, setSearchQuery] = useState("");
	const [isSearchFocused, setIsSearchFocused] = useState(false);
	const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
	const [isCartOpen, setIsCartOpen] = useState(false);
	const [isPaymentOpen, setIsPaymentOpen] = useState(false);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [isSidebarOpen, setIsSidebarOpen] = useState(false);
	const [activeSidebarTab, setActiveSidebarTab] = useState("dashboard");
	const [keyboardFocusZone, setKeyboardFocusZone] = useState<FocusZone>("header");
	const [focusedCategoryIndex, setFocusedCategoryIndex] = useState(0);
	const [lastOrderId, setLastOrderId] = useState<Id<"orders"> | null>(null);
	const [offlinePendingCount, setOfflinePendingCount] = useState(0);

	const shiftStatus = useQuery(api.finance.getShiftStatus);
	const isShiftOpen = shiftStatus?.isOpen ?? false;

	// Printer State
	const [isPrinterConnected, setIsPrinterConnected] = useState(bluetoothPrinter.isConnected());
	const [currentTime, setCurrentTime] = useState(new Date());
	const [shiftReminderOpen, setShiftReminderOpen] = useState(false);
	const [shiftReminderState, setShiftReminderState] = useState<"soon" | "overdue" | null>(null);

	// Periodically check printer connection and update time
	useEffect(() => {
		const interval = setInterval(() => {
			setIsPrinterConnected(bluetoothPrinter.isConnected());
			setCurrentTime(new Date());
		}, 3000);
		return () => clearInterval(interval);
	}, []);

	useEffect(() => {
		const offlineManager = getOfflineManager();
		offlineManager.registerExecutor("createOrder", async (action) => {
			await convex.mutation(api.orders.createOrder, action.data as any);
		});

		return offlineManager.subscribe((state) => {
			setOfflinePendingCount(state.pendingSyncCount);
		});
	}, [convex]);

	const activeShiftSchedule = useMemo(
		() =>
			getShiftSchedule(
				siteSettings?.shiftSettings?.shiftSchedules as ShiftSchedule[] | undefined,
				shiftStatus?.shiftInfo?.shiftName
			),
		[siteSettings?.shiftSettings?.shiftSchedules, shiftStatus?.shiftInfo?.shiftName]
	);

	const shiftReminderMinutes = Math.max(
		1,
		siteSettings?.shiftSettings?.reminderMinutesBeforeClose ?? 15
	);

	useEffect(() => {
		if (!isShiftOpen || !activeShiftSchedule?.closeTime) {
			setShiftReminderState(null);
			setShiftReminderOpen(false);
			return;
		}

		const closeMinutes = parseTimeToMinutes(activeShiftSchedule.closeTime);
		if (closeMinutes == null) {
			setShiftReminderState(null);
			setShiftReminderOpen(false);
			return;
		}

		const nowMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();
		const minutesUntilClose = closeMinutes - nowMinutes;
		const nextState =
			minutesUntilClose < 0
				? "overdue"
				: minutesUntilClose <= shiftReminderMinutes
					? "soon"
					: null;

		setShiftReminderState((prev) => {
			if (nextState && prev !== nextState) {
				setShiftReminderOpen(true);
			}
			if (!nextState) {
				setShiftReminderOpen(false);
			}
			return nextState;
		});
	}, [
		activeShiftSchedule?.closeTime,
		currentTime,
		isShiftOpen,
		shiftReminderMinutes,
	]);

	// Responsive grid columns
	const [gridColumns, setGridColumns] = useState(4);

	useEffect(() => {
		const updateColumns = () => {
			const width = window.innerWidth;
			if (width >= 1536) setGridColumns(5); // 2xl
			else if (width >= 1280) setGridColumns(4); // xl
			else if (width >= 1024) setGridColumns(3); // lg
			else if (width >= 768) setGridColumns(2); // md
			else if (width >= 640) setGridColumns(3); // sm
			else setGridColumns(2); // default
		};
		updateColumns();
		window.addEventListener("resize", updateColumns);
		return () => window.removeEventListener("resize", updateColumns);
	}, []);

	// Auto-open customer info step on mobile if not submitted
	useEffect(() => {
		if (typeof window !== "undefined" && window.innerWidth < 768) {
			if (!customerInfo.isSubmitted && cartItems.length === 0) {
				setIsCartOpen(true);
			}
		}
	}, [customerInfo.isSubmitted, cartItems.length]);

	// Refs for scrolling
	const categoryScrollRef = useRef<HTMLDivElement>(null);
	const productGridRef = useRef<HTMLDivElement>(null);
	const headerRef = useRef<HTMLDivElement>(null);

	// Products query with category filter
	const products = useQuery(
		api.products.getProducts,
		activeCategoryId ? { categoryId: activeCategoryId as Id<"categories"> } : {}
	);

	// All products for search
	const allProducts = useQuery(api.products.getProducts, {});

	// Filtered products based on search
	const filteredProducts = useMemo(() => {
		if (!searchQuery.trim()) return products;
		if (!allProducts) return [];
		
		const query = searchQuery.toLowerCase();
		return allProducts.filter((p: any) => {
			const matchName = p.name.toLowerCase().includes(query);
			const matchMenuNumber = p.menuNumber?.toString().includes(query);
			
			// Match category name
			let matchCategory = false;
			if (p.categoryId && categories) {
				const category = categories.find((c: any) => c._id === p.categoryId);
				if (category && category.name.toLowerCase().includes(query)) {
					matchCategory = true;
				}
			}
			
			// Match description
			const matchDescription = p.description?.toLowerCase().includes(query);
			
			return matchName || matchMenuNumber || matchCategory || matchDescription;
		});
	}, [searchQuery, products, allProducts, categories]);

	// Store info
	const storeName = siteSettings?.storeName || "YumiPOS";
	const logoUrl = siteSettings?.logoUrl;
	const themeColor = siteSettings?.themeColor;

	// Category list including "Semua"
	const categoryList = useMemo(() => {
		if (!categories) return [{ _id: "all", name: "Semua" }];
		
		// Sort categories to put sub-categories right after their parents
		const parents = categories.filter((c: any) => !c.parentId);
		const sortedCategories: any[] = [];
		
		parents.forEach((parent: any) => {
			sortedCategories.push(parent);
			const subs = categories.filter((c: any) => c.parentId === parent._id);
			if (subs.length > 0) {
				sortedCategories.push(...subs.map((sub: any) => ({
					...sub,
					name: `↳ ${sub.name}`
				})));
			}
		});

		return [{ _id: "all", name: "Semua" }, ...sortedCategories];
	}, [categories]);

	// Scroll category into view
	const scrollCategoryIntoView = useCallback((index: number) => {
		if (categoryScrollRef.current) {
			const buttons = categoryScrollRef.current.querySelectorAll("button");
			if (buttons[index]) {
				buttons[index].scrollIntoView({ behavior: "smooth", inline: "center" });
			}
		}
	}, []);

	// Scroll product into view
	const scrollProductIntoView = useCallback((index: number) => {
		if (productGridRef.current) {
			const productElements = productGridRef.current.querySelectorAll("[data-product-index]");
			if (productElements[index]) {
				(productElements[index] as HTMLElement).scrollIntoView({
					behavior: "smooth",
					block: "nearest",
				});
			}
		}
	}, []);

	// Keyboard navigation handlers
	const handleProductSelect = useCallback(
		(index: number) => {
			scrollProductIntoView(index);
		},
		[scrollProductIntoView]
	);

	const handleProductActivate = useCallback(
		(index: number) => {
			if (filteredProducts && filteredProducts[index]) {
				const product = filteredProducts[index];
				const hasVariations = product.variations && product.variations.length > 0;
				if (hasVariations) {
					setSelectedProduct(product);
				} else {
					// Quick add to cart
					const pricing = calculateEffectivePrice(
						{
							_id: product._id,
							price: product.price,
							categoryId: product.categoryId,
						},
						activeDiscounts
					);
					addToCart({
						productId: product._id,
						name: product.name,
						price: pricing.finalPrice,
						originalPrice: pricing.originalPrice,
						quantity: 1,
						image: product.image,
						category: product.categoryId,
					});
					toast.success(`${product.name} ditambahkan ke keranjang`);
				}
			}
		},
		[filteredProducts, activeDiscounts, addToCart]
	);

	const handleCategorySelect = useCallback(
		(index: number) => {
			setFocusedCategoryIndex(index);
			scrollCategoryIntoView(index);
			if (index === 0) {
				setActiveCategoryId(null);
			} else {
				const cat = categoryList[index];
				if (cat._id !== "all") {
					setActiveCategoryId(cat._id);
				}
			}
		},
		[categoryList, scrollCategoryIntoView]
	);

	const handleCategoryChange = useCallback(
		(direction: "left" | "right") => {
			scrollCategoryIntoView(
				direction === "right"
					? Math.min(focusedCategoryIndex + 1, categoryList.length - 1)
					: Math.max(focusedCategoryIndex - 1, 0)
			);
		},
		[focusedCategoryIndex, categoryList.length, scrollCategoryIntoView]
	);

	const handleHeaderAction = useCallback(
		(action: "menu" | "back" | "search" | string) => {
			switch (action) {
				case "back":
					// Back button is removed
					break;
				case "menu":
					setIsSidebarOpen(true);
					break;
				case "search":
					const searchInput = document.querySelector(
						'input[placeholder*="Cari"]'
					) as HTMLInputElement;
					if (searchInput) {
						searchInput.focus();
					}
					break;
				default:
					// Check if it's one of the sidebar menu tabs
					if (SIDEBAR_MENU_ITEMS.some(item => item.id === action)) {
						handleOpenSidebar(action);
					}
			}
		},
		[]
	);

	const handleFocusZoneChange = useCallback((zone: FocusZone) => {
		setKeyboardFocusZone(zone);
	}, []);

	// Initialize keyboard navigation
	const { focusZone, focusedIndex, focusedHeaderIndex, setFocusZone, setFocusedIndex, isZoneFocused, isKeyboardActive } =
		useMenuKeyboardNav({
			productCount: filteredProducts?.length || 0,
			gridColumns,
			onProductSelect: handleProductSelect,
			onProductActivate: handleProductActivate,
			categoryCount: categoryList.length,
			onCategorySelect: handleCategorySelect,
			onCategoryChange: handleCategoryChange,
			onHeaderAction: (action) => {
				// If action is a number string, it's a sidebar menu index
				const index = parseInt(action);
				if (!isNaN(index) && SIDEBAR_MENU_ITEMS[index]) {
					handleOpenSidebar(SIDEBAR_MENU_ITEMS[index].id);
				} else {
					handleHeaderAction(action);
				}
			},
			headerItemCount: 1 + SIDEBAR_MENU_ITEMS.length, // 1 for logo + menu buttons
			cartItemCount: totalItems,
			onCartOpen: () => setIsCartOpen(true),
			onCartClose: () => setIsCartOpen(false),
			onCartItemRemove: (index) => {
				if (cartItems[index]) {
					removeFromCart(cartItems[index].productId, cartItems[index].variant);
				}
			},
			onFocusZoneChange: handleFocusZoneChange,
			enabled: !isSearchFocused && !selectedProduct && !isCartOpen && !isPaymentOpen,
		});

	// Get cart quantity for a product
	const getCartQty = (productId: string) =>
		cartItems
			.filter((i) => i.productId === productId)
			.reduce((s, i) => s + i.quantity, 0);

	// Format currency
	const fmt = (n: number) =>
		new Intl.NumberFormat("id-ID", {
			style: "currency",
			currency: "IDR",
			maximumFractionDigits: 0,
		}).format(n);

	// Handle product click
	const handleProductClick = (product: any) => {
		const hasVariations = product.variations && product.variations.length > 0;
		if (hasVariations) {
			setSelectedProduct(product);
		} else {
			const pricing = calculateEffectivePrice(
				{
					_id: product._id,
					price: product.price,
					categoryId: product.categoryId,
				},
				activeDiscounts
			);
			addToCart({
				productId: product._id,
				name: product.name,
				price: pricing.finalPrice,
				originalPrice: pricing.originalPrice,
				quantity: 1,
				image: product.image,
				category: product.categoryId,
			});
			toast.success(`${product.name} ditambahkan ke keranjang`);
		}
	};

	const handlePrint = useCallback(async (orderId: Id<"orders">) => {
		if (!bluetoothPrinter.isConnected()) {
			return;
		}

		if (!siteSettings) return;

		try {
			const order = await convex.query(api.orders.getOrder, { id: orderId });
			if (!order) return;

			toast.loading("Mencetak struk...", { id: "printing" });
			
			const items = order.items.map((i: any) => ({
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
					receiptShowNotes: siteSettings.receiptShowNotes,
					receiptFontSize: siteSettings.receiptFontSize,
				}
			);
			toast.success("Struk berhasil dicetak", { id: "printing" });
		} catch (error) {
			console.error("Print failed:", error);
			toast.error("Gagal mencetak struk.", { id: "printing" });
		}
	}, [convex, siteSettings, shiftStatus]);

	// Handle order submission from payment modal or sidebar
	const handlePaymentConfirm = useCallback(
		async (
			finalAmount: number,
			discountId?: string,
			paymentMethod?: string,
			orderData?: {
				tableNumber?: string;
				orderType?: "dine_in" | "takeaway";
				notes?: string;
				autoComplete?: boolean;
				cashReceived?: number;
				changeAmount?: number;
			}
		) => {
			if (!isShiftOpen) {
				toast.error("Buka shift terlebih dahulu di Dashboard");
				return;
			}
			if (cartItems.length === 0) return;
			setIsSubmitting(true);
			try {
				const orderPayload = {
					items: cartItems.map((i) => ({
						productId: i.productId as Id<"products">,
						productName: i.name,
						variant: i.variant,
						quantity: i.quantity,
						price: i.price,
						originalPrice: i.originalPrice,
					})),
					totalAmount: finalAmount,
					paymentMethod: (paymentMethod as "cash" | "qris" | "transfer") || "cash",
					customerName: customerInfo.name || "Pelanggan",
					tableNumber: orderData?.tableNumber,
					orderType: orderData?.orderType,
					voucherId: discountId as Id<"discounts"> | undefined,
					discountAmount,
					taxAmount,
					serviceChargeAmount,
					autoComplete: orderData?.autoComplete,
				};

				if (!navigator.onLine) {
					queueOfflineAction("createOrder", orderPayload);
					toast.warning("Offline: pesanan masuk antrean sinkronisasi");
					clearCart();
					setIsPaymentOpen(false);
					setIsCartOpen(false);
					return;
				}

				const orderId = await createOrder(orderPayload);

				toast.success("Pesanan berhasil dibuat!");
				setLastOrderId(orderId);
				
				// Attempt to print receipt
				if (bluetoothPrinter.isConnected()) {
					handlePrint(orderId);
				} else {
					toast.info("Pesanan disimpan. Hubungkan printer untuk cetak struk.", {
						description: "Gunakan menu Riwayat untuk cetak ulang nanti."
					});
				}

				clearCart();
				setIsPaymentOpen(false);
				setIsCartOpen(false);
			} catch (error) {
				console.error(error);
				toast.error("Gagal membuat pesanan");
			} finally {
				setIsSubmitting(false);
			}
		},
		[cartItems, createOrder, clearCart, discountAmount, taxAmount, serviceChargeAmount, customerInfo.name, isShiftOpen, handlePrint]
	);

	const isLoading = products === undefined || categories === undefined;
	const cartDiscountPreview = Math.max(0, discountAmount || 0);
	const printerStatus = bluetoothPrinter.getStatus();

	const handleOpenSidebar = (tabId: string) => {
		setActiveSidebarTab(tabId);
		setIsSidebarOpen(true);
	};

	return (
		<div className="flex h-screen flex-row bg-background overflow-hidden relative">
			{/* LEFT CONTENT: Menu Area */}
			<div className="flex flex-1 flex-col overflow-hidden relative">
				{/* Shift Closed Overlay */}
				{!isShiftOpen && (
					<div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm">
						<div className="flex flex-col items-center justify-center p-8 text-center max-w-md bg-card rounded-3xl shadow-2xl border border-border/50">
							<div className="flex h-20 w-20 items-center justify-center rounded-full bg-rose-100 text-rose-600 mb-6">
								<Wallet className="h-10 w-10" />
							</div>
							<h2 className="text-2xl font-black tracking-tight mb-2">Shift Kasir Tertutup</h2>
							<p className="text-muted-foreground text-sm mb-8 leading-relaxed">
								Anda belum bisa menggunakan aplikasi kasir. Silakan buka shift terlebih dahulu untuk mulai melayani pelanggan dan mencatat transaksi.
							</p>
							<button
								onClick={() => {
									setActiveSidebarTab("dashboard");
									setIsSidebarOpen(true);
								}}
								className="flex items-center justify-center gap-2 rounded-xl bg-primary px-8 py-4 font-bold text-primary-foreground text-sm transition-all hover:opacity-90 active:scale-95 w-full shadow-lg shadow-primary/20"
								type="button"
							>
								<BarChart3 className="h-4 w-4" /> Buka Shift Sekarang
							</button>
						</div>
					</div>
				)}



				{/* Shift Target Progress Banner */}
				{isShiftOpen && <ShiftTargetBanner />}

				{/* === HEADER === */}
				<header
					ref={headerRef}
					className={cn(
						"sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur-sm shrink-0"
					)}
				>
					<div className="flex items-center justify-between gap-3 px-3 py-1.5 sm:py-2">
						{/* --- LEFT: Logo & Store Name --- */}
						<div 
							className={cn(
								"flex items-center gap-2 min-w-0 shrink-0 rounded-lg transition-all",
								isKeyboardActive && isZoneFocused("header") && focusedHeaderIndex === 0 && "ring-2 ring-primary ring-offset-4"
							)}
						>
							<div
								className="flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-lg font-bold text-white shadow-sm ring-1 ring-black/5"
								style={{ background: themeColor ?? "var(--color-primary)" }}
							>
								{logoUrl ? (
									<img
										src={logoUrl}
										alt={storeName}
										className="h-full w-full rounded-lg object-contain"
									/>
								) : (
									<Coffee className="h-3.5 w-3.5" />
								)}
							</div>
							<div className="min-w-0">
								<h1 className="truncate font-black text-foreground text-xs uppercase tracking-tight leading-none">
									{storeName}
								</h1>
								<p className="text-muted-foreground text-[7px] uppercase font-bold tracking-[0.1em] mt-0.5 opacity-50 hidden sm:block">POS & Inventory</p>
							</div>
						</div>

						{/* --- CENTER: Status Indicators (Compact Badges) --- */}
						<div className="flex items-center gap-1.5 sm:gap-2.5 overflow-x-auto scrollbar-none mask-fade-edges min-w-0 flex-1 justify-center px-2">
							{/* Shift Badge */}
							<div className={cn("flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[8px] font-black uppercase tracking-tight", isShiftOpen ? "bg-emerald-50 text-emerald-600 border border-emerald-100" : "bg-rose-50 text-rose-600 border border-rose-100")}>
								<span className={cn("h-1 w-1 rounded-full", isShiftOpen ? "bg-emerald-500 animate-pulse" : "bg-rose-500")} />
								<span>{isShiftOpen ? (shiftStatus?.shiftInfo?.shiftName || "Shift Aktif") : "Shift Tutup"}</span>
							</div>

							{/* Cashier Info - Desktop Only */}
							{isShiftOpen && shiftStatus?.shiftInfo?.cashierName && (
								<div className="hidden md:flex items-center gap-1 text-[8px] font-bold uppercase text-muted-foreground opacity-80 border-l border-border pl-2">
									<User className="h-2.5 w-2.5" />
									<span className="truncate max-w-[80px]">{shiftStatus.shiftInfo.cashierName}</span>
								</div>
							)}

							{/* Clock */}
							<div className="flex items-center gap-1 text-[8px] font-black font-mono text-muted-foreground opacity-70 border-l border-border pl-2">
								<Clock className="h-2.5 w-2.5" />
								<span>{currentTime.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</span>
							</div>

							{/* Printer Status */}
							<div className={cn("flex items-center gap-1 px-1 py-0.5 rounded-md text-[8px] font-bold uppercase", isPrinterConnected ? "text-blue-600 bg-blue-50/50" : "text-muted-foreground/50")}>
								<Printer className="h-2.5 w-2.5" />
								<span className="hidden sm:inline">{isPrinterConnected ? "Ready" : "Offline"}</span>
							</div>

							{/* Offline Queue */}
							{offlinePendingCount > 0 && (
								<div className="bg-amber-50 text-amber-600 px-1 py-0.5 rounded-md text-[8px] font-bold border border-amber-100">
									Q: {offlinePendingCount}
								</div>
							)}
						</div>

						{/* --- RIGHT: Navigation Buttons --- */}
						<div className="flex items-center gap-0.5 sm:gap-1 scrollbar-none mask-fade-edges min-w-0 justify-end">
							{SIDEBAR_MENU_ITEMS.map((item, index) => {
								const Icon = item.icon;
								const isFocused = isKeyboardActive && isZoneFocused("header") && focusedHeaderIndex === index + 1;
								const isActive = activeSidebarTab === item.id && isSidebarOpen;
								const needsAttention = !isShiftOpen && item.id === "dashboard";
								
								return (
									<div key={item.id} className="relative">
										<button
											onClick={() => {
												setActiveSidebarTab(item.id);
												setIsSidebarOpen(true);
											}}
											className={cn(
												"flex items-center gap-1.5 rounded-lg px-2 py-1.5 transition-all shrink-0",
												"hover:bg-muted active:scale-95",
												isActive
													? "bg-primary text-primary-foreground shadow-sm"
													: needsAttention 
														? "bg-rose-50 text-rose-600 hover:bg-rose-100" 
														: "text-muted-foreground hover:text-foreground",
												isFocused && "ring-2 ring-primary ring-inset"
											)}
											type="button"
											title={item.label}
										>
											<Icon className={cn("h-3.5 w-3.5")} />
											<span className="text-[9px] font-black tracking-tight uppercase hidden xl:block">{item.label}</span>
										</button>
										{needsAttention && (
											<span className="absolute top-0.5 right-0.5 flex h-1.5 w-1.5">
												<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
												<span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-rose-500"></span>
											</span>
										)}
									</div>
								);
							})}
						</div>

						{/* Hidden MenuSidebar for control */}
						<MenuSidebar 
							hideTrigger
							triggerOpen={isSidebarOpen} 
							onOpenChange={setIsSidebarOpen} 
							initialTab={activeSidebarTab}
						/>
					</div>

					{/* Compact Summary Row - Only show on mobile (md:hidden) because desktop has it in the sidebar */}
					<div className="md:hidden grid grid-cols-3 gap-2 border-t border-border/60 bg-muted/5 px-4 py-2.5">
						<div className="rounded-xl border border-border/70 bg-background px-2.5 py-1.5 shadow-sm">
							<p className="text-[8px] font-black uppercase tracking-widest text-muted-foreground opacity-70">Item</p>
							<p className="text-xs font-black text-foreground leading-tight">{totalItems}</p>
						</div>
						<div className="rounded-xl border border-emerald-100 bg-emerald-50/50 px-2.5 py-1.5 shadow-sm">
							<p className="text-[8px] font-black uppercase tracking-widest text-emerald-700/70">Total</p>
							<p className="text-xs font-black text-emerald-700 leading-tight">{fmt(finalTotal)}</p>
						</div>
						<div className="rounded-xl border border-orange-100 bg-orange-50/50 px-2.5 py-1.5 shadow-sm">
							<p className="text-[8px] font-black uppercase tracking-widest text-orange-700/70">Diskon</p>
							<p className="text-xs font-black text-orange-700 leading-tight">{fmt(cartDiscountPreview)}</p>
						</div>
					</div>

					{/* Search & Categories Bar - Now more compact */}
					<div className="px-4 py-2 sm:py-2.5 flex flex-col sm:flex-row gap-2 sm:items-center">
						<div className="relative flex-1 group">
							<Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground transition-colors group-focus-within:text-primary" />
							<Input
								type="text"
								placeholder="Cari produk... (/)"
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
								onFocus={() => setIsSearchFocused(true)}
								onBlur={() => setIsSearchFocused(false)}
								className="h-9 pl-9 pr-9 bg-muted/30 border-transparent focus:bg-background focus:border-primary transition-all text-sm"
							/>
							{searchQuery && (
								<button
									type="button"
									onClick={() => setSearchQuery("")}
									className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center justify-center hover:bg-muted p-0.5 rounded-full"
								>
									<X className="h-3.5 w-3.5 text-muted-foreground" />
								</button>
							)}
						</div>
						
						{/* Inline Category Tabs for Desktop - Move categories here? No, keep them separate but thin */}
					</div>

					{/* Category Tabs - Thin & Minimalist */}
					<div
						ref={categoryScrollRef}
						className={cn(
							"flex gap-1.5 overflow-x-auto px-4 pb-2.5 scrollbar-none mask-fade-edges"
						)}
					>
						{categoryList.map((cat, index) => {
							const isActive = activeCategoryId === cat._id || (cat._id === "all" && !activeCategoryId);
							const isFocused = isKeyboardActive && isZoneFocused("categories") && focusedCategoryIndex === index;
							return (
								<button
									key={cat._id}
									type="button"
									onClick={() => handleCategorySelect(index)}
									className={cn(
										"shrink-0 rounded-lg px-3.5 py-1.5 text-[10px] font-black uppercase tracking-wider transition-all",
										isActive
											? "bg-primary text-primary-foreground shadow-md ring-1 ring-primary"
											: "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground border border-border/50",
										isFocused && "ring-2 ring-primary ring-offset-2"
									)}
								>
									{cat.name}
								</button>
							);
						})}
					</div>
				</header>

				{/* === PRODUCT GRID === */}
				<main className="flex-1 overflow-y-auto pb-24 bg-muted/10">
					<div
						ref={productGridRef}
						className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 p-4"
					>
						{isLoading ? (
							// Loading skeletons
							Array.from({ length: 8 }).map((_, i) => (
								<div
									key={i}
									className="animate-pulse rounded-2xl bg-muted h-52"
								/>
							))
						) : filteredProducts?.length === 0 ? (
							// Empty state
							<div className="col-span-full flex flex-col items-center justify-center py-20 text-center">
								<ShoppingBag className="mb-3 h-12 w-12 text-muted-foreground/30" />
								<p className="font-medium text-muted-foreground">
									{searchQuery ? "Produk tidak ditemukan" : "Menu kosong"}
								</p>
								<p className="text-muted-foreground/60 text-sm">
									{searchQuery
										? "Coba kata kunci lain"
										: "Belum ada produk tersedia"}
								</p>
							</div>
						) : (
							// Product cards
							filteredProducts?.map((product: any, index: number) => {
								const pricing = calculateEffectivePrice(
									{
										_id: product._id,
										price: product.price,
										categoryId: product.categoryId,
									},
									activeDiscounts
								);
								const cartQty = getCartQty(product._id);
								const isFocused = isKeyboardActive && isZoneFocused("products") && focusedIndex === index;

								return (
									<button
										key={product._id}
										data-product-index={index}
										type="button"
										onClick={() => handleProductClick(product)}
										className={cn(
											"group relative flex flex-col overflow-hidden rounded-2xl border bg-card shadow-sm text-left",
											"transition-all active:scale-[0.97]",
											isFocused && "ring-2 ring-primary ring-offset-2 shadow-lg"
										)}
									>
										{/* Image */}
										<div className="relative h-36 w-full bg-muted">
											{product.image ? (
												<img
													src={product.image}
													alt={product.name}
													className="h-full w-full object-cover"
													loading="lazy"
												/>
											) : (
												<div className="flex h-full items-center justify-center">
													<ShoppingBag className="h-10 w-10 text-muted-foreground/25" />
												</div>
											)}

											{/* Promo badge */}
											{pricing.isPromo && (
												<span className="absolute left-2 top-2 rounded-full bg-red-500 px-2 py-0.5 font-bold text-white text-[10px] shadow">
													{pricing.isHappyHour ? "HAPPY HOUR" : "PROMO"}
												</span>
											)}

											{/* Cart quantity badge */}
											{cartQty > 0 && (
												<span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary font-bold text-[11px] text-primary-foreground shadow">
													{cartQty}
												</span>
											)}

											{/* Keyboard focus indicator */}
											{isFocused && (
												<div className="absolute inset-0 border-2 border-primary rounded-t-2xl pointer-events-none" />
											)}
										</div>

										{/* Info */}
										<div className="flex flex-1 flex-col justify-between p-2.5">
											{product.menuNumber != null && (
												<span className="mb-1 inline-block rounded-md bg-muted px-1.5 py-0.5 font-bold text-[10px] text-muted-foreground leading-none">
													#{product.menuNumber}
												</span>
											)}
											<p className="line-clamp-2 font-semibold text-foreground text-sm leading-tight">
												{product.name}
											</p>
											<div className="mt-1.5 flex items-end justify-between gap-1">
												<div>
													{pricing.isPromo && (
														<p className="text-muted-foreground text-xs line-through leading-none">
															{fmt(pricing.originalPrice)}
														</p>
													)}
													<p
														className="font-bold text-sm"
														style={{ color: themeColor ?? "var(--color-primary)" }}
													>
														{fmt(pricing.finalPrice)}
													</p>
												</div>
											</div>
										</div>
									</button>
								);
							})
						)}
					</div>
				</main>
			</div>

			{/* RIGHT CONTENT: Checkout Sidebar (Desktop/Tablet) */}
			<div className="hidden md:block w-[320px] lg:w-[380px] shrink-0 overflow-hidden relative">
				<CheckoutSidebar 
					onConfirmPayment={handlePaymentConfirm} 
					isSubmitting={isSubmitting} 
					lastOrderId={lastOrderId}
					onPrintLastOrder={() => lastOrderId && handlePrint(lastOrderId)}
				/>
			</div>

			{/* === CART BUTTON (Floating Mobile) === */}
			{(totalItems > 0 || !customerInfo.isSubmitted) && (
				<div className="fixed bottom-4 left-4 right-4 z-20 px-3 md:hidden">
					<button
						type="button"
						onClick={() => setIsCartOpen(true)}
						className={cn(
							"flex w-full items-center justify-between rounded-2xl px-4 py-3.5 font-bold text-white shadow-lg",
							"transition-all active:opacity-90",
							isKeyboardActive && isZoneFocused("cart") && "ring-2 ring-white ring-offset-2 ring-offset-primary"
						)}
						style={{ background: themeColor ?? "var(--color-primary)" }}
					>
						{totalItems > 0 ? (
							<>
								<div className="flex items-center gap-2.5">
									<span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/25 text-sm">
										{totalItems}
									</span>
									<span className="text-sm">Lihat Keranjang</span>
								</div>
								<span className="text-base">{fmt(finalTotal)}</span>
							</>
						) : (
							<div className="flex w-full items-center justify-center gap-2">
								<span className="text-sm">Mulai Pesanan</span>
							</div>
						)}
					</button>
				</div>
			)}

			{/* === PRODUCT DETAIL SHEET === */}
			<Sheet open={!!selectedProduct} onOpenChange={(open) => !open && setSelectedProduct(null)}>
				<SheetContent side="bottom" className="p-0 rounded-t-2xl max-h-[90vh] overflow-y-auto">
					<ProductDetailSheet
						product={selectedProduct}
						activeDiscounts={activeDiscounts}
						onClose={() => setSelectedProduct(null)}
						onAddToCart={(item) => {
							addToCart(item);
							setSelectedProduct(null);
							toast.success(`${item.name} ditambahkan ke keranjang`);
						}}
					/>
				</SheetContent>
			</Sheet>

			{/* === CART DRAWER === */}
			<CartDrawer
				isOpen={isCartOpen}
				onClose={() => setIsCartOpen(false)}
				onConfirmPayment={handlePaymentConfirm}
				isSubmitting={isSubmitting}
				lastOrderId={lastOrderId}
				onPrintLastOrder={() => lastOrderId && handlePrint(lastOrderId)}
			/>

			{/* === PAYMENT MODAL === */}
			<PaymentConfirmationModal
				isOpen={isPaymentOpen}
				onClose={() => setIsPaymentOpen(false)}
				isSubmitting={isSubmitting}
				onConfirm={handlePaymentConfirm}
			/>

			<Dialog open={shiftReminderOpen} onOpenChange={setShiftReminderOpen}>
				<DialogContent className="max-w-md">
					<DialogHeader>
						<DialogTitle className="text-lg font-black tracking-tight">
							{shiftReminderState === "overdue"
								? "Shift Sudah Lewat Jam Tutup"
								: "Shift Akan Segera Ditutup"}
						</DialogTitle>
						<DialogDescription className="text-sm">
							{shiftReminderState === "overdue"
								? `Shift ${shiftStatus?.shiftInfo?.shiftName || ""} sudah melewati jam tutup ${formatClockTime(
										activeShiftSchedule?.closeTime
								  )}. Kasir sebaiknya segera tutup shift.`
								: `Shift ${shiftStatus?.shiftInfo?.shiftName || ""} akan tutup pada ${formatClockTime(
										activeShiftSchedule?.closeTime
								  )}. Popup ini muncul ${shiftReminderMinutes} menit sebelumnya agar kasir bisa bersiap.`}
						</DialogDescription>
					</DialogHeader>

					<div className="rounded-2xl border border-border bg-muted/40 p-4 text-sm">
						<div className="flex items-center justify-between gap-3">
							<span className="text-muted-foreground">Kasir</span>
							<span className="font-bold text-foreground">
								{shiftStatus?.shiftInfo?.cashierName || "-"}
							</span>
						</div>
						<div className="mt-2 flex items-center justify-between gap-3">
							<span className="text-muted-foreground">Jam buka</span>
							<span className="font-bold text-foreground">
								{formatClockTime(activeShiftSchedule?.openTime)}
							</span>
						</div>
						<div className="mt-2 flex items-center justify-between gap-3">
							<span className="text-muted-foreground">Jam tutup</span>
							<span className="font-bold text-foreground">
								{formatClockTime(activeShiftSchedule?.closeTime)}
							</span>
						</div>
					</div>

					<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
						<button
							type="button"
							onClick={() => setShiftReminderOpen(false)}
							className="rounded-xl border border-border px-4 py-2.5 font-bold text-foreground transition-all hover:bg-muted"
						>
							Nanti Lagi
						</button>
						<button
							type="button"
							onClick={() => {
								setShiftReminderOpen(false);
								setActiveSidebarTab("kas");
								setIsSidebarOpen(true);
							}}
							className="rounded-xl bg-primary px-4 py-2.5 font-bold text-primary-foreground transition-all hover:opacity-90"
						>
							Buka Panel Shift
						</button>
					</div>
				</DialogContent>
			</Dialog>

			{/* === KEYBOARD SHORTCUT HINTS === */}
			<div className="fixed bottom-1 right-2 z-10 hidden md:block">
				<div className="flex items-center gap-2 text-[10px] text-muted-foreground/60">
					<span>F1: Header</span>
					<span>F2: Kategori</span>
					<span>F3: Produk</span>
					<span>F4: Keranjang</span>
					<span>Enter: Pilih</span>
					<span>Esc: Kembali</span>
				</div>
			</div>
		</div>
	);
}

// Product Detail Sheet Component
function ProductDetailSheet({
	product,
	activeDiscounts,
	onClose,
	onAddToCart,
}: {
	product: any;
	activeDiscounts: any;
	onClose: () => void;
	onAddToCart: (item: { productId: string; name: string; price: number; quantity: number; variant?: string; image?: string; category?: string }) => void;
}) {
	const [quantity, setQuantity] = useState(1);
	const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({});

	// Reset state when product changes
	useEffect(() => {
		if (product) {
			setQuantity(1);
			setSelectedVariants({});
		}
	}, [product]);

	if (!product) return null;

	const pricing = calculateEffectivePrice(
		{
			_id: product._id,
			price: product.price,
			categoryId: product.categoryId,
		},
		activeDiscounts
	);

	// Calculate variant price
	const variantPrice = Object.entries(selectedVariants).reduce((sum, [groupType, optionName]) => {
		const group = product.variations?.find((g: any) => g.type === groupType);
		const opt = group?.options.find((o: any) => o.name === optionName);
		return sum + (opt?.price ?? 0);
	}, 0);

	const unitPrice = pricing.finalPrice + variantPrice;
	const totalPrice = unitPrice * quantity;

	const variantLabel = Object.entries(selectedVariants)
		.map(([, v]) => v)
		.join(", ");

	const handleAdd = () => {
		onAddToCart({
			productId: product._id,
			name: product.name,
			price: unitPrice,
			quantity,
			variant: variantLabel || undefined,
			image: product.image,
			category: product.categoryId,
		});
	};

	const fmt = (n: number) =>
		new Intl.NumberFormat("id-ID", {
			style: "currency",
			currency: "IDR",
			maximumFractionDigits: 0,
		}).format(n);

	return (
		<div className="flex flex-col">
			{/* Product Image */}
			<div className="relative h-52 w-full bg-muted shrink-0">
				{product.image ? (
					<img
						src={product.image}
						alt={product.name}
						className="h-full w-full object-cover"
					/>
				) : (
					<div className="flex h-full items-center justify-center">
						<ShoppingBag className="h-16 w-16 text-muted-foreground/30" />
					</div>
				)}
				<button
					type="button"
					onClick={onClose}
					className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white"
					aria-label="Tutup"
				>
					<X className="h-4 w-4" />
				</button>
			</div>

			{/* Info */}
			<div className="flex flex-col gap-3 p-4">
				<div>
					<h2 className="font-bold text-foreground text-xl">{product.name}</h2>
					{product.description && (
						<p className="mt-1 text-muted-foreground text-sm leading-snug">
							{product.description}
						</p>
					)}
					<div className="mt-2 flex items-center gap-2">
						{pricing.isPromo && (
							<span className="text-muted-foreground text-sm line-through">
								{fmt(pricing.originalPrice)}
							</span>
						)}
						<span className="font-bold text-primary text-xl">
							{fmt(pricing.finalPrice)}
						</span>
						{pricing.isPromo && pricing.discountName && (
							<span className="rounded-full bg-red-100 px-2 py-0.5 font-medium text-red-600 text-xs">
								{pricing.discountName}
							</span>
						)}
					</div>
				</div>

				{/* Variations */}
				{product.variations && product.variations.length > 0 && (
					<div className="space-y-3">
						{product.variations.map((group: any) => (
							<div key={group.type}>
								<p className="mb-1.5 font-semibold text-foreground text-sm">
									{group.type}
								</p>
								<div className="flex flex-wrap gap-2">
									{group.options.map((opt: any) => {
										const selected = selectedVariants[group.type] === opt.name;
										return (
											<button
												key={opt.name}
												type="button"
												onClick={() =>
													setSelectedVariants((prev) => ({
														...prev,
														[group.type]: opt.name,
													}))
												}
												className={`rounded-xl border px-3 py-1.5 text-sm transition-colors ${
													selected
														? "border-primary bg-primary text-primary-foreground font-semibold"
														: "border-border bg-card text-foreground"
												}`}
											>
												{opt.name}
												{opt.price > 0 && (
													<span className="ml-1 opacity-75">+{fmt(opt.price)}</span>
												)}
											</button>
										);
									})}
								</div>
							</div>
						))}
					</div>
				)}

				{/* Quantity + Add */}
				<div className="flex items-center gap-3">
					<div className="flex items-center gap-2 rounded-xl border border-border bg-card p-1">
						<button
							type="button"
							onClick={() => setQuantity(Math.max(1, quantity - 1))}
							className="flex h-9 w-9 items-center justify-center rounded-lg text-foreground active:bg-muted transition-colors"
							aria-label="Kurangi"
						>
							<Minus className="h-4 w-4" />
						</button>
						<span className="min-w-[2rem] text-center font-bold text-base">
							{quantity}
						</span>
						<button
							type="button"
							onClick={() => setQuantity(quantity + 1)}
							className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground active:opacity-80 transition-opacity"
							aria-label="Tambah"
						>
							<Plus className="h-4 w-4" />
						</button>
					</div>

					<button
						type="button"
						onClick={handleAdd}
						className="flex flex-1 items-center justify-between rounded-xl bg-primary px-4 py-3 font-bold text-primary-foreground shadow-md active:opacity-80 transition-opacity"
					>
						<span>Tambah ke Keranjang</span>
						<span>{fmt(totalPrice)}</span>
					</button>
				</div>
			</div>
		</div>
	);
}
