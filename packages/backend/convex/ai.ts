// @ts-nocheck
import { GenericActionCtx } from "convex/server";
import { ConvexError, v } from "convex/values";
import OpenAI from "openai";
import type { z } from "zod";
import { api } from "./_generated/api";
import type { DataModel, Id } from "./_generated/dataModel";
import { action, mutation, query } from "./_generated/server";
import { formatToolResult, tools } from "./tools";

// Helper to initialize OpenAI/SumoPod lazily (untuk Chat & text generation)
const getOpenAI = () => {
	const apiKey = process.env.SUMOPOD_API_KEY || process.env.OPENAI_API_KEY;
	const baseURL = process.env.OPENAI_BASE_URL || "https://ai.sumopod.com/v1";

	if (!apiKey) {
		throw new ConvexError("Missing SUMOPOD_API_KEY atau OPENAI_API_KEY. Silakan atur di dashboard Convex.");
	}
	return new OpenAI({
		apiKey,
		baseURL,
	});
};

/**
 * Menghilangkan karakter aneh (encoding artifacts seperti â€¢, â€™, dll) 
 * yang sering muncul dari output AI karena masalah encoding UTF-8/ISO.
 */
function sanitizeAIString(str: string): string {
	if (!str) return "";
	
	// Map karakter aneh yang umum ke karakter yang benar atau hapus
	return str
		.replace(/â€¢/g, "•")
		.replace(/â€™/g, "'")
		.replace(/â€/g, '"')
		.replace(/â€“/g, "–")
		.replace(/â€”/g, "—")
		.replace(/â€¦/g, "…")
		.replace(/â€˜/g, "'")
		.replace(/â€œ/g, '"')
		.replace(/â€\?/g, '"')
		.replace(/Â/g, "")
		.replace(/\ufffd/g, "") // Karakter pengganti jika data rusak
		.trim();
}

// Safe wrapper untuk panggil SumoPod/OpenAI - mengembalikan pesan error yang user-friendly
async function safeSumoPodCall(
	messages: Array<{ role: string; content: string }>,
	options?: { maxTokens?: number; model?: string }
): Promise<string> {
	try {
		const openai = getOpenAI();
		const completion = await openai.chat.completions.create({
			model: options?.model || "gpt-4o",
			messages: messages as Array<OpenAI.ChatCompletionMessageParam>,
			max_tokens: options?.maxTokens,
		});
		const content = completion.choices[0]?.message?.content || "";
		return sanitizeAIString(content);
	} catch (error) {
		console.error("safeSumoPodCall error:", error);
		const errMsg = error instanceof Error ? error.message : String(error);
		if (errMsg.includes("Missing SUMOPOD_API_KEY") || errMsg.includes("Missing OPENAI_API_KEY")) {
			throw new ConvexError("SUMOPOD_API_KEY belum diatur. Silakan atur di dashboard Convex.");
		}
		if (errMsg.includes("401") || errMsg.includes("Unauthorized")) {
			throw new ConvexError("API key tidak valid. Periksa SUMOPOD_API_KEY di dashboard Convex.");
		}
		if (errMsg.includes("429")) {
			throw new ConvexError("Batas penggunaan API tercapai. Coba lagi nanti.");
		}
		throw new ConvexError(`Gagal menghubungi AI: ${errMsg.slice(0, 150)}`);
	}
}

// Helper untuk panggil Vision API (seed-2.0-pro-free by ByteDance) melalui SumoPod AI (untuk scan gambar/OCR)
async function callVisionAPI(
	prompt: string,
	base64Data: string,
	mimeType: string,
	options?: { temperature?: number; maxOutputTokens?: number }
): Promise<{ success: boolean; text: string; error?: string }> {
	try {
		const openai = getOpenAI();
		
		const completion = await openai.chat.completions.create({
			model: "seed-2-0-pro-free",
			messages: [
				{
					role: "system",
					content: "You are an expert OCR and visual document analyzer. Analyze the provided image and extract data in JSON format."
				},
				{
					role: "user",
					content: [
						{ type: "text", text: prompt },
						{
							type: "image_url",
							image_url: {
								url: `data:${mimeType};base64,${base64Data}`
							}
						}
					] as any
				}
			],
			temperature: options?.temperature ?? 0.1,
			max_tokens: options?.maxOutputTokens ?? 4096,
		});

		const text = completion.choices[0]?.message?.content || "";
		if (text) {
			return { success: true, text: sanitizeAIString(text) };
		}
		return { success: false, text: "", error: "Model memberikan respon kosong" };
	} catch (error) {
		const errMsg = error instanceof Error ? error.message : String(error);
		console.error("callVisionAPI error:", errMsg);
		return { 
			success: false, 
			text: "", 
			error: `Gagal menganalisis gambar: ${errMsg}` 
		};
	}
}

function extractImagePayload(image: string) {
	let base64Data = "";
	let mimeType = "image/jpeg";

	if (image.startsWith("data:")) {
		const dataUrlMatch = image.match(
			/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/
		);
		if (!dataUrlMatch) {
			throw new ConvexError(
				"Format gambar tidak valid. Silakan upload ulang gambar."
			);
		}
		mimeType = dataUrlMatch[1];
		base64Data = dataUrlMatch[2] || "";
	} else {
		base64Data = image;
	}

	if (!base64Data || base64Data.length < 50) {
		throw new ConvexError(
			"Data base64 gambar tidak valid. Silakan upload ulang gambar."
		);
	}

	return { base64Data, mimeType };
}

async function callVisionTextAPI(
	prompt: string,
	base64Data: string,
	mimeType: string,
	options?: { temperature?: number; maxOutputTokens?: number }
): Promise<{ success: boolean; text: string; error?: string }> {
	try {
		const openai = getOpenAI();
		const completion = await openai.chat.completions.create({
			model: "seed-2-0-pro-free",
			messages: [
				{
					role: "system",
					content:
						"Kamu adalah analis visual yang teliti. Jawab dalam Bahasa Indonesia yang ringkas, jelas, dan langsung ke inti temuan tanpa markdown dekoratif.",
				},
				{
					role: "user",
					content: [
						{ type: "text", text: prompt },
						{
							type: "image_url",
							image_url: {
								url: `data:${mimeType};base64,${base64Data}`,
							},
						},
					] as any,
				},
			],
			temperature: options?.temperature ?? 0.2,
			max_tokens: options?.maxOutputTokens ?? 1800,
		});

		const text = completion.choices[0]?.message?.content || "";
		if (!text) {
			return {
				success: false,
				text: "",
				error: "Model tidak mengembalikan analisis gambar.",
			};
		}

		return { success: true, text: sanitizeAIString(text) };
	} catch (error) {
		const errMsg = error instanceof Error ? error.message : String(error);
		console.error("callVisionTextAPI error:", errMsg);
		return {
			success: false,
			text: "",
			error: `Gagal menganalisis lampiran gambar: ${errMsg}`,
		};
	}
}

async function fallbackAnalyzeChatImages(args: {
	images: string[];
	message: string;
	contextHint?: string;
}) {
	const analyses: string[] = [];

	for (const [index, image] of args.images.slice(0, 3).entries()) {
		try {
			const { base64Data, mimeType } = extractImagePayload(image);
			const visionResult = await callVisionTextAPI(
				`Pengguna meminta: "${args.message || "Tolong analisis gambar yang saya lampirkan."}".
${args.contextHint ? `Konteks tambahan: ${args.contextHint}` : ""}

Instruksi:
- Jika ini struk, invoice, mutasi, atau dokumen keuangan, ringkas data penting yang terbaca: merchant, tanggal, total, metode pembayaran, item penting, dan kategori transaksi.
- Jika ini foto toko, produk, rak, atau area operasional, lakukan audit visual singkat: kondisi utama, masalah yang terlihat, dan saran praktis.
- Jika gambar kurang jelas, jelaskan bagian mana yang tidak terbaca.
- Tutup dengan 2 saran tindak lanjut singkat.`,
				base64Data,
				mimeType,
				{ maxOutputTokens: 1400 }
			);

			if (visionResult.success && visionResult.text) {
				analyses.push(
					args.images.length > 1
						? `Lampiran ${index + 1}:\n${visionResult.text}`
						: visionResult.text
				);
			}
		} catch (error) {
			console.error("fallbackAnalyzeChatImages payload error:", error);
		}
	}

	if (analyses.length === 0) {
		return null;
	}

	if (analyses.length === 1) {
		return analyses[0];
	}

	try {
		return await safeSumoPodCall(
			[
				{
					role: "system",
					content:
						"Kamu adalah Yumi AI. Gabungkan beberapa hasil analisis gambar menjadi satu jawaban Bahasa Indonesia yang ringkas, jelas, dan mudah ditindaklanjuti.",
				},
				{
					role: "user",
					content: `Pertanyaan user: ${args.message || "Tolong analisis semua lampiran gambar ini."}\n\nHasil analisis per lampiran:\n${analyses.join("\n\n")}`,
				},
			],
			{ maxTokens: 1200, model: "gpt-4o-mini" }
		);
	} catch (error) {
		console.error("fallbackAnalyzeChatImages synthesis error:", error);
		return analyses.join("\n\n");
	}
}

/**
 * Robust JSON parsing from AI response
 */
function parseAIScanJSON(content: string): any {
	try {
		// Remove markdown blocks
		const cleaned = content
			.replace(/```json\s*/g, "")
			.replace(/```\s*/g, "")
			.trim();

		// Find the block starting with { and ending with }
		const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
		if (!jsonMatch) return null;

		const parsed = JSON.parse(jsonMatch[0]);

		// Sanitize all string values in the parsed object
		const deepSanitize = (obj: any): any => {
			if (typeof obj === 'string') return sanitizeAIString(obj);
			if (Array.isArray(obj)) return obj.map(deepSanitize);
			if (obj !== null && typeof obj === 'object') {
				const newObj: any = {};
				for (const key in obj) {
					newObj[key] = deepSanitize(obj[key]);
				}
				return newObj;
			}
			return obj;
		};

		const sanitizedParsed = deepSanitize(parsed);

		// Sanitize numeric fields common in scans
		const sanitizeNum = (v: any) => {
			if (typeof v === 'number') return v;
			if (typeof v === 'string') {
				const n = Number(v.replace(/[^0-9.-]/g, ""));
				return isNaN(n) ? 0 : n;
			}
			return 0;
		};

		if (sanitizedParsed.data) {
			if (sanitizedParsed.data.amount) sanitizedParsed.data.amount = sanitizeNum(sanitizedParsed.data.amount);
			if (sanitizedParsed.data.total) sanitizedParsed.data.total = sanitizeNum(sanitizedParsed.data.total);
			if (Array.isArray(sanitizedParsed.data.items)) {
				sanitizedParsed.data.items = sanitizedParsed.data.items.map((item: any) => ({
					...item,
					qty: sanitizeNum(item.qty) || 1,
					price: sanitizeNum(item.price || item.unitPrice),
					total: sanitizeNum(item.total || item.subtotal),
				}));
			}
		}

		// Top level fields (for scanImageData style)
		const fields = ['total', 'subtotal', 'tax', 'serviceCharge', 'discount', 'confidence'];
		fields.forEach(f => {
			if (sanitizedParsed[f] !== undefined) sanitizedParsed[f] = sanitizeNum(sanitizedParsed[f]);
		});

		if (Array.isArray(sanitizedParsed.items)) {
			sanitizedParsed.items = sanitizedParsed.items.map((item: any) => ({
				...item,
				qty: sanitizeNum(item.qty) || 1,
				price: sanitizeNum(item.price),
				subtotal: sanitizeNum(item.subtotal),
			}));
		}

		return sanitizedParsed;
	} catch (e) {
		console.error("parseAIScanJSON error:", e, "Content start:", content.slice(0, 100));
		return null;
	}
}

