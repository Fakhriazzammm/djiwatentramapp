import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Minus, Plus, Search } from "lucide-react";
import { useCart } from "@/context/cart-context";
import { useAppData } from "@/context/app-data-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	useHybridShiftStatus,
	useHybridCategories,
	useHybridStaffUsers,
	DEFAULT_ORDER_TYPES,
} from "@/hooks/use-hybrid-pos-data";
import { calculateOrderTax } from "@yumipos/web-shared/lib/tax-calculator";
import { isDiscountApplicable } from "@/lib/utils/pricing";
import { cn } from "@/lib/utils";
import {
	canPrintCheckoutResult,
	createCheckoutDraft,
	isCheckoutResult,
	reconcileAssignments,
	validateCheckout,
	type ConfirmCheckoutPayment,
	type CheckoutSubmissionResult,
} from "@/lib/pos-checkout";
import { CheckoutResult, formatCheckoutAmount as fmt } from "./checkout-result";
import { CheckoutRecoveryNotice } from "./checkout-recovery-notice";
import { CustomerSearchModal } from "./customer-search-modal";
import { CheckoutStepHeader } from "./checkout-stepper";
import { CheckoutCartItem } from "./checkout-cart-item";

let autoRecoveryRequestKey: string | null = null;

export interface CheckoutSidebarProps {
	onConfirmPayment?: ConfirmCheckoutPayment;
	isSubmitting?: boolean;
	onClose?: () => void;
	/** Legacy route entry hints. Pending payment recovery takes precedence. */
	initialStep?: "customer" | "menu" | "payment" | "receipt" | "assign";
	lastOrderId?: string | null;
	onPrintLastOrder?: () => void;
	onPrintOpenBill?: () => void;
	onPrintKitchen?: () => void;
	canPrintOpenBill?: boolean;
	/** Preferred printing API: always receives the just-submitted order ID. */
	onPrintOrder?: (orderId: string, mode?: "kitchen") => void;
	pendingPayment?: { customerName: string; total: number };
	onRecoverPayment?: () => Promise<CheckoutSubmissionResult>;
}

