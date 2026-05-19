# Contract Template Page Redesign

## Goal

Merombak halaman `/admin/operational-team/register/contract` dari satu halaman monolitik dengan role selector dropdown menjadi arsitektur multi-halaman di mana setiap template kontrak memiliki card di halaman utama, edit page sendiri (`/admin/operational-team/register/contract/edit/<templateId>`), dan preview page sendiri (`/admin/operational-team/register/contract/<templateId>/preview`).

## Current Context

**Saat ini:** Satu halaman (`contract.lazy.tsx`, 868 baris) yang berisi:
- Role selector (Select dropdown: "Semua Jabatan (default)" + per role)
- Tipe kerja selector
- Informasi Perusahaan (collapse card — nama, penandatangan, alamat, NIB, TTD)
- Judul + pasal editor (drag & drop, add/remove)
- AI Assistant (generate kontrak)
- Klausul Siap Pakai (clause library)
- Preview panel (ContractPreview component) + test data
- Tombol: Simpan, Hapus, Reset, PDF Download
- Status badge: dirty/saved indicator

**Semua data disimpan di:** `site_settings.employeeOnboarding.contractTemplatesByRoleId` sebagai `Record<string, string>` (plain text serialized dari structured JSON).

**Routing saat ini:**
- `/admin/operational-team/register/contract` → satu route flat

## Proposed Approach: Multi-halaman dengan Route Tree Baru

### Route Tree

```
/admin/operational-team/register/contract
  ├── → Landing page: daftar semua template dalam card grid
  │     (templates per role + custom templates + tombol "Buat Baru")
  ├── /edit/__default__
  │   └── → Edit page untuk template default (Semua Jabatan)
  ├── /edit/<templateId>
  │   └── → Edit page untuk template role atau custom
  ├── /edit/new
  │   └── → Create new template (pilih nama, mulai dari kosong atau duplikasi)
  ├── /__default__/preview
  │   └── → Preview page untuk template default
  └── /<templateId>/preview
      └── → Preview page untuk template role atau custom
```

### Template ID Strategy

Template disimpan di `contractTemplatesByRoleId` dengan key strategy:

| Key | Sumber | Contoh |
|-----|--------|--------|
| `__default__` | Built-in | Template default untuk semua role |
| `<roleId>` | Role dari DB (`roles` hook) | Template per role (misal `role_barista`) |
| `custom_<slug>` | **Custom template** (baru!) | Template buatan admin, tidak terikat role |

Custom templates ditandai dengan prefix `custom_` agar bisa dibedakan dari role-based templates di landing page. Saat save, custom template disimpan dengan key `custom_NamaTemplate` (slug dari nama).

### Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `contract/route.tsx` | **MODIFY** | Tambah child routes: `contract/edit/$templateId`, `contract/$templateId/preview` |
| `contract/contract-landing.lazy.tsx` | **CREATE** | Card grid landing page — daftar semua template |
| `contract/contract-edit.$templateId.lazy.tsx` | **CREATE** | Edit page — extract dari `contract.lazy.tsx` |
| `contract/contract-preview.$templateId.lazy.tsx` | **CREATE** | Preview page — tampilan kandidat dengan data real |
| `contract/contract.lazy.tsx` | **DELETE** | Tidak dipakai lagi, diganti 3 file di atas |
| `employee-onboarding-settings.ts` | Maybe | Tambah fungsi `getTemplateById` utility |
| `admin/route.tsx` | **MODIFY** | Path labels (sidebar tetap sama) |

### Component Extraction

Karena semua 868 baris ada di satu file, kita extract komponen reusable:

**Shared components (taruh di file sendiri atau inline di edit page):**
- `buildPlaceholderContract` — tetap di edit page
- `parseTemplateText` / `templateToString` — tetap di edit page
- `ContractDraft` state management — di edit page
- Company info section (signatory name, address, NIB, signature upload, person title, location) — **component baru**: `CompanyInfoCard`
- Clause editor (drag & drop, add/remove, AI assistant, clause library) — tetap di edit page
- `ContractPreview` — sudah ada sebagai component terpisah
- Test data preview section — tetap di edit page

