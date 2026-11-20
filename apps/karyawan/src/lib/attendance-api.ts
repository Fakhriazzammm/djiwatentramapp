/** Klien untuk Edge Function `staff-attendance` (absen masuk langsung dari app). */

export type GeoPoint = { lat: number; lng: number; accuracy: number };
export type GeoResult = { ok: true; point: GeoPoint } | { ok: false; reason: "denied" | "unavailable" | "timeout" | "unsupported" };

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL ?? "https://supabase.djiwatentram.web.id"}/functions/v1/staff-attendance`;

export type Preflight = {
	success: true;
	geo: { state: "ok" | "far" | "unknown" | "inaccurate"; radius: number; distance?: number | null; accuracy?: number; configured: boolean };
	isIn: boolean;
	done: boolean;
	shift: { shift_name: string; start_time: string | null; end_time: string | null } | null;
	win: "early" | "open";
	lateMin: number;
	lateTolerance: number;
	needsLateReason: boolean;
	noSchedule: boolean;
	hasOffToday: boolean;
	hasFace: boolean;
	lockedPin: boolean;
};

export class AttendanceError extends Error {
	constructor(message: string, public code: string, public geo?: Preflight["geo"]) { super(message); }
}

function readOnce(high: boolean, timeoutMs: number): Promise<GeoResult> {
	return new Promise((resolve) => {
		navigator.geolocation.getCurrentPosition(
			(p) => resolve({ ok: true, point: { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy } }),
			(e) => resolve({ ok: false, reason: e.code === 1 ? "denied" : e.code === 3 ? "timeout" : "unavailable" }),
			{ enableHighAccuracy: high, timeout: timeoutMs, maximumAge: high ? 5_000 : 60_000 },
		);
	});
}

/** Lokasi dengan cadangan: GPS presisi dulu; bila lambat/tidak ada, pakai lokasi jaringan (cukup untuk radius toko). Ditolak = langsung berhenti. */
export async function getPosition(timeoutMs = 9000): Promise<GeoResult> {
	if (typeof navigator === "undefined" || !navigator.geolocation) return { ok: false, reason: "unsupported" };
	const first = await readOnce(true, timeoutMs);
	if (first.ok || first.reason === "denied") return first;
	return readOnce(false, timeoutMs);
}

/** Catat kegagalan sisi perangkat (lokasi/kamera/wajah) agar penyebab kegagalan absen bisa didiagnosis. Tidak pernah melempar. */
export function reportEvent(stage: string, code: string, detail?: string) {
	try {
		const token = localStorage.getItem("yumi_session_token");
		if (!token) return;
		void fetch(FN_URL, { method: "POST", keepalive: true, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY ?? "" }, body: JSON.stringify({ action: "report", stage, code, detail }) }).catch(() => undefined);
	} catch { /* abaikan */ }
}

async function call<T>(token: string | null, body: Record<string, unknown>): Promise<T> {
	if (!token) throw new AttendanceError("Sesi berakhir. Masuk lagi.", "UNAUTHORIZED");
	const res = await fetch(FN_URL, {
		method: "POST",
		headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY ?? "" },
		body: JSON.stringify(body),
	});
	const data = await res.json().catch(() => ({}));
	if (!res.ok || data?.success === false) throw new AttendanceError(data?.error?.message ?? "Gagal memproses absen", data?.error?.code ?? "ERROR", data?.geo);
	return data as T;
}

export const preflight = (token: string | null, location: GeoPoint | null) => call<Preflight>(token, { action: "preflight", location });

export type ClockInResult = { success: true; log: { timestamp: number; shiftName: string; method: "face" | "pin"; distance: number | null; lateMin: number; onTime: boolean; penaltyAmount?: number; reported?: boolean } };
export const clockIn = (token: string | null, p: { location: GeoPoint | null; method: "face" | "pin"; pin?: string; faceDescriptor?: number[]; photo?: string | null; lateReason?: string }) =>
	call<ClockInResult>(token, { action: "clockIn", ...p });

export const enrollFace = (token: string | null, p: { faceDescriptor: number[]; pin: string }) => call<{ success: true }>(token, { action: "enrollFace", ...p });
