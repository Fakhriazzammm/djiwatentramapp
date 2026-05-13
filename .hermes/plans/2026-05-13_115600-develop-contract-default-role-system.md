# Plan: Pengembangan Sistem Kontrak Default & Role Payroll

**Date:** 2026-05-13 11:56 WIB
**Project:** Djiwa Tentram App
**Route:** `/admin/operational-team/register/contract`

---

## Status Implementasi

| Phase | Status | Keterangan |
|-------|--------|------------|
| **Phase 1: Foundation** | ✅ **Selesai** | Structured JSON storage, 23+ dynamic variables, signatory expansion, employment-type templates, clause library |
| **Phase 2: Integration** | ⏳ **3/4 selesai** | Payroll role rules merged ✅, Bonus target config ✅, Custom allowances ✅, Admin preview data ⬜ |
| **Phase 3: Workflow** | ⬜ **Belum** | Contract approval, history, renewal |

---

## 1. Goal

Menganalisis kondisi saat ini dan memberikan roadmap pengembangan untuk sistem kontrak default per role, agar lebih fleksibel, terstruktur, dan terintegrasi dengan payroll/kompensasi.

**Visi Utama:** Kontrak yang **profesional, legal-formal** dengan struktur **Pihak Pertama (Perusahaan)** dan **Pihak Kedua (Karyawan)** — bukan template text generic. Setiap kontrak harus mencantumkan:
- Identitas lengkap **Pihak 1** (nama perusahaan, alamat, NIB/NPWP, penandatangan)
- Identitas lengkap **Pihak 2** (nama, NIK, tempat/tgl lahir, alamat, agama, status)
- Nama karyawan **ditulis otomatis** dari data onboarding (bukan `[Nama Karyawan]`)
- Rincian gaji & kompensasi dari role salary secara real-time
- Area signature profesional: Pihak 1, Pihak 2, dan Mengetahui/Menyetujui
- Format PERJANJIAN KERJA standar Indonesia (PKWT/PKWTT) dengan materi dan nomor kontrak

---

## 2. Current Context

### 2.1. Yang Sudah Ada ✅

| Area | Detail |
|------|--------|
| **Contract Editor** | Halaman `/admin/operational-team/register/contract` — editor kontrak per-role dengan AI generation (via yumi-ai), clause CRUD, preview, PDF download, signatory config |
| **Template Storage** | `contractTemplatesByRoleId` sebagai `Record<string, string>` di `site_settings.raw.employeeOnboarding` — key `__default__` untuk fallback, key `roleId` untuk per-role |
| **Role Salary Defaults** | `getRoleSalaryDefaults(role)` membaca `monthlyFixedSalary`, `dailyAllowance`, `baseShiftRate` dari `role.raw.jsonb` (field yumi_roles) |
| **Dynamic Sync (Candidate)** | `syncDynamicContractClauses()` di `/register` mengganti Pasal 1 (Para Pihak) & Pasal 4 (Kompensasi) dengan data real-time employee |
| **Contract Preview Candidate** | Candidate melihat kontrak di step 3 `/register` — fallback: role template → default template → `buildEmployeeContractTemplate()` |
| **PDF Generation** | jsPDF — unduh kontrak sebagai PDF |
| **Onboarding Payload** | `EmployeeOnboardingApplicationPayload` — contract disimpan sebagai JSON + PDF URL di `employee_onboarding_applications` |
| **Payroll Role Rules** | Tabel `pos.payroll_role_rules` — seeded dari yumi_roles, support effective dating, overtime, bonus config |

### 2.2. Yang Perlu Dikembangkan 🔶

