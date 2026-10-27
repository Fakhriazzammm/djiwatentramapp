import { describe, expect, test } from "bun:test";
import { djiwaPaySplashLabel } from "../src/lib/djiwa-pay-splash";

describe("Djiwa Pay splash labels", () => {
  test.each([
    ["/", "Kembali ke Djiwa Pay"],
    ["/wallet/topup", "Membuka Isi Saldo"],
    ["/wallet/transfer", "Membuka Kirim Saldo"],
    ["/wallet/transfer?mode=scan", "Membuka Pemindai QR"],
    ["/wallet/receive", "Membuka Terima Saldo"],
    ["/wallet/history", "Membuka Riwayat"],
    ["/wallet/history/123", "Membuka Detail Transaksi"],
    ["/wallet/help", "Membuka Bantuan"],
    ["/ppob", "Membuka Pembayaran PPOB"],
    ["/ppob/pulsa", "Membuka Pembayaran PPOB"],
    ["/ppob/pulsa/produk/TSEL5/detail", "Menyiapkan Pembayaran"],
    ["/ppob/pulsa/produk/TSEL5/konfirmasi", "Menyiapkan Pembayaran"],
    ["/ppob/pulsa/produk/TSEL5/struk", "Menyiapkan Struk"],
  ])("describes %s as %s", (path, expected) => {
    expect(djiwaPaySplashLabel(path)).toBe(expected);
  });

  test("keeps unknown destinations on the generic back label", () => {
    expect(djiwaPaySplashLabel("/wallet")).toBe("Kembali ke Djiwa Pay");
    expect(djiwaPaySplashLabel("")).toBe("Kembali ke Djiwa Pay");
  });
});