function normalizeSearchText(text: string): string {
	return sanitizeAIString(text)
		.toLowerCase()
		.replace(/[^a-z0-9\s]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function normalizeUnitLabel(unit?: string): string {
	const normalized = normalizeSearchText(unit || "");
	const aliases: Record<string, string> = {
		g: "gram",
		gr: "gram",
		gram: "gram",
		kg: "kg",
		kilo: "kg",
		kilogram: "kg",
		l: "liter",
		lt: "liter",
		liter: "liter",
		litre: "liter",
		ml: "ml",
		milliliter: "ml",
		mililiter: "ml",
		pc: "pcs",
		pcs: "pcs",
		piece: "pcs",
		biji: "pcs",
		butir: "pcs",
		botol: "bottle",
		bottle: "bottle",
		bungkus: "pack",
		pack: "pack",
		sachet: "pack",
		sak: "pack",
		box: "box",
		dus: "box",
		lusin: "dozen",
		dozen: "dozen",
	};
	return aliases[normalized] || normalized;
}

function scoreNameMatch(left: string, right: string): number {
	const normalizedLeft = normalizeSearchText(left);
	const normalizedRight = normalizeSearchText(right);
	if (!normalizedLeft || !normalizedRight) {
		return 0;
	}
	if (normalizedLeft === normalizedRight) {
		return 1;
	}
	if (
		normalizedLeft.length >= 4 &&
		(normalizedLeft.includes(normalizedRight) ||
			normalizedRight.includes(normalizedLeft))
	) {
		return 0.92;
	}

	const leftTokens = new Set(normalizedLeft.split(" ").filter(Boolean));
	const rightTokens = new Set(normalizedRight.split(" ").filter(Boolean));
	if (leftTokens.size === 0 || rightTokens.size === 0) {
		return 0;
	}

	const overlap = [...leftTokens].filter((token) => rightTokens.has(token)).length;
	return overlap / Math.max(leftTokens.size, rightTokens.size);
}

function convertListedCostToBaseUnit(args: {
	listedUnitCost: number;
	listedUnit?: string;
	inventoryItem: {
		unit: string;
		displayUnit?: string;
		conversionFactor?: number;
	};
}): number {
	const { listedUnitCost, listedUnit, inventoryItem } = args;
	if (!(listedUnitCost > 0)) {
		return 0;
	}

	const normalizedListed = normalizeUnitLabel(listedUnit);
	const normalizedBase = normalizeUnitLabel(inventoryItem.unit);
	const normalizedDisplay = normalizeUnitLabel(inventoryItem.displayUnit);
	const factor = inventoryItem.conversionFactor || 1;

	if (!normalizedListed || normalizedListed === normalizedBase) {
		return listedUnitCost;
	}

	if (normalizedDisplay && normalizedListed === normalizedDisplay && factor > 0) {
		return listedUnitCost / factor;
	}

	if (normalizedListed === "kg" && normalizedBase === "gram") {
		return listedUnitCost / 1000;
	}
	if (normalizedListed === "liter" && normalizedBase === "ml") {
		return listedUnitCost / 1000;
	}
	if (normalizedListed === "dozen" && normalizedBase === "pcs") {
		return listedUnitCost / 12;
	}

	return listedUnitCost;
}

function normalizeScanItems(items: any[] | undefined) {
	return (items || [])
		.map((item) => {
			const quantity = Number(item?.quantity ?? item?.qty) || 1;
			const price = Number(item?.price ?? item?.unitPrice) || undefined;
			const total = Number(item?.total ?? item?.subtotal) || undefined;
			return {
				name: sanitizeAIString(item?.name || item?.item || ""),
				quantity,
				price,
				total,
				unit: sanitizeAIString(item?.unit || ""),
			};
		})
		.filter((item) => item.name);
}

function buildHeuristicInventoryCostSuggestions(context: any) {
	const suggestions = [];

	for (const inventoryItem of context.inventoryItems || []) {
		let bestMatch: any = null;

		for (const transaction of context.transactions || []) {
			for (const scanItem of normalizeScanItems(transaction.scanItems)) {
				const score = scoreNameMatch(inventoryItem.ingredientName, scanItem.name);
				if (score < 0.72) {
					continue;
				}

				const quantity = Number(scanItem.quantity) || 1;
				const listedUnitCost =
					Number(scanItem.price) ||
					((Number(scanItem.total) || 0) / Math.max(quantity, 1));
				const costPerUnit = convertListedCostToBaseUnit({
					listedUnitCost,
					listedUnit: scanItem.unit,
					inventoryItem,
				});

				if (!(costPerUnit > 0)) {
					continue;
				}

				const candidate = {
					inventoryId: inventoryItem._id,
					costPerUnit,
					sourceTransactionId: transaction._id,
					sourceLabel:
						transaction.merchant ||
						transaction.description ||
						"Heuristik transaksi belanja",
					confidence: Math.min(0.99, score),
					reason: `Cocok dengan item transaksi "${scanItem.name}"`,
				};

				if (
					!bestMatch ||
					candidate.confidence > bestMatch.confidence ||
					(candidate.confidence === bestMatch.confidence &&
						transaction.date > bestMatch._transactionDate)
				) {
					bestMatch = {
						...candidate,
						_transactionDate: transaction.date,
					};
				}
			}
		}

		if (bestMatch) {
			const { _transactionDate, ...result } = bestMatch;
			suggestions.push(result);
		}
	}

	return suggestions;
}

function parseInventoryCostSuggestionResponse(content: string, inventoryIds: Set<string>) {
	const parsed = parseAIScanJSON(content);
	const suggestions = parsed?.suggestions;
	if (!Array.isArray(suggestions)) {
		return [];
	}

	return suggestions
		.map((suggestion: any) => ({
			inventoryId: String(suggestion.inventoryId || ""),
			costPerUnit: Number(suggestion.costPerUnit) || 0,
			sourceTransactionId: suggestion.sourceTransactionId
				? String(suggestion.sourceTransactionId)
				: undefined,
			sourceLabel: sanitizeAIString(suggestion.sourceLabel || ""),
			confidence:
				typeof suggestion.confidence === "number"
					? Math.max(0, Math.min(1, suggestion.confidence))
					: undefined,
			reason: sanitizeAIString(suggestion.reason || ""),
		}))
		.filter(
			(suggestion: any) =>
				inventoryIds.has(suggestion.inventoryId) && suggestion.costPerUnit > 0
		);
}

function mergeInventoryCostSuggestions(base: any[], incoming: any[]) {
	const merged = new Map<string, any>();
	for (const suggestion of [...base, ...incoming]) {
		const current = merged.get(suggestion.inventoryId);
		if (
			!current ||
			(suggestion.confidence ?? 0) > (current.confidence ?? 0)
		) {
			merged.set(suggestion.inventoryId, suggestion);
		}
	}
	return [...merged.values()];
}


/**
 * Analyze sales data to provide high-level insights.
 */
/**
 * Get all pending follow-up tasks
 */
export const getPendingTasks = query({
	args: {},
	handler: async (ctx) => {
		return await ctx.db
			.query("followUpTasks")
			.withIndex("by_status", (q) => q.eq("status", "pending"))
			.collect();
	},
});

export const generateInsights = action({
	args: {
		salesData: v.string(), // JSON string of recent orders
	},
	handler: async (_ctx, args) => {
		return await safeSumoPodCall([
			{
				role: "system",
				content:
					"You are an AI Business Analyst for YUMI POS. Analyze sales data and provide 3 bullet points of insights and 1 strategic recommendation.",
			},
			{
				role: "user",
				content: `Analyze this sales data: ${args.salesData}`,
			},
		]);
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
		return await safeSumoPodCall([
			{
				role: "system",
				content:
					"You are a helpful POS recommendation engine. Suggest 2 items from the 'allProducts' list that would pair well with the items in the cart.",
			},
			{
				role: "user",
				content: `Cart contains: ${args.cartItems.join(", ")}\nAvailable Products: ${JSON.stringify(args.allProducts)}`,
			},
		]);
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
		return await safeSumoPodCall([
			{
				role: "system",
				content:
					"You are a marketing copywriter for a cafe/restaurant POS system. Generate a short, appetizing Indonesian description (max 2 sentences) for the product. Be creative and enticing.",
			},
			{
				role: "user",
				content: `Product: ${args.productName}\nCategory: ${args.category}\nPrice: Rp ${args.price.toLocaleString("id-ID")}`,
			},
		]);
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
		return await safeSumoPodCall([
			{
				role: "system",
				content:
					"You are a retail pricing strategist. Based on sales data and existing discounts, suggest ONE new discount strategy. Provide: name (Indonesian), type (FIXED or PERCENTAGE), value, and best timing (days/hours). Format as JSON: {name, type, value, reason}",
			},
			{
				role: "user",
				content: `Sales Summary: ${args.salesSummary}\nExisting Discounts: ${args.existingDiscounts}`,
			},
		]);
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
		monthlyProgress,
		periodComparison,
		hppMarginAnalysis,
		bookingOrders,
		bookingSettings,
		bookingCapacities,
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
		ctx.runQuery(api.finance.getCurrentMonthProgress),
		ctx.runQuery(api.finance.getPeriodComparison),
		ctx.runQuery(api.hpp.getHppWithMarginAnalysis, {}),
		ctx.runQuery(api.booking.getBookingOrders, { slug: "booking" }),
		ctx.runQuery(api.booking.getSettings, { slug: "booking" }),
		ctx.runQuery(api.booking.getDateCapacities, { slug: "booking" }),
	]);

	const inventoryContext = (inventory as any[]).map(i => `${i.ingredientName} (${i.unit})`).join(", ");

	const prodList =
		(
			products as Array<{
				_id: string;
				name: string;
				price: number;
				isAvailable: boolean;
				promoPrice?: number;
			}>
		)
			?.map(
				(p) =>
					`${p.name} [ID: ${p._id}] (Rp${p.price}, ${p.isAvailable ? "tersedia" : "habis"}${p.promoPrice ? `, promo: Rp${p.promoPrice}` : ""})`
			)
			.join("; ") || "Tidak ada data";

	const catList =
		(categories as Array<{ _id: string; name: string }>)
			?.map((c) => `${c.name} [ID: ${c._id}]`)
			.join(", ") || "Tidak ada data";

	const invList =
		(
			inventory as Array<{
				_id: string;
				ingredientName: string;
				quantity: number;
				unit: string;
				lowStockThreshold: number;
			}>
		)
			?.map(
				(i) =>
					`${i.ingredientName} [ID: ${i._id}]: ${i.quantity} ${i.unit} (min: ${i.lowStockThreshold})`
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
		(
			allTransactions as Array<{
				date: number;
				type: "income" | "expense";
				amount: number;
				category: string;
				description?: string;
				paymentMethod?: string;
				status: string;
			}>
		)
			?.map(
				(t) =>
					`🔹 ${new Date(t.date).toLocaleDateString("id-ID")} | ${t.type === "income" ? "PEMASUKAN" : "PENGELUARAN"} | Rp${t.amount.toLocaleString("id-ID")} | ${t.category} | ${t.description || "-"} | ${t.paymentMethod || "CASH"} | ${t.status}`
			)
			.join("\n") || "Tidak ada transaksi";

	return `== DATABASE APLIKASI YUMI POS ==

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

🔮 FORECASTING (PREDIKSI AI):
${(() => {
	// Stock risk summary from inventory data
	const invArr = inventory as Array<{
		ingredientName: string;
		quantity: number;
		unit: string;
		lowStockThreshold: number;
	}>;
	if (!invArr || invArr.length === 0) {
		return "Belum ada data inventory untuk prediksi";
	}
	const criticalItems = invArr.filter(
		(i) => i.quantity <= i.lowStockThreshold * 0.5
	);
	const lowItems = invArr.filter(
		(i) =>
			i.quantity > i.lowStockThreshold * 0.5 &&
			i.quantity <= i.lowStockThreshold
	);
	let forecastSummary = `Stok Kritis (≤50% threshold): ${criticalItems.length} item`;
	if (criticalItems.length > 0) {
		forecastSummary += ` - ${criticalItems.map((i) => `${i.ingredientName} (${i.quantity} ${i.unit})`).join(", ")}`;
	}
	forecastSummary += `\nStok Rendah: ${lowItems.length} item`;
	if (lowItems.length > 0) {
		forecastSummary += ` - ${lowItems.map((i) => `${i.ingredientName} (${i.quantity} ${i.unit})`).join(", ")}`;
	}
	return forecastSummary;
})()}

📊 ANALISIS EFEKTIVITAS DISKON & PROMO:
${(() => {
	const discountArr = discounts as Array<{
		_id: string;
		name: string;
		code?: string;
		type: string;
		value: number;
		isActive: boolean;
		targetType: string;
		isHappyHour?: boolean;
		isFreeRefill?: boolean;
		refillPrice?: number;
		productPrices?: Array<{ productId: string; price: number }>;
	}>;
	if (!discountArr || discountArr.length === 0) {
		return "Belum ada diskon atau promo";
	}
	const activeDiscounts = discountArr.filter((d) => d.isActive);
	const inactiveDiscounts = discountArr.filter((d) => !d.isActive);
	
	const formatPromo = (d: typeof discountArr[0]) => {
		let detail = `${d.name}${d.code ? ` [Kode: ${d.code}]` : ""} (${d.type}: ${d.value})`;
		if (d.isHappyHour) detail += " [HAPPY HOUR]";
		if (d.isFreeRefill) detail += ` [FREE REFILL: Rp${(d.refillPrice || 0).toLocaleString("id-ID")}]`;
		if (d.productPrices && d.productPrices.length > 0) detail += ` (${d.productPrices.length} produk terdampak)`;
		return detail;
	};

	let discountAnalysis = `Promo Aktif: ${activeDiscounts.length}, Nonaktif: ${inactiveDiscounts.length}\n`;
	if (activeDiscounts.length > 0) {
		discountAnalysis += `Detail Promo Aktif:\n${activeDiscounts.map((d) => `• ${formatPromo(d)}`).join("\n")}`;
	}
	
	// Tambahkan statistik penggunaan voucher dari pesanan jika ada
	const orderArr = orders as any[];
	const ordersWithVoucher = orderArr.filter(o => o.voucherId && (o.status === "paid" || o.status === "completed"));
	if (ordersWithVoucher.length > 0) {
		const totalVoucherValue = ordersWithVoucher.reduce((sum, o) => sum + (o.discountAmount || 0), 0);
		discountAnalysis += `\n\nStatistik Penggunaan Voucher (Lunas):\n• Total Penggunaan: ${ordersWithVoucher.length} kali\n• Total Potongan: Rp${totalVoucherValue.toLocaleString("id-ID")}`;
	}

	return discountAnalysis;
})()}

🔄 REKONSILIASI KEUANGAN:
${(() => {
	const orderArr2 = orders as Array<{
		totalAmount: number;
		status: string;
	}>;
	const paidOrders =
		orderArr2?.filter((o) => o.status === "paid" || o.status === "completed") ||
		[];
	const orderRevenue = paidOrders.reduce((sum, o) => sum + o.totalAmount, 0);
	const incomeArr =
		(allTransactions as Array<{ type: string; amount: number }>)?.filter(
			(t) => t.type === "income"
		) || [];
	const incomeTotal = incomeArr.reduce((sum, t) => sum + t.amount, 0);
	const gap = orderRevenue - incomeTotal;
	const gapStatus =
		Math.abs(gap) < 1000
			? "✅ Seimbang"
			: gap > 0
				? `⚠️ Selisih: Rp${gap.toLocaleString("id-ID")} (pesanan > catatan keuangan)`
				: `⚠️ Selisih: Rp${Math.abs(gap).toLocaleString("id-ID")} (catatan keuangan > pesanan)`;
	return `Total Pesanan Selesai: Rp${orderRevenue.toLocaleString("id-ID")} (${paidOrders.length} pesanan)\nTotal Pemasukan Tercatat: Rp${incomeTotal.toLocaleString("id-ID")} (${incomeArr.length} transaksi)\nStatus: ${gapStatus}`;
})()}

🎯 TARGET KEUANGAN BULAN INI:
${(() => {
	const mp = monthlyProgress as any;
	if (!mp) return "Data target tidak tersedia";
	if (!mp.hasTarget) return `Belum ada target ditetapkan untuk ${mp.monthLabel}. Gunakan tool setFinancialTarget untuk menetapkan target.`;
	return [
		`Bulan: ${mp.monthLabel}`,
		`Target Omzet: Rp${mp.targetRevenue.toLocaleString("id-ID")}`,
		mp.targetProfit ? `Target Profit: Rp${(mp.targetProfit as number).toLocaleString("id-ID")}` : "",
		`Omzet Saat Ini: Rp${mp.currentIncome.toLocaleString("id-ID")}`,
		`Progress: ${(mp.progressPct as number).toFixed(1)}%`,
		`Sisa: Rp${mp.remaining.toLocaleString("id-ID")}`,
		`Hari Tersisa: ${mp.daysRemaining} hari`,
		`Rate Harian: Rp${Math.round(mp.dailyRate as number).toLocaleString("id-ID")}/hari`,
		`Proyeksi Bulanan: Rp${Math.round(mp.projectedMonthly as number).toLocaleString("id-ID")}`,
		mp.insight ? `\nInsight: ${mp.insight}` : "",
	].filter(Boolean).join("\n");
})()}

📊 PERBANDINGAN PERIODE:
${(() => {
	const pc = periodComparison as any;
	if (!pc) return "Data perbandingan tidak tersedia";
	const sign = (v: number) => v >= 0 ? `+${v.toFixed(1)}%` : `${v.toFixed(1)}%`;
	return [
		`${pc.current.label}: Pemasukan Rp${pc.current.income.toLocaleString("id-ID")}, Pengeluaran Rp${pc.current.expense.toLocaleString("id-ID")}, Net Rp${pc.current.net.toLocaleString("id-ID")}`,
		`${pc.previous.label}: Pemasukan Rp${pc.previous.income.toLocaleString("id-ID")}, Pengeluaran Rp${pc.previous.expense.toLocaleString("id-ID")}, Net Rp${pc.previous.net.toLocaleString("id-ID")}`,
		`Perubahan: Pemasukan ${sign(pc.changes.incomePct)}, Pengeluaran ${sign(pc.changes.expensePct)}, Net ${sign(pc.changes.netPct)}`,
	].join("\n");
})()}

📐 ANALISIS MARGIN HPP (DETAIL):
${(() => {
	const analysis = hppMarginAnalysis as any[];
	if (!analysis || analysis.length === 0) return "Belum ada kalkulasi HPP";
	const lowMargin = analysis.filter((h: any) => h.isLowMargin);
	const okMargin = analysis.filter((h: any) => !h.isLowMargin);
	let result = `Total: ${analysis.length} produk, Margin OK: ${okMargin.length}, Perlu Perhatian: ${lowMargin.length}\n`;
	if (lowMargin.length > 0) {
		result += `⚠️ Margin Rendah:\n${lowMargin.map((h: any) => `  - ${h.name} (ID: ${h.id}): margin ${(h.currentMarginPercent as number).toFixed(1)}%, harga jual Rp${h.currentSellingPrice.toLocaleString("id-ID")}, rekomendasi Rp${h.recommendedSellingPrice.toLocaleString("id-ID")} (naik Rp${h.priceDiff.toLocaleString("id-ID")})`).join("\n")}`;
	}
	return result;
})()}

📅 BOOKING ONLINE:
${(() => {
	const bookingArr = bookingOrders as Array<{
		bookingCode: string;
		customerName: string;
		customerPhone: string;
		bookingDate: string;
		totalAmount: number;
		bookingStatus: string;
		paymentStatus: string;
		items: Array<{ name: string; quantity: number; price: number }>;
		createdAt: number;
	}>;
	if (!bookingArr || bookingArr.length === 0) return "Belum ada data booking";
	const pending = bookingArr.filter((b) => b.bookingStatus === "pending");
	const confirmed = bookingArr.filter((b) => b.bookingStatus === "confirmed");
	const completed = bookingArr.filter((b) => b.bookingStatus === "completed");
	const cancelled = bookingArr.filter((b) => b.bookingStatus === "cancelled");
	const totalRevenue = bookingArr
		.filter((b) => b.paymentStatus === "paid")
		.reduce((sum, b) => sum + b.totalAmount, 0);
	const recent = bookingArr.slice(0, 10).map(
		(b) =>
			`#${b.bookingCode} - ${b.customerName} (${b.customerPhone}) - ${b.bookingDate} - Rp${b.totalAmount.toLocaleString("id-ID")} - ${b.bookingStatus}/${b.paymentStatus}`
	).join("\n");
	const settingsStr = bookingSettings ? `Konfigurasi: ${bookingSettings.title} (${bookingSettings.isActive ? "Aktif" : "Nonaktif"}), Pembayaran: ${bookingSettings.paymentMethods?.join(", ") || "-"}` : "Konfigurasi tidak ditemukan";
	const capStr = (bookingCapacities as any[])?.length > 0 ? `Kapasitas Khusus: ${(bookingCapacities as any[]).map(c => `${c.date}: ${c.maxPeople} org / ${c.maxTables} meja`).join("; ")}` : "Tidak ada kapasitas khusus";

	return `Total: ${bookingArr.length} booking (Pending: ${pending.length}, Dikonfirmasi: ${confirmed.length}, Selesai: ${completed.length}, Dibatalkan: ${cancelled.length})\nTotal Pendapatan Booking: Rp${totalRevenue.toLocaleString("id-ID")}\n${settingsStr}\n${capStr}\nBooking Terbaru:\n${recent}`;
})()}

