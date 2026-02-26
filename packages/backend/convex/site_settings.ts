import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Default values
const DEFAULTS = {
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
	appName: "Yumi POS",
	appVersion: "1.0.0",
	developerName: "Zantara Technology",
};

export const getSettings = query({
	args: {},
	handler: async (ctx) => {
		const settings = await ctx.db.query("siteSettings").first();
		if (!settings) {
			// Return default values if nothing exists yet
			return DEFAULTS;
		}

		// Resolve Storage ID to URL if applicable
		let paymentPopupImage = settings.paymentPopupImage;
		if (paymentPopupImage && !paymentPopupImage.startsWith("http")) {
			const url = await ctx.storage.getUrl(paymentPopupImage);
			if (url) {
				paymentPopupImage = url;
			}
		}

		// Return settings with fallbacks for new fields
		return {
			landingIcon: settings.landingIcon ?? DEFAULTS.landingIcon,
			landingTitle: settings.landingTitle ?? DEFAULTS.landingTitle,
			landingDescription:
				settings.landingDescription ?? DEFAULTS.landingDescription,
			landingButtonText:
				settings.landingButtonText ?? DEFAULTS.landingButtonText,
			logoUrl: settings.logoUrl ?? DEFAULTS.logoUrl,
			paymentPopupImage: paymentPopupImage ?? DEFAULTS.paymentPopupImage,
			storeName: settings.storeName ?? DEFAULTS.storeName,
			storeAddress: settings.storeAddress ?? DEFAULTS.storeAddress,
			storePhone: settings.storePhone ?? DEFAULTS.storePhone,
			receiptFooter: settings.receiptFooter ?? DEFAULTS.receiptFooter,
			autoPrint: settings.autoPrint ?? DEFAULTS.autoPrint,
			// App Branding with fallbacks
			appName: settings.appName ?? DEFAULTS.appName,
			appVersion: settings.appVersion ?? DEFAULTS.appVersion,
			developerName: settings.developerName ?? DEFAULTS.developerName,
		};
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
