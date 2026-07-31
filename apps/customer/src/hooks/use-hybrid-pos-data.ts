import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/client";
import { useSupabaseLiveValue } from "@/hooks/use-supabase-live-value";

// Global refresh — call triggerHybridRefresh() after any write to
// instantly refresh ALL hybrid data hooks across the entire app.
let _refreshCounter = 0;
const _refreshListeners = new Set<() => void>();

export function triggerHybridRefresh() {
	_refreshCounter++;
	_refreshListeners.forEach((fn) => fn());
}

function useGlobalRefreshTrigger() {
	const [, setTick] = useState(0);
	useEffect(() => {
		const listener = () => setTick((n) => n + 1);
		_refreshListeners.add(listener);
		return () => { _refreshListeners.delete(listener); };
	}, []);
	return _refreshCounter;
}

type SiteSettingsRecord = Record<string, any>;
type CategoryRecord = Record<string, any>;
type ProductRecord = Record<string, any>;
type DiscountRecord = Record<string, any>;
type OrderRecord = Record<string, any>;
type BestSellerRecord = {
	productId: string;
	productName: string;
	totalSold: number;
	orderCount: number;
};
type InventoryRecord = Record<string, any>;
type ShiftReportRecord = {
	shiftId: string;
	shiftName: string;
	notes: string;
	cashierName: string;
	teamMembers: string;
	startTime: number;
	endTime?: number;
	status: "SELESAI" | "AKTIF";
	startingCash: number;
	cashRevenue: number;
	qrisRevenue: number;
	otherRevenue: number;
	totalGrossSales: number;
	totalDiscount: number;
	totalRevenue: number;
	totalExpenses: number;
	totalItemsSold: number;
	orderCount: number;
	bookingCount: number;
	hasTarget?: boolean;
	targetRevenue?: number;
	shiftTarget?: number;
	shiftCollected?: number;
	dailyTarget?: number;
	dailyCollected?: number;
	isShiftTargetMet?: boolean;
	isDailyTargetMet?: boolean;
};
type CurrentMonthProgressRecord = {
	month: string;
	monthLabel: string;
	currentIncome: number;
	currentExpense: number;
	currentNet: number;
	targetRevenue: number;
	targetProfit?: number | null;
	remaining: number;
	progressPct: number;
	dailyTarget: number;
	shiftTarget: number;
	dailyCollected: number;
	shiftCollected: number;
	daysInMonth: number;
	daysPassed: number;
	daysRemaining: number;
	dailyRate: number;
	projectedMonthly: number;
	hasTarget?: boolean;
	insight?: string | null;
};
type StaffRoleRecord = {
	_id: string;
	name: string;
	permissions: string[];
	bonusTargetConfig?: {
		basis?: "shift" | "daily" | "monthly";
		tiers?: Array<{ thresholdPct: number; bonusAmount: number }>;
	} | null;
	customAllowances?: { name: string; amount: number }[];
	raw?: Record<string, unknown>;
};
type StaffUserRecord = {
	_id: string;
	username: string;
	name: string;
	roleId?: string | null;
	roleName?: string | null;
	slug?: string | null;
	isActive: boolean;
	receiveReportEmails?: boolean;
	photoUrl?: string | null;
};
type ShiftStatusRecord = {
	isOpen: boolean;
	latestMulai: number;
	latestAkhir: number;
	shiftInfo: {
		cashierName?: string;
		shiftName?: string;
		shiftId?: string;
	};
	ongoingShift?: {
		_id: string;
		startTime: number;
		endTime?: number;
		shiftName: string;
		cashierName: string;
		teamMembers?: string;
		startingCash: number;
	};
	allShifts: Array<{
		_id: string;
		startTime: number;
		endTime?: number;
		shiftName: string;
		cashierName: string;
		teamMembers?: string;
		isAutoClosed?: boolean;
		revenue: number;
		cashRevenue: number;
		qrisRevenue: number;
		totalDiscount: number;
		modalAwal: number;
		setoranAkhir: number;
	}>;
};
type BookingOrderRecord = {
	_id: string;
	_creationTime: number;
	slug: string;
	bookingCode: string;
	customerName: string;
	customerPhone: string;
	customerEmail: string;
	notes?: string | null;
	bookingDate: string;
	totalAmount: number;
	paymentMethod?: string | null;
	paymentStatus?: string | null;
	bookingStatus?: string | null;
	guestCount?: number | null;
	tableCount?: number | null;
	paymentProofImage?: string | null;
	transferredAmount?: number | null;
	customAnswers?: Record<string, unknown> | null;
	createdAt: number;
	items: Array<{
		productId?: string | null;
		name: string;
		price: number;
		quantity: number;
	}>;
};
type FinancialTransactionRecord = {
	_id: string;
	type: string;
	amount: number;
	category?: string | null;
	merchant?: string | null;
	description?: string | null;
	date: number;
	paymentMethod?: string | null;
	status?: string | null;
	orderId?: string | null;
	bookingOrderId?: string | null;
	attachmentUrl?: string | null;
	sourceFingerprint?: string | null;
	isRecurring?: boolean | null;
	recurringInterval?: string | null;
	tags?: string[] | null;
	metadata?: Record<string, unknown> | null;
};
type ShiftOperationalRecord = {
	_id: string;
	shiftName: string;
	cashierName?: string | null;
	teamMembers?: string | null;
	startTime: number;
	endTime?: number | null;
	startingCash: number;
	notes?: string | null;
	summary?: Record<string, unknown> | null;
	cashBreakdown?: Record<string, unknown> | null;
	nonCashExpected: number;
	nonCashConfirmed: number;
	endingCashExpected: number;
	endingCashPhysical: number;
};
type DashboardStatsRecord = {
	todayOrders: number;
	todayRevenue: number;
	todayPosRevenue: number;
	todayBookingRevenue: number;
	todayDiscount: number;
	pendingOrders: number;
	activeProducts: number;
	totalProducts: number;
	lowStockCount: number;
	lowStockItems: Array<{
		_id: string;
		ingredientName: string;
		quantity: number;
		unit: string;
		lowStockThreshold: number;
	}>;
	netBalance: number;
	totalIncome: number;
	totalExpense: number;
	todayIncome: number;
	todayExpense: number;
	orderStatusBreakdown: {
		pending: number;
		paid: number;
		completed: number;
		cancelled: number;
	};
	revenueLast7Days: Array<{
		date: string;
		revenue: number;
		discount: number;
		orders: number;
	}>;
	topProducts: Array<{
		name: string;
		count: number;
		revenue: number;
	}>;
	recentOrders: Array<{
		_id: string;
		orderNumber: string;
		totalAmount: number;
		status: OrderRecord["status"];
		createdAt: number;
		customerName: string | null;
		paymentMethod: string | null;
	}>;
	cashDiscrepancySummary: {
		totalPhysicalGap: number;
		totalNonCashGap: number;
		highRiskShiftCount: number;
	};
	paymentReconciliation: {
		pendingNonCashCount: number;
		pendingNonCashAmount: number;
	};
	anomalies: Array<{
		type: string;
		severity: "high" | "medium";
		title: string;
		description: string;
	}>;
};

type HppIngredientRecord = {
	purchasePrice?: number;
	purchaseQuantity?: number;
	conversionFactor?: number;
	usagePerServing?: number;
};

type HppCalculationRecord = {
	_id: string;
	productId?: string | null;
	name: string;
	sellingPrice: number;
	servingsPerBatch: number;
	ingredients: HppIngredientRecord[];
	overheadCosts: Array<{ costPerServing?: number }>;
	updatedAt: number;
	raw?: Record<string, unknown>;
};

type HppProductMapEntry = {
	hppId: string;
	name: string;
	hppPerServing: number;
	sellingPrice: number;
	profitPerServing: number;
	marginPercent: number;
};

type HppProductMapRecord = Record<string, HppProductMapEntry>;

type InventoryCostMapRecord = Record<
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
>;

function safeNum(value: unknown) {
	const number = Number(value ?? 0);
	return Number.isFinite(number) ? number : 0;
}

function deriveTotalItemsSoldFromSummary(summary: any): number {
	const direct = safeNum(summary?.totalItemsSold);
	if (direct > 0) return direct;

	const breakdown = Array.isArray(summary?.productBreakdown)
		? summary.productBreakdown
		: [];
	const fromBreakdown = breakdown.reduce(
		(acc: number, category: any) => acc + safeNum(category?.totalQuantity),
		0,
	);

	return fromBreakdown > 0 ? fromBreakdown : 0;
}

function useSupabaseValue<T>(
	key: string,
	load: () => Promise<T | null>,
	deps: readonly unknown[],
	options?: { refreshTrigger?: number; refreshMs?: number }
) {
	const globalTick = useGlobalRefreshTrigger();
	const mergedTrigger = options?.refreshTrigger !== undefined
		? options.refreshTrigger + globalTick
		: globalTick;
	return useSupabaseLiveValue(key, load, deps, { ...options, refreshTrigger: mergedTrigger });
}

function getHppIngredientCostPerServing(ingredient: HppIngredientRecord) {
	return Number(ingredient.purchasePrice ?? 0) * Number(ingredient.usagePerServing ?? 0);
}

function computeHppSummary(calculation: HppCalculationRecord) {
	const ingredientCostPerServing = calculation.ingredients.reduce(
		(sum, ingredient) => sum + getHppIngredientCostPerServing(ingredient),
		0
	);
	const overheadCostPerServing = calculation.overheadCosts.reduce(
		(sum, overhead) => sum + Number(overhead.costPerServing ?? 0),
		0
	);
	const totalHppPerServing = ingredientCostPerServing + overheadCostPerServing;
	const sellingPrice = Number(calculation.sellingPrice ?? 0);
	const profitPerServing = sellingPrice - totalHppPerServing;
	const marginPercent =
		sellingPrice > 0 ? (profitPerServing / sellingPrice) * 100 : 0;

	return {
		totalHppPerServing,
		profitPerServing,
		marginPercent,
	};
}

