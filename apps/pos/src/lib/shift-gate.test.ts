import { describe, expect, it } from "vitest";
import type { ShiftOpnameMaterial } from "@djiwaapps/web-shared/lib/manual-stock";
import { buildMenuCheckItems, buildOpnameSubmitItems, opnameFlagged, opnameRowDone, opnameSummary } from "./shift-gate";

const count = (over: Partial<ShiftOpnameMaterial> = {}): ShiftOpnameMaterial => ({ inventoryId: "a", name: "Susu", group: "bar", mode: "count", status: "available", quantity: 10, unit: "botol", updatedAt: 1, ...over });
const onoff = (over: Partial<ShiftOpnameMaterial> = {}): ShiftOpnameMaterial => ({ inventoryId: "b", name: "Es Batu", group: "bar", mode: "availability", status: "unknown", quantity: null, unit: "pcs", updatedAt: null, ...over });

describe("shift gate", () => {
	it("menandai selisih lebih dari 20% dari catatan terakhir", () => {
		expect(opnameFlagged(count(), { quantity: 7 })).toBe(true);
		expect(opnameFlagged(count(), { quantity: 8 })).toBe(false);
		expect(opnameFlagged(count({ quantity: null }), { quantity: 3 })).toBe(false);
	});
	it("baris dianggap selesai hanya bila sudah diisi", () => {
		expect(opnameRowDone(onoff(), undefined)).toBe(false);
		expect(opnameRowDone(onoff(), { status: "out" })).toBe(true);
		expect(opnameRowDone(count(), { quantity: 0 })).toBe(true);
	});
	it("meringkas dan membentuk data kirim", () => {
		const rows = [count(), onoff()];
		const entries = { a: { quantity: 0 }, b: { status: "available" as const } };
		expect(opnameSummary(rows, entries)).toMatchObject({ done: 2, out: 1, flagged: 1, complete: true });
		const items = buildOpnameSubmitItems(rows, entries, { a: " habis dipakai " });
		expect(items[0]).toMatchObject({ status: "out", quantity: 0, flagged: true, note: "habis dipakai" });
		expect(items[1]).toMatchObject({ status: "available", quantity: null });
	});
	it("memilih menu bar dan kitchen saja", () => {
		const categories = [{ _id: "1", name: "Bar" }, { _id: "2", name: "Kopi", parentId: "1" }, { _id: "3", name: "Merchandise" }];
		const products = [{ _id: "p1", name: "Latte", categoryId: "2", isAvailable: false }, { _id: "p2", name: "Kaos", categoryId: "3" }];
		expect(buildMenuCheckItems(products, categories)).toEqual([{ id: "p1", name: "Latte", group: "Kopi", wasAvailable: false }]);
	});
});
