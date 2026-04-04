import type { Doc, Id } from "../_generated/dataModel";

export type HppIngredientInput = {
	inventoryId?: Id<"inventory">;
	ingredientName: string;
	purchasePrice: number;
	purchaseQuantity: number;
	purchaseUnit: string;
	usagePerServing: number;
	usageUnit: string;
	conversionFactor: number;
};

export type HppOverheadInput = {
	name: string;
	costPerServing: number;
};

export type HppComputationInput = {
	ingredients: HppIngredientInput[];
	overheadCosts: HppOverheadInput[];
	servingsPerBatch: number;
	sellingPrice: number;
};

export type HppMetrics = {
	ingredientCostPerServing: number;
	overheadCostPerServing: number;
	totalHppPerServing: number;
	totalHppPerBatch: number;
	profitPerServing: number;
	marginPercent: number;
	markupPercent: number;
	breakEvenServings: number;
};

export type InventoryCostSnapshot = {
	inventoryId: Id<"inventory">;
	ingredientName: string;
	unit: string;
	displayUnit?: string;
	conversionFactor?: number;
	latestCostPerUnit?: number;
	latestRestockDate?: number;
	avgCostPerUnit?: number;
};

export type OrderItemHppSnapshot = {
	hppCalculationId?: Id<"hppCalculations">;
	productId: Id<"products">;
	productName: string;
	hppPerUnit: number;
	quantity: number;
	totalHpp: number;
	sellingPricePerUnit: number;
	source: "calculation" | "fallback";
	recordedAt: number;
};

export function getCostPerBaseUnit(ingredient: HppIngredientInput): number {
	const totalBaseUnits =
		ingredient.purchaseQuantity * ingredient.conversionFactor;
	if (totalBaseUnits <= 0) {
		return 0;
	}
	return ingredient.purchasePrice / totalBaseUnits;
}

export function getIngredientCostPerServing(
	ingredient: HppIngredientInput
): number {
	return getCostPerBaseUnit(ingredient) * ingredient.usagePerServing;
}

export function computeHppMetrics(input: HppComputationInput): HppMetrics {
	const ingredientCostPerServing = input.ingredients.reduce(
		(sum, ingredient) => sum + getIngredientCostPerServing(ingredient),
		0
	);
	const overheadCostPerServing = input.overheadCosts.reduce(
		(sum, overhead) => sum + overhead.costPerServing,
		0
	);
	const totalHppPerServing =
		ingredientCostPerServing + overheadCostPerServing;
	const totalHppPerBatch = totalHppPerServing * input.servingsPerBatch;
	const profitPerServing = input.sellingPrice - totalHppPerServing;
	const marginPercent =
		input.sellingPrice > 0
			? (profitPerServing / input.sellingPrice) * 100
			: 0;
	const markupPercent =
		totalHppPerServing > 0
			? (profitPerServing / totalHppPerServing) * 100
			: 0;
	const breakEvenServings =
		totalHppPerBatch > 0 && profitPerServing > 0
			? Math.ceil(totalHppPerBatch / profitPerServing)
			: 0;

	return {
		ingredientCostPerServing,
		overheadCostPerServing,
		totalHppPerServing,
		totalHppPerBatch,
		profitPerServing,
		marginPercent,
		markupPercent,
		breakEvenServings,
	};
}

export function computeHppFromCalculation(calc: Doc<"hppCalculations">) {
	return computeHppMetrics({
		ingredients: calc.ingredients,
		overheadCosts: calc.overheadCosts,
		servingsPerBatch: calc.servingsPerBatch,
		sellingPrice: calc.sellingPrice,
	});
}

export function getInventoryLinkedPurchasePrice(
	ingredient: HppIngredientInput,
	latestCostPerUnit?: number
) {
	if (latestCostPerUnit == null) {
		return 0;
	}
	return latestCostPerUnit * ingredient.conversionFactor;
}

export function getIngredientPriceDelta(
	ingredient: HppIngredientInput,
	latestCostPerUnit?: number
) {
	if (ingredient.inventoryId == null || latestCostPerUnit == null) {
		return null;
	}

	const latestPurchasePrice = getInventoryLinkedPurchasePrice(
		ingredient,
		latestCostPerUnit
	);
	if (ingredient.purchasePrice <= 0) {
		return {
			latestPurchasePrice,
			diffPercent: latestPurchasePrice > 0 ? 100 : 0,
			hasChanged: latestPurchasePrice > 0,
		};
	}

	const diffPercent =
		((latestPurchasePrice - ingredient.purchasePrice) /
			ingredient.purchasePrice) *
		100;

	return {
		latestPurchasePrice,
		diffPercent,
		hasChanged: Math.abs(diffPercent) > 1,
	};
}

export function roundUpToNearest(value: number, step: number) {
	if (!Number.isFinite(value) || value <= 0) {
		return 0;
	}
	return Math.ceil(value / step) * step;
}
