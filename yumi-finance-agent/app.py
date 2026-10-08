"""app.py — Yumi Finance AI Agent — Telegram Bot Khusus Keuangan.

Bot khusus untuk grup keuangan -4995568785.
Semua anggota grup bisa gunakan — tanpa batasan ALLOWED_USERS.
"""

import os
import re
import json
import base64
import io
import asyncio
import logging
from collections import Counter
from datetime import datetime, timezone, timedelta

import httpx
from dotenv import load_dotenv
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    Application, CommandHandler, MessageHandler,
    CallbackQueryHandler, ContextTypes, filters,
)
from PIL import Image

from hermes_adapter import (
    TelegramContext,
    audit_event,
    build_request,
    project_scope_summary,
    validate_response,
)

# ── HTTP Server for transaction analysis ────────────────────────────
try:
    from aiohttp import web
except ImportError:
    web = None  # fallback: endpoint not available

load_dotenv()

# ── Config ─────────────────────────────────────────────────────────
BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
FINANCE_GROUP_ID = int(os.getenv("FINANCE_GROUP_ID", "-1003916990045"))
SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_EDGE_URL = os.getenv("SUPABASE_EDGE_URL", "").rstrip("/") or SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
# Finance Agent is a server-side trusted worker; prefer service role for finance views
# because the public/anon key cannot read protected financial transaction data.
SUPABASE_KEY = SUPABASE_SERVICE_ROLE_KEY or os.getenv("SUPABASE_KEY", "")
SUPABASE_ACCESS_TOKEN = os.getenv("SUPABASE_ACCESS_TOKEN", "")

# SumoPod API — untuk AI chat & vision/OCR
SUMOPOD_API_KEY = os.getenv("SUMOPOD_API_KEY", "sk-UfA-KXloOB3ZLHSQWxb0Cw")

logging.basicConfig(
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger("yumi-finance")

WIB = timezone(timedelta(hours=7))
MAX_IMAGE_SIZE = 1800
JPEG_QUALITY = 88

# Kualitas untuk penyimpanan gambar struk (lebih tinggi agar terbaca)
STORAGE_MAX_IMAGE_SIZE = 2400
STORAGE_JPEG_QUALITY = 95

# ── Inisialisasi module ────────────────────────────────────────────
from finance import FinanceManager
from inventory import InventoryManager, _find_inventory_match
from orchestrator import FinanceOrchestrator, OrchestratorResult
from categories import auto_categorize, categorize_item, categorize_item_with_memory, get_category_label, format_amount, FINANCE_CATEGORIES, get_all_categories, add_dynamic_category, ai_categorize_item, auto_create_category_in_db
from sumopod_client import SumoPodClient
from memory import MemoryManager, normalize_name
from item_normalization import expand_item_alias, normalize_unit, load_aliases_from_db
from db_categories import build_resolver
from analyzer import TransactionAnalyzer
from local_ocr import local_vision_json
from receipt_inventory_adapter import ReceiptInventoryAdapter, ReceiptItemCandidate, ReceiptPersistenceInput
from receipt_inventory_adapter import stable_id
from rescan_receipts_with_ai import compact_prompt, image_uri, missing_fields
from receipt_inventory_adapter import stable_id
from rescan_receipts_with_ai import compact_prompt, image_uri, missing_fields
# (no supplier import needed — moved to Yumi Purchasing)

finance = FinanceManager(SUPABASE_URL, SUPABASE_KEY, SUPABASE_SERVICE_ROLE_KEY, f"{SUPABASE_EDGE_URL}/functions/v1/yumi-ai")
inventory = InventoryManager(SUPABASE_URL, SUPABASE_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ACCESS_TOKEN)
orchestrator = FinanceOrchestrator(SUMOPOD_API_KEY, SUPABASE_URL, SUPABASE_KEY)
memory = MemoryManager(SUPABASE_URL, SUPABASE_KEY, SUPABASE_SERVICE_ROLE_KEY)
AI_BASE_URL = os.getenv("NINEROUTER_BASE_URL") or os.getenv("SUMOPOD_BASE_URL", "http://127.0.0.1:20128/v1")
analyzer = TransactionAnalyzer(SUMOPOD_API_KEY, AI_BASE_URL, SUPABASE_URL, SUPABASE_ACCESS_TOKEN)
receipt_inventory = ReceiptInventoryAdapter(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or SUPABASE_KEY)
# supplier moved to Yumi Purchasing

# ── In-memory state: pending confirmations ─────────────────────────
# { callback_data: {"type": "new_ingredient", "data": {...}} }
_pending_actions: dict[str, dict] = {}

# ── File persistence untuk session ─────────────────────────────────
import json as _json
PENDING_FILE = os.path.join(os.path.dirname(__file__), ".pending_sessions.json")

def _load_pending():
    global _receipt_pending, _pending_actions
    try:
        if os.path.exists(PENDING_FILE):
            with open(PENDING_FILE) as f:
                data = _json.load(f)
            _receipt_pending.update(data.get("receipts", {}))
            _pending_actions.update(data.get("actions", {}))
    except Exception as e:
        logger.warning("Failed to load pending sessions: %s", e)

def _save_pending():
    try:
        data = {
            "receipts": _receipt_pending,
            "actions": _pending_actions,
        }
        with open(PENDING_FILE, "w") as f:
            _json.dump(data, f, default=str)
    except Exception as e:
        logger.warning("Failed to save pending sessions: %s", e)


# ── Supabase helpers (shared auth via employee_telegram_links) ────


def _headers():
    return {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
    }


async def _fetch(view: str, query: str = "") -> list[dict]:
    url = f"{SUPABASE_URL}/rest/v1/{view}"
    if query:
        url = f"{url}?{query}"
    async with httpx.AsyncClient() as client:
        r = await client.get(url, headers=_headers(), timeout=15)
        r.raise_for_status()
        return r.json() if isinstance(r.json(), list) else []


async def _find_employee_by_telegram(telegram_id: int) -> dict | None:
    rows = await _fetch("employee_telegram_links",
        f"select=employee_user_id,employee_name,is_active"
        f"&telegram_user_id=eq.{telegram_id}"
        f"&is_active=eq.true&limit=1")
    return rows[0] if rows else None


async def _require_employee(update: Update) -> dict | None:
    """Cek apakah user terdaftar di employee_telegram_links.
    Returns dict {employee_user_id, employee_name} atau None."""
    if not update.effective_user:
        return None
    return await _find_employee_by_telegram(update.effective_user.id)


# ── Helpers ────────────────────────────────────────────────────────


def clean_output(text: str) -> str:
    """Bersihkan output dari karakter *, #, dan '."""
    text = text.replace("*", "").replace("#", "").replace("'", "")
    return text


def _format_ocr_error(error_text: str) -> str:
    """Pesan error OCR yang lebih akurat berdasarkan jenis kegagalan."""
    err = (error_text or "").lower()
    if "403" in err or "forbidden" in err or "401" in err:
        return (
            f"❌ Layanan OCR sedang menolak request: {error_text}\n\n"
            f"Coba lagi sebentar. Kalau masih sama, kemungkinan akses model OCR sedang dibatasi."
        )
    return (
        f"❌ Gagal membaca struk: {error_text}\n\n"
        f"Coba foto ulang dengan pencahayaan lebih baik."
    )


async def _reply(update: Update, context: ContextTypes.DEFAULT_TYPE, text: str, **kwargs):
    """Send a reply with clean_output() applied automatically."""
    await update.message.reply_text(clean_output(text), **kwargs)


async def _edit(update: Update, context: ContextTypes.DEFAULT_TYPE, text: str, **kwargs):
    """Edit message with clean_output() applied automatically."""
    if update.callback_query:
        try:
            await update.callback_query.edit_message_text(clean_output(text), **kwargs)
        except Exception:
            await update.callback_query.message.reply_text(clean_output(text), **kwargs)
    else:
        await update.message.reply_text(clean_output(text), **kwargs)


async def _edit_msg(msg, text: str, **kwargs):
    """Edit a specific message with clean_output() applied."""
    await msg.edit_text(clean_output(text), **kwargs)

def _can_respond(update: Update) -> bool:
    """Cek apakah bot boleh merespon — DM owner atau grup dengan @mention."""
    user = update.effective_user
    chat = update.effective_chat
    if not user or not chat:
        return False
    # Hanya owner 323151437 yang bisa DM
    if chat.type == "private":
        return user.id == 323151437
    # Di grup: harus @mention, reply ke bot, atau foto dari owner
    msg = update.effective_message
    if not msg:
        return False
    if msg.reply_to_message and msg.reply_to_message.from_user and msg.reply_to_message.from_user.is_bot:
        return True
    message_text = msg.text or msg.caption or ""
    if "@YummeFinanceAIbot".lower() in message_text.lower():
        return True
    # Foto dari anggota grup mana pun langsung diproses (tanpa perlu @mention)
    if msg.photo:
        return True
    return False


async def _send_or_edit(update: Update, context: ContextTypes.DEFAULT_TYPE, text: str, keyboard=None):
    """Kirim pesan baru atau edit existing."""
    if update.callback_query:
        try:
            await update.callback_query.edit_message_text(text, reply_markup=keyboard)
        except Exception:
            await update.callback_query.message.reply_text(text, reply_markup=keyboard)
    else:
        await update.message.reply_text(text, reply_markup=keyboard)


# ── Finance Keyboard ──────────────────────────────────────────────

def _finance_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([
        [InlineKeyboardButton("💰 Pemasukan", callback_data="quick_income"),
         InlineKeyboardButton("💸 Pengeluaran", callback_data="quick_expense")],
        [InlineKeyboardButton("💬 AI Chat", callback_data="quick_ai")],
    ])


def _period_keyboard(tx_type: str) -> InlineKeyboardMarkup:
    """Keyboard filter periode untuk pemasukan/pengeluaran."""
    periods = [
        ("Hari Ini", "hari_ini"),
        ("Kemarin", "kemarin"),
        ("Minggu Ini", "minggu_ini"),
        ("Minggu Lalu", "minggu_lalu"),
        ("Bulan Ini", "bulan_ini"),
        ("Bulan Lalu", "bulan_lalu"),
    ]
    buttons = []
    for label, key in periods:
        buttons.append(
            InlineKeyboardButton(f"📅 {label}", callback_data=f"period_{tx_type}_{key}")
        )
    # Split jadi 2 per baris
    rows = [buttons[i:i+2] for i in range(0, len(buttons), 2)]
    rows.append([InlineKeyboardButton("⬅️ Kembali", callback_data="back_main")])
    return InlineKeyboardMarkup(rows)


# ── Image Compression (OCR) ───────────────────────────────────────

def _compress_image(image_bytes: bytes) -> tuple[bytes, str]:
    """Compress image, return (jpeg_bytes, base64_data_uri)."""
    img = Image.open(io.BytesIO(image_bytes))
    if img.mode in ("RGBA", "P"):
        img = img.convert("RGB")
    w, h = img.size
    if max(w, h) > MAX_IMAGE_SIZE:
        ratio = MAX_IMAGE_SIZE / max(w, h)
        img = img.resize((int(w * ratio), int(h * ratio)), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=JPEG_QUALITY, optimize=True)
    jpeg_bytes = buf.getvalue()
    b64 = base64.b64encode(jpeg_bytes).decode("utf-8")
    return jpeg_bytes, f"data:image/jpeg;base64,{b64}"


async def _upload_receipt_to_storage(image_bytes: bytes, ref_id: str) -> str | None:
    """Compress with high quality (agar terbaca) dan upload ke Supabase Storage.
    Return public URL atau None.
    """
    try:
        # Kompres dengan kualitas tinggi untuk penyimpanan
        img = Image.open(io.BytesIO(image_bytes))
        if img.mode in ("RGBA", "P"):
            img = img.convert("RGB")
        w, h = img.size
        if max(w, h) > STORAGE_MAX_IMAGE_SIZE:
            ratio = STORAGE_MAX_IMAGE_SIZE / max(w, h)
            img = img.resize((int(w * ratio), int(h * ratio)), Image.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=STORAGE_JPEG_QUALITY, optimize=True, subsampling=0)
        jpeg_bytes = buf.getvalue()

        filename = f"receipt_{datetime.now(WIB).strftime('%Y%m%d_%H%M%S')}_{ref_id}.jpg"
        url = f"{SUPABASE_URL}/storage/v1/object/receipt-images/{filename}"
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                url,
                headers={
                    "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
                    "Content-Type": "image/jpeg",
                },
                content=jpeg_bytes,
            )
            resp.raise_for_status()
        public_url = f"{SUPABASE_URL}/storage/v1/object/public/receipt-images/{filename}"
        logger.info("Receipt image uploaded: %s", public_url)
        return public_url
    except Exception as e:
        logger.warning("Failed to upload receipt image to storage: %s", e)
        return None


async def _download_from_storage(url: str) -> bytes | None:
    """Download image bytes from Supabase Storage public URL."""
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            return resp.content
    except Exception as e:
        logger.warning("Failed to download from storage: %s", e)
        return None


# ── OCR Parser ─────────────────────────────────────────────────────

def _parse_amount_text(value: str | None) -> float:
    """Parse Indonesian receipt amounts like 345.375 or Rp 10,900."""
    if not value:
        return 0.0
    digits = re.sub(r"[^0-9]", "", str(value))
    return float(digits or 0)


def _parse_receipt_summary(raw_text: str) -> dict:
    """Extract receipt-level fields from raw OCR text when AI skips JSON."""
    text = raw_text or ""
    summary = {}
    total_patterns = [
        r"(?im)^\s*TOTAL\s+(?:Rp\s*)?([0-9][0-9.,]*)\s*$",
        r"(?im)\bTOTAL\s*[:=]?\s*(?:Rp\s*)?([0-9][0-9.,]*)",
    ]
    for pattern in total_patterns:
        match = re.search(pattern, text)
        if match:
            summary["total"] = _parse_amount_text(match.group(1))
            break
    subtotal = re.search(r"(?im)^\s*(?:SUB\s*TOTAL|SUBTOTAL)\s+(?:Rp\s*)?([0-9][0-9.,]*)", text)
    if subtotal:
        summary["subtotal"] = _parse_amount_text(subtotal.group(1))
    discount = re.search(r"(?im)TOTAL\s+DISCOUNT\s+(?:Rp\s*)?([0-9][0-9.,]*)", text)
    if discount:
        summary["discount"] = _parse_amount_text(discount.group(1))
    date_time = re.search(r"\b(\d{2}/\d{2}/\d{2,4})\s+(\d{1,2}:\d{2}(?::\d{2})?)\b", text)
    if date_time:
        summary["date"] = date_time.group(1)
        summary["time"] = date_time.group(2)
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    if lines:
        summary["name"] = next((line for line in lines[:8] if not line.lower().startswith(("item", "rp", "http"))), "")
    return summary


async def _parse_ocr_text(ai_reply: str) -> list[dict]:
    """Parse AI reply dari OCR untuk extract item belanjaan."""
    items = []
    item_patterns = [
        r'\d+\.\s*<b>(.+?)</b>\s*—\s*Qty:\s*(\d+(?:\.\d+)?)\s*•\s*<b>Rp\s*([\d.,]+)</b>',
        r'\d+\.\s*(.+?)\s*/\s*(\d+(?:\.\d+)?)\s*(ml|liter|l|kg|gram|gr|g|pcs|pack|ikat|bungkus)?\s*/\s*Rp\s*([\d.,]+)',
        r'\d+\.\s*(.+?)\s*—\s*(\d+(?:\.\d+)?)\s*\S*\s*—\s*Rp\s*([\d.,]+)',
        r'\d+\.\s*(.+?)\s*\((\d+)\s*\S*\)\s*Rp\s*([\d.,]+)',
        r'(?im)^\s*([A-Z0-9][A-Z0-9 .&/+-]{3,}?)\s+(\d+(?:\.\d+)?)\s*[xX]\s*([0-9][0-9.,]*)\s*$',
        r'(?im)^\s*([A-Z0-9][A-Z0-9 .&/+-]{3,}?)\s+(?:Rp\s*)?([0-9][0-9.,]*)\s*$'
    ]
    for pattern in item_patterns:
        for m in re.finditer(pattern, ai_reply):
            groups = m.groups()
            name = groups[0].strip(" -")
            if any(skip in name.upper() for skip in ("TOTAL", "SUBTOTAL", "CASH", "CHANGE", "DISCOUNT", "MEMBER")):
                continue
            if len(groups) >= 3 and re.search(r'[xX]', m.group(0)):
                qty = float(groups[1].replace(",", "."))
                price = _parse_amount_text(groups[2])
            elif len(groups) >= 2:
                qty = 1.0
                price = _parse_amount_text(groups[-1])
            else:
                continue
            if price > 0:
                items.append({"name": name[:80], "qty": qty, "price": price, "subtotal": price * qty})
    return _normalize_ocr_items(items[:30])


def _extract_pack_meta(name: str) -> tuple[str, float | None, str, str]:
    """Extract net-weight and packaging hints from OCR item name.

    Returns: (clean_name, net_weight_value, net_weight_unit, pack_type)
    """
    raw = (name or "").strip()
    if not raw:
        return "", None, "", ""

    pack_match = re.search(r"\b(VP|REPACK|PACK|PCS|SACHET|POUCH|BAG|BOTOL|BOX|KALENG)\b", raw, re.IGNORECASE)
    pack_type = pack_match.group(1).upper() if pack_match else ""

    weight_match = re.search(r"\b(\d+(?:[.,]\d+)?)\s*(KG|KILO|GR|GRAM|G|LITER|LITRE|LTR|L|ML)\b", raw, re.IGNORECASE)
    net_weight_value: float | None = None
    net_weight_unit = ""
    if weight_match:
        try:
            net_weight_value = float(weight_match.group(1).replace(",", "."))
        except Exception:
            net_weight_value = None
        u = weight_match.group(2).upper()
        unit_map = {
            "KILO": "kg", "KG": "kg",
            "GR": "gr", "GRAM": "gr", "G": "g",
            "LITER": "l", "LITRE": "l", "LTR": "l", "L": "l",
            "ML": "ml",
        }
        net_weight_unit = unit_map.get(u, u.lower())

    clean_name = raw
    clean_name = re.sub(r"\b\d+(?:[.,]\d+)?\s*(?:KG|KILO|GR|GRAM|G|LITER|LITRE|LTR|L|ML)\b", " ", clean_name, flags=re.IGNORECASE)
    clean_name = re.sub(r"\b(?:VP|REPACK|PACK|PCS|SACHET|POUCH|BAG|BOTOL|BOX|KALENG)\b", " ", clean_name, flags=re.IGNORECASE)
    clean_name = re.sub(r"\s+", " ", clean_name).strip(" -/")

    return clean_name or raw, net_weight_value, net_weight_unit, pack_type


def _normalize_ocr_items(items: list[dict]) -> list[dict]:
    """Normalize OCR items so qty/unit/name/weight are consistent for downstream usage."""
    normalized: list[dict] = []
    for it in (items or []):
        name_raw = str(it.get("name") or "").strip()
        if not name_raw:
            continue

        clean_name, net_weight_value, net_weight_unit, pack_type = _extract_pack_meta(name_raw)
        alias_name, alias_from = expand_item_alias(clean_name)
        clean_name = alias_name or clean_name

        try:
            qty = float(it.get("qty") or 1)
        except Exception:
            qty = 1.0
        try:
            price = float(it.get("price") or 0)
        except Exception:
            price = 0.0
        try:
            subtotal = float(it.get("subtotal") or 0)
        except Exception:
            subtotal = 0.0
        if subtotal <= 0 and qty > 0 and price > 0:
            subtotal = qty * price

        unit = normalize_unit(str(it.get("unit") or ""))
        if not unit:
            unit = normalize_unit(_extract_unit(name_raw)) or ("pack" if pack_type else "pcs")

        item_obj = {
            "name": clean_name[:80],
            "qty": qty,
            "price": price,
            "subtotal": subtotal,
            "unit": unit,
            "raw_name": name_raw[:120],
        }
        if net_weight_value is not None:
            item_obj["net_weight_value"] = net_weight_value
        if net_weight_unit:
            item_obj["net_weight_unit"] = net_weight_unit
        if pack_type:
            item_obj["pack_type"] = pack_type
        if alias_from:
            item_obj["alias_resolved_from"] = alias_from[:120]

        normalized.append(item_obj)
    return normalized[:80]


# ── New Ingredient Confirmation ────────────────────────────────────

