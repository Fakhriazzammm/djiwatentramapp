# Plan: Dashboard Operasional `/admin/operational-team` — Performance & Data Center

## Goal

Mengubah halaman indeks `/admin/operational-team/` (saat ini redirect ke `/admin/operational-team/karyawan`) menjadi **dashboard operasional** berisi data real-time, chart performa, ringkasan kehadiran staf, dan insight tim. Halaman `/admin/operational-team/karyawan` tetap sebagai halaman manajemen pengguna (SettingsPage).

## Current Context

### Route Structure

```
/admin/operational-team              → Layout parent (Outlet) — TETAP
/admin/operational-team/             → INDEX route → [BARU: Dashboard]
/admin/operational-team/karyawan     → SettingsPage (manajemen pengguna) — TETAP
/admin/operational-team/attendance   → Data Absensi — TETAP
/admin/operational-team/attendance/pengaturan → Shift & Lokasi — TETAP
/admin/operational-team/payroll      → Gaji & Role — TETAP
/admin/operational-team/register/*   → Register Karyawan — TETAP
```

### Data Sources Available

| Hook | Data | Real-time |
|---|---|---|
| `useHybridShiftStatus()` | Shift aktif, all shifts, revenue per shift, cash discrepancy | Live |
| `useHybridCurrentlyInStore()` | Staf yang sedang clock-in (user_id, name, checkInTime) | Live |
| `useHybridPublicUsers()` | Semua staf aktif (name, role, initial, hasFace) | Live |
| `useHybridStaffStats(userId, month, year)` | Jam kerja, attendance rate, days worked per staf | Query |
| `useHybridStaffStatsToday(userId)` | Jam kerja hari ini per staf | Query |
| `useHybridStaffLogs()` | Raw attendance logs | Live |
| `useHybridAdminAttendanceLogs(n)` | Admin view attendance logs | Live |
| `useHybridDashboardStats()` | Orders, revenue, low stock, anomalies | Live |
| `useHybridPayrollReport({month, year})` | Payroll summary per period | Query |
| `useHybridMayarConfig()` | Payment gateway config | Query |

### Existing Reusable Components

| Komponen | Sumber | Bisa Digunakan Untuk |
|---|---|---|
| `ShiftDetailModal` | `admin/-components/` | Detail shift popup |
| `PeriodComparisonCards` | `admin/finance/-components/` | Perbandingan periode |
| `TrendChart` | `admin/finance/-components/` | Chart tren |
| `ExpenseCategoryPieChart` | `admin/finance/-components/` | Distribusi pie chart |
| `StatCard` (pattern) | `admin/index.lazy.tsx` | Kartu statistik |
| `StatusRow` (pattern) | `admin/index.lazy.tsx` | Baris status |
| `Skeleton` | `components/ui/` | Loading state |
| `Badge`, `Button`, `Card` | `components/ui/` | UI umum |

### Sidebar Navigasi Saat Ini

```
Tim Operasional (collapsible)
├── 👥 Karyawan     → /admin/operational-team/karyawan
├── 📊 Absensi      → /admin/operational-team/attendance
├── 💰 Gaji & Role  → /admin/operational-team/payroll
├── 👤 Register     → /admin/operational-team/register
├── 📋 Onboarding   → /admin/operational-team/register/onboarding
├── ✍️ Kontrak      → /admin/operational-team/register/contract
└── 📄 Riwayat      → /admin/operational-team/register/riwayat
```

## Proposed Approach — Referensi dari Admin Dashboard

Admin dashboard (`/admin/`) adalah target kualitas visual + fungsional yang sama:

- **Layout**: Grid cards, fade-in animation, skeleton loading
- **Data**: `useHybridDashboardStats()` + `useHybridShiftStatus()`
- **Chart**: Recharts library sudah ter-install
- **Framework**: Tailwind CSS, framer-motion, lucide-react

Dashboard operasional akan mengikuti pola yang sama dengan data yang relevan untuk manajemen tim.

## Dashboard Sections

### 1. 🟢 Status Real-time (Hero Section)

**Konten:**
- **Shift Saat Ini** — nama shift, kasir, durasi (dari `useHybridShiftStatus().ongoingShift`)
- **Staf di Toko** — jumlah staf yang sedang clock-in (dari `useHybridCurrentlyInStore()`)
- **Status Toko** — Buka/Tutup (dari `useHybridShiftStatus().isOpen`)
- **Jam Kerja Hari Ini** — akumulasi jam dari semua staf yang clock-in

