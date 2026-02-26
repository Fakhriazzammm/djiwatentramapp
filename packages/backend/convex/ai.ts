import type { GenericActionCtx } from "convex/server";
import { v } from "convex/values";
import OpenAI from "openai";
import type { z } from "zod";
import { api } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { action } from "./_generated/server";
import { formatToolResult, tools } from "./tools";

// Helper to initialize OpenAI lazily
const getOpenAI = () => {
	const apiKey = process.env.SUMOPOD_API_KEY;
	if (!apiKey) {
		throw new Error("Missing SUMOPOD_API_KEY environment variable");
	}
	return new OpenAI({
		apiKey,
		baseURL: "https://ai.sumopod.com/v1",
	});
};

/**
 * Analyze sales data to provide high-level insights.
 */
export const generateInsights = action({
	args: {
		salesData: v.string(), // JSON string of recent orders
	},
	handler: async (_ctx, args) => {
		const completion = await getOpenAI().chat.completions.create({
			model: "gpt-4o-mini",
			messages: [
				{
					role: "system",
					content:
						"You are an AI Business Analyst for TKM POS. Analyze sales data and provide 3 bullet points of insights and 1 strategic recommendation.",
				},
				{
					role: "user",
					content: `Analyze this sales data: ${args.salesData}`,
				},
			],
		});

		return completion.choices[0].message.content;
	},
});

/**
 * Predict if any stock items are likely to run out soon.
 */
export const predictStockOut = action({
	args: {
		inventoryData: v.string(),
		recentSalesTrend: v.string(),
	},
	handler: async (_ctx, args) => {
		const completion = await getOpenAI().chat.completions.create({
			model: "gpt-4o-mini",
			messages: [
				{
					role: "system",
					content:
						"You are a Supply Chain expert. Based on current inventory and sales trends, predict which items might run out in the next 3 days. Provide confidence level.",
				},
				{
					role: "user",
					content: `Inventory: ${args.inventoryData}\nSales Trend: ${args.recentSalesTrend}`,
				},
			],
		});

		return completion.choices[0].message.content;
	},
});

/**
 * Suggest products to cross-sell to a customer based on their current cart.
 */
export const getProductRecommendations = action({
	args: {
		cartItems: v.array(v.string()),
		allProducts: v.array(v.object({ name: v.string(), category: v.string() })),
	},
	handler: async (_ctx, args) => {
		const completion = await getOpenAI().chat.completions.create({
			model: "gpt-4o-mini",
			messages: [
				{
					role: "system",
					content:
						"You are a helpful POS recommendation engine. Suggest 2 items from the 'allProducts' list that would pair well with the items in the cart.",
				},
				{
					role: "user",
					content: `Cart contains: ${args.cartItems.join(", ")}\nAvailable Products: ${JSON.stringify(args.allProducts)}`,
				},
			],
		});

		return completion.choices[0].message.content;
	},
});

/**
 * Generate a marketing description for a product.
 */
export const generateProductDescription = action({
	args: {
		productName: v.string(),
		category: v.string(),
		price: v.number(),
	},
	handler: async (_ctx, args) => {
		const completion = await getOpenAI().chat.completions.create({
			model: "gpt-4o-mini",
			messages: [
				{
					role: "system",
					content:
						"You are a marketing copywriter for a cafe/restaurant POS system. Generate a short, appetizing Indonesian description (max 2 sentences) for the product. Be creative and enticing.",
				},
				{
					role: "user",
					content: `Product: ${args.productName}\nCategory: ${args.category}\nPrice: Rp ${args.price.toLocaleString("id-ID")}`,
				},
			],
		});

		return completion.choices[0].message.content;
	},
});

/**
 * Suggest a discount strategy based on sales data.
 */
