# Real-Time Payslip Auto-Compute + Inline Edit + Karyawan View

> **Goal:** Payslip di `/admin/operational-team/payroll/slip` otomatis terhitung dari data attendance tanpa klik manual. Admin cukup edit langsung jika ada kesalahan. Karyawan bisa lihat & download PDF di `/karyawan/$username` secara real-time.

**Architecture:** Pertahankan arsitektur payroll yang sudah ada (periods → runs → run_items → payslips). Tambah auto-trigger saat page load di sisi admin. Hapus tombol "Generate Slip" manual. Karyawan sudah punya section slip gaji — tinggal aktifkan download PDF.

**Prinsip:** Data yang sudah ada tidak diubah. Hanya menghilangkan friction + melengkapi fitur karyawan yang masih placeholder.

---

## 📋 Status Saat Ini

| Aspek | Admin `/payroll/slip` | Karyawan `/karyawan/$username` |
|-------|-----------------------|-------------------------------|
| **Payslip muncul** | ✅ Manual via "Generate Slip" | ✅ Otomatis via `useHybridPayslips` |
| **Real-time sync** | ❌ Harus klik generate | ✅ Sudah (via `useSupabaseLiveValue`) |
| **Download PDF** | ✅ Sudah berfungsi | ❌ **Placeholder:** "Fitur download akan segera tersedia" |
| **Auto-compute** | ❌ Belum ada | ✅ Tidak perlu (data dari admin) |
| **Inline edit** | ❌ Belum ada | ❌ Tidak perlu (read-only) |

---

## 🗂️ File yang Berubah

| File | Perubahan |
|------|-----------|
| `apps/web/src/hooks/use-hybrid-payroll-data.ts` | **Sedang** — tambah `autoDetectPeriodAndRun()`, `updatePayrollRunItem()`, `syncPayslipFromRunItem()` |
| `apps/web/src/routes/admin/operational-team/payroll/slip.lazy.tsx` | **Major** — auto-run logic, hapus tombol generate, inline edit |
| `apps/web/src/routes/karyawan.$username.lazy.tsx` | **Minor** — ganti placeholder download dengan PDF download nyata |

---

## 🧩 Detail Perubahan

### Task 1: Tambah fungsi auto-detect period & auto-run payroll

**File:** `apps/web/src/hooks/use-hybrid-payroll-data.ts`

Tambah fungsi baru di export (setelah `reversePayrollRun`):

```ts
/**
 * Auto-detect payroll period from attendance data and run payroll.
 * 
 * Strategy:
 * 1. Cari payroll_periods untuk bulan ini (cek nama period_name = "Mei 2026")
 * 2. Kalau tidak ada → auto-create period untuk bulan ini
 * 3. Kalau period ada tapi belum ada payroll_runs → auto generatePayrollRun
 * 4. Kalau run sudah ada completed → auto generatePayslipsForRun
 * 5. Kalau payslips sudah ada → skip (return 'skipped')
 */
export async function autoDetectPeriodAndRun(): Promise<{
  action: 'created' | 'ran' | 'generated' | 'skipped' | 'error';
  message: string;
  periodId?: string;
  runId?: string;
}> {
```

**SQL logic auto-detect:**

```sql
-- 1. Cek period untuk bulan ini
SELECT id, status FROM pos.payroll_periods 
WHERE period_name = to_char(CURRENT_DATE, 'FMMonth YYYY')
LIMIT 1;

-- 2. Jika tidak ada, auto-create
INSERT INTO pos.payroll_periods (period_name, start_date, end_date, status)
VALUES (
  to_char(CURRENT_DATE, 'FMMonth YYYY'),
  date_trunc('month', CURRENT_DATE)::date,
  (date_trunc('month', CURRENT_DATE) + interval '1 month - 1 day')::date,
  'open'
)
ON CONFLICT (period_name) DO NOTHING
RETURNING id;

-- 3. Cek apakah sudah ada payroll_runs untuk period ini
SELECT id, status FROM pos.payroll_runs 
WHERE payroll_period_id = '<period_id>'
ORDER BY run_date DESC LIMIT 1;

-- 4. Jika belum ada run → auto generatePayrollRun
-- 5. Jika run completed tapi belum ada payslip → auto generatePayslipsForRun
```

**Auto-run trigger di admin page (PayslipAdminPage):**

