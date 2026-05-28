# Payslip Card Full Breakdown + Realtime Implementation Plan

> **For Hermes:** Implement task-by-task using subagent-driven-development.

**Goal:** Ubah card slip gaji di `/karyawan/[username]` dari compact (period + net pay saja) menjadi **detail card vertikal** yang menampilkan seluruh komponen gaji (gaji tetap, shift, tunjangan, bonus, denda, gross, net) — dengan data yang **realtime** update setiap kali karyawan check_out.

**Architecture:** Frontend-only change. Backend sudah punya trigger `payroll_accrual_on_check_out()` yang realtime update `pos.payroll_run_items` dan `pos.payslips` setiap check_out. `useSupabaseLiveValue` sudah subscribe ke `postgres_changes` di schema `pos`, jadi refetch otomatis. Tinggal ubah render card untuk menampilkan `payslip.breakdown` yang sudah tersedia.

**Tech Stack:** React, TypeScript, Tailwind, Framer Motion, TanStack Router

**Realtime sudah siap:**
1. Trigger `payroll_shift_accrual` → setiap check_out, hitung ulang run_items + payslip
2. `useSupabaseLiveValue('payroll-payslips:...')` → subscribe perubahan di schema `pos`
3. Skip update jika payslip sudah `sent/acknowledged/disputed`
4. UI akan refetch otomatis dalam <1 detik setelah DB berubah

---

### Task 1: Ubah Card Layout dari Horizontal ke Vertikal Detail

**Objective:** Transform setiap payslip card item dari compact horizontal (icon + period + net) jadi detail card vertikal yang menampilkan full breakdown.

**Files:**
- Modify: `apps/web/src/routes/karyawan.$username.lazy.tsx:465-495`

**Step 1: Pahami struktur data yang sudah tersedia**

Setiap `payslip` dari `useHybridPayslips()` sudah memiliki:
```ts
payslip.period_name        // "Mei 2026"
payslip.gross_pay          // 3500000
payslip.deductions         // 10000
payslip.net_pay            // 3490000
payslip.status             // "generated" | "sent" | "acknowledged" | "disputed"
payslip.sent_at
payslip.acknowledged_at
payslip.breakdown          // JSONB — selalu ada
payslip.breakdown.role_name
payslip.breakdown.monthly_fixed_salary   // Gaji Tetap
payslip.breakdown.shifts                 // Jumlah shift
payslip.breakdown.total_shift_pay        // Gaji Shift
payslip.breakdown.days_worked            // Hari kerja
payslip.breakdown.total_allowance        // Tunjangan Transportasi
payslip.breakdown.total_overtime_bonus   // Bonus Lembur
payslip.breakdown.bonus_target?.total_bonus  // Bonus Target
payslip.breakdown.total_penalty          // Denda Keterlambatan
```

**Step 2: Buat komponen `PayslipDetailCard` baru**

Di dalam file yang sama (`karyawan.$username.lazy.tsx`), sebelum komponen `StaffProfilePage`, tambahkan komponen helper:

