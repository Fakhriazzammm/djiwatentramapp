import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Get all HPP calculations
export const getHppCalculations = query({
	args: {},
	handler: async (ctx) => {
		return await ctx.db.query("hppCalculations").collect();
	},
});

// Get a single HPP calculation by ID
export const getHppCalculation = query({
	args: { id: v.id("hppCalculations") },
	handler: async (ctx, args) => {
		return await ctx.db.get(args.id);
	},
});

// Get HPP calculation linked to a product
export const getHppByProduct = query({
	args: { productId: v.id("products") },
	handler: async (ctx, args) => {
		return await ctx.db
			.query("hppCalculations")
			.withIndex("by_product", (q) => q.eq("productId", args.productId))
			.first();
	},
});

// ─── Inventory Price Sync ────────────────────────────────────────────────────

/**
 * Get latest purchase costs for all inventory items.
 * Pulls the most recent restock transaction with costPerUnit for each item.
 */
export const getLatestInventoryCosts = query({
	args: {},
	handler: async (ctx) => {
		const inventory = await ctx.db.query("inventory").collect();
		const result: Record<
			string,
			{
				inventoryId: string;
				ingredientName: string;
				unit: string;
				displayUnit?: string;
				conversionFactor?: number;
				latestCostPerUnit?: number;
				latestRestockDate?: number;
				avgCostPerUnit?: number;
			}
		> = {};

		for (const item of inventory) {
			const transactions = await ctx.db
				.query("inventoryTransactions")
				.withIndex("by_inventory", (q) =>
					q.eq("inventoryId", item._id)
				)
				.order("desc")
				.collect();

			// Find latest restock with costPerUnit
			const restocks = transactions.filter(
				(t) => t.type === "restock" && t.costPerUnit != null
			);
			const latestRestock = restocks[0];

			// Calculate average cost from all restocks that have costPerUnit
			let avgCostPerUnit: number | undefined;
			if (restocks.length > 0) {
				const totalCost = restocks.reduce(
					(sum, t) => sum + (t.costPerUnit ?? 0) * t.quantity,
					0
				);
				const totalQty = restocks.reduce(
					(sum, t) => sum + t.quantity,
					0
				);
				avgCostPerUnit = totalQty > 0 ? totalCost / totalQty : undefined;
			}

			result[item._id] = {
				inventoryId: item._id,
				ingredientName: item.ingredientName,
				unit: item.unit,
				displayUnit: item.displayUnit,
				conversionFactor: item.conversionFactor,
				latestCostPerUnit: latestRestock?.costPerUnit ?? undefined,
				latestRestockDate: latestRestock?.timestamp,
				avgCostPerUnit,
			};
		}

		return result;
	},
});

// ─── Recipe Integration ──────────────────────────────────────────────────────

/**
 * Generate HPP data from an existing product recipe.
 * Returns ingredient data pre-populated with inventory info & latest costs,
 * ready to be loaded into the HPP calculator form.
 */
export const generateHppFromRecipe = query({
	args: { productId: v.id("products"), variantName: v.optional(v.string()) },
	handler: async (ctx, args) => {
		// Find the recipe
		let recipe = await ctx.db
			.query("recipes")
			.withIndex("by_product_variant", (q) =>
				q.eq("productId", args.productId).eq("variantName", args.variantName)
			)
			.first();

		// Fallback to base recipe (no variant) if not found
		if (!recipe && args.variantName) {
			recipe = await ctx.db
				.query("recipes")
				.withIndex("by_product_variant", (q) =>
					q.eq("productId", args.productId).eq("variantName", undefined)
				)
				.first();
		}

		if (!recipe) return null;

		const product = await ctx.db.get(args.productId);
		if (!product) return null;

		// Build ingredients with inventory info and latest costs
		const ingredients = [];
		for (const recipeIng of recipe.ingredients) {
			const invItem = await ctx.db.get(recipeIng.inventoryId);
			if (!invItem) continue;

			// Get latest restock cost
			const restocks = await ctx.db
				.query("inventoryTransactions")
				.withIndex("by_inventory", (q) =>
					q.eq("inventoryId", recipeIng.inventoryId)
				)
				.order("desc")
				.collect();

			const latestRestock = restocks.find(
				(t) => t.type === "restock" && t.costPerUnit != null
			);

			// Determine purchase unit / conversion
			const displayUnit = invItem.displayUnit || invItem.unit;
			const convFactor = invItem.conversionFactor || 1;

			// costPerUnit from transaction is per base unit.
			// purchasePrice = costPerUnit * conversionFactor (price per display unit)
			const costPerBaseUnit = latestRestock?.costPerUnit ?? 0;
			const purchasePrice = costPerBaseUnit * convFactor;

			ingredients.push({
				inventoryId: invItem._id,
				ingredientName: invItem.ingredientName,
				purchasePrice,
				purchaseQuantity: 1,
				purchaseUnit: displayUnit,
				usagePerServing: recipeIng.amount,
				usageUnit: invItem.unit,
				conversionFactor: convFactor,
			});
		}

		return {
			productId: product._id,
			productName: product.name,
			sellingPrice: product.promoPrice ?? product.price,
			ingredients,
			variantName: args.variantName,
		};
	},
});