### Landing Page Design

Layout: grid 2-4 card (responsive)

#### Template Categories

Landing page menampilkan 3 kategori template:

1. **Default Template** — card terpisah, selalu ada (tidak bisa dihapus)
2. **Role-based Templates** — satu card per role (dari `roles` hook), menampilkan status apakah sudah ada template atau belum
3. **Custom Templates** — satu card per custom template (key dengan prefix `custom_`)

#### Tombol "Buat Template Baru"

Card khusus di grid dengan ikon `+` dan teks "Buat Template Baru". Klik → navigate ke `/contract/edit/new`.

#### Setiap Card Berisi:

**Default / Role-based template card:**
- Ikon role atau default badge
- Nama template (role name atau "Semua Jabatan (Default)")
- Status: ✅ Tersimpan / ❌ Belum dibuat
- Ringkasan: jumlah pasal
- Tombol: **Edit** → `/contract/edit/<templateId>`, **Preview** → `/contract/<templateId>/preview`
- Tombol Hapus (hanya untuk template yang sudah ada, tidak untuk `__default__`)

**Custom template card:**
- Ikon `📄`
- Nama template (dari key `custom_nama-template`)
- Ringkasan: jumlah pasal
- Tombol: **Edit**, **Preview**, **Hapus**

#### States

| State | Tampilan |
|-------|----------|
| **Loading** | Skeleton grid 4 card dengan shimmer |
| **Empty (no roles, no templates)** | "Belum ada template kontrak. Buat template baru untuk setiap role." + tombol "Buat Template Baru" |
| **Error** | Toast error + retry button |
| **Empty untuk specific role** | Card dengan border dashed + "Template belum dibuat. Klik Edit untuk mulai." |

### Edit Page Design

Layout: single-column, scroll, full-width

#### Create New Template Flow (`/edit/new`)

Ketika user navigasi ke `/edit/new`:

1. **Dialog awal**: Muncul modal/input untuk:
   - **Nama template** (required) — text input
   - **Duplikasi dari** (opsional) — dropdown pilih template yang sudah ada untuk dijadikan dasar
   - Tombol: **Buat** / **Batal**

2. Setelah klik Buat:
   - Generate `templateId = "custom_" + createEmployeeSlug(namaTemplate)`
   - Jika duplikasi: copy clauses + title dari template sumber
   - Jika tidak: mulai dari `buildPlaceholderContract(namaTemplate)`
   - Redirect ke `/contract/edit/<newTemplateId>`

3. User langsung masuk ke edit page dengan template baru (belum disimpan)

#### Edit Page Sections (dari atas ke bawah):
1. **Header**: Back button → landing, role name, dirty indicator, tombol Save/Hapus/Reset/PDF
2. **Informasi Perusahaan** — card collapsible (component terpisah)
3. **Test Data Preview** — collapsible input fields + live preview
4. **Tipe Kerja** — selector
5. **Pasal Editor** — drag & drop, add/remove, judul + body
6. **AI Assistant** — textarea prompt + generate button
7. **Klausul Siap Pakai** — collapsible library
8. **Preview Panel** — card di bawah semua section, bisa di scroll

Semua fungsi (save, delete, reset, PDF, AI generate, drag & drop, clause library, signature upload) sama persis dengan yang sekarang — **tidak ada perubahan behavior**, hanya pemisahan layout.

### Preview Page Design

Layout: single column, centered, tampilan kandidat

**Sections:**
1. **Header**: Back button → landing, role name, PDF download
2. **Company Info**: nama perusahaan, alamat, NIB
3. **ContractPreview** — full lebar, mock data dari template
4. **Test Data** — input Nama, NIK, Alamat untuk preview realtime
5. **Status**: "Template ini akan digunakan untuk kandidat dengan role X"

### Data Flow

