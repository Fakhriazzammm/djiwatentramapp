# Djiwa Tentram UI/UX Design Standard

> Standar untuk seluruh aplikasi Djiwa Tentram. Arah visual: pengalaman produk Apple yang tenang, presisi, mudah disentuh, dan terasa premium, dengan identitas Djiwa Tentram sendiri. Gunakan aset ikon 3D Djiwa sebagai ikon ilustratif utama.

## 1. Prinsip pengalaman

- Pengguna harus paham konteks, informasi terpenting, dan tindakan berikutnya dalam beberapa detik.
- Utamakan konten, keterbacaan, hierarki, dan respons antarmuka; hindari ornamen yang tidak membantu tugas.
- Gunakan pola iOS sebagai referensi kualitas interaksi dan layout, bukan menyalin merek, layar, atau komponen Apple secara literal.
- Mobile-first untuk Customer, Karyawan, dan alur kasir; Admin boleh desktop-first tetapi tetap nyaman disentuh pada tablet.
- Setiap layar mempertahankan bahasa Indonesia yang jelas dan aturan domain yang sudah berjalan.

## 2. Source of truth dan urutan inspeksi

Sebelum mengubah UI, periksa berurutan:

1. Token tema di `packages/yumipos-web-shared/src/theme.css` dan stylesheet app terkait di `apps/*/src/index.css`.
2. Primitive dan pola yang sudah ada di `packages/yumipos-web-shared/src/components/ui/`.
3. Komponen layout di `packages/yumipos-web-shared/src/components/layout/`.
4. Ikon 3D dan pemetaan komponennya di `packages/yumipos-web-shared/src/assets/djiwa-icons-v2/` dan `components/ui/djiwa-3d-icon.tsx`.
5. Implementasi app terdekat sebelum menambah varian baru.

Jangan menganggap seluruh app memiliki token identik. Pertahankan tema brand dan semantic color yang sudah dipakai app; bila perlu token lintas app, tambahkan pada shared theme dengan fallback yang kompatibel.

## 3. Bahasa visual: Apple-inspired

- Permukaan terang dan berlapis halus; gunakan ruang kosong dengan sengaja, garis pemisah tipis, dan bayangan ringan.
- Tipografi sistem yang mudah dibaca. Gunakan skala dan bobot yang konsisten; hindari terlalu banyak ukuran atau heading dekoratif.
- Radius lembut dan konsisten dengan token aktual. Jangan mengarang angka universal bila app sudah memiliki token.
- Warna aksen mengikuti brand app. Hijau, amber, dan merah khusus status sukses, perhatian, serta destruktif.
- Hindari glassmorphism berat, gradien dekoratif, outline berlebihan, kumpulan kartu seragam, dan bayangan gelap.
- Gunakan safe area pada layar mobile, navigasi bawah yang tidak menutupi konten, dan sheet/modal yang terasa native serta mudah ditutup.

## 4. Ikon 3D — standar wajib

Ikon fitur, navigasi, benefit, kategori, dan empty state yang bersifat ilustratif wajib memakai aset 3D yang sesuai dari katalog `djiwa-icons-v2` melalui komponen `Djiwa3DIcon`.

- Cari aset yang paling tepat di katalog/manifest sebelum meminta atau membuat aset baru. Gunakan nama ikon yang sudah diekspor oleh `djiwa-3d-icon.tsx`.
- Jangan mengganti ikon 3D dengan emoji, ikon flat, ikon Lucide generik, CSS drawing, atau karakter teks sebagai jalan pintas.
- Ikon 3D adalah elemen ilustratif; aksi kecil dan kontrol padat boleh memakai Lucide sebagai ikon kontrol saja (mis. chevron, close, search, edit, status tindakan). Jangan memakai Lucide sebagai pengganti ikon fitur 3D.
- Pertahankan rasio gambar, `object-contain`, ukuran semantik, dan deskripsi alt. Ikon dekoratif memakai alt kosong; ikon bermakna harus memiliki label aksesibel melalui teks atau alt.
- Jika katalog belum memiliki aset yang sesuai, jangan menyamarkan ikon flat sebagai aset final. Catat kebutuhan aset spesifik dan gunakan fallback sementara yang sudah menjadi pola produk, dengan status sementara yang jelas.
- Jaga konsistensi crop, skala, pencahayaan, dan gaya render antar ikon dalam satu layar. Hindari menumpuk banyak ilustrasi 3D dalam satu area padat.

Contoh penggunaan:

```tsx
import { Djiwa3DIcon } from "@yumipos/web-shared"; // sesuaikan dengan pola export app

<Djiwa3DIcon name="payment-wallet" size="sm" alt="" />
```

Periksa export dan import yang benar di app target; contoh ini menunjukkan pola, bukan jaminan jalur export setiap app.

## 5. Layout dan komponen

