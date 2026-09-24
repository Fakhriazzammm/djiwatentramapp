import { DAY_MS, getWibDayRange, WIB_OFFSET_MS, WIB_TIMEZONE } from "@/lib/wib-utils";

export const SETTLED_ORDER_STATUSES = new Set(["paid", "completed"]);

export type HourlyTransactionSample = {
	createdAt: number;
	status: string | null | undefined;
	totalAmount: number;
};

export type HourlySalesPoint = {
	hour: number;
	label: string;
	orderCount: number;
	revenue: number;
};

export type HourlySalesInsight = {
	points: HourlySalesPoint[];
	sampleDays: number;
	totalSettledOrders: number;
	totalSettledRevenue: number;
	isSparse: boolean;
};

export type HourlyMetric = "orders" | "revenue";
export type HourlyPeriod = "today" | "7d" | "30d";

const hourFormatter = new Intl.DateTimeFormat("en-US", {
	timeZone: WIB_TIMEZONE,
	hour: "numeric",
	hour12: false,
});
const dateFormatter = new Intl.DateTimeFormat("en-CA", {
	timeZone: WIB_TIMEZONE,
	year: "numeric",
	month: "2-digit",
	day: "2-digit",
});

function getWibHour(timestamp: number) {
	return Number(hourFormatter.format(new Date(timestamp))) % 24;
}

function getWibDateKey(timestamp: number) {
	return dateFormatter.format(new Date(timestamp));
}

export function getHourlyAnalysisRange(period: HourlyPeriod, referenceTime = Date.now()) {
	const today = getWibDayRange(referenceTime);
	const days = period === "today" ? 1 : period === "7d" ? 7 : 30;
	return {
		start: today.start - (days - 1) * DAY_MS,
		end: today.end,
	};
}

export function getHourlyAnalysisDateRange(dateKey: string) {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null;
	const [year, month, day] = dateKey.split("-").map(Number);
	const utcDate = new Date(Date.UTC(year, month - 1, day));
	if (
		utcDate.getUTCFullYear() !== year ||
		utcDate.getUTCMonth() !== month - 1 ||
		utcDate.getUTCDate() !== day
	) return null;
	const start = utcDate.getTime() - WIB_OFFSET_MS;
	return { start, end: start + DAY_MS - 1 };
}

export function aggregateHourlySales(
	rows: HourlyTransactionSample[],
	range?: { start: number; end: number },
): HourlySalesInsight {
	const points = Array.from({ length: 24 }, (_, hour) => ({
		hour,
		label: `${String(hour).padStart(2, "0")}.00`,
		orderCount: 0,
		revenue: 0,
	}));
	const sampleDates = new Set<string>();
	let totalSettledOrders = 0;
	let totalSettledRevenue = 0;

	for (const row of rows) {
		const timestamp = Number(row.createdAt);
		const status = String(row.status ?? "").toLowerCase();
		if (!Number.isFinite(timestamp) || !SETTLED_ORDER_STATUSES.has(status)) continue;
		if (range && (timestamp < range.start || timestamp > range.end)) continue;

		const point = points[getWibHour(timestamp)];
		const revenue = Number(row.totalAmount);
		const safeRevenue = Number.isFinite(revenue) ? revenue : 0;
		point.orderCount += 1;
		point.revenue += safeRevenue;
		totalSettledOrders += 1;
		totalSettledRevenue += safeRevenue;
		sampleDates.add(getWibDateKey(timestamp));
	}

	const isSingleDayRange = range
		? range.end - range.start + 1 <= DAY_MS
		: sampleDates.size <= 1;

	return {
		points,
		sampleDays: sampleDates.size,
		totalSettledOrders,
		totalSettledRevenue,
		// A one-day filter should not be marked sparse merely because it
		// cannot contain two calendar days. For multi-day periods, coverage
		// across at least two days remains a useful confidence signal.
		isSparse: totalSettledOrders < 3 || (!isSingleDayRange && sampleDates.size < 2),
	};
}

export function getPeakPoint(points: HourlySalesPoint[], metric: HourlyMetric) {
	return points.reduce<HourlySalesPoint | null>((best, point) => {
		const value = metric === "orders" ? point.orderCount : point.revenue;
		const bestValue = best ? (metric === "orders" ? best.orderCount : best.revenue) : -1;
		return value > bestValue ? point : best;
	}, null);
}

export function getQuietPoint(points: HourlySalesPoint[]) {
	const activePoints = points.filter((point) => point.orderCount > 0);
	return activePoints.reduce<HourlySalesPoint | null>(
		(best, point) => (!best || point.orderCount < best.orderCount ? point : best),
		null,
	);
}

export function getPeakRange(points: HourlySalesPoint[]) {
	const activeHours = points.filter((point) => point.orderCount > 0).map((point) => point.hour);
	if (!activeHours.length) return null;

	let bestStart = activeHours[0];
	let bestEnd = activeHours[0];
	let currentStart = activeHours[0];
	let currentEnd = activeHours[0];
	for (const hour of activeHours.slice(1)) {
		if (hour === currentEnd + 1) {
			currentEnd = hour;
			continue;
		}
		if (currentEnd - currentStart > bestEnd - bestStart) {
			bestStart = currentStart;
			bestEnd = currentEnd;
		}
		currentStart = hour;
		currentEnd = hour;
	}
	if (currentEnd - currentStart > bestEnd - bestStart) {
		bestStart = currentStart;
		bestEnd = currentEnd;
	}
	return { startHour: bestStart, endHour: bestEnd };
}
