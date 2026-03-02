// @ts-nocheck
import type { GenericActionCtx } from "convex/server";
import { v } from "convex/values";
import OpenAI from "openai";
import type { z } from "zod";
import { api } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { action, mutation, query } from "./_generated/server";
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
						"You are an AI Business Analyst for YUMI POS. Analyze sales data and provide 3 bullet points of insights and 1 strategic recommendation.",
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
					`• ${new Date(t.date).toLocaleDateString("id-ID")} | ${t.type === "income" ? "PEMASUKAN" : "PENGELUARAN"} | Rp${t.amount.toLocaleString("id-ID")} | ${t.category} | ${t.description || "-"} | ${t.paymentMethod || "CASH"} | ${t.status}`
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

== FITUR APLIKASI ==
- Manajemen Produk & Kategori (CRUD, variasi, upload gambar)
- Manajemen Inventaris & Stok (FIFO, low-stock alert, resep, base recipe/pre-mix)
- Pemesanan & POS (buat pesanan, update status, cetak struk Bluetooth)
- Keuangan (income/expense tracking, laporan periode)
- Promosi & Diskon (FIXED/PERCENTAGE/FLAT_PRICE, jadwal, target) - termasuk ANALISIS EFEKTIVITAS DISKON
- HPP / Kalkulator Harga Pokok Produksi (perhitungan biaya bahan baku, margin, laba) - termasuk SIMULASI HPP BARU
- Forecasting AI (prediksi stok habis, jam ramai, revenue, produk trending)
- Rekonsiliasi Keuangan (cross-check pesanan vs transaksi keuangan)
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
		image: v.optional(v.string()), // base64 data URL for vision processing
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
				content: `Kamu adalah Yumi, asisten AI cerdas untuk aplikasi YUMI POS (Point of Sale).

KEMAMPUAN:
- Mengetahui SELURUH data database secara real-time (produk, stok, pesanan, keuangan, promosi)
- Dapat merekap dan meringkas data (harian, mingguan, bulanan)
- Dapat mengambil dan menampilkan data spesifik
- Mengetahui seluruh fitur aplikasi dan cara penggunaannya
- Memberikan saran bisnis berdasarkan data
- DAPAT MELAKUKAN AKSI: create/update/delete produk, tambah/kurang stok, buat pesanan, catat transaksi keuangan, kelola diskon, dll
- MULTI-STEP ACTIONS: Dapat melakukan beberapa langkah sekaligus dalam satu permintaan
- FORECASTING: Analisis prediksi stok habis, jam ramai, revenue, dan produk trending berdasarkan data historis
- HPP KALKULATOR: Bantu hitung Harga Pokok Produksi (HPP), margin, dan analisis profitabilitas per produk
- ANALISIS DISKON: Evaluasi efektivitas diskon yang aktif, rekomendasikan strategi promo berdasarkan data penjualan
- REKONSILIASI KEUANGAN: Cross-check pesanan selesai vs transaksi keuangan, identifikasi selisih, bantu rekonsiliasi
- ANALISIS GAMBAR: Dapat membaca dan menganalisis gambar (foto struk, kwitansi, produk, dll) yang dikirim user. Ekstrak informasi seperti jumlah, item, tanggal, kategori, dan langsung catat ke sistem jika diminta

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
- Contoh: "Analisis efektivitas diskon saya" -> gunakan analyzeDiscountEffectiveness lalu jelaskan hasil
- Contoh: "Rekonsiliasi keuangan bulan ini" -> cek data rekonsiliasi dari context lalu sarankan createReconciliationTransaction jika ada gap
- Contoh: "Hitung HPP untuk produk X dengan bahan Y dan Z" -> gunakan createHppCalculation
- Contoh: "Prediksi stok yang akan habis" -> analisis data forecasting dari context dan berikan rekomendasi
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

		// Support vision: if image is attached, analyze with Gemini first then include analysis in chat
		if (args.image) {
			let imageAnalysis = "";

			const visionPrompt = `Analisis gambar ini secara detail dan menyeluruh dalam Bahasa Indonesia.

Jika gambar adalah struk/kwitansi/nota belanja:
- Baca SEMUA teks dari atas ke bawah
- Daftar SEMUA item beserta harga dan jumlahnya
- Total belanja, subtotal, pajak, diskon
- Nama toko, tanggal, metode pembayaran
- Hitung ulang: total = jumlah semua harga item

Jika gambar adalah tulisan tangan:
- Baca dan transkrip SELURUH tulisan yang ada
- Identifikasi jika ada angka/nominal uang

Jika gambar adalah dokumen/produk lain:
- Deskripsikan isinya secara lengkap
- Ekstrak semua teks yang terlihat