/**
 * Get all products that have recipes defined (for the import picker).
 */
export const getProductsWithRecipes = query({
	args: {},
	handler: async (ctx) => {
		const recipes = await ctx.db.query("recipes").collect();
		const productIds = [...new Set(recipes.map((r) => r.productId))];

		const results = [];
		for (const pid of productIds) {
			const product = await ctx.db.get(pid);
			if (!product) continue;

			const productRecipes = recipes.filter(
				(r) => r.productId === pid
			);
			results.push({
				product,
				variants: productRecipes
					.map((r) => r.variantName)
					.filter((v): v is string => v != null),
			});
		}

		return results;
	},
});

// ─── CRUD ────────────────────────────────────────────────────────────────────

// Create a new HPP calculation
export const createHppCalculation = mutation({
	args: {
		name: v.string(),
		description: v.optional(v.string()),
		ingredients: v.array(
			v.object({
				inventoryId: v.optional(v.id("inventory")),
				ingredientName: v.string(),
				purchasePrice: v.number(),
				purchaseQuantity: v.number(),
				purchaseUnit: v.string(),
				usagePerServing: v.number(),
				usageUnit: v.string(),
				conversionFactor: v.number(),
			})
		),
		overheadCosts: v.array(
			v.object({
				name: v.string(),
				costPerServing: v.number(),
			})
		),
		servingsPerBatch: v.number(),
		sellingPrice: v.number(),
		productId: v.optional(v.id("products")),
	},
	handler: async (ctx, args) => {
		const now = Date.now();
		return await ctx.db.insert("hppCalculations", {
			...args,
			createdAt: now,
			updatedAt: now,
		});
	},
});

// Update an existing HPP calculation
export const updateHppCalculation = mutation({
	args: {
		id: v.id("hppCalculations"),
		name: v.string(),
		description: v.optional(v.string()),
		ingredients: v.array(
			v.object({
				inventoryId: v.optional(v.id("inventory")),
				ingredientName: v.string(),
				purchasePrice: v.number(),
				purchaseQuantity: v.number(),
				purchaseUnit: v.string(),
				usagePerServing: v.number(),
				usageUnit: v.string(),
				conversionFactor: v.number(),
			})
		),
		overheadCosts: v.array(
			v.object({
				name: v.string(),
				costPerServing: v.number(),
			})
		),
		servingsPerBatch: v.number(),
		sellingPrice: v.number(),
		productId: v.optional(v.id("products")),
	},
	handler: async (ctx, args) => {
		const { id, ...data } = args;
		await ctx.db.patch(id, {
			...data,
			updatedAt: Date.now(),
		});
	},
});

// Delete an HPP calculation
export const deleteHppCalculation = mutation({
	args: { id: v.id("hppCalculations") },
	handler: async (ctx, args) => {
		await ctx.db.delete(args.id);
	},
});

/**
 * Sync HPP calculation ingredients with latest inventory prices.
 * Updates the purchasePrice of each ingredient that is linked to an inventory item.
 */
export const syncHppWithInventoryPrices = mutation({
	args: { id: v.id("hppCalculations") },
	handler: async (ctx, args) => {
		const hpp = await ctx.db.get(args.id);
		if (!hpp) throw new Error("HPP calculation not found");

		let updatedCount = 0;
		const updatedIngredients = [];

		for (const ing of hpp.ingredients) {
			if (!ing.inventoryId) {
				updatedIngredients.push(ing);
				continue;
			}

			const invItem = await ctx.db.get(ing.inventoryId);
			if (!invItem) {
				updatedIngredients.push(ing);
				continue;
			}

			// Find latest restock with cost
			const transactions = await ctx.db
				.query("inventoryTransactions")
				.withIndex("by_inventory", (q) =>
					q.eq("inventoryId", ing.inventoryId!)
				)
				.order("desc")
				.collect();

			const latestRestock = transactions.find(
				(t) => t.type === "restock" && t.costPerUnit != null
			);

			if (latestRestock?.costPerUnit != null) {
				const newPurchasePrice =
					latestRestock.costPerUnit * ing.conversionFactor;

				if (newPurchasePrice !== ing.purchasePrice) {
					updatedIngredients.push({
						...ing,
						purchasePrice: newPurchasePrice,
					});
					updatedCount++;
				} else {
					updatedIngredients.push(ing);
				}
			} else {
				updatedIngredients.push(ing);
			}
		}

		if (updatedCount > 0) {
			await ctx.db.patch(args.id, {
				ingredients: updatedIngredients,
				updatedAt: Date.now(),
			});
		}

		return { updatedCount };
	},
});
