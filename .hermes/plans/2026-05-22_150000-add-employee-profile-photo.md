# Plan: Tambah Foto Profile Karyawan

## 1. Analisis Masalah

Saat ini employee registration (`/register`) hanya punya upload **CV**, belum ada upload **foto profile**. Foto profile diperlukan agar:

- Admin bisa lihat foto pendaftar di halaman detail aplikasi
- Profile karyawan (`/karyawan/$username`) menampilkan foto, bukan hanya initial
- Admin employee list (`/admin/operational-team/karyawan/data`) menampilkan foto

### Current State

| Area | Status |
|---|---|
| `/register` | Upload CV ✅, upload foto ❌ |
| `employee_onboarding_applications` table | `cv_url` ✅, `photo_url` ❌ |
| `yumi_users` table / `pos_users_public` view | Tidak ada kolom foto ❌ |
| Admin detail aplikasi (`/admin/.../register/application/...`) | Tampil CV ✅, tampil foto ❌ |
| `/karyawan/$username` | Initial saja (line 283 `staff.name.charAt(0)`) ❌ |
| Admin Data Karyawan list | Initial saja (line 567 `row.name.charAt(0)`) ❌ |
| `KaryawanOverview` component | Initial saja (`getInitials(name)`) ❌ |
| Storage bucket `app-assets` | Ada, public, RLS ✅ |

### Key Data Flow

```
Register → upload foto → storage `app-assets/profile-photos/` → URL disimpan
  → employee_onboarding_applications.photo_url (saat register)
  → yumi_users.raw.photo_url atau yumi_users.photo_url (saat approve)
  → pos_users_public view → ditampilkan di profile & admin
```

## 2. Dependency Graph

```
Level 1 (independen → paralel 🔥)
  ├── [1] Migration: add photo_url ke employee_onboarding_applications
  ├── [2] Migration: add photo_url ke yumi_users + update pos_users_public view
  ├── [3] Type: tambah photoUrl di EmployeeOnboardingDraft & Payload
  └── [4] Register: tambah input upload foto di register.lazy.tsx (step 1)

Level 2 (dependen → sequential)
  ├── [5] Payload builder: tambah photo_url di buildEmployeeOnboardingPayload
  │   ← butuh [3]
  ├── [6] Submit hook: tambah photo_url di useHybridSubmitEmployeeApplication insert
  │   ← butuh [3]
  └── [7] Admin detail: tampilkan foto di register.application.$registrationNumber.lazy.tsx
      ← butuh [1] selesai

Level 3 (lanjutan — tampilkan foto di semua tempat)
  ├── [8] Karyawan profile: tampilkan foto di karyawan.$username.lazy.tsx
  │   ← butuh [2] + [4]
  ├── [9] fetchUserBySlug: tambah photo_url di return value
  │   ← butuh [8]
  ├── [10] Admin Data Karyawan: tampilkan foto di data.lazy.tsx
  │   ← butuh [2]
  └── [11] KaryawanOverview: tampilkan foto di komponen
      ← butuh [2]

Level 3.5 (data flow — saat approve & edit profile)
  ├── [12] onboarding-admin: tambah photo_url di insertPayload ke yumi_users
  │   ← butuh [1] + [2]
  └── [13] useHybridUpdateUserProfile: tambah photoUrl support
      ← butuh [2]

Level 4 (verifikasi)
  └── [14] Build & typecheck
```

## 3. Task Detail

### Task [1] — Migration: add photo_url ke employee_onboarding_applications

**File:** `supabase/migrations/20260522000002_add_photo_url_column.sql`

```sql
alter table public.employee_onboarding_applications
  add column if not exists photo_url text;
```

### Task [2] — Migration: add photo_url ke yumi_users + update pos_users_public view

**File:** `supabase/migrations/20260522000003_add_photo_url_yumi_users.sql`