function buildHppProductMap(calculations: HppCalculationRecord[]) {
	const sorted = [...calculations].sort(
		(left, right) => Number(right.updatedAt ?? 0) - Number(left.updatedAt ?? 0)
	);
	const result: HppProductMapRecord = {};

	for (const calculation of sorted) {
		if (!calculation.productId || result[calculation.productId]) {
			continue;
		}
		const metrics = computeHppSummary(calculation);
		result[calculation.productId] = {
			hppId: calculation._id,
			name: calculation.name,
			hppPerServing: metrics.totalHppPerServing,
			sellingPrice: Number(calculation.sellingPrice ?? 0),
			profitPerServing: metrics.profitPerServing,
			marginPercent: metrics.marginPercent,
		};
	}

	for (const calculation of sorted) {
		if (result[calculation._id]) {
			continue;
		}
		const metrics = computeHppSummary(calculation);
		result[calculation._id] = {
			hppId: calculation._id,
			name: calculation.name,
			hppPerServing: metrics.totalHppPerServing,
			sellingPrice: Number(calculation.sellingPrice ?? 0),
			profitPerServing: metrics.profitPerServing,
			marginPercent: metrics.marginPercent,
		};
	}

	return result;
}

export const DEFAULT_ORDER_TYPES = [
	{
		id: "dine_in",
		name: "dine_in",
		label: "Dine In",
		icon: "Utensils",
		isActive: true,
		sortOrder: 1,
		requiresTableNumber: true,
	},
	{
		id: "takeaway",
		name: "takeaway",
		label: "Takeaway",
		icon: "ShoppingBag",
		isActive: true,
		sortOrder: 2,
		requiresTableNumber: false,
	},
	{
		id: "online",
		name: "online",
		label: "Online",
		icon: "Bike",
		isActive: true,
		sortOrder: 3,
		requiresTableNumber: false,
	},
];

const DEFAULT_PLATFORMS = [
	{ id: "grab", name: "GrabFood", icon: "Bike", commissionRate: 0.20, isActive: true, sortOrder: 1 },
	{ id: "gofood", name: "GoFood", icon: "Bike", commissionRate: 0.20, isActive: true, sortOrder: 2 },
	{ id: "maxim", name: "Maxim", icon: "Bike", commissionRate: 0.15, isActive: true, sortOrder: 3 },
	{ id: "shopeefood", name: "ShopeeFood", icon: "ShoppingBag", commissionRate: 0.20, isActive: true, sortOrder: 4 },
];

async function fetchSiteSettings() {
	const supabase = createClient();
	const { data, error } = await supabase
		.from("pos_site_settings")
		.select("*")
		.not("raw->shiftSettings", "is", null)
		.order("_id", { ascending: false })
		.limit(1)
		.maybeSingle();

	if (error) throw error;
	if (!data?.raw || typeof data.raw !== "object") return null;

	const raw = data.raw as Record<string, unknown>;
	const orderTypes =
		Array.isArray(raw.orderTypes) && raw.orderTypes.length > 0
			? raw.orderTypes
			: DEFAULT_ORDER_TYPES;
	const platforms =
		Array.isArray(raw.platforms) && raw.platforms.length > 0
			? raw.platforms
			: DEFAULT_PLATFORMS;

	return {
		_id: data._id,
		...raw,
		orderTypes,
		platforms,
	} as SiteSettingsRecord;
}

async function fetchCategories() {
	const supabase = createClient();
	const { data, error } = await supabase
		.from("pos_categories")
		.select("*")
		.order("displayOrder", { ascending: true });

	if (error) throw error;

	return (data ?? []).map((row: any) => ({
		_id: row._id,
		name: row.name,
		order: row.displayOrder ?? 0,
		parentId: row.parentId,
		track: row.track,
	})) as CategoryRecord[];
}

async function fetchProducts() {
	const supabase = createClient();
	const { data, error } = await supabase
		.from("pos_products")
		.select("*")
		.eq("isAvailable", true)
		.order("menuNumber", { ascending: true, nullsFirst: false });

	if (error) throw error;

	return (data ?? []).map((row: any) => ({
		_id: row._id,
		categoryId: row.categoryId,
		name: row.name,
		description: row.description,
		price: Number(row.price ?? 0),
		promoPrice:
			row.promoPrice === null || row.promoPrice === undefined
				? null
				: Number(row.promoPrice),
		image: row.image,
		isAvailable: Boolean(row.isAvailable),
		quantity:
			row.quantity === null || row.quantity === undefined
				? null
				: Number(row.quantity),
		menuNumber:
			row.menuNumber === null || row.menuNumber === undefined
				? null
				: Number(row.menuNumber),
		variations: row.variations,
	})) as ProductRecord[];
}

async function fetchBestSellers() {
	const supabase = createClient();
	const { data, error } = await supabase
		.from("pos_best_sellers")
		.select("product_id, product_name, total_sold, order_count")
		.limit(8);

	if (error) throw error;
	return (data ?? []).map((row: any) => ({
		productId: String(row.product_id ?? ""),
		productName: String(row.product_name ?? ""),
		totalSold: Number(row.total_sold ?? 0),
		orderCount: Number(row.order_count ?? 0),
	})) as BestSellerRecord[];
}

async function fetchAllProducts() {
	const supabase = createClient();
	const { data, error } = await supabase
		.from("pos_products_all")
		.select("*")
		.order("menuNumber", { ascending: true, nullsFirst: false });

	if (error) throw error;

	return (data ?? []).map((row: any) => ({
		_id: row._id,
		categoryId: row.categoryId,
		name: row.name,
		description: row.description,
		price: Number(row.price ?? 0),
		promoPrice:
			row.promoPrice === null || row.promoPrice === undefined
				? null
				: Number(row.promoPrice),
		image: row.image,
		isAvailable: Boolean(row.isAvailable),
		quantity:
			row.quantity === null || row.quantity === undefined
				? null
				: Number(row.quantity),
		menuNumber:
			row.menuNumber === null || row.menuNumber === undefined
				? null
				: Number(row.menuNumber),
		variations: row.variations,
	})) as ProductRecord[];
}

async function fetchHppCalculations() {
	const supabase = createClient();
	const { data, error } = await supabase
		.from("pos_hpp_calculations")
		.select("*")
		.order("updatedAt", { ascending: false });

	if (error) throw error;

	return (data ?? []).map((row: any) => ({
		_id: row._id,
		productId: row.productId ?? null,
		name: row.name ?? "HPP Calculation",
		sellingPrice: Number(row.sellingPrice ?? 0),
		servingsPerBatch: Number(row.servingsPerBatch ?? 1),
		ingredients: Array.isArray(row.ingredients) ? row.ingredients : [],
		overheadCosts: Array.isArray(row.overheadCosts) ? row.overheadCosts : [],
		updatedAt: Number(row.updatedAt ?? 0),
		raw: row.raw && typeof row.raw === "object" ? row.raw : undefined,
	})) as HppCalculationRecord[];
}

async function fetchHppProductMap() {
	const calculations = await fetchHppCalculations();
	return buildHppProductMap(calculations);
}

async function fetchLatestInventoryCosts() {
	const supabase = createClient();
	const { data, error } = await supabase
		.from("pos_inventory_latest_costs")
		.select("*");

	if (error) throw error;

	const result: InventoryCostMapRecord = {};
	for (const row of data ?? []) {
		const inventoryId = String(row.inventoryId ?? "");
		if (!inventoryId) {
			continue;
		}
		result[inventoryId] = {
			inventoryId,
			ingredientName: row.ingredientName ?? "",
			unit: row.unit ?? "",
			displayUnit: row.displayUnit ?? undefined,
			conversionFactor:
				row.conversionFactor === null || row.conversionFactor === undefined
					? undefined
					: Number(row.conversionFactor),
			latestCostPerUnit:
				row.latestCostPerUnit === null || row.latestCostPerUnit === undefined
					? undefined
					: Number(row.latestCostPerUnit),
			latestRestockDate:
				row.latestRestockDate === null || row.latestRestockDate === undefined
					? undefined
					: Number(row.latestRestockDate),
			avgCostPerUnit:
				row.avgCostPerUnit === null || row.avgCostPerUnit === undefined
					? undefined
					: Number(row.avgCostPerUnit),
		};
	}
	return result;
}

async function fetchActiveDiscounts() {
	const supabase = createClient();
	const { data, error } = await supabase
		.from("pos_active_discounts")
		.select("*");

	if (error) throw error;

	return (data ?? []).map((row: any) => ({
		_id: row._id,
		name: row.name,
		code: row.code,
		type: row.type,
		value: Number(row.value ?? 0),
		targetType: row.targetType,
		targetId: row.targetId,
		targetIds: row.targetIds,
		formattedId: row.formattedId,
		isActive: Boolean(row.isActive),
		minOrderValue:
			row.minOrderValue === null || row.minOrderValue === undefined
				? null
				: Number(row.minOrderValue),
		startDate:
			row.startDate === null || row.startDate === undefined
				? null
				: Number(row.startDate),
		endDate:
			row.endDate === null || row.endDate === undefined
				? null
				: Number(row.endDate),
		startTime: row.startTime,
		endTime: row.endTime,
		days: row.days,
		isHappyHour:
			row.isHappyHour === null || row.isHappyHour === undefined
				? null
				: Boolean(row.isHappyHour),
		productPrices: row.productPrices,
		isFreeRefill:
			row.isFreeRefill === null || row.isFreeRefill === undefined
				? null
				: Boolean(row.isFreeRefill),
		refillPrice:
			row.refillPrice === null || row.refillPrice === undefined
				? null
				: Number(row.refillPrice),
		refillAvailability: row.refillAvailability,
	})) as DiscountRecord[];
}

