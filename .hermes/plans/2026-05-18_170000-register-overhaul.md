# Plan: Overhaul Sistem & Logika Halaman /register

## Goal
Membenahi seluruh sistem registrasi karyawan agar logika probation benar, flow disederhanakan (tanpa kontrak/signature step), terintegrasi dengan payroll/onboarding/contract/riwayat, dan data sinkron antar semua halaman.

---

## Current Context

### Route Map
| Route | Fungsi | File |
|---|---|---|
| `/register` | Publik: form pendaftaran kandidat | `register.lazy.tsx` |
| `/register/selesai/$registrationNumber` | Halaman sukses | `register.selesai.$registrationNumber.lazy.tsx` |
| `/admin/operational-team/register` | Admin: landing + submenu | `register.lazy.tsx` |
| `/admin/operational-team/register/onboarding` | Review kandidat (reuses AdminOnboardingPage) | `register/onboarding.lazy.tsx` |
| `/admin/operational-team/register/contract` | Template kontrak per role | `register/contract.lazy.tsx` |
| `/admin/operational-team/register/riwayat` | Riwayat kontrak karyawan | `register/riwayat.lazy.tsx` |
| `/admin/operational-team/payroll` | Pengaturan payroll (settings tab) | `payroll.lazy.tsx` |
| Admin Settings → Register tab | Konfigurasi field, steps, pipeline | `settings.lazy.tsx` (line 3089+) |

### Key Files
- `src/lib/employee-onboarding-schema.ts` — Types (EmployeeEmploymentData, draft, payload), validasi, template builder
- `src/lib/employee-onboarding-settings.ts` — Settings types, defaults, normalization, helpers (probation end date, salary defaults)
- `src/routes/register.lazy.tsx` — Multi-step registration form (Data Diri → Data Kerja → Kontrak → Tanda Tangan → Selesai)
- `src/routes/admin/settings.lazy.tsx` — Admin settings (register tab at line 3089)
- `src/routes/admin/operational-team/register/contract.lazy.tsx` — Contract template management

---

## Issues & Root Causes

### Issue 1: Probation Logic Broken
**Current code (register.lazy.tsx:390-393):**
```tsx
const endDate = calculateProbationEndDate(draft.employment.startDate, onboardingSettings.probation.defaultMonths);
```
- Menggunakan `defaultMonths` (3) langsung — **tidak sesuai tipe kerja**
- Tidak ada UI untuk kandidat memilih durasi (6, 12, 24 bulan)
- Fulltime/partime/freelance harusnya 1 bulan tetap, bukan dari defaultMonths

**Sudah ada fungsi yang benar (settings.ts:397-403):**
```tsx
getProbationMonthsForType(employmentType, candidateSelection)
// → probation: 6, 12, 24 bulan (default 6)
// → full_time/part_time/freelance: 1 bulan tetap
```
Tapi **tidak digunakan** di register page.

### Issue 2: Salary Preview Tidak Perlu
- Salary preview di line 396 dan fields gaji (397-399) ditampilkan di step Data Kerja
- User: "tidak perlu ada preview gaji karena sudah ada di kontrak"
- Salary info sudah tercantum di template kontrak (Pasal 5)

### Issue 3: Slug Seharusnya dari Username, Bukan dari FullName
- Current: slug auto-generate dari `draft.personal.fullName` (line 112, 118)
- User: "slug gunakan username" — slug harus dari username
- Slug field bisa disembunyikan, diisi otomatis dari username

### Issue 4: Field Defaults Tidak Sesuai
| Field | Current Default | Yang Diinginkan |
|---|---|---|
| contract | visible: true, required: true | visible: true, required: false |
| signature | visible: true, required: true | visible: false, required: false |
| salary | visible: true, required: false | visible: false, required: false |
| Steps: contract, documents, signature | enabled: true | enabled: false |

### Issue 5: Flow Masih 5-Step
STEPS = ["Data Diri", "Data Kerja", "Kontrak", "Tanda Tangan", "Selesai"]
Setelah kontrak & tanda tangan dinonaktifkan, flow jadi: Data Diri → Data Kerja (→ Docs?) → Selesai

---

## Proposed Approach

