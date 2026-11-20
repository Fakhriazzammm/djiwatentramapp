import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { numberOf, sortRows, textOf, type Col } from "./admin-ui";

type R = { name: string; bal: number; at: string };
const rows: R[] = [{ name: "Budi", bal: 5000, at: "2026-11-02" }, { name: "agus", bal: 120000, at: "2026-10-30" }, { name: "Citra", bal: -300, at: "2026-11-19" }, { name: "", bal: 0, at: "" }];

describe("admin table sorting", () => {
  test("reads text out of rendered cells", () => {
    expect(textOf(createElement("div", null, createElement("b", null, "Budi"), createElement("small", null, "b@x.id")))).toBe("Budi b@x.id");
    expect(textOf(null)).toBe(""); expect(textOf(["a", 1, false])).toBe("a 1");
  });
  test("understands Indonesian money, percent and decimals", () => {
    expect(numberOf("Rp 1.234.567")).toBe(1234567); expect(numberOf("−Rp 5.000")).toBe(-5000); expect(numberOf("12%")).toBe(12); expect(numberOf("1,5")).toBe(1.5);
    expect(numberOf("Rp9.561")).toBe(9561); expect(numberOf("70 rb")).toBe(70000); expect(numberOf("Budi")).toBeNull(); expect(numberOf("20 Nov 2026")).toBe(20);
  });
  test("text sorts case-insensitively, both ways, with empties last", () => {
    const col: Col<R> = { head: "Nama", cell: (r) => r.name };
    expect(sortRows(rows, col, 1).map((r) => r.name)).toEqual(["agus", "Budi", "Citra", ""]);
    expect(sortRows(rows, col, -1).map((r) => r.name)).toEqual(["Citra", "Budi", "agus", ""]);
  });
  test("numbers sort by value, not by digits; an explicit sort key wins over the shown text", () => {
    const money: Col<R> = { head: "Saldo", cell: (r) => `Rp ${r.bal.toLocaleString("id-ID")}`, sort: (r) => r.bal };
    expect(sortRows(rows, money, 1).map((r) => r.bal)).toEqual([-300, 0, 5000, 120000]);
    const shown: Col<R> = { head: "Saldo", cell: (r) => `Rp ${r.bal.toLocaleString("id-ID")}` };
    expect(sortRows(rows, shown, -1).map((r) => r.bal)).toEqual([120000, 5000, 0, -300]);
    const date: Col<R> = { head: "Daftar", cell: (r) => r.at.slice(5), sort: (r) => r.at };
    expect(sortRows(rows, date, -1).map((r) => r.at)).toEqual(["2026-11-19", "2026-11-02", "2026-10-30", ""]);
  });
  test("ties keep their original order", () => {
    const r2 = [{ name: "a", bal: 1, at: "" }, { name: "b", bal: 1, at: "" }, { name: "c", bal: 1, at: "" }];
    expect(sortRows(r2, { head: "x", cell: (r) => String(r.bal) }, 1).map((r) => r.name)).toEqual(["a", "b", "c"]);
  });
});
