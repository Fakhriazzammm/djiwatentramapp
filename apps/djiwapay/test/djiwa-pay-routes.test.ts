import { describe, expect, test } from "bun:test";
import { checkoutCustomerNumberHint, isKnownPayPath, parsePpobPath, parseWalletPath, postpaidServiceForCategory } from "../src/lib/djiwa-pay-routes";

describe("Djiwa Pay route contract", () => {
  test.each([
    ["/", true],
    ["/wallet", true],
    ["/wallet/topup", true],
    ["/wallet/transfer", true],
    ["/wallet/receive", true],
    ["/wallet/history", true],
    ["/wallet/history/123", true],
    ["/wallet/help", true],
    ["/wallet/withdraw", false],
    ["/wallet/card", false],
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

  test("restores quick actions and transaction details from a direct URL", () => {
    expect(parseWalletPath("/wallet/topup")).toEqual({ page: "topup" });
    expect(parseWalletPath("/wallet/transfer")).toEqual({ page: "transfer" });
    expect(parseWalletPath("/wallet/receive")).toEqual({ page: "receive" });
    expect(parseWalletPath("/wallet/help")).toEqual({ page: "help" });
    expect(parseWalletPath("/wallet/history/transfer%20123")).toEqual({ page: "history", transactionId: "transfer 123" });
    expect(parseWalletPath("/wallet/topup/extra")).toBeNull();
  });

  test("keeps unavailable categories on their own route", () => {
    expect(parsePpobPath("/ppob/bpjs")).toEqual({ category: "bpjs" });
    expect(parsePpobPath("/ppob/tv")).toEqual({ category: "tv" });
  });

  test("restores postpaid service from a direct URL", () => {
    expect(postpaidServiceForCategory("pln-bill")).toBe("pln");
    expect(postpaidServiceForCategory("pdam")).toBe("pdam");
    expect(postpaidServiceForCategory("pulsa")).toBeNull();
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
});
