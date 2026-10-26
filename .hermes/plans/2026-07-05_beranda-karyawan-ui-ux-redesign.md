# Plan: UI/UX Redesign — Beranda Karyawan (`karyawan.djiwatentram.web.id/$username`)

## Goal

Migrasikan tampilan halaman `karyawan.djiwatentram.web.id/$username` dari layout **profil (scroll-based)** menjadi **Mobile-First Dashboard** dengan **Bottom Navigation** (5 tab) yang mengadopsi desain referensi: Header profil + Banner info + Grid Menu 8 ikon + Sticky Bottom Nav.

**Referensi:** Screenshot employee portal "DJIWA TENTRAM INTERNAL" dengan:
- Header: Logo + greeting dinamis + $namauser + Jabatan + avatar
- Banner: "Informasi Penting Hari Ini"
- Grid Menu 2×4 (Absensi, Rekap Absensi, Jadwal, Izin/Cuti/Sakit, Slip Gaji, Kontrak, Grup Telegram, Telegram Absensi)
- Bottom Nav: Beranda, Jadwal, Absensi, Notifikasi, Profile

---

## Current Context

### Existing State (`apps/web/src/routes/karyawan.$username.lazy.tsx`, 1681 baris)

| Aspek | Status Sekarang |
|-------|-----------------|
| **Layout** | Single scroll page — tidak ada tab/bottom nav |
| **Auth flow** | PIN-gated (locked/unlocked). Pengguna buka PIN dulu untuk lihat data |
| **Header** | Sticky top bar dengan tombol "Portal Absen" + status "Private Access" |
| **Unlocked view** | Profile card + Period Selector + Dashboard Grid (2 cards: jam & kehadiran) + PersonalSchedule + Kontrak + Slip Gaji + Riwayat Absensi + Data Pribadi (read/edit) + Pengaturan Akun (PIN) + Grup Telegram + Floating CTA "Absensi Sekarang" |
| **Locked view** | Avatar + Nama + Role + Tombol "MASUK KE SISTEM" + "LANGSUNG ABSENSI" |
| **Routing** | Single route `karyawan.$username` — semua konten di satu file |
| **Komponen** | `PersonalSchedule` sudah terpisah (`components/attendance/PersonalSchedule.tsx`) |

### Gap Analysis

| Fitur Referensi | Status di Existing |
|-----------------|-------------------|
| Header Logo + greeting + nama + jabatan | ✅ Ada profile card tapi format berbeda (tidak ada logo Djiwa, tidak ada greeting jam) |
| Banner "Informasi Penting Hari Ini" | ❌ Tidak ada. Yang ada adalah period selector + dashboard grid |
| Grid Menu 2×4 | ❌ Tidak ada. Konten menggunakan section layout (scroll) |
| Bottom Navigation (5 tab) | ❌ Tidak ada. Halaman single scroll |
| **Fungsi tombol di referensi:** | |
| Absensi → /attendance | ✅ Fungsi ada via floating CTA |
| Rekap Absensi → log kehadiran | ✅ Ada di section "Riwayat Absensi" |
| Jadwal → PersonalSchedule | ✅ Ada sebagai component |
| Izin/Cuti/Sakit | ❌ Belum ada. Perlu rute/aksi baru |
| Slip Gaji → payslip section | ✅ Ada |
| Kontrak → contract section | ✅ Ada |
| Grup Telegram → link group | ✅ Ada di section "Grup Telegram" |
| Notifikasi | ❌ Belum ada. Perlu halaman baru |

---

## Proposed Architecture

### Architectural Decision: Single Page → Multi-Tab Dashboard with Bottom Navigation

**Option A (Split into multiple routes):** Buat 5 rute terpisah (`/beranda`, `/jadwal`, `/absensi`, `/notifikasi`, `/profil`) + layout wrapper.
- ✅ Clean separation of concerns
- ✅ URL-based navigation (bookmarkable)
- ❌ Breaking change — semua link existing ke `/karyawan/$username` akan redirect
- ❌ Perlu membuat route baru + update route tree
- ❌ Perlu migrate PIN lock/unlock state ke shared context

**Option B (Single page with tab state + Bottom Nav):** Satu rute `/karyawan/$username` dengan `activeTab` state. Konten tab dirender secara kondisional.
- ✅ Non-breaking — URL tidak berubah
- ✅ PIN lock/unlock state tetap di satu file
- ✅ Lebih cepat implementasi
- ❌ Tidak bookmarkable per tab
- ❌ Single file akan semakin besar (bisa di-mitigasi dengan extract komponen)