- Gunakan satu kolom pada mobile untuk alur utama. Susun navigasi, identitas halaman, konten utama, lalu tindakan utama dengan urutan yang jelas.
- Batasi lebar baca pada halaman berbasis teks. Untuk POS, tabel, atau operasional gunakan ruang layar secara efisien.
- Tampilkan satu aksi primer yang menonjol per konteks; aksi sekunder terlihat tetapi tidak bersaing.
- Gunakan card hanya untuk mengelompokkan konten yang memiliki hubungan atau tindakan jelas. Hindari card di dalam card.
- Form memiliki label tetap, bantuan dekat dengan field, validasi kontekstual, dan pesan error yang dapat ditindaklanjuti.
- Sheet untuk tugas ringkas dan kontekstual; halaman penuh untuk tugas kompleks atau yang perlu URL/navigasi sendiri.
- Tabel padat diperbolehkan untuk Admin. Pada layar kecil, sediakan representasi ringkas atau scroll horizontal yang disengaja dan terlihat.
- Gunakan komponen shared sebelum membuat primitive lokal. Jika variasi baru dibutuhkan, buat API yang kecil dan konsisten.

## 6. Pola per produk

### Customer

Mobile-first, ramah, visual, cepat untuk memesan. Produk, harga, kustomisasi, benefit, status pesanan, dan CTA harus mudah ditemukan. Gunakan aset 3D untuk fitur/benefit; foto produk tetap memakai foto produk.

### POS

Kecepatan, akurasi, dan keterbacaan saat sibuk adalah prioritas. Produk, cart, total, metode pembayaran, status shift, dan langkah checkout harus jelas. Jangan mengubah urutan transaksi, payment, receipt/printing, inventory, atau perilaku shift sebagai bagian dari styling.

### Karyawan

Mobile-first dan mudah digunakan satu tangan. Jadwal, presensi, payroll, izin, dan status harus terbaca sekilas. Sediakan target sentuh yang cukup dan dukung kondisi lapangan.

### Admin

Utamakan tugas, pengecualian, dan keputusan. Ringkasan metrik harus bermakna dan tidak mengulang informasi. Tetap responsif di tablet/mobile tanpa mengorbankan alur desktop operasional.

## 7. Interaksi, motion, dan state

- Beri feedback langsung untuk tap, submit, navigasi, perubahan status, dan error.
- Motion singkat dan fungsional untuk transisi, sheet, progress, serta perubahan state; hormati `prefers-reduced-motion`.
- Cegah submit ganda untuk aksi yang membuat transaksi atau mengubah data.
- Setiap fitur data menangani loading, empty, error, success, pending/disabled, dan offline/stale bila relevan.
- Gunakan shared state components yang tersedia. Empty state boleh memakai ilustrasi 3D yang relevan; error tetap menyampaikan solusi dan retry bila aman.
- Konfirmasi sebelum aksi destruktif atau sulit dibatalkan. Jangan meminta konfirmasi untuk aksi rutin yang aman.

## 8. Aksesibilitas dan responsive

- HTML semantik, urutan heading, label kontrol, keyboard support, dan focus indicator yang terlihat.
- Kontras minimal WCAG AA; status tidak dibedakan dengan warna saja.
- Target sentuh utama minimal 44×44 CSS px bila ruang memungkinkan.
- Hormati safe area dan zoom teks; jangan memotong judul, harga, status, atau CTA penting.
- Periksa lebar 375, 768, 1024, dan 1440 px atau breakpoint yang relevan pada app.
- Tidak ada overflow horizontal yang tidak disengaja; elemen fixed/sticky tidak boleh menutupi konten atau CTA.

## 9. Guardrail engineering

- Styling tidak mengubah business logic, kontrak API, otorisasi, atau makna data.
- Jangan menambah dependency untuk kebutuhan yang sudah dicakup stack dan komponen saat ini.
- Hindari global selector baru dan CSS lintas app yang tidak terisolasi.
- Pertahankan semantic colors dan kontrak visual brand. Jangan mengubah aksen app tanpa permintaan eksplisit.
- Jangan membuat ulang aset 3D yang sudah ada; pakai katalog dan komponen resmi.

## 10. Checklist review

- [ ] Tujuan, hierarki informasi, dan aksi primer jelas.
- [ ] Token dan shared component yang sesuai sudah dipakai.
- [ ] Ikon ilustratif memakai aset 3D katalog; ikon kontrol kecil hanya memakai pola kontrol yang ada.
- [ ] Loading, empty, error, success, pending, dan konfirmasi tersedia sesuai konteks.
- [ ] Mobile, safe area, keyboard, focus, contrast, dan target sentuh diperiksa.
- [ ] Tidak ada truncation atau overflow yang tidak disengaja.
- [ ] Aturan transaksi dan data tetap sama.
- [ ] Pemeriksaan relevan dijalankan dan hasilnya dilaporkan dengan tepat.
