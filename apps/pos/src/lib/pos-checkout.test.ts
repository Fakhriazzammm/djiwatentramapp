import { describe, expect, it } from "bun:test";
import {
	createCheckoutDraft,
	createCustomerInfo,
	parseCheckoutStorage,
	reconcileAssignments,
	validateCheckout,
	canPrintCheckoutResult,
} from "./pos-checkout";

describe("checkout draft recovery", () => {
	it("restores customer, payment, cash, phase and team after refresh", () => {
		const customerInfo = {
			...createCustomerInfo(),
			name: "Ayu",
			orderType: "online",
			tableNumber: "4",
			notes: "Tanpa es",
			platform: "grab",
			email: "ayu@example.com",
		};
		const checkout = {
			...createCheckoutDraft(),
			step: "payment",
			paymentMethod: "tunai",
			cashReceived: 50000,
			assignments: [
				{
					groupType: "barista",
					assignedTo: "Ani",
					items: [
						{
							productId: "tea",
							productName: "Teh",
							quantity: 1,
							assignedTo: "Ani",
						},
					],
				},
			],
		};
		expect(
			parseCheckoutStorage(
				JSON.stringify({ version: 1, customerInfo, checkout }),
			),
		).toEqual({ customerInfo, checkout });
	});
	it("invalid or old storage falls back without breaking checkout", () => {
		for (const value of [
			null,
			"{",
			"null",
			'{"version":2}',
			'{"version":1,"customerInfo":null,"checkout":null}',
		]) {
			expect(parseCheckoutStorage(value)).toEqual({
				customerInfo: createCustomerInfo(),
				checkout: createCheckoutDraft(),
			});
		}
	});
	it("rejects malformed cash, result and assignments from storage", () => {
		const restored = parseCheckoutStorage(
			JSON.stringify({
				version: 1,
				customerInfo: { name: 4, platformCommission: -1 },
				checkout: {
					step: "result",
					cashReceived: -4,
					assignments: [null, { groupType: "bogus" }],
					result: { status: "paid", total: -1 },
				},
			}),
		);
		expect(restored.customerInfo.name).toBe("");
		expect(restored.checkout.cashReceived).toBe("");
		expect(restored.checkout.step).toBe("order");
		expect(restored.checkout.assignments).toEqual([]);
		expect(restored.checkout.result).toBe(null);
	});
	it("fresh order has no previous customer, cash, payment, team or receipt", () => {
		expect(createCheckoutDraft()).toEqual({
			step: "order",
			paymentMethod: "",
			cashReceived: "",
			autoComplete: false,
			assignments: [],
			result: null,
		});
		expect(createCustomerInfo().name).toBe("");
	});
	it("cart edits preserve assignments by product and variant and remove deleted items", () => {
		const groups = [
			{
				groupType: "barista" as const,
				assignedTo: "Ani",
				items: [
					{
						productId: "tea",
						productName: "Teh",
						variant: "hot",
						quantity: 1,
						assignedTo: "Budi",
					},
					{
						productId: "gone",
						productName: "Gone",
						quantity: 1,
						assignedTo: "Ani",
					},
				],
			},
		];
		const next = reconcileAssignments(
			[
				{ productId: "tea", name: "Teh", variant: "hot", quantity: 3 },
				{ productId: "tea", name: "Teh", variant: "cold", quantity: 1 },
			],
			[],
			groups,
		);
		expect(
			next[0].items.map((i) => [i.variant, i.quantity, i.assignedTo]),
		).toEqual([
			["hot", 3, "Budi"],
			["cold", 1, "Ani"],
		]);
	});
	it("retains the result snapshot on refresh after the parent clears the cart", () => {
		for (const status of ["paid", "pending", "queued"] as const) {
			const result = {
				orderId: status === "queued" ? null : "created-order",
				status,
				total: 30000,
				paymentMethod: "cash",
				cashReceived: 50000,
				changeAmount: 20000,
			};
			const restored = parseCheckoutStorage(
				JSON.stringify({
					version: 1,
					customerInfo: createCustomerInfo(),
					checkout: { ...createCheckoutDraft(), step: "result", result },
				}),
			);
			expect(restored.checkout.result).toEqual(result);
			expect(restored.checkout.step).toBe("result");
			expect(restored.checkout.cashReceived).toBe("");
		}
	});
	it("preserves a chosen staff member when category data arrives after the draft", () => {
		const previous = [
			{
				groupType: "barista" as const,
				assignedTo: "",
				items: [
					{
						productId: "food",
						productName: "Mie",
						quantity: 1,
						assignedTo: "Ani",
					},
				],
			},
		];
		const next = reconcileAssignments(
			[{ productId: "food", name: "Mie", quantity: 2, category: "meals" }],
			[{ _id: "meals", track: "kitchen" }],
			previous,
		);
		expect(next[0].groupType).toBe("kitchen");
		expect(next[0].items[0].assignedTo).toBe("Ani");
	});
});

describe("checkout submission validation", () => {
	const base = {
		itemCount: 1,
		total: 30000,
		paymentMethod: "tunai",
		cashReceived: "" as number | "",
		isShiftOpen: true,
		customer: createCustomerInfo(),
	};
	it("requires cash, rejects shortage and accepts exact cash", () => {
		expect(validateCheckout(base)).toContain("uang");
		expect(validateCheckout({ ...base, cashReceived: 20000 })).toContain(
			"kurang",
		);
		expect(validateCheckout({ ...base, cashReceived: 30000 })).toBe(null);
		expect(validateCheckout({ ...base, cashReceived: NaN }) === null).toBe(
			false,
		);
	});
	it("rejects empty cart, closed shift and missing method", () => {
		expect(validateCheckout({ ...base, itemCount: 0 }) === null).toBe(false);
		expect(validateCheckout({ ...base, isShiftOpen: false }) === null).toBe(
			false,
		);
		expect(validateCheckout({ ...base, paymentMethod: "" }) === null).toBe(
			false,
		);
	});
	it("dynamic QRIS requires name email and phone; manual QRIS does not", () => {
		expect(
			validateCheckout({ ...base, paymentMethod: "qris_mayar" }) === null,
		).toBe(false);
		expect(
			validateCheckout({
				...base,
				paymentMethod: "qris_mayar",
				customer: {
					...base.customer,
					name: "Ayu",
					email: "bad",
					phone: "081234567890",
				},
			}) === null,
		).toBe(false);
		expect(
			validateCheckout({
				...base,
				paymentMethod: "qris_mayar",
				customer: {
					...base.customer,
					name: "Ayu",
					email: "ayu@example.com",
					phone: "081234567890",
				},
			}),
		).toBe(null);
		expect(validateCheckout({ ...base, paymentMethod: "qris" })).toBe(null);
	});
	it("never prints a previous order or queued order", () => {
		const result = {
			orderId: "new",
			status: "paid" as const,
			total: 30000,
			paymentMethod: "tunai",
		};
		expect(canPrintCheckoutResult(result, "old")).toBe(false);
		expect(canPrintCheckoutResult(result, "new")).toBe(true);
		expect(
			canPrintCheckoutResult(
				{ ...result, status: "queued", orderId: null },
				"old",
			),
		).toBe(false);
		expect(canPrintCheckoutResult(null, "old")).toBe(false);
	});
});
