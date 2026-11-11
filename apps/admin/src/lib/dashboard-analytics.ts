import { getWibCalendarDate, wibMidnight, type DashboardRange } from "./dashboard-periods";
import { DAY_MS, WIB_OFFSET_MS } from "./wib-utils";

// Tipe payload dari RPC admin_* (lihat supabase/migrations/20261111100000_admin_command_center.sql)
// dan helper murni untuk agregasi tampilan. Tidak ada akses jaringan di sini.

export type SalesRangeRow = { key: string; orders: number; revenue: number };
export type TrendPoint = { bucket: number; orders: number; revenue: number };
export type HeatCell = { dow: number; hour: number; orders: number; revenue: number };
export type HeatmapPayload = { sampleDays: number; cells: HeatCell[] };

export type RecentOrderRow = {
	id: string;
	orderNumber: string | null;
	dailyReceiptNo: number | null;
	status: string;
	totalAmount: number;
	createdAt: number;
	orderChannel: string | null;
	paymentMethod: string | null;
	orderType: string | null;
	brandSlug: string | null;
	businessUnit: string | null;
	sourceApp: string | null;
	source: string | null;
	itemCount: number;
};

export type BreakdownPayload = {
	statusCounts: Record<string, number>;
	methods: Array<{ key: string; orders: number; revenue: number }>;
	channels: Array<{ key: string; orders: number; revenue: number }>;
	products: Array<{ name: string; quantity: number; revenue: number }>;
	recentOrders: RecentOrderRow[];
};

export type CashflowPayload = { income: number; expense: number; net: number };

export type DjiwaPayPayload = {
	volume: number;
	transactions: number;
	statusCounts: Record<string, number>;
	channels: Array<{ key: string; orders: number; revenue: number }>;
	activeWallets: number;
	availableBalance: number;
	heldBalance: number;
	ledger: Array<{
		id: number;
		direction: "credit" | "debit";
		amount: number;
		transactionType: string;
		note: string | null;
		createdAt: number;
	}>;
};

export type AttendanceStatus = "working" | "done" | "leave" | "absent";
export type AttendancePayload = {
	activeCashierShift?: { id: string; shiftName: string | null; cashierName: string | null; startTime: number | null } | null;
	total: number;
	present: number;
	staff: Array<{
		userId: string;
		name: string;
		role: string | null;
		status: AttendanceStatus;
		checkInAt: number | null;
		checkOutAt: number | null;
		leaveType: string | null;
	}>;
};

export type FeedEvent = {
	at: number;
	kind: "order" | "attendance" | "wallet" | "donation" | "booking";
	app: string;
	status: string;
	name: string;
	amount: number;
	detail: string | null;
};

export type EcosystemCard = {
	key: string;
	name: string;
	domain: string;
	value: number;
	valueKind: "count" | "rupiah";
	label: string;
	status: "ok" | "warn";
	spark: number[];
};

export type WebTrafficPayload = {
	views: number;
	visitors: number;
	sources: Record<string, number>;
	devices: Record<string, number>;
	topPaths: Array<{ path: string; views: number }>;
	trackingSince: number | null;
};

export type ActionsPayload = {
	stockCritical: number;
	stockItems: Array<{ name: string; quantity: number; threshold: number }>;
	pendingOverFifteen: number;
};

export type Metric = "orders" | "revenue";

export const DOW_LABELS: Record<number, string> = { 1: "Sen", 2: "Sel", 3: "Rab", 4: "Kam", 5: "Jum", 6: "Sab", 7: "Min" };
export const DOW_LONG: Record<number, string> = {
	1: "Senin",
	2: "Selasa",
	3: "Rabu",
	4: "Kamis",
	5: "Jumat",
	6: "Sabtu",
	7: "Minggu",
};
const MONTH_SHORT_ID = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const MAX_TREND_BUCKETS = 400;

export const SETTLED_STATUSES = ["paid", "completed"] as const;

export function formatRupiah(value: number): string {
	const rounded = Math.round(Number.isFinite(value) ? value : 0);
	return `Rp ${rounded.toLocaleString("id-ID")}`;
}

export function formatCompactRupiah(value: number): string {
	if (value >= 1_000_000_000) return `Rp ${(value / 1_000_000_000).toFixed(1).replace(".", ",")} M`;
	if (value >= 1_000_000) return `Rp ${(value / 1_000_000).toFixed(1).replace(".", ",")} jt`;
	if (value >= 1_000) return `Rp ${Math.round(value / 1_000)} rb`;
	return formatRupiah(value);
}

/** Persentase perubahan; null bila pembanding nol (ditampilkan sebagai "baru"). */
export function percentChange(current: number, previous: number): number | null {
	if (!previous) return null;
	return Math.round(((current - previous) / previous) * 100);
}

