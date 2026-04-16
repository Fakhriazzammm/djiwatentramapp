import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internalMutation, mutation, query } from "./_generated/server";
import { deductStockForOrderInternal } from "./inventory";
import { computeHppFromCalculation, type OrderItemHppSnapshot } from "./lib/hpp";

type SettledOrder = Pick<
	Doc<"orders">,
	"orderNumber" | "items" | "totalAmount" | "paymentMethod" | "createdAt"
> & {
	_id: Id<"orders">;
};

type ProductHppIndex = Record<
	string,
	{
		hppCalculationId: Id<"hppCalculations">;
		hppPerUnit: number;
	}
>;

function getOrderSourcePrefix(
	source?: "pos" | "customer_self_service" | "booking",
) {
	if (source === "customer_self_service") return "SO";
	if (source === "booking") return "BKO";
	return "ORD";
}

function getOrderTypeCode(orderType?: "dine_in" | "takeaway") {
	if (orderType === "dine_in") return "D";
	if (orderType === "takeaway") return "T";
	return "X";
}

function generateOrderNumber(args: {
	source?: "pos" | "customer_self_service" | "booking";
	orderType?: "dine_in" | "takeaway";
	createdAt: number;
}) {
	const sourcePrefix = getOrderSourcePrefix(args.source);
	const typeCode = getOrderTypeCode(args.orderType);
	const timeCode = args.createdAt.toString(36).toUpperCase().slice(-6);
	const randomCode = Math.random().toString(36).toUpperCase().slice(2, 4);
	return `${sourcePrefix}-${typeCode}-${timeCode}${randomCode}`;
}

function generateMigratedOrderNumber(order: {
	_id: Id<"orders">;
	source?: "pos" | "customer_self_service" | "booking";
	orderType?: "dine_in" | "takeaway";
	createdAt: number;
}) {
	const sourcePrefix = getOrderSourcePrefix(order.source);
	const typeCode = getOrderTypeCode(order.orderType);
	const timeCode = order.createdAt.toString(36).toUpperCase().slice(-6);
	const idCode = String(order._id).replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(-3);
	return `${sourcePrefix}-${typeCode}-${timeCode}${idCode}`;
}

async function buildLatestHppIndex(ctx: MutationCtx): Promise<ProductHppIndex> {
	const calculations = await ctx.db.query("hppCalculations").collect();
	const latestLinkedCalculations = [...calculations]
		.filter((calculation) => calculation.productId != null)
		.sort((left, right) => {
			const rightTimestamp = right.updatedAt ?? right.createdAt;
			const leftTimestamp = left.updatedAt ?? left.createdAt;
			return rightTimestamp - leftTimestamp;
		});

	const index: ProductHppIndex = {};
	for (const calculation of latestLinkedCalculations) {
		if (!calculation.productId || index[calculation.productId]) {
			continue;
		}

		index[calculation.productId] = {
			hppCalculationId: calculation._id,
			hppPerUnit: computeHppFromCalculation(calculation).totalHppPerServing,
		};
	}

	return index;
}

function buildOrderItemSnapshots(
	order: SettledOrder,
	hppIndex: ProductHppIndex,
	recordedAt: number
) {
	let totalOrderCogs = 0;
	let hasSnapshot = false;

	const itemsWithSnapshot = order.items.map((item) => {
		const hpp = hppIndex[item.productId];
		if (!hpp) {
			return item;
		}

		const snapshot: OrderItemHppSnapshot = {
			hppCalculationId: hpp.hppCalculationId,
			productId: item.productId,
			productName: item.productName,
			hppPerUnit: hpp.hppPerUnit,
			quantity: item.quantity,
			totalHpp: hpp.hppPerUnit * item.quantity,
			sellingPricePerUnit: item.price,
			source: "calculation",
			recordedAt,
		};

		totalOrderCogs += snapshot.totalHpp;
		hasSnapshot = true;

		return {
			...item,
			hppSnapshot: snapshot,
		};
	});

	return {
		itemsWithSnapshot,
		totalOrderCogs,
		hasSnapshot,
	};
}

