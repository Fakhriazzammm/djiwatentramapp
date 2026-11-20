import type { ShiftOpnameMaterial, ShiftOpnameSubmitItem } from "@djiwaapps/web-shared/lib/manual-stock";

/** Selisih sisa terhadap catatan terakhir yang ditandai kuning dan wajib diberi catatan. */
export const OPNAME_VARIANCE_LIMIT = 0.2;

export interface MenuCheckItem {
	id: string;
	name: string;
	group: string;
	wasAvailable: boolean;
}

type AnyRecord = Record<string, any>;

/** Menu yang dicek saat buka shift: produk bar/kitchen yang masih aktif dijual, dikelompokkan per kategori. */
export function buildMenuCheckItems(products: AnyRecord[] | undefined, categories: AnyRecord[] | undefined): MenuCheckItem[] {
	if (!products?.length || !categories?.length) return [];
	const byId = new Map(categories.map((c) => [String(c._id), c]));
	const menuIds = new Set<string>(
		categories.filter((c) => /bar|kitchen/i.test(String(c.name || ""))).map((c) => String(c._id)),
	);
	let changed = true;
	while (changed) {
		changed = false;
		for (const c of categories) {
			const parent = c.parentId ? String(c.parentId) : null;
			if (parent && menuIds.has(parent) && !menuIds.has(String(c._id))) {
				menuIds.add(String(c._id));
				changed = true;
			}
		}
	}
	return products
		.filter((p) => {
			const categoryId = String(p.categoryId || "");
			const cat = byId.get(categoryId);
			return menuIds.has(categoryId) && cat?.track !== "hidden" && p.isActive !== false && p.isArchived !== true;
		})
		.map((p) => {
			const cat = byId.get(String(p.categoryId || ""));
			return { id: String(p._id), name: String(p.name || "").trim(), group: String(cat?.name || "Menu").trim(), wasAvailable: p.isAvailable !== false, menuNumber: Number(p.menuNumber ?? 0) };
		})
		.filter((p) => p.name)
		.sort((a, b) => a.group.localeCompare(b.group, "id") || a.menuNumber - b.menuNumber || a.name.localeCompare(b.name, "id"))
		.map(({ menuNumber: _n, ...item }) => item);
}

/** Pengelompokan berurutan: [[nama grup, item[]], ...]. */
export function groupBy<T>(items: T[], key: (item: T) => string): Array<[string, T[]]> {
	const map = new Map<string, T[]>();
	for (const item of items) {
		const k = key(item);
		map.set(k, [...(map.get(k) ?? []), item]);
	}
	return [...map.entries()];
}

export interface MenuCheckChange {
	productId: string;
	name: string;
	available: boolean;
	previous: boolean;
}

export function menuCheckChanges(items: MenuCheckItem[], checks: Record<string, boolean | undefined>): MenuCheckChange[] {
	return items.map((item) => ({ productId: item.id, name: item.name, available: checks[item.id] ?? item.wasAvailable, previous: item.wasAvailable }));
}

/** Isian kasir untuk satu bahan: Ada/Habis, atau jumlah sisa untuk bahan yang dihitung. */
export interface OpnameEntry {
	status?: "available" | "out";
	quantity?: number | null;
}
export type OpnameEntries = Record<string, OpnameEntry | undefined>;

export function opnameRowDone(row: ShiftOpnameMaterial, entry?: OpnameEntry): boolean {
	if (!entry) return false;
	return row.mode === "count" ? typeof entry.quantity === "number" && Number.isFinite(entry.quantity) && entry.quantity >= 0 : entry.status === "available" || entry.status === "out";
}

/** Selisih relatif (0..n) terhadap catatan terakhir, hanya untuk bahan yang dihitung dan pernah dicatat. */
export function opnameVariance(row: ShiftOpnameMaterial, entry?: OpnameEntry): number | null {
	if (row.mode !== "count" || !entry || typeof entry.quantity !== "number") return null;
	const previous = Number(row.quantity ?? 0);
	if (!(previous > 0)) return null;
	return Math.abs(entry.quantity - previous) / previous;
}

export function opnameFlagged(row: ShiftOpnameMaterial, entry?: OpnameEntry): boolean {
	const variance = opnameVariance(row, entry);
	return variance !== null && variance > OPNAME_VARIANCE_LIMIT;
}

export function opnameIsOut(row: ShiftOpnameMaterial, entry?: OpnameEntry): boolean {
	if (!entry) return false;
	return row.mode === "count" ? entry.quantity === 0 : entry.status === "out";
}

/** Isian awal "sesuai catatan terakhir"; kosong bila bahan belum pernah dicatat. */
export function opnameEntryFromLast(row: ShiftOpnameMaterial): OpnameEntry | undefined {
	if (row.mode === "count") return typeof row.quantity === "number" ? { quantity: row.quantity } : undefined;
	return row.status === "available" || row.status === "out" ? { status: row.status } : undefined;
}

export function opnameSummary(rows: ShiftOpnameMaterial[], entries: OpnameEntries) {
	let done = 0;
	let out = 0;
	let flagged = 0;
	for (const row of rows) {
		const entry = entries[row.inventoryId];
		if (opnameRowDone(row, entry)) done += 1;
		if (opnameIsOut(row, entry)) out += 1;
		if (opnameFlagged(row, entry)) flagged += 1;
	}
	return { total: rows.length, done, out, flagged, complete: rows.length === done };
}

export function buildOpnameSubmitItems(rows: ShiftOpnameMaterial[], entries: OpnameEntries, notes: Record<string, string>): ShiftOpnameSubmitItem[] {
	return rows.map((row) => {
		const entry = entries[row.inventoryId]!;
		const quantity = row.mode === "count"
			? Math.max(0, Math.round(Number(entry.quantity ?? 0)))
			: entry.status === "available" && typeof entry.quantity === "number" && Number.isFinite(entry.quantity) && entry.quantity >= 0
				? Math.round(entry.quantity)
				: null;
		const status = row.mode === "count" ? (quantity === 0 ? "out" : "available") : (entry.status as "available" | "out");
		return {
			inventoryId: row.inventoryId,
			name: row.name,
			mode: row.mode,
			status,
			quantity,
			previousQuantity: row.mode === "count" ? (row.quantity ?? null) : null,
			unit: row.unit,
			flagged: opnameFlagged(row, entry),
			note: notes[row.inventoryId]?.trim() || undefined,
		};
	});
}
