# Plan: Halaman Slip Gaji /admin/operational-team/payroll/slip

## Goal

Membangun halaman **slip gaji** yang komprehensif untuk admin (mengatur, mengontrol, melihat data slip gaji seluruh karyawan) dan mengintegrasikan dengan halaman `/karyawan/$username` agar karyawan dapat melihat & mendownload slip gaji PDF.

---

## Current Context

### Database Schema (sudah ada — `pos` schema)

| Tabel | Fungsi |
|---|---|
| `pos.payroll_periods` | Periode penggajian (draft/open/processing/closed) |
| `pos.payroll_role_rules` | Aturan gaji per role (hourly, shift, fixed, allowance) |
| `pos.payroll_user_overrides` | Override gaji per user |
| `pos.payroll_runs` | Run kalkulasi payroll (pending→processing→completed→reversed) |
| `pos.payroll_run_items` | Item per employee dalam satu run |
| `pos.payslips` | Slip gaji generated dari run items — **tabel utama untuk halaman ini** |
| `pos.payroll_audit_logs` | Audit trail |

**Columns `pos.payslips`:**
```
id, payroll_run_item_id, user_id, user_name,
period_name, period_start, period_end,
gross_pay, deductions, net_pay,
breakdown (JSONB),
status (generated/sent/acknowledged/disputed),
sent_at, acknowledged_at, created_at, updated_at
```

### Hooks yang Tersedia (use-hybrid-payroll-data.ts)
- `useHybridPayrollPeriods()` — Semua periode
- `useHybridPayrollRuns(periodId?)` — Runs, opsional filter per periode
- `useHybridPayrollRunItems(runId?)` — Item dalam run
- `useHybridPayslips({userId?, status?})` — Slip gaji, filter per user/status
- `useHybridPayslipByRunItem(runItemId?)` — Single slip
- `useHybridPayrollStaffActive()` — Staff aktif dengan role rules

**Actions SQL:**
- `generatePayslipsForRun({runId})` — Generate slip untuk suatu run
- `updatePayslipStatus({payslipId, status})` — Ubah status slip
- `approvePayrollRun({runId, approvedBy?})` — Approve run
- `reversePayrollRun({runId})` — Reverse run

### Existing Pages

| Halaman | File | Status |
|---|---|---|
| `/admin/operational-team/payroll` | `payroll.tsx` + `payroll.lazy.tsx` ✅ Ada — reuse SettingsPage "payroll" tab (laporan absensi realtime) |
| `/admin/operational-team/attendance/` | `attendance.index.tsx` + `.lazy.tsx` ✅ Ada — 3 tab (Data Absensi, Log, Jadwal) |
| `/admin/operational-team/attendance/jadwal` | `jadwal.tsx` + `.lazy.tsx` ✅ Ada — Kalender + matrix drag-drop |
| `/admin/operational-team/karyawan` | `karyawan.tsx` + `.lazy.tsx` ✅ Ada — reuse SettingsPage |
| `/admin/operational-team/attendance/pengaturan` | `pengaturan.tsx` + `.lazy.tsx` ✅ Ada — Shift, geofencing, template |
| `/karyawan/$username` | `karyawan.$username.tsx` + `.lazy.tsx` ✅ Ada — Profile + absensi + **payslip placeholder** |

### Existing Payslip di Karyawan Profile
Di `karyawan.$username.lazy.tsx` (lines 285-310):
- Static placeholder "Slip Gaji Terakhir" dengan teks "Rp 0 (Belum dikonfigurasi)"
- Tombol "Lihat Semua" tidak terhubung ke data real
- **BELUM menggunakan `useHybridPayslips`** — perlu integrasi

---

## Proposed Approach

### Architecture Decisions

1. **New page**, bukan dialog/modal — karena data slip gaji kompleks (filter, list, detail, download)
2. **Standalone route** di `/admin/operational-team/payroll/slip` — tidak reuse SettingsPage
3. **Dua view dalam satu halaman**: Master table (list slip) + Detail panel (breakdown)
4. **PDF download** via `jspdf` + `jspdf-autotable` (sudah ada di project) — desain profesional
5. **Tambah sidebar link** di operational-team route.tsx atau di layout operational-team

### Tahapan

#### Wave 1 (Paralel 🔥) — 3 subagent

**Subagent 1: Database Migration & Public View**
- [ ] Migration: tambah kolom `pdf_url TEXT` di `pos.payslips` (opsional — untuk menyimpan generated PDF, bisa juga generate on-the-fly)
- [ ] Pastikan view `public.pos_payslips` tetap sinkron
- [ ] Index: skip (sudah ada `idx_payslips_user`, `idx_payslips_status`)
- **File:** `supabase/migrations/20260521000005_payslip_pdf_url.sql` (opsional)

