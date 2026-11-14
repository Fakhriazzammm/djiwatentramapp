import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "../../../../..");
const modules = ["admin", "pos", "customer", "b2b", "merchandise", "ordermieyamin"]
	.map((app) => `apps/${app}/src/hooks/use-hybrid-write-actions.ts`)
	.concat("packages/djiwaapps-web-shared/src/hooks/use-hybrid-write-actions.ts");
const transpiler = new Bun.Transpiler({ loader: "ts" });

// Execute each real hook's returned callback with a manual-mode response and
// fail if it reaches a database/client/fallback mutation.
function loadHook(path: string, hook: string, fallback?: (args: unknown) => unknown) {
	const source = readFileSync(resolve(root, path), "utf8");
	const start = source.indexOf(`export function ${hook}()`);
	const next = source.indexOf("\nexport function ", start + 10);
	const functionSource = source.slice(start, next < 0 ? undefined : next).replace("export function", "function");
	const compiled = transpiler.transformSync(functionSource);
	const mutation = fallback ?? (() => { throw new Error("unexpected mutation"); });
	const api = new Proxy({}, { get: () => new Proxy({}, { get: () => undefined }) });
	return new Function("shouldRunIntegratedStock", "useCallback", "useMutation", "api", "hasSupabaseConfig", "createClient", "useHybridApplyInventoryStockAction", "useHybridCreateInventoryItem", "useHybridAddStock", "useHybridSyncMenuStockFromInventory", `${compiled}; return ${hook}();`)(
		async () => false, (fn: unknown) => fn, () => mutation, api, false,
		() => { throw new Error("unexpected database access"); }, () => mutation, () => mutation, () => mutation, () => mutation,
	);
}

describe("manual mode across every legacy write-hook copy", () => {
	for (const module of modules) {
		it(`${module}: auto deduction and derived menu stock are no-ops`, async () => {
			expect(await loadHook(module, "useHybridDeductOrderInventory")({ orderId: "paid-order" })).toEqual({ deductedCount: 0, skippedCount: 0, lowStockWarnings: [], inventoryWarnings: [] });
			expect(await loadHook(module, "useHybridSyncMenuStockFromInventory")()).toEqual({ updatedCount: 0 });
		});
		it(`${module}: recipe/HPP and legacy stock writes fail before mutation`, async () => {
			for (const hook of ["useHybridCreateHppCalculation", "useHybridUpdateHppCalculation", "useHybridUpsertHppFromRecipe", "useHybridSaveRecipe", "useHybridProduceBaseRecipeBatch", "useHybridAddStock"]) {
				await expect(loadHook(module, hook)({})).rejects.toThrow(/dinonaktifkan/);
			}
		});
		it(`${module}: expense recording stays available with inventory sync forced off`, async () => {
			let captured: any;
			const result = await loadHook(module, "useHybridRecordExpenseIntake", (args) => { captured = args; return { transactionId: "expense-1" }; })({ transaction: { amount: 10000, category: "Belanja Stok" }, syncMode: "finance_plus_inventory" });
			expect(result.transactionId).toBe("expense-1");
			expect(captured.syncMode).toBe("finance_only");
			expect(captured.allowCreateInventoryItem).toBe(false);
		});
	}
});
