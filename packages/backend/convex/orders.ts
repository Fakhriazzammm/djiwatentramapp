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
				originalPrice: v.optional(v.number()),
				status: v.optional(v.union(v.literal("pending"), v.literal("preparing"), v.literal("ready"))),
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
		autoComplete: v.optional(v.boolean()), // If true, set status to 'paid' immediately
	},
	handler: async (ctx, args) => {
		const { autoComplete, isOpenBill, ...orderData } = args;
		const orderNumber = `ORD-${Date.now().toString().slice(-4)}`;
		const nextStatus = isOpenBill
			? "pending"
			: autoComplete
				? "completed"
				: "paid";
		
		const orderId = await ctx.db.insert("orders", {
			...orderData,
			orderNumber,
			status: nextStatus,
			createdAt: Date.now(),
		});

		// Paid and completed orders should immediately record finance and stock.
		if (!isOpenBill) {
			// We can't call updateOrderStatus mutation directly from here efficiently, 
			// but we can trigger its logic or let a separate process handle it.
			// For simplicity in Convex, we should probably refactor the logic into an internal function.
			// But for now, let's at least record the basic transaction.
			
			// 1. Record Income Transaction
			await ctx.db.insert("financialTransactions", {
				type: "income",
				amount: args.totalAmount,
				category: "Penjualan",
				description: `Penjualan Pesanan #${orderNumber}`,
				date: Date.now(),
				paymentMethod: args.paymentMethod,
				status: "completed",
				orderId,
			});

			// 2. Deduct inventory (internal call)
			await deductStockForOrderInternal(ctx, { orderId });
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
		const limit = args.limit ?? 200; // Default limit to prevent slow performance
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
			// 1. Record Income Transaction
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

			// 2. Calculate and Record HPP (COGS) Transaction
			const allHpp = await ctx.db.query("hppCalculations").collect();
			const hppByProduct: Record<string, number> = {};
			
			// Helper to compute HPP from ingredients and overhead
			const computeHpp = (calc: any) => {
				const ingredientCost = calc.ingredients.reduce((sum: number, ing: any) => {
					const totalBase = ing.purchaseQuantity * ing.conversionFactor;
					const costBase = totalBase > 0 ? ing.purchasePrice / totalBase : 0;
					return sum + costBase * ing.usagePerServing;
				}, 0);
				const overheadCost = calc.overheadCosts.reduce(
					(sum: number, oh: any) => sum + oh.costPerServing,
					0
				);
				return ingredientCost + overheadCost;
			};

			for (const calc of allHpp) {
				if (calc.productId) {
					hppByProduct[calc.productId] = computeHpp(calc);
				}
			}

			let totalOrderCogs = 0;
			for (const item of order.items) {
				const hppPerUnit = hppByProduct[item.productId];
				if (hppPerUnit != null) {
					totalOrderCogs += hppPerUnit * item.quantity;
				}
			}

			if (totalOrderCogs > 0) {
				await ctx.db.insert("financialTransactions", {
					type: "expense",
					amount: totalOrderCogs,
					category: "HPP",
					description: `HPP Pesanan #${order.orderNumber}`,
					date: Date.now(),
					status: "completed",
					orderId: args.id,
				});
			}

			// 3. Deduct inventory
			await deductStockForOrderInternal(ctx, {
				orderId: args.id,
			});
		}

		await ctx.db.patch(args.id, { status: args.status });
	},
});

// Delete an order and its associated financial transactions
export const deleteOrder = mutation({
	args: { id: v.id("orders") },
	handler: async (ctx, args) => {
		// Delete associated financial transactions (Income and HPP)
		const transactions = await ctx.db
			.query("financialTransactions")
			.collect();

		const orderTransactions = transactions.filter((tx) => tx.orderId === args.id);

		for (const tx of orderTransactions) {
			await ctx.db.delete(tx._id);
		}

		await ctx.db.delete(args.id);
	},
});

// Update an order (customer name, payment method, etc.)
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