**⭐ Recommendation: Option B (Single page, tab state)**

Alasan:
1. Halaman karyawan diproteksi PIN — user harus unlock dulu. Tab navigation tidak berguna sebelum unlock.
2. URL `/karyawan/$username` sudah dipakai sebagai referensi dari sistem lain (admin, onboarding, link internal). Mengubahnya jadi redirect akan merusak integrasi.
3. Existing code (1681 baris) sudah di satu file — extract komponen secara bertahap lebih aman.
4. Bottom Nav bisa disembunyikan saat `!isUnlocked` — locked view tetap clean.

---

## Step-by-Step Plan

### Phase 1: Extract Existing Sections into Components (Preparasi)

Tujuannya: mengurangi kompleksitas file utama sebelum refactor besar.

| # | Task | File Baru | Estimasi |
|---|------|-----------|----------|
| 1.1 | Extract `PayslipDetailCard` → `components/attendance/PayslipDetailCard.tsx` | ✅ Baru (sekarang inline) |
| 1.2 | Extract section "Slip Gaji" + "Riwayat Absensi" → `components/attendance/PayslipSection.tsx` + `AttendanceLogSection.tsx` | ✅ Baru |
| 1.3 | Extract "Data Pribadi" (view + edit) → `components/attendance/PersonalInfoSection.tsx` | ✅ Baru |
| 1.4 | Extract "Pengaturan Akun" (PIN) → `components/attendance/AccountSettingsSection.tsx` | ✅ Baru |

### Phase 2: Buat Bottom Navigation Component

| # | Task | Detail |
|---|------|--------|
| 2.1 | Buat `components/ui/BottomNav.tsx` | 5 tab: Beranda (house), Jadwal (calendar), Absensi (face-scan), Notifikasi (bell), Profile (user) |
| 2.2 | Props: `activeTab`, `onTabChange`, `isLocked` (hidden saat locked) | Gunakan lucide-react icons |
| 2.3 | Styling: fixed bottom, white bg, blue active state dengan thin line di atas |

### Phase 3: Buat Tab Content Components

#### Tab "Beranda" (New Dashboard)

| # | Task | Detail |
|---|------|--------|
| 3.1 | Buat `components/attendance/BerandaTab.tsx` | Dashboard utama sesuai referensi |
| 3.1a | **Header:** Logo "DJIWA TENTRAM INTERNAL" (SVG/text) + Smart Greeting (pagi/siang/sore/malam + jam real-time) + nama user + jabatan + avatar |
| 3.1b | **Dynamic Banner:** Komponen `SmartBanner.tsx` — ambil data dari tabel `announcements` (jika ada) atau tampilkan status shift hari ini |
| 3.1c | **Menu Grid:** 2×4 grid card dengan ikon. Tombol-tombol: |
| | `Absensi` → navigate ke `/attendance` |
| | `Rekap Absensi` → set activeTab ke tab "Profile" (scroll ke log) |
| | `Jadwal` → set activeTab ke "Jadwal" |
| | `Izin/Cuti/Sakit` → navigate ke halaman baru `/karyawan/$username/izin` |
| | `Slip Gaji` → set activeTab ke Profile + scroll ke payslip |
| | `Kontrak` → navigate ke `/karyawan/$username/kontrak` (view contract) |
| | `Grup Telegram` → open link Telegram group |
| | `Pusat Bantuan` (pengganti "Telegram Absensi" yang redundant) → action sheet/redirect |
| 3.1d | **Quick Action CTA:** "ABSENSI SEKARANG" button di bawah grid |

#### Tab "Jadwal"

| # | Task | Detail |
|---|------|--------|
| 3.2 | Buat `components/attendance/JadwalTab.tsx` | Bungkus existing `PersonalSchedule` component dengan wrapper. Tampilkan period selector (bulan/tahun) di atas |

#### Tab "Absensi"

| # | Task | Detail |
|---|------|--------|
| 3.3 | Buat `components/attendance/AbsensiTab.tsx` | Redirect/CTA ke halaman `/attendance`. Bisa juga tampilkan ringkasan absensi hari ini (status: sudah masuk/belum) |

#### Tab "Notifikasi" (Halaman Baru)

