# Push marketing Djiwa Pay

Admin: `/admin/push` (menu "Push"). Kampanye dibuat, diuji, dijadwalkan, dijeda, dibatalkan, dan diukur di sana.

## Alur
1. Pengguna mengizinkan notifikasi. Web: Web Push (VAPID, sudah ada). Android: plugin `@capacitor/push-notifications` mendaftarkan token FCM ke `POST /api/finance/push/fcm`.
2. Perangkat disimpan di `finance.push_subscriptions` (`platform` = `web` atau `android`; Android memakai `endpoint = fcm:<token>`).
3. Pilihan orang: `finance.push_prefs` (`marketing`, `topics` = fitur/promo/tips). Diatur di Aplikasi & notifikasi. Tanpa baris = default semua topik menyala.
4. Admin membuat kampanye (`finance.push_campaigns`). Saat dimulai, penerima dipilih dan satu baris per perangkat masuk `finance.push_deliveries`.
5. Pekerja per menit (`tick`) memulai yang jatuh tempo dan melanjutkan yang berjalan. Kode: `apps/djiwapay-api/src/push-marketing.ts`.

## Aturan (di `pickDevices`, diuji)
- Hanya yang `marketing` menyala dan topiknya dipilih.
- Maksimal 1 push marketing per hari dan 3 per minggu per orang (dihitung dari `push_deliveries` berstatus sent).
- Jam tenang 21.00 sampai 07.00 WIB: kampanye menunggu pagi (bisa dimatikan per kampanye).
- Kanal yang belum dikonfigurasi dilewati, bukan digagalkan: Android baru ikut bila `FCM_SERVICE_ACCOUNT` ada.
- Perangkat mati (410/404, UNREGISTERED) dihapus.
- Audiens: "Semua perangkat" atau segmen email (aktif, tidak aktif, belum mencatat, dst). Persetujuan email tidak dipakai; push punya persetujuan sendiri.

## Pelacakan dibuka
Payload membawa `did` (id pengiriman). Web: service worker memanggil `POST /api/finance/push/opened` saat notifikasi diketuk. Android: aplikasi memanggilnya dari `pushNotificationActionPerformed`.

## Mengaktifkan Android (sekali, oleh pemilik)
1. Firebase Console: buat proyek, tambah aplikasi Android `id.web.djiwapay.app`, unduh `google-services.json` ke `mobile/djiwapay-android/android/app/`.
2. Firebase > Project settings > Service accounts > Generate new private key. Pasang isinya di `/etc/djiwatentramapp/djiwapay-api.env` sebagai `FCM_SERVICE_ACCOUNT='<json satu baris>'` (atau `FCM_SERVICE_ACCOUNT_FILE=<path>`), lalu restart `djiwapay-api`.
3. `scripts/ship-android.sh`, unggah AAB baru ke Play. Pengguna harus memperbarui aplikasi.
Tanpa langkah ini, Android tetap mendaftar tetapi tidak dikirimi; admin menampilkan peringatan.

## Belum dikerjakan
A/B judul, kirim di jam biasa aktif tiap orang, cadangan email untuk yang tidak terjangkau push, otomasi pemicu, filter versi aplikasi.
