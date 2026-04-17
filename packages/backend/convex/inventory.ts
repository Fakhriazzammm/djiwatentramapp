import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { api } from "./_generated/api";
import type { MutationCtx } from "./_generated/server";
import { action, internalMutation, mutation, query } from "./_generated/server";

type StockActionArgs = {
	inventoryId: Id<"inventory">;
	quantity: number;
	notes?: string;
	costPerUnit?: number;
	timestamp?: number;
	expiryDate?: number;
	brandName?: string;
	storeId?: Id<"inventoryStores">;
	purchaseUnit?: string;
	purchaseQuantity?: number;
	lineTotal?: number;
};

type RiskLevel = "high" | "medium" | "low";

type StoreSummary = {
	name: string;
	type: Doc<"inventoryStores">["type"];
};

type UnitConversion = {
	unit: string;
	factor: number;
};

type InventoryAuditSnapshot = {
	ingredientName: string;
	unit: string;
	quantity: number;
	lowStockThreshold: number;
	displayUnit?: string;
	conversionFactor?: number;
	unitConversions?: UnitConversion[];
	defaultBrandName?: string;
	preferredStoreId?: Id<"inventoryStores">;
	preferredPurchaseQuantity?: number;
	preferredPurchaseUnit?: string;
	lastPurchasePrice?: number;
	lastPurchaseAt?: number;
};

function normalizeUnitLabel(unit?: string) {
	const normalized = (unit || "").trim().toLowerCase();
	if (!normalized) {
		return "";
	}

	const aliases: Record<string, string> = {
		g: "gram",
		gr: "gram",
		gram: "gram",
		grams: "gram",
		kg: "kg",
		kilo: "kg",
		kilogram: "kg",
		l: "liter",
		liter: "liter",
		litre: "liter",
		lt: "liter",
		ml: "ml",
		milliliter: "ml",
		mililiter: "ml",
		pcs: "pcs",
		pc: "pcs",
		piece: "pcs",
		pieces: "pcs",
		biji: "pcs",
		butir: "pcs",
		dozen: "dozen",
		lusin: "dozen",
		karton: "karton",
		carton: "karton",
		ctn: "karton",
		dus: "dus",
		box: "box",
		pack: "pack",
		pak: "pack",
		botol: "botol",
		bottle: "botol",
		sachet: "sachet",
	};

	return aliases[normalized] || normalized;
}

function sanitizeUnitConversions(input?: UnitConversion[]) {
	if (!input || input.length === 0) {
		return undefined;
	}

	const dedup = new Map<string, UnitConversion>();
	for (const row of input) {
		const unit = normalizeUnitLabel(row.unit);
		const factor = Number(row.factor);
		if (!unit || Number.isNaN(factor) || factor <= 0) {
			continue;
		}
		dedup.set(unit, { unit, factor });
	}

	if (dedup.size === 0) {
		return undefined;
	}

	return [...dedup.values()].sort((left, right) => left.factor - right.factor);
}

function normalizeAliasList(input?: string[]) {
	if (!input || input.length === 0) {
		return undefined;
	}
	const dedup = new Set<string>();
	for (const alias of input) {
		const normalized = normalizeUnitLabel(alias);
		if (normalized) {
			dedup.add(normalized);
		}
	}
	if (dedup.size === 0) {
		return undefined;
	}
	return [...dedup.values()].sort((a, b) => a.localeCompare(b, "id-ID"));
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
	if (!left || !right) {
		return 0;
	}
	if (left === right) {
		return 1;
	}
	if (left.includes(right) || right.includes(left)) {
		const shortLen = Math.min(left.length, right.length);
		return shortLen >= 6 ? 0.92 : 0.7;
	}
	const leftTokens = tokenizeName(leftName);
	const rightTokens = tokenizeName(rightName);
	if (leftTokens.length === 0 || rightTokens.length === 0) {
		return 0;
	}
	const rightSet = new Set(rightTokens);
	let overlap = 0;
	for (const token of leftTokens) {
		if (rightSet.has(token)) {
			overlap += 1;
		}
	}
	const denom = Math.max(leftTokens.length, rightTokens.length);
	const tokenSimilarity = overlap / denom;
	if (overlap >= 2 && tokenSimilarity >= 0.55) {
		return tokenSimilarity;
	}
	return 0;
}

function scoreNameMatch(keyword: string, candidate: string) {
	if (!keyword || !candidate) {
		return 0;
	}
	if (keyword === candidate) {
		return 100;
	}
	if (candidate.startsWith(keyword) || keyword.startsWith(candidate)) {
		return 88;
	}
	if (candidate.includes(keyword) || keyword.includes(candidate)) {
		return 72;
	}
	const keyTokens = keyword.split(" ").filter(Boolean);
	const candidateTokens = new Set(candidate.split(" ").filter(Boolean));
	if (keyTokens.length === 0) {
		return 0;
	}
	let overlap = 0;
	for (const token of keyTokens) {
		if (candidateTokens.has(token)) {
			overlap += 1;
		}
	}
	return Math.round((overlap / keyTokens.length) * 60);
}

function parseMeasurementValue(raw: string) {
	const cleaned = raw.replace(",", ".").trim();
	const value = Number(cleaned);
	if (!Number.isFinite(value) || value <= 0) {
		return null;
	}
	return value;
}

function inferUnitFromQuantityText(quantityText?: string | null) {
	const quantity = (quantityText || "").toLowerCase().trim();
	if (!quantity) {
		return null;
	}

	const multiPackMatch = quantity.match(
		/(\d+(?:[.,]\d+)?)\s*[xX]\s*(\d+(?:[.,]\d+)?)\s*(ml|l|liter|litre|g|gr|gram|kg)/i
	);
	if (multiPackMatch) {
		const packCount = parseMeasurementValue(multiPackMatch[1]);
		const eachAmount = parseMeasurementValue(multiPackMatch[2]);
		const eachUnit = normalizeUnitLabel(multiPackMatch[3]);
		if (packCount && eachAmount && eachUnit) {
			return {
				unit: "pcs",
				displayUnit: eachUnit,
				conversionFactor: eachAmount,
				unitConversionsText: packCount >= 2 ? `pack:${packCount}` : "",
			};
		}
	}

	const measurementMatch = quantity.match(
		/(\d+(?:[.,]\d+)?)\s*(ml|l|liter|litre|g|gr|gram|kg)/i
	);
	if (measurementMatch) {
		const amount = parseMeasurementValue(measurementMatch[1]);
		const normalizedUnit = normalizeUnitLabel(measurementMatch[2]);
		if (amount && normalizedUnit) {
			return {
				unit: normalizedUnit,
				displayUnit: "",
				conversionFactor: null,
				unitConversionsText: "",
			};
		}
	}

	return null;
}

function inferInventoryCategory(ingredientName: string) {
	const name = normalizeLookupText(ingredientName);
	const rules: Array<{ category: string; keywords: string[] }> = [
		{ category: "beverage", keywords: ["air", "milk", "susu", "juice", "kopi", "coffee", "tea", "teh"] },
		{ category: "protein", keywords: ["ayam", "daging", "ikan", "egg", "telur"] },
		{ category: "powder", keywords: ["powder", "bubuk", "flour", "tepung", "gula", "salt", "garam"] },
		{ category: "packaging", keywords: ["cup", "gelas", "tutup", "straw", "sedotan", "plastic", "plastik"] },
	];
	for (const rule of rules) {
		if (rule.keywords.some((keyword) => name.includes(keyword))) {
			return rule.category;
		}
	}
	return "general";
}

function snapshotInventoryItem(item: Doc<"inventory">): InventoryAuditSnapshot {
	return {
		ingredientName: item.ingredientName,
		unit: item.unit,
		quantity: item.quantity,
		lowStockThreshold: item.lowStockThreshold,
		displayUnit: item.displayUnit,
		conversionFactor: item.conversionFactor,
		unitConversions: sanitizeUnitConversions(item.unitConversions),
		defaultBrandName: item.defaultBrandName,
		preferredStoreId: item.preferredStoreId,
		preferredPurchaseQuantity: item.preferredPurchaseQuantity,
		preferredPurchaseUnit: item.preferredPurchaseUnit,
		lastPurchasePrice: item.lastPurchasePrice,
		lastPurchaseAt: item.lastPurchaseAt,
	};
}

async function logInventoryAudit(args: {
	ctx: MutationCtx;
	inventoryId: Id<"inventory">;
	action: string;
	message?: string;
	before?: InventoryAuditSnapshot;
	after?: InventoryAuditSnapshot;
	rollbackOfAuditLogId?: Id<"inventoryAuditLogs">;
}) {
	await args.ctx.db.insert("inventoryAuditLogs", {
		inventoryId: args.inventoryId,
		action: args.action,
		message: args.message,
		before: args.before,
		after: args.after,
		rollbackOfAuditLogId: args.rollbackOfAuditLogId,
		createdAt: Date.now(),
	});
}

function normalizeInventoryUnitConfig(args: {
	unit: string;
	displayUnit?: string;
	conversionFactor?: number;
	unitConversions?: UnitConversion[];
}) {
	const baseUnit = normalizeUnitLabel(args.unit);
	const displayUnit = normalizeUnitLabel(args.displayUnit);
	const conversionFactor =
		typeof args.conversionFactor === "number" && args.conversionFactor > 0
			? args.conversionFactor
			: undefined;

	const merged = sanitizeUnitConversions(args.unitConversions) ?? [];
	if (
		displayUnit &&
		displayUnit !== baseUnit &&
		conversionFactor != null &&
		!merged.some((row) => row.unit === displayUnit)
	) {
		merged.push({ unit: displayUnit, factor: conversionFactor });
	}

	const normalized = sanitizeUnitConversions(merged);
	return {
		displayUnit: displayUnit || undefined,
		conversionFactor,
		unitConversions: normalized,
	};
}