```tsx
function PayslipDetailCard({
  payslip,
  onDownload,
}: {
  payslip: any;
  onDownload: (p: any) => void;
}) {
  const b = payslip.breakdown ?? {};
  const statusConfig: Record<string, { label: string; cls: string }> = {
    generated: { label: "Generated", cls: "bg-gray-100 text-gray-600" },
    sent: { label: "Dikirim", cls: "bg-blue-100 text-blue-600" },
    acknowledged: { label: "Diterima", cls: "bg-emerald-100 text-emerald-600" },
    disputed: { label: "Dispute", cls: "bg-red-100 text-red-600" },
  };
  const badge = statusConfig[payslip.status] ?? statusConfig.generated;

  const items: { label: string; value: number; color?: string }[] = [];
  if ((b.monthly_fixed_salary ?? 0) > 0) items.push({ label: "Gaji Tetap", value: b.monthly_fixed_salary });
  if ((b.total_shift_pay ?? 0) > 0) items.push({ label: `Gaji Shift (${b.shifts ?? 0} shift)`, value: b.total_shift_pay });
  if ((b.total_allowance ?? 0) > 0) items.push({ label: "Tunjangan Transportasi", value: b.total_allowance });
  if ((b.total_overtime_bonus ?? 0) > 0) items.push({ label: "Bonus Lembur", value: b.total_overtime_bonus, color: "text-emerald-600" });
  if ((b.bonus_target?.total_bonus ?? 0) > 0) items.push({ label: "Bonus Target", value: b.bonus_target.total_bonus, color: "text-emerald-600" });
  if ((b.total_penalty ?? 0) > 0) items.push({ label: "Denda Keterlambatan", value: -Math.abs(b.total_penalty), color: "text-red-600" });

  return (
    <div className="group rounded-xl border bg-card p-4 transition-all hover:border-primary/30 hover:bg-primary/[0.02]">
      {/* Header: Period + Status */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <FileText className="h-4 w-4" />
          </div>
          <div>
            <p className="font-bold text-xs">{payslip.period_name}</p>
            <p className="text-[10px] text-muted-foreground">{b.role_name ?? payslip.role_name ?? ""}</p>
          </div>
        </div>
        <span className={`rounded-md px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${badge.cls}`}>
          {badge.label}
        </span>
      </div>

      {/* Breakdown Items */}
      {items.length > 0 && (
        <div className="space-y-1 mb-3">
          {items.map((item, i) => (
            <div key={i} className="flex justify-between text-[11px]">
              <span className="text-muted-foreground">{item.label}</span>
              <span className={`font-semibold tabular-nums ${item.color ?? ""}`}>
                {item.value < 0
                  ? `-${formatCurrency(Math.abs(item.value))}`
                  : formatCurrency(item.value)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Divider */}
      <div className="border-t border-border/50 my-2" />

      {/* Gross & Net Summary */}
      <div className="space-y-1 mb-3">
        <div className="flex justify-between text-[11px]">
          <span className="text-muted-foreground">Total Gross</span>
          <span className="font-semibold tabular-nums">{formatCurrency(payslip.gross_pay ?? 0)}</span>
        </div>
        {(payslip.deductions ?? 0) > 0 && (
          <div className="flex justify-between text-[11px]">
            <span className="text-muted-foreground">Potongan</span>
            <span className="font-semibold tabular-nums text-red-600">-{formatCurrency(payslip.deductions)}</span>
          </div>
        )}
        <div className="flex justify-between text-sm font-bold pt-1 border-t border-border/30">
          <span>Net Diterima</span>
          <span className="text-emerald-600 tabular-nums">{formatCurrency(payslip.net_pay ?? 0)}</span>
        </div>
      </div>

      {/* Timestamps */}
      {payslip.sent_at && (
        <p className="text-[9px] text-muted-foreground/60 mb-2">
          Dikirim: {new Date(payslip.sent_at).toLocaleDateString("id-ID")}
          {payslip.acknowledged_at && ` · Diterima: ${new Date(payslip.acknowledged_at).toLocaleDateString("id-ID")}`}
        </p>
      )}

      {/* Download Button */}
      <Button
        variant="outline"
        size="sm"
        className="w-full rounded-lg text-[10px] font-bold h-8"
        onClick={() => onDownload(payslip)}
      >
        <Download className="mr-1.5 h-3 w-3" />
        Download PDF
      </Button>
    </div>
  );
}
```

**Step 3: Ganti render card lama dengan komponen baru**

Cari bagian payslip list di dalam `StaffProfilePage` (sekitar line 465-495). Ganti:

```tsx
// SEBELUM (lama):
return (
  <div
    key={payslip.id}
    className="group flex items-center justify-between rounded-xl border bg-card p-3 transition-all hover:border-primary/30 hover:bg-primary/[0.02]"
  >
    <div className="flex items-center gap-3 min-w-0">
      ...
    </div>
    ...
  </div>
);

// SESUDAH (baru):
return (
  <PayslipDetailCard
    key={payslip.id}
    payslip={payslip}
    onDownload={handleDownloadPayslip}
  />
);
```

**Step 4: Hapus deklarasi statusBadge lokal (sudah dipindah ke komponen)**

Di sekitar line 458-463, hapus block:
```tsx
const statusBadge = ({
  generated: { label: "Generated", cls: ... },
  ...
} as any)[payslip.status] ?? ...
```

**Step 5: Verifikasi build**

```bash
cd /opt/djiwatentramapp && npm run build -- --filter=web 2>&1 | tail -30
```
Expected: Build sukses tanpa error.

