/**
 * Send a text report to Telegram via the yumi-ai Supabase Edge Function.
 *
 * The edge function calls the Telegram Bot API server-side using secrets
 * TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID set in Supabase Dashboard →
 * Edge Functions → Manage secrets.
 *
 * Optional: VITE_TELEGRAM_REPORT_CHAT_ID in the frontend .env overrides
 * the default chat_id for this specific app instance.
 */

import { invokeEdgeFunction } from "@/lib/api-helper";

const FRONTEND_CHAT_ID =
	typeof import.meta !== "undefined"
		? (import.meta as any).env?.VITE_TELEGRAM_REPORT_CHAT_ID
		: undefined;

export async function sendTelegramReport(
	text: string,
	chatId?: number | string
): Promise<{ ok: boolean; error?: string }> {
	if (!text.trim()) return { ok: false, error: "Teks laporan kosong" };

	const targetChatId = chatId !== undefined ? chatId : FRONTEND_CHAT_ID;

	try {
		const data = await invokeEdgeFunction<{ ok?: boolean; success?: boolean; error?: string }>("yumi-ai", {
			action: "sendTelegram",
			text,
			...(targetChatId !== undefined ? { chatId: targetChatId } : {}),
		});
		if (data?.ok !== false && data?.success !== false) {
			return { ok: true };
		}
		return { ok: false, error: data?.error || "Gagal mengirim ke Telegram" };
	} catch (err: any) {
		return { ok: false, error: err?.message || "Gagal memanggil edge function" };
	}
}