Berikan jawaban yang lengkap dan detail.`;

			const visionResult = await callGeminiVision(args.image, visionPrompt, {
				temperature: 0.2,
				maxOutputTokens: 2000,
			});

			if (visionResult.success) {
				imageAnalysis = visionResult.content;
			} else {
				console.error("Vision analysis failed:", visionResult.error);
				imageAnalysis = "Gambar diterima namun analisis visual gagal. User mengirim gambar yang perlu dianalisis.";
			}

			// Include image analysis context in the user message
			const userText = args.message || "Tolong analisis gambar ini dan ekstrak informasi yang relevan.";
			const messageWithAnalysis = `${userText}\n\n[HASIL ANALISIS GAMBAR OLEH VISION AI]:\n${imageAnalysis}`;

			messages.push({ role: "user", content: messageWithAnalysis });
		} else {
			messages.push({ role: "user", content: args.message });
		}

		// Multi-step tool calling loop - allows AI to chain multiple tool calls
		const maxIterations = 5;
		let currentIteration = 0;

		while (currentIteration < maxIterations) {
			currentIteration++;

			let completion;
			try {
				completion = await getOpenAI().chat.completions.create({
					model: "gpt-4o-mini",
					messages,
					tools: openaiTools,
					tool_choice: "auto",
					max_tokens: 2000,
				});
			} catch (apiError) {
				console.error("Chat API error:", apiError);
				throw new Error("Gagal memproses permintaan. Silakan coba lagi.");
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
/**
 * Helper: Call Gemini Vision API for image analysis
 * Used by both OCR and chat vision features
 */
async function callGeminiVision(
	imageDataUrl: string,
	prompt: string,
	options?: { temperature?: number; maxOutputTokens?: number; jsonMode?: boolean }
): Promise<{ success: boolean; content: string; error?: string }> {
	const apiKey = process.env.GEMINI_API_KEY;
	if (!apiKey) {
		return { success: false, content: "", error: "GEMINI_API_KEY tidak dikonfigurasi" };
	}

	const base64Data = imageDataUrl.split(",")[1];
	if (!base64Data) {
		return { success: false, content: "", error: "Format data URL gambar tidak valid" };
	}

	const mimeMatch = imageDataUrl.match(/^data:(image\/[a-zA-Z+]+);base64,/);
	const mimeType = mimeMatch ? mimeMatch[1] : "image/jpeg";

	try {
		const response = await fetch(
			`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					contents: [
						{
							parts: [
								{ inline_data: { mime_type: mimeType, data: base64Data } },
								{ text: prompt },
							],
						},
					],
					generationConfig: {
						temperature: options?.temperature ?? 0.1,
						maxOutputTokens: options?.maxOutputTokens ?? 2500,
						...(options?.jsonMode ? { responseMimeType: "application/json" } : {}),
					},
				}),
			}
		);

		if (!response.ok) {
			const errorText = await response.text();
			console.error("Gemini API error:", response.status, errorText);
			return { success: false, content: "", error: `Gemini API error: ${response.status}` };
		}

		const result = await response.json();
		const content = result.candidates?.[0]?.content?.parts?.[0]?.text || "";

		if (!content) {
			return { success: false, content: "", error: "Respons kosong dari Gemini API" };
		}

		return { success: true, content };
	} catch (error) {
		console.error("Gemini Vision error:", error);
		return { success: false, content: "", error: error instanceof Error ? error.message : String(error) };
	}
}

/**
 * Helper: Parse JSON safely from AI response text
 */
function parseJsonFromAIResponse(text: string): any | null {
	// First try: clean markdown fences and parse
	const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

	// Try direct parse
	try {
		return JSON.parse(cleaned);
	} catch {
		// continue
	}

	// Try to find JSON object in text
	const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
	if (jsonMatch) {
		try {
			return JSON.parse(jsonMatch[0]);
		} catch {
			// continue
		}
	}

	return null;
}

