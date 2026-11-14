# Djiwa Pay — dari mencatat menjadi mengelola keuangan

Prototipe statis end-to-end (68 layar). **Semua yang sudah ada sekarang dipertahankan** (pencatatan, Catatan, laporan, anggaran, tujuan, hutang, dompet, Djiwa Pay: isi saldo, kirim, terima, scan, PPOB). Lapisan baru: *memahami kondisi*, *merencanakan*, *membangun kekayaan*.

- Interaktif: `index.html` (panel kiri = lompat ke layar mana pun). Galeri: `flows.html` (label **Baru / Dikembangkan / Tetap**). Satu layar: `index.html?s=<key>&embed=1`.
- Gaya = Djiwa Soft iOS yang sama (`../djiwapay-redesign/styles.css` + `catat.css`).

## Gagasan inti
Mencatat menjawab *"uangku ke mana?"*. Mengelola menjawab tiga pertanyaan berikutnya:
1. **Bagaimana kondisiku?** → Skor kesehatan keuangan, prakiraan kas, tagihan terdekat.
2. **Apa yang harus kulakukan?** → Kantong, tujuan otomatis, rencana pelunasan hutang, alat "Bisa beli ini?".
3. **Apakah aku makin kaya?** → Kekayaan bersih (aset − kewajiban) dan trennya.

Prinsip UX: **dari data menjadi tindakan**. Tiap angka punya langkah berikutnya (tagihan → *Bayar*, saran → *Terapkan*, skor rendah → *cara menaikkan*). Fintech jadi tombol aksi, bukan menu terpisah.

## Struktur layar
| Tab | Isi | Perubahan |
|---|---|---|
| Beranda | **Dasbor**: skor kesehatan, prakiraan kas sampai gajian, tagihan terdekat (+Bayar), review mingguan, pintasan Kantong/Tujuan/Bisa beli?/Alat, catatan terbaru, Dompet & Bayar | dikembangkan |
| Catatan | semua catatan + laporan | tetap |
| **Rencana** (menggantikan Anggaran) | segmen **Anggaran · Kantong · Tujuan · Hutang**; kalender tagihan di ikon kalender | baru |
| **Kekayaan** (menggantikan Dompet) | kekayaan bersih + tren, komposisi, aset, kewajiban, akun & dompet (termasuk Djiwa Pay), jalur Bayar & layanan | dikembangkan |
| Catat (tombol tengah) | satu kalimat/suara, struk, manual, bayar | tetap |

## Fitur baru
**Memahami kondisi**
1. **Skor kesehatan keuangan (0–100)**, 5 pilar: rasio menabung, dana darurat, beban hutang (cicilan ÷ pemasukan), anggaran terkendali, konsistensi mencatat. Tiap pilar menunjuk tindakan perbaikan.
2. **Prakiraan kas**: saldo diperkirakan sampai gajian dari tagihan tetap + rata-rata belanja; skenario "kurangi belanja 10%"; peringatan dini bila defisit (3 bulan = Plus).
3. **Kalender keuangan**: tagihan, cicilan, jatuh tempo kartu, gajian; bayar langsung lewat Djiwa Pay → otomatis tercatat dan menandai lunas.
4. **Review mingguan**: kemenangan, hal yang perlu dilihat, atur batas pekan depan. Membentuk kebiasaan.
5. **Saran yang bisa langsung diterapkan** dan **pengingat** terpusat (tagihan, review, catat harian, aset).

**Merencanakan**
6. **Kantong** (50/30/20 atau pola sendiri): gajian dibagi otomatis ke Kebutuhan, Keinginan, Tabungan; belanja dibaca dari kantongnya.
7. **Tabung otomatis**: pembulatan transaksi, % gaji ke tujuan, sisa anggaran akhir bulan.
8. **Rencana pelunasan hutang**: snowball vs avalanche, urutan, tanggal bebas hutang, bunga yang dihemat.
9. **Alat**: *Bisa beli ini?* (tunai atau cicilan 3/6/12× → dampak ke kas, dana darurat, tujuan), **Dana darurat**, **Zakat & pajak** (zakat maal, rekap tahunan), **Simulasi cicilan** (rasio terhadap pemasukan), patungan, langganan.

**Kekayaan**
10. **Kekayaan bersih**: kas otomatis + aset manual (emas, reksa dana, saham, kripto, properti, kendaraan) − kewajiban (cicilan, kartu). Tren 6 bulan dan komposisi; pengingat perbarui nilai tiap 30 hari.

## Model bisnis (pengembangan dari sebelumnya)
- **Djiwa Plus** makin kuat karena fitur manajemen bernilai tinggi dan jelas: prakiraan 3 bulan, kantong tanpa batas, rencana pelunasan, kekayaan bersih & aset, anggaran bersama, ekspor PDF & rekap pajak. Dasar (catat, anggaran, Djiwa Pay) tetap gratis.
- **Fintech tetap penggerak transaksi**: tagihan di kalender → *Bayar*; kantong & tabung otomatis memakai saldo Djiwa Pay; pelunasan hutang → pembayaran terjadwal. Margin PPOB/QRIS bertambah dari kebiasaan, bukan iklan.
- **Referral produk keuangan berizin** (emas, reksa dana, asuransi, KPR) muncul kontekstual di Kekayaan/Tujuan, hanya dengan persetujuan.
- **Mode UMKM** memakai fondasi yang sama (kalender tagihan, kas, laporan).
- Metrik baru: skor kesehatan rata-rata & kenaikannya, % pengguna dengan tagihan terjadwal, % gajian dibagi otomatis, retensi D30 pengguna yang menyelesaikan review mingguan.

## Catatan produk & risiko
- Skor, prakiraan, dan simulasi adalah **perkiraan**, bukan nasihat keuangan/pajak/zakat; beri penafian jelas.
- "Kantong" di Djiwa Pay = pembagian saldo virtual dalam satu dompet; periksa ketentuan izin uang elektronik sebelum menyebut sebagai rekening terpisah.
- Nilai aset diisi manual (belum ada integrasi harga pasar); integrasi harga emas/saham/reksa dana butuh sumber data berlisensi.
- Data finansial pribadi sensitif: persetujuan eksplisit, enkripsi, hak ekspor/hapus (UU PDP) sebelum sinkron ke server.

## Urutan pembangunan yang disarankan
1. Kalender tagihan + pengingat + bayar dari kalender (memakai Djiwa Pay yang ada).
2. Skor kesehatan + dasbor + review mingguan (murni hitungan dari data lokal).
3. Prakiraan kas + alat Bisa beli?/Dana darurat/Simulasi cicilan.
4. Kantong + tabung otomatis + rencana pelunasan.
5. Kekayaan bersih & aset manual.
6. Sinkron server (Supabase) lalu Djiwa Plus + penagihan.
