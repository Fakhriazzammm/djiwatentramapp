import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

type AiAction = "yumiChat" | "bulkScanImageData" | "generateBusinessBriefing" | "sendTelegram" | "recordTransaction" | "executeSql" | "insertInventory" | "classifyTransactionItems" | "submitEmployeeApplication" | "parseAttendanceSchedule" | "importAttendanceSchedule";
type JsonRecord = Record<string, unknown>;

const corsHeaders = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Headers":
		"authorization, x-client-info, apikey, content-type",
};

const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
const openaiBaseUrl = (Deno.env.get("OPENAI_BASE_URL") || "https://api.openai.com/v1").replace(/\/$/, "");
const openaiModelChat = Deno.env.get("OPENAI_MODEL_CHAT") || "gpt-4o-mini";
const openaiModelVision = Deno.env.get("OPENAI_MODEL_VISION") || "gpt-4o";

// Read bot token — try the correct key first, then the typo variant as fallback
const telegramBotToken =
	Deno.env.get("TELEGRAM_BOT_TOKEN") ??
	Deno.env.get("TELELEGRAM_BOT_TOKEN");

// Read default chat ID — the secret is named TELEGRAM_REPORT_CHAT_ID in this project
const telegramDefaultChatId =
	Deno.env.get("TELEGRAM_REPORT_CHAT_ID") ??
	Deno.env.get("TELEGRAM_CHAT_ID") ??
	Deno.env.get("TELELEGRAM_CHAT_ID");

function jsonOk(data: Record<string, unknown>, status = 200) {
	const { ok, error: _, ...rest } = data;
	return new Response(JSON.stringify({ success: true, ...rest }), {
		status,
		headers: { ...corsHeaders, "Content-Type": "application/json" },
	});
}

function jsonResponse(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { ...corsHeaders, "Content-Type": "application/json" },
	});
}

function fail(code: string, message: string, status = 400) {
	return jsonResponse({ success: false, error: { code, message } }, status);
}

async function callOpenAI(messages: unknown[], model = openaiModelChat) {
	if (!openaiApiKey) throw new Error("OPENAI_API_KEY tidak dikonfigurasi");

	const res = await fetch(`${openaiBaseUrl}/chat/completions`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${openaiApiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ model, messages, max_tokens: 2000 }),
	});

	if (!res.ok) {
		const text = await res.text();
		throw new Error(`OpenAI error: ${res.status} ${text}`);
	}

	const data = (await res.json()) as any;
	return (data.choices?.[0]?.message?.content ?? "") as string;
}

function toImageUrl(img: string) {
	return img.startsWith("data:") ? img : `data:image/jpeg;base64,${img}`;
}

async function yumiChat(payload: JsonRecord) {
	const message = String(payload.message ?? "").trim();
	const history = Array.isArray(payload.history) ? payload.history : [];
	const contextHint =
		typeof payload.contextHint === "string" ? payload.contextHint : "";
	const images = Array.isArray(payload.images) ? payload.images : [];

	const systemPrompt = `Kamu adalah Yumi General Manager Agents 🤖⭐ — General Manager AI untuk seluruh ekosistem Djiwa Tentram.

VISI & PERAN:
Kamu adalah level tertinggi dari seluruh Yumi Agents. Kamu bukan sekadar asisten POS — kamu adalah MANAJER yang mengerti seluruh operasional bisnis dan mengoordinasikan semua bot.

APLIKASI YANG KAMU KELOLA:
1. **POS (pos.yumme.id)** — Web app utama untuk kasir, manajemen pesanan, inventori, booking
2. **Djiwa Tentram Customer (djiwatentram.yumme.id)** — Portal pelanggan: menu digital, booking, order online
3. **Karyawan Portal (karyawan.yumme.id)** — Portal staff: absensi, slip gaji, shift, pengajuan

SEMUA BOT YANG KAMU KOORDINASIKAN:
1. **@YummeFinanceAIbot** — Yumi Finance Agent: urusan keuangan, pemasukan/pengeluaran, OCR struk, akuntansi
2. **@YumiPurchasingBot** — Yumi Purchasing Agent: urusan inventori, marketlist, restok, supplier
3. **@YummeSupervisorAIbot** — Yumi Supervisor Agent: notifikasi order realtime ke Barista & Kitchen

KEMAMPUAN LANGSUNG:
- Query SEMUA data: penjualan, inventori, keuangan, absensi, booking, HPP, shift
- Analisis bisnis & rekomendasi
- Briefing harian
- OCR struk/nota
- **Pengumuman** ke channel & grup via /sebarkan

STRATEGI ORCHESTRATOR:
- Jika user butuh detail keuangan (OCR struk, laporan expense/income) → arahkan ke @YummeFinanceAIbot
- Jika user butuh restok/marketlist/supplier → arahkan ke @YumiPurchasingBot
- Jika user tanya tentang order realtime → arahkan ke @YummeSupervisorAIbot
- Jika pertanyaan general/operasional/cross-bot → handle sendiri
- Selalu beri konteks: jelaskan KENAPA user perlu ke bot itu, jangan cuma lempar

⚠️ PENTING — Format HTML untuk Telegram:
Gunakan HTML formatting untuk SEMUA respons. Format yang didukung Telegram:
- <b>tebal</b> untuk judul/heading
- <i>miring</i> untuk penekanan
- <u>garis bawah</u> untuk highlight
- <code>inline code</code> untuk data/angka
- <pre>blok teks</pre> untuk tabel/data terstruktur
- Emoji diperbolehkan (✅ ❌ 📊 💰 ⚠️ 🔥 📦 🤖 ⭐ dll)

Untuk STRUK/BON — format ringkasan:
<b>🧾 RINGKASAN STRUK</b>
<b>📅 Tanggal:</b> DD-MM-YY  <b>⏰ Waktu:</b> HH:MM
<b>🔢 No. Transaksi:</b> XXXXXX
<b>🏪 Merchant:</b> Nama Toko (jika terbaca)

<b>🛒 RINCIAN BELANJA:</b>
1. <b>Nama Item</b> — Qty: X • Rp X.XXX
2. ...

<b>💰 TOTAL: Rp XX.XXX</b>
<b>💳 Pembayaran:</b> Cash/Debit/QRIS

<b>📊 ANALISIS CEPAT:</b>
• Total item: X produk
• Item termahal: Nama (Rp X.XXX)
• Item termurah: Nama (Rp X.XXX)
• Rata-rata harga/item: Rp X.XXX

Jika ada hal menarik (diskon, pajak, item dalam jumlah banyak), sebutkan di bagian <b>💡 CATATAN</b>.

Untuk PERTANYAAN BISNIS — gunakan format:
<b>[Judul Section]</b>
• Poin dengan <b>highlight</b> untuk data penting
• Gunakan emoji sebagai bullet
• Data numerik pakai <code>Rp 50.000</code>
• Akhiri dengan rekomendasi actionable

Gunakan bahasa Indonesia yang ramah, profesional, dan to-the-point, dengan tone seorang General Manager yang berwibawa tapi tetap membantu.${contextHint ? `\nKonteks tambahan: ${contextHint}` : ""}`;

	const openAiMessages: unknown[] = [
		{ role: "system", content: systemPrompt },
		...history.slice(-10).map((m: any) => ({
			role: m.role === "user" ? "user" : "assistant",
			content: String(m.content ?? ""),
		})),
	];

	if (images.length > 0) {
		const content: unknown[] = [
			{ type: "text", text: message || "Tolong analisis gambar ini." },
		];
		for (const img of images.slice(0, 4)) {
			if (typeof img === "string") {
				content.push({
					type: "image_url",
					image_url: { url: toImageUrl(img) },
				});
			}
		}
		openAiMessages.push({ role: "user", content });
	} else {
		openAiMessages.push({ role: "user", content: message });
	}

	const model = images.length > 0 ? openaiModelVision : openaiModelChat;
	const content = await callOpenAI(openAiMessages, model);
	return { content, toolCalls: [] };
}

