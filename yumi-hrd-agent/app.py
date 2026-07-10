import os
import logging
import asyncio
import uuid
import io
from datetime import datetime, timezone, timedelta

import httpx
from dotenv import load_dotenv
from telegram import Update, Bot, ReplyKeyboardMarkup, ReplyKeyboardRemove, KeyboardButton, InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo
from telegram.ext import Application, CommandHandler, ContextTypes, MessageHandler, filters
from telegram.request import HTTPXRequest

load_dotenv()

BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
# Group where attendance notifications are broadcast (overrides yumi-ai-bot behavior)
REPORT_CHAT_ID = int(os.getenv("TELEGRAM_REPORT_CHAT_ID", "-1003991897388"))

WIB = timezone(timedelta(hours=7))
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

# ── Supabase helpers ──

def _headers():
    return {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
    }

def _svc_headers():
    return {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
    }

async def _fetch(table: str, query: str = "") -> list[dict]:
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    if query:
        url = f"{url}?{query}"
    async with httpx.AsyncClient() as client:
        r = await client.get(url, headers=_headers(), timeout=15)
        r.raise_for_status()
        return r.json() if isinstance(r.json(), list) else []

async def _post(table: str, payload: dict) -> dict:
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    async with httpx.AsyncClient() as client:
        r = await client.post(url, json=payload, headers={**_headers(), "Prefer": "return=representation"}, timeout=15)
        r.raise_for_status()
        data = r.json()
        return data[0] if isinstance(data, list) and data else {}

async def _patch(table: str, query: str, payload: dict) -> dict:
    url = f"{SUPABASE_URL}/rest/v1/{table}?{query}"
    async with httpx.AsyncClient() as client:
        r = await client.patch(url, json=payload, headers={**_headers(), "Prefer": "return=representation"}, timeout=15)
        r.raise_for_status()
        data = r.json()
        return data[0] if isinstance(data, list) and data else {}

async def _post_legacy_mirror(payload: dict) -> dict:
    url = f"{SUPABASE_URL}/rest/v1/documents"
    headers = {**_svc_headers(), "Accept-Profile": "legacy_mirror", "Content-Profile": "legacy_mirror", "Prefer": "return=representation"}
    async with httpx.AsyncClient() as client:
        r = await client.post(url, json=payload, headers=headers, timeout=15)
        r.raise_for_status()
        data = r.json()
        return data[0] if isinstance(data, list) and data else {}

# ── Time helpers ──

def _now_wib() -> datetime:
    return datetime.now(timezone.utc).astimezone(WIB)

def _start_of_day_ms(dt: datetime) -> int:
    return int(datetime(dt.year, dt.month, dt.day, tzinfo=WIB).timestamp() * 1000)

def _format_time_hm(ts_ms) -> str:
    ts = int(float(ts_ms) / 1000) if isinstance(ts_ms, (int, float, str)) else int(ts_ms)
    return datetime.fromtimestamp(ts, tz=WIB).strftime("%H:%M")

def _minutes_to_human(mins: int) -> str:
    h = mins // 60
    m = mins % 60
    if h > 0:
        return f"{h} jam {m} menit"
    return f"{m} menit"

# ── Attendance helpers ──

async def _find_employee_by_telegram(telegram_id: int) -> dict | None:
    rows = await _fetch("employee_telegram_links",
        f"select=employee_user_id,employee_name,is_active"
        f"&telegram_user_id=eq.{telegram_id}"
        f"&is_active=eq.true&limit=1")
    return rows[0] if rows else None

async def _require_employee(update: Update) -> dict | None:
    if not update.effective_user:
        if update.message:
            await update.message.reply_text("❌ Tidak dapat mengidentifikasi user.")
        return None
    emp = await _find_employee_by_telegram(update.effective_user.id)
    if not emp:
        if update.message:
            await update.message.reply_text(
                    "❌ *Kamu belum terdaftar!*\n\n"
                    "Untuk menggunakan bot ini:\n\n"
                    "1️⃣ Buka *profil karyawan* di website\n"
                    "2️⃣ Cari *Kode Registrasi* (contoh: `DT-6MOI`)\n"
                    "3️⃣ Klik tombol **🔑 Daftar / Hubungkan** di bawah\n"
                    "4️⃣ Ketik kode registrasi kamu\n\n"
                    "Atau ketik `/start` untuk panduan lengkap.",
                parse_mode="Markdown",
                reply_markup=_main_keyboard(is_registered=False))
    return emp

async def _has_today_attendance(employee_user_id: str, att_type: str) -> tuple[bool, dict | None]:
    today_start = _start_of_day_ms(_now_wib())
    today_end = today_start + 86400000
    rows = await _fetch("pos_attendance_logs",
        f"select=timestamp,type"
        f"&userId=eq.{employee_user_id}"
        f"&type=eq.{att_type}"
        f"&timestamp=gte.{today_start}"
        f"&timestamp=lt.{today_end}"
        f"&order=timestamp.desc&limit=1")
    if rows:
        return True, rows[0]
    return False, None

async def _insert_attendance(employee_user_id: str, att_type: str, notes: str = "",
                              shift_name: str = "", shift_open_time: str = "") -> bool:
    now = int(_now_wib().timestamp() * 1000)
    doc_id = f"att_tele_{uuid.uuid4().hex[:20]}"
    doc = {
        "userId": employee_user_id,
        "type": att_type,
        "timestamp": now,
        "source": "telegram_hrd",
        "notes": notes,
    }
    if shift_name:
        doc["shiftName"] = shift_name
    if shift_open_time:
        doc["shiftOpenTimeSnapshot"] = shift_open_time
    try:
        await _post_legacy_mirror({
            "table_name": "attendance",
            "document_id": doc_id,
            "creation_time": now,
            "document": doc,
        })
        return True
    except Exception as e:
        logger.error("insert_attendance failed: %s", e)
        return False