```
siteSettings → employeeOnboarding → contractTemplatesByRoleId
    ├── key: "__default__" (Semua Jabatan)
    ├── key: "<roleId>" (per role)
    ├── key: "custom_<slug>" (custom template — baru!)
    └── value: serialized JSON string (version, title, clauses, metadata)

Landing Page:
  - Baca semua key dari contractTemplatesByRoleId
  - Gabung dengan roles list untuk template yang belum dibuat
  - Baca custom templates (key dengan prefix "custom_")
  - Tampilkan sebagai card grid

Edit Page:
  - templateId = "__default__" | "<roleId>" | "custom_<slug>"
  - Baca template by templateId
  - Parse ke ContractDraft (title + clauses)
  - Save → update contractTemplatesByRoleId[templateId]
  - Delete → remove key (tidak untuk __default__)

Preview Page:
  - Baca template by templateId
  - Render via ContractPreview component
  - Test data override → preview realtime

Create New:
  - Generate templateId = "custom_" + slug(nama)
  - Simpan pertama kali saat user klik Save di edit page
  - Belum ada entry di DB sampai disimpan
```

### Full CRUD Operations

| Operation | Landing | Edit | Preview |
|-----------|---------|------|---------|
| **Create** | Tombol "Buat Template Baru" → `/edit/new` → dialog nama + duplikasi → redirect ke `/edit/<newId>` | Save pertama kali = create | — |
| **Read** | Card grid dari `contractTemplatesByRoleId` + `roles` | Load template by `$templateId`, parse ke `ContractDraft` | Load template by `$templateId`, render via `ContractPreview` |
| **Update** | — | Save → `updateSiteSettings({ contractTemplatesByRoleId: { ...prev, [templateId]: newValue } })` | — |
| **Delete** | Tombol Hapus (confirm dialog) → redirect ke landing | Tombol Hapus (confirm dialog) → redirect ke landing | — |

#### Delete Rules

| Template Type | Bisa Dihapus? | Notes |
|---------------|---------------|-------|
| `__default__` | ❌ Tidak | Template default tidak bisa dihapus, hanya bisa diedit/reset |
| `<roleId>` (role-based) | ✅ Ya | Hapus key → role tetap ada di landing dengan status "Belum dibuat" |
| `custom_<slug>` (custom) | ✅ Ya | Key dihapus total → tidak muncul lagi di landing |

### No-Hardcode Audit

| Data | Source | Hardcode Check |
|------|--------|----------------|
| Nama role | `roles` hook | ✅ From DB |
| Template konten | `contractTemplatesByRoleId` | ✅ From DB |
| Signatory name | `siteSettings.employeeOnboarding` | ✅ From DB |
| Company info | `siteSettings.employeeOnboarding` | ✅ From DB |
| Clause library | Static array di `contract.lazy.tsx` | ⚠️ OK — ini template built-in, tapi bisa jadi settings di masa depan |
| Bonus config | `getRoleSalaryDefaults(role)` | ✅ From DB (role.bonusTargetConfig) |
| AI prompt | User input | ✅ Tidak di-hardcode |

### UI/UX Specification

**Landing page:**
- Loading: skeleton grid 4 card
- Empty: "Belum ada template kontrak. Buat template baru untuk setiap role."
- Error: toast standar
- States per card: creado/not-yet-created

**Edit page:**
- Dirty state: badge "Ada perubahan" + beforeunload
- Saving: loading spinner di tombol Save
- Deleted: redirect ke landing
- Error: toast

**Preview page:**
- Template tidak ditemukan: "Template tidak ditemukan"
- Test data kosong: preview default
- PDF loading: spinner

### Integration Points — Cross-Page Impact Analysis

#### 🔗 Critical Integration (Wajib Diuji)

