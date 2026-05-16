# 📅 Sistem Penjadwalan Karyawan (Jadwal Kehadiran)

**Goal:** Buat sistem jadwal shift karyawan di `/admin/operational-team/attendance/jadwal` yang terintegrasi dengan absensi (`/attendance`) dan data karyawan (`/karyawan`).

---

## 1. Database Schema

### Table: `pos_attendance_schedules`

Tabel baru untuk menyimpan jadwal shift per karyawan per hari.

| Column | Type | Description |
|---|---|---|
| `source_id` | `text PK` | UUID generated client-side |
| `user_id` | `text NOT NULL` | FK ke `yumi_users.source_id` |
| `date` | `date NOT NULL` | Tanggal schedule (YYYY-MM-DD) |
| `shift_name` | `text NOT NULL` | Nama shift (e.g. "Pagi", "Siang", "Malam") |
| `start_time` | `time` | Mulai shift (opsional, fallback dari shift settings) |
| `end_time` | `time` | Selesai shift (opsional, fallback dari shift settings) |
| `status` | `text DEFAULT 'scheduled'` | `scheduled` \| `confirmed` \| `completed` \| `absent` \| `cancelled` |
| `note` | `text` | Catatan admin |
| `created_at` | `timestamptz DEFAULT now()` | |
| `updated_at` | `timestamptz DEFAULT now()` | |
| `raw` | `jsonb DEFAULT '{}'` | |

**Unique constraint:** `(user_id, date, shift_name)` — satu orang tidak bisa dijadwalkan shift ganda di hari yang sama.

### Public View: `public.pos_attendance_schedules`

```sql
create or replace view public.pos_attendance_schedules
with (security_invoker = false) as
select
  s.source_id as _id,
  s.user_id as "userId",
  u.name as "userName",
  u.slug as "userSlug",
  coalesce(trim(r.name), 'Team') as "roleName",
  s.date,
  s.shift_name as "shiftName",
  s.start_time as "startTime",
  s.end_time as "endTime",
  s.status,
  s.note,
  s.created_at as "createdAt",
  s.updated_at as "updatedAt",
  s.raw
from pos.attendance_schedules s
left join public.yumi_users u on u.source_id = s.user_id
left join public.yumi_roles r on r.source_id = u.role_source_id;
```

### Migration: `20260515_jadwal_kehadiran.sql`

Location: `/opt/djiwatentramapp/supabase/migrations/20260515000003_jadwal_kehadiran.sql`

### Integration with Existing Tables

```
pos.attendance_schedules (jadwal)
    │
    ├── user_id ──→ yumi_users.source_id
    │                   └── pos_users_public (view)
    │
    └── date + shift_name ──→ linked to pos_attendance_logs
                                (via userId + timestamp date range + shiftName match)
                                
pos.site_settings → shiftSettings.shiftSchedules (shift template definitions)
    └── name, openTime, closeTime ──→ fallback untuk jadwal yang tidak punya start/end time
```

### Key Integration Points with Existing Data

1. **Attendance Logs (`pos_attendance_logs`)**: Jadwal hari ini menunjukkan siapa yang seharusnya masuk → bisa di-*cross-reference* dengan log absensi (check-in/check-out) untuk melihat siapa yang sudah absen sesuai jadwal.

2. **Karyawan (`pos_users_public`)**: Source of truth untuk daftar staff yang bisa dijadwalkan. Filter hanya `isActive = true`.

3. **Shift Settings (`site_settings.shiftSettings.shiftSchedules`)**: Daftar shift template (name + openTime + closeTime) yang digunakan sebagai opsi dropdown saat membuat jadwal.

---

## 2. Route Structure

### New Route: `attendance/jadwal`

```
/admin/operational-team/attendance/          (existing — index with tabs)
    └── jadwal/                                (NEW — standalone calendar page)
```

Files to create:
- `/opt/djiwatentramapp/apps/web/src/routes/admin/operational-team/attendance/jadwal.tsx` — route definition
- `/opt/djiwatentramapp/apps/web/src/routes/admin/operational-team/attendance/jadwal.lazy.tsx` — main calendar component

### Sidebar Addition (in `admin/route.tsx`)

Add a new `DesktopSubNavLink` in the "Tim Operasional" section, between "Absensi" and "Pengaturan Absensi":

```tsx
<DesktopSubNavLink icon={<CalendarDays />} label="Jadwal" to="/admin/operational-team/attendance/jadwal" permission="users:manage" />
```

Add `CalendarDays` icon import from `lucide-react`.

### Tab in Attendance Index (in `attendance.index.lazy.tsx`)

Add a 3rd tab for quick access:

```tsx
type AttendanceTab = "attendance-report" | "attendance-logs" | "attendance-schedule";
// Add tab: { id: "attendance-schedule", label: "Jadwal", icon: CalendarDays }
// With link navigation to /admin/operational-team/attendance/jadwal
```

### TanStack Router

After creating the route files, run the router codegen to update `routeTree.gen.ts`.

---

## 3. UI/UX Specification

### Architecture Decision: Standalone Page (not SettingsPage tab)

Unlike the existing attendance tabs (Data Absensi, Log Absensi) which render inside `SettingsPage` as tab panels with a save button, the **Jadwal** page will be a **standalone lazy route** with its own component. Rationale:

- The calendar needs full viewport width for the monthly/weekly grid
- Drag-and-drop interactions are complex and don't fit a save-button pattern (every drag saves immediately via optimistic update)
- Calendar navigation (prev/next month) is a different interaction model than form-based settings

### Component Tree

```
AttendanceJadwalPage
├── CalendarHeader
│   ├── PeriodSelector (month/week toggle)
│   ├── MonthNavigator (prev/next, today button)
│   └── ActionBar
│       ├── Tambah Jadwal button → opens sidebar panel
│       ├── Export button → download Excel
│       └── Import button → upload Excel/AI parse
│
├── CalendarGrid (main area)
│   ├── DayHeaderRow (Min, Sen, Sel, Rab, Kam, Jum, Sab)
│   └── DayColumn (×7 or ×31)
│       └── ShiftCard (draggable)
│           ├── Karyawan name + role badge
│           ├── Shift name + time range
│           ├── Status badge (scheduled/confirmed/completed/absent)
│           └── Delete button (on hover)
│
├── QuickAddPanel (slide-in from right, desktop)
│   ├── Date picker (default: selected day or today)
│   ├── Karyawan multi-select dropdown
│   ├── Shift name dropdown (from shift settings)
│   ├── Start/end time (auto-filled from shift template)
│   └── Note field
│
├── ImportDialog (modal)
│   ├── File upload zone (drag & drop or click)
│   ├── AI parser: free-form text area or file upload
│   └── Preview table before confirm
│
└── ExportDialog (modal)
    ├── Month/week selector
    ├── Include columns toggle
    └── Format: .xlsx / .csv
```

### States