async function bulkScanImageData(payload: JsonRecord) {
	const images = Array.isArray(payload.images) ? payload.images : [];
	if (!images.length) return [];

	const results: unknown[] = [];
	for (let i = 0; i < images.length; i++) {
		const img = images[i];
		try {
			const prompt = `Analisis gambar struk/nota belanja ini dan ekstrak data dalam format JSON berikut (tanpa markdown, hanya JSON murni):
{
  "type": "expense",
  "name": "Nama Merchant/Toko",
  "category": "Kategori pengeluaran (misal: Makanan, Belanja, dll)",
  "transactionType": "expense",
  "total": 0,
  "subtotal": 0,
  "tax": 0,
  "serviceCharge": 0,
  "discount": 0,
  "items": [{"name": "Nama item", "qty": 1, "price": 0, "subtotal": 0, "unit": "pcs"}],
  "date": "YYYY-MM-DD",
  "time": "HH:MM",
  "receiptNumber": "Nomor struk",
  "paymentMethod": "Cash/Debit/Credit/QRIS",
  "notes": "",
  "confidence": 0.9,
  "rawText": "Teks dari struk"
}
Jika ada informasi yang tidak bisa dibaca, gunakan null atau 0. confidence antara 0-1.`;

			const content = await callOpenAI(
				[
					{
						role: "user",
						content: [
							{ type: "text", text: prompt },
							{
								type: "image_url",
								image_url: {
									url: typeof img === "string"
										? toImageUrl(img)
										: "",
								},
							},
						],
					},
				],
				openaiModelVision
			);

			const jsonMatch = content.match(/\{[\s\S]*\}/);
			if (!jsonMatch) throw new Error("Tidak ada data JSON dalam respons");
			const data = JSON.parse(jsonMatch[0]);
			results.push({ success: true, data, index: i });
		} catch (err: any) {
			results.push({
				success: false,
				error: err?.message ?? "Gagal menganalisis gambar",
				index: i,
			});
		}
	}

	return results;
}

async function generateBusinessBriefing(payload: JsonRecord) {
	const localHour =
		typeof payload.localHour === "number"
			? payload.localHour
			: new Date(Date.now() + 7 * 60 * 60 * 1000).getUTCHours();
	const context =
		typeof payload.context === "string" ? payload.context : "";

	let greeting = "Selamat pagi";
	if (localHour >= 12 && localHour < 15) greeting = "Selamat siang";
	else if (localHour >= 15 && localHour < 18) greeting = "Selamat sore";
	else if (localHour >= 18) greeting = "Selamat malam";

	const prompt = `${greeting}! Buat briefing bisnis harian yang singkat dan informatif dalam bahasa Indonesia.
${context ? `\nData bisnis saat ini:\n${context}` : ""}

⚠️ Format pakai HTML untuk Telegram:
- <b>bold</b> untuk judul/heading
- <i>italic</i> untuk penekanan
- Emoji diperbolehkan

Sertakan:
1. <b>Salam pembuka</b> sesuai waktu dengan emoji (🌅 pagi, ☀️ siang, 🌤️ sore, 🌙 malam)
2. <b>Ringkasan kondisi bisnis</b> saat ini (berdasarkan data yang tersedia)
3. <b>2-3 rekomendasi actionable</b> untuk hari ini — bold untuk tindakan utama
4. <b>Pertanyaan yang bisa dijawab Yumi</b> — format sebagai daftar dengan emoji bullet

Singkat dan to the point (maksimal 200 kata). Gunakan <b>highlight bold</b> untuk data angka penting.`;

	const content = await callOpenAI(
		[
			{
				role: "system",
				content:
					"Kamu adalah Yumi General Manager Agents 🤖⭐ — General Manager AI yang mengelola seluruh ekosistem Djiwa Tentram. Berikan briefing yang ramah, profesional, dan actionable, layaknya seorang GM yang memberi arahan pagi ke timnya.",
			},
			{ role: "user", content: prompt },
		]
	);

	return { content };
}

