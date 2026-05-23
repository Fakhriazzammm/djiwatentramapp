# Plan: Perbaikan Arsitektur Slip Gaji Payroll

## Ringkasan

Memperbaiki arsitektur data halaman `/admin/operational-team/payroll/slip` yang saat ini memiliki beberapa masalah: filter attendance period salah level, breakdown JSONB tidak lengkap, dan tidak ada link antar halaman terkait.

---

## Analisis Masalah

### Alur Data Saat Ini

```
pos_staff_users ──┐
                  ├──▶ pos_payroll_staff_active_view ──┐
pos_staff_roles ──┘   (JOIN staff+role+rules)         │
                                                      ├──▶ generate-payroll EF ──▶ pos.payslips ──▶ slip.lazy.tsx
pos_attendance_logs ──▶ pos_attendance_payroll_summary_view ──┘
                       (aggregate ALL time, salah level!)
```

### 🔴 Masalah 1: Attendance Period Filter Salah Level

**Lokasi:** `supabase/functions/generate-payroll/index.ts` line 193-204

View `pos_attendance_payroll_summary_view` meng-aggregate **semua** attendance tanpa filter tanggal.

```
-- Aggregate: semua attendance untuk setiap user
SELECT user_id, COUNT(*) AS total_days_worked,
       MIN(attendance_date) AS period_start,   ← tanggal PERTAMA kerja
       MAX(attendance_date) AS period_end       ← tanggal TERAKHIR kerja
FROM daily_attendance
GROUP BY user_id;
```

Lalu Edge Function filter aggregate-level:

```sql
WHERE s.period_start >= period.start_date   ← aggregate MIN, bukan record individual
  AND s.period_end   <= period.end_date      ← aggregate MAX, bukan record individual
```

**Dampak:** Filter aggregate MIN/MAX BUKAN filter individual records.

**Contoh:**
- Karyawan A: kerja 5 Jan - 20 Mar → period_start=Jan5, period_end=Mar20
- Payroll period Maret: 1 Mar - 31 Mar
- Filter: `Jan5 >= Mar1` → **FALSE** → karyawan A **tidak masuk payroll Maret** ❌
- Padahal A kerja di Maret!

**Fix:** Filter attendance records INDIVIDUAL berdasarkan tanggal, bukan aggregate-level.

### 🔴 Masalah 2: Breakdown JSONB Tidak Simpan Computed Values

**Lokasi:** `supabase/functions/generate-payroll/index.ts` line 238-245, `slip.lazy.tsx` line 716-767

Compensation breakdown hanya simpan **input values**:

```jsonb
{
  "base_shift_rate": 50000,       ← input
  "monthly_fixed_salary": 2000000, ← input
  "daily_allowance": 15000,        ← input
  "shifts": 20,                    ← input
  "days_worked": 25                ← input
}
```

Tapi frontend di detail dialog & CSV export referensi **computed values** yang TIDAK ADA:
- `b.total_shift_pay` → undefined → 0 → tidak tampil
- `b.total_allowance` → undefined → 0 → tidak tampil
- `b.total_overtime_bonus` → undefined → 0 → tidak tampil
- `b.bonus_target?.total_bonus` → undefined → 0 → tidak tampil
- `b.total_penalty` → undefined → 0 → tidak tampil

**Dampak:** Detail dialog hanya tampilkan Gaji Tetap, Hari Kerja, dan Jumlah Shift. Semua komponen lain hilang.

**Fix:** Simpan computed values di breakdown.

### 🔴 Masalah 3: Tidak Ada Cross-Link Antar Halaman

**Lokasi:** `slip.lazy.tsx`

Tabel slip gaji tidak punya navigasi ke:
- `/admin/operational-team/karyawan/data` — detail karyawan
- `/admin/operational-team/attendance` — detail absensi
- Tidak tampil payroll run asal

### 🔴 Masalah 4: Staff View Hanya Aktif