| State | UI |
|---|---|
| **Loading** | Skeleton: day cells with pulsing placeholders |
| **Empty** | "Belum ada jadwal bulan ini" + "Tambah Jadwal" CTA |
| **Error** | Toast error + retry button in header |
| **Saving** | Optimistic update on DnD; spinner on QuickAddPanel submit |
| **Drag** | Ghost card follows cursor; drop zone (row/column) highlights |
| **AI Parsing** | "Memproses jadwal..." spinner with percentage |

### UX Flow

1. **Default view**: Monthly calendar grid. Current month. Shows all karyawan shifts on their respective days.
2. **Navigation**: Click prev/next month or "Hari Ini" button. Toggle between Month and Week view.
3. **Add schedule**: Click "+ Tambah Jadwal" button → QuickAddPanel slides in → select date, karyawan (multi), shift → submit → card appears on calendar.
4. **Drag & drop**: 
   - **Horizontal drag**: Drag card to different day (same karyawan) — changes date.
   - **Vertical drag**: Drag card up/down within same day — changes time order (visual only, or re-assigns time slots).
   - **Duplicate (Ctrl+drag)**: Hold Ctrl while dragging → copy card to new day instead of moving.
   - **Shift+click multiple**: Select multiple cards → drag all together (batch move).
5. **Auto-duplication (shift+drop)**: When you drag a shift card and drop on a row of consecutive empty days, it auto-fills the same schedule across those days.
6. **Click to edit**: Click any ShiftCard → open QuickAddPanel pre-filled with that schedule's data.
7. **Delete**: Hover over card → X button appears → click → confirm toast → remove.
8. **Export**: Click Export → select month → download .xlsx with columns: Tanggal, Hari, Karyawan, Shift, Jam Mulai, Jam Selesai, Status.
9. **Import**: Click Import → upload file or paste text → AI parses any format → preview → confirm → schedule created.

### Drag & Drop Library Decision

**Recommendation**: Use `@dnd-kit/core` + `@dnd-kit/sortable` (lightweight, modern, accessible).

Install: `npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities`

Alternative: Native HTML5 DnD API (no library needed, but less polished UX). `@dnd-kit` is preferred for:
- Smooth animations via framer-motion integration
- Better touch support
- Sortable lists (vertical reorder within a day column)
- Drag overlay (ghost card)
- Collision detection (precise drop zones)

### CSS Architecture

```
.attendance-schedule-calendar
├── .day-header-cell (Min-Sab)
├── .day-column
│   ├── .day-number
│   ├── .day-label (Hari ini: dot indicator)
│   └── .shift-card
│       ├── .shift-card__name
│       ├── .shift-card__time
│       ├── .shift-card__status
│       └── .shift-card__delete
├── .drop-indicator (horizontal line between cards)
└── .drag-ghost (the card being dragged)
```

---

## 4. Hook Architecture

### `useHybridAttendanceSchedules`

```tsx
function useHybridAttendanceSchedules(month: number, year: number, refreshTrigger?: number) {
  // Fetches from public.pos_attendance_schedules
  // Filter: date >= startOfMonth, date <= endOfMonth
  // Returns grouped by date: Record<string, Schedule[]>
  // Uses useSupabaseLiveValue for real-time updates
}
```

### `useHybridCreateAttendanceSchedule`

```tsx
function useHybridCreateAttendanceSchedule() {
  // Inserts into pos.attendance_schedules table
  // Via service_role RPC or direct insert with RLS
  // Takes: { userId, date, shiftName, startTime?, endTime?, note? }
  // Returns: success/error
}
```

### `useHybridUpdateAttendanceSchedule`

```tsx
function useHybridUpdateAttendanceSchedule() {
  // Updates by source_id
  // Supports partial updates: date, shiftName, status, note
}
```

### `useHybridDeleteAttendanceSchedule`

```tsx
function useHybridDeleteAttendanceSchedule() {
  // Soft delete or hard delete by source_id
}
```

### `useHybridBulkCreateAttendanceSchedules`

```tsx
function useHybridBulkCreateAttendanceSchedules() {
  // Batch insert for AI-generated schedules (from import/parse)
  // Also used for batch duplicating schedules across days
}
```

### AI Parsing Hook (optional — can be in-page)

```tsx
function useAIScheduleParser() {
  // Takes: raw text/parsed rows
  // Sends to Yumi AI / AI edge function with prompt:
  //   "Parse this schedule data into dates, employee names, shift names, times.
  //    Accept any format: Indonesian, English, tables, lists, etc."
  // Returns: structured array of { userId, date, shiftName, startTime, endTime }
  // Then does fuzzy-match on userId by userName to link to existing karyawan
}
```

---

## 5. Backend / Supabase Edge Functions

### Write Permissions

The `pos.attendance_schedules` table in the `pos` schema needs INSERT/UPDATE/DELETE permissions. Since the project uses a service_role pattern for writes (as seen in other features):

**Option A (direct):** Write through a secure RPC or via an edge function.
**Option B (legacy-mirror doc style):** Store schedules as `legacy_mirror.documents` with `table_name = 'attendanceSchedules'`.

**Recommendation: Option A** — dedicated table in `pos` schema with direct Supabase insert via `service_role` client. This is more performant for batch operations and allows proper SQL constraints.

### Edge Function: `ai-parse-schedule` (optional — can be client-side with Gemini)

If we want server-side AI parsing:
- POST endpoint that accepts text/file
- Uses configured AI model (from site settings) to parse
- Returns structured schedule data
- Can also use Gemini API directly from client (already used elsewhere in the app)

---

## 6. Integration Points

### With Attendance Logs (`pos_attendance_logs`)

On each day column, show a small indicator for each karyawan:
- ✅ **Hadir** — ada check-in log matching jadwal
- ⏳ **Belum absen** — jadwal ada, belum check-in (after shift start time)
- ❌ **Tidak hadir** — jadwal ada, tidak ada check-in (after shift end time + grace period)

This is a **read-only correlation** displayed on the calendar — no writes to attendance logs.

### With Payroll

Scheduled shifts can be used as a basis for:
- Expected working days/hours per month
- Comparison against actual attendance for payroll adjustment
- This is **Phase 2** — not in this initial implementation

### With Karyawan Page

Add a "Lihat Jadwal" link/button on the karyawan profile page (`/karyawan/[slug]`) that navigates to the schedule page filtered by that karyawan.

---

## 7. Implementation Steps

### Step 1: Database Migration
- Create `pos.attendance_schedules` table in `0005_shift_support.sql` or new migration
- Create `public.pos_attendance_schedules` view
- Create RLS policies and grants
- Run migration

### Step 2: Route Files
- Create `jadwal.tsx` (route definition)
- Create `jadwal.lazy.tsx` (main page component)
- Add sidebar link in `admin/route.tsx`
- Install `@dnd-kit/*` packages
- Run router codegen

### Step 3: Hooks
- Data fetching hook (`useHybridAttendanceSchedules`)
- CRUD hooks (create, update, delete, bulk)
- AI parsing hook/utility