**Layout:** 4 kartu horizontal di hero, sama seperti admin dashboard.

**States:**
- Loading: Skeleton bars
- Empty: "Belum ada shift aktif"
- Error: toast + fallback "-"

### 2. 👥 Kehadiran Staf Hari Ini

**Konten:**
- Tabel/list staf yang sudah clock-in:
  - Nama + role
  - Waktu clock-in (berapa jam yang lalu)
  - Status (masuk / istirahat? / sudah pulang)
  - Total jam kerja hari ini (dari `useHybridStaffStatsToday(userId)`)
- Staf yang BELUM clock-in (berdasarkan daftar staf aktif minus yang sedang di toko)

**Data flow:** `useHybridPublicUsers()` → filter dengan `useHybridCurrentlyInStore()` → untuk yang sedang di toko, panggil `useHybridStaffStatsToday(userId)` untuk detail jam.

**Layout:** Kartu dengan daftar, per item ada avatar (initial), nama, role badge, jam, indikator status.

**States:**
- Loading: Skeleton list (5 item)
- Empty: "Belum ada staf yang masuk hari ini"
- Error: Fallback dengan data parsial

### 3. 📊 Ringkasan Shift Terkini

**Konten:**
- Shift terakhir (dari `useHybridShiftStatus().allShifts`):
  - Nama shift + kasir
  - Revenue (total, cash, QRIS)
  - Modal awal vs setoran akhir
  - Durasi shift
- Status: Masih berjalan / Selesai

**Layout:** Kartu dengan grid info. Klik buka `ShiftDetailModal`.

**States:**
- Loading: Skeleton shift card
- Empty: "Belum ada data shift"
- Error: Fallback

### 4. 📈 Performa Karyawan (Bulan Ini)

**Konten:**
- Per staf:
  - Total jam kerja (dari `useHybridStaffStats` dipanggil per staf)
  - Attendance rate %
  - Hari kerja
  - Bonus tier (jika mencapai target)
- Sorting: Paling banyak jam atau attendance rate tertinggi

**Data flow:** `useHybridPublicUsers()` → loop panggil `useHybridStaffStats(userId, month, year)` untuk tiap staf aktif.

**Optimasi:** Batch 5 staf dulu (top), dengan tombol "Lihat Semua" yang navigasi ke `/admin/operational-team/attendance`.

**Layout:** Kartu dengan mini bar chart per staf + ranking berdasarkan jam kerja.

**States:**
- Loading: Skeleton 5 item
- Empty: "Belum ada data absensi bulan ini"
- Error: Data dengan partial result

### 5. ⚠️ Anomali & Alert (Opsional — fase 2)

**Konten:**
- Shift discrepancy (dari `useHybridShiftStatus().allShifts` → cek cash discrepancy)
- Anomalies (dari `useHybridDashboardStats().anomalies`)
- Karyawan tanpa clock-out / shift bermasalah

**Layout:** Kartu alert dengan severity badges (high/medium).

## Step-by-Step Plan

### Step 1: Ubah index route dari redirect ke dashboard

**File:** `/opt/djiwatentramapp/apps/web/src/routes/admin/operational-team/index.lazy.tsx`

- Hapus `<Navigate>` redirect
- Ganti dengan komponen `OperationalTeamDashboard`
- Import hooks: `useHybridShiftStatus`, `useHybridCurrentlyInStore`, `useHybridPublicUsers`, `useHybridStaffStatsToday`, `useHybridStaffStats`, `useHybridDashboardStats`

### Step 2: Buat komponen dashboard sections

Semua komponen bisa dibuat **inline** di `index.lazy.tsx` atau di file terpisah `-components/OperationalDashboard.tsx`. Saya rekomendasikan file terpisah untuk maintainability.

**File baru:** `/opt/djiwatentramapp/apps/web/src/routes/admin/operational-team/-components/OperationalDashboard.tsx`

Subkomponen yang dibuat:
| Komponen | Fungsi |
|---|---|
| `OperationalDashboard` | Container utama |
| `RealtimeStatusSection` | Hero cards (shift, staf, status) |
| `StaffAttendanceSection` | Daftar kehadiran hari ini |
| `ShiftSummarySection` | Ringkasan shift |
| `StaffPerformanceSection` | Ranking performa bulan ini |
| `AnomalyAlertSection` | Anomalies & alerts (fase 2) |