**Subagent 2: Admin Page — Route Files & Sidebar**
- [ ] Buat `payslip/slip.tsx` — route definition (createFileRoute)
- [ ] Buat `payslip/slip.lazy.tsx` — lazy component
- [ ] Tambah link di operational-team sidebar/layout (cek `operational-team.tsx`)
- [ ] Export komponen PayslipAdminPage
- **File:** `apps/web/src/routes/admin/operational-team/payroll/slip.tsx`, `slip.lazy.tsx`

**Subagent 3: Karyawan Profile — Integrasi Payslip Real**
- [ ] Update `karyawan.$username.lazy.tsx` — ganti placeholder payslip dengan data real dari `useHybridPayslips`
- [ ] Import `useHybridPayslips` dari `use-hybrid-payroll-data`
- [ ] Tampilkan daftar payslip (period, net_pay, status)
- [ ] "Lihat Semua" → expand list atau navigate ke detail
- **File:** `apps/web/src/routes/karyawan.$username.lazy.tsx`

#### Wave 2 (Paralel 🔥) — 3 subagent

**Subagent 4: Admin Page — Hook Integration & Filter State**
- [ ] Fetch data: `useHybridPayslips()`, `useHybridPayrollPeriods()`
- [ ] State management: selectedPeriod, employeeSearch, statusFilter, selectedPayslip
- [ ] Filter logic: filter payslip array based on states
- **File:** `apps/web/src/routes/admin/operational-team/payroll/slip.lazy.tsx`

**Subagent 5: Admin Page — Master Table UI**
- [ ] Table: Employee, Period, Gross Pay, Deductions, Net Pay, Status, Actions
- [ ] Inline status badges (generated=gray, sent=blue, acknowledged=green, disputed=red)
- [ ] Actions per row: View Detail, Download PDF, Send/Approve, Reverse
- [ ] Loading/empty/error states
- [ ] Bulk actions: Send Selected, Generate Payslips for Run button
- **File:** `apps/web/src/routes/admin/operational-team/payroll/slip.lazy.tsx`

**Subagent 6: PDF Generation — Professional Design**
- [ ] Bikin fungsi `generatePayslipPDF(payslip, breakdown)` di lib/utils
- [ ] Desain: Header (nama karyawan, role, periode), Tabel komponen gaji, Total, Footer
- [ ] Pakai `jspdf` (sudah ada di project)
- [ ] Styling: font profesional, alignment rapi, warna tipis
- **File:** `apps/web/src/lib/payslip-pdf.ts`

#### Wave 3 (Sequential — Kamu Sendiri)

**Subagent 7: Admin Page — Detail Panel & Integrasi**
- [ ] Detail view/modal: tampilkan full breakdown payslip (dari `breakdown` JSONB)
- [ ] Tombol download PDF → panggil `generatePayslipPDF`
- [ ] Tombol Update Status (Send → Acknowledged → Disputed)
- [ ] Generate payslips button (panggil `generatePayslipsForRun` via SQL)
- [ ] Loading states untuk setiap action
- **File:** `apps/web/src/routes/admin/operational-team/payroll/slip.lazy.tsx`

**Build & Verify**
- [ ] `turbo build` / `tsc --noEmit`
- [ ] Verifikasi semua import/export
- [ ] Cek konsistensi data dengan database

---

## Files Likely to Change

### New Files
1. `apps/web/src/routes/admin/operational-team/payroll/slip.tsx` — Route def
2. `apps/web/src/routes/admin/operational-team/payroll/slip.lazy.tsx` — Komponen utama
3. `apps/web/src/lib/payslip-pdf.ts` — PDF generator

### Modified Files
4. `apps/web/src/routes/karyawan.$username.lazy.tsx` — Integrasi payslip real
5. `apps/web/src/routes/admin/operational-team.tsx` atau layout — Sidebar link
6. (Optional) `supabase/migrations/20260521000005_payslip_pdf_url.sql`

---

## UI/UX Specification

### Admin Page Layout

```
┌─────────────────────────────────────────────────────┐
│ [Filter Bar]                                        │
│ ┌─────────┐ ┌──────────────┐ ┌──────────┐ ┌──────┐ │
│ │ Period  ▼│ │ Cari Nama... │ │ Status ▼ │ │ ⋮    │ │
│ └─────────┘ └──────────────┘ └──────────┘ └──────┘ │
├─────────────────────────────────────────────────────┤
│ [Action Bar]                                        │
│ [Generate Slip] [Send Selected] [Download All]      │
├─────────────────────────────────────────────────────┤
│ [Master Table]                                      │
│ # │ Nama │ Role │ Periode │ Gross │ Net │ Status │Aksi│
│───┼──────┼──────┼─────────┼───────┼─────┼────────┼────┤
│ 1 │ Budi │ Chef │ Mei 26  │ 5jt   │ 4jt │ ✓ Sent │...│
│ 2 │ Ani  │ Waiter│Mei 26  │ 3jt   │ 2.8jt│ ◉ Ack  │...│
├─────────────────────────────────────────────────────┤
│ Summary: 12 employees | Total Net: Rp 45.000.000    │
└─────────────────────────────────────────────────────┘
```

