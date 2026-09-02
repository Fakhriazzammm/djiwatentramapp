import { calculateSplitBill, type SplitBillSourceItem } from "./split-bill-calculator";

declare const describe: (name: string, fn: () => void) => void;
declare const it: (name: string, fn: () => void) => void;
declare const expect: (value: unknown) => {
	toBe(expected: unknown): void;
	toEqual(expected: unknown): void;
	toContain(expected: unknown): void;
	toHaveLength(expected: number): void;
};

const items: SplitBillSourceItem[] = [
	{ id: "coffee", name: "Kopi", quantity: 2, unitPrice: 25000 },
	{ id: "cake", name: "Cake", quantity: 1, unitPrice: 30000 },
];

describe("calculateSplitBill", () => {
	it("keeps item quantity and totals balanced when assigned to friends", () => {
		const result = calculateSplitBill(items, [
			{ itemId: "coffee", person: "Saya", quantity: 1 },
			{ itemId: "coffee", person: "Rina", quantity: 1 },
			{ itemId: "cake", person: "Rina", quantity: 1 },
		]);
		expect(result.errors).toEqual([]);
		expect(result.isBalanced).toBe(true);
		expect(result.assignedTotal).toBe(80000);
		expect(result.unassignedTotal).toBe(0);
		expect(result.people.map((person) => [person.name, person.subtotal])).toEqual([["Saya", 25000], ["Rina", 55000]]);
	});

	it("shows unassigned quantity without inventing a person", () => {
		const result = calculateSplitBill(items, [{ itemId: "coffee", person: "Saya", quantity: 1 }]);
		expect(result.isBalanced).toBe(true);
		expect(result.unassigned).toHaveLength(2);
		expect(result.unassignedTotal).toBe(55000);
	});

	it("rejects assignment above source quantity", () => {
		const result = calculateSplitBill(items, [{ itemId: "coffee", person: "Saya", quantity: 3 }]);
		expect(result.isBalanced).toBe(false);
		expect(result.errors).toContain("Kopi: quantity terbagi melebihi jumlah order");
	});
});