```sql
alter table public.yumi_users
  add column if not exists photo_url text;

-- Update view to include photo_url
create or replace view public.pos_users_public as
select
  u.source_id as _id,
  u.name,
  u.slug,
  upper(left(coalesce(u.name, '?'), 1)) as initial,
  coalesce(u.is_active, true) as "isActive",
  case
    when jsonb_typeof(u.raw->'faceDescriptor') = 'array' then true
    else false
  end as "hasFace",
  u.username,
  u.role_source_id as "roleId",
  trim(r.name) as "roleName",
  u.receive_report_emails as "receiveReportEmails",
  u.last_login_at as "lastLogin",
  u.photo_url as "photoUrl",
  u.raw
from public.yumi_users u
left join public.yumi_roles r on r.source_id = u.role_source_id;

grant select on public.pos_users_public to anon, authenticated;
```

### Task [3] — Type: tambah photoUrl di EmployeeOnboardingDraft & Payload

**File:** `apps/web/src/lib/employee-onboarding-schema.ts`

```typescript
// Di EmployeeOnboardingDraft (line ~54)
photoUrl?: string;

// Di EmployeeOnboardingApplicationPayload (line ~83)  
photo_url: string | null;
```

### Task [4] — Register: tambah input upload foto

**File:** `apps/web/src/routes/register.lazy.tsx`

Referensi: upload CV (line 500-541). Tambahkan setelah upload CV:

- State baru: `photoFile`, `isUploadingPhoto`, `photoUploadedUrl`
- Input file: accept image types (`.jpg,.jpeg,.png,.webp`)
- Preview foto sebelum upload (thumbnail circle)
- Upload di `handleSubmit`, simpan URL ke payload
- Folder storage: `profile-photos`
- Gunakan existing `useHybridGenerateEmployeeOnboardingUploadUrl()` hook

Pattern upload (sama seperti CV):
```typescript
let photoUrl: string | null = photoUploadedUrl ?? null;
if (photoFile && !photoUploadedUrl) {
  setIsUploadingPhoto(true);
  photoUrl = await uploadFile({
    file: photoFile,
    contentType: photoFile.type || "image/jpeg",
    fileName: `${appKey}-photo.${photoFile.name.split(".").pop() || "jpg"}`,
    folder: "employee-contracts/profile-photos"
  });
  setPhotoUploadedUrl(photoUrl);
  setIsUploadingPhoto(false);
}
```

### Task [5] — Payload: tambah photo_url di buildEmployeeOnboardingPayload

**File:** `apps/web/src/lib/employee-onboarding-schema.ts`

Di fungsi `buildEmployeeOnboardingPayload` (line 146-191):
- Tambah parameter `photoUrl?: string | null`
- Tambah return `photo_url: files?.photoUrl ?? null`

### Task [6] — Submit hook: tambah photo_url di insert

**File:** `apps/web/src/hooks/use-employee-onboarding-actions.ts`

Di `useHybridSubmitEmployeeApplication` (line 152-175):
- Tambah `photo_url: payload.photo_url ?? null` di object insert

### Task [7] — Admin detail: tampilkan foto

**File:** `apps/web/src/routes/admin/operational-team/register.application.$registrationNumber.lazy.tsx`

Di section Data Diri (sekitar line 474), tambahkan setelah CV:

```tsx
{app.photo_url && (
  <div className="col-span-2 mt-2 flex justify-center">
    <img src={app.photo_url} alt="Foto Profile" className="h-24 w-24 rounded-full object-cover border-2 border-primary/20 shadow-sm" />
  </div>
)}
```

### Task [8] — Karyawan profile: tampilkan foto

**File:** `apps/web/src/routes/karyawan.$username.lazy.tsx`

- Di locked view (line 282-284): ganti initial dengan foto jika `staff.photoUrl` ada
- Di unlocked view (line 328-329): ganti initial dengan foto jika `staff.photoUrl` ada
- Edit mode: tambah upload foto (gunakan existing `useHybridUpdateUserProfile`)

### Task [9] — fetchUserBySlug: tambah photoUrl

**File:** `apps/web/src/hooks/use-hybrid-attendance-data.ts`

Di `fetchUserBySlug` (line 68-75), tambah:
```typescript
photoUrl: (data as any).photoUrl ?? null,
```

### Task [10] — Admin Data Karyawan: tampilkan foto

**File:** `apps/web/src/routes/admin/operational-team/karyawan/data.lazy.tsx`

