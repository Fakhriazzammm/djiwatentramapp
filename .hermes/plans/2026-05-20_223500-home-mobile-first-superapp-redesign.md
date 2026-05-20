# /home Mobile-First Superapp Redesign Plan (djiwatentramapp)

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Mendesain ulang halaman `/home` agar mobile-first, lebih cepat dipakai harian, dan visual hierarchy mengikuti referensi screenshot (search header → hero promo → quick actions → service grid → sticky CTA/banner → repeat usage cards → bottom nav), dengan tombol/fitur disesuaikan kebutuhan operasional djiwatentramapp.

**Architecture:** Tetap memakai route existing `apps/web/src/routes/home.lazy.tsx` sebagai orchestrator data + navigation. UI dipecah ke sub-komponen presentational ringan dalam folder komponen baru agar maintainable. Data source tetap dari hook hybrid yang sudah ada (tanpa ubah skema DB).

**Tech Stack:** React + TanStack Router + Tailwind + framer-motion + hook hybrid POS/attendance existing.

---

## 1) Current Context (hasil audit)

### Route & file yang relevan
- `apps/web/src/routes/home.lazy.tsx` (halaman home saat ini, 1000+ lines)
- `apps/web/src/routes/home.tsx`
- `apps/web/src/routes/admin/route.tsx` (mobile bottom nav admin existing)
- `apps/web/src/index.css` (`app-page`, `app-card`, `app-bottom-bar`, safe-area utilities)

### Kondisi /home saat ini
- Sudah mobile-oriented tapi **terlalu panjang** dan bercampur:
  - Kartu attendance besar + Face ID modal
  - Multi section role cards (Kasir/Barista/Kitchen)
  - Shortcut umum
  - Ringkasan shift panjang (copy + telegram)
- Hierarchy belum mengikuti pola superapp feed; CTA utama terkubur setelah beberapa blok.
- Banyak blok berukuran besar (card density rendah), sehingga time-to-action lebih lama.

### Data source existing (dipertahankan)
- `useHybridSiteSettings`
- `useHybridStaffStatsToday`
- `useHybridCurrentMonthProgress`
- `useHybridShiftReportRows`
- `useHybridShiftDetails`
- `useHybridClockIn` / `useHybridClockOut`
- `useYumiAuth`

### Catatan LESSONS.md
- File `LESSONS.md` tidak ditemukan di repo (`/opt/djiwatentramapp`).

---

## 2) UI/UX Analysis dari screenshot referensi (actionable)

## Struktur layout (top-to-bottom)
1. **Top app bar**: search field besar + avatar kanan.
2. **Hero promo card**: visual kuat, satu CTA utama (“cek sekarang”).
3. **Quick action row**: 4 action inti (pembayaran/top-up/lainnya style icon label).
4. **Service grid**: ikon fitur dalam grid rapat, label singkat.
5. **Sticky CTA strip**: banner horizontal 1-line untuk promo/aksi cepat.
6. **“Lebih cepat pakai lagi”**: list rekomendasi/shortcut sering dipakai.
7. **Bottom nav**: 4 tab konstan untuk orientasi & one-thumb navigation.

## Hierarchy visual
- Fokus 1: search + hero (entry point)
- Fokus 2: quick action + service grid (aksi cepat)
- Fokus 3: repeat usage & navigasi bawah
- Tipografi: title medium-bold, label ringkas, bukan paragraf panjang.

## Mobile-first interaction
- Thumb zone: action penting di tengah-bawah layar.
- Scroll feed vertikal tunggal, komponen pendek, minim friction.
- CTA label singkat 1–2 kata + ikon.

---

## 3) Penyesuaian ke kebutuhan djiwatentramapp (fitur mapping)

## Mapping blok UI referensi -> fitur project
1. **Search bar**
   - Fungsi: quick launcher ke menu kerja.
   - Scope awal: filter lokal pada daftar shortcut/fitur (tanpa API baru).

