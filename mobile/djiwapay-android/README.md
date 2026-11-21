# Djiwa Pay Android (Capacitor)

Cangkang Android yang memuat https://djiwapay.web.id (mode remote URL). Rilis web otomatis sampai ke app; APK baru
hanya perlu bila plugin/ikon/izin/konfigurasi native berubah. Folder ini di luar workspace `apps/*`, jadi tidak
memengaruhi build/deploy web.

## Build (di Mac, bukan VPS)
`scripts/ship-android.sh` → `mobile/djiwapay-android/dist-android/djiwapay.apk` (uji/bagi langsung) dan `djiwapay.aab` (Play Store).
Alat: `~/.local/android/` (JDK 21, Android SDK 35). Keystore: `~/.local/android/keys/` (**cadangkan di luar Mac ini; hilang = tidak bisa memperbarui app**).
versionCode = `scripts/BUILD_NUMBER`.

## Yang perlu dilakukan sekali oleh pemilik (konsol Google, tidak bisa diotomasi)
Login Google di app memakai akun Google perangkat (Credential Manager). Di Google Cloud project yang sama dengan
Web client `559298319721-…`, buat **OAuth client ID tipe Android** untuk package `id.web.djiwapay.app`, satu per sidik jari:
- Rilis (upload key): SHA-1 `7A:72:97:10:B1:C4:55:32:40:CF:74:E0:8F:8C:06:8F:DA:F6:DC:4E`
- Debug: `keytool -list -v -keystore ~/.android/debug.keystore -storepass android` (SHA-1-nya)
- Jika memakai Play App Signing: tambah SHA-1 "App signing key certificate" dari Play Console > Integritas app.
Tanpa ini, tombol masuk di app gagal (DEVELOPER_ERROR); web biasa tidak terpengaruh.
Server auth tidak diubah: Better Auth menerima ID token dengan audience Web client yang sudah ada.

## Play Store
1. Play Console (USD 25) → buat app "Djiwa Pay" → unggah `djiwapay.aab` ke Internal testing.
2. Kelengkapan: kebijakan privasi (URL halaman privasi Djiwa Pay), Data Safety (email, info keuangan, foto struk, kamera),
   deklarasi fitur keuangan, tangkapan layar (ada di `marketing/djiwapay-launch/assets/`), ikon 512 (`apps/djiwapay/public/pwa-512.png`).
3. Internal → Closed → Production.

## Uji manual yang belum bisa dilakukan otomatis
Login Google (butuh klien Android di atas), kamera/scan QR di HP asli, tombol back dengan sheet terbuka.
Sudah diverifikasi di emulator Android 14: app membuka situs live, `window.Capacitor` native dengan plugin App/SocialLogin/
Share/StatusBar/SplashScreen, back handler terpasang, banner "pasang app" tidak muncul.
