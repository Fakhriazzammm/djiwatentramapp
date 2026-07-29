# Dashboard Analytics Rombak — Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task. UI tasks use direct patch preferred (content complete in plan).

**Goal:** Transform `/home` (dashboard) from a text-report hub into a visual "War Room" analytics center — charts, real-time pulse cards, and on-duty crew indicators. Remove all text-based shift summaries (now lives in `/laporan`).

**Architecture:** Dashboard becomes a pure visual analytics surface. Data flows from existing hybrid hooks. **On-Duty Crew menggunakan data REAL dari `pos_order_status` (Telegram bot)** — field `dibuat_by` (siapa yang buat) dan `selesai_by` (siapa yang selesaikan) yang sudah dicatat oleh Yumi Supervisor Bot setiap kali karyawan tap tombol "Dibuat" / "Selesai" di Telegram. New section components are extracted to `src/components/home/` for maintainability. Chart uses existing `recharts` (already in package.json).

**Tech Stack:** React + Vite + Tailwind + Recharts + Framer Motion (already installed) + existing hybrid hooks.

**Integrasi Lintas Aplikasi:**
- **apps/pos** → Revenue, orders, shift data, product breakdown
- **apps/karyawan** → On-duty staff detection, attendance status, work duration
- **pengaturan admin** → Shift schedules, target settings, store name, role mappings

---

## Status Awal (Verified 2026-07-19)

| Fitur | Status | Lokasi |
|-------|--------|--------|
| Ringkasan Shift (expandable card) | ✅ Ada, akan DIHAPUS | `home.lazy.tsx:390-533` |
| Leaderboard Bonus | ✅ Ada, tetap dipertahankan | `home.lazy.tsx:535-538` |
| HomeHeroOperational | ✅ Ada, tetap dipertahankan | `home.lazy.tsx:340-356` |
| Quick Actions | ✅ Ada, tetap dipertahankan | `home.lazy.tsx:364-366` |
| Service Grid | ✅ Ada, tetap dipertahankan | `home.lazy.tsx:369-374` |
| Recharts | ✅ Sudah terinstall | `package.json:49` |
| useHybridShiftReportRows | ✅ Hook tersedia | `use-hybrid-pos-data.ts:2155` |
| useHybridStaffStatsToday | ✅ Hook tersedia | `use-hybrid-attendance-data.ts:311` |
| useHybridSiteSettings | ✅ Hook tersedia | `use-hybrid-pos-data.ts:2026` |
| useHybridOrders | ✅ Hook tersedia | `use-hybrid-pos-data.ts:2065` |

---

## 📊 Dependency Graph

```
Level 1 (independen → paralel 🔥)
  ├── Task 1: Hapus Ringkasan Shift dari dashboard
  ├── Task 2: Buat Today'sPulse component
  ├── Task 3: Buat RevenueChart component
  ├── Task 4a: Buat Hook useHybridCrewProduction
  └── Task 4b: Buat OnDutyCrew component

Level 2 (dependen → sequential)
  ├── Task 5: Integrasi semua section ke home.lazy.tsx
  └── Task 6: Polish & mobile layout

Level 3 (verifikasi)
  └── Task 7: Build & browser E2E test
```

---

## 📐 Layout Target (Final)

```
┌──────────────────────────────────────────────────────────┐
│  🔍 HomeSearchBar                                        │
├──────────────────────────────────────────────────────────┤
│  👋 HomeHeroOperational (greeting, shift, jam kerja)     │
├──────────────────────────────────────────────────────────┤
│  📊 TODAY'S PULSE (4 kartu)                              │
│  [Revenue] [Orders] [On-Duty] [Target]                   │
├──────────────────────────────────────────────────────────┤
│  📈 REVENUE CHART (7 hari terakhir, Bar/Line)            │
├──────────────────────────────────────────────────────────┤
│  👥 ON-DUTY CREW — DATA REAL DARI BOT TELEGRAM          │
│  (dibuat_by / selesai_by dari pos_order_status)          │
│                                                         │
│  👤 Andi (Barista)                                     │
│     ⏳ Dibuat: 12    ✅ Selesai: 10                       │
│  👤 Budi (Kitchen)                                     │
│     ⏳ Dibuat: 8     ✅ Selesai: 7                        │
├──────────────────────────────────────────────────────────┤
│  🏆 LEADERBOARD BONUS (existing, tetap)                  │
├──────────────────────────────────────────────────────────┤
│  🚀 QUICK ACTIONS (existing, tetap)                      │
│  🔧 SERVICE GRID (existing, tetap)                       │
└──────────────────────────────────────────────────────────┘
```
---

