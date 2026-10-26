# Plan: Yumi HRD Agent — Employee Self-Service E2E

## Status

Planning only. Belum ada implementasi, migration, deployment, atau perubahan production pada plan ini.

## Tujuan

Mengembangkan fitur baru Yumi HRD Agent secara terintegrasi dengan:

```text
@yumihrdbot
  ↔ apps/karyawan / karyawan.djiwatentram.web.id
  ↔ apps/admin / admindjiwatentram.web.id
  ↔ attendance, schedule, leave, payroll, notification
```

Prinsip utama:

- Bot menjadi launcher/notifier yang cepat.
- `apps/karyawan` menjadi workspace self-service karyawan.
- `apps/admin` menjadi sumber konfigurasi, approval, dan audit.
- Database/RPC/Edge Function menjadi sumber kebenaran transaksi.
- Jangan membuat logika jadwal/izin/payroll terpisah di bot.

## Hasil Audit E2E Saat Ini

### Yumi HRD Bot

Keyboard utama saat ini sudah memiliki:

```text
✅ Absen Masuk
📤 Absen Keluar
📋 Status Saya
📊 Rekap Bulanan
📅 Jadwal Saya
```

Flow yang sudah ada:

- check-in via lokasi + foto;
- check-out via Mini App untuk checklist/stock opname sesuai role;
- status absensi;
- rekap bulanan;
- jadwal kerja;
- personal order recap setelah checkout;
- pengingat menjelang akhir shift;
- mapping Telegram melalui `employee_telegram_links`;
- relay channel Djiwa Tentram ke DM karyawan yang sudah terhubung.

Batasan/risiko yang harus dipertahankan:

- semua DM hanya ke Telegram ID yang sudah terhubung dan aktif;
- check-in/out tetap melalui verifikasi resmi;
- lokasi/foto/PIN tidak boleh dilewati;
- Telegram notification bersifat best-effort dan tidak boleh mengubah hasil attendance write;
- jangan memakai `getUpdates` manual dengan `allowed_updates` channel-only karena dapat mengganggu polling DM.

### `apps/karyawan` — `karyawan.djiwatentram.web.id`

Route yang sudah tersedia dan harus dipakai ulang, bukan diduplikasi:

```text
/$username/beranda
/$username/absensi
/$username/jadwal
/$username/rekap-absensi
/$username/izin
/$username/notifikasi
/$username/profil
/$username/slip-gaji
/$username/kontrak
/$username/leaderboard
/absen-keluar-mini
```

Fungsi existing:

- `/$username/izin` sudah memiliki form Izin/Cuti/Sakit/Lainnya dan menulis ke `attendance_leave_requests` dengan status `pending`;
- `/$username/jadwal` memakai `PersonalSchedule` untuk jadwal shift dan log kehadiran;
- `/$username/rekap-absensi` menampilkan sesi, keterlambatan, durasi, dan on-time rate;
- `/$username/notifikasi` menggabungkan announcement, payslip, dan leave request;
- `/$username/absensi` adalah launcher menuju flow bot Telegram, bukan write path alternatif;
- `absen-keluar-mini` menangani closing checklist/stock opname/check-out signed flow.

### `apps/admin` — `admindjiwatentram.web.id`

Surface yang sudah tersedia:

```text
/admin/operational-team/attendance
/admin/operational-team/attendance/pengaturan
/admin/operational-team/attendance/jadwal
/admin/operational-team/karyawan
/admin/operational-team/payroll
/admin/operational-team/register
```

`Pengaturan Absensi` saat ini mengatur:

```text
predefinedShifts
shiftSchedules: name, openTime, closeTime
defaultStartingCash
reminderMinutesBeforeClose
autoSendShiftReportEmail
attendanceRosterTemplate
attendance geofence settings
```

`Jadwal` admin mengatur assignment karyawan per tanggal melalui calendar/matrix, import/export, create/update/delete schedule, dan status `scheduled/confirmed/completed/absent/cancelled/off`.

### Live DB Findings

```text
Shift configuration:
  Shift Pagi 07:30–14:30
  Shift Sore 13:00–21:00

Attendance schedules:
  553 rows
  first date: 2026-05-01
  last date : 2026-07-31

Leave requests:
  4 rows
```

