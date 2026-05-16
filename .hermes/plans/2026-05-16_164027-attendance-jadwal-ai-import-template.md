# Plan — AI Import Jadwal Attendance dari Spreadsheet / PNG / JPG / PDF

## Goal

Membuat fitur import dan export jadwal di `/admin/operational-team/attendance/jadwal` dengan format roster matrix seperti gambar yang dikirim user. Import harus bisa membaca format tersebut dari spreadsheet/gambar/PDF, lalu memasukkan hasilnya ke kalender attendance dengan mapping nama karyawan yang ada di aplikasi. Export juga harus menghasilkan file roster dengan layout visual yang sama seperti gambar, bukan hanya tabel flat.

Target format utama yang dijadikan patokan:

- Roster bulanan matrix seperti gambar, dengan title dinamis `JADWAL <BULAN> <TAHUN>` dari import source atau selected month.
- Kolom kiri: `MINGGU KE`, `HARI`, `TANGGAL`.
- Header bertingkat: outlet/unit → role → nama staff → detail jam/status kerja.
- Isi sel: label shift dari data/template; jam shift dirender dari pengaturan admin, bukan dari konstanta screenshot.
- Input file: spreadsheet (`.xlsx/.csv`), gambar (`.png/.jpg/.jpeg`), dan PDF (`.pdf`).
- Output export: `.xlsx` roster matrix dengan header/warna/border/weekly section seperti gambar, plus opsi PDF/print-ready bila memungkinkan.

> Mode plan only: belum implementasi kode, belum import data, belum push.

---

## Current context hasil inspeksi

### Existing page & import state

File utama:

- `apps/web/src/routes/admin/operational-team/attendance/jadwal.lazy.tsx`

Status sekarang:

- Halaman kalender sudah ada.
- CRUD jadwal sudah ada via hooks:
  - `useHybridAttendanceSchedules`
  - `useHybridCreateAttendanceSchedule`
  - `useHybridBulkCreateAttendanceSchedules`
  - `useHybridUpdateAttendanceSchedule`
  - `useHybridDeleteAttendanceSchedule`
- Import dialog sudah ada, tapi masih sangat sederhana:
  - hanya menerima paste text di textarea.
  - parsing hanya format `Tanggal | Nama | Shift`.
  - belum benar-benar support upload file.
  - komentar di kode menyebut `AI parsing will be handled via edge function in Phase 2`, tapi Phase 2 belum diimplementasikan.
- Export `.xlsx` sudah ada memakai dynamic import `xlsx`, tetapi format current code masih flat table (`Tanggal`, `Hari`, `Nama Karyawan`, `Role`, `Shift`, `Jam Mulai`, `Jam Selesai`, `Status`, `Catatan`). Plan ini harus rework export agar menjadi roster matrix visual seperti gambar.

### Source of truth jam shift dari pengaturan admin

Halaman `/admin/operational-team/attendance/pengaturan` sudah menyimpan konfigurasi shift ke `siteSettings.shiftSettings`, tepatnya:

```ts
type ShiftSchedule = {
  name: string;
  openTime?: string;
  closeTime?: string;
};

siteSettings.shiftSettings = {
  predefinedShifts: string[];
  shiftSchedules: ShiftSchedule[];
  defaultStartingCash: number;
  reminderMinutesBeforeClose: number;
  autoSendShiftReportEmail: boolean;
};
```

Kode pengaturan:

- `apps/web/src/routes/admin/operational-team/attendance/pengaturan.lazy.tsx`
- `buildShiftSchedules(predefinedShifts, existingSchedules)` menjaga setiap shift punya `name`, `openTime`, `closeTime`.
- `handleSave()` menyimpan `shiftSettings.shiftSchedules` kembali ke site settings.

Kode `/menu` juga sudah membaca source yang sama:

- `apps/web/src/components/pos/menu-sidebar.tsx`
- `selectedShiftSchedule = siteSettings.shiftSettings.shiftSchedules.find(schedule.name === shiftName)`.
- Saat buka/tutup kasir, UI menampilkan `Jadwal shift: {openTime} - {closeTime}` dari pengaturan admin.

Nilai aktif saat plan dibuat sudah diverifikasi dari pengaturan admin, tetapi plan ini sengaja tidak menuliskan jam fixed agar implementasi tidak menyalin angka hardcode.

Kesimpulan plan:

- Jam pada import/export **tidak boleh hardcode** dari gambar.
- Gambar hanya template visual dan contoh format.
- Source-of-truth jam shift harus selalu `siteSettings.shiftSettings.shiftSchedules` dari `/admin/operational-team/attendance/pengaturan`.
- Jika pengaturan berubah, export berikutnya harus otomatis mengikuti jam baru.
- Jika import gambar/spreadsheet berisi jam yang beda dengan pengaturan admin, preview harus menampilkan warning dan menawarkan pilihan:
  1. pakai jam dari pengaturan admin, atau
  2. pakai jam dari file untuk import batch tersebut.

## No-hardcode policy — hanya exception nama yang tidak ada di data karyawan

Implementasi final harus data-driven. Nilai dari screenshot boleh dipakai untuk **membaca contoh input** dan sebagai **fixture test**, tetapi tidak boleh menjadi konstanta production logic.

### Aturan utama

- Tidak boleh ada production constant yang mengunci bulan/tahun, tanggal, jam, nama group, role, urutan kolom, warna, atau Excel cell range dari screenshot.
- Semua nilai harus berasal dari salah satu source berikut:
  1. Data database/app yang sudah ada.
  2. Pengaturan admin.
  3. File/gambar/PDF yang sedang di-import.
  4. Template editable yang disimpan di settings setelah user review.
- Satu-satunya hardcode yang diizinkan: **nama raw dari file import yang tidak ditemukan di data karyawan**, misalnya `TAOFIK`, dan hanya sebagai placeholder/unresolved mapping yang bisa diedit kemudian.
- Placeholder/unresolved name tidak boleh menjadi konstanta source-code permanen. Simpan sebagai data, misalnya:

```ts
siteSettings.raw.attendanceRosterTemplate = {
  unresolvedStaff: Array<{
    rawName: string;        // contoh dari import: "TAOFIK"
    placeholderLabel: string;
    mappedUserId?: string;
    status: 'unresolved' | 'mapped' | 'placeholder';
  }>;
};
```

