import { api } from "@yumipos/backend/convex/_generated/api";
import type { Doc } from "@yumipos/backend/convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import { 
	Tag, 
	X, 
	Wallet, 
	QrCode, 
	Banknote, 
	Zap, 
	ChevronRight, 
	Calculator,
	Info,
	Coffee,
	ShoppingBag
} from "lucide-react";
import { useMemo, useState, useEffect } from "react";
import { createPortal } from "react-dom";
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
		paymentMethod?: string,
		orderData?: {
			tableNumber?: string;
			orderType?: "dine_in" | "takeaway";
			notes?: string;
			autoComplete?: boolean;
		}
	) => void;
	isSubmitting: boolean;
}

export function PaymentConfirmationModal({
	isOpen,
	onClose,
	onConfirm,
	isSubmitting,
}: PaymentModalProps) {
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setMounted(true);
	}, []);

	const { items, totalAmount, customerInfo } = useCart();
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

	// Remove redundant fields that are now in CartContext
	const [autoComplete, setAutoComplete] = useState(true);

	// Cash Assistant State...
	const [cashReceived, setCashReceived] = useState<number | "">("");
	const [changeAmount, setChangeAmount] = useState<number>(0);

	// Calculate change whenever cashReceived or finalTotal changes
	useEffect(() => {
		if (typeof cashReceived === "number" && cashReceived >= finalTotal) {
			setChangeAmount(cashReceived - finalTotal);
		} else {
			setChangeAmount(0);
		}
	}, [cashReceived, finalTotal]);

	const handleQuickCash = (amount: number) => {
		setCashReceived(amount);
	};

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

	const modalContent = (
		<AnimatePresence>
			{isOpen && (
				<div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-2 sm:p-4 backdrop-blur-md">
					<motion.div
						animate={{ opacity: 1, scale: 1, y: 0 }}
						className="relative flex w-full max-w-md max-h-[95vh] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
						exit={{ opacity: 0, scale: 0.95, y: 10 }}
						initial={{ opacity: 0, scale: 0.95, y: 10 }}
					>
					{/* Close Button */}
					<IconButton
						aria-label="Tutup modal pembayaran"
						className="absolute top-3 right-3 z-20 bg-background/50 backdrop-blur-md hover:bg-background"
						iconSize="sm"
						onClick={onClose}
						size="sm"
						variant="ghost"
					>
						<X className="h-4 w-4" />
					</IconButton>

					<div className="flex flex-col items-center justify-center border-border border-b bg-muted/30 p-4 sm:p-6">
						{selectedPaymentMethod === "qris" && siteSettings?.qrisImage ? (
							<div className="flex flex-col items-center gap-2">
								<div className="rounded-lg border-2 border-white bg-white p-1.5 shadow-md">
									<img
										alt="QRIS Statis"
										className="max-h-[140px] w-auto object-contain"
										src={siteSettings.qrisImage}
									/>
								</div>
								<p className="font-bold text-primary text-[10px] tracking-widest uppercase">
									PINDAI UNTUK MEMBAYAR
								</p>
							</div>
						) : siteSettings?.paymentPopupImage ? (
							<img
								alt="Banner Pembayaran"
								className="max-h-[120px] w-auto max-w-full rounded-lg object-contain shadow-sm"
								src={siteSettings.paymentPopupImage}
							/>
						) : (
							<div className="flex h-16 w-full items-center justify-center rounded-lg bg-muted/50 border border-dashed border-border">
								<span className="font-bold text-muted-foreground text-[10px] uppercase tracking-widest opacity-60">
									Sistem Pembayaran
								</span>
							</div>
						)}
					</div>

					<div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 scrollbar-thin">
						{/* --- SECTION: ORDER INFO SUMMARY --- */}
						<div className="space-y-3">
							<div className="flex items-center gap-2">
								<Info className="h-3.5 w-3.5 text-primary/70" />
								<h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80">Ringkasan Pesanan</h3>
							</div>
							
							<div className="grid grid-cols-2 gap-2 rounded-xl bg-muted/30 border border-border/50 p-3">
								<div className="space-y-1">
									<p className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest">Pelanggan</p>
									<p className="text-xs font-bold text-foreground truncate">{customerInfo.name || "Pelanggan Umum"}</p>
								</div>
								<div className="space-y-1 text-right">
									<p className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest">Tipe / Meja</p>
									<p className="text-xs font-bold text-foreground">
										{customerInfo.orderType === 'dine_in' ? `Dine In / ${customerInfo.tableNumber || '-'}` : 'Takeaway'}
									</p>
								</div>
							</div>
						</div>

						{/* --- SECTION: PAYMENT METHODS --- */}
						<div className="space-y-3 pt-4 border-t border-dashed border-border/50">
							<div className="flex items-center gap-2">
								<Wallet className="h-3.5 w-3.5 text-primary/70" />
								<h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80">Metode Pembayaran</h3>
							</div>

							<div className="grid grid-cols-2 gap-2">
								{paymentOptions.map((opt) => {
									const isSelected = selectedPaymentMethod === opt.id;
									let Icon = Wallet;
									if (opt.id === "qris" || opt.id === "qris_mayar") Icon = QrCode;
									if (opt.id === "transfer") Icon = Banknote;

									return (
										<button
											key={opt.id}
											type="button"
											onClick={() => setSelectedPaymentMethod(opt.id)}
											className={`flex items-center gap-3 rounded-xl border px-3 py-3 transition-all active:scale-95 ${
												isSelected
													? "border-primary bg-primary/5 text-primary shadow-sm"
													: "border-border bg-background text-muted-foreground hover:bg-muted/30 hover:text-foreground"
											}`}
										>
											<div className={`flex h-8 w-8 items-center justify-center rounded-lg ${isSelected ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'}`}>
												<Icon className="h-4 w-4" />
											</div>
											<span className="text-[9px] font-bold uppercase tracking-wider text-left leading-tight">
												{opt.label}
											</span>
										</button>
									);
								})}
							</div>
						</div>

						{/* --- SECTION: CASH ASSISTANT --- */}
						{selectedPaymentMethod === "tunai" && (
							<motion.div 
								initial={{ opacity: 0, scale: 0.98 }}
								animate={{ opacity: 1, scale: 1 }}
								className="space-y-3 rounded-2xl bg-primary/5 border border-primary/10 p-4"
							>
								<div className="flex items-center justify-between mb-1">
									<div className="flex items-center gap-2">
										<Zap className="h-3.5 w-3.5 text-primary" />
										<h3 className="text-[10px] font-bold uppercase tracking-widest text-primary">Kalkulator Tunai</h3>
									</div>
									{changeAmount > 0 && (
										<div className="flex items-center gap-1.5 rounded-full bg-green-500 px-2.5 py-1 text-white shadow-sm shadow-green-200">
											<span className="text-[8px] font-bold uppercase tracking-tighter">Kembali:</span>
											<span className="text-[11px] font-black">
												{new Intl.NumberFormat("id-ID").format(changeAmount)}
											</span>
										</div>
									)}
								</div>

								<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
									<div className="space-y-1.5">
										<label className="block font-bold text-primary/60 text-[9px] uppercase tracking-widest ml-1">
											Uang Diterima
										</label>
										<div className="relative">
											<span className="absolute left-3 top-1/2 -translate-y-1/2 font-black text-primary/40 text-[10px]">Rp</span>
											<input
												className="w-full rounded-xl border-2 border-primary/20 bg-background py-2.5 pl-8 pr-3 text-sm font-black text-primary outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/5"
												onChange={(e) => {
													const val = e.target.value.replace(/\D/g, "");
													setCashReceived(val === "" ? "" : parseInt(val));
												}}
												placeholder="0"
												type="text"
												value={cashReceived === "" ? "" : new Intl.NumberFormat("id-ID").format(cashReceived)}
											/>
										</div>
									</div>
									<div className="space-y-1.5">
										<label className="block font-bold text-primary/60 text-[9px] uppercase tracking-widest ml-1">
											Nominal Cepat
										</label>
										<div className="grid grid-cols-3 gap-1.5">
											{[50000, 100000].map(amount => (
												<button
													key={amount}
													type="button"
													onClick={() => handleQuickCash(amount)}
													className="rounded-lg border border-primary/20 bg-background py-2 text-[9px] font-black text-primary transition-all hover:bg-primary hover:text-white active:scale-90 shadow-sm"
												>
													{amount / 1000}K
												</button>
											))}
											<button
												type="button"
												onClick={() => handleQuickCash(finalTotal)}
												className="rounded-lg border border-primary bg-primary py-2 text-[8px] font-black text-white transition-all hover:opacity-90 active:scale-90 shadow-md shadow-primary/20"
											>
												PAS
											</button>
										</div>
									</div>
								</div>
							</motion.div>
						)}

						{/* --- SECTION: BILLING SUMMARY --- */}
						<div className="space-y-3 pt-4 border-t border-dashed border-border/50">
							<div className="flex items-center gap-2">
								<Calculator className="h-3.5 w-3.5 text-primary/70" />
								<h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80">Ringkasan Biaya</h3>
							</div>

							<div className="space-y-2 rounded-xl border border-border bg-muted/20 p-4">
								<div className="flex items-center justify-between text-[10px] text-muted-foreground">
									<span className="font-medium uppercase tracking-wide">Subtotal</span>
									<span className="font-bold text-foreground">
										{new Intl.NumberFormat("id-ID", {
											style: "currency",
											currency: "IDR",
											maximumFractionDigits: 0,
										}).format(totalAmount)}
									</span>
								</div>

								{discountAmount > 0 && (
									<div className="flex items-center justify-between text-[10px] text-green-600 font-bold">
										<span className="flex items-center gap-1 uppercase tracking-wide">
											<Tag className="h-2.5 w-2.5" /> Potongan Voucher
										</span>
										<span>
											-{new Intl.NumberFormat("id-ID", {
												style: "currency",
												currency: "IDR",
												maximumFractionDigits: 0,
											}).format(discountAmount)}
										</span>
									</div>
								)}

								{(serviceChargeAmount > 0 || taxAmount > 0) && (
									<div className="flex items-center justify-between text-[9px] text-muted-foreground/70 border-t border-border/50 pt-2">
										<span className="uppercase tracking-tighter">Biaya Tambahan (Pajak & Layanan)</span>
										<span className="font-bold">
											{new Intl.NumberFormat("id-ID", {
												style: "currency",
												currency: "IDR",
												maximumFractionDigits: 0,
											}).format(serviceChargeAmount + taxAmount)}
										</span>
									</div>
								)}

								<div className="mt-1 flex items-center justify-between border-t-2 border-primary/10 pt-2">
									<span className="font-black text-primary text-[10px] uppercase tracking-widest">Total Bayar</span>
									<span className="font-black text-2xl text-primary tracking-tighter">
										{new Intl.NumberFormat("id-ID", {
											style: "currency",
											currency: "IDR",
											maximumFractionDigits: 0,
										}).format(finalTotal)}
									</span>
								</div>

								{selectedPaymentMethod === "tunai" && cashReceived !== "" && (
									<div className="mt-2 flex items-center justify-between border-t border-dashed border-primary/20 pt-2 text-emerald-600">
										<span className="font-bold text-[9px] uppercase tracking-widest">Uang Kembali</span>
										<span className="font-black text-lg tracking-tighter">
											{new Intl.NumberFormat("id-ID", {
												style: "currency",
												currency: "IDR",
												maximumFractionDigits: 0,
											}).format(changeAmount)}
										</span>
									</div>
								)}
							</div>
						</div>

						{/* Voucher & Auto Complete */}
						<div className="space-y-3 pt-2">
							{/* Discount Dropdown */}
							{validDiscounts.length > 0 && (
								<div className="relative">
									<label
										className="mb-1.5 block font-bold text-muted-foreground/60 text-[9px] uppercase tracking-widest ml-1"
										htmlFor="discount-select"
									>
										Pilih Voucher Lain
									</label>
									<select
										className="w-full appearance-none rounded-xl border border-border bg-background py-2.5 pr-10 pl-3 font-bold text-foreground text-[10px] outline-none transition-all focus:border-primary/50 focus:ring-4 focus:ring-primary/5"
										id="discount-select"
										onChange={(e) => setSelectedDiscountId(e.target.value)}
										value={selectedDiscountId || ""}
									>
										<option value="">TANPA VOUCHER</option>
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
									<Tag className="pointer-events-none absolute bottom-2.5 right-3 h-3.5 w-3.5 text-muted-foreground/40" />
								</div>
							)}

							{/* Auto Complete Toggle */}
							<div className="flex items-center justify-between p-3 rounded-xl bg-primary/5 border border-primary/10">
								<div className="flex items-center gap-3">
									<div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
										<Zap className="h-3.5 w-3.5" />
									</div>
									<div className="space-y-0.5">
										<div className="flex items-center gap-1.5">
											<span className="block font-black text-primary text-[9px] uppercase tracking-widest">Otomatis Lunas</span>
										</div>
										<p className="text-[8px] text-muted-foreground font-medium leading-none">Instant Settlement & Stok</p>
									</div>
								</div>
								<button
									className={`relative h-5 w-9 rounded-full transition-all duration-300 ${autoComplete ? "bg-primary shadow-sm shadow-primary/20" : "bg-muted-foreground/20"}`}
									onClick={() => setAutoComplete(!autoComplete)}
									type="button"
								>
									<div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all duration-300 ${autoComplete ? "right-0.5" : "left-0.5"}`} />
								</button>
							</div>
						</div>
					</div>

					{/* Fixed Footer Actions */}
					<div className="border-t border-border bg-muted/10 p-4 sm:p-5 flex gap-3">
						<button
							className="flex-1 rounded-xl bg-background border border-border py-3.5 font-bold text-muted-foreground text-[10px] uppercase tracking-widest transition-all hover:bg-muted active:scale-95"
							disabled={isSubmitting}
							onClick={onClose}
							type="button"
						>
							Batal
						</button>
						<button
							aria-label="Konfirmasi pembayaran"
							className="flex-[2] rounded-xl bg-primary py-3.5 font-black text-primary-foreground text-xs uppercase tracking-widest shadow-lg shadow-primary/20 transition-all hover:opacity-90 active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
							disabled={isSubmitting}
							onClick={() =>
								onConfirm(
									finalTotal,
									selectedDiscountId || undefined,
									selectedPaymentMethod,
									{
										autoComplete,
										cashReceived: typeof cashReceived === "number" ? cashReceived : 0,
										changeAmount: changeAmount
									}
								)
							}
							type="button"
						>
							{isSubmitting ? (
								<ShimmerSkeleton className="h-4 w-20" />
							) : (
								<>
									<span>KONFIRMASI BAYAR</span>
									<ChevronRight className="h-3.5 w-3.5" />
								</>
							)}
						</button>
					</div>
				</motion.div>
			</div>
			)}
		</AnimatePresence>
	);

	if (!mounted) return null;

	return createPortal(modalContent, document.body);
}