Temuan penting dari screenshot Bot:

```text
Jadwal — Agustus 2026
Tidak ada jadwal untuk bulan ini.
```

Ini bukan bukti bot rusak. Data penugasan jadwal aktual memang belum melewati 31 Juli 2026. Konfigurasi jam Shift Pagi/Sore di `site_settings` tidak otomatis membuat jadwal personal setiap karyawan.

## Arsitektur yang Dipilih

### Kontrak sumber data

```text
site_settings.raw.shiftSettings
  → definisi nama/jam shift

pos.attendance_schedules
  → assignment karyawan + tanggal + status

legacy_mirror.documents (table_name='attendance')
  → attendance check_in/check_out actual

attendance_leave_requests
  → pengajuan izin/cuti/sakit + approval

pos.payroll_periods / payroll_runs / payslips
  → payroll dan slip gaji

employee_telegram_links
  → Telegram ID ↔ employee user ID
```

### E2E responsibility

```text
Admin Pengaturan:
  definisi jam shift, geofence, reminder, roster/template

Admin Jadwal:
  siapa bekerja pada tanggal dan shift apa

Karyawan App:
  lihat jadwal, ajukan izin, lihat status/rekap

Yumi HRD Bot:
  absen, buka Mini App checkout, shortcut status/jadwal,
  reminder dan notification DM

Database/RPC/Edge Function:
  validasi, write, approval, audit, idempotency
```

## Ide Fitur Baru yang Sudah Direkonsiliasi

### Prioritas P0 — Rapikan kontrak existing

#### 1. Jadwal satu sumber dan status “belum dijadwalkan”

Bot `Jadwal Saya`, `apps/karyawan /jadwal`, dan Admin Calendar harus membaca assignment yang sama.

Jika bulan belum memiliki assignment:

```text
Jadwal Agustus 2026 belum dibuat oleh Admin.
Silakan hubungi admin atau cek kembali nanti.
```

Jangan menampilkan “Tidak ada jadwal” tanpa membedakan:

```text
memang OFF
vs
belum ada data jadwal
vs
query error
```

Admin dapat melihat coverage:

```text
Jadwal bulan berjalan
Terisi: 24/31 hari
Belum diatur: 7 hari
```

#### 2. Status hari ini yang konsisten

Bot `Status Saya` dan `apps/karyawan /rekap-absensi` harus memakai session pairing yang sama:

```text
jadwal shift
  + check_in
  + check_out
  + status leave/off
  → status hari ini
```

Status:

```text
Belum absen
Sudah masuk
Sudah keluar
Izin disetujui
OFF
Belum dijadwalkan
```

#### 3. Perbaiki data completeness dan empty/error state

Semua surface harus membedakan:

```text
loading
empty valid
not configured
query error
```

Contoh pada Bot:

```text
Jadwal belum tersedia untuk Agustus 2026.
Admin perlu mengisi assignment jadwal melalui Admin → Attendance → Jadwal.
```

### Prioritas P1 — fitur karyawan bernilai langsung

#### 4. Pengajuan izin/cuti/sakit end-to-end

Form sudah ada di karyawan app; pengembangan harus menyelesaikan approval lifecycle:

```text
Karyawan `/izin`
  → attendance_leave_requests.status = pending
  → Admin review
  → approved/rejected + reviewer/review_notes
  → karyawan melihat status di `/notifikasi`
  → Bot DM status perubahan
  → jadwal/rekap attendance menghormati leave approved
```

Bot dapat menyediakan shortcut:

```text
⚙️ Menu Lainnya
  → Ajukan Izin/Cuti
  → buka karyawan.djiwatentram.web.id/{username}/izin
```

Bot tidak membuat pengajuan kedua; gunakan link ke form canonical atau API/RPC yang sama.

#### 5. Koreksi absensi

Fitur baru untuk lupa check-in/out atau data salah:

```text
Karyawan pilih tanggal + sesi
  → alasan + waktu yang benar
  → pending
  → Admin review
  → approved/rejected
  → audit perubahan
  → rekap/payroll membaca hasil final
```