### Task 1: Hapus Ringkasan Shift dari Dashboard

**Objective:** Hapus seluruh section "Ringkasan Shift" yang expandable (card teks + dropdown + tombol salin/telegram) dari `home.lazy.tsx`. Sekarang sudah ada di `/laporan`.

**Files:**
- Modify: `apps/pos/src/routes/home.lazy.tsx:390-533` (section `<section id="shift-summary">`)

**Current code (broken/obsolete):**
```tsx
{/* 7. Shift Summary — foldable */}
<section id="shift-summary" className="app-card mb-5 overflow-hidden">
  <button ...>
    {/* expandable header */}
  </button>
  {shiftExpanded && (
    <div ...>
      {/* dropdown, detail cards, pre text, buttons */}
    </div>
  )}
</section>
```

**Fix:** Hapus seluruh section tersebut (baris ~390-533).

**Cleanup:** Hapus juga state yang tidak lagi dipakai:
- `selectedShiftStart`, `setSelectedShiftStart`
- `selectedShift`
- `shiftDetails`
- `summaryText`
- `shiftExpanded`, `setShiftExpanded`
- `buildShiftSummaryText` function
- `formatTeamMembersByRole` function
- Import yang tidak dipakai: `ChevronDown`, `Copy`

**Verification:**
- `grep -n "shift-summary" apps/pos/src/routes/home.lazy.tsx` → tidak ada hasil
- `grep -n "shiftExpanded\|selectedShift\|summaryText" apps/pos/src/routes/home.lazy.tsx` → tidak ada hasil

---

### Task 2: Buat Today'sPulse Component

**Objective:** Komponen 4 kartu ringkasan hari ini: Revenue, Orders, On-Duty, Target.

**Files:**
- Create: `apps/pos/src/components/home/home-todays-pulse.tsx`

**Data source:**
- Revenue & Orders → dari `useHybridShiftReportRows()` (aggregate semua shift hari ini)
- On-Duty → dari `useHybridStaffStatsToday()` + `useHybridSiteSettings()`
- Target → dari `useHybridCurrentMonthProgress()` (reuse yang sudah ada di home)

**Code:**
```tsx
import { useMemo } from "react";
import { TrendingUp, ShoppingCart, Users, Target } from "lucide-react";
import { formatCurrencyIDR } from "@/lib/export-utils";
import { isSameDayWIB } from "@/lib/wib-utils";
import { useHybridShiftReportRows } from "@/hooks/use-hybrid-pos-data";
import { useHybridCurrentMonthProgress } from "@/hooks/use-hybrid-pos-data";
import { useHybridStaffStatsToday } from "@/hooks/use-hybrid-attendance-data";
import { useHybridSiteSettings } from "@/hooks/use-hybrid-pos-data";

export function HomeTodaysPulse() {
  const shiftRows = useHybridShiftReportRows();
  const monthProgress = useHybridCurrentMonthProgress();
  const settings = useHybridSiteSettings();
  const todayStats = useHybridStaffStatsToday();

  const todayData = useMemo(() => {
    if (!shiftRows) return null;
    const todayShifts = shiftRows.filter((s: any) => isSameDayWIB(s.startTime));
    const revenue = todayShifts.reduce((acc: number, s: any) => acc + (s.totalRevenue || 0), 0);
    const orders = todayShifts.reduce((acc: number, s: any) => acc + (s.orderCount || 0), 0);
    const activeStaff = todayStats?.isWorking ? 1 : 0; // rough estimate
    return { revenue, orders, activeStaff };
  }, [shiftRows, todayStats]);

  const shiftPct = useMemo(() => {
    if (!monthProgress?.shiftTarget || monthProgress.shiftTarget <= 0) return null;
    return Math.round((monthProgress.shiftCollected / monthProgress.shiftTarget) * 100);
  }, [monthProgress]);

  const cards = [
    {
      label: "Revenue",
      icon: <TrendingUp className="h-4 w-4" />,
      value: todayData ? formatCurrencyIDR(todayData.revenue) : "—",
      sub: "Hari ini",
      color: "text-emerald-600",
      bg: "bg-emerald-500/5",
      border: "border-emerald-500/10",
    },
    {
      label: "Orders",
      icon: <ShoppingCart className="h-4 w-4" />,
      value: todayData ? `${todayData.orders}` : "—",
      sub: "Total order",
      color: "text-blue-600",
      bg: "bg-blue-500/5",
      border: "border-blue-500/10",
    },
    {
      label: "On-Duty",
      icon: <Users className="h-4 w-4" />,
      value: todayData ? `${todayData.activeStaff}` : "—",
      sub: "Karyawan aktif",
      color: "text-amber-600",
      bg: "bg-amber-500/5",
      border: "border-amber-500/10",
    },
    {
      label: "Target",
      icon: <Target className="h-4 w-4" />,
      value: shiftPct !== null ? `${shiftPct}%` : "—",
      sub: "Bulan ini",
      color: "text-primary",
      bg: "bg-primary/5",
      border: "border-primary/10",
    },
  ];

  if (!todayData) {
    return (
      <div className="grid grid-cols-2 gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl bg-muted/50" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      {cards.map((card) => (
        <div
          key={card.label}
          className={`rounded-xl border ${card.border} ${card.bg} p-3 flex flex-col justify-between`}
        >
          <div className="flex items-center gap-1.5 mb-1">
            <div className={`p-1 rounded ${card.bg} ${card.color}`}>{card.icon}</div>
            <span className="text-[9px] font-bold uppercase tracking-tight text-muted-foreground">
              {card.label}
            </span>
          </div>
          <p className={`text-sm font-extrabold ${card.color}`}>{card.value}</p>
          <p className="text-[8px] text-muted-foreground">{card.sub}</p>
        </div>
      ))}
    </div>
  );
}
```

