import assert from "node:assert/strict";
import { test } from "node:test";
import { groupDigits, isPhone, normalizePhone, operatorOf, parseRecipientQr, payMessage, productName } from "./pay-bridge";

test("normalizes Indonesian phones to 62 format", () => {
	assert.equal(normalizePhone("0812-3456-7890"), "6281234567890");
	assert.equal(normalizePhone("+62 812 3456 7890"), "6281234567890");
	assert.equal(normalizePhone("12345"), "");
	assert.equal(isPhone("081234567890"), true);
	assert.equal(isPhone("0212345"), false);
});

test("reads Djiwa Pay receive QR codes only", () => {
	assert.equal(parseRecipientQr("djiwapay://transfer?phone=6281234567890"), "6281234567890");
	assert.equal(parseRecipientQr("https://djiwapay.web.id/wallet/transfer?phone=081234567890"), "6281234567890");
	assert.equal(parseRecipientQr("https://evil.example/wallet/transfer?phone=6281234567890"), null);
	assert.equal(parseRecipientQr("djiwapay://other?phone=6281234567890"), null);
	assert.equal(parseRecipientQr("not a url"), null);
});

test("formats PPOB products", () => {
	assert.equal(productName({ product_code: "x", product_description: "Telkomsel", product_nominal: "50000", product_price: 51000, product_type: "pulsa", status: "active" }), "Pulsa 50.000");
	assert.equal(productName({ product_code: "p", product_description: "PLN", product_nominal: "100000", product_price: 101500, product_type: "pln", status: "active" }), "Token PLN 100.000");
	assert.equal(operatorOf({ product_code: "tsel50", product_description: "Telkomsel 50", product_nominal: "50000", product_price: 1, product_type: "pulsa", status: "active" }), "Telkomsel");
	assert.equal(groupDigits("081234567890", [4, 4, 4]), "0812 3456 7890");
});

test("maps server errors to Indonesian messages", () => {
	assert.equal(payMessage("INSUFFICIENT_BALANCE"), "Saldo tidak cukup.");
	assert.equal(payMessage(undefined), "Permintaan gagal. Coba lagi.");
});
