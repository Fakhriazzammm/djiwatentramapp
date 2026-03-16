import { createLazyFileRoute } from "@tanstack/react-router";
import { api } from "@yumipos/backend/convex/_generated/api";
import type { Id } from "@yumipos/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import {
	CheckCircle,
	ChevronLeft,
	Hash,
	Minus,
	Plus,
	ShoppingBag,
	ShoppingCart,
	Trash2,
	X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { calculateEffectivePrice } from "@/lib/utils/pricing";

export const Route = createLazyFileRoute("/$brandSlug")({
	component: CustomerMenuPage,
});

// ─── Types ────────────────────────────────────────────────────────────────────

interface CustomerCartItem {
	productId: string;
	name: string;
	price: number;
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
		menuNumber?: number;
		variations?: VariationGroup[];
	} | null;
	activeDiscounts: any[] | undefined;
	onClose: () => void;
	onAddToCart: (item: CustomerCartItem) => void;
}) {
	const [qty, setQty] = useState(1);
	const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({});

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
	const variantLabel = Object.entries(selectedVariants)
		.map(([, v]) => v)
		.join(", ");

	const handleAdd = () => {
		onAddToCart({
			productId: product._id,
			name: product.name,
			price: unitPrice,
			quantity: qty,
			variant: variantLabel || undefined,
			image: product.image,
			categoryId: product.categoryId,
		});
		onClose();
	};

	return (
		<div className="flex flex-col">
			{/* Image */}
			<div className="relative h-44 w-full bg-muted shrink-0">
				{product.image ? (
					<img src={product.image} alt={product.name} className="h-full w-full object-cover" />
				) : (
					<div className="flex h-full items-center justify-center">
						<ShoppingBag className="h-14 w-14 text-muted-foreground/25" />
					</div>
				)}
				{product.menuNumber !== undefined && (
					<span className="absolute left-3 top-3 flex h-7 min-w-7 items-center justify-center rounded-lg bg-black/60 px-1.5 font-bold text-white text-xs">
						#{product.menuNumber}
					</span>
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
					<h2 className="font-bold text-foreground text-lg leading-tight">{product.name}</h2>
					{product.description && (
						<p className="mt-1 text-muted-foreground text-xs leading-snug">
							{product.description}
						</p>
					)}
					<div className="mt-2 flex items-center gap-2 flex-wrap">
						{pricing.isPromo && (
							<span className="text-muted-foreground text-sm line-through">{fmt(pricing.originalPrice)}</span>
						)}
						<span className="font-bold text-primary text-xl">{fmt(pricing.finalPrice)}</span>
						{pricing.isPromo && pricing.discountName && (
							<span className="rounded-full bg-red-100 px-2 py-0.5 font-medium text-red-600 text-[11px]">
								{pricing.discountName}
							</span>
						)}
					</div>
				</div>

				{/* Variations */}
				{product.variations && product.variations.length > 0 && (
					<div className="space-y-2.5">
						{product.variations.map((group) => (
							<div key={group.type}>
								<p className="mb-1.5 font-semibold text-foreground text-xs uppercase tracking-wide text-muted-foreground">
									{group.type}
								</p>
								<div className="flex flex-wrap gap-1.5">
									{group.options.map((opt) => {
										const selected = selectedVariants[group.type] === opt.name;
										return (
											<button
												key={opt.name}
												type="button"
												onClick={() =>
													setSelectedVariants((prev) => ({ ...prev, [group.type]: opt.name }))
												}
												className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
													selected
														? "border-primary bg-primary text-primary-foreground font-semibold"
														: "border-border bg-card text-foreground"
												}`}
											>
												{opt.name}
												{opt.price > 0 && <span className="ml-1 opacity-70 text-xs">+{fmt(opt.price)}</span>}
											</button>
										);
									})}
								</div>
							</div>
						))}
					</div>
				)}

				{/* Quantity + Add */}
				<div className="flex items-center gap-2.5">
					<div className="flex items-center gap-1.5 rounded-xl border border-border bg-card p-1">
						<button
							type="button"
							onClick={() => setQty(Math.max(1, qty - 1))}
							className="flex h-8 w-8 items-center justify-center rounded-lg text-foreground active:bg-muted transition-colors"
							aria-label="Kurangi"
						>
							<Minus className="h-3.5 w-3.5" />
						</button>
						<span className="min-w-[1.75rem] text-center font-bold text-sm">{qty}</span>
						<button
							type="button"
							onClick={() => setQty(qty + 1)}
							className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground active:opacity-80 transition-opacity"
							aria-label="Tambah"
						>
							<Plus className="h-3.5 w-3.5" />
						</button>
					</div>

					<button
						type="button"
						onClick={handleAdd}
						className="flex flex-1 items-center justify-between rounded-xl bg-primary px-4 py-2.5 font-bold text-primary-foreground shadow-md active:opacity-80 transition-opacity"
					>
						<span className="text-sm">Tambah</span>
						<span className="text-sm">{fmt(unitPrice * qty)}</span>
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
		<div className="flex items-center gap-2.5 py-2.5 border-b border-border last:border-0">
			{item.image ? (
				<img src={item.image} alt={item.name} className="h-10 w-10 shrink-0 rounded-lg object-cover" />
			) : (
				<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
					<span className="font-bold text-primary/50 text-xs">{item.name.charAt(0)}</span>
				</div>
			)}
			<div className="min-w-0 flex-1">
				<p className="line-clamp-1 font-medium text-foreground text-sm">{item.name}</p>
				{item.variant && <p className="text-muted-foreground text-[11px]">{item.variant}</p>}
				<p className="font-semibold text-primary text-xs mt-0.5">{fmt(item.price * item.quantity)}</p>
			</div>
			<div className="flex shrink-0 items-center gap-1">
				{item.quantity === 1 ? (
					<button
						type="button"
						aria-label={`Hapus ${item.name}`}
						onClick={() => onUpdate(item.productId, item.variant, -1)}
						className="flex h-7 w-7 items-center justify-center rounded-lg bg-destructive/10 text-destructive active:bg-destructive/20"
					>
						<Trash2 className="h-3 w-3" />
					</button>
				) : (
					<button
						type="button"
						aria-label={`Kurangi ${item.name}`}
						onClick={() => onUpdate(item.productId, item.variant, -1)}
						className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-card"
					>
						<Minus className="h-3 w-3" />
					</button>
				)}
				<span className="min-w-[1.25rem] text-center font-bold text-sm">{item.quantity}</span>
				<button
					type="button"
					aria-label={`Tambah ${item.name}`}
					onClick={() => onUpdate(item.productId, item.variant, 1)}
					className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground"
				>
					<Plus className="h-3 w-3" />
				</button>
			</div>
		</div>
	);
}

// ─── Price Summary ─────────────────────────────────────────────────────────────

function PriceSummary({
	subtotal, tax, serviceCharge, taxRate, serviceChargeRate, total,
}: {
	subtotal: number; tax: number; serviceCharge: number;
	taxRate: number; serviceChargeRate: number; total: number;
}) {
	return (
		<div className="space-y-1 rounded-xl bg-muted/50 p-3">
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
			<div className="flex justify-between border-t border-border pt-1.5 mt-1.5">
				<span className="font-bold text-foreground text-sm">Total</span>
				<span className="font-bold text-foreground text-base">{fmt(total)}</span>
			</div>
		</div>
	);
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

function CustomerMenuPage() {
	const { brandSlug } = Route.useParams();

	// Data — always fetch all products, filter client-side for category
	const siteSettings = useQuery(api.site_settings.getSettings);
	const brandSettings = useQuery(api.booking.getSettings, { slug: brandSlug });
	const categories = useQuery(api.products.getCategories);
	const allProducts = useQuery(api.products.getProducts, {});
	const activeDiscounts = useQuery(api.discounts.getActiveDiscounts);
	const createOrder = useMutation(api.orders.createOrder);

	// Category filter (client-side from allProducts)
	const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);

	// Search by menu number
	const [menuSearch, setMenuSearch] = useState("");
	const [searchFlash, setSearchFlash] = useState<string | null>(null); // product name that was just added
	const searchInputRef = useRef<HTMLInputElement>(null);

	// Cart state
	const [cart, setCart] = useState<CustomerCartItem[]>([]);

	// Product detail sheet (for items with variations)
	const [detailProduct, setDetailProduct] = useState<any | null>(null);

	// Sheet navigation
	const [sheetView, setSheetView] = useState<SheetView>(null);

	// Checkout form
	const [customerName, setCustomerName] = useState("");
	const [tableNumber, setTableNumber] = useState("");
	const [paymentMethod, setPaymentMethod] = useState<"cash" | "qris" | "transfer">("cash");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [orderNumber, setOrderNumber] = useState<string | null>(null);

	// Brand info
	const storeName = brandSettings?.title ?? siteSettings?.storeName ?? "Menu";
	const logoUrl = brandSettings?.logoUrl ?? siteSettings?.logoUrl;
	const themeColor = brandSettings?.themeColor;
	const primaryStyle = themeColor ? { background: themeColor } : undefined;

	// Payment methods
	const payMethods = siteSettings?.paymentMethodsManual ?? { cash: true, qris: true, transfer: false };

	// Pricing
	const subtotal = cart.reduce((s, i) => s + i.price * i.quantity, 0);
	const taxRate = siteSettings?.taxRate ?? 0;
	const serviceChargeRate = siteSettings?.serviceChargeRate ?? 0;
	const serviceCharge = subtotal * (serviceChargeRate / 100);
	const tax = subtotal * (taxRate / 100);
	const total = subtotal + serviceCharge + tax;
	const totalItems = cart.reduce((s, i) => s + i.quantity, 0);

	// Filtered products by active category
	const products = useMemo(() => {
		if (!allProducts) return undefined;
		if (!activeCategoryId) return allProducts;
		return allProducts.filter((p) => p.categoryId === activeCategoryId);
	}, [allProducts, activeCategoryId]);

	// ── Cart helpers ──────────────────────────────────────────────────────────

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

	// Quick add (no variation) or open detail sheet (has variation)
	const handleProductTap = (product: any) => {
		if (product.variations && product.variations.length > 0) {
			setDetailProduct(product);
		} else {
			const pricing = calculateEffectivePrice(
				{ _id: product._id, price: product.price, categoryId: product.categoryId },
				activeDiscounts
			);
			addToCart({
				productId: product._id,
				name: product.name,
				price: pricing.finalPrice,
				quantity: 1,
				image: product.image,
				categoryId: product.categoryId,
			});
		}
	};

	const getCartQty = (productId: string) =>
		cart.filter((i) => i.productId === productId).reduce((s, i) => s + i.quantity, 0);

	// ── Auto-add on menu number match ─────────────────────────────────────────

	useEffect(() => {
		if (!menuSearch.trim() || !allProducts) return;
		const num = Number(menuSearch.trim());
		if (!Number.isInteger(num) || num <= 0) return;

		const match = allProducts.find((p) => p.menuNumber === num);
		if (!match) return;

		// Found exact match — add to cart
		handleProductTap(match);
		setSearchFlash(match.name);
		setMenuSearch("");

		// Clear flash feedback after 1.5s
		const t = setTimeout(() => setSearchFlash(null), 1500);
		return () => clearTimeout(t);
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [menuSearch, allProducts]);

	// ── Order submission ──────────────────────────────────────────────────────

	const handleConfirmOrder = async () => {
		if (cart.length === 0) return;
		setIsSubmitting(true);
		try {
			const label = [
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
				})),
				totalAmount: total,
				paymentMethod,
				customerName: label,
			});

			setOrderNumber(`ORD-${String(id).slice(-4).toUpperCase()}`);

			if (paymentMethod === "qris") setSheetView("qris");
			else if (paymentMethod === "transfer") setSheetView("transfer");
			else setSheetView("success");
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

	// Set default payment method once
	const initialPaySet = useRef(false);
	if (!initialPaySet.current && availablePayMethods.length > 0) {
		setPaymentMethod(availablePayMethods[0].key);
		initialPaySet.current = true;
	}

	const isLoading = allProducts === undefined || categories === undefined;

	return (
		<div className="flex min-h-screen flex-col bg-background">

			{/* ── Sticky Header ────────────────────────────────────────────── */}
			<header className="sticky top-0 z-30 bg-background/95 backdrop-blur-sm border-b border-border">

				{/* Top bar: logo + name + cart */}
				<div className="flex items-center gap-2.5 px-3 pt-2.5 pb-2">
					{logoUrl ? (
						<img src={logoUrl} alt={storeName} className="h-8 w-8 shrink-0 rounded-lg object-contain" />
					) : (
						<div
							className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg font-bold text-white text-xs"
							style={primaryStyle ?? { background: "var(--color-primary)" }}
						>
							{storeName.charAt(0).toUpperCase()}
						</div>
					)}
					<div className="min-w-0 flex-1">
						<h1 className="truncate font-bold text-foreground text-sm leading-tight">{storeName}</h1>
						<p className="text-muted-foreground text-[10px]">Menu Digital</p>
					</div>
					{totalItems > 0 && (
						<button
							type="button"
							onClick={() => setSheetView("cart")}
							aria-label={`Keranjang: ${totalItems} item`}
							className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card active:scale-95 transition-transform"
						>
							<ShoppingCart className="h-4.5 w-4.5 text-foreground" />
							<span className="absolute -right-1 -top-1 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-primary px-1 font-bold text-[9px] text-primary-foreground shadow leading-none">
								{totalItems}
							</span>
						</button>
					)}
				</div>

				{/* Search by menu number */}
				<div className="px-3 pb-2">
					<div className={`flex items-center gap-2 rounded-xl border px-3 py-2 transition-colors ${
						searchFlash
							? "border-green-400 bg-green-50"
							: "border-border bg-muted/50 focus-within:border-primary focus-within:bg-background"
					}`}>
						<Hash className="h-4 w-4 shrink-0 text-muted-foreground" />
						<input
							ref={searchInputRef}
							type="number"
							inputMode="numeric"
							value={menuSearch}
							onChange={(e) => setMenuSearch(e.target.value)}
							placeholder="Ketik nomor menu, langsung masuk keranjang..."
							className="flex-1 bg-transparent text-foreground text-sm outline-none placeholder:text-muted-foreground/60 min-w-0"
							aria-label="Cari berdasarkan nomor menu"
						/>
						{searchFlash && (
							<span className="shrink-0 rounded-full bg-green-500 px-2 py-0.5 text-white text-[10px] font-medium whitespace-nowrap">
								✓ Ditambahkan
							</span>
						)}
						{menuSearch && !searchFlash && (
							<button
								type="button"
								onClick={() => setMenuSearch("")}
								className="shrink-0 text-muted-foreground"
								aria-label="Hapus pencarian"
							>
								<X className="h-3.5 w-3.5" />
							</button>
						)}
					</div>
				</div>

				{/* Category tabs */}
				<div className="flex gap-1.5 overflow-x-auto px-3 pb-2.5 scrollbar-none">
					<button
						type="button"
						onClick={() => setActiveCategoryId(null)}
						className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
							activeCategoryId === null
								? "bg-primary text-primary-foreground shadow-sm"
								: "bg-muted text-muted-foreground"
						}`}
						style={activeCategoryId === null && themeColor ? { background: themeColor } : undefined}
					>
						Semua
					</button>
					{categories?.map((cat) => (
						<button
							key={cat._id}
							type="button"
							onClick={() => setActiveCategoryId(cat._id)}
							className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
								activeCategoryId === cat._id
									? "bg-primary text-primary-foreground shadow-sm"
									: "bg-muted text-muted-foreground"
							}`}
							style={activeCategoryId === cat._id && themeColor ? { background: themeColor } : undefined}
						>
							{cat.name}
						</button>
					))}
				</div>
			</header>

			{/* ── Product Grid ─────────────────────────────────────────────── */}
			<main className="flex-1 px-2.5 py-3 pb-24">
				{isLoading ? (
					<div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
						{Array.from({ length: 6 }).map((_, i) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: skeleton
							<div key={i} className="animate-pulse rounded-xl bg-muted h-44" />
						))}
					</div>
				) : products?.length === 0 ? (
					<div className="flex flex-col items-center justify-center py-16 text-center">
						<ShoppingBag className="mb-2 h-10 w-10 text-muted-foreground/25" />
						<p className="font-medium text-muted-foreground text-sm">Menu kosong</p>
					</div>
				) : (
					<div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
						{products?.map((product) => {
							const pricing = calculateEffectivePrice(
								{ _id: product._id, price: product.price, categoryId: product.categoryId },
								activeDiscounts
							);
							const cartQty = getCartQty(product._id);

							return (
								<button
									key={product._id}
									type="button"
									onClick={() => handleProductTap(product)}
									className="group relative flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm active:scale-[0.97] transition-transform text-left"
									aria-label={`${product.name}, ${fmt(pricing.finalPrice)}`}
								>
									{/* Image area */}
									<div className="relative h-28 w-full bg-muted shrink-0">
										{product.image ? (
											<img src={product.image} alt={product.name} className="h-full w-full object-cover" />
										) : (
											<div className="flex h-full items-center justify-center">
												<ShoppingBag className="h-8 w-8 text-muted-foreground/20" />
											</div>
										)}

										{/* Menu number badge — top left */}
										{product.menuNumber !== undefined && (
											<span className="absolute left-1.5 top-1.5 flex h-5 min-w-5 items-center justify-center rounded-md bg-black/65 px-1 font-bold text-white text-[10px] leading-none">
												#{product.menuNumber}
											</span>
										)}

										{/* Promo badge */}
										{pricing.isPromo && (
											<span className="absolute bottom-1.5 left-1.5 rounded-full bg-red-500 px-1.5 py-0.5 font-bold text-white text-[9px] leading-none">
												PROMO
											</span>
										)}

										{/* Cart qty badge — top right */}
										{cartQty > 0 && (
											<span
												className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full font-bold text-[10px] text-white shadow leading-none"
												style={primaryStyle ?? { background: "var(--color-primary)" }}
											>
												{cartQty}
											</span>
										)}
									</div>

									{/* Info */}
									<div className="flex flex-1 flex-col justify-between px-2 pt-1.5 pb-2">
										<p className="line-clamp-2 font-semibold text-foreground text-xs leading-tight">
											{product.name}
										</p>
										<div className="mt-1 flex items-end justify-between gap-1">
											<div className="min-w-0">
												{pricing.isPromo && (
													<p className="text-muted-foreground text-[10px] line-through leading-none">
														{fmt(pricing.originalPrice)}
													</p>
												)}
												<p
													className="font-bold text-xs leading-tight truncate"
													style={{ color: themeColor ?? "var(--color-primary)" }}
												>
													{fmt(pricing.finalPrice)}
												</p>
											</div>
											<div
												className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white"
												style={primaryStyle ?? { background: "var(--color-primary)" }}
											>
												<Plus className="h-3.5 w-3.5" />
											</div>
										</div>
									</div>
								</button>
							);
						})}
					</div>
				)}
			</main>

			{/* ── Bottom Cart Bar ───────────────────────────────────────────── */}
			{totalItems > 0 && (
				<div className="fixed bottom-0 left-0 right-0 z-20 border-t border-border bg-background/95 backdrop-blur-sm px-3 pt-2 pb-4">
					<button
						type="button"
						onClick={() => setSheetView("cart")}
						className="flex w-full items-center justify-between rounded-xl px-4 py-3 font-bold text-white shadow-lg active:opacity-90 transition-opacity"
						style={primaryStyle ?? { background: "var(--color-primary)" }}
					>
						<div className="flex items-center gap-2">
							<span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/25 text-xs font-bold">
								{totalItems}
							</span>
							<span className="text-sm">Lihat Keranjang</span>
						</div>
						<span className="text-sm font-bold">{fmt(total)}</span>
					</button>
				</div>
			)}

			{/* ── Product Detail Sheet (with variations) ───────────────────── */}
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

			{/* ── Cart / Checkout Sheet ─────────────────────────────────────── */}
			<Sheet
				open={sheetView !== null}
				onOpenChange={(o) => !o && sheetView !== "success" && setSheetView(null)}
			>
				<SheetContent side="bottom" className="p-0 rounded-t-2xl max-h-[92vh] flex flex-col overflow-hidden">

					{/* ── Cart view ── */}
					{sheetView === "cart" && (
						<>
							<div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-border shrink-0">
								<h2 className="font-bold text-foreground">Keranjang</h2>
								<button
									type="button"
									onClick={() => setSheetView(null)}
									className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-muted-foreground"
									aria-label="Tutup"
								>
									<X className="h-3.5 w-3.5" />
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

							<div className="border-t border-border px-4 pt-3 pb-5 space-y-2.5 shrink-0">
								<PriceSummary
									subtotal={subtotal} tax={tax} serviceCharge={serviceCharge}
									taxRate={taxRate} serviceChargeRate={serviceChargeRate} total={total}
								/>
								<button
									type="button"
									onClick={() => setSheetView("checkout")}
									className="w-full rounded-xl py-3.5 font-bold text-white text-sm shadow-md active:opacity-90"
									style={primaryStyle ?? { background: "var(--color-primary)" }}
								>
									Lanjut ke Pembayaran
								</button>
							</div>
						</>
					)}

					{/* ── Checkout view ── */}
					{sheetView === "checkout" && (
						<>
							<div className="flex items-center gap-2.5 px-4 pt-4 pb-3 border-b border-border shrink-0">
								<button
									type="button"
									onClick={() => setSheetView("cart")}
									className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-muted-foreground"
									aria-label="Kembali"
								>
									<ChevronLeft className="h-3.5 w-3.5" />
								</button>
								<h2 className="font-bold text-foreground">Checkout</h2>
							</div>

							<div className="flex-1 overflow-y-auto px-4 py-3 space-y-3.5">
								{/* Customer info */}
								<div className="space-y-2">
									<p className="font-semibold text-foreground text-sm">Info Pelanggan <span className="font-normal text-muted-foreground text-xs">(opsional)</span></p>
									<input
										type="text"
										value={customerName}
										onChange={(e) => setCustomerName(e.target.value)}
										placeholder="Nama kamu"
										className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-foreground text-sm outline-none focus:border-primary"
									/>
									<input
										type="text"
										inputMode="numeric"
										value={tableNumber}
										onChange={(e) => setTableNumber(e.target.value)}
										placeholder="Nomor meja (misal: 5)"
										className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-foreground text-sm outline-none focus:border-primary"
									/>
								</div>

								{/* Payment method */}
								<div className="space-y-1.5">
									<p className="font-semibold text-foreground text-sm">Metode Pembayaran</p>
									<div className="space-y-1.5">
										{availablePayMethods.map((method) => (
											<button
												key={method.key}
												type="button"
												onClick={() => setPaymentMethod(method.key)}
												className={`flex w-full items-center justify-between rounded-xl border px-3.5 py-2.5 transition-colors ${
													paymentMethod === method.key
														? "border-primary bg-primary/5"
														: "border-border bg-card"
												}`}
											>
												<div className="text-left">
													<p className={`font-semibold text-sm ${paymentMethod === method.key ? "text-primary" : "text-foreground"}`}>
														{method.label}
													</p>
													<p className="text-muted-foreground text-xs">{method.desc}</p>
												</div>
												<div className={`h-4.5 w-4.5 rounded-full border-2 flex items-center justify-center ${paymentMethod === method.key ? "border-primary bg-primary" : "border-muted-foreground/40"}`}>
													{paymentMethod === method.key && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
												</div>
											</button>
										))}
									</div>
								</div>

								<PriceSummary
									subtotal={subtotal} tax={tax} serviceCharge={serviceCharge}
									taxRate={taxRate} serviceChargeRate={serviceChargeRate} total={total}
								/>
							</div>

							<div className="border-t border-border px-4 pt-3 pb-5 shrink-0">
								<button
									type="button"
									onClick={handleConfirmOrder}
									disabled={isSubmitting || cart.length === 0}
									className="w-full rounded-xl py-3.5 font-bold text-white text-sm shadow-md active:opacity-90 disabled:opacity-60"
									style={primaryStyle ?? { background: "var(--color-primary)" }}
								>
									{isSubmitting ? "Memproses..." : `Pesan Sekarang · ${fmt(total)}`}
								</button>
							</div>
						</>
					)}

					{/* ── QRIS view ── */}
					{sheetView === "qris" && (
						<>
							<div className="px-4 pt-4 pb-3 border-b border-border shrink-0">
								<h2 className="font-bold text-foreground">Bayar via QRIS</h2>
							</div>
							<div className="flex-1 overflow-y-auto px-4 py-5 flex flex-col items-center gap-4">
								<div className="text-center">
									<p className="text-muted-foreground text-xs">No. Pesanan: <span className="font-bold text-foreground">{orderNumber}</span></p>
									<p className="font-bold text-foreground text-2xl mt-0.5">{fmt(total)}</p>
								</div>
								{(brandSettings?.qrisImage || siteSettings?.qrisImage) ? (
									<div className="rounded-2xl border border-border bg-white p-3 shadow-sm">
										<img
											src={brandSettings?.qrisImage || siteSettings?.qrisImage}
											alt="QRIS"
											className="h-52 w-52 object-contain"
										/>
									</div>
								) : (
									<div className="flex h-52 w-52 items-center justify-center rounded-2xl border-2 border-dashed border-border bg-muted">
										<p className="text-center text-muted-foreground text-xs px-4">QR Code belum dikonfigurasi</p>
									</div>
								)}
								<p className="text-center text-muted-foreground text-xs px-4">
									Scan menggunakan e-wallet atau mobile banking
								</p>
							</div>
							<div className="border-t border-border px-4 pt-3 pb-5 shrink-0">
								<button type="button" onClick={handleReset} className="w-full rounded-xl py-3.5 font-bold text-white text-sm shadow-md" style={primaryStyle ?? { background: "var(--color-primary)" }}>
									Selesai — Kembali ke Menu
								</button>
							</div>
						</>
					)}

					{/* ── Transfer view ── */}
					{sheetView === "transfer" && (
						<>
							<div className="px-4 pt-4 pb-3 border-b border-border shrink-0">
								<h2 className="font-bold text-foreground">Transfer Bank</h2>
							</div>
							<div className="flex-1 overflow-y-auto px-4 py-5 flex flex-col gap-3">
								<div className="text-center">
									<p className="text-muted-foreground text-xs">No. Pesanan: <span className="font-bold text-foreground">{orderNumber}</span></p>
									<p className="font-bold text-foreground text-2xl mt-0.5">{fmt(total)}</p>
								</div>
								{(brandSettings?.bankDetails || siteSettings?.storePhone) && (
									<div className="rounded-xl border border-border bg-card p-3 space-y-1">
										<p className="font-semibold text-foreground text-xs">Detail Rekening</p>
										<p className="text-foreground text-sm whitespace-pre-line">
											{brandSettings?.bankDetails ?? `Hubungi kami di ${siteSettings?.storePhone}`}
										</p>
									</div>
								)}
								<div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
									<p className="text-amber-800 text-xs">
										Setelah transfer, tunjukkan bukti pembayaran ke kasir.
									</p>
								</div>
							</div>
							<div className="border-t border-border px-4 pt-3 pb-5 shrink-0">
								<button type="button" onClick={handleReset} className="w-full rounded-xl py-3.5 font-bold text-white text-sm shadow-md" style={primaryStyle ?? { background: "var(--color-primary)" }}>
									Selesai — Kembali ke Menu
								</button>
							</div>
						</>
					)}

					{/* ── Success view ── */}
					{sheetView === "success" && (
						<div className="flex flex-1 flex-col items-center justify-center px-6 py-8 gap-4 text-center">
							<div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
								<CheckCircle className="h-8 w-8 text-green-500" />
							</div>
							<div>
								<h2 className="font-bold text-foreground text-xl">Pesanan Diterima!</h2>
								<p className="text-muted-foreground text-sm mt-0.5">
									No. Pesanan: <span className="font-bold text-foreground">{orderNumber}</span>
								</p>
							</div>
							<div className="rounded-xl bg-muted/60 px-5 py-3 w-full space-y-0.5">
								<p className="text-muted-foreground text-xs">Total Bayar</p>
								<p className="font-bold text-foreground text-xl">{fmt(total)}</p>
								<p className="text-muted-foreground text-xs capitalize">
									{paymentMethod === "cash" ? "Tunai — bayar di kasir" : paymentMethod.toUpperCase()}
								</p>
							</div>
							<button
								type="button"
								onClick={handleReset}
								className="w-full rounded-xl py-3.5 font-bold text-white text-sm shadow-md"
								style={primaryStyle ?? { background: "var(--color-primary)" }}
							>
								Pesan Lagi
							</button>
						</div>
					)}

				</SheetContent>
			</Sheet>
		</div>
	);
}
