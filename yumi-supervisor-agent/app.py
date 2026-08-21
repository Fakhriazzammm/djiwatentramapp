import os
import logging
import asyncio
from html import escape
from collections import Counter
from datetime import datetime, timezone, timedelta

import httpx
from dotenv import load_dotenv
from telegram import Bot, InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import Application, CallbackQueryHandler, CommandHandler, ContextTypes

from hermes_adapter import (
    TelegramContext,
    audit_event,
    build_request,
    project_scope_summary,
    validate_response,
)
from telegram.request import HTTPXRequest

load_dotenv()

BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
BARISTA_GROUP_ID = int(os.getenv("BARISTA_GROUP_ID", "-5182004468"))
KITCHEN_GROUP_ID = int(os.getenv("KITCHEN_GROUP_ID", "-5199093599"))
TRANSACTION_GROUP_ID = int(os.getenv("TRANSACTION_GROUP_ID", "-1003927364523"))
MAYAR_RECONCILE_URL = os.getenv("MAYAR_RECONCILE_URL", "https://supabase.yumme.id/functions/v1/mayar-webhook")
MAYAR_WEBHOOK_TOKEN = os.getenv("MAYAR_WEBHOOK_TOKEN", "")

WIB = timezone(timedelta(hours=7))
logger = logging.getLogger(__name__)

def _payment_label(raw: str) -> str:
    """Convert stored payment method to display label."""
    labels = {
        "djiwaapp": "DjiwaApp",
        "cash": "Tunai",
        "qris_mayar": "QRIS",
        "mayar": "DjiwaApp",
    }
    return labels.get(raw.lower().strip(), raw.upper() if raw else "-")


def _sales_channel_label(payment_method: str, source: str = "", order_type: str = "") -> str:
    """Normalize payment/source values into the cashier report channel."""
    values = [str(value or "").strip().lower() for value in (payment_method, source, order_type)]
    joined = " ".join(values)
    if "gofood" in joined or "go_food" in joined:
        return "GoFood"
    if "grabfood" in joined or "grab_food" in joined or "grab" in joined:
        return "GrabFood"
    if "shopeefood" in joined or "shopee_food" in joined or "shopee" in joined:
        return "ShopeeFood"
    if "djiwaapp" in joined or "customer_self_service" in joined or "mayar" in joined:
        return "DjiwaApp"
    if any(value in ("cash", "tunai") for value in values):
        return "Tunai"
    if any(value in ("qris", "qris_mayar") for value in values):
        return "QRIS"
    if any(value in ("transfer", "bank_transfer") for value in values):
        return "Transfer"
    return _payment_label(payment_method or source or order_type or "Tidak diketahui")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)

# ── Global application reference ──────────────────────────────────────────

_app: Application | None = None
_last_mayar_reconcile_ms = 0

def _bot() -> Bot:
    return _app.bot if _app else Bot(token=BOT_TOKEN)

# ── Supabase helpers ─────────────────────────────────────────────

def _headers():
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
    }

async def _fetch(table: str, query: str = "") -> list[dict]:
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    if query:
        url = f"{url}?{query}"
    async with httpx.AsyncClient() as client:
        r = await client.get(url, headers=_headers(), timeout=15)
        r.raise_for_status()
        data = r.json()
        return data if isinstance(data, list) else []

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

async def _reconcile_mayar_payments(force: bool = False) -> None:
    """Fallback settlement check so paid Mayar invoices never depend on webhook delivery."""
    global _last_mayar_reconcile_ms
    now_ms = int(_now_wib().timestamp() * 1000)
    if not force and now_ms - _last_mayar_reconcile_ms < 30_000:
        return
    _last_mayar_reconcile_ms = now_ms
    if not MAYAR_WEBHOOK_TOKEN:
        logger.warning("Mayar reconciliation skipped: MAYAR_WEBHOOK_TOKEN is not configured")
        return
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                MAYAR_RECONCILE_URL,
                json={"action": "reconcile"},
                headers={"x-webhook-token": MAYAR_WEBHOOK_TOKEN},
                timeout=30,
            )
            response.raise_for_status()
            result = response.json()
        settled = result.get("settled") or []
        logger.info("Mayar reconciliation: scanned=%s settled=%s", result.get("scanned", 0), len(settled))
    except Exception as e:
        logger.error("Mayar reconciliation failed: %s", e)


def _service_role_headers():
    return {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
    }

async def _post_legacy_mirror(payload: dict) -> dict:
    """Insert a document into legacy_mirror.documents using service_role key."""
    url = f"{SUPABASE_URL}/rest/v1/documents"
    headers = {**_service_role_headers(), "Accept-Profile": "legacy_mirror", "Content-Profile": "legacy_mirror", "Prefer": "return=representation"}
    async with httpx.AsyncClient() as client:
        r = await client.post(url, json=payload, headers=headers, timeout=15)
        r.raise_for_status()
        data = r.json()
        return data[0] if isinstance(data, list) and data else {}

# ── Attendance helpers (Telegram Clock In/Out) ──────────────────

def _start_of_day_ms(dt: datetime) -> int:
    """Return epoch ms for start of day (00:00:00 WIB)."""
    return int(datetime(dt.year, dt.month, dt.day, tzinfo=WIB).timestamp() * 1000)

def _minutes_to_human(mins: int) -> str:
    h = mins // 60
    m = mins % 60
    if h > 0:
        return f"{h} jam {m} menit"
    return f"{m} menit"

async def _find_employee_by_telegram(telegram_id: int) -> dict | None:
    """Find employee linked to this Telegram user ID."""
    rows = await _fetch("employee_telegram_links",
        f"select=employee_user_id,employee_name,is_active"
        f"&telegram_user_id=eq.{telegram_id}"
        f"&is_active=eq.true&limit=1")
    return rows[0] if rows else None

async def _require_employee(update: Update) -> dict | None:
    """Middleware: cek apakah Telegram user sudah terdaftar sebagai karyawan."""
    if not update.effective_user:
        if update.message:
            await update.message.reply_text("❌ Tidak dapat mengidentifikasi user.")
        return None
    emp = await _find_employee_by_telegram(update.effective_user.id)
    if not emp:
        if update.message:
            await update.message.reply_text(
                "❌ Kamu belum terdaftar.\n"
                "Ketik `/daftar Nama Lengkap` untuk mendaftar.",
                parse_mode="Markdown")
    return emp