### States

| State | Tampilan |
|---|---|
| **Loading** | Skeleton rows (6 baris) |
| **Empty** | "Belum ada slip gaji. Generate payslip dari payroll run yang sudah completed." + tombol "Generate" |
| **Error** | Alert error + tombol "Coba Lagi" |
| **Filtered Empty** | "Tidak ada slip yang cocok dengan filter" |
| **Saving** | Disable buttons, loading spinner pada tombol |

### Per-Column Interaction

| Kolom | Tipe Data | Editable? | Interaksi |
|---|---|---|---|
| Nama | string | ❌ | — |
| Role | string | ❌ | — |
| Periode | string | ❌ | — |
| Gross Pay | currency | ❌ | — |
| Net Pay | currency | ❌ | — |
| Status | badge | ✅ | Click → dropdown: Send / Acknowledge / Dispute |
| Aksi | button group | ✅ | 👁 View, ⬇ PDF |

### Karyawan Profile — Slip Gaji Section

Layout di `/karyawan/$username`:

```
┌──────────────────────────────────────────────┐
│ 📄 Slip Gaji                                 │
│                                              │
│ ┌──────────────────────────────────────────┐ │
│ │ 🗎 Slip Gaji Mei 2026                    │ │
│ │   Rp 4.000.000 — ✓ Diterima             │ │
│ │                              [⬇ PDF] [👁]│ │
│ ├──────────────────────────────────────────┤ │
│ │ 🗎 Slip Gaji April 2026                  │ │
│ │   Rp 3.800.000 — ✓ Diterima             │ │
│ │                              [⬇ PDF] [👁]│ │
│ └──────────────────────────────────────────┘ │
│ [Lihat Semua →]                              │
└──────────────────────────────────────────────┘
```

---

## Database Schema Detail

### Full Entity Relationship Diagram

```
payroll_periods (1) ───────< (N) payroll_runs (1) ───────< (N) payroll_run_items (1) ──── (1) payslips
       │                              │                            │
       │                              │                            ├── user_id → pos_staff_users._id
       │                              │                            └── role_rule_id → payroll_role_rules.id
       │                              │
       │                              └── Has payroll_user_overrides (optional, per user x period)
       │
       └── Audit logs → payroll_audit_logs (entity_type + entity_id)
```

### pos.payslips — Detailed Column Reference

| Column | Type | Source | Digunakan di |
|---|---|---|---|
| `id` | UUID PK | auto | Semua query |
| `payroll_run_item_id` | UUID FK → payroll_run_items | dari run item | Join ke run detail (shifts, hours, allowance) |
| `user_id` | TEXT | dari run item | Filter per user, join ke `pos_staff_users` |
| `user_name` | TEXT | dari run item | Display di table + PDF |
| `period_name` | TEXT | dari `payroll_periods.period_name` | Display filter + PDF header |
| `period_start` | DATE | dari `payroll_periods.start_date` | Filter date range |
| `period_end` | DATE | dari `payroll_periods.end_date` | Filter date range |
| `gross_pay` | NUMERIC(15,2) | kalkulasi: fixed_salary + shift_pay + allowance + overtime + bonus | Table kolom, PDF |
| `deductions` | NUMERIC(15,2) | kalkulasi: penalty + lainnya | Table kolom, PDF |
| `net_pay` | NUMERIC(15,2) | `gross_pay - deductions` | Table kolom, PDF, total summary |
| `breakdown` | JSONB | dari `payroll_run_items.compensation_breakdown` | Detail panel, PDF |
| `status` | TEXT ENUM | `'generated'` default | Filter, badge, action |
| `sent_at` | TIMESTAMPTZ | saat status → `sent` | Tracking |
| `acknowledged_at` | TIMESTAMPTZ | saat status → `acknowledged` | Tracking |
| `created_at` | TIMESTAMPTZ | auto | Sort |
| `updated_at` | TIMESTAMPTZ | auto trigger | — |

### breakdown JSONB Structure

Dari `payroll_run_items.compensation_breakdown`:

```json
{
  "base_shift_rate": 50000,
  "monthly_fixed_salary": 2000000,
  "daily_allowance": 25000,
  "overtime_rate_per_hour": 15000,
  "shifts": 20,
  "days_worked": 22,
  "total_shift_pay": 1000000,
  "total_allowance": 550000,
  "total_overtime_bonus": 0,
  "total_penalty": 100000,
  "bonus_target": {
    "basis": "shift",
    "total_bonus": 200000,
    "tiers": [
      {"threshold_pct": 100, "amount": 50000, "achieved": true},
      {"threshold_pct": 150, "amount": 100000, "achieved": true},
      {"threshold_pct": 200, "amount": 50000, "achieved": false}
    ]
  }
}
```

### Queries Penting

