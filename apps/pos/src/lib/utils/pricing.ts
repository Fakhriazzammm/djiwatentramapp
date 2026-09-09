import type { Doc, Id } from "@/types/backend-compat";

export interface PricingResult {
	finalPrice: number;
	originalPrice: number;
	discountAmount: number;
	discountName?: string;
	isPromo: boolean;
	appliedDiscountId?: Id<"discounts">;
	isHappyHour?: boolean;
}

export interface DiscountContext {
	currentTimestamp: number;
	currentDay: number;
	currentTimeVal: number;
	channel?: string;
	paymentMethod?: string;
}

function isTargetApplicable(
	discount: Doc<"discounts">,
	product: { _id: string; categoryId: string }
): boolean {
	if (discount.targetType === "ALL") {
		return true;
	}

	const d = discount as { targetIds?: string[]; targetId?: string };
	const targetIds: string[] = d.targetIds || (d.targetId ? [d.targetId] : []);

	if (discount.targetType === "CATEGORY") {
		return targetIds.length > 0 && targetIds.includes(product.categoryId);
	}

	if (discount.targetType === "PRODUCT") {
		return targetIds.length > 0 && targetIds.includes(product._id);
	}

	return false;
}

export function isDiscountApplicable(
	discount: Doc<"discounts">,
	product: { _id: string; price: number; categoryId: string },
	context: DiscountContext
): boolean {
	if (!discount.isActive) {
		return false;
	}

	if (discount.code === "DJIWA-PAY-50-SEPTEMBER-2026") {
		if (context.channel && context.channel !== "djiwa_app") return false;
		if (context.paymentMethod !== "wallet") return false;
		if (Number(product.price) !== 30000) return false;
	}

	// Date Range Check
	if (discount.startDate && context.currentTimestamp < discount.startDate) {
		return false;
	}
	if (discount.endDate) {
		const endOfDay = new Date(discount.endDate);
		endOfDay.setHours(23, 59, 59, 999);
		if (context.currentTimestamp > endOfDay.getTime()) {
			return false;
		}
	}

	// Days of Week Check
	if (
		discount.days &&
		discount.days.length > 0 &&
		!discount.days.includes(context.currentDay)
	) {
		return false;
	}

	// Time Range Check (Happy Hour)
	if (discount.startTime && discount.endTime) {
		const [startH, startM] = discount.startTime.split(":").map(Number);
		const [endH, endM] = discount.endTime.split(":").map(Number);
		const startTimeVal = startH * 60 + startM;
		const endTimeVal = endH * 60 + endM;

		if (
			context.currentTimeVal < startTimeVal ||
			context.currentTimeVal > endTimeVal
		) {
			return false;
		}
	}

	return isTargetApplicable(discount, product);
}

function getPotentialPrice(
	discount: Doc<"discounts">,
	product: { _id: string; price: number; categoryId: string }
): number {
	const originalPrice = product.price;

		// Check for Happy Hour specific product prices
		if (discount.isHappyHour && discount.productPrices) {
			const specificPrice = discount.productPrices.find(
				(pp: any) => pp.productId === product._id
			);
		if (specificPrice) {
			return specificPrice.price;
		}
	}

	if (discount.type === "PERCENTAGE") {
		return originalPrice * (1 - discount.value / 100);
	}
	if (discount.type === "FIXED") {
		return Math.max(0, originalPrice - discount.value);
	}
	if (discount.type === "FLAT_PRICE") {
		return discount.value;
	}
	return originalPrice;
}

export interface PricingOptions {
	/** POS is regular-cashier by default; member-only Happy Hour must be explicit. */
	allowHappyHour?: boolean;
	channel?: string;
	paymentMethod?: string;
}

export function isDjiwaPayCampaign(discount: Doc<"discounts">): boolean {
	return discount.code === "DJIWA-PAY-50-SEPTEMBER-2026";
}

export function isDjiwaPayCampaignActive(discount: Doc<"discounts">, timestamp = Date.now()): boolean {
	if (!isDjiwaPayCampaign(discount) || !discount.isActive) return false;
	if (discount.startDate && timestamp < discount.startDate) return false;
	if (discount.endDate) {
		const endOfDay = new Date(discount.endDate);
		endOfDay.setHours(23, 59, 59, 999);
		if (timestamp > endOfDay.getTime()) return false;
	}
	return true;
}