### Step 3: Optimasi data fetching

Karena `useHybridStaffStats` perlu dipanggil per staf (N panggilan), ada 2 opsi:

| Opsi | Pro | Kontra |
|---|---|---|
| **A. Panggil per staf** (N hooks) | Akurat, real-time | Lambat jika >10 staf |
| **B. Satu RPC bulk** | Cepat, 1 panggilan | Perlu buat RPC/view baru di Supabase |

**Rekomendasi: Opsi A untuk MVP** — hanya tampilkan 5 staf teratas. Tambah tombol "Lihat Semua" ke attendance.

### Step 4: Update sidebar navigation

Tambahkan link ke dashboard di sidebar, idealnya sebagai item pertama di submenu Tim Operasional (sebelum Karyawan).

**File:** `/opt/djiwatentramapp/apps/web/src/routes/admin/route.tsx`

Tambahkan:
- Collapsed nav: `<DesktopNavLink icon={LayoutDashboard} label="Dashboard" to="/admin/operational-team" />`
- Subnav: `<DesktopSubNavLink icon={LayoutDashboard} label="Dashboard" to="/admin/operational-team" />`

Atau, gunakan `/admin/operational-team` sebagai root dengan subtle indicator (default landing).

### Step 5: Tambahkan breadcrumb

**File:** `/opt/djiwatentramapp/apps/web/src/routes/admin/route.tsx`

`"/admin/operational-team": "Dashboard Tim"` sudah ada sebagai "Tim Operasional", cukup diganti atau dibiarkan.

## UI/UX Specification

### Layout Grid

```
┌──────────────────────────────────────┐
│         🟢 Status Real-time          │
│  [Shift] [Staf] [Jam] [Status]      │
├──────────────────────┬───────────────┤
│  👥 Kehadiran Hari   │ 📊 Performa   │
│  Ini                 │ Bulan Ini     │
│                      │               │
│  • Nama    ⏱ 5j     │ #1 A: 160j 92%│
│  • Nama    ⏱ 3j     │ #2 B: 145j 88%│
│  • Nama    ❌ Absen  │ #3 C: 130j 80%│
│                      │               │
├──────────────────────┴───────────────┤
│  📊 Ringkasan Shift Terkini          │
│  Shift Pagi | Kasir: Ayu | Rp 2.5jt │
└──────────────────────────────────────┘
```

### Visual Design Rules

- **Card style:** `rounded-xllll border border-border bg-card p-4 md:p-6 shadow-sm`
- **Animation:** `fade-in slide-in-from-bottom-4 animate-in duration-500` (sama seperti SettingsPage)
- **Loading:** Skeleton dengan pulse (sama seperti admin dashboard)
- **Icons:** Lucide-react (sama seperti yang sudah dipakai)
- **Typography:** Sama dengan admin dashboard (text-sm, font-bold, text-muted-foreground)

### States per Section

| Section | Loading | Empty | Error |
|---|---|---|---|
| Status | Skeleton 4 cards horizontal | "Tutup" fallback | "—" fallback |
| Kehadiran | Skeleton 5 rows | "Belum ada staf masuk" | Partial data |
| Performa | Skeleton 5 rows | "Belum ada data bulan ini" | Partial data |
| Shift | Skeleton card | "Belum ada shift" | Fallback |

## Files Likely to Change

| File | Action |
|---|---|
| `.../operational-team/index.lazy.tsx` | **MODIFY** — dari redirect jadi dashboard |
| `.../operational-team/-components/OperationalDashboard.tsx` | **CREATE** — semua komponen dashboard |
| `.../admin/route.tsx` | **MODIFY** — tambah sidebar link Dashboard |
| `routeTree.gen.ts` | **AUTO** — regenerate |

## Integration Points

| Integration | Detail |
|---|---|
| **Settings integration** | Shift schedules & location settings tetap di `/attendance/pengaturan` |
| **Payroll integration** | Data jam kerja di dashboard bersumber dari attendance logs yang sama dengan payroll |
| **Absensi integration** | Tombol "Lihat Semua" di performa → `/attendance` atau `/attendance/pengaturan` |
| **No AI/Telegram/bot** | Dashboard ini murni internal admin |

## Data Flow

