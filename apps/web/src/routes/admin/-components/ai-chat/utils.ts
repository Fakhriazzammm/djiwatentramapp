import type { QuickActionButton, GenericActionButton, ScanResultData, ScanActionButton, ChartData, ExportData } from "./types";

export const mkMsgId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

export const toRupiah = (val: any) => {
	const num = typeof val === 'number' ? val : Number(val || 0);
	return isNaN(num) ? "0" : num.toLocaleString("id-ID");
};

export const TOOL_LABELS: Record<string, string> = {
	createProduct: "Buat Produk",
	updateProduct: "Update Produk",
	deleteProduct: "Hapus Produk",
	createCategory: "Buat Kategori",
	deleteCategory: "Hapus Kategori",
	createInventoryItem: "Buat Item Inventaris",
	addStock: "Tambah Stok",
	usageStock: "Kurangi Stok",
	adjustStock: "Atur Stok",
	deleteInventoryItem: "Hapus Item Inventaris",
	createOrder: "Buat Pesanan",
	updateOrderStatus: "Update Status Pesanan",
	createTransaction: "Catat Transaksi",
	deleteTransaction: "Hapus Transaksi",
	createDiscount: "Buat Diskon",
	updateDiscount: "Update Diskon",
	toggleDiscount: "Aktif/Nonaktifkan Diskon",
	deleteDiscount: "Hapus Diskon",
	createHppCalculation: "Buat Kalkulasi HPP",
	updateHppCalculation: "Update Kalkulasi HPP",
	deleteHppCalculation: "Hapus Kalkulasi HPP",
	syncHppWithInventoryPrices: "Sinkronkan Harga HPP",
	updateStoreSettings: "Update Pengaturan Toko",
	analyzeDiscountEffectiveness: "Analisis Efektivitas Diskon",
	createReconciliationTransaction: "Rekonsiliasi Keuangan",
	createBooking: "Buat Booking",
	bulkCreateBookings: "Buat Bulk Booking",
};

