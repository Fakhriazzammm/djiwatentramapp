import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import {
	computeHppFromCalculation,
	computeHppMetrics,
	getIngredientPriceDelta,
	getInventoryLinkedPurchasePrice,
	roundUpToNearest,
	type HppIngredientInput,
	type HppOverheadInput,
	type InventoryCostSnapshot,
} from "./lib/hpp";

const hppIngredientValidator = v.object({
	inventoryId: v.optional(v.id("inventory")),
	ingredientName: v.string(),
	purchasePrice: v.number(),
	purchaseQuantity: v.number(),
	purchaseUnit: v.string(),
	usagePerServing: v.number(),
	usageUnit: v.string(),
	conversionFactor: v.number(),
});

const hppOverheadValidator = v.object({
	name: v.string(),
	costPerServing: v.number(),
});

type HppSourceType = "manual" | "recipe_based";
type ProductCostingStatus =
	| "linked"
	| "outdated"
	| "missing_recipe"
	| "missing_cost";

type RecipeDraft = {
	product: Doc<"products">;
	recipe: Doc<"recipes">;
	ingredients: HppIngredientInput[];
	sellingPrice: number;
	variantName?: string;
};

function mapById<T extends { _id: string }>(items: T[]) {
	return Object.fromEntries(items.map((item) => [item._id, item])) as Record<
		string,
		T
	>;
}

function sortLinkedCalculations(
	calculations: Doc<"hppCalculations">[]
): Doc<"hppCalculations">[] {
	return [...calculations].sort((left, right) => {
		const rightTimestamp = right.updatedAt ?? right.createdAt;
		const leftTimestamp = left.updatedAt ?? left.createdAt;
		return rightTimestamp - leftTimestamp;
	});
}

function pickLatestCalculationForProduct(
	calculations: Doc<"hppCalculations">[],
	productId: Id<"products">
) {
	return sortLinkedCalculations(
		calculations.filter((calculation) => calculation.productId === productId)
	)[0] ?? null;
}

async function loadInventoryCostMap(
	ctx: QueryCtx | MutationCtx
): Promise<Record<string, InventoryCostSnapshot>> {
	const inventoryItems = await ctx.db.query("inventory").collect();
	const result: Record<string, InventoryCostSnapshot> = {};

	for (const item of inventoryItems) {
		const transactions = await ctx.db
			.query("inventoryTransactions")
			.withIndex("by_inventory", (q) => q.eq("inventoryId", item._id))
			.order("desc")
			.collect();

		const restocks = transactions.filter(
			(transaction) =>
				transaction.type === "restock" && transaction.costPerUnit != null
		);
		const latestRestock = restocks[0];

		let avgCostPerUnit: number | undefined;
		if (restocks.length > 0) {
			const totalCost = restocks.reduce(
				(sum, transaction) =>
					sum + (transaction.costPerUnit ?? 0) * transaction.quantity,
				0
			);
			const totalQuantity = restocks.reduce(
				(sum, transaction) => sum + transaction.quantity,
				0
			);
			avgCostPerUnit = totalQuantity > 0 ? totalCost / totalQuantity : undefined;
		}

		result[item._id] = {
			inventoryId: item._id,
			ingredientName: item.ingredientName,
			unit: item.unit,
			displayUnit: item.displayUnit,
			conversionFactor: item.conversionFactor,
			latestCostPerUnit: latestRestock?.costPerUnit,
			latestRestockDate: latestRestock?.timestamp,
			avgCostPerUnit,
		};
	}

	return result;
}

async function getRecipeWithFallback(
	ctx: QueryCtx | MutationCtx,
	productId: Id<"products">,
	variantName?: string
) {
	const exactRecipe = await ctx.db
		.query("recipes")
		.withIndex("by_product_variant", (q) =>
			q.eq("productId", productId).eq("variantName", variantName)
		)
		.first();

	if (exactRecipe) {
		return exactRecipe;
	}

	if (variantName !== undefined) {
		return await ctx.db
			.query("recipes")
			.withIndex("by_product_variant", (q) =>
				q.eq("productId", productId).eq("variantName", undefined)
			)
			.first();
	}

	return null;
}