```
attendance_logs (pos_attendance_logs)
    → useHybridStaffStats() → jam kerja, attendance rate, days worked
    → useHybridStaffStatsToday() → jam kerja hari ini per staf
    
shift_operations (pos_shift_operations)  
    → useHybridShiftStatus() → ongoing shift, all shifts, revenue
    
pos_users_public (view)
    → useHybridPublicUsers() → daftar staf aktif
    → useHybridCurrentlyInStore() → staf yang sedang clock-in
    
site_settings
    → shift schedules, attendance lat/lng/radius
```

## Risks & Tradeoffs

| Risk | Mitigasi |
|---|---|
| N panggilan `useHybridStaffStats` untuk banyak staf | Batasi ke 5 staf dulu. Jika performa jelek, buat RPC bulk |
| Dashboard berat karena banyak hook | Setiap hook pakai `useSupabaseLiveValue` yang sharing cache |
| Konflik dengan operasional-team layout | Index route sudah benar di bawah parent layout — aman |
| Overlap dengan admin dashboard | Admin dashboard fokus financial & orders. Operational dashboard fokus tim & shift — komplementer |

## Implementation Checklist

- [ ] Buat `OperationalDashboard.tsx` dengan subkomponen
- [ ] Ubah `index.lazy.tsx` dari redirect ke dashboard
- [ ] Register route tree
- [ ] Update sidebar (tambah link Dashboard ke submenu)
- [ ] Loading/Empty/Error states untuk setiap section
- [ ] Link navigasi ke halaman terkait (Lihat Semua → attendance, dll.)
- [ ] Verifikasi tidak broken link

---

## Expanded Detail: Implementasi Komponen + Pseudocode

### A. OperationalDashboard.tsx — Container Utama

File baru: `/opt/djiwatentramapp/apps/web/src/routes/admin/operational-team/-components/OperationalDashboard.tsx`

```tsx
import { useState, useMemo, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Clock, Users, TrendingUp, CalendarClock,
  UserCheck, ArrowUpRight, AlertTriangle,
} from "lucide-react";
import { createClient } from "@/lib/client";
import { fetchStaffStats } from "@/hooks/use-hybrid-attendance-data";
import {
  useHybridShiftStatus,
  useHybridDashboardStats,
} from "@/hooks/use-hybrid-pos-data";
import {
  useHybridCurrentlyInStore,
  useHybridPublicUsers,
} from "@/hooks/use-hybrid-attendance-data";

// ─── TYPES ───
type ShiftStatusRecord = any;
type StaffRecord = { _id: string; name: string; roleName?: string; initial?: string };

// ─── MAIN COMPONENT ───
export default function OperationalDashboard() {
  const shiftStatus = useHybridShiftStatus();
  const dashboardStats = useHybridDashboardStats();
  const currentlyIn = useHybridCurrentlyInStore();
  const allStaff = useHybridPublicUsers();

  const now = new Date();
  const thisMonth = now.getMonth() + 1;
  const thisYear = now.getFullYear();

  const absentStaff = useMemo(() => {
    if (!allStaff || !currentlyIn) return [];
    const inStoreIds = new Set(currentlyIn.map((s: any) => s._id));
    return allStaff.filter((s: any) => !inStoreIds.has(s._id));
  }, [allStaff, currentlyIn]);

  return (
    <div className="space-y-6 fade-in slide-in-from-bottom-4 animate-in duration-500">
      <RealtimeStatusSection shiftStatus={shiftStatus} currentlyIn={currentlyIn} dashboardStats={dashboardStats} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <StaffAttendanceSection currentlyIn={currentlyIn} allStaff={allStaff} absentStaff={absentStaff} />
        <StaffPerformanceSection allStaff={allStaff} month={thisMonth} year={thisYear} />
      </div>
      <ShiftSummarySection shiftStatus={shiftStatus} />
    </div>
  );
}
```

### B. RealtimeStatusSection — 4 Hero Cards

