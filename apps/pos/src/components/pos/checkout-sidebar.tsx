import { useMemo, useRef, useState } from "react";
import { Minus, Plus, Search, X } from "lucide-react";
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

export interface CheckoutSidebarProps {
	onConfirmPayment?: ConfirmCheckoutPayment;
	isSubmitting?: boolean;
	onClose?: () => void;
	/** Legacy route entry hints. A recovered draft takes precedence. */
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
					: "Pesanan gagal disimpan. Draft tetap tersedia; coba lagi.",
			);
		} finally {
			inFlight.current = false;
			setSubmitting(false);
		}
	};
	const recover = async () => {
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
	};
	const customerFields = (
		<div className="space-y-3">
			<div className="flex items-end gap-2">
				<label className="flex-1 space-y-1">
					<span>
						Nama pelanggan
						{draft.paymentMethod === "qris_mayar" ? " (wajib)" : " (opsional)"}
					</span>
					<Input
						className="h-11 text-sm"
						value={customerInfo.name}
						onChange={(e) => updateCustomerInfo({ name: e.target.value })}
						autoComplete="name"
					/>
				</label>
				<Button
					aria-label="Cari pelanggan"
					variant="outline"
					className="h-11 w-11 shrink-0 px-0"
					onClick={() => setCustomerSearchOpen(true)}
				>
					<Search className="h-4 w-4" />
				</Button>
			</div>
			{selectedOrderType?.requiresTableNumber && (
				<label className="block space-y-1">
					<span>Nomor meja (opsional)</span>
					<Input
						className="h-11 text-sm"
						value={customerInfo.tableNumber}
						onChange={(e) =>
							updateCustomerInfo({ tableNumber: e.target.value })
						}
					/>
				</label>
			)}
			<label className="block space-y-1">
				<span>Catatan pesanan (opsional)</span>
				<Input
					className="h-11 text-sm"
					value={customerInfo.notes}
					onChange={(e) => updateCustomerInfo({ notes: e.target.value })}
				/>
			</label>
		</div>
	);
	return (
		<div className="relative flex h-full min-h-0 flex-col bg-background text-sm [&_input]:text-base [&_select]:text-base [&_textarea]:text-base">
			<header className="flex shrink-0 items-center gap-2 border-b border-border p-3">
				<nav
					aria-label="Tahapan checkout"
					className="flex flex-1 items-center justify-between gap-2 text-[13px]"
				>
					{(
						[
							["order", "Pesanan"],
							["payment", "Pembayaran"],
							["result", "Hasil"],
						] as const
					).map(([step, label], index) => (
						<span
							key={step}
							aria-current={activeStep === step ? "step" : undefined}
							className={cn(
								"font-medium",
								activeStep === step ? "text-primary" : "text-muted-foreground",
							)}
						>
							{index + 1}. {label}
						</span>
					))}
				</nav>
				{onClose && (
					<Button
						variant="ghost"
						aria-label="Tutup checkout"
						className="h-11 w-11 shrink-0 px-0"
						onClick={onClose}
					>
						<X className="h-5 w-5" />
					</Button>
				)}
			</header>
			<div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
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
					<div className="space-y-4 p-4">
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
							className="min-w-0 space-y-4 disabled:opacity-70"
						>
						{activeStep === "order" ? (
							<>
								<h2 className="font-bold">Pesanan ({totalItems})</h2>
								<div className="flex flex-wrap gap-2" aria-label="Tipe pesanan">
									{orderTypes.map((type) => (
										<Button
											key={type.id}
											variant={
												customerInfo.orderType === type.id
													? "default"
													: "outline"
											}
											className="min-h-11 text-sm"
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
								{selectedOrderType?.id === "online" && (
									<div className="space-y-2">
										<p>Platform pesanan</p>
										<div className="flex flex-wrap gap-2">
											{platforms.map((platform) => (
												<Button
													key={platform.id}
													variant={
														customerInfo.platform === platform.id
															? "default"
															: "outline"
													}
													className="min-h-11 text-sm"
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
								<div className="space-y-3">
									{items.map((item) => (
										<article
											className="space-y-2 rounded-xl border border-border p-3"
											key={`${item.productId}-${item.variant || "default"}`}
										>
											<div className="flex justify-between gap-2">
												<div className="min-w-0">
													<p className="font-medium">{item.name}</p>
													{item.variant && (
														<p className="text-[13px] text-muted-foreground">
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
														className="h-11"
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
													className="h-11 w-11 px-0"
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
													className="h-11 w-11 px-0"
													variant="outline"
													onClick={() =>
														updateQuantity(item.productId, item.variant, 1)
													}
												>
													<Plus className="h-4 w-4" />
												</Button>
											</div>
										</article>
									))}
								</div>
								{customerFields}
								<label className="flex min-h-11 items-center gap-3">
									<input
										type="checkbox"
										className="h-5 w-5 accent-primary"
										checked={customerInfo.isFreeRefill}
										onChange={(e) =>
											updateCustomerInfo({ isFreeRefill: e.target.checked })
										}
									/>
									<span>Free refill minuman (sesuai promo aktif)</span>
								</label>
							</>
						) : (
							<>
								<div className="flex items-center justify-between gap-2">
									<h2 className="font-bold">Pembayaran</h2>
									<Button
										variant="outline"
										className="min-h-11 text-sm"
										onClick={() => patch({ step: "order" })}
									>
										Ubah pesanan
									</Button>
								</div>
								<p className="text-muted-foreground">
									Periksa total dan metode sebelum konfirmasi. Pesanan belum
									dibayar.
								</p>
								<div
									className="grid grid-cols-2 gap-2"
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
											className="min-h-11 whitespace-normal text-sm"
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
									<div className="space-y-3 rounded-xl border border-border p-3">
										<label className="block space-y-1">
											<span>Uang diterima (wajib)</span>
											<Input
												type="number"
												min="0"
												inputMode="numeric"
												className="h-11 text-base"
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
										<div className="grid grid-cols-3 gap-2">
											{[50000, 100000].map((amount) => (
												<Button
													key={amount}
													variant="outline"
													className="min-h-11 px-1 text-sm"
													onClick={() => patch({ cashReceived: amount })}
												>
													{fmt(amount)}
												</Button>
											))}
											<Button
												variant="secondary"
												className="min-h-11 px-1 text-sm"
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
									<div className="space-y-3 rounded-xl border border-border p-3">
										<p className="font-medium">
											QRIS dinamis memerlukan koneksi internet. Nama, email dan
											telepon wajib diisi sebelum membuat pembayaran.
										</p>
										<label className="block space-y-1">
											<span>Nama pelanggan (wajib)</span>
											<Input
												className="h-11"
												required
												value={customerInfo.name}
												autoComplete="name"
												onChange={(e) =>
													updateCustomerInfo({ name: e.target.value })
												}
											/>
										</label>
										<label className="block space-y-1">
											<span>Email (wajib)</span>
											<Input
												className="h-11"
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
										<label className="block space-y-1">
											<span>Telepon (wajib)</span>
											<Input
												className="h-11"
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
								{(validDiscounts.length > 0 || appliedVoucher) && (
									<label className="block space-y-1">
										<span>Voucher / diskon</span>
										<select
											className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm"
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
								<label className="flex min-h-11 items-center gap-3">
									<input
										className="h-5 w-5 accent-primary"
										type="checkbox"
										checked={draft.autoComplete}
										onChange={(e) => patch({ autoComplete: e.target.checked })}
									/>
									<span>Otomatis selesaikan pesanan</span>
								</label>
								<details className="rounded-xl border border-border p-3">
									<summary className="flex min-h-11 cursor-pointer items-center font-medium">
										Atur tim (opsional)
									</summary>
									<p className="mb-3 text-muted-foreground">
										Pesanan dapat dikirim tanpa penugasan khusus.
									</p>
									{assignments.map((group) => (
										<div key={group.groupType} className="mb-4 space-y-2">
											<label className="block space-y-1">
												<span>
													{group.groupType === "barista" ? "Barista" : "Dapur"}
												</span>
												<select
													className="h-11 w-full rounded-lg border border-border bg-background px-2"
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
													className="block space-y-1"
													key={`${item.productId}-${item.variant}`}
												>
													<span>
														{item.quantity}× {item.productName}
														{item.variant ? ` (${item.variant})` : ""}
													</span>
													<select
														className="h-11 w-full rounded-lg border border-border bg-background px-2"
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
							</>
						)}
						<dl className="space-y-2 rounded-xl bg-muted/40 p-3 text-[13px]">
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
									<dd className="text-muted-foreground">
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
							<div className="flex justify-between border-t border-border pt-2 text-base font-bold">
								<dt>Total</dt>
								<dd>{fmt(total)}</dd>
							</div>
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
						</fieldset>
					</div>
				)}
			</div>
			{result ? (
				<footer className="shrink-0 border-t border-border bg-background p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
					<Button
						className="min-h-11 w-full text-sm"
						onClick={() => {
							clearCart();
							setSubmitError(null);
						}}
					>
						Pesanan baru
					</Button>
				</footer>
			) : hasPendingPayment ? (
				<footer className="shrink-0 space-y-2 border-t border-border bg-background p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
					{submitError && <p className="text-[13px] text-destructive" role="alert">{submitError}</p>}
					<p className="text-center text-[13px] text-muted-foreground">Pulihkan pesanan awal untuk melanjutkan. Draft saat ini dikunci.</p>
				</footer>
			) : (
				<footer className="shrink-0 space-y-2 border-t border-border bg-background p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
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
									"text-[13px]",
									validation || paymentUnavailable
										? "text-destructive"
										: "text-muted-foreground",
								)}
								aria-live="polite"
							>
								{paymentUnavailable
									? "Metode tersimpan tidak tersedia. Pilih metode lain."
									: validation ||
										"Periksa nominal sebelum mengonfirmasi pembayaran."}
							</p>
							<Button
								className="min-h-11 w-full text-sm"
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
								className="min-h-11 w-full text-sm"
								disabled={!items.length || busy}
								onClick={() => patch({ step: "payment" })}
							>
								Lanjut pembayaran · {fmt(total)}
							</Button>
							<div className="flex gap-2">
								<Button
									variant="secondary"
									className="min-h-11 flex-1 text-sm"
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
										className="min-h-11 flex-1 text-sm"
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