export function generateQuickActions(userMsg: string, aiResponse: string): QuickActionButton[] {
	const userText = userMsg.toLowerCase();
	const aiText = aiResponse.toLowerCase();
	let id = 0;

	const rules = [
		{
			keys: [
				{ word: "keuangan", weight: 3 },
				{ word: "pendapatan", weight: 3 },
				{ word: "pengeluaran", weight: 3 },
				{ word: "pemasukan", weight: 3 },
				{ word: "saldo", weight: 2 },
				{ word: "laporan keuangan", weight: 4 },
				{ word: "catat transaksi", weight: 4 },
				{ word: "rekonsiliasi", weight: 4 },
				{ word: "laba", weight: 2 },
				{ word: "omset", weight: 3 },
				{ word: "untung", weight: 2 },
				{ word: "rugi", weight: 2 },
				{ word: "laba rugi", weight: 5 },
				{ word: "arus kas", weight: 5 },
				{ word: "laporan", weight: 2 },
				{ word: "export", weight: 2 },
				{ word: "pdf", weight: 2 },
				{ word: "excel", weight: 2 },
			],
			buttons: [
				{ label: "Laporan Keuangan", icon: "📊", variant: "finance", actionType: "navigate", href: "/admin/finance/reports" },
				{ label: "Lihat Keuangan", icon: "💰", variant: "finance", actionType: "navigate", href: "/admin/finance" },
				{ label: "Catat Transaksi", icon: "📝", variant: "finance", actionType: "sendPrompt", prompt: "Bantu saya mencatat transaksi keuangan baru" },
			],
		},
		{
			keys: [
				{ word: "produk", weight: 2 },
				{ word: "menu", weight: 2 },
				{ word: "makanan", weight: 2 },
				{ word: "minuman", weight: 2 },
				{ word: "item", weight: 1 },
				{ word: "katalog", weight: 3 },
				{ word: "tambah produk", weight: 4 },
				{ word: "hapus produk", weight: 4 },
				{ word: "edit produk", weight: 4 },
				{ word: "harga jual", weight: 2 },
				{ word: "kategori produk", weight: 3 },
			],
			buttons: [
				{ label: "Lihat Produk", icon: "🛍️", variant: "product", actionType: "navigate", href: "/admin/products" },
				{ label: "Tambah Produk", icon: "➕", variant: "product", actionType: "sendPrompt", prompt: "Bantu saya menambahkan produk baru ke katalog" },
			],
		},
		{
			keys: [
				{ word: "pesanan", weight: 3 },
				{ word: "order", weight: 2 },
				{ word: "pelanggan", weight: 2 },
				{ word: "buat pesanan", weight: 4 },
				{ word: "transaksi penjualan", weight: 3 },
				{ word: "checkout", weight: 3 },
				{ word: "pembeli", weight: 2 },
				{ word: "penjualan", weight: 2 },
			],
			buttons: [
				{ label: "Lihat Pesanan", icon: "📋", variant: "order", actionType: "navigate", href: "/admin/orders" },
				{ label: "Buat Pesanan", icon: "🛒", variant: "order", actionType: "sendPrompt", prompt: "Bantu saya membuat pesanan baru untuk pelanggan" },
			],
		},
		{
			keys: [
				{ word: "stok", weight: 3 },
				{ word: "inventaris", weight: 3 },
				{ word: "bahan baku", weight: 3 },
				{ word: "bahan", weight: 1 },
				{ word: "persediaan", weight: 3 },
				{ word: "restock", weight: 4 },
				{ word: "stok habis", weight: 4 },
				{ word: "stok rendah", weight: 4 },
				{ word: "kehabisan", weight: 3 },
				{ word: "supplier", weight: 2 },
			],
			buttons: [
				{ label: "Lihat Inventaris", icon: "📦", variant: "stock", actionType: "navigate", href: "/admin/inventory" },
				{ label: "Tambah Stok", icon: "⬆️", variant: "stock", actionType: "sendPrompt", prompt: "Bantu saya menambahkan stok inventaris bahan baku" },
			],
		},
		{
			keys: [
				{ word: "diskon", weight: 3 },
				{ word: "promo", weight: 3 },
				{ word: "voucher", weight: 3 },
				{ word: "potongan harga", weight: 4 },
				{ word: "kupon", weight: 3 },
				{ word: "cashback", weight: 3 },
				{ word: "promosi", weight: 3 },
			],
			buttons: [
				{ label: "Lihat Diskon", icon: "🏷️", variant: "discount", actionType: "navigate", href: "/admin/discounts" },
				{ label: "Buat Diskon", icon: "✨", variant: "discount", actionType: "sendPrompt", prompt: "Bantu saya membuat diskon atau promo baru" },
			],
		},
		{
			keys: [
				{ word: "hpp", weight: 4 },
				{ word: "harga pokok", weight: 4 },
				{ word: "biaya produksi", weight: 4 },
				{ word: "modal", weight: 2 },
				{ word: "margin", weight: 3 },
				{ word: "break even", weight: 4 },
			],
			buttons: [
				{ label: "HPP Kalkulator", icon: "🧮", variant: "misc", actionType: "navigate", href: "/admin/hpp-calculator" },
			],
		},
		{
			keys: [
				{ word: "prediksi", weight: 4 },
				{ word: "forecast", weight: 4 },
				{ word: "perkiraan", weight: 3 },
				{ word: "tren penjualan", weight: 4 },
				{ word: "proyeksi", weight: 4 },
				{ word: "ramalan", weight: 3 },
			],
			buttons: [
				{ label: "Lihat Forecast", icon: "📈", variant: "misc", actionType: "navigate", href: "/admin/forecasting" },
			],
		},
		{
			keys: [
				{ word: "booking", weight: 4 },
				{ word: "reservasi", weight: 4 },
				{ word: "jadwal", weight: 2 },
				{ word: "meja", weight: 2 },
				{ word: "tempat duduk", weight: 3 },
				{ word: "kapasitas", weight: 2 },
			],
			buttons: [
				{ label: "Lihat Booking", icon: "📅", variant: "misc", actionType: "navigate", href: "/admin/booking" },
			],
		},
		{
			keys: [
				{ word: "pengaturan", weight: 3 },
				{ word: "setting", weight: 3 },
				{ word: "profil toko", weight: 4 },
				{ word: "nama toko", weight: 4 },
				{ word: "jam buka", weight: 4 },
				{ word: "alamat", weight: 2 },
				{ word: "konfigurasi", weight: 3 },
			],
			buttons: [
				{ label: "Pengaturan Toko", icon: "⚙️", variant: "misc", actionType: "navigate", href: "/admin/settings" },
			],
		},
	];

	const scored = rules.map((rule) => {
		let score = 0;
		for (const { word, weight } of rule.keys) {
			if (userText.includes(word)) score += weight * 2;
			else if (aiText.includes(word)) score += weight;
		}
		return { rule, score };
	});

	const sorted = scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score);
	const seen = new Set<string>();
	const result: QuickActionButton[] = [];

	for (const { rule } of sorted) {
		for (const btn of rule.buttons) {
			const key = btn.href ?? (btn as any).prompt ?? btn.label;
			if (!seen.has(key)) {
				seen.add(key);
				result.push({ ...btn, id: `qa-${id++}` } as QuickActionButton);
			}
		}
		if (result.length >= 4) break;
	}

	if (result.length === 0) {
		return [
			{ id: `qa-${id++}`, label: "Rekap Hari Ini", icon: "📊", variant: "misc", actionType: "sendPrompt", prompt: "Berikan rekap lengkap bisnis hari ini" },
			{ id: `qa-${id++}`, label: "Stok Rendah", icon: "⚠️", variant: "stock", actionType: "sendPrompt", prompt: "Tampilkan produk yang stoknya rendah atau habis" },
			{ id: `qa-${id++}`, label: "Laporan Keuangan", icon: "📊", variant: "finance", actionType: "navigate", href: "/admin/finance/reports" },
			{ id: `qa-${id++}`, label: "Lihat Keuangan", icon: "💰", variant: "finance", actionType: "navigate", href: "/admin/finance" },
		] as QuickActionButton[];
	}

	return result.slice(0, 4);
}

