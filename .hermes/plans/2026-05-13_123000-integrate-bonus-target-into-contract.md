# Plan: Integrate Bonus Target Payroll ke Kontrak Kerja

## Goal
Menambahkan data **bonus target** dan **custom allowances** dari konfigurasi Role (Payroll) ke dalam kontrak kerja karyawan — otomatis tercantum di **Pasal 5A (Bonus & Insentif)** dan **Pasal 5B (Tunjangan Tambahan)**.

## Current Context

### Yang sudah ada
- **Role payroll config** (`/admin/operational-team/payroll` → tab Gaji & Role):
  - Setiap Role punya `bonusTargetConfig: { basis: "shift"|"daily"|"monthly", tiers: [{thresholdPct, bonusAmount}] }`
  - Setiap Role punya `customAllowances: { name, amount, type }[]`
- **`buildEmployeeContractTemplate()`** di `employee-onboarding-schema.ts`:
  - **Sudah** menerima parameter `bonusConfig?` dan `customAllowances?`
  - **Sudah** menghasilkan Pasal 5A (Bonus & Insentif) via `buildBonusClause()`
  - **Sudah** menghasilkan Pasal 5B (Tunjangan Tambahan) via `buildCustomAllowancesBody()`
- **`getRoleSalaryDefaults()`** di `employee-onboarding-settings.ts`: hanya extract `monthlySalary`, `dailyAllowance`, `shiftRate` — **tidak** extract `bonusTargetConfig` / `customAllowances`

### Yang belum
1. **`getRoleSalaryDefaults()`** tidak mengembalikan bonus/customAllowances
2. **`buildPlaceholderContract()`** (`contract.lazy.tsx`) tidak passing `bonusConfig` / `customAllowances` ke `buildEmployeeContractTemplate()`
3. **`register.lazy.tsx`** (public) — tidak passing bonus/customAllowances
4. **`replaceContractVariables()`** tidak punya variable untuk bonus target (misal `{{bonus_target_summary}}`)
5. Tidak ada cara untuk menampilkan ringkasan bonus target di preview/test data

## Proposed Approach

3 file diubah:
1. **`employee-onboarding-settings.ts`** — Perluas `getRoleSalaryDefaults()` → juga return `bonusTargetConfig` + `customAllowances`
2. **`contract.lazy.tsx`** — Passing bonus/customAllowances dari selectedRole ke `buildEmployeeContractTemplate()` + update preview
3. **`register.lazy.tsx`** — Passing bonus/customAllowances dari role data ke template builder

## Step-by-Step Plan

### Step 1: Perluas `getRoleSalaryDefaults()` di `employee-onboarding-settings.ts`

**File:** `apps/web/src/lib/employee-onboarding-settings.ts`

Tambahkan `bonusTargetConfig` dan `customAllowances` ke return value:

```typescript
export function getRoleSalaryDefaults(role: unknown) {
  const data = isObject(role) ? role : {};
  return {
    monthlySalary: cleanNumber(data.monthlyFixedSalary, 0),
    dailyAllowance: cleanNumber(data.dailyAllowance, 0),
    shiftRate: cleanNumber(data.baseShiftRate, cleanNumber(data.baseHourlyRate, 0)),
    bonusTargetConfig: (data as any).bonusTargetConfig ?? null,
    customAllowances: (data as any).customAllowances ?? [],
  };
}
```

Ini memungkinkan caller untuk mengambil bonus config dari role secara konsisten.

### Step 2: Update `contract.lazy.tsx` — Admin Contract Editor

**File:** `apps/web/src/routes/admin/operational-team/register/contract.lazy.tsx`

**(A) Update `buildPlaceholderContract()`** (line 97-115):
- Terima parameter `role?: any`
- Extract `bonusTargetConfig` + `customAllowances` dari role
- Pass ke `buildEmployeeContractTemplate()`
- Jaga backward compatibility dengan default value

**(B) Update render logic** di sekitar line 215-222:
- Saat `selectedRole` tersedia, ambil `bonusTargetConfig` dan `customAllowances`
- Pass ke `buildPlaceholderContract()` / rebuild kontrak

**(C) Tambah ringkasan bonus target** di UI sidebar/preview panel:
- Tampilkan inline badge: "Bonus: Per Shift - 100%: Rp50.000 | 150%: Rp75.000"

### Step 3: Update `register.lazy.tsx` — Public Registration

**File:** `apps/web/src/routes/register.lazy.tsx`

**(A) Cari role data** di sekitar line 170:
- Saat memanggil `buildEmployeeContractTemplate()`, perlu dicari role berdasarkan `draft.employment.roleId`
- Extract `bonusTargetConfig` dan `customAllowances`
- Pass ke fungsi template builder

**(B) Update variable context**:
- Pastikan variabel bonus juga tersedia jika menggunakan custom template text

### Step 4: (Optional) Tambah Variable Bonus Target

**File:** `apps/web/src/lib/employee-onboarding-schema.ts`

Tambah variable baru di `replaceContractVariables()`:
- `{{bonus_target_summary}}` — ringkasan: "Per Shift: 100% → Rp50.000, 150% → Rp75.000"
- `{{bonus_target_basis}}` — "Per Shift" / "Per Hari" / "Per Bulan"

Ini berguna untuk template kustom yang ditulis manual.

## Files Likely to Change

| File | Changes |
|------|---------|
| `apps/web/src/lib/employee-onboarding-settings.ts` | Perluas `getRoleSalaryDefaults()` — +bonusTargetConfig, +customAllowances |
| `apps/web/src/routes/admin/operational-team/register/contract.lazy.tsx` | Passing bonus/customAllowances, update `buildPlaceholderContract()`, sidebar ringkasan |
| `apps/web/src/routes/register.lazy.tsx` | Cari role + passing bonus/customAllowances ke template |
| `apps/web/src/lib/employee-onboarding-schema.ts` | (Optional) tambah `{{bonus_target_summary}}`, `{{bonus_target_basis}}` variable |

## Validation

1. **Admin Contract Editor** (`/admin/operational-team/register/contract`):
   - Pilih role yang punya bonus target → preview harus tampilkan Pasal 5A dengan tier bonus
   - Test preview dengan data test → kontrak harus contain detail bonus
   - Simpan template → verifikasi tersimpan

2. **Public Register** (`/register`):
   - Flow registrasi dengan role → kontrak generate otomatis harus include bonus clause

3. **Payroll Page** (`/admin/operational-team/payroll`):
   - Pastikan tidak ada perubahan di UI payroll (read-only untuk kita)

4. **Build**: `npm run build` — zero error

## Risks & Tradeoffs

- **Edge case**: Role belum dikonfigurasi bonus → `bonusTargetConfig` null/undefined → `buildBonusClause()` sudah handle dengan return empty string, Pasal 5A tidak akan muncul. ✅ Aman.
- **Edge case**: `customAllowances` kosong → `buildCustomAllowancesBody()` return empty → Pasal 5B skip. ✅ Aman.
- **Backward compatibility**: Semua perubahan additive (nambah field, nggak ngubah existing logic).
- **Data integrity**: Bonus config tetap disimpan di Role (payroll), bukan di kontrak. Kontrak hanya membaca dan menyematkan nilai saat generate.

## Open Questions

- ~~Perlu nambah variable `{{bonus_target_summary}}` untuk custom template?~~ → Ya, sekalian biar konsisten.
