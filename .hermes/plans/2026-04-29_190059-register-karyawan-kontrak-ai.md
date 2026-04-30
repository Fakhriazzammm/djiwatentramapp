# Plan: Halaman `/register` Karyawan Baru + Kontrak Kerja AI + Tanda Tangan

## Goal

Membangun alur onboarding karyawan baru di aplikasi Djiwa Tentram/YumiPOS:

1. Karyawan membuka `/register` tanpa login.
2. Mengisi data diri dan data kerja.
3. Mengisi / membuat kontrak kerja.
4. Kontrak bisa dibuat dari template manual, custom/canvas editor, atau di-generate AI.
5. Karyawan menandatangani kontrak secara digital.
6. Data pendaftaran tersimpan dan bisa ditindaklanjuti admin menjadi user/staff aktif di fitur operational team yang sudah ada.

## Current Context / Assumptions

- Repo aktif: `/opt/djiwatentramapp`.
- Frontend: `apps/web`, React 19 + Vite + TanStack Router.
- Route berbasis file ada di `apps/web/src/routes`.
- Root auth guard saat ini redirect semua route non-login ke `/login` jika belum authenticated (`apps/web/src/routes/__root.tsx`). `/register` harus di-whitelist sebagai public route.
- Staff/user existing terbaca dari:
  - `pos_users_public`
  - `pos_staff_users`
  - `pos_staff_roles`
- Admin operational team sudah ada via `apps/web/src/routes/admin/operational-team.lazy.tsx` yang reuse `SettingsPage mode="operational-team"`.
- Write actions/hybrid Supabase pattern berada di `apps/web/src/hooks/use-hybrid-write-actions.ts`.
- AI action existing memakai Supabase Edge Function `yumi-ai` via helper `invokeYumiAiAction(...)` di `use-hybrid-write-actions.ts`.
- Storage upload existing tersedia via `useHybridStorageUpload()` di `use-hybrid-write-actions.ts`, bucket default `app-assets`.
- App sudah punya `jspdf` dan `html2canvas` dependency, bisa dipakai untuk export kontrak PDF tanpa dependency baru.

## Proposed Approach

Bangun fitur sebagai onboarding module terpisah, tapi tetap terintegrasi dengan data staff/admin existing:

- Public route `/register` untuk karyawan.
- Multi-step wizard:
  1. Data Diri
  2. Data Kerja
  3. Kontrak Kerja
  4. Tanda Tangan & Submit
  5. Selesai
- Simpan aplikasi/pendaftaran sebagai record pending di tabel baru `employee_onboarding_applications` atau fallback dokumen mirror jika migrasi tabel belum siap.
- Buat admin review page di bawah operational team, misalnya `/admin/employee-applications`, atau tab baru di Settings/Operational Team untuk menyetujui pendaftaran.
- Saat admin approve, buat/update user staff memakai action existing/pattern `useHybridCreateUser`, role dari `pos_staff_roles`, dan status pendaftaran menjadi `approved`.
- Generate kontrak AI dilakukan via `yumi-ai` Edge Function action baru, misalnya `generateEmployeeContract`, dengan input data karyawan + parameter kontrak.
- Signature dibuat dengan canvas HTML, disimpan sebagai base64/Blob, lalu upload ke Supabase Storage.
- Kontrak final disimpan sebagai HTML/JSON + optional PDF URL + signature URL untuk audit.

## UX / Page Flow

### `/register`

Satu halaman public dengan wizard mobile-first.

#### Step 1 — Data Diri

Field minimum:

- Nama lengkap
- Email
- Nomor HP / WhatsApp
- NIK / nomor identitas
- Alamat
- Tanggal lahir
- Kontak darurat: nama + nomor HP
- Upload KTP opsional
- Upload foto diri opsional

Validasi:

- Nama wajib
- Nomor HP wajib
- Email valid jika diisi
- NIK numeric dengan panjang minimal realistis jika diisi

#### Step 2 — Data Kerja

Field:

- Role/jabatan: select dari `useHybridStaffRoles()` (`pos_staff_roles`)
- Tanggal mulai kerja
- Tipe kerja: full-time / part-time / freelance / probation
- Lokasi kerja/outlet (default Djiwa Tentram)
- Gaji pokok/bulanan, uang harian, atau rate shift
- Jadwal/shift default opsional
- PIN 6 digit untuk login karyawan, validasi sama dengan `HOME_PIN_REGEX` di settings
- Username/slug otomatis dari nama, bisa diedit

Catatan keamanan:

- Jangan langsung mengaktifkan staff baru dari public route tanpa approval admin.
- PIN disimpan hanya saat approval, atau disimpan encrypted/hashed via server-side/edge function jika harus disimpan di pending application.

#### Step 3 — Kontrak Kerja

Mode kontrak:

1. **Template standar**
   - Auto-fill data karyawan, jabatan, tanggal mulai, kompensasi, aturan kerja, masa percobaan.
2. **AI Generate**
   - Form prompt tambahan:
     - jenis kontrak
     - durasi kontrak/probation
     - benefit/tunjangan
     - aturan khusus
     - catatan HR
   - Tombol “Generate dengan AI”.
   - Output editable di rich-ish editor sederhana / textarea preview HTML/markdown.
3. **Custom / Canvas editor**
   - Canvas layout berbasis blok: judul, paragraf, tabel, klausul, placeholder data karyawan, area tanda tangan.
   - Untuk MVP, gunakan editor split: daftar blok di kiri, preview dokumen di kanan; tidak perlu drag-and-drop kompleks dulu.

Kontrak harus bisa:

- Preview sebelum tanda tangan
- Edit manual setelah AI generate
- Reset ke template standar
- Export final ke PDF dengan `html2canvas` + `jspdf` atau print CSS

#### Step 4 — Tanda Tangan & Submit

Komponen signature pad:

- Canvas pointer/mouse/touch support
- Clear signature
- Simpan sebagai PNG data URL
- Checkbox persetujuan:
  - “Saya menyatakan data benar.”
  - “Saya menyetujui isi kontrak kerja.”
- Submit pendaftaran

Setelah submit:

- Upload signature PNG ke storage: `employee-contracts/signatures/<applicationId>.png`
- Generate/upload PDF final: `employee-contracts/contracts/<applicationId>.pdf`
- Insert application pending
- Tampilkan success screen dengan nomor pendaftaran

#### Step 5 — Selesai

- Tampilkan status “Menunggu approval admin”.
- Tampilkan ringkasan data dan tombol download kontrak jika PDF berhasil dibuat.
- Beri instruksi: admin akan mengaktifkan akun/PIN setelah review.

## Data Model Plan

### Preferred: Supabase migration table baru

Tambahkan migration SQL untuk tabel public/pos schema yang sesuai pola project. Nama yang disarankan:

`public.employee_onboarding_applications`

Kolom:

- `id uuid primary key default gen_random_uuid()`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`
- `status text not null default 'pending'` (`pending`, `approved`, `rejected`, `needs_revision`)
- `full_name text not null`
- `email text`
- `phone text not null`
- `identity_number text`
- `address text`
- `birth_date date`
- `emergency_contact jsonb`
- `employment jsonb not null`
  - roleId, roleName, startDate, employmentType, compensation, username, slug
- `contract jsonb not null`
  - mode, html, text, aiPrompt, generatedAt, templateVersion, clauses
- `signature_url text`
- `contract_pdf_url text`
- `attachments jsonb`
- `approved_user_source_id text`
- `reviewed_by text`
- `reviewed_at timestamptz`
- `review_notes text`
- `raw jsonb`

RLS:

- Public insert allowed but constrained to safe columns (prefer via Edge Function for better validation).
- Public select should **not** expose all applications.
- Admin authenticated/session path can list/update via existing app permissions.

### Safer Alternative: Edge Function only

Karena public route bisa disalahgunakan, lebih aman submit lewat Supabase Edge Function baru:

- `employee-onboarding` action `submitApplication`
- Validasi input server-side
- Optional rate limit by IP/phone
- Insert menggunakan service role
- Storage upload signed URL atau receive base64 signature/PDF and upload server-side

Namun untuk implementasi cepat, bisa mulai client insert jika RLS sudah benar.

## AI Contract Generation Plan

### Frontend hook

Tambahkan hook di `apps/web/src/hooks/use-hybrid-write-actions.ts`:

- `useHybridGenerateEmployeeContract()`
- Memanggil `invokeYumiAiAction("generateEmployeeContract", payload)`
- Fallback lokal membuat template kontrak standar jika Edge Function gagal.

Payload:

```ts
{
  employee: {
    fullName: string;
    phone?: string;
    email?: string;
    address?: string;
  };
  employment: {
    roleName: string;
    startDate: string;
    employmentType: string;
    compensation: Record<string, unknown>;
  };
  company: {
    name: string;
    address?: string;
  };
  options: {
    tone: "formal" | "simple";
    probationMonths?: number;
    customNotes?: string;
    clauses?: string[];
  };
}
```

Response:

```ts
{
  title: string;
  html: string;
  plainText: string;
  clauses: Array<{ title: string; body: string }>;
}
```

### Edge Function update

Update Supabase Edge Function `yumi-ai` untuk action `generateEmployeeContract`:

- Prompt AI harus Bahasa Indonesia formal.
- Output harus JSON valid.
- Sertakan disclaimer internal bahwa dokumen harus direview admin/HR.
- Sanitasi output di frontend sebelum render (`dangerouslySetInnerHTML` hanya jika sanitized; jika belum ada DOMPurify dependency, render plain text/markdown sederhana dulu).

## Files Likely to Change

### Routes

- `apps/web/src/routes/__root.tsx`
  - Whitelist public route `/register` supaya tidak redirect ke `/login`.
- `apps/web/src/routes/register.tsx`
  - Route shell `createFileRoute("/register")`.
- `apps/web/src/routes/register.lazy.tsx`
  - Main onboarding wizard page.
- Optional:
  - `apps/web/src/routes/admin/employee-applications.tsx`
  - `apps/web/src/routes/admin/employee-applications.lazy.tsx`

### Components

Disarankan buat folder baru:

- `apps/web/src/components/employee-onboarding/register-wizard.tsx`
- `apps/web/src/components/employee-onboarding/personal-data-step.tsx`
- `apps/web/src/components/employee-onboarding/employment-data-step.tsx`
- `apps/web/src/components/employee-onboarding/contract-editor-step.tsx`
- `apps/web/src/components/employee-onboarding/contract-preview.tsx`
- `apps/web/src/components/employee-onboarding/signature-pad.tsx`
- `apps/web/src/components/employee-onboarding/onboarding-success.tsx`
- `apps/web/src/components/employee-onboarding/admin-applications-table.tsx`

### Hooks / Lib

- `apps/web/src/hooks/use-hybrid-write-actions.ts`
  - Add submit onboarding, generate AI contract, upload helper usage, approve/reject application.
- `apps/web/src/hooks/use-hybrid-pos-data.ts`
  - Add `useHybridEmployeeApplications()` for admin list.
- `apps/web/src/lib/employee-contract-template.ts`
  - Template standar kontrak kerja.
- `apps/web/src/lib/employee-onboarding-schema.ts`
  - Zod schema/types/validation helpers.
- `apps/web/src/lib/contract-pdf.ts`
  - Generate PDF from contract preview element using `html2canvas`/`jspdf`.
- `apps/web/src/lib/sanitize-contract-html.ts`
  - Minimal sanitizer or render-safe transform.

### Supabase / Backend

Cari struktur migration project terlebih dahulu sebelum implementasi. Kemungkinan file baru:

- `supabase/migrations/<timestamp>_employee_onboarding_applications.sql`

Edge Function:

- `supabase/functions/yumi-ai/index.ts` atau path function existing yang sesuai
  - Add `generateEmployeeContract` action.

### Navigation/Admin UI

- `apps/web/src/routes/admin/settings.lazy.tsx`
  - Add tab/card “Pendaftaran Karyawan” in operational-team mode, or link to route new admin page.
- Optional sidebar/nav component if admin menu is centralized.

## Step-by-Step Implementation Plan

### Phase 1 — Read-only discovery before coding

1. Inspect migration folder and Supabase schema conventions.
2. Inspect existing `useHybridCreateUser`, `useHybridUpdateUser`, `useHybridDeleteUser`, `useHybridCreateRole` implementations in `use-hybrid-write-actions.ts`.
3. Inspect admin settings user creation flow around `newUser` and submit handlers in `settings.lazy.tsx`.
4. Inspect existing `yumi-ai` Edge Function action structure.
5. Confirm whether public insert table or edge function submission is preferred based on existing RLS patterns.

### Phase 2 — Data layer

1. Add database migration for `employee_onboarding_applications`.
2. Add RLS policies or implement Edge Function-only writes.
3. Add frontend types and Zod schemas.
4. Add hooks:
   - `useHybridSubmitEmployeeApplication`
   - `useHybridGenerateEmployeeContract`
   - `useHybridEmployeeApplications`
   - `useHybridApproveEmployeeApplication`
   - `useHybridRejectEmployeeApplication`

### Phase 3 — Public route `/register`

1. Add TanStack route files.
2. Update `__root.tsx` public route whitelist:
   - `/login`
   - `/register`
   - Any customer/public routes that already need public access, if applicable.
3. Build wizard state with local React state and validation.
4. Integrate role select from `useHybridStaffRoles()`.
5. Add autosave draft to localStorage so input is not lost on refresh.
6. Add responsive UI using existing `Button`, `Input`, `Textarea`, `Card`, `Select`, `Checkbox`, `Badge`, `Dialog` components.

### Phase 4 — Contract editor + AI generate

1. Implement standard contract generator in `employee-contract-template.ts`.
2. Implement AI generate button:
   - Loading state
   - Error fallback to standard template
   - Editable result
3. Implement simple block/canvas editor MVP:
   - Add clause
   - Edit clause
   - Remove/reorder clause
   - Preview document
4. Avoid unsafe raw HTML rendering unless sanitized.
5. Add print/PDF-friendly contract preview.

### Phase 5 — Signature + PDF/storage

1. Build `SignaturePad` using `<canvas>` with pointer events.
2. Convert signature canvas to PNG Blob.
3. Render contract preview DOM into PDF.
4. Upload signature and PDF using existing storage helper.
5. Submit application with returned URLs.
6. Show success screen.

### Phase 6 — Admin review integration

1. Add admin applications table:
   - status filter
   - search by name/phone
   - view contract preview
   - download PDF
   - approve/reject buttons
2. Approve flow:
   - Pre-fill user creation payload from application employment data.
   - Create user via existing user action/pattern.
   - Mark application approved with `approved_user_source_id`.
3. Reject/needs revision flow:
   - Save review notes.
4. Add link/tab in operational team page.

### Phase 7 — AI Edge Function

1. Extend `yumi-ai` action switch with `generateEmployeeContract`.
2. Add validation and prompt.
3. Ensure response JSON parse is robust.
4. Return fallback-friendly error messages.
5. Verify no API keys are exposed to frontend.

## Tests / Validation

### Automated

Run from repo root after implementation:

```bash
BUN_CONFIG_REGISTRY=https://registry.npmjs.org ~/.bun/bin/bun install
~/.bun/bin/bun --cwd apps/web run check-types
~/.bun/bin/bun --cwd apps/web run build
```

If unit tests are added:

```bash
~/.bun/bin/bun test
```

Add test targets if test setup supports it:

- `apps/web/src/lib/__tests__/employee-onboarding-schema.test.ts`
- `apps/web/src/lib/__tests__/employee-contract-template.test.ts`

### Manual QA

1. Open `/register` while logged out.
   - Must not redirect to `/login`.
2. Fill data diri with invalid email/phone.
   - Validation appears.
3. Fill data kerja and select existing role.
4. Generate contract using template.
5. Generate contract with AI.
   - If AI fails, fallback template still usable.
6. Edit contract clauses manually.
7. Sign with mouse/touch.
8. Submit.
   - Signature URL saved.
   - PDF URL saved if generation succeeds.
   - Application status `pending`.
9. Login admin.
10. Open operational team / applications.
11. View pending application + contract.
12. Approve application.
   - Staff user created or linked.
   - Application status `approved`.
   - User appears in `pos_staff_users` / attendance user list.
13. Try login/check-in with new staff PIN after approval.

### Browser/device validation

- Desktop Chrome/Chromium
- Mobile viewport, especially signature touch events
- Slow network: submit button disabled while uploading
- Refresh mid-wizard: draft restore works

## Risks / Tradeoffs

1. **Public route abuse/spam**
   - Public `/register` could be spammed. Mitigate with Edge Function rate limit/captcha later, or admin approval only.
2. **Legal validity of AI contract**
   - AI-generated contract must be reviewed by admin/HR. Add disclaimer in UI.
3. **Sensitive data exposure**
   - Avoid public select on applications. RLS must be strict.
4. **PIN handling**
   - Do not store plain PIN in a public table. Prefer process PIN during admin approval via existing secure user create flow.
5. **HTML injection from AI output**
   - Sanitize AI HTML or render as plain text/structured clauses.
6. **PDF generation on mobile**
   - `html2canvas` can be heavy. Provide fallback: store contract text/HTML even if PDF generation fails, and allow admin to print later.
7. **Schema mismatch**
   - Existing staff user creation may use legacy mirror/public views. Must inspect exact implementation before coding.

## Open Questions

1. Apakah pendaftaran karyawan harus langsung membuat user aktif, atau wajib approval admin? Rekomendasi: wajib approval admin.
2. Apakah kontrak harus memiliki tanda tangan pihak perusahaan/admin juga, atau cukup tanda tangan karyawan dulu? Rekomendasi MVP: karyawan dulu, admin approval menjadi persetujuan perusahaan; fase berikutnya tambah signature admin.
3. Apakah butuh upload KTP/foto wajib? Rekomendasi MVP: opsional agar friction rendah.
4. Apakah format kontrak harus mengikuti template legal tertentu milik Djiwa Tentram? Jika ada, template standar perlu disesuaikan.
5. Apakah AI provider/action `yumi-ai` sudah punya kredensial aktif di Supabase production? Perlu verifikasi saat implementasi.

## Recommended MVP Scope

Untuk rilis pertama yang cepat tapi aman:

- `/register` public wizard.
- Template kontrak standar + AI generate editable.
- Signature canvas.
- Simpan pending application + signature URL + contract text/HTML.
- Admin table untuk approve/reject.
- Saat approve, admin membuat user aktif dari data pendaftaran.

Tunda ke fase berikutnya:

- Drag-and-drop canvas editor kompleks.
- Multi-party e-signature admin + karyawan.
- Versioning kontrak lengkap.
- CAPTCHA/rate limiting lanjutan.
- PDF generation server-side.
