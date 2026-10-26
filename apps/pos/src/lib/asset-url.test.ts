import { describe, expect, it } from "bun:test";
import { resolvePosAssetUrl } from "./asset-url";

const objectPath = "/storage/v1/object/public/app-assets/migrated/products/menu-image.jpg";

describe("resolvePosAssetUrl", () => {
	it("moves legacy Supabase image hosts to the active storage host", () => {
		expect(resolvePosAssetUrl(`https://supabase.yumme.id${objectPath}`)).toBe(
			`https://supabase.djiwatentram.web.id${objectPath}`,
		);
		expect(resolvePosAssetUrl(`https://xaemykhjpkgypqqpfdcb.supabase.co${objectPath}`)).toBe(
			`https://supabase.djiwatentram.web.id${objectPath}`,
		);
	});

	it("keeps active and independent public image URLs usable", () => {
		expect(resolvePosAssetUrl(`https://supabase.djiwatentram.web.id${objectPath}`)).toBe(
			`https://supabase.djiwatentram.web.id${objectPath}`,
		);
		expect(resolvePosAssetUrl("https://ordermieyamin.yumme.id/mie-yamin-product.png")).toBe(
			"https://ordermieyamin.yumme.id/mie-yamin-product.png",
		);
	});

	it("normalizes storage-relative values and rejects storage IDs without a path", () => {
		expect(resolvePosAssetUrl(objectPath.slice(1))).toBe(
			`https://supabase.djiwatentram.web.id${objectPath}`,
		);
		expect(resolvePosAssetUrl("kg27q5bn2a6322kmtf5aqxgpg182sgnc")).toBeUndefined();
		expect(resolvePosAssetUrl("   ")).toBeUndefined();
	});
});
