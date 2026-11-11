import { describe, expect, it } from "bun:test";
import {
	buildDashboardRange,
	formatDashboardRangeText,
	getComparisonRanges,
	getWibCalendarDate,
	isDashboardPeriodKey,
	wibMidnight,
} from "./dashboard-periods";
import { DAY_MS } from "./wib-utils";

// Rabu 11 Nov 2026, 10.00 WIB.
const NOW = Date.parse("2026-11-11T10:00:00+07:00");
const wib = (iso: string) => Date.parse(`${iso}T00:00:00+07:00`);

describe("dashboard period ranges (WIB)", () => {
	it("hari ini dan kemarin memakai tengah malam WIB", () => {
		const today = buildDashboardRange("today", NOW);
		expect(today.start).toBe(wib("2026-11-11"));
		expect(today.end).toBe(wib("2026-11-12"));
		expect(today.previous).toEqual({ start: wib("2026-11-10"), end: wib("2026-11-11") });
		expect(today.trendBucket).toBe("hour");

		const yesterday = buildDashboardRange("yesterday", NOW);
		expect(yesterday.start).toBe(wib("2026-11-10"));
		expect(yesterday.end).toBe(wib("2026-11-11"));
	});

	it("minggu dimulai Senin, termasuk saat hari ini Minggu", () => {
		const week = buildDashboardRange("this_week", NOW);
		expect(week.start).toBe(wib("2026-11-09"));
		expect(week.end).toBe(wib("2026-11-16"));
		expect(week.previous).toEqual({ start: wib("2026-11-02"), end: wib("2026-11-09") });

		const sunday = buildDashboardRange("this_week", Date.parse("2026-11-08T12:00:00+07:00"));
		expect(sunday.start).toBe(wib("2026-11-02"));
		expect(sunday.end).toBe(wib("2026-11-09"));

		const lastWeek = buildDashboardRange("last_week", NOW);
		expect(lastWeek.start).toBe(wib("2026-11-02"));
		expect(lastWeek.end).toBe(wib("2026-11-09"));
		expect(lastWeek.previous).toEqual({ start: wib("2026-10-26"), end: wib("2026-11-02") });
	});

	it("bulan ini dan bulan lalu, termasuk pergantian tahun", () => {
		const month = buildDashboardRange("this_month", NOW);
		expect(month.start).toBe(wib("2026-11-01"));
		expect(month.end).toBe(wib("2026-12-01"));

		const lastMonth = buildDashboardRange("last_month", NOW);
		expect(lastMonth.start).toBe(wib("2026-10-01"));
		expect(lastMonth.end).toBe(wib("2026-11-01"));

		const january = buildDashboardRange("last_month", Date.parse("2026-01-15T10:00:00+07:00"));
		expect(january.start).toBe(wib("2025-12-01"));
		expect(january.end).toBe(wib("2026-01-01"));
	});

	it("3 dan 6 bulan terakhir mencakup bulan berjalan dan pembanding setara", () => {
		const three = buildDashboardRange("last_3_months", NOW);
		expect(three.start).toBe(wib("2026-09-01"));
		expect(three.end).toBe(wib("2026-12-01"));
		expect(three.previous).toEqual({ start: wib("2026-06-01"), end: wib("2026-09-01") });
		expect(three.trendBucket).toBe("month");

		const six = buildDashboardRange("last_6_months", NOW);
		expect(six.start).toBe(wib("2026-06-01"));
		expect(six.end).toBe(wib("2026-12-01"));
		expect(six.previous).toEqual({ start: wib("2025-12-01"), end: wib("2026-06-01") });
	});

	it("semua data dimulai dari awal dan tidak punya pembanding", () => {
		const all = buildDashboardRange("all", NOW);
		expect(all.start).toBe(0);
		expect(all.end > NOW).toBe(true);
		expect(all.previous).toEqual(null);
		expect(all.days).toEqual(null);
		expect(all.trendBucket).toBe("month");
	});

	it("enam periode perbandingan tersedia", () => {
		const keys = getComparisonRanges(NOW).map((range) => range.key);
		expect(keys).toEqual(["today", "yesterday", "this_week", "last_week", "this_month", "last_month"]);
	});

	it("memilih ukuran bucket tren sesuai panjang periode", () => {
		expect(buildDashboardRange("yesterday", NOW).trendBucket).toBe("hour");
		expect(buildDashboardRange("this_week", NOW).trendBucket).toBe("day");
		expect(buildDashboardRange("this_month", NOW).trendBucket).toBe("day");
	});

	it("menghitung kalender WIB dengan benar di awal hari UTC", () => {
		// 00.30 WIB tanggal 12 Nov = 11 Nov 17.30 UTC; kalender WIB harus tetap 12 Nov.
		const calendar = getWibCalendarDate(Date.parse("2026-11-12T00:30:00+07:00"));
		expect(calendar).toEqual({ year: 2026, month: 10, day: 12, isoDow: 4 });
		expect(wibMidnight(2026, 10, 12)).toBe(wib("2026-11-12"));
	});

	it("teks rentang tanggal ringkas dan jelas", () => {
		expect(formatDashboardRangeText(buildDashboardRange("today", NOW))).toBe("11 Nov 2026");
		expect(formatDashboardRangeText(buildDashboardRange("this_week", NOW))).toBe("9 Nov – 15 Nov 2026");
		expect(formatDashboardRangeText(buildDashboardRange("last_month", NOW))).toBe("1 Okt – 31 Okt 2026");
		expect(formatDashboardRangeText(buildDashboardRange("all", NOW))).toBe("Sejak data pertama");
	});

	it("validasi kunci periode dari URL", () => {
		expect(isDashboardPeriodKey("last_6_months")).toBe(true);
		expect(isDashboardPeriodKey("7d")).toBe(false);
		expect(DAY_MS).toBe(86_400_000);
	});
});