async function settleOrder(
	ctx: MutationCtx,
	order: SettledOrder,
	transactionDate: number
) {
	await ctx.db.insert("financialTransactions", {
		type: "income",
		amount: order.totalAmount,
		category: "Penjualan",
		description: `Penjualan Pesanan #${order.orderNumber}`,
		date: transactionDate,
		paymentMethod: order.paymentMethod,
		status: "completed",
		orderId: order._id,
	});

	const hppIndex = await buildLatestHppIndex(ctx);
	const { itemsWithSnapshot, totalOrderCogs, hasSnapshot } = buildOrderItemSnapshots(
		order,
		hppIndex,
		transactionDate
	);

	if (hasSnapshot) {
		await ctx.db.patch(order._id, {
			items: itemsWithSnapshot,
		});
	}

	if (totalOrderCogs > 0) {
		await ctx.db.insert("financialTransactions", {
			type: "expense",
			amount: totalOrderCogs,
			category: "HPP",
			description: `HPP Pesanan #${order.orderNumber}`,
			date: transactionDate,
			status: "completed",
			orderId: order._id,
		});
	}

	await deductStockForOrderInternal(ctx, {
		orderId: order._id,
	});
}

export const createOrder = mutation({
	args: {
		items: v.array(
			v.object({
				productId: v.id("products"),
				productName: v.string(),
				variant: v.optional(v.string()),
				quantity: v.number(),
				price: v.number(),
				originalPrice: v.optional(v.number()),
				status: v.optional(
					v.union(v.literal("pending"), v.literal("preparing"), v.literal("ready"))
				),
			})
		),
		totalAmount: v.number(),
		paymentMethod: v.string(),
		customerName: v.optional(v.string()),
		tableNumber: v.optional(v.string()),
		orderType: v.optional(v.string()),
		source: v.optional(
			v.union(
				v.literal("pos"),
				v.literal("customer_self_service"),
				v.literal("booking")
			)
		),
		brandSlug: v.optional(v.string()),
		guestCount: v.optional(v.number()),
		freeRefillSelected: v.optional(v.boolean()),
		dessertLater: v.optional(v.boolean()),
		notes: v.optional(v.string()),
		voucherId: v.optional(v.id("discounts")),
		discountAmount: v.optional(v.number()),
		taxAmount: v.optional(v.number()),
		serviceChargeAmount: v.optional(v.number()),
		receiptMeta: v.optional(
			v.object({
				promotionLabels: v.optional(v.array(v.string())),
				adjustmentLines: v.optional(
					v.array(
						v.object({
							label: v.string(),
							amount: v.number(),
						})
					)
				),
			})
		),
		paymentReceiptKind: v.optional(
			v.union(
				v.literal("cashier_pending"),
				v.literal("gateway_paid"),
				v.literal("manual_qris_pending"),
				v.literal("transfer_pending")
			)
		),
		paymentGateway: v.optional(
			v.object({
				provider: v.string(),
				invoiceId: v.string(),
				transactionId: v.optional(v.string()),
				invoiceUrl: v.optional(v.string()),
				status: v.union(
					v.literal("created"),
					v.literal("pending"),
					v.literal("paid"),
					v.literal("expired"),
					v.literal("cancelled"),
					v.literal("failed")
				),
				paidAt: v.optional(v.number()),
			})
		),
		isOpenBill: v.optional(v.boolean()),
		autoComplete: v.optional(v.boolean()),
		createdAt: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const { autoComplete, isOpenBill, createdAt, ...orderData } = args;
		const orderCreatedAt = createdAt ?? Date.now();
		const orderNumber = generateOrderNumber({
			source: orderData.source,
			orderType: orderData.orderType,
			createdAt: orderCreatedAt,
		});
		const nextStatus = isOpenBill
			? "pending"
			: autoComplete
				? "completed"
				: "paid";

		const orderId = await ctx.db.insert("orders", {
			...orderData,
			orderNumber,
			status: nextStatus,
			createdAt: orderCreatedAt,
			gatewayInvoiceId: orderData.paymentGateway?.invoiceId,
		});

		if (!isOpenBill) {
			await settleOrder(
				ctx,
				{
					_id: orderId,
					orderNumber,
					items: orderData.items,
					totalAmount: orderData.totalAmount,
					paymentMethod: orderData.paymentMethod,
					createdAt: orderCreatedAt,
				},
				orderCreatedAt
			);
		}

		return orderId;
	},
});

