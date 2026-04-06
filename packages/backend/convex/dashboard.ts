import { v } from "convex/values";
import { query } from "./_generated/server";
import { api } from "./_generated/api";
import {
	getBookingFinancialSnapshot,
	getOrderFinancialSnapshot,
	isSettledBooking,
	isSettledOrder,
} from "./financialMetrics";

// Get dashboard statistics
export const getDashboardStats = query({
	args: {},
	handler: async (ctx) => {
		const WIB_OFFSET = 7 * 60 * 60 * 1000; // UTC+7
		const now = Date.now();
		
		// Calculate "Today" start in WIB
		const nowWib = new Date(now + WIB_OFFSET);
		const todayStartWib = new Date(nowWib.getFullYear(), nowWib.getMonth(), nowWib.getDate());
		const todayStartTs = todayStartWib.getTime() - WIB_OFFSET;

		const todayEndWib = new Date(nowWib.getFullYear(), nowWib.getMonth(), nowWib.getDate(), 23, 59, 59, 999);
		const todayEndTs = todayEndWib.getTime() - WIB_OFFSET;

		// 1. Get today's POS orders (Indexed)
		const todayOrders = await ctx.db
			.query("orders")
			.withIndex("by_createdAt", (q) => q.gte("createdAt", todayStartTs).lte("createdAt", todayEndTs))
			.collect();

		// 2. Get today's bookings (Indexed)
		const todayBookings = await ctx.db
			.query("bookingOrders")
			.withIndex("by_createdAt", (q) => q.gte("createdAt", todayStartTs).lte("createdAt", todayEndTs))
			.collect();

		// Calculate today's revenue (completed + paid)
		const settledTodayOrders = todayOrders.filter(isSettledOrder);
		const todayPosRevenue = settledTodayOrders.reduce(
			(sum, order) => sum + getOrderFinancialSnapshot(order).finalCollected,
			0
		);
		
		const settledTodayBookings = todayBookings.filter(isSettledBooking);
		const todayBookingRevenue = settledTodayBookings.reduce(
			(sum, booking) => sum + getBookingFinancialSnapshot(booking).finalCollected,
			0
		);
		
		const todayDiscount = settledTodayOrders.reduce(
			(sum, order) => sum + getOrderFinancialSnapshot(order).discount,
			0
		);

		const todayRevenue = todayPosRevenue + todayBookingRevenue;
		const todayShifts = await ctx.db
			.query("shifts")
			.withIndex("by_startTime", (q) => q.gte("startTime", todayStartTs).lte("startTime", todayEndTs))
			.collect();

		const cashDiscrepancySummary = todayShifts.reduce(
			(summary, shift) => {
				const cashGap =
					(shift.endingCashPhysical ?? 0) - (shift.endingCashExpected ?? 0);
				const nonCashGap =
					(shift.nonCashConfirmed ?? 0) - (shift.nonCashExpected ?? 0);

				return {
					totalPhysicalGap: summary.totalPhysicalGap + cashGap,
					totalNonCashGap: summary.totalNonCashGap + nonCashGap,
					highRiskShiftCount:
						summary.highRiskShiftCount +
						(Math.abs(cashGap) >= 50000 || Math.abs(nonCashGap) >= 50000 ? 1 : 0),
				};
			},
			{
				totalPhysicalGap: 0,
				totalNonCashGap: 0,
				highRiskShiftCount: 0,
			}
		);

		// 3. Pending orders count (Indexed)
		const pendingOrders = (await ctx.db
			.query("orders")
			.withIndex("by_status", (q) => q.eq("status", "pending"))
			.collect()).length;

		// 4. Products stats
		const allProducts = await ctx.db.query("products").collect();
		const activeProducts = allProducts.filter((p) => p.isAvailable ?? false).length;

		// 5. Low stock items
		const lowStockItems = await ctx.runQuery(api.inventory.getLowStockItems);

		// 6. Financial summary (Indexed)
		const todayTransactions = await ctx.db
			.query("financialTransactions")
			.withIndex("by_date", (q) => q.gte("date", todayStartTs).lte("date", todayEndTs))
			.collect();
		
		const todayIncome = todayTransactions
			.filter((t) => t.type === "income" && t.status === "completed")
			.reduce((sum, t) => sum + (t.amount ?? 0), 0);
		
		const todayExpense = todayTransactions
			.filter((t) => t.type === "expense" && t.status === "completed")
			.reduce((sum, t) => sum + (t.amount ?? 0), 0);

		// Global totals (This might stay slow until we have aggregates, but let's at least use indexes)
		const allIncomeTx = await ctx.db
			.query("financialTransactions")
			.withIndex("by_type", (q) => q.eq("type", "income"))
			.collect();
		const allExpenseTx = await ctx.db
			.query("financialTransactions")
			.withIndex("by_type", (q) => q.eq("type", "expense"))
			.collect();

		const totalIncome = allIncomeTx
			.filter((t) => t.status === "completed")
			.reduce((sum, t) => sum + (t.amount ?? 0), 0);
		const totalExpense = allExpenseTx
			.filter((t) => t.status === "completed")
			.reduce((sum, t) => sum + (t.amount ?? 0), 0);

		// Order status breakdown (Individual queries or filter all)
		const orderStatusBreakdown = {
			pending: pendingOrders,
			paid: (await ctx.db.query("orders").withIndex("by_status", (q) => q.eq("status", "paid")).collect()).length,
			completed: (await ctx.db.query("orders").withIndex("by_status", (q) => q.eq("status", "completed")).collect()).length,
			cancelled: (await ctx.db.query("orders").withIndex("by_status", (q) => q.eq("status", "cancelled")).collect()).length,
		};

		// Revenue last 7 days (Using WIB boundaries and individual indexed queries)
		const last7Days: { date: string; revenue: number; discount: number; orders: number }[] = [];
		for (let i = 6; i >= 0; i--) {
			const dayWib = new Date(nowWib);
			dayWib.setDate(dayWib.getDate() - i);
			
			const dStartWib = new Date(dayWib.getFullYear(), dayWib.getMonth(), dayWib.getDate());
			const dStartTs = dStartWib.getTime() - WIB_OFFSET;

			const dEndWib = new Date(dayWib.getFullYear(), dayWib.getMonth(), dayWib.getDate(), 23, 59, 59, 999);
			const dEndTs = dEndWib.getTime() - WIB_OFFSET;

			const dayOrders = await ctx.db
				.query("orders")
				.withIndex("by_createdAt", (q) => q.gte("createdAt", dStartTs).lte("createdAt", dEndTs))
				.collect();

			const dayBookings = await ctx.db
				.query("bookingOrders")
				.withIndex("by_createdAt", (q) => q.gte("createdAt", dStartTs).lte("createdAt", dEndTs))
				.collect();

			const validOrders = dayOrders.filter(isSettledOrder);
			const validBookings = dayBookings.filter(isSettledBooking);

			const dayRevenue = validOrders.reduce(
				(sum, order) => sum + getOrderFinancialSnapshot(order).finalCollected,
				0
			) + validBookings.reduce(
				(sum, booking) => sum + getBookingFinancialSnapshot(booking).finalCollected,
				0
			);
			const dayDiscount = validOrders.reduce(
				(sum, order) => sum + getOrderFinancialSnapshot(order).discount,
				0
			);

			last7Days.push({
				date: dStartWib.toLocaleDateString("id-ID", { weekday: "short", day: "numeric" }),
				revenue: dayRevenue,
				discount: dayDiscount,
				orders: validOrders.length + validBookings.length,
			});
		}

		// Top selling products (from completed/paid orders today/recent - let's stay with recent 50 orders for better perf)
		const recentOrdersForProducts = await ctx.db
			.query("orders")
			.withIndex("by_createdAt")
			.order("desc")
			.take(100);

		const productSales: Record<string, { name: string; count: number; revenue: number }> = {};
		recentOrdersForProducts
			.filter((o) => o.status === "completed" || o.status === "paid")
			.forEach((order) => {
				const items = Array.isArray(order.items) ? order.items : [];
				items.forEach((item) => {
					const productName = item.productName ?? "Unknown";
					if (!productSales[productName]) {
						productSales[productName] = { name: productName, count: 0, revenue: 0 };
					}
					productSales[productName].count += item.quantity ?? 0;
					productSales[productName].revenue += (item.price ?? 0) * (item.quantity ?? 0);
				});
			});

		const topProducts = Object.values(productSales)
			.sort((a, b) => b.count - a.count)
			.slice(0, 10);

		// Recent orders (last 10)
		const recentOrders = (await ctx.db
			.query("orders")
			.withIndex("by_createdAt")
			.order("desc")
			.take(10))
			.map((o) => ({
				_id: o._id,
				orderNumber: o.orderNumber ?? "N/A",
				totalAmount: o.totalAmount ?? 0,
				status: o.status,
				createdAt: o.createdAt ?? 0,
				customerName: o.customerName ?? null,
				paymentMethod: o.paymentMethod ?? null,
			}));

		const pendingNonCashOrders = todayOrders.filter(
			(order) =>
				order.status === "pending" &&
				(order.paymentMethod === "qris" || order.paymentMethod === "transfer")
		);

		const anomalies = [
			...todayShifts
				.filter((shift) => {
					const cashGap =
						(shift.endingCashPhysical ?? 0) - (shift.endingCashExpected ?? 0);
					const nonCashGap =
						(shift.nonCashConfirmed ?? 0) - (shift.nonCashExpected ?? 0);
					return Math.abs(cashGap) >= 10000 || Math.abs(nonCashGap) >= 10000;
				})
				.slice(0, 3)
				.map((shift) => {
					const cashGap =
						(shift.endingCashPhysical ?? 0) - (shift.endingCashExpected ?? 0);
					const nonCashGap =
						(shift.nonCashConfirmed ?? 0) - (shift.nonCashExpected ?? 0);
					return {
						type: "shift_discrepancy",
						severity:
							Math.abs(cashGap) >= 50000 || Math.abs(nonCashGap) >= 50000
								? "high"
								: "medium",
						title: `${shift.shiftName || "Shift"} selisih rekonsiliasi`,
						description: `Kas ${cashGap >= 0 ? "+" : ""}${cashGap.toLocaleString("id-ID")} | Non-tunai ${nonCashGap >= 0 ? "+" : ""}${nonCashGap.toLocaleString("id-ID")}`,
					};
				}),
			...(pendingNonCashOrders.length > 0
				? [
						{
							type: "payment_reconciliation",
							severity: "medium",
							title: "Pembayaran non-tunai belum selesai",
							description: `${pendingNonCashOrders.length} order QRIS/transfer masih pending hari ini`,
						},
				  ]
				: []),
			...(todayDiscount > 0 && todayRevenue > 0 && todayDiscount / (todayRevenue + todayDiscount) > 0.25
				? [
						{
							type: "discount_spike",
							severity: "medium",
							title: "Potongan diskon relatif tinggi",
							description: `Diskon hari ini ${((todayDiscount / (todayRevenue + todayDiscount)) * 100).toFixed(1)}% dari gross sales`,
						},
				  ]
				: []),
		].slice(0, 4);

		return {
			todayOrders: todayOrders.length + todayBookings.length,
			todayRevenue,
			todayPosRevenue,
			todayBookingRevenue,
			todayDiscount,
			pendingOrders,
			activeProducts,
			totalProducts: allProducts.length,
			lowStockCount: lowStockItems.length,
			lowStockItems: lowStockItems.slice(0, 10).map((i) => ({
				_id: i._id,
				ingredientName: i.ingredientName ?? "Unknown",
				quantity: i.quantity ?? 0,
				unit: i.unit ?? "",
				lowStockThreshold: i.lowStockThreshold ?? 0,
			})),
			netBalance: totalIncome - totalExpense,
			totalIncome,
			totalExpense,
			todayIncome,
			todayExpense,
			orderStatusBreakdown,
			revenueLast7Days: last7Days,
			topProducts,
			recentOrders,
			cashDiscrepancySummary,
			paymentReconciliation: {
				pendingNonCashCount: pendingNonCashOrders.length,
				pendingNonCashAmount: pendingNonCashOrders.reduce((sum, order) => sum + (order.totalAmount ?? 0), 0),
			},
			anomalies,
		};
	},
});
