import { api } from "@yumipos/backend/convex/_generated/api";
import type { Id } from "@yumipos/backend/convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import { Minus, Plus, ShoppingBag, Tag, Trash2, X } from "lucide-react";
import { useState } from "react";
import { VoucherModal } from "@/components/pos/voucher-modal";
import { EmptyCart } from "@/components/ui/empty-state";
import { IconButton } from "@/components/ui/icon";
import { useCart } from "@/context/cart-context";

export function CartDrawer({
	isOpen,
	onClose,
}: {
	isOpen: boolean;
	onClose: () => void;
}) {
	const {
		items,
		updateQuantity,
		totalAmount,
		clearCart,
		appliedVoucher,
		applyVoucher,
		discountAmount,
		finalTotal,
	} = useCart();
	const createOrder = useMutation(api.orders.createOrder);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [isVoucherModalOpen, setIsVoucherModalOpen] = useState(false);

	const handleCheckout = async () => {
		if (items.length === 0) {
			return;
		}
		setIsSubmitting(true);
		try {
			const orderId = await createOrder({
				items: items.map((i) => ({
					productId: i.productId as Id<"products">,
					productName: i.name,
					variant: i.variant,
					quantity: i.quantity,
					price: i.price,
				})),
				totalAmount: finalTotal,
				paymentMethod: "cash", // Default for now
				customerName: "Guest",
				voucherId: appliedVoucher?._id as Id<"discounts"> | undefined,
				discountAmount,
			});
			clearCart();
			onClose();
			console.log(`Order Placed! ID: ${orderId}`);
		} catch (e) {
			console.error(e);
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<AnimatePresence>
			{isOpen && (
				<>
					{/* Backdrop */}
					<motion.div
						animate={{ opacity: 1 }}
						className="fixed inset-0 z-40 bg-black/40 backdrop-blur-md"
						exit={{ opacity: 0 }}
						initial={{ opacity: 0 }}
						onClick={onClose}
					/>
					{/* Drawer */}
					<motion.div
						animate={{ x: 0 }}
						className="fixed top-0 right-0 z-50 flex h-full w-full flex-col border-border border-l bg-card shadow-2xl md:w-[480px]"
						exit={{ x: "100%" }}
						initial={{ x: "100%" }}
						transition={{ type: "spring", damping: 25, stiffness: 200 }}
					>
						{/* Header */}
						<div className="flex items-center justify-between border-border border-b p-6">
							<h2 className="flex items-center gap-3 font-bold text-foreground text-xl tracking-tight">
								<ShoppingBag className="h-6 w-6" /> Pesanan
							</h2>
							<IconButton
								aria-label="Tutup keranjang"
								iconSize="lg"
								onClick={onClose}
								size="sm"
								variant="ghost"
							>
								<X className="h-5 w-5" />
							</IconButton>
						</div>

						{/* Cart Items */}
						<div className="no-scrollbar flex-1 space-y-4 overflow-y-auto p-6">
							{items.length === 0 ? (
								<EmptyCart className="h-full justify-center py-12" size="lg" />
							) : (
								<>
									<div className="space-y-3">
										{items.map((item) => (
											<div
												className="flex gap-4 rounded-lg border border-border bg-background p-4 shadow-sm transition-all hover:shadow-md"
												key={`${item.productId}-${item.variant}`}
											>
												{/* Image */}
												<div className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-md bg-muted">
													{item.image && (
														<img
															alt={item.name}
															className="h-full w-full object-cover"
															height={80}
															src={item.image}
															width={80}
														/>
													)}
												</div>

												{/* Content */}
												<div className="flex flex-1 flex-col justify-between">
													<div>
														<h3 className="line-clamp-1 font-semibold text-base text-foreground leading-tight">
															{item.name}
														</h3>
														{item.variant && (
															<p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
																{item.variant}
															</p>
														)}
														<p className="mt-1 font-medium text-muted-foreground text-sm">
															{new Intl.NumberFormat("id-ID", {
																style: "currency",
																currency: "IDR",
																maximumFractionDigits: 0,
															}).format(item.price)}
														</p>
													</div>

													{/* Actions */}
													<div className="mt-3 flex items-center justify-between">
														<div className="flex items-center gap-2 rounded-lg bg-muted p-1.5">
															<button
																aria-label={`Kurangi jumlah ${item.name}`}
																className="rounded-md bg-card p-2 shadow-sm transition-all active:scale-90"
																onClick={() =>
																	updateQuantity(
																		item.productId,
																		item.variant,
																		-1
																	)
																}
																type="button"
															>
																{item.quantity === 1 ? (
																	<Trash2 className="h-4 w-4 text-destructive" />
																) : (
																	<Minus className="h-4 w-4 text-foreground" />
																)}
															</button>
															<span className="w-6 text-center font-semibold text-foreground text-sm">
																{item.quantity}
															</span>
															<button
																aria-label={`Tambah jumlah ${item.name}`}
																className="rounded-md bg-card p-2 shadow-sm transition-all active:scale-90"
																onClick={() =>
																	updateQuantity(
																		item.productId,
																		item.variant,
																		1
																	)
																}
																type="button"
															>
																<Plus className="h-4 w-4 text-foreground" />
															</button>
														</div>
														<p className="font-semibold text-base text-foreground">
															{new Intl.NumberFormat("id-ID", {
																style: "currency",
																currency: "IDR",
																maximumFractionDigits: 0,
															}).format(item.price * item.quantity)}
														</p>
													</div>
												</div>
											</div>
										))}
									</div>

									{/* AI Recommendations - Optional feature */}
									<div className="mt-8 rounded-xl border border-border bg-muted/50 p-6">
										<h4 className="mb-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">
											Saran Untukmu
										</h4>
										<p className="text-muted-foreground text-sm">
											Fitur rekomendasi AI akan segera hadir!
										</p>
									</div>
								</>
							)}
						</div>

						{/* Footer */}
						<div className="space-y-4 border-border border-t bg-muted/30 p-6">
							{/* Voucher Button */}
							<button
								className="flex w-full items-center justify-between rounded-lg border border-primary/50 border-dashed bg-primary/5 p-3 transition-all hover:border-primary hover:bg-primary/10"
								onClick={() => setIsVoucherModalOpen(true)}
								type="button"
							>
								<div className="flex items-center gap-2">
									<Tag className="h-4 w-4 text-primary" />
									<span className="font-medium text-primary text-sm">
										{appliedVoucher ? appliedVoucher.name : "Pakai Voucher"}
									</span>
								</div>
								{appliedVoucher && (
									<span className="rounded-full bg-primary px-2 py-0.5 font-semibold text-primary-foreground text-xs">
										Terpasang
									</span>
								)}
							</button>

							{/* Price Breakdown */}
							<div className="space-y-2">
								<div className="flex items-center justify-between">
									<span className="text-muted-foreground text-sm">
										Subtotal
									</span>
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
										<span className="text-muted-foreground text-sm">
											Diskon
										</span>
										<span className="font-medium text-primary text-sm">
											-
											{new Intl.NumberFormat("id-ID", {
												style: "currency",
												currency: "IDR",
												maximumFractionDigits: 0,
											}).format(discountAmount)}
										</span>
									</div>
								)}
								<div className="flex items-center justify-between border-border border-t pt-2">
									<span className="font-medium text-muted-foreground text-sm uppercase tracking-wide">
										Total Bayar
									</span>
									<span className="font-bold text-2xl text-foreground tracking-tight">
										{new Intl.NumberFormat("id-ID", {
											style: "currency",
											currency: "IDR",
											maximumFractionDigits: 0,
										}).format(finalTotal)}
									</span>
								</div>
							</div>

							<button
								aria-label="Konfirmasi pesanan"
								className="w-full rounded-lg bg-primary py-5 font-semibold text-primary-foreground text-sm uppercase tracking-wider shadow-lg transition-all hover:bg-primary/90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
								disabled={items.length === 0 || isSubmitting}
								onClick={handleCheckout}
								type="button"
							>
								{isSubmitting ? "MEMPROSES..." : "KONFIRMASI PESANAN"}
							</button>
						</div>
					</motion.div>

					{/* Voucher Modal */}
					<VoucherModal
						appliedVoucher={appliedVoucher}
						cartTotal={totalAmount}
						isOpen={isVoucherModalOpen}
						onApplyVoucher={applyVoucher}
						onClose={() => setIsVoucherModalOpen(false)}
					/>
				</>
			)}
		</AnimatePresence>
	);
}
