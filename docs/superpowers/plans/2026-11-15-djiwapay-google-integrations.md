# Djiwa Pay — Integrasi Google (Calendar, Sheets, Drive) + Pencatatan otomatis dari email

Status: rencana, belum ada kode. Disusun 2026-11-15 setelah membaca implementasi Google di Djiwa Travel (`vps-djiwa-travel`, `~/djiwatravel`, hanya baca).

## 1. Yang sudah dilakukan Travel (dan kita tiru)

| Hal | Cara Travel | Berlaku untuk Pay |
|---|---|---|
| Koneksi Google terpisah dari login | Login lewat Better Auth, sedangkan "Hubungkan Google" adalah OAuth kedua dengan scope sendiri | Ya. Jangan memperluas scope login |
| Scope bertahap | `include_granted_scopes=true`, fitur dipilih satu per satu (`calendar`, `drive`, `sheets`) | Ya |
| Scope sempit | `calendar.events`, `drive.file` (hanya file yang dibuat app; Sheets lewat Drive) | Ya |
| Token | Hanya di Postgres, AES-256-GCM, kunci di env VPS. Browser hanya menerima email akun + status fitur | Ya, di Postgres Helipod |
| Idempotensi | Tabel pemetaan `itinerary_item_id → event_id`, `receipt_scan_id → drive_file_id`, status `pending/uploading/uploaded/failed/revoked` + `attempts` | Ya |
| Persetujuan | Sheet bahasa sederhana "yang bisa dan tidak bisa dilakukan Djiwa" sebelum layar Google | Ya |
| Pelajaran | `redirect_uri_mismatch` harus didaftarkan persis; consent screen mode Testing membatasi 100 user dan refresh token mati dalam 7 hari | Ya, lihat risiko |

## 2. Temuan penting: Gmail berbeda dari tiga lainnya

Calendar dan Drive/Sheets memakai scope non-sensitif atau sensitif biasa. **Membaca Gmail (`gmail.readonly`) adalah scope "restricted".** Konsekuensi (cek ulang dokumen Google saat eksekusi, kebijakannya berubah):

1. Aplikasi harus lolos verifikasi OAuth Google, termasuk penilaian keamanan pihak ketiga (CASA) yang berulang tiap tahun dan berbayar.
2. Selama belum terverifikasi, mode Testing: maksimal 100 pengguna uji dan refresh token kedaluwarsa 7 hari. Pengguna umum melihat layar "aplikasi belum diverifikasi".
3. Kebijakan Limited Use: data Gmail hanya untuk fitur yang pengguna lihat, tidak boleh dipakai melatih model, dan pengiriman ke LLM pihak ketiga harus dibatasi dan diungkapkan.
4. **Jangan menambahkan scope Gmail ke OAuth client yang dipakai bersama aplikasi Tentram lain.** Itu menyeret semua aplikasi ke tinjauan restricted. Buat project/client Google terpisah untuk integrasi Pay.

Karena itu ide Anda dipecah menjadi dua jalur untuk sumber email, tanpa mengubah hasil akhirnya.

## 3. Pencatatan otomatis dari email: dua jalur, satu pipeline

### Jalur A (dirilis dulu): Kotak masuk teruskan, tanpa scope Gmail
- Setiap pengguna mendapat alamat unik, mis. `u7k2m9@catat.djiwapay.web.id` (Helipod Email inbound: `set_email_inbound`, `list_inbox_addresses`; butuh MX untuk subdomain; perlu dicek biaya dan kuota paket).
- Pengguna membuat satu filter Gmail: dari domain bank/e-wallet → teruskan ke alamat itu. Aplikasi menampilkan langkah bergambar dan menangkap kode verifikasi penerusan Gmail otomatis, jadi pengguna tidak menyalin kode manual.
- Keuntungan: tidak ada izin baca Gmail, tidak ada verifikasi Google, bisa dipakai semua orang dari hari pertama, dan data yang masuk hanya email yang pengguna pilih sendiri.
- Kekurangan: ada satu langkah setup manual di Gmail. Bisa juga dipakai dari Outlook atau Yahoo.

### Jalur B (menyusul): Sambungkan Gmail langsung
- Aktif setelah verifikasi Google lolos. Satu ketukan "Hubungkan Gmail", tanpa filter manual.
- Hanya mengambil pesan yang cocok dengan allowlist pengirim lewat query `from:(...)` dan label, bukan seluruh kotak masuk. Pemicu: `users.watch` + Pub/Sub, atau polling `history.list` tiap beberapa menit dengan `historyId`.
- Keputusan go/no-go: bila jumlah pengguna Jalur A sudah ada dan biaya CASA masuk akal.

