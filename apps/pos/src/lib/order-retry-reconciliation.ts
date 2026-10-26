import type { SupabaseClient } from "@supabase/supabase-js";

type RetryOrder = {
	source_id: string;
	status: string | null;
	total_amount: number | string;
	order_number?: string | null;
	customer_name?: string | null;
	payment_method?: string | null;
	created_at?: string | number | null;
	daily_receipt_no?: number | string | null;
	receipt_kind?: string | null;
};

type RequestedItem = {
	productId?: string | null;
	productName?: string | null;
	variant?: string | null;
	quantity?: number | string | null;
	price?: number | string | null;
	originalPrice?: number | string | null;
	status?: string | null;
	hppSnapshot?: unknown;
};

type RetryRequest = {
	items?: RequestedItem[];
	isOpenBill?: boolean;
	paymentMethod?: string | null;
	customerName?: string | null;
};

function sameNumber(left: unknown, right: unknown) {
	return Number.isFinite(Number(left)) && Number.isFinite(Number(right)) && Number(left) === Number(right);
}

function sameItem(saved: Record<string, unknown>, requested: RequestedItem) {
	return saved.product_source_id === (requested.productId ?? null) &&
		saved.product_name === (requested.productName ?? null) &&
		saved.variant === (requested.variant ?? null) &&
		sameNumber(saved.quantity, requested.quantity ?? 0) &&
		sameNumber(saved.price, requested.price ?? 0);
}

function sourceTimestamp(value: RetryOrder["created_at"]) {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string") {
		const numeric = Number(value);
		if (Number.isFinite(numeric)) return numeric;
		const parsed = Date.parse(value);
		if (Number.isFinite(parsed)) return parsed;
	}
	return Date.now();
}

function sourceId(prefix: string) {
	return `${prefix}_${crypto.randomUUID()}`;
}

/**
 * Completes only the side effects that are absent from an order already
 * protected by its idempotency key. It never creates a second order and it
 * fails closed when a persisted line conflicts with the original request.
 */
export async function reconcileInterruptedOrder(
	pos: ReturnType<SupabaseClient["schema"]>,
	order: RetryOrder,
	request: RetryRequest,
): Promise<void> {
	const blocked = (reason: string) => new Error(
		`Pesanan sebelumnya belum bisa dilanjutkan. ${reason} ` +
		"Jangan membuat pesanan baru. Coba lagi; jika tetap gagal, minta admin memeriksa pesanan dan pembayaran.",
	);
	const requestedItems = request.items;
	if (!Array.isArray(requestedItems) || requestedItems.length === 0) {
		throw blocked("Detail pesanan belum lengkap.");
	}
	if (request.paymentMethod && order.payment_method && request.paymentMethod !== order.payment_method) {
		throw blocked("metode pembayaran berbeda dari pesanan awal");
	}
	try {
	const { data: savedItems, error: itemsError } = await pos
		.from("order_items")
		.select("line_no,product_source_id,product_name,variant,quantity,price")
		.eq("order_source_id", order.source_id);
	if (itemsError) throw itemsError;

	const savedByLine = new Map<number, Record<string, unknown>>();
	for (const item of (savedItems ?? []) as Record<string, unknown>[]) {
		const lineNo = Number(item.line_no);
		if (!Number.isInteger(lineNo) || savedByLine.has(lineNo)) {
			throw blocked("Detail pesanan tidak sesuai.");
		}
		savedByLine.set(lineNo, item);
	}
	if ([...savedByLine.keys()].some((lineNo) => lineNo < 1 || lineNo > requestedItems.length)) {
		throw blocked("Detail pesanan berbeda dari pesanan awal.");
	}

	const missingItems = requestedItems.flatMap((item, index) => {
		const lineNo = index + 1;
		const saved = savedByLine.get(lineNo);
		if (saved) {
			if (!sameItem(saved, item)) {
				throw blocked("Detail pesanan berbeda dari pesanan awal.");
			}
			return [];
		}
		return [{
			order_source_id: order.source_id,
			line_no: lineNo,
			product_source_id: item.productId ?? null,
			product_name: item.productName ?? null,
			variant: item.variant ?? null,
			quantity: Number(item.quantity ?? 0),
			price: Number(item.price ?? 0),
			original_price: item.originalPrice === undefined ? null : Number(item.originalPrice ?? 0),
			status: item.status ?? null,
			hpp_snapshot: item.hppSnapshot ?? null,
			raw: item,
		}];
	});
	if (missingItems.length > 0) {
		const { error } = await pos.from("order_items").insert(missingItems);
		if (error) throw error;
	}

	const paid = order.status === "paid" || order.status === "completed";
	if (!paid || request.isOpenBill) return;

	const { data: settlements, error: financeError } = await pos
		.from("financial_transactions")
		.select("tx_type,amount,status,raw")
		.eq("order_source_id", order.source_id)
		.eq("tx_type", "income");
	if (financeError) throw financeError;
	if ((settlements ?? []).length > 0) return;

	const createdAt = sourceTimestamp(order.created_at);
	const { error: settlementError } = await pos.from("financial_transactions").insert({
		source_id: sourceId("fin"),
		tx_type: "income",
		amount: Number(order.total_amount),
		category: "Penjualan",
		description: `Penjualan Pesanan #${order.order_number ?? order.source_id}`,
		merchant: request.customerName ?? order.customer_name ?? null,
		tx_date: createdAt,
		payment_method: request.paymentMethod ?? order.payment_method ?? null,
		status: "completed",
		order_source_id: order.source_id,
		creation_time: Date.now(),
		metadata: {
			dailyReceiptNo: order.daily_receipt_no ?? null,
			orderNumber: order.order_number ?? null,
			source: "pos",
		},
		raw: {
			kind: "order_settlement",
			orderId: order.source_id,
		},
	});
	if (settlementError) throw settlementError;
	} catch (error) {
		if (error instanceof Error && error.message.startsWith("Pesanan sebelumnya belum bisa dilanjutkan.")) throw error;
		throw blocked("Status pembayaran belum bisa dipastikan.");
	}
}
