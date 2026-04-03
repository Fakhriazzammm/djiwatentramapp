import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Default values
const DEFAULTS = {
	landingIcon: "Coffee",
	landingTitle: "COFFEE SHOP",
	landingDescription: "Pengalaman Kopi Premium",
	landingButtonText: "Pesan Disini",
	logoUrl: "",
	headerLogoUrl: "",
	faviconUrl: "",
	pwaIcon192Url: "",
	pwaIcon512Url: "",
	pwaMaskableIconUrl: "",
	seoMetaTitle: "",
	seoMetaDescription: "",
	seoMetaKeywords: "",
	seoShareTitle: "",
	seoShareDescription: "",
	seoShareImageUrl: "",
	seoCanonicalUrl: "",
	paymentPopupImage: "",
	storeName: "Coffee Shop",
	storeAddress: "",
	storePhone: "",
	resendFromEmail: "",
	receiptFooter: "Terima kasih atas kunjungan Anda!",
	autoPrint: true,
	autoPrintKitchenReceipt: true,
	allowOpenBillPrint: true,
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
	// Receipt defaults
	receiptLogo: "",
	receiptHeader: "",
	receiptShowLogo: true,
	receiptShowAddress: true,
	receiptShowPhone: true,
	receiptShowOrderNumber: true,
	receiptShowCustomerName: true,
	receiptShowCashierName: true,
	receiptShowNotes: true,
	receiptFontSize: "normal",
	shiftSettings: {
		predefinedShifts: [],
		defaultStartingCash: 0,
		reminderMinutesBeforeClose: 15,
		shiftSchedules: [],
	},
};

export const getSettings = query({
	args: {},
	handler: async (ctx) => {
		const settings = await ctx.db.query("siteSettings").first();
		if (!settings) {
			// Return default values if nothing exists yet
			return DEFAULTS;
		}

		const resolveStorageUrl = async (value?: string) => {
			if (!value) return value;
			if (value.startsWith("http")) return value;
			const url = await ctx.storage.getUrl(value);
			return url ?? value;
		};

		// Resolve Storage IDs to URLs
		const paymentPopupImage = await resolveStorageUrl(settings.paymentPopupImage);
		const qrisImage = await resolveStorageUrl(settings.qrisImage);
		const receiptLogo = await resolveStorageUrl(settings.receiptLogo);
		const logoUrl = await resolveStorageUrl(settings.logoUrl);
		const headerLogoUrl = await resolveStorageUrl(settings.headerLogoUrl);
		const faviconUrl = await resolveStorageUrl(settings.faviconUrl);
		const pwaIcon192Url = await resolveStorageUrl(settings.pwaIcon192Url);
		const pwaIcon512Url = await resolveStorageUrl(settings.pwaIcon512Url);
		const pwaMaskableIconUrl = await resolveStorageUrl(settings.pwaMaskableIconUrl);
		const seoShareImageUrl = await resolveStorageUrl(settings.seoShareImageUrl);

		// Return settings with fallbacks for new fields
		return {
			landingIcon: settings.landingIcon ?? DEFAULTS.landingIcon,
			landingTitle: settings.landingTitle ?? DEFAULTS.landingTitle,
			landingDescription:
				settings.landingDescription ?? DEFAULTS.landingDescription,
			landingButtonText:
				settings.landingButtonText ?? DEFAULTS.landingButtonText,
			logoUrl: logoUrl ?? DEFAULTS.logoUrl,
			headerLogoUrl: headerLogoUrl ?? DEFAULTS.headerLogoUrl,
			faviconUrl: faviconUrl ?? DEFAULTS.faviconUrl,
			pwaIcon192Url: pwaIcon192Url ?? DEFAULTS.pwaIcon192Url,
			pwaIcon512Url: pwaIcon512Url ?? DEFAULTS.pwaIcon512Url,
			pwaMaskableIconUrl: pwaMaskableIconUrl ?? DEFAULTS.pwaMaskableIconUrl,
			seoMetaTitle: settings.seoMetaTitle ?? DEFAULTS.seoMetaTitle,
			seoMetaDescription:
				settings.seoMetaDescription ?? DEFAULTS.seoMetaDescription,
			seoMetaKeywords: settings.seoMetaKeywords ?? DEFAULTS.seoMetaKeywords,
			seoShareTitle: settings.seoShareTitle ?? DEFAULTS.seoShareTitle,
			seoShareDescription:
				settings.seoShareDescription ?? DEFAULTS.seoShareDescription,
			seoShareImageUrl: seoShareImageUrl ?? DEFAULTS.seoShareImageUrl,
			seoCanonicalUrl: settings.seoCanonicalUrl ?? DEFAULTS.seoCanonicalUrl,
			paymentPopupImage: paymentPopupImage ?? DEFAULTS.paymentPopupImage,
			storeName: settings.storeName ?? DEFAULTS.storeName,
			storeAddress: settings.storeAddress ?? DEFAULTS.storeAddress,
			storePhone: settings.storePhone ?? DEFAULTS.storePhone,
			resendFromEmail: settings.resendFromEmail ?? DEFAULTS.resendFromEmail,
			receiptFooter: settings.receiptFooter ?? DEFAULTS.receiptFooter,
			autoPrint: settings.autoPrint ?? DEFAULTS.autoPrint,
			autoPrintKitchenReceipt:
				settings.autoPrintKitchenReceipt ?? DEFAULTS.autoPrintKitchenReceipt,
			allowOpenBillPrint:
				settings.allowOpenBillPrint ?? DEFAULTS.allowOpenBillPrint,
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
			// Receipt Settings
			receiptLogo: receiptLogo ?? DEFAULTS.receiptLogo,
			receiptHeader: settings.receiptHeader ?? DEFAULTS.receiptHeader,
			receiptShowLogo: settings.receiptShowLogo ?? DEFAULTS.receiptShowLogo,
			receiptShowAddress: settings.receiptShowAddress ?? DEFAULTS.receiptShowAddress,
			receiptShowPhone: settings.receiptShowPhone ?? DEFAULTS.receiptShowPhone,
			receiptShowOrderNumber: settings.receiptShowOrderNumber ?? DEFAULTS.receiptShowOrderNumber,
			receiptShowCustomerName: settings.receiptShowCustomerName ?? DEFAULTS.receiptShowCustomerName,
			receiptShowCashierName: settings.receiptShowCashierName ?? DEFAULTS.receiptShowCashierName,
			receiptShowNotes: settings.receiptShowNotes ?? DEFAULTS.receiptShowNotes,
			receiptFontSize: settings.receiptFontSize ?? DEFAULTS.receiptFontSize,
			shiftSettings: settings.shiftSettings ?? DEFAULTS.shiftSettings,
		};
	},
});

