# Plan: Data Completeness /register → /karyawan/$username

## Goal

Memastikan seluruh data yang diisi saat registrasi (`/register`) dapat diakses, diedit, dan disimpan di halaman profil karyawan (`/karyawan/$username`). Jika ada field yang belum terisi saat registrasi, field tersebut tetap bisa diisi/dilengkapi di halaman profil.

---

## Current Context

### Data dari `/register` — EmployeeOnboardingDraft

```
PERSONAL              → yumi_users.raw JSONB
├── fullName          → name column (visible ✅)
├── email             → username column (visible ✅)
├── phone             → raw.phone (GAP ❌)
├── identityNumber    → raw.identityNumber (GAP ❌)
├── address           → raw.address (GAP ❌)
├── birthDate         → raw.birthDate (GAP ❌)
├── placeOfBirth      → raw.placeOfBirth (GAP ❌)
├── emergencyContactName  → raw.emergencyContactName (GAP ❌)
├── emergencyContactPhone → raw.emergencyContactPhone (GAP ❌)

EMPLOYMENT            → yumi_users.raw JSONB
├── roleId/roleName   → role_source_id / join role (visible ✅ header)
├── startDate         → raw.startDate (GAP ❌)
├── employmentType    → raw.employmentType (GAP ❌)
├── monthlySalary     → raw.monthlySalary (GAP ❌)
├── dailyAllowance    → raw.dailyAllowance (GAP ❌)
├── shiftRate         → raw.shiftRate (GAP ❌)
├── location          → raw.location (GAP ❌)
├── username          → username column (visible ✅)
├── slug              → slug column (visible ✅)
├── homePin           → home_pin_fingerprint (edit PIN ✅)
```

### Data flow

```
Registration form
  → employee_onboarding_applications.raw (with all personal + employment data)
  → Approval via onboarding-admin edge function
    → INSERT into yumi_users (name, username, slug, home_pin_fingerprint, raw: {...payload.raw})
```

### Database — pos_users_public view

```sql
create or replace view public.pos_users_public as
select
  u.source_id as _id, u.name, u.slug, u.username,
  u.role_source_id as "roleId", trim(r.name) as "roleName",
  u.receive_report_emails as "receiveReportEmails",
  u.last_login_at as "lastLogin",
  u.raw           -- ✅ FULL JSONB INCLUDED
from public.yumi_users u
left join public.yumi_roles r on r.source_id = u.role_source_id;
```

✅ `pos_users_public` sudah include `raw` column  
✅ `yumi_users.raw` sudah berisi semua data personal + employment dari registrasi  
❌ **Frontend hooks tidak memetakan `raw` ke return value**

### Hooks yang perlu diubah

**`fetchPrivateStaffData`** — panggil dari `useHybridPrivateStaffData()`:
```typescript
// Current — doesn't expose raw
return {
    _id, name, slug, username, roleId, roleName, hasFace, isActive,
};
```

**`fetchUserBySlug`** — panggil dari `useHybridStaffBySlug()`:
```typescript
// Current — doesn't expose raw
return {
    _id, name, slug, roleName, hasFace,
};
```

### Halaman profil — `/karyawan/$username`

**View mode existing:**
- Nama Lengkap ✅
- Email / Username ✅
- Username Profil ✅
- Role (header) ✅

**Edit mode existing:**
- Nama ✅ (→ name)
- Email ✅ (→ username)
- Slug ✅ (→ slug)
- Password ✅ (→ raw.password)
- PIN ✅ (→ home_pin_fingerprint)

**Missing (GAP):**
- No HP/WA → view + edit
- No Identitas (KTP) → view + edit
- Alamat → view + edit
- Tempat Lahir → view + edit
- Tanggal Lahir → view + edit
- Kontak Darurat (Nama + No) → view + edit
- Tgl Mulai Kerja → view only (bisa diedit oleh admin nanti)
- Status Kerja → view only
- Gaji Pokok / Tunjangan → view only (sensitif, mungkin hanya admin)
- Lokasi → view + edit

