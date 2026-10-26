import { describe, expect, it } from "bun:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { createClient } from "@supabase/supabase-js";
import { assertOrderRetryAcknowledgement } from "./order-retry-acknowledgement";
import { reconcileInterruptedOrder } from "./order-retry-reconciliation";

const requestedItems = [
	{ productId: "coffee", productName: "Kopi", variant: "hot", quantity: 2, price: 15000 },
	{ productId: "cake", productName: "Kue", quantity: 1, price: 10000 },
];
const savedItems = [
	{ line_no: 1, product_source_id: "coffee", product_name: "Kopi", variant: "hot", quantity: "2.0000", price: "15000.00" },
	{ line_no: 2, product_source_id: "cake", product_name: "Kue", variant: null, quantity: "1.0000", price: "10000.00" },
];
const paidOrder = { source_id: "order_saved", status: "paid", total_amount: "44000.00" };
const settlement = { tx_type: "income", amount: "44000.00", status: "completed", raw: { kind: "order_settlement", orderId: "order_saved" } };

type Fixture = {
	race?: boolean;
	newOrder?: boolean;
	order?: typeof paidOrder;
	items?: Record<string, unknown>[];
	finance?: Record<string, unknown>[];
	queryError?: "orders" | "order_items" | "financial_transactions";
	repair?: boolean;
};
function database(fixture: Fixture = {}) {
	const requests: { method: string; url: URL; body: any }[] = [];
	let orderReads = 0;
	const client = createClient("https://pos.test", "test-key", {
		auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
		global: { fetch: async (input, init) => {
			const url = new URL(String(input));
			const method = init?.method ?? "GET";
			const body = init?.body ? JSON.parse(String(init.body)) : undefined;
			requests.push({ method, url, body });
			const table = url.pathname.split("/").at(-1);
			const rows = (data: Record<string, unknown>[]) => data.map((row) => Object.fromEntries(
				(url.searchParams.get("select") ?? "").split(",").map((column) => [column, row[column]])
			));
			const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
			if (method === "GET") {
				assert.equal(new Headers(init?.headers).get("accept-profile"), "pos");
				if (fixture.queryError === table) return reply({ code: "42501", message: "private database detail" }, 403);
				if (table === "orders") {
					assert.equal(url.searchParams.get("idempotency_key"), "eq.request-1");
					orderReads++;
					return reply(rows(fixture.newOrder || (fixture.race && orderReads === 1) ? [] : [fixture.order ?? paidOrder]));
				}
				assert.equal(url.searchParams.get("order_source_id"), "eq.order_saved");
				if (table === "order_items") return reply(rows(fixture.items ?? savedItems));
				if (table === "financial_transactions") {
					assert.equal(url.searchParams.get("tx_type"), "eq.income");
					return reply(rows(fixture.finance ?? [settlement]));
				}
			}
			if (method === "POST") {
				if (table === "calculate_order_tax") return reply({ totalAmount: 44000 });
				if (table === "orders" && fixture.race) return reply({ code: "23505", message: "duplicate" }, 409);
				if (fixture.repair && table === "order_items") {
					fixture.items = savedItems;
					return new Response(null, { status: 201 });
				}
				if (fixture.repair && table === "financial_transactions") {
					fixture.finance = [settlement];
					return new Response(null, { status: 201 });
				}
				if (fixture.newOrder && ["orders", "order_items", "financial_transactions"].includes(table ?? "")) return new Response(null, { status: 201 });
			}
			throw new Error(`Unexpected database request: ${method} ${url.pathname}`);
		} },
	});
	return { client, requests };
}

