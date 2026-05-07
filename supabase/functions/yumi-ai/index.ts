import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

type AiAction = "yumiChat" | "bulkScanImageData" | "generateBusinessBriefing" | "sendTelegram" | "recordTransaction" | "executeSql" | "insertInventory";
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

function jsonResponse(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { ...corsHeaders, "Content-Type": "application/json" },
	});
}

function fail(message: string, status = 400) {
	return jsonResponse({ error: message }, status);
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

	const systemPrompt = `Kamu adalah Yumi, asisten AI bisnis yang cerdas untuk sistem POS (Point of Sale) berbasis Indonesia.
Kamu membantu pemilik bisnis dan kasir dalam:
- Menganalisis data penjualan dan keuangan
- Memberikan insights dan rekomendasi bisnis
- Memproses dan menganalisis struk/nota belanja
- Menjawab pertanyaan seputar operasional bisnis

⚠️ PENTING — Format HTML untuk Telegram:
Gunakan HTML formatting untuk SEMUA respons. Format yang didukung Telegram:
- <b>tebal</b> untuk judul/heading
- <i>miring</i> untuk penekanan
- <u>garis bawah</u> untuk highlight
- <code>inline code</code> untuk data/angka
- <pre>blok teks</pre> untuk tabel/data terstruktur
- Emoji diperbolehkan (✅ ❌ 📊 💰 ⚠️ 🔥 📦 dll)

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

Gunakan bahasa Indonesia yang ramah, profesional, dan to-the-point.${contextHint ? `\nKonteks tambahan: ${contextHint}` : ""}`;

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
			: new Date().getHours();
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
					"Kamu adalah Yumi, asisten AI bisnis untuk sistem POS Indonesia. Berikan briefing yang ramah, profesional, dan actionable.",
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
	const txDate = Number(payload.tx_date ?? payload.txDate ?? Date.now());
	const paymentMethod = String(payload.payment_method ?? payload.paymentMethod ?? "cash");
	const status = String(payload.status ?? "completed");
	const metadata = payload.metadata ?? { source: "telegram_bot", action: "ocr_scan" };
	const raw = payload.raw ?? {};
	const creationTime = Number(payload.creation_time ?? Date.now());

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
			creation_time: creationTime,
		});

	if (error) {
		console.error("recordTransaction failed:", error);
		return { ok: false, error: error.message };
	}

	return { ok: true, sourceId };
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

Deno.serve(async (req) => {
	if (req.method === "OPTIONS") {
		return new Response("ok", { headers: corsHeaders });
	}

	try {
		const body = (await req.json()) as JsonRecord;
		const action = body.action as AiAction | undefined;

		switch (action) {
			case "yumiChat":
				return jsonResponse(await yumiChat(body));
			case "bulkScanImageData":
				return jsonResponse(await bulkScanImageData(body));
			case "generateBusinessBriefing":
				return jsonResponse(await generateBusinessBriefing(body));
			case "sendTelegram":
				return jsonResponse(await sendTelegram(body));
			case "recordTransaction":
				return jsonResponse(await recordTransaction(body));
			case "executeSql":
				return jsonResponse(await executeSql(body));
			case "insertInventory":
				return jsonResponse(await insertInventory(body));
			default:
				return fail("AI action tidak dikenali", 404);
		}
	} catch (error) {
		console.error("yumi-ai failed", error);
		return fail(
			error instanceof Error ? error.message : "Unknown error",
			400
		);
	}
});