---

## Proposed Approach

### Phase 1: Backend — expose `raw` from hooks

**File:** `apps/web/src/hooks/use-hybrid-attendance-data.ts`

1. Update `fetchPrivateStaffData()` — tambah `raw` ke return
2. Update `fetchUserBySlug()` — tambah `raw` ke return

### Phase 2: Backend — update profile mutation

**File:** `apps/web/src/hooks/use-hybrid-write-actions.ts`

3. Update `useHybridUpdateUserProfile()` — tambah parameter:
   - `phone` → merge ke `raw.phone`
   - `identityNumber` → `raw.identityNumber`
   - `address` → `raw.address`
   - `birthDate` → `raw.birthDate`
   - `placeOfBirth` → `raw.placeOfBirth`
   - `emergencyContactName` → `raw.emergencyContactName`
   - `emergencyContactPhone` → `raw.emergencyContactPhone`
   - `startDate` → `raw.startDate`
   - `employmentType` → `raw.employmentType`
   - `location` → `raw.location`

   Mekanisme: `updates.raw = { ...user.raw, phone: args.phone, ... }` (merge, replace only changed fields)

### Phase 3: Frontend — halaman profil

**File:** `apps/web/src/routes/karyawan.$username.lazy.tsx`

4. **View mode** — tambah field di section "Data Pribadi":
   ```
   No HP/WA              (+) nilai dari raw.phone
   No Identitas (KTP)    (+) nilai dari raw.identityNumber
   Tempat, Tanggal Lahir (+) raw.placeOfBirth + raw.birthDate
   Alamat                (+) raw.address
   Kontak Darurat        (+) raw.emergencyContactName + raw.emergencyContactPhone
   ```

5. **View mode** — buat section baru "Informasi Kerja":
   ```
   Jabatan               ✅ existing (header)
   Tgl Mulai             (+) raw.startDate
   Status                (+) raw.employmentType (probation/permanent/etc)
   Gaji Pokok            (+) raw.monthlySalary (mungkin hidden kecuali admin)
   ```

6. **Edit mode** — tambah input fields di form edit untuk field yang bisa diubah sendiri:
   - No HP/WA (`phone`)
   - No Identitas KTP (`identityNumber`)
   - Tempat Lahir (`placeOfBirth`)
   - Tanggal Lahir (`birthDate`)
   - Alamat (`address`)
   - Kontak Darurat Nama (`emergencyContactName`)
   - Kontak Darurat No (`emergencyContactPhone`)

7. **Edit handler** — update `useEffect` untuk inisialisasi field baru dari `privateData?.raw`
8. **Submit handler** — kirim field baru ke `updateProfileMutation`

### Design Rules

- Compact: `text-xs`, `rounded-xl`, `h-10` input, `text-[9px]` label
- Jika `raw` belum ada nilai: tampilkan "---" (muted) di view, placeholder di edit
- Grouping: personal fields dalam satu card "Data Pribadi", employment fields dalam card "Informasi Kerja"
- Tidak perlu card baru — reuse pattern existing (rounded-2xl border bg-card p-4 space-y-4)

---

## Files Changed

| File | Changes |
|------|---------|
| `apps/web/src/hooks/use-hybrid-attendance-data.ts` | Tambah `raw` ke `fetchPrivateStaffData` & `fetchUserBySlug` |
| `apps/web/src/hooks/use-hybrid-write-actions.ts` | Tambah personal field updates ke `useHybridUpdateUserProfile` |
| `apps/web/src/routes/karyawan.$username.lazy.tsx` | Tambah view + edit untuk personal + employment fields |

## Files NOT Changed

- Database schema — sudah siap (`raw` column, view sudah expose)
- Migration files — tidak perlu
- Edge functions — tidak perlu
- Registration flow — tidak perlu
- Admin UI — tidak perlu