export const migrateLegacyOrderNumbers = mutation({
	args: {
		limit: v.optional(v.number()),
		dryRun: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const limit = Math.min(1000, Math.max(1, Math.round(args.limit ?? 300)));
		const dryRun = args.dryRun ?? false;
		const orders = await ctx.db
			.query("orders")
			.withIndex("by_createdAt")
			.order("asc")
			.take(limit);

		let scanned = 0;
		let updated = 0;
		const samples: Array<{ id: Id<"orders">; before: string; after: string }> = [];

		for (const order of orders) {
			scanned += 1;
			const current = String(order.orderNumber || "").trim();
			const isLegacy =
				!/^(ORD|SO|BKO)-(D|T|X)-[A-Z0-9]+$/i.test(current) ||
				(current.startsWith("ORD-") && !/^ORD-(D|T|X)-/i.test(current));
			if (!isLegacy) continue;

			const nextOrderNumber = generateMigratedOrderNumber({
				_id: order._id,
				source: order.source,
				orderType: order.orderType,
				createdAt: order.createdAt,
			});
			if (!nextOrderNumber || nextOrderNumber === current) continue;

			if (!dryRun) {
				await ctx.db.patch(order._id, {
					orderNumber: nextOrderNumber,
				});
			}
			updated += 1;
			if (samples.length < 15) {
				samples.push({
					id: order._id,
					before: current || "-",
					after: nextOrderNumber,
				});
			}
		}

		return {
			scanned,
			updated,
			dryRun,
			samples,
		};
	},
});

export const getOrder = query({
	args: { id: v.id("orders") },
	handler: async (ctx, args) => {
		return await ctx.db.get(args.id);
	},
});

export const getOrders = query({
	args: {
		status: v.optional(v.string()),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const limit = args.limit ?? 200;
		if (args.status) {
			return await ctx.db
				.query("orders")
				.withIndex("by_status", (q) =>
					q.eq(
						"status",
						args.status as "pending" | "paid" | "completed" | "cancelled"
					)
				)
				.order("desc")
				.take(limit);
		}
		return await ctx.db.query("orders").order("desc").take(limit);
	},
});

export const updateOrderStatus = mutation({
	args: {
		id: v.id("orders"),
		status: v.union(
			v.literal("pending"),
			v.literal("paid"),
			v.literal("completed"),
			v.literal("cancelled")
		),
		transactionDate: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const order = await ctx.db.get(args.id);
		if (!order) {
			throw new Error("Order not found");
		}

		const isNowPaid = args.status === "paid" || args.status === "completed";
		const wasPaid = order.status === "paid" || order.status === "completed";
		const effectiveTransactionDate = args.transactionDate ?? order.createdAt ?? Date.now();

		if (isNowPaid && !wasPaid) {
			await settleOrder(
				ctx,
				{
					_id: order._id,
					orderNumber: order.orderNumber,
					items: order.items,
					totalAmount: order.totalAmount,
					paymentMethod: order.paymentMethod,
					createdAt: order.createdAt,
				},
				effectiveTransactionDate
			);
		}

		await ctx.db.patch(args.id, { status: args.status });
	},
});

export const updateOrderPaymentGateway = mutation({
	args: {
		id: v.id("orders"),
		paymentGateway: v.object({
			provider: v.string(),
			invoiceId: v.string(),
			transactionId: v.optional(v.string()),
			invoiceUrl: v.optional(v.string()),
			status: v.union(
				v.literal("created"),
				v.literal("pending"),
				v.literal("paid"),
				v.literal("expired"),
				v.literal("cancelled"),
				v.literal("failed")
			),
			paidAt: v.optional(v.number()),
		}),
		paymentReceiptKind: v.optional(
			v.union(
				v.literal("cashier_pending"),
				v.literal("gateway_paid"),
				v.literal("manual_qris_pending"),
				v.literal("transfer_pending")
			)
		),
	},
	handler: async (ctx, args) => {
		const order = await ctx.db.get(args.id);
		if (!order) {
			throw new Error("Order not found");
		}

		const isNowPaid = args.paymentGateway.status === "paid";
		const wasPaid = order.status === "paid" || order.status === "completed";
		const nextStatus =
			args.paymentGateway.status === "cancelled"
				? "cancelled"
				: args.paymentGateway.status === "paid"
					? "paid"
					: order.status;

		if (isNowPaid && !wasPaid) {
			const settledAt = args.paymentGateway.paidAt ?? Date.now();
			await settleOrder(
				ctx,
				{
					_id: order._id,
					orderNumber: order.orderNumber,
					items: order.items,
					totalAmount: order.totalAmount,
					paymentMethod: order.paymentMethod,
					createdAt: order.createdAt,
				},
				settledAt
			);
		}

		const patch: {
			paymentGateway: {
				provider: string;
				invoiceId: string;
				transactionId?: string;
				invoiceUrl?: string;
				status:
					| "created"
					| "pending"
					| "paid"
					| "expired"
					| "cancelled"
					| "failed";
				paidAt?: number;
			};
			status: "pending" | "paid" | "completed" | "cancelled";
			gatewayInvoiceId?: string;
			paymentReceiptKind?:
				| "cashier_pending"
				| "gateway_paid"
				| "manual_qris_pending"
				| "transfer_pending";
		} = {
			paymentGateway: args.paymentGateway,
			status: nextStatus,
			gatewayInvoiceId: args.paymentGateway.invoiceId,
		};
		const nextReceiptKind = args.paymentReceiptKind ?? order.paymentReceiptKind;
		if (nextReceiptKind) {
			patch.paymentReceiptKind = nextReceiptKind;
		}

		await ctx.db.patch(args.id, patch);
	},
});