Tidak boleh mengubah raw attendance tanpa audit. Koreksi harus menyimpan before/after, reviewer, reason, dan timestamp.

#### 6. Request tukar jadwal

```text
Karyawan memilih assignment
  → pilih rekan pengganti
  → alasan
  → approval supervisor/admin
  → assignment schedule berubah hanya setelah approved
  → kedua karyawan menerima notifikasi
```

Tidak boleh langsung mengubah jadwal hanya dari Bot.

#### 7. Pengingat personal berbasis jadwal aktual

Reminder tidak hanya berdasarkan `site_settings` atau shift aktif global, tetapi assignment karyawan:

```text
pos.attendance_schedules
  → besok ada shift
  → DM H-1

hari ini ada shift
  → reminder sebelum openTime

sudah check_in dan mendekati closeTime
  → reminder checkout
```

Gunakan WIB, dedupe per user + tanggal + event, dan jangan mengirim jika status `off` atau leave approved.

### Prioritas P2 — payroll dan komunikasi

#### 8. Slip gaji dan status payroll via Bot

Bot hanya membuka data payroll milik karyawan sendiri:

```text
💰 Slip Gaji
  → periode terbaru
  → status draft/sent/acknowledged/disputed
  → link ke karyawan app
```

Nilai payroll tidak dihitung ulang di Bot.

#### 9. Pengumuman channel → DM dengan preference

Relay channel sudah dibuat. Pengembangan berikutnya:

```text
🔔 Notifikasi Channel: Aktif
🔕 Matikan notifikasi
```

Aturan:

- hanya employee Telegram link aktif;
- dedupe `channel_id + message_id + telegram_user_id`;
- channel post baru saja, tanpa klaim dapat mengambil histori Telegram;
- status blocked/failed disimpan;
- channel announcement dan attendance notification tetap dipisahkan.

#### 10. Acknowledge pengumuman penting

Admin membuat announcement dengan flag `requires_ack`:

```text
Announcement
  → DM karyawan
  → [✅ Saya sudah membaca]
  → Admin melihat read count
```

Gunakan tabel delivery/read terpisah, tidak mengubah `announcements` menjadi log chat.

## UI/UX Specification

### Bot

Keyboard utama tetap ringkas:

```text
✅ Absen Masuk       📤 Absen Keluar
📋 Status Saya       📊 Rekap Bulanan
📅 Jadwal Saya
⚙️ Menu Lainnya
```

`Menu Lainnya` berisi:

```text
📝 Ajukan Izin/Cuti
🛠️ Koreksi Absensi
🔄 Tukar Jadwal
💰 Slip Gaji
🔔 Pengaturan Notifikasi
📖 Bantuan
```

Bot menggunakan response singkat, satu CTA utama, dan deep link canonical ke karyawan app bila form kompleks.

### Karyawan App

Pertahankan BottomNavbar existing dan route ownership. Tambahkan fitur melalui page/section yang jelas:

```text
Beranda:
  status hari ini + CTA attendance
Jadwal:
  assignment personal + state belum dijadwalkan
Absensi:
  launcher Bot Telegram
Izin:
  create + status request
Notifikasi:
  announcement + payslip + leave + correction
Profil:
  data personal + Telegram link state
```

Gaya UI:

- mobile-first Apple/iOS;
- card radius 20–24px;
- touch target minimal 44px;
- satu primary CTA;
- safe-area bottom;
- loading/empty/error/success jelas;
- reduced motion;
- tidak menggunakan emoji sebagai icon UI utama bila shared icon tersedia.

### Admin

Pisahkan dua konteks:

```text
Pengaturan Absensi:
  jam shift, geofence, reminder, roster/template

Jadwal:
  assignment karyawan per tanggal

Attendance:
  laporan dan log aktual

Payroll:
  periode, run, slip, status
```

Tambahkan coverage/health card pada Admin Jadwal, bukan di Pengaturan Shift:

```text
Agustus 2026
Terjadwal: 0
Belum diatur: semua karyawan
```

## Database Schema and REST Mapping

### Existing tables

