# Djiwa Pay — aturan impor email

Catatan ini menuliskan apa yang boleh dan tidak boleh dibaca dari email transaksi, **beserta alasan
nyata di balik setiap aturan**. Semua contoh di bawah diambil dari mailbox produksi pada November
2026. Jangan melonggarkan aturan di sini tanpa membaca alasannya: setiap baris di tabel kedua pernah
tampil sebagai uang yang sebenarnya tidak pernah berpindah.

Berkas: [`apps/djiwapay-api/src/mail/extract.ts`](../apps/djiwapay-api/src/mail/extract.ts) (pembacaan),
[`pipeline.ts`](../apps/djiwapay-api/src/mail/pipeline.ts) (gerbang sebelum disimpan),
[`audit.ts`](../apps/djiwapay-api/src/mail/audit.ts) (pengawasan antrean), dan tes regresi
[`real-mail.test.ts`](../apps/djiwapay-api/src/mail/real-mail.test.ts).

## Gerbang: urutan pemeriksaan

Sebuah email hanya dibaca kalau lolos semua gerbang berikut, berurutan:

| # | Gerbang | Fungsi | Alasan |
|---|---|---|---|
| 1 | Pengirim dikenal | `issuerFor` | Hanya domain bank/dompet yang terdaftar |
| 2 | Pengirim asli | DKIM/DMARC | Email palsu tidak dibaca |
| 3 | Bukan kode rahasia | `isSecretMail` | OTP/PIN tidak boleh disimpan |
| 4 | Bukan kampanye / laporan | `isPromo`, `isReportMail` | Promo dan rekap bukan satu transaksi |
| 5 | Bukan transaksi gagal / tagihan belum dibayar | `isFailedMail`, `isBillReminder` | Uang belum berpindah |
| 6 | Bukan peringatan / jadwal biaya | `isNoticeMail` | Rupiah disebut, uang tidak bergerak |
| 7 | Hasil bacaan cocok dengan emailnya | `implausible` | Menangkap bentuk baru yang belum dikenal |

Gerbang 7 adalah jaring pengaman, bukan pengganti gerbang 1–6. Ia memeriksa dua hal yang harus selalu
benar untuk transaksi apa pun:

- **Nominal harus benar-benar tercetak di email** (`amount-not-printed`). Kalau angka yang kita pakai
  tidak ada di email, berarti angka itu karangan pembaca — tidak boleh otomatis dicatat.
- **Tanggal tidak boleh jauh dari tanggal email** (`date-drift`, batas 45 hari). Transaksi diberitakan
  pada hari kejadian; selisih bertahun-tahun berarti tanggal salah baca.

Baris yang gagal gerbang 7 tetap masuk antrean tinjauan (dengan `flags` di `parsed`), tetapi tidak
pernah masuk buku secara otomatis dan tidak pernah dihitung "pasti" saat impor.

## Bentuk email yang pernah salah dibaca

| Email | Dulu tercatat | Kenyataan | Aturan |
|---|---|---|---|
| `Spesial 11.11: Hemat s.d. Rp3,5 Juta!` | pengeluaran Rp4 | Kampanye | `isPromo`; batas atas (`s.d.`) diabaikan |
| `Pendapatmu penting buat Jago` (Rp20.000) | pemasukan | Survei berhadiah | kata `survei`/`responden` = kampanye |
| `Laporan Transaksi Merchant BCA … Settlement` | satu transaksi | Laporan periodik | `isReportMail` |
| `Riwayat transaksi tagihan GoPay` | satu transaksi | Riwayat | `isReportMail` (`riwayat`) |
| `Bill Event` "…jatuh tempo… bayar dengan klik" | pengeluaran | Pengingat tagihan | `isBillReminder` |
| `Informasi Tagihan IndiHome` (e-bill) | pengeluaran | Pengingat tagihan | `isBillReminder` + teks diratakan dulu (`flat`) |
| `Bill Event` "…pembayaran tagihan … telah berhasil" | — | **Pembayaran sungguhan** | bukti bayar menang atas `isBillReminder` |
| `Transfer Tidak Berhasil` | pembayaran | Gagal | `isFailedMail` |
| `Hati-Hati Terhadap Modus Penipuan …` | pengeluaran Rp8.097 | Peringatan | `isNoticeMail` |
| `Info terkait biaya Kantong tidak aktif` | pengeluaran Rp10.000 | Biaya **akan** didebet | `isNoticeMail` (`akan didebet`) |
| `Mulai beli emas dari Rp5.000 aja!` | pembelian Rp5.000 | Harga mulai | `dari` = patokan, bukan nominal |
| Livin `Top-up Berhasil` ke GoPay | **pemasukan** di nomor GoPay | Uang keluar dari Mandiri | `Rekening Sumber` ⇒ arah keluar, akun = rekening sumber |
| Livin `Transfer Berhasil` | pemasukan | Uang keluar | idem; merchant = penerima |
| Bukti bayar tertanggal `2026-10-21` | 2021-10-26 | Tanggal 2026 | `parseWhen` memakai batas kata; ISO tanpa jam sah |

## Nominal: nominal atau total?

- **Email dari sisi bank** (`Rekening Sumber` ada): pakai **Total Transaksi**, karena itulah yang
  benar-benar didebet dari rekening — Rp41.000 top-up + Rp1.200 biaya = Rp42.200. Dengan begitu saldo
  rekening tetap cocok dengan mutasi bank.