### Source-of-truth per jenis data

1. **Jam shift**
   - Source: `siteSettings.shiftSettings.shiftSchedules` dari `/admin/operational-team/attendance/pengaturan`.
   - Import boleh membaca jam dari file hanya untuk validasi/mismatch warning.
   - Final default insert/export memakai admin setting.

2. **Bulan, tahun, tanggal, jumlah hari, dan minggu ke-N**
   - Source import: title/body file yang sedang di-import, atau input bulan dari user jika AI/parser tidak yakin.
   - Source export: selected calendar month di halaman jadwal.
   - Jumlah hari dan label minggu dihitung runtime dari bulan/tahun.

3. **Daftar karyawan**
   - Source: `useHybridStaffUsers()` / `pos_staff_users`.
   - Nama yang cocok harus map ke `userId` existing.
   - Nama yang tidak cocok boleh disimpan sebagai unresolved placeholder import yang editable.

4. **Alias/mapping nama**
   - Source awal: hasil fuzzy match terhadap staff database + review user.
   - Jika disimpan, simpan sebagai editable settings, bukan konstanta code.
   - Mapping harus bisa diubah di Import Preview dan/atau pengaturan template.

5. **Group/outlet, role label, dan urutan kolom export**
   - Source import: header file/gambar/PDF.
   - Source export: editable `attendanceRosterTemplate`; fallback dynamic grouping dari live staff data jika template belum ada.
   - Excel merge range dan column letters harus dihitung dari jumlah kolom runtime, bukan fixed range dari screenshot.

6. **Warna/visual Excel**
   - Source: editable template design tokens atau theme defaults generic.
   - Warna dari screenshot boleh dipakai untuk membuat template awal setelah import, tetapi harus tersimpan sebagai data editable.
   - Warna tidak boleh menentukan business logic.

7. **OFF/GENERAL behavior**
   - Source: toggle/settings import-export.
   - `OFF` visible card, skip row, atau status khusus harus pilihan setting, bukan fixed behavior.
   - `GENERAL` tanpa jam harus setting/normalizer rule yang bisa disesuaikan.

8. **REST date range**
   - Source: selected month range runtime.
   - Tidak boleh mengunci date filter ke bulan tertentu.

### Hasil yang diharapkan dari policy ini

- Production code hanya berisi parser/generator generic.
- Screenshot yang dikirim hanya menjadi contoh input + test fixture; month/year tetap dibaca dinamis.
- Template visual seperti gambar tetap bisa dipertahankan karena template-nya disimpan sebagai **data editable**, bukan hardcode.
- Jika nanti staff, shift, outlet, warna, atau bulan berubah, import/export tetap mengikuti data terbaru.

### Existing DB schema attendance schedule

Migration existing:

- `supabase/migrations/20260515000004_jadwal_kehadiran.sql`

Diagram sederhana:

```txt
pos.attendance_schedules
├─ source_id text PK
├─ user_id text NOT NULL FK -> public.yumi_users.source_id
├─ date date NOT NULL
├─ shift_name text NOT NULL
├─ start_time time NULL
├─ end_time time NULL
├─ status text NOT NULL DEFAULT 'scheduled'
│  └─ allowed: scheduled | confirmed | completed | absent | cancelled
├─ note text NULL
├─ created_at timestamptz DEFAULT now()
├─ updated_at timestamptz DEFAULT now()
└─ raw jsonb DEFAULT {}

unique index:
└─ (user_id, date, shift_name)

public.pos_attendance_schedules view
├─ _id = s.source_id
├─ userId = s.user_id
├─ userName = yumi_users.name
├─ userSlug = yumi_users.slug
├─ roleName = yumi_roles.name fallback 'Team'
├─ date
├─ shiftName = s.shift_name
├─ startTime = s.start_time
├─ endTime = s.end_time
├─ status
├─ note
├─ createdAt
├─ updatedAt
└─ raw

REST read path:
└─ GET /rest/v1/pos_attendance_schedules

Write path in frontend:
└─ supabase.schema('pos').from('attendance_schedules')
```

Important constraint:

- `user_id` wajib real user dari `public.yumi_users`.
- Jadi nama staff yang tidak ada di app tidak bisa langsung disimpan sebagai jadwal kecuali:
  1. dimapping ke user yang sudah ada, atau
  2. dibuatkan placeholder `yumi_users` real, atau
  3. disimpan sebagai unresolved preview dan belum diinsert.

### Staff aktif dan mapping nama

Plan sebelumnya pernah mencatat hasil query read-only staff aktif dan contoh mapping dari screenshot. Untuk menghindari hardcode, implementasi final tidak boleh menyimpan daftar/mapping tersebut sebagai konstanta.

Aturan final:

- Staff aktif harus selalu dibaca runtime dari `useHybridStaffUsers()` / `pos_staff_users`.
- Nama yang ada di file/gambar harus dicocokkan ke live staff memakai normalisasi/fuzzy match.
- Semua hasil match harus tampil di Import Preview dan bisa diubah user sebelum insert.
- Mapping yang disetujui user boleh disimpan sebagai data editable di `siteSettings.raw.attendanceRosterTemplate.staffAliases`.
- Satu-satunya raw name yang boleh tetap tidak termapping adalah nama yang memang tidak ada di data karyawan, misalnya `TAOFIK`; statusnya harus `unresolved`/placeholder dan tetap editable kemudian.

### Existing AI/Edge Function capability

Edge function existing:

- `supabase/functions/yumi-ai/index.ts`

Capability yang relevan:

- Sudah punya action `yumiChat`.
- `yumiChat` sudah support `images` array dan menggunakan vision model saat ada gambar.
- Sudah ada action `bulkScanImageData`, tapi promptnya khusus struk/nota, bukan roster attendance.

Kesimpulan:

- Untuk PNG/JPG, paling cepat adalah menambah action baru di `yumi-ai`, misalnya `parseAttendanceSchedule`, memakai capability vision yang sudah ada.
- Untuk spreadsheet, parsing lebih akurat dilakukan client-side dengan `xlsx`, lalu hasil matrix dikirim ke normalizer lokal. AI hanya fallback jika header/format tidak jelas.
- Untuk PDF:
  - PDF text: extract text/table dulu.
  - PDF scan/image: render halaman ke image, lalu kirim ke action vision yang sama.

