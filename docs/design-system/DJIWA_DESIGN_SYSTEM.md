# Djiwa Soft iOS — Design System Djiwa Tentram (v4 · lapang)

Berlaku untuk semua aplikasi Djiwa Tentram (Karyawan, Customer, POS, Manager, Admin versi mobile). Pelengkap `DESIGN.md`; bila bertentangan, dokumen ini yang dipakai untuk tampilan, `DESIGN.md` untuk aturan ikon 3D dan proses inspeksi. Token dan komponen dasar: `packages/yumipos-web-shared/src/ds.css` (prefix `ds-`). Panduan visual hidup: `docs/design-system/index.html`.

## 1. Karakter
Tenang, lapang, lembut, seperti aplikasi iOS modern: langit biru pucat di bagian atas, kelompok konten berupa wadah abu-abu muda berradius besar, ikon 3D di lingkaran putih, satu tombol pil navy sebagai aksi utama, bar navigasi melayang. Lapang dan jelas: hierarki kuat, jarak cukup, boleh digulir. Layout menentukan; jangan memadatkan demi muat satu layar.

## 2. Aturan wajib
1. **Satu aksi utama per layar**: tombol pil navy `ds-btn`. Aksi lain `ds-btn--ghost` atau teks biru.
2. **Kelompok, bukan kartu-dalam-kartu**: kontenmu duduk di `ds-group` (abu muda, radius 26). Item di dalamnya berupa baris `ds-row` dengan garis pemisah tipis; bila perlu satu tingkat lagi, pakai `ds-tile` putih.
3. **Ikon 3D** di lingkaran putih (`ds-icon`) untuk fitur dan kategori; Lucide hanya untuk kontrol kecil (lihat `DESIGN.md` §4).
4. **Warna**: navy untuk aksi dan angka penting, biru untuk aktif dan tautan, hijau/amber/merah hanya untuk status. Tidak ada gradien dekoratif selain langit di atas layar dan latar hero lembut.
5. **Bayangan** hampir tidak ada; hanya elemen melayang (tab bar, sheet) yang memakainya.
6. **Sentuh** minimal 44 pt untuk elemen utama (baris, tombol); kontrol sekunder boleh 32 pt.
7. **Bahasa**: kalimat biasa dalam bahasa Indonesia. Huruf kapital berspasi lebar hanya untuk label mono di Admin.
8. **Safe area** dan tab bar tidak boleh menutupi konten; beri padding bawah ≥ 96px.
9. **Gerak**: `cubic-bezier(.32,.72,0,1)`, 160–380 ms, hormati `prefers-reduced-motion`.

## 3. Token
| Token | Nilai | Pemakaian |
|---|---|---|
| `--ds-navy` | `#0f2347` | tombol utama, angka besar, tab aktif ikon |
| `--ds-blue` | `#1a5dc6` | tautan, item aktif, progres |
| `--ds-blue-soft` | `#e6efff` | latar item aktif, catatan info |
| `--ds-canvas` / `--ds-group` | `#f6f7fb` / `#f1f3f8` | latar halaman / wadah kelompok |
| `--ds-sky-1..3` | `#cfe0ff → #e4ecff → #f6f7fb` | langit di atas layar (±330px) |
| `--ds-ok/warn/danger` | `#13804a / #a05d00 / #d23a2a` | status saja |
| Radius | 10 / 14 / 24 / 30 / 34 / pil | xs / sm / md (tile) / lg (grup) / xl (hero, sheet) / tombol |
| Tipografi | SF/Inter; 44 display · 32 judul halaman · 24 judul · 17 kepala · 15 isi · 13 sub · 12 keterangan | bobot 700 judul, 600 label, 500 isi |
| Baris | min. 60px, ikon 44px | `ds-row` |
| Tombol | min. 54px (utama), 44px (md), 38px (sm) | `ds-btn` |
| Gerak | `.32,.72,0,1` | semua transisi |

## 4. Pola layar
- **Beranda**: langit → sapaan kecil + salam → angka utama (`ds-display`) + satu baris konteks → hero aksi → kelompok info → akses cepat 4×2 → tab bar.
- **Daftar**: judul 22 → segmented/chip → satu atau lebih `ds-group` berisi `ds-row`.
- **Detail/Form**: sheet bila ringkas (grabber, judul kiri, tombol tutup bundar kanan, tombol pil di bawah); halaman penuh bila kompleks.
- **Tab bar melayang**: 4–5 item, item aktif berlatar `--ds-blue-soft`; aksi harian terpenting boleh menjadi tombol navy bulat di tengah.
- **Status/hasil**: tag pil berwarna semantik; progres memakai `ds-bar`.

## 5. Komponen
React: `@yumipos/web-shared/components/ds` (`DsScreen`, `DsHeader`, `DsPageTitle`, `DsGroup`, `DsRow`, `DsIcon`, `DsTiles`, `DsHero` via kelas, `DsButton`, `DsAsk`, `DsNote`, `DsSegmented`, `DsPills`, `DsPromo`, `DsChart`, `DsTabBar`, `DsSheet`, `DsEmpty`, `ds3d()`). Gaya: `@import "@yumipos/web-shared/ds.css";`. Kelas CSS:
`ds-root` + `ds-screen` (kanvas + langit) · `ds-display/title/label/sub` · `ds-group` · `ds-row` + `ds-icon` + `ds-main` · `ds-tile` · `ds-hero` · `ds-btn` (`--ghost`, `--danger`, `--sm`, `--block`) · `ds-seg` · `ds-chip` · `ds-tag` (`--ok/warn/info/danger`) · `ds-bar` · `ds-note` (`--info`) · `ds-ask` · `ds-promo` · `ds-chart` · `ds-tabbar` + `ds-tab` + `ds-fab` · `ds-sheet` + `ds-scrim` · `ds-input` · `ds-empty` · `ds-skeleton`.

Contoh acuan: `prototypes/karyawan-redesign/v4.html` dan implementasi `apps/karyawan` (Beranda, Jadwal, Gaji, Notifikasi).

## 6. Penerapan per aplikasi
- **Karyawan, Customer, POS (mobile)**: wajib penuh.
- **Manager**: shell Command Center dipertahankan di desktop; di mobile memakai tab bar melayang, sheet, dan baris ds.
- **Admin**: desktop tetap Command Center; komponen yang dipakai di mobile/tablet mengikuti sistem ini.
- Tema merek per aplikasi tetap boleh mengganti `--ds-blue`/`--ds-navy`, tetapi struktur, radius, dan pola tidak diubah.

## 7. Checklist PR UI
- [ ] Satu aksi utama jelas, tombol pil navy.
- [ ] Tidak ada kartu bersarang; memakai `ds-group` → `ds-row`/`ds-tile`.
- [ ] Ikon ilustratif memakai 3D (`Djiwa3DIcon`) di `ds-icon`.
- [ ] Warna semantik hanya untuk status.
- [ ] Target sentuh ≥ 44 pt, safe area, padding bawah ≥ 96px.
- [ ] Teks kalimat biasa, bahasa Indonesia.
- [ ] Diuji di lebar 360–430 px dan dengan `prefers-reduced-motion`.