**Lokasi:** `supabase/migrations/20260502000000_payroll_schema.sql` line 254

```sql
WHERE u."isActive" = true;
```

Karyawan dinonaktifkan pertengahan bulan → tidak muncul di staff active view → tidak masuk payroll bulan itu.

### 🔴 Masalah 5: Inline Edit Bypass Logika Komputasi

**Lokasi:** `slip.lazy.tsx` line 346-355

Edit gross_pay/net_pay langsung di payslip → sync ke run item → data tidak konsisten dengan attendance.

---

## Rencana Eksekusi

### Wave 1: Fix Attendance Period Filter 🔥 (delegasi paralel)

| # | Task | File | Priority |
|---|------|------|----------|
| 1.1 | Buat migration baru: ganti view `pos_attendance_payroll_summary_view` jadi function dengan parameter start/end date | `20260521000001_fix_attendance_summary_function.sql` | HIGH |
| 1.2 | Update Edge Function `generatePayrollRun()` panggil function baru dengan period dates, bukan filter aggregate | `generate-payroll/index.ts` | HIGH |

### Wave 2: Fix Breakdown JSONB 🔥 (delegasi paralel)

| # | Task | File | Priority |
|---|------|------|----------|
| 2.1 | Update `generatePayrollRun()`: simpan computed values di compensation_breakdown | `generate-payroll/index.ts` | HIGH |
| 2.2 | Update `handleSyncPayslipFromRunItem()`: pastikan semua computed values tercopy | `generate-payroll/index.ts` | HIGH |

### Wave 3: Perbaiki UI & Navigation

| # | Task | File | Priority |
|---|------|------|----------|
| 3.1 | Tambah kolom "Payroll Run" di tabel slip | `slip.lazy.tsx` | MEDIUM |
| 3.2 | Tambah link ke karyawan (user_name → `/karyawan/{slug}`) | `slip.lazy.tsx` + simpan `slug` di payslip | MEDIUM |
| 3.3 | Di detail dialog, tampilkan computed breakdown values | `slip.lazy.tsx` | MEDIUM |

---

## Detail Task

### Task 1.1: Migration — Ganti View jadi Function

```sql
-- Buat function yang filter attendance individual records per period
CREATE OR REPLACE FUNCTION pos.get_attendance_summary_for_period(
  p_start_date DATE, p_end_date DATE
)
RETURNS TABLE(
  user_id TEXT,
  user_name TEXT,
  role_name TEXT,
  total_days_worked BIGINT,
  total_shifts BIGINT
) LANGUAGE sql STABLE AS $$
  WITH check_ins AS (
    SELECT
      a."userId" AS user_id,
      a."userName" AS user_name,
      a."roleName" AS role_name,
      date(to_timestamp((a.raw->>'timestamp')::numeric / 1000)) AS attendance_date,
      a._id AS check_in_id
    FROM public.pos_attendance_logs a
    WHERE a.type = 'check_in'
      AND a.raw->>'timestamp' IS NOT NULL
      AND date(to_timestamp((a.raw->>'timestamp')::numeric / 1000))
          BETWEEN p_start_date AND p_end_date
  ),
  daily_attendance AS (
    SELECT
      ci.user_id, ci.user_name, ci.role_name,
      ci.attendance_date, ci.shift_name,
      COUNT(DISTINCT ci.check_in_id) AS shift_count
    FROM check_ins ci
    GROUP BY ci.user_id, ci.user_name, ci.role_name,
             ci.attendance_date, ci.shift_name
  )
  SELECT
    user_id, user_name, role_name,
    COUNT(*)::BIGINT AS total_days_worked,
    SUM(shift_count)::BIGINT AS total_shifts
  FROM daily_attendance
  GROUP BY user_id, user_name, role_name;
$$;
```

**Rationale:** Filter attendance records INDIVIDUAL per tanggal, bukan aggregate aggregation. Function lebih tepat daripada view karena perlu parameter dinamis.