---

## Format gambar yang harus dijadikan patokan import

### Struktur input matrix

```txt
JADWAL <BULAN> <TAHUN>

MINGGU KE | HARI | TANGGAL | <RAW_STAFF_1> | <RAW_STAFF_2> | <UNRESOLVED_STAFF?> | ...
          |      |         | <ROLE/GROUP HEADER FROM FILE>

<Minggu Ke N> | <HARI> | <Tanggal Dinamis> | <SHIFT_LABEL_FROM_FILE> | <SHIFT_LABEL_FROM_FILE> | <OFF/GENERAL?> | ...
...
<Last week label> | <HARI> | <Tanggal terakhir bulan> | ...
```

### Canonical normalized output yang harus dihasilkan parser

Parser/AI harus menghasilkan JSON bentuk flat, bukan matrix:

```ts
type ParsedAttendanceImport = {
  source: {
    fileName?: string;
    fileType: 'xlsx' | 'csv' | 'png' | 'jpg' | 'pdf' | 'text';
    month: number;
    year: number;
    title?: string;
  };
  staffColumns: Array<{
    rawName: string;       // raw name from import header
    outlet?: string;       // group/outlet label parsed from import or saved template
    role?: string;         // role label parsed from import or live staff data
    contractLabel?: string;// optional label parsed from import/template
  }>;
  rows: Array<{
    date: string;          // ISO date generated from detected/selected month
    dayName?: string;      // parsed/generated day name
    weekLabel?: string;    // generated week label
    rawStaffName: string;  // raw name from imported file
    rawShiftText: string;  // raw shift text from imported file
    shiftName: string;     // normalized shift label
    startTime?: string;    // resolved from admin settings by default
    endTime?: string;      // resolved from admin settings by default
    status: 'scheduled' | 'off' | 'general';
    confidence?: number;
  }>;
  warnings: Array<{
    type: 'unreadable_cell' | 'date_mismatch' | 'unknown_shift' | 'unknown_staff' | 'duplicate';
    message: string;
    rowIndex?: number;
    rawStaffName?: string;
    date?: string;
  }>;
};
```

### Shift normalization rules

Source-of-truth shift adalah `siteSettings.shiftSettings.shiftSchedules` dari `/admin/operational-team/attendance/pengaturan`.

Current active settings sudah diverifikasi pernah sesuai dengan contoh gambar, tetapi implementation tidak boleh menyimpan jam tersebut sebagai konstanta; harus query `shiftSettings` runtime.

Parser harus membaca label dari file/gambar, lalu mencocokkan ke shift setting admin:

```txt
<SHIFT_LABEL_FROM_FILE> / <Configured shift name> / <SHIFT_LABEL_WITH_OPTIONAL_TIME>
-> match ke shift schedule name dari admin settings
-> startTime/endTime default dari admin setting: openTime/closeTime
-> jika file mencantumkan jam berbeda dari admin setting, tampilkan warning mismatch di preview

<ANOTHER_SHIFT_LABEL_FROM_FILE> / <Configured shift name> / <SHIFT_LABEL_WITH_OPTIONAL_TIME>
-> match ke shift schedule name dari admin settings
-> startTime/endTime default dari admin setting: openTime/closeTime
-> jika file mencantumkan jam berbeda dari admin setting, tampilkan warning mismatch di preview

OFF
-> preferred: visible OFF marker in calendar, but not a real work shift
-> implementation choice below

GENERAL
-> shiftName: GENERAL, startTime/endTime null, status scheduled
```

Time parser tetap perlu normalize jam dari input untuk validasi/mismatch detection:

```txt
H.mm / HH.mm / HH:mm -> normalized HH:mm
HH.mm - HH.mm -> normalized HH:mm / HH:mm
```

---

## Alternatives analysis — handling staff not found in app

### Option A — Skip unmatched rows until mapped

| Pros | Cons |
|---|---|
| Safest DB integrity; no fake employee rows | Taofik schedule will not enter calendar until mapped |
| No schema/user side effects | User may expect all image data imported immediately |
| Easy to implement with preview warnings | Requires manual follow-up |

### Option B — Auto-create placeholder employee for unmatched staff

| Pros | Cons |
|---|---|
| All schedule cells from image can be imported immediately | Creates temporary/fake employee in operational team data |
| Taofik can appear in calendar and be edited later | Can affect staff list, payroll, attendance, reports if not flagged clearly |
| Clean FK because placeholder is real `yumi_users` row | Needs careful creation flow and role assignment |

### Option C — Store unmatched as hardcoded virtual staff only in frontend

| Pros | Cons |
|---|---|
| Fastest and matches “hardcode dulu” wording | Cannot be saved to `pos.attendance_schedules` due FK `user_id` |
| Good for preview/edit mapping | Calendar persistence impossible until real mapping exists |

### Recommendation

Use hybrid approach:

1. Add a default hardcoded alias map in code for known names from this image.
2. Store/import unresolved names in preview as `unmatched`, not silently skipped.
3. For `TAOFIK`, show row as missing staff and provide two actions:
   - `Pilih karyawan existing` from dropdown, or
   - `Buat placeholder karyawan` with visible label `TAOFIK (Placeholder Import)`.
4. Persist alias override in `pos_site_settings.raw.attendanceImportAliases` or central frontend config so it can be edited later without hunting through parser code.

This satisfies:

- “pastikan dengan nama karyawan yang ada pada aplikasi ini” → existing names mapped first.
- “jika tidak ada hardcode saja dulu” → default alias/hardcoded unmatched placeholder exists.
- “pastikan bisa di edit kemudian hari” → import preview + alias settings make it editable later.

---

## Alternatives analysis — handling OFF cells

### Option A — Do not insert OFF rows

| Pros | Cons |
|---|---|
| Semantically clean: no shift means off | Calendar will not visibly show OFF from spreadsheet |
| No DB/status change needed | Spreadsheet fidelity lower |

### Option B — Insert OFF as `shiftName='OFF'`, `status='cancelled'`