```tsx
const [autoTrigger, setAutoTrigger] = useState(0);

useEffect(() => {
  if (allPayslips === undefined) return; // masih loading
  if (allPayslips === null) return; // error

  if (allPayslips.length === 0) {
    setIsAutoProcessing(true);
    autoDetectPeriodAndRun().then((result) => {
      setIsAutoProcessing(false);
      if (result.action !== 'skipped' && result.action !== 'error') {
        setAutoTrigger((n) => n + 1);
        toast.success(result.message);
      }
    }).catch(() => setIsAutoProcessing(false));
  }
}, [allPayslips, autoTrigger]);
```

Key: trigger hanya sekali saat page mount (via `allPayslips.length === 0`). Setelah auto-run sukses, `autoTrigger` increment → refetch → payslip terlihat → useEffect tidak jalan lagi.

---

### Task 2: Hapus manual "Generate Slip" dari slip page admin

**File:** `apps/web/src/routes/admin/operational-team/payroll/slip.lazy.tsx`

**Hapus:**
- ✅ Import: `generatePayslipsForRun`, `approvePayrollRun`, `reversePayrollRun`
- ✅ Simpan: `updatePayslipStatus` (masih dipakai untuk send/acknowledge)
- ✅ Hapus: `runs` (useHybridPayrollRuns), `completedRuns` useMemo, `isGenerating` state
- ✅ Hapus: `handleGeneratePayslips` handler
- ✅ Hapus: Tombol "Generate Slip" (baris ~412-426)
- ✅ Simpan: export CSV, bulk send, filter, send/acknowledge status
- ✅ Ganti: empty state text dari `"Generate payslip dari payroll run yang sudah completed"` jadi `"Belum ada data absensi untuk periode ini. Slip gaji akan muncul otomatis setelah ada data kehadiran."`

**Tambah:**
- Import `autoDetectPeriodAndRun`
- State `[isAutoProcessing, setIsAutoProcessing]` + `[autoTrigger, setAutoTrigger]`
- Auto-run useEffect (detail di Task 1)

---

### Task 3: Inline editing pada payslip (admin only)

**File:** `apps/web/src/routes/admin/operational-team/payroll/slip.lazy.tsx`

**Fungsi baru di `use-hybrid-payroll-data.ts`:**

```ts
// Update single field di payroll_run_items
export async function updatePayrollRunItem(args: {
  runItemId: string;
  field: string;
  value: number;
}): Promise<any> {
  const sql = `
    UPDATE pos.payroll_run_items
    SET ${args.field} = ${args.value},
        updated_at = now()
    WHERE id = '${args.runItemId}'
    RETURNING *;
  `;
  return executeSql(sql);
}

// Sync perubahan dari run_items ke payslips
export async function syncPayslipFromRunItem(args: {
  runItemId: string;
  payslipId: string;
}): Promise<any> {
  const sql = `
    UPDATE pos.payslips
    SET 
      gross_pay = (SELECT gross_pay FROM pos.payroll_run_items WHERE id = '${args.runItemId}'),
      deductions = (SELECT deductions FROM pos.payroll_run_items WHERE id = '${args.runItemId}'),
      net_pay = (SELECT net_pay FROM pos.payroll_run_items WHERE id = '${args.runItemId}'),
      breakdown = (SELECT compensation_breakdown FROM pos.payroll_run_items WHERE id = '${args.runItemId}'),
      updated_at = now()
    WHERE id = '${args.payslipId}';
  `;
  return executeSql(sql);
}
```

**UI — inline edit cell di tabel:**

Tambah state:
```tsx
const [editingCell, setEditingCell] = useState<{
  payslipId: string;
  runItemId: string;
  field: string;
} | null>(null);
```

Kolom `Gaji Bruto` jadi klik-to-edit:
```tsx
{editingCell?.payslipId === payslip.id && editingCell.field === 'gross_pay' ? (
  <input
    type="number"
    className="w-20 h-7 px-1 text-right text-xs border rounded"
    defaultValue={payslip.gross_pay ?? 0}
    autoFocus
    onBlur={(e) => {
      const val = Number(e.target.value);
      if (isFinite(val) && val !== (payslip.gross_pay ?? 0)) {
        updatePayrollRunItem({ runItemId: payslip.payroll_run_item_id, field: 'gross_pay', value: val });
        syncPayslipFromRunItem({ runItemId: payslip.payroll_run_item_id, payslipId: payslip.id });
      }
      setEditingCell(null);
    }}
    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
  />
) : (
  <span 
    className="cursor-pointer hover:bg-muted/50 rounded px-1 -mx-1"
    onClick={() => setEditingCell({ payslipId: payslip.id, runItemId: payslip.payroll_run_item_id, field: 'gross_pay' })}
  >
    {fmtCurrencyShort(payslip.gross_pay ?? 0)}
  </span>
)}
```