### Step 4: Calendar UI
- CalendarHeader with navigation
- CalendarGrid with day columns
- ShiftCard component (draggable)
- Drop zone logic (horizontal day change, vertical reorder)

### Step 5: QuickAddPanel
- Slide-in panel for creating/editing schedules
- Multi-select karyawan
- Shift template dropdown (from shift settings)
- Date and time inputs

### Step 6: Export
- Generate .xlsx with xlsx library
- Format: Tanggal, Hari, Nama Karyawan, Shift, Jam Mulai, Jam Selesai, Status, Catatan
- Monthly aggregation

### Step 7: Import + AI Parsing
- File upload (drag & drop zone)
- Parse .xlsx / .csv with xlsx/papaparse
- AI auto-parse via prompt to configured AI model
- Preview table with accept/reject per row

### Step 8: Integration
- Cross-reference with attendance logs (show status)
- Link from karyawan profile page
- Tab in attendance index page

---

## 8. Files to Change

**New files:**
```
apps/web/src/routes/admin/operational-team/attendance/jadwal.tsx
apps/web/src/routes/admin/operational-team/attendance/jadwal.lazy.tsx
apps/web/src/hooks/use-hybrid-attendance-schedules.ts
supabase/migrations/20260515000003_jadwal_kehadiran.sql
```

**Modified files:**
```
apps/web/src/routes/admin/route.tsx                    — sidebar link
apps/web/src/routes/admin/operational-team/attendance.index.lazy.tsx  — tab link
apps/web/src/routeTree.gen.ts                          — auto-generated
apps/web/package.json                                  — @dnd-kit/* deps
```

---

## 9. Risks, Tradeoffs, and Open Questions

| Risk | Mitigation |
|---|---|
| @dnd-kit might conflict with React 19 | Use latest version (1.x supports React 18+); test in dev first |
| Batch inserts for AI-parsed schedules | Use single Supabase insert with multiple rows (array) for performance |
| Calendar performance with 50+ karyawan × 31 days | Virtualize day columns (render only visible rows). Lazy load month data. |
| AI parsing quality varies by format | Start with structured Excel/CSV parsing first. AI is fallback for free-text. |
| Cross-day scheduling (e.g., night shift crossing midnight) | Store `date` as the start date. Shift that crosses midnight is indicated in shift_name or note. |

**Open Questions:**
1. Should we support **weekly repeating patterns**? (e.g., "Setiap Senin shift Pagi") — Can add as Phase 2 with recurrence rules.
2. **Notification** when schedule changes? (Telegram bot integration) — Phase 2.
3. **Conflict detection**: if karyawan already has a schedule on that date+shift, show warning before overwriting? — Yes, handled via unique constraint.

---

## 10. Validation and Testing

1. **Unit tests**: Schedule CRUD hooks, AI parser utility, Excel export/import
2. **Manual testing**:
   - Create schedule via QuickAddPanel
   - Drag card to different day → verify DB update
   - Export month → verify .xlsx opens correctly
   - Import existing .xlsx → verify all rows created
   - Cross-reference with attendance logs → status indicators correct
3. **Edge cases**:
   - Empty month (no schedules)
   - All karyawan have the same shift on all days
   - Delete last schedule of the month
   - Drag card to a day that already has same karyawan shift (conflict)
   - Import file with unknown karyawan names (AI fuzzy match)

---

---

## 11. 🔧 Detail Implementasi CRUD Hooks

### `useHybridAttendanceSchedules` — Data Fetching

```typescript
// File: apps/web/src/hooks/use-hybrid-attendance-schedules.ts
import { useSupabaseLiveValue } from "@/hooks/use-supabase-live-value";
import { createClient } from "@/lib/client";

export type AttendanceSchedule = {
  _id: string;
  userId: string;
  userName: string;
  userSlug: string;
  roleName: string;
  date: string;          // "YYYY-MM-DD"
  shiftName: string;
  startTime: string | null;  // "HH:MM"
  endTime: string | null;    // "HH:MM"
  status: "scheduled" | "confirmed" | "completed" | "absent" | "cancelled";
  note: string | null;
  createdAt: string;
  updatedAt: string;
  raw: Record<string, unknown>;
};

export type SchedulesByDate = Record<string, AttendanceSchedule[]>;  // key = date string

async function fetchAttendanceSchedules(month: number, year: number): Promise<SchedulesByDate> {
  const supabase = createClient();
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = new Date(year, month, 0).toISOString().split("T")[0]; // last day of month

  const { data, error } = await supabase
    .from("pos_attendance_schedules")
    .select("*")
    .gte("date", startDate)
    .lte("date", endDate)
    .order("date", { ascending: true })
    .order("shiftName", { ascending: true });

  if (error) throw error;

  // Group by date
  const grouped: SchedulesByDate = {};
  for (const row of data ?? []) {
    const dateStr = row.date;
    if (!grouped[dateStr]) grouped[dateStr] = [];
    grouped[dateStr].push(row as AttendanceSchedule);
  }
  return grouped;
}

export function useHybridAttendanceSchedules(
  month: number,
  year: number,
  refreshTrigger?: number
) {
  return useSupabaseLiveValue(
    `attendance-schedules-${year}-${month}`,
    () => fetchAttendanceSchedules(month, year),
    [month, year, refreshTrigger]
  );
}
```

### `useHybridCreateAttendanceSchedule` — Create Single

```typescript
export type CreateScheduleInput = {
  userId: string;
  date: string;          // "YYYY-MM-DD"
  shiftName: string;
  startTime?: string;    // "HH:MM"
  endTime?: string;      // "HH:MM"
  note?: string;
};

export function useHybridCreateAttendanceSchedule() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const create = useCallback(async (input: CreateScheduleInput) => {
    setIsLoading(true);
    setError(null);
    setIsSuccess(false);
    try {
      const supabase = createClient();
      const sourceId = crypto.randomUUID();
      const { error: dbError } = await supabase
        .from("pos_attendance_schedules")
        .insert({
          _id: sourceId,
          userId: input.userId,
          date: input.date,
          shiftName: input.shiftName,
          startTime: input.startTime ?? null,
          endTime: input.endTime ?? null,
          note: input.note ?? null,
          status: "scheduled",
        });

      if (dbError) throw dbError;
      setIsSuccess(true);
      return sourceId;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Gagal membuat jadwal";
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { create, isLoading, error, isSuccess, reset: () => { setError(null); setIsSuccess(false); } };
}
```

### `useHybridBulkCreateAttendanceSchedules` — Batch Create

