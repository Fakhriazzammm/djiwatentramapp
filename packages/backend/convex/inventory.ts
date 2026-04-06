import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";

type StockActionArgs = {
	inventoryId: Id<"inventory">;
	quantity: number;
	notes?: string;
	costPerUnit?: number;
	timestamp?: number;
	expiryDate?: number;
};

async function performAddStock(ctx: MutationCtx, args: StockActionArgs) {
	const item = await ctx.db.get(args.inventoryId);
	if (!item) {
		throw new Error("Item not found");
	}
	if (args.quantity <= 0) {
		throw new Error("Quantity must be greater than 0");
	}

	const timestamp = args.timestamp ?? Date.now();

	await ctx.db.patch(args.inventoryId, {
		quantity: item.quantity + args.quantity,
	});

	await ctx.db.insert("inventoryTransactions", {
		inventoryId: args.inventoryId,
		quantity: args.quantity,
		remainingQuantity: args.quantity,
		type: "restock",
		timestamp,
		costPerUnit: args.costPerUnit,
		notes: args.notes,
		expiryDate: args.expiryDate,
	});
}

async function performUsageStock(
	ctx: MutationCtx,
	args: Pick<StockActionArgs, "inventoryId" | "quantity" | "notes">
) {
	const item = await ctx.db.get(args.inventoryId);
	if (!item) {
		throw new Error("Item not found");
	}
	if (args.quantity <= 0) {
		throw new Error("Quantity must be greater than 0");
	}
	if (item.quantity < args.quantity) {
		throw new Error("Stok tidak mencukupi");
	}

	await consumeStockFifo(ctx, args.inventoryId, args.quantity);

	await ctx.db.patch(args.inventoryId, {
		quantity: item.quantity - args.quantity,
	});

	await ctx.db.insert("inventoryTransactions", {
		inventoryId: args.inventoryId,
		quantity: -args.quantity,
		type: "usage",
		timestamp: Date.now(),
		notes: args.notes,
	});
}

async function performAdjustStock(
	ctx: MutationCtx,
	args: Pick<StockActionArgs, "inventoryId" | "quantity" | "notes">
) {
	const item = await ctx.db.get(args.inventoryId);
	if (!item) {
		throw new Error("Item not found");
	}
	if (args.quantity < 0) {
		throw new Error("Quantity tidak boleh negatif");
	}

	const diff = args.quantity - item.quantity;

	await ctx.db.patch(args.inventoryId, {
		quantity: args.quantity,
	});

	await ctx.db.insert("inventoryTransactions", {
		inventoryId: args.inventoryId,
		quantity: diff,
		type: "adjustment",
		timestamp: Date.now(),
		notes: args.notes,
	});
}

export const getInventory = query({
	args: {},
	handler: async (ctx) => {
		return await ctx.db.query("inventory").collect();
	},
});

export const getLowStockItems = query({
	args: {},
	handler: async (ctx) => {
		const allItems = await ctx.db.query("inventory").collect();
		return allItems
			.filter((item) => item.quantity <= item.lowStockThreshold)
			.sort((left, right) => {
				const leftGap = left.quantity - left.lowStockThreshold;
				const rightGap = right.quantity - right.lowStockThreshold;
				return leftGap - rightGap;
			});
	},
});