2. **Hero card operasional (gantikan promo consumer)**
   - Isi: status shift aktif, greeting, target progress, dan 1 CTA utama dinamis:
     - `Clock In`, `Clock Out`, atau `Daftarkan Wajah`
   - Data: `useHybridStaffStatsToday`, `useHybridCurrentMonthProgress`, `useYumiAuth`.

3. **Quick actions (4 tombol utama)**
   - `POS` -> `/menu`
   - `Pesanan` -> `/admin/orders`
   - `Absensi` -> `/attendance`
   - `Laporan Shift` -> scroll/focus ke ringkasan shift / open panel

4. **Service grid (8 tombol)**
   - Prioritas fitur existing: AI Chat, Booking, Promo, Produk, Bar, Kitchen, Inventory, Keuangan
   - Route mengikuti yang sudah ada dan permission-aware.

5. **Sticky strip CTA (hijau di referensi)**
   - Dikonversi menjadi “status/action strip”:
     - contoh: `Diskon aktif X • buka Promosi` ATAU `Shift belum dimulai • Clock In sekarang`

6. **Lebih cepat pakai lagi**
   - Render shortcut list dari fitur paling sering dipakai (MVP static ranking dulu).
   - Fase lanjut: ranking dari localStorage recent clicks.

7. **Bottom nav /home (4 tab)**
   - `Home` (aktif)
   - `POS`
   - `Orders`
   - `AI/Chat`
   - Harus safe-area aware (`safe-area-bottom`).

---

## 4) Design Philosophy (UX-first)

- **One-thumb first:** semua primary action reachable tanpa stretch.
- **Action before report:** tindakan operasional (clock in, POS, orders) tampil sebelum analytics panjang.
- **Compact & scannable:** micro-card, label pendek, ikon konsisten.
- **Progressive disclosure:** detail panjang (ringkasan shift raw text) dipindah ke fold bawah / collapse.
- **No decorative overload:** kurangi gradient/blur berlebihan, pertahankan kontras dan kejelasan.

---

## 5) CSS Constants Mapping (before -> after)

- Page content max width: `max-w-md` tetap (mobile-first), desktop naik bertahap.
- Section spacing: `space-y-4/5` -> `space-y-3/4`.
- Hero card padding: `p-4` -> `p-3.5` (mobile), `p-4` (>=sm).
- Grid card radius: `rounded-2xl` -> `rounded-xl` untuk density lebih tinggi.
- Icon container: `h-10 w-10` -> `h-8 w-8` pada quick/service grid.
- Label size: `text-[13px]/text-[11px]` -> `text-[12px]/text-[10px]` untuk list rapat.
- Bottom nav height: normal + `safe-area-bottom` padding.

---

## 6) Per-section Space Budget (target)

- Header + search: ~84px
- Hero operasional: ~150px
- Quick actions row: ~90px
- Service grid: ~220px
- Sticky strip CTA: ~44px
- Repeat usage cards: ~180px
- Folded shift summary entry: ~56px

**Target total above-the-fold + early scroll:** < 2.2 viewport mobile, dari kondisi saat ini yang lebih panjang dan terfragmentasi.

---

## 7) Files Likely to Change

## Modify
- `apps/web/src/routes/home.lazy.tsx`
  - Refactor struktur JSX jadi feed mobile-first.
  - Pertahankan logic absensi/face verification existing.

- `apps/web/src/index.css` (opsional minimal)
  - Tambah utilitas kecil jika dibutuhkan (`home-chip`, `home-quick-card`) tanpa mengganggu global tokens.

## Create
- `apps/web/src/components/home/home-search-bar.tsx`
- `apps/web/src/components/home/home-hero-operational.tsx`
- `apps/web/src/components/home/home-quick-actions.tsx`
- `apps/web/src/components/home/home-service-grid.tsx`
- `apps/web/src/components/home/home-repeat-usage.tsx`
- `apps/web/src/components/home/home-bottom-nav.tsx`

> Catatan: jika ingin perubahan minimal file, boleh tetap di `home.lazy.tsx` dulu (fase 1), lalu ekstraksi komponen (fase 2).

---

## 8) Implementation Steps (bite-sized)

