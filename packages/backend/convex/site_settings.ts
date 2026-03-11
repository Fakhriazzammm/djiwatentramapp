import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Default values
const DEFAULTS = {
	landingIcon: "Coffee",
	landingTitle: "COFFEE SHOP",
	landingDescription: "Pengalaman Kopi Premium",
	landingButtonText: "Pesan Disini",
	logoUrl: "",
	paymentPopupImage: "",
	storeName: "Coffee Shop",
	storeAddress: "",
	storePhone: "",
	receiptFooter: "Terima kasih atas kunjungan Anda!",
	autoPrint: false,
	// App Branding defaults
	appName: "Yumi POS",
	appVersion: "1.0.0",
	developerName: "Zantara Technology",
	// Mayar Payment Gateway defaults
	mayarEnabled: false,
	mayarTestMode: true,
	// Manual Payment Methods
	paymentMethodsManual: {
		cash: true,
		qris: true,
		transfer: false,
	},
	taxRate: 0,
	serviceChargeRate: 0,
	qrisImage: "",
};

export const getSettings = query({
	args: {},
	handler: async (ctx) => {
		const settings = await ctx.db.query("siteSettings").first();
		if (!settings) {
			// Return default values if nothing exists yet
			return DEFAULTS;
		}

		// Resolve Storage IDs to URLs
		let paymentPopupImage = settings.paymentPopupImage;
		if (paymentPopupImage && !paymentPopupImage.startsWith("http")) {
			const url = await ctx.storage.getUrl(paymentPopupImage);
			if (url) {
				paymentPopupImage = url;
			}
		}

		let qrisImage = settings.qrisImage;
		if (qrisImage && !qrisImage.startsWith("http")) {
			const url = await ctx.storage.getUrl(qrisImage);
			if (url) {
				qrisImage = url;
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
			// Mayar Payment Gateway
			mayarEnabled: settings.mayarEnabled ?? DEFAULTS.mayarEnabled,
			mayarTestMode: settings.mayarTestMode ?? DEFAULTS.mayarTestMode,
			// Manual Payment
			paymentMethodsManual:
				settings.paymentMethodsManual ?? DEFAULTS.paymentMethodsManual,
			taxRate: settings.taxRate ?? DEFAULTS.taxRate,
			serviceChargeRate: settings.serviceChargeRate ?? DEFAULTS.serviceChargeRate,
			qrisImage: qrisImage ?? DEFAULTS.qrisImage,
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
		// Mayar Payment Gateway
		mayarEnabled: v.optional(v.boolean()),
		mayarTestMode: v.optional(v.boolean()),
		// Manual Payments
		paymentMethodsManual: v.optional(
			v.object({
				cash: v.boolean(),
				qris: v.boolean(),
				transfer: v.boolean(),
			})
		),
		taxRate: v.optional(v.number()),
		serviceChargeRate: v.optional(v.number()),
		qrisImage: v.optional(v.string()),
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
