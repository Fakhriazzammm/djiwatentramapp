# Yumi Supervisor Agent — Telegram Attendance (Clock In/Out)

> **Goal:** Karyawan Djiwa Tentram bisa absen **clock-in** dan **clock-out** via Telegram bot @YummeSupervisorAIbot, dengan keamanan, anti-duplikasi, dan opsi verifikasi selfie/face.  
> **Integrasi:** Halaman profil karyawan di apps/karyawan menampilkan status koneksi Telegram dan link ke bot.

**Architecture:** 
- **Backend:** Supervisor agent (`yumi-supervisor-agent/app.py`) menangani command Telegram + insert attendance ke `legacy_mirror.documents`
- **Database:** Tabel `employee_telegram_links` untuk mapping Telegram ID ↔ Employee ID
- **Frontend:** Halaman profil karyawan (`apps/karyawan/src/routes/$username/profil.lazy.tsx`) menampilkan status link + QR/button untuk connect via bot
- **Sync:** Frontend membaca status link via Supabase query ke `employee_telegram_links` (public view)

**Tech Stack:** Python (python-telegram-bot v20+), Supabase REST API (self-hosted), React + TanStack Router (karyawan app), legacy_mirror schema

---

## 📊 Status: 0% Complete ❌

<details>
<summary>📋 Daftar Isi</summary>