export const updateOrderPaymentGatewayByInvoiceId = internalMutation({
	args: {
		invoiceId: v.string(),
		paymentGateway: v.object({
			provider: v.string(),
			invoiceId: v.string(),
			transactionId: v.optional(v.string()),
			invoiceUrl: v.optional(v.string()),
			status: v.union(
				v.literal("created"),
				v.literal("pending"),
				v.literal("paid"),
				v.literal("expired"),
				v.literal("cancelled"),
				v.literal("failed")
			),
			paidAt: v.optional(v.number()),
		}),
		paymentReceiptKind: v.optional(
			v.union(
				v.literal("cashier_pending"),
				v.literal("gateway_paid"),
				v.literal("manual_qris_pending"),
				v.literal("transfer_pending")
			)
		),
	},
	handler: async (ctx, args) => {
		const order = await ctx.db
			.query("orders")
			.withIndex("by_gateway_invoice_id", (q) =>
				q.eq("gatewayInvoiceId", args.invoiceId)
			)
			.unique();

		if (!order) {
			return { updated: false };
		}

		const isNowPaid = args.paymentGateway.status === "paid";
		const wasPaid = order.status === "paid" || order.status === "completed";
		const nextStatus =
			args.paymentGateway.status === "cancelled"
				? "cancelled"
				: args.paymentGateway.status === "paid"
					? "paid"
					: order.status;

		if (isNowPaid && !wasPaid) {
			const settledAt = args.paymentGateway.paidAt ?? Date.now();
			await settleOrder(
				ctx,
				{
					_id: order._id,
					orderNumber: order.orderNumber,
					items: order.items,
					totalAmount: order.totalAmount,
					paymentMethod: order.paymentMethod,
					createdAt: order.createdAt,
				},
				settledAt
			);
		}

		const patch: {
			paymentGateway: {
				provider: string;
				invoiceId: string;
				transactionId?: string;
				invoiceUrl?: string;
				status:
					| "created"
					| "pending"
					| "paid"
					| "expired"
					| "cancelled"
					| "failed";
				paidAt?: number;
			};
			status: "pending" | "paid" | "completed" | "cancelled";
			gatewayInvoiceId: string;
			paymentReceiptKind?:
				| "cashier_pending"
				| "gateway_paid"
				| "manual_qris_pending"
				| "transfer_pending";
		} = {
			paymentGateway: args.paymentGateway,
			status: nextStatus,
			gatewayInvoiceId: args.paymentGateway.invoiceId,
		};
		const nextReceiptKind = args.paymentReceiptKind ?? order.paymentReceiptKind;
		if (nextReceiptKind) {
			patch.paymentReceiptKind = nextReceiptKind;
		}

		await ctx.db.patch(order._id, patch);
		return { updated: true, orderId: order._id };
	},
});

export const deleteOrder = mutation({
	args: { id: v.id("orders") },
	handler: async (ctx, args) => {
		const transactions = await ctx.db.query("financialTransactions").collect();
		const orderTransactions = transactions.filter((tx) => tx.orderId === args.id);

		for (const transaction of orderTransactions) {
			await ctx.db.delete(transaction._id);
		}

		await ctx.db.delete(args.id);
	},
});

export const updateOrder = mutation({
	args: {
		id: v.id("orders"),
		customerName: v.optional(v.string()),
		paymentMethod: v.optional(v.string()),
		status: v.optional(
			v.union(
				v.literal("pending"),
				v.literal("paid"),
				v.literal("completed"),
				v.literal("cancelled")
			)
		),
	},
	handler: async (ctx, args) => {
		const { id, ...data } = args;
		await ctx.db.patch(id, data);
	},
});
