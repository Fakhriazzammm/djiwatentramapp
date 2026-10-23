export const POS_PANELS = ["cart", "dashboard", "transaksi", "kas", "antrian", "stok", "yumi", "settings", "more", "readiness", "sync", "stock", "notifications"] as const;
export type PosPanel = typeof POS_PANELS[number];

export function readPosPanel(search: string): PosPanel | null {
	const value = new URLSearchParams(search).get("panel");
	return POS_PANELS.includes(value as PosPanel) ? value as PosPanel : null;
}

export function posPanelSearch(search: string, panel: PosPanel | null): Record<string, string> {
	const next = new URLSearchParams(search);
	if (panel) next.set("panel", panel);
	else next.delete("panel");
	return Object.fromEntries(next.entries());
}

export function getShiftClosingTasks(orders: readonly Record<string, any>[], shiftId: string | null, queuedCount: number, shiftStart = 0) {
	const shiftOrders = shiftId ? orders.filter(order => {
		const linkedShift = String(order.shiftId ?? order.shiftSourceId ?? order.shift_id ?? order.shift_source_id ?? order.raw?.shiftId ?? order.raw?.shiftSourceId ?? order.raw?.shift_id ?? order.raw?.shift_source_id ?? "");
		return linkedShift ? linkedShift === shiftId : shiftStart > 0 && Number(order.createdAt ?? order.created_at ?? 0) >= shiftStart;
	}) : [];
	return {
		unsynced: queuedCount,
		unpaid: shiftOrders.filter(order => ["pending", "open_bill", "unpaid"].includes(String(order.status ?? ""))).length,
		inProduction: shiftOrders.filter(order => ["paid", "preparing", "processing", "ready"].includes(String(order.status ?? ""))).length,
	};
}