```text
public.employee_telegram_links
├── _id
├── telegram_user_id bigint UNIQUE
├── employee_user_id text UNIQUE
├── employee_name
├── registered_at bigint
├── last_clockin_at bigint
└── is_active boolean

pos.site_settings
├── source_id
├── raw jsonb
│   └── shiftSettings
│       ├── predefinedShifts[]
│       ├── shiftSchedules[]: {name, openTime, closeTime}
│       ├── reminderMinutesBeforeClose
│       └── attendanceRosterTemplate
└── store/config fields

pos.attendance_schedules
├── source_id
├── user_id
├── date
├── shift_name
├── start_time
├── end_time
└── status

legacy_mirror.documents
├── table_name = 'attendance'
├── document_id
├── creation_time
└── document jsonb
    ├── userId
    ├── type: check_in/check_out
    ├── timestamp
    ├── shiftName
    ├── shiftOpenTimeSnapshot
    ├── location
    └── photoUrl

public.attendance_leave_requests
├── id
├── user_id
├── user_name
├── leave_type
├── start_date
├── end_date
├── reason
├── attachment_url
├── status
├── reviewed_by
├── review_notes
├── created_at
└── updated_at

public.announcements
├── id
├── title
├── subtitle
├── content
├── banner_image_url
├── is_active
├── priority
├── starts_at
├── ends_at
├── created_by
└── timestamps

pos.payroll_periods / pos.payroll_runs / pos.payslips
  → payroll source; Bot reads approved/visible output only
```

### Views/hooks

```text
GET /rest/v1/pos_site_settings
  → shared site settings mapper

GET /rest/v1/pos_attendance_schedules
  → karyawan PersonalSchedule + Admin calendar read

GET /rest/v1/pos_attendance_logs
  → read-only attendance view from legacy_mirror.documents

GET /rest/v1/attendance_leave_requests
  → karyawan own status / admin review with authorization

GET /rest/v1/pos_payslips
  → employee payroll/slip display

GET /rest/v1/employee_telegram_links
  → service-role bot recipient mapping; never expose telegram_user_id to public views
```

Rules:

- `pos_attendance_logs` is read-only; writes go through legacy mirror/Edge Function canonical path.
- `pos.attendance_schedules` writes use the established schedule hook and service/RLS path.
- `site_settings.raw.shiftSettings` defines shift template/time, not personal date assignment.
- All read mappers use `camelCase ?? snake_case` compatibility where required.

### Proposed new tables only if no existing contract covers them

```text
public.attendance_correction_requests
├── id
├── user_id
├── requested_date
├── attendance_log_id nullable
├── correction_type
├── requested_check_in nullable
├── requested_check_out nullable
├── reason
├── attachment_url nullable
├── status pending/approved/rejected/cancelled
├── reviewed_by nullable
├── review_notes nullable
├── before_snapshot jsonb
├── after_snapshot jsonb
├── created_at
└── updated_at

public.schedule_swap_requests
├── id
├── requester_user_id
├── target_user_id
├── schedule_id
├── reason
├── status pending/approved/rejected/cancelled
├── reviewed_by nullable
├── review_notes nullable
├── approved_at nullable
└── timestamps
```

Migrations must be additive, idempotent, RLS-reviewed, and applied to the actual self-hosted database. Do not create these tables until an existing request/approval contract has been searched and confirmed insufficient.

## Integration Points

### Telegram Bot

Keyboard utama tetap ringkas dan menjadi satu-satunya alur operasional utama:

```text
✅ Absen Masuk       📤 Absen Keluar
📋 Status Saya       📊 Rekap Bulanan
📅 Jadwal Saya
⚙️ Menu Lainnya
```

`Menu Lainnya` berisi tombol:

```text
📝 Ajukan Izin/Cuti
🛠️ Koreksi Absensi
🔄 Tukar Jadwal
💰 Slip Gaji
🔔 Pengaturan Notifikasi
📖 Bantuan
```

Semua fitur harian wajib dapat dijalankan dengan tombol Telegram, tanpa meminta karyawan mengetik slash command. Tombol dapat membuka flow chat, inline keyboard, atau deep link ke route canonical `karyawan.djiwatentram.web.id` sesuai kompleksitas fitur.

Slash command hanya dipertahankan sebagai fallback teknis:

