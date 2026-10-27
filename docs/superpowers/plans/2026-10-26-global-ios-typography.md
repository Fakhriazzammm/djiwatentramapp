# Global iOS Typography Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Menyamakan font global seluruh app web Djiwa Tentram dengan system font stack bergaya Apple seperti Oyenza.

**Architecture:** Shared theme menjadi sumber token `font-body` dan `font-display`. App dengan CSS mandiri diselaraskan pada token/stack yang sama tanpa mengubah struktur UI.

**Tech Stack:** CSS, Tailwind theme tokens, Vite/Turbo workspace.

**Spec:** `docs/superpowers/specs/2026-10-26-global-ios-typography-design.md`

## Global Constraints

- Tidak mengubah layout, warna, radius, flow, atau fitur.
- Tidak menghapus penggunaan `font-mono` untuk kode/data teknis.
- Tidak mengubah app tanpa UI aktif.

## Review Focus

- Font fallback harus tetap tampil baik di iOS, macOS, Windows, dan Android.
- Tidak boleh ada Google Fonts import tersisa pada entry CSS/HTML app aktif.
- App yang sebelumnya memakai override root tidak boleh kembali ke Geist/DM Sans/Plus Jakarta Sans sebagai primary font.
- Heading tetap memakai display token dan body tetap memakai sans token.
- Build output tidak boleh memperkenalkan error baru.

### Task 1: Update shared typography tokens

**Files:**
- Modify: `packages/yumipos-web-shared/src/theme.css`

- [ ] Ganti `--font-body` menjadi Apple-compatible system stack dengan SF Pro Text sebagai preferred Apple body face.
- [ ] Ganti `--font-display` menjadi Apple-compatible system stack dengan SF Pro Display sebagai preferred Apple display face.
- [ ] Pertahankan `@theme` mappings dan heading selectors.
- [ ] Verifikasi token dan selector tetap ada dengan `rg`.

### Task 2: Align app entry styles

**Files:**
- Modify: `apps/admin/src/index.css`
- Modify: `apps/b2b/src/index.css`
- Modify: `apps/booking/src/index.css`
- Modify: `apps/customer/src/index.css`
- Modify: `apps/djiwapay/src/index.css`
- Modify: `apps/investor/src/index.css`
- Modify: `apps/karyawan/src/index.css`
- Modify: `apps/kol/src/index.css`
- Modify: `apps/linkbio/src/index.css`
- Modify: `apps/merchandise/src/index.css`
- Modify: `apps/ordermieyamin/src/index.css`
- Modify: `apps/pos/src/index.css`
- Modify: `apps/500kopitasik/src/index.css`
- Modify: `apps/yumme/src/index.css`
- Modify: `apps/rekrutmen/public/index.html`
- Modify: `apps/rekrutmen/public/admin.html`

- [ ] Hapus Google Fonts imports dari app CSS/HTML.
- [ ] Ganti root font override dan explicit display declarations yang memilih font brand lama dengan system stack Apple-compatible.
- [ ] Untuk app shared, gunakan token `var(--font-body)`/`var(--font-display)` bila sudah tersedia.
- [ ] Pertahankan font khusus dokumen, receipt, dan `font-mono` yang bukan typography UI global.

### Task 3: Verification

- [ ] Jalankan audit `rg` untuk memastikan tidak ada Google Fonts import atau primary font lama pada entry styles.
- [ ] Jalankan `bun run check-types`.
- [ ] Jalankan build app web yang relevan dengan Turbo.
- [ ] Review diff dan status worktree.

