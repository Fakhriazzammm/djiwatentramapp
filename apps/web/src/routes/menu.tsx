import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { api } from "@yumipos/backend/convex/_generated/api";
import type { Id } from "@yumipos/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Minus, Plus, ShoppingCart, Tag, Trash2, X } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { MenuSidebar } from "@/components/pos/menu-sidebar";
import { PaymentConfirmationModal } from "@/components/pos/payment-modal";
import { VoucherModal } from "@/components/pos/voucher-modal";
import { SkipLink } from "@/components/ui/a11y";
import { EmptyCart } from "@/components/ui/empty-state";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import type { CartItem } from "@/context/cart-context";
import { useCart } from "@/context/cart-context";
import { bluetoothPrinter } from "@/lib/bluetooth-printer";
import { calculateEffectivePrice } from "@/lib/utils/pricing";

export const Route = createFileRoute("/menu")({
	component: MenuPage,
});

interface Product {
	_id: string;
	name: string;
	price: number;
	promoPrice?: number;
	image?: string;
	description?: string;
	categoryId?: string;
}

const formatCurrency = (amount: number) =>
	new Intl.NumberFormat("id-ID", {
		style: "currency",
		currency: "IDR",
		maximumFractionDigits: 0,
	}).format(amount);

function getPayButtonLabel(
	isSubmitting: boolean,
	hasItems: boolean,
	totalItems: number
) {
	if (isSubmitting) {
		return "...";
	}
	if (hasItems) {
		return `Bayar (${totalItems})`;
	}
	return "Bayar";
}

// ============================================
// Cart Item Row
// ============================================
function CartItemRow({
	item,
	onUpdateQuantity,
}: {
	item: CartItem;
	onUpdateQuantity: (
		productId: string,
		variant: string | undefined,
		delta: number
	) => void;
}) {
	return (
		<div className="flex items-center gap-3 rounded-xl border border-border bg-background p-3">
			{item.image ? (
				<img
					alt={item.name}
					className="h-12 w-12 shrink-0 rounded-lg object-cover"
					height={48}
					src={item.image}
					width={48}
				/>
			) : (
				<div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10">
					<span className="font-bold text-primary/50 text-sm">
						{item.name.charAt(0)}
					</span>
				</div>
			)}

			<div className="min-w-0 flex-1">
				<span className="line-clamp-1 font-medium text-foreground text-sm">
					{item.name}
				</span>
				<div className="mt-0.5 font-semibold text-primary text-sm">
					{formatCurrency(item.price * item.quantity)}
				</div>
			</div>

			<div className="flex shrink-0 items-center gap-1.5">
				{item.quantity === 1 ? (
					<button
						aria-label={`Hapus ${item.name}`}
						className="flex h-8 w-8 items-center justify-center rounded-lg bg-destructive/10 text-destructive active:scale-95"
						onClick={() => onUpdateQuantity(item.productId, item.variant, -1)}
						type="button"
					>
						<Trash2 className="h-3.5 w-3.5" />
					</button>
				) : (
					<button
						aria-label={`Kurangi jumlah ${item.name}`}
						className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card text-foreground active:scale-95"
						onClick={() => onUpdateQuantity(item.productId, item.variant, -1)}
						type="button"
					>
						<Minus className="h-3.5 w-3.5" />
					</button>
				)}
				<output
					aria-live="polite"
					className="min-w-[2rem] text-center font-bold text-sm"
				>
					{item.quantity}
				</output>
				<button
					aria-label={`Tambah jumlah ${item.name}`}
					className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground active:scale-95"
					onClick={() => onUpdateQuantity(item.productId, item.variant, 1)}
					type="button"
				>
					<Plus className="h-3.5 w-3.5" />
				</button>
			</div>
		</div>
	);
}

// ============================================
// Price Summary
// ============================================
function PriceSummary({
	totalAmount,
	discountAmount,
	finalTotal,
}: {
	totalAmount: number;
	discountAmount: number;
	finalTotal: number;
}) {
	return (
		<div className="space-y-1.5">
			<div className="flex items-center justify-between">
				<span className="text-muted-foreground text-sm">Subtotal</span>
				<span className="font-medium text-sm">
					{formatCurrency(totalAmount)}
				</span>
			</div>
			{discountAmount > 0 && (
				<div className="flex items-center justify-between">
					<span className="text-muted-foreground text-sm">Diskon</span>
					<span className="font-medium text-green-600 text-sm">
						-{formatCurrency(discountAmount)}
					</span>
				</div>
			)}
			<div className="flex items-center justify-between border-border border-t pt-1.5">
				<span className="font-semibold text-foreground">Total</span>
				<span className="font-bold text-foreground text-xl">
					{formatCurrency(finalTotal)}
				</span>
			</div>
		</div>
	);
}

