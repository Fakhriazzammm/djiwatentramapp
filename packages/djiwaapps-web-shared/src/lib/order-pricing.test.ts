import assert from "node:assert/strict";
import test from "node:test";
import { getAdditionalOrderDiscount } from "./order-pricing";

test("does not send item Happy Hour discount to order-level authority", () => {
  assert.equal(getAdditionalOrderDiscount(0, 0), 0);
  assert.equal(getAdditionalOrderDiscount(35_000, 0), 0);
  assert.equal(getAdditionalOrderDiscount(0, 12_000), 12_000);
  assert.equal(getAdditionalOrderDiscount(35_000, 12_000), 12_000);
});

test("normalizes invalid or negative voucher amounts safely", () => {
  assert.equal(getAdditionalOrderDiscount(35_000, -1), 0);
  assert.equal(getAdditionalOrderDiscount(35_000, Number.NaN), 0);
  assert.equal(getAdditionalOrderDiscount(35_000, undefined), 0);
});
