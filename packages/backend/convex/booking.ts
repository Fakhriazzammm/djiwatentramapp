import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id, Doc } from "./_generated/dataModel";

// Helper to get booking settings
export const getSettings = query({
	args: { slug: v.string() },
	handler: async (ctx, args) => {
		const settings = await ctx.db
			.query("bookingSettings")
			.withIndex("by_slug", (q) => q.eq("slug", args.slug))
			.first();

		if (!settings) {
			return null;
		}

		// Resolve Storage ID to URL if applicable
		let logoUrl = settings.logoUrl;
		if (logoUrl && !logoUrl.startsWith("http")) {
			const url = await ctx.storage.getUrl(logoUrl);
			if (url) {
				logoUrl = url;
			}
		}

		let bannerUrl = settings.bannerUrl;
		if (bannerUrl && !bannerUrl.startsWith("http")) {
			const url = await ctx.storage.getUrl(bannerUrl);
			if (url) {
				bannerUrl = url;
			}
		}

		return {
			...settings,
			logoUrl,
			bannerUrl,
		};
	},
});

// Helper to update booking settings
export const updateSettings = mutation({
	args: {
		slug: v.string(),
		title: v.string(),
		description: v.optional(v.string()),
		logoUrl: v.optional(v.string()),
		bannerUrl: v.optional(v.string()),
		themeColor: v.optional(v.string()),
		socialLinks: v.optional(
			v.array(
				v.object({
					platform: v.string(),
					url: v.string(),
					label: v.string(),
				})
			)
		),
		featuredProductIds: v.optional(v.array(v.string())),
		paymentMethods: v.optional(v.array(v.string())),
		bankDetails: v.optional(v.string()),
		isActive: v.boolean(),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query("bookingSettings")
			.withIndex("by_slug", (q) => q.eq("slug", args.slug))
			.first();

		if (existing) {
			await ctx.db.patch(existing._id, args);
			return existing._id;
		} else {
			return await ctx.db.insert("bookingSettings", args);
		}
	},
});

// Get products for the booking page
export const getBookingProducts = query({
	args: { slug: v.string() },
	handler: async (ctx, args) => {
		const settings = await ctx.db
			.query("bookingSettings")
			.withIndex("by_slug", (q) => q.eq("slug", args.slug))
			.first();

		// If no settings or no specific products, return all available products
		if (!settings?.featuredProductIds || settings.featuredProductIds.length === 0) {
			return await ctx.db
				.query("products")
				.filter((q) => q.eq(q.field("isAvailable"), true))
				.collect();
		}

		// Fetch specific products
		const products: Doc<"products">[] = [];
		for (const idString of settings.featuredProductIds) {
			try {
				// We need to cast string to Id<"products">
				// In a real app, we should validate this better
				const product = await ctx.db.get(idString as Id<"products">);
				if (product?.isAvailable) {
					products.push(product);
				}
			} catch (_e) {
				// Ignore invalid IDs
			}
		}
		return products;
	},
});
