import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import {
	getBookingFinancialSnapshot,
	getOrderFinancialSnapshot,
	isSettledBooking,
	isSettledOrder,
} from "./financialMetrics";

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

function normalizePaymentMethod(method?: string | null) {
	return (method || "").trim().toLowerCase();
}

function isCashMethod(method?: string | null) {
	const normalized = normalizePaymentMethod(method);
	return normalized === "cash" || normalized === "tunai";
}

function isNonCashMethod(method?: string | null) {
	const normalized = normalizePaymentMethod(method);
	return normalized === "qris" || normalized === "transfer" || normalized === "bank_transfer";
}

/**
 * Shared internal helper to fetch financial transactions with common filters
 */
async function fetchTransactionsInternal(
	ctx: QueryCtx,
	args: {
		type?: "income" | "expense";
		startDate?: number;
		endDate?: number;
		category?: string;
		status?: "completed" | "pending" | "cancelled";
	}
) {
	const { type, startDate, endDate, category, status } = args;

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
	if (category) {
		q = q.filter((f) => f.eq(f.field("category"), category));
	}
	if (status) {
		q = q.filter((f) => f.eq(f.field("status"), status));
	}

	return q;
}

async function buildShiftSummary(
	ctx: QueryCtx,
	startTime: number,
	endTime: number
) {
	const orders = await ctx.db
		.query("orders")
		.withIndex("by_createdAt", (q) => q.gte("createdAt", startTime).lte("createdAt", endTime))
		.collect();

	const bookings = await ctx.db
		.query("bookingOrders")
		.withIndex("by_createdAt", (q) => q.gte("createdAt", startTime).lte("createdAt", endTime))
		.collect();

	const shiftTransactions = await ctx.db
		.query("financialTransactions")
		.withIndex("by_date", (q) => q.gte("date", startTime).lte("date", endTime))
		.collect();

	let totalRevenue = 0;
	let cashRevenue = 0;
	let qrisRevenue = 0;
	let totalItemsSold = 0;
	let totalDiscount = 0;
	let totalExpenses = 0;

	orders.forEach((o) => {
		if (isSettledOrder(o)) {
			const snapshot = getOrderFinancialSnapshot(o);
			totalRevenue += snapshot.finalCollected;
			totalDiscount += snapshot.discount;
			if (isCashMethod(o.paymentMethod)) cashRevenue += snapshot.finalCollected;
			else if (isNonCashMethod(o.paymentMethod)) qrisRevenue += snapshot.finalCollected;
			totalItemsSold += (o.items || []).reduce((sum, item) => sum + (item.quantity || 0), 0);
		}
	});

	bookings.forEach((b) => {
		if (isSettledBooking(b)) {
			const snapshot = getBookingFinancialSnapshot(b);
			totalRevenue += snapshot.finalCollected;
			if (isCashMethod(b.paymentMethod)) cashRevenue += snapshot.finalCollected;
			else if (isNonCashMethod(b.paymentMethod)) qrisRevenue += snapshot.finalCollected;
			totalItemsSold += (b.items || []).reduce((sum, item) => sum + (item.quantity || 0), 0);
		}
	});

	shiftTransactions.forEach((t) => {
		if (t.type === "expense" && t.status === "completed") {
			totalExpenses += t.amount;
		}
	});

	return {
		totalRevenue,
		totalExpenses,
		totalItemsSold,
		cashRevenue,
		qrisRevenue,
		totalDiscount,
	};
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
		const q = await fetchTransactionsInternal(ctx, args);
		return await q.order("desc").paginate(args.paginationOpts);
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
		const q = await fetchTransactionsInternal(ctx, args);
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
		const q = await fetchTransactionsInternal(ctx, { ...args, status: "completed" });
		const transactions = await q.collect();
		const completed = transactions.filter((t) => t.status === "completed" && t.category !== "Modal Awal" && t.category !== "Setoran Akhir");

		// Income breakdown by category
		const incomeByCategory: Record<string, number> = {};
		let totalIncome = 0;
		for (const t of completed.filter((t) => t.type === "income")) {
			const cat = t.category || "Lainnya";
			incomeByCategory[cat] = (incomeByCategory[cat] || 0) + t.amount;
			totalIncome += t.amount;
		}

		// Fetch orders in period to calculate discounts
		const ordersInPeriod = await ctx.db
			.query("orders")
			.withIndex("by_createdAt", (q) => {
				if (startDate !== undefined && endDate !== undefined) return q.gte("createdAt", startDate).lte("createdAt", endDate);
				if (startDate !== undefined) return q.gte("createdAt", startDate);
				if (endDate !== undefined) return q.lte("createdAt", endDate);
				return q;
			})
			.collect();

		const settledOrdersInPeriod = ordersInPeriod.filter(isSettledOrder);
		const totalDiscount = settledOrdersInPeriod.reduce(
			(sum, order) => sum + getOrderFinancialSnapshot(order).discount,
			0
		);

		// Expense breakdown by category
		const expenseByCategory: Record<string, number> = {};
		let totalExpense = 0;
		for (const t of completed.filter((t) => t.type === "expense")) {
			const cat = t.category || "Lainnya";
			expenseByCategory[cat] = (expenseByCategory[cat] || 0) + t.amount;
			totalExpense += t.amount;
		}

		// Calculate Gross Profit and Net Profit
		// Map various category names to standard report terms
		const netSalesRevenue = settledOrdersInPeriod.reduce(
			(sum, order) => sum + getOrderFinancialSnapshot(order).netSales,
			0
		);
		const grossSalesRevenue = netSalesRevenue + totalDiscount;
		const hppAmount = (expenseByCategory["HPP"] || 0) + (expenseByCategory["belanja_stok"] || 0) + (expenseByCategory["COGS"] || 0);
		const otherIncome = totalIncome - netSalesRevenue;
		
		// Gross Profit = Net Sales - HPP (or Gross Sales - Discount - HPP)
		const grossProfit = netSalesRevenue - hppAmount;
		const netProfit = totalIncome - totalExpense;
		const netMargin = totalIncome > 0 ? (netProfit / totalIncome) * 100 : 0;

		// Detailed Operating Expenses
		const operatingExpenses = Object.entries(expenseByCategory)
			.filter(([category]) => category !== "HPP")
			.map(([category, amount]) => ({
				category,
				amount,
			}));

		// Detailed Income Sources (excluding Sales if you want them separated, or just list all)
		const incomeSources = Object.entries(incomeByCategory)
			.map(([category, amount]) => ({
				category,
				amount,
			}));

		return {
			period: { startDate, endDate },
			income: {
				salesRevenue: netSalesRevenue,
				grossSalesRevenue,
				totalDiscount,
				otherIncome,
				total: totalIncome,
				byCategory: incomeByCategory,
				sources: incomeSources,
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
		const q = await fetchTransactionsInternal(ctx, { ...args, status: "completed" });
		const transactions = await q.order("asc").collect();
		const completed = transactions.filter((t) => t.status === "completed");

		// Group by date
		const dailyMap: Record<string, { inflow: number; outflow: number; date: string }> = {};
		for (const t of completed) {
			const date = new Date(t.date).toISOString().split("T")[0] as string;
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
		const q = await fetchTransactionsInternal(ctx, args);
		const transactions = await q.order("desc").collect();

		let totalIncome = 0;
		let totalExpense = 0;
		for (const t of transactions) {
			if (t.status === "completed") {
				if (t.category === "Modal Awal" || t.category === "Setoran Akhir") continue;
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

// Start a new shift
export const startShift = mutation({
	args: {
		cashierName: v.string(),
		shiftName: v.string(),
		teamMembers: v.optional(v.string()),
		startingCash: v.number(),
		notes: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const now = Date.now();
		
		// 1. Create entry in shifts table
		const shiftId = await ctx.db.insert("shifts", {
			...args,
			startTime: now,
		});

		// 2. Create financial transaction for Modal Awal (Legacy compatibility)
		const descParts = [];
		descParts.push(`Kasir: ${args.cashierName}`);
		descParts.push(`Shift: ${args.shiftName}`);
		if (args.teamMembers) descParts.push(`Tim: ${args.teamMembers}`);
		if (args.notes) descParts.push(`Catatan: ${args.notes}`);
		
		await ctx.db.insert("financialTransactions", {
			type: "income",
			amount: args.startingCash,
			category: "Modal Awal",
			description: descParts.join(" | "),
			date: now,
			status: "completed",
			paymentMethod: "tunai",
		});

		return shiftId;
	},
});

// End an ongoing shift
export const endShift = mutation({
	args: {
		shiftId: v.id("shifts"),
		endingCashPhysical: v.number(),
		nonCashConfirmed: v.number(),
		cashBreakdown: v.optional(
			v.object({
				bill100000: v.number(),
				bill50000: v.number(),
				bill20000: v.number(),
				bill10000: v.number(),
				bill5000: v.number(),
				bill2000: v.number(),
				bill1000: v.number(),
				bill500: v.number(),
				bill200: v.number(),
				bill100: v.number(),
			})
		),
		notes: v.optional(v.string()),
		closingTasks: v.optional(v.array(v.string())),
	},
	handler: async (ctx, args) => {
		const now = Date.now();
		const shift = await ctx.db.get(args.shiftId);
		if (!shift) throw new Error("Shift not found");
		if (shift.endTime) throw new Error("Shift already ended");

		// 1. Calculate shift statistics
		const startTime = shift.startTime;
		const endTime = now;

		const {
			totalRevenue,
			totalExpenses,
			totalItemsSold,
			cashRevenue,
			qrisRevenue,
			totalDiscount,
		} = await buildShiftSummary(ctx, startTime, endTime);

		const endingCashExpected = shift.startingCash + cashRevenue - totalExpenses;
		const nonCashExpected = qrisRevenue;

		// 2. Update shifts table
		await ctx.db.patch(args.shiftId, {
			endTime,
			endingCashPhysical: args.endingCashPhysical,
			endingCashExpected,
			nonCashConfirmed: args.nonCashConfirmed,
			nonCashExpected,
			cashBreakdown: args.cashBreakdown,
			notes: args.notes,
			closingTasks: args.closingTasks,
			summary: {
				totalRevenue,
				totalExpenses,
				totalItemsSold,
				cashRevenue,
				qrisRevenue,
				totalDiscount,
			},
		});

		// 3. Create financial transaction for Setoran Akhir (Legacy compatibility)
		const summaryText = `\n[RINGKASAN SHIFT]\nModal: Rp ${shift.startingCash.toLocaleString('id-ID')}\nCash: Rp ${cashRevenue.toLocaleString('id-ID')}\nQRIS: Rp ${qrisRevenue.toLocaleString('id-ID')}\nDiskon: Rp ${totalDiscount.toLocaleString('id-ID')}\nTotal Revenue (Net): Rp ${totalRevenue.toLocaleString('id-ID')}\nPengeluaran: Rp ${totalExpenses.toLocaleString('id-ID')}\nProduk Terjual: ${totalItemsSold}`;
		
		await ctx.db.insert("financialTransactions", {
			type: "income",
			amount: args.endingCashPhysical,
			category: "Setoran Akhir",
			description: (args.notes || "Akhiri Shift") + summaryText,
			date: now,
			status: "completed",
			paymentMethod: "tunai",
		});

		return args.shiftId;
	},
});

// Get ongoing shift if any
export const getOngoingShift = query({
	handler: async (ctx) => {
		return await ctx.db
			.query("shifts")
			.withIndex("by_endTime", (q) => q.eq("endTime", undefined))
			.first();
	},
});

// Get shift status (Updated to use shifts table)
export const getShiftStatus = query({
	handler: async (ctx) => {
		const ongoingShift = await ctx.db
			.query("shifts")
			.withIndex("by_endTime", (q) => q.eq("endTime", undefined))
			.first();

		const now = Date.now();
		const WIB_OFFSET = 7 * 60 * 60 * 1000;
		const nowWib = new Date(now + WIB_OFFSET);
		const todayStartWib = new Date(nowWib.getFullYear(), nowWib.getMonth(), nowWib.getDate());
		const todayStartTs = todayStartWib.getTime() - WIB_OFFSET;

		const allShiftsRaw = await ctx.db
			.query("shifts")
			.withIndex("by_startTime", q => q.gte("startTime", todayStartTs))
			.collect();

		const allShifts = await Promise.all(
			allShiftsRaw.map(async (s) => {
				const computedSummary =
					s.summary ??
					(await buildShiftSummary(ctx, s.startTime, s.endTime ?? now));

				return {
					...s,
					revenue: computedSummary.totalRevenue ?? 0,
					cashRevenue: computedSummary.cashRevenue ?? 0,
					qrisRevenue: computedSummary.qrisRevenue ?? 0,
					totalDiscount: computedSummary.totalDiscount ?? 0,
					modalAwal: s.startingCash,
					setoranAkhir: s.endingCashPhysical,
				};
			})
		);

		if (ongoingShift) {
			return {
				isOpen: true,
				latestMulai: ongoingShift.startTime,
				latestAkhir: 0,
				shiftInfo: {
					cashierName: ongoingShift.cashierName,
					shiftName: ongoingShift.shiftName,
					shiftId: ongoingShift._id,
				},
				ongoingShift,
				allShifts,
			};
		}

		// If no ongoing shift in new table, check legacy transactions for today
		const lastTx = await ctx.db
			.query("financialTransactions")
			.withIndex("by_date", (q) => q.gte("date", todayStartTs))
			.order("desc")
			.collect();

		const latestMulaiTx = lastTx.find(t => t.category === "Modal Awal");
		const latestAkhirTx = lastTx.find(t => t.category === "Setoran Akhir");

		const latestMulai = latestMulaiTx?.date ?? 0;
		const latestAkhir = latestAkhirTx?.date ?? 0;
		const isOpen = latestMulai > latestAkhir;

		let shiftInfo = null;
		if (isOpen && latestMulaiTx?.description) {
			const parts = latestMulaiTx.description.split(" | ");
			const cashierPart = parts.find(p => p.startsWith("Kasir: "));
			const shiftPart = parts.find(p => p.startsWith("Shift: "));
			shiftInfo = {
				cashierName: cashierPart ? cashierPart.replace("Kasir: ", "") : null,
				shiftName: shiftPart ? shiftPart.replace("Shift: ", "") : null,
			};
		}

		return {
			isOpen,
			latestMulai,
			latestAkhir,
			shiftInfo,
			allShifts,
		};
	},
});

// Get historical shifts for a date range
export const getHistoricalShifts = query({
	args: {
		startDate: v.optional(v.number()),
		endDate: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const q = await fetchTransactionsInternal(ctx, args);
		const transactions = await q.collect();

		const allShifts: any[] = [];
		const sortedTx = [...transactions].sort((a, b) => a.date - b.date);
		
		let currentShiftObj: any = null;

		for (const t of sortedTx) {
			if (t.status === "completed") {
				if (t.category === "Modal Awal") {
					let parsedCashier = null;
					let parsedShift = null;
					let parsedTeam = null;
					if (t.description) {
						const parts = t.description.split(" | ");
						const cashierPart = parts.find(p => p.startsWith("Kasir: "));
						const shiftPart = parts.find(p => p.startsWith("Shift: "));
						const teamPart = parts.find(p => p.startsWith("Tim: "));
						
						parsedCashier = cashierPart ? cashierPart.replace("Kasir: ", "") : null;
						parsedShift = shiftPart ? shiftPart.replace("Shift: ", "") : null;
						parsedTeam = teamPart ? teamPart.replace("Tim: ", "") : null;
					}
					
					currentShiftObj = {
						id: t._id,
						startTime: t.date,
						endTime: null,
						cashierName: parsedCashier,
						shiftName: parsedShift,
						modalAwal: t.amount,
						teamMembers: parsedTeam,
					};
					allShifts.push(currentShiftObj);
				}
				if (t.category === "Setoran Akhir") {
					if (currentShiftObj && !currentShiftObj.endTime) {
						currentShiftObj.endTime = t.date;
						currentShiftObj.setoranAkhir = t.amount;
					}
				}
			}
		}

		return allShifts.sort((a, b) => b.startTime - a.startTime); // newest first
	},
});

// Get financial summary for a period
export const getFinancialSummary = query({
	args: {
		startDate: v.optional(v.number()),
		endDate: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const q = await fetchTransactionsInternal(ctx, { ...args, status: "completed" });
		const transactions = await q.collect();

		let totalIncome = 0;
		let totalExpense = 0;

		for (const t of transactions) {
			if (t.status === "completed") {
				if (t.category === "Modal Awal" || t.category === "Setoran Akhir") continue;
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
		try {
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
					if (t.category === "Modal Awal" || t.category === "Setoran Akhir") continue;
					if (t.type === "income") income += t.amount;
					else expense += t.amount;
				}

				const monthStr = `${year}-${String(month + 1).padStart(2, "0")}`;
				const label = d.toLocaleDateString("id-ID", { month: "short", year: "2-digit" });
				result.push({ label, month: monthStr, income, expense, net: income - expense });
			}

			return result;
		} catch (error) {
			console.error("Error in getMonthlyTrend:", error);
			throw new Error(error instanceof Error ? error.message : "Unknown error in getMonthlyTrend");
		}
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
				if (t.category === "Modal Awal" || t.category === "Setoran Akhir") continue;
				if (t.type === "income") income += t.amount;
				else expense += t.amount;
			}

			const weekStartStr = weekStartDate.toISOString().split("T")[0] as string;
			const label = weekStartDate.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
			result.push({ label, weekStart: weekStartStr, income, expense, net: income - expense });
		}

		return result;
	},
});

// Get daily income vs expense trend for last N days
export const getDailyTrend = query({
	args: { days: v.optional(v.number()) },
	handler: async (ctx, args) => {
		const n = args.days ?? 14;
		const now = new Date();
		const startRange = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (n - 1), 0, 0, 0, 0).getTime();
		const endRange = now.getTime();

		const transactions = await ctx.db
			.query("financialTransactions")
			.withIndex("by_date", (q) => q.gte("date", startRange).lte("date", endRange))
			.collect();

		const dailyMap: Record<string, { income: number; expense: number }> = {};
		
		for (const t of transactions) {
			if (t.status !== "completed") continue;
			if (t.category === "Modal Awal" || t.category === "Setoran Akhir") continue;
			
			const d = new Date(t.date);
			const dateStr = d.toISOString().split("T")[0] as string;
			if (!dailyMap[dateStr]) {
				dailyMap[dateStr] = { income: 0, expense: 0 };
			}
			if (t.type === "income") dailyMap[dateStr].income += t.amount;
			else dailyMap[dateStr].expense += t.amount;
		}

		const result: Array<{
			label: string;
			date: string;
			income: number;
			expense: number;
			net: number;
		}> = [];

		for (let i = n - 1; i >= 0; i--) {
			const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
			const dateStr = d.toISOString().split("T")[0] as string;
			const income = dailyMap[dateStr]?.income ?? 0;
			const expense = dailyMap[dateStr]?.expense ?? 0;
			const label = d.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
			result.push({ label, date: dateStr, income, expense, net: income - expense });
		}

		return result;
	},
});

// Get details for a specific shift/period
export const getShiftDetails = query({
	args: {
		startTime: v.number(),
		endTime: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const endTime = args.endTime ?? Date.now();
		const { startTime } = args;
		const shiftDoc = await ctx.db
			.query("shifts")
			.withIndex("by_startTime", (q) => q.eq("startTime", startTime))
			.first();

		// 1. Fetch POS orders (Indexed by createdAt)
		const orders = await ctx.db
			.query("orders")
			.withIndex("by_createdAt", (q) => q.gte("createdAt", startTime).lte("createdAt", endTime))
			.collect();

		// 2. Fetch bookings (Indexed by createdAt)
		const bookings = await ctx.db
			.query("bookingOrders")
			.withIndex("by_createdAt", (q) => q.gte("createdAt", startTime).lte("createdAt", endTime))
			.collect();

		const summary = await buildShiftSummary(ctx, startTime, endTime);
		const posRevenue = orders
			.filter((o) => o.status === "completed" || o.status === "paid")
			.reduce((sum, o) => sum + o.totalAmount, 0);
		const bookingRevenue = bookings
			.filter(
				(b) =>
					b.paymentStatus === "paid" ||
					b.bookingStatus === "confirmed" ||
					b.bookingStatus === "completed"
			)
			.reduce((sum, b) => sum + b.totalAmount, 0);
		const paymentMethods: Record<string, number> = {};

		orders.filter(o => o.status === "completed" || o.status === "paid").forEach(o => {
			const method = normalizePaymentMethod(o.paymentMethod) || "unknown";
			paymentMethods[method] = (paymentMethods[method] || 0) + o.totalAmount;
		});

		bookings.filter(b => b.paymentStatus === "paid" || b.bookingStatus === "confirmed" || b.bookingStatus === "completed").forEach(b => {
			const method = normalizePaymentMethod(b.paymentMethod) || "unknown";
			paymentMethods[method] = (paymentMethods[method] || 0) + b.totalAmount;
		});

		return {
			startTime,
			endTime,
			shiftDoc,
			posRevenue,
			bookingRevenue,
			totalRevenue: posRevenue + bookingRevenue,
			cashRevenue: summary.cashRevenue,
			qrisRevenue: summary.qrisRevenue,
			totalDiscount: summary.totalDiscount,
			totalExpenses: summary.totalExpenses,
			endingCashExpected:
				shiftDoc?.endingCashExpected ??
				(shiftDoc ? shiftDoc.startingCash + summary.cashRevenue - summary.totalExpenses : 0),
			endingCashPhysical: shiftDoc?.endingCashPhysical,
			nonCashExpected: shiftDoc?.nonCashExpected ?? summary.qrisRevenue,
			nonCashConfirmed: shiftDoc?.nonCashConfirmed,
			cashBreakdown: shiftDoc?.cashBreakdown,
			paymentMethods,
			orderCount: orders.length,
			bookingCount: bookings.length,
			recentTransactions: [
				...orders.map(o => ({ type: "pos", id: o._id, amount: o.totalAmount, status: o.status, time: o.createdAt, name: o.orderNumber })),
				...bookings.map(b => ({ type: "booking", id: b._id, amount: b.totalAmount, status: b.paymentStatus, time: b.createdAt, name: b.customerName }))
			].sort((a, b) => b.time - a.time).slice(0, 50)
		};
	},
});

// Get daily and shift-based target progress
export const getShiftTargetProgress = query({
	args: {},
	handler: async (ctx) => {
		const now = new Date();
		const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

		// 1. Get Monthly Target
		const target = await ctx.db
			.query("financialTargets")
			.withIndex("by_month", (q) => q.eq("month", monthStr))
			.first();

		if (!target) return null;

		// 2. Calculate Daily Target
		const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
		const dailyTarget = target.targetRevenue / daysInMonth;

		// 3. Get Current Daily Revenue
		// Local date range for today
		const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
		const todayEnd = todayStart + 24 * 60 * 60 * 1000 - 1;

		const todayPosOrders = await ctx.db
			.query("orders")
			.withIndex("by_createdAt", (q) => q.gte("createdAt", todayStart).lte("createdAt", todayEnd))
			.collect();

		const todayBookingOrders = await ctx.db
			.query("bookingOrders")
			.withIndex("by_createdAt", (q) => q.gte("createdAt", todayStart).lte("createdAt", todayEnd))
			.collect();

		const dailyCollected =
			todayPosOrders
				.filter((o) => o.status === "completed" || o.status === "paid")
				.reduce((s, o) => s + o.totalAmount, 0) +
			todayBookingOrders
				.filter(
					(b) =>
						b.paymentStatus === "paid" ||
						b.bookingStatus === "confirmed" ||
						b.bookingStatus === "completed"
				)
				.reduce((s, b) => s + b.totalAmount, 0);

		// 4. Calculate Shift Target (assuming 2 shifts per day: Pagi & Malam)
		const shiftsPerDay = 2;
		const shiftTarget = dailyTarget / shiftsPerDay;

		// 5. Get Current Shift Progress
		// We find the latest "Modal Awal" (which opens a shift)
		const latestModalAwal = await ctx.db
			.query("financialTransactions")
			.withIndex("by_type", (q) => q.eq("type", "income"))
			.filter((q) => q.eq(q.field("category"), "Modal Awal"))
			.order("desc")
			.first();

		let shiftStartTime = todayStart;
		if (latestModalAwal && latestModalAwal.date > todayStart) {
			shiftStartTime = latestModalAwal.date;
		}

		const shiftPosOrders = todayPosOrders.filter((o) => o.createdAt >= shiftStartTime);
		const shiftBookingOrders = todayBookingOrders.filter((b) => b.createdAt >= shiftStartTime);

		const shiftCollected =
			shiftPosOrders
				.filter((o) => o.status === "completed" || o.status === "paid")
				.reduce((s, o) => s + o.totalAmount, 0) +
			shiftBookingOrders
				.filter(
					(b) =>
						b.paymentStatus === "paid" ||
						b.bookingStatus === "confirmed" ||
						b.bookingStatus === "completed"
				)
				.reduce((s, b) => s + b.totalAmount, 0);

		return {
			monthStr,
			dailyTarget,
			dailyCollected,
			dailyProgress: Math.min((dailyCollected / dailyTarget) * 100, 100),
			shiftTarget,
			shiftCollected,
			shiftProgress: Math.min((shiftCollected / shiftTarget) * 100, 100),
			isDailyMet: dailyCollected >= dailyTarget,
			isShiftMet: shiftCollected >= shiftTarget,
		};
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
			(await fetchTransactionsInternal(ctx, { startDate: currStart, endDate: currEnd, status: "completed" })).collect(),
			(await fetchTransactionsInternal(ctx, { startDate: prevStart, endDate: prevEnd, status: "completed" })).collect(),
		]);

		function summarize(txs: typeof currTransactions) {
			let income = 0;
			let expense = 0;
			for (const t of txs) {
				if (t.status !== "completed") continue;
				if (t.category === "Modal Awal" || t.category === "Setoran Akhir") continue;
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

		const transactions = await (await fetchTransactionsInternal(ctx, { startDate: start, endDate: end, status: "completed" })).collect();

		const expenseByCategory: Record<string, number> = {};
		const incomeByCategory: Record<string, number> = {};
		let totalExpense = 0;
		let totalIncome = 0;

		for (const t of transactions) {
			if (t.status !== "completed") continue;
			if (t.category === "Modal Awal" || t.category === "Setoran Akhir") continue;
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
export const getFinancialTargets = query({
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
			(await fetchTransactionsInternal(ctx, { startDate: start, endDate: end, status: "completed" })).collect(),
		]);

		let income = 0;
		let expense = 0;
		for (const t of transactions) {
			if (t.status !== "completed") continue;
			if (t.category === "Modal Awal" || t.category === "Setoran Akhir") continue;
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

		const dailyTarget = targetRevenue / daysInMonth;
		const shiftTarget = dailyTarget / 2; // Assuming 2 shifts per day

		// Today's starts for daily progress
		const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
		const todayTransactions = transactions.filter(t => t.date >= todayStart);
		const dailyCollected = todayTransactions
			.filter(t => t.type === "income" && t.category !== "Modal Awal" && t.category !== "Setoran Akhir")
			.reduce((s, t) => s + t.amount, 0);

		// Current shift progress (since last Modal Awal)
		const latestModalAwal = transactions
			.filter(t => t.category === "Modal Awal" && t.type === "income")
			.sort((a, b) => b.date - a.date)[0];
		
		const shiftStart = latestModalAwal ? Math.max(latestModalAwal.date, todayStart) : todayStart;
		const shiftTransactions = todayTransactions.filter(t => t.date >= shiftStart);
		const shiftCollected = shiftTransactions
			.filter(t => t.type === "income" && t.category !== "Modal Awal" && t.category !== "Setoran Akhir")
			.reduce((s, t) => s + t.amount, 0);

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
			dailyTarget,
			dailyCollected,
			shiftTarget,
			shiftCollected,
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
