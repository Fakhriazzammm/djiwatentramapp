import { describe, expect, it } from "bun:test";
import { resolveCanonicalAssetUrl, resolveCanonicalUrl } from "./canonical-url";

describe("canonical first-party URL resolver", () => {
  it("maps known legacy storage origin and preserves path, query, and hash", () => {
    expect(resolveCanonicalUrl("https://supabase.yumme.id/storage/v1/object/public/app-assets/menu.jpg?download=1#hero"))
      .toBe("https://supabase.djiwatentram.web.id/storage/v1/object/public/app-assets/menu.jpg?download=1#hero");
  });

  it("does not rewrite signed URLs", () => {
    const signed = "https://supabase.yumme.id/storage/v1/object/public/app-assets/menu.jpg?token=abc&expires=123";
    expect(resolveCanonicalUrl(signed)).toBe(signed);
  });

  it("leaves third-party, relative, and non-network values unchanged", () => {
    expect(resolveCanonicalUrl("https://images.example.com/menu.jpg?x=1")).toBe("https://images.example.com/menu.jpg?x=1");
    expect(resolveCanonicalUrl("/assets/menu.jpg")).toBe("/assets/menu.jpg");
    expect(resolveCanonicalUrl("data:image/png;base64,abc")).toBe("data:image/png;base64,abc");
  });

  it("selects the first usable product image candidate", () => {
    expect(resolveCanonicalAssetUrl(null, "", "https://supabase.yumme.id/products/a.jpg"))
      .toBe("https://supabase.djiwatentram.web.id/products/a.jpg");
    expect(resolveCanonicalAssetUrl(undefined, " ")).toBeUndefined();
  });
});
