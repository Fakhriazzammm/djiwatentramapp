import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ─── Shared HPP calculation helper (used by multiple queries) ────────────────

function computeHppPerServing(calc: {
	ingredients: {
		purchasePrice: number;
		purchaseQuantity: number;
		conversionFactor: number;
		usagePerServing: number;
	}[];
	overheadCosts: { costPerServing: number }[];
}) {
	const ingredientCost = calc.ingredients.reduce((sum, ing) => {
		const totalBase = ing.purchaseQuantity * ing.conversionFactor;
		const costBase = totalBase > 0 ? ing.purchasePrice / totalBase : 0;
		return sum + costBase * ing.usagePerServing;
	}, 0);
	const overheadCost = calc.overheadCosts.reduce(
		(sum, oh) => sum + oh.costPerServing,
		0
	);
	return ingredientCost + overheadCost;
}

// Get all HPP calculations
export const getHppCalculations = query({
	args: {},
	handler: async (ctx) => {
		return await ctx.db.query("hppCalculations").collect();
	},
});

// Get a single HPP calculation by ID
export const getHppCalculation = query({
	args: { id: v.id("hppCalculations") },
	handler: async (ctx, args) => {
		return await ctx.db.get(args.id);
	},
});

// Get HPP calculation linked to a product
export const getHppByProduct = query({
	args: { productId: v.id("products") },
	handler: async (ctx, args) => {
		return await ctx.db
			.query("hppCalculations")
			.withIndex("by_product", (q) => q.eq("productId", args.productId))
			.first();
	},
});

// ─── Inventory Price Sync ────────────────────────────────────────────────────

/**
 * Get latest purchase costs for all inventory items.
 * Pulls the most recent restock transaction with costPerUnit for each item.
 */
export const getLatestInventoryCosts = query({
	args: {},
	handler: async (ctx) => {
		const inventory = await ctx.db.query("inventory").collect();
		const result: Record<
			string,
			{
				inventoryId: string;
				ingredientName: string;
				unit: string;
				displayUnit?: string;
				conversionFactor?: number;
				latestCostPerUnit?: number;
				latestRestockDate?: number;
				avgCostPerUnit?: number;
			}
		> = {};

		for (const item of inventory) {
			const transactions = await ctx.db
				.query("inventoryTransactions")
				.withIndex("by_inventory", (q) => q.eq("inventoryId", item._id))
				.order("desc")
				.collect();

			// Find latest restock with costPerUnit
			const restocks = transactions.filter(
				(t) => t.type === "restock" && t.costPerUnit != null
			);
			const latestRestock = restocks[0];

			// Calculate average cost from all restocks that have costPerUnit
			let avgCostPerUnit: number | undefined;
			if (restocks.length > 0) {
				const totalCost = restocks.reduce(
					(sum, t) => sum + (t.costPerUnit ?? 0) * t.quantity,
					0
				);
				const totalQty = restocks.reduce((sum, t) => sum + t.quantity, 0);
				avgCostPerUnit = totalQty > 0 ? totalCost / totalQty : undefined;
			}

			result[item._id] = {
				inventoryId: item._id,
				ingredientName: item.ingredientName,
				unit: item.unit,
				displayUnit: item.displayUnit,
				conversionFactor: item.conversionFactor,
				latestCostPerUnit: latestRestock?.costPerUnit ?? undefined,
				latestRestockDate: latestRestock?.timestamp,
				avgCostPerUnit,
			};
		}

		return result;
	},
});

// ─── Recipe Integration ──────────────────────────────────────────────────────

/**
 * Generate HPP data from an existing product recipe.
 * Returns ingredient data pre-populated with inventory info & latest costs,
 * ready to be loaded into the HPP calculator form.
 */
