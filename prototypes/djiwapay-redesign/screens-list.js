/* Daftar semua layar prototipe. key = ?s=<key> di index.html. status: baru (belum ada di app), ubah (ada, didesain ulang), ada (ada, gaya baru). */
window.SCREEN_LIST = [
  ["Masuk & keamanan", [
    ["splash", "Splash", "ubah"], ["login", "Masuk", "ubah"], ["pin-create", "Buat PIN", "baru"], ["pin-confirm", "Ulangi PIN", "baru"], ["bio", "Aktifkan Face ID", "baru"]
  ]],
  ["Beranda", [
    ["home", "Beranda (terisi)", "ubah"], ["home-empty", "Beranda (akun baru)", "ubah"], ["home-hidden", "Beranda (saldo disembunyikan)", "baru"], ["home-loading", "Beranda (memuat)", "ubah"], ["home-error", "Beranda (gagal memuat)", "ubah"]
  ]],
  ["Layanan & PPOB", [
    ["services", "Tab Layanan", "ubah"], ["sheet-all-services", "Sheet semua layanan", "ubah"],
    ["ppob-pulsa", "Pulsa — isi nomor", "ubah"], ["ppob-pulsa-ready", "Pulsa — nominal dipilih", "ubah"], ["ppob-data", "Paket data", "ubah"], ["ppob-pln", "Token PLN", "ubah"], ["ppob-game", "Voucher game", "ubah"],
    ["postpaid-pln", "Tagihan PLN — nomor pelanggan", "ubah"], ["postpaid-inquiry", "Tagihan PLN — detail tagihan", "ubah"], ["ppob-unavailable", "Layanan belum tersedia", "ubah"]
  ]],
  ["Pembayaran", [
    ["sheet-confirm", "Konfirmasi pembayaran", "ubah"], ["sheet-insufficient", "Saldo kurang → QRIS otomatis", "ubah"], ["sheet-pin", "Masukkan PIN", "baru"], ["sheet-pin-error", "PIN salah", "baru"],
    ["result-ok", "Hasil: berhasil (struk)", "ubah"], ["result-token", "Hasil: token PLN", "ubah"], ["result-pending", "Hasil: diproses", "ubah"], ["result-failed", "Hasil: gagal", "baru"]
  ]],
  ["Tombol Bayar & Yumi", [
    ["sheet-pay", "Sheet Bayar (tombol tengah)", "baru"], ["sheet-ask", "Sheet Yumi (ketik / bicara)", "baru"], ["sheet-ask-result", "Yumi memahami perintah", "baru"],
    ["scan", "Scan QR", "ubah"], ["sheet-scan-result", "Hasil scan QRIS", "ubah"], ["receive", "Terima saldo (QR)", "ubah"]
  ]],
  ["Isi saldo, kirim, tarik", [
    ["topup", "Isi saldo — nominal", "ubah"], ["qris", "Isi saldo — QRIS menunggu", "ubah"], ["topup-done", "Isi saldo — berhasil", "ubah"],
    ["send", "Kirim — penerima", "ubah"], ["send-amount", "Kirim — nominal", "ubah"], ["sheet-send-confirm", "Kirim — konfirmasi", "ubah"],
    ["withdraw", "Tarik dana — form", "ubah"], ["sheet-withdraw-confirm", "Tarik dana — konfirmasi", "ubah"], ["withdraw-pending", "Tarik dana — diproses", "ubah"]
  ]],
  ["Riwayat & ringkasan", [
    ["history", "Tab Riwayat", "ubah"], ["history-empty", "Riwayat kosong", "ubah"], ["sheet-filter", "Sheet filter", "baru"], ["sheet-period", "Sheet periode", "baru"], ["sheet-txn", "Detail transaksi", "ubah"], ["summary", "Ringkasan bulanan", "baru"]
  ]],
  ["Dompet", [
    ["wallet", "Tab Dompet", "baru"], ["wallet-empty", "Dompet (akun baru)", "baru"], ["sheet-card", "Kartu Djiwa (segera hadir)", "ubah"], ["bills", "Tagihan rutin", "baru"], ["promo", "Promo & voucher", "baru"]
  ]],
  ["Akun & bantuan", [
    ["notif", "Notifikasi", "ubah"], ["notif-empty", "Notifikasi kosong", "ubah"], ["profile", "Akun", "baru"], ["security", "Keamanan", "baru"], ["help", "Bantuan", "ubah"], ["sheet-lang", "Sheet bahasa", "baru"], ["sheet-logout", "Konfirmasi keluar", "baru"]
  ]]
];