== FITUR APLIKASI ==
- Manajemen Produk & Kategori (CRUD, variasi, upload gambar)
- Manajemen Inventaris & Stok (FIFO, low-stock alert, resep, base recipe/pre-mix)
- Pemesanan & POS (buat pesanan, update status, cetak struk Bluetooth)
- Keuangan (income/expense tracking, laporan periode, laba rugi, arus kas, transaksi detail - tersedia di /admin/finance/reports dengan export PDF/Excel/CSV)
- Promosi & Diskon (FIXED/PERCENTAGE/FLAT_PRICE, jadwal, target) - termasuk ANALISIS EFEKTIVITAS DISKON
- HPP / Kalkulator Harga Pokok Produksi (perhitungan biaya bahan baku, margin, laba) - termasuk SIMULASI HPP & REKOMENDASI HARGA OTOMATIS
- Target Keuangan (set target omzet bulanan, tracking progress, AI insight) - gunakan tool setFinancialTarget untuk menetapkan target
- Forecasting AI (prediksi stok habis, jam ramai, revenue, produk trending)
- Rekonsiliasi Keuangan (cross-check pesanan vs transaksi keuangan)
- Manajemen User & Role (RBAC, permissions)
- Pengaturan Toko (nama, alamat, logo, receipt footer)
- Booking Online (lihat semua reservasi, konfirmasi booking, tandai lunas, batalkan - gunakan tool updateBookingStatus)
- AI Analytics (prediksi stok, analisis bisnis, rekomendasi produk, analisis HPP, target keuangan)
- Reporting & Insights (PDF, Excel, CSV, automated scheduled reports)
- Dashboard Kontrol (monitoring real-time order status, stock alerts, finance charts)`;
}

/**
 * Gather Smart Context - Business patterns and insights
 */
async function gatherSmartContext(ctx: GenericActionCtx<DataModel>) {
	const [orders, inventory, products, categories] = await Promise.all([
		ctx.runQuery(api.orders.getOrders, {}),
		ctx.runQuery(api.inventory.getInventory),
		ctx.runQuery(api.products.getAllProductsAdmin),
		ctx.runQuery(api.products.getCategories),
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
	const todayTs = today.getTime();
	
	const yesterday = new Date(today);
	yesterday.setDate(yesterday.getDate() - 1);
	const yesterdayTs = yesterday.getTime();

	const weekStart = new Date(today);
	weekStart.setDate(today.getDate() - today.getDay());
	const weekStartTs = weekStart.getTime();

	const lastWeekStart = new Date(weekStart);
	lastWeekStart.setDate(weekStart.getDate() - 7);
	const lastWeekStartTs = lastWeekStart.getTime();

	const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
	const monthStartTs = monthStart.getTime();

	const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
	const lastMonthStartTs = lastMonthStart.getTime();
	const lastMonthEndTs = monthStartTs - 1;

	const getStats = (txs: any[], orders: any[], start: number, end: number = Date.now()) => {
		const filteredTxs = txs.filter(t => t.date >= start && t.date <= end && t.status === "completed");
		const income = filteredTxs.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0);
		const expense = filteredTxs.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0);
		const filteredOrders = orders.filter(o => o.createdAt >= start && o.createdAt <= end && (o.status === "paid" || o.status === "completed"));
		const orderRev = filteredOrders.reduce((s, o) => s + o.totalAmount, 0);
		return { income, expense, orderRev, count: filteredOrders.length };
	};

	const allTransactions = await ctx.runQuery(api.finance.getAllTransactions, {});
	const txArr = allTransactions as any[];
	const ordArr = completedOrders as any[];

	const sToday = getStats(txArr, ordArr, todayTs);
	const sYesterday = getStats(txArr, ordArr, yesterdayTs, todayTs - 1);
	const sThisWeek = getStats(txArr, ordArr, weekStartTs);
	const sLastWeek = getStats(txArr, ordArr, lastWeekStartTs, weekStartTs - 1);
	const sThisMonth = getStats(txArr, ordArr, monthStartTs);
	const sLastMonth = getStats(txArr, ordArr, lastMonthStartTs, lastMonthEndTs);

	// Product Categories Count
	const prodArr = products as any[];
	const catArr = categories as any[];
	const categoryCounts = catArr.map(c => {
		const count = prodArr.filter(p => p.categoryId === c._id).length;
		return `${c.name}: ${count} produk`;
	}).join(", ");

	insights.push(`📅 REKAPITULASI DETAIL (Waktu Sekarang: ${new Date().toLocaleString("id-ID")}):`);
	insights.push(`  - JUMLAH PRODUK PER KATEGORI: ${categoryCounts}`);
	
	const formatRecap = (label: string, s: any) => 
		`  - ${label}: Pemasukan Rp${s.income.toLocaleString("id-ID")}, Pengeluaran Rp${s.expense.toLocaleString("id-ID")}, Pesanan Rp${s.orderRev.toLocaleString("id-ID")} (${s.count} order)`;

	insights.push(formatRecap("HARI INI", sToday));
	insights.push(formatRecap("KEMARIN", sYesterday));
	insights.push(formatRecap("MINGGU INI", sThisWeek));
	insights.push(formatRecap("MINGGU LALU", sLastWeek));
	insights.push(formatRecap("BULAN INI", sThisMonth));
	insights.push(formatRecap("BULAN LALU", sLastMonth));

	if (sYesterday.orderRev > 0) {
		const change = ((sToday.orderRev - sYesterday.orderRev) / sYesterday.orderRev) * 100;
		const trend = change >= 0 ? "📈 Naik" : "📉 Turun";
		insights.push(
			`${trend} ${Math.abs(change).toFixed(1)}% dari kemarin (Revenue Pesanan)`
		);
	}

	return insights.length > 0
		? `== SMART INSIGHTS ==\n${insights.join("\n")}`
		: "== SMART INSIGHTS ==\nBelum cukup data untuk analisis";
}

type ParsedBulkFinanceEntry = {
	date: number;
	type: "income" | "expense";
	amount: number;
	category: string;
	merchant?: string;
	description: string;
	paymentMethod: string;
	rawLine: string;
};

type ParsedBulkFinanceResult = {
	entries: ParsedBulkFinanceEntry[];
	defaultYear: number;
};

function parseRupiahAmount(raw: string): number {
	if (!raw) return 0;
	const normalized = raw
		.replace(/rp\.?/gi, "")
		.replace(/\s+/g, "")
		.replace(/[^0-9,.-]/g, "")
		.replace(/\.(?=\d{3}(\D|$))/g, "")
		.replace(/,/g, ".");
	const amount = Number.parseFloat(normalized);
	return Number.isFinite(amount) ? Math.round(amount) : 0;
}

function buildTimestampAtNoonJakarta(year: number, month: number, day: number): number {
	// Store at 12:00 UTC to reduce day-shift risk when viewed across time zones.
	return Date.UTC(year, month - 1, day, 12, 0, 0, 0);
}

function inferTransactionType(text: string): "income" | "expense" {
	const t = text.toLowerCase();
	const incomeKeywords = ["pemasukan", "pendapatan", "omzet", "omset", "penjualan", "revenue", "masuk", "setoran", "income"];
	return incomeKeywords.some((k) => t.includes(k)) ? "income" : "expense";
}

function inferFinanceCategory(text: string): string {
	const t = text.toLowerCase();
	if (/(belanja|kulak|stok|bahan baku|supplier|purchasing)/.test(t)) return "belanja_stok";
	if (/(bensin|parkir|kurir|ojek|transport|grab|gojek|maxim)/.test(t)) return "transportasi";
	if (/(galon|air mineral|le mineral|es batu|konsumsi|jajan|nasi|lauk|minuman|makanan)/.test(t)) return "makanan_minuman";
	if (/(listrik|air|pdam|wifi|internet|sampah|utilitas|operasional bulanan|keamanan)/.test(t)) return "utilitas_listrik_air";
	if (/(atk|pembersih|sunlight|sapu|kain pel|peralatan|alat)/.test(t)) return "peralatan_kantor";
	if (/(gaji|upah|thr|bonus|uang makan karyawan)/.test(t)) return "gaji_karyawan";
	if (/(sewa)/.test(t)) return "sewa_tempat";
	if (/(iklan|promosi|marketing|pemasaran|brosur|banner)/.test(t)) return "pemasaran";
	if (/(ppn|pph|pajak|retribusi)/.test(t)) return "pajak";
	if (/(obat|p3k|kesehatan)/.test(t)) return "kesehatan";
	if (/(renovasi|material|tukang|pembangunan|perbaikan)/.test(t)) return "pembangunan_renovasi";
	return "lainnya";
}

function parseDateFromLine(line: string, fallbackYear: number): { ts: number; year: number } | null {
	const cleaned = line.toLowerCase().trim();
	const monthMap: Record<string, number> = {
		januari: 1, januarii: 1, jan: 1,
		februari: 2, feb: 2,
		maret: 3, mar: 3,
		april: 4, apr: 4,
		mei: 5,
		juni: 6, jun: 6,
		juli: 7, jul: 7,
		agustus: 8, agu: 8, ags: 8,
		september: 9, sep: 9,
		oktober: 10, okt: 10,
		november: 11, nov: 11,
		desember: 12, des: 12,
	};

	const slashDate = cleaned.match(/(?:^|[\s,])(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?(?:$|[\s,])/);
	if (slashDate) {
		const day = Number.parseInt(slashDate[1], 10);
		const month = Number.parseInt(slashDate[2], 10);
		let year = slashDate[3] ? Number.parseInt(slashDate[3], 10) : fallbackYear;
		if (year < 100) year += 2000;
		if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
			return { ts: buildTimestampAtNoonJakarta(year, month, day), year };
		}
	}

	const namedDate = cleaned.match(
		/(?:^|[\s,])(\d{1,2})\s+([a-zA-Z]+)\s+(\d{2,4})(?:$|[\s,])/
	);
	if (namedDate) {
		const day = Number.parseInt(namedDate[1], 10);
		const monthRaw = namedDate[2].toLowerCase();
		const month = monthMap[monthRaw];
		let year = Number.parseInt(namedDate[3], 10);
		if (year < 100) year += 2000;
		if (month && day >= 1 && day <= 31) {
			return { ts: buildTimestampAtNoonJakarta(year, month, day), year };
		}
	}

	return null;
}

function parseOptionalIsoDate(dateValue?: string | null): number | null {
	if (!dateValue) return null;
	const parsed = new Date(dateValue).getTime();
	return Number.isFinite(parsed) ? parsed : null;
}

function isInventoryPurchaseCategory(category?: string | null) {
	const normalized = normalizeSearchText(category || "");
	return (
		normalized === "belanja stok" ||
		normalized === "belanja_stok" ||
		normalized === "pembelian stok" ||
		normalized === "peralatan kantor" ||
		normalized === "peralatan_kantor"
	);
}

function buildReceiptFinanceFingerprint(args: {
	scanResult: any;
	effectiveType: "income" | "expense";
	date: number;
	inputMode: string;
}) {
	const merchant = normalizeSearchText(
		args.scanResult?.data?.merchantName ||
			args.scanResult?.name ||
			"unknown"
	);
	const amount = Math.round(
		Number(args.scanResult?.data?.amount ?? args.scanResult?.total) || 0
	);
	const category = normalizeSearchText(args.scanResult?.data?.category || "lainnya");
	const dayKey = new Date(args.date).toISOString().slice(0, 10);
	const itemsKey = normalizeScanItems(args.scanResult?.data?.items)
		.map((item) => {
			const lineTotal =
				Number(item.total) ||
				(Number(item.price) || 0) * (Number(item.quantity) || 1);
			return `${normalizeSearchText(item.name)}:${item.quantity}:${Math.round(lineTotal)}:${normalizeUnitLabel(item.unit)}`;
		})
		.sort()
		.join("|");

	return `receipt:${args.inputMode}:${args.effectiveType}:${merchant}:${category}:${dayKey}:${amount}:${itemsKey || normalizeSearchText(args.scanResult?.rawText || "").slice(0, 120)}`;
}

function shouldSyncExpenseToInventory(scanResult: any, effectiveType: string) {
	if (effectiveType !== "expense") {
		return false;
	}

	const scanItems = normalizeScanItems(scanResult?.data?.items);
	if (scanItems.length === 0) {
		return false;
	}

	return (
		isInventoryPurchaseCategory(scanResult?.data?.category) ||
		scanResult?.suggestedAction === "addStock"
	);
}

function buildStockPurchasePayloadFromScan(args: {
	scanResult: any;
	date: number;
	sourceLabel: string;
	override?: {
		amount?: number;
		category?: string;
		merchant?: string;
		description?: string;
		paymentMethod?: string;
	};
}) {
	const scanItems = normalizeScanItems(args.scanResult?.data?.items).map((item) => ({
		name: item.name,
		qty: Number(item.quantity) || 1,
		price:
			Number(item.price) ||
			((Number(item.total) || 0) / Math.max(Number(item.quantity) || 1, 1)),
		total: Number(item.total) || undefined,
		unit: item.unit,
	}));

	return {
		total:
			Number(args.override?.amount) ||
			Number(args.scanResult?.data?.amount) ||
			scanItems.reduce(
				(sum, item) => sum + (Number(item.total) || item.price * item.qty),
				0
			),
		merchant:
			args.override?.merchant ||
			args.scanResult?.data?.merchantName ||
			args.scanResult?.name,
		date: args.date,
		paymentMethod:
			args.override?.paymentMethod ||
			args.scanResult?.data?.paymentMethod ||
			"cash",
		description:
			args.override?.description ||
			args.scanResult?.data?.description ||
			args.scanResult?.data?.notes ||
			args.scanResult?.rawText?.slice(0, 200),
		category: args.override?.category || "Pembelian Stok",
		rawText: args.scanResult?.rawText?.slice(0, 1000),
		sourceLabel: args.sourceLabel,
		items: scanItems,
	};
}

function parseFlexibleQuantity(raw?: string) {
	if (!raw) return 0;
	const normalized = raw.replace(",", ".").replace(/[^0-9.-]/g, "");
	const quantity = Number.parseFloat(normalized);
	return Number.isFinite(quantity) ? quantity : 0;
}

function extractReceiptItemsFromText(message: string) {
	if (!message || message.trim().length < 10) {
		return [];
	}

	const items: Array<{
		name: string;
		quantity: number;
		price: number;
		total: number;
		unit?: string;
	}> = [];

	const lines = message
		.replace(/\r/g, "")
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);

	const skipPattern =
		/^(total|subtotal|grand total|tax|pajak|ppn|diskon|discount|service|biaya layanan|payment|pembayaran|cash|qris|debit|credit|metode|merchant|toko|supplier|tanggal|date|jam|waktu|no\.?\s*(struk|receipt|invoice)|receipt|invoice|catat|simpan|input)\b/i;

	for (const rawLine of lines) {
		const line = rawLine.replace(/^[\-\*\u2022>\s]+/, "").trim();
		if (!line || skipPattern.test(line)) {
			continue;
		}

		const patterns = [
			/^(.*?)\s+(\d+(?:[.,]\d+)?)\s*(kg|gram|gr|g|liter|ltr|lt|l|ml|pcs|pc|pack|box|botol|bottle|bungkus|lusin|dozen)?\s*(?:x|@)\s*rp?\.?\s*([0-9][0-9.,]*)(?:\s*(?:=|x)\s*rp?\.?\s*([0-9][0-9.,]*))?$/i,
			/^(.*?)\s+(\d+(?:[.,]\d+)?)\s*(kg|gram|gr|g|liter|ltr|lt|l|ml|pcs|pc|pack|box|botol|bottle|bungkus|lusin|dozen)?\s+rp?\.?\s*([0-9][0-9.,]*)(?:\s+rp?\.?\s*([0-9][0-9.,]*))?$/i,
		];

		let matchedItem:
			| {
					name: string;
					quantity: number;
					price: number;
					total: number;
					unit?: string;
			  }
			| null = null;

		for (const pattern of patterns) {
			const match = line.match(pattern);
			if (!match) {
				continue;
			}

			const name = sanitizeAIString(match[1] || "")
				.replace(/[:\-]$/, "")
				.trim();
			const quantity = parseFlexibleQuantity(match[2]) || 1;
			const unit = sanitizeAIString(match[3] || "") || undefined;
			const price = parseRupiahAmount(match[4] || "");
			const total = match[5]
				? parseRupiahAmount(match[5])
				: Math.round(quantity * price);

			if (!name || name.length < 2 || !(price > 0)) {
				continue;
			}

			matchedItem = {
				name,
				quantity,
				price,
				total,
				unit,
			};
			break;
		}

		if (matchedItem) {
			items.push(matchedItem);
		}
	}

	return items.slice(0, 50);
}

function parseBulkFinancialReport(message: string): ParsedBulkFinanceResult | null {
	if (!message || message.trim().length < 10) return null;

	const yearMatch = message.match(/\b(20\d{2}|19\d{2})\b/);
	let defaultYear = yearMatch ? Number.parseInt(yearMatch[1], 10) : new Date().getFullYear();
	let currentDateTs: number | null = null;
	const entries: ParsedBulkFinanceEntry[] = [];

	const lines = message
		.replace(/\r/g, "")
		.split("\n")
		.map((l) => l.trim())
		.filter(Boolean);

	for (const raw of lines) {
		const line = raw
			.replace(/^[\*\-\u2022>\s]+/, "")
			.replace(/\s{2,}/g, " ")
			.trim();
		if (!line) continue;
		if (/^total\b/i.test(line) || /^total\s+rekap/i.test(line)) continue;
		if (/^report\b/i.test(line)) continue;

		const detectedDate = parseDateFromLine(line, defaultYear);
		if (detectedDate) {
			currentDateTs = detectedDate.ts;
			defaultYear = detectedDate.year;
			if (!/rp\s*[0-9]/i.test(line)) continue;
		}

		const amountMatch = line.match(/rp\.?\s*([0-9][0-9.,]*)/i);
		if (!amountMatch) continue;
		if (!currentDateTs) continue;

		const amount = parseRupiahAmount(amountMatch[1]);
		if (amount <= 0) continue;

		const leftSide = line.split(/rp\.?/i)[0]?.trim() || line;
		const label = leftSide.replace(/[:\-]\s*$/, "").trim();
		const noteMatch = line.match(/\(([^)]+)\)/);
		const notes = noteMatch?.[1]?.trim();
		const normalizedText = `${label} ${notes || ""}`.trim();
		const type = inferTransactionType(normalizedText);
		const category = inferFinanceCategory(normalizedText);
		const merchant = label && !/^(operasional|belanja|pengeluaran|pemasukan|lainnya)$/i.test(label) ? label : undefined;

		entries.push({
			date: currentDateTs,
			type,
			amount,
			category,
			merchant,
			description: notes ? `${label} (${notes})` : label,
			paymentMethod: "cash",
			rawLine: raw,
		});
	}

	if (entries.length === 0) return null;
	return { entries, defaultYear };
}

function formatBulkFinancialContext(parsed: ParsedBulkFinanceResult | null): string {
	if (!parsed || parsed.entries.length === 0) return "";
	const groupedByDate = new Map<string, ParsedBulkFinanceEntry[]>();
	for (const e of parsed.entries) {
		const key = new Date(e.date).toISOString().slice(0, 10);
		if (!groupedByDate.has(key)) groupedByDate.set(key, []);
		groupedByDate.get(key)!.push(e);
	}
	const incomeTotal = parsed.entries
		.filter((e) => e.type === "income")
		.reduce((sum, e) => sum + e.amount, 0);
	const expenseTotal = parsed.entries
		.filter((e) => e.type === "expense")
		.reduce((sum, e) => sum + e.amount, 0);
	const sample = parsed.entries
		.slice(0, 10)
		.map((e, idx) => `${idx + 1}. - ${new Date(e.date).toLocaleDateString("id-ID")} - ${e.description || e.category} - ${e.type} - Rp${e.amount.toLocaleString("id-ID")} - ${e.category}`)
		.join("\n");
	return [
		`Terdeteksi ${parsed.entries.length} transaksi bulk dari ${groupedByDate.size} tanggal.`,
		`Total pemasukan terdeteksi: Rp${incomeTotal.toLocaleString("id-ID")}`,
		`Total pengeluaran terdeteksi: Rp${expenseTotal.toLocaleString("id-ID")}`,
		`Contoh data terstruktur:\n${sample}`,
	].join("\n");
}

function shouldAutoImportBulkFinance(message: string, parsed: ParsedBulkFinanceResult | null): boolean {
	if (!parsed || parsed.entries.length === 0) return false;
	const text = (message || "").toLowerCase();
	if (/(jangan|hanya analisis|preview|contoh|simulasi)/.test(text)) return false;
	if (/(catat|simpan|import|masukkan|generate|proses|buatkan)/.test(text)) return true;
	if (parsed.entries.length >= 5 && /(report|rekap|purchasing|harian|bulanan)/.test(text)) return true;
	return false;
}

type BulkProductRow = { name: string; price: number; categoryName?: string; description?: string; isAvailable?: boolean };
type BulkInventoryRow = { ingredientName: string; quantity: number; unit?: string; lowStockThreshold?: number; costPerUnit?: number; notes?: string; date?: number };
type BulkBookingRow = { customerName: string; customerPhone: string; customerEmail?: string; bookingDate: string; guestCount: number; itemName?: string; quantity?: number; totalAmount?: number; paymentMethod?: string; notes?: string };
type BulkDiscountRow = { name: string; type: "FIXED" | "PERCENTAGE" | "FLAT_PRICE"; value: number; targetType: "ALL" | "CATEGORY" | "PRODUCT"; targetName?: string; isActive?: boolean; minOrderValue?: number };
type BulkOrderStatusRow = { orderRef: string; status: "pending" | "paid" | "completed" | "cancelled"; date?: number };
type BulkTargetRow = { month: string; targetRevenue: number; targetProfit?: number; notes?: string };
type BulkShiftStartRow = { cashierName: string; shiftName: string; startingCash: number; teamMembers?: string; notes?: string; startTime?: number };
type BulkShiftEndRow = { endingCashPhysical: number; nonCashConfirmed: number; notes?: string; endTime?: number };

type UniversalBulkParsed = {
	products: BulkProductRow[];
	inventory: BulkInventoryRow[];
	bookings: BulkBookingRow[];
	discounts: BulkDiscountRow[];
	orderStatuses: BulkOrderStatusRow[];
	targets: BulkTargetRow[];
	shiftStarts: BulkShiftStartRow[];
	shiftEnds: BulkShiftEndRow[];
};

function normText(value: string): string {
	return (value || "").toLowerCase().trim();
}

function parseNumberLoose(value?: string): number {
	if (!value) return 0;
	const cleaned = value
		.replace(/rp\.?/gi, "")
		.replace(/\s+/g, "")
		.replace(/[^0-9,.-]/g, "")
		.replace(/\.(?=\d{3}(\D|$))/g, "")
		.replace(/,/g, ".");
	const num = Number.parseFloat(cleaned);
	return Number.isFinite(num) ? num : 0;
}

function splitByAny(raw: string): string[] {
	return raw
		.split(/[|;,]/)
		.map((s) => s.trim())
		.filter(Boolean);
}

function parseKeyValues(raw: string): Record<string, string> {
	const out: Record<string, string> = {};
	for (const part of splitByAny(raw)) {
		const m = part.match(/^([a-zA-Z_ ]+)\s*[:=]\s*(.+)$/);
		if (!m) continue;
		out[normText(m[1]).replace(/\s+/g, "_")] = m[2].trim();
	}
	return out;
}

function toBookingDateString(ts?: number): string {
	const d = ts ? new Date(ts) : new Date();
	return d.toISOString().slice(0, 10);
}

function parseBulkUniversalData(message: string): UniversalBulkParsed {
	const result: UniversalBulkParsed = {
		products: [],
		inventory: [],
		bookings: [],
		discounts: [],
		orderStatuses: [],
		targets: [],
		shiftStarts: [],
		shiftEnds: [],
	};

	const lines = message
		.replace(/\r/g, "")
		.split("\n")
		.map((l) => l.trim())
		.filter(Boolean);

	for (const rawLine of lines) {
		const line = rawLine.replace(/^[\-\*\u2022>\s]+/, "").trim();
		if (!line) continue;
		const lower = normText(line);
		const kv = parseKeyValues(line);

		// Product bulk
		if (/(^produk\b|^product\b|produk:|menu:)/.test(lower) || (/(harga|price)/.test(lower) && /(kategori|category)/.test(lower))) {
			const segments = splitByAny(line.replace(/^produk[:\-\s]*/i, ""));
			const name = kv.nama || kv.name || segments[0];
			const price = parseNumberLoose(kv.harga || kv.price || segments.find((s) => /rp|^\d[\d.,]*$/.test(normText(s))) || "");
			const categoryName = kv.kategori || kv.category || segments[2];
			if (name && price > 0) {
				result.products.push({
					name: name.trim(),
					price,
					categoryName: categoryName?.trim(),
					description: kv.deskripsi || kv.description,
					isAvailable: !/(nonaktif|off|disable|tidak aktif)/.test(lower),
				});
			}
			continue;
		}

		// Inventory bulk
		if (/(^stok\b|inventory:|bahan:|restock|tambah stok)/.test(lower) || (/qty|jumlah/.test(lower) && /unit|pcs|kg|gr|liter|ml/.test(lower))) {
			const core = line.replace(/^(stok|inventory|bahan)[:\-\s]*/i, "");
			const segments = splitByAny(core);
			const qtyUnit = (kv.qty || kv.jumlah || segments.find((s) => /(\d+(\.\d+)?)\s*(kg|gr|gram|pcs|pack|liter|ml|botol|karung|dus)?/i.test(s)) || "").match(/(\d+(\.\d+)?)\s*(kg|gr|gram|pcs|pack|liter|ml|botol|karung|dus)?/i);
			const quantity = qtyUnit ? Number.parseFloat(qtyUnit[1]) : parseNumberLoose(kv.qty || kv.jumlah || "");
			const unit = (kv.unit || (qtyUnit ? qtyUnit[3] : "") || "pcs").toLowerCase();
			const ingredientName = (kv.nama || kv.bahan || kv.name || segments[0] || "").trim();
			const costPerUnit = parseNumberLoose(kv.harga || kv.price || kv.biaya || "");
			const lowStock = parseNumberLoose(kv.threshold || kv.low_stock || "");
			const parsedDate = parseDateFromLine(line, new Date().getFullYear());
			if (ingredientName && quantity > 0) {
				result.inventory.push({
					ingredientName,
					quantity,
					unit,
					costPerUnit: costPerUnit > 0 ? costPerUnit : undefined,
					lowStockThreshold: lowStock > 0 ? lowStock : Math.max(1, Math.floor(quantity * 0.2)),
					notes: kv.catatan || kv.notes,
					date: parsedDate?.ts,
				});
			}
			continue;
		}

		// Booking bulk
		if (/(^booking\b|^reservasi\b|booking:|reservasi:)/.test(lower)) {
			const segments = splitByAny(line.replace(/^(booking|reservasi)[:\-\s]*/i, ""));
			const name = (kv.nama || kv.customer || kv.customer_name || segments[0] || "").trim();
			const phone = (kv.telp || kv.phone || kv.hp || segments.find((s) => /08\d{7,}|^\+?\d{8,}$/.test(s.replace(/\s+/g, ""))) || "").trim();
			const parsedDate = parseDateFromLine(line, new Date().getFullYear());
			const bookingDate = kv.tanggal || kv.date || (parsedDate ? toBookingDateString(parsedDate.ts) : "");
			const guestCount = parseNumberLoose(kv.tamu || kv.guest || kv.guest_count || segments.find((s) => /(\d+)\s*(orang|pax|guest|tamu)/i.test(s)) || "");
			const qty = parseNumberLoose(kv.qty || kv.jumlah || "");
			const total = parseNumberLoose(kv.total || kv.amount || "");
			if (name && phone && bookingDate) {
				result.bookings.push({
					customerName: name,
					customerPhone: phone,
					customerEmail: kv.email,
					bookingDate,
					guestCount: guestCount > 0 ? guestCount : 1,
					itemName: kv.item || kv.menu,
					quantity: qty > 0 ? qty : 1,
					totalAmount: total > 0 ? total : undefined,
					paymentMethod: kv.payment || kv.pembayaran || "cash",
					notes: kv.catatan || kv.notes,
				});
			}
			continue;
		}

		// Discount bulk
		if (/(^promo\b|^diskon\b|promo:|diskon:)/.test(lower)) {
			const segments = splitByAny(line.replace(/^(promo|diskon)[:\-\s]*/i, ""));
			const name = (kv.nama || kv.name || segments[0] || "").trim();
			const pctMatch = line.match(/(\d+(\.\d+)?)\s*%/);
			const value = pctMatch ? Number.parseFloat(pctMatch[1]) : parseNumberLoose(kv.nilai || kv.value || segments[1] || "");
			const typeRaw = normText(kv.type || (pctMatch ? "percentage" : "fixed"));
			const type: "FIXED" | "PERCENTAGE" | "FLAT_PRICE" =
				typeRaw.includes("flat") ? "FLAT_PRICE" : typeRaw.includes("percent") || pctMatch ? "PERCENTAGE" : "FIXED";
			const targetRaw = normText(kv.target || kv.target_type || "all");
			const targetType: "ALL" | "CATEGORY" | "PRODUCT" =
				targetRaw.includes("kategori") || targetRaw.includes("category") ? "CATEGORY" : targetRaw.includes("produk") || targetRaw.includes("product") ? "PRODUCT" : "ALL";
			const targetName = kv.target_name || kv.kategori || kv.produk || segments[2];
			if (name && value > 0) {
				result.discounts.push({
					name,
					type,
					value,
					targetType,
					targetName: targetName?.trim(),
					isActive: !/(nonaktif|off|disable|false)/.test(lower),
					minOrderValue: parseNumberLoose(kv.min || kv.min_order || ""),
				});
			}
			continue;
		}

		// Order status bulk
		if (/(^order\b|status order|ubah status)/.test(lower) || /ord-\d+/i.test(line)) {
			const statusMatch = lower.match(/\b(pending|paid|completed|cancelled)\b/);
			const refMatch = line.match(/(ORD-\d+)/i);
			const ref = refMatch?.[1] || kv.order || kv.order_number || kv.id;
			const status = (statusMatch?.[1] || kv.status || "").toLowerCase();
			const parsedDate = parseDateFromLine(line, new Date().getFullYear());
			if (ref && ["pending", "paid", "completed", "cancelled"].includes(status)) {
				result.orderStatuses.push({
					orderRef: ref.trim(),
					status: status as any,
					date: parsedDate?.ts,
				});
			}
			continue;
		}

		// Financial target bulk
		if (/(target keuangan|target omzet|set target|target:)/.test(lower)) {
			const monthMatch = line.match(/\b(20\d{2})[-\/](0[1-9]|1[0-2])\b/);
			const month = kv.bulan || kv.month || (monthMatch ? `${monthMatch[1]}-${monthMatch[2]}` : "");
			const targetRevenue = parseNumberLoose(kv.target || kv.target_revenue || kv.omzet || kv.revenue || "");
			const targetProfit = parseNumberLoose(kv.profit || kv.target_profit || "");
			if (month && targetRevenue > 0) {
				result.targets.push({
					month,
					targetRevenue,
					targetProfit: targetProfit > 0 ? targetProfit : undefined,
					notes: kv.catatan || kv.notes,
				});
			}
			continue;
		}

		// Shift start bulk
		if (/(mulai shift|start shift|buka shift)/.test(lower)) {
			const cashierName = kv.kasir || kv.cashier || "Kasir";
			const shiftName = kv.shift || "Shift";
			const startingCash = parseNumberLoose(kv.modal || kv.starting_cash || kv.cash || "");
			const parsedDate = parseDateFromLine(line, new Date().getFullYear());
			if (startingCash > 0) {
				result.shiftStarts.push({
					cashierName,
					shiftName,
					startingCash,
					teamMembers: kv.tim || kv.team,
					notes: kv.catatan || kv.notes,
					startTime: parsedDate?.ts,
				});
			}
			continue;
		}

		// Shift end bulk
		if (/(akhiri shift|end shift|tutup shift)/.test(lower)) {
			const endingCashPhysical = parseNumberLoose(kv.kas || kv.ending_cash || kv.cash || "");
			const nonCashConfirmed = parseNumberLoose(kv.noncash || kv.qris || kv.transfer || "0");
			const parsedDate = parseDateFromLine(line, new Date().getFullYear());
			if (endingCashPhysical > 0 || nonCashConfirmed > 0) {
				result.shiftEnds.push({
					endingCashPhysical,
					nonCashConfirmed,
					notes: kv.catatan || kv.notes,
					endTime: parsedDate?.ts,
				});
			}
		}
	}

	return result;
}

function shouldAutoImportUniversalBulk(message: string, parsed: UniversalBulkParsed): boolean {
	const total =
		parsed.products.length +
		parsed.inventory.length +
		parsed.bookings.length +
		parsed.discounts.length +
		parsed.orderStatuses.length +
		parsed.targets.length +
		parsed.shiftStarts.length +
		parsed.shiftEnds.length;
	if (total === 0) return false;
	const text = normText(message);
	if (/(jangan|hanya analisis|preview|simulasi|contoh)/.test(text)) return false;
	return /(bulk|catat|simpan|import|masukkan|proses|generate|buatkan|jalankan)/.test(text) || total >= 2;
}

async function executeUniversalBulkImport(
	ctx: GenericActionCtx<DataModel>,
	parsed: UniversalBulkParsed
): Promise<{
	summary: string;
	toolCalls: Array<{
		name: string;
		status: "success" | "error";
		args?: Record<string, unknown>;
		result?: string;
		error?: string;
	}>;
} | null> {
	const totalParsed =
		parsed.products.length +
		parsed.inventory.length +
		parsed.bookings.length +
		parsed.discounts.length +
		parsed.orderStatuses.length +
		parsed.targets.length +
		parsed.shiftStarts.length +
		parsed.shiftEnds.length;
	if (totalParsed === 0) return null;

	const toolCalls: Array<{
		name: string;
		status: "success" | "error";
		args?: Record<string, unknown>;
		result?: string;
		error?: string;
	}> = [];

	const categories = (await ctx.runQuery(api.products.getCategories)) as Array<{ _id: Id<"categories">; name: string }>;
	const products = (await ctx.runQuery(api.products.getAllProductsAdmin, {})) as Array<{ _id: Id<"products">; name: string; price: number; categoryId: Id<"categories">; isAvailable: boolean }>;
	const inventory = (await ctx.runQuery(api.inventory.getInventory)) as Array<{ _id: Id<"inventory">; ingredientName: string; unit: string; lowStockThreshold: number }>;
	const orders = (await ctx.runQuery(api.orders.getOrders, {})) as Array<{ _id: Id<"orders">; orderNumber?: string }>;
	const bookingSettings = await ctx.db.query("bookingSettings").first();

	let countProduct = 0;
	let countInventory = 0;
	let countBooking = 0;
	let countDiscount = 0;
	let countOrderStatus = 0;
	let countTarget = 0;
	let countShiftStart = 0;
	let countShiftEnd = 0;
	let failed = 0;

	// Products
	for (const row of parsed.products) {
		try {
			let category = categories.find((c) => normText(c.name) === normText(row.categoryName || ""));
			if (!category) category = categories[0];
			if (!category) throw new Error("Kategori produk belum tersedia");
			await ctx.runMutation(api.products.addProduct, {
				name: row.name,
				description: row.description,
				price: row.price,
				categoryId: category._id,
				isAvailable: row.isAvailable ?? true,
			});
			countProduct++;
			toolCalls.push({ name: "createProduct", status: "success", args: { name: row.name, price: row.price, categoryId: category._id } });
		} catch (e) {
			failed++;
			toolCalls.push({ name: "createProduct", status: "error", args: { name: row.name }, error: String(e) });
		}
	}

	// Inventory
	for (const row of parsed.inventory) {
		try {
			const existing = inventory.find((i) => normText(i.ingredientName) === normText(row.ingredientName));
			let inventoryId = existing?._id;
			if (!inventoryId) {
				inventoryId = await ctx.runMutation(api.inventory.createInventoryItem, {
					ingredientName: row.ingredientName,
					unit: row.unit || "pcs",
					quantity: 0,
					lowStockThreshold: row.lowStockThreshold ?? 1,
				});
			}
			await ctx.runMutation(api.inventory.addStock, {
				inventoryId,
				quantity: row.quantity,
				costPerUnit: row.costPerUnit,
				notes: row.notes,
				timestamp: row.date,
			});
			countInventory++;
			toolCalls.push({ name: "addStock", status: "success", args: { ingredientName: row.ingredientName, quantity: row.quantity } });
		} catch (e) {
			failed++;
			toolCalls.push({ name: "addStock", status: "error", args: { ingredientName: row.ingredientName }, error: String(e) });
		}
	}

	// Bookings
	for (const row of parsed.bookings) {
		try {
			const slug = bookingSettings?.slug || "booking";
			const matchedProduct = row.itemName
				? products.find((p) => normText(p.name) === normText(row.itemName!))
				: undefined;
			const qty = row.quantity && row.quantity > 0 ? row.quantity : 1;
			const unitPrice = matchedProduct?.price || (row.totalAmount ? Math.max(1, Math.round(row.totalAmount / qty)) : 10000);
			const totalAmount = row.totalAmount || unitPrice * qty;
			await ctx.runMutation(api.booking.createBookingOrder, {
				slug,
				customerName: row.customerName,
				customerPhone: row.customerPhone,
				customerEmail: row.customerEmail || `${row.customerPhone.replace(/\D/g, "") || "customer"}@booking.local`,
				notes: row.notes,
				bookingDate: row.bookingDate,
				guestCount: row.guestCount,
				items: [
					{
						productId: matchedProduct?._id || "manual-item",
						name: matchedProduct?.name || row.itemName || "Paket Reservasi",
						price: unitPrice,
						quantity: qty,
					},
				],
				totalAmount,
				paymentMethod: row.paymentMethod || "cash",
			});
			countBooking++;
			toolCalls.push({ name: "createBooking", status: "success", args: { customerName: row.customerName, bookingDate: row.bookingDate } });
		} catch (e) {
			failed++;
			toolCalls.push({ name: "createBooking", status: "error", args: { customerName: row.customerName }, error: String(e) });
		}
	}

	// Discounts
	for (const row of parsed.discounts) {
		try {
			let targetIds: string[] | undefined;
			if (row.targetType === "CATEGORY" && row.targetName) {
				const category = categories.find((c) => normText(c.name) === normText(row.targetName!));
				if (category) targetIds = [category._id];
			}
			if (row.targetType === "PRODUCT" && row.targetName) {
				const product = products.find((p) => normText(p.name) === normText(row.targetName!));
				if (product) targetIds = [product._id];
			}
			await ctx.runMutation(api.discounts.createDiscount, {
				name: row.name,
				type: row.type,
				value: row.value,
				targetType: row.targetType,
				targetIds,
				isActive: row.isActive ?? true,
				minOrderValue: row.minOrderValue,
			});
			countDiscount++;
			toolCalls.push({ name: "createDiscount", status: "success", args: { name: row.name, type: row.type, value: row.value } });
		} catch (e) {
			failed++;
			toolCalls.push({ name: "createDiscount", status: "error", args: { name: row.name }, error: String(e) });
		}
	}

	// Order Status updates
	for (const row of parsed.orderStatuses) {
		try {
			const order = orders.find((o) => normText(o.orderNumber || "") === normText(row.orderRef));
			if (!order) throw new Error(`Order ${row.orderRef} tidak ditemukan`);
			await ctx.runMutation(api.orders.updateOrderStatus, { id: order._id, status: row.status, transactionDate: row.date });
			countOrderStatus++;
			toolCalls.push({ name: "updateOrderStatus", status: "success", args: { orderRef: row.orderRef, status: row.status } });
		} catch (e) {
			failed++;
			toolCalls.push({ name: "updateOrderStatus", status: "error", args: { orderRef: row.orderRef, status: row.status }, error: String(e) });
		}
	}

	// Financial targets
	for (const row of parsed.targets) {
		try {
			await ctx.runMutation(api.finance.setFinancialTarget, {
				month: row.month,
				targetRevenue: row.targetRevenue,
				targetProfit: row.targetProfit,
				notes: row.notes,
			});
			countTarget++;
			toolCalls.push({ name: "setFinancialTarget", status: "success", args: { month: row.month, targetRevenue: row.targetRevenue } });
		} catch (e) {
			failed++;
			toolCalls.push({ name: "setFinancialTarget", status: "error", args: { month: row.month }, error: String(e) });
		}
	}

	// Shift start
	for (const row of parsed.shiftStarts) {
		try {
			await ctx.runMutation(api.finance.startShift, {
				cashierName: row.cashierName,
				shiftName: row.shiftName,
				teamMembers: row.teamMembers,
				startingCash: row.startingCash,
				notes: row.notes,
				startTime: row.startTime,
			});
			countShiftStart++;
			toolCalls.push({ name: "startShift", status: "success", args: { cashierName: row.cashierName, shiftName: row.shiftName } });
		} catch (e) {
			failed++;
			toolCalls.push({ name: "startShift", status: "error", args: { cashierName: row.cashierName }, error: String(e) });
		}
	}

	// Shift end
	for (const row of parsed.shiftEnds) {
		try {
			const ongoing = await ctx.runQuery(api.finance.getOngoingShift, {});
			if (!ongoing) throw new Error("Tidak ada shift aktif");
			await ctx.runMutation(api.finance.endShift, {
				shiftId: (ongoing as any)._id,
				endingCashPhysical: row.endingCashPhysical,
				nonCashConfirmed: row.nonCashConfirmed,
				notes: row.notes,
				endTime: row.endTime,
			});
			countShiftEnd++;
			toolCalls.push({ name: "endShift", status: "success", args: { shiftId: (ongoing as any)._id } });
		} catch (e) {
			failed++;
			toolCalls.push({ name: "endShift", status: "error", error: String(e) });
		}
	}

	const summary = [
		"Bulk fitur aplikasi berhasil diproses.",
		`Produk dibuat: ${countProduct}`,
		`Stok diproses: ${countInventory}`,
		`Booking dibuat: ${countBooking}`,
		`Promo/diskon dibuat: ${countDiscount}`,
		`Status order diupdate: ${countOrderStatus}`,
		`Target keuangan di-set: ${countTarget}`,
		`Shift dimulai: ${countShiftStart}`,
		`Shift diakhiri: ${countShiftEnd}`,
		`Gagal: ${failed}`,
		`[SUGGEST: 📊 Cek Ringkasan Keuangan | Tampilkan ringkasan keuangan terbaru setelah bulk proses]`,
		`[SUGGEST: 📦 Cek Inventory Terbaru | Tampilkan item inventory dan perubahan stok setelah bulk proses]`,
		`[SUGGEST: 📋 Audit Hasil Bulk | Tunjukkan daftar data yang berhasil dan yang gagal agar bisa diperbaiki]`,
	].join("\n");

	return { summary, toolCalls };
}

// === STREAMING BUFFERS ===

export const initStreamingMessage = mutation({
	args: { sessionId: v.string() },
	handler: async (ctx, args) => {
		// Clean up old ones for this session
		const existing = await ctx.db
			.query("streamingMessages")
			.withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
			.collect();
		
		for (const doc of existing) {
			await ctx.db.delete(doc._id);
		}

		return await ctx.db.insert("streamingMessages", {
			sessionId: args.sessionId,
			content: "",
			status: "streaming",
			lastUpdated: Date.now(),
		});
	},
});

export const updateStreamingMessage = mutation({
	args: { 
		streamingId: v.id("streamingMessages"), 
		chunk: v.string(),
		isFinal: v.optional(v.boolean()) 
	},
	handler: async (ctx, args) => {
		const doc = await ctx.db.get(args.streamingId);
		if (!doc) return;
		
		await ctx.db.patch(args.streamingId, {
			content: doc.content + args.chunk,
			status: args.isFinal ? "completed" : "streaming",
			lastUpdated: Date.now(),
		});
	},
});

export const getStreamingMessage = query({
	args: { sessionId: v.string() },
	handler: async (ctx, args) => {
		return await ctx.db
			.query("streamingMessages")
			.withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
			.order("desc")
			.first();
	},
});

export const yumiChat = action({
	args: {
		sessionId: v.optional(v.string()),
		message: v.string(),
		contextHint: v.optional(v.string()),
		history: v.array(
			v.object({
				role: v.union(v.literal("user"), v.literal("assistant")),
				content: v.string(),
			})
		),
		images: v.optional(v.array(v.string())), // multiple base64 data URLs for vision processing
		image: v.optional(v.string()), // backward compatibility for single image
	},
	handler: async (ctx, args) => {
		const safeSerialize = (value: unknown) => {
			try {
				return JSON.stringify(value);
			} catch {
				return "[Unserializable tool result]";
			}
		};

		const finalizeResponse = (
			content: string,
			toolCalls: Array<{
				name: string;
				status: "success" | "error";
				args?: Record<string, unknown>;
				result?: string;
				error?: string;
			}> = []
		) => ({ content, toolCalls });

		const parsedUniversalBulk = parseBulkUniversalData(args.message);
		if (shouldAutoImportUniversalBulk(args.message, parsedUniversalBulk)) {
			const universalResult = await executeUniversalBulkImport(ctx, parsedUniversalBulk);
			if (universalResult) {
				return finalizeResponse(universalResult.summary, universalResult.toolCalls);
			}
		}

		const parsedBulkFinance = parseBulkFinancialReport(args.message);
		const receiptItemsFromText = extractReceiptItemsFromText(args.message);
		const bulkFinanceContext = formatBulkFinancialContext(parsedBulkFinance);
		if (shouldAutoImportBulkFinance(args.message, parsedBulkFinance)) {
			const toolCalls: Array<{
				name: string;
				status: "success" | "error";
				args?: Record<string, unknown>;
				result?: string;
				error?: string;
			}> = [];
			let createdCount = 0;
			let failedCount = 0;
			let incomeTotal = 0;
			let expenseTotal = 0;
			for (const tx of parsedBulkFinance!.entries) {
				try {
					await ctx.runMutation(api.finance.createTransaction, {
						type: tx.type,
						amount: tx.amount,
						category: tx.category,
						merchant: tx.merchant,
						description: tx.description || tx.rawLine,
						date: tx.date,
						paymentMethod: tx.paymentMethod || "cash",
						status: "completed",
						metadata: {
							source: "ai_bulk_finance",
							inputMode: "bulk_text",
							aiSessionId: args.sessionId,
							importedAt: Date.now(),
							rawText: tx.rawLine,
							sourceLabel: "AI Bulk",
							scanItems:
								parsedBulkFinance!.entries.length === 1 &&
								tx.type === "expense" &&
								receiptItemsFromText.length > 0
									? receiptItemsFromText
									: undefined,
						},
					});
					createdCount++;
					if (tx.type === "income") incomeTotal += tx.amount;
					else expenseTotal += tx.amount;
					toolCalls.push({
						name: "createTransaction",
						status: "success",
						args: {
							type: tx.type,
							amount: tx.amount,
							category: tx.category,
							date: tx.date,
						},
						result: "ok",
					});
				} catch (e) {
					failedCount++;
					toolCalls.push({
						name: "createTransaction",
						status: "error",
						args: {
							type: tx.type,
							amount: tx.amount,
							category: tx.category,
							date: tx.date,
						},
						error: String(e),
					});
				}
			}

			const dateSet = new Set(parsedBulkFinance!.entries.map((e) => new Date(e.date).toISOString().slice(0, 10)));
			const summary = [
				`Bulk keuangan berhasil diproses.`,
				`Total data terdeteksi: ${parsedBulkFinance!.entries.length} transaksi dari ${dateSet.size} tanggal.`,
				`Berhasil disimpan: ${createdCount} transaksi.`,
				failedCount > 0 ? `Gagal disimpan: ${failedCount} transaksi.` : "Semua transaksi berhasil disimpan.",
				`Total pemasukan tersimpan: Rp${incomeTotal.toLocaleString("id-ID")}`,
				`Total pengeluaran tersimpan: Rp${expenseTotal.toLocaleString("id-ID")}`,
				`[SUGGEST: 📊 Lihat Laporan Keuangan | Tampilkan ringkasan keuangan bulan ini dari data terbaru]`,
				`[SUGGEST: 🔎 Audit Data Tersimpan | Cek ulang transaksi yang baru saya simpan dari bulk report]`,
				`[SUGGEST: 🧾 Rekap Pengeluaran per Kategori | Tampilkan rekap pengeluaran per kategori untuk tanggal yang baru diinput]`,
			].join("\n");

			return finalizeResponse(summary, toolCalls);
		}

		const dbContext = await gatherDatabaseContext(ctx);
		const smartContext = await gatherSmartContext(ctx);
		const inventory = await ctx.runQuery(api.inventory.getInventory);
		const inventoryContext = inventory.map(i => `${i.ingredientName} (${i.unit})`).join(", ");

		const allImages = [...(args.images || [])];
		if (args.image) allImages.push(args.image);
		const hasImageAttachments = allImages.length > 0;

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
				content: `Kamu adalah Yumi, asisten AI cerdas untuk aplikasi YUMI POS (Point of Sale).