async def _notify_attendance_group(emp: dict, att_type: str, now_dt,
                                   shift_name: str = "", notes: str = "") -> None:
    """Broadcast an attendance event to the [Report] Djiwa Tentram group.

    Format (matches the HR report style):
        🚶‍➡️ Absen Masuk — 08/07 12:43
        👤 Muhamad Taofikurohman • BARISTA
        🕐 12:43 WIB
        📌 Shift Pagi (07:30 - 14:30)
        ⚠️ Terlambat 313 menit
        💰 Potongan shift: Rp36,667

    Includes photo (if any) + late penalty calculation.
    """
    if not REPORT_CHAT_ID:
        return

    emp_name = emp.get("employee_name", "Karyawan")
    emp_id = emp.get("employee_user_id", "")
    role_name = ""

    # Fetch role + rate for penalty calculation
    base_shift_rate = 0
    try:
        staff = await _fetch("pos_staff_users",
            f"select=roleName,roleId&_id=eq.{emp_id}&limit=1")
        if staff:
            role_name = staff[0].get("roleName", "")
            role_id = staff[0].get("roleId", "")
            if role_id:
                roles = await _fetch("pos_staff_roles",
                    f"select=raw&_id=eq.{role_id}&limit=1")
                if roles:
                    raw = roles[0].get("raw")
                    if isinstance(raw, dict):
                        base_shift_rate = int(raw.get("baseShiftRate", 0))
    except Exception as e:
        logger.warning("notify role fetch: %s", e)

    date_str = now_dt.strftime("%d/%m")
    time_str = now_dt.strftime("%H:%M")
    icon = "🚶‍➡️" if att_type == "check_in" else "📤"
    label = "Absen Masuk" if att_type == "check_in" else "Absen Keluar"

    lines = [
        f"{icon} {label} — {date_str} {time_str}",
        f"👤 {emp_name}" + (f" • {role_name}" if role_name else ""),
        f"🕐 {time_str} WIB",
    ]

    # Shift schedule + lateness (only meaningful for check-in)
    if att_type == "check_in":
        try:
            ss = await _fetch("pos_site_settings", "select=raw&limit=1")
            schedules = []
            if ss:
                raw = ss[0].get("raw", {})
                if isinstance(raw, dict):
                    schedules = raw.get("shiftSettings", {}).get("shiftSchedules", [])
            if not shift_name and schedules:
                # Auto-detect shift from check-in time
                check_min = now_dt.hour * 60 + now_dt.minute
                matches = []
                for s in schedules:
                    ot = s.get("openTime", "")
                    ct = s.get("closeTime", "")
                    name = s.get("name", s.get("shiftName", ""))
                    if not ot or not ct or not name:
                        continue
                    try:
                        oh, om = int(ot.split(":")[0]), int(ot.split(":")[1])
                        ch, cm = int(ct.split(":")[0]), int(ct.split(":")[1])
                    except (ValueError, IndexError):
                        continue
                    open_min = oh * 60 + om
                    close_min = ch * 60 + cm
                    in_window = False
                    if open_min <= close_min:
                        if (open_min - 60) <= check_min < close_min:
                            in_window = True
                    else:
                        if check_min >= open_min or check_min < close_min:
                            in_window = True
                    if in_window:
                        matches.append({"name": name, "open_min": open_min})
                if matches:
                    matches.sort(key=lambda x: x["open_min"], reverse=True)
                    shift_name = matches[0]["name"]

            if shift_name and schedules:
                sched = next((s for s in schedules
                              if s.get("name") == shift_name or s.get("shiftName") == shift_name), None)
                if sched:
                    open_t = sched.get("openTime", "")
                    close_t = sched.get("closeTime", "")
                    lines.append(f"📌 {shift_name} ({open_t} - {close_t})")

                    # Lateness
                    if open_t and close_t:
                        oh, om = int(open_t.split(":")[0]), int(open_t.split(":")[1])
                        ch, cm = int(close_t.split(":")[0]), int(close_t.split(":")[1])
                        open_min = oh * 60 + om
                        close_min = ch * 60 + cm
                        check_min = now_dt.hour * 60 + now_dt.minute
                        late_mins = check_min - open_min
                        tolerance = 5
                        if late_mins > tolerance:
                            shift_duration = close_min - open_min or 480
                            penalty_mins = late_mins - tolerance
                            lines.append(f"⚠️ Terlambat {late_mins} menit")
                            if base_shift_rate > 0 and shift_duration > 0:
                                denda = int((penalty_mins / shift_duration) * base_shift_rate)
                                lines.append(f"💰 Potongan shift: Rp{denda:,}")
                        else:
                            lines.append("✅ Tepat waktu")
                else:
                    lines.append(f"📌 {shift_name}")
            elif shift_name:
                lines.append(f"📌 {shift_name}")
        except Exception as e:
            logger.warning("notify shift calc: %s", e)

    msg = "\n".join(lines)

    # Photo (if present in notes)
    photo_bytes = None
    if notes:
        import re
        m = re.search(r"foto:\s*(\S+)", notes)
        if m:
            foto_url = m.group(1)
            try:
                async with httpx.AsyncClient() as client:
                    resp = await client.get(foto_url, timeout=15)
                    if resp.status_code == 200:
                        photo_bytes = resp.content
            except Exception as e:
                logger.warning("notify photo fetch: %s", e)

    try:
        from telegram import Bot as _Bot
        bot = _Bot(token=BOT_TOKEN)
        if photo_bytes:
            await bot.send_photo(chat_id=REPORT_CHAT_ID, photo=photo_bytes,
                                 caption=msg, parse_mode="Markdown")
        else:
            await bot.send_message(chat_id=REPORT_CHAT_ID, text=msg, parse_mode="Markdown")
        logger.info("Attendance broadcast sent to group %s for %s", REPORT_CHAT_ID, emp_name)
    except Exception as e:
        logger.error("attendance group notify failed: %s", e)


async def _find_shift_at_time(timestamp_ms: int) -> dict:
    """Uses time-based detection from shiftSchedules config (same logic as web app).
    When shifts overlap, picks the one with the LATEST openTime (most recently started).
    This fixes the bug where Shift Pagi (07:30-14:30) was always returned 
    instead of Shift Sore (13:00-21:00) during overlap 13:00-14:30.
    """
    try:
        rows = await _fetch("pos_site_settings", "select=raw&limit=1")
        if not rows:
            return {}
        raw = rows[0].get("raw", {})
        if not isinstance(raw, dict):
            return {}
        ss = raw.get("shiftSettings", {})
        if not isinstance(ss, dict):
            return {}
        schedules = ss.get("shiftSchedules", [])
        if not isinstance(schedules, list) or not schedules:
            return {}

        now = datetime.fromtimestamp(timestamp_ms / 1000, tz=WIB)
        current_minutes = now.hour * 60 + now.minute

        matches: list[dict] = []
        for s in schedules:
            ot = s.get("openTime", "")
            ct = s.get("closeTime", "")
            name = s.get("name", s.get("shiftName", ""))
            if not ot or not ct or not name:
                continue
            try:
                oh, om = int(ot.split(":")[0]), int(ot.split(":")[1])
                ch, cm = int(ct.split(":")[0]), int(ct.split(":")[1])
            except (ValueError, IndexError):
                continue
            open_min = oh * 60 + om
            close_min = ch * 60 + cm

            in_window = False
            if open_min <= close_min:
                if current_minutes >= (open_min - 60) and current_minutes < close_min:
                    in_window = True
            else:
                # Overnight shift (e.g., 21:00 - 05:00)
                if current_minutes >= open_min or current_minutes < close_min:
                    in_window = True

            if in_window:
                matches.append({"shift_name": name, "open_min": open_min})

        if matches:
            # When multiple shifts match (overlap), pick the latest-starting one
            matches.sort(key=lambda x: x["open_min"], reverse=True)
            return {"shift_name": matches[0]["shift_name"]}

        # No current shift matches → pick closest upcoming
        closest = None
        min_delta = 9999
        for s in schedules:
            ot = s.get("openTime", "")
            name = s.get("name", s.get("shiftName", ""))
            if not ot or not name:
                continue
            try:
                oh, om = int(ot.split(":")[0]), int(ot.split(":")[1])
            except (ValueError, IndexError):
                continue
            open_min = oh * 60 + om
            delta = open_min - current_minutes
            if delta < 0:
                delta += 1440
            if delta < min_delta:
                min_delta = delta
                closest = {"shift_name": name}

        return closest or {}

    except Exception as e:
        logger.warning("find_shift_at_time failed: %s", e)
    return {}

