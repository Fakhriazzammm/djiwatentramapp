import { describe, expect, test } from "bun:test";
import { extractBill, parseDueDate } from "./extract";

const NOW = new Date("2026-11-19T14:00:00Z");
describe("bill reminders", () => {
  test("the Telkomsel IndiHome reminder: who, how much, by when", () => {
    const b = extractBill("Bill Event", "Plgn Yth, tagihan IndiHome bulan ini Rp340215. Jatuh tempo tgl 20-NOV-26, bayar dengan klik: tsel.id/bayarindihome Terimakasih jika sudah bayar", "Telkom / IndiHome", NOW);
    expect(b).toEqual({ amount: 340215, due: "2026-11-20", name: "IndiHome" });
  });
  test("other ways a due date is written", () => {
    expect(extractBill("Tagihan PLN", "Total tagihan listrik Rp 512.300. Jatuh tempo 5 Desember 2026.", "PLN", NOW)).toMatchObject({ amount: 512300, due: "2026-12-05", name: "PLN" });
    expect(extractBill("Invoice", "Jumlah tagihan Rp 99.000, due date: 25/12/2026", "Acme", NOW)?.due).toBe("2026-12-25");
    expect(extractBill("Tagihan", "Tagihan kartu Rp 1.000.000, paling lambat 2026-12-01", "Bank", NOW)?.due).toBe("2026-12-01");
  });
  test("only a day: the next such day", () => {
    expect(parseDueDate("tgl 25", NOW)).toBe("2026-11-25");
    expect(parseDueDate("tgl 5", NOW)).toBe("2026-12-05");             // already past this month
    expect(parseDueDate("31", new Date("2026-12-31T20:00:00Z"))).toBe("2027-01-31");   // 03:00 WIB on 1 Jan: day 31 is next month... stays valid
  });
  test("no amount, no bill; no date is still a bill", () => {
    expect(extractBill("Tagihan", "Segera lunasi tagihan Anda.", "Bank", NOW)).toBeNull();
    expect(extractBill("Tagihan", "Tagihan bulan ini Rp 150.000, bayar sekarang", "Bank", NOW)).toMatchObject({ amount: 150000, due: null });
  });
});
