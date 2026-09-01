import type { Doc, Id } from "@/types/backend-compat";
import { currency } from "@/components/customer/types";

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

export interface HappyHourBanner {
	name: string;
	session: "sarapan" | "siang" | "malam";
	sessionLabel: "Sarapan Pagi" | "Makan Siang" | "Malam";
	startTime: string;
	endTime: string;
	priceLabel: string;
}

export function getActiveHappyHourBanner(
	activeDiscounts: Doc<"discounts">[] | undefined | null,
): HappyHourBanner | null {
	if (!activeDiscounts?.length) return null;

	const now = new Date();
	const timestamp = now.getTime();
	const day = now.getDay();
	const currentMinutes = now.getHours() * 60 + now.getMinutes();
	const isWithinSchedule = (discount: Doc<"discounts">) => {
		if (!discount.isActive || !discount.isHappyHour) return false;
		if (discount.startDate && timestamp < discount.startDate) return false;
		if (discount.endDate) {
			const endOfDay = new Date(discount.endDate);
			endOfDay.setHours(23, 59, 59, 999);
			if (timestamp > endOfDay.getTime()) return false;
		}
		if (discount.days?.length && !discount.days.includes(day)) return false;
		if (!discount.startTime || !discount.endTime) return false;
		const [startHour, startMinute] = discount.startTime.split(":").map(Number);
		const [endHour, endMinute] = discount.endTime.split(":").map(Number);
		const start = startHour * 60 + startMinute;
		const end = endHour * 60 + endMinute;
		return currentMinutes >= start && currentMinutes <= end;
	};

	const discount = activeDiscounts.find(isWithinSchedule);
	if (!discount || !discount.startTime || !discount.endTime) return null;
	const [startHour] = discount.startTime.split(":").map(Number);
	const session = startHour < 11 ? "sarapan" : startHour < 16 ? "siang" : "malam";
	const sessionLabel = session === "sarapan" ? "Sarapan Pagi" : session === "siang" ? "Makan Siang" : "Malam";
	const isAllFlatPrice = discount.targetType === "ALL" && discount.type === "FLAT_PRICE";
	const priceLabel = isAllFlatPrice && discount.value > 0
		? `Semua menu hanya ${currency(discount.value)}`
		: "Harga spesial untuk menu pilihan";

	return {
		name: discount.name || `Happy Hour ${session}`,
		session,
		sessionLabel,
		startTime: discount.startTime,
		endTime: discount.endTime,
		priceLabel,
	};
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
			isHappyHour: false,
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

