# Djiwa Pay — redesign (standalone fintech)

Prototipe statis (HTML/CSS/JS, tanpa build) untuk merombak `apps/djiwapay` dari "halaman saldo di dalam app restoran" menjadi **aplikasi fintech mandiri**.

- **Interaktif:** buka `index.html` (panel kiri = lompat ke layar mana pun + ganti kondisi data: terisi / akun baru / memuat / gagal).
- **Galeri semua layar:** buka `flows.html` (61 layar, sheet, dan state; tiap kartu bisa diklik).
- Layar tunggal untuk dokumentasi: `index.html?s=<key>` (key ada di `screens-list.js`), tambah `&embed=1` untuk tanpa panel.

## Sumber desain
1. **Referensi fintech** (5 layar yang dikirim): langit di atas layar → salam + angka besar → *ask bar* → lembar putih berradius besar berisi tile, ikon cepat, kartu "hari ini", "berikutnya"; tab bar melayang dengan tombol aksi menonjol di kanan; sheet aksi (suara / ketik / struk / manual); riwayat dengan pencarian + periode + filter; laporan dengan kalender heat; dompet dengan rekening & kartu.
2. **Djiwa Soft iOS** (`docs/design-system/DJIWA_DESIGN_SYSTEM.md`): token navy/biru, radius 24/30/34, tombol pil navy, grup abu muda, ikon 3D di lingkaran putih. Struktur referensi diterjemahkan ke token ini supaya konsisten dengan Karyawan/Customer/POS. Maskot dan nama referensi **tidak** disalin; asisten memakai ikon 3D `business-ai-assistant` dengan nama "Yumi" (sudah ada di ekosistem Djiwa).

## Navigasi baru (bottom bar)
| Slot | Tujuan | Catatan |
|---|---|---|
| Beranda | ringkasan saldo, aksi cepat, aktivitas | pengganti "Saldo Djiwa Pay" + grid PPOB + grid aksi |
| Layanan | semua PPOB, nomor tersimpan, terakhir dibeli | PPOB naik jadi tab sendiri |
| Riwayat | daftar transaksi + pencarian + filter | ringkasan bulanan lewat tombol grafik |
| Dompet | saldo, Isi/Kirim/Terima/Tarik, rekening, kartu, poin & voucher | menggantikan "aksi cepat" lama |
| **Bayar** (tombol bulat navy, kanan) | sheet: Scan QR, Kirim, Terima, Isi saldo, Tarik, tagihan, Yumi | aksi harian terpenting |

Bottom nav lama (Home / Pesan / Komunitas / Saldo) dihapus karena Pesan dan Komunitas milik app Customer; ada pintasan **Kembali ke Djiwa Tentram** di Akun.

## Peta fitur: app saat ini → prototipe
| Fitur existing (`src/features/wallet`, `src/lib`) | Layar baru |
|---|---|
| Saldo + notifikasi (`djiwa-pay-screen`) | Beranda, Notifikasi |
| Grid PPOB 9 kategori, detail produk, metode bayar Djiwa Pay/QRIS, struk | Layanan, `ppob-*`, `sheet-confirm`, `result-*` |
| Tagihan PLN/PDAM (inquiry → bayar) | `postpaid-*` |
| BPJS/TV/Cicilan "belum tersedia" | `ppob-unavailable` |
| Saldo kurang → QRIS otomatis | `sheet-insufficient` |
| Status diproses (jangan kirim ulang) | `result-pending` |
| Isi saldo QRIS Mayar (preset, polling 5 dtk) | `topup`, `qris`, `topup-done` |
| Kirim (cek penerima), Terima (QR/nomor), Tarik dana | `send*`, `receive`, `withdraw*` |
| Scanner QR | `scan`, `sheet-scan-result` |
| Riwayat + detail | `history`, `sheet-txn` |
| Bantuan, login Google | `help`, `login` |