export const getInventoryControlTower = query({
	args: {
		daysWindow: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const daysWindow = Math.max(1, Math.min(90, args.daysWindow ?? 30));
		const msPerDay = 24 * 60 * 60 * 1000;
		const cutoff = Date.now() - daysWindow * msPerDay;

		const [items, usageRows, restockRows] = await Promise.all([
			ctx.db.query("inventory").collect(),
			ctx.db
				.query("inventoryTransactions")
				.withIndex("by_type_and_timestamp", (q) =>
					q.eq("type", "usage").gte("timestamp", cutoff)
				)
				.collect(),
			ctx.db
				.query("inventoryTransactions")
				.withIndex("by_type_and_timestamp", (q) =>
					q.eq("type", "restock").gte("timestamp", cutoff)
				)
				.collect(),
		]);

		const usageByInventoryId: Record<string, number> = {};
		for (const row of usageRows) {
			const key = row.inventoryId as string;
			usageByInventoryId[key] =
				(usageByInventoryId[key] ?? 0) + Math.abs(Number(row.quantity) || 0);
		}

		let totalStockUnits = 0;
		let lowStockCount = 0;
		let riskHighCount = 0;
		let riskMediumCount = 0;

		const planningRows = items
			.map((item) => {
				const totalUsage = usageByInventoryId[item._id as string] ?? 0;
				const avgDailyUsage = totalUsage / daysWindow;
				const daysUntilStockout =
					avgDailyUsage > 0 ? item.quantity / avgDailyUsage : Number.POSITIVE_INFINITY;
				const leadTimeDays = 3;
				const safetyDays = 2;
				const reorderPoint = Math.ceil(avgDailyUsage * (leadTimeDays + safetyDays));
				const suggestedOrderQty = Math.max(
					0,
					Math.ceil(avgDailyUsage * 7 - item.quantity)
				);

				const riskLevel =
					daysUntilStockout <= 3 || item.quantity <= item.lowStockThreshold
						? "high"
						: daysUntilStockout <= 7
							? "medium"
							: "low";

				if (riskLevel === "high") {
					riskHighCount += 1;
				} else if (riskLevel === "medium") {
					riskMediumCount += 1;
				}

				totalStockUnits += item.quantity;
				if (item.quantity <= item.lowStockThreshold) {
					lowStockCount += 1;
				}

				return {
					inventoryId: item._id,
					ingredientName: item.ingredientName,
					currentStock: item.quantity,
					unit: item.unit,
					displayUnit: item.displayUnit,
					conversionFactor: item.conversionFactor,
					lowStockThreshold: item.lowStockThreshold,
					avgDailyUsage: Number(avgDailyUsage.toFixed(2)),
					daysUntilStockout:
						daysUntilStockout === Number.POSITIVE_INFINITY
							? null
							: Number(daysUntilStockout.toFixed(1)),
					reorderPoint,
					suggestedOrderQty,
					riskLevel,
				};
			})
			.sort((left, right) => {
				const rank = { high: 0, medium: 1, low: 2 };
				const riskDiff = rank[left.riskLevel] - rank[right.riskLevel];
				if (riskDiff !== 0) {
					return riskDiff;
				}
				return left.currentStock - right.currentStock;
			});

		return {
			summary: {
				totalItems: items.length,
				totalStockUnits,
				lowStockCount,
				riskHighCount,
				riskMediumCount,
				recentUsageTxCount: usageRows.length,
				recentRestockTxCount: restockRows.length,
				daysWindow,
			},
			planningRows,
		};
	},
});

export const getInventoryItemImpact = query({
	args: {
		inventoryId: v.id("inventory"),
	},
	handler: async (ctx, args) => {
		const [item, recipes, products, baseRecipes] = await Promise.all([
			ctx.db.get(args.inventoryId),
			ctx.db.query("recipes").collect(),
			ctx.db.query("products").collect(),
			ctx.db.query("baseRecipes").collect(),
		]);

		if (!item) {
			throw new Error("Item not found");
		}

		const impactedRecipes = recipes.filter((recipe) =>
			recipe.ingredients.some((ingredient) => ingredient.inventoryId === args.inventoryId)
		);
		const productById = new Map<string, Doc<"products">>();
		for (const product of products) {
			productById.set(product._id as string, product);
		}

		const impactedProducts = impactedRecipes
			.map((recipe) => {
				const linkedProduct = productById.get(recipe.productId as string);
				if (!linkedProduct) {
					return null;
				}
				return {
					productId: linkedProduct._id,
					productName: linkedProduct.name,
					variantName: recipe.variantName,
					isAvailable: linkedProduct.isAvailable,
				};
			})
			.filter((row): row is NonNullable<typeof row> => row !== null);

		const consumedByBaseRecipes = baseRecipes
			.filter((baseRecipe) =>
				baseRecipe.ingredients.some(
					(ingredient) => ingredient.inventoryId === args.inventoryId
				)
			)
			.map((baseRecipe) => ({
				baseRecipeId: baseRecipe._id,
				baseRecipeName: baseRecipe.name,
				targetQuantity: baseRecipe.targetQuantity,
				targetUnit: baseRecipe.targetUnit,
			}));

		const producedByBaseRecipe =
			item.baseRecipeId != null
				? baseRecipes.find((recipe) => recipe._id === item.baseRecipeId) ?? null
				: null;

		return {
			item: {
				inventoryId: item._id,
				ingredientName: item.ingredientName,
				quantity: item.quantity,
				unit: item.unit,
				lowStockThreshold: item.lowStockThreshold,
			},
			impact: {
				productCount: impactedProducts.length,
				recipeCount: impactedRecipes.length,
				consumedByBaseRecipeCount: consumedByBaseRecipes.length,
				producedByBaseRecipeName: producedByBaseRecipe?.name ?? null,
				impactedProducts,
				consumedByBaseRecipes,
			},
		};
	},
});

