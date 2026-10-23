import { describe, expect, it } from "bun:test";
import { readPosPanel, posPanelSearch, getShiftClosingTasks } from "./pos-panels";

describe("mobile panel navigation", () => {
	it("restores known panels and rejects arbitrary values", () => {
		expect(readPosPanel("?panel=cart")).toBe("cart");
		expect(readPosPanel("?panel=settings")).toBe("settings");
		expect(readPosPanel("?panel=unknown")).toBe(null);
	});
	it("keeps other search filters on opening and closing a panel", () => {
		expect(posPanelSearch("?category=coffee", "transaksi")).toEqual({ category: "coffee", panel: "transaksi" });
		expect(posPanelSearch("?category=coffee&panel=cart", null)).toEqual({ category: "coffee" });
	});
	it("only counts unfinished orders belonging to the closing shift", () => {
		const orders = [{shiftId:"a",status:"pending"},{shiftId:"a",status:"paid"},{shiftId:"a",status:"completed"},{shiftId:"b",status:"pending"}];
		expect(getShiftClosingTasks(orders, "a", 2)).toEqual({unpaid:1,inProduction:1,unsynced:2});
		expect(getShiftClosingTasks(orders, null, 0).unpaid).toBe(0);
	});
	it("recognizes the public view shift alias and does not fall back for another shift", () => {
		expect(getShiftClosingTasks([{shiftSourceId:"current",status:"pending"},{shiftSourceId:"current",status:"pending"},{shiftSourceId:"other",createdAt:200,status:"pending"}], "current", 0, 100).unpaid).toBe(2);
	});
	it("includes legacy orders from the shift window without mixing explicitly linked shifts", () => {
		expect(getShiftClosingTasks([{createdAt:200,status:"pending"},{createdAt:50,status:"pending"},{shiftId:"other",createdAt:200,status:"pending"}], "active", 0, 100).unpaid).toBe(1);
	});
});
it("recognizes persisted shift source IDs instead of counting another shift", () => {
	expect(getShiftClosingTasks([
		{shift_source_id:"current",status:"pending"},
		{raw:{shift_source_id:"other"},status:"pending",createdAt:200},
		{raw:{shift_source_id:"current"},status:"pending"},
	], "current", 0, 100).unpaid).toBe(2);
});