async function buildRecipeDraft(
	ctx: QueryCtx | MutationCtx,
	productId: Id<"products">,
	variantName?: string
): Promise<RecipeDraft | null> {
	const [product, recipe, inventoryItems, inventoryCosts] = await Promise.all([
		ctx.db.get(productId),
		getRecipeWithFallback(ctx, productId, variantName),
		ctx.db.query("inventory").collect(),
		loadInventoryCostMap(ctx),
	]);

	if (!product || !recipe) {
		return null;
	}

	const inventoryById = mapById(inventoryItems);
	const ingredients: HppIngredientInput[] = [];

	for (const recipeIngredient of recipe.ingredients) {
		const inventoryItem = inventoryById[recipeIngredient.inventoryId];
		if (!inventoryItem) {
			continue;
		}

		const conversionFactor = inventoryItem.conversionFactor ?? 1;
		const purchaseUnit = inventoryItem.displayUnit ?? inventoryItem.unit;
		const latestCost = inventoryCosts[recipeIngredient.inventoryId]?.latestCostPerUnit;
		const purchasePrice = getInventoryLinkedPurchasePrice(
			{
				ingredientName: inventoryItem.ingredientName,
				purchasePrice: 0,
				purchaseQuantity: 1,
				purchaseUnit,
				usagePerServing: recipeIngredient.amount,
				usageUnit: inventoryItem.unit,
				conversionFactor,
				inventoryId: inventoryItem._id,
			},
			latestCost
		);

		ingredients.push({
			inventoryId: inventoryItem._id,
			ingredientName: inventoryItem.ingredientName,
			purchasePrice,
			purchaseQuantity: 1,
			purchaseUnit,
			usagePerServing: recipeIngredient.amount,
			usageUnit: inventoryItem.unit,
			conversionFactor,
		});
	}

	return {
		product,
		recipe,
		ingredients,
		sellingPrice: product.promoPrice ?? product.price,
		variantName,
	};
}

function buildHppInsertDocument(args: {
	name: string;
	description?: string;
	ingredients: HppIngredientInput[];
	overheadCosts: HppOverheadInput[];
	servingsPerBatch: number;
	sellingPrice: number;
	productId?: Id<"products">;
	sourceType?: HppSourceType;
	createdAt: number;
	updatedAt: number;
	lastCostSyncAt?: number;
	lastRecipeSyncAt?: number;
}) {
	return {
		name: args.name,
		...(args.description !== undefined ? { description: args.description } : {}),
		ingredients: args.ingredients,
		overheadCosts: args.overheadCosts,
		servingsPerBatch: args.servingsPerBatch,
		sellingPrice: args.sellingPrice,
		...(args.productId !== undefined ? { productId: args.productId } : {}),
		...(args.sourceType !== undefined ? { sourceType: args.sourceType } : {}),
		...(args.lastCostSyncAt !== undefined
			? { lastCostSyncAt: args.lastCostSyncAt }
			: {}),
		...(args.lastRecipeSyncAt !== undefined
			? { lastRecipeSyncAt: args.lastRecipeSyncAt }
			: {}),
		createdAt: args.createdAt,
		updatedAt: args.updatedAt,
	};
}

function getProductCostingStatus(input: {
	recipe: Doc<"recipes"> | null;
	calculation: Doc<"hppCalculations"> | null;
	missingInventoryLinks: number;
	missingCostCount: number;
	outdatedIngredientCount: number;
}): { status: ProductCostingStatus; reason: string } {
	if (!input.recipe) {
		return {
			status: "missing_recipe",
			reason: "Produk belum punya recipe yang bisa dipakai untuk costing.",
		};
	}

	if (!input.calculation) {
		return {
			status: "missing_cost",
			reason: "Recipe sudah ada, tetapi HPP produk ini belum dibuat.",
		};
	}

	if (input.missingInventoryLinks > 0) {
		return {
			status: "missing_cost",
			reason: "Masih ada bahan manual yang belum terhubung ke inventory.",
		};
	}

	if (input.missingCostCount > 0) {
		return {
			status: "missing_cost",
			reason: "Ada bahan yang belum punya histori harga terbaru.",
		};
	}

	if (input.outdatedIngredientCount > 0) {
		return {
			status: "outdated",
			reason: "Harga bahan berubah dan costing perlu disinkronkan ulang.",
		};
	}

	return {
		status: "linked",
		reason: "Costing produk sudah tersinkron dengan recipe dan inventory.",
	};
}

function getStatusOrder(status: ProductCostingStatus) {
	switch (status) {
		case "outdated":
			return 0;
		case "missing_cost":
			return 1;
		case "missing_recipe":
			return 2;
		case "linked":
		default:
			return 3;
	}
}

export const getHppCalculations = query({
	args: {},
	handler: async (ctx) => {
		const calculations = await ctx.db.query("hppCalculations").collect();
		return sortLinkedCalculations(calculations);
	},
});

export const getHppCalculation = query({
	args: { id: v.id("hppCalculations") },
	handler: async (ctx, args) => {
		return await ctx.db.get(args.id);
	},
});

export const getHppByProduct = query({
	args: { productId: v.id("products") },
	handler: async (ctx, args) => {
		const linkedCalculations = await ctx.db
			.query("hppCalculations")
			.withIndex("by_product", (q) => q.eq("productId", args.productId))
			.collect();
		return pickLatestCalculationForProduct(linkedCalculations, args.productId);
	},
});

