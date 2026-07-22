import { useCart } from "@/context/cart-context";
import { toast } from "sonner";
import {
	User,
	ShoppingBag,
	Trash2,
	Minus,
	Plus,
	CreditCard,
	ChevronRight,
	ChevronLeft,
	Wallet,
	QrCode,
	Banknote,
	Calculator,
	Zap,
	Tag,
	Coffee,
	ChefHat,
	Clock,
	ChevronDown,
	X,
	Printer,
	Search,
	Star,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState, useMemo, useEffect } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { ShimmerSkeleton } from "@/components/ui/loading-state";
import { isDiscountApplicable } from "@/lib/utils/pricing";
import {
	useHybridShiftStatus,
	useHybridCategories,
	useHybridStaffUsers,
	DEFAULT_ORDER_TYPES,
} from "@/hooks/use-hybrid-pos-data";
import { useAppData } from "@/context/app-data-context";
import type { Doc } from "@/types/backend-compat";
import { CustomerSearchModal } from "./customer-search-modal";

// ── Role → Production Track mapping ──
const ROLE_TRACK_MAP: Record<string, "bar" | "kitchen" | "both"> = {
	barista: "bar",
	bartender: "bar",
	bar: "bar",
	chef: "kitchen",
	koki: "kitchen",
	kitchen: "kitchen",
	cook: "kitchen",
};

function getStaffTrack(roleName: string | null | undefined): "bar" | "kitchen" | "both" | null {
	if (!roleName) return null;
	return ROLE_TRACK_MAP[roleName.toLowerCase().trim()] ?? null;
}