### Pipeline bersama (setelah email diterima)
1. **Gerbang keamanan:** pengirim harus lolos allowlist domain dan header `Authentication-Results` (SPF/DKIM/DMARC pass), karena email notifikasi mudah dipalsukan. Abaikan email OTP, PIN, dan reset kata sandi, bahkan tanpa menyimpannya.
2. **Parser berlapis:** (a) templat deterministik per penerbit, murah dan akurat; (b) cadangan LLM murah lewat Helipod AI Gateway dengan skema JSON ketat dan validasi, mengikuti pola `receipt.ts`; (c) bila gagal, masuk antrean tinjau.
3. **Skema hasil:** `amount`, `direction` (masuk/keluar/transfer), `counterparty/merchant`, `channel` (BCA, GoPay, ...), `account_hint` (4 digit terakhir), `occurred_at` (WIB), `reference_no`, `confidence`. Isi email lengkap **tidak disimpan**; hanya field terurai dan hash pesan.
4. **Dedup tiga lapis:** (i) `message_id` unik per pengguna; (ii) `reference_no` bila ada; (iii) kecocokan kabur dengan catatan yang sudah ada (jumlah sama, ±10 menit, akun sama), termasuk catatan otomatis wallet Djiwa Pay dan hasil scan struk. Kecocokan dengan scan struk digabung: nominal dari bank, rincian item dari struk.
5. **Pemetaan dompet:** akun dibuat otomatis ("BCA ••1234") saat pertama muncul, lalu pengguna bisa mengganti nama atau menggabungkan.
6. **Deteksi transfer antar milik sendiri:** keluar dari BCA + masuk ke GoPay dalam jendela waktu yang sama menjadi satu transfer, bukan pengeluaran + pemasukan.
7. **Kategori:** aturan merchant → kategori yang dipelajari dari koreksi pengguna; bila baru, tebak dengan LLM lalu minta konfirmasi.
8. **Rute kepercayaan:** keyakinan tinggi dan merchant dikenal → langsung tercatat dengan lencana "dari email" dan tombol Urungkan. Selain itu → antrean "Perlu ditinjau" dengan setuju sekali ketuk. Pengguna baru mulai dengan mode tinjau semua selama 10 catatan pertama.

### Penerbit yang disasar (urutan prioritas, perlu contoh email asli)
BCA, Mandiri, BRI, BNI, CIMB, Jago, Jenius, blu; GoPay, OVO, DANA, ShopeePay, LinkAja; Grab, Gojek, Tokopedia, Shopee (struk itemized); PLN, Telkom/IndiHome, BPJS (tagihan). Kumpulkan 15–20 contoh anonim per penerbit sebelum membuat parser.

## 4. Calendar, Sheets, Drive untuk Pay

- **Calendar:** `Tagihan rutin` → acara dengan pengingat (idempotent via tabel pemetaan seperti Travel). Tagihan yang terdeteksi dari email (jatuh tempo PLN, IndiHome) otomatis membuat tagihan + acara. Opsional: kalender "Djiwa Pay" terpisah agar tidak mengotori kalender utama.
- **Drive (`drive.file`):** foto struk dipindah dari disk VPS ke folder `Djiwa Pay/Struk/2026-11` milik pengguna. Data milik pengguna, disk VPS hemat, dan tidak perlu scope sensitif. Cadangan JSON bulanan opsional.
- **Sheets (`drive.file`):** ekspor laporan bulanan ke Spreadsheet. Tahap 2: dua arah seperti Travel (migrasi 044), dengan aturan konflik jelas (server menang untuk id sama, seperti sinkronisasi kita).
- Semua memakai satu koneksi per pengguna, scope bertahap, status tanpa token ke browser.

## 5. Model data (skema `finance` di Postgres Helipod)

- `google_connections(user_id pk, access_enc, refresh_enc, expires_at, email, granted_scopes[], state_hash, state_expires, connected_at)`
- `google_calendar_events(bill_id pk, user_id, calendar_id, event_id, unique(calendar_id,event_id))`
- `google_drive_files(receipt_id pk, user_id, file_id, folder_id, status, attempts, last_error)` dan `google_sheet_exports(user_id, spreadsheet_id, status, last_synced_at, ...)`
- `inbound_sources(user_id, kind: forward|gmail, address, verified_at, enabled)`
- `inbound_messages(user_id, message_id unique, sender_domain, parsed jsonb, confidence, status: auto|review|ignored|duplicate|failed, entry_id, created_at)`
- `merchant_rules(user_id, pattern, category_id, account_id, learned_from)`
- `sender_templates(sender_domain, version, matcher, active)` untuk parser yang bisa diperbarui tanpa rilis aplikasi.

Entri catatan bertambah `source: "email"` dan `inboundId`. Tidak ada token Google di `localStorage` atau di state yang disinkronkan.

## 6. API (`apps/djiwapay-api`)