# ── Keyboard helpers ──

def _main_keyboard(is_registered: bool = True) -> ReplyKeyboardMarkup:
    if is_registered:
        return ReplyKeyboardMarkup(
            [["✅ Absen Masuk", "📤 Absen Keluar"], ["📋 Status Saya", "📊 Rekap Bulanan"]],
            resize_keyboard=True,
        )
    return ReplyKeyboardMarkup(
        [["🔑 Daftar / Hubungkan"]],
        resize_keyboard=True,
    )

def _location_keyboard() -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        [[KeyboardButton("📍 Kirim Lokasi", request_location=True)]],
        resize_keyboard=True,
        one_time_keyboard=True,
    )

# ── State machine untuk flow clockin ──
_user_states: dict[int, dict] = {}

def _set_state(telegram_id: int, state: str, **data):
    _user_states[telegram_id] = {"state": state, **data}

def _get_state(telegram_id: int) -> dict | None:
    return _user_states.get(telegram_id)

def _clear_state(telegram_id: int):
    _user_states.pop(telegram_id, None)

# ── Haversine distance ──
import math
def _haversine_km(lat1, lon1, lat2, lon2):
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    return R * c

async def _get_attendance_radius() -> tuple[float, float, float] | None:
    """Return (lat, lng, radius_m) from site settings, or None."""
    try:
        rows = await _fetch("pos.site_settings", "select=raw&limit=1")
        if rows:
            raw = rows[0].get("raw", {})
            lat = raw.get("attendanceLat")
            lng = raw.get("attendanceLng")
            radius = raw.get("attendanceRadius", 100)
            if lat and lng:
                return (float(lat), float(lng), float(radius))
    except Exception as e:
        logger.warning("get_attendance_radius failed: %s", e)
    return None

async def _upload_photo_to_storage(employee_id: str, photo_bytes: bytes) -> str | None:
    """Upload photo ke Supabase storage, return public URL or None."""
    try:
        ext = "jpg"
        object_name = f"attendance/{employee_id}/{int(_now_wib().timestamp() * 1000)}.{ext}"
        url = f"{SUPABASE_URL}/storage/v1/object/attendance-photos/{object_name}"
        headers = {
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
            "Content-Type": "image/jpeg",
        }
        async with httpx.AsyncClient() as client:
            r = await client.post(url, content=photo_bytes, headers=headers, timeout=30)
            if r.status_code in (200, 201):
                return f"{SUPABASE_URL}/storage/v1/object/public/attendance-photos/{object_name}"
            logger.warning("upload_photo failed: %d %s", r.status_code, r.text[:200])
    except Exception as e:
        logger.error("upload_photo error: %s", e)
    return None

# ── Command Handlers ──