```text
/start → reset/recovery keyboard dan onboarding awal
/help  → fallback bantuan jika keyboard tidak terlihat
/daftar → backward compatibility untuk linking akun lama
```

Slash command bukan bagian dari instruksi operasional utama, bukan CTA utama, dan tidak boleh menjadi satu-satunya cara mengakses fitur.

Implementasi Bot tetap wajib:

- menggunakan `employee_telegram_links` untuk recipient/identity;
- menggunakan `InlineKeyboardButton(web_app=WebAppInfo(...))` untuk Mini App;
- tidak menggunakan `reply_web_app_info`;
- mempertahankan `allowed_updates=Update.ALL_TYPES` pada polling;
- tidak melakukan probe polling channel-only yang dapat menghilangkan update DM.


### `apps/karyawan`

- Reuse `useStaffProfile` and shared attendance hooks.
- Keep `/absensi` as Telegram launcher.
- Extend `/izin`, `/jadwal`, `/rekap-absensi`, `/notifikasi`, and `/profil` only for missing E2E states.
- Use route username/slug for navigation; use display name only for data lookup.

### `apps/admin`

- `attendance/pengaturan.lazy.tsx`: shift definitions, geofence, reminder settings.
- `attendance/jadwal.lazy.tsx`: personal date assignment and coverage.
- attendance report/logs: correction review and attendance audit.
- payroll: payslip visibility/status.
- settings/permissions: role access and approval permissions.

### AI/LLM

No LLM is required for core attendance/leave/schedule writes. Future Yumi AI read-only capabilities may answer:

```text
Jadwal saya minggu ini?
Berapa kali terlambat bulan ini?
Status pengajuan cuti saya?
```

AI must call canonical read functions and must never approve leave, alter schedule, or write attendance.

### Purchasing Agent

No direct purchasing integration for HRD features. The purchasing agent remains unrelated to employee attendance/leave/payroll. Only share notification infrastructure if needed; do not couple purchasing state to HRD bot.

### Channel-to-DM Relay

Existing relay remains a separate notification pipeline:

```text
Channel post
  → channel DM delivery ledger
  → employee Telegram DMs
```

Attendance/leave/schedule notifications must have separate event types and dedupe keys so channel relay cannot interfere with bot command polling or personal attendance flows.

## No-Hardcode Audit

Must come from Admin/DB:

- shift names;
- open/close times;
- reminder lead time;
- geofence coordinates/radius;
- employee schedules;
- leave types if configurable;
- approval roles;
- payroll periods/rates/status;
- announcement content and expiry;
- Telegram recipient mapping.

Allowed constants:

- UI labels;
- event/status enum values validated server-side;
- default filter `Bulan berjalan`;
- safe fallback copy such as `Jadwal belum dibuat oleh Admin`;
- Bot username only if it is the canonical configured identity and verified.

Never hardcode a schedule assignment, employee role, payroll amount, recipient ID, or geofence as business data.

## Implementation Waves After Approval

### Wave 1 — Contract and data audit

- Verify actual hooks, views, RLS, and existing approval paths.
- Confirm whether leave approval UI/write already exists in Admin.
- Confirm current/future schedule coverage and desired import workflow.
- Produce field mapping: Admin → DB → karyawan → Bot → notification.

### Wave 2 — P0 consistency

- Make Bot/karyawan/Admin distinguish no schedule, OFF, leave, loading, and error.
- Align date boundaries to WIB.
- Align shift template with assignment schedule without mixing them.
- Add read-only coverage summary.

### Wave 3 — P1 employee workflows

- Complete leave approval/status/DM lifecycle using existing `attendance_leave_requests`.
- Add correction request only after schema/path audit.
- Add schedule swap only after approval ownership is confirmed.
- Add personal reminders with dedupe.

### Wave 4 — P2 communication/payroll

- Add Bot shortcuts to canonical karyawan routes.
- Add channel DM preferences and announcement acknowledgment.
- Add payroll/slip shortcuts using existing payroll read model.

### Wave 5 — verification/release

