import { describe, expect, it } from "bun:test";
import {
	aggregateHourlySales,
	getPeakPoint,
	getPeakRange,
	getQuietPoint,
	getHourlyAnalysisDateRange,
	getHourlyAnalysisRange,
} from "../hourly-transaction-analysis";

const wib = (iso: string) => new Date(iso).getTime();

describe("hourly transaction analysis", () => {
	it("groups only settled orders into stable 24-hour WIB buckets", () => {
		const result = aggregateHourlySales([
			{ createdAt: wib("2026-09-24T05:30:00.000Z"), status: "paid", totalAmount: 100_000 },
			{ createdAt: wib("2026-09-24T06:15:00.000Z"), status: "completed", totalAmount: 50_000 },
			{ createdAt: wib("2026-09-24T07:00:00.000Z"), status: "pending", totalAmount: 999_000 },
		]);

		expect(result.points.length).toBe(24);
		expect({ orderCount: result.points[12].orderCount, revenue: result.points[12].revenue }).toEqual({ orderCount: 1, revenue: 100_000 });
		expect({ orderCount: result.points[13].orderCount, revenue: result.points[13].revenue }).toEqual({ orderCount: 1, revenue: 50_000 });
		expect(result.totalSettledOrders).toBe(2);
		expect(result.totalSettledRevenue).toBe(150_000);
		expect(result.sampleDays).toBe(1);
	});

	it("does not mark a sufficiently populated single-day filter as sparse", () => {
		const result = aggregateHourlySales(
			Array.from({ length: 29 }, (_, index) => ({
				createdAt: wib(`2026-09-24T${String(5 + (index % 10)).padStart(2, "0")}:00:00.000Z`),
				status: "paid",
				totalAmount: 50_000,
			})),
			getHourlyAnalysisDateRange("2026-09-24") ?? undefined,
		);

		expect(result.totalSettledOrders).toBe(29);
		expect(result.sampleDays).toBe(1);
		expect(result.isSparse).toBe(false);
	});

	it("returns peak, quiet, and contiguous active range without selecting empty hours as quiet", () => {
		const result = aggregateHourlySales([
			{ createdAt: wib("2026-09-24T04:00:00.000Z"), status: "paid", totalAmount: 100_000 },
			{ createdAt: wib("2026-09-24T05:00:00.000Z"), status: "paid", totalAmount: 200_000 },
			{ createdAt: wib("2026-09-25T05:00:00.000Z"), status: "completed", totalAmount: 50_000 },
		]);

		expect(getPeakPoint(result.points, "revenue")?.hour).toBe(12);
		expect(getQuietPoint(result.points)?.hour).toBe(11);
		expect(getPeakRange(result.points)).toEqual({ startHour: 11, endHour: 12 });
	});
	it("creates bounded WIB range for a selected calendar date and rejects invalid dates", () => {
		const range = getHourlyAnalysisDateRange("2026-09-24");
		if (!range) throw new Error("expected valid date range");
		expect(range.end - range.start + 1).toBe(24 * 60 * 60 * 1000);
		expect(new Date(range.start).toISOString()).toBe("2026-09-23T17:00:00.000Z");
		expect(getHourlyAnalysisDateRange("2026-02-30")).toBe(null);
		expect(getHourlyAnalysisDateRange("not-a-date")).toBe(null);
	});

	it("creates WIB bounded ranges for today, seven days, and thirty days", () => {
		const today = getHourlyAnalysisRange("today", wib("2026-09-24T05:00:00.000Z"));
		const sevenDays = getHourlyAnalysisRange("7d", wib("2026-09-24T05:00:00.000Z"));
		expect(today.end - today.start + 1).toBe(24 * 60 * 60 * 1000);
		expect(sevenDays.end - sevenDays.start + 1).toBe(7 * 24 * 60 * 60 * 1000);
	});
});