Di list row (line 567): ganti initial dengan foto jika tersedia

### Task [11] — KaryawanOverview: tampilkan foto

**File:** `apps/web/src/routes/admin/operational-team/-components/KaryawanOverview.tsx`

Di `getInitials` display: ganti dengan foto jika tersedia

### Task [12] — onboarding-admin: tambah photo_url di insertPayload

**File:** `supabase/functions/onboarding-admin/index.ts`

Di `insertPayload` (line 209-220), tambah:
```typescript
photo_url: String(app?.photo_url ?? "") || undefined,
```

Cari `app.photo_url` dari data aplikasi — ambil dari `employee_onboarding_applications.photo_url` yang sudah di-fetch sebelumnya.

### Task [13] — useHybridUpdateUserProfile: tambah photoUrl support + upload/edit di /karyawan

**File:** `apps/web/src/hooks/use-hybrid-write-actions.ts`

Di fungsi `useHybridUpdateUserProfile` (line 4979-5018):
- Tambah support `photo_url` sebagai direct column update (bukan di `raw`)
- Pattern: `if (args?.photoUrl !== undefined) { updates.photo_url = args.photoUrl; }`

**File:** `apps/web/src/routes/karyawan.$username.lazy.tsx`

Di edit mode (line 82-97), tambahkan:
- State baru: `editPhotoFile: File | null`, `isUploadingPhoto: boolean`
- Input file untuk upload foto (accept `.jpg,.jpeg,.png,.webp`)
- Preview foto lingkaran (ganti initial circle dengan foto jika `staff.photoUrl` atau `editPhotoFile` ada)
- Saat save/edit profile:
  1. Upload foto ke storage `app-assets/profile-photos/` (pakai `useHybridGenerateEmployeeOnboardingUploadUrl()` atau buat handler upload sendiri)
  2. Dapatkan public URL
  3. Panggil `useHybridUpdateUserProfile` dengan `photoUrl: newUrl`
- Tombol hapus foto (set ke null) jika sudah ada foto sebelumnya

### Task [14] — Build & typecheck

```bash
cd /opt/djiwatentramapp/apps/web && npx tsc --noEmit
# atau vite build
```

## 4. Wave Planning

| Wave | Tasks | Subagent | Description |
|---|---|---|---|
| **Wave 1 🔥** | [1], [2], [3], [4] | 4 subagent paralel | Migration DB + Type + Register UI |
| **Wave 2 🔥** | [5], [6], [7] | 3 subagent paralel | Payload + Hook + Admin detail |
| **Wave 3 🔥** | [8], [9], [10], [11] | 4 subagent paralel | Tampilkan foto di semua tempat |
| **Wave 3.5 🔥** | [12], [13] | 2 subagent paralel | Data flow approve + edit profile |
| **Wave 4** | [14] | Kamu sendiri | Build & typecheck |

## 5. Risk & Catatan

- **Legacy products:** foto profile baru tidak akan muncul di produk legacy karena produk pakai image ID lama (Convex). Tidak relevan — ini untuk karyawan.
- **RLS:** Storage bucket `app-assets` sudah public untuk INSERT ✅

### ✅ Sudah Dicek: onboarding-admin edge function

File: `supabase/functions/onboarding-admin/index.ts` (line 209-220)

`insertPayload` saat approve **belum include `photo_url`** → perlu ditambahkan (Task [12]).

`app.photo_url` tersedia dari query aplikasi sebelumnya (`.select("id, status, approved_user_source_id, raw")` — perlu ditambah `photo_url` di select).

### ✅ Sudah Dicek: useHybridUpdateUserProfile hook

File: `apps/web/src/hooks/use-hybrid-write-actions.ts` (line 4979-5018)

Hook ini update `yumi_users` via `updates` object. Saat ini support:
- Direct column: `name, username, slug`
- Raw JSON: `password, phone, identityNumber, address, birthDate, placeOfBirth, emergencyContactName, emergencyContactPhone, bankName, bankAccount, startDate, employmentType, location`

**Belum support `photo_url`** → perlu ditambahkan sebagai direct column update (Task [13]).
