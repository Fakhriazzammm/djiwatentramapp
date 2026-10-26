import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizePaymentMethod,
  paymentReceiptKindFor,
  PAYMENT_METHOD_LABELS,
} from "./payment-contract.ts";

test("normalizes cashier aliases to the canonical cashier method", () => {
  for (const paymentMethod of ["cash", "tunai", "cashier", "CASHIER_CASH"]) {
    assert.equal(normalizePaymentMethod({ paymentMethod }), "cashier_cash");
  }
  assert.equal(
    normalizePaymentMethod({ paymentReceiptKind: "cashier_pending" }),
    "cashier_cash",
  );
});

test("normalizes every QRIS/Mayar alias to qris_mayar", () => {
  for (const paymentMethod of ["qris", "qris_mayar", "mayar", "gateway"]) {
    assert.equal(normalizePaymentMethod({ paymentMethod }), "qris_mayar");
  }
  assert.equal(
    normalizePaymentMethod({ paymentGateway: "mayar" }),
    "qris_mayar",
  );
  assert.equal(
    normalizePaymentMethod({ paymentMethod: "djiwaapp", paymentGateway: "mayar" }),
    "qris_mayar",
  );
  assert.equal(
    normalizePaymentMethod({ paymentReceiptKind: "gateway_pending" }),
    "qris_mayar",
  );
});

test("keeps ambiguous legacy djiwaapp unknown without gateway evidence", () => {
  assert.equal(normalizePaymentMethod({ paymentMethod: "djiwaapp" }), "unknown");
});

test("normalizes wallet aliases to djiwa_pay", () => {
  for (const paymentMethod of ["wallet", "djiwa_pay", "djiwaapp_wallet"]) {
    assert.equal(normalizePaymentMethod({ paymentMethod }), "djiwa_pay");
  }
  assert.equal(normalizePaymentMethod({ paymentReceiptKind: "wallet_paid" }), "djiwa_pay");
});

test("does not classify QRIS as cashier", () => {
  assert.notEqual(
    normalizePaymentMethod({ paymentMethod: "qris", paymentReceiptKind: "cashier_pending" }),
    "cashier_cash",
  );
  assert.equal(paymentReceiptKindFor("qris_mayar", "pending"), "gateway_pending");
  assert.equal(normalizePaymentMethod({ paymentReceiptKind: "gateway_paid" }), "qris_mayar");
  assert.equal(paymentReceiptKindFor("cashier_cash", "pending"), "cashier_pending");
});

test("exposes one shared customer-facing label set", () => {
  assert.deepEqual(PAYMENT_METHOD_LABELS, {
    cashier_cash: "Bayar Tunai di Kasir",
    qris_mayar: "QRIS",
    djiwa_pay: "Djiwa Pay",
  });
});