export function calculateEffectivePrice(
	product: { _id: string; price: number; categoryId: string },
	activeDiscounts: Doc<"discounts">[] | undefined | null,
	options: PricingOptions = {}
): PricingResult {
	const originalPrice = product.price;

	const eligibleDiscounts = (activeDiscounts ?? []).filter((discount) => options.allowHappyHour === true || !discount.isHappyHour);

	if (eligibleDiscounts.length === 0) {
		return {
			finalPrice: originalPrice,
			originalPrice,
			discountAmount: 0,
			isPromo: false,
			isHappyHour: false,
		};
	}

	const now = new Date();
	const context: DiscountContext = {
		currentTimestamp: now.getTime(),
		currentDay: now.getDay(),
		currentTimeVal: now.getHours() * 60 + now.getMinutes(),
		channel: options.channel,
		paymentMethod: options.paymentMethod,
	};

	let bestPrice = originalPrice;
	let appliedDiscount: Doc<"discounts"> | undefined;

	// Customer payment campaign has explicit priority; POS has no wallet context.
	const campaignDiscount = eligibleDiscounts.find((discount) =>
		isDjiwaPayCampaign(discount) && isDiscountApplicable(discount, product, context)
	);
	if (campaignDiscount) {
		const finalPrice = getPotentialPrice(campaignDiscount, product);
		return { finalPrice, originalPrice, discountAmount: originalPrice - finalPrice, discountName: campaignDiscount.name, isPromo: finalPrice < originalPrice, appliedDiscountId: campaignDiscount._id, isHappyHour: false };
	}

	const sortedDiscounts = [...eligibleDiscounts].sort((a, b) => {
		if (isDjiwaPayCampaign(a) && !isDjiwaPayCampaign(b)) return -1;
		if (!isDjiwaPayCampaign(a) && isDjiwaPayCampaign(b)) return 1;
		if (a.isHappyHour && !b.isHappyHour) return -1;
		if (!a.isHappyHour && b.isHappyHour) return 1;
		return 0;
	});

	for (const discount of sortedDiscounts) {
		if (!isDiscountApplicable(discount, product, context)) {
			continue;
		}

		const potentialPrice = getPotentialPrice(discount, product);

		if (potentialPrice < bestPrice) {
			bestPrice = potentialPrice;
			appliedDiscount = discount;
		}
	}

	return {
		finalPrice: bestPrice,
		originalPrice,
		discountAmount: originalPrice - bestPrice,
		discountName: appliedDiscount?.name,
		isPromo: bestPrice < originalPrice,
		appliedDiscountId: appliedDiscount?._id,
		isHappyHour: appliedDiscount?.isHappyHour ?? false,
	};
}

export function isFreeRefillActive(
	discount: Doc<"discounts">,
	context: DiscountContext
): boolean {
	if (!discount.isActive || !discount.isFreeRefill) {
		return false;
	}

	// Date and Day check
	if (discount.startDate && context.currentTimestamp < discount.startDate) {
		return false;
	}
	if (discount.endDate) {
		const endOfDay = new Date(discount.endDate);
		endOfDay.setHours(23, 59, 59, 999);
		if (context.currentTimestamp > endOfDay.getTime()) {
			return false;
		}
	}
	if (
		discount.days &&
		discount.days.length > 0 &&
		!discount.days.includes(context.currentDay)
	) {
		return false;
	}

	// Refill availability logic
	if (discount.refillAvailability === "HAPPY_HOUR") {
		// Only active if within discount's own Happy Hour time
		if (discount.startTime && discount.endTime) {
			const [startH, startM] = discount.startTime.split(":").map(Number);
			const [endH, endM] = discount.endTime.split(":").map(Number);
			const startTimeVal = startH * 60 + startM;
			const endTimeVal = endH * 60 + endM;

			if (
				context.currentTimeVal < startTimeVal ||
				context.currentTimeVal > endTimeVal
			) {
				return false;
			}
		}
	}

	return true;
}