| Area | Gap Saat Ini |
|------|-------------|
| **Template Storage** | Tersimpan sebagai **plain text string**, bukan structured clauses JSON — kehilangan struktur pasal yang sudah dibuat di editor |
| **Clause Sync** | Dynamic sync hanya 2 pasal (Pasal 1 & 4) — sisanya static template text |
| **Employment Type** | Tidak ada template berbeda untuk probation vs full_time vs part_time dalam role yang sama |
| **Contract Versioning** | `templateVersion: 1` hardcoded, tidak ada tracking perubahan template |
| **Role Salary Fields** | Hanya 3 fields dari raw JSONB — `payroll_role_rules` sudah punya lebih banyak (overtime, bonus, dll) tapi tidak diintegrasikan ke template |
| **Contract Renewal** | Tidak ada sistem perpanjangan kontrak — contractDuration ada tapi hanya digunakan di template default |
| **Contract History** | Setelah disubmit, contract PDF tersimpan di storage tapi tidak ada view untuk employee lihat kontrak lama |
| **Clause Library** | Tidak ada reusable clause blocks — setiap role dari nol |
| **Validation** | Tidak ada compliance check kontrak terhadap UU Ketenagakerjaan |
| **Approval Workflow** | Hanya checkbox `contractApproved` — tidak ada workflow approval bertingkat |

### 2.3. Role Structure (`yumi_roles.raw`)

```json
{
  "monthlyFixedSalary": 1500000,
  "baseShiftRate": 50000,
  "dailyAllowance": 10000,
  "baseHourlyRate": 0,
  "bonusTargetConfig": {
    "basis": "monthly|shift",
    "tiers": [{ "thresholdPct": 100, "bonusAmount": 500000 }, ...]
  },
  "customAllowances": [
    { "name": "Tunjangan Transportasi", "amount": 500000, "type": "monthly" }
  ]
}
```

### 2.4. Professional Contract Structure — Target Akhir

Kontrak harus memiliki format profesional dengan struktur tetap yang mencantumkan **Pihak Pertama (Perusahaan)** dan **Pihak Kedua (Karyawan)** secara eksplisit:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        PERJANJIAN KERJA (PKWT/PKWTT)
         Nomor: XXX/DT-SPK/XII/2026
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Pada hari ini, ... tanggal ... bulan ... tahun ...
Yang bertanda tangan di bawah ini:

━━━ PIHAK PERTAMA (PERUSAHAAN) ━━━
Nama Perusahaan  : Djiwa Tentram
Alamat           : [alamat lengkap perusahaan]
NIB/NPWP         : [NIB/NPWP Perusahaan]
Diwakili oleh    : [nama penandatangan]
Jabatan          : [jabatan penandatangan]
Bertindak untuk  : dan atas nama [Perusahaan]
Sebutan          : "PIHAK PERTAMA"

━━━ PIHAK KEDUA (KARYAWAN) ━━━
Nama             : [nama lengkap karyawan]
Tempat/Tgl Lahir : [tempat], [tanggal lahir]
Alamat           : [alamat KTP/domisili sesuai KTP]
NIK              : [16 digit NIK]
Agama            : [agama]
Status           : [menikah/belum menikah]
No. Telepon      : [nomor telepon]
Sebutan          : "PIHAK KEDUA"

Pihak Pertama dan Pihak Kedua, secara bersama-sama
disebut "Para Pihak", terlebih dahulu menerangkan
hal-hal sebagai berikut:

━━━ PASAL-PASAL ━━━
[Pasal 1: Pengangkatan / Masa Kerja]
[Pasal 2: Masa Percobaan] (opsional)
[Pasal 3: Tempat & Waktu Kerja / Shift]
[Pasal 4: Hak & Kewajiban Pihak Pertama]
[Pasal 5: Hak & Kewajiban Pihak Kedua]
[Pasal 6: Gaji & Kompensasi]
  - Gaji Pokok      : Rp [gaji_pokok]/bulan
  - Tunjangan Harian: Rp [tunjangan_harian]/hari
  - Rate Shift      : Rp [rate_shift]/shift
  - Estimasi Total  : Rp [estimasi_total]/bulan
[Pasal 7: Bonus / Insentif] (opsional)
[Pasal 8: Cuti & Izin]
[Pasal 9: Disiplin Kerja]
[Pasal 10: Pemutusan Hubungan Kerja]
[Pasal 11: Penyelesaian Perselisihan]
[Pasal 12: Penutup]

━━━ PENUTUP ━━━
Demikian Perjanjian Kerja ini dibuat dalam rangkap 2 (dua),
asli dan tembusan, keduanya bermeterai cukup dan
mempunyai kekuatan hukum yang sama.

━━━ TANDA TANGAN ━━━

[tempat], [tanggal] ____________________

PIHAK PERTAMA                    PIHAK KEDUA

