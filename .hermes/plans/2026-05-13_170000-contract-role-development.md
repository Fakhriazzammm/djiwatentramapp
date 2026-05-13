# Plan: Pengembangan Kontrak Default & Role System

**Date:** 2026-05-13  
**Project:** `/opt/djiwatentramapp/apps/web`  
**Route:** `/admin/operational-team/register/contract`

---

## 1. Current State

### What Already Exists
- ✅ **13-pasal default template** (`buildEmployeeContractTemplate` in `employee-onboarding-schema.ts`)
- ✅ **Per-role template override** via `contractTemplatesByRoleId` in settings
- ✅ **Bonus target integration** (Pasal 5A — inserted dynamically based on role config)
- ✅ **Custom allowances** (Pasal 5B — inserted dynamically based on role config)
- ✅ **AI-assisted contract generation** (OpenAI/LLM prompt in contract editor)
- ✅ **Structured template format** (`ContractTemplateValue` with version, clauses, metadata)
- ✅ **Plain text backward compat** (legacy format auto-parsed on save)
- ✅ **Contract preview** (Times New Roman, justify, center title — just fixed)
- ✅ **Contract approval flow** (admin approve + create user)
- ✅ **Contract history** (`contracts` table, `contract_approvals` table)
- ✅ **PDF download** (via jsPDF)
- ✅ **Digital signature** (canvas-based signature pad)
- ✅ **HTML generation** (proper `<section><h3><p>` structure)
- ✅ **3-layer rendering fix** (br-based fallback, clauses fallback, pasal-to-h3)

### Data Flow
```
Role (payroll_role_rules)
  ├─ monthlyFixedSalary, dailyAllowance, shiftRate  → Pasal 5 (Kompensasi)
  ├─ bonusTargetConfig  → Pasal 5A (Bonus)
  └─ customAllowances   → Pasal 5B (Tunjangan Tambahan)
       ↓
buildEmployeeContractTemplate() → 13-pasal default template
       ↓
replaceContractVariables() → variable substitution (nama, NIK, tanggal, gaji, etc.)
       ↓
HTML generation → section/h3/p structure
       ↓
ContractPreview → ContractPreview component (styled)
       ↓
Save to DB → employee_onboarding_applications.contract
```

---

## 2. Recommended Improvements

### Phase 1: Contract Content & Legal (High Priority)

#### 1.1 Role-specific clause injection
**Problem:** Semua role pake 13 pasal yang sama. Barista, Chef, Admin punya kebutuhan hukum berbeda.

**Solution:** Add `roleContractClauses` field to payroll role — extra clauses injected per role:
- **Barista**: Pasal tentang shift kerja, kebersihan peralatan, standar minuman
- **Chef**: Pasal tentang higiene dapur, standar resep, food safety
- **Driver**: Pasal tentang kendaraan, SIM, tanggung jawab barang
- **Admin**: Pasal tentang kerahasiaan data, IT usage policy

```ts
type RoleContractExtra = {
  pasalTitle: string;
  body: string;
  injectAfter: number; // pasal number to insert after
}[];
```

#### 1.2 BPJS & Insurance integration
**Problem:** BPJS Kesehatan/Ketenagakerjaan tidak disebut dalam kontrak.

**Solution:**
- Add BPJS fields to role config: `bpjsKesehatan: boolean`, `bpjsKetenagakerjaan: boolean`
- Auto-generate Pasal BPJS (after Pasal 5) explaining coverage
- Show BPJS contribution amounts based on salary tier
- Link to actual BPJS rate tables

#### 1.3 Uniform policy clause
**Problem:** Beberapa role (Barista, Chef) perlu uniform/seragam tapi kontrak tidak mencantumkannya.

**Solution:**
- Add `requiresUniform: boolean` to role config
- If true, inject "Pasal X — Ketentuan Seragam" after Pasal 8 or 10
- Include details: jumlah, perawatan, penggantian

#### 1.4 Equipment/Mobile phone clause
**Problem:** Beberapa role pake HP/motor/tablet kerja.

**Solution:**
- Add `assignedEquipment: string[]` to role config
- Generate "Pasal X — Penggunaan Aset Perusahaan"
- Include tanggung jawab kerusakan, pengembalian

### Phase 2: Contract Lifecycle (Medium Priority)

#### 2.1 Contract Expiry & Auto-Renewal Dashboard
**Problem:** Admin tidak tahu kontrak mana yang akan habis.

**Solution:**
- New route: `/admin/register/contracts/expiring`
- Table: 30/14/7 days before expiry, status, renewal action
- Dashboard badge: "N kontrak akan habis bulan ini"
- Auto-send Telegram notification to admin for contracts expiring in 14 days

#### 2.2 Addendum/Amendment Workflow
**Problem:** Perubahan kontrak (kenaikan gaji, mutasi) tidak tercatat.

**Solution:**
- New route: `/admin/register/contracts/{id}/addendum`
- Addendum form: change description, effective date, modified clauses
- PDF generation: original contract + addendum in one document
- History view: timeline of all addendums

#### 2.3 Contract Renewal Flow
**Problem:** Kontrak habis, perlu bikin baru dari awal.

**Solution:**
- "Perpanjang Kontrak" button on contract detail page
- Pre-fills previous contract data (gaji, role)
- Opens contract editor with previous terms
- Creates new application with "renewal" flag
- Automatic slug generation: `{name}-{YYMM}-2`

