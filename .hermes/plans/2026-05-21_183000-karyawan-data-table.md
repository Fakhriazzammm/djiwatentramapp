# Plan: Halaman /admin/operational-team/karyawan/data

## Goal

Buat halaman admin baru untuk melihat **seluruh data karyawan secara detail** dalam bentuk tabel dengan banyak kolom, compact, simple, dan mengedepankan UX. Termasuk:
- Tabel data karyawan lengkap (semua field dari `/register` + `/karyawan/$username`)
- File CV / upload CV view
- Export ke PDF & CSV
- Data realtime dari `pos_users_public` view

---

## Current Context

### Route yang sudah ada

```
/admin/operational-team/karyawan        → SettingsPage (mode: operational-team)
/admin/operational-team/karyawan/data   → BELUM ADA (target route baru)
```

### Data source: `pos_users_public` view

```sql
create or replace view public.pos_users_public as
select
  u.source_id as _id, u.name, u.slug, u.username,
  upper(left(coalesce(u.name, '?'), 1)) as initial,
  coalesce(u.is_active, true) as "isActive",
  case when jsonb_typeof(u.raw->'faceDescriptor') = 'array' then true else false end as "hasFace",
  u.role_source_id as "roleId",
  trim(r.name) as "roleName",
  u.receive_report_emails as "receiveReportEmails",
  u.last_login_at as "lastLogin",
  u.raw    -- ✅ full JSONB with personal + employment + CV data
from public.yumi_users u
left join public.yumi_roles r on r.source_id = u.role_source_id;
```

### Data yang tersedia di `raw` JSONB

```
PERSONAL:
├── phone                 → raw.phone
├── identityNumber        → raw.identityNumber
├── address               → raw.address
├── birthDate             → raw.birthDate
├── placeOfBirth          → raw.placeOfBirth
├── emergencyContactName  → raw.emergencyContactName
├── emergencyContactPhone → raw.emergencyContactPhone

EMPLOYMENT:
├── roleId / roleName     → column (available)
├── startDate             → raw.startDate
├── employmentType        → raw.employmentType (probation/permanent)
├── monthlySalary         → raw.monthlySalary
├── dailyAllowance        → raw.dailyAllowance
├── shiftRate             → raw.shiftRate
├── location              → raw.location

CV / DOCUMENTS:
├── cvUrl                 → raw.cvUrl (upload CV URL dari registration)
├── signatureDataUrl      → raw.signatureDataUrl

AUTH / STATUS:
├── password              → raw.password
├── requiresPinChange     → raw.requiresPinChange
├── hasFace               → column (from faceDescriptor)
├── isActive              → column
├── lastLogin             → column

ONBOARDING:
├── onboardingApplicationId → raw.onboardingApplicationId
```

### Hook yang ada: `useHybridPublicUsers()`

Saat ini hanya return field terbatas:
```typescript
return {
    _id, name, slug, initial, hasFace, roleId, roleName
    // ❌ raw tidak di-expose
    // ❌ username tidak di-expose
    // ❌ isActive tidak di-expose
};
```

### Export tools existing

- Sudah ada `jspdf` dan `html2canvas` di dependencies (digunakan untuk PDF kontrak)
- Tidak ada CSV export utility existing

---

## UI/UX Specification

### Design Principles

| Prinsip | Penerapan |
|---------|-----------|
| **Compact** | Font kecil (text-xs/11), padding minimal, sticky header |
| **Professional** | Border-radius seragam (rounded-xl), warna konsisten |
| **Data-dense** | 1 baris = 1 karyawan dengan semua kolom visible di desktop |
| **Responsive** | Tabel dengan horizontal scroll di mobile, card view opsional |
| **Export-first** | Tombol export PDF & CSV prominent di header |

### States

| State | Behavior |
|-------|----------|
| **Loading** | Skeleton 8 baris dengan animate-pulse |
| **Empty** | "Belum ada data karyawan" dengan ilustrasi |
| **Error** | "Gagal memuat data" + tombol retry |
| **Exporting** | Loading spinner di tombol export |
| **Data ready** | Tabel full dengan sticky header, hover row |

### Kolom Tabel

Keputusan: **Tabel horizontal scroll** dengan kolom:

| # | Kolom | Source | Lebar |
|---|-------|--------|-------|
| 1 | **Nama** | `name` | 180px |
| 2 | **Username** | `username` | 150px |
| 3 | **Role** | `roleName` | 120px |
| 4 | **No HP** | `raw.phone` | 140px |
| 5 | **Email** | `username` (sama) | — |
| 6 | **No Identitas** | `raw.identityNumber` | 140px |
| 7 | **Tgl Lahir** | `raw.birthDate` | 120px |
| 8 | **Tempat Lahir** | `raw.placeOfBirth` | 120px |
| 9 | **Alamat** | `raw.address` | 200px |
| 10 | **Tgl Mulai** | `raw.startDate` | 120px |
| 11 | **Status Kerja** | `raw.employmentType` | 100px |
| 12 | **Gaji Pokok** | `raw.monthlySalary` | 120px |
| 13 | **Lokasi** | `raw.location` | 120px |
| 14 | **Status** | `isActive` | 80px |
| 15 | **Wajah** | `hasFace` | 60px |
| 16 | **CV** | `raw.cvUrl` | 80px |
| 17 | **Kontak Darurat** | `raw.emergencyContactName` | 150px |
| 18 | **No Darurat** | `raw.emergencyContactPhone` | 140px |

