import type { GenericActionCtx } from "convex/server";
import { v } from "convex/values";
import OpenAI from "openai";
import { z } from "zod";
import { api } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { action } from "./_generated/server";
import { tools, formatToolResult } from "./tools";

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
			| OpenAI.ChatCompletionMessageParam
			| { role: "system"; content: string }
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

ATURAN:
1. Jawab dalam Bahasa Indonesia yang ramah dan profesional
2. JANGAN gunakan markdown bold (**) atau heading (#). Gunakan emoji dan teks biasa
3. Berikan jawaban yang ringkas, padat, dan langsung ke poin
4. Jika ditanya data, berikan angka dan fakta spesifik dari database
5. Jika ditanya fitur, jelaskan cara penggunaan dengan singkat
6. Format angka uang dengan "Rp" dan pemisah ribuan
7. Jika user meminta aksi (tambah produk, update stok, dll), GUNAKAN TOOL yang tersedia
8. Jangan membuat asumsi nilai - jika ID diperlukan, minta user untuk menyediakannya

DATA REAL-TIME:
${dbContext}

INSTRUKSI TOOL CALLING:
- Gunakan tool saat user meminta aksi spesifik seperti "tambah produk", "update stok", "buat pesanan", "catat pengeluaran"
- Setelah menjalankan tool, jelaskan hasilnya dengan ringkas kepada user
- Jika ada error dari tool, jelaskan masalahnya dan sarankan solusi`,
			},
		];

		for (const msg of args.history.slice(-10)) {
			messages.push({ role: msg.role, content: msg.content });
		}
		messages.push({ role: "user", content: args.message });

		// First API call
		let completion = await getOpenAI().chat.completions.create({
			model: "gpt-4o-mini",
			messages,
			tools: openaiTools,
			tool_choice: "auto",
			max_tokens: 1000,
		});

		let responseMessage = completion.choices[0].message;
		let toolResults: Array<{
			toolCallId: string;
			toolName: string;
			result: string;
		}> = [];

		// Handle tool calls
		if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
			// Execute each tool call
			for (const toolCall of responseMessage.tool_calls) {
				// Type guard for function calls
				if (toolCall.type !== "function") continue;

				const functionName = toolCall.function.name;
				const functionArgs = JSON.parse(toolCall.function.arguments);

				try {
					const result = await ctx.runAction(api.toolExecutors.executeToolCall, {
						toolName: functionName,
						args: functionArgs,
					});

					const resultStr = result.success
						? formatToolResult(functionName, result.result)
						: formatToolResult(functionName, null, result.error);

					toolResults.push({
						toolCallId: toolCall.id,
						toolName: functionName,
						result: resultStr,
					});
				} catch (error) {
					toolResults.push({
						toolCallId: toolCall.id,
						toolName: functionName,
						result: formatToolResult(
							functionName,
							null,
							error instanceof Error ? error.message : String(error)
						),
					});
				}
			}

			// Add assistant response with tool calls
			messages.push(responseMessage as OpenAI.ChatCompletionMessageParam);

			// Add tool results
			for (const toolResult of toolResults) {
				messages.push({
					role: "tool",
					tool_call_id: toolResult.toolCallId,
					name: toolResult.toolName,
					content: toolResult.result,
				} as OpenAI.ChatCompletionToolMessageParam);
			}

			// Get final response
			const secondCompletion = await getOpenAI().chat.completions.create({
				model: "gpt-4o-mini",
				messages,
				max_tokens: 1000,
			});

			return secondCompletion.choices[0].message.content;
		}

		return responseMessage.content;
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
					items: elementType ? zodToJsonSchema(elementType) : { type: "string" },
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
							(value._def as { typeName?: string }).typeName ===
								"ZodOptional";

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

			case "ZodOptional":
				const innerType = (def as { innerType?: z.ZodTypeAny }).innerType;
				return innerType ? zodToJsonSchema(innerType) : { type: "string" };

			case "ZodEnum":
				const values = (def as { values?: unknown[] }).values;
				return {
					type: "string",
					enum: values as string[],
				};

			case "ZodLiteral":
				const literalValue = (def as { value?: unknown }).value;
				return {
					type: typeof literalValue === "string" ? "string" : "number",
					enum: [literalValue],
				};

			case "ZodUnion":
			case "ZodDiscriminatedUnion":
				const options = (def as { options?: z.ZodTypeAny[] }).options;
				if (options && options.length > 0) {
					// For unions, we try to get the common type
					return zodToJsonSchema(options[0]);
				}
				return { type: "string" };

			case "ZodDefault":
				const innerDefaultType = (def as { innerType?: z.ZodTypeAny })
					.innerType;
				return innerDefaultType ? zodToJsonSchema(innerDefaultType) : { type: "string" };

			default:
				return { type: "string" };
		}
	}

	return { type: "string" };
}