export function formatDelta(current: number, previous: number): { text: string; direction: "up" | "down" | "flat" | "new" } {
	const change = percentChange(current, previous);
	if (change === null) return current > 0 ? { text: "baru", direction: "new" } : { text: "—", direction: "flat" };
	if (change === 0) return { text: "0%", direction: "flat" };
	return { text: `${change > 0 ? "+" : ""}${change}%`, direction: change > 0 ? "up" : "down" };
}

function bucketLabel(bucket: number, kind: DashboardRange["trendBucket"]): string {
	const calendar = getWibCalendarDate(bucket);
	if (kind === "hour") return `${String(new Date(bucket + WIB_OFFSET_MS).getUTCHours()).padStart(2, "0")}.00`;
	if (kind === "day") return `${calendar.day} ${MONTH_SHORT_ID[calendar.month]}`;
	return `${MONTH_SHORT_ID[calendar.month]} ${String(calendar.year).slice(2)}`;
}

export type TrendSeriesPoint = { bucket: number; label: string; orders: number; revenue: number };

/**
 * Mengisi bucket kosong agar grafik tren tidak "meloncat". Hour dan day memakai
 * langkah tetap (WIB tanpa DST); month memakai kalender WIB.
 */
export function buildTrendSeries(range: DashboardRange, points: TrendPoint[], now: number = Date.now()): TrendSeriesPoint[] {
	const byBucket = new Map<number, TrendPoint>();
	for (const point of points) byBucket.set(Math.round(point.bucket), point);
	const earliest = points.length ? Math.min(...points.map((point) => Math.round(point.bucket))) : now;
	const start = range.start === 0 ? earliest : range.start;
	const end = Math.min(range.end, now + 1);
	const starts: number[] = [];

	if (range.trendBucket === "month") {
		const first = getWibCalendarDate(start);
		for (let offset = 0; starts.length < MAX_TREND_BUCKETS; offset += 1) {
			const bucket = wibMidnight(first.year, first.month + offset, 1);
			if (bucket >= end) break;
			starts.push(bucket);
		}
	} else {
		const step = range.trendBucket === "hour" ? 3_600_000 : DAY_MS;
		for (let bucket = start; bucket < end && starts.length < MAX_TREND_BUCKETS; bucket += step) starts.push(bucket);
	}

	return starts.map((bucket) => {
		const point = byBucket.get(bucket);
		return {
			bucket,
			label: bucketLabel(bucket, range.trendBucket),
			orders: point?.orders ?? 0,
			revenue: point?.revenue ?? 0,
		};
	});
}

export type HourTotal = { hour: number; orders: number; revenue: number };
export type DayTotal = { dow: number; orders: number; revenue: number };

export function buildHeatmapTotals(cells: HeatCell[]) {
	const hours: HourTotal[] = Array.from({ length: 24 }, (_, hour) => ({ hour, orders: 0, revenue: 0 }));
	const days: DayTotal[] = Array.from({ length: 7 }, (_, index) => ({ dow: index + 1, orders: 0, revenue: 0 }));
	const grid = new Map<string, HeatCell>();
	for (const cell of cells) {
		const hour = hours[cell.hour];
		const day = days[cell.dow - 1];
		if (!hour || !day) continue;
		hour.orders += cell.orders;
		hour.revenue += cell.revenue;
		day.orders += cell.orders;
		day.revenue += cell.revenue;
		grid.set(`${cell.dow}-${cell.hour}`, cell);
	}
	return { hours, days, grid };
}

export function metricValue(item: { orders: number; revenue: number }, metric: Metric): number {
	return metric === "orders" ? item.orders : item.revenue;
}

/** Jam paling ramai, urut dari tertinggi; jam tanpa transaksi dibuang. */
export function topHours(hours: HourTotal[], metric: Metric, limit = 5): HourTotal[] {
	return hours
		.filter((hour) => metricValue(hour, metric) > 0)
		.sort((left, right) => metricValue(right, metric) - metricValue(left, metric) || left.hour - right.hour)
		.slice(0, limit);
}

/** Hari paling ramai dalam minggu, urut dari tertinggi. */
export function topDays(days: DayTotal[], metric: Metric): DayTotal[] {
	return days
		.filter((day) => metricValue(day, metric) > 0)
		.sort((left, right) => metricValue(right, metric) - metricValue(left, metric) || left.dow - right.dow);
}

/** Intensitas 0..1 untuk warna sel; skala akar agar sel kecil tetap terlihat. */
export function heatIntensity(value: number, max: number): number {
	if (!max || value <= 0) return 0;
	return Math.min(1, Math.sqrt(value / max));
}

export type Confidence = "insufficient" | "daily" | "medium" | "high";

/** Tingkat keyakinan pola jam dari jumlah hari yang memiliki transaksi settled. */
export function confidenceForSampleDays(sampleDays: number): Confidence {
	if (sampleDays <= 0) return "insufficient";
	if (sampleDays < 7) return "daily";
	if (sampleDays <= 20) return "medium";
	return "high";
}

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
	insufficient: "Data belum cukup",
	daily: "Keyakinan rendah",
	medium: "Keyakinan sedang",
	high: "Keyakinan tinggi",
};