async def _handle_new_ingredient(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle callback dari inline keyboard konfirmasi bahan baru."""
    query = update.callback_query
    await query.answer()
    data = query.data

    if data.startswith("new_ingredient_save_"):
        # Simpan bahan baru
        idx = data.replace("new_ingredient_save_", "")
        pending = _pending_actions.get(idx)
        if not pending:
            await query.edit_message_text("❌ Sesi kadaluarsa. Silakan coba lagi.")
            return

        item = pending["item"]
        result = await inventory.add_new_item(
            name=item["name"],
            qty=item.get("qty", 0),
            unit=item.get("unit", "pcs"),
            price=item.get("price", 0),
        )
        if result:
            await inventory.log_purchase(item["name"], item.get("qty", 0), item.get("unit", "pcs"), item.get("price", 0) * item.get("qty", 1), item.get("merchant", "Yumi Finance"))
            await query.edit_message_text(
                f"✅ {item['name']} berhasil ditambahkan ke inventory.\n"
                f"   Qty: {item.get('qty', 0)} {item.get('unit', 'pcs')}\n"
                f"   Harga: {format_amount(int(item.get('price', 0) * item.get('qty', 1)))}"
            )
        else:
            await query.edit_message_text(f"❌ Gagal menyimpan {item['name']}.")
        _pending_actions.pop(idx, None)
        _save_pending()

    elif data.startswith("new_ingredient_skip_"):
        idx = data.replace("new_ingredient_skip_", "")
        pending = _pending_actions.pop(idx, None)
        await query.edit_message_text(f"⏭️ {pending['item']['name']} dilewati." if pending else "⏭️ Dilewati.")
        _save_pending()

    elif data.startswith("new_ingredient_overwrite_"):
        idx = data.replace("new_ingredient_overwrite_", "")
        pending = _pending_actions.get(idx)
        if not pending:
            await query.edit_message_text("❌ Sesi kadaluarsa.")
            return

        item = pending["item"]
        matched = pending.get("matched")
        if matched:
            inv_id = matched.get("_id")
            await inventory.restock_item(inv_id, float(matched.get("quantity", 0)), item.get("qty", 0), item.get("unit", "pcs"), price=float(item.get("price", 0) or 0))
            await inventory.log_purchase(matched.get("ingredientName", item["name"]), item.get("qty", 0), item.get("unit", "pcs"), item.get("price", 0) * item.get("qty", 1), item.get("merchant", "Yumi Finance"))
            await query.edit_message_text(
                f"🔄 {matched['ingredientName']} di-update.\n"
                f"   +{item.get('qty', 0)} {item.get('unit', 'pcs')}\n"
                f"   Total biaya: {format_amount(int(item.get('price', 0) * item.get('qty', 1)))}"
            )
        _pending_actions.pop(idx, None)
        _save_pending()


# ── OCR Photo Handler ──────────────────────────────────────────────

# Pending receipt confirmations (terpisah dari _pending_actions ingredient)
_receipt_pending: dict[str, dict] = {}
_approved_candidate_map: dict[str, dict] = {}

# ── Bulk OCR: album multi-foto ──────────────────────────────────────
_album_buffer: dict[str, dict] = {}
_album_lock = asyncio.Lock()
ALBUM_TIMEOUT = 5.0  # detik — tunggu semua foto terkumpul
_MAX_CONCURRENT_OCR = 5
_ocr_semaphore = asyncio.Semaphore(_MAX_CONCURRENT_OCR)
_bulk_pending: dict[str, list[dict]] = {}
_bulk_select_state: dict[str, dict] = {}

# ── Order sync cursor ──────────────────────────────────────────────
_last_order_check_ms: int = 0
_synced_order_nos: set[str] = set()


async def on_photo(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle foto struk — OCR structured JSON → tampilkan item → minta konfirmasi."""
    if not _can_respond(update):
        return

    # ── Employee auth ────────────────────────────────────────
    # Auto-recognize user (fallback jika belum diset via on_text)
    if "emp" not in context.user_data:
        emp = await _require_employee(update)
        if emp:
            context.user_data["emp"] = emp

    await context.bot.send_chat_action(chat_id=update.effective_chat.id, action="typing")
    msg = await update.message.reply_text("🔍 Memproses struk...")
    scan_id = f"scan_{update.effective_chat.id}_{update.message.message_id}"

    try:
        # Compress image
        photo = update.message.photo[-1]
        file = await context.bot.get_file(photo.file_id)
        image_bytes = bytes(await file.download_as_bytearray())
        jpeg_bytes, compressed_uri = _compress_image(image_bytes)

        # Panggil SumoPod vision_json untuk structured OCR
        sp_client = SumoPodClient(SUMOPOD_API_KEY)
        vision_result = await sp_client.vision_json(image_base64_uri=compressed_uri, timeout=90)

        if not vision_result.get("success"):
            # Fallback ke local OCR (EasyCPU + DeepSeek parsing)
            logger.info("Vision AI gagal, fallback ke local OCR...")
            await msg.edit_text("🔍 Vision AI tidak tersedia, beralih ke OCR lokal...")
            vision_result = await local_vision_json(image_bytes, sumopod_client=sp_client)

        if not vision_result.get("success"):
            await msg.edit_text(
                _format_ocr_error(vision_result.get('error', 'Unknown')),
                reply_markup=_finance_keyboard(),
            )
            return

        data = vision_result["data"]

        # Extract fields
        merchant = (data.get("name") or "").strip()
        receipt_date = data.get("date") or ""
        receipt_time = data.get("time") or ""
        items = data.get("items") or []
        total = float(data.get("total") or 0)
        subtotal = float(data.get("subtotal") or 0)
        tax = float(data.get("tax") or 0)
        discount = float(data.get("discount") or 0)
        service_charge = float(data.get("serviceCharge") or 0)
        payment_method = data.get("paymentMethod") or ""
        receipt_number = data.get("receiptNumber") or ""
        ai_category = data.get("category") or ""
        confidence = data.get("confidence", 0)
        raw_text = data.get("rawText") or ""

        if raw_text:
            summary = _parse_receipt_summary(raw_text)
            merchant = merchant or summary.get("name", "")
            receipt_date = receipt_date or summary.get("date", "")
            receipt_time = receipt_time or summary.get("time", "")
            total = total or float(summary.get("total") or 0)
            subtotal = subtotal or float(summary.get("subtotal") or 0)
            discount = discount or float(summary.get("discount") or 0)

        # Kalau items kosong, panggil OCR khusus item agar daftar barang tetap tampil.
        if not items:
            try:
                items = await sp_client.vision_items(compressed_uri, timeout=90)
            except Exception as e:
                logger.warning("vision_items fallback failed: %s", e)
        if not items and raw_text:
            items = await _parse_ocr_text(raw_text)

        # Normalize OCR item names/units/net weight (applies to both vision_json and fallbacks)
        items = _normalize_ocr_items(items)
        for item_index, item in enumerate(items, 1):
            item["ocr_item_id"] = f"{scan_id}_item_{item_index:02d}"
            item["ocr_source_position"] = item_index

        # Hitung total dari items (fallback)
        items_total = 0.0
        for item in items:
            price = float(item.get("price") or 0)
            qty = float(item.get("qty") or 1)
            item_subtotal = float(item.get("subtotal") or 0)
            items_total += item_subtotal if item_subtotal > 0 else (price * qty)

        if total <= 0 and items_total > 0:
            total = items_total
        if subtotal <= 0:
            subtotal = items_total
        if discount <= 0 and subtotal > 0 and total > 0 and subtotal > total:
            discount = subtotal - total

        # Kategorisasi
        category_text = merchant + " " + " ".join(item.get("name", "") for item in items)
        category, cat_confidence = auto_categorize(category_text)
        if ai_category and confidence > 0.7:
            # Pakai kategori dari AI jika confidence tinggi
            for cat_key, cat_info in FINANCE_CATEGORIES.items():
                if cat_info["label"].lower() == ai_category.lower():
                    category = cat_key
                    break

        # ── Format tampilan ─────────────────────────────────────
        lines = ["📸 Struk Berhasil Dibaca!", ""]
        if vision_result.get("_ocr_local"):
            lines.append("⚠️ OCR Lokal (akurasi mungkin kurang)")
            lines.append("")

        if merchant:
            lines.append(f"🏪 {merchant}")
        if receipt_date:
            dt = receipt_date
            if receipt_time:
                dt += f" {receipt_time}"
            lines.append(f"📅 {dt}")
        else:
            lines.append("⚠️ Tanggal tidak terbaca — klik ✏️ Edit Tanggal untuk isi")
        if receipt_number:
            lines.append(f"🧾 No: {receipt_number}")
        if payment_method:
            lines.append(f"💳 Bayar: {payment_method}")
        lines.append("")

        # ── Kategorisasi per-item (AI-enhanced) ─────────────
        if items:
            lines.append("📋 Daftar Item:")
            for i, item in enumerate(items, 1):
                name = item.get("name", f"Item {i}").strip()
                qty = float(item.get("qty") or 1)
                price = float(item.get("price") or 0)
                item_sub = float(item.get("subtotal") or 0)
                unit = item.get("unit", "").strip()
                if item_sub <= 0:
                    item_sub = price * qty

                # ── AI kategori per-item ────────────────────────
                item_cat, item_cat_conf, _ = categorize_item(name, price)
                if item_cat_conf == "low":
                    ai_c, ai_cf, _ = await ai_categorize_item(
                        name, price, merchant
                    )
                    if ai_cf == "high" and ai_c != "lainnya":
                        item_cat = ai_c
                        item_cat_conf = "high"
                        asyncio.ensure_future(memory.record_item_category(
                            name, ai_c, source="ai", merchant=merchant,
                        ))

                item_cat_info = FINANCE_CATEGORIES.get(item_cat) \
                    or get_all_categories().get(item_cat, {})
                item_icon = item_cat_info.get("icon", "📌") if item_cat_info else "📌"
                cat_tag = f"{item_icon}" if item_cat_conf in ("high", "medium") else "❓"

                qty_str = f"{qty:.0f}" if qty == int(qty) else f"{qty:.1f}"
                unit_str = f" {unit}" if unit else ""
                item_sub_fmt = format_amount(int(item_sub))
                lines.append(f"  {i}. {cat_tag} {name} — {qty_str}{unit_str} × {format_amount(int(price))} = {item_sub_fmt}")
            lines.append("")
        lines.append("💰 Ringkasan:")
        if subtotal > 0 and abs(subtotal - total) > 1:
            lines.append(f"  Subtotal: {format_amount(int(subtotal))}")
        if discount > 0:
            lines.append(f"  Diskon: -{format_amount(int(discount))}")
        if tax > 0:
            lines.append(f"  Pajak: {format_amount(int(tax))}")
        if service_charge > 0:
            lines.append(f"  Service: {format_amount(int(service_charge))}")
        lines.append(f"  TOTAL: {format_amount(int(total))}")
        lines.append("")
        lines.append(f"📁 Kategori: {get_category_label(category)}")
        if confidence < 0.8:
            lines.append(f"  ⚠️ Confidence AI: {confidence:.0%}")
        lines.append("")
        lines.append("Simpan sebagai apa?")

        # Simpan data untuk callback
        ref_id = f"rcpt_{len(_receipt_pending)}"

        # Tag employee name ke notes jika terdaftar
        emp = context.user_data.get("emp")
        notes = f"Diproses oleh: {emp['employee_name']}" if emp else ""

        _receipt_pending[ref_id] = {
            "merchant": merchant,
            "scan_id": scan_id,
            "vision_attempt_id": f"{scan_id}_vision_01",
            "date": receipt_date,
            "time": receipt_time,
            "items": items,
            "total": total,
            "subtotal": subtotal,
            "tax": tax,
            "discount": discount,
            "service_charge": service_charge,
            "payment_method": payment_method,
            "receipt_number": receipt_number,
            "category": category,
            "raw_text": raw_text,
            "confidence": confidence,
            "receipt_image_url": None,
            "notes": notes,
        }
        _save_pending()

        # Upload compressed image to Supabase Storage
        receipt_image_url = await _upload_receipt_to_storage(image_bytes, ref_id)
        if receipt_image_url:
            _receipt_pending[ref_id]["receipt_image_url"] = receipt_image_url
            _save_pending()

        keyboard = InlineKeyboardMarkup([
            [
                InlineKeyboardButton("💰 Pemasukan", callback_data=f"receipt_income_{ref_id}"),
                InlineKeyboardButton("💸 Pengeluaran", callback_data=f"receipt_expense_{ref_id}"),
            ],
            [
                InlineKeyboardButton("✏️ Edit Kategori", callback_data=f"receipt_editcat_{ref_id}"),
                InlineKeyboardButton("✏️ Edit Tanggal", callback_data=f"editdate_{ref_id}"),
            ],
            [
                InlineKeyboardButton("✏️ Edit Item", callback_data=f"edititem_{ref_id}"),
            ],
            [
                InlineKeyboardButton("❌ Batal", callback_data=f"receipt_cancel_{ref_id}"),
            ],
        ])

        await msg.edit_text("\n".join(lines), reply_markup=keyboard)

    except Exception as e:
        logger.exception("OCR failed")
        await msg.edit_text(f"❌ Gagal memproses struk: {e}", reply_markup=_finance_keyboard())


# ── Bulk OCR: Album Multi-Foto ─────────────────────────────────────

async def on_album(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle foto — route ke single atau bulk berdasarkan media_group_id."""
    if not _can_respond(update):
        return

    media_group_id = update.message.media_group_id
    if not media_group_id:
        # Single photo — fallback ke handler existing
        return await on_photo(update, context)

    # Bulk/album mode
    photo = update.message.photo[-1]
    chat_id = update.effective_chat.id

    async with _album_lock:
        if media_group_id not in _album_buffer:
            status_msg = await update.message.reply_text("📸 Mengumpulkan foto...")
            _album_buffer[media_group_id] = {
                "photos": [],
                "status_msg_id": status_msg.message_id,
                "chat_id": chat_id,
                "timer": None,
            }
        buf = _album_buffer[media_group_id]
        buf["photos"].append(photo)
        if buf.get("timer"):
            buf["timer"].cancel()
        buf["timer"] = asyncio.create_task(
            _process_album_after_delay(media_group_id, chat_id, context, buf["status_msg_id"])
        )


async def _process_album_after_delay(media_group_id: str, chat_id: int, context, status_msg_id: int):
    """Tunggu 1.5 detik setelah foto terakhir, lalu proses semua."""
    await asyncio.sleep(ALBUM_TIMEOUT)

    async with _album_lock:
        buf = _album_buffer.pop(media_group_id, None)
        if not buf:
            return

    photos = buf.get("photos", [])
    if not photos:
        return

    n = len(photos)
    await context.bot.edit_message_text(
        chat_id=chat_id, message_id=status_msg_id,
        text=f"🔍 Memproses {n} struk sekaligus..."
    )
    await context.bot.send_chat_action(chat_id=chat_id, action="typing")

    results = await _ocr_bulk(context, photos, chat_id, status_msg_id)
    await _display_bulk_summary(context, results, chat_id, status_msg_id)


async def _ocr_one(sp_client, photo, context, idx: int, total: int, chat_id: int, status_msg_id: int):
    """OCR satu foto — return hasil vision_json + fallback item parsing."""
    try:
        file = await context.bot.get_file(photo.file_id)
        image_bytes = bytes(await file.download_as_bytearray())
        jpeg_bytes, compressed_uri = _compress_image(image_bytes)

        async with _ocr_semaphore:
            vision_result = await sp_client.vision_json(image_base64_uri=compressed_uri, timeout=90)

        if not vision_result.get("success"):
            # Fallback ke local OCR untuk bulk
            logger.info(f"Bulk OCR vision AI gagal untuk struk #{idx+1}, fallback ke local OCR...")
            vision_result = await local_vision_json(image_bytes, sumopod_client=sp_client)

        done = idx + 1
        try:
            await context.bot.edit_message_text(
                chat_id=chat_id, message_id=status_msg_id,
                text=f"🔍 Memproses {total} struk... ({done}/{total})"
            )
        except Exception:
            pass

        # ── Fallback item extraction ──────────────────────────
        if vision_result.get("success"):
            data = vision_result.get("data", {})
            items = data.get("items") or []
            raw_text = data.get("rawText") or ""

            if not items:
                try:
                    fallback_items = await sp_client.vision_items(compressed_uri, timeout=90)
                    if fallback_items:
                        if not isinstance(data, dict):
                            data = {}
                        data["items"] = fallback_items
                        vision_result["data"] = data
                        logger.info(f"Bulk OCR fallback vision_items: {len(fallback_items)} item for struk #{idx+1}")
                except Exception as e:
                    logger.warning(f"Bulk OCR vision_items fallback failed for struk #{idx+1}: {e}")

            if not items and raw_text:
                try:
                    text_items = await _parse_ocr_text(raw_text)
                    if text_items:
                        data = vision_result.get("data", {})
                        if not isinstance(data, dict):
                            data = {}
                        data["items"] = text_items
                        vision_result["data"] = data
                        logger.info(f"Bulk OCR fallback _parse_ocr_text: {len(text_items)} item for struk #{idx+1}")
                except Exception as e:
                    logger.warning(f"Bulk OCR _parse_ocr_text fallback failed for struk #{idx+1}: {e}")

            # Normalize OCR item names/units/net weight for bulk path too
            data = vision_result.get("data", {})
            if isinstance(data, dict):
                data["items"] = _normalize_ocr_items(data.get("items") or [])

            # Upload image to storage for archival
            ref_id = f"bulk_{chat_id}_{idx}"
            receipt_image_url = await _upload_receipt_to_storage(image_bytes, ref_id)
            if receipt_image_url:
                if isinstance(data, dict):
                    data["receipt_image_url"] = receipt_image_url
                vision_result["receipt_image_url"] = receipt_image_url

        return vision_result
    except Exception as e:
        logger.error(f"OCR bulk error [{idx}/{total}]: {e}")
        return {"success": False, "error": str(e)}


async def _ocr_bulk(context, photos: list, chat_id: int, status_msg_id: int) -> list[dict]:
    """Proses semua foto dalam album concurrent — return list of OCR results."""
    total = len(photos)
    sp_client = SumoPodClient(SUMOPOD_API_KEY)
    tasks = [
        _ocr_one(sp_client, photo, context, i, total, chat_id, status_msg_id)
        for i, photo in enumerate(photos)
    ]
    results = await asyncio.gather(*tasks)
    return list(results)


async def _display_bulk_summary(context, results: list[dict], chat_id: int, status_msg_id: int):
    """Tampilkan ringkasan semua struk + keyboard bulk action."""
    successes = [r for r in results if r.get("success")]
    failures = [r for r in results if not r.get("success")]

    if not successes:
        failed_errors = [str(r.get("error", "Unknown")) for r in failures if r.get("error")]
        detail = "\n".join(failed_errors[:2])
        message = "❌ Semua struk gagal dibaca."
        if detail:
            message += f"\n{detail}"
        else:
            message += "\nCoba foto ulang atau kirim ulang sebentar lagi."
        await context.bot.edit_message_text(
            chat_id=chat_id, message_id=status_msg_id,
            text=message,
            reply_markup=_finance_keyboard(),
        )
        return

    lines = [f"📸 {len(successes)} Struk Berhasil Dibaca!", ""]

    grand_total = 0
    receipt_list = []
    # ── Bulk vs Satuan counters ───────────────────────────────
    bulk_count = 0
    bulk_amount = 0
    satuan_count = 0
    satuan_amount = 0
    # Max item lines per receipt (to avoid Telegram 4096 char limit)
    MAX_ITEM_LINES = 8

    for i, r in enumerate(successes):
        data = r["data"]
        merchant = (data.get("name") or "Tanpa Nama").strip()
        total_val = float(data.get("total") or 0)
        items = data.get("items") or []
        date_str = data.get("date") or "?"

        grand_total += total_val
        receipt_list.append({
            "idx": i + 1,
            "merchant": merchant,
            "date": date_str,
            "total": total_val,
            "items": items,
            "time": data.get("time") or "",
            "payment_method": data.get("paymentMethod") or "",
            "receipt_number": data.get("receiptNumber") or "",
            "subtotal": float(data.get("subtotal") or 0),
            "tax": float(data.get("tax") or 0),
            "discount": float(data.get("discount") or 0),
            "service_charge": float(data.get("serviceCharge") or 0),
            "raw_text": data.get("rawText") or "",
            "confidence": data.get("confidence", 0),
            "category": data.get("category") or "",
            "receipt_image_url": data.get("receipt_image_url") or r.get("receipt_image_url") or "",
        })

        # ── Header receipt ────────────────────────────────────
        status_icon = "✅"
        lines.append(f"{i+1}. {status_icon} {merchant}")
        lines.append(f"   📅 {date_str}  |  💰 {format_amount(int(total_val))}")
        lines.append(f"   📦 {len(items)} item:")
        # ── Detail item ───────────────────────────────────────
        unknown_items = []
        for j, item in enumerate(items):
            if j >= MAX_ITEM_LINES:
                lines.append(f"      ... + {len(items) - MAX_ITEM_LINES} item lain")
                break
            name = item.get("name", f"Item {j+1}").strip()
            qty = float(item.get("qty") or 1)
            price = float(item.get("price") or 0)
            item_sub = float(item.get("subtotal") or 0)
            unit = item.get("unit", "").strip()
            if item_sub <= 0:
                item_sub = price * qty

            # ── Classify bulk vs satuan ─────────────────────
            is_bulk = qty > 1 or unit.lower() in ("karton", "dus", "pack", "lusin", "kg", "liter", "bal")
            if is_bulk:
                bulk_count += 1
                bulk_amount += item_sub
            else:
                satuan_count += 1
                satuan_amount += item_sub

            # ── Per-item categorization (keyword + memory + merchant hint) ──
            cat_key, cat_conf, cat_suggest, cat_score = categorize_item_with_memory(
                name,
                price,
                merchant or "",
                memory,
            )

            # ── AI fallback: untuk low + medium lemah ──────────
            # Banyak miss terjadi saat keyword match medium tapi konteks item ambigu.
            if cat_conf == "low" or (cat_conf == "medium" and cat_score < 0.65):
                ai_cat, ai_conf, ai_label = await ai_categorize_item(
                    name, price, merchant or ""
                )
                if ai_conf == "high" and ai_cat != "lainnya":
                    cat_key = ai_cat
                    cat_conf = "high"
                    cat_suggest = ""
                    # Record ke memory biar next time langsung
                    asyncio.ensure_future(memory.record_item_category(
                        name, ai_cat, source="ai",
                        merchant=merchant or "",
                    ))
                    # Auto-create category kalo dari AI & gak ada di DB
                    if ai_cat not in FINANCE_CATEGORIES:
                        cat_info_all = get_all_categories().get(ai_cat, {})
                        ai_label_name = cat_info_all.get("label", ai_label)
                        asyncio.ensure_future(auto_create_category_in_db(
                            SUPABASE_URL, SUPABASE_ACCESS_TOKEN,
                            ai_label_name, icon="📌", cat_type="expense",
                        ))

            # ── Lookup icon: fallback to dynamic categories ───
            cat_info = FINANCE_CATEGORIES.get(cat_key) or get_all_categories().get(cat_key, {})
            if cat_conf == "low":
                unknown_items.append({"name": name, "suggested": cat_suggest})
                cat_tag = "❓"
            elif cat_conf == "medium":
                cat_tag = cat_info.get("icon", "📌") if cat_info else "📌"
                cat_tag = f"~{cat_tag}"
            else:
                cat_tag = cat_info.get("icon", "📌") if cat_info else "📌"

            # Store category in item for later saving
            item["_category"] = cat_key
            item["_cat_confidence"] = cat_conf
            item["_cat_suggested"] = cat_suggest

            qty_str = f"{qty:.0f}" if qty == int(qty) else f"{qty:.1f}"
            unit_str = f" {unit}" if unit else ""
            price_fmt = format_amount(int(price))
            sub_fmt = format_amount(int(item_sub))
            flag = "🛒" if is_bulk else "🛍️"
            lines.append(f"     {flag}{cat_tag} {name} — {qty_str}{unit_str}×{price_fmt} = {sub_fmt}")
        # ── Unknown items warning ────────────────────────────
        if unknown_items:
            lines.append(f"   ⚠️ {len(unknown_items)} item belum terkategori:")
            for ui in unknown_items[:3]:
                lines.append(f"      ❓ {ui['name']}")
            if len(unknown_items) > 3:
                lines.append(f"      ... + {len(unknown_items) - 3} lain")
        lines.append("")

    if failures:
        lines.append(f"⚠️ {len(failures)} struk gagal dibaca")
        for f in failures:
            err = str(f.get("error", "Unknown"))[:60]
            lines.append(f"   ↳ {err}")

    lines.append("─" * 20)
    lines.append(f"💸 TOTAL GABUNGAN: {format_amount(int(grand_total))}")
    lines.append(f"📦 Total Item: {sum(len(ri['items']) for ri in receipt_list)}")
    # ── Breakdown Bulk vs Satuan ──────────────────────────────
    if bulk_count > 0 or satuan_count > 0:
        lines.append("")
        lines.append("📊 Breakdown:")
        if bulk_count > 0:
            lines.append(f"  🛒 Bulk/Grosir: {bulk_count} item — {format_amount(int(bulk_amount))}")
        if satuan_count > 0:
            lines.append(f"  🛍️ Satuan/Ecer: {satuan_count} item — {format_amount(int(satuan_amount))}")
    lines.append("")

    # Simpan receipt list untuk callback
    global _bulk_pending
    bulk_id = f"bulk_{len(_bulk_pending)}"
    _bulk_pending[bulk_id] = receipt_list

    lines.append("Simpan semua sebagai apa?")

    keyboard = InlineKeyboardMarkup([
        [
            InlineKeyboardButton("💰 Semua Pemasukan", callback_data=f"bulk_income_{bulk_id}"),
            InlineKeyboardButton("💸 Semua Pengeluaran", callback_data=f"bulk_expense_{bulk_id}"),
        ],
        [
            InlineKeyboardButton("📋 Pilih per Struk", callback_data=f"bulk_select_{bulk_id}"),
        ],
        [
            InlineKeyboardButton("❌ Batal", callback_data=f"bulk_cancel_{bulk_id}"),
        ],
    ])

    await context.bot.edit_message_text(
        chat_id=chat_id, message_id=status_msg_id,
        text="\n".join(lines),
        reply_markup=keyboard,
    )


# ── Edit Item per-item ─────────────────────────────────────────


async def _handle_edit_item(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Show item list with edit buttons for the receipt."""
    query = update.callback_query
    await query.answer()
    ref_id = query.data.replace("edititem_", "")
    logger.info("Edit item callback: data=%s ref_id=%s pending_keys=%s", query.data, ref_id, list(_receipt_pending.keys()))
    receipt = _receipt_pending.get(ref_id)
    if not receipt:
        try:
            await query.edit_message_text("❌ Sesi kadaluarsa. Silakan kirim ulang struk.", reply_markup=_finance_keyboard())
        except Exception:
            pass
        return

    items = receipt.get("items", [])
    lines = [f"✏️ Pilih item yang ingin diedit:", ""]
    for i, item in enumerate(items, 1):
        name = item.get("name", f"Item {i}")
        qty = float(item.get("qty") or 1)
        unit = item.get("unit", "").strip()
        price = float(item.get("price") or 0)
        qty_str = f"{qty:.0f}" if qty == int(qty) else f"{qty:.1f}"
        lines.append(f"{i}. {name} — {qty_str}{' '+unit if unit else ''} × Rp{price:,.0f}")

    keyboard = InlineKeyboardMarkup([
        [InlineKeyboardButton(f"✏️ Item {j+1}", callback_data=f"editfield_{ref_id}_{j}")]
        for j in range(len(items))
    ] + [[InlineKeyboardButton("↩️ Kembali", callback_data=f"receipt_editcat_{ref_id}")]])
    # Use receipt_editcat_ to go back to the receipt view — actually we need proper back
    # Let's use a simpler approach: back to receipt view by re-displaying
    await query.edit_message_text("\n".join(lines), reply_markup=keyboard)


async def _handle_edit_item_field(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Ask user what field to edit for the selected item."""
    query = update.callback_query
    await query.answer()
    # Parse: editfield_{ref_id}_{item_idx}
    # ref_id bisa mengandung underscore (rcpt_0), jadi jangan split sederhana
    rest = query.data[len("editfield_"):]
    last_underscore = rest.rfind("_")
    if last_underscore < 0:
        return
    ref_id = rest[:last_underscore]
    try:
        item_idx = int(rest[last_underscore + 1:])
    except (ValueError, IndexError):
        return

    receipt = _receipt_pending.get(ref_id)
    if not receipt or item_idx >= len(receipt.get("items", [])):
        await query.edit_message_text("❌ Sesi kadaluarsa.", reply_markup=_finance_keyboard())
        return

    item = receipt["items"][item_idx]
    name = item.get("name", "?")
    qty = float(item.get("qty") or 1)
    unit = item.get("unit", "").strip()
    price = float(item.get("price") or 0)
    qty_str = f"{qty:.0f}" if qty == int(qty) else f"{qty:.1f}"

    lines = [
        f"✏️ Edit Item #{item_idx + 1}",
        f"📛 {name}",
        f"📦 {qty_str}{' '+unit if unit else ''}",
        f"💰 Rp{price:,.0f}",
        "",
        "Ketik perbaikan dengan format:",
        "  `nama: <nama baru>`",
        "  `qty: <jumlah baru>`",
        "  `harga: <harga baru>`",
        "  `unit: <satuan baru>`",
        "",
        "Contoh: `nama: Tempe Goreng`",
        "Atau gabung: `nama: Tempe Goreng, qty: 2, harga: 15000`",
    ]

    # Simpan state edit
    _pending_actions[f"edit_item_{update.effective_user.id}"] = {
        "ref_id": ref_id,
        "item_idx": item_idx,
        "chat_id": update.effective_chat.id,
        "message_id": query.message.message_id,
    }
    _save_pending()

    keyboard = InlineKeyboardMarkup([
        [InlineKeyboardButton("↩️ Kembali ke Item", callback_data=f"edititem_{ref_id}")],
    ])
    await query.edit_message_text("\n".join(lines), reply_markup=keyboard)


async def _handle_edit_item_text(update: Update, context: ContextTypes.DEFAULT_TYPE, text: str):
    """Process edit response from user."""
    user_id = update.effective_user.id
    pending = _pending_actions.pop(f"edit_item_{user_id}", None)
    if not pending:
        return False
    _save_pending()

    ref_id = pending["ref_id"]
    item_idx = pending["item_idx"]
    receipt = _receipt_pending.get(ref_id)
    if not receipt or item_idx >= len(receipt.get("items", [])):
        await update.message.reply_text("❌ Sesi kadaluarsa. Silakan kirim ulang struk.", reply_markup=_finance_keyboard())
        return True

    item = receipt["items"][item_idx]
    changed = []
    # Parse: "nama: Tempe Goreng, qty: 2, harga: 15000" or "nama: Tempe Goreng"
    parts = re.split(r'[,;]', text)
    for part in parts:
        part = part.strip()
        m = re.match(r'(nama|qty|harga|unit)\s*:\s*(.+)', part, re.IGNORECASE)
        if not m:
            continue
        field = m.group(1).lower()
        value = m.group(2).strip()
        if field == "nama":
            old_name = item.get("name", "")
            item["name"] = value
            changed.append(f"nama → {value}")
            # Auto-learn alias: OCR name → corrected nama
            if value and old_name and value.lower() != old_name.lower():
                try:
                    inv_list = await inventory.get_all_inventory()
                    m, s = await inventory.fuzzy_match_item(value, inv_list)
                    if m and s >= MIN_SCORE_AUTO:
                        asyncio.ensure_future(inventory.add_alias(m["_id"], old_name))
                except Exception:
                    pass
        elif field == "qty":
            try:
                item["qty"] = float(value.replace(",", "."))
                changed.append(f"qty → {value}")
            except ValueError:
                pass
        elif field == "harga":
            # Remove non-numeric
            clean = re.sub(r'[^\d.,]', '', value).replace(",", ".")
            try:
                item["price"] = float(clean)
                changed.append(f"harga → Rp{float(clean):,.0f}")
            except ValueError:
                pass
        elif field == "unit":
            item["unit"] = value
            changed.append(f"unit → {value}")

    if not changed:
        await update.message.reply_text(
            "❌ Format salah. Gunakan: `nama: <nilai>` atau `qty: <nilai>` atau `harga: <nilai>`",
            reply_markup=_finance_keyboard(),
        )
        return True

    # Recalculate subtotal
    if "harga" in text.lower() or "qty" in text.lower():
        item["subtotal"] = float(item.get("qty", 1)) * float(item.get("price", 0))

    # Save updated receipt
    _receipt_pending[ref_id] = receipt
    _save_pending()

    # Re-display receipt with updated items
    lines = [f"✅ Item #{item_idx + 1} diupdate!", ""]
    for ch in changed:
        lines.append(f"  • {ch}")
    lines.append("")
    lines.append("📋 Item Lainnya:")
    for i, it in enumerate(receipt.get("items", []), 1):
        n = it.get("name", f"Item {i}")
        q = float(it.get("qty") or 1)
        u = it.get("unit", "").strip()
        p = float(it.get("price") or 0)
        qs = f"{q:.0f}" if q == int(q) else f"{q:.1f}"
        lines.append(f"  {i}. {n} — {qs}{' '+u if u else ''} × Rp{p:,.0f}")

    keyboard = InlineKeyboardMarkup([
        [InlineKeyboardButton("✏️ Edit Lagi", callback_data=f"edititem_{ref_id}")],
        [InlineKeyboardButton("↩️ Kembali ke Struk", callback_data=f"edititem_{ref_id}")],
    ])
    await update.message.reply_text("\n".join(lines), reply_markup=keyboard)
    return True


# ── Edit Tanggal ──────────────────────────────────────────────


async def _handle_edit_date(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Ask user to type the correct date/time."""
    query = update.callback_query
    await query.answer()
    ref_id = query.data.replace("editdate_", "")
    receipt = _receipt_pending.get(ref_id)
    if not receipt:
        try:
            await query.edit_message_text("❌ Sesi kadaluarsa.", reply_markup=_finance_keyboard())
        except Exception:
            pass
        return

    cur_date = receipt.get("date", "") or ""
    cur_time = receipt.get("time", "") or ""
    cur_display = f"{cur_date} {cur_time}".strip() or "(kosong)"

    lines = [
        f"✏️ Edit Tanggal & Jam",
        "",
        f"Saat ini: {cur_display}",
        "",
        "Ketik tanggal & jam dengan format:",
        "  `2026-05-07 14:30`  (tanggal + jam)",
        "  `2026-05-07`         (tanggal saja, jam sekarang)",
        "",
        "Atau kirim `/batal` untuk batal.",
    ]

    _pending_actions[f"edit_date_{update.effective_user.id}"] = {
        "ref_id": ref_id,
    }
    _save_pending()

    keyboard = InlineKeyboardMarkup([
        [InlineKeyboardButton("↩️ Kembali", callback_data=f"receipt_cancel_{ref_id}")],
    ])
    await query.edit_message_text("\n".join(lines), reply_markup=keyboard)


async def _handle_edit_date_text(update: Update, context: ContextTypes.DEFAULT_TYPE, text: str) -> bool:
    """Process date edit response from user."""
    if text.startswith("/"):
        return False  # not for us

    user_id = update.effective_user.id
    pending = _pending_actions.pop(f"edit_date_{user_id}", None)
    if not pending:
        return False
    _save_pending()

    ref_id = pending["ref_id"]
    receipt = _receipt_pending.get(ref_id)
    if not receipt:
        await update.message.reply_text("❌ Sesi kadaluarsa.", reply_markup=_finance_keyboard())
        return True

    # Parse input
    text = text.strip()
    try:
        if " " in text:
            # "2026-05-07 14:30" or "2026-05-07 14:30:00"
            parts = text.split(" ")
            date_part = parts[0]
            time_part = parts[1][:5]  # HH:MM
            parsed = datetime.strptime(f"{date_part} {time_part}", "%Y-%m-%d %H:%M")
            receipt["date"] = date_part
            receipt["time"] = time_part
        else:
            # Just date "2026-05-07"
            parsed = datetime.strptime(text, "%Y-%m-%d")
            receipt["date"] = text
            receipt["time"] = ""  # reset time, will use now on save
    except ValueError:
        await update.message.reply_text(
            "❌ Format salah. Gunakan `YYYY-MM-DD HH:MM` atau `YYYY-MM-DD`",
            reply_markup=_finance_keyboard(),
        )
        return True

    _receipt_pending[ref_id] = receipt
    _save_pending()

    # Show updated date and keep the user inside this receipt flow.
    display = f"{receipt['date']}"
    if receipt.get("time"):
        display += f" {receipt['time']}"
    keyboard = InlineKeyboardMarkup([
        [
            InlineKeyboardButton("💰 Pemasukan", callback_data=f"receipt_income_{ref_id}"),
            InlineKeyboardButton("💸 Pengeluaran", callback_data=f"receipt_expense_{ref_id}"),
        ],
        [
            InlineKeyboardButton("✏️ Edit Kategori", callback_data=f"receipt_editcat_{ref_id}"),
            InlineKeyboardButton("✏️ Edit Tanggal", callback_data=f"editdate_{ref_id}"),
        ],
        [InlineKeyboardButton("✏️ Edit Item", callback_data=f"edititem_{ref_id}")],
        [InlineKeyboardButton("❌ Batal", callback_data=f"receipt_cancel_{ref_id}")],
    ])
    await update.message.reply_text(
        f"✅ Tanggal diupdate: {display}\n\n"
        f"Sekarang klik 💸 Pengeluaran atau 💰 Pemasukan untuk menyimpan struk ini.",
        reply_markup=keyboard,
    )
    return True


async def _handle_receipt_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle callback dari konfirmasi struk (simpan sebagai pemasukan/pengeluaran)."""
    query = update.callback_query
    await query.answer()

    data = query.data
    if not data.startswith("receipt_"):
        return False  # Bukan receipt callback

    # ── Handle edit kategori ───────────────────────────────────
    if data.startswith("receipt_editcat_"):
        ref_id = data[len("receipt_editcat_"):]
        receipt = _receipt_pending.get(ref_id)
        if not receipt:
            try:
                await query.edit_message_text("❌ Sesi kadaluarsa. Silakan kirim ulang struk.", reply_markup=_finance_keyboard())
            except Exception:
                pass
            return True
        # Tampilkan daftar kategori
        cat_buttons = []
        current_row = []
        for cat_key, cat_info in FINANCE_CATEGORIES.items():
            label = f"{cat_info['icon']} {cat_info['label']}"
            current_row.append(InlineKeyboardButton(label, callback_data=f"receipt_setcat_{ref_id}_{cat_key}"))
            if len(current_row) == 2:
                cat_buttons.append(current_row)
                current_row = []
        if current_row:
            cat_buttons.append(current_row)
        cat_buttons.append([InlineKeyboardButton("⬅️ Kembali", callback_data=f"receipt_back_{ref_id}")])
        cat_keyboard = InlineKeyboardMarkup(cat_buttons)

        cur_cat = receipt.get("category", "lainnya")
        cur_label = FINANCE_CATEGORIES.get(cur_cat, {}).get("label", cur_cat)
        await query.edit_message_text(
            f"✏️ Edit Kategori Struk\n\nKategori saat ini: {cur_label}\n\nPilih kategori baru:",
            reply_markup=cat_keyboard,
        )
        return True

    if data.startswith("receipt_setcat_"):
        rest = data[len("receipt_setcat_"):]
        m = re.match(r'(rcpt_\d+)_(.+)', rest)
        if not m:
            return True
        ref_id = m.group(1)
        cat_key = m.group(2)
        receipt = _receipt_pending.get(ref_id)
        if not receipt:
            try:
                await query.edit_message_text("❌ Sesi kadaluarsa.", reply_markup=_finance_keyboard())
            except Exception:
                pass
            return True
        # Update kategori
        old_cat = receipt.get("category", "lainnya")
        receipt["category"] = cat_key

        # ── Log feedback for AI learning ──────────────────────
        items = receipt.get("items", [])
        for item in items:
            item_name = item.get("name", "").strip()
            if item_name:
                await memory.log_feedback(
                    item_name=item_name,
                    original_category=item.get("_category", old_cat),
                    corrected_category=cat_key,
                    merchant=receipt.get("merchant", ""),
                    receipt_date=receipt.get("date", ""),
                )

        # Rebuild tampilan dengan kategori baru
        await _redisplay_receipt(query, ref_id, receipt)
        return True

    if data.startswith("receipt_back_"):
        ref_id = data[len("receipt_back_"):]
        receipt = _receipt_pending.get(ref_id)
        if not receipt:
            try:
                await query.edit_message_text("❌ Sesi kadaluarsa.", reply_markup=_finance_keyboard())
            except Exception:
                pass
            return True
        await _redisplay_receipt(query, ref_id, receipt)
        return True

    # Parse: receipt_{action}_{ref_id}
    parts = data.split("_", 2)
    if len(parts) < 3:
        return False
    action = parts[1]  # income | expense | cancel
    ref_id = parts[2] if parts[2] else ""

    receipt = _receipt_pending.pop(ref_id, None)
    if not receipt:
        try:
            await query.edit_message_text("❌ Sesi kadaluarsa. Silakan kirim ulang struk.", reply_markup=_finance_keyboard())
        except Exception:
            pass
        return True

    if action == "cancel":
        await query.edit_message_text("❌ Dibatalkan.", reply_markup=_finance_keyboard())
        _save_pending()
        return True

    # ── Record transaction ──────────────────────────────────────
    tx_type = "income" if action == "income" else "expense"
    merchant = receipt.get("merchant", "")
    total = receipt.get("total", 0)
    category = receipt.get("category", "operasional" if tx_type == "expense" else "penjualan")

    # Build description: utk OCR items udah di scanItems — cukup clean
    items = receipt.get("items", [])
    desc = receipt.get("_description", "") or ""
    if not desc:
        if merchant:
            desc = f"{'Pemasukan' if tx_type == 'income' else 'Belanja'} - {merchant}"
        else:
            desc = f"{'Pemasukan' if tx_type == 'income' else 'Belanja'}"
        if receipt.get("receipt_number"):
            desc += f" (No. {receipt['receipt_number']})"

    # Determine if this came from OCR or manual text
    is_ocr = "_description" not in receipt

    tx_result = await finance.record_transaction(
        tx_type=tx_type,
        amount=total or 1,
        description=desc[:500],
        category=category,
        merchant=merchant,
        payment_method=receipt.get("payment_method", "cash"),
        receipt_date_str=receipt.get("date", ""),
        metadata={
            "source": "yumi_finance_agent",
            "traceId": receipt.get("scan_id", ""),
            "visionAttemptId": receipt.get("vision_attempt_id", ""),
            "ocr": is_ocr,
            "receipt_number": receipt.get("receipt_number", ""),
            "receipt_date": receipt.get("date", ""),
            "receipt_image_url": receipt.get("receipt_image_url", ""),
            "notes": receipt.get("notes", ""),
            "item_count": len(items),
            "scanItems": [
                {
                    "ocrItemId": it.get("ocr_item_id", ""),
                    "ocrSourcePosition": it.get("ocr_source_position"),
                    "name": it.get("name", ""),
                    "rawName": it.get("raw_name", ""),
                    "aliasResolvedFrom": it.get("alias_resolved_from", ""),
                    "quantity": it.get("qty", 1),
                    "unit": it.get("unit", ""),
                    "price": it.get("price", 0),
                    "total": (it.get("subtotal", 0) or ((it.get("qty", 1) or 1) * (it.get("price", 0) or 0))),
                    "netWeightValue": it.get("net_weight_value"),
                    "netWeightUnit": it.get("net_weight_unit", ""),
                    "packType": it.get("pack_type", ""),
                }
                for it in items
            ],
            "receiptDetails": {
                "receiptNumber": receipt.get("receipt_number", ""),
                "merchantName": merchant,
                "date": receipt.get("date", ""),
                "tax": receipt.get("tax", 0),
                "discount": receipt.get("discount", 0),
                "serviceCharge": receipt.get("service_charge", 0),
            },
        },
    )

    # ── Business memory update ───────────────────────────────────
    if tx_result.get("success"):
        item_names = [it.get("name", "") for it in items if it.get("name")]
        if merchant:
            asyncio.ensure_future(memory.update_merchant_profile(
                merchant=merchant,
                categories={category: 1},
                items=item_names,
                total=float(total or 0),
                payment_method=receipt.get("payment_method", "cash"),
            ))
        for item in items:
            if item.get("name"):
                asyncio.ensure_future(memory.record_item_category(
                    item.get("name", ""), category, source="confirmed_transaction",
                ))

    # ── Accounting dual-write ────────────────────────────────────
    source_id = tx_result.get("sourceId", "")
    if tx_result.get("success") and source_id:
        # Additive evidence projection; legacy stock mutation remains unchanged.
        try:
            receipt_items = tuple(
                ReceiptItemCandidate(
                    item_key=str(item.get("ocr_item_id") or index),
                    raw_name=str(item.get("raw_name") or item.get("name") or ""),
                    normalized_name=item.get("name") or None,
                    quantity=float(item.get("qty") or 0),
                    unit=item.get("unit") or None,
                    unit_price=float(item.get("price") or 0),
                    line_total=float(item.get("subtotal") or ((item.get("qty") or 1) * (item.get("price") or 0))),
                    raw=item,
                )
                for index, item in enumerate(items)
            )
            await receipt_inventory.persist(ReceiptPersistenceInput(
                financial_transaction_source_id=source_id,
                receipt_image_url=receipt.get("receipt_image_url") or None,
                merchant_name=merchant or None,
                receipt_total=float(total or 0),
                ocr_status="parsed" if is_ocr else "manual",
                ocr_provider="9router" if is_ocr and AI_BASE_URL == os.getenv("NINEROUTER_BASE_URL") else "manual",
                ocr_raw={"traceId": receipt.get("scan_id", "")},
                items=receipt_items if tx_type == "expense" else (),
            ))
        except Exception as exc:
            logger.warning("Receipt inventory projection failed for %s: %s", source_id, exc)

    if tx_result.get("success") and items and tx_type in ("income", "expense"):
        source_id = tx_result.get("sourceId", "")
        asyncio.ensure_future(_write_accounting_entries(
            source_id=source_id,
            items=items,
            category=category,
            payment_method=receipt.get("payment_method", "cash"),
            total_amount=total,
            tx_type=tx_type,
        ))

    # ── Format balasan ──────────────────────────────────────────
    icon = "💰" if tx_type == "income" else "💸"
    type_label = "Pemasukan" if tx_type == "income" else "Pengeluaran"
    lines = [
        f"{icon} {type_label} Tercatat!",
        "",
    ]
    if merchant:
        lines.append(f"🏪 {merchant}")
    lines.append(f"💰 Total: {format_amount(int(total))}")
    lines.append(f"📁 Kategori: {get_category_label(category)}")
    if tx_result.get("success"):
        lines.append(f"✅ Berhasil disimpan")
        lines.append(f"🔎 Trace ID: {receipt.get('scan_id', '-')}")
        lines.append(f"🧾 Finance ID: {source_id or '-'}")
        # Accounting badge jika ada entries
        if items:
            lines.append(f"📊 Entri akuntansi dibuat")
        notes = receipt.get("notes", "")
        if notes:
            lines.append(f"👤 {notes}")
    else:
        lines.append(f"⚠️ Gagal: {tx_result.get('error', '?')}")

    # ── Restok inventory ────────────────────────────────────────
    if items and tx_type == "expense":
        inventory_list = await inventory.get_all_inventory()
        restok_lines = []
        for item in items:
            item_name = item.get("name", "").strip()
            if not item_name:
                continue
            item_qty = float(item.get("qty") or 1)
            item_price = float(item.get("price") or 0)
            unit = item.get("unit", "").strip() or _extract_unit(item_name) or "pcs"

            approved = _approved_candidate_map.get(item_name.casefold())
            matched = None
            score = 0
            if approved:
                approved_id = approved.get("proposed_inventory_source_id")
                matched = next((inv for inv in inventory_list if inv.get("_id") == approved_id), None)
                score = 100 if matched else 0
            else:
                matched, score = await inventory.fuzzy_match_item(item_name, inventory_list, item_price=item_price, merchant=merchant)
            if matched and score >= MIN_SCORE_AUTO:
                inv_name = matched["ingredientName"]
                inv_qty = float(matched.get("quantity", 0))
                try:
                    await inventory.restock_item(
                        matched["_id"], inv_qty, item_qty, unit,
                        price=item_price,
                        source_reference_id=source_id,
                        trace_id=receipt.get("scan_id", ""),
                        ocr_item_id=item.get("ocr_item_id", ""),
                    )
                    await inventory.log_purchase(
                        inv_name, item_qty, unit, item_price * item_qty, merchant,
                        inventory_id=matched["_id"],
                        source_transaction_id=source_id,
                        trace_id=receipt.get("scan_id", ""),
                        ocr_item_id=item.get("ocr_item_id", ""),
                    )
                    restok_lines.append(f"  ✅ {inv_name} +{item_qty:.0f} {unit}")
                except Exception as e:
                    restok_lines.append(f"  ⚠️ {item_name}: {e}")
            elif matched and score >= MIN_SCORE_SUGGEST:
                restok_lines.append(f"  🤔 {item_name} ≈ {matched['ingredientName']}? ({score}%)")
                # Do not persist fuzzy suggestions automatically. Alias changes require explicit approval workflow.
            else:
                restok_lines.append(f"  🆕 {item_name} — belum di database")

        if restok_lines:
            lines.append("")
            lines.append("📦 Inventory Update:")
            lines.extend(restok_lines)

        # Sinkronisasi stok menu setelah restock
        try:
            await inventory.sync_all_menu_stocks()
        except Exception as e:
            logger.warning("Menu stock sync failed after OCR restock: %s", e)

    await query.edit_message_text("\n".join(lines), reply_markup=_finance_keyboard())
    _save_pending()
    return True


def _extract_unit(name: str) -> str:
    """Extract unit dari nama item."""
    if not name:
        return ""
    m = re.search(r'(\d+(?:[.,]\d+)?)\s*(ml|liter|l|kg|gram|gr|g|pcs|pack|ikat|bungkus|toros|botol|ctn|dus|karton)\b', name, re.IGNORECASE)
    if m:
        return normalize_unit(m.group(2))
    return ""


# ── Manual restock untuk input manual ────────────────────────────

def _save_learning_entries(items: list[dict], inventory_list: list[dict], merchant: str = ""):
    """Save learning memory entries for Yumi Purchasing Agent."""
    import json as _json
    from difflib import SequenceMatcher
    from datetime import timezone
    
    LEARNING_FILE = os.path.join(os.path.dirname(__file__), "..", "yumi-purchasing-agent", "learning_memory.json")
    if not os.path.exists(LEARNING_FILE):
        return
    
    try:
        with open(LEARNING_FILE) as f:
            learning_data = _json.load(f)
    except Exception:
        return
    
    def _clean(n: str) -> str:
        n = n.lower().strip()
        n = re.sub(r'\\bRp?\\s*[\\d.,]+\\b', '', n)
        n = re.sub(r'\\d+(?:[.,]\\d+)?\\s*(?:kg|gram|gr|g|ml|l|liter|pcs|pack)\\b', '', n)
        return re.sub(r'\\s+', ' ', n).strip()
    
    def _score(a: str, b: str) -> float:
        return SequenceMatcher(None, _clean(a), _clean(b)).ratio() if a and b else 0.0
    
    added = 0
    for item in items:
        item_name = item.get("name", "").strip()
        if not item_name:
            continue
        
        # Find best inventory match
        best = None
        best_score = 0
        for inv in inventory_list:
            inv_name = inv.get("ingredientName", "") or ""
            score = _score(item_name, inv_name)
            if score > best_score:
                best_score = score
                best = inv
        
        if best and best_score >= 0.7:
            inv_id = best.get("_id", "")
            inv_name = best.get("ingredientName", "")
            entry_id = f"exp_{inv_id[:12]}"
            
            # Avoid duplicates
            existing_ids = {e.get("id") for e in learning_data.get("entries", [])}
            if entry_id not in existing_ids:
                learning_data["entries"].append({
                    "id": entry_id,
                    "userInput": item_name,
                    "parsedName": inv_name,
                    "matchedInventoryId": inv_id,
                    "matchedIngredientName": inv_name,
                    "suggestedSupplier": merchant,
                    "suggestedSupplierPhone": "",
                    "suggestedQty": float(item.get("qty", 1)),
                    "suggestedUnit": item.get("unit", ""),
                    "suggestedPrice": float(item.get("price", 0)),
                    "isCorrected": False,
                    "correctionType": None,
                    "correctionPayload": None,
                    "confirmedByUser": False,
                    "confidence": 0.85,
                    "usageCount": 1,
                    "createdAt": datetime.now(timezone.utc).isoformat(),
                    "updatedAt": datetime.now(timezone.utc).isoformat(),
                    "source": "finance_agent_manual_expense",
                })
                added += 1
    
    if added > 0:
        learning_data["version"] = learning_data.get("version", 1) + 1
        learning_data["last_updated"] = datetime.now(timezone.utc).isoformat()
        try:
            tmp = LEARNING_FILE + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                _json.dump(learning_data, f, indent=2, ensure_ascii=False)
            os.replace(tmp, LEARNING_FILE)
            logger.info("Learning memory: +%d entries from manual expense", added)
        except Exception as e:
            logger.warning("Failed to write learning memory: %s", e)


async def _manual_restock(result):
    """Restok inventory dari input pengeluaran manual (sama seperti OCR)."""
    try:
        items_to_restock = []

        # Cek apakah orchestrator sudah parse items
        if result.items:
            items_to_restock = result.items
        elif result.description:
            desc = result.description.strip()
            
            # Bersihkan kata/frasa yang bukan nama item
            for prefix in ["beli", "bayar", "pesan", "order", "hari ini", "bulan ini", "tadi"]:
                if desc.lower().startswith(prefix + " "):
                    desc = desc[len(prefix):].strip()
            # Hapus info tanggal: "11 mei 2026", "13/05", "(...)"
            desc = re.sub(r'\d{1,2}\s+\w+\s+\d{4}', '', desc)
            desc = re.sub(r'\d{1,2}/\d{1,2}', '', desc)
            desc = re.sub(r'\([^)]*\)', '', desc)
            desc = re.sub(r'\bRp\s*[\d.,]+\b', '', desc)
            desc = re.sub(r'\brp\s*[\d.,]+\b', '', desc)
            desc = re.sub(r'\s+', ' ', desc).strip()
            
            UNIT_PATTERN = r'(ml|liter|l|kg|gram|gr|g|pcs|pack|ikat|bungkus|toros|botol|btl|kilo|kantong|dus|bal|krat)'
            UNIT_MAP = {"btl": "botol", "kilo": "kg", "gr": "gram", "l": "liter", "bal": "bal"}
            
            # Pattern 1: qty unit name — "2 kg ubi", "3 btl minyak"
            m = re.match(r'(\d+(?:[.,]\d+)?)\s*' + UNIT_PATTERN + r'\s+(.+)', desc, re.IGNORECASE)
            if m:
                qty = float(m.group(1).replace(",", "."))
                unit = UNIT_MAP.get(m.group(2).lower(), m.group(2).lower())
                name = m.group(3).strip()
                unit_price = result.amount / qty if qty > 0 else result.amount
                items_to_restock = [{"name": name, "qty": qty, "unit": unit, "price": unit_price}]
            else:
                # Pattern 2: name qty unit — "ubi cilembu 2kg", "minyak goreng 3 btl"
                m = re.match(r'(.+?)\s+(\d+(?:[.,]\d+)?)\s*' + UNIT_PATTERN + r'\s*$', desc, re.IGNORECASE)
                if m:
                    name = m.group(1).strip()
                    qty = float(m.group(2).replace(",", "."))
                    unit_m = m.group(3).lower()
                    # Pastikan name tidak startsWith angka (ambiguitas)
                    if re.match(r'^\d', name):
                        # Mungkin pattern 1 gagal karena unit melekat — coba parse ulang
                        m2 = re.match(r'(\d+(?:[.,]\d+)?)\s*' + UNIT_PATTERN + r'\s+(.+)', name + ' ' + str(qty) + unit_m, re.IGNORECASE)
                        if m2:
                            qty = float(m2.group(1).replace(",", "."))
                            unit = UNIT_MAP.get(m2.group(2).lower(), m2.group(2).lower())
                            name = m2.group(3).strip()
                    else:
                        unit = UNIT_MAP.get(unit_m, unit_m)
                    unit_price = result.amount / qty if qty > 0 else result.amount
                    items_to_restock = [{"name": name, "qty": qty, "unit": unit, "price": unit_price}]
                else:
                    # Pattern 3: name qty — "es batu 2", "ubi 3"
                    m = re.match(r'(.+?)\s+(\d+(?:[.,]\d+)?)\s*$', desc)
                    if m:
                        name = m.group(1).strip()
                        qty = float(m.group(2).replace(",", "."))
                        unit_price = result.amount / qty if qty > 0 else result.amount
                        items_to_restock = [{"name": name, "qty": qty, "unit": "", "price": unit_price}]
                    else:
                        # Pattern 4: name only — "galon cleo", "ubi cilembu"
                        items_to_restock = [{"name": desc, "qty": 1, "unit": "pcs", "price": result.amount}]

        if not items_to_restock:
            return

        inventory_list = await inventory.get_all_inventory()
        merchant = result.merchant or "Input Manual"
        restok_lines = []

        for item in items_to_restock:
            item_name = item.get("name", "").strip()
            if not item_name:
                continue
            item_qty = float(item.get("qty") or 1)
            item_price = float(item.get("price") or 0)
            unit = item.get("unit", "").strip() or _extract_unit(item_name) or "pcs"

            approved = _approved_candidate_map.get(item_name.casefold())
            matched = None
            score = 0
            if approved:
                approved_id = approved.get("proposed_inventory_source_id")
                matched = next((inv for inv in inventory_list if inv.get("_id") == approved_id), None)
                score = 100 if matched else 0
            else:
                matched, score = await inventory.fuzzy_match_item(item_name, inventory_list, item_price=item_price, merchant=merchant)
            if matched and score >= MIN_SCORE_AUTO:
                inv_name = matched["ingredientName"]
                inv_qty = float(matched.get("quantity", 0))
                try:
                    await inventory.restock_item(matched["_id"], inv_qty, item_qty, unit, price=item_price, source_reference_id=locals().get("source_id", ""))
                    await inventory.log_purchase(inv_name, item_qty, unit, item_price * item_qty, merchant)
                    restok_lines.append(f"  ✅ {inv_name} +{item_qty:.0f} {unit}")
                except Exception as e:
                    restok_lines.append(f"  ⚠️ {item_name}: {e}")
            elif matched and score >= MIN_SCORE_SUGGEST:
                restok_lines.append(f"  🤔 {item_name} ≈ {matched['ingredientName']}? ({score}%)")
                # Do not persist fuzzy suggestions automatically. Alias changes require explicit approval workflow.
            else:
                restok_lines.append(f"  🆕 {item_name} — belum di database")

        if restok_lines:
            logger.info("Manual restock: %s", "; ".join(restok_lines))
        
        # ── Save to learning memory (Purchasing Agent) ─────
        try:
            _save_learning_entries(items_to_restock, inventory_list, merchant)
        except Exception as e:
            logger.warning("Failed to save learning memory: %s", e)

        # Sinkronisasi stok menu setelah restock
        try:
            await inventory.sync_all_menu_stocks()
        except Exception as e:
            logger.warning("Menu stock sync failed after manual restock: %s", e)

    except Exception as e:
        logger.warning("Manual restock failed: %s", e)


async def _redisplay_receipt(query, ref_id: str, receipt: dict):
    """Rebuild tampilan struk dengan kategori terbaru dan keyboard konfirmasi."""
    merchant = receipt.get("merchant", "")
    receipt_date = receipt.get("date", "")
    receipt_time = receipt.get("time", "")
    items = receipt.get("items", [])
    total = receipt.get("total", 0)
    subtotal = receipt.get("subtotal", 0)
    tax = receipt.get("tax", 0)
    discount = receipt.get("discount", 0)
    service_charge = receipt.get("service_charge", 0)
    payment_method = receipt.get("payment_method", "")
    receipt_number = receipt.get("receipt_number", "")
    category = receipt.get("category", "lainnya")
    confidence = receipt.get("confidence", 0)
    raw_text = receipt.get("raw_text", "")

    # ── Format tampilan ─────────────────────────────────────
    lines = ["📸 Struk Berhasil Dibaca!", ""]

    if merchant:
        lines.append(f"🏪 {merchant}")
    if receipt_date:
        dt = receipt_date
        if receipt_time:
            dt += f" {receipt_time}"
        lines.append(f"📅 {dt}")
    if receipt_number:
        lines.append(f"🧾 No: {receipt_number}")
    if payment_method:
        lines.append(f"💳 Bayar: {payment_method}")
    lines.append("")

    if items:
        lines.append("📋 Daftar Item:")
        for i, item in enumerate(items, 1):
            name = item.get("name", f"Item {i}").strip()
            qty = float(item.get("qty") or 1)
            price = float(item.get("price") or 0)
            item_sub = float(item.get("subtotal") or 0)
            unit = item.get("unit", "").strip()
            if item_sub <= 0:
                item_sub = price * qty

            qty_str = f"{qty:.0f}" if qty == int(qty) else f"{qty:.1f}"
            unit_str = f" {unit}" if unit else ""
            item_sub_fmt = format_amount(int(item_sub))
            lines.append(f"  {i}. {name} — {qty_str}{unit_str} × {format_amount(int(price))} = {item_sub_fmt}")
        lines.append("")

    # Ringkasan total
    lines.append("💰 Ringkasan:")
    if subtotal > 0 and abs(subtotal - total) > 1:
        lines.append(f"  Subtotal: {format_amount(int(subtotal))}")
    if discount > 0:
        lines.append(f"  Diskon: -{format_amount(int(discount))}")
    if tax > 0:
        lines.append(f"  Pajak: {format_amount(int(tax))}")
    if service_charge > 0:
        lines.append(f"  Service: {format_amount(int(service_charge))}")
    lines.append(f"  TOTAL: {format_amount(int(total))}")
    lines.append("")
    lines.append(f"📁 Kategori: {get_category_label(category)}")
    if confidence < 0.8 and confidence > 0:
        lines.append(f"  ⚠️ Confidence AI: {confidence:.0%}")
    lines.append("")
    lines.append("Simpan sebagai apa?")

    keyboard = InlineKeyboardMarkup([
        [
            InlineKeyboardButton("💰 Pemasukan", callback_data=f"receipt_income_{ref_id}"),
            InlineKeyboardButton("💸 Pengeluaran", callback_data=f"receipt_expense_{ref_id}"),
        ],
        [
            InlineKeyboardButton("✏️ Edit Kategori", callback_data=f"receipt_editcat_{ref_id}"),
        ],
        [
            InlineKeyboardButton("❌ Batal", callback_data=f"receipt_cancel_{ref_id}"),
        ],
    ])

    await query.edit_message_text("\n".join(lines), reply_markup=keyboard)


# ── Accounting Dual-Write ──────────────────────────────────────────


async def _write_accounting_entries(
    source_id: str,
    items: list[dict],
    category: str,
    payment_method: str,
    total_amount: float,
    tx_type: str = "expense",
):
    """Catat accounting entries via edge function classifyTransactionItems.

    Args:
        source_id: financial_transactions source_id (dari record_transaction return)
        items: list of dict dengan keys name, quantity, price, total
        category: category transaksi
        payment_method: metode pembayaran
        total_amount: total nominal transaksi
        tx_type: "income" atau "expense"
    """
    if not source_id or not items:
        logger.info("Skipping accounting dual-write: no source_id or items")
        return

    try:
        # Format items untuk edge function
        scan_items = [
            {
                "name": it.get("name", ""),
                "quantity": float(it.get("qty", 1)),
                "price": float(it.get("price", 0)),
                "total": float(it.get("qty", 1)) * float(it.get("price", 0)),
            }
            for it in items
        ]

        payload = {
            "action": "classifyTransactionItems",
            "transaction_id": source_id,
            "items": scan_items,
            "category": category,
            "payment_method": payment_method,
            "total_amount": total_amount,
            "tx_type": tx_type,
        }

        url = f"{SUPABASE_EDGE_URL}/functions/v1/yumi-ai"
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                url,
                json=payload,
                headers={
                    "apikey": SUPABASE_KEY,
                    "Authorization": f"Bearer {SUPABASE_KEY}",
                },
            )
            if resp.status_code >= 400:
                logger.warning(
                    "Accounting dual-write failed: %s %s",
                    resp.status_code, resp.text[:200],
                )
                return

            result = resp.json()
            if result.get("success"):
                classifications = result.get("classifications", [])
                logger.info(
                    "Accounting entries created: %d items for tx %s",
                    len(classifications), source_id,
                )
            else:
                err = result.get("error", "?")
                if isinstance(err, dict):
                    err = err.get("message", "?")
                logger.warning(
                    "Accounting classification failed: %s",
                    err,
                )

    except Exception as e:
        logger.warning("Accounting dual-write error (non-fatal): %s", e)


# ── Accounting Query Helpers ───────────────────────────────────────


def _parse_accounting_period(text: str) -> str:
    """Parse periode untuk query accounting."""
    t = text.lower().strip()
    if any(k in t for k in ["kemarin", "yesterday"]):
        return "kemarin"
    if any(k in t for k in ["minggu", "week", "pekan"]):
        return "minggu_ini"
    if any(k in t for k in ["bulan", "month"]):
        return "bulan_ini"
    return "hari_ini"


def _accounting_period_range(period: str) -> tuple[int, int]:
    """Hitung start_ms dan end_ms untuk periode akuntansi."""
    now = datetime.now(WIB)
    if period == "hari_ini":
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        return int(start.timestamp() * 1000), int(now.timestamp() * 1000)
    elif period == "kemarin":
        yesterday = now - timedelta(days=1)
        start = yesterday.replace(hour=0, minute=0, second=0, microsecond=0)
        end = yesterday.replace(hour=23, minute=59, second=59, microsecond=999000)
        return int(start.timestamp() * 1000), int(end.timestamp() * 1000)
    elif period == "minggu_ini":
        start = (now - timedelta(days=now.weekday())).replace(
            hour=0, minute=0, second=0, microsecond=0,
        )
        return int(start.timestamp() * 1000), int(now.timestamp() * 1000)
    elif period == "bulan_ini":
        start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        return int(start.timestamp() * 1000), int(now.timestamp() * 1000)
    return int(now.timestamp() * 1000), int(now.timestamp() * 1000)


async def _query_account_balance(query: str) -> str:
    """Cari akun (by code or name) dan tampilkan saldo debit/kredit."""
    # Cari COA by code atau name
    q = f"select=id,code,name,type&or=(code.ilike.%{query}%,name.ilike.%{query}%)&limit=10"
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            f"{SUPABASE_URL}/rest/v1/accounting_chart_of_accounts?{q}",
            headers={
                "apikey": SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}",
            },
        )
        if resp.status_code >= 400:
            return f"❌ Gagal query akun: {resp.status_code}"
        accounts = resp.json()

    if not accounts:
        return f"🔍 Akun '{query}' tidak ditemukan."

    if len(accounts) > 5:
        # Banyak hasil — tampilkan daftar
        lines = [f"🔍 Ditemukan {len(accounts)} akun untuk '{query}':", ""]
        for a in accounts[:10]:
            lines.append(f"  {a['code']} — {a['name']} ({a['type']})")
        return "\n".join(lines)

    lines = []
    for a in accounts:
        code = a["code"]
        name = a["name"]
        atype = a["type"]
        coa_id = a["id"]

        # Hitung total debit
        q_debit = (
            f"select=coalesce(sum(amount),0) as total"
            f"&coa_id=eq.{coa_id}&entry_type=eq.debit"
        )
        q_kredit = (
            f"select=coalesce(sum(amount),0) as total"
            f"&coa_id=eq.{coa_id}&entry_type=eq.kredit"
        )

        async with httpx.AsyncClient(timeout=10) as client:
            resp_debit = await client.get(
                f"{SUPABASE_URL}/rest/v1/accounting_entries?{q_debit}",
                headers={
                    "apikey": SUPABASE_KEY,
                    "Authorization": f"Bearer {SUPABASE_KEY}",
                },
            )
            resp_kredit = await client.get(
                f"{SUPABASE_URL}/rest/v1/accounting_entries?{q_kredit}",
                headers={
                    "apikey": SUPABASE_KEY,
                    "Authorization": f"Bearer {SUPABASE_KEY}",
                },
            )

        debit = 0
        kredit = 0
        if resp_debit.status_code == 200:
            data = resp_debit.json()
            debit = float(data[0]["total"]) if data else 0
        if resp_kredit.status_code == 200:
            data = resp_kredit.json()
            kredit = float(data[0]["total"]) if data else 0

        if atype in ("asset", "expense"):
            saldo = debit - kredit
        else:
            saldo = kredit - debit

        lines.append(f"📊 **{code} — {name}** ({atype})")
        lines.append(f"   💰 Debit: {format_amount(int(debit))}")
        lines.append(f"   💰 Kredit: {format_amount(int(kredit))}")
        lines.append(f"   📈 Saldo: {format_amount(int(saldo))}")
        lines.append("")

    return "\n".join(lines).strip()


async def _list_accounts() -> str:
    """Tampilkan daftar semua akun COA."""
    q = "select=id,code,name,type&order=code.asc&limit=50"
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            f"{SUPABASE_URL}/rest/v1/accounting_chart_of_accounts?{q}",
            headers={
                "apikey": SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}",
            },
        )
        if resp.status_code >= 400:
            return f"❌ Gagal mengambil daftar akun."
        accounts = resp.json()

    if not accounts:
        return "📭 Belum ada akun COA."

    lines = ["📋 **Daftar Akun (COA)**", ""]
    current_type = ""
    for a in accounts:
        if a["type"] != current_type:
            current_type = a["type"]
            type_icon = {"asset": "💵", "liability": "💳", "equity": "🏦", "revenue": "💰", "expense": "💸"}.get(current_type, "📁")
            lines.append(f"{type_icon} **{current_type.upper()}**")
        lines.append(f"  {a['code']} — {a['name']}")

    return "\n".join(lines)


async def _query_debit_kredit(period: str) -> str:
    """Hitung total debit dan kredit untuk periode tertentu."""
    start_ms, end_ms = _accounting_period_range(period)

    period_labels = {
        "hari_ini": "Hari Ini",
        "kemarin": "Kemarin",
        "minggu_ini": "Minggu Ini",
        "bulan_ini": "Bulan Ini",
    }
    label = period_labels.get(period, period)

    # Join accounting_entries dengan financial_transactions untuk filter by tx_date
    q = (
        f"select=entry_type,amount&tx_date=gte.{start_ms}&tx_date=lte.{end_ms}&limit=10000"
    )
    # Use service_role to join across schemas
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Accept-Profile": "pos",
    }

    # Query langsung financial_transactions untuk periode
    q_tx = f"select=source_id&tx_date=gte.{start_ms}&tx_date=lte.{end_ms}&limit=5000"
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            f"{SUPABASE_URL}/rest/v1/financial_transactions?{q_tx}",
            headers=headers,
        )
        if resp.status_code >= 400:
            return f"❌ Gagal query transaksi."
        txns = resp.json()

    if not txns:
        return f"📭 Tidak ada transaksi periode **{label}**."

    source_ids = [t["source_id"] for t in txns]

    # Query accounting_entries by source_ids
    total_debit = 0.0
    total_kredit = 0.0

    # Batch in chunks of 100
    for i in range(0, len(source_ids), 100):
        batch = source_ids[i:i + 100]
        ids_csv = ",".join(batch)
        q_ae = (
            f"select=entry_type,amount&transaction_source_id=in.({ids_csv})&limit=10000"
        )
        async with httpx.AsyncClient(timeout=30) as client:
            resp_ae = await client.get(
                f"{SUPABASE_URL}/rest/v1/accounting_entries?{q_ae}",
                headers={
                    "apikey": SUPABASE_KEY,
                    "Authorization": f"Bearer {SUPABASE_KEY}",
                },
            )
            if resp_ae.status_code == 200:
                entries = resp_ae.json()
                for e in entries:
                    amt = float(e.get("amount", 0))
                    if e.get("entry_type") == "debit":
                        total_debit += amt
                    else:
                        total_kredit += amt

    selisih = abs(total_debit - total_kredit)
    balanced = abs(selisih) < 1  # toleransi 1 rupiah

    lines = [
        f"📊 **Debit & Kredit — {label}**",
        "",
        f"💳 Total Debit:  {format_amount(int(total_debit))}",
        f"💳 Total Kredit: {format_amount(int(total_kredit))}",
        "",
    ]

    if balanced:
        lines.append(f"✅ **SEIMBANG** (selisih Rp{format_amount(int(selisih))})")
    else:
        lines.append(f"⚠️ **TIDAK SEIMBANG** (selisih Rp{format_amount(int(selisih))})")

    lines.append("")
    lines.append(f"📦 {len(source_ids)} transaksi di periode ini")

    return "\n".join(lines)


MIN_SCORE_AUTO = 60
MIN_SCORE_SUGGEST = 45


# ── Text Handler ───────────────────────────────────────────────────

async def on_text(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle text dari grup keuangan."""
    text = (update.message.text or "").strip()
    if not text:
        return

    # ── Employee auth ────────────────────────────────────────
    # Auto-recognize user dari employee_telegram_links
    emp = await _require_employee(update)
    if emp:
        context.user_data["emp"] = emp

    # Pending edit replies are plain text in the group, so accept them without
    # requiring @mention/reply to the bot.
    user_id = update.effective_user.id if update.effective_user else None
    if user_id:
        pending_item_key = f"edit_item_{user_id}"
        pending_date_key = f"edit_date_{user_id}"
        if pending_item_key in _pending_actions:
            handled = await _handle_edit_item_text(update, context, text)
            if handled:
                return
        if pending_date_key in _pending_actions:
            handled = await _handle_edit_date_text(update, context, text)
            if handled:
                return

        # Safety net: if the pending edit marker disappeared after a restart,
        # accept a date-only reply for the newest receipt that still has no date.
        if re.match(r"^\d{4}-\d{2}-\d{2}(?:\s+\d{2}:\d{2}(?::\d{2})?)?$", text):
            open_receipts = [
                (ref, rcpt) for ref, rcpt in _receipt_pending.items()
                if not rcpt.get("date")
            ]
            if open_receipts:
                ref_id, _ = open_receipts[-1]
                _pending_actions[pending_date_key] = {"ref_id": ref_id}
                _save_pending()
                handled = await _handle_edit_date_text(update, context, text)
                if handled:
                    return

    if not _can_respond(update):
        return

    # Check for pending edit item response
    pending_key = f"edit_item_{update.effective_user.id}"
    if pending_key in _pending_actions:
        handled = await _handle_edit_item_text(update, context, text)
        if handled:
            return

    # Check for pending edit date response
    pending_date_key = f"edit_date_{update.effective_user.id}"
    if pending_date_key in _pending_actions:
        handled = await _handle_edit_date_text(update, context, text)
        if handled:
            return

    # Tunjukkan typing indicator
    await context.bot.send_chat_action(chat_id=update.effective_chat.id, action="typing")

    # Route ke orchestrator
    # ── Accounting query patterns ──────────────────────────────
    # These are handled directly without orchestrator (fast path)
    accounting_match = re.match(
        r'^(?:cek|lihat|check|hitung|total)\s+(?:akun|akuntansi|coa)\s+(.+)',
        text, re.IGNORECASE,
    )
    if accounting_match:
        coa_query = accounting_match.group(1).strip()
        await context.bot.send_chat_action(chat_id=update.effective_chat.id, action="typing")
        try:
            result_text = await _query_account_balance(coa_query)
            await update.message.reply_text(result_text, reply_markup=_finance_keyboard())
        except Exception as e:
            logger.exception("Accounting query failed")
            await update.message.reply_text(f"❌ Error: {e}", reply_markup=_finance_keyboard())
        return

    if re.match(r'^(?:daftar|list)\s+(?:akun|akuntansi|coa)', text, re.IGNORECASE):
        await context.bot.send_chat_action(chat_id=update.effective_chat.id, action="typing")
        try:
            result_text = await _list_accounts()
            await update.message.reply_text(result_text, reply_markup=_finance_keyboard())
        except Exception as e:
            logger.exception("List accounts failed")
            await update.message.reply_text(f"❌ Error: {e}", reply_markup=_finance_keyboard())
        return

    debit_kredit_match = re.match(
        r'^(?:cek|lihat|check|total|hitung)\s+(?:debit|kredit|double.?entry)\s*(.*?)$',
        text, re.IGNORECASE,
    )
    if debit_kredit_match:
        period_text = debit_kredit_match.group(1).strip()
        period_key = _parse_accounting_period(period_text) if period_text else "hari_ini"
        await context.bot.send_chat_action(chat_id=update.effective_chat.id, action="typing")
        try:
            result_text = await _query_debit_kredit(period_key)
            await update.message.reply_text(result_text, reply_markup=_finance_keyboard())
        except Exception as e:
            logger.exception("Debit/kredit query failed")
            await update.message.reply_text(f"❌ Error: {e}", reply_markup=_finance_keyboard())
        return

    # ── End accounting patterns ────────────────────────────────
    result = await orchestrator.orchestrate(text)

    try:
        if result.action in ("record_income", "record_expense"):
            # ── Tampilkan preview + konfirmasi sebelum simpan ─────
            tx_type_label = "Pemasukan" if result.action == "record_income" else "Pengeluaran"
            category, _ = auto_categorize(result.description, result.amount)
            if result.items and not result.category:
                item_categories = [
                    categorize_item_with_memory(
                        it.get("name", ""),
                        float(it.get("price", 0) or 0),
                        result.merchant,
                        memory_manager=memory,
                    )[0]
                    for it in result.items
                    if it.get("name")
                ]
                if item_categories:
                    category = Counter(item_categories).most_common(1)[0][0]
            if result.category:
                category = result.category

            # Build receipt items dari orchestrator result
            items = []
            if result.items:
                for it in result.items:
                    qty = float(it.get("qty", 1))
                    price = float(it.get("price", 0))
                    items.append({
                        "name": it.get("name", ""),
                        "qty": qty,
                        "price": price,
                        "subtotal": qty * price,
                        "unit": it.get("unit", ""),
                    })

            # Apply same normalization pipeline as OCR (alias + unit canonicalization)
            items = _normalize_ocr_items(items)

            # Simpan ke pending receipt — reuses existing _handle_receipt_callback
            ref_id = f"rcpt_{len(_receipt_pending)}"
            _receipt_pending[ref_id] = {
                "merchant": result.merchant or "",
                "date": "",
                "time": "",
                "items": items,
                "total": result.amount,
                "subtotal": 0,
                "tax": 0,
                "discount": 0,
                "service_charge": 0,
                "payment_method": result.payment_method or "cash",
                "receipt_number": "",
                "category": category,
                "raw_text": result.description or "",
                "confidence": 1.0,
                "tx_type": result.action.replace("record_", ""),
                "_description": result.description or tx_type_label,
            }
            _save_pending()

            # Format preview
            pay_str = f" — {result.payment_method}" if result.payment_method and result.payment_method.upper() != "CASH" else ""
            merch_str = f" di {result.merchant}" if result.merchant else ""
            lines = [f"📝 {tx_type_label} — Konfirmasi", ""]
            lines.append(f"💰 Total: {format_amount(int(result.amount))}")
            if result.merchant:
                lines.append(f"🏪 {result.merchant}")
            if result.payment_method and result.payment_method.upper() != "CASH":
                lines.append(f"💳 {result.payment_method}")
            lines.append(f"📝 {result.description or tx_type_label}{merch_str}{pay_str}")
            if items:
                lines.append("")
                lines.append("📋 Daftar Item:")
                for i, item in enumerate(items, 1):
                    name = item.get("name", "?")
                    _q = item["qty"]
                    _p = item["price"]
                    qs = f"{_q:.0f}" if _q == int(_q) else f"{_q:.1f}"
                    us = f" {item.get('unit','')}" if item.get('unit') else ""
                    lines.append(f"  {i}. {name} — {qs}{us} × Rp{_p:,.0f} = {format_amount(int(item['subtotal']))}")
            lines.append("")
            lines.append(f"📁 Kategori: {get_category_label(category)}")
            lines.append("")
            lines.append("Simpan?")

            keyboard = InlineKeyboardMarkup([
                [InlineKeyboardButton("✅ Simpan", callback_data=f"receipt_{result.action.replace('record_','')}_{ref_id}")],
                [
                    InlineKeyboardButton("✏️ Edit Kategori", callback_data=f"receipt_editcat_{ref_id}"),
                    InlineKeyboardButton("✏️ Edit Tanggal", callback_data=f"editdate_{ref_id}"),
                ],
                [InlineKeyboardButton("✏️ Edit Item", callback_data=f"edititem_{ref_id}")],
                [InlineKeyboardButton("❌ Batal", callback_data=f"receipt_cancel_{ref_id}")],
            ])

            await update.message.reply_text("\n".join(lines), reply_markup=keyboard)

        elif result.action == "balance":
            period = result.text or "hari_ini"
            balance = await finance.get_balance(period)
            period_labels = {"hari_ini": "Hari Ini", "kemarin": "Kemarin", "minggu_ini": "Minggu Ini", "bulan_ini": "Bulan Ini"}
            label = period_labels.get(period, period)
            aw = datetime.now(WIB)
            lines = [
                f"🏦 Saldo {label}",
                f"📅 {aw.strftime('%d/%m/%Y %H:%M')}",
                "",
                f"💰 Pemasukan:    {format_amount(int(balance['income']))} ({balance['count_income']} tx)",
                f"💸 Pengeluaran:  {format_amount(int(balance['expense']))} ({balance['count_expense']} tx)",
                "",
                f"📊 Saldo Bersih: {format_amount(int(balance['balance']))}",
            ]
            await update.message.reply_text("\n".join(lines), reply_markup=_finance_keyboard())

        elif result.action == "summary":
            period = result.text or "hari_ini"
            tx_type_filter = result.description if result.description in ("income", "expense") else None
            text_summary = await finance.get_summary(period, tx_type=tx_type_filter)
            await update.message.reply_text(text_summary, reply_markup=_finance_keyboard())

        elif result.action == "comparison":
            comparison = await finance.get_comparison(
                result.text or "bulan_ini",
                tx_type=None if result.description == "all" else result.description,
            )
            await update.message.reply_text(
                finance.format_comparison(comparison),
                reply_markup=_finance_keyboard(),
            )

        elif result.action == "category_breakdown":
            breakdown = await finance.get_category_breakdown()
            await update.message.reply_text(breakdown, reply_markup=_finance_keyboard())

        elif result.action == "search":
            keyword = result.text or ""
            matches = await finance.search_transactions(keyword)
            if not matches:
                await update.message.reply_text(f"🔍 Tidak ada transaksi dengan kata kunci '{keyword}'.", reply_markup=_finance_keyboard())
                return
            lines = [f"🔍 Hasil Pencarian: '{keyword}'", f"Menampilkan {len(matches)} transaksi terakhir", ""]
            for r in matches[:10]:
                ts = int(r.get("tx_date", 0))
                dt = datetime.fromtimestamp(ts / 1000, tz=WIB).strftime("%d/%m %H:%M")
                tx_type = r.get("tx_type", "?")
                icon = "💰" if tx_type == "income" else "💸"
                amt = float(r.get("amount", 0))
                cat = r.get("category", "?")
                desc = (r.get("description") or "?")[:30]
                lines.append(f"{icon} {dt} | {format_amount(int(amt))} | {cat}")
                lines.append(f"   📝 {desc}")
            await update.message.reply_text("\n".join(lines), reply_markup=_finance_keyboard())

        else:
            # Unknown / chat — kirim balasan AI
            reply_text = result.text or (
                "Maaf, saya belum paham. 😅\n\n"
                "Coba ketik:\n"
                "• `pemasukan 50000` — catat pemasukan\n"
                "• `pengeluaran 25000 beli gula` — catat pengeluaran\n"
                "• `saldo` — cek saldo\n"
                "• `ringkasan bulan ini` — laporan\n"
                "• Atau tanya bebas — aku bisa reasoning!"
            )
            await update.message.reply_text(reply_text, reply_markup=_finance_keyboard())

    except Exception as e:
        logger.exception("Text handler failed")
        await update.message.reply_text(f"❌ Error: {e}", reply_markup=_finance_keyboard())


# ── Callback Handler ──────────────────────────────────────────────

async def on_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle semua callback dari inline keyboard."""
    query = update.callback_query

    # Handle receipt confirmation callbacks (struk)
    if query.data.startswith("receipt_"):
        await _handle_receipt_callback(update, context)
        return

    # Handle re-analyze callback
    if query.data.startswith("reanalyze_"):
        await _handle_reanalyze(update, context)
        return

    # Handle edit item callbacks
    if query.data.startswith("edititem_"):
        await _handle_edit_item(update, context)
        return
    if query.data.startswith("editfield_"):
        await _handle_edit_item_field(update, context)
        return

    # Handle edit date callbacks
    if query.data.startswith("editdate_"):
        await _handle_edit_date(update, context)
        return

    # Handle bulk OCR callbacks (album multi-foto)
    if query.data.startswith("bulk_"):
        await _handle_bulk_callback(update, context)
        return
    if query.data.startswith("bulkitem_"):
        await _handle_bulkitem_callback(update, context)
        return

    # Handle daftar transaksi callbacks
    if query.data.startswith("daftar_"):
        await _handle_daftar_callback(update, context)
        return

    # Handle new ingredient callbacks
    if query.data.startswith("new_ingredient_"):
        await _handle_new_ingredient(update, context)
        return

    # Handle restock callbacks
    if query.data.startswith("restock_"):
        await _handle_new_ingredient(update, context)
        return

    await query.answer()

    # ── Navigation: period filter & back ──────────────────
    # Back ke menu utama
    if query.data == "back_main":
        await query.edit_message_text(
            "🏠 Menu utama. Pilih opsi di bawah:",
            reply_markup=_finance_keyboard(),
        )
        return

    # Pemasukan / Pengeluaran → pilih periode
    if query.data == "quick_income":
        await query.edit_message_text(
            "📅 Pilih periode pemasukan:",
            reply_markup=_period_keyboard("income"),
        )
        return
    if query.data == "quick_expense":
        await query.edit_message_text(
            "📅 Pilih periode pengeluaran:",
            reply_markup=_period_keyboard("expense"),
        )
        return

    # Period filter: period_{income/expense}_{period_key}
    pm = re.match(r"period_(income|expense)_(.+)", query.data)
    if pm:
        tx_type = pm.group(1)
        period_key = pm.group(2)
        type_label = "Pemasukan" if tx_type == "income" else "Pengeluaran"
        period_labels = {
            "hari_ini": "Hari Ini", "kemarin": "Kemarin",
            "minggu_ini": "Minggu Ini", "minggu_lalu": "Minggu Lalu",
            "bulan_ini": "Bulan Ini", "bulan_lalu": "Bulan Lalu",
        }
        label = period_labels.get(period_key, period_key)

        await context.bot.send_chat_action(chat_id=update.effective_chat.id, action="typing")
        try:
            SKIP_CATEGORIES = {"Modal Awal", "Setoran Akhir"}
            txns = await finance.get_transactions(tx_type=tx_type, period=period_key)
            if not txns:
                await query.edit_message_text(
                    f"📭 Tidak ada {type_label.lower()} periode **{label}**.",
                    reply_markup=_period_keyboard(tx_type),
                )
                return

            # Filter: skip Modal Awal & Setoran Akhir (bukan penjualan riil)
            filtered = [t for t in txns if (t.get("category") or "") not in SKIP_CATEGORIES]
            skipped = len(txns) - len(filtered)
            txns = filtered

            lines = [f"📋 *{type_label} — {label}*", ""]
            total = 0
            for t in txns:
                amt = float(t.get("amount") or 0)
                desc = (t.get("description") or "").strip()[:50]
                date_str = ""
                ts = t.get("tx_date")
                if ts:
                    dt = datetime.fromtimestamp(ts / 1000, tz=WIB)
                    date_str = dt.strftime("%d/%m")
                total += amt
                lines.append(f"  {date_str}  {format_amount(int(amt))}  {desc}")

            lines.append("")
            lines.append(f"─── ⋆ ───")
            lines.append(f"💰 *Total: {format_amount(int(total))}*")
            if skipped > 0:
                lines.append(f"ℹ️ {skipped} transaksi shift (modal/setoran) tidak dihitung")
            lines.append("")
            lines.append("Pilih periode lain:")
            await query.edit_message_text("\n".join(lines), reply_markup=_period_keyboard(tx_type))
        except Exception as e:
            logger.exception("Period query failed")
            await query.edit_message_text(f"❌ Error: {e}", reply_markup=_period_keyboard(tx_type))
        return

    # ── Quick action buttons ──────────────────────────────
    action_map = {
        "quick_income": "pemasukan ",
        "quick_expense": "pengeluaran ",
        "quick_balance": "saldo",
        "quick_summary": "ringkasan hari ini",
        "quick_category": "kategori",
        "quick_ai": (
            "Halo! Aku Yumi Finance AI Agent. 👋\n\n"
            "Aku bisa bantu:\n"
            "• Catat pemasukan & pengeluaran\n"
            "• Cek saldo & ringkasan keuangan\n"
            "• Scan struk belanja (kirim foto)\n"
            "• Tanya bebas — aku bisa reasoning!\n\n"
            "Untuk inventory: pakai @YumiPurchasingBot\n\n"
            "Coba ketik bebas atau pilih menu di bawah 👇"
        ),
    }

    action = action_map.get(query.data)
    if action is None:
        return

    if query.data == "quick_ai":
        await query.edit_message_text(action, reply_markup=_finance_keyboard())
        return
    # Untuk quick_balance, quick_summary, quick_category — trigger orchestrator
    text = action
    await context.bot.send_chat_action(chat_id=update.effective_chat.id, action="typing")
    result = await orchestrator.orchestrate(text)

    # Re-use on_text logic via simulated message
    # We'll just handle directly
    try:
        if result.action == "balance":
            balance = await finance.get_balance()
            aw = datetime.now(WIB)
            lines = [
                f"🏦 Saldo Hari Ini",
                f"📅 {aw.strftime('%d/%m/%Y %H:%M')}",
                "",
                f"💰 Pemasukan:    {format_amount(int(balance['income']))} ({balance['count_income']} tx)",
                f"💸 Pengeluaran:  {format_amount(int(balance['expense']))} ({balance['count_expense']} tx)",
                "",
                f"📊 Saldo Bersih: {format_amount(int(balance['balance']))}",
            ]
            await query.edit_message_text("\n".join(lines), reply_markup=_finance_keyboard())

        elif result.action == "summary":
            text_summary = await finance.get_summary("hari_ini")
            await query.edit_message_text(text_summary, reply_markup=_finance_keyboard())

        elif result.action == "category_breakdown":
            breakdown = await finance.get_category_breakdown()
            await query.edit_message_text(breakdown, reply_markup=_finance_keyboard())

    except Exception as e:
        logger.exception("Callback handler failed")
        try:
            await query.edit_message_text(f"❌ Error: {e}", reply_markup=_finance_keyboard())
        except Exception:
            pass


# ── Hermes diagnostic commands ────────────────────────────────────


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
    if not _can_respond(update):
        return
    scope = project_scope_summary()
    await update.message.reply_text(
        "Hermes Finance scope\n"
        f"Profile: finance\n"
        f"Project: {scope['project_root']}\n"
        f"Mode: {scope['mode']}\n"
        "Batas: read-only diagnostic; tidak sudo/systemctl/VPS/outside project.",
        reply_markup=_finance_keyboard(),
    )


async def cmd_hermes_test(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not _can_respond(update):
        return
    request = build_request(
        profile_id="finance",
        message="finance adapter diagnostic",
        telegram=_telegram_context_from_update(update),
        can_write=False,
    )
    response = {"reply_text": "Hermes finance adapter OK", "actions": [], "metadata": {"profile_id": "finance"}}
    validate_response(response)
    audit_event({
        "event": "telegram_command",
        "profile_id": "finance",
        "mode": "read_only",
        "telegram": request["telegram"],
        "message": "telegram command /hermes_test",
        "actions": [],
    })
    await update.message.reply_text(response["reply_text"], reply_markup=_finance_keyboard())


async def cmd_yumi(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not _can_respond(update):
        return
    text = " ".join(context.args).strip()
    if not text:
        await update.message.reply_text("Pakai format: /yumi pertanyaan finance kamu", reply_markup=_finance_keyboard())
        return
    request = build_request(
        profile_id="finance",
        message=text,
        telegram=_telegram_context_from_update(update),
        can_write=False,
    )
    response = {
        "reply_text": "Hermes finance read-only menerima request. Action keuangan belum dieksekusi; gunakan flow finance existing untuk catat transaksi.",
        "actions": [],
        "metadata": {"profile_id": "finance"},
    }
    validate_response(response)
    audit_event({
        "event": "telegram_command",
        "profile_id": "finance",
        "mode": "read_only",
        "telegram": request["telegram"],
        "message": "telegram command /yumi",
        "input_preview": text[:160],
        "actions": [],
    })
    await update.message.reply_text(response["reply_text"], reply_markup=_finance_keyboard())


# ── Commands ──────────────────────────────────────────────────────

async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handler /start"""
    if not _can_respond(update):
        await update.message.reply_text("Bot ini hanya untuk grup keuangan khusus.")
        return

    # ── Cek registrasi employee ──────────────────────────────
    emp = await _require_employee(update)
    if emp:
        context.user_data["emp"] = emp
        greeting = f"Halo {emp['employee_name']}! 👋"
    else:
        greeting = "Halo! 👋"

    await update.message.reply_text(
        f"🤖 Yumi Finance AI Agent\n\n"
        f"{greeting}\n\n"
        "Asisten keuangan untuk bisnis kamu.\n\n"
        "Fitur:\n"
        "💰 Catat pemasukan & pengeluaran\n"
        "🏦 Cek saldo & ringkasan keuangan\n"
        "📸 Scan struk belanja (OCR)\n"
        "💬 AI Chat — tanya bebas!\n\n"
        "Untuk inventory & marketlist: @YumiPurchasingBot\n\n"
        "Cara pakai:\n"
        "• `pemasukan 50000` — catat pemasukan\n"
        "• `pengeluaran 25000 beli gula` — catat pengeluaran\n"
        "• `saldo` — cek saldo\n"
        "• Kirim `foto struk` — auto catat\n"
        "• Tanya bebas — aku bisa reasoning!\n\n"
        "Pilih menu di bawah 👇",
        reply_markup=_finance_keyboard(),
    )


async def cmd_rekap(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handler /rekap — rekap struk OCR yang diproses."""
    if not _can_respond(update):
        return

    await context.bot.send_chat_action(chat_id=update.effective_chat.id, action="typing")

    # Parse argumen periode
    args = (update.message.text or "").split()
    period_text = " ".join(args[1:]).strip().lower() if len(args) > 1 else "hari ini"

    period_map = {
        "hari ini": "Hari Ini",
        "kemarin": "Kemarin",
        "minggu ini": "Minggu Ini",
        "bulan ini": "Bulan Ini",
    }
    label = "Hari Ini"
    for key, val in period_map.items():
        if key in period_text:
            label = val
            break

    # Hitung rentang timestamp
    now = datetime.now(WIB)
    if "kemarin" in period_text:
        yesterday = now - timedelta(days=1)
        start = yesterday.replace(hour=0, minute=0, second=0, microsecond=0)
        end = yesterday.replace(hour=23, minute=59, second=59, microsecond=999999)
    elif "minggu" in period_text:
        start = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
        end = now
    elif "bulan" in period_text:
        start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        end = now
    else:  # hari ini
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        end = now

    start_ms = int(start.timestamp() * 1000)
    end_ms = int(end.timestamp() * 1000)

    # Query transaksi dengan metadata->>ocr = true
    try:
        q = (
            f"select=source_id,amount,category,description,merchant,tx_date,metadata&"
            f"metadata->>ocr=eq.true&"
            f"tx_date=gte.{start_ms}&tx_date=lte.{end_ms}&"
            f"order=tx_date.asc&limit=200"
        )
        rows = await finance._fetch("financial_transactions", q)

        if not rows:
            label_lower = label.lower()
            await update.message.reply_text(
                f"Belum ada struk diproses {label_lower}.",
                reply_markup=_finance_keyboard(),
            )
            return

        lines = [f"📸 Rekap Struk {label}:"]
        total_amount = 0.0
        for i, r in enumerate(rows, 1):
            merchant = (r.get("merchant") or "").strip() or "Tanpa Nama"
            amount = float(r.get("amount") or 0)
            category = r.get("category", "lainnya") or "lainnya"
            tx_date_ms = int(r.get("tx_date", 0))
            dt = datetime.fromtimestamp(tx_date_ms / 1000, tz=WIB).strftime("%d/%m")
            cat_label = FINANCE_CATEGORIES.get(category, {}).get("label", category)
            short_merchant = merchant[:20]
            lines.append(f"{i}. {short_merchant} — {format_amount(int(amount))} ({cat_label}) {dt}")
            total_amount += amount

        lines.append("─────────────────")
        lines.append(f"Total: {len(rows)} struk · {format_amount(int(total_amount))}")

        await update.message.reply_text("\n".join(lines), reply_markup=_finance_keyboard())
    except Exception as e:
        logger.exception("cmd_rekap failed")
        await update.message.reply_text(f"❌ Gagal mengambil rekap: {e}", reply_markup=_finance_keyboard())


async def cmd_struk(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handler /struk <source_id> — lihat gambar struk + analisis ulang."""
    if not _can_respond(update):
        return

    args = (update.message.text or "").split()
    if len(args) < 2:
        await update.message.reply_text(
            "Gunakan: /struk <source_id>\n\n"
            "Contoh: /struk fin_abc123...",
            reply_markup=_finance_keyboard(),
        )
        return

    source_id = args[1].strip()

    # Fetch transaction
    try:
        q = f"select=source_id,amount,category,description,merchant,tx_date,tx_type,metadata&source_id=eq.{source_id}"
        rows = await finance._fetch("financial_transactions", q)
        if not rows:
            await update.message.reply_text(
                f"❌ Transaksi {source_id[:20]}... tidak ditemukan.",
                reply_markup=_finance_keyboard(),
            )
            return

        tx = rows[0]
        metadata = tx.get("metadata", {}) or {}
        receipt_image_url = metadata.get("receipt_image_url", "") if isinstance(metadata, dict) else ""

        if not receipt_image_url:
            await update.message.reply_text(
                "❌ Struk ini tidak memiliki gambar tersimpan.",
                reply_markup=_finance_keyboard(),
            )
            return

        # Build caption
        lines = [
            f"🧾 {tx.get('merchant', 'Tanpa Nama')}",
            f"💰 {format_amount(int(tx.get('amount', 0)))}",
            f"📁 {get_category_label(tx.get('category', 'lainnya'))}",
            f"🔖 {tx.get('tx_type', 'income'):s}",
        ]
        keyboard = InlineKeyboardMarkup([
            [InlineKeyboardButton("🔍 Analisis Ulang", callback_data=f"reanalyze_{source_id}")],
        ])

        await context.bot.send_photo(
            chat_id=update.effective_chat.id,
            photo=receipt_image_url,
            caption="\n".join(lines),
            reply_markup=keyboard,
        )
    except Exception as e:
        logger.exception("cmd_struk failed")
        await update.message.reply_text(f"❌ Gagal: {e}", reply_markup=_finance_keyboard())


async def _handle_reanalyze(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Re-analyze stored receipt via AI vision."""
    query = update.callback_query
    await query.answer()

    source_id = query.data[len("reanalyze_"):]

    try:
        # Get receipt image URL from transaction metadata
        q = f"select=metadata&source_id=eq.{source_id}"
        rows = await finance._fetch("financial_transactions", q)
        if not rows:
            await query.edit_message_caption(caption="❌ Transaksi tidak ditemukan.")
            return

        metadata = rows[0].get("metadata", {}) or {}
        if isinstance(metadata, str):
            try:
                import json as _json
                metadata = _json.loads(metadata)
            except Exception:
                metadata = {}
        receipt_image_url = metadata.get("receipt_image_url", "") if isinstance(metadata, dict) else ""

        if not receipt_image_url:
            await query.edit_message_caption(caption="❌ Tidak ada gambar struk.")
            return

        await query.edit_message_caption(caption="🔍 Menganalisis ulang struk...")

        # Download image from Storage
        image_bytes = await _download_from_storage(receipt_image_url)
        if not image_bytes:
            await query.edit_message_caption(caption="❌ Gagal mengunduh gambar dari storage.")
            return

        # Compress for vision
        jpeg_bytes, compressed_uri = _compress_image(image_bytes)

        # Run AI vision again
        sp_client = SumoPodClient(SUMOPOD_API_KEY)
        vision_result = await sp_client.vision_json(image_base64_uri=compressed_uri, timeout=90)

        if not vision_result.get("success"):
            vision_result = await local_vision_json(image_bytes, sumopod_client=sp_client)

        if not vision_result.get("success"):
            await query.edit_message_caption(
                caption=f"❌ Gagal analisis ulang: {vision_result.get('error', 'Unknown')}"
            )
            return

        # Format result
        data = vision_result.get("data", {})
        merchant = (data.get("name") or "").strip()
        total = float(data.get("total") or 0)
        items = data.get("items") or []

        lines = ["🔍 **Hasil Analisis Ulang:**", ""]
        if merchant:
            lines.append(f"🏪 Merchant: {merchant}")
        if total > 0:
            lines.append(f"💰 Total: {format_amount(int(total))}")
        if receipt_image_url:
            lines.append(f"🖼️ Gambar: {receipt_image_url[:60]}...")

        # Cari perubahan signifikan dari data tersimpan
        old_total = float(rows[0].get("amount", 0)) if rows else 0
        if old_total > 0 and total > 0 and abs(total - old_total) > 1000:
            diff = total - old_total
            sign = "+" if diff > 0 else ""
            lines.append(f"⚠️ Perubahan nominal: sebelumnya {format_amount(int(old_total))} → sekarang {format_amount(int(total))} ({sign}{format_amount(int(diff))})")

        if items:
            lines.append("")
            lines.append(f"📋 Item ({len(items)}):")
            for i, item in enumerate(items[:10], 1):
                name = item.get("name", f"Item {i}")
                qty = float(item.get("qty", 1))
                price = float(item.get("price", 0))
                item_sub = float(item.get("subtotal", 0)) or (price * qty)
                lines.append(f"  {i}. {name} — {format_amount(int(item_sub))}")
            if len(items) > 10:
                lines.append(f"  ... dan {len(items) - 10} lainnya")

        await query.edit_message_caption(caption="\n".join(lines))
        logger.info("Re-analysis complete for %s", source_id)

    except Exception as e:
        logger.exception("reanalyze failed")
        try:
            await query.edit_message_caption(caption=f"❌ Gagal analisis ulang: {e}")
        except Exception:
            pass


async def cmd_daftar(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handler /daftar — menu tombol: Pemasukan / Pengeluaran / Semua."""
    if not _can_respond(update):
        return

    await context.bot.send_chat_action(chat_id=update.effective_chat.id, action="typing")

    try:
        text, keyboard = await _build_daftar_menu()
        await update.message.reply_text(text, reply_markup=keyboard)
    except Exception as e:
        logger.exception("cmd_daftar failed")
        await update.message.reply_text(f"❌ Gagal: {e}", reply_markup=_finance_keyboard())


async def _build_daftar_menu():
    """Bangun teks dan keyboard menu daftar transaksi."""
    now = datetime.now(WIB)
    start_ms = int((now - timedelta(days=7)).timestamp() * 1000)
    end_ms = int(now.timestamp() * 1000)

    base_q = f"select=amount&tx_date=gte.{start_ms}&tx_date=lte.{end_ms}&category=neq.HPP&limit=500"
    income_rows = await finance._fetch("financial_transactions", base_q + "&tx_type=eq.income")
    expense_rows = await finance._fetch("financial_transactions", base_q + "&tx_type=eq.expense")

    total_in = sum(float(r.get("amount") or 0) for r in income_rows) if income_rows else 0
    total_out = sum(float(r.get("amount") or 0) for r in expense_rows) if expense_rows else 0
    count_in = len(income_rows) if income_rows else 0
    count_out = len(expense_rows) if expense_rows else 0

    lines = [
        "📋 *Daftar Transaksi 7 Hari*",
        "",
        f"💰 Pemasukan: {format_amount(int(total_in))} ({count_in}x)" if count_in else "💰 Pemasukan: -",
        f"💸 Pengeluaran: {format_amount(int(total_out))} ({count_out}x)" if count_out else "💸 Pengeluaran: -",
        "",
        "Pilih jenis transaksi untuk lihat detail + source_id:",
    ]

    keyboard = InlineKeyboardMarkup([
        [InlineKeyboardButton("💰 Pemasukan", callback_data="daftar_income"),
         InlineKeyboardButton("💸 Pengeluaran", callback_data="daftar_expense")],
        [InlineKeyboardButton("📋 Semua", callback_data="daftar_all")],
    ])

    return "\n".join(lines), keyboard


async def _show_transaction_list(tx_type: str, update: Update, context: ContextTypes.DEFAULT_TYPE, query):
    """Tampilkan daftar transaksi berdasarkan tipe, dengan tombol kembali."""
    now = datetime.now(WIB)
    start_ms = int((now - timedelta(days=7)).timestamp() * 1000)
    end_ms = int(now.timestamp() * 1000)

    type_label = "Pemasukan" if tx_type == "income" else "Pengeluaran" if tx_type == "expense" else "Semua"
    icon = "💰" if tx_type == "income" else "💸" if tx_type == "expense" else "📋"

    q = f"select=source_id,tx_type,amount,category,description,merchant,tx_date&tx_date=gte.{start_ms}&tx_date=lte.{end_ms}&order=tx_date.desc&limit=30&category=neq.HPP"
    if tx_type in ("income", "expense"):
        q += f"&tx_type=eq.{tx_type}"

    rows = await finance._fetch("financial_transactions", q)

    if not rows:
        await query.edit_message_text(
            f"{icon} {type_label}: belum ada transaksi dalam 7 hari terakhir.",
            reply_markup=InlineKeyboardMarkup([
                [InlineKeyboardButton("⬅️ Kembali", callback_data="daftar_menu")]
            ])
        )
        return

    def _fmt(t):
        sid = t.get("source_id", "-")[:28]
        amt = float(t.get("amount") or 0)
        cat = (t.get("category") or "lainnya")[:15]
        merchant = (t.get("merchant") or "").strip()[:20]
        desc = (t.get("description") or "").strip()[:30]
        ts = t.get("tx_date")
        date_str = ""
        if ts:
            dt = datetime.fromtimestamp(ts / 1000, tz=WIB)
            date_str = dt.strftime("%d/%m %H:%M")
        label = merchant or desc or cat
        return f"• {format_amount(int(amt))}  {date_str}\n  🏷️ {label}\n  `{sid}`"

    lines = [f"{icon} *{type_label}* ({len(rows)} transaksi)"]
    for i, t in enumerate(rows, 1):
        lines.append(f"{i}. " + _fmt(t))

    max_msg = 4000
    parts = []
    current = []
    for line in lines:
        current.append(line)
        if len("\n".join(current)) > max_msg:
            parts.append("\n".join(current[:-1]))
            current = [current[-1]]
    if current:
        parts.append("\n".join(current))

    back_kb = InlineKeyboardMarkup([
        [InlineKeyboardButton("⬅️ Kembali", callback_data="daftar_menu")]
    ])

    # Edit pesan pertama
    await query.edit_message_text(parts[0], reply_markup=back_kb if len(parts) == 1 else None)

    # Kirim sisanya sebagai pesan baru
    for p in parts[1:]:
        await query.message.reply_text(p)


async def _handle_daftar_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handler tombol daftar transaksi: income / expense / all / menu."""
    query = update.callback_query
    await query.answer()
    data = query.data

    if data == "daftar_menu":
        text, keyboard = await _build_daftar_menu()
        await query.edit_message_text(text, reply_markup=keyboard)
        return

    tx_type = data.replace("daftar_", "")  # "income", "expense", "all"
    await _show_transaction_list(tx_type, update, context, query)


async def cmd_hapus_struk(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handler /hapus_struk <source_id> — hapus transaksi beserta data terkait."""
    if not _can_respond(update):
        return

    args = context.args
    if not args:
        await update.message.reply_text(
            "📋 Gunakan: /hapus_struk <source_id>\n\n"
            "Cari source_id dengan perintah /daftar dulu.",
            reply_markup=_finance_keyboard(),
        )
        return

    source_id = args[0].strip().strip("`")
    if not source_id:
        await update.message.reply_text("❌ source_id tidak valid.")
        return

    await context.bot.send_chat_action(chat_id=update.effective_chat.id, action="typing")

    try:
        # Ambil detail transaksi dulu
        sani = source_id.replace("'", "''")
        q = f"source_id=eq.{sani}&select=source_id,tx_type,amount,category,description,merchant,tx_date,payment_method"
        rows = await finance._fetch("financial_transactions", q)

        if not rows:
            await update.message.reply_text(
                f"❌ Transaksi `{source_id[:32]}...` tidak ditemukan.\n"
                "Cek /daftar untuk source_id yang valid.",
                reply_markup=_finance_keyboard(),
            )
            return

        tx = rows[0]
        amt = float(tx.get("amount") or 0)
        tx_t = tx.get("tx_type", "?")
        icon = "💰" if tx_t == "income" else "💸"
        type_label = "Pemasukan" if tx_t == "income" else "Pengeluaran"
        cat = tx.get("category", "lainnya")
        merchant = (tx.get("merchant") or "").strip()
        desc = (tx.get("description") or "").strip()
        ts = tx.get("tx_date")
        date_str = ""
        if ts:
            dt = datetime.fromtimestamp(ts / 1000, tz=WIB)
            date_str = dt.strftime("%d/%m/%Y %H:%M")

        lines = [
            f"⚠️ *Konfirmasi Hapus Transaksi*",
            "",
            f"{icon} {type_label}",
            f"💰 {format_amount(int(amt))}",
            f"📅 {date_str}",
            f"🏷️ {cat}",
        ]
        if merchant:
            lines.append(f"🏪 {merchant}")
        if desc:
            lines.append(f"📝 {desc[:60]}")
        lines.append(f"🆔 `{source_id}`")
        lines.append("")
        lines.append("Data terkait yang akan dihapus:")
        lines.append("- financial_transactions")
        lines.append("- accounting_entries")
        lines.append("- transaction_analytics")
        lines.append("")
        lines.append("Ketik: **/hapus_konfirmasi** untuk melanjutkan.")
        lines.append("Atau abaikan untuk membatalkan.")

        # Simpan source_id di user_data buat konfirmasi
        context.user_data["delete_source_id"] = source_id

        await update.message.reply_text(
            "\n".join(lines),
            reply_markup=_finance_keyboard(),
        )
    except Exception as e:
        logger.exception("cmd_hapus_struk failed")
        await update.message.reply_text(f"❌ Gagal: {e}", reply_markup=_finance_keyboard())


async def cmd_hapus_konfirmasi(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handler /hapus_konfirmasi — eksekusi hapus setelah konfirmasi."""
    if not _can_respond(update):
        return

    source_id = context.user_data.pop("delete_source_id", None)
    if not source_id:
        await update.message.reply_text(
            "❌ Tidak ada transaksi yang dikonfirmasi untuk dihapus.\n"
            "Gunakan /hapus_struk <source_id> dulu.",
            reply_markup=_finance_keyboard(),
        )
        return

    await context.bot.send_chat_action(chat_id=update.effective_chat.id, action="typing")

    try:
        result = await finance.delete_transaction(source_id)
        if result.get("success"):
            d = result["deleted"]
            parts = [f"✅ *Transaksi berhasil dihapus*"]
            parts.append(f"🆔 `{source_id[:32]}...`")
            if d["transaction"]:
                parts.append(f"📋 Transaksi: {d['transaction']}")
            if d["accounting"]:
                parts.append(f"📊 Accounting: {d['accounting']}")
            if d["analytics"]:
                parts.append(f"📈 Analytics: {d['analytics']}")
            if result.get("errors"):
                parts.append(f"⚠️ Partial errors: {', '.join(result['errors'])}")
            await update.message.reply_text(
                "\n".join(parts),
                reply_markup=_finance_keyboard(),
            )
        else:
            err = "; ".join(result.get("errors", ["unknown"]))
            await update.message.reply_text(
                f"❌ Gagal hapus: {err}\n"
                f"Source ID: `{source_id[:32]}...`",
                reply_markup=_finance_keyboard(),
            )
    except Exception as e:
        logger.exception("cmd_hapus_konfirmasi failed")
        await update.message.reply_text(f"❌ Error: {e}", reply_markup=_finance_keyboard())


# ── Bulk Callback Handlers ──────────────────────────────────────────

async def _handle_bulk_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle bulk action: income/expense/select/cancel."""
    query = update.callback_query
    await query.answer()
    data = query.data

    # Parse: bulk_{action}_{bulk_id}
    parts = data.split("_", 2)
    if len(parts) < 3:
        return
    action = parts[1]  # income | expense | select | cancel
    bulk_id = parts[2]

    receipts = _bulk_pending.pop(bulk_id, None)
    if not receipts:
        try:
            await query.edit_message_text("❌ Sesi kadaluarsa. Silakan kirim ulang foto.", reply_markup=_finance_keyboard())
        except Exception:
            pass
        return

    if action == "cancel":
        await query.edit_message_text("❌ Dibatalkan.", reply_markup=_finance_keyboard())
        return

    if action in ("income", "expense"):
        tx_type = action
        saved = 0
        failed = 0
        total_all = 0

        # ── Auto-create categories for unknown items ────────────
        await _auto_create_missing_categories(receipts)

        for ri in receipts:
            # Kategorisasi
            category_text = ri["merchant"] + " " + " ".join(it.get("name", "") for it in ri.get("items", []))
            category, _ = auto_categorize(category_text)

            # Build description
            items = ri.get("items", [])
            if items:
                item_names = ", ".join(f"{it.get('name', '?')} ×{it.get('qty', 1)}" for it in items[:5])
                if len(items) > 5:
                    item_names += f" + {len(items) - 5} item lain"
                desc = f"Bulk {'Pemasukan' if tx_type == 'income' else 'Belanja'} - {ri['merchant']}: {item_names}"
            else:
                desc = f"Bulk {'Pemasukan' if tx_type == 'income' else 'Belanja'} - {ri['merchant']}"

            tx_result = await finance.record_transaction(
                tx_type=tx_type,
                amount=ri["total"] or 1,
                description=desc[:500],
                category=category,
                merchant=ri["merchant"],
                payment_method=ri.get("payment_method", "cash"),
                receipt_date_str=ri.get("date", ""),
                metadata={
                    "source": "yumi_finance_agent",
                    "ocr": True,
                    "bulk": True,
                    "bulk_id": bulk_id,
                    "receipt_number": ri.get("receipt_number", ""),
                    "receipt_date": ri.get("date", ""),
                    "item_count": len(ri.get("items", [])),
                    "scanItems": [
                        {
                            "name": it.get("name", ""),
                            "rawName": it.get("raw_name", ""),
                            "aliasResolvedFrom": it.get("alias_resolved_from", ""),
                            "quantity": it.get("qty", 1),
                            "unit": it.get("unit", ""),
                            "price": it.get("price", 0),
                            "total": (it.get("subtotal", 0) or ((it.get("qty", 1) or 1) * (it.get("price", 0) or 0))),
                            "netWeightValue": it.get("net_weight_value"),
                            "netWeightUnit": it.get("net_weight_unit", ""),
                            "packType": it.get("pack_type", ""),
                        }
                        for it in ri.get("items", [])
                    ],
                    "receiptDetails": {
                        "receiptNumber": ri.get("receipt_number", ""),
                        "merchantName": ri.get("merchant", ""),
                        "date": ri.get("date", ""),
                        "tax": ri.get("tax", 0),
                        "discount": ri.get("discount", 0),
                        "serviceCharge": ri.get("service_charge", 0),
                    },
                },
            )

            if tx_result.get("success"):
                saved += 1
                total_all += ri["total"]

                # ── Record to AI memory ──────────────────────────
                for item in ri.get("items", []):
                    await memory.record_item_category(
                        item.get("name", ""),
                        item.get("_category", "operasional"),
                        source="ai", confidence_boost=0.1,
                        merchant=ri.get("merchant", ""),
                    )
                await memory.record_prices(
                    ri.get("items", []), ri.get("merchant", ""),
                    ri.get("date", ""), ri.get("receipt_number", ""),
                )
                # Update merchant profile
                item_cats = {}
                for it in ri.get("items", []):
                    cat = it.get("_category", "lainnya")
                    item_cats[cat] = item_cats.get(cat, 0) + 1
                item_names = [it.get("name", "") for it in ri.get("items", [])]
                await memory.update_merchant_profile(
                    ri.get("merchant", "Tanpa Nama"),
                    item_cats, item_names, ri.get("total", 0),
                )
            else:
                failed += 1

            # Restok inventory untuk expense
            if tx_type == "expense" and tx_result.get("success"):
                await _restok_bulk_items(ri)

            # ── Accounting dual-write untuk expense ────────────
            if tx_type == "expense" and tx_result.get("success"):
                source_id = tx_result.get("sourceId", "")
                items_list = ri.get("items", [])
                if source_id and items_list:
                    asyncio.ensure_future(_write_accounting_entries(
                        source_id=source_id,
                        items=items_list,
                        category=ri.get("category", "operasional"),
                        payment_method=ri.get("payment_method", "cash"),
                        total_amount=ri.get("total", 0),
                    ))

        icon = "💰" if tx_type == "income" else "💸"
        type_label = "Pemasukan" if tx_type == "income" else "Pengeluaran"
        lines = [
            f"{icon} Bulk {type_label} Tercatat!",
            "",
            f"✅ {saved}/{len(receipts)} struk berhasil disimpan",
            f"💸 Total: {format_amount(int(total_all))}",
        ]
        if failed:
            lines.append(f"⚠️ {failed} struk gagal disimpan")

        # ── Price anomaly detection ────────────────────────────
        anomaly_alerts = []
        for ri in receipts:
            for item in ri.get("items", []):
                name = (item.get("name") or "").strip()
                price = float(item.get("price") or 0)
                if name and price > 0:
                    warning = await memory.detect_price_anomaly(name, price)
                    if warning and warning not in anomaly_alerts:
                        anomaly_alerts.append(warning)
        if anomaly_alerts:
            lines.append("")
            lines.append("🔍 Peringatan Harga:")
            for a in anomaly_alerts[:5]:
                lines.append(f"  {a}")

        # Simpan lagi ke pending untuk fallback (dibutuhkan untuk re-process)
        _bulk_pending[bulk_id] = receipts

        await query.edit_message_text("\n".join(lines), reply_markup=_finance_keyboard())
        return

    if action == "select":
        # Pilih per struk — navigasi
        await _display_bulk_select(query, bulk_id, receipts)
        return


async def _restok_bulk_items(receipt: dict):
    """Auto-restok inventory dari satu struk bulk expense."""
    items = receipt.get("items", [])
    if not items:
        return

    try:
        inventory_list = await inventory.get_all_inventory()
        for item in items:
            item_name = item.get("name", "").strip()
            if not item_name:
                continue
            item_price = float(item.get("price", 0) or 0)
            matched = _find_inventory_match(item_name, inventory_list, item_price=item_price)
            if matched and matched.get("score", 0) >= 60:
                inv_id = matched.get("_id")
                await inventory.restock_item(
                    inv_id,
                    float(matched.get("quantity", 0)),
                    item.get("qty", 0),
                    item.get("unit", "pcs"),
                    price=item_price,
                )
    except Exception as e:
        logger.warning(f"Bulk restok partial error: {e}")


async def _display_bulk_select(query, bulk_id: str, receipts: list[dict]):
    """Tampilkan navigasi per struk."""
    _bulk_select_state[bulk_id] = {
        "receipts": receipts,
        "current_idx": 0,
        "processed": {},
    }
    await _show_bulk_receipt(query, bulk_id, 0)


async def _show_bulk_receipt(query, bulk_id: str, idx: int):
    """Tampilkan satu struk dari bulk dengan keyboard navigasi."""
    state = _bulk_select_state.get(bulk_id)
    if not state:
        try:
            await query.edit_message_text("❌ Sesi kadaluarsa.", reply_markup=_finance_keyboard())
        except Exception:
            pass
        return

    receipts = state["receipts"]
    n = len(receipts)
    ri = receipts[idx]

    lines = [f"📸 Struk {idx+1}/{n}", ""]
    lines.append(f"🏪 {ri['merchant']}")
    if ri.get("date") and ri["date"] != "?":
        dt_str = ri["date"]
        if ri.get("time"):
            dt_str += f" {ri['time']}"
        lines.append(f"📅 {dt_str}")
    if ri.get("receipt_number"):
        lines.append(f"🧾 No: {ri['receipt_number']}")
    if ri.get("payment_method"):
        lines.append(f"💳 {ri['payment_method']}")
    lines.append("")

    # Items
    ri_items = ri.get("items", [])
    if ri_items:
        lines.append("Daftar Item:")
        for j, item in enumerate(ri_items[:10]):
            name = item.get("name", "?")
            qty = item.get("qty", 1)
            price = item.get("price", 0)
            subtotal = item.get("subtotal", price * qty)
            unit = item.get("unit", "")
            unit_str = f" {unit}" if unit else ""
            lines.append(f"  {j+1}. {name} — {qty}{unit_str} x {format_amount(int(price))} = {format_amount(int(subtotal))}")
        if len(ri_items) > 10:
            lines.append(f"  ... +{len(ri_items) - 10} item lain")
    lines.append("")

    if ri.get("discount"):
        lines.append(f"  Diskon: -{format_amount(int(ri['discount']))}")
    if ri.get("tax"):
        lines.append(f"  Pajak: {format_amount(int(ri['tax']))}")
    lines.append(f"  TOTAL: {format_amount(int(ri['total']))}")
    lines.append("")

    # Status processed
    processed = state.get("processed", {})
    if idx in processed:
        action = processed[idx]
        icon = "💰" if action == "income" else "💸" if action == "expense" else "⏭️"
        lines.append(f"Status: {icon} {action}")

    # Keyboard
    buttons = []
    if idx not in processed:
        buttons.append([
            InlineKeyboardButton("💰 Pemasukan", callback_data=f"bulkitem_income_{bulk_id}_{idx}"),
            InlineKeyboardButton("💸 Pengeluaran", callback_data=f"bulkitem_expense_{bulk_id}_{idx}"),
        ])
        buttons.append([
            InlineKeyboardButton("⏭️ Lewati", callback_data=f"bulkitem_skip_{bulk_id}_{idx}"),
        ])
    else:
        buttons.append([
            InlineKeyboardButton("✏️ Ubah", callback_data=f"bulkitem_redo_{bulk_id}_{idx}"),
        ])

    # Nav
    nav = []
    if idx > 0:
        nav.append(InlineKeyboardButton("◀️ Sebelumnya", callback_data=f"bulkitem_prev_{bulk_id}_{idx}"))
    if idx < n - 1:
        nav.append(InlineKeyboardButton("Selanjutnya ▶️", callback_data=f"bulkitem_next_{bulk_id}_{idx}"))
    if nav:
        buttons.append(nav)

    # Done button
    total_processed = len(state.get("processed", {}))
    buttons.append([
        InlineKeyboardButton(
            f"💾 Selesai ({total_processed}/{n})",
            callback_data=f"bulkitem_done_{bulk_id}"
        ),
    ])

    await query.edit_message_text(
        "\n".join(lines),
        reply_markup=InlineKeyboardMarkup(buttons),
    )


async def _handle_bulkitem_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle bulkitem_* callbacks: income/expense/skip/prev/next/done/redo."""
    query = update.callback_query
    await query.answer()
    data = query.data

    parts = data.split("_")
    if len(parts) < 3:
        return
    action = parts[1]  # income | expense | skip | prev | next | done | redo
    bulk_id = parts[2]

    state = _bulk_select_state.get(bulk_id)
    if not state:
        try:
            await query.edit_message_text("❌ Sesi kadaluarsa.", reply_markup=_finance_keyboard())
        except Exception:
            pass
        return

    receipts = state["receipts"]
    n = len(receipts)

    if action == "done":
        return await _finalize_bulk_items(query, bulk_id)

    idx = int(parts[3]) if len(parts) > 3 else 0

    if action in ("income", "expense"):
        # Record single struk
        ri = receipts[idx]
        category_text = ri["merchant"] + " " + " ".join(it.get("name", "") for it in ri.get("items", []))
        category, _ = auto_categorize(category_text)

        items = ri.get("items", [])
        if items:
            item_names = ", ".join(f"{it.get('name', '?')} ×{it.get('qty', 1)}" for it in items[:5])
            if len(items) > 5:
                item_names += f" + {len(items) - 5} item lain"
            desc = f"Bulk {'Pemasukan' if action == 'income' else 'Belanja'} - {ri['merchant']}: {item_names}"
        else:
            desc = f"Bulk {'Pemasukan' if action == 'income' else 'Belanja'} - {ri['merchant']}"

        tx_result = await finance.record_transaction(
            tx_type=action,
            amount=ri["total"] or 1,
            description=desc[:500],
            category=category,
            merchant=ri["merchant"],
            payment_method=ri.get("payment_method", "cash"),
            receipt_date_str=ri.get("date", ""),
            metadata={
                "source": "yumi_finance_agent",
                "ocr": True,
                "bulk": True,
                "bulk_id": bulk_id,
                "receipt_number": ri.get("receipt_number", ""),
                "receipt_date": ri.get("date", ""),
                "receipt_image_url": ri.get("receipt_image_url", ""),
                "item_count": len(ri.get("items", [])),
                "scanItems": [
                    {
                        "name": it.get("name", ""),
                        "rawName": it.get("raw_name", ""),
                        "aliasResolvedFrom": it.get("alias_resolved_from", ""),
                        "quantity": it.get("qty", 1),
                        "unit": it.get("unit", ""),
                        "price": it.get("price", 0),
                        "total": (it.get("subtotal", 0) or ((it.get("qty", 1) or 1) * (it.get("price", 0) or 0))),
                        "netWeightValue": it.get("net_weight_value"),
                        "netWeightUnit": it.get("net_weight_unit", ""),
                        "packType": it.get("pack_type", ""),
                    }
                    for it in ri.get("items", [])
                ],
                "receiptDetails": {
                    "receiptNumber": ri.get("receipt_number", ""),
                    "merchantName": ri.get("merchant", ""),
                    "date": ri.get("date", ""),
                    "tax": ri.get("tax", 0),
                    "discount": ri.get("discount", 0),
                    "serviceCharge": ri.get("service_charge", 0),
                },
            },
        )

        state["processed"][idx] = action
        if tx_result.get("success") and action == "expense":
            await _restok_bulk_items(ri)

        # ── Accounting dual-write untuk expense ────────────
        if tx_result.get("success") and action == "expense":
            source_id = tx_result.get("sourceId", "")
            items_list = ri.get("items", [])
            if source_id and items_list:
                asyncio.ensure_future(_write_accounting_entries(
                    source_id=source_id,
                    items=items_list,
                    category=ri.get("category", "operasional"),
                    payment_method=ri.get("payment_method", "cash"),
                    total_amount=ri.get("total", 0),
                ))

        # Auto-advance ke next
        next_idx = idx + 1
        if next_idx < n:
            return await _show_bulk_receipt(query, bulk_id, next_idx)
        else:
            return await _finalize_bulk_items(query, bulk_id)

    elif action == "skip":
        state["processed"][idx] = "skip"
        next_idx = idx + 1
        if next_idx < n:
            return await _show_bulk_receipt(query, bulk_id, next_idx)
        else:
            return await _finalize_bulk_items(query, bulk_id)

    elif action == "redo":
        # Hapus dari processed
        state["processed"].pop(idx, None)
        return await _show_bulk_receipt(query, bulk_id, idx)

    elif action in ("prev", "next"):
        target_idx = idx - 1 if action == "prev" else idx + 1
        if 0 <= target_idx < n:
            return await _show_bulk_receipt(query, bulk_id, target_idx)

    # Fallback
    await query.edit_message_text("❌ Aksi tidak dikenal.", reply_markup=_finance_keyboard())


async def _finalize_bulk_items(query, bulk_id: str):
    """Finalisasi bulk selection — tampilkan summary akhir."""
    state = _bulk_select_state.pop(bulk_id, None)
    if not state:
        try:
            await query.edit_message_text("❌ Sesi kadaluarsa.", reply_markup=_finance_keyboard())
        except Exception:
            pass
        return

    receipts = state["receipts"]
    processed = state["processed"]

    income_count = sum(1 for v in processed.values() if v == "income")
    expense_count = sum(1 for v in processed.values() if v == "expense")
    skip_count = sum(1 for v in processed.values() if v == "skip")

    income_total = sum(ri["total"] for i, ri in enumerate(receipts) if processed.get(i) == "income")
    expense_total = sum(ri["total"] for i, ri in enumerate(receipts) if processed.get(i) == "expense")

    lines = ["📊 Bulk Processing Selesai!", ""]
    if income_count:
        lines.append(f"💰 Pemasukan: {income_count} struk — {format_amount(int(income_total))}")
    if expense_count:
        lines.append(f"💸 Pengeluaran: {expense_count} struk — {format_amount(int(expense_total))}")
    if skip_count:
        lines.append(f"⏭️ Dilewati: {skip_count} struk")
    lines.append("")
    total_saved = income_count + expense_count
    lines.append(f"✅ {total_saved} transaksi tersimpan di database!")

    await query.edit_message_text(
        "\n".join(lines),
        reply_markup=_finance_keyboard(),
    )


# ── Main ──────────────────────────────────────────────────────────

# ── Auto Category Creation ──────────────────────────────────────────

async def _auto_create_missing_categories(receipts: list[dict]):
    """Auto-detect unknown items, gunakan AI untuk menyarankan kategori, buat di Supabase."""
    # Collect semua item dengan confidence rendah
    unknown = []
    for ri in receipts:
        for item in ri.get("items", []):
            cat_conf = item.get("_cat_confidence", "")
            if cat_conf == "low":
                name = item.get("name", "").strip()
                if name and name not in [u["name"] for u in unknown]:
                    unknown.append({"name": name, "suggested": item.get("_cat_suggested", name.title())})

    if not unknown:
        return

    logger.info(f"Auto-categorizing {len(unknown)} unknown items via AI...")

    # Gunakan SumoPod AI untuk menyarankan grouping
    try:
        sp_client = SumoPodClient(SUMOPOD_API_KEY)
        item_names = [u["name"] for u in unknown]
        prompt = (
            "Kamu adalah AI untuk kategorisasi keuangan sebuah café/resto bernama 'Djiwa Tentram Cafe & Resto'. "
            "Berikut daftar item belanjaan yang belum memiliki kategori. "
            "Kelompokkan item-item ini ke dalam maksimal 5 kategori yang relevan untuk operasional café. "
            "Contoh kategori café: Bahan Minuman (kopi, susu, sirup), Bahan Makanan (tepung, minyak, bumbu), "
            "Sayur & Bahan Segar, Packaging (cup, sedotan, plastik), Cleaning (sabun, pembersih), "
            "Gas & Energi, Peralatan & Mesin, dll.\n\n"
            "Untuk setiap kategori, berikan: key (snake_case english), label (Bahasa Indonesia), "
            "icon emoji yang cocok, daftar item yang masuk kategori ini, "
            "dan keyword tambahan (minimal 5 kata) untuk matching item serupa di masa depan.\n\n"
            "Item:\n" + "\n".join(f"- {n}" for n in item_names) + "\n\n"
            "Balas dengan JSON:\n"
            '{"categories": [{"key": "bahan_minuman", "label": "Bahan Minuman", "icon": "☕", '
            '"items": ["Kopi Arabica", "Susu UHT"], "keywords": ["kopi", "susu", "sirup", "teh", "creamer"]}]}'
        )
        ai_result = await sp_client.chat(message=prompt, model=os.getenv("NINEROUTER_TEXT_MODEL", "ag/gemini-3-flash"), timeout=30)
        ai_reply = ai_result.get("reply", "")

        # Parse AI response
        import json as _json
        json_match = re.search(r'\{[\s\S]*\}', str(ai_reply))
        if json_match:
            cat_data = _json.loads(json_match.group())
            for cat in cat_data.get("categories", []):
                cat_key = cat.get("key", "").lower().replace(" ", "_")
                cat_label = cat.get("label", cat_key.title())
                cat_icon = cat.get("icon", "📌")
                cat_keywords = cat.get("keywords", [cat_label.lower()])

                # Simpan ke Supabase
                await inventory.create_category(name=cat_label)
                # Tambah ke cache in-memory
                add_dynamic_category(cat_key, cat_label, cat_icon, "expense")
                logger.info(f"Created dynamic category: {cat_label} ({cat_key})")

                # Update item category assignment
                cat_item_names = [i.lower() for i in cat.get("items", [])]
                for ri in receipts:
                    for item in ri.get("items", []):
                        item_name = item.get("name", "").strip().lower()
                        if item_name in cat_item_names:
                            item["_category"] = cat_key
                            item["_cat_confidence"] = "high"
    except Exception as e:
        logger.warning(f"Auto-category creation failed: {e}")


# ── Authenticated receipt AI rescan endpoint ────────────────────────
async def _verify_http_user(request) -> dict | None:
    """Verify a Supabase access token without exposing service credentials."""
    authorization = request.headers.get("Authorization", "")
    if not authorization.startswith("Bearer "):
        return None
    token = authorization[7:].strip()
    if not token:
        return None
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(
                f"{SUPABASE_URL}/auth/v1/user",
                headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {token}"},
            )
            if response.status_code >= 400:
                return None
            return response.json()
    except Exception:
        return None


async def _post_pos_table(table: str, payload: dict) -> None:
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY or SUPABASE_KEY}",
        "Accept-Profile": "pos",
        "Content-Profile": "pos",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.post(
            f"{SUPABASE_URL}/rest/v1/{table}?on_conflict=source_id",
            headers=headers,
            json=payload,
        )
        response.raise_for_status()


async def _handle_reprocess_receipt(request):
    """Authenticated, one-receipt, token-bounded 9Router rescan."""
    from aiohttp import web
    user = await _verify_http_user(request)
    if not user:
        return web.json_response({"ok": False, "error": "unauthorized"}, status=401)
    try:
        body = json.loads(await request.read())
        transaction_id = str(body.get("transaction_id") or "").strip()
        if not transaction_id:
            return web.json_response({"ok": False, "error": "transaction_id required"}, status=400)
        safe_id = transaction_id.replace("'", "''")
        rows = await finance._fetch("financial_transactions", f"select=source_id,tx_date,metadata&source_id=eq.{safe_id}")
        if not rows:
            return web.json_response({"ok": False, "error": "transaction not found"}, status=404)
        row = rows[0]
        metadata = row.get("metadata") or {}
        if isinstance(metadata, str):
            metadata = json.loads(metadata)
        image_url = metadata.get("receipt_image_url") if isinstance(metadata, dict) else None
        if not image_url:
            return web.json_response({"ok": False, "error": "receipt image not found"}, status=400)
        fields = missing_fields(metadata)
        receipt_id = stable_id("receipt", transaction_id)
        model = os.getenv("NINEROUTER_VISION_MODEL") or os.getenv("NINEROUTER_TEXT_MODEL", "ag/gemini-3-flash")
        fingerprint = __import__("hashlib").sha256((receipt_id + model + "receipt-header-items-v1" + ",".join(fields) + image_url).encode()).hexdigest()
        run_id = stable_id("ai_run", receipt_id, fingerprint)
        cached = await inventory._fetch("expense_receipt_ai_runs", f"select=_id,status,result,errorMessage&_id=eq.{run_id}")
        if cached and cached[0].get("status") == "completed":
            return web.json_response({"ok": True, "cached": True, "result": cached[0].get("result") or {}})
        image_bytes = await _download_from_storage(image_url)
        if not image_bytes:
            return web.json_response({"ok": False, "error": "failed to download receipt"}, status=502)
        _, compressed_uri = _compress_image(image_bytes)
        client = SumoPodClient(SUMOPOD_API_KEY, base_url=AI_BASE_URL)
        result = await client.vision_json(
            image_base64_uri=compressed_uri,
            model=model,
            prompt_override=compact_prompt(fields),
            max_tokens=2048,
            timeout=90,
        )
        success = bool(result.get("success"))
        result_data = result.get("data", result)
        await _post_pos_table("expense_receipt_ai_runs", {
            "source_id": run_id,
            "receipt_source_id": receipt_id,
            "input_fingerprint": fingerprint,
            "requested_fields": fields,
            "provider": "9router",
            "model": model,
            "prompt_version": "receipt-header-items-v1",
            "status": "completed" if success else "failed",
            "result": result_data if isinstance(result_data, dict) else {"raw": result_data},
            "error_message": None if success else str(result.get("error", "unknown")),
        })
        if not success:
            return web.json_response({"ok": False, "error": result.get("error", "AI rescan failed")}, status=502)
        return web.json_response({"ok": True, "cached": False, "requested_fields": fields, "result": result_data})
    except Exception as exc:
        logger.exception("receipt AI rescan failed")
        return web.json_response({"ok": False, "error": str(exc)}, status=500)


# ── Authenticated receipt AI rescan endpoint ────────────────────────
async def _verify_http_user(request) -> dict | None:
    """Verify a Supabase access token without exposing service credentials."""
    authorization = request.headers.get("Authorization", "")
    if not authorization.startswith("Bearer "):
        return None
    token = authorization[7:].strip()
    if not token:
        return None
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(
                f"{SUPABASE_URL}/auth/v1/user",
                headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {token}"},
            )
            if response.status_code >= 400:
                return None
            return response.json()
    except Exception:
        return None


async def _post_pos_table(table: str, payload: dict) -> None:
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY or SUPABASE_KEY}",
        "Accept-Profile": "pos",
        "Content-Profile": "pos",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.post(
            f"{SUPABASE_URL}/rest/v1/{table}?on_conflict=source_id",
            headers=headers,
            json=payload,
        )
        response.raise_for_status()


async def _handle_reprocess_receipt(request):
    """Authenticated, one-receipt, token-bounded 9Router rescan."""
    from aiohttp import web
    user = await _verify_http_user(request)
    if not user:
        return web.json_response({"ok": False, "error": "unauthorized"}, status=401)
    try:
        body = json.loads(await request.read())
        transaction_id = str(body.get("transaction_id") or "").strip()
        if not transaction_id:
            return web.json_response({"ok": False, "error": "transaction_id required"}, status=400)
        safe_id = transaction_id.replace("'", "''")
        rows = await finance._fetch("financial_transactions", f"select=source_id,tx_date,metadata&source_id=eq.{safe_id}")
        if not rows:
            return web.json_response({"ok": False, "error": "transaction not found"}, status=404)
        row = rows[0]
        metadata = row.get("metadata") or {}
        if isinstance(metadata, str):
            metadata = json.loads(metadata)
        image_url = metadata.get("receipt_image_url") if isinstance(metadata, dict) else None
        if not image_url:
            return web.json_response({"ok": False, "error": "receipt image not found"}, status=400)
        fields = missing_fields(metadata)
        receipt_id = stable_id("receipt", transaction_id)
        model = os.getenv("NINEROUTER_VISION_MODEL") or os.getenv("NINEROUTER_TEXT_MODEL", "ag/gemini-3-flash")
        fingerprint = __import__("hashlib").sha256((receipt_id + model + "receipt-header-items-v1" + ",".join(fields) + image_url).encode()).hexdigest()
        run_id = stable_id("ai_run", receipt_id, fingerprint)
        cached = await inventory._fetch("pos_expense_receipt_ai_runs", f"select=_id,status,result,errorMessage&_id=eq.{run_id}")
        if cached and cached[0].get("status") == "completed":
            return web.json_response({"ok": True, "cached": True, "result": cached[0].get("result") or {}})
        image_bytes = await _download_from_storage(image_url)
        if not image_bytes:
            return web.json_response({"ok": False, "error": "failed to download receipt"}, status=502)
        _, compressed_uri = _compress_image(image_bytes)
        client = SumoPodClient(SUMOPOD_API_KEY, base_url=AI_BASE_URL)
        result = await client.vision_json(
            image_base64_uri=compressed_uri,
            model=model,
            prompt_override=compact_prompt(fields),
            max_tokens=2048,
            timeout=90,
        )
        success = bool(result.get("success"))
        result_data = result.get("data", result)
        await _post_pos_table("expense_receipt_ai_runs", {
            "source_id": run_id,
            "receipt_source_id": receipt_id,
            "input_fingerprint": fingerprint,
            "requested_fields": fields,
            "provider": "9router",
            "model": model,
            "prompt_version": "receipt-header-items-v1",
            "status": "completed" if success else "failed",
            "result": result_data if isinstance(result_data, dict) else {"raw": result_data},
            "error_message": None if success else str(result.get("error", "unknown")),
        })
        if not success:
            return web.json_response({"ok": False, "error": result.get("error", "AI rescan failed")}, status=502)
        return web.json_response({"ok": True, "cached": False, "requested_fields": fields, "result": result_data})
    except Exception as exc:
        logger.exception("receipt AI rescan failed")
        return web.json_response({"ok": False, "error": str(exc)}, status=500)


# ── HTTP Endpoints ──────────────────────────────────────────────────

ANALYZER_PORT = int(os.getenv("ANALYZER_PORT", "8002"))

async def _handle_analyze_transaction(request):
    """POST /analyze-transaction  { "source_id": "...", ... }"""
    from aiohttp import web
    try:
        body = json.loads(await request.read())
        source_id = body.get("source_id")
        if not source_id:
            return web.json_response({"ok": False, "error": "source_id required"}, status=400)

        # Fetch transaction from DB
        rows = analyzer._mgmt_sql(f"""
            SELECT source_id, tx_type, amount, category, description,
                   payment_method, tx_date, metadata
            FROM pos.financial_transactions
            WHERE source_id = '{source_id.replace(chr(39), chr(39)*2)}'
            LIMIT 1
        """)
        if not rows:
            return web.json_response({"ok": False, "error": "Transaction not found"}, status=404)

        tx = rows[0]
        result = await analyzer.analyze_transaction(tx)
        return web.json_response({"ok": True, "result": result})
    except Exception as e:
        logger.exception("analyze_transaction error")
        return web.json_response({"ok": False, "error": str(e)}, status=500)


async def _handle_batch_analyze(request):
    """POST /batch-analyze — analyze all unanalyzed transactions from today"""
    from aiohttp import web
    try:
        start_of_day = datetime.now(WIB).replace(hour=0, minute=0, second=0, microsecond=0).timestamp() * 1000

        # Find unanalyzed transactions
        rows = analyzer._mgmt_sql(f"""
            SELECT ft.source_id, ft.tx_type, ft.amount, ft.category,
                   ft.description, ft.payment_method, ft.tx_date, ft.metadata
            FROM pos.financial_transactions ft
            LEFT JOIN pos.transaction_analytics ta ON ft.source_id = ta.source_id
            WHERE ta.source_id IS NULL
            LIMIT 50
        """)

        results = []
        for tx in rows:
            try:
                result = await analyzer.analyze_transaction(tx)
                results.append(result)
            except Exception as e:
                logger.error(f"Failed to analyze {tx.get('source_id')}: {e}")
                results.append({"source_id": tx.get("source_id"), "error": str(e)})

        return web.json_response({"ok": True, "analyzed": len(results), "results": results})
    except Exception as e:
        logger.exception("batch_analyze error")
        return web.json_response({"ok": False, "error": str(e)}, status=500)


async def _handle_health(request):
    """GET /health"""
    from aiohttp import web
    return web.json_response({"ok": True, "service": "yumi-finance-analyzer"})


async def _handle_ai_parse(request):
    """POST /ai-parse-text  { "text": "pengeluaran 25000 beli gula" }
    Returns: { action, amount, category, merchant, payment_method, description, items, confidence }
    """
    from aiohttp import web
    try:
        body = json.loads(await request.read())
        text = body.get("text", "").strip()
        if not text:
            return web.json_response({"ok": False, "error": "text required"}, status=400)

        result = await orchestrator.orchestrate(text)
        return web.json_response({
            "ok": True,
            "action": result.action,
            "amount": result.amount,
            "category": result.category,
            "merchant": result.merchant,
            "payment_method": result.payment_method,
            "description": result.description,
            "items": result.items,
            "confidence": result.confidence,
            "reply": result.text,
        })
    except Exception as e:
        logger.exception("AI parse failed")
        return web.json_response({"ok": False, "error": str(e)}, status=500)


# ── POS Order Sync (Revenue) ─────────────────────────────────

_ORDER_SYNC_CURSOR = "/tmp/yumi_finance_order_sync_cursor.txt"
_ORDER_SYNC_INTERVAL = 900  # 15 menit


def _load_order_cursor() -> tuple[int, set[str]]:
    """Load last check timestamp and synced order numbers."""
    try:
        with open(_ORDER_SYNC_CURSOR) as f:
            lines = [l.strip() for l in f if l.strip()]
        if lines:
            ts = int(lines[0])
            nos = set(lines[1:])
            return ts, nos
    except (FileNotFoundError, ValueError, IndexError):
        pass
    # First run: start from 24h ago
    ts = int((datetime.now(WIB) - timedelta(hours=24)).timestamp() * 1000)
    return ts, set()


def _save_order_cursor(ts: int, nos: set[str]):
    """Persist cursor and synced order numbers."""
    with open(_ORDER_SYNC_CURSOR, "w") as f:
        f.write(f"{ts}\n")
        for no in sorted(nos):
            f.write(f"{no}\n")


async def _find_shift_at_time(timestamp_ms: int) -> dict:
    """Find active shift at a given timestamp. Returns {cashier_name, team_members} or empty."""
    try:
        shifts_url = f"{SUPABASE_URL}/rest/v1/pos_shift_reports"
        shifts_query = (
            "select=cashier_name,team_members,shift_name,start_time,end_time"
            f"&start_time=lte.{timestamp_ms}"
            "&order=start_time.desc&limit=3"
        )
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"{shifts_url}?{shifts_query}",
                headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"},
            )
            resp.raise_for_status()
            shifts = resp.json()
        for s in shifts:
            s_start = int(s.get("start_time") or 0)
            s_end = s.get("end_time")
            if s_end is not None and timestamp_ms > int(s_end):
                continue
            return {
                "cashier_name": s.get("cashier_name") or "",
                "team_members": s.get("team_members") or "",
                "shift_name": s.get("shift_name") or "",
            }
    except Exception as e:
        logger.warning("find_shift_at_time failed: %s", e)
    return {}


async def _sync_pos_orders() -> int:
    """Sync completed/paid POS orders as income transactions.
    
    Polls public.pos_orders for new completed/paid orders since last check,
    records each as 'penjualan' income via finance.record_transaction().
    Uses file-based cursor for dedup across restarts.
    
    Returns: number of new transactions created.
    """
    global _last_order_check_ms, _synced_order_nos
    
    now_ms = int((datetime.now(WIB)).timestamp() * 1000)
    lookback_ms = now_ms - 1800_000  # 30 menit lookback
    
    query_start = min(_last_order_check_ms, max(0, lookback_ms))
    
    # Query public view — no Accept-Profile needed, uses camelCase columns
    orders_url = f"{SUPABASE_URL}/rest/v1/pos_orders"
    orders_query = (
        "select=_id,orderNumber,totalAmount,paymentMethod,_creationTime,customerName,orderType,daily_receipt_no,receipt_kind"
        "&status=in.(completed,paid)"
        f"&_creationTime=gt.{query_start}"
        f"&_creationTime=lte.{now_ms}"
        "&order=_creationTime.asc&limit=50"
    )
    
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(
                f"{orders_url}?{orders_query}",
                headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"},
            )
            resp.raise_for_status()
            rows = resp.json()
    except Exception as e:
        logger.error("order_sync fetch failed: %s", e)
        return 0
    
    if not rows:
        _last_order_check_ms = now_ms
        _save_order_cursor(_last_order_check_ms, _synced_order_nos)
        return 0
    
    max_ts = _last_order_check_ms
    created = 0
    
    for row in rows:
        order_no = row.get("orderNumber", "")
        ts = int(float(row.get("_creationTime") or 0))
        if ts > max_ts:
            max_ts = ts
        
        if order_no in _synced_order_nos:
            continue
        
        # Skip jika sudah ada transaksi keuangan untuk order ini (dari POS langsung)
        order_id = row.get("_id", "")
        if order_id:
            try:
                dup_url = f"{SUPABASE_URL}/rest/v1/financial_transactions?select=source_id&order_source_id=eq.{order_id}&limit=1"
                async with httpx.AsyncClient(timeout=10) as dup_client:
                    dup_resp = await dup_client.get(
                        dup_url,
                        headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}", "Accept-Profile": "pos"},
                    )
                if dup_resp.is_success and dup_resp.json():
                    logger.info("order_sync: skip %s — financial transaction already exists", order_no)
                    _synced_order_nos.add(order_no)
                    continue
            except Exception:
                pass  # Jika check gagal, lanjutkan saja agar tidak blocking
        
        total = float(row.get("totalAmount") or 0)
        if total <= 0:
            _synced_order_nos.add(order_no)
            continue
        
        payment = row.get("paymentMethod") or "cash"
        customer = row.get("customerName") or "Pelanggan"
        order_type = row.get("orderType") or "dine_in"
        daily_no = row.get("daily_receipt_no")
        receipt_kind = row.get("receipt_kind")
        
        # Cari shift
        shift = await _find_shift_at_time(ts)
        shift_name = shift.get("shift_name", "")
        cashier = shift.get("cashier_name", "")
        
        # Description
        desc = f"Penjualan"
        if shift_name:
            desc += f" - {shift_name}"
        parts = [f"#{order_no}"]
        if customer and customer != "Pelanggan":
            parts.append(customer)
        if daily_no:
            parts.append(f"Struk #{daily_no}")
        desc += " (" + ", ".join(parts) + ")"
        
        # Metadata
        metadata = {
            "source": "order_sync",
            "orderNumber": order_no,
            "shift": shift_name,
            "cashier": cashier,
            "orderType": order_type,
            "receiptKind": receipt_kind,
            "dailyReceiptNo": daily_no,
        }

        # Source fingerprint for dedup (stored in metadata for audit)
        import hashlib
        fp_raw = f"order_sync|{order_no}|{ts // 60000}"
        metadata["fingerprint"] = hashlib.sha256(fp_raw.encode()).hexdigest()
        
        result = await finance.record_transaction(
            tx_type="income",
            amount=total,
            description=desc,
            category="penjualan",
            merchant=customer if customer != "Pelanggan" else "",
            payment_method=payment,
            metadata=metadata,
            order_source_id=row.get("_id", ""),
        )
        
        if result.get("success"):
            created += 1
            logger.info("order_sync: created income %s for order %s (Rp%.0f)", 
                       result.get("sourceId", "?"), order_no, total)
        else:
            logger.warning("order_sync: failed for %s: %s", order_no, result.get("error"))
        
        _synced_order_nos.add(order_no)
        await asyncio.sleep(0.1)  # rate limit
    
    _last_order_check_ms = max_ts
    _save_order_cursor(_last_order_check_ms, _synced_order_nos)
    
    if created > 0:
        logger.info("order_sync: created %d income transactions", created)
    
    return created


async def _start_order_sync(app):
    """Start background order sync loop."""
    global _last_order_check_ms, _synced_order_nos
    _last_order_check_ms, _synced_order_nos = _load_order_cursor()
    logger.info("Order sync cursor loaded: ts=%d, %d orders already synced",
                _last_order_check_ms, len(_synced_order_nos))
    
    # Immediate first sync
    try:
        n = await _sync_pos_orders()
        if n > 0:
            logger.info("Order sync: initial catch-up created %d transactions", n)
    except Exception as e:
        logger.warning("Order sync initial catch-up failed: %s", e)
    
    async def _loop():
        while True:
            await asyncio.sleep(_ORDER_SYNC_INTERVAL)
            try:
                await _sync_pos_orders()
            except Exception as e:
                logger.error("Order sync loop error: %s", e)
    
    asyncio.create_task(_loop())
    logger.info("Order sync started (interval=%ds)", _ORDER_SYNC_INTERVAL)


async def _start_http_server(bot_app, port=ANALYZER_PORT):
    """Start aiohttp server in the bot's event loop via post_init."""
    if web is None:
        logger.warning("aiohttp not installed, HTTP analyzer endpoint disabled")
        return
    app = web.Application()
    app["bot"] = bot_app.bot
    app.router.add_post("/analyze-transaction", _handle_analyze_transaction)
    app.router.add_post("/batch-analyze", _handle_batch_analyze)
    app.router.add_post("/reprocess-receipt", _handle_reprocess_receipt)
    app.router.add_post("/reprocess-receipt", _handle_reprocess_receipt)
    app.router.add_post("/ai-parse-text", _handle_ai_parse)
    app.router.add_get("/health", _handle_health)
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "0.0.0.0", port)
    await site.start()
    logger.info(f"Transaction analyzer HTTP endpoint listening on port {port}")

    # ── Start background order sync ──
    try:
        await _start_order_sync(bot_app)
    except Exception as e:
        logger.warning("Order sync failed to start: %s", e)


async def _load_inventory_aliases():
    """Load inventory aliases from DB into item_normalization cache."""
    try:
        aliases_data = await inventory.get_all_inventory_aliases()
        load_aliases_from_db(aliases_data)
    except Exception as e:
        logger.warning("Failed to load inventory aliases (non-fatal): %s", e)


async def _load_approved_candidate_mappings():
    """Load explicit backend approvals for deterministic receipt restock redirects."""
    global _approved_candidate_map
    try:
        _approved_candidate_map = await inventory.get_approved_candidate_mappings()
        logger.info("Loaded %d approved inventory candidate mappings", len(_approved_candidate_map))
    except Exception as e:
        logger.warning("Failed to load approved candidate mappings (non-fatal): %s", e)
        _approved_candidate_map = {}


def main():
    if not BOT_TOKEN:
        raise RuntimeError("TELEGRAM_BOT_TOKEN belum di-set")

    # ── Load AI memory before bot starts ────────────────────────
    import asyncio as _asyncio
    try:
        loop = _asyncio.get_event_loop()
        if loop.is_running():
            _asyncio.ensure_future(memory.load_all())
        else:
            loop.run_until_complete(memory.load_all())
    except Exception as e:
        logger.warning("Memory load failed (non-fatal): %s", e)

    # ── Load inventory aliases ───────────────────────────────────
    try:
        _asyncio.ensure_future(_load_inventory_aliases())
    except Exception as e:
        logger.warning("Alias load failed (non-fatal): %s", e)

    # ── Load approved candidate mappings ──────────────────────────
    try:
        _asyncio.ensure_future(_load_approved_candidate_mappings())
    except Exception as e:
        logger.warning("Approved candidate mapping load failed (non-fatal): %s", e)

    # ── Load DB categories resolver ──────────────────────────────
    try:
        _asyncio.ensure_future(build_resolver(SUPABASE_URL, SUPABASE_KEY, SUPABASE_SERVICE_ROLE_KEY))
    except Exception as e:
        logger.warning("DB category resolver load failed (non-fatal): %s", e)

    # ── Load pending sessions ───────────────────────────────────
    _load_pending()
    logger.info("Loaded %d receipt(s) and %d action(s) from pending sessions", len(_receipt_pending), len(_pending_actions))

    app = Application.builder().token(BOT_TOKEN).post_init(_start_http_server).build()

    # Commands
    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(CommandHandler("rekap", cmd_rekap))
    app.add_handler(CommandHandler("struk", cmd_struk))
    app.add_handler(CommandHandler("yumi", cmd_yumi))
    app.add_handler(CommandHandler("hermes_scope", cmd_hermes_scope))
    app.add_handler(CommandHandler("hermes_test", cmd_hermes_test))
    app.add_handler(CommandHandler("daftar", cmd_daftar))
    app.add_handler(CommandHandler("hapus_struk", cmd_hapus_struk))
    app.add_handler(CommandHandler("hapus_konfirmasi", cmd_hapus_konfirmasi))

    # Callbacks
    app.add_handler(CallbackQueryHandler(on_callback))

    # Message handlers
    app.add_handler(MessageHandler(filters.PHOTO, on_album))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, on_text))

    logger.info("Starting Yumi Finance AI Agent...")
    app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