WAKTU SEKARANG: ${new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}

KONTEKS BISNIS SAAT INI:
- Inventory Terdaftar: ${inventoryContext}
${args.contextHint ? `- Konteks kasir aktif: ${args.contextHint}` : ""}

KEMAMPUAN:
- Mengetahui SELURUH data database secara real-time (produk, stok, pesanan, keuangan, promosi)
- Dapat merekap dan meringkas data (harian, mingguan, bulanan)
- Dapat mengambil dan menampilkan data spesifik
- Mengetahui seluruh fitur aplikasi dan cara penggunaannya
- Memberikan saran bisnis berdasarkan data
- DAPAT MELAKUKAN AKSI: create/update/delete produk, tambah/kurang stok (dengan FIFO), buat pesanan, catat transaksi keuangan, kelola diskon, dll
- MULTI-STEP ACTIONS: Dapat melakukan beberapa langkah sekaligus dalam satu permintaan
- FORECASTING: Analisis prediksi stok habis, jam ramai, revenue, dan produk trending berdasarkan data historis
- HPP & HARGA: Kamu dapat menghitung HPP (Harga Pokok Produksi) dan memberikan rekomendasi harga jual baru. Jika user setuju (misal: "Oke, naikkan harga kopi susu jadi 15rb"), gunakan tool updateProduct untuk mengubah harga jual secara otomatis.
- REKONSILIASI BANK (PROAKTIF): Jika user mengirim foto mutasi rekening atau screenshot M-Banking, kamu HARUS melakukan cross-check dengan data pesanan dan menawarkan tombol aksi konfirmasi pembayaran.
- KEDALUWARSA & FIFO (PROAKTIF): Pantau data 'expiryDate' pada batch inventory. Jika ada barang mendekati kedaluwarsa, sarankan pembuatan promo flash sale untuk menghabiskan stok tersebut.
- ANALISIS DISKON: Evaluasi efektivitas diskon yang aktif, rekomendasikan strategi promo berdasarkan data penjualan
- REKONSILIASI KEUANGAN: Cross-check pesanan selesai vs transaksi keuangan, identifikasi selisih, bantu rekonsiliasi
- FIFO INVENTORY: Kelola stok berdasarkan tanggal masuk dan harga. Kamu bisa melihat rincian batch stok menggunakan tool getInventoryBatches dan menambah stok dengan tanggal spesifik serta TANGGAL KEDALUWARSA menggunakan addStock.
- ANALISIS GAMBAR: Dapat membaca dan menganalisis gambar (foto struk, kwitansi, produk, mutasi bank, dll). Jika gambar bukan struk keuangan, lakukan "Visual Audit" (analisis kebersihan, penataan produk, atau kondisi toko) dan berikan saran perbaikan.
- VISUALISASI DATA (CHART): Jika user meminta analisis tren atau perbandingan data, kamu WAJIB menyertakan blok JSON chart di akhir pesan dengan format: [CHART: {"type": "bar"|"line"|"pie"|"area", "title": "Judul", "data": [...], "xAxisKey": "name", "series": [{"key": "value", "name": "Label"}]}]
- EKSPOR LAPORAN: Jika user meminta laporan detail atau rekap yang panjang, sediakan tombol download dengan format: [EXPORT: {"title": "Judul Laporan", "rows": [...], "columns": [{"header": "Kolom 1", "key": "key1"}]}]
- INVENTORY EXTRACTION (PROAKTIF): Jika user meminta memasukkan item hasil scan ke inventory, kamu HARUS menentukan satuan (unit) secara otomatis (kg, pcs, porsi, dll) dan kategori yang tepat. JANGAN bertanya kepada user. Cukup beritahu bahwa kamu telah mengisinya secara otomatis.
- DEEP-LINKING ACTIONS: Setiap kali kamu memberikan hasil analisis scan (struk/invoice/mutasi bank), sertakan tombol aksi langsung menggunakan format [SUGGEST: ...] untuk: 📦 Tambah ke Inventory, 💰 Catat Pengeluaran, 🏷️ Buat Produk, atau ✅ Konfirmasi Pembayaran.
- BOOKING & RESERVASI: Kamu dapat membuat booking baru (createBooking) atau bulk booking (bulkCreateBookings) untuk reservasi pelanggan. Pastikan mendapatkan detail pelanggan (nama, telp, email) dan detail booking (tanggal, jumlah tamu, item pesanan).

