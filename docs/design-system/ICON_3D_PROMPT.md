# Djiwa 3D Icon: analisis gaya dan prompt pembuatan

Dokumen ini melengkapi [`DJIWA_DESIGN_SYSTEM.md`](DJIWA_DESIGN_SYSTEM.md) dan aturan ikon di [`DESIGN.md`](../../DESIGN.md) §4. Dipakai untuk membuat ikon ilustratif baru (fitur, kategori, navigasi, benefit, empty state) agar serasi dengan katalog `packages/djiwaapps-web-shared/src/assets/djiwa-icons-v2/` dan `apps/customer/public/assets/djiwa-services/`.

## 1. Gaya yang dianalisis

Diperiksa dari aset yang tampil di beranda customer (Pesan = mangkuk salad, Promo = kado dengan lencana %, Djiwa Run = sepatu, Djiwa Pay = dompet dengan centang) dan katalog v2.

Nama gaya: **soft glossy 3D, "inflated clay/plastic"** (gaya 3D emoji modern, dekat dengan Fluent Emoji 3D dan emoji 3D iOS), bukan isometrik teknis dan bukan realistis foto.

Ciri yang konsisten:

| Aspek | Ciri |
| --- | --- |
| Bentuk | Satu objek utama, siluet sederhana dan tebal. Semua sudut dan tepi dibulatkan besar seperti diembus (puffy), tanpa sudut tajam. Detail kecil dikurangi. |
| Sudut pandang | Tiga perempat dari depan-atas (sedikit miring ke kanan), objek melayang atau bertumpu ringan, tidak datar frontal. |
| Material | Plastik/silikon glossy halus. Kilap lembut di sisi atas, bukan pantulan tajam. Kain dan kulit (sepatu, dompet) diberi tekstur halus dan jahitan bertitik. |
| Cahaya | Cahaya studio lembut dari kiri atas, bayangan dalam (ambient occlusion) lembut di sisi bawah-kanan, rim light tipis. Tanpa bayangan keras. |
| Warna | Jenuh tapi bersih: tosca/teal, ungu lavender, biru kobalt, hijau limau, merah koral. Satu warna dominan per ikon, satu atau dua warna aksen. Gradasi halus dalam satu warna. |
| Aksen | Lencana kecil (%, centang, bintang) pada sudut kanan-bawah bila perlu menandai makna. Satu lencana per ikon. |
| Latar | Transparan (alpha). Tanpa lantai, tanpa teks, tanpa latar bergradasi. Bayangan kontak sangat tipis atau tanpa bayangan. |
| Komposisi | Objek memenuhi sekitar 78% kanvas, di tengah, ada ruang napas di semua sisi. |

Pasangan tampil: ikon ditaruh di atas permukaan terang atau lingkaran putih (`ds-icon`), jadi warna harus tetap terbaca di latar putih dan biru pucat.

## 2. Spesifikasi teknis

- Kanvas 1024 x 1024 px, PNG transparan dari generator. Objek terlihat sekitar 798 px pada sisi terpanjang (lihat `visible_target` di `manifest.json`).
- Katalog v2 menyimpan WebP 1024 px; ikon layanan beranda WebP 512 px (kurang dari 25 KB). Ekspor WebP kualitas 90 dengan alpha.
- Target render di aplikasi: 24 px (`micro`), 48 px (`sm`), 80 px (`md`); ikon harus tetap terbaca di 40 px. Hindari detail yang hilang saat dikecilkan.
- Sumber saat ini: `openai-codex-gpt-image-2-medium`, status `approved-prototype`. Catat setiap aset baru di `manifest.json` dengan field yang sama.
- Nama berkas kebab-case, mis. `payment-wallet.webp`, dan didaftarkan di `djiwa-3d-icon.tsx`.

## 3. Prompt induk (salin, lalu isi bagian dalam kurung)

