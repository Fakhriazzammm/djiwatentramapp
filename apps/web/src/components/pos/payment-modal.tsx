import { api } from "@yumipos/backend/convex/_generated/api";
import type { Doc } from "@yumipos/backend/convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import { Tag, X } from "lucide-react";
import { useMemo, useState } from "react";
import { IconButton } from "@/components/ui/icon";
import { ShimmerSkeleton } from "@/components/ui/loading-state";
import { useCart } from "@/context/cart-context";
import { isDiscountApplicable } from "@/lib/utils/pricing";

interface PaymentModalProps {
	isOpen: boolean;
	onClose: () => void;
	onConfirm: (
		finalAmount: number,
		discountId?: string,
		paymentMethod?: string
	) => void;
	isSubmitting: boolean;
}

export function PaymentConfirmationModal({
	isOpen,
	onClose,
	onConfirm,
	isSubmitting,
}: PaymentModalProps) {
	const { items, totalAmount } = useCart();
	const allActiveDiscounts = useQuery(api.discounts.getActiveDiscounts);
	const siteSettings = useQuery(api.site_settings.getSettings);

	const [selectedDiscountId, setSelectedDiscountId] = useState<string | null>(
		null
	);
	const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>("tunai");

	// Filter discounts based on time/date/target applicability
	const validDiscounts = useMemo(() => {
		if (!allActiveDiscounts) {
			return [];
		}

		const now = new Date();
		const context = {
			currentTimestamp: now.getTime(),
			currentDay: now.getDay(),
			currentTimeVal: now.getHours() * 60 + now.getMinutes(),
		};

		return allActiveDiscounts.filter((discount: Doc<"discounts">) => {
			// Since we don't have a single product here, we check if it applies to ANY item in the cart
			// or if it's an "ALL" target type.
			if (discount.targetType === "ALL") {
				return isDiscountApplicable(
					discount,
					{ _id: "", price: 0, categoryId: "" },
					context
				);
			}

			return items.some((item) =>
				isDiscountApplicable(
					discount,
					{
						_id: item.productId,
						price: item.price,
						categoryId: (item as { categoryId?: string }).categoryId || "",
					},
					context
				)
			);
		});
	}, [allActiveDiscounts, items]);

	// Calculate discount function
	const calculateDiscount = useMemo(() => {
		const getEligibleAmount = (
			discount: Doc<"discounts">,
			total: number,
			cartItems: typeof items
		) => {
			if (discount.targetType === "ALL") {
				return total;
			}

			const d = discount as { targetIds?: string[]; targetId?: string };
			const targetIds = d.targetIds || (d.targetId ? [d.targetId] : []);

			return cartItems.reduce((acc, item) => {
				const isApplicable =
					discount.targetType === "CATEGORY"
						? targetIds.includes(
								(item as { categoryId?: string }).categoryId || ""
							)
						: targetIds.includes(item.productId);

				return isApplicable ? acc + item.price * item.quantity : acc;
			}, 0);
		};

		return (
			discount: Doc<"discounts">,
			total: number,
			cartItems: typeof items
		) => {
			if (!discount) {
				return 0;
			}
			const eligibleAmount = getEligibleAmount(discount, total, cartItems);
			return discount.type === "PERCENTAGE"
				? eligibleAmount * (discount.value / 100)
				: Math.min(discount.value, eligibleAmount);
		};
	}, []);

	// Auto-select best discount from VALID discounts only
	useMemo(() => {
		if (validDiscounts.length > 0 && !selectedDiscountId) {
			let bestDetails = { id: null as string | null, amount: 0 };

			for (const discount of validDiscounts) {
				const discountAmount = calculateDiscount(discount, totalAmount, items);
				if (discountAmount > bestDetails.amount) {
					bestDetails = { id: discount._id, amount: discountAmount };
				}
			}

			if (bestDetails.id) {
				setSelectedDiscountId(bestDetails.id);
			}
		}
	}, [
		validDiscounts,
		totalAmount,
		items,
		selectedDiscountId,
		calculateDiscount,
	]);

	const currentDiscount = useMemo(() => {
		return validDiscounts.find((d: Doc<"discounts">) => d._id === selectedDiscountId);
	}, [validDiscounts, selectedDiscountId]);

	const discountAmount = useMemo(() => {
		if (!currentDiscount) {
			return 0;
		}
		return calculateDiscount(currentDiscount, totalAmount, items);
	}, [currentDiscount, totalAmount, items, calculateDiscount]);

	const subTotalAfterDiscount = Math.max(0, totalAmount - discountAmount);

	const taxRate = siteSettings?.taxRate ?? 0;
	const serviceChargeRate = siteSettings?.serviceChargeRate ?? 0;

	const serviceChargeAmount = subTotalAfterDiscount * (serviceChargeRate / 100);
	const taxAmount = subTotalAfterDiscount * (taxRate / 100);

	const finalTotal = subTotalAfterDiscount + serviceChargeAmount + taxAmount;

	// Opsi Pembayaran Dinamis
	const paymentOptions = useMemo(() => {
		const options = [];
		const manualMethods = siteSettings?.paymentMethodsManual;

		if (manualMethods?.cash !== false) {
			options.push({ id: "tunai", label: "TUNAI (CASH)" });
		}
		if (manualMethods?.qris !== false) {
			options.push({ id: "qris", label: "QRIS STATIS" });
		}
		if (manualMethods?.transfer !== false) {
			options.push({ id: "transfer", label: "TRANSFER BANK" });
		}
		if (siteSettings?.mayarEnabled) {
			options.push({ id: "qris_mayar", label: "QRIS DINAMIS (MAYAR)" });
		}

		// Fallback default
		if (options.length === 0) {
			options.push({ id: "tunai", label: "TUNAI (CASH)" });
		}

		return options;
	}, [siteSettings]);

	// Set default selection to first available option
	useMemo(() => {
		if (paymentOptions.length > 0 && !selectedPaymentMethod) {
			setSelectedPaymentMethod(paymentOptions[0].id);
		}
	}, [paymentOptions, selectedPaymentMethod]);

	if (!isOpen) {
		return null;
	}

	return (
		<AnimatePresence>
			<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-md">
				<motion.div
					animate={{ opacity: 1, scale: 1 }}
					className="relative flex w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
					exit={{ opacity: 0, scale: 0.95 }}
					initial={{ opacity: 0, scale: 0.95 }}
				>
					{/* Close Button */}
					<IconButton
						aria-label="Tutup modal pembayaran"
						className="absolute top-4 right-4 z-10"
						iconSize="lg"
						onClick={onClose}
						size="sm"
						variant="ghost"
					>
						<X className="h-5 w-5" />
					</IconButton>

					<div className="flex flex-col items-center justify-center border-border border-b bg-muted/50 p-8 pb-4">
						{selectedPaymentMethod === "qris" && siteSettings?.qrisImage ? (
							<div className="flex flex-col items-center gap-4">
								<div className="rounded-xl border-4 border-white bg-white p-2 shadow-lg">
									<img
										alt="QRIS Statis"
										className="max-h-[200px] w-auto object-contain"
										src={siteSettings.qrisImage}
									/>
								</div>
								<p className="font-bold text-primary text-sm tracking-widest">
									PINDAI UNTUK MEMBAYAR
								</p>
							</div>
						) : siteSettings?.paymentPopupImage ? (
							<img
								alt="Banner Pembayaran"
								className="max-h-[160px] w-auto max-w-full rounded-xl object-contain shadow-md"
								src={siteSettings.paymentPopupImage}
							/>
						) : (
							<div className="flex h-24 w-full items-center justify-center rounded-md bg-muted">
								<span className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
									Sistem Pembayaran
								</span>
							</div>
						)}
					</div>

					<div className="space-y-6 p-8">
						{/* Billing Section */}
						<div className="space-y-3 rounded-lg border border-border bg-muted/50 p-6">
							<div className="flex items-center justify-between">
								<span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
									Subtotal
								</span>
								<span className="font-semibold text-foreground text-sm">
									{new Intl.NumberFormat("id-ID", {
										style: "currency",
										currency: "IDR",
										maximumFractionDigits: 0,
									}).format(totalAmount)}
								</span>
							</div>

							{discountAmount > 0 && (
								<div className="flex items-center justify-between font-medium text-green-600">
									<span className="flex items-center gap-1.5 text-xs uppercase tracking-wide">
										<Tag className="h-3 w-3" /> Potongan
									</span>
									<span className="text-sm">
										-
										{new Intl.NumberFormat("id-ID", {
											style: "currency",
											currency: "IDR",
											maximumFractionDigits: 0,
										}).format(discountAmount)}
									</span>
								</div>
							)}

							{serviceChargeAmount > 0 && (
								<div className="flex items-center justify-between font-medium text-foreground">
									<span className="text-xs uppercase tracking-wide text-muted-foreground">
										Service Charge ({serviceChargeRate}%)
									</span>
									<span className="text-sm">
										{new Intl.NumberFormat("id-ID", {
											style: "currency",
											currency: "IDR",
											maximumFractionDigits: 0,
										}).format(serviceChargeAmount)}
									</span>
								</div>
							)}

							{taxAmount > 0 && (
								<div className="flex items-center justify-between font-medium text-foreground">
									<span className="text-xs uppercase tracking-wide text-muted-foreground">
										Pajak ({taxRate}%)
									</span>
									<span className="text-sm">
										{new Intl.NumberFormat("id-ID", {
											style: "currency",
											currency: "IDR",
											maximumFractionDigits: 0,
										}).format(taxAmount)}
									</span>
								</div>
							)}

							<div className="mt-2 flex items-center justify-between border-border border-t pt-3">
								<span className="font-semibold text-foreground text-xs uppercase tracking-wide">
									Total Bayar
								</span>
								<span className="font-bold text-2xl text-primary tracking-tight">
									{new Intl.NumberFormat("id-ID", {
										style: "currency",
										currency: "IDR",
										maximumFractionDigits: 0,
									}).format(finalTotal)}
								</span>
							</div>
						</div>

						{/* Items Summary */}
						<div className="max-h-[140px] overflow-y-auto rounded-lg border border-border bg-muted/30 p-4">
							<table className="w-full text-xs">
								<thead className="text-muted-foreground uppercase">
									<tr className="border-border border-b text-[10px]">
										<th className="pb-2 text-left font-medium tracking-wide">
											Pesanan
										</th>
										<th className="pb-2 text-center font-medium tracking-wide">
											Qty
										</th>
										<th className="pb-2 text-right font-medium tracking-wide">
											Total
										</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-border">
									{items.map((item, idx) => (
										<tr key={`${item.productId}-${idx}`}>
											<td className="py-2.5 font-medium text-foreground uppercase tracking-tight">
												{item.name}
											</td>
											<td className="py-2.5 text-center font-medium text-muted-foreground">
												{item.quantity}
											</td>
											<td className="py-2.5 text-right font-medium text-foreground">
												{new Intl.NumberFormat("id-ID").format(
													item.price * item.quantity
												)}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>

						{/* Payment Method Selection */}
						<div className="relative">
							<label
								className="mb-2 block font-medium text-muted-foreground text-xs uppercase tracking-wide"
								htmlFor="payment-method-select"
							>
								Metode Pembayaran
							</label>
							<div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
								{paymentOptions.map((opt) => (
									<button
										key={opt.id}
										type="button"
										onClick={() => setSelectedPaymentMethod(opt.id)}
										className={`rounded-lg border p-3 text-center text-xs font-bold transition-all ${
											selectedPaymentMethod === opt.id
												? "border-primary bg-primary/10 text-primary shadow-sm"
												: "border-border bg-background text-muted-foreground hover:bg-muted/50 hover:text-foreground"
										}`}
									>
										{opt.label}
									</button>
								))}
							</div>
						</div>

						{/* Discount Dropdown */}
						{validDiscounts.length > 0 && (
							<div className="relative">
								<label
									className="mb-2 block font-medium text-muted-foreground text-xs uppercase tracking-wide"
									htmlFor="discount-select"
								>
									Pilih Voucher / Diskon Menu
								</label>
								<select
									className="w-full appearance-none rounded-lg border border-border bg-background py-3 pr-12 pl-4 font-medium text-foreground text-sm outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
									id="discount-select"
									onChange={(e) => setSelectedDiscountId(e.target.value)}
									value={selectedDiscountId || ""}
								>
									<option value="">TANPA VOUCHER / DISKON</option>
									{validDiscounts.map((d: Doc<"discounts">) => (
										<option key={d._id} value={d._id}>
											{d.name.toUpperCase()} (
											{d.type === "PERCENTAGE"
												? `${d.value}%`
												: `RP ${d.value}`}
											)
										</option>
									))}
								</select>
								<Tag className="pointer-events-none absolute top-[38px] right-4 h-4 w-4 text-muted-foreground" />
							</div>
						)}

						{/* Primary Actions */}
						<div className="flex gap-4">
							<button
								className="flex-1 rounded-lg bg-muted py-4 font-medium text-foreground text-sm transition-all hover:bg-muted/80 active:scale-[0.98]"
								disabled={isSubmitting}
								onClick={onClose}
								type="button"
							>
								Batal
							</button>
							<button
								aria-label="Konfirmasi pembayaran"
								className="flex-[2] rounded-lg bg-primary py-4 font-semibold text-primary-foreground text-sm shadow-lg transition-all hover:bg-primary/90 active:scale-[0.98] disabled:opacity-50"
								disabled={isSubmitting}
								onClick={() =>
									onConfirm(
										finalTotal,
										selectedDiscountId || undefined,
										selectedPaymentMethod
									)
								}
								type="button"
							>
								{isSubmitting ? (
									<span className="flex items-center gap-2">
										<ShimmerSkeleton className="h-4 w-4" shape="circle" />
										MEMPROSES...
									</span>
								) : (
									"BAYAR SEKARANG"
								)}
							</button>
						</div>
					</div>
				</motion.div>
			</div>
		</AnimatePresence>
	);
}