async def _has_today_attendance(employee_user_id: str, att_type: str) -> tuple[bool, dict | None]:
    """Cek apakah user sudah check_in/check_out hari ini. Return (ada, data_log)."""
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
    """Insert attendance record into legacy_mirror.documents."""
    now = int(_now_wib().timestamp() * 1000)
    import uuid
    doc_id = f"att_tele_{uuid.uuid4().hex[:20]}"
    doc = {
        "userId": employee_user_id,
        "type": att_type,
        "timestamp": now,
        "source": "telegram",
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

async def _update_last_clockin(employee_user_id: str, ts_ms: int):
    """Update last_clockin_at field in employee_telegram_links."""
    try:
        await _patch("employee_telegram_links",
            f"employee_user_id=eq.{employee_user_id}",
            {"last_clockin_at": ts_ms})
    except Exception as e:
        logger.warning("update_last_clockin failed: %s", e)

# ── Telegram Attendance Commands ────────────────────────────────

async def cmd_daftar(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Register Telegram account to employee account."""
    if not context.args:
        await update.message.reply_text(
            "📝 *Cara Daftar:*\n"
            "Ketik: `/daftar Nama Lengkap`\n\n"
            "Contoh: `/daftar AYUNDA PUTRI`\n\n"
            "Gunakan nama sesuai data kepegawaian kamu.",
            parse_mode="Markdown")
        return
    name = " ".join(context.args).strip()
    telegram_id = update.effective_user.id if update.effective_user else 0
    if not telegram_id:
        await update.message.reply_text("❌ Tidak dapat mengidentifikasi user.")
        return
    # Cari staff
    staff = await _fetch("pos_staff_users",
        f"select=_id,name,\"roleName\"&isActive=eq.true&name=like.{name}&limit=5")
    if not staff:
        await update.message.reply_text(
            f"❌ Nama \"{name}\" tidak ditemukan.\n"
            "Pastikan nama sesuai dengan data kepegawaian.")
        return
    if len(staff) > 1:
        await update.message.reply_text(
            f"⚠️ Ditemukan beberapa karyawan dengan nama \"{name}\".\n"
            "Hubungi admin untuk bantuan registrasi.")
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
            "Hubungi admin jika ingin mengganti akun Telegram.")
        return
    # Cek telegram_id sudah dipakai
    existing_tg = await _fetch("employee_telegram_links",
        f"select=_id&telegram_user_id=eq.{telegram_id}&limit=1")
    if existing_tg:
        await update.message.reply_text(
            f"⚠️ Akun Telegram ini sudah terdaftar dengan karyawan lain.")
        return
    # Simpan mapping
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
        logger.error("daftar insert failed: %s", e)
        await update.message.reply_text("❌ Gagal mendaftar. Coba lagi.")
        return
    await update.message.reply_text(
        f"✅ *Registrasi Berhasil!*\n\n"
        f"👤 *{emp_name}*\n"
        f"📌 *{emp_role}*\n\n"
        f"Sekarang kamu bisa:\n"
        f"• `/clockin` — Absen Masuk\n"
        f"• `/clockout` — Absen Keluar\n"
        f"• `/status` — Cek status absensi\n\n"
        f"Selamat bekerja! 🎯",
        parse_mode="Markdown")

async def cmd_clockin(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Absen masuk via Telegram."""
    emp = await _require_employee(update)
    if not emp:
        return
    emp_id = emp["employee_user_id"]
    emp_name = emp["employee_name"]
    # Cek double check-in
    exists, log = await _has_today_attendance(emp_id, "check_in")
    if exists and log:
        ts = int(float(log.get("timestamp", 0)))
        t = _format_time_hm(ts) if ts else "?"
        await update.message.reply_text(
            f"⚠️ *{emp_name}*, kamu sudah absen masuk hari ini jam {t} WIB.\n\n"
            f"Gunakan `/clockout` untuk absen keluar.",
            parse_mode="Markdown")
        return
    # Tentukan shift
    now = _now_wib()
    now_ms = int(now.timestamp() * 1000)
    shift = await _find_shift_at_time(now_ms)
    shift_name = shift.get("shift_name", "")
    # Insert attendance
    ok = await _insert_attendance(emp_id, "check_in",
                                   notes="Absen via Telegram",
                                   shift_name=shift_name)
    if not ok:
        await update.message.reply_text("❌ Gagal absen masuk. Coba lagi.")
        return
    await _update_last_clockin(emp_id, now_ms)
    date_str = now.strftime("%d/%m")
    time_str = now.strftime("%H:%M")
    await update.message.reply_text(
        f"✅ *Absen Masuk — {date_str} {time_str}*\n\n"
        f"👤 *{emp_name}*\n"
        f"🕐 {time_str} WIB\n"
        f"{f'📌 Shift {shift_name}' if shift_name else ''}\n\n"
        f"Gunakan `/clockout` untuk absen keluar nanti.",
        parse_mode="Markdown")

async def cmd_clockout(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Absen keluar via Telegram."""
    emp = await _require_employee(update)
    if not emp:
        return
    emp_id = emp["employee_user_id"]
    emp_name = emp["employee_name"]
    
    # Cari check-in terakhir (bisa dari hari sebelumnya untuk cross-day shift)
    today_start = _start_of_day_ms(_now_wib())
    today_end = today_start + 86400000
    rows = await _fetch("pos_attendance_logs",
        f"select=timestamp,type,shiftName"
        f"&userId=eq.{emp_id}"
        f"&type=eq.check_in"
        f"&order=timestamp.desc&limit=3")

    log_in = None
    for row in rows:
        ts = int(float(row.get("timestamp", 0)))
        # Accept check-in from today OR yesterday (for cross-day shifts)
        if ts >= (today_start - 86400000) and ts < today_end:
            log_in = row
            break

    if not log_in:
        await update.message.reply_text(
            f"⚠️ *{emp_name}*, kamu belum absen masuk.\n\n"
            f"Gunakan `/clockin` untuk absen masuk.",
            parse_mode="Markdown")
        return
    
    # Cek double check-out (today only)
    exists_out, _ = await _has_today_attendance(emp_id, "check_out")
    if exists_out:
        await update.message.reply_text(
            f"⚠️ *{emp_name}*, kamu sudah absen keluar hari ini.",
            parse_mode="Markdown")
        return
    # Grace period: minimal 30 menit sejak check-in
    check_in_ts = int(float(log_in.get("timestamp", 0)))
    now_ms = int(_now_wib().timestamp() * 1000)
    elapsed = (now_ms - check_in_ts) // 60000
    if elapsed < 30:
        await update.message.reply_text(
            f"⏳ Minimal 30 menit sejak absen masuk. ({elapsed} menit sejak check-in)\n"
            f"Coba lagi nanti.")
        return
    # Insert check-out
    ok = await _insert_attendance(emp_id, "check_out",
                                   notes="Absen via Telegram")
    if not ok:
        await update.message.reply_text("❌ Gagal absen keluar. Coba lagi.")
        return
    # Hitung durasi
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
        parse_mode="Markdown")

async def cmd_status(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Cek status absensi hari ini."""
    emp = await _require_employee(update)
    if not emp:
        return
    emp_id = emp["employee_user_id"]
    emp_name = emp["employee_name"]
    # Cari roleName
    staff_rows = await _fetch("pos_staff_users",
        f"select=name,\"roleName\"&_id=eq.{emp_id}&limit=1")
    role = staff_rows[0].get("roleName", "") if staff_rows else ""
    role_line = f" • {role}" if role else ""
    # Cari data absensi hari ini
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
             f"👤 *{emp_name}*{role_line}",
             ""]
    check_in_ts = None
    check_out_ts = None
    for log in logs:
        if log.get("type") == "check_in":
            check_in_ts = int(float(log.get("timestamp", 0)))
        elif log.get("type") == "check_out":
            check_out_ts = int(float(log.get("timestamp", 0)))
    if check_in_ts:
        lines.append(f"✅ Absen Masuk: *{_format_time_hm(check_in_ts)} WIB*")
    else:
        lines.append("⏳ *Belum absen masuk*")
        lines.append("")
        lines.append("Gunakan `/clockin` untuk absen masuk.")
        await update.message.reply_text("\n".join(lines), parse_mode="Markdown")
        return
    if check_out_ts:
        lines.append(f"✅ Absen Keluar: *{_format_time_hm(check_out_ts)} WIB*")
        dur = (check_out_ts - check_in_ts) // 60000
        lines.append(f"⏱️ Durasi: *{_minutes_to_human(dur)}*")
        lines.append("")
        lines.append("Shift selesai! 🎉")
    else:
        now_ms = int(_now_wib().timestamp() * 1000)
        dur = (now_ms - check_in_ts) // 60000
        lines.append(f"⏳ Absen Keluar: *Belum*")
        lines.append(f"⏱️ Durasi: *{_minutes_to_human(dur)}* (berjalan)")
        lines.append("")
        lines.append("Gunakan `/clockout` untuk absen keluar.")
    await update.message.reply_text("\n".join(lines), parse_mode="Markdown")

def _now_wib() -> datetime:
    return datetime.now(timezone.utc).astimezone(WIB)

def _format_time_ms(ts_ms) -> str:
    if isinstance(ts_ms, datetime):
        return ts_ms.strftime("%H:%M:%S")
    ts = int(float(ts_ms) / 1000) if isinstance(ts_ms, (int, float, str)) else int(ts_ms)
    return datetime.fromtimestamp(ts, tz=WIB).strftime("%H:%M:%S")

def _format_time_hm(ts_ms) -> str:
    if isinstance(ts_ms, datetime):
        return ts_ms.strftime("%H:%M")
    ts = int(float(ts_ms) / 1000) if isinstance(ts_ms, (int, float, str)) else int(ts_ms)
    return datetime.fromtimestamp(ts, tz=WIB).strftime("%H:%M")

# ── Product category lookups ─────────────────────────────────────

_BEVERAGE_CATEGORY_IDS: set[str] = set()
_BEVERAGE_PRODUCT_IDS: set[str] = set()
_FOOD_CATEGORY_IDS: set[str] = set()
_FOOD_PRODUCT_IDS: set[str] = set()
_STAFF_ROLE_MAP: dict[str, str] = {}

async def _build_beverage_lookup():
    global _BEVERAGE_CATEGORY_IDS, _BEVERAGE_PRODUCT_IDS
    try:
        cats = await _fetch("pos_categories", "select=_id,name,parentId")
        minuman_id = None
        for c in cats:
            if c.get("name", "").strip().lower() == "minuman":
                minuman_id = c["_id"]
                break
        if not minuman_id:
            logger.warning("build_beverage_lookup: 'Minuman' category not found")
            return
        beverage_cats = {minuman_id}
        for c in cats:
            if c.get("parentId") == minuman_id:
                beverage_cats.add(c["_id"])
        _BEVERAGE_CATEGORY_IDS = beverage_cats
        products = await _fetch("pos_products", "select=_id,categoryId&limit=500")
        _BEVERAGE_PRODUCT_IDS = {
            p["_id"] for p in products if p.get("categoryId") in _BEVERAGE_CATEGORY_IDS
        }
        logger.info("Beverage products loaded: %d", len(_BEVERAGE_PRODUCT_IDS))
    except Exception as e:
        logger.warning("build_beverage_lookup failed: %s", e)

async def _build_food_lookup():
    global _FOOD_CATEGORY_IDS, _FOOD_PRODUCT_IDS
    try:
        cats = await _fetch("pos_categories", "select=_id,name,parentId")
        makanan_id = None
        for c in cats:
            if c.get("name", "").strip().lower() == "makanan":
                makanan_id = c["_id"]
                break
        if not makanan_id:
            logger.warning("build_food_lookup: 'Makanan' category not found")
            return
        food_cats = {makanan_id}
        for c in cats:
            if c.get("parentId") == makanan_id:
                food_cats.add(c["_id"])
        _FOOD_CATEGORY_IDS = food_cats
        products = await _fetch("pos_products", "select=_id,categoryId&limit=500")
        _FOOD_PRODUCT_IDS = {
            p["_id"] for p in products if p.get("categoryId") in _FOOD_CATEGORY_IDS
        }
        logger.info("Food products loaded: %d", len(_FOOD_PRODUCT_IDS))
    except Exception as e:
        logger.warning("build_food_lookup failed: %s", e)

async def _build_staff_lookup():
    global _STAFF_ROLE_MAP
    try:
        users = await _fetch("pos_staff_users", "select=name,roleName&isActive=eq.true&limit=200")
        _STAFF_ROLE_MAP = {
            u.get("name", "").strip().lower(): (u.get("roleName") or "").strip()
            for u in users if u.get("name")
        }
        logger.info("Staff role map loaded: %d users", len(_STAFF_ROLE_MAP))
    except Exception as e:
        logger.warning("build_staff_lookup failed: %s", e)

_ROLE_ORDER = ["Barista", "Kitchen", "Kasir", "Waitress", "Manajer"]

# ── Role → Production Track mapping (synchronized with POS frontend) ──
_ROLE_TRACK_MAP: dict[str, str] = {
    "barista": "bar",
    "bartender": "bar",
    "bar": "bar",
    "chef": "kitchen",
    "koki": "kitchen",
    "kitchen": "kitchen",
    "cook": "kitchen",
}

def _get_staff_track(role_name: str | None) -> str:
    """Map role name to production track: 'bar', 'kitchen', or 'both'."""
    if not role_name:
        return "both"
    return _ROLE_TRACK_MAP.get(role_name.lower().strip(), "both")

def _is_staff_for_group(staff_name: str, group_type: str) -> bool:
    """Check if a staff member belongs to the given production group (barista/kitchen).
    Uses _STAFF_ROLE_MAP to resolve role, then checks against _ROLE_TRACK_MAP.
    Falls back to True (allow) when data is unavailable to avoid breaking existing flow."""
    key = staff_name.lower().strip()
    role = _STAFF_ROLE_MAP.get(key)
    if not role:
        # Staff not in map — uncertain, allow propagation (safe default)
        return True
    track = _get_staff_track(role)
    if group_type == "barista":
        return track in ("bar", "both")
    elif group_type == "kitchen":
        return track in ("kitchen", "both")
    return True

def _format_team_by_role(team_members: str, target_role: str | None = None) -> str:
    if not team_members or not team_members.strip():
        return ""
    names = [n.strip() for n in team_members.split(",") if n.strip()]
    if not names:
        return ""
    # Group by role
    grouped: dict[str, list[str]] = {}
    for name in names:
        key = name.lower()
        role = _STAFF_ROLE_MAP.get(key, "Lainnya")
        if role not in grouped:
            grouped[role] = []
        grouped[role].append(name)

    if target_role:
        # Filter for specific role
        members = []
        for role, role_names in grouped.items():
            if role.lower() == target_role.lower():
                members.extend(role_names)
        if not members:
            return ""
        return f"{target_role}: {', '.join(members)}"
    else:
        # All roles, sorted
        sorted_roles = sorted(grouped.keys(), key=lambda r: next((i for i, o in enumerate(_ROLE_ORDER) if o.lower() == r.lower()), 99))
        parts = []
        for role in sorted_roles:
            formatted_role = role[0].upper() + role[1:].lower() if role else role
            parts.append(f"  {formatted_role}: {', '.join(grouped[role])}")
        return "\n" + "\n".join(parts)

async def _lazy_fetch_product_category(pid: str) -> str:
    try:
        rows = await _fetch("pos_products", f"select=categoryId&_id=eq.{pid}&limit=1")
        if not rows:
            return "other"
        cat_id = rows[0].get("categoryId", "")
        # Fast path: check cached category sets
        if cat_id in _BEVERAGE_CATEGORY_IDS:
            _BEVERAGE_PRODUCT_IDS.add(pid)
            return "beverage"
        if cat_id in _FOOD_CATEGORY_IDS:
            _FOOD_PRODUCT_IDS.add(pid)
            return "food"
        # Fallback: traverse parent chain to find "Makanan" or "Minuman"
        # (works even if lookups never built at startup)
        try:
            visited = set()
            current_id = cat_id
            while current_id and current_id not in visited:
                visited.add(current_id)
                cat_rows = await _fetch("pos_categories", f"select=name,parentId&_id=eq.{current_id}&limit=1")
                if not cat_rows:
                    break
                cat_name = (cat_rows[0].get("name") or "").strip().lower()
                if cat_name == "minuman":
                    _BEVERAGE_CATEGORY_IDS.add(current_id)
                    _BEVERAGE_PRODUCT_IDS.add(pid)
                    return "beverage"
                elif cat_name == "makanan":
                    _FOOD_CATEGORY_IDS.add(current_id)
                    _FOOD_PRODUCT_IDS.add(pid)
                    return "food"
                current_id = cat_rows[0].get("parentId")
        except Exception:
            pass
        return "other"
    except Exception as e:
        logger.warning("lazy_fetch failed for %s: %s", pid, e)
        return "other"

async def _is_beverage_item(item: dict) -> bool:
    pid = item.get("productId", "")
    if not pid:
        return False
    if pid in _BEVERAGE_PRODUCT_IDS:
        return True
    if pid in _FOOD_PRODUCT_IDS:
        return False
    return await _lazy_fetch_product_category(pid) == "beverage"

async def _is_food_item(item: dict) -> bool:
    pid = item.get("productId", "")
    if not pid:
        return False
    if pid in _FOOD_PRODUCT_IDS:
        return True
    if pid in _BEVERAGE_PRODUCT_IDS:
        return False
    return await _lazy_fetch_product_category(pid) == "food"

async def _get_beverage_items(items: list) -> list[dict]:
    result = []
    for i in items:
        if await _is_beverage_item(i):
            result.append(i)
    return result

async def _get_food_items(items: list) -> list[dict]:
    result = []
    for i in items:
        if await _is_food_item(i):
            result.append(i)
    return result

# ── Order state tracking (in-memory + Supabase) ───────────────

_active_orders: dict[str, dict] = {}  # key: "{order_no}|barista" or "{order_no}|kitchen"

async def _insert_order_status(key: str, order: dict):
    """Insert new order status record into Supabase."""
    try:
        order_no, group_type = key.split("|")
        payload = {
            "order_no": order_no,
            "group_type": group_type,
            "status": order["status"],
            "order_type": order.get("order_type"),
            "customer_name": order.get("customer_name"),
            "items": order.get("items", []),
            "struk_line": order.get("struk_line"),
            "base_text": order.get("base_text"),
            "chat_id": order.get("chat_id"),
            "message_id": order.get("message_id"),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        result = await _post("pos_order_status", payload)
        logger.info("[%s] Inserted order_status id=%s", key, result.get("id"))
    except Exception as e:
        logger.error("[%s] Failed to insert order_status: %s", key, e)

async def _update_order_status(key: str, status: str, by: str | None = None, tg_user_id: int | None = None):
    """Update order status record in Supabase."""
    try:
        order_no, group_type = key.split("|")
        payload: dict = {"status": status, "updated_at": datetime.now(timezone.utc).isoformat()}
        if status == "dibuat":
            payload["dibuat_by"] = by
            payload["dibuat_at"] = datetime.now(timezone.utc).isoformat()
        elif status == "selesai":
            payload["selesai_by"] = by
            payload["selesai_at"] = datetime.now(timezone.utc).isoformat()
        if tg_user_id is not None:
            payload["telegram_user_id"] = tg_user_id
        await _patch("pos_order_status", f"order_no=eq.{order_no}&group_type=eq.{group_type}", payload)
        logger.info("[%s] Updated order_status to %s by %s (tg=%s)", key, status, by, tg_user_id)
    except Exception as e:
        logger.error("[%s] Failed to update order_status: %s", key, e)

async def _load_active_orders(bot: Bot):
    """Restore active orders from Supabase on startup."""
    global _active_orders
    try:
        rows = await _fetch("pos_order_status", "select=*&status=neq.selesai&order=created_at.desc&limit=200")
        count = 0
        for row in rows:
            key = f"{row['order_no']}|{row['group_type']}"
            created_at = datetime.fromisoformat(row["created_at"].replace("Z", "+00:00")) if row.get("created_at") else None
            dibuat_at = datetime.fromisoformat(row["dibuat_at"].replace("Z", "+00:00")) if row.get("dibuat_at") else None

            _active_orders[key] = {
                "key": key,
                "message": None,
                "base_text": row.get("base_text", ""),
                "chat_id": row.get("chat_id"),
                "message_id": row.get("message_id"),
                "status": row["status"],
                "dibuat_by": row.get("dibuat_by"),
                "selesai_by": row.get("selesai_by"),
                "dibuat_at": dibuat_at,
                "selesai_at": datetime.fromisoformat(row["selesai_at"].replace("Z", "+00:00")) if row.get("selesai_at") else None,
            }

            # Restore auto timers
            if row["status"] == "new" and created_at:
                elapsed = (datetime.now(timezone.utc) - created_at).total_seconds()
                remaining = max(0, 20 - elapsed)
                _active_orders[key]["auto_dibuat_task"] = asyncio.create_task(_auto_dibuat(key, int(remaining)))
                logger.info("[%s] Restored: auto-dibuat in %ds", key, int(remaining))
            elif row["status"] == "dibuat" and dibuat_at:
                elapsed = (datetime.now(timezone.utc) - dibuat_at).total_seconds()
                remaining = max(0, 600 - elapsed)
                _active_orders[key]["auto_selesai_task"] = asyncio.create_task(_auto_selesai(key, int(remaining)))
                logger.info("[%s] Restored: auto-selesai in %ds", key, int(remaining))
            count += 1
        logger.info("Restored %d active orders from Supabase", count)
    except Exception as e:
        logger.error("Failed to load active orders: %s", e)

async def _cancel_task(order: dict, key: str):
    task = order.get(key)
    if task and not task.done():
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

def _build_status_text(order: dict) -> str:
    base = order["base_text"]
    lines = [base]
    if order.get("dibuat_by"):
        lines.append(f"\n⏳ Dibuat oleh: {order['dibuat_by']}")
        lines.append(f"🕐 {_format_time_ms(order['dibuat_at'])}")
    if order.get("selesai_by"):
        lines.append(f"\n✅ Selesai oleh: {order['selesai_by']}")
        lines.append(f"🕐 {_format_time_ms(order['selesai_at'])}")
    return "\n".join(lines)

async def _update_message(order: dict, text: str, keyboard=None):
    """Edit Telegram message — uses stored chat_id + message_id if message object is stale."""
    try:
        msg = order.get("message")
        if msg:
            new_msg = await msg.edit_text(text, reply_markup=keyboard)
            order["message"] = new_msg
            order["message_id"] = new_msg.message_id
        else:
            # Fallback using chat_id + message_id (needed after restart)
            new_msg = await _bot().edit_message_text(
                text,
                chat_id=order["chat_id"],
                message_id=order["message_id"],
                reply_markup=keyboard,
            )
            order["message"] = new_msg
            order["message_id"] = new_msg.message_id
        # Update message_id in Supabase
        await _update_message_id(order)
    except Exception as e:
        logger.error("edit_text failed for %s: %s", order.get("key"), e)

async def _update_message_id(order: dict):
    """Update message_id in Supabase after editing."""
    try:
        order_no, group_type = order["key"].split("|")
        await _patch("pos_order_status", f"order_no=eq.{order_no}&group_type=eq.{group_type}", {
            "message_id": order.get("message_id"),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception:
        pass

async def _do_dibuat(key: str, by: str = "Otomatis", tg_user_id: int | None = None, siblings: bool = True):
    order = _active_orders.get(key)
    if not order:
        return
    if order["status"] != "new":
        # Staff override: update DB anyway with the staff name
        await _update_order_status(key, "dibuat", by, tg_user_id)
        logger.info("[%s] Staff override DIBUAT by %s (was %s)", key, by, order.get("dibuat_by"))
        return
    await _cancel_task(order, "auto_dibuat_task")

    order["status"] = "dibuat"
    order["dibuat_by"] = by
    order["dibuat_at"] = _now_wib()

    order_no, group_type = key.split("|")
    kb = InlineKeyboardMarkup([
        [InlineKeyboardButton("🏁 Selesai", callback_data=f"selesai|{order_no}|{group_type}")]
    ])
    text = _build_status_text(order)
    await _update_message(order, text, kb)
    await _update_order_status(key, "dibuat", by, tg_user_id)
    logger.info("[%s] Status: DIBUAT oleh %s", key, by)

    # Auto selesai setelah 30 menit (1800 detik)
    order["auto_selesai_task"] = asyncio.create_task(_auto_selesai(key, 1800))

    # ── Propagate staff name to sibling groups ──
    if siblings and by and by != "Otomatis":
        _, current_group = key.split("|")
        for sibling_key, sibling in list(_active_orders.items()):
            if sibling_key.startswith(f"{order_no}|") and sibling_key != key:
                current_sibling_by = sibling.get("dibuat_by")
                if not current_sibling_by or current_sibling_by == "Otomatis":
                    if sibling.get("status") in ("new", "dibuat"):
                        # Only propagate if staff belongs to sibling group's role track
                        sibling_group = sibling_key.split("|")[1]
                        if _is_staff_for_group(by, sibling_group):
                            logger.info("[%s] Propagating DIBUAT by %s to sibling %s", key, by, sibling_key)
                            await _do_dibuat(sibling_key, by=by, tg_user_id=tg_user_id, siblings=False)
                        else:
                            logger.info("[%s] Skipping DIBUAT propagation of %s to %s (role mismatch)", key, by, sibling_key)

async def _do_selesai(key: str, by: str = "Otomatis", tg_user_id: int | None = None, siblings: bool = True):
    order = _active_orders.get(key)
    if not order:
        return
    if order["status"] == "selesai":
        # Staff override: update DB anyway
        await _update_order_status(key, "selesai", by, tg_user_id)
        logger.info("[%s] Staff override SELESAI by %s", key, by)
        return
    await _cancel_task(order, "auto_dibuat_task")
    await _cancel_task(order, "auto_selesai_task")

    order["status"] = "selesai"
    order["selesai_by"] = by
    order["selesai_at"] = _now_wib()

    text = _build_status_text(order)
    await _update_message(order, text, None)
    await _update_order_status(key, "selesai", by, tg_user_id)
    logger.info("[%s] Status: SELESAI oleh %s (tg=%s)", key, by, tg_user_id)

    # Bersihkan setelah 30 menit agar dict tidak membesar
    asyncio.create_task(_cleanup_order(key, 1800))

    # ── Propagate staff name to sibling groups ──
    if siblings and by and by != "Otomatis":
        order_no, current_group = key.split("|")
        for sibling_key, sibling in list(_active_orders.items()):
            if sibling_key.startswith(f"{order_no}|") and sibling_key != key:
                current_sibling_by = sibling.get("selesai_by")
                if not current_sibling_by or current_sibling_by == "Otomatis":
                    if sibling.get("status") == "selesai":
                        # Only propagate if staff belongs to sibling group's role track
                        sibling_group = sibling_key.split("|")[1]
                        if _is_staff_for_group(by, sibling_group):
                            logger.info("[%s] Propagating SELESAI by %s to sibling %s", key, by, sibling_key)
                            await _do_selesai(sibling_key, by=by, tg_user_id=tg_user_id, siblings=False)
                        else:
                            logger.info("[%s] Skipping SELESAI propagation of %s to %s (role mismatch)", key, by, sibling_key)

async def _auto_dibuat(key: str, delay: int):
    """Auto-dibuat with live countdown in message text."""
    # Keep the initial keyboard (✅ Dibuat + 🏁 Selesai) visible during countdown
    order_no, group_type = key.split("|")
    kb = InlineKeyboardMarkup([
        [
            InlineKeyboardButton("✅ Dibuat", callback_data=f"dibuat|{order_no}|{group_type}"),
            InlineKeyboardButton("🏁 Selesai", callback_data=f"selesai|{order_no}|{group_type}"),
        ]
    ])
    remaining = delay
    while remaining > 0:
        order = _active_orders.get(key)
        if not order or order["status"] != "new":
            return  # User already clicked
        base = order["base_text"]
        text = f"{base}\n\nKlik tombol ✅ Dibuat atau otomatis dalam {remaining} detik..."
        await _update_message(order, text, kb)
        step = min(2, remaining)
        await asyncio.sleep(step)
        remaining -= step
    # Fire auto-dibuat
    order = _active_orders.get(key)
    if order and order["status"] == "new":
        await _do_dibuat(key, by="Otomatis")

async def _auto_selesai(key: str, delay: int):
    """Auto-selesai with live countdown in message text."""
    # Keep 🏁 Selesai button visible during the entire 10-minute countdown
    order_no, group_type = key.split("|")
    kb = InlineKeyboardMarkup([
        [InlineKeyboardButton("🏁 Selesai", callback_data=f"selesai|{order_no}|{group_type}")]
    ])
    remaining = delay
    while remaining > 0:
        order = _active_orders.get(key)
        if not order or order["status"] != "dibuat":
            return
        base = _build_status_text(order)
        m, s = divmod(remaining, 60)
        text = f"{base}\n\nKlik tombol 🏁 Selesai atau otomatis dalam {m}:{s:02d}..."
        await _update_message(order, text, kb)
        step = min(30, remaining)
        await asyncio.sleep(step)
        remaining -= step
    order = _active_orders.get(key)
    if order and order["status"] == "dibuat":
        await _do_selesai(key, by="Otomatis")

async def _cleanup_order(key: str, delay: int):
    await asyncio.sleep(delay)
    _active_orders.pop(key, None)

# ── Rate-limit retry helper ─────────────────────────────────────

async def _send_with_retry(bot, chat_id: int, text: str, reply_markup=None, max_retries: int = 5):
    """Send Telegram message with retry on 429 (rate limit)."""
    import re
    for attempt in range(max_retries):
        try:
            return await bot.send_message(chat_id=chat_id, text=text, reply_markup=reply_markup)
        except Exception as e:
            err_str = str(e)
            if "429" in err_str or "retry" in err_str.lower():
                match = re.search(r"retry_after\s*[:=]\s*(\d+)", err_str)
                wait = int(match.group(1)) if match else min(2 ** attempt + attempt * 1.5 + 0.5, 30)
                logger.warning(
                    "Rate limited (attempt %d/%d), waiting %.1fs...",
                    attempt + 1, max_retries, wait,
                )
                await asyncio.sleep(wait)
            else:
                raise
    raise RuntimeError(f"Failed to send message after {max_retries} retries")

# ── Notifications with inline keyboard ───────────────────────────

async def _send_barista_notification(app, order_no: str, customer: str, order_type: str, bev_items: list[dict], ts_ms: int, struk_line=None,
                                      guest_count=None, notes="", discount_amount=0.0, voucher_id=None, free_refill=None,
                                      source_label: str | None = None,
                                      payment_note: str | None = None):
    shift = await _find_shift_at_time(ts_ms)
    team = shift.get("team_members", "")
    type_labels = {
        "dine_in": "🍽 Dine-in",
        "takeaway": "🛍 Takeaway",
        "online": "📱 Online",
    }
    type_label = type_labels.get(order_type, f"📋 {order_type}")

    elapsed_min = int((_now_wib().timestamp() * 1000 - ts_ms) / 60000)
    elapsed_text = f"🕐 {elapsed_min} menit lalu" if elapsed_min >= 1 else "🕐 Baru saja"

    item_lines = []
    item_no = 1
    for item in bev_items:
        qty = int(float(item.get("quantity", 1)))
        name = (item.get("productName") or "?").strip()
        variant = item.get("variant")
        if variant:
            item_lines.append(f"  {item_no}. {qty}× {name}  ({variant})")
        else:
            item_lines.append(f"  {item_no}. {qty}× {name}")
        item_no += 1

    lines = []
    if struk_line:
        lines.append(f"📍 {struk_line}")
    lines.extend([
        f"☕ PESANAN BARU — 🕐 {_format_time_hm(ts_ms)}",
    ])
    if source_label:
        lines.append(f"📲 SUMBER: {source_label}")
    if payment_note:
        lines.append(f"⚠️ {payment_note}")
    lines.extend([
        "────────────",
        f"🆔 {order_no}",
    ])
    base_text = "\n".join(lines)
    extra_lines = [
        "",
        f"{type_label}",
    ]
    # Promo tag
    if discount_amount > 0:
        if free_refill:
            extra_lines.append("🏷️ Free Refill")
        elif voucher_id:
            extra_lines.append(f"🏷️ Promo {voucher_id}")
        else:
            extra_lines.append("🏷️ Happy Hour")
    customer_line = f"👤 {customer}"
    if guest_count and guest_count > 0:
        customer_line += f" — {int(guest_count)} orang"
    extra_lines.append(customer_line)
    barista_team_text = _format_team_by_role(team, "Barista") if team else ""
    if barista_team_text:
        extra_lines.append(f"👥 {barista_team_text}")
    if notes:
        extra_lines.append("")
        extra_lines.append(f"📝 {notes}")
    extra_lines.extend([
        "",
        "Minuman:",
        *item_lines,
        "────────────",
        f"⏳ Mohon segera dibuat! — {elapsed_text}",
        f"📦 {len(bev_items)} minuman",
        "",
        "Tekan tombol untuk memproses pesanan",
    ])
    base_text += "\n".join(extra_lines)

    kb = InlineKeyboardMarkup([
        [
            InlineKeyboardButton("✅ Dibuat", callback_data=f"dibuat|{order_no}|barista"),
            InlineKeyboardButton("🏁 Selesai", callback_data=f"selesai|{order_no}|barista"),
        ]
    ])

    try:
        msg = await _send_with_retry(app.bot, BARISTA_GROUP_ID, base_text, kb)
        key = f"{order_no}|barista"
        _active_orders[key] = {
            "key": key,
            "message": msg,
            "base_text": base_text,
            "chat_id": BARISTA_GROUP_ID,
            "message_id": msg.message_id,
            "status": "new",
            "dibuat_by": None,
            "selesai_by": None,
            "order_type": order_type,
            "customer_name": customer,
            "items": bev_items,
            "struk_line": struk_line,
        }
        _active_orders[key]["auto_dibuat_task"] = asyncio.create_task(_auto_dibuat(key, 300))
        await _insert_order_status(key, _active_orders[key])
        logger.info("Barista notification sent for %s (%d beverages)", order_no, len(bev_items))
    except Exception as e:
        logger.error("send_barista_notification failed for %s: %s", order_no, e)

async def _send_kitchen_notification(app, order_no: str, customer: str, order_type: str, food_items: list[dict], ts_ms: int, struk_line=None,
                                      guest_count=None, notes="", discount_amount=0.0, voucher_id=None, free_refill=None,
                                      source_label: str | None = None,
                                      payment_note: str | None = None):
    shift = await _find_shift_at_time(ts_ms)
    team = shift.get("team_members", "")
    type_labels = {
        "dine_in": "🍽 Dine-in",
        "takeaway": "🛍 Takeaway",
        "online": "📱 Online",
    }
    type_label = type_labels.get(order_type, f"📋 {order_type}")

    elapsed_min = int((_now_wib().timestamp() * 1000 - ts_ms) / 60000)
    elapsed_text = f"🕐 {elapsed_min} menit lalu" if elapsed_min >= 1 else "🕐 Baru saja"

    item_lines = []
    item_no = 1
    for item in food_items:
        qty = int(float(item.get("quantity", 1)))
        name = (item.get("productName") or "?").strip()
        variant = item.get("variant")
        if variant:
            item_lines.append(f"  {item_no}. {qty}× {name}  ({variant})")
        else:
            item_lines.append(f"  {item_no}. {qty}× {name}")
        item_no += 1

    lines = []
    if struk_line:
        lines.append(f"📍 {struk_line}")
    lines.extend([
        f"🍳 PESANAN BARU — 🕐 {_format_time_hm(ts_ms)}",
    ])
    if source_label:
        lines.append(f"📲 SUMBER: {source_label}")
    if payment_note:
        lines.append(f"⚠️ {payment_note}")
    lines.extend([
        "────────────",
        f"🆔 {order_no}",
    ])
    base_text = "\n".join(lines)
    extra_lines = [
        "",
        f"{type_label}",
    ]
    if discount_amount > 0:
        if free_refill:
            extra_lines.append("🏷️ Free Refill")
        elif voucher_id:
            extra_lines.append(f"🏷️ Promo {voucher_id}")
        else:
            extra_lines.append("🏷️ Happy Hour")
    customer_line = f"👤 {customer}"
    if guest_count and guest_count > 0:
        customer_line += f" — {int(guest_count)} orang"
    extra_lines.append(customer_line)
    kitchen_team_text = _format_team_by_role(team, "Kitchen") if team else ""
    # Chef staff juga masuk tim dapur (roleName = 'CHEF' di DB)
    if not kitchen_team_text:
        kitchen_team_text = _format_team_by_role(team, "CHEF") if team else ""
    if kitchen_team_text:
        extra_lines.append(f"👥 {kitchen_team_text}")
    if notes:
        extra_lines.append("")
        extra_lines.append(f"📝 {notes}")
    extra_lines.extend([
        "",
        "Makanan:",
        *item_lines,
        "────────────",
        f"⏳ Mohon segera dibuat! — {elapsed_text}",
        f"📦 {len(food_items)} makanan",
        "",
        "Tekan tombol untuk memproses pesanan",
    ])
    base_text += "\n".join(extra_lines)

    kb = InlineKeyboardMarkup([
        [
            InlineKeyboardButton("✅ Dibuat", callback_data=f"dibuat|{order_no}|kitchen"),
            InlineKeyboardButton("🏁 Selesai", callback_data=f"selesai|{order_no}|kitchen"),
        ]
    ])

    try:
        msg = await _send_with_retry(app.bot, KITCHEN_GROUP_ID, base_text, kb)
        key = f"{order_no}|kitchen"
        _active_orders[key] = {
            "key": key,
            "message": msg,
            "base_text": base_text,
            "chat_id": KITCHEN_GROUP_ID,
            "message_id": msg.message_id,
            "status": "new",
            "dibuat_by": None,
            "selesai_by": None,
            "order_type": order_type,
            "customer_name": customer,
            "items": food_items,
            "struk_line": struk_line,
        }
        _active_orders[key]["auto_dibuat_task"] = asyncio.create_task(_auto_dibuat(key, 300))
        await _insert_order_status(key, _active_orders[key])
        logger.info("Kitchen notification sent for %s (%d food items)", order_no, len(food_items))
    except Exception as e:
        logger.error("send_kitchen_notification failed for %s: %s", order_no, e)

# ── Telegram user → staff name mapping ──────────────────────────

_tg_name_cache: dict[int, str] = {}
_tg_cache_loaded = False

async def _load_tg_name_cache():
    """Load all employee_telegram_links into cache."""
    global _tg_name_cache, _tg_cache_loaded
    try:
        rows = await _fetch("employee_telegram_links", "select=telegram_user_id,employee_name&is_active=eq.true&limit=200")
        _tg_name_cache = {row["telegram_user_id"]: row["employee_name"] for row in rows if row.get("employee_name")}
        _tg_cache_loaded = True
        logger.info("Loaded %d Telegram→staff name mappings", len(_tg_name_cache))
    except Exception as e:
        logger.error("Failed to load Telegram name cache: %s", e)

async def _resolve_staff_name(tg_user_id: int) -> str:
    """Get staff name from Telegram user ID using cached employee_telegram_links."""
    if not _tg_cache_loaded:
        await _load_tg_name_cache()
    cached = _tg_name_cache.get(tg_user_id)
    if cached:
        return cached
    # Fallback: try direct query on miss
    try:
        rows = await _fetch("employee_telegram_links", f"telegram_user_id=eq.{tg_user_id}&select=employee_name&limit=1")
        if rows and rows[0].get("employee_name"):
            name = rows[0]["employee_name"]
            _tg_name_cache[tg_user_id] = name
            return name
    except Exception:
        pass
    return "Staff"

# ── Callback handler ─────────────────────────────────────────────

async def _handle_callback(update: Update, context):
    query = update.callback_query
    await query.answer()

    data = query.data  # "dibuat|ORD-123|barista" or "selesai|ORD-123|kitchen"
    try:
        action, order_no, group_type = data.split("|")
        key = f"{order_no}|{group_type}"
        tg_user_id = query.from_user.id

        # Resolve staff name from employee_telegram_links cache
        user = await _resolve_staff_name(tg_user_id)

        # Lazy-load from Supabase if not in memory
        order = _active_orders.get(key)
        if not order:
            rows = await _fetch("pos_order_status", f"order_no=eq.{order_no}&group_type=eq.{group_type}&limit=1")
            if rows:
                row = rows[0]
                created_at = datetime.fromisoformat(row["created_at"].replace("Z", "+00:00")) if row.get("created_at") else None
                dibuat_at = datetime.fromisoformat(row["dibuat_at"].replace("Z", "+00:00")) if row.get("dibuat_at") else None
                order = {
                    "key": key,
                    "message": None,
                    "base_text": row.get("base_text", ""),
                    "chat_id": row.get("chat_id"),
                    "message_id": row.get("message_id"),
                    "status": row["status"],
                    "dibuat_by": row.get("dibuat_by"),
                    "selesai_by": row.get("selesai_by"),
                    "dibuat_at": dibuat_at,
                    "selesai_at": datetime.fromisoformat(row["selesai_at"].replace("Z", "+00:00")) if row.get("selesai_at") else None,
                }
                _active_orders[key] = order
                logger.info("[%s] Lazy-loaded from Supabase (status=%s)", key, order["status"])
            else:
                logger.warning("[%s] No record found in Supabase for callback", key)
                return

        if action == "dibuat":
            await _do_dibuat(key, by=user, tg_user_id=tg_user_id)
        elif action == "selesai":
            await _do_selesai(key, by=user, tg_user_id=tg_user_id)
    except Exception as e:
        logger.error("Callback error for data=%s: %s", data, e)

# ── Order polling ────────────────────────────────────────────────

_AGENT_DIR = os.path.dirname(os.path.abspath(__file__))
_STATE_DIR = os.path.join(os.path.dirname(_AGENT_DIR), ".runtime", "yumi-supervisor-agent")
os.makedirs(_STATE_DIR, exist_ok=True)
_LEGACY_CURSOR_FILE = os.path.join(_AGENT_DIR, ".yumi_supervisor_cursor.txt")
_CURSOR_FILE = os.path.join(_STATE_DIR, "yumi_supervisor_cursor.txt")

def _load_supervisor_cursor() -> tuple[int, set[str], int, set[str]]:
    """Load cursor, reported orders, CSR cursor, and paid-update orders."""
    try:
        with open(_CURSOR_FILE) as f:
            lines = [l.strip() for l in f if l.strip()]
        if lines:
            ts = int(lines[0])
            nos: set[str] = set()
            csr_ts: int = 0
            paid_update_nos: set[str] = set()
            mode = "orders"  # 'orders', 'csr', or 'paid_updates'
            for l in lines[1:]:
                if l == "---":
                    mode = "csr"
                    continue
                if l == "---paid-updates---":
                    mode = "paid_updates"
                    continue
                if mode == "orders":
                    nos.add(l)
                elif mode == "csr":
                    csr_ts = int(l)
                    mode = "paid_updates"
                else:
                    paid_update_nos.add(l)
            return ts, nos, csr_ts, paid_update_nos
    except (FileNotFoundError, ValueError, IndexError):
        # Backward-compatible one-time read from the old tracked state file.
        # New writes always go to .runtime, which survives git auto-pulls.
        try:
            with open(_LEGACY_CURSOR_FILE) as f:
                lines = [l.strip() for l in f if l.strip()]
            if lines:
                ts = int(lines[0])
                nos: set[str] = set()
                csr_ts: int = 0
                paid_update_nos: set[str] = set()
                mode = "orders"
                for l in lines[1:]:
                    if l == "---":
                        mode = "csr"
                        continue
                    if l == "---paid-updates---":
                        mode = "paid_updates"
                        continue
                    if mode == "orders":
                        nos.add(l)
                    elif mode == "csr":
                        csr_ts = int(l)
                        mode = "paid_updates"
                    else:
                        paid_update_nos.add(l)
                return ts, nos, csr_ts, paid_update_nos
        except (FileNotFoundError, ValueError, IndexError):
            pass
    # Default: look back 24 hours on first run
    ts = int((_now_wib() - timedelta(hours=24)).timestamp() * 1000)
    return ts, set(), 0, set()

def _save_supervisor_cursor(ts: int, nos: set[str], csr_ts: int = 0, paid_update_nos: set[str] | None = None):
    """Persist cursor, reported order numbers, and paid-update dedupe."""
    with open(_CURSOR_FILE, "w") as f:
        f.write(f"{ts}\n")
        for no in sorted(nos):
            f.write(f"{no}\n")
        f.write("---\n")
        f.write(f"{csr_ts}\n")
        f.write("---paid-updates---\n")
        for no in sorted(paid_update_nos or set()):
            f.write(f"{no}\n")

_last_order_check_ms, _reported_order_nos, _last_csr_check_ms, _cashier_paid_update_nos = _load_supervisor_cursor()

# ── Shift recap cursor ──
_LEGACY_SHIFT_RECAP_CURSOR_FILE = os.path.join(_AGENT_DIR, ".shift_recap_cursor.txt")
_SHIFT_RECAP_CURSOR_FILE = os.path.join(_STATE_DIR, "shift_recap_cursor.txt")

def _load_shift_recap_cursor() -> int:
    try:
        with open(_SHIFT_RECAP_CURSOR_FILE) as f:
            return int(f.read().strip())
    except:
        try:
            with open(_LEGACY_SHIFT_RECAP_CURSOR_FILE) as f:
                legacy_ts = int(f.read().strip())
            now_ms = int(datetime.now().timestamp() * 1000)
            # Never replay an unbounded historical backlog after deployment.
            # A cursor older than two hours is treated as stale and starts fresh.
            if now_ms - legacy_ts > 2 * 60 * 60 * 1000:
                return now_ms
            return legacy_ts
        except (FileNotFoundError, ValueError):
            return int(datetime.now().timestamp() * 1000)

def _save_shift_recap_cursor(ts: int):
    with open(_SHIFT_RECAP_CURSOR_FILE, "w") as f:
        f.write(str(ts))

def _ms_to_iso(ms: int) -> str:
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).isoformat().replace("+00:00", "Z")

def _fmt_epoch_wib(ms: int) -> str:
    dt = datetime.fromtimestamp(ms / 1000, tz=WIB)
    return dt.strftime("%d/%m %H:%M")

def _fmt_iso_wib(iso_str: str) -> str:
    if not iso_str:
        return "—"
    try:
        dt = datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
        return dt.astimezone(WIB).strftime("%H:%M")
    except:
        return iso_str[:16]

# ⏪ Lookback window — scan N menit ke belakang dari NOW (bukan dari cursor)
# agar order yang baru berubah jadi paid/completed setelah cursor lewat tetap terdeteksi.
# Nilai 10 menit = kompromi: cukup untuk delay bayar biasa, tanpa re-scan terlalu luas.
_LOOKBACK_MS = 600_000  # 10 menit

# ── Helper: find shift at timestamp (for transaction notification) ──

async def _find_shift_at_time(timestamp_ms: int) -> dict:
    """Find active shift at a given timestamp. Returns {cashier_name, team_members} or empty."""
    try:
        shifts = await _fetch(
            "pos_shift_reports",
            "select=cashier_name,team_members,shift_name,start_time,end_time"
            f"&start_time=lte.{timestamp_ms}"
            "&order=start_time.desc&limit=3",
        )
        for s in shifts:
            s_start = int(s.get("start_time") or 0)
            s_end = s.get("end_time")
            if s_end is not None and timestamp_ms > int(s_end):
                continue
            return {
                "cashier_name": s.get("cashier_name") or "",
                "team_members": s.get("team_members") or "",
            }
    except Exception as e:
        logger.warning("find_shift_at_time failed: %s", e)
    return {}

# ── Cashier payment update notification ──

async def _send_cashier_payment_update(app, row: dict):
    """Notify transaction group when a cashier-paid customer order settles."""
    order_no = str(row.get("orderNumber") or "-")
    daily_no = row.get("daily_receipt_no")
    order_type = str(row.get("orderType") or "dine_in")
    kind_label = {"dine_in": "DINE IN", "takeaway": "TAKEAWAY", "online": "ONLINE"}.get(order_type, order_type.upper())
    struk_line = f"STRUK NO. {daily_no} - {kind_label}" if daily_no else None
    source_label = "DjiwaApp Member" if row.get("customerSourceId") else "DjiwaApp Guest"
    shift = await _find_shift_at_time(int(float(row.get("_creationTime") or row.get("createdAt") or 0)))
    cashier = shift.get("cashier_name", "?")
    lines = []
    if struk_line:
        lines.append(f"📍 {struk_line}")
    lines.extend([
        f"🔔 PEMBARUAN PEMBAYARAN — {_format_time_hm(int(float(row.get('_creationTime') or row.get('createdAt') or 0)))}",
        f"📲 SUMBER: {source_label}",
        "✅ SUDAH LUNAS — PEMBAYARAN DITERIMA DI KASIR",
        "────────────",
        f"🆔 {order_no}",
        f"💰 Rp{float(row.get('totalAmount') or 0):,.0f} — Tunai",
        f"👤 {row.get('customerName') or 'Pelanggan'}",
        f"👥 Kasir: {cashier}",
    ])
    try:
        await _send_with_retry(app.bot, TRANSACTION_GROUP_ID, "\n".join(lines))
        logger.info("Cashier payment update sent for %s", order_no)
    except Exception as e:
        logger.error("send_cashier_payment_update failed for %s: %s", order_no, e)


# ── Transaction notification to group ──

async def _send_transaction_notification(app, order_no: str, customer: str, totalAmount: float,
                                          payment_method: str, ts_ms: int, struk_line: str | None,
                                          items: list[dict], guest_count=None, notes="",
                                          discount_amount=0.0, voucher_id=None, free_refill=None,
                                          delivery_context: dict | None = None,
                                          source_label: str | None = None,
                                      payment_note: str | None = None):
    shift = await _find_shift_at_time(ts_ms)
    cashier = shift.get("cashier_name", "?")
    team = shift.get("team_members", "")

    # ── Build discount/promo info ──
    promo_parts = []
    if discount_amount > 0:
        if free_refill:
            promo_parts.append(f"Diskon Rp{discount_amount:,.0f} (Free Refill)")
        elif voucher_id:
            promo_parts.append(f"Diskon Rp{discount_amount:,.0f} (Voucher {voucher_id})")
        else:
            promo_parts.append(f"Diskon Rp{discount_amount:,.0f} (Happy Hour)")

    # Order Mie Yamin memakai format operasional khusus.
    if delivery_context and delivery_context.get("businessUnit") == "ordermieyamin":
        provider_labels = {"gojek": "Gojek", "maxim": "Maxim"}
        provider = str(delivery_context.get("deliveryProvider") or "").lower()
        delivery_date = str(delivery_context.get("deliveryDate") or "")
        try:
            delivery_date = datetime.fromisoformat(delivery_date.replace("Z", "+00:00")).astimezone(WIB).strftime("%d/%m/%Y")
        except Exception:
            delivery_date = delivery_date[:10] or "—"

        special_lines = [
            "🍜 ORDER MIE YAMIN",
            "",
            "📋 Detail Pesanan",
            f"🆔 {order_no}",
            f"👤 {customer}",
            f"💰 Total: Rp{totalAmount:,.0f}",
            "",
            "📦 Isi Pesanan",
        ]
        for index, item in enumerate(items, start=1):
            name = str(item.get("productName") or "Item").strip()
            quantity = int(float(item.get("quantity") or 1))
            price = float(item.get("price") or 0)
            variant = str(item.get("variant") or "").strip()
            quantity_label = variant or f"{quantity} pcs"
            special_lines.extend([
                f"{index}. {name}",
                f"   {quantity_label} × Rp{price:,.0f}",
            ])

        special_lines.extend([
            "",
            "🚚 Detail Pengiriman",
            f"📅 Tanggal kirim: {delivery_date}",
            f"🛵 Kurir: {provider_labels.get(provider, provider.upper() or '—')}",
            f"📍 Area: {delivery_context.get('deliveryArea') or 'Tasikmalaya'}",
        ])
        contact_phone = str(delivery_context.get("deliveryContactPhone") or "").strip()
        address = str(delivery_context.get("deliveryAddress") or "").strip()
        if contact_phone:
            special_lines.append(f"📞 WhatsApp: {contact_phone}")
        if address:
            special_lines.append(f"🏠 Alamat: {address}")
        if notes:
            special_lines.extend(["", f"📝 Catatan: {notes}"])
        special_lines.extend(["", "✅ Status: Sudah dibayar"])

        try:
            await _send_with_retry(app.bot, TRANSACTION_GROUP_ID, "\n".join(special_lines))
            logger.info("Transaction notification sent for %s to group %s", order_no, TRANSACTION_GROUP_ID)
        except Exception as e:
            logger.error("send_transaction_notification failed for %s: %s", order_no, e)
        return

    # ── Parse team members into per-role lines ──
    team_lines = []
    if team:
        names = [n.strip() for n in team.split(",") if n.strip()]
        if names:
            grouped: dict[str, list[str]] = {}
            for name in names:
                key = name.strip().lower()
                role = _STAFF_ROLE_MAP.get(key, "Tim")
                role_upper = role.upper()
                if role_upper not in grouped:
                    grouped[role_upper] = []
                grouped[role_upper].append(name.strip())
            role_emoji = {"BARISTA": "☕", "CHEF": "🍳", "KASIR": "🧑‍💼", "ADMIN": "🛡️", "MANAGER": "⭐"}
            for r in ("BARISTA", "CHEF", "KASIR", "MANAGER", "ADMIN", "Tim"):
                if r in grouped:
                    emoji = role_emoji.get(r, "👥")
                    team_lines.append(f"{emoji} {r.title()}: {', '.join(grouped[r])}")

    lines = []
    if struk_line:
        lines.append(f"📍 {struk_line}")
    lines.extend([
        f"🧾 Pesanan Baru — {_format_time_hm(ts_ms)}",
    ])
    if source_label:
        lines.append(f"📲 SUMBER: {source_label}")
    if payment_note:
        lines.append(f"⚠️ {payment_note}")
    lines.extend([
        "────────────",
        f"🆔 {order_no}",
        f"💰 Rp{totalAmount:,.0f} — {_payment_label(payment_method)}",
    ])
    for p in promo_parts:
        lines.append(f"🏷️ {p}")

    customer_line = f"👤 {customer}"
    if guest_count and guest_count > 0:
        customer_line += f" — {int(guest_count)} orang"
    lines.append(customer_line)
    lines.append(f"👥 Kasir: {cashier}")
    lines.extend(team_lines)

    if delivery_context and delivery_context.get("businessUnit") == "ordermieyamin":
        provider_labels = {"gojek": "Gojek", "maxim": "Maxim"}
        provider = str(delivery_context.get("deliveryProvider") or "").lower()
        delivery_date = str(delivery_context.get("deliveryDate") or "")
        try:
            delivery_date = datetime.fromisoformat(delivery_date.replace("Z", "+00:00")).astimezone(WIB).strftime("%d/%m/%Y")
        except Exception:
            delivery_date = delivery_date[:10] or "—"
        lines.extend([
            "",
            "🚚 PENGIRIMAN MIE YAMIN",
            f"📅 Tanggal kirim: {delivery_date}",
            f"🛵 Kurir: {provider_labels.get(provider, provider.upper() or '—')}",
            f"📍 Area: {delivery_context.get('deliveryArea') or 'Tasikmalaya'}",
        ])
        contact_phone = str(delivery_context.get("deliveryContactPhone") or "").strip()
        address = str(delivery_context.get("deliveryAddress") or "").strip()
        if contact_phone:
            lines.append(f"📞 WhatsApp: {contact_phone}")
        if address:
            lines.append(f"🏠 Alamat: {address}")

    if notes:
        lines.append("")
        lines.append(f"📝 {notes}")

    lines.append("")
    lines.append("Items:")

    # ── Categorize items (reuse existing lookup) ──
    food_items = await _get_food_items(items)
    drink_items = await _get_beverage_items(items)
    food_ids = {i.get("productId", "") for i in food_items}
    drink_ids = {i.get("productId", "") for i in drink_items}
    other_items = [i for i in items if i.get("productId", "") not in food_ids and i.get("productId", "") not in drink_ids]

    item_no = 1
    def _add_item_group(label, group):
        nonlocal item_no
        if group:
            lines.append(f"{label}:")
            for i in group:
                pn = i.get("productName", "?").strip()
                q = int(float(i.get("quantity", 1)))
                price = float(i.get("price") or 0)
                orig = i.get("originalPrice")
                if orig is not None and float(orig) != price:
                    lines.append(f"  {item_no}. {pn} x{q} Rp{float(orig):,.0f} → Rp{price:,.0f}")
                else:
                    lines.append(f"  {item_no}. {pn} x{q} @ Rp{price:,.0f}")
                item_no += 1

    _add_item_group("🍳 Makanan", food_items)
    _add_item_group("☕ Minuman", drink_items)
    if other_items:
        _add_item_group("🥤 Lainnya", other_items)

    # ── Footer ──
    total_items = sum(int(float(i.get("quantity", 1))) for i in items)
    lines.append(f"📦 {total_items} item | 💰 Rp{totalAmount:,.0f}")

    text = "\n".join(lines)

    try:
        await _send_with_retry(app.bot, TRANSACTION_GROUP_ID, text)
        logger.info("Transaction notification sent for %s to group %s", order_no, TRANSACTION_GROUP_ID)
    except Exception as e:
        logger.error("send_transaction_notification failed for %s: %s", order_no, e)

# ── Member / poin engine ────────────────────────────────────────────

async def _earn_customer_points(order_id: str, customer_source_id: str, total_amount: float) -> None:
    """Auto-calculate and award points for a member's order.

    Points = 5% of total_amount (rounded down).
    Updates total_points on the customer record and inserts a ledger entry.
    """
    try:
        poin = int(total_amount * 0.05)
        if poin <= 0:
            logger.info("_earn_customer_points: %s -> 0 poin (total=%.0f), skipping", customer_source_id, total_amount)
            return

        # 1) Fetch current customer data (to get current total_points and name)
        cust = await _fetch(
            "pos_customers",
            f"select=name,total_points&_id=eq.{customer_source_id}&limit=1",
        )
        if not cust:
            logger.warning("_earn_customer_points: customer %s not found", customer_source_id)
            return
        curr_points = int(cust[0].get("total_points") or 0)
        new_total = curr_points + poin

        # 2) UPDATE total_points
        updated = await _patch(
            "pos_customers",
            f"_id=eq.{customer_source_id}",
            {"total_points": new_total},
        )
        if not updated:
            logger.warning("_earn_customer_points: update failed for %s", customer_source_id)
            return

        # 3) INSERT into point ledger
        ledger_entry = {
            "customer_id": customer_source_id,
            "order_id": order_id,
            "points_earned": poin,
            "points_balance": new_total,
            "source": "order_completed",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await _post("pos_customer_point_ledger", ledger_entry)
        logger.info(
            "Points earned: customer=%s order=%s poin=%d balance=%d",
            customer_source_id, order_id, poin, new_total,
        )
    except Exception as e:
        logger.error("_earn_customer_points failed for %s: %s", customer_source_id, e)


async def _check_new_orders(app):
    global _last_order_check_ms, _reported_order_nos, _cashier_paid_update_nos
    now_ms = int(_now_wib().timestamp() * 1000)
    # min(cursor, now-10min) → backfill: pakai cursor (24h), normal: lookback 10m dari now
    scan_from = min(_last_order_check_ms, max(0, now_ms - _LOOKBACK_MS))

    try:
        rows = await _fetch(
            "pos_orders",
            "select=_id,orderNumber,totalAmount,paymentMethod,createdAt,items,customerName,customerSourceId,orderType,_creationTime,daily_receipt_no,receipt_kind,guestCount,notes,voucherId,discountAmount,freeRefillSelected,source,businessUnit,deliveryDate,deliveryProvider,deliveryContactPhone,deliveryAddress"
            "&status=in.(completed,paid)"
            f"&_creationTime=gt.{scan_from}"
            f"&_creationTime=lte.{now_ms}"
            "&order=_creationTime.asc&limit=50",
        )
    except Exception as e:
        logger.error("check_new_orders fetch failed: %s", e)
        return

    # Customer self-service orders are created as `pending` and may become
    # `paid` later (cashier confirmation or Mayar polling). Their creation
    # timestamp is older than the main cursor by then, so include a bounded
    # 7-day settled-order lookback to detect that status transition without
    # replaying the entire historical POS order set.
    try:
        customer_rows = await _fetch(
            "pos_orders",
            "select=_id,orderNumber,totalAmount,paymentMethod,createdAt,items,customerName,customerSourceId,orderType,_creationTime,daily_receipt_no,receipt_kind,paymentReceiptKind,guestCount,notes,voucherId,discountAmount,freeRefillSelected,source,businessUnit,deliveryDate,deliveryProvider,deliveryContactPhone,deliveryAddress"
            "&source=in.(customer_self_service,ordermieyamin_b2b)"
            "&status=in.(completed,paid)"
            f"&_creationTime=gte.{max(0, now_ms - 7 * 86_400_000)}"
            f"&_creationTime=lte.{now_ms}"
            "&order=_creationTime.desc&limit=100",
        )
        # Bayar ke kasir adalah order operasional yang harus langsung terlihat
        # oleh kitchen/barista/report, tetapi tetap pending sampai kasir
        # menyelesaikan pembayaran. Ini bukan bukti order sudah lunas.
        cashier_rows = await _fetch(
            "pos_orders",
            "select=_id,orderNumber,totalAmount,paymentMethod,createdAt,items,customerName,customerSourceId,orderType,_creationTime,daily_receipt_no,receipt_kind,paymentReceiptKind,guestCount,notes,voucherId,discountAmount,freeRefillSelected,source,businessUnit,deliveryDate,deliveryProvider,deliveryContactPhone,deliveryAddress"
            "&source=eq.customer_self_service"
            "&status=eq.pending"
            "&paymentMethod=eq.cash"
            "&paymentReceiptKind=eq.cashier_pending"
            f"&_creationTime=gte.{max(0, now_ms - 7 * 86_400_000)}"
            f"&_creationTime=lte.{now_ms}"
            "&order=_creationTime.desc&limit=100",
        )
        by_id = {str(row.get("_id")): row for row in rows if row.get("_id")}
        for row in [*customer_rows, *cashier_rows]:
            row_id = str(row.get("_id") or "")
            if row_id and row_id not in by_id:
                by_id[row_id] = row
        rows = sorted(
            by_id.values(),
            key=lambda row: int(float(row.get("_creationTime") or 0)),
        )
    except Exception as e:
        logger.warning("customer settled/cashier-order lookback failed: %s", e)

    if not rows:
        # Advance cursor to now so we don't re-scan stale window
        _last_order_check_ms = now_ms
        _save_supervisor_cursor(_last_order_check_ms, _reported_order_nos, _last_csr_check_ms, _cashier_paid_update_nos)
        return

    max_creation_time = _last_order_check_ms
    for row in rows:
        order_no = row.get("orderNumber", "???")
        ts = int(float(row.get("_creationTime") or 0))
        if ts > max_creation_time:
            max_creation_time = ts
        # Order cashier customer yang sudah dibayar mendapat satu notifikasi
        # pembaruan, bukan notifikasi order baru kedua.
        is_cashier_paid = (
            row.get("source") == "customer_self_service"
            and row.get("paymentReceiptKind") == "cashier_pending"
            and row.get("status") in ("paid", "completed")
        )
        if order_no in _reported_order_nos:
            if is_cashier_paid and order_no not in _cashier_paid_update_nos:
                await _send_cashier_payment_update(app, row)
                _cashier_paid_update_nos.add(order_no)
            continue
        customer = row.get("customerName") or "Pelanggan"
        order_type = row.get("orderType") or "dine_in"
        items = row.get("items") or []
        total = row.get("totalAmount") or 0
        order_id = row.get("_id") or ""

        # ── Member detection ⭐ ──
        customer_source_id = row.get("customerSourceId") or ""
        member_name = None
        if customer_source_id:
            try:
                m = await _fetch(
                    "pos_customers_view",
                    f"select=name&source_id=eq.{customer_source_id}&limit=1",
                )
                if m:
                    member_name = m[0].get("name", customer)
                    if member_name:
                        customer = member_name
                    logger.info("Order %s from member: %s (id=%s)", order_no, member_name, customer_source_id)
            except Exception as e:
                logger.warning("Failed to fetch member for order %s: %s", order_no, e)

        # ── DEBUG: log raw items ──
        item_pids = [i.get("productId", "NO_PID") for i in items] if items else []
        item_names = [i.get("productName", "NO_NAME").strip() for i in items] if items else []
        logger.info("DEBUG items for %s: count=%s pids=%s names=%s",
                     order_no, len(items) if items else 0, item_pids, item_names)
        if items:
            for idx, it in enumerate(items):
                pid = it.get("productId", "")
                logger.info("DEBUG item[%d]: pid=%s in_FOOD=%s in_BEV=%s",
                            idx, pid,
                            pid in _FOOD_PRODUCT_IDS if pid else False,
                            pid in _BEVERAGE_PRODUCT_IDS if pid else False)

        # B2B Mie Yamin items do not carry POS productId; productName is the source of truth.
        is_mie_yamin_order = row.get("businessUnit") == "ordermieyamin"
        if not items or (not any(i.get("productId") for i in items) and not is_mie_yamin_order):
            logger.warning("Order %s skipped — items empty/incomplete (will retry in next poll)", order_no)
            continue

        daily_no = row.get("daily_receipt_no")
        receipt_kind = row.get("receipt_kind")
        receipt_kind_labels = {"dine_in": "DINE IN", "takeaway": "TAKEAWAY", "online": "ONLINE"}
        # Prioritaskan order_type (POS kadang simpan receipt_kind=dine_in untuk online order)
        display_kind = order_type if order_type in receipt_kind_labels else receipt_kind
        kind_label = receipt_kind_labels.get(display_kind) if display_kind else None
        if daily_no and kind_label:
            if display_kind == "online" and order_type not in ("online", "dine_in", "takeaway"):
                sub = order_type.replace("_", " ").title()
                struk_line = f"STRUK NO. {daily_no} - {kind_label} ({sub})"
            else:
                struk_line = f"STRUK NO. {daily_no} - {kind_label}"
        else:
            struk_line = None

        # Source member/guest sekarang ditampilkan di baris `📲 SUMBER`,
        # bukan lagi sebagai suffix lama pada baris nomor struk.

        # Cek ulang nama customer dari items jika kosong
        if customer in ("", "Pelanggan") and items:
            for i in items:
                if i.get("customerName"):
                    customer = i["customerName"]
                    break

        # Extract additional data for notifications
        guest_count = row.get("guestCount")
        notes = (row.get("notes") or "").strip()
        voucher_id = row.get("voucherId")
        discount_amount = float(row.get("discountAmount") or 0)
        free_refill = row.get("freeRefillSelected")
        delivery_context = {
            "businessUnit": row.get("businessUnit") or "",
            "deliveryDate": row.get("deliveryDate") or "",
            "deliveryProvider": row.get("deliveryProvider") or "",
            "deliveryContactPhone": row.get("deliveryContactPhone") or "",
            "deliveryAddress": row.get("deliveryAddress") or "",
            "deliveryArea": "Tasikmalaya" if row.get("businessUnit") == "ordermieyamin" else "",
        }

        source_label = None
        if row.get("businessUnit") == "ordermieyamin":
            source_label = "Order Mie Yamin"
        elif row.get("source") == "booking":
            source_label = "Booking"
        elif row.get("source") == "customer_self_service":
            source_label = "DjiwaApp Member" if customer_source_id else "DjiwaApp Guest"

        payment_note = "BELUM LUNAS — BAYAR KE KASIR" if row.get("paymentReceiptKind") == "cashier_pending" else None

        # ── Kitchen notification (priority) ──
        food_items = await _get_food_items(items)
        bev_items = await _get_beverage_items(items)
        logger.info("DEBUG classification for %s: food=%d bev=%d (of %d total items)",
                     order_no, len(food_items), len(bev_items), len(items) if items else 0)

        # Kirim kitchen + barista paralel per order
        tasks = []
        if food_items:
            tasks.append(_send_kitchen_notification(app, order_no, customer, order_type, food_items, ts, struk_line, guest_count, notes, discount_amount, voucher_id, free_refill, source_label, payment_note))
        if bev_items:
            tasks.append(_send_barista_notification(app, order_no, customer, order_type, bev_items, ts, struk_line, guest_count, notes, discount_amount, voucher_id, free_refill, source_label, payment_note))

        if tasks:
            await asyncio.gather(*tasks)
            await asyncio.sleep(0.3)  # small gap between orders

        # ── Transaction notification ──
        payment = row.get("paymentMethod") or "-"
        await _send_transaction_notification(app, order_no, customer, total, payment, ts, struk_line, items, guest_count, notes, discount_amount, voucher_id, free_refill, delivery_context, source_label, payment_note)

        # ⭐ Award points for member orders
        if customer_source_id:
            await _earn_customer_points(order_id, customer_source_id, float(total))

        _reported_order_nos.add(order_no)

    _last_order_check_ms = max_creation_time
    _save_supervisor_cursor(_last_order_check_ms, _reported_order_nos, _last_csr_check_ms, _cashier_paid_update_nos)

# ── Customer service request polling ──

async def _check_new_csr(app):
    """Poll for new customer service requests from customer page."""
    global _last_csr_check_ms
    now_ms = int(_now_wib().timestamp() * 1000)
    # Look back up to 1 hour
    scan_from = min(_last_csr_check_ms, max(0, now_ms - 3_600_000)) if _last_csr_check_ms > 0 else (now_ms - 3_600_000)
    try:
        # Use direct httpx call with Accept-Profile header for legacy_mirror schema
        url = f"{SUPABASE_URL}/rest/v1/documents"
        q = ("select=document,creation_time"
             "&table_name=eq.customerServiceRequests"
             f"&creation_time=gt.{scan_from}"
             f"&creation_time=lte.{now_ms}"
             "&order=creation_time.asc"
             "&limit=20")
        async with httpx.AsyncClient() as client:
            r = await client.get(
                f"{url}?{q}",
                headers={
                    "apikey": SUPABASE_KEY,
                    "Authorization": f"Bearer {SUPABASE_KEY}",
                    "Accept-Profile": "legacy_mirror",
                },
                timeout=15,
            )
            r.raise_for_status()
            rows = r.json()
            if not isinstance(rows, list):
                rows = []
    except Exception as e:
        logger.warning("check_new_csr fetch failed: %s", e)
        return

    if not rows:
        _last_csr_check_ms = now_ms
        _save_supervisor_cursor(_last_order_check_ms, _reported_order_nos, _last_csr_check_ms, _cashier_paid_update_nos)
        return

    max_ts = _last_csr_check_ms
    for row in rows:
        ts = int(row.get("creation_time", 0) or 0)
        if ts > max_ts:
            max_ts = ts
        if ts <= _last_csr_check_ms:
            continue

        doc = row.get("document") or {}
        status = str(doc.get("status") or "")
        if status in ("completed", "cancelled", "notified"):
            continue

        tipe = str(doc.get("requestType") or "call_staff")
        table = str(doc.get("tableNumber") or "-")
        customer = str(doc.get("customerName") or "-")
        order_id = str(doc.get("orderId") or "")
        notes = str(doc.get("notes") or "").strip()
        waktu = _format_time_hm(doc.get("createdAt", 0))

        # Enrich: fetch order details
        guest = ""
        total = 0.0
        payment = "-"
        struk_no = "-"
        items = []
        csr_customer_source_id = ""
        if order_id:
            try:
                o = await _fetch(
                    "pos_orders",
                    f"select=daily_receipt_no,orderNumber,customerSourceId,guestCount,totalAmount,paymentMethod,items,notes,freeRefillSelected,discountAmount,voucherId&_id=eq.{order_id}&limit=1",
                )
                if o:
                    oo = o[0]
                    struk_no = str(oo.get("daily_receipt_no") or oo.get("orderNumber") or "-")
                    g = oo.get("guestCount")
                    if g:
                        guest = str(int(g))
                    total = float(oo.get("totalAmount") or 0)
                    payment = _payment_label(str(oo.get("paymentMethod") or "-"))
                    raw_items = oo.get("items") or []
                    if isinstance(raw_items, list):
                        items = raw_items
                    csr_customer_source_id = oo.get("customerSourceId") or ""
            except Exception:
                pass
        else:
            csr_customer_source_id = ""

        # ⭐ Cek apakah order dari member
        csr_is_member = bool(csr_customer_source_id) if order_id else False

        # Categorize items
        food_names = []
        bev_names = []
        dessert_names = []
        for i in items:
            pname = str(i.get("productName") or "").strip()
            qty = int(float(i.get("quantity") or 1))
            pid = str(i.get("productId") or "")
            name_label = f"{qty}x {pname}" if qty > 1 else pname
            if not pname:
                continue
            if await _is_beverage_item(i):
                bev_names.append(name_label)
            elif await _is_food_item(i):
                food_names.append(name_label)
            else:
                low = pname.lower()
                if any(k in low for k in ("dessert", "cake", "pudding", "ice cream", "gelato", "tiramisu", "sweet", "pastry")):
                    dessert_names.append(name_label)
                else:
                    food_names.append(name_label)

        # Build notification
        if tipe == "bring_dessert":
            icon = "🍰"
            label = "BRING DESSERT"
        else:
            icon = "🙋"
            label = "CALL STAFF"

        lines = [
            f"{icon} *{label}*" + (" -- ⭐ MEMBER" if csr_is_member else ""),
            f"  📍 STRUK NO. {struk_no}",
            "─" * 12,
            f"  🪫 Meja: {table}",
            f"  👤 Nama: {customer}",
            f"  🕐 Waktu: {waktu} WIB",
        ]
        if guest:
            lines.append(f"  👥 Jumlah: {guest} orang")
        if total > 0:
            lines.append(f"  💰 Total: Rp{total:,.0f}")
            lines.append(f"  💳 Bayar: {payment}")

        # Items by category
        if tipe == "bring_dessert":
            if dessert_names:
                lines.append(f"  🍰 Dessert: {', '.join(dessert_names)}")
            elif food_names or bev_names:
                all_items = food_names + bev_names
                lines.append(f"  🍰 Dessert: {', '.join(all_items)}")
        else:
            if food_names:
                lines.append(f"  🍳 Kitchen: {', '.join(food_names)}")
            if bev_names:
                lines.append(f"  🍵 Bar: {', '.join(bev_names)}")

        if notes:
            lines.append(f"  📝 Catatan: {notes}")
        lines.append("  🟡 Status: Menunggu")

        text = "\n".join(lines)

        # Send to transaction group
        try:
            await app.bot.send_message(
                chat_id=TRANSACTION_GROUP_ID,
                text=text,
                parse_mode="Markdown",
            )
            logger.info("CSR notified: %s at meja %s (struk #%s)", tipe, table, struk_no)
        except Exception as e:
            logger.warning("Failed to send CSR notification: %s", e)

    _last_csr_check_ms = max_ts
    _save_supervisor_cursor(_last_order_check_ms, _reported_order_nos, _last_csr_check_ms, _cashier_paid_update_nos)


# ── Auto shift recap ──

async def _check_closed_shifts(bot: Bot):
    cursor = _load_shift_recap_cursor()
    now_ms = int(datetime.now().timestamp() * 1000)
    try:
        url = f"{SUPABASE_URL}/rest/v1/shifts"
        q = (f"select=source_id,shift_name,cashier_name,team_members,start_time,end_time,cash_breakdown"
             f"&end_time=gt.{cursor}"
             f"&end_time=lte.{now_ms}"
             f"&order=end_time.asc")
        async with httpx.AsyncClient() as client:
            r = await client.get(f"{url}?{q}", headers={**_headers(), "Accept-Profile": "pos"}, timeout=15)
            r.raise_for_status()
            rows = r.json() if isinstance(r.json(), list) else []
    except Exception as e:
        logger.warning("shift_recap fetch error: %s", e)
        return
    if not rows:
        return
    logger.info("shift_recap: %d newly closed shift(s)", len(rows))
    last_ts = cursor
    for shift in rows:
        s_id = shift.get("source_id", "?")
        s_name = shift.get("shift_name", "Shift")
        s_start = shift.get("start_time", 0)
        s_end = int(shift.get("end_time") or 0)
        if not s_end or s_end <= last_ts:
            continue
        start_iso = _ms_to_iso(s_start)
        end_iso = _ms_to_iso(s_end)
        try:
            orders = await _fetch("pos_order_status",
                f"select=order_no,group_type,status,dibuat_by,selesai_by,dibuat_at,selesai_at,created_at"
                f"&created_at=gte.{start_iso}"
                f"&created_at=lt.{end_iso}"
                f"&order=created_at.asc")
        except Exception as e:
            logger.warning("shift_recap order fetch %s: %s", s_id, e)
            continue
        barista_orders = [o for o in orders if o.get("group_type") == "barista"]
        kitchen_orders = [o for o in orders if o.get("group_type") == "kitchen"]
        cashier = shift.get("cashier_name", "")
        start_t = _fmt_epoch_wib(s_start)
        end_t = _fmt_epoch_wib(s_end)
        base_header = f"📊 *Rekap*\n\n🕐 Shift: *{s_name}*\n👤 Kasir: {cashier}\n📅 {start_t} \u2014 {end_t}"
        for gt, chat_id in [("barista", BARISTA_GROUP_ID), ("kitchen", KITCHEN_GROUP_ID)]:
            group_orders = barista_orders if gt == "barista" else kitchen_orders
            if not group_orders:
                continue
            dibuat_by = {}
            selesai_by = {}
            for o in group_orders:
                b = o.get("dibuat_by")
                s = o.get("selesai_by")
                if b: dibuat_by[b] = dibuat_by.get(b, 0) + 1
                if s: selesai_by[s] = selesai_by.get(s, 0) + 1
            lines = [f"{base_header}\n📋 Total: {len(group_orders)}"]
            if dibuat_by:
                rank = sorted(dibuat_by.items(), key=lambda x: -x[1])
                medals = ["🥇", "🥈", "🥉"]
                bk = [f"   {medals[i] if i < 3 else f'{i+1}. '}{n}: {c}x" for i, (n, c) in enumerate(rank)]
                lines.append(f"\n✅ *Dibuat:* {sum(dibuat_by.values())}")
                lines.extend(bk)
            if selesai_by:
                rank = sorted(selesai_by.items(), key=lambda x: -x[1])
                medals = ["🥇", "🥈", "🥉"]
                sk = [f"   {medals[i] if i < 3 else f'{i+1}. '}{n}: {c}x" for i, (n, c) in enumerate(rank)]
                lines.append(f"\n🏁 *Selesai:* {sum(selesai_by.values())}")
                lines.extend(sk)
            recent = group_orders[-5:]
            lines.append(f"\n📝 *Terbaru:*")
            for o in reversed(recent):
                no = o.get("order_no", "?")
                st = o.get("status", "?")
                emoji = "✅" if st == "dibuat" else "🏁"
                by = o.get("dibuat_by") or o.get("selesai_by") or "—"
                tm = _fmt_iso_wib(o.get("selesai_at") or o.get("dibuat_at") or o.get("created_at"))
                lines.append(f"   {emoji} {no} \u2014 {by} {tm}")
            msg = "\n".join(lines)
            try:
                await bot.send_message(chat_id=chat_id, text=msg, parse_mode="Markdown")
                logger.info("shift_recap: sent to %s for shift %s", gt, s_id)
            except Exception as e:
                logger.warning("shift_recap send %s: %s", gt, e)

        # Kasir recap belongs to the transaction group, owned by this bot.
        # Keep it separate from the production-track recaps above so one
        # failed target does not prevent the other reports from being sent.
        all_orders = barista_orders + kitchen_orders
        unique_order_nos = {str(o.get("order_no") or "?") for o in all_orders}
        dibuat_total = sum(1 for o in all_orders if o.get("dibuat_by"))
        selesai_total = sum(1 for o in all_orders if o.get("selesai_by"))
        cash_breakdown = shift.get("cash_breakdown") or {}
        cash_lines = []
        for key, count in sorted(cash_breakdown.items(), key=lambda item: int(str(item[0]).replace("bill", "")), reverse=True):
            count = int(count or 0)
            if count <= 0:
                continue
            nominal = int(str(key).replace("bill", ""))
            cash_lines.append(f"   Rp{nominal:,.0f} × {count} = Rp{nominal * count:,.0f}")
        cash_total = sum(
            int(str(key).replace("bill", "")) * int(value or 0)
            for key, value in cash_breakdown.items()
        )
        # Payment summary is read from settled POS orders for the same shift
        # window. Keep this separate from order-status rows: one order can have
        # both Kitchen and Barista status records.
        payment_counts: Counter[str] = Counter()
        payment_totals: dict[str, float] = {}
        settled_order_count = 0
        try:
            payment_rows = await _fetch(
                "pos_orders",
                "select=orderNumber,totalAmount,paymentMethod,source,orderType"
                f"&_creationTime=gte.{s_start}&_creationTime=lte.{s_end}"
                "&status=in.(completed,paid)&order=_creationTime.asc&limit=500",
            )
            seen_payment_orders: set[str] = set()
            for order in payment_rows:
                order_no = str(order.get("orderNumber") or "")
                if not order_no or order_no in seen_payment_orders:
                    continue
                seen_payment_orders.add(order_no)
                method = _sales_channel_label(
                    str(order.get("paymentMethod") or ""),
                    str(order.get("source") or ""),
                    str(order.get("orderType") or ""),
                )
                amount = float(order.get("totalAmount") or 0)
                payment_counts[method] += 1
                payment_totals[method] = payment_totals.get(method, 0) + amount
            settled_order_count = len(seen_payment_orders)
        except Exception as e:
            logger.warning("shift_recap payment summary %s: %s", s_id, e)

        transaction_lines = [
            "📊 <b>Rekap Kasir</b>",
            "",
            f"🕐 Shift: <b>{escape(str(s_name))}</b>",
            f"👤 Kasir: {escape(str(cashier or '—'))}",
            f"📅 {start_t} — {end_t}",
            "",
            f"📋 Total order: <b>{len(unique_order_nos)}</b>",
            f"🍳 Kitchen: {len(kitchen_orders)} item status",
            f"☕ Barista: {len(barista_orders)} item status",
            f"✅ Dibuat: {dibuat_total}",
            f"🏁 Selesai: {selesai_total}",
        ]
        if payment_counts:
            transaction_lines.extend(["", "💳 <b>Ringkasan Pembayaran</b>"])
            for method, count in payment_counts.most_common():
                transaction_lines.append(f"   {method}: {count} transaksi — Rp{payment_totals[method]:,.0f}")
            transaction_lines.append(f"   Total transaksi terbayar: {settled_order_count}")
        else:
            transaction_lines.extend(["", "💳 <b>Ringkasan Pembayaran</b>", "Data pembayaran tidak tersedia."])
        if cash_lines:
            transaction_lines.extend([
                "",
                "💵 <b>Rincian Tunai</b>",
                *cash_lines,
                f"<b>Total Tunai: Rp{cash_total:,.0f}</b>",
            ])
        else:
            transaction_lines.extend(["", "💵 <b>Rincian Tunai</b>", "Tidak ada pecahan tunai."])
        try:
            await bot.send_message(
                chat_id=TRANSACTION_GROUP_ID,
                text="\n".join(transaction_lines),
                parse_mode="HTML",
            )
            logger.info("shift_recap: sent cashier recap to transaction for shift %s", s_id)
        except Exception as e:
            logger.warning("shift_recap send transaction for %s: %s", s_id, e)

        if s_end > last_ts:
            last_ts = s_end
    _save_shift_recap_cursor(last_ts)
    logger.info("shift_recap: cursor updated to %d", last_ts)


# ── Main (sync, uses post_init for async setup) ──────────────────

async def _post_init(app):
    """Called after Application initialization — sets up lookups and background tasks."""
    global _app
    _app = app
    logger.info("Starting Yumi Supervisor Agent...")
    me = await app.bot.get_me()
    logger.info("Bot: @%s", me.username)
    logger.info("Barista group: %s", BARISTA_GROUP_ID)
    logger.info("Kitchen group: %s", KITCHEN_GROUP_ID)
    logger.info("Transaction group: %s", TRANSACTION_GROUP_ID)

    await _build_beverage_lookup()
    await _build_food_lookup()
    await _build_staff_lookup()
    await _load_tg_name_cache()

    # Restore active orders from Supabase (persistent across restarts)
    await _load_active_orders(app.bot)

    # First poll check (catch up with any orders since start)
    await _reconcile_mayar_payments(force=True)
    await _check_new_orders(app)

    # Initial shift recap check
    await _check_closed_shifts(app.bot)

    # Background polling every 5s
    async def _poll_loop():
        refresh_counter = 0
        while True:
            await asyncio.sleep(5)
            await _reconcile_mayar_payments()
            await _check_new_orders(app)
            await _check_new_csr(app)
            await _check_closed_shifts(app.bot)
            # Refresh lookups every ~30 minutes (360 * 5s = 1800s)
            refresh_counter += 1
            if refresh_counter >= 360:
                refresh_counter = 0
                logger.info("Periodic lookup refresh starting...")
                await _build_beverage_lookup()
                await _build_food_lookup()
                await _build_staff_lookup()
                logger.info("Periodic lookup refresh done: %d beverage, %d food products",
                            len(_BEVERAGE_PRODUCT_IDS), len(_FOOD_PRODUCT_IDS))

    app.create_task(_poll_loop())
    logger.info("Polling loop started (5s interval)")


def _telegram_context_from_update(update: Update) -> TelegramContext:
    user = update.effective_user
    chat = update.effective_chat
    msg = update.effective_message
    return TelegramContext(
        chat_id=str(chat.id) if chat else "unknown",
        user_id=str(user.id) if user else "unknown",
        username=user.username if user else None,
        message_id=msg.message_id if msg else None,
    )


async def cmd_hermes_scope(update: Update, context: ContextTypes.DEFAULT_TYPE):
    scope = project_scope_summary()
    await update.message.reply_text(
        "Hermes Supervisor scope\n"
        f"Profile: supervisor\n"
        f"Project: {scope['project_root']}\n"
        f"Mode: {scope['mode']}\n"
        "Batas: read-only diagnostic; callback order tetap deterministic."
    )


async def cmd_hermes_test(update: Update, context: ContextTypes.DEFAULT_TYPE):
    request = build_request(
        profile_id="supervisor",
        message="supervisor adapter diagnostic",
        telegram=_telegram_context_from_update(update),
        can_write=False,
    )
    response = {"reply_text": "Hermes supervisor adapter OK", "actions": [], "metadata": {"profile_id": "supervisor"}}
    validate_response(response)
    audit_event({
        "event": "telegram_command",
        "profile_id": "supervisor",
        "mode": "read_only",
        "telegram": request["telegram"],
        "message": "telegram command /hermes_test",
        "actions": [],
    })
    await update.message.reply_text(response["reply_text"])


async def cmd_yumi(update: Update, context: ContextTypes.DEFAULT_TYPE):
    text = " ".join(context.args).strip()
    if not text:
        await update.message.reply_text("Pakai format: /yumi pertanyaan supervisor kamu")
        return
    request = build_request(
        profile_id="supervisor",
        message=text,
        telegram=_telegram_context_from_update(update),
        can_write=False,
    )
    response = {
        "reply_text": "Hermes supervisor read-only menerima request. Callback operasional tetap memakai flow deterministic existing.",
        "actions": [],
        "metadata": {"profile_id": "supervisor"},
    }
    validate_response(response)
    audit_event({
        "event": "telegram_command",
        "profile_id": "supervisor",
        "mode": "read_only",
        "telegram": request["telegram"],
        "message": "telegram command /yumi",
        "input_preview": text[:160],
        "actions": [],
    })
    await update.message.reply_text(response["reply_text"])


def main():
    req = HTTPXRequest(
        read_timeout=2.0,
        write_timeout=5.0,
        connect_timeout=3.0,
        pool_timeout=3.0,
    )
    app = Application.builder().token(BOT_TOKEN).request(req).post_init(_post_init).build()
    app.add_handler(CommandHandler("yumi", cmd_yumi))
    app.add_handler(CommandHandler("hermes_scope", cmd_hermes_scope))
    app.add_handler(CommandHandler("hermes_test", cmd_hermes_test))
    app.add_handler(CommandHandler("daftar", cmd_daftar))
    app.add_handler(CommandHandler("clockin", cmd_clockin))
    app.add_handler(CommandHandler("clockout", cmd_clockout))
    app.add_handler(CommandHandler("status", cmd_status))
    app.add_handler(CallbackQueryHandler(_handle_callback, pattern=r"^(dibuat|selesai)\|"))
    app.run_polling(timeout=1, drop_pending_updates=True)


if __name__ == "__main__":
    main()