async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Onboarding: beda pesan untuk user baru vs sudah daftar."""
    # Cek apakah user sudah terdaftar
    emp = None
    if update.effective_user:
        emp = await _find_employee_by_telegram(update.effective_user.id)

    if emp:
        # ── Registered user ──
        name = emp.get("employee_name", "Karyawan")
        await update.message.reply_text(
            f"👋 *Selamat datang kembali, {name}!*\n\n"
            f"Kamu sudah terdaftar dan bisa langsung absen menggunakan tombol di bawah.\n\n"
            f"📌 *Tombol yang tersedia:*\n"
            f"✅ *Absen Masuk* — Catat kedatangan\n"
            f"📤 *Absen Keluar* — Catat pulang\n"
            f"📋 *Status Saya* — Cek absensi hari ini\n"
            f"📊 *Log Hari Ini* — Detail absensi, denda & bonus",
            parse_mode="Markdown",
            reply_markup=_main_keyboard())
    else:
        # ── New user: onboarding ──
        await update.message.reply_text(
            "👋 *Selamat datang di Yumi HRD Bot!*\n\n"
            "Bot ini membantu kamu **absen kerja** via Telegram dengan mudah.\n\n"
            "━━━ *LANGKAH 1 — Dapatkan Kode* ━━━\n"
            "🔑 Buka *profil karyawan* di website\n"
            "   Cari bagian *\"Kode Registrasi\"* (contoh: `DT-6MOI`)\n\n"
            "━━━ *LANGKAH 2 — Daftarkan Akun* ━━━\n"
            "📝 Klik tombol **🔑 Daftar / Hubungkan** di bawah\n"
            "   Lalu ketik kode registrasi kamu\n\n"
            "━━━ *LANGKAH 3 — Mulai Absen* ━━━\n"
            "✅ Setelah terdaftar, kamu bisa langsung:\n"
            "   • ✅ Absen Masuk\n"
            "   • 📤 Absen Keluar\n"
            "   • 📋 Cek Status Absensi\n\n"
            "💡 *Tips:* Kode unik hanya kamu yang punya — jangan bagikan ke orang lain!",
            parse_mode="Markdown",
            reply_markup=_main_keyboard(is_registered=False))

async def cmd_help(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "📖 *Bantuan Yumi HRD Bot*\n\n"
        "1️⃣ *Daftar*\n"
        "   Klik tombol 🔑 Daftar / Hubungkan lalu ketik kode.\n"
        "   Kode ada di profil karyawan website.\n\n"
        "2️⃣ *Absen Masuk*\n"
        "   Tekan tombol ✅ Absen Masuk\n\n"
        "3️⃣ *Absen Keluar*\n"
        "   Tekan tombol 📤 Absen Keluar\n\n"
        "4️⃣ *Cek Status*\n"
        "   Tekan tombol 📋 Status Saya\n\n"
        "5️⃣ *Rekap Bulanan*\n"
        "   Tekan tombol 📊 Rekap Bulanan — Lihat detail denda & bonus\n\n"
        "❓ Ada masalah? Hubungi admin.",
        parse_mode="Markdown",
        reply_markup=_main_keyboard())

async def cmd_daftar(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /daftar slash command (backward compat) or button press."""
    if not context.args:
        # Button press or /daftar without args → enter registration flow
        tg_id = update.effective_user.id if update.effective_user else 0
        if not tg_id:
            await update.message.reply_text("❌ Tidak dapat mengidentifikasi user.")
            return

        # Cek apakah sudah terdaftar
        existing = await _find_employee_by_telegram(tg_id)
        if existing:
            await update.message.reply_text(
                f"✅ Kamu sudah terdaftar sebagai *{existing.get('employee_name','')}*.\n"
                f"Gunakan tombol di bawah untuk absen.",
                parse_mode="Markdown",
                reply_markup=_main_keyboard(True))
            return

        _set_state(tg_id, "awaiting_registration")
        await update.message.reply_text(
            "🔑 *Hubungkan Akun Telegram*\n\n"
            "Ketikkan *kode registrasi* kamu yang ada di halaman profil website.\n\n"
            "Contoh: `DT-6MOI`\n\n"
            "Ketik /batal untuk membatalkan.",
            parse_mode="Markdown")
        return

    # With args — original /daftar KODE logic
    code = context.args[0].strip().upper()
    telegram_id = update.effective_user.id if update.effective_user else 0
    if not telegram_id:
        await update.message.reply_text("❌ Tidak dapat mengidentifikasi user.")
        return

    staff = await _fetch("pos_staff_users",
        f"select=_id,name,\"roleName\",telegram_code&isActive=eq.true&telegram_code=eq.{code}&limit=1")
    if not staff:
        await update.message.reply_text(
            f"❌ Kode \"{code}\" tidak valid.\n"
            "Periksa kembali kode registrasi di profil kamu.")
        return

    emp = staff[0]
    emp_id = emp.get("_id")
    emp_name = emp.get("name", "")
    emp_role = emp.get("roleName", "")
    emp_code = emp.get("telegram_code", "")

    existing = await _fetch("employee_telegram_links",
        f"select=_id&employee_user_id=eq.{emp_id}&limit=1")
    if existing:
        await update.message.reply_text(
            f"⚠️ Akun {emp_name} sudah terdaftar di Telegram.\n"
            "Hubungi admin jika ingin mengganti akun Telegram.")
        return

    existing_tg = await _fetch("employee_telegram_links",
        f"select=_id&telegram_user_id=eq.{telegram_id}&limit=1")
    if existing_tg:
        await update.message.reply_text(
            "⚠️ Akun Telegram ini sudah terdaftar dengan karyawan lain.")
        return

    now = int(_now_wib().timestamp() * 1000)
    try:
        await _post("employee_telegram_links", {
            "telegram_user_id": telegram_id,
            "employee_user_id": emp_id,
            "employee_name": emp_name,
            "registered_at": now,
            "is_active": True,
        })
    except Exception as e:
        logger.error("daftar failed: %s", e)
        await update.message.reply_text("❌ Gagal mendaftar. Coba lagi.")
        return

    await update.message.reply_text(
        f"✅ *Registrasi Berhasil!*\n\n"
        f"👤 *{emp_name}*\n"
        f"📌 *{emp_role}*\n"
        f"🔑 Kode: {emp_code}\n\n"
        f"✅ *Langkah Selanjutnya:*\n"
        f"Tekan tombol **✅ Absen Masuk** untuk mulai absen hari ini!\n\n"
        f"📌 Tombol yang tersedia:\n"
        f"   • ✅ Absen Masuk — Catat kedatangan\n"
        f"   • 📤 Absen Keluar — Catat pulang\n"
        f"   • 📋 Status Saya — Cek absensi hari ini\n"
        f"   • 📊 Rekap Bulanan — Rekap absensi bulan ini, denda & bonus, estimasi gaji\n\n"
        f"Selamat bekerja! 🎯",
        parse_mode="Markdown",
        reply_markup=_main_keyboard())

async def cmd_clockin(update: Update, context: ContextTypes.DEFAULT_TYPE):
    emp = await _require_employee(update)
    if not emp:
        return
    emp_id = emp["employee_user_id"]
    emp_name = emp["employee_name"]

    # Cek apakah masih dalam keadaan "check_in" (belum check_out)
    today_start = _start_of_day_ms(_now_wib())
    today_end = today_start + 86400000
    today_logs = await _fetch("pos_attendance_logs",
        f"select=type,timestamp"
        f"&userId=eq.{emp_id}"
        f"&timestamp=gte.{today_start}"
        f"&timestamp=lt.{today_end}"
        f"&order=timestamp.desc&limit=5")
    last_log = today_logs[0] if today_logs else None
    if last_log and last_log.get("type") == "check_in":
        ts = int(float(last_log.get("timestamp", 0)))
        t = _format_time_hm(ts) if ts else "?"
        await update.message.reply_text(
            f"⚠️ *{emp_name}*, kamu masih dalam status *Absen Masuk* jam {t} WIB.\n\n"
            f"Gunakan tombol 📤 Absen Keluar dulu sebelum absen masuk lagi.",
            parse_mode="Markdown",
            reply_markup=_main_keyboard())
        return

    # Step 1: Minta lokasi
    tg_id = update.effective_user.id if update.effective_user else 0
    _set_state(tg_id, "awaiting_location", emp=emp, intent="check_in")
    await update.message.reply_text(
        f"📍 *Langkah 1/2 — Kirim Lokasi*\n\n"
        f"Halo *{emp_name}*! Sebelum absen masuk, kirim lokasi kamu untuk verifikasi.\n\n"
        f"Tekan tombol **📍 Kirim Lokasi** di bawah.",
        parse_mode="Markdown",
        reply_markup=_location_keyboard())