export const getLatestInventoryCosts = query({
	args: {},
	handler: async (ctx) => {
		return await loadInventoryCostMap(ctx);
	},
});

export const generateHppFromRecipe = query({
	args: { productId: v.id("products"), variantName: v.optional(v.string()) },
	handler: async (ctx, args) => {
		const draft = await buildRecipeDraft(ctx, args.productId, args.variantName);
		if (!draft) {
			return null;
		}

		return {
			productId: draft.product._id,
			productName: draft.product.name,
			sellingPrice: draft.sellingPrice,
			ingredients: draft.ingredients,
			variantName: args.variantName,
		};
	},
});

export const getProductsWithRecipes = query({
	args: {},
	handler: async (ctx) => {
		const recipes = await ctx.db.query("recipes").collect();
		const uniqueProductIds = [...new Set(recipes.map((recipe) => recipe.productId))];
		const results: {
			product: Doc<"products">;
			variants: string[];
		}[] = [];

		for (const productId of uniqueProductIds) {
			const product = await ctx.db.get(productId);
			if (!product) {
				continue;
			}

			const productRecipes = recipes.filter((recipe) => recipe.productId === productId);
			results.push({
				product,
				variants: productRecipes
					.map((recipe) => recipe.variantName)
					.filter((variant): variant is string => variant != null),
			});
		}

		return results.sort((left, right) =>
			left.product.name.localeCompare(right.product.name)
		);
	},
});

export const createHppCalculation = mutation({
	args: {
		name: v.string(),
		description: v.optional(v.string()),
		ingredients: v.array(hppIngredientValidator),
		overheadCosts: v.array(hppOverheadValidator),
		servingsPerBatch: v.number(),
		sellingPrice: v.number(),
		productId: v.optional(v.id("products")),
		sourceType: v.optional(v.union(v.literal("manual"), v.literal("recipe_based"))),
	},
	handler: async (ctx, args) => {
		const now = Date.now();
		return await ctx.db.insert(
			"hppCalculations",
			buildHppInsertDocument({
				...args,
				sourceType: args.sourceType ?? "manual",
				createdAt: now,
				updatedAt: now,
			})
		);
	},
});

export const updateHppCalculation = mutation({
	args: {
		id: v.id("hppCalculations"),
		name: v.string(),
		description: v.optional(v.string()),
		ingredients: v.array(hppIngredientValidator),
		overheadCosts: v.array(hppOverheadValidator),
		servingsPerBatch: v.number(),
		sellingPrice: v.number(),
		productId: v.optional(v.id("products")),
		sourceType: v.optional(v.union(v.literal("manual"), v.literal("recipe_based"))),
	},
	handler: async (ctx, args) => {
		const current = await ctx.db.get(args.id);
		if (!current) {
			throw new Error("HPP calculation not found");
		}

		const { id, ...nextData } = args;
		await ctx.db.replace(
			id,
			buildHppInsertDocument({
				name: nextData.name,
				description: nextData.description,
				ingredients: nextData.ingredients,
				overheadCosts: nextData.overheadCosts,
				servingsPerBatch: nextData.servingsPerBatch,
				sellingPrice: nextData.sellingPrice,
				productId: nextData.productId,
				sourceType: nextData.sourceType ?? current.sourceType ?? "manual",
				createdAt: current.createdAt,
				updatedAt: Date.now(),
				lastCostSyncAt: current.lastCostSyncAt,
				lastRecipeSyncAt: current.lastRecipeSyncAt,
			})
		);
	},
});

export const deleteHppCalculation = mutation({
	args: { id: v.id("hppCalculations") },
	handler: async (ctx, args) => {
		await ctx.db.delete(args.id);
	},
});

export const syncHppWithInventoryPrices = mutation({
	args: { id: v.id("hppCalculations") },
	handler: async (ctx, args) => {
		const calculation = await ctx.db.get(args.id);
		if (!calculation) {
			throw new Error("HPP calculation not found");
		}

		const inventoryCosts = await loadInventoryCostMap(ctx);
		let updatedCount = 0;

		const ingredients = calculation.ingredients.map((ingredient) => {
			if (!ingredient.inventoryId) {
				return ingredient;
			}

			const latestCostPerUnit =
				inventoryCosts[ingredient.inventoryId]?.latestCostPerUnit;
			if (latestCostPerUnit == null) {
				return ingredient;
			}

			const nextPurchasePrice = getInventoryLinkedPurchasePrice(
				ingredient,
				latestCostPerUnit
			);
			if (nextPurchasePrice === ingredient.purchasePrice) {
				return ingredient;
			}

			updatedCount += 1;
			return {
				...ingredient,
				purchasePrice: nextPurchasePrice,
			};
		});

		if (updatedCount > 0) {
			await ctx.db.patch(args.id, {
				ingredients,
				updatedAt: Date.now(),
				lastCostSyncAt: Date.now(),
			});
		}

		return { updatedCount };
	},
});

