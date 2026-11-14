# Djiwa Pay — pencatatan keuangan sebagai inti

Prototipe statis end-to-end untuk mengubah arah produk: **pencatatan keuangan pribadi menjadi inti**, fintech (saldo, QRIS, PPOB) menjadi **lapisan kedua** yang memberi makan data dan pendapatan. Semua yang sudah ada di Djiwa Pay **tidak dihapus** — isi saldo, kirim, terima, scan, PPOB, tagihan, riwayat tetap ada (dibuka dari tab Dompet / "Bayar & layanan" dan dari sheet Catat; tombol "Buka alur Djiwa Pay" membuka prototipe sebelumnya `../djiwapay-redesign/`).

- Interaktif: `index.html` (panel kiri = lompat ke layar mana pun). Galeri 44 layar: `flows.html`. Satu layar: `index.html?s=<key>&embed=1`.
- Gaya dan komponen = Djiwa Soft iOS yang sama dengan prototipe Djiwa Pay (`../djiwapay-redesign/styles.css`) + `catat.css`.

## Gagasan inti
> "Tahu uangmu pergi ke mana, dan berapa yang masih aman dibelanjakan hari ini."

Satu angka yang bermakna di Beranda: **Aman dibelanjakan hari ini** (sisa anggaran ÷ sisa hari). Mencatat harus lebih cepat dari membuka aplikasi lain: suara/teks satu kalimat, foto struk, atau **otomatis** dari Djiwa Pay (nol usaha).

### Mengapa fintech jadi nomor dua (dan tetap penting)
Pencatatan membangun kebiasaan harian (retensi); fintech mengubah kebiasaan itu jadi transaksi. Siklus: *catat → lihat anggaran/tagihan → bayar langsung → otomatis tercatat*. Pembayaran lewat Djiwa Pay adalah satu-satunya sumber catatan yang **tanpa input manual dan 100% akurat**, jadi insentif mendorong pengguna memakai Djiwa Pay sebagai dompet utama.

## Arsitektur informasi & layout
Tab bar melayang (pola sama dengan Djiwa Pay sekarang), tombol tengah/kanan berubah dari **Bayar** menjadi **Catat**:

| Slot | Isi | Catatan |
|---|---|---|
| Beranda | sisa uang bulan ini, kartu "aman dibelanjakan hari ini" (cincin progres), chip catat-cepat, masuk/keluar, 3 anggaran teratas, insight, catatan terbaru, kartu Dompet & Bayar | state: terisi, anggaran terlampaui, akun baru |
| Catatan | semua catatan (manual, suara, struk, **Djiwa Pay otomatis**), pencarian, periode, filter, tag | menggantikan Riwayat; riwayat Djiwa Pay ikut di sini dengan lencana "otomatis" |
| **Catat** (FAB) | sheet: ketik/bicara, foto struk, manual, pemasukan, + baris "Bayar atau isi saldo" | fintech tetap satu ketukan |
| Anggaran | segmen **Anggaran · Tujuan · Hutang & lainnya** (+ langganan, patungan, anggaran bersama) | |
| Dompet | kekayaan bersih, semua akun (tunai, bank, e-wallet, kartu kredit, **Djiwa Pay terhubung**), jalur ke "Bayar & layanan" | |

Laporan diakses dari ikon grafik di Beranda/Catatan: Ringkasan · Kategori · Tren · Arus uang (+ ekspor).

## Fitur
**Mencatat (inti)**
1. Suara/teks bahasa alami → beberapa catatan sekaligus, bisa diedit sebelum simpan (`catat-voice`, `catat-parse`).
2. Foto struk → item, total, tanggal terbaca otomatis, bisa dipecah per kategori (`catat-receipt*`). Repo sudah punya `packages/ocr-service` dan agen `yumi-finance-agent` (OCR + kategori) yang bisa dipakai ulang.
3. Manual dengan keypad besar, kategori, dompet, tanggal, catatan, tag, ulangi, lampiran (`catat-manual`).
4. **Auto-catat dari Djiwa Pay**: isi saldo, kirim/terima, PPOB, QRIS ke merchant Djiwa → kategori otomatis, bisa diubah (`pay-synced`).
5. Catat-cepat satu ketukan dari Beranda (templat: Kopi, Parkir, Makan siang), urungkan 5 detik.
6. Tersimpan → dampak ke anggaran + streak langsung terlihat (`catat-saved`).

**Memahami uang**
7. Anggaran per kategori + rollover + peringatan 80%; saran angka dari rata-rata 3 bulan.
8. Tujuan tabungan dengan proyeksi tanggal tercapai; setoran otomatis tiap gajian.
9. Hutang & piutang (sangat relevan di Indonesia): tagih teman; jika dibayar lewat Djiwa Pay, otomatis lunas.
10. Langganan terdeteksi + peringatan kenaikan harga; patungan/bagi tagihan; anggaran bersama pasangan.
11. Laporan: ringkasan, donat kategori, kalender harian, tren 6 bulan, masuk vs keluar, perbandingan bulan lalu, **arus uang** (sumber → dompet → kategori), insight tertulis ("Belanja naik 14%"), ekspor CSV/PDF.
12. Kebiasaan: streak harian + pengingat 20.00 (jangan berlebihan; bisa dimatikan).

**Tetap ada dari Djiwa Pay sekarang**: isi saldo QRIS, kirim, terima, scan QR, tarik dana (segera), PPOB (pulsa, data, token PLN, tagihan PLN/PDAM, game; BPJS/TV/cicilan "segera"), riwayat saldo, notifikasi, bantuan.