export const getInventoryTransactions = query({
	args: { inventoryId: v.id("inventory") },
	handler: async (ctx, args) => {
		return await ctx.db
			.query("inventoryTransactions")
			.withIndex("by_inventory", (q) => q.eq("inventoryId", args.inventoryId))
			.order("desc")
			.collect();
	},
});

export const createInventoryItem = mutation({
	args: {
		ingredientName: v.string(),
		unit: v.string(),
		quantity: v.number(),
		lowStockThreshold: v.number(),
		displayUnit: v.optional(v.string()),
		conversionFactor: v.optional(v.number()),
		baseRecipeId: v.optional(v.id("baseRecipes")),
		initialStockTimestamp: v.optional(v.number()),
		costPerUnit: v.optional(v.number()),
		notes: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const {
			initialStockTimestamp,
			costPerUnit,
			notes,
			...inventoryData
		} = args;
		const inventoryId = await ctx.db.insert("inventory", inventoryData);

		if (args.quantity > 0) {
			await ctx.db.insert("inventoryTransactions", {
				inventoryId,
				quantity: args.quantity,
				remainingQuantity: args.quantity,
				type: "restock",
				timestamp: initialStockTimestamp ?? Date.now(),
				costPerUnit,
				notes,
			});
		}

		return inventoryId;
	},
});

export const addStock = mutation({
	args: {
		inventoryId: v.id("inventory"),
		quantity: v.number(), // Amount to add
		costPerUnit: v.optional(v.number()),
		notes: v.optional(v.string()),
		timestamp: v.optional(v.number()),
		expiryDate: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		await performAddStock(ctx, args);
	},
});

export const usageStock = mutation({
	args: {
		inventoryId: v.id("inventory"),
		quantity: v.number(), // Amount used
		notes: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		await performUsageStock(ctx, args);
	},
});

export const updateInventoryItem = mutation({
	args: {
		id: v.id("inventory"),
		ingredientName: v.string(),
		unit: v.string(),
		lowStockThreshold: v.number(),
		displayUnit: v.optional(v.string()),
		conversionFactor: v.optional(v.number()),
		baseRecipeId: v.optional(v.id("baseRecipes")),
	},
	handler: async (ctx, args) => {
		const { id, ...data } = args;
		await ctx.db.patch(id, data);
	},
});

export const deleteInventoryItem = mutation({
	args: { id: v.id("inventory") },
	handler: async (ctx, args) => {
		// Check if used in any recipes
		const recipes = await ctx.db.query("recipes").collect();

		const isUsed = recipes.some((r) =>
			r.ingredients.some((i) => i.inventoryId === args.id)
		);

		if (isUsed) {
			throw new Error(
				"Cannot delete item that is used in a recipe. Please remove it from recipes first."
			);
		}

		await ctx.db.delete(args.id);
	},
});

export const adjustStock = mutation({
	args: {
		inventoryId: v.id("inventory"),
		quantity: v.number(), // The new total quantity
		notes: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		await performAdjustStock(ctx, args);
	},
});

export const applyInventoryStockAction = mutation({
	args: {
		inventoryId: v.id("inventory"),
		action: v.union(v.literal("add"), v.literal("usage"), v.literal("adjust")),
		quantity: v.number(),
		notes: v.optional(v.string()),
		costPerUnit: v.optional(v.number()),
		timestamp: v.optional(v.number()),
		expiryDate: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		if (args.action === "add") {
			await performAddStock(ctx, args);
			return;
		}
		if (args.action === "usage") {
			await performUsageStock(ctx, args);
			return;
		}
		await performAdjustStock(ctx, args);
	},
});