**Admin list (filterable):**
```ts
supabase
  .from("pos_payslips")
  .select("*")
  .order("created_at", { ascending: false })
  .limit(50);
// Optional: .eq("period_name", periodName) untuk filter periode
```

**Per user (karyawan profile):**
```ts
supabase
  .from("pos_payslips")
  .select("*")
  .eq("user_id", userId)
  .order("created_at", { ascending: false });
```

**Join ke run item untuk detail breakdown:**
```ts
supabase
  .from("pos_payslips")
  .select("*, payroll_run_item_id(*)")
  .eq("id", payslipId)
  .single();
```

**Views publik (sudah ada):**
```sql
CREATE OR REPLACE VIEW public.pos_payslips AS SELECT * FROM pos.payslips;
CREATE OR REPLACE VIEW public.pos_payroll_run_items AS SELECT * FROM pos.payroll_run_items;
CREATE OR REPLACE VIEW public.pos_payroll_periods AS SELECT * FROM pos.payroll_periods;
CREATE OR REPLACE VIEW public.pos_payroll_runs AS SELECT * FROM pos.payroll_runs;
```

**Grant yang dibutuhkan (sudah ada di migration 20260502000001):**
```sql
GRANT SELECT ON public.pos_payslips TO anon, authenticated;
GRANT SELECT ON public.pos_payroll_run_items TO anon, authenticated;
```

---

## PDF Design Spec

### Teknologi
- **Library:** `jspdf` (v2.5.x) + `jspdf-autotable` (v3.8.x) — sudah ada di project
- **Font:** Default Helvetica (built-in jsPDF). Untuk karakter Indonesia (é, è, ë, etc.) gunakan `windows-1252` encoding
- **Ukuran:** A4 (210mm × 297mm), portrait
- **Margin:** 15mm kiri/kanan, 20mm atas/bawah

### Layout Detail

```
┌─ PAGE (A4, 210mm × 297mm) ──────────────────────────────────┐
│                                                               │
│  [HEADER]                                                     │
│  ┌─────────────────────────────────────────────────────┐     │
│  │  TENTREM KOFFIE                          (logo)     │     │
│  │  Jl. Tentrem No. 123, Yogyakarta                    │     │
│  │  Telp: 0274-123456                                 │     │
│  │  ────────────────────────────────────────────────   │     │
│  │           SLIP GAJI KARYAWAN                        │     │
│  │           Periode: Mei 2026                         │     │
│  └─────────────────────────────────────────────────────┘     │
│                                                               │
│  [INFO KARYAWAN]                                              │
│  ┌─────────────────────────────────────────────────────┐     │
│  │  Nama            : Budi Santoso                     │     │
│  │  Role / Jabatan  : Chef                             │     │
│  │  NIP             : KRY-2025-001                     │     │
│  │  Tanggal Cetak   : 21 Mei 2026                      │     │
│  └─────────────────────────────────────────────────────┘     │
│                                                               │
│  [TABEL KOMPONEN GAJI]                                        │
│  ┌─────────────────────────────────────────────────────┐     │
│  │  No │ Komponen                    │ Jumlah (Rp)     │     │
│  │─────┼─────────────────────────────┼─────────────────│     │
│  │  1  │ Gaji Tetap (Bulanan)        │    2.000.000    │     │
│  │  2  │ Gaji Shift (20 shift)       │    1.000.000    │     │
│  │  3  │ Tunjangan Transportasi      │      500.000    │     │
│  │  4  │ Bonus Lembur (20 jam)       │      300.000    │     │
│  │  5  │ Bonus Target (150%)         │      200.000    │     │
│  │─────┼─────────────────────────────┼─────────────────│     │
│  │     │ GROSS TOTAL                 │    4.000.000    │     │
│  │─────┼─────────────────────────────┼─────────────────│     │
│  │  6  │ Denda Keterlambatan         │      -100.000   │     │
│  │─────┼─────────────────────────────┼─────────────────│     │
│  │     │ NET TOTAL (Diterima)        │    3.900.000    │     │
│  └─────────────────────────────────────────────────────┘     │
│                                                               │
│  [RINCIAN KEHADIRAN]                                          │
│  ┌─────────────────────────────────────────────────────┐     │
│  │  Hari Kerja    : 22 hari                            │     │
│  │  Total Shift   : 20 shift                           │     │
│  │  Total Jam     : 176 jam                            │     │
│  │  Keterlambatan : 50 menit (denda Rp 100.000)        │     │
│  └─────────────────────────────────────────────────────┘     │
│                                                               │
│  [STATUS]                                                      │
│  Status: ✓ Diterima pada 20 Mei 2026                          │
│                                                               │
│  [FOOTER]                                                      │
│  ┌─────────────────────────────────────────────────────┐     │
│  │  Terima kasih atas dedikasi dan kerja keras Anda!   │     │
│  │  Dokumen ini digenerate secara otomatis oleh sistem │     │
│  │  YumiPOS — DJI Watentram                            │     │
│  └─────────────────────────────────────────────────────┘     │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

### Implementasi jsPDF

```ts
// File: apps/web/src/lib/payslip-pdf.ts
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { PayslipData } from "@/types/backend-compat";