export const upsertHppFromRecipe = mutation({
	args: {
		productId: v.id("products"),
		variantName: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const draft = await buildRecipeDraft(ctx, args.productId, args.variantName);
		if (!draft) {
			throw new Error("Recipe untuk produk ini belum tersedia");
		}

		const existingCalculations = await ctx.db
			.query("hppCalculations")
			.withIndex("by_product", (q) => q.eq("productId", args.productId))
			.collect();
		const existing = pickLatestCalculationForProduct(
			existingCalculations,
			args.productId
		);

		const missingCostCount = draft.ingredients.filter(
			(ingredient) => ingredient.purchasePrice <= 0
		).length;
		const now = Date.now();
		const nameSuffix = draft.variantName ? ` (${draft.variantName})` : "";
		const description = `Sinkron dari recipe ${draft.product.name}${nameSuffix}`;
		const overheadCosts = existing?.overheadCosts ?? [];
		const servingsPerBatch = existing?.servingsPerBatch ?? 1;

		if (existing) {
			await ctx.db.patch(existing._id, {
				name: existing.name || `HPP ${draft.product.name}${nameSuffix}`,
				description,
				ingredients: draft.ingredients,
				overheadCosts,
				servingsPerBatch,
				sellingPrice: draft.sellingPrice,
				sourceType: "recipe_based",
				updatedAt: now,
				lastCostSyncAt: now,
				lastRecipeSyncAt: now,
			});

			return {
				id: existing._id,
				created: false,
				ingredientCount: draft.ingredients.length,
				missingCostCount,
			};
		}

		const createdId = await ctx.db.insert(
			"hppCalculations",
			buildHppInsertDocument({
				name: `HPP ${draft.product.name}${nameSuffix}`,
				description,
				ingredients: draft.ingredients,
				overheadCosts,
				servingsPerBatch,
				sellingPrice: draft.sellingPrice,
				productId: draft.product._id,
				sourceType: "recipe_based",
				createdAt: now,
				updatedAt: now,
				lastCostSyncAt: now,
				lastRecipeSyncAt: now,
			})
		);

		return {
			id: createdId,
			created: true,
			ingredientCount: draft.ingredients.length,
			missingCostCount,
		};
	},
});

export const applyHppSellingPriceToProduct = mutation({
	args: {
		id: v.id("hppCalculations"),
		sellingPrice: v.number(),
		syncProductPrice: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const calculation = await ctx.db.get(args.id);
		if (!calculation) {
			throw new Error("HPP calculation not found");
		}

		await ctx.db.patch(args.id, {
			sellingPrice: args.sellingPrice,
			updatedAt: Date.now(),
		});

		let productUpdated = false;
		if (args.syncProductPrice && calculation.productId) {
			const product = await ctx.db.get(calculation.productId);
			if (product) {
				if (product.promoPrice != null) {
					await ctx.db.patch(product._id, { promoPrice: args.sellingPrice });
				} else {
					await ctx.db.patch(product._id, { price: args.sellingPrice });
				}
				productUpdated = true;
			}
		}

		return {
			productUpdated,
			productId: calculation.productId,
		};
	},
});

export const getHppProductMap = query({
	args: {},
	handler: async (ctx) => {
		const calculations = await ctx.db.query("hppCalculations").collect();
		const result: Record<
			string,
			{
				hppId: string;
				name: string;
				hppPerServing: number;
				sellingPrice: number;
				profitPerServing: number;
				marginPercent: number;
			}
		> = {};

		const latestLinkedCalculations = sortLinkedCalculations(
			calculations.filter((calculation) => calculation.productId != null)
		);

		for (const calculation of latestLinkedCalculations) {
			if (!calculation.productId || result[calculation.productId]) {
				continue;
			}
			const metrics = computeHppFromCalculation(calculation);
			result[calculation.productId] = {
				hppId: calculation._id,
				name: calculation.name,
				hppPerServing: metrics.totalHppPerServing,
				sellingPrice: calculation.sellingPrice,
				profitPerServing: metrics.profitPerServing,
				marginPercent: metrics.marginPercent,
			};
		}

		for (const calculation of calculations) {
			if (result[calculation._id]) {
				continue;
			}
			const metrics = computeHppFromCalculation(calculation);
			result[calculation._id] = {
				hppId: calculation._id,
				name: calculation.name,
				hppPerServing: metrics.totalHppPerServing,
				sellingPrice: calculation.sellingPrice,
				profitPerServing: metrics.profitPerServing,
				marginPercent: metrics.marginPercent,
			};
		}

		return result;
	},
});

