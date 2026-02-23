import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { api } from "@tkmpos/backend/convex/_generated/api";
import type { Id } from "@tkmpos/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Minus, Plus, Tag, Trash2 } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { MenuSidebar } from "@/components/pos/menu-sidebar";
import { PaymentConfirmationModal } from "@/components/pos/payment-modal";
import { VoucherModal } from "@/components/pos/voucher-modal";
import { SkipLink } from "@/components/ui/a11y";
import { EmptyCart } from "@/components/ui/empty-state";
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

	// Handle category selection - "null" means "All"
	const products = useQuery(api.products.getProducts, {
		categoryId: selectedCategory ?? undefined,
	}) as (Product & { categoryId: string })[] | undefined;

	// Optimistic add to cart dengan error handling
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
				paymentMethod: "tunai", // This could be enhanced to support selected method
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
					className="no-scrollbar flex flex-1 gap-1 overflow-x-auto"
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
					{products ? (
						<div className="grid grid-cols-2 gap-2 pb-20 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 lg:pb-0 xl:grid-cols-6">
							{products.map((product) => {
								const pricing = calculateEffectivePrice(
									{
										_id: product._id,
										price: product.price, // Use base price for discount calculation
										categoryId: product.categoryId || "",
									},
									activeDiscounts
								);

								const { finalPrice } = pricing;

								return (
									<button
										className="group flex cursor-pointer flex-col overflow-hidden rounded-xl border border-border bg-card text-left shadow-sm transition-all hover:border-primary/20 hover:shadow-md active:scale-[0.98]"
										key={product._id}
										onClick={() => handleAddToCart(product)}
										type="button"
									>
										{/* Image */}
										<div className="relative aspect-[4/3] bg-muted">
											{product.image ? (
												<img
													alt={product.name}
													className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
													height={150}
													loading="lazy"
													src={product.image}
													width={200}
												/>
											) : (
												<div className="flex h-full w-full items-center justify-center bg-primary/10">
													<span className="font-bold text-2xl text-primary/40">
														{product.name.charAt(0)}
													</span>
												</div>
											)}
										</div>

										{/* Content: Name & Price */}
										<div className="flex flex-col gap-1 p-3">
											<h3 className="line-clamp-2 font-semibold text-foreground text-sm leading-tight">
												{product.name}
											</h3>
											<span className="font-bold text-foreground text-sm">
												{new Intl.NumberFormat("id-ID", {
													style: "currency",
													currency: "IDR",
													maximumFractionDigits: 0,
												}).format(finalPrice)}
											</span>
										</div>
									</button>
								);
							})}
						</div>
					) : (
						<div className="flex h-full items-center justify-center font-medium text-muted-foreground text-sm">
							Memuat Menu...
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
							<EmptyCart className="h-full justify-center" size="md" />
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
						{/* Voucher Button */}
						<button
							className="mb-3 flex w-full items-center justify-between rounded-lg border border-emerald-500/50 border-dashed bg-emerald-50 p-2.5 transition-all hover:border-emerald-500 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:hover:bg-emerald-900/40"
							onClick={() => setIsVoucherModalOpen(true)}
							type="button"
						>
							<div className="flex items-center gap-2">
								<Tag className="h-4 w-4 text-emerald-600" />
								<span className="font-medium text-emerald-700 text-sm dark:text-emerald-400">
									{appliedVoucher ? appliedVoucher.name : "Pakai Voucher"}
								</span>
							</div>
							{appliedVoucher && (
								<span className="rounded-full bg-emerald-600 px-2 py-0.5 font-semibold text-white text-xs">
									Terpasang
								</span>
							)}
						</button>

						{/* Price Breakdown */}
						<div className="mb-3 space-y-1.5">
							<div className="flex items-center justify-between">
								<span className="text-muted-foreground text-sm">Subtotal</span>
								<span className="font-medium text-sm">
									{new Intl.NumberFormat("id-ID", {
										style: "currency",
										currency: "IDR",
										maximumFractionDigits: 0,
									}).format(totalAmount)}
								</span>
							</div>
							{discountAmount > 0 && (
								<div className="flex items-center justify-between">
									<span className="text-muted-foreground text-sm">Diskon</span>
									<span className="font-medium text-green-600 text-sm">
										-
										{new Intl.NumberFormat("id-ID", {
											style: "currency",
											currency: "IDR",
											maximumFractionDigits: 0,
										}).format(discountAmount)}
									</span>
								</div>
							)}
							<div className="flex items-center justify-between border-border border-t pt-1.5">
								<span className="font-medium text-muted-foreground text-sm">
									Total
								</span>
								<span className="font-bold text-foreground text-xl">
									{new Intl.NumberFormat("id-ID", {
										style: "currency",
										currency: "IDR",
										maximumFractionDigits: 0,
									}).format(finalTotal)}
								</span>
							</div>
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
				{/* Voucher quick button */}
				{appliedVoucher && (
					<div className="mb-2 flex items-center justify-between rounded-lg bg-emerald-100 px-3 py-1.5 dark:bg-emerald-900/40">
						<div className="flex items-center gap-2">
							<Tag className="h-3 w-3 text-emerald-600" />
							<span className="font-medium text-emerald-700 text-xs dark:text-emerald-400">
								{appliedVoucher.name}
							</span>
						</div>
						<button
							className="font-medium text-red-500 text-xs hover:underline"
							onClick={() => applyVoucher(null)}
							type="button"
						>
							Hapus
						</button>
					</div>
				)}
				<div className="flex gap-3">
					<div className="flex flex-1 flex-col justify-center">
						{discountAmount > 0 ? (
							<>
								<span className="text-muted-foreground text-xs line-through">
									{new Intl.NumberFormat("id-ID", {
										style: "currency",
										currency: "IDR",
										maximumFractionDigits: 0,
									}).format(totalAmount)}
								</span>
								<span className="font-bold text-lg text-primary">
									{new Intl.NumberFormat("id-ID", {
										style: "currency",
										currency: "IDR",
										maximumFractionDigits: 0,
									}).format(finalTotal)}
								</span>
							</>
						) : (
							<span className="font-bold text-lg text-primary">
								{new Intl.NumberFormat("id-ID", {
									style: "currency",
									currency: "IDR",
									maximumFractionDigits: 0,
								}).format(finalTotal)}
							</span>
						)}
					</div>
					<button
						aria-label="Pakai voucher"
						className="flex items-center justify-center rounded-lg border border-emerald-500/50 border-dashed bg-emerald-50 px-3 dark:bg-emerald-950/30"
						onClick={() => setIsVoucherModalOpen(true)}
						type="button"
					>
						<Tag className="h-4 w-4 text-emerald-600" />
					</button>
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
