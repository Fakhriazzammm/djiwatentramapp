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

load_dotenv()

BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
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
BARISTA_GROUP_ID = int(os.getenv("BARISTA_GROUP_ID", "-5044633519"))
KITCHEN_GROUP_ID = int(os.getenv("KITCHEN_GROUP_ID", "-5199093599"))

# Marketlist auto-send to Telegram group
MARKETLIST_GROUP_ID = int(os.getenv("MARKETLIST_GROUP_ID", "-5288006237"))

# Beverage category tracking
_BEVERAGE_CATEGORY_IDS: set[str] = set()
_BEVERAGE_PRODUCT_IDS: set[str] = set()

# Food category tracking
_FOOD_CATEGORY_IDS: set[str] = set()
_FOOD_PRODUCT_IDS: set[str] = set()

# Dedup: track already-reported orders to prevent re-sending
_reported_order_nos: set[str] = set()

# Polling state for real-time transaction monitoring
_last_order_check_ms = 0
_last_expense_check_ms = 0

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

    url = f"{SUPABASE_URL}/functions/v1/yumi-ai"
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            url,
            headers={**_headers(), "Content-Type": "application/json"},
            json=payload,
        )

    if resp.status_code < 400:
        data = resp.json()
        if data.get("ok"):
            return {"success": True, "sourceId": data.get("sourceId"), "amount": total, "merchant": merchant, "items_count": len(items)}
        else:
            return {"success": False, "error": data.get("error", "Unknown error")}
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


def _is_allowed(update: Update) -> bool:
    user = update.effective_user
    if not user:
        return False
    if not ALLOWED_USERS:
        return True
    return user.id in ALLOWED_USERS