export const getHppDashboardData = query({
	args: {},
	handler: async (ctx) => {
		const calculations = await ctx.db.query("hppCalculations").collect();

		if (calculations.length === 0) {
			return {
				totalCalculations: 0,
				avgMargin: 0,
				lowMarginAlerts: [],
				topProfit: [],
				bottomProfit: [],
			};
		}

		const analyzed = calculations.map((calculation) => {
			const metrics = computeHppFromCalculation(calculation);
			return {
				id: calculation._id,
				name: calculation.name,
				productId: calculation.productId,
				hppPerServing: metrics.totalHppPerServing,
				sellingPrice: calculation.sellingPrice,
				profitPerServing: metrics.profitPerServing,
				marginPercent: metrics.marginPercent,
			};
		});

		const avgMargin =
			analyzed.reduce((sum, item) => sum + item.marginPercent, 0) /
			analyzed.length;

		const lowMarginAlerts = analyzed
			.filter((item) => item.marginPercent < 20 && item.sellingPrice > 0)
			.sort((left, right) => left.marginPercent - right.marginPercent);

		const topProfit = [...analyzed]
			.sort((left, right) => right.profitPerServing - left.profitPerServing)
			.slice(0, 5);

		const bottomProfit = [...analyzed]
			.filter((item) => item.sellingPrice > 0)
			.sort((left, right) => left.profitPerServing - right.profitPerServing)
			.slice(0, 5);

		return {
			totalCalculations: calculations.length,
			avgMargin,
			lowMarginAlerts,
			topProfit,
			bottomProfit,
		};
	},
});

export const getOrdersCogs = query({
	args: {
		startDate: v.optional(v.number()),
		endDate: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const calculations = await ctx.db.query("hppCalculations").collect();
		const latestLinkedCalculations = sortLinkedCalculations(
			calculations.filter((calculation) => calculation.productId != null)
		);

		const hppByProduct: Record<string, number> = {};
		for (const calculation of latestLinkedCalculations) {
			if (!calculation.productId || hppByProduct[calculation.productId] != null) {
				continue;
			}
			hppByProduct[calculation.productId] =
				computeHppFromCalculation(calculation).totalHppPerServing;
		}

		let orders: Doc<"orders">[];
		if (args.startDate !== undefined && args.endDate !== undefined) {
			orders = await ctx.db
				.query("orders")
				.withIndex("by_createdAt", (q) =>
					q.gte("createdAt", args.startDate!).lte("createdAt", args.endDate!)
				)
				.collect();
		} else if (args.startDate !== undefined) {
			orders = await ctx.db
				.query("orders")
				.withIndex("by_createdAt", (q) => q.gte("createdAt", args.startDate!))
				.collect();
		} else if (args.endDate !== undefined) {
			orders = await ctx.db
				.query("orders")
				.withIndex("by_createdAt", (q) => q.lte("createdAt", args.endDate!))
				.collect();
		} else {
			orders = await ctx.db.query("orders").order("desc").collect();
		}

		const completedOrders = orders.filter(
			(order) => order.status === "completed" || order.status === "paid"
		);

		let totalRevenue = 0;
		let totalCogs = 0;
		let matchedOrders = 0;

		const orderProfits: {
			orderId: string;
			orderNumber: string;
			revenue: number;
			cogs: number;
			profit: number;
			createdAt: number;
		}[] = [];

		for (const order of completedOrders) {
			let orderCogs = 0;
			let hasMatchedSnapshot = false;

			for (const item of order.items) {
				if (item.hppSnapshot?.totalHpp != null) {
					orderCogs += item.hppSnapshot.totalHpp;
					hasMatchedSnapshot = true;
					continue;
				}

				const liveHppPerUnit = hppByProduct[item.productId];
				if (liveHppPerUnit != null) {
					orderCogs += liveHppPerUnit * item.quantity;
					hasMatchedSnapshot = true;
				}
			}

			if (!hasMatchedSnapshot) {
				continue;
			}

			matchedOrders += 1;
			totalRevenue += order.totalAmount;
			totalCogs += orderCogs;
			orderProfits.push({
				orderId: order._id,
				orderNumber: order.orderNumber,
				revenue: order.totalAmount,
				cogs: orderCogs,
				profit: order.totalAmount - orderCogs,
				createdAt: order.createdAt,
			});
		}

		const dailySummary: Record<
			string,
			{
				date: string;
				revenue: number;
				cogs: number;
				profit: number;
				orders: number;
			}
		> = {};

		for (const orderProfit of orderProfits) {
			const dateKey = new Date(orderProfit.createdAt)
				.toISOString()
				.split("T")[0] as string;
			if (!dailySummary[dateKey]) {
				dailySummary[dateKey] = {
					date: dateKey,
					revenue: 0,
					cogs: 0,
					profit: 0,
					orders: 0,
				};
			}

			dailySummary[dateKey].revenue += orderProfit.revenue;
			dailySummary[dateKey].cogs += orderProfit.cogs;
			dailySummary[dateKey].profit += orderProfit.profit;
			dailySummary[dateKey].orders += 1;
		}

		return {
			totalRevenue,
			totalCogs,
			totalProfit: totalRevenue - totalCogs,
			grossMargin:
				totalRevenue > 0
					? ((totalRevenue - totalCogs) / totalRevenue) * 100
					: 0,
			matchedOrders,
			totalCompletedOrders: completedOrders.length,
			recentOrderProfits: orderProfits
				.sort((left, right) => right.createdAt - left.createdAt)
				.slice(0, 20),
			dailySummary: Object.values(dailySummary).sort((left, right) =>
				right.date.localeCompare(left.date)
			),
		};
	},
});