export const generateHppFromRecipe = query({
	args: { productId: v.id("products"), variantName: v.optional(v.string()) },
	handler: async (ctx, args) => {
		// Find the recipe
		let recipe = await ctx.db
			.query("recipes")
			.withIndex("by_product_variant", (q) =>
				q.eq("productId", args.productId).eq("variantName", args.variantName)
			)
			.first();

		// Fallback to base recipe (no variant) if not found
		if (!recipe && args.variantName) {
			recipe = await ctx.db
				.query("recipes")
				.withIndex("by_product_variant", (q) =>
					q.eq("productId", args.productId).eq("variantName", undefined)
				)
				.first();
		}

		if (!recipe) {
			return null;
		}

		const product = await ctx.db.get(args.productId);
		if (!product) {
			return null;
		}

		// Build ingredients with inventory info and latest costs
		const ingredients = [];
		for (const recipeIng of recipe.ingredients) {
			const invItem = await ctx.db.get(recipeIng.inventoryId);
			if (!invItem) {
				continue;
			}

			// Get latest restock cost
			const restocks = await ctx.db
				.query("inventoryTransactions")
				.withIndex("by_inventory", (q) =>
					q.eq("inventoryId", recipeIng.inventoryId)
				)
				.order("desc")
				.collect();

			const latestRestock = restocks.find(
				(t) => t.type === "restock" && t.costPerUnit != null
			);

			// Determine purchase unit / conversion
			const displayUnit = invItem.displayUnit || invItem.unit;
			const convFactor = invItem.conversionFactor || 1;

			// costPerUnit from transaction is per base unit.
			// purchasePrice = costPerUnit * conversionFactor (price per display unit)
			const costPerBaseUnit = latestRestock?.costPerUnit ?? 0;
			const purchasePrice = costPerBaseUnit * convFactor;

			ingredients.push({
				inventoryId: invItem._id,
				ingredientName: invItem.ingredientName,
				purchasePrice,
				purchaseQuantity: 1,
				purchaseUnit: displayUnit,
				usagePerServing: recipeIng.amount,
				usageUnit: invItem.unit,
				conversionFactor: convFactor,
			});
		}

		return {
			productId: product._id,
			productName: product.name,
			sellingPrice: product.promoPrice ?? product.price,
			ingredients,
			variantName: args.variantName,
		};
	},
});

/**
 * Get all products that have recipes defined (for the import picker).
 */
export const getProductsWithRecipes = query({
	args: {},
	handler: async (ctx) => {
		const recipes = await ctx.db.query("recipes").collect();
		const productIds = [...new Set(recipes.map((r) => r.productId))];

		const results = [];
		for (const pid of productIds) {
			const product = await ctx.db.get(pid);
			if (!product) {
				continue;
			}

			const productRecipes = recipes.filter((r) => r.productId === pid);
			results.push({
				product,
				variants: productRecipes
					.map((r) => r.variantName)
					.filter((v): v is string => v != null),
			});
		}

		return results;
	},
});

// ─── CRUD ────────────────────────────────────────────────────────────────────

// Create a new HPP calculation
export const createHppCalculation = mutation({
	args: {
		name: v.string(),
		description: v.optional(v.string()),
		ingredients: v.array(
			v.object({
				inventoryId: v.optional(v.id("inventory")),
				ingredientName: v.string(),
				purchasePrice: v.number(),
				purchaseQuantity: v.number(),
				purchaseUnit: v.string(),
				usagePerServing: v.number(),
				usageUnit: v.string(),
				conversionFactor: v.number(),
			})
		),
		overheadCosts: v.array(
			v.object({
				name: v.string(),
				costPerServing: v.number(),
			})
		),
		servingsPerBatch: v.number(),
		sellingPrice: v.number(),
		productId: v.optional(v.id("products")),
	},
	handler: async (ctx, args) => {
		const now = Date.now();
		return await ctx.db.insert("hppCalculations", {
			...args,
			createdAt: now,
			updatedAt: now,
		});
	},
});

