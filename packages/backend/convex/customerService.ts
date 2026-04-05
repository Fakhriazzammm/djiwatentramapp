import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const createRequest = mutation({
	args: {
		brandSlug: v.string(),
		orderId: v.optional(v.id("orders")),
		requestType: v.union(v.literal("call_staff"), v.literal("bring_dessert")),
		tableNumber: v.optional(v.string()),
		customerName: v.optional(v.string()),
		notes: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const createdAt = Date.now();
		let orderNumber: string | undefined;
		let tableNumber = args.tableNumber;
		let customerName = args.customerName;

		if (args.orderId) {
			const order = await ctx.db.get(args.orderId);
			if (!order) {
				throw new Error("Order not found");
			}

			orderNumber = order.orderNumber;
			tableNumber = tableNumber ?? order.tableNumber;
			customerName = customerName ?? order.customerName;
		}

		return await ctx.db.insert("customerServiceRequests", {
			brandSlug: args.brandSlug,
			requestType: args.requestType,
			status: "pending",
			source: "customer_page",
			createdAt,
			...(args.orderId ? { orderId: args.orderId } : {}),
			...(orderNumber ? { orderNumber } : {}),
			...(tableNumber ? { tableNumber } : {}),
			...(customerName ? { customerName } : {}),
			...(args.notes ? { notes: args.notes } : {}),
		});
	},
});

export const listRequests = query({
	args: {
		status: v.optional(
			v.union(
				v.literal("pending"),
				v.literal("acknowledged"),
				v.literal("completed"),
				v.literal("cancelled")
			)
		),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const limit = args.limit ?? 200;

		if (args.status) {
			return await ctx.db
				.query("customerServiceRequests")
				.withIndex("by_status", (q) => q.eq("status", args.status!))
				.order("desc")
				.take(limit);
		}

		return await ctx.db
			.query("customerServiceRequests")
			.order("desc")
			.take(limit);
	},
});

export const updateRequestStatus = mutation({
	args: {
		id: v.id("customerServiceRequests"),
		status: v.union(
			v.literal("pending"),
			v.literal("acknowledged"),
			v.literal("completed"),
			v.literal("cancelled")
		),
	},
	handler: async (ctx, args) => {
		const request = await ctx.db.get(args.id);
		if (!request) {
			throw new Error("Request not found");
		}

		const patch: {
			status: "pending" | "acknowledged" | "completed" | "cancelled";
			resolvedAt?: number;
		} = {
			status: args.status,
		};
		if (args.status === "completed" || args.status === "cancelled") {
			patch.resolvedAt = Date.now();
		}

		await ctx.db.patch(args.id, patch);
	},
});

export const getRequestSummary = query({
	args: {},
	handler: async (ctx) => {
		const pending = await ctx.db
			.query("customerServiceRequests")
			.withIndex("by_status", (q) => q.eq("status", "pending"))
			.take(200);
		const acknowledged = await ctx.db
			.query("customerServiceRequests")
			.withIndex("by_status", (q) => q.eq("status", "acknowledged"))
			.take(200);

		return {
			pendingCount: pending.length,
			acknowledgedCount: acknowledged.length,
			recentPending: pending.slice(0, 6),
		};
	},
});
