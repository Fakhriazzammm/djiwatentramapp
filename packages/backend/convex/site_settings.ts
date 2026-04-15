import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

type OrderType = {
	id: string;
	name: string;
	label: string;
	icon?: string;
	requiresTableNumber: boolean;
	isActive: boolean;
	sortOrder: number;
};

type PaymentMethodsManual = {
	cash: boolean;
	qris: boolean;
	transfer: boolean;
};

type ShiftSchedule = {
	name: string;
	openTime?: string;
	closeTime?: string;
};

type ShiftSettings = {
	predefinedShifts: string[];
	defaultStartingCash: number;
	reminderMinutesBeforeClose: number;
	autoSendShiftReportEmail: boolean;
	shiftSchedules: ShiftSchedule[];
};

type CustomerOrdering = {
	enabled: boolean;
	welcomeTitle: string;
	welcomeSubtitle: string;
	welcomeButtonLabel: string;
	enablePartySizeSelection: boolean;
	enableFreeRefillPrompt: boolean;
	enableBarcodeScan: boolean;
	enableMenuNumberEntry: boolean;
	enableCatalogBrowsing: boolean;
	enableStaffCall: boolean;
	enableDessertLater: boolean;
	requireTableNumber: boolean;
	cashPaymentLabel: string;
	mayarPaymentLabel: string;
};

type PayrollGlobalConfig = {
	lateToleranceMinutes: number;
	latePenaltyPerMinute: number;
	overtimeBonusPerHour: number;
};

type AiModelConfig = {
	ocrVisionModel: string;
	chatTextModel: string;
	synthesisModel: string;
	analyticsModel: string;
	fallbackModel: string;
};

const DEFAULT_AI_MODEL_CONFIG: AiModelConfig = {
	ocrVisionModel: "gemini/gemini-2.0-flash-lite",
	chatTextModel: "gpt-4.1-mini",
	synthesisModel: "gpt-4.1-mini",
	analyticsModel: "gpt-4.1-mini",
	fallbackModel: "gpt-4.1-mini",
};

function normalizeModelId(model?: string) {
	const raw = (model || "").trim();
	if (!raw) return "";
	if (raw.startsWith("gemini/")) return raw;
	if (raw.startsWith("gemini-")) return `gemini/${raw}`;
	return raw;
}

function normalizeAiModelConfig(config?: Partial<AiModelConfig>): AiModelConfig {
	return {
		ocrVisionModel:
			normalizeModelId(config?.ocrVisionModel) ||
			DEFAULT_AI_MODEL_CONFIG.ocrVisionModel,
		chatTextModel:
			normalizeModelId(config?.chatTextModel) ||
			DEFAULT_AI_MODEL_CONFIG.chatTextModel,
		synthesisModel:
			normalizeModelId(config?.synthesisModel) ||
			DEFAULT_AI_MODEL_CONFIG.synthesisModel,
		analyticsModel:
			normalizeModelId(config?.analyticsModel) ||
			DEFAULT_AI_MODEL_CONFIG.analyticsModel,
		fallbackModel:
			normalizeModelId(config?.fallbackModel) ||
			DEFAULT_AI_MODEL_CONFIG.fallbackModel,
	};
}