| Pros | Cons |
|---|---|
| OFF visible in calendar without DB migration | Uses `cancelled` status for an OFF concept |
| Easy to edit/delete later | Need UI special-case red OFF display |

### Option C — Add new status `off`

| Pros | Cons |
|---|---|
| Semantically correct | Needs DB migration to change status check constraint |
| Cleaner long-term reporting | Slightly bigger scope and Supabase push required |

### Recommendation

Phase 1:

- Insert OFF only if user enables `Sertakan OFF di kalender`.
- Store OFF as:

```ts
{
  shiftName: 'OFF',
  startTime: null,
  endTime: null,
  status: 'cancelled',
  raw: { importStatus: 'off', rawShiftText: 'OFF' }
}
```

- Update calendar card display to show `OFF` as red/rest marker when `shiftName === 'OFF'`.

Phase 2 optional:

- Add DB migration to support `status='off'` if reports need to distinguish OFF from cancelled.

---

## Proposed implementation approach

### Phase 1 — Parser and preview first, no blind DB write

Build import as a staged flow:

```txt
Upload/Paste
  ↓
Extract matrix/text
  ↓
Normalize to canonical rows
  ↓
Map staff names to app users
  ↓
Preview table with warnings/conflicts
  ↓
Confirm import
  ↓
Bulk replace/upsert into pos.attendance_schedules
  ↓
Refresh calendar
```

Key principle:

- Never write directly after AI response.
- Always show preview with confidence, mapping, duplicate policy, and missing staff warnings.

### Phase 2 — File type handlers

1. Spreadsheet `.xlsx/.csv`
   - Use existing `xlsx` dependency/client import.
   - Read merged-like header rows and matrix body.
   - Convert to canonical rows locally.
   - AI fallback only if header detection fails.

2. PNG/JPG/JPEG
   - Read as base64/data URL in browser.
   - Call `supabase.functions.invoke('yumi-ai', { action: 'parseAttendanceSchedule', images: [...] })`.
   - Use strict JSON schema prompt based on the uploaded source format and generic roster schema.

3. PDF
   - Text PDF: extract text/table with `pdfjs-dist` or server action.
   - Scanned PDF: render pages to canvas images, send to the same vision action.
   - Limit pages/size, show warning if file too large.

### Phase 3 — DB write strategy

Add new hook/service behavior:

- `parseAttendanceImport(...)` → returns canonical rows.
- `resolveAttendanceImportMappings(...)` → maps raw staff names to app `userId`.
- `bulkReplaceAttendanceSchedules(...)` or extend `bulkCreate`:
  - default mode for monthly roster: replace schedules for included users/date range before insert.
  - alternative mode: append and skip duplicates.

Recommended import modes:

```txt
Append only
- insert new rows, skip duplicates

Replace included users in selected month [recommended default for this image]
- delete existing rows for mapped users/date range
- insert parsed rows
```

Why replace mode matters:

- Existing unique index is `(user_id, date, shift_name)`.
- If user changes from `PAGI` to `SORE`, append mode can leave both rows unless old row is deleted.
- Monthly roster import should be treated as source of truth for that month.

---

## UI/UX specification

### Import dialog redesign

Path:

- likely keep inside `jadwal.lazy.tsx` initially, but better extract to component after it grows.

UI stages:

1. **Upload / Paste**
   - Tabs:
     - `Upload File`
     - `Paste Spreadsheet`
   - Accept:
     - `.xlsx`, `.csv`, `.png`, `.jpg`, `.jpeg`, `.pdf`
   - Helper text:
     - “Format yang didukung: jadwal matrix bulanan seperti contoh gambar.”
   - Small sample screenshot/template explanation.

2. **AI/Parser Processing**
   - State: `Membaca header staff`, `Membaca tanggal`, `Menormalkan shift`, `Mencocokkan nama karyawan`.
   - Show file name and detected month/year.

3. **Preview**
   - Summary cards:
     - total dates
     - total staff columns
     - total schedule cells
     - mapped staff
     - missing staff
     - warnings
   - Preview table columns:
     - Date
     - Hari
     - Raw Name
     - App User
     - Role
     - Shift
     - Time
     - Status
     - Confidence
     - Action
   - Filters:
     - `Semua`
     - `Butuh Mapping`
     - `Warning`
     - `OFF`
     - `PAGI/SORE/GENERAL`

4. **Mapping editor**
   - For each raw staff name:
     - display raw spreadsheet name.
     - dropdown app user.
     - role/outlet from header.
     - warning if role differs.
   - Alias map must be generated from live staff fuzzy matching + saved editable mappings.
   - Do not create a production default alias object for existing staff.
   - Only unresolved names not found in karyawan data, e.g. `TAOFIK`, may remain as editable placeholder data.

5. **Import confirmation**
   - Options:
     - `Replace jadwal bulan ini untuk karyawan yang terdeteksi`.
     - `Append tanpa hapus existing`.
     - `Sertakan OFF di kalender`.
     - `Buat placeholder untuk staff missing` (requires explicit checkbox).
   - Confirmation copy:
     - “Akan mengimport X jadwal untuk <Bulan Tahun>. Existing schedule untuk karyawan terkait akan diganti.”

### Calendar display after import

- Work shifts:
  - Pagi/Sore/General show like normal schedule card.
- OFF marker if enabled:
  - card compact red/muted, label `OFF`, no time.
- Cards remain editable using existing QuickAddPanel/Edit flow.
- Hardcoded/placeholder staff should be clearly labeled in `raw` and possibly note:
  - `Imported placeholder — edit mapping later`.

### Export format must match the provided image

Export dari `/admin/operational-team/attendance/jadwal` harus menjadi kebalikan dari import: data kalender bulanan diflatten dari `pos_attendance_schedules`, lalu dibentuk kembali menjadi spreadsheet matrix yang layout-nya sama seperti gambar.

#### Required export variants

1. **Excel `.xlsx` — wajib Phase 1**
   - File utama untuk edit ulang di spreadsheet.
   - Harus mempertahankan matrix roster, warna shift, border, merged header, dan weekly separators.

2. **PDF / print-ready — optional Phase 1, recommended Phase 2**
   - Bisa dibuat dari HTML print view atau workbook-to-PDF flow.
   - Target: landscape A4/A3, 1 bulan muat dalam 1 halaman lebar bila memungkinkan.

