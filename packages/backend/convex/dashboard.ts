import { v } from "convex/values";
import { query } from "./_generated/server";

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
		const todayPosRevenue = todayOrders
			.filter((o) => o.status === "completed" || o.status === "paid")
			.reduce((sum, o) => sum + (o.totalAmount ?? 0), 0);
		
		const todayBookingRevenue = todayBookings
			.filter((b) => b.paymentStatus === "paid" || b.bookingStatus === "confirmed" || b.bookingStatus === "completed")
			.reduce((sum, b) => sum + (b.totalAmount ?? 0), 0);
		
		const todayDiscount = todayOrders
			.filter((o) => o.status === "completed" || o.status === "paid")
			.reduce((sum, o) => sum + (o.discountAmount ?? 0), 0);

		const todayRevenue = todayPosRevenue + todayBookingRevenue;

		// 3. Pending orders count (Indexed)
		const pendingOrders = (await ctx.db
			.query("orders")
			.withIndex("by_status", (q) => q.eq("status", "pending"))
			.collect()).length;

		// 4. Products stats
		const allProducts = await ctx.db.query("products").collect();
		const activeProducts = allProducts.filter((p) => p.isAvailable ?? false).length;

		// 5. Low stock items
		const inventory = await ctx.db.query("inventory").collect();
		const lowStockItems = inventory.filter(
			(i) => (i.quantity ?? 0) <= (i.lowStockThreshold ?? 0),
		);

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

			const validOrders = dayOrders.filter((o) => o.status === "completed" || o.status === "paid");
			const validBookings = dayBookings.filter((b) => b.paymentStatus === "paid" || b.bookingStatus === "confirmed" || b.bookingStatus === "completed");

			last7Days.push({
				date: dStartWib.toLocaleDateString("id-ID", { weekday: "short", day: "numeric" }),
				revenue: validOrders.reduce((sum, o) => sum + (o.totalAmount ?? 0), 0) + 
						 validBookings.reduce((sum, b) => sum + (b.totalAmount ?? 0), 0),
				discount: validOrders.reduce((sum, o) => sum + (o.discountAmount ?? 0), 0),
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
		};
	},
});
