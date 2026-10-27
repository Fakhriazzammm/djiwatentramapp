import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getCustomerPayPath } from "@/lib/customer-pay-navigation";

describe("customer pay navigation", () => {
	it("opens the customer saldo launcher for the selected username", () => {
		assert.equal(getCustomerPayPath("alice putri"), "https://pay.djiwatentram.web.id/alice%20putri/wallet");
	});
});
