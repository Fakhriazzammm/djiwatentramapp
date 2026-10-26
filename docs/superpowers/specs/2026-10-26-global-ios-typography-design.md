# Global iOS Typography Design

## Intent

Menyamakan typography seluruh web app Djiwa Tentram dengan pendekatan Oyenza/iOS: system font stack yang memakai SF Pro pada perangkat Apple dan fallback native pada platform lain.

## Goals

- Body/UI menggunakan satu token system font.
- Heading/display menggunakan stack system yang sama dengan hierarchy melalui ukuran, weight, dan tracking.
- Menghapus ketergantungan Google Fonts dari app web.
- Menjaga utility `font-sans`, `font-display`, dan `font-mono` tetap kompatibel.

## Non-goals

- Tidak mengubah layout, warna, radius, flow, atau fitur.
- Tidak mengubah font untuk dokumen kontrak/PDF yang sengaja memakai serif atau fallback khusus.
- Tidak mengubah app tanpa UI aktif seperti auth-server dan kolmarketing.

## Typography decision

```css
--font-body: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, system-ui, sans-serif;
--font-display: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, system-ui, sans-serif;
```

Apps dengan style sheet mandiri akan memakai stack yang sama. `500kopitasik` dan `yumme` tidak lagi memilih DM Sans/Plus Jakarta Sans sebagai primary font. `font-mono` tetap dipertahankan untuk kode, nomor transaksi, dan data teknis.

## Acceptance criteria

- Tidak ada import `fonts.googleapis.com` pada app web aktif.
- Shared theme mendefinisikan stack Apple-compatible untuk body dan display.
- Override root pada app mandiri memakai stack yang sama.
- Semua app web yang memiliki build script berhasil dibuild atau kegagalannya dapat dibedakan dari baseline.
