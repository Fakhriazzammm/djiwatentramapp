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
	const { items, totalAmount } = useCart();
	const allActiveDiscounts = useQuery(api.discounts.getActiveDiscounts);
	const siteSettings = useQuery(api.site_settings.getSettings);

	const [selectedDiscountId, setSelectedDiscountId] = useState<string | null>(
		null
	);
	const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>("tunai");
	
	// New Fields
	const [orderType, setOrderType] = useState<"dine_in" | "takeaway">("dine_in");
	const [tableNumber, setTableNumber] = useState("");
	const [notes, setNotes] = useState("");
	const [autoComplete, setAutoComplete] = useState(true);

	// Cash Assistant State
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

					<div className="space-y-6 p-8 overflow-y-auto max-h-[75vh]">
						{/* --- SECTION: ORDER INFO --- */}
						<div className="space-y-4">
							<div className="flex items-center gap-2 mb-2">
								<Info className="h-4 w-4 text-primary" />
								<h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Informasi Pesanan</h3>
							</div>
							
							{/* Dine-in / Takeaway Toggle */}
							<div className="grid grid-cols-2 gap-3 p-1 rounded-xl bg-muted/30 border border-border/50">
								<button
									type="button"
									onClick={() => setOrderType("dine_in")}
									className={`flex items-center justify-center gap-2 py-3 rounded-lg font-bold text-[10px] uppercase tracking-wider transition-all ${orderType === "dine_in" ? 'bg-white shadow-sm text-primary border border-border' : 'text-muted-foreground'}`}
								>
									<Coffee className="h-3 w-3" />
									Makan di Sini
								</button>
								<button
									type="button"
									onClick={() => setOrderType("takeaway")}
									className={`flex items-center justify-center gap-2 py-3 rounded-lg font-bold text-[10px] uppercase tracking-wider transition-all ${orderType === "takeaway" ? 'bg-white shadow-sm text-primary border border-border' : 'text-muted-foreground'}`}
								>
									<ShoppingBag className="h-3 w-3" />
									Bawa Pulang
								</button>
							</div>

							{/* Table Number & Notes Row */}
							<div className="grid grid-cols-2 gap-4">
								<div className="space-y-2">
									<label className="block font-medium text-muted-foreground text-[10px] uppercase tracking-widest">
										Nomor Meja
									</label>
									<input
										className={`w-full rounded-xl border border-border bg-background p-3 text-sm font-bold outline-none transition-all focus:ring-2 focus:ring-primary/20 ${orderType === 'takeaway' ? 'opacity-50 cursor-not-allowed' : ''}`}
										disabled={orderType === 'takeaway'}
										onChange={(e) => setTableNumber(e.target.value)}
										placeholder="No. Meja"
										type="text"
										value={tableNumber}
									/>
								</div>
								<div className="space-y-2">
									<label className="block font-medium text-muted-foreground text-[10px] uppercase tracking-widest">
										Catatan
									</label>
									<input
										className="w-full rounded-xl border border-border bg-background p-3 text-sm font-medium outline-none transition-all focus:ring-2 focus:ring-primary/20"
										onChange={(e) => setNotes(e.target.value)}
										placeholder="Contoh: Tanpa Es"
										type="text"
										value={notes}
									/>
								</div>
							</div>
						</div>

						{/* --- SECTION: BILLING --- */}
						<div className="space-y-4 pt-4 border-t border-dashed border-border/50">
							<div className="flex items-center gap-2 mb-2">
								<Calculator className="h-4 w-4 text-primary" />
								<h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Ringkasan Pembayaran</h3>
							</div>

							<div className="space-y-3 rounded-xl border border-border bg-muted/50 p-6 shadow-inner">
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
									<span className="font-bold text-3xl text-primary tracking-tight">
										{new Intl.NumberFormat("id-ID", {
											style: "currency",
											currency: "IDR",
											maximumFractionDigits: 0,
										}).format(finalTotal)}
									</span>
								</div>
							</div>
						</div>

						{/* --- SECTION: PAYMENT METHODS --- */}
						<div className="space-y-4 pt-4 border-t border-dashed border-border/50">
							<div className="flex items-center gap-2 mb-2">
								<Wallet className="h-4 w-4 text-primary" />
								<h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Metode Pembayaran</h3>
							</div>

							<div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
											className={`flex flex-col items-center justify-center gap-3 rounded-xl border p-4 transition-all active:scale-95 ${
												isSelected
													? "border-primary bg-primary/10 text-primary shadow-sm"
													: "border-border bg-background text-muted-foreground hover:bg-muted/50 hover:text-foreground"
											}`}
										>
											<Icon className={`h-6 w-6 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
											<span className="text-[9px] font-bold uppercase tracking-wider text-center leading-tight">
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
								initial={{ opacity: 0, y: 10 }}
								animate={{ opacity: 1, y: 0 }}
								className="space-y-4 pt-4 border-t border-dashed border-border/50 bg-primary/5 -mx-8 px-8 py-6"
							>
								<div className="flex items-center justify-between">
									<div className="flex items-center gap-2">
										<Zap className="h-4 w-4 text-primary" />
										<h3 className="text-xs font-bold uppercase tracking-widest text-primary">Kalkulator Tunai</h3>
									</div>
									{changeAmount > 0 && (
										<div className="flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1 text-green-700">
											<span className="text-[10px] font-bold uppercase">Kembalian:</span>
											<span className="text-sm font-bold">
												{new Intl.NumberFormat("id-ID").format(changeAmount)}
											</span>
										</div>
									)}
								</div>

								<div className="grid grid-cols-2 gap-4">
									<div className="space-y-2">
										<label className="block font-medium text-primary/70 text-[10px] uppercase tracking-widest">
											Uang Diterima
										</label>
										<div className="relative">
											<span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-muted-foreground text-sm">Rp</span>
											<input
												className="w-full rounded-xl border-2 border-primary/20 bg-background py-3 pl-10 pr-4 text-lg font-bold text-primary outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/10"
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
									<div className="flex flex-col gap-2">
										<label className="block font-medium text-primary/70 text-[10px] uppercase tracking-widest">
											Nominal Cepat
										</label>
										<div className="grid grid-cols-2 gap-2">
											{[50000, 100000].map(amount => (
												<button
													key={amount}
													type="button"
													onClick={() => handleQuickCash(amount)}
													className="rounded-lg border border-primary/20 bg-white py-2 text-[10px] font-bold text-primary transition-all hover:bg-primary hover:text-white active:scale-95 shadow-sm"
												>
													{amount / 1000}K
												</button>
											))}
											<button
												type="button"
												onClick={() => handleQuickCash(finalTotal)}
												className="col-span-2 rounded-lg border border-primary bg-primary/10 py-2 text-[10px] font-bold text-primary transition-all hover:bg-primary hover:text-white active:scale-95 shadow-sm"
											>
												UANG PAS
											</button>
										</div>
									</div>
								</div>
							</motion.div>
						)}

						{/* Voucher & Auto Complete */}
						<div className="space-y-4 pt-4 border-t border-dashed border-border/50">
							{/* Discount Dropdown */}
							{validDiscounts.length > 0 && (
								<div className="relative">
									<label
										className="mb-2 block font-medium text-muted-foreground text-[10px] uppercase tracking-wide"
										htmlFor="discount-select"
									>
										Pilih Voucher / Diskon Menu
									</label>
									<select
										className="w-full appearance-none rounded-xl border border-border bg-background py-3 pr-12 pl-4 font-medium text-foreground text-sm outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
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

							{/* Auto Complete Toggle */}
							<div className="flex items-center justify-between p-4 rounded-xl bg-primary/5 border border-primary/10">
								<div className="space-y-0.5">
									<div className="flex items-center gap-1.5">
										<span className="block font-bold text-primary text-[10px] uppercase tracking-widest">Otomatis Lunas</span>
										<div className="h-1 w-1 rounded-full bg-primary/30" />
										<span className="text-[9px] text-muted-foreground italic">Instant Settlement</span>
									</div>
									<p className="text-[10px] text-muted-foreground leading-tight">Potong stok & catat keuangan langsung</p>
								</div>
								<button
									className={`relative h-6 w-11 rounded-full transition-all duration-300 ${autoComplete ? "bg-primary" : "bg-muted-foreground/20"}`}
									onClick={() => setAutoComplete(!autoComplete)}
									type="button"
								>
									<div className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-all duration-300 ${autoComplete ? "right-1" : "left-1"}`} />
								</button>
							</div>
						</div>
					</div>

					{/* Fixed Footer Actions */}
					<div className="border-t border-border bg-muted/30 p-6 flex gap-4">
						<button
							className="flex-1 rounded-xl bg-white border border-border py-4 font-bold text-muted-foreground text-xs uppercase tracking-widest transition-all hover:bg-muted active:scale-[0.98] shadow-sm"
							disabled={isSubmitting}
							onClick={onClose}
							type="button"
						>
							Batal
						</button>
						<button
							aria-label="Konfirmasi pembayaran"
							className="flex-[2] rounded-xl bg-primary py-4 font-bold text-primary-foreground text-sm uppercase tracking-widest shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
							disabled={isSubmitting}
							onClick={() =>
								onConfirm(
									finalTotal,
									selectedDiscountId || undefined,
									selectedPaymentMethod,
									{
										tableNumber,
										orderType,
										notes,
										autoComplete
									}
								)
							}
							type="button"
						>
							{isSubmitting ? (
								<>
									<ShimmerSkeleton className="h-4 w-4" shape="circle" />
									<span>MEMPROSES...</span>
								</>
							) : (
								<>
									<span>BAYAR SEKARANG</span>
									<ChevronRight className="h-4 w-4" />
								</>
							)}
						</button>
					</div>
				</motion.div>
			</div>
		</AnimatePresence>
	);
}