- Unit tests for state/role/date/status rules.
- Integration tests for leave approval, schedule visibility, correction audit, and DM dedupe.
- Build `apps/karyawan`, `apps/admin`, and bot checks according to touched scope.
- Verify canonical domains:
  - `https://karyawan.djiwatentram.web.id`
  - `https://admindjiwatentram.web.id`
- Verify Bot service, Telegram commands, Mini App links, and notification delivery.
- Test real read-only paths and approved test records only.
- Deploy only affected app/function/service.

## Acceptance Criteria

- Bot `Jadwal Saya` matches the same assignment data shown in karyawan and Admin.
- August with no assignment is explained as `belum dijadwalkan`, not silently reported as a generic empty schedule.
- Approved leave affects schedule/status/recap consistently.
- Pending/rejected leave never suppresses attendance incorrectly.
- Attendance correction preserves raw history and records approval audit.
- Every critical Bot action has a visible response and restored keyboard.
- Telegram DM is sent only to linked active users and is deduplicated.
- Bot restart does not lose durable request/delivery state.
- Admin changes to shift configuration are reflected in bot/karyawan read paths.
- No feature creates a parallel attendance/schedule/payroll source of truth.

## Mini App Parity Decision

### Kondisi saat ini

Route Telegram Mini App saat ini:

```text
/absen-keluar-mini
```

Route tersebut sudah memiliki workspace ringkas dengan section:

```text
home
schedule
checkin
notifications
recap
leave
profile
salary
contract
leaderboard
```

Tetapi implementasinya masih merender beberapa data/form secara inline di `absen-keluar-mini.lazy.tsx`, sementara `karyawan.djiwatentram.web.id` memiliki route canonical terpisah:

```text
/$username/beranda
/$username/jadwal
/$username/absensi
/$username/rekap-absensi
/$username/izin
/$username/notifikasi
/$username/profil
/$username/slip-gaji
/$username/kontrak
/$username/leaderboard
```

### Keputusan arsitektur

Mini App harus memiliki **parity behavior dan data** dengan `karyawan.djiwatentram.web.id`, tetapi tidak harus menyalin markup desktop/web secara mentah.

```text
Canonical feature/data contract dibuat di apps/karyawan
        ↓
Mini App memakai shell mobile Telegram yang sama
        ↓
Shared hooks/helpers/components bila benar-benar reusable
```

Aturan:

- Jangan membuat approval, schedule, leave, payroll, atau attendance logic kedua di Mini App.
- Mini App boleh memakai layout yang lebih compact dan Telegram WebApp API.
- Status, data, permission, validation, dan side effect harus sama dengan `karyawan.djiwatentram.web.id`.
- Untuk fitur yang belum ada di `apps/karyawan`, buat route/komponen canonical di `apps/karyawan` terlebih dahulu, lalu expose sebagai tab Mini App.
- Signed Telegram link hanya berfungsi sebagai authentication handoff; tidak boleh menjadi bypass Yumi HRD verification atau Admin authorization.

### Parity matrix

| Fitur | `apps/karyawan` | Mini App saat ini | Rencana |
|---|---|---|---|
| Absen Masuk | launcher ke Bot | launcher ke Bot | gunakan contract/link yang sama |
| Absen Keluar | launcher/route | signed closing Mini App | pertahankan closing flow, samakan validation |
| Jadwal | PersonalSchedule + logs | inline schedule + PersonalSchedule | satu mapper/status, bedakan belum dijadwalkan vs OFF |
| Rekap Absensi | stats + session table | ringkasan inline sederhana | gunakan shared session/stats helper |
| Izin/Cuti/Sakit | form canonical + pending write | inline form + list status | Mini App memakai form contract dan approval status yang sama |
| Notifikasi | announcement/payslip/leave | announcement/payslip/leave | shared notification model + preference/ack baru |
| Profil | canonical profile/self-service | read-only inline profile | link/entry ke profile canonical atau parity read contract |
| Slip Gaji | route payroll | inline summary | read-only data/status yang sama |
| Kontrak | route contract | link ke portal | pertahankan link signed/authenticated |
| Leaderboard | route leaderboard | link/summary | read-only contract yang sama |
| Koreksi Absensi | belum ada flow canonical | belum ada | buat di karyawan + expose Mini App |
| Tukar Jadwal | belum ada flow canonical | belum ada | buat di karyawan + expose Mini App |
| Notification preference | belum ada persistent preference | belum ada | buat canonical settings + DM/channel behavior |