( [nama penandatangan] )         ( [nama karyawan] )

MENGETAHUI / MENYETUJUI
( [nama HR/Manajer] )
```

### 2.5. Variable Mapping ke Data Diri

Setiap variable di template kontrak harus terisi otomatis dari data yang sudah ada di onboarding flow:

| Variable | Sumber Data |
|----------|------------|
| `{{nama_karyawan}}` | `employee_onboarding_applications.employee_name` (step 1) |
| `{{nama_perusahaan}}` | Signatory config → `site_settings.raw.employeeOnboarding.signatory` |
| `{{penandatangan}}` | Signatory config → `signatory.personName` |
| `{{jabatan_penandatangan}}` | Signatory config — **field baru: perlu ditambah** |
| `{{alamat_perusahaan}}` | Signatory config — **field baru: perlu ditambah** |
| `{{nib_perusahaan}}` | Signatory config — **field baru: perlu ditambah** |
| `{{nik}}` | Step 1 form → `identityNumber` atau `nik` |
| `{{tempat_lahir}}` | Step 1 form → `placeOfBirth` |
| `{{tanggal_lahir}}` | Step 1 form → `dateOfBirth` |
| `{{alamat}}` | Step 1 form → `currentAddress` |
| `{{agama}}` | Step 1 form → `religion` |
| `{{status_pernikahan}}` | Step 1 form → `maritalStatus` |
| `{{telepon}}` | Step 1 form → `phoneNumber` |
| `{{jabatan}}` | Step 2 → employment `roleId` → role name |
| `{{gaji_pokok}}` | Role salary → `monthlyFixedSalary` |
| `{{tunjangan_harian}}` | Role salary → `dailyAllowance` (`Tunjangan Transportasi`) |
| `{{rate_shift}}` | Role salary → `baseShiftRate` |
| `{{estimasi_total}}` | `gaji_pokok + (tunjangan × 22) + (shift_rate × 22)` |
| `{{tanggal_mulai}}` | Step 2 → `startDate` |
| `{{tanggal_akhir}}` | Step 2 → `startDate + contractDuration bulan` |
| `{{durasi_kontrak}}` | Step 2 → `contractDuration` (default 12 bulan) |
| `{{tipe_kontrak}}` | Step 2 → `employmentType` (PKWT/PKWTT/Tetap) |
| `{{lokasi_kerja}}` | Step 2 → outlet/cabang |
| `{{nama_atasan}}` | Data referensi atasan langsung (default: "-") |
| `{{hari}}`, `{{tgl}}`, `{{bulan}}`, `{{tahun}}` | Auto dari tanggal saat kontrak di-render |

### 2.6. Data Flow Diagram

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│  yumi_roles  │────▶│  pos_staff_roles  │────▶│  Contract Editor    │
│  (raw JSONB)  │     │  (read view)     │     │  /register/contract │
└──────┬──────┘     └──────────────────┘     └──────────┬──────────┘
       │                                                │
       ▼                                                ▼
┌──────────────┐                              ┌─────────────────┐
│payroll_role_ │                              │ site_settings   │
│ rules        │                              │ .employeeOnboard│
│ (pos schema) │                              │ .contractTemplat│
└──────────────┘                              │ esByRoleId      │
                                              └────────┬────────┘
                                                       │
                                                       ▼
                                              ┌─────────────────┐
                                              │  /register      │
                                              │ (candidate view)│
                                              │ syncDynamicClaus│
                                              │ → submit       │
                                              └────────┬────────┘
                                                       │
                                                       ▼
                                              ┌─────────────────┐
                                              │employee_onboardi│
                                              │ng_applications  │
                                              │(contract JSONB) │
                                              └─────────────────┘
```

---

## 3. Proposed Approach (3-Phase Roadmap)

### Phase 1: Foundation — Quick Wins (Estimasi: 3-5 hari)

#### 3.1. Structured Template Storage
**Problem:** Template disimpan sebagai plain text, kehilangan struktur clause.
**Solution:** Simpan sebagai structured JSON:
```typescript
interface ContractTemplateValue {
  version: 2;
  title: string;
  clauses: { title: string; body: string; order: number; locked?: boolean }[];
  metadata: { createdAt: string; updatedAt: string; updatedBy?: string };
  salaryFieldMappings?: string[];
}
```