export const generateDiscountStrategy = action({
	args: {
		salesSummary: v.string(),
		existingDiscounts: v.string(),
	},
	handler: async (_ctx, args) => {
		const completion = await getOpenAI().chat.completions.create({
			model: "gpt-4o-mini",
			messages: [
				{
					role: "system",
					content:
						"You are a retail pricing strategist. Based on sales data and existing discounts, suggest ONE new discount strategy. Provide: name (Indonesian), type (FIXED or PERCENTAGE), value, and best timing (days/hours). Format as JSON: {name, type, value, reason}",
				},
				{
					role: "user",
					content: `Sales Summary: ${args.salesSummary}\nExisting Discounts: ${args.existingDiscounts}`,
				},
			],
		});

		return completion.choices[0].message.content;
	},
});

/**
 * Yumi AI Chat - Interactive assistant that can query all database tables
 * ENHANCED: Multi-Step Actions + Smart Context
 */
async function gatherDatabaseContext(ctx: GenericActionCtx<DataModel>) {
	const [
		products,
		categories,
		inventory,
		orders,
		discounts,
		financialSummary,
		hppDashboard,
		hppOrdersCogs,
	] = await Promise.all([
		ctx.runQuery(api.products.getAllProductsAdmin),
		ctx.runQuery(api.products.getCategories),
		ctx.runQuery(api.inventory.getInventory),
		ctx.runQuery(api.orders.getOrders, {}),
		ctx.runQuery(api.discounts.getDiscounts),
		ctx.runQuery(api.finance.getFinancialSummary, {}),
		ctx.runQuery(api.hpp.getHppDashboardData),
		ctx.runQuery(api.hpp.getOrdersCogs),
	]);

	const prodList =
		(
			products as Array<{
				name: string;
				price: number;
				isAvailable: boolean;
				promoPrice?: number;
			}>
		)
			?.map(
				(p) =>
					`${p.name} (Rp${p.price}, ${p.isAvailable ? "tersedia" : "habis"}${p.promoPrice ? `, promo: Rp${p.promoPrice}` : ""})`
			)
			.join("; ") || "Tidak ada data";

	const catList =
		(categories as Array<{ name: string }>)?.map((c) => c.name).join(", ") ||
		"Tidak ada data";

	const invList =
		(
			inventory as Array<{
				ingredientName: string;
				quantity: number;
				unit: string;
				lowStockThreshold: number;
			}>
		)
			?.map(
				(i) =>
					`${i.ingredientName}: ${i.quantity} ${i.unit} (min: ${i.lowStockThreshold})`
			)
			.join("; ") || "Tidak ada data";

	const orderArr = orders as Array<{
		orderNumber: string;
		totalAmount: number;
		status: string;
		items: Array<{ productName: string; quantity: number }>;
		createdAt: number;
		customerName?: string;
	}>;
	const totalOrders = orderArr?.length || 0;
	const completedOrders =
		orderArr?.filter((o) => o.status === "completed" || o.status === "paid") ||
		[];
	const totalRevenue = completedOrders.reduce((a, o) => a + o.totalAmount, 0);
	const pendingOrders =
		orderArr?.filter((o) => o.status === "pending").length || 0;
	const recentOrders =
		orderArr
			?.slice(0, 10)
			.map(
				(o) =>
					`#${o.orderNumber} - Rp${o.totalAmount} (${o.status}) - ${o.items.map((i) => `${i.productName} x${i.quantity}`).join(", ")}`
			)
			.join("\n") || "Tidak ada pesanan";

	const discountList =
		(
			discounts as Array<{
				name: string;
				type: string;
				value: number;
				isActive: boolean;
			}>
		)
			?.map(
				(d) =>
					`${d.name}: ${d.type} ${d.value} (${d.isActive ? "aktif" : "nonaktif"})`
			)
			.join("; ") || "Tidak ada promo";

	const fin = financialSummary as
		| {
				totalIncome: number;
				totalExpense: number;
				netBalance: number;
				transactionCount: number;
		  }
		| undefined;

	return `== DATABASE APLIKASI TKM POS ==

📦 PRODUK (${(products as unknown[])?.length || 0}):
${prodList}

🏷️ KATEGORI: ${catList}

📋 INVENTARIS (${(inventory as unknown[])?.length || 0}):
${invList}

🛒 PESANAN (Total: ${totalOrders}, Selesai: ${completedOrders.length}, Tertunda: ${pendingOrders}):
Total Revenue: Rp${totalRevenue.toLocaleString("id-ID")}
Pesanan Terbaru:
${recentOrders}

💰 KEUANGAN:
Pendapatan: Rp${(fin?.totalIncome || 0).toLocaleString("id-ID")}
Pengeluaran: Rp${(fin?.totalExpense || 0).toLocaleString("id-ID")}
Saldo Bersih: Rp${(fin?.netBalance || 0).toLocaleString("id-ID")}
Total Transaksi: ${fin?.transactionCount || 0}

🎁 PROMOSI/DISKON (${(discounts as unknown[])?.length || 0}):
${discountList}

📐 HPP (Harga Pokok Produksi):
${(() => {
	const hpp = hppDashboard as
		| {
				totalCalculations: number;
				avgMargin: number;
				lowMarginAlerts: Array<{
					name: string;
					marginPercent: number;
					profitPerServing: number;
				}>;
				topProfit: Array<{
					name: string;
					profitPerServing: number;
					marginPercent: number;
				}>;
				bottomProfit: Array<{
					name: string;
					profitPerServing: number;
					marginPercent: number;
				}>;
		  }
		| undefined;
	const cogs = hppOrdersCogs as
		| {
				totalRevenue: number;
				totalCogs: number;
				totalProfit: number;
				grossMargin: number;
				matchOrders: number;
		  }
		| undefined;
	if (!hpp || hpp.totalCalculations === 0) {
		return "Belum ada kalkulasi HPP";
	}
	let result = `Total Kalkulasi: ${hpp.totalCalculations}, Rata-rata Margin: ${hpp.avgMargin.toFixed(1)}%\n`;
	if (hpp.lowMarginAlerts.length > 0) {
		result += `⚠️ Margin Rendah (<20%): ${hpp.lowMarginAlerts.map((a) => `${a.name} (${a.marginPercent.toFixed(1)}%)`).join(", ")}\n`;
	}
	result += `Paling Untung: ${hpp.topProfit.map((a) => `${a.name} (Rp${a.profitPerServing.toFixed(0)}/porsi, ${a.marginPercent.toFixed(1)}%)`).join(", ")}\n`;
	result += `Paling Rugi: ${hpp.bottomProfit.map((a) => `${a.name} (Rp${a.profitPerServing.toFixed(0)}/porsi, ${a.marginPercent.toFixed(1)}%)`).join(", ")}`;
	if (cogs) {
		result += `\nCOGS dari Pesanan: Revenue Rp${cogs.totalRevenue.toLocaleString("id-ID")} - COGS Rp${cogs.totalCogs.toLocaleString("id-ID")} = Laba Kotor Rp${cogs.totalProfit.toLocaleString("id-ID")} (Margin ${cogs.grossMargin.toFixed(1)}%), ${cogs.matchedOrders} pesanan matched`;
	}
	return result;
})()}

== FITUR APLIKASI ==
- Manajemen Produk & Kategori (CRUD, variasi, upload gambar)
- Manajemen Inventaris & Stok (FIFO, low-stock alert, resep, base recipe/pre-mix)
- Pemesanan & POS (buat pesanan, update status, cetak struk Bluetooth)
- Keuangan (income/expense tracking, laporan periode)
- Promosi & Diskon (FIXED/PERCENTAGE/FLAT_PRICE, jadwal, target)
- HPP / Kalkulator Harga Pokok Produksi (perhitungan biaya bahan baku, margin, laba)
- Manajemen User & Role (RBAC, permissions)
- Pengaturan Toko (nama, alamat, logo, receipt footer)
- AI Analytics (prediksi stok, analisis bisnis, rekomendasi produk, analisis HPP)`;
}