// ============================================
// Mobile Bottom Bar
// ============================================
function MobileBottomBar({
	appliedVoucher,
	discountAmount,
	totalAmount,
	finalTotal,
	totalItems,
	isSubmitting,
	hasItems,
	onRemoveVoucher,
	onOpenCart,
	onOpenVoucher,
	onCheckout,
}: {
	appliedVoucher: { name: string } | null;
	discountAmount: number;
	totalAmount: number;
	finalTotal: number;
	totalItems: number;
	isSubmitting: boolean;
	hasItems: boolean;
	onRemoveVoucher: () => void;
	onOpenCart: () => void;
	onOpenVoucher: () => void;
	onCheckout: () => void;
}) {
	return (
		<div className="fixed right-0 bottom-0 left-0 z-50 md:hidden">
			{appliedVoucher && (
				<div className="mx-3 mb-1 flex items-center justify-between rounded-t-xl bg-emerald-100 px-3 py-1.5 shadow-sm">
					<div className="flex items-center gap-2">
						<Tag className="h-3 w-3 text-emerald-600" />
						<span className="font-medium text-emerald-700 text-xs">
							{appliedVoucher.name}
						</span>
					</div>
					<button
						className="font-medium text-red-500 text-xs active:opacity-70"
						onClick={onRemoveVoucher}
						type="button"
					>
						Hapus
					</button>
				</div>
			)}

			<div className="safe-area-bottom border-border border-t bg-background px-3 pt-2 pb-2 shadow-[0_-4px_12px_rgba(0,0,0,0.08)]">
				<div className="flex items-center gap-2">
					<button
						aria-label="Lihat keranjang"
						className="flex min-w-0 flex-1 flex-col justify-center text-left"
						disabled={!hasItems}
						onClick={onOpenCart}
						type="button"
					>
						{discountAmount > 0 && (
							<span className="text-[10px] text-muted-foreground line-through">
								{formatCurrency(totalAmount)}
							</span>
						)}
						<span className="font-bold text-base text-foreground">
							{formatCurrency(finalTotal)}
						</span>
					</button>

					<button
						aria-label={`Keranjang: ${totalItems} item`}
						className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-card active:scale-95"
						onClick={onOpenCart}
						type="button"
					>
						<ShoppingCart className="h-5 w-5 text-foreground" />
						{totalItems > 0 && (
							<span className="absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 font-bold text-[10px] text-primary-foreground shadow">
								{totalItems}
							</span>
						)}
					</button>

					<button
						aria-label="Pakai voucher"
						className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-emerald-500/50 border-dashed bg-emerald-50 active:scale-95"
						onClick={onOpenVoucher}
						type="button"
					>
						<Tag className="h-4 w-4 text-emerald-600" />
					</button>

					<button
						aria-label="Bayar pesanan"
						className="flex h-11 shrink-0 items-center gap-2 rounded-xl bg-primary px-5 font-bold text-primary-foreground shadow-md active:scale-95 disabled:opacity-50"
						disabled={!hasItems || isSubmitting}
						onClick={onCheckout}
						type="button"
					>
						{getPayButtonLabel(isSubmitting, hasItems, totalItems)}
					</button>
				</div>
			</div>
		</div>
	);
}