| # | Task | Detail |
|---|------|--------|
| 3.4 | Buat `components/attendance/NotifikasiTab.tsx` | Tampilkan daftar notifikasi — slip gaji baru, kontrak akan berakhir, pengumuman. Data dari tabel `employee_notifications` atau filter dari announcements. **Empty state:** "Belum ada notifikasi" |

#### Tab "Profile" (Existing Content)

| # | Task | Detail |
|---|------|--------|
| 3.5 | Buat `components/attendance/ProfileTab.tsx` | Pindahkan semua section existing (Data Pribadi, Pengaturan Akun/PIN, Grup Telegram, Slip Gaji historis, Riwayat Absensi, Kontrak Kerja) ke sini |

### Phase 4: Integrasi di Route File

| # | Task | Detail |
|---|------|--------|
| 4.1 | Modifikasi `StaffProfilePage` di `karyawan.$username.lazy.tsx` | Tambah state `activeTab: 'beranda' \| 'jadwal' \| 'absensi' \| 'notifikasi' \| 'profile'` |
| 4.2 | Locked view: tetap tampilkan existing locked UI (tanpa bottom nav) | Setelah unlock, render BottomNav + tab content |
| 4.3 | Unlocked view: ganti semua konten existing dengan render tab content + BottomNav | Hapus floating CTA "Absensi Sekarang" — pindahkan ke tab Beranda |

### Phase 5: Halaman Baru untuk Izin/Cuti/Sakit

| # | Task | Detail |
|---|------|--------|
| 5.1 | Buat route `/karyawan/$username/izin` | `routes/karyawan.$username.izin.tsx` + lazy |
| 5.2 | Form izin: jenis (izin/cuti/sakit), tanggal, alasan, upload dokumen (surat dokter) | Supabase insert ke `attendance_leave_requests` atau tabel serupa |
| 5.3 | Status pengajuan: menunggu / disetujui / ditolak | Tampilkan riwayat pengajuan |

### Phase 6: Database Schema (if needed)

| Tabel / View | Perubahan |
|-------------|-----------|
| `announcements` | Perlu ada tabel untuk banner (jika belum ada). Query: `SELECT * FROM announcements WHERE active = true ORDER BY created_at DESC LIMIT 1` |
| `employee_notifications` | Perlu ada tabel untuk tab notifikasi. Atau bisa gunakan view dari `payslips` + `announcements` |
| `attendance_leave_requests` | Untuk fitur Izin/Cuti/Sakit (jika belum ada) |

### Phase 7: Verifikasi

| # | Task |
|---|------|
| 7.1 | Build + typecheck: `cd /opt/djiwatentramapp && cd apps/web && npx tsc --noEmit` |
| 7.2 | Test: navigate ke `karyawan.djiwatentram.web.id/$username`, unlock PIN, verifikasi semua tab |
| 7.3 | Test: tombol Absensi → redirect ke `/attendance` |
| 7.4 | Test: tombol Izin/Cuti/Sakit → halaman `/karyawan/$username/izin` |
| 7.5 | Test: tombol Slip Gaji → tab Profile + scroll ke section payslip |
| 7.6 | Test: mode locked — bottom nav tidak muncul |

---

## Files Likely to Change

| File | Change Type | Keterangan |
|------|-------------|------------|
| `apps/web/src/routes/karyawan.$username.lazy.tsx` | **Major rewrite** | Tambah state tab, import komponen baru, render kondisional |
| `apps/web/src/routes/karyawan.$username.tsx` | Minor / No change | Route definition tetap |
| `apps/web/src/components/ui/BottomNav.tsx` | **NEW** | Bottom navigation component |
| `apps/web/src/components/attendance/BerandaTab.tsx` | **NEW** | Dashboard beranda |
| `apps/web/src/components/attendance/SmartBanner.tsx` | **NEW** | Dynamic banner |
| `apps/web/src/components/attendance/MenuGrid.tsx` | **NEW** | 2×4 grid menu |
| `apps/web/src/components/attendance/JadwalTab.tsx` | **NEW** | Jadwal tab (wrapper PersonalSchedule) |
| `apps/web/src/components/attendance/AbsensiTab.tsx` | **NEW** | Absensi quick view tab |
| `apps/web/src/components/attendance/NotifikasiTab.tsx` | **NEW** | Notifikasi tab |
| `apps/web/src/components/attendance/ProfileTab.tsx` | **NEW** | Profile tab (existing content) |
| `apps/web/src/components/attendance/PayslipDetailCard.tsx` | **EXTRACT** | From inline ke component |
| `apps/web/src/components/attendance/PayslipSection.tsx` | **EXTRACT** | Payslip logic |
| `apps/web/src/components/attendance/AttendanceLogSection.tsx` | **EXTRACT** | Log kehadiran |
| `apps/web/src/components/attendance/PersonalInfoSection.tsx` | **EXTRACT** | Data pribadi + edit |
| `apps/web/src/components/attendance/AccountSettingsSection.tsx` | **EXTRACT** | Setting PIN |
| `apps/web/src/routes/karyawan.$username.izin.tsx` | **NEW** | Route |
| `apps/web/src/routes/karyawan.$username.izin.lazy.tsx` | **NEW** | Lazy component |
| `apps/web/src/components/attendance/IzinCutiSakit.tsx` | **NEW** | Form izin |
| `apps/web/src/routeTree.gen.ts` | **Auto-regenerated** | TanStack Router |