async def cmd_clockout(update: Update, context: ContextTypes.DEFAULT_TYPE):
    emp = await _require_employee(update)
    if not emp:
        return
    emp_id = emp["employee_user_id"]
    emp_name = emp["employee_name"]

    # ponytail: bar/kitchen must do stock opname via web app, not bot
    try:
        staff = await _fetch("pos_staff_users",
            f"select=roleName&_id=eq.{emp_id}&limit=1")
        if staff:
            rn = staff[0].get("roleName") or ""
            role = rn.lower()
            if "bar" in role or "kitchen" in role:
                # Telegram Mini App for stock opname
                ts = int(_now_wib().timestamp() * 1000)
                mini_url = f"https://karyawan.yumme.id/absen-keluar-mini?uid={emp_id}&t={ts}"
                keyboard = InlineKeyboardMarkup([
                    [InlineKeyboardButton("📝 Isi Stock Opname", web_app=WebAppInfo(url=mini_url))]
                ])
                await update.message.reply_text(
                    f"⚠️ *{emp_name}*, absen keluar via bot tidak bisa untuk role {rn}.\n\n"
                    f"📌 Klik tombol di bawah untuk isi *Stock Opname* langsung di Telegram:",
                    parse_mode="Markdown",
                    reply_markup=keyboard)
                return
    except Exception:
        pass

    exists_in, log_in = await _has_today_attendance(emp_id, "check_in")
    if not exists_in:
        await update.message.reply_text(
            f"⚠️ *{emp_name}*, kamu belum absen masuk hari ini.\n\n"
            f"Tekan tombol ✅ Absen Masuk untuk absen masuk.",
            parse_mode="Markdown",
            reply_markup=_main_keyboard())
        return

    exists_out, _ = await _has_today_attendance(emp_id, "check_out")
    if exists_out:
        await update.message.reply_text(
            f"⚠️ *{emp_name}*, kamu sudah absen keluar hari ini.",
            parse_mode="Markdown",
            reply_markup=_main_keyboard())
        return

    check_in_ts = int(float(log_in.get("timestamp", 0)))
    now_ms = int(_now_wib().timestamp() * 1000)
    elapsed = (now_ms - check_in_ts) // 60000
    if elapsed < 30:
        await update.message.reply_text(
            f"⏳ Minimal 30 menit sejak absen masuk. ({elapsed} menit sejak check-in)\n"
            "Coba lagi nanti.",
            reply_markup=_main_keyboard())
        return

    ok = await _insert_attendance(emp_id, "check_out",
                                   notes="Absen via Telegram HRD")
    if not ok:
        await update.message.reply_text("❌ Gagal absen keluar. Coba lagi.",
            reply_markup=_main_keyboard())
        return

    # Broadcast to report group
    now_dt = _now_wib()
    await _notify_attendance_group(emp, "check_out", now_dt)

    duration_min = (now_ms - check_in_ts) // 60000
    now = _now_wib()
    date_str = now.strftime("%d/%m")
    time_str = now.strftime("%H:%M")
    await update.message.reply_text(
        f"✅ *Absen Keluar — {date_str} {time_str}*\n\n"
        f"👤 *{emp_name}*\n"
        f"🕐 {time_str} WIB\n"
        f"⏱️ Durasi: {_minutes_to_human(duration_min)}\n\n"
        f"Shift selesai! Selamat istirahat 🎉",
        parse_mode="Markdown",
        reply_markup=_main_keyboard())

async def cmd_status(update: Update, context: ContextTypes.DEFAULT_TYPE):
    emp = await _require_employee(update)
    if not emp:
        return
    emp_id = emp["employee_user_id"]
    emp_name = emp["employee_name"]

    staff_rows = await _fetch("pos_staff_users",
        f"select=name,\"roleName\"&_id=eq.{emp_id}&limit=1")
    role = staff_rows[0].get("roleName", "") if staff_rows else ""
    role_line = f" • {role}" if role else ""

    today_start = _start_of_day_ms(_now_wib())
    today_end = today_start + 86400000
    logs = await _fetch("pos_attendance_logs",
        f"select=type,timestamp"
        f"&userId=eq.{emp_id}"
        f"&timestamp=gte.{today_start}"
        f"&timestamp=lt.{today_end}"
        f"&order=timestamp.asc&limit=10")

    now = _now_wib()
    date_str = now.strftime("%d/%m/%Y")
    lines = [f"📋 *Status Absensi — {date_str}*",
             "────────────────────",
             f"👤 *{emp_name}*{role_line}", ""]

    check_in_ts = None
    check_out_ts = None
    for log in logs:
        if log.get("type") == "check_in":
            check_in_ts = int(float(log.get("timestamp", 0)))
        elif log.get("type") == "check_out":
            check_out_ts = int(float(log.get("timestamp", 0)))

    if not check_in_ts:
        lines.extend(["⏳ *Belum absen masuk*", "", "Tekan tombol ✅ Absen Masuk untuk absen masuk."])
        await update.message.reply_text("\n".join(lines), parse_mode="Markdown", reply_markup=_main_keyboard())
        return

    lines.append(f"✅ Absen Masuk: *{_format_time_hm(check_in_ts)} WIB*")
    if check_out_ts:
        lines.append(f"✅ Absen Keluar: *{_format_time_hm(check_out_ts)} WIB*")
        dur = (check_out_ts - check_in_ts) // 60000
        lines.append(f"⏱️ Durasi: *{_minutes_to_human(dur)}*")
        lines.extend(["", "Shift selesai! 🎉"])
    else:
        now_ms = int(_now_wib().timestamp() * 1000)
        dur = (now_ms - check_in_ts) // 60000
        lines.append(f"⏳ Absen Keluar: *Belum*")
        lines.append(f"⏱️ Durasi: *{_minutes_to_human(dur)}* (berjalan)")
        lines.extend(["", "Tekan tombol 📤 Absen Keluar untuk absen keluar."])

    await update.message.reply_text("\n".join(lines), parse_mode="Markdown", reply_markup=_main_keyboard())

# ── Rekap Bulanan (denda & bonus) ──

