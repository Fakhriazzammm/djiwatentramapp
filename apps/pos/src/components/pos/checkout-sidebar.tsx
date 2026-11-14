import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCart } from "@/context/cart-context";
import { useAppData } from "@/context/app-data-context";
import {
	useHybridShiftStatus,
	useHybridCategories,
	useHybridStaffUsers,
	DEFAULT_ORDER_TYPES,
} from "@/hooks/use-hybrid-pos-data";
import { calculateOrderTax } from "@djiwaapps/web-shared/lib/tax-calculator";
import { isDiscountApplicable } from "@/lib/utils/pricing";
import {
	canPrintCheckoutResult,
	createCheckoutDraft,
	isCheckoutResult,
	reconcileAssignments,
	validateCheckout,
	type ConfirmCheckoutPayment,
	type CheckoutSubmissionResult,
} from "@/lib/pos-checkout";
import { CheckoutScreen } from "@/components/pos-ios/checkout-screen";
import { CustomerSearchSheet } from "@/components/pos-ios/customer-search-sheet";

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
	const confirmedPrint = result && result.orderId && result.status !== "queued";
	return (
		<>
			<CheckoutScreen
				step={activeStep}
				onBack={() => patch({ step: "order" })}
				onClose={onClose}
				busy={busy}
				submitError={submitError}
				pendingPayment={pendingPayment}
				onRecover={() => void recover()}
				items={items}
				totalItems={totalItems}
				orderTypes={orderTypes as any}
				platforms={platforms as any}
				customerInfo={customerInfo}
				updateCustomerInfo={updateCustomerInfo as any}
				onClear={clearCart}
				onQty={(item, delta) => updateQuantity(item.productId, item.variant, delta)}
				onPrice={(item, price) => updateItemPrice(item.productId, item.variant, price)}
				onSearchCustomer={() => setCustomerSearchOpen(true)}
				total={total}
				grossAmount={grossAmount}
				promoDiscountAmount={promoDiscountAmount}
				voucherDiscountAmount={voucherDiscountAmount}
				totalAmount={totalAmount}
				tax={tax as any}
				taxEnabled={Boolean(siteSettings?.taxEnabled)}
				platformTotal={platformTotal}
				commissionAmount={commissionAmount}
				netRevenue={netRevenue}
				paymentOptions={paymentOptions}
				draft={draft}
				patch={patch as any}
				change={change}
				validation={validation}
				paymentUnavailable={paymentUnavailable}
				validDiscounts={validDiscounts}
				appliedVoucher={appliedVoucher}
				applyVoucher={applyVoucher}
				assignments={assignments}
				staffByGroup={staffByGroup}
				result={result ?? null}
				onPrint={confirmedPrint && (onPrintOrder || (canPrint && onPrintLastOrder)) ? () => (onPrintOrder ? onPrintOrder(result!.orderId!) : onPrintLastOrder?.()) : undefined}
				onPrintKitchen={confirmedPrint && (onPrintOrder || (canPrint && onPrintKitchen)) ? () => (onPrintOrder ? onPrintOrder(result!.orderId!, "kitchen") : onPrintKitchen?.()) : undefined}
				onNewOrder={() => {
					clearCart();
					setSubmitError(null);
				}}
				isShiftOpen={isShiftOpen}
				canPrintOpenBill={canPrintOpenBill}
				onPrintOpenBill={onPrintOpenBill}
				canConfirm={!(busy || Boolean(validation) || paymentUnavailable || !onConfirmPayment)}
				onNext={() => patch({ step: "payment" })}
				onSaveBill={() => void submit(true)}
				onPay={() => void submit()}
			/>
			<CustomerSearchSheet
				open={customerSearchOpen}
				onClose={() => setCustomerSearchOpen(false)}
				onSelect={(customer) =>
					updateCustomerInfo({
						name: customer.name,
						email: customer.email || "",
						phone: customer.phone || "",
						customer_source_id: customer.source_id,
					})
				}
			/>
		</>
	);
}