async function fetchAllDiscounts() {
	const supabase = createClient();
	const { data, error } = await supabase
		.from("pos_discounts")
		.select("*")
		.order("name", { ascending: true });

	if (error) throw error;

	return (data ?? []).map((row: any) => ({
		_id: row._id,
		name: row.name,
		code: row.code,
		type: row.type,
		value: Number(row.value ?? 0),
		targetType: row.targetType,
		targetId: row.targetId,
		targetIds: row.targetIds,
		formattedId: row.formattedId,
		isActive: Boolean(row.isActive),
		minOrderValue:
			row.minOrderValue === null || row.minOrderValue === undefined
				? null
				: Number(row.minOrderValue),
		startDate:
			row.startDate === null || row.startDate === undefined
				? null
				: Number(row.startDate),
		endDate:
			row.endDate === null || row.endDate === undefined
				? null
				: Number(row.endDate),
		startTime: row.startTime,
		endTime: row.endTime,
		days: row.days,
		isHappyHour:
			row.isHappyHour === null || row.isHappyHour === undefined
				? null
				: Boolean(row.isHappyHour),
		productPrices: row.productPrices,
		isFreeRefill:
			row.isFreeRefill === null || row.isFreeRefill === undefined
				? null
				: Boolean(row.isFreeRefill),
		refillPrice:
			row.refillPrice === null || row.refillPrice === undefined
				? null
				: Number(row.refillPrice),
		refillAvailability: row.refillAvailability,
		raw: row.raw,
	})) as DiscountRecord[];
}

async function fetchOrders(options?: { status?: string; limit?: number }) {
	const supabase = createClient();
	let query = supabase
		.from("pos_orders")
		.select("*")
		.order("createdAt", { ascending: false });

	if (options?.status) {
		query = query.eq("status", options.status);
	}

	if (options?.limit) {
		query = query.limit(options.limit);
	}

	const { data, error } = await query;

	if (error) throw error;

	return (data ?? []).map((row: any) => ({
			_id: String(row._id ?? ""),
		_creationTime: Number(row._creationTime ?? row.createdAt ?? 0),
		orderNumber: row.orderNumber ?? "",
		totalAmount: Number(row.totalAmount ?? 0),
		status: row.status ?? null,
		paymentMethod: row.paymentMethod ?? null,
		customerName: row.customerName ?? null,
		tableNumber: row.tableNumber ?? null,
		orderType: row.orderType ?? null,
		source: row.source ?? null,
		brandSlug: row.brandSlug ?? null,
		guestCount:
			row.guestCount === null || row.guestCount === undefined
				? null
				: Number(row.guestCount),
		freeRefillSelected:
			row.freeRefillSelected === null || row.freeRefillSelected === undefined
				? null
				: Boolean(row.freeRefillSelected),
		dessertLater:
			row.dessertLater === null || row.dessertLater === undefined
				? null
				: Boolean(row.dessertLater),
		notes: row.notes ?? null,
		createdAt: Number(row.createdAt ?? 0),
			voucherId: row.voucherId ? String(row.voucherId) : null,
		discountAmount:
			row.discountAmount === null || row.discountAmount === undefined
				? null
				: Number(row.discountAmount),
		taxAmount:
			row.taxAmount === null || row.taxAmount === undefined
				? null
				: Number(row.taxAmount),
		serviceChargeAmount:
			row.serviceChargeAmount === null || row.serviceChargeAmount === undefined
				? null
				: Number(row.serviceChargeAmount),
		receiptMeta:
			row.receiptMeta && typeof row.receiptMeta === "object"
				? row.receiptMeta
				: null,
		paymentReceiptKind: row.paymentReceiptKind ?? null,
		paymentGateway:
			row.paymentGateway && typeof row.paymentGateway === "object"
				? row.paymentGateway
				: null,
		gatewayInvoiceId: row.gatewayInvoiceId ?? null,
		authUserId: row.authUserId ?? null,
		items: Array.isArray(row.items)
			? row.items.map((item: any) => ({
						productId: String(item.productId ?? ""),
					productName: item.productName ?? "",
					variant: item.variant ?? null,
					quantity: Number(item.quantity ?? 0),
					price: Number(item.price ?? 0),
					originalPrice:
						item.originalPrice === null || item.originalPrice === undefined
							? null
							: Number(item.originalPrice),
					status: item.status ?? null,
					hppSnapshot:
						item.hppSnapshot && typeof item.hppSnapshot === "object"
							? item.hppSnapshot
							: null,
			  }))
			: [],
	})) as OrderRecord[];
}

async function fetchInventory() {
	const supabase = createClient();
	const { data, error } = await supabase
		.from("pos_inventory")
		.select("*")
		.order("ingredientName", { ascending: true });

	if (error) throw error;

	return (data ?? []).map((row: any) => ({
		_id: row._id ?? row.source_id,
		ingredientName: row.ingredientName ?? row.ingredient_name ?? "",
		unit: row.unit ?? "",
		quantity: Number(row.quantity ?? 0),
		lowStockThreshold: Number(row.lowStockThreshold ?? row.low_stock_threshold ?? 0),
		displayUnit: row.displayUnit ?? row.display_unit ?? undefined,
		conversionFactor:
			(row.conversionFactor ?? row.conversion_factor) === null || (row.conversionFactor ?? row.conversion_factor) === undefined
				? undefined
				: Number(row.conversionFactor ?? row.conversion_factor),
		unitConversions: Array.isArray(row.unitConversions ?? row.unit_conversions)
			? (row.unitConversions ?? row.unit_conversions)
			: undefined,
		baseRecipeId: row.baseRecipeId ?? row.base_recipe_source_id ?? undefined,
		defaultBrandName: row.defaultBrandName ?? row.default_brand_name ?? undefined,
		preferredStoreId: row.preferredStoreId ?? row.preferred_store_source_id ?? undefined,
		preferredPurchaseQuantity:
			(row.preferredPurchaseQuantity ?? row.preferred_purchase_quantity) === null ||
			(row.preferredPurchaseQuantity ?? row.preferred_purchase_quantity) === undefined
				? undefined
				: Number(row.preferredPurchaseQuantity ?? row.preferred_purchase_quantity),
		preferredPurchaseUnit: row.preferredPurchaseUnit ?? row.preferred_purchase_unit ?? undefined,
		lastPurchasePrice:
			(row.lastPurchasePrice ?? row.last_purchase_price) === null || (row.lastPurchasePrice ?? row.last_purchase_price) === undefined
				? undefined
				: Number(row.lastPurchasePrice ?? row.last_purchase_price),
		lastPurchaseAt:
			(row.lastPurchaseAt ?? row.last_purchase_at) === null || (row.lastPurchaseAt ?? row.last_purchase_at) === undefined
				? undefined
				: Number(row.lastPurchaseAt ?? row.last_purchase_at),
		lastPurchaseStoreId: row.lastPurchaseStoreId ?? row.last_purchase_store_source_id ?? undefined,
		netWeight: row.net_weight ?? row.netWeight ?? row.berat ?? null,
		category: row.category ?? "kitchen",
		packNetQuantity:
			(row.packNetQuantity ?? row.pack_net_quantity) === null || (row.packNetQuantity ?? row.pack_net_quantity) === undefined
				? undefined
				: Number(row.packNetQuantity ?? row.pack_net_quantity),
		packNetUnit: row.packNetUnit ?? row.pack_net_unit ?? undefined,
		contentToBaseFactor:
			(row.contentToBaseFactor ?? row.content_to_base_factor) === null || (row.contentToBaseFactor ?? row.content_to_base_factor) === undefined
				? undefined
				: Number(row.contentToBaseFactor ?? row.content_to_base_factor),
	})) as InventoryRecord[];
}

async function fetchBookingOrders() {
	const supabase = createClient();
	const { data, error } = await supabase
		.from("pos_booking_orders")
		.select("*")
		.order("createdAt", { ascending: false });

	if (error) throw error;

	return (data ?? []).map((row: any) => ({
		_id: row._id,
		_creationTime: Number(row._creationTime ?? row.createdAt ?? 0),
		slug: row.slug ?? "booking",
		bookingCode: row.bookingCode ?? "",
		customerName: row.customerName ?? "",
		customerPhone: row.customerPhone ?? "",
		customerEmail: row.customerEmail ?? "",
		notes: row.notes ?? null,
		bookingDate: row.bookingDate ?? "",
		totalAmount: Number(row.totalAmount ?? 0),
		paymentMethod: row.paymentMethod ?? null,
		paymentStatus: row.paymentStatus ?? null,
		bookingStatus: row.bookingStatus ?? null,
		guestCount:
			row.guestCount === null || row.guestCount === undefined
				? null
				: Number(row.guestCount),
		tableCount:
			row.tableCount === null || row.tableCount === undefined
				? null
				: Number(row.tableCount),
		paymentProofImage: row.paymentProofImage ?? null,
		transferredAmount:
			row.transferredAmount === null || row.transferredAmount === undefined
				? null
				: Number(row.transferredAmount),
		customAnswers:
			row.customAnswers && typeof row.customAnswers === "object"
				? row.customAnswers
				: null,
		createdAt: Number(row.createdAt ?? 0),
		items: Array.isArray(row.items)
			? row.items.map((item: any) => ({
					productId: item.productId ?? null,
					name: item.name ?? "",
					price: Number(item.price ?? 0),
					quantity: Number(item.quantity ?? 0),
			  }))
			: [],
	})) as BookingOrderRecord[];
}