### Phase 3: Admin Experience (Medium Priority)

#### 3.1 Contract Template Library
**Problem:** Template default 13 pasal, tapi perusahaan mungkin butuh variasi (PKWT vs PKWTT).

**Solution:**
- Add template presets: "PKWT (Kontrak)", "PKWTT (Tetap)", "Freelance", "Probation"
- Each preset has different clause selection
- AI generation pre-seeded with preset structure
- Template categories with descriptions

#### 3.2 Contract Batch Creation
**Problem:** Rekrutasi massal (buka cabang baru) — perlu bikin 10+ kontrak sekaligus.

**Solution:**
- New route: `/admin/register/contracts/batch`
- Upload CSV/XLSX with employee data
- Select template → generate all contracts
- Bulk approve/reject
- Download all as ZIP of PDFs

#### 3.3 Contract Comparison View
**Problem:** Admin perlu compare template antar-role.

**Solution:**
- Side-by-side diff view in contract editor
- "Compare with default" button
- Highlight clause differences per role
- Useful for ensuring legal consistency

### Phase 4: Integration & Automation (Lower Priority)

#### 4.1 Telegram Bot Integration
**Problem:** Karyawan tidak dapat notifikasi kontrak siap tandatangan.

**Solution:**
- Send Telegram notification when contract is ready
- Employee can view contract via inline button
- Simple "Setuju" button in chat
- Notify admin when employee signs

#### 4.2 Pull Request Workflow
**Problem:** Perubahan template kontrak tidak ada review/approval.

**Solution:**
- Contract template change log
- "Request Review" button sends change to supervisor Telegram
- Supervisor approves/rejects changes
- Rollback to previous version

#### 4.3 PDF with Real Times New Roman
**Problem:** PDF download masih pake Helvetica (jsPDF default).

**Solution:**
- Embed Times New Roman font in jsPDF (TTF → JS font conversion)
- Or generate server-side PDF with actual TTF font
- Consistent look between preview and PDF
- All styles (justify, center, bold) preserved in PDF

#### 4.4 Contract Analytics Dashboard
**Solution:**
- Contract status distribution (pending/approved/rejected/expired)
- Average approval time
- Contract type breakdown
- Expiry forecast chart
- Role-based contract count

---

## 3. Implementation Order

```
HIGH PRIORITY ───────────────────────────────►
  1.1 Role-specific clauses
  1.2 BPJS integration
  1.3 Uniform policy
  1.4 Equipment clause

MEDIUM PRIORITY ──────────────────────────────►
  2.1 Expiry dashboard
  2.2 Addendum flow
  2.3 Renewal flow
  3.1 Template library
  3.2 Batch creation
  3.3 Comparison view

LOWER PRIORITY ──────────────────────────────►
  4.1 Telegram integration
  4.2 PR workflow
  4.3 PDF font fix
  4.4 Analytics dashboard
```

---

## 4. Files That Would Change

| File | Phase | Change |
|:--|:--|:--|
| `src/lib/employee-onboarding-schema.ts` | All | New clauses, BPJS, uniform, equipment builders |
| `src/lib/employee-onboarding-settings.ts` | 1 | `getRoleSalaryDefaults` → `getRoleContractConfig` |
| `src/hooks/use-hybrid-pos-data.ts` | 1 | Role type expanded with contract fields |
| `src/routes/.../contract.lazy.tsx` | 1,3 | Clause editor enhancements, template presets |
| `src/routes/.../register.lazy.tsx` | 1 | New variable context for extra clauses |
| `src/components/employee-onboarding/contract-preview.tsx` | All | Conditional rendering improvements |
| `src/lib/contract-pdf.ts` | 4.3 | TTF font embedding |
| `src/routes/.../contracts/expiring.lazy.tsx` | 2.1 | NEW — expiry dashboard |
| `src/routes/.../contracts/addendum.lazy.tsx` | 2.2 | NEW — addendum flow |
| `src/routes/.../contracts/batch.lazy.tsx` | 3.2 | NEW — batch creation |
| `src/routes/.../contracts/analytics.lazy.tsx` | 4.4 | NEW — analytics |
| Supabase migration | 1 | Additional columns in roles, `contract_addendums` table |

---

## 5. Risks & Tradeoffs

- **Legal compliance**: Extra clauses must be vetted by legal/payroll team before deployment
- **Template complexity**: Too many conditional clauses makes template hard to maintain
- **DB schema changes**: Role contract config needs new JSONB columns in `payroll_role_rules`
- **PDF font size**: Embedding Times New Roman increases PDF JS bundle size (~80KB for TTF)
- **Backward compatibility**: Old contracts must still render correctly after changes
- **User training**: Batch creation and addendum flow needs admin training

---

## 6. Open Questions

1. Apakah BPJS sudah diterapkan? Butuh data rate dan kategori aktual?
2. Apakah ada template kontrak untuk PKWTT (tetap) yang berbeda dari PKWT (kontrak)?
3. Apakah ada role yang sudah punya ketentuan seragam/alat khusus?
4. Berapa frekuensi perpanjangan kontrak? Bulanan? Tahunan?
5. Apakah notifikasi Telegram untuk approval sudah cukup, atau perlu WhatsApp juga?
6. Untuk batch creation, dari mana sumber data karyawan? CSV dari Excel?