- **Email dari sisi dompet**: pakai **Nominal**, biaya admin tidak mengurangi saldo dompet.

## Antrean: `sure` vs `check`

Impor email lama tidak pernah langsung masuk buku. Baris `sure` menjadi entri saat Anda menekan
"Catat", baris `check` pindah ke antrean tinjauan (`import-check`). Sebuah baris hanya bisa `sure` bila
lolos gerbang 7 **dan** pembacaan deterministik yakin **dan** arahnya jelas **dan** kategorinya dikenal.

`rulesVersion` disimpan di `parsed` setiap baris. Naikkan `RULES_VERSION` di `extract.ts` setiap kali
arti sebuah aturan berubah, lalu bangun ulang antrean agar baris lama tidak ikut dicatat.

## Pengawasan untuk semua pengguna

Aturan di atas berlaku untuk semua pengguna karena berada di jalur baca, bukan di satu akun.

- Setiap 6 jam `sweep()` menjalankan `auditQueue()` dan menulis `mail audit: {...}` ke log layanan
  (`journalctl -u djiwapay-mail`) berisi jumlah baris mencurigakan per penanda dan per pengguna.
- Untuk melihat rinciannya kapan saja:

```bash
ssh vps-djiwa-tentram 'sudo bash -c "set -a; . /etc/djiwatentramapp/djiwapay-api.env; set +a; \
  cd /opt/djiwapay-api && /usr/local/bin/bun src/audit-mail-queue.ts"'
```

Penanda yang mungkin muncul: `noise-subject`, `tiny-amount`, `far-date`, `no-date`,
`unknown-direction-sure`, `old-rules`.

`old-rules` berarti baris itu dibaca sebelum aturan sekarang; bangun ulang jendela impornya
(`createImport`) agar dibaca dengan aturan terkini — jangan mengedit `parsed` dengan tangan.

## Kalau menemukan bentuk baru

1. Ambil email aslinya (bukan cuplikan layar) dan lihat kata kunci yang menipu.
2. Tulis tes lebih dulu di `src/mail/real-mail.test.ts` dengan badan email apa adanya.
3. Perbaiki `extract.ts` (atau tambahkan gerbang di `pipeline.ts`).
4. Naikkan `RULES_VERSION`, jalankan `bun test`, deploy, lalu bangun ulang antrean yang terdampak.
5. Periksa `bun src/audit-mail-queue.ts` sampai bersih.

## Pengaman saat aturan berubah (2026-11-16)

- Preview impor hanya menghitung `sure` dari `RULES_VERSION` yang sedang berjalan. Baris
  beraturan lama masuk kelompok perlu tinjauan, walaupun sebelumnya berlabel `sure`.
- Saat commit, versi lama diberi `sure=false` dan penanda `old-rules` di dalam transaksi
  database sebelum ada entri yang dibuat. Angka aslinya dipertahankan untuk pemeriksaan;
  ini bukan pembacaan ulang atau koreksi nominal otomatis.
- Penggabungan dua email menjadi transfer wajib lulus pemeriksaan nominal/tanggal dan
  memiliki pembacaan yang yakin. Pembacaan AI yang menyebut nominal yang tidak ada
  di email tidak boleh mengubah entri yang sudah tersimpan.
- Audit baca-saja berjalan segera saat pekerja email mulai, kemudian melalui sapuan
  berkala setiap 6 jam. Audit memakai aturan pengumuman limit yang sama dengan parser.
- Tes `src/mail/guards.int.test.ts` menguji database dengan identitas `itest-*` terisolasi:
  transfer palsu tidak mengubah buku; baris lama tidak masuk commit massal; baris
  versi baru tetap bisa dicatat. Tes `src/mail/audit.test.ts` menjaga deteksi limit kartu.

Aturan ini berlaku pada jalur server bersama untuk semua pengguna. Bentuk email baru
masih dapat memerlukan tinjauan; tidak ada jaminan seluruh format bank akan terbaca
sempurna. Kasus baru harus menjadi tes regresi sebelum aturan diubah.

## Rincian email dan tinjauan massal (2026-11-16)

`parsed.details` menyimpan deskripsi dari badan email, item, jumlah, harga satuan, subtotal,
diskon, pajak/biaya, total tercetak, serta peringatan. Nilai yang tidak tercetak tetap kosong;
email bank tidak boleh menghasilkan daftar barang rekaan. Rincian tetap bisa dibuka melalui
asal email setelah entri disetujui. Versi pembacaan naik ke 5.

Pembacaan ulang merupakan POST eksplisit: cari pesan milik pengguna melalui Message-ID,
verifikasi pengirim dan autentikasinya, baca isi, lalu lengkapi rincian antrean. Operasi ini
menjaga nominal/kategori tersimpan serta tidak membuat entri buku. Ketidaksesuaian total
ditandai untuk pemeriksaan. Tidak ada akses Gmail atau penulisan data pada GET daftar.

Halaman Tinjau memuat 200 baris per halaman dan menyediakan pemuatan berikutnya. Pengguna
memilih baris lalu mengonfirmasi setujui/abaikan. Setiap batch maksimal 200 ID, dihapus
duplikasinya, dibatasi pengguna yang login, dan melaporkan hasil per ID. Persetujuan memakai
penguncian entri antrean sehingga pengulangan permintaan tidak mencatat dua kali. “Tutup”
hanya menutup detail/pilihan. Tidak ada aksi persetujuan produksi saat pengujian UI.