export const updateHppSellingPrice = mutation({
	args: {
		id: v.id("hppCalculations"),
		sellingPrice: v.number(),
	},
	handler: async (ctx, args) => {
		await ctx.db.patch(args.id, {
			sellingPrice: args.sellingPrice,
			updatedAt: Date.now(),
		});
	},
});

export const simulateHppPriceChange = query({
	args: {
		id: v.id("hppCalculations"),
		priceChangePercent: v.number(),
		ingredientIndex: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const calculation = await ctx.db.get(args.id);
		if (!calculation) {
			return null;
		}

		const changeMultiplier = 1 + args.priceChangePercent / 100;
		const simulatedIngredients = calculation.ingredients.map(
			(ingredient, ingredientIndex) => {
				if (
					args.ingredientIndex !== undefined &&
					ingredientIndex !== args.ingredientIndex
				) {
					return ingredient;
				}

				return {
					...ingredient,
					purchasePrice: ingredient.purchasePrice * changeMultiplier,
				};
			}
		);

		const original = computeHppFromCalculation(calculation);
		const simulated = computeHppMetrics({
			ingredients: simulatedIngredients,
			overheadCosts: calculation.overheadCosts,
			servingsPerBatch: calculation.servingsPerBatch,
			sellingPrice: calculation.sellingPrice,
		});

		const recommendedSellingPrice = roundUpToNearest(
			simulated.totalHppPerServing / (1 - original.marginPercent / 100),
			100
		);

		return {
			hppId: calculation._id,
			name: calculation.name,
			priceChangePercent: args.priceChangePercent,
			ingredientIndex: args.ingredientIndex,
			original: {
				hppPerServing: original.totalHppPerServing,
				sellingPrice: calculation.sellingPrice,
				profitPerServing: original.profitPerServing,
				marginPercent: original.marginPercent,
			},
			simulated: {
				hppPerServing: simulated.totalHppPerServing,
				sellingPrice: calculation.sellingPrice,
				profitPerServing: simulated.profitPerServing,
				marginPercent: simulated.marginPercent,
			},
			delta: {
				hppDelta:
					simulated.totalHppPerServing - original.totalHppPerServing,
				profitDelta:
					simulated.profitPerServing - original.profitPerServing,
				marginDelta: simulated.marginPercent - original.marginPercent,
			},
			recommendedSellingPrice,
		};
	},
});

export const getHppWithMarginAnalysis = query({
	args: { targetMarginPercent: v.optional(v.number()) },
	handler: async (ctx, args) => {
		const targetMargin = args.targetMarginPercent ?? 30;
		const calculations = await ctx.db.query("hppCalculations").collect();

		return sortLinkedCalculations(calculations).map((calculation) => {
			const metrics = computeHppFromCalculation(calculation);
			const recommendedSellingPrice = roundUpToNearest(
				metrics.totalHppPerServing / (1 - targetMargin / 100),
				100
			);
			const priceDiff = recommendedSellingPrice - calculation.sellingPrice;

			return {
				id: calculation._id,
				name: calculation.name,
				productId: calculation.productId,
				hppPerServing: metrics.totalHppPerServing,
				currentSellingPrice: calculation.sellingPrice,
				currentMarginPercent: metrics.marginPercent,
				currentProfitPerServing: metrics.profitPerServing,
				targetMarginPercent: targetMargin,
				recommendedSellingPrice,
				priceDiff,
				isLowMargin: metrics.marginPercent < targetMargin,
				status:
					metrics.marginPercent >= targetMargin
						? "ok"
						: metrics.marginPercent >= targetMargin * 0.7
							? "warning"
							: "critical",
			};
		});
	},
});