export const getRecipes = query({
	args: {},
	handler: async (ctx) => {
		return await ctx.db.query("recipes").collect();
	},
});

export const getRecipeForProduct = query({
	args: {
		productId: v.id("products"),
		variantName: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const recipe = await ctx.db
			.query("recipes")
			.withIndex("by_product_variant", (q) =>
				q.eq("productId", args.productId).eq("variantName", args.variantName)
			)
			.first();
		return recipe;
	},
});

export const saveRecipe = mutation({
	args: {
		productId: v.id("products"),
		variantName: v.optional(v.string()),
		ingredients: v.array(
			v.object({
				inventoryId: v.id("inventory"),
				amount: v.number(),
			})
		),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query("recipes")
			.withIndex("by_product_variant", (q) =>
				q.eq("productId", args.productId).eq("variantName", args.variantName)
			)
			.first();

		if (existing) {
			await ctx.db.patch(existing._id, { ingredients: args.ingredients });
			return existing._id;
		}

		return await ctx.db.insert("recipes", {
			productId: args.productId,
			variantName: args.variantName,
			ingredients: args.ingredients,
		});
	},
});

export const deductStockForOrder = mutation({
	args: {
		orderId: v.id("orders"),
	},
	handler: async (ctx, args) => {
		await deductStockForOrderInternal(ctx, args);
	},
});

export async function deductStockForOrderInternal(
	ctx: MutationCtx,
	args: { orderId: Id<"orders"> }
) {
	const order = await ctx.db.get(args.orderId);
	if (!order) {
		throw new Error("Order not found");
	}

	for (const item of order.items) {
		// 1. Deduct direct product quantity
		const product = await ctx.db.get(item.productId);
		if (product && typeof product.quantity === "number") {
			await ctx.db.patch(item.productId, {
				quantity: Math.max(0, product.quantity - item.quantity),
			});
		}

		// 2. Find recipe for this product + variant and deduct ingredients
		const recipe = await ctx.db
			.query("recipes")
			.withIndex("by_product_variant", (q) =>
				q.eq("productId", item.productId).eq("variantName", item.variant)
			)
			.first();

		if (!recipe) {
			// Also try to find a base recipe (no variant) if variant recipe not found
			const baseRecipe = await ctx.db
				.query("recipes")
				.withIndex("by_product_variant", (q) =>
					q.eq("productId", item.productId).eq("variantName", undefined)
				)
				.first();

			if (baseRecipe) {
				await deductIngredients(ctx, baseRecipe.ingredients, item.quantity);
			}
			continue;
		}

		await deductIngredients(ctx, recipe.ingredients, item.quantity);
	}
}

export const getBaseRecipes = query({
	args: {},
	handler: async (ctx) => {
		return await ctx.db.query("baseRecipes").collect();
	},
});

export const createBaseRecipe = mutation({
	args: {
		name: v.string(),
		description: v.optional(v.string()),
		targetUnit: v.string(),
		targetQuantity: v.number(),
		ingredients: v.array(
			v.object({
				inventoryId: v.id("inventory"),
				amount: v.number(),
			})
		),
	},
	handler: async (ctx, args) => {
		return await ctx.db.insert("baseRecipes", args);
	},
});

export const updateBaseRecipe = mutation({
	args: {
		id: v.id("baseRecipes"),
		name: v.string(),
		description: v.optional(v.string()),
		targetUnit: v.string(),
		targetQuantity: v.number(),
		ingredients: v.array(
			v.object({
				inventoryId: v.id("inventory"),
				amount: v.number(),
			})
		),
	},
	handler: async (ctx, args) => {
		const { id, ...data } = args;
		await ctx.db.patch(id, data);
	},
});

export const deleteBaseRecipe = mutation({
	args: { id: v.id("baseRecipes") },
	handler: async (ctx, args) => {
		await ctx.db.delete(args.id);
	},
});