```tsx
function RealtimeStatusSection({ shiftStatus, currentlyIn, dashboardStats }: any) {
  if (!shiftStatus || !currentlyIn || !dashboardStats) {
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-xllll border bg-card p-4">
            <Skeleton className="h-3 w-20 mb-2" />
            <Skeleton className="h-7 w-32 mb-1" />
            <Skeleton className="h-3 w-24" />
          </div>
        ))}
      </div>
    );
  }

  const ongoing = shiftStatus?.ongoingShift;
  const staffCount = currentlyIn?.length ?? 0;
  const isOpen = shiftStatus?.isOpen ?? false;

  const cards = [
    {
      icon: Clock, label: "Shift Aktif",
      value: ongoing?.shiftName ?? "—",
      sub: ongoing ? `${ongoing.cashierName} · ${formatDuration(ongoing.startTime)}` : "Tidak ada shift aktif",
      color: "text-emerald-600 bg-emerald-100 dark:bg-emerald-950/30",
    },
    {
      icon: Users, label: "Staf di Toko",
      value: `${staffCount} orang`,
      sub: staffCount > 0 ? "Sedang bekerja" : "Belum ada yang masuk",
      color: "text-blue-600 bg-blue-100 dark:bg-blue-950/30",
    },
    {
      icon: CalendarClock, label: "Status Toko",
      value: isOpen ? "BUKA" : "TUTUP",
      sub: isOpen ? `Sejak ${formatTime(ongoing?.startTime)}` : shiftStatus?.latestAkhir ? `Tutup sejak ${formatTime(shiftStatus.latestAkhir)}` : "—",
      color: isOpen ? "text-emerald-600 bg-emerald-100" : "text-red-600 bg-red-100",
    },
    {
      icon: TrendingUp, label: "Revenue Hari Ini",
      value: formatCurrency(dashboardStats?.todayRevenue ?? 0),
      sub: `${dashboardStats?.todayOrders ?? 0} pesanan`,
      color: "text-amber-600 bg-amber-100 dark:bg-amber-950/30",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {cards.map((card) => (
        <div key={card.label} className="rounded-xllll border border-border bg-card p-4 shadow-sm transition-all hover:shadow-md">
          <div className="flex items-center gap-2 mb-3">
            <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${card.color}`}>
              <card.icon className="h-4 w-4" />
            </div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{card.label}</span>
          </div>
          <p className="text-lg font-black tracking-tight">{card.value}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{card.sub}</p>
        </div>
      ))}
    </div>
  );
}
```

### C. StaffAttendanceSection — Daftar Kehadiran Hari Ini

```tsx
function StaffAttendanceSection({ currentlyIn, allStaff, absentStaff }: any) {
  if (!currentlyIn || !allStaff) {
    return (
      <CardShell title="Kehadiran Hari Ini" icon={UserCheck}>
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3 py-2">
            <Skeleton className="h-8 w-8 rounded-full" />
            <div className="flex-1 space-y-1">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
        ))}
      </CardShell>
    );
  }

  return (
    <CardShell title="Kehadiran Hari Ini" icon={UserCheck}>
      {currentlyIn.length === 0 && (
        <p className="py-4 text-center text-sm text-muted-foreground">Belum ada staf yang masuk hari ini</p>
      )}
      <div className="space-y-2">
        {currentlyIn.slice(0, 8).map((staff: any) => (
          <StaffRow key={staff._id} name={staff.name} status="check_in" timestamp={staff.checkInTime} />
        ))}
      </div>

      {absentStaff.length > 0 && (
        <>
          <div className="my-2 border-t border-border pt-3">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Belum Masuk ({absentStaff.length})
            </p>
            {absentStaff.slice(0, 3).map((staff: any) => (
              <StaffRow key={staff._id} name={staff.name} role={staff.roleName} status="absent" />
            ))}
            {absentStaff.length > 3 && (
              <p className="pt-1 text-center text-xs text-muted-foreground">+{absentStaff.length - 3} lainnya</p>
            )}
          </div>
        </>
      )}
    </CardShell>
  );
}