async def cmd_mylog(update: Update, context: ContextTypes.DEFAULT_TYPE):
    emp = await _require_employee(update)
    if not emp:
        return
    emp_id = emp["employee_user_id"]
    emp_name = emp["employee_name"]

    # ── 1) Dapatkan role, bonus config, & payroll rates ──
    role_name = ""
    bonus_amount = 0
    bonus_basis = "shift"
    bonus_tiers_raw = []
    base_shift_rate = 0
    daily_allowance = 0
    monthly_fixed_salary = 0
    overtime_rate = 0
    try:
        staff = await _fetch("pos_staff_users",
            f"select=\"roleName\",\"roleId\"&_id=eq.{emp_id}&limit=1")
        if staff:
            role_name = staff[0].get("roleName", "")
            role_id = staff[0].get("roleId", "")
            if role_id:
                roles = await _fetch("pos_staff_roles",
                    f"select=name,\"bonusTargetConfig\",raw&_id=eq.{role_id}&limit=1")
                if roles:
                    r = roles[0]
                    raw = r.get("raw")
                    if isinstance(raw, dict):
                        base_shift_rate = int(raw.get("baseShiftRate", 0))
                        daily_allowance = int(raw.get("dailyAllowance", 0))
                        monthly_fixed_salary = int(raw.get("monthlyFixedSalary", 0))
                        overtime_rate = int(raw.get("overtimeBonusPerHour") or raw.get("overtimeRatePerHour") or 0)
                    btc = r.get("bonusTargetConfig")
                    if btc and isinstance(btc, dict):
                        bonus_basis = str(btc.get("basis", "shift"))
                        tiers = btc.get("tiers", [])
                        bonus_tiers_raw = tiers if isinstance(tiers, list) else []
                        if bonus_tiers_raw:
                            first = bonus_tiers_raw[0]
                            if isinstance(first, dict):
                                bonus_amount = int(first.get("bonusAmount", 0))
    except Exception as e:
        logger.warning("mylog role fetch: %s", e)

    # ── 2) Shift schedules lookup ──
    shift_open_map: dict[str, str] = {}
    try:
        ss_rows = await _fetch("pos_site_settings", "select=raw&limit=1")
        if ss_rows:
            raw = ss_rows[0].get("raw", {})
            if isinstance(raw, dict):
                ss_raw = raw.get("shiftSettings", {})
                for sch in (ss_raw.get("shiftSchedules", []) if isinstance(ss_raw, dict) else []):
                    name = sch.get("name", "")
                    ot = sch.get("openTime", "")
                    if name and ot:
                        shift_open_map[name] = ot
    except Exception as e:
        logger.warning("mylog site_settings: %s", e)

    # ── 3) Ambil log absensi bulan ini ──
    now = _now_wib()
    month_start = _start_of_day_ms(datetime(now.year, now.month, 1, tzinfo=WIB))
    month_end = _start_of_day_ms(datetime(now.year, now.month + 1, 1, tzinfo=WIB)) if now.month < 12 \
                else _start_of_day_ms(datetime(now.year + 1, 1, 1, tzinfo=WIB))
    month_name = now.strftime("%B %Y")

    logs = await _fetch("pos_attendance_logs",
        f"select=type,timestamp,\"shiftName\",\"shiftOpenTimeSnapshot\""
        f"&userId=eq.{emp_id}"
        f"&timestamp=gte.{month_start}"
        f"&timestamp=lt.{month_end}"
        f"&order=timestamp.asc&limit=200")

    if not logs:
        await update.message.reply_text(
            f"📊 *Rekap Absensi — {month_name}*\n"
            "────────────────────\n"
            f"👤 *{emp_name}*\n\n"
            f"📭 *Belum ada data absensi bulan ini.*\n\n"
            f"Tekan tombol ✅ Absen Masuk untuk memulai.",
            parse_mode="Markdown", reply_markup=_main_keyboard())
        return

    # ── 4) Kelompokkan per hari ──
    # Struktur: { date_str: { check_ins: [...], check_outs: [...] } }
    days: dict[str, dict] = {}
    for log in logs:
        ts = int(float(log.get("timestamp", 0)))
        dt = datetime.fromtimestamp(ts / 1000, tz=WIB)
        date_key = dt.strftime("%d/%m")
        if date_key not in days:
            days[date_key] = {"check_ins": [], "check_outs": [], "date_dt": dt}
        if log.get("type") == "check_in":
            days[date_key]["check_ins"].append(log)
        elif log.get("type") == "check_out":
            days[date_key]["check_outs"].append(log)

    sorted_dates = sorted(days.keys(), key=lambda d: days[d]["date_dt"])

    # ── 5) Hitung statistik ──
    total_denda = 0
    total_durasi_min = 0
    total_sesi = 0
    total_hari = 0
    total_late_min = 0
    total_overtime_hours = 0.0

    # Detail per hari
    day_lines: list[str] = []

    for date_key in sorted_dates:
        day = days[date_key]
        cis = day["check_ins"]
        cos = day["check_outs"]
        co_pool = list(cos)
        hari_late = 0
        hari_durasi = 0
        hari_sesi = 0

        day_detail_parts = []

        for ci in cis:
            ci_ts = int(float(ci.get("timestamp", 0)))
            ci_time = _format_time_hm(ci_ts)
            shift_name = ci.get("shiftName") or ""
            shift_open = ci.get("shiftOpenTimeSnapshot") or ""
            shift_short = ""
            if "Pagi" in shift_name:
                shift_short = "Pagi"
            elif "Sore" in shift_name:
                shift_short = "Sore"
            elif "Malam" in shift_name:
                shift_short = "Malam"

            # Cari check_out
            co_ts = None
            for co in co_pool:
                co_t = int(float(co.get("timestamp", 0)))
                if co_t > ci_ts:
                    co_ts = co_t
                    co_pool.remove(co)
                    break

            # Hitung late
            late_min = 0
            open_time_str = shift_open or shift_open_map.get(shift_name, "")
            if open_time_str:
                try:
                    parts = open_time_str.split(":")
                    oh, om = int(parts[0]), int(parts[1])
                    ci_dt = datetime.fromtimestamp(ci_ts / 1000, tz=WIB)
                    ci_min = ci_dt.hour * 60 + ci_dt.minute
                    open_min = oh * 60 + om
                    if ci_min > open_min:
                        late_min = ci_min - open_min
                except (ValueError, IndexError):
                    pass

            hari_late += late_min
            total_late_min += late_min
            total_denda += late_min * 1000
            hari_sesi += 1
            total_sesi += 1

            # Durasi
            has_checkout = False
            if co_ts:
                dur = (co_ts - ci_ts) // 60000
                co_time = _format_time_hm(co_ts)
                has_checkout = True
            else:
                dur = 0  # Sesi tanpa check_out jangan dihitung ke statistik
                co_time = "?"

            if has_checkout:
                hari_durasi += dur
                total_durasi_min += dur

            # Compact line per sesi: "Pagi ✅07:15→16:20 (9j5m)"
            late_tag = f"⚠️{late_min}m" if late_min > 0 else ""
            if co_time != "?":
                part = f"{shift_short} ✅{ci_time}→{co_time} ({_minutes_to_human(dur)}) {late_tag}".strip()
            else:
                part = f"{shift_short} ✅{ci_time}→? ⏳menunggu checkout {late_tag}".strip()
            day_detail_parts.append(part)

        if hari_sesi > 0:
            total_hari += 1
            # Gabung sesi dalam 1 hari: "📅 05/07 → Pagi ✅07:15→16:20 | Sore ✅17:30→?"
            joined = " | ".join(day_detail_parts)
            day_lines.append(f"📅 *{date_key}* → {joined}")

    # ── 6) Overtime ──
    total_jam = total_durasi_min / 60
    overtime_hours = 0.0
    overtime_bonus = 0
    if overtime_rate > 0:
        overtime_hours = max(0, total_jam - (total_sesi * 8))
        overtime_bonus = int(overtime_hours * overtime_rate)

    # ── 7) Hitung bonus ──
    if bonus_basis == "shift" and bonus_amount > 0:
        total_bonus = total_sesi * bonus_amount
    elif bonus_basis == "monthly" and bonus_amount > 0:
        total_bonus = bonus_amount
    else:
        total_bonus = 0

    # ── 8) Payroll estimate ──
    total_shift_salary = total_sesi * base_shift_rate
    total_allowance = total_hari * daily_allowance

    net_salary = (monthly_fixed_salary + total_shift_salary + total_allowance
                  + overtime_bonus + total_bonus - total_denda)

    # ── 9) Build message ──
    lines = [
        f"📊 *Rekap Absensi — {month_name}*",
        "────────────────────",
        f"👤 *{emp_name}*" + (f" | {role_name}" if role_name else ""),
        "",
        "📅 *Ringkasan Bulanan*",
        f"   ✅ Hadir: *{total_hari} hari* ({total_sesi} sesi)",
        f"   ⏱️ Total jam: *{total_jam:.1f} jam*",
        f"   ⏱️ Rata-rata: *{total_jam / max(total_hari, 1):.1f} jam/hari*",
        f"",
    ]

    if total_late_min > 0:
        lines.append(f"   ⚠️ Terlambat: *{total_late_min} menit* (total denda Rp {total_denda:,})")
    else:
        lines.append(f"   ✅ Tepat waktu — tidak ada keterlambatan")

    lines.append("")

    # ── Detail per hari (max 15) ──
    MAX_DAY_LINES = 15
    shown_days = day_lines[:MAX_DAY_LINES]
    hidden = len(day_lines) - MAX_DAY_LINES
    for dl in shown_days:
        lines.append(dl)
    if hidden > 0:
        lines.append(f"   ... dan {hidden} hari lainnya")

    lines.append("")
    lines.append("💵 *Estimasi Kompensasi*")

    has_any_payroll = False
    if monthly_fixed_salary > 0:
        has_any_payroll = True
        lines.append(f"   💰 Gaji tetap: Rp {monthly_fixed_salary:,}/bln")
    if base_shift_rate > 0:
        has_any_payroll = True
        lines.append(f"   💰 Gaji shift: {total_sesi} × Rp {base_shift_rate:,} = Rp {total_shift_salary:,}")
    if daily_allowance > 0:
        has_any_payroll = True
        lines.append(f"   🍱 Tunjangan: {total_hari} × Rp {daily_allowance:,} = Rp {total_allowance:,}")
    if overtime_rate > 0 and overtime_hours > 0:
        has_any_payroll = True
        lines.append(f"   ⏰ Lembur: {overtime_hours:.1f} jam × Rp {overtime_rate:,} = Rp {overtime_bonus:,}")
    if total_bonus > 0:
        has_any_payroll = True
        if bonus_basis == "shift":
            lines.append(f"   🎯 Bonus: {total_sesi} × Rp {bonus_amount:,} = Rp {total_bonus:,}")
        else:
            lines.append(f"   🎯 Bonus bulanan: Rp {total_bonus:,}")
    if total_denda > 0:
        has_any_payroll = True
        lines.append(f"   ❌ Denda: -Rp {total_denda:,}")

    if has_any_payroll:
        lines.append(f"   ─────────────────────")
        lines.append(f"   💵 *Estimasi bersih: Rp {net_salary:,}*")
    else:
        lines.append(f"   ℹ️ Belum ada konfigurasi gaji untuk role ini.")

    await update.message.reply_text(
        "\n".join(lines), parse_mode="Markdown", reply_markup=_main_keyboard())