```typescript
export type BulkScheduleInput = CreateScheduleInput[];

export function useHybridBulkCreateAttendanceSchedules() {
  const [progress, setProgress] = useState<{ total: number; done: number; failed: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const bulkCreate = useCallback(async (inputs: BulkScheduleInput): Promise<number> => {
    setProgress({ total: inputs.length, done: 0, failed: 0 });
    setError(null);
    try {
      const supabase = createClient();
      const records = inputs.map((i) => ({
        _id: crypto.randomUUID(),
        userId: i.userId,
        date: i.date,
        shiftName: i.shiftName,
        startTime: i.startTime ?? null,
        endTime: i.endTime ?? null,
        note: i.note ?? null,
        status: "scheduled" as const,
      }));

      // Batch insert — Supabase supports array insert
      const { error: dbError, count } = await supabase
        .from("pos_attendance_schedules")
        .insert(records)
        .select("_id", { count: "exact" });

      if (dbError) throw dbError;

      setProgress({ total: inputs.length, done: inputs.length, failed: 0 });
      return inputs.length;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Gagal membuat jadwal massal";
      setError(message);
      throw err;
    }
  }, []);

  return { bulkCreate, progress, error };
}
```

### `useHybridUpdateAttendanceSchedule` — Update/Edit

```typescript
export type UpdateScheduleInput = Partial<{
  date: string;
  shiftName: string;
  startTime: string | null;
  endTime: string | null;
  status: AttendanceSchedule["status"];
  note: string | null;
}>;

export function useHybridUpdateAttendanceSchedule() {
  const [isLoading, setIsLoading] = useState(false);

  const update = useCallback(async (scheduleId: string, changes: UpdateScheduleInput) => {
    setIsLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("pos_attendance_schedules")
        .update({ ...changes, updatedAt: new Date().toISOString() })
        .eq("_id", scheduleId);

      if (error) throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { update, isLoading };
}
```

### `useHybridDeleteAttendanceSchedule` — Delete

```typescript
export function useHybridDeleteAttendanceSchedule() {
  const [isLoading, setIsLoading] = useState(false);

  const remove = useCallback(async (scheduleId: string) => {
    setIsLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("pos_attendance_schedules")
        .delete()
        .eq("_id", scheduleId);
      if (error) throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { remove, isLoading };
}
```

### Write Permission Strategy

The existing project uses `service_role` for all writes (via the `@yumipos/backend` package). The `pos.attendance_schedules` table needs write grants.

**If using direct Supabase insert from client (simplest):** Add RLS policies on `public.pos_attendance_schedules` for authenticated users with appropriate roles.

**If using the legacy pattern:** Insert into `pos.attendance_schedules` via the `@yumipos/backend` backend helpers (same pattern as `useHybridUpdateSiteSettings`).

Check `useHybridWriteActions` to see the exact write pattern used in the project — likely a backend helper that uses `service_role`.

---

## 12. 🗄 SQL Migration Lengkap

```sql
-- File: supabase/migrations/20260515000003_jadwal_kehadiran.sql

-- ============================================================
-- ATTENDANCE SCHEDULES — jadwal shift karyawan
-- ============================================================

create table if not exists pos.attendance_schedules (
  source_id          text primary key,
  user_id            text not null references public.yumi_users (source_id) on delete cascade,
  date               date not null,
  shift_name         text not null,
  start_time         time,
  end_time           time,
  status             text not null default 'scheduled'
                     check (status in ('scheduled', 'confirmed', 'completed', 'absent', 'cancelled')),
  note               text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  raw                jsonb not null default '{}'::jsonb
);

-- Prevent duplicate schedules (same user, same day, same shift)
create unique index if not exists idx_pos_attendance_schedules_unique
  on pos.attendance_schedules (user_id, date, shift_name);

-- Index for fast month-level queries
create index if not exists idx_pos_attendance_schedules_date
  on pos.attendance_schedules (date);

-- Index for user-specific lookups
create index if not exists idx_pos_attendance_schedules_user
  on pos.attendance_schedules (user_id, date);

-- ============================================================
-- PUBLIC VIEW
-- ============================================================

create or replace view public.pos_attendance_schedules
with (security_invoker = false) as
select
  s.source_id as _id,
  s.user_id as "userId",
  u.name as "userName",
  u.slug as "userSlug",
  coalesce(trim(r.name), 'Team') as "roleName",
  s.date,
  s.shift_name as "shiftName",
  s.start_time as "startTime",
  s.end_time as "endTime",
  s.status,
  s.note,
  s.created_at as "createdAt",
  s.updated_at as "updatedAt",
  s.raw
from pos.attendance_schedules s
left join public.yumi_users u on u.source_id = s.user_id
left join public.yumi_roles r on r.source_id = u.role_source_id;

-- ============================================================
-- GRANTS
-- ============================================================

grant select on public.pos_attendance_schedules to anon, authenticated;
grant insert (source_id, user_id, date, shift_name, start_time, end_time, status, note, raw)
  on pos.attendance_schedules to service_role;
grant update (date, shift_name, start_time, end_time, status, note, updated_at)
  on pos.attendance_schedules to service_role;
grant delete on pos.attendance_schedules to service_role;

-- ============================================================
-- AUTO-UPDATE trigger for updated_at
-- ============================================================

create or replace function pos.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_attendance_schedules_updated_at
  before update on pos.attendance_schedules
  for each row
  execute function pos.set_updated_at();
```

**Migration runner:** Use the existing migration pattern — create a `run-jadwal-migration.mjs` file in `packages/backend/supabase/scripts/` that mirrors `run-shift-support-migration.mjs`.

---

## 13. 🧩 Detail Komponen React (Props & State Management)

### `AttendanceJadwalPage` — Root Component

```typescript
// File: routes/admin/operational-team/attendance/jadwal.lazy.tsx

// STATE:
type CalendarView = "month" | "week";
type PanelState = { open: boolean; mode: "create" | "edit"; scheduleId?: string };

function AttendanceJadwalPage() {
  // Calendar navigation
  const [currentDate, setCurrentDate] = useState(new Date()); // tracks viewed month/week
  const [view, setView] = useState<CalendarView>("month");
  const [selectedDate, setSelectedDate] = useState<string | null>(null); // "YYYY-MM-DD"

  // Panel
  const [panelState, setPanelState] = useState<PanelState>({ open: false, mode: "create" });
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);

  // Selection for batch operations
  const [selectedScheduleIds, setSelectedScheduleIds] = useState<Set<string>>(new Set());

  // Data
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const month = currentDate.getMonth() + 1;
  const year = currentDate.getFullYear();
  
  const { data: schedulesByDate, isLoading, error } = useHybridAttendanceSchedules(month, year, refreshTrigger);
  const { data: users } = useHybridStaffUsers();  // existing — for karyawan list
  const siteSettings = useHybridSiteSettings();
  const shiftTemplates = siteSettings?.shiftSettings?.shiftSchedules ?? [];
  const predefinedShifts = siteSettings?.shiftSettings?.predefinedShifts ?? [];

  // Mutation hooks
  const { create } = useHybridCreateAttendanceSchedule();
  const { update } = useHybridUpdateAttendanceSchedule();
  const { remove } = useHybridDeleteAttendanceSchedule();
  const { bulkCreate } = useHybridBulkCreateAttendanceSchedules();

  // Trigger re-fetch after mutations
  const refresh = () => setRefreshTrigger((n) => n + 1);

  // DnD context
  const [activeDragItem, setActiveDragItem] = useState<AttendanceSchedule | null>(null);

  // Render...
}
```