async function recordTransaction(
	payload: JsonRecord
): Promise<{ ok: boolean; error?: string; sourceId?: string }> {
	const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
	const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
	if (!supabaseUrl || !supabaseKey) {
		return { ok: false, error: "SUPABASE_URL atau SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi" };
	}

	const supabase = createClient(supabaseUrl, supabaseKey, {
		db: { schema: "pos" },
	});

	const sourceId = `fin_${crypto.randomUUID().replace(/-/g, "")}`;
	const txType = String(payload.tx_type ?? payload.txType ?? "income");
	const amount = Number(payload.amount ?? 0);
	const category = String(payload.category ?? "lainnya");
	const description = String(payload.description ?? "");
	let txDate = Number(payload.tx_date ?? payload.txDate ?? Date.now());
	// ── Midnight protection ──────────────────────────────────────────
	// If txDate is midnight (00:00:00 WIB) it's a date-only OCR receipt timestamp
	// Use current time instead so Yumi AI Bot's polling doesn't see it forever
	const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
	if ((txDate + WIB_OFFSET_MS) % (24 * 60 * 60 * 1000) === 0) {
		const fallbackTime = Date.now();
		console.log(`[MIDNIGHT FIX] tx_date ${new Date(txDate).toISOString()} is midnight, overriding to ${new Date(fallbackTime).toISOString()}`);
		txDate = fallbackTime;
	}
	const paymentMethod = String(payload.payment_method ?? payload.paymentMethod ?? "cash");
	const status = String(payload.status ?? "completed");
	const merchant = String(payload.merchant ?? "");
	const metadata = payload.metadata ?? { source: "telegram_bot", action: "ocr_scan" };
	const raw = payload.raw ?? {};
	const creationTime = Number(payload.creation_time ?? Date.now());

	const sourceFingerprint = String(payload.source_fingerprint ?? payload.sourceFingerprint ?? "").trim();
	const orderSourceId = payload.order_source_id ?? payload.orderSourceId ?? null;

	// ── Dedup by source_fingerprint (strong match) ─────────────
	if (sourceFingerprint) {
		const { data: fpMatch } = await supabase
			.from("financial_transactions")
			.select("source_id")
			.eq("source_fingerprint", sourceFingerprint)
			.maybeSingle();
		if (fpMatch) {
			console.log(`[DEDUP] Duplicate detected by source_fingerprint ${sourceFingerprint}, returning existing ${fpMatch.source_id}`);
			return { ok: true, sourceId: fpMatch.source_id };
		}
	}

	// ── Deduplication check ──────────────────────────────────────
	// Cek apakah transaksi dengan amount, category, description, dan tx_date
	// yang sama sudah ada dalam 5 menit terakhir. Ini mencegah duplikasi
	// dari Telegram callback retry atau double-click.
	if (amount > 0 && txDate > 0) {
		const { data: existing } = await supabase
			.from("financial_transactions")
			.select("source_id, metadata")
			.eq("tx_type", txType)
			.eq("amount", amount)
			.eq("category", category)
			.eq("status", status)
			.gte("tx_date", txDate - 5 * 60 * 1000) // 5 menit window
			.lte("tx_date", txDate + 60 * 1000) // +1 menit buffer
			.limit(5);

		if (existing && existing.length > 0) {
			// Cari yang paling mirip: cek metadata description atau receipt_number
			for (const row of existing) {
				const meta = row.metadata as Record<string, unknown> | null;
				const metaDesc = (meta?.receiptDetails as Record<string, unknown> | undefined)
					?.receiptNumber as string | undefined;
				const thisReceipt = (metadata as Record<string, unknown>).receipt_number as string | undefined;

				// Match jika receipt_number sama
				if (thisReceipt && metaDesc && thisReceipt === metaDesc) {
					console.log(`[DEDUP] Duplicate detected: receipt ${thisReceipt}, returning existing source_id ${row.source_id}`);
					return { ok: true, sourceId: row.source_id };
				}

				// Match jika description mirip (same merchant + items)
				const metaDescText = (meta?.description as string) || "";
				if (description && metaDescText && description.length > 10) {
					// Extract merchant dari description
					const thisMerchant = description.split(":")[0] || description;
					const otherMerchant = metaDescText.split(":")[0] || metaDescText;
					if (thisMerchant.toLowerCase() === otherMerchant.toLowerCase()) {
						console.log(`[DEDUP] Duplicate detected: amount=${amount}, category=${category}, merchant=${thisMerchant}, returning existing source_id ${row.source_id}`);
						return { ok: true, sourceId: row.source_id };
					}
				}
			}
		}
	}

	const { error } = await supabase
		.from("financial_transactions")
		.insert({
			source_id: sourceId,
			tx_type: txType,
			amount,
			category,
			description,
			tx_date: txDate,
			payment_method: paymentMethod,
			status,
			metadata,
			raw,
		source_fingerprint: sourceFingerprint || null,
		order_source_id: orderSourceId,
		merchant: merchant || null,
		creation_time: creationTime,
	});

	if (error) {
		console.error("recordTransaction failed:", error);
		return { ok: false, error: error.message };
	}

	return { ok: true, sourceId };
}

// ── COA Classification + Accounting Entries ─────────────────

// Keyword-based COA mapping for item names
const ITEM_COA_KEYWORDS: Array<{ keywords: string[]; coaCode: string }> = [
	{ keywords: ["kopi", "susu", "cream", "creamer", "krim"], coaCode: "5-2100" },
	{ keywords: ["tepung", "roti", "croissant", "terigu", "gandum", "baguette"], coaCode: "5-2200" },
	{ keywords: ["sirup", "soda", "coca", "fanta", "sprite", "rich gold", "delmonte", "tomat", "jus", "minuman"], coaCode: "5-2300" },
	{ keywords: ["pack", "gelas", "cup", "lid", "sedotan", "tutup", "kemasan", "kantong plastik", "paper bag"], coaCode: "5-2400" },
	{ keywords: ["gaji", "upah", "honor"], coaCode: "5-1000" },
	{ keywords: ["listrik", "air", "pdam", "pln", "pulsa"], coaCode: "5-3100" },
	{ keywords: ["sewa", "kontrak", "sewa tempat"], coaCode: "5-3200" },
	{ keywords: ["bensin", "transport", "ojol", "grab", "gojek", "bahan bakar"], coaCode: "5-3300" },
	{ keywords: ["iklan", "promo", "instagram", "facebook", "tiktok", "marketing"], coaCode: "5-4000" },
	{ keywords: ["penyusutan", "depresiasi", "amortisasi"], coaCode: "5-5000" },
	{ keywords: ["gula", "gkp", "gulaku", "gula pasir"], coaCode: "5-2000" },
	{ keywords: ["telur", "ayam", "daging", "ikan", "udang"], coaCode: "5-2000" },
	{ keywords: ["minyak", "mentega", "butter", "margarin"], coaCode: "5-2000" },
	{ keywords: ["keju", "yogurt", "yoghurt"], coaCode: "5-2100" },
	{ keywords: ["coklat", "cokelat", "cocoa", "matcha", "green tea", "tea"], coaCode: "5-2300" },
	{ keywords: ["nasi", "beras"], coaCode: "5-2000" },
	{ keywords: ["bumbu", "rempah", "bawang", "jahe", "kunyit", "laos", "lengkuas", "sereh"], coaCode: "5-2000" },
	{ keywords: ["sayur", "selada", "kangkung", "bayam", "wortel", "kol", "toge", "tauge"], coaCode: "5-2000" },
	{ keywords: ["buah", "jeruk", "lemon", "alpukat", "pisang", "mangga", "melon", "strawberry", "blueberry"], coaCode: "5-2300" },
	{ keywords: ["perlengkapan", "sabun", "lap", "spons", "tissue", "alkohol", "sanitizer", "masker"], coaCode: "5-3000" },
];

