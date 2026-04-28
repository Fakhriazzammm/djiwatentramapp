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

import { createClient } from "@/lib/client";

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

	const supabase = createClient();
	let data: any;
	let invokeError: any;

	try {
		const result = await supabase.functions.invoke("yumi-ai", {
			body: {
				action: "sendTelegram",
				text,
				...(targetChatId !== undefined ? { chatId: targetChatId } : {}),
			},
		});
		data = result.data;
		invokeError = result.error;
	} catch (err: any) {
		return { ok: false, error: err?.message || "Gagal memanggil edge function" };
	}

	// supabase.functions.invoke() sets error for non-2xx responses.
	// Try to extract the real message from the response body.
	if (invokeError) {
		let detail = invokeError.message as string;
		try {
			// FunctionsHttpError exposes the raw response via .context
			const body = await (invokeError as any).context?.json?.();
			if (body?.error) detail = body.error;
		} catch {
			// ignore parse errors — use the original message
		}
		return { ok: false, error: detail || "Gagal memanggil edge function" };
	}

	if (!data?.ok) {
		return { ok: false, error: data?.error || "Gagal mengirim ke Telegram" };
	}

	return { ok: true };
}
