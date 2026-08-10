import os
import re
import json
import base64
import logging
import io
from datetime import datetime, timedelta, timezone
from collections import Counter
import asyncio

import httpx
from dotenv import load_dotenv
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    Application, CommandHandler, MessageHandler,
    CallbackQueryHandler, ContextTypes, filters,
)
from PIL import Image
from receipt_restock import handle_restock_from_ocr
from marketlist import generate_marketlist
from schedule_import import parse_excel, call_import_schedule, is_google_sheets_link, download_google_sheet
from schedule_export import generate_roster_excel, fetch_schedules, _month_name
from hermes_adapter import (
    TelegramContext,
    audit_event,
    build_request,
    project_scope_summary,
    validate_response,
)

load_dotenv()

# ── Category icon mapping (mirror dari yumi-finance-agent/categories.py) ──
_CATEGORY_MAP = {
    "penjualan": "💰", "bahan_minuman": "☕", "bahan_makanan": "🍳",
    "packaging": "📦", "cleaning": "🧹", "utilities": "💡",
    "operational": "🔧", "marketing": "📢", "transport": "🚗",
    "gaji": "👥", "sewa": "🏢", "lainnya": "📁",
}

_CATEGORY_KEYWORDS: list[tuple[str, str]] = [
    # packaging
    ("packaging", "piring kertas"), ("packaging", "paper cup"), ("packaging", "paper bowl"),
    ("packaging", "cup"), ("packaging", "lid"), ("packaging", "tutup"),
    ("packaging", "gelas"), ("packaging", "pouch"), ("packaging", "kresek"),
    ("packaging", "plastik"), ("packaging", "bag"), ("packaging", "kantong"),
    ("packaging", "box"), ("packaging", "mangkok"), ("packaging", "straw"),
    ("packaging", "sedotan"), ("packaging", "tissue"), ("packaging", "serbet"),
    ("packaging", "kertas"), ("packaging", "napkin"), ("packaging", "take away"),
    ("packaging", "lunch box"), ("packaging", "styrofoam"), ("packaging", "sterofoam"),
    ("packaging", "wadah"), ("packaging", "container"), ("packaging", "klip"),
    ("packaging", "ice cup"), ("packaging", "hot cup"), ("packaging", "sleeve"),
    # cleaning
    ("cleaning", "sabun"), ("cleaning", "detergent"), ("cleaning", "deterjen"),
    ("cleaning", "pembersih"), ("cleaning", "cleaner"), ("cleaning", "lap"),
    ("cleaning", "sponge"), ("cleaning", "spon"), ("cleaning", "sikat"),
    ("cleaning", "kain pel"), ("cleaning", "pel"), ("cleaning", "wipe"),
    ("cleaning", "disinfect"), ("cleaning", "clorin"), ("cleaning", "pemutih"),
    ("cleaning", "bleach"), ("cleaning", "sapu"), ("cleaning", "sampo"),
    ("cleaning", "shampoo"), ("cleaning", "pasta gigi"), ("cleaning", "toothpaste"),
    ("cleaning", "handuk"), ("cleaning", "towel"),
    # bahan_minuman
    ("bahan_minuman", "kopi"), ("bahan_minuman", "coffee"), ("bahan_minuman", "susu"),
    ("bahan_minuman", "milk"), ("bahan_minuman", "creamer"), ("bahan_minuman", "krimer"),
    ("bahan_minuman", "uht"), ("bahan_minuman", "sirup"), ("bahan_minuman", "syrup"),
    ("bahan_minuman", "teh"), ("bahan_minuman", "tea"), ("bahan_minuman", "matcha"),
    ("bahan_minuman", "taro"), ("bahan_minuman", "coklat"), ("bahan_minuman", "cocoa"),
    ("bahan_minuman", "gula"), ("bahan_minuman", "sprite"), ("bahan_minuman", "soda"),
    ("bahan_minuman", "schweppes"), ("bahan_minuman", "you c"), ("bahan_minuman", "c1000"),
    ("bahan_minuman", "sunquick"), ("bahan_minuman", "aqua"), ("bahan_minuman", "mineral"),
    ("bahan_minuman", "es batu"), ("bahan_minuman", "ice"), ("bahan_minuman", "air"),
    ("bahan_minuman", "jus"), ("bahan_minuman", "juice"), ("bahan_minuman", "minuman"),
    ("bahan_minuman", "soda"), ("bahan_minuman", "sirop"),
    # bahan_makanan
    ("bahan_makanan", "beras"), ("bahan_makanan", "nasi"), ("bahan_makanan", "rice"),
    ("bahan_makanan", "mie"), ("bahan_makanan", "noodle"), ("bahan_makanan", "roti"),
    ("bahan_makanan", "bread"), ("bahan_makanan", "tepung"), ("bahan_makanan", "flour"),
    ("bahan_makanan", "minyak"), ("bahan_makanan", "oil"), ("bahan_makanan", "mentega"),
    ("bahan_makanan", "butter"), ("bahan_makanan", "margarin"), ("bahan_makanan", "ayam"),
    ("bahan_makanan", "chicken"), ("bahan_makanan", "daging"), ("bahan_makanan", "meat"),
    ("bahan_makanan", "telur"), ("bahan_makanan", "egg"), ("bahan_makanan", "tahu"),
    ("bahan_makanan", "tempe"), ("bahan_makanan", "sosis"), ("bahan_makanan", "bakso"),
    ("bahan_makanan", "nugget"), ("bahan_makanan", "ikan"), ("bahan_makanan", "fish"),
    ("bahan_makanan", "sayur"), ("bahan_makanan", "vegetable"), ("bahan_makanan", "bumbu"),
    ("bahan_makanan", "sauce"), ("bahan_makanan", "sambal"), ("bahan_makanan", "kecap"),
    ("bahan_makanan", "ketchup"), ("bahan_makanan", "garam"), ("bahan_makanan", "salt"),
    ("bahan_makanan", "keju"), ("bahan_makanan", "cheese"), ("bahan_makanan", "mayonaise"),
    ("bahan_makanan", "mayonnaise"), ("bahan_makanan", "saos"), ("bahan_makanan", "saus"),
    ("bahan_makanan", "cireng"), ("bahan_makanan", "jempol"), ("bahan_makanan", "brex"),
    ("bahan_makanan", "kerupuk"), ("bahan_makanan", "snack"), ("bahan_makanan", "biskuit"),
    ("bahan_makanan", "kayu manis"), ("bahan_makanan", "cinnamon"),
    # operational
    ("operational", "sprei"), ("operational", "sheet"), ("operational", "bantal"),
    # utilities
    ("utilities", "listrik"), ("utilities", "electric"), ("utilities", "air pdam"),
    ("utilities", "pdam"), ("utilities", "pulsa"), ("utilities", "token"),
    ("utilities", "internet"), ("utilities", "wifi"), ("utilities", "gas"),
    ("utilities", "elpiji"), ("utilities", "bensin"), ("utilities", "solar"),
    # transport
    ("transport", "bensin"), ("transport", "solar"), ("transport", "toll"),
    ("transport", "parkir"), ("transport", "bengkel"),
]

def _categorize_item(name: str) -> str:
    """Quick keyword-based item categorization, returns category key."""
    nl = name.lower().strip()
    for cat, kw in _CATEGORY_KEYWORDS:
        if kw in nl:
            return cat
    return "lainnya"

def _cat_icon(cat_key: str) -> str:
    return _CATEGORY_MAP.get(cat_key, "📁")

BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_EDGE_URL = os.getenv("SUPABASE_EDGE_URL", "").rstrip("/") or SUPABASE_URL
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
SUMOPOD_API_KEY = os.getenv("SUMOPOD_API_KEY", "")
SUMOPOD_BASE_URL = os.getenv("SUMOPOD_BASE_URL", "https://ai.sumopod.com/v1")
SUMOPOD_VISION_MODEL = os.getenv("SUMOPOD_VISION_MODEL", "seed-2-0-mini")
ALLOWED_USERS = {
    int(x.strip())
    for x in os.getenv("ALLOWED_USERS", "").split(",")
    if x.strip().isdigit()
}
TELEGRAM_REPORT_CHAT_ID = os.getenv("TELEGRAM_REPORT_CHAT_ID", "")
REPORT_GROUP_ID = int(os.getenv("AUTO_REPORT_GROUP_ID", "-5044633519"))
SHIFT_REPORT_GROUP_ID = int(os.getenv("TELEGRAM_REPORT_CHAT_ID", "-1003991897388"))
MARKETLIST_GROUP_ID = int(os.getenv("MARKETLIST_GROUP_ID", "-5288006237"))
BROADCAST_CHANNEL_ID = int(os.getenv("BROADCAST_CHANNEL_ID", "-1003534335147"))

# ponytail: kill-switch notifikasi otomatis (polling 30s, daily summary, marketlist).
# Default ON agar tidak breaking behaviour lama. Set "false" di .env untuk mematikan
# sementara bot tetap hidup untuk command manual (/ringkasan_hari_ini, dll).
AUTO_REPORTER_ENABLED = os.getenv("AUTO_REPORTER_ENABLED", "true").lower() not in ("false", "0", "no")

# All registered broadcast targets
ALL_BROADCAST_TARGETS: dict[str, int] = {
    "channel": BROADCAST_CHANNEL_ID,
    "transaksi": REPORT_GROUP_ID,
    "report": int(os.getenv("TELEGRAM_REPORT_CHAT_ID", "-1003991897388")),
}

# Attendance notifications target
_ATTENDANCE_REPORT_CHAT_ID = int(os.getenv("TELEGRAM_REPORT_CHAT_ID", "-1003991897388"))

# Dedup: track already-reported orders to prevent re-sending
_reported_expense_ids: set[str] = set()

# Polling state for real-time transaction monitoring
_last_expense_check_ms = 0

# Shift-close report state. Keep it outside Git so deploys cannot replay old shifts.
_SHIFT_RECAP_STATE_FILE = os.path.join(os.path.dirname(__file__), ".runtime", "shift_recap_cursor.txt")

def _load_shift_recap_cursor() -> int:
    try:
        with open(_SHIFT_RECAP_STATE_FILE, encoding="utf-8") as f:
            return int(f.read().strip())
    except (FileNotFoundError, ValueError, OSError):
        # Bounded first-run recovery: report only recent closures, never history.
        return int(datetime.now(tz=timezone(timedelta(hours=7))).timestamp() * 1000) - 2 * 60 * 60 * 1000


def _save_shift_recap_cursor(timestamp_ms: int) -> None:
    path = os.path.dirname(_SHIFT_RECAP_STATE_FILE)
    os.makedirs(path, exist_ok=True)
    tmp = f"{_SHIFT_RECAP_STATE_FILE}.tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(str(timestamp_ms))
    os.replace(tmp, _SHIFT_RECAP_STATE_FILE)

_SHIFT_RECAP_CURSOR_MS = _load_shift_recap_cursor()

# Product categories for item grouping in order notifications
_PRODUCT_CATEGORY_MAP: dict[str, str] = {}
_PRODUCT_CATEGORY_LOADED = False

# ── Attendance polling state ──
_last_attendance_id: str = ""
_reported_attendance_ids: set[str] = set()
# Cached shift schedules (loaded from site settings)
_SHIFT_SCHEDULES: list[dict] = []
_SHIFT_SCHEDULES_LOADED = False
# Cached role baseShiftRate
_ROLE_RATES: dict[str, float] = {}
_ROLE_RATES_LOADED = False

async def _build_product_category_map():
    global _PRODUCT_CATEGORY_MAP, _PRODUCT_CATEGORY_LOADED
    if _PRODUCT_CATEGORY_LOADED:
        return
    try:
        cats = await _fetch("pos_categories", "select=_id,name,parentId&limit=100")
        cat_names = {c["_id"]: c.get("name", "") for c in cats}
        # Find Makanan and Minuman root IDs
        makanan_root = next((c["_id"] for c in cats if c.get("name", "").strip().lower() == "makanan"), None)
        minuman_root = next((c["_id"] for c in cats if c.get("name", "").strip().lower() == "minuman"), None)
        # Map child categories to their parent root
        child_to_root = {}
        for c in cats:
            pid = c.get("parentId")
            if pid == makanan_root:
                child_to_root[c["_id"]] = "Makanan"
            elif pid == minuman_root:
                child_to_root[c["_id"]] = "Minuman"
        prods = await _fetch("pos_products", "select=_id,categoryId&limit=500")
        for p in prods:
            cid = p.get("categoryId") or ""
            if cid in child_to_root:
                _PRODUCT_CATEGORY_MAP[p["_id"]] = child_to_root[cid]
            elif cid == makanan_root:
                _PRODUCT_CATEGORY_MAP[p["_id"]] = "Makanan"
            elif cid == minuman_root:
                _PRODUCT_CATEGORY_MAP[p["_id"]] = "Minuman"
        _PRODUCT_CATEGORY_LOADED = True
        logger.info("Product category map built: %d products", len(_PRODUCT_CATEGORY_MAP))
    except Exception as e:
        logger.warning("build_product_category_map failed: %s", e)

# Staff role map for team member labeling in notifications
_STAFF_ROLE_MAP: dict[str, str] = {}

async def _build_staff_role_map():
    global _STAFF_ROLE_MAP
    if _STAFF_ROLE_MAP:
        return
    try:
        users = await _fetch("pos_users_public", "select=name,roleName&isActive=eq.true&limit=200")
        _STAFF_ROLE_MAP = {
            u.get("name", "").strip().lower(): (u.get("roleName") or "").strip().upper()
            for u in users if u.get("name")
        }
        logger.info("Staff role map loaded: %d users", len(_STAFF_ROLE_MAP))
    except Exception as e:
        logger.warning("build_staff_role_map failed: %s", e)

logging.basicConfig(
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger("yumi-ai-bot")

WIB = timezone(timedelta(hours=7))


# ===================================================================
# SumoPod Vision/OCR Client
# ===================================================================

async def _sumopod_vision(image_base64_uri: str, prompt: str) -> str:
    """Call SumoPod vision API for OCR."""
    if not SUMOPOD_API_KEY:
        return "SumoPod API key tidak dikonfigurasi."

    payload = {
        "model": SUMOPOD_VISION_MODEL,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {
                        "type": "image_url",
                        "image_url": {"url": image_base64_uri},
                    },
                ],
            }
        ],
        "temperature": 0.1,
        "max_tokens": 2048,
    }

    async with httpx.AsyncClient(timeout=90) as client:
        resp = await client.post(
            f"{SUMOPOD_BASE_URL}/chat/completions",
            headers={
                "Authorization": f"Bearer {SUMOPOD_API_KEY}",
                "Content-Type": "application/json",
            },
            json=payload,
        )
        resp.raise_for_status()
        data = resp.json()
        return data["choices"][0]["message"]["content"]


async def _sumopod_vision_json(image_base64_uri: str) -> dict:
    """Call SumoPod vision API and return structured JSON from receipt."""
    if not SUMOPOD_API_KEY:
        return {"success": False, "error": "SumoPod API key tidak dikonfigurasi."}

    prompt = """Analisis gambar struk/nota belanja ini dan ekstrak data dalam format JSON berikut (tanpa markdown, hanya JSON murni):
{
  "type": "expense",
  "name": "Nama Merchant/Toko",
  "category": "Kategori pengeluaran (misal: Makanan, Belanja, dll)",
  "transactionType": "expense",
  "total": 0,
  "subtotal": 0,
  "tax": 0,
  "serviceCharge": 0,
  "discount": 0,
  "items": [{"name": "Nama item", "qty": 1, "price": 0, "subtotal": 0, "unit": "pcs"}],
  "date": "YYYY-MM-DD",
  "time": "HH:MM",
  "receiptNumber": "Nomor struk",
  "paymentMethod": "Cash/Debit/Credit/QRIS",
  "notes": "",
  "confidence": 0.9,
  "rawText": "Teks dari struk"
}
Jika ada informasi yang tidak bisa dibaca, gunakan null atau 0. confidence antara 0-1."""

    payload = {
        "model": SUMOPOD_VISION_MODEL,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {
                        "type": "image_url",
                        "image_url": {"url": image_base64_uri},
                    },
                ],
            }
        ],
        "temperature": 0.1,
        "max_tokens": 2048,
    }

    async with httpx.AsyncClient(timeout=90) as client:
        resp = await client.post(
            f"{SUMOPOD_BASE_URL}/chat/completions",
            headers={
                "Authorization": f"Bearer {SUMOPOD_API_KEY}",
                "Content-Type": "application/json",
            },
            json=payload,
        )
        resp.raise_for_status()
        data = resp.json()
        content = data["choices"][0]["message"]["content"]

        # Extract JSON from response
        import re
        json_match = re.search(r'\{[\s\S]*\}', content)
        if not json_match:
            return {"success": False, "error": "Tidak bisa parse JSON dari respons AI", "raw": content}

        try:
            parsed = json.loads(json_match[0])
            return {"success": True, "data": parsed, "raw": content}
        except json.JSONDecodeError as e:
            return {"success": False, "error": f"JSON decode error: {e}", "raw": content}