`GET/POST /api/finance/google/{status,connect,callback,disconnect}`, `POST /google/calendar/sync`, `POST /google/sheets/export`, `GET/POST /inbound/source` (buat, verifikasi, hapus alamat), webhook `POST /inbound/mail` (dari Helipod Email, ditandatangani), `GET /inbound/review`, `POST /inbound/:id/{approve,reject,edit}`. Semua memakai `user_id` dari sesi terverifikasi, bukan dari input.

## 7. UI/UX

- **Pengaturan → Integrasi:** kartu per layanan (Google Calendar, Drive & Sheets, Email pembayaran) dengan status, email akun, tombol Putuskan, dan bahasa jelas "Yang bisa / tidak bisa dilakukan Djiwa Pay".
- **Beranda:** chip "3 perlu ditinjau" bila ada antrean; hilang bila kosong.
- **Antrean tinjau:** daftar kartu besar (nominal, merchant, dompet, kategori) dengan Setuju, Ubah, Abaikan; aksi massal "Setujui yang yakin".
- **Setup email dalam 3 langkah:** salin alamat → buat filter Gmail (langkah bergambar) → kirim email uji. Kode verifikasi penerusan terisi otomatis.
- Catatan otomatis tampil dengan lencana "Email" dan bisa dibuka untuk melihat asalnya (pengirim, jam), tanpa isi email.

## 8. Privasi dan keamanan

- Persetujuan eksplisit sebelum setiap sumber; dapat dicabut kapan saja. Putuskan = hapus token, hentikan pemrosesan, dan opsional hapus data email-turunan.
- Tidak menyimpan isi email, hanya field terurai + hash. Retensi `inbound_messages` dibatasi (mis. 90 hari untuk status `review/ignored`).
- Redaksi nomor kartu/rekening penuh sebelum dikirim ke LLM; hanya 4 digit terakhir.
- Log tanpa isi email. Kunci enkripsi token di env VPS, tidak di repo.
- Kebijakan privasi Djiwa Pay diperbarui: apa yang dibaca, untuk apa, dan bahwa data tidak dipakai melatih model. Perhatikan UU PDP.
- Rate limit dan batas ukuran pada webhook masuk; tolak lampiran besar.

## 9. Tahapan

| Fase | Isi | Selesai bila |
|---|---|---|
| 0. Persiapan | Project/client Google baru untuk Pay; daftarkan redirect URI `https://djiwapay.web.id/api/finance/google/callback`; cek status consent screen; kumpulkan contoh email per penerbit | Client siap dan ≥15 contoh email per penerbit prioritas |
| 1. Fondasi Google | Koneksi, token terenkripsi, status, sheet persetujuan, putuskan | Hubungkan/putuskan jalan, tanpa token di browser |
| 2. Drive + Sheets + Calendar | Struk ke Drive, ekspor Sheet, tagihan ke Calendar | Idempoten, status gagal bisa dicoba ulang |
| 3. Jalur A email | Domain inbound, alamat per pengguna, pipeline, antrean tinjau, parser BCA/Mandiri/GoPay/OVO/DANA dulu | Akurasi nominal ≥99%, tanpa duplikat pada set uji |
| 4. Perluasan | Penerbit lain, deteksi transfer, tagihan dari email, pembelajaran merchant | Akurasi kategori ≥85% setelah 10 koreksi |
| 5. Jalur B Gmail langsung | Hanya bila verifikasi Google dan biaya CASA disetujui | Lolos verifikasi |

Fase 1–2 tidak bergantung pada email dan bisa dirilis lebih dulu.

## 10. Risiko dan jawaban

| Risiko | Penanganan |
|---|---|
| Verifikasi Gmail lama/mahal | Jalur A dulu; Jalur B opsional |
| Email palsu memicu catatan | Allowlist domain + cek SPF/DKIM + rute tinjau untuk keyakinan rendah |
| Template bank berubah | Parser versi + cadangan LLM + antrean tinjau + metrik kegagalan per penerbit |
| Duplikat dengan wallet/scan struk | Dedup tiga lapis dan penggabungan |
| Token Google dicabut atau kedaluwarsa | Status `revoked`, banner "Hubungkan ulang", tidak gagal diam-diam |
| Biaya LLM | Parser deterministik dulu, LLM hanya cadangan, kuota harian seperti scan struk |
| Kebocoran data | Tanpa isi email, redaksi, retensi pendek, tidak ada token di klien |

## 11. Keputusan yang dibutuhkan dari pemilik produk

1. Setuju memulai dari Jalur A (teruskan email) dan menunda Gmail langsung?
2. Boleh membuat project/client Google baru untuk Pay (agar tidak menyentuh client Tentram)?
3. Domain inbound: `catat.djiwapay.web.id` (butuh MX di DNS) atau paket email Helipod yang lain?
4. Bisa menyediakan contoh email notifikasi asli (anonim) dari bank dan e-wallet yang Anda pakai?
5. Status consent screen Google yang ada: masih Testing atau In production? (Pengaruh langsung ke keandalan.)