---

## Risks & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Breaking existing links** ke `/karyawan/$username` (dari admin HRD, onboarding, sistem lain) | Medium | URL tetap sama (karyawan.$username). Tab via internal state, bukan subroute. ✅ |
| **Tab state hilang saat refresh** | Low | Default ke 'beranda'. PIN lock/unlock juga akan reset — user sudah biasa login ulang. |
| **File terlalu besar** (existing 1681 baris + tab logic) | Medium | Fase 1 (extract) wajib dilakukan SEBELUM fase 3/4. Target: route file turun ke <600 baris |
| **Data announcement/banner belum ada di DB** | Medium | Buat SmartBanner yang fallback: jika tidak ada announcement, tampilkan status shift hari ini (prefer data dari stats/shift yang sudah ada) |
| **Notifikasi belum punya tabel** | Low | Di fase pertama, NotifikasiTab bisa tampilkan static empty state + instruksi. Data bisa digabung dari payslip status changes nanti |
| **Izin/Cuti/Sakit perlu tabel baru** | Low | Tunda ke fase terpisah. Di MenuGrid, tombol "Izin/Cuti/Sakit" bisa langsung navigasi ke form sederhana atau modal. Jika tabel belum siap, bisa disable/tooltip "coming soon" |

---

## Implementation Order (Priority)

```
Wave 1 🔥 (paralel — independen):
  ├─ [1] BottomNav.tsx — komponen murni UI
  ├─ [2] SmartBanner.tsx — komponen murni UI
  ├─ [3] MenuGrid.tsx — komponen murni UI

Wave 2 🔥 (paralel — independen):
  ├─ [4] BerandaTab.tsx — gabung [1]+[2]+[3]
  ├─ [5] JadwalTab.tsx — wrapper PersonalSchedule
  ├─ [6] AbsensiTab.tsx — CTA ke /attendance
  ├─ [7] NotifikasiTab.tsx — empty state first

Wave 3 🔥 (paralel — independen):
  ├─ [8] Extract PayslipDetailCard → file terpisah
  ├─ [9] Extract PersonalInfoSection → file terpisah
  ├─ [10] Extract AccountSettingsSection → file terpisah

Wave 4:
  ├─ [11] ProfileTab.tsx — gabung [8]+[9]+[10]+kontrak+telegram
  ├─ [12] Reintegrate karyawan.$username.lazy.tsx — modifikasi utama

Wave 5:
  ├─ [13] Izin/Cuti/Sakit route + komponen
  ├─ [14] Build + typecheck
```

---

## Open Questions

1. **Apakah tabel `announcements` atau `employee_notifications` sudah ada di database?** Perlu dicek di audit schema `/tmp/schema-audit.md`.
2. **Apakah fitur Izin/Cuti/Sakit perlu dibuat sekarang atau bisa ditunda?** Jika ditunda, tombol bisa menuju halaman "Coming Soon" atau modal.
3. **Apakah greeting di header perlu real-time jam (update setiap menit) atau cukup statis saat render?** Real-time lebih baik UX tapi butuh `useEffect` dengan interval.
4. **Untuk Menu Grid: apakah ikon mau custom (SVG) atau pakai emoji + lucide-react?** Referensi pakai ikon tematik (buku coklat, tas koboi). Lucide mungkin tidak punya ikon senada — perlu custom SVG atau emoji fallback.
