/**
 * Masuk dengan Google untuk karyawan & internal (Better Auth → sesi Yumi).
 * Server: apps/auth-server/src/staff-google.ts. Cookie sesi Better Auth ada di djiwatentram.web.id,
 * jadi semua panggilan memakai origin itu dengan `credentials: "include"`.
 */

const AUTH_ORIGIN = "https://djiwatentram.web.id";
const BASE = `${AUTH_ORIGIN}/api/auth/staff-google`;
const INTENT_KEY = "kx_google_intent";
const NEXT_KEY = "kx_google_next";

export type GoogleIntent = "login" | "register" | "link";
export type GoogleSessionResult =
	| { authenticated: false }
	| { authenticated: true; linked: false; ambiguous?: boolean; profile: { email: string; name: string; picture: string | null } }
	| { authenticated: true; linked: true; autoLinked?: boolean; token: string; expiresAt: number; user: { _id: string; name: string; slug?: string }; profile: { email: string; name: string; picture: string | null } };

export class GoogleAuthError extends Error {
	constructor(message: string, public code: string) { super(message); }
}

async function post<T>(path: string, body: Record<string, unknown> = {}): Promise<T> {
	const res = await fetch(`${BASE}/${path}`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
	const data = await res.json().catch(() => ({}));
	if (!res.ok || data?.success === false) throw new GoogleAuthError(data?.message ?? "Gagal memproses login Google", data?.error ?? "ERROR");
	return data as T;
}

/** Mulai login Google: pindah halaman penuh ke server, lalu kembali ke `/auth/google` di app ini. */
/** `next`: halaman tujuan setelah masuk (mis. "/menu" untuk kasir). */
export function startGoogleLogin(intent: GoogleIntent = "login", next?: string) {
	try { sessionStorage.setItem(INTENT_KEY, intent); if (next) sessionStorage.setItem(NEXT_KEY, next); else sessionStorage.removeItem(NEXT_KEY); } catch { /* abaikan */ }
	window.location.assign(`${BASE}/start?to=${encodeURIComponent(window.location.origin)}`);
}

export function readGoogleIntent(): GoogleIntent {
	try { return (sessionStorage.getItem(INTENT_KEY) as GoogleIntent) || "login"; } catch { return "login"; }
}
export function clearGoogleIntent() { try { sessionStorage.removeItem(INTENT_KEY); } catch { /* abaikan */ } }
export function readGoogleNext(fallback: string): string { try { const n = sessionStorage.getItem(NEXT_KEY); sessionStorage.removeItem(NEXT_KEY); return n && n.startsWith("/") ? n : fallback; } catch { return fallback; } }

export const getGoogleSession = () => post<GoogleSessionResult & { success: true }>("session");

export const linkGoogle = (p: { userId: string; pin: string } | { yumiToken: string }) =>
	post<{ success: true; linked: true; token: string; expiresAt: number; user: { _id: string; name: string; slug?: string } }>("link", p);

/** Apakah akun karyawan (sesi Yumi) ini sudah terhubung ke Google? */
export const getGoogleLinkStatus = (yumiToken: string) => post<{ success: true; linked: boolean; email?: string | null }>("status", { yumiToken });
