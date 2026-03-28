import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Helper to get start/end of a month
function getMonthRange(year: number, month: number) {
	const start = new Date(year, month, 1, 0, 0, 0, 0).getTime();
	const end = new Date(year, month + 1, 0, 23, 59, 59, 999).getTime();
	return { start, end };
}

// Helper to get start of week (Monday)
function getWeekStart(date: Date): Date {
	const d = new Date(date);
	const day = d.getDay();
	const diff = (day === 0 ? -6 : 1) - day;
	d.setDate(d.getDate() + diff);
	d.setHours(0, 0, 0, 0);
	return d;
}

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
		attachmentUrl: v.optional(v.string()),
		isRecurring: v.optional(v.boolean()),
		recurringInterval: v.optional(v.union(v.literal("daily"), v.literal("weekly"), v.literal("monthly"))),
		tags: v.optional(v.array(v.string())),
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

		// Calculate Gross Profit and Net Profit
		const salesRevenue = incomeByCategory["Penjualan"] || 0;
		const hppAmount = expenseByCategory["HPP"] || 0;
		const otherIncome = totalIncome - salesRevenue;
		
		// Gross Profit = Sales - HPP (or just Total Income - HPP depending on business model, 
		// but typically Gross Profit is Sales Revenue - COGS)
		const grossProfit = salesRevenue - hppAmount;
		const netProfit = totalIncome - totalExpense;
		const netMargin = totalIncome > 0 ? (netProfit / totalIncome) * 100 : 0;

		// Filter out HPP from operating expenses for display if needed, 
		// or keep it to show breakdown. The UI usually wants to see HPP separately.
		const operatingExpenses = Object.entries(expenseByCategory)
			.filter(([category]) => category !== "HPP")
			.map(([category, amount]) => ({
				category,
				amount,
			}));

		return {
			period: { startDate, endDate },
			income: {
				salesRevenue,
				otherIncome,
				total: totalIncome,
				byCategory: incomeByCategory,
			},
			expense: {
				hppAmount,
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

// Update a transaction
export const updateTransaction = mutation({
	args: {
		id: v.id("financialTransactions"),
		type: v.optional(v.union(v.literal("income"), v.literal("expense"))),
		amount: v.optional(v.number()),
		category: v.optional(v.string()),
		merchant: v.optional(v.string()),
		description: v.optional(v.string()),
		date: v.optional(v.number()),
		paymentMethod: v.optional(v.string()),
		status: v.optional(v.union(v.literal("completed"), v.literal("pending"), v.literal("cancelled"))),
		attachmentUrl: v.optional(v.string()),
		isRecurring: v.optional(v.boolean()),
		recurringInterval: v.optional(v.union(v.literal("daily"), v.literal("weekly"), v.literal("monthly"))),
		tags: v.optional(v.array(v.string())),
	},
	handler: async (ctx, args) => {
		const { id, ...data } = args;
		const filtered = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
		await ctx.db.patch(id, filtered);
	},
});

// Get shift status for today
export const getShiftStatus = query({
	handler: async (ctx) => {
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const startOfDay = today.getTime();

		const transactions = await ctx.db
			.query("financialTransactions")
			.withIndex("by_date", (q) => q.gte("date", startOfDay))
			.collect();

		// Find latest shift related transactions today
		let latestMulai = 0;
		let latestAkhir = 0;

		for (const t of transactions) {
			if (t.status === "completed") {
				if (t.category === "Modal Awal" && t.date > latestMulai) {
					latestMulai = t.date;
				}
				if (t.category === "Setoran Akhir" && t.date > latestAkhir) {
					latestAkhir = t.date;
				}
			}
		}

		// Shift is open if we have a Modal Awal that is newer than Setoran Akhir
		// or if we have Modal Awal and no Setoran Akhir today
		const isOpen = latestMulai > 0 && latestMulai >= latestAkhir;

		return {
			isOpen,
			latestMulai,
			latestAkhir
		};
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

// ─── Monthly/Weekly Trend ───────────────────────────────────────────────────

// Get monthly income vs expense trend for last N months
export const getMonthlyTrend = query({
	args: { months: v.optional(v.number()) },
	handler: async (ctx, args) => {
		const n = args.months ?? 6;
		const now = new Date();
		const result: Array<{
			label: string;
			month: string;
			income: number;
			expense: number;
			net: number;
		}> = [];

		for (let i = n - 1; i >= 0; i--) {
			const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
			const year = d.getFullYear();
			const month = d.getMonth();
			const { start, end } = getMonthRange(year, month);

			const transactions = await ctx.db
				.query("financialTransactions")
				.withIndex("by_date", (q) => q.gte("date", start).lte("date", end))
				.collect();

			let income = 0;
			let expense = 0;
			for (const t of transactions) {
				if (t.status !== "completed") continue;
				if (t.type === "income") income += t.amount;
				else expense += t.amount;
			}

			const monthStr = `${year}-${String(month + 1).padStart(2, "0")}`;
			const label = d.toLocaleDateString("id-ID", { month: "short", year: "2-digit" });
			result.push({ label, month: monthStr, income, expense, net: income - expense });
		}

		return result;
	},
});

// Get weekly income vs expense trend for last N weeks
export const getWeeklyTrend = query({
	args: { weeks: v.optional(v.number()) },
	handler: async (ctx, args) => {
		const n = args.weeks ?? 8;
		const now = new Date();
		const result: Array<{
			label: string;
			weekStart: string;
			income: number;
			expense: number;
			net: number;
		}> = [];

		for (let i = n - 1; i >= 0; i--) {
			const weekStartDate = getWeekStart(new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000));
			const weekEndDate = new Date(weekStartDate.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);
			const start = weekStartDate.getTime();
			const end = weekEndDate.getTime();

			const transactions = await ctx.db
				.query("financialTransactions")
				.withIndex("by_date", (q) => q.gte("date", start).lte("date", end))
				.collect();

			let income = 0;
			let expense = 0;
			for (const t of transactions) {
				if (t.status !== "completed") continue;
				if (t.type === "income") income += t.amount;
				else expense += t.amount;
			}

			const weekStartStr = weekStartDate.toISOString().split("T")[0];
			const label = weekStartDate.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
			result.push({ label, weekStart: weekStartStr, income, expense, net: income - expense });
		}

		return result;
	},
});

// Compare two periods: current vs previous
export const getPeriodComparison = query({
	args: {},
	handler: async (ctx) => {
		const now = new Date();
		const currYear = now.getFullYear();
		const currMonth = now.getMonth();

		// Current month
		const { start: currStart, end: currEnd } = getMonthRange(currYear, currMonth);
		// Previous month
		const prevDate = new Date(currYear, currMonth - 1, 1);
		const { start: prevStart, end: prevEnd } = getMonthRange(prevDate.getFullYear(), prevDate.getMonth());

		const [currTransactions, prevTransactions] = await Promise.all([
			ctx.db.query("financialTransactions").withIndex("by_date", (q) => q.gte("date", currStart).lte("date", currEnd)).collect(),
			ctx.db.query("financialTransactions").withIndex("by_date", (q) => q.gte("date", prevStart).lte("date", prevEnd)).collect(),
		]);

		function summarize(txs: typeof currTransactions) {
			let income = 0;
			let expense = 0;
			for (const t of txs) {
				if (t.status !== "completed") continue;
				if (t.type === "income") income += t.amount;
				else expense += t.amount;
			}
			return { income, expense, net: income - expense };
		}

		const curr = summarize(currTransactions);
		const prev = summarize(prevTransactions);

		function pct(curr: number, prev: number) {
			if (prev === 0) return curr > 0 ? 100 : 0;
			return ((curr - prev) / prev) * 100;
		}

		return {
			current: {
				...curr,
				label: now.toLocaleDateString("id-ID", { month: "long", year: "numeric" }),
			},
			previous: {
				...prev,
				label: prevDate.toLocaleDateString("id-ID", { month: "long", year: "numeric" }),
			},
			changes: {
				incomePct: pct(curr.income, prev.income),
				expensePct: pct(curr.expense, prev.expense),
				netPct: pct(curr.net, prev.net),
			},
		};
	},
});

// Get expense breakdown by category for pie chart
export const getExpenseCategoryBreakdown = query({
	args: {
		startDate: v.optional(v.number()),
		endDate: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const { startDate, endDate } = args;
		const now = new Date();
		const defaultStart = getMonthRange(now.getFullYear(), now.getMonth()).start;

		const start = startDate ?? defaultStart;
		const end = endDate ?? Date.now();

		const transactions = await ctx.db
			.query("financialTransactions")
			.withIndex("by_date", (q) => q.gte("date", start).lte("date", end))
			.collect();

		const expenseByCategory: Record<string, number> = {};
		const incomeByCategory: Record<string, number> = {};
		let totalExpense = 0;
		let totalIncome = 0;

		for (const t of transactions) {
			if (t.status !== "completed") continue;
			if (t.type === "expense") {
				expenseByCategory[t.category] = (expenseByCategory[t.category] || 0) + t.amount;
				totalExpense += t.amount;
			} else {
				incomeByCategory[t.category] = (incomeByCategory[t.category] || 0) + t.amount;
				totalIncome += t.amount;
			}
		}

		const expenseBreakdown = Object.entries(expenseByCategory)
			.map(([category, amount]) => ({
				category,
				amount,
				percentage: totalExpense > 0 ? (amount / totalExpense) * 100 : 0,
			}))
			.sort((a, b) => b.amount - a.amount);

		const incomeBreakdown = Object.entries(incomeByCategory)
			.map(([category, amount]) => ({
				category,
				amount,
				percentage: totalIncome > 0 ? (amount / totalIncome) * 100 : 0,
			}))
			.sort((a, b) => b.amount - a.amount);

		return { expenseBreakdown, incomeBreakdown, totalExpense, totalIncome };
	},
});

// ─── Financial Targets ────────────────────────────────────────────────────────

// Get financial target for a specific month
export const getFinancialTarget = query({
	args: { month: v.optional(v.string()) },
	handler: async (ctx, args) => {
		const now = new Date();
		const month = args.month ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
		return await ctx.db
			.query("financialTargets")
			.withIndex("by_month", (q) => q.eq("month", month))
			.first();
	},
});

// Get all financial targets
export const getAllFinancialTargets = query({
	args: {},
	handler: async (ctx) => {
		return await ctx.db.query("financialTargets").order("desc").collect();
	},
});

// Set / upsert financial target for a month
export const setFinancialTarget = mutation({
	args: {
		month: v.string(), // "YYYY-MM"
		targetRevenue: v.number(),
		targetProfit: v.optional(v.number()),
		notes: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query("financialTargets")
			.withIndex("by_month", (q) => q.eq("month", args.month))
			.first();

		if (existing) {
			await ctx.db.patch(existing._id, {
				targetRevenue: args.targetRevenue,
				targetProfit: args.targetProfit,
				notes: args.notes,
				updatedAt: Date.now(),
			});
			return existing._id;
		} else {
			return await ctx.db.insert("financialTargets", {
				month: args.month,
				targetRevenue: args.targetRevenue,
				targetProfit: args.targetProfit,
				notes: args.notes,
				createdAt: Date.now(),
				updatedAt: Date.now(),
			});
		}
	},
});

// Delete a financial target
export const deleteFinancialTarget = mutation({
	args: { id: v.id("financialTargets") },
	handler: async (ctx, args) => {
		await ctx.db.delete(args.id);
	},
});

// Get current month progress towards target
export const getCurrentMonthProgress = query({
	args: {},
	handler: async (ctx) => {
		const now = new Date();
		const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
		const { start, end } = getMonthRange(now.getFullYear(), now.getMonth());

		const [target, transactions] = await Promise.all([
			ctx.db.query("financialTargets").withIndex("by_month", (q) => q.eq("month", month)).first(),
			ctx.db.query("financialTransactions").withIndex("by_date", (q) => q.gte("date", start).lte("date", end)).collect(),
		]);

		let income = 0;
		let expense = 0;
		for (const t of transactions) {
			if (t.status !== "completed") continue;
			if (t.type === "income") income += t.amount;
			else expense += t.amount;
		}

		const net = income - expense;
		const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
		const daysPassed = now.getDate();
		const daysRemaining = daysInMonth - daysPassed;
		const dailyRate = daysPassed > 0 ? income / daysPassed : 0;
		const projectedMonthly = dailyRate * daysInMonth;

		const targetRevenue = target?.targetRevenue ?? 0;
		const remaining = Math.max(0, targetRevenue - income);
		const progressPct = targetRevenue > 0 ? Math.min(100, (income / targetRevenue) * 100) : 0;

		return {
			month,
			monthLabel: now.toLocaleDateString("id-ID", { month: "long", year: "numeric" }),
			currentIncome: income,
			currentExpense: expense,
			currentNet: net,
			targetRevenue,
			targetProfit: target?.targetProfit,
			remaining,
			progressPct,
			daysRemaining,
			dailyRate,
			projectedMonthly,
			hasTarget: !!target,
			insight: (() => {
				if (!target) return null;
				if (progressPct >= 100) return `🎉 Target bulan ini sudah tercapai! Pendapatan Rp ${income.toLocaleString("id-ID")}`;
				if (remaining <= 0) return `✅ Target tercapai`;
				if (daysRemaining <= 0) return `⚠️ Bulan ini berakhir. Masih kurang Rp ${remaining.toLocaleString("id-ID")}`;
				const neededPerDay = daysRemaining > 0 ? remaining / daysRemaining : 0;
				if (neededPerDay > dailyRate * 1.5 && dailyRate > 0) {
					return `⚠️ Anda perlu Rp ${remaining.toLocaleString("id-ID")} lagi. Butuh Rp ${Math.round(neededPerDay).toLocaleString("id-ID")}/hari (saat ini Rp ${Math.round(dailyRate).toLocaleString("id-ID")}/hari)`;
				}
				return `💡 Anda perlu Rp ${remaining.toLocaleString("id-ID")} lagi untuk mencapai target bulan ini (${daysRemaining} hari tersisa)`;
			})(),
		};
	},
});
