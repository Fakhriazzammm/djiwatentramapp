import { expect, test } from "bun:test";
import { contentData } from "./template";

test("loan export shows outstanding principal once and keeps user labels as text", () => {
  const rows = contentData({
    catNames: { expense: [], income: [], all: [] }, accountNames: [], months: [], monthNow: 0,
    budgets: [], bills: [], goals: [], debts: [], assets: [], now: "",
    loans: [["=KPR", "Bank BTN", 800000000, 25, 8000000]],
  });
  expect(rows.find((range) => range.range === "Hutang!B5:G5")?.values[0]).toEqual([
    "'=KPR", "Pinjaman", 800000000, "Tanggal 25", "Belum lunas", "'Bank BTN · Angsuran Rp8.000.000",
  ]);
  expect(rows.find((range) => range.range === "Hutang!B7:D8")?.values[1][2]).toContain('"Pinjaman"');
  expect(rows.find((range) => range.range === "Aset!B7:D10")?.values[2][2]).toBe("=-Hutang!D8");
});
