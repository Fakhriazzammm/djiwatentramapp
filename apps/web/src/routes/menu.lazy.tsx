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
	User,
	TrendingUp,
	ChevronUp,
	ChevronDown
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
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

const fmt = (n: number) =>
	new Intl.NumberFormat("id-ID", {
		style: "currency",
		currency: "IDR",
		maximumFractionDigits: 0,
	}).format(n);

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
	const [isTargetExpanded, setIsTargetExpanded] = useState(false);
	const [isSearchActive, setIsSearchActive] = useState(false);
	const progress = useQuery(api.finance.getCurrentMonthProgress);

	useEffect(() => {
		const updateColumns = () => {
			const width = window.innerWidth;
			if (width >= 1536) setGridColumns(4); // 2xl (fixed 4 columns as requested)
			else if (width >= 1280) setGridColumns(4); // xl
			else if (width >= 1024) setGridColumns(4); // lg
			else if (width >= 768) setGridColumns(2); // md
			else if (width >= 640) setGridColumns(3); // sm
			else setGridColumns(3); // default (mobile 3 columns)
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

	// Derive active parent ID
	const activeParentId = useMemo(() => {
		if (!categories || !activeCategoryId || activeCategoryId === "all") return null;
		const activeCat = categories.find((c: any) => c._id === activeCategoryId);
		if (activeCat) {
			return activeCat.parentId ? activeCat.parentId : activeCat._id;
		}
		return null;
	}, [categories, activeCategoryId]);

	// Category lists for Point 2: Main tabs vs Local chips
	const { categoryTabs, activeSubcategories, activeParentName } = useMemo(() => {
		if (!categories) return { categoryTabs: [{ _id: "all", name: "Semua" }], activeSubcategories: [], activeParentName: "" };
		
		const parents = categories.filter((c: any) => !c.parentId);
		const tabs = [{ _id: "all", name: "Semua" }, ...parents];
		
		let subs: any[] = [];
		let parentName = "";
		if (activeParentId) {
			subs = categories.filter((c: any) => c.parentId === activeParentId);
			const parent = categories.find((c: any) => c._id === activeParentId);
			if (parent) parentName = parent.name;
		}

		return { categoryTabs: tabs, activeSubcategories: subs, activeParentName: parentName };
	}, [categories, activeParentId]);

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
				const cat = categoryTabs[index];
				if (cat && cat._id !== "all") {
					setActiveCategoryId(cat._id);
				}
			}
		},
		[categoryTabs, scrollCategoryIntoView]
	);

	const handleCategoryChange = useCallback(
		(direction: "left" | "right") => {
			scrollCategoryIntoView(
				direction === "right"
					? Math.min(focusedCategoryIndex + 1, categoryTabs.length - 1)
					: Math.max(focusedCategoryIndex - 1, 0)
			);
		},
		[focusedCategoryIndex, categoryTabs.length, scrollCategoryIntoView]
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
			categoryCount: categoryTabs.length,
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
		<div className="flex h-[100dvh] flex-row bg-background overflow-hidden relative">
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

				{/* Shift & Printer Status Header */}
				<div className="border-b border-border bg-muted/40 px-2 sm:px-3 py-1.5 shadow-sm z-40 shrink-0 w-full overflow-hidden">
					<div className="flex flex-nowrap items-center justify-between w-full text-[10px] sm:text-xs font-medium text-muted-foreground/80 overflow-hidden">
						<div className="flex flex-nowrap items-center gap-1.5 sm:gap-2.5 shrink-0 min-w-0">
							<div className="hidden sm:flex items-center gap-1 grayscale opacity-60">
								<Coffee className="h-3 w-3" />
								<span className="whitespace-nowrap leading-none">Workspace Kasir</span>
							</div>
							<div className={cn("flex flex-nowrap items-center gap-1 px-1.5 py-0.5 rounded-md", isShiftOpen ? "bg-emerald-50 text-emerald-600 shadow-[0_0_8px_rgba(16,185,129,0.1)]" : "bg-rose-50 text-rose-600")}>
								<span className={cn("h-1.5 w-1.5 rounded-full shrink-0", isShiftOpen ? "bg-emerald-500 animate-pulse" : "bg-rose-500")} />
								<span className="whitespace-nowrap leading-none font-semibold text-[9px] sm:text-[10px] uppercase tracking-wider">{isShiftOpen ? "Shift Aktif" : "Shift Tutup"}</span>
							</div>
							{isShiftOpen && shiftStatus?.shiftInfo?.cashierName && (
								<div className="flex flex-nowrap items-center gap-1 opacity-75 shrink-0">
									<User className="h-3 w-3 shrink-0" />
									<span className="whitespace-nowrap leading-none">
										{shiftStatus.shiftInfo.cashierName}
										{shiftStatus.shiftInfo.shiftName ? ` • ${shiftStatus.shiftInfo.shiftName}` : ""}
									</span>
								</div>
							)}
						</div>
						<div className="flex flex-nowrap items-center gap-1.5 sm:gap-2.5 shrink-0">
							<div className="flex flex-nowrap items-center gap-1 opacity-75">
								<Clock className="h-3 w-3 shrink-0" />
								<span className="whitespace-nowrap leading-none">{currentTime.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</span>
							</div>
							<div className={cn("flex flex-nowrap items-center gap-1 px-1.5 py-0.5 rounded-md whitespace-nowrap", isPrinterConnected ? "bg-blue-50 text-blue-600 shadow-[0_0_8px_rgba(59,130,246,0.1)]" : "bg-muted text-muted-foreground")}>
								<Printer className="h-3 w-3 shrink-0" />
								<span className="leading-none text-[9px] sm:text-[10px] font-semibold">{isPrinterConnected ? "Printer Siap" : "Offline"}</span>
							</div>
							{offlinePendingCount > 0 && (
								<div className="bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded-md whitespace-nowrap leading-none font-semibold text-[9px]">
									Sync {offlinePendingCount}
								</div>
							)}
						</div>
					</div>
				</div>

				{/* MAIN Y-SCROLL CONTAINER */}
				<main className="flex-1 overflow-y-auto bg-muted/10 relative">
					<header
						ref={headerRef}
						className={cn(
							"bg-background shrink-0"
						)}
					>
					<div className="flex flex-col px-4 py-2 gap-1.5">
						{/* ROW 1: Logo & Store name */}
						<div 
							className={cn(
								"flex items-center justify-between min-w-0 transition-all",
								isKeyboardActive && isZoneFocused("header") && focusedHeaderIndex === 0 && "ring-2 ring-primary ring-offset-4 rounded-lg"
							)}
						>
							<div className="flex items-center gap-2.5 min-w-0">
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
									<h1 className="truncate font-black text-foreground text-xs sm:text-sm uppercase tracking-tight leading-none">
										{storeName}
									</h1>
									<p className="text-muted-foreground text-[7px] uppercase font-bold tracking-widest mt-0.5 opacity-60">POS Kasir & Inventory</p>
								</div>
							</div>


						</div>
					</div>

					{/* TARGET PERFORMANCE PANEL (Below Logo) */}
					{progress && progress.hasTarget && (
						<div className="border-t border-border/50 bg-muted/10 px-4 py-2.5 transition-all">
							<div className="flex items-center justify-between mb-2">
								<div className="flex items-center gap-1.5">
									<TrendingUp className="h-3.5 w-3.5 text-primary" strokeWidth={2.5} />
									<span className="text-[10px] font-black uppercase tracking-widest text-foreground/80">Target Performance</span>
								</div>
								<button 
									onClick={() => setIsTargetExpanded(!isTargetExpanded)}
									className="flex items-center gap-1.5 rounded-full border-2 border-primary/20 px-3 py-1 hover:bg-primary/5 text-primary transition-all active:scale-95"
									type="button"
								>
									<span className="text-[8px] font-bold uppercase tracking-widest">Detail</span>
									{isTargetExpanded ? <ChevronUp className="h-3 w-3" strokeWidth={3} /> : <ChevronDown className="h-3 w-3" strokeWidth={3} />}
								</button>
							</div>

							<div className="grid grid-cols-2 gap-4">
								{/* Shift Progress */}
								<div className="space-y-1">
									<div className="flex items-center justify-between text-[8px] font-bold uppercase tracking-widest text-muted-foreground/80 mb-0.5">
										<span>Shift</span>
										<span>{Math.round((progress.shiftCollected / (progress.shiftTarget || 1)) * 100)}%</span>
									</div>
									<div className="h-1.5 w-full bg-muted/40 rounded-full overflow-hidden">
										<motion.div 
											className="h-full bg-primary"
											initial={{ width: 0 }}
											animate={{ width: `${Math.min(100, (progress.shiftCollected / (progress.shiftTarget || 1)) * 100)}%` }}
										/>
									</div>
									<AnimatePresence>
										{isTargetExpanded && (
											<motion.p 
												initial={{ opacity: 0, height: 0 }}
												animate={{ opacity: 1, height: "auto" }}
												exit={{ opacity: 0, height: 0 }}
												className="text-[9px] font-bold text-muted-foreground/60 leading-none pt-1"
											>
												{fmt(progress.shiftCollected)} / {fmt(progress.shiftTarget)}
											</motion.p>
										)}
									</AnimatePresence>
								</div>

								{/* Daily Progress */}
								<div className="space-y-1">
									<div className="flex items-center justify-between text-[8px] font-bold uppercase tracking-widest text-muted-foreground/80 mb-0.5">
										<span>Harian</span>
										<span>{Math.round((progress.dailyCollected / (progress.dailyTarget || 1)) * 100)}%</span>
									</div>
									<div className="h-1.5 w-full bg-muted/40 rounded-full overflow-hidden">
										<motion.div 
											className="h-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.2)]"
											initial={{ width: 0 }}
											animate={{ width: `${Math.min(100, (progress.dailyCollected / (progress.dailyTarget || 1)) * 100)}%` }}
										/>
									</div>
									<AnimatePresence>
										{isTargetExpanded && (
											<motion.p 
												initial={{ opacity: 0, height: 0 }}
												animate={{ opacity: 1, height: "auto" }}
												exit={{ opacity: 0, height: 0 }}
												className="text-[9px] font-bold text-muted-foreground/60 leading-none pt-1"
											>
												{fmt(progress.dailyCollected)} / {fmt(progress.dailyTarget)}
											</motion.p>
										)}
									</AnimatePresence>
								</div>
							</div>
						</div>
					)}
				</header>

				{/* Hidden MenuSidebar for control */}
				<MenuSidebar 
					hideTrigger
					triggerOpen={isSidebarOpen} 
					onOpenChange={setIsSidebarOpen} 
					initialTab={activeSidebarTab}
				/>


				{/* STICKY CONTROL AREA (Search, Categories, Subcategories) */}
				<div className="sticky top-0 z-30 flex flex-col gap-0 border-b border-border/20 bg-background/95 backdrop-blur-md shadow-sm transition-all pb-1">
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
					</div>

					{/* Category Tabs - Top Header (Main Categories Only) */}
					<div
						ref={categoryScrollRef}
						className={cn(
							"flex gap-1.5 overflow-x-auto px-4 pb-2.5 scrollbar-none mask-fade-edges"
						)}
					>
						{categoryTabs.map((cat, index) => {
							const isActive = activeParentId === cat._id || (cat._id === "all" && !activeParentId);
							const isFocused = isKeyboardActive && isZoneFocused("categories") && focusedCategoryIndex === index;
							
							return (
								<button
									key={cat._id}
									type="button"
									onClick={() => handleCategorySelect(index)}
									className={cn(
										"shrink-0 rounded-lg py-1.5 px-3.5 text-[11px] font-bold uppercase tracking-wide whitespace-nowrap inline-flex items-center justify-center transition-all",
										isActive
											? "bg-primary text-primary-foreground shadow-md ring-1 ring-primary"
											: "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground border border-border/50",
										isFocused && "ring-2 ring-primary ring-offset-2 transition-shadow"
									)}
								>
									{cat.name}
								</button>
							);
						})}
					</div>

					{/* Local Subcategory Chips */}
					{activeSubcategories.length > 0 && (
						<div className="bg-muted/40 border-t border-border/40 px-3 pt-2.5 pb-2.5">
							<div className="flex items-center gap-2 overflow-x-auto scrollbar-none mask-fade-edges">
								<button
									type="button"
									onClick={() => setActiveCategoryId(activeParentId)}
									className={cn(
										"shrink-0 rounded-full px-3 py-1.5 text-[10px] font-bold whitespace-nowrap transition-all shadow-sm border",
										activeCategoryId === activeParentId
											? "bg-white text-foreground border-border/60 scale-100 ring-1 ring-border/50"
											: "bg-background/60 text-muted-foreground hover:bg-white/80 border-transparent hover:text-foreground scale-[0.98]"
									)}
								>
									Semua {activeParentName}
								</button>
								{activeSubcategories.map((sub: any) => (
									<button
										key={sub._id}
										type="button"
										onClick={() => setActiveCategoryId(sub._id)}
										className={cn(
											"shrink-0 rounded-full px-3 py-1.5 text-[10px] font-bold whitespace-nowrap transition-all shadow-sm border",
											activeCategoryId === sub._id
												? "bg-white text-foreground border-border/60 scale-100 ring-1 ring-border/50"
												: "bg-background/60 text-muted-foreground hover:bg-white/80 border-transparent hover:text-foreground scale-[0.98]"
										)}
									>
										{sub.name}
									</button>
								))}
							</div>
						</div>
					)}
				</div>

				<div className="pb-32">
					<div
						ref={productGridRef}
						className="grid grid-cols-3 sm:grid-cols-3 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-4 gap-2 p-3"
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
										<div className="relative h-32 w-full bg-muted shrink-0">
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

											{/* Menu Number Overlay */}
											{product.menuNumber != null && (
												<span className="absolute left-2 bottom-2 rounded px-1.5 py-0.5 bg-black/60 backdrop-blur-sm font-bold text-[10px] text-white shadow-sm">
													#{product.menuNumber}
												</span>
											)}

											{/* Stock Badge Overlay */}
											<span className={cn(
												"absolute right-2 bottom-2 rounded px-1.5 py-0.5 font-bold text-[10px] shadow-sm transition-all",
												(product.quantity ?? 0) <= 0 
													? "bg-slate-500 text-white" 
													: (product.quantity ?? 0) <= 2 
														? "bg-rose-600 text-white animate-pulse" 
														: "bg-blue-600 text-white"
											)}>
												{(product.quantity ?? 0) <= 0 ? "Habis" : `Stok: ${product.quantity}`}
											</span>

											{/* Keyboard focus indicator */}
											{isFocused && (
												<div className="absolute inset-0 border-2 border-primary rounded-t-2xl pointer-events-none" />
											)}
										</div>

										{/* Info */}
										<div className="flex flex-1 flex-col justify-between p-2.5 pt-2">
											<p className="line-clamp-2 font-bold text-foreground text-[13px] leading-tight">
												{product.name}
											</p>
											<div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
												<p
													className="font-black text-sm leading-none"
													style={{ color: themeColor ?? "var(--color-primary)" }}
												>
													{fmt(pricing.finalPrice)}
												</p>
												{pricing.isPromo && (
													<p className="text-muted-foreground/70 text-[10px] font-semibold line-through leading-none">
														{fmt(pricing.originalPrice)}
													</p>
												)}
											</div>
										</div>
									</button>
								);
							})
						)}
					</div>
				</div>

				</main>
				{/* === BOTTOM NAVIGATION BAR (Fixed) === */}
				<div className="shrink-0 w-full border-t border-border bg-background/95 backdrop-blur-xl pb-safe-area shadow-[0_-8px_30px_rgba(0,0,0,0.08)] px-3 pt-2 sm:pt-3">
					<div className="flex items-center justify-around max-w-lg mx-auto sm:max-w-none gap-0.5 sm:gap-1">
						{SIDEBAR_MENU_ITEMS.map((item, index) => {
							const Icon = item.icon;
							const isFocused = isKeyboardActive && isZoneFocused("header") && focusedHeaderIndex === index + 1;
							const isActive = isSidebarOpen && activeSidebarTab === item.id;
							const needsAttention = item.id === "shift" && !isShiftOpen;

							return (
								<button
									key={item.id}
									onClick={() => {
										setActiveSidebarTab(item.id);
										setIsSidebarOpen(true);
									}}
									className={cn(
										"flex flex-col items-center gap-0.5 min-w-[40px] transition-all",
										isActive ? "text-primary" : "text-muted-foreground hover:text-foreground",
										isFocused && "ring-1 ring-primary rounded-md p-0.5"
									)}
									type="button"
								>
									<div className={cn(
										"flex h-7 w-7 items-center justify-center rounded-lg transition-all",
										isActive ? "bg-primary/10" : "bg-transparent hover:bg-muted/50",
										needsAttention && "bg-rose-50 text-rose-600 shadow-[0_0_10px_rgba(225,29,72,0.2)]"
									)}>
										<Icon className={cn("h-4 w-4", needsAttention && "animate-bounce")} />
									</div>
									<span className="text-[7px] font-bold uppercase tracking-tight leading-none text-center block sm:hidden">
										{item.label.split(' ')[0]}
									</span>
									<span className="text-[8px] font-bold uppercase tracking-tight leading-none text-center hidden sm:block">
										{item.label}
									</span>
								</button>
							);
						})}
					</div>
				</div>
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
				<div className="fixed bottom-28 left-4 right-4 z-20 px-3 md:hidden">
					<button
						type="button"
						onClick={() => setIsCartOpen(true)}
						className={cn(
							"flex w-full items-center justify-between rounded-2xl px-4 py-3.5 font-bold text-white shadow-lg",
							"transition-all active:opacity-90 active:scale-[0.98]",
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
								<span className="text-sm uppercase tracking-widest font-black">Mulai Pesanan</span>
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
