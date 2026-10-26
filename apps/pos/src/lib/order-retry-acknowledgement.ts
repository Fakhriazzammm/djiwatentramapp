import type { SupabaseClient } from "@supabase/supabase-js";

type RetryOrder = {
	source_id: string;
	status: string | null;
	total_amount: number | string;
};

type RequestedItem = {
	productId?: string | null;
	productName?: string | null;
	variant?: string | null;
	quantity?: number | string | null;
	price?: number | string | null;
};

class OrderRetryAcknowledgementError extends Error {}
const SETTLEMENT_KINDS = new Set(["order_settlement", "cashier_order_settlement", "mayar_order_settlement", "order_settlement_update_order", "order_settlement_status_update"]);

function sameNumber(persisted: unknown, requested: unknown) {
	return persisted !== null && persisted !== undefined &&
		Number.isFinite(Number(persisted)) && Number.isFinite(Number(requested)) &&
		Number(persisted) === Number(requested);
}

/**
 * A header alone is not proof that createOrder finished its separate writes.
 * This deliberately never resumes writes: the existing constraints do not make
 * the whole create operation atomic. An abandoned partial order needs admin
 * reconciliation against the retained queue payload; never delete/recreate it.
 */
export async function assertOrderRetryAcknowledgement(
	pos: ReturnType<SupabaseClient["schema"]>,
	order: RetryOrder,
	request: { items?: RequestedItem[]; isOpenBill?: boolean },
): Promise<void> {
	const blocked = (reason: string) => new OrderRetryAcknowledgementError(
		`Pesanan sebelumnya belum bisa dilanjutkan. ${reason} ` +
		"Jangan membuat pesanan baru. Coba lagi; jika tetap gagal, minta admin memeriksa pesanan dan pembayaran.",
	);
	try {
		const requestedItems = request.items;
		if (!Array.isArray(requestedItems) || requestedItems.length === 0) {
			throw blocked("Detail pesanan belum lengkap.");
		}
		const paid = order.status === "paid" || order.status === "completed";
		if (!paid && !(request.isOpenBill && order.status === "pending")) {
			throw blocked("Status pesanan belum selesai.");
		}
		const { data: items, error: itemsError } = await pos
			.from("order_items")
			.select("line_no,product_source_id,product_name,variant,quantity,price")
			.eq("order_source_id", order.source_id);
		if (itemsError) throw itemsError;
		if (!items || items.length !== requestedItems.length) {
			throw blocked("Detail pesanan belum lengkap.");
		}
		const lines = new Map(items.map((item) => [item.line_no, item]));
		if (lines.size !== requestedItems.length || !requestedItems.every((requested, index) => {
			const saved = lines.get(index + 1);
			return saved &&
				saved.product_source_id === (requested?.productId ?? null) &&
				saved.product_name === (requested?.productName ?? null) &&
				saved.variant === (requested?.variant ?? null) &&
				sameNumber(saved.quantity, requested?.quantity ?? 0) &&
				sameNumber(saved.price, requested?.price ?? 0);
		})) {
			throw blocked("Detail pesanan berbeda dari pesanan awal.");
		}
		if (paid) {
			const { data: transactions, error: financeError } = await pos
				.from("financial_transactions")
				.select("tx_type,amount,status,raw")
				.eq("order_source_id", order.source_id)
				.eq("tx_type", "income");
			if (financeError) throw financeError;
			const settlement = transactions?.[0];
			if (transactions?.length !== 1 || settlement?.tx_type !== "income" ||
				settlement.status !== "completed" || !SETTLEMENT_KINDS.has(settlement.raw?.kind) ||
				!sameNumber(settlement.amount, order.total_amount)) {
				throw blocked("Status pembayaran belum lengkap.");
			}
		}
	} catch (error) {
		if (error instanceof OrderRetryAcknowledgementError) throw error;
		// Keep PostgREST/transport details out of the cashier-facing recovery error.
		throw blocked("Detail pesanan dan pembayaran belum bisa diperiksa.");
	}
}
