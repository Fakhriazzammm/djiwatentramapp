import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";

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
		return allItems.filter((item) => item.quantity <= item.lowStockThreshold);
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
	},
	handler: async (ctx, args) => {
		return await ctx.db.insert("inventory", args);
	},
});

export const addStock = mutation({
	args: {
		inventoryId: v.id("inventory"),
		quantity: v.number(), // Amount to add
		costPerUnit: v.optional(v.number()),
		notes: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const item = await ctx.db.get(args.inventoryId);
		if (!item) {
			throw new Error("Item not found");
		}

		// Update total quantity
		await ctx.db.patch(args.inventoryId, {
			quantity: item.quantity + args.quantity,
		});

		// Record transaction
		await ctx.db.insert("inventoryTransactions", {
			inventoryId: args.inventoryId,
			quantity: args.quantity,
			type: "restock",
			timestamp: Date.now(),
			costPerUnit: args.costPerUnit,
			notes: args.notes,
		});
	},
});

export const usageStock = mutation({
	args: {
		inventoryId: v.id("inventory"),
		quantity: v.number(), // Amount used
		notes: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const item = await ctx.db.get(args.inventoryId);
		if (!item) {
			throw new Error("Item not found");
		}

		// Update total quantity
		await ctx.db.patch(args.inventoryId, {
			quantity: item.quantity - args.quantity,
		});

		// Record transaction
		await ctx.db.insert("inventoryTransactions", {
			inventoryId: args.inventoryId,
			quantity: -args.quantity,
			type: "usage",
			timestamp: Date.now(),
			notes: args.notes,
		});
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
		const item = await ctx.db.get(args.inventoryId);
		if (!item) {
			throw new Error("Item not found");
		}

		const diff = args.quantity - item.quantity;

		// Update total quantity
		await ctx.db.patch(args.inventoryId, {
			quantity: args.quantity,
		});

		// Record transaction
		await ctx.db.insert("inventoryTransactions", {
			inventoryId: args.inventoryId,
			quantity: diff,
			type: "adjustment",
			timestamp: Date.now(),
			notes: args.notes,
		});
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
		// Find recipe for this product + variant
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

		// 3. Record transaction
		await ctx.db.insert("inventoryTransactions", {
			inventoryId: args.inventoryId,
			quantity: addedQuantity,
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

		// Update stock
		await ctx.db.patch(ing.inventoryId, {
			quantity: inventoryItem.quantity - totalDeduction,
		});

		// Record transaction
		await ctx.db.insert("inventoryTransactions", {
			inventoryId: ing.inventoryId,
			quantity: -totalDeduction,
			type: "usage",
			timestamp: Date.now(),
			notes: "Automated deduction for recipe use/production",
		});
	}
}