ATURAN:
1. Jawab dalam Bahasa Indonesia yang ramah dan profesional
2. Gunakan teks polos. Jangan gunakan markdown dekoratif seperti bold (**), italic, heading (#), atau code block.
3. Jangan gunakan simbol asterisk (*) atau underscore (_) untuk penekanan atau dekorasi.
4. Jika menyebutkan kategori (seperti makanan minuman, belanja stok), JANGAN gunakan underscore. Gunakan spasi biasa (contoh: "makanan minuman", bukan "makanan_minuman").
5. Berikan jawaban yang ringkas, padat, dan langsung ke poin.
6. Jika membuat list, gunakan emoji bullet seperti • atau emoji lain, bukan tanda minus, asterisk, atau nomor.
7. Jika ditanya data, berikan angka dan fakta spesifik dari database.
8. Format angka uang dengan "Rp" dan pemisah ribuan.
9. Jika user meminta aksi (tambah produk, update stok, dll), GUNAKAN TOOL yang tersedia.
10. SANGAT PENTING: Pastikan output adalah TEKS POLOS (Plain Text) yang bersih dari simbol-simbol formatting teknis.
11. FORMAT LIST DATA (WAJIB): Untuk list transaksi, keuangan, pesanan, atau data historis lainnya, sertakan tanggal atau rentang tanggal di setiap item. Aturan ini boleh memakai nomor dan tanda minus sesuai format berikut.
    Gunakan format: [Nomor]. - [Tanggal/Periode] - [Nama Item] - [Jumlah] - [Total Nilai]
    Contoh: 1. - 01-28 Feb 2026 - Air Mineral - 110 - Rp 550.000
11b. Jika ada template laporan khusus yang meminta nomor atau tanda minus, ikuti template khusus tersebut. Aturan ini mengalahkan aturan list biasa.
12. FLEKSIBILITAS PARSING & GENERASI OTOMATIS (PROAKTIF): Kamu adalah pakar ekstraksi data yang sangat cerdas. Jika pengguna memberikan daftar data mentah (seperti daftar pengeluaran harian Februari 2026), kamu harus:
    a. EKSTRAK TANGGAL: Perhatikan format tanggal seperti DD/MM/YYYY, DD-MM-YYYY, atau nama bulan. Pastikan setiap baris diproses dengan tanggalnya masing-masing.
    a1. Jika user menyebut tanggal lama atau periode lampau, WAJIB gunakan tanggal historis itu saat memanggil tool. JANGAN ganti ke tanggal hari ini kecuali user memang meminta tanggal hari ini.
    b. GENERASI OTOMATIS: Untuk field yang tidak ada pada input user, GENERATE SECARA OTOMATIS berdasarkan konteks:
       - KATEGORI: Pilih yang paling cocok dari daftar sistem (makanan_minuman, belanja_stok, dll). Contoh: "Galon" -> makanan_minuman, "Gaji" -> gaji_karyawan.
       - SATUAN (INVENTORY): Tentukan unit secara otomatis (kg, pcs, dll). JANGAN bertanya ke user.
       - METODE PEMBAYARAN: Jika tidak disebutkan, gunakan default "cash".
       - DESKRIPSI: Gunakan teks asli dari user sebagai deskripsi.
       - STATUS: Gunakan default "completed".
    c. MULTI-TRANSACTION: Jika data banyak, gunakan tool createTransaction berulang kali (parallel) untuk SETIAP baris data. JANGAN menggabungkan data yang berbeda tanggal atau berbeda kategori kecuali diminta secara eksplisit.
    d. OTOMATISASI: Jangan menanyakan konfirmasi format atau field yang kurang jika kamu bisa melakukan inferensi cerdas. Langsung proses dan berikan laporan hasil eksekusinya.
13. FITUR SMART SUGGESTIONS (UTAMA): JANGAN gunakan bullet points manual (seperti 🔹 atau -) untuk memberikan instruksi langkah selanjutnya. Gunakan format [SUGGEST: Label Tombol | Prompt untuk dikirim ke AI] agar user bisa tinggal KLIK tombol tanpa mengetik.
    WAJIB: Selalu sertakan minimal 2-3 saran tombol otomatis [SUGGEST: ...] di akhir SETIAP jawaban kamu, tidak peduli seberapa singkat jawabannya.
    WAJIB: Jika user mengirim gambar (scan) atau teks daftar transaksi, gunakan data tersebut untuk memberikan saran aksi yang proaktif (seperti simpan transaksi, tambah produk, atau update stok).
    Contoh: "Data pengeluaran Februari sudah saya deteksi. [SUGGEST: 💰 Simpan Semua ke Sistem | Simpan semua daftar pengeluaran Februari 2026 tadi ke sistem transaksi keuangan saya dengan kategori dan detail otomatis] [SUGGEST: 📊 Lihat Laporan Bulan Ini | Berikan ringkasan total pengeluaran saya untuk bulan Februari 2026]"
    Contoh (setelah scan struk): "Saya menemukan struk dari Starbucks sebesar Rp 50.000. [SUGGEST: 📦 Tambah ke Inventory | Masukkan semua item dari hasil scan struk ini ke inventory saya dengan detail otomatis] [SUGGEST: 💰 Catat Pengeluaran | Catat pengeluaran dari Starbucks sebesar Rp 50.000 kategori makanan_minuman]"
14. OTOMATISASI HPP & HARGA (KHUSUS): Jika pengguna bertanya tentang kenaikan harga bahan baku (misal: "Harga susu naik 10%"):
    a. Identifikasi produk yang menggunakan bahan tersebut.
    b. Hitung estimasi kenaikan HPP produk tersebut.
    c. Berikan rekomendasi harga jual baru untuk mempertahankan margin saat ini.
    d. Tawarkan tombol aksi: [SUGGEST: 📈 Update Harga Semua | Perbarui harga jual semua produk terdampak sesuai saran kamu] atau [SUGGEST: 📈 Update Harga [Nama] | Perbarui harga jual produk [Nama] saja]
    e. Jika user mengonfirmasi, panggil tool updateProduct untuk mengeksekusi perubahan harga.

15. RINGKASAN HARIAN (KHUSUS): Jika pengguna meminta "Ringkasan Harian", "Laporan Harian", "Daily Revenue Report", atau semacamnya, WAJIB format hasilnya PERSIS seperti template berikut, jangan gunakan format lain. Ambil data transaksi keuangan dan pesanan hari ini menggunakan tool (seperti getAllTransactions dan getOrders), lalu hitung total dan kategorikan:

📊 Daily Revenue Report 
[Nama Toko (Dari Data Settings) atau "YUMI POS"] - 
📅 Tanggal: [Tanggal Hari Ini, misal 28/03/2026]
⸻ 
👥 SHIFT 1 [Atau nama shift]
Modal Kasir: Rp. [Jumlah Modal Awal]
Cash/Kasir: Rp. [Jumlah Cash dari Pesanan + Pemasukan Manual Cash]
Debit/QRIS: Rp. [Jumlah QRIS/Transfer dari Pesanan + Pemasukan Manual Transfer]
Delivery Online : Rp. [Jumlah dari pesanan GrabFood/GoFood/ShopeeFood/dll jika ada, atau 0]
Total Revenue Shift 1: Rp. [Total Semua Pemasukan Shift 1]
Produk Terjual: [Jumlah Total Item Produk]
Shift 1 : [Nama Kasir]
⸻ 
[Jika ada Shift 2, tambahkan bagian yang sama untuk Shift 2]

💰 TOTAL REVENUE HARIAN: 
Rp. [Grand Total Pemasukan Hari Ini]
📦 TOTAL PRODUK TERJUAL : [Total Produk Semua Shift]
⸻ 
📝 RINGKASAN PENGELUARAN (Berdasarkan Kategori)
[Kategori 1, misal Bahan Baku]: Rp. [Total Pengeluaran Kategori 1]
   - [Nama Item 1]: Rp. [Nominal]
   - [Nama Item 2]: Rp. [Nominal]
[Kategori 2, misal Operasional]: Rp. [Total Pengeluaran Kategori 2]
   - [Nama Item 1]: Rp. [Nominal]
[Kategori Lainnya]: Rp. [Total Pengeluaran Kategori Lainnya]
   - [Nama Item 1]: Rp. [Nominal]
Total Pengeluaran: Rp. [Total Semua Pengeluaran]
⸻ 
📝 RINGKASAN HARIAN 
[Tanggal Singkat, misal 28/03/26] : 
Grand Total Revenue: Rp. [Grand Total]
Total Pengeluaran: Rp. [Total Pengeluaran]
Kas Bersih (Net): Rp. [Total Revenue - Total Pengeluaran]
Total Produk Terjual : [Total Produk Semua Shift]

Pastikan semua angka dihitung dengan benar dari data hari ini. Rincikan kategori pengeluaran dan berikan bullet point daftar item pengeluaran spesifik di bawah tiap kategori.

SMART CONTEXT:
${smartContext}

DATA REAL-TIME:
${dbContext}
${bulkFinanceContext ? `\nHASIL EKSTRAKSI BULK INPUT USER:\n${bulkFinanceContext}` : ""}

INSTRUKSI MULTI-STEP ACTIONS:
- Contoh: "Harga gula naik 20%, apa efeknya?" -> analisis data HPP dari context, hitung kenaikan, dan sarankan harga baru.
- Contoh: "Oke, naikkan harga kopi susu jadi 15rb" -> gunakan updateProduct untuk produk terkait.
- Contoh: "Buat produk kopi susu dan tambah stok bahan-bahannya" -> gunakan createProduct lalu addStock
- Contoh: "Buat pesanan dan catat sebagai pembayaran" -> gunakan createOrder lalu updateOrderStatus
- Contoh: "Diskon 20% untuk kategori minuman dan aktifkan" -> gunakan createDiscount dengan isActive:true
- Contoh: "Analisis efektivitas diskon saya" -> gunakan analyzeDiscountEffectiveness lalu jelaskan hasil
- Contoh: "Rekonsiliasi keuangan bulan ini" -> cek data rekonsiliasi dari context lalu sarankan createReconciliationTransaction jika ada gap
- Contoh: "Hitung HPP untuk produk X dengan bahan Y dan Z" -> gunakan createHppCalculation
- Contoh: "Prediksi stok yang akan habis" -> analisis data forecasting dari context dan berikan rekomendasi
- Contoh: "Ada booking baru dari Budi, 0812345, budi@mail.com, untuk besok, 2 orang, pesan Kopi 2 cup" -> gunakan createBooking
- Lakukan semua langkah yang diperlukan untuk menyelesaikan permintaan user dalam satu sesi

INSTRUKSI TOOL CALLING:
- Gunakan tool saat user meminta aksi spesifik seperti "tambah produk", "update stok", "buat pesanan", "catat pengeluaran"
- Setelah menjalankan tool, jelaskan hasilnya dengan ringkas kepada user
- Jika ada error dari tool, jelaskan masalahnya dan sarankan solusi
- Untuk multi-step actions, lanjutkan dengan langkah berikutnya sampai selesai
- Jika user memberi tanggal spesifik untuk transaksi, stok, order, booking, atau shift, selalu kirim field tanggal/waktu itu ke tool yang relevan.

INSTRUKSI PENCATATAN KEUANGAN:
- Saat mencatat transaksi keuangan, gunakan KATEGORI YANG TEPAT dari daftar berikut:
  - makanan_minuman: Konsumsi, jajan, es batu, air galon/mineral, nasi, lauk, catering rapat.
  - belanja_stok: Kulakan, pembelian bahan baku, belanja harian pasar, stok dagangan.
  - peralatan_kantor: ATK, pembersih (sunlight, sapu, kain pel), peralatan masak (maxim), perlengkapan operasional kecil.
  - transportasi: Bensin (Rian/operasional), parkir, kurir, ojek online, servis kendaraan.
  - utilitas_listrik_air: Listrik, PDAM, internet/wifi, sampah, keamanan.
  - gaji_karyawan: Gaji, upah harian/mingguan (Mang Andri), bonus, THR, uang makan karyawan.
  - sewa_tempat: Sewa gedung/ruko/lahan.
  - pemasaran: Iklan, brosur, banner, promo.
  - pajak: PPN, PPh, retribusi.
  - hiburan: Gathering, kado.
  - kesehatan: Obat, P3K.
  - pembangunan_renovasi: Renovasi, jasa tukang, material bangunan.
  - lainnya: Biaya umum lainnya.
- SELALU sertakan nama merchant/toko jika diketahui (dari scan struk atau dari input user)
- Jika user minta catat dari hasil scan: gunakan nama merchant dan kategori yang terdeteksi oleh scanner

INSTRUKSI REKONSILIASI BANK:
- Jika user mengirim screenshot mutasi bank, bandingkan setiap transaksi uang masuk dengan data pesanan (orders) atau transaksi keuangan (finance) yang ada di SMART CONTEXT atau DATA REAL-TIME.
- Gunakan tool updateOrderStatus untuk menandai pesanan sebagai "paid" jika nominalnya cocok.
- Jika tidak ada pesanan yang cocok, gunakan tool createTransaction untuk mencatatnya sebagai pemasukan baru dengan kategori yang sesuai.`,
			},
		];

		for (const msg of args.history.slice(-10)) {
			messages.push({ role: msg.role, content: msg.content });
		}

		// Support vision: if images are attached, include them in the messages for OpenAI
		if (allImages.length > 0) {
			const contentParts: any[] = [
				{
					type: "text",
					text: args.message || "Tolong analisis gambar-gambar ini dan bantu saya dengan informasi di dalamnya.",
				},
			];

			for (const imgUrl of allImages) {
				contentParts.push({
					type: "image_url",
					image_url: {
						url: imgUrl,
						detail: "auto",
					},
				});
			}

			messages.push({
				role: "user",
				content: contentParts,
			});
		} else {
			messages.push({ role: "user", content: args.message });
		}

		// Multi-step tool calling loop - allows AI to chain multiple tool calls
		const maxIterations = 5;
		let currentIteration = 0;
		let openai: OpenAI;
		try {
			openai = getOpenAI();
		} catch (e) {
			console.error("yumiChat: Failed to initialize OpenAI/SumoPod:", e);
			return finalizeResponse("Maaf, layanan AI sedang tidak tersedia. Pastikan SUMOPOD_API_KEY sudah diatur di dashboard Convex.");
		}

		// Initialize streaming message if sessionId is provided
		let streamingId: Id<"streamingMessages"> | null = null;
		if (args.sessionId) {
			streamingId = await ctx.runMutation(api.ai.initStreamingMessage, {
				sessionId: args.sessionId,
			});
		}

		const executedToolCalls: Array<{
			name: string;
			status: "success" | "error";
			args?: Record<string, unknown>;
			result?: string;
			error?: string;
		}> = [];

		const executeToolCalls = async (incomingToolCalls: any[]) => {
			const toolResults = await Promise.all(incomingToolCalls.map(async (tc) => {
				let parsedArgs: Record<string, unknown> = {};
				try {
					parsedArgs = tc.function?.arguments ? JSON.parse(tc.function.arguments) : {};
				} catch (parseError) {
					const errorMessage = `Argumen tool tidak valid: ${String(parseError)}`;
					executedToolCalls.push({
						name: tc.function.name,
						status: "error",
						error: errorMessage,
					});
					return {
						role: "tool",
						tool_call_id: tc.id,
						name: tc.function.name,
						content: formatToolResult(tc.function.name, null, errorMessage),
					};
				}

				try {
					const result = await ctx.runAction(api.toolExecutors.executeToolCall, {
						toolName: tc.function.name,
						args: parsedArgs,
					});
					executedToolCalls.push({
						name: tc.function.name,
						status: result.success ? "success" : "error",
						args: parsedArgs,
						result: result.success ? safeSerialize(result.result) : undefined,
						error: result.success ? undefined : String(result.error),
					});
					return {
						role: "tool",
						tool_call_id: tc.id,
						name: tc.function.name,
						content: result.success ? formatToolResult(tc.function.name, result.result) : formatToolResult(tc.function.name, null, result.error),
					};
				} catch (e) {
					const errorMessage = String(e);
					executedToolCalls.push({
						name: tc.function.name,
						status: "error",
						args: parsedArgs,
						error: errorMessage,
					});
					return {
						role: "tool",
						tool_call_id: tc.id,
						name: tc.function.name,
						content: formatToolResult(tc.function.name, null, errorMessage),
					};
				}
			}));

			for (const res of toolResults) {
				messages.push(res as OpenAI.ChatCompletionToolMessageParam);
			}
		};

		while (currentIteration < maxIterations) {
			currentIteration++;
			let completion;
			try {
				if (currentIteration === 1 && !hasImageAttachments) {
					// First iteration: use streaming for content
					const response = await openai.chat.completions.create({
						model: "gpt-4o",
						messages,
						tools: openaiTools,
						tool_choice: "auto",
						stream: true,
					});

					let fullContent = "";
					let toolCalls: any[] = [];

					for await (const chunk of response) {
						const delta = chunk.choices[0]?.delta;
						if (!delta) continue;
						
						if (delta.content) {
							fullContent += delta.content;
							if (streamingId) {
								await ctx.runMutation(api.ai.updateStreamingMessage, {
									streamingId,
									chunk: delta.content,
								});
							}
						}
						
						if (delta.tool_calls) {
							for (const tc of delta.tool_calls) {
								if (!toolCalls[tc.index]) {
									toolCalls[tc.index] = { id: tc.id, function: { name: "", arguments: "" }, type: "function" };
								}
								if (tc.id) toolCalls[tc.index].id = tc.id;
								if (tc.function?.name) toolCalls[tc.index].function.name += tc.function.name;
								if (tc.function?.arguments) toolCalls[tc.index].function.arguments += tc.function.arguments;
							}
						}
					}

					const finalToolCalls = toolCalls.filter(tc => tc.id);
					
					// Finalize streaming for this pass
					if (streamingId && fullContent) {
						await ctx.runMutation(api.ai.updateStreamingMessage, {
							streamingId,
							chunk: "",
							isFinal: finalToolCalls.length === 0, // Final ONLY if no tools are called
						});
					}

					if (finalToolCalls.length === 0) return finalizeResponse(fullContent, executedToolCalls);

					const assistantMsg = { role: "assistant", content: fullContent || null, tool_calls: finalToolCalls };
					messages.push(assistantMsg as OpenAI.ChatCompletionMessageParam);

					await executeToolCalls(finalToolCalls);
					
				} else {
					// Use non-streaming for image attachments because some providers are less stable
					// with streaming + tools + multimodal in a single request.
					completion = await openai.chat.completions.create({
						model: "gpt-4o",
						messages,
						tools: openaiTools,
						tool_choice: "auto",
						max_tokens: currentIteration === 1 ? 1400 : 1000,
					});

					const responseMessage = completion.choices[0].message;
					if (!responseMessage.tool_calls || responseMessage.tool_calls.length === 0) {
						if (streamingId && responseMessage.content) {
							await ctx.runMutation(api.ai.updateStreamingMessage, {
								streamingId,
								chunk: "\n\n" + responseMessage.content,
								isFinal: true,
							});
						}
						return finalizeResponse(responseMessage.content ?? "", executedToolCalls);
					}

					messages.push(responseMessage as OpenAI.ChatCompletionMessageParam);
					
					await executeToolCalls(responseMessage.tool_calls);
				}
			} catch (apiError) {
				console.error("yumiChat API error:", apiError);
				if (hasImageAttachments) {
					try {
						const fallbackContent = await fallbackAnalyzeChatImages({
							images: allImages,
							message:
								args.message ||
								"Tolong analisis gambar yang saya lampirkan.",
							contextHint: args.contextHint,
						});
						if (fallbackContent) {
							if (streamingId) {
								await ctx.runMutation(api.ai.updateStreamingMessage, {
									streamingId,
									chunk: fallbackContent,
									isFinal: true,
								});
							}
							return finalizeResponse(fallbackContent, executedToolCalls);
						}
					} catch (fallbackError) {
						console.error("yumiChat image fallback error:", fallbackError);
					}
				}
				const errMsg = apiError instanceof Error ? apiError.message : String(apiError);
				if (errMsg.includes("401") || errMsg.includes("Unauthorized")) {
					return finalizeResponse("Maaf, API key tidak valid. Silakan periksa SUMOPOD_API_KEY di dashboard Convex.", executedToolCalls);
				}
				if (errMsg.includes("429") || errMsg.includes("rate limit")) {
					return finalizeResponse("Maaf, batas penggunaan API tercapai. Silakan coba lagi dalam beberapa saat.", executedToolCalls);
				}
				if (errMsg.includes("timeout") || errMsg.includes("ECONNREFUSED")) {
					return finalizeResponse("Maaf, koneksi ke server AI gagal. Silakan coba lagi.", executedToolCalls);
				}
				return finalizeResponse("Maaf, terjadi kesalahan saat memproses permintaan. Silakan coba lagi.", executedToolCalls);
			}
		}

		// Fallback: return last message if max iterations reached
		try {
			const finalCompletion = await openai.chat.completions.create({
				model: "gpt-4o",
				messages,
				max_tokens: 1000,
			});
			const finalContent = finalCompletion.choices[0].message.content;
			
			if (streamingId && finalContent) {
				await ctx.runMutation(api.ai.updateStreamingMessage, {
					streamingId,
					chunk: "\n\n(Tugas dihentikan karena terlalu panjang)\n" + finalContent,
					isFinal: true,
				});
			}
			return finalizeResponse(finalContent ?? "", executedToolCalls);
		} catch (finalError) {
			console.error("yumiChat final completion error:", finalError);
			return finalizeResponse("Maaf, terjadi kesalahan saat menyelesaikan respons. Silakan coba lagi.", executedToolCalls);
		}
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
		try {
			return await safeSumoPodCall([
				{
					role: "system",
					content: `Kamu adalah Yumi, asisten AI bisnis.
Tujuan: Berikan analisis ringkas berdasarkan data hari ini dan perbandingannya.
Aturan:
1. JANGAN gunakan markdown bold (**). Gunakan TEKS BIASA.
2. Gunakan emoji untuk kejelasan.
3. WAJIB: Setiap list data (pemasukan, pengeluaran, pesanan) harus menyertakan tanggal atau periode waktu dengan format: [Nomor]. - [Tanggal/Periode] - [Nama Item] - [Jumlah] - [Total Nilai].
4. Struktur:
   📊 [Ringkasan Utama: naik/turun dibanding kemarin/minggu lalu]
   💰 Keuangan: [Saldo & Perbandingan]
   📦 Stok: [Status & Item krusial]
   🛒 Pesanan: [Total & Tren]
   💡 Saran: [1 Aksi Spesifik]
5. Bahasa Indonesia yang profesional dan to-the-point.`,
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
			]);
		} catch (error) {
			console.error("generateCompanyOverview error:", error);
			return "Maaf, gagal membuat ringkasan bisnis. Pastikan SUMOPOD_API_KEY sudah diatur di dashboard Convex.";
		}
	},
});

/**
 * Yumi AI - Generate a Business Status Briefing (Anytime)
 */
export const generateBusinessBriefing = action({
	args: {
		localHour: v.optional(v.number()), // Hour from 0-23
		context: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		// Determine greeting based on local hour
		let greeting = "Selamat pagi";
		if (args.localHour !== undefined) {
			if (args.localHour >= 11 && args.localHour < 15) greeting = "Selamat siang";
			else if (args.localHour >= 15 && args.localHour < 18) greeting = "Selamat sore";
			else if (args.localHour >= 18 || args.localHour < 4) greeting = "Selamat malam";
		}

		// Get time ranges for today and yesterday
		const now = new Date();
		const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
		const yesterdayStart = todayStart - 24 * 60 * 60 * 1000;
		const yesterdayEnd = todayStart - 1;
		const todayIso = new Date(todayStart).toISOString().split("T")[0];

		const formatCurrency = (value: number) => `Rp ${Math.round(value || 0).toLocaleString("id-ID")}`;
		const formatPercent = (value: number) => `${Math.abs(value || 0).toFixed(1)}%`;

		// Gather all relevant data once so fallback can still be complete
		const [
			financeSummary,
			todayFinance,
			yesterdayFinance,
			inventory,
			orders,
			bookingOrdersRaw,
			pendingTasks,
		] = await Promise.all([
			ctx.runQuery(api.finance.getFinancialSummary, {}),
			ctx.runQuery(api.finance.getFinancialSummary, { startDate: todayStart }),
			ctx.runQuery(api.finance.getFinancialSummary, { startDate: yesterdayStart, endDate: yesterdayEnd }),
			ctx.runQuery(api.inventory.getInventory),
			ctx.runQuery(api.orders.getOrders, { limit: 50 }),
			ctx.runQuery(api.booking.getBookingOrders, { slug: "booking" }),
			ctx.runQuery(api.ai.getPendingTasks),
		]);

		const bookingOrders = Array.isArray(bookingOrdersRaw) ? bookingOrdersRaw : [];
		const lowStockItems = inventory.filter((i) => i.quantity <= i.lowStockThreshold);
		const todayBookings = bookingOrders.filter((b: any) => b.bookingDate === todayIso);

		const productSales: Record<string, number> = {};
		orders.forEach((order) => {
			if (order.status === "paid" || order.status === "completed") {
				order.items.forEach((item) => {
					productSales[item.productName] = (productSales[item.productName] || 0) + item.quantity;
				});
			}
		});
		const trendingProduct = Object.entries(productSales)
			.sort(([, a], [, b]) => b - a)[0]?.[0] || "belum ada data";

		const revenueToday = todayFinance.totalIncome || 0;
		const revenueYesterday = yesterdayFinance.totalIncome || 0;
		const revenueGrowth =
			revenueYesterday === 0
				? revenueToday > 0
					? 100
					: 0
				: ((revenueToday - revenueYesterday) / revenueYesterday) * 100;

		const dataContext = {
			revenueToday,
			revenueYesterday,
			revenueGrowth,
			lowStockCount: lowStockItems.length,
			lowStockNames: lowStockItems
				.slice(0, 5)
				.map((i) => `${i.ingredientName} (${i.quantity} ${i.unit})`)
				.join(", "),
			todayBookingsCount: todayBookings.length,
			todayBookingsNames: todayBookings
				.slice(0, 3)
				.map((b: any) => `${b.customerName} (${b.guestCount} org)`)
				.join(", "),
			balance: financeSummary.netBalance || 0,
			pendingTasksCount: pendingTasks.length,
			pendingTasksTitles: (pendingTasks as any[])
				.slice(0, 3)
				.map((t) => t.title)
				.join(", "),
			trendingProduct,
		};

		const actionSuggestions = [
			"[SUGGEST: Laporan Lengkap | Berikan laporan performa bisnis saya secara mendalam]",
			dataContext.lowStockCount > 0
				? "[SUGGEST: Belanja Stok | Ingatkan saya belanja stok untuk item kritis sekarang]"
				: "[SUGGEST: Cek Stok Rendah | Item apa saja yang stoknya hampir habis?]",
			dataContext.todayBookingsCount > 0
				? "[SUGGEST: Tinjau Reservasi | Tampilkan daftar booking hari ini dan status pembayarannya]"
				: "[SUGGEST: Cek Reservasi | Tampilkan daftar booking untuk hari ini]",
			"[SUGGEST: Analisis Omzet | Mengapa omzet hari ini berubah dibanding kemarin?]",
		];

		const fallbackBriefing = `${greeting}! Senang bertemu Anda lagi. Saya siap membantu mengelola toko hari ini.

STATUS BISNIS (SAAT INI):
- Kondisi saat ini: ${revenueToday > 0 ? "Penjualan sudah berjalan dan ada transaksi masuk hari ini." : "Aktivitas penjualan hari ini masih rendah, saatnya dorong penjualan."}

PERFORMA KEUANGAN:
- Omzet hari ini: ${formatCurrency(dataContext.revenueToday)}
- Omzet kemarin: ${formatCurrency(dataContext.revenueYesterday)} (${dataContext.revenueGrowth >= 0 ? "naik" : "turun"} ${formatPercent(dataContext.revenueGrowth)})
- Saldo kas bersih: ${formatCurrency(dataContext.balance)}

OPERASIONAL & STOK:
- ${
			dataContext.lowStockCount > 0
				? `Ada ${dataContext.lowStockCount} item stok rendah: ${dataContext.lowStockNames}`
				: "Semua stok aman, tidak ada item kritis saat ini."
		}

RESERVASI HARI INI:
- Jumlah booking: ${dataContext.todayBookingsCount}
- ${
			dataContext.todayBookingsCount > 0
				? `Pelanggan terdekat: ${dataContext.todayBookingsNames}`
				: "Belum ada reservasi untuk hari ini."
		}

INSIGHTS & ANALITIK:
- Produk terlaris saat ini: ${dataContext.trendingProduct}
- Tugas pending: ${dataContext.pendingTasksCount}${
			dataContext.pendingTasksTitles ? ` (${dataContext.pendingTasksTitles})` : ""
		}

PENUTUP:
Tetap semangat, performa bisnis Anda sudah terpantau dan siap dioptimalkan hari ini.

Apa yang ingin Anda lakukan sekarang? ${actionSuggestions.join(" ")}`;

		try {
			return await safeSumoPodCall([
				{
					role: "system",
					content: `Kamu adalah Yumi, asisten AI bisnis yang ceria, proaktif, dan SANGAT DETAIL.
Tugas: Berikan Briefing Bisnis (Status Real-time) yang menyeluruh dan informatif untuk pemilik toko.
Gunakan data riil yang diberikan untuk memberikan ringkasan performa yang mendalam. Briefing ini bisa diberikan kapan saja (pagi, siang, sore, atau malam).

FORMAT BRIEFING (WAJIB):
1. Sapa dengan "${greeting}!".
2. STATUS BISNIS (SAAT INI):
   - Berikan ringkasan satu kalimat tentang kondisi toko saat ini (misal: "Toko sedang sibuk", "Omzet hari ini sangat baik", dll).
3. PERFORMA KEUANGAN: 
   - Omzet hari ini vs kemarin (sebutkan angka riil & persentase kenaikan/penurunan).
   - Total saldo kas bersih saat ini.
4. OPERASIONAL & STOK: 
   - Sebutkan item stok yang kritis secara spesifik (nama & sisa jumlah).
   - Beritahu jika semua stok aman.
5. RESERVASI HARI INI: 
   - Sebutkan jumlah booking hari ini.
   - Jika ada booking, sebutkan nama-nama pelanggan pertama dan jumlah tamunya.
6. INSIGHTS & ANALITIK: 
   - Sebutkan produk yang paling laku hari ini.
   - Informasikan jumlah tugas yang masih pending dan sebutkan judul tugas teratas.
7. PENUTUP: Kalimat motivasi singkat yang disesuaikan dengan kondisi bisnis.
8. TOMBOL AKSI: Berikan 3-4 saran tombol aksi [SUGGEST: ...] yang relevan dengan data (contoh: [SUGGEST: Belanja Stok | Ingatkan saya untuk belanja stok yang hampir habis], [SUGGEST: Analisis Omzet | Mengapa omzet hari ini berubah dibanding kemarin?]).

ATURAN KETAT:
- JANGAN gunakan bold (**). Gunakan TEKS BIASA.
- Gunakan emoji yang banyak dan relevan agar menarik dibaca.
- JANGAN gunakan format markdown list. Gunakan bullet sederhana seperti "-".
- Pastikan semua angka uang diformat dengan Rp dan pemisah ribuan.
- Berikan rincian nama item/pelanggan, jangan hanya angka.`,
				},
				{
					role: "user",
					content: `Data Bisnis Riil (DETAIL):
- Keuangan: Omzet Hari Ini Rp ${dataContext.revenueToday.toLocaleString("id-ID")}, Omzet Kemarin Rp ${dataContext.revenueYesterday.toLocaleString("id-ID")} (${dataContext.revenueGrowth >= 0 ? "naik" : "turun"} ${Math.abs(dataContext.revenueGrowth).toFixed(1)}% dari kemarin), Total Saldo Bersih Rp ${dataContext.balance.toLocaleString("id-ID")}
- Inventaris: ${dataContext.lowStockCount} item stok rendah (${dataContext.lowStockNames || "Semua stok aman"})
- Reservasi: ${dataContext.todayBookingsCount} booking hari ini ${dataContext.todayBookingsNames ? `(${dataContext.todayBookingsNames})` : ""}
- Analitik: Produk terlaris saat ini adalah ${dataContext.trendingProduct}
- Manajemen Tugas: Ada ${dataContext.pendingTasksCount} tugas menunggu ${dataContext.pendingTasksTitles ? `(${dataContext.pendingTasksTitles})` : ""}
${args.context ? `- Konteks Tambahan: ${args.context}` : ""}`,
				},
			]);
		} catch (error) {
			console.error("generateDailyBriefing error:", error);
			return fallbackBriefing;
		}
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
		const [
			products,
			inventory,
			orders,
			financialSummary,
			_discounts,
			allTransactions,
		] = await Promise.all([
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
			const transactionsList = (
				allTransactions as Array<{
					_id: string;
					date: number;
					type: "income" | "expense";
					amount: number;
					category: string;
					description?: string;
					paymentMethod?: string;
					status: string;
				}>
			).map((t) => ({
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

		return await safeSumoPodCall([
			{
				role: "system",
				content:
					"Kamu adalah analis bisnis yang ahli. Buat laporan yang jelas, terstruktur, dan actionable. Gunakan Bahasa Indonesia. Format dengan bullet points dan emoji. WAJIB: Setiap item dalam list (transaksi, pesanan, dll) harus menyertakan tanggal atau periode waktu dengan format: [Nomor]. - [Tanggal/Periode] - [Nama Item] - [Jumlah] - [Total Nilai].",
			},
			{ role: "user", content: prompt },
		]);
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
		| "price_opt"
		| "hpp_low_margin"
		| "revenue_opportunity"
		| "best_promo_day"
		| "bundle_opportunity"
		| "expiry_alert";
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

		// Check 1: Low Stock & Expiry Monitoring
		const inventory = await ctx.db.query("inventory").collect();

		for (const item of inventory) {
			// Low Stock Check
			if (item.quantity <= item.lowStockThreshold) {
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
							quantity: item.lowStockThreshold * 2 - item.quantity,
							notes: "Auto-restock dari AI suggestion",
						},
					},
					priority: percentage < 20 ? "high" : "medium",
					createdAt: now,
				});
			}

			// Expiry Monitoring (FIFO Batches) - Optimized to query per item
			const activeBatches = await ctx.db
				.query("inventoryTransactions")
				.withIndex("by_inventory", (q) => q.eq("inventoryId", item._id))
				.filter((q) => q.gt(q.field("remainingQuantity"), 0))
				.collect();

			for (const batch of activeBatches) {
				if (!batch.expiryDate) continue;
				const daysToExpiry = Math.ceil(((batch.expiryDate as number) - now) / (24 * 60 * 60 * 1000));
				
				if (daysToExpiry <= 7 && daysToExpiry > 0) {
					suggestions.push({
						id: `expiry_${batch._id}`,
						type: "expiry_alert",
						title: `⚠️ Kedaluwarsa Dekat: ${item.ingredientName}`,
						description: `Batch stok ini (${batch.remainingQuantity} ${item.unit}) akan kedaluwarsa dalam ${daysToExpiry} hari.`,
						action: {
							toolName: "createDiscount",
							args: {
								name: `Flash Sale: Habiskan Stok ${item.ingredientName}`,
								type: "PERCENTAGE",
								value: 50,
								description: `Promo pembersihan stok hampir kedaluwarsa`
							},
						},
						priority: daysToExpiry <= 3 ? "high" : "medium",
						createdAt: now,
					});
				}
			}
		}

		// Check 2: Pending Orders (Use index)
		const pendingOrders = await ctx.db
			.query("orders")
			.withIndex("by_status", (q) => q.eq("status", "pending"))
			.collect();

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

		// Check 3: Trending Products & Forecasting (last 30 days only for comprehensive insights)
		const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
		const ordersLast30Days = await ctx.db
			.query("orders")
			.withIndex("by_createdAt", (q) => q.gte("createdAt", thirtyDaysAgo))
			.collect();

		// Filter for only paid/completed orders from the last 30 days
		const completedOrders = ordersLast30Days.filter(
			(o) => o.status === "completed" || o.status === "paid"
		);
		
		if (completedOrders.length >= 10) {
			const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
			const fourteenDaysAgo = now - 14 * 24 * 60 * 60 * 1000;
			
			const recentOrders = completedOrders.filter(o => o.createdAt >= sevenDaysAgo);
			const previousOrders = completedOrders.filter(o => o.createdAt >= fourteenDaysAgo && o.createdAt < sevenDaysAgo);

			const recentSales: Record<string, number> = {};
			const previousSales: Record<string, number> = {};

			for (const order of recentOrders) {
				for (const item of order.items) {
					recentSales[item.productName] = (recentSales[item.productName] || 0) + item.quantity;
				}
			}
			for (const order of previousOrders) {
				for (const item of order.items) {
					previousSales[item.productName] = (previousSales[item.productName] || 0) + item.quantity;
				}
			}

			// Find trending products with significant growth
			for (const [productName, recentQty] of Object.entries(recentSales)) {
				const prevQty = previousSales[productName] || 0;
				if (prevQty > 0) {
					const growth = ((recentQty - prevQty) / prevQty) * 100;
					if (growth >= 30) {
						suggestions.push({
							id: `trending_growth_${productName.replace(/\s+/g, "_")}`,
							type: "trending",
							title: `Lonjakan Penjualan: ${productName}`,
							description: `Penjualan ${productName} melonjak ${Math.round(growth)}% minggu ini. Pastikan stok bahan baku aman!`,
							action: {
								toolName: "addStock",
								args: { productName, growth: Math.round(growth) },
							},
							priority: "high",
							createdAt: now,
						});
					}
				}
			}
		}

		// Check 4: Bundle Opportunity (Smart Bundle Forecasting)
		if (completedOrders.length >= 15) {
			const productPairs: Record<string, number> = {};
			const productPrices: Record<string, number> = {};

			for (const order of completedOrders) {
				const items = order.items.map(i => {
					productPrices[i.productName] = i.price;
					return i.productName;
				}).sort();
				
				for (let i = 0; i < items.length; i++) {
					for (let j = i + 1; j < items.length; j++) {
						const pair = `${items[i]} + ${items[j]}`;
						productPairs[pair] = (productPairs[pair] || 0) + 1;
					}
				}
			}

			const topPairs = Object.entries(productPairs)
				.sort((a, b) => b[1] - a[1])
				.filter(p => p[1] >= 3)
				.slice(0, 2);

			for (const [pair, count] of topPairs) {
				const [p1, p2] = pair.split(" + ");
				const estimatedBundlePrice = ((productPrices[p1] || 0) + (productPrices[p2] || 0)) * 0.85; // 15% discount
				
				suggestions.push({
					id: `bundle_opp_${pair.replace(/\s+/g, "_")}`,
					type: "bundle_opportunity",
					title: `Peluang Paket Hemat: ${pair}`,
					description: `Produk ini sering dibeli bersama (${count} kali). Buat paket bundle untuk meningkatkan transaksi!`,
					action: {
						toolName: "createDiscount",
						args: { 
							name: `Paket Hemat ${pair}`, 
							type: "FIXED", 
							value: Math.round(estimatedBundlePrice),
							description: `Promo otomatis dari saran Yumi AI`
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

		// Check 6: HPP Low Margin Alert
		const hppDashboard = await ctx.runQuery(api.hpp.getHppDashboardData);
		if (hppDashboard && hppDashboard.lowMarginAlerts.length > 0) {
			const lowMarginCount = hppDashboard.lowMarginAlerts.length;
			suggestions.push({
				id: "hpp_low_margin_bulk",
				type: "hpp_low_margin",
				title: `${lowMarginCount} produk dengan margin rendah`,
				description: `${hppDashboard.lowMarginAlerts
					.slice(0, 3)
					.map((a) => a.name)
					.join(
						", "
					)} memiliki margin di bawah 20%. Pertimbangkan untuk naikkan harga atau kurangi biaya.`,
				action: null,
				priority: "medium",
				createdAt: now,
			});
		}

		// Check 7: Revenue Opportunity - identify best selling days
		if (completedOrders.length >= 20) {
			const dayRevenue: Record<number, number> = {};
			const dayCount: Record<number, number> = {};

			for (const order of completedOrders) {
				const day = new Date(order.createdAt).getDay();
				dayRevenue[day] = (dayRevenue[day] || 0) + order.totalAmount;
				dayCount[day] = (dayCount[day] || 0) + 1;
			}

			// Find best and worst performing days
			const dayNames = [
				"Minggu",
				"Senin",
				"Selasa",
				"Rabu",
				"Kamis",
				"Jumat",
				"Sabtu",
			];
			const dayAnalysis = Object.keys(dayRevenue).map((day) => ({
				day: Number.parseInt(day, 10),
				dayName: dayNames[Number.parseInt(day, 10)],
				revenue: dayRevenue[Number.parseInt(day, 10)],
				orders: dayCount[Number.parseInt(day, 10)],
			}));

			dayAnalysis.sort((a, b) => b.revenue - a.revenue);
			const bestDay = dayAnalysis[0];
			const worstDay = dayAnalysis.at(-1);

			if (bestDay && worstDay && bestDay.revenue > worstDay.revenue * 1.5) {
				suggestions.push({
					id: "best_promo_day",
					type: "best_promo_day",
					title: `${bestDay.dayName} adalah hari terbaik`,
					description: `Pendapatan tertinggi di ${bestDay.dayName} (Rp${bestDay.revenue.toLocaleString("id-ID")}). Pertimbangkan promosi khusus di hari ini.`,
					action: null,
					priority: "low",
					createdAt: now,
				});
			}
		}

		// Check 8: Bundle Opportunity - products often bought together
		if (completedOrders.length >= 10) {
			const productPairs: Record<string, number> = {};

			for (const order of completedOrders) {
				const items = order.items.map((i) => i.productName).sort();
				// Count pairs of products in same order
				for (let i = 0; i < items.length; i++) {
					for (let j = i + 1; j < items.length; j++) {
						const pair = `${items[i]} + ${items[j]}`;
						productPairs[pair] = (productPairs[pair] || 0) + 1;
					}
				}
			}

			// Find most common pairs
			const topPairs = Object.entries(productPairs)
				.sort((a, b) => b[1] - a[1])
				.filter((p) => p[1] >= 3) // At least 3 times together
				.slice(0, 2);

			for (const [pair, count] of topPairs) {
				suggestions.push({
					id: `bundle_${pair.replace(/\s+/g, "_")}`,
					type: "bundle_opportunity",
					title: `Buat paket bundle: ${pair}`,
					description: `Produk ini sering dibeli bersama (${count} kali). Pertimbangkan membuat promo bundle.`,
					action: null,
					priority: "low",
					createdAt: now,
				});
			}
		}

		// Check 9: Revenue Growth Opportunity
		if (completedOrders.length >= 30) {
			const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
			const fifteenDaysAgo = now - 15 * 24 * 60 * 60 * 1000;

			const recentRevenue = completedOrders
				.filter((o) => o.createdAt >= fifteenDaysAgo)
				.reduce((sum, o) => sum + o.totalAmount, 0);
			const olderRevenue = completedOrders
				.filter(
					(o) => o.createdAt >= thirtyDaysAgo && o.createdAt < fifteenDaysAgo
				)
				.reduce((sum, o) => sum + o.totalAmount, 0);

			if (recentRevenue > olderRevenue * 1.1) {
				suggestions.push({
					id: "revenue_growth",
					type: "revenue_opportunity",
					title: "Pendapatan meningkat!",
					description: `Pendapatan 15 hari terakhir ${(recentRevenue / olderRevenue).toFixed(0)}x lebih tinggi. Pertimbangkan scale up bisnis.`,
					action: null,
					priority: "low",
					createdAt: now,
				});
			}
		}

		// De-duplicate similar suggestions (same type + title + description)
		const dedupedSuggestions: ProactiveSuggestion[] = [];
		const dedupeKeys = new Set<string>();
		for (const suggestion of suggestions) {
			const key = `${suggestion.type}|${suggestion.title.trim().toLowerCase()}|${suggestion.description.trim().toLowerCase()}`;
			if (dedupeKeys.has(key)) continue;
			dedupeKeys.add(key);
			dedupedSuggestions.push(suggestion);
		}

		// Sort suggestions by priority
		const priorityOrder = { high: 0, medium: 1, low: 2 };
		dedupedSuggestions.sort((a, b) => {
			const priorityA = priorityOrder[a.priority] ?? 1;
			const priorityB = priorityOrder[b.priority] ?? 1;
			if (priorityA !== priorityB) {
				return priorityA - priorityB;
			}
			return b.createdAt - a.createdAt;
		});

		return dedupedSuggestions.slice(0, 10); // Return top 10 suggestions
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
		
		// Optimized: Only fetch orders from last 30 days
		const daysToAnalyze = 30;
		const cutoffDate = Date.now() - daysToAnalyze * 24 * 60 * 60 * 1000;
		const orders = await ctx.db
			.query("orders")
			.withIndex("by_createdAt", (q) => q.gte("createdAt", cutoffDate))
			.collect();

		const completedOrders = orders.filter(
			(o) => o.status === "completed" || o.status === "paid"
		);

		// Calculate daily usage for each inventory item
		const itemUsage: Record<string, number> = {};

		for (const order of completedOrders) {
			for (const item of order.items) {
				// This is a simplified calculation
				const productName = item.productName;
				itemUsage[productName] = (itemUsage[productName] || 0) + item.quantity;
			}
		}

		// Predict which items will run out
		const predictions = inventory
			.map((item) => {
				const dailyUsage =
					(itemUsage[item.ingredientName] || 0) / daysToAnalyze;
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
		// Optimized: Only fetch orders from last 30 days for busy hours pattern
		const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
		const orders = await ctx.db
			.query("orders")
			.withIndex("by_createdAt", (q) => q.gte("createdAt", thirtyDaysAgo))
			.collect();

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
		// Optimized: Only fetch orders from last 45 days for revenue trend analysis
		const daysToAnalyze = 45;
		const cutoffDate = Date.now() - daysToAnalyze * 24 * 60 * 60 * 1000;
		const orders = await ctx.db
			.query("orders")
			.withIndex("by_createdAt", (q) => q.gte("createdAt", cutoffDate))
			.collect();

		const completedOrders = orders.filter(
			(o) => o.status === "completed" || o.status === "paid"
		);

		// Calculate daily revenue for the fetched period
		const dailyRevenue: Record<string, number> = {};

		for (const order of completedOrders) {
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

/**
 * Predict trending products based on sales velocity
 */
export const predictTrendingProducts = query({
	args: {
		daysAhead: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const _daysAhead = args.daysAhead || 7;
		// Optimized: Only fetch orders from last 14 days for trending analysis
		const fourteenDaysAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
		const orders = await ctx.db
			.query("orders")
			.withIndex("by_createdAt", (q) => q.gte("createdAt", fourteenDaysAgo))
			.collect();
		const products = await ctx.db.query("products").collect();

		const completedOrders = orders.filter(
			(o) => o.status === "completed" || o.status === "paid"
		);

		// Calculate sales for recent periods
		const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

		const recentSales: Record<string, number> = {};
		const previousSales: Record<string, number> = {};

		for (const order of completedOrders) {
			for (const item of order.items) {
				if (order.createdAt >= sevenDaysAgo) {
					recentSales[item.productName] =
						(recentSales[item.productName] || 0) + item.quantity;
				} else {
					previousSales[item.productName] =
						(previousSales[item.productName] || 0) + item.quantity;
				}
			}
		}

		// Calculate trend for each product
		const trendingProducts = products
			.map((product) => {
				const recentQty = recentSales[product.name] || 0;
				const previousQty = previousSales[product.name] || 0;

				const growthRate =
					previousQty > 0 ? (recentQty - previousQty) / previousQty : 0;
				const velocity = recentQty / 7; // sales per day

				return {
					...product,
					recentSales: recentQty,
					previousSales: previousQty,
					growthRate: Math.round(growthRate * 100),
					velocity: Math.round(velocity * 10) / 10,
					predictedNextWeek:
						growthRate > 0
							? Math.round(recentQty * (1 + growthRate))
							: recentQty,
				};
			})
			.filter((p) => p.recentSales > 0 || p.previousSales > 0)
			.sort((a, b) => b.growthRate - a.growthRate);

		return trendingProducts.slice(0, 10);
	},
});

/**
 * Predict best time for promotions
 */
export const predictBestPromoTime = query({
	args: {},
	handler: async (ctx) => {
		// Optimized: Only fetch orders from last 60 days for reliable promotion timing analysis
		const sixtyDaysAgo = Date.now() - 60 * 24 * 60 * 60 * 1000;
		const orders = await ctx.db
			.query("orders")
			.withIndex("by_createdAt", (q) => q.gte("createdAt", sixtyDaysAgo))
			.collect();

		const completedOrders = orders.filter(
			(o) => o.status === "completed" || o.status === "paid"
		);

		if (completedOrders.length < 20) {
			return {
				hasEnoughData: false,
				message: "Belum cukup data untuk analisis",
			};
		}

		// Analyze by day of week
		const dayRevenue: Record<number, { revenue: number; count: number }> = {};
		const dayNames = [
			"Minggu",
			"Senin",
			"Selasa",
			"Rabu",
			"Kamis",
			"Jumat",
			"Sabtu",
		];

		for (const order of completedOrders) {
			const day = new Date(order.createdAt).getDay();
			if (!dayRevenue[day]) {
				dayRevenue[day] = { revenue: 0, count: 0 };
			}
			dayRevenue[day].revenue += order.totalAmount;
			dayRevenue[day].count += 1;
		}

		const dayAnalysis = Object.entries(dayRevenue).map(([day, data]) => ({
			day: Number.parseInt(day, 10),
			dayName: dayNames[Number.parseInt(day, 10)],
			revenue: data.revenue,
			count: data.count,
			avgOrder: data.revenue / data.count,
		}));

		// Find best and worst days
		dayAnalysis.sort((a, b) => b.revenue - a.revenue);
		const bestDay = dayAnalysis[0];
		const worstDay = dayAnalysis.at(-1);

		// Analyze by hour
		const hourlyRevenue: Record<number, number> = {};
		for (const order of completedOrders) {
			const hour = new Date(order.createdAt).getHours();
			hourlyRevenue[hour] = (hourlyRevenue[hour] || 0) + order.totalAmount;
		}

		const hourlyAnalysis = Object.entries(hourlyRevenue)
			.map(([hour, revenue]) => ({
				hour: Number.parseInt(hour, 10),
				revenue,
			}))
			.sort((a, b) => b.revenue - a.revenue)
			.slice(0, 3);

		return {
			hasEnoughData: true,
			bestDay: {
				day: bestDay.dayName,
				revenue: bestDay.revenue,
				recommendation: `Lakukan promo di ${bestDay.dayName} untuk maksimalkan penjualan`,
			},
			worstDay: {
				day: worstDay.dayName,
				revenue: worstDay.revenue,
				recommendation: `Gunakan promo di ${worstDay.dayName} untuk boost penjualan`,
			},
			bestHours: hourlyAnalysis.map((h) => ({
				hour: h.hour,
				time: `${h.hour}:00`,
				recommendation: `Promo jam ${h.hour}:00 - ${h.hour + 1}:00`,
			})),
		};
	},
});

/**
 * Auto-generate tasks based on business insights
 */
export const autoGenerateTasks = mutation({
	args: {},
	handler: async (ctx) => {
		const now = Date.now();
		const tasks = [];

		// Optimized: Fetch business data efficiently
		const inventory = await ctx.db.query("inventory").collect();
		// Only fetch orders from last 30 days for task generation
		const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
		const orders = await ctx.db
			.query("orders")
			.withIndex("by_createdAt", (q) => q.gte("createdAt", thirtyDaysAgo))
			.collect();
		const products = await ctx.db.query("products").collect();
		// For HPP, we still need to run the query
		const hppDashboard = await ctx.runQuery(api.hpp.getHppDashboardData);

		// Check for critical low stock
		const criticalStock = inventory.filter(
			(i) => i.quantity <= i.lowStockThreshold / 2
		);

		for (const item of criticalStock) {
			tasks.push({
				title: `Restock segera: ${item.ingredientName}`,
				description: `Stok kritis! Sisa ${item.quantity} ${item.unit}. Threshold: ${item.lowStockThreshold} ${item.unit}`,
				priority: "high" as const,
				category: "inventory" as const,
				actionType: "restock" as const,
				actionData: { inventoryId: item._id },
				dueDate: now + 24 * 60 * 60 * 1000, // Due tomorrow
			});
		}

		// Check for pending orders > 24 hours
		const oneDayAgo = now - 24 * 60 * 60 * 1000;
		const stalePendingOrders = orders.filter(
			(o) => o.status === "pending" && o.createdAt < oneDayAgo
		);

		if (stalePendingOrders.length > 0) {
			tasks.push({
				title: `Follow up ${stalePendingOrders.length} pesanan tertunda`,
				description: `${stalePendingOrders.length} pesanan pending > 24 jam. Perlu follow up segera.`,
				priority: "high" as const,
				category: "orders" as const,
				actionType: "follow_up" as const,
				actionData: { orderIds: stalePendingOrders.map((o) => o._id) },
				dueDate: now + 4 * 60 * 60 * 1000, // Due in 4 hours
			});
		}

		// Check HPP low margin
		if (hppDashboard && hppDashboard.lowMarginAlerts.length > 0) {
			tasks.push({
				title: "Review produk dengan margin rendah",
				description: `${hppDashboard.lowMarginAlerts.length} produk memiliki margin < 20%. Review harga atau biaya.`,
				priority: "medium" as const,
				category: "finance" as const,
				actionType: "review" as const,
				actionData: {
					productIds: hppDashboard.lowMarginAlerts.map((a) => a._id),
				},
				dueDate: now + 7 * 24 * 60 * 60 * 1000, // Due in a week
			});
		}

		// Check for slow moving products (> 14 days no sales)
		const fourteenDaysAgo = now - 14 * 24 * 60 * 60 * 1000;
		const recentOrders = orders.filter((o) => o.createdAt >= fourteenDaysAgo);
		const soldProductIds = new Set();
		for (const order of recentOrders) {
			for (const item of order.items) {
				soldProductIds.add(item.productId);
			}
		}

		const slowMovingProducts = products.filter(
			(p) => p.isAvailable && !soldProductIds.has(p._id)
		);

		if (slowMovingProducts.length > 3) {
			tasks.push({
				title: "Buat promo untuk produk kurang laku",
				description: `${slowMovingProducts.length} produk tidak terjual 14 hari. Buat promo diskon.`,
				priority: "medium" as const,
				category: "marketing" as const,
				actionType: "create" as const,
				actionData: { productIds: slowMovingProducts.map((p) => p._id) },
				dueDate: now + 3 * 24 * 60 * 60 * 1000, // Due in 3 days
			});
		}

		// Create tasks in database
		const createdTaskIds = [];
		for (const task of tasks) {
			const id = await ctx.db.insert("followUpTasks", {
				...task,
				status: "pending",
				createdAt: now,
			});
			createdTaskIds.push(id);
		}

		return {
			created: createdTaskIds.length,
			tasks: tasks.map((t) => ({
				title: t.title,
				priority: t.priority,
				category: t.category,
			})),
		};
	},
});

// ============================================
// FINANCIAL RECONCILIATION
// ============================================

/**
 * Get financial reconciliation report — cross-check orders vs financial transactions
 */
export const getFinancialReconciliation = query({
	args: {},
	handler: async (ctx) => {
		const [orders, allTransactions] = await Promise.all([
			ctx.runQuery(api.orders.getOrders, {}),
			ctx.runQuery(api.finance.getAllTransactions, {}),
		]);

		const paidOrders = orders.filter(
			(o) => o.status === "paid" || o.status === "completed"
		);
		const incomeTransactions = allTransactions.filter(
			(t) => t.type === "income"
		);

		const orderRevenue = paidOrders.reduce((sum, o) => sum + o.totalAmount, 0);
		const incomeTotal = incomeTransactions.reduce(
			(sum, t) => sum + t.amount,
			0
		);
		const gap = orderRevenue - incomeTotal;

		const todayStart = new Date();
		todayStart.setHours(0, 0, 0, 0);
		const todayTs = todayStart.getTime();

		const todayOrders = paidOrders.filter((o) => o.createdAt >= todayTs);
		const todayOrderRevenue = todayOrders.reduce(
			(sum, o) => sum + o.totalAmount,
			0
		);
		const todayIncome = incomeTransactions
			.filter((t) => t.date >= todayTs)
			.reduce((sum, t) => sum + t.amount, 0);
		const todayGap = todayOrderRevenue - todayIncome;

		const paymentMethodBreakdown: Record<string, number> = {};
		for (const order of paidOrders) {
			const method = order.paymentMethod || "unknown";
			paymentMethodBreakdown[method] =
				(paymentMethodBreakdown[method] || 0) + order.totalAmount;
		}

		return {
			allTime: {
				orderRevenue,
				incomeTotal,
				gap,
				paidOrdersCount: paidOrders.length,
				incomeTransactionCount: incomeTransactions.length,
				isBalanced: Math.abs(gap) < 1000,
			},
			today: {
				orderRevenue: todayOrderRevenue,
				incomeTotal: todayIncome,
				gap: todayGap,
				ordersCount: todayOrders.length,
				isBalanced: Math.abs(todayGap) < 1000,
			},
			paymentMethodBreakdown,
		};
	},
});

// ============================================
// RECEIPT OCR & SCAN FUNCTIONS
// ============================================

/**
 * Helper: Call Python OCR Service for receipt scanning
 */
async function callPythonOCRService(imageDataUrl: string, endpoint: string = "ocr/receipt"): Promise<{
	success: boolean;
	type: string;
	data?: any;
	raw_text: string;
	confidence: number;
	error?: string;
}> {
	const ocrServiceUrl = process.env.OCR_SERVICE_URL || "http://localhost:8001";

	try {
		const response = await fetch(`${ocrServiceUrl}/${endpoint}`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				image: imageDataUrl,
			}),
		});

		if (!response.ok) {
			const errorText = await response.text();
			console.error("OCR Service Error:", errorText);
			return {
				success: false,
				type: "unknown",
				data: null,
				raw_text: "",
				confidence: 0,
				error: `OCR Service error: ${response.status}`,
			};
		}

		return await response.json();
	} catch (error) {
		console.error("OCR Service Connection Error:", error);
		return {
			success: false,
			type: "unknown",
			data: null,
			raw_text: "",
			confidence: 0,
			error: "OCR Service unavailable",
		};
	}
}

/**
 * Helper: Run OCR on a receipt image using seed-2.0-pro-free Vision API via SumoPod
 */
async function runReceiptOCR(imageDataUrl: string): Promise<{
	type: "order" | "expense" | "income" | "unknown";
	data?: {
		amount?: number;
		items?: Array<{
			name: string;
			quantity: number;
			price?: number;
			total?: number;
			unit?: string;
		}>;
		category?: string;
		description?: string;
		paymentMethod?: string;
		notes?: string;
		merchantName?: string;
		date?: string;
	};
	confidence: number;
	rawText: string;
}> {
	// Try Python OCR Service ONLY if it looks like it might be available (localhost check)
	// In production (cloud), we skip this early to avoid timeouts
	const isLocal = process.env.OCR_SERVICE_URL?.includes("localhost") || process.env.OCR_SERVICE_URL?.includes("127.0.0.1");
	
	if (isLocal) {
		console.log("Attempting Python OCR Service...");
		try {
			const pythonResult = await callPythonOCRService(imageDataUrl, "ocr/receipt");
			if (pythonResult.success && pythonResult.type !== "unknown") {
				console.log("Python OCR Service succeeded");
				return {
					type: pythonResult.type as "order" | "expense" | "income" | "unknown",
					data: pythonResult.data,
					rawText: pythonResult.raw_text,
					confidence: pythonResult.confidence,
				};
			}
		} catch (e) {
			console.log("Python OCR Service unreachable, falling back to seed-2.0-pro-free Vision API.");
		}
	}

	console.log("Using SumoPod AI (seed-2.0-pro-free) for OCR...");

	// Use shared Vision API helper
	const { base64Data, mimeType } = extractImagePayload(imageDataUrl);

	const prompt = `Kamu adalah pakar OCR struk belanja Indonesia yang sangat teliti.
Tugas kamu adalah mengekstrak data dari struk/kwitansi ini ke dalam format JSON.

PENTING:
1. Baca DARI ATAS KE BAWAH secara lengkap.
2. Ekstrak Merchant: Nama toko/restoran.
3. Ekstrak Items: Daftar item, qty, harga satuan, subtotal.
   - Tentukan satuan (unit) secara otomatis berdasarkan jenis barang (misal: "pcs", "kg", "liter", "porsi", "bungkus", "botol", dll). JANGAN bertanya ke user.
4. Ekstrak Summary: Subtotal, Pajak, Service Charge, Diskon, dan TOTAL AKHIR.
5. Kategori: Tentukan kategori yang paling cocok (makanan_minuman, belanja_stok, utilitas, dll).
6. Tentukan Type: "expense" (pengeluaran) atau "income" (jika ini struk penjualan toko kamu).

Output harus JSON murni:
{
  "type": "expense",
  "data": {
    "merchantName": "Nama Toko",
    "amount": 100000,
    "items": [{"name": "Item A", "quantity": 1, "price": 100000, "total": 100000, "unit": "pcs"}],
    "category": "makanan_minuman",
    "paymentMethod": "qris",
    "date": "YYYY-MM-DD",
    "notes": "Alamat/Info tambahan"
  },
  "confidence": 95
}`;

	const visionResult = await callVisionAPI(prompt, base64Data, mimeType, { maxOutputTokens: 2000 });

	if (!visionResult.success || !visionResult.text) {
		throw new ConvexError(`Vision OCR gagal: ${visionResult.error || "Tidak ada respon dari AI"}`);
	}

	const parsed = parseAIScanJSON(visionResult.text);
	
	if (parsed) {
		return {
			type: (parsed.type || parsed.transactionType || "unknown") as any,
			data: parsed.data || parsed,
			rawText: visionResult.text,
			confidence: (parsed.confidence || 50) / 100,
		};
	}

	// Fallback to raw text if parsing failed
	return {
		type: "unknown",
		data: {},
		rawText: visionResult.text,
		confidence: 0.1,
	};
}


/**
 * Proses satu gambar struk menggunakan AI OCR (GPT-4o Vision)
 */
export const processReceipt = action({
	args: {
		image: v.string(), // base64 data URL
	},
	handler: async (_ctx, args) => {
		return await runReceiptOCR(args.image);
	},
});

const structuredScanDataValidator = v.object({
	type: v.string(),
	name: v.optional(v.string()),
	merchant: v.optional(v.string()),
	category: v.string(),
	transactionType: v.union(
		v.literal("expense"),
		v.literal("income"),
		v.literal("unknown")
	),
	total: v.number(),
	items: v.array(
		v.object({
			name: v.string(),
			qty: v.number(),
			price: v.number(),
			subtotal: v.number(),
			unit: v.optional(v.string()),
		})
	),
	date: v.optional(v.union(v.string(), v.null())),
	paymentMethod: v.optional(v.string()),
	notes: v.optional(v.string()),
	confidence: v.optional(v.number()),
	rawText: v.optional(v.string()),
});

const structuredScanOverrideValidator = v.object({
	type: v.union(v.literal("income"), v.literal("expense")),
	amount: v.number(),
	category: v.string(),
	merchant: v.optional(v.string()),
	description: v.optional(v.string()),
	date: v.number(),
	paymentMethod: v.optional(v.string()),
	status: v.literal("completed"),
});

export const recordScannedExpenseToInventory = action({
	args: {
		scanData: structuredScanDataValidator,
		override: structuredScanOverrideValidator,
	},
	handler: async (ctx, args) => {
		const purchaseResult = await ctx.runMutation(
			api.stockPurchases.recordStockPurchase,
			{
				purchaseData: buildStockPurchasePayloadFromScan({
					scanResult: {
						data: {
							amount: args.scanData.total,
							merchantName: args.scanData.merchant || args.scanData.name,
							description: args.scanData.notes,
							category: args.scanData.category,
							paymentMethod: args.scanData.paymentMethod,
							items: args.scanData.items.map((item) => ({
								name: item.name,
								qty: item.qty,
								price: item.price,
								total: item.subtotal,
								unit: item.unit,
							})),
						},
						name: args.scanData.name,
						rawText: args.scanData.rawText,
					},
					date: args.override.date,
					sourceLabel: "AI Chat Scan",
					override: {
						amount: args.override.amount,
						category: args.override.category,
						merchant: args.override.merchant,
						description: args.override.description,
						paymentMethod: args.override.paymentMethod,
					},
				}),
			}
		);

		return {
			success: true,
			message: purchaseResult.message,
			generated: {
				id: purchaseResult.transactionId,
				type: "expense",
				amount: args.override.amount,
				category: args.override.category,
			},
			purchaseResult,
		};
	},
});

/**
 * Proses gambar struk dan langsung buat transaksi keuangan di database
 */
export const processImageAndGenerate = action({
	args: {
		image: v.string(),
		generateType: v.union(
			v.literal("auto"),
			v.literal("expense"),
			v.literal("order"),
			v.literal("income")
		),
	},
	handler: async (ctx, args) => {
		const scanResult = await runReceiptOCR(args.image);

		if (scanResult.type === "unknown" || !scanResult.data?.amount) {
			return {
				success: false,
				message:
					"Tidak dapat mengidentifikasi data dari struk. Pastikan gambar jelas dan merupakan struk/kwitansi.",
				generated: null,
				scanResult,
			};
		}

		const effectiveType =
			args.generateType === "auto"
				? scanResult.type === "income"
					? "income"
					: "expense"
				: args.generateType === "order"
					? "income"
					: args.generateType;

		if (effectiveType === "expense" || effectiveType === "income") {
			const detectedDate = parseOptionalIsoDate(scanResult.data.date);
			const resolvedDate = detectedDate ?? Date.now();

			if (shouldSyncExpenseToInventory(scanResult, effectiveType)) {
				const purchaseResult = await ctx.runMutation(
					api.stockPurchases.recordStockPurchase,
					{
						purchaseData: buildStockPurchasePayloadFromScan({
							scanResult,
							date: resolvedDate,
							sourceLabel: "AI Scan",
						}),
					}
				);

				return {
					success: true,
					message: purchaseResult.message,
					generated: {
						id: purchaseResult.transactionId,
						type: effectiveType,
						amount: scanResult.data.amount,
						category: "Pembelian Stok",
					},
					scanResult,
				};
			}

			const scanItems = normalizeScanItems(scanResult.data.items);
			const txResult = await ctx.runMutation(api.finance.upsertReceiptTransaction, {
				type: effectiveType as "income" | "expense",
				amount: scanResult.data.amount,
				category: scanResult.data.category || "Lainnya",
				merchant: scanResult.data.merchantName,
				description:
					scanResult.data.description || scanResult.rawText.slice(0, 200),
				date: resolvedDate,
				paymentMethod: scanResult.data.paymentMethod || "cash",
				status: "completed",
				sourceFingerprint: buildReceiptFinanceFingerprint({
					scanResult,
					effectiveType: effectiveType as "income" | "expense",
					date: resolvedDate,
					inputMode: "image_scan",
				}),
				metadata: {
					source: "ai_receipt_scan",
					inputMode: "image_scan",
					importedAt: Date.now(),
					rawText: scanResult.rawText.slice(0, 1000),
					sourceLabel: "AI Scan",
					scanItems: scanItems.length > 0 ? scanItems : undefined,
				},
			});

			return {
				success: true,
				message: `Berhasil mencatat ${effectiveType === "expense" ? "pengeluaran" : "pemasukan"} sebesar Rp${scanResult.data.amount.toLocaleString("id-ID")}`,
				generated: {
					id: txResult.id,
					type: effectiveType,
					amount: scanResult.data.amount,
					category: scanResult.data.category,
				},
				scanResult,
			};
		}

		return {
			success: false,
			message: "Tipe generate tidak didukung untuk struk ini",
			generated: null,
			scanResult,
		};
	},
});

/**
 * Proses beberapa gambar struk sekaligus (batch OCR)
 */
export const batchProcessReceipts = action({
	args: {
		images: v.array(v.string()),
	},
	handler: async (_ctx, args) => {
		const results = await Promise.allSettled(
			args.images.map((img) => runReceiptOCR(img))
		);

		const processedResults = results.map((r) =>
			r.status === "fulfilled" ? r.value : null
		);

		const totalProcessed = processedResults.filter(
			(r) => r !== null && r.type !== "unknown"
		).length;
		const totalFailed = processedResults.length - totalProcessed;

		return {
			results: processedResults,
			summary: {
				total: args.images.length,
				totalProcessed,
				totalFailed,
			},
		};
	},
});

/**
 * Proses beberapa gambar dan langsung buat transaksi untuk semua gambar (batch generate)
 */
export const batchGenerateTransactions = action({
	args: {
		images: v.array(v.string()),
		generateType: v.union(
			v.literal("auto"),
			v.literal("expense"),
			v.literal("order"),
			v.literal("income")
		),
	},
	handler: async (ctx, args) => {
		const generated: Array<{
			id: string;
			type: string;
			amount: number;
			category?: string;
		}> = [];
		let totalAmount = 0;
		let totalFailed = 0;

		for (const image of args.images) {
			try {
				const scanResult = await runReceiptOCR(image);

				if (scanResult.type === "unknown" || !scanResult.data?.amount) {
					totalFailed++;
					continue;
				}

				const effectiveType =
					args.generateType === "auto"
						? scanResult.type === "income"
							? "income"
							: "expense"
						: args.generateType === "order"
							? "income"
							: args.generateType;

				if (effectiveType === "expense" || effectiveType === "income") {
					const detectedDate = parseOptionalIsoDate(scanResult.data.date);
					const resolvedDate = detectedDate ?? Date.now();

					if (shouldSyncExpenseToInventory(scanResult, effectiveType)) {
						const purchaseResult = await ctx.runMutation(
							api.stockPurchases.recordStockPurchase,
							{
								purchaseData: buildStockPurchasePayloadFromScan({
									scanResult,
									date: resolvedDate,
									sourceLabel: "AI Scan",
								}),
							}
						);

						generated.push({
							id: purchaseResult.transactionId as string,
							type: effectiveType,
							amount: scanResult.data.amount,
							category: "Pembelian Stok",
						});

						totalAmount += scanResult.data.amount;
						continue;
					}

					const scanItems = normalizeScanItems(scanResult.data.items);
					const txResult = await ctx.runMutation(
						api.finance.upsertReceiptTransaction,
						{
							type: effectiveType as "income" | "expense",
							amount: scanResult.data.amount,
							category: scanResult.data.category || "Lainnya",
							merchant: scanResult.data.merchantName,
							description:
								scanResult.data.description ||
								scanResult.rawText.slice(0, 200),
							date: resolvedDate,
							paymentMethod: scanResult.data.paymentMethod || "cash",
							status: "completed",
							sourceFingerprint: buildReceiptFinanceFingerprint({
								scanResult,
								effectiveType: effectiveType as "income" | "expense",
								date: resolvedDate,
								inputMode: "batch_image_scan",
							}),
							metadata: {
								source: "ai_receipt_scan",
								inputMode: "batch_image_scan",
								importedAt: Date.now(),
								rawText: scanResult.rawText.slice(0, 1000),
								sourceLabel: "AI Scan",
								scanItems: scanItems.length > 0 ? scanItems : undefined,
							},
						}
					);

					generated.push({
						id: txResult.id as string,
						type: effectiveType,
						amount: scanResult.data.amount,
						category: scanResult.data.category,
					});

					totalAmount += scanResult.data.amount;
				}
			} catch {
				totalFailed++;
			}
		}

		return {
			generated,
			summary: {
				total: args.images.length,
				totalGenerated: generated.length,
				totalFailed,
				totalAmount,
			},
		};
	},
});

/**
 * Generate laporan scan struk berdasarkan periode (harian/mingguan/bulanan)
 */
export const generateScanReport = action({
	args: {
		period: v.union(
			v.literal("daily"),
			v.literal("weekly"),
			v.literal("monthly")
		),
	},
	handler: async (ctx, args) => {
		const now = Date.now();
		let startDate: number;

		switch (args.period) {
			case "daily":
				startDate = now - 24 * 60 * 60 * 1000;
				break;
			case "weekly":
				startDate = now - 7 * 24 * 60 * 60 * 1000;
				break;
			case "monthly":
				startDate = now - 30 * 24 * 60 * 60 * 1000;
				break;
		}

		const transactions = await ctx.runQuery(api.finance.getAllTransactions, {
			type: "expense",
			startDate,
			endDate: now,
		});

		const totalExpense = transactions.reduce(
			(sum: number, t: any) => sum + t.amount,
			0
		);
		const transactionCount = transactions.length;
		const avgPerTransaction =
			transactionCount > 0 ? totalExpense / transactionCount : 0;

		// Group by category
		const categoryMap: Record<string, number> = {};
		for (const t of transactions as any[]) {
			const cat = t.category || "Lainnya";
			categoryMap[cat] = (categoryMap[cat] || 0) + t.amount;
		}

		const topCategories = Object.entries(categoryMap)
			.map(([category, total]) => ({
				category,
				total,
				percentage:
					totalExpense > 0 ? Math.round((total / totalExpense) * 100) : 0,
			}))
			.sort((a, b) => b.total - a.total)
			.slice(0, 5);

		return {
			period: args.period,
			summary: {
				totalExpense,
				transactionCount,
				avgPerTransaction,
			},
			topCategories,
		};
	},
});

// ============================================
// DISCOUNT EFFECTIVENESS ANALYSIS
// ============================================

/**
 * Analyze discount effectiveness based on orders and active discounts
 */
export const analyzeDiscountEffectiveness = query({
	args: {},
	handler: async (ctx) => {
		const [discounts, orders] = await Promise.all([
			ctx.runQuery(api.discounts.getDiscounts),
			ctx.runQuery(api.orders.getOrders, {}),
		]);

		const now = Date.now();
		const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
		const recentOrders = orders.filter(
			(o) =>
				o.createdAt >= thirtyDaysAgo &&
				(o.status === "completed" || o.status === "paid")
		);

		const activeDiscounts = discounts.filter((d) => d.isActive);
		const inactiveDiscounts = discounts.filter((d) => !d.isActive);

		const byType: Record<string, number> = {};
		for (const d of discounts) {
			byType[d.type] = (byType[d.type] || 0) + 1;
		}

		return {
			summary: {
				total: discounts.length,
				active: activeDiscounts.length,
				inactive: inactiveDiscounts.length,
			},
			activeDiscounts: activeDiscounts.map((d) => ({
				id: d._id,
				name: d.name,
				type: d.type,
				value: d.value,
				targetType: d.targetType,
				minOrderValue: d.minOrderValue,
			})),
			inactiveDiscounts: inactiveDiscounts.map((d) => ({
				id: d._id,
				name: d.name,
				type: d.type,
				value: d.value,
			})),
			byType,
			recentOrdersCount: recentOrders.length,
		};
	},
});

/**
 * Scan gambar dengan AI (seed-2.0-pro-free by ByteDance via SumoPod) dan ekstrak data terstruktur.
 * Mendukung: struk belanja, kwitansi, nota, tulisan tangan, produk, dll.
 * Menggunakan SumoPod AI (seed-2.0-pro-free by ByteDance) untuk stabilitas tinggi.
 */
export const scanImageData = action({
	args: {
		image: v.string(), // base64 data URL
	},
	handler: async (_ctx, args) => {
		try {
			// Validate API key tersedia
			const sumoApiKey = process.env.SUMOPOD_API_KEY || process.env.OPENAI_API_KEY;
			if (!sumoApiKey) {
				throw new ConvexError(
					"SUMOPOD_API_KEY belum diatur. Silakan atur SUMOPOD_API_KEY di dashboard Convex untuk fitur AI Scan."
				);
			}

			// Validate image data
			if (!args.image || args.image.length < 100) {
				throw new ConvexError("Data gambar tidak valid atau terlalu kecil. Silakan upload ulang gambar.");
			}

			const { base64Data, mimeType } = extractImagePayload(args.image);

			// Limit ukuran gambar (max ~10MB base64 ≈ ~7.5MB file)
			if (base64Data.length > 10_000_000) {
				throw new ConvexError("Gambar terlalu besar. Maksimal 7.5MB. Silakan kompres gambar terlebih dahulu.");
			}

			const prompt = `Kamu adalah AI scanner dokumen keuangan yang sangat teliti dan ahli dalam menganalisis gambar struk, kwitansi, nota, invoice, dan dokumen lainnya dalam konteks Indonesia.

TUGAS: Analisis gambar dengan kecermatan tinggi dan ekstrak data terstruktur secara lengkap.
DETAIL YANG HARUS DIEKSTRAK:
1. Nama Merchant: Identifikasi nama toko/instansi yang mengeluarkan dokumen (misal: Starbucks, Indomaret, PLN, dll).
2. Kategori: Tentukan kategori transaksi yang Paling Akurat. Pilih dari daftar berikut:
   - makanan_minuman (restoran, cafe, jajan, es batu, galon, nasi, lauk, mineral)
   - belanja_stok (pembelian bahan baku, kulakan, stok dagangan, belanja pasar)
   - peralatan_kantor (ATK, sunlight, sapu, pel, maxim, alat masak, pembersih)
   - transportasi (bensin, parkir, kurir, ojek online, servis, bensin rian)
   - utilitas_listrik_air (listrik, air, wifi, sampah, keamanan)
   - gaji_karyawan (gaji, upah harian, bonus, upah mang andri)
   - sewa_tempat (sewa gedung/ruko/lahan)
   - pemasaran (iklan, brosur, banner, promo)
   - pajak (PPN, PPh, retribusi)
   - hiburan (gathering, kado)
   - kesehatan (obat, P3K)
   - pembangunan_renovasi (renovasi, perbaikan, material)
   - lainnya (biaya umum)
3. Transaksi: Tipe transaksi (expense/pemasukan/pengeluaran).
4. Angka Keuangan: 
   - total: Angka akhir yang harus dibayar (angka terbesar).
   - subtotal: Jumlah sebelum pajak/layanan.
   - tax: Pajak/PPN.
   - serviceCharge: Biaya layanan/service.
   - discount: Total potongan harga.
5. Daftar Item (Kritis): Ekstrak SEMUA item tanpa kecuali. Untuk setiap item sertakan nama, qty, harga satuan (price), subtotal (qty * price), dan satuan (unit).
   - Tentukan satuan (unit) secara otomatis berdasarkan jenis barang (misal: "pcs", "kg", "liter", "porsi", "bungkus", "botol", dll). JANGAN biarkan kosong atau bertanya ke user.
6. Metadata: Tanggal (YYYY-MM-DD), waktu, metode pembayaran (cash/qris/debit/credit), nomor struk/invoice.

Kembalikan data dalam format JSON berikut TANPA teks tambahan apapun:
{
  "type": "receipt|invoice|note|handwriting|product|other",
  "name": "nama merchant yang terdeteksi atau nama produk jika label produk",
  "category": "makanan_minuman|belanja_stok|peralatan_kantor|transportasi|utilitas_listrik_air|gaji_karyawan|sewa_tempat|pemasaran|pajak|hiburan|kesehatan|pembangunan_renovasi|lainnya",
  "transactionType": "expense|income|unknown",
  "total": total_akhir_angka,
  "subtotal": subtotal_angka,
  "tax": pajak_angka,
  "serviceCharge": service_charge_angka,
  "discount": discount_angka,
  "items": [{"name": "nama item", "qty": jumlah, "price": harga_satuan, "subtotal": total_per_item, "unit": "pcs|kg|liter|porsi|dll"}],
  "date": "YYYY-MM-DD atau null",
  "paymentMethod": "cash|qris|card|transfer|unknown",
  "notes": "alamat toko, nomor telepon, nomor struk, atau info penting lainnya",
  "suggestedAction": "createProduct|addStock|createTransaction|createOrder|none",
  "confidence": angka 0-100 tingkat keyakinan,
  "rawText": "semua teks mentah yang terbaca"
}

PENTING:
- Satuan (unit) HARUS ditentukan otomatis oleh AI. Gunakan logika umum (contoh: Sayuran biasanya "kg", Barang kemasan "pcs", Minuman "botol"/"porsi"). JANGAN bertanya ke user.
- Jika gambar adalah label produk, set suggestedAction ke "createProduct" atau "addStock".
- Jika gambar adalah struk belanja, set suggestedAction ke "createTransaction".
- Jika gambar adalah pesanan pelanggan, set suggestedAction ke "createOrder".
- Periksa detail pajak dan service charge secara spesifik karena sering muncul di struk restoran.
- Pastikan semua angka adalah integer murni tanpa pemisah ribuan (contoh: 250000).
- Jika tulisan tangan, gunakan context untuk menebak kata yang paling masuk akal.
- Nama merchant harus selalu diisi meskipun hanya terbaca sebagian.
- HANYA kembalikan JSON.`;

			// Gunakan SumoPod API (seed-2.0-pro-free) untuk scan gambar
			const visionResult = await callVisionAPI(prompt, base64Data, mimeType);

			if (!visionResult.success || !visionResult.text) {
				console.error("scanImageData: callVisionAPI failed:", visionResult.error);
				throw new ConvexError(
					`AI SCAN ERROR: ${visionResult.error || "Coba lagi dengan gambar yang lebih jelas."}`
				);
			}

			const parsed = parseAIScanJSON(visionResult.text);
			if (!parsed) {
				console.error("scanImageData: parsing failed for:", visionResult.text.slice(0, 500));
				throw new ConvexError("AI tidak dapat mengekstrak data dari gambar. Pastikan gambar jelas dan coba lagi.");
			}

			// Ensure legacy structure for compatibility if needed
			const result = {
				...parsed,
				rawText: parsed.rawText || visionResult.text,
				confidence: parsed.confidence || 80,
			};

			return result;
		} catch (error) {
			if (error instanceof ConvexError) throw error;
			console.error("scanImageData unexpected error:", error);
			throw new ConvexError(`Gagal memproses gambar: ${error instanceof Error ? error.message : "Terjadi kesalahan sistem"}`);
		}
	},
});


/**
 * Scan multiple images in bulk using scanImageData logic for each.
 */
export const bulkScanImageData = action({
	args: {
		images: v.array(v.string()), // array of base64 data URLs
	},
	handler: async (ctx, args) => {
		const results = await Promise.allSettled(
			args.images.map((image) => ctx.runAction(api.ai.scanImageData, { image }))
		);

		return results.map((r, i) => {
			if (r.status === "fulfilled") {
				return { success: true as const, data: r.value };
			}
			return { 
				success: false as const, 
				error: r.reason instanceof Error ? r.reason.message : String(r.reason),
				index: i 
			};
		});
	},
});

export const fillHppInventoryCostsFromTransactions = action({
	args: {
		hppCalculationId: v.id("hppCalculations"),
		maxTransactions: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const context = await ctx.runQuery(api.hpp.getInventoryCostFillContext, {
			hppCalculationId: args.hppCalculationId,
			transactionLimit: args.maxTransactions,
		});

		if (!context.calculation) {
			throw new ConvexError("Kalkulasi HPP tidak ditemukan");
		}

		if ((context.inventoryItems?.length || 0) === 0) {
			return {
				appliedCount: 0,
				updatedIngredients: 0,
				suggestions: [],
				source: "none",
			};
		}

		const heuristicSuggestions = buildHeuristicInventoryCostSuggestions(context);
		let suggestions = heuristicSuggestions;
		let source = heuristicSuggestions.length > 0 ? "heuristic" : "none";

		try {
			const aiResponse = await safeSumoPodCall(
				[
					{
						role: "system",
						content:
							"Kamu adalah AI costing analyst untuk POS F&B Indonesia. Tugasmu mencocokkan transaksi belanja dengan item inventory dan menghitung costPerUnit dalam SATUAN DASAR inventory. Gunakan hanya bukti yang kuat. Jika ragu, abaikan. Kembalikan JSON murni: {\"suggestions\":[{\"inventoryId\":\"...\",\"sourceTransactionId\":\"...\",\"costPerUnit\":123.45,\"confidence\":0.91,\"reason\":\"...\",\"sourceLabel\":\"...\"}]}",
					},
					{
						role: "user",
						content: JSON.stringify({
							targetCalculation: {
								id: context.calculation._id,
								name: context.calculation.name,
								ingredients: context.calculation.ingredients.map((ingredient: any) => ({
									inventoryId: ingredient.inventoryId,
									ingredientName: ingredient.ingredientName,
									purchasePrice: ingredient.purchasePrice,
									purchaseQuantity: ingredient.purchaseQuantity,
									purchaseUnit: ingredient.purchaseUnit,
									usageUnit: ingredient.usageUnit,
									conversionFactor: ingredient.conversionFactor,
								})),
							},
							inventoryItems: context.inventoryItems.map((item: any) => ({
								inventoryId: item._id,
								ingredientName: item.ingredientName,
								baseUnit: item.unit,
								displayUnit: item.displayUnit,
								conversionFactor: item.conversionFactor,
							})),
							recentTransactions: context.transactions.map((transaction: any) => ({
								transactionId: transaction._id,
								merchant: transaction.merchant,
								category: transaction.category,
								description: transaction.description,
								date: transaction.date,
								amount: transaction.amount,
								rawText: transaction.rawText,
								scanItems: transaction.scanItems,
							})),
						}),
					},
				],
				{ maxTokens: 2200, model: "gpt-4o-mini" }
			);

			const aiSuggestions = parseInventoryCostSuggestionResponse(
				aiResponse,
				new Set((context.inventoryItems || []).map((item: any) => String(item._id)))
			);
			if (aiSuggestions.length > 0) {
				suggestions = mergeInventoryCostSuggestions(
					heuristicSuggestions,
					aiSuggestions
				);
				source =
					heuristicSuggestions.length > 0 ? "ai+heuristic" : "ai";
			}
		} catch (error) {
			console.warn(
				"fillHppInventoryCostsFromTransactions AI fallback to heuristic:",
				error
			);
		}

		if (suggestions.length === 0) {
			return {
				appliedCount: 0,
				updatedIngredients: 0,
				suggestions: [],
				source,
			};
		}

		const applyResult = await ctx.runMutation(
			api.hpp.applyInventoryCostReferencesFromTransactions,
			{ suggestions }
		);
		const syncResult = await ctx.runMutation(api.hpp.syncHppWithInventoryPrices, {
			id: args.hppCalculationId,
		});

		return {
			appliedCount: applyResult.appliedCount,
			updatedIngredients: syncResult.updatedCount,
			suggestions,
			source,
		};
	},
});
