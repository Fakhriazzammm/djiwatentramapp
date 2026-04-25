/**
 * Send a text report to Telegram via the yumi-ai-bot HTTP endpoint.
 * The bot exposes POST /send-report on port 8001 (same VPS).
 */

const BOT_REPORT_URL = import.meta.env.VITE_TELEGRAM_BOT_URL ||
	(typeof window !== "undefined"
		? `${window.location.protocol}//${window.location.hostname}:8001/send-report`
		: "http://localhost:8001/send-report");

const TELEGRAM_REPORT_CHAT_ID = import.meta.env.VITE_TELEGRAM_REPORT_CHAT_ID;

export async function sendTelegramReport(
	text: string,
	chatId?: string
): Promise<{ ok: boolean; error?: string }> {
	if (!text.trim()) return { ok: false, error: "Teks laporan kosong" };

	const targetChatId = chatId || TELEGRAM_REPORT_CHAT_ID;

	try {
		const body: { text: string; chat_id?: number } = { text };
		if (targetChatId) {
			body.chat_id = parseInt(targetChatId, 10);
		}

		const res = await fetch(BOT_REPORT_URL, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});

		const data = await res.json();
		if (!res.ok || !data.ok) {
			return { ok: false, error: data.error || `HTTP ${res.status}` };
		}
		return { ok: true };
	} catch (err: any) {
		return { ok: false, error: err?.message || "Gagal menghubungi server Telegram bot" };
	}
}
