import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Get transactions with optional filtering and pagination
export const getTransactions = query({
	args: {
		paginationOpts: paginationOptsValidator,
		type: v.optional(v.union(v.literal("income"), v.literal("expense"))),
		startDate: v.optional(v.number()),
		endDate: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const { type, startDate, endDate, paginationOpts } = args;

		let q =
			startDate !== undefined || endDate !== undefined
				? ctx.db.query("financialTransactions").withIndex("by_date", (q) => {
						if (startDate !== undefined && endDate !== undefined) {
							return q.gte("date", startDate).lte("date", endDate);
						}
						if (startDate !== undefined) {
							return q.gte("date", startDate);
						}
						if (endDate !== undefined) {
							return q.lte("date", endDate);
						}
						return q;
					})
				: ctx.db.query("financialTransactions").withIndex("by_date");

		if (type) {
			q = q.filter((f) => f.eq(f.field("type"), type));
		}

		return await q.order("desc").paginate(paginationOpts);
	},
});

// Create a new transaction
export const createTransaction = mutation({
	args: {
		type: v.union(v.literal("income"), v.literal("expense")),
		amount: v.number(),
		category: v.string(),
		description: v.optional(v.string()),
		date: v.number(),
		paymentMethod: v.optional(v.string()),
		status: v.union(
			v.literal("completed"),
			v.literal("pending"),
			v.literal("cancelled")
		),
	},
	handler: async (ctx, args) => {
		const id = await ctx.db.insert("financialTransactions", args);
		return id;
	},
});

// Delete a transaction
export const deleteTransaction = mutation({
	args: { id: v.id("financialTransactions") },
	handler: async (ctx, args) => {
		await ctx.db.delete(args.id);
	},
});

// Get financial summary for a period
export const getFinancialSummary = query({
	args: {
		startDate: v.optional(v.number()),
		endDate: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const { startDate, endDate } = args;

		const q =
			startDate !== undefined || endDate !== undefined
				? ctx.db.query("financialTransactions").withIndex("by_date", (q) => {
						if (startDate !== undefined && endDate !== undefined) {
							return q.gte("date", startDate).lte("date", endDate);
						}
						if (startDate !== undefined) {
							return q.gte("date", startDate);
						}
						if (endDate !== undefined) {
							return q.lte("date", endDate);
						}
						return q;
					})
				: ctx.db.query("financialTransactions");

		const transactions = await q.collect();

		let totalIncome = 0;
		let totalExpense = 0;

		for (const t of transactions) {
			if (t.status === "completed") {
				if (t.type === "income") {
					totalIncome += t.amount;
				} else if (t.type === "expense") {
					totalExpense += t.amount;
				}
			}
		}

		return {
			totalIncome,
			totalExpense,
			netBalance: totalIncome - totalExpense,
			transactionCount: transactions.length,
		};
	},
});
