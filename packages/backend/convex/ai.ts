// @ts-nocheck
import type { GenericActionCtx } from "convex/server";
import { v } from "convex/values";
import OpenAI from "openai";
import type { z } from "zod";
import { api } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { action, query } from "./_generated/server";
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
		allTransactions,
	] = await Promise.all([
		ctx.runQuery(api.products.getAllProductsAdmin),
		ctx.runQuery(api.products.getCategories),
		ctx.runQuery(api.inventory.getInventory),
		ctx.runQuery(api.orders.getOrders, {}),
		ctx.runQuery(api.discounts.getDiscounts),
		ctx.runQuery(api.finance.getFinancialSummary, {}),
		ctx.runQuery(api.hpp.getHppDashboardData),
		ctx.runQuery(api.hpp.getOrdersCogs),
		ctx.runQuery(api.finance.getAllTransactions, {}), // Get ALL transactions with details
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

	// Format ALL transactions in detail (not summarized)
	const transactionsDetail =
		(allTransactions as Array<{
			date: number;
			type: "income" | "expense";
			amount: number;
			category: string;
			description?: string;
			paymentMethod?: string;
			status: string;
		}>)
			?.map(
				(t) =>
					`• ${new Date(t.date).toLocaleDateString("id-ID")} | ${t.type === "income" ? "PEMASUKAN" : "PENGELUARAN"} | Rp${t.amount.toLocaleString("id-ID")} | ${t.category} | ${t.description || "-"} | ${t.paymentMethod || "CASH"} | ${t.status}`
			)
			.join("\n") || "Tidak ada transaksi";

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

💰 KEUANGAN (DETAIL SEMUA TRANSAKSI):
Pendapatan: Rp${(fin?.totalIncome || 0).toLocaleString("id-ID")}
Pengeluaran: Rp${(fin?.totalExpense || 0).toLocaleString("id-ID")}
Saldo Bersih: Rp${(fin?.netBalance || 0).toLocaleString("id-ID")}
Total Transaksi: ${fin?.transactionCount || 0}

📝 RIWAYAT TRANSAKSI LENGKAP (${(allTransactions as unknown[])?.length || 0} transaksi):
${transactionsDetail}

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
				matchedOrders: number;
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
	const completedOrders = (orders as any[]).filter(
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
	const lowStockItems = (inventory as any[]).filter(
		(i) => i.quantity <= i.lowStockThreshold
	);
	if (lowStockItems.length > 0) {
		insights.push(
			`⚠️ Stok Menipis: ${lowStockItems.map((i) => `${i.ingredientName} (${i.quantity} ${i.unit})`).join(", ")}`
		);
	}

	// Products without HPP
	const productsWithHpp = await ctx.runQuery(api.hpp.getHppProductMap);
	const productsWithoutHpp = (products as any[]).filter(
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
		.filter(
			(o) => o.createdAt >= yesterday.getTime() && o.createdAt < today.getTime()
		)
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
2. JANGAN gunakan format markdown APA PUN: tidak ada bold, italic, heading, bullet points, numbering, atau code
3. Gunakan emoji untuk visual, bukan simbol markdown
4. Berikan jawaban yang ringkas, padat, dan langsung ke poin
5. Jika membuat list, gunakan emoji bullet seperti • atau emoji lain, bukan tanda minus atau asterisk
6. Jika ditanya data, berikan angka dan fakta spesifik dari database
7. Format angka uang dengan "Rp" dan pemisah ribuan
8. Jika user meminta aksi (tambah produk, update stok, dll), GUNAKAN TOOL yang tersedia
9. Jangan membuat asumsi nilai - jika ID diperlukan, minta user untuk menyediakannya

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
		const maxIterations = 5;
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

// ============================================
// AI REPORT GENERATOR
// ============================================

/**
 * Generate a comprehensive report based on user request
 */
export const generateReport = action({
	args: {
		reportType: v.union(
			v.literal("daily"),
			v.literal("weekly"),
			v.literal("monthly"),
			v.literal("custom")
		),
		dataSources: v.array(
			v.union(
				v.literal("sales"),
				v.literal("inventory"),
				v.literal("finance"),
				v.literal("orders"),
				v.literal("products"),
				v.literal("all")
			)
		),
		customPrompt: v.optional(v.string()), // Untuk custom report
		startDate: v.optional(v.number()), // Timestamp
		endDate: v.optional(v.number()), // Timestamp
	},
	handler: async (ctx, args) => {
		// Gather requested data
		const [products, inventory, orders, financialSummary, _discounts, allTransactions] =
			await Promise.all([
				ctx.runQuery(api.products.getAllProductsAdmin),
				ctx.runQuery(api.inventory.getInventory),
				ctx.runQuery(api.orders.getOrders, {}),
				ctx.runQuery(api.finance.getFinancialSummary, {}),
				ctx.runQuery(api.discounts.getDiscounts),
				ctx.runQuery(api.finance.getAllTransactions, {}), // Get ALL transactions
			]);

		const completedOrders = orders.filter(
			(o) => o.status === "completed" || o.status === "paid"
		);

		// Calculate report data
		const reportData: Record<string, unknown> = {};

		// Sales Data
		if (
			args.dataSources.includes("sales") ||
			args.dataSources.includes("all")
		) {
			const totalRevenue = completedOrders.reduce(
				(a, o) => a + o.totalAmount,
				0
			);
			const totalOrdersCount = completedOrders.length;
			const avgOrderValue =
				totalOrdersCount > 0 ? totalRevenue / totalOrdersCount : 0;

			// Product sales breakdown
			const productSales: Record<string, number> = {};
			for (const order of completedOrders) {
				for (const item of order.items) {
					productSales[item.productName] =
						(productSales[item.productName] || 0) + item.quantity;
				}
			}
			const topProducts = Object.entries(productSales)
				.sort((a, b) => b[1] - a[1])
				.slice(0, 5);

			reportData.sales = {
				totalRevenue,
				totalOrdersCount,
				avgOrderValue,
				topProducts,
			};
		}

		// Inventory Data
		if (
			args.dataSources.includes("inventory") ||
			args.dataSources.includes("all")
		) {
			const lowStockItems = inventory.filter(
				(i) => i.quantity <= i.lowStockThreshold
			);
			const _totalInventoryValue = inventory.length; // Bisa ditambahkan logika perhitungan value

			reportData.inventory = {
				totalItems: inventory.length,
				lowStockItems: lowStockItems.map((i) => ({
					name: i.ingredientName,
					current: i.quantity,
					min: i.lowStockThreshold,
					unit: i.unit,
				})),
				outOfStockItems: inventory.filter((i) => i.quantity === 0).length,
			};
		}

		// Finance Data
		if (
			args.dataSources.includes("finance") ||
			args.dataSources.includes("all")
		) {
			const fin = financialSummary as {
				totalIncome: number;
				totalExpense: number;
				netBalance: number;
				transactionCount: number;
			};

			// Include ALL transactions in detail (not summarized)
			const transactionsList = (allTransactions as Array<{
				_id: string;
				date: number;
				type: "income" | "expense";
				amount: number;
				category: string;
				description?: string;
				paymentMethod?: string;
				status: string;
			}>).map((t) => ({
				id: t._id,
				date: new Date(t.date).toLocaleDateString("id-ID"),
				type: t.type,
				amount: t.amount,
				category: t.category,
				description: t.description || "-",
				paymentMethod: t.paymentMethod || "CASH",
				status: t.status,
			}));

			reportData.finance = {
				totalIncome: fin.totalIncome,
				totalExpense: fin.totalExpense,
				netBalance: fin.netBalance,
				transactionCount: fin.transactionCount,
				transactions: transactionsList, // ALL transactions in detail
				profitMargin:
					fin.totalIncome > 0
						? ((fin.totalIncome - fin.totalExpense) / fin.totalIncome) * 100
						: 0,
			};
		}

		// Orders Data
		if (
			args.dataSources.includes("orders") ||
			args.dataSources.includes("all")
		) {
			const today = new Date();
			today.setHours(0, 0, 0, 0);
			const todayOrders = orders.filter((o) => o.createdAt >= today.getTime());

			reportData.orders = {
				totalOrders: orders.length,
				completedOrders: completedOrders.length,
				pendingOrders: orders.filter((o) => o.status === "pending").length,
				todayOrders: todayOrders.length,
			};
		}

		// Products Data
		if (
			args.dataSources.includes("products") ||
			args.dataSources.includes("all")
		) {
			const activeProducts = products.filter((p) => p.isAvailable);
			const inactiveProducts = products.filter((p) => !p.isAvailable);

			reportData.products = {
				totalProducts: products.length,
				activeProducts: activeProducts.length,
				inactiveProducts: inactiveProducts.length,
				categories: [...new Set(products.map((p) => p.categoryId))].length,
			};
		}

		// Generate report based on report type
		let prompt = "";

		if (args.customPrompt) {
			prompt = args.customPrompt;
		} else {
			switch (args.reportType) {
				case "daily":
					prompt =
						"Buat laporan harian yang mencakup: ringkasan penjualan, stok kritis, dan rekomendasi tindakan untuk hari ini.";
					break;
				case "weekly":
					prompt =
						"Buat laporan mingguan dengan: analisis tren penjualan, produk terlaris, dan saran optimalisasi untuk minggu ini.";
					break;
				case "monthly":
					prompt =
						"Buat laporan bulanan lengkap: performa penjualan, analisis keuangan, rekomendasi stok, dan strategi bulan depan.";
					break;
				default:
					prompt = "Buat laporan komprehensif dari data yang tersedia.";
			}
		}

		// Add data context to prompt
		prompt += `\n\nDATA YANG TERSEDIA:\n${JSON.stringify(reportData, null, 2)}`;

		const completion = await getOpenAI().chat.completions.create({
			model: "gpt-4o-mini",
			messages: [
				{
					role: "system",
					content:
						"Kamu adalah analis bisnis yang ahli. Buat laporan yang jelas, terstruktur, dan actionable. Gunakan Bahasa Indonesia. Format dengan bullet points dan emoji.",
				},
				{ role: "user", content: prompt },
			],
		});

		return completion.choices[0].message.content;
	},
});

// ============================================
// PROACTIVE SUGGESTIONS
// ============================================

interface ProactiveSuggestion {
	id: string;
	type:
		| "low_stock"
		| "high_stock"
		| "pending_order"
		| "trending"
		| "discount_opp"
		| "price_opt";
	title: string;
	description: string;
	action: {
		toolName: string;
		args: Record<string, unknown>;
	} | null;
	priority: "high" | "medium" | "low";
	createdAt: number;
}

/**
 * Get proactive suggestions based on current business state
 */
export const getProactiveSuggestions = query({
	args: {},
	handler: async (ctx) => {
		const suggestions: ProactiveSuggestion[] = [];
		const now = Date.now();

		// Check 1: Low Stock Alerts
		const inventory = await ctx.runQuery(api.inventory.getInventory);
		const lowStockItems = inventory.filter(
			(i) => i.quantity <= i.lowStockThreshold
		);

		for (const item of lowStockItems) {
			const percentage = Math.floor(
				(item.quantity / item.lowStockThreshold) * 100
			);
			suggestions.push({
				id: `low_stock_${item._id}`,
				type: "low_stock",
				title: `Stok ${item.ingredientName} menipis!`,
				description: `Sisa ${item.quantity} ${item.unit} (${percentage}% dari threshold). Segera restock.`,
				action: {
					toolName: "addStock",
					args: {
						inventoryId: item._id,
						quantity: item.lowStockThreshold * 2 - item.quantity, // Restock to 2x threshold
						notes: "Auto-restock dari AI suggestion",
					},
				},
				priority: percentage < 20 ? "high" : "medium",
				createdAt: now,
			});
		}

		// Check 2: Pending Orders
		const orders = await ctx.runQuery(api.orders.getOrders, {});
		const pendingOrders = orders.filter((o) => o.status === "pending");

		if (pendingOrders.length > 0) {
			suggestions.push({
				id: "pending_orders_bulk",
				type: "pending_order",
				title: `${pendingOrders.length} pesanan menunggu diproses`,
				description:
					pendingOrders.length === 1
						? `Pesanan #${pendingOrders[0].orderNumber} menunggu pembayaran.`
						: `Ada ${pendingOrders.length} pesanan perlu diproses.`,
				action: null,
				priority: pendingOrders.length > 3 ? "high" : "medium",
				createdAt: now,
			});
		}

		// Check 3: Trending Products (based on recent completed orders)
		const completedOrders = orders.filter(
			(o) => o.status === "completed" || o.status === "paid"
		);
		if (completedOrders.length >= 10) {
			// Get last 7 days orders
			const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
			const recentOrders = completedOrders.filter(
				(o) => o.createdAt >= sevenDaysAgo
			);

			const productSales: Record<string, number> = {};
			for (const order of recentOrders) {
				for (const item of order.items) {
					productSales[item.productName] =
						(productSales[item.productName] || 0) + item.quantity;
				}
			}

			// Find trending products
			const sortedProducts = Object.entries(productSales)
				.sort((a, b) => b[1] - a[1])
				.slice(0, 3);

			if (sortedProducts.length > 0) {
				const topProduct = sortedProducts[0];
				suggestions.push({
					id: `trending_${topProduct[0]}`,
					type: "trending",
					title: `Produk trending: ${topProduct[0]}`,
					description: `${topProduct[0]} terjual ${topProduct[1]} kali minggu ini. Pertimbangkan untuk tambah stok.`,
					action: {
						toolName: "addStock",
						args: { inventoryId: "", quantity: 0, notes: "" }, // Placeholder
					},
					priority: "medium",
					createdAt: now,
				});
			}
		}

		// Check 4: Discount Opportunities (slow-moving products)
		const products = await ctx.runQuery(api.products.getAllProductsAdmin);
		const activeProducts = products.filter((p) => p.isAvailable);

		if (activeProducts.length >= 5) {
			// Get products without recent sales in last 7 days
			const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
			const recentOrders = orders.filter((o) => o.createdAt >= sevenDaysAgo);

			const soldProductIds = new Set();
			for (const order of recentOrders) {
				for (const item of order.items) {
					soldProductIds.add(item.productId);
				}
			}

			// Slow moving products (available but not sold recently)
			const slowMovingProducts = activeProducts.filter(
				(p) => !soldProductIds.has(p._id)
			);

			if (slowMovingProducts.length > 0) {
				suggestions.push({
					id: "discount_opp_bulk",
					type: "discount_opp",
					title: "Peluang diskon untuk produk kurang laku",
					description: `${slowMovingProducts
						.map((p) => p.name)
						.slice(0, 3)
						.join(", ")} belum terjual minggu ini. Pertimbangkan diskon.`,
					action: {
						toolName: "createDiscount",
						args: {
							name: "Diskon Produk Kurang Laku",
							type: "PERCENTAGE",
							value: 20,
							targetType: "PRODUCT",
							targetIds: slowMovingProducts.map((p) => p._id),
							isActive: true,
						},
					},
					priority: "medium",
					createdAt: now,
				});
			}
		}

		// Check 5: Price Optimization opportunities
		if (completedOrders.length >= 5) {
			// Analyze which products have good sales but could be priced higher
			const productSales: Record<
				string,
				{ quantity: number; revenue: number }
			> = {};
			const productPrices: Record<string, number> = {};

			for (const order of completedOrders) {
				for (const item of order.items) {
					if (!productSales[item.productName]) {
						productSales[item.productName] = {
							quantity: 0,
							revenue: 0,
						};
					}
					productSales[item.productName].quantity += item.quantity;
					productSales[item.productName].revenue += item.price * item.quantity;
					productPrices[item.productName] = item.price;
				}
			}

			// Find products with good sales but low margin potential
			for (const [productName, data] of Object.entries(productSales)) {
				const avgPrice = data.quantity > 0 ? data.revenue / data.quantity : 0;
				const currentPrice = productPrices[productName] ?? 0;

				// If selling well but price is low compared to market
				if (data.quantity >= 3 && avgPrice > currentPrice * 1.2) {
					suggestions.push({
						id: `price_opt_${productName}`,
						type: "price_opt",
						title: `Peluang optimasi harga: ${productName}`,
						description: `Harga jual rata-rata Rp${Math.round(
							avgPrice
						)}, tapi harga saat ini Rp${currentPrice}. Pertimbangkan kenaikan harga.`,
						action: null,
						priority: "low",
						createdAt: now,
					});
				}
			}
		}

		// Sort suggestions by priority
		const priorityOrder = { high: 0, medium: 1, low: 2 };
		suggestions.sort((a, b) => {
			const priorityA = priorityOrder[a.priority] ?? 1;
			const priorityB = priorityOrder[b.priority] ?? 1;
			if (priorityA !== priorityB) {
				return priorityA - priorityB;
			}
			return b.createdAt - a.createdAt;
		});

		return suggestions.slice(0, 10); // Return top 10 suggestions
	},
});

// ============================================
// PREDICTIVE ANALYTICS
// ============================================

/**
 * Predict stock-out risk for inventory items
 */
export const predictStockOut = query({
	args: {
		daysAhead: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const daysAhead = args.daysAhead || 7;
		const inventory = await ctx.runQuery(api.inventory.getInventory);
		const orders = await ctx.runQuery(api.orders.getOrders, {});

		const completedOrders = orders.filter(
			(o) => o.status === "completed" || o.status === "paid"
		);

		// Calculate daily usage for each inventory item
		const itemUsage: Record<string, number> = {};
		const daysToAnalyze = 30; // Analyze last 30 days
		const cutoffDate = Date.now() - daysToAnalyze * 24 * 60 * 60 * 1000;

		for (const order of completedOrders) {
			if (order.createdAt < cutoffDate) continue;

			for (const item of order.items) {
				// This is a simplified calculation
				const productName = item.productName;
				itemUsage[productName] = (itemUsage[productName] || 0) + item.quantity;
			}
		}

		// Predict which items will run out
		const predictions = inventory
			.map((item) => {
				const dailyUsage = (itemUsage[item.ingredientName] || 0) / daysToAnalyze;
				const daysUntilEmpty =
					dailyUsage > 0 ? Math.floor(item.quantity / dailyUsage) : 999;

				return {
					ingredientName: item.ingredientName,
					currentStock: item.quantity,
					unit: item.unit,
					dailyUsage: Math.round(dailyUsage * 100) / 100,
					daysUntilEmpty,
					risk:
						daysUntilEmpty <= 3
							? ("high" as const)
							: daysUntilEmpty <= daysAhead
								? ("medium" as const)
								: ("low" as const),
					recommendedOrder:
						dailyUsage > 0 ? Math.ceil(dailyUsage * daysAhead * 1.5) : 0,
				};
			})
			.filter((p) => p.risk !== "low")
			.sort((a, b) => a.daysUntilEmpty - b.daysUntilEmpty);

		return predictions;
	},
});

/**
 * Predict busy hours based on order history
 */
export const predictBusyHours = query({
	args: {},
	handler: async (ctx) => {
		const orders = await ctx.runQuery(api.orders.getOrders, {});
		const completedOrders = orders.filter(
			(o) => o.status === "completed" || o.status === "paid"
		);

		// Analyze orders by hour and day of week
		const hourlyData: Record<number, number> = {};
		const dailyData: Record<number, number> = {};

		for (const order of completedOrders) {
			const date = new Date(order.createdAt);
			const hour = date.getHours();
			const day = date.getDay();

			hourlyData[hour] = (hourlyData[hour] || 0) + 1;
			dailyData[day] = (dailyData[day] || 0) + 1;
		}

		// Find peak hours
		const hourlyAnalysis = Object.entries(hourlyData)
			.map(([hour, count]) => ({
				hour: Number.parseInt(hour, 10),
				orderCount: count,
				percentage: Math.round((count / completedOrders.length) * 100),
			}))
			.sort((a, b) => b.orderCount - a.orderCount)
			.slice(0, 5);

		// Find peak days
		const dayNames = [
			"Minggu",
			"Senin",
			"Selasa",
			"Rabu",
			"Kamis",
			"Jumat",
			"Sabtu",
		];
		const dailyAnalysis = Object.entries(dailyData)
			.map(([day, count]) => ({
				day: Number.parseInt(day, 10),
				dayName: dayNames[Number.parseInt(day, 10)],
				orderCount: count,
				percentage: Math.round((count / completedOrders.length) * 100),
			}))
			.sort((a, b) => b.orderCount - a.orderCount);

		return {
			totalOrders: completedOrders.length,
			peakHours: hourlyAnalysis,
			peakDays: dailyAnalysis,
		};
	},
});

/**
 * Predict daily revenue based on historical data
 */
export const predictDailyRevenue = query({
	args: {
		daysAhead: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const daysAhead = args.daysAhead || 7;
		const orders = await ctx.runQuery(api.orders.getOrders, {});
		const completedOrders = orders.filter(
			(o) => o.status === "completed" || o.status === "paid"
		);

		// Calculate daily revenue for the past 30 days
		const dailyRevenue: Record<string, number> = {};
		const daysToAnalyze = 30;
		const cutoffDate = Date.now() - daysToAnalyze * 24 * 60 * 60 * 1000;

		for (const order of completedOrders) {
			if (order.createdAt < cutoffDate) continue;

			const dateKey = new Date(order.createdAt).toISOString().split("T")[0];
			dailyRevenue[dateKey] = (dailyRevenue[dateKey] || 0) + order.totalAmount;
		}

		const dailyValues = Object.values(dailyRevenue);
		const avgDailyRevenue =
			dailyValues.length > 0
				? dailyValues.reduce((sum, val) => sum + val, 0) / dailyValues.length
				: 0;

		// Calculate trend
		const sortedDates = Object.keys(dailyRevenue).sort();
		const firstHalf = sortedDates.slice(0, Math.floor(sortedDates.length / 2));
		const secondHalf = sortedDates.slice(Math.floor(sortedDates.length / 2));

		const firstHalfAvg =
			firstHalf.length > 0
				? firstHalf.reduce((sum, date) => sum + dailyRevenue[date], 0) /
					firstHalf.length
				: 0;
		const secondHalfAvg =
			secondHalf.length > 0
				? secondHalf.reduce((sum, date) => sum + dailyRevenue[date], 0) /
					secondHalf.length
				: 0;

		const trend =
			secondHalfAvg > firstHalfAvg * 1.05
				? "increasing"
				: secondHalfAvg < firstHalfAvg * 0.95
					? "decreasing"
					: "stable";

		// Predict next week
		const predictions = [];
		const dayNames = [
			"Minggu",
			"Senin",
			"Selasa",
			"Rabu",
			"Kamis",
			"Jumat",
			"Sabtu",
		];
		const today = new Date();

		for (let i = 1; i <= daysAhead; i++) {
			const futureDate = new Date(today);
			futureDate.setDate(today.getDate() + i);
			const dayName = dayNames[futureDate.getDay()];
			const dateKey = futureDate.toISOString().split("T")[0];

			// Adjust prediction based on trend
			let predictedAmount = avgDailyRevenue;
			if (trend === "increasing") {
				predictedAmount *= 1.05;
			} else if (trend === "decreasing") {
				predictedAmount *= 0.95;
			}

			// Weekend adjustment
			const dayOfWeek = futureDate.getDay();
			if (dayOfWeek === 0 || dayOfWeek === 6) {
				predictedAmount *= 1.2;
			}

			predictions.push({
				date: dateKey,
				dayName,
				predictedRevenue: Math.round(predictedAmount),
				confidence:
					dailyValues.length > 20
						? "high"
						: dailyValues.length > 10
							? "medium"
							: "low",
			});
		}

		return {
			currentAvgDaily: Math.round(avgDailyRevenue),
			trend,
			predictions,
			totalAnalyzedDays: dailyValues.length,
		};
	},
});
