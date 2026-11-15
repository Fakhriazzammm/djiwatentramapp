/** Real mail, kept as a test so the rules learned from it cannot quietly regress.
 *
 *  Every case here was once shown on screen as a rupiah figure that never happened: a promo read as a
 *  purchase, a survey as income, a bill reminder as a payment, a failed transfer as a payment, a
 *  history as one transaction, a top-up read as income on the wrong account, and a 2026 date read as
 *  2021. Bodies are the mail's own layout (padding, field names, wording) with the person's name
 *  replaced. If one of these fails, the ledger will show money that never moved.
 */
import { describe, expect, test } from "bun:test";
import {
  extractPayment, implausible, isBillReminder, isConfident, isFailedMail, isNoticeMail, isPromo, isReportMail, parseWhen,
} from "./extract";

describe("telkomsel and indihome", () => {
  const reminder = "Plgn Yth, tagihan IndiHome bulan ini Rp340215. Jatuh tempo tgl 20-OCT-26, bayar dengan klik: tsel.id/bayarindihome Terimakasih jika sudah bayar";
  const reminder2 = "Plgn Yth, tagihan IndiHome bulan ini Rp337440. Lakukan pembayaran dengan klik link: tsel.id/bayarindihome Terimakasih jika sudah bayar";
  const paid = " --> Pelanggan Telkomsel yang Terhormat, Terima kasih atas kesetiaan dan kepercayaan Anda untuk terus berlangganan Telkomsel. Kami informasikan bahwa pembayaran tagihan Anda sebesar Rp340215 pada tanggal 2026-10-21 melalui MKM telah berhasil.. Pesan pemberitahuan ini dikirim secara otomatis oleh sistem dan Anda tidak perlu membalasnya.";

  test("a reminder to pay is not a payment", () => {
    expect(isBillReminder("Bill Event", reminder)).toBe(true);
    expect(isBillReminder("Bill Event", reminder2)).toBe(true);
  });

  test("the confirmation of that same bill is a payment", () => {
    expect(isBillReminder("Bill Event", paid)).toBe(false);
    const x = extractPayment("Bill Event", paid);
    expect(x.amount).toBe(340215);
    expect(x.direction).toBe("out");
    expect(parseWhen(paid)).toBe(Date.UTC(2026, 9, 21) - 7 * 3600_000);
  });

  test("an e-bill padded with table markup is still a reminder", () => {
    const padded = "INFO BILLING\n" + "   Nomor Pelanggan \n   : 131427173880 \n\n".repeat(90) +
      "Jumlah Tagihan : Rp340.215,- Tanggal Jatuh Tempo: 20 November 2026 PEMBAYARAN TAGIHAN Bayar Sekarang atau melalui merchant pilihan";
    expect(isBillReminder("Informasi Tagihan IndiHome", padded)).toBe(true);
  });
});

describe("livin' by mandiri", () => {
  // The body is a padded table: fields and values sit on separate lines.
  const topUp = `      Livin' by Mandiri
   
       Top-up Berhasil

    Halo MOCHAMMAD A , 

 Berikut adalah detail transaksi Anda:
 
 
       Penyedia Jasa
 GoPay Customer 
 ****9831 
 
  
 
   Tanggal  15 Nov 2026 
    
 
   Jam  22:12:53 WIB 
    
 
   Nominal Top-up  Rp 41.000,00 
    
 
   Biaya Transaksi  Rp 1.200,00 
    
 
   Total Transaksi  Rp 42.200,00 
    
 
   No. Referensi  702611152212511787 
    
 
   Rekening Sumber  
 MOCHAMMAD A  
 ****4399 
`;
  const transfer = `      Livin' by Mandiri
   
       Transfer Berhasil

    Halo MOCHAMMAD A , 

 Berikut adalah detail transaksi Anda:
 
 
       Penerima
 DIAN SITI FATIMAH 
 Bank Mandiri - 1770020151020 
  
 
   Tanggal  13 Nov 2026 
    
 
   Jam  13:01:45 WIB 
    
 
   Jumlah Transfer  Rp 162.000,00 
    
 
   No. Referensi  2611131122029932703 
    
 
   Rekening Sumber  
 MOCHAMMAD A  
 ****4399 
`;

  test("a top-up from the bank leaves the bank account, not the wallet", () => {
    const x = extractPayment("Top-up Berhasil", topUp);
    expect(x.amount).toBe(42200);            // what the account was debited, fee included
    expect(x.direction).toBe("out");
    expect(x.accountHint).toBe("4399");      // not the GoPay number ****9831
    expect(x.merchant).toBe("GoPay Customer");
    // 15 Nov 2026 WIB (the mail prints the date and the hour on separate rows)
    expect(new Date(x.at!).toISOString()).toBe("2026-11-14T17:00:00.000Z");
  });

  test("an outgoing transfer names the recipient, not the bank", () => {
    const x = extractPayment("Transfer Berhasil", transfer);
    expect(x.amount).toBe(162000);
    expect(x.direction).toBe("out");
    expect(x.accountHint).toBe("4399");
    expect(x.merchant).toBe("DIAN SITI FATIMAH");
  });

  test("a wallet-side top-up keeps the nominal and counts as money in", () => {
    const x = extractPayment("Top-up Berhasil", "Top-up GoPay sebesar Rp 100.000 berhasil pada 15/11/2026 08.00");
    expect(x.amount).toBe(100000);
    expect(x.direction).toBe("in");
  });
});

