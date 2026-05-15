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

**Plan complete.** Saya bisa expand bagian-bagian berikut jika diperlukan:

- 🔧 Detail implementasi CRUD hooks (parameter shape, error handling)
- 🗄️ Database migration SQL lengkap (create table, view, grants, indexes)
- 🧩 Detail komponen React dengan props & state management
- 🤖 Prompt AI untuk parsing jadwal
- 📥/📤 Format Excel export/import spec
- ⚡ Drag & drop implementasi detail (DndContext, SortableContext, collision detection)