/**
 * Gather Smart Context - Business patterns and insights
 */
async function gatherSmartContext(ctx: GenericActionCtx<DataModel>) {
	const [orders, inventory, products] = await Promise.all([
		ctx.runQuery(api.orders.getOrders, {}),
		ctx.runQuery(api.inventory.getInventory),
		ctx.runQuery(api.products.getAllProductsAdmin),
	]);

	const insights: string[] = [];

	// Analyze sales patterns
	const completedOrders = (orders as Array<any>).filter(
		(o) => o.status === "completed" || o.status === "paid"
	);

	if (completedOrders.length > 0) {
		// Best selling products
		const productSales: Record<string, number> = {};
		for (const order of completedOrders) {
			for (const item of order.items) {
				productSales[item.productName] =
					(productSales[item.productName] || 0) + item.quantity;
			}
		}
		const topProducts = Object.entries(productSales)
			.sort((a, b) => b[1] - a[1])
			.slice(0, 3);
		if (topProducts.length > 0) {
			insights.push(
				`🏆 Produk Terlaris: ${topProducts.map(([name, qty]) => `${name} (${qty})`).join(", ")}`
			);
		}

		// Peak hours analysis
		const hourCounts: Record<number, number> = {};
		for (const order of completedOrders) {
			const hour = new Date(order.createdAt).getHours();
			hourCounts[hour] = (hourCounts[hour] || 0) + 1;
		}
		const peakHours = Object.entries(hourCounts)
			.sort((a, b) => b[1] - a[1])
			.slice(0, 2);
		if (peakHours.length > 0) {
			insights.push(
				`⏰ Jam Ramai: ${peakHours.map(([h]) => `${h}:00`).join(", ")}`
			);
		}

		// Average order value
		const avgOrderValue =
			completedOrders.reduce((sum, o) => sum + o.totalAmount, 0) /
			completedOrders.length;
		insights.push(
			`📊 Rata-rata Order: Rp${avgOrderValue.toLocaleString("id-ID")}`
		);
	}

	// Low stock alerts
	const lowStockItems = (inventory as Array<any>).filter(
		(i) => i.quantity <= i.lowStockThreshold
	);
	if (lowStockItems.length > 0) {
		insights.push(
			`⚠️ Stok Menipis: ${lowStockItems.map((i) => `${i.ingredientName} (${i.quantity} ${i.unit})`).join(", ")}`
		);
	}

	// Products without HPP
	const productsWithHpp = await ctx.runQuery(api.hpp.getHppProductMap);
	const productsWithoutHpp = (products as Array<any>).filter(
		(p) => !productsWithHpp[p._id]
	);
	if (productsWithoutHpp.length > 0 && productsWithoutHpp.length <= 5) {
		insights.push(
			`📐 Belum Ada HPP: ${productsWithoutHpp.map((p) => p.name).join(", ")}`
		);
	}

	// Revenue trends (today vs yesterday)
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const yesterday = new Date(today);
	yesterday.setDate(yesterday.getDate() - 1);

	const todayRevenue = completedOrders
		.filter((o) => o.createdAt >= today.getTime())
		.reduce((sum, o) => sum + o.totalAmount, 0);
	const yesterdayRevenue = completedOrders
		.filter((o) => o.createdAt >= yesterday.getTime() && o.createdAt < today.getTime())
		.reduce((sum, o) => sum + o.totalAmount, 0);

	if (yesterdayRevenue > 0) {
		const change = ((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100;
		const trend = change >= 0 ? "📈 Naik" : "📉 Turun";
		insights.push(
			`${trend} ${Math.abs(change).toFixed(1)}% dari kemarin (Hari ini: Rp${todayRevenue.toLocaleString("id-ID")})`
		);
	}

	return insights.length > 0
		? `== SMART INSIGHTS ==\n${insights.join("\n")}`
		: "== SMART INSIGHTS ==\nBelum cukup data untuk analisis";
}

export const yumiChat = action({
	args: {
		message: v.string(),
		history: v.array(
			v.object({
				role: v.union(v.literal("user"), v.literal("assistant")),
				content: v.string(),
			})
		),
	},
	handler: async (ctx, args) => {
		const dbContext = await gatherDatabaseContext(ctx);
		const smartContext = await gatherSmartContext(ctx);

		// Build tool definitions for OpenAI
		const openaiTools = Object.entries(tools).map(([name, tool]) => ({
			type: "function" as const,
			function: {
				name,
				description: tool.description,
				parameters: toolParametersToJsonSchema(tool.parameters),
			},
		}));

		const messages: Array<
			OpenAI.ChatCompletionMessageParam | { role: "system"; content: string }
		> = [
			{
				role: "system",
				content: `Kamu adalah Yumi, asisten AI cerdas untuk aplikasi TKM POS (Point of Sale).

KEMAMPUAN:
- Mengetahui SELURUH data database secara real-time (produk, stok, pesanan, keuangan, promosi)
- Dapat merekap dan meringkas data (harian, mingguan, bulanan)
- Dapat mengambil dan menampilkan data spesifik
- Mengetahui seluruh fitur aplikasi dan cara penggunaannya
- Memberikan saran bisnis berdasarkan data
- DAPAT MELAKUKAN AKSI: create/update/delete produk, tambah/kurang stok, buat pesanan, catat transaksi keuangan, kelola diskon, dll
- MULTI-STEP ACTIONS: Dapat melakukan beberapa langkah sekaligus dalam satu permintaan

ATURAN:
1. Jawab dalam Bahasa Indonesia yang ramah dan profesional
2. JANGAN gunakan markdown bold (**) atau heading (#). Gunakan emoji dan teks biasa
3. Berikan jawaban yang ringkas, padat, dan langsung ke poin
4. Jika ditanya data, berikan angka dan fakta spesifik dari database
5. Jika ditanya fitur, jelaskan cara penggunaan dengan singkat
6. Format angka uang dengan "Rp" dan pemisah ribuan
7. Jika user meminta aksi (tambah produk, update stok, dll), GUNAKAN TOOL yang tersedia
8. Jangan membuat asumsi nilai - jika ID diperlukan, minta user untuk menyediakannya
9. Untuk multi-step actions, gunakan beberapa tool sekaligus jika diperlukan

SMART CONTEXT:
${smartContext}

DATA REAL-TIME:
${dbContext}

INSTRUKSI MULTI-STEP ACTIONS:
- Contoh: "Buat produk kopi susu dan tambah stok bahan-bahannya" -> gunakan createProduct lalu addStock
- Contoh: "Buat pesanan dan catat sebagai pembayaran" -> gunakan createOrder lalu updateOrderStatus
- Contoh: "Diskon 20% untuk kategori minuman dan aktifkan" -> gunakan createDiscount dengan isActive:true
- Lakukan semua langkah yang diperlukan untuk menyelesaikan permintaan user dalam satu sesi

INSTRUKSI TOOL CALLING:
- Gunakan tool saat user meminta aksi spesifik seperti "tambah produk", "update stok", "buat pesanan", "catat pengeluaran"
- Setelah menjalankan tool, jelaskan hasilnya dengan ringkas kepada user
- Jika ada error dari tool, jelaskan masalahnya dan sarankan solusi
- Untuk multi-step actions, lanjutkan dengan langkah berikutnya sampai selesai`,
			},
		];

		for (const msg of args.history.slice(-10)) {
			messages.push({ role: msg.role, content: msg.content });
		}
		messages.push({ role: "user", content: args.message });

		// Multi-step tool calling loop - allows AI to chain multiple tool calls
		let maxIterations = 5;
		let currentIteration = 0;

		while (currentIteration < maxIterations) {
			currentIteration++;

			const completion = await getOpenAI().chat.completions.create({
				model: "gpt-4o-mini",
				messages,
				tools: openaiTools,
				tool_choice: currentIteration === 1 ? "auto" : "auto",
				max_tokens: 1000,
			});

			const responseMessage = completion.choices[0].message;

			// If no tool calls, return the response
			if (
				!responseMessage.tool_calls ||
				responseMessage.tool_calls.length === 0
			) {
				return responseMessage.content;
			}

			// Add assistant response with tool calls
			messages.push(responseMessage as OpenAI.ChatCompletionMessageParam);

			// Execute all tool calls in parallel
			const toolExecutionPromises = responseMessage.tool_calls
				.filter((tc) => tc.type === "function")
				.map(async (toolCall) => {
					const functionName = toolCall.function.name;
					const functionArgs = JSON.parse(toolCall.function.arguments);

					try {
						const result = await ctx.runAction(
							api.toolExecutors.executeToolCall,
							{
								toolName: functionName,
								args: functionArgs,
							}
						);

						const resultStr = result.success
							? formatToolResult(functionName, result.result)
							: formatToolResult(functionName, null, result.error);

						return {
							toolCallId: toolCall.id,
							toolName: functionName,
							result: resultStr,
						};
					} catch (error) {
						return {
							toolCallId: toolCall.id,
							toolName: functionName,
							result: formatToolResult(
								functionName,
								null,
								error instanceof Error ? error.message : String(error)
							),
						};
					}
				});

			const toolResults = await Promise.all(toolExecutionPromises);

			// Add tool results to messages
			for (const toolResult of toolResults) {
				messages.push({
					role: "tool",
					tool_call_id: toolResult.toolCallId,
					name: toolResult.toolName,
					content: toolResult.result,
				} as OpenAI.ChatCompletionToolMessageParam);
			}

			// Continue loop to get next response/action
		}

		// Fallback: return last message if max iterations reached
		const finalCompletion = await getOpenAI().chat.completions.create({
			model: "gpt-4o-mini",
			messages,
			max_tokens: 1000,
		});

		return finalCompletion.choices[0].message.content;
	},
});

/**
 * Yumi AI - Generate comprehensive company overview
 */
export const generateCompanyOverview = action({
	args: {
		financeSummary: v.string(), // { income: number, expense: number, balance: number }
		inventorySummary: v.string(), // { totalItems: number, lowStockCount: number, lowStockNames: string[] }
		ordersSummary: v.string(), // { totalOrders: number, totalSales: number }
		comparisonData: v.optional(v.string()), // { yesterday: ..., lastWeek: ... }
	},
	handler: async (_ctx, args) => {
		const completion = await getOpenAI().chat.completions.create({
			model: "gpt-4o-mini",
			messages: [
				{
					role: "system",
					content: `Kamu adalah Yumi, asisten AI bisnis.
Tujuan: Berikan analisis ringkas berdasarkan data hari ini dan perbandingannya.
Aturan:
1. JANGAN gunakan markdown bold (**). Gunakan TEKS BIASA.
2. Gunakan emoji untuk kejelasan.
3. Struktur:
   📊 [Ringkasan Utama: naik/turun dibanding kemarin/minggu lalu]
   💰 Keuangan: [Saldo & Perbandingan]
   📦 Stok: [Status & Item krusial]
   🛒 Pesanan: [Total & Tren]
   💡 Saran: [1 Aksi Spesifik]
4. Bahasa Indonesia yang profesional dan to-the-point.`,
				},
				{
					role: "user",
					content: `Data hari ini:
Keuangan: ${args.financeSummary}
Inventaris: ${args.inventorySummary}
Pesanan: ${args.ordersSummary}

Data Perbandingan:
${args.comparisonData || "Tidak ada data perbandingan tersedia."}

Berikan analisis ringkas dan perbandingannya.`,
				},
			],
		});

		return completion.choices[0].message.content;
	},
});

// ============================================
// HELPERS
// ============================================

/**
 * Convert Zod schema to JSON Schema format for OpenAI function calling
 */
function toolParametersToJsonSchema(
	zodSchema: z.ZodTypeAny
): Record<string, unknown> {
	// Get the Zod schema's shape
	const schema: Record<string, unknown> = {
		type: "object",
		properties: {} as Record<string, unknown>,
		required: [] as string[],
	};

	if ("_def" in zodSchema && "shape" in zodSchema._def) {
		const shape = zodSchema._def.shape() as Record<string, z.ZodTypeAny>;
		const properties: Record<string, unknown> = {};
		const required: string[] = [];

		for (const [key, value] of Object.entries(shape)) {
			properties[key] = zodToJsonSchema(value);
			// Check if the field is optional
			const isOptional =
				"_def" in value &&
				"typeName" in (value._def as { typeName?: string }) &&
				(value._def as { typeName?: string }).typeName === "ZodOptional";

			if (!isOptional) {
				required.push(key);
			}
		}

		schema.properties = properties;
		schema.required = required;
	}

	return schema;
}

/**
 * Convert a single Zod type to JSON Schema
 */
function zodToJsonSchema(zodType: z.ZodTypeAny): Record<string, unknown> {
	if ("_def" in zodType) {
		const def = zodType._def as { typeName?: string };

		switch (def.typeName) {
			case "ZodString":
				return { type: "string" };

			case "ZodNumber":
				return { type: "number" };

			case "ZodBoolean":
				return { type: "boolean" };

			case "ZodArray": {
				const elementType = (def as { type?: z.ZodTypeAny }).type;
				return {
					type: "array",
					items: elementType
						? zodToJsonSchema(elementType)
						: { type: "string" },
				};
			}

			case "ZodObject": {
				const shape = (def as { shape?: () => Record<string, z.ZodTypeAny> })
					.shape;
				if (shape) {
					const properties: Record<string, unknown> = {};
					const required: string[] = [];

					for (const [key, value] of Object.entries(shape())) {
						properties[key] = zodToJsonSchema(value);
						const isOptional =
							"_def" in value &&
							"typeName" in (value._def as { typeName?: string }) &&
							(value._def as { typeName?: string }).typeName === "ZodOptional";

						if (!isOptional) {
							required.push(key);
						}
					}

					return {
						type: "object",
						properties,
						required: required.length > 0 ? required : undefined,
					};
				}
				return { type: "object" };
			}

			case "ZodOptional": {
				const innerType = (def as { innerType?: z.ZodTypeAny }).innerType;
				return innerType ? zodToJsonSchema(innerType) : { type: "string" };
			}

			case "ZodEnum": {
				const values = (def as { values?: unknown[] }).values;
				return {
					type: "string",
					enum: values as string[],
				};
			}

			case "ZodLiteral": {
				const literalValue = (def as { value?: unknown }).value;
				return {
					type: typeof literalValue === "string" ? "string" : "number",
					enum: [literalValue],
				};
			}

			case "ZodUnion":
			case "ZodDiscriminatedUnion": {
				const options = (def as { options?: z.ZodTypeAny[] }).options;
				if (options && options.length > 0) {
					// For unions, we try to get the common type
					return zodToJsonSchema(options[0]);
				}
				return { type: "string" };
			}

			case "ZodDefault": {
				const innerDefaultType = (def as { innerType?: z.ZodTypeAny })
					.innerType;
				return innerDefaultType
					? zodToJsonSchema(innerDefaultType)
					: { type: "string" };
			}

			default:
				return { type: "string" };
		}
	}

	return { type: "string" };
}