### Step 1: Perbaiki Probation Logic

**register.lazy.tsx — UI perubahan:**
- Untuk **employmentType === "probation"**: tampilkan dropdown "Durasi Probation" → pilihan 6, 12, 24 bulan
- Hitung endDate menggunakan `getProbationMonthsForType()` dengan `probationDurationMonths` dari kandidat
- Untuk **full_time/part_time/freelance**: tampilkan teks info "Probation: 1 bulan" (fixed)
- Gunakan `getProbationInfo()` dari settings.ts yang sudah benar

Contoh kode:
```tsx
{draft.employment.employmentType === "probation" && onboardingSettings.probation.enabled && (
  <div className="col-span-2 space-y-2">
    <Field label="Durasi Probation">
      <select className="..." value={draft.employment.probationDurationMonths ?? 6}
        onChange={(e) => updateEmployment("probationDurationMonths", Number(e.target.value))}>
        <option value={6}>6 bulan</option>
        <option value={12}>1 tahun (12 bulan)</option>
        <option value={24}>2 tahun (24 bulan)</option>
      </select>
    </Field>
    {draft.employment.startDate && (
      <p className="text-xs text-muted-foreground">
        Masa probation berakhir: <span className="font-semibold text-amber-600">
          {formatDate(getProbationEndDate(draft.employment.startDate, "probation", draft.employment.probationDurationMonths ?? 6))}
        </span>
      </p>
    )}
  </div>
)}
```

### Step 2: Hapus Salary Preview dari Step Data Kerja

**register.lazy.tsx:**
- Hapus/hidden baris salary preview (line 396)
- Hapus/hidden fields:
  - "Gaji bulanan" (line 397)
  - "Uang harian" (line 398) 
  - "Rate shift" (line 399)
- Atau atur via settings: `fields.salary.visible = false` (default) + `salaryPreview.enabled = false`

**Alternatif via default settings:**
- Ubah `fieldDefaults.salary: { visible: false, required: false }`
- Ubah `salaryPreview.enabled: false`, `salaryPreview.candidateVisibility: "hidden"`

**→ Pilihan: ubah default kode, karena gaji hanya di kontrak, bukan di form register.**

### Step 3: Slug dari Username + Sembunyikan Slug Field

**register.lazy.tsx (line 110-121, 402):**
- Ubah auto-slug: `createEmployeeSlug` dari `draft.employment.username` bukan dari `draft.personal.fullName`
- Sembunyikan field Slug dari UI (sudah auto dari username)
- Sinkron: saat username berubah, auto-update slug

```tsx
useEffect(() => {
  if (!draft.employment.username) return;
  const slug = createEmployeeSlug(draft.employment.username);
  setDraft((prev) => ({
    ...prev,
    employment: { ...prev.employment, slug }
  }));
}, [draft.employment.username]);
```

### Step 4: Ubah Field Defaults

**employee-onboarding-settings.ts (lines 89-109, 126-133):**
| Field/Step | Old Default | New Default |
|---|---|---|
| `salary` | `{ visible: true, required: false }` | `{ visible: false, required: false }` |
| `contract` | `{ visible: true, required: true }` | `{ visible: true, required: false }` |
| `signature` | `{ visible: true, required: true }` | `{ visible: false, required: false }` |
| step: contract | enabled: true | enabled: false |
| step: documents | enabled: true | enabled: false |
| step: signature | enabled: true | enabled: false |

### Step 5: Dynamic Step Navigation

**register.lazy.tsx:**
- Ganti `STEPS` array static dengan dynamic dari `getEnabledOnboardingSteps(settings)`
- Step navigation dan pill indicator otomatis sesuai enabled steps
- Kondisi khusus: step Selesai (success/confirmation) selalu ada

Map enabled steps → indexes:
```
personal → idx 0
employment → idx 1
(contract → idx 2) DISABLED
(documents → idx 3) DISABLED
(signature → idx 4) DISABLED
done/confirm → final step
```

### Step 6: Update Validasi

**register.lazy.tsx — `validateStep()`:**
- Step 1 (Data Kerja): hapus validasi slug (auto-generated), tetap validasi username + PIN
- Step kontrak & signature: skip jika steps disabled
- Hapus validasi `!draft.contract.plainText` dari auto-template apply