export function CheckoutSidebar({ 
	onConfirmPayment,
	isSubmitting = false,
	onClose,
	initialStep = "menu",
	lastOrderId,
	onPrintLastOrder,
	onPrintOpenBill,
	canPrintOpenBill = true,
}: { 
	onConfirmPayment?: (
		finalAmount: number,
		discountId?: string,
		paymentMethod?: string,
		orderData?: {
			tableNumber?: string;
			orderType?: string;
			notes?: string;
			autoComplete?: boolean;
			isOpenBill?: boolean;
			cashReceived?: number;
			changeAmount?: number;
			assignments?: { groupType: "barista" | "kitchen"; assignedTo: string; items: { productName: string; quantity: number; assignedTo: string }[] }[];
		}
	) => void;
	isSubmitting?: boolean;
	onClose?: () => void;
	initialStep?: "customer" | "menu" | "payment" | "assign";
	lastOrderId?: string | null;
	onPrintLastOrder?: () => void;
	onPrintOpenBill?: () => void;
	canPrintOpenBill?: boolean;
}) {
	const {
		items,
		updateQuantity,
		updateItemPrice,
		grossAmount,
		totalItems,
		customerInfo,
		updateCustomerInfo,
		promoDiscountAmount,
		voucherDiscountAmount,
		finalTotal,
		taxAmount,
		serviceChargeAmount,
		appliedVoucher,
		applyVoucher,
		clearCart,
		platformTotal,
		commissionAmount,
		netRevenue,
	} = useCart();

	const { siteSettings, activeDiscounts: allActiveDiscounts } = useAppData();
	const shiftStatus = useHybridShiftStatus();
	const isShiftOpen = shiftStatus?.isOpen ?? false;

		const [hasChosenOrderType, setHasChosenOrderType] = useState(false);
		const [customerSearchOpen, setCustomerSearchOpen] = useState(false);

	const orderTypes = useMemo(() => {
		const types = siteSettings?.orderTypes ?? DEFAULT_ORDER_TYPES;
		return types
			.filter((type: any) => type.isActive)
			.sort((a: any, b: any) => a.sortOrder - b.sortOrder);
	}, [siteSettings]);

	const selectedOrderType = useMemo(() => {
		return orderTypes.find((type: any) => type.id === customerInfo.orderType) || orderTypes[0];
	}, [orderTypes, customerInfo.orderType]);

	const platforms = useMemo(() => {
		const raw = siteSettings?.platforms ?? [];
		return raw.filter((p: any) => p.isActive).sort((a: any, b: any) => a.sortOrder - b.sortOrder);
	}, [siteSettings]);
	const selectedPlatform = useMemo(() => {
		return platforms.find((p: any) => p.id === customerInfo.platform) || null;
	}, [platforms, customerInfo.platform]);
	const platformName = selectedPlatform?.name ?? "";

	const [activeStep, setActiveStep] = useState<"customer" | "menu" | "payment" | "assign">(
		initialStep || "menu"
	);
	
	// Payment State
	const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>("tunai");
	const [cashReceived, setCashReceived] = useState<number | "">("");
	const [changeAmount, setChangeAmount] = useState(0);
	const [autoComplete, setAutoComplete] = useState(false);
	const [selectedDiscountId, setSelectedDiscountId] = useState<string | null>(appliedVoucher?._id || null);

	// ── Assignment state for Step 4 ──
	interface GroupAssignment {
		groupType: "barista" | "kitchen";
		assignedTo: string;
		items: { productId: string; productName: string; variant?: string; quantity: number; assignedTo: string }[];
	}

	// Build group assignments from cart items + categories
	const categories = useHybridCategories();
	const [groupAssignments, setGroupAssignments] = useState<GroupAssignment[]>([]);

	// Compute on-duty staff from shift
	const onDutyStaff = useMemo(() => {
		const names = new Set<string>();
		const cashierName = shiftStatus?.ongoingShift?.cashierName || shiftStatus?.shiftInfo?.cashierName;
		if (cashierName) names.add(cashierName.trim());
		const teamRaw = shiftStatus?.ongoingShift?.teamMembers || "";
		teamRaw
			.split(/[,\n;|]/g)
			.map((name: string) => name.trim())
			.filter(Boolean)
			.forEach((name: string) => names.add(name));
		if (names.size === 0) names.add("Kasir");
		return Array.from(names);
	}, [shiftStatus?.ongoingShift?.cashierName, shiftStatus?.ongoingShift?.teamMembers, shiftStatus?.shiftInfo?.cashierName]);

	// Staff users data for role-based filtering
	const staffUsers = useHybridStaffUsers();
	const staffRoleMap = useMemo(() => {
		const map = new Map<string, string | null>();
		for (const u of staffUsers ?? []) {
			const key = u.name?.toLowerCase().trim();
			if (key) map.set(key, u.roleName || null);
		}
		return map;
	}, [staffUsers]);

	// Filter on-duty staff by role track for each production group
	const filteredStaffByGroup = useMemo(() => ({
		barista: onDutyStaff.filter(name => {
			const role = staffRoleMap.get(name.toLowerCase().trim());
			const track = getStaffTrack(role);
			return track === "bar" || track === "both";
		}),
		kitchen: onDutyStaff.filter(name => {
			const role = staffRoleMap.get(name.toLowerCase().trim());
			const track = getStaffTrack(role);
			return track === "kitchen" || track === "both";
		}),
	}), [onDutyStaff, staffRoleMap]);

	// Rebuild assignments when items or categories change
	useEffect(() => {
		if (!categories || items.length === 0) return;
		const catTrackMap = new Map<string, "bar" | "kitchen" | null>();
		for (const cat of categories as any[]) {
			catTrackMap.set(cat._id, cat.track ?? null);
		}
		const barItems: GroupAssignment["items"] = [];
		const kitchenItems: GroupAssignment["items"] = [];
		for (const item of items) {
			const track = item.category ? catTrackMap.get(item.category) : null;
			const entry = {
				productId: item.productId,
				productName: item.name,
				variant: item.variant,
				quantity: item.quantity,
				assignedTo: "" as string,
			};
			if (track === "kitchen") {
				kitchenItems.push(entry);
			} else {
				barItems.push(entry);
			}
		}
		const defaultStaff = onDutyStaff[0] || "Staff";
		const newAssignments: GroupAssignment[] = [];
		if (barItems.length > 0) {
			const defaultBarStaff = filteredStaffByGroup.barista[0] || defaultStaff;
			newAssignments.push({
				groupType: "barista",
				assignedTo: defaultBarStaff,
				items: barItems.map((i) => ({ ...i, assignedTo: defaultBarStaff })),
			});
		}
		if (kitchenItems.length > 0) {
			const defaultKitchenStaff = filteredStaffByGroup.kitchen[0] || defaultStaff;
			newAssignments.push({
				groupType: "kitchen",
				assignedTo: defaultKitchenStaff,
				items: kitchenItems.map((i) => ({ ...i, assignedTo: defaultKitchenStaff })),
			});
		}
		setGroupAssignments(newAssignments);
	}, [items, categories, onDutyStaff, filteredStaffByGroup]);

	const fmt = (n: number) =>
		new Intl.NumberFormat("id-ID", {
			style: "currency",
			currency: "IDR",
			maximumFractionDigits: 0,
		}).format(n);

	// Reset to step 1 (menu) when cart is cleared (after successful payment)
	useEffect(() => {
		if (items.length === 0 && !customerInfo.isSubmitted && activeStep !== "menu") {
			setActiveStep("menu");
		}
	}, [items.length, activeStep, customerInfo.isSubmitted]);

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

	const activeMarketingPromos = useMemo(() => {
		if (!allActiveDiscounts || items.length === 0 || promoDiscountAmount <= 0) {
			return [] as string[];
		}

		const now = new Date();
		const context = {
			currentTimestamp: now.getTime(),
			currentDay: now.getDay(),
			currentTimeVal: now.getHours() * 60 + now.getMinutes(),
		};

		const labels = allActiveDiscounts
			.filter((discount: Doc<"discounts">) => discount._id !== selectedDiscountId)
			.filter((discount: Doc<"discounts">) => {
				if (discount.targetType === "ALL") {
					return isDiscountApplicable(discount, { _id: "", price: 0, categoryId: "" }, context);
				}
				return items.some((item) =>
					isDiscountApplicable(discount, { _id: item.productId, price: item.price, categoryId: item.category || "" }, context)
				);
			})
			.map((discount: Doc<"discounts">) =>
				discount.isHappyHour ? `Happy Hour - ${discount.name}` : `Promo Marketing - ${discount.name}`
			);

		return [...new Set(labels)];
	}, [allActiveDiscounts, items, promoDiscountAmount, selectedDiscountId]);

	useEffect(() => {
		if (!allActiveDiscounts) return;

		if (!selectedDiscountId) {
			if (appliedVoucher) {
				applyVoucher(null);
			}
			return;
		}

		const selectedVoucher =
			allActiveDiscounts.find((discount: Doc<"discounts">) => discount._id === selectedDiscountId) || null;

		if (!selectedVoucher) {
			applyVoucher(null);
			return;
		}

		applyVoucher({
			_id: selectedVoucher._id,
			name: selectedVoucher.name,
			type: selectedVoucher.type,
			value: selectedVoucher.value,
			targetType: selectedVoucher.targetType,
			targetIds: (selectedVoucher as { targetIds?: string[] }).targetIds,
		});
	}, [selectedDiscountId, allActiveDiscounts, appliedVoucher, applyVoucher]);

	const handleConfirmPayment = () => {
		setActiveStep("assign");
	};

	const handleSubmitAssignment = () => {
		if (!onConfirmPayment) return;
		onConfirmPayment(
			finalTotal,
			selectedDiscountId || undefined,
			selectedPaymentMethod,
			{
				tableNumber: customerInfo.tableNumber,
				orderType: customerInfo.orderType,
				autoComplete,
				isOpenBill: false,
				cashReceived: typeof cashReceived === "number" ? cashReceived : 0,
				changeAmount: changeAmount,
				assignments: groupAssignments.map(ga => ({
					groupType: ga.groupType,
					assignedTo: ga.assignedTo,
					items: ga.items.map(item => ({
						productName: item.productName,
						quantity: item.quantity,
						assignedTo: item.assignedTo,
					})),
				})),
			}
		);
	};

	const handleSaveOrderQuick = () => {
		if (!isShiftOpen) {
			toast.error("Buka shift terlebih dahulu di Dashboard");
			return;
		}
		if (onConfirmPayment) {
			onConfirmPayment(
				finalTotal,
				undefined,
				"cash",
				{
					tableNumber: customerInfo.tableNumber,
					orderType: customerInfo.orderType,
					autoComplete: false,
					isOpenBill: true,
				}
			);
		}
	};

	return (
		<div className="relative flex h-full flex-col border-l border-border bg-[#f8f9fa] shadow-sm dark:bg-background">
			<div className="flex items-center justify-between border-b border-border bg-background px-3 py-2">
				<div className="flex flex-1 items-center gap-1.5 sm:gap-2 md:gap-2">
					<div className="flex items-center gap-1.5 sm:gap-2">
						<div className={cn(
							"flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-black transition-all md:h-7 md:w-7 md:text-[11px]",
							activeStep === "menu" ? "bg-primary text-primary-foreground shadow-md shadow-primary/20" : "bg-muted text-muted-foreground"
						)}>1</div>
						<span className={cn("text-[11px] font-black uppercase tracking-wide md:text-[12px]", activeStep === "menu" ? "text-foreground" : "text-muted-foreground")}>Menu</span>
					</div>
					<ChevronRight className="mx-0.5 h-3 w-3 text-muted-foreground/40 md:h-3.5 md:w-3.5" />
					<div className="flex items-center gap-1.5 sm:gap-2">
						<div className={cn(
							"flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-black transition-all md:h-7 md:w-7 md:text-[11px]",
							activeStep === "customer" ? "bg-primary text-primary-foreground shadow-md shadow-primary/20" : "bg-muted text-muted-foreground"
						)}>2</div>
						<span className={cn("text-[11px] font-black uppercase tracking-wide md:text-[12px]", activeStep === "customer" ? "text-foreground" : "text-muted-foreground")}>Info</span>
					</div>
					<ChevronRight className="mx-0.5 h-3 w-3 text-muted-foreground/40 md:h-3.5 md:w-3.5" />
					<div className="flex items-center gap-1.5 sm:gap-2">
						<div className={cn(
							"flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-black transition-all md:h-7 md:w-7 md:text-[11px]",
							activeStep === "payment" ? "bg-primary text-primary-foreground shadow-md shadow-primary/20" : "bg-muted text-muted-foreground"
						)}>3</div>
						<span className={cn("text-[11px] font-black uppercase tracking-wide md:text-[12px]", activeStep === "payment" ? "text-foreground" : "text-muted-foreground")}>Bayar</span>
					</div>
					<ChevronRight className="mx-0.5 h-3 w-3 text-muted-foreground/40 md:h-3.5 md:w-3.5" />
					<div className="flex items-center gap-1.5 sm:gap-2">
						<div className={cn(
							"flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-black transition-all md:h-7 md:w-7 md:text-[11px]",
							activeStep === "assign" ? "bg-primary text-primary-foreground shadow-md shadow-primary/20" : "bg-muted text-muted-foreground"
						)}>4</div>
						<span className={cn("text-[11px] font-black uppercase tracking-wide md:text-[12px]", activeStep === "assign" ? "text-foreground" : "text-muted-foreground")}>Assign</span>
					</div>
				</div>
				<div className="flex items-center gap-2 text-muted-foreground">
					{lastOrderId && onPrintLastOrder && (
						<Button
							variant="outline"
							size="sm"
							className="h-8 gap-1.5 rounded-xl border-primary/20 bg-primary/5 px-2.5 text-[10px] font-black uppercase tracking-wide text-primary hover:bg-primary/10 md:h-8 md:px-2.5 md:text-[10px]"
							onClick={onPrintLastOrder}
						>
							<Printer className="h-3.5 w-3.5" />
							Struk
						</Button>
					)}
					{onClose && (
						<Button 
							variant="ghost" 
							size="sm" 
							className="h-8 w-8 shrink-0 rounded-full p-0 md:h-8 md:w-8" 
							onClick={onClose}
							aria-label="Tutup"
						>
							<X className="h-4.5 w-4.5" />
						</Button>
					)}
				</div>
			</div>

			<ScrollArea className="flex-1 min-h-0">
				<div className={cn("space-y-3 p-3 md:space-y-3 md:p-3", activeStep === "payment" || activeStep === "assign" ? "pb-24" : "pb-20")}>
					{/* Section 1: Informasi Pelanggan */}
					{activeStep === "customer" && (
						<div className="fade-in animate-in space-y-3 duration-300 slide-in-from-right-4 md:space-y-3.5">
							<div className="flex items-center justify-between">
								<div className="flex items-center gap-2">
									<User className="h-4 w-4 text-primary" />
									<h3 className="text-xs font-bold uppercase tracking-wider">Informasi Pelanggan</h3>
								</div>
								<Button
									variant="ghost"
									size="sm"
									className="h-6 px-1.5 text-[10px] text-muted-foreground font-bold"
									onClick={() => setActiveStep("menu")}
								>
									<ChevronLeft className="mr-1 h-3 w-3" /> Kembali
								</Button>
							</div>

							<div className="rounded-xl border border-primary/10 bg-white px-2.5 py-2 shadow-sm md:px-3 md:py-2.5">
								<div className="flex items-center gap-2">
									<div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary md:h-9 md:w-9">
										<User className="h-4 w-4 md:h-4.5 md:w-4.5" />
									</div>
									<div className="min-w-0 flex-1">
										<h3 className="text-sm font-black uppercase tracking-wide text-foreground">
											Informasi Pelanggan
										</h3>
										<p className="mt-0.5 text-[12px] leading-snug text-muted-foreground md:text-[13px]">
											Isi data pelanggan sebelum lanjut ke pembayaran.
										</p>
									</div>
								</div>
							</div>

							<div className="grid gap-2.5 md:gap-3">
								<div className="space-y-1.5">
									<Label htmlFor="customer-name" className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground md:text-[11px]">Nama Pelanggan</Label>
									<div className="flex gap-1.5 items-start">
										<div className="relative flex-1">
											<Input
												id="customer-name"
												placeholder="Masukkan nama pelanggan"
												value={customerInfo.name}
												onChange={(e) => {
													updateCustomerInfo({ name: e.target.value });
												}}
												className="h-9 rounded-xl border-border/70 bg-white px-3 text-sm font-semibold placeholder:text-xs placeholder:font-medium md:h-11 md:rounded-[1.15rem] md:px-3.5 md:text-base md:placeholder:text-sm"
											/>
											{customerInfo.customer_source_id && (
												<span className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[8px] font-black text-amber-700 uppercase tracking-wider shadow-sm">
													<Star className="h-2.5 w-2.5 fill-amber-400" /> Member
												</span>
											)}
										</div>
										<Button
											variant="outline"
											size="icon"
											className="h-9 w-9 shrink-0 rounded-xl border-border/70 md:h-11 md:w-11"
											onClick={() => setCustomerSearchOpen(true)}
											type="button"
											title="Cari pelanggan terdaftar"
										>
											<Search className="h-4 w-4" />
										</Button>
									</div>
								</div>
								<div className={cn(
									"grid gap-2.5",
									selectedOrderType?.requiresTableNumber ? "grid-cols-2" : "grid-cols-1"
								)}>
									{selectedOrderType?.requiresTableNumber && (
										<div className="space-y-1.5">
											<Label htmlFor="table-number" className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground md:text-[11px]">No. Meja</Label>
											<Input
												id="table-number"
												placeholder="01"
												value={customerInfo.tableNumber}
												onChange={(e) => updateCustomerInfo({ tableNumber: e.target.value })}
												className="h-10 rounded-[1rem] border-border/70 bg-white px-3 text-sm font-black tracking-wide placeholder:text-xs placeholder:font-medium md:h-11 md:rounded-[1.15rem] md:px-3.5 md:text-base md:placeholder:text-sm"
											/>
										</div>
									)}
								</div>

								{/* Free Refill Toggle */}
								<div className="mt-0.5 flex items-center justify-between rounded-[1.2rem] border border-primary/15 bg-gradient-to-r from-primary/[0.06] via-sky-50/50 to-background p-2.5 shadow-sm md:rounded-[1.35rem] md:p-3">
									<div className="flex items-center gap-2.5 md:gap-3">
										<div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
											<Coffee className="h-4 w-4 md:h-4.5 md:w-4.5" />
										</div>
										<div className="min-w-0 flex-1">
											<span className="block text-xs font-black uppercase tracking-[0.14em] text-primary md:text-sm">
												Free Refill Minuman
											</span>
											<p className="text-[11px] font-medium leading-snug text-muted-foreground md:text-xs">
												Otomatis masuk ke keranjang jika aktif.
											</p>
										</div>
									</div>
									<button
										aria-label="Toggle free refill"
										className={cn(
											"relative h-5 w-9 shrink-0 rounded-full transition-all duration-300 md:h-7 md:w-12",
											customerInfo.isFreeRefill
												? "bg-primary shadow-md shadow-primary/20"
												: "bg-muted-foreground/20"
										)}
										onClick={() => updateCustomerInfo({ isFreeRefill: !customerInfo.isFreeRefill })}
										type="button"
									>
										<div className={cn(
											"absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all duration-300 md:h-6 md:w-6",
											customerInfo.isFreeRefill ? "right-0.5" : "left-0.5"
										)} />
									</button>
								</div>
							</div>

						</div>
					)}

					{/* Section 2: Pilih Menu (Cart Items) */}
				{activeStep === "menu" && (
					<div className="space-y-4 fade-in animate-in slide-in-from-right-4 duration-300">
						{/* Order Type + Platform — 1 baris center */}
						<div className="flex flex-col items-center gap-2">
							<div className="flex items-center justify-center gap-1 flex-wrap">
								{orderTypes.map((type: any) => (
									<button
										key={type.id}
										type="button"
										onClick={() => { updateCustomerInfo({ orderType: type.id, ...(type.id !== "online" ? { platform: undefined, platformCommission: undefined } : {}) }); setHasChosenOrderType(true); }}
										className={cn(
											"shrink-0 rounded-full px-3 py-1.5 text-[11px] font-black uppercase tracking-wide transition-all",
											customerInfo.orderType === type.id
												? "bg-primary text-primary-foreground shadow-sm scale-105"
												: "bg-muted/60 text-muted-foreground hover:bg-muted"
										)}
								>
									{type.label}
								</button>
							))}
							{selectedOrderType?.id === "online" && platforms.length > 0 && (
								<>
									<span className="mx-0.5 h-4 w-px shrink-0 bg-border" />
									{platforms.map((p: any) => (
										<button
											key={p.id}
											type="button"
											onClick={() => updateCustomerInfo({ platform: p.id, platformCommission: p.commissionRate })}
											className={cn(
												"shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide transition-all",
												customerInfo.platform === p.id
													? "bg-orange-500 text-white shadow-sm"
													: "bg-orange-50 text-orange-600 hover:bg-orange-100"
											)}
										>
											{p.name}
										</button>
									))}
								</>
							)}
							</div>
							{!hasChosenOrderType && (
								<span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-[10px] font-bold text-amber-700 animate-pulse shadow-sm">
									👆 Ketuk untuk pilih tipe pesanan
								</span>
							)}
						</div>
						<div className="flex items-center justify-between">
								<div className="flex items-center gap-2">
									<ShoppingBag className="h-4 w-4 text-primary" />
									<h3 className="text-xs font-bold uppercase tracking-wider">Pesanan ({totalItems})</h3>
								</div>
								<Button 
									variant="ghost" 
									size="sm" 
									className="h-6 px-1.5 text-[10px] text-muted-foreground font-bold"
									onClick={() => setActiveStep("customer")}
								>
									<ChevronRight className="mr-1 h-3 w-3" /> Isi Info
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
										<div key={`${item.productId}-${item.variant}`} className="group relative flex gap-3 rounded-lg border border-border bg-background p-1.5 transition-all hover:border-primary/50">
											<div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-md bg-muted">
												{item.image && <img src={item.image} alt={item.name} className="h-full w-full object-cover" />}
											</div>
											<div className="flex flex-1 flex-col justify-between min-w-0">
												<div className="flex justify-between items-start gap-1">
													<h4 className="line-clamp-1 text-[10px] font-bold text-foreground leading-tight">{item.name}</h4>
													{customerInfo.orderType === "online" ? (
														<input
															type="number"
															value={item.price}
															onChange={(e) => updateItemPrice(item.productId, item.variant, parseInt(e.target.value) || 0)}
															className="w-16 text-right text-[11px] font-bold bg-transparent border-b border-dashed border-orange-300 focus:outline-none focus:border-orange-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
														/>
													) : (
														<p className="text-[10px] font-bold shrink-0">{fmt(item.price * item.quantity)}</p>
													)}
												</div>
												{item.variant && <p className="text-[9px] text-muted-foreground font-medium uppercase tracking-tight truncate">{item.variant}</p>}
										{item.platformPrice && item.platformPrice !== item.originalPrice && (
											<p className="text-[9px] text-muted-foreground line-through">Menu: {fmt((item.originalPrice ?? item.price) * item.quantity)}</p>
										)}
										
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

							{/* Struk Compact */}
							<div className="mt-4 rounded-xl border border-border/70 bg-background p-2.5 shadow-sm">
								<div className="space-y-1 text-center">
									<p className="text-[9px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
										Ringkasan Struk
									</p>
									<p className="text-[11px] font-black uppercase tracking-wide text-foreground">
										Subtotal, Promo, Pajak, dan Total
									</p>
								</div>

								{(activeMarketingPromos.length > 0 || appliedVoucher) && (
									<div className="mt-3 rounded-lg bg-primary/5 px-3 py-2 text-center">
										{activeMarketingPromos.map((promo, index) => (
											<p key={`${index}-${String(promo)}`} className="text-[9px] font-bold uppercase tracking-wider text-primary">
												{String(promo)}
											</p>
										))}
										{appliedVoucher && (
											<p className="text-[9px] font-bold uppercase tracking-wider text-primary">
												Voucher - {appliedVoucher.name}
											</p>
										)}
									</div>
								)}

								<div className="mt-3 space-y-1.5 text-[11px] sm:text-xs">
									<div className="flex items-center justify-between">
										<span className="text-muted-foreground">Subtotal</span>
										<span className="font-bold">{fmt(grossAmount)}</span>
									</div>
									{promoDiscountAmount > 0 && (
										<div className="flex items-center justify-between text-primary">
											<span>Promo / Marketing</span>
											<span className="font-bold">-{fmt(promoDiscountAmount)}</span>
										</div>
									)}
									{voucherDiscountAmount > 0 && (
										<div className="flex items-center justify-between text-primary">
											<span>Diskon Voucher</span>
											<span className="font-bold">-{fmt(voucherDiscountAmount)}</span>
										</div>
									)}
									<div className="flex items-center justify-between text-muted-foreground">
										<span>Pajak</span>
										<span>{fmt(taxAmount)}</span>
									</div>
									<div className="flex items-center justify-between text-muted-foreground">
										<span>Service Charge</span>
										<span>{fmt(serviceChargeAmount)}</span>
									</div>
								</div>

								<Separator className="my-2 border-dashed" />

								<div className="flex items-center justify-between font-sans">
									<span className="text-xs sm:text-sm font-black uppercase tracking-widest">Total</span>
									<span className="text-base font-black text-primary tracking-tight">{fmt(finalTotal)}</span>
								</div>
							</div>

						</div>
					)}

					{/* Section 3: Ringkasan & Pembayaran */}
					{activeStep === "payment" && (
						<div className="space-y-4 fade-in animate-in slide-in-from-right-4 duration-300">
							<div className="flex items-center justify-between">
								<div className="flex items-center gap-2">
									<CreditCard className="h-4 w-4 text-primary" />
									<h3 className="text-xs font-bold uppercase tracking-wider">Pembayaran</h3>
								</div>
								<Button 
									variant="ghost" 
									size="sm" 
									className="h-6 px-1.5 text-[10px] text-muted-foreground font-bold"
									onClick={() => setActiveStep("customer")}
								>
									<ChevronLeft className="mr-1 h-3 w-3" /> Edit Info
								</Button>
							</div>

							{/* Total Box */}
							{customerInfo.orderType === "online" && selectedPlatform && (
								<div className="rounded-xl border border-orange-200 bg-orange-50/70 p-2.5 space-y-1 mb-2">
									<p className="text-[9px] font-bold uppercase tracking-widest text-orange-600 mb-1">Ringkasan {platformName}</p>
									<div className="flex justify-between text-xs"><span>Total {platformName}</span><span className="font-bold">{fmt(platformTotal)}</span></div>
									<div className="flex justify-between text-xs text-muted-foreground"><span>Komisi ({(selectedPlatform.commissionRate * 100).toFixed(0)}%)</span><span className="text-red-500">-{fmt(commissionAmount)}</span></div>
									<Separator />
									<div className="flex justify-between text-sm font-black text-green-700"><span>Pendapatan Bersih</span><span>{fmt(netRevenue)}</span></div>
								</div>
							)}
							<div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-center">
								<p className="text-[10px] font-bold uppercase tracking-widest text-primary/60 mb-0.5">Total Tagihan</p>
								<p className="text-xl font-black text-primary tracking-tighter">{fmt(finalTotal)}</p>
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
												className={`flex items-center gap-2 rounded-xl border px-2 py-1.5 transition-all active:scale-95 ${
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
								<div className="space-y-2 rounded-xl bg-muted/30 border border-border p-2.5">
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
											className="w-full appearance-none rounded-lg border border-border bg-background py-1 pr-7 pl-2 font-bold text-foreground text-[9px] outline-none transition-all focus:border-primary/50 focus:ring-4 focus:ring-primary/5"
											id="discount-select"
											onChange={(e) => setSelectedDiscountId(e.target.value)}
											value={selectedDiscountId || ""}
										>
											<option value="">TANPA VOUCHER</option>
											{validDiscounts.map((d: Doc<"discounts">) => (
												<option key={String(d._id)} value={String(d._id)}>
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
								<div className="flex items-center justify-between p-1.5 rounded-lg border border-border bg-background">
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

					{/* Section 4: Assign Produksi */}
					{activeStep === "assign" && (
						<div className="space-y-3 fade-in animate-in slide-in-from-right-4 duration-300">
							<div className="flex items-center justify-between">
								<div className="flex items-center gap-2">
									<User className="h-4 w-4 text-primary" />
									<h3 className="text-xs font-bold uppercase tracking-wider">Assign Produksi</h3>
								</div>
								<Button
									variant="ghost"
									size="sm"
									className="h-6 px-1.5 text-[10px] text-muted-foreground font-bold"
									onClick={() => setActiveStep("payment")}
								>
									<ChevronLeft className="mr-1 h-3 w-3" /> Kembali
								</Button>
							</div>

							{groupAssignments.map((group) => (
								<div key={group.groupType} className="rounded-xl border border-border/60 bg-white p-2.5 space-y-2 shadow-sm">
									<div className="flex items-center justify-between">
										<div className="flex items-center gap-1.5">
											{group.groupType === "barista" ? <Coffee className="h-3.5 w-3.5 text-amber-600" /> : <ChefHat className="h-3.5 w-3.5 text-orange-600" />}
											<span className="text-[10px] font-black uppercase tracking-wider">
												{group.groupType === "barista" ? "Barista" : "Kitchen"} ({group.items.length} item)
											</span>
										</div>
										<select
											value={group.assignedTo}
											onChange={(e) => {
												const newVal = e.target.value;
												setGroupAssignments(prev => prev.map(g =>
													g.groupType === group.groupType
														? { ...g, assignedTo: newVal, items: g.items.map(item => ({ ...item, assignedTo: newVal })) }
														: g
												));
											}}
											className="rounded-lg border border-border/60 px-2 py-1 text-[10px] font-bold bg-background"
										>
											{filteredStaffByGroup[group.groupType].length > 0 ? (
												filteredStaffByGroup[group.groupType].map(name => (
													<option key={name} value={name}>{name}</option>
												))
											) : (
												<option value="" disabled>Tidak ada staff</option>
											)}
										</select>
									</div>

									<div className="space-y-1">
										{group.items.map((item, idx) => (
											<div key={idx} className="flex items-center justify-between text-[11px] py-0.5">
												<div className="flex-1 min-w-0 flex items-center gap-1">
													<span className="truncate">{item.productName}</span>
													{item.variant && <span className="text-[9px] text-muted-foreground/60 truncate">({item.variant})</span>}
													<span className="text-muted-foreground shrink-0">x{item.quantity}</span>
												</div>
												<select
													value={item.assignedTo}
													onChange={(e) => {
														const newStaff = e.target.value;
														setGroupAssignments(prev => prev.map(g =>
															g.groupType === group.groupType
																? { ...g, items: g.items.map((it, i) => i === idx ? { ...it, assignedTo: newStaff } : it) }
																: g
														));
													}}
													className="rounded border border-border/40 px-1.5 py-0.5 text-[9px] font-medium bg-background"
												>
													{filteredStaffByGroup[group.groupType].length > 0 ? (
														filteredStaffByGroup[group.groupType].map(name => (
															<option key={name} value={name}>{name}</option>
														))
													) : (
														<option value="" disabled>Tidak ada staff</option>
													)}
												</select>
											</div>
										))}
									</div>
								</div>
							))}
						</div>
					)}
				</div>
			</ScrollArea>

			<div className="border-t border-border bg-card p-2.5 shadow-[0_-4px_12px_rgba(0,0,0,0.05)]">
				{activeStep === "customer" && (
					<div className="grid gap-2">
						<Button
							onClick={() => setActiveStep("menu")}
							className="h-10 w-full text-xs font-bold bg-background text-foreground hover:bg-muted"
							variant="outline"
						>
							<ChevronLeft className="mr-2 h-4 w-4" /> Kembali
						</Button>
						<Button
							onClick={() => {
								updateCustomerInfo({ isSubmitted: true });
								if (!isShiftOpen) {
									toast.error("Buka shift terlebih dahulu di Dashboard");
									return;
								}
								setActiveStep("payment");
							}}
							disabled={items.length === 0 || !isShiftOpen}
							className="h-10 w-full text-xs font-bold shadow-md"
						>
							Lanjut Bayar <ChevronRight className="ml-2 h-4 w-4" />
						</Button>
					</div>
				)}

				{activeStep === "menu" && (
					<div className="grid gap-2">
						<div className="flex gap-2">
							{canPrintOpenBill && onPrintOpenBill && (
								<Button
									onClick={onPrintOpenBill}
									disabled={items.length === 0}
									className="h-10 w-10 shrink-0 px-0"
									title="Cetak Open Bill"
									variant="outline"
								>
									<Printer className="h-4 w-4" />
								</Button>
							)}
							<Button
								onClick={() => setActiveStep("customer")}
								className="h-11 flex-1 text-xs font-bold bg-background text-foreground hover:bg-muted"
								variant="outline"
							>
								Kembali
							</Button>
						</div>
						<div className="grid grid-cols-2 gap-2">
							<Button
								onClick={handleSaveOrderQuick}
								disabled={items.length === 0 || isSubmitting || !isShiftOpen}
								className="h-11 min-w-0 px-3 text-[11px] sm:text-xs font-bold bg-secondary text-secondary-foreground hover:bg-secondary/80 shadow-sm"
								variant="secondary"
							>
								<span className="truncate">
									{isSubmitting ? "Menyimpan..." : "Simpan Pesanan"}
								</span>
							</Button>
							<Button
								onClick={() => {
									setActiveStep("customer");
								}}
								disabled={items.length === 0}
								className="h-11 min-w-0 px-3 text-[11px] sm:text-xs font-bold shadow-md"
							>
								<span className="truncate">Lanjut Info</span>
								<ChevronRight className="ml-1 h-4 w-4 shrink-0" />
							</Button>
						</div>
					</div>
				)}

				{activeStep === "payment" && (
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
				)}

				{activeStep === "assign" && (
					<Button
						onClick={handleSubmitAssignment}
						disabled={items.length === 0 || isSubmitting}
						className="w-full h-10 text-xs font-black uppercase tracking-widest shadow-lg active:scale-[0.98] transition-all"
						size="lg"
					>
						{isSubmitting ? (
							<ShimmerSkeleton className="h-4 w-20 bg-white/20" />
						) : (
							"Kirim ke Produksi"
						)}
					</Button>
				)}
			</div>

			<CustomerSearchModal
				open={customerSearchOpen}
				onOpenChange={setCustomerSearchOpen}
				onSelect={(customer) => {
					updateCustomerInfo({ name: customer.name, customer_source_id: customer.source_id });
				}}
			/>
		</div>
	);
}