## Fitur baru yang diusulkan (perlu keputusan produk/backend)
Semua ditandai **Baru** di galeri; belum ada kontrak API-nya.
- **PIN 6 digit + Face ID** (`pin-*`, `bio`, `security`, `sheet-pin`) — perlu tabel/endpoint PIN dan aturan limit.
- **Yumi (perintah teks/suara)** — "isi pulsa 25rb ke 0812…" → ringkasan → konfirmasi. Tidak pernah membayar tanpa persetujuan. Perlu NLU (bisa memakai agen yang sudah ada).
- **Ringkasan bulanan** (kalender heat, per kategori) — dihitung dari riwayat; butuh kategori transaksi.
- **Tagihan rutin / pengingat**, **Promo & voucher**, **Poin Djiwa** (tersambung ke program loyalitas Customer).
- **Rekening tertaut** (saat ini rekening diketik tiap tarik dana), **Kartu Djiwa** (tetap "Segera hadir").
- Sembunyikan saldo, limit transaksi, perangkat terpercaya.

## Catatan implementasi (saat nanti dikerjakan di React)
- Pakai komponen `ds-*` dari `@djiwaapps/web-shared` (`DsScreen`, `DsGroup`, `DsRow`, `DsSheet`, `DsTabBar`, `DsAsk`, …). `DsTabBar` perlu varian dengan tombol aksi di kanan (`ds-fab`).
- Ikon kontrol memakai Lucide; ikon ilustratif memakai `Djiwa3DIcon`. **Kekurangan aset 3D** (sementara ikon garis di lingkaran berwarna, pola yang sama dengan app sekarang): Pulsa, Paket Data, Token PLN, Tagihan PLN, PDAM, BPJS, TV, Voucher Game, Cicilan, serta ikon rekening bank. Perlu dibuat di katalog `djiwa-icons-v2` sebelum rilis.
- Tab bar memakai ikon 3D navigasi (`home`, `history`, `wallet`) + ikon aksi Djiwa Pay `bills`; item tidak aktif dibuat abu-abu.
- Logika transaksi, polling, anti-submit-ganda, dan aturan saldo tidak berubah — ini hanya lapisan tampilan; layar PIN/limit menunggu keputusan backend.
- Rute lama (`/wallet/topup`, `/ppob/...`, `/:username/wallet`) dipertahankan; tab baru dipetakan ke rute baru (`/`, `/layanan`, `/riwayat`, `/dompet`).
- Aksesibilitas: target sentuh ≥ 44 px, label aria pada tombol ikon, `prefers-reduced-motion` dihormati, status tidak hanya dengan warna.

## Status implementasi (`apps/djiwapay`)
Diterapkan dengan data dan logika nyata (tanpa mengubah aturan transaksi, rute lama, atau kontrak checkout bersama):
Beranda, Layanan, Riwayat (+ pencarian, periode, filter, detail transaksi sebagai sheet), Dompet, tombol **Bayar**, Ringkasan bulanan (dihitung dari riwayat), Akun, Notifikasi, Bantuan, Isi saldo, Kirim, Terima, Scan QR, daftar PPOB (deteksi operator dari awalan nomor), tagihan PLN/PDAM, layanan belum tersedia, dan halaman masuk. Rute baru: `/layanan`, `/riwayat`, `/dompet`, `/ringkasan`, `/akun`. Detail/konfirmasi/struk PPOB tetap memakai `@djiwaapps/djiwa-checkout-ui` (standar checkout) dengan tema Djiwa Soft iOS.

**Belum dirilis karena belum ada backend** (di prototipe ada, di aplikasi tidak ditampilkan agar tidak menyesatkan): PIN 6 digit / Face ID / limit transaksi, Yumi (perintah suara/teks — kolom pencarian di Beranda diganti pencarian layanan), voucher & poin, tagihan rutin, rekening tertaut, pengaturan bahasa, keluar. Penyesuaian lain: tarik dana tetap "Segera" (aturan bisnis yang sudah ada), nominal minimum isi saldo mengikuti `MIN_TOPUP_AMOUNT`, dan saldo default terlihat (pilihan disimpan di perangkat).
