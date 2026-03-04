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
		const todayOrders = allOrders.filter((o) => o.createdAt >= todayStartTs);

		// Calculate today's revenue (completed + paid orders)
		const todayRevenue = todayOrders
			.filter((o) => o.status === "completed" || o.status === "paid")
			.reduce((sum, o) => sum + o.totalAmount, 0);

		// Pending orders count
		const pendingOrders = allOrders.filter((o) => o.status === "pending").length;

		// Get all products
		const allProducts = await ctx.db.query("products").collect();
		const activeProducts = allProducts.filter((p) => p.isAvailable).length;

		// Get low stock items
		const inventory = await ctx.db.query("inventory").collect();
		const lowStockItems = inventory.filter((i) => i.quantity <= i.lowStockThreshold);

		// Get financial summary
		const transactions = await ctx.db.query("financialTransactions").collect();
		const totalIncome = transactions
			.filter((t) => t.type === "income" && t.status === "completed")
			.reduce((sum, t) => sum + t.amount, 0);
		const totalExpense = transactions
			.filter((t) => t.type === "expense" && t.status === "completed")
			.reduce((sum, t) => sum + t.amount, 0);

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
				(o) => o.createdAt >= dayStartTs && o.createdAt <= dayEndTs && (o.status === "completed" || o.status === "paid")
			);

			last7Days.push({
				date: dayStart.toLocaleDateString("id-ID", { weekday: "short", day: "numeric" }),
				revenue: dayOrders.reduce((sum, o) => sum + o.totalAmount, 0),
				orders: dayOrders.length,
			});
		}

		// Top selling products (from completed orders)
		const productSales: Record<string, { name: string; count: number; revenue: number }> = {};
		allOrders
			.filter((o) => o.status === "completed" || o.status === "paid")
			.forEach((order) => {
				order.items.forEach((item) => {
					if (!productSales[item.productName]) {
						productSales[item.productName] = { name: item.productName, count: 0, revenue: 0 };
					}
					productSales[item.productName].count += item.quantity;
					productSales[item.productName].revenue += item.price * item.quantity;
				});
			});

		const topProducts = Object.values(productSales)
			.sort((a, b) => b.count - a.count)
			.slice(0, 5);

		// Recent orders (last 10)
		const recentOrders = allOrders
			.sort((a, b) => b.createdAt - a.createdAt)
			.slice(0, 10)
			.map((o) => ({
				_id: o._id,
				orderNumber: o.orderNumber,
				totalAmount: o.totalAmount,
				status: o.status,
				createdAt: o.createdAt,
				customerName: o.customerName,
				paymentMethod: o.paymentMethod,
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
				ingredientName: i.ingredientName,
				quantity: i.quantity,
				unit: i.unit,
				lowStockThreshold: i.lowStockThreshold,
			})),
			netBalance: totalIncome - totalExpense,
			totalIncome,
			totalExpense,
			orderStatusBreakdown,
			revenueLast7Days: last7Days,
			topProducts,
			recentOrders,
		};
	},
});
