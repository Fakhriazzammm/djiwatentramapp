# Admin UI Guardrails (shadcn/ui)

Gunakan panduan ini untuk menjaga konsistensi UI Admin Core.

## Komponen Wajib (first choice)

- `@/components/ui/button`
- `@/components/ui/input`
- `@/components/ui/textarea`
- `@/components/ui/select`
- `@/components/ui/dialog`
- `@/components/ui/sheet`
- `@/components/ui/tabs`
- `@/components/ui/badge`

## Kontrak Varian

- `Button.variant`: `default | secondary | destructive | ghost | outline | link`
- `Button.size`: `sm | default | lg` (ikon boleh `icon*` jika perlu)
- `Input/Textarea.state`: `default | error | success`
- `SelectTrigger.size`: `sm | default | lg`
- `Badge.variant`: gunakan `success | warning | info | destructive` untuk status, jangan hardcode warna status di halaman.

## Aturan Penggunaan

- Hindari tombol native (`<button>`) untuk aksi utama, gunakan `Button`.
- Hindari input native (`<input>`, `<textarea>`, `<select>`) untuk form normal, gunakan komponen `ui`.
- Hindari class ad-hoc untuk state utama (`hover`, `focus`, `disabled`, `invalid`) di level halaman.
- Jika butuh tampilan khusus, compose dari komponen `ui` dulu. Buat custom primitive hanya jika ada gap fungsional yang jelas.

## Pengecualian

- Elemen native boleh dipakai untuk kebutuhan semantik khusus yang belum didukung primitive saat ini.
- Saat memakai elemen native, tetap ikuti token global (`--border`, `--ring`, `--radius`) dan util `cn()`.
