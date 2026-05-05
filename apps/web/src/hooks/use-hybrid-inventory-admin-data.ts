import { useEffect, useState } from "react";
import { createClient } from "@/lib/client";
import { useSupabaseLiveValue } from "@/hooks/use-supabase-live-value";

type InventoryStoreType = "store" | "supplier" | "market" | "other";

type InventoryStoreRecord = {
	_id: string;
	name: string;
	type: InventoryStoreType;
	phone?: string | null;
	address?: string | null;
	notes?: string | null;
	isActive: boolean;
};

type InventoryRecord = {
	_id: string;
	ingredientName: string;
	unit: string;
	quantity: number;
	lowStockThreshold: number;
	displayUnit?: string | null;
	conversionFactor?: number | null;
	unitConversions?: Array<{ unit: string; factor: number }> | null;
	baseRecipeId?: string | null;
	defaultBrandName?: string | null;
	preferredStoreId?: string | null;
	preferredPurchaseQuantity?: number | null;
	preferredPurchaseUnit?: string | null;
	lastPurchasePrice?: number | null;
	lastPurchaseAt?: number | null;
	lastPurchaseStoreId?: string | null;
	netWeight?: string | null;
	_creationTime?: number;
};

type RecipeRecord = {
	_id: string;
	productId: string;
	variantName?: string | null;
	ingredients: Array<{
		inventoryId: string;
		amount: number;
	}>;
};

type BaseRecipeRecord = {
	_id: string;
	name: string;
	description?: string | null;
	category?: string | null;
	targetUnit: string;
	targetQuantity: number;
	ingredients: Array<{
		inventoryId: string;
		amount: number;
	}>;
};

type ProductRecord = {
	_id: string;
	name: string;
	isAvailable: boolean;
};

type InventoryTransactionRecord = {
	_id: string;
	inventoryId: string;
	quantity: number;
	type: string;
	costPerUnit?: number | null;
	remainingQuantity?: number | null;
	timestamp: number;
	notes?: string | null;
	expiryDate?: number | null;
	brandName?: string | null;
	storeId?: string | null;
	purchaseUnit?: string | null;
	purchaseQuantity?: number | null;
	lineTotal?: number | null;
	sourceTransactionId?: string | null;
	sourceLabel?: string | null;
	sourceFingerprint?: string | null;
};

type FinancialTransactionRecord = {
	_id: string;
	type: string;
	amount: number;
	category?: string | null;
	merchant?: string | null;
	description?: string | null;
	date: number;
	metadata?: Record<string, any> | null;
};

type RealtimePriceMonitorData = {
	rows: Array<{
		inventoryId: string | null;
		ingredientName: string;
		nameKey: string;
		unit: string;
		displayUnit: string | null;
		conversionFactor: number | null;
		lastPrice: number;
		previousPrice: number | null;
		priceDelta: number | null;
		lastPurchaseAt: number;
		lastStoreName: string | null;
		lastBrandName: string | null;
		storeCount: number;
		brandCount: number;
		totalPurchases: number;
	}>;
	summary: {
		totalUniqueNames: number;
		totalRawTransactions: number;
		totalExpenseLines: number;
		totalRestockRows: number;
	};
};

type InventoryYumiAiInsightsData = {
	stockoutPredictions: Array<{
		inventoryId: string;
		ingredientName: string;
		unit: string;
		currentStock: number;
		avgDailyUsage: number;
		daysUntilStockout: number | null;
		reorderPoint: number;
		suggestedOrderQty: number;
		urgency: "high" | "medium" | "low";
	}>;
	supplierIntelligence: Array<{
		inventoryId: string;
		ingredientName: string;
		lastStoreName: string | null;
		lastPrice: number;
		recommendedStoreName: string | null;
		recommendedPrice: number | null;
		potentialSavings: number;
		storeOptions: Array<{
			storeName: string;
			avgPrice: number;
			minPrice: number;
			sampleCount: number;
		}>;
	}>;
	usageAnomalies: Array<{
		inventoryId: string;
		ingredientName: string;
		unit: string;
		avgDailyUsage7d: number;
		avgDailyUsage30d: number;
		anomalyType: "spike" | "drop" | null;
		reason: string;
	}>;
	similarNameGroups: Array<{
		groupKey: string;
		canonicalName: string;
		confidence: number;
		itemCount: number;
		items: Array<{
			inventoryId: string;
			ingredientName: string;
			normalizedName: string;
			unit: string;
			currentStock: number;
			lastPrice: number | null;
			lastPurchaseAt: number | null;
			lastStoreName: string | null;
			latestUpdateAt: number;
		}>;
	}>;
	summary: {
		predictionCount: number;
		supplierInsightCount: number;
		anomalyCount: number;
		similarNameGroupCount: number;
		refreshedAt: number;
	};
};

type InventoryWorkspaceData = {
	summary: {
		totalItems: number;
		totalStockUnits: number;
		lowStockCount: number;
		riskHighCount: number;
		riskMediumCount: number;
		recentUsageTxCount: number;
		recentRestockTxCount: number;
		daysWindow: number;
	};
	rows: Array<{
		inventoryId: string;
		ingredientName: string;
		currentStock: number;
		unit: string;
		displayUnit?: string | null;
		conversionFactor?: number | null;
		unitConversions?: Array<{ unit: string; factor: number }> | null;
		defaultBrandName: string | null;
		preferredStoreId: string | null;
		preferredStoreName: string | null;
		preferredPurchaseQuantity: number | null;
		preferredPurchaseUnit: string | null;
		lastPurchaseStoreName: string | null;
		lastPurchasePrice: number | null;
		lowStockThreshold: number;
		avgDailyUsage: number;
		daysUntilStockout: number | null;
		reorderPoint: number;
		suggestedOrderQty: number;
		riskLevel: "high" | "medium" | "low";
		status: "critical" | "warning" | "healthy";
		relatedProductCount: number;
		relatedRecipeCount: number;
		relatedBaseRecipeCount: number;
		activeRelatedProductCount: number;
		producedByBaseRecipeName: string | null;
		latestTransaction: {
			type: string;
			quantity: number;
			timestamp: number;
			notes?: string | null;
			brandName?: string | null;
			storeId?: string | null;
			costPerUnit?: number | null;
			purchaseQuantity?: number | null;
			purchaseUnit?: string | null;
		} | null;
	}>;
};

function useSupabaseValue<T>(
	key: string,
	load: () => Promise<T | null>,
	deps: readonly unknown[]
) {
	return useSupabaseLiveValue(key, load, deps);
}

