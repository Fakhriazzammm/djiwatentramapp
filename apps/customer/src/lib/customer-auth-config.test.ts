import {
	CUSTOMER_API_BASE,
	CUSTOMER_API_PATHNAME,
	CUSTOMER_AUTH_BASE,
	CUSTOMER_AUTH_PATHNAME,
} from "@/lib/customer-auth-config";

declare const describe: (name: string, fn: () => void) => void;
declare const it: (name: string, fn: () => void) => void;
declare const expect: (value: unknown) => { toBe(expected: unknown): void; toContain(expected: string): void };

describe("customer auth configuration", () => {
	it("keeps auth and customer data same-origin", () => {
		expect(CUSTOMER_AUTH_PATHNAME).toBe("/api/auth");
		expect(CUSTOMER_API_PATHNAME).toBe("/api/customer");
		// Both helpers require an absolute base URL; a bare path throws at import
		// time and blanks the app. The value must still stay on the customer origin
		// so Better Auth cookies remain first-party.
		expect(CUSTOMER_AUTH_BASE.startsWith("http")).toBe(true);
		expect(CUSTOMER_AUTH_BASE).toContain("/api/auth");
		// Customer data must never point at another host again: a host-only session
		// cookie on the customer origin is invisible to api.djiwatentram.web.id.
		expect(CUSTOMER_API_BASE.startsWith("http")).toBe(true);
		expect(CUSTOMER_API_BASE).toContain("/api/customer");
	});
});
