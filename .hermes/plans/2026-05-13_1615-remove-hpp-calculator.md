# Plan: Hapus `/admin/hpp-calculator`, Pindah Integrasi ke `/admin/recipe/hpp`

## Goal
Hapus halaman standalone `/admin/hpp-calculator` dan jadikan `/admin/recipe/hpp` sebagai satu-satunya halaman HPP. Semua navigasi yang sebelumnya mengarah ke `/admin/hpp-calculator` dialihkan ke `/admin/recipe/hpp`.

## Current Context
- **Sidebar sudah bersih** — `route.tsx` tidak lagi mencantumkan `/admin/hpp-calculator` di menu sidebar manapun (cek terakhir: 0 match).
- **Yang tersisa:**
  1. Route file fisik: `hpp-calculator.tsx` + `hpp-calculator.lazy.tsx`
  2. `routeTree.gen.ts` — auto-generated, akan diregenerate
  3. `recipe-hpp.tsx` line 746 — tombol **"Lihat Portfolio"** yang navigate ke `/admin/hpp-calculator`

## Approach

### Step 1 — Hapus file route
- `rm apps/web/src/routes/admin/hpp-calculator.tsx`
- `rm apps/web/src/routes/admin/hpp-calculator.lazy.tsx`

### Step 2 — Update recipe-hpp.tsx
- **Line 746**: Tombol "Lihat Portfolio" → ubah navigasi dari `/admin/hpp-calculator` ke `/admin/recipe/hpp`
  - Tapi ini akan menuju ke halaman yang sama (dirinya sendiri) karena tombol ini ADA di halaman yang sama. Ini aneh — recipe/hpp adalah halaman HPP Resep yang sudah dipakai saat ini.
  - **Solusi**: Ubah teks tombol jadi "Dashboard HPP" dengan navigasi **internal** (scroll ke atas, atau refresh). Atau hapus tombol ini karena sudah tidak relevan — user sedang di halaman HPP utama.
  - **💡 REKOMENDASI**: Ganti tombol menjadi **"Buka Portfolio HPP"** yang tetap di halaman yang sama (tidak ada navigasi). Atau hapus saja tombol ini karena sekarang `/admin/recipe/hpp` adalah primary HPP.

  **Keputusan**: Hapus tombol "Lihat Portfolio" karena:
  - Sekarang `/admin/recipe/hpp` adalah satu-satunya halaman HPP
  - Navigasi ke diri sendiri tidak berguna
  - Tidak ada portfolio page lain untuk HPP

### Step 3 — Regenerate route tree
- `npx tsr generate` atau `npm run dev` untuk regenerate `routeTree.gen.ts`

### Step 4 — Build verification
- `npm run build` → zero errors

## Files Changed
| File | Action |
|---|---|
| `apps/web/src/routes/admin/hpp-calculator.tsx` | **HAPUS** |
| `apps/web/src/routes/admin/hpp-calculator.lazy.tsx` | **HAPUS** |
| `apps/web/src/components/admin/recipe-hpp.tsx` | **EDIT** — hapus tombol "Lihat Portfolio" |
| `apps/web/src/routeTree.gen.ts` | **REGENERATE** otomatis |

## Risks & Tradeoffs
- **Tidak ada UI/UX perubahan** di `/admin/recipe/hpp` — hanya tombol "Lihat Portfolio" yang dihapus (karena sudah tidak relevan tanpa halaman tujuan)
- Route tree akan regenerate otomatis — pastikan build lulus
- Semua link lain (sidebar, dsb) sudah bersih dari referensi hpp-calculator

## Open Question
~ Hapus tombol "Lihat Portfolio" atau ubah fungsinya? Saya rekomendasi hapus karena navigasi ke diri sendiri tidak berguna. **Konfirmasi?**
