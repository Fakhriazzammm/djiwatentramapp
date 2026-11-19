import { expect, test } from "bun:test";
import { classifyLoanMail, reconcileInstallment } from "./mail-rules";

test("a reminder and a receipt have distinct effects", () => {
  expect(classifyLoanMail("Tagihan angsuran KPR BTN", "Jatuh tempo 25 November", true)).toBe("reminder");
  expect(classifyLoanMail("Pembayaran angsuran KPR berhasil", "", false)).toBe("receipt");
  expect(classifyLoanMail("Informasi KPR", "Transaksi kartu Anda berhasil", false)).toBeNull();
  expect(classifyLoanMail("Pembayaran angsuran KPR tidak berhasil", "", false)).toBeNull();
});

test("exact instalment reduces principal and the next bill follows the floating rate", () => {
  const row = { principal: "12000000", months: 12, model: "anuitas" as const, fixed_rate: "12", fixed_months: 1, float_rate: "24", balance: "12000000", paid: 0, installment: null, payments: [] };
  expect(reconcileInstallment(row, 1066185, "2026-11-19T18:00:00Z", false)).toMatchObject({
    balance: 11053815, paid: 1, payment: { amount: 1066185, interest: 120000, principal: 946185 }, month: "2026-11",
  });
  expect(reconcileInstallment(row, 1066186, "2026-11-19T18:00:00Z", false)).toBeNull();
  expect(reconcileInstallment({ ...row, payments: [{ at: "2026-10-31T17:00:00Z" }] }, 1066185, "2026-11-19T18:00:00Z", false)).toBeNull();
});
