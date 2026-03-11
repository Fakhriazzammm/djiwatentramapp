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

// Get ALL transactions without pagination (for full detail view)
export const getAllTransactions = query({
	args: {
		type: v.optional(v.union(v.literal("income"), v.literal("expense"))),
		startDate: v.optional(v.number()),
		endDate: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const { type, startDate, endDate } = args;

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

		return await q.order("desc").collect();
	},
});

// Create a new transaction
export const createTransaction = mutation({
	args: {
		type: v.union(v.literal("income"), v.literal("expense")),
		amount: v.number(),
		category: v.string(),
		merchant: v.optional(v.string()),
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

// Get profit & loss report for a period
export const getProfitLossReport = query({
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
				: ctx.db.query("financialTransactions").withIndex("by_date");

		const transactions = await q.collect();
		const completed = transactions.filter((t) => t.status === "completed");

		// Income breakdown by category
		const incomeByCategory: Record<string, number> = {};
		let totalIncome = 0;
		for (const t of completed.filter((t) => t.type === "income")) {
			incomeByCategory[t.category] = (incomeByCategory[t.category] || 0) + t.amount;
			totalIncome += t.amount;
		}

		// Expense breakdown by category
		const expenseByCategory: Record<string, number> = {};
		let totalExpense = 0;
		for (const t of completed.filter((t) => t.type === "expense")) {
			expenseByCategory[t.category] = (expenseByCategory[t.category] || 0) + t.amount;
			totalExpense += t.amount;
		}

		// Penjualan (income from Penjualan category)
		const salesRevenue = incomeByCategory["Penjualan"] || 0;
		const otherIncome = totalIncome - salesRevenue;

		// Operating expenses (all expense categories)
		const operatingExpenses = Object.entries(expenseByCategory).map(([category, amount]) => ({
			category,
			amount,
		}));

		const grossProfit = totalIncome;
		const netProfit = totalIncome - totalExpense;
		const netMargin = totalIncome > 0 ? (netProfit / totalIncome) * 100 : 0;

		return {
			period: { startDate, endDate },
			income: {
				salesRevenue,
				otherIncome,
				total: totalIncome,
				byCategory: incomeByCategory,
			},
			expense: {
				operatingExpenses,
				total: totalExpense,
				byCategory: expenseByCategory,
			},
			grossProfit,
			netProfit,
			netMargin,
			transactionCount: completed.length,
		};
	},
});

// Get cash flow report
export const getCashFlowReport = query({
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
				: ctx.db.query("financialTransactions").withIndex("by_date");

		const transactions = await q.order("asc").collect();
		const completed = transactions.filter((t) => t.status === "completed");

		// Group by date
		const dailyMap: Record<string, { inflow: number; outflow: number; date: string }> = {};
		for (const t of completed) {
			const date = new Date(t.date).toISOString().split("T")[0];
			if (!dailyMap[date]) {
				dailyMap[date] = { inflow: 0, outflow: 0, date };
			}
			if (t.type === "income") {
				dailyMap[date].inflow += t.amount;
			} else {
				dailyMap[date].outflow += t.amount;
			}
		}

		// Breakdown by payment method
		const byPaymentMethod: Record<string, { inflow: number; outflow: number }> = {};
		for (const t of completed) {
			const method = t.paymentMethod || "Cash";
			if (!byPaymentMethod[method]) {
				byPaymentMethod[method] = { inflow: 0, outflow: 0 };
			}
			if (t.type === "income") {
				byPaymentMethod[method].inflow += t.amount;
			} else {
				byPaymentMethod[method].outflow += t.amount;
			}
		}

		const totalInflow = completed.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
		const totalOutflow = completed.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);

		// Running balance per day
		let runningBalance = 0;
		const dailyCashFlow = Object.values(dailyMap)
			.sort((a, b) => a.date.localeCompare(b.date))
			.map((day) => {
				runningBalance += day.inflow - day.outflow;
				return {
					date: day.date,
					inflow: day.inflow,
					outflow: day.outflow,
					net: day.inflow - day.outflow,
					balance: runningBalance,
				};
			});

		return {
			period: { startDate, endDate },
			totalInflow,
			totalOutflow,
			netCashFlow: totalInflow - totalOutflow,
			byPaymentMethod,
			dailyCashFlow,
		};
	},
});

// Get transaction detail report
export const getTransactionDetailReport = query({
	args: {
		startDate: v.optional(v.number()),
		endDate: v.optional(v.number()),
		type: v.optional(v.union(v.literal("income"), v.literal("expense"))),
		category: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const { startDate, endDate, type, category } = args;

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

		if (type) q = q.filter((f) => f.eq(f.field("type"), type));
		if (category) q = q.filter((f) => f.eq(f.field("category"), category));

		const transactions = await q.order("desc").collect();

		let totalIncome = 0;
		let totalExpense = 0;
		for (const t of transactions) {
			if (t.status === "completed") {
				if (t.type === "income") totalIncome += t.amount;
				else totalExpense += t.amount;
			}
		}

		return {
			transactions,
			totalIncome,
			totalExpense,
			netBalance: totalIncome - totalExpense,
			count: transactions.length,
		};
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