function normalizeLookupText(input?: string | null) {
	return (input || "")
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[^\w\s]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function tokenizeName(input?: string | null) {
	return normalizeLookupText(input)
		.split(" ")
		.map((token) => token.trim())
		.filter((token) => token.length >= 2);
}

function getNameSimilarityScore(leftName: string, rightName: string) {
	const left = normalizeLookupText(leftName);
	const right = normalizeLookupText(rightName);
	if (!left || !right) return 0;
	if (left === right) return 1;
	if (left.includes(right) || right.includes(left)) {
		const shortLen = Math.min(left.length, right.length);
		return shortLen >= 6 ? 0.92 : 0.7;
	}
	const leftTokens = tokenizeName(leftName);
	const rightTokens = tokenizeName(rightName);
	if (leftTokens.length === 0 || rightTokens.length === 0) return 0;
	const rightSet = new Set(rightTokens);
	let exactOverlap = 0;
	for (const token of leftTokens) {
		if (rightSet.has(token)) exactOverlap += 1;
	}
	let fuzzyOverlap = 0;
	for (const leftToken of leftTokens) {
		for (const rightToken of rightTokens) {
			if (leftToken === rightToken) continue;
			if (leftToken.length < 4 || rightToken.length < 4) continue;
			if (leftToken.includes(rightToken) || rightToken.includes(leftToken)) {
				fuzzyOverlap += 0.7;
			}
		}
	}
	const denom = Math.max(leftTokens.length, rightTokens.length);
	const tokenSimilarity = (exactOverlap + fuzzyOverlap) / denom;
	if (exactOverlap >= 1 && tokenSimilarity >= 0.45) return Math.min(0.94, tokenSimilarity);
	if (exactOverlap >= 2 && tokenSimilarity >= 0.35) return Math.min(0.9, tokenSimilarity);
	return tokenSimilarity >= 0.6 ? Math.min(0.88, tokenSimilarity) : 0;
}

function isLikelyInventoryExpenseCategory(category?: string | null) {
	const value = (category || "").trim().toLowerCase();
	if (!value) return false;
	const positiveKeywords = [
		"inventory",
		"bahan",
		"stok",
		"stock",
		"suppl",
		"belanja",
		"pembelian",
		"bahan_baku",
		"makanan_minuman",
	];
	const negativeKeywords = [
		"hpp",
		"gaji",
		"salary",
		"sewa",
		"rent",
		"listrik",
		"internet",
		"marketing",
		"iklan",
		"transport",
	];
	if (negativeKeywords.some((keyword) => value.includes(keyword))) return false;
	return positiveKeywords.some((keyword) => value.includes(keyword));
}

async function fetchInventoryStores() {
	const supabase = createClient();
	const { data, error } = await supabase
		.from("pos_inventory_stores")
		.select("*")
		.order("name", { ascending: true });
	if (error) throw error;
	return (data ?? []).map((row: any) => ({
		_id: row._id,
		name: row.name ?? "",
		type: (row.type ?? "store") as InventoryStoreType,
		phone: row.phone ?? null,
		address: row.address ?? null,
		notes: row.notes ?? null,
		isActive: Boolean(row.isActive),
	})) as InventoryStoreRecord[];
}

async function fetchInventoryRows() {
	const supabase = createClient();
	const { data, error } = await supabase
		.from("pos_inventory")
		.select("*")
		.order("ingredientName", { ascending: true });
	if (error) throw error;
	return (data ?? []).map((row: any) => ({
		_id: row._id,
		ingredientName: row.ingredientName ?? "",
		unit: row.unit ?? "",
		quantity: Number(row.quantity ?? 0),
		lowStockThreshold: Number(row.lowStockThreshold ?? 0),
		displayUnit: row.displayUnit ?? null,
		conversionFactor:
			row.conversionFactor === null || row.conversionFactor === undefined
				? null
				: Number(row.conversionFactor),
		unitConversions: Array.isArray(row.unitConversions) ? row.unitConversions : null,
		baseRecipeId: row.baseRecipeId ?? null,
		defaultBrandName: row.defaultBrandName ?? null,
		preferredStoreId: row.preferredStoreId ?? null,
		preferredPurchaseQuantity:
			row.preferredPurchaseQuantity === null || row.preferredPurchaseQuantity === undefined
				? null
				: Number(row.preferredPurchaseQuantity),
		preferredPurchaseUnit: row.preferredPurchaseUnit ?? null,
		lastPurchasePrice:
			row.lastPurchasePrice === null || row.lastPurchasePrice === undefined
				? null
				: Number(row.lastPurchasePrice),
		lastPurchaseAt:
			row.lastPurchaseAt === null || row.lastPurchaseAt === undefined
				? null
				: Number(row.lastPurchaseAt),
		lastPurchaseStoreId: row.lastPurchaseStoreId ?? null,
		netWeight: row.net_weight ?? null,
		_creationTime:
			row._creationTime === null || row._creationTime === undefined
				? Number(row.lastPurchaseAt ?? 0)
				: Number(row._creationTime),
	})) as InventoryRecord[];
}

async function fetchRecipes() {
	const supabase = createClient();
	const { data, error } = await supabase.from("pos_recipes").select("*");
	if (error) throw error;
	return (data ?? []).map((row: any) => ({
		_id: row._id,
		productId: row.productId ?? "",
		variantName: row.variantName ?? null,
		ingredients: Array.isArray(row.ingredients)
			? row.ingredients.map((ingredient: any) => ({
					inventoryId: String(ingredient.inventoryId ?? ""),
					amount: Number(ingredient.amount ?? 0),
			  }))
			: [],
	})) as RecipeRecord[];
}

async function fetchBaseRecipes() {
	const supabase = createClient();
	const { data, error } = await supabase
		.from("pos_base_recipes")
		.select("*")
		.order("name", { ascending: true });
	if (error) throw error;
	return (data ?? []).map((row: any) => ({
		_id: row._id,
		name: row.name ?? "",
		description: row.description ?? null,
		category: row.category ?? null,
		targetUnit: row.targetUnit ?? "unit",
		targetQuantity: Number(row.targetQuantity ?? 0),
		ingredients: Array.isArray(row.ingredients)
			? row.ingredients.map((ingredient: any) => ({
					inventoryId: String(ingredient.inventoryId ?? ""),
					amount: Number(ingredient.amount ?? 0),
			  }))
			: [],
	})) as BaseRecipeRecord[];
}

async function fetchProductsAll() {
	const supabase = createClient();
	const { data, error } = await supabase.from("pos_products_all").select("*");
	if (error) throw error;
	return (data ?? []).map((row: any) => ({
		_id: row._id,
		name: row.name ?? "",
		isAvailable: Boolean(row.isAvailable),
	})) as ProductRecord[];
}

async function fetchInventoryTransactionsAll() {
	const supabase = createClient();
	const { data, error } = await supabase
		.from("pos_inventory_transactions")
		.select("*")
		.order("timestamp", { ascending: false })
		.limit(5000);
	if (error) throw error;
	return (data ?? []).map((row: any) => ({
		_id: row._id,
		inventoryId: row.inventoryId ?? "",
		quantity: Number(row.quantity ?? 0),
		type: row.type ?? "",
		costPerUnit:
			row.costPerUnit === null || row.costPerUnit === undefined
				? null
				: Number(row.costPerUnit),
		remainingQuantity:
			row.remainingQuantity === null || row.remainingQuantity === undefined
				? null
				: Number(row.remainingQuantity),
		timestamp: Number(row.timestamp ?? 0),
		notes: row.notes ?? null,
		expiryDate:
			row.expiryDate === null || row.expiryDate === undefined
				? null
				: Number(row.expiryDate),
		brandName: row.brandName ?? null,
		storeId: row.storeId ?? null,
		purchaseUnit: row.purchaseUnit ?? null,
		purchaseQuantity:
			row.purchaseQuantity === null || row.purchaseQuantity === undefined
				? null
				: Number(row.purchaseQuantity),
		lineTotal:
			row.lineTotal === null || row.lineTotal === undefined
				? null
				: Number(row.lineTotal),
		sourceTransactionId: row.sourceTransactionId ?? null,
		sourceLabel: row.sourceLabel ?? null,
		sourceFingerprint: row.sourceFingerprint ?? null,
	})) as InventoryTransactionRecord[];
}

async function fetchInventoryTransactionsByInventoryId(inventoryId: string) {
	const supabase = createClient();
	const { data, error } = await supabase
		.from("pos_inventory_transactions")
		.select("*")
		.eq("inventoryId", inventoryId)
		.order("timestamp", { ascending: false })
		.limit(100);
	if (error) throw error;
	return (data ?? []).map((row: any) => ({
		_id: row._id,
		inventoryId: row.inventoryId ?? "",
		quantity: Number(row.quantity ?? 0),
		type: row.type ?? "",
		costPerUnit:
			row.costPerUnit === null || row.costPerUnit === undefined
				? null
				: Number(row.costPerUnit),
		remainingQuantity:
			row.remainingQuantity === null || row.remainingQuantity === undefined
				? null
				: Number(row.remainingQuantity),
		timestamp: Number(row.timestamp ?? 0),
		notes: row.notes ?? null,
		expiryDate:
			row.expiryDate === null || row.expiryDate === undefined
				? null
				: Number(row.expiryDate),
		brandName: row.brandName ?? null,
		storeId: row.storeId ?? null,
		purchaseUnit: row.purchaseUnit ?? null,
		purchaseQuantity:
			row.purchaseQuantity === null || row.purchaseQuantity === undefined
				? null
				: Number(row.purchaseQuantity),
		lineTotal:
			row.lineTotal === null || row.lineTotal === undefined
				? null
				: Number(row.lineTotal),
		sourceTransactionId: row.sourceTransactionId ?? null,
		sourceLabel: row.sourceLabel ?? null,
		sourceFingerprint: row.sourceFingerprint ?? null,
	})) as InventoryTransactionRecord[];
}

async function fetchExpenseTransactions() {
	const supabase = createClient();
	const { data, error } = await supabase
		.from("pos_financial_transactions")
		.select("*")
		.eq("type", "expense")
		.order("date", { ascending: false })
		.limit(800);
	if (error) throw error;
	return (data ?? []).map((row: any) => ({
		_id: row._id,
		type: row.type ?? "",
		amount: Number(row.amount ?? 0),
		category: row.category ?? null,
		merchant: row.merchant ?? null,
		description: row.description ?? null,
		date: Number(row.date ?? 0),
		metadata:
			row.metadata && typeof row.metadata === "object" ? row.metadata : null,
	})) as FinancialTransactionRecord[];
}

function buildStoreLookup(stores: InventoryStoreRecord[]) {
	const map = new Map<string, { name: string; type: InventoryStoreType }>();
	for (const store of stores) {
		map.set(String(store._id), {
			name: store.name,
			type: store.type,
		});
	}
	return map;
}

async function loadWorkspace(daysWindow: number) {
	const [items, transactions, recipes, products, baseRecipes, stores] = await Promise.all([
		fetchInventoryRows(),
		fetchInventoryTransactionsAll(),
		fetchRecipes(),
		fetchProductsAll(),
		fetchBaseRecipes(),
		fetchInventoryStores(),
	]);

	const msPerDay = 24 * 60 * 60 * 1000;
	const cutoff = Date.now() - daysWindow * msPerDay;
	const usageRows = transactions.filter(
		(row) => row.type === "usage" && row.timestamp >= cutoff
	);
	const restockRows = transactions.filter(
		(row) => row.type === "restock" && row.timestamp >= cutoff
	);

	const usageByInventoryId: Record<string, number> = {};
	for (const row of usageRows) {
		const key = row.inventoryId;
		usageByInventoryId[key] =
			(usageByInventoryId[key] ?? 0) + Math.abs(Number(row.quantity) || 0);
	}

	const productById = new Map<string, ProductRecord>();
	for (const product of products) {
		productById.set(String(product._id), product);
	}

	const recipeImpactByInventoryId = new Map<
		string,
		{ recipeCount: number; productIds: Set<string>; activeProductCount: number }
	>();
	for (const recipe of recipes) {
		const linkedProduct = productById.get(String(recipe.productId)) ?? null;
		for (const ingredient of recipe.ingredients) {
			const key = String(ingredient.inventoryId);
			const current = recipeImpactByInventoryId.get(key) ?? {
				recipeCount: 0,
				productIds: new Set<string>(),
				activeProductCount: 0,
			};
			current.recipeCount += 1;
			if (linkedProduct) {
				const productId = String(linkedProduct._id);
				const hadProduct = current.productIds.has(productId);
				current.productIds.add(productId);
				if (!hadProduct && linkedProduct.isAvailable) current.activeProductCount += 1;
			}
			recipeImpactByInventoryId.set(key, current);
		}
	}

	const consumedByBaseRecipeCount = new Map<string, number>();
	const baseRecipeNameById = new Map<string, string>();
	for (const recipe of baseRecipes) {
		baseRecipeNameById.set(String(recipe._id), recipe.name);
		for (const ingredient of recipe.ingredients) {
			const key = String(ingredient.inventoryId);
			consumedByBaseRecipeCount.set(
				key,
				(consumedByBaseRecipeCount.get(key) ?? 0) + 1
			);
		}
	}

	const storeById = buildStoreLookup(stores);
	const latestTransactionByInventoryId = new Map<string, InventoryTransactionRecord>();
	for (const transaction of transactions) {
		const key = String(transaction.inventoryId);
		const current = latestTransactionByInventoryId.get(key);
		if (!current || transaction.timestamp > current.timestamp) {
			latestTransactionByInventoryId.set(key, transaction);
		}
	}

	let totalStockUnits = 0;
	let lowStockCount = 0;
	let riskHighCount = 0;
	let riskMediumCount = 0;

	const rows = items
		.map((item) => {
			const totalUsage = usageByInventoryId[String(item._id)] ?? 0;
			const avgDailyUsage = totalUsage / daysWindow;
			const daysUntilStockout =
				avgDailyUsage > 0 ? item.quantity / avgDailyUsage : Number.POSITIVE_INFINITY;
			const leadTimeDays = 3;
			const safetyDays = 2;
			const reorderPoint = Math.ceil(avgDailyUsage * (leadTimeDays + safetyDays));
			const suggestedOrderQty = Math.max(
				0,
				Math.ceil(avgDailyUsage * 7 - item.quantity)
			);

			const riskLevel: "high" | "medium" | "low" =
				daysUntilStockout <= 3 || item.quantity <= item.lowStockThreshold
					? "high"
					: daysUntilStockout <= 7
						? "medium"
						: "low";

			if (riskLevel === "high") riskHighCount += 1;
			if (riskLevel === "medium") riskMediumCount += 1;
			totalStockUnits += item.quantity;
			if (item.quantity <= item.lowStockThreshold) lowStockCount += 1;

			const relation = recipeImpactByInventoryId.get(String(item._id));
			const latestTransaction =
				latestTransactionByInventoryId.get(String(item._id)) ?? null;

			const status: "critical" | "warning" | "healthy" =
				item.quantity === 0 || riskLevel === "high"
					? "critical"
					: item.quantity <= reorderPoint || riskLevel === "medium"
						? "warning"
						: "healthy";

			return {
				inventoryId: String(item._id),
				ingredientName: item.ingredientName,
				currentStock: item.quantity,
				unit: item.unit,
				displayUnit: item.displayUnit ?? null,
				conversionFactor: item.conversionFactor ?? null,
				unitConversions: item.unitConversions ?? null,
				defaultBrandName: item.defaultBrandName ?? null,
				preferredStoreId: item.preferredStoreId ?? null,
				preferredStoreName:
					item.preferredStoreId != null
						? storeById.get(String(item.preferredStoreId))?.name ?? null
						: null,
				preferredPurchaseQuantity: item.preferredPurchaseQuantity ?? null,
				preferredPurchaseUnit: item.preferredPurchaseUnit ?? null,
				lastPurchaseStoreName:
					item.lastPurchaseStoreId != null
						? storeById.get(String(item.lastPurchaseStoreId))?.name ?? null
						: null,
				lastPurchasePrice: item.lastPurchasePrice ?? null,
				lowStockThreshold: item.lowStockThreshold,
				avgDailyUsage: Number(avgDailyUsage.toFixed(2)),
				daysUntilStockout:
					daysUntilStockout === Number.POSITIVE_INFINITY
						? null
						: Number(daysUntilStockout.toFixed(1)),
				reorderPoint,
				suggestedOrderQty,
				riskLevel,
				status,
				relatedProductCount: relation?.productIds.size ?? 0,
				relatedRecipeCount: relation?.recipeCount ?? 0,
				relatedBaseRecipeCount:
					consumedByBaseRecipeCount.get(String(item._id)) ?? 0,
				activeRelatedProductCount: relation?.activeProductCount ?? 0,
				producedByBaseRecipeName:
					item.baseRecipeId != null
						? baseRecipeNameById.get(String(item.baseRecipeId)) ?? null
						: null,
				latestTransaction: latestTransaction
					? {
							type: latestTransaction.type,
							quantity: latestTransaction.quantity,
							timestamp: latestTransaction.timestamp,
							notes: latestTransaction.notes ?? null,
							brandName: latestTransaction.brandName ?? null,
							storeId: latestTransaction.storeId ?? null,
							costPerUnit: latestTransaction.costPerUnit ?? null,
							purchaseQuantity: latestTransaction.purchaseQuantity ?? null,
							purchaseUnit: latestTransaction.purchaseUnit ?? null,
							sourceLabel: latestTransaction.sourceLabel ?? null,
							sourceFingerprint: latestTransaction.sourceFingerprint ?? null,
					  }
					: null,
				netWeight: item.netWeight ?? null,
			};
		})
		.sort((left, right) => {
			const rank: Record<"high" | "medium" | "low", number> = {
				high: 0,
				medium: 1,
				low: 2,
			};
			const riskDiff = rank[left.riskLevel] - rank[right.riskLevel];
			if (riskDiff !== 0) return riskDiff;
			return left.ingredientName.localeCompare(right.ingredientName, "id-ID");
		});

	return {
		summary: {
			totalItems: items.length,
			totalStockUnits,
			lowStockCount,
			riskHighCount,
			riskMediumCount,
			recentUsageTxCount: usageRows.length,
			recentRestockTxCount: restockRows.length,
			daysWindow,
		},
		rows,
	} as InventoryWorkspaceData;
}

async function loadItemImpact(inventoryId: string) {
	const [items, recipes, products, baseRecipes] = await Promise.all([
		fetchInventoryRows(),
		fetchRecipes(),
		fetchProductsAll(),
		fetchBaseRecipes(),
	]);
	const item = items.find((candidate) => String(candidate._id) === inventoryId);
	if (!item) return null;

	const impactedRecipes = recipes.filter((recipe) =>
		recipe.ingredients.some(
			(ingredient) => String(ingredient.inventoryId) === inventoryId
		)
	);
	const productById = new Map<string, ProductRecord>();
	for (const product of products) {
		productById.set(String(product._id), product);
	}
	const impactedProducts = impactedRecipes
		.map((recipe) => {
			const linkedProduct = productById.get(String(recipe.productId));
			if (!linkedProduct) return null;
			return {
				productId: String(linkedProduct._id),
				productName: linkedProduct.name,
				variantName: recipe.variantName ?? null,
				isAvailable: linkedProduct.isAvailable,
			};
		})
		.filter((row): row is NonNullable<typeof row> => row !== null);

	const consumedByBaseRecipes = baseRecipes
		.filter((baseRecipe) =>
			baseRecipe.ingredients.some(
				(ingredient) => String(ingredient.inventoryId) === inventoryId
			)
		)
		.map((baseRecipe) => ({
			baseRecipeId: String(baseRecipe._id),
			baseRecipeName: baseRecipe.name,
			targetQuantity: baseRecipe.targetQuantity,
			targetUnit: baseRecipe.targetUnit,
		}));

	const producedByBaseRecipe =
		item.baseRecipeId != null
			? baseRecipes.find(
					(baseRecipe) => String(baseRecipe._id) === String(item.baseRecipeId)
			  ) ?? null
			: null;

	return {
		item: {
			inventoryId: String(item._id),
			ingredientName: item.ingredientName,
			quantity: item.quantity,
			unit: item.unit,
			lowStockThreshold: item.lowStockThreshold,
		},
		impact: {
			productCount: impactedProducts.length,
			recipeCount: impactedRecipes.length,
			consumedByBaseRecipeCount: consumedByBaseRecipes.length,
			producedByBaseRecipeName: producedByBaseRecipe?.name ?? null,
			impactedProducts,
			consumedByBaseRecipes,
		},
	};
}

async function loadPriceInsights(inventoryId: string) {
	const [items, stores, transactions] = await Promise.all([
		fetchInventoryRows(),
		fetchInventoryStores(),
		fetchInventoryTransactionsByInventoryId(inventoryId),
	]);
	const item = items.find((candidate) => String(candidate._id) === inventoryId);
	if (!item) return null;

	const storeById = buildStoreLookup(stores);
	const purchaseRows = transactions.filter(
		(row) => row.type === "restock" && (row.costPerUnit ?? 0) > 0
	);
	const prices = purchaseRows
		.map((row) => row.costPerUnit ?? 0)
		.filter((price) => price > 0);
	const averagePrice =
		prices.length > 0
			? Number((prices.reduce((sum, price) => sum + price, 0) / prices.length).toFixed(2))
			: null;
	const lowestPrice = prices.length > 0 ? Math.min(...prices) : null;
	const latestPurchase = purchaseRows[0] ?? null;

	const storeComparisonMap = new Map<
		string,
		{
			storeId: string | null;
			storeName: string;
			storeType: InventoryStoreType | null;
			lastPrice: number | null;
			lowestPrice: number | null;
			lastPurchaseAt: number | null;
			purchaseCount: number;
		}
	>();
	const brandComparisonMap = new Map<
		string,
		{
			brandName: string;
			lastStoreName: string | null;
			lastPrice: number | null;
			lastPurchaseAt: number | null;
			purchaseCount: number;
		}
	>();

	for (const row of purchaseRows) {
		const storeKey = row.storeId ? String(row.storeId) : "__no_store__";
		const storeName = row.storeId
			? storeById.get(storeKey)?.name ?? "Toko tidak dikenal"
			: "Tanpa toko";
		const storeType = row.storeId ? storeById.get(storeKey)?.type ?? null : null;
		const currentStore = storeComparisonMap.get(storeKey) ?? {
			storeId: row.storeId ?? null,
			storeName,
			storeType,
			lastPrice: null,
			lowestPrice: null,
			lastPurchaseAt: null,
			purchaseCount: 0,
		};
		currentStore.purchaseCount += 1;
		if (currentStore.lastPurchaseAt == null || row.timestamp > currentStore.lastPurchaseAt) {
			currentStore.lastPurchaseAt = row.timestamp;
			currentStore.lastPrice = row.costPerUnit ?? null;
		}
		if (typeof row.costPerUnit === "number" && row.costPerUnit > 0) {
			currentStore.lowestPrice =
				currentStore.lowestPrice == null
					? row.costPerUnit
					: Math.min(currentStore.lowestPrice, row.costPerUnit);
		}
		storeComparisonMap.set(storeKey, currentStore);

		const brandName =
			row.brandName?.trim() || item.defaultBrandName?.trim() || "Tanpa brand";
		const currentBrand = brandComparisonMap.get(brandName) ?? {
			brandName,
			lastStoreName: null,
			lastPrice: null,
			lastPurchaseAt: null,
			purchaseCount: 0,
		};
		currentBrand.purchaseCount += 1;
		if (currentBrand.lastPurchaseAt == null || row.timestamp > currentBrand.lastPurchaseAt) {
			currentBrand.lastPurchaseAt = row.timestamp;
			currentBrand.lastPrice = row.costPerUnit ?? null;
			currentBrand.lastStoreName = storeName;
		}
		brandComparisonMap.set(brandName, currentBrand);
	}

	return {
		item: {
			inventoryId: String(item._id),
			ingredientName: item.ingredientName,
			defaultBrandName: item.defaultBrandName ?? null,
			preferredStoreId: item.preferredStoreId ?? null,
			preferredStoreName:
				item.preferredStoreId != null
					? storeById.get(String(item.preferredStoreId))?.name ?? null
					: null,
			lastPurchasePrice: item.lastPurchasePrice ?? null,
			lastPurchaseAt: item.lastPurchaseAt ?? null,
			lastPurchaseStoreName:
				item.lastPurchaseStoreId != null
					? storeById.get(String(item.lastPurchaseStoreId))?.name ?? null
					: null,
		},
		priceSnapshot: {
			lastPrice: latestPurchase?.costPerUnit ?? item.lastPurchasePrice ?? null,
			lastPurchaseAt: latestPurchase?.timestamp ?? item.lastPurchaseAt ?? null,
			lowestPrice,
			averagePrice,
		},
		storeComparison: [...storeComparisonMap.values()].sort(
			(left, right) => (right.lastPurchaseAt ?? 0) - (left.lastPurchaseAt ?? 0)
		),
		brandComparison: [...brandComparisonMap.values()].sort(
			(left, right) => (right.lastPurchaseAt ?? 0) - (left.lastPurchaseAt ?? 0)
		),
		recentPurchases: purchaseRows.slice(0, 20).map((row) => ({
			transactionId: row._id,
			timestamp: row.timestamp,
			quantity: row.quantity,
			costPerUnit: row.costPerUnit ?? null,
			lineTotal: row.lineTotal ?? null,
			brandName: row.brandName ?? null,
			storeName:
				row.storeId != null
					? storeById.get(String(row.storeId))?.name ?? "Toko tidak dikenal"
					: "Tanpa toko",
			purchaseQuantity: row.purchaseQuantity ?? null,
			purchaseUnit: row.purchaseUnit ?? null,
			notes: row.notes ?? null,
		})),
	};
}

async function loadRealtimePriceMonitor(limit: number, search?: string) {
	const keyword = (search ?? "").trim().toLowerCase();
	const [items, stores, transactions, expenseRows] = await Promise.all([
		fetchInventoryRows(),
		fetchInventoryStores(),
		fetchInventoryTransactionsAll(),
		fetchExpenseTransactions(),
	]);

	const restockRows = transactions
		.filter((row) => row.type === "restock")
		.sort((left, right) => right.timestamp - left.timestamp)
		.slice(0, 1200);
	const storeById = buildStoreLookup(stores);
	const itemById = new Map<string, InventoryRecord>();
	const itemByName = new Map<string, InventoryRecord>();
	for (const item of items) {
		itemById.set(String(item._id), item);
		itemByName.set(item.ingredientName.trim().toLowerCase(), item);
	}

	const aggregate = new Map<
		string,
		{
			inventoryName: string;
			nameKey: string;
			unit: string;
			displayUnit: string | null;
			conversionFactor: number | null;
			lastPrice: number;
			previousPrice: number | null;
			lastPurchaseAt: number;
			lastStoreName: string | null;
			lastBrandName: string | null;
			totalPurchases: number;
			storeSet: Set<string>;
			brandSet: Set<string>;
			latestInventoryId: string | null;
		}
	>();

	let expenseLineCount = 0;

	for (const row of restockRows) {
		if (typeof row.costPerUnit !== "number" || row.costPerUnit <= 0) continue;
		const item = itemById.get(String(row.inventoryId));
		if (!item) continue;
		const rawName = item.ingredientName.trim();
		if (!rawName) continue;
		const rawNameLower = rawName.toLowerCase();
		if (rawNameLower.includes("hpp pesanan")) continue;

		const nameKey = rawNameLower;
		const storeName =
			row.storeId != null
				? storeById.get(String(row.storeId))?.name ?? "Toko tidak dikenal"
				: "Tanpa toko";
		const brandName =
			row.brandName?.trim() || item.defaultBrandName?.trim() || null;

		const existing = aggregate.get(nameKey);
		if (!existing) {
			const storeSet = new Set<string>();
			const brandSet = new Set<string>();
			storeSet.add(storeName);
			if (brandName) brandSet.add(brandName);
			aggregate.set(nameKey, {
				inventoryName: rawName,
				nameKey,
				unit: item.unit,
				displayUnit: item.displayUnit ?? null,
				conversionFactor: item.conversionFactor ?? null,
				lastPrice: row.costPerUnit,
				previousPrice: null,
				lastPurchaseAt: row.timestamp,
				lastStoreName: storeName,
				lastBrandName: brandName,
				totalPurchases: 1,
				storeSet,
				brandSet,
				latestInventoryId: String(item._id),
			});
			continue;
		}

		existing.totalPurchases += 1;
		existing.storeSet.add(storeName);
		if (brandName) existing.brandSet.add(brandName);
		if (existing.previousPrice == null) existing.previousPrice = row.costPerUnit;
	}

	for (const expense of expenseRows) {
		const isInventoryExpense = isLikelyInventoryExpenseCategory(expense.category);
		const fallbackStoreName = expense.merchant?.trim() || "Tanpa toko";
		const scanItems = expense.metadata?.scanItems ?? [];
		const normalizedScanItems =
			scanItems.length > 0
				? scanItems
				: isInventoryExpense
					? [
							{
								name:
									expense.description?.trim() ||
									expense.category?.trim() ||
									"Pengeluaran",
								quantity: 1,
								price: expense.amount,
								total: expense.amount,
								unit: "unit",
							},
					  ]
					: [];
		if (normalizedScanItems.length === 0) continue;

		for (const line of normalizedScanItems) {
			const lineName = String(line.name ?? "").trim();
			if (!lineName) continue;
			const lineNameLower = lineName.toLowerCase();
			if (lineNameLower.includes("hpp pesanan")) continue;
			const quantity = Number(line.quantity) || 0;
			const unitPrice =
				typeof line.price === "number" && line.price > 0
					? line.price
					: typeof line.total === "number" && line.total > 0 && quantity > 0
						? line.total / quantity
						: 0;
			if (unitPrice <= 0) continue;

			expenseLineCount += 1;
			const matchedItem = itemByName.get(lineNameLower) ?? null;
			const displayUnit = String(line.unit ?? "").trim() || matchedItem?.displayUnit || null;
			const baseUnit = matchedItem?.unit || displayUnit || "unit";
			const conversionFactor = matchedItem?.conversionFactor ?? null;
			const existing = aggregate.get(lineNameLower);

			if (!existing) {
				const storeSet = new Set<string>();
				storeSet.add(fallbackStoreName);
				aggregate.set(lineNameLower, {
					inventoryName: lineName,
					nameKey: lineNameLower,
					unit: baseUnit,
					displayUnit,
					conversionFactor,
					lastPrice: unitPrice,
					previousPrice: null,
					lastPurchaseAt: expense.date,
					lastStoreName: fallbackStoreName,
					lastBrandName: null,
					totalPurchases: 1,
					storeSet,
					brandSet: new Set<string>(),
					latestInventoryId: matchedItem ? String(matchedItem._id) : null,
				});
				continue;
			}

			existing.totalPurchases += 1;
			existing.storeSet.add(fallbackStoreName);
			if (expense.date > existing.lastPurchaseAt) {
				existing.lastPurchaseAt = expense.date;
				existing.lastPrice = unitPrice;
				existing.lastStoreName = fallbackStoreName;
				existing.lastBrandName = null;
				if (matchedItem?._id) existing.latestInventoryId = String(matchedItem._id);
			} else if (existing.previousPrice == null) {
				existing.previousPrice = unitPrice;
			}
			if (existing.previousPrice == null && existing.lastPrice !== unitPrice) {
				existing.previousPrice = unitPrice;
			}
		}
	}

	for (const item of items) {
		const nameKey = item.ingredientName.trim().toLowerCase();
		if (!nameKey || aggregate.has(nameKey)) continue;
		if (nameKey.includes("hpp pesanan")) continue;
		if (
			typeof item.lastPurchasePrice !== "number" ||
			Number.isNaN(item.lastPurchasePrice) ||
			item.lastPurchasePrice <= 0
		) {
			continue;
		}
		aggregate.set(nameKey, {
			inventoryName: item.ingredientName.trim(),
			nameKey,
			unit: item.unit,
			displayUnit: item.displayUnit ?? null,
			conversionFactor: item.conversionFactor ?? null,
			lastPrice: item.lastPurchasePrice,
			previousPrice: null,
			lastPurchaseAt: item.lastPurchaseAt ?? item._creationTime ?? 0,
			lastStoreName:
				item.lastPurchaseStoreId != null
					? storeById.get(String(item.lastPurchaseStoreId))?.name ?? "Toko tidak dikenal"
					: null,
			lastBrandName: item.defaultBrandName ?? null,
			totalPurchases: 1,
			storeSet: new Set<string>(),
			brandSet: item.defaultBrandName ? new Set<string>([item.defaultBrandName]) : new Set<string>(),
			latestInventoryId: String(item._id),
		});
	}

	const rows = [...aggregate.values()]
		.filter((row) => {
			if (!keyword) return true;
			return [
				row.inventoryName,
				row.lastStoreName ?? "",
				row.lastBrandName ?? "",
				row.unit,
				row.displayUnit ?? "",
			]
				.join(" ")
				.toLowerCase()
				.includes(keyword);
		})
		.sort((left, right) => right.lastPurchaseAt - left.lastPurchaseAt)
		.slice(0, limit)
		.map((row) => {
			const priceDelta =
				row.previousPrice != null
					? Number((row.lastPrice - row.previousPrice).toFixed(2))
					: null;
			return {
				inventoryId: row.latestInventoryId ?? null,
				ingredientName: row.inventoryName,
				nameKey: row.nameKey,
				unit: row.unit,
				displayUnit: row.displayUnit,
				conversionFactor: row.conversionFactor,
				lastPrice: row.lastPrice,
				previousPrice: row.previousPrice,
				priceDelta,
				lastPurchaseAt: row.lastPurchaseAt,
				lastStoreName: row.lastStoreName,
				lastBrandName: row.lastBrandName,
				storeCount: row.storeSet.size,
				brandCount: row.brandSet.size,
				totalPurchases: row.totalPurchases,
			};
		});

	return {
		rows,
		summary: {
			totalUniqueNames: rows.length,
			totalRawTransactions: restockRows.length + expenseRows.length,
			totalExpenseLines: expenseLineCount,
			totalRestockRows: restockRows.length,
		},
	} as RealtimePriceMonitorData;
}

async function loadYumiInsights(limit: number) {
	const now = Date.now();
	const dayMs = 24 * 60 * 60 * 1000;
	const cutoff7 = now - 7 * dayMs;
	const cutoff30 = now - 30 * dayMs;
	const cutoff90 = now - 90 * dayMs;

	const [items, stores, transactions] = await Promise.all([
		fetchInventoryRows(),
		fetchInventoryStores(),
		fetchInventoryTransactionsAll(),
	]);
	const usageRows = transactions.filter(
		(row) => row.type === "usage" && row.timestamp >= cutoff30
	);
	const restockRows = transactions.filter(
		(row) => row.type === "restock" && row.timestamp >= cutoff90
	);

	const storeById = buildStoreLookup(stores);
	const usage30ByInventory = new Map<string, number>();
	const usage7ByInventory = new Map<string, number>();
	const latestTxAtByInventory = new Map<string, number>();
	for (const row of usageRows) {
		const key = String(row.inventoryId);
		const qty = Math.abs(Number(row.quantity) || 0);
		if (qty <= 0) continue;
		usage30ByInventory.set(key, (usage30ByInventory.get(key) ?? 0) + qty);
		if (row.timestamp >= cutoff7) {
			usage7ByInventory.set(key, (usage7ByInventory.get(key) ?? 0) + qty);
		}
	}
	for (const row of transactions) {
		const key = String(row.inventoryId);
		const current = latestTxAtByInventory.get(key) ?? 0;
		if ((row.timestamp ?? 0) > current) latestTxAtByInventory.set(key, row.timestamp ?? 0);
	}

	const stockoutPredictions = items
		.map((item) => {
			const key = String(item._id);
			const totalUsage30 = usage30ByInventory.get(key) ?? 0;
			const avgDailyUsage = totalUsage30 / 30;
			const daysUntilStockout =
				avgDailyUsage > 0 ? item.quantity / avgDailyUsage : Number.POSITIVE_INFINITY;
			const leadTimeDays = 3;
			const safetyDays = 2;
			const reorderPoint = Math.ceil(avgDailyUsage * (leadTimeDays + safetyDays));
			const suggestedOrderQty = Math.max(0, Math.ceil(avgDailyUsage * 7 - item.quantity));
			const urgency: "high" | "medium" | "low" =
				daysUntilStockout <= 3 || item.quantity <= item.lowStockThreshold
					? "high"
					: daysUntilStockout <= 7
						? "medium"
						: "low";
			return {
				inventoryId: String(item._id),
				ingredientName: item.ingredientName,
				unit: item.unit,
				currentStock: item.quantity,
				avgDailyUsage: Number(avgDailyUsage.toFixed(2)),
				daysUntilStockout:
					daysUntilStockout === Number.POSITIVE_INFINITY
						? null
						: Number(daysUntilStockout.toFixed(1)),
				reorderPoint,
				suggestedOrderQty,
				urgency,
			};
		})
		.sort((left, right) => {
			const rank: Record<"high" | "medium" | "low", number> = {
				high: 0,
				medium: 1,
				low: 2,
			};
			const urgencyDiff = rank[left.urgency] - rank[right.urgency];
			if (urgencyDiff !== 0) return urgencyDiff;
			const leftDays = left.daysUntilStockout ?? 999;
			const rightDays = right.daysUntilStockout ?? 999;
			return leftDays - rightDays;
		})
		.slice(0, limit);

	const supplierAggregate = new Map<
		string,
		{
			inventoryId: string;
			ingredientName: string;
			lastPrice: number;
			lastStoreName: string | null;
			storeStats: Map<
				string,
				{ storeName: string; count: number; totalPrice: number; minPrice: number }
			>;
		}
	>();
	for (const row of restockRows) {
		if (typeof row.costPerUnit !== "number" || row.costPerUnit <= 0) continue;
		const item = items.find((candidate) => String(candidate._id) === String(row.inventoryId));
		if (!item) continue;
		const key = String(item._id);
		const storeName =
			row.storeId != null
				? storeById.get(String(row.storeId))?.name ?? "Toko tidak dikenal"
				: "Tanpa toko";
		const current = supplierAggregate.get(key) ?? {
			inventoryId: String(item._id),
			ingredientName: item.ingredientName,
			lastPrice: row.costPerUnit,
			lastStoreName: storeName,
			storeStats: new Map<
				string,
				{ storeName: string; count: number; totalPrice: number; minPrice: number }
			>(),
		};
		if (row.timestamp > (item.lastPurchaseAt ?? 0)) {
			current.lastPrice = row.costPerUnit;
			current.lastStoreName = storeName;
		}
		const storeKey = row.storeId != null ? String(row.storeId) : "__none__";
		const storeStat = current.storeStats.get(storeKey) ?? {
			storeName,
			count: 0,
			totalPrice: 0,
			minPrice: Number.POSITIVE_INFINITY,
		};
		storeStat.count += 1;
		storeStat.totalPrice += row.costPerUnit;
		storeStat.minPrice = Math.min(storeStat.minPrice, row.costPerUnit);
		current.storeStats.set(storeKey, storeStat);
		supplierAggregate.set(key, current);
	}

	const supplierIntelligence = [...supplierAggregate.values()]
		.map((row) => {
			const options = [...row.storeStats.values()]
				.filter((store) => store.count > 0)
				.map((store) => ({
					storeName: store.storeName,
					avgPrice: store.totalPrice / store.count,
					minPrice: store.minPrice,
					sampleCount: store.count,
				}))
				.sort((left, right) => left.avgPrice - right.avgPrice);
			const best = options[0] ?? null;
			const savings =
				best && row.lastPrice > 0
					? Number((row.lastPrice - best.avgPrice).toFixed(2))
					: 0;
			return {
				inventoryId: row.inventoryId,
				ingredientName: row.ingredientName,
				lastStoreName: row.lastStoreName,
				lastPrice: row.lastPrice,
				recommendedStoreName: best?.storeName ?? null,
				recommendedPrice: best != null ? Number(best.avgPrice.toFixed(2)) : null,
				potentialSavings: savings > 0 ? savings : 0,
				storeOptions: options.slice(0, 3),
			};
		})
		.sort((left, right) => right.potentialSavings - left.potentialSavings)
		.slice(0, limit);

	const usageAnomalies = items
		.map((item) => {
			const key = String(item._id);
			const usage30 = usage30ByInventory.get(key) ?? 0;
			const usage7 = usage7ByInventory.get(key) ?? 0;
			const avg7 = usage7 / 7;
			const avg30 = usage30 / 30;
			const spikeRatio = avg30 > 0 ? avg7 / avg30 : 0;
			const dropRatio = avg30 > 0 ? avg7 / avg30 : 1;
			let anomalyType: "spike" | "drop" | null = null;
			let reason = "";
			if (avg30 >= 0.5 && spikeRatio >= 1.8) {
				anomalyType = "spike";
				reason = `Pemakaian 7 hari naik ${Number((spikeRatio * 100).toFixed(0))}% vs baseline 30 hari`;
			} else if (avg30 >= 0.5 && dropRatio <= 0.35) {
				anomalyType = "drop";
				reason = `Pemakaian 7 hari turun tajam ke ${Number((dropRatio * 100).toFixed(0))}% dari baseline`;
			}
			return {
				inventoryId: String(item._id),
				ingredientName: item.ingredientName,
				unit: item.unit,
				avgDailyUsage7d: Number(avg7.toFixed(2)),
				avgDailyUsage30d: Number(avg30.toFixed(2)),
				anomalyType,
				reason,
			};
		})
		.filter((row) => row.anomalyType != null)
		.sort((left, right) => {
			const leftDelta = Math.abs(left.avgDailyUsage7d - left.avgDailyUsage30d);
			const rightDelta = Math.abs(right.avgDailyUsage7d - right.avgDailyUsage30d);
			return rightDelta - leftDelta;
		})
		.slice(0, limit);

	const parentByIndex: number[] = [];
	const rankByIndex: number[] = [];
	for (let i = 0; i < items.length; i += 1) {
		parentByIndex[i] = i;
		rankByIndex[i] = 0;
	}
	const findIndex = (value: number): number => {
		if (parentByIndex[value] !== value) {
			parentByIndex[value] = findIndex(parentByIndex[value]);
		}
		return parentByIndex[value];
	};
	const unionIndex = (left: number, right: number) => {
		const rootLeft = findIndex(left);
		const rootRight = findIndex(right);
		if (rootLeft === rootRight) return;
		if (rankByIndex[rootLeft] < rankByIndex[rootRight]) {
			parentByIndex[rootLeft] = rootRight;
			return;
		}
		if (rankByIndex[rootLeft] > rankByIndex[rootRight]) {
			parentByIndex[rootRight] = rootLeft;
			return;
		}
		parentByIndex[rootRight] = rootLeft;
		rankByIndex[rootLeft] += 1;
	};
	for (let i = 0; i < items.length; i += 1) {
		for (let j = i + 1; j < items.length; j += 1) {
			const score = getNameSimilarityScore(items[i].ingredientName, items[j].ingredientName);
			if (score >= 0.55) unionIndex(i, j);
		}
	}
	const groupedByRoot = new Map<number, Array<InventoryRecord>>();
	for (let i = 0; i < items.length; i += 1) {
		const root = findIndex(i);
		const current = groupedByRoot.get(root) ?? [];
		current.push(items[i]);
		groupedByRoot.set(root, current);
	}

	const similarNameGroups = [...groupedByRoot.values()]
		.filter((group) => group.length >= 2)
		.map((group) => {
			const enriched = group
				.map((item) => {
					const key = String(item._id);
					const latestTransactionAt = latestTxAtByInventory.get(key) ?? 0;
					const latestUpdateAt = Math.max(
						item.lastPurchaseAt ?? 0,
						latestTransactionAt,
						item._creationTime ?? 0
					);
					return {
						inventoryId: String(item._id),
						ingredientName: item.ingredientName,
						normalizedName: normalizeLookupText(item.ingredientName),
						unit: item.unit,
						currentStock: item.quantity,
						lastPrice: item.lastPurchasePrice ?? null,
						lastPurchaseAt: item.lastPurchaseAt ?? null,
						lastStoreName:
							item.lastPurchaseStoreId != null
								? storeById.get(String(item.lastPurchaseStoreId))?.name ??
								  "Toko tidak dikenal"
								: null,
						latestUpdateAt,
					};
				})
				.sort((left, right) => right.latestUpdateAt - left.latestUpdateAt);

			const newest = enriched[0];
			const canonicalName = newest?.ingredientName ?? group[0].ingredientName;
			const scores: number[] = [];
			for (let i = 0; i < enriched.length; i += 1) {
				for (let j = i + 1; j < enriched.length; j += 1) {
					scores.push(getNameSimilarityScore(enriched[i].ingredientName, enriched[j].ingredientName));
				}
			}
			const avgScore =
				scores.length > 0
					? scores.reduce((sum, score) => sum + score, 0) / scores.length
					: 0;
			return {
				groupKey: normalizeLookupText(canonicalName) || String(newest?.inventoryId),
				canonicalName,
				confidence: Number(avgScore.toFixed(2)),
				itemCount: enriched.length,
				items: enriched,
			};
		})
		.sort((left, right) => {
			if (right.itemCount !== left.itemCount) return right.itemCount - left.itemCount;
			const leftLatest = left.items[0]?.latestUpdateAt ?? 0;
			const rightLatest = right.items[0]?.latestUpdateAt ?? 0;
			return rightLatest - leftLatest;
		})
		.slice(0, Math.max(limit, 20));

	return {
		stockoutPredictions,
		supplierIntelligence,
		usageAnomalies,
		similarNameGroups,
		summary: {
			predictionCount: stockoutPredictions.length,
			supplierInsightCount: supplierIntelligence.length,
			anomalyCount: usageAnomalies.length,
			similarNameGroupCount: similarNameGroups.length,
			refreshedAt: now,
		},
	} as InventoryYumiAiInsightsData;
}

export function useHybridInventoryStores() {
	const supabaseData = useSupabaseValue("inventory-stores", fetchInventoryStores, []);
	return supabaseData as any;
}

export function useHybridBaseRecipes() {
	const supabaseData = useSupabaseValue("base-recipes", fetchBaseRecipes, []);
	return supabaseData as any;
}

export function useHybridRecipes() {
	const supabaseData = useSupabaseValue("recipes", fetchRecipes, []);
	return supabaseData as any;
}

export function useHybridInventoryWorkspace(options?: { daysWindow?: number }) {
	const daysWindow = Math.max(1, Math.min(90, options?.daysWindow ?? 30));
	const supabaseData = useSupabaseValue(
		`inventory-workspace:${daysWindow}`,
		() => loadWorkspace(daysWindow),
		[daysWindow]
	);
	return supabaseData as any;
}

export function useHybridRealtimePriceMonitor(options?: {
	limit?: number;
	search?: string;
}) {
	const limit = Math.max(20, Math.min(500, Math.floor(options?.limit ?? 200)));
	const search = options?.search;
	const supabaseData = useSupabaseValue(
		`inventory-realtime:${limit}:${search ?? ""}`,
		() => loadRealtimePriceMonitor(limit, search),
		[limit, search]
	);
	return supabaseData as RealtimePriceMonitorData | undefined;
}

export function useHybridInventoryYumiAiInsights(options?: { limit?: number }) {
	const limit = Math.max(10, Math.min(150, Math.floor(options?.limit ?? 40)));
	const supabaseData = useSupabaseValue(
		`inventory-yumi-insights:${limit}`,
		() => loadYumiInsights(limit),
		[limit]
	);
	return supabaseData as InventoryYumiAiInsightsData | undefined;
}

export function useHybridInventoryItemImpact(
	inventoryId: string | null | undefined
) {
	const supabaseData = useSupabaseValue(
		`inventory-impact:${inventoryId ?? "none"}`,
		() => (inventoryId ? loadItemImpact(String(inventoryId)) : Promise.resolve(null)),
		[inventoryId]
	);
	return supabaseData as any;
}

export function useHybridInventoryTransactions(
	inventoryId: string | null | undefined
) {
	const supabaseData = useSupabaseValue(
		`inventory-transactions:${inventoryId ?? "none"}`,
		() =>
			inventoryId
				? fetchInventoryTransactionsByInventoryId(String(inventoryId))
				: Promise.resolve(null),
		[inventoryId]
	);
	return supabaseData as any;
}

export function useHybridInventoryItemBatches(
	inventoryId: string | null | undefined
) {
	const supabaseData = useSupabaseValue(
		`inventory-batches:${inventoryId ?? "none"}`,
		async () => {
			if (!inventoryId) return null;
			const transactions = await fetchInventoryTransactionsByInventoryId(
				String(inventoryId)
			);
			return transactions
				.filter(
					(batch) =>
						(batch.type === "restock" || batch.type === "production") &&
						(batch.remainingQuantity ?? 0) > 0
				)
				.sort((left, right) => right.timestamp - left.timestamp);
		},
		[inventoryId]
	);
	return supabaseData as any;
}

export function useHybridInventoryPriceInsights(
	inventoryId: string | null | undefined
) {
	const supabaseData = useSupabaseValue(
		`inventory-price-insights:${inventoryId ?? "none"}`,
		() =>
			inventoryId
				? loadPriceInsights(String(inventoryId))
				: Promise.resolve(null),
		[inventoryId]
	);
	return supabaseData as any;
}

