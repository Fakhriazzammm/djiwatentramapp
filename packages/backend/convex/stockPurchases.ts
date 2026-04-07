import { v } from "convex/values";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { mutation } from "./_generated/server";

const purchaseItemValidator = v.object({
	name: v.string(),
	qty: v.number(),
	price: v.number(),
	total: v.optional(v.number()),
	unit: v.optional(v.string()),
});

const purchaseDataValidator = v.object({
	total: v.number(),
	merchant: v.optional(v.string()),
	date: v.number(),
	paymentMethod: v.string(),
	description: v.optional(v.string()),
	category: v.optional(v.string()),
	rawText: v.optional(v.string()),
	sourceLabel: v.optional(v.string()),
	sourceFingerprint: v.optional(v.string()),
	items: v.array(purchaseItemValidator),
});

type PurchaseItem = {
	name: string;
	qty: number;
	price: number;
	total?: number;
	unit?: string;
};

type InventoryDoc = Doc<"inventory">;

function normalizeText(value: string) {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9\s]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function normalizeUnitLabel(unit?: string) {
	const normalized = normalizeText(unit || "");
	const aliases: Record<string, string> = {
		g: "gram",
		gr: "gram",
		gram: "gram",
		grams: "gram",
		kg: "kg",
		kilogram: "kg",
		kilo: "kg",
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
		btr: "pcs",
		btl: "bottle",
		botol: "bottle",
		bottle: "bottle",
		pack: "pack",
		packs: "pack",
		paket: "pack",
		bungkus: "pack",
		sachet: "pack",
		sak: "pack",
		box: "box",
		dus: "box",
		dozen: "dozen",
		lusin: "dozen",
	};

	return aliases[normalized] || normalized || "pcs";
}

function getUnitKind(unit: string) {
	if (unit === "gram" || unit === "kg") {
		return "weight";
	}
	if (unit === "ml" || unit === "liter") {
		return "volume";
	}
	return "count";
}

function getDefaultUnitSpec(unit?: string) {
	const normalized = normalizeUnitLabel(unit);

	if (normalized === "kg") {
		return {
			baseUnit: "gram",
			displayUnit: "kg",
			conversionFactor: 1000,
		};
	}

	if (normalized === "liter") {
		return {
			baseUnit: "ml",
			displayUnit: "liter",
			conversionFactor: 1000,
		};
	}

	if (normalized === "dozen") {
		return {
			baseUnit: "pcs",
			displayUnit: "dozen",
			conversionFactor: 12,
		};
	}

	return {
		baseUnit: normalized,
		displayUnit: undefined,
		conversionFactor: undefined,
	};
}

function getDefaultLowStockThreshold(unit: string) {
	switch (unit) {
		case "gram":
		case "ml":
			return 500;
		case "pack":
		case "box":
		case "bottle":
			return 3;
		case "pcs":
		default:
			return 10;
	}
}

function buildInventorySearchTerms(item: InventoryDoc) {
	return [item.ingredientName, ...(item.aliases || [])]
		.map((entry) => normalizeText(entry))
		.filter(Boolean);
}

function scoreNameMatch(left: string, right: string) {
	const normalizedLeft = normalizeText(left);
	const normalizedRight = normalizeText(right);

	if (!normalizedLeft || !normalizedRight) {
		return 0;
	}

	if (normalizedLeft === normalizedRight) {
		return 1;
	}

	if (
		normalizedLeft.length >= 4 &&
		(normalizedLeft.includes(normalizedRight) ||
			normalizedRight.includes(normalizedLeft))
	) {
		return 0.93;
	}

	const leftTokens = new Set(normalizedLeft.split(" ").filter(Boolean));
	const rightTokens = new Set(normalizedRight.split(" ").filter(Boolean));
	if (leftTokens.size === 0 || rightTokens.size === 0) {
		return 0;
	}

	const overlap = [...leftTokens].filter((token) => rightTokens.has(token)).length;
	return overlap / Math.max(leftTokens.size, rightTokens.size);
}