**employee-onboarding-schema.ts — `validateEmployeeOnboardingDraft()`:**
- Validasi `probationDurationMonths` sudah benar (line 128-132) — OK ✅
- Hapus validasi kontrak & signature sebagai mandatory (sudah diatur field-level)

### Step 7: Sinkronisasi Admin Settings

**Register page step vs Admin Settings (settings.lazy.tsx:3272-3286):**
- Steps toggle sudah ada di admin settings (Tahapan Formulir)
- Field visibility toggle sudah ada (Kolom Formulir)
- Hanya perlu menambahkan **Probation Settings** ke admin settings:
  - `probation.enabled`: toggle
  - `probation.defaultMonths`: dropdown (3, 6)
  - Opsional: `probation.candidateSelectsDuration`: toggle

### Step 8: Sinkronisasi dengan Halaman Terkait

| Halaman | Integrasi |
|---|---|
| **/admin/operational-team/payroll** | Tidak langsung dependen — payroll baca dari site_settings.employeeOnboarding, akan reflect otomatis |
| **/admin/operational-team/register** | Landing admin — menampilkan statistik field & steps. Akan auto-reflect karena baca settings |
| **/admin/operational-team/register/onboarding** | Review kandidat — baca data aplikasi langsung, tidak tergantung flow register |
| **/admin/operational-team/register/contract** | Contract template — independen dari flow register. Hanya data contract template |
| **/admin/operational-team/register/riwayat** | Riwayat kontrak — baca dari DB `employee_onboarding_applications` |

---

## Files to Change

| File | Perubahan |
|---|---|
| `apps/web/src/lib/employee-onboarding-settings.ts` | Ubah fieldDefaults & step defaults (contract/signature/salary disabled) |
| `apps/web/src/routes/register.lazy.tsx` | Probation UI, salary hide, slug from username, dynamic steps, validasi |
| `apps/web/src/routes/admin/settings.lazy.tsx` | Tambah probation settings di register tab |

---

## No-Hardcode Audit

| Value | Source | Status |
|---|---|---|
| Probation default months | `siteSettings.employeeOnboarding.probation.defaultMonths` | ✅ DB-driven |
| Field visibility/required | `siteSettings.employeeOnboarding.fields.*` | ✅ DB-driven |
| Step enabled/disabled | `siteSettings.employeeOnboarding.steps.*` | ✅ DB-driven |
| Durasi probation options (6,12,24) | Kode (constant untuk probation type) | ⚠️ Hardcode wajar — business rule tetap |
| Durasi probation 1 bulan (fulltime/partime) | Kode (constant untuk non-probation) | ⚠️ Hardcode wajar — sesuai UU |

---

## Risks & Tradeoffs

| Risk | Mitigasi |
|---|---|
| Perubahan field defaults bisa merusak existing pending applications | Data aplikasi sudah tersimpan, tidak dipengaruhi oleh perubahan form defaults |
| Probation duration dipilih kandidat → admin perlu lihat info ini di review | Sudah ada di `probationDurationMonths` field di aplikasi — perlu ditampilkan di `onboarding.lazy.tsx` |
| Salary fields hidden → kandidat tidak bisa edit gaji | Gaji diatur via kontrak (admin), bukan di form register — sesuai permintaan user |
| Slug dari username → existing applications tidak terpengaruh | Hanya berlaku untuk pendaftaran baru |

---

## Verification Steps

1. Buka /register → pastikan step Data Diri → Data Kerja → Selesai (tanpa Kontrak/Tanda Tangan)
2. Pilih tipe "Probation" → muncul dropdown 6/12/24 bulan + end date
3. Pilih Full-time → muncul info "Probation: 1 bulan"
4. Username diisi → slug auto terisi dari username
5. Tidak ada preview/salary fields di step Data Kerja
6. Submit berhasil → data masuk ke DB
7. Cek admin/operational-team/register/onboarding → data baru muncul dengan probationDurationMonths
8. Cek admin/operational-team/register/riwayat → kontrak tampil
9. Build: `pnpm build` (di apps/web) → no TS errors