3. **PNG/JPG snapshot — optional Phase 2**
   - Berguna untuk kirim ke WhatsApp/Telegram.
   - Bisa render dari HTML table export preview.

#### Export workbook layout

Sheet name:

```txt
Jadwal <Bulan> <Tahun>
```

Top header rows:

```txt
Row 1:
<left title merge> = JADWAL <BULAN> <TAHUN> [template color]
<dynamic group merge 1> = <GROUP_LABEL_FROM_TEMPLATE> [template color]
<dynamic group merge 2> = <GROUP_LABEL_FROM_TEMPLATE> [template color]
<dynamic group merge N> = <GROUP_LABEL_FROM_TEMPLATE> [template color]

Row 2:
A2 = MINGGU KE
B2 = HARI
C2 = TANGGAL
<dynamic role row> = <ROLE_LABEL_FROM_TEMPLATE_OR_LIVE_STAFF>

Row 3:
A3 = MINGGU KE
B3 = HARI
C3 = TANGGAL
<dynamic staff row> = staff names from live staff/template; only unresolved names such as TAOFIK remain as editable placeholders
```

Body rows:

```txt
A = Minggu Ke 1..5
B = HARI uppercase Indonesia: SENIN, SELASA, RABU, KAMIS, JUMAT, SABTU, MINGGU
C = date label generated from selected/detected month
D..L = shift cell per staff/date
```

Shift cell values:

```txt
PAGI ({admin Shift Pagi openTime in dot format} - {admin Shift Pagi closeTime in dot format})
SORE ({admin Shift Sore openTime in dot format} - {admin Shift Sore closeTime in dot format})
OFF
GENERAL
```

For current active admin settings, examples render like the screenshot, but implementation must compute this at runtime from `shiftSettings`:

```txt
PAGI ({openTime dot} - {closeTime dot})
SORE ({openTime dot} - {closeTime dot})
OFF
GENERAL
```

Important formatting:

- Use dot time format for export display by converting runtime admin setting `HH:mm` to `HH.mm`; do not store fixed example times in production code.
- Export display times must be generated from `siteSettings.shiftSettings.shiftSchedules` first; DB row `startTime/endTime` is fallback only for custom/imported shifts not found in settings.
- If admin changes `/attendance/pengaturan` later, newly exported roster must reflect the new `openTime/closeTime` automatically.
- Header group colors:
  - Title header: color from editable template/theme token.
  - Group headers: colors from editable template/theme token.
  - Additional group headers: colors from editable template/theme token.
  - Management/other group headers: colors from editable template/theme token.
- Shift colors:
  - Shift labels/colors resolved from editable template; default can be generated from imported source.
  - No shift color may be hardcoded to a business rule; it is display config only.
  - OFF color comes from editable template/settings.
  - GENERAL color comes from editable template/settings.
- Borders:
  - thin border for all cells.
  - thick black horizontal border between `Minggu Ke 1`, `Minggu Ke 2`, etc.
  - thick outer border for whole table.
- Alignment:
  - center horizontal/vertical for all roster cells.
  - wrap text on shift cells.
  - bold header rows.
- Dimensions:
  - left columns narrow: week/day/date.
  - staff columns auto-width based on longest rendered shift label from runtime data.
  - frozen header rows optional.
- Print setup:
  - landscape orientation.
  - fit-to-width 1 page.
  - small margins.
  - repeat header rows when printed.

#### Export data grouping rules

Export should not hardcode only this image's staff forever. It should support two modes:

1. **Template mode — image-compatible, data-driven**
   - Uses order/group parsed from import header or saved editable template, not source-code constants.

```txt
<Group Label> / <Role Label>: <staff columns from imported template/live staff>
<Group Label> / <Role Label>: <staff columns from imported template/live staff>
<Other Group>: <live staff columns and/or unresolved placeholders>
```

   - Existing names are display aliases from imported file/template and must map back to app users via runtime matching or saved editable mapping.
   - Missing staff like `TAOFIK` can still appear as a column if placeholder/mapping exists; otherwise column remains blank with note metadata.

2. **Dynamic mode — app user based**
   - Groups by `roleName` from `pos_staff_users` / `pos_attendance_schedules`.
   - Useful for future months if staff list changes.
   - Admin can reorder staff before export.

Recommended default:

- Use **Template mode** when month has schedules imported from this template or when user selects `Export format gambar`.
- Store chosen staff order/grouping in editable `siteSettings.raw.attendanceRosterTemplate`; derive from import source or live staff, never fixed in code.

#### Export technical note

The existing `xlsx` package can create workbook data, merges, widths, and basic sheet metadata. If styling support is insufficient in the installed package, implementation should switch the export writer to `exceljs` for reliable colors/borders/alignment/print setup.

Preferred implementation:

- Keep `xlsx` for import parsing if already working.
- Use `exceljs` for styled export `.xlsx` if style fidelity is required.
- If adding `exceljs` is too heavy for browser bundle, dynamically import it only inside `handleExportImageFormat()`.

#### Export UI additions

In export dialog:

- Add format selector:
  - `Excel — format gambar / roster matrix`
  - `Excel — table flat` (optional legacy/debug)
  - `PDF print-ready` (optional)
  - `PNG/JPG` (optional)
- Add options:
  - `Gunakan urutan template gambar`
  - `Group berdasarkan role/outlet`
  - `Sertakan OFF`
  - `Sertakan GENERAL`
  - `Landscape print setup`
- Preview mini table before downloading if possible.

---

## Integration points

### AI / LLM integration

File:

- `supabase/functions/yumi-ai/index.ts`

Add action:

```ts
type AiAction = ... | 'parseAttendanceSchedule';
```

Input shape:

```ts
{
  action: 'parseAttendanceSchedule',
  fileType: 'png' | 'jpg' | 'pdf-image' | 'text',
  images?: string[],
  text?: string,
  monthHint?: number,
  yearHint?: number,
  staffHints?: Array<{ name: string; roleName: string }>,
  shiftHints?: Array<{ name: string; openTime?: string; closeTime?: string }> // must come from siteSettings.shiftSettings.shiftSchedules
}
```

Output must be strict JSON matching `ParsedAttendanceImport`.

Prompt guardrails:

