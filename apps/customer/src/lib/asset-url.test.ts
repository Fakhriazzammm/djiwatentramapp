import { resolveCustomerAssetUrl } from "@/lib/asset-url";

declare const describe: (name: string, fn: () => void) => void;
declare const it: (name: string, fn: () => void) => void;
declare const expect: (value: unknown) => { toBe(expected: unknown): void };

describe("customer asset URL resolution", () => {
	it("moves legacy Djiwa storage URLs to the reachable canonical host", () => {
		expect(resolveCustomerAssetUrl("https://supabase.djiwatentram.web.id/storage/v1/object/public/app-assets/migrated/products/item.jpg"))
			.toBe("https://supabase.djiwatentram.web.id/storage/v1/object/public/app-assets/migrated/products/item.jpg");
	});
});
