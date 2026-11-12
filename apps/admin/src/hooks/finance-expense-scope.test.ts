import { describe, it, expect } from "bun:test";
import * as bunTest from "bun:test";
const mock=(bunTest as unknown as {mock:{module:(name:string,factory:()=>unknown)=>void}}).mock;
const reads: string[] = [];
let records: Array<Record<string, unknown>> = [
  {
    _id: "expense-1",
    type: "expense",
    amount: 25000,
    category: "utilitas",
    date: 1794412800000,
    status: "completed",
  },
];
mock.module("@/lib/client", () => ({ createClient: () => ({}) }));
mock.module("@/lib/admin-protected-read", () => ({
  adminProtectedRead: async (action: string, query: any) => {
    reads.push(action);
    if (action === "finance")
      return records.slice(
        query.range?.[0] ?? 0,
        (query.range?.[1] ?? records.length - 1) + 1,
      );
    return [];
  },
}));
mock.module("@/hooks/use-supabase-live-value", () => ({
  useSupabaseLiveValue: (_key: string, load: () => Promise<unknown>) => load(),
}));
const { useHybridAllTransactions, useHybridCashFlowReport } = await import(
  "./use-hybrid-finance-analytics-data"
);
describe("expense report boundary", () => {
  it("does not load or append sale orders for an expense-only read", async () => {
    reads.length = 0;
    const rows = await useHybridAllTransactions({
      type: "expense",
      startDate: 1794358800000,
      endDate: 1794445199999,
    });
    expect(rows.length).toBe(1);
    expect(rows[0].type).toBe("expense");
    expect(reads).toEqual(["finance"]);
  });
  it("continues after a full database page instead of silently truncating expenses", async () => {
    const old = records;
    records = Array.from({ length: 501 }, (_, i) => ({
      ...old[0],
      _id: "expense-" + i,
      sourceFingerprint: "expense-" + i,
    }));
    reads.length = 0;
    try {
      const rows = await useHybridAllTransactions({ type: "expense" });
      expect(rows.length).toBe(501);
      expect(reads).toEqual(["finance", "finance"]);
    } finally {
      records = old;
    }
  });
  it("reconciles noncash HPP exclusions across cash totals, days and payment methods", async () => {
    const old = records;
    records = [
      {
        ...old[0],
        _id: "income",
        type: "income",
        amount: 200,
        paymentMethod: "cash",
      },
      { ...old[0], _id: "expense", amount: 100, paymentMethod: "cash" },
      {
        ...old[0],
        _id: "hpp",
        amount: 50,
        category: "hpp",
        isCashOutflow: false,
        paymentMethod: "cash",
      },
    ];
    try {
      const data = await useHybridCashFlowReport({
        startDate: 1794358800000,
        endDate: 1794445199999,
      });
      expect(data.totalOutflow).toBe(100);
      expect(data.dailyCashFlow[0].outflow).toBe(100);
      expect(
        Object.values(data.byPaymentMethod).reduce(
          (sum: number, v: any) => sum + v.outflow,
          0,
        ),
      ).toBe(100);
      expect(data.netCashFlow).toBe(100);
    } finally {
      records = old;
    }
  });
});
