# Plan: Pindahkan Halaman Indeks `/admin/operational-team` ke `/admin/operational-team/karyawan`

## Goal

Memindahkan konten halaman indeks `/admin/operational-team/` (yang menampilkan `SettingsPage mode="operational-team"` dengan tab default "Pengguna") ke halaman baru `/admin/operational-team/karyawan`, agar rute `/admin/operational-team` tidak lagi menampilkan konten langsung dan hanya berfungsi sebagai layout parent untuk sub-rutenya.

## Current Context

### Struktur Route Saat Ini

```
/admin/operational-team          → Layout route (Outlet) [WAJIB TETAP]
/admin/operational-team/         → Index route → render <SettingsPage mode="operational-team" />
/admin/operational-team/karyawan → BELUM ADA (akan dibuat)
/admin/operational-team/attendance
/admin/operational-team/attendance/pengaturan
/admin/operational-team/payroll
/admin/operational-team/register
/admin/operational-team/register/contract
/admin/operational-team/register/onboarding
/admin/operational-team/register/riwayat
/admin/operational-team/register.application.$registrationNumber
```

### Yang TIDAK Berubah (No-Op)

- Parent layout `/admin/operational-team` dengan `<Outlet />` — **WAJIB TETAP** karena semua child routes bergantung padanya
- Semua sub-route (attendance, payroll, register, dll.) — tidak berubah path-nya
- File `settings.lazy.tsx` — tidak ada perubahan (mode string "operational-team" tidak terkait route path)
- `routeTree.gen.ts` — akan auto-regenerate saat dev server dijalankan

## Proposed Approach

1. **Buat route baru** `/admin/operational-team/karyawan`:
   - `routes/admin/operational-team/karyawan.tsx` — route definition
   - `routes/admin/operational-team/karyawan.lazy.tsx` — component, isi sama dengan index saat ini (`<SettingsPage mode="operational-team" />`)

2. **Ubah index route** `/admin/operational-team/`:
   - `operational-team/index.lazy.tsx` — redirect ke `/admin/operational-team/karyawan` menggunakan `useNavigate` atau `<Navigate>` dari TanStack Router

3. **Update sidebar navigasi** di `routes/admin/route.tsx`:
   - Semua `to="/admin/operational-team"` → `to="/admin/operational-team/karyawan"`
   - Update label "Pengguna" / "Tim Operasional" jika diperlukan
   - Tambah breadcrumb entry `"/admin/operational-team/karyawan": "Karyawan"`

4. **Tambahkan path baru** ke `OPERATIONAL_TEAM_PATHS` agar submenu auto-expand

## Step-by-Step Plan

### Step 1: Buat file route definition karyawan.tsx

**File:** `/opt/djiwatentramapp/apps/web/src/routes/admin/operational-team/karyawan.tsx`

```
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/operational-team/karyawan" as any)({});
```

### Step 2: Buat file lazy component karyawan.lazy.tsx

**File:** `/opt/djiwatentramapp/apps/web/src/routes/admin/operational-team/karyawan.lazy.tsx`

Isi: sama dengan `index.lazy.tsx` saat ini — render `<SettingsPage mode="operational-team" />`

```
import { createLazyFileRoute } from "@tanstack/react-router";
import { SettingsPage } from "../../settings.lazy";

function KaryawanPage() {
    return <SettingsPage mode="operational-team" />;
}

export const Route = createLazyFileRoute("/admin/operational-team/karyawan" as any)({
    component: KaryawanPage,
});
```

### Step 3: Ubah index.lazy.tsx jadi redirect

**File:** `/opt/djiwatentramapp/apps/web/src/routes/admin/operational-team/index.lazy.tsx`

Ganti dari render `<SettingsPage>` menjadi redirect:

```
import { createLazyFileRoute, Navigate } from "@tanstack/react-router";

function OperationalTeamIndexPage() {
    return <Navigate to="/admin/operational-team/karyawan" replace />;
}

export const Route = createLazyFileRoute("/admin/operational-team/" as any)({
    component: OperationalTeamIndexPage,
});
```