async def _save_ocr_receipt_to_db(ocr_data: dict) -> dict:
    """Save OCR receipt data to Supabase financial_transactions table."""
    if not SUPABASE_SERVICE_ROLE_KEY:
        return {"success": False, "error": "Supabase service key tidak tersedia."}

    # Prepare data
    now_ms = int(datetime.now(WIB).timestamp() * 1000)
    source_id = f"ocr_{datetime.now(WIB).strftime('%Y%m%d%H%M%S')}_{crypto.randomUUID().replace('-', '')[:8]}" if 'crypto' in dir() else f"ocr_{now_ms}"

    # Generate source_id
    import uuid
    source_id = f"ocr_{datetime.now(WIB).strftime('%Y%m%d%H%M%S')}_{uuid.uuid4().hex[:8]}"

    items = ocr_data.get("items", [])
    total = ocr_data.get("total", 0)
    merchant = ocr_data.get("name", "Unknown")
    category = ocr_data.get("category", "belanja_stok")

    # Format items as string
    items_str = ""
    for i, item in enumerate(items, 1):
        item_name = item.get("name", "Unknown")
        item_qty = item.get("qty", 1)
        item_subtotal = item.get("subtotal", 0)
        items_str += f"{i}. {item_name} x{item_qty} = Rp{item_subtotal:,.0f}\n"

    description = f"Scan struk - {merchant}: {len(items)} item, Total Rp{total:,.0f}"

    # Build metadata with full OCR data
    metadata = {
        "source": "telegram_bot",
        "action": "ocr_scan",
        "merchant": merchant,
        "receipt_number": ocr_data.get("receiptNumber"),
        "date": ocr_data.get("date"),
        "time": ocr_data.get("time"),
        "payment_method": ocr_data.get("paymentMethod"),
        "items_count": len(items),
        "confidence": ocr_data.get("confidence", 0.5),
    }

    payload = {
        "action": "recordTransaction",
        "tx_type": "expense",
        "amount": total,
        "category": category,
        "description": description,
        "tx_date": now_ms,
        "payment_method": ocr_data.get("paymentMethod", "cash"),
        "status": "completed",
        "metadata": metadata,
        "raw": ocr_data,
        "creation_time": now_ms,
    }

    url = f"{SUPABASE_EDGE_URL}/functions/v1/yumi-ai"
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            url,
            headers={**_headers(), "Content-Type": "application/json"},
            json=payload,
        )

    if resp.status_code < 400:
        data = resp.json()
        if data.get("success"):
            return {"success": True, "sourceId": data.get("sourceId"), "amount": total, "merchant": merchant, "items_count": len(items)}
        else:
            err = data.get("error", "Unknown error")
            if isinstance(err, dict):
                err = err.get("message", "Unknown error")
            return {"success": False, "error": err}
    else:
        return {"success": False, "error": f"HTTP {resp.status_code}: {resp.text}"}

MAX_IMAGE_SIZE = 1024  # max dimension for compression
JPEG_QUALITY = 75
SESSION_MAX_HISTORY = 20  # max messages kept per user session

# === In-memory session store per user ===
user_sessions: dict[int, dict] = {}  # { user_id: { "history": [...], "created_at": datetime } }


def _headers():
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
    }


def _service_headers():
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


def _is_allowed(update: Update, bot_username: str | None = None) -> bool:
    user = update.effective_user
    if not user:
        return False
    if not ALLOWED_USERS:
        return True
    # Di grup: izinkan jika @mention atau reply ke bot
    chat = update.effective_chat
    if chat and chat.type in ("group", "supergroup"):
        msg = update.effective_message
        if msg:
            if msg.reply_to_message and msg.reply_to_message.from_user and msg.reply_to_message.from_user.is_bot:
                return True
            message_text = msg.text or msg.caption or ""
            # Cek entity mention — lebih reliable dari hardcode string
            if msg.entities:
                for ent in msg.entities:
                    if ent.type == "mention":
                        mentioned = message_text[ent.offset:ent.offset + ent.length].lower()
                        # Cocokkan dengan username bot asli (dari context) + fallback hardcode
                        if bot_username:
                            if f"@{bot_username.lower()}" == mentioned:
                                return True
                        if "@yummeaibot" in message_text.lower():
                            return True
            # Fallback: cek string langsung (untuk caption atau kasus entity tidak terdeteksi)
            if "@yummeaibot" in message_text.lower():
                return True
    # DM: hanya owner
    return user.id in ALLOWED_USERS


async def _require_employee(update: Update) -> dict | None:
    """Look up employee linked to this Telegram user via employee_telegram_links.
    Returns dict with employee_user_id, employee_name, is_active or None if not found."""
    if not update.effective_user:
        return None
    try:
        rows = await _fetch_svc(
            "employee_telegram_links",
            f"select=employee_user_id,employee_name,is_active"
            f"&telegram_user_id=eq.{update.effective_user.id}"
            f"&is_active=eq.true"
            f"&limit=1",
        )
        return rows[0] if rows else None
    except Exception as e:
        logger.warning("_require_employee failed for user %s: %s", update.effective_user.id, e)
        return None


async def _fetch(view: str, query: str = "select=*"):
    url = f"{SUPABASE_URL}/rest/v1/{view}?{query}"
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.get(url, headers=_headers())
        resp.raise_for_status()
        return resp.json()


async def _fetch_svc(view: str, query: str = "select=*"):
    """Fetch from Supabase using SERVICE_ROLE_KEY for cross-schema access."""
    url = f"{SUPABASE_URL}/rest/v1/{view}?{query}"
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.get(url, headers=_service_headers())
        resp.raise_for_status()
        return resp.json()


def _now_wib() -> datetime:
    return datetime.now(WIB)


def _start_of_day_ms(dt: datetime) -> int:
    sod = dt.replace(hour=0, minute=0, second=0, microsecond=0)
    return int(sod.timestamp() * 1000)


def _today_wib_str() -> str:
    return _now_wib().strftime("%Y-%m-%d")


# ===================================================================
# Rich Context Gathering (mirrors web YumiAIChat context hint)
# ===================================================================

async def _gather_context() -> str:
    """Gather realtime operational context: low stock, pending orders, active shift, plus persistent memory."""
    hints = []
    
    # 0) Persistent markdown files — read all GM_*.md in the bot directory
    bot_dir = os.path.dirname(__file__)
    try:
        for fname in sorted(os.listdir(bot_dir)):
            if fname.startswith("GM_") and fname.endswith(".md") and fname != "GM_README.md":
                fpath = os.path.join(bot_dir, fname)
                with open(fpath, "r", encoding="utf-8") as f:
                    text = f.read().strip()
                if text:
                    label = fname.replace("GM_", "").replace(".md", "").upper()
                    hints.append(f"📄 [{label}] " + text[:2000].replace("\n", " | ").replace("---", ""))
    except Exception as e:
        logger.warning("Failed to read GM_*.md files: %s", e)
    try:
        now = _now_wib()
        start_ms = _start_of_day_ms(now)

        # 1) Low stock
        inv = await _fetch("pos_inventory", "select=ingredientName,quantity,lowStockThreshold,unit")
        low = [i for i in inv if float(i.get("quantity") or 0) <= float(i.get("lowStockThreshold") or 0)]
        if low:
            names = ", ".join([f'{i["ingredientName"]} ({float(i["quantity"]):g}/{float(i.get("lowStockThreshold") or 0):g} {i.get("unit","")})' for i in low[:5]])
            hints.append(f"⚠️ {len(low)} item stok rendah: {names}")

        # 2) Pending orders
        orders = await _fetch("pos_orders", f"select=orderNumber,customerName,status,totalAmount&status=eq.pending&_creationTime=gte.{start_ms}&order=_creationTime.desc&limit=10")
        if orders:
            hints.append(f"📋 {len(orders)} pesanan pending menunggu diproses")

        # 3) Active shift
        shifts = await _fetch("pos_shift_reports", "select=shift_name,status,daily_collected,order_count&status=eq.AKTIF&order=start_time.desc&limit=1")
        if shifts:
            s = shifts[0]
            hints.append(f"🔛 Shift aktif: {s['shift_name']} — {int(s.get('order_count') or 0)} order, Rp {float(s.get('daily_collected') or 0):,.0f}")

    except Exception as e:
        logger.warning("Context gathering partial: %s", e)

    if hints:
        return "Konteks realtime: " + " | ".join(hints)
    return "Konteks: Ekosistem Djiwa Tentram — POS (pos.yumme.id), Customer (djiwatentram.yumme.id), Karyawan (karyawan.yumme.id)"


# ===================================================================
# Image Compression
# ===================================================================

def _compress_image(image_bytes: bytes) -> str:
    """Compress image to under ~200KB, return base64 data URI."""
    img = Image.open(io.BytesIO(image_bytes))
    if img.mode in ("RGBA", "P"):
        img = img.convert("RGB")

    # Resize if larger than MAX_IMAGE_SIZE
    w, h = img.size
    if max(w, h) > MAX_IMAGE_SIZE:
        ratio = MAX_IMAGE_SIZE / max(w, h)
        img = img.resize((int(w * ratio), int(h * ratio)), Image.LANCZOS)

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=JPEG_QUALITY, optimize=True)
    compressed = buf.getvalue()

    b64 = base64.b64encode(compressed).decode("utf-8")
    return f"data:image/jpeg;base64,{b64}"


# ===================================================================
# Session Memory (Supabase pos_ai_conversation_memory)
# ===================================================================

def _get_session(user_id: int) -> list:
    if user_id not in user_sessions:
        user_sessions[user_id] = {"history": [], "created_at": _now_wib()}
    return user_sessions[user_id]["history"]


def _add_to_session(user_id: int, role: str, content: str):
    history = _get_session(user_id)
    history.append({"role": role, "content": content})
    # Trim old messages
    if len(history) > SESSION_MAX_HISTORY:
        user_sessions[user_id]["history"] = history[-SESSION_MAX_HISTORY:]


async def _save_to_supabase(user_id: int, role: str, content: str):
    """Persist conversation to pos_ai_conversation_memory."""
    try:
        payload = {
            "sessionId": f"telegram:{user_id}",
            "role": role,
            "content": content,
            "timestamp": int(_now_wib().timestamp() * 1000),
            "metadata": {"source": "telegram", "userId": user_id},
        }
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                f"{SUPABASE_URL}/rest/v1/pos_ai_conversation_memory",
                headers=_service_headers(),
                json=payload,
            )
            if resp.status_code >= 400:
                logger.warning("Failed to save conversation memory: %s %s", resp.status_code, resp.text)
    except Exception as e:
        logger.warning("save_to_supabase error: %s", e)


# ===================================================================
# Yumi AI Chat (with rich context & session history)
# ===================================================================

async def _ask_yumi_ai(
    user_id: int,
    message: str,
    context_hint: str = "",
    images: list[str] | None = None,
    action: str = "yumiChat",
) -> str:
    """Forward chat to Supabase Edge Function yumi-ai with full context."""
    url = f"{SUPABASE_EDGE_URL}/functions/v1/yumi-ai"
    history = _get_session(user_id)

    # Add user message to session
    _add_to_session(user_id, "user", message)
    await _save_to_supabase(user_id, "user", message)

    payload = {
        "action": action,
        "message": message,
        "history": history[:-1],  # exclude the just-added user message
        "contextHint": context_hint or await _gather_context(),
        "images": images or [],
    }

    async with httpx.AsyncClient(timeout=90) as client:
        resp = await client.post(
            url,
            headers={**_headers(), "Content-Type": "application/json"},
            json=payload,
        )
        resp.raise_for_status()
        data = resp.json()
        reply = str(data.get("content") or "Maaf, Yumi belum bisa menjawab sekarang.")

    # Add assistant reply to session
    _add_to_session(user_id, "assistant", reply)
    await _save_to_supabase(user_id, "assistant", reply)

    return reply


async def _ask_yumi_ai_readonly(user_id: int, message: str) -> str:
    """Ask the existing Yumi AI endpoint without saving chat memory from the bot."""
    url = f"{SUPABASE_EDGE_URL}/functions/v1/yumi-ai"
    context_hint = await _gather_context()
    scoped_message = (
        "Mode Hermes project-scoped read-only. Jawab hanya berdasarkan konteks "
        "operasional Yumi/Djiwatentramapp. Jangan instruksikan perubahan VPS, "
        "systemd, sudo, file di luar project, atau write action.\n\n"
        f"Pertanyaan user: {message}"
    )
    payload = {
        "action": "yumiChat",
        "message": scoped_message,
        "history": [],
        "contextHint": context_hint,
        "images": [],
    }

    async with httpx.AsyncClient(timeout=90) as client:
        resp = await client.post(
            url,
            headers={**_headers(), "Content-Type": "application/json"},
            json=payload,
        )
        resp.raise_for_status()
        data = resp.json()
        return str(data.get("content") or "Maaf, Hermes read-only belum bisa menjawab sekarang.")


# ===================================================================
# Commands
# ===================================================================

async def _reply_msg(update, context, text, **kwargs):
    msg = update.message
    if msg is None and update.callback_query:
        msg = update.callback_query.message
    if msg:
        return await msg.reply_text(text, **kwargs)
    return await context.bot.send_message(
        chat_id=update.effective_chat.id, text=text, **kwargs
    )


def _reply_keyboard() -> InlineKeyboardMarkup:
    """Quick action inline keyboard (tombol, bukan slash command)."""
    return InlineKeyboardMarkup([
        [
            InlineKeyboardButton("📊 Ringkasan", callback_data="ringkasan"),
            InlineKeyboardButton("🔥 Top Produk", callback_data="top"),
            InlineKeyboardButton("📅 Booking", callback_data="booking"),
        ],
        [
            InlineKeyboardButton("🕒 Absensi", callback_data="absen"),
            InlineKeyboardButton("📋 Briefing", callback_data="briefing"),
            InlineKeyboardButton("👤 Status Saya", callback_data="status_saya"),
        ],
        [
            InlineKeyboardButton("⚠️ Stok", callback_data="stok"),
            InlineKeyboardButton("🛒 Marketlist", callback_data="marketlist"),
            InlineKeyboardButton("📝 Purchaselog", callback_data="purchaselog"),
        ],
        [
            InlineKeyboardButton("📤 Export Jadwal", callback_data="export_jadwal"),
            InlineKeyboardButton("📥 Import Jadwal", callback_data="import_jadwal"),
        ],
        [
            InlineKeyboardButton("💬 Tanya AI", callback_data="help"),
        ],
    ])



def _ocr_action_keyboard(amount: float = 0, merchant: str = "") -> InlineKeyboardMarkup:
    """Inline keyboard for OCR scan results with save actions."""
    return InlineKeyboardMarkup([
        [
            InlineKeyboardButton("💰 Simpan Pemasukan", callback_data=f"ocr_income_{amount}_{merchant[:20]}"),
            InlineKeyboardButton("💸 Simpan Pengeluaran", callback_data=f"ocr_expense_{amount}_{merchant[:20]}"),
        ],
        [
            InlineKeyboardButton("📦 Catat Stok", callback_data=f"ocr_stock_{merchant[:20]}"),
            InlineKeyboardButton("❌ Batal", callback_data="ocr_cancel"),
        ],
    ])