/**
 * Helper: Run OCR on a receipt/image using Google Gemini Vision API
 * Extracts text, items, totals, and categorizes the transaction
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
	};
	confidence: number;
	rawText: string;
}> {
	const prompt = `Kamu adalah pakar OCR struk belanja & dokumen keuangan Indonesia.

TUGAS: Baca gambar ini dari atas ke bawah dengan teliti.

LANGKAH ANALISIS:
1. Baca SEMUA teks pada gambar, huruf per huruf jika perlu
2. Identifikasi setiap item/barang: nama, jumlah (qty), harga satuan
3. Hitung dan verifikasi total: jumlahkan semua item, cocokkan dengan total yang tercetak
4. Identifikasi: nama toko/merchant, tanggal, metode pembayaran
5. Tentukan jenis: "expense" (pembelian/pengeluaran) atau "income" (penjualan/pemasukan)

ATURAN ANGKA:
- Semua angka harus numerik (contoh: 50000 bukan "50.000")
- Jika ada titik sebagai pemisah ribuan, hapus titiknya
- Total = angka terbesar di bagian bawah struk, atau jumlah semua item

Kembalikan HANYA JSON valid:
{
  "type": "expense",
  "data": {
    "amount": 85000,
    "items": [
      {"name": "Beras 5kg", "quantity": 1, "price": 65000},
      {"name": "Telur 1kg", "quantity": 2, "price": 10000}
    ],
    "category": "belanja",
    "description": "Belanja di Toko ABC",
    "paymentMethod": "cash",
    "notes": "Tanggal: 15/02/2025, Struk #0041"
  },
  "confidence": 0.95
}

Kategori: makanan, minuman, belanja, bahan_baku, transportasi, tagihan, gaji, hiburan, kesehatan, operasional, lainnya
Metode bayar: cash, qris, transfer, card, unknown`;

	// Use Gemini Vision with JSON mode for reliable structured output
	const geminiResult = await callGeminiVision(imageDataUrl, prompt, {
		temperature: 0.1,
		maxOutputTokens: 2500,
		jsonMode: true,
	});

	if (geminiResult.success && geminiResult.content) {
		const parsed = parseJsonFromAIResponse(geminiResult.content);
		if (parsed && parsed.type && parsed.type !== "unknown") {
			return {
				type: parsed.type as "order" | "expense" | "income" | "unknown",
				data: parsed.data || {},
				rawText: geminiResult.content,
				confidence: parsed.confidence || 0.7,
			};
		}
	}

	// Fallback: retry without JSON mode (some images work better with plain text output)
	const fallbackResult = await callGeminiVision(imageDataUrl, prompt, {
		temperature: 0.15,
		maxOutputTokens: 2500,
		jsonMode: false,
	});

	if (fallbackResult.success && fallbackResult.content) {
		const parsed = parseJsonFromAIResponse(fallbackResult.content);
		if (parsed) {
			return {
				type: (parsed.type as "order" | "expense" | "income" | "unknown") || "unknown",
				data: parsed.data || {},
				rawText: fallbackResult.content,
				confidence: parsed.confidence || 0.5,
			};
		}

		// Could not parse JSON but got text - return as raw text
		return {
			type: "unknown",
			data: { description: fallbackResult.content.slice(0, 500) },
			rawText: fallbackResult.content,
			confidence: 0.3,
		};
	}

	throw new Error(
		geminiResult.error || fallbackResult.error || "Gagal menganalisis gambar. Pastikan gambar jelas dan coba lagi."
	);
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
 * Scan gambar dengan AI (Gemini Vision) dan ekstrak data terstruktur.
 * Mendukung: struk belanja, kwitansi, nota, tulisan tangan, produk, dll.
 * Menggunakan Gemini API langsung karena mendukung vision/image analysis.
 */