export const generateUploadUrl = mutation(async (ctx) => {
	return await ctx.storage.generateUploadUrl();
});

export const updateSettings = mutation({
	args: {
		landingIcon: v.optional(v.string()),
		landingTitle: v.optional(v.string()),
		landingDescription: v.optional(v.string()),
		landingButtonText: v.optional(v.string()),
		logoUrl: v.optional(v.string()),
		headerLogoUrl: v.optional(v.string()),
		faviconUrl: v.optional(v.string()),
		pwaIcon192Url: v.optional(v.string()),
		pwaIcon512Url: v.optional(v.string()),
		pwaMaskableIconUrl: v.optional(v.string()),
		seoMetaTitle: v.optional(v.string()),
		seoMetaDescription: v.optional(v.string()),
		seoMetaKeywords: v.optional(v.string()),
		seoShareTitle: v.optional(v.string()),
		seoShareDescription: v.optional(v.string()),
		seoShareImageUrl: v.optional(v.string()),
		seoCanonicalUrl: v.optional(v.string()),
		paymentPopupImage: v.optional(v.string()),
		storeName: v.optional(v.string()),
		storeAddress: v.optional(v.string()),
		storePhone: v.optional(v.string()),
		resendFromEmail: v.optional(v.string()),
		receiptFooter: v.optional(v.string()),
		autoPrint: v.optional(v.boolean()),
		autoPrintKitchenReceipt: v.optional(v.boolean()),
		allowOpenBillPrint: v.optional(v.boolean()),
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
		// Receipt Settings
		receiptLogo: v.optional(v.string()),
		receiptHeader: v.optional(v.string()),
		receiptShowLogo: v.optional(v.boolean()),
		receiptShowAddress: v.optional(v.boolean()),
		receiptShowPhone: v.optional(v.boolean()),
		receiptShowOrderNumber: v.optional(v.boolean()),
		receiptShowCustomerName: v.optional(v.boolean()),
		receiptShowCashierName: v.optional(v.boolean()),
		receiptShowNotes: v.optional(v.boolean()),
		receiptFontSize: v.optional(v.string()),
		shiftSettings: v.optional(
			v.object({
				predefinedShifts: v.optional(v.array(v.string())),
				defaultStartingCash: v.optional(v.number()),
				reminderMinutesBeforeClose: v.optional(v.number()),
				shiftSchedules: v.optional(
					v.array(
						v.object({
							name: v.string(),
							openTime: v.optional(v.string()),
							closeTime: v.optional(v.string()),
						})
					)
				),
			})
		),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db.query("siteSettings").first();

		if (existing) {
			await ctx.db.patch(existing._id, args);
			return existing._id;
		}

		// Use defaults for required fields if it's the first time
		const id = await ctx.db.insert("siteSettings", {
			...DEFAULTS,
			...args,
		} as any);
		return id;
	},
});
