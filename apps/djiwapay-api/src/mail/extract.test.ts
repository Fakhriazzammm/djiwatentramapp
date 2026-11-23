import { describe, expect, test } from "bun:test";
import { groupKey, domainOf, extractPayment, forwardingCode, guessCategory, isBillReminder, isConfident, isFailedMail, isNoticeMail, isPromo, isReportMail, isSecretMail, issuerFor, parseRupiah, parseWhen, redact } from "./extract";

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
    expect(parseWhen("pembayaran pada tanggal 2026-10-21 melalui MKM")).toBe(Date.UTC(2026, 9, 20, 17, 0));
    expect(parseWhen("tagihan 20-OCT-26 jatuh tempo")).toBeNull();
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
  test("a merchant name stops where the next field starts", () => {
    expect(extractPayment("Transfer", "Transfer ke rekening sendiri berhasil. Penerima: DANA. Jumlah Rp 200.000 pada 20/11/2026 10:00").merchant).toBe("DANA");
    expect(extractPayment("Dana masuk", "Transfer dari BCA sebesar Rp 200.000 diterima").merchant).toBe("BCA");
    expect(extractPayment("Bayar", "Pembayaran ke PT. Tokopedia Indonesia sebesar Rp 50.000 berhasil").merchant).toBe("PT. Tokopedia Indonesia");
    expect(extractPayment("Bayar", "Pembayaran ke Kopi Kenangan, Rp 25.000").merchant).toBe("Kopi Kenangan");
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

describe("direction and account", () => {
  test("a bank mail that names the source account is money out", () => {
    const x = extractPayment("Top-up Berhasil", "Penyedia Jasa GoPay Customer ****9831 Nominal Top-up Rp 41.000,00 Total Transaksi Rp 42.200,00 No. Referensi 702611152212511787 Rekening Sumber MOCHAMMAD FAKHRI AZZ ****4399");
    // the bank debited 42.200 (fee included), so the account still matches the statement
    expect(x.amount).toBe(42200);
    expect(x.direction).toBe("out");
    expect(x.accountHint).toBe("4399");
    expect(x.merchant).toBe("GoPay Customer");
  });
  test("a wallet top-up with no source account is money in", () => {
    expect(extractPayment("Top-up Berhasil", "Top-up GoPay sebesar Rp 100.000 berhasil").direction).toBe("in");
  });
  test("an outgoing transfer names the recipient, not the bank", () => {
    const x = extractPayment("Transfer Berhasil", "Penerima DIAN SITI FATIMAH Bank Mandiri - 1770020151020 Jumlah Transfer Rp 162.000,00 No. Referensi 2611131122029932703 Rekening Sumber MOCHAMMAD FAKHRI AZZ ****4399");
    expect(x.direction).toBe("out");
    expect(x.merchant).toBe("DIAN SITI FATIMAH");
  });
});

describe("campaigns and reports are not money", () => {
  test("a promo subject with a rupiah figure is ignored, not recorded", () => {
    expect(isPromo("Spesial 11.11: Hemat s.d. Rp3,5 Juta!", "Belanja hemat di Jago, diskon hingga Rp 100.000. Klik di sini.")).toBe(true);
    expect(isPromo("Mau tahu cara hemat bayar tagihan? 👀", "Cek promo terbaru, ada cashback dan voucher.")).toBe(true);
    expect(isPromo("Serunya dapet, promonya juga 😎", "Penawaran spesial untukmu, buruan sebelum berakhir.")).toBe(true);
  });
  test("a receipt that merely mentions cashback is still a receipt", () => {
    expect(isPromo("Pembayaran Berhasil!", "Pembayaran ke Kopi Kenangan sebesar Rp 25.000 berhasil. Kamu dapat cashback Rp 500.")).toBe(false);
    expect(isPromo("Top-up Berhasil", "Top-up GoPay sebesar Rp 100.000 berhasil pada 15/11/2026 08.00.")).toBe(false);
  });
  test("periodic reports are ignored even when they carry a total", () => {
    expect(isReportMail("Laporan Transaksi Merchant BCA 004069399 DJIWA TENTRAM Hasil Settlement per 09-1")).toBe(true);
    expect(isReportMail("Mutasi rekening November")).toBe(true);
    expect(isReportMail("Riwayat transaksi tagihan GoPay")).toBe(true);
    expect(isReportMail("Pembayaran Berhasil!")).toBe(false);
    expect(isReportMail("Transfer Berhasil")).toBe(false);
  });
  test("a survey that promises a reward is a campaign, not money", () => {
    expect(isPromo("Pendapatmu penting buat Jago", "Isi di sini & dapatkan Rp20.000! Yuk luangkan 5 menit untuk mengisi survei singkat kami. Ada 20 responden beruntung. Berhenti berlangganan email di sini.")).toBe(true);
  });
  test("a transfer that failed moved no money", () => {
    expect(isFailedMail("Transfer Tidak Berhasil")).toBe(true);
    expect(isFailedMail("Top-up Tidak Berhasil")).toBe(true);
    expect(isFailedMail("Pembayaran Berhasil!")).toBe(false);
    expect(isFailedMail("Transfer Berhasil")).toBe(false);
  });
  test("a warning or a fee schedule moves no money", () => {
    expect(isNoticeMail("Hati-Hati Terhadap Modus Penipuan Investasi Emas", "Kenali modusnya dan cara menghadapinya.")).toBe(true);
    expect(isNoticeMail("Info terkait biaya Kantong tidak aktif", "Biaya tidak aktif sebesar Rp10.000 akan didebet setiap bulan.")).toBe(true);
    expect(isNoticeMail("Pembayaran Berhasil!", "Pembayaran ke Kopi Kenangan sebesar Rp 25.000 berhasil. Biaya admin Rp 2.500 telah didebet.")).toBe(false);
  });
  test("a starting price is not a purchase", () => {
    const x = extractPayment("Mulai beli emas dari Rp5.000 aja!", "Mulai dari Rp5.000 aja, kamu sudah bisa beli emas langsung dari aplikasi Jago.");
    expect(x.amount).toBe(0);
  });
});

describe("bill reminders are not payments", () => {
  test("a bill asking to be paid is a reminder", () => {
    expect(isBillReminder("Bill Event", "Plgn Yth, tagihan IndiHome bulan ini Rp337440. Jatuh tempo tgl 20-SEP-26, bayar dengan klik: tsel.id/bayarindihome Terimakasih jika sudah bayar")).toBe(true);
    expect(isBillReminder("Informasi Tagihan IndiHome", "RINGKASAN TAGIHAN Jenis Layanan : IndiHome Jumlah Tagihan : Rp340.215,- Tanggal Jatuh Tempo: 20 November 2026 PEMBAYARAN TAGIHAN Bayar Sekarang atau melalui merchant pilihan")).toBe(true);
  });
  test("a confirmation that the bill was already paid is a payment", () => {
    expect(isBillReminder("Bill Event", "Kami informasikan bahwa pembayaran tagihan Anda sebesar Rp340215 pada tanggal 2026-10-21 melalui MKM telah berhasil.")).toBe(false);
  });
  test("reads through the padded table of an e-bill mail", () => {
    const padded = "INFO BILLING\n" + "   Nomor Pelanggan \n   : 131427173880 \n\n".repeat(90) + "Jumlah Tagihan : Rp340.215,- Tanggal Jatuh Tempo: 20 November 2026 PEMBAYARAN TAGIHAN Bayar Sekarang";
    expect(isBillReminder("Informasi Tagihan IndiHome", padded)).toBe(true);
  });
});

describe("amounts that are not payments", () => {
  test("reads the juta/ribu shorthand instead of dropping the scale", () => {
    expect(extractPayment("Pembayaran berhasil", "Pembayaran ke Toko Maju sebesar Rp3,5 Juta berhasil").amount).toBe(3500000);
    expect(extractPayment("Top up berhasil", "Top-up berhasil Rp 25rb pada 15/11/2026 10:00").amount).toBe(25000);
  });
  test("a top-up read from the wallet side is the nominal, not the total", () => {
    const x = extractPayment("Top-up Berhasil", "Nominal Top-up Rp 11.000.000,00 Biaya Transaksi Rp 1.200,00 Total Transaksi Rp 11.001.200,00 No. Referensi 702610060617361525");
    expect(x.amount).toBe(11000000);
    expect(x.direction).toBe("in");
  });
  test("skips a ceiling or a teaser, and takes the real transaction amount", () => {
    const x = extractPayment("Pembayaran berhasil", "Hemat s.d. Rp 3,5 Juta! Pembayaran ke Kopi Kenangan sebesar Rp 25.000 berhasil pada 15/11/2026 13:45");
    expect(x.amount).toBe(25000);
  });
  test("a rupiah figure too small to be a payment leaves the amount empty", () => {
    const x = extractPayment("Notifikasi", "Transaksi Rp 4 tercatat di sistem kami");
    expect(x.amount).toBe(0);
    expect(isConfident(x)).toBe(false);
  });
  test("no transaction wording means no confidence, even with a full set of fields", () => {
    const x = extractPayment("Info", "Belanja di Toko Maju Rp 250.000 pada 15/11/2026 10:00");
    expect(isConfident(x)).toBe(false);
  });
});

describe("shop grouping", () => {
  test("spellings of one shop share a key, machine suffixes are ignored", () => {
    expect(groupKey("TOKO LISTRIK BAROKAH · PAN 9360091800232207169")).toBe("toko listrik barokah");
    expect(groupKey("Toko Listrik Barokah · PAN 9360091800239999999")).toBe("toko listrik barokah");
    expect(groupKey("Toko Listrik Barokah")).toBe("toko listrik barokah");
    expect(groupKey("GoPay Customer")).toBe("gopay customer");
    expect(groupKey("Kopi 99")).toBe("kopi 99");
    expect(groupKey("")).toBe("");
  });
  test("the time printed behind a Jam label is read, not dropped to midnight", () => {
    const at = parseWhen("Tanggal  17 Nov 2026 | Jam  20:31:01 WIB | Nominal Transaksi Rp 58.000,00");
    expect(at).toBe(Date.UTC(2026, 10, 17, 13, 31));   // 20:31 WIB
    expect(parseWhen("Tanggal 17 Nov 2026")).toBe(Date.UTC(2026, 10, 16, 17, 0));   // no time anywhere: midnight as before
  });
});

import { isNoticeMail as noticeMail, issuerFor as issuerOfDomain } from "./extract";
describe("system notices and more issuers", () => {
  test("a system or maintenance notice is not a payment, a transaction notice still is", () => {
    expect(noticeMail("🧑‍🔧 Informasi optimalisasi sistem", "Rp5.000.000")).toBe(true);
    expect(noticeMail("Pemberitahuan Pembaruan Ringkasan Informasi Produk", "")).toBe(true);
    expect(noticeMail("Informasi Transaksi Online - Debit BCA [BERHASIL]", "IDR 25,000.00")).toBe(false);
    expect(noticeMail("Notifikasi Transaksi", "Rp2.460")).toBe(false);
  });
  test("other banks and wallets are recognised by their sending domain", () => {
    for (const [d, id] of [["permatabank.com", "permata"], ["mail.ocbc.id", "ocbc"], ["bsi.co.id", "bsi"], ["flip.id", "flip"], ["allobank.com", "allo"]] as const) expect(issuerOfDomain(d)?.id).toBe(id);
  });
});

import { extractSettlement, isSettlementMail, guessCategory as guessCat, implausible } from "./extract";
describe("merchant settlement is income", () => {
  const bca = "Laporan Transaksi Merchant BCA 004069399 DJIWA TENTRAM Hasil Settlemen";
  const body = `Nama Merchant : DJIWA TENTRAM\nMID : 004069399\nTanggal Settlement : 22/11/2026\nTotal Transaksi : Rp 2.350.000\nMDR : Rp 16.450\nTotal Settlement : Rp 2.333.550\nRekening Tujuan : ****4821`;
  test("a settlement report or payout is recognised, a statement or a failed one is not", () => {
    expect(isSettlementMail(bca, body)).toBe(true);
    expect(isSettlementMail("Pencairan dana berhasil", "Dana penjualan telah dikreditkan")).toBe(true);
    expect(isSettlementMail("Payout Xendit", "Payout amount Rp 1.000.000")).toBe(true);
    expect(isSettlementMail("e-Statement November", "settlement")).toBe(false);
    expect(isSettlementMail("Settlement gagal diproses", "")).toBe(false);
    expect(isSettlementMail("Informasi Transaksi Online - Debit BCA [BERHASIL]", "Rp 25.000")).toBe(false);
  });
  test("the net amount is what counts, with gross and fee kept beside it", () => {
    const x = extractSettlement(bca, body);
    expect(x).toMatchObject({ amount: 2333550, direction: "in", merchant: "DJIWA TENTRAM", accountHint: "4821", gross: 2350000, fee: 16450 });
    expect(x.confidence).toBeGreaterThanOrEqual(0.65);
  });
  test("gross and fee without a net line give the net", () => {
    expect(extractSettlement("Settlement", "Total Penjualan Rp 1.000.000\nBiaya layanan Rp 7.000").amount).toBe(993000);
  });
  test("other wordings of the credited amount", () => {
    expect(extractSettlement("Pencairan saldo", "Dana yang ditransfer ke rekening BCA: Rp 500.000").amount).toBe(500000);
    expect(extractSettlement("Payout", "Net amount: IDR 1,250,000.00").amount).toBe(1250000);
  });
  test("a settlement with no readable amount is zero, not a guess", () => { expect(extractSettlement(bca, "Terlampir laporan transaksi merchant Anda.").amount).toBe(0); });
  test("settlement income is sales, a salary is a salary", () => {
    expect(guessCat("DJIWA TENTRAM", bca, "in")).toBe("penjualan");
    expect(guessCat("", "Gaji November", "in")).toBe("gaji");
  });
});

describe("an amount is not stretched by the next word", () => {
  test("'Rp120.000 Kalau ada pertanyaan' is 120.000, not 120 million, and is not flagged", () => {
    const body = "Transfer ke tujuan berhasil diproses. Waktu Terkirim 17 September 2026 13:14 WIB Nama Tujuan BUDI Nominal Rp120.000 Kalau ada pertanyaan, silakan hubungi kami";
    const x = extractPayment("Transfer ke BUDI berhasil", body), mailDate = Date.parse("2026-09-17T06:14:00Z");
    expect(x.amount).toBe(120000);
    expect(implausible(`Transfer ke BUDI berhasil\n${body}`, x, mailDate)).toEqual([]);
  });
  test("real units still count", () => {
    expect(extractPayment("Promo", "Bayar Rp 50 rb sekarang").amount).toBe(50000);
    expect(implausible("Rp 50 rb", { amount: 50000, at: null }, null)).toEqual([]);
    expect(implausible("Rp 2 jt", { amount: 2_000_000, at: null }, null)).toEqual([]);
  });
});