function scoreInventoryCandidate(item: PurchaseItem, inventoryItem: InventoryDoc) {
	const inventoryTerms = buildInventorySearchTerms(inventoryItem);
	const bestNameScore = inventoryTerms.reduce((best, term) => {
		return Math.max(best, scoreNameMatch(item.name, term));
	}, 0);

	if (bestNameScore === 0) {
		return 0;
	}

	const itemUnit = normalizeUnitLabel(item.unit);
	const inventoryBaseUnit = normalizeUnitLabel(inventoryItem.unit);
	const inventoryDisplayUnit = normalizeUnitLabel(inventoryItem.displayUnit);
	const itemUnitKind = getUnitKind(itemUnit);
	const inventoryUnitKind = getUnitKind(inventoryBaseUnit);

	let score = bestNameScore;
	if (
		itemUnit &&
		(itemUnit === inventoryBaseUnit || itemUnit === inventoryDisplayUnit)
	) {
		score += 0.07;
	} else if (itemUnit && itemUnitKind === inventoryUnitKind) {
		score += 0.03;
	}

	return Math.min(1, score);
}

function convertQuantityToBaseUnit(args: {
	quantity: number;
	listedUnit?: string;
	inventoryItem?: Pick<InventoryDoc, "unit" | "displayUnit" | "conversionFactor">;
}) {
	const quantity = Number(args.quantity) || 0;
	if (quantity <= 0) {
		return 0;
	}

	if (args.inventoryItem) {
		const listedUnit = normalizeUnitLabel(args.listedUnit);
		const baseUnit = normalizeUnitLabel(args.inventoryItem.unit);
		const displayUnit = normalizeUnitLabel(args.inventoryItem.displayUnit);
		const factor = args.inventoryItem.conversionFactor || 1;

		if (!listedUnit || listedUnit === baseUnit) {
			return quantity;
		}
		if (displayUnit && listedUnit === displayUnit && factor > 0) {
			return quantity * factor;
		}
		if (listedUnit === "kg" && baseUnit === "gram") {
			return quantity * 1000;
		}
		if (listedUnit === "liter" && baseUnit === "ml") {
			return quantity * 1000;
		}
		if (listedUnit === "dozen" && baseUnit === "pcs") {
			return quantity * 12;
		}
		return quantity;
	}

	const defaultSpec = getDefaultUnitSpec(args.listedUnit);
	if (
		defaultSpec.displayUnit &&
		normalizeUnitLabel(args.listedUnit) ===
			normalizeUnitLabel(defaultSpec.displayUnit)
	) {
		return quantity * (defaultSpec.conversionFactor || 1);
	}

	return quantity;
}

function buildPurchaseFingerprint(purchaseData: {
	merchant?: string;
	date: number;
	total: number;
	items: PurchaseItem[];
}) {
	const merchant = normalizeText(purchaseData.merchant || "supplier");
	const dayKey = new Date(purchaseData.date).toISOString().slice(0, 10);
	const total = Math.round(Number(purchaseData.total) || 0);
	const items = [...purchaseData.items]
		.map((item) => {
			const quantity = Number(item.qty) || 0;
			const totalValue =
				Number(item.total) || quantity * (Number(item.price) || 0);
			return `${normalizeText(item.name)}:${quantity}:${Math.round(totalValue)}:${normalizeUnitLabel(item.unit)}`;
		})
		.sort()
		.join("|");

	return `stock:${merchant}:${dayKey}:${total}:${items}`;
}

function collapsePurchaseItems(items: PurchaseItem[]) {
	const grouped = new Map<string, PurchaseItem>();

	for (const item of items) {
		const normalizedName = normalizeText(item.name);
		if (!normalizedName) {
			continue;
		}

		const quantity = Number(item.qty) > 0 ? Number(item.qty) : 1;
		const price = Math.max(0, Number(item.price) || 0);
		const total =
			Number(item.total) > 0 ? Number(item.total) : quantity * price;
		const unit = normalizeUnitLabel(item.unit);
		const key = `${normalizedName}|${unit}|${Math.round(price)}|${Math.round(total / Math.max(quantity, 1))}`;
		const existing = grouped.get(key);

		if (existing) {
			existing.qty += quantity;
			existing.total = (existing.total || 0) + total;
			continue;
		}

		grouped.set(key, {
			name: item.name.trim(),
			qty: quantity,
			price,
			total,
			unit,
		});
	}

	return [...grouped.values()];
}

function mergeAliases(existingAliases: string[] | undefined, values: string[]) {
	const next = new Set(
		(existingAliases || [])
			.map((entry) => entry.trim())
			.filter(Boolean)
	);

	for (const value of values) {
		const trimmed = value.trim();
		if (trimmed) {
			next.add(trimmed);
		}
	}

	return [...next].slice(0, 20);
}

