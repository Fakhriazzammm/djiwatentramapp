# Desain Sinkronisasi Sistem Pembayaran Djiwa Tentram

## Intent

Menyamakan seluruh metode pembayaran pada `apps/customer`, `apps/pos`, dan
`apps/admin` dengan Supabase sebagai sumber kebenaran status order dan transaksi
keuangan. Tujuan utamanya adalah mencegah QRIS terbaca sebagai tunai, mencegah
status dibayar tanpa transaksi keuangan, dan memastikan receipt, notifikasi,
dashboard, laporan, serta riwayat memakai data pembayaran yang sama.

## Goals

- Menetapkan metode canonical: `cashier_cash`, `qris_mayar`, dan `djiwa_pay`.
- Menetapkan lifecycle canonical: `pending`, `paid`, `completed`, `cancelled`.
- Menjadikan settlement Supabase RPC sebagai satu-satunya jalur perubahan
  finansial dari pending ke paid/completed.
- Menjamin idempotensi: retry webhook, POS, admin, atau customer tidak menggandakan
  transaksi keuangan maupun reward.
- Menyamakan label dan filter pembayaran di POS, admin, notifikasi, ekspor, dan
  laporan.
- Mempertahankan kompatibilitas data lama (`cash`, `tunai`, `cashier`, `qris`,
  `qris_mayar`, `mayar`, `wallet`, `djiwa_pay`).

## Non-goals

- Mengubah tarif, pajak, diskon, atau aturan promo.
- Mengganti provider Mayar atau mekanisme saldo Djiwa Pay.
- Menghapus data transaksi historis.
- Mengubah domain atau target deployment; deployment tetap ke `djiwa-vps`.

## Approaches considered

1. **Perbaikan terarah per app.** Cepat, tetapi kontrak pembayaran tetap dapat
   bercabang dan bug yang sama mudah muncul kembali.
2. **Kontrak shared + backend-first settlement (dipilih).** Normalizer dan label
   shared dipakai semua app, sedangkan Supabase RPC memvalidasi metode, status,
   transaksi, receipt, dan idempotensi. Ini memberi konsistensi dengan scope
   perubahan yang masih terukur.
3. **Migrasi total seluruh data ke enum baru.** Paling bersih secara teori,
   tetapi berisiko pada data lama dan tidak diperlukan untuk menyelesaikan alur
   runtime.

## Design

### Canonical payment contract

Shared code akan menyediakan normalizer dari legacy values ke:

- `cashier_cash`: pembayaran tunai di kasir; pending sebelum kasir menerima uang.
- `qris_mayar`: QRIS melalui Mayar; pending sampai provider mengonfirmasi paid.
- `djiwa_pay`: saldo internal; pending/held sampai wallet settlement berhasil.

Persisted provenance tetap disimpan (`payment_method`,
`payment_receipt_kind`, `payment_gateway`) agar audit dan kompatibilitas tetap
terjaga. `payment_receipt_kind` tidak boleh bernilai `cashier_pending` untuk
order QRIS.

### Backend settlement

Supabase akan menjadi boundary settlement:

- Cashier RPC: validasi order pending + metode cash, insert income sekali,
  update order menjadi paid, dan mengalokasikan receipt.
- Mayar settlement RPC/webhook: validasi invoice/transaction id, update gateway
  provenance, insert income sekali, dan update order menjadi paid.
- Wallet settlement RPC: mempertahankan hold/capture/release dan memastikan
  income serta reward hanya dibuat sekali.

Setiap RPC menggunakan order lock/idempotency key dan mengembalikan state order
terbaru. Client tidak lagi membuat transaksi keuangan secara manual saat
settlement.

### App responsibilities

- `apps/customer`: membuat order pending dan memulai provider flow; membaca
  status settlement dari order/backend.
- `apps/pos`: menampilkan pending payment, memanggil cashier RPC untuk uang tunai,
  dan menampilkan hasil settlement tanpa optimistic paid state.
- `apps/admin`: memakai helper/RPC yang sama untuk tindakan pembayaran dan tidak
  memakai generic status update untuk menyelesaikan pembayaran.
- `pos-notifications`: memetakan metode dari canonical resolver dan membuat
  event pending/paid yang konsisten.
- Reports/finance/export: memakai canonical resolver dan hanya menghitung
  transaksi finansial berstatus `completed` yang memiliki order reference.

### Compatibility and migration

Legacy values dibaca melalui normalizer. Data historis tidak diubah massal pada
fase pertama. Migration SQL hanya memperbaiki constraint/RPC/view yang diperlukan
dan menambahkan regression queries.

## Verification requirements

- Unit tests untuk normalizer, label, lifecycle, dan idempotency decisions.
- Integration SQL test transaksional untuk cash, Mayar, wallet, retry, dan
  invalid method/status.
- Build `apps/customer`, `apps/pos`, dan `apps/admin`.
- Smoke check endpoint/domain production setelah deploy ke `djiwa-vps`.
- Verifikasi bahwa satu order settled menghasilkan tepat satu financial
  transaction dan satu canonical payment event.
