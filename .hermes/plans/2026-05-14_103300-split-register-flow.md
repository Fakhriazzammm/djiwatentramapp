# Plan: Split Registration Flow — Candidate Registration (Step 1-2) then Contract (Step 3-4) Post-Approval

## Goal

Memisahkan alur registrasi karyawan di `/register` menjadi 2 fase:

- **Fase 1** (diisi kandidat): Data Diri + Data Kerja → Submit → halaman `/selesai/$registrationNumber`
- **Fase 2** (setelah admin approve): Kandidat lanjut kontrak + tanda tangan digital dari halaman `/selesai`

---

## Current Context

### Existing Flow (saat ini)

`/register` memiliki **5 step dalam 1 halaman**:

| Step | Nama | Isi |
|------|------|-----|
| 0 | Data Diri | Nama, HP, email, NIK, birth, alamat, CV |
| 1 | Data Kerja | Role, tipe kerja, durasi, lokasi, gaji, username |
| 2 | Kontrak | Preview kontrak (read-only template) |
| 3 | Tanda Tangan | Signature pad + checklist persetujuan |
| 4 | Selesai | (tidak dirender — langsung redirect ke `/selesai`) |

Setelah submit → redirect ke `/register/selesai/$registrationNumber` → halaman tracking status (pending/approved/rejected).

### Existing `/selesai/$registrationNumber`

Halaman ini sudah cukup mature — menampilkan:
- Status badge (pending → clock animation, approved → 🎉, rejected, needs_revision)
- Registration number kopiable
- Download PDF contract (jika sudah ada)
- Link ke `/karyawan/login`

**Yang belum ada:** Ketika status sudah "approved", halaman ini belum menyediakan aksi untuk **lanjut ke kontrak + tanda tangan**.

### Approval Flow (backend)

`supabase/functions/onboarding-admin/index.ts` — action `"approve"`:
1. Buat user di `yumi_users`
2. Update `employee_onboarding_applications.status = "approved"`
3. Simpan `approved_user_source_id`, set `employment.startDate = today`

**Tidak ada pipeline step tracking** — hanya status approved/pending/rejected.

### Database Schema

```sql
-- employee_onboarding_applications
id               uuid PK
status           text       -- pending | approved | rejected | needs_revision
full_name        text
phone            text
email            text
identity_number  text
address          text
birth_date       text
emergency_contact jsonb
employment       jsonb      -- { roleId, roleName, startDate, employmentType, monthlySalary, ... }
contract         jsonb      -- { mode, title, plainText, clauses }
contract_pdf_url text
signature_url    text
cv_url           text
attachments      jsonb
raw              jsonb      -- { registrationNumber, contractStatus, pipelineStatus, ... }
status           text
approved_user_source_id text
review_notes     text
reviewed_by      text
reviewed_at      timestamptz
created_at       timestamptz
```

---

## Proposed Approach

### Strategy: Two-Phase Pipeline

Tambahkan field `raw.pipelineStep` di `employee_onboarding_applications`:

| Value | Arti |
|-------|------|
| `"submitted"` | Kandidat sudah submit data diri+kerja, menunggu review |
| `"approved"` | Admin sudah approve, kontrak belum ditandatangani |
| `"contract_signed"` | Kandidat sudah tanda tangan kontrak, flow selesai |

### Flow Diagram

```
KANDIDAT                          ADMIN                         KANDIDAT
   │                                │                              │
   ├─ /register (Step 1-2) ────────┤                              │
   │  Data Diri + Data Kerja       │                              │
   ├─ Submit ───────────────────────┤                              │
   │  raw.pipelineStep="submitted" │                              │
   │                               │                              │
   ├─ /selesai/$regNumber ─────────┤                              │
   │  Status: PENDING              │                              │
   │                               ├── Review di ─────────────────┤
   │                               │   /register/onboarding       │
   │                               ├── Approve ───────────────────┤
   │                               │   status="approved"          │
   │                               │   pipelineStep="approved"    │
   │                               │                              │
   ├─ /selesai auto-refresh ───────┘                              │
   │  Status: ✅ Disetujui                                        │
   │  Tombol: "Lanjut ke Kontrak" ────────────────────────────────┤
   │                                                              │
   ├─ Step 3: Kontrak (read template + preview) ──────────────────┤
   ├─ Step 4: Tanda Tangan Digital ───────────────────────────────┤
   ├─ Submit Contract ────────────────────────────────────────────┤
   │  pipelineStep="contract_signed"                              │
   │  contract_pdf_url generated                                  │
   │  signature_url saved                                         │
   └─ /selesai: ✅ Selesai ───────────────────────────────────────┘
        Unduh PDF + Masuk Akun
```

