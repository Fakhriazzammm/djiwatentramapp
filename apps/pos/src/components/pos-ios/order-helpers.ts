import { getDisplayOrderNumber } from "@yumipos/web-shared/lib/order-number";

export function displayOrderNumber(order: any): string {
	return getDisplayOrderNumber(order?.orderNumber, {
		sequence: order?.dailyReceiptNo ?? order?.daily_receipt_no,
		createdAt: order?.createdAt ?? order?._creationTime,
		source: order?.source,
		sourceApp: order?.sourceApp,
		businessUnit: order?.businessUnit,
		orderType: order?.orderType,
		platform: order?.platform,
		brandSlug: order?.brandSlug ?? order?.brand_slug,
	});
}

export type TimeFilter = "today" | "yesterday" | "this_week" | "last_week" | "this_month" | "last_month" | "all";

export const TIME_LABELS: Record<TimeFilter, string> = {
	today: "Hari ini",
	yesterday: "Kemarin",
	this_week: "Minggu ini",
	last_week: "Minggu lalu",
	this_month: "Bulan ini",
	last_month: "Bulan lalu",
	all: "Semua waktu",
};

/** Batas waktu [dari, sampai) untuk filter rentang. Sama dengan aturan riwayat lama. */
export function timeRange(filter: TimeFilter, now = new Date()): { from: number; to: number } {
	const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
	const day = 86_400_000;
	const dow = now.getDay() || 7;
	const thisWeek = todayStart - (dow - 1) * day;
	const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
	const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
	switch (filter) {
		case "today": return { from: todayStart, to: Infinity };
		case "yesterday": return { from: todayStart - day, to: todayStart };
		case "this_week": return { from: thisWeek, to: Infinity };
		case "last_week": return { from: thisWeek - 7 * day, to: thisWeek };
		case "this_month": return { from: thisMonth, to: Infinity };
		case "last_month": return { from: lastMonth, to: thisMonth };
		default: return { from: -Infinity, to: Infinity };
	}
}

export type OrderStatusKey = "pending" | "paid" | "cancelled";
export function statusGroup(status: string): OrderStatusKey {
	if (status === "paid" || status === "completed") return "paid";
	if (status === "pending") return "pending";
	return "cancelled";
}

export function isCashierPending(order: any): boolean {
	return order?.status === "pending" && ["cash", "cashier", "tunai"].includes(String(order?.paymentMethod ?? "").toLowerCase());
}

export function orderTypeLabel(type?: string | null): string {
	return type === "dine_in" ? "Makan di tempat" : type === "takeaway" ? "Bungkus" : type === "online" ? "Online" : type ?? "—";
}