### Task 1.2: Update Edge Function

**Lokasi:** `generate-payroll/index.ts` function `generatePayrollRun()`

**Ubah:** Query attendance dari view → panggil function dengan period dates.

```typescript
// Dari:
const attendanceSql = `SELECT ... FROM pos.pos_attendance_payroll_summary_view s
  WHERE s.period_start >= ... AND s.period_end <= ...`;

// Menjadi:
const attendanceSql = `SELECT * FROM pos.get_attendance_summary_for_period(
  '${startDate}', '${endDate}'
)`;
```

### Task 2.1: Update Breakdown — Simpan Computed Values

**Lokasi:** `generate-payroll/index.ts` line 238-245

```jsonb
-- DARI hanya input values:
jsonb_build_object(
  'base_shift_rate', st.base_shift_rate,
  'monthly_fixed_salary', st.monthly_fixed_salary,
  'daily_allowance', st.daily_allowance,
  'overtime_rate_per_hour', st.overtime_rate_per_hour,
  'shifts', COALESCE(att.total_shifts, 0),
  'days_worked', COALESCE(att.total_days_worked, 0)
)

-- MENJADI: input + computed values:
jsonb_build_object(
  -- Input (untuk transparansi)
  'base_shift_rate', st.base_shift_rate,
  'monthly_fixed_salary', st.monthly_fixed_salary,
  'daily_allowance', st.daily_allowance,
  'overtime_rate_per_hour', st.overtime_rate_per_hour,
  'shifts', COALESCE(att.total_shifts, 0),
  'days_worked', COALESCE(att.total_days_worked, 0),
  -- Computed (untuk display di detail dan CSV)
  'total_shift_pay', COALESCE(att.total_shifts, 0) * st.base_shift_rate,
  'total_allowance', COALESCE(att.total_days_worked, 0) * st.daily_allowance,
  'total_overtime_bonus', 0,
  'total_penalty', 0,
  'bonus_target', '{}'::jsonb
)
```

### Task 3.1: Tambah Kolom Payroll Run di Slip

**Lokasi:** `slip.lazy.tsx` line 530-547

Tambah kolom "Run" di tabel header dan row, ambil dari `payslip.payroll_run_item_id` → `payroll_run_id`.

### Task 3.2: Link ke Karyawan

Simpan `slug` di payslip table atau gunakan user_id yang ada untuk navigasi ke `/karyawan/{slug}`.
Tambahkan kolom `slug` di `pos.payslips` atau lookup dari user_id via staff_users.

### Task 3.3: Display Computed Values di Dialog

Update detail dialog (`slip.lazy.tsx` line 716-767) untuk menampilkan breakdown values dari JSONB yang sudah lengkap.

---

## Dependency Graph

```
Level 1 (independen → delegasi paralel 🔥):
  ├── [1.1] Migration: function get_attendance_summary_for_period
  ├── [2.1] Update breakdown di generatePayrollRun()
  └── [2.2] Update breakdown di syncPayslipFromRunItem()

Level 2 (dependen pada 1.1):
  └── [1.2] Update Edge Function panggil function baru

Level 3 (UI, independent of DB changes):
  ├── [3.1] Kolom Payroll Run di slip page
  ├── [3.2] Link ke karyawan
  └── [3.3] Display computed breakdown di detail dialog
```

## Cara Test

1. **Attendance filter:** Buka halaman payrun untuk periode tertentu → cek jumlah shift & hari kerja karyawan yang punya attendance di periode itu (tapi tidak di luar periode).
2. **Breakdown:** Buka detail dialog payslip → pastikan semua komponen gaji tampil (shift pay, allowance, dll).
3. **Link:** Klik nama karyawan di slip table → harus navigasi ke profil karyawan.
4. **Build:** `npm run build` atau `tsc --noEmit` untuk type check.
5. **Edge Function:** Test deploy `generate-payroll` → trigger `auto_detect` → cek hasil.
