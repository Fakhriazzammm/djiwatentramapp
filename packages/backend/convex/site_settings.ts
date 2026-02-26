import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const getSettings = query({
	args: {},
	handler: async (ctx) => {
		const settings = await ctx.db.query("siteSettings").first();
		if (!settings) {
			// Return default values if nothing exists yet
			return {
				landingIcon: "Coffee",
				landingTitle: "TKM COFFEE",
				landingDescription: "Pengalaman Kopi Premium",
				landingButtonText: "Pesan Disini",
				logoUrl: "",
				paymentPopupImage: "",
				storeName: "TKM Coffee",
				storeAddress: "",
				storePhone: "",
				receiptFooter: "Terima kasih atas kunjungan Anda!",
				autoPrint: false,
				// App Branding defaults
				appName: "Murni POS",
				appVersion: "1.0.0",
				developerName: "Zantara Technology",
			};
		}

		// Resolve Storage ID to URL if applicable
		if (
			settings.paymentPopupImage &&
			!settings.paymentPopupImage.startsWith("http")
		) {
			const url = await ctx.storage.getUrl(settings.paymentPopupImage);
			if (url) {
				return { ...settings, paymentPopupImage: url };
			}
		}

		return settings;
	},
});

export const generateUploadUrl = mutation(async (ctx) => {
	return await ctx.storage.generateUploadUrl();
});

export const updateSettings = mutation({
	args: {
		landingIcon: v.optional(v.string()),
		landingTitle: v.string(),
		landingDescription: v.string(),
		landingButtonText: v.string(),
		logoUrl: v.optional(v.string()),
		paymentPopupImage: v.optional(v.string()),
		storeName: v.optional(v.string()),
		storeAddress: v.optional(v.string()),
		storePhone: v.optional(v.string()),
		receiptFooter: v.optional(v.string()),
		autoPrint: v.optional(v.boolean()),
		// App Branding
		appName: v.optional(v.string()),
		appVersion: v.optional(v.string()),
		developerName: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db.query("siteSettings").first();

		if (existing) {
			await ctx.db.patch(existing._id, args);
			return existing._id;
		}

		const id = await ctx.db.insert("siteSettings", args);
		return id;
	},
});
