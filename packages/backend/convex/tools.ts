/**
 * Tool Definitions for AI Function Calling
 *
 * These tools define the operations Yumi AI can perform on the system.
 * Each tool maps to a Convex mutation with proper JSON schema validation.
 */

import { z } from "zod";

// Common parameter types
const _idSchema = z.string().min(1, "ID is required");

// ============================================
// PRODUCT TOOLS
// ============================================

export const tools = {
	// Add Product
	createProduct: {
		description:
			"Buat produk baru. Harap sediakan: nama produk, harga, kategori, dan opsional lain seperti deskripsi dan gambar.",
		parameters: z.object({
			name: z.string().min(1, "Nama produk wajib diisi"),
			description: z.string().optional().describe("Deskripsi produk"),
			price: z.number().positive("Harga harus lebih dari 0"),
			categoryId: z.string().min(1, "ID kategori wajib diisi"),
			promoPrice: z
				.number()
				.nonnegative("Harga promo tidak boleh negatif")
				.optional()
				.describe("Harga promo (jika ada)"),
			image: z.string().optional().describe("URL gambar produk"),
			isAvailable: z.boolean().describe("Apakah produk tersedia untuk dijual"),
		}),
	},

	// Update Product
	updateProduct: {
		description:
			"Update produk yang sudah ada. Berikan ID produk dan field yang ingin diubah.",
		parameters: z.object({
			id: z.string().min(1, "ID produk wajib diisi"),
			name: z.string().optional().describe("Nama produk baru"),
			description: z.string().optional().describe("Deskripsi produk"),
			price: z.number().positive().optional().describe("Harga baru"),
			promoPrice: z.number().nonnegative().optional().describe("Harga promo"),
			categoryId: z.string().optional().describe("ID kategori baru"),
			image: z.string().optional().describe("URL gambar baru"),
			isAvailable: z.boolean().optional().describe("Status ketersediaan"),
		}),
	},

	// Delete Product
	deleteProduct: {
		description: "Hapus produk. Berikan ID produk yang ingin dihapus.",
		parameters: z.object({
			id: z.string().min(1, "ID produk wajib diisi"),
		}),
	},

	// Create Category
	createCategory: {
		description: "Buat kategori produk baru. Harap sediakan nama kategori.",
		parameters: z.object({
			name: z.string().min(1, "Nama kategori wajib diisi"),
			order: z
				.number()
				.int()
				.nonnegative()
				.optional()
				.describe("Urutan tampil (opsional)"),
		}),
	},

	// Delete Category
	deleteCategory: {
		description: "Hapus kategori. Berikan ID kategori.",
		parameters: z.object({
			id: z.string().min(1, "ID kategori wajib diisi"),
		}),
	},

	// ============================================
	// INVENTORY TOOLS
	// ============================================

	// Add Stock
	addStock: {
		description:
			"Tambah stok barang. Berikan ID inventory, jumlah yang ditambah, dan catatan opsional.",
		parameters: z.object({
			inventoryId: z.string().min(1, "ID inventory wajib diisi"),
			quantity: z.number().positive("Jumlah harus lebih dari 0"),
			costPerUnit: z
				.number()
				.nonnegative()
				.optional()
				.describe("Harga per unit (opsional, untuk FIFO)"),
			notes: z.string().optional().describe("Catatan tambahan"),
		}),
	},

	// Use/Deduct Stock
	usageStock: {
		description:
			"Kurangi stok (pemakaian). Berikan ID inventory dan jumlah yang dipakai.",
		parameters: z.object({
			inventoryId: z.string().min(1, "ID inventory wajib diisi"),
			quantity: z.number().positive("Jumlah harus lebih dari 0"),
			notes: z.string().optional().describe("Catatan penggunaan"),
		}),
	},

	// Adjust Stock
	adjustStock: {
		description:
			"Atur jumlah stok ke nilai tertentu (penyesuaian). Berikan ID inventory dan jumlah baru.",
		parameters: z.object({
			inventoryId: z.string().min(1, "ID inventory wajib diisi"),
			quantity: z
				.number()
				.describe("Jumlah stok baru (bisa positif atau negatif)"),
			notes: z.string().optional().describe("Catatan penyesuaian"),
		}),
	},

	// Create Inventory Item
	createInventoryItem: {
		description:
			"Buat item inventory baru. Harap sediakan: nama bahan, satuan, jumlah awal, dan threshold stok rendah.",
		parameters: z.object({
			ingredientName: z.string().min(1, "Nama bahan wajib diisi"),
			unit: z.string().min(1, "Satuan wajib diisi (contoh: ml, gram, pcs)"),
			quantity: z.number().describe("Jumlah awal stok"),
			lowStockThreshold: z
				.number()
				.nonnegative()
				.describe("Threshold stok rendah"),
			displayUnit: z
				.string()
				.optional()
				.describe("Satuan tampilan (contoh: Liter)"),
			conversionFactor: z
				.number()
				.positive()
				.optional()
				.describe("Faktor konversi (1 displayUnit = ? baseUnit)"),
		}),
	},

	// Delete Inventory Item
	deleteInventoryItem: {
		description: "Hapus item inventory. Berikan ID inventory.",
		parameters: z.object({
			id: z.string().min(1, "ID inventory wajib diisi"),
		}),
	},

	// ============================================
	// ORDER TOOLS
	// ============================================

	// Create Order
	createOrder: {
		description:
			"Buat pesanan baru. Berikan daftar item yang dipesan, total harga, metode pembayaran, dan nama pelanggan (opsional).",
		parameters: z.object({
			items: z
				.array(
					z.object({
						productId: z.string().min(1, "ID produk wajib"),
						productName: z.string().min(1, "Nama produk wajib"),
						variant: z.string().optional().describe("Varian produk (jika ada)"),
						quantity: z.number().positive("Jumlah wajib diisi"),
						price: z.number().positive("Harga per item wajib"),
					})
				)
				.min(1, "Minimal 1 item"),
			totalAmount: z.number().positive("Total harga wajib diisi"),
			paymentMethod: z.string().describe("Metode pembayaran (cash, qris, dll)"),
			customerName: z.string().optional().describe("Nama pelanggan"),
		}),
	},

	// Update Order Status
	updateOrderStatus: {
		description:
			"Update status pesanan. Berikan ID pesanan dan status baru (pending, paid, completed, cancelled).",
		parameters: z.object({
			id: z.string().min(1, "ID pesanan wajib diisi"),
			status: z
				.enum(["pending", "paid", "completed", "cancelled"])
				.describe("Status pesanan baru"),
		}),
	},

	// ============================================
	// FINANCE TOOLS
	// ============================================

	// Create Transaction
	createTransaction: {
		description:
			"Catat transaksi keuangan (income/expense). Harap sediakan: tipe, jumlah, kategori, merchant/toko (opsional), dan deskripsi.",
		parameters: z.object({
			type: z.enum(["income", "expense"]).describe("Tipe transaksi"),
			amount: z.number().describe("Jumlah uang"),
			category: z.string().min(1, "Kategori transaksi wajib diisi").describe("Kategori transaksi. Gunakan salah satu: makanan_minuman, belanja_stok, peralatan_kantor, transportasi, utilitas_listrik_air, gaji_karyawan, sewa_tempat, pemasaran, pajak, hiburan, kesehatan, pembangunan_renovasi, lainnya"),
			merchant: z.string().optional().describe("Nama merchant/toko (opsional, contoh: Indomaret, Starbucks, PLN)"),
			description: z.string().optional().describe("Deskripsi transaksi"),
			paymentMethod: z.string().optional().describe("Metode pembayaran"),
		}),
	},

	// Delete Transaction
	deleteTransaction: {
		description: "Hapus transaksi keuangan. Berikan ID transaksi.",
		parameters: z.object({
			id: z.string().min(1, "ID transaksi wajib diisi"),
		}),
	},

	// ============================================
	// DISCOUNT TOOLS
	// ============================================

	// Create Discount
	createDiscount: {
		description:
			"Buat diskon/voucher baru. Harap sediakan: nama diskon, tipe (FIXED/PERCENTAGE/FLAT_PRICE), nilai, dan target.",
		parameters: z.object({
			name: z.string().min(1, "Nama diskon wajib diisi"),
			type: z
				.enum(["FIXED", "PERCENTAGE", "FLAT_PRICE"])
				.describe("Tipe diskon"),
			value: z.number().describe("Nilai diskon"),
			targetType: z
				.enum(["ALL", "CATEGORY", "PRODUCT"])
				.describe(
					"Target diskon: semua, kategori tertentu, atau produk tertentu"
				),
			targetIds: z
				.array(z.string())
				.optional()
				.describe("ID target (kategori/produk) jika targetType bukan ALL"),
			isActive: z.boolean().describe("Apakah diskon aktif"),
			minOrderValue: z
				.number()
				.nonnegative()
				.optional()
				.describe("Minimum order value"),
		}),
	},

	// Update Discount
	updateDiscount: {
		description:
			"Update diskon yang ada. Berikan ID diskon dan field yang ingin diubah.",
		parameters: z.object({
			id: z.string().min(1, "ID diskon wajib diisi"),
			name: z.string().optional().describe("Nama diskon baru"),
			type: z
				.enum(["FIXED", "PERCENTAGE", "FLAT_PRICE"])
				.optional()
				.describe("Tipe diskon baru"),
			value: z.number().optional().describe("Nilai diskon baru"),
			targetType: z
				.enum(["ALL", "CATEGORY", "PRODUCT"])
				.optional()
				.describe("Target diskon baru"),
			targetIds: z.array(z.string()).optional().describe("ID target baru"),
			isActive: z.boolean().optional().describe("Status aktif baru"),
			minOrderValue: z
				.number()
				.nonnegative()
				.optional()
				.describe("Minimum order value baru"),
		}),
	},

	// Toggle Discount Active
	toggleDiscount: {
		description: "Aktifkan/nonaktifkan diskon. Berikan ID diskon.",
		parameters: z.object({
			id: z.string().min(1, "ID diskon wajib diisi"),
		}),
	},

	// Delete Discount
	deleteDiscount: {
		description: "Hapus diskon. Berikan ID diskon.",
		parameters: z.object({
			id: z.string().min(1, "ID diskon wajib diisi"),
		}),
	},

	// ============================================
	// USER & ROLE TOOLS
	// ============================================

	// Create User
	createUser: {
		description:
			"Buat user baru. Harap sediakan: username, password, nama lengkap, dan ID role.",
		parameters: z.object({
			username: z.string().min(1, "Username wajib diisi"),
			password: z.string().min(6, "Password minimal 6 karakter"),
			name: z.string().min(1, "Nama lengkap wajib diisi"),
			roleId: z.string().min(1, "ID role wajib diisi"),
		}),
	},

	// Update User
	updateUser: {
		description:
			"Update user yang ada. Berikan ID user dan field yang ingin diubah.",
		parameters: z.object({
			id: z.string().min(1, "ID user wajib diisi"),
			name: z.string().optional().describe("Nama lengkap baru"),
			roleId: z.string().optional().describe("ID role baru"),
			isActive: z.boolean().optional().describe("Status aktif user"),
		}),
	},

	// Delete User
	deleteUser: {
		description: "Hapus user. Berikan ID user.",
		parameters: z.object({
			id: z.string().min(1, "ID user wajib diisi"),
		}),
	},

	// Create Role
	createRole: {
		description:
			"Buat role baru dengan permissions. Harap sediakan nama role dan daftar permissions.",
		parameters: z.object({
			name: z.string().min(1, "Nama role wajib diisi"),
			permissions: z
				.array(z.string())
				.min(1, "Minimal 1 permission")
				.describe(
					"Daftar permissions (contoh: ['products:manage', 'orders:view'])"
				),
		}),
	},

	// Delete Role
	deleteRole: {
		description: "Hapus role. Berikan ID role.",
		parameters: z.object({
			id: z.string().min(1, "ID role wajib diisi"),
		}),
	},

	// ============================================
	// HPP TOOLS
	// ============================================

	// Create HPP Calculation
	createHppCalculation: {
		description:
			"Buat kalkulasi HPP (Harga Pokok Produksi) baru. Harap sediakan: nama, bahan baku, biaya overhead, harga jual, dan opsional link ke produk.",
		parameters: z.object({
			name: z.string().min(1, "Nama kalkulasi wajib diisi"),
			description: z.string().optional().describe("Deskripsi kalkulasi"),
			ingredients: z
				.array(
					z.object({
						inventoryId: z
							.string()
							.optional()
							.describe("ID inventory (opsional)"),
						ingredientName: z.string().min(1, "Nama bahan"),
						purchasePrice: z.number().positive("Harga beli"),
						purchaseQuantity: z.number().positive("Jumlah beli"),
						purchaseUnit: z.string().min(1, "Satuan beli"),
						usagePerServing: z.number().positive("Jumlah per porsi"),
						usageUnit: z.string().min(1, "Satuan pakai"),
						conversionFactor: z.number().positive("Faktor konversi"),
					})
				)
				.min(1, "Minimal 1 bahan baku"),
			overheadCosts: z
				.array(
					z.object({
						name: z.string().min(1, "Nama overhead"),
						costPerServing: z.number().nonnegative("Biaya overhead per porsi"),
					})
				)
				.optional()
				.describe("Biaya tambahan (packaging, gas, dll)"),
			servingsPerBatch: z
				.number()
				.positive()
				.describe("Jumlah porsi per batch"),
			sellingPrice: z.number().positive("Harga jual per porsi"),
			productId: z
				.string()
				.optional()
				.describe("ID produk (opsional, untuk link)"),
		}),
	},

	// Update HPP Calculation
	updateHppCalculation: {
		description: "Update kalkulasi HPP yang ada.",
		parameters: z.object({
			id: z.string().min(1, "ID kalkulasi HPP wajib diisi"),
			name: z.string().optional().describe("Nama baru kalkulasi"),
			description: z.string().optional().describe("Deskripsi baru"),
			ingredients: z
				.array(
					z.object({
						inventoryId: z.string().optional(),
						ingredientName: z.string(),
						purchasePrice: z.number(),
						purchaseQuantity: z.number(),
						purchaseUnit: z.string(),
						usagePerServing: z.number(),
						usageUnit: z.string(),
						conversionFactor: z.number(),
					})
				)
				.optional(),
			overheadCosts: z
				.array(
					z.object({
						name: z.string(),
						costPerServing: z.number(),
					})
				)
				.optional(),
			servingsPerBatch: z.number().positive(),
			sellingPrice: z.number().positive(),
			productId: z.string().optional(),
		}),
	},

	// Delete HPP Calculation
	deleteHppCalculation: {
		description: "Hapus kalkulasi HPP. Berikan ID kalkulasi.",
		parameters: z.object({
			id: z.string().min(1, "ID kalkulasi HPP wajib diisi"),
		}),
	},

	// Sync HPP with Inventory Prices
	syncHppWithInventoryPrices: {
		description:
			"Sinkronkan harga bahan baku di kalkulasi HPP dengan harga beli terbaru dari inventory.",
		parameters: z.object({
			id: z.string().min(1, "ID kalkulasi HPP wajib diisi"),
		}),
	},

	// ============================================
	// SITE SETTINGS TOOLS
	// ============================================

	// Update Store Settings
	updateStoreSettings: {
		description:
			"Update pengaturan toko. Harap sediakan: nama toko, alamat, telepon, dan footer struk.",
		parameters: z.object({
			storeName: z.string().optional().describe("Nama toko"),
			storeAddress: z.string().optional().describe("Alamat toko"),
			storePhone: z.string().optional().describe("No telepon toko"),
			receiptFooter: z.string().optional().describe("Footer struk"),
			autoPrint: z.boolean().optional().describe("Otomatis cetak struk"),
		}),
	},

	// ============================================
	// FORECASTING & ANALYTICS TOOLS
	// ============================================

	// Analyze Discount Effectiveness
	analyzeDiscountEffectiveness: {
		description:
			"Analisis efektivitas semua diskon yang ada. Menampilkan diskon aktif, nonaktif, dan rekomendasikan optimasi strategi promo berdasarkan data penjualan 30 hari terakhir.",
		parameters: z.object({}),
	},

	// ============================================
	// FINANCIAL RECONCILIATION TOOLS
	// ============================================

	// Create Reconciliation Transaction
	createReconciliationTransaction: {
		description:
			"Buat transaksi keuangan untuk merekonsiliasi selisih antara total pesanan selesai dengan pencatatan pemasukan. Gunakan setelah melakukan analisis rekonsiliasi dan ada selisih yang perlu dicatat.",
		parameters: z.object({
			amount: z
				.number()
				.positive()
				.describe("Jumlah selisih yang perlu direkonsiliasi (harus positif)"),
			description: z
				.string()
				.min(1)
				.describe(
					"Deskripsi rekonsiliasi, contoh: 'Rekonsiliasi pesanan vs keuangan bulan ini'"
				),
			category: z
				.string()
				.optional()
				.describe("Kategori transaksi (default: Rekonsiliasi)"),
		}),
	},
} as const;

// Type for tool calls
export interface ToolCall {
	toolName: keyof typeof tools;
	args: Record<string, unknown>;
}

// Helper to format tool response for AI
export function formatToolResult(
	toolName: string,
	result: unknown,
	error?: string
): string {
	if (error) {
		return `❌ Gagal menjalankan ${toolName}: ${error}`;
	}
	if (result === undefined) {
		return `✅ Berhasil menjalankan ${toolName}`;
	}
	return `✅ Berhasil menjalankan ${toolName}: ${JSON.stringify(result, null, 2)}`;
}