## Updated Feature Scope

### P0 — Parity and reliability first

1. Buat shared employee self-service data contract untuk status attendance, schedule, leave, notification, dan payroll.
2. Hilangkan perbedaan mapping tanggal/timezone antara `apps/karyawan` dan Mini App; semua tanggal operasional memakai WIB.
3. Bedakan state jadwal:
   ```text
   loading
   ada jadwal
   OFF
   belum dijadwalkan
   query error
   ```
4. Pastikan Bot `Jadwal Saya`, karyawan `/jadwal`, dan Mini App membaca `pos.attendance_schedules` yang sama.
5. Pastikan Admin shift configuration tidak dianggap sebagai assignment jadwal personal.
6. Audit signed Telegram entry agar hanya membuka data employee yang sesuai dengan `telegram_user_id`.

### P1 — Canonical employee features

#### A. Izin/Cuti/Sakit end-to-end

Pertahankan route existing:

```text
karyawan.djiwatentram.web.id/$username/izin
```

Lengkapi alur:

```text
Karyawan submit
  → attendance_leave_requests.pending
  → Admin review/approve/reject
  → Notifikasi karyawan
  → Bot DM dengan tombol Lihat Detail
  → Jadwal/rekap/payroll menghormati approved leave
```

Mini App tidak membuat tabel/approval flow baru. Ia memakai payload/status yang sama.

#### B. Koreksi Absensi

Fitur baru karena belum ditemukan route canonical lengkap:

```text
Karyawan pilih tanggal/sesi
  → pilih masalah check-in/check-out
  → masukkan waktu/alasan/bukti opsional
  → submit pending
  → Admin review
  → approved/rejected
  → audit before/after
  → rekap/payroll menggunakan hasil final
```

Implementasi canonical berada di `apps/karyawan`; Mini App hanya menjadi compact presentation/entry point.

#### C. Tukar Jadwal

Fitur baru yang harus approval-based:

```text
Karyawan pilih assignment
  → pilih rekan pengganti
  → tulis alasan
  → Supervisor/Admin review
  → assignment berubah setelah approved
  → kedua karyawan menerima notifikasi
```

Tidak boleh mengubah `pos.attendance_schedules` langsung dari client.

#### D. Notification preference

Fitur baru untuk mengatur jenis DM:

```text
🔔 Pengumuman channel
⏰ Reminder jadwal/absen
📝 Status izin
💰 Payroll/slip
```

Default aktif untuk notifikasi penting; user dapat opt-out untuk kategori non-kritis. Preference berlaku untuk channel-to-DM relay dan notification dispatcher, bukan untuk security/attendance failure notice.

#### E. Announcement acknowledgment

Admin dapat menandai pengumuman sebagai wajib dibaca:

```text
Admin publish announcement
  → Bot DM / karyawan notification
  → [✅ Saya sudah membaca]
  → read/ack status tersimpan
  → Admin melihat coverage read count
```

Gunakan tabel delivery/read terpisah, tidak mengubah `announcements` menjadi log chat.

## Mini App Implementation Boundary

### Entry button Bot

Keyboard utama tetap ringkas. Tambahkan satu tombol:

```text
📱 Buka Aplikasi Karyawan
```

Button memakai `InlineKeyboardButton(web_app=WebAppInfo(...))` dengan signed query:

```text
uid
telegram user binding
issued timestamp
signature
mode=employee_app
```

Mini App memverifikasi signature dan identity sebelum membuka workspace. Jangan menaruh PII atau payroll value di URL.

### Mini App shell

Gunakan shell mobile yang mengikuti `apps/karyawan`:

```text
Beranda | Jadwal | Absensi | Notifikasi | Profil
```

Section tambahan dapat dibuka dari Beranda/Profil/Notifikasi:

```text
Rekap Absensi
Izin/Cuti/Sakit
Koreksi Absensi
Tukar Jadwal
Slip Gaji
Kontrak
Leaderboard
Pengaturan Notifikasi
```

Mini App closing khusus tetap memiliki mode terpisah:

