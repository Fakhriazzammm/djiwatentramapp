import { v } from "convex/values";
import { api } from "./_generated/api";
import { mutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

const scanItemValidator = v.object({
	name: v.string(),
	quantity: v.number(),
	price: v.optional(v.number()),
	total: v.optional(v.number()),
	unit: v.optional(v.string()),
});

function normalizeText(value: string | undefined) {
	return (value || "")
		.toLowerCase()
		.replace(/[^a-z0-9\s]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function normalizeCategory(value: string | undefined) {
	const normalized = normalizeText(value);
	const aliases: Record<string, string> = {
		pembelian: "belanja_stok",
		"pembelian stok": "belanja_stok",
		"belanja stok": "belanja_stok",
		"bahan baku": "belanja_stok",
		restock: "belanja_stok",
		"stock purchase": "belanja_stok",
		"makanan minuman": "makanan_minuman",
		"makanan dan minuman": "makanan_minuman",
		"peralatan kantor": "peralatan_kantor",
		"utilitas listrik air": "utilitas_listrik_air",
		"gaji karyawan": "gaji_karyawan",
		"sewa tempat": "sewa_tempat",
		"pembangunan renovasi": "pembangunan_renovasi",
	};

	return aliases[normalized] || normalized || "lainnya";
}

function isInventoryPurchaseCategory(value: string | undefined) {
	return normalizeCategory(value) === "belanja_stok";
}

function normalizePaymentMethod(value: string | undefined) {
	return normalizeText(value) || "cash";
}

function normalizeItems(
	items: Array<{
		name: string;
		quantity: number;
		price?: number;
		total?: number;
		unit?: string;
	}>,
) {
	return items
		.map((item) => {
			const quantity = Number(item.quantity) || 1;
			const price =
				item.price !== undefined && Number.isFinite(Number(item.price))
					? Number(item.price)
					: undefined;
			const total =
				item.total !== undefined && Number.isFinite(Number(item.total))
					? Number(item.total)
					: undefined;
			return {
				name: item.name.trim(),
				quantity,
				price,
				total,
				unit: item.unit?.trim() || undefined,
			};
		})
		.filter((item) => item.name);
}

function buildExpenseFingerprint(args: {
	source: string;
	type: "income" | "expense";
	amount: number;
	category: string;
	merchant?: string;
	date: number;
	rawText?: string;
	items: Array<{
		name: string;
		quantity: number;
		price?: number;
		total?: number;
		unit?: string;
	}>;
}) {
	const dayKey = new Date(args.date).toISOString().slice(0, 10);
	const itemsKey = args.items
		.map((item) => {
			const lineTotal =
				Number(item.total) ||
				(Number(item.price) || 0) * Math.max(Number(item.quantity) || 1, 1);
			return `${normalizeText(item.name)}:${item.quantity}:${Math.round(lineTotal)}:${normalizeText(
				item.unit,
			)}`;
		})
		.sort()
		.join("|");

	return [
		"expense-intake",
		normalizeText(args.source),
		args.type,
		normalizeCategory(args.category),
		normalizeText(args.merchant),
		dayKey,
		Math.round(Number(args.amount) || 0),
		itemsKey || normalizeText(args.rawText).slice(0, 120),
	].join(":");
}

function buildSyncWarnings(args: {
	type: "income" | "expense";
	amount: number;
	items: Array<{
		name: string;
		quantity: number;
		price?: number;
		total?: number;
		unit?: string;
	}>;
}) {
	const warnings: string[] = [];
	if (args.type !== "expense" || args.items.length === 0) {
		return warnings;
	}

	const itemTotal = args.items.reduce((sum, item) => {
		const quantity = Number(item.quantity) || 1;
		return sum + (Number(item.total) || (Number(item.price) || 0) * quantity);
	}, 0);
	const amount = Number(args.amount) || 0;
	if (itemTotal <= 0 || amount <= 0) {
		return warnings;
	}

	const diff = Math.abs(itemTotal - amount);
	const diffRatio = diff / Math.max(amount, itemTotal);
	if (diff >= 1000 && diffRatio >= 0.1) {
		warnings.push(
			`Total item berbeda Rp${diff.toLocaleString("id-ID")} dari nominal transaksi.`,
		);
	}

	return warnings;
}

export const recordExpense = mutation({
	args: {
		source: v.optional(v.string()),
		rawText: v.optional(v.string()),
		existingTransactionId: v.optional(v.id("financialTransactions")),
		sourceFingerprint: v.optional(v.string()),
		syncMode: v.optional(
			v.union(
				v.literal("auto"),
				v.literal("finance_only"),
				v.literal("finance_plus_inventory"),
			),
		),
		transaction: v.object({
			type: v.union(v.literal("income"), v.literal("expense")),
			amount: v.number(),
			category: v.string(),
			merchant: v.optional(v.string()),
			description: v.optional(v.string()),
			date: v.optional(v.number()),
			paymentMethod: v.optional(v.string()),
			status: v.optional(
				v.union(
					v.literal("completed"),
					v.literal("pending"),
					v.literal("cancelled"),
				),
			),
			attachmentUrl: v.optional(v.string()),
			isRecurring: v.optional(v.boolean()),
			recurringInterval: v.optional(
				v.union(v.literal("daily"), v.literal("weekly"), v.literal("monthly")),
			),
			tags: v.optional(v.array(v.string())),
		}),
		items: v.optional(v.array(scanItemValidator)),
		metadata: v.optional(
			v.object({
				inputMode: v.optional(v.string()),
				aiSessionId: v.optional(v.string()),
				sourceRef: v.optional(v.string()),
				sourceLabel: v.optional(v.string()),
			}),
		),
	},
	handler: async (ctx, args): Promise<{
		transactionId: Id<"financialTransactions">;
		createdTransaction: boolean;
		syncOutcome: "finance_only" | "finance_plus_inventory";
		warnings: string[];
		createdCount: number;
		matchedCount: number;
		updatedCount: number;
		hppUpdatedCalculations: number;
		hppUpdatedIngredients: number;
		items: Array<{
			name: string;
			inventoryId?: Id<"inventory">;
			inventoryName?: string;
			created?: boolean;
			matchScore?: number;
			baseQuantity?: number;
			costPerUnit?: number;
		}>;
		message: string;
	}> => {
		const source = args.source || "manual_form";
		const normalizedItems = normalizeItems(args.items || []);
		const date = args.transaction.date ?? Date.now();
		const type = args.transaction.type;
		const category = args.transaction.category.trim() || "Lainnya";
		const existingTransaction = args.existingTransactionId
			? await ctx.db.get(args.existingTransactionId)
			: null;
		const fingerprint =
			args.sourceFingerprint ||
			existingTransaction?.sourceFingerprint ||
			buildExpenseFingerprint({
				source,
				type,
				amount: args.transaction.amount,
				category,
				merchant: args.transaction.merchant,
				date,
				rawText: args.rawText || args.transaction.description,
				items: normalizedItems,
			});

		if (
			existingTransaction &&
			!existingTransaction.sourceFingerprint &&
			fingerprint
		) {
			await ctx.db.patch(existingTransaction._id, {
				sourceFingerprint: fingerprint,
			});
		}
		const warnings = buildSyncWarnings({
			type,
			amount: args.transaction.amount,
			items: normalizedItems,
		});

		const shouldSyncInventory =
			type === "expense" &&
			normalizedItems.length > 0 &&
			(args.syncMode === "finance_plus_inventory" ||
				(args.syncMode !== "finance_only" &&
					isInventoryPurchaseCategory(category)));

		if (shouldSyncInventory) {
			const purchaseResult = await ctx.runMutation(
				api.stockPurchases.recordStockPurchase,
				{
					purchaseData: {
						total: args.transaction.amount,
						merchant: args.transaction.merchant,
						date,
						paymentMethod: normalizePaymentMethod(args.transaction.paymentMethod),
						description: args.transaction.description,
						category,
						rawText: args.rawText,
						sourceLabel:
							args.metadata?.sourceLabel ||
							(source === "manual_form" ? "Manual Form" : source),
						sourceFingerprint: fingerprint,
						items: normalizedItems.map((item) => ({
							name: item.name,
							qty: item.quantity,
							price:
								item.price ??
								(Number(item.total) || 0) /
									Math.max(Number(item.quantity) || 1, 1) ??
								0,
							total: item.total,
							unit: item.unit,
						})),
					},
				},
			);

			return {
				transactionId: purchaseResult.transactionId,
				createdTransaction: purchaseResult.createdTransaction,
				syncOutcome: "finance_plus_inventory",
				warnings,
				createdCount: purchaseResult.createdCount,
				matchedCount: purchaseResult.matchedCount,
				updatedCount: purchaseResult.updatedCount,
				hppUpdatedCalculations: purchaseResult.hppUpdatedCalculations,
				hppUpdatedIngredients: purchaseResult.hppUpdatedIngredients,
				items: purchaseResult.items,
				message: purchaseResult.message,
			};
		}

		const financeResult = await ctx.runMutation(api.finance.upsertReceiptTransaction, {
			type,
			amount: args.transaction.amount,
			category,
			merchant: args.transaction.merchant,
			description: args.transaction.description,
			date,
			paymentMethod: normalizePaymentMethod(args.transaction.paymentMethod),
			status: args.transaction.status ?? "completed",
			attachmentUrl: args.transaction.attachmentUrl,
			sourceFingerprint: fingerprint,
			isRecurring: args.transaction.isRecurring,
			recurringInterval: args.transaction.recurringInterval,
			tags: args.transaction.tags,
			metadata: {
				source,
				inputMode: args.metadata?.inputMode || "expense_intake",
				aiSessionId: args.metadata?.aiSessionId,
				importedAt: Date.now(),
				rawText: args.rawText,
				sourceRef: args.metadata?.sourceRef || fingerprint,
				sourceLabel:
					args.metadata?.sourceLabel ||
					(source === "manual_form" ? "Manual Form" : source),
				syncSource: source,
				syncOutcome: "finance_only",
				syncWarnings: warnings.length > 0 ? warnings : undefined,
				scanItems: normalizedItems.length > 0 ? normalizedItems : undefined,
			},
		});

		return {
			transactionId: financeResult.id,
			createdTransaction: financeResult.created,
			syncOutcome: "finance_only",
			warnings,
			createdCount: 0,
			matchedCount: 0,
			updatedCount: 0,
			hppUpdatedCalculations: 0,
			hppUpdatedIngredients: 0,
			items: [],
			message:
				type === "expense"
					? "Pengeluaran berhasil dicatat."
					: "Transaksi berhasil dicatat.",
		};
	},
});
