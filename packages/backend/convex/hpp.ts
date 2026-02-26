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
