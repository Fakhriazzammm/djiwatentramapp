import { describe, expect, it } from "bun:test";
import { getCriticalDashboardReadFailure } from "./dashboard-data-integrity";

const ready = {
	orders: "fulfilled",
	booking: "fulfilled",
	products: "fulfilled",
	inventory: "fulfilled",
	shifts: "fulfilled",
	finance: "fulfilled",
} as const;

describe("dashboard data integrity", () => {
	it("rejects dashboard stats when the order read fails instead of showing zero", () => {
		expect(getCriticalDashboardReadFailure({ ...ready, orders: "rejected" })).toContain("belum dapat dimuat");
	});

	it("keeps dashboard stats usable when an optional source fails", () => {
		expect(getCriticalDashboardReadFailure({ ...ready, inventory: "rejected" })).toBeNull();
	});
});
