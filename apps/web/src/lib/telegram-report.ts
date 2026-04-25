/**
 * Send a text report to Telegram via the yumi-ai-bot HTTP endpoint.
 * The bot exposes POST /send-report on port 8001 (same VPS).
 */

const BOT_REPORT_URL =
	typeof window !== "undefined"
		? `${window.location.protocol}//${window.location.hostname}:8001/send-report`
		: "http://localhost:8001/send-report";

export async function sendTelegramReport(text: string): Promise<{ ok: boolean; error?: string }> {
	if (!text.trim()) return { ok: false, error: "Teks laporan kosong" };

	try {
		const res = await fetch(BOT_REPORT_URL, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ text }),
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