function StaffRow({ name, role, status, timestamp }: any) {
  const hoursAgo = timestamp ? Math.round((Date.now() - timestamp) / (1000 * 60 * 60)) : null;
  return (
    <div className="flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/50">
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
        status === "check_in" ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"
      }`}>
        {(name?.charAt(0) ?? "?").toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{name}</p>
        {role && <p className="text-[10px] text-muted-foreground">{role}</p>}
      </div>
      <div className="shrink-0 text-right">
        {status === "check_in" ? (
          <>
            <p className="text-xs font-bold text-emerald-600">Sedang Bekerja</p>
            {hoursAgo !== null && <p className="text-[10px] text-muted-foreground">{hoursAgo}j yang lalu</p>}
          </>
        ) : (
          <p className="text-xs text-muted-foreground">Belum Masuk</p>
        )}
      </div>
    </div>
  );
}
```

### D. StaffPerformanceSection — Ranking Performa Bulan Ini

```tsx
function StaffPerformanceSection({ allStaff, month, year }: any) {
  const topStaff = useMemo(() => allStaff?.slice(0, 5) ?? [], [allStaff]);
  const [staffStats, setStaffStats] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const promises = topStaff.map(async (staff: any) => {
      try {
        const supabase = createClient();
        const startOfMonth = new Date(year, month - 1, 1).getTime();
        const endOfMonth = new Date(year, month, 1).getTime();
        const { data } = await supabase
          .from("pos_attendance_logs")
          .select("*")
          .eq("userId", staff._id)
          .gte("timestamp", startOfMonth)
          .lt("timestamp", endOfMonth)
          .order("timestamp", { ascending: true });
        const logs = data ?? [];
        const uniqueDays = new Set<string>();
        let totalMs = 0;
        for (let i = 0; i < logs.length; i++) {
          const entry: any = logs[i];
          if (entry.type === "check_in") {
            uniqueDays.add(new Date(entry.timestamp).toDateString());
            if (i + 1 < logs.length && logs[i + 1].type === "check_out") {
              totalMs += logs[i + 1].timestamp - entry.timestamp;
              i++;
            }
          }
        }
        const daysInMonth = new Date(year, month, 0).getDate();
        return {
          userId: staff._id,
          totalHours: Math.round((totalMs / (1000 * 60 * 60)) * 10) / 10,
          daysWorked: uniqueDays.size,
          attendanceRate: Math.min(100, Math.round((uniqueDays.size / daysInMonth) * 100)),
        };
      } catch { return null; }
    });
    Promise.all(promises).then((results) => {
      if (!cancelled) {
        const map: Record<string, any> = {};
        results.filter(Boolean).forEach((r: any) => { map[r.userId] = r; });
        setStaffStats(map);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [topStaff, month, year]);

  const ranked = useMemo(
    () => topStaff
      .map((s: any) => ({ ...s, stats: staffStats[s._id] }))
      .filter((s: any) => s.stats)
      .sort((a: any, b: any) => (b.stats?.totalHours ?? 0) - (a.stats?.totalHours ?? 0)),
    [topStaff, staffStats]
  );

  return (
    <CardShell title="Performa Bulan Ini" icon={TrendingUp}>
      {loading ? (
        [1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3 py-2">
            <Skeleton className="h-6 w-6 rounded-full" />
            <div className="flex-1 space-y-1">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-2 w-full" />
            </div>
          </div>
        ))
      ) : ranked.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">Belum ada data absensi bulan ini</p>
      ) : (
        <div className="space-y-3">
          {ranked.map((staff: any, idx: number) => {
            const maxHours = ranked[0]?.stats?.totalHours ?? 1;
            const barPct = Math.min(100, (staff.stats.totalHours / maxHours) * 100);
            return (
              <div key={staff._id}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="shrink-0 text-xs font-bold text-muted-foreground">#{idx + 1}</span>
                    <p className="truncate text-sm font-semibold">{staff.name}</p>
                  </div>
                  <p className="shrink-0 text-xs font-bold tabular-nums">
                    {staff.stats.totalHours}j · {staff.stats.attendanceRate}%
                  </p>
                </div>
                <div className="h-1.5 w-full rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${barPct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-4 pt-3 border-t border-border">
        <Link to="/admin/operational-team/attendance" className="flex items-center justify-center gap-1 text-xs font-semibold text-primary hover:underline">
          Lihat Semua <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>
    </CardShell>
  );
}
```

### E. CardShell — Wrapper Konsisten

```tsx
function CardShell({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <div className="rounded-xllll border border-border bg-card p-4 md:p-6 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </div>
        <h3 className="font-bold text-sm uppercase tracking-wider">{title}</h3>
      </div>
      {children}
    </div>
  );
}
```

### F. ShiftSummarySection — Ringkasan Shift Terkini

```tsx
function ShiftSummarySection({ shiftStatus }: any) {
  const allShifts = shiftStatus?.allShifts ?? [];
  const latestShift = allShifts[0];

  if (!shiftStatus) return <Skeleton className="h-32 w-full rounded-xllll" />;

  return (
    <section className="rounded-xllll border border-border bg-card p-4 md:p-6 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Clock className="h-4 w-4" />
        </div>
        <h3 className="font-bold text-sm uppercase tracking-wider">Ringkasan Shift</h3>
      </div>

      {!latestShift ? (
        <p className="py-4 text-center text-sm text-muted-foreground">Belum ada data shift</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <InfoItem label="Shift" value={`${latestShift.shiftName} · ${latestShift.cashierName}`} />
          <InfoItem label="Revenue" value={formatCurrency(latestShift.revenue ?? 0)} />
          <InfoItem label="Cash" value={formatCurrency(latestShift.cashRevenue ?? 0)} />
          <InfoItem label="QRIS" value={formatCurrency(latestShift.qrisRevenue ?? 0)} />
          <InfoItem label="Durasi" value={latestShift.endTime ? formatDuration(latestShift.startTime, latestShift.endTime) : "Masih berjalan"} />
          <InfoItem label="Modal Awal" value={formatCurrency(latestShift.modalAwal ?? 0)} />
          <InfoItem label="Setoran Akhir" value={formatCurrency(latestShift.setoranAkhir ?? 0)} />
          <InfoItem label="Status" value={latestShift.endTime ? "Selesai" : "Aktif"} highlight={!latestShift.endTime} />
        </div>
      )}
    </section>
  );
}

function InfoItem({ label, value, highlight }: any) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`text-sm font-semibold ${highlight ? "text-emerald-600" : ""}`}>{value}</p>
    </div>
  );
}
```

### G. Helpers

```tsx
function formatDuration(startTime: number, endTime?: number): string {
  const end = endTime ?? Date.now();
  const ms = end - startTime;
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}j ${minutes}m`;
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(amount);
}
```

## Expanded Detail: Supabase View/RPC untuk Bulk Staff Stats

### Masalah

`useHybridStaffStats()` dipanggil per staf 1-to-1. Untuk dashboard performa dengan banyak staf, butuh 1 panggilan bulk.

### Opsi A: Buat Supabase View `pos_staff_monthly_stats`

```sql
CREATE OR REPLACE VIEW pos_staff_monthly_stats AS
SELECT
  u._id AS user_id,
  u.name AS user_name,
  r.name AS role_name,
  EXTRACT(YEAR FROM TO_TIMESTAMP(l.timestamp / 1000))::int AS year,
  EXTRACT(MONTH FROM TO_TIMESTAMP(l.timestamp / 1000))::int AS month,
  COUNT(DISTINCT CASE WHEN l.type = 'check_in'
    THEN DATE(TO_TIMESTAMP(l.timestamp / 1000))
  END) AS days_worked,
  SUM(CASE WHEN l.type = 'check_in' AND next_l.type = 'check_out'
    THEN (next_l.timestamp - l.timestamp) / 3600000.0 ELSE 0 END
  ) AS total_hours