// Default values
const DEFAULTS: {
	landingIcon: string;
	landingTitle: string;
	landingDescription: string;
	landingButtonText: string;
	logoUrl: string;
	headerLogoUrl: string;
	faviconUrl: string;
	pwaIcon192Url: string;
	pwaIcon512Url: string;
	pwaMaskableIconUrl: string;
	seoMetaTitle: string;
	seoMetaDescription: string;
	seoMetaKeywords: string;
	seoShareTitle: string;
	seoShareDescription: string;
	seoShareImageUrl: string;
	seoCanonicalUrl: string;
	paymentPopupImage: string;
	storeName: string;
	storeAddress: string;
	storePhone: string;
	resendFromEmail: string;
	receiptFooter: string;
	autoPrint: boolean;
	autoPrintKitchenReceipt: boolean;
	allowOpenBillPrint: boolean;
	appName: string;
	appVersion: string;
	developerName: string;
	mayarEnabled: boolean;
	mayarTestMode: boolean;
	paymentMethodsManual: PaymentMethodsManual;
	orderTypes: OrderType[];
	taxRate: number;
	serviceChargeRate: number;
	qrisImage: string;
	receiptLogo: string;
	receiptHeader: string;
	receiptShowLogo: boolean;
	receiptShowAddress: boolean;
	receiptShowPhone: boolean;
	receiptShowOrderNumber: boolean;
	receiptShowCustomerName: boolean;
	receiptShowCashierName: boolean;
	receiptShowNotes: boolean;
	receiptFontSize: string;
	aiModelConfig: AiModelConfig;
	shiftSettings: ShiftSettings;
	customerOrdering: CustomerOrdering;
	attendanceLat: number;
	attendanceLng: number;
	attendanceRadius: number;
	payrollGlobalConfig: PayrollGlobalConfig;
} = {
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
	orderTypes: [
		{
			id: "dine_in",
			name: "dine_in",
			label: "Dine In",
			icon: "Utensils",
			requiresTableNumber: true,
			isActive: true,
			sortOrder: 1,
		},
		{
			id: "takeaway",
			name: "takeaway",
			label: "Takeaway",
			icon: "ShoppingBag",
			requiresTableNumber: false,
			isActive: true,
			sortOrder: 2,
		},
	],
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
	aiModelConfig: DEFAULT_AI_MODEL_CONFIG,
	shiftSettings: {
		predefinedShifts: [],
		defaultStartingCash: 0,
		reminderMinutesBeforeClose: 15,
		autoSendShiftReportEmail: false,
		shiftSchedules: [],
	},
	customerOrdering: {
		enabled: true,
		welcomeTitle: "Welcome",
		welcomeSubtitle: "Pesan menu favoritmu langsung dari meja.",
		welcomeButtonLabel: "Mulai pesan",
		enablePartySizeSelection: true,
		enableFreeRefillPrompt: true,
		enableBarcodeScan: true,
		enableMenuNumberEntry: true,
		enableCatalogBrowsing: true,
		enableStaffCall: true,
		enableDessertLater: true,
		requireTableNumber: false,
		cashPaymentLabel: "Bayar di kasir",
		mayarPaymentLabel: "QRIS",
	},
	attendanceLat: -6.200000,
	attendanceLng: 106.816666,
	attendanceRadius: 50,
	payrollGlobalConfig: {
		lateToleranceMinutes: 5,
		latePenaltyPerMinute: 1000,
		overtimeBonusPerHour: 10000,
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
			orderTypes: settings.orderTypes ?? DEFAULTS.orderTypes,
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
			aiModelConfig: normalizeAiModelConfig(settings.aiModelConfig ?? {}),
			shiftSettings: {
				...DEFAULTS.shiftSettings,
				...(settings.shiftSettings ?? {}),
			},
			customerOrdering: {
				...DEFAULTS.customerOrdering,
				...(settings.customerOrdering ?? {}),
			},
			attendanceLat: settings.attendanceLat ?? DEFAULTS.attendanceLat,
			attendanceLng: settings.attendanceLng ?? DEFAULTS.attendanceLng,
			attendanceRadius: settings.attendanceRadius ?? DEFAULTS.attendanceRadius,
			payrollGlobalConfig: {
				...DEFAULTS.payrollGlobalConfig,
				...(settings.payrollGlobalConfig ?? {}),
			},
		};
	},
});

export const generateUploadUrl = mutation(async (ctx) => {
	return await ctx.storage.generateUploadUrl();
});

export const getAiModelSettings = query({
	args: {},
	handler: async (ctx) => {
		const settings = await ctx.db.query("siteSettings").first();
		return normalizeAiModelConfig(settings?.aiModelConfig ?? {});
	},
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
		orderTypes: v.optional(
			v.array(
				v.object({
					id: v.string(),
					name: v.string(),
					label: v.string(),
					icon: v.optional(v.string()),
					requiresTableNumber: v.boolean(),
					isActive: v.boolean(),
					sortOrder: v.number(),
				})
			)
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
		aiModelConfig: v.optional(
			v.object({
				ocrVisionModel: v.optional(v.string()),
				chatTextModel: v.optional(v.string()),
				synthesisModel: v.optional(v.string()),
				analyticsModel: v.optional(v.string()),
				fallbackModel: v.optional(v.string()),
			})
		),
		shiftSettings: v.optional(
			v.object({
				predefinedShifts: v.optional(v.array(v.string())),
				defaultStartingCash: v.optional(v.number()),
				reminderMinutesBeforeClose: v.optional(v.number()),
				autoSendShiftReportEmail: v.optional(v.boolean()),
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
		customerOrdering: v.optional(
			v.object({
				enabled: v.optional(v.boolean()),
				welcomeTitle: v.optional(v.string()),
				welcomeSubtitle: v.optional(v.string()),
				welcomeButtonLabel: v.optional(v.string()),
				enablePartySizeSelection: v.optional(v.boolean()),
				enableFreeRefillPrompt: v.optional(v.boolean()),
				enableBarcodeScan: v.optional(v.boolean()),
				enableMenuNumberEntry: v.optional(v.boolean()),
				enableCatalogBrowsing: v.optional(v.boolean()),
				enableStaffCall: v.optional(v.boolean()),
				enableDessertLater: v.optional(v.boolean()),
				requireTableNumber: v.optional(v.boolean()),
				cashPaymentLabel: v.optional(v.string()),
				mayarPaymentLabel: v.optional(v.string()),
			})
		),
		attendanceLat: v.optional(v.number()),
		attendanceLng: v.optional(v.number()),
		attendanceRadius: v.optional(v.number()),
		payrollGlobalConfig: v.optional(
			v.object({
				lateToleranceMinutes: v.number(),
				latePenaltyPerMinute: v.number(),
				overtimeBonusPerHour: v.number(),
			})
		),
	},
	handler: async (ctx, args) => {
		const normalizedArgs = args.aiModelConfig
			? { ...args, aiModelConfig: normalizeAiModelConfig(args.aiModelConfig) }
			: args;
		const existing = await ctx.db.query("siteSettings").first();

		if (existing) {
			await ctx.db.patch(existing._id, normalizedArgs);
			return existing._id;
		}

		// Use defaults for required fields if it's the first time
		const id = await ctx.db.insert("siteSettings", {
			...DEFAULTS,
			...normalizedArgs,
		} as any);
		return id;
	},
});