export function CheckoutSidebar({
	onConfirmPayment,
	isSubmitting = false,
	onClose,
	lastOrderId,
	onPrintLastOrder,
	onPrintOpenBill,
	onPrintKitchen,
	canPrintOpenBill = true,
	onPrintOrder,
	pendingPayment,
	onRecoverPayment,
}: CheckoutSidebarProps) {
	const {
		items,
		updateQuantity,
		updateItemPrice,
		totalItems,
		totalAmount,
		grossAmount,
		promoDiscountAmount,
		voucherDiscountAmount,
		appliedVoucher,
		applyVoucher,
		customerInfo,
		updateCustomerInfo,
		checkoutDraft: draft,
		setCheckoutDraft,
		clearCart,
		platformTotal,
		commissionAmount,
		netRevenue,
	} = useCart();
	const { siteSettings, activeDiscounts } = useAppData();
	const shiftStatus = useHybridShiftStatus();
	const categories = useHybridCategories();
	const staffUsers = useHybridStaffUsers();
	const isShiftOpen = shiftStatus?.isOpen ?? false;
	const [customerSearchOpen, setCustomerSearchOpen] = useState(false);
	const [submitting, setSubmitting] = useState(false);
	const [submitError, setSubmitError] = useState<string | null>(null);
	const inFlight = useRef(false);
	const busy = isSubmitting || submitting;
	const patch = (update: Partial<typeof draft>) => {
		setSubmitError(null);
		setCheckoutDraft((prev) => ({ ...prev, ...update }));
	};
	const orderTypes = [...(siteSettings?.orderTypes ?? DEFAULT_ORDER_TYPES)]
		.filter((type) => type.isActive)
		.sort((a, b) => a.sortOrder - b.sortOrder);
	const selectedOrderType = orderTypes.find(
		(type) => type.id === customerInfo.orderType,
	);
	const platforms = [...(siteSettings?.platforms ?? [])]
		.filter((p) => p.isActive)
		.sort((a, b) => a.sortOrder - b.sortOrder);
	const paymentOptions = useMemo(() => {
		const options: { id: string; label: string }[] = [];
		if (siteSettings?.paymentMethodsManual?.cash !== false)
			options.push({ id: "tunai", label: "Tunai" });
		if (siteSettings?.paymentMethodsManual?.qris !== false)
			options.push({ id: "qris", label: "QRIS statis" });
		if (siteSettings?.paymentMethodsManual?.transfer !== false)
			options.push({ id: "transfer", label: "Transfer bank" });
		// Mayar's current Edge Function contract accepts customer/B2B orders,
		// not cashier-originated POS orders. Keep the unsupported method out of
		// the cashier flow until the server contract is expanded end-to-end.
		return options;
	}, [siteSettings]);
	const tax = calculateOrderTax({
		items,
		voucherDiscountAmount,
		taxEnabled: siteSettings?.taxEnabled ?? false,
		taxRate: Number(siteSettings?.taxRate ?? 0),
		serviceChargeRate: Number(siteSettings?.serviceChargeRate ?? 0),
		source: "pos",
		paymentMethod: draft.paymentMethod || "tunai",
	});
	const total = tax.finalTotal;
	const change =
		typeof draft.cashReceived === "number"
			? Math.max(0, draft.cashReceived - total)
			: 0;
	const assignments = useMemo(
		() =>
			reconcileAssignments(
				items,
				(categories ?? []).map((category) => ({
					_id: String(category._id),
					track: category.track as string | null | undefined,
				})),
				draft.assignments,
			),
		[items, categories, draft.assignments],
	);
	const staffByGroup = useMemo(() => {
		const shift = shiftStatus?.ongoingShift;
		const names = new Set<string>(
			[
				shift?.cashierName || shiftStatus?.shiftInfo?.cashierName || "",
				...(shift?.teamMembers || "").split(/[,\n;|]/),
			]
				.map((name) => name.trim())
				.filter(Boolean),
		);
		const groupForRole: Record<string, string> = {
			barista: "barista",
			bartender: "barista",
			bar: "barista",
			chef: "kitchen",
			koki: "kitchen",
			kitchen: "kitchen",
			cook: "kitchen",
		};
		const groupNames = (group: string) =>
			[...names].filter((name) => {
				const role = staffUsers?.find(
					(user) => user.name?.toLowerCase().trim() === name.toLowerCase(),
				)?.roleName;
				return role ? groupForRole[role.toLowerCase().trim()] === group : false;
			});
		return { barista: groupNames("barista"), kitchen: groupNames("kitchen") };
	}, [shiftStatus, staffUsers]);
	const validDiscounts = useMemo(() => {
		const now = new Date();
		const context = {
			currentTimestamp: now.getTime(),
			currentDay: now.getDay(),
			currentTimeVal: now.getHours() * 60 + now.getMinutes(),
		};
		return (activeDiscounts ?? []).filter((discount) =>
			discount.targetType === "ALL"
				? isDiscountApplicable(
						discount,
						{ _id: "", price: 0, categoryId: "" },
						context,
					)
				: items.some((item) =>
						isDiscountApplicable(
							discount,
							{
								_id: item.productId,
								price: item.price,
								categoryId: item.category || "",
							},
							context,
						),
					),
		);
	}, [activeDiscounts, items]);
	const validation = validateCheckout({
		itemCount: items.length,
		total,
		paymentMethod: draft.paymentMethod,
		cashReceived: draft.cashReceived,
		isShiftOpen,
		customer: customerInfo,
	});
	const paymentUnavailable = Boolean(
		draft.paymentMethod &&
		!paymentOptions.some((option) => option.id === draft.paymentMethod),
	);
	const canPrint = canPrintCheckoutResult(draft.result, lastOrderId);
	const result = draft.result;
	const hasPendingPayment = Boolean(pendingPayment);
	const activeStep = result
		? "result"
		: draft.step === "payment"
			? "payment"
			: "order";

	const submit = async (isOpenBill = false) => {
		if (inFlight.current || busy || hasPendingPayment) return;
		const error = validateCheckout({
			itemCount: items.length,
			total,
			paymentMethod: draft.paymentMethod,
			cashReceived: draft.cashReceived,
			isShiftOpen,
			customer: customerInfo,
			isOpenBill,
		});
		if (error || (!isOpenBill && paymentUnavailable)) {
			setSubmitError(
				error || "Metode pembayaran ini tidak tersedia. Pilih metode lain.",
			);
			return;
		}
		if (!onConfirmPayment) {
			setSubmitError("Checkout belum tersedia. Muat ulang atau hubungi admin.");
			return;
		}
		inFlight.current = true;
		setSubmitting(true);
		setSubmitError(null);
		try {
			const submitted = await onConfirmPayment(
				total,
				appliedVoucher?._id,
				isOpenBill ? "cash" : draft.paymentMethod,
				{
					tableNumber: customerInfo.tableNumber,
					orderType: customerInfo.orderType,
					notes: customerInfo.notes,
					autoComplete: isOpenBill ? false : draft.autoComplete,
					isOpenBill,
					...(!isOpenBill &&
					(draft.paymentMethod === "tunai" || draft.paymentMethod === "cash") &&
					typeof draft.cashReceived === "number"
						? { cashReceived: draft.cashReceived, changeAmount: change }
						: {}),
					assignments: assignments
						.map((group) => ({
							...group,
							items: group.items.filter((item) => item.assignedTo),
						}))
						.filter((group) => group.items.length > 0),
				},
			);
			if (!isCheckoutResult(submitted))
				throw new Error(
					"Hasil transaksi tidak tersedia. Periksa riwayat pesanan sebelum mencoba lagi.",
				);
			// The parent clears the cart before resolving. Install this snapshot afterwards;
			// cart-cleared effects must never replace a successful result with an empty order.
			setCheckoutDraft({
				...createCheckoutDraft(),
				step: "result",
				result: { ...submitted },
			});
		} catch (error) {
			setSubmitError(
				error instanceof Error
					? error.message
					: "Pesanan belum terkirim. Coba lagi dari checkout ini.",
			);
		} finally {
			inFlight.current = false;
			setSubmitting(false);
		}
	};
	const recover = useCallback(async () => {
		if (inFlight.current || busy || !onRecoverPayment) return;
		inFlight.current = true;
		setSubmitting(true);
		setSubmitError(null);
		try {
			const recovered = await onRecoverPayment();
			if (!isCheckoutResult(recovered)) {
				throw new Error("Hasil pemulihan tidak tersedia. Periksa riwayat pesanan.");
			}
			setCheckoutDraft({
				...createCheckoutDraft(),
				step: "result",
				result: { ...recovered },
			});
		} catch (error) {
			setSubmitError(
				error instanceof Error
					? error.message
					: "Pesanan awal belum dapat dipulihkan. Coba lagi.",
			);
		} finally {
			inFlight.current = false;
			setSubmitting(false);
		}
	}, [busy, onRecoverPayment]);
	useEffect(() => {
		if (!pendingPayment) {
		autoRecoveryRequestKey = null;
			return;
		}
		const requestKey = `${pendingPayment.customerName}:${pendingPayment.total}`;
		if (autoRecoveryRequestKey === requestKey || busy || !onRecoverPayment) return;
		autoRecoveryRequestKey = requestKey;
		void recover();
	}, [busy, onRecoverPayment, pendingPayment, recover]);
	const customerFields = (
		<div className="space-y-1.5 rounded-lg border border-border/70 bg-card p-2 shadow-sm">
			<div className="flex items-end gap-1.5">
				<label className="flex-1 space-y-1 text-xs font-semibold">
					<span className="text-foreground">
						Nama pelanggan
						{draft.paymentMethod === "qris_mayar" ? " (wajib)" : " (opsional)"}
					</span>
					<Input
						className="min-h-11 text-sm"
						value={customerInfo.name}
						onChange={(e) => updateCustomerInfo({ name: e.target.value })}
						autoComplete="name"
					/>
				</label>
				<Button
					aria-label="Cari pelanggan"
					variant="outline"
					className="min-h-11 min-w-11 shrink-0 rounded-lg px-0 shadow-sm"
					onClick={() => setCustomerSearchOpen(true)}
				>
					<Search className="h-4 w-4" />
				</Button>
			</div>
			{selectedOrderType?.requiresTableNumber && (
				<label className="block space-y-1 text-xs font-semibold">
					<span>Nomor meja (opsional)</span>
					<Input
						className="min-h-11 text-sm"
						value={customerInfo.tableNumber}
						onChange={(e) =>
							updateCustomerInfo({ tableNumber: e.target.value })
						}
					/>
				</label>
			)}
			<label className="block space-y-1 text-xs font-semibold">
				<span>Catatan pesanan (opsional)</span>
				<Input
					className="min-h-11 text-sm"
					value={customerInfo.notes}
					onChange={(e) => updateCustomerInfo({ notes: e.target.value })}
				/>
			</label>
		</div>
	);
	return (
		<div className="relative flex h-full min-h-0 flex-col bg-[#F2F2F7] text-sm text-slate-900 dark:bg-[#1C1C1E] dark:text-slate-100 [&_input]:text-base [&_select]:text-base [&_textarea]:text-base">
			<CheckoutStepHeader
				activeStep={activeStep}
				disabled={busy || hasPendingPayment}
				onStepChange={(step) => patch({ step })}
				onClose={onClose}
			/>
			<div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[#F2F2F7] dark:bg-[#1C1C1E]">
				{result ? (
					<CheckoutResult
						result={result}
						onPrint={
							result.orderId &&
							result.status !== "queued" &&
							(onPrintOrder || (canPrint && onPrintLastOrder))
								? () =>
										onPrintOrder
											? onPrintOrder(result.orderId!)
											: onPrintLastOrder?.()
								: undefined
						}
						onPrintKitchen={
							result.orderId &&
							result.status !== "queued" &&
							(onPrintOrder || (canPrint && onPrintKitchen))
								? () =>
										onPrintOrder
											? onPrintOrder(result.orderId!, "kitchen")
											: onPrintKitchen?.()
								: undefined
						}
					/>
				) : (
					<div className="space-y-3 p-3 sm:space-y-4 sm:p-4">
						{hasPendingPayment && pendingPayment && (
							<CheckoutRecoveryNotice
								customerName={pendingPayment.customerName}
								total={pendingPayment.total}
								busy={busy}
								onRecover={() => void recover()}
							/>
						)}
						<fieldset
							disabled={busy || hasPendingPayment}
							className="min-w-0 space-y-3 disabled:opacity-60 sm:space-y-4"
						>
						{activeStep === "order" ? (
							<>
								<div className="flex items-center justify-between gap-2">
									<div>
										<p className="text-xs font-medium text-slate-500 dark:text-slate-400">Langkah 1 dari 3</p>
										<h2 className="mt-0.5 text-xl font-bold tracking-tight text-slate-900">Pesanan ({totalItems})</h2>
									</div>
										<Button
											variant="ghost"
											className="min-h-11 rounded-full px-4 text-sm font-semibold text-slate-500 hover:bg-white dark:text-slate-300 dark:hover:bg-slate-800"
											disabled={!items.length || busy}
											onClick={clearCart}
										>
										Kosongkan
									</Button>
								</div>
								<div className="rounded-2xl border border-black/[0.06] bg-white p-3 shadow-sm dark:border-white/10 dark:bg-[#2C2C2E]">
									<p className="mb-2 text-sm font-semibold text-slate-500 dark:text-slate-400">Jenis pesanan</p>
									<div className="flex flex-wrap gap-1.5" aria-label="Tipe pesanan">
									{orderTypes.map((type) => (
										<Button
											key={type.id}
											variant={
												customerInfo.orderType === type.id
													? "default"
													: "outline"
											}
											className="min-h-11 rounded-lg px-3 text-xs font-bold shadow-sm"
											aria-pressed={customerInfo.orderType === type.id}
											onClick={() =>
												updateCustomerInfo({
													orderType: type.id,
													...(type.id !== "online"
														? {
																platform: undefined,
																platformCommission: undefined,
															}
														: {}),
												})
											}
										>
											{type.label}
										</Button>
									))}
									</div>
								</div>
								{selectedOrderType?.id === "online" && (
									<div className="space-y-2 rounded-2xl border border-black/[0.06] bg-white p-3 shadow-sm dark:border-white/10 dark:bg-[#2C2C2E]">
										<p className="text-sm font-semibold text-slate-500 dark:text-slate-400">Platform pesanan</p>
										<div className="flex flex-wrap gap-1.5">
											{platforms.map((platform) => (
												<Button
													key={platform.id}
													variant={
														customerInfo.platform === platform.id
															? "default"
															: "outline"
													}
													className="min-h-11 rounded-lg px-3 text-xs font-bold shadow-sm"
													aria-pressed={customerInfo.platform === platform.id}
													onClick={() =>
														updateCustomerInfo({
															platform: platform.id,
															platformCommission: platform.commissionRate,
														})
													}
												>
													{platform.name}
												</Button>
											))}
										</div>
									</div>
								)}
								{items.length === 0 && (
									<p className="rounded-xl border border-dashed border-border p-6 text-center text-muted-foreground">
										Belum ada menu. Tambahkan menu untuk mulai memesan.
									</p>
								)}
			<div className="overflow-hidden rounded-2xl border border-black/[0.06] bg-white shadow-sm divide-y divide-black/[0.06] dark:divide-white/10 dark:border-white/10 dark:bg-[#2C2C2E]">
									{items.map((item) => (
										<div key={`${item.productId}-${item.variant || "default"}`}>
											<CheckoutCartItem
												item={item}
												onQuantityChange={(delta) =>
													updateQuantity(item.productId, item.variant, delta)
												}
												onPriceChange={(price) =>
													updateItemPrice(item.productId, item.variant, price)
												}
												showPlatformPrice={customerInfo.orderType === "online"}
											/>
											<article
												className="hidden space-y-2 rounded-xl border border-border/80 bg-card p-2.5 shadow-sm transition-shadow hover:shadow-md"
											key={`${item.productId}-${item.variant || "default"}`}
										>
											<div className="flex justify-between gap-2">
												<div className="min-w-0">
															<p className="text-sm font-bold text-foreground">{item.name}</p>
													{item.variant && (
																<p className="text-[11px] text-muted-foreground">
															{item.variant}
														</p>
													)}
												</div>
												<span className="shrink-0 font-medium">
													{fmt(item.price * item.quantity)}
												</span>
											</div>
											{customerInfo.orderType === "online" && (
												<label className="block space-y-1">
													<span>Harga platform per item</span>
													<Input
														type="number"
														inputMode="numeric"
														min="0"
														className="min-h-12 text-base"
														value={item.platformPrice ?? item.price}
														onChange={(e) => {
															const price = Number(e.target.value);
															if (Number.isFinite(price) && price >= 0)
																updateItemPrice(
																	item.productId,
																	item.variant,
																	price,
																);
														}}
													/>
												</label>
											)}
											<div className="flex items-center justify-end gap-3">
												<Button
													aria-label={`Kurangi ${item.name}${item.variant ? ` ${item.variant}` : ""}`}
																className="h-9 w-9 rounded-lg px-0 shadow-sm"
													variant="outline"
													onClick={() =>
														updateQuantity(item.productId, item.variant, -1)
													}
												>
													<Minus className="h-4 w-4" />
												</Button>
												<span
													className="min-w-6 text-center"
													aria-label="Jumlah"
												>
													{item.quantity}
												</span>
												<Button
													aria-label={`Tambah ${item.name}${item.variant ? ` ${item.variant}` : ""}`}
															className="h-9 w-9 rounded-lg px-0 shadow-sm"
													variant="outline"
													onClick={() =>
														updateQuantity(item.productId, item.variant, 1)
													}
												>
													<Plus className="h-4 w-4" />
												</Button>
											</div>
											</article>
										</div>
									))}
								</div>
								<details className="rounded-xl border border-border/70 bg-card p-2 shadow-sm">
									<summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold">
										Detail & promo (opsional)
									</summary>
									<div className="mt-2 space-y-3">
										{customerFields}
										<label className="flex min-h-11 items-center gap-3 rounded-2xl border border-black/[0.06] bg-white px-4 py-2 text-sm font-medium shadow-sm dark:border-white/10 dark:bg-[#2C2C2E]">
											<input type="checkbox" className="h-5 w-5 accent-primary" checked={customerInfo.isFreeRefill} onChange={(e) => updateCustomerInfo({ isFreeRefill: e.target.checked })} />
											<span>Free refill minuman (sesuai promo aktif)</span>
										</label>
									</div>
								</details>
							</>
						) : (
							<>
								<div className="flex items-end justify-between gap-3">
									<div>
										<p className="text-[9px] font-black uppercase tracking-[0.14em] text-primary">Langkah 2 dari 3</p>
										<h2 className="mt-0.5 text-base font-black tracking-tight text-foreground">Pembayaran</h2>
									</div>
								</div>
								<div
									className="grid grid-cols-2 gap-1.5"
									aria-label="Metode pembayaran"
								>
									{paymentOptions.map((option) => (
										<Button
											variant={
												draft.paymentMethod === option.id
													? "default"
													: "outline"
											}
											key={option.id}
											className="min-h-12 rounded-xl whitespace-normal px-3 text-sm font-bold shadow-sm"
											aria-pressed={draft.paymentMethod === option.id}
											onClick={() => patch({ paymentMethod: option.id })}
										>
											{option.label}
										</Button>
									))}
								</div>
								{paymentOptions.length === 0 && (
									<p role="alert" className="text-destructive">
										Tidak ada metode pembayaran aktif. Hubungi admin.
									</p>
								)}
								{draft.paymentMethod === "tunai" && (
										<div className="space-y-3 rounded-2xl border border-black/[0.06] bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#2C2C2E]">
										<label className="block space-y-1 text-xs font-semibold">
											<span>Uang diterima (wajib)</span>
											<Input
												type="number"
												min="0"
												inputMode="numeric"
															className="h-9 text-sm"
												placeholder="Masukkan nominal"
												value={draft.cashReceived}
												aria-describedby="checkout-payment-help"
												aria-invalid={
													draft.cashReceived !== "" &&
													draft.cashReceived < total
												}
												onChange={(e) =>
													patch({
														cashReceived:
															e.target.value === ""
																? ""
																: Number(e.target.value),
													})
												}
											/>
										</label>
										<div className="grid grid-cols-3 gap-1.5">
											{[50000, 100000].map((amount) => (
												<Button
													key={amount}
													variant="outline"
													className="min-h-11 px-1 text-xs"
													onClick={() => patch({ cashReceived: amount })}
												>
													{fmt(amount)}
												</Button>
											))}
											<Button
												variant="secondary"
												className="min-h-11 px-1 text-xs"
												onClick={() => patch({ cashReceived: total })}
											>
												Uang pas
											</Button>
										</div>
										<p className="flex justify-between">
											<span>Kembalian</span>
											<strong>{fmt(change)}</strong>
										</p>
									</div>
								)}
								{draft.paymentMethod === "qris_mayar" && (
									<div className="space-y-3 rounded-2xl border border-black/[0.06] bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#2C2C2E]">
										<p className="text-xs font-medium">
											QRIS dinamis memerlukan koneksi internet. Nama, email dan
											telepon wajib diisi sebelum membuat pembayaran.
										</p>
										<label className="block space-y-1 text-xs font-semibold">
											<span>Nama pelanggan (wajib)</span>
											<Input
															className="h-9"
												required
												value={customerInfo.name}
												autoComplete="name"
												onChange={(e) =>
													updateCustomerInfo({ name: e.target.value })
												}
											/>
										</label>
										<label className="block space-y-1 text-xs font-semibold">
											<span>Email (wajib)</span>
											<Input
															className="h-9"
												type="email"
												inputMode="email"
												required
												value={customerInfo.email || ""}
												autoComplete="email"
												onChange={(e) =>
													updateCustomerInfo({ email: e.target.value })
												}
											/>
										</label>
										<label className="block space-y-1 text-xs font-semibold">
											<span>Telepon (wajib)</span>
											<Input
															className="h-9"
												type="tel"
												inputMode="tel"
												required
												value={customerInfo.phone || ""}
												autoComplete="tel"
												onChange={(e) =>
													updateCustomerInfo({ phone: e.target.value })
												}
											/>
										</label>
									</div>
								)}
								{draft.paymentMethod === "qris" && (
									<p className="text-muted-foreground">
										Pastikan pembayaran QRIS statis sudah diterima sebelum
										konfirmasi.
									</p>
								)}
								{draft.paymentMethod === "transfer" && (
									<p className="text-muted-foreground">
										Pastikan transfer bank sudah diterima sebelum konfirmasi.
									</p>
								)}
								<details className="rounded-2xl border border-black/[0.06] bg-white px-4 py-1 shadow-sm dark:border-white/10 dark:bg-[#2C2C2E]">
									<summary className="flex min-h-12 cursor-pointer items-center justify-between gap-3 text-sm font-semibold">
										<span>Diskon & opsi pesanan</span>
										{appliedVoucher ? <span className="truncate text-xs font-medium text-primary">{appliedVoucher.name}</span> : null}
									</summary>
									<div className="space-y-3 pb-3">
								{(validDiscounts.length > 0 || appliedVoucher) && (
									<label className="block space-y-1">
										<span>Voucher / diskon</span>
										<select
															className="h-9 w-full rounded-lg border border-border bg-background px-2 text-xs"
											value={appliedVoucher?._id || ""}
											onChange={(e) => {
												const voucher = validDiscounts.find(
													(d) => d._id === e.target.value,
												);
												applyVoucher(
													voucher
														? {
																_id: voucher._id,
																name: voucher.name,
																type: voucher.type,
																value: voucher.value,
																targetType: voucher.targetType,
																targetIds: voucher.targetIds,
															}
														: null,
												);
											}}
										>
											<option value="">Tanpa voucher</option>
											{appliedVoucher &&
												!validDiscounts.some(
													(d) => d._id === appliedVoucher._id,
												) && (
													<option value={appliedVoucher._id}>
														{appliedVoucher.name}
													</option>
												)}
											{validDiscounts.map((d) => (
												<option key={d._id} value={d._id}>
													{d.name}
												</option>
											))}
										</select>
									</label>
								)}
									<label className="flex min-h-9 items-center gap-2 text-xs">
									<input
										className="h-5 w-5 accent-primary"
										type="checkbox"
										checked={draft.autoComplete}
										onChange={(e) => patch({ autoComplete: e.target.checked })}
									/>
									<span>Otomatis selesaikan pesanan</span>
								</label>
									<details className="rounded-xl border border-border p-2.5">
										<summary className="flex min-h-8 cursor-pointer items-center text-xs font-semibold">
										Atur tim (opsional)
									</summary>
										<p className="mb-2 text-[11px] text-muted-foreground">
										Pesanan dapat dikirim tanpa penugasan khusus.
									</p>
									{assignments.map((group) => (
										<div key={group.groupType} className="mb-4 space-y-2">
											<label className="block space-y-1 text-xs font-semibold">
												<span>
													{group.groupType === "barista" ? "Barista" : "Dapur"}
												</span>
												<select
																className="h-9 w-full rounded-lg border border-border bg-background px-2 text-xs"
													value={group.assignedTo}
													onChange={(e) =>
														patch({
															assignments: assignments.map((g) =>
																g.groupType === group.groupType
																	? {
																			...g,
																			assignedTo: e.target.value,
																			items: g.items.map((i) => ({
																				...i,
																				assignedTo: e.target.value,
																			})),
																		}
																	: g,
															),
														})
													}
												>
													<option value="">Tanpa penugasan khusus</option>
													{[
														...new Set(
															[
																...staffByGroup[group.groupType],
																group.assignedTo,
															].filter(Boolean),
														),
													].map((name) => (
														<option key={name}>{name}</option>
													))}
												</select>
											</label>
											{group.items.map((item, index) => (
															<label
																className="block space-y-1 text-xs font-semibold"
													key={`${item.productId}-${item.variant}`}
												>
													<span>
														{item.quantity}× {item.productName}
														{item.variant ? ` (${item.variant})` : ""}
													</span>
													<select
																	className="h-9 w-full rounded-lg border border-border bg-background px-2 text-xs"
														value={item.assignedTo}
														onChange={(e) =>
															patch({
																assignments: assignments.map((g) =>
																	g.groupType === group.groupType
																		? {
																				...g,
																				items: g.items.map((i, n) =>
																					n === index
																						? {
																								...i,
																								assignedTo: e.target.value,
																							}
																						: i,
																				),
																			}
																		: g,
																),
															})
														}
													>
														<option value="">Tanpa penugasan khusus</option>
														{[
															...new Set(
																[
																	...staffByGroup[group.groupType],
																	item.assignedTo,
																].filter(Boolean),
															),
														].map((name) => (
															<option key={name}>{name}</option>
														))}
													</select>
												</label>
											))}
										</div>
									))}
								</details>
									</div>
								</details>
							</>
						)}
						<section className="rounded-2xl border border-black/[0.06] bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#2C2C2E]">
							<div className="flex items-center justify-between gap-3">
								<span className="text-sm font-medium text-slate-500 dark:text-slate-300">Total</span>
								<strong className="text-xl font-bold tracking-tight tabular-nums text-slate-900 dark:text-white">{fmt(total)}</strong>
							</div>
							<details className="mt-3 border-t border-black/[0.06] pt-1">
								<summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium text-slate-500 dark:text-slate-400">Rincian biaya</summary>
								<dl className="space-y-2 pb-2 text-sm">
							<div className="flex justify-between">
								<dt>Subtotal</dt>
								<dd>{fmt(grossAmount)}</dd>
							</div>
							{promoDiscountAmount > 0 && (
								<div className="flex justify-between">
									<dt>Promo</dt>
									<dd>−{fmt(promoDiscountAmount)}</dd>
								</div>
							)}
							{voucherDiscountAmount > 0 && (
								<div className="flex justify-between">
									<dt>Voucher</dt>
									<dd>−{fmt(voucherDiscountAmount)}</dd>
								</div>
							)}
							{siteSettings?.taxEnabled ? (
								<>
									<div className="flex justify-between">
										<dt>Dasar pajak</dt>
										<dd>
											{fmt(Math.max(0, totalAmount - voucherDiscountAmount))}
										</dd>
									</div>
									<div className="flex justify-between">
										<dt>PBJT ({tax.taxRate}%)</dt>
										<dd>{fmt(tax.taxAmount)}</dd>
									</div>
								</>
							) : (
								<div>
									<dt className="sr-only">Pajak</dt>
									<dd className="text-[9px] leading-tight text-muted-foreground">
										Harga menu sudah termasuk PBJT atas makanan dan/atau minuman
										sesuai ketentuan yang berlaku di Kota Tasikmalaya.
									</dd>
								</div>
							)}
							{tax.serviceChargeAmount > 0 && (
								<div className="flex justify-between">
									<dt>Service charge ({tax.serviceChargeRate}%)</dt>
									<dd>{fmt(tax.serviceChargeAmount)}</dd>
								</div>
							)}
							{tax.roundingAdjustment !== 0 && (
								<div className="flex justify-between">
									<dt>Pembulatan</dt>
									<dd>{fmt(tax.roundingAdjustment)}</dd>
								</div>
							)}
							{customerInfo.orderType === "online" && (
								<>
									<div className="flex justify-between">
										<dt>Total platform</dt>
										<dd>{fmt(platformTotal)}</dd>
									</div>
									<div className="flex justify-between">
										<dt>Komisi</dt>
										<dd>{fmt(commissionAmount)}</dd>
									</div>
									<div className="flex justify-between">
										<dt>Pendapatan bersih</dt>
										<dd>{fmt(netRevenue)}</dd>
									</div>
								</>
							)}
								</dl>
							</details>
						</section>
						</fieldset>
					</div>
				)}
			</div>
			{result ? (
				<footer className="shrink-0 border-t border-black/[0.06] bg-white/95 px-4 py-3 shadow-[0_-8px_24px_rgba(15,23,42,0.06)] backdrop-blur-xl pb-[max(0.75rem,env(safe-area-inset-bottom))] dark:border-white/10 dark:bg-[#1C1C1E]/95">
					<Button
						className="min-h-12 w-full rounded-2xl text-sm font-semibold shadow-sm"
						onClick={() => {
							clearCart();
							setSubmitError(null);
						}}
					>
						Pesanan baru
					</Button>
				</footer>
			) : hasPendingPayment ? (
				<footer className="shrink-0 space-y-2 border-t border-black/[0.06] bg-white/95 px-4 py-3 shadow-[0_-8px_24px_rgba(15,23,42,0.06)] backdrop-blur-xl pb-[max(0.75rem,env(safe-area-inset-bottom))] dark:border-white/10 dark:bg-[#1C1C1E]/95">
					{submitError && <p className="text-[13px] text-destructive" role="alert">{submitError}</p>}
				</footer>
			) : (
				<footer className="shrink-0 space-y-2 border-t border-black/[0.06] bg-white/95 px-4 py-3 shadow-[0_-8px_24px_rgba(15,23,42,0.06)] backdrop-blur-xl pb-[max(0.75rem,env(safe-area-inset-bottom))] dark:border-white/10 dark:bg-[#1C1C1E]/95">
					{submitError && (
						<p className="text-[13px] text-destructive" role="alert">
							{submitError}
						</p>
					)}
					{activeStep === "payment" ? (
						<>
							<p
								id="checkout-payment-help"
								className={cn(
									"text-xs",
									validation || paymentUnavailable
										? "text-destructive"
										: "text-muted-foreground",
								)}
								aria-live="polite"
							>
								{paymentUnavailable
									? "Pilih metode pembayaran yang tersedia."
									: validation ||
										"Periksa nominal sebelum mengonfirmasi pembayaran."}
							</p>
							<Button
								variant="ghost"
								className="min-h-11 w-full justify-center gap-1.5 rounded-xl text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-900"
								disabled={busy}
								onClick={() => patch({ step: "order" })}
							>
								<ArrowLeft className="size-4" aria-hidden="true" />
								Kembali ke pesanan
							</Button>
							<Button
								className="min-h-12 w-full rounded-xl text-sm font-bold shadow-sm"
								disabled={
									busy ||
									Boolean(validation) ||
									paymentUnavailable ||
									!onConfirmPayment
								}
								onClick={() => void submit()}
							>
								{busy
									? "Memproses…"
									: draft.paymentMethod === "qris_mayar"
										? `Buat pembayaran · ${fmt(total)}`
										: `Konfirmasi pembayaran · ${fmt(total)}`}
							</Button>
						</>
					) : (
						<>
							{!isShiftOpen && (
								<p className="text-[13px] text-destructive">
									Buka shift terlebih dahulu di menu Shift untuk menyimpan atau
									membayar.
								</p>
							)}
							<Button
								className="min-h-12 w-full rounded-xl text-sm font-bold shadow-sm"
								disabled={!items.length || busy}
								onClick={() => patch({ step: "payment" })}
							>
								Lanjut pembayaran · {fmt(total)}
							</Button>
							<div className="flex gap-2">
								<Button
									variant="secondary"
									className="min-h-11 flex-1 rounded-2xl text-sm font-semibold shadow-sm"
									disabled={
										!items.length || busy || !isShiftOpen || !onConfirmPayment
									}
									onClick={() => void submit(true)}
								>
									{busy ? "Menyimpan…" : "Simpan pesanan"}
								</Button>
								{canPrintOpenBill && onPrintOpenBill && (
									<Button
										variant="outline"
									className="min-h-11 flex-1 rounded-2xl text-sm font-semibold shadow-sm"
										disabled={!items.length || busy}
										onClick={onPrintOpenBill}
									>
										Cetak open bill
									</Button>
								)}
							</div>
						</>
					)}
				</footer>
			)}
			<CustomerSearchModal
				open={customerSearchOpen}
				onOpenChange={setCustomerSearchOpen}
				onSelect={(customer) =>
					updateCustomerInfo({
						name: customer.name,
						email: customer.email || "",
						phone: customer.phone || "",
						customer_source_id: customer.source_id,
					})
				}
			/>
		</div>
	);
}