async function fetchFinancialTransactions() {
	const supabase = createClient();
	const { data, error } = await supabase
		.from("pos_financial_transactions")
		.select("*")
		.order("date", { ascending: false });

	if (error) throw error;

	return (data ?? []).map((row: any) => ({
		_id: row._id,
		type: row.type ?? "",
		amount: Number(row.amount ?? 0),
		category: row.category ?? null,
		merchant: row.merchant ?? null,
		description: row.description ?? null,
		date: Number(row.date ?? 0),
		paymentMethod: row.paymentMethod ?? null,
		status: row.status ?? null,
		orderId: row.orderId ?? null,
		bookingOrderId: row.bookingOrderId ?? null,
		attachmentUrl: row.attachmentUrl ?? null,
		sourceFingerprint: row.sourceFingerprint ?? null,
		isRecurring:
			row.isRecurring === null || row.isRecurring === undefined
				? null
				: Boolean(row.isRecurring),
		recurringInterval: row.recurringInterval ?? null,
		tags: Array.isArray(row.tags) ? row.tags : null,
		metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : null,
	})) as FinancialTransactionRecord[];
}

async function fetchDetailedShifts() {
	const supabase = createClient();
	const { data, error } = await supabase
		.from("pos_shifts")
		.select("*")
		.order("startTime", { ascending: false });

	if (error) throw error;

	return (data ?? []).map((row: any) => ({
		_id: row._id,
		shiftName: row.shiftName ?? "Shift",
		cashierName: row.cashierName ?? null,
		teamMembers: row.teamMembers ?? null,
		startTime: Number(row.startTime ?? 0),
		endTime:
			row.endTime === null || row.endTime === undefined
				? null
				: Number(row.endTime),
		startingCash: Number(row.startingCash ?? 0),
		notes: row.notes ?? null,
		summary: row.summary && typeof row.summary === "object" ? row.summary : null,
		cashBreakdown:
			row.cashBreakdown && typeof row.cashBreakdown === "object"
				? row.cashBreakdown
				: null,
		nonCashExpected: Number(row.nonCashExpected ?? 0),
		nonCashConfirmed: Number(row.nonCashConfirmed ?? 0),
		endingCashExpected: Number(row.endingCashExpected ?? 0),
		endingCashPhysical: Number(row.endingCashPhysical ?? 0),
	})) as ShiftOperationalRecord[];
}

type StaffRoleBonusConfig = {
	basis?: "shift" | "daily" | "monthly";
	tiers?: Array<{ thresholdPct: number; bonusAmount: number }>;
};

function computeMemberBonuses(
	teamMembers: string,
	isShiftTargetMet: boolean | undefined,
	isDailyTargetMet: boolean | undefined,
	shiftPct: number,
	dailyPct: number,
	staffNameToRole: Map<string, { roleName: string; bonusTargetConfig?: StaffRoleBonusConfig | null }>,
): Array<{
	name: string;
	roleName: string;
	bonus: number;
	achievedTiers: number[];
	allTiers: Array<{ thresholdPct: number; bonusAmount: number }>;
}> {
	if (!teamMembers) return [];
	const members = teamMembers.split(",").map((m) => m.trim()).filter(Boolean);
	if (members.length === 0) return [];

	return members.map((memberName) => {
		// Cari staff by name (case-insensitive, trim)
		const lookupKey = memberName.toUpperCase().trim();
		let matched = staffNameToRole.get(lookupKey);
		if (!matched) {
			// Fallback: partial match - cari nama staff yang mengandung nama member
			for (const [fullName, info] of staffNameToRole) {
				if (fullName.includes(lookupKey) || lookupKey.includes(fullName)) {
					matched = info;
					break;
				}
			}
		}

		const config = matched?.bonusTargetConfig;
		const roleName = matched?.roleName ?? "-";

		if (!config?.tiers || config.tiers.length === 0) {
			return { name: memberName, roleName, bonus: 0, achievedTiers: [], allTiers: [] };
		}

		const allTiers = config.tiers;
		const basis = config.basis ?? "shift";
		const met = basis === "daily" ? isDailyTargetMet : isShiftTargetMet;

		let achievedTiers: number[] = [];
		let bonus = 0;

		if (met) {
			const pct = basis === "daily" ? dailyPct : shiftPct;
			for (const tier of allTiers) {
				if (pct >= tier.thresholdPct) {
					achievedTiers.push(tier.thresholdPct);
					bonus += tier.bonusAmount;
				}
			}
		}

		return {
			name: memberName,
			roleName,
			bonus,
			achievedTiers,
			allTiers: allTiers.map((t) => ({ thresholdPct: t.thresholdPct, bonusAmount: t.bonusAmount })),
		};
	});
}

async function fetchShiftReports() {
	const supabase = createClient();

	// Step 1: Ambil semua shift langsung dari pos.shifts (cepat, hindari timeout view)
	// View pos_shift_reports terlalu lambat, jadi query shifts langsung
	const { data: shifts, error: shiftsError } = await supabase
		.schema("pos")
		.from("shifts")
		.select("source_id,shift_name,cashier_name,team_members,start_time,end_time,starting_cash,summary,notes")
		.not("start_time", "is", null)
		.order("start_time", { ascending: false, nullsFirst: false })
		.limit(200);

	if (shiftsError) {
		console.error("[hybrid] pos.shifts query failed", shiftsError);
		return [];
	}
	if (!shifts || shifts.length === 0) return [];

	// Step 2: Ambil target revenue bulan ini & lalu
	const { data: targets } = await supabase
		.schema("pos")
		.from("financial_targets")
		.select("month,target_revenue,target_profit")
		.order("month", { ascending: false })
		.limit(3);

	const targetMap = new Map<string, number>();
	if (targets) {
		for (const t of targets as any[]) {
			targetMap.set(t.month, Number(t.target_revenue ?? 0));
		}
	}

	// Helper: days in month
	function daysInMonth(ts: number): number {
		const d = new Date(ts);
		return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
	}

	// Helper: shifts per day dari siteSettings (atau default 2)
	async function getShiftsPerDay(): Promise<number> {
		try {
			const { data: ss } = await supabase
				.schema("pos")
				.from("site_settings")
				.select("raw")
				.order("creation_time", { ascending: false })
				.limit(1)
				.single();
			if (ss?.raw) {
				const arr = (ss as any).raw?.shiftSettings?.predefinedShifts;
				if (Array.isArray(arr) && arr.length > 0) return arr.length;
			}
		} catch {}
		return 2;
	}
	const shiftsPerDay = await getShiftsPerDay();

	// Step 3: Untuk shift aktif, query orders untuk revenue & diskon realtime
	const activeShifts = shifts.filter((s: any) => s.end_time == null);
	let activeRevenue: Record<string, { total: number; cash: number; qris: number; discount: number; itemsSold: number }> = {};
	for (const s of activeShifts) {
		const sid = s.source_id;
		const st = Number(s.start_time ?? 0);
		try {
			const { data: orders } = await supabase
				.schema("pos")
				.from("orders")
				.select("total_amount, discount_amount, payment_method, status")
				.gte("created_at", st)
				.in("status", ["completed", "paid"]);
			if (orders) {
				let total = 0, cash = 0, qris = 0, discount = 0;
				for (const o of orders as any[]) {
					const p = Number(o.total_amount ?? 0);
					total += p;
					discount += Number(o.discount_amount ?? 0);
					const m = String(o.payment_method ?? "").toLowerCase();
					if (m.includes("cash") || m.includes("tunai")) cash += p;
					else if (m.includes("qris") || m.includes("qr")) qris += p;
				}
				activeRevenue[sid] = { total, cash, qris, discount, itemsSold: orders.length };
			}
		} catch {}
		if (!activeRevenue[sid]) activeRevenue[sid] = { total: 0, cash: 0, qris: 0, discount: 0, itemsSold: 0 };
	}

	// Step 4: Hitung daily_collected per hari dari financial_transactions
	// Hanya untuk shift yang sudah selesai — gunakan summary saja
	// Untuk daily_collected, query global per hari
	const now = Date.now();
	const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
	const { data: dailyTx } = await supabase
		.schema("pos")
		.from("financial_transactions")
		.select("tx_date,amount,category")
		.eq("tx_type", "income")
		.in("status", ["completed"])
		.not("category", "in", `("Modal Awal","Setoran Akhir")`)
		.gte("tx_date", thirtyDaysAgo)
		.lte("tx_date", now);
	// Himpun daily collected per day (UTC day start)
	const dailyCollectedMap = new Map<string, number>();
	if (dailyTx) {
		for (const tx of dailyTx as any[]) {
			const d = new Date(Number(tx.tx_date ?? 0));
			const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
			dailyCollectedMap.set(key, (dailyCollectedMap.get(key) ?? 0) + Number(tx.amount ?? 0));
		}
	}

	// Step 5: Ambil staff + roles untuk bonus
	let staffNameToRole = new Map<string, { roleName: string; bonusTargetConfig?: StaffRoleBonusConfig | null }>();
	try {
		const [usersRes, rolesRes] = await Promise.all([
			supabase.from("pos_staff_users").select("name, roleName"),
			supabase.from("pos_staff_roles").select("name, bonusTargetConfig"),
		]);
		const rolesData = rolesRes.data;
		const usersData = usersRes.data;
		if (rolesData) {
			const roleMap = new Map<string, { roleName: string; bonusTargetConfig?: StaffRoleBonusConfig | null }>(
				(rolesData as any[]).map((r) => [r.name, { roleName: r.name, bonusTargetConfig: r.bonusTargetConfig ?? null }])
			);
			if (usersData) {
				for (const u of usersData as any[]) {
					const nameKey = (u.name ?? "").toString().toUpperCase().trim();
					if (nameKey) {
						const roleInfo = roleMap.get(u.roleName?.toUpperCase()?.trim() ?? "");
						staffNameToRole.set(nameKey, {
							roleName: u.roleName ?? roleInfo?.roleName ?? "-",
							bonusTargetConfig: roleInfo?.bonusTargetConfig ?? null,
						});
					}
				}
			}
		}
	} catch {}

	// Step 6: Map ke ShiftReportRecord
	return shifts.map((s: any) => {
		const sid = s.source_id;
		const endTime = s.end_time == null ? undefined : Number(s.end_time);
		const isActive = !endTime;
		const st = Number(s.start_time ?? 0);
		const summary = s.summary ?? {};
		const rev = activeRevenue[sid];
		const monthKey = (() => {
			const d = new Date(st);
			return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
		})();
		const targetRevenue = targetMap.get(monthKey) ?? 0;
		const hasTarget = targetRevenue > 0;
		const daysInMonthVal = daysInMonth(st);
		const dailyTarget = hasTarget ? targetRevenue / daysInMonthVal : 0;
		const shiftTarget = hasTarget ? dailyTarget / shiftsPerDay : 0;

		// shiftCollected = total revenue shift ini
		const shiftCollected = isActive && rev ? rev.total : Number(summary.totalRevenue ?? 0);
		// dailyCollected dari map
		const dayKey = (() => {
			const d = new Date(st);
			return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
		})();
		const dailyCollected = dailyCollectedMap.get(dayKey) ?? 0;

		// Cash/qris dari summary atau active
		const cashRev = isActive && rev ? rev.cash : Number(summary.cashRevenue ?? 0);
		const qrisRev = isActive && rev ? rev.qris : Number(summary.qrisRevenue ?? 0);
		const totalRev = isActive && rev ? rev.total : Number(summary.totalRevenue ?? 0);
		const discount = isActive && rev ? rev.discount : Number(summary.totalDiscount ?? 0);
		const grossSales = totalRev + discount;
		const expenses = Number(summary.totalExpenses ?? 0);
		const itemsSold = isActive && rev ? rev.itemsSold : deriveTotalItemsSoldFromSummary(summary);

		const isShiftTargetMet = hasTarget ? shiftCollected >= shiftTarget : undefined;
		const isDailyTargetMet = hasTarget ? dailyCollected >= dailyTarget : undefined;

		const financial: any = {
			cashRevenue: cashRev,
			qrisRevenue: qrisRev,
			otherRevenue: 0,
			totalGrossSales: grossSales,
			totalDiscount: discount,
			totalRevenue: totalRev,
			totalExpenses: expenses,
			totalItemsSold: itemsSold,
			orderCount: 0,
			bookingCount: 0,
			hasTarget,
			targetRevenue: hasTarget ? targetRevenue : undefined,
			shiftTarget: hasTarget ? shiftTarget : undefined,
			shiftCollected,
			dailyTarget: hasTarget ? dailyTarget : undefined,
			dailyCollected,
			isShiftTargetMet,
			isDailyTargetMet,
		};

		return {
			shiftId: sid,
			shiftName: s.shift_name ?? "Shift",
			notes: s.notes ?? "",
			cashierName: s.cashier_name ?? "",
			teamMembers: s.team_members ?? "",
			startTime: st,
			endTime,
			status: isActive ? "AKTIF" : "SELESAI",
			startingCash: Number(s.starting_cash ?? 0),
			...financial,
			memberBonuses: computeMemberBonuses(
				s.team_members ?? "",
				financial.isShiftTargetMet,
				financial.isDailyTargetMet,
				financial.shiftTarget && financial.shiftTarget > 0
					? (financial.shiftCollected ?? 0) / financial.shiftTarget * 100
					: 0,
				financial.dailyTarget && financial.dailyTarget > 0
					? (financial.dailyCollected ?? 0) / financial.dailyTarget * 100
					: 0,
				staffNameToRole,
			),
		} as ShiftReportRecord;
	});
}

