import { describe, expect, test } from "bun:test";
import { getDashboardLoadState } from "./dashboard-load-state";

describe("dashboard load state", () => {
	test("does not keep an errored dashboard in an endless skeleton", () => {
		expect(getDashboardLoadState("error", null)).toBe("error");
	});

	test("keeps ready data visible while a refresh is in flight", () => {
		expect(getDashboardLoadState("loading", { todayOrders: 1 })).toBe("ready");
	});
});