export const getHppForecast = query({
	args: { days: v.optional(v.number()) },
	handler: async (ctx, args) => {
		const forecastDays = args.days ?? 30;
		const calculations = await ctx.db.query("hppCalculations").collect();
		const orders = await ctx.db.query("orders").order("desc").collect();
		const latestLinkedCalculations = sortLinkedCalculations(
			calculations.filter((calculation) => calculation.productId != null)
		);

		const hppByProduct: Record<
			string,
			{
				ingredients: {
					ingredientName: string;
					usagePerServing: number;
					usageUnit: string;
					costPerServing: number;
				}[];
			}
		> = {};

		for (const calculation of latestLinkedCalculations) {
			if (!calculation.productId || hppByProduct[calculation.productId]) {
				continue;
			}
			hppByProduct[calculation.productId] = {
				ingredients: calculation.ingredients.map((ingredient) => ({
					ingredientName: ingredient.ingredientName,
					usagePerServing: ingredient.usagePerServing,
					usageUnit: ingredient.usageUnit,
					costPerServing:
						(ingredient.purchaseQuantity * ingredient.conversionFactor > 0
							? ingredient.purchasePrice /
								(ingredient.purchaseQuantity * ingredient.conversionFactor)
							: 0) * ingredient.usagePerServing,
				})),
			};
		}

		const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
		const recentOrders = orders.filter(
			(order) =>
				(order.status === "completed" || order.status === "paid") &&
				order.createdAt >= sevenDaysAgo
		);

		const dailyUsage: Record<
			string,
			{ name: string; totalQty: number; unit: string; totalCost: number }
		> = {};

		for (const order of recentOrders) {
			for (const item of order.items) {
				const hpp = hppByProduct[item.productId];
				if (!hpp) {
					continue;
				}

				for (const ingredient of hpp.ingredients) {
					const usageKey = ingredient.ingredientName;
					if (!dailyUsage[usageKey]) {
						dailyUsage[usageKey] = {
							name: ingredient.ingredientName,
							totalQty: 0,
							unit: ingredient.usageUnit,
							totalCost: 0,
						};
					}

					dailyUsage[usageKey].totalQty +=
						ingredient.usagePerServing * item.quantity;
					dailyUsage[usageKey].totalCost +=
						ingredient.costPerServing * item.quantity;
				}
			}
		}

		const daysWithData = Math.max(
			1,
			Math.min(
				7,
				new Set(
					recentOrders.map((order) =>
						new Date(order.createdAt).toISOString().split("T")[0]
					)
				).size
			)
		);

		const ingredients = Object.values(dailyUsage)
			.map((item) => ({
				ingredientName: item.name,
				unit: item.unit,
				avgDailyUsage: item.totalQty / daysWithData,
				avgDailyCost: item.totalCost / daysWithData,
				forecastUsage: (item.totalQty / daysWithData) * forecastDays,
				forecastCost: (item.totalCost / daysWithData) * forecastDays,
			}))
			.sort((left, right) => right.forecastCost - left.forecastCost);

		return {
			forecastDays,
			daysWithData,
			totalForecastCost: ingredients.reduce(
				(sum, ingredient) => sum + ingredient.forecastCost,
				0
			),
			ingredients,
		};
	},
});