// ============================================
// Mobile Cart Drawer
// ============================================
function MobileCartDrawer({
	isOpen,
	onOpenChange,
	items,
	totalItems,
	appliedVoucher,
	totalAmount,
	discountAmount,
	finalTotal,
	isSubmitting,
	onUpdateQuantity,
	onClearCart,
	onOpenVoucher,
	onCancel,
	onCheckout,
}: {
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
	items: CartItem[];
	totalItems: number;
	appliedVoucher: { name: string } | null;
	totalAmount: number;
	discountAmount: number;
	finalTotal: number;
	isSubmitting: boolean;
	onUpdateQuantity: (
		productId: string,
		variant: string | undefined,
		delta: number
	) => void;
	onClearCart: () => void;
	onOpenVoucher: () => void;
	onCancel: () => void;
	onCheckout: () => void;
}) {
	return (
		<Sheet onOpenChange={onOpenChange} open={isOpen}>
			<SheetContent
				className="flex max-h-[85vh] flex-col rounded-t-2xl md:hidden"
				showCloseButton={false}
				side="bottom"
			>
				<div className="flex justify-center pt-2 pb-1">
					<div className="h-1 w-10 rounded-full bg-muted-foreground/20" />
				</div>

				<SheetHeader className="flex-row items-center justify-between px-4 pt-1 pb-2">
					<SheetTitle className="font-bold text-foreground text-lg">
						Keranjang ({totalItems})
					</SheetTitle>
					<div className="flex items-center gap-2">
						{items.length > 0 && (
							<button
								className="rounded-lg px-2 py-1 font-medium text-destructive text-xs active:bg-destructive/10"
								onClick={onClearCart}
								type="button"
							>
								Hapus Semua
							</button>
						)}
						<button
							aria-label="Tutup keranjang"
							className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground active:scale-95"
							onClick={() => onOpenChange(false)}
							type="button"
						>
							<X className="h-4 w-4" />
						</button>
					</div>
				</SheetHeader>

				<div className="flex-1 overflow-y-auto px-4 py-2">
					{items.length === 0 ? (
						<EmptyCart className="py-8" size="sm" />
					) : (
						<div className="space-y-2">
							{items.map((item) => (
								<CartItemRow
									item={item}
									key={`${item.productId}-${item.variant}`}
									onUpdateQuantity={onUpdateQuantity}
								/>
							))}
						</div>
					)}
				</div>

				{items.length > 0 && (
					<div className="safe-area-bottom border-border border-t bg-background px-4 pt-3 pb-3">
						<button
							className="mb-3 flex w-full items-center justify-between rounded-lg border border-emerald-500/50 border-dashed bg-emerald-50 p-2.5 active:bg-emerald-100"
							onClick={onOpenVoucher}
							type="button"
						>
							<div className="flex items-center gap-2">
								<Tag className="h-4 w-4 text-emerald-600" />
								<span className="font-medium text-emerald-700 text-sm">
									{appliedVoucher ? appliedVoucher.name : "Pakai Voucher"}
								</span>
							</div>
							{appliedVoucher && (
								<span className="rounded-full bg-emerald-600 px-2 py-0.5 font-semibold text-white text-xs">
									Terpasang
								</span>
							)}
						</button>

						<div className="mb-3">
							<PriceSummary
								discountAmount={discountAmount}
								finalTotal={finalTotal}
								totalAmount={totalAmount}
							/>
						</div>

						<div className="grid grid-cols-4 gap-2">
							<button
								className="col-span-1 flex items-center justify-center rounded-xl border border-border bg-background p-3 font-medium text-muted-foreground text-sm active:bg-muted"
								onClick={onCancel}
								type="button"
							>
								Batal
							</button>
							<button
								className={`col-span-3 flex items-center justify-center rounded-xl bg-primary p-3 font-bold text-primary-foreground shadow-md active:scale-[0.98] ${
									isSubmitting ? "cursor-not-allowed opacity-50" : ""
								}`}
								disabled={isSubmitting}
								onClick={onCheckout}
								type="button"
							>
								{isSubmitting
									? "Memproses..."
									: `Bayar ${formatCurrency(finalTotal)}`}
							</button>
						</div>
					</div>
				)}
			</SheetContent>
		</Sheet>
	);
}

