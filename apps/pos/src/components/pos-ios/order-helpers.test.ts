import { describe, expect, it } from "bun:test";
import { isCashierPending, isDeliveryOrder, orderTypeLabel, statusGroup, timeRange } from "./order-helpers";

describe("order helpers", () => {
	it("groups statuses for the order list chips", () => {
		expect(statusGroup("paid")).toBe("paid");
		expect(statusGroup("completed")).toBe("paid");
		expect(statusGroup("pending")).toBe("pending");
		expect(statusGroup("cancelled")).toBe("cancelled");
	});

	it("detects cashier-pending orders only while pending", () => {
		expect(isCashierPending({ status: "pending", paymentMethod: "cash" })).toBe(true);
		expect(isCashierPending({ status: "pending", paymentMethod: "qris" })).toBe(false);
		expect(isCashierPending({ status: "paid", paymentMethod: "cash" })).toBe(false);
	});

	it("builds the same time ranges as the old history filter", () => {
		const now = new Date(2026, 10, 13, 15, 0, 0);
		const todayStart = new Date(2026, 10, 13).getTime();
		expect(timeRange("today", now)).toEqual({ from: todayStart, to: Infinity });
		expect(timeRange("yesterday", now)).toEqual({ from: todayStart - 86_400_000, to: todayStart });
		expect(timeRange("all", now)).toEqual({ from: -Infinity, to: Infinity });
	});

	it("labels order types in Indonesian", () => {
		expect(orderTypeLabel("dine_in")).toBe("Makan di tempat");
		expect(orderTypeLabel("takeaway")).toBe("Bungkus");
		expect(orderTypeLabel(undefined)).toBe("—");
	});
	it("mengenali pesanan delivery (tidak bisa dihapus permanen)", () => {
		expect(isDeliveryOrder({ orderType: "delivery" })).toBe(true);
		expect(isDeliveryOrder({ orderType: " Delivery " })).toBe(true);
		expect(isDeliveryOrder({ orderType: "dine_in" })).toBe(false);
		expect(isDeliveryOrder(undefined)).toBe(false);
	});
});