**Step 6: Commit**
```bash
cd /opt/djiwatentramapp
git add apps/web/src/routes/karyawan.$username.lazy.tsx
git commit -m "feat: payslip card full breakdown with realtime attendance tracking"
```

---

### Task 2: Verifikasi Realtime Behaviour

**Objective:** Pastikan card benar-benar update realtime ketika attendance berubah.

**Step 1: Cek bahwa `useHybridPayslips` sudah menggunakan `useSupabaseLiveValue`**

File: `apps/web/src/hooks/use-hybrid-payroll-data.ts:383-391`

Sudah otomatis — `useHybridPayslips` menggunakan `useSupabaseLiveValue` yang subscribe ke `postgres_changes` di schema `public, pos`. Setiap trigger update tabel `pos.payslips` atau `pos.payroll_run_items`, hook akan refetch.

**Step 2: Cek parameter filter user**

Di `StaffProfilePage`, cari bagaimana `myPayslips` dipanggil:

```tsx
const myPayslips = useHybridPayslips({ userId: staff._id }) as any[];
```

Pastikan userId di-pass dengan benar. Jika tidak ada filter userId, tambahkan:
```tsx
const myPayslips = useHybridPayslips(staff ? { userId: staff._id } : undefined) as any[];
```

**Step 3: Verifikasi end-to-end**

1. Buka `/karyawan/[slug]` sebagai karyawan (sudah login/unlocked)
2. Lakukan check_out melalui sistem absensi
3. Trigger `payroll_accrual_on_check_out()` berjalan di DB → update `payroll_run_items` + `payslips`
4. `useSupabaseLiveValue` mendeteksi perubahan → refetch data
5. Card payslip otomatis update dengan angka baru (shift count, gross, net, dll)

---

### Task 3: Polish — Loading & Empty State

**Objective:** Pastikan loading skeleton dan empty state proporsional dengan card baru yang lebih besar.

**Step 1: Update skeleton**

Di sekitar line 429-446, skeleton masih layout horizontal (flex). Ubah ke layout yang mirip dengan card vertikal:

```tsx
// Sebelum: compact horizontal skeleton
{[1, 2, 3].map((i) => (
  <div key={i} className="flex animate-pulse items-center justify-between rounded-xl border bg-card p-3">
    <div className="flex items-center gap-3">
      <div className="h-9 w-9 rounded-lg bg-muted" />
      <div className="space-y-1.5">
        <div className="h-3 w-32 rounded bg-muted" />
        <div className="h-2.5 w-20 rounded bg-muted" />
      </div>
    </div>
  </div>
))}

// Sesudah: detail card skeleton
{[1, 2, 3].map((i) => (
  <div key={i} className="animate-pulse rounded-xl border bg-card p-4 space-y-3">
    <div className="flex items-center gap-2">
      <div className="h-8 w-8 rounded-lg bg-muted" />
      <div className="space-y-1 flex-1">
        <div className="h-3 w-32 rounded bg-muted" />
        <div className="h-2.5 w-20 rounded bg-muted" />
      </div>
      <div className="h-5 w-16 rounded bg-muted" />
    </div>
    {[1, 2, 3].map((j) => (
      <div key={j} className="flex justify-between">
        <div className="h-3 w-28 rounded bg-muted" />
        <div className="h-3 w-16 rounded bg-muted" />
      </div>
    ))}
    <div className="h-8 w-full rounded-lg bg-muted" />
  </div>
))}
```

**Step 2: Verifikasi build**
```bash
cd /opt/djiwatentramapp && npm run build -- --filter=web 2>&1 | tail -30
```

**Step 3: Commit**
```bash
cd /opt/djiwatentramapp
git add apps/web/src/routes/karyawan.$username.lazy.tsx
git commit -m "fix: update skeleton to match new payslip card layout"
```

---

## Ringkasan

| Area | Status | Action |
|---|---|---|
| **Backend Realtime** | ✅ Sudah siap | Trigger `payroll_accrual_on_check_out()` update payslip setiap check_out |
| **Frontend Data** | ✅ Sudah siap | `useHybridPayslips` + `useSupabaseLiveValue` refetch otomatis |
| **Card UI** | ❌ Perlu diubah | Compact → Detail vertikal dengan full breakdown |
| **Loading Skeleton** | ❌ Perlu diubah | Sesuaikan dengan layout card baru |

**Total: ~30 menit implementasi, 2 file touched (semua di frontend), 2 commits.**