async function fetchShiftDetails(args: { startTime: number; endTime?: number }) {
	const supabase = createClient();
	const rangeStart = safeNum(args.startTime);
	const rangeEnd =
		args.endTime === undefined || args.endTime === null
			? Date.now()
			: safeNum(args.endTime);

	const [
		{ data: reportRow, error: reportError },
		{ data: shiftRow, error: shiftError },
		{ data: orders, error: ordersError },
		{ data: bookings, error: bookingsError },
		{ data: transactions, error: transactionsError },
		{ data: products, error: productsError },
		{ data: categories, error: categoriesError },
	] = await Promise.all([
		supabase
			.from("pos_shift_reports")
			.select("*")
			.eq("start_time", rangeStart)
			.maybeSingle(),
		supabase.from("pos_shifts").select("*").eq("startTime", rangeStart).maybeSingle(),
		supabase
			.from("pos_orders")
			.select("*")
			.gte("createdAt", rangeStart)
			.lte("createdAt", rangeEnd),
		supabase
			.from("pos_booking_orders")
			.select("*")
			.gte("createdAt", rangeStart)
			.lte("createdAt", rangeEnd),
		supabase
			.from("pos_financial_transactions")
			.select("*")
			.gte("date", rangeStart)
			.lte("date", rangeEnd)
			.order("date", { ascending: false }),
		supabase.from("pos_products_all").select("*"),
		supabase.from("pos_categories").select("*"),
	]);

	if (reportError) throw reportError;
	if (shiftError) throw shiftError;
	if (ordersError) throw ordersError;
	if (bookingsError) throw bookingsError;
	if (transactionsError) throw transactionsError;
	if (productsError) throw productsError;
	if (categoriesError) throw categoriesError;

	const settledOrders = (orders ?? []).filter((row: any) =>
		["paid", "completed"].includes(String(row.status ?? ""))
	);
	const settledBookings = (bookings ?? []).filter((row: any) =>
		["paid", "confirmed", "completed"].includes(
			String(row.paymentStatus ?? row.bookingStatus ?? "")
		)
	);
	const expenseRows = (transactions ?? []).filter(
		(row: any) => row.type === "expense" && (row.status ?? "completed") === "completed"
	);

	const productMap = new Map<string, any>(
		(products ?? []).map((row: any) => [String(row._id), row])
	);
	const categoryMap = new Map<string, string>(
		(categories ?? []).map((row: any) => [String(row._id), String(row.name ?? "Lainnya")])
	);

	const topProductCounter = new Map<string, { productName: string; quantity: number }>();
	const productByCategory = new Map<
		string,
		{ categoryName: string; totalQuantity: number; items: Map<string, number> }
	>();

	for (const order of settledOrders) {
		for (const item of Array.isArray(order.items) ? order.items : []) {
			const productId = String(item.productId ?? "");
			const productName = String(
				item.productName ?? productMap.get(productId)?.name ?? "Produk"
			);
			const quantity = safeNum(item.quantity);
			if (quantity <= 0) continue;

			const topRow = topProductCounter.get(productName) ?? { productName, quantity: 0 };
			topRow.quantity += quantity;
			topProductCounter.set(productName, topRow);

			const categoryId = String(productMap.get(productId)?.categoryId ?? "");
			const categoryName = categoryMap.get(categoryId) ?? "Lainnya";
			const categoryRow = productByCategory.get(categoryName) ?? {
				categoryName,
				totalQuantity: 0,
				items: new Map<string, number>(),
			};
			categoryRow.totalQuantity += quantity;
			categoryRow.items.set(
				productName,
				(categoryRow.items.get(productName) ?? 0) + quantity
			);
			productByCategory.set(categoryName, categoryRow);
		}
	}

	const productBreakdown = Array.from(productByCategory.values())
		.map((row) => ({
			categoryName: row.categoryName,
			totalQuantity: row.totalQuantity,
			items: Array.from(row.items.entries())
				.map(([productName, quantity]) => ({ productName, quantity }))
				.sort((left, right) => right.quantity - left.quantity),
		}))
		.sort((left, right) => right.totalQuantity - left.totalQuantity);

	const topProducts = Array.from(topProductCounter.values())
		.sort((left, right) => right.quantity - left.quantity)
		.slice(0, 3);

	const expenseMap = new Map<string, number>();
	for (const expense of expenseRows) {
		const category = String(expense.category ?? "Lainnya");
		expenseMap.set(category, (expenseMap.get(category) ?? 0) + safeNum(expense.amount));
	}
	const expenseBreakdown = Array.from(expenseMap.entries())
		.map(([category, amount]) => ({ category, amount }))
		.sort((left, right) => right.amount - left.amount);

	const recentTransactions = [
		...settledOrders.map((row: any) => ({
			id: String(row._id),
			type: "pos",
			name: row.orderNumber ?? row.customerName ?? "Order POS",
			amount: safeNum(row.totalAmount),
			status: row.status ?? "completed",
			createdAt: safeNum(row.createdAt),
		})),
		...settledBookings.map((row: any) => ({
			id: String(row._id),
			type: "booking",
			name: row.bookingCode ?? row.customerName ?? "Booking",
			amount: safeNum(row.totalAmount),
			status: row.bookingStatus ?? row.paymentStatus ?? "completed",
			createdAt: safeNum(row.createdAt ?? row._creationTime),
		})),
	]
		.sort((left, right) => right.createdAt - left.createdAt)
		.slice(0, 20);

	const totalRevenue =
		safeNum(reportRow?.total_revenue) ||
		settledOrders.reduce((sum: number, row: any) => sum + safeNum(row.totalAmount), 0) +
			settledBookings.reduce(
				(sum: number, row: any) => sum + safeNum(row.totalAmount),
				0
			);
	const cashRevenue = safeNum(reportRow?.cash_revenue);
	const qrisRevenue = safeNum(reportRow?.qris_revenue);
	const nonCashExpected =
		safeNum(shiftRow?.nonCashExpected) || Math.max(0, totalRevenue - cashRevenue);

	return {
		cashRevenue,
		qrisRevenue,
		totalRevenue,
		orderCount:
			safeNum(reportRow?.order_count) || settledOrders.length + settledBookings.length,
		endingCashExpected:
			safeNum(shiftRow?.endingCashExpected) || safeNum(reportRow?.starting_cash) + cashRevenue,
		endingCashPhysical: safeNum(shiftRow?.endingCashPhysical),
		nonCashExpected,
		nonCashConfirmed: safeNum(shiftRow?.nonCashConfirmed),
		cashBreakdown:
			shiftRow?.cashBreakdown && typeof shiftRow.cashBreakdown === "object"
				? shiftRow.cashBreakdown
				: {},
		shiftDoc: shiftRow
			? {
					...shiftRow,
					startingCash: safeNum(shiftRow.startingCash),
			  }
			: null,
		recentTransactions,
		topProducts,
		productBreakdown,
		expenseBreakdown,
	};
}

