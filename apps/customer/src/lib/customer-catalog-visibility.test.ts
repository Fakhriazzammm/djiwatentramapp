import { getCustomerHiddenCategoryIds } from "@/lib/customer-catalog-visibility";

declare const describe: (name: string, fn: () => void) => void;
declare const it: (name: string, fn: () => void) => void;
declare const expect: (value: unknown) => { toBe(expected: unknown): void };

describe("customer catalog visibility", () => {
	it("hides Event, Promo, B2B, and their nested categories", () => {
		const hiddenIds = getCustomerHiddenCategoryIds([
			{ _id: "food", name: "Makanan", parentId: null },
			{ _id: "event", name: "Event", parentId: null },
			{ _id: "event-child", name: "Wedding", parentId: "event" },
			{ _id: "promo", name: "Promo", parentId: null },
			{ _id: "b2b", name: "B2B", parentId: null },
		]);

		expect([...hiddenIds].sort().join(",")).toBe("b2b,event,event-child,promo");
	});
});