### Task 1 — Bangun skeleton layout baru /home
- Sisakan logic data/hook existing.
- Ubah render order mengikuti struktur referensi.
- Verifikasi route `/home` tetap render tanpa crash.

### Task 2 — Header search + avatar
- Tambah search input (client-side only).
- Avatar klik tetap ke profil karyawan seperti sekarang.
- Verifikasi keyboard mobile tidak merusak layout.

### Task 3 — Hero operasional dengan CTA utama
- Reuse state existing (`hasFaceDescriptor`, `statsToday.isWorking`, `workDurationLabel`).
- CTA dinamis: register face / clock in / clock out.
- Verifikasi flow modal FaceRecognition tetap identik behavior-nya.

### Task 4 — Quick actions 4 tombol
- Tambah grid 2x2 (POS, Pesanan, Absensi, Laporan Shift).
- Route harus memanfaatkan state `fromHomeEntry` untuk admin jika relevan.

### Task 5 — Service grid 8 fitur
- Mapping role/permission-aware dari data menu existing.
- Jika permission tidak ada, item disembunyikan (bukan disabled dead tap).

### Task 6 — Sticky strip CTA
- Tambah strip status kontekstual (promo/shift status).
- Pastikan copy singkat 1 baris + icon + tap target >= 40px.

### Task 7 — Repeat usage section
- MVP: static shortlist prioritas fitur paling sering.
- Optional enhancement: simpan riwayat klik di localStorage.

### Task 8 — Bottom nav khusus /home
- 4 item tetap, active state jelas.
- Safe area support dan tidak overlap konten (`pb-safe-with-nav`).

### Task 9 — Ringkasan shift: fold & simplify
- Ringkasan detail panjang tetap ada namun dalam section expandable.
- Tombol `Salin` dan `Kirim ke Telegram` tetap dipertahankan.

### Task 10 — Polish responsive & motion
- Kurangi animation yang tidak critical.
- Cek 360px, 390px, 430px, tablet widths.

### Task 11 — Typecheck & smoke test
- `npx tsc --noEmit`
- Smoke navigation antar CTA penting.

---

## 9) Verification Plan

## Functional
- Login user staff -> masuk `/home`.
- CTA utama berubah sesuai status (belum face / off duty / on duty).
- Clock in/out flow sukses + toast benar.
- Tombol POS/Pesanan/Absensi/AI membuka route benar.
- Ringkasan shift bisa salin & kirim Telegram.

## UX (mobile-first)
- First meaningful actions muncul tanpa scroll panjang.
- Tombol utama bisa diakses satu tangan.
- Bottom nav tidak nutup konten terakhir.
- Label tidak overflow pada layar 360px.

## Technical
- Tidak ada penambahan dependency baru.
- Tidak mengubah schema DB / migration.
- Typecheck lulus.

---

## 10) Risks & Mitigation

- **Risk:** Re-layout besar merusak flow absensi existing.
  - **Mitigation:** jangan ubah logic function `handlePrimaryAttendanceAction`, `FaceRecognition`, `clockIn/clockOut`; hanya pindah container UI.

- **Risk:** Bottom nav baru bentrok dengan nav lain di admin route.
  - **Mitigation:** nav ini hanya aktif di `/home`, tidak dipakai di `/admin/*`.

- **Risk:** Layout jadi terlalu padat dan menurunkan keterbacaan.
  - **Mitigation:** jaga minimum tap target 40px dan line-height cukup.

- **Risk:** Search launcher menambah kompleksitas tapi value rendah.
  - **Mitigation:** fase awal simple filter lokal; jika tidak berguna bisa dihapus cepat.

---

## 11) Out of Scope (fase ini)

- Perubahan database/schema Supabase.
- Backend analytics penggunaan real-time.
- Personalisasi fitur berbasis ML.
- Desain ulang halaman `/admin/*` lain.

---

## 12) Deliverable akhir fase implementasi

- `/home` baru dengan flow visual mirip referensi (superapp feed mobile-first)
- Fitur tetap sesuai domain POS/operasional djiwatentramapp
- Tidak ada regressi di absensi, telegram report, dan navigasi utama
