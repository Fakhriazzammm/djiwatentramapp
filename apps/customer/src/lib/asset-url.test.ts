import { describe, expect, test } from "bun:test";
import { resolveCustomerAssetUrl } from "./asset-url";

describe("customer storage origin migration", () => {
  test("moves legacy self-hosted and cloud objects to the new storage", () => {
    for (const origin of ["https://supabase.yumme.id", "https://xaemykhjpkgypqqpfdcb.supabase.co"]) {
      expect(resolveCustomerAssetUrl(`${origin}/storage/v1/object/public/app-assets/menu.jpg?download=1#hero`))
        .toBe("https://supabase.djiwatentram.web.id/storage/v1/object/public/app-assets/menu.jpg?download=1#hero");
    }
  });
  test("retains canonical, external, relative and data images", () => {
    for (const value of ["https://supabase.djiwatentram.web.id/image.jpg", "https://images.example.com/menu.jpg", "/logo-djiwa.png", "data:image/png;base64,abc"]) {
      expect(resolveCustomerAssetUrl(value)).toBe(value);
    }
    expect(resolveCustomerAssetUrl(" ")).toBeUndefined();
  });
});