/** Warna korporat */
const COLORS = {
  primary: [41, 65, 86] as [number, number, number],       // Dark blue
  accent: [34, 139, 34] as [number, number, number],       // Forest green
  muted: [128, 128, 128] as [number, number, number],      // Gray
  light: [240, 240, 240] as [number, number, number],      // Light gray bg
  border: [200, 200, 200] as [number, number, number],     // Border gray
  danger: [220, 38, 38] as [number, number, number],       // Red for deductions
};

/** Ukuran */
const MARGIN = 15; // mm
const PAGE_W = 210; // A4 width
const PAGE_H = 297; // A4 height
const CONTENT_W = PAGE_W - MARGIN * 2; // 180mm

export function generatePayslipPDF(
  payslip: PayslipData,
  breakdown: PayslipBreakdown,
  siteName: string = "TENTREM KOFFIE",
  siteAddress: string = ""
): Blob {
  const doc = new jsPDF("portrait", "mm", "a4");
  const pageW = PAGE_W;
  let y = MARGIN + 5;

  // === HEADER ===
  doc.setFontSize(20);
  doc.setTextColor(...COLORS.primary);
  doc.setFont("helvetica", "bold");
  doc.text(siteName, pageW / 2, y, { align: "center" });
  y += 7;

  if (siteAddress) {
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.muted);
    doc.setFont("helvetica", "normal");
    doc.text(siteAddress, pageW / 2, y, { align: "center" });
    y += 4;
  }

  // Divider line
  doc.setDrawColor(...COLORS.border);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, y, pageW - MARGIN, y);
  y += 6;

  doc.setFontSize(16);
  doc.setTextColor(...COLORS.primary);
  doc.setFont("helvetica", "bold");
  doc.text("SLIP GAJI KARYAWAN", pageW / 2, y, { align: "center" });
  y += 6;

  doc.setFontSize(10);
  doc.setTextColor(...COLORS.muted);
  doc.setFont("helvetica", "normal");
  doc.text(`Periode: ${payslip.period_name ?? "-"}`, pageW / 2, y, { align: "center" });
  y += 8;

  // === INFO KARYAWAN ===
  // Light background
  doc.setFillColor(...COLORS.light);
  doc.rect(MARGIN, y, CONTENT_W, 24, "F");
  doc.setTextColor(...COLORS.primary);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");

  doc.text(`Nama            : ${payslip.user_name ?? "-"}`, MARGIN + 5, y + 6);
  doc.text(`Jabatan         : ${breakdown.role_name ?? "-"}`, MARGIN + 5, y + 12);
  doc.text(`Periode Gaji    : ${payslip.period_start ?? "-"} s/d ${payslip.period_end ?? "-"}`, MARGIN + 5, y + 18);
  y += 30;

  // === TABEL KOMPONEN GAJI ===
  const rows: [string, string, string][] = [];
  let runningTotal = 0;

  if ((breakdown.monthly_fixed_salary ?? 0) > 0) {
    rows.push(["1", "Gaji Tetap", formatPDFCurrency(breakdown.monthly_fixed_salary)]);
    runningTotal += breakdown.monthly_fixed_salary;
  }
  if ((breakdown.total_shift_pay ?? 0) > 0) {
    rows.push(["2", `Gaji Shift (${breakdown.shifts ?? 0} shift)`, formatPDFCurrency(breakdown.total_shift_pay)]);
    runningTotal += breakdown.total_shift_pay;
  }
  if ((breakdown.total_allowance ?? 0) > 0) {
    rows.push(["3", "Tunjangan Transportasi", formatPDFCurrency(breakdown.total_allowance)]);
    runningTotal += breakdown.total_allowance;
  }
  if ((breakdown.total_overtime_bonus ?? 0) > 0) {
    rows.push(["4", "Bonus Lembur", formatPDFCurrency(breakdown.total_overtime_bonus)]);
    runningTotal += breakdown.total_overtime_bonus;
  }
  if ((breakdown.bonus_target?.total_bonus ?? 0) > 0) {
    rows.push(["5", "Bonus Target", formatPDFCurrency(breakdown.bonus_target.total_bonus)]);
    runningTotal += breakdown.bonus_target.total_bonus;
  }

  autoTable(doc, {
    startY: y,
    head: [["No", "Komponen Gaji", "Jumlah (Rp)"]],
    body: rows,
    foot: [[
      { content: "GROSS TOTAL", colSpan: 2, styles: { fontStyle: "bold" } },
      { content: formatPDFCurrency(payslip.gross_pay), styles: { fontStyle: "bold" } },
    ]],
    theme: "grid",
    headStyles: {
      fillColor: COLORS.primary,
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 10,
    },
    bodyStyles: { fontSize: 9 },
    footStyles: {
      fillColor: COLORS.light,
      textColor: COLORS.primary,
      fontStyle: "bold",
      fontSize: 10,
    },
    columnStyles: {
      0: { cellWidth: 12, halign: "center" },
      1: { cellWidth: 110 },
      2: { cellWidth: 50, halign: "right" },
    },
    margin: { left: MARGIN, right: MARGIN },
    tableLineColor: COLORS.border,
    tableLineWidth: 0.1,
  });

  y = (doc as any).lastAutoTable.finalY + 4;

  // Deductions row
  if ((payslip.deductions ?? 0) > 0) {
    autoTable(doc, {
      startY: y,
      body: [[
        { content: "6", styles: { halign: "center" } },
        { content: "Denda / Potongan", styles: { textColor: COLORS.danger } },
        { content: formatPDFCurrency(-Math.abs(payslip.deductions)), styles: { textColor: COLORS.danger } },
      ]],
      theme: "grid",
      bodyStyles: { fontSize: 9 },
      columnStyles: {
        0: { cellWidth: 12, halign: "center" },
        1: { cellWidth: 110 },
        2: { cellWidth: 50, halign: "right" },
      },
      margin: { left: MARGIN, right: MARGIN },
      tableLineColor: COLORS.border,
      tableLineWidth: 0.1,
    });
    y = (doc as any).lastAutoTable.finalY + 4;
  }

  // Net total
  autoTable(doc, {
    startY: y,
    body: [[
      { content: "NET TOTAL (Diterima)", colSpan: 2, styles: { fontStyle: "bold", fontSize: 11 } },
      { content: formatPDFCurrency(payslip.net_pay), styles: { fontStyle: "bold", fontSize: 11, textColor: COLORS.accent } },
    ]],
    theme: "grid",
    bodyStyles: { fontSize: 10 },
    columnStyles: {
      0: { cellWidth: 12, halign: "center" },
      1: { cellWidth: 110 },
      2: { cellWidth: 50, halign: "right" },
    },
    margin: { left: MARGIN, right: MARGIN },
    tableLineColor: COLORS.accent,
    tableLineWidth: 0.3,
  });

  y = (doc as any).lastAutoTable.finalY + 8;

  // === STATUS ===
  doc.setFillColor(breakdown.acknowledged ? [220, 252, 231] : [254, 243, 199]);
  doc.rect(MARGIN, y, CONTENT_W, 8, "F");
  doc.setFontSize(9);
  doc.setTextColor(breakdown.acknowledged ? COLORS.accent : [180, 120, 0]);
  doc.setFont("helvetica", "bold");
  doc.text(
    breakdown.acknowledged
      ? `✓ Diterima pada ${formatDateStr(payslip.acknowledged_at)}`
      : payslip.status === "sent"
        ? `✓ Dikirim pada ${formatDateStr(payslip.sent_at)}`
        : "○ Generated — Belum dikirim",
    pageW / 2, y + 5.5, { align: "center" }
  );

  y += 14;

  // === FOOTER ===
  doc.setFontSize(7);
  doc.setTextColor(...COLORS.muted);
  doc.setFont("helvetica", "italic");
  doc.text("Terima kasih atas dedikasi dan kerja keras Anda!", pageW / 2, y, { align: "center" });
  y += 4;
  doc.text("Dokumen ini digenerate secara otomatis oleh sistem YumiPOS", pageW / 2, y, { align: "center" });

  return doc.output("blob");
}

