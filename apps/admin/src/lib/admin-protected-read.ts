export type ProtectedReadAction = "orders" | "booking" | "finance";

export type ProtectedReadQuery = {
	select?: string;
	eq?: Record<string, string | number | boolean | null>;
	gte?: Record<string, string | number>;
	gt?: Record<string, string | number>;
	lte?: Record<string, string | number>;
	lt?: Record<string, string | number>;
	in?: Record<string, Array<string | number>>;
	order?: Array<{ column: string; ascending?: boolean; nullsFirst?: boolean }>;
	range?: [number, number];
	limit?: number;
};

const MAX_CONCURRENT_PROTECTED_READS = 2;
let activeProtectedReads = 0;
const protectedReadWaiters: Array<() => void> = [];

async function acquireProtectedReadSlot() {
	if (activeProtectedReads < MAX_CONCURRENT_PROTECTED_READS) {
		activeProtectedReads += 1;
		return;
	}
	await new Promise<void>((resolve) => protectedReadWaiters.push(resolve));
	activeProtectedReads += 1;
}

function releaseProtectedReadSlot() {
	activeProtectedReads = Math.max(0, activeProtectedReads - 1);
	protectedReadWaiters.shift()?.();
}

export async function adminProtectedRead<T = any>(
	action: ProtectedReadAction,
	query: ProtectedReadQuery = {},
): Promise<T[]> {
	if (typeof window === "undefined") return [];
	const token = window.localStorage.getItem("yumi_session_token")?.trim();
	if (!token) throw new Error("Sesi admin tidak ditemukan");

	const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL ?? "").replace(/\/+$/, "");
	const publishableKey = String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY ?? "");
	if (!supabaseUrl || !publishableKey) throw new Error("Konfigurasi Supabase tidak tersedia");

	await acquireProtectedReadSlot();
	try {
		const endpoint = `${supabaseUrl}/functions/v1/admin-protected-read`;
		const requestBody = JSON.stringify({ action, query });
		let response: Response | undefined;
		let lastError: unknown;

		// Limit concurrency because the self-hosted Edge/PostgREST stack is shared
		// by every dashboard widget. Retry only one transient failure; auth errors
		// must return immediately and never be hidden as an empty data set.
		for (let attempt = 0; attempt < 2; attempt += 1) {
			const controller = new AbortController();
			const timeout = window.setTimeout(() => controller.abort(), 8_000);
			try {
				response = await fetch(endpoint, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Accept: "application/json",
						apikey: publishableKey,
						Authorization: `Bearer ${token}`,
						"x-yumi-session-token": token,
					},
					cache: "no-store",
					signal: controller.signal,
					body: requestBody,
				});
				if (response.ok || response.status < 500 || attempt === 1) break;
			} catch (error) {
				lastError = error;
				if (attempt === 1) throw error;
			} finally {
				window.clearTimeout(timeout);
			}
			if (attempt === 0) await new Promise((resolve) => window.setTimeout(resolve, 300));
		}

		if (!response) throw lastError instanceof Error ? lastError : new Error("Protected read failed");
		const responseText = await response.text();
		let body: any;
		try { body = responseText ? JSON.parse(responseText) : null; } catch { body = null; }
		if (!response.ok) throw new Error(body?.error?.message ?? body?.error ?? `Protected read failed (${response.status})`);
		if (!body || body.success !== true || !Array.isArray(body.data)) throw new Error("Protected read returned an invalid response");
		return body.data as T[];
	} finally {
		releaseProtectedReadSlot();
	}
}