**Files:**
- `apps/web/src/lib/employee-onboarding-settings.ts` — ubah type `contractTemplatesByRoleId` dari `Record<string, string>` → `Record<string, string | ContractTemplateValue>`
- `apps/web/src/routes/admin/operational-team/register/contract.lazy.tsx` — save sebagai structured JSON
- Migrasi backward-compat: baca string lama, parse ke structured format

#### 3.2. Comprehensive Dynamic Variables (Pihak 1 & Pihak 2)
**Problem:** Hanya 2 pasal yang dinamis dengan variable minimal.
**Solution:** Expand `syncDynamicContractClauses()` dengan **23+ variable** yang mapping ke data diri karyawan, perusahaan, dan kompensasi (lihat Section 2.5). Template bisa ditulis dengan `{{variable}}` dan akan di-replace otomatis.

**Variable yang langsung bisa diisi:**
- Data karyawan: `{{nama_karyawan}}`, `{{nik}}`, `{{tempat_lahir}}`, `{{tanggal_lahir}}`, `{{alamat}}`, `{{agama}}`, `{{status_pernikahan}}`, `{{telepon}}`
- Data perusahaan: `{{nama_perusahaan}}`, `{{penandatangan}}`, `{{jabatan_penandatangan}}`, `{{alamat_perusahaan}}` (field baru)
- Data kerja: `{{jabatan}}`, `{{tanggal_mulai}}`, `{{tanggal_akhir}}`, `{{durasi_kontrak}}`, `{{tipe_kontrak}}`, `{{lokasi_kerja}}`, `{{nama_atasan}}`
- Data kompensasi: `{{gaji_pokok}}`, `{{tunjangan_harian}}`, `{{rate_shift}}`, `{{estimasi_total}}`
- Tanggal: `{{hari}}`, `{{tgl}}`, `{{bulan}}`, `{{tahun}}`

**Files:**
- `apps/web/src/routes/register.lazy.tsx` — expand `syncDynamicContractClauses()` with variable replacement
- `apps/web/src/routes/admin/operational-team/register/contract.lazy.tsx` — add variable reference panel

#### 3.3. Signatory Config — Field Perusahaan Lengkap
**Problem:** Signatory config hanya punya `companyName`, `personName`, `signatureImage` — tidak ada alamat, NIB, atau jabatan.
**Solution:** Expand signatory config dengan fields:
- `companyAddress` (alamat perusahaan)
- `companyNIB` (NIB/NPWP)
- `personTitle` (jabatan penandatangan: Direktur, HR Manager, dll)
- `signatureLocation` (kota penandatanganan)

**Files:**
- `apps/web/src/lib/employee-onboarding-settings.ts` — update type
- `apps/web/src/routes/admin/operational-team/register/contract.lazy.tsx` — update form fields

#### 3.4. Employment-Type Templates
**Problem:** Tidak bisa punya template berbeda untuk probation vs full_time.
**Solution:** Key format `{roleId}:{employmentType}` — fallback `{roleId}` → `__default__:{employmentType}` → `__default__`.

**Files:**
- `apps/web/src/lib/employee-onboarding-settings.ts` — update template resolution logic
- `apps/web/src/routes/register.lazy.tsx` — update `contractTemplatesByRoleId[draft.employment.roleId]` → resolve with employment type
- `apps/web/src/routes/admin/operational-team/register/contract.lazy.tsx` — add employment type selector

#### 3.5. Clause Library Panel
**Problem:** Setiap role mulai dari nol.
**Solution:** Panel "Klausul Siap Pakai" dengan reusable clauses:
- **Non-Disclosure / Kerahasiaan** — standar kerahasiaan data perusahaan
- **Non-Compete** — larangan bekerja di kompetitor (opsional)
- **Overtime / Lembur** — aturan dan kompensasi lembur
- **Disiplin & Sanksi** — aturan disiplin, SP1-SP3
- **Masa Percobaan** — ketentuan probation 3 bulan

**Files:**
- `apps/web/src/routes/admin/operational-team/register/contract.lazy.tsx` — add clause library sidebar/modal

---