async function fetchCurrentMonthProgress() {
	const supabase = createClient();
	const { data, error } = await supabase
		.from("pos_current_month_progress")
		.select("*")
		.maybeSingle();

	if (error) throw error;
	if (!data) return null;

	const targetRevenue = Number(data.target_revenue ?? 0);
	const progressPct = Number(data.progress_pct ?? 0);
	const daysRemaining = Number(data.days_remaining ?? 0);
	const hasTarget = targetRevenue > 0;
	const insight = !hasTarget
		? "Set target omzet bulanan untuk mulai tracking performa."
		: progressPct >= 100
			? "Target bulan ini sudah tercapai. Pertahankan momentum."
			: daysRemaining <= 5 && progressPct < 80
				? "Sisa hari sedikit. Dorong promo dan upsell untuk mengejar target."
				: "Progress berjalan baik. Jaga konsistensi penjualan harian.";

	return {
		month: data.month,
		monthLabel: data.month_label,
		currentIncome: Number(data.current_income ?? 0),
		currentExpense: Number(data.current_expense ?? 0),
		currentNet: Number(data.current_net ?? 0),
		targetRevenue,
		targetProfit:
			data.target_profit === null || data.target_profit === undefined
				? null
				: Number(data.target_profit),
		remaining: Number(data.remaining ?? 0),
		progressPct,
		dailyTarget: Number(data.daily_target ?? 0),
		shiftTarget: Number(data.shift_target ?? 0),
		dailyCollected: Number(data.daily_collected ?? 0),
		shiftCollected: Number(data.shift_collected ?? 0),
		daysInMonth: Number(data.days_in_month ?? 0),
		daysPassed: Number(data.days_passed ?? 0),
		daysRemaining,
		dailyRate: Number(data.daily_rate ?? 0),
		projectedMonthly: Number(data.projected_monthly ?? 0),
		hasTarget,
		insight,
	} as CurrentMonthProgressRecord;
}

async function fetchStaffRoles() {
	const supabase = createClient();
	const { data, error } = await supabase
		.from("pos_staff_roles")
		.select("*")
		.order("name", { ascending: true });

	if (error) throw error;

	return (data ?? []).map((row: any) => ({
		_id: row._id,
		name: row.name,
		permissions: Array.isArray(row.permissions)
			? row.permissions.filter((value: unknown): value is string => typeof value === "string")
			: [],
		bonusTargetConfig:
			row.bonusTargetConfig && typeof row.bonusTargetConfig === "object"
				? row.bonusTargetConfig
				: null,
		// Salary fields — stored in raw JSONB by updateRole
		baseShiftRate: row.baseShiftRate ?? row.raw?.baseShiftRate ?? 0,
		monthlyFixedSalary: row.monthlyFixedSalary ?? row.raw?.monthlyFixedSalary ?? 0,
		dailyAllowance: row.dailyAllowance ?? row.raw?.dailyAllowance ?? 0,
		customAllowances: Array.isArray(row.raw?.customAllowances) ? row.raw.customAllowances : [],
		baseHourlyRate: row.baseHourlyRate ?? row.raw?.baseHourlyRate ?? 0,
		raw: row.raw,
	})) as any[];
}

async function fetchStaffUsers() {
	const supabase = createClient();
	const { data, error } = await supabase
		.from("pos_staff_users")
		.select("*")
		.order("name", { ascending: true });

	if (error) throw error;

	return (data ?? []).map((row: any) => ({
		_id: row._id,
		username: row.username ?? "",
		name: row.name ?? "",
		roleId: row.roleId ?? null,
		roleName: row.roleName ?? null,
		slug: row.slug ?? null,
		isActive: Boolean(row.isActive),
		receiveReportEmails: Boolean(row.receiveReportEmails),
		photoUrl: row.photoUrl ?? null,
	})) as StaffUserRecord[];
}

export async function fetchShiftStatus() {
	const supabase = createClient();

	let data: any[] | null = null;
	let error: any = null;

	// Prefer direct pos_shifts query — lightning fast, no view timeout risk
	// Only fall back to pos_shift_reports if pos_shifts is unavailable
	const fb = await supabase
		.from("pos_shifts")
		.select("*")
		.order("startTime", { ascending: false });

	if (!fb.error) {
		// Map direct pos_shifts rows to the same shape expected by the rest of the code
		data = (fb.data ?? []).map((row: any) => ({
			shift_id: row._id,
			shift_name: row.shiftName ?? "Shift",
			cashier_name: row.cashierName ?? "",
			team_members: row.teamMembers ?? "",
			start_time: row.startTime,
			end_time: row.endTime ?? null,
			status: row.endTime ? "SELESAI" : "AKTIF",
			starting_cash: row.startingCash ?? 0,
			cash_revenue: row.summary?.cashRevenue ?? 0,
			qris_revenue: row.summary?.qrisRevenue ?? 0,
			other_revenue: 0,
			total_revenue: row.summary?.totalRevenue ?? 0,
			total_discount: row.summary?.totalDiscount ?? 0,
			total_expenses: row.summary?.totalExpenses ?? 0,
			total_items_sold: deriveTotalItemsSoldFromSummary(row.summary),
			target_revenue: null,
			has_target: false,
			daily_target: 0,
			shift_target: 0,
			daily_collected: 0,
			shift_collected: row.summary?.totalRevenue ?? 0,
			is_shift_target_met: false,
			is_daily_target_met: false,
		}));
	} else {
		// Fallback: pos_shifts not available, try pos_shift_reports view
		console.warn("[hybrid] pos_shifts query failed, falling back to pos_shift_reports");
		try {
			const result = await supabase
				.from("pos_shift_reports")
				.select("*")
				.order("start_time", { ascending: false });
			data = result.data;
			error = result.error;
		} catch (_err) {
			error = _err;
		}
	}

	if (error) throw error;

	const rows: ShiftStatusRecord["allShifts"] = (data ?? [])
		.map((row: any) => ({
			_id: row.shift_id,
			startTime: Number(row.start_time ?? 0),
			endTime: (() => {
				if (row.end_time === null || row.end_time === undefined) return undefined;
				const endTimeNum = Number(row.end_time);
				return Number.isFinite(endTimeNum) && endTimeNum > 0 ? endTimeNum : undefined;
			})(),
			shiftName: row.shift_name ?? "Shift",
			cashierName: row.cashier_name ?? "",
			teamMembers: row.team_members ?? "",
			isAutoClosed: Boolean((row.raw as any)?.auto_closed),
			revenue: Number(row.total_revenue ?? 0),
			cashRevenue: Number(row.cash_revenue ?? 0),
			qrisRevenue: Number(row.qris_revenue ?? 0),
			totalDiscount: Number(row.total_discount ?? 0),
			modalAwal: Number(row.starting_cash ?? 0),
			setoranAkhir:
				Number(row.starting_cash ?? 0) +
				Number(row.cash_revenue ?? 0) -
				Number(row.total_expenses ?? 0),
		}))
		.filter((row: ShiftStatusRecord["allShifts"][number]) => row.startTime > 0);

	const now = new Date();
	const todayStart = new Date(
		now.getFullYear(),
		now.getMonth(),
		now.getDate()
	).getTime();

	const ongoingShift = rows.find(
		(row: ShiftStatusRecord["allShifts"][number]) => row.endTime === undefined
	);

	const allShifts = rows
		.filter((row: ShiftStatusRecord["allShifts"][number]) => {
			if (row.startTime >= todayStart) return true;
			if (ongoingShift && row._id === ongoingShift._id) return true;
			return false;
		})
		.sort(
			(
				a: ShiftStatusRecord["allShifts"][number],
				b: ShiftStatusRecord["allShifts"][number]
			) => a.startTime - b.startTime
		);

	const latestCompletedShift = [...rows]
		.filter((row: ShiftStatusRecord["allShifts"][number]) => row.endTime !== undefined)
		.sort(
			(
				a: ShiftStatusRecord["allShifts"][number],
				b: ShiftStatusRecord["allShifts"][number]
			) => (b.endTime ?? 0) - (a.endTime ?? 0)
		)[0];

	return {
		isOpen: Boolean(ongoingShift),
		latestMulai: ongoingShift?.startTime ?? latestCompletedShift?.startTime ?? 0,
		latestAkhir: ongoingShift ? 0 : latestCompletedShift?.endTime ?? 0,
		shiftInfo: {
			cashierName: ongoingShift?.cashierName ?? latestCompletedShift?.cashierName,
			shiftName: ongoingShift?.shiftName ?? latestCompletedShift?.shiftName,
			shiftId: ongoingShift?._id,
		},
		ongoingShift: ongoingShift
			? {
					_id: ongoingShift._id,
					startTime: ongoingShift.startTime,
					endTime: ongoingShift.endTime,
					shiftName: ongoingShift.shiftName,
					cashierName: ongoingShift.cashierName,
					teamMembers: ongoingShift.teamMembers,
					startingCash: ongoingShift.modalAwal,
			  }
			: undefined,
		allShifts,
	} as ShiftStatusRecord;
}

import { getWibDayRange as _getWibDayRange, formatDayLabelWIB } from "@/lib/wib-utils";
const getWibDayRange = _getWibDayRange;