```text
A single 3D icon of [OBJEK UTAMA, mis. "a teal ceramic salad bowl with fresh greens, tomato slices and a silver fork"], in the Djiwa Tentram soft glossy 3D style: inflated clay-plastic look, thick rounded forms, every edge and corner generously bevelled and soft, no sharp edges.

Viewpoint: three-quarter view from slightly above and front, object tilted gently to the right, centered.

Material: smooth glossy silicone/plastic with soft specular highlights on the upper surfaces; fabric or leather parts have fine texture and subtle dotted stitching.

Lighting: soft studio key light from the upper left, gentle ambient occlusion on the lower right, thin rim light, very soft contact shadow or none. No harsh shadows.

Color: one dominant hue [WARNA UTAMA] with smooth same-hue gradients, plus one or two accent colors [WARNA AKSEN]. Clean, saturated, friendly, no muddy tones. Must stay readable on white and on pale blue.

Details: [LENCANA/AKSEN, mis. "a small coral starburst badge with a white percent sign at the bottom right" atau "none"]. Keep details minimal so it still reads at 40 px.

Composition: one object only, fills about 78% of a 1024x1024 square canvas, centered with even breathing room on all sides.

Background: fully transparent (alpha), no floor, no gradient, no text, no watermark, no border, no extra props.
```

## 4. Negative prompt

```text
photorealistic, hyperrealistic photo, flat 2D vector, line art, outline stroke, isometric technical drawing, pixel art, low-poly, sharp hard edges, metallic chrome mirror reflections, heavy dark shadows, noisy grain, multiple objects, hands or faces, text, letters, logo, brand marks, watermark, busy background, floor reflection, gradient background, cropped object, tiny details, neon glow, dark or muddy colors
```

## 5. Palet per kategori

Pilih satu warna dominan per kategori supaya ikon sejenis serasi satu sama lain.

| Kategori | Dominan | Aksen | Contoh |
| --- | --- | --- | --- |
| Makanan, pesan | tosca `#2BB8A8` | hijau daun, merah tomat | salad, kopi, nampan |
| Promo, voucher, reward | ungu lavender `#8C6BF0` | koral `#F0645F`, kuning | kado, tiket, kupon |
| Uang, Djiwa Pay | biru kobalt `#1F5FE0` | navy, hijau centang | dompet, kartu, koin |
| Aktivitas, Djiwa Run | hijau limau `#7ED321` | putih, hijau tua | sepatu, medali |
| Komunitas, sosial | biru-ungu `#5B7CF0` | merah muda | gelembung chat, orang |
| Riwayat, struk, dokumen | putih-kelabu | hijau, biru | struk, jam |
| Peringatan, notifikasi | kuning amber `#FFB800` | koral | lonceng |

Warna status (hijau berhasil, amber perhatian, merah bahaya) tetap hanya untuk lencana status, mengikuti `DESIGN.md`.

## 6. Cara membuat satu set baru

1. Tentukan daftar ikon dan satu objek utama untuk tiap ikon. Hindari metafora ganda dan hindari wajah atau tangan.
2. Isi prompt induk untuk tiap ikon dengan warna dari tabel §5. Pakai seed atau gambar acuan yang sama (mis. `menu.webp`) agar gaya terkunci.
3. Hasilkan tiga variasi, pilih satu, buang latar bila perlu, lalu normalkan: kanvas 1024, objek 798 px, di tengah.
4. Uji di 40 px pada latar putih dan pada `ds-icon`. Tolak bila siluet tidak terbaca atau detail hilang.
5. Ekspor WebP beralpha, simpan ke `djiwa-icons-v2/` (atau `public/assets/djiwa-services/` untuk ikon layanan customer), daftarkan di `manifest.json` dan `djiwa-3d-icon.tsx`.
6. Pakai lewat `Djiwa3DIcon`; jangan menggantinya dengan emoji, ikon flat, atau Lucide untuk ikon fitur.

## 7. Daftar periksa mutu

- [ ] Satu objek utama, siluet jelas di 40 px.
- [ ] Semua tepi membulat, tanpa sudut tajam.
- [ ] Cahaya dari kiri atas, bayangan lembut, kilap halus.
- [ ] Satu warna dominan dari palet, maksimal dua aksen.
- [ ] Maksimal satu lencana kecil.
- [ ] Latar transparan, tanpa teks, tanpa watermark.
- [ ] Skala dan posisi sama dengan ikon lain dalam satu layar.
- [ ] Terdaftar di manifest dan `djiwa-3d-icon.tsx`.