- [Task 1: Setup database table & view](#task-1-setup-database-table--view)
- [Task 2: Command /daftar — Registrasi karyawan](#task-2-command-daftar--registrasi-karyawan)
- [Task 3: Command /clockin — Absen masuk](#task-3-command-clockin--absen-masuk)
- [Task 4: Command /clockout — Absen keluar](#task-4-command-clockout--absen-keluar)
- [Task 5: Anti-duplikasi & validasi](#task-5-anti-duplikasi--validasi)
- [Task 6: Middleware auth & error handling](#task-6-middleware-auth--error-handling)
- [Task 7: Command /status — Cek status absen hari ini](#task-7-command-status--cek-status-absen-hari-ini)
- [Task 8: UI Profile Karyawan — Status koneksi Telegram](#task-8-ui-profile-karyawan--status-koneksi-telegram)
- [Task 9: Optional — Selfie/face verification](#task-9-optional-selfieface-verification)
- [Task 10: Restart bot & end-to-end testing](#task-10-restart-bot--end-to-end-testing)
</details>

---

### Task 1: Setup database table & public view

**Objective:** Buat tabel `employee_telegram_links` + view publik untuk frontend.

**Files:**
- Execute: SQL langsung via psql

**SQL:**

```sql
-- 1. Tabel mapping Telegram → Karyawan
CREATE TABLE IF NOT EXISTS public.employee_telegram_links (
  _id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  telegram_user_id BIGINT NOT NULL UNIQUE,
  employee_user_id TEXT NOT NULL REFERENCES public.yumi_users(source_id),
  employee_name TEXT NOT NULL,
  registered_at BIGINT NOT NULL DEFAULT (extract(epoch from now())::bigint * 1000),
  last_clockin_at BIGINT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  UNIQUE(telegram_user_id),
  UNIQUE(employee_user_id)
);

-- 2. View publik untuk frontend (hanya expose status, bukan telegram_user_id)
CREATE OR REPLACE VIEW public.employee_telegram_status
WITH (security_invoker = true) AS
SELECT
  employee_user_id,
  employee_name,
  is_active,
  registered_at
FROM public.employee_telegram_links
WHERE is_active = true;

-- 3. Grant akses
GRANT ALL ON public.employee_telegram_links TO anon, authenticated;
GRANT SELECT ON public.employee_telegram_status TO anon, authenticated;
```

**Verification:**
```sql
SELECT column_name FROM information_schema.columns 
WHERE table_schema='public' AND table_name='employee_telegram_links';
-- Expected: _id, telegram_user_id, employee_user_id, employee_name, registered_at, last_clockin_at, is_active
```

---

### Task 2: Command `/daftar` — Registrasi karyawan

**Objective:** Karyawan ketik `/daftar NAMA` → bot verifikasi ke `pos_staff_users` → simpan mapping.

**Files:**
- Modify: `/opt/djiwatentramapp/yumi-supervisor-agent/app.py`

**Flow:**

```mermaid
User → /daftar AYUNDA PUTRI
Bot → SELECT name, "roleName", _id FROM pos_staff_users WHERE isActive = true AND LOWER(name) = LOWER('AYUNDA PUTRI')
  ├── 0 hasil: "❌ Nama tidak ditemukan. Pastikan nama sesuai dengan data toko."
  ├── 1 hasil: 
  │     → Cek apakah sudah terdaftar di employee_telegram_links
  │       ├── Sudah: "⚠️ Akun ini sudah terdaftar dengan user lain"
  │       └── Belum: simpan mapping → "✅ Registrasi berhasil! Sekarang kamu bisa /clockin"
  └── >1 hasil: "⚠️ Ditemukan beberapa karyawan dengan nama mirip. Hubungi admin."
```

**Handler code:**
```python
async def cmd_daftar(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Register Telegram account to employee account."""
    if not context.args:
        await update.message.reply_text(
            "📝 *Cara Daftar:*\n"
            "Ketik: `/daftar Nama Lengkap`\n\n"
            "Contoh: `/daftar AYUNDA PUTRI`\n\n"
            "Gunakan nama sesuai data kepegawaian kamu.",
            parse_mode="Markdown"
        )
        return
    
    name = " ".join(context.args).strip()
    telegram_id = update.effective_user.id
    
    # Cari staff
    staff = await _fetch("pos_staff_users",
        f"select=_id,name,\"roleName\"&isActive=eq.true&name=like.{name}&limit=5")
    
    if not staff:
        await update.message.reply_text(
            f"❌ Nama \"{name}\" tidak ditemukan.\n"
            "Pastikan nama sesuai dengan data kepegawaian.\n"
            "Coba cek di aplikasi Karyawan > Profil."
        )
        return
    
    if len(staff) > 1:
        await update.message.reply_text(
            f"⚠️ Ditemukan beberapa karyawan dengan nama \"{name}\".\n"
            "Hubungi admin untuk bantuan registrasi."
        )
        return
    
    emp = staff[0]
    emp_id = emp.get("_id")
    emp_name = emp.get("name", "")
    emp_role = emp.get("roleName", "")
    
    # Cek sudah terdaftar
    existing = await _fetch("employee_telegram_links",
        f"select=_id&employee_user_id=eq.{emp_id}&limit=1")
    
    if existing:
        await update.message.reply_text(
            f"⚠️ Akun {emp_name} sudah terdaftar di Telegram.\n"
            "Hubungi admin jika ingin mengganti akun Telegram."
        )
        return
    
    # Simpan mapping
    await _post("employee_telegram_links", {
        "telegram_user_id": telegram_id,
        "employee_user_id": emp_id,
        "employee_name": emp_name,
        "registered_at": int(_now_wib().timestamp() * 1000),
        "is_active": True,
    })
    
    await update.message.reply_text(
        f"✅ *Registrasi Berhasil!*\n\n"
        f"👤 *{emp_name}*\n"
        f"📌 *{emp_role}*\n\n"
        f"Sekarang kamu bisa:\n"
        f"• `/clockin` — Absen Masuk\n"
        f"• `/clockout` — Absen Keluar\n"
        f"• `/status` — Cek status absensi\n\n"
        f"Selamat bekerja! 🎯",
        parse_mode="Markdown"
    )
```

**Catatan keamanan:**
- Cegah registrasi ganda: `UNIQUE(employee_user_id)` dan `UNIQUE(telegram_user_id)`
- Nama harus exact match (case-insensitive) — tidak bisa asal klaim

---

### Task 3: Command `/clockin` — Absen masuk

**Objective:** Karyawan absen masuk via Telegram. Bot insert attendance log + update `last_clockin_at`.

**Files:**
- Modify: `/opt/djiwatentramapp/yumi-supervisor-agent/app.py`

**Flow:**

```
User → /clockin
Bot → cari mapping telegram_id → employee_user_id
  ├── Tidak ada → "❌ Kamu belum daftar. Kirim /daftar <nama>"
  └── Ada → lanjut
Bot → cek sudah ada check_in HARI INI (lewat view pos_attendance_logs)
  ├── Sudah check_in → "⚠️ Kamu sudah absen masuk hari ini jam 12:50 WIB"
  └── Belum → lanjut  
Bot → tentukan shift (via _find_shift_at_time)
Bot → insert attendance document
Bot → update last_clockin_at di employee_telegram_links
Bot → reply sukses + clockout button
```

**Insert logic:**
```python
async def _do_clockin(employee_user_id: str, shift_name: str = "", open_time: str = ""):
    now_ms = int(_now_wib().timestamp() * 1000)
    doc_id = f"att_tele_{uuid4().hex[:20]}"
    
    await _post("", {
        # Insert ke legacy_mirror.documents
    }, schema="legacy_mirror")
```

**Catatan:** Insert dilakukan via Supabase REST ke `legacy_mirror` schema — butuh endpoint khusus atau langsung via service_role key. Alternatif: gunakan Edge Function `record-financial-transaction` pattern atau insert langsung via RPC.

---

### Task 4: Command `/clockout` — Absen keluar

**Objective:** Karyawan absen keluar + hitung durasi.

**Files:**
- Modify: `/opt/djiwatentramapp/yumi-supervisor-agent/app.py`

**Flow:**

```
User → /clockout
Bot → cek mapping → terdaftar ✅
Bot → cek sudah check_in hari ini
  ├── Belum → "⚠️ Kamu belum absen masuk hari ini!"
  └── Sudah → lanjut
Bot → cek sudah check_out hari ini
  ├── Sudah → "⚠️ Kamu sudah absen keluar jam 21:00 WIB"
  └── Belum → lanjut
Bot → insert check_out
Bot → hitung durasi dari check_in terakhir
Bot → balas: "✅ Absen Keluar — 04/07 17:30 WIB\n⏱️ Durasi: 4 jam 40 menit"
```

**Catatan:** Notifikasi ke grup Absensi sudah otomatis oleh **yumi-ai-bot** via `_check_new_attendance` — tidak perlu kirim manual.

---

### Task 5: Anti-duplikasi & validasi

**Objective:** Cegah double clock-in/out + validasi waktu.

**Files:**
- Modify: `/opt/djiwatentramapp/yumi-supervisor-agent/app.py`

**Validasi:**

| Validasi | Logic | Response |
|----------|-------|----------|
| Double check-in | Cek `pos_attendance_logs` hari ini `type=check_in` | "⚠️ Sudah absen masuk jam 12:50" |
| Double check-out | Cek `pos_attendance_logs` hari ini `type=check_out` | "⚠️ Sudah absen keluar jam 21:00" |
| Clock-out tanpa check-in | Cek apakah ada check_in hari ini | "❌ Belum absen masuk hari ini" |
| Grace period 30min | Cek sejak check-in < 30 menit | "⏳ Minimal 30 menit sejak absen masuk" |
| Grace period 15min | Cek sejak check-out sebelumnya < 15 menit (cross-day) | "⏳ Tunggu 15 menit sejak check-out sebelumnya" |

**Helper:**
```python
async def _has_today_attendance(employee_user_id: str, att_type: str) -> tuple[bool, dict | None]:
    """Cek apakah user sudah check_in/check_out hari ini. Return (ada, data_log)."""
    today_start = _start_of_day_ms(_now_wib())
    today_end = today_start + 86400000
    rows = await _fetch("pos_attendance_logs",
        f"userId=eq.{employee_user_id}"
        f"&type=eq.{att_type}"
        f"&timestamp=gte.{today_start}"
        f"&timestamp=lt.{today_end}"
        f"&order=timestamp.desc&limit=1"
    )
    if rows:
        return True, rows[0]
    return False, None
```

---

### Task 6: Middleware auth & error handling

**Objective:** Setiap command (kecuali `/daftar`) cek apakah user sudah terdaftar.

**Files:**
- Modify: `/opt/djiwatentramapp/yumi-supervisor-agent/app.py`

**Pattern:**
```python
async def _require_employee(update: Update) -> dict | None:
    """Middleware: cek apakah Telegram user sudah terdaftar sebagai karyawan."""
    if not update.effective_user:
        await update.message.reply_text("❌ Tidak dapat mengidentifikasi user.")
        return None
    
    rows = await _fetch("employee_telegram_links",
        f"select=employee_user_id,employee_name,is_active"
        f"&telegram_user_id=eq.{update.effective_user.id}"
        f"&is_active=eq.true&limit=1"
    )
    
    if not rows:
        await update.message.reply_text(
            "❌ Kamu belum terdaftar.\n"
            "Ketik `/daftar Nama Lengkap` untuk mendaftar.",
            parse_mode="Markdown"
        )
        return None
    
    return rows[0]
```

**Error handling:**
```python
try:
    emp = await _require_employee(update)
    if not emp:
        return
    # ... command logic ...
except httpx.HTTPError:
    await update.message.reply_text("❌ Gagal terhubung ke server. Coba lagi.")
except Exception as e:
    logger.error("Command error: %s", e)
    await update.message.reply_text("❌ Terjadi kesalahan. Hubungi admin.")
```

---

### Task 7: Command `/status` — Cek status absen hari ini

**Objective:** Karyawan cek status absensi hari ini via Telegram.

**Files:**
- Modify: `/opt/djiwatentramapp/yumi-supervisor-agent/app.py`

**Output:**
```
📋 Status Absensi — 04/07/2026
────────────────────
👤 AYUNDA PUTRI • BARISTA

✅ Absen Masuk: 12:50 WIB
⏳ Absen Keluar: Belum
⏱️ Durasi: 4 jam 9 menit (berjalan)
────────────────────
📍 Shift: Sore (14:00 - 22:00)
✅ Tepat waktu

Tekan /clockout untuk absen keluar.
```

Jika belum check-in:
```
📋 Status Absensi — 04/07/2026
────────────────────
👤 AYUNDA PUTRI • BARISTA
⏳ Belum absen hari ini

Tekan /clockin untuk absen masuk.
```

Jika sudah check-out:
```
📋 Status Absensi — 04/07/2026
────────────────────
👤 AYUNDA PUTRI • BARISTA
✅ Absen Masuk: 12:50 WIB
✅ Absen Keluar: 22:00 WIB
⏱️ Durasi: 9 jam 10 menit
────────────────────
Shift selesai. Selamat istirahat! 🎉
```

---

### Task 8: UI Profile Karyawan — Status koneksi Telegram

**Objective:** Di halaman profil karyawan (`/profil`), tampilkan status koneksi Telegram bot + tombol/link untuk menghubungkan.

**Files:**
- Modify: `/opt/djiwatentramapp/apps/karyawan/src/routes/$username/profil.lazy.tsx`
- New hook (opsional): `/opt/djiwatentramapp/packages/yumipos-web-shared/src/hooks/use-telegram-link.ts`

**UI Spec:**

Di halaman profil, di bagian pengaturan/akun, tambahkan kartu:

```
┌────────────────────────────────────────┐
│  🤖 Telegram Bot                       │
│                                         │
│  ✅ Terhubung sebagai AYUNDA PUTRI     │
│     Sejak: 04/07/2026                  │
│                                         │
│  Kamu bisa absen via:                   │
│  @YummeSupervisorAIbot                  │
│                                         │
│  Perintah: /clockin · /clockout · /status│
├────────────────────────────────────────┤
│  [🔗 Buka Bot Telegram]                │
└────────────────────────────────────────┘
```

Jika BELUM terhubung:

```
┌────────────────────────────────────────┐
│  🤖 Telegram Bot                       │
│                                         │
│  ❌ Belum terhubung                     │
│                                         │
│  Hubungkan akun Telegram untuk:         │
│  • Absen masuk/keluar via Telegram      │
│  • Notifikasi shift & jadwal            │
│  • Info real-time absensi               │
│                                         │
│  Caranya:                               │
│  1. Buka @YummeSupervisorAIbot          │
│  2. Ketik /daftar AYUNDA PUTRI          │
├────────────────────────────────────────┤
│  [🔗 Buka Bot Telegram]                │
└────────────────────────────────────────┘
```

**Data fetching (React hook):**

```typescript
// Di profil.lazy.tsx atau hook terpisah
const [telegramStatus, setTelegramStatus] = useState<any>(null);
const [loadingTelegram, setLoadingTelegram] = useState(false);

useEffect(() => {
  if (!staff?._id) return;
  setLoadingTelegram(true);
  const supabase = createClient();
  supabase
    .from("employee_telegram_status")
    .select("*")
    .eq("employee_user_id", staff._id)
    .maybeSingle()
    .then(({ data }) => {
      setTelegramStatus(data);
      setLoadingTelegram(false);
    });
}, [staff?._id]);
```

**UI Component (React):**
```tsx
{/* —── Telegram Bot Card ── */}
<div className="rounded-xl border bg-card p-4">
  <div className="flex items-center gap-2 mb-3">
    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-100 text-sky-600">
      <Send className="h-4 w-4" />
    </div>
    <div>
      <p className="font-bold text-xs">Telegram Bot</p>
      <p className="text-[10px] text-muted-foreground">Absensi via Telegram</p>
    </div>
  </div>

  {loadingTelegram ? (
    <p className="text-[11px] text-muted-foreground animate-pulse">Memuat...</p>
  ) : telegramStatus ? (
    <>
      <div className="flex items-center gap-2 mb-2">
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
        <span className="text-[11px] font-medium text-emerald-600">
          Terhubung sebagai {telegramStatus.employee_name}
        </span>
      </div>
      <p className="text-[10px] text-muted-foreground mb-3">
        Sejak: {new Date(telegramStatus.registered_at).toLocaleDateString("id-ID")}
      </p>
      <div className="bg-muted/50 rounded-lg p-3 mb-3">
        <p className="text-[10px] font-medium mb-1">Perintah Telegram:</p>
        <div className="flex flex-wrap gap-1.5">
          {["/clockin", "/clockout", "/status"].map(cmd => (
            <code key={cmd} className="text-[9px] bg-background px-1.5 py-0.5 rounded">
              {cmd}
            </code>
          ))}
        </div>
      </div>
    </>
  ) : (
    <>
      <div className="flex items-center gap-2 mb-2">
        <span className="h-2 w-2 rounded-full bg-rose-500" />
        <span className="text-[11px] font-medium text-rose-600">Belum terhubung</span>
      </div>
      <div className="bg-muted/50 rounded-lg p-3 mb-3 text-[10px] text-muted-foreground space-y-1">
        <p className="font-medium text-foreground">Cara menghubungkan:</p>
        <p>1. Buka bot Telegram @YummeSupervisorAIbot</p>
        <p>2. Ketik <code className="bg-background px-1 rounded">/daftar {staff?.name}</code></p>
        <p>3. Ikuti instruksi dari bot</p>
      </div>
    </>
  )}

  <a
    href="https://t.me/YummeSupervisorAIbot"
    target="_blank"
    rel="noopener noreferrer"
    className="flex w-full items-center justify-center gap-2 rounded-lg bg-sky-500 py-2 text-[11px] font-bold text-white hover:bg-sky-600 transition-colors"
  >
    <ExternalLink className="h-3.5 w-3.5" />
    Buka Bot Telegram
  </a>
</div>
```

**Catatan implementasi:**
- Import `Send` dan `ExternalLink` dari `lucide-react`
- Posisikan di profil, setelah kartu "Kartu Absensi" dan sebelum "Pengaturan Akun"
- View `employee_telegram_status` hanya expose `employee_user_id`, `employee_name`, `is_active`, `registered_at` — **tidak expose `telegram_user_id`** (privacy)

---

### Task 9: Optional — Selfie/face verification

**Objective:** Tingkatkan keamanan dengan verifikasi wajah via foto selfie.

**Files:**
- Modify: `/opt/djiwatentramapp/yumi-supervisor-agent/app.py`

**Approach:** Opsional (diaktifkan via env var `VERIFIKASI_WAJAH=true`). Default: **false**.

**Flow:**

```
User → /clockin
Bot (jika VERIFIKASI_WAJAH=true) → "📸 Kirim foto selfie untuk verifikasi wajah"
User → kirim foto
Bot → simpan foto → kirim ke Gemini Vision:
       "Apakah foto ini adalah [NAMA KARYAWAN]? Jawab YA atau TIDAK saja."
  ├── "YA" → lanjut clock-in ✅
  └── "TIDAK" / ragu → "❌ Wajah tidak cocok dengan [NAMA]. Coba lagi."
```

**Catatan:**
- Face verification via Gemini Vision (existing infra — tidak perlu ML tambahan)
- Foto disimpan di `photoUrl` field attendance log
- `VERIFIKASI_WAJAH = True/False` di `.env` supervisor agent
- Default: **False** — MVP pakai verifikasi nama cukup

**Keamanan berlapis:**
| Layer | Metode |
|-------|--------|
| Something you have | Telegram account (user_id unik) |
| Something you know | Nama lengkap (registrasi) |
| Something you are | Selfie/face (opsional, via AI) |

---

### Task 10: Restart bot & end-to-end testing

**Objective:** Deploy semua perubahan + verifikasi end-to-end dari karyawan app → Telegram bot → database.

**Files:**
- Run: `sudo systemctl restart yumi-supervisor-agent.service`
- Build: `cd /opt/djiwatentramapp && bun run build` (untuk karyawan app)

**Test Plan E2E:**

| # | Skenario | Step | Expected |
|---|----------|------|----------|
| 1 | **Profile — belum terhubung** | Buka karyawan.djiwatentram.web.id/profil | ❌ Status "Belum terhubung" + instruksi |
| 2 | **Daftar sukses** | `/daftar AYUNDA PUTRI` di bot | ✅ "Registrasi Berhasil!" |
| 3 | **Profile — sudah terhubung** | Refresh karyawan.djiwatentram.web.id/profil | ✅ Status "Terhubung sebagai AYUNDA PUTRI" |
| 4 | **Daftar ganda** | `/daftar AYUNDA PUTRI` lagi | ⚠️ "Sudah terdaftar" |
| 5 | **Clock-in sukses** | `/clockin` | ✅ "Absen Masuk — 04/07 17:30 WIB" |
| 6 | **Clock-in ganda** | `/clockin` lagi | ⚠️ "Sudah absen masuk jam 17:30" |
| 7 | **Status** | `/status` | 📋 Menampilkan status + durasi |
| 8 | **Clock-out sukses** | `/clockout` | ✅ "Absen Keluar — ... + durasi" |
| 9 | **Status selesai** | `/status` | 📋 Shift selesai |
| 10 | **Notif grup** | Cek grup Absensi | ✅ Notif otomatis dari yumi-ai-bot |
| 11 | **DB verification** | Query `legacy_mirror.documents` | ✅ Record attendance dengan source="telegram" |

**Verifikasi database:**
```sql
SELECT d.document->>'type' as type,
       d.document->>'userId' as user_id,
       d.document->>'source' as source,
       to_timestamp(d.creation_time / 1000) as created
FROM legacy_mirror.documents d
WHERE d.table_name = 'attendance'
  AND d.document->>'source' = 'telegram'
ORDER BY d.creation_time DESC;
```

---

## ⚠️ Keputusan Arsitektur

### Kenapa insert attendance via REST API, bukan langsung?

Supervisor agent (Python) akses Supabase via REST API dengan **service_role key**. Ini karena:
- `legacy_mirror` schema tidak bisa diakses anon key
- Insert attendance perlu bypass RLS (system operation)
- Service role key sudah ada di `.env` supervisor agent

### Kenapa view `employee_telegram_status` terpisah?

Untuk **privacy**: frontend karyawan app tidak perlu tahu `telegram_user_id`. View hanya expose data yang aman untuk konsumsi publik.

### Kenapa bot command bukan inline keyboard?

Untuk MVP, command text `/clockin` lebih universal dan mudah diimplementasikan. Inline keyboard bisa ditambahkan nanti sebagai enhancement.

### Alur data notifikasi grup

```
Telegram → Supervisor Agent → legacy_mirror.documents → 
  yumi-ai-bot (_check_new_attendance via creationTime) → Grup Absensi
```

Tidak perlu kirim notifikasi duplikat — yumi-ai-bot sudah handle otomatis.

---

## 🗺️ Dependency Graph

```mermaid
Level 1 (independen → paralel 🔥)
  ├── Task 1: Migration SQL (database)
  ├── Task 8: UI Profile karyawan (frontend)
  └── Task 2-7: Bot commands (backend)
  
Level 2 (dependen)
  └── Task 10: Testing E2E ← butuh semua task sebelumnya

Level 3 (opsional)
  └── Task 9: Selfie verification ← bisa dikerjakan terpisah
```

**Execution strategy:**
- Wave 1 🔥: Task 1 (DB) + Task 8 (UI) paralel
- Wave 2 🔥: Task 2+3+4+5+6+7 (backend commands)
- Wave 3: Task 10 restart + testing
- Wave 4 (optional): Task 9 selfie