function formatWibDayLabel(referenceTime: number) {
	return formatDayLabelWIB(referenceTime);
}

function isSettledOrderRecord(order: OrderRecord) {
	return order.status === "paid" || order.status === "completed";
}

function isSettledBookingRecord(booking: BookingOrderRecord) {
	return (
		booking.paymentStatus === "paid" ||
		booking.bookingStatus === "confirmed" ||
		booking.bookingStatus === "completed"
	);
}

function getOrderFinancialSnapshot(order: OrderRecord) {
	const finalCollected = order.totalAmount ?? 0;
	const discount = order.discountAmount ?? 0;
	const tax = order.taxAmount ?? 0;
	const serviceCharge = order.serviceChargeAmount ?? 0;
	const netSales = Math.max(0, finalCollected - tax - serviceCharge);
	const grossSales = netSales + discount;

	return {
		finalCollected,
		grossSales,
		netSales,
		discount,
		tax,
		serviceCharge,
	};
}

function getBookingFinancialSnapshot(booking: BookingOrderRecord) {
	const finalCollected = booking.totalAmount ?? 0;
	return {
		finalCollected,
		grossSales: finalCollected,
		netSales: finalCollected,
		discount: 0,
		tax: 0,
		serviceCharge: 0,
	};
}

async function fetchDashboardStats() {
	const [
		orders,
		bookings,
		allProducts,
		inventory,
		detailedShifts,
		financialTransactions,
	] = await Promise.all([
		fetchOrders(),
		fetchBookingOrders(),
		fetchAllProducts(),
		fetchInventory(),
		fetchDetailedShifts(),
		fetchFinancialTransactions(),
	]);

	const now = Date.now();
	const todayRange = getWibDayRange(now);
	const todayOrders = orders.filter(
		(order) => order.createdAt >= todayRange.start && order.createdAt <= todayRange.end
	);
	const todayBookings = bookings.filter((booking) => {
		if (!booking.createdAt) return false;
		return (
			booking.createdAt >= todayRange.start &&
			booking.createdAt <= todayRange.end
		);
	});
	const todayShifts = detailedShifts.filter(
		(shift) => shift.startTime >= todayRange.start && shift.startTime <= todayRange.end
	);

	const settledTodayOrders = todayOrders.filter(isSettledOrderRecord);
	const settledTodayBookings = todayBookings.filter(isSettledBookingRecord);
	const todayPosRevenue = settledTodayOrders.reduce(
		(sum, order) => sum + getOrderFinancialSnapshot(order).finalCollected,
		0
	);
	const todayBookingRevenue = settledTodayBookings.reduce(
		(sum, booking) => sum + getBookingFinancialSnapshot(booking).finalCollected,
		0
	);
	const todayDiscount = settledTodayOrders.reduce(
		(sum, order) => sum + getOrderFinancialSnapshot(order).discount,
		0
	);
	const todayRevenue = todayPosRevenue + todayBookingRevenue;

	const cashDiscrepancySummary = todayShifts.reduce(
		(summary, shift) => {
			const cashGap = shift.endingCashPhysical - shift.endingCashExpected;
			const nonCashGap = shift.nonCashConfirmed - shift.nonCashExpected;

			return {
				totalPhysicalGap: summary.totalPhysicalGap + cashGap,
				totalNonCashGap: summary.totalNonCashGap + nonCashGap,
				highRiskShiftCount:
					summary.highRiskShiftCount +
					(Math.abs(cashGap) >= 50000 || Math.abs(nonCashGap) >= 50000 ? 1 : 0),
			};
		},
		{
			totalPhysicalGap: 0,
			totalNonCashGap: 0,
			highRiskShiftCount: 0,
		}
	);

	const pendingOrders = orders.filter((order) => order.status === "pending").length;
	const activeProducts = allProducts.filter((product) => product.isAvailable ?? false).length;
	const lowStockItems = [...inventory]
		.filter((item) => item.quantity <= item.lowStockThreshold)
		.sort((left, right) => {
			const leftGap = left.quantity - left.lowStockThreshold;
			const rightGap = right.quantity - right.lowStockThreshold;
			return leftGap - rightGap;
		});

	const todayTransactions = financialTransactions.filter(
		(tx) => tx.date >= todayRange.start && tx.date <= todayRange.end
	);
	const todayIncome = todayTransactions
		.filter((tx) => tx.type === "income" && tx.status === "completed")
		.reduce((sum, tx) => sum + tx.amount, 0);
	const todayExpense = todayTransactions
		.filter((tx) => tx.type === "expense" && tx.status === "completed")
		.reduce((sum, tx) => sum + tx.amount, 0);
	const totalIncome = financialTransactions
		.filter((tx) => tx.type === "income" && tx.status === "completed")
		.reduce((sum, tx) => sum + tx.amount, 0);
	const totalExpense = financialTransactions
		.filter((tx) => tx.type === "expense" && tx.status === "completed")
		.reduce((sum, tx) => sum + tx.amount, 0);

	const orderStatusBreakdown = {
		pending: orders.filter((order) => order.status === "pending").length,
		paid: orders.filter((order) => order.status === "paid").length,
		completed: orders.filter((order) => order.status === "completed").length,
		cancelled: orders.filter((order) => order.status === "cancelled").length,
	};

	const revenueLast7Days = Array.from({ length: 7 }, (_, index) => {
		const offset = 6 - index;
		const range = getWibDayRange(now - offset * DAY_MS);
		const dayOrders = orders.filter(
			(order) => order.createdAt >= range.start && order.createdAt <= range.end
		);
		const dayBookings = bookings.filter(
			(booking) =>
				booking.createdAt >= range.start && booking.createdAt <= range.end
		);
		const validOrders = dayOrders.filter(isSettledOrderRecord);
		const validBookings = dayBookings.filter(isSettledBookingRecord);
		const revenue =
			validOrders.reduce(
				(sum, order) => sum + getOrderFinancialSnapshot(order).finalCollected,
				0
			) +
			validBookings.reduce(
				(sum, booking) => sum + getBookingFinancialSnapshot(booking).finalCollected,
				0
			);
		const discount = validOrders.reduce(
			(sum, order) => sum + getOrderFinancialSnapshot(order).discount,
			0
		);

		return {
			date: formatWibDayLabel(range.start),
			revenue,
			discount,
			orders: validOrders.length + validBookings.length,
		};
	});

	const topProductsMap: Record<string, { name: string; count: number; revenue: number }> = {};
	[...orders]
		.sort((left, right) => right.createdAt - left.createdAt)
		.slice(0, 100)
		.filter(isSettledOrderRecord)
		.forEach((order) => {
			for (const item of order.items ?? []) {
				const productName = item.productName ?? "Unknown";
				if (!topProductsMap[productName]) {
					topProductsMap[productName] = { name: productName, count: 0, revenue: 0 };
				}
				topProductsMap[productName].count += Number(item.quantity ?? 0);
				topProductsMap[productName].revenue +=
					Number(item.price ?? 0) * Number(item.quantity ?? 0);
			}
		});

	const recentOrders = [...orders]
		.sort((left, right) => right.createdAt - left.createdAt)
		.slice(0, 10)
		.map((order) => ({
			_id: order._id,
			orderNumber: order.orderNumber ?? "N/A",
			totalAmount: order.totalAmount ?? 0,
			status: order.status,
			createdAt: order.createdAt ?? 0,
			customerName: order.customerName ?? null,
			paymentMethod: order.paymentMethod ?? null,
		}));

	const pendingNonCashOrders = todayOrders.filter(
		(order) =>
			order.status === "pending" &&
			(order.paymentMethod === "qris" || order.paymentMethod === "transfer")
	);

	const anomalies = [
		...todayShifts
			.filter((shift) => {
				const cashGap = shift.endingCashPhysical - shift.endingCashExpected;
				const nonCashGap = shift.nonCashConfirmed - shift.nonCashExpected;
				return Math.abs(cashGap) >= 10000 || Math.abs(nonCashGap) >= 10000;
			})
			.slice(0, 3)
			.map((shift) => {
				const cashGap = shift.endingCashPhysical - shift.endingCashExpected;
				const nonCashGap = shift.nonCashConfirmed - shift.nonCashExpected;
				return {
					type: "shift_discrepancy",
					severity:
						Math.abs(cashGap) >= 50000 || Math.abs(nonCashGap) >= 50000
							? "high"
							: "medium",
					title: `${shift.shiftName || "Shift"} selisih rekonsiliasi`,
					description: `Kas ${cashGap >= 0 ? "+" : ""}${cashGap.toLocaleString("id-ID")} | Non-tunai ${nonCashGap >= 0 ? "+" : ""}${nonCashGap.toLocaleString("id-ID")}`,
				} as const;
			}),
		...(pendingNonCashOrders.length > 0
			? [
					{
						type: "payment_reconciliation",
						severity: "medium" as const,
						title: "Pembayaran non-tunai belum selesai",
						description: `${pendingNonCashOrders.length} order QRIS/transfer masih pending hari ini`,
					},
			  ]
			: []),
		...(todayDiscount > 0 &&
		todayRevenue > 0 &&
		todayDiscount / (todayRevenue + todayDiscount) > 0.25
			? [
					{
						type: "discount_spike",
						severity: "medium" as const,
						title: "Potongan diskon relatif tinggi",
						description: `Diskon hari ini ${((todayDiscount / (todayRevenue + todayDiscount)) * 100).toFixed(1)}% dari gross sales`,
					},
			  ]
			: []),
	].slice(0, 4);

	return {
		todayOrders: todayOrders.length + todayBookings.length,
		todayRevenue,
		todayPosRevenue,
		todayBookingRevenue,
		todayDiscount,
		pendingOrders,
		activeProducts,
		totalProducts: allProducts.length,
		lowStockCount: lowStockItems.length,
		lowStockItems: lowStockItems.slice(0, 10).map((item) => ({
			_id: item._id,
			ingredientName: item.ingredientName ?? "Unknown",
			quantity: item.quantity ?? 0,
			unit: item.unit ?? "",
			lowStockThreshold: item.lowStockThreshold ?? 0,
		})),
		netBalance: totalIncome - totalExpense,
		totalIncome,
		totalExpense,
		todayIncome,
		todayExpense,
		orderStatusBreakdown,
		revenueLast7Days,
		topProducts: Object.values(topProductsMap)
			.sort((left, right) => right.count - left.count)
			.slice(0, 10),
		recentOrders,
		cashDiscrepancySummary,
		paymentReconciliation: {
			pendingNonCashCount: pendingNonCashOrders.length,
			pendingNonCashAmount: pendingNonCashOrders.reduce(
				(sum, order) => sum + (order.totalAmount ?? 0),
				0
			),
		},
		anomalies,
	} as DashboardStatsRecord;
}

