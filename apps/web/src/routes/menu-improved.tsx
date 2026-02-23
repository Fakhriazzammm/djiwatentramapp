/**
 * MENU PAGE - IMPROVED VERSION
 *
 * Enhanced dengan accessibility, better UX, dan cleaner code.
 */

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { api } from "@tkmpos/backend/convex/_generated/api";
import type { Id } from "@tkmpos/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Minus, Plus, Search, ShoppingCart, Trash2 } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { MenuSidebar } from "@/components/pos/menu-sidebar";
import { PaymentConfirmationModal } from "@/components/pos/payment-modal";
import { SkipLink } from "@/components/ui/a11y";
import { ShimmerSkeleton } from "@/components/ui/loading-state";
import {
	type Product,
	ProductCard,
	ProductGrid,
} from "@/components/ui/product-card";
import { useCart } from "@/context/cart-context";
import { bluetoothPrinter } from "@/lib/bluetooth-printer";
import { calculateEffectivePrice } from "@/lib/utils/pricing";

export const Route = createFileRoute("/menu-improved")({
	component: MenuPage,
});

function MenuPage() {
	const categories = useQuery(api.products.getCategories);
	const siteSettings = useQuery(api.site_settings.getSettings);
	const activeDiscounts = useQuery(api.discounts.getActiveDiscounts);

	const [selectedCategory, setSelectedCategory] =
		useState<Id<"categories"> | null>(null);
	const [searchQuery, setSearchQuery] = useState("");
	const { items, addToCart, updateQuantity, totalAmount, clearCart } =
		useCart();
	const createOrder = useMutation(api.orders.createOrder);
	const navigate = useNavigate();
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);

	// Handle category selection - "null" means "All"
	const products = useQuery(api.products.getProducts, {
		categoryId: selectedCategory ?? undefined,
	}) as (Product & { categoryId: string })[] | undefined;

	// Filter products by search query
	const filteredProducts = products?.filter(
		(p) =>
			p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
			p.description?.toLowerCase().includes(searchQuery.toLowerCase())
	);

	// Optimistic add to cart
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

		// If called without arguments (from button), open modal
		if (finalAmount === undefined) {
			setIsPaymentModalOpen(true);
			return;
		}

		setIsSubmitting(true);
		try {
			const _orderId = await createOrder({
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

			// Handle Auto Print
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
		<div className="flex h-full w-full flex-col overflow-hidden bg-background font-sans text-sm">
			<SkipLink target="main-content" />

			{/* Header / Tabs - Modern & Clean with Accessibility */}
			<header className="flex shrink-0 items-center justify-between gap-2 border-border border-b bg-background p-2 shadow-sm">
				<div
					className="scrollbar-hide flex flex-1 gap-1 overflow-x-auto"
					role="tablist"
				>
					{/* Category Tabs */}
					<button
						aria-label="Tampilkan semua kategori"
						aria-selected={selectedCategory === null}
						className={`touch-target relative min-w-[100px] whitespace-nowrap rounded-full border px-6 py-3 font-bold text-sm transition-all active:scale-95 ${
							selectedCategory === null
								? "border-primary bg-primary text-primary-foreground shadow-md"
								: "border-border bg-card text-muted-foreground hover:bg-muted/50 hover:text-foreground"
						}`}
						onClick={() => setSelectedCategory(null)}
						role="tab"
						type="button"
					>
						Semua
					</button>
					{categories?.map((cat, _index) => (
						<button
							aria-label={`Tampilkan kategori ${cat.name}`}
							aria-selected={selectedCategory === cat._id}
							className={`touch-target relative min-w-[100px] whitespace-nowrap rounded-full border px-6 py-3 font-bold text-sm transition-all active:scale-95 ${
								selectedCategory === cat._id
									? "border-primary bg-primary text-primary-foreground shadow-md"
									: "border-border bg-card text-muted-foreground hover:bg-muted/50 hover:text-foreground"
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
			</header>

			{/* Main Content Area */}
			<div className="flex flex-1 overflow-hidden">
				{/* Product Grid - Compact & Responsive */}
				<main
					className="flex-1 overflow-y-auto bg-muted/20 p-2"
					id="main-content"
					tabIndex={-1}
				>
					{filteredProducts ? (
						filteredProducts.length > 0 ? (
							<ProductGrid>
								{filteredProducts.map((product) => {
									const pricing = calculateEffectivePrice(
										{
											_id: product._id,
											price: product.price,
											categoryId: product.categoryId || "",
										},
										activeDiscounts
									);

									return (
										<ProductCard
											finalPrice={pricing.finalPrice}
											isPromo={pricing.isPromo}
											key={product._id}
											onClick={() => handleAddToCart(product)}
											product={product}
										/>
									);
								})}
							</ProductGrid>
						) : (
							<div className="flex h-full flex-col items-center justify-center">
								<Search className="mb-4 h-12 w-12 text-muted-foreground/30" />
								<p className="font-medium text-muted-foreground">
									Tidak ada produk yang ditemukan
								</p>
								<p className="mt-1 text-muted-foreground/60 text-sm">
									Coba kata kunci atau kategori lain
								</p>
								<button
									className="mt-4 rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground transition-colors hover:bg-primary/90"
									onClick={() => setSearchQuery("")}
									type="button"
								>
									Hapus Pencarian
								</button>
							</div>
						)
					) : (
						<div className="grid grid-cols-2 gap-2 pb-20 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 lg:pb-0 xl:grid-cols-6">
							{Array.from({ length: 12 }).map((_, i) => {
								const skeletonId = `skeleton-${i}`;
								return (
									<div
										className="flex flex-col overflow-hidden rounded-xl border border-border bg-card"
										key={skeletonId}
									>
										<div className="relative aspect-[4/3] bg-muted">
											<ShimmerSkeleton
												className="h-full w-full"
												shape="square"
											/>
										</div>
										<div className="flex flex-1 flex-col space-y-2 p-2">
											<ShimmerSkeleton height="14px" width="80%" />
											<ShimmerSkeleton height="12px" width="60%" />
											<ShimmerSkeleton
												className="mt-auto"
												height="16px"
												width="40%"
											/>
										</div>
									</div>
								);
							})}
						</div>
					)}
				</main>

				{/* Cart Sidebar - Refined Utility */}
				<aside
					aria-label="Keranjang belanja"
					className="z-20 hidden w-[300px] shrink-0 flex-col border-border border-l bg-card shadow-xl md:flex"
				>
					{/* Header */}
					<div className="flex items-center justify-between border-border border-b p-3">
						<h2 className="font-bold text-foreground text-lg">Pesanan</h2>
						<div className="flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-xs">
							<span className="font-medium text-muted-foreground">Item:</span>
							<span className="font-bold text-foreground">
								{items.reduce((acc: number, i) => acc + i.quantity, 0)}
							</span>
						</div>
					</div>

					{/* Cart Items */}
					<div className="flex-1 overflow-y-auto p-3">
						{items.length === 0 ? (
							<div className="flex h-full flex-col items-center justify-center text-muted-foreground">
								<ShoppingCart className="mb-3 h-12 w-12 opacity-10" />
								<p className="font-medium text-sm">Keranjang Kosong</p>
							</div>
						) : (
							<div className="space-y-3">
								{items.map((item) => (
									<div
										className="flex flex-col rounded-lg border border-border bg-background p-3 shadow-sm"
										key={`${item.productId}-${item.variant}`}
									>
										<div className="flex justify-between gap-2">
											<div className="flex-1">
												<span className="line-clamp-2 font-medium text-foreground text-sm leading-tight">
													{item.name}
												</span>
												<div className="mt-1 font-medium text-muted-foreground text-xs">
													{new Intl.NumberFormat("id-ID", {
														maximumFractionDigits: 0,
													}).format(item.price)}
												</div>
											</div>
											<span className="font-bold text-foreground text-sm">
												{new Intl.NumberFormat("id-ID", {
													maximumFractionDigits: 0,
												}).format(item.price * item.quantity)}
											</span>
										</div>

										<div className="mt-3 flex items-center justify-between border-border border-t pt-2">
											<button
												aria-label={`Hapus ${item.name} dari keranjang`}
												className="rounded-md p-1 pl-0 text-destructive hover:bg-destructive/10"
												onClick={() =>
													updateQuantity(
														item.productId,
														item.variant,
														-item.quantity
													)
												}
												type="button"
											>
												<Trash2 className="h-4 w-4" />
											</button>

											<div className="flex items-center gap-3">
												<button
													aria-label={`Kurangi jumlah ${item.name}`}
													className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-card text-foreground hover:bg-muted active:scale-95"
													onClick={() =>
														updateQuantity(item.productId, item.variant, -1)
													}
													type="button"
												>
													<Minus className="h-3 w-3" />
												</button>
												<output
													aria-live="polite"
													className="min-w-[1.5rem] text-center font-bold text-sm"
												>
													{item.quantity}
												</output>
												<button
													aria-label={`Tambah jumlah ${item.name}`}
													className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95"
													onClick={() =>
														updateQuantity(item.productId, item.variant, 1)
													}
													type="button"
												>
													<Plus className="h-3 w-3" />
												</button>
											</div>
										</div>
									</div>
								))}
							</div>
						)}
					</div>

					{/* Footer Actions */}
					<div className="border-border border-t bg-muted/10 p-4">
						<div className="mb-4 flex items-end justify-between">
							<span className="font-medium text-muted-foreground text-sm">
								Total
							</span>
							<span className="font-bold text-2xl text-primary">
								{new Intl.NumberFormat("id-ID", {
									style: "currency",
									currency: "IDR",
									maximumFractionDigits: 0,
								}).format(totalAmount)}
							</span>
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

			{/* Mobile Cart Floating Action (Visible only on small screens) */}
			<div className="fixed right-0 bottom-0 left-0 z-50 border-border border-t bg-background p-4 md:hidden">
				<div className="flex gap-3">
					<div className="flex flex-1 flex-col justify-center">
						<span className="text-muted-foreground text-xs">
							Total Pembayaran
						</span>
						<span className="font-bold text-lg text-primary">
							{new Intl.NumberFormat("id-ID", {
								style: "currency",
								currency: "IDR",
								maximumFractionDigits: 0,
							}).format(totalAmount)}
						</span>
					</div>
					<button
						aria-label="Bayar pesanan"
						className="flex items-center gap-2 rounded-lg bg-primary px-6 py-2 font-bold text-primary-foreground shadow-md active:scale-95 disabled:opacity-50"
						disabled={items.length === 0 || isSubmitting}
						onClick={() => (items.length > 0 ? handleCheckout() : null)}
						type="button"
					>
						{items.length > 0
							? `Bayar (${items.reduce((acc: number, i) => acc + i.quantity, 0)})`
							: "Keranjang"}
					</button>
				</div>
			</div>

			<PaymentConfirmationModal
				isOpen={isPaymentModalOpen}
				isSubmitting={isSubmitting}
				onClose={() => setIsPaymentModalOpen(false)}
				onConfirm={handleCheckout}
			/>
		</div>
	);
}