export const extractSuggestions = (text: string): Array<{ label: string; prompt: string }> => {
	const suggestions: Array<{ label: string; prompt: string }> = [];
	const regex = /\[SUGGEST:\s*(.*?)\s*\|\s*(.*?)\s*\]/g;
	let match;
	while ((match = regex.exec(text)) !== null) {
		suggestions.push({
			label: match[1].trim(),
			prompt: match[2].trim(),
		});
	}
	return suggestions;
};

export const CASIER_TEMPLATES = [
	{ label: "Briefing Bisnis", message: "Berikan briefing status bisnis saya saat ini", icon: "✨", category: "report" },
	{ label: "Pemasukan", message: "Saya ingin mencatat pemasukan", icon: "💰", category: "income" },
	{ label: "Pengeluaran", message: "Saya ingin mencatat pengeluaran", icon: "💸", category: "expense" },
	{ label: "Stok Habis", message: "Item stok apa saja yang hampir habis?", icon: "📦", category: "stock" },
	{ label: "Audit Toko", message: "Tolong audit foto toko saya ini, apakah sudah rapi dan bersih?", icon: "🔍", category: "vision" },
	{ label: "Cek Produk", message: "Tolong cek penataan produk di foto ini, apakah ada yang kurang menarik?", icon: "📸", category: "vision" },
	{ label: "Rekap Lengkap", message: "Berikan rekapitulasi detail bisnis saya: jumlah produk per kategori, pemasukan, pengeluaran, dan jumlah pesanan untuk periode: hari ini, kemarin, minggu ini, minggu lalu, bulan ini, dan bulan lalu.", icon: "📊", category: "report" },
	{ label: "Laba Rugi", message: "Berikan ringkasan laba rugi hari ini: pendapatan, HPP, beban, dan laba bersih", icon: "📈", category: "report" },
];

export const sanitizeResponse = (text: string): string => {
	if (!text) return "";
	return text
		.replace(/🚀 TOMBOL AKSI:[\s\S]*/, "")
		.replace(/\[SUGGEST:\s*(.*?)\s*\|\s*(.*?)\s*\]/g, "")
		.replace(/\[QUICK:\s*(.*?)\s*\|\s*(.*?)\s*\]/g, "")
		.replace(/\[CHART:[\s\S]*?\]/g, "")
		.replace(/\[EXPORT:[\s\S]*?\]/g, "")
		.trim();
};

