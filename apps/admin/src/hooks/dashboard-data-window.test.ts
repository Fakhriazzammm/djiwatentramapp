import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "bun:test";

const read = (relative: string) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

const posSource = read("./use-hybrid-pos-data.ts");
const overviewSource = read("./use-admin-overview.ts");
const protectedReadSource = read("../lib/admin-protected-read.ts");
const commandCenterSource = read("../routes/admin/-dashboard/CommandCenter.tsx");

describe("dashboard data loading", () => {
	it("keeps the shared POS report windows bounded for the other admin pages", () => {
		expect(posSource).toContain("createdAtRange?: { start: number; end: number }");
		expect(posSource).toContain("fetchOrders({");
		expect(posSource).toContain("createdAtRange: reportRange");
		expect(posSource).toContain("fetchBookingOrders({");
		expect(posSource).toContain('select: "_id,bookingCode,customerName');
	});

	it("reads server-side aggregates instead of pulling recent orders into the browser", () => {
		expect(commandCenterSource.includes("useHybridOrders")).toBe(false);
		expect(overviewSource).toContain("adminProtectedRpc");
		expect(overviewSource.includes("limit: 1000")).toBe(false);
	});

	it("does not blank the whole dashboard when one source is unavailable", () => {
		expect(overviewSource).toContain("Promise.all");
		expect(overviewSource).toContain("settle(");
		expect(commandCenterSource.includes("if (!stats || !orders || !shiftStatus)")).toBe(false);
	});

	it("does not wait forever for a stalled dashboard source", () => {
		expect(posSource).toContain("withDashboardTimeout");
		expect(protectedReadSource).toContain("controller.abort()");
	});
});
