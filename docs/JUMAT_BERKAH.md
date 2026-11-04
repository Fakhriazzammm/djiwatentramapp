# Jumat Berkah (sedekah makanan Rp15.000/porsi)

Program khusus, bukan pesanan kasir. Customer membayar lewat Mayar tanpa memilih menu; dapur menerima rekap total porsi.

## Alur
1. Customer membuka banner/ikon di beranda, halaman `/$username/jumat-berkah` (program), `?step=sedekah` (form, wajib login), `?step=selesai&d=<donationId>` (hasil bayar).
2. Edge function `jumat-berkah` (`create-donation`) membuat baris `pos.jumat_berkah_donations` (reservasi kuota 30 menit) lalu invoice Mayar via `mayar-proxy` dengan `extraData.jumatBerkahDonationId`.
3. Webhook Mayar → antrean → `mayar-payment-processor` → RPC `pos.jumat_berkah_settle_donation` (idempoten, cek nominal). Pembayaran terlewat direkonsiliasi tiap pemrosesan.
4. Saat settle: doa tayang (otomatis bila bersih, lainnya menunggu admin), keuangan dicatat (`Penjualan Jumat Berkah`, income; tanpa HPP dan stok), notifikasi donor + admin, dan event masuk `pos.jumat_berkah_outbox`.
5. Outbox dikuras tiap menit oleh pg_cron → `jumat-berkah` action `drain` (token di `pos.jumat_berkah_settings.cron_token`, bukan di git) → Telegram.

## Jadwal (WIB)
- Pesanan tutup Kamis 21.00; kampanye berikutnya otomatis (`pos.jumat_berkah_tick`, tiap 5 menit).
- Telegram: sedekah masuk (grup Transaksi), milestone 50%/100% (Transaksi + Kitchen), rekap MASAK saat tutup (Kitchen + Transaksi), pengingat Jumat 07.00 (Kitchen), laporan distribusi.

## Konfigurasi
- Telegram memakai bot supervisor (`TELEGRAM_SUPERVISOR_BOT_TOKEN`, sudah ada di edge function dan sudah administrator di kedua grup). ID grup disimpan di `pos.jumat_berkah_settings` (diisi migrasi: [Transaksi] -1003927364523, [Kitchen] -1003953908854) dan bisa diubah di admin → Pengaturan.
- Admin: `ONBOARDING_ADMIN_SECRET` (edge function) dan `VITE_ADMIN_SECRET` (build admin) sudah ada di VPS.
- Tes Telegram dari admin: Ringkasan → Kirim tes.

## Rilis
1. Terapkan migrasi `20261105000000_jumat_berkah.sql` (program masih nonaktif: `enabled=false`).
2. Deploy edge functions `jumat-berkah`, `mayar-payment-processor`, `customer-wallet`.
3. Deploy admin dan customer.
4. Admin → Jumat Berkah → Pengaturan: cek kuota (default 100) dan ID grup, lalu centang "Program aktif".
5. Lakukan satu sedekah nyata 1 porsi, cek: baris donasi paid, doa tayang, transaksi keuangan, notifikasi donor, pesan Telegram di grup Transaksi.

## Foto galeri
Admin mengunggah di tab "Distribusi & Galeri" (diperkecil di browser, disimpan di bucket publik `jumat-berkah` lewat edge function). Tampil di halaman program dan tab Komunitas customer.
