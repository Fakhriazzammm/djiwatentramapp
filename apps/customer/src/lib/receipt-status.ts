export type ReceiptStatus = "cancelled" | "completed" | "paid" | "open_bill";

export function resolveReceiptStatus(mode: string, orderStatus?: string | null): ReceiptStatus {
	const normalizedOrderStatus = String(orderStatus ?? "").toLowerCase();
	if (mode === "cashier_expired" || normalizedOrderStatus === "cancelled" || normalizedOrderStatus === "expired") return "cancelled";
	if (normalizedOrderStatus === "completed") return "completed";
	if (mode === "paid" || normalizedOrderStatus === "paid") return "paid";
	return "open_bill";
}
