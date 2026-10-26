import assert from "node:assert/strict";
import test from "node:test";
import { shouldAllocateReceiptNumber } from "./order-receipt-allocation";

test("cashier pending orders do not reserve a receipt number", () => {
	assert.equal(shouldAllocateReceiptNumber({ isOpenBill: true }), false);
});

test("settled orders still allocate a receipt number", () => {
	assert.equal(shouldAllocateReceiptNumber({ isOpenBill: false }), true);
	assert.equal(shouldAllocateReceiptNumber({ isOpenBill: true, autoComplete: true }), true);
});
