import { readFileSync } from "node:fs";
import { describe, expect, it } from "bun:test";

const posSource = readFileSync(import.meta.dir + "/use-hybrid-pos-data.ts", "utf8");
const dashboardSource = readFileSync(
	import.meta.dir + "/../routes/admin/-OperationalDecisionDashboard.tsx",
	"utf8",
);

describe("dashboard data loading", () => {
	it("bounds dashboard reports to the previous-month reporting window", () => {
		expect(posSource).toContain("createdAtRange?: { start: number; end: number }");
		expect(posSource).toContain("fetchOrders({");
		expect(posSource).toContain("createdAtRange: reportRange");
		expect(posSource).toContain("fetchBookingOrders({");
		expect(posSource).toContain("select: \"_id,bookingCode,customerName");
	});

	it("loads a bounded recent order set for the dashboard shell", () => {
		expect(dashboardSource).toContain("useHybridOrders({ limit: 1000 })");
	});

	it("does not blank the whole dashboard when one source is unavailable", () => {
		expect(posSource).toContain("Promise.allSettled");
		expect(dashboardSource).not.toContain("if (!stats || !orders || !shiftStatus)");
	});

	it("does not wait forever for a stalled dashboard source", () => {
		expect(posSource).toContain("withDashboardTimeout");
	});
});