| Halaman | File | Bagaimana Menggunakan Template | Risiko Perubahan |
|---------|------|-------------------------------|------------------|
| **`/register` (kandidat)** | `register.lazy.tsx:156-169` | `onboardingSettings.contractTemplatesByRoleId[draft.employment.roleId]` → ditampilkan sebagai contract preview saat kandidat pilih role. Fallback: `buildEmployeeContractTemplate()` | **TIDAK BERUBAH**. Key-nya masih `roleId`. Custom templates (`custom_xxx`) tidak akan muncul di sini (hanya untuk roleId). ✅ Aman |
| **`/register/selesai/:id`** | `register.selesai.$registrationNumber.lazy.tsx:214-216` | `contractTemplatesByRoleId[app.employment.roleId]` → fallback `__default__` → build contract + replace variables untuk signing | **TIDAK BERUBAH**. Sama, key-nya roleId. Custom templates tidak relevan. ✅ Aman |
| **`/admin/operational-team/register` (landing)** | `register.lazy.tsx:42` | `Object.keys(contractTemplatesByRoleId).length` → hitung jumlah template | **PERLU UPDATE**: harus hitung custom templates juga. Tapi ini hanya statistik, bukan logic. ⚠️ Minor |
| **`/admin/settings`** | `settings.lazy.tsx:3129` | Hitung jumlah template (sama) | **PERLU UPDATE**: sama, hanya statistik ⚠️ Minor |

#### 🔗 Tidak Terintegrasi Langsung

| Halaman | File | Relasi | Risiko |
|---------|------|--------|--------|
| **`/admin/operational-team/payroll`** | `payroll.lazy.tsx` | Baca `siteSettings` untuk config, baca `roles` untuk salary defaults. **Tidak** baca `contractTemplatesByRoleId` | ✅ Tidak terdampak |
| **`/admin/operational-team/attendance/pengaturan`** | `attendance/pengaturan.lazy.tsx` | Baca `siteSettings.shiftSettings` untuk shift config, `attendanceLat/Lng`. **Tidak** baca `employeeOnboarding` | ✅ Tidak terdampak |
| **`/admin/operational-team/attendance/jadwal`** | `attendance/jadwal.lazy.tsx` | Baca roles + siteSettings untuk jadwal shift. **Tidak** baca contract templates | ✅ Tidak terdampak |
| **`/admin/operational-team/register/onboarding`** | `onboarding.lazy.tsx` | Shared component dari `/admin/onboarding.lazy.tsx`. Baca aplikasi kandidat, **tidak** langsung baca templates | ✅ Tidak terdampak |
| **`/admin/operational-team/register/riwayat`** | `riwayat.lazy.tsx` | Riwayat aplikasi yang sudah diproses. Baca dari DB, **tidak** baca templates | ✅ Tidak terdampak |

#### 📋 User Flow Integration Diagram

```
┌──────────────────────────────────────────────────────┐
│                  ADMIN                                │
│  /register → /contract → Landing (card grid)         │
│                            ├── /edit/__default__      │
│                            │   └── Save → DB          │
│                            ├── /edit/<roleId>         │
│                            │   └── Save → DB          │
│                            ├── /edit/new              │
│                            │   └── Buat custom → DB   │
│                            └── /<id>/preview          │
│                                └── Lihat hasil        │
└──────────────────────┬───────────────────────────────┘
                       │ contractTemplatesByRoleId
                       ▼
┌──────────────────────────────────────────────────────┐
│                 KANDIDAT                              │
│  /register → Step 1-2 (pilih role)                   │
│              ↓                                        │
│         contractTemplatesByRoleId[roleId] → Preview  │
│              ↓                                        │
│  Submit → /register/selesai/:id                      │
│              ↓ (polling setiap 30s)                   │
│         Admin approve                                 │
│              ↓                                        │
│         contractTemplatesByRoleId[roleId]             │
│         → replaceContractVariables()                  │
│         → Tampilkan kontrak + Tanda tangan            │
└──────────────────────────────────────────────────────┘
```

#### 🔐 Key Consistency Check

Template ID di admin edit page harus **konsisten** dengan key lookup di candidate pages:

