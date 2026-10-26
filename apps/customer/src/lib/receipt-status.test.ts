import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { resolveReceiptStatus } from "./receipt-status";

describe("receipt status", () => {
	it("shows paid when provider payment is confirmed before the order row settles", () => {
		assert.equal(resolveReceiptStatus("paid", "pending"), "paid");
	});

	it("keeps open bill while payment is still pending", () => {
		assert.equal(resolveReceiptStatus("mayar_pending", "pending"), "open_bill");
	});

	it("preserves completed and cancelled backend states", () => {
		assert.equal(resolveReceiptStatus("paid", "completed"), "completed");
		assert.equal(resolveReceiptStatus("cashier_expired", "pending"), "cancelled");
	});
});