# ── Location Handler ──

async def handle_location(update: Update, context: ContextTypes.DEFAULT_TYPE):
    tg_id = update.effective_user.id if update.effective_user else 0
    state = _get_state(tg_id)
    if not state or state.get("state") != "awaiting_location":
        return

    emp = state.get("emp")
    loc = update.message.location
    if not emp or not loc:
        _clear_state(tg_id)
        await update.message.reply_text("❌ Gagal membaca lokasi. Coba lagi.",
            reply_markup=_main_keyboard())
        return

    emp_id = emp["employee_user_id"]
    emp_name = emp["employee_name"]

    # Cek radius
    radius_info = await _get_attendance_radius()
    if radius_info:
        cafe_lat, cafe_lng, radius_m = radius_info
        dist_km = _haversine_km(loc.latitude, loc.longitude, cafe_lat, cafe_lng)
        dist_m = dist_km * 1000
        if dist_m > radius_m:
            _clear_state(tg_id)
            await update.message.reply_text(
                f"❌ *Lokasi di luar radius!*\n\n"
                f"📍 Jarak kamu: *{dist_m:.0f}m* dari kafe\n"
                f"⚠️ Maksimal radius: *{radius_m:.0f}m*\n\n"
                f"Absen masuk hanya bisa dilakukan dari area kafe.",
                parse_mode="Markdown",
                reply_markup=_main_keyboard())
            return

    # Lokasi valid → simpan state, minta foto
    _set_state(tg_id, "awaiting_photo", emp=emp, intent="check_in",
               lat=loc.latitude, lng=loc.longitude)
    await update.message.reply_text(
        f"📍 *Langkah 2/2 — Kirim Foto Selfie*\n\n"
        f"Lokasi valid ✅\n\n"
        f"Sekarang kirim **foto selfie** kamu untuk verifikasi absen masuk.",
        parse_mode="Markdown",
        reply_markup=_main_keyboard())

# ── Photo Handler ──

async def handle_photo(update: Update, context: ContextTypes.DEFAULT_TYPE):
    tg_id = update.effective_user.id if update.effective_user else 0
    state = _get_state(tg_id)
    if not state or state.get("state") != "awaiting_photo":
        return

    emp = state.get("emp")
    intent = state.get("intent", "check_in")
    lat = state.get("lat")
    lng = state.get("lng")
    if not emp:
        _clear_state(tg_id)
        return

    emp_id = emp["employee_user_id"]
    emp_name = emp["employee_name"]

    _clear_state(tg_id)

    # Download photo
    photo_file = await update.message.photo[-1].get_file()
    photo_bytes_io = io.BytesIO()
    await photo_file.download_to_memory(photo_bytes_io)
    photo_bytes = photo_bytes_io.getvalue()

    # Upload to storage
    photo_url = await _upload_photo_to_storage(emp_id, photo_bytes)
    if not photo_url:
        await update.message.reply_text(
            "⚠️ Foto tidak tersimpan, tapi absen tetap diproses.",
            parse_mode="Markdown")

    # Record attendance
    now = _now_wib()
    now_ms = int(now.timestamp() * 1000)
    shift = await _find_shift_at_time(now_ms)
    shift_name = shift.get("shift_name", "")

    notes = "Absen via Telegram HRD"
    if photo_url:
        notes += f" | foto: {photo_url}"
    if lat and lng:
        notes += f" | lokasi: {lat},{lng}"

    ok = await _insert_attendance(emp_id, intent,
                                   notes=notes,
                                   shift_name=shift_name)
    if not ok:
        await update.message.reply_text("❌ Gagal absen. Coba lagi.",
            reply_markup=_main_keyboard())
        return

    # Broadcast to report group (intent is "check_in" here)
    await _notify_attendance_group(emp, intent, now, shift_name, notes)

    date_str = now.strftime("%d/%m")
    time_str = now.strftime("%H:%M")
    loc_line = f"📍 {lat},{lng}" if lat and lng else ""

    if intent == "check_in":
        await update.message.reply_text(
            f"✅ *Absen Masuk — {date_str} {time_str}*\n\n"
            f"👤 *{emp_name}*\n"
            f"🕐 {time_str} WIB\n"
            f"{f'📌 {shift_name}' if shift_name else ''}\n"
            f"{loc_line}\n"
            f"{'📸 Foto tersimpan ✅' if photo_url else ''}\n\n"
            f"Jangan lupa 📤 Absen Keluar nanti.",
            parse_mode="Markdown",
            reply_markup=_main_keyboard())
    else:
        await update.message.reply_text(
            f"✅ *Absen Keluar — {date_str} {time_str}*\n\n"
            f"👤 *{emp_name}*\n"
            f"🕐 {time_str} WIB\n\n"
            f"Shift selesai! Selamat istirahat 🎉",
            parse_mode="Markdown",
            reply_markup=_main_keyboard())