function classifyItemByKeyword(itemName: string): string | null {
	const name = itemName.toLowerCase().trim();
	for (const rule of ITEM_COA_KEYWORDS) {
		for (const kw of rule.keywords) {
			if (name.includes(kw)) return rule.coaCode;
		}
	}
	// Check if item name contains the word "gula" etc.
	// Default to Bahan Baku for anything that looks like ingredient
	if (/^\d/.test(name) || name.includes("kg") || name.includes("gr") || name.includes("liter") || name.includes("ml")) {
		return "5-2000"; // measureable ingredients → Bahan Baku
	}
	return null;
}

function categoryToCoa(category: string): string {
	const cat = category.toLowerCase();
	if (cat.includes("bahan") || cat.includes("baku")) return "5-2000";
	if (cat.includes("gaji")) return "5-1000";
	if (cat.includes("operasional") || cat.includes("operational")) return "5-3000";
	if (cat.includes("promosi") || cat.includes("iklan")) return "5-4000";
	if (cat.includes("listrik") || cat.includes("air")) return "5-3100";
	if (cat.includes("sewa")) return "5-3200";
	if (cat.includes("transport")) return "5-3300";
	return "5-3000"; // default operasional
}

function paymentMethodToCoa(method: string): string {
	const m = method.toLowerCase();
	if (m.includes("qris") || m.includes("qr")) return "1-1100";
	return "1-1000"; // cash/tunai default
}

async function classifyTransactionItems(payload: JsonRecord): Promise<{ ok: boolean; error?: string; classifications?: unknown[] }> {
	const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
	const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
	const supabase = createClient(supabaseUrl, supabaseKey);

	const transactionId = String(payload.transaction_id ?? "");
	const items = payload.items as Array<{ name: string; quantity: number; price: number; total: number }> | undefined;
	const category = String(payload.category ?? "");
	const paymentMethod = String(payload.payment_method ?? payload.paymentMethod ?? "tunai");
	const totalAmount = Number(payload.total_amount ?? 0);

	if (!transactionId || !items || items.length === 0) {
		return { ok: false, error: "transaction_id dan items wajib diisi" };
	}

	// ── Dedup check: skip if entries already exist for this transaction ──
	const { data: existingEntries, count: existingCount } = await supabase
		.from("accounting_entries")
		.select("id", { count: "exact", head: true })
		.eq("transaction_source_id", transactionId);
	if (existingCount && existingCount > 0) {
		console.log(`[DEDUP] Accounting entries already exist for ${transactionId} (${existingCount} entries), skipping`);
		return { ok: true, classifications: [], skipped: true };
	}

	// Fetch all existing item embeddings for exact matching
	const { data: existingMappings } = await supabase
		.from("accounting_item_embeddings")
		.select("item_name, coa_id");
	const embeddingMap = new Map<string, string>();
	if (existingMappings) {
		for (const m of existingMappings) {
			embeddingMap.set(m.item_name.toLowerCase().trim(), m.coa_id);
		}
	}

	// Fetch COA codes to IDs mapping
	const { data: coaList } = await supabase
		.from("accounting_chart_of_accounts")
		.select("id, code");
	const coaCodeToId = new Map<string, string>();
	if (coaList) {
		for (const c of coaList) {
			coaCodeToId.set(c.code, c.id);
		}
	}

	const classifications: Array<{
		itemName: string;
		coaCode: string;
		coaName: string;
		amount: number;
		entryType: string;
		method: "exact" | "keyword" | "category" | "ai";
	}> = [];
	let totalDebit = 0;

	for (const item of items) {
		const itemName = String(item.name ?? "").trim();
		const itemTotal = Number(item.total ?? item.price ?? 0) * Math.max(1, Number(item.quantity ?? 1));
		let coaCode = "";
		let method: "exact" | "keyword" | "category" | "ai" = "keyword";

		// Level 1: Exact match from stored embeddings
		const stored = embeddingMap.get(itemName.toLowerCase());
		if (stored) {
			coaCode = coaList?.find(c => c.id === stored)?.code ?? "";
			method = "exact";
		}

		// Level 2: Keyword matching
		if (!coaCode) {
			const kw = classifyItemByKeyword(itemName);
			if (kw) coaCode = kw;
		}

		// Level 3: Category-based fallback
		if (!coaCode) {
			coaCode = categoryToCoa(category);
			method = "category";
		}

		const coaId = coaCodeToId.get(coaCode);
		if (!coaId) continue;

		classifications.push({
			itemName,
			coaCode,
			coaName: coaList?.find(c => c.code === coaCode)?.name ?? coaCode,
			amount: itemTotal,
			entryType: "debit",
			method,
		});
		totalDebit += itemTotal;

		// Store new mapping if not already known
		if (method !== "exact") {
			await supabase.from("accounting_item_embeddings").upsert(
				{
					item_name: itemName,
					coa_id: coaId,
					usage_count: 1,
					last_used_at: new Date().toISOString(),
				},
				{ onConflict: "item_name", ignoreDuplicates: false }
			).eq("item_name", itemName);
		}
	}

	// Generate accounting entries: DEBIT per item + KREDIT total to Kas
	const entries: Array<{
		transaction_source_id: string;
		coa_id: string;
		entry_type: string;
		amount: number;
		description: string;
		item_index: number;
	}> = [];

	// DEBIT entries per item
	for (const c of classifications) {
		const coaId = coaCodeToId.get(c.coaCode);
		if (!coaId) continue;
		entries.push({
			transaction_source_id: transactionId,
			coa_id: coaId,
			entry_type: "debit",
			amount: c.amount,
			description: c.itemName,
			item_index: classifications.indexOf(c) + 1,
		});
	}

	// KREDIT entry to Kas
	const kasCoaCode = paymentMethodToCoa(paymentMethod);
	const kasCoaId = coaCodeToId.get(kasCoaCode);
	if (kasCoaId && totalDebit > 0) {
		entries.push({
			transaction_source_id: transactionId,
			coa_id: kasCoaId,
			entry_type: "kredit",
			amount: Math.max(totalDebit, totalAmount),
			description: `Pembayaran ${paymentMethod} (${items.length} item)`,
			item_index: 0,
		});
	}

	// Bulk insert entries
	if (entries.length > 0) {
		const { error: insertError } = await supabase
			.from("accounting_entries")
			.insert(entries);
		if (insertError) {
			console.error("Failed to insert accounting entries:", insertError);
			return { ok: false, error: insertError.message };
		}
	}

	return {
		ok: true,
		classifications: classifications.map(c => ({
			item: c.itemName,
			akun: `${c.coaCode} — ${c.coaName}`,
			debit: c.entryType === "debit" ? c.amount : 0,
			kredit: c.entryType === "kredit" ? c.amount : 0,
			metode: c.method,
		})),
	};
}

