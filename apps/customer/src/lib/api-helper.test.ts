// @ts-expect-error Bun provides this module when running tests; the app type-check does not include Bun test types.
import { mock, test, expect } from "bun:test";

mock.module("@/lib/client", () => ({
	createClient: () => ({
		functions: {
			invoke: async () => ({
				data: null,
				error: {
					message: "Edge Function returned a non-2xx status code",
					status: 400,
					context: new Response(JSON.stringify({
						success: false,
						error: { code: "WALLET_ERROR", message: "Wallet customer sedang diblokir" },
					})),
				},
			}),
		},
	} as never),
}));

import { ApiError, invokeEdgeFunction } from "./api-helper";

test("preserves the structured Edge Function error behind a non-2xx response", async () => {
		try {
			await invokeEdgeFunction("customer-wallet", { action: "hold" });
			throw new Error("expected invokeEdgeFunction to reject");
		} catch (error) {
			expect(error).toBeInstanceOf(ApiError);
			expect((error as ApiError).code).toBe("WALLET_ERROR");
			expect((error as ApiError).message).toBe("Wallet customer sedang diblokir");
			expect((error as ApiError).status).toBe(400);
		}
});
