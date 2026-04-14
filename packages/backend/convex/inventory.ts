import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { api } from "./_generated/api";
import type { MutationCtx } from "./_generated/server";
import { internalMutation, mutation, query } from "./_generated/server";

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

	await ctx.db.patch(args.inventoryId, {
		quantity: item.quantity + args.quantity,
		lastPurchasePrice: resolvedCostPerUnit,
		lastPurchaseAt: timestamp,
		lastPurchaseStoreId: args.storeId ?? item.lastPurchaseStoreId,
		defaultBrandName: normalizedBrandName || item.defaultBrandName,
	});

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

	await consumeStockFifo(ctx, args.inventoryId, args.quantity);

	await ctx.db.patch(args.inventoryId, {
		quantity: item.quantity - args.quantity,
	});

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

	const diff = args.quantity - item.quantity;

	await ctx.db.patch(args.inventoryId, {
		quantity: args.quantity,
	});

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
					preferredStoreName:
						item.preferredStoreId != null
							? storeById.get(item.preferredStoreId as string)?.name ?? null
							: null,
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
	},
	handler: async (ctx, args) => {
		const { id, ...data } = args;
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
	},
});

export const deleteInventoryItem = mutation({
	args: { id: v.id("inventory") },
	handler: async (ctx, args) => {
		// Check if used in any recipes
		const recipes = await ctx.db.query("recipes").collect();

		const isUsed = recipes.some((r) =>
			r.ingredients.some((i) => i.inventoryId === args.id)
		);

		if (isUsed) {
			throw new Error(
				"Cannot delete item that is used in a recipe. Please remove it from recipes first."
			);
		}

		await ctx.db.delete(args.id);
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
