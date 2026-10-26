import { describe, expect, test } from "bun:test";
import { ppobProductName, type PpobProduct } from "../src/lib/wallet-adapter";

const product = (overrides: Partial<PpobProduct>): PpobProduct => ({
  product_code: "TEST",
  product_description: "Test product",
  product_nominal: "10000",
  product_price: 11000,
  product_type: "pulsa",
  status: "active",
  ...overrides,
});

describe("PPOB product naming", () => {
  test("formats numeric nominal values as a package amount", () => {
    expect(ppobProductName(product({ product_nominal: "10000" }))).toBe("Paket 10.000");
  });

  test("keeps descriptive nominal values instead of rendering NaN", () => {
    expect(ppobProductName(product({ product_nominal: "DANA Rp 10.000" }))).toBe("DANA Rp 10.000");
    expect(ppobProductName(product({ product_nominal: "Arena Breakout 1.580 Bonds" }))).toBe("Arena Breakout 1.580 Bonds");
  });

  test("uses the product description when the provider sends NaN", () => {
    expect(ppobProductName(product({ product_nominal: "NaN", product_description: "Telkomsel Internet 5GB" }))).toBe("Telkomsel Internet 5GB");
  });

  test("falls back to description when nominal is empty", () => {
    expect(ppobProductName(product({ product_nominal: "", product_description: "E-Meterai" }))).toBe("E-Meterai");
  });
});
