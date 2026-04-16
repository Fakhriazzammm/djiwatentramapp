import type { QuickActionButton, GenericActionButton, ScanResultData, ScanActionButton, ChartData, ExportData, ResponseTableData } from "./types";

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
	getInventoryBatches: "Lihat Batch Stok",
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
	updateHppSellingPrice: "Update Harga Jual HPP",
	setFinancialTarget: "Set Target Keuangan",
	updateStoreSettings: "Update Pengaturan Toko",
	analyzeDiscountEffectiveness: "Analisis Efektivitas Diskon",
	createReconciliationTransaction: "Rekonsiliasi Keuangan",
	createBooking: "Buat Booking",
	bulkCreateBookings: "Buat Bulk Booking",
	updateBookingStatus: "Update Status Booking",
	createUser: "Buat User",
	updateUser: "Update User",
	deleteUser: "Hapus User",
	createRole: "Buat Role",
	deleteRole: "Hapus Role",
};

export function generateQuickActions(userMsg: string, aiResponse: string): QuickActionButton[] {
	const userText = userMsg.toLowerCase();
	const aiText = aiResponse.toLowerCase();
	let id = 0;

	const rules = [
		{
			keys: [
				{ word: "keuangan", weight: 3 }, { word: "pendapatan", weight: 3 },
				{ word: "pengeluaran", weight: 3 }, { word: "pemasukan", weight: 3 },
				{ word: "saldo", weight: 2 }, { word: "laporan keuangan", weight: 4 },
				{ word: "catat transaksi", weight: 4 }, { word: "rekonsiliasi", weight: 4 },
				{ word: "laba", weight: 2 }, { word: "omset", weight: 3 },
				{ word: "untung", weight: 2 }, { word: "rugi", weight: 2 },
				{ word: "laba rugi", weight: 5 }, { word: "arus kas", weight: 5 },
				{ word: "laporan", weight: 2 }, { word: "export", weight: 2 },
				{ word: "pdf", weight: 2 }, { word: "excel", weight: 2 },
				{ word: "profit", weight: 3 }, { word: "revenue", weight: 3 },
			],
			buttons: [
				{ label: "Laporan Keuangan", icon: "📊", variant: "finance", actionType: "navigate", href: "/admin/finance/reports" },
				{ label: "Lihat Keuangan", icon: "💰", variant: "finance", actionType: "navigate", href: "/admin/finance" },
				{ label: "Catat Transaksi", icon: "📝", variant: "finance", actionType: "sendPrompt", prompt: "Bantu saya mencatat transaksi keuangan baru" },
			],
		},
		{
			keys: [
				{ word: "produk", weight: 2 }, { word: "menu", weight: 2 },
				{ word: "makanan", weight: 2 }, { word: "minuman", weight: 2 },
				{ word: "katalog", weight: 3 }, { word: "tambah produk", weight: 4 },
				{ word: "hapus produk", weight: 4 }, { word: "edit produk", weight: 4 },
				{ word: "harga jual", weight: 2 }, { word: "kategori produk", weight: 3 },
				{ word: "variasi", weight: 2 }, { word: "ketersediaan", weight: 2 },
			],
			buttons: [
				{ label: "Lihat Produk", icon: "🛍️", variant: "product", actionType: "navigate", href: "/admin/products" },
				{ label: "Tambah Produk", icon: "➕", variant: "product", actionType: "sendPrompt", prompt: "Bantu saya menambahkan produk baru ke katalog" },
			],
		},
		{
			keys: [
				{ word: "pesanan", weight: 3 }, { word: "order", weight: 2 },
				{ word: "pelanggan", weight: 2 }, { word: "buat pesanan", weight: 4 },
				{ word: "transaksi penjualan", weight: 3 }, { word: "checkout", weight: 3 },
				{ word: "pembeli", weight: 2 }, { word: "penjualan", weight: 2 },
				{ word: "kasir", weight: 3 }, { word: "pos", weight: 2 },
				{ word: "bayar", weight: 2 }, { word: "pembayaran", weight: 2 },
			],
			buttons: [
				{ label: "Lihat Pesanan", icon: "📋", variant: "order", actionType: "navigate", href: "/admin/orders" },
				{ label: "Buat Pesanan", icon: "🛒", variant: "order", actionType: "sendPrompt", prompt: "Bantu saya membuat pesanan baru untuk pelanggan" },
			],
		},
		{
			keys: [
				{ word: "stok", weight: 3 }, { word: "inventaris", weight: 3 },
				{ word: "bahan baku", weight: 3 }, { word: "bahan", weight: 1 },
				{ word: "persediaan", weight: 3 }, { word: "restock", weight: 4 },
				{ word: "stok habis", weight: 4 }, { word: "stok rendah", weight: 4 },
				{ word: "kehabisan", weight: 3 }, { word: "supplier", weight: 2 },
				{ word: "resep", weight: 3 }, { word: "fifo", weight: 3 },
				{ word: "batch", weight: 2 }, { word: "kadaluarsa", weight: 3 },
			],
			buttons: [
				{ label: "Lihat Inventaris", icon: "📦", variant: "stock", actionType: "navigate", href: "/admin/inventory" },
				{ label: "Tambah Stok", icon: "⬆️", variant: "stock", actionType: "sendPrompt", prompt: "Bantu saya menambahkan stok inventaris bahan baku" },
			],
		},
		{
			keys: [
				{ word: "diskon", weight: 3 }, { word: "promo", weight: 3 },
				{ word: "voucher", weight: 3 }, { word: "potongan harga", weight: 4 },
				{ word: "kupon", weight: 3 }, { word: "cashback", weight: 3 },
				{ word: "promosi", weight: 3 }, { word: "happy hour", weight: 4 },
				{ word: "sale", weight: 2 }, { word: "bundle", weight: 3 },
			],
			buttons: [
				{ label: "Lihat Diskon", icon: "🏷️", variant: "discount", actionType: "navigate", href: "/admin/discounts" },
				{ label: "Buat Diskon", icon: "✨", variant: "discount", actionType: "sendPrompt", prompt: "Bantu saya membuat diskon atau promo baru" },
			],
		},
		{
			keys: [
				{ word: "hpp", weight: 4 }, { word: "harga pokok", weight: 4 },
				{ word: "biaya produksi", weight: 4 }, { word: "modal", weight: 2 },
				{ word: "margin", weight: 3 }, { word: "break even", weight: 4 },
				{ word: "cogs", weight: 4 }, { word: "laba per produk", weight: 4 },
				{ word: "biaya overhead", weight: 3 }, { word: "harga beli", weight: 2 },
			],
			buttons: [
				{ label: "HPP Kalkulator", icon: "🧮", variant: "misc", actionType: "navigate", href: "/admin/hpp-calculator" },
				{ label: "Analisis Margin", icon: "📊", variant: "misc", actionType: "sendPrompt", prompt: "Tampilkan analisis margin semua produk, mana yang marginnya rendah?" },
			],
		},
		{
			keys: [
				{ word: "prediksi", weight: 4 }, { word: "forecast", weight: 4 },
				{ word: "perkiraan", weight: 3 }, { word: "tren penjualan", weight: 4 },
				{ word: "proyeksi", weight: 4 }, { word: "ramalan", weight: 3 },
				{ word: "trending", weight: 3 }, { word: "waktu sibuk", weight: 3 },
			],
			buttons: [
				{ label: "Lihat Forecast", icon: "📈", variant: "misc", actionType: "navigate", href: "/admin/forecasting" },
				{ label: "Prediksi Pendapatan", icon: "🔮", variant: "misc", actionType: "sendPrompt", prompt: "Prediksi pendapatan 7 hari ke depan berdasarkan data historis" },
			],
		},
		{
			keys: [
				{ word: "booking", weight: 4 }, { word: "reservasi", weight: 4 },
				{ word: "jadwal", weight: 2 }, { word: "meja", weight: 2 },
				{ word: "tempat duduk", weight: 3 }, { word: "kapasitas", weight: 2 },
				{ word: "tamuan", weight: 2 }, { word: "tamu", weight: 2 },
				{ word: "event", weight: 2 }, { word: "acara", weight: 2 },
			],
			buttons: [
				{ label: "Lihat Booking", icon: "📅", variant: "misc", actionType: "navigate", href: "/admin/booking" },
				{ label: "Buat Booking", icon: "📝", variant: "misc", actionType: "sendPrompt", prompt: "Bantu saya membuat reservasi baru" },
			],
		},
		{
			keys: [
				{ word: "pengaturan", weight: 3 }, { word: "setting", weight: 3 },
				{ word: "profil toko", weight: 4 }, { word: "nama toko", weight: 4 },
				{ word: "jam buka", weight: 4 }, { word: "alamat", weight: 2 },
				{ word: "konfigurasi", weight: 3 }, { word: "struk", weight: 3 },
				{ word: "receipt", weight: 3 }, { word: "qris", weight: 2 },
				{ word: "pajak", weight: 2 }, { word: "service charge", weight: 2 },
			],
			buttons: [
				{ label: "Pengaturan Toko", icon: "⚙️", variant: "misc", actionType: "navigate", href: "/admin/settings" },
			],
		},
		{
			keys: [
				{ word: "shift", weight: 4 }, { word: "jam kerja", weight: 3 },
				{ word: "modal awal", weight: 4 }, { word: "setoran", weight: 4 },
				{ word: "kasir masuk", weight: 3 }, { word: "buka shift", weight: 4 },
				{ word: "tutup shift", weight: 4 }, { word: "uang kas", weight: 3 },
			],
			buttons: [
				{ label: "Status Shift", icon: "🕐", variant: "finance", actionType: "sendPrompt", prompt: "Tampilkan status shift saat ini dan ringkasan pendapatan" },
				{ label: "Mulai Shift", icon: "▶️", variant: "finance", actionType: "sendPrompt", prompt: "Bantu saya memulai shift baru dengan modal awal kas" },
			],
		},
		{
			keys: [
				{ word: "dapur", weight: 3 }, { word: "kitchen", weight: 3 },
				{ word: "bar", weight: 2 }, { word: "pesanan aktif", weight: 3 },
				{ word: "antrian", weight: 3 }, { word: "menyiapkan", weight: 2 },
				{ word: "cooking", weight: 2 }, { word: "order queue", weight: 3 },
			],
			buttons: [
				{ label: "Kitchen Display", icon: "👨‍🍳", variant: "misc", actionType: "navigate", href: "/admin/kitchen" },
				{ label: "Bar Display", icon: "🍸", variant: "misc", actionType: "navigate", href: "/admin/bar" },
			],
		},
		{
			keys: [
				{ word: "dashboard", weight: 3 }, { word: "ringkasan", weight: 2 },
				{ word: "overview", weight: 3 }, { word: "hari ini", weight: 2 },
				{ word: "statistik", weight: 2 }, { word: "ringkas", weight: 2 },
				{ word: "rekap", weight: 2 }, { word: "performa", weight: 2 },
			],
			buttons: [
				{ label: "Dashboard", icon: "🏠", variant: "misc", actionType: "navigate", href: "/admin" },
				{ label: "Rekap Hari Ini", icon: "📊", variant: "misc", actionType: "sendPrompt", prompt: "Berikan rekap lengkap bisnis hari ini termasuk pendapatan, pesanan, dan stok" },
			],
		},
		{
			keys: [
				{ word: "user", weight: 2 }, { word: "pengguna", weight: 3 },
				{ word: "karyawan", weight: 3 }, { word: "staff", weight: 3 },
				{ word: "pegawai", weight: 3 }, { word: "role", weight: 2 },
				{ word: "hak akses", weight: 4 }, { word: "permission", weight: 3 },
				{ word: "admin", weight: 1 },
			],
			buttons: [
				{ label: "Lihat Karyawan", icon: "👥", variant: "misc", actionType: "sendPrompt", prompt: "Tampilkan daftar semua user/karyawan dan role mereka" },
				{ label: "Buat User", icon: "➕", variant: "misc", actionType: "sendPrompt", prompt: "Bantu saya membuat user/karyawan baru dengan role yang sesuai" },
			],
		},
		{
			keys: [
				{ word: "target", weight: 3 }, { word: "goal", weight: 3 },
				{ word: "bulan ini", weight: 2 }, { word: "progress", weight: 3 },
				{ word: "pencapaian", weight: 3 }, { word: "omzet target", weight: 4 },
			],
			buttons: [
				{ label: "Set Target", icon: "🎯", variant: "finance", actionType: "sendPrompt", prompt: "Bantu saya menetapkan target pendapatan bulan ini" },
				{ label: "Progress Target", icon: "📈", variant: "finance", actionType: "sendPrompt", prompt: "Tampilkan progress pencapaian target keuangan bulan ini" },
			],
		},
		{
			keys: [
				{ word: "struk", weight: 4 }, { word: "nota", weight: 3 },
				{ word: "receipt", weight: 4 }, { word: "invoice", weight: 3 },
				{ word: "faktur", weight: 3 }, { word: "scan", weight: 3 },
				{ word: "pindai", weight: 3 }, { word: "ocr", weight: 3 },
				{ word: "gambar", weight: 1 }, { word: "foto", weight: 1 },
				{ word: "transaksi", weight: 2 }, { word: "belanja", weight: 2 },
			],
			buttons: [
				{ label: "Scan Struk Lagi", icon: "📸", variant: "misc", actionType: "sendPrompt", prompt: "Saya ingin memindai struk/nota lain" },
				{ label: "Rekap Struk", icon: "📋", variant: "finance", actionType: "sendPrompt", prompt: "Berikan rekap semua struk yang sudah dipindai hari ini" },
				{ label: "Laporan Keuangan", icon: "📊", variant: "finance", actionType: "navigate", href: "/admin/finance/reports" },
			],
		},
		{
			keys: [
				{ word: "catat", weight: 3 }, { word: "input", weight: 2 },
				{ word: "pemasukan", weight: 3 }, { word: "pengeluaran", weight: 3 },
				{ word: "manual", weight: 2 }, { word: "form", weight: 2 },
				{ word: "isi data", weight: 3 },
			],
			buttons: [
				{ label: "Catat Pemasukan", icon: "💰", variant: "finance", actionType: "sendPrompt", prompt: "Bantu saya mencatat pemasukan baru dengan data terstruktur dalam format tabel" },
				{ label: "Catat Pengeluaran", icon: "💸", variant: "finance", actionType: "sendPrompt", prompt: "Bantu saya mencatat pengeluaran baru dengan data terstruktur dalam format tabel" },
				{ label: "Scan Struk", icon: "📸", variant: "misc", actionType: "sendPrompt", prompt: "Saya ingin memindai struk/nota untuk dicatat" },
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
	const seen = new Set<string>();
	const regex = /\[SUGGEST:\s*(.*?)\s*\|\s*(.*?)\s*\]/g;
	let match;
	while ((match = regex.exec(text)) !== null) {
		const label = match[1].trim();
		const prompt = match[2].trim();
		const key = `${label.toLowerCase()}|${prompt.toLowerCase()}`;
		if (seen.has(key)) continue;
		seen.add(key);
		suggestions.push({ label, prompt });
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
	{ label: "Buat Pesanan", message: "Bantu saya membuat pesanan baru untuk pelanggan", icon: "🛒", category: "order" },
	{ label: "Buat Diskon", message: "Bantu saya membuat diskon atau promo baru", icon: "🏷️", category: "discount" },
	{ label: "Cek Booking", message: "Tampilkan semua booking hari ini dan statusnya", icon: "📅", category: "booking" },
	{ label: "Status Shift", message: "Tampilkan status shift saat ini dan ringkasan pendapatan", icon: "🕐", category: "shift" },
];

export const sanitizeResponse = (text: string): string => {
	if (!text) return "";
	return text
		.replace(/🚀 TOMBOL AKSI:[\s\S]*/, "")
		.replace(/\[SUGGEST:\s*(.*?)\s*\|\s*(.*?)\s*\]/g, "")
		.replace(/\[QUICK:\s*(.*?)\s*\|\s*(.*?)\s*\]/g, "")
		.replace(/\[CHART:[\s\S]*?\]/g, "")
		.replace(/\[EXPORT:[\s\S]*?\]/g, "")
		.replace(/\[TABLE:[\s\S]*?\[\/TABLE\]\s*\n?/g, "")
		.trim();
};

export const extractResponseTables = (text: string): ResponseTableData[] => {
	const tables: ResponseTableData[] = [];
	const regex = /\[TABLE:\s*(\{[\s\S]*?\})\s*\][\s\S]*?\[\/TABLE\]/g;
	let match;
	while ((match = regex.exec(text)) !== null) {
		try {
			const meta = JSON.parse(match[1]);
			const body = match[0].replace(/\[TABLE:\s*\{[\s\S]*?\}\s*\]\n?/, "").replace(/\[\/TABLE\]\s*$/, "").trim();
			const lines = body.split("\n").map(l => l.trim()).filter(Boolean);
			if (lines.length < 2) continue;
			const headerLine = lines[0];
			const separatorIdx = lines.findIndex((l, i) => i > 0 && /^[\s|:-]+$/.test(l));
			const headers = headerLine.split("|").map(h => h.replace(/[*]/g, "").trim()).filter(Boolean);
			if (headers.length < 2) continue;
			const dataStart = separatorIdx > 0 ? separatorIdx + 1 : 1;
			const rows: string[][] = [];
			let footer: string[] | undefined;
			for (let i = dataStart; i < lines.length; i++) {
				const cells = lines[i].split("|").map(c => c.replace(/[*]/g, "").trim()).filter(Boolean);
				if (cells.length === headers.length) {
					if (i === lines.length - 1 && /^(total|jumlah|grand|keseluruhan|subtotal)/i.test(cells[0])) {
						footer = cells;
					} else {
						rows.push(cells);
					}
				}
			}
			tables.push({ title: meta.title, headers, rows, footer });
		} catch { /* skip invalid */ }
	}

	if (tables.length === 0) {
		const mdTableRegex = /(?:^|\n\n)((?:\|.+\|\n)+)/g;
		while ((match = mdTableRegex.exec(text)) !== null) {
			const block = match[1].trim();
			const lines = block.split("\n").map(l => l.trim()).filter(Boolean);
			if (lines.length < 3) continue;
			const headerLine = lines[0];
			const sepLine = lines[1];
			if (!/^[\s|:-]+$/.test(sepLine)) continue;
			const headers = headerLine.split("|").map(h => h.replace(/[*]/g, "").trim()).filter(Boolean);
			if (headers.length < 2) continue;
			const rows: string[][] = [];
			let footer: string[] | undefined;
			for (let i = 2; i < lines.length; i++) {
				const cells = lines[i].split("|").map(c => c.replace(/[*]/g, "").trim()).filter(Boolean);
				if (cells.length === headers.length) {
					if (i === lines.length - 1 && /^(total|jumlah|grand|keseluruhan|subtotal)/i.test(cells[0])) {
						footer = cells;
					} else {
						rows.push(cells);
					}
				}
			}
			if (rows.length > 0) {
				tables.push({ headers, rows, footer });
			}
		}
	}
	return tables;
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
		syncMode: "finance_only" as const,
	};
	const ts = Date.now();
	const isStockDocument =
		scanData.type === "product" ||
		["belanja_stok", "peralatan_kantor"].includes(scanData.category);

	const expenseCategory =
		isStockDocument || scanData.category === "belanja_stok"
			? "Pembelian Stok"
			: baseParams.category;
	const incomeCategory = "Penjualan";

	const buttons: ScanActionButton[] = [
		{
			id: `expense-${ts}`,
			label: "Catat sebagai Pengeluaran",
			icon: "OUT",
			variant: "expense",
			params: {
				type: "expense",
				...baseParams,
				category: expenseCategory,
				syncMode: "finance_only",
			},
		},
		{
			id: `income-${ts}`,
			label: "Catat sebagai Pemasukan",
			icon: "IN",
			variant: "income",
			params: {
				type: "income",
				...baseParams,
				category: incomeCategory,
				syncMode: "auto",
			},
		},
	];

	if (isStockDocument || (scanData.items?.length ?? 0) > 0) {
		buttons.unshift({
			id: `stock-${ts}`,
			label: "Catat Belanja Stok (+Inventaris)",
			icon: "STK",
			variant: "stock",
			params: {
				type: "expense",
				...baseParams,
				category: "Pembelian Stok",
				syncMode: "finance_plus_inventory",
			},
		});
	}

	if (scanData.transactionType === "income") {
		return buttons.sort((a) => (a.variant === "income" ? -1 : 1));
	}
	if (isStockDocument) {
		return buttons.sort((a) => (a.variant === "stock" ? -1 : 1));
	}
	return buttons;
};
