import { describe, expect, it } from "bun:test";
import { buildDashboardRange } from "./dashboard-periods";
import {
	buildHeatmapTotals,
	buildTrendSeries,
	confidenceForSampleDays,
	formatDelta,
	heatIntensity,
	topDays,
	topHours,
	type HeatCell,
} from "./dashboard-analytics";

const NOW = Date.parse("2026-11-11T10:00:00+07:00");
const wib = (iso: string) => Date.parse(`${iso}T00:00:00+07:00`);

describe("buildTrendSeries", () => {
	it("hari ini menghasilkan 24 bucket per jam dan mengisi jam kosong dengan nol", () => {
		const range = buildDashboardRange("today", NOW);
		const series = buildTrendSeries(range, [{ bucket: wib("2026-11-11") + 18 * 3_600_000, orders: 3, revenue: 90_000 }], NOW);
		// Hanya jam yang sudah lewat (sampai "sekarang" pukul 10.00 WIB) yang ditampilkan.
		expect(series.length).toBe(11);
		expect(series[0].label).toBe("00.00");
		expect(series[0].orders).toBe(0);
		expect(series.some((point) => point.label === "18.00")).toBe(false);
	});

	it("7 hari memakai bucket harian dan tidak melewati hari ini", () => {
		const range = buildDashboardRange("this_week", NOW);
		const series = buildTrendSeries(range, [{ bucket: wib("2026-11-10"), orders: 2, revenue: 50_000 }], NOW);
		expect(series.map((point) => point.label)).toEqual([
			"9 Nov",
			"10 Nov",
			"11 Nov",
		]);
		expect(series[1].revenue).toBe(50_000);
	});

	it("periode panjang memakai bucket bulanan dengan kalender WIB", () => {
		const range = buildDashboardRange("last_3_months", NOW);
		const series = buildTrendSeries(range, [{ bucket: wib("2026-10-01"), orders: 10, revenue: 500_000 }], NOW);
		expect(series.map((point) => point.label)).toEqual(["Sep 26", "Okt 26", "Nov 26"]);
		expect(series[1].orders).toBe(10);
	});

	it("'Semua' dimulai dari transaksi paling awal, bukan tahun 1970", () => {
		const range = buildDashboardRange("all", NOW);
		const series = buildTrendSeries(range, [{ bucket: wib("2026-09-01"), orders: 1, revenue: 1000 }], NOW);
		expect(series[0].label).toBe("Sep 26");
		expect(series.at(-1)?.label).toBe("Nov 26");
	});
});

describe("heatmap aggregation", () => {
	const cells: HeatCell[] = [
		{ dow: 1, hour: 18, orders: 5, revenue: 300_000 },
		{ dow: 2, hour: 18, orders: 4, revenue: 200_000 },
		{ dow: 2, hour: 12, orders: 7, revenue: 150_000 },
		{ dow: 6, hour: 19, orders: 9, revenue: 400_000 },
	];

	it("menjumlahkan total per jam dan per hari", () => {
		const { hours, days, grid } = buildHeatmapTotals(cells);
		expect(hours[18]).toEqual({ hour: 18, orders: 9, revenue: 500_000 });
		expect(days[1]).toEqual({ dow: 2, orders: 11, revenue: 350_000 });
		expect(grid.get("6-19")?.orders).toBe(9);
	});

	it("jam teratas urut dari yang paling ramai dan membuang jam kosong", () => {
		const { hours } = buildHeatmapTotals(cells);
		// Jam 18 dan 19 sama-sama 9 order; seri diurutkan jam menaik.
		expect(topHours(hours, "orders", 3).map((hour) => hour.hour)).toEqual([18, 19, 12]);
		expect(topHours(hours, "revenue", 1)[0].hour).toBe(18);
	});

	it("hari teratas dalam minggu urut sesuai metrik", () => {
		const { days } = buildHeatmapTotals(cells);
		// Selasa 11 order, Sabtu 9, Senin 5. Omzet: Sabtu 400rb, Selasa 350rb, Senin 300rb.
		expect(topDays(days, "orders").map((day) => day.dow)).toEqual([2, 6, 1]);
		expect(topDays(days, "revenue").map((day) => day.dow)).toEqual([6, 2, 1]);
	});

	it("intensitas sel dan keyakinan pola", () => {
		expect(heatIntensity(0, 10)).toBe(0);
		expect(heatIntensity(10, 10)).toBe(1);
		expect(heatIntensity(2.5, 10)).toBe(0.5);
		expect(confidenceForSampleDays(0)).toBe("insufficient");
		expect(confidenceForSampleDays(3)).toBe("daily");
		expect(confidenceForSampleDays(10)).toBe("medium");
		expect(confidenceForSampleDays(30)).toBe("high");
	});
});

describe("formatDelta", () => {
	it("menampilkan selisih persen dan 'baru' bila pembanding nol", () => {
		expect(formatDelta(150, 100)).toEqual({ text: "+50%", direction: "up" });
		expect(formatDelta(50, 100)).toEqual({ text: "-50%", direction: "down" });
		expect(formatDelta(10, 0)).toEqual({ text: "baru", direction: "new" });
		expect(formatDelta(0, 0)).toEqual({ text: "—", direction: "flat" });
	});
});
