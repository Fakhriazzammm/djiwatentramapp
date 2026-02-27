/**
 * AI Knowledge Base - Dynamic and self-expanding knowledge for Yumi AI
 *
 * This module allows Yumi to learn about new features automatically.
 * When a new feature is deployed, it can be registered here so Yumi
 * immediately knows about it without code changes to the AI system prompt.
 *
 * Workflow:
 *   1. Developer deploys new feature
 *   2. Tell Yumi: "Ada fitur baru X yang bisa melakukan Y"
 *   3. Yumi calls addFeatureKnowledge tool → stored in DB
 *   4. Next conversation, Yumi knows about the new feature
 *
 *   OR: Call seedDefaultKnowledge mutation to initialize/refresh built-in knowledge.
 */

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ============================================
// DEFAULT KNOWLEDGE (built-in features)
// ============================================

const DEFAULT_FEATURES = [
	{
		key: "products",
		title: "Manajemen Produk & Kategori",
		content:
			"CRUD produk (tambah/edit/hapus), kelola kategori menu, atur variasi produk (ukuran, level, topping), upload gambar produk, atur harga promo, aktif/nonaktifkan produk",
	},
	{
		key: "inventory",
		title: "Manajemen Inventaris & Stok",
		content:
			"Kelola stok bahan baku, sistem FIFO untuk pengelolaan batch, alert stok rendah otomatis, buat resep produk (recipe linking), base recipe/pre-mix untuk bahan campuran, tracking penggunaan stok per produk",
	},
	{
		key: "pos_orders",
		title: "Pemesanan & POS (Point of Sale)",
		content:
			"Buat pesanan baru, update status pesanan (pending/paid/completed/cancelled), POS kasir untuk transaksi langsung, cetak struk via Bluetooth printer, kelola item pesanan dengan variasi",
	},
	{
		key: "finance",
		title: "Manajemen Keuangan",
		content:
			"Catat transaksi income/expense, kategorisasi keuangan (Penjualan, Sewa, Gaji, dll), laporan keuangan per periode (harian/mingguan/bulanan), tracking metode pembayaran (cash/QRIS/transfer), saldo real-time",
	},
	{
		key: "discounts",
		title: "Promosi & Diskon",
		content:
			"Buat diskon tipe FIXED (nominal), PERCENTAGE (persen), FLAT_PRICE (harga tetap), target diskon per produk/kategori/semua, jadwal diskon (tanggal, hari, jam), voucher dengan kode unik, minimal order value",
	},
	{
		key: "hpp",
		title: "HPP Kalkulator (Harga Pokok Produksi)",
		content:
			"Hitung harga pokok produksi per menu, input bahan baku dengan konversi satuan, hitung biaya overhead (kemasan, gas, listrik), kalkulasi margin profit dan laba per porsi, COGS analysis dari pesanan aktual, identifikasi produk margin rendah",
	},
	{
		key: "users_roles",
		title: "Manajemen User & Role (RBAC)",
		content:
			"Kelola akun pengguna (kasir, admin, dll), buat dan assign role dengan permission spesifik, active/nonactive user, integrasi Better Auth untuk autentikasi aman",
	},
	{
		key: "settings",
		title: "Pengaturan Toko",
		content:
			"Konfigurasi nama toko, alamat, nomor telepon, upload logo, atur footer struk/receipt, konfigurasi auto-print, branding aplikasi (nama app, versi, developer)",
	},
	{
		key: "ai_analytics",
		title: "AI Analytics & Insights",
		content:
			"Prediksi kehabisan stok berbasis tren penjualan, analisis bisnis real-time (produk terlaris, jam ramai, rata-rata order), rekomendasi produk cross-sell, analisis HPP dan margin, generate company overview, saran strategi diskon berbasis data",
	},
] as const;

const DEFAULT_CAPABILITIES = [
	{
		key: "realtime_data",
		title: "Data Real-Time",
		content:
			"Mengetahui dan dapat mengakses SELURUH data database secara real-time: produk, stok, pesanan, keuangan, promosi, HPP, user",
	},
	{
		key: "self_learning",
		title: "Self-Learning",
		content:
			"DAPAT MEMPELAJARI DAN MENYIMPAN pengetahuan baru tentang fitur yang ditambahkan ke aplikasi. Ketika ada fitur baru, gunakan tool addFeatureKnowledge untuk menyimpannya agar Yumi selalu up-to-date",
	},
	{
		key: "multi_step_actions",
		title: "Multi-Step Actions",
		content:
			"DAPAT MELAKUKAN AKSI BERANTAI: create/update/delete produk, tambah/kurang stok, buat pesanan, catat transaksi keuangan, kelola diskon, kalkulasi HPP - semua dalam satu permintaan",
	},
] as const;

