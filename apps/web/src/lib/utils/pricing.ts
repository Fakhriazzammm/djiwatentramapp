import type { Doc, Id } from "@yumipos/backend/convex/_generated/dataModel";

export interface PricingResult {
	finalPrice: number;
	originalPrice: number;
	discountAmount: number;
	discountName?: string;
	isPromo: boolean;
	appliedDiscountId?: Id<"discounts">;
}

export interface DiscountContext {
	currentTimestamp: number;
	currentDay: number;
	currentTimeVal: number;
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
			(pp) => pp.productId === product._id
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

export function calculateEffectivePrice(
	product: { _id: string; price: number; categoryId: string },
	activeDiscounts: Doc<"discounts">[] | undefined | null
): PricingResult {
	const originalPrice = product.price;

	if (!activeDiscounts || activeDiscounts.length === 0) {
		return {
			finalPrice: originalPrice,
			originalPrice,
			discountAmount: 0,
			isPromo: false,
		};
	}

	const now = new Date();
	const context: DiscountContext = {
		currentTimestamp: now.getTime(),
		currentDay: now.getDay(),
		currentTimeVal: now.getHours() * 60 + now.getMinutes(),
	};

	let bestPrice = originalPrice;
	let appliedDiscount: Doc<"discounts"> | undefined;

	// Sort discounts: Happy Hour first, then others
	const sortedDiscounts = [...activeDiscounts].sort((a, b) => {
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
	};
}