- Use the provided roster image format as canonical.
- Preserve every date row generated from detected/selected month.
- Preserve every staff column.
- Normalize times to `HH:mm`, then compare against `shiftHints` from admin settings.
- Prefer admin `openTime/closeTime` for final `startTime/endTime` when shift name matches a configured shift.
- If the file/image time differs from admin setting, return warning `shift_time_mismatch` instead of silently using the file time.
- Do not guess unreadable cells silently; output warning with `confidence < 0.8`.
- If cell text is blank/unreadable, return `unknown_shift` warning.
- Never invent user IDs; only output raw staff names.

### Telegram bot integration

Not required for Phase 1.

Possible Phase 2:

- Allow sending schedule screenshot/PDF to Telegram bot group.
- Bot replies with parsed preview link or sends parsed JSON to admin page.
- Reuse same `parseAttendanceSchedule` edge function.

### Purchasing agent / finance sync

Not directly relevant.

But schedule import affects operational staffing and could later feed:

- labor cost forecast.
- payroll attendance comparisons.
- shift coverage analytics.

---

## Multi-source data flow

```txt
Source file / image / PDF
  ↓
ImportDialog file reader + siteSettings.shiftSettings.shiftSchedules
  ├─ spreadsheet path: xlsx/csv parser
  ├─ image path: yumi-ai parseAttendanceSchedule vision
  └─ pdf path: pdf text/image extraction → parser/AI
  ↓
attendance-schedule-import normalizer
  ├─ resolves shift label to admin configured shift name
  ├─ uses admin openTime/closeTime as final schedule time
  └─ emits warning if source file time differs from admin setting
  ↓
Staff alias resolver
  ├─ live staff: useHybridStaffUsers() / pos_staff_users
  ├─ runtime fuzzy match against live staff data
  ├─ saved editable mappings: siteSettings.raw.attendanceRosterTemplate.staffAliases
  └─ unresolved placeholders for names not found in karyawan data
  ↓
Preview + editable mapping
  ↓
Confirm import
  ↓
pos.attendance_schedules write
  ├─ replace included month/users, or
  └─ append skip duplicates
  ↓
public.pos_attendance_schedules view
  ↓
useHybridAttendanceSchedules()
  ↓
/admin/operational-team/attendance/jadwal calendar
```

Export flow:

```txt
/admin/operational-team/attendance/jadwal calendar month
  ↓
useHybridAttendanceSchedules() / public.pos_attendance_schedules
  + useHybridSiteSettings().shiftSettings.shiftSchedules
  ↓
attendance-schedule-export builder
  ├─ template mode: editable imported/saved grouping/order
  └─ dynamic mode: role/user based grouping/order
  ↓
monthly roster matrix
  ├─ Row 1-3 merged/grouped headers
  ├─ Week/day/date left columns
  ├─ Staff columns
  └─ Colored shift cells
  ↓
Excel .xlsx styled export
  ├─ optional PDF print-ready
  └─ optional PNG/JPG snapshot
```

---

## Files likely to change

### Frontend

1. `apps/web/src/routes/admin/operational-team/attendance/jadwal.lazy.tsx`
   - Replace simple ImportDialog with staged import dialog.
   - Wire preview → confirm import → refresh calendar.
   - Add OFF display handling if storing OFF marker.

2. New recommended file: `apps/web/src/lib/attendance-schedule-import.ts`
   - Parser/normalizer types.
   - Spreadsheet matrix parser.
   - Text parser fallback.
   - Staff alias resolver.
   - Shift/time normalizer.
   - Validation and warning generation.

3. New recommended file: `apps/web/src/lib/attendance-import-template.ts`
   - Generic template model + editable template serializer/deserializer.
   - Alias resolver berbasis live staff data + saved editable mappings.
   - Export grouping/order from editable `attendanceRosterTemplate` or dynamic live-staff fallback.
   - Header color tokens, shift color tokens, and display labels.
   - Shift aliases:
     - `PAGI`, `SHIFT PAGI`, `PAGI (...)` → resolve to matching admin setting name, usually `Shift Pagi`.
     - `SORE`, `SHIFT SORE`, `SORE (...)` → resolve to matching admin setting name, usually `Shift Sore`.
     - `OFF`, `LIBUR`.
     - `GENERAL`.
   - Do not store hardcoded times in template constants; derive display time from `shiftSettings.shiftSchedules`.

4. New recommended file: `apps/web/src/lib/attendance-schedule-export.ts`
   - Convert `AttendanceSchedule[]` into roster matrix rows/columns.
   - Build image-compatible template mode.
   - Build dynamic role/user grouping mode.
   - Format admin setting times (`HH:mm`) into `HH.mm` spreadsheet display.
   - Resolve each shift's export time from `siteSettings.shiftSettings.shiftSchedules`; fallback to row `startTime/endTime` only for custom shifts.
   - Generate styled `.xlsx` workbook with merged headers, colors, borders, widths, and print setup.
   - Optional helpers for PDF/PNG export preview.

5. Optional extraction: `apps/web/src/components/attendance/AttendanceImportDialog.tsx`
   - If `jadwal.lazy.tsx` becomes too large.

6. Optional extraction: `apps/web/src/components/attendance/AttendanceExportDialog.tsx`
   - Keep export UI separate from calendar page once matrix export options are added.

7. `apps/web/src/hooks/use-hybrid-attendance-schedules.ts`
   - Extend `CreateScheduleInput`:

```ts
type CreateScheduleInput = {
  userId: string;
  date: string;
  shiftName: string;
  startTime?: string;
  endTime?: string;
  note?: string;
  status?: AttendanceSchedule['status'];
  raw?: Record<string, unknown>;
};
```

   - Add bulk replace helper:

```ts
bulkReplaceByMonthAndUsers(inputs, { startDate, endDate, userIds, includeOff })
```

### Package dependency note

- If current `xlsx` writer cannot produce reliable styles, add `exceljs` as browser dynamic export dependency.
- Keep dependency dynamic-loaded only from export action to avoid increasing initial admin bundle.

### Supabase Edge Function

8. `supabase/functions/yumi-ai/index.ts`
   - Add `parseAttendanceSchedule` action.
   - Reuse existing OpenAI/vision infrastructure.
   - Return strict JSON.

