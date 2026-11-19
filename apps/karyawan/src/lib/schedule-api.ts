/** Klien untuk Edge Function `staff-schedule` (tukar shift otomatis). */
const FN_URL = `${import.meta.env.VITE_SUPABASE_URL ?? "https://supabase.djiwatentram.web.id"}/functions/v1/staff-schedule`;

async function call<T>(token: string | null, body: Record<string, unknown>): Promise<T> {
	if (!token) throw new Error("Sesi berakhir. Masuk lagi.");
	const res = await fetch(FN_URL, {
		method: "POST",
		headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY ?? "" },
		body: JSON.stringify(body),
	});
	const data = await res.json().catch(() => ({}));
	if (!res.ok || data?.success === false) throw new Error(data?.error?.message ?? "Gagal memproses tukar shift");
	return data as T;
}

export const requestSwap = (token: string | null, p: { date: string; partnerId: string; reason: string }) => call<{ success: true; id: string }>(token, { action: "requestSwap", ...p });
export const respondSwap = (token: string | null, requestId: string, accept: boolean) => call<{ success: true; status: "approved" | "rejected"; yourNewShift?: string }>(token, { action: "respondSwap", requestId, accept });
export const cancelSwap = (token: string | null, requestId: string) => call<{ success: true }>(token, { action: "cancelSwap", requestId });
