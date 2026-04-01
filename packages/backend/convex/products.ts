import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";

// Public: Get all products (for Menu)
export const getProducts = query({
	args: { categoryId: v.optional(v.id("categories")) },
	handler: async (ctx, args) => {
		const { categoryId } = args;
		const query = ctx.db
			.query("products")
			.filter((q) => q.eq(q.field("isAvailable"), true));

		let products: Doc<"products">[];
		if (categoryId) {
			// Get all sub-categories for this category
			const subCategories = await ctx.db
				.query("categories")
				.filter((q) => q.eq(q.field("parentId"), categoryId))
				.collect();

			const categoryIds = [categoryId, ...subCategories.map((c) => c._id)];

			// Fetch products for all these categories
			const productsList = await Promise.all(
				categoryIds.map((id) =>
					ctx.db
						.query("products")
						.withIndex("by_category", (q) => q.eq("categoryId", id))
						.filter((q) => q.eq(q.field("isAvailable"), true))
						.collect()
				)
			);
			products = productsList.flat();
		} else {
			products = await query.collect();
		}

		return await Promise.all(
			products.map(async (p) => {
				if (p.image && !p.image.startsWith("http")) {
					const url = await ctx.storage.getUrl(p.image);
					if (url) {
						return { ...p, image: url, storageId: p.image };
					}
				}
				return p;
			})
		);
	},
});

// Admin: Get all products
export const getAllProductsAdmin = query({
	args: {},
	handler: async (ctx) => {
		const products = await ctx.db.query("products").collect();
		return await Promise.all(
			products.map(async (p) => {
				if (p.image && !p.image.startsWith("http")) {
					const url = await ctx.storage.getUrl(p.image);
					if (url) {
						return { ...p, image: url, storageId: p.image };
					}
				}
				return p;
			})
		);
	},
});

export const generateUploadUrl = mutation(async (ctx) => {
	return await ctx.storage.generateUploadUrl();
});

// Admin: Add Product
export const addProduct = mutation({
	args: {
		name: v.string(),
		description: v.optional(v.string()),
		price: v.number(),
		categoryId: v.id("categories"),
		promoPrice: v.optional(v.number()),
		image: v.optional(v.string()),
		isAvailable: v.boolean(),
		menuNumber: v.optional(v.number()),
		variations: v.optional(v.any()),
	},
	handler: async (ctx, args) => {
		return await ctx.db.insert("products", args);
	},
});

// Admin: Update Product
export const updateProduct = mutation({
	args: {
		id: v.id("products"),
		name: v.optional(v.string()),
		description: v.optional(v.string()),
		price: v.optional(v.number()),
		promoPrice: v.optional(v.number()),
		categoryId: v.optional(v.id("categories")),
		image: v.optional(v.string()),
		isAvailable: v.optional(v.boolean()),
		menuNumber: v.optional(v.number()),
		variations: v.optional(v.any()),
	},
	handler: async (ctx, args) => {
		const { id, ...updates } = args;
		await ctx.db.patch(id, updates);
	},
});

// Admin: Bulk Create Products
export const bulkCreateProducts = mutation({
	args: {
		products: v.array(
			v.object({
				name: v.string(),
				description: v.optional(v.string()),
				price: v.number(),
				promoPrice: v.optional(v.number()),
				categoryId: v.id("categories"),
				image: v.optional(v.string()), // URL
				isAvailable: v.boolean(),
			})
		),
	},
	handler: async (ctx, args) => {
		for (const product of args.products) {
			await ctx.db.insert("products", product);
		}
	},
});

// Admin: Delete Product
export const deleteProduct = mutation({
	args: { id: v.id("products") },
	handler: async (ctx, args) => {
		await ctx.db.delete(args.id);
	},
});

// Public: Get Categories
export const getCategories = query({
	args: {},
	handler: async (ctx) => {
		return await ctx.db.query("categories").collect();
	},
});

// Admin: Create Category
export const createCategory = mutation({
	args: {
		name: v.string(),
		order: v.optional(v.number()),
		parentId: v.optional(v.id("categories")),
		track: v.optional(v.union(v.literal("kitchen"), v.literal("bar"))),
	},
	handler: async (ctx, args) => {
		// Check if category already exists
		const existing = await ctx.db
			.query("categories")
			.filter((q) => q.eq(q.field("name"), args.name))
			.first();

		if (existing) {
			return existing._id;
		}

		let order = args.order;
		if (order === undefined) {
			const lastCategory = await ctx.db
				.query("categories")
				.order("desc")
				.first();
			order = lastCategory ? lastCategory.order + 1 : 0;
		}

		return await ctx.db.insert("categories", {
			name: args.name,
			order,
			parentId: args.parentId,
			track: args.track,
		});
	},
});

// Admin: Update Category
export const updateCategory = mutation({
	args: {
		id: v.id("categories"),
		name: v.optional(v.string()),
		order: v.optional(v.number()),
		parentId: v.optional(v.id("categories")),
		track: v.optional(v.union(v.literal("kitchen"), v.literal("bar"))),
	},
	handler: async (ctx, args) => {
		const { id, ...updates } = args;
		await ctx.db.patch(id, updates);
	},
});

// Admin: Delete Category
export const deleteCategory = mutation({
	args: { id: v.id("categories") },
	handler: async (ctx, args) => {
		await ctx.db.delete(args.id);
	},
});

// Admin: Get Variation Presets
export const getVariationPresets = query({
	args: {},
	handler: async (ctx) => {
		return await ctx.db.query("variationPresets").collect();
	},
});

// Admin: Add Variation Preset
export const addVariationPreset = mutation({
	args: {
		name: v.string(),
		options: v.array(
			v.object({
				name: v.string(),
				price: v.number(),
			})
		),
	},
	handler: async (ctx, args) => {
		return await ctx.db.insert("variationPresets", args);
	},
});

// Admin: Update Variation Preset
export const updateVariationPreset = mutation({
	args: {
		id: v.id("variationPresets"),
		name: v.optional(v.string()),
		options: v.optional(
			v.array(
				v.object({
					name: v.string(),
					price: v.number(),
				})
			)
		),
	},
	handler: async (ctx, args) => {
		const { id, ...updates } = args;
		await ctx.db.patch(id, updates);
	},
});

// Admin: Delete Variation Preset
export const deleteVariationPreset = mutation({
	args: { id: v.id("variationPresets") },
	handler: async (ctx, args) => {
		await ctx.db.delete(args.id);
	},
});
