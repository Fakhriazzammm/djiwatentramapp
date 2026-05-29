/**
 * WIB Utility — Standar Waktu Indonesia Barat (UTC+7)
 *
 * Semua fungsi display timestamp WAJIB pakai ini, bukan raw `toLocaleString()`.
 * Ampai konsisten: frontend pake `timeZone: "Asia/Jakarta"`.
 * Untuk epoch ms (timestamp dari DB) — fungsi ini handle konversi otomatis.
 */

export const WIB_TIMEZONE = "Asia/Jakarta";
export const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;

/** Dapatkan Date object yang sudah di-shift ke WIB (untuk kalkulasi tanggal). */
export function nowWIB(): Date {
	return new Date(Date.now() + WIB_OFFSET_MS);
}

/** Hari ini sebagai string YYYY-MM-DD dalam WIB (untuk input date, filter). */
export function todayStrWIB(): string {
	const d = nowWIB();
	return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** Format tanggal WIB: "29/05/2026" */
export function formatDateWIB(timestamp: number): string {
	return new Date(timestamp).toLocaleDateString("id-ID", {
		timeZone: WIB_TIMEZONE,
	});
}

/** Format tanggal WIB: "Sabtu, 29 Mei 2026" (lengkap) */
export function formatDateFullWIB(timestamp: number): string {
	return new Date(timestamp).toLocaleDateString("id-ID", {
		weekday: "long",
		day: "numeric",
		month: "long",
		year: "numeric",
		timeZone: WIB_TIMEZONE,
	});
}

/** Format jam WIB: "14:30" */
export function formatTimeWIB(timestamp: number): string {
	return new Date(timestamp).toLocaleTimeString("id-ID", {
		hour: "2-digit",
		minute: "2-digit",
		timeZone: WIB_TIMEZONE,
	});
}

/** Format jam WIB: "14:30:45" (dengan detik) */
export function formatTimeFullWIB(timestamp: number): string {
	return new Date(timestamp).toLocaleTimeString("id-ID", {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		timeZone: WIB_TIMEZONE,
	});
}

/** Format tanggal + jam WIB: "29/05/2026 14:30" */
export function formatDateTimeWIB(timestamp: number): string {
	return new Date(timestamp).toLocaleString("id-ID", {
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
		timeZone: WIB_TIMEZONE,
	});
}

/** Format dengan weekday: "Sabtu, 29/05/2026" atau "Sab, 29 Mei" */
export function formatDayLabelWIB(timestamp: number): string {
	return new Date(timestamp).toLocaleDateString("id-ID", {
		weekday: "short",
		day: "numeric",
		month: "short",
		timeZone: WIB_TIMEZONE,
	});
}

/**
 * Dapatkan rentang hari WIB (start/end epoch ms) dari suatu timestamp.
 * Contoh: 2026-05-29 WIB = start 2026-05-28 17:00:00 UTC, end 2026-05-29 16:59:59 UTC
 */
export function getWibDayRange(referenceTime: number): { start: number; end: number } {
	const shifted = new Date(referenceTime + WIB_OFFSET_MS);
	const start =
		Date.UTC(
			shifted.getUTCFullYear(),
			shifted.getUTCMonth(),
			shifted.getUTCDate()
		) - WIB_OFFSET_MS;
	return {
		start,
		end: start + DAY_MS - 1,
	};
}

/** Cek apakah dua epoch ms berada di hari WIB yang sama. */
export function isSameDayWIB(a: number, b: number): boolean {
	const da = new Date(a + WIB_OFFSET_MS);
	const db = new Date(b + WIB_OFFSET_MS);
	return (
		da.getUTCFullYear() === db.getUTCFullYear() &&
		da.getUTCMonth() === db.getUTCMonth() &&
		da.getUTCDate() === db.getUTCDate()
	);
}

/** Dapatkan jam WIB saat ini (0-23) — untuk shift detection. */
export function getCurrentHourWIB(): number {
	return nowWIB().getUTCHours();
}

/** Dapatkan menit WIB saat ini (0-59). */
export function getCurrentMinutesWIB(): number {
	return nowWIB().getUTCMinutes();
}

/** Total menit sejak midnight WIB — untuk shift detection (misal 08:30 → 510). */
export function getCurrentTotalMinutesWIB(): number {
	const w = nowWIB();
	return w.getUTCHours() * 60 + w.getUTCMinutes();
}
