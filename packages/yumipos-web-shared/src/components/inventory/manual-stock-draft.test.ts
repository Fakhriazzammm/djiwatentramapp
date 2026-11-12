import { describe, expect, test } from "bun:test";
import type { ManualStockItem } from "../../lib/manual-stock";
import { buildManualStockSaveInput, createManualStockDraft, isManualStockDraftDirty } from "./manual-stock-draft";

const item = (overrides: Partial<ManualStockItem> = {}): ManualStockItem => ({
	inventoryId: "inventory-1",
	name: "Air",
	mode: "availability",
	status: "unknown",
	quantity: null,
	unit: "pcs",
	updatedAt: null,
	updatedBy: null,
	...overrides,
});

describe("manual stock inline drafts", () => {
	test("prefills the current count and timestamp for editing in its table row", () => {
		expect(createManualStockDraft(item({
			mode: "count",
			status: "available",
			quantity: 4,
			unit: "pack",
			updatedAt: 123,
		}))).toEqual({
			mode: "count",
			status: "available",
			quantity: "4",
			unit: "pack",
			note: "",
			expectedUpdatedAt: 123,
		});
	});

	test("builds a count save payload from the inline fields", () => {
		const row = item({ updatedAt: 123 });
		const draft = { ...createManualStockDraft(row), mode: "count" as const, quantity: "0", unit: "kotak", note: " opname " };

		expect(buildManualStockSaveInput(row, draft)).toEqual({
			input: {
				inventoryId: "inventory-1",
				mode: "count",
				status: "out",
				quantity: 0,
				unit: "kotak",
				note: "opname",
				expectedUpdatedAt: 123,
			},
			error: null,
		});
	});

	test("keeps availability mode separate from quantity counts", () => {
		const row = item({ updatedAt: 321 });
		const draft = { ...createManualStockDraft(row), status: "out" as const, quantity: "12" };

		expect(buildManualStockSaveInput(row, draft)).toEqual({
			input: {
				inventoryId: "inventory-1",
				mode: "availability",
				status: "out",
				quantity: null,
				unit: "pcs",
				note: undefined,
				expectedUpdatedAt: 321,
			},
			error: null,
		});
	});

	test("rejects non-integer counts before saving", () => {
		const row = item();
		const draft = { ...createManualStockDraft(row), mode: "count" as const, quantity: "1.5" };

		expect(buildManualStockSaveInput(row, draft)).toEqual({
			input: null,
			error: "Masukkan jumlah bilangan bulat nol atau lebih.",
		});
	});

	test("marks edited values or notes dirty so background refresh cannot overwrite them", () => {
		const row = item();
		const original = createManualStockDraft(row);

		expect(isManualStockDraftDirty(row, original)).toBe(false);
		expect(isManualStockDraftDirty(row, { ...original, status: "available" })).toBe(true);
		expect(isManualStockDraftDirty(row, { ...original, note: "checked" })).toBe(true);
	});
});
