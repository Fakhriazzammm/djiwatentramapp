import type { Doc } from "@/types/backend-compat";
import { isDiscountApplicable } from "@/lib/utils/pricing";

export interface ReceiptAdjustmentLine {
	label: string;
	amount: number;
}

export interface ReceiptMeta {
	promotionLabels?: string[];
	adjustmentLines?: ReceiptAdjustmentLine[];
	/** Tax/rounding values snapshotted with the order (new orders only). */
	subtotalAmount?: number;
	taxBaseAmount?: number;
	taxRateSnapshot?: number;
	serviceChargeBaseAmount?: number;
	serviceChargeRateSnapshot?: number;
	rawTotalAmount?: number;
	roundingAdjustment?: number;
	paymentChannelCanonical?: string;
	taxExemptionReason?: string;
	taxPolicyVersion?: string;
	roundingMode?: string;
}

interface CartLikeItem {
	productId: string;
	price: number;
	quantity: number;
	originalPrice?: number;
	category?: string;
}

interface AppliedVoucherLike {
	_id: string;
	name: string;
}

export function buildReceiptMetaFromCart({
	items,
	allDiscounts,
	appliedVoucher,
	promoDiscountAmount,
	voucherDiscountAmount,
	taxAmount,
	serviceChargeAmount,
	createdAt,
	subtotalAmount,
	taxBaseAmount,
	taxRateSnapshot,
	serviceChargeBaseAmount,
	serviceChargeRateSnapshot,
	rawTotalAmount,
	roundingAdjustment,
	paymentChannelCanonical,
	taxExemptionReason,
	taxPolicyVersion,
	roundingMode,
}: {
	items: CartLikeItem[];
	allDiscounts?: Doc<"discounts">[] | null;
	appliedVoucher?: AppliedVoucherLike | null;
	promoDiscountAmount: number;
	voucherDiscountAmount: number;
	taxAmount: number;
	serviceChargeAmount: number;
	createdAt?: number;
	// Optional authoritative tax snapshot from the order calculation.
	subtotalAmount?: number;
	taxBaseAmount?: number;
	taxRateSnapshot?: number;
	serviceChargeBaseAmount?: number;
	serviceChargeRateSnapshot?: number;
	rawTotalAmount?: number;
	roundingAdjustment?: number;
	paymentChannelCanonical?: string;
	taxExemptionReason?: string;
	taxPolicyVersion?: string;
	roundingMode?: string;
}): ReceiptMeta {
	const timestamp = createdAt ?? Date.now();
	const date = new Date(timestamp);
	const context = {
		currentTimestamp: timestamp,
		currentDay: date.getDay(),
		currentTimeVal: date.getHours() * 60 + date.getMinutes(),
	};

	const promotionLabels =
		allDiscounts?.flatMap((discount: Doc<"discounts">) => {
			if (!items.some((item) => {
				if (discount.targetType === "ALL") {
					return isDiscountApplicable(
						discount,
						{ _id: "", price: 0, categoryId: "" },
						context
					);
				}

				return isDiscountApplicable(
					discount,
					{
						_id: item.productId,
						price: item.originalPrice ?? item.price,
						categoryId: item.category || "",
					},
					context
				);
			})) {
				return [];
			}

			if (appliedVoucher?._id === discount._id) {
				return [];
			}

			return [
							discount.isHappyHour
								? discount.name
								: `Promosi - ${discount.name}`,
						];
		}) ?? [];

	if (appliedVoucher?.name) {
		promotionLabels.push(`Voucher - ${appliedVoucher.name}`);
	}

	const adjustmentLines: ReceiptAdjustmentLine[] = [];
	if (promoDiscountAmount > 0) {
		adjustmentLines.push({
			label: "Promo / Marketing",
			amount: -Math.abs(promoDiscountAmount),
		});
	}
	if (voucherDiscountAmount > 0) {
		adjustmentLines.push({
			label: "Voucher / Diskon",
			amount: -Math.abs(voucherDiscountAmount),
		});
	}
	if (taxAmount > 0) {
		adjustmentLines.push({ label: "Pajak", amount: taxAmount });
	}
	if (serviceChargeAmount > 0) {
		adjustmentLines.push({ label: "Service Charge", amount: serviceChargeAmount });
	}

	return {
		promotionLabels: [...new Set(promotionLabels.filter(Boolean))],
		adjustmentLines,
		subtotalAmount,
		taxBaseAmount,
		taxRateSnapshot,
		serviceChargeBaseAmount,
		serviceChargeRateSnapshot,
		rawTotalAmount,
		roundingAdjustment,
		paymentChannelCanonical,
		taxExemptionReason,
		taxPolicyVersion,
		roundingMode,
	};
}

export function buildReceiptMetaFromOrder(params: {
	order: {
		discountAmount?: number;
		taxAmount?: number;
		serviceChargeAmount?: number;
		subtotalAmount?: number;
		taxBaseAmount?: number;
		taxRateSnapshot?: number;
		serviceChargeBaseAmount?: number;
		serviceChargeRateSnapshot?: number;
		rawTotalAmount?: number;
		roundingAdjustment?: number;
		paymentChannelCanonical?: string;
		taxExemptionReason?: string;
		taxPolicyVersion?: string;
		roundingMode?: string;
		voucherId?: string;
		receiptMeta?: ReceiptMeta | null;
		items?: Array<{ price: number; originalPrice?: number }>;
	};
	allDiscounts?: Doc<"discounts">[] | null;
}): ReceiptMeta {
	const { order, allDiscounts } = params;

	if (order.receiptMeta) {
		return order.receiptMeta;
	}

	const promotionLabels: string[] = [];
	if (order.voucherId && allDiscounts) {
		const voucher = allDiscounts.find((discount) => String(discount._id) === String(order.voucherId));
		if (voucher) {
			promotionLabels.push(`Voucher - ${voucher.name}`);
		}
	}

	const hasPromo =
		order.items?.some((item) => (item.originalPrice ?? item.price) > item.price) ?? false;
	if (hasPromo && (!promotionLabels.length || !order.voucherId)) {
		promotionLabels.unshift("Promosi Aktif");
	}

	const adjustmentLines: ReceiptAdjustmentLine[] = [];
	if ((order.discountAmount ?? 0) > 0) {
		adjustmentLines.push({
			label: promotionLabels.some((label) => label.startsWith("Voucher"))
				? "Diskon"
				: "Promosi / Diskon",
			amount: -Math.abs(order.discountAmount ?? 0),
		});
	}
	if ((order.taxAmount ?? 0) > 0) {
		adjustmentLines.push({ label: "Pajak", amount: order.taxAmount ?? 0 });
	}
	if ((order.serviceChargeAmount ?? 0) > 0) {
		adjustmentLines.push({
			label: "Service Charge",
			amount: order.serviceChargeAmount ?? 0,
		});
	}

	return {
		promotionLabels,
		adjustmentLines,
		subtotalAmount: order.subtotalAmount,
		taxBaseAmount: order.taxBaseAmount,
		taxRateSnapshot: order.taxRateSnapshot,
		serviceChargeBaseAmount: order.serviceChargeBaseAmount,
		serviceChargeRateSnapshot: order.serviceChargeRateSnapshot,
		rawTotalAmount: order.rawTotalAmount,
		roundingAdjustment: order.roundingAdjustment,
		paymentChannelCanonical: order.paymentChannelCanonical,
		taxExemptionReason: order.taxExemptionReason,
		taxPolicyVersion: order.taxPolicyVersion,
		roundingMode: order.roundingMode,
	};
}