async function executeSql(payload: JsonRecord): Promise<{ ok: boolean; error?: string; result?: unknown }> {
	const sql = String(payload.sql ?? "").trim();
	if (!sql) return { ok: false, error: "sql is required" };
	const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
	const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
	const supabase = createClient(supabaseUrl, supabaseKey);
	const { error } = await supabase.rpc("exec_sql", { sql });
	if (error) return { ok: false, error: error.message };
	return { ok: true, result: "SQL executed successfully" };
}

async function insertInventory(payload: JsonRecord): Promise<{ ok: boolean; error?: string; sourceId?: string }> {
	const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
	const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
	const supabase = createClient(supabaseUrl, supabaseKey);
	const sourceId = "inv_" + crypto.randomUUID().replace(/-/g, "").slice(0, 16);
	const { error } = await supabase.schema("pos").from("inventory").insert({
		source_id: sourceId, ingredient_name: String(payload.ingredientName ?? ""), unit: String(payload.unit ?? "pcs"),
		quantity: Number(payload.quantity ?? 0), low_stock_threshold: Number(payload.lowStockThreshold ?? 0),
		conversion_factor: payload.conversionFactor ? Number(payload.conversionFactor) : null,
		preferred_purchase_unit: payload.preferredPurchaseUnit || null,
		preferred_purchase_quantity: payload.preferredPurchaseQuantity ? Number(payload.preferredPurchaseQuantity) : null,
		last_purchase_price: payload.lastPurchasePrice ? Number(payload.lastPurchasePrice) : null,
		last_purchase_at: payload.lastPurchaseAt ? Number(payload.lastPurchaseAt) : null,
		raw: payload.raw || null, creation_time: Date.now(),
	});
	if (error) { console.error("insertInventory failed:", error); return { ok: false, error: error.message }; }
	return { ok: true, sourceId };
}

async function sendTelegram(
	payload: JsonRecord
): Promise<{ ok: boolean; error?: string; messageId?: number }> {
	// Return { ok: false } with status 200 for all logical errors so that
	// supabase.functions.invoke() never sees a non-2xx and the real error
	// message reaches the caller instead of the generic SDK wrapper text.

	if (!telegramBotToken) {
		return {
			ok: false,
			error:
				"TELEGRAM_BOT_TOKEN belum dikonfigurasi. Tambahkan di Supabase Dashboard → Edge Functions → Manage secrets.",
		};
	}

	const text = String(payload.text ?? "").trim();
	if (!text) return { ok: false, error: "Teks pesan kosong" };

	const rawChatId =
		payload.chatId !== undefined ? payload.chatId : telegramDefaultChatId;
	if (!rawChatId) {
		return {
			ok: false,
			error:
				"chat_id tidak ditemukan. Tambahkan TELEGRAM_CHAT_ID di Supabase secrets atau kirim chatId di request body.",
		};
	}

	// Group chat IDs are negative integers; parse string values from env
	const chatId =
		typeof rawChatId === "string" ? parseInt(rawChatId, 10) : (rawChatId as number);

	try {
		const apiUrl = `https://api.telegram.org/bot${telegramBotToken}/sendMessage`;
		const res = await fetch(apiUrl, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ chat_id: chatId, text }),
		});

		const data = (await res.json()) as {
			ok: boolean;
			description?: string;
			result?: { message_id: number };
		};

		if (!res.ok || !data.ok) {
			return {
				ok: false,
				error: data.description || `Telegram API error: ${res.status}`,
			};
		}

		return { ok: true, messageId: data.result?.message_id };
	} catch (err) {
		return {
			ok: false,
			error: err instanceof Error ? err.message : "Gagal menghubungi Telegram API",
		};
	}
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function submitEmployeeApplication(body: JsonRecord) {
	const payload = (body.payload ?? body) as JsonRecord;

	// --- server-side validation ---
	const fullName = String(payload.full_name ?? "").trim();
	const phone = String(payload.phone ?? "").trim();
	if (!fullName) throw new Error("Nama lengkap wajib diisi");
	if (!phone) throw new Error("Nomor HP wajib diisi");

	const email = payload.email ? String(payload.email).trim() : null;
	if (email && !EMAIL_REGEX.test(email)) {
		throw new Error("Format email tidak valid");
	}

	const identityNumber = payload.identity_number
		? String(payload.identity_number).trim()
		: null;
	if (identityNumber && !/^\d{16}$/.test(identityNumber)) {
		throw new Error("NIK harus 16 digit angka");
	}

	// Force status to pending (prevent client spoofing)
	const row = {
		status: "pending",
		full_name: fullName,
		email,
		phone,
		identity_number: identityNumber,
		address: payload.address ? String(payload.address).trim() : null,
		birth_date: payload.birth_date ? String(payload.birth_date).trim() : null,
		emergency_contact: payload.emergency_contact ?? {},
		employment: payload.employment ?? {},
		contract: payload.contract ?? {},
		signature_url: payload.signature_url ?? null,
		contract_pdf_url: payload.contract_pdf_url ?? null,
		attachments: payload.attachments ?? {},
		raw: {
			...((payload.raw as JsonRecord) ?? {}),
			pipelineStatus: "submitted",
			validatedByEdgeFunction: true,
		},
	};

	const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
	const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
	const adminClient = createClient(supabaseUrl, serviceRoleKey);

	const { data, error } = await adminClient
		.from("employee_onboarding_applications")
		.insert(row)
		.select("id")
		.single();
	if (error) throw new Error(error.message);
	return { id: data.id };
}

// ── Parse Attendance Schedule ─────────────────────────────────