### Step 4: Update sidebar di route.tsx

**File:** `/opt/djiwatentramapp/apps/web/src/routes/admin/route.tsx`

Perubahan yang diperlukan:

| Baris | Saat Ini | Menjadi |
|---|---|---|
| 81 | `"/admin/operational-team": "Tim Operasional"` | Tambah entry baru: `"/admin/operational-team/karyawan": "Karyawan"` |
| 126 | `"/admin/operational-team"` di MORE_MENU_PATHS | Tambah `"/admin/operational-team/karyawan"` |
| 165 | `{ to: "/admin/operational-team", ... }` di QUICK_MENU | Ubah → `{ to: "/admin/operational-team/karyawan", label: "Karyawan", ... }` |
| 202 | `"/admin/operational-team"` di OPERATIONAL_TEAM_PATHS | Tambah `"/admin/operational-team/karyawan"` (keep existing) |
| 466 | `to="/admin/operational-team"` (collapsed DesktopNavLink) | Ubah → `to="/admin/operational-team/karyawan"` |
| 487 | `to="/admin/operational-team"` (DesktopSubNavLink) | Ubah → `to="/admin/operational-team/karyawan"` |

> **CATATAN PENTING:** Jangan HAPUS `"/admin/operational-team"` dari `OPERATIONAL_TEAM_PATHS` karena layout parent masih di path itu. Cukup TAMBAH `"/admin/operational-team/karyawan"` saja.

### Step 5: Regenerate route tree

Jalankan Vite dev atau build untuk trigger TanStack Router Plugin meng-generate `routeTree.gen.ts` dengan route baru.

```bash
cd /opt/djiwatentramapp/apps/web
NODE_OPTIONS="--max-old-space-size=512" npx vite build
```

Atau cukup jalankan dev server:
```bash
cd /opt/djiwatentramapp/apps/web
npx vite --host
```

## Files Likely to Change

| File | Action |
|---|---|
| `.../operational-team/karyawan.tsx` | **CREATE** — route definition |
| `.../operational-team/karyawan.lazy.tsx` | **CREATE** — component (copy of index) |
| `.../operational-team/index.lazy.tsx` | **MODIFY** — jadi redirect |
| `.../admin/route.tsx` | **MODIFY** — sidebar links, breadcrumbs, paths |
| `routeTree.gen.ts` | **AUTO-GENERATE** — via Vite plugin |

## Verification Checklist

- [ ] Navigasi ke `/admin/operational-team` → redirect ke `/admin/operational-team/karyawan`
- [ ] `/admin/operational-team/karyawan` → menampilkan `SettingsPage mode="operational-team"` (sama seperti sebelumnya)
- [ ] Sidebar "Tim Operasional" → submenu "Karyawan" link mengarah ke `/admin/operational-team/karyawan`
- [ ] Sidebar "Karyawan" highlight saat di route baru
- [ ] Semua sub-route tetap berfungsi: attendance, payroll, register, dll.
- [ ] Submenu "Tim Operasional" auto-expand saat di route karyawan
- [ ] Breadcrumb menampilkan "Karyawan"
- [ ] Quick menu "Tim Operasional" mengarah ke `/admin/operational-team/karyawan`
- [ ] Tidak ada broken link atau dead end

## Risks & Open Questions

1. **Potensi konflik naming**: Nama route `karyawan` sudah dipakai di `/karyawan/[slug]` (profile page publik). Tapi karena ini di bawah `/admin/operational-team/karyawan`, tidak akan konflik.
2. **Sidebar highlight**: Komponen `DesktopSubNavLink` di baris 487 punya `activeOptions={{ exact: true }}`. Saat di `/admin/operational-team/karyawan`, highlight mungkin hanya untuk route exact. Perlu verifikasi apakah `exact` perlu diubah menjadi `false` agar highlight juga aktif saat di sub-route.
3. **Pengguna yang bookmark** `/admin/operational-team`: Akan di-redirect otomatis, no issue.
4. **Backward compat**: Semua child routes tidak berubah path-nya, aman.