---

## Verification

1. `npx vite build` — must pass
2. Buka `/karyawan/[slug]` → lihat data personal muncul
3. Klik "EDIT PROFIL" → isi No HP, Alamat, dll → Simpan
4. Refresh halaman → data tersimpan permanen
5. Buka staff yang registrasinya sudah lengkap → semua data terbaca

---

## Existing Users — Critical Path

User existing (sebelum sistem registrasi dibuat) umumnya punya:

| Skenario | Kondisi `raw` | Dampak |
|----------|--------------|--------|
| **User baru via registrasi** ✅ | `raw = { phone: "...", identityNumber: "...", ... }` | Data langsung muncul, bisa diedit |
| **User lama, belum pernah update profil** ⚠️ | `raw = {}` atau `null` | View mode tampilkan "---", edit mode bisa diisi |
| **User lama, pernah update PIN** ⚠️ | `raw = { password: "xxx" }` | Hanya password terisi, field lain "---" |

### Mitigasi untuk existing users

1. **`fetchPrivateStaffData` / `fetchUserBySlug`** — return `raw` apa adanya (bisa `null` atau `{}`)
2. **View mode** — guard dengan `privateData?.raw?.phone ?? "---"` — aman untuk null
3. **Edit mode init** — `setEditPhone(privateData?.raw?.phone ?? "")` — empty string, user tinggal isi
4. **Save handler** — kode update `raw` harus handle `null`:
   ```typescript
   // Inside useHybridUpdateUserProfile
   const existingRaw = user.raw ?? {};  // Handle null
   updates.raw = {
       ...existingRaw,    // Preserve existing fields (faceDescriptor, password, dll)
       ...(args.phone !== undefined ? { phone: args.phone } : {}),
       ...(args.identityNumber !== undefined ? { identityNumber: args.identityNumber } : {}),
       // ... etc
   };
   ```
5. **Badge "Lengkapi Data" untuk existing user yang belum isi data** — tambahkan info banner di atas section "Data Pribadi":
   ```
   ┌────────────────────────────────────────────────┐
   │ ⚠️ LENGKAPI DATA DIRI                           │
   │ Isi No HP, Alamat, dan data lainnya untuk       │
   │ memudahkan administrasi.                        │
   │                                      [EDIT NOW] │
   └────────────────────────────────────────────────┘
   ```
   - Trigger: jika salah satu field `raw.phone`, `raw.identityNumber`, `raw.address`, `raw.birthDate`, `raw.emergencyContactName` kosong/null
   - Style: `rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900` (sama seperti banner PIN default)
   - Tombol "EDIT NOW" → scroll ke form edit / trigger `setIsEditMode(true)`
   - Hilang otomatis setelah user simpan data (karena field tidak kosong lagi)

6. **Test case existing user:**
   - Buka profil user lama (sebelum registrasi)
   - Banner "Lengkapi Data Diri" muncul ✅
   - "No HP/WA" tertampilkan "---"
   - Klik EDIT NOW → mode edit aktif ✅
   - Isi No HP, Simpan
   - Refresh → No HP muncul, banner hilang ✅
   - Buka profil user baru (via registrasi) → data lengkap tanpa edit, tanpa banner ✅

## Risks & Mitigation

| Risk | Mitigation |
|------|-----------|
| `raw.phone` dll belum terisi untuk staff lama | Tampilkan "---" — tidak crash, user bisa isi sendiri |
| `raw` bisa `null` di DB | Guard dengan `user.raw ?? {}` di semua akses |
| Update `raw` menimpa data lain (faceDescriptor, password) | Merge dengan spread: `{ ...existingRaw, phone: newPhone }` |
| Staff bisa edit gaji sendiri | Jangan expose `monthlySalary` di edit mode — hanya view only |
| `useHybridPrivateStaffData` dipake di tempat lain | Tambah field baru, tidak hapus existing — backward compatible |