export const getHppPortfolio = query({
	args: {},
	handler: async (ctx) => {
		const [products, recipes, calculations, inventoryItems, inventoryCosts] =
			await Promise.all([
				ctx.db.query("products").collect(),
				ctx.db.query("recipes").collect(),
				ctx.db.query("hppCalculations").collect(),
				ctx.db.query("inventory").collect(),
				loadInventoryCostMap(ctx),
			]);

		const inventoryById = mapById(inventoryItems);
		const latestLinkedCalculations = sortLinkedCalculations(
			calculations.filter((calculation) => calculation.productId != null)
		);
		const linkedCalculationByProduct: Record<string, Doc<"hppCalculations">> = {};

		for (const calculation of latestLinkedCalculations) {
			if (!calculation.productId || linkedCalculationByProduct[calculation.productId]) {
				continue;
			}
			linkedCalculationByProduct[calculation.productId] = calculation;
		}

		const portfolio = products
			.map((product) => {
				const productRecipes = recipes.filter(
					(recipe) => recipe.productId === product._id
				);
				const recipe =
					productRecipes.find((candidate) => candidate.variantName == null) ??
					productRecipes[0] ??
					null;
				const calculation = linkedCalculationByProduct[product._id] ?? null;

				const recipeItems =
					recipe?.ingredients.map((ingredient) => {
						const inventoryItem = inventoryById[ingredient.inventoryId];
						const latestCostPerUnit =
							inventoryCosts[ingredient.inventoryId]?.latestCostPerUnit;
						return {
							inventoryId: ingredient.inventoryId,
							ingredientName:
								inventoryItem?.ingredientName ?? "Bahan tidak ditemukan",
							amount: ingredient.amount,
							unit: inventoryItem?.unit ?? "-",
							displayUnit: inventoryItem?.displayUnit,
							conversionFactor: inventoryItem?.conversionFactor ?? 1,
							latestCostPerUnit,
							currentStock: inventoryItem?.quantity,
						};
					}) ?? [];

				const missingInventoryLinks =
					calculation?.ingredients.filter((ingredient) => !ingredient.inventoryId)
						.length ?? 0;

				const missingCostCount = calculation
					? calculation.ingredients.filter((ingredient) => {
							if (!ingredient.inventoryId) {
								return false;
							}
							return (
								inventoryCosts[ingredient.inventoryId]?.latestCostPerUnit == null
							);
						}).length
					: recipeItems.filter((ingredient) => ingredient.latestCostPerUnit == null)
							.length;

				const outdatedIngredientCount =
					calculation?.ingredients.filter((ingredient) => {
						if (!ingredient.inventoryId) {
							return false;
						}
						return (
							getIngredientPriceDelta(
								ingredient,
								inventoryCosts[ingredient.inventoryId]?.latestCostPerUnit
							)?.hasChanged ?? false
						);
					}).length ?? 0;

				const { status, reason } = getProductCostingStatus({
					recipe,
					calculation,
					missingInventoryLinks,
					missingCostCount,
					outdatedIngredientCount,
				});
				const metrics = calculation ? computeHppFromCalculation(calculation) : null;
				const targetMargin = 30;
				const recommendedSellingPrice =
					metrics != null
						? roundUpToNearest(
								metrics.totalHppPerServing / (1 - targetMargin / 100),
								100
							)
						: null;

				return {
					product,
					recipe,
					recipeItems,
					calculation,
					metrics,
					status,
					reason,
					linkedIngredientCount:
						calculation?.ingredients.filter((ingredient) => ingredient.inventoryId)
							.length ?? recipeItems.length,
					ingredientCount:
						calculation?.ingredients.length ?? recipeItems.length,
					missingInventoryLinks,
					missingCostCount,
					outdatedIngredientCount,
					recommendedSellingPrice,
				};
			})
			.sort((left, right) => {
				const statusDelta =
					getStatusOrder(left.status) - getStatusOrder(right.status);
				if (statusDelta !== 0) {
					return statusDelta;
				}

				const leftMargin = left.metrics?.marginPercent ?? Number.POSITIVE_INFINITY;
				const rightMargin =
					right.metrics?.marginPercent ?? Number.POSITIVE_INFINITY;
				if (leftMargin !== rightMargin) {
					return leftMargin - rightMargin;
				}

				return left.product.name.localeCompare(right.product.name);
			});

		const drafts = calculations
			.filter((calculation) => !calculation.productId)
			.map((calculation) => ({
				calculation,
				metrics: computeHppFromCalculation(calculation),
				status: "draft" as const,
			}))
			.sort((left, right) => {
				const rightTimestamp =
					right.calculation.updatedAt ?? right.calculation.createdAt;
				const leftTimestamp =
					left.calculation.updatedAt ?? left.calculation.createdAt;
				return rightTimestamp - leftTimestamp;
			});

		const alerts = portfolio
			.filter((row) => row.status !== "linked")
			.map((row) => ({
				productId: row.product._id,
				productName: row.product.name,
				status: row.status,
				reason: row.reason,
			}));

		const portfolioWithMetrics = portfolio.filter((row) => row.metrics != null);
		const summary = {
			totalProducts: portfolio.length,
			linkedProducts: portfolio.filter((row) => row.status === "linked").length,
			outdatedProducts: portfolio.filter((row) => row.status === "outdated").length,
			missingRecipeProducts: portfolio.filter(
				(row) => row.status === "missing_recipe"
			).length,
			missingCostProducts: portfolio.filter(
				(row) => row.status === "missing_cost"
			).length,
			draftCount: drafts.length,
			averageMargin:
				portfolioWithMetrics.reduce(
					(sum, row) => sum + (row.metrics?.marginPercent ?? 0),
					0
				) / Math.max(1, portfolioWithMetrics.length),
			lowMarginCount: portfolio.filter(
				(row) => (row.metrics?.marginPercent ?? 100) < 20
			).length,
		};

		return {
			summary,
			alerts,
			portfolio,
			drafts,
		};
	},
});
