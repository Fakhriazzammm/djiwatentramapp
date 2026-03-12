import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

import { deductStockForOrderInternal } from "./inventory";

export const createOrder = mutation({
	args: {
		items: v.array(
			v.object({
				productId: v.id("products"),
				productName: v.string(),
				variant: v.optional(v.string()),
				quantity: v.number(),
				price: v.number(),
			})
		),
		totalAmount: v.number(),
		paymentMethod: v.string(),
		customerName: v.optional(v.string()),
		voucherId: v.optional(v.id("discounts")),
		discountAmount: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const orderNumber = `ORD-${Date.now().toString().slice(-4)}`;
		const orderId = await ctx.db.insert("orders", {
			...args,
			orderNumber,
			status: "pending",
			createdAt: Date.now(),
		});
		return orderId;
	},
});

export const getOrders = query({
	args: { status: v.optional(v.string()) }, // status filter
	handler: async (ctx, args) => {
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
				.collect();
		}
		return await ctx.db.query("orders").order("desc").collect();
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
	},
	handler: async (ctx, args) => {
		const order = await ctx.db.get(args.id);
		if (!order) {
			throw new Error("Order not found");
		}

		// Check if we need to record a transaction
		// If status changes TO 'paid' (or 'completed') FROM something else
		const isNowPaid = args.status === "paid" || args.status === "completed";
		const wasPaid = order.status === "paid" || order.status === "completed";

		if (isNowPaid && !wasPaid) {
			await ctx.db.insert("financialTransactions", {
				type: "income",
				amount: order.totalAmount,
				category: "Penjualan", // Standard category for sales
				description: `Penjualan Pesanan #${order.orderNumber}`,
				date: Date.now(),
				paymentMethod: order.paymentMethod,
				status: "completed",
				orderId: args.id,
			});
		}

		if (isNowPaid && !wasPaid) {
			// Deduct inventory
			await deductStockForOrderInternal(ctx, {
				orderId: args.id,
			});
		}

		await ctx.db.patch(args.id, { status: args.status });
	},
});

export const deleteOrder = mutation({
	args: { id: v.id("orders") },
	handler: async (ctx, args) => {
		// Delete financial transactions
		const transactions = await ctx.db
			.query("financialTransactions")
			.filter((q) => q.eq(q.field("orderId"), args.id))
			.collect();
		
		for (const tx of transactions) {
			await ctx.db.delete(tx._id);
		}

		await ctx.db.delete(args.id);
	},
});
