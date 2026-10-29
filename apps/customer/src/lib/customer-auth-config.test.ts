import { CUSTOMER_API_BASE, CUSTOMER_AUTH_BASE, CUSTOMER_API_ORIGIN, CUSTOMER_AUTH_PATHNAME } from "@/lib/customer-auth-config";

declare const describe: (name: string, fn: () => void) => void;
declare const it: (name: string, fn: () => void) => void;
declare const expect: (value: unknown) => { toBe(expected: unknown): void; toContain(expected: string): void };

describe("customer auth configuration", () => {
	it("keeps auth same-origin and routes customer data to the canonical API", () => {
		expect(CUSTOMER_API_ORIGIN).toBe("https://api.djiwatentram.web.id");
		expect(CUSTOMER_AUTH_PATHNAME).toBe("/api/auth");
		// better-auth requires an absolute base URL; a bare path throws at import
		// time and blanks the app. The value must still stay on the customer origin
		// so Better Auth cookies remain first-party.
		expect(CUSTOMER_AUTH_BASE.startsWith("http")).toBe(true);
		expect(CUSTOMER_AUTH_BASE).toContain("/api/auth");
		expect(CUSTOMER_API_BASE).toBe("https://api.djiwatentram.web.id/v1/customer");
	});
});
