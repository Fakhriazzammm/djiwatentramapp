import { DAY_MS, WIB_OFFSET_MS } from "./wib-utils";

// Periode dashboard admin. Semua batas dihitung dalam WIB (UTC+7, tanpa DST),
// sehingga tengah malam WIB selalu sama dengan (tengah malam UTC - 7 jam).
// Konvensi minggu (Senin) dan "3/6 bulan" mengikuti use-customer-app-analytics.

export const DASHBOARD_PERIOD_KEYS = [
	"today",
	"yesterday",
	"this_week",
	"last_week",
	"this_month",
	"last_month",
	"last_3_months",
	"last_6_months",
	"all",
] as const;

export type DashboardPeriodKey = (typeof DASHBOARD_PERIOD_KEYS)[number];

export const DASHBOARD_PERIOD_OPTIONS: ReadonlyArray<{ key: DashboardPeriodKey; label: string }> = [
	{ key: "today", label: "Hari ini" },
	{ key: "yesterday", label: "Kemarin" },
	{ key: "this_week", label: "Minggu ini" },
	{ key: "last_week", label: "Minggu lalu" },
	{ key: "this_month", label: "Bulan ini" },
	{ key: "last_month", label: "Bulan lalu" },
	{ key: "last_3_months", label: "3 bulan terakhir" },
	{ key: "last_6_months", label: "6 bulan terakhir" },
	{ key: "all", label: "Semua" },
];

export type TrendBucket = "hour" | "day" | "month";

export type DashboardRange = {
	key: DashboardPeriodKey;
	label: string;
	/** Batas awal inklusif, epoch ms (tengah malam WIB). */
	start: number;
	/** Batas akhir eksklusif, epoch ms. */
	end: number;
	/** Periode pembanding dengan panjang yang sama; null untuk "Semua". */
	previous: { start: number; end: number } | null;
	/** Jumlah hari yang tercakup; null untuk "Semua". */
	days: number | null;
	trendBucket: TrendBucket;
};

export type WibCalendarDate = {
	year: number;
	month: number;
	day: number;
	/** 1 = Senin ... 7 = Minggu (ISO). */
	isoDow: number;
};

const MONTH_SHORT_ID = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"] as const;

export function getWibCalendarDate(now: number): WibCalendarDate {
	const shifted = new Date(now + WIB_OFFSET_MS);
	const weekday = shifted.getUTCDay();
	return {
		year: shifted.getUTCFullYear(),
		month: shifted.getUTCMonth(),
		day: shifted.getUTCDate(),
		isoDow: weekday === 0 ? 7 : weekday,
	};
}

/** Tengah malam WIB untuk tanggal kalender. Date.UTC menormalkan bulan/hari di luar batas. */
export function wibMidnight(year: number, month: number, day: number): number {
	return Date.UTC(year, month, day) - WIB_OFFSET_MS;
}

function chooseTrendBucket(days: number | null): TrendBucket {
	if (days === null) return "month";
	if (days <= 1) return "hour";
	if (days <= 62) return "day";
	return "month";
}

function makeRange(
	key: DashboardPeriodKey,
	label: string,
	start: number,
	end: number,
	previous: { start: number; end: number } | null,
): DashboardRange {
	const days = Math.round((end - start) / DAY_MS);
	return { key, label, start, end, previous, days, trendBucket: chooseTrendBucket(days) };
}

export function getDashboardPeriodLabel(key: DashboardPeriodKey): string {
	return DASHBOARD_PERIOD_OPTIONS.find((option) => option.key === key)?.label ?? key;
}

export function isDashboardPeriodKey(value: unknown): value is DashboardPeriodKey {
	return typeof value === "string" && (DASHBOARD_PERIOD_KEYS as readonly string[]).includes(value);
}

/** Membangun rentang periode dan pembandingnya untuk waktu `now` (epoch ms). */
export function buildDashboardRange(key: DashboardPeriodKey, now: number = Date.now()): DashboardRange {
	const { year, month, day, isoDow } = getWibCalendarDate(now);
	const label = getDashboardPeriodLabel(key);
	const dayAt = (offset: number) => wibMidnight(year, month, day + offset);
	const monthAt = (offset: number) => wibMidnight(year, month + offset, 1);
	const weekStart = dayAt(1 - isoDow);

	switch (key) {
		case "today":
			return makeRange(key, label, dayAt(0), dayAt(1), { start: dayAt(-1), end: dayAt(0) });
		case "yesterday":
			return makeRange(key, label, dayAt(-1), dayAt(0), { start: dayAt(-2), end: dayAt(-1) });
		case "this_week":
			return makeRange(key, label, weekStart, weekStart + 7 * DAY_MS, {
				start: weekStart - 7 * DAY_MS,
				end: weekStart,
			});
		case "last_week":
			return makeRange(key, label, weekStart - 7 * DAY_MS, weekStart, {
				start: weekStart - 14 * DAY_MS,
				end: weekStart - 7 * DAY_MS,
			});
		case "this_month":
			return makeRange(key, label, monthAt(0), monthAt(1), { start: monthAt(-1), end: monthAt(0) });
		case "last_month":
			return makeRange(key, label, monthAt(-1), monthAt(0), { start: monthAt(-2), end: monthAt(-1) });
		case "last_3_months":
			return makeRange(key, label, monthAt(-2), monthAt(1), { start: monthAt(-5), end: monthAt(-2) });
		case "last_6_months":
			return makeRange(key, label, monthAt(-5), monthAt(1), { start: monthAt(-11), end: monthAt(-5) });
		case "all":
			// Batas awal 0 mencakup seluruh data sejak awal; batas akhir melewati "sekarang"
			// agar transaksi yang baru masuk tetap terhitung.
			return { key, label, start: 0, end: now + DAY_MS, previous: null, days: null, trendBucket: "month" };
	}
}

/** Enam periode untuk kartu "Perbandingan periode" (tidak mengikuti filter utama). */
export function getComparisonRanges(now: number = Date.now()): DashboardRange[] {
	return (["today", "yesterday", "this_week", "last_week", "this_month", "last_month"] as const).map((key) =>
		buildDashboardRange(key, now),
	);
}

/** Teks tanggal untuk header, mis. "2 Nov – 11 Nov 2026". */
export function formatDashboardRangeText(range: DashboardRange): string {
	if (range.key === "all") return "Sejak data pertama";
	const start = getWibCalendarDate(range.start);
	const last = getWibCalendarDate(range.end - 1);
	const startText = `${start.day} ${MONTH_SHORT_ID[start.month]}`;
	const endText = `${last.day} ${MONTH_SHORT_ID[last.month]} ${last.year}`;
	if (start.year === last.year && start.month === last.month && start.day === last.day) return endText;
	return `${startText}${start.year !== last.year ? ` ${start.year}` : ""} – ${endText}`;
}
