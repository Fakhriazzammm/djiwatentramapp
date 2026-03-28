import { useCart } from "@/context/cart-context";
import { 
	User, 
	Table, 
	ShoppingBag, 
	Trash2, 
	Minus, 
	Plus, 
	CreditCard,
	ChevronRight,
	ChevronLeft,
	Info,
	Store,
	Wallet,
	QrCode,
	Banknote,
	Calculator,
	Zap,
	Tag,
	Coffee,
	X
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState, useMemo, useEffect } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { ShimmerSkeleton } from "@/components/ui/loading-state";
import { useQuery } from "convex/react";
import { api } from "@yumipos/backend/convex/_generated/api";
import { isDiscountApplicable } from "@/lib/utils/pricing";
import type { Doc } from "@yumipos/backend/convex/_generated/dataModel";

export function CheckoutSidebar({ 
	onConfirmPayment,
	isSubmitting = false,
	onClose,
	initialStep = "customer"
}: { 
	onConfirmPayment?: (
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
	) => void;
	isSubmitting?: boolean;
	onClose?: () => void;
	initialStep?: "customer" | "menu" | "payment";
}) {
	const {
		items,
		updateQuantity,
		totalAmount,
		totalItems,
		customerInfo,
		updateCustomerInfo,
		discountAmount,
		finalTotal,
		taxAmount,
		serviceChargeAmount,
		appliedVoucher,
		applyVoucher,
		clearCart
	} = useCart();

	const siteSettings = useQuery(api.site_settings.getSettings);
	const allActiveDiscounts = useQuery(api.discounts.getActiveDiscounts);

	const [activeStep, setActiveStep] = useState<"customer" | "menu" | "payment">(initialStep);
	
	// Payment State
	const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>("tunai");
	const [cashReceived, setCashReceived] = useState<number | "">("");
	const [changeAmount, setChangeAmount] = useState(0);
	const [autoComplete, setAutoComplete] = useState(false);
	const [selectedDiscountId, setSelectedDiscountId] = useState<string | null>(appliedVoucher?._id || null);

	const fmt = (n: number) =>
		new Intl.NumberFormat("id-ID", {
			style: "currency",
			currency: "IDR",
			maximumFractionDigits: 0,
		}).format(n);

	// Reset to step 1 when cart is cleared (after successful payment)
	useEffect(() => {
		if (items.length === 0 && activeStep !== "customer") {
			setActiveStep("customer");
		}
	}, [items.length, activeStep]);

	// Calculate Change
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

	// Payment Options
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

		if (options.length === 0) {
			options.push({ id: "tunai", label: "TUNAI (CASH)" });
		}

		return options;
	}, [siteSettings]);

	// Filter discounts
	const validDiscounts = useMemo(() => {
		if (!allActiveDiscounts) return [];

		const now = new Date();
		const context = {
			currentTimestamp: now.getTime(),
			currentDay: now.getDay(),
			currentTimeVal: now.getHours() * 60 + now.getMinutes(),
		};

		return allActiveDiscounts.filter((discount: Doc<"discounts">) => {
			if (discount.targetType === "ALL") {
				return isDiscountApplicable(discount, { _id: "", price: 0, categoryId: "" }, context);
			}
			return items.some((item) =>
				isDiscountApplicable(discount, { _id: item.productId, price: item.price, categoryId: item.category || "" }, context)
			);
		});
	}, [allActiveDiscounts, items]);

	const handleConfirmPayment = () => {
		if (onConfirmPayment) {
			onConfirmPayment(
				finalTotal,
				selectedDiscountId || undefined,
				selectedPaymentMethod,
				{
					tableNumber: customerInfo.tableNumber,
					orderType: customerInfo.orderType,
					autoComplete,
					cashReceived: typeof cashReceived === "number" ? cashReceived : 0,
					changeAmount: changeAmount
				}
			);
		}
	};

	return (
		<div className="flex h-full flex-col border-l border-border bg-[#f8f9fa] dark:bg-background shadow-sm relative">
			{/* Progress Header */}
			<div className="flex items-center justify-between border-b border-border bg-muted/30 px-4 py-3">
				<div className="flex items-center gap-1.5 flex-1">
					<div className="flex items-center gap-2">
						<div className={cn(
							"flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold",
							activeStep === "customer" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
						)}>1</div>
						<span className={cn("text-xs font-medium", activeStep === "customer" ? "text-foreground" : "text-muted-foreground")}>Info</span>
					</div>
					<ChevronRight className="h-3 w-3 text-muted-foreground mx-1" />
					<div className="flex items-center gap-2">
						<div className={cn(
							"flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold",
							activeStep === "menu" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
						)}>2</div>
						<span className={cn("text-xs font-medium", activeStep === "menu" ? "text-foreground" : "text-muted-foreground")}>Menu</span>
					</div>
					<ChevronRight className="h-3 w-3 text-muted-foreground mx-1" />
					<div className="flex items-center gap-2">
						<div className={cn(
							"flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold",
							activeStep === "payment" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
						)}>3</div>
						<span className={cn("text-xs font-medium", activeStep === "payment" ? "text-foreground" : "text-muted-foreground")}>Bayar</span>
					</div>
				</div>
				{onClose && (
					<Button 
						variant="ghost" 
						size="sm" 
						className="h-8 w-8 p-0 rounded-full shrink-0 ml-2" 
						onClick={onClose}
						aria-label="Tutup"
					>
						<X className="h-4 w-4" />
					</Button>
				)}
			</div>

			<ScrollArea className="flex-1">
				<div className="p-4 space-y-6">
					{/* Section 1: Informasi Pelanggan */}
					{activeStep === "customer" && (
						<div className="space-y-4 fade-in animate-in slide-in-from-right-4 duration-300">
							<div className="flex items-center gap-2">
								<User className="h-4 w-4 text-primary" />
								<h3 className="text-sm font-bold uppercase tracking-wider">Informasi Pelanggan</h3>
							</div>
							
							<div className="grid gap-3">
								<div className="space-y-1.5">
									<Label htmlFor="customer-name" className="text-[10px] uppercase text-muted-foreground font-bold">Nama Pelanggan</Label>
									<Input 
										id="customer-name"
										placeholder="Nama..."
										value={customerInfo.name}
										onChange={(e) => updateCustomerInfo({ name: e.target.value })}
										className="h-9 text-sm"
									/>
								</div>

								<div className="grid grid-cols-2 gap-3">
									<div className="space-y-1.5">
										<Label className="text-[10px] uppercase text-muted-foreground font-bold">Tipe Order</Label>
										<div className="flex gap-1 rounded-lg border border-input p-1 bg-background">
											<button 
												onClick={() => updateCustomerInfo({ orderType: "dine_in" })}
												className={cn(
													"flex-1 rounded-md py-1 text-[10px] font-bold transition-all",
													customerInfo.orderType === "dine_in" ? "bg-primary text-primary-foreground shadow-sm" : "hover:bg-muted text-muted-foreground"
												)}
											>Dine In</button>
											<button 
												onClick={() => updateCustomerInfo({ orderType: "takeaway" })}
												className={cn(
													"flex-1 rounded-md py-1 text-[10px] font-bold transition-all",
													customerInfo.orderType === "takeaway" ? "bg-primary text-primary-foreground shadow-sm" : "hover:bg-muted text-muted-foreground"
												)}
											>Takeaway</button>
										</div>
									</div>
									{customerInfo.orderType === "dine_in" && (
										<div className="space-y-1.5">
											<Label htmlFor="table-number" className="text-[10px] uppercase text-muted-foreground font-bold">No. Meja</Label>
											<Input 
												id="table-number"
												placeholder="01"
												value={customerInfo.tableNumber}
												onChange={(e) => updateCustomerInfo({ tableNumber: e.target.value })}
												className="h-9 text-sm"
											/>
										</div>
									)}
								</div>

								{/* Free Refill Toggle */}
								<div className="mt-2 flex items-center justify-between p-3 rounded-xl bg-primary/5 border border-primary/10">
									<div className="flex items-center gap-3">
										<div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
											<Coffee className="h-3.5 w-3.5" />
										</div>
										<div className="space-y-0.5">
											<div className="flex items-center gap-1.5">
												<span className="block font-black text-primary text-[10px] uppercase tracking-widest">Free Refill Minuman</span>
											</div>
											<p className="text-[8px] text-muted-foreground font-medium leading-none">Otomatis masuk ke keranjang</p>
										</div>
									</div>
									<button
										className={`relative h-5 w-9 rounded-full transition-all duration-300 ${customerInfo.isFreeRefill ? "bg-primary shadow-sm shadow-primary/20" : "bg-muted-foreground/20"}`}
										onClick={() => updateCustomerInfo({ isFreeRefill: !customerInfo.isFreeRefill })}
										type="button"
									>
										<div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all duration-300 ${customerInfo.isFreeRefill ? "right-0.5" : "left-0.5"}`} />
									</button>
								</div>
							</div>
							
							<div className="pt-4">
								<Button 
									onClick={() => setActiveStep("menu")}
									className="w-full h-11 text-xs font-bold shadow-md"
								>
									Lanjut Pilih Menu <ChevronRight className="ml-2 h-4 w-4" />
								</Button>
							</div>
						</div>
					)}

					{/* Section 2: Pilih Menu (Cart Items) */}
					{activeStep === "menu" && (
						<div className="space-y-4 fade-in animate-in slide-in-from-right-4 duration-300">
							<div className="flex items-center justify-between">
								<div className="flex items-center gap-2">
									<ShoppingBag className="h-4 w-4 text-primary" />
									<h3 className="text-sm font-bold uppercase tracking-wider">Pesanan ({totalItems})</h3>
								</div>
								<Button 
									variant="ghost" 
									size="sm" 
									className="h-7 px-2 text-[10px] text-muted-foreground font-bold"
									onClick={() => setActiveStep("customer")}
								>
									<ChevronLeft className="mr-1 h-3 w-3" /> Edit Info
								</Button>
							</div>

							{items.length === 0 ? (
								<div className="flex flex-col items-center justify-center py-8 text-center bg-muted/20 rounded-xl border border-dashed border-border">
									<ShoppingBag className="h-8 w-8 text-muted-foreground/30 mb-2" />
									<p className="text-[10px] font-medium text-muted-foreground">Belum ada menu terpilih</p>
								</div>
							) : (
								<div className="space-y-3">
									{items.map((item) => (
										<div key={`${item.productId}-${item.variant}`} className="group relative flex gap-3 rounded-lg border border-border bg-background p-2 transition-all hover:border-primary/50">
											<div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-md bg-muted">
												{item.image && <img src={item.image} alt={item.name} className="h-full w-full object-cover" />}
											</div>
											<div className="flex flex-1 flex-col justify-between min-w-0">
												<div className="flex justify-between items-start gap-1">
													<h4 className="line-clamp-1 text-[11px] font-bold text-foreground leading-tight">{item.name}</h4>
													<p className="text-[11px] font-bold shrink-0">{fmt(item.price * item.quantity)}</p>
												</div>
												{item.variant && <p className="text-[9px] text-muted-foreground font-medium uppercase tracking-tight truncate">{item.variant}</p>}
												
												<div className="mt-1.5 flex items-center justify-between">
													<div className="flex items-center gap-1.5 bg-muted rounded-md p-0.5">
														<button 
															onClick={() => updateQuantity(item.productId, item.variant, -1)}
															className="h-5 w-5 flex items-center justify-center rounded bg-background shadow-sm hover:bg-muted active:scale-90 transition-all"
														>
															{item.quantity === 1 ? <Trash2 className="h-2.5 w-2.5 text-destructive" /> : <Minus className="h-2.5 w-2.5" />}
														</button>
														<span className="min-w-[14px] text-center text-[10px] font-bold">{item.quantity}</span>
														<button 
															onClick={() => updateQuantity(item.productId, item.variant, 1)}
															className="h-5 w-5 flex items-center justify-center rounded bg-background shadow-sm hover:bg-muted active:scale-90 transition-all"
														>
															<Plus className="h-2.5 w-2.5" />
														</button>
													</div>
													<p className="text-[9px] text-muted-foreground font-medium">{fmt(item.price)}</p>
												</div>
											</div>
										</div>
									))}
								</div>
							)}

							{/* Struk Design */}
							<div className="mt-6 relative bg-background p-5 space-y-4 font-mono rounded-lg border border-border/50 shadow-sm">
								{/* Top wavy edge */}
								<div 
									className="absolute -top-1.5 left-0 right-0 h-3 w-full bg-repeat-x z-10" 
									style={{ 
										backgroundImage: "radial-gradient(circle at 6px 0px, transparent 0, transparent 4px, var(--background) 4px, var(--background) 6px)", 
										backgroundSize: "12px 12px" 
									}} 
								/>
								{/* Border overlay for top wavy edge */}
								<div 
									className="absolute -top-[7px] left-0 right-0 h-3 w-full bg-repeat-x pointer-events-none" 
									style={{ 
										backgroundImage: "radial-gradient(circle at 6px 0px, transparent 0, transparent 4px, var(--border) 4.5px, transparent 5.5px)", 
										backgroundSize: "12px 12px" 
									}} 
								/>
								
								<div className="space-y-2 text-xs">
									<div className="flex justify-between">
										<span className="text-muted-foreground">Subtotal</span>
										<span className="font-bold">{fmt(totalAmount)}</span>
									</div>
									{discountAmount > 0 && (
										<div className="flex justify-between text-primary">
											<span>Diskon</span>
											<span className="font-bold">-{fmt(discountAmount)}</span>
										</div>
									)}
									<div className="flex justify-between text-muted-foreground">
										<span>Pajak</span>
										<span>{fmt(taxAmount)}</span>
									</div>
									<div className="flex justify-between text-muted-foreground">
										<span>Service Charge</span>
										<span>{fmt(serviceChargeAmount)}</span>
									</div>
								</div>

								<Separator className="border-dashed" />

								<div className="flex justify-between items-center py-2 font-sans">
									<span className="text-sm font-black uppercase tracking-widest">TOTAL</span>
									<span className="text-xl font-black text-primary tracking-tighter">{fmt(finalTotal)}</span>
								</div>
								
								{/* Bottom wavy edge */}
								<div 
									className="absolute -bottom-1.5 left-0 right-0 h-3 w-full bg-repeat-x z-10" 
									style={{ 
										backgroundImage: "radial-gradient(circle at 6px 12px, transparent 0, transparent 4px, var(--background) 4px, var(--background) 6px)", 
										backgroundSize: "12px 12px" 
									}} 
								/>
								{/* Border overlay for bottom wavy edge */}
								<div 
									className="absolute -bottom-[7px] left-0 right-0 h-3 w-full bg-repeat-x pointer-events-none" 
									style={{ 
										backgroundImage: "radial-gradient(circle at 6px 12px, transparent 0, transparent 4px, var(--border) 4.5px, transparent 5.5px)", 
										backgroundSize: "12px 12px" 
									}} 
								/>
							</div>

							<div className="flex gap-2 pt-4">
								<Button 
									onClick={() => setActiveStep("customer")}
									className="w-[90px] shrink-0 h-12 text-sm font-bold bg-background text-foreground hover:bg-muted"
									variant="outline"
								>
									Kembali
								</Button>
								<Button 
									onClick={() => {
										if (onConfirmPayment) {
											onConfirmPayment(
												finalTotal,
												undefined,
												"cash",
												{
													tableNumber: customerInfo.tableNumber,
													orderType: customerInfo.orderType,
													autoComplete: false,
												}
											);
										}
									}}
									disabled={items.length === 0 || isSubmitting}
									className="flex-1 h-12 text-[11px] sm:text-xs font-bold bg-secondary text-secondary-foreground hover:bg-secondary/80 shadow-sm"
									variant="secondary"
								>
									{isSubmitting ? "Menyimpan..." : "Simpan Pesanan"}
								</Button>
								<Button 
									onClick={() => setActiveStep("payment")}
									disabled={items.length === 0}
									className="flex-1 h-12 text-[11px] sm:text-xs font-bold shadow-md"
								>
									Lanjut Bayar <ChevronRight className="ml-1 h-4 w-4" />
								</Button>
							</div>
						</div>
					)}

					{/* Section 3: Ringkasan & Pembayaran */}
					{activeStep === "payment" && (
						<div className="space-y-4 fade-in animate-in slide-in-from-right-4 duration-300 pb-20">
							<div className="flex items-center justify-between">
								<div className="flex items-center gap-2">
									<CreditCard className="h-4 w-4 text-primary" />
									<h3 className="text-sm font-bold uppercase tracking-wider">Pembayaran</h3>
								</div>
								<Button 
									variant="ghost" 
									size="sm" 
									className="h-7 px-2 text-[10px] text-muted-foreground font-bold"
									onClick={() => setActiveStep("menu")}
								>
									<ChevronLeft className="mr-1 h-3 w-3" /> Edit Menu
								</Button>
							</div>

							{/* Total Box */}
							<div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-center">
								<p className="text-[10px] font-bold uppercase tracking-widest text-primary/60 mb-0.5">Total Tagihan</p>
								<p className="text-2xl font-black text-primary tracking-tighter">{fmt(finalTotal)}</p>
							</div>

							{/* Metode Pembayaran */}
							<div className="space-y-2">
								<h3 className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Pilih Metode</h3>
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
												className={`flex items-center gap-2 rounded-xl border px-2 py-2 transition-all active:scale-95 ${
													isSelected
														? "border-primary bg-primary/10 text-primary shadow-sm"
														: "border-border bg-background text-muted-foreground hover:bg-muted/50 hover:text-foreground"
												}`}
											>
												<div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md ${isSelected ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'}`}>
													<Icon className="h-3 w-3" />
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
								<div className="space-y-2 rounded-xl bg-muted/30 border border-border p-3">
									<div className="flex items-center gap-2 mb-1">
										<Calculator className="h-3.5 w-3.5 text-primary" />
										<h3 className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Kalkulator Tunai</h3>
									</div>
									<div className="space-y-2">
										<div className="space-y-1">
											<label className="block font-bold text-muted-foreground text-[8px] uppercase tracking-widest ml-1">
												Uang Diterima (Rp)
											</label>
											<div className="relative">
												<span className="absolute left-2.5 top-1/2 -translate-y-1/2 font-bold text-muted-foreground text-xs">
													Rp
												</span>
												<input
													className="w-full rounded-lg border-2 border-border bg-background py-1.5 pl-7 pr-2 text-xs font-black text-foreground outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/5"
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
										<div className="grid grid-cols-3 gap-1.5">
											{[50000, 100000].map(amount => (
												<button
													key={amount}
													type="button"
													onClick={() => handleQuickCash(amount)}
													className="rounded-lg border border-border bg-background py-1.5 text-[9px] font-bold transition-all hover:border-primary hover:text-primary active:scale-95 shadow-sm"
												>
													{amount / 1000}K
												</button>
											))}
											<button
												type="button"
												onClick={() => handleQuickCash(finalTotal)}
												className="rounded-lg border border-primary bg-primary/10 py-1.5 text-[9px] font-bold text-primary transition-all hover:bg-primary/20 active:scale-95 shadow-sm"
											>
												PAS
											</button>
										</div>
									</div>

									{cashReceived !== "" && (
										<div className="mt-2 flex items-center justify-between border-t border-dashed border-border pt-2 text-emerald-600">
											<span className="font-bold text-[9px] uppercase tracking-widest">Kembalian</span>
											<span className="font-black text-base tracking-tighter">
												{fmt(changeAmount)}
											</span>
										</div>
									)}
								</div>
							)}

							{/* Voucher & Auto Complete */}
							<div className="space-y-2">
								{/* Discount Dropdown */}
								{validDiscounts.length > 0 && (
									<div className="relative">
										<label
											className="mb-1 block font-bold text-muted-foreground text-[8px] uppercase tracking-widest ml-1"
											htmlFor="discount-select"
										>
											Voucher / Diskon
										</label>
										<select
											className="w-full appearance-none rounded-lg border border-border bg-background py-1.5 pr-8 pl-2.5 font-bold text-foreground text-[9px] outline-none transition-all focus:border-primary/50 focus:ring-4 focus:ring-primary/5"
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
										<Tag className="pointer-events-none absolute bottom-2 right-2.5 h-3 w-3 text-muted-foreground/40" />
									</div>
								)}

								{/* Auto Complete Toggle */}
								<div className="flex items-center justify-between p-2 rounded-lg border border-border bg-background">
									<div className="flex items-center gap-2">
										<div className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/10 text-primary">
											<Zap className="h-3 w-3" />
										</div>
										<div className="space-y-0">
											<div className="flex items-center gap-1">
												<span className="block font-bold text-foreground text-[9px] uppercase tracking-widest">Otomatis Selesai</span>
											</div>
											<p className="text-[7px] text-muted-foreground font-medium leading-none mt-0.5">Status order langsung selesai</p>
										</div>
									</div>
									<button
										className={`relative h-4 w-8 rounded-full transition-all duration-300 ${autoComplete ? "bg-primary shadow-sm shadow-primary/20" : "bg-muted-foreground/20"}`}
										onClick={() => setAutoComplete(!autoComplete)}
										type="button"
									>
										<div className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-all duration-300 ${autoComplete ? "right-0.5" : "left-0.5"}`} />
									</button>
								</div>
							</div>
						</div>
					)}
				</div>
			</ScrollArea>

			{/* Fixed Footer Payment Button */}
			{activeStep === "payment" && (
				<div className="p-3 border-t border-border bg-card shadow-[0_-4px_12px_rgba(0,0,0,0.05)] absolute bottom-0 left-0 right-0 z-10">
					<Button 
						onClick={handleConfirmPayment}
						disabled={items.length === 0 || isSubmitting || (selectedPaymentMethod === "tunai" && typeof cashReceived === "number" && cashReceived < finalTotal)}
						className="w-full h-10 text-xs font-black uppercase tracking-widest shadow-lg active:scale-[0.98] transition-all"
						size="lg"
					>
						{isSubmitting ? (
							<ShimmerSkeleton className="h-4 w-20 bg-white/20" />
						) : (
							"Konfirmasi Bayar"
						)}
					</Button>
				</div>
			)}
		</div>
	);
}
