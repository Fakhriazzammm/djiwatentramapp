import { createLazyFileRoute } from "@tanstack/react-router";
import { api } from "@yumipos/backend/convex/_generated/api";
import type { Id } from "@yumipos/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import {
	CheckCircle,
	ChevronLeft,
	Minus,
	Plus,
	Search,
	ShoppingBag,
	ShoppingCart,
	Trash2,
	X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { calculateEffectivePrice, isFreeRefillActive } from "@/lib/utils/pricing";

export const Route = createLazyFileRoute("/$brandSlug")({
	component: CustomerMenuPage,
});

// ─── Types ────────────────────────────────────────────────────────────────────

interface CustomerCartItem {
	productId: string;
	name: string;
	price: number;
	originalPrice?: number;
	quantity: number;
	variant?: string;
	image?: string;
	categoryId: string;
}

interface VariationGroup {
	type: string;
	options: { name: string; price: number }[];
}

type SheetView = "cart" | "checkout" | "qris" | "transfer" | "success" | null;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
	new Intl.NumberFormat("id-ID", {
		style: "currency",
		currency: "IDR",
		maximumFractionDigits: 0,
	}).format(n);

// ─── Product Detail Sheet ─────────────────────────────────────────────────────

function ProductDetailSheet({
	product,
	activeDiscounts,
	onClose,
	onAddToCart,
}: {
	product: {
		_id: string;
		name: string;
		price: number;
		image?: string;
		description?: string;
		categoryId: string;
		variations?: VariationGroup[];
	} | null;
	activeDiscounts: any[] | undefined;
	onClose: () => void;
	onAddToCart: (item: CustomerCartItem) => void;
}) {
	const [qty, setQty] = useState(1);
	const [selectedVariants, setSelectedVariants] = useState<
		Record<string, string>
	>({});

	useEffect(() => {
		if (product) {
			setQty(1);
			setSelectedVariants({});
		}
	}, [product]);

	if (!product) return null;

	const pricing = calculateEffectivePrice(
		{ _id: product._id, price: product.price, categoryId: product.categoryId },
		activeDiscounts
	);

	const variantPrice = Object.entries(selectedVariants).reduce(
		(sum, [groupType, optionName]) => {
			const group = product.variations?.find((g) => g.type === groupType);
			const opt = group?.options.find((o) => o.name === optionName);
			return sum + (opt?.price ?? 0);
		},
		0
	);

	const unitPrice = pricing.finalPrice + variantPrice;
	const totalPrice = unitPrice * qty;

	const variantLabel = Object.entries(selectedVariants)
		.map(([, v]) => v)
		.join(", ");

	const handleAdd = () => {
		onAddToCart({
			productId: product._id,
			name: product.name,
			price: unitPrice,
			originalPrice: pricing.originalPrice + variantPrice,
			quantity: qty,
			variant: variantLabel || undefined,
			image: product.image,
			categoryId: product.categoryId,
		});
		onClose();
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
						{product.variations.map((group) => (
							<div key={group.type}>
								<p className="mb-1.5 font-semibold text-foreground text-sm">
									{group.type}
								</p>
								<div className="flex flex-wrap gap-2">
									{group.options.map((opt) => {
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
							onClick={() => setQty(Math.max(1, qty - 1))}
							className="flex h-9 w-9 items-center justify-center rounded-lg text-foreground active:bg-muted transition-colors"
							aria-label="Kurangi"
						>
							<Minus className="h-4 w-4" />
						</button>
						<span className="min-w-[2rem] text-center font-bold text-base">
							{qty}
						</span>
						<button
							type="button"
							onClick={() => setQty(qty + 1)}
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

// ─── Cart Item Row ─────────────────────────────────────────────────────────────

function CartItemRow({
	item,
	onUpdate,
}: {
	item: CustomerCartItem;
	onUpdate: (productId: string, variant: string | undefined, delta: number) => void;
}) {
	return (
		<div className="flex items-center gap-3 py-3 border-b border-border last:border-0">
			{item.image ? (
				<img
					src={item.image}
					alt={item.name}
					className="h-12 w-12 shrink-0 rounded-lg object-cover"
				/>
			) : (
				<div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10">
					<span className="font-bold text-primary/50 text-sm">
						{item.name.charAt(0)}
					</span>
				</div>
			)}

			<div className="min-w-0 flex-1">
				<p className="line-clamp-1 font-medium text-foreground text-sm">
					{item.name}
				</p>
				{item.variant && (
					<p className="text-muted-foreground text-xs">{item.variant}</p>
				)}
				<p className="mt-0.5 font-semibold text-primary text-sm">
					{fmt(item.price * item.quantity)}
				</p>
			</div>

			<div className="flex shrink-0 items-center gap-1.5">
				{item.quantity === 1 ? (
					<button
						type="button"
						aria-label={`Hapus ${item.name}`}
						onClick={() => onUpdate(item.productId, item.variant, -1)}
						className="flex h-8 w-8 items-center justify-center rounded-lg bg-destructive/10 text-destructive active:bg-destructive/20 transition-colors"
					>
						<Trash2 className="h-3.5 w-3.5" />
					</button>
				) : (
					<button
						type="button"
						aria-label={`Kurangi ${item.name}`}
						onClick={() => onUpdate(item.productId, item.variant, -1)}
						className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card active:bg-muted transition-colors"
					>
						<Minus className="h-3.5 w-3.5" />
					</button>
				)}
				<span className="min-w-[1.5rem] text-center font-bold text-sm">
					{item.quantity}
				</span>
				<button
					type="button"
					aria-label={`Tambah ${item.name}`}
					onClick={() => onUpdate(item.productId, item.variant, 1)}
					className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground active:opacity-80 transition-opacity"
				>
					<Plus className="h-3.5 w-3.5" />
				</button>
			</div>
		</div>
	);
}

// ─── Price Summary ─────────────────────────────────────────────────────────────

function PriceSummary({
	subtotal,
	tax,
	serviceCharge,
	taxRate,
	serviceChargeRate,
	total,
}: {
	subtotal: number;
	tax: number;
	serviceCharge: number;
	taxRate: number;
	serviceChargeRate: number;
	total: number;
}) {
	return (
		<div className="space-y-1.5 rounded-xl bg-muted/50 p-3">
			<div className="flex justify-between text-sm">
				<span className="text-muted-foreground">Subtotal</span>
				<span className="font-medium">{fmt(subtotal)}</span>
			</div>
			{serviceCharge > 0 && (
				<div className="flex justify-between text-sm">
					<span className="text-muted-foreground">Servis ({serviceChargeRate}%)</span>
					<span className="font-medium text-muted-foreground">{fmt(serviceCharge)}</span>
				</div>
			)}
			{tax > 0 && (
				<div className="flex justify-between text-sm">
					<span className="text-muted-foreground">Pajak ({taxRate}%)</span>
					<span className="font-medium text-muted-foreground">{fmt(tax)}</span>
				</div>
			)}
			<div className="flex justify-between border-t border-border pt-2 mt-2">
				<span className="font-bold text-foreground">Total</span>
				<span className="font-bold text-foreground text-lg">{fmt(total)}</span>
			</div>
		</div>
	);
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

function CustomerMenuPage() {
	const { brandSlug } = Route.useParams();

	// Data
	const siteSettings = useQuery(api.site_settings.getSettings);
	const brandSettings = useQuery(api.booking.getSettings, { slug: brandSlug });
	const categories = useQuery(api.products.getCategories);
	const activeDiscounts = useQuery(api.discounts.getActiveDiscounts);
	const createOrder = useMutation(api.orders.createOrder);

	// Selected category filter
	const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
	const products = useQuery(api.products.getProducts, {
		categoryId: activeCategoryId
			? (activeCategoryId as Id<"categories">)
			: undefined,
	});

	// Cart state
	const [cart, setCart] = useState<CustomerCartItem[]>([]);

	// Product detail sheet
	const [detailProduct, setDetailProduct] = useState<any | null>(null);

	// Sheet navigation
	const [sheetView, setSheetView] = useState<SheetView>(null);

	// Checkout form
	const [customerName, setCustomerName] = useState("");
	const [tableNumber, setTableNumber] = useState("");
	const [paymentMethod, setPaymentMethod] = useState<"cash" | "qris" | "transfer">("cash");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [orderNumber, setOrderNumber] = useState<string | null>(null);

	// Menu number search
	const [menuSearch, setMenuSearch] = useState("");
	const [menuSearchFeedback, setMenuSearchFeedback] = useState("");
	const allProducts = useQuery(api.products.getProducts, {});

	// Free refill popup
	const [showFreeRefillPopup, setShowFreeRefillPopup] = useState(false);
	const [freeRefillPromo, setFreeRefillPromo] = useState<any | null>(null);
	const freeRefillShownRef = useRef(false);

	// Category scroll ref
	const categoryScrollRef = useRef<HTMLDivElement>(null);

	// Brand display info
	const storeName =
		brandSettings?.title ??
		siteSettings?.storeName ??
		"Menu";
	const logoUrl = brandSettings?.logoUrl ?? siteSettings?.logoUrl;
	const themeColor = brandSettings?.themeColor;

	// Payment methods from settings
	const payMethods = siteSettings?.paymentMethodsManual ?? {
		cash: true,
		qris: true,
		transfer: false,
	};

	// Pricing calculations
	const subtotal = cart.reduce((s, i) => s + i.price * i.quantity, 0);
	const taxRate = siteSettings?.taxRate ?? 0;
	const serviceChargeRate = siteSettings?.serviceChargeRate ?? 0;
	const serviceCharge = subtotal * (serviceChargeRate / 100);
	const tax = subtotal * (taxRate / 100);
	const total = subtotal + serviceCharge + tax;
	const totalItems = cart.reduce((s, i) => s + i.quantity, 0);

	// Cart operations
	const addToCart = (item: CustomerCartItem) => {
		setCart((prev) => {
			const idx = prev.findIndex(
				(i) => i.productId === item.productId && i.variant === item.variant
			);
			if (idx >= 0) {
				return prev.map((i, n) =>
					n === idx ? { ...i, quantity: i.quantity + item.quantity } : i
				);
			}
			return [...prev, item];
		});
	};

	const updateCart = (productId: string, variant: string | undefined, delta: number) => {
		setCart((prev) =>
			prev
				.map((i) =>
					i.productId === productId && i.variant === variant
						? { ...i, quantity: Math.max(0, i.quantity + delta) }
						: i
				)
				.filter((i) => i.quantity > 0)
		);
	};

	// Quick add for products without variations
	const handleProductTap = (product: any) => {
		const hasVariations =
			product.variations && product.variations.length > 0;
		if (hasVariations) {
			setDetailProduct(product);
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
				categoryId: product.categoryId,
			});
		}
	};

	// Get cart quantity for a product
	const getCartQty = (productId: string) =>
		cart
			.filter((i) => i.productId === productId)
			.reduce((s, i) => s + i.quantity, 0);

	// Submit order
	const handleConfirmOrder = async () => {
		if (cart.length === 0) return;
		setIsSubmitting(true);
		try {
			const customerLabel = [
				customerName.trim() || "Pelanggan",
				tableNumber.trim() ? `Meja ${tableNumber.trim()}` : null,
			]
				.filter(Boolean)
				.join(" - ");

			const id = await createOrder({
				items: cart.map((i) => ({
					productId: i.productId as Id<"products">,
					productName: i.name,
					variant: i.variant,
					quantity: i.quantity,
					price: i.price,
					originalPrice: i.originalPrice,
				})),
				totalAmount: total,
				taxAmount: tax,
				serviceChargeAmount: serviceCharge,
				paymentMethod,
				customerName: customerLabel,
				discountAmount: cart.reduce(
					(sum, item) => sum + Math.max(0, (item.originalPrice ?? item.price) - item.price) * item.quantity,
					0
				),
			});

			// Derive order number from id (last 6 chars of Convex ID)
			const oidStr = String(id);
			setOrderNumber(`ORD-${oidStr.slice(-4).toUpperCase()}`);

			if (paymentMethod === "qris") {
				setSheetView("qris");
			} else if (paymentMethod === "transfer") {
				setSheetView("transfer");
			} else {
				setSheetView("success");
			}
		} catch (err) {
			console.error(err);
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleReset = () => {
		setCart([]);
		setCustomerName("");
		setTableNumber("");
		setPaymentMethod("cash");
		setOrderNumber(null);
		setSheetView(null);
	};

	// Available payment methods
	const availablePayMethods = useMemo(() => {
		const list: { key: "cash" | "qris" | "transfer"; label: string; desc: string }[] = [];
		if (payMethods.cash) list.push({ key: "cash", label: "Tunai", desc: "Bayar di kasir" });
		if (payMethods.qris) list.push({ key: "qris", label: "QRIS", desc: "Scan QR code" });
		if (payMethods.transfer) list.push({ key: "transfer", label: "Transfer Bank", desc: "Transfer rekening" });
		return list;
	}, [payMethods]);

	// Set initial payment method when list loads
	const initialPayMethodSet = useRef(false);
	if (!initialPayMethodSet.current && availablePayMethods.length > 0) {
		setPaymentMethod(availablePayMethods[0].key);
		initialPayMethodSet.current = true;
	}

	// Free refill popup: show once when active discounts load
	useEffect(() => {
		if (!activeDiscounts || freeRefillShownRef.current) return;
		const now = new Date();
		const context = {
			currentTimestamp: now.getTime(),
			currentDay: now.getDay(),
			currentTimeVal: now.getHours() * 60 + now.getMinutes(),
		};
		const activeRefill = activeDiscounts.find((d) => isFreeRefillActive(d, context));
		if (activeRefill) {
			freeRefillShownRef.current = true;
			setFreeRefillPromo(activeRefill);
			setShowFreeRefillPopup(true);
		}
	}, [activeDiscounts]);

	// Menu number search: auto-add after 600ms of inactivity
	useEffect(() => {
		if (!menuSearch.trim() || !allProducts) return;
		const timer = setTimeout(() => {
			const num = parseInt(menuSearch, 10);
			if (isNaN(num) || num <= 0) return;
			const found = allProducts.find((p) => p.menuNumber === num);
			if (!found) {
				setMenuSearchFeedback("Nomor menu tidak ditemukan");
				setTimeout(() => setMenuSearchFeedback(""), 2000);
				return;
			}
			const hasVariations = found.variations && found.variations.length > 0;
			if (hasVariations) {
				setDetailProduct(found);
			} else {
				const pricing = calculateEffectivePrice(
					{ _id: found._id, price: found.price, categoryId: found.categoryId },
					activeDiscounts,
				);
				addToCart({
					productId: found._id,
					name: found.name,
					price: pricing.finalPrice,
					originalPrice: pricing.originalPrice,
					quantity: 1,
					image: found.image,
					categoryId: found.categoryId,
				});
			}
			setMenuSearch("");
			setMenuSearchFeedback(`"${found.name}" ditambahkan ke keranjang!`);
			setTimeout(() => setMenuSearchFeedback(""), 2500);
		}, 600);
		return () => clearTimeout(timer);
	}, [menuSearch, allProducts, activeDiscounts]);

	const isLoading = products === undefined || categories === undefined;

	return (
		<div className="flex min-h-screen flex-col bg-background">
			{/* ── Header ── */}
			<header
				className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur-sm"
				style={themeColor ? { borderBottomColor: `${themeColor}40` } : undefined}
			>
				<div className="flex items-center gap-3 px-4 py-3">
					{logoUrl ? (
						<img
							src={logoUrl}
							alt={storeName}
							className="h-9 w-9 shrink-0 rounded-lg object-contain"
						/>
					) : (
						<div
							className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg font-bold text-white text-sm"
							style={{ background: themeColor ?? "var(--color-primary)" }}
						>
							{storeName.charAt(0).toUpperCase()}
						</div>
					)}
					<div className="min-w-0 flex-1">
						<h1 className="truncate font-bold text-foreground text-base leading-tight">
							{storeName}
						</h1>
						<p className="text-muted-foreground text-xs">Menu Digital</p>
					</div>
					{totalItems > 0 && (
						<button
							type="button"
							onClick={() => setSheetView("cart")}
							aria-label={`Keranjang: ${totalItems} item`}
							className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-card active:scale-95 transition-transform"
						>
							<ShoppingCart className="h-5 w-5 text-foreground" />
							<span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 font-bold text-[10px] text-primary-foreground shadow">
								{totalItems}
							</span>
						</button>
					)}
				</div>

				{/* Category Tabs */}
				<div
					ref={categoryScrollRef}
					className="flex gap-2 overflow-x-auto px-4 pb-3 scrollbar-none"
				>
					<button
						type="button"
						onClick={() => setActiveCategoryId(null)}
						className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
							activeCategoryId === null
								? "bg-primary text-primary-foreground shadow-sm"
								: "bg-muted text-muted-foreground"
						}`}
					>
						Semua
					</button>
					{categories?.map((cat) => (
						<button
							key={cat._id}
							type="button"
							onClick={() => setActiveCategoryId(cat._id)}
							className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
								activeCategoryId === cat._id
									? "bg-primary text-primary-foreground shadow-sm"
									: "bg-muted text-muted-foreground"
							}`}
						>
							{cat.name}
						</button>
					))}
				</div>
			</header>

			{/* ── Product Grid ── */}
			<main className="flex-1 px-3 pb-28">
				{/* Menu Number Search */}
				<div className="pt-3 pb-2">
					<p className="mb-1.5 text-xs font-medium text-muted-foreground">
						Cari dengan nomor menu
					</p>
					<div className="relative flex items-center">
						<Search className="pointer-events-none absolute left-3 h-4 w-4 text-muted-foreground" />
						<input
							type="number"
							inputMode="numeric"
							min="1"
							value={menuSearch}
							onChange={(e) => setMenuSearch(e.target.value)}
							placeholder="Ketuk nomor menu..."
							className="w-full rounded-xl border border-border bg-muted/50 py-2.5 pl-9 pr-9 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
							aria-label="Cari menu berdasarkan nomor"
						/>
						{menuSearch && (
							<button
								type="button"
								onClick={() => {
									setMenuSearch("");
									setMenuSearchFeedback("");
								}}
								className="absolute right-3 flex items-center justify-center"
								aria-label="Hapus pencarian"
							>
								<X className="h-4 w-4 text-muted-foreground" />
							</button>
						)}
					</div>
					{menuSearchFeedback && (
						<p
							className={`mt-1 text-xs font-medium ${
								menuSearchFeedback.includes("tidak ditemukan")
									? "text-red-500"
									: "text-green-600"
							}`}
						>
							{menuSearchFeedback}
						</p>
					)}
				</div>

				{/* Grid */}
				{isLoading ? (
					<div className="grid grid-cols-2 gap-3">
						{Array.from({ length: 6 }).map((_, i) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholder
							<div key={i} className="animate-pulse rounded-2xl bg-muted h-52" />
						))}
					</div>
				) : products?.length === 0 ? (
					<div className="flex flex-col items-center justify-center py-20 text-center">
						<ShoppingBag className="mb-3 h-12 w-12 text-muted-foreground/30" />
						<p className="font-medium text-muted-foreground">Menu kosong</p>
						<p className="text-muted-foreground/60 text-sm">
							Belum ada produk tersedia
						</p>
					</div>
				) : (
					<div className="grid grid-cols-2 gap-3">
						{products?.map((product) => {
							const pricing = calculateEffectivePrice(
								{
									_id: product._id,
									price: product.price,
									categoryId: product.categoryId,
								},
								activeDiscounts
							);
							const cartQty = getCartQty(product._id);

							return (
								<button
									key={product._id}
									type="button"
									onClick={() => handleProductTap(product)}
									className="group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm active:scale-[0.97] transition-transform text-left"
									aria-label={`${product.name}, ${fmt(pricing.finalPrice)}`}
								>
									{/* Image */}
									<div className="relative h-36 w-full bg-muted">
										{product.image ? (
											<img
												src={product.image}
												alt={product.name}
												className="h-full w-full object-cover"
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
											<div
												className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white shadow-sm"
												style={{ background: themeColor ?? "var(--color-primary)" }}
											>
												<Plus className="h-4 w-4" />
											</div>
										</div>
									</div>
								</button>
							);
						})}
					</div>
				)}
			</main>

			{/* ── Bottom Bar ── */}
			{totalItems > 0 && (
				<div className="fixed bottom-0 left-0 right-0 z-20 border-t border-border bg-background/95 backdrop-blur-sm px-4 pt-3 pb-5 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
					<button
						type="button"
						onClick={() => setSheetView("cart")}
						className="flex w-full items-center justify-between rounded-2xl px-4 py-3.5 font-bold text-white shadow-lg active:opacity-90 transition-opacity"
						style={{ background: themeColor ?? "var(--color-primary)" }}
					>
						<div className="flex items-center gap-2.5">
							<span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/25 text-sm">
								{totalItems}
							</span>
							<span className="text-sm">Lihat Keranjang</span>
						</div>
						<span className="text-base">{fmt(total)}</span>
					</button>
				</div>
			)}

			{/* ── Product Detail Sheet ── */}
			<Sheet open={!!detailProduct} onOpenChange={(o) => !o && setDetailProduct(null)}>
				<SheetContent side="bottom" className="p-0 rounded-t-2xl max-h-[90vh] overflow-y-auto">
					<ProductDetailSheet
						product={detailProduct}
						activeDiscounts={activeDiscounts}
						onClose={() => setDetailProduct(null)}
						onAddToCart={addToCart}
					/>
				</SheetContent>
			</Sheet>

			{/* ── Cart / Checkout Sheet ── */}
			<Sheet open={sheetView !== null} onOpenChange={(o) => !o && sheetView !== "success" && setSheetView(null)}>
				<SheetContent side="bottom" className="p-0 rounded-t-2xl max-h-[92vh] flex flex-col overflow-hidden">
					{/* Cart View */}
					{sheetView === "cart" && (
						<>
							<div className="flex items-center justify-between px-4 pt-5 pb-3 border-b border-border shrink-0">
								<h2 className="font-bold text-foreground text-lg">Keranjang</h2>
								<button
									type="button"
									onClick={() => setSheetView(null)}
									className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground"
									aria-label="Tutup"
								>
									<X className="h-4 w-4" />
								</button>
							</div>

							<div className="flex-1 overflow-y-auto px-4">
								{cart.map((item) => (
									<CartItemRow
										key={`${item.productId}-${item.variant ?? ""}`}
										item={item}
										onUpdate={updateCart}
									/>
								))}
							</div>

							<div className="border-t border-border px-4 pt-3 pb-5 space-y-3 shrink-0">
								<PriceSummary
									subtotal={subtotal}
									tax={tax}
									serviceCharge={serviceCharge}
									taxRate={taxRate}
									serviceChargeRate={serviceChargeRate}
									total={total}
								/>
								<button
									type="button"
									onClick={() => setSheetView("checkout")}
									className="w-full rounded-2xl py-4 font-bold text-white text-base shadow-md active:opacity-90 transition-opacity"
									style={{ background: themeColor ?? "var(--color-primary)" }}
								>
									Lanjut ke Pembayaran
								</button>
							</div>
						</>
					)}

					{/* Checkout View */}
					{sheetView === "checkout" && (
						<>
							<div className="flex items-center gap-3 px-4 pt-5 pb-3 border-b border-border shrink-0">
								<button
									type="button"
									onClick={() => setSheetView("cart")}
									className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground"
									aria-label="Kembali"
								>
									<ChevronLeft className="h-4 w-4" />
								</button>
								<h2 className="font-bold text-foreground text-lg">Checkout</h2>
							</div>

							<div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
								{/* Customer info */}
								<div className="space-y-3">
									<p className="font-semibold text-foreground text-sm">Info Pelanggan (opsional)</p>
									<div>
										<label htmlFor="customer-name" className="text-muted-foreground text-xs mb-1 block">
											Nama
										</label>
										<input
											id="customer-name"
											type="text"
											value={customerName}
											onChange={(e) => setCustomerName(e.target.value)}
											placeholder="Masukkan nama kamu"
											className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-foreground text-sm outline-none focus:border-primary transition-colors"
										/>
									</div>
									<div>
										<label htmlFor="table-number" className="text-muted-foreground text-xs mb-1 block">
											Nomor Meja
										</label>
										<input
											id="table-number"
											type="text"
											inputMode="numeric"
											value={tableNumber}
											onChange={(e) => setTableNumber(e.target.value)}
											placeholder="Misal: 5"
											className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-foreground text-sm outline-none focus:border-primary transition-colors"
										/>
									</div>
								</div>

								{/* Payment method */}
								<div className="space-y-2">
									<p className="font-semibold text-foreground text-sm">Metode Pembayaran</p>
									<div className="space-y-2">
										{availablePayMethods.map((method) => (
											<button
												key={method.key}
												type="button"
												onClick={() => setPaymentMethod(method.key)}
												className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 transition-colors ${
													paymentMethod === method.key
														? "border-primary bg-primary/5"
														: "border-border bg-card"
												}`}
											>
												<div className="text-left">
													<p
														className={`font-semibold text-sm ${
															paymentMethod === method.key
																? "text-primary"
																: "text-foreground"
														}`}
													>
														{method.label}
													</p>
													<p className="text-muted-foreground text-xs">{method.desc}</p>
												</div>
												<div
													className={`h-5 w-5 rounded-full border-2 flex items-center justify-center transition-colors ${
														paymentMethod === method.key
															? "border-primary bg-primary"
															: "border-muted-foreground/40"
													}`}
												>
													{paymentMethod === method.key && (
														<div className="h-2 w-2 rounded-full bg-white" />
													)}
												</div>
											</button>
										))}
									</div>
								</div>

								{/* Order summary */}
								<PriceSummary
									subtotal={subtotal}
									tax={tax}
									serviceCharge={serviceCharge}
									taxRate={taxRate}
									serviceChargeRate={serviceChargeRate}
									total={total}
								/>
							</div>

							<div className="border-t border-border px-4 pt-3 pb-5 shrink-0">
								<button
									type="button"
									onClick={handleConfirmOrder}
									disabled={isSubmitting || cart.length === 0}
									className="w-full rounded-2xl py-4 font-bold text-white text-base shadow-md active:opacity-90 transition-opacity disabled:opacity-60"
									style={{ background: themeColor ?? "var(--color-primary)" }}
								>
									{isSubmitting ? "Memproses..." : `Pesan Sekarang · ${fmt(total)}`}
								</button>
							</div>
						</>
					)}

					{/* QRIS Payment View */}
					{sheetView === "qris" && (
						<>
							<div className="flex items-center justify-between px-4 pt-5 pb-3 border-b border-border shrink-0">
								<h2 className="font-bold text-foreground text-lg">Bayar via QRIS</h2>
							</div>

							<div className="flex-1 overflow-y-auto px-4 py-6 flex flex-col items-center gap-4">
								<div className="text-center space-y-1">
									<p className="text-muted-foreground text-sm">
										Nomor Pesanan: <span className="font-bold text-foreground">{orderNumber}</span>
									</p>
									<p className="font-bold text-foreground text-2xl">{fmt(total)}</p>
								</div>

								{siteSettings?.qrisImage || brandSettings?.qrisImage ? (
									<div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
										<img
											src={brandSettings?.qrisImage || siteSettings?.qrisImage}
											alt="QRIS Code"
											className="h-56 w-56 object-contain"
										/>
									</div>
								) : (
									<div className="flex h-56 w-56 items-center justify-center rounded-2xl border-2 border-dashed border-border bg-muted">
										<p className="text-center text-muted-foreground text-sm px-4">
											QR Code belum dikonfigurasi
										</p>
									</div>
								)}

								<p className="text-center text-muted-foreground text-sm px-4">
									Scan QR code di atas menggunakan aplikasi e-wallet atau mobile banking
								</p>
							</div>

							<div className="border-t border-border px-4 pt-3 pb-5 shrink-0">
								<button
									type="button"
									onClick={handleReset}
									className="w-full rounded-2xl bg-primary py-4 font-bold text-primary-foreground text-base shadow-md active:opacity-90 transition-opacity"
									style={themeColor ? { background: themeColor } : undefined}
								>
									Selesai — Kembali ke Menu
								</button>
							</div>
						</>
					)}

					{/* Transfer View */}
					{sheetView === "transfer" && (
						<>
							<div className="flex items-center justify-between px-4 pt-5 pb-3 border-b border-border shrink-0">
								<h2 className="font-bold text-foreground text-lg">Transfer Bank</h2>
							</div>

							<div className="flex-1 overflow-y-auto px-4 py-6 flex flex-col gap-4">
								<div className="text-center space-y-1">
									<p className="text-muted-foreground text-sm">
										Nomor Pesanan: <span className="font-bold text-foreground">{orderNumber}</span>
									</p>
									<p className="font-bold text-foreground text-2xl">{fmt(total)}</p>
								</div>

								{brandSettings?.bankDetails || siteSettings?.storePhone ? (
									<div className="rounded-2xl border border-border bg-card p-4 space-y-2">
										<p className="font-semibold text-foreground text-sm">Detail Rekening</p>
										<p className="text-foreground text-sm whitespace-pre-line">
											{brandSettings?.bankDetails ?? `Hubungi kami di ${siteSettings?.storePhone}`}
										</p>
									</div>
								) : null}

								<div className="rounded-2xl bg-amber-50 border border-amber-200 p-3">
									<p className="text-amber-800 text-sm">
										Setelah transfer, tunjukkan bukti pembayaran ke kasir untuk konfirmasi pesanan.
									</p>
								</div>
							</div>

							<div className="border-t border-border px-4 pt-3 pb-5 shrink-0">
								<button
									type="button"
									onClick={handleReset}
									className="w-full rounded-2xl bg-primary py-4 font-bold text-primary-foreground text-base shadow-md active:opacity-90 transition-opacity"
									style={themeColor ? { background: themeColor } : undefined}
								>
									Selesai — Kembali ke Menu
								</button>
							</div>
						</>
					)}

					{/* Success View */}
					{sheetView === "success" && (
						<div className="flex flex-1 flex-col items-center justify-center px-6 py-10 gap-5 text-center">
							<div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
								<CheckCircle className="h-10 w-10 text-green-500" />
							</div>
							<div className="space-y-1">
								<h2 className="font-bold text-foreground text-2xl">Pesanan Diterima!</h2>
								<p className="text-muted-foreground text-sm">
									Nomor Pesanan: <span className="font-bold text-foreground">{orderNumber}</span>
								</p>
							</div>
							<div className="rounded-2xl bg-muted/60 px-6 py-4 w-full space-y-1">
								<p className="text-muted-foreground text-sm">Total Bayar</p>
								<p className="font-bold text-foreground text-2xl">{fmt(total)}</p>
								<p className="text-muted-foreground text-sm capitalize">
									Metode: {paymentMethod === "cash" ? "Tunai" : paymentMethod.toUpperCase()}
								</p>
							</div>
							{paymentMethod === "cash" && (
								<p className="text-muted-foreground text-sm">
									Silakan lakukan pembayaran di kasir. Tunjukkan nomor pesanan kamu.
								</p>
							)}
							<button
								type="button"
								onClick={handleReset}
								className="w-full rounded-2xl py-4 font-bold text-white text-base shadow-md active:opacity-90 transition-opacity"
								style={{ background: themeColor ?? "var(--color-primary)" }}
							>
								Pesan Lagi
							</button>
						</div>
					)}
				</SheetContent>
			</Sheet>

			{/* ── Free Refill Popup ── */}
			<Sheet
				open={showFreeRefillPopup}
				onOpenChange={(o) => !o && setShowFreeRefillPopup(false)}
			>
				<SheetContent side="bottom" className="p-0 rounded-t-2xl">
					<div className="px-5 pt-6 pb-8 space-y-5">
						{/* Header */}
						<div className="text-center space-y-2">
							<div className="text-4xl">🎉</div>
							<h2 className="font-bold text-foreground text-xl">
								{freeRefillPromo?.name ?? "Promo Free Refill!"}
							</h2>
							<p className="text-muted-foreground text-sm leading-relaxed">
								Ada promo{" "}
								<span className="font-semibold text-foreground">
									Free Refill Minuman
								</span>{" "}
								yang sedang aktif sekarang.{" "}
								{freeRefillPromo?.refillPrice
									? `Tambahkan dengan harga ${fmt(freeRefillPromo.refillPrice)}.`
									: "Tambahkan secara gratis!"}
							</p>
						</div>

						{/* Price chip */}
						<div className="flex justify-center">
							<span
								className="rounded-full px-4 py-1.5 text-sm font-bold text-white"
								style={{ background: themeColor ?? "var(--color-primary)" }}
							>
								{freeRefillPromo?.refillPrice
									? fmt(freeRefillPromo.refillPrice)
									: "GRATIS"}
							</span>
						</div>

						{/* Actions */}
						<div className="flex flex-col gap-2.5">
							<button
								type="button"
								onClick={() => {
									if (freeRefillPromo) {
										addToCart({
											productId: "promo-free-refill",
											name: "Add-on: Free Refill Minuman",
											price: freeRefillPromo.refillPrice ?? 0,
											quantity: 1,
											categoryId: "",
										});
										setSheetView("cart");
									}
									setShowFreeRefillPopup(false);
								}}
								className="w-full rounded-2xl py-3.5 font-bold text-white text-base shadow-md active:opacity-90 transition-opacity"
								style={{ background: themeColor ?? "var(--color-primary)" }}
							>
								Tambahkan Free Refill
							</button>
							<button
								type="button"
								onClick={() => setShowFreeRefillPopup(false)}
								className="w-full rounded-2xl border border-border bg-card py-3.5 font-semibold text-foreground text-base active:bg-muted transition-colors"
							>
								Lewati
							</button>
						</div>
					</div>
				</SheetContent>
			</Sheet>
		</div>
	);
}