async def _fetch(view: str, query: str = "select=*"):
    url = f"{SUPABASE_URL}/rest/v1/{view}?{query}"
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.get(url, headers=_headers())
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
    """Gather realtime operational context: low stock, pending orders, active shift."""
    hints = []
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
        return "Konteks realtime YumiPOS: " + " | ".join(hints)
    return "Konteks: YumiPOS Djiwa Tentram Coffee (pos.yumme.id)"


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
    url = f"{SUPABASE_URL}/functions/v1/yumi-ai"
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
    """Quick action inline keyboard for /start and fallback."""
    return InlineKeyboardMarkup([
        [
            InlineKeyboardButton("📊 Ringkasan Hari Ini", callback_data="ringkasan"),
            InlineKeyboardButton("🔥 Top Produk", callback_data="top"),
        ],
        [
            InlineKeyboardButton("⚠️ Stok Menipis", callback_data="stok"),
            InlineKeyboardButton("🕒 Absensi", callback_data="absen"),
        ],
        [
            InlineKeyboardButton("📅 Booking Aktif", callback_data="booking"),
            InlineKeyboardButton("📋 Briefing", callback_data="briefing"),
            InlineKeyboardButton("📝 Purchaselog", callback_data="purchaselog"),
        ],
        [
            InlineKeyboardButton("🛒 Marketlist", callback_data="marketlist"),
            InlineKeyboardButton("💬 Tanya Bebas", callback_data="help"),
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
        url = f"{SUPABASE_URL}/functions/v1/yumi-ai"
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
                if data.get("ok"):
                    await query.edit_message_text(
                        query.message.text + f"\n\n✅ Berhasil disimpan sebagai {label} — Rp {amount:,.0f}",
                        parse_mode="Markdown",
                        reply_markup=None,
                    )
                else:
                    await query.edit_message_text(
                        query.message.text + f"\n\n❌ Gagal: {data.get('error', 'Unknown')}",
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

    await _reply_msg(update, context, 
        "🤖 Yumi AI — Asisten YumiPOS\n\n"
        "Saya bisa bantu:\n"
        "• Ringkasan harian (omzet, produk, pengeluaran)\n"
        "• Top produk & stok menipis\n"
        "• Absensi & booking aktif\n"
        "• Briefing bisnis harian\n"
        "• Chat bebas tanya apa saja\n"
        "• 📸 Kirim foto struk untuk scan OCR\n\n"
        "Pilih menu atau ketik bebas 👇",
        parse_mode="Markdown",
        reply_markup=_reply_keyboard(),
    )


async def cmd_help(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not _is_allowed(update):
        await _reply_msg(update, context, "Unauthorized")
        return
    await _reply_msg(update, context, 
        "💡 Cara pakai Yumi AI\n\n"
        "📋 Commands:\n"
        "/ringkasan — Ringkasan (default: hari ini)\n"
        "  └ Filter: /ringkasan kemarin / minggu_ini / bulan_ini\n"
        "/top_produk — Produk terlaris\n"
        "/stok_menipis — Stok yang perlu dibeli\n"
        "/absen_hari_ini — Absensi staff\n"
        "/booking_aktif — Booking aktif\n"
        "/briefing_hari_ini — Briefing bisnis\n\n"
        "💬 Chat bebas: ketik apa saja\n"
        "📸 Scan struk: kirim foto struk\n\n"
        "Contoh: _omzet hari ini_, _produk terlaris minggu ini_, _berapa stok kopi?_",
        parse_mode="Markdown",
        reply_markup=_reply_keyboard(),
    )


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

        # ── 4) Build compact report ──
        lines = [
            f"📊 Ringkasan {period_label}",
            f"Djiwa Tentram Cafe & Resto",
            f"📅 {date_str}",
            "",
        ]

        # Shift summary — 1 line per shift
        if deduped:
            for s in deduped:
                name = s["shift_name"]
                status = s.get("status", "?")
                is_active = status == "AKTIF"
                icon = "🟢" if is_active else "⚫"
                cashier = s.get("cashier_name") or "?"
                start_cash = float(s.get("starting_cash") or 0)
                rev = float(s.get("total_revenue") or 0)
                exp = float(s.get("total_expenses") or 0)
                gross = float(s.get("total_gross_sales") or 0)
                items = int(s.get("total_items_sold") or 0)
                orders_n = int(s.get("order_count") or 0)
                collected = float(s.get("shift_collected") or 0)
                team = s.get("team_members") or ""
                status_badge = " [AKTIF]" if is_active else ""

                lines.append(f"{icon} {name}{status_badge} — {cashier}")
                lines.append(f"   Modal Rp{start_cash:,.0f} | {orders_n} order | {items} item | Omzet Rp{gross:,.0f} | Biaya Rp{exp:,.0f}")
                if is_active and collected > 0:
                    lines.append(f"   📡 Real-time: Rp{collected:,.0f}")
                if team:
                    lines.append(f"   Tim: {team}")
                lines.append("")
        else:
            lines.append("👥 Belum ada shift untuk periode ini.\n")

        # ── 5) Compact totals ──
        lines.append("───")
        lines.append(f"💰 Total Omzet: Rp{total_gross:,.0f} (Net: Rp{total_revenue:,.0f})")
        lines.append(f"🏷️ Diskon: Rp{total_discount:,.0f}")
        lines.append(f"📦 Produk Terjual: {total_items_sold}")
        lines.append(f"💸 Pengeluaran: Rp{total_expense:,.0f}")
        lines.append(f"🏦 Kas Bersih: Rp{net_balance:,.0f}")

        # Top 3
        top3 = items_by_name.most_common(3)
        if top3:
            lines.append(f"⭐ Top 3: {', '.join(f'{n} ({q})' for n,q in top3)}")

        # Expenses summary
        if expense_by_cat:
            exp_lines = [f"📝 Biaya: {cat} Rp{amt:,.0f}" for cat, amt in expense_by_cat.most_common(5)]
            lines.append(" | ".join(exp_lines))

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

        lines = [f"{i}. {n} — {q:.0f} pcs (Rp {omzet[n]:,.0f})" for i, (n, q) in enumerate(top, 1)]
        await _reply_msg(update, context, 
            "🔥 Top Produk Hari Ini\n" + "\n".join(lines),
            reply_markup=_reply_keyboard(),
        )
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
        text = "\n".join([f"• {n}: {q:g}/{t:g} {u}" for n, q, t, u in alerts[:30]])
        await _reply_msg(update, context, 
            f"⚠️ Stok Menipis ({len(alerts)} item)\n{text}",
            reply_markup=_reply_keyboard(),
        )
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
            await _reply_msg(update, context, "Belum ada data absensi.", reply_markup=_reply_keyboard())
            return

        lines = []
        for r in rows[:25]:
            ts = int(r.get("timestamp") or 0)
            dt = datetime.fromtimestamp(ts / 1000, tz=WIB).strftime("%H:%M")
            icon = "✅" if r.get("type") == "check_in" else "🔴"
            lines.append(f"{icon} {dt} | {r.get('userName','?')} | {r.get('shiftName') or '-'}")

        await _reply_msg(update, context, 
            "🕒 Absensi Hari Ini\n" + "\n".join(lines),
            reply_markup=_reply_keyboard(),
        )
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
            await _reply_msg(update, context, "Tidak ada booking aktif.", reply_markup=_reply_keyboard())
            return

        lines = []
        for r in active[:15]:
            lines.append(
                f"• {r.get('bookingCode','-')} | {r.get('customerName','-')} | "
                f"{r.get('bookingDate','-')} | {r.get('guestCount',0)} org | "
                f"{r.get('bookingStatus','-')} | Rp {float(r.get('totalAmount') or 0):,.0f}"
            )

        await _reply_msg(update, context, 
            "📅 Booking Aktif\n" + "\n".join(lines),
            reply_markup=_reply_keyboard(),
        )
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
        url = f"{SUPABASE_URL}/functions/v1/yumi-ai"
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
    else:
        await query.edit_message_text("Menu tidak dikenal.", reply_markup=_reply_keyboard())


# ===================================================================
# Photo Handler (OCR Receipt Scan)
# ===================================================================

async def on_photo(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle photo upload — OCR receipt via SumoPod vision API, save to DB, show summary."""
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
    if not _is_allowed(update):
        await _reply_msg(update, context, "Unauthorized")
        return

    text = (update.message.text or "").strip()
    text_lower = text.lower()

    # Keyword routing to specific commands (fast path)
    keyword_map = [
        (["omzet", "kpi", "penjualan", "revenue", "pendapatan"], cmd_ringkasan_hari_ini),
        (["top produk", "terlaris", "best seller", "paling laku"], cmd_top_produk),
        (["stok", "menipis", "habis", "inventory", "inventori"], cmd_stok_menipis),
        (["absen", "attendance", "clock in", "clock out", "absensi"], cmd_absen_hari_ini),
        (["booking", "reservasi"], cmd_booking_aktif),
        (["marketlist", "belanja", "daftar belanja", "shopping list"], cmd_marketlist),
        (["briefing", "ringkasan bisnis", "insight hari ini", "laporan"], cmd_briefing_hari_ini),
    ]

    for keywords, handler in keyword_map:
        if any(k in text_lower for k in keywords):
            # Check if this is a direct data question or needs AI
            if len(text_lower.split()) <= 3:
                await handler(update, context)
                return
            break  # let AI handle longer queries even if they contain keywords

    # Free-text AI chat with rich context
    try:
        await context.bot.send_chat_action(chat_id=update.effective_chat.id, action="typing")
        user_id = update.effective_user.id
        context_hint = await _gather_context()
        context_hint += (
            "\nKamu adalah Yumi AI untuk YumiPOS (Djiwa Tentram Coffee, pos.yumme.id). "
            "Jawab dalam Bahasa Indonesia, ringkas, actionable. "
            "Jika user tanya data, berikan angka dan insight. "
            "Jika user minta action (buat order, catat transaksi, dll), jelaskan bahwa fitur itu "
            "tersedia di web app pos.yumme.id."
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


async def _send_to_group(app, text: str):
    """Send a message to the auto-report group."""
    try:
        await app.bot.send_message(chat_id=REPORT_GROUP_ID, text=text)
    except Exception as e:
        logger.error("send_to_group failed: %s", e)


def _format_time_ms(ts_ms, fmt="%d/%m %H:%M"):
    return datetime.fromtimestamp(ts_ms / 1000, tz=WIB).strftime(fmt)


def _format_time_hm(ts_ms) -> str:
    """Format timestamp to HH:MM only."""
    return datetime.fromtimestamp(ts_ms / 1000, tz=WIB).strftime("%H:%M")


async def _build_beverage_lookup():
    """Fetch all beverage-category product IDs. Called once at startup."""
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
        logger.info("Beverage category IDs: %s", _BEVERAGE_CATEGORY_IDS)
        products = await _fetch("pos_products", "select=_id,categoryId&limit=500")
        _BEVERAGE_PRODUCT_IDS = {
            p["_id"]
            for p in products
            if p.get("categoryId") in _BEVERAGE_CATEGORY_IDS
        }
        logger.info("Beverage product IDs loaded: %d", len(_BEVERAGE_PRODUCT_IDS))
    except Exception as e:
        logger.warning("build_beverage_lookup failed: %s", e)



async def _lazy_fetch_product_category(pid: str) -> str:
    """Fetch a single product's categoryId and cache it. Returns 'beverage', 'food', or 'other'."""
    global _BEVERAGE_PRODUCT_IDS, _FOOD_PRODUCT_IDS
    try:
        rows = await _fetch("pos_products", f"select=categoryId&_id=eq.{pid}&limit=1")
        if not rows:
            _BEVERAGE_PRODUCT_IDS.add(pid); _FOOD_PRODUCT_IDS.add(pid)
            return "other"
        cat_id = rows[0].get("categoryId", "")
        if cat_id in _BEVERAGE_CATEGORY_IDS:
            _BEVERAGE_PRODUCT_IDS.add(pid)
            logger.info("lazy_fetch: new product %s → beverage", pid)
            return "beverage"
        elif cat_id in _FOOD_CATEGORY_IDS:
            _FOOD_PRODUCT_IDS.add(pid)
            logger.info("lazy_fetch: new product %s → food", pid)
            return "food"
        else:
            _BEVERAGE_PRODUCT_IDS.add(pid); _FOOD_PRODUCT_IDS.add(pid)
            logger.info("lazy_fetch: product %s is neither (cat=%s)", pid, cat_id[:12])
            return "other"
    except Exception as e:
        logger.warning("lazy_fetch failed for %s: %s", pid, e)
        return "other"


async def _is_beverage_item(item: dict) -> bool:
    """Check if order item is beverage — lazy-fetches unknown products from Supabase."""
    pid = item.get("productId", "")
    if not pid:
        return False
    if pid in _BEVERAGE_PRODUCT_IDS:
        return True
    if pid in _FOOD_PRODUCT_IDS:
        return False
    return await _lazy_fetch_product_category(pid) == "beverage"


async def _get_beverage_items(items: list) -> list[dict]:
    result = []
    for i in items:
        if await _is_beverage_item(i):
            result.append(i)
    return result


async def _send_barista_notification(app, order_no: str, customer: str, order_type: str, bev_items: list[dict], ts_ms: int, struk_line = None):
    """Send barista-focused notification — only beverage items shown."""
    type_labels = {
        "dine_in": "🍽 Dine-in",
        "takeaway": "🛍 Takeaway",
        "online": "📱 Online",
    }
    type_label = type_labels.get(order_type, f"📋 {order_type}")

    item_lines = []
    for item in bev_items:
        qty = int(float(item.get("quantity", 1)))
        name = (item.get("productName") or "?").strip()
        variant = item.get("variant")
        if variant:
            item_lines.append(f"  • {qty}× {name}  ({variant})")
        else:
            item_lines.append(f"  • {qty}× {name}")

    lines = [
        f"☕ PESANAN BARU — BARISTA 🕐 {_format_time_hm(ts_ms)}",
    ]
    if struk_line:
        lines.append(f"{struk_line}  |  {type_label}  |  👤 {customer}")
    else:
        lines.append(f"{order_no}  |  {type_label}  |  👤 {customer}")
    lines.append("")
    lines.append("📋 Minuman:")
    lines.extend(item_lines)
    lines.append("")
    lines.append("⏳ Mohon segera dibuat!")

    try:
        await app.bot.send_message(chat_id=BARISTA_GROUP_ID, text="\n".join(lines))
        logger.info("Barista notification sent for %s (%d beverages)", order_no, len(bev_items))
    except Exception as e:
        logger.error("send_barista_notification failed for %s: %s", order_no, e)


async def _build_food_lookup():
    """Fetch all food-category product IDs. Called once at startup."""
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
        logger.info("Food category IDs: %s", _FOOD_CATEGORY_IDS)
        products = await _fetch("pos_products", "select=_id,categoryId&limit=500")
        _FOOD_PRODUCT_IDS = {
            p["_id"]
            for p in products
            if p.get("categoryId") in _FOOD_CATEGORY_IDS
        }
        logger.info("Food product IDs loaded: %d", len(_FOOD_PRODUCT_IDS))
    except Exception as e:
        logger.warning("build_food_lookup failed: %s", e)


async def _is_food_item(item: dict) -> bool:
    """Check if order item is food — lazy-fetches unknown products from Supabase."""
    pid = item.get("productId", "")
    if not pid:
        return False
    if pid in _FOOD_PRODUCT_IDS:
        return True
    if pid in _BEVERAGE_PRODUCT_IDS:
        return False
    return await _lazy_fetch_product_category(pid) == "food"


async def _get_food_items(items: list) -> list[dict]:
    result = []
    for i in items:
        if await _is_food_item(i):
            result.append(i)
    return result


async def _send_kitchen_notification(app, order_no: str, customer: str, order_type: str, food_items: list[dict], ts_ms: int, struk_line = None):
    """Send kitchen-focused notification — only food items shown."""
    type_labels = {
        "dine_in": "🍽 Dine-in",
        "takeaway": "🛍 Takeaway",
        "online": "📱 Online",
    }
    type_label = type_labels.get(order_type, f"📋 {order_type}")

    item_lines = []
    for item in food_items:
        qty = int(float(item.get("quantity", 1)))
        name = (item.get("productName") or "?").strip()
        variant = item.get("variant")
        if variant:
            item_lines.append(f"  • {qty}× {name}  ({variant})")
        else:
            item_lines.append(f"  • {qty}× {name}")

    lines = [
        f"🍳 PESANAN BARU — KITCHEN 🕐 {_format_time_hm(ts_ms)}",
    ]
    if struk_line:
        lines.append(f"{struk_line}  |  {type_label}  |  👤 {customer}")
    else:
        lines.append(f"{order_no}  |  {type_label}  |  👤 {customer}")
    lines.append("")
    lines.append("📋 Makanan:")
    lines.extend(item_lines)
    lines.append("")
    lines.append("⏳ Mohon segera dibuat!")

    try:
        await app.bot.send_message(chat_id=KITCHEN_GROUP_ID, text="\n".join(lines))
        logger.info("Kitchen notification sent for %s (%d food items)", order_no, len(food_items))
    except Exception as e:
        logger.error("send_kitchen_notification failed for %s: %s", order_no, e)


async def _check_new_transactions(app):
    """Poll for new orders and expenses, report to group."""
    global _last_order_check_ms, _last_expense_check_ms, _reported_order_nos
    now_ms = int(_now_wib().timestamp() * 1000)

    # Periodic dedup set cleanup (max 500 entries)
    if len(_reported_order_nos) > 500:
        _reported_order_nos.clear()
        logger.info("Cleared reported order dedup set")

    # Initialize on first run
    if _last_order_check_ms == 0:
        _last_order_check_ms = now_ms - 60_000  # 1 min lookback
    if _last_expense_check_ms == 0:
        _last_expense_check_ms = now_ms - 60_000

    try:
        # ── Check new orders (5-minute lookback to catch late-completing orders) ──
        lookback_ms = now_ms - 300_000  # 5 minutes
        if _last_order_check_ms < lookback_ms:
            _last_order_check_ms = lookback_ms

        orders = await _fetch(
            "pos_orders",
            f"select=orderNumber,totalAmount,paymentMethod,createdAt,items,customerName,orderType,_creationTime,daily_receipt_no,receipt_kind"
            f"&status=in.(completed,paid)"
            f"&_creationTime=gt.{_last_order_check_ms - 1}"
            f"&_creationTime=lte.{now_ms}"
            f"&order=_creationTime.asc&limit=20",
        )

        for o in orders:
            order_no = o.get("orderNumber", "???")
            # Skip if already reported in this session
            if order_no in _reported_order_nos:
                continue

            ts = int(float(o.get("_creationTime") or o.get("createdAt") or 0))
            amount = float(o.get("totalAmount") or 0)
            payment = (o.get("paymentMethod") or "-").upper()
            customer = o.get("customerName") or "Pelanggan"
            order_type = (o.get("orderType") or "dine_in")
            items = o.get("items") or []
            item_list = ", ".join(
                f"{i.get('productName', '?').strip()} x{int(float(i.get('quantity', 1)))}"
                for i in items[:3]
            )
            if len(items) > 3:
                item_list += f" +{len(items) - 3} item"

            daily_no = o.get("daily_receipt_no")
            receipt_kind = o.get("receipt_kind")
            receipt_labels = {"dine_in": "Dine In", "takeaway": "Takeaway", "online": "Online"}
            receipt_label = receipt_labels.get(receipt_kind, "Struk") if receipt_kind else None
            struk_line = f"STRUK {receipt_label} No.{daily_no}" if (daily_no and receipt_label) else None

            shift = await _find_shift_at_time(ts)
            cashier = shift.get("cashier_name", "?")
            team = shift.get("team_members", "")

            # ── Regular transaction report ──
            lines = []
            if struk_line:
                lines.append(f"🧾 Pesanan Baru — {_format_time_ms(ts)}")
                lines.append(f"{struk_line} | {order_no} | Rp{amount:,.0f} | {payment}")
            else:
                lines.append(f"🧾 Pesanan Baru — {_format_time_ms(ts)}")
                lines.append(f"{order_no} | Rp{amount:,.0f} | {payment}")
            lines.append(f"📦 {item_list}")
            lines.append(f"👤 {customer}")
            lines.append(f"👥 Kasir: {cashier}" + (f" | Tim: {team}" if team else ""))
            await _send_to_group(app, "\n".join(lines))
            await asyncio.sleep(0.3)

            # ── Barista notification: only if order has beverage items ──
            bev_items = await _get_beverage_items(items)
            if bev_items:
                await _send_barista_notification(app, order_no, customer, order_type, bev_items, ts, struk_line)
                await asyncio.sleep(0.3)

            # ── Kitchen notification: only if order has food items ──
            food_items = await _get_food_items(items)
            if food_items:
                await _send_kitchen_notification(app, order_no, customer, order_type, food_items, ts, struk_line)
                await asyncio.sleep(0.3)

            # Mark as reported
            _reported_order_nos.add(order_no)

        # Always advance cursor to prevent re-querying same window
        _last_order_check_ms = now_ms

        # ── Check new expenses ──
        fin_rows = await _fetch(
            "pos_financial_transactions",
            f"select=amount,category,description,date,metadata"
            f"&type=eq.expense"
            f"&date=gt.{_last_expense_check_ms - 1}"
            f"&date=lte.{now_ms}"
            f"&order=date.asc&limit=10",
        )

        for x in fin_rows:
            ts = int(float(x.get("date") or 0))
            amount = float(x.get("amount") or 0)
            cat = x.get("category") or "Lainnya"
            desc = x.get("description") or ""

            shift = await _find_shift_at_time(ts)
            cashier = shift.get("cashier_name", "?")

            lines = [
                f"💸 Pengeluaran — {_format_time_ms(ts)}",
                f"{cat} | Rp{amount:,.0f}",
            ]
            if desc:
                lines.append(f"📝 {desc}")
            if cashier:
                lines.append(f"👥 Kasir: {cashier}")
            await _send_to_group(app, "\n".join(lines))
            await asyncio.sleep(0.3)

        # Always advance expense cursor
        _last_expense_check_ms = now_ms

    except Exception as e:
        logger.warning("check_new_transactions failed: %s", e)


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
    from apscheduler.schedulers.asyncio import AsyncIOScheduler

    # Build beverage product lookup for barista notifications
    await _build_beverage_lookup()

    # Build food product lookup for kitchen notifications
    await _build_food_lookup()

    # Build marketlist ingredient category lookup
    from marketlist import build_lookup
    try:
        await build_lookup(_fetch)
        logger.info("Marketlist ingredient category lookup built")
    except Exception as e:
        logger.warning("Marketlist build_lookup failed: %s", e)

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
        while True:
            await asyncio.sleep(30)
            await _check_new_transactions(app)

    asyncio.create_task(_poll_loop())
    logger.info("Auto-reporter: real-time polling started (30s interval)")


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


async def _start_http_server(bot_app, port=8001):
    from aiohttp import web

    app = web.Application()
    app["bot"] = bot_app.bot
    app.router.add_post("/send-report", _handle_send_report)
    app.router.add_route("OPTIONS", "/send-report", _handle_send_report)
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "0.0.0.0", port)
    await site.start()
    logger.info("HTTP push-report endpoint listening on port %s", port)


# ===================================================================
# Main
# ===================================================================

def main():
    if not BOT_TOKEN:
        raise RuntimeError("TELEGRAM_BOT_TOKEN belum di-set")
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise RuntimeError("SUPABASE_URL / SUPABASE_KEY belum di-set")

    async def _post_init(application: Application):
        await _start_http_server(application, port=8001)
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

    # Alias (backward compat)
    app.add_handler(CommandHandler("kpi_hari_ini", cmd_ringkasan_hari_ini))  # deprecated

    # Callbacks (inline keyboard)
    app.add_handler(CallbackQueryHandler(on_callback))

    # Message handlers (order matters — photo before text)
    app.add_handler(MessageHandler(filters.PHOTO, on_photo))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, on_text))

    logger.info("Starting Yumi AI bot with full feature parity...")
    app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