### Phase 2: Integration — Payroll & Role (Estimasi: 5-7 hari)

#### 3.6. Payroll Role Rules Integration
**Problem:** `getRoleSalaryDefaults()` hanya baca 3 fields dari raw JSONB — `payroll_role_rules` punya lebih banyak data.
**Solution:** Baca `payroll_role_rules` selain dari `role.raw` — merge: overrides dari payroll_role_rules menang.

**Files:**
- `apps/web/src/lib/employee-onboarding-settings.ts` — `getRoleSalaryDefaults()` → juga fetch dari payroll_role_rules
- `apps/web/src/hooks/use-hybrid-pos-data.ts` — add hook `usePayrollRoleRules()`

#### 3.7. Bonus Target Config di Kontrak
**Problem:** `bonusTargetConfig` ada di role raw tapi tidak muncul di kontrak.
**Solution:** Tambahkan option "Sertakan Bonus" di editor kontrak — auto-generate pasal bonus dari config.

**Files:**
- `apps/web/src/lib/employee-onboarding-schema.ts` — add `buildBonusClause()`
- `apps/web/src/routes/register.lazy.tsx` — bonus sync di `syncDynamicContractClauses`

#### 3.8. Contract Preview with Real Employee Data (Admin Side)
**Problem:** Admin editor hanya preview dengan `[Nama Karyawan]` — tidak bisa preview like what candidate sees.
**Solution:** Tambah opsi "Preview sebagai" — pilih employee dari daftar atau isi data dummy.

**Files:**
- `apps/web/src/routes/admin/operational-team/register/contract.lazy.tsx` — add preview mode toggle

#### 3.9. Custom Allowances dari Role
**Problem:** Role bisa punya `customAllowances` di raw JSONB tapi belum diintegrasikan ke kontrak.
**Solution:** Baca `role.raw.customAllowances` dan tambahkan sebagai pasal kompensasi opsional di Pasal 6.

**Files:**
- `apps/web/src/lib/employee-onboarding-schema.ts` — `buildCustomAllowancesBody()`
- `apps/web/src/lib/employee-onboarding-settings.ts` — update `getRoleSalaryDefaults()`

---

### Phase 3: Advanced — Workflow & History (Estimasi: 5-8 hari)

#### 3.10. Contract Approval Workflow
**Problem:** Hanya checkbox approval.
**Solution:** Multi-stage: Admin review → Manager approve → Employee sign → Auto-activate after all signed.

**DB Changes:**
- `employee_onboarding_applications` — add `contract_approved_by` fields, `contract_approved_at`
- New table: `contract_approvals` — id, application_id, approver_role, approved_by, approved_at

**Files:**
- New: `apps/web/src/routes/admin/operational-team/register/approval.lazy.tsx`
- `apps/web/src/routes/register.lazy.tsx` — after-sign flow (sign & submit)

#### 3.11. Contract History Per Employee
**Problem:** Kontrak tersimpan tapi tidak bisa diakses employee.
**Solution:** New route `/admin/operational-team/contracts` — table semua kontrak aktif/histori, filter by employee, download PDF.

**Files:**
- New: `apps/web/src/routes/admin/operational-team/contracts.lazy.tsx`
- New: `apps/web/src/lib/employee-contracts.ts` — query helper

#### 3.12. Contract Renewal / Extension
**Problem:** `contractDuration` hanya di template, tidak ada tracking.
**Solution:** Saat kontrak mau habis (cron job), notifikasi ke admin. Opsi "Perpanjang Kontrak" dengan new contract period.

**Files:**
- New cron job via Hermes: contract-expiry watch
- New: UI extension dialog di contracts page
- `apps/web/src/lib/employee-onboarding-settings.ts` — add `renewal` settings

---

## 4. Database Schema Changes

### 4.1. contract_templates (New Table — Recommended untuk Phase 2+)
```sql
CREATE TABLE pos.contract_templates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id         TEXT NOT NULL,
    employment_type TEXT DEFAULT '__all__',
    title           TEXT NOT NULL,
    clauses         JSONB NOT NULL DEFAULT '[]',
    metadata        JSONB DEFAULT '{}',  -- version, createdAt, updatedBy
    is_active       BOOLEAN DEFAULT true,
    effective_from  DATE,
    effective_to    DATE,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),
    UNIQUE(role_id, employment_type, effective_from)
);
```