async function createInventoryItemForPurchase(
	ctx: MutationCtx,
	item: PurchaseItem
) {
	const unitSpec = getDefaultUnitSpec(item.unit);
	const createdId = await ctx.db.insert("inventory", {
		ingredientName: item.name.trim(),
		unit: unitSpec.baseUnit,
		quantity: 0,
		lowStockThreshold: getDefaultLowStockThreshold(unitSpec.baseUnit),
		displayUnit: unitSpec.displayUnit,
		conversionFactor: unitSpec.conversionFactor,
		defaultBrandName: undefined,
		preferredStoreId: undefined,
		aliases: undefined,
		lastPurchaseAt: undefined,
		lastPurchasePrice: undefined,
		lastPurchaseStoreId: undefined,
	});

	const created = await ctx.db.get(createdId);
	if (!created) {
		throw new Error("Gagal membuat item inventory baru");
	}

	return created;
}

async function resolveInventoryItem(
	ctx: MutationCtx,
	item: PurchaseItem,
	allInventory: InventoryDoc[]
) {
	let bestMatch: InventoryDoc | null = null;
	let bestScore = 0;

	for (const inventoryItem of allInventory) {
		const score = scoreInventoryCandidate(item, inventoryItem);
		if (score > bestScore) {
			bestMatch = inventoryItem;
			bestScore = score;
		}
	}

	if (bestMatch && bestScore >= 0.76) {
		return {
			inventoryItem: bestMatch,
			created: false,
			matchScore: bestScore,
		};
	}

	const createdItem = await createInventoryItemForPurchase(ctx, item);
	allInventory.push(createdItem);
	return {
		inventoryItem: createdItem,
		created: true,
		matchScore: 1,
	};
}

async function resolveInventoryStore(
	ctx: MutationCtx,
	merchant?: string
): Promise<Id<"inventoryStores"> | undefined> {
	const trimmedMerchant = merchant?.trim();
	if (!trimmedMerchant) {
		return undefined;
	}

	const normalizedMerchant = normalizeText(trimmedMerchant);
	const stores = await ctx.db.query("inventoryStores").collect();
	const existing = stores.find(
		(store) => normalizeText(store.name) === normalizedMerchant
	);
	if (existing) {
		return existing._id;
	}

	return await ctx.db.insert("inventoryStores", {
		name: trimmedMerchant,
		type: "supplier",
		isActive: true,
		phone: undefined,
		address: undefined,
		notes: "Dibuat otomatis dari sinkron pembelian stok",
	});
}

async function applyInventoryQuantityDelta(
	ctx: MutationCtx,
	inventoryId: Id<"inventory">,
	delta: number,
	lastPurchasePrice: number,
	purchaseDate: number,
	aliases: string[],
	storeId?: Id<"inventoryStores">
) {
	const item = await ctx.db.get(inventoryId);
	if (!item) {
		throw new Error("Item inventory tidak ditemukan");
	}

	await ctx.db.patch(inventoryId, {
		quantity: item.quantity + delta,
		aliases: mergeAliases(item.aliases, aliases),
		lastPurchasePrice,
		lastPurchaseAt: purchaseDate,
		lastPurchaseStoreId: storeId ?? item.lastPurchaseStoreId,
	});
}

