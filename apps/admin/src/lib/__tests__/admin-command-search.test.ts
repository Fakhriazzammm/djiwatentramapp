import { describe, expect, test } from "bun:test";
import { filterCommandItems, formatSyncAge, type AdminCommandItem } from "../admin-command-search";

const items: AdminCommandItem[] = [
	{ to: "/admin/finance/reports", label: "Laporan", group: "Keuangan", permission: "finance:view" },
	{ to: "/admin/orders", label: "Pesanan", group: "Utama", permission: "orders:view", keywords: ["order"] },
	{ to: "/admin/kitchen", label: "Dapur", group: "Operasional" },
];

const allowAll = () => true;

describe("filterCommandItems", () => {
	test("returns every allowed item for an empty query", () => {
		expect(filterCommandItems(items, "  ", allowAll)).toHaveLength(3);
	});

	test("matches every term against label, group and keywords", () => {
		expect(filterCommandItems(items, "order", allowAll).map((i) => i.to)).toEqual(["/admin/orders"]);
		expect(filterCommandItems(items, "keuangan laporan", allowAll).map((i) => i.to)).toEqual([
			"/admin/finance/reports",
		]);
		expect(filterCommandItems(items, "keuangan dapur", allowAll)).toEqual([]);
	});

	test("hides items the user has no permission for", () => {
		const onlyOrders = (permission?: string) => !permission || permission === "orders:view";
		expect(filterCommandItems(items, "", onlyOrders).map((i) => i.to)).toEqual(["/admin/orders", "/admin/kitchen"]);
	});
});

describe("formatSyncAge", () => {
	const now = 10_000_000;
	test("describes recent, minute and hour ages in Indonesian", () => {
		expect(formatSyncAge(now - 10_000, now)).toBe("baru saja");
		expect(formatSyncAge(now - 5 * 60_000, now)).toBe("5 menit lalu");
		expect(formatSyncAge(now - 2 * 3_600_000, now)).toBe("2 jam lalu");
	});

	test("never reports a negative age", () => {
		expect(formatSyncAge(now + 60_000, now)).toBe("baru saja");
	});
});