export const extractExportData = (text: string): ExportData | undefined => {
	const regex = /\[EXPORT:\s*(\{[\s\S]*?\})\s*\]/;
	const match = text.match(regex);
	if (match && match[1]) {
		try {
			return JSON.parse(match[1]);
		} catch (e) {
			console.error("Failed to parse export data:", e);
		}
	}
	return undefined;
};

export const extractChartData = (text: string): ChartData | undefined => {
	const regex = /\[CHART:\s*(\{[\s\S]*?\})\s*\]/;
	const match = text.match(regex);
	if (match && match[1]) {
		try {
			return JSON.parse(match[1]);
		} catch (e) {
			console.error("Failed to parse chart data:", e);
		}
	}
	return undefined;
};

export const extractGenericActions = (text: string): GenericActionButton[] => {
	const actions: GenericActionButton[] = [];
	const regex = /🚀 TOMBOL AKSI:([\s\S]*)/;
	const match = text.match(regex);

	if (match && match[1]) {
		const actionLines = match[1].trim().split('\n');
		actionLines.forEach((line, index) => {
			const actionMatch = line.match(/\*\s*(.*?)\s*\|\s*(.*)/);
			if (actionMatch) {
				actions.push({
					id: `gen-action-${Date.now()}-${index}`,
					label: actionMatch[1].trim(),
					prompt: actionMatch[2].trim(),
				});
			}
		});
	}

	return actions;
};

export const generateScanActionButtons = (scanData: ScanResultData): ScanActionButton[] => {
	const categoryMap: Record<string, string> = {
		makanan_minuman: "Makanan & Minuman",
		belanja_stok: "Pembelian Stok",
		peralatan_kantor: "Peralatan Kantor",
		transportasi: "Transportasi",
		utilitas_listrik_air: "Utilitas",
		gaji_karyawan: "Gaji Karyawan",
		sewa_tempat: "Sewa Tempat",
		pemasaran: "Pemasaran",
		pajak: "Pajak",
		hiburan: "Hiburan",
		kesehatan: "Kesehatan",
		pembangunan_renovasi: "Renovasi",
		lainnya: "Lainnya",
	};
	const paymentMap: Record<string, string> = {
		cash: "cash", qris: "qris", card: "card", transfer: "transfer", unknown: "cash",
	};
	const category = categoryMap[scanData.category] ?? scanData.category.replace(/_/g, " ");
	const paymentMethod = paymentMap[scanData.paymentMethod] || "cash";
	
	let dateTs = Date.now();
	if (scanData.date) {
		const parsedDate = new Date(scanData.date);
		if (!Number.isNaN(parsedDate.getTime())) {
			dateTs = parsedDate.getTime();
		}
	}

	const baseParams = {
		amount: scanData.total,
		category,
		merchant: scanData.name || undefined,
		description: scanData.notes ? scanData.notes.slice(0, 200) : undefined,
		date: dateTs,
		paymentMethod: paymentMethod as any,
		status: "completed" as const,
	};
	const buttons: ScanActionButton[] = [];
	const ts = Date.now();
	if (scanData.transactionType === "expense" || scanData.transactionType === "unknown") {
		buttons.push({
			id: `expense-${ts}`,
			label: "Catat Pengeluaran",
			icon: "💸",
			variant: "expense",
			params: { type: "expense", ...baseParams },
		});
	}
	if (scanData.transactionType === "income" || scanData.transactionType === "unknown") {
		buttons.push({
			id: `income-${ts + 1}`,
			label: "Catat Pemasukan",
			icon: "💰",
			variant: "income",
			params: { type: "income", ...baseParams },
		});
	}
	if (
		scanData.type === "product" ||
		["belanja_stok", "peralatan_kantor"].includes(scanData.category)
	) {
		buttons.push({
			id: `stock-${ts + 2}`,
			label: "Catat ke Stok",
			icon: "📦",
			variant: "stock",
			params: { type: "expense", ...baseParams, category: "Pembelian Stok" },
		});
	}
	return buttons;
};