### `CalendarHeader` — Navigation & Actions

```typescript
type CalendarHeaderProps = {
  currentDate: Date;
  view: CalendarView;
  onViewChange: (v: CalendarView) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onAdd: () => void;
  onImport: () => void;
  onExport: () => void;
  isLoading: boolean;
};

// Layout: [Week/Month toggle] | [〈 Month Name YYYY 〉] | [Today] | [+ Tambah] [Export] [Import]
// Uses lucide-react icons: ChevronLeft, ChevronRight, CalendarPlus, Download, Upload
```

### `CalendarGrid` — Main Calendar Area

```typescript
type CalendarGridProps = {
  view: CalendarView;            // "month" | "week"
  currentDate: Date;             // reference date
  schedulesByDate: SchedulesByDate;  // from hook — grouped by date
  selectedScheduleIds: Set<string>;
  onScheduleSelect: (id: string, shiftKey: boolean) => void;
  onScheduleClick: (schedule: AttendanceSchedule) => void;
  onScheduleDelete: (id: string) => void;
  onScheduleDrop: (scheduleId: string, newDate: string) => void;
  onScheduleDuplicate: (schedule: AttendanceSchedule, targetDate: string) => void;
};

// IMPLEMENTATION:
// Month view: 7 columns (day names) × up to 6 rows (weeks)
// Week view: 7 columns × infinite rows (each shift is a row)
//
// For month view, use a flex grid:
//   <div className="grid grid-cols-7">
//     DayHeaderRow (7 cells)
//     {dayCells.map(day => <DayColumn key={day.dateStr}> )}
//   </div>
//
// Each DayColumn is a droppable zone for DnD
```

### `DayColumn` — Single Day Container

```typescript
type DayColumnProps = {
  date: Date;
  dateStr: string;              // "YYYY-MM-DD"
  isToday: boolean;
  isCurrentMonth: boolean;      // for dimmed styling on adjacent month days
  schedules: AttendanceSchedule[];
  selectedIds: Set<string>;
  onScheduleSelect: (id: string, shiftKey: boolean) => void;
  onScheduleClick: (schedule: AttendanceSchedule) => void;
  onScheduleDelete: (id: string) => void;
  onDrop: (scheduleId: string) => void;
};

// Layout:
// ┌──────────────┐
// │  15           │ ← day number (bold if today)
// │  Sen          │ ← day name
// ├──────────────┤
// │ [ShiftCard]   │ ← draggable
// │ [ShiftCard]   │
// │ [ShiftCard]   │
// │ [+ Add]       │ ← inline add shortcut
// └──────────────┘
//
// Uses useDroppable from @dnd-kit/core
// Uses useSortable from @dnd-kit/sortable (for vertical reorder within same day)
```

### `ShiftCard` — Draggable Schedule Item

```typescript
type ShiftCardProps = {
  schedule: AttendanceSchedule;
  isSelected: boolean;
  onSelect: (shiftKey: boolean) => void;
  onClick: () => void;
  onDelete: () => void;
  // Attendance status (from cross-reference)
  attendanceStatus?: "present" | "pending" | "absent" | null;
};

// Uses useDraggable from @dnd-kit/core
// Renders:
// ┌──────────────────────────┐
// │ [role badge] Nama Karyawan│
// │ 🕐 Pagi (07:00-15:00)     │ ← shift name + time
// │ ● scheduled               │ ← status badge with color dot
// │                              │ ← delete X on hover
// └──────────────────────────┘
//
// Color coding:
// - scheduled: blue dot
// - confirmed: green dot  
// - completed: gray dot
// - absent: red dot
// - cancelled: muted/line-through
//
// Attendance overlay (small icon top-right):
// - ✅ present (has check-in)
// - ⏳ pending (shift started but no check-in)
// - ❌ absent (shift ended, no check-in)
```

### `QuickAddPanel` — Create/Edit Panel

```typescript
type QuickAddPanelProps = {
  open: boolean;
  mode: "create" | "edit";
  onClose: () => void;
  onSave: (input: CreateScheduleInput) => Promise<void>;
  onUpdate: (scheduleId: string, changes: UpdateScheduleInput) => Promise<void>;
  
  // Pre-fill data for edit mode
  editSchedule?: AttendanceSchedule;
  
  // Context options
  users: PublicUser[];
  shiftTemplates: ShiftSchedule[];
  defaultDate?: string; // "YYYY-MM-DD" — from calendar click
};

// STATE (internal):
type FormState = {
  scheduleId?: string;
  date: string;
  userIds: string[];       // multi-select!
  shiftName: string;
  startTime: string;
  endTime: string;
  note: string;
};

// Layout (slide-in from right):
// ┌─────────────────────┐
// │ ✕ Jadwal Baru       │ ← header
// ├─────────────────────┤
// │ Tanggal: [date]      │
// │ Karyawan: [multi-sel]│ ← searchable dropdown/modal
// │ Shift: [dropdown]    │ ← from shiftTemplates
// │ Jam Mulai: [time]    │ ← auto-filled from shift template
// │ Jam Selesai: [time]  │ ← auto-filled from shift template
// │ Catatan: [textarea]  │
// ├─────────────────────┤
// │ [Simpan]             │ ← full width button
// └─────────────────────┘
//
// Multi-select karyawan: 
// When in "create" mode, user can select MULTIPLE karyawan.
// On save, creates one schedule per karyawan × selected shift.
// This is the "horizontal duplicate" pattern — assign same shift to many people at once.
//
// Auto-fill on shift select:
// When user picks "Pagi", auto-fill startTime=07:00, endTime=15:00 from shiftTemplates.
// User can override the times manually.
//
// Karyawan multi-select uses a searchable dropdown:
// - Shows all active users
// - Search by name or role
// - Select all by role filter
// - Selected users shown as badges below the field
```

### `ImportDialog` — Upload & AI Parse

```typescript
type ImportDialogProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: (schedules: CreateScheduleInput[]) => Promise<void>;
  users: PublicUser[];    // for matching names to userIds
  shiftTemplates: ShiftSchedule[];
};

// STATE:
type ImportState = {
  step: "upload" | "preview" | "done";
  rawText: string;
  parsedRows: ParsedScheduleRow[];
  matchedRows: MatchedScheduleRow[];  // with userId resolved
  progress: string;
  errors: string[];
};

type ParsedScheduleRow = {
  date: string;
  userName: string;
  shiftName: string;
  startTime?: string;
  endTime?: string;
  note?: string;
};

type MatchedScheduleRow = ParsedScheduleRow & {
  userId: string | null;    // null = no match found
  matchConfidence: "exact" | "fuzzy" | "none";
};
```

