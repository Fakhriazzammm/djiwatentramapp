import { describe, expect, it } from "bun:test";
import { createClient } from "@supabase/supabase-js";
import { reconcileInterruptedOrder } from "./order-retry-reconciliation";

describe("interrupted POS order reconciliation", () => {
	it("repairs missing order items and settlement for the existing idempotent order", async () => {
		const requests: { method: string; table: string; body?: Record<string, unknown> }[] = [];
		const client = createClient("https://pos.test", "test-key", {
			auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
			global: {
				fetch: async (input, init) => {
					const url = new URL(String(input));
					const method = init?.method ?? "GET";
					const table = url.pathname.split("/").at(-1) ?? "";
					const body = init?.body ? JSON.parse(String(init.body)) : undefined;
					requests.push({ method, table, body });
					const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
					if (method === "GET" && table === "order_items") return reply([]);
					if (method === "GET" && table === "financial_transactions") return reply([]);
					if (method === "POST" && (table === "order_items" || table === "financial_transactions")) return new Response(null, { status: 201 });
					throw new Error(`Unexpected database request: ${method} ${table}`);
				},
			},
		});

		await reconcileInterruptedOrder(
			client.schema("pos"),
			{
				source_id: "order_saved",
				status: "paid",
				total_amount: "40000.00",
				order_number: "ORD-7",
				customer_name: "Ayu",
				payment_method: "cash",
				created_at: "2026-10-26T09:30:00.000Z",
				daily_receipt_no: 7,
				receipt_kind: "dine_in",
			},
			{
				items: [
					{ productId: "coffee", productName: "Kopi", quantity: 2, price: 15000 },
					{ productId: "cake", productName: "Kue", quantity: 1, price: 10000 },
				],
				isOpenBill: false,
			},
		);

		const itemInsert = requests.find((request) => request.method === "POST" && request.table === "order_items");
		const settlementInsert = requests.find((request) => request.method === "POST" && request.table === "financial_transactions");
		expect(itemInsert?.body).toEqual([
			{ order_source_id: "order_saved", line_no: 1, product_source_id: "coffee", product_name: "Kopi", variant: null, quantity: 2, price: 15000, original_price: null, status: null, hpp_snapshot: null, raw: { productId: "coffee", productName: "Kopi", quantity: 2, price: 15000 } },
			{ order_source_id: "order_saved", line_no: 2, product_source_id: "cake", product_name: "Kue", variant: null, quantity: 1, price: 10000, original_price: null, status: null, hpp_snapshot: null, raw: { productId: "cake", productName: "Kue", quantity: 1, price: 10000 } },
		]);
		expect(settlementInsert?.body).toMatchObject({
			source_id: expect.any(String),
			tx_type: "income",
			amount: 40000,
			status: "completed",
			order_source_id: "order_saved",
			metadata: { dailyReceiptNo: 7, orderNumber: "ORD-7", source: "pos" },
			raw: { kind: "order_settlement", orderId: "order_saved" },
		});
	});
});