async function parseAttendanceSchedule(payload: JsonRecord): Promise<Record<string, unknown>> {
	const images = Array.isArray(payload.images) ? payload.images : [];
	const text = String(payload.text ?? "").trim();
	const staffHints = Array.isArray(payload.staffHints) ? payload.staffHints : [];
	const shiftHints = Array.isArray(payload.shiftHints) ? payload.shiftHints : [];
	const monthHint = typeof payload.monthHint === "number" ? payload.monthHint : 0;
	const yearHint = typeof payload.yearHint === "number" ? payload.yearHint : 0;

	const staffHintText = staffHints.length > 0
		? `\nNama karyawan yang ada di aplikasi:\n${staffHints.map((s: any) => `- ${s.name} (${s.roleName || "Team"})`).join("\n")}`
		: "";
	const shiftHintText = shiftHints.length > 0
		? `\nShift yang dikonfigurasi di admin:\n${shiftHints.map((s: any) => `- ${s.name}: ${s.openTime || "?"} - ${s.closeTime || "?"}`).join("\n")}`
		: "";

	const prompt = `ANALISIS JADWAL SHIFT KARYAWAN — PARSING KE JSON

Kamu melihat gambar atau teks jadwal shift bulanan (roster matrix). Parse gambar/teks ini ke format JSON ketat berikut, TANPA markdown, hanya JSON murni:

{
  "source": {
    "fileName": "(nama file jika ada)",
    "fileType": "png",
    "month": (angka 1-12),
    "year": (angka 4 digit),
    "title": "(title dari gambar/teks)"
  },
  "staffColumns": [
    {
      "rawName": "(nama staff dari header kolom)",
      "outlet": "(outlet/unit jika terbaca dari header)",
      "role": "(role dari header jika terbaca)",
      "contractLabel": "(label kontrak jika ada)"
    }
  ],
  "rows": [
    {
      "date": "YYYY-MM-DD",
      "dayName": "JUMAT/SABTU/dst",
      "weekLabel": "Minggu Ke N",
      "rawStaffName": "(nama staff dari kolom header)",
      "rawShiftText": "(teks shift mentah dari sel, misal PAGI (07.30 - 14.30), SORE (13.00 - 21.00), OFF, GENERAL)",
      "shiftName": "(normalisasi: PAGI, SORE, OFF, GENERAL, atau nama shift sesuai file)",
      "startTime": "HH:mm atau null",
      "endTime": "HH:mm atau null",
      "status": "scheduled | off | general",
      "confidence": 0.0-1.0
    }
  ],
  "warnings": [
    {
      "type": "unreadable_cell | date_mismatch | unknown_shift | unknown_staff | duplicate",
      "message": "(pesan deskriptif)",
      "rawStaffName": "(nama staff terkait)",
      "date": "YYYY-MM-DD"
    }
  ]
}

ATURAN PARSING:
1. Judul biasanya "JADWAL <MONTH> <YEAR>" di baris paling atas. Deteksi month dan year dari judul.
2. Struktur kolom: MINGGU KE | HARI | TANGGAL | <staff kolom 1> | <staff kolom 2> | ...
3. Staff columns ada di baris header (baris ke-2 atau ke-3 dari atas setelah title row).
4. Setiap cell body adalah salah satu: nama shift, "OFF", atau "GENERAL".
5. Normalisasi shift: PAGI -> PAGI, SORE -> SORE, OFF -> OFF, GENERAL -> GENERAL.
6. Jika ada jam dalam format HH.mm - HH.mm, parse ke HH:mm dan masukkan ke startTime/endTime.
7. Jam yang tidak bisa dibaca confidence < 0.8.
8. Jangan menebak user ID — hanya output raw staff names.
9. Jumlah baris data harus sama dengan jumlah tanggal dalam bulan yang terdeteksi.
10. Jika teks tidak terbaca di suatu sel, output warning unreadable_cell.
${staffHintText}${shiftHintText}`;

	const inputContent: unknown[] = [];

	if (text) {
		inputContent.push({ type: "text", text: prompt + "\n\n---TEKS INPUT---\n" + text });
	}

	if (images.length > 0) {
		inputContent.push({ type: "text", text: prompt });
		for (const img of images.slice(0, 4)) {
			if (typeof img === "string") {
				inputContent.push({
					type: "image_url",
					image_url: { url: toImageUrl(img) },
				});
			}
		}
	}

	const messages = [{ role: "user", content: inputContent }];
	const content = await callOpenAI(messages, openaiModelVision);

	// Extract JSON
	const jsonMatch = content.match(/\{[\s\S]*\}/);
	if (!jsonMatch) {
		return { error: "Tidak ada data JSON dalam respons AI", rawContent: content };
	}

	try {
		const data = JSON.parse(jsonMatch[0]);
		return data;
	} catch {
		return { error: "Gagal parse JSON dari respons AI", rawContent: content };
	}
}