// ============================================
// QUERIES
// ============================================

/** Get all active knowledge entries */
export const getAllActiveKnowledge = query({
	args: {},
	handler: async (ctx) => {
		return await ctx.db
			.query("aiKnowledgeBase")
			.filter((q) => q.eq(q.field("isActive"), true))
			.collect();
	},
});

/** Get active knowledge entries by type */
export const getKnowledgeByType = query({
	args: {
		type: v.union(
			v.literal("feature"),
			v.literal("capability"),
			v.literal("instruction")
		),
	},
	handler: async (ctx, args) => {
		return await ctx.db
			.query("aiKnowledgeBase")
			.withIndex("by_type", (q) => q.eq("type", args.type))
			.filter((q) => q.eq(q.field("isActive"), true))
			.collect();
	},
});

/** Get all knowledge (including inactive) for admin management */
export const getAllKnowledge = query({
	args: {},
	handler: async (ctx) => {
		return await ctx.db.query("aiKnowledgeBase").collect();
	},
});

// ============================================
// MUTATIONS
// ============================================

/** Add a new knowledge entry */
export const addKnowledge = mutation({
	args: {
		type: v.union(
			v.literal("feature"),
			v.literal("capability"),
			v.literal("instruction")
		),
		key: v.string(),
		title: v.string(),
		content: v.string(),
	},
	handler: async (ctx, args) => {
		// Check if key already exists
		const existing = await ctx.db
			.query("aiKnowledgeBase")
			.withIndex("by_key", (q) => q.eq("key", args.key))
			.first();

		if (existing) {
			// Update existing instead of duplicate
			await ctx.db.patch(existing._id, {
				title: args.title,
				content: args.content,
				type: args.type,
				isActive: true,
				updatedAt: Date.now(),
			});
			return { action: "updated", id: existing._id };
		}

		const id = await ctx.db.insert("aiKnowledgeBase", {
			type: args.type,
			key: args.key,
			title: args.title,
			content: args.content,
			isActive: true,
			createdAt: Date.now(),
			updatedAt: Date.now(),
		});
		return { action: "created", id };
	},
});

/** Update an existing knowledge entry by key */
export const updateKnowledge = mutation({
	args: {
		key: v.string(),
		title: v.optional(v.string()),
		content: v.optional(v.string()),
		isActive: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query("aiKnowledgeBase")
			.withIndex("by_key", (q) => q.eq("key", args.key))
			.first();

		if (!existing) {
			throw new Error(`Knowledge entry dengan key "${args.key}" tidak ditemukan`);
		}

		const patch: Record<string, unknown> = { updatedAt: Date.now() };
		if (args.title !== undefined) patch.title = args.title;
		if (args.content !== undefined) patch.content = args.content;
		if (args.isActive !== undefined) patch.isActive = args.isActive;

		await ctx.db.patch(existing._id, patch);
		return { success: true, key: args.key };
	},
});

/** Delete a knowledge entry by key */
export const deleteKnowledge = mutation({
	args: { key: v.string() },
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query("aiKnowledgeBase")
			.withIndex("by_key", (q) => q.eq("key", args.key))
			.first();

		if (!existing) {
			throw new Error(`Knowledge entry dengan key "${args.key}" tidak ditemukan`);
		}
		await ctx.db.delete(existing._id);
		return { success: true };
	},
});

/**
 * Seed default knowledge - idempotent (skips entries that already exist).
 * Run this once after deploy, or whenever you want to ensure defaults are present.
 * Existing custom entries are NOT overwritten.
 */
export const seedDefaultKnowledge = mutation({
	args: {},
	handler: async (ctx) => {
		const now = Date.now();
		let created = 0;
		let skipped = 0;

		const upsert = async (
			type: "feature" | "capability" | "instruction",
			key: string,
			title: string,
			content: string
		) => {
			const existing = await ctx.db
				.query("aiKnowledgeBase")
				.withIndex("by_key", (q) => q.eq("key", key))
				.first();
			if (existing) {
				skipped++;
				return;
			}
			await ctx.db.insert("aiKnowledgeBase", {
				type,
				key,
				title,
				content,
				isActive: true,
				createdAt: now,
				updatedAt: now,
			});
			created++;
		};

		for (const f of DEFAULT_FEATURES) {
			await upsert("feature", f.key, f.title, f.content);
		}
		for (const c of DEFAULT_CAPABILITIES) {
			await upsert("capability", c.key, c.title, c.content);
		}

		return { created, skipped };
	},
});