## Model bisnis (usulan)
Prinsip: **gratis untuk kebiasaan dasar, bayar untuk kenyamanan & kekuatan, dan monetisasi transaksi tanpa menjual data pengguna.**

1. **Djiwa Plus (langganan)** — ± Rp 19.000/bulan atau Rp 149.000/tahun, uji coba 14 hari. Gratis: 5 dompet, 10 scan struk/bulan, laporan dasar. Plus: scan struk tanpa batas, anggaran bersama, ekspor PDF/Sheets, laporan lanjutan & arus uang, dompet/kategori tanpa batas. Paywall di layar `paywall`.
2. **Margin transaksi fintech (lapisan kedua)** — selisih harga PPOB (margin/biaya admin), bagi hasil MDR QRIS, biaya tarik dana. Penggerak: auto-catat + tombol "bayar tagihan ini" dari pengingat langganan/tagihan.
3. **Ekosistem Djiwa Tentram** — cashback/poin di merchant sendiri, voucher kontekstual yang sadar anggaran ("sisa anggaran makan Rp 380 rb — diskon kopi Rp 5 rb").
4. **Mode UMKM (B2B ringan)** — Rp 49–99 rb/bulan: pencatatan usaha, pemisahan pribadi/usaha, laporan laba-rugi sederhana, banyak pengguna. Memakai fondasi `yumi-finance-agent`, `ocr-service`, dan modul keuangan Admin yang sudah ada.
5. **Referral produk keuangan berizin** — tabungan/emas/reksa dana/asuransi lewat mitra berizin OJK (fee referral), muncul sebagai saran di Tujuan, **hanya dengan persetujuan pengguna**.

Metrik: pengguna aktif mingguan, catatan/pengguna/minggu, rasio catatan otomatis (Djiwa Pay), D30 retensi, konversi catat→bayar, konversi gratis→Plus, ARPU.

**Perlu diperiksa sebelum dibangun (bukan nasihat hukum):** status izin uang elektronik untuk saldo Djiwa Pay, kepatuhan UU PDP (persetujuan eksplisit, hak hapus/ekspor data), dan batasan promosi produk keuangan oleh mitra.

## Pemetaan layar baru ↔ aplikasi sekarang
| Sekarang (`apps/djiwapay`) | Di prototipe Catat |
|---|---|
| Beranda saldo | Beranda mencatat; saldo Djiwa Pay jadi kartu "Dompet & Bayar" |
| Tab Layanan | Layanan & PPOB dipindah ke "Bayar & layanan" (Dompet) dan chip cepat Beranda |
| Tab Riwayat + Ringkasan | Tab **Catatan** (gabungan) + Laporan |
| Tab Dompet | Dompet multi-akun, Djiwa Pay satu akun terhubung |
| Tombol Bayar | Tombol **Catat**; "Bayar" jadi baris pertama di sheet Catat |

## Catatan implementasi (jika disetujui)
- Data: tabel `finance_entries`, `finance_accounts`, `finance_categories`, `finance_budgets`, `finance_goals`, `finance_debts` di Supabase (RLS per pengguna); transaksi Djiwa Pay ditulis otomatis oleh trigger/job dari ledger dompet (sumber: `pay`, tak dapat diubah nominalnya).
- NLU suara/teks dan OCR struk lewat layanan yang sudah ada; tiap hasil selalu ditampilkan untuk konfirmasi sebelum simpan.
- Kebutuhan aset 3D baru: ikon kategori (makan, transport, belanja, tagihan, hiburan, kesehatan, pendidikan, rumah, gaji), streak/api, tujuan, hutang. Sementara memakai ikon garis pada lingkaran berwarna (pola yang sama dengan app sekarang).
- Rilis bertahap: (1) catat manual + Catatan + anggaran, (2) auto-catat Djiwa Pay + laporan, (3) suara & struk, (4) Plus + paywall, (5) UMKM.

## Status implementasi (`apps/djiwapay`, dirilis 2026-11-15)
Diterapkan dan berjalan nyata (data tersimpan **lokal per akun di perangkat**, dengan cadangan/pemulihan JSON dan ekspor CSV):
Onboarding · Beranda (aman dibelanjakan hari ini, catat cepat, insight, streak) · Catat dengan satu kalimat (parser bahasa Indonesia: “kopi 25rb dan parkir 5rb, gaji 6jt”, dompet, “kemarin”) dan suara (Web Speech API bila browser mendukung) · Catat manual dengan keypad · Catatan (bulan, pencarian, filter, detail, ubah, hapus + urungkan) · **Auto-catat Djiwa Pay** (kategori bisa diubah, nominal tidak) · Anggaran per kategori + rollover · Tujuan tabungan + proyeksi · Hutang & piutang · Patungan · Langganan terdeteksi · Dompet multi-akun + kekayaan bersih · Laporan (ringkasan, kategori, tren 6 bulan, arus uang) · Kelola kategori & dompet · semua alur Djiwa Pay lama (isi saldo, kirim, terima, scan, PPOB, tagihan, riwayat) tetap ada di Dompet / `/bayar`.

Rute: `/` Beranda · `/riwayat` Catatan · `/anggaran` · `/dompet` · `/catat` · `/ringkasan` (= `/laporan`) · `/bayar` (= `/layanan`) · `/pengaturan` · `/akun`.

**Belum ada (butuh backend / layanan lain):** foto struk + OCR, sinkron antar-perangkat & cadangan otomatis ke server, anggaran bersama pasangan, Djiwa Plus + penagihan (paywall), pengingat dorong, mode UMKM. Tahap berikutnya: tabel Supabase + endpoint di auth-server (RLS per pengguna) agar data tersinkron, lalu OCR struk memakai `packages/ocr-service`.
