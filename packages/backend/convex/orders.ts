import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
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
		orderType: v.optional(v.union(v.literal("dine_in"), v.literal("takeaway"))),
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
		isOpenBill: v.optional(v.boolean()),
		autoComplete: v.optional(v.boolean()),
		createdAt: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const { autoComplete, isOpenBill, createdAt, ...orderData } = args;
		const orderNumber = `ORD-${Date.now().toString().slice(-4)}`;
		const orderCreatedAt = createdAt ?? Date.now();
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
