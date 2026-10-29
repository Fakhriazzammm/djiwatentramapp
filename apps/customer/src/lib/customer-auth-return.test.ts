import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getSafeCustomerReturnUrl } from "@/lib/customer-auth-return";

describe("customer SSO return allowlist", () => {
	it("allows a Djiwa Pay wallet return with only the SSO marker", () => {
		assert.equal(
			getSafeCustomerReturnUrl("?sso=1&returnTo=https%3A%2F%2Fdjiwapay.web.id%2Falice%2Fwallet%3Fsso%3D1"),
			"https://djiwapay.web.id/alice/wallet?sso=1",
		);
	});

	it("rejects an untrusted SSO return origin", () => {
		assert.equal(
			getSafeCustomerReturnUrl("?sso=1&returnTo=https%3A%2F%2Fevil.example%2F%3Fsso%3D1"),
			null,
		);
	});
});
