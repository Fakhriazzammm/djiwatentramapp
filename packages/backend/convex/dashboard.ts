import { v } from "convex/values";
import { query } from "./_generated/server";

// Get dashboard statistics
export const getDashboardStats = query({
	args: {},
	handler: async (ctx) => {
		const now = Date.now();
		const todayStart = new Date();
		todayStart.setHours(0, 0, 0, 0);
		const todayStartTs = todayStart.getTime();

		// Get all orders
		const allOrders = await ctx.db.query("orders").collect();

		// Today's orders
		const todayOrders = allOrders.filter((o) => (o.createdAt ?? 0) >= todayStartTs);

		// Calculate today's revenue (completed + paid orders)
		const todayRevenue = todayOrders
			.filter((o) => o.status === "completed" || o.status === "paid")
			.reduce((sum, o) => sum + (o.totalAmount ?? 0), 0);

		// Pending orders count
		const pendingOrders = allOrders.filter((o) => o.status === "pending").length;

		// Get all products
		const allProducts = await ctx.db.query("products").collect();
		const activeProducts = allProducts.filter((p) => p.isAvailable ?? false).length;

		// Get low stock items
		const inventory = await ctx.db.query("inventory").collect();
		const lowStockItems = inventory.filter(
			(i) => (i.quantity ?? 0) <= (i.lowStockThreshold ?? 0),
		);

		// Get financial summary
		const transactions = await ctx.db.query("financialTransactions").collect();
		
		const todayIncome = transactions
			.filter((t) => t.type === "income" && t.status === "completed" && (t.date ?? 0) >= todayStartTs)
			.reduce((sum, t) => sum + (t.amount ?? 0), 0);
		
		const todayExpense = transactions
			.filter((t) => t.type === "expense" && t.status === "completed" && (t.date ?? 0) >= todayStartTs)
			.reduce((sum, t) => sum + (t.amount ?? 0), 0);

		const totalIncome = transactions
			.filter((t) => t.type === "income" && t.status === "completed")
			.reduce((sum, t) => sum + (t.amount ?? 0), 0);
		const totalExpense = transactions
			.filter((t) => t.type === "expense" && t.status === "completed")
			.reduce((sum, t) => sum + (t.amount ?? 0), 0);

		// Order status breakdown
		const orderStatusBreakdown = {
			pending: allOrders.filter((o) => o.status === "pending").length,
			paid: allOrders.filter((o) => o.status === "paid").length,
			completed: allOrders.filter((o) => o.status === "completed").length,
			cancelled: allOrders.filter((o) => o.status === "cancelled").length,
		};

		// Revenue last 7 days
		const last7Days: { date: string; revenue: number; orders: number }[] = [];
		for (let i = 6; i >= 0; i--) {
			const dayStart = new Date();
			dayStart.setDate(dayStart.getDate() - i);
			dayStart.setHours(0, 0, 0, 0);
			const dayStartTs = dayStart.getTime();

			const dayEnd = new Date(dayStart);
			dayEnd.setHours(23, 59, 59, 999);
			const dayEndTs = dayEnd.getTime();

			const dayOrders = allOrders.filter(
				(o) =>
					(o.createdAt ?? 0) >= dayStartTs &&
					(o.createdAt ?? 0) <= dayEndTs &&
					(o.status === "completed" || o.status === "paid"),
			);

			last7Days.push({
				date: dayStart.toLocaleDateString("id-ID", { weekday: "short", day: "numeric" }),
				revenue: dayOrders.reduce((sum, o) => sum + (o.totalAmount ?? 0), 0),
				orders: dayOrders.length,
			});
		}

		// Top selling products (from completed orders)
		const productSales: Record<string, { name: string; count: number; revenue: number }> = {};
		allOrders
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
			.slice(0, 5);

		// Recent orders (last 10)
		const recentOrders = allOrders
			.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
			.slice(0, 10)
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
			todayOrders: todayOrders.length,
			todayRevenue,
			pendingOrders,
			activeProducts,
			totalProducts: allProducts.length,
			lowStockCount: lowStockItems.length,
			lowStockItems: lowStockItems.slice(0, 5).map((i) => ({
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