# ── Text Message Handlers (buttons) ──

async def handle_text(update: Update, context: ContextTypes.DEFAULT_TYPE):
    tg_id = update.effective_user.id if update.effective_user else 0
    text = (update.message.text or "").strip()

    # ── Handle /batal ──
    if text.lower() in ("/batal", "/cancel", "batal"):
        state = _get_state(tg_id)
        if state:
            _clear_state(tg_id)
        await update.message.reply_text(
            "✅ Dibatalakan. Silakan pilih menu di bawah.",
            reply_markup=_main_keyboard())
        return

    # ── Check state machine ──
    state = _get_state(tg_id)
    if state:
        s = state.get("state")

        if s == "awaiting_registration":
            # User is in registration flow — process the code
            code = text.upper().strip()
            # Validate format: should be like DT-XXXX
            if not code or len(code) < 3:
                await update.message.reply_text(
                    "❌ Kode tidak valid. Masukkan kode registrasi yang ada di profil website.\n\n"
                    "Ketik /batal untuk membatalkan.")
                return

            # Cek apakah sudah terdaftar
            existing = await _find_employee_by_telegram(tg_id)
            if existing:
                _clear_state(tg_id)
                await update.message.reply_text(
                    f"✅ Kamu sudah terdaftar sebagai *{existing.get('employee_name','')}*.\n"
                    "Gunakan tombol di bawah untuk absen.",
                    parse_mode="Markdown",
                    reply_markup=_main_keyboard(True))
                return

            # Look up staff by telegram_code
            staff = await _fetch("pos_staff_users",
                f'select=_id,name,"roleName",telegram_code&isActive=eq.true&telegram_code=eq.{code}&limit=1')
            if not staff:
                await update.message.reply_text(
                    f"❌ Kode *{code}* tidak valid.\n"
                    "Periksa kembali kode registrasi di profil kamu.\n\n"
                    "Ketik /batal untuk membatalkan.",
                    parse_mode="Markdown")
                return

            emp = staff[0]
            emp_id = emp.get("_id")
            emp_name = emp.get("name", "")
            emp_role = emp.get("roleName", "")

            # Check if already linked
            existing_link = await _fetch("employee_telegram_links",
                f"select=_id&employee_user_id=eq.{emp_id}&limit=1")
            if existing_link:
                _clear_state(tg_id)
                await update.message.reply_text(
                    f"⚠️ Akun {emp_name} sudah terdaftar di Telegram lain.\n"
                    "Hubungi admin jika ingin mengganti akun Telegram.")
                return

            # Check if this Telegram ID already used
            existing_tg = await _fetch("employee_telegram_links",
                f"select=_id&telegram_user_id=eq.{tg_id}&limit=1")
            if existing_tg:
                _clear_state(tg_id)
                await update.message.reply_text(
                    "⚠️ Akun Telegram ini sudah terdaftar dengan karyawan lain.")
                return

            # Register
            now = int(_now_wib().timestamp() * 1000)
            try:
                await _post("employee_telegram_links", {
                    "telegram_user_id": tg_id,
                    "employee_user_id": emp_id,
                    "employee_name": emp_name,
                    "registered_at": now,
                    "is_active": True,
                })
            except Exception as e:
                logger.error("daftar button failed: %s", e)
                await update.message.reply_text("❌ Gagal mendaftar. Coba lagi.")
                return

            _clear_state(tg_id)
            await update.message.reply_text(
                f"✅ *Registrasi Berhasil!*\n\n"
                f"👤 *{emp_name}*\n"
                f"📌 *{emp_role}*\n"
                f"🔑 Kode: {code}\n\n"
                f"✅ Sekarang kamu bisa absen langsung dari tombol di bawah!",
                parse_mode="Markdown",
                reply_markup=_main_keyboard(True))
            return

        # Unknown state → clear
        _clear_state(tg_id)
        await update.message.reply_text(
            "❌ Proses sebelumnya dibatalkan.\n"
            "Silakan mulai lagi dengan menekan tombol di bawah.",
            reply_markup=_main_keyboard())
        return

    # ── No state: handle button text ──
    if "Daftar" in text or "Hubungkan" in text:
        await cmd_daftar(update, context)
    elif "Absen Masuk" in text:
        await cmd_clockin(update, context)
    elif "Absen Keluar" in text:
        await cmd_clockout(update, context)
    elif "Status Saya" in text or "Status" in text:
        await cmd_status(update, context)
    elif "Rekap Bulanan" in text or "Log" in text or "rekap" in text.lower():
        await cmd_mylog(update, context)
    else:
        # Check if not registered → show registration prompt
        emp = await _find_employee_by_telegram(tg_id)
        if not emp:
            await _require_employee(update)
        else:
            await update.message.reply_text(
                "❌ Perintah tidak dikenali.\n"
                "Gunakan tombol di bawah atau /help untuk bantuan.",
                reply_markup=_main_keyboard(True))

# ── Main ──

async def post_init(app):
    me = await app.bot.get_me()
    logger.info("Yumi HRD Agent started: @%s", me.username)

def main():
    req = HTTPXRequest(read_timeout=10.0, write_timeout=10.0, connect_timeout=10.0, pool_timeout=5.0)
    app = Application.builder().token(BOT_TOKEN).request(req).post_init(post_init).build()
    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(CommandHandler("help", cmd_help))
    app.add_handler(CommandHandler("daftar", cmd_daftar))
    app.add_handler(MessageHandler(filters.LOCATION, handle_location))
    app.add_handler(MessageHandler(filters.PHOTO, handle_photo))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_text))
    logger.info("Yumi HRD Agent starting...")
    app.run_polling(timeout=1, drop_pending_updates=True)

if __name__ == "__main__":
    main()