FROM pos_users u
JOIN pos_attendance_logs l ON l."userId" = u._id
LEFT JOIN LATERAL (
  SELECT type, timestamp FROM pos_attendance_logs
  WHERE "userId" = l."userId" AND timestamp > l.timestamp AND type = 'check_out'
  ORDER BY timestamp ASC LIMIT 1
) next_l ON true
WHERE u."isActive" = true
GROUP BY u._id, u.name, r.name, year, month;
```

**Pro:** 1 query = data semua staf
**Kontra:** Perlu migrasi SQL, tidak real-time

### Opsi B: Buat Supabase RPC `get_staff_monthly_stats`

```sql
CREATE OR REPLACE FUNCTION get_staff_monthly_stats(p_year int, p_month int)
RETURNS TABLE (user_id text, user_name text, total_hours numeric, days_worked int, attendance_rate numeric)
LANGUAGE SQL STABLE AS $$
  -- Logika seperti view di atas
$$;
```

Panggilan frontend:
```tsx
const { data } = await supabase.rpc("get_staff_monthly_stats", { p_year: 2026, p_month: 5 });
```

### Opsi C: useEffect + fetch paralel (Recommended MVP)

Tanpa perubahan backend — loop paralel di frontend (pseudocode di komponen D di atas).

### Rekomendasi

| Fase | Approach |
|---|---|
| **MVP** | Opsi C — useEffect loop paralel (0 perubahan DB) |
| **Fase 2** | Opsi B — RPC bulk (1 panggilan untuk semua staf) |

## Expanded Detail: Alternatif Layout (Tab vs Scroll)

### Alternatif A: Scroll Vertikal ✅ Recommended MVP

Semua section ditumpuk vertikal. Pengguna scroll ke bawah.

```
┌──────────────────────────────────┐
│ Status Cards (4 col grid)        │
├────────────────┬─────────────────┤
│ Kehadiran Hari │ Performa Bulan  │
│ Ini            │ Ini             │
├────────────────┴─────────────────┤
│ Ringkasan Shift                  │
├──────────────────────────────────┤
│ Anomali & Alert (fase 2)         │
└──────────────────────────────────┘
```

**Pro:** Sederhana, semua visible dalam 1-2 scroll, pola sama dengan admin dashboard
**Kontra:** Bisa panjang jika banyak section

### Alternatif B: Tab Horizontal

```
┌──────────────────────────────────┐
│ [📊 Dashboard] [👥 Staf] [💰 Shift]│
├──────────────────────────────────┤
│ Konten sesuai tab aktif          │
└──────────────────────────────────┘
```

**Pro:** Terorganisir, fokus per kategori
**Kontra:** Butuh state tab, hidden content, click overhead

### Alternatif C: Hybrid (Tab + Hero Always Visible)

```
┌──────────────────────────────────┐
│ Status Cards (always visible)    │
├──────────────────────────────────┤
│ [👥 Kehadiran] [📈 Performa]     │
├──────────────────────────────────┤
│ Konten tab yang dipilih          │
└──────────────────────────────────┘
```

**Pro:** Data kritis selalu terlihat
**Kontra:** Lebih kompleks

### Rekomendasi

**Fase 1 (MVP):** Alternatif A (Scroll Vertikal)
**Fase 2:** Alternatif C (Hybrid)

## Expanded Detail: Perubahan route.tsx Sidebar

### Lokasi

File: `/opt/djiwatentramapp/apps/web/src/routes/admin/route.tsx`

### Perubahan #1: Import LayoutDashboard

Baris import lucide-react (sekitar baris 1-40), tambahkan `LayoutDashboard`:

```tsx
import {
  // ... existing icons ...
  LayoutDashboard,
} from "lucide-react";
```

### Perubahan #2: Collapsed Mode — Tambah DesktopNavLink Dashboard

Sekitar baris ~469, dalam blok `{isCollapsed ? ( ... )}`. Tambah sebagai item pertama:

```tsx
// Sebelum <DesktopNavLink icon={<Users />} ...>
<DesktopNavLink icon={<LayoutDashboard />} isCollapsed={isCollapsed} label="Dashboard" to="/admin/operational-team" permission="users:manage" />
```

### Perubahan #3: Expanded Subnav — Tambah DesktopSubNavLink Dashboard

Sekitar baris ~490, dalam blok subnav `<div className="ml-4 ...">`. Tambah sebagai item pertama:

```tsx
// Sebelum <DesktopSubNavLink icon={<Users />} ...>
<DesktopSubNavLink activeOptions={{ exact: true }} icon={<LayoutDashboard />} label="Dashboard" to="/admin/operational-team" permission="users:manage" />
```

> **Catatan:** `activeOptions={{ exact: true }}` memastikan Dashboard hanya highlight saat path PERSIS `/admin/operational-team`, bukan saat di subroute seperti `/attendance`.

### Perubahan #4: Breadcrumb — Opsional

Baris ~81 — sudah ada `"/admin/operational-team": "Tim Operasional"`. Bisa dibiarkan karena breadcrumb menunjukkan path dengan benar.

### Ringkasan Semua Perubahan route.tsx

| Area | Perubahan |
|---|---|
| Import lucide-react | Tambah `LayoutDashboard` |
| Collapsed nav (~469) | Tambah link Dashboard sebagai item pertama |
| Expanded subnav (~490) | Tambah link Dashboard sebagai item pertama |
| Breadcrumb (~81) | Opsional — tidak wajib diubah |
| OPERATIONAL_TEAM_PATHS | Tidak perlu diubah (`/admin/operational-team` sudah ada) |
| QUICK_MENU | Tidak perlu diubah |

### Verifikasi Sidebar

- [ ] Sidebar icon Dashboard muncul di collapsed mode
- [ ] Sidebar link Dashboard muncul di expanded subnav (urutan pertama)
- [ ] Highlight aktif saat di `/admin/operational-team`
- [ ] Highlight tidak aktif saat di subroute (karyawan, attendance, dll.)
- [ ] Submenu Tim Operasional auto-expand saat navigasi ke dashboard