// Update an existing HPP calculation
export const updateHppCalculation = mutation({
	args: {
		id: v.id("hppCalculations"),
		name: v.string(),
		description: v.optional(v.string()),
		ingredients: v.array(
			v.object({
				inventoryId: v.optional(v.id("inventory")),
				ingredientName: v.string(),
				purchasePrice: v.number(),
				purchaseQuantity: v.number(),
				purchaseUnit: v.string(),
				usagePerServing: v.number(),
				usageUnit: v.string(),
				conversionFactor: v.number(),
			})
		),
		overheadCosts: v.array(
			v.object({
				name: v.string(),
				costPerServing: v.number(),
			})
		),
		servingsPerBatch: v.number(),
		sellingPrice: v.number(),
		productId: v.optional(v.id("products")),
	},
	handler: async (ctx, args) => {
		const { id, ...data } = args;
		await ctx.db.patch(id, {
			...data,
			updatedAt: Date.now(),
		});
	},
});

// Delete an HPP calculation
export const deleteHppCalculation = mutation({
	args: { id: v.id("hppCalculations") },
	handler: async (ctx, args) => {
		await ctx.db.delete(args.id);
	},
});

/**
 * Sync HPP calculation ingredients with latest inventory prices.
 * Updates the purchasePrice of each ingredient that is linked to an inventory item.
 */
export const syncHppWithInventoryPrices = mutation({
	args: { id: v.id("hppCalculations") },
	handler: async (ctx, args) => {
		const hpp = await ctx.db.get(args.id);
		if (!hpp) {
			throw new Error("HPP calculation not found");
		}

		let updatedCount = 0;
		const updatedIngredients = [];

		for (const ing of hpp.ingredients) {
			if (!ing.inventoryId) {
				updatedIngredients.push(ing);
				continue;
			}

			const invItem = await ctx.db.get(ing.inventoryId);
			if (!invItem) {
				updatedIngredients.push(ing);
				continue;
			}

			// Find latest restock with cost
			const transactions = await ctx.db
				.query("inventoryTransactions")
				.withIndex("by_inventory", (q) => q.eq("inventoryId", ing.inventoryId!))
				.order("desc")
				.collect();

			const latestRestock = transactions.find(
				(t) => t.type === "restock" && t.costPerUnit != null
			);

			if (latestRestock?.costPerUnit != null) {
				const newPurchasePrice =
					latestRestock.costPerUnit * ing.conversionFactor;

				if (newPurchasePrice !== ing.purchasePrice) {
					updatedIngredients.push({
						...ing,
						purchasePrice: newPurchasePrice,
					});
					updatedCount++;
				} else {
					updatedIngredients.push(ing);
				}
			} else {
				updatedIngredients.push(ing);
			}
		}

		if (updatedCount > 0) {
			await ctx.db.patch(args.id, {
				ingredients: updatedIngredients,
				updatedAt: Date.now(),
			});
		}

		return { updatedCount };
	},
});

// ─── Dashboard & Analytics ───────────────────────────────────────────────────

/**
 * Get HPP summary for all products (used by dashboard, products page, orders).
 * Returns a map of productId → { hppPerServing, sellingPrice, margin, name }
 */
export const getHppProductMap = query({
	args: {},
	handler: async (ctx) => {
		const allHpp = await ctx.db.query("hppCalculations").collect();
		const result: Record<
			string,
			{
				hppId: string;
				name: string;
				hppPerServing: number;
				sellingPrice: number;
				profitPerServing: number;
				marginPercent: number;
			}
		> = {};

		for (const calc of allHpp) {
			const hpp = computeHppPerServing(calc);
			const profit = calc.sellingPrice - hpp;
			const margin =
				calc.sellingPrice > 0 ? (profit / calc.sellingPrice) * 100 : 0;

			// Index by productId if linked
			if (calc.productId) {
				result[calc.productId] = {
					hppId: calc._id,
					name: calc.name,
					hppPerServing: hpp,
					sellingPrice: calc.sellingPrice,
					profitPerServing: profit,
					marginPercent: margin,
				};
			}
			// Also index by hppId for non-product-linked
			result[calc._id] = {
				hppId: calc._id,
				name: calc.name,
				hppPerServing: hpp,
				sellingPrice: calc.sellingPrice,
				profitPerServing: profit,
				marginPercent: margin,
			};
		}

		return result;
	},
});