**Kolom yang bisa diedit:**
1. `Gaji Bruto` (gross_pay) — di tabel
2. `Gaji Bersih` (net_pay) — di tabel  
3. **Di dialog detail:** tiap komponen breakdown (gaji tetap, shift pay, tunjangan, lembur, bonus, denda) → klik → edit → save langsung

---

### Task 4: Tambah auto-refresh indicator (admin)

**File:** `apps/web/src/routes/admin/operational-team/payroll/slip.lazy.tsx`

```tsx
{/* Auto-process indicator */}
{isAutoProcessing && (
  <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
    <Loader2 className="h-3 w-3 animate-spin" />
    Menghitung slip gaji dari data absensi...
  </div>
)}
{!isAutoProcessing && allPayslips && allPayslips.length > 0 && (
  <div className="flex items-center gap-1 px-1 text-[10px] text-emerald-600/70">
    <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
    Real-time dari absensi
  </div>
)}
```

---

### Task 5: Karyawan — real-time payslip dari admin (sudah jalan)

**File:** `apps/web/src/routes/karyawan.$username.lazy.tsx`

**Status saat ini (baris 122-126):**
```tsx
const myPayslips = useHybridPayslips(
  isUnlocked && staff ? { userId: staff._id } : undefined
);
```

✅ **Real-time sudah jalan.** `useHybridPayslips` menggunakan `useSupabaseLiveValue` yang auto-refetch ketika data `pos.payslips` berubah. Jadi ketika admin auto-generate payslip, karyawan langsung melihatnya tanpa refresh.

**Yang perlu diverifikasi:**
- Hook `fetchPayslips` (baris 131-144 di `use-hybrid-payroll-data.ts`) hanya filter by `user_id` dan `status` — ini aman karena tidak akses Management API
- Karyawan yang sudah login bisa melihat payslip sendiri karena filter by `userId`
- Tidak ada perubahan kode yang diperlukan — **already real-time**

---

### Task 6: Karyawan — download PDF payslip

**File:** `apps/web/src/routes/karyawan.$username.lazy.tsx`

**Perubahan:**

1. **Tambah import** di bagian atas:
```tsx
import { generatePayslipPDF, type PayslipData, type PayslipBreakdown } from "@/lib/payslip-pdf";
import { useHybridSiteSettings } from "@/hooks/use-hybrid-pos-data";
```

2. **Tambah settings** di komponen (setelah `myPayslips`):
```tsx
const settings = useHybridSiteSettings() as any;
const storeName = settings?.storeName || "TENTREM KOFFIE";
const storeAddress = settings?.storeAddress || "";
```

3. **Tambah handler** untuk download:
```tsx
const handleDownloadPayslip = useCallback(async (payslip: any) => {
  try {
    const breakdown: PayslipBreakdown = payslip.breakdown ?? {};
    const blob = generatePayslipPDF(
      {
        id: payslip.id,
        user_id: payslip.user_id,
        user_name: payslip.user_name,
        period_name: payslip.period_name,
        period_start: payslip.period_start,
        period_end: payslip.period_end,
        gross_pay: payslip.gross_pay ?? 0,
        deductions: payslip.deductions ?? 0,
        net_pay: payslip.net_pay ?? 0,
        status: payslip.status ?? "generated",
        sent_at: payslip.sent_at,
        acknowledged_at: payslip.acknowledged_at,
        breakdown,
      },
      breakdown,
      storeName,
      storeAddress
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `slip-gaji-${(payslip.user_name ?? "karyawan").toLowerCase().replace(/\s+/g, "-")}-${(payslip.period_name ?? "").toLowerCase().replace(/\s+/g, "-")}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("PDF berhasil diunduh");
  } catch (e: any) {
    toast.error(`Gagal mengunduh PDF: ${e.message}`);
  }
}, [storeName, storeAddress]);
```

4. **Ganti** placeholder button (baris ~393-400):
```tsx
{/* SEBELUM: */}
<Button ... onClick={() => toast.info("Fitur download akan segera tersedia")}>
  <span className="text-xs">⬇</span>
</Button>

{/* SESUDAH: */}
<Button
  variant="ghost"
  size="icon"
  className="rounded-lg h-8 w-8"
  onClick={() => handleDownloadPayslip(payslip)}
  title="Download PDF"