// ============================================
// Main Page
// ============================================
function MenuPage() {
	const categories = useQuery(api.products.getCategories);
	const siteSettings = useQuery(api.site_settings.getSettings);
	const activeDiscounts = useQuery(api.discounts.getActiveDiscounts);

	const [selectedCategory, setSelectedCategory] =
		useState<Id<"categories"> | null>(null);
	const {
		items,
		addToCart,
		updateQuantity,
		totalAmount,
		clearCart,
		appliedVoucher,
		applyVoucher,
		discountAmount,
		finalTotal,
	} = useCart();
	const createOrder = useMutation(api.orders.createOrder);
	const navigate = useNavigate();
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
	const [isVoucherModalOpen, setIsVoucherModalOpen] = useState(false);
	const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);

	const totalItems = items.reduce((acc: number, i) => acc + i.quantity, 0);

	const products = useQuery(api.products.getProducts, {
		categoryId: selectedCategory ?? undefined,
	}) as (Product & { categoryId: string })[] | undefined;

	const handleAddToCart = useCallback(
		(product: Product) => {
			const { finalPrice } = calculateEffectivePrice(
				{
					_id: product._id,
					price: product.price,
					categoryId: product.categoryId || "",
				},
				activeDiscounts
			);

			addToCart({
				productId: product._id,
				name: product.name,
				price: finalPrice,
				quantity: 1,
				image: product.image,
			});
			toast.success(`${product.name} ditambahkan ke keranjang`, {
				position: "bottom-left",
				duration: 1000,
			});
		},
		[activeDiscounts, addToCart]
	);

	const handleCheckout = async (finalAmount?: number, _discountId?: string) => {
		if (items.length === 0) {
			toast.error("Keranjang kosong. Tambahkan item terlebih dahulu.");
			return;
		}

		if (finalAmount === undefined) {
			setIsPaymentModalOpen(true);
			return;
		}

		setIsSubmitting(true);
		try {
			await createOrder({
				items: items.map((i) => ({
					productId: i.productId as Id<"products">,
					productName: i.name,
					variant: i.variant,
					quantity: i.quantity,
					price: i.price,
				})),
				totalAmount: finalAmount,
				paymentMethod: "tunai",
				customerName: "Pelanggan",
			});

			const orderDetails = {
				orderNumber: `ORD-${Date.now().toString().slice(-4)}`,
				items: items.map((i) => ({
					productId: i.productId,
					name: i.name,
					variant: i.variant,
					price: i.price,
					quantity: i.quantity,
				})),
				totalAmount: finalAmount,
				paymentMethod: "tunai",
				createdAt: Date.now(),
			};

			if (siteSettings?.autoPrint && bluetoothPrinter.isConnected()) {
				try {
					await bluetoothPrinter.print(orderDetails, {
						storeName: siteSettings.storeName,
						storeAddress: siteSettings.storeAddress,
						storePhone: siteSettings.storePhone,
						receiptFooter: siteSettings.receiptFooter,
					});
					toast.success("Struk dicetak otomatis");
				} catch (printError) {
					console.error("Auto print failed:", printError);
					toast.error("Gagal cetak struk otomatis");
				}
			}

			clearCart();
			setIsPaymentModalOpen(false);
			setIsMobileCartOpen(false);
			toast.success("Pesanan berhasil dibuat!", {
				description: "Silakan tunggu staf kami memproses pesanan Anda.",
				position: "top-center",
				action: {
					label: "Cetak Struk",
					onClick: async () => {
						if (!bluetoothPrinter.isConnected()) {
							toast.error(
								"Printer tidak terhubung. Silakan hubungkan di Pengaturan."
							);
							return;
						}
						try {
							await bluetoothPrinter.print(orderDetails, {
								storeName: siteSettings?.storeName,
								storeAddress: siteSettings?.storeAddress,
								storePhone: siteSettings?.storePhone,
								receiptFooter: siteSettings?.receiptFooter,
							});
							toast.success("Struk sedang dicetak");
						} catch (_e) {
							toast.error("Gagal mencetak struk.");
						}
					},
				},
			});
		} catch (e) {
			console.error(e);
			toast.error("Gagal membuat pesanan. Silakan coba lagi.");
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleCancelAction = () => {
		if (items.length > 0) {
			clearCart();
			toast.info("Pesanan dibatalkan.");
		} else {
			navigate({ to: "/" });
		}
	};

	return (
		<div className="flex h-dvh w-full flex-col overflow-hidden bg-background font-sans text-sm">
			<SkipLink target="main-content" />

			{/* Header / Category Tabs */}
			<header className="shrink-0 border-border border-b bg-background/95 backdrop-blur-sm shadow-sm">
				<div className="flex items-center gap-1 px-2 py-1.5 md:px-3 md:py-2">
					<div
						className="no-scrollbar flex flex-1 gap-1.5 overflow-x-auto scroll-smooth"
						role="tablist"
						style={{ WebkitOverflowScrolling: 'touch' }}
					>
						<button
							aria-label="Tampilkan semua kategori"
							aria-selected={selectedCategory === null}
							className={`shrink-0 whitespace-nowrap rounded-md border px-3 py-1.5 font-medium text-sm transition-colors md:px-4 md:py-2 ${
								selectedCategory === null
									? "border-primary bg-primary text-primary-foreground"
									: "border-border bg-background text-foreground hover:bg-muted"
							}`}
							onClick={() => setSelectedCategory(null)}
							role="tab"
							type="button"
						>
							Semua
						</button>
						{categories?.map((cat) => (
							<button
								aria-label={`Tampilkan kategori ${cat.name}`}
								aria-selected={selectedCategory === cat._id}
								className={`shrink-0 whitespace-nowrap rounded-md border px-3 py-1.5 font-medium text-sm transition-colors md:px-4 md:py-2 ${
									selectedCategory === cat._id
										? "border-primary bg-primary text-primary-foreground"
										: "border-border bg-background text-foreground hover:bg-muted"
								}`}
								key={cat._id}
								onClick={() => setSelectedCategory(cat._id)}
								role="tab"
								type="button"
							>
								{cat.name}
							</button>
						))}
					</div>
					<MenuSidebar />
				</div>
			</header>

			{/* Main Content Area */}
			<div className="flex flex-1 overflow-hidden">
				{/* Product Grid */}
				<main
					className="flex-1 overflow-y-auto bg-muted/20 p-2 pb-36 md:pb-2 md:p-3"
					id="main-content"
					tabIndex={-1}
				>
					{products ? (
						<div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
							{products.map((product) => {
								const { finalPrice } = calculateEffectivePrice(
									{
										_id: product._id,
										price: product.price,
										categoryId: product.categoryId || "",
									},
									activeDiscounts
								);
								const cartItem = items.find((i) => i.productId === product._id);

								return (
									<button
										className="group relative flex cursor-pointer flex-col overflow-hidden rounded-xl border border-border bg-card text-left shadow-sm transition-all hover:border-primary/20 hover:shadow-md active:scale-[0.97]"
										key={product._id}
										onClick={() => handleAddToCart(product)}
										type="button"
									>
										{cartItem && (
											<div className="absolute top-1.5 right-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-primary font-bold text-primary-foreground text-xs shadow-md">
												{cartItem.quantity}
											</div>
										)}

										<div className="relative aspect-square overflow-hidden bg-muted">
											{product.image ? (
												<img
													alt={product.name}
													className="h-full w-full object-cover object-center transition-transform duration-300 group-hover:scale-105"
													height={200}
													loading="lazy"
													src={product.image}
													width={200}
												/>
											) : (
												<div className="flex h-full w-full items-center justify-center bg-primary/5">
													<span className="font-bold text-3xl text-primary/30">
														{product.name.charAt(0)}
													</span>
												</div>
											)}
										</div>

										<div className="flex flex-1 flex-col justify-between gap-1 p-2.5 md:p-3">
											<h3 className="line-clamp-2 font-semibold text-foreground text-xs leading-tight md:text-sm">
												{product.name}
											</h3>
											<span className="font-bold text-primary text-sm md:text-base">
												{formatCurrency(finalPrice)}
											</span>
										</div>
									</button>
								);
							})}
						</div>
					) : (
						<div className="flex h-full items-center justify-center">
							<div className="flex flex-col items-center gap-3">
								<div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
								<span className="font-medium text-muted-foreground text-sm">
									Memuat Menu...
								</span>
							</div>
						</div>
					)}
				</main>

				{/* Desktop Cart Sidebar */}
				<aside
					aria-label="Keranjang belanja"
					className="z-20 hidden h-full w-[320px] shrink-0 flex-col border-border border-l bg-card shadow-xl md:flex"
				>
					<div className="shrink-0 flex items-center justify-between border-border border-b p-3">
						<h2 className="font-bold text-foreground text-lg">Pesanan</h2>
						<div className="flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-xs">
							<span className="font-medium text-muted-foreground">Item:</span>
							<span className="font-bold text-foreground">{totalItems}</span>
						</div>
					</div>

					<div className="flex-1 overflow-y-auto p-3">
						{items.length === 0 ? (
							<EmptyCart className="h-full justify-center" size="md" />
						) : (
							<div className="space-y-2">
								{items.map((item) => (
									<CartItemRow
										item={item}
										key={`${item.productId}-${item.variant}`}
										onUpdateQuantity={updateQuantity}
									/>
								))}
							</div>
						)}
					</div>

					<div className="shrink-0 border-border border-t bg-muted/10 p-4">
						<button
							className="mb-3 flex w-full items-center justify-between rounded-lg border border-emerald-500/50 border-dashed bg-emerald-50 p-2.5 transition-all hover:border-emerald-500 hover:bg-emerald-100"
							onClick={() => setIsVoucherModalOpen(true)}
							type="button"
						>
							<div className="flex items-center gap-2">
								<Tag className="h-4 w-4 text-emerald-600" />
								<span className="font-medium text-emerald-700 text-sm">
									{appliedVoucher ? appliedVoucher.name : "Pakai Voucher"}
								</span>
							</div>
							{appliedVoucher && (
								<span className="rounded-full bg-emerald-600 px-2 py-0.5 font-semibold text-white text-xs">
									Terpasang
								</span>
							)}
						</button>

						<div className="mb-3">
							<PriceSummary
								discountAmount={discountAmount}
								finalTotal={finalTotal}
								totalAmount={totalAmount}
							/>
						</div>

						<div className="grid grid-cols-4 gap-2">
							<button
								className="col-span-1 flex items-center justify-center rounded-lg border border-border bg-background p-3 font-medium text-muted-foreground text-sm transition-colors hover:bg-muted active:bg-muted/80"
								onClick={handleCancelAction}
								type="button"
							>
								Batal
							</button>
							<button
								aria-label="Bayar pesanan"
								className={`col-span-3 flex items-center justify-center rounded-lg bg-primary p-3 font-bold text-primary-foreground shadow-md transition-all hover:bg-primary/90 hover:shadow-lg active:scale-[0.98] ${
									items.length === 0 || isSubmitting
										? "cursor-not-allowed opacity-50"
										: ""
								}`}
								disabled={items.length === 0 || isSubmitting}
								onClick={() => handleCheckout()}
								type="button"
							>
								{isSubmitting ? "Memproses..." : "Bayar Sekarang"}
							</button>
						</div>
					</div>
				</aside>
			</div>

			{/* Mobile Bottom Bar */}
			<MobileBottomBar
				appliedVoucher={appliedVoucher}
				discountAmount={discountAmount}
				finalTotal={finalTotal}
				hasItems={items.length > 0}
				isSubmitting={isSubmitting}
				onCheckout={() => handleCheckout()}
				onOpenCart={() => setIsMobileCartOpen(true)}
				onOpenVoucher={() => setIsVoucherModalOpen(true)}
				onRemoveVoucher={() => applyVoucher(null)}
				totalAmount={totalAmount}
				totalItems={totalItems}
			/>

			{/* Mobile Cart Drawer */}
			<MobileCartDrawer
				appliedVoucher={appliedVoucher}
				discountAmount={discountAmount}
				finalTotal={finalTotal}
				isOpen={isMobileCartOpen}
				isSubmitting={isSubmitting}
				items={items}
				onCancel={() => {
					handleCancelAction();
					setIsMobileCartOpen(false);
				}}
				onCheckout={() => handleCheckout()}
				onClearCart={() => {
					clearCart();
					toast.info("Keranjang dikosongkan.");
				}}
				onOpenChange={setIsMobileCartOpen}
				onOpenVoucher={() => {
					setIsMobileCartOpen(false);
					setTimeout(() => setIsVoucherModalOpen(true), 200);
				}}
				onUpdateQuantity={updateQuantity}
				totalAmount={totalAmount}
				totalItems={totalItems}
			/>

			<PaymentConfirmationModal
				isOpen={isPaymentModalOpen}
				isSubmitting={isSubmitting}
				onClose={() => setIsPaymentModalOpen(false)}
				onConfirm={handleCheckout}
			/>

			<VoucherModal
				appliedVoucher={appliedVoucher}
				cartTotal={totalAmount}
				isOpen={isVoucherModalOpen}
				onApplyVoucher={applyVoucher}
				onClose={() => setIsVoucherModalOpen(false)}
			/>
		</div>
	);
}