export const scanImageData = action({
	args: {
		image: v.string(), // base64 data URL
	},
	handler: async (_ctx, args) => {
		const prompt = `Kamu adalah AI scanner dokumen yang sangat ahli membaca gambar struk belanja, kwitansi, nota, tulisan tangan, dan dokumen lainnya di Indonesia.

LANGKAH ANALISIS:
1. Baca SELURUH teks pada gambar dari atas ke bawah, karakter per karakter jika perlu
2. Identifikasi jenis dokumen (struk, kwitansi, nota, tulisan tangan, dll)
3. Ekstrak SEMUA item/barang dengan nama, jumlah, harga satuan, dan subtotal
4. Hitung total: jumlahkan semua item, verifikasi dengan total yang tercetak
5. Identifikasi nama toko, tanggal, metode pembayaran
6. Jika ada tulisan tangan, baca dan transkrip seluruh teks

ATURAN ANGKA:
- Semua angka harus numerik murni (contoh: 85000 bukan "85.000" atau "Rp 85.000")
- Hapus titik pemisah ribuan (50.000 -> 50000)
- subtotal per item = qty x price
- total = jumlah semua subtotal + pajak - diskon

Kembalikan JSON:
{
  "type": "receipt|invoice|note|handwriting|product|other",
  "name": "nama merchant/toko/sumber",
  "category": "makanan|minuman|belanja|bahan_baku|transportasi|tagihan|gaji|hiburan|kesehatan|operasional|lainnya",
  "transactionType": "expense|income|unknown",
  "total": 0,
  "subtotal": 0,
  "tax": 0,
  "discount": 0,
  "items": [
    {"name": "nama item", "qty": 1, "price": 0, "subtotal": 0}
  ],
  "date": "YYYY-MM-DD atau null",
  "paymentMethod": "cash|qris|card|transfer|unknown",
  "notes": "informasi penting lainnya",
  "confidence": 85,
  "rawText": "semua teks yang terbaca dari gambar"
}

Penting:
- confidence: 90-100 jelas terbaca, 60-89 sebagian terbaca, di bawah 60 tidak jelas
- Jika gambar bukan dokumen keuangan, tetap baca teks dan isi rawText
- Jika ada tulisan tangan pada gambar, baca dan masukkan ke rawText dan notes`;

		// Try with JSON mode first for reliable structured output
		const result = await callGeminiVision(args.image, prompt, {
			temperature: 0.1,
			maxOutputTokens: 3000,
			jsonMode: true,
		});

		if (result.success && result.content) {
			const parsed = parseJsonFromAIResponse(result.content);
			if (parsed) {
				// Validate and fix total calculation
				if (parsed.items && Array.isArray(parsed.items) && parsed.items.length > 0) {
					const calculatedTotal = parsed.items.reduce(
						(sum: number, item: any) => sum + (item.subtotal || (item.qty || 1) * (item.price || 0)),
						0
					);
					// If parsed total is 0 or missing but we have items, use calculated total
					if ((!parsed.total || parsed.total === 0) && calculatedTotal > 0) {
						parsed.total = calculatedTotal;
					}
					// Fix individual item subtotals if missing
					for (const item of parsed.items) {
						if (!item.subtotal && item.price) {
							item.subtotal = (item.qty || 1) * item.price;
						}
					}
				}
				return parsed;
			}
		}

		// Fallback: retry without JSON mode
		const fallbackResult = await callGeminiVision(args.image, prompt, {
			temperature: 0.15,
			maxOutputTokens: 3000,
			jsonMode: false,
		});

		if (fallbackResult.success && fallbackResult.content) {
			const parsed = parseJsonFromAIResponse(fallbackResult.content);
			if (parsed) {
				// Same total validation
				if (parsed.items && Array.isArray(parsed.items) && parsed.items.length > 0) {
					const calculatedTotal = parsed.items.reduce(
						(sum: number, item: any) => sum + (item.subtotal || (item.qty || 1) * (item.price || 0)),
						0
					);
					if ((!parsed.total || parsed.total === 0) && calculatedTotal > 0) {
						parsed.total = calculatedTotal;
					}
				}
				return parsed;
			}

			// Return raw text extraction
			return {
				type: "other",
				name: "Dokumen",
				category: "lainnya",
				transactionType: "unknown" as const,
				total: 0,
				subtotal: 0,
				tax: 0,
				discount: 0,
				items: [],
				date: null,
				paymentMethod: "unknown",
				notes: "Teks berhasil diekstrak dari gambar.",
				confidence: 40,
				rawText: fallbackResult.content,
			};
		}

		throw new Error(
			result.error || "Gagal menganalisis gambar. Pastikan gambar jelas (JPG/PNG) dan coba lagi."
		);
	},
});

/**
 * Save scanned image data directly to financial transactions
 * Called from the ScanResultCard "Simpan ke Keuangan" button
 */
export const saveScannedToFinance = action({
	args: {
		type: v.union(v.literal("income"), v.literal("expense")),
		amount: v.number(),
		category: v.string(),
		description: v.optional(v.string()),
		paymentMethod: v.optional(v.string()),
		date: v.optional(v.string()), // YYYY-MM-DD string or null
		items: v.optional(
			v.array(
				v.object({
					name: v.string(),
					qty: v.number(),
					price: v.number(),
					subtotal: v.number(),
				})
			)
		),
	},
	handler: async (ctx, args) => {
		// Parse date or use current time
		let dateTimestamp = Date.now();
		if (args.date) {
			const parsed = new Date(args.date);
			if (!Number.isNaN(parsed.getTime())) {
				dateTimestamp = parsed.getTime();
			}
		}

		// Build description from items if not provided
		let description = args.description || "";
		if (!description && args.items && args.items.length > 0) {
			description = args.items
				.map((item) => `${item.name} x${item.qty} @Rp${item.price.toLocaleString("id-ID")}`)
				.join(", ");
		}

		const txId = await ctx.runMutation(api.finance.createTransaction, {
			type: args.type,
			amount: args.amount,
			category: args.category || "Lainnya",
			description: description.slice(0, 500),
			date: dateTimestamp,
			paymentMethod: args.paymentMethod || "cash",
			status: "completed",
		});

		return {
			success: true,
			transactionId: txId,
			message: `Berhasil menyimpan ${args.type === "expense" ? "pengeluaran" : "pemasukan"} sebesar Rp${args.amount.toLocaleString("id-ID")} ke keuangan`,
		};
	},
});
