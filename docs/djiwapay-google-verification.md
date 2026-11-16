# Djiwa Pay: membuka integrasi Google untuk pengguna lain

Status 2026-11-16: project OAuth masih **Testing**. Akun yang belum didaftarkan sebagai penguji ditolak Google dengan `Error 403: access_denied` ("belum menyelesaikan proses verifikasi"). Ini pengaturan di Google Cloud, bukan bug kode. Djiwa Travel mengalami hal yang sama persis (`LESSONS.md` 2026-10-30) dan belum menyelesaikannya.

## Pilihan, dari yang tercepat

| Cara | Batas | Pengalaman pengguna |
|---|---|---|
| **A. Tambah penguji** (Audience → Test users) | 100 akun, izin kedaluwarsa tiap 7 hari | Lolos, tetapi harus didaftarkan satu per satu dan menyambung ulang tiap minggu |
| **B. Publish app: In production, belum diverifikasi** | sekitar 100 pengguna | Layar "Google belum memverifikasi aplikasi ini" → Lanjutan → Buka Djiwa Pay. Token tidak kedaluwarsa |
| **C. Verifikasi Google** | tanpa batas | Tanpa layar peringatan. Wajib untuk lebih dari 100 pengguna |

`gmail.readonly` adalah scope **restricted**: verifikasinya memerlukan penilaian keamanan tahunan berbayar (CASA). `calendar.events` adalah scope **sensitive**: verifikasi gratis, tanpa CASA. `drive.file` tidak sensitif.

## Rekomendasi arsitektur untuk membuka ke publik
Verifikasi berlaku per project Google. Selama `gmail.readonly` ada di consent screen yang sama, seluruh verifikasi ikut terhambat CASA. Pisahkan:
- **Project "Djiwa Pay"**: Calendar + Drive + Sheets (+ email dasar). Diverifikasi sebagai scope sensitive (tanpa CASA). Dibuka untuk umum.
- **Project "Djiwa Pay Mail"**: hanya `gmail.readonly`. Tetap Testing atau tanpa verifikasi (maks. 100 pengguna) sampai ada kebutuhan dan anggaran CASA.
- Untuk pengguna umum tanpa Gmail langsung: **email terusan** (tanpa scope Gmail), yang sudah berjalan.

Perubahan kode untuk pemisahan: dua pasang kredensial (`GOOGLE_CLIENT_ID/SECRET` dan `GMAIL_CLIENT_ID/SECRET`), tabel koneksi per penyedia, dan tombol Gmail memakai klien kedua. Belum dikerjakan.

## Checklist verifikasi (Google Cloud → Google Auth platform)
**Branding**
- Nama aplikasi: `Djiwa Pay`; logo 120×120 (maskot, `apps/djiwapay/public/pwa-192.png` diperkecil); email dukungan pengguna dan email kontak developer.
- Halaman beranda: `https://djiwapay.web.id` (menampilkan layar masuk dengan tautan privasi dan syarat).
- Kebijakan privasi: `https://djiwapay.web.id/privasi`. Syarat layanan: `https://djiwapay.web.id/syarat`.
- Domain resmi: `djiwapay.web.id` (verifikasi kepemilikan di Search Console; rekaman TXT dipasang di DNS Helipod dengan `update_dns_record`, jangan `set_dns_records`).

**Data access (scope)** dan alasan yang bisa disalin ke formulir:
- `calendar.events`: "Membuat satu acara pengingat berulang untuk tiap tagihan rutin yang dicatat pengguna. Tidak membaca acara lain."
- `drive.file`: "Membuat folder Djiwa Pay, menyimpan foto struk yang dipindai pengguna, dan membuat satu Spreadsheet keuangan yang disinkronkan dua arah. Hanya file buatan aplikasi."
- `gmail.readonly` (project terpisah): "Mencari email notifikasi pembayaran dari bank dan e-wallet terdaftar (`from:`) untuk mencatat nominal, arah, toko, dan waktu. Isi email tidak disimpan."

**Video demo** (tampilkan alur lengkap, di browser, dengan URL terlihat): masuk → Integrasi → layar persetujuan Djiwa Pay → layar Google yang menampilkan scope → hasilnya (acara di Calendar, folder dan Spreadsheet di Drive, catatan dari email) → Putuskan Google.

**Kebijakan**: halaman `/privasi` sudah memuat pernyataan Limited Use dan menyebut tiap scope. Pastikan email kontak resmi ditambahkan di consent screen (Google memeriksa ini).

## Langkah cepat sekarang
1. Google Cloud → Audience → **Add users**: tambahkan akun yang mau mencoba (cara A), **atau**
2. Audience → **Publish app** (cara B) agar siapa saja bisa menyambung, dengan layar peringatan.
