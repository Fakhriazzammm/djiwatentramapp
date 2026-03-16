import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const getDiscounts = query({
	args: {},
	handler: async (ctx) => {
		return await ctx.db.query("discounts").collect();
	},
});

export const getActiveDiscounts = query({
	args: {},
	handler: async (ctx) => {
		return await ctx.db
			.query("discounts")
			.filter((q) => q.eq(q.field("isActive"), true))
			.collect();
	},
});

export const createDiscount = mutation({
	args: {
		name: v.string(),
		code: v.optional(v.string()),
		type: v.union(
			v.literal("FIXED"),
			v.literal("PERCENTAGE"),
			v.literal("FLAT_PRICE")
		),
		value: v.number(),
		targetType: v.union(
			v.literal("ALL"),
			v.literal("CATEGORY"),
			v.literal("PRODUCT")
		),
		targetId: v.optional(v.string()),
		targetIds: v.optional(v.array(v.string())),
		isActive: v.boolean(),
		minOrderValue: v.optional(v.number()),
		startDate: v.optional(v.number()),
		endDate: v.optional(v.number()),
		startTime: v.optional(v.string()),
		endTime: v.optional(v.string()),
		days: v.optional(v.array(v.number())),
		isHappyHour: v.optional(v.boolean()),
		productPrices: v.optional(
			v.array(
				v.object({
					productId: v.string(),
					price: v.number(),
				})
			)
		),
		isFreeRefill: v.optional(v.boolean()),
		refillPrice: v.optional(v.number()),
		refillAvailability: v.optional(
			v.union(v.literal("ALWAYS"), v.literal("HAPPY_HOUR"))
		),
	},
	handler: async (ctx, args) => {
		await ctx.db.insert("discounts", args);
	},
});

export const updateDiscount = mutation({
	args: {
		id: v.id("discounts"),
		name: v.optional(v.string()),
		code: v.optional(v.string()),
		type: v.optional(
			v.union(
				v.literal("FIXED"),
				v.literal("PERCENTAGE"),
				v.literal("FLAT_PRICE")
			)
		),
		value: v.optional(v.number()),
		targetType: v.optional(
			v.union(v.literal("ALL"), v.literal("CATEGORY"), v.literal("PRODUCT"))
		),
		targetId: v.optional(v.string()),
		targetIds: v.optional(v.array(v.string())),
		isActive: v.optional(v.boolean()),
		minOrderValue: v.optional(v.number()),
		startDate: v.optional(v.number()),
		endDate: v.optional(v.number()),
		startTime: v.optional(v.string()),
		endTime: v.optional(v.string()),
		days: v.optional(v.array(v.number())),
		isHappyHour: v.optional(v.boolean()),
		productPrices: v.optional(
			v.array(
				v.object({
					productId: v.string(),
					price: v.number(),
				})
			)
		),
		isFreeRefill: v.optional(v.boolean()),
		refillPrice: v.optional(v.number()),
		refillAvailability: v.optional(
			v.union(v.literal("ALWAYS"), v.literal("HAPPY_HOUR"))
		),
	},
	handler: async (ctx, args) => {
		const { id, ...updates } = args;
		await ctx.db.patch(id, updates);
	},
});

export const deleteDiscount = mutation({
	args: { id: v.id("discounts") },
	handler: async (ctx, args) => {
		await ctx.db.delete(args.id);
	},
});