**Verification:**
- Component importable tanpa error: `import { HomeTodaysPulse } from "@/components/home/home-todays-pulse"`
- Build pass: `cd apps/pos && npm run build 2>&1 | tail -5`

---

### Task 3: Buat RevenueChart Component

**Objective:** Chart revenue 7 hari terakhir dengan toggle Bar/Line dan toggle Harian/Mingguan/Bulanan.

**Files:**
- Create: `apps/pos/src/components/home/home-revenue-chart.tsx`

**Data source:** `useHybridShiftReportRows()` (aggregate per hari dari shift data)

**Code:**
```tsx
import { useMemo, useState } from "react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { BarChart3, LineChart as LineIcon } from "lucide-react";
import { useHybridShiftReportRows } from "@/hooks/use-hybrid-pos-data";
import { isSameDayWIB, formatDateWIB } from "@/lib/wib-utils";

const formatCompact = (v: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", maximumFractionDigits: 0, notation: "compact",
  }).format(v);

export function HomeRevenueChart() {
  const shiftRows = useHybridShiftReportRows();
  const [chartType, setChartType] = useState<"bar" | "line">("bar");
  const [mode, setMode] = useState<"daily" | "weekly">("daily");

  const data = useMemo(() => {
    if (!shiftRows) return [];
    // Aggregate per day (last 7 days)
    const dayMap = new Map<string, number>();
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = formatDateWIB(d.getTime());
      dayMap.set(key, 0);
    }
    for (const shift of shiftRows) {
      const dayKey = formatDateWIB(shift.startTime);
      if (dayMap.has(dayKey)) {
        dayMap.set(dayKey, (dayMap.get(dayKey) || 0) + (shift.totalRevenue || 0));
      }
    }
    return Array.from(dayMap.entries()).map(([label, revenue]) => ({
      label: label.split(" ")[0], // "19 Juli" -> "19"
      revenue,
    }));
  }, [shiftRows]);

  if (!shiftRows) {
    return <div className="h-48 animate-pulse rounded-xl bg-muted/50" />;
  }

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-lg text-xs">
        <p className="font-semibold">{payload[0].payload.label}</p>
        <p className="text-emerald-600 font-bold">{formatCompact(payload[0].value)}</p>
      </div>
    );
  };

  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-bold">Tren Revenue</h3>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setChartType("bar")}
            className={`p-1 rounded ${chartType === "bar" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
          >
            <BarChart3 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setChartType("line")}
            className={`p-1 rounded ${chartType === "line" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
          >
            <LineIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={160}>
        {chartType === "bar" ? (
          <BarChart data={data} barCategoryGap="20%">
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={formatCompact} tick={{ fontSize: 9 }} axisLine={false} tickLine={false} width={55} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="revenue" fill="#22c55e" radius={[4, 4, 0, 0]} />
          </BarChart>
        ) : (
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={formatCompact} tick={{ fontSize: 9 }} axisLine={false} tickLine={false} width={55} />
            <Tooltip content={<CustomTooltip />} />
            <Line type="monotone" dataKey="revenue" stroke="#22c55e" strokeWidth={2.5} dot={{ r: 3 }} />
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
```

**Verification:**
- Build pass, chart render tanpa error.

---

### Task 4: Buat OnDutyCrew Component (Data Real dari Bot Telegram)

**Objective:** Grid karyawan yang sedang shift hari ini, dengan data **REAL** dari `pos_order_status` — field `dibuat_by` (siapa yang buat order) dan `selesai_by` (siapa yang selesaikan) yang sudah dicatat oleh Yumi Supervisor Bot.

**Background:** Yumi Supervisor Agent (bot Telegram) setiap kali karyawan tap tombol "⏳ Dibuat" atau "✅ Selesai", menyimpan record ke tabel `pos_order_status`:
- `dibuat_by`: nama karyawan yang menandai order "Dibuat" (sedang dikerjakan)
- `selesai_by`: nama karyawan yang menandai order "Selesai" (sudah jadi)
- `created_at`: waktu order masuk
- `group_type`: "barista" atau "kitchen"

Data ini sudah digunakan oleh `auto_shift_recap.py` untuk laporan shift di Telegram. Sekarang kita expose ke dashboard POS.

**Files:**
- Create: `apps/pos/src/hooks/use-hybrid-crew-data.ts` (hook baru)
- Create: `apps/pos/src/components/home/home-on-duty-crew.tsx`

**Step 1: Buat Hook `useHybridCrewProduction`**

```ts
// apps/pos/src/hooks/use-hybrid-crew-data.ts
import { useMemo } from "react";
import { useSupabaseValue } from "@/hooks/use-supabase-live-value";
import { createClient } from "@/lib/supabase";
import { getWibDayRange } from "@/lib/wib-utils";

async function fetchCrewProductionToday() {
  const supabase = createClient();
  const { start, end } = getWibDayRange(Date.now());
  const { data, error } = await supabase
    .from("pos_order_status")
    .select("dibuat_by,selesai_by,group_type,created_at")
    .gte("created_at", new Date(start).toISOString())
    .lt("created_at", new Date(end).toISOString());
  if (error) throw error;
  return (data ?? []) as any[];
}

export function useHybridCrewProduction() {
  const raw = useSupabaseValue(
    "crew-production:today",
    () => fetchCrewProductionToday(),
    []
  );

  return useMemo(() => {
    if (!raw) return undefined;
    const stats = new Map<string, { name: string; dibuat: number; selesai: number; groupType: string }>();
    for (const row of raw) {
      if (row.dibuat_by) {
        const ex = stats.get(row.dibuat_by) ?? { name: row.dibuat_by, dibuat: 0, selesai: 0, groupType: row.group_type ?? "" };
        ex.dibuat += 1;
        stats.set(row.dibuat_by, ex);
      }
      if (row.selesai_by) {
        const ex = stats.get(row.selesai_by) ?? { name: row.selesai_by, dibuat: 0, selesai: 0, groupType: row.group_type ?? "" };
        ex.selesai += 1;
        stats.set(row.selesai_by, ex);
      }
    }
    return Array.from(stats.values()).sort((a, b) => (b.dibuat + b.selesai) - (a.dibuat + a.selesai));
  }, [raw]);
}
```

**Step 2: Buat Komponen OnDutyCrew**

```tsx
// apps/pos/src/components/home/home-on-duty-crew.tsx
import { useMemo } from "react";
import { UserCheck, Clock, CheckCircle2 } from "lucide-react";
import { useHybridCrewProduction } from "@/hooks/use-hybrid-crew-data";
import { useHybridStaffUsers } from "@/hooks/use-hybrid-pos-data";
import { useHybridShiftReportRows } from "@/hooks/use-hybrid-pos-data";
import { isSameDayWIB } from "@/lib/wib-utils";

const GROUP_EMOJI: Record<string, string> = {
  barista: "☕",
  kitchen: "🍳",
  default: "👤",
};

export function HomeOnDutyCrew() {
  const crewStats = useHybridCrewProduction();
  const allStaff = useHybridStaffUsers();
  const shiftRows = useHybridShiftReportRows();

  // Ambil nama karyawan yang masuk shift hari ini
  const onDutyNames = useMemo(() => {
    if (!shiftRows) return new Set<string>();
    const todayShifts = shiftRows.filter((s: any) => isSameDayWIB(s.startTime));
    const names = new Set<string>();
    for (const shift of todayShifts) {
      const team = (shift.teamMembers || "").split(",").map((n: string) => n.trim()).filter(Boolean);
      for (const n of team) names.add(n.toLowerCase());
    }
    return names;
  }, [shiftRows]);

  // Merge crew stats dengan staff data untuk dapat role
  const crew = useMemo(() => {
    if (!crewStats) return null;
    return crewStats
      .filter((c) => onDutyNames.has(c.name.toLowerCase())) // hanya yang on-duty hari ini
      .map((c) => {
        const user = allStaff?.find((u: any) => u.name?.toLowerCase() === c.name.toLowerCase());
        return {
          ...c,
          role: user?.roleName || (c.groupType === "barista" ? "Barista" : c.groupType === "kitchen" ? "Kitchen" : "Staff"),
          avatar: c.name.charAt(0).toUpperCase(),
        };
      });
  }, [crewStats, allStaff, onDutyNames]);

  if (crew === null) {
    return <div className="h-24 animate-pulse rounded-xl bg-muted/50" />;
  }

  if (crew.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 text-center">
        <p className="text-xs text-muted-foreground">Belum ada aktivitas produksi hari ini</p>
        <p className="text-[9px] text-muted-foreground/60 mt-1">Data dari bot Telegram akan muncul setelah karyawan tap “Dibuat” / “Selesai”</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <h3 className="text-xs font-bold mb-2 flex items-center gap-1.5">
        <UserCheck className="h-3.5 w-3.5 text-primary" />
        On-Duty Crew — Produksi Hari Ini
      </h3>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
        {crew.map((member) => {
          const emoji = GROUP_EMOJI[member.groupType] || GROUP_EMOJI.default;
          return (
            <div key={member.name} className="flex flex-col rounded-lg border border-border bg-muted/20 p-2.5">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-bold">
                  {member.avatar}
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-bold text-foreground truncate">{member.name}</p>
                  <p className="text-[8px] text-muted-foreground">{emoji} {member.role}</p>
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1 text-[9px] text-amber-600">
                  <Clock className="h-3 w-3" />
                  <span className="font-bold">{member.dibuat}</span>
                  <span className="text-muted-foreground">dibuat</span>
                </div>
                <div className="flex items-center gap-1 text-[9px] text-emerald-600">
                  <CheckCircle2 className="h-3 w-3" />
                  <span className="font-bold">{member.selesai}</span>
                  <span className="text-muted-foreground">selesai</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

**Verification:**
- Hook `useHybridCrewProduction` return array `{name, dibuat, selesai, groupType}`
- Component filter hanya karyawan yang masuk `teamMembers` shift hari ini
- Build pass tanpa error
- Kalau `pos_order_status` kosong → tampil empty state (bukan crash)

---

### Task 5: Integrasi Semua Section ke home.lazy.tsx

**Objective:** Update `home.lazy.tsx` untuk import dan render komponen baru, setelah menghapus section lama.

**Files:**
- Modify: `apps/pos/src/routes/home.lazy.tsx`

**Changes:**

1. **Hapus imports yang tidak dipakai:**
```tsx
// HAPUS:
import { ChevronDown, Copy } from "lucide-react";
```

2. **Tambah imports komponen baru:**
```tsx
import { HomeTodaysPulse } from "@/components/home/home-todays-pulse";
import { HomeRevenueChart } from "@/components/home/home-revenue-chart";
import { HomeOnDutyCrew } from "@/components/home/home-on-duty-crew";
```

3. **Hapus state & helper functions yang tidak dipakai** (lihat Task 1 cleanup list).

4. **Tambah section baru** setelah `HomeHeroOperational`:
```tsx
{/* 2c. Today's Pulse */}
<section className="mb-4">
  <HomeTodaysPulse />
</section>

{/* 3. Revenue Chart */}
<section className="mb-4">
  <HomeRevenueChart />
</section>

{/* 4. On-Duty Crew */}
<section className="mb-4">
  <HomeOnDutyCrew />
</section>
```

**Renumber section** agar urutannya logis:
1. Search Bar
2. Hero Operational
3. Today's Pulse ← NEW
4. Revenue Chart ← NEW
5. On-Duty Crew ← NEW
6. Quick Actions
7. Service Grid
8. Contextual Strip
9. Repeat Usage
10. Leaderboard Bonus
11. Footer
12. Bottom Nav

**Verification:**
- Build pass tanpa error.
- `grep -n "HomeTodaysPulse\|HomeRevenueChart\|HomeOnDutyCrew" apps/pos/src/routes/home.lazy.tsx` → semua ditemukan.

---

### Task 6: Polish & Mobile Layout

**Objective:** Pastikan layout mobile-friendly, spacing konsisten, dan tidak ada overflow.

**Files:**
- Modify: `apps/pos/src/routes/home.lazy.tsx` (section wrapper spacing)
- Modify: `apps/pos/src/components/home/home-todays-pulse.tsx` (grid responsive)
- Modify: `apps/pos/src/components/home/home-revenue-chart.tsx` (height responsive)
- Modify: `apps/pos/src/components/home/home-on-duty-crew.tsx` (grid responsive)

**Polish list:**

| No | Perubahan | File |
|----|-----------|------|
| 1 | Semua `<section className="mb-5">` jadi `mb-4` untuk density lebih rapat | `home.lazy.tsx` |
| 2 | Today's Pulse: `grid-cols-2` sudah OK untuk mobile, tambahkan `sm:grid-cols-4` untuk desktop | `home-todays-pulse.tsx` |
| 3 | Revenue Chart: `height={160}` OK, pastikan tidak terpotong di mobile 375px | `home-revenue-chart.tsx` |
| 4 | On-Duty Crew: `grid-cols-3` → tambah `sm:grid-cols-4 md:grid-cols-5` untuk layar lebar | `home-on-duty-crew.tsx` |
| 5 | Pastikan semua card pakai `rounded-xl` (konsisten) | semua file baru |
| 6 | Pastikan tidak ada `max-h-` atau `overflow-auto` yang membuat scroll internal | semua file baru |

**Verification:**
- `cd apps/pos && npm run build` → success

---

### Task 7: Build & Browser E2E Verification

**Objective:** Verifikasi visual dashboard baru via browser screenshot.

**Commands:**
```bash
cd /opt/djiwatentramapp/apps/pos && npm run build 2>&1 | tail -10
```

**Expected:** Build success, no TypeScript errors.

**E2E Verification Steps:**
1. `browser_navigate` ke `https://pos.yumme.id/home`
2. `browser_vision` → screenshot, verify:
   - [ ] Tidak ada section "Ringkasan Shift"
   - [ ] Ada 4 kartu Today's Pulse
   - [ ] Ada Revenue Chart dengan bar/line
   - [ ] Ada On-Duty Crew grid
   - [ ] Leaderboard tetap ada di bawah
   - [ ] Quick Actions tetap ada
   - [ ] Mobile layout tidak patah (375px viewport)

3. Test toggle chart Bar/Line → click, verify chart berubah.
4. Test scroll → verify tidak ada scroll internal di card, hanya scroll halaman.

**Deploy:**
```bash
cd /opt/djiwatentramapp && git add -A && git commit -m "feat(pos): rombak dashboard jadi analytics war room - pulse, chart, on-duty crew" && git push origin main
sshpass -p 'panda-98%-panda' ssh ubuntu@43.129.54.5 'cd /opt/djiwatentramapp && git pull && bash scripts/deploy-vps.sh pos'
```

---

## 🔗 Integrasi Detail

### Dengan apps/pos
| Data | Hook | Digunakan di |
|------|------|-------------|
| Revenue hari ini | `useHybridShiftReportRows()` | Today'sPulse, RevenueChart |
| Order count | `useHybridShiftReportRows()` | Today'sPulse |
| Product breakdown | `useHybridShiftReportRows()` | OnDutyCrew (heuristic) |
| Leaderboard | `useHybridShiftReportRows()` | LeaderboardPanel (existing) |

### Dengan apps/karyawan
| Data | Hook | Digunakan di |
|------|------|-------------|
| Staff on-duty | `useHybridStaffStatsToday()` | Today'sPulse (active count) |
| Team members | `useHybridStaffUsers()` | OnDutyCrew (name + role) |
| Shift assignment | `useHybridShiftReportRows().teamMembers` | OnDutyCrew (who's working) |

### Dengan Yumi Supervisor Bot (Telegram)
| Data | Tabel | Digunakan di |
|------|-------|-------------|
| Siapa yang buat order (`dibuat_by`) | `pos_order_status` | OnDutyCrew |
| Siapa yang selesaikan (`selesai_by`) | `pos_order_status` | OnDutyCrew |
| Group type (barista/kitchen) | `pos_order_status` | OnDutyCrew |
| Waktu order | `pos_order_status` | OnDutyCrew (filter hari ini) |

> **Catatan:** Data ini ditulis oleh `yumi-supervisor-agent/app.py` setiap kali karyawan tap inline keyboard "Dibuat" atau "Selesai" di grup Telegram. Tidak perlu migration DB baru — tabel sudah ada dan berisi data historis.

### Dengan Pengaturan Admin
| Data | Hook | Digunakan di |
|------|------|-------------|
| Shift schedules | `useHybridSiteSettings().shiftSettings` | HomeHeroOperational (existing) |
| Target bulanan | `useHybridCurrentMonthProgress()` | Today'sPulse (target %) |
| Store name | `useHybridSiteSettings().storeName` | HomeHeroOperational (existing) |

---

## ⚠️ Pitfalls & Mitigasi

| Pitfall | Mitigasi |
|---------|----------|
| `productBreakdown` tidak selalu tersedia di shift row | Guard dengan `shift.productBreakdown || []` |
| `teamMembers` string kosong atau null | Guard dengan `.split(",").filter(Boolean)` |
| Staff user belum load saat OnDutyCrew render | Return skeleton/null saat `allStaff` undefined |
| Chart data kosong (belum ada shift 7 hari) | Tampilkan empty state, jangan crash |
| Role name case-sensitive ("Barista" vs "barista") | Normalisasi ke lowercase saat compare |
| Mobile overflow di chart Recharts | Pastikan `ResponsiveContainer` digunakan, height fixed |
| Build error karena file baru tidak terimport | Verify semua import path benar (`@/components/home/...`) |
| **Nama karyawan di Telegram ≠ nama di POS staff** | Mapping by lowercase name comparison. Kalau beda (e.g. "Andi" vs "Andi Pratama"), perlu fuzzy matching atau alias mapping di masa depan. |
| **Data `pos_order_status` kosong hari ini** | Tampilkan empty state informatif: "Belum ada aktivitas produksi hari ini. Data dari bot Telegram akan muncul setelah karyawan tap Dibuat/Selesai." |
| **RLS `pos_order_status` tidak bisa dibaca frontend** | Verify RLS policy — seharusnya bisa karena kitchen/bar display sudah baca tabel ini. Kalau terblok, gunakan service_role atau tambah policy. |
| **Timezone mismatch (`created_at` UTC vs WIB)** | Gunakan `getWibDayRange()` untuk convert WIB → UTC sebelum query. |
| **Karyawan `dibuat_by` tapi tidak masuk shift hari ini** | Filter dengan `onDutyNames` (dari `teamMembers` shift hari ini) — hanya tampilkan yang on-duty. |

---

## 📝 Notes

- **Tidak perlu migration DB** — semua data dari `pos_order_status` sudah ada (ditulis oleh bot Telegram).
- **Tidak perlu library baru** — recharts sudah ada.
- **Tidak perlu ubah backend** — pure frontend refactor + 1 hook baru.
- **On-Duty Crew pakai data REAL dari bot** — `dibuat_by` dan `selesai_by` dari `pos_order_status`. Bukan heuristic/estimasi.
- **Nama karyawan matching:** Telegram bot menyimpan nama karyawan saat mereka tap tombol. Nama ini harus cocok dengan `pos.staff_users.name` agar role mapping jalan. Kalau tidak cocok (e.g. "Andi" di Telegram vs "Andi Pratama" di POS), component tetap tampil tapi role jadi default ("Barista"/"Kitchen" berdasarkan `group_type`).
- **LeaderboardPanel** tidak diubah — tetap ada di dashboard sebagai "social proof" dan motivasi karyawan.
