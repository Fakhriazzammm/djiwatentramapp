======================================================================
REKOMENDASI THRESHOLD INVENTORY — DJIWA TENTRAM COFFEE
======================================================================

FORMULA: Threshold = ~30% dari threshold lama (rata-rata 3-7 hari buffer)
Kategori: SEGAR(1-3 hari) | MINUMAN(3-7) | KERING(7-14) | PACKAGING(7-14)

LEGEND:
  SKRG = sudah di bawah threshold saat ini (alert aktif sekarang)
  BARU = akan trigger alert dengan threshold baru
  AMAN = stok cukup

======================================================================
⚠️  PERUBAHAN BESAR — Threshold terlalu rendah (0-1) → HARUS DINAIKKAN
======================================================================

Bahan                    Stok      Thr Lama → Thr Baru   Alasan
──────────────────────────────────────────────────────────────────────
Daging Ayam              4,899 g   1     →   3         Dipakai 7 resep!
Kentang                  1,250 g   1     →   3         Dipakai resep
Nasi Goreng Sauce          600 g   1     →   5         Base sauce penting
Nasi Ayam Mentega Sauce    800 g   1     →   3         Base sauce
Barbeque Sauce             450 g   0     →   5         Dipakai 3 resep
Bubur Base               2,000 g   0     →   5         Dipakai 4 resep
Patty Hamburg            4,283 g   0     →   5         Dipakai 4 resep
Nasi Telor Omega Sauce     550 g   0     →   3         Base sauce
Minyak Bawang Putih        975 g   0     →  50         Dipakai resep+base
Fla                      4,685 g   0     →   5         Dipakai resep
Robusta Beans              530 g   1     →  10         Dipakai 3+5 base resep!
White Cream                595 ml   1     →  10         Dipakai 5 base resep!
Yamin Base                 950 pcs  1     →   5         Dipakai 3 resep
Dark Soy Sauce           5,000 ml 500     → 150         Threshold 500 terlalu tinggi

======================================================================
⚠️  PERUBAHAN BESAR — Threshold terlalu tinggi (100+) → HARUS DITURUNKAN
======================================================================

Bahan                    Stok      Thr Lama → Thr Baru   Alasan
──────────────────────────────────────────────────────────────────────
Es Batu                 10,001 g  1000   →  300         Stok besar, buffer 3-4 hari
Air Galon                    2 gl  100    →   30         11 base resep, threshold wajar
Ubi Cilembu                 10 pc  110    →   33         Tersisa 10, perlu restock
Ekonomi Pencuci Piring      11 pc  111    →   11         Cleaning, 1 bulan
Minyak Rizki                 5 bt  105    →   21         Non-resep, threshold 21 cukup
Saus Tiram                   4 bt  104    →   20         Non-resep, threshold 20 cukup
Saus Tiram (Mahsuri)       950 ml  100    →   50         Dipakai resep+base
Richgold Label            3,422 g  907    →  272         Kopi, buffer 7 hari

======================================================================
📦  PACKAGING — Threshold 1-10 sudah cukup (beli per bundle)
======================================================================

Bahan                    Stok      Thr Lama → Thr Baru   Alasan
──────────────────────────────────────────────────────────────────────
Botol 1 Liter              30 pc   10    →    2         Packaging, reminder ringan
Cling                     100 pc   10    →    2         Packaging
Cup 12 PET                 22 tr   10    →    2         Packaging
Kresek Piala 1 Cup        100 pk    1    →    1         Beli grosir, threshold 1
Kresek Piala Uk 28        100 pk    1    →    1         Beli grosir
Multi Tisu               1,000 pk    3    →    1         Packaging BANYAK
Paperbowl 650ml            51 tr   10    →    2         Packaging
Sedotan Steril            100 pk    1    →    1         Beli grosir
Sendok Garpu              502 pk    3    →    1         Stok 500+, threshold 1
Tutup Cup                  51 pc   50    →   10         Threshold 50 terlalu tinggi
Bento Tupai 4 Sekat        21 pk    3    →    1         Stok aman

======================================================================
🧹  CLEANING — Threshold sangat rendah, beli bulanan
======================================================================

Bahan                    Stok      Thr Lama → Thr Baru   Alasan
──────────────────────────────────────────────────────────────────────
Soklin Lantai              50 pc   10    →    1         Beli bulanan
Lifebuoy Pencuci Piring   200 pc   10    →    1         Stok 200, threshold 1
Ekonomi Pencuci Piring     11 pc  111    →   11         Paling masuk akal di 11

======================================================================
✅  KATEGORI LAIN — Threshold wajar
======================================================================

Bahan                    Stok      Thr Lama → Thr Baru   Alasan
──────────────────────────────────────────────────────────────────────
Gas 3 Kg                  107 tb    4    →    2         ~1 tabung/minggu
Baterai ABC               400 pc   10    →    3         Jarang habis
Parkir Toko Merpati       101 kl    1    →    5         Cash kecil
Parkir Yogya MB           100 kl    1    →    5         Cash kecil

======================================================================
📊  RINGKASAN STATISTIK
======================================================================

Total bahan: 153
  - Threshold 0 (tidak ada alert): 6 → diperbaiki semua
  - Threshold 1 (alert terlambat): 12 → dinaikkan ke 3-10
  - Threshold 100+ (alert noise): 11 → diturunkan 30-70%
  - Threshold wajar: 124

Dampak threshold baru:
  - Saat ini MENIPIS (threshold lama): 5 item
  - Akan MENIPIS (threshold baru): ~8 item tambahan (Daging Ayam, Kentang, 
    Robusta Beans, Patty Hamburg, Barbeque Sauce, dll yang thr lama 0-1)
  - Alert noise berkurang signifikan (threshold 100+ diturunkan)

======================================================================
💡  CATATAN
======================================================================

1. Threshold di atas menggunakan formula 30% dari nilai lama sebagai 
   pendekatan konservatif. Idealnya butuh data pemakaian harian aktual.

2. Bahan SEGAR (daging, sayur) perlu threshold lebih rendah karena 
   perishable — beli 1-2 hari sekali.

3. Bahan KERING (tepung, gula, bumbu) bisa threshold 7-14 hari.

4. Non-resep items (53 bahan) threshold minimal saja untuk reminder.

5. Rekomendasi akhir: turunkan threshold bahan dengan stok besar dan 
   naikkan threshold bahan critical yang threshold-nya 0-1.