### 4.2. contract_templates View
```sql
CREATE VIEW public.pos_contract_templates AS
SELECT ... FROM pos.contract_templates WHERE is_active = true;
```

### 4.3. employee_contracts (New Table — Phase 3)
```sql
CREATE TABLE pos.employee_contracts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id     TEXT NOT NULL,
    application_id  UUID REFERENCES employee_onboarding_applications(id),
    template_id     UUID REFERENCES pos.contract_templates(id),
    contract_text   JSONB NOT NULL,
    pdf_url         TEXT,
    status          TEXT DEFAULT 'active',  -- active, expired, terminated, renewed
    start_date      DATE,
    end_date        DATE,
    probation_end   DATE,
    signed_by_employee_at TIMESTAMPTZ,
    signed_by_company_at  TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT now(),
    metadata        JSONB DEFAULT '{}'
);
```

### 4.4. Alternative: Keep in site_settings (simpler — recommended untuk Phase 1)
If adding new tables is too heavy, extend `contractTemplatesByRoleId` to structured JSON:

```json
contractTemplatesByRoleId: {
  "roleId": {
    "version": 2,
    "title": "Perjanjian Kerja",
    "clauses": [
      { "title": "Pasal 1: Pengangkatan", "body": "{{nama_karyawan}} diangkat..." },
      { "title": "Pasal 2: Masa Percobaan", "body": "..." }
    ],
    "metadata": {
      "createdAt": "2026-05-13T11:00:00Z",
      "updatedAt": "2026-05-13T11:00:00Z"
    },
    "salaryFieldMappings": ["monthlyFixedSalary", "dailyAllowance", "baseShiftRate"]
  }
}
```

---

## 5. UI/UX Specification

### 5.1. Contract Editor (Existing) — Enhancements

**Phase 1:**
- **Variable Reference Panel** — sidebar/tab dengan semua variable yang tersedia, clickable untuk insert ke clause
- **Employment Type Dropdown** — pilih template untuk probation/full_time/part_time
- **Signatory Fields Expansion** — tambah alamat, NIB, jabatan penandatangan
- **Clause Library Sidebar** — "Klausul Siap Pakai" — click untuk add ke editor

**Phase 2:**
- **Tab "Preview dengan Karyawan"** — pilih karyawan dari daftar, lihat kontrak real dengan data
- **Toggle "Sertakan Bonus Target"** — auto-generate pasal bonus
- **Toggle "Sertakan Custom Allowances"** — auto-generate pasal tunjangan tambahan

**Phase 3:**
- **"Approval Status" Badge** — lihat status approval per contract
- **Sign Block Preview** — preview area tanda tangan dengan nama real

### 5.2. Contract List Page (New — Phase 3)
- Table: Karyawan, Role, Tipe, Status (active/expired/renewed), Start, End, Actions
- Filters: status, role, date range
- Actions: View PDF, Perpanjang, Terminate
- States: loading (skeleton), empty ("Belum ada kontrak"), error (retry)

### 5.3. Contract Approval Page (New — Phase 3)
- Queue: pending approvals with employee card
- Detail view: contract text + employee data side by side
- Actions: Approve (with sign), Request Revision, Reject

---

## 6. Integration Points

| Integration | Phase | Description |
|------------|-------|-------------|
| **Yumi AI (yumi-ai edge fn)** | 1 | Enhanced AI prompts dengan variable awareness, support update existing clauses |
| **Payroll Role Rules** | 2 | Baca overtime_rate, bonus config untuk template kontrak |
| **Telegram Bot** | 3 | Notifikasi kontrak mau habis, approval request ke admin group |
| **Purchasing Agent Sync** | 2 | Role purchasing punya kontrak dengan kompensasi spesifik |
| **Attendance System** | 2 | Shift rate dari attendance → kompensasi di kontrak |
| **Yumi Finance** | 3 | Auto-create payroll item dari kontrak yang sudah disetujui |

---

## 7. Files Likely to Change / Create

