import "jsr:@supabase/functions-js/edge-runtime.d.ts";

type AiAction = "yumiChat" | "bulkScanImageData" | "generateBusinessBriefing" | "sendTelegram";
type JsonRecord = Record<string, unknown>;

const corsHeaders = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Headers":
		"authorization, x-client-info, apikey, content-type",
};

const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
const openaiBaseUrl = (Deno.env.get("OPENAI_BASE_URL") || "https://api.openai.com/v1").replace(/\/$/, "");

const telegramBotToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
const telegramDefaultChatId = Deno.env.get("TELEGRAM_CHAT_ID");

function jsonResponse(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { ...corsHeaders, "Content-Type": "application/json" },
	});
}

function fail(message: string, status = 400) {
	return jsonResponse({ error: message }, status);
}

async function callOpenAI(messages: unknown[], model = "gpt-4o-mini") {
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

Gunakan bahasa Indonesia yang ramah dan profesional. Format jawaban dengan jelas menggunakan markdown jika diperlukan.${contextHint ? `\nKonteks tambahan: ${contextHint}` : ""}`;

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

	const content = await callOpenAI(openAiMessages, "gpt-4o-mini");
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
				"gpt-4o"
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

Sertakan:
1. Salam pembuka sesuai waktu
2. Ringkasan kondisi bisnis saat ini (berdasarkan data yang tersedia)
3. 2-3 rekomendasi actionable untuk hari ini
4. Pertanyaan yang bisa dijawab oleh Yumi untuk membantu bisnis

Format dengan markdown yang rapi. Singkat dan to the point (maksimal 200 kata).`;

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