---

## Step-by-Step Plan

### 1. Database — Pipeline Step Field

- Tambah default `raw.pipelineStep = "submitted"` pada saat insert di `useHybridSubmitEmployeeApplication()` (file: `hooks/use-employee-onboarding-actions.ts` line ~159)
- Update `onboarding-admin/index.ts` handleApprove: set `raw.pipelineStep = "approved"` saat approve

### 2. `/register.lazy.tsx` — Split Flow

**File:** `routes/register.lazy.tsx`

**Changes:**

A. **Ubah STEPS** dari `["Data Diri", "Data Kerja", "Kontrak", "Tanda Tangan", "Selesai"]` → `["Data Diri", "Data Kerja"]`

B. **Hapus render step 2 (Kontrak)** — lines 520-541 — blok `{step === 2 && (...)}`

C. **Hapus render step 3 (Tanda Tangan)** — lines 543-572 — blok `{step === 3 && (...)}`

D. **Ubah handleSubmit** — lines 284-314 — tidak perlu generate PDF kontrak di fase ini, cukup simpan data diri + kerja + CV, set `pipelineStep = "submitted"`. Contract dan signature disimpan nanti di fase 2.

E. **Update progress bar** — dari "4 step" → "2 step"

F. **Update navigation buttons** — step max jadi 1 (bukan 3)

G. **Update header deskripsi** — ubah teks dari "Isi data singkat, baca kontrak, tanda tangan digital" → "Isi data diri dan data kerja, setelah disetujui admin akan lanjut ke kontrak."

### 3. `/register/selesai/$registrationNumber.lazy.tsx` — Live Tracking + Contract Phase

**File:** `routes/register.selesai.$registrationNumber.lazy.tsx`

**Major rework — tambah fase kontrak setelah approved:**

A. **State machine** — tambah state `phase`:
   - `"tracking"` — default. Tampilkan status card seperti sekarang
   - `"contract"` — setelah user klik "Lanjut ke Kontrak"
   - `"signature"` — setelah user review kontrak

B. **Auto-refresh** — polling setiap 30 detik untuk cek perubahan status (approve/reject dari admin)

C. **"Approved" state — tambah tombol "Lanjut ke Kontrak"** — di status approved yang sekarang cuma ada "Masuk ke Akun Karyawan", tambah tombol "Lanjut ke Tanda Tangan Kontrak" yang mengubah phase ke `"contract"`

D. **Phase contract** — render komponen kontrak (sama seperti step 2 yang lama, dengan template dari server):
   - Query kontrak template dari `app.contract` atau generate dari settings
   - Tampilkan `ContractPreview`
   - Tombol "Setuju & Lanjut" → ke phase signature

E. **Phase signature** — render signature pad + checklist:
   - SignaturePad component
   - Checkbox "Data benar" + "Setuju kontrak"
   - Tombol "Kirim Tanda Tangan" → panggil Edge Function baru atau hook untuk:
     - Generate PDF kontrak (dengan tanda tangan)
     - Upload ke storage
     - Update `contract_pdf_url`, `signature_url`, `raw.pipelineStep = "contract_signed"`
   - Setelah berhasil → kembali ke tracking mode, status "Selesai"

F. **Add status "contract_signed"** ke STATUS_CONFIG — tampilkan seperti approved tapi dengan badge "Selesai" dan aksi "Unduh PDF Kontrak" + "Masuk ke Akun"

### 4. Contract Signing Hook — `useHybridSignContract()`

**File baru** di `hooks/` atau tambah di `use-employee-onboarding-actions.ts`

Hook baru: `useHybridSignContract()` — dipanggil dari halaman `/selesai` setelah user tanda tangan:

```ts
async function signContract(applicationId: string, signatureDataUrl: string, contractText: string) {
  // 1. Generate PDF dari contract text + signature
  // 2. Upload PDF ke storage
  // 3. Update employee_onboarding_applications:
  //    - contract_pdf_url = url hasil upload
  //    - signature_url = uploaded signature image
  //    - raw.pipelineStep = "contract_signed"
  //    - contract.plainText = contract text final
}
```

Ini bisa lewat Edge Function `onboarding-admin` dengan action `"sign_contract"` (pakai service_role key) atau langsung dari client.

### 5. Admin Pages — Pipeline Awareness

#### A. `/admin/operational-team/register/onboarding.lazy.tsx`

