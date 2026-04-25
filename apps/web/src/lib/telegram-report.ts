/**
 * Send a text report to Telegram via the yumi-ai-bot HTTP endpoint.
 * URL resolution order:
 *   1. VITE_TELEGRAM_BOT_URL env var (recommended for production)
 *   2. window.location.hostname:8001 (works when app & bot share the same VPS)
 */

function getBotUrl(): string {
	// Allow explicit override via env var (set in .env / Vercel dashboard)
	const envUrl = typeof import.meta !== "undefined"
		? (import.meta as any).env?.VITE_TELEGRAM_BOT_URL
		: undefined;
	if (envUrl) return envUrl;
	if (typeof window !== "undefined") {
		return `${window.location.protocol}//${window.location.hostname}:8001/send-report`;
	}
	return "http://localhost:8001/send-report";
}

export async function sendTelegramReport(
	text: string,
	chatId?: number | string
): Promise<{ ok: boolean; error?: string }> {
	if (!text.trim()) return { ok: false, error: "Teks laporan kosong" };

	const url = getBotUrl();
	const body: Record<string, unknown> = { text };
	if (chatId) body.chat_id = chatId;

	try {
		const res = await fetch(url, {
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
