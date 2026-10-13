import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  authorizeLedgerSecret,
  buildTravelBookReport,
  normalizeBookRows,
  parseLedgerRequest,
  wibDay,
  type TravelBookEntry,
} from "./core.ts";

Deno.test("authorizeLedgerSecret distinguishes missing config, wrong and right secrets", () => {
  assertEquals(authorizeLedgerSecret("abc", ""), "missing_config");
  assertEquals(authorizeLedgerSecret("abc", "xyz"), "unauthorized");
  assertEquals(authorizeLedgerSecret("abcd", "abc"), "unauthorized");
  assertEquals(authorizeLedgerSecret("abc", "abc"), "ok");
});

Deno.test("parseLedgerRequest defaults the report period to 30 days", () => {
  assertEquals(parseLedgerRequest({ action: "report" }), { kind: "report", days: 30 });
  assertEquals(parseLedgerRequest({ action: "report", days: 7 }), { kind: "report", days: 7 });
});

Deno.test("parseLedgerRequest rejects unsupported actions and absurd periods", () => {
  assertThrows(() => parseLedgerRequest({ action: "income" }));
  assertThrows(() => parseLedgerRequest({ action: "report", days: 0 }));
  assertThrows(() => parseLedgerRequest({ action: "report", days: 5000 }));
  assertThrows(() => parseLedgerRequest(null));
});

Deno.test("parseLedgerRequest builds an idempotent expense from untrusted input", () => {
  const parsed = parseLedgerRequest({
    action: "expense",
    externalId: "9f1c2d3e",
    amount: 12500.4,
    category: "Top-up saldo provider",
    description: "Isi saldo eSIM Access",
    metadata: { note: "ok", bad: { nested: true } },
  });
  assertEquals(parsed.kind, "expense");
  if (parsed.kind !== "expense") throw new Error("expected expense");
  assertEquals(parsed.sourceId, "trav_exp_9f1c2d3e");
  assertEquals(parsed.amount, 12500);
  assertEquals(parsed.paymentMethod, "transfer");
  // Nested/unbounded metadata must never reach the database.
  assertEquals(parsed.metadata, { note: "ok" });
});

Deno.test("parseLedgerRequest rejects hostile expense input", () => {
  assertThrows(() => parseLedgerRequest({ action: "expense", externalId: "x", amount: 0, category: "a", description: "b" }));
  assertThrows(() => parseLedgerRequest({ action: "expense", externalId: "x", amount: -5, category: "a", description: "b" }));
  assertThrows(() => parseLedgerRequest({ action: "expense", externalId: "x", amount: 1e12, category: "a", description: "b" }));
  assertThrows(() => parseLedgerRequest({ action: "expense", externalId: "bad id!", amount: 100, category: "a", description: "b" }));
  assertThrows(() => parseLedgerRequest({ action: "expense", externalId: "x", amount: 100, category: "a\nb", description: "b" }));
});

Deno.test("normalizeBookRows keeps valid rows and reports truncation", () => {
  const rows = [
    { source_id: "a", tx_type: "income", amount: "15000", tx_date: "1760000000000" },
    { source_id: "b", tx_type: "refund", amount: 1000, tx_date: 1 },
    { source_id: "c", tx_type: "expense", amount: 2500, tx_date: 2 },
    null,
  ];
  const { entries, truncated } = normalizeBookRows(rows, 10);
  assertEquals(truncated, false);
  assertEquals(entries.map((entry) => entry.sourceId), ["a", "c"]);
  assertEquals(entries[0]?.amount, 15000);
  assertEquals(normalizeBookRows(rows, 1).truncated, true);
});

Deno.test("buildTravelBookReport totals, nets, groups by category and WIB day", () => {
  // 2026-10-12 10:00 WIB and 2026-10-12 20:00 WIB stay on the same WIB day.
  const entries: TravelBookEntry[] = [
    {
      sourceId: "in-1", txType: "income", amount: 15000, category: "Penjualan",
      merchant: "mayar", description: "Penjualan #1", txDateMs: 1760242800000, status: "completed",
    },
    {
      sourceId: "ex-1", txType: "expense", amount: 5000, category: "Top-up provider",
      merchant: "esimaccess", description: "Isi saldo", txDateMs: 1760278800000, status: "completed",
    },
  ];
  const report = buildTravelBookReport(entries, 30, false);
  assertEquals(report.totals, { income: 15000, expense: 5000, net: 10000, incomeCount: 1, expenseCount: 1 });
  assertEquals(report.byCategory.map((row) => [row.category, row.amount]), [["Penjualan", 15000], ["Top-up provider", 5000]]);
  assertEquals(report.daily.length, 1);
  assertEquals(report.daily[0]?.income, 15000);
  assertEquals(report.daily[0]?.expense, 5000);
  assertEquals(report.recent[0]?.sourceId, "ex-1");
  assertEquals(wibDay(1760242800000), report.daily[0]?.day);
});

Deno.test("buildTravelBookReport labels missing categories instead of dropping them", () => {
  const report = buildTravelBookReport([
    {
      sourceId: "ex-2", txType: "expense", amount: 700, category: null,
      merchant: null, description: null, txDateMs: 1760278800000, status: null,
    },
  ], 7, false);
  assertEquals(report.byCategory[0]?.category, "Lainnya");
  assertEquals(report.totals.net, -700);
});