>
  <Download className="h-4 w-4" />
</Button>
```

5. **Tambah import** untuk icon `Download` di daftar lucide-react (baris 7-23).

---

### Task 7: Karyawan — pastikan payslip terlihat tanpa perlu unlock (opsional)

**Status:** Saat ini (baris 122-126), `myPayslips` hanya di-fetch kalau `isUnlocked = true`. Ini berarti:
- Karyawan harus login dulu
- Setelah login → otomatis unlock → payslip muncul

**Keputusan:** Biarkan seperti ini — payslip adalah data sensitif, harus login dulu sebelum lihat.

---

## 🔄 Urutan Eksekusi

```
   Task 1: autoDetectPeriodAndRun() + updatePayrollRunItem() + syncPayslipFromRunItem()
           di use-hybrid-payroll-data.ts
     │
   Task 2: slip.lazy.tsx — auto-run, hapus generate manual
     │
   Task 3: slip.lazy.tsx — inline editing cell
     │
   Task 4: slip.lazy.tsx — auto-refresh indicator
     │
  ┌──┴──┐
  │         │
Task 5    Task 6
(verify)  (karyawan PDF download)
  │         │
  └──┬──┘
     │
   Task 7: Build verification
```

---

## 🔄 Data Flow Real-Time

```
Attendance Logs (check_in/check_out)
       │
       ▼ (page load admin)
autoDetectPeriodAndRun() ←── dipanggil sekali di useEffect
       │
       ├── auto-create period bulan ini (jika belum ada)
       ├── auto generatePayrollRun()
       ├── auto generatePayslipsForRun()
       │
       ▼
       pos.payslips terisi
       │
       ├── ▶ admin: tampil di tabel → inline edit → sync ke payslips
       │
       └── ▶ karyawan: useHybridPayslips(userId)
                          → useSupabaseLiveValue → real-time muncul
                          → bisa download PDF
```

---

## 🧪 Cara Verifikasi

### Admin Side
1. **Buka** `/admin/operational-team/payroll/slip`
2. ✅ Loading indicator "Menghitung slip gaji dari data absensi..." muncul
3. ✅ Setelah selesai, payslip muncul langsung tanpa klik apapun
4. ✅ Klik cell Gaji Bruto → edit angka → Enter → berubah
5. ✅ Edit komponen di dialog detail → total berubah

### Karyawan Side  
6. **Buka** `/karyawan/<slug>` → login → unlock
7. ✅ Section "Slip Gaji" muncul dengan data yang sama dengan admin
8. ✅ Klik icon download → PDF terdownload dengan benar
9. ✅ Admin edit payslip → karyawan lihat perubahan real-time (setelah refresh/poll)

---

## ⚠️ Risiko & Catatan

| Risiko | Mitigasi |
|--------|----------|
| Auto-run gagal (Management API down) | Toast error + pesan "Coba refresh halaman" |
| Inline edit tidak sync ke payslip | `syncPayslipFromRunItem()` menjamin dua tabel sinkron |
| Period duplicate karena auto-create bentrok manual | `ON CONFLICT (period_name) DO NOTHING` |
| Multiple admin buka slip page → double run | Constraint `payroll_run_items_unique_per_run` mencegah duplikat |
| Karyawan lihat payslip orang lain | `useHybridPayslips` sudah filter by `userId` — aman |
| Tab corruption saat edit .tsx | Pakai `execute_code` + Python `open()`, bukan `patch` |

---

## 📊 Ringkasan Perubahan

| Task | File | Baris Ditambah | Baris Dihapus |
|------|------|---------------|---------------|
| 1 — autoDetectPeriodAndRun() | use-hybrid-payroll-data.ts | ~60 | 0 |
| 1 — updatePayrollRunItem() + syncPayslipFromRunItem() | use-hybrid-payroll-data.ts | ~40 | 0 |
| 2 — Auto-run logic + hapus generate | slip.lazy.tsx | ~40 | ~30 |
| 3 — Inline editing | slip.lazy.tsx | ~50 | 0 |
| 4 — Auto-refresh indicator | slip.lazy.tsx | ~10 | 0 |
| 5 — Verify real-time karyawan | karyawan.$username.lazy.tsx | 0 | 0 |
| 6 — Download PDF karyawan | karyawan.$username.lazy.tsx | ~35 | ~5 |
| **Total** | **3 files** | **~235** | **~35** |