| Template ID di URL | Key di DB | Muncul di `/register`? | Muncul di `/selesai`? |
|---------------------|-----------|------------------------|----------------------|
| `__default__` | `__default__` | ❌ Tidak (fallback di selesai saja) | ✅ Ya (fallback jika roleId tidak punya template) |
| `<roleId>` (misal `abc123`) | `abc123` | ✅ Ya (match dengan `draft.employment.roleId`) | ✅ Ya (match dengan `app.employment.roleId`) |
| `custom_<slug>` | `custom_<slug>` | ❌ Tidak (tidak ada roleId yang match) | ❌ Tidak |

**⚠️ Custom templates (prefixed `custom_`) hanya muncul di halaman admin**, tidak di candidate flow. Ini sudah sesuai — custom templates adalah template yang tidak terikat role tertentu, mungkin untuk kasus khusus atau template cadangan.

#### Integration Checklist (Wajib Before/After)

- [x] `/register` — contract preview saat pilih role → template by roleId
- [x] `/register/selesai/:id` — contract signing → template by roleId, fallback `__default__`
- [x] Landing page `/register` (admin) → template count stat
- [x] `/admin/settings` → template count stat (hanya angka, tidak perlu detail)
- [x] Payroll → tidak baca templates → aman
- [x] Attendance pengaturan → tidak baca templates → aman
- [x] Attendance jadwal → tidak baca templates → aman
- [x] Onboarding → tidak baca templates langsung → aman
- [x] Riwayat → tidak baca templates → aman

#### ⚡ Performance Impact

- Landing page: masih 1 query `useHybridSiteSettings()` + `useHybridStaffRoles()` — sudah reusable, tidak ada perubahan
- Edit page: sama seperti sekarang, load template by key
- Preview page: baca template by key + render ContractPreview
- **Tidak ada tambahan query DB** — semua data sudah ada di siteSettings

### Step-by-Step Implementation

#### Phase 0: Preparation

0. **Hapus file lama**: `contract.lazy.tsx` + `contract.tsx` (delete dulu sebelum buat folder)
1. **Update parent route detection**: `register.lazy.tsx` line 13 — ganti `endsWith()` jadi `startsWith()`

#### Phase 1: Route Setup

1. **Buat folder structure**: `contract/` dengan file-file baru
2. **Create `contract/route.tsx`**: parent bare with `<Outlet />`
3. **Build & verify**: regenerasi routeTree.gen.ts

#### Phase 2: Landing Page

4. **Create `contract/index.lazy.tsx`**: landing page lengkap:
   - Fetch `contractTemplatesByRoleId` + `roles`
   - Tampilkan default card, role-based cards, custom template cards
   - Tombol "Buat Template Baru" → `/contract/edit/new`
   - Tombol Edit → `/contract/edit/<id>`
   - Tombol Preview → `/contract/<id>/preview`
   - Tombol Delete (confirm dialog → hapus key)
   - States: loading/skeleton, empty, error

#### Phase 3: Create New Template

5. **Create `/edit/new` handler**: 
   - Dialog/input untuk nama template + duplikasi dari template lain
   - Generate `templateId = "custom_" + slug(nama)`
   - Redirect ke `/contract/edit/<newTemplateId>`

#### Phase 4: Edit Page

6. **Create `contract/edit.$templateId.lazy.tsx`**: full edit page:
   - Load template by `$templateId`
   - Parse ke `ContractDraft`
   - Company info, test preview, tipe kerja, pasal editor, AI assistant, clause library
   - Save → update `contractTemplatesByRoleId[$templateId]`
   - Delete → remove key + redirect ke landing
   - Reset, PDF download, signature upload
   - States: loading, dirty, saving, not_found

#### Phase 5: Preview Page

7. **Create `contract/$templateId/preview.tsx`**: route definition
8. **Create `contract/$templateId/preview.lazy.tsx`**: preview page:
   - Load template by `$templateId`
   - Render via `ContractPreview`
   - Test data inputs untuk preview realtime
   - PDF download
   - States: loading, not_found