async function upsertPurchaseBatch(args: {
	ctx: MutationCtx;
	transactionId: Id<"financialTransactions">;
	inventoryItem: InventoryDoc;
	baseQuantity: number;
	costPerUnit: number;
	lineTotal: number;
	purchaseQuantity: number;
	purchaseUnit?: string;
	timestamp: number;
	notes: string;
	sourceLabel: string;
	sourceFingerprint: string;
	storeId?: Id<"inventoryStores">;
}) {
	const existingRows = await args.ctx.db
		.query("inventoryTransactions")
		.withIndex("by_source_transaction_id", (q) =>
			q.eq("sourceTransactionId", args.transactionId)
		)
		.collect();

	const existing = existingRows.find(
		(row) => row.sourceFingerprint === args.sourceFingerprint
	);

	if (!existing) {
		await applyInventoryQuantityDelta(
			args.ctx,
			args.inventoryItem._id,
			args.baseQuantity,
			args.costPerUnit,
			args.timestamp,
			[args.inventoryItem.ingredientName],
			args.storeId
		);

		await args.ctx.db.insert("inventoryTransactions", {
			inventoryId: args.inventoryItem._id,
			quantity: args.baseQuantity,
			remainingQuantity: args.baseQuantity,
			type: "restock",
			timestamp: args.timestamp,
			costPerUnit: args.costPerUnit,
			notes: args.notes,
			storeId: args.storeId,
			purchaseQuantity: args.purchaseQuantity,
			purchaseUnit: args.purchaseUnit,
			lineTotal: args.lineTotal,
			sourceTransactionId: args.transactionId,
			sourceLabel: args.sourceLabel,
			sourceFingerprint: args.sourceFingerprint,
		});

		return {
			created: true,
			updated: false,
		};
	}

	const consumedQuantity =
		existing.quantity - (existing.remainingQuantity ?? existing.quantity);

	if (
		existing.inventoryId !== args.inventoryItem._id &&
		consumedQuantity > 0
	) {
		await args.ctx.db.patch(existing._id, {
			costPerUnit: args.costPerUnit,
			timestamp: args.timestamp,
			notes: `${args.notes} | mapping dipertahankan karena batch lama sudah terpakai`,
			sourceLabel: args.sourceLabel,
		});

		return {
			created: false,
			updated: true,
		};
	}

	if (existing.inventoryId !== args.inventoryItem._id) {
		await applyInventoryQuantityDelta(
			args.ctx,
			existing.inventoryId,
			-existing.quantity,
			args.costPerUnit,
			args.timestamp,
			[],
			undefined
		);
		await applyInventoryQuantityDelta(
			args.ctx,
			args.inventoryItem._id,
			args.baseQuantity,
			args.costPerUnit,
			args.timestamp,
			[args.inventoryItem.ingredientName],
			args.storeId
		);
	} else {
		const delta = args.baseQuantity - existing.quantity;
		if (delta !== 0) {
			await applyInventoryQuantityDelta(
				args.ctx,
				args.inventoryItem._id,
				delta,
				args.costPerUnit,
				args.timestamp,
				[args.inventoryItem.ingredientName],
				args.storeId
			);
		} else {
			await applyInventoryQuantityDelta(
				args.ctx,
				args.inventoryItem._id,
				0,
				args.costPerUnit,
				args.timestamp,
				[args.inventoryItem.ingredientName],
				args.storeId
			);
		}
	}

	await args.ctx.db.patch(existing._id, {
		inventoryId: args.inventoryItem._id,
		quantity: args.baseQuantity,
		remainingQuantity: Math.max(0, args.baseQuantity - consumedQuantity),
		timestamp: args.timestamp,
		costPerUnit: args.costPerUnit,
		notes: args.notes,
		storeId: args.storeId,
		purchaseQuantity: args.purchaseQuantity,
		purchaseUnit: args.purchaseUnit,
		lineTotal: args.lineTotal,
		sourceLabel: args.sourceLabel,
		sourceFingerprint: args.sourceFingerprint,
	});

	return {
		created: false,
		updated: true,
	};
}