export const getInventoryItemBatches = query({
	args: { inventoryId: v.id("inventory") },
	handler: async (ctx, args) => {
		const restockBatches = await ctx.db
			.query("inventoryTransactions")
			.withIndex("by_inventory_and_type", (q) =>
				q.eq("inventoryId", args.inventoryId).eq("type", "restock")
			)
			.collect();
		const productionBatches = await ctx.db
			.query("inventoryTransactions")
			.withIndex("by_inventory_and_type", (q) =>
				q.eq("inventoryId", args.inventoryId).eq("type", "production")
			)
			.collect();

		return [...restockBatches, ...productionBatches]
			.filter((batch) => (batch.remainingQuantity ?? 0) > 0)
			.sort((left, right) => right.timestamp - left.timestamp);
	},
});

/**
 * Mutation to "produce" a base recipe.
 * Deducts ingredients from inventory and adds the product to an inventory item.
 */
export const produceBaseRecipeBatch = mutation({
	args: {
		baseRecipeId: v.id("baseRecipes"),
		inventoryId: v.id("inventory"), // The target inventory item for this pre-mix
		batchMultiplier: v.number(), // How many batches to produce
		notes: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const recipe = await ctx.db.get(args.baseRecipeId);
		if (!recipe) {
			throw new Error("Recipe not found");
		}

		const targetItem = await ctx.db.get(args.inventoryId);
		if (!targetItem) {
			throw new Error("Target inventory item not found");
		}

		// 1. Deduct ingredients
		await deductIngredients(ctx, recipe.ingredients, args.batchMultiplier);

		// 2. Add stock to target item
		const addedQuantity = recipe.targetQuantity * args.batchMultiplier;
		await ctx.db.patch(args.inventoryId, {
			quantity: targetItem.quantity + addedQuantity,
		});

		// 3. Record transaction with FIFO tracking
		await ctx.db.insert("inventoryTransactions", {
			inventoryId: args.inventoryId,
			quantity: addedQuantity,
			remainingQuantity: addedQuantity,
			type: "production",
			timestamp: Date.now(),
			notes: args.notes || `Produced from recipe: ${recipe.name}`,
		});
	},
});

async function deductIngredients(
	ctx: MutationCtx,
	ingredients: { inventoryId: Id<"inventory">; amount: number }[],
	multiplier: number
) {
	for (const ing of ingredients) {
		const inventoryItem = await ctx.db.get(ing.inventoryId);
		if (!inventoryItem) {
			continue;
		}

		const totalDeduction = ing.amount * multiplier;

		// Sequential deduction (FIFO)
		await consumeStockFifo(ctx, ing.inventoryId, totalDeduction);

		// Update total stock
		await ctx.db.patch(ing.inventoryId, {
			quantity: inventoryItem.quantity - totalDeduction,
		});

		// Record transaction (summary)
		await ctx.db.insert("inventoryTransactions", {
			inventoryId: ing.inventoryId,
			quantity: -totalDeduction,
			type: "usage",
			timestamp: Date.now(),
			notes: "Automated deduction for recipe use/production",
		});
	}
}

/**
 * Sequential stock consumption from batches (FIFO).
 * Finds processing/restock transactions with remainingQuantity > 0.
 */
async function consumeStockFifo(
	ctx: MutationCtx,
	inventoryId: Id<"inventory">,
	amountToConsume: number
) {
	if (amountToConsume <= 0) {
		return;
	}

	const restockBatches = await ctx.db
		.query("inventoryTransactions")
		.withIndex("by_inventory_and_type", (q) =>
			q.eq("inventoryId", inventoryId).eq("type", "restock")
		)
		.collect();
	const productionBatches = await ctx.db
		.query("inventoryTransactions")
		.withIndex("by_inventory_and_type", (q) =>
			q.eq("inventoryId", inventoryId).eq("type", "production")
		)
		.collect();

	const activeBatches = [...restockBatches, ...productionBatches]
		.filter((b) => (b.remainingQuantity ?? 0) > 0)
		.sort((a, b) => a.timestamp - b.timestamp);

	let remainingToDeduct = amountToConsume;

	for (const batch of activeBatches) {
		if (remainingToDeduct <= 0) break;

		const currentBatchStock = batch.remainingQuantity ?? 0;
		const deduction = Math.min(currentBatchStock, remainingToDeduct);

		await ctx.db.patch(batch._id, {
			remainingQuantity: currentBatchStock - deduction,
		});

		remainingToDeduct -= deduction;
	}

	// Note: If remainingToDeduct > 0, it means we oversold/overused past known batches.
	// This can happen with initial stock or manual adjustments.
}