#### Phase 6: Cleanup

9. **Verify no stale imports**: Hapus old `contract.lazy.tsx` + `contract.tsx` dari git index
10. **Build**: `npx vite build` — verify routeTree regenerasi
11. **Sidebar test**: navigasi ke `/admin/operational-team/register/contract` → landing page
12. **CRUD flow test**: create → edit → save → preview → delete → landing empty state

### Files to Delete

- `apps/web/src/routes/admin/operational-team/register/contract.lazy.tsx` (868 baris)
- `apps/web/src/routes/admin/operational-team/register/contract.tsx` (3 baris)

### Files to Create

- `apps/web/src/routes/admin/operational-team/register/contract/route.tsx` — parent (outlet)
- `apps/web/src/routes/admin/operational-team/register/contract/index.lazy.tsx` — landing card grid
- `apps/web/src/routes/admin/operational-team/register/contract/edit.$templateId.lazy.tsx` — edit
- `apps/web/src/routes/admin/operational-team/register/contract/$templateId/preview.tsx` — route def
- `apps/web/src/routes/admin/operational-team/register/contract/$templateId/preview.lazy.tsx` — preview

### Tests / Validation

- Build: `npx vite build` / `npx tsc --noEmit` ✅
- Verify landing page routes: `/admin/operational-team/register/contract` → lihat card grid
- Verify edit page: klik salah satu card → `/contract/edit/__default__` → editor lengkap
- Verify preview page: klik preview → `/contract/__default__/preview`
- Verify all functions: save, delete, AI generate, drag & drop, clause library, PDF download, signature upload, test data preview
- Verify sidebar: tetap ada "Kontrak" → landing

### Risks & Tradeoffs

| Risk | Mitigation |
|------|------------|
| Tab corruption saat patch multi-line | Gunakan Python script untuk semua operasi multi-line |
| Route tree auto-generated conflict | Build setelah buat file baru, routeTree.gen.ts akan regenerate |
| Old route files masih di-import | Hapus `contract.lazy.tsx` dan `contract.tsx` sebelum build |
| Sidebar link `to="/admin/operational-team/register/contract"` | Tetap ke landing page, tidak berubah |
| `register.lazy.tsx` (parent) ngecek nested route | Di line 13, `location.pathname.endsWith("/register/contract")` — ini akan tetap match untuk landing. **Perlu verifikasi:** pathname `/register/contract` (tanpa child) akan match. Pathname `/register/contract/edit/xxx` juga endsWith `/contract`? Tidak, endsWith `/edit/xxx`. Jadi perlu update detection: `location.pathname.startsWith("/admin/operational-team/register/contract")` |

### Open Questions

1. **Parent route file conflict**: Filenamed `contract.tsx` (flat) vs `contract/route.tsx` (folder). Keduanya bisa coexist? Test: Di TanStack Router, path `/admin/operational-team/register/contract` dengan file `contract.tsx` dan folder `contract/` akan konflik. **Solution**: Hapus `contract.tsx` dan `contract.lazy.tsx` dulu (atau rename folder jadi `_contract/`).

   **Solusi pasti**: Karena sudah ada file `contract.lazy.tsx` + `contract.tsx`, kita HARUS delete dulu sebelum create folder. Order: (1) delete file flat, (2) create folder + files, (3) build.

2. **Apakah ada file lain yang import dari `contract.lazy.tsx`?** Check dengan grep.

3. **Bagaimana handle `DEFAULT_TEMPLATE_KEY = "__default__"` di URL?** Di URL path, `__default__` bisa jadi parameter. Di URL `/contract/edit/__default__`, `$templateId = "__default__"`.

4. **Apakah `register.lazy.tsx` parent route perlu update?** Ya — line 13 cek `endsWith("/contract")` perlu diubah jadi `startsWith("/admin/operational-team/register/contract")` agar child route juga terdeteksi sebagai nested route dan me-render `<Outlet />`.