function convertQuantityToInventoryBaseUnit(args: {
	quantity: number;
	purchaseUnit?: string;
	inventoryItem: Pick<
		Doc<"inventory">,
		"unit" | "displayUnit" | "conversionFactor" | "unitConversions"
	>;
}) {
	const quantity = Number(args.quantity) || 0;
	if (quantity <= 0) {
		return 0;
	}

	const purchaseUnit = normalizeUnitLabel(args.purchaseUnit);
	const baseUnit = normalizeUnitLabel(args.inventoryItem.unit);
	const displayUnit = normalizeUnitLabel(args.inventoryItem.displayUnit);
	const factor = args.inventoryItem.conversionFactor || 1;
	const unitConversions = sanitizeUnitConversions(args.inventoryItem.unitConversions);

	if (!purchaseUnit || purchaseUnit === baseUnit) {
		return quantity;
	}

	const matchedConversion = unitConversions?.find(
		(conversion) => normalizeUnitLabel(conversion.unit) === purchaseUnit
	);
	if (matchedConversion && matchedConversion.factor > 0) {
		return quantity * matchedConversion.factor;
	}

	if (displayUnit && purchaseUnit === displayUnit && factor > 0) {
		return quantity * factor;
	}

	if (purchaseUnit === "kg" && baseUnit === "gram") {
		return quantity * 1000;
	}
	if (purchaseUnit === "liter" && baseUnit === "ml") {
		return quantity * 1000;
	}
	if (purchaseUnit === "dozen" && baseUnit === "pcs") {
		return quantity * 12;
	}

	return quantity;
}

function resolveRestockCostPerUnit(
	item: Pick<
		Doc<"inventory">,
		"unit" | "displayUnit" | "conversionFactor" | "unitConversions"
	>,
	args: StockActionArgs
) {
	if (typeof args.costPerUnit === "number" && args.costPerUnit > 0) {
		return args.costPerUnit;
	}

	if (
		typeof args.lineTotal === "number" &&
		args.lineTotal > 0 &&
		typeof args.purchaseQuantity === "number" &&
		args.purchaseQuantity > 0
	) {
		const baseQuantity = convertQuantityToInventoryBaseUnit({
			quantity: args.purchaseQuantity,
			purchaseUnit: args.purchaseUnit,
			inventoryItem: item,
		});
		if (baseQuantity > 0) {
			return args.lineTotal / baseQuantity;
		}
	}

	return undefined;
}

function buildStoreLookup(stores: Doc<"inventoryStores">[]) {
	const byId = new Map<string, StoreSummary>();
	for (const store of stores) {
		byId.set(store._id as string, {
			name: store.name,
			type: store.type,
		});
	}
	return byId;
}

function getJakartaDayKey(timestamp: number) {
	return new Date(timestamp).toLocaleDateString("sv-SE", {
		timeZone: "Asia/Bangkok",
	});
}

function isLikelyInventoryExpenseCategory(category?: string | null) {
	const value = (category || "").trim().toLowerCase();
	if (!value) {
		return false;
	}
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
	if (negativeKeywords.some((keyword) => value.includes(keyword))) {
		return false;
	}
	return positiveKeywords.some((keyword) => value.includes(keyword));
}

async function getLatestCostPerUnitForInventory(
	ctx: MutationCtx,
	inventoryId: Id<"inventory">
) {
	const inventoryItem = await ctx.db.get(inventoryId);
	if (!inventoryItem) {
		return undefined;
	}

	const transactions = await ctx.db
		.query("inventoryTransactions")
		.withIndex("by_inventory_and_timestamp", (q) => q.eq("inventoryId", inventoryId))
		.order("desc")
		.collect();

	const latestPriced = transactions.find(
		(transaction) =>
			(transaction.type === "restock" ||
				transaction.type === "costing_reference" ||
				transaction.type === "production") &&
			typeof transaction.costPerUnit === "number" &&
			transaction.costPerUnit > 0
	);

	if (latestPriced?.costPerUnit != null) {
		return latestPriced.costPerUnit;
	}

	if (
		typeof inventoryItem.lastPurchasePrice === "number" &&
		inventoryItem.lastPurchasePrice > 0
	) {
		return inventoryItem.lastPurchasePrice;
	}

	return undefined;
}

async function syncProductAvailabilityForInventoryIds(
	ctx: MutationCtx,
	inventoryIds: Id<"inventory">[]
) {
	if (inventoryIds.length === 0) {
		return;
	}

	const [recipes, products, inventory] = await Promise.all([
		ctx.db.query("recipes").collect(),
		ctx.db.query("products").collect(),
		ctx.db.query("inventory").collect(),
	]);

	const inventorySet = new Set(inventoryIds.map((id) => id as string));
	const affectedProductIds = new Set<string>();
	const inventoryById = new Map<string, Doc<"inventory">>();

	for (const inv of inventory) {
		inventoryById.set(inv._id as string, inv);
	}

	for (const recipe of recipes) {
		const touched = recipe.ingredients.some((ingredient) =>
			inventorySet.has(ingredient.inventoryId as string)
		);
		if (touched) {
			affectedProductIds.add(recipe.productId as string);
		}
	}

	if (affectedProductIds.size === 0) {
		return;
	}

	const recipesByProduct = new Map<string, Doc<"recipes">[]>();
	for (const recipe of recipes) {
		const key = recipe.productId as string;
		const list = recipesByProduct.get(key) ?? [];
		list.push(recipe);
		recipesByProduct.set(key, list);
	}

	for (const product of products) {
		const productId = product._id as string;
		if (!affectedProductIds.has(productId)) {
			continue;
		}

		const productRecipes = recipesByProduct.get(productId) ?? [];
		if (productRecipes.length === 0) {
			continue;
		}

		const hasFulfillableRecipe = productRecipes.some((recipe) =>
			recipe.ingredients.every((ingredient) => {
				const inv = inventoryById.get(ingredient.inventoryId as string);
				if (!inv) {
					return false;
				}
				return inv.quantity >= ingredient.amount;
			})
		);

		if (product.isAvailable !== hasFulfillableRecipe) {
			await ctx.db.patch(product._id, {
				isAvailable: hasFulfillableRecipe,
			});
		}
	}
}

async function performAddStock(ctx: MutationCtx, args: StockActionArgs) {
	const item = await ctx.db.get(args.inventoryId);
	if (!item) {
		throw new Error("Item not found");
	}
	if (args.quantity <= 0) {
		throw new Error("Quantity must be greater than 0");
	}

	const timestamp = args.timestamp ?? Date.now();
	const resolvedCostPerUnit = resolveRestockCostPerUnit(item, args);
	const normalizedBrandName = args.brandName?.trim() || item.defaultBrandName;
	const beforeSnapshot = snapshotInventoryItem(item);

	await ctx.db.patch(args.inventoryId, {
		quantity: item.quantity + args.quantity,
		lastPurchasePrice: resolvedCostPerUnit,
		lastPurchaseAt: timestamp,
		lastPurchaseStoreId: args.storeId ?? item.lastPurchaseStoreId,
		defaultBrandName: normalizedBrandName || item.defaultBrandName,
	});

	const patchedItem = await ctx.db.get(args.inventoryId);
	if (patchedItem) {
		await logInventoryAudit({
			ctx,
			inventoryId: args.inventoryId,
			action: "restock",
			message: args.notes ?? "Restock stok",
			before: beforeSnapshot,
			after: snapshotInventoryItem(patchedItem),
		});
	}

	await ctx.db.insert("inventoryTransactions", {
		inventoryId: args.inventoryId,
		quantity: args.quantity,
		remainingQuantity: args.quantity,
		type: "restock",
		timestamp,
		costPerUnit: resolvedCostPerUnit,
		notes: args.notes,
		expiryDate: args.expiryDate,
		brandName: normalizedBrandName,
		storeId: args.storeId,
		purchaseUnit: args.purchaseUnit,
		purchaseQuantity: args.purchaseQuantity,
		lineTotal: args.lineTotal,
	});

	await syncProductAvailabilityForInventoryIds(ctx, [args.inventoryId]);
}

async function performUsageStock(
	ctx: MutationCtx,
	args: Pick<StockActionArgs, "inventoryId" | "quantity" | "notes">
) {
	const item = await ctx.db.get(args.inventoryId);
	if (!item) {
		throw new Error("Item not found");
	}
	if (args.quantity <= 0) {
		throw new Error("Quantity must be greater than 0");
	}
	if (item.quantity < args.quantity) {
		throw new Error("Stok tidak mencukupi");
	}
	const beforeSnapshot = snapshotInventoryItem(item);

	await consumeStockFifo(ctx, args.inventoryId, args.quantity);

	await ctx.db.patch(args.inventoryId, {
		quantity: item.quantity - args.quantity,
	});

	const patchedItem = await ctx.db.get(args.inventoryId);
	if (patchedItem) {
		await logInventoryAudit({
			ctx,
			inventoryId: args.inventoryId,
			action: "usage",
			message: args.notes ?? "Pengurangan stok",
			before: beforeSnapshot,
			after: snapshotInventoryItem(patchedItem),
		});
	}

	await ctx.db.insert("inventoryTransactions", {
		inventoryId: args.inventoryId,
		quantity: -args.quantity,
		type: "usage",
		timestamp: Date.now(),
		notes: args.notes,
	});

	await syncProductAvailabilityForInventoryIds(ctx, [args.inventoryId]);
}

async function performAdjustStock(
	ctx: MutationCtx,
	args: Pick<StockActionArgs, "inventoryId" | "quantity" | "notes">
) {
	const item = await ctx.db.get(args.inventoryId);
	if (!item) {
		throw new Error("Item not found");
	}
	if (args.quantity < 0) {
		throw new Error("Quantity tidak boleh negatif");
	}
	const beforeSnapshot = snapshotInventoryItem(item);

	const diff = args.quantity - item.quantity;

	await ctx.db.patch(args.inventoryId, {
		quantity: args.quantity,
	});

	const patchedItem = await ctx.db.get(args.inventoryId);
	if (patchedItem) {
		await logInventoryAudit({
			ctx,
			inventoryId: args.inventoryId,
			action: "adjustment",
			message: args.notes ?? "Penyesuaian stok",
			before: beforeSnapshot,
			after: snapshotInventoryItem(patchedItem),
		});
	}

	await ctx.db.insert("inventoryTransactions", {
		inventoryId: args.inventoryId,
		quantity: diff,
		type: "adjustment",
		timestamp: Date.now(),
		notes: args.notes,
	});

	await syncProductAvailabilityForInventoryIds(ctx, [args.inventoryId]);
}

export const getInventory = query({
	args: {},
	handler: async (ctx) => {
		return await ctx.db.query("inventory").collect();
	},
});

export const getLowStockItems = query({
	args: {},
	handler: async (ctx) => {
		const allItems = await ctx.db.query("inventory").collect();
		return allItems
			.filter((item) => item.quantity <= item.lowStockThreshold)
			.sort((left, right) => {
				const leftGap = left.quantity - left.lowStockThreshold;
				const rightGap = right.quantity - right.lowStockThreshold;
				return leftGap - rightGap;
			});
	},
});

