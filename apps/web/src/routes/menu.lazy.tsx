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

	const shiftStatus = useQuery(api.finance.getShiftStatus);
	const isShiftOpen = shiftStatus?.isOpen ?? false;

	// Printer State
	const [isPrinterConnected, setIsPrinterConnected] = useState(bluetoothPrinter.isConnected());
	const [currentTime, setCurrentTime] = useState(new Date());

	// Periodically check printer connection and update time
	useEffect(() => {
		const interval = setInterval(() => {
			setIsPrinterConnected(bluetoothPrinter.isConnected());
			setCurrentTime(new Date());
		}, 3000);
		return () => clearInterval(interval);
	}, []);

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
				quantity: i.quantity,
			}));
			
			const subtotal = items.reduce((sum: number, item: OrderItem) => sum + item.price * item.quantity, 0);

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
				const orderId = await createOrder({
					items: cartItems.map((i) => ({
						productId: i.productId as Id<"products">,
						productName: i.name,
						variant: i.variant,
						quantity: i.quantity,
						price: i.price,
					})),
					totalAmount: finalAmount,
					paymentMethod: (paymentMethod as "cash" | "qris" | "transfer") || "cash",
					customerName: customerInfo.name || "Pelanggan",
					tableNumber: orderData?.tableNumber,
					orderType: orderData?.orderType,
					voucherId: discountId as Id<"discounts"> | undefined,
					discountAmount: totalAmount - finalAmount + taxAmount + serviceChargeAmount,
					autoComplete: orderData?.autoComplete,
				});

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
		[cartItems, createOrder, clearCart, totalAmount, taxAmount, serviceChargeAmount, customerInfo.name, isShiftOpen, handlePrint]
	);

	const isLoading = products === undefined || categories === undefined;

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

				{/* Shift & Printer Status Header */}
				<div className="flex items-center justify-between border-b border-border bg-muted/50 px-2 sm:px-4 py-1.5 text-[9px] sm:text-[11px] font-medium shadow-sm z-40 shrink-0 overflow-x-auto scrollbar-none">
					<div className="flex items-center gap-2 sm:gap-4 whitespace-nowrap min-w-max pr-2">
						{/* Shift Status */}
						<div className="flex items-center gap-1.5">
							<span className={cn("flex h-2 w-2 sm:h-2.5 sm:w-2.5 rounded-full shrink-0", isShiftOpen ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" : "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]")} />
							<span className="text-muted-foreground">{isShiftOpen ? "Shift Aktif" : "Shift Tutup"}</span>
						</div>

						{/* Time & Date */}
						{isShiftOpen && (
							<>
								<div className="h-3 w-px bg-border shrink-0" />
								<div className="flex items-center gap-1 sm:gap-1.5 text-muted-foreground">
									<Clock className="h-2.5 w-2.5 sm:h-3 sm:w-3 shrink-0" />
									<span className="hidden sm:inline">
										{currentTime.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
									</span>
									<span className="sm:hidden">
										{currentTime.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "2-digit" })}
									</span>
									<span className="font-mono ml-0.5 sm:ml-1 font-bold">
										{currentTime.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
									</span>
								</div>
							</>
						)}

						{/* Cashier Info */}
						{isShiftOpen && shiftStatus?.shiftInfo?.cashierName && (
							<>
								<div className="h-3 w-px bg-border shrink-0" />
								<div className="flex items-center gap-1 sm:gap-1.5 text-muted-foreground">
									<User className="h-2.5 w-2.5 sm:h-3 sm:w-3 shrink-0" />
									<span className="truncate max-w-[60px] sm:max-w-none">{shiftStatus.shiftInfo.cashierName}</span>
									{shiftStatus.shiftInfo.shiftName && (
										<>
											<span className="opacity-50">•</span>
											<span className="font-semibold text-foreground/70 truncate max-w-[60px] sm:max-w-none">{shiftStatus.shiftInfo.shiftName}</span>
										</>
									)}
								</div>
							</>
						)}
					</div>

					{/* Printer Status */}
					<div className={cn("flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2 py-0.5 rounded-md shrink-0 ml-auto", isPrinterConnected ? "bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400" : "bg-muted text-muted-foreground")}>
						<Printer className="h-2.5 w-2.5 sm:h-3 sm:w-3 shrink-0" />
						<span className="uppercase tracking-wider font-bold">
							{isPrinterConnected ? "ON" : "OFF"}
						</span>
					</div>
				</div>

				{/* Shift Target Progress Banner */}
				{isShiftOpen && <ShiftTargetBanner />}

				{/* === HEADER === */}
				<header
					ref={headerRef}
					className={cn(
						"sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur-sm shrink-0"
					)}
				>
					<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 px-3 sm:px-4 py-2 sm:py-3">
						{/* Logo & Store name */}
						<div 
							className={cn(
								"flex items-center gap-2 min-w-0 shrink-0 rounded-lg transition-all",
								isKeyboardActive && isZoneFocused("header") && focusedHeaderIndex === 0 && "ring-2 ring-primary ring-offset-4"
							)}
						>
							{logoUrl ? (
								<img
									src={logoUrl}
									alt={storeName}
									className="h-8 w-8 sm:h-9 sm:w-9 shrink-0 rounded-lg object-contain"
								/>
							) : (
								<div
									className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-lg font-bold text-white text-sm"
									style={{ background: themeColor ?? "var(--color-primary)" }}
								>
									<Coffee className="h-4 w-4" />
								</div>
							)}
							<div className="min-w-0">
								<h1 className="truncate font-bold text-foreground text-sm sm:text-base leading-tight">
									{storeName}
								</h1>
								<p className="text-muted-foreground text-[10px] sm:text-xs">POS Menu</p>
							</div>
						</div>

						{/* Navigation Buttons from Hamburger */}
						<div className="flex items-center gap-1 sm:gap-2 overflow-x-auto scrollbar-none pb-1 sm:pb-0 -mb-1 sm:mb-0 mask-fade-edges min-w-0 flex-1 sm:justify-end">
							{SIDEBAR_MENU_ITEMS.map((item, index) => {
								const Icon = item.icon;
								const isFocused = isKeyboardActive && isZoneFocused("header") && focusedHeaderIndex === index + 1;
								const isActive = activeSidebarTab === item.id && isSidebarOpen;
								
								// Highlight "dashboard" button if shift is closed
								const needsAttention = !isShiftOpen && item.id === "dashboard";
								
								return (
									<div key={item.id} className="relative">
										{needsAttention && (
											<span className="absolute -top-1 -right-1 flex h-3 w-3">
												<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
												<span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500 border border-white"></span>
											</span>
										)}
										<button
											onClick={() => {
												setActiveSidebarTab(item.id);
												setIsSidebarOpen(true);
											}}
											className={cn(
												"flex flex-col items-center justify-center gap-1 rounded-xl px-3 py-1.5 transition-all shrink-0 min-w-[4rem]",
												"hover:bg-muted active:scale-95",
												isActive
													? "bg-muted ring-2 ring-primary ring-inset text-primary"
													: needsAttention 
														? "bg-rose-50 text-rose-600 hover:bg-rose-100" 
														: "text-muted-foreground hover:text-foreground",
												isFocused && "bg-muted ring-2 ring-primary ring-inset"
											)}
											type="button"
										>
											<Icon className={cn("h-4 w-4 sm:h-5 sm:w-5", needsAttention && "animate-pulse")} />
											<span className="text-[9px] sm:text-[10px] font-medium leading-none whitespace-nowrap">{item.label}</span>
										</button>
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

					{/* Search Bar */}
					<div className="px-4 pb-3">
						<div className="relative flex items-center">
							<Search className="pointer-events-none absolute left-3 h-4 w-4 text-muted-foreground" />
							<Input
								type="text"
								placeholder="Cari produk... (tekan /)"
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
								onFocus={() => setIsSearchFocused(true)}
								onBlur={() => setIsSearchFocused(false)}
								onKeyDown={(e) => {
									if (e.key === "ArrowDown" && filteredProducts?.length) {
										e.preventDefault();
										e.currentTarget.blur();
										setFocusZone("products");
										setFocusedIndex(0);
									} else if (e.key === "Escape") {
										e.currentTarget.blur();
									}
								}}
								className="pl-9 pr-9 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary"
							/>
							{searchQuery && (
								<button
									type="button"
									onClick={() => setSearchQuery("")}
									className="absolute right-3 flex items-center justify-center"
								>
									<X className="h-4 w-4 text-muted-foreground" />
								</button>
							)}
						</div>
					</div>

					{/* Category Tabs */}
					<div
						ref={categoryScrollRef}
						className={cn(
							"flex gap-2 overflow-x-auto px-4 pb-3 scrollbar-none"
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
										"shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-all",
										isActive
											? "bg-primary text-primary-foreground shadow-sm"
											: "bg-muted text-muted-foreground hover:bg-muted/80",
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
				<main className="flex-1 overflow-y-auto pb-24">
					<div
						ref={productGridRef}
						className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 p-3"
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