# Plan: Perbaikan Pengaturan `/register` di `/admin/operational-team`

## Goal
Merapikan dan melengkapi tab **Register Karyawan** pada `/admin/operational-team` supaya admin bisa mengatur alur pendaftaran karyawan dari satu tempat, termasuk:

1. memastikan tab **Register Karyawan** benar-benar ada dan tombol/input-nya berfungsi,
2. pengaturan mode pendaftaran: public/internal/invite-only,
3. pengaturan buka/tutup halaman `/register`,
4. pengaturan field/form yang wajib/opsional,
5. pengaturan step-by-step pendaftaran dengan validasi per step,
6. integrasi dengan tab **Gaji & Role** supaya role dan default gaji otomatis masuk ke form register,
7. salary preview berdasarkan role,
8. template kontrak per role,
9. masa probation otomatis,
10. pipeline onboarding, checklist dokumen, dan upload dokumen pendukung,
11. approval dengan preview akun sebelum akun dibuat,
12. preview form sebagai kandidat dari sisi admin,
13. draft autosave dan reset draft,
14. UX admin mudah dipahami: ada ringkasan alur, preview, link ke `/register`, dan panduan setelah submit/approval.

## Current Context / Temuan Awal

Berdasarkan inspeksi read-only saat planning:

- File utama admin operational-team:
  - `apps/web/src/routes/admin/settings.lazy.tsx`
- File halaman register publik:
  - `apps/web/src/routes/register.lazy.tsx`
- Hook data terkait:
  - `apps/web/src/hooks/use-hybrid-pos-data.ts`
  - `useHybridSiteSettings()` sudah tersedia.
  - `useHybridStaffRoles()` sudah tersedia.
- Hook save settings:
  - `apps/web/src/hooks/use-hybrid-write-actions.ts`
  - `useHybridUpdateSiteSettings()` menyimpan settings ke `pos.site_settings.raw`.

### Status implementasi saat ini

Di `settings.lazy.tsx` sudah ada state minimal:

```ts
const [employeeOnboardingSettings, setEmployeeOnboardingSettings] = useState({
  registrationEnabled: true,
  defaultPassword: "djiwatentram123",
});
```

Dan payload save sudah memasukkan:

```ts
employeeOnboarding: employeeOnboardingSettings,
```

Tab sudah ditambahkan:

```ts
{ id: "register", label: "Register Karyawan", icon: UserPlus }
```

Namun implementasi saat ini masih sangat minimal dan berpotensi terasa “tombol belum berfungsi” karena:

- belum ada aksi cepat yang jelas seperti **Simpan Pengaturan Register**, **Preview /register**, **Buka halaman approval**, **Reset draft**, atau **Copy link**;
- semua settings register ikut tombol save global, tapi UI belum membuat relasi tombol-save ini jelas;
- belum ada setting untuk field mana yang wajib/ditampilkan;
- belum ada setting untuk mengatur step register;
- belum ada integrasi otomatis ketika pilih role di `/register` untuk mengisi default gaji/tunjangan/rate shift dari role;
- belum ada pengaturan default role, employment type, lokasi kerja default, kontrak default, dan pesan halaman ditutup;
- halaman `/register` saat pilih role hanya mengisi `roleId` dan `roleName`, belum mengisi `monthlySalary`, `dailyAllowance`, `shiftRate` dari role.

## Proposed Approach

Gunakan `site_settings.raw.employeeOnboarding` sebagai tempat konfigurasi agar tidak perlu migration database baru. Struktur settings dibuat backward-compatible: jika field baru belum ada, fallback ke default lama.

Tab **Register Karyawan** di `/admin/operational-team` dibuat menjadi dashboard konfigurasi ringkas dengan beberapa section:

1. **Status & Akses**
   - Mode pendaftaran: `public`, `internal`, atau `invite_only`.
   - Toggle `registrationEnabled`.
   - Pesan saat pendaftaran ditutup.
   - Link cepat ke `/register`.
   - Link cepat ke `/admin/onboarding`.
   - Tombol copy link.
   - Tombol **Preview sebagai kandidat** agar admin melihat form persis seperti calon karyawan.

2. **Default Akun & Pekerjaan**
   - `defaultPassword`.
   - `defaultRoleId`.
   - `defaultEmploymentType`.
   - `defaultLocation`.
   - Toggle `prefillSalaryFromRole`.
   - Toggle apakah pelamar boleh mengubah nilai gaji dari role atau hanya read-only.

3. **Pengaturan Form**
   - Daftar field personal dan employment dengan checkbox `visible` dan `required`.
   - Field awal yang disarankan:
     - fullName, phone, email, identityNumber, birthDate, address,
     - emergencyContactName, emergencyContactPhone,
     - role, startDate, employmentType, location,
     - monthlySalary, dailyAllowance, shiftRate,
     - username, slug, homePin.

4. **Step-by-step Register**
   - Toggle step aktif/nonaktif:
     - Data Diri
     - Data Kerja
     - Kontrak
     - Tanda Tangan
   - Judul/deskripsi tiap step bisa diedit.
   - Minimal step `Data Diri` dan `Data Kerja` tetap aktif.
   - Jika step `Kontrak` dimatikan, submit tetap bisa jalan tanpa generate kontrak PDF atau memakai kontrak kosong/default sesuai aturan.
   - Jika step `Tanda Tangan` dimatikan, validasi signature tidak diwajibkan.

5. **Template Kontrak & Instruksi**
   - Default contract title.
   - Default AI prompt / catatan kontrak.
   - Instruksi untuk pelamar.
   - Instruksi setelah submit.

5. **Integrasi Gaji & Role**
   - Di tab Register Karyawan tampilkan ringkasan role dari tab **Gaji & Role**:
     - nama role,
     - gaji/shift,
     - gaji tetap,
     - tunjangan/hari,
     - jumlah permission.
   - Tambahkan salary preview berdasarkan role agar admin bisa melihat kompensasi yang akan masuk ke form/kontrak.
   - Tambahkan tombol/CTA “Atur Gaji & Role” yang memindahkan `activeTab` ke `payroll`.
   - Di `/register`, saat user pilih role:
     - isi otomatis `roleName`,
     - jika `prefillSalaryFromRole === true`, isi:
       - `monthlySalary = role.monthlyFixedSalary`,
       - `dailyAllowance = role.dailyAllowance`,
       - `shiftRate = role.baseShiftRate`.
     - jika `salaryFieldsEditable === false`, field gaji dibuat read-only/disabled.

6. **Template Kontrak per Role**
   - Admin bisa mengatur template kontrak berbeda per role.
   - Template bisa memuat judul, klausul default, catatan AI, dan ketentuan probation.
   - Saat kandidat memilih role, `/register` memakai template kontrak role tersebut.

7. **Probation Otomatis**
   - Admin bisa mengatur durasi probation default, misalnya 1/3/6 bulan.
   - Tanggal akhir probation dihitung otomatis dari tanggal mulai kerja.
   - Data probation ikut tersimpan di payload onboarding dan muncul saat approval.

8. **Pipeline Onboarding**
   - Tambahkan status pipeline setelah submit:
     - `submitted`
     - `screening`
     - `interview`
     - `trial`
     - `approved`
     - `rejected`
     - `archived`
   - `/admin/onboarding` perlu mendukung pindah status tanpa langsung membuat akun.

9. **Checklist Dokumen & Upload Pendukung**
   - Admin bisa menentukan dokumen apa saja yang wajib/opsional:
     - KTP,
     - pas foto,
     - CV,
     - sertifikat,
     - dokumen lain.
   - `/register` menampilkan upload file sesuai konfigurasi admin.
   - `/admin/onboarding` menampilkan checklist verifikasi dokumen.

10. **Approval dengan Preview Akun**
   - Saat admin klik approve, tampilkan modal preview akun yang akan dibuat:
     - nama,
     - username,
     - slug,
     - PIN,
     - role,
     - password default,
     - gaji/tunjangan/rate shift,
     - tanggal mulai,
     - akhir probation.
   - Admin confirm baru akun dibuat.

11. **Auto-generate Username, Slug, dan PIN**
   - `/register` otomatis membuat username/slug/PIN dari nama/email.
   - Nilai ini bisa diedit oleh admin saat approval dan bisa diedit di profile masing-masing setelah akun dibuat.

12. **Draft Autosave & Reset Draft**
   - Draft tetap autosave di localStorage.
   - Tambahkan tombol reset draft/form.
   - Setelah submit sukses, draft dibersihkan.
   - Jika draft lama ditemukan, tampilkan info “Lanjutkan draft sebelumnya / mulai ulang”.

## Data Shape yang Disarankan

Simpan di `siteSettings.employeeOnboarding`:

```ts
type EmployeeOnboardingSettings = {
  registrationEnabled: boolean;
  registrationMode: "public" | "internal" | "invite_only";
  closedMessage: string;
  defaultPassword: string;
  defaultRoleId: string;
  defaultEmploymentType: "probation" | "full_time" | "part_time" | "freelance";
  defaultLocation: string;
  prefillSalaryFromRole: boolean;
  salaryFieldsEditable: boolean;
  showSalaryPreviewToApplicant: boolean;
  contractGenerationEnabled: boolean;
  signatureRequired: boolean;
  allowAiContractGeneration: boolean;
  probationEnabled: boolean;
  probationDurationMonths: number;
  formInstructions: string;
  afterSubmitMessage: string;
  contractDefaultTitle: string;
  contractDefaultPrompt: string;
  fields: Record<string, { visible: boolean; required: boolean }>;
  steps: Array<{
    id: "personal" | "employment" | "documents" | "contract" | "signature";
    enabled: boolean;
    title: string;
    description: string;
  }>;
  documentUploads: Array<{
    id: string;
    label: string;
    enabled: boolean;
    required: boolean;
    acceptedTypes: string[];
  }>;
  documentChecklist: Array<{
    id: string;
    label: string;
    required: boolean;
  }>;
  pipelineStatuses: Array<{
    id: "submitted" | "screening" | "interview" | "trial" | "approved" | "rejected" | "archived";
    label: string;
    order: number;
  }>;
  roleContractTemplates: Record<string, {
    title: string;
    prompt: string;
    clauses: Array<{ title: string; body: string }>;
    probationDurationMonths?: number;
  }>;
};
```

Default tetap kompatibel:

```ts
registrationEnabled: true
registrationMode: "public"
closedMessage: "Saat ini pendaftaran karyawan baru sedang tidak dibuka. Silakan hubungi admin."
defaultPassword: "djiwatentram123"
defaultEmploymentType: "probation"
defaultLocation: "Djiwa Tentram"
prefillSalaryFromRole: true
salaryFieldsEditable: false
showSalaryPreviewToApplicant: true
contractGenerationEnabled: true
signatureRequired: true
allowAiContractGeneration: true
probationEnabled: true
probationDurationMonths: 3
pipelineStatuses: submitted/screening/interview/trial/approved/rejected/archived
```

## Step-by-step Implementation Plan

### 1. Tambah normalizer settings register

File:

- `apps/web/src/routes/admin/settings.lazy.tsx`
- kemungkinan lebih rapi dibuat shared helper di:
  - `apps/web/src/lib/employee-onboarding-settings.ts`

Buat helper:

- `DEFAULT_EMPLOYEE_ONBOARDING_SETTINGS`
- `normalizeEmployeeOnboardingSettings(raw)`
- `EMPLOYEE_ONBOARDING_FIELD_DEFINITIONS`
- `EMPLOYEE_ONBOARDING_STEP_DEFINITIONS`

Alasan dibuat shared helper: `/admin/operational-team` dan `/register` perlu default yang sama.

### 2. Ganti state minimal menjadi full settings

Di `settings.lazy.tsx`, ubah:

```ts
const [employeeOnboardingSettings, setEmployeeOnboardingSettings] = useState({ ... })
```

menjadi:

```ts
const [employeeOnboardingSettings, setEmployeeOnboardingSettings] =
  useState<EmployeeOnboardingSettings>(DEFAULT_EMPLOYEE_ONBOARDING_SETTINGS);
```

Saat `siteSettings` berubah, gunakan:

```ts
setEmployeeOnboardingSettings(
  normalizeEmployeeOnboardingSettings(siteSettings.employeeOnboarding)
);
```

Payload save tetap:

```ts
employeeOnboarding: employeeOnboardingSettings,
```

### 3. Buat UI tab Register Karyawan lebih jelas dan tombol berfungsi

Di bagian render `activeTab === "register"`, ubah menjadi beberapa card:

#### Card A — Status Pendaftaran

Komponen:

- Select mode pendaftaran:
  - `Public` → `/register` bisa dibuka siapa pun yang punya link.
  - `Internal` → form hanya bisa dipakai admin/staff internal.
  - `Invite Only` → kandidat butuh kode/link undangan.
- Toggle button/checkbox untuk `registrationEnabled`.
- Textarea `closedMessage`.
- Badge status: “Aktif” / “Ditutup”.
- Tombol:
  - **Simpan Pengaturan Register** → panggil `handleSave()`.
  - **Preview /register** → `window.open('/register', '_blank')`.
  - **Preview sebagai kandidat** → buka `/register?preview=admin` atau route preview khusus supaya admin melihat form sesuai settings aktif.
  - **Review Pendaftar** → navigate atau `window.location.href = '/admin/onboarding'`.
  - **Copy Link Register** → `navigator.clipboard.writeText(`${window.location.origin}/register`)` lalu toast.

Catatan tombol “Simpan Pengaturan Register” penting supaya admin tidak bingung bahwa semua setting tersimpan lewat save global.

#### Card B — Default Akun & Pekerjaan

Field:

- default password
- default role select dari `roles`
- default employment type
- default location
- toggle `prefillSalaryFromRole`
- toggle `salaryFieldsEditable`

Tambahkan info kecil: “Nilai gaji mengikuti tab Gaji & Role. Ubah nominalnya dari tab Gaji & Role.”

Tombol:

- **Atur Gaji & Role** → `setActiveTab('payroll')`

#### Card C — Field Form Register

Tampilkan table/list mobile-first:

- Nama field
- Deskripsi singkat
- toggle tampilkan
- toggle wajib

Aturan UX:

- Jika `visible=false`, `required` otomatis false.
- Field inti seperti `fullName`, `phone`, `roleId` tidak boleh dimatikan total atau minimal diberi warning.

#### Card D — Step-by-step

List step:

- toggle aktif
- input judul
- textarea deskripsi
- urutan tetap dulu agar implementasi aman.

Step kontrak dan tanda tangan bisa dimatikan, tetapi harus sinkron dengan validasi `/register`.

#### Card E — Kontrak & Instruksi

Field:

- `contractDefaultTitle`
- `contractDefaultPrompt`
- `allowAiContractGeneration`
- `formInstructions`
- `afterSubmitMessage`

### 4. Integrasikan settings ke `/register`

File:

- `apps/web/src/routes/register.lazy.tsx`

Perubahan:

1. Import normalizer:

```ts
import {
  normalizeEmployeeOnboardingSettings,
  shouldShowOnboardingField,
  isOnboardingFieldRequired,
} from "@/lib/employee-onboarding-settings";
```

2. Normalisasi settings:

```ts
const onboardingSettings = normalizeEmployeeOnboardingSettings(siteSettings?.employeeOnboarding);
```

3. Gunakan:

```ts
const registrationEnabled = onboardingSettings.registrationEnabled;
```

4. Terapkan mode pendaftaran:

- `public`: form berjalan seperti biasa.
- `internal`: jika bukan admin/staff yang login, tampilkan halaman info atau redirect login.
- `invite_only`: minta `inviteCode` dari query/string input; validasi kode sebelum form bisa submit.

5. Saat closed, tampilkan `onboardingSettings.closedMessage`.

6. Initial/default draft:

- `employmentType` dari `onboardingSettings.defaultEmploymentType`
- `location` dari `onboardingSettings.defaultLocation`
- role default jika ada dan roles sudah load.
- username, slug, dan PIN auto-generate dari nama/email, tetapi tetap bisa diedit nanti oleh admin/profile.

Karena initial state tidak bisa langsung menunggu roles, buat `useEffect` setelah roles/settings load:

- jika draft role masih kosong dan `defaultRoleId` ada, set role.
- jika `prefillSalaryFromRole`, isi gaji/tunjangan/rate shift dari role.

7. Saat pilih role, ubah logic sekarang:

Saat ini hanya:

```ts
updateEmployment("roleId", e.target.value);
updateEmployment("roleName", role?.name ?? "");
```

Jadi:

```ts
setDraft(prev => ({
  ...prev,
  employment: {
    ...prev.employment,
    roleId: role?._id ?? "",
    roleName: role?.name ?? "",
    monthlySalary: onboardingSettings.prefillSalaryFromRole ? Number(role?.monthlyFixedSalary ?? 0) : prev.employment.monthlySalary,
    dailyAllowance: onboardingSettings.prefillSalaryFromRole ? Number(role?.dailyAllowance ?? 0) : prev.employment.dailyAllowance,
    shiftRate: onboardingSettings.prefillSalaryFromRole ? Number(role?.baseShiftRate ?? 0) : prev.employment.shiftRate,
  },
}));
```

8. Tampilkan salary preview berdasarkan role jika `showSalaryPreviewToApplicant=true`.

9. Disable/read-only field gaji jika `salaryFieldsEditable === false`.

10. Render field berdasarkan `fields[fieldName].visible`.

Contoh:

```tsx
{showField("monthlySalary") && (
  <Field label={`Gaji bulanan${requiredMark("monthlySalary")}`}>
    <Input disabled={!onboardingSettings.salaryFieldsEditable} ... />
  </Field>
)}
```

11. Tambahkan step dokumen jika `documentUploads` aktif.

12. Upload dokumen pendukung sesuai konfigurasi admin.

13. Gunakan template kontrak berdasarkan role jika tersedia di `roleContractTemplates[roleId]`.

14. Hitung masa probation otomatis:

- `probationEndDate = startDate + probationDurationMonths`
- jika role punya override probation, pakai override role.

15. Validasi sebelum pindah step atau submit menyesuaikan settings.

Minimal aman:

- sebelum submit, validasi existing tetap jalan tapi disesuaikan agar field hidden/non-required tidak menggagalkan.
- Jika belum ingin mengubah schema validator besar, buat pre-submit draft normalization:
  - hidden optional fields diberi fallback kosong/0,
  - jika signature tidak required, isi agreement/signature fallback atau update validator.

16. Draft autosave dan reset:

- tampilkan info jika draft lama ditemukan.
- tombol **Reset Form** menghapus localStorage draft dan mengembalikan form ke default.
- setelah submit sukses, draft dibersihkan.

17. Validasi per step:

- tombol **Lanjut** mengecek field required pada step aktif.
- error ditampilkan spesifik di step tersebut.
- user tidak perlu sampai submit akhir untuk tahu field wajib belum lengkap.

### 5. Update schema/validator onboarding

File:

- `apps/web/src/lib/employee-onboarding-schema.ts`

Saat ini `validateEmployeeOnboardingDraft()` kemungkinan punya requirement fixed. Perlu ditambah opsi:

```ts
validateEmployeeOnboardingDraft(draft, { settings: onboardingSettings })
```

Agar validasi hanya mewajibkan field yang `required=true`, dan menyesuaikan:

- kontrak required hanya jika `contractGenerationEnabled=true`,
- signature required hanya jika `signatureRequired=true`,
- agreement contract required hanya jika kontrak/signature aktif.

### 6. Update payload approval agar default password dipakai konsisten + preview akun

Cari alur approve di:

- `apps/web/src/routes/admin/onboarding...`
- `apps/web/src/hooks/use-employee-onboarding-actions.ts`
- `apps/web/src/lib/employee-onboarding-schema.ts`

Pastikan saat admin approve aplikasi:

- sebelum akun dibuat, tampilkan modal **Preview Akun**:
  - nama,
  - username,
  - slug,
  - PIN,
  - role,
  - password default,
  - gaji bulanan,
  - rate shift,
  - tunjangan harian,
  - tanggal mulai,
  - tanggal akhir probation,
  - dokumen/checklist yang sudah lengkap.
- password default menggunakan `siteSettings.employeeOnboarding.defaultPassword`, bukan hardcoded lama.
- username/slug/PIN hasil auto-generate bisa diedit admin sebelum confirm.
- jika approval membuat user role/gaji, nilai dari application payload sudah berasal dari role/default yang benar.
- setelah admin confirm, baru akun dibuat.

Jika approval saat ini sudah memakai default password dari settings, cukup verifikasi dan jangan ubah berlebihan.

### 7. Update `/admin/onboarding` untuk pipeline + checklist dokumen

Tambahkan kemampuan:

- pindah status pipeline: submitted, screening, interview, trial, approved, rejected, archived.
- checklist dokumen: KTP, pas foto, CV, sertifikat, dan custom checklist dari settings.
- tampilkan file upload pendukung dari kandidat.
- approval tidak otomatis terjadi saat status berubah; hanya tombol approve yang membuat akun.
- filter kandidat berdasarkan status pipeline.

### 8. UX polish: preview dan guidance admin

Tambahkan di tab Register Karyawan:

- Ringkasan “Alur pendaftaran”:
  1. Admin atur role & gaji di tab **Gaji & Role**.
  2. Admin pilih mode pendaftaran: public, internal, atau invite-only.
  3. Admin aktifkan `/register` dan pilih field/step.
  4. Admin preview form dengan tombol **Preview sebagai kandidat**.
  5. Calon karyawan isi `/register`, upload dokumen, dan tanda tangan jika diwajibkan.
  6. Admin review pipeline di `/admin/onboarding`.
  7. Admin cek checklist dokumen dan preview akun.
  8. Setelah confirm approval, akun karyawan dibuat dengan password default.

- Card “Checklist sebelum share link”:
  - Role sudah dibuat.
  - Nominal gaji/tunjangan sudah diisi.
  - Password default sudah diganti jika perlu.
  - Form sudah dipreview.

- Tampilkan role summary dari `roles` agar admin langsung tahu role mana yang sudah punya gaji lengkap.

### 8. Tests / validation

Jalankan setelah implementasi:

```bash
cd /opt/djiwatentramapp/apps/web
export PATH="$HOME/.bun/bin:$PATH"
BUN_CONFIG_REGISTRY=https://registry.npmjs.org bun run build
```

Manual QA browser:

1. Buka `/admin/operational-team`.
2. Pastikan tab **Register Karyawan** muncul.
3. Toggle “Aktifkan Pendaftaran” → klik **Simpan Pengaturan Register** → reload → nilai tetap.
4. Klik **Preview /register** → halaman terbuka.
5. Nonaktifkan pendaftaran → preview `/register` menampilkan pesan ditutup sesuai settings.
6. Aktifkan lagi.
7. Klik **Preview sebagai kandidat**, pastikan form yang muncul sama dengan konfigurasi admin.
8. Di **Gaji & Role**, isi role dengan:
   - gaji shift,
   - gaji tetap,
   - tunjangan/hari.
9. Kembali ke tab Register, pilih default role dan aktifkan prefill salary.
10. Buka `/register`, pilih role tersebut.
11. Verifikasi field:
    - `Gaji bulanan` otomatis terisi dari `monthlyFixedSalary`.
    - `Uang harian` otomatis terisi dari `dailyAllowance`.
    - `Rate shift` otomatis terisi dari `baseShiftRate`.
    - salary preview muncul jika diaktifkan.
    - jika `salaryFieldsEditable=false`, field disabled/read-only.
12. Ubah visible/required field di admin, simpan, reload `/register`, pastikan field hilang/muncul sesuai settings.
13. Matikan/aktifkan step dokumen, kontrak, signature; pastikan step dan validasi berubah sesuai setting.
14. Upload dokumen test jika aman, pastikan muncul di payload/admin onboarding.
15. Cek tombol reset draft: isi form, reload, draft tetap ada; klik reset, draft hilang.
16. Cek validasi per step: tombol lanjut harus menahan user jika field wajib step itu belum lengkap.
17. Submit aplikasi test jika aman, lalu cek `/admin/onboarding`.
18. Di `/admin/onboarding`, verifikasi pipeline status, checklist dokumen, dan modal preview akun.
19. Approve test hanya jika user mengizinkan karena akan membuat akun/data real.

Git/deploy setelah implementasi:

```bash
cd /opt/djiwatentramapp
git status --short
git add apps/web/src/routes/admin/settings.lazy.tsx apps/web/src/routes/register.lazy.tsx apps/web/src/lib/employee-onboarding-settings.ts apps/web/src/lib/employee-onboarding-schema.ts
git commit -m "feat: complete employee register settings workflow"
git push
```

Catatan: commit hanya file relevan. Jangan ikutkan generated `version.json`/`version.ts` kecuali build memang mengubah dan repo mengharuskan.

## Files Likely to Change

Wajib/kemungkinan besar:

- `apps/web/src/routes/admin/settings.lazy.tsx`
  - Tab Register Karyawan full UI.
  - Tombol save/preview/copy/review.
  - Integrasi ke tab payroll.

- `apps/web/src/routes/register.lazy.tsx`
  - Gunakan settings full.
  - Mode pendaftaran public/internal/invite-only.
  - Role salary prefill.
  - Salary preview berdasarkan role.
  - Field visibility/required.
  - Dynamic steps.
  - Upload dokumen pendukung.
  - Template kontrak per role.
  - Probation end date otomatis.
  - Auto-generate username/slug/PIN.
  - Draft autosave + reset draft.
  - Validasi per step.
  - Closed message dari admin.

- `apps/web/src/lib/employee-onboarding-schema.ts`
  - Validasi dinamis berdasarkan settings.
  - Pastikan payload tetap kompatibel.

Disarankan baru:

- `apps/web/src/lib/employee-onboarding-settings.ts`
  - Default settings.
  - Normalizer.
  - Field/step definitions.
  - Helper `showField`, `isRequired`.

Kemungkinan perlu dicek/diubah:

- `apps/web/src/hooks/use-employee-onboarding-actions.ts`
  - Pastikan approval/submit menggunakan settings/default password yang benar.

- route admin onboarding:
  - cari dengan `search_files` karena nama file perlu diverifikasi, kemungkinan `apps/web/src/routes/admin/onboarding.lazy.tsx` atau sejenis.
  - pipeline status.
  - checklist dokumen.
  - preview akun saat approval.
  - edit username/slug/PIN sebelum confirm approve.

## Risks / Tradeoffs

1. **File `settings.lazy.tsx` besar (~5k lines)**
   - Risiko patch manual salah JSX tinggi.
   - Mitigasi: gunakan helper component kecil atau ekstrak komponen tab register ke file baru jika memungkinkan.

2. **Dynamic step bisa memengaruhi validator**
   - Jika step kontrak/signature dimatikan tapi validator masih hardcoded, submit gagal.
   - Mitigasi: update validator dengan opsi settings atau batasi tahap awal: step bisa diatur label/deskripsi dulu, tapi kontrak/signature tetap required. Namun user meminta pengaturan form dan step-by-step, jadi lebih baik validator ikut dinamis.

3. **Default password di settings**
   - Secara keamanan kurang ideal jika password default terbaca admin UI.
   - Tapi ini sesuai kebutuhan sistem saat ini. Mitigasi: tampilkan warning agar admin mengganti password default berkala dan staff mengganti setelah login.

4. **Salary field visibility**
   - Jika field gaji disembunyikan, kontrak tetap butuh angka kompensasi.
   - Mitigasi: saat hidden, tetap pakai nilai role/default; hanya tidak ditampilkan ke pelamar jika admin memilih demikian.

5. **Approval membuat akun real**
   - Manual QA approve harus hati-hati dan minta izin jika memakai data produksi.

## Open Questions

1. Apakah calon karyawan boleh melihat nominal gaji saat mengisi `/register`, atau gaji sebaiknya selalu read-only/hidden dan hanya muncul di kontrak?
2. Apakah admin ingin step kontrak dan tanda tangan benar-benar bisa dimatikan, atau cukup bisa edit instruksi/label step?
3. Apakah default password tetap dipakai untuk semua staff baru, atau perlu generate password/PIN unik per pelamar saat approval?
4. Apakah field NIK wajib untuk semua role, atau role tertentu boleh tanpa NIK?

## Recommended Execution Order

1. Buat helper settings shared.
2. Perbaiki tab Register Karyawan UI + tombol save/preview/copy/review.
3. Integrasikan role/gaji ke `/register`.
4. Tambah field visibility/required.
5. Tambah dynamic step + validator.
6. Build.
7. Manual QA read-only/preview.
8. Commit & push jika implementasi diminta setelah plan ini disetujui.