### `ExportDialog` — Excel Export

```typescript
type ExportDialogProps = {
  open: boolean;
  onClose: () => void;
  schedulesByDate: SchedulesByDate;
  month: number;
  year: number;
  onMonthChange: (month: number, year: number) => void;  // navigate calendar
};
```

---

## 14. 🤖 Prompt AI untuk Parsing Jadwal

### Client-Side AI Prompt (for Gemini/Yumi AI)

```typescript
const AI_PARSE_PROMPT = `Kamu adalah asisten yang meng-parse jadwal kerja karyawan dari berbagai format.

INPUT: Teks atau data tabel dari file jadwal yang diunggah.

TUGAS: Parse data berikut ke dalam array JSON dengan format:
[
  {
    "date": "YYYY-MM-DD",
    "userName": "nama karyawan (sama persis dengan input, case-insensitive)",
    "shiftName": "nama shift (Pagi/Siang/Malam atau sesuai input)",
    "startTime": "HH:MM (opsional, null jika tidak ada)",
    "endTime": "HH:MM (opsional, null jika tidak ada)",
    "note": "catatan (opsional)"
  }
]

ATURAN PARSING:
1. Tanggal bisa dalam format: "15 Mei 2026", "15/05/2026", "2026-05-15", "15-05", "Senin 15", dll
2. Nama karyawan di kolom/kepala tabel -> ekstrak semua
3. Shift di baris/kepala -> "Pagi", "07:00-15:00", "Morning", "Shift 1", dll
4. Abaikan header/kolom yang tidak relevan (seperti "gaji", "catatan lama", dll)
5. Jika ada kolom "Senin", "Selasa" dll yang tidak punya tanggal spesifik, tanyakan bulan/tahun
6. Jika shiftName tidak jelas, gunakan nama shift yang paling mendekati dari input
7. Jika waktu tidak disebut, set startTime=null, endTime=null

CONTOH INPUT FORMAT 1 — Tabel dengan baris shift:
| Tanggal | Pagi (07-15) | Siang (15-23) |
|---------|-------------|---------------|
| 1 Mei   | Budi, Siti  | Andi          |
| 2 Mei   | Sari        | Budi, Andi    |

CONTOH OUTPUT 1:
[
  {"date": "2026-05-01", "userName": "Budi", "shiftName": "Pagi", "startTime": "07:00", "endTime": "15:00"},
  {"date": "2026-05-01", "userName": "Siti", "shiftName": "Pagi", "startTime": "07:00", "endTime": "15:00"},
  {"date": "2026-05-01", "userName": "Andi", "shiftName": "Siang", "startTime": "15:00", "endTime": "23:00"},
  {"date": "2026-05-02", "userName": "Sari", "shiftName": "Pagi", "startTime": "07:00", "endTime": "15:00"},
  {"date": "2026-05-02", "userName": "Budi", "shiftName": "Siang", "startTime": "15:00", "endTime": "23:00"},
  {"date": "2026-05-02", "userName": "Andi", "shiftName": "Siang", "startTime": "15:00", "endTime": "23:00"}
]

CONTOH INPUT FORMAT 2 — Daftar per orang:
- Budi: 1-5 Mei Pagi (07-15), 6-10 Mei Siang (15-23)
- Siti: 1-10 Mei Pagi

CONTOH INPUT FORMAT 3 — Nama/hari di kolom:
| Karyawan | Senin | Selasa | Rabu | Kamis | Jumat | Sabtu | Minggu |
|----------|-------|--------|------|-------|-------|-------|--------|
| Budi     | P     | P      | P    | P     | P     | S     | -      |
| Siti     | P     | S      | P    | S     | P     | -     | -      |

(Catatan: P = Pagi, S = Siang, M = Malam, - = Libur)

OUTPUT HANYA ARRAY JSON — tidak ada teks tambahan.

DATA UNTUK DI-PARSE:
{inputText}
`;
```

### Usage in Import Flow

```typescript
async function parseWithAI(inputText: string): Promise<ParsedScheduleRow[]> {
  // Use whatever AI model is configured in site settings (e.g., Gemini)
  const supabase = createClient();
  const { data, error } = await supabase.functions.invoke("yumi-ai-chat", {
    body: {
      messages: [{ role: "user", content: AI_PARSE_PROMPT.replace("{inputText}", inputText) }],
      model: "gemini/gemini-2.0-flash",  // fast + cheap for parsing
    },
  });

  if (error) throw error;
  const text = data?.message?.content ?? "";
  
  // Extract JSON from response (handle markdown code blocks)
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error("Gagal parse output AI");
  
  return JSON.parse(jsonMatch[1] ?? jsonMatch[0]);
}
```

### Fuzzy Name Matching (Post-AI)

After AI returns `userName`, match to actual `userId`:

```typescript
function matchUserNameToUserId(userName: string, users: PublicUser[]): { userId: string; confidence: "exact" | "fuzzy" | "none" } {
  const normalized = userName.toLowerCase().trim();
  
  // 1. Exact match
  const exact = users.find(u => u.name.toLowerCase() === normalized);
  if (exact) return { userId: exact._id, confidence: "exact" };
  
  // 2. Contains match (e.g., "Budi" matches "Budi Santoso")
  const contains = users.find(u => u.name.toLowerCase().includes(normalized) || normalized.includes(u.name.toLowerCase()));
  if (contains) return { userId: contains._id, confidence: "fuzzy" };
  
  // 3. First-name match
  const firstName = normalized.split(" ")[0];
  const firstMatch = users.find(u => u.name.toLowerCase().split(" ")[0] === firstName);
  if (firstMatch) return { userId: firstMatch._id, confidence: "fuzzy" };
  
  return { userId: "", confidence: "none" };
}
```

---

## 15. 📥/📤 Format Excel Export/Import Spec

### Export Format

**Filename:** `Jadwal_Shift_{Bulan}_{Tahun}.xlsx`
*Example:* `Jadwal_Shift_Mei_2026.xlsx`

**Sheet 1: "Jadwal"** — Flat table, one row per schedule entry

| Column | Header | Format | Example |
|---|---|---|---|
| A | Tanggal | Date (DD-MM-YYYY) | 15-05-2026 |
| B | Hari | Text | Kamis |
| C | Nama Karyawan | Text | Budi Santoso |
| D | Role | Text | Kasir |
| E | Shift | Text | Pagi |
| F | Jam Mulai | Time (HH:MM) | 07:00 |
| G | Jam Selesai | Time (HH:MM) | 15:00 |
| H | Status | Text | scheduled |
| I | Catatan | Text | - |

**Sheet 2: "Ringkasan"** — Per-karyawan per-bulan pivot (optional)

| Column | Header | Format | Example |
|---|---|---|---|
| A | Nama Karyawan | Text | Budi Santoso |
| B | Total Hari Masuk | Number | 22 |
| C | Shift Pagi | Number | 15 |
| D | Shift Siang | Number | 7 |
| E | Shift Malam | Number | 0 |