async function importAttendanceSchedule(payload: JsonRecord): Promise<Record<string, unknown>> {
	const parsedData = payload.parsedData as Record<string, unknown> | undefined;
	if (!parsedData || !Array.isArray(parsedData.rows)) {
		return { error: "parsedData.rows wajib diisi" };
	}

	const rows = parsedData.rows as any[];
	const staffColumns = (parsedData.staffColumns ?? []) as any[];
	const month = (parsedData.month ?? 0) as number;
	const year = (parsedData.year ?? 0) as number;
	const sourceFile = (parsedData.source as Record<string, unknown> ?? {}).fileName as string ?? "";
	const skipDelete = payload.skipDelete === true; // skip DELETE for chunked import (chunk 2+, N)

	const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
	const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
	const supabase = createClient(supabaseUrl, supabaseKey);

	// Step 1: Get all existing staff from yumi_users
	const { data: existingStaff, error: staffError } = await supabase
		.from("yumi_users")
		.select("source_id, name, role_source_id, slug, username");

	if (staffError) return { error: "Gagal query staff: " + staffError.message };

	const existingRoles: any[] = [];
	const { data: rolesData } = await supabase
		.from("yumi_roles")
		.select("source_id, name");
	if (rolesData) existingRoles.push(...rolesData);

	// Step 2: Collect unique staff names from data
	const uniqueNames = [...new Set(rows.map((r: any) => r.rawStaffName || "").filter(Boolean))];

	// Step 3: Match and create staff
	const staffMap: Record<string, string> = {}; // rawName → source_id
	const createdStaff: string[] = [];
	const matchedStaff: string[] = [];

	// Helper: Jaro-Winkler similarity for fuzzy name matching
	function jaroWinkler(s1: string, s2: string): number {
		if (s1 === s2) return 1.0;
		const len1 = s1.length, len2 = s2.length;
		if (len1 === 0 || len2 === 0) return 0.0;

		const matchDist = Math.floor(Math.max(len1, len2) / 2) - 1;
		const matches1 = new Array(len1).fill(false);
		const matches2 = new Array(len2).fill(false);
		let matches = 0;

		for (let i = 0; i < len1; i++) {
			const start = Math.max(0, i - matchDist);
			const end = Math.min(len2, i + matchDist + 1);
			for (let j = start; j < end; j++) {
				if (matches2[j] || s1[i] !== s2[j]) continue;
				matches1[i] = true;
				matches2[j] = true;
				matches++;
				break;
			}
		}

		if (matches === 0) return 0.0;

		// Count transpositions
		let transpositions = 0, k = 0;
		for (let i = 0; i < len1; i++) {
			if (!matches1[i]) continue;
			while (!matches2[k]) k++;
			if (s1[i] !== s2[k]) transpositions++;
			k++;
		}

		const jaro = (
			matches / len1 +
			matches / len2 +
			(matches - transpositions / 2) / matches
		) / 3;

		// Winkler boost: common prefix up to 4 chars
		let prefix = 0;
		for (let i = 0; i < Math.min(len1, len2, 4); i++) {
			if (s1[i] === s2[i]) prefix++;
			else break;
		}
		return jaro + prefix * 0.1 * (1 - jaro);
	}

	// Helper: name similarity score
	function nameSimilarity(query: string, dbName: string): number {
		const q = query.toLowerCase().replace(/[^a-z0-9]/g, "");
		const d = dbName.toLowerCase().replace(/[^a-z0-9]/g, "");
		if (q === d) return 1.0;

		// ── Stage 1: Word-boundary matching ──
		// Check each word in the DB name individually
		// e.g., "DILLA" matches word "DILLA" in "KANIA DILLA FAIRUZ"
		// e.g., "ANIDA" does NOT match any word in "KANIA DILLA FAIRUZ"
		const dbWords = dbName.toLowerCase().split(/[\s,.-]+/).filter(Boolean);
		for (const word of dbWords) {
			const w = word.replace(/[^a-z0-9]/g, "");
			if (!w) continue;
			if (q === w) return 0.95;  // exact word match
			if (w.includes(q) && q.length >= w.length * 0.4) return 0.9;  // partial word
			if (q.includes(w)) return 0.85;
		}

		// ── Stage 2: Subsequence per word ──
		// "ISAN" is a subsequence of "IKHSAN" → should match
		// "YUSUF" is a subsequence of "YUSUF" within "MUHAMMAD YUSUF"
		for (const word of dbWords) {
			const w = word.replace(/[^a-z0-9]/g, "");
			if (!w) continue;
			let ptr = 0;
			for (const ch of q) {
				const idx = w.indexOf(ch, ptr);
				if (idx === -1) { ptr = -1; break; }
				ptr = idx + 1;
			}
			if (ptr > 0 && q.length >= w.length * 0.5) {
				return 0.8;  // subsequence within a word
			}
		}

		// ── Stage 3: Jaro-Winkler fuzzy match per word ──
		// Handles typos, abbreviations, and transpositions
		// e.g., "TAOFIK" vs "TAOFIKUROHMAN" → high similarity
		let bestJW = 0;
		for (const word of dbWords) {
			const w = word.replace(/[^a-z0-9]/g, "");
			if (!w) continue;
			const jw = jaroWinkler(q, w);
			if (jw > bestJW) bestJW = jw;
		}
		if (bestJW >= 0.88) return 0.75;

		// ── Stage 4: Full-string fallback ──
		// Check the entire concatenated name
		if (d.includes(q) && q.length >= d.length * 0.33) return 0.7;
		if (q.includes(d)) return 0.65;

		// ── Stage 5: Subsequence on full string ──
		let ptr = 0;
		for (const ch of q) {
			const idx = d.indexOf(ch, ptr);
			if (idx === -1) return 0.0;
			ptr = idx + 1;
		}
		return q.length >= d.length * 0.5 ? 0.6 : 0.0;
	}

	for (const rawName of uniqueNames) {
		const nameClean = rawName.trim();
		if (!nameClean) continue;

		// Score all existing staff for best match
		let bestMatch: any = null;
		let bestScore = 0;

		for (const s of existingStaff ?? []) {
			if (!s.name) continue;
			const score = nameSimilarity(nameClean, s.name);
			if (score > bestScore) {
				bestScore = score;
				bestMatch = s;
			}
			// Also check slug
			if (s.slug) {
				const slugScore = nameSimilarity(nameClean, s.slug.replace(/-/g, " "));
				if (slugScore > bestScore) {
					bestScore = slugScore;
					bestMatch = s;
				}
			}
		}

		// Use AI fuzzy matching if no good match found (score < 0.6)
		if (!bestMatch || bestScore < 0.6) {
			try {
				const aiPrompt = `Cocokkan nama karyawan dari file Excel "${nameClean}" dengan database. Daftar nama di database: ${(existingStaff ?? []).map((s: any) => s.name).join(", ")}. Balas hanya dengan nama yang paling cocok dari database, atau "TIDAK ADA" jika tidak ada yang cocok. Jika ada kemiripan (misal "ISAN" dengan "IKHSAN EVERYDAY"), pilih yang paling mirip.`;

				const aiResult = await callOpenAI([
					{ role: "user", content: aiPrompt },
				], openaiModelChat);

				const aiMatch = (aiResult || "").trim();
				if (aiMatch && aiMatch !== "TIDAK ADA") {
					const found = existingStaff?.find(
						(s: any) => s.name?.toLowerCase() === aiMatch.toLowerCase()
					);
					if (found) {
						bestMatch = found;
						bestScore = 0.85;
					}
				}
			} catch {
				// Silently fall through if AI fails
			}
		}

		if (bestMatch && bestScore >= 0.7) {
			staffMap[nameClean] = bestMatch.source_id;
			matchedStaff.push(`${nameClean} → ${bestMatch.name}`);
			continue;
		}

		// Step 3b: Try to get role from staffColumns or row data
		let roleSourceId = "";
		const colInfo = staffColumns.find((c: any) =>
			c.rawName?.toLowerCase() === nameClean.toLowerCase()
		);
		const roleName = (colInfo?.role || "").trim().toUpperCase() || "TEAM";

		// Find or create role
		let role = existingRoles.find((r: any) => r.name?.toUpperCase() === roleName);
		if (!role) {
			roleSourceId = "role_" + crypto.randomUUID().replace(/-/g, "").slice(0, 12);
			const { error: roleCreateError } = await supabase.rpc("exec_sql", {
				sql: `INSERT INTO yumi_roles (source_id, name, permissions, raw) ` +
					`VALUES ('${roleSourceId}', '${roleName}', '[]'::jsonb, '{}'::jsonb) ` +
					`ON CONFLICT DO NOTHING;`,
			});
			if (!roleCreateError) {
				existingRoles.push({ source_id: roleSourceId, name: roleName });
			} else {
				// Fallback: try querying again
				const { data: freshRole } = await supabase
					.from("yumi_roles")
					.select("source_id")
					.ilike("name", roleName)
					.single();
				roleSourceId = (freshRole as any)?.source_id || "";
			}
		} else {
			roleSourceId = role.source_id;
		}

		// Generate unique username
		const username = nameClean.toLowerCase().replace(/[^a-z0-9]/g, "_").slice(0, 30);
		const uniqueSuffix = crypto.randomUUID().replace(/-/g, "").slice(0, 6);
		const finalUsername = username + "_" + uniqueSuffix;

		// Create user in yumi_users
		const newUserId = "user_" + crypto.randomUUID().replace(/-/g, "").slice(0, 12);
		const slug = nameClean.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");

		const { error: userCreateError } = await supabase.rpc("exec_sql", {
			sql: `INSERT INTO yumi_users (source_id, username, name, role_source_id, is_active, receive_report_emails, slug, raw) ` +
				`VALUES ('${newUserId}', '${finalUsername}', '${nameClean.replace(/'/g, "''")}', '${roleSourceId}', true, false, '${slug}', '{}'::jsonb);`,
		});

		if (userCreateError) {
			console.error("Failed to create user:", nameClean, userCreateError.message);
			continue;
		}

		staffMap[nameClean] = newUserId;
		createdStaff.push(`${nameClean} (${roleName})`);
	}

	// Step 4: Delete existing schedules for this month (skip if chunked import)
	if (!skipDelete && month > 0 && year > 0) {
		const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
		const endDate = `${year}-${String(month).padStart(2, "0")}-31`;
		await supabase.rpc("exec_sql", {
			sql: `DELETE FROM pos.attendance_schedules WHERE date >= '${startDate}'::date AND date <= '${endDate}'::date;`,
		});
	}

	// Step 5: Bulk INSERT schedules
	const valueParts: string[] = [];
	let skippedCount = 0;

	for (const row of rows) {
		const staffName = (row.rawStaffName || "").trim();
		const userId = staffMap[staffName];
		if (!userId) {
			skippedCount++;
			continue;
		}

		const dateStr = row.date;
		const shiftName = (row.shiftName || "GENERAL").replace(/'/g, "''");
		const startTime = row.startTime ? `'${row.startTime}'::time` : "NULL";
		const endTime = row.endTime ? `'${row.endTime}'::time` : "NULL";
		const status = row.status === "off" ? "'off'" : "'scheduled'";
		const sourceId = crypto.randomUUID();

		valueParts.push(
			`('${sourceId}', '${userId}', '${dateStr}'::date, '${shiftName}', ${startTime}, ${endTime}, ${status})`
		);
	}

	if (valueParts.length > 0) {
		const { error: insertError } = await supabase.rpc("exec_sql", {
			sql: `INSERT INTO pos.attendance_schedules (source_id, user_id, date, shift_name, start_time, end_time, status) VALUES ` +
				valueParts.join(",\n") + ";",
		});
		if (insertError) {
			return { error: "Gagal insert jadwal: " + insertError.message };
		}
	}

	// Step 6: Return summary
	const uniqueDates = [...new Set(rows.map((r: any) => r.date))];
	return {
		success: true,
		summary: {
			totalRows: rows.length,
			insertedRows: valueParts.length,
			skippedRows: skippedCount,
			uniqueDates: uniqueDates.length,
			matchedStaff: matchedStaff.length,
			createdStaff: createdStaff.length,
			staffDetails: {
				matched: matchedStaff,
				created: createdStaff,
			},
			month,
			year,
			sourceFile,
		},
	};
}

Deno.serve(async (req) => {
	if (req.method === "OPTIONS") {
		return new Response("ok", { headers: corsHeaders });
	}

	try {
		const body = (await req.json()) as JsonRecord;
		const action = body.action as AiAction | undefined;

		switch (action) {
			case "yumiChat":
				return jsonOk(await yumiChat(body) as Record<string, unknown>);
			case "bulkScanImageData": {
				const result = await bulkScanImageData(body);
				return jsonOk({ items: result } as Record<string, unknown>);
			}
			case "generateBusinessBriefing":
				return jsonOk(await generateBusinessBriefing(body) as Record<string, unknown>);
			case "sendTelegram": {
				const result = await sendTelegram(body);
				if (!result.ok) return fail("TELEGRAM_ERROR", result.error || "Gagal kirim Telegram", 400);
				return jsonOk(result);
			}
			case "recordTransaction": {
				const result = await recordTransaction(body);
				if (!result.ok) return fail("REQUEST_FAILED", result.error || "Gagal", 400);
				return jsonOk(result);
			}
			case "classifyTransactionItems": {
				const result = await classifyTransactionItems(body);
				if (!result.ok) return fail("REQUEST_FAILED", result.error || "Gagal", 400);
				return jsonOk(result);
			}
			case "executeSql": {
				const result = await executeSql(body);
				if (!result.ok) return fail("REQUEST_FAILED", result.error || "SQL failed", 400);
				return jsonOk(result);
			}
			case "insertInventory": {
				const result = await insertInventory(body);
				if (!result.ok) return fail("REQUEST_FAILED", result.error || "Gagal", 400);
				return jsonOk(result);
			}
			case "submitEmployeeApplication":
				return jsonOk(await submitEmployeeApplication(body) as Record<string, unknown>);
			case "parseAttendanceSchedule": {
				const result = await parseAttendanceSchedule(body);
				if (result.error) return fail("AI_PARSE_ERROR", result.error as string, 400);
				return jsonOk(result as Record<string, unknown>);
			}
			case "importAttendanceSchedule": {
				const result = await importAttendanceSchedule(body);
				if (result.error) return fail("IMPORT_ERROR", result.error as string, 400);
				return jsonOk(result as Record<string, unknown>);
			}
		default:
			return fail("UNKNOWN_ACTION", "AI action tidak dikenali", 404);
		}
	} catch (error) {
		console.error("yumi-ai failed", error);
		return fail(
			"INTERNAL_ERROR",
			error instanceof Error ? error.message : "Unknown error",
			400
		);
	}
});