### Modified (existing files)
| File | Phase |
|------|-------|
| `apps/web/src/lib/employee-onboarding-settings.ts` | 1, 2 |
| `apps/web/src/lib/employee-onboarding-schema.ts` | 1, 2, 3 |
| `apps/web/src/routes/admin/operational-team/register/contract.lazy.tsx` | 1, 2 |
| `apps/web/src/routes/register.lazy.tsx` | 1, 2 |
| `apps/web/src/hooks/use-hybrid-pos-data.ts` | 2 |
| `apps/web/src/lib/employee-onboarding-settings.ts` | 2, 3 |

### New files
| File | Phase |
|------|-------|
| `apps/web/src/lib/employee-contracts.ts` | 3 |
| `apps/web/src/routes/admin/operational-team/contracts.lazy.tsx` | 3 |
| `apps/web/src/routes/admin/operational-team/register/approval.lazy.tsx` | 3 |
| `supabase/migrations/2026XXXX_contract_templates.sql` | 2 (opsional) |
| `supabase/migrations/2026XXXX_employee_contracts.sql` | 3 |

---

## 8. Risk & Tradeoffs

| Risk | Mitigation |
|------|-----------|
| **Breaking existing templates** — ubah storage format bisa corrupt existing `__default__` templates | Backward-compat parser + migration script + test coverage |
| **Performance** — structured JSON lebih besar dari string di site_settings | Compress di DB, lazy load per role |
| **Complexity** — Phase 3 bisa terlalu berat untuk MVP | Prioritaskan Phase 1-2, evaluasi kebutuhan Phase 3 |
| **Payroll Role Rules** — masih baru, mungkin belum stabil | Fallback ke raw JSONB jika payroll_role_rules kosong |
| **AI generation** — structured output kadang tidak konsisten | Add validation layer + retry dengan more specific prompt |
| **Signatory fields baru** — existing signatory config tidak punya alamat/NIB | Tambah field bertahap, default "-" untuk existing users |

---

## 9. Open Questions

1. **Migration strategy:** Apakah template existing perlu di-migrate ke structured format segera, atau support dual format (string lama & JSON baru)?
2. **Role-permissions:** Apakah kontrak approval workflow perlu membedakan level approval (misal: Manager approve untuk role tertentu, Owner untuk role tertentu)?
3. **Contract duration:** Apakah ada kebijakan kontrak minimal untuk employment types tertentu (misal: freelance max 3 bulan)?
4. **Multi-outlet:** Apakah template kontrak perlu dibedakan per lokasi outlet (Djiwa Tentram vs cabang lain)?
5. **Indonesian labor law compliance:** Perlu review legal untuk standard clauses?
6. **Nomor kontrak:** Apakah perlu auto-generate numbering sequence (contoh: 001/DT-SPK/V/2026)?

---

## 10. Recommended Priority Order

```
Phase 1: [P1] Structured Template Storage          (3 hari)
Phase 1: [P1] Dynamic Variables 23+ + Pihak 1 & 2  (2 hari)
Phase 1: [P1] Signatory Config Fields Expansion     (1 hari)
Phase 1: [P2] Employment-Type Templates             (2 hari)
Phase 1: [P2] Clause Library Panel                  (1 hari)
───
Phase 2: [P2] Payroll Role Rules Integration        (2 hari)
Phase 2: [P2] Bonus Target Config + Custom Allw.    (2 hari)
Phase 2: [P3] Admin Preview with Real Data          (2 hari)
───
Phase 3: [P3] Contract List & History Page          (2 hari)
Phase 3: [P3] Renewal/Extension System              (2 hari)
Phase 3: [P4] Contract Approval Workflow            (3 hari)
```

### Recommended Starting Point (Phase 1 — 5 hari kerja)

Day 1-2: **Structured Template Storage + Signatory Expansion**
- Ubah tipe data template → JSON
- Backward-compat parser
- Tambah field alamat, NIB, jabatan di signatory
- Update contract editor untuk save structured JSON

Day 3-4: **Dynamic Variables + Pihak 1 & Pihak 2**
- Expand `syncDynamicContractClauses()` dengan 23+ variable
- Variable reference panel di editor
- Replace otomatis di preview & PDF

Day 5: **Employment-Type Templates + Clause Library**
- Key format `roleId:employmentType`
- Dropdown selector
- 5 reusable clause templates

---
