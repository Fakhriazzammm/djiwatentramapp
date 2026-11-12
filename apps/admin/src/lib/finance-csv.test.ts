import { it, expect } from "bun:test";
import { financeCsvCell } from "./finance-csv";
it("preserves negative monetary numbers and escapes text formula cells", () => {
  expect(financeCsvCell(-20000)).toBe('"-20000"');
  expect(financeCsvCell("=1+1")).toBe('"\'=1+1"');
  expect(financeCsvCell('Kas "A"')).toBe('"Kas ""A"""');
});
