import { describe, expect, it, spyOn } from "bun:test";
import { readFileSync } from "node:fs";
import { allocateDailyReceiptNo } from "./daily-receipt";
import { formatOrderNumber, getOrderChannel } from "./order-number";

const writers = ["customer", "pos", "admin", "b2b", "merchandise", "ordermieyamin", "shared"];
const createdAt = new Date("2026-10-09T10:00:00+07:00").getTime();

// Exercise the actual creation callbacks with isolated backend/React dependencies.
// Loading only these functions avoids unrelated app aliases and auth initialization.
function createWriter(app: string, client: any) {
	const path = app === "shared"
		? "../hooks/use-hybrid-write-actions.ts"
		: `../../../../apps/${app}/src/hooks/use-hybrid-write-actions.ts`;
	const source = readFileSync(new URL(path, import.meta.url), "utf8");
	const generatorStart = source.indexOf("function generateOrderNumber(");
	const generatorEnd = source.indexOf("\nfunction ", generatorStart + 1);
	const createStart = source.indexOf("export function useHybridCreateOrder()");
	const createEnd = source.indexOf("\nexport function ", createStart + 1);
	const code = new Bun.Transpiler({ loader: "ts" }).transformSync(
		source.slice(generatorStart, generatorEnd) + "\n" + source.slice(createStart, createEnd).replace("export function", "function")
	);
	const dependencies = {
		allocateDailyReceiptNo, formatOrderNumber, getOrderChannel,
		createClient: () => client,
		useMutation: () => () => { throw new Error("Unexpected fallback"); },
		useYumiAuth: () => ({ user: null }),
		useHybridDeductOrderInventory: () => async () => ({ deductedCount: 0, skippedCount: 0 }),
		useCallback: (callback: unknown) => callback,
		api: { orders: {} }, hasSupabaseConfig: true,
		makeSourceId: (prefix: string) => `${prefix}_test`, MARKETPLACE_BRAND_SLUG: "merchandise", B2B_BRAND_SLUG: "b2b",
	};
	return new Function(...Object.keys(dependencies), `${code}\nreturn useHybridCreateOrder();`)(...Object.values(dependencies));
}

function backend(counter: { value: number }, result?: { data: unknown; error: unknown }) {
	const writes: Record<string, any[]> = {};
	const calls: unknown[] = [];
	const client = {
		async rpc(name: string, args: unknown) {
			calls.push([name, args]);
			return result ?? { data: ++counter.value, error: null };
		},
		schema(name: string) {
			expect(name).toBe("pos");
			return {
				rpc: async () => ({ data: null, error: null }),
				from: (table: string) => ({ insert: async (row: unknown) => {
					(writes[table] ??= []).push(row);
					return { error: null };
				} }),
			};
		},
	};
	return { client, writes, calls };
}

const args = { source: "customer_self_service", orderType: "dine_in", createdAt, totalAmount: 10000, items: [] };

describe("browser receipt allocation", () => {
	it("persists a nonzero App sequence in the order, finance and notification data", async () => {
		const { client, writes } = backend({ value: 34 });
		await createWriter("customer", client)(args);
		const order = writes.orders[0];
		expect(order.daily_receipt_no).toBe(35);
		expect(order.order_number).toBe("ORD-APP-D-0035-091026");
		expect(order.receipt_kind).toBe("dine_in");
		expect(order.raw.dailyReceiptNo).toBe(35);
		expect(writes.financial_transactions[0].metadata.dailyReceiptNo).toBe(35);
	});

	it("all writers share one sequence contract, including pending orders", async () => {
		const counter = { value: 0 };
		for (const app of writers) {
			const { client, writes, calls } = backend(counter);
			await createWriter(app, client)({ ...args, source: app === "pos" ? "pos" : args.source, businessUnit: app === "ordermieyamin" ? app : undefined, isOpenBill: true });
			expect(calls).toEqual([["next_daily_receipt_no", { p_order_kind: "all" }]]);
			expect(writes.orders[0].daily_receipt_no).toBe(counter.value);
			expect(writes.orders[0].order_number).toContain(`-${String(counter.value).padStart(4, "0")}-`);
			expect(writes.orders[0].status).toBe("pending");
			expect(writes.orders[0].receipt_kind).toBeTruthy();
			expect(writes.financial_transactions).toBeUndefined();
		}
	});

	it("RPC errors and invalid sequences stop every writer before any insert", async () => {
		const logging = spyOn(console, "error").mockImplementation(() => {});
		try {
			for (const app of writers) {
				for (const result of [{ data: null, error: new Error("RPC unavailable") }, ...[null, 0, "0", -1, 1.5, {}, "invalid"].map(data => ({ data, error: null }))]) {
					const { client, writes, calls } = backend({ value: 0 }, result);
					await expect(createWriter(app, client)(args)).rejects.toBeDefined();
					expect(writes).toEqual({});
					expect(calls).toEqual([["next_daily_receipt_no", { p_order_kind: "all" }]]);
				}
			}
		} finally { logging.mockRestore(); }
	});
});