/**
 * Dashboard widget: HPP overview stats & rankings.
 */
export const getHppDashboardData = query({
	args: {},
	handler: async (ctx) => {
		const allHpp = await ctx.db.query("hppCalculations").collect();

		if (allHpp.length === 0) {
			return {
				totalCalculations: 0,
				avgMargin: 0,
				lowMarginAlerts: [],
				topProfit: [],
				bottomProfit: [],
			};
		}

		const analyzed = allHpp.map((calc) => {
			const hpp = computeHppPerServing(calc);
			const profit = calc.sellingPrice - hpp;
			const margin =
				calc.sellingPrice > 0 ? (profit / calc.sellingPrice) * 100 : 0;
			return {
				id: calc._id,
				name: calc.name,
				productId: calc.productId,
				hppPerServing: hpp,
				sellingPrice: calc.sellingPrice,
				profitPerServing: profit,
				marginPercent: margin,
			};
		});

		const avgMargin =
			analyzed.reduce((sum, a) => sum + a.marginPercent, 0) / analyzed.length;

		// Low margin alerts (below 20%)
		const lowMarginAlerts = analyzed
			.filter((a) => a.marginPercent < 20 && a.sellingPrice > 0)
			.sort((a, b) => a.marginPercent - b.marginPercent);

		// Top 5 most profitable
		const topProfit = [...analyzed]
			.sort((a, b) => b.profitPerServing - a.profitPerServing)
			.slice(0, 5);

		// Bottom 5 least profitable
		const bottomProfit = [...analyzed]
			.filter((a) => a.sellingPrice > 0)
			.sort((a, b) => a.profitPerServing - b.profitPerServing)
			.slice(0, 5);

		return {
			totalCalculations: allHpp.length,
			avgMargin,
			lowMarginAlerts,
			topProfit,
			bottomProfit,
		};
	},
});

/**
 * Calculate estimated COGS for completed/paid orders (used by finance integration).
 * Matches order items to HPP calculations via productId.
 */
export const getOrdersCogs = query({
	args: {},
	handler: async (ctx) => {
		const allHpp = await ctx.db.query("hppCalculations").collect();
		const orders = await ctx.db.query("orders").order("desc").collect();

		// Build productId → HPP lookup
		const hppByProduct: Record<string, number> = {};
		for (const calc of allHpp) {
			if (calc.productId) {
				hppByProduct[calc.productId] = computeHppPerServing(calc);
			}
		}

		const completedOrders = orders.filter(
			(o) => o.status === "completed" || o.status === "paid"
		);

		let totalRevenue = 0;
		let totalCogs = 0;
		let matchedOrders = 0;

		const orderProfits: {
			orderId: string;
			orderNumber: string;
			revenue: number;
			cogs: number;
			profit: number;
			createdAt: number;
		}[] = [];

		for (const order of completedOrders) {
			let orderCogs = 0;
			let hasHpp = false;
			for (const item of order.items) {
				const hppPerUnit = hppByProduct[item.productId];
				if (hppPerUnit != null) {
					orderCogs += hppPerUnit * item.quantity;
					hasHpp = true;
				}
			}
			if (hasHpp) {
				matchedOrders++;
				totalRevenue += order.totalAmount;
				totalCogs += orderCogs;
				orderProfits.push({
					orderId: order._id,
					orderNumber: order.orderNumber,
					revenue: order.totalAmount,
					cogs: orderCogs,
					profit: order.totalAmount - orderCogs,
					createdAt: order.createdAt,
				});
			}
		}

		// Group by date for daily summary
		const dailySummary: Record<
			string,
			{
				date: string;
				revenue: number;
				cogs: number;
				profit: number;
				orders: number;
			}
		> = {};
		for (const op of orderProfits) {
			const dateKey = new Date(op.createdAt).toISOString().split("T")[0];
			if (!dailySummary[dateKey]) {
				dailySummary[dateKey] = {
					date: dateKey,
					revenue: 0,
					cogs: 0,
					profit: 0,
					orders: 0,
				};
			}
			dailySummary[dateKey].revenue += op.revenue;
			dailySummary[dateKey].cogs += op.cogs;
			dailySummary[dateKey].profit += op.profit;
			dailySummary[dateKey].orders++;
		}

		return {
			totalRevenue,
			totalCogs,
			totalProfit: totalRevenue - totalCogs,
			grossMargin:
				totalRevenue > 0
					? ((totalRevenue - totalCogs) / totalRevenue) * 100
					: 0,
			matchedOrders,
			totalCompletedOrders: completedOrders.length,
			recentOrderProfits: orderProfits.slice(0, 20),
			dailySummary: Object.values(dailySummary).sort((a, b) =>
				b.date.localeCompare(a.date)
			),
		};
	},
});