// Execute the actual hook body without importing unrelated application/browser modules.
// Only external dependencies are replaced; the retry guard remains real.
async function orderAction(client: ReturnType<typeof database>["client"]) {
	const source = readFileSync(new URL("../hooks/use-hybrid-write-actions.ts", import.meta.url), "utf8");
	const file = ts.createSourceFile("hook.ts", source, ts.ScriptTarget.Latest, true);
	const hook = file.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "useHybridCreateOrder");
	assert.ok(hook);
	const compiled = ts.transpileModule(hook.getText(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
	const dependencies = {
		useMutation: () => () => { throw new Error("Unexpected fallback"); }, api: { orders: {} },
		useYumiAuth: () => ({ user: { _id: "cashier" } }),
		useHybridDeductOrderInventory: () => async () => ({ deductedCount: 0, skippedCount: 0 }),
		useCallback: (callback: unknown) => callback, hasSupabaseConfig: true,
		createClient: () => client, allocateDailyReceiptNo: async () => 7,
		generateOrderNumber: () => "ORD-7", makeSourceId: (prefix: string) => `${prefix}_new`,
		assertOrderRetryAcknowledgement,
		reconcileInterruptedOrder,
	};
	return new Function("exports", ...Object.keys(dependencies), `${compiled}\nreturn exports.useHybridCreateOrder();`)({}, ...Object.values(dependencies));
}

const request = { idempotencyKey: "request-1", items: requestedItems, totalAmount: 40000, source: "pos" };

describe("create-order retry acknowledgement", () => {
	for (const race of [false, true]) {
		const path = race ? "23505 race" : "existing key";
		it(`${path}: repairs an incomplete header without creating a second order`, async () => {
			const db = database({ race, repair: true, items: [], finance: [] });
			expect(await (await orderAction(db.client))(request)).toBe("order_saved");
			assert.equal(db.requests.filter((entry) => entry.method === "POST" && entry.url.pathname.endsWith("orders")).length <= 1, true);
		});
		it(`${path}: repairs a paid order without settlement`, async () => {
			const db = database({ race, repair: true, finance: [] });
			expect(await (await orderAction(db.client))(request)).toBe("order_saved");
		});
		for (const queryError of ["order_items", "financial_transactions"] as const) {
			it(`${path}: retains the retry when ${queryError} cannot be read`, async () => {
				const db = database({ race, queryError });
				await assert.rejects((await orderAction(db.client))(request), /belum.*bisa dilanjutkan|periksa/i);
			});
		}
		it(`${path}: acknowledges a fully persisted paid order`, async () => {
			const db = database({ race });
			expect(await (await orderAction(db.client))(request)).toBe("order_saved");
		});
		it(`${path}: acknowledges a fully persisted pending open bill without finance`, async () => {
			const db = database({ race, order: { ...paidOrder, status: "pending" }, finance: [] });
			expect(await (await orderAction(db.client))({ ...request, isOpenBill: true })).toBe("order_saved");
		});
	}
	it("repairs a missing item line before acknowledging the existing payment", async () => {
		const db = database({ repair: true, items: savedItems.slice(0, 1) });
		expect(await (await orderAction(db.client))(request)).toBe("order_saved");
	});
	it("writes new settlement using the persisted authoritative tax total", async () => {
		const db = database({ newOrder: true });
		expect(await (await orderAction(db.client))(request)).toBe("order_new");
		assert.equal(db.requests.find((entry) => entry.method === "POST" && entry.url.pathname.endsWith("financial_transactions"))?.body.amount, 44000);
	});
	it("repairs an existing paid order whose item and settlement writes were interrupted", async () => {
		const db = database({ repair: true, items: [], finance: [] });
		expect(await (await orderAction(db.client))(request)).toBe("order_saved");
		assert.equal(db.requests.some((entry) => entry.method === "POST" && entry.url.pathname.endsWith("order_items")), true);
		assert.equal(db.requests.some((entry) => entry.method === "POST" && entry.url.pathname.endsWith("financial_transactions")), true);
	});
});


describe("retry verification fails closed", () => {
	for (const kind of ["cashier_order_settlement", "mayar_order_settlement", "order_settlement_update_order", "order_settlement_status_update"]) {
		it(`acknowledges an open bill subsequently paid through ${kind}`, async () => {
			const db = database({ finance: [{...settlement, raw:{kind, orderId:"order_saved"}}] });
			expect(await (await orderAction(db.client))({...request, isOpenBill:true})).toBe("order_saved");
		});
	}
	const cases: [string, Fixture][] = [
		["extra line", { items: [...savedItems, { ...savedItems[0], line_no: 3 }] }],
		["duplicate line", { items: [savedItems[0], savedItems[0]] }],
		["different product", { items: [{ ...savedItems[0], product_source_id: "tea" }, savedItems[1]] }],
		["different name", { items: [{ ...savedItems[0], product_name: "Teh" }, savedItems[1]] }],
		["different variant", { items: [{ ...savedItems[0], variant: "iced" }, savedItems[1]] }],
		["different quantity", { items: [{ ...savedItems[0], quantity: "1" }, savedItems[1]] }],
		["different price", { items: [{ ...savedItems[0], price: "14000" }, savedItems[1]] }],
		["invalid quantity", { items: [{ ...savedItems[0], quantity: "NaN" }, savedItems[1]] }],
		["null price", { items: [{ ...savedItems[0], price: null }, savedItems[1]] }],
		["pending status for a paid request", { order: { ...paidOrder, status: "pending" } }],
		["cancelled status", { order: { ...paidOrder, status: "cancelled" } }],
		["settlement amount differs from persisted total", { finance: [{ ...settlement, amount: "40000" }] }],
		["uncompleted settlement", { finance: [{ ...settlement, status: "pending" }] }],
		["expense instead of income", { finance: [{ ...settlement, tx_type: "expense" }] }],
		["unrelated income", { finance: [{ ...settlement, raw: { kind: "shift_open" } }] }],
		["duplicate settlements", { finance: [settlement, settlement] }],
		["invalid persisted total", { order: { ...paidOrder, total_amount: "NaN" } }],
		["item query failure", { queryError: "order_items" }],
		["finance query failure", { queryError: "financial_transactions" }],
	];
	for (const [name, fixture] of cases) {
		it(`does not acknowledge ${name}`, async () => {
			const db = database(fixture);
			await assert.rejects((await orderAction(db.client))(request), (error: Error) => {
				assert.match(error.message, /belum|periksa|berbeda|valid/i);
				assert.match(error.message, /admin|kembali/i);
				assert.equal(error.message.includes("private database detail"), false);
				return true;
			});
			assert.equal(db.requests.some((entry) => entry.method !== "GET"), false);
		});
	}
	it("accepts a completed order and unordered persisted lines", async () => {
		const db = database({ order: { ...paidOrder, status: "completed" }, items: [...savedItems].reverse() });
		expect(await (await orderAction(db.client))(request)).toBe("order_saved");
	});
});
