import { describe, expect, test } from "bun:test";
import { resolveBookingAssetUrl } from "../src/lib/asset-url";

describe("booking asset URLs", () => {
  test("rewrites the retired Supabase hostname to the live storage host", () => {
    expect(resolveBookingAssetUrl("https://supabase.yumme.id/storage/v1/object/public/app-assets/products/menu.jpg"))
      .toBe("https://supabase.djiwatentram.web.id/storage/v1/object/public/app-assets/products/menu.jpg");
  });

  test("builds a public storage URL for a relative asset path", () => {
    expect(resolveBookingAssetUrl("app-assets/products/menu.jpg"))
      .toBe("https://supabase.djiwatentram.web.id/storage/v1/object/public/app-assets/products/menu.jpg");
  });

  test("preserves already valid external image URLs", () => {
    expect(resolveBookingAssetUrl("https://ordermieyamin.yumme.id/mie-yamin-product.png"))
      .toBe("https://ordermieyamin.yumme.id/mie-yamin-product.png");
  });
});
