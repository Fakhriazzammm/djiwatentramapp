import { CUSTOMER_API_BASE, CUSTOMER_AUTH_BASE, CUSTOMER_API_ORIGIN } from "@/lib/customer-auth-config";

declare const describe: (name: string, fn: () => void) => void;
declare const it: (name: string, fn: () => void) => void;
declare const expect: (value: unknown) => { toBe(expected: unknown): void };

describe("customer auth configuration", () => {
	it("uses the canonical Djiwa origin for auth and data APIs", () => {
		expect(CUSTOMER_API_ORIGIN).toBe("https://api.djiwatentram.web.id");
		expect(CUSTOMER_AUTH_BASE).toBe("https://api.djiwatentram.web.id/v1/auth");
		expect(CUSTOMER_API_BASE).toBe("https://api.djiwatentram.web.id/v1/customer");
	});
});