**Sheet 3: "Kalender"** — Calendar-style matrix (optional, for visual review)

| | A | B | C | D | E | F | G | H | ... (up to AE) |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Karyawan | 1 | 2 | 3 | 4 | 5 | 6 | 7 | ... |
| 2 | Budi | P | P | P | P | P | S | - | ... |
| 3 | Siti | P | S | P | S | P | - | - | ... |

Where P = Pagi, S = Siang, M = Malam, - = Libur

### Export Implementation

```typescript
import * as XLSX from "xlsx";
import { format, getDay } from "date-fns";
import { id } from "date-fns/locale";

function exportToExcel(schedulesByDate: SchedulesByDate, month: number, year: number) {
  const DAY_NAMES = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

  // Sheet 1: Flat table
  const rows: unknown[][] = [
    ["Tanggal", "Hari", "Nama Karyawan", "Role", "Shift", "Jam Mulai", "Jam Selesai", "Status", "Catatan"],
  ];

  for (const [dateStr, schedules] of Object.entries(schedulesByDate).sort()) {
    const d = new Date(dateStr + "T00:00:00");
    const dayName = DAY_NAMES[getDay(d)];
    for (const s of schedules) {
      rows.push([
        dateStr,
        dayName,
        s.userName,
        s.roleName,
        s.shiftName,
        s.startTime ?? "",
        s.endTime ?? "",
        s.status,
        s.note ?? "",
      ]);
    }
  }

  const wb = XLSX.utils.book_new();
  const ws1 = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws1, "Jadwal");

  // Auto-width columns
  ws1["!cols"] = [
    { wch: 12 },  // Tanggal
    { wch: 8 },   // Hari
    { wch: 20 },  // Nama Karyawan
    { wch: 10 },  // Role
    { wch: 10 },  // Shift
    { wch: 10 },  // Jam Mulai
    { wch: 12 },  // Jam Selesai
    { wch: 12 },  // Status
    { wch: 20 },  // Catatan
  ];

  // Sheet 2: Summary per karyawan
  // ... (aggregation logic)

  XLSX.writeFile(wb, `Jadwal_Shift_${format(new Date(year, month - 1), "MMMM_yyyy", { locale: id })}.xlsx`);
}
```

### Import Format — Supported Inputs

**Format A: Flat table (Excel/CSV)**
```
Tanggal | Nama Karyawan | Shift | Jam Mulai | Jam Selesai
15-05  | Budi          | Pagi  | 07:00     | 15:00
```

Column headers are matched case-insensitively. Only `Tanggal` and `Nama Karyawan` are required.

**Format B: Matrix (shift per baris, hari per kolom)**
```
Karyawan | 1 Mei | 2 Mei | 3 Mei | ...
Budi     | P     | P     | S     | ...
Siti     | P     | S     | P     | ...
```

Where shift values: P/Pagi, S/Siang, M/Malam, -/x (libur)

**Format C: Copied from spreadsheet / pasted text**
Any text that AI can parse (list, table in markdown, CSV, etc.)

### Import Detection Logic

```typescript
function detectImportFormat(rawText: string): "flat" | "matrix" | "ai" {
  const lines = rawText.trim().split("\n");
  const header = lines[0]?.toLowerCase() ?? "";
  
  // Flat: has "tanggal" or "date" column
  if (header.includes("tanggal") || header.includes("date") || header.includes("nama")) {
    return "flat";
  }
  
  // Matrix: first column is "karyawan" or "nama" and there are date-like headers
  const secondLine = lines[1] ?? "";
  if ((header.startsWith("karyawan") || header.startsWith("nama")) && secondLine.match(/\d+\s*(mei|juni|mei|april|mei)/i)) {
    return "matrix";
  }
  
  // Fallback: AI
  return "ai";
}
```

---

## 16. ⚡ Drag & Drop Implementasi Detail

### Setup

```
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

### DndContext Structure

```typescript
import {
  DndContext,
  DragOverlay,
  closestCenter,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  PointerSensor,
  KeyboardSensor,
  DragStartEvent,
  DragEndEvent,
  DragOverEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useCallback, useState } from "react";