### Supabase migration

No required DB migration for Phase 1 if we store import metadata in existing `raw` JSONB and represent OFF via `shiftName='OFF'` + `status='cancelled'`.

Optional migration for Phase 2:

- Add status `off` by replacing attendance schedule check constraint.
- Optional table for persistent aliases if site settings raw is not enough:

```txt
pos.attendance_import_aliases
├─ source_id text PK
├─ raw_name text not null
├─ user_id text null FK -> public.yumi_users.source_id
├─ role_hint text null
├─ outlet_hint text null
├─ is_placeholder boolean default false
├─ created_at timestamptz
├─ updated_at timestamptz
└─ raw jsonb
```

---

## Step-by-step implementation plan

### Step 1 — Freeze import template contract

- Add TypeScript types for `ParsedAttendanceImport`, `ParsedAttendanceRow`, `ImportWarning`, `StaffMapping`.
- Add generic template builder; do not hardcode screenshot staff/group/order in production source.
- Add alias resolver from live staff + saved mappings; only unresolved import names may be persisted as editable placeholders.
- Add `ShiftSettings` resolver that reads `siteSettings.shiftSettings.shiftSchedules` and treats it as source-of-truth for `startTime/endTime`.

### Step 2 — Build deterministic spreadsheet parser

- Parse `.xlsx/.csv` matrix locally.
- Detect:
  - month/year from dynamic title pattern `JADWAL <BULAN> <TAHUN>`.
  - date column from `TANGGAL`.
  - staff columns from header rows.
  - role/outlet from merged/header rows if present.
- Flatten matrix into canonical rows.
- Compare file-provided shift times with admin `shiftSchedules`; add warning if mismatched.
- Final persisted schedule time uses admin `openTime/closeTime` by default when shift label matches configured shift.

### Step 3 — Add AI parser for image/PDF fallback

- Add `parseAttendanceSchedule` action to `yumi-ai`.
- Prompt model with strict JSON schema and this exact roster pattern.
- Pass current app staff names and shift templates as hints.
- Validate response on frontend before preview.

### Step 4 — Build mapping resolver

Resolution order:

1. Exact normalized name match.
2. Default alias map.
3. Fuzzy match by token similarity.
4. Manual mapping in preview.
5. Optional placeholder creation.

Normalize names by:

- uppercase.
- trim extra spaces.
- remove punctuation.
- support nickname fragments:
  - Raw imported staff names are fuzzy-matched against live staff data.
  - Matched aliases are reviewed/editable before import.
  - Only unresolved names may remain as placeholder/import names.

### Step 5 — Redesign import dialog with preview

- Convert ImportDialog from textarea-only into staged dialog.
- Add upload input.
- Add preview table.
- Add staff mapping editor.
- Add duplicate/import mode selector.
- Add warning list.
- Disable final import until all required staff are mapped or explicitly skipped/placeholder-approved.

### Step 6 — Implement safe bulk write

- Add `bulkReplaceAttendanceSchedules` path.
- For replace mode:
  - delete existing schedules for imported user IDs and date range.
  - insert normalized records.
- Add import metadata to `raw`:

```json
{
  "source": "attendance_import",
  "sourceType": "png",
  "sourceTitle": "JADWAL <BULAN> <TAHUN>",
  "importBatchId": "...",
  "rawStaffName": "<RAW_STAFF_NAME>",
  "rawShiftText": "<RAW_SHIFT_TEXT>",
  "outlet": "DJIWA TENTRAM",
  "roleHint": "BARISTA",
  "confidence": 0.94,
  "aliasMatchedBy": "default_alias"
}
```

### Step 7 — Build image-style export matrix

- Replace/extend existing flat `handleExport`.
- Add `buildAttendanceRosterMatrix()` using the same canonical template as import.
- Generate workbook rows:
  - 3 header rows.
  - 1 row per date in selected month.
  - staff columns in image-compatible order.
- Resolve shift label/time from admin `siteSettings.shiftSettings.shiftSchedules`:
  - configured shift name → export display `{label} ({openTime dot} - {closeTime dot})`.
  - additional configured shifts follow the same runtime resolver.
  - fallback to row `startTime/endTime` only when shift not found in admin settings.
- Apply styles:
  - merged top headers.
  - colored role/outlet headers.
  - colored shift cells.
  - thick weekly separators.
  - landscape print setup.
- Add export dialog option `Excel — format gambar / roster matrix` as default.
- Keep flat export only as optional legacy/debug mode if useful.
- Validate round-trip: exported `.xlsx` should be readable again by the new import parser.

### Step 8 — Apply image roster import

After implementation, use the provided image as the first live test.

Expected mapping review:

```txt
<RAW_NAME_FROM_IMAGE> -> <LIVE_STAFF_MATCH> [editable]
TAOFIK -> requires manual mapping or placeholder
<RAW_NAME_FROM_IMAGE> -> <LIVE_STAFF_MATCH> [editable]
```

Important: do not encode existing staff mappings as source-code constants; they must come from runtime matching + user-approved editable mapping data.

Before committing import:

- Confirm how to handle `TAOFIK`.
- Confirm whether OFF should appear as visible calendar cards.
- Confirm duplicate mode: recommended `replace included users in selected/detected month`.

---

## Validation / tests

### Parser tests

Create test fixtures from this roster pattern:

- Dynamic title detection: `JADWAL <BULAN> <TAHUN>`; screenshot-specific month exists only inside test fixture data.
- Date count generated from detected month/year; fixture-specific expected count stays inside test fixture only.
- Staff column count detected dynamically from header rows.
- Shift labels with optional times normalize to `HH:mm` / `HH:mm`, then confirm against admin shift settings.
- Multiple configured shifts are tested using mock admin settings, not fixed screenshot times.
- If admin settings are changed, expected parser/export tests must use the changed `openTime/closeTime`, not fixed example times.
- `OFF` maps to configured off strategy.
- `GENERAL` maps to no-time general shift.

### Frontend checks

- `npx tsc --noEmit --pretty false` filtered to attendance files.
- Open route `/admin/operational-team/attendance/jadwal`.
- Import dialog opens.
- Upload `.xlsx` sample → preview appears.
- Upload image sample → AI response parsed → preview appears.
- Missing staff blocks import until mapped/placeholder-approved.
- Import refreshes calendar.
- Existing edit/delete still works on imported cards.

