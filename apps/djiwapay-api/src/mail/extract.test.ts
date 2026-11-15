import { describe, expect, test } from "bun:test";
import { domainOf, extractPayment, forwardingCode, guessCategory, isConfident, isSecretMail, issuerFor, parseRupiah, parseWhen, redact } from "./extract";

describe("rupiah and dates", () => {
  test("parses Indonesian and English number formats", () => {
    expect(parseRupiah("1.250.000")).toBe(1250000);
    expect(parseRupiah("Rp 25.000")).toBe(25000);
    expect(parseRupiah("1,250,000.50")).toBe(1250000.5);
    expect(parseRupiah("125.000,00")).toBe(125000);
    expect(parseRupiah("1,5")).toBe(1.5);
    expect(parseRupiah("20.000.")).toBe(20000);
    expect(parseRupiah("")).toBe(0);
  });
  test("reads WIB timestamps in several layouts", () => {
    expect(parseWhen("15/11/2026 13:45")).toBe(Date.UTC(2026, 10, 15, 6, 45));
    expect(parseWhen("15 Nov 2026 13.45")).toBe(Date.UTC(2026, 10, 15, 6, 45));
    expect(parseWhen("2026-11-15 13:45")).toBe(Date.UTC(2026, 10, 15, 6, 45));
    expect(parseWhen("tidak ada tanggal")).toBeNull();
  });
});

describe("sender allowlist", () => {
  test("matches the domain and its subdomains only", () => {
    expect(issuerFor(domainOf("BCA <noreply@bca.co.id>"))?.id).toBe("bca");
    expect(issuerFor("mail.gopay.co.id")?.id).toBe("gopay");
    expect(issuerFor("bca.co.id.evil.com")).toBeNull();
    expect(issuerFor("notbca.co.id")).toBeNull();
  });
});

describe("secrets and forwarding", () => {
  test("never reads one-time codes or password resets", () => {
    expect(isSecretMail("Kode OTP Anda", "Kode verifikasi 123456, jangan berikan ke siapa pun")).toBe(true);
    expect(isSecretMail("Reset password", "klik untuk reset password")).toBe(true);
    expect(isSecretMail("Pembayaran berhasil", "Pembayaran Rp 25.000 ke Kopi Kenangan")).toBe(false);
  });
  test("catches the Gmail forwarding code, only from Google", () => {
    expect(forwardingCode("forwarding-noreply@google.com", "Gmail Forwarding Confirmation", "Confirmation code: 123456789")).toBe("123456789");
    expect(forwardingCode("evil@example.com", "Gmail Forwarding Confirmation", "Confirmation code: 123456789")).toBeNull();
  });
});

// Synthetic examples: wording modelled on typical notifications, NOT copied from real mail. Real samples are still needed.
describe("payment extraction", () => {
  test("e-wallet payment", () => {
    const x = extractPayment("Pembayaran berhasil", "Pembayaran ke Kopi Kenangan sebesar Rp 25.000 berhasil pada 15/11/2026 13:45. No. Referensi: GP2611151345AB");
    expect(x).toMatchObject({ amount: 25000, direction: "out", merchant: "Kopi Kenangan", ref: "GP2611151345AB", at: Date.UTC(2026, 10, 15, 6, 45) });
    expect(isConfident(x)).toBe(true);
  });
  test("bank transfer received", () => {
    const x = extractPayment("Dana masuk", "Rekening ****1234 menerima transfer dari Budi Santoso sebesar Rp 1.500.000 pada 15 Nov 2026 09.10");
    expect(x).toMatchObject({ amount: 1500000, direction: "in", accountHint: "1234", merchant: "Budi Santoso" });
  });
  test("ignores balance and fee lines when picking the amount", () => {
    const x = extractPayment("Transaksi kartu", "Pembelian di Indomaret Rp 48.500. Biaya admin Rp 2.500. Saldo Rp 5.000.000");
    expect(x.amount).toBe(48500);
    expect(x.direction).toBe("out");
  });
  test("a reference label without a value is not a reference", () => {
    expect(extractPayment("Pembayaran", "Pembayaran ke Toko Rp 10.000. No. Referensi: tidak tersedia").ref).toBe("");
    expect(extractPayment("Pembayaran", "Referensi dan bukti ada di aplikasi. Pembayaran ke Toko Rp 10.000").ref).toBe("");
  });
  test("is not confident when the direction is unclear", () => {
    const x = extractPayment("Notifikasi", "Transaksi Rp 10.000 tercatat");
    expect(x.direction).toBe("unknown");
    expect(isConfident(x)).toBe(false);
  });
  test("categorises from merchant and subject", () => {
    expect(guessCategory("Kopi Kenangan", "", "out")).toBe("makan");
    expect(guessCategory("PLN", "Token listrik", "out")).toBe("tagihan");
    expect(guessCategory("", "Gaji November", "in")).toBe("gaji");
    expect(guessCategory("Toko X", "", "out")).toBe("belanja");
  });
  test("masks long numbers before a model sees them", () => {
    expect(redact("Kartu 4111 1111 1111 1234 dan rek 1234567890")).toBe("Kartu ••••1234 dan rek ••••••7890");
  });
});
