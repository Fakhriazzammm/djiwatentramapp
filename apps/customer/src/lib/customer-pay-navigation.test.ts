import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getCustomerPayPath } from "@/lib/customer-pay-navigation";

describe("customer pay navigation", () => {
	it("opens the customer wallet through the session bridge", () => {
		assert.equal(
			getCustomerPayPath("alice putri"),
			"https://api.djiwatentram.web.id/v1/customer/pay-bridge/start?returnTo=https%3A%2F%2Fdjiwapay.web.id%2Falice%2520putri%2Fwallet",
		);
	});

	it("carries the host return target through the bridge", () => {
		assert.equal(
			getCustomerPayPath("alice", "https://djiwatentram.web.id/alice/saldo"),
			"https://api.djiwatentram.web.id/v1/customer/pay-bridge/start?returnTo=https%3A%2F%2Fdjiwapay.web.id%2Falice%2Fwallet%3FreturnTo%3Dhttps%253A%252F%252Fdjiwatentram.web.id%252Falice%252Fsaldo",
		);
	});
});