/**
 * Forecasting: estimate future raw material costs based on avg daily usage.
 */
export const getHppForecast = query({
	args: { days: v.optional(v.number()) },
	handler: async (ctx, args) => {
		const forecastDays = args.days ?? 30;
		const allHpp = await ctx.db.query("hppCalculations").collect();
		const orders = await ctx.db.query("orders").order("desc").collect();

		// Build productId → HPP ingredients lookup
		const hppByProduct: Record<
			string,
			{
				ingredients: {
					ingredientName: string;
					usagePerServing: number;
					usageUnit: string;
					costPerServing: number;
				}[];
			}
		> = {};

		for (const calc of allHpp) {
			if (!calc.productId) {
				continue;
			}
			hppByProduct[calc.productId] = {
				ingredients: calc.ingredients.map((ing) => {
					const totalBase = ing.purchaseQuantity * ing.conversionFactor;
					const costBase = totalBase > 0 ? ing.purchasePrice / totalBase : 0;
					return {
						ingredientName: ing.ingredientName,
						usagePerServing: ing.usagePerServing,
						usageUnit: ing.usageUnit,
						costPerServing: costBase * ing.usagePerServing,
					};
				}),
			};
		}

		// Calculate avg daily servings per product (last 7 days)
		const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
		const recentOrders = orders.filter(
			(o) =>
				(o.status === "completed" || o.status === "paid") &&
				o.createdAt >= sevenDaysAgo
		);

		const dailyUsage: Record<
			string,
			{ name: string; totalQty: number; unit: string; totalCost: number }
		> = {};

		for (const order of recentOrders) {
			for (const item of order.items) {
				const hppData = hppByProduct[item.productId];
				if (!hppData) {
					continue;
				}

				for (const ing of hppData.ingredients) {
					const key = ing.ingredientName;
					if (!dailyUsage[key]) {
						dailyUsage[key] = {
							name: ing.ingredientName,
							totalQty: 0,
							unit: ing.usageUnit,
							totalCost: 0,
						};
					}
					dailyUsage[key].totalQty += ing.usagePerServing * item.quantity;
					dailyUsage[key].totalCost += ing.costPerServing * item.quantity;
				}
			}
		}

		// Calculate days with orders to get accurate daily avg
		const daysWithData = Math.max(
			1,
			Math.min(
				7,
				new Set(
					recentOrders.map(
						(o) => new Date(o.createdAt).toISOString().split("T")[0]
					)
				).size
			)
		);

		const forecast = Object.values(dailyUsage).map((item) => ({
			ingredientName: item.name,
			unit: item.unit,
			avgDailyUsage: item.totalQty / daysWithData,
			avgDailyCost: item.totalCost / daysWithData,
			forecastUsage: (item.totalQty / daysWithData) * forecastDays,
			forecastCost: (item.totalCost / daysWithData) * forecastDays,
		}));

		forecast.sort((a, b) => b.forecastCost - a.forecastCost);

		return {
			forecastDays,
			daysWithData,
			totalForecastCost: forecast.reduce((sum, f) => sum + f.forecastCost, 0),
			ingredients: forecast,
		};
	},
});