> **Catatan:** Tidak semua kolom perlu visible di semua viewport. Prioritaskan kolom inti (Nama, Role, No HP, Status, CV) untuk mobile.

### Kolom interaksi

| Kolom | Interaksi |
|-------|-----------|
| **Nama** | Klik → navigasi ke `/karyawan/[slug]` |
| **CV** | Icon download jika ada URL, "—" jika tidak |
| **Role** | Badge |
| **Status** | Badge hijau/abu |
| **Wajah** | Checkmark/emoji |
| **Export** | Button di header |

### Search & Filter

- Search bar di atas tabel: cari berdasarkan nama, username, No HP
- Filter dropdown: Role, Status Kerja (probation/permanent), Status Active/Inactive
- Sort: klik header kolom (default sort by name)

---

## Approach

### 1. Backend: Update `fetchPublicUsers` → expose `raw`

**File:** `apps/web/src/hooks/use-hybrid-attendance-data.ts`

Tambah `raw` dan `username`, `isActive` ke return `fetchPublicUsers()`.

```typescript
return (data ?? []).map((row: any) => ({
    _id: row._id,
    name: row.name,
    slug: row.slug || ...,
    username: row.username || "",
    initial: ...,
    hasFace: Boolean(row.hasFace),
    roleId: row.roleId ?? null,
    roleName: row.roleName ?? "Team",
    isActive: row.isActive !== false,
    raw: row.raw ?? null,        // ➕ baru
}));
```

### 2. Frontend: Buat halaman baru

**File path:**
```
apps/web/src/routes/admin/operational-team/karyawan/data.tsx         → route def
apps/web/src/routes/admin/operational-team/karyawan/data.lazy.tsx    → component
```

**Route definition** (`data.tsx`):
```typescript
import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/admin/operational-team/karyawan/data" as any)({});
```

### 3. Component: Tabel Karyawan

Komponen utama di `data.lazy.tsx`:

- **Header:** Judul "Data Karyawan" + button Export PDF + Export CSV
- **Search bar:** Input text dengan icon search
- **Filter chips:** Role dropdown, Status dropdown
- **Table:** Horizontal scroll dengan sticky header
  - Styling: `text-[11px]`, `rounded-xl`, border-collapse, hover row
  - Empty: "Belum ada data karyawan"
  - Loading: skeleton
- **Footer:** Total count karyawan

### 4. Export PDF

Gunakan `jspdf` + `html2canvas` (sudah ada di dependencies):
- Clone tabel ke canvas
- Generate PDF A4 landscape
- Download otomatis

### 5. Export CSV

Gunakan export sederhana:
- Build CSV string dari data
- Buat Blob + download link
- Nama file: `data-karyawan-{YYYY-MM-DD}.csv`

### 6. Sidebar & Navigation

Tambah entry di:
- `route.tsx` → `PAGE_TITLES` untuk `/admin/operational-team/karyawan/data`
- Sidebar → sub-nav link "Data Karyawan" di bawah "Karyawan"
- Quick menu → tidak perlu (cukup sidebar)

---

## Step-by-step Plan

### Step 1: Update `fetchPublicUsers`

Tambah `username`, `isActive`, `raw` ke return value.

### Step 2: Create route files

- `data.tsx` — basic route definition
- `data.lazy.tsx` — full component

### Step 3: Build tabel component

Di `data.lazy.tsx`:
- Fetch data via `useHybridPublicUsers()`
- State: `searchQuery`, `roleFilter`, `statusFilter`, `sortColumn`, `sortDir`
- Filter & sort logic
- Table render dengan semua kolom
- Loading / empty / error states

### Step 4: Export PDF

- Button export PDF → capture table via html2canvas → jspdf
- Landscape A4

### Step 5: Export CSV

- Button export CSV → build CSV string → download

### Step 6: Register route di sidebar

- Update `route.tsx` → `PAGE_TITLES` map
- Update `route.tsx` → sidebar sub-nav

### Step 7: Build & verifikasi

---

## Files Changed

| File | Perubahan |
|------|-----------|
| `apps/web/src/hooks/use-hybrid-attendance-data.ts` | `fetchPublicUsers` — tambah `username`, `isActive`, `raw` |
| `apps/web/src/routes/admin/operational-team/karyawan/data.tsx` | **BARU** — route definition |
| `apps/web/src/routes/admin/operational-team/karyawan/data.lazy.tsx` | **BARU** — tabel + export |
| `apps/web/src/routes/admin/route.tsx` | `PAGE_TITLES` + sidebar link |

## Files NOT Changed

- Database — tidak perlu migration
- Backend edge functions — tidak perlu
- Registration flow — tidak perlu
- Karyawan profile — tidak perlu

---

## Verification

1. `npx vite build` — must pass
2. Buka `/admin/operational-team/karyawan/data` → tabel muncul dengan data
3. Search by name → filter bekerja
4. Klik export CSV → file terdownload
5. Klik export PDF → file terdownload
6. Klik nama karyawan → navigasi ke `/karyawan/[slug]`

---

## Risks & Mitigation

| Risk | Mitigation |
|------|-----------|
| Tabel terlalu lebar dengan banyak kolom | Horizontal scroll + priority columns untuk mobile |
| Export PDF gagal (html2canvas issue) | Fallback ke CSV-only, tampilkan error toast |
| Data `raw` null untuk user lama | Guard dengan `raw?.phone ?? "---"` |
| Performance dengan banyak karyawan | Virtual scrolling jika > 100 rows (future) |
| Sidebar jadi terlalu panjang | Sub-nav grouping sudah ada (accordion) |