**Changes:**
- Tambah kolom/filter untuk `pipelineStep` — bedakan "pending review" (submitted) vs "approved waiting contract" vs "contract signed"
- Status badge bisa diperkaya: `submitted` (pending), `approved` (menunggu tanda tangan), `contract_signed` (selesai)

#### B. `/admin/operational-team/register.application.$registrationNumber.lazy.tsx`

**Changes:**
- Tampilkan pipeline step di header
- Kalau sudah `contract_signed`, tampilkan badge hijau "Kontrak Ditandatangani" + link download PDF
- Approve flow tetap sama (status → approved, pipelineStep → approved)

#### C. `/admin/operational-team/register/riwayat.lazy.tsx`

**Changes:**
- Filter tambahan: contract status (active/expired/renewed) tetap sama
- Tampilkan pipelineStep sebagai info tambahan

### 6. Edge Function Update — `onboarding-admin`

**File:** `supabase/functions/onboarding-admin/index.ts`

Tambah action `"sign_contract"`:
```ts
case "sign_contract":
  return await handleSignContract(supabase, payload);
```

Function `handleSignContract`:
1. Generate PDF dari contract text + data karyawan
2. Upload ke storage `employee-contracts/`
3. Update `contract_pdf_url`, `signature_url`, `raw.pipelineStep = "contract_signed"`, `contract.plainText`

### 7. Sidebar & Navigation

**No changes to route.tsx or settings.lazy.tsx needed** — semua route dan sidebar link sudah menggunakan path yang baru (`/register/riwayat`).

---

## Files Likely to Change

| File | Change Type | Notes |
|------|-------------|-------|
| `routes/register.lazy.tsx` | **Major rewrite** | Hapus step 2-4, simpan step 0-1, ubah submit logic |
| `routes/register.selesai.$registrationNumber.lazy.tsx` | **Major rewrite** | Tambah phase contract + signature, polling |
| `hooks/use-employee-onboarding-actions.ts` | **Add hook** | `useHybridSignContract()` baru |
| `hooks/employee-onboarding-schema.ts` | **Minor** | Mungkin perlu tambah tipe untuk pipeline |
| `supabase/functions/onboarding-admin/index.ts` | **Update** | Tambah action `sign_contract` |
| `routes/admin/operational-team/register/onboarding.lazy.tsx` | **Update** | Tambah pipeline filter + badge |
| `routes/admin/operational-team/register.application.$registrationNumber.lazy.tsx` | **Update** | Tampilkan pipeline info |
| `routes/admin/operational-team/register/riwayat.lazy.tsx` | **Minor** | Info tambahan pipeline |

---

## Tests / Validation

1. **Manual test flow:**
   1. Buka `/register` → hanya lihat step 1-2 → isi data → submit
   2. Redirect ke `/selesai/$regNumber` → lihat status pending
   3. Buka `/admin/.../onboarding` → lihat record baru dengan status pending
   4. Approve dari admin → record status jadi approved
   5. `/selesai` auto-refresh → lihat status berubah → tombol "Lanjut ke Kontrak"
   6. Klik tombol → lihat kontrak → signature → submit
   7. Lihat status "Selesai" → download PDF

2. **Edge cases:**
   - Reject → selesai halaman menampilkan alasan
   - Needs revision → tampilkan catatan admin
   - Contract signing gagal (PDF error) → error handling + retry

---

## Risks, Tradeoffs, Open Questions

1. **Auto-refresh polling** — halaman `/selesai` perlu polling untuk deteksi perubahan status. Frekuensi: setiap 30 detik. Risiko: abuse jika banyak kandidat. Mitigasi: hanya polling jika status masih pending.

2. **Security — Contract signing dari `/selesai`** — karena `/selesai` adalah halaman publik (tanpa auth), perlu dipastikan bahwa hanya kandidat yang punya URL (`$registrationNumber`) bisa akses. Registration number mengandung kombinasi nama + kode unik + tanggal, jadi sudah cukup unik.

3. **Contract template availability** — setelah approve, kontrak perlu bisa digenerate. Pastikan `onboardingSettings.contractTemplatesByRoleId` masih bisa diakses dari halaman `/selesai`. Data settings perlu di-query atau disimpan di `raw` saat submit.

4. **Surviving page updates** — halaman `/register` yang lama memiliki teks header: "Isi data singkat, baca kontrak, tanda tangan digital, lalu admin akan review". Teks ini harus diubah karena kontrak ditandatangani setelah approve, bukan sebelum.

5. **Duplicate registration prevention** — jika kandidat mencoba mendaftar lagi dengan data yang sama, sistem harus bisa mendeteksi. Registration number sudah unique.