```text
mode=closing
```

Mode closing tidak boleh tercampur dengan workspace biasa dan tetap menjalankan checklist, geofence, shift/time validation, serta server-side closing.

## Updated Files Likely to Change

### Canonical employee app

- `apps/karyawan/src/routes/absen-keluar-mini.lazy.tsx`
- `apps/karyawan/src/routes/absen-keluar-mini.tsx`
- `apps/karyawan/src/routes/$username/izin.lazy.tsx`
- `apps/karyawan/src/routes/$username/jadwal.lazy.tsx`
- `apps/karyawan/src/routes/$username/rekap-absensi.lazy.tsx`
- `apps/karyawan/src/routes/$username/notifikasi.lazy.tsx`
- `apps/karyawan/src/routes/$username/profil.lazy.tsx`
- new correction-request route/component if no existing route is found
- new schedule-swap route/component if no existing route is found
- shared hooks/helpers only after comparing duplicated Mini App logic

### Admin

- `apps/admin/src/routes/admin/operational-team/attendance/pengaturan.lazy.tsx`
- `apps/admin/src/routes/admin/operational-team/attendance/jadwal.lazy.tsx`
- attendance report/log review surface
- payroll notification/status surface
- admin settings only for new configurable values

### Bot/backend

- `yumi-hrd-agent/app.py`
- Telegram signed-link/keyboard helpers
- notification preference/ack dispatcher
- additive migration/RPC only after existing schema audit

## Updated Verification

### Parity

- Compare every Mini App section with the corresponding `apps/karyawan` route.
- Test the same employee via `karyawan.djiwatentram.web.id` and Telegram Mini App.
- Confirm identical schedule, attendance, leave, and payroll status.
- Test WIB boundary around midnight and month changes.

### Admin integration

- Change shift time in Admin and verify Bot/Mini App read it.
- Create/update an employee assignment in Admin Jadwal and verify Bot/karyawan/Mini App.
- Approve/reject leave in Admin and verify karyawan/Mini App/Bot notification.
- Review correction/swap requests with role permission and audit trail.

### Telegram

- Button opens Mini App without slash command.
- Signed identity cannot open another employee's data.
- `/start` remains fallback only.
- Attendance deep links still open official Bot verification.
- Closing Mini App still handles Bar/Kitchen stock opname correctly.
- Channel relay and employee DM delivery remain separate and deduplicated.

### Release

- Build `apps/karyawan` and any changed Admin app serially.
- Python compile and service restart for changed Bot code.
- Verify `karyawan.djiwatentram.web.id`, `admindjiwatentram.web.id`, and Telegram Bot runtime.
- Verify lazy chunks, `version.json`, service worker, and signed route markers.
- Capture mobile 375px screenshots where browser is available; report limitations honestly.

## Updated Recommendation

Jangan membuat semua fitur baru langsung di Mini App secara inline. Urutan yang aman:

```text
1. Pastikan data/approval contract canonical di apps/karyawan + Admin
2. Tambahkan fitur yang benar-benar belum ada:
   Koreksi Absensi, Tukar Jadwal, Notification Preference, Announcement Ack
3. Buat Mini App shell sebagai compact view dari contract yang sama
4. Tambahkan satu tombol Bot: 📱 Buka Aplikasi Karyawan
5. Verifikasi parity per employee dan per role
```

Dengan pendekatan ini, `karyawan.djiwatentram.web.id` dan Mini App tidak akan memiliki dua versi aturan yang berbeda.

## Open Decisions Before Coding

1. Apakah Admin sudah memiliki approval UI untuk `attendance_leave_requests`, atau perlu ditambahkan?
2. Untuk jadwal kosong seperti Agustus 2026, apakah admin ingin import dari template Excel/Google Sheets atau input calendar manual?
3. Apakah koreksi absensi memerlukan lampiran bukti?
4. Siapa approver tukar jadwal: supervisor role, manager, atau admin?
5. Apakah semua pengumuman channel otomatis masuk DM, atau employee dapat opt-out per kategori?
6. Apakah fitur baru harus diuji dengan user/record staging khusus, atau memakai data live read-only tanpa mutation test?
