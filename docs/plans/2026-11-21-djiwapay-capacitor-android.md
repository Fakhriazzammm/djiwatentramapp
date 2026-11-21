# Rencana: APK Android Djiwa Pay dengan Capacitor

Sumber: `apps/djiwapay` (Vite + React, PWA di https://djiwapay.web.id). Bahasa Indonesia, 21 Nov 2026.

## Kondisi sekarang (hasil pemeriksaan)
- Web sudah PWA (`public/manifest.webmanifest`, `sw.js`, ikon 192/512/maskable).
- Auth: better-auth, base URL `${PAY_ORIGIN}/api/auth`, `credentials: "include"` (cookie), login **Google OAuth** lewat `authClient.signIn.social` (`src/lib/identity-adapter.ts`).
- API keuangan di `apps/djiwapay-api` (Hono) diakses dari origin web.
- Fitur perangkat yang dipakai: kamera (`getUserMedia` di scan aset & scanner QR/`BarcodeDetector`), clipboard, `navigator.share`.
- Ada service worker + `update-watcher` (cek `version.json`) yang akan bentrok dengan model "bundle di dalam APK".
- Mesin ini: belum ada Java/JDK dan Android SDK.

## Keputusan utama: dua mode
| | A. Bundle lokal (disarankan jangka panjang) | B. Remote URL (cepat) |
|---|---|---|
| Cara | `webDir: dist`, aset di dalam APK | `server.url = https://djiwapay.web.id` |
| Update | Rilis APK baru (atau Capgo/Live Update) | Otomatis seperti web |
| Cookie auth | Origin `https://localhost` → **lintas-origin**, perlu CORS+SameSite=None atau token | Same-origin, tidak berubah |
| Risiko Play Store | Aman | Ditolak jika "hanya pembungkus situs"; perlu nilai native |

**Rekomendasi:** mulai dari **B** untuk uji internal (1 hari), lalu pindah ke **A** sebelum Play Store karena kebijakan wrapper dan agar offline/cepat. Rencana di bawah menganggap A; langkah B ditandai.

## Fase 0 — Prasyarat (mesin build)
1. `brew install --cask temurin@17` (JDK 17) dan Android Studio (SDK 35, build-tools, platform-tools).
2. Set `ANDROID_HOME`, `JAVA_HOME`.
3. Siapkan keystore rilis: `keytool -genkeypair ... -keystore djiwapay-release.jks` — **simpan di luar repo + cadangan**; kehilangan = tidak bisa update aplikasi.
4. Akun Google Play Console (USD 25, sekali) bila mau ke Play Store; untuk bagi APK langsung tidak perlu.

## Fase 1 — Pasang Capacitor
Di `apps/djiwapay`:
```
bun add @capacitor/core @capacitor/android
bun add -d @capacitor/cli
bunx cap init "Djiwa Pay" id.web.djiwapay --web-dir dist
bunx cap add android
```
- `appId` final harus dipilih sekarang (tidak bisa diganti setelah rilis): usul `id.web.djiwapay.app`.
- `capacitor.config.ts`: `webDir: "dist"`, `androidScheme: "https"`, `server.allowNavigation: ["djiwapay.web.id", "accounts.google.com"]`.
- Folder `android/` dikomit ke git; `android/app/build`, `*.jks`, `keystore.properties` masuk `.gitignore`.
- Skrip: `"cap:sync": "vite build && cap sync android"`, `"cap:open": "cap open android"`.
- Mode B: tambah `server.url` dan lewati Fase 3.

## Fase 2 — Penyesuaian kode web
1. **Deteksi native**: `Capacitor.isNativePlatform()` dipakai untuk:
   - Tidak mendaftarkan service worker (`src/lib/pwa.ts`) dan menonaktifkan `update-watcher` & banner "pasang aplikasi" (`features/pwa`).
   - Mengganti cek `version.json` dengan cek versi terhadap versi APK (tampilkan "Perbarui aplikasi" → Play Store).
2. **Base URL API/auth absolut**: `PAY_ORIGIN` jangan relatif; di native harus `https://djiwapay.web.id` (atau origin API).
3. **Build khusus**: `vite build --mode native` (tanpa `write-version-manifest` yang mengubah public bila perlu; base `./`).
4. Safe-area: pastikan `viewport-fit=cover` + `env(safe-area-inset-*)` (sudah dipakai di iOS PWA; verifikasi di Android) dan atur StatusBar `@capacitor/status-bar` (warna sesuai tema).
5. Tombol back Android: `@capacitor/app` `backButton` → tutup sheet/halaman dulu, baru keluar (aplikasi punya banyak sheet; ini sumber bug umum).

## Fase 3 — Autentikasi (bagian paling berisiko)
Google menolak OAuth di WebView tertanam (`disallowed_useragent`). Pilihan:
- **Disarankan:** `@capacitor/browser` (Chrome Custom Tab) + **deep link / App Link** kembali ke app.
  1. Login ditandai `returnTo = id.web.djiwapay.app://auth` (atau https App Link `djiwapay.web.id/auth/native`).
  2. Setelah callback server, halaman `/auth/native` mengalihkan ke skema app membawa **one-time code** pendek.
  3. App menukar code → sesi (endpoint baru di `djiwapay-api`/better-auth), simpan token di `@capacitor/preferences` atau Secure Storage (`capacitor-secure-storage-plugin`), kirim sebagai `Authorization: Bearer` karena cookie lintas-origin rapuh di WebView.
- Alternatif: Google Sign-In native (`@capgo/capacitor-social-login`) → kirim ID token ke better-auth (`signIn.social({ idToken })`). Lebih mulus, butuh OAuth client Android (SHA-1 keystore) di Google Cloud.
- Server: tambah `https://localhost`, `capacitor://localhost` ke `trustedOrigins`/CORS, dan dukung header Bearer. **Perlu perubahan API + deploy** (ikuti `docs/DEPLOYMENT_VPS_WORKFLOW.md`).
- Catatan: verifikasi OAuth Google (`docs/djiwapay-google-verification.md`) tidak berubah; tambahkan paket + SHA-1 jika memakai klien Android.

## Fase 4 — Fitur native
| Web | Native | Plugin |
|---|---|---|
| Kamera / scan QR | Izin runtime `CAMERA`, WebView getUserMedia perlu `onPermissionRequest` (Capacitor menangani) | `@capacitor/camera` atau `@capacitor-mlkit/barcode-scanning` (lebih cepat & andal dari jsQR) |
| Share | Share sheet | `@capacitor/share` |
| Clipboard | Sama | `@capacitor/clipboard` |
| Notifikasi | (nanti) push FCM | `@capacitor/push-notifications` — **tahap 2**, perlu Firebase |
| Haptics, status bar, splash | Polesan | `@capacitor/haptics`, `status-bar`, `splash-screen` |
Fallback ke API web bila bukan native, sehingga PWA tetap jalan.

## Fase 5 — Aset & branding
- Ikon adaptif dan splash dari `public/pwa-512.png` / `pwa-maskable-512.png` via `@capacitor/assets generate --android`.
- Nama app "Djiwa Pay", warna tema sesuai `manifest.webmanifest`.
- Ikon notifikasi monokrom (nanti, untuk push).

## Fase 6 — Build & uji
1. Debug: `bun run cap:sync && bunx cap run android` (emulator/HP USB).
2. Checklist uji: login Google (kembali ke app), sesi bertahan setelah ditutup, catat transaksi, scan QR bayar, kamera aset, unggah struk, tombol back, rotasi/keyboard menutupi input, mode offline (layar `offline.html` diganti layar offline native), jaringan lambat, update versi.
3. Rilis: `android/app/build.gradle` → `versionCode` (naik tiap rilis; ambil dari `scripts/BUILD_NUMBER`) & `versionName`; konfigurasi `signingConfigs` dari `keystore.properties`.
   - APK uji: `./gradlew assembleRelease`
   - Play Store: `./gradlew bundleRelease` (AAB, wajib untuk Play).
4. Skrip `scripts/ship-android.sh` (di mesin build, bukan VPS): build web → sync → gradle → salin ke `dist-android/`. Tidak menyentuh alur deploy web.

## Fase 7 — Distribusi
- Cepat: bagikan APK lewat tautan (mis. `djiwapay.web.id/download/djiwapay.apk`) + petunjuk "izinkan sumber tidak dikenal". Hosting memakai alur ship-artifacts yang ada.
- Play Store: internal testing → closed → produksi. Siapkan: kebijakan privasi (sudah ada di halaman verifikasi Google), formulir Data Safety, tangkapan layar (ada di `marketing/`), deklarasi akses data keuangan/SMS bila relevan. App finansial perlu mengisi *Financial features declaration*.
- Digital Asset Links bila memakai https App Link: `/.well-known/assetlinks.json` di web.

## Risiko & hal yang perlu keputusan Anda
1. **Mode A atau B?** (rekomendasi: B untuk uji dulu, A untuk Play Store).
2. **Cara login**: Custom Tab + deep link (lebih sedikit setup Google) vs Google native (lebih mulus).
3. **Play Store atau bagi APK langsung?** Menentukan kebutuhan AAB, deklarasi finansial, dan akun developer.
4. `appId` permanen dan penyimpanan keystore.
5. Push notification: tahap berikutnya (Firebase).
6. iOS: Capacitor juga bisa, tetapi butuh akun Apple Developer (USD 99/th) — di luar rencana ini.

## Estimasi
| Fase | Waktu |
|---|---|
| 0–1 pasang & jalan di emulator (mode B) | 0,5–1 hari |
| 2 penyesuaian web | 1 hari |
| 3 auth native + perubahan API | 1–2 hari |
| 4–5 plugin, ikon, splash | 1 hari |
| 6–7 uji, tanda tangan, listing Play | 1–2 hari |
Total ± 5–7 hari kerja untuk rilis Play Store; ± 1 hari untuk APK uji mode B.

## Langkah pertama yang saya usulkan
Fase 0 + 1 dalam mode B → APK debug yang membuka djiwapay.web.id, untuk memeriksa kamera, scan QR, dan login Google di perangkat nyata sebelum investasi ke Fase 2–3.