export const getInventoryControlTower = query({
	args: {
		daysWindow: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const daysWindow = Math.max(1, Math.min(90, args.daysWindow ?? 30));
		const msPerDay = 24 * 60 * 60 * 1000;
		const cutoff = Date.now() - daysWindow * msPerDay;

		const [items, usageRows, restockRows] = await Promise.all([
			ctx.db.query("inventory").collect(),
			ctx.db
				.query("inventoryTransactions")
				.withIndex("by_type_and_timestamp", (q) =>
					q.eq("type", "usage").gte("timestamp", cutoff)
				)
				.collect(),
			ctx.db
				.query("inventoryTransactions")
				.withIndex("by_type_and_timestamp", (q) =>
					q.eq("type", "restock").gte("timestamp", cutoff)
				)
				.collect(),
		]);

		const usageByInventoryId: Record<string, number> = {};
		for (const row of usageRows) {
			const key = row.inventoryId as string;
			usageByInventoryId[key] =
				(usageByInventoryId[key] ?? 0) + Math.abs(Number(row.quantity) || 0);
		}

		let totalStockUnits = 0;
		let lowStockCount = 0;
		let riskHighCount = 0;
		let riskMediumCount = 0;

		const planningRows = items
			.map((item) => {
				const totalUsage = usageByInventoryId[item._id as string] ?? 0;
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

				const riskLevel: RiskLevel =
					daysUntilStockout <= 3 || item.quantity <= item.lowStockThreshold
						? "high"
						: daysUntilStockout <= 7
							? "medium"
							: "low";

				if (riskLevel === "high") {
					riskHighCount += 1;
				} else if (riskLevel === "medium") {
					riskMediumCount += 1;
				}

				totalStockUnits += item.quantity;
				if (item.quantity <= item.lowStockThreshold) {
					lowStockCount += 1;
				}

				return {
					inventoryId: item._id,
					ingredientName: item.ingredientName,
					currentStock: item.quantity,
					unit: item.unit,
					displayUnit: item.displayUnit,
					conversionFactor: item.conversionFactor,
					unitConversions: item.unitConversions,
					lowStockThreshold: item.lowStockThreshold,
					avgDailyUsage: Number(avgDailyUsage.toFixed(2)),
					daysUntilStockout:
						daysUntilStockout === Number.POSITIVE_INFINITY
							? null
							: Number(daysUntilStockout.toFixed(1)),
					reorderPoint,
					suggestedOrderQty,
					riskLevel,
				};
			})
			.sort((left, right) => {
				const rank: Record<RiskLevel, number> = {
					high: 0,
					medium: 1,
					low: 2,
				};
				const riskDiff = rank[left.riskLevel] - rank[right.riskLevel];
				if (riskDiff !== 0) {
					return riskDiff;
				}
				return left.currentStock - right.currentStock;
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
			planningRows,
		};
	},
});

export const getInventoryWorkspace = query({
	args: {
		daysWindow: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const daysWindow = Math.max(1, Math.min(90, args.daysWindow ?? 30));
		const msPerDay = 24 * 60 * 60 * 1000;
		const cutoff = Date.now() - daysWindow * msPerDay;

		const [items, usageRows, restockRows, recipes, products, baseRecipes, transactions, stores] =
			await Promise.all([
				ctx.db.query("inventory").collect(),
				ctx.db
					.query("inventoryTransactions")
					.withIndex("by_type_and_timestamp", (q) =>
						q.eq("type", "usage").gte("timestamp", cutoff)
					)
					.collect(),
				ctx.db
					.query("inventoryTransactions")
					.withIndex("by_type_and_timestamp", (q) =>
						q.eq("type", "restock").gte("timestamp", cutoff)
					)
					.collect(),
				ctx.db.query("recipes").collect(),
				ctx.db.query("products").collect(),
				ctx.db.query("baseRecipes").collect(),
				ctx.db.query("inventoryTransactions").collect(),
				ctx.db.query("inventoryStores").collect(),
			]);

		const usageByInventoryId: Record<string, number> = {};
		for (const row of usageRows) {
			const key = row.inventoryId as string;
			usageByInventoryId[key] =
				(usageByInventoryId[key] ?? 0) + Math.abs(Number(row.quantity) || 0);
		}

		const productById = new Map<string, Doc<"products">>();
		for (const product of products) {
			productById.set(product._id as string, product);
		}

		const recipeImpactByInventoryId = new Map<
			string,
			{ recipeCount: number; productIds: Set<string>; activeProductCount: number }
		>();
		for (const recipe of recipes) {
			const linkedProduct = productById.get(recipe.productId as string) ?? null;
			for (const ingredient of recipe.ingredients) {
				const key = ingredient.inventoryId as string;
				const current = recipeImpactByInventoryId.get(key) ?? {
					recipeCount: 0,
					productIds: new Set<string>(),
					activeProductCount: 0,
				};
				current.recipeCount += 1;
				if (linkedProduct) {
					const productId = linkedProduct._id as string;
					const hadProduct = current.productIds.has(productId);
					current.productIds.add(productId);
					if (!hadProduct && linkedProduct.isAvailable) {
						current.activeProductCount += 1;
					}
				}
				recipeImpactByInventoryId.set(key, current);
			}
		}

		const consumedByBaseRecipeCount = new Map<string, number>();
		const baseRecipeNameById = new Map<string, string>();
		for (const recipe of baseRecipes) {
			baseRecipeNameById.set(recipe._id as string, recipe.name);
			for (const ingredient of recipe.ingredients) {
				const key = ingredient.inventoryId as string;
				consumedByBaseRecipeCount.set(
					key,
					(consumedByBaseRecipeCount.get(key) ?? 0) + 1
				);
			}
		}

		const storeById = buildStoreLookup(stores);

		const latestTransactionByInventoryId = new Map<
			string,
			{
				type: string;
				quantity: number;
				timestamp: number;
				notes?: string;
				brandName?: string;
				storeId?: Id<"inventoryStores">;
				costPerUnit?: number;
				purchaseQuantity?: number;
				purchaseUnit?: string;
			}
		>();
		for (const transaction of transactions) {
			const key = transaction.inventoryId as string;
			const current = latestTransactionByInventoryId.get(key);
			if (!current || transaction.timestamp > current.timestamp) {
				latestTransactionByInventoryId.set(key, {
					type: transaction.type,
					quantity: transaction.quantity,
					timestamp: transaction.timestamp,
					notes: transaction.notes,
					brandName: transaction.brandName,
					storeId: transaction.storeId,
					costPerUnit: transaction.costPerUnit,
					purchaseQuantity: transaction.purchaseQuantity,
					purchaseUnit: transaction.purchaseUnit,
				});
			}
		}

		let totalStockUnits = 0;
		let lowStockCount = 0;
		let riskHighCount = 0;
		let riskMediumCount = 0;

		const rows = items
			.map((item) => {
				const totalUsage = usageByInventoryId[item._id as string] ?? 0;
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

				const riskLevel: RiskLevel =
					daysUntilStockout <= 3 || item.quantity <= item.lowStockThreshold
						? "high"
						: daysUntilStockout <= 7
							? "medium"
							: "low";

				if (riskLevel === "high") {
					riskHighCount += 1;
				} else if (riskLevel === "medium") {
					riskMediumCount += 1;
				}

				totalStockUnits += item.quantity;
				if (item.quantity <= item.lowStockThreshold) {
					lowStockCount += 1;
				}

				const relation = recipeImpactByInventoryId.get(item._id as string);
				const relatedProductCount = relation?.productIds.size ?? 0;
				const relatedRecipeCount = relation?.recipeCount ?? 0;
				const relatedBaseRecipeCount =
					consumedByBaseRecipeCount.get(item._id as string) ?? 0;
				const latestTransaction =
					latestTransactionByInventoryId.get(item._id as string) ?? null;

				const status =
					item.quantity === 0 || riskLevel === "high"
						? "critical"
						: item.quantity <= reorderPoint || riskLevel === "medium"
							? "warning"
							: "healthy";

				return {
					inventoryId: item._id,
					ingredientName: item.ingredientName,
					currentStock: item.quantity,
					unit: item.unit,
					displayUnit: item.displayUnit,
					conversionFactor: item.conversionFactor,
					unitConversions: item.unitConversions,
					defaultBrandName: item.defaultBrandName ?? null,
					preferredStoreId: item.preferredStoreId ?? null,
					preferredStoreName:
						item.preferredStoreId != null
							? storeById.get(item.preferredStoreId as string)?.name ?? null
							: null,
					preferredPurchaseQuantity: item.preferredPurchaseQuantity ?? null,
					preferredPurchaseUnit: item.preferredPurchaseUnit ?? null,
					lastPurchaseStoreName:
						item.lastPurchaseStoreId != null
							? storeById.get(item.lastPurchaseStoreId as string)?.name ?? null
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
					relatedProductCount,
					relatedRecipeCount,
					relatedBaseRecipeCount,
					activeRelatedProductCount: relation?.activeProductCount ?? 0,
					producedByBaseRecipeName:
						item.baseRecipeId != null
							? baseRecipeNameById.get(item.baseRecipeId as string) ?? null
							: null,
					latestTransaction,
				};
			})
			.sort((left, right) => {
				const rank: Record<RiskLevel, number> = {
					high: 0,
					medium: 1,
					low: 2,
				};
				const riskDiff = rank[left.riskLevel] - rank[right.riskLevel];
				if (riskDiff !== 0) {
					return riskDiff;
				}
				return left.ingredientName.localeCompare(right.ingredientName);
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
		};
	},
});

export const getInventoryItemImpact = query({
	args: {
		inventoryId: v.id("inventory"),
	},
	handler: async (ctx, args) => {
		const [item, recipes, products, baseRecipes] = await Promise.all([
			ctx.db.get(args.inventoryId),
			ctx.db.query("recipes").collect(),
			ctx.db.query("products").collect(),
			ctx.db.query("baseRecipes").collect(),
		]);

		if (!item) {
			throw new Error("Item not found");
		}

		const impactedRecipes = recipes.filter((recipe) =>
			recipe.ingredients.some((ingredient) => ingredient.inventoryId === args.inventoryId)
		);
		const productById = new Map<string, Doc<"products">>();
		for (const product of products) {
			productById.set(product._id as string, product);
		}

		const impactedProducts = impactedRecipes
			.map((recipe) => {
				const linkedProduct = productById.get(recipe.productId as string);
				if (!linkedProduct) {
					return null;
				}
				return {
					productId: linkedProduct._id,
					productName: linkedProduct.name,
					variantName: recipe.variantName,
					isAvailable: linkedProduct.isAvailable,
				};
			})
			.filter((row): row is NonNullable<typeof row> => row !== null);

		const consumedByBaseRecipes = baseRecipes
			.filter((baseRecipe) =>
				baseRecipe.ingredients.some(
					(ingredient) => ingredient.inventoryId === args.inventoryId
				)
			)
			.map((baseRecipe) => ({
				baseRecipeId: baseRecipe._id,
				baseRecipeName: baseRecipe.name,
				targetQuantity: baseRecipe.targetQuantity,
				targetUnit: baseRecipe.targetUnit,
			}));

		const producedByBaseRecipe =
			item.baseRecipeId != null
				? baseRecipes.find((recipe) => recipe._id === item.baseRecipeId) ?? null
				: null;

		return {
			item: {
				inventoryId: item._id,
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
	},
});

export const getInventoryTransactions = query({
	args: { inventoryId: v.id("inventory") },
	handler: async (ctx, args) => {
		return await ctx.db
			.query("inventoryTransactions")
			.withIndex("by_inventory_and_timestamp", (q) =>
				q.eq("inventoryId", args.inventoryId)
			)
			.order("desc")
			.take(100);
	},
});

export const listInventoryStores = query({
	args: {},
	handler: async (ctx) => {
		return await ctx.db.query("inventoryStores").collect();
	},
});

export const createInventoryStore = mutation({
	args: {
		name: v.string(),
		type: v.optional(
			v.union(
				v.literal("store"),
				v.literal("supplier"),
				v.literal("market"),
				v.literal("other")
			)
		),
		phone: v.optional(v.string()),
		address: v.optional(v.string()),
		notes: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const trimmedName = args.name.trim();
		if (!trimmedName) {
			throw new Error("Nama toko wajib diisi");
		}

		const existingStores = await ctx.db.query("inventoryStores").collect();
		const existing = existingStores.find(
			(store) => store.name.trim().toLowerCase() === trimmedName.toLowerCase()
		);
		if (existing) {
			return existing._id;
		}

		return await ctx.db.insert("inventoryStores", {
			name: trimmedName,
			type: args.type ?? "supplier",
			phone: args.phone?.trim() || undefined,
			address: args.address?.trim() || undefined,
			notes: args.notes?.trim() || undefined,
			isActive: true,
		});
	},
});

const DEFAULT_INVENTORY_UNITS = [
	"gram",
	"ml",
	"pcs",
	"dus",
	"karton",
	"pack",
	"box",
	"botol",
	"sachet",
	"liter",
	"kg",
];

export const listInventoryUnitDictionary = query({
	args: {},
	handler: async (ctx) => {
		const rows = await ctx.db
			.query("inventoryUnitDictionary")
			.withIndex("by_is_active_and_sort_order", (q) => q.eq("isActive", true))
			.collect();

		const rowsByUnit = new Map<string, Doc<"inventoryUnitDictionary">>();
		for (const row of rows) {
			rowsByUnit.set(normalizeUnitLabel(row.unit), row);
		}

		const seedRows = DEFAULT_INVENTORY_UNITS.map((unit, index) => {
			const existing = rowsByUnit.get(unit);
			if (existing) {
				return existing;
			}
			return {
				_id: `seed:${unit}` as Id<"inventoryUnitDictionary">,
				_creationTime: 0,
				unit,
				aliases: undefined,
				category: "default",
				isSystem: true,
				isActive: true,
				sortOrder: index,
				createdAt: 0,
				updatedAt: 0,
			} as Doc<"inventoryUnitDictionary">;
		});

		const customRows = rows
			.filter((row) => !DEFAULT_INVENTORY_UNITS.includes(normalizeUnitLabel(row.unit)))
			.sort((a, b) => a.sortOrder - b.sortOrder);

		return [...seedRows, ...customRows];
	},
});

export const upsertInventoryUnitDictionary = mutation({
	args: {
		id: v.optional(v.id("inventoryUnitDictionary")),
		unit: v.string(),
		aliases: v.optional(v.array(v.string())),
		category: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const unit = normalizeUnitLabel(args.unit);
		if (!unit) {
			throw new Error("Nama satuan wajib diisi");
		}

		const aliases = normalizeAliasList(args.aliases);
		const now = Date.now();

		if (args.id) {
			await ctx.db.patch(args.id, {
				unit,
				aliases,
				category: args.category?.trim() || undefined,
				updatedAt: now,
				isActive: true,
			});
			return args.id;
		}

		const existingRows = await ctx.db.query("inventoryUnitDictionary").collect();
		const existing = existingRows.find(
			(row) => normalizeUnitLabel(row.unit) === unit
		);
		if (existing) {
			await ctx.db.patch(existing._id, {
				aliases: aliases ?? existing.aliases,
				category: args.category?.trim() || existing.category,
				isActive: true,
				updatedAt: now,
			});
			return existing._id;
		}

		return await ctx.db.insert("inventoryUnitDictionary", {
			unit,
			aliases,
			category: args.category?.trim() || "custom",
			isSystem: false,
			isActive: true,
			sortOrder: now,
			createdAt: now,
			updatedAt: now,
		});
	},
});

export const deactivateInventoryUnitDictionary = mutation({
	args: { id: v.id("inventoryUnitDictionary") },
	handler: async (ctx, args) => {
		const row = await ctx.db.get(args.id);
		if (!row) {
			return;
		}
		if (row.isSystem) {
			throw new Error("Satuan bawaan sistem tidak bisa dihapus");
		}
		await ctx.db.patch(args.id, {
			isActive: false,
			updatedAt: Date.now(),
		});
	},
});

export const bulkUpdateInventoryItems = mutation({
	args: {
		inventoryIds: v.array(v.id("inventory")),
		lowStockThreshold: v.optional(v.number()),
		unit: v.optional(v.string()),
		defaultBrandName: v.optional(v.string()),
		preferredStoreId: v.optional(v.id("inventoryStores")),
	},
	handler: async (ctx, args) => {
		if (args.inventoryIds.length === 0) {
			throw new Error("Pilih minimal satu baris inventaris");
		}
		if (
			args.lowStockThreshold == null &&
			args.unit == null &&
			args.defaultBrandName == null &&
			args.preferredStoreId == null
		) {
			throw new Error("Tidak ada field yang akan diubah");
		}

		const nextUnit = args.unit != null ? normalizeUnitLabel(args.unit) : undefined;
		if (args.unit != null && !nextUnit) {
			throw new Error("Satuan tidak valid");
		}

		let updatedCount = 0;
		for (const inventoryId of args.inventoryIds) {
			const item = await ctx.db.get(inventoryId);
			if (!item) {
				continue;
			}
			const before = snapshotInventoryItem(item);
			const normalizedUnits = normalizeInventoryUnitConfig({
				unit: nextUnit ?? item.unit,
				displayUnit: item.displayUnit,
				conversionFactor: item.conversionFactor,
				unitConversions: item.unitConversions,
			});
			await ctx.db.patch(inventoryId, {
				lowStockThreshold: args.lowStockThreshold ?? item.lowStockThreshold,
				unit: nextUnit ?? item.unit,
				displayUnit: normalizedUnits.displayUnit,
				conversionFactor: normalizedUnits.conversionFactor,
				unitConversions: normalizedUnits.unitConversions,
				defaultBrandName: args.defaultBrandName ?? item.defaultBrandName,
				preferredStoreId: args.preferredStoreId ?? item.preferredStoreId,
			});
			const afterItem = await ctx.db.get(inventoryId);
			if (afterItem) {
				await logInventoryAudit({
					ctx,
					inventoryId,
					action: "bulk_update",
					message: "Perubahan massal inventory",
					before,
					after: snapshotInventoryItem(afterItem),
				});
			}
			updatedCount += 1;
		}

		return { updatedCount };
	},
});

export const getInventoryPriceInsights = query({
	args: { inventoryId: v.id("inventory") },
	handler: async (ctx, args) => {
		const item = await ctx.db.get(args.inventoryId);
		if (!item) {
			throw new Error("Item not found");
		}

		const [stores, transactions] = await Promise.all([
			ctx.db.query("inventoryStores").collect(),
			ctx.db
				.query("inventoryTransactions")
				.withIndex("by_inventory_and_timestamp", (q) =>
					q.eq("inventoryId", args.inventoryId)
				)
				.order("desc")
				.take(60),
		]);
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
				storeId: Id<"inventoryStores"> | null;
				storeName: string;
				storeType: Doc<"inventoryStores">["type"] | null;
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
			const storeType = row.storeId
				? storeById.get(storeKey)?.type ?? null
				: null;
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

			const brandName = row.brandName?.trim() || item.defaultBrandName?.trim() || "Tanpa brand";
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
				inventoryId: item._id,
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
			storeComparison: [...storeComparisonMap.values()].sort((left, right) => {
				const leftAt = left.lastPurchaseAt ?? 0;
				const rightAt = right.lastPurchaseAt ?? 0;
				return rightAt - leftAt;
			}),
			brandComparison: [...brandComparisonMap.values()].sort((left, right) => {
				const leftAt = left.lastPurchaseAt ?? 0;
				const rightAt = right.lastPurchaseAt ?? 0;
				return rightAt - leftAt;
			}),
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
	},
});

export const getRealtimePriceMonitor = query({
	args: {
		limit: v.optional(v.number()),
		search: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const limit = Math.max(20, Math.min(500, Math.floor(args.limit ?? 200)));
		const keyword = (args.search ?? "").trim().toLowerCase();

		const [items, stores, restockRows, expenseRows] = await Promise.all([
			ctx.db.query("inventory").collect(),
			ctx.db.query("inventoryStores").collect(),
			ctx.db
				.query("inventoryTransactions")
				.withIndex("by_type_and_timestamp", (q) => q.eq("type", "restock"))
				.order("desc")
				.take(1200),
			ctx.db
				.query("financialTransactions")
				.withIndex("by_type_and_date", (q) => q.eq("type", "expense"))
				.order("desc")
				.take(800),
		]);

		const storeById = buildStoreLookup(stores);
		const itemById = new Map<string, Doc<"inventory">>();
		const itemByName = new Map<string, Doc<"inventory">>();
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
				latestInventoryId: Id<"inventory"> | null;
			}
		>();

		let expenseLineCount = 0;

		for (const row of restockRows) {
			if (typeof row.costPerUnit !== "number" || row.costPerUnit <= 0) {
				continue;
			}

			const item = itemById.get(String(row.inventoryId));
			if (!item) {
				continue;
			}

			const rawName = item.ingredientName.trim();
			if (!rawName) {
				continue;
			}
			const rawNameLower = rawName.toLowerCase();
			if (rawNameLower.includes("hpp pesanan")) {
				continue;
			}

			const nameKey = rawName.toLowerCase();
			const storeName =
				row.storeId != null
					? storeById.get(String(row.storeId))?.name ?? "Toko tidak dikenal"
					: "Tanpa toko";
			const brandName = row.brandName?.trim() || item.defaultBrandName?.trim() || null;

			const existing = aggregate.get(nameKey);
			if (!existing) {
				const storeSet = new Set<string>();
				const brandSet = new Set<string>();
				storeSet.add(storeName);
				if (brandName) {
					brandSet.add(brandName);
				}
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
					latestInventoryId: item._id,
				});
				continue;
			}

			existing.totalPurchases += 1;
			existing.storeSet.add(storeName);
			if (brandName) {
				existing.brandSet.add(brandName);
			}
			if (existing.previousPrice == null) {
				existing.previousPrice = row.costPerUnit;
			}
		}

		for (const expense of expenseRows) {
			const isInventoryExpense = isLikelyInventoryExpenseCategory(expense.category);
			const fallbackStoreName =
				expense.merchant?.trim() ||
				expense.metadata?.receiptDetails?.merchantName?.trim() ||
				"Tanpa toko";
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
					: [
						];
			if (normalizedScanItems.length === 0) {
				continue;
			}

			for (const line of normalizedScanItems) {
				const lineName = (line.name || "").trim();
				if (!lineName) {
					continue;
				}
				const lineNameLower = lineName.toLowerCase();
				if (lineNameLower.includes("hpp pesanan")) {
					continue;
				}
				const quantity = Number(line.quantity) || 0;
				const unitPrice =
					typeof line.price === "number" && line.price > 0
						? line.price
						: typeof line.total === "number" && line.total > 0 && quantity > 0
							? line.total / quantity
							: 0;
				if (unitPrice <= 0) {
					continue;
				}

				expenseLineCount += 1;

				const nameKey = lineName.toLowerCase();
				const matchedItem = itemByName.get(nameKey) ?? null;
				const displayUnit = normalizeUnitLabel(line.unit) || matchedItem?.displayUnit || null;
				const baseUnit = matchedItem?.unit || displayUnit || "unit";
				const conversionFactor = matchedItem?.conversionFactor ?? null;
				const existing = aggregate.get(nameKey);
				if (!existing) {
					const storeSet = new Set<string>();
					storeSet.add(fallbackStoreName);
					aggregate.set(nameKey, {
						inventoryName: lineName,
						nameKey,
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
						latestInventoryId: matchedItem?._id ?? null,
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
					if (matchedItem?._id) {
						existing.latestInventoryId = matchedItem._id;
					}
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
			if (!nameKey || aggregate.has(nameKey)) {
				continue;
			}
			if (nameKey.includes("hpp pesanan")) {
				continue;
			}
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
				lastPurchaseAt: item.lastPurchaseAt ?? item._creationTime,
				lastStoreName:
					item.lastPurchaseStoreId != null
						? storeById.get(String(item.lastPurchaseStoreId))?.name ?? "Toko tidak dikenal"
						: null,
				lastBrandName: item.defaultBrandName ?? null,
				totalPurchases: 1,
				storeSet: new Set<string>(),
				brandSet: item.defaultBrandName
					? new Set<string>([item.defaultBrandName])
					: new Set<string>(),
				latestInventoryId: item._id,
			});
		}

		const rows = [...aggregate.values()]
			.filter((row) => {
				if (!keyword) {
					return true;
				}
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
		};
	},
});

export const getInventoryYumiAiInsights = query({
	args: {
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const limit = Math.max(10, Math.min(150, Math.floor(args.limit ?? 40)));
		const now = Date.now();
		const dayMs = 24 * 60 * 60 * 1000;
		const cutoff7 = now - 7 * dayMs;
		const cutoff30 = now - 30 * dayMs;
		const cutoff90 = now - 90 * dayMs;

		const [items, stores, usageRows, restockRows, allTxRows] = await Promise.all([
			ctx.db.query("inventory").collect(),
			ctx.db.query("inventoryStores").collect(),
			ctx.db
				.query("inventoryTransactions")
				.withIndex("by_type_and_timestamp", (q) =>
					q.eq("type", "usage").gte("timestamp", cutoff30)
				)
				.collect(),
			ctx.db
				.query("inventoryTransactions")
				.withIndex("by_type_and_timestamp", (q) =>
					q.eq("type", "restock").gte("timestamp", cutoff90)
				)
				.collect(),
			ctx.db.query("inventoryTransactions").collect(),
		]);

		const storeById = buildStoreLookup(stores);
		const usage30ByInventory = new Map<string, number>();
		const usage7ByInventory = new Map<string, number>();
		const latestTxAtByInventory = new Map<string, number>();
		for (const row of usageRows) {
			const key = String(row.inventoryId);
			const qty = Math.abs(Number(row.quantity) || 0);
			if (qty <= 0) {
				continue;
			}
			usage30ByInventory.set(key, (usage30ByInventory.get(key) ?? 0) + qty);
			if (row.timestamp >= cutoff7) {
				usage7ByInventory.set(key, (usage7ByInventory.get(key) ?? 0) + qty);
			}
		}
		for (const row of allTxRows) {
			const key = String(row.inventoryId);
			const current = latestTxAtByInventory.get(key) ?? 0;
			if ((row.timestamp ?? 0) > current) {
				latestTxAtByInventory.set(key, row.timestamp ?? 0);
			}
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
				const suggestedOrderQty = Math.max(
					0,
					Math.ceil(avgDailyUsage * 7 - item.quantity)
				);
				const urgency: "high" | "medium" | "low" =
					daysUntilStockout <= 3 || item.quantity <= item.lowStockThreshold
						? "high"
						: daysUntilStockout <= 7
							? "medium"
							: "low";
				return {
					inventoryId: item._id,
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
				if (urgencyDiff !== 0) {
					return urgencyDiff;
				}
				const leftDays = left.daysUntilStockout ?? 999;
				const rightDays = right.daysUntilStockout ?? 999;
				return leftDays - rightDays;
			})
			.slice(0, limit);

		const supplierAggregate = new Map<
			string,
			{
				inventoryId: Id<"inventory">;
				ingredientName: string;
				lastPrice: number;
				lastStoreName: string | null;
				storeStats: Map<string, { storeName: string; count: number; totalPrice: number; minPrice: number }>;
			}
		>();
		for (const row of restockRows) {
			if (typeof row.costPerUnit !== "number" || row.costPerUnit <= 0) {
				continue;
			}
			const item = items.find((candidate) => candidate._id === row.inventoryId);
			if (!item) {
				continue;
			}
			const key = String(item._id);
			const storeName =
				row.storeId != null
					? storeById.get(String(row.storeId))?.name ?? "Toko tidak dikenal"
					: "Tanpa toko";
			const current = supplierAggregate.get(key) ?? {
				inventoryId: item._id,
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
					inventoryId: item._id,
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
			if (rootLeft === rootRight) {
				return;
			}
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
				const score = getNameSimilarityScore(
					items[i].ingredientName,
					items[j].ingredientName
				);
				if (score >= 0.55) {
					unionIndex(i, j);
				}
			}
		}

		const groupedByRoot = new Map<number, Array<typeof items[number]>>();
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
							inventoryId: item._id,
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
						scores.push(
							getNameSimilarityScore(
								enriched[i].ingredientName,
								enriched[j].ingredientName
							)
						);
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
				if (right.itemCount !== left.itemCount) {
					return right.itemCount - left.itemCount;
				}
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
		};
	},
});

export const suggestInventoryAutofill = action({
	args: {
		ingredientName: v.string(),
	},
	handler: async (ctx, args) => {
		const ingredientName = args.ingredientName.trim();
		if (!ingredientName) {
			return {
				ok: false,
				message: "Nama bahan wajib diisi",
				suggestion: null,
				fallbackPath: [] as string[],
				refreshedAt: Date.now(),
				sources: [] as Array<{ title: string; url: string; snippet: string }>,
			};
		}

		const keyword = normalizeLookupText(ingredientName);
		const inventory: Array<Doc<"inventory">> = await ctx.runQuery(
			api.inventory.getInventory,
			{}
		);

		const internalMatch = inventory
			.map((item) => ({
				item,
				score: scoreNameMatch(keyword, normalizeLookupText(item.ingredientName)),
			}))
			.sort((left, right) => right.score - left.score)[0];

		let webCandidates: Array<{
			name: string;
			brand: string;
			quantity: string;
			score: number;
			url: string;
		}> = [];
		try {
			const response = await fetch(
				`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(
					ingredientName
				)}&search_simple=1&action=process&json=1&page_size=12`
			);
			if (response.ok) {
				const json = (await response.json()) as {
					products?: Array<{
						product_name?: string;
						brands?: string;
						quantity?: string;
						url?: string;
					}>;
				};
				webCandidates = (json.products ?? [])
					.map((product) => {
						const name = (product.product_name || "").trim();
						const brand = (product.brands || "").split(",")[0]?.trim() || "";
						const quantity = (product.quantity || "").trim();
						return {
							name,
							brand,
							quantity,
							url: product.url || "https://world.openfoodfacts.org",
							score: scoreNameMatch(keyword, normalizeLookupText(name)),
						};
					})
					.filter((row) => row.name && row.score > 0)
					.sort((left, right) => right.score - left.score)
					.slice(0, 5);
			}
		} catch {
			// Ignore network errors and keep internal-only suggestion.
		}

		const bestWeb = webCandidates[0];
		const secondWeb = webCandidates[1];
		const webInference = inferUnitFromQuantityText(bestWeb?.quantity);
		const inferredCategory = inferInventoryCategory(ingredientName);

		const internalConversionsText = internalMatch?.item
			? (internalMatch.item.unitConversions ?? [])
					.map((row) => `${normalizeUnitLabel(row.unit)}:${Number(row.factor)}`)
					.join(", ")
			: "";

		const hasInternalExact = (internalMatch?.score ?? 0) >= 92;
		const hasInternalFuzzy = (internalMatch?.score ?? 0) >= 60;
		const hasWeb = Boolean(bestWeb);
		const fallbackPath = [
			hasInternalExact ? "internal_exact" : hasInternalFuzzy ? "internal_fuzzy" : "internal_none",
			hasWeb ? "web_hit" : "web_none",
			"default_template",
		];

		const suggestion = {
			ingredientName,
			unit: hasInternalFuzzy
				? normalizeUnitLabel(internalMatch.item.unit)
				: webInference?.unit || "gram",
			lowStockThreshold: hasInternalFuzzy
				? internalMatch.item.lowStockThreshold
				: webInference?.unit === "pcs"
					? 10
					: inferredCategory === "beverage"
						? 30
						: 100,
			defaultBrandName:
				(hasInternalFuzzy ? internalMatch.item.defaultBrandName : null) ||
				bestWeb?.brand ||
				"",
			displayUnit:
				(hasInternalFuzzy ? normalizeUnitLabel(internalMatch.item.displayUnit) : "") ||
				webInference?.displayUnit ||
				"",
			conversionFactor:
				(hasInternalFuzzy ? internalMatch.item.conversionFactor : null) ??
				webInference?.conversionFactor ??
				null,
			unitConversionsText: internalConversionsText || webInference?.unitConversionsText || "",
			category: inferredCategory,
			confidence: Math.min(
				0.98,
				Math.max(
					0.35,
					Math.max((internalMatch?.score ?? 0) / 100, (bestWeb?.score ?? 0) / 100)
				)
			),
			fieldConfidence: {
				unit: Math.min(
					0.99,
					Math.max(
						0.35,
						hasInternalFuzzy
							? (internalMatch?.score ?? 0) / 100
							: (bestWeb?.score ?? 0) / 110
					)
				),
				lowStockThreshold: hasInternalFuzzy ? 0.86 : inferredCategory === "general" ? 0.55 : 0.68,
				defaultBrandName: hasInternalFuzzy ? 0.8 : bestWeb?.brand ? 0.7 : 0.35,
				conversion: hasInternalFuzzy
					? internalConversionsText
						? 0.9
						: 0.65
					: webInference
						? 0.72
						: 0.3,
			},
			fieldReason: {
				unit: hasInternalFuzzy
					? `Diambil dari histori item mirip (${internalMatch?.item.ingredientName})`
					: bestWeb
						? `Infer dari quantity web: ${bestWeb.quantity || "-"}`
						: "Fallback default template",
				lowStockThreshold: hasInternalFuzzy
					? "Mengikuti threshold item historis mirip"
					: `Template kategori ${inferredCategory}`,
				defaultBrandName: hasInternalFuzzy
					? "Brand dari histori item mirip"
					: bestWeb?.brand
						? "Brand dari data web"
						: "Belum ada referensi brand",
				conversion: hasInternalFuzzy
					? internalConversionsText
						? "Konversi dari histori item mirip"
						: "Konversi internal belum lengkap"
					: webInference
						? "Infer konversi dari kemasan web"
						: "Belum ada referensi konversi",
			},
			conflictWarning:
				Boolean(bestWeb && secondWeb && Math.abs(bestWeb.score - secondWeb.score) <= 5) &&
				bestWeb.quantity &&
				secondWeb.quantity &&
				bestWeb.quantity !== secondWeb.quantity
					? "Data web memiliki lebih dari satu kandidat kuat dengan kemasan berbeda"
					: null,
			reason: hasInternalFuzzy
				? `Autofill dari histori item mirip: ${internalMatch.item.ingredientName}`
				: bestWeb
					? `Autofill dari web (${bestWeb.name}${bestWeb.quantity ? `, ${bestWeb.quantity}` : ""})`
					: "Autofill default dasar",
		};

		return {
			ok: true,
			message: "Saran autofill berhasil dibuat",
			suggestion,
			fallbackPath,
			refreshedAt: Date.now(),
			sources: webCandidates.map((row) => ({
				title: row.name,
				url: row.url,
				snippet: `${row.brand || "brand tidak diketahui"}${row.quantity ? ` | ${row.quantity}` : ""}`,
			})),
		};
	},
});
export const setInventoryReferencePrice = mutation({
	args: {
		inventoryId: v.id("inventory"),
		price: v.number(),
		notes: v.optional(v.string()),
		brandName: v.optional(v.string()),
		storeId: v.optional(v.id("inventoryStores")),
	},
	handler: async (ctx, args) => {
		if (!Number.isFinite(args.price) || args.price <= 0) {
			throw new Error("Harga referensi tidak valid");
		}
		const item = await ctx.db.get(args.inventoryId);
		if (!item) {
			throw new Error("Item inventory tidak ditemukan");
		}
		const before = snapshotInventoryItem(item);
		const timestamp = Date.now();
		await ctx.db.patch(args.inventoryId, {
			lastPurchasePrice: args.price,
			lastPurchaseAt: timestamp,
			lastPurchaseStoreId: args.storeId ?? item.lastPurchaseStoreId,
			defaultBrandName: args.brandName?.trim() || item.defaultBrandName,
		});
		await ctx.db.insert("inventoryTransactions", {
			inventoryId: args.inventoryId,
			quantity: 0,
			type: "costing_reference",
			timestamp,
			costPerUnit: args.price,
			notes: args.notes ?? "Sinkron harga dari monitoring",
			brandName: args.brandName?.trim() || item.defaultBrandName,
			storeId: args.storeId,
		});
		const after = await ctx.db.get(args.inventoryId);
		if (after) {
			await logInventoryAudit({
				ctx,
				inventoryId: args.inventoryId,
				action: "set_reference_price",
				message: args.notes ?? "Set harga referensi",
				before,
				after: snapshotInventoryItem(after),
			});
		}
		return { ok: true };
	},
});

export const getInventoryAuditLogs = query({
	args: {
		inventoryId: v.id("inventory"),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const limit = Math.max(10, Math.min(args.limit ?? 40, 200));
		const rows = await ctx.db
			.query("inventoryAuditLogs")
			.withIndex("by_inventory_and_created_at", (q) =>
				q.eq("inventoryId", args.inventoryId)
			)
			.order("desc")
			.take(limit);

		return rows.map((row) => ({
			...row,
			canRollback: row.before != null,
		}));
	},
});

export const rollbackInventoryByAudit = mutation({
	args: {
		auditLogId: v.id("inventoryAuditLogs"),
	},
	handler: async (ctx, args) => {
		const audit = await ctx.db.get(args.auditLogId);
		if (!audit) {
			throw new Error("Log audit tidak ditemukan");
		}
		if (!audit.before) {
			throw new Error("Log ini tidak memiliki snapshot sebelum perubahan");
		}
		const item = await ctx.db.get(audit.inventoryId);
		if (!item) {
			throw new Error("Item inventory tidak ditemukan");
		}

		const beforeRollback = snapshotInventoryItem(item);
		const normalized = normalizeInventoryUnitConfig({
			unit: audit.before.unit,
			displayUnit: audit.before.displayUnit,
			conversionFactor: audit.before.conversionFactor,
			unitConversions: audit.before.unitConversions,
		});

		await ctx.db.patch(audit.inventoryId, {
			ingredientName: audit.before.ingredientName,
			unit: normalizeUnitLabel(audit.before.unit),
			quantity: audit.before.quantity,
			lowStockThreshold: audit.before.lowStockThreshold,
			displayUnit: normalized.displayUnit,
			conversionFactor: normalized.conversionFactor,
			unitConversions: normalized.unitConversions,
			defaultBrandName: audit.before.defaultBrandName,
			preferredStoreId: audit.before.preferredStoreId,
			preferredPurchaseQuantity: audit.before.preferredPurchaseQuantity,
			preferredPurchaseUnit: audit.before.preferredPurchaseUnit,
			lastPurchasePrice: audit.before.lastPurchasePrice,
			lastPurchaseAt: audit.before.lastPurchaseAt,
		});

		const afterRollback = await ctx.db.get(audit.inventoryId);
		if (afterRollback) {
			await logInventoryAudit({
				ctx,
				inventoryId: audit.inventoryId,
				action: "rollback",
				message: `Rollback dari log ${audit._id}`,
				before: beforeRollback,
				after: snapshotInventoryItem(afterRollback),
				rollbackOfAuditLogId: audit._id,
			});
		}
		await syncProductAvailabilityForInventoryIds(ctx, [audit.inventoryId]);

		return { ok: true };
	},
});

export const createInventoryItem = mutation({
	args: {
		ingredientName: v.string(),
		unit: v.string(),
		quantity: v.number(),
		lowStockThreshold: v.number(),
		displayUnit: v.optional(v.string()),
		conversionFactor: v.optional(v.number()),
		unitConversions: v.optional(
			v.array(
				v.object({
					unit: v.string(),
					factor: v.number(),
				})
			)
		),
		baseRecipeId: v.optional(v.id("baseRecipes")),
		defaultBrandName: v.optional(v.string()),
		preferredStoreId: v.optional(v.id("inventoryStores")),
		preferredPurchaseQuantity: v.optional(v.number()),
		preferredPurchaseUnit: v.optional(v.string()),
		initialStockTimestamp: v.optional(v.number()),
		costPerUnit: v.optional(v.number()),
		notes: v.optional(v.string()),
		brandName: v.optional(v.string()),
		storeId: v.optional(v.id("inventoryStores")),
		purchaseQuantity: v.optional(v.number()),
		purchaseUnit: v.optional(v.string()),
		lineTotal: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const {
			initialStockTimestamp,
			costPerUnit,
			notes,
			brandName,
			storeId,
			purchaseQuantity,
			purchaseUnit,
			lineTotal,
			...inventoryData
		} = args;
		const normalizedUnits = normalizeInventoryUnitConfig({
			unit: inventoryData.unit,
			displayUnit: inventoryData.displayUnit,
			conversionFactor: inventoryData.conversionFactor,
			unitConversions: inventoryData.unitConversions,
		});
		const inventoryId = await ctx.db.insert("inventory", {
			...inventoryData,
			displayUnit: normalizedUnits.displayUnit,
			conversionFactor: normalizedUnits.conversionFactor,
			unitConversions: normalizedUnits.unitConversions,
		});
		const createdItem = await ctx.db.get(inventoryId);
		if (createdItem) {
			await logInventoryAudit({
				ctx,
				inventoryId,
				action: "create",
				message: "Item inventaris dibuat",
				after: snapshotInventoryItem(createdItem),
			});
		}

		if (args.quantity > 0) {
			await ctx.db.insert("inventoryTransactions", {
				inventoryId,
				quantity: args.quantity,
				remainingQuantity: args.quantity,
				type: "restock",
				timestamp: initialStockTimestamp ?? Date.now(),
				costPerUnit,
				notes,
				brandName: brandName ?? args.defaultBrandName,
				storeId,
				purchaseQuantity,
				purchaseUnit,
				lineTotal,
			});
		}

		return inventoryId;
	},
});

export const addStock = mutation({
	args: {
		inventoryId: v.id("inventory"),
		quantity: v.number(), // Amount to add
		costPerUnit: v.optional(v.number()),
		notes: v.optional(v.string()),
		timestamp: v.optional(v.number()),
		expiryDate: v.optional(v.number()),
		brandName: v.optional(v.string()),
		storeId: v.optional(v.id("inventoryStores")),
		purchaseUnit: v.optional(v.string()),
		purchaseQuantity: v.optional(v.number()),
		lineTotal: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		await performAddStock(ctx, args);
	},
});

export const usageStock = mutation({
	args: {
		inventoryId: v.id("inventory"),
		quantity: v.number(), // Amount used
		notes: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		await performUsageStock(ctx, args);
	},
});

export const updateInventoryItem = mutation({
	args: {
		id: v.id("inventory"),
		ingredientName: v.string(),
		unit: v.string(),
		lowStockThreshold: v.number(),
		displayUnit: v.optional(v.string()),
		conversionFactor: v.optional(v.number()),
		unitConversions: v.optional(
			v.array(
				v.object({
					unit: v.string(),
					factor: v.number(),
				})
			)
		),
		baseRecipeId: v.optional(v.id("baseRecipes")),
		defaultBrandName: v.optional(v.string()),
		preferredStoreId: v.optional(v.id("inventoryStores")),
		preferredPurchaseQuantity: v.optional(v.number()),
		preferredPurchaseUnit: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const { id, ...data } = args;
		const existing = await ctx.db.get(id);
		if (!existing) {
			throw new Error("Item tidak ditemukan");
		}
		const normalizedUnits = normalizeInventoryUnitConfig({
			unit: data.unit,
			displayUnit: data.displayUnit,
			conversionFactor: data.conversionFactor,
			unitConversions: data.unitConversions,
		});
		await ctx.db.patch(id, {
			...data,
			displayUnit: normalizedUnits.displayUnit,
			conversionFactor: normalizedUnits.conversionFactor,
			unitConversions: normalizedUnits.unitConversions,
		});
		const updated = await ctx.db.get(id);
		if (updated) {
			await logInventoryAudit({
				ctx,
				inventoryId: id,
				action: "meta_update",
				message: "Metadata item diperbarui",
				before: snapshotInventoryItem(existing),
				after: snapshotInventoryItem(updated),
			});
		}
	},
});

export const deleteInventoryItem = mutation({
	args: { id: v.id("inventory") },
	handler: async (ctx, args) => {
		const existing = await ctx.db.get(args.id);
		if (!existing) {
			return { ok: true, deleted: false };
		}

		// Guard against legacy/partial rows where ingredients may be missing.
		const [recipes, baseRecipes] = await Promise.all([
			ctx.db.query("recipes").collect(),
			ctx.db.query("baseRecipes").collect(),
		]);

		const isUsedInRecipes = recipes.some((recipe) =>
			Array.isArray(recipe.ingredients) &&
			recipe.ingredients.some((ingredient) => ingredient?.inventoryId === args.id)
		);
		const isUsedInBaseRecipes = baseRecipes.some((recipe) =>
			Array.isArray(recipe.ingredients) &&
			recipe.ingredients.some((ingredient) => ingredient?.inventoryId === args.id)
		);

		if (isUsedInRecipes || isUsedInBaseRecipes) {
			throw new Error(
				"Item masih dipakai di recipe/base recipe. Lepaskan dulu dari resep terkait sebelum menghapus."
			);
		}

		// Cleanup child transactions first so delete is safe and data stays consistent.
		const relatedTransactions = await ctx.db
			.query("inventoryTransactions")
			.withIndex("by_inventory", (q) => q.eq("inventoryId", args.id))
			.collect();

		for (const transaction of relatedTransactions) {
			await ctx.db.delete(transaction._id);
		}

		await logInventoryAudit({
			ctx,
			inventoryId: args.id,
			action: "delete",
			message: "Item inventaris dihapus",
			before: snapshotInventoryItem(existing),
		});
		await ctx.db.delete(args.id);
		return { ok: true, deleted: true };
	},
});

export const adjustStock = mutation({
	args: {
		inventoryId: v.id("inventory"),
		quantity: v.number(), // The new total quantity
		notes: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		await performAdjustStock(ctx, args);
	},
});

export const applyInventoryStockAction = mutation({
	args: {
		inventoryId: v.id("inventory"),
		action: v.union(v.literal("add"), v.literal("usage"), v.literal("adjust")),
		quantity: v.number(),
		notes: v.optional(v.string()),
		costPerUnit: v.optional(v.number()),
		timestamp: v.optional(v.number()),
		expiryDate: v.optional(v.number()),
		brandName: v.optional(v.string()),
		storeId: v.optional(v.id("inventoryStores")),
		purchaseUnit: v.optional(v.string()),
		purchaseQuantity: v.optional(v.number()),
		lineTotal: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		if (args.action === "add") {
			await performAddStock(ctx, args);
			return;
		}
		if (args.action === "usage") {
			await performUsageStock(ctx, args);
			return;
		}
		await performAdjustStock(ctx, args);
	},
});

export const getRecipes = query({
	args: {},
	handler: async (ctx) => {
		return await ctx.db.query("recipes").collect();
	},
});

export const getRecipeForProduct = query({
	args: {
		productId: v.id("products"),
		variantName: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const recipe = await ctx.db
			.query("recipes")
			.withIndex("by_product_variant", (q) =>
				q.eq("productId", args.productId).eq("variantName", args.variantName)
			)
			.first();
		return recipe;
	},
});

export const saveRecipe = mutation({
	args: {
		productId: v.id("products"),
		variantName: v.optional(v.string()),
		ingredients: v.array(
			v.object({
				inventoryId: v.id("inventory"),
				amount: v.number(),
			})
		),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query("recipes")
			.withIndex("by_product_variant", (q) =>
				q.eq("productId", args.productId).eq("variantName", args.variantName)
			)
			.first();

		if (existing) {
			await ctx.db.patch(existing._id, { ingredients: args.ingredients });
			await ctx.runMutation(api.hpp.upsertHppFromRecipe, {
				productId: args.productId,
				variantName: args.variantName,
			});
			await syncProductAvailabilityForInventoryIds(
				ctx,
				args.ingredients.map((ingredient) => ingredient.inventoryId)
			);
			return existing._id;
		}

		const recipeId = await ctx.db.insert("recipes", {
			productId: args.productId,
			variantName: args.variantName,
			ingredients: args.ingredients,
		});
		await ctx.runMutation(api.hpp.upsertHppFromRecipe, {
			productId: args.productId,
			variantName: args.variantName,
		});
		await syncProductAvailabilityForInventoryIds(
			ctx,
			args.ingredients.map((ingredient) => ingredient.inventoryId)
		);
		return recipeId;
	},
});

export const deleteRecipe = mutation({
	args: {
		id: v.id("recipes"),
	},
	handler: async (ctx, args) => {
		await ctx.db.delete(args.id);
	},
});

export const deductStockForOrder = mutation({
	args: {
		orderId: v.id("orders"),
	},
	handler: async (ctx, args) => {
		await deductStockForOrderInternal(ctx, args);
	},
});

export async function deductStockForOrderInternal(
	ctx: MutationCtx,
	args: { orderId: Id<"orders"> }
) {
	const order = await ctx.db.get(args.orderId);
	if (!order) {
		throw new Error("Order not found");
	}

	for (const item of order.items) {
		// 1. Deduct direct product quantity
		const product = await ctx.db.get(item.productId);
		if (product && typeof product.quantity === "number") {
			await ctx.db.patch(item.productId, {
				quantity: Math.max(0, product.quantity - item.quantity),
			});
		}

		// 2. Find recipe for this product + variant and deduct ingredients
		const recipe = await ctx.db
			.query("recipes")
			.withIndex("by_product_variant", (q) =>
				q.eq("productId", item.productId).eq("variantName", item.variant)
			)
			.first();

		if (!recipe) {
			// Also try to find a base recipe (no variant) if variant recipe not found
			const baseRecipe = await ctx.db
				.query("recipes")
				.withIndex("by_product_variant", (q) =>
					q.eq("productId", item.productId).eq("variantName", undefined)
				)
				.first();

			if (baseRecipe) {
				await deductIngredients(ctx, baseRecipe.ingredients, item.quantity);
			}
			continue;
		}

		await deductIngredients(ctx, recipe.ingredients, item.quantity);
	}
}

export const getBaseRecipes = query({
	args: {},
	handler: async (ctx) => {
		return await ctx.db.query("baseRecipes").collect();
	},
});

export const ensureInventoryItemForBaseRecipe = mutation({
	args: {
		baseRecipeId: v.id("baseRecipes"),
	},
	handler: async (ctx, args) => {
		const baseRecipe = await ctx.db.get(args.baseRecipeId);
		if (!baseRecipe) {
			throw new Error("Base recipe tidak ditemukan");
		}

		const inventoryItems = await ctx.db.query("inventory").collect();
		const existing = inventoryItems.find(
			(item) => item.baseRecipeId === args.baseRecipeId
		);
		if (existing) {
			return {
				inventoryId: existing._id,
				created: false,
			};
		}

		const inventoryId = await ctx.db.insert("inventory", {
			ingredientName: baseRecipe.name,
			unit: baseRecipe.targetUnit,
			quantity: 0,
			lowStockThreshold: 0,
			displayUnit: baseRecipe.targetUnit,
			conversionFactor: 1,
			baseRecipeId: args.baseRecipeId,
		});

		return {
			inventoryId,
			created: true,
		};
	},
});

export const createBaseRecipe = mutation({
	args: {
		name: v.string(),
		description: v.optional(v.string()),
		category: v.optional(v.string()),
		targetUnit: v.string(),
		targetQuantity: v.number(),
		ingredients: v.array(
			v.object({
				inventoryId: v.id("inventory"),
				amount: v.number(),
			})
		),
	},
	handler: async (ctx, args) => {
		return await ctx.db.insert("baseRecipes", args);
	},
});

export const updateBaseRecipe = mutation({
	args: {
		id: v.id("baseRecipes"),
		name: v.string(),
		description: v.optional(v.string()),
		category: v.optional(v.string()),
		targetUnit: v.string(),
		targetQuantity: v.number(),
		ingredients: v.array(
			v.object({
				inventoryId: v.id("inventory"),
				amount: v.number(),
			})
		),
	},
	handler: async (ctx, args) => {
		const { id, ...data } = args;
		await ctx.db.patch(id, data);
	},
});

export const deleteBaseRecipe = mutation({
	args: { id: v.id("baseRecipes") },
	handler: async (ctx, args) => {
		await ctx.db.delete(args.id);
	},
});

export const getInventoryItemBatches = query({
	args: { inventoryId: v.id("inventory") },
	handler: async (ctx, args) => {
		const restockBatches = await ctx.db
			.query("inventoryTransactions")
			.withIndex("by_inventory_and_type", (q) =>
				q.eq("inventoryId", args.inventoryId).eq("type", "restock")
			)
			.collect();
		const productionBatches = await ctx.db
			.query("inventoryTransactions")
			.withIndex("by_inventory_and_type", (q) =>
				q.eq("inventoryId", args.inventoryId).eq("type", "production")
			)
			.collect();

		return [...restockBatches, ...productionBatches]
			.filter((batch) => (batch.remainingQuantity ?? 0) > 0)
			.sort((left, right) => right.timestamp - left.timestamp);
	},
});

/**
 * Mutation to "produce" a base recipe.
 * Deducts ingredients from inventory and adds the product to an inventory item.
 */
export const produceBaseRecipeBatch = mutation({
	args: {
		baseRecipeId: v.id("baseRecipes"),
		inventoryId: v.id("inventory"), // The target inventory item for this pre-mix
		batchMultiplier: v.number(), // How many batches to produce
		notes: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		if (args.batchMultiplier <= 0) {
			throw new Error("Batch multiplier harus lebih dari 0");
		}

		const recipe = await ctx.db.get(args.baseRecipeId);
		if (!recipe) {
			throw new Error("Recipe not found");
		}

		const targetItem = await ctx.db.get(args.inventoryId);
		if (!targetItem) {
			throw new Error("Target inventory item not found");
		}

		const now = Date.now();
		let totalIngredientCost = 0;
		for (const ingredient of recipe.ingredients) {
			const latestCostPerUnit = await getLatestCostPerUnitForInventory(
				ctx,
				ingredient.inventoryId
			);
			if (latestCostPerUnit == null || latestCostPerUnit <= 0) {
				continue;
			}
			totalIngredientCost +=
				latestCostPerUnit * ingredient.amount * args.batchMultiplier;
		}

		// 1. Deduct ingredients
		await deductIngredients(ctx, recipe.ingredients, args.batchMultiplier);

		// 2. Add stock to target item
		const addedQuantity = recipe.targetQuantity * args.batchMultiplier;
		const productionCostPerUnit =
			addedQuantity > 0 && totalIngredientCost > 0
				? totalIngredientCost / addedQuantity
				: undefined;
		await ctx.db.patch(args.inventoryId, {
			quantity: targetItem.quantity + addedQuantity,
			lastPurchasePrice: productionCostPerUnit ?? targetItem.lastPurchasePrice,
			lastPurchaseAt: now,
		});

		// 3. Record transaction with FIFO tracking
		await ctx.db.insert("inventoryTransactions", {
			inventoryId: args.inventoryId,
			quantity: addedQuantity,
			remainingQuantity: addedQuantity,
			type: "production",
			timestamp: now,
			costPerUnit: productionCostPerUnit,
			notes: args.notes || `Produced from recipe: ${recipe.name}`,
		});

		if (productionCostPerUnit != null) {
			await ctx.runMutation(api.hpp.syncHppCalculationsByInventoryIds, {
				inventoryIds: [args.inventoryId],
			});
		}

		await syncProductAvailabilityForInventoryIds(ctx, [
			args.inventoryId,
			...recipe.ingredients.map((ingredient) => ingredient.inventoryId),
		]);
	},
});

async function deductIngredients(
	ctx: MutationCtx,
	ingredients: { inventoryId: Id<"inventory">; amount: number }[],
	multiplier: number
) {
	const touchedInventoryIds = new Set<Id<"inventory">>();
	for (const ing of ingredients) {
		const inventoryItem = await ctx.db.get(ing.inventoryId);
		if (!inventoryItem) {
			continue;
		}

		const totalDeduction = ing.amount * multiplier;

		// Sequential deduction (FIFO)
		await consumeStockFifo(ctx, ing.inventoryId, totalDeduction);

		// Update total stock
		await ctx.db.patch(ing.inventoryId, {
			quantity: inventoryItem.quantity - totalDeduction,
		});

		// Record transaction (summary)
		await ctx.db.insert("inventoryTransactions", {
			inventoryId: ing.inventoryId,
			quantity: -totalDeduction,
			type: "usage",
			timestamp: Date.now(),
			notes: "Automated deduction for recipe use/production",
		});
		touchedInventoryIds.add(ing.inventoryId);
	}

	if (touchedInventoryIds.size > 0) {
		await syncProductAvailabilityForInventoryIds(ctx, [...touchedInventoryIds]);
	}
}

export const runDailyInventoryAutomation = internalMutation({
	args: {},
	handler: async (ctx) => {
		const now = Date.now();
		const dayKey = getJakartaDayKey(now);
		const daysWindow = 30;
		const msPerDay = 24 * 60 * 60 * 1000;
		const cutoff = now - daysWindow * msPerDay;

		const [items, usageRows, pendingTasks] = await Promise.all([
			ctx.db.query("inventory").collect(),
			ctx.db
				.query("inventoryTransactions")
				.withIndex("by_type_and_timestamp", (q) =>
					q.eq("type", "usage").gte("timestamp", cutoff)
				)
				.collect(),
			ctx.db
				.query("followUpTasks")
				.withIndex("by_status", (q) => q.eq("status", "pending"))
				.take(300),
		]);

		const usageByInventoryId: Record<string, number> = {};
		for (const tx of usageRows) {
			const key = tx.inventoryId as string;
			usageByInventoryId[key] =
				(usageByInventoryId[key] ?? 0) + Math.abs(Number(tx.quantity) || 0);
		}

		const createdTaskIds: Id<"followUpTasks">[] = [];
		for (const item of items) {
			const avgDailyUsage = (usageByInventoryId[item._id as string] ?? 0) / daysWindow;
			const reorderPoint = Math.ceil(avgDailyUsage * 5);
			const suggestedOrderQty = Math.max(0, Math.ceil(avgDailyUsage * 7 - item.quantity));
			const isLow = item.quantity <= item.lowStockThreshold;
			const shouldReorder =
				suggestedOrderQty > 0 && (isLow || item.quantity <= reorderPoint);

			if (!shouldReorder) {
				continue;
			}

			const hasTask = pendingTasks.some(
				(task) =>
					task.category === "inventory" &&
					task.actionType === "restock" &&
					task.actionData?.inventoryId === item._id &&
					task.actionData?.dayKey === dayKey
			);
			if (hasTask) {
				continue;
			}

			const dueDate = now + 24 * 60 * 60 * 1000;
			const taskId = await ctx.db.insert("followUpTasks", {
				title: `Restock ${item.ingredientName}`,
				description: `Rekomendasi order ${suggestedOrderQty} ${item.unit}. Stok saat ini ${item.quantity} ${item.unit}.`,
				priority: isLow ? "high" : "medium",
				status: "pending",
				dueDate,
				category: "inventory",
				actionType: "restock",
				actionData: {
					inventoryId: item._id,
					ingredientName: item.ingredientName,
					suggestedOrderQty,
					reorderPoint,
					dayKey,
				},
				createdAt: now,
			});
			createdTaskIds.push(taskId);
		}

		const highRiskCount = items.filter(
			(item) => item.quantity <= item.lowStockThreshold
		).length;

		const recentInsights = await ctx.db
			.query("aiInsightsLog")
			.withIndex("by_status", (q) => q.eq("status", "new"))
			.take(100);
		const hasDailyInsight = recentInsights.some(
			(insight) => insight.category === `inventory_daily_${dayKey}`
		);

		if (!hasDailyInsight) {
			await ctx.db.insert("aiInsightsLog", {
				insightType: "warning",
				title: `Inventory Daily Alert ${dayKey}`,
				content: `Risiko tinggi: ${highRiskCount} item. Draft restock baru: ${createdTaskIds.length}.`,
				category: `inventory_daily_${dayKey}`,
				priority: highRiskCount > 0 ? "high" : "medium",
				status: "new",
				actionTaken: "auto_generated",
				createdAt: now,
			});
		}

		await syncProductAvailabilityForInventoryIds(
			ctx,
			items.map((item) => item._id)
		);

		return {
			dayKey,
			highRiskCount,
			createdTaskCount: createdTaskIds.length,
		};
	},
});

/**
 * Sequential stock consumption from batches (FIFO).
 * Finds processing/restock transactions with remainingQuantity > 0.
 */
async function consumeStockFifo(
	ctx: MutationCtx,
	inventoryId: Id<"inventory">,
	amountToConsume: number
) {
	if (amountToConsume <= 0) {
		return;
	}

	const restockBatches = await ctx.db
		.query("inventoryTransactions")
		.withIndex("by_inventory_and_type", (q) =>
			q.eq("inventoryId", inventoryId).eq("type", "restock")
		)
		.collect();
	const productionBatches = await ctx.db
		.query("inventoryTransactions")
		.withIndex("by_inventory_and_type", (q) =>
			q.eq("inventoryId", inventoryId).eq("type", "production")
		)
		.collect();

	const activeBatches = [...restockBatches, ...productionBatches]
		.filter((b) => (b.remainingQuantity ?? 0) > 0)
		.sort((a, b) => a.timestamp - b.timestamp);

	let remainingToDeduct = amountToConsume;

	for (const batch of activeBatches) {
		if (remainingToDeduct <= 0) break;

		const currentBatchStock = batch.remainingQuantity ?? 0;
		const deduction = Math.min(currentBatchStock, remainingToDeduct);

		await ctx.db.patch(batch._id, {
			remainingQuantity: currentBatchStock - deduction,
		});

		remainingToDeduct -= deduction;
	}

	// Note: If remainingToDeduct > 0, it means we oversold/overused past known batches.
	// This can happen with initial stock or manual adjustments.
}
