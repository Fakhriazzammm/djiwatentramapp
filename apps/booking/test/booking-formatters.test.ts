import { describe, expect, test } from "bun:test";
import { formatDate } from "../src/lib/booking-formatters";

describe("booking date formatter", () => {
  test("does not throw when review has no selected date", () => {
    expect(formatDate("")).toBe("Tanggal belum dipilih");
  });

  test("uses a safe placeholder for malformed dates", () => {
    expect(formatDate("not-a-date")).toBe("Tanggal belum dipilih");
  });
});