function CalendarGrid({ schedulesByDate, ...props }: CalendarGridProps) {
  const [activeSchedule, setActiveSchedule] = useState<AttendanceSchedule | null>(null);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);
  const [isCtrlHeld, setIsCtrlHeld] = useState(false);

  // Sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,  // 8px drag threshold — prevents accidental drag on click
      },
    }),
    useSensor(KeyboardSensor)
  );

  // Track Ctrl key for duplicate mode
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === "Control") setIsCtrlHeld(true); };
    const onKeyUp = (e: KeyboardEvent) => { if (e.key === "Control") setIsCtrlHeld(false); };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => { window.removeEventListener("keydown", onKeyDown); window.removeEventListener("keyup", onKeyUp); };
  }, []);

  // Drag handlers
  const handleDragStart = useCallback((event: DragStartEvent) => {
    const schedule = schedules[event.active.id as string];
    if (schedule) setActiveSchedule(schedule);
  }, [schedules]);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    // Detect which day column we're hovering over
    const overId = event.over?.id as string | undefined;
    if (overId?.startsWith("day-")) {
      setDragOverDate(overId.replace("day-", ""));
    }
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveSchedule(null);
    setDragOverDate(null);

    const { active, over } = event;
    if (!over) return;

    const scheduleId = active.id as string;
    const targetDate = (over.id as string).replace("day-", "");

    // Validate: targetDate must be a valid date string
    if (!targetDate.match(/^\d{4}-\d{2}-\d{2}$/)) return;

    if (isCtrlHeld) {
      // Duplicate: copy to new date
      const schedule = schedules[scheduleId];
      if (schedule) props.onScheduleDuplicate(schedule, targetDate);
    } else {
      // Move: update date
      props.onScheduleDrop(scheduleId, targetDate);
    }
  }, [isCtrlHeld]);

  // Collision detection: use pointerWithin + closestCenter for day columns
  const collisionDetection = useCallback(
    (args: any) => {
      // First, check if pointer is within any droppable
      const pointerCollisions = pointerWithin(args);
      if (pointerCollisions.length > 0) {
        // Use the closest center among day-droppables
        const dayDroppables = pointerCollisions.filter((c: any) => String(c.id).startsWith("day-"));
        if (dayDroppables.length > 0) return dayDroppables;
      }
      return closestCenter(args);
    },
    []
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      {/* Calendar grid here */}
      <div className="grid grid-cols-7">
        {/* Day headers */}
        {dayHeaders}
        
        {/* Day columns — each is a Droppable */}
        {dayCells.map(day => (
          <DayColumn
            key={day.dateStr}
            date={day.date}
            dateStr={day.dateStr}
            isToday={day.isToday}
            isCurrentMonth={day.isCurrentMonth}
            schedules={schedulesByDate[day.dateStr] ?? []}
            isDragOver={dragOverDate === day.dateStr}
            onScheduleSelect={props.onScheduleSelect}
            onScheduleClick={props.onScheduleClick}
            onScheduleDelete={props.onScheduleDelete}
          />
        ))}
      </div>

      {/* Drag overlay — ghost card that follows cursor */}
      <DragOverlay dropAnimation={null}>
        {activeSchedule ? (
          <ShiftCardGhost schedule={activeSchedule} />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
```

### DayColumn — The Droppable Zone

```typescript
import { useDroppable } from "@dnd-kit/core";

function DayColumn({ dateStr, isDragOver, schedules, ...props }: DayColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `day-${dateStr}`,
    data: { date: dateStr, type: "day-column" },
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "min-h-[120px] border border-border/50 rounded-lg p-1.5 transition-colors",
        isOver && "bg-primary/5 ring-2 ring-primary/30",
        isDragOver && !isOver && "bg-muted/50",
        "space-y-1"
      )}
    >
      {/* Day header */}
      <div className="text-center">
        <span className={cn(
          "inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium",
          isToday && "bg-primary text-primary-foreground"
        )}>
          {dayNumber}
        </span>
        <p className="text-[10px] text-muted-foreground">{dayNameShort}</p>
      </div>

      {/* Schedules — inner sortable context for vertical reorder */}
      <SortableContext items={schedules.map(s => s._id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-0.5">
          {schedules.map(schedule => (
            <ShiftCard
              key={schedule._id}
              schedule={schedule}
              // ...props
            />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}
```

### ShiftCard — The Draggable Item

```typescript
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";

function ShiftCard({ schedule, isSelected, onSelect, onClick, onDelete }: ShiftCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: schedule._id,
    data: { schedule, type: "shift-card" },
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 100 : "auto",
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group relative cursor-grab rounded-md border border-border/60 bg-card px-2 py-1 text-xs transition-all",
        "hover:border-primary/40 hover:shadow-sm active:cursor-grabbing",
        isSelected && "border-primary ring-1 ring-primary/30",
        isDragging && "shadow-lg"
      )}
      onClick={(e) => { e.stopPropagation(); onClick?.(); }}
      {...listeners}
      {...attributes}
    >
      {/* Role badge */}
      <span className="mr-1 inline-block rounded bg-muted px-1 py-0.5 text-[10px] font-medium text-muted-foreground">
        {schedule.roleName}
      </span>

      {/* Name */}
      <span className="font-medium text-foreground">{schedule.userName}</span>

      {/* Shift time */}
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
        <Clock className="h-3 w-3" />
        <span>{schedule.shiftName}</span>
        {schedule.startTime && <span>({schedule.startTime}-{schedule.endTime ?? "?"})</span>}
      </div>

      {/* Status badge */}
      <span className={cn(
        "inline-block rounded-full px-1.5 py-0.5 text-[9px] font-medium",
        statusColors[schedule.status]
      )}>
        ● {schedule.status}
      </span>

      {/* Delete button — visible on hover */}
      <button
        className="absolute right-1 top-1 hidden rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive group-hover:block"
        onClick={(e) => { e.stopPropagation(); onDelete?.(); }}
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

const statusColors: Record<string, string> = {
  scheduled: "text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-950",
  confirmed: "text-green-600 bg-green-50 dark:text-green-400 dark:bg-green-950",
  completed: "text-gray-500 bg-gray-100 dark:text-gray-400 dark:bg-gray-800",
  absent: "text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-950",
  cancelled: "text-muted-foreground bg-muted line-through",
};
```

### Ghost Card (DragOverlay)

```typescript
// Lighter, no interactivity, follows cursor
function ShiftCardGhost({ schedule }: { schedule: AttendanceSchedule }) {
  return (
    <div className="rounded-md border-2 border-primary/50 bg-primary/10 px-2 py-1.5 shadow-xl text-xs rotate-3">
      <span className="font-medium">{schedule.userName}</span>
      <span className="ml-1 text-muted-foreground">— {schedule.shiftName}</span>
    </div>
  );
}
```

### Auto-Deret (Shift+Drop Feature)

When user drops a card on an empty stretch of consecutive days (identified by detecting adjacent empty `DayColumn`s), auto-fill:

```typescript
function handleAutoDeret(
  scheduleId: string,
  targetDate: string,
  schedulesByDate: SchedulesByDate
) {
  // Find the dragged schedule
  const sourceSchedule = findSchedule(scheduleId, schedulesByDate);
  if (!sourceSchedule) return;

  // Find the "stretch" of consecutive empty days starting from targetDate
  const date = new Date(targetDate + "T00:00:00");
  const stretch: string[] = [];
  
  for (let i = 0; i < 7; i++) {  // max 7 days
    const dateStr = format(date, "yyyy-MM-dd");
    const daySchedules = schedulesByDate[dateStr];
    const dayNum = date.getDay();
    
    // Skip if weekend (hari Minggu = 0)
    if (dayNum === 0) { date.setDate(date.getDate() + 1); continue; }
    
    // Stop if day already has a schedule for this karyawan
    if (daySchedules?.some(s => s.userId === sourceSchedule.userId)) break;
    
    stretch.push(dateStr);
    date.setDate(date.getDate() + 1);
  }

  if (stretch.length >= 2) {
    // Auto-fill: create duplicate schedules for the entire stretch
    const duplicates = stretch.map(d => ({
      userId: sourceSchedule.userId,
      date: d,
      shiftName: sourceSchedule.shiftName,
      startTime: sourceSchedule.startTime ?? undefined,
      endTime: sourceSchedule.endTime ?? undefined,
    }));
    
    // Show confirmation dialog
    return { action: "auto-deret", count: duplicates.length, schedules: duplicates };
  }
  
  return { action: "single", date: targetDate };
}
```

### Multi-Select + Batch Drag

```typescript
// Shift+Click to select multiple cards
function handleScheduleSelect(scheduleId: string, shiftKey: boolean) {
  setSelectedIds(prev => {
    const next = new Set(prev);
    if (shiftKey) {
      // Toggle (multi-select mode)
      if (next.has(scheduleId)) next.delete(scheduleId);
      else next.add(scheduleId);
    } else {
      // Single select
      next.clear();
      next.add(scheduleId);
    }
    return next;
  });
}

// When dragging with multiple selected:
// - Only the primary card (the one under cursor) is the draggable
// - On drop, all selected cards that match the same karyawan are moved
// - Or: move all selected cards regardless (batch move)
function handleBatchDragEnd(selectedIds: Set<string>, targetDate: string) {
  const updates = Array.from(selectedIds).map(id => ({ scheduleId: id, date: targetDate }));
  // Call bulk update
  bulkUpdateSchedules(updates);
}
```

---

**✅ Plan selesai — semua 6 section telah di-expand secara detail.**