### Export checks

- Export selected month as `Excel — format gambar / roster matrix`.
- Workbook should contain sheet `Jadwal <Bulan> <Tahun>`.
- Header rows match image layout:
  - `JADWAL <BULAN> <TAHUN>` merged over left columns, using selected month dynamically.
  - outlet/role/name header rows grouped and colored.
- Body contains all dates in selected month, including blank dates if no schedule.
- Shift cell display matches image format and admin settings:
  - Shift times are rendered from current admin `shiftSettings`; if admin changes `/attendance/pengaturan`, export reflects the new times.
  - `OFF` red if included.
  - `GENERAL` grey.
- Weekly separators are generated between runtime week groups in the selected month.
- Open exported `.xlsx` in spreadsheet app and visually compare against reference image.
- Re-import exported `.xlsx`; parser should read the same staff/date/shift matrix without manual cleanup.

### Supabase runtime checks

After import:

- Verify rows via REST:

```txt
GET /rest/v1/pos_attendance_schedules?date=gte.<monthStart>&date=lte.<monthEnd>
```

- Confirm `raw.importBatchId` exists on imported rows.
- Confirm no duplicate rows for same `userId/date` after replace mode.
- Confirm PostgREST schema cache reload only needed if a migration is added.

### Edge function checks

If `yumi-ai` is modified:

- Deploy function.
- Invoke `parseAttendanceSchedule` with one image.
- Ensure response is strict JSON, no markdown fences.
- Test AI failure path returns useful warning, not broken UI.

---

## Risks and mitigations

### Risk: OCR/AI misreads small spreadsheet cells

Mitigation:

- Prefer `.xlsx` original when available.
- For images, show confidence and preview before save.
- Never auto-write without confirmation.

### Risk: Staff name mismatch

Mitigation:

- Use alias map + fuzzy match + manual mapping.
- Persist mapping overrides.
- Flag role mismatches whenever imported role label differs from live staff role; do not hardcode a specific mismatch pair.

### Risk: Missing Taofik

Mitigation:

- Do not silently map to wrong user.
- Show as missing.
- Allow explicit placeholder creation or manual mapping.

### Risk: Duplicate/old schedule remains

Mitigation:

- Default monthly roster import to replace mode for included users/date range.
- Store import batch metadata for audit.

### Risk: OFF semantics unclear

Mitigation:

- Add toggle `Sertakan OFF di kalender`.
- If enabled in Phase 1, use `shiftName='OFF'`, `status='cancelled'`, and `raw.importStatus='off'`.
- Consider DB `status='off'` migration only if reporting needs it.

### Risk: Import/export time drifts from admin shift settings

Mitigation:

- Treat `/admin/operational-team/attendance/pengaturan` as the only source-of-truth for configured shift times.
- Use `siteSettings.shiftSettings.shiftSchedules` in import preview, final insert, and export renderer.
- Never hardcode shift times in production code; test fixtures may include screenshot examples only under test files.
- Add mismatch warning when source file time differs from admin setting.
- Add regression test by temporarily using mock settings with different times and ensuring export output changes.

### Risk: Styled Excel export not faithful with current writer

Mitigation:

- Verify whether current `xlsx` writer can preserve fill/border/alignment in browser export.
- If not, use `exceljs` for export only.
- Keep export matrix builder independent from workbook writer so the same data can feed Excel, PDF, or PNG later.
- Validate by opening the exported workbook and visually comparing against the image template.

---

## Open questions before implementation

1. Untuk `TAOFIK`, apakah ingin:
   - pilih mapping ke user yang sudah ada,
   - buat placeholder `TAOFIK (Placeholder Import)`, atau
   - skip dulu sampai user dibuat resmi?

2. Untuk `OFF`, apakah harus tampil di kalender sebagai card merah `OFF`, atau cukup kosong/tidak ada jadwal?

3. Untuk import dari gambar ini, apakah source final hanya screenshot ini, atau ada file Excel asli? Excel asli akan jauh lebih akurat daripada OCR gambar.

4. Untuk duplicate behavior, setuju default `replace jadwal bulan tersebut untuk karyawan yang diimport`?

5. Untuk export, apakah default harus selalu `format gambar / roster matrix`, dan flat table lama cukup dijadikan opsi legacy/debug?

6. Jika jam di file import berbeda dengan jam admin setting, default plan saat ini adalah pakai jam admin dan tampilkan warning. Apakah setuju, atau file import boleh override jam admin per batch?

---

## Implementation guardrails — no screenshot hardcode in production

Before coding, enforce these guardrails:

1. No production array of existing staff names; staff arrays must come from imported file data, live staff data, or saved editable settings. Only unresolved missing names may persist as placeholder data.
2. No production constants for specific shift times; shift times come from admin settings.
3. No fixed month/date assumptions; export/import use runtime selected/detected month.
4. No fixed Excel column ranges; generate merges from template model.
5. No fixed outlet/role grouping; group/order comes from import header or editable saved template.
6. The only raw name that may remain without DB match is an unresolved staff placeholder from import, stored as data and editable later.
7. Add tests that fail if export builder requires screenshot-specific constants outside fixtures.

## Recommended first implementation slice

Agar cepat tapi aman:

1. Implement parser/normalizer + alias mapping.
2. Implement `ShiftSettings` resolver dari `siteSettings.shiftSettings.shiftSchedules`.
3. Implement upload `.xlsx/.csv` dan paste text.
4. Implement image AI parser lewat `yumi-ai.parseAttendanceSchedule`, passing `shiftHints` dari admin settings.
5. Implement preview + manual mapping + warning `shift_time_mismatch`.
6. Implement replace import dengan final time dari admin settings by default.
7. Implement export `.xlsx` roster matrix format gambar as default export, dengan jam dari admin settings.
8. Test round-trip: import roster → calendar → export format gambar → re-import.
9. Test perubahan admin shift setting mengubah output export.
10. Test dengan gambar ini.
11. Baru import data untuk bulan terdeteksi/terpilih setelah preview disetujui.

PDF support bisa masuk setelah image/spreadsheet stabil, karena PDF butuh text extraction/rendering tambahan.