describe("campaigns, surveys, reports and notices", () => {
  test("a promo is not a purchase, and its ceiling is not a price", () => {
    const x = extractPayment("Spesial 11.11: Hemat s.d. Rp3,5 Juta!", "Buruan! Spesial 11.11, hemat s.d. Rp3,5 Juta! Jangan lewatkan, klik link. Syarat dan ketentuan berlaku. Berhenti berlangganan email di sini.");
    expect(isPromo("Spesial 11.11: Hemat s.d. Rp3,5 Juta!", "Buruan! hemat s.d. Rp3,5 Juta! Jangan lewatkan, syarat dan ketentuan. Berhenti berlangganan.")).toBe(true);
    expect(x.amount).not.toBe(4);
  });

  test("a survey that promises a reward is a campaign", () => {
    const body = "Isi di sini & dapatkan Rp20.000! Yuk luangkan 5 menit untuk mengisi survei singkat kami. Ada 20 responden beruntung. Berhenti berlangganan email di sini.";
    expect(isPromo("Pendapatmu penting buat Jago", body)).toBe(true);
  });

  test("a periodic report is not one transaction", () => {
    expect(isReportMail("Laporan Transaksi Merchant BCA 004069399 DJIWA TENTRAM Hasil Settlement per 09-11-2026")).toBe(true);
    expect(isReportMail("Riwayat transaksi tagihan GoPay")).toBe(true);
  });

  test("a transfer that failed moved no money", () => {
    expect(isFailedMail("Transfer Tidak Berhasil")).toBe(true);
    expect(isFailedMail("Pembayaran Berhasil!")).toBe(false);
  });

  test("a scam warning and a fee that will be charged move no money", () => {
    expect(isNoticeMail("Hati-Hati Terhadap Modus Penipuan Investasi Emas", "Kenali modusnya dan cara menghadapinya.")).toBe(true);
    expect(isNoticeMail("Info terkait biaya Kantong tidak aktif", "Biaya tidak aktif sebesar Rp10.000 akan didebet setiap bulan.")).toBe(true);
  });

  test("a starting price is not a purchase", () => {
    expect(extractPayment("Mulai beli emas dari Rp5.000 aja!", "Mulai dari Rp5.000 aja, kamu sudah bisa beli emas langsung dari aplikasi Jago.").amount).toBe(0);
  });
});

describe("the read must agree with the mail", () => {
  const date = Date.UTC(2026, 9, 21, 6, 46);

  test("an amount the mail never printed is not trusted", () => {
    expect(implausible("Promo Rp 25.000 untuk kamu", { amount: 8_097, at: date }, date)).toContain("amount-not-printed");
    expect(implausible("Pembayaran sebesar Rp 25.000 berhasil", { amount: 25000, at: date }, date)).toEqual([]);
  });

  test("a date years away from the mail means the date was misread", () => {
    expect(implausible("Pembayaran Rp 25.000", { amount: 25000, at: Date.UTC(2021, 9, 26) }, date)).toContain("date-drift");
    expect(implausible("Pembayaran Rp 25.000", { amount: 25000, at: date - 3 * 86400_000 }, date)).toEqual([]);
  });

  test("a mail with no readable date is not punished", () => {
    expect(implausible("Pembayaran Rp 25.000", { amount: 25000, at: null }, null)).toEqual([]);
  });

  test("every real shape above still counts as money only when it says it was paid", () => {
    const x = extractPayment("Pembayaran Berhasil!", "Pembayaran ke SPBU sebesar Rp 50.000 berhasil pada 15/11/2026 13:45. No. Referensi GP2611151345A1");
    expect(isConfident(x)).toBe(true);
    expect(implausible("Pembayaran ke SPBU sebesar Rp 50.000 berhasil", x, Date.UTC(2026, 10, 15, 6))).toEqual([]);
  });
});