function formatPDFCurrency(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "decimal",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDateStr(dateVal: string | number | Date | null | undefined): string {
  if (!dateVal) return "-";
  return new Date(dateVal).toLocaleDateString("id-ID", {
    day: "numeric", month: "long", year: "numeric",
  });
}
```

### Download Implementation

```tsx
// Di komponen:
const handleDownload = async (payslip: any) => {
  const breakdown = payslip.breakdown ?? {};
  const blob = generatePayslipPDF(payslip, breakdown, siteName);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `slip-gaji-${payslip.user_name?.toLowerCase().replace(/\s+/g, "-")}-${payslip.period_name?.toLowerCase().replace(/\s+/g, "-")}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
  toast.success("PDF berhasil diunduh");
};
```

### Test Checklist PDF

| Item | Harus |
|---|---|
| Karakter Indonesia (é, è, ë, etc.) | Muncul benar |
| Nama panjang (30+ karakter) | Wrap ke baris berikutnya |
| Angka besar (Rp 1.000.000.000+) | Format benar, tidak overflow kolom |
| Empty breakdown | Tampilkan "Tidak ada komponen gaji" |
| Deductions = 0 | Sembunyikan baris deduksi |
| Font fallback | jsPDF default Helvetica support Latin |

---

## AI / Telegram Bot Integration

### Use Cases untuk Bot

| Skenario | Trigger | Aksi Bot |
|---|---|---|
| **Notifikasi slip baru** | Admin generate payslip → `payroll_audit_logs` INSERT | Kirim pesan ke Telegram group: "📄 Slip gaji untuk [N bulan] telah tersedia. Cek di /payroll" |
| **Pengiriman slip per employee** | Admin set status → `sent` | Kirim DM ke karyawan via Telegram (jika terdaftar) |
| **Reminder acknowledge** | Cron job (7 hari setelah sent) | Reminder: "🕐 Slip gaji [N] Anda belum di-acknowledge. Silakan cek di /karyawan/[username]" |
| **Report payroll bulanan** | End of month cron | Summary: "📊 Total payroll [bulan]: Rp X untuk Y karyawan. Rata-rata: Rp Z" |

### Arsitektur Notifikasi

```
Admin Page → Action (Send/Generate)
  │
  ├── updatePayslipStatus()  →  DB update  →  Audit log
  │                                       │
  │                               [polling by bot]
  │                                       │
  │                              yumi-ai-bot / yumi-supervisor-agent
  │                                       │
  │                              ┌────────┴────────┐
  │                              │ Telegram Channel │
  │                              │ /karyawan DM     │
  │                              └─────────────────┘
  │
  └── (Future) Edge Function webhook yang langsung panggil Telegram API
```

### Implementasi (Phase 2 — After Feature Launch)

**Options for delivery:**

1. **Supervisor Agent Polling** (existing `yumi-supervisor-agent`):
   - Poll `pos_payroll_audit_logs` WHERE `action='UPDATE' AND entity_type='payslips'`
   - Cek perubahan status → kirim notifikasi
   - Low effort, sudah ada infrastructure bot

2. **Edge Function Webhook**:
   - Buat edge function `notify-payslip`
   - Admin page panggil edge function setelah update status
   - Edge function kirim ke Telegram API langsung
   - Real-time, tapi butuh endpoint baru

3. **Cron Job via Hermes**:
   - Schedule cron: `0 9 1 * *` (day 1 every month) → cek payslip baru
   - Kirim report summary ke Telegram

**Recommended: Supervisor Agent (Option 1)** karena:
- Sudah ada `yumi-supervisor-agent` dengan akses Telegram
- Minimal additional code
- Bisa handle DM per employee

### Data Mapping

```ts
// Mapping employee → Telegram chat_id
// Dari: pos_staff_users.raw->>'telegramChatId' atau yumi_users
type EmployeeTelegramMap = {
  userId: string;
  telegramChatId: string;
  userName: string;
  isActive: boolean;
};
```

---

## Import/Export Symmetry

### Export: Bulk CSV untuk Akuntansi

Admin perlu export semua payslip untuk periode tertentu sebagai CSV (untuk diimport ke software akuntansi atau spreadsheet).

```csv
Periode,Nama Karyawan,Role,Gaji Tetap,Gaji Shift,Tunjangan,Bonus Lembur,Bonus Target,Denda,Total Gross,Potongan,Net Diterima,Status
Mei 2026,Budi Santoso,Chef,2000000,1000000,500000,300000,200000,100000,4000000,100000,3900000,Diterima
Mei 2026,Ani Wijaya,Waiter,0,1500000,300000,0,0,0,1800000,0,1800000,Diterima
```

**Implementation:**
```tsx
const exportPayslipCSV = (payslips: PayslipData[]) => {
  if (!payslips?.length) { toast.error("Tidak ada data untuk diexport"); return; }

  const headers = [
    "Periode","Nama Karyawan","Role",
    "Gaji Tetap","Gaji Shift","Tunjangan",
    "Bonus Lembur","Bonus Target",
    "Denda","Total Gross","Potongan",
    "Net Diterima","Status"
  ];

  const rows = payslips.map((p) => {
    const b = p.breakdown ?? {};
    return [
      p.period_name,
      p.user_name,
      b.role_name ?? "",
      b.monthly_fixed_salary ?? 0,
      b.total_shift_pay ?? 0,
      b.total_allowance ?? 0,
      b.total_overtime_bonus ?? 0,
      b.bonus_target?.total_bonus ?? 0,
      b.total_penalty ?? 0,
      p.gross_pay,
      p.deductions,
      p.net_pay,
      translateStatus(p.status),
    ].join(",");
  });

  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;header=present" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `payslip-export-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast.success(`${rows.length} payslip diexport sebagai CSV`);
};

const translateStatus = (s: string) => {
  const map: Record<string, string> = {
    generated: "Generated",
    sent: "Dikirim",
    acknowledged: "Diterima",
    disputed: "Dispute",
  };
  return map[s] ?? s;
};
```

### Export: Per Slip (PDF)

Sudah dibahas di PDF Design Spec section. Perbedaan antara PDF (per slip, visual) dan CSV (bulk, data-oriented):

| Aspek | PDF | CSV |
|---|---|---|
| **Target user** | Karyawan (self-view) | Admin, Akuntan |
| **Format** | Visual, A4, ready-to-print | Data mentah, bisa diolah |
| **Cakupan** | Per slip individu | Bulk per periode |
| **Detail** | Komponen gaji lengkap + rincian kehadiran | Flat rows, semua numeric |
| **Download trigger** | Tombol ⬇ per row | Tombol "Export CSV" di action bar |
| **Template** | Fixed design (korporat) | Flat table header |
| **Nama file** | `slip-gaji-[name]-[period].pdf` | `payslip-export-[date].csv` |

### Symmetry: Import ↔ Export

| Arah | Format | Ada? |
|---|---|---|
| **Export → Admin** | CSV (akuntansi) | ✅ Ya |
| **Export → Karyawan** | PDF (visual) | ✅ Ya |
| **Import → System** | N/A (slip gaji adalah generated doc) | ❌ Tidak perlu |

Tidak ada import symmetry untuk payslip karena payslip adalah **generated document** dari kalkulasi sistem (bukan data yang diinput manual). Data mentahnya (absensi, role rules) bisa diimport dari spreadsheet di halaman masing-masing (attendance import, role settings).

### Round-trip Validation

Jika nanti diperlukan export yang bisa di-reimport untuk audit/verifikasi:
- CSV ekspor menyertakan `id` payslip + `payroll_run_item_id`
- Pihak ketiga bisa verifikasi dengan me-reconcile antara CSV yang diexport dengan data di database

---

## Hardcode Audit

| Value | Source | Status |
|---|---|---|
| PDF design template | Hardcoded di lib file | ✅ OK — konsisten untuk semua slip |
| Currency format (IDR) | `Intl.NumberFormat("id-ID")` | ✅ Sudah di existing code |
| Status workflow | `generated → sent → acknowledged → disputed` | ✅ Dari DB constraint |
| Perusahaan nama "TENTREM KOFFIE" | Dari `siteSettings.storeName` | ⚠️ Ambil dari settings, jangan hardcode |
| Perusahaan alamat | Dari `siteSettings.storeAddress` | ⚠️ Ambil dari settings, jangan hardcode |
| PDF margin/spacing | Hardcoded di `jspdf` | ✅ OK — visual design constant |
| Status label mapping | `{generated, sent, acknowledged, disputed}` | ✅ Dari DB constraint |
| CSV header names | Hardcoded | ✅ OK — data field names |

---

## Risks & Mitigation

| Risk | Mitigation |
|---|---|
| **PDF library issue** — jspdf autotable mungkin perlu konfigurasi font Indonesia | Test dulu dengan karakter Indonesia, fallback ke font default |
| **Data inconsistency** — payslip status tidak sinkron dengan realitas | Audit log sudah ada di `pos.payroll_audit_logs` |
| **SQL injection** — `executePayrollSql` di frontend | CURRENT pattern, tapi hanya untuk admin auth'd. Jaga dengan validasi |
| **Performance** — ribuan payslip | Filter + pagination (limit 50 per page) |
| **Customer confusion** — karyawan lihat data orang lain | Filter payslip by `user_id` di `/karyawan/$username` |
| **PDF terlalu besar** — banyak komponen gaji | jsPDF output blob, download langsung (tidak disimpan di server) |
| **Telegram bot rate limit** — notifikasi massal | Batch sending dengan delay antar pesan |

---

## Verification Steps

1. **Build:** `cd /opt/djiwatentramapp && turbo build`
2. **Type check:** `cd apps/web && tsc --noEmit`
3. **Browser test admin:** `/admin/operational-team/payroll/slip` — cek loading, empty, data
4. **Browser test karyawan:** `/karyawan/budi` — cek payslip muncul
5. **PDF test:** Klik download → file terdownload, format benar, karakter Indonesia ok
6. **Status update:** Send → Acknowledged → Disputed — cek UI refresh
7. **CSV export:** Klik "Export CSV" → file dengan header benar
8. **Data consistency:** Bandingkan total net_pay di UI vs database

---

## Rencana Eksekusi

### Wave 1 — Paralel 🔥 (3 subagent simultan)
| # | Subagent | Task | File |
|---|---|---|---|
| 1 | 🔧 | Route files + sidebar link | slip.tsx, slip.lazy.tsx, operational-team.tsx |
| 2 | 🔧 | Karyawan profile — integrasi payslip real | karyawan.$username.lazy.tsx |
| 3 | 📄 | PDF generator lib | lib/payslip-pdf.ts |

### Wave 2 — Sequential (kamu sendiri)
| # | Task |
|---|---|
| 4 | Admin page: filter state, hooks, master table |
| 5 | Admin page: detail panel, status actions, generate button |
| 6 | Admin page: CSV export, bulk actions, summary footer |

### Wave 3 — Verifikasi
| # | Task |
|---|---|
| 7 | Build + typecheck |
| 8 | Browser test + PDF test |