export const recordStockPurchase = mutation({
	args: {
		purchaseData: purchaseDataValidator,
	},
	handler: async (ctx, args): Promise<{
		transactionId: Id<"financialTransactions">;
		createdTransaction: boolean;
		updatedCount: number;
		createdCount: number;
		matchedCount: number;
		hppUpdatedCalculations: number;
		hppUpdatedIngredients: number;
		message: string;
		items: Array<{
			name: string;
			inventoryId: Id<"inventory">;
			inventoryName: string;
			created: boolean;
			matchScore: number;
			baseQuantity: number;
			costPerUnit: number;
		}>;
	}> => {
		const normalizedItems = collapsePurchaseItems(args.purchaseData.items || []);
		if (normalizedItems.length === 0) {
			throw new Error("Tidak ada item pembelian yang bisa diproses");
		}

		const sourceFingerprint =
			args.purchaseData.sourceFingerprint ||
			buildPurchaseFingerprint({
				merchant: args.purchaseData.merchant,
				date: args.purchaseData.date,
				total: args.purchaseData.total,
				items: normalizedItems,
			});

		const computedTotal =
			args.purchaseData.total > 0
				? args.purchaseData.total
				: normalizedItems.reduce((sum, item) => {
						const lineTotal =
							Number(item.total) ||
							(Number(item.price) || 0) * (Number(item.qty) || 1);
						return sum + lineTotal;
					}, 0);

		const transactionResult: {
			id: Id<"financialTransactions">;
			created: boolean;
		} = await ctx.runMutation(api.finance.upsertReceiptTransaction, {
			type: "expense",
			amount: computedTotal,
			category: args.purchaseData.category || "Pembelian Stok",
			merchant: args.purchaseData.merchant,
			description:
				args.purchaseData.description ||
				`Pembelian stok dari ${args.purchaseData.merchant || "Supplier"}`,
			date: args.purchaseData.date,
			paymentMethod: args.purchaseData.paymentMethod || "cash",
			status: "completed",
			sourceFingerprint,
			tags: ["inventory_sync"],
			metadata: {
				source: "ai_receipt_scan",
				inputMode: "stock_purchase_sync",
				importedAt: Date.now(),
				rawText: args.purchaseData.rawText,
				sourceRef: sourceFingerprint,
				sourceLabel: args.purchaseData.sourceLabel || "AI Inventory Sync",
				syncSource: "inventory_auto",
				syncOutcome: "finance_plus_inventory",
				scanItems: normalizedItems.map((item) => ({
					name: item.name,
					quantity: item.qty,
					price: item.price,
					total:
						item.total ||
						(Number(item.price) || 0) * (Number(item.qty) || 1),
					unit: item.unit,
				})),
			},
		});

		const storeId = await resolveInventoryStore(ctx, args.purchaseData.merchant);
		const allInventory = await ctx.db.query("inventory").collect();
		let createdCount = 0;
		let updatedCount = 0;
		let matchedCount = 0;
		const affectedInventoryIds = new Set<Id<"inventory">>();
		const itemResults: Array<{
			name: string;
			inventoryId: Id<"inventory">;
			inventoryName: string;
			created: boolean;
			matchScore: number;
			baseQuantity: number;
			costPerUnit: number;
		}> = [];

		for (const item of normalizedItems) {
			const resolved = await resolveInventoryItem(ctx, item, allInventory);
			const inventoryItem = resolved.inventoryItem;
			const quantity = Number(item.qty) > 0 ? Number(item.qty) : 1;
			const lineTotal =
				Number(item.total) > 0
					? Number(item.total)
					: quantity * Math.max(0, Number(item.price) || 0);
			const baseQuantity = convertQuantityToBaseUnit({
				quantity,
				listedUnit: item.unit,
				inventoryItem,
			});
			const costPerUnit =
				baseQuantity > 0 ? lineTotal / baseQuantity : Math.max(0, Number(item.price));

			const rowFingerprint = `${sourceFingerprint}:${inventoryItem._id}`;
			const noteParts = [
				`Sinkron stok dari ${args.purchaseData.merchant || "supplier"}`,
				`item: ${item.name}`,
				resolved.created
					? "inventory baru dibuat otomatis"
					: `match ${Math.round(resolved.matchScore * 100)}% ke ${inventoryItem.ingredientName}`,
			];

			const batchResult = await upsertPurchaseBatch({
				ctx,
				transactionId: transactionResult.id,
				inventoryItem,
				baseQuantity,
				costPerUnit,
				lineTotal,
				purchaseQuantity: quantity,
				purchaseUnit: item.unit,
				timestamp: args.purchaseData.date,
				notes: noteParts.join(" | "),
				sourceLabel: args.purchaseData.sourceLabel || "AI Inventory Sync",
				sourceFingerprint: rowFingerprint,
				storeId,
			});

			const currentInventory = await ctx.db.get(inventoryItem._id);
			if (currentInventory) {
				await ctx.db.patch(inventoryItem._id, {
					aliases: mergeAliases(currentInventory.aliases, [item.name]),
					lastPurchasePrice: costPerUnit,
					lastPurchaseAt: args.purchaseData.date,
					lastPurchaseStoreId: storeId,
				});
			}

			if (resolved.created) {
				createdCount += 1;
			} else {
				matchedCount += 1;
			}

			if (batchResult.created || batchResult.updated) {
				updatedCount += 1;
			}

			affectedInventoryIds.add(inventoryItem._id);
			itemResults.push({
				name: item.name,
				inventoryId: inventoryItem._id,
				inventoryName: inventoryItem.ingredientName,
				created: resolved.created,
				matchScore: resolved.matchScore,
				baseQuantity,
				costPerUnit,
			});
		}

		const hppSyncResult: {
			updatedCalculations: number;
			updatedIngredients: number;
		} = await ctx.runMutation(api.hpp.syncHppCalculationsByInventoryIds, {
			inventoryIds: [...affectedInventoryIds],
		});

		return {
			transactionId: transactionResult.id,
			createdTransaction: transactionResult.created,
			updatedCount,
			createdCount,
			matchedCount,
			hppUpdatedCalculations: hppSyncResult.updatedCalculations,
			hppUpdatedIngredients: hppSyncResult.updatedIngredients,
			message: `Pembelian stok tersimpan. ${matchedCount} item cocok dengan inventory, ${createdCount} item baru dibuat, HPP sinkron di ${hppSyncResult.updatedCalculations} kalkulasi.`,
			items: itemResults,
		};
	},
});
