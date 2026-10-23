import { describe, expect, test } from "bun:test";
import { availablePpobServiceKeys, checkoutCustomerNumberHint, isKnownPayPath, parsePpobPath } from "../src/lib/djiwa-pay-routes";

describe("Djiwa Pay route contract", () => {
  test.each([
    ["/", true],
    ["/wallet", true],
    ["/ppob", true],
    ["/ppob/pulsa", true],
    ["/ppob/pulsa/produk/TSEL5/detail", true],
    ["/ppob/pulsa/produk/TSEL5/konfirmasi", true],
    ["/ppob/pulsa/produk/TSEL5/struk", true],
    ["/settings", false],
    ["/ppob/pdam", true],
    ["/ppob/pulsa/unknown/TSEL5/detail", false],
  ])("recognizes %s as %s", (pathname, expected) => {
    expect(isKnownPayPath(pathname)).toBe(expected);
  });

  test("parses a product route for browser history restoration", () => {
    expect(parsePpobPath("/ppob/pulsa/produk/TSEL5/konfirmasi")).toEqual({
      category: "pulsa",
      productCode: "TSEL5",
      stage: "konfirmasi",
    });
  });

  test("explains why the detail step cannot continue without a number", () => {
    expect(checkoutCustomerNumberHint("")).toBe("Masukkan nomor tujuan untuk melanjutkan.");
    expect(checkoutCustomerNumberHint("08123")).toBe("Nomor tujuan harus 8–20 digit.");
    expect(checkoutCustomerNumberHint("081234567890")).toBeNull();
  });

  test("exposes only PPOB services with an active IAK flow", () => {
    expect(availablePpobServiceKeys).toEqual(["pulsa", "data", "pln-token", "pln-bill", "pdam", "game", "etoll", "emeterai"]);
  });
});