def _parse_ocr_reply(reply_text):
    """Parse Yumi AI OCR reply to extract total amount and merchant name."""
    amount = 0.0
    merchant = ""

    total_patterns = [
        r'💰\s*\*?TOTAL:?\*?\s*Rp\s*([\d.,]+)',
        r'\*\*TOTAL:?\*\*\s*Rp\s*([\d.,]+)',
        r'TOTAL:?\s*Rp\s*([\d.,]+)',
    ]
    for pat in total_patterns:
        m = _re_mod.search(pat, reply_text)
        if m:
            raw = m.group(1).replace('.', '').replace(',', '.')
            try:
                amount = float(raw)
            except ValueError:
                amount = 0.0
            break

    merchant_patterns = [
        r'🏪\s*\*?Merchant:?\*?\s*(.+?)(?:\n|$)',
        r'\*\*Merchant:?\*\*\s*(.+?)(?:\n|$)',
        r'Merchant:?\s*(.+?)(?:\n|$)',
    ]
    for pat in merchant_patterns:
        m = _re_mod.search(pat, reply_text)
        if m:
            merchant = m.group(1).strip()
            break

    return amount, merchant


# ===================================================================
# OCR Action Handler
# ===================================================================

async def _handle_ocr_action(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle OCR save buttons: income, expense, stock, cancel."""
    query = update.callback_query
    await query.answer()
    data = query.data
    chat_id = query.message.chat_id

    if data == "ocr_cancel":
        await query.edit_message_text(
            query.message.text + "\n\n❌ Dibatalkan.",
            reply_markup=None,
        )
        return

    try:
        # Parse: ocr_income_12345_MerchantName or ocr_expense_...
        parts = data.split("_", 3)  # ["ocr", "income", "12345", "MerchantName"]
        action = parts[1]  # income / expense / stock
        amount_str = parts[2] if len(parts) > 2 else "0"
        merchant = parts[3] if len(parts) > 3 else ""

        try:
            amount = float(amount_str)
        except ValueError:
            amount = 0

        # Extract description from the OCR result message
        ocr_text = query.message.text or ""
        desc = f"Scan struk{f' - {merchant}' if merchant else ''}"

        if action == "income":
            tx_type = "income"
            category = "penjualan"
            label = "pemasukan"

        elif action == "expense":
            tx_type = "expense"
            # Try to determine category from OCR text
            category = "lainnya"
            if any(k in ocr_text.lower() for k in ["belanja", "stok", "bahan"]):
                category = "belanja_stok"
            elif any(k in ocr_text.lower() for k in ["listrik", "air", "wifi"]):
                category = "utilitas"
            if any(k in ocr_text.lower() for k in ["gaji", "gajih"]):
                category = "gaji"

            label = "pengeluaran"

        elif action == "stock":
            ocr_text = query.message.text or ""
            await query.edit_message_text(
                query.message.text + "\n\nMemproses update stok otomatis...",
                parse_mode="Markdown",
                reply_markup=None,
            )
            try:
                msg, _ = await handle_restock_from_ocr(
                    ocr_text, merchant,
                    SUPABASE_URL, SUPABASE_KEY, SUPABASE_SERVICE_ROLE_KEY,
                )
                await query.edit_message_text(msg, reply_markup=None)
            except Exception as e:
                logger.exception("Restock failed")
                await query.edit_message_text(
                    query.message.text + f"\n\nGagal: {e}",
                    reply_markup=None,
                )
            return
        # Send to yumi-ai Edge Function (which has pos schema access)
        url = f"{SUPABASE_EDGE_URL}/functions/v1/yumi-ai"
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                url,
                headers={**_headers(), "Content-Type": "application/json"},
                json={
                    "action": "recordTransaction",
                    "tx_type": tx_type,
                    "amount": amount,
                    "category": category,
                    "description": desc,
                    "tx_date": int(_now_wib().timestamp() * 1000),
                    "payment_method": "cash",
                    "status": "completed",
                    "metadata": {"source": "telegram_bot", "action": "ocr_scan", "merchant": merchant},
                },
            )
            if resp.status_code < 400:
                data = resp.json()
                if data.get("success"):
                    await query.edit_message_text(
                        query.message.text + f"\n\n✅ Berhasil disimpan sebagai {label} — Rp {amount:,.0f}",
                        parse_mode="Markdown",
                        reply_markup=None,
                    )
                else:
                    err = data.get("error", "Unknown")
                    if isinstance(err, dict):
                        err = err.get("message", "Unknown")
                    await query.edit_message_text(
                        query.message.text + f"\n\n❌ Gagal: {err}",
                        reply_markup=None,
                    )
            else:
                await query.edit_message_text(
                    query.message.text + f"\n\n❌ Gagal menyimpan: {resp.status_code}",
                    reply_markup=None,
                )

    except Exception as e:
        logger.exception("OCR action failed")
        await query.edit_message_text(
            query.message.text + f"\n\n❌ Gagal: {e}",
            reply_markup=None,
        )



async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not _is_allowed(update):
        await _reply_msg(update, context, "Maaf, Anda tidak diizinkan menggunakan bot ini.")
        return

    # Reset session on start
    user_sessions.pop(update.effective_user.id, None)

    # Shared auth: sambut employee yang terdaftar
    emp = await _require_employee(update)
    if emp:
        emp_name = emp.get("employee_name") or ""
        emp_user_id = emp.get("employee_user_id") or ""
        role = ""
        if emp_user_id:
            try:
                urows = await _fetch(
                    "pos_users_public",
                    f"select=roleName&_id=eq.{emp_user_id}&limit=1",
                )
                if urows:
                    role = urows[0].get("roleName") or ""
            except Exception:
                pass
        greeting = f"👋 Halo {emp_name}!"
        if role:
            greeting += f" Kamu terdaftar sebagai *{role}*."
        greeting += "\n\n"
    else:
        greeting = ""

    await _reply_msg(update, context, 
        f"{greeting}🤖⭐ Yumi General Manager Agents\\n\\n"
        "Saya asisten AI untuk ekosistem Djiwa Tentram.\\n"
        "Gunakan tombol di bawah 👇 atau ketik bebas.\\n\\n"
        "💡 Detail keuangan → @YummeFinanceAIbot\\n"
        "💡 Restok/supplier → @YumiPurchasingBot\\n"
        "💡 Absensi/HR  → @yumihrdbot",
        parse_mode="Markdown",
        reply_markup=_reply_keyboard(),
    )


async def cmd_status_saya(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Show employee's personal attendance status today."""
    if not _is_allowed(update):
        await _reply_msg(update, context, "Maaf, Anda tidak diizinkan menggunakan bot ini.")
        return

    emp = await _require_employee(update)
    if not emp:
        await _reply_msg(
            update, context,
            "❌ Kamu belum terdaftar sebagai karyawan.\n\n"
            "Daftar dulu di @YumiHRDBot untuk menggunakan fitur ini.",
        )
        return

    emp_name = emp.get("employee_name") or "?"
    emp_user_id = emp.get("employee_user_id") or ""

    if not emp_user_id:
        await _reply_msg(update, context, "❌ Data karyawan tidak lengkap.")
        return

    try:
        today_start = _start_of_day_ms(_now_wib())
        today_end = today_start + 86_400_000  # +24 jam

        logs = await _fetch(
            "pos_attendance_logs",
            f"select=type,timestamp,shiftName"
            f"&userId=eq.{emp_user_id}"
            f"&timestamp=gte.{today_start}"
            f"&timestamp=lt.{today_end}"
            f"&order=timestamp.asc&limit=20",
        )

        lines = [f"👤 *Status Saya* — {emp_name}", ""]

        if not logs:
            lines.append("📭 Belum ada absensi hari ini.")
        else:
            check_in_time = ""
            check_out_time = ""
            shift_name = ""

            for log in logs:
                tp = log.get("type", "")
                ts = int(float(log.get("timestamp") or 0))
                time_str = datetime.fromtimestamp(ts / 1000, tz=WIB).strftime("%H:%M")
                if tp == "check_in":
                    check_in_time = time_str
                    if log.get("shiftName"):
                        shift_name = log.get("shiftName", "")
                elif tp == "check_out":
                    check_out_time = time_str
                    if not shift_name and log.get("shiftName"):
                        shift_name = log.get("shiftName", "")

            if check_in_time:
                lines.append(f"✅ *Masuk:* {check_in_time} WIB")
            else:
                lines.append("⏳ *Masuk:* Belum absen")

            if check_out_time:
                lines.append(f"✅ *Keluar:* {check_out_time} WIB")
            else:
                lines.append("⏳ *Keluar:* Belum absen")

            if shift_name:
                lines.append(f"📌 Shift: {shift_name}")

            # Durasi jika sudah check-in dan check-out
            if check_in_time and check_out_time:
                ci = int(
                    datetime.strptime(check_in_time, "%H:%M")
                    .replace(year=2000, month=1, day=1)
                    .timestamp()
                )
                co = int(
                    datetime.strptime(check_out_time, "%H:%M")
                    .replace(year=2000, month=1, day=1)
                    .timestamp()
                )
                dur_min = (co - ci) // 60
                if dur_min > 0:
                    h = dur_min // 60
                    m = dur_min % 60
                    dur_str = f"{h} jam {m} menit" if h > 0 else f"{m} menit"
                    lines.append(f"⏱ Durasi: {dur_str}")

        await _reply_msg(update, context, "\n".join(lines), parse_mode="Markdown")

    except Exception as e:
        logger.exception("cmd_status_saya failed")
        await _reply_msg(update, context, f"Gagal mengambil status: {e}")


async def cmd_help(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not _is_allowed(update):
        await _reply_msg(update, context, "Unauthorized")
        return
    await _reply_msg(update, context, 
        "💡 Cara pakai Yumi General Manager Agents\n\n"
        "📋 Commands:\n"
        "/ringkasan — Ringkasan (default: hari ini)\n"
        "  └ Filter: /ringkasan kemarin / minggu_ini / bulan_ini\n"
        "/top_produk — Produk terlaris\n"
        "/stok_menipis — Stok yang perlu dibeli\n"
        "/absen_hari_ini — Absensi staff\n"
        "/booking_aktif — Booking aktif\n"
        "/briefing_hari_ini — Briefing bisnis\n"
        "/yumi <pesan> — Opt-in Hermes read-only\n"
        "/hermes_scope — Cek scope Hermes project agent\n"
        "/hermes_test — Test adapter Hermes read-only\n"
        "/broadcast <pesan> — Broadcast ke semua channel & grup\n"
        "/sebarkan <target> <pesan> — Kirim ke target tertentu\n\n"
        "🤖⭐ Orchestrator — Saya koordinasikan semua bot:\n"
        "• @YummeFinanceAIbot — Keuangan & OCR struk\n"
        "• @YumiPurchasingBot — Inventori & Restok\n"
        "• @YummeSupervisorAIbot — Order Realtime\n\n"
        "💬 Chat bebas: ketik apa saja\n"
        "📸 Scan struk: kirim foto struk\n\n"
        "Contoh: _omzet hari ini_, _produk terlaris minggu ini_, _berapa stok kopi?_\n"
        "Atau: _cek pengeluaran_ (saya arahkan ke Finance bot)",
        parse_mode="Markdown",
        reply_markup=_reply_keyboard(),
    )


async def cmd_hermes_scope(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not _is_allowed(update):
        await _reply_msg(update, context, "Unauthorized")
        return

    scope = project_scope_summary()
    await _reply_msg(
        update,
        context,
        "Hermes project agent: passive/read-only\n\n"
        f"Project root: `{scope['project_root']}`\n"
        f"Hermes root: `{scope['hermes_root']}`\n"
        f"Audit log: `{scope['audit_log']}`\n"
        f"Mode: `{scope['mode']}`\n\n"
        "Batasan: tidak mengatur VPS, tidak sudo, tidak systemctl, "
        "dan tidak akses file di luar project.",
        parse_mode="Markdown",
    )


def _telegram_context_from_update(update: Update) -> TelegramContext:
    user = update.effective_user
    chat = update.effective_chat
    msg = update.effective_message
    return TelegramContext(
        chat_id=str(chat.id if chat else ""),
        user_id=str(user.id if user else ""),
        username=(user.username if user and user.username else ""),
        message_id=str(msg.message_id if msg else ""),
        chat_type=(chat.type if chat else ""),
    )


async def cmd_hermes_test(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not _is_allowed(update):
        await _reply_msg(update, context, "Unauthorized")
        return

    request = build_request(
        "general_ops",
        _telegram_context_from_update(update),
        "text",
        text="hermes adapter smoke test",
        can_write=False,
    )
    response = {
        "reply_text": "Hermes adapter OK dalam mode read-only.",
        "actions": [],
        "requires_confirmation": False,
        "audit": {"profile_id": "general_ops", "mode": "read_only"},
    }
    validate_response(response)
    audit_event({
        "profile_id": "general_ops",
        "mode": "read_only",
        "telegram": request["telegram"],
        "message": "telegram command /hermes_test",
    })

    await _reply_msg(
        update,
        context,
        "Hermes adapter OK.\n\n"
        "Profile: `general_ops`\n"
        "Mode: `read_only`\n"
        "Actions: `0`\n"
        "Runtime routing: `disabled`\n"
        "Audit: `written`",
        parse_mode="Markdown",
    )


async def cmd_yumi(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not _is_allowed(update):
        await _reply_msg(update, context, "Unauthorized")
        return

    text = " ".join(context.args).strip()
    if not text:
        await _reply_msg(
            update,
            context,
            "Pakai format: `/yumi pertanyaan kamu`\n\n"
            "Mode saat ini masih read-only dan opt-in.",
            parse_mode="Markdown",
        )
        return

    request = build_request(
        "general_ops",
        _telegram_context_from_update(update),
        "text",
        text=text,
        can_write=False,
    )
    await context.bot.send_chat_action(chat_id=update.effective_chat.id, action="typing")
    try:
        reply = await _ask_yumi_ai_readonly(update.effective_user.id, text)
    except Exception as e:
        logger.exception("Hermes read-only bridge failed")
        reply = f"Hermes read-only gagal menjawab: {e}"

    response = {
        "reply_text": reply,
        "actions": [],
        "requires_confirmation": False,
        "audit": {"profile_id": "general_ops", "mode": "read_only"},
    }
    validate_response(response)
    audit_event({
        "profile_id": "general_ops",
        "mode": "read_only",
        "telegram": request["telegram"],
        "message": "telegram command /yumi",
        "input_preview": text[:160],
        "actions": [],
    })

    await _reply_msg(update, context, response["reply_text"])


# ── Period helpers ──
PERIOD_LABELS = {
    "hari_ini": "Hari Ini",
    "kemarin": "Kemarin",
    "minggu_ini": "Minggu Ini",
    "minggu_kemarin": "Minggu Kemarin",
    "bulan_ini": "Bulan Ini",
    "bulan_kemarin": "Bulan Kemarin",
}

def _parse_period(text: str | None) -> tuple[str, int, int, str]:
    """Parse period from command text. Returns (period_key, start_ms, end_ms, label)."""
    now = _now_wib()
    arg = (text or "").strip().lower().replace("/ringkasan_hari_ini", "").replace("/ringkasan", "").strip()
    period = arg if arg in PERIOD_LABELS else "hari_ini"

    sod = now.replace(hour=0, minute=0, second=0, microsecond=0)
    if period == "hari_ini":
        start = sod
        end = now
    elif period == "kemarin":
        start = sod - timedelta(days=1)
        end = sod
    elif period == "minggu_ini":
        start = sod - timedelta(days=now.weekday())  # Monday
        end = now
    elif period == "minggu_kemarin":
        this_monday = sod - timedelta(days=now.weekday())
        start = this_monday - timedelta(days=7)
        end = this_monday
    elif period == "bulan_ini":
        start = sod.replace(day=1)
        end = now
    elif period == "bulan_kemarin":
        first_this_month = sod.replace(day=1)
        start = (first_this_month - timedelta(days=1)).replace(day=1)
        end = first_this_month
    else:
        start = sod
        end = now

    return period, int(start.timestamp() * 1000), int(end.timestamp() * 1000), PERIOD_LABELS.get(period, period)


def _period_keyboard(current_period: str = "hari_ini") -> InlineKeyboardMarkup:
    """Inline keyboard with period filter buttons."""
    buttons = []
    row = []
    for key, label in PERIOD_LABELS.items():
        prefix = "✅ " if key == current_period else ""
        row.append(InlineKeyboardButton(f"{prefix}{label}", callback_data=f"ringkasan_period:{key}"))
        if len(row) == 2:
            buttons.append(row)
            row = []
    if row:
        buttons.append(row)
    return InlineKeyboardMarkup(buttons)


async def cmd_ringkasan_hari_ini(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not _is_allowed(update):
        await _reply_msg(update, context, "Unauthorized")
        return
    await context.bot.send_chat_action(chat_id=update.effective_chat.id, action="typing")
    try:
        # Parse period — check callback data first, then command text
        period = "hari_ini"
        if update.callback_query and update.callback_query.data.startswith("ringkasan_period:"):
            period = update.callback_query.data.split(":", 1)[1]
        elif update.message and update.message.text:
            _, _, _, _ = _parse_period(update.message.text)
            period = _parse_period(update.message.text)[0]

        period_key, start_ms, end_ms, period_label = _parse_period(f"/ringkasan {period}")

        date_fmt = "%d/%m" if period_key in ("minggu_ini", "minggu_kemarin", "bulan_ini", "bulan_kemarin") else "%d/%m/%Y"
        if period_key in ("minggu_ini", "minggu_kemarin"):
            sd = datetime.fromtimestamp(start_ms / 1000, tz=WIB)
            ed = datetime.fromtimestamp((end_ms - 1) / 1000, tz=WIB) if end_ms else _now_wib()
            date_str = f"{sd.strftime(date_fmt)} – {ed.strftime(date_fmt)}"
        elif period_key in ("bulan_ini", "bulan_kemarin"):
            sd = datetime.fromtimestamp(start_ms / 1000, tz=WIB)
            date_str = sd.strftime("%B %Y")
        else:
            sd = datetime.fromtimestamp(start_ms / 1000, tz=WIB)
            date_str = sd.strftime(date_fmt)

        # ── 1) Completed orders in period ──
        q_orders = (
            "select=totalAmount,paymentMethod,discountAmount,items"
            f"&status=eq.completed&_creationTime=gte.{start_ms}"
            + (f"&_creationTime=lte.{end_ms}" if end_ms else "")
            + "&order=_creationTime.desc&limit=500"
        )
        orders = await _fetch("pos_orders", q_orders)

        total_cash = 0.0; total_qris = 0.0; total_other = 0.0
        total_discount = 0.0; total_items_sold = 0
        items_by_name = Counter()
        for o in orders:
            amt = float(o.get("totalAmount") or 0)
            pm = (o.get("paymentMethod") or "").lower()
            if pm in ("cash", "tunai"): total_cash += amt
            elif pm in ("qris", "transfer"): total_qris += amt
            else: total_other += amt
            total_discount += float(o.get("discountAmount") or 0)
            for item in (o.get("items") or []):
                name = (item.get("productName") or "Unknown").strip()
                qty = int(float(item.get("quantity") or 0))
                items_by_name[name] += qty
                total_items_sold += qty
        total_revenue = total_cash + total_qris + total_other
        total_gross = total_revenue + total_discount

        # ── 2) Financial transactions ──
        q_fin = f"select=amount,type,category&type=eq.expense&date=gte.{start_ms}"
        if end_ms:
            q_fin += f"&date=lte.{end_ms}"
        fin_rows = await _fetch("pos_financial_transactions", q_fin)
        expense_by_cat = Counter()
        total_expense = 0.0
        for x in fin_rows:
            amt = float(x.get("amount") or 0)
            expense_by_cat[x.get("category") or "Lainnya"] += amt
            total_expense += amt
        net_balance = total_revenue - total_expense

        # ── 3) Shift reports (deduplicated) ──
        shift_rows = await _fetch(
            "pos_shift_reports",
            "select=shift_name,status,shift_collected,order_count,"
            "start_time,end_time,cashier_name,team_members,starting_cash,"
            "total_revenue,total_gross_sales,total_discount,total_items_sold,total_expenses"
            f"&start_time=gte.{start_ms}"
            + (f"&start_time=lte.{end_ms}" if end_ms else "")
            + "&order=start_time.desc&limit=20",
        )

        # Deduplicate: active shifts shown, SELESAI only if no AKTIF with same name
        active_names = set()
        deduped = []
        for s in shift_rows:
            if s.get("status") == "AKTIF":
                active_names.add(s["shift_name"])
                deduped.append(s)
        # Add SELESAI shifts only for names not covered by AKTIF
        seen = set()
        for s in shift_rows:
            if s.get("status") == "AKTIF":
                continue
            name = s["shift_name"]
            if name in active_names:
                continue  # skip — already shown as AKTIF
            key = (name, s.get("status", ""))
            if key not in seen:
                seen.add(key)
                deduped.append(s)

        # ── 4) Build natural-language report ──
        # Dynamic opening based on data
        if total_gross == 0 and total_expense == 0:
            opening = f"Belum ada aktivitas hari ini {date_str}."
        elif total_revenue > 0:
            opening = f"Hari ini {date_str} — {len(orders)} transaksi dengan total omzet Rp{total_revenue:,.0f}"
        else:
            opening = f"{date_str} — belum ada pendapatan tercatat."
        
        lines = [opening, ""]
        
        # Items sold
        if total_items_sold > 0:
            lines.append(f"📦 {total_items_sold} produk terjual")
        
        # Revenue breakdown
        rev_parts = []
        if total_cash > 0: rev_parts.append(f"Tunai Rp{total_cash:,.0f}")
        if total_qris > 0: rev_parts.append(f"QRIS Rp{total_qris:,.0f}")
        if total_other > 0: rev_parts.append(f"Lainnya Rp{total_other:,.0f}")
        if rev_parts:
            lines.append(f"💰 Omzet: {' | '.join(rev_parts)}")
        
        if total_discount > 0:
            lines.append(f"🏷️ Diskon Rp{total_discount:,.0f}")
        
        if total_expense > 0:
            expense_detail = " | ".join(f"{cat} Rp{amt:,.0f}" for cat, amt in expense_by_cat.most_common(5))
            lines.append(f"💸 Biaya Rp{total_expense:,.0f} ({expense_detail})")
        
        lines.append(f"🏦 Bersih Rp{net_balance:,.0f}")
        
        # Top 3 products
        top3 = items_by_name.most_common(3)
        if top3:
            lines.append(f"⭐ Terlaris: {', '.join(f'{n} ({q})' for n,q in top3)}")
        
        # Shift info
        if deduped:
            shift_lines = []
            for s in deduped:
                name = s["shift_name"]
                status = s.get("status", "?")
                is_active = status == "AKTIF"
                icon = "🟢" if is_active else "⚫"
                cashier = s.get("cashier_name") or "?"
                orders_n = int(s.get("order_count") or 0)
                shift_lines.append(f"{icon} {name} — {cashier} ({orders_n} order)")
            if shift_lines:
                lines.append("")
                lines.append(" | ".join(shift_lines))
        
        lines.append("")
        lines.append("📋 Mau laporan ini dalam format PDF atau Excel? Minta ke admin atau download dari dashboard web.")
        lines.append("💡 Butuh analisis lebih dalam? Tanya aja — saya siap breakdown.")

        text = "\n".join(lines)

        # Period keyboard + standard keyboard
        kb = InlineKeyboardMarkup([
            *_period_keyboard(period_key).inline_keyboard,
            [InlineKeyboardButton("🔄 Refresh", callback_data=f"ringkasan_period:{period_key}")],
        ])

        if update.callback_query:
            try:
                await update.callback_query.edit_message_text(text, parse_mode="Markdown", reply_markup=kb)
            except Exception:
                await update.callback_query.edit_message_text(
                    text.replace("*", ""), reply_markup=kb
                )
        else:
            await _reply_msg(update, context, text, parse_mode="Markdown", reply_markup=kb)

    except Exception as e:
        logger.exception("ringkasan failed")
        await _reply_msg(update, context, f"Gagal ambil ringkasan: {e}")

async def cmd_top_produk(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not _is_allowed(update):
        await _reply_msg(update, context, "Unauthorized")
        return
    try:
        now = _now_wib()
        start_ms = _start_of_day_ms(now)
        q = f"select=items,status,_creationTime&status=eq.completed&_creationTime=gte.{start_ms}"
        orders = await _fetch("pos_orders", q)

        cnt = Counter()
        omzet = Counter()
        for o in orders:
            for item in (o.get("items") or []):
                name = (item.get("productName") or "Unknown").strip()
                qty = float(item.get("quantity") or 0)
                price = float(item.get("price") or 0)
                cnt[name] += qty
                omzet[name] += qty * price

        top = cnt.most_common(10)
        if not top:
            await _reply_msg(update, context, "Belum ada order selesai hari ini.")
            return

        total_pcs = sum(q for _, q in top)
        total_omzet = sum(omzet[n] for n, _ in top)
        
        lines = [f"🔥 {len(top)} produk terlaris — {total_pcs:.0f} pcs, Rp {total_omzet:,.0f}"]
        lines.append("")
        for i, (n, q) in enumerate(top, 1):
            lines.append(f"{i}. {n} — {q:.0f} pcs — Rp{omzet[n]:,.0f}")
        lines.append("")
        lines.append("📋 Mau laporan PDF/Excel? Minta ke admin atau download dashboard.")
        
        await _reply_msg(update, context, "\n".join(lines), parse_mode="Markdown", reply_markup=_reply_keyboard())
    except Exception as e:
        logger.exception("top_produk failed")
        await _reply_msg(update, context, f"Gagal ambil top produk: {e}")


async def cmd_stok_menipis(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not _is_allowed(update):
        await _reply_msg(update, context, "Unauthorized")
        return
    try:
        rows = await _fetch("pos_inventory", "select=ingredientName,quantity,lowStockThreshold,unit")
        alerts = []
        for r in rows:
            q = float(r.get("quantity") or 0)
            t = float(r.get("lowStockThreshold") or 0)
            if q <= t:
                alerts.append((r.get("ingredientName") or "Unknown", q, t, r.get("unit") or "unit"))

        if not alerts:
            await _reply_msg(update, context, "✅ Tidak ada stok menipis.", reply_markup=_reply_keyboard())
            return

        alerts.sort(key=lambda x: (x[1] - x[2]))
        kritis = sum(1 for _, q, _, _ in alerts if q <= 0)
        
        lines = [f"⚠️ {len(alerts)} bahan stok menipis — {kritis} di antaranya kritis (stok 0)"]
        lines.append("")
        for n, q, t, u in alerts[:20]:
            mark = "🔴" if q <= 0 else "🟡"
            lines.append(f"{mark} {n} — stok {q:g}/{t:g} {u}")
        lines.append("")
        lines.append("💡 Butuh restok? @YumiPurchasingBot bisa bantu order.\n📋 Mau laporan PDF/Excel? Minta ke admin.")
        
        await _reply_msg(update, context, "\n".join(lines), parse_mode="Markdown", reply_markup=_reply_keyboard())
    except Exception as e:
        logger.exception("stok_menipis failed")
        await _reply_msg(update, context, f"Gagal cek stok: {e}")


async def cmd_absen_hari_ini(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not _is_allowed(update):
        await _reply_msg(update, context, "Unauthorized")
        return
    try:
        now = _now_wib()
        start_ms = _start_of_day_ms(now)
        q = f"select=userName,type,timestamp,shiftName&timestamp=gte.{start_ms}&order=timestamp.desc"
        rows = await _fetch("pos_attendance_logs", q)
        if not rows:
            await _reply_msg(update, context, "Belum ada absensi hari ini.", reply_markup=_reply_keyboard())
            return

        # Count check-ins per person
        staff_log = {}
        for r in rows:
            name = r.get('userName', '?')
            ts = int(r.get('timestamp') or 0)
            dt = datetime.fromtimestamp(ts / 1000, tz=WIB).strftime("%H:%M")
            tp = "check_in" if r.get('type') == "check_in" else "check_out"
            if name not in staff_log:
                staff_log[name] = {"in": "-", "out": "-", "shift": "-"}
            if tp == "check_in":
                staff_log[name]["in"] = dt
            else:
                staff_log[name]["out"] = dt
            if r.get('shiftName'):
                staff_log[name]["shift"] = r.get('shiftName', '-')

        total = len(rows)
        hadir = sum(1 for s in staff_log.values() if s["in"] != "-")
        
        lines = [f"🕒 {hadir} dari {len(staff_log)} staff sudah absen hari ini"]
        lines.append("")
        for name, log in sorted(staff_log.items()):
            icon = "✅" if log["in"] != "-" else "⏳"
            lines.append(f"{icon} {name} — Masuk {log['in']} | Keluar {log['out']} | {log['shift']}")
        lines.append("")
        lines.append("📋 Mau laporan PDF/Excel absensi? Minta ke admin atau download web.")
        
        await _reply_msg(update, context, "\n".join(lines), parse_mode="Markdown", reply_markup=_reply_keyboard())
    except Exception as e:
        logger.exception("absen_hari_ini failed")
        await _reply_msg(update, context, f"Gagal ambil absensi: {e}")


async def cmd_booking_aktif(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not _is_allowed(update):
        await _reply_msg(update, context, "Unauthorized")
        return
    try:
        q = "select=bookingCode,customerName,bookingDate,guestCount,tableCount,paymentStatus,bookingStatus,totalAmount&order=_creationTime.desc&limit=20"
        rows = await _fetch("pos_booking_orders", q)
        active = [r for r in rows if str(r.get("bookingStatus", "")).lower() in {"confirmed", "pending", "booked"}]

        if not active:
            await _reply_msg(update, context, "Tidak ada booking aktif hari ini.", reply_markup=_reply_keyboard())
            return

        total_guest = sum(int(r.get('guestCount') or 0) for r in active)
        total_amount = sum(float(r.get('totalAmount') or 0) for r in active)
        
        lines = [f"📅 {len(active)} booking aktif — {total_guest} tamu, total Rp {total_amount:,.0f}"]
        lines.append("")
        for r in active[:10]:
            kode = r.get('bookingCode','-') or '-'
            nama = r.get('customerName','-') or '-'
            tgl = r.get('bookingDate','-') or '-'
            guest = int(r.get('guestCount') or 0)
            status = r.get('bookingStatus','-') or '-'
            total = float(r.get('totalAmount') or 0)
            lines.append(f"• {kode} — {nama} — {tgl} — {guest} org — {status} — Rp{total:,.0f}")
        lines.append("")
        lines.append("📋 Mau laporan booking PDF/Excel? Minta ke admin.")
        
        await _reply_msg(update, context, "\n".join(lines), parse_mode="Markdown", reply_markup=_reply_keyboard())
    except Exception as e:
        logger.exception("booking_aktif failed")
        await _reply_msg(update, context, f"Gagal ambil booking: {e}")


async def cmd_briefing_hari_ini(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not _is_allowed(update):
        await _reply_msg(update, context, "Unauthorized")
        return
    try:
        await context.bot.send_chat_action(chat_id=update.effective_chat.id, action="typing")
        date_str = _today_wib_str()
        url = f"{SUPABASE_EDGE_URL}/functions/v1/yumi-ai"
        payload = {
            "action": "generateBusinessBriefing",
            "localHour": _now_wib().hour,
            "context": f"Tanggal briefing: {date_str}",
        }
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                url,
                headers={**_headers(), "Content-Type": "application/json"},
                json=payload,
            )
            resp.raise_for_status()
            data = resp.json()
            briefing = str(data.get("content") or "Briefing belum tersedia.")

        await _reply_msg(update, context, briefing, parse_mode="HTML", reply_markup=_reply_keyboard())
    except Exception as e:
        logger.exception("briefing_hari_ini failed")
        await _reply_msg(update, context, f"Gagal generate briefing: {e}")


# ===================================================================

async def cmd_purchaselog(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not _is_allowed(update):
        await _reply_msg(update, context, "Unauthorized")
        return
    try:
        await context.bot.send_chat_action(chat_id=update.effective_chat.id, action="typing")
        logs = await _fetch("pos_purchase_logs", "select=*&order=created_at.desc&limit=10")
        if not logs:
            await _reply_msg(update, context, "Belum ada riwayat pembelian.", reply_markup=_reply_keyboard())
            return
        lines = ["RIWAYAT PEMBELIAN (10 terakhir)", ""]
        for l in logs:
            name = str(l.get("ingredient_name", "?"))[:30]
            qty = float(l.get("quantity_added") or 0)
            unit = str(l.get("unit", ""))
            cost = float(l.get("total_cost") or 0)
            merchant = str(l.get("merchant") or "")[:20]
            dt = str(l.get("created_at", ""))[:16].replace("T", " ")
            lines.append(f"{dt}  {merchant}")
            lines.append(f"  +{qty:g} {unit} {name}  Rp {cost:,.0f}")
            lines.append("")
        msg = "\n".join(lines)
        if len(msg) <= 4000:
            await _reply_msg(update, context, msg, reply_markup=_reply_keyboard())
        else:
            for chunk in [msg[i:i+4000] for i in range(0, len(msg), 4000)]:
                await _reply_msg(update, context, chunk)
    except Exception as e:
        logger.exception("purchaselog failed")
        await _reply_msg(update, context, f"Gagal: {e}", reply_markup=_reply_keyboard())


async def cmd_marketlist(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not _is_allowed(update):
        await _reply_msg(update, context, "Unauthorized")
        return
    try:
        await context.bot.send_chat_action(chat_id=update.effective_chat.id, action="typing")
        text = await generate_marketlist(_fetch)
        await _reply_msg(update, context, text, reply_markup=_reply_keyboard())
    except Exception as e:
        logger.exception("marketlist failed")
        await _reply_msg(update, context, f"Gagal ambil marketlist: {e}")

# Inline Keyboard Callback Handler
# ===================================================================

async def on_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    data = query.data

    handlers = {
        "ringkasan": cmd_ringkasan_hari_ini,
        "top": cmd_top_produk,
        "stok": cmd_stok_menipis,
        "absen": cmd_absen_hari_ini,
        "booking": cmd_booking_aktif,
        "briefing": cmd_briefing_hari_ini,
        "purchaselog": cmd_purchaselog,
        "marketlist": cmd_marketlist,
        "export_jadwal": cmd_export_jadwal,
        "status_saya": cmd_status_saya,
        "help": cmd_help,
    }

    # Period filter callbacks
    if data.startswith("ringkasan_period:"):
        await cmd_ringkasan_hari_ini(update, context)
        return

    # OCR action callbacks (ocr_income_12345_MerchantName)
    if data.startswith("ocr_"):
        await _handle_ocr_action(update, context)
        return

    handler_fn = handlers.get(data)
    if handler_fn:
        # _reply_msg internally checks callback_query.message when update.message is None
        await handler_fn(update, context)
    elif data == "import_jadwal":
        await query.edit_message_text(
            "📥 <b>Import Jadwal</b>\n\n"
            "Kirim file <b>Excel (.xlsx)</b> jadwal shift ke chat ini.\n\n"
            "Format yang didukung:\n"
            "• Baris header: <code>MINGGU KE | HARI | TANGGAL | Nama Staff | ...</code>\n"
            "• Kolom staff: PAGI (07.30 - 14.30), SORE (13.00 - 21.00), OFF, GENERAL\n\n"
            "Bot akan otomatis:\n"
            "1️⃣ Parse file\n"
            "2️⃣ Cocokkan staff ke database\n"
            "3️⃣ Daftarkan staff baru jika belum ada\n"
            "4️⃣ Import semua jadwal\n\n"
            "Contoh: Kirim file <b>Jadwal Juni 2026.xlsx</b>",
            reply_markup=_reply_keyboard(),
            parse_mode="HTML",
        )
    else:
        await query.edit_message_text("Menu tidak dikenal.", reply_markup=_reply_keyboard())


# ===================================================================
# Export Jadwal Command
# ===================================================================

async def cmd_export_jadwal(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Export schedule as Excel file. Usage: /export_jadwal [bulan] [tahun]"""
    if not _is_allowed(update):
        await _reply_msg(update, context, "Unauthorized")
        return

    now = datetime.now(WIB)
    bulan = now.month
    tahun = now.year

    args = context.args
    if args:
        try:
            if len(args) >= 1:
                bulan = int(args[0])
            if len(args) >= 2:
                tahun = int(args[1])
        except ValueError:
            await _reply_msg(update, context,
                "Format: /export_jadwal <bulan> <tahun>\n"
                "Contoh: /export_jadwal 6 2026\n"
                "Kosongkan untuk bulan ini."
            )
            return

    if bulan < 1 or bulan > 12 or tahun < 2000 or tahun > 2100:
        await _reply_msg(update, context, "Bulan (1-12) atau tahun tidak valid.")
        return

    await context.bot.send_chat_action(chat_id=update.effective_chat.id, action="typing")

    try:
        schedules = await fetch_schedules(httpx, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, bulan, tahun)

        if not schedules:
            month_name = _month_name(bulan)
            await _reply_msg(update, context,
                f"Tidak ada jadwal untuk {month_name} {tahun}.\n\n"
                f"📎 Kirim file Excel jadwal untuk import, atau coba bulan lain."
            )
            return

        excel_bytes = generate_roster_excel(schedules, bulan, tahun)
        month_name = _month_name(bulan)

        await context.bot.send_document(
            chat_id=update.effective_chat.id,
            document=io.BytesIO(excel_bytes),
            filename=f"JADWAL {month_name.upper()} {tahun}.xlsx",
            caption=f"📅 Jadwal {month_name} {tahun}\n"
                    f"• {len(set(s['userName'] for s in schedules))} staff\n"
                    f"• {len(set(s['date'] for s in schedules))} hari\n"
                    f"• {len(schedules)} entri jadwal",
        )

    except Exception as e:
        logger.error("Export jadwal error: %s", e, exc_info=True)
        await _reply_msg(update, context,
            f"❌ Gagal export jadwal: {str(e)}\n"
            "Coba lagi atau hubungi admin."
        )


# ===================================================================
# Photo Handler (OCR Receipt Scan)
# ===================================================================

async def on_photo(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle photo upload — OCR receipt via SumoPod vision API, save to DB, show summary."""
    # Di grup: silent ignore jika tidak @mention atau reply ke bot
    chat = update.effective_chat
    if chat and chat.type in ("group", "supergroup"):
        msg = update.effective_message
        if msg:
            mentioned = False
            if msg.reply_to_message and msg.reply_to_message.from_user and msg.reply_to_message.from_user.is_bot:
                mentioned = True
            if not mentioned:
                message_text = msg.caption or ""
                if msg.entities:
                    for ent in msg.entities:
                        if ent.type == "mention":
                            mentioned_name = message_text[ent.offset:ent.offset + ent.length].lower()
                            bot_username = context.bot.username if context.bot else None
                            if bot_username and f"@{bot_username.lower()}" == mentioned_name:
                                mentioned = True
                                break
                            if "@yummeaibot" in message_text.lower():
                                mentioned = True
                                break
                if not mentioned and "@yummeaibot" in message_text.lower():
                    mentioned = True
            if not mentioned:
                return
    else:
        # DM: periksa otorisasi
        if not _is_allowed(update):
            await _reply_msg(update, context, "Unauthorized")
            return

    try:
        await context.bot.send_chat_action(chat_id=update.effective_chat.id, action="typing")

        # Get the largest photo
        photo = update.message.photo[-1]
        file = await context.bot.get_file(photo.file_id)
        image_bytes = await file.download_as_bytearray()
        image_bytes = bytes(image_bytes)

        # Compress to base64
        compressed_uri = _compress_image(image_bytes)
        logger.info("Photo compressed: %d → %d bytes", len(image_bytes), len(compressed_uri))

        # Step 1: Call SumoPod vision for structured JSON extraction
        logger.info("Calling SumoPod vision for OCR...")
        ocr_result = await _sumopod_vision_json(compressed_uri)

        if not ocr_result.get("success"):
            error_msg = ocr_result.get("error", "Unknown OCR error")
            logger.error("SumoPod vision failed: %s", error_msg)
            await _reply_msg(update, context,
                f"❌ Gagal OCR: {error_msg}\n\nCoba kirim ulang dengan gambar yang lebih jelas.",
                reply_markup=_reply_keyboard(),
            )
            return

        ocr_data = ocr_result["data"]
        logger.info("OCR successful: merchant=%s, total=%.2f, items=%d",
                    ocr_data.get("name", "Unknown"),
                    ocr_data.get("total", 0),
                    len(ocr_data.get("items", [])))

        # Step 2: Save to database
        logger.info("Saving OCR receipt to database...")
        db_result = await _save_ocr_receipt_to_db(ocr_data)

        # Step 3: Build formatted summary
        merchant = ocr_data.get("name", "Unknown")
        total = ocr_data.get("total", 0)
        date = ocr_data.get("date", "")
        time_val = ocr_data.get("time", "")
        items = ocr_data.get("items", [])
        payment_method = ocr_data.get("paymentMethod", "")
        receipt_number = ocr_data.get("receiptNumber", "")

        # Format summary
        summary_lines = [
            "<b>🧾 RINGKASAN STRUK</b>",
            f"<b>🏪 Merchant:</b> {merchant}",
        ]

        if date:
            summary_lines.append(f"<b>📅 Tanggal:</b> {date}")
        if time_val:
            summary_lines.append(f"<b>⏰ Waktu:</b> {time_val}")
        if receipt_number:
            summary_lines.append(f"<b>🔢 No. Transaksi:</b> {receipt_number}")

        summary_lines.append("")
        summary_lines.append("<b>🛒 RINCIAN BELANJA:</b>")

        for i, item in enumerate(items, 1):
            item_name = item.get("name", "Unknown")
            item_qty = item.get("qty", 1)
            item_subtotal = item.get("subtotal", 0)
            item_unit = item.get("unit", "pcs")
            summary_lines.append(
                f"{i}. <b>{item_name}</b> — Qty: {item_qty} {item_unit} • Rp{item_subtotal:,.0f}"
            )

        summary_lines.append("")
        summary_lines.append(f"<b>💰 TOTAL: Rp{total:,.0f}</b>")

        if payment_method:
            summary_lines.append(f"<b>💳 Pembayaran:</b> {payment_method}")

        # Database save status
        if db_result.get("success"):
            summary_lines.append("")
            summary_lines.append(f"✅ <b>Berhasil disimpan ke database!</b>")
            summary_lines.append(f"   Kategori: {ocr_data.get('category', 'belanja_stok')}")
            summary_lines.append(f"   Items: {len(items)} produk")
        else:
            summary_lines.append("")
            summary_lines.append(f"⚠️ <b>Gagal menyimpan ke database:</b> {db_result.get('error', 'Unknown')}")
            summary_lines.append("   Data OCR tetap tersedia di atas.")

        summary = "\n".join(summary_lines)

        # Send summary
        await _reply_msg(update, context, summary, parse_mode="HTML",
                         reply_markup=_reply_keyboard())

    except Exception as e:
        logger.exception("Photo handling failed")
        await _reply_msg(update, context,
            f"❌ Gagal memproses gambar: {e}\n\nCoba kirim ulang atau gunakan teks.",
            reply_markup=_reply_keyboard(),
        )



# ===================================================================
# Free Text Handler (with rich context + session)
# ===================================================================

async def on_text(update: Update, context: ContextTypes.DEFAULT_TYPE):
    bot_username = context.bot.username if context.bot else None

    # Di grup: silent ignore jika tidak @mention atau reply ke bot
    chat = update.effective_chat
    if chat and chat.type in ("group", "supergroup"):
        msg = update.effective_message
        if not msg:
            return
        mentioned = False
        if msg.reply_to_message and msg.reply_to_message.from_user and msg.reply_to_message.from_user.is_bot:
            mentioned = True
        if not mentioned:
            message_text = msg.text or msg.caption or ""
            # Cek entity mention untuk bot username
            if msg.entities:
                for ent in msg.entities:
                    if ent.type == "mention":
                        mentioned_name = message_text[ent.offset:ent.offset + ent.length].lower()
                        if bot_username and f"@{bot_username.lower()}" == mentioned_name:
                            mentioned = True
                            break
                        if "@yummeaibot" in message_text.lower():
                            mentioned = True
                            break
            # Fallback string check
            if not mentioned and "@yummeaibot" in message_text.lower():
                mentioned = True
        if not mentioned:
            return
    else:
        # DM: periksa otorisasi
        if not _is_allowed(update, bot_username):
            await _reply_msg(update, context, "Unauthorized")
            return

    text = (update.message.text or "").strip()
    text_lower = text.lower()

    # Keyword routing to specific commands (fast path)
    keyword_map = [
        (["omzet", "kpi", "penjualan", "revenue", "pendapatan", "transaksi", "pemasukan", "penghasilan"], cmd_ringkasan_hari_ini),
        (["top produk", "terlaris", "best seller", "paling laku"], cmd_top_produk),
        (["stok", "menipis", "habis", "inventory", "inventori"], cmd_stok_menipis),
        (["absen", "attendance", "clock in", "clock out", "absensi"], cmd_absen_hari_ini),
        (["booking", "reservasi"], cmd_booking_aktif),
        (["marketlist", "belanja", "daftar belanja", "shopping list"], cmd_marketlist),
        (["briefing", "ringkasan bisnis", "insight hari ini", "laporan"], cmd_briefing_hari_ini),
    ]

    for keywords, handler in keyword_map:
        if any(k in text_lower for k in keywords):
            await handler(update, context)
            return

    # Google Sheets link → import jadwal
    sheet_id = is_google_sheets_link(text)
    if sheet_id:
        await context.bot.send_chat_action(chat_id=update.effective_chat.id, action="typing")
        try:
            await _reply_msg(update, context,
                f"📥 Mendownload Google Sheet...\n"
                f"🔗 ID: {sheet_id}"
            )
            file_bytes = await download_google_sheet(sheet_id)
            parsed = parse_excel(file_bytes, f"google_sheet_{sheet_id}.xlsx")

            if "error" in parsed:
                await _reply_msg(update, context,
                    f"❌ Gagal parse sheet: {parsed['error']}\n\n"
                    "Pastikan format sheet:\n"
                    "• Baris header: MINGGU KE | HARI | TANGGAL | <nama staff> | ...\n"
                    "• Kolom staff berisi shift: PAGI (07.30 - 14.30), SORE, OFF, GENERAL"
                )
                return

            summary = parsed.get("summary", {})
            await _reply_msg(update, context,
                f"📋 Memproses jadwal dari Google Sheet...\n"
                f"• {summary.get('uniqueStaff', 0)} staff\n"
                f"• {summary.get('uniqueDates', 0)} hari ({summary.get('dateRange', '')})\n"
                f"• {summary.get('totalRows', 0)} entri jadwal\n"
                f"⏳ Mengimport ke database..."
            )

            result = await call_import_schedule(httpx, SUPABASE_URL, SUPABASE_KEY, parsed)

            if result.get("error"):
                await _reply_msg(update, context,
                    f"❌ Gagal import: {result['error']}"
                )
                return

            s = result.get("summary", {})
            msg_parts = [
                f"✅ <b>Import jadwal selesai!</b>",
                f"",
                f"📊 <b>Ringkasan:</b>",
                f"• {s.get('insertedRows', 0)} jadwal berhasil diimport",
                f"• {s.get('uniqueDates', 0)} hari kerja",
                f"• {s.get('totalRows', 0)} total entri diproses",
            ]
            if s.get('skippedRows', 0) > 0:
                msg_parts.append(f"⚠️ {s['skippedRows']} entri dilewati (staff tidak dikenal)")
            await _reply_msg(update, context, "\n".join(msg_parts))
        except Exception as e:
            logger.error("Google Sheets import error: %s", e, exc_info=True)
            await _reply_msg(update, context,
                f"❌ Gagal download/import Google Sheet: {str(e)}"
            )
        return

    # Free-text AI chat with rich context
    try:
        await context.bot.send_chat_action(chat_id=update.effective_chat.id, action="typing")
        user_id = update.effective_user.id
        context_hint = await _gather_context()
        context_hint += (
            "\nKamu adalah Yumi General Manager Agents untuk ekosistem Djiwa Tentram. "
            "Jawab dalam Bahasa Indonesia, ringkas, actionable, dengan tone GM yang berwibawa. "
            "Jika user tanya data, berikan angka dan insight. "
            "Jika user minta action spesifik di luar kemampuanmu (buat order, catat transaksi, dll), "
            "jelaskan bahwa fitur itu tersedia di web app dan arahkan ke bot yang tepat jika relevan. "
            "Kamu adalah level tertinggi — tahu kapan harus handle sendiri dan kapan delegasi."
        )

        reply = await _ask_yumi_ai(
            user_id=user_id,
            message=text,
            context_hint=context_hint,
            action="yumiChat",
        )

        # Split long messages for Telegram (4096 char limit)
        if len(reply) <= 4000:
            await _reply_msg(update, context, reply, parse_mode="HTML", reply_markup=_reply_keyboard())
        else:
            chunks = [reply[i:i + 4000] for i in range(0, len(reply), 4000)]
            for i, chunk in enumerate(chunks):
                await _reply_msg(update, context, chunk, parse_mode="HTML",
                                 reply_markup=_reply_keyboard() if i == len(chunks) - 1 else None)

    except Exception as e:
        logger.exception("free-text yumi-ai failed")
        await _reply_msg(update, context, 
            "Aku siap bantu! 📌\n"
            "Coba: omzet hari ini, top produk, stok menipis, atau kirim foto struk.\n"
            f"(error: {e})",
            reply_markup=_reply_keyboard(),
        )


# ===================================================================
# Broadcast: Yumi GM Agents → Channel / Grup
# ===================================================================

async def cmd_broadcast(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Send announcement to all registered broadcast targets (/broadcast <pesan>)."""
    if not _is_allowed(update):
        await _reply_msg(update, context, "Unauthorized")
        return
    text = (update.message.text or "").strip()
    parts = text.split(maxsplit=1)
    if len(parts) < 2 or not parts[1].strip():
        target_list = "\n".join(f"• {name}" for name in ALL_BROADCAST_TARGETS)
        await _reply_msg(update, context,
            "📢 *Broadcast - Yumi General Manager Agents*\n\n"
            "Kirim pengumuman ke semua channel & grup:\n"
            "`/broadcast <pesan>` — ke semua target\n"
            "`/sebarkan channel <pesan>` — ke channel 📣 Djiwa Tentram\n"
            "`/sebarkan transaksi <pesan>` — ke grup Transaksi\n"
            f"\nTarget tersedia:\n{target_list}",
            parse_mode="Markdown",
        )
        return
    message = parts[1]
    target_ids = list(ALL_BROADCAST_TARGETS.values())
    await _reply_msg(update, context, "📡 Mengirim broadcast...")
    results = await _broadcast_message(
        context.application if hasattr(context, 'application') else update.get_bot(),
        message,
        target_ids,
    )
    success = sum(1 for v in results.values() if v)
    total = len(results)
    await _reply_msg(update, context, f"✅ Broadcast selesai: {success}/{total} terkirim.")


async def cmd_sebarkan(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Send to specific target (/sebarkan <target> <pesan>)."""
    if not _is_allowed(update):
        await _reply_msg(update, context, "Unauthorized")
        return
    text = (update.message.text or "").strip()
    parts = text.split(maxsplit=2)
    if len(parts) < 3:
        target_list = "\n".join(f"• {name}" for name in ALL_BROADCAST_TARGETS)
        await _reply_msg(update, context,
            "📢 *Sebarkan - Yumi General Manager Agents*\n\n"
            "Gunakan: `/sebarkan <target> <pesan>`\n"
            f"Target: channel, transaksi, report\n"
            f"\nAtau `/broadcast <pesan>` untuk semua target.",
            parse_mode="Markdown",
        )
        return
    target_key = parts[1].lower().strip()
    message = parts[2]
    
    # Resolve target
    cid = ALL_BROADCAST_TARGETS.get(target_key)
    if cid is None:
        await _reply_msg(update, context,
            f"❌ Target \"{target_key}\" tidak dikenal.\n"
            f"Pilihan: {', '.join(ALL_BROADCAST_TARGETS.keys())}",
        )
        return
    
    bot_instance = context.application.bot if hasattr(context, 'application') else update.get_bot()
    try:
        await bot_instance.send_message(chat_id=cid, text=message)
        await _reply_msg(update, context, f"✅ Pesan terkirim ke **{target_key}**", parse_mode="Markdown")
    except Exception as e:
        await _reply_msg(update, context, f"❌ Gagal kirim ke {target_key}: {e}")


# ===================================================================
# Auto-Report: Real-time Transaction Monitor + Daily Summary
# ===================================================================

async def _find_shift_at_time(timestamp_ms: int) -> dict:
    """Find active shift at a given timestamp. Returns {cashier_name, team_members, shift_name} or empty."""
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
                continue  # shift already closed before this time
            return {
                "cashier_name": s.get("cashier_name") or "",
                "team_members": s.get("team_members") or "",
                "shift_name": s.get("shift_name") or "",
            }
    except Exception as e:
        logger.warning("find_shift_at_time failed: %s", e)
    return {}


async def _send_to_group(app, text: str, photo_url: str = None):
    """Send a message or photo to the attendance report group."""
    try:
        if photo_url:
            # Download photo bytes and send as file to avoid URL accessibility issues
            try:
                async with httpx.AsyncClient(timeout=15) as client:
                    resp = await client.get(photo_url)
                    if resp.status_code == 200:
                        await app.bot.send_photo(
                            chat_id=_ATTENDANCE_REPORT_CHAT_ID,
                            photo=resp.content,
                            caption=text,
                        )
                    else:
                        await app.bot.send_message(chat_id=_ATTENDANCE_REPORT_CHAT_ID, text=text)
            except Exception:
                await app.bot.send_message(chat_id=_ATTENDANCE_REPORT_CHAT_ID, text=text)
        else:
            await app.bot.send_message(chat_id=_ATTENDANCE_REPORT_CHAT_ID, text=text)
        logger.info("Sent attendance notification to group %s", _ATTENDANCE_REPORT_CHAT_ID)
    except Exception as e:
        logger.error("send_attendance_report failed: %s", e)


async def _broadcast_message(app, text: str, target_ids: list[int]) -> dict[int, bool]:
    """Send a message to multiple groups/channels. Returns {chat_id: success}."""
    results = {}
    for cid in target_ids:
        try:
            await app.bot.send_message(chat_id=cid, text=text)
            results[cid] = True
            logger.info("Broadcast sent to %s", cid)
        except Exception as e:
            results[cid] = False
            logger.error("Broadcast to %s failed: %s", cid, e)
    return results


def _format_time_ms(ts_ms, fmt="%d/%m %H:%M"):
    return datetime.fromtimestamp(ts_ms / 1000, tz=WIB).strftime(fmt)


def _format_time_hm(ts_ms) -> str:
    """Format timestamp to HH:MM only."""
    return datetime.fromtimestamp(ts_ms / 1000, tz=WIB).strftime("%H:%M")


# ===================================================================
# Attendance Monitoring
# ===================================================================

async def _load_shift_schedules():
    """Cache shift schedules from site settings."""
    global _SHIFT_SCHEDULES, _SHIFT_SCHEDULES_LOADED
    if _SHIFT_SCHEDULES_LOADED:
        return
    try:
        rows = await _fetch("pos_site_settings", "select=raw&limit=1")
        if rows:
            raw = rows[0].get("raw") or {}
            if isinstance(raw, str):
                raw = json.loads(raw)
            schedules = raw.get("shiftSettings", {}).get("shiftSchedules", [])
            _SHIFT_SCHEDULES = list(schedules)
        _SHIFT_SCHEDULES_LOADED = True
        logger.info("Shift schedules loaded: %d schedules", len(_SHIFT_SCHEDULES))
    except Exception as e:
        logger.warning("load_shift_schedules failed: %s", e)


async def _build_role_rate_map():
    """Cache role baseShiftRate from pos_staff_roles."""
    global _ROLE_RATES, _ROLE_RATES_LOADED
    if _ROLE_RATES_LOADED:
        return
    try:
        roles = await _fetch("pos_staff_roles", "select=name,raw&limit=50")
        for r in roles:
            name = (r.get("name") or "").upper()
            raw = r.get("raw") or {}
            if isinstance(raw, str):
                raw = json.loads(raw)
            rate = float(raw.get("baseShiftRate") or 0)
            _ROLE_RATES[name] = rate
        _ROLE_RATES_LOADED = True
        logger.info("Role rate map loaded: %d roles", len(_ROLE_RATES))
    except Exception as e:
        logger.warning("build_role_rate_map failed: %s", e)


def _get_shift_schedule(shift_name: str) -> dict | None:
    """Match shift name to schedule. Returns {openTime, closeTime, name} or None."""
    name_lower = shift_name.strip().lower()
    for s in _SHIFT_SCHEDULES:
        s_name = (s.get("name") or "").strip().lower()
        if s_name == name_lower:
            return s
    return None


def _parse_time_to_minutes(t_str: str) -> int:
    parts = t_str.strip().split(":")
    return int(parts[0]) * 60 + int(parts[1])


def _minutes_to_human(m: int) -> str:
    if m <= 0:
        return "0 menit"
    hours = m // 60
    mins = m % 60
    if hours > 0 and mins > 0:
        return f"{hours} jam {mins} menit"
    elif hours > 0:
        return f"{hours} jam"
    else:
        return f"{mins} menit"


def _get_role_rate(role_name: str) -> float:
    key = role_name.strip().upper()
    return _ROLE_RATES.get(key, 0.0)


async def _check_new_attendance(app):
    """Poll for new attendance logs and report to report group."""
    global _last_attendance_id, _reported_attendance_ids

    # Ensure caches loaded
    if not _SHIFT_SCHEDULES_LOADED:
        await _load_shift_schedules()
    if not _ROLE_RATES_LOADED:
        await _build_role_rate_map()

    # Periodic dedup cleanup
    if len(_reported_attendance_ids) > 500:
        _reported_attendance_ids.clear()

    try:
        now_ms = int(_now_wib().timestamp() * 1000)
        # Look back 5 minutes for fresh entries
        lookback_ms = now_ms - 300_000

        logs = await _fetch(
            "pos_attendance_logs",
            f"select=_id,type,timestamp,userName,roleName,shiftName,shiftOpenTimeSnapshot,userId,notes"
            f"&creationTime=gt.{lookback_ms}"
            f"&order=creationTime.asc&limit=20",
        )

        for log in logs:
            log_id = log.get("_id") or ""
            if not log_id or log_id in _reported_attendance_ids:
                continue

            log_type = log.get("type") or ""
            if log_type not in ("check_in", "check_out"):
                _reported_attendance_ids.add(log_id)
                continue

            ts = int(float(log.get("timestamp") or 0))
            if ts <= 0:
                continue

            user_name = log.get("userName") or "?"
            role_name = log.get("roleName") or ""
            shift_name = log.get("shiftName") or ""
            user_id = log.get("userId") or ""

            date_str = _format_time_ms(ts, "%d/%m")
            time_str = _format_time_hm(ts)

            # ═══ CHECK_IN ═══
            if log_type == "check_in":
                # Hapus prefix "Shift " jika sudah ada di shift_name
                shift_label = shift_name.removeprefix("Shift ").removeprefix("shift ") if shift_name else ""

                lines = [
                    f"🚶\u200d➡️ Absen Masuk — {date_str} {time_str}",
                    f"👤 {user_name}" + (f" • {role_name}" if role_name else ""),
                    f"🕐 {time_str} WIB",
                ]

                # ═══ CEK JADWAL INDIVIDU ═══
                # Cross-check dengan pos_attendance_schedules utk deteksi salah jadwal
                try:
                    today_str = _today_wib_str()
                    sched_data = await _fetch(
                        "pos_attendance_schedules",
                        f"select=shiftName,startTime,endTime&userId=eq.{user_id}&date=eq.{today_str}&limit=1",
                    )
                    if sched_data and len(sched_data) > 0:
                        sched = sched_data[0]
                        sched_shift = (sched.get("shiftName") or "").strip().upper()
                        sched_start = (sched.get("startTime") or "")[:5] if sched.get("startTime") else ""
                        sched_end = (sched.get("endTime") or "")[:5] if sched.get("endTime") else ""
                        sched_label = sched_shift
                        if sched_start and sched_end:
                            sched_label = f"{sched_shift} ({sched_start}-{sched_end})"

                        # Bandingkan jadwal dengan shift yg terdeteksi
                        detected_upper = shift_name.upper().replace("SHIFT ", "").strip() if shift_name else ""
                        sched_upper = sched_shift.replace("SHIFT ", "").strip()

                        if sched_shift == "OFF":
                            # Hari ini libur — seharusnya tidak masuk
                            lines.append(f"❌ KAMU SALAH JADWAL! Hari ini jadwalmu: {sched_label}")
                            shift_name = None  # Skip lateness calculation
                        elif detected_upper and sched_upper and detected_upper != sched_upper:
                            # Cek grace period: absen dalam 1 jam sebelum shift dimulai?
                            early_for_shift = False
                            if sched_start:
                                try:
                                    sh, sm = sched_start.split(":")
                                    sched_start_min = int(sh) * 60 + int(sm)
                                    dt_gp = datetime.fromtimestamp(ts / 1000, tz=WIB)
                                    check_min_gp = dt_gp.hour * 60 + dt_gp.minute
                                    early_min = sched_start_min - check_min_gp
                                    if 0 <= early_min <= 60:
                                        early_for_shift = True
                                except Exception:
                                    pass
                            if early_for_shift:
                                # Early check-in for scheduled shift — override shift info
                                # Use bare shift name (e.g. "Sore") so _get_shift_schedule() matches cache
                                sched_bare = sched.get("shiftName", "").strip()
                                shift_name = None  # Skip duplicate handling below
                                shift_label = sched_bare
                                sched_obj = _get_shift_schedule(sched_bare)
                                if sched_obj:
                                    open_t = sched_obj.get("openTime", "")
                                    close_t = sched_obj.get("closeTime", "")
                                    lines.append(f"📌 Shift {sched_bare} ({open_t} - {close_t})")
                                    lines.append(f"✅ Masuk awal — shift dimulai {sched_start} WIB")
                                else:
                                    lines.append(f"✅ Masuk awal untuk shift {sched_label}")
                            else:
                                # Cek apakah user telat untuk jadwal shift yg sudah dimulai
                                late_for_scheduled = False
                                if sched_start and sched_end:
                                    try:
                                        sh, sm = sched_start.split(":")
                                        sched_start_min = int(sh) * 60 + int(sm)
                                        dt_late = datetime.fromtimestamp(ts / 1000, tz=WIB)
                                        check_min_late = dt_late.hour * 60 + dt_late.minute
                                        late_min = check_min_late - sched_start_min
                                        if late_min > 0:
                                            # Absen setelah shift dimulai — telat untuk jadwal
                                            late_for_scheduled = True
                                    except Exception:
                                        pass
                                if late_for_scheduled:
                                    # Late check-in for scheduled shift — pakai jadwal asli, hitung keterlambatan
                                    sched_bare = sched.get("shiftName", "").strip()
                                    shift_name = sched_bare  # Biar downstream hitung lateness
                                    shift_label = sched_bare
                                else:
                                    lines.append(f"⚠️ KAMU SALAH JADWAL! Jadwalmu: {sched_label}")
                                    # Skip lateness calculation — jangan hitung denda dari shift yg salah
                                    shift_name = None
                except Exception:
                    pass  # Jangan sampai query error menggagalkan notifikasi

                sched = _get_shift_schedule(shift_name) if shift_name else None
                if sched:
                    open_t = sched.get("openTime", "")
                    close_t = sched.get("closeTime", "")
                    lines.append(f"📌 Shift {shift_label} ({open_t} - {close_t})")

                    # Calculate lateness
                    open_min = _parse_time_to_minutes(open_t)
                    dt = datetime.fromtimestamp(ts / 1000, tz=WIB)
                    check_min = dt.hour * 60 + dt.minute
                    late_mins = check_min - open_min
                    tolerance = 5

                    if late_mins > tolerance:
                        close_min = _parse_time_to_minutes(close_t) if close_t else open_min + 480
                        shift_duration = close_min - open_min
                        if shift_duration <= 0:
                            shift_duration = 480

                        penalty_mins = late_mins - tolerance
                        rate = _get_role_rate(role_name)
                        lines.append(f"⚠️ Terlambat {late_mins} menit")
                        if rate > 0 and shift_duration > 0:
                            denda = (penalty_mins / shift_duration) * rate
                            lines.append(f"💰 Potongan shift: Rp{denda:,.0f}")
                    elif late_mins <= 0:
                        lines.append("✅ Tepat waktu")
                    else:
                        lines.append("✅ Tepat waktu (dalam batas toleransi)")
                elif shift_name:
                    lines.append(f"📌 Shift {shift_label}")
                elif shift_label:
                    pass  # Already handled in early_for_shift or SALAH JADWAL above
                else:
                    lines.append("📌 Tanpa shift")

                # Extract photo URL from notes for check_in
                photo_url = None
                notes = log.get("notes") or ""
                if "foto:" in notes:
                    for part in notes.split("|"):
                        part = part.strip()
                        if part.startswith("foto:"):
                            photo_url = part[5:].strip()
                            break

                await _send_to_group(app, "\n".join(lines), photo_url=photo_url if log_type == "check_in" else None)

            # ═══ CHECK_OUT ═══
            elif log_type == "check_out":
                # Hapus prefix "Shift " jika sudah ada di shift_name
                shift_label = shift_name.removeprefix("Shift ").removeprefix("shift ") if shift_name else ""

                lines = [
                    f"🚶\u200d⬅️ Absen Keluar — {date_str} {time_str}",
                    f"👤 {user_name}" + (f" • {role_name}" if role_name else ""),
                    f"🕐 {time_str} WIB",
                ]

                sched = _get_shift_schedule(shift_name) if shift_name else None
                if sched:
                    open_t = sched.get("openTime", "")
                    close_t = sched.get("closeTime", "")
                    lines.append(f"📌 Shift {shift_label} ({open_t} - {close_t})")
                elif shift_name:
                    lines.append(f"📌 Shift {shift_label}")

                # Find most recent check_in for this user
                try:
                    prev_logs = await _fetch(
                        "pos_attendance_logs",
                        f"select=timestamp,type"
                        f"&userId=eq.{user_id}"
                        f"&timestamp=lte.{ts}"
                        f"&order=timestamp.desc&limit=10",
                    )
                    check_in_ts = None
                    found_this = False
                    for p in prev_logs:
                        pid = p.get("_id", "")
                        if pid == log_id:
                            found_this = True
                            continue
                        if p.get("type") == "check_in":
                            check_in_ts = int(float(p.get("timestamp") or 0))
                            break
                    if check_in_ts and check_in_ts > 0:
                        duration_min = (ts - check_in_ts) // 60000
                        if duration_min > 0:
                            lines.append(f"⏱ Durasi: {_minutes_to_human(duration_min)}")
                except Exception:
                    pass

                await _send_to_group(app, "\n".join(lines))

            # Mark processed
            _reported_attendance_ids.add(log_id)
            if log_id > _last_attendance_id:
                _last_attendance_id = log_id

    except Exception as e:
        logger.warning("check_new_attendance failed: %s", e)


async def _check_new_transactions(app):
    """Poll for new expenses, report to group."""
    global _last_expense_check_ms, _reported_expense_ids
    now_ms = int(_now_wib().timestamp() * 1000)

    # Initialize on first run
    if _last_expense_check_ms == 0:
        _last_expense_check_ms = now_ms - 60_000

    try:
        # ── Order notifications removed — handled by Yumi Supervisor Agent ──

        # ── Check new expenses (look back to today's midnight for OCR receipts) ──
        today_start_ms = _start_of_day_ms(_now_wib())
        expense_lookback = min(_last_expense_check_ms, today_start_ms) if _last_expense_check_ms > 0 else today_start_ms
        fin_rows = await _fetch(
            "pos_financial_transactions",
            f"select=_id,amount,category,description,date,metadata"
            f"&type=eq.expense"
            f"&date=gte.{expense_lookback}"
            f"&date=lte.{now_ms}"
            f"&order=date.asc&limit=20",
        )

        for x in fin_rows:
            exp_id = x.get("_id") or ""
            if exp_id and exp_id in _reported_expense_ids:
                continue

            ts = int(float(x.get("date") or 0))
            amount = float(x.get("amount") or 0)
            cat = x.get("category") or "Lainnya"
            desc = x.get("description") or ""
            metadata = x.get("metadata") or {}
            is_ocr = isinstance(metadata, dict) and metadata.get("ocr") is True

            shift = await _find_shift_at_time(ts)
            cashier = shift.get("cashier_name", "?")

            # Header with OCR badge jika dari struk
            header = "📸💸 Pengeluaran" if is_ocr else "💸 Pengeluaran"
            lines = [
                f"{header} — {_format_time_ms(ts)}",
                "────────────",
            ]

            # Merchant dari OCR metadata
            if is_ocr:
                receipt_details = metadata.get("receiptDetails") or {}
                merchant = receipt_details.get("merchantName") or ""
                if merchant:
                    lines.append(f"🏪 {merchant}")

            # Category line with icon
            cat_icon = _cat_icon(cat.lower())
            lines.append(f"{cat_icon} {cat}")
            lines.append(f"💰 Rp{amount:,.0f}")

            # Payment method dari metadata
            payment_method = None
            if is_ocr:
                payment_method = receipt_details.get("paymentMethod") or ""
            if not payment_method:
                payment_method = metadata.get("paymentMethod") or ""
            if payment_method:
                lines.append(f"💳 {payment_method}")

            # Accounting badge
            accounting_ref = metadata.get("accounting_ref") or metadata.get("accounting_journal_id")
            acct_entries = metadata.get("accounting_entries")
            if accounting_ref:
                lines.append("📊 Akuntansi tercatat")
            elif isinstance(acct_entries, list) and len(acct_entries) > 0:
                lines.append("📊 Akuntansi tercatat")

            # Items dari metadata (scanItems) atau parse dari description
            scan_items = []
            if isinstance(metadata, dict):
                scan_items = metadata.get("scanItems") or []

            # Fallback: parse items dari description untuk non-OCR
            if not scan_items and desc:
                parsed = re.findall(r'([A-Za-z][A-Za-z .]+?)\s*[×x]\s*([\d.]+)', desc)
                if parsed:
                    scan_items = [{"name": p[0].strip(), "quantity": float(p[1]), "price": 0, "total": 0} for p in parsed]
                else:
                    # Fallback: parse comma-separated names dari description
                    for prefix in ["Pembelian bahan: ", "Belanja bahan: ", "Belanja - ", "Pembelian: "]:
                        if prefix in desc:
                            after = desc.split(prefix, 1)[1]
                            names = [n.strip() for n in re.split(r'[,;]\s*', after) if n.strip()]
                            if names:
                                scan_items = [{"name": n, "quantity": 1, "price": 0, "total": 0} for n in names]
                            break

            if scan_items:
                lines.append("")
                lines.append("Items:")
                for si in scan_items:
                    sn = si.get("name", "?").strip()
                    sq = float(si.get("quantity", 1))
                    sp = float(si.get("price", 0) or 0)
                    st = float(si.get("total", 0) or 0)
                    su = (si.get("unit", "") or "").strip()
                    sq_str = f"{sq:.0f}" if sq == int(sq) else f"{sq:.3f}".rstrip("0").rstrip(".")
                    unit_str = f" {su}" if su else ""
                    price_str = f" @ Rp{sp:,.0f}" if sp > 0 else ""
                    total_str = f" = Rp{st:,.0f}" if st > 0 else ""
                    # Per-item category icon
                    item_cat = _categorize_item(sn)
                    item_icon = _cat_icon(item_cat)
                    lines.append(f"  {item_icon} {sn} x{sq_str}{unit_str}{price_str}{total_str}")

            # Clean description — skip if it's just a raw dump of items
            cleaner_desc = None
            if desc:
                bulk_pattern = re.match(r'^Bulk Belanja\s*-\s*(.+?):\s*\S', desc)
                if bulk_pattern:
                    cleaner_desc = f"🛒 Bulk — {bulk_pattern.group(1)}"
                else:
                    cleaner_desc = f"📝 {desc}"
            if cleaner_desc:
                lines.append(cleaner_desc)
            if cashier:
                lines.append(f"👥 Kasir: {cashier}")
            await _send_to_group(app, "\n".join(lines))
            if exp_id:
                _reported_expense_ids.add(exp_id)
            await asyncio.sleep(0.3)

        # Always advance expense cursor
        _last_expense_check_ms = now_ms

    except Exception as e:
        logger.warning("check_new_transactions failed: %s", e)


async def _check_closed_shift_reports(app) -> None:
    """Send each newly closed cashier recap to the GM-owned Report group."""
    global _SHIFT_RECAP_CURSOR_MS
    now_ms = int(_now_wib().timestamp() * 1000)
    try:
        headers = {
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
            "Accept-Profile": "pos",
        }
        query = (
            "select=source_id,shift_name,cashier_name,team_members,start_time,end_time,summary,raw"
            f"&end_time=gt.{_SHIFT_RECAP_CURSOR_MS}"
            f"&end_time=lte.{now_ms}"
            "&order=end_time.asc&limit=20"
        )
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.get(f"{SUPABASE_URL}/rest/v1/shifts?{query}", headers=headers)
            response.raise_for_status()
            shifts = response.json() if isinstance(response.json(), list) else []
    except Exception as e:
        logger.warning("shift_report fetch failed: %s", e)
        return

    if not shifts:
        return

    last_cursor = _SHIFT_RECAP_CURSOR_MS
    for shift in shifts:
        shift_id = str(shift.get("source_id") or "?")
        end_ms = int(shift.get("end_time") or 0)
        if end_ms <= last_cursor:
            continue
        start_ms = int(shift.get("start_time") or 0)
        start_iso = datetime.fromtimestamp(start_ms / 1000, tz=timezone.utc).isoformat().replace("+00:00", "Z")
        end_iso = datetime.fromtimestamp(end_ms / 1000, tz=timezone.utc).isoformat().replace("+00:00", "Z")
        try:
            orders = await _fetch(
                "pos_order_status",
                f"select=order_no,group_type,status,dibuat_by,selesai_by,dibuat_at,selesai_at,created_at"
                f"&created_at=gte.{start_iso}&created_at=lt.{end_iso}&order=created_at.asc",
            )
        except Exception as e:
            logger.warning("shift_report order fetch %s failed: %s", shift_id, e)
            orders = []

        unique_orders = {str(o.get("order_no") or "?") for o in orders}
        dibuat_by = {}
        selesai_by = {}
        for order in orders:
            if order.get("dibuat_by"):
                dibuat_by[order["dibuat_by"]] = dibuat_by.get(order["dibuat_by"], 0) + 1
            if order.get("selesai_by"):
                selesai_by[order["selesai_by"]] = selesai_by.get(order["selesai_by"], 0) + 1

        summary = shift.get("summary") or {}
        if isinstance(summary, str):
            try:
                summary = json.loads(summary)
            except json.JSONDecodeError:
                summary = {}
        cashier = shift.get("cashier_name") or "—"
        team = shift.get("team_members") or "—"
        lines = [
            "📊 *Rekap Kasir — Shift Ditutup*",
            "",
            f"🕐 Shift: *{shift.get('shift_name') or 'Shift'}*",
            f"👤 Kasir: {cashier}",
            f"👥 Tim: {team}",
            f"📅 {_format_time_ms(start_ms)} — {_format_time_ms(end_ms)}",
            "",
            f"🧾 Total order: {len(unique_orders)}",
            f"💰 Omzet: Rp{float(summary.get('totalRevenue') or 0):,.0f}",
            f"💵 Tunai: Rp{float(summary.get('cashRevenue') or 0):,.0f}",
            f"📱 QRIS: Rp{float(summary.get('qrisRevenue') or 0):,.0f}",
            f"💸 Pengeluaran: Rp{float(summary.get('totalExpenses') or 0):,.0f}",
            f"🏦 Kas fisik: Rp{float(summary.get('endingCashPhysical') or 0):,.0f}",
        ]
        if dibuat_by:
            lines.append("\n✅ *Dibuat:* " + ", ".join(f"{name} {count}x" for name, count in dibuat_by.items()))
        if selesai_by:
            lines.append("🏁 *Selesai:* " + ", ".join(f"{name} {count}x" for name, count in selesai_by.items()))

        try:
            await app.bot.send_message(
                chat_id=SHIFT_REPORT_GROUP_ID,
                text="\n".join(lines),
                parse_mode="Markdown",
            )
            logger.info("shift_report: sent to Report group for shift %s", shift_id)
        except Exception as e:
            logger.warning("shift_report send %s failed: %s", shift_id, e)
        last_cursor = end_ms

    if last_cursor > _SHIFT_RECAP_CURSOR_MS:
        _SHIFT_RECAP_CURSOR_MS = last_cursor
        _save_shift_recap_cursor(last_cursor)
        logger.info("shift_report: cursor updated to %d", last_cursor)


async def _send_daily_summary(app):
    """Send daily summary report to group at 22:00 WIB."""
    try:
        now = _now_wib()
        start_ms = _start_of_day_ms(now)
        date_str = now.strftime("%d/%m/%Y")
        end_ms = int(now.timestamp() * 1000)

        # ── Shifts today ──
        shift_rows = await _fetch(
            "pos_shift_reports",
            "select=shift_name,status,cashier_name,team_members,order_count,"
            "total_revenue,total_expenses"
            f"&start_time=gte.{start_ms}&order=start_time.desc&limit=10",
        )
        # Deduplicate: AKTIF first, then 1 SELESAI per name if no AKTIF
        active_names = set()
        shifts = []
        for s in shift_rows:
            if s.get("status") == "AKTIF":
                active_names.add(s["shift_name"])
                shifts.append(s)
        seen = set()
        for s in shift_rows:
            if s.get("status") == "AKTIF":
                continue
            name = s["shift_name"]
            if name in active_names:
                continue
            key = (name, s.get("status", ""))
            if key not in seen:
                seen.add(key)
                shifts.append(s)

        # ── Orders ──
        orders = await _fetch(
            "pos_orders",
            f"select=orderNumber,totalAmount,paymentMethod,createdAt"
            f"&status=eq.completed"
            f"&_creationTime=gte.{start_ms}"
            f"&_creationTime=lte.{end_ms}"
            f"&order=_creationTime.asc&limit=200",
        )

        total_omzet = 0.0
        tunai = 0.0; qris = 0.0
        order_lines = []
        for o in orders:
            ts = int(float(o.get("createdAt") or o.get("_creationTime") or 0))
            order_no = o.get("orderNumber", "???")
            amount = float(o.get("totalAmount") or 0)
            payment = (o.get("paymentMethod") or "-").upper()
            total_omzet += amount
            if payment in ("TUNAI", "CASH"): tunai += amount
            elif payment in ("QRIS", "TRANSFER"): qris += amount
            order_lines.append(
                f"✅ {order_no}  Rp{amount:,.0f}  {payment}  🕐{_format_time_ms(ts, '%H:%M')}"
            )

        # ── Expenses ──
        fin_rows = await _fetch(
            "pos_financial_transactions",
            f"select=amount,category"
            f"&type=eq.expense"
            f"&date=gte.{start_ms}"
            f"&date=lte.{end_ms}"
            f"&order=date.asc&limit=50",
        )

        total_expense = 0.0
        expense_by_cat = Counter()
        for x in fin_rows:
            amount = float(x.get("amount") or 0)
            cat = x.get("category") or "Lainnya"
            total_expense += amount
            expense_by_cat[cat] += amount

        # ── Build report ──
        lines = [f"📊 Ringkasan {date_str}", ""]

        # Per-shift header
        for s in shifts:
            name = s["shift_name"]
            cashier = s.get("cashier_name") or "?"
            team = s.get("team_members") or ""
            is_active = s.get("status") == "AKTIF"
            icon = "🟢" if is_active else "⚫"
            rev = float(s.get("total_revenue") or 0)
            exp = float(s.get("total_expenses") or 0)
            orders_n = int(s.get("order_count") or 0)

            header = f"{icon} {name} — {cashier}"
            if team:
                header += f" | Tim: {team}"
            header += f"  ({orders_n} order | Omzet Rp{rev:,.0f} | Biaya Rp{exp:,.0f})"
            lines.append(header)
        lines.append("")

        lines.append(f"🧾 {len(orders)} Transaksi Masuk")
        if tunai or qris:
            parts = []
            if tunai: parts.append(f"Tunai Rp{tunai:,.0f}")
            if qris: parts.append(f"QRIS Rp{qris:,.0f}")
            lines.append(f"   {' | '.join(parts)}")
        lines.append(f"💰 Total Omzet: Rp{total_omzet:,.0f}")
        if total_expense > 0:
            lines.append(f"💸 {len(fin_rows)} Pengeluaran: Rp{total_expense:,.0f}")
        lines.append(f"🏦 Kas Bersih: Rp{total_omzet - total_expense:,.0f}")
        lines.append("")

        if order_lines:
            lines.append("📥 Detail Pesanan:")
            lines.extend(order_lines)
            lines.append("")

        if expense_by_cat:
            lines.append("📤 Detail Pengeluaran:")
            for cat, amt in expense_by_cat.most_common():
                lines.append(f"💸 {cat}  Rp{amt:,.0f}")

        await _send_to_group(app, "\n".join(lines))
        logger.info("Daily summary sent to group %s", REPORT_GROUP_ID)

    except Exception as e:
        logger.exception("send_daily_summary failed")



async def _send_marketlist_to_group(app):
    """Generate and send marketlist to marketlist group."""
    try:
        text = await generate_marketlist(_fetch)
        if text:
            await app.bot.send_message(chat_id=MARKETLIST_GROUP_ID, text=text)
            logger.info("Marketlist sent to group %s", MARKETLIST_GROUP_ID)
        else:
            logger.warning("Marketlist empty, nothing sent")
    except Exception as e:
        logger.exception("send_marketlist_to_group failed")


async def _start_auto_reporter(app):
    """Start polling loop and daily summary scheduler."""
    if not AUTO_REPORTER_ENABLED:
        logger.info("Auto-reporter DISABLED via AUTO_REPORTER_ENABLED=false — bot stays alive for manual commands only")
        return
    from apscheduler.schedulers.asyncio import AsyncIOScheduler

    # Build marketlist ingredient category lookup
    from marketlist import build_lookup
    try:
        await build_lookup(_fetch)
        logger.info("Marketlist ingredient category lookup built")
    except Exception as e:
        logger.warning("Marketlist build_lookup failed: %s", e)

    # Build product category map for order notifications
    try:
        await _build_product_category_map()
        logger.info("Product category map built")
    except Exception as e:
        logger.warning("Product category map build failed: %s", e)

    # Build staff role map for team member labeling
    try:
        await _build_staff_role_map()
    except Exception as e:
        logger.warning("Staff role map build failed: %s", e)

    # Daily summary at 22:00 WIB (15:00 UTC)
    scheduler = AsyncIOScheduler(timezone="Asia/Jakarta")
    scheduler.add_job(
        _send_daily_summary,
        "cron",
        hour=22,
        minute=0,
        args=[app],
        id="daily_summary",
    )
    scheduler.start()
    logger.info("Auto-reporter: daily summary scheduled at 22:00 WIB")

    # Marketlist at 07:00 WIB (every day)
    scheduler.add_job(
        _send_marketlist_to_group,
        "cron",
        hour=7,
        minute=0,
        args=[app],
        id="marketlist_0700",
    )
    logger.info("Auto-reporter: marketlist scheduled at 07:00 WIB")

    # Real-time polling every 30 seconds
    async def _poll_loop():
        # Immediate catch-up on startup
        try:
            await _check_new_transactions(app)
            logger.info("Auto-reporter: catch-up check complete")
        except Exception as e:
            logger.warning("Auto-reporter: catch-up check failed: %s", e)
        # Also catch up attendance on startup
        try:
            await _check_new_attendance(app)
            logger.info("Auto-reporter: attendance catch-up complete")
        except Exception as e:
            logger.warning("Auto-reporter: attendance catch-up failed: %s", e)
        try:
            await _check_closed_shift_reports(app)
            logger.info("Auto-reporter: shift report catch-up complete")
        except Exception as e:
            logger.warning("Auto-reporter: shift report catch-up failed: %s", e)
        while True:
            await asyncio.sleep(30)
            await _check_new_transactions(app)
            await _check_new_attendance(app)
            await _check_closed_shift_reports(app)

    asyncio.create_task(_poll_loop())
    logger.info("Auto-reporter: real-time polling started (30s interval, immediate catch-up)")


# ===================================================================
# HTTP Endpoint: /send-report
# ===================================================================

async def _handle_send_report(request):
    from aiohttp import web

    cors_headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
    }

    if request.method == "OPTIONS":
        return web.Response(status=204, headers=cors_headers)

    try:
        body = json.loads(await request.read())
    except Exception:
        return web.json_response({"ok": False, "error": "invalid json"}, status=400, headers=cors_headers)

    text = str(body.get("text", "")).strip()
    if not text:
        return web.json_response({"ok": False, "error": "text is required"}, status=400, headers=cors_headers)

    chat_id = body.get("chat_id")
    if not chat_id:
        if TELEGRAM_REPORT_CHAT_ID:
            chat_id = int(TELEGRAM_REPORT_CHAT_ID)
        elif ALLOWED_USERS:
            chat_id = next(iter(ALLOWED_USERS))
        else:
            return web.json_response({"ok": False, "error": "no target chat_id"}, status=400, headers=cors_headers)

    chunks = [text[i : i + 4096] for i in range(0, len(text), 4096)]
    if len(chunks) > 20:
        return web.json_response({"ok": False, "error": "text too long"}, status=400)

    sent = []
    for chunk in chunks:
        try:
            msg = await request.app["bot"].send_message(chat_id=chat_id, text=chunk)
            sent.append(msg.message_id)
        except Exception as exc:
            logger.error("Failed to send telegram message: %s", exc)
            return web.json_response({"ok": False, "error": str(exc)}, status=502, headers=cors_headers)

    return web.json_response({"ok": True, "message_ids": sent}, headers=cors_headers)


async def _handle_send_document(request):
    from aiohttp import web

    cors_headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
    }

    if request.method == "OPTIONS":
        return web.Response(status=204, headers=cors_headers)

    try:
        body = await request.json()
        chat_id = body.get("chat_id") or TELEGRAM_REPORT_CHAT_ID
        caption = str(body.get("caption", "") or "").strip()
        filename = body.get("filename", "laporan-shift.pdf")
        b64 = body.get("document_base64", "")

        if not b64:
            return web.json_response({"ok": False, "error": "document_base64 is required"}, status=400, headers=cors_headers)

        doc_bytes = base64.b64decode(b64)
        msg = await request.app["bot"].send_document(
            chat_id=int(chat_id),
            document=io.BytesIO(doc_bytes),
            filename=filename,
            caption=caption,
        )
        return web.json_response({"ok": True, "message_id": msg.message_id}, headers=cors_headers)
    except Exception as exc:
        logger.error("Failed to send document: %s", exc)
        return web.json_response({"ok": False, "error": str(exc)}, status=502, headers=cors_headers)


async def _handle_save_report(request):
    """Save HTML report to disk and return public URL."""
    from aiohttp import web

    cors_headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
    }

    if request.method == "OPTIONS":
        return web.Response(status=204, headers=cors_headers)

    try:
        body = await request.json()
        html_content = body.get("html", "")
        shift_name = body.get("shift_name", "shift")

        if not html_content:
            return web.json_response({"ok": False, "error": "html is required"}, status=400, headers=cors_headers)

        reports_dir = os.path.join(os.path.dirname(__file__), "shift-reports")
        os.makedirs(reports_dir, exist_ok=True)

        ts = int(datetime.now().timestamp())
        safe_name = re.sub(r"[^a-zA-Z0-9]", "_", shift_name)
        filename = f"laporan-{safe_name}-{ts}.html"
        filepath = os.path.join(reports_dir, filename)

        with open(filepath, "w", encoding="utf-8") as f:
            f.write(html_content)

        # Use supabase.yumme.id for public access
        public_url = f"https://supabase.yumme.id/reports/{filename}"
        logger.info("Report saved: %s -> %s", filepath, public_url)

        return web.json_response({
            "ok": True,
            "filename": filename,
            "url": public_url,
        }, headers=cors_headers)
    except Exception as exc:
        logger.error("Failed to save report: %s", exc)
        return web.json_response({"ok": False, "error": str(exc)}, status=502, headers=cors_headers)


async def _start_http_server(bot_app, port=8001):
    from aiohttp import web

    app = web.Application()
    app["bot"] = bot_app.bot
    app.router.add_post("/send-report", _handle_send_report)
    app.router.add_route("OPTIONS", "/send-report", _handle_send_report)
    app.router.add_post("/send-document", _handle_send_document)
    app.router.add_route("OPTIONS", "/send-document", _handle_send_document)
    app.router.add_post("/save-report", _handle_save_report)
    app.router.add_route("OPTIONS", "/save-report", _handle_save_report)
    # Serve laporan shift HTML dari direktori shift-reports/
    reports_dir = os.path.join(os.path.dirname(__file__), "shift-reports")
    os.makedirs(reports_dir, exist_ok=True)
    app.router.add_static("/reports", path=reports_dir, name="reports")
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "0.0.0.0", port)
    await site.start()
    logger.info("HTTP push-report endpoint listening on port %s", port)


# ===================================================================
# Document Handler (Excel Schedule Import)
# ===================================================================

async def on_document(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle document upload — parse Excel schedule files and import to DB."""
    # Di grup: silent ignore jika tidak @mention atau reply ke bot
    chat = update.effective_chat
    if chat and chat.type in ("group", "supergroup"):
        msg = update.effective_message
        if msg:
            mentioned = False
            if msg.reply_to_message and msg.reply_to_message.from_user and msg.reply_to_message.from_user.is_bot:
                mentioned = True
            if not mentioned:
                message_text = msg.caption or ""
                if msg.entities:
                    for ent in msg.entities:
                        if ent.type == "mention":
                            mentioned_name = message_text[ent.offset:ent.offset + ent.length].lower()
                            bot_username = context.bot.username if context.bot else None
                            if bot_username and f"@{bot_username.lower()}" == mentioned_name:
                                mentioned = True
                                break
                            if "@yummeaibot" in message_text.lower():
                                mentioned = True
                                break
                if not mentioned and "@yummeaibot" in message_text.lower():
                    mentioned = True
            if not mentioned:
                return
    else:
        if not _is_allowed(update):
            await _reply_msg(update, context, "Unauthorized")
            return

    try:
        # Get document info
        doc = update.message.document
        if not doc:
            return

        filename = doc.file_name or "unknown"
        # Only handle Excel files
        if not filename.lower().endswith((".xlsx", ".xls", ".xlsm")):
            await _reply_msg(update, context,
                "Maaf, saya hanya bisa memproses file Excel (.xlsx) untuk import jadwal.\n"
                "Kirim file jadwal shift (format matrix) dan saya akan import ke sistem."
            )
            return

        await context.bot.send_chat_action(chat_id=update.effective_chat.id, action="typing")

        # Download file from Telegram
        file = await context.bot.get_file(doc.file_id)
        file_bytes = await file.download_as_bytearray()
        file_bytes = bytes(file_bytes)

        # Parse Excel
        logger.info("Parsing Excel schedule: %s (%d bytes)", filename, len(file_bytes))
        parsed = parse_excel(file_bytes, filename)

        if "error" in parsed:
            await _reply_msg(update, context,
                f"❌ Gagal parse file: {parsed['error']}\n\n"
                "Pastikan format Excel:\n"
                "• Baris header: MINGGU KE | HARI | TANGGAL | <nama staff> | ...\n"
                "• Kolom staff berisi shift: PAGI (07.30 - 14.30), SORE, OFF, GENERAL"
            )
            return

        # Send parsed data to Edge Function
        summary = parsed.get("summary", {})
        await _reply_msg(update, context,
            f"📋 Memproses jadwal dari <b>{filename}</b>...\n"
            f"• {summary.get('uniqueStaff', 0)} staff\n"
            f"• {summary.get('uniqueDates', 0)} hari ({summary.get('dateRange', '')})\n"
            f"• {summary.get('totalRows', 0)} entri jadwal\n"
            f"⏳ Mengimport ke database..."
        )

        result = await call_import_schedule(
            httpx,
            SUPABASE_URL,
            SUPABASE_KEY,
            parsed,
        )

        if result.get("error"):
            await _reply_msg(update, context,
                f"❌ Gagal import: {result['error']}"
            )
            return

        s = result.get("summary", {})
        staff_detail = s.get("staffDetails", {})
        matched_list = staff_detail.get("matched", [])
        created_list = staff_detail.get("created", [])

        msg_parts = [
            f"✅ <b>Import jadwal selesai!</b>",
            f"",
            f"📊 <b>Ringkasan:</b>",
            f"• {s.get('insertedRows', 0)} jadwal berhasil diimport",
            f"• {s.get('uniqueDates', 0)} hari kerja",
            f"• {s.get('totalRows', 0)} total entri diproses",
        ]

        if s.get('skippedRows', 0) > 0:
            msg_parts.append(f"⚠️ {s['skippedRows']} entri dilewati (staff tidak dikenal)")

        if matched_list:
            msg_parts.append(f"")
            msg_parts.append(f"✅ <b>Staff cocok:</b> {s.get('matchedStaff', 0)} orang")
            for m in matched_list[:10]:
                msg_parts.append(f"   • {m}")

        if created_list:
            msg_parts.append(f"")
            msg_parts.append(f"🆕 <b>Staff baru dibuat:</b> {s.get('createdStaff', 0)} orang")
            for c in created_list[:10]:
                msg_parts.append(f"   • {c}")

        if s.get('month') and s.get('year'):
            month_name = [
                "", "Januari", "Februari", "Maret", "April", "Mei", "Juni",
                "Juli", "Agustus", "September", "Oktober", "November", "Desember"
            ][s['month']]
            msg_parts.append(f"")
            msg_parts.append(f"📅 Periode: {month_name} {s['year']}")

        msg_parts.append(f"")
        msg_parts.append(f"🔄 Cek di: pos.yumme.id/admin/operational-team/attendance/jadwal")

        await _reply_msg(update, context, "\n".join(msg_parts))

    except Exception as e:
        logger.error("Document handler error: %s", e, exc_info=True)
        await _reply_msg(update, context,
            f"❌ Terjadi error saat memproses file: {str(e)}"
        )


# ===================================================================
# Main
# ===================================================================

def main():
    if not BOT_TOKEN:
        raise RuntimeError("TELEGRAM_BOT_TOKEN belum di-set")
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise RuntimeError("SUPABASE_URL / SUPABASE_KEY belum di-set")

    async def _post_init(application: Application):
        try:
            await _start_http_server(application, port=8001)
        except Exception as e:
            logger.warning("HTTP server on port 8001 failed to start: %s (continuing without it)", e)
        await _start_auto_reporter(application)

    app = Application.builder().token(BOT_TOKEN).post_init(_post_init).build()

    # Commands
    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(CommandHandler("help", cmd_help))
    app.add_handler(CommandHandler("ringkasan_hari_ini", cmd_ringkasan_hari_ini))
    app.add_handler(CommandHandler("ringkasan", cmd_ringkasan_hari_ini))
    app.add_handler(CommandHandler("top_produk", cmd_top_produk))
    app.add_handler(CommandHandler("stok_menipis", cmd_stok_menipis))
    app.add_handler(CommandHandler("absen_hari_ini", cmd_absen_hari_ini))
    app.add_handler(CommandHandler("booking_aktif", cmd_booking_aktif))
    app.add_handler(CommandHandler("briefing_hari_ini", cmd_briefing_hari_ini))
    app.add_handler(CommandHandler("purchaselog", cmd_purchaselog))
    app.add_handler(CommandHandler("marketlist", cmd_marketlist))
    app.add_handler(CommandHandler("export_jadwal", cmd_export_jadwal))
    app.add_handler(CommandHandler("status_saya", cmd_status_saya))
    app.add_handler(CommandHandler("yumi", cmd_yumi))
    app.add_handler(CommandHandler("hermes_scope", cmd_hermes_scope))
    app.add_handler(CommandHandler("hermes_test", cmd_hermes_test))
    app.add_handler(CommandHandler("broadcast", cmd_broadcast))
    app.add_handler(CommandHandler("sebarkan", cmd_sebarkan))
    app.add_handler(CommandHandler("broadcast_channel", cmd_broadcast))

    # Alias (backward compat)
    app.add_handler(CommandHandler("kpi_hari_ini", cmd_ringkasan_hari_ini))  # deprecated

    # Callbacks (inline keyboard)
    app.add_handler(CallbackQueryHandler(on_callback))

    # Message handlers (order matters — photo before text)
    app.add_handler(MessageHandler(filters.PHOTO, on_photo))
    app.add_handler(MessageHandler(filters.Document.ALL, on_document))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, on_text))

    logger.info("Starting Yumi General Manager Agents...")
    app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
