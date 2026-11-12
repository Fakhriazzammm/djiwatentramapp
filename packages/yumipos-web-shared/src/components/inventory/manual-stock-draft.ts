import type { ManualStockItem } from "../../lib/manual-stock";

export const MANUAL_STOCK_UNITS = ["pcs", "pack", "botol", "kotak"] as const;

export type ManualStockDraft = {
	mode: "availability" | "count";
	status: "available" | "out" | "unknown";
	quantity: string;
	unit: string;
	note: string;
	expectedUpdatedAt: number | null;
};

export type ManualStockSaveInput = {
	inventoryId: string;
	mode: ManualStockItem["mode"];
	status: ManualStockItem["status"];
	quantity: number | null;
	unit: string;
	note?: string;
	expectedUpdatedAt?: number | null;
};

export function createManualStockDraft(item: ManualStockItem): ManualStockDraft {
	return {
		mode: item.mode,
		status: item.status,
		quantity: item.quantity === null ? "" : String(item.quantity),
		unit: MANUAL_STOCK_UNITS.includes(item.unit as (typeof MANUAL_STOCK_UNITS)[number]) ? item.unit : "pcs",
		note: "",
		expectedUpdatedAt: item.updatedAt,
	};
}

export function buildManualStockSaveInput(
	item: ManualStockItem,
	draft: ManualStockDraft,
): { input: ManualStockSaveInput; error: null } | { input: null; error: string } {
	const count = Number(draft.quantity);
	if (draft.mode === "count" && (!/^\d+$/.test(draft.quantity) || !Number.isSafeInteger(count) || count < 0 || count > 2147483647)) {
		return { input: null, error: "Masukkan jumlah bilangan bulat nol atau lebih." };
	}

	return {
		input: {
			inventoryId: item.inventoryId,
			mode: draft.mode,
			status: draft.mode === "count" ? (count === 0 ? "out" : "available") : draft.status,
			quantity: draft.mode === "count" ? count : null,
			unit: draft.unit,
			note: draft.note.trim() || undefined,
			expectedUpdatedAt: draft.expectedUpdatedAt,
		},
		error: null,
	};
}

export function isManualStockDraftDirty(item: ManualStockItem, draft: ManualStockDraft): boolean {
	const itemUnit = MANUAL_STOCK_UNITS.includes(item.unit as (typeof MANUAL_STOCK_UNITS)[number]) ? item.unit : "pcs";
	return draft.mode !== item.mode
		|| draft.status !== item.status
		|| draft.quantity !== (item.quantity === null ? "" : String(item.quantity))
		|| draft.unit !== itemUnit
		|| Boolean(draft.note.trim())
		|| draft.expectedUpdatedAt !== item.updatedAt;
}

/** Each row is independent: keep failures available for retry without repeating successful writes. */
export async function saveManualStockDrafts(
	items: ManualStockItem[],
	drafts: Record<string, ManualStockDraft>,
	save: (input: ManualStockSaveInput) => Promise<ManualStockItem>,
): Promise<{ saved: ManualStockItem[]; errors: Record<string, string> }> {
	const saved: ManualStockItem[] = [];
	const errors: Record<string, string> = {};
	for (let offset = 0; offset < items.length; offset += 5) {
		await Promise.all(items.slice(offset, offset + 5).map(async item => {
			const result = buildManualStockSaveInput(item, drafts[item.inventoryId] ?? createManualStockDraft(item));
			if (!result.input) { errors[item.inventoryId] = result.error; return; }
			try { saved.push(await save(result.input)); }
			catch (error) { errors[item.inventoryId] = error instanceof Error ? error.message : "Permintaan gagal. Silakan coba lagi."; }
		}));
	}
	return { saved, errors };
}
