// @ts-nocheck
import { GenericActionCtx } from "convex/server";
import { ConvexError, v } from "convex/values";
import OpenAI from "openai";
import type { z } from "zod";
import { api } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
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
			model: options?.model || "gpt-4o-mini",
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

// Helper untuk panggil Gemini melalui SumoPod AI (untuk AI Scan Image)
async function callGeminiAPI(
	prompt: string,
	base64Data: string,
	mimeType: string,
	options?: { temperature?: number; maxOutputTokens?: number }
): Promise<{ success: boolean; text: string; error?: string }> {
	// Daftar model Gemini yang tersedia di SumoPod (mungkin berbeda nama tergantung provider)
	const models = [
		"seed-2-0-lite-free",
		"seed-2-0-mini",
		"seed-2-0-mini-free",
		"google/gemini-2.0-flash-001",
		"google/gemini-flash-1.5",
		"google/gemini-pro-1.5",
	];
	
	let lastError = "";
	let openai;
	
	try {
		openai = getOpenAI();
	} catch (e) {
		return { success: false, text: "", error: e instanceof Error ? e.message : String(e) };
	}

	for (const model of models) {
		try {
			console.log(`callGeminiAPI: Mencoba model ${model} melalui SumoPod...`);
			
			const completion = await openai.chat.completions.create({
				model: model,
				messages: [
					{
						role: "system",
						content: "You are an expert OCR and financial document analyzer. Analyze the provided image and extract data in JSON format."
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
				console.log(`callGeminiAPI: Berhasil dengan ${model} via SumoPod`);
				return { success: true, text: sanitizeAIString(text) };
			}
			lastError = `Model ${model} memberikan respon kosong`;
		} catch (error) {
			const errMsg = error instanceof Error ? error.message : String(error);
			lastError = errMsg;
			console.error(`callGeminiAPI Error (${model}):`, errMsg);
			
			// Jika error 404 (model tidak ditemukan), lanjut ke model berikutnya
			if (errMsg.includes("404") || errMsg.includes("model_not_found") || errMsg.includes("not found")) {
				continue;
			}
			
			// Jika error 401 (auth), berhenti karena model lain juga akan gagal
			if (errMsg.includes("401") || errMsg.includes("Unauthorized") || errMsg.includes("API key")) {
				break;
			}
			
			// Untuk error lain (429/500), coba model berikutnya
			await new Promise(r => setTimeout(r, 1000));
		}
	}

	return { 
		success: false, 
		text: "", 
		error: `Gagal menganalisis gambar dengan SumoPod (Gemini models). Detail: ${lastError}` 
	};
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


/**
 * Analyze sales data to provide high-level insights.
 */
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

📊 ANALISIS EFEKTIVITAS DISKON:
${(() => {
	const discountArr = discounts as Array<{
		_id: string;
		name: string;
		type: string;
		value: number;
		isActive: boolean;
		targetType: string;
	}>;
	if (!discountArr || discountArr.length === 0) {
		return "Belum ada diskon";
	}
	const activeDiscounts = discountArr.filter((d) => d.isActive);
	const inactiveDiscounts = discountArr.filter((d) => !d.isActive);
	let discountAnalysis = `Diskon Aktif: ${activeDiscounts.length}, Nonaktif: ${inactiveDiscounts.length}\n`;
	if (activeDiscounts.length > 0) {
		discountAnalysis += `Detail Aktif: ${activeDiscounts.map((d) => `${d.name} (${d.type}: ${d.value}, target: ${d.targetType})`).join("; ")}`;
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
- AI Analytics (prediksi stok, analisis bisnis, rekomendasi produk, analisis HPP, target keuangan)`;
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
		images: v.optional(v.array(v.string())), // multiple base64 data URLs for vision processing
		image: v.optional(v.string()), // backward compatibility for single image
	},
	handler: async (ctx, args) => {
		const dbContext = await gatherDatabaseContext(ctx);
		const smartContext = await gatherSmartContext(ctx);

		const allImages = [...(args.images || [])];
		if (args.image) allImages.push(args.image);

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

KEMAMPUAN:
- Mengetahui SELURUH data database secara real-time (produk, stok, pesanan, keuangan, promosi)
- Dapat merekap dan meringkas data (harian, mingguan, bulanan)
- Dapat mengambil dan menampilkan data spesifik
- Mengetahui seluruh fitur aplikasi dan cara penggunaannya
- Memberikan saran bisnis berdasarkan data
- DAPAT MELAKUKAN AKSI: create/update/delete produk, tambah/kurang stok (dengan FIFO), buat pesanan, catat transaksi keuangan, kelola diskon, dll
- MULTI-STEP ACTIONS: Dapat melakukan beberapa langkah sekaligus dalam satu permintaan
- FORECASTING: Analisis prediksi stok habis, jam ramai, revenue, dan produk trending berdasarkan data historis
- HPP KALKULATOR: Bantu hitung Harga Pokok Produksi (HPP), margin, dan analisis profitabilitas per produk
- ANALISIS DISKON: Evaluasi efektivitas diskon yang aktif, rekomendasikan strategi promo berdasarkan data penjualan
- REKONSILIASI KEUANGAN: Cross-check pesanan selesai vs transaksi keuangan, identifikasi selisih, bantu rekonsiliasi
- FIFO INVENTORY: Kelola stok berdasarkan tanggal masuk dan harga. Kamu bisa melihat rincian batch stok menggunakan tool getInventoryBatches dan menambah stok dengan tanggal spesifik menggunakan addStock.
- ANALISIS GAMBAR: Dapat membaca dan menganalisis gambar (foto struk, kwitansi, produk, dll) yang dikirim user. Ekstrak informasi seperti jumlah, item, tanggal, kategori, dan langsung catat ke sistem jika diminta
- BOOKING & RESERVASI: Kamu dapat membuat booking baru (createBooking) atau bulk booking (bulkCreateBookings) untuk reservasi pelanggan. Pastikan mendapatkan detail pelanggan (nama, telp, email) dan detail booking (tanggal, jumlah tamu, item pesanan).

ATURAN:
1. Jawab dalam Bahasa Indonesia yang ramah dan profesional
2. JANGAN gunakan format markdown atau rich text APA PUN: dilarang keras menggunakan bold (**), italic (* atau _), heading (#), bullet points manual (-), numbering, atau code blocks.
3. JANGAN PERNAH menggunakan simbol asterisk (*) atau underscore (_) untuk penekanan, dekorasi, atau list. Gunakan teks polos atau emoji.
4. Jika menyebutkan kategori (seperti makanan minuman, belanja stok), JANGAN gunakan underscore. Gunakan spasi biasa (contoh: "makanan minuman", bukan "makanan_minuman").
5. Berikan jawaban yang ringkas, padat, dan langsung ke poin.
6. Jika membuat list, gunakan emoji bullet seperti • atau emoji lain, bukan tanda minus, asterisk, atau nomor.
7. Jika ditanya data, berikan angka dan fakta spesifik dari database.
8. Format angka uang dengan "Rp" dan pemisah ribuan.
9. Jika user meminta aksi (tambah produk, update stok, dll), GUNAKAN TOOL yang tersedia.
10. SANGAT PENTING: Pastikan output adalah TEKS POLOS (Plain Text) yang bersih dari simbol-simbol formatting teknis.
11. FORMAT LIST DATA (WAJIB): Setiap kali menampilkan list transaksi, keuangan, pesanan, atau data historis lainnya, WAJIB sertakan tanggal atau rentang tanggal di setiap item.
    Gunakan format: [Nomor]. - [Tanggal/Periode] - [Nama Item] - [Jumlah] - [Total Nilai]
    Contoh: 1. - 01-28 Feb 2026 - Air Mineral - 110 - Rp 550.000
12. FLEKSIBILITAS PARSING & GENERASI OTOMATIS (PROAKTIF): Kamu adalah pakar ekstraksi data yang sangat cerdas. Jika pengguna memberikan daftar data mentah (seperti daftar pengeluaran harian Februari 2026), kamu harus:
    a. EKSTRAK TANGGAL: Perhatikan format tanggal seperti DD/MM/YYYY, DD-MM-YYYY, atau nama bulan. Pastikan setiap baris diproses dengan tanggalnya masing-masing.
    b. GENERASI OTOMATIS: Untuk field yang tidak ada pada input user, GENERATE SECARA OTOMATIS berdasarkan konteks:
       - KATEGORI: Pilih yang paling cocok dari daftar sistem (makanan_minuman, belanja_stok, dll). Contoh: "Galon" -> makanan_minuman, "Gaji" -> gaji_karyawan.
       - METODE PEMBAYARAN: Jika tidak disebutkan, gunakan default "cash".
       - DESKRIPSI: Gunakan teks asli dari user sebagai deskripsi.
       - STATUS: Gunakan default "completed".
    c. MULTI-TRANSACTION: Jika data banyak, gunakan tool createTransaction berulang kali (parallel) untuk SETIAP baris data. JANGAN menggabungkan data yang berbeda tanggal atau berbeda kategori kecuali diminta secara eksplisit.
    d. OTOMATISASI: Jangan menanyakan konfirmasi format atau field yang kurang jika kamu bisa melakukan inferensi cerdas. Langsung proses dan berikan laporan hasil eksekusinya.
13. FITUR SMART SUGGESTIONS (UTAMA): JANGAN gunakan bullet points manual (seperti 🔹 atau -) untuk memberikan instruksi langkah selanjutnya. Gunakan format [SUGGEST: Label Tombol | Prompt untuk dikirim ke AI] agar user bisa tinggal KLIK tombol tanpa mengetik.
    WAJIB: Selalu sertakan minimal 2-3 saran tombol otomatis [SUGGEST: ...] di akhir SETIAP jawaban kamu, tidak peduli seberapa singkat jawabannya.
    WAJIB: Jika user mengirim gambar (scan) atau teks daftar transaksi, gunakan data tersebut untuk memberikan saran aksi yang proaktif (seperti simpan transaksi, tambah produk, atau update stok).
    Contoh: "Data pengeluaran Februari sudah saya deteksi. [SUGGEST: 💰 Simpan Semua ke Sistem | Simpan semua daftar pengeluaran Februari 2026 tadi ke sistem transaksi keuangan saya dengan kategori dan detail otomatis] [SUGGEST: 📊 Lihat Laporan Bulan Ini | Berikan ringkasan total pengeluaran saya untuk bulan Februari 2026]"
    Contoh (setelah scan struk): "Saya menemukan struk dari Starbucks sebesar Rp 50.000. [SUGGEST: 💰 Catat Pengeluaran | Catat pengeluaran dari Starbucks sebesar Rp 50.000 kategori makanan_minuman] [SUGGEST: 📋 Lihat Detail | Tampilkan detail item dari struk ini]"

SMART CONTEXT:
${smartContext}

DATA REAL-TIME:
${dbContext}

INSTRUKSI MULTI-STEP ACTIONS:
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
- Jika user minta catat dari hasil scan: gunakan nama merchant dan kategori yang terdeteksi oleh scanner`,
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
			return "Maaf, layanan AI sedang tidak tersedia. Pastikan SUMOPOD_API_KEY sudah diatur di dashboard Convex.";
		}

		while (currentIteration < maxIterations) {
			currentIteration++;

			let completion;
			try {
				completion = await openai.chat.completions.create({
					model: "gpt-4o-mini",
					messages,
					tools: openaiTools,
					tool_choice: "auto",
					max_tokens: 2000,
				});
			} catch (apiError) {
				console.error("yumiChat API error:", apiError);
				const errMsg = apiError instanceof Error ? apiError.message : String(apiError);
				// Berikan pesan error yang informatif
				if (errMsg.includes("401") || errMsg.includes("Unauthorized")) {
					return "Maaf, API key tidak valid. Silakan periksa SUMOPOD_API_KEY di dashboard Convex.";
				}
				if (errMsg.includes("429") || errMsg.includes("rate limit")) {
					return "Maaf, batas penggunaan API tercapai. Silakan coba lagi dalam beberapa saat.";
				}
				if (errMsg.includes("timeout") || errMsg.includes("ECONNREFUSED")) {
					return "Maaf, koneksi ke server AI gagal. Silakan coba lagi.";
				}
				return "Maaf, terjadi kesalahan saat memproses permintaan. Silakan coba lagi.";
			}

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
		try {
			const finalCompletion = await openai.chat.completions.create({
				model: "gpt-4o-mini",
				messages,
				max_tokens: 1000,
			});
			return finalCompletion.choices[0].message.content;
		} catch (finalError) {
			console.error("yumiChat final completion error:", finalError);
			return "Maaf, terjadi kesalahan saat menyelesaikan respons. Silakan coba lagi.";
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
		| "bundle_opportunity";
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
			if (order.createdAt < cutoffDate) {
				continue;
			}

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
			if (order.createdAt < cutoffDate) {
				continue;
			}

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
		const orders = await ctx.runQuery(api.orders.getOrders, {});
		const products = await ctx.runQuery(api.products.getAllProductsAdmin);

		const completedOrders = orders.filter(
			(o) => o.status === "completed" || o.status === "paid"
		);

		// Calculate sales for recent periods
		const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
		const fourteenDaysAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;

		const recentSales: Record<string, number> = {};
		const previousSales: Record<string, number> = {};

		for (const order of completedOrders) {
			for (const item of order.items) {
				if (order.createdAt >= sevenDaysAgo) {
					recentSales[item.productName] =
						(recentSales[item.productName] || 0) + item.quantity;
				} else if (order.createdAt >= fourteenDaysAgo) {
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
		const orders = await ctx.runQuery(api.orders.getOrders, {});

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

		// Get business data
		const inventory = await ctx.runQuery(api.inventory.getInventory);
		const orders = await ctx.runQuery(api.orders.getOrders, {});
		const products = await ctx.runQuery(api.products.getAllProductsAdmin);
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
 * Helper: Run OCR on a receipt image using Google Gemini API
 */
async function runReceiptOCR(imageDataUrl: string): Promise<{
	type: "order" | "expense" | "income" | "unknown";
	data?: {
		amount?: number;
		items?: Array<{ name: string; quantity: number; price?: number }>;
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
			console.log("Python OCR Service unreachable, falling back to Gemini.");
		}
	}

	console.log("Using SumoPod AI (Gemini) for OCR...");

	// Fallback: Use shared Gemini API helper
	const base64Data = imageDataUrl.includes(",") ? imageDataUrl.split(",")[1] : imageDataUrl;
	if (!base64Data) {
		throw new ConvexError("Format gambar tidak valid (Base64 data missing)");
	}

	const mimeMatch = imageDataUrl.match(/^data:(image\/[a-zA-Z+]+);base64,/);
	const mimeType = mimeMatch ? mimeMatch[1] : "image/jpeg";

	const prompt = `Kamu adalah pakar OCR struk belanja Indonesia yang sangat teliti.
Tugas kamu adalah mengekstrak data dari struk/kwitansi ini ke dalam format JSON.

PENTING:
1. Baca DARI ATAS KE BAWAH secara lengkap.
2. Ekstrak Merchant: Nama toko/restoran.
3. Ekstrak Items: Daftar item, qty, harga satuan, subtotal.
4. Ekstrak Summary: Subtotal, Pajak, Service Charge, Diskon, dan TOTAL AKHIR.
5. Kategori: Tentukan kategori yang paling cocok (makanan_minuman, belanja_stok, utilitas, dll).
6. Tentukan Type: "expense" (pengeluaran) atau "income" (jika ini struk penjualan toko kamu).

Output harus JSON murni:
{
  "type": "expense",
  "data": {
    "merchantName": "Nama Toko",
    "amount": 100000,
    "items": [{"name": "Item A", "quantity": 1, "price": 100000, "total": 100000}],
    "category": "makanan_minuman",
    "paymentMethod": "qris",
    "date": "YYYY-MM-DD",
    "notes": "Alamat/Info tambahan"
  },
  "confidence": 95
}`;

	const geminiResult = await callGeminiAPI(prompt, base64Data, mimeType, { maxOutputTokens: 2000 });

	if (!geminiResult.success || !geminiResult.text) {
		throw new ConvexError(`SumoPod OCR gagal: ${geminiResult.error || "Tidak ada respon dari AI"}`);
	}

	const parsed = parseAIScanJSON(geminiResult.text);
	
	if (parsed) {
		return {
			type: (parsed.type || parsed.transactionType || "unknown") as any,
			data: parsed.data || parsed,
			rawText: geminiResult.text,
			confidence: (parsed.confidence || 50) / 100, // Normalized to 0-1
		};
	}

	// Fallback to raw text if parsing failed
	return {
		type: "unknown",
		data: {},
		rawText: geminiResult.text,
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
			const txId = await ctx.runMutation(api.finance.createTransaction, {
				type: effectiveType as "income" | "expense",
				amount: scanResult.data.amount,
				category: scanResult.data.category || "Lainnya",
				description:
					scanResult.data.description || scanResult.rawText.slice(0, 200),
				date: Date.now(),
				paymentMethod: scanResult.data.paymentMethod || "cash",
				status: "completed",
			});

			return {
				success: true,
				message: `Berhasil mencatat ${effectiveType === "expense" ? "pengeluaran" : "pemasukan"} sebesar Rp${scanResult.data.amount.toLocaleString("id-ID")}`,
				generated: {
					id: txId,
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
					const txId = await ctx.runMutation(api.finance.createTransaction, {
						type: effectiveType as "income" | "expense",
						amount: scanResult.data.amount,
						category: scanResult.data.category || "Lainnya",
						description:
							scanResult.data.description || scanResult.rawText.slice(0, 200),
						date: Date.now(),
						paymentMethod: scanResult.data.paymentMethod || "cash",
						status: "completed",
					});

					generated.push({
						id: txId as string,
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
 * Scan gambar dengan AI (SumoPod Gemini) dan ekstrak data terstruktur.
 * Mendukung: struk belanja, kwitansi, nota, tulisan tangan, produk, dll.
 * Menggunakan SumoPod AI (Gemini) untuk stabilitas tinggi.
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

			// Extract base64 data and detect MIME type
			let base64Data: string;
			let mimeType: string;

			if (args.image.startsWith("data:")) {
				const mimeMatch = args.image.match(/^data:(image\/[a-zA-Z+]+);base64,/);
				mimeType = mimeMatch ? mimeMatch[1] : "image/jpeg";
				base64Data = args.image.split(",")[1] || "";
			} else {
				// Raw base64 tanpa data URL prefix
				base64Data = args.image;
				mimeType = "image/jpeg";
			}

			if (!base64Data || base64Data.length < 50) {
				throw new ConvexError("Data base64 gambar tidak valid. Silakan upload ulang gambar.");
			}

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
5. Daftar Item (Kritis): Ekstrak SEMUA item tanpa kecuali. Untuk setiap item sertakan nama, qty, harga satuan (price), dan subtotal (qty * price).
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
  "discount": diskon_angka,
  "items": [{"name": "nama item", "qty": jumlah, "price": harga_satuan, "subtotal": total_per_item}],
  "date": "YYYY-MM-DD atau null",
  "paymentMethod": "cash|qris|card|transfer|unknown",
  "notes": "alamat toko, nomor telepon, nomor struk, atau info penting lainnya",
  "suggestedAction": "createProduct|addStock|createTransaction|createOrder|none",
  "confidence": angka 0-100 tingkat keyakinan,
  "rawText": "semua teks mentah yang terbaca"
}

PENTING:
- Jika gambar adalah label produk, set suggestedAction ke "createProduct" atau "addStock".
- Jika gambar adalah struk belanja, set suggestedAction ke "createTransaction".
- Jika gambar adalah pesanan pelanggan, set suggestedAction ke "createOrder".
- Periksa detail pajak dan service charge secara spesifik karena sering muncul di struk restoran.
- Pastikan semua angka adalah integer murni tanpa pemisah ribuan (contoh: 250000).
- Jika tulisan tangan, gunakan context untuk menebak kata yang paling masuk akal.
- Nama merchant harus selalu diisi meskipun hanya terbaca sebagian.
- HANYA kembalikan JSON.`;

			// Gunakan SumoPod API (Gemini) untuk scan gambar
			const geminiResult = await callGeminiAPI(prompt, base64Data, mimeType);

			if (!geminiResult.success || !geminiResult.text) {
				console.error("scanImageData: callGeminiAPI failed:", geminiResult.error);
				throw new ConvexError(
					`AI SCAN ERROR (V2-SUMOPOD): ${geminiResult.error || "Coba lagi dengan gambar yang lebih jelas."}`
				);
			}

			const parsed = parseAIScanJSON(geminiResult.text);
			if (!parsed) {
				console.error("scanImageData: parsing failed for:", geminiResult.text.slice(0, 500));
				throw new ConvexError("AI tidak dapat mengekstrak data dari gambar. Pastikan gambar jelas dan coba lagi.");
			}

			// Ensure legacy structure for compatibility if needed
			const result = {
				...parsed,
				rawText: parsed.rawText || geminiResult.text,
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