export function useHybridSiteSettings(refreshTrigger?: number) {
	const supabaseData = useSupabaseValue("site-settings", fetchSiteSettings, [], {
		cacheKey: "customer:site-settings",
		cacheTtlMs: 600_000,
		...(refreshTrigger !== undefined ? { refreshTrigger } : {}),
	});
	return supabaseData as SiteSettingsRecord | undefined;
}

export function useHybridCategories(refreshTrigger?: number) {
	const supabaseData = useSupabaseValue("categories", fetchCategories, [], {
		cacheKey: "customer:categories",
		cacheTtlMs: 600_000,
		...(refreshTrigger !== undefined ? { refreshTrigger } : {}),
	});
	return supabaseData as CategoryRecord[] | undefined;
}

export function useHybridActiveDiscounts(refreshTrigger?: number) {
	const supabaseData = useSupabaseValue(
		"active-discounts",
		fetchActiveDiscounts,
		[],
		{
			cacheKey: "customer:active-discounts",
			cacheTtlMs: 300_000,
			...(refreshTrigger !== undefined ? { refreshTrigger } : {}),
		}
	);
	return supabaseData as DiscountRecord[] | undefined;
}

export function useHybridAllDiscounts(refreshTrigger?: number) {
	const supabaseData = useSupabaseValue("all-discounts", fetchAllDiscounts, [], refreshTrigger !== undefined ? { refreshTrigger } : undefined);
	return supabaseData as DiscountRecord[] | undefined;
}

export function useHybridOrders(options?: { status?: string; limit?: number; refreshTrigger?: number }) {
	const supabaseData = useSupabaseValue(
		`orders:${options?.status ?? "all"}:${options?.limit ?? "default"}`,
		() => fetchOrders(options),
		[options?.status, options?.limit],
		options?.refreshTrigger !== undefined ? { refreshTrigger: options.refreshTrigger } : undefined
	);
	return supabaseData as OrderRecord[] | undefined;
}

export function useHybridInventory(refreshTrigger?: number) {
	const supabaseData = useSupabaseValue("inventory", fetchInventory, [], refreshTrigger !== undefined ? { refreshTrigger } : undefined);
	return supabaseData as InventoryRecord[] | undefined;
}

export function useHybridLowStockItems(refreshTrigger?: number) {
	const inventory = useHybridInventory(refreshTrigger);

	return useMemo(() => {
		if (!inventory) return undefined;
		return [...inventory]
			.filter((item) => item.quantity <= item.lowStockThreshold)
			.sort((left, right) => {
				const leftGap = left.quantity - left.lowStockThreshold;
				const rightGap = right.quantity - right.lowStockThreshold;
				return leftGap - rightGap;
			});
	}, [inventory]);
}

export function useHybridProducts(categoryId?: string | null, refreshTrigger?: number) {
	const categories = useHybridCategories(refreshTrigger);
	const supabaseData = useSupabaseValue("products", fetchProducts, [], {
		cacheKey: "customer:products",
		cacheTtlMs: 600_000,
		...(refreshTrigger !== undefined ? { refreshTrigger } : {}),
	});

	return useMemo(() => {
		if (!supabaseData) return undefined;
		if (!categoryId) return supabaseData;
		if (!categories) return undefined;

		const childIds = categories
			.filter((category) => category.parentId === categoryId)
			.map((category) => category._id);
		const allowedCategoryIds = new Set([categoryId, ...childIds]);

		return supabaseData.filter((product) =>
			allowedCategoryIds.has(product.categoryId)
		);
	}, [categories, categoryId, supabaseData]);
}

export function useHybridBestSellers(refreshTrigger?: number) {
	const supabaseData = useSupabaseValue("best-sellers", fetchBestSellers, [], {
		cacheKey: "customer:best-sellers",
		cacheTtlMs: 300_000,
		...(refreshTrigger !== undefined ? { refreshTrigger } : {}),
	});
	return supabaseData as BestSellerRecord[] | undefined;
}

export function useHybridAllProducts(refreshTrigger?: number) {
	const supabaseData = useSupabaseValue("products-all", fetchAllProducts, [], refreshTrigger !== undefined ? { refreshTrigger } : undefined);
	return supabaseData as ProductRecord[] | undefined;
}

export function useHybridHppProductMap(refreshTrigger?: number) {
	const supabaseData = useSupabaseValue("hpp-product-map", fetchHppProductMap, [], refreshTrigger !== undefined ? { refreshTrigger } : undefined);
	return supabaseData as HppProductMapRecord | undefined;
}

export function useHybridLatestInventoryCosts(refreshTrigger?: number) {
	const supabaseData = useSupabaseValue(
		"inventory-latest-costs",
		fetchLatestInventoryCosts,
		[],
		refreshTrigger !== undefined ? { refreshTrigger } : undefined
	);
	return supabaseData as InventoryCostMapRecord | undefined;
}

export function useHybridShiftReportRows(refreshTrigger?: number) {
	// Bug #12: Polling 10 detik untuk ringkasan shift realtime.
	const supabaseData = useSupabaseValue(
		"shift-reports",
		fetchShiftReports,
		[],
		{ refreshMs: 10_000, ...(refreshTrigger !== undefined ? { refreshTrigger } : {}) }
	);
	return supabaseData as ShiftReportRecord[] | undefined;
}

export function useHybridCurrentMonthProgress(refreshTrigger?: number) {
	const supabaseData = useSupabaseValue(
		"current-month-progress",
		fetchCurrentMonthProgress,
		[],
		refreshTrigger !== undefined ? { refreshTrigger } : undefined
	);
	return supabaseData as CurrentMonthProgressRecord | undefined;
}

export function useHybridShiftDetails(
	args:
		| {
				startTime: number;
				endTime?: number;
		  }
		| "skip"
) {
	const supabaseData = useSupabaseValue(
		args === "skip"
			? "shift-details:skip"
			: `shift-details:${args.startTime}:${args.endTime ?? "open"}`,
		() => (args === "skip" ? Promise.resolve(null) : fetchShiftDetails(args)),
		[
			args === "skip" ? "skip" : args.startTime,
			args === "skip" ? "skip" : args.endTime,
		]
	);
	return supabaseData as any;
}

export function useHybridStaffRoles(refreshTrigger?: number) {
	const supabaseData = useSupabaseValue("staff-roles", fetchStaffRoles, [], refreshTrigger !== undefined ? { refreshTrigger } : undefined);
	return supabaseData as StaffRoleRecord[] | undefined;
}

export function useHybridStaffUsers(refreshTrigger?: number) {
	const supabaseData = useSupabaseValue("staff-users", fetchStaffUsers, [], refreshTrigger !== undefined ? { refreshTrigger } : undefined);
	return supabaseData as StaffUserRecord[] | undefined;
}

export function useHybridShiftStatus(refreshTrigger?: number) {
	const supabaseData = useSupabaseValue("shift-status", fetchShiftStatus, [], refreshTrigger !== undefined ? { refreshTrigger } : undefined);
	return supabaseData as ShiftStatusRecord | undefined;
}

export function useHybridDashboardStats() {
	const supabaseData = useSupabaseValue(
		"dashboard-stats",
		fetchDashboardStats,
		[]
	);
	return supabaseData as DashboardStatsRecord | undefined;
}


export function useHybridTransactionCosts(inventoryIds: string[]) {
	const [costs, setCosts] = useState<Record<string, number>>({});

	useEffect(() => {
		if (!inventoryIds.length || !inventoryIds.some(Boolean)) {
			setCosts({});
			return;
		}

		const validIds = inventoryIds.filter(Boolean);
		let cancelled = false;

		(async () => {
			const supabase = createClient();
			const { data, error } = await supabase
				.from("pos_financial_transactions")
				.select("inventoryId, amount, createdAt")
				.in("inventoryId", validIds)
				.eq("type", "expense")
				.order("createdAt", { ascending: false });

			if (error || cancelled) return;

			const map: Record<string, number> = {};
			for (const row of data ?? []) {
				const invId = String(row.inventoryId ?? "");
				if (invId && map[invId] === undefined) {
					map[invId] = Number(row.amount ?? 0);
				}
			}
			setCosts(map);
		})();

		return () => { cancelled = true; };
	}, [inventoryIds.filter(Boolean).sort().join(",")]);

	return costs;
}

export type {
	BookingOrderRecord,
	CategoryRecord,
	CurrentMonthProgressRecord,
	DashboardStatsRecord,
	DiscountRecord,
	FinancialTransactionRecord,
	HppProductMapEntry,
	HppProductMapRecord,
	InventoryRecord,
	InventoryCostMapRecord,
	OrderRecord,
	ProductRecord,
	ShiftOperationalRecord,
	ShiftStatusRecord,
	ShiftReportRecord,
	StaffRoleRecord,
	StaffUserRecord,
	SiteSettingsRecord,
};

