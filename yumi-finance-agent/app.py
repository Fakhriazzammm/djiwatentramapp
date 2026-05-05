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
from datetime import datetime, timezone, timedelta

import httpx
from dotenv import load_dotenv
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    Application, CommandHandler, MessageHandler,
    CallbackQueryHandler, ContextTypes, filters,
)
from PIL import Image

load_dotenv()

# ── Config ─────────────────────────────────────────────────────────
BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
FINANCE_GROUP_ID = int(os.getenv("FINANCE_GROUP_ID", "-4995568785"))
SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
SUPABASE_ACCESS_TOKEN = os.getenv("SUPABASE_ACCESS_TOKEN", "")

# SumoPod API — untuk AI chat & vision/OCR
SUMOPOD_API_KEY = os.getenv("SUMOPOD_API_KEY", "sk-UfA-KXloOB3ZLHSQWxb0Cw")

logging.basicConfig(
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger("yumi-finance")

WIB = timezone(timedelta(hours=7))
MAX_IMAGE_SIZE = 1024
JPEG_QUALITY = 75

# ── Inisialisasi module ────────────────────────────────────────────
from finance import FinanceManager
from inventory import InventoryManager
from orchestrator import FinanceOrchestrator, OrchestratorResult
from categories import auto_categorize, categorize_item, get_category_label, format_amount, FINANCE_CATEGORIES, get_all_categories, add_dynamic_category
from sumopod_client import SumoPodClient
from memory import MemoryManager, normalize_name
# (no supplier import needed — moved to Yumi Purchasing)

finance = FinanceManager(SUPABASE_URL, SUPABASE_KEY, SUPABASE_SERVICE_ROLE_KEY, f"{SUPABASE_URL}/functions/v1/yumi-ai")
inventory = InventoryManager(SUPABASE_URL, SUPABASE_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ACCESS_TOKEN)
orchestrator = FinanceOrchestrator(SUMOPOD_API_KEY)
memory = MemoryManager(SUPABASE_URL, SUPABASE_KEY, SUPABASE_SERVICE_ROLE_KEY)
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


# ── Helpers ────────────────────────────────────────────────────────


def clean_output(text: str) -> str:
    """Bersihkan output dari karakter *, #, dan '."""
    text = text.replace("*", "").replace("#", "").replace("'", "")
    return text



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
    # Foto dari owner selalu diproses di grup (biar gak perlu @mention tiap foto)
    if user.id == 323151437 and msg.photo:
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

def _compress_image(image_bytes: bytes) -> str:
    """Compress image to under ~200KB, return base64 data URI."""
    img = Image.open(io.BytesIO(image_bytes))
    if img.mode in ("RGBA", "P"):
        img = img.convert("RGB")
    w, h = img.size
    if max(w, h) > MAX_IMAGE_SIZE:
        ratio = MAX_IMAGE_SIZE / max(w, h)
        img = img.resize((int(w * ratio), int(h * ratio)), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=JPEG_QUALITY, optimize=True)
    b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
    return f"data:image/jpeg;base64,{b64}"


# ── OCR Parser ─────────────────────────────────────────────────────

async def _parse_ocr_text(ai_reply: str) -> list[dict]:
    """Parse AI reply dari OCR untuk extract item belanjaan."""
    items = []
    # Cari pola item: "Nama Barang — Qty: X • Rp Y.YYY" or numbered list
    item_patterns = [
        r'\d+\.\s*<b>(.+?)</b>\s*—\s*Qty:\s*(\d+(?:\.\d+)?)\s*•\s*<b>Rp\s*([\d.,]+)</b>',
        r'\d+\.\s*(.+?)\s*/\s*(\d+(?:\.\d+)?)\s*(ml|liter|l|kg|gram|gr|g|pcs|pack|ikat|bungkus)?\s*/\s*Rp\s*([\d.,]+)',
        r'\d+\.\s*(.+?)\s*—\s*(\d+(?:\.\d+)?)\s*\S*\s*—\s*Rp\s*([\d.,]+)',
        r'\d+\.\s*(.+?)\s*\((\d+)\s*\S*\)\s*Rp\s*([\d.,]+)',
    ]
    for pattern in item_patterns:
        for m in re.finditer(pattern, ai_reply):
            name = m.group(1).strip()
            qty = float(m.group(2).replace(",", "."))
            price_text = m.group(3) if len(m.groups()) >= 3 else "0"
            price_text = m.group(4) if len(m.groups()) >= 4 else price_text
            price = float(price_text.replace(".", "").replace(",", "."))
            items.append({"name": name, "qty": qty, "price": price})
    return items


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
            await inventory.restock_item(inv_id, float(matched.get("quantity", 0)), item.get("qty", 0), item.get("unit", "pcs"))
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

# ── Bulk OCR: album multi-foto ──────────────────────────────────────
_album_buffer: dict[str, dict] = {}
_album_lock = asyncio.Lock()
ALBUM_TIMEOUT = 5.0  # detik — tunggu semua foto terkumpul
_MAX_CONCURRENT_OCR = 5
_ocr_semaphore = asyncio.Semaphore(_MAX_CONCURRENT_OCR)
_bulk_pending: dict[str, list[dict]] = {}
_bulk_select_state: dict[str, dict] = {}


async def on_photo(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle foto struk — OCR structured JSON → tampilkan item → minta konfirmasi."""
    if not _can_respond(update):
        return

    await context.bot.send_chat_action(chat_id=update.effective_chat.id, action="typing")
    msg = await update.message.reply_text("🔍 Memproses struk...")

    try:
        # Compress image
        photo = update.message.photo[-1]
        file = await context.bot.get_file(photo.file_id)
        image_bytes = bytes(await file.download_as_bytearray())
        compressed_uri = _compress_image(image_bytes)

        # Panggil SumoPod vision_json untuk structured OCR
        sp_client = SumoPodClient(SUMOPOD_API_KEY)
        vision_result = await sp_client.vision_json(image_base64_uri=compressed_uri, timeout=90)

        if not vision_result.get("success"):
            await msg.edit_text(
                f"❌ Gagal membaca struk: {vision_result.get('error', 'Unknown')}\n\n"
                f"Coba foto ulang dengan pencahayaan lebih baik.",
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

        # Kalau items kosong, fallback parse dari raw_text
        if not items and raw_text:
            items = await _parse_ocr_text(raw_text)

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
        if confidence < 0.8:
            lines.append(f"  ⚠️ Confidence AI: {confidence:.0%}")
        lines.append("")
        lines.append("Simpan sebagai apa?")

        # Simpan data untuk callback
        ref_id = f"rcpt_{len(_receipt_pending)}"
        _receipt_pending[ref_id] = {
            "merchant": merchant,
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
        }
        _save_pending()

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
    """OCR satu foto — return hasil vision_json."""
    try:
        file = await context.bot.get_file(photo.file_id)
        image_bytes = bytes(await file.download_as_bytearray())
        compressed_uri = _compress_image(image_bytes)

        async with _ocr_semaphore:
            vision_result = await sp_client.vision_json(image_base64_uri=compressed_uri, timeout=90)

        done = idx + 1
        try:
            await context.bot.edit_message_text(
                chat_id=chat_id, message_id=status_msg_id,
                text=f"🔍 Memproses {total} struk... ({done}/{total})"
            )
        except Exception:
            pass
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
        await context.bot.edit_message_text(
            chat_id=chat_id, message_id=status_msg_id,
            text="❌ Semua struk gagal dibaca.\nCoba foto ulang dengan pencahayaan lebih baik.",
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

            # ── Per-item categorization ──────────────────────
            cat_key, cat_conf, cat_suggest = categorize_item(name, price)

            # ── Memory boost: check learned item→category ─────
            mem_cat, mem_conf = memory.get_item_category(name)
            if mem_cat and mem_conf > 0.6:
                if cat_conf == "low" or mem_conf > 0.8:
                    cat_key = mem_cat
                    cat_conf = "high" if mem_conf > 0.8 else "medium"

            cat_info = FINANCE_CATEGORIES.get(cat_key, {})
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

    # Build description dari items
    items = receipt.get("items", [])
    if items:
        item_names = ", ".join(f"{it.get('name', '?')} ×{it.get('qty', 1)}" for it in items[:5])
        if len(items) > 5:
            item_names += f" + {len(items) - 5} item lain"
        desc = f"{'Pemasukan' if tx_type == 'income' else 'Belanja'}{' - ' + merchant if merchant else ''}: {item_names}"
    else:
        desc = f"Struk belanja{' - ' + merchant if merchant else ''}"

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
            "ocr": True,
            "receipt_number": receipt.get("receipt_number", ""),
            "receipt_date": receipt.get("date", ""),
            "item_count": len(items),
        },
    )

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
    if tx_result.get("ok"):
        lines.append(f"✅ Berhasil disimpan")
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

            matched, score = await inventory.fuzzy_match_item(item_name, inventory_list)
            if matched and score >= MIN_SCORE_AUTO:
                inv_name = matched["ingredientName"]
                inv_qty = float(matched.get("quantity", 0))
                try:
                    await inventory.restock_item(matched["_id"], inv_qty, item_qty, unit)
                    await inventory.log_purchase(inv_name, item_qty, unit, item_price * item_qty, merchant)
                    restok_lines.append(f"  ✅ {inv_name} +{item_qty:.0f} {unit}")
                except Exception as e:
                    restok_lines.append(f"  ⚠️ {item_name}: {e}")
            elif matched and score >= MIN_SCORE_SUGGEST:
                restok_lines.append(f"  🤔 {item_name} ≈ {matched['ingredientName']}? ({score}%)")
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
    m = re.search(r'(\d+(?:\.\d+)?)\s*(ml|liter|l|kg|gram|gr|g|pcs|pack|ikat|bungkus|toros|botol)\b', name, re.IGNORECASE)
    if m:
        return m.group(2).lower()
    return ""


# ── Manual restock untuk input manual ────────────────────────────

async def _manual_restock(result):
    """Restok inventory dari input pengeluaran manual (sama seperti OCR)."""
    try:
        items_to_restock = []

        # Cek apakah orchestrator sudah parse items
        if result.items:
            items_to_restock = result.items
        elif result.description:
            # Parse manual dari description: "2 kg ubi" or "Minyak rizki 3 btl"
            desc = result.description.strip()
            m = re.match(r'(\d+(?:[.,]\d+)?)\s*(ml|liter|l|kg|gram|gr|g|pcs|pack|ikat|bungkus|toros|botol|btl|kilo|kantong|dus)\s+(.+)', desc, re.IGNORECASE)
            if m:
                qty_str = m.group(1).replace(",", ".")
                unit = m.group(2).lower()
                unit = {"btl": "botol", "kilo": "kg", "gr": "gram", "l": "liter"}.get(unit, unit)
                name = m.group(3).strip()
                unit_price = result.amount / float(qty_str) if float(qty_str) > 0 else result.amount
                items_to_restock = [{"name": name, "qty": float(qty_str), "unit": unit, "price": unit_price}]
            else:
                # Fallback: seluruh description sebagai nama item, qty=1
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

            matched, score = await inventory.fuzzy_match_item(item_name, inventory_list)
            if matched and score >= MIN_SCORE_AUTO:
                inv_name = matched["ingredientName"]
                inv_qty = float(matched.get("quantity", 0))
                try:
                    await inventory.restock_item(matched["_id"], inv_qty, item_qty, unit)
                    await inventory.log_purchase(inv_name, item_qty, unit, item_price * item_qty, merchant)
                    restok_lines.append(f"  ✅ {inv_name} +{item_qty:.0f} {unit}")
                except Exception as e:
                    restok_lines.append(f"  ⚠️ {item_name}: {e}")
            elif matched and score >= MIN_SCORE_SUGGEST:
                restok_lines.append(f"  🤔 {item_name} ≈ {matched['ingredientName']}? ({score}%)")
            else:
                restok_lines.append(f"  🆕 {item_name} — belum di database")

        if restok_lines:
            logger.info("Manual restock: %s", "; ".join(restok_lines))

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


MIN_SCORE_AUTO = 60
MIN_SCORE_SUGGEST = 45


# ── Text Handler ───────────────────────────────────────────────────

async def on_text(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle text dari grup keuangan."""
    if not _can_respond(update):
        return

    text = (update.message.text or "").strip()
    if not text:
        return

    # Tunjukkan typing indicator
    await context.bot.send_chat_action(chat_id=update.effective_chat.id, action="typing")

    # Route ke orchestrator
    result = await orchestrator.orchestrate(text)

    try:
        if result.action == "record_income":
            # Catat pemasukan
            tx = await finance.record_transaction(
                tx_type="income",
                amount=result.amount,
                description=result.description or "Pemasukan",
                category="penjualan",
            )
            if tx.get("ok"):
                cat_label = get_category_label("penjualan")
                await update.message.reply_text(
                    f"✅ Pemasukan Tercatat\n"
                    f"   {format_amount(int(result.amount))}\n"
                    f"   📝 {result.description or 'Pemasukan'}\n"
                    f"   {cat_label}",
                    reply_markup=_finance_keyboard(),
                )
            else:
                await update.message.reply_text(f"❌ Gagal: {tx.get('error', '?')}", reply_markup=_finance_keyboard())

        elif result.action == "record_expense":
            # Catat pengeluaran
            category, _ = auto_categorize(result.description, result.amount)
            if result.category:
                category = result.category
            tx = await finance.record_transaction(
                tx_type="expense",
                amount=result.amount,
                description=result.description or "Pengeluaran",
                category=category,
            )
            if tx.get("ok"):
                cat_label = get_category_label(category)
                await update.message.reply_text(
                    f"💸 Pengeluaran Tercatat\n"
                    f"   {format_amount(int(result.amount))}\n"
                    f"   📝 {result.description or 'Pengeluaran'}\n"
                    f"   {cat_label}",
                    reply_markup=_finance_keyboard(),
                )

                # ── Restok inventory (sama seperti OCR) ─────
                asyncio.ensure_future(_manual_restock(result))
            else:
                await update.message.reply_text(f"❌ Gagal: {tx.get('error', '?')}", reply_markup=_finance_keyboard())

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

    # Handle bulk OCR callbacks (album multi-foto)
    if query.data.startswith("bulk_"):
        await _handle_bulk_callback(update, context)
        return
    if query.data.startswith("bulkitem_"):
        await _handle_bulkitem_callback(update, context)
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


# ── Commands ──────────────────────────────────────────────────────

async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handler /start"""
    if not _can_respond(update):
        await update.message.reply_text("Bot ini hanya untuk grup keuangan khusus.")
        return

    await update.message.reply_text(
        "🤖 Yumi Finance AI Agent\n\n"
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
                    "item_categories": {
                        it.get("name", "?")[:40]: it.get("_category", "lainnya")
                        for it in ri.get("items", [])
                    },
                },
            )

            if tx_result.get("ok"):
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
            if tx_type == "expense" and tx_result.get("ok"):
                await _restok_bulk_items(ri)

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
            matched = _find_inventory_match(item_name, inventory_list)
            if matched and matched.get("score", 0) >= 60:
                inv_id = matched.get("_id")
                await inventory.restock_item(
                    inv_id,
                    float(matched.get("quantity", 0)),
                    item.get("qty", 0),
                    item.get("unit", "pcs")
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
                "item_count": len(ri.get("items", [])),
            },
        )

        state["processed"][idx] = action
        if tx_result.get("ok") and action == "expense":
            await _restok_bulk_items(ri)

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
        ai_result = await sp_client.chat(message=prompt, model="gpt-4o-mini", timeout=30)
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

    # ── Load pending sessions ───────────────────────────────────
    _load_pending()
    logger.info("Loaded %d receipt(s) and %d action(s) from pending sessions", len(_receipt_pending), len(_pending_actions))

    app = Application.builder().token(BOT_TOKEN).build()

    # Commands
    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(CommandHandler("rekap", cmd_rekap))

    # Callbacks
    app.add_handler(CallbackQueryHandler(on_callback))

    # Message handlers
    app.add_handler(MessageHandler(filters.PHOTO, on_album))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, on_text))

    logger.info("Starting Yumi Finance AI Agent...")
    app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
