import { describe, it, expect } from "bun:test";
import { isCashExpense } from "./finance-cash-flow";
describe("cash movement excludes noncash cost recognition", () => {
  it("counts ordinary cash expenses but never HPP recognition", () => {
    expect(isCashExpense({ type: "expense", category: "utilitas" })).toBe(true);
    for (const fields of [
      { category: "hpp" },
      { transactionKind: "order_cogs" },
      { transaction_kind: "order_cogs" },
      { isCashOutflow: false },
      { is_cash_outflow: false },
    ])
      expect(isCashExpense({ type: "expense", ...fields })).toBe(false);
    expect(isCashExpense({ type: "income" })).toBe(false);
  });
});
