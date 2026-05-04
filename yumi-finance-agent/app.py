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
from categories import auto_categorize, get_category_label, format_amount, FINANCE_CATEGORIES
from sumopod_client import SumoPodClient

finance = FinanceManager(SUPABASE_URL, SUPABASE_KEY, SUPABASE_SERVICE_ROLE_KEY, f"{SUPABASE_URL}/functions/v1/yumi-ai")
inventory = InventoryManager(SUPABASE_URL, SUPABASE_KEY, SUPABASE_SERVICE_ROLE_KEY)
orchestrator = FinanceOrchestrator(SUMOPOD_API_KEY)

# ── In-memory state: pending confirmations ─────────────────────────
# { callback_data: {"type": "new_ingredient", "data": {...}} }
_pending_actions: dict[str, dict] = {}


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

def _is_finance_group(update: Update) -> bool:
    """Cek apakah pesan dari grup keuangan."""
    chat = update.effective_chat
    return chat is not None and chat.id == FINANCE_GROUP_ID


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
        [InlineKeyboardButton("🏦 Saldo", callback_data="quick_balance"),
         InlineKeyboardButton("📊 Ringkasan", callback_data="quick_summary")],
        [InlineKeyboardButton("📁 Kategori", callback_data="quick_category"),
         InlineKeyboardButton("📦 Cek Stok", callback_data="quick_stock")],
        [InlineKeyboardButton("🛒 Marketlist", callback_data="quick_marketlist"),
         InlineKeyboardButton("💬 Tanya AI", callback_data="quick_ask")],
    ])


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

    elif data.startswith("new_ingredient_skip_"):
        idx = data.replace("new_ingredient_skip_", "")
        pending = _pending_actions.pop(idx, None)
        await query.edit_message_text(f"⏭️ {pending['item']['name']} dilewati." if pending else "⏭️ Dilewati.")

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


# ── OCR Photo Handler ──────────────────────────────────────────────

# Pending receipt confirmations (terpisah dari _pending_actions ingredient)
_receipt_pending: dict[str, dict] = {}

# ── Bulk OCR: album multi-foto ──────────────────────────────────────
_album_buffer: dict[str, dict] = {}
_album_lock = asyncio.Lock()
ALBUM_TIMEOUT = 1.5  # detik
_MAX_CONCURRENT_OCR = 3
_ocr_semaphore = asyncio.Semaphore(_MAX_CONCURRENT_OCR)
_bulk_pending: dict[str, list[dict]] = {}
_bulk_select_state: dict[str, dict] = {}


async def on_photo(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle foto struk — OCR structured JSON → tampilkan item → minta konfirmasi."""
    if not _is_finance_group(update):
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
    if not _is_finance_group(update):
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

            qty_str = f"{qty:.0f}" if qty == int(qty) else f"{qty:.1f}"
            unit_str = f" {unit}" if unit else ""
            price_fmt = format_amount(int(price))
            sub_fmt = format_amount(int(item_sub))
            flag = "🛒" if is_bulk else "🛍️"
            lines.append(f"     {flag} {name} — {qty_str}{unit_str}×{price_fmt} = {sub_fmt}")
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
        receipt["category"] = cat_key

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
    ref_id = f"rcpt_{parts[2]}" if parts[2] else ""

    receipt = _receipt_pending.pop(ref_id, None)
    if not receipt:
        try:
            await query.edit_message_text("❌ Sesi kadaluarsa. Silakan kirim ulang struk.", reply_markup=_finance_keyboard())
        except Exception:
            pass
        return True

    if action == "cancel":
        await query.edit_message_text("❌ Dibatalkan.", reply_markup=_finance_keyboard())
        return True

    # ── Record transaction ──────────────────────────────────────
    tx_type = "income" if action == "income" else "expense"
    merchant = receipt.get("merchant", "")
    total = receipt.get("total", 0)
    category = receipt.get("category", "belanja_stok" if tx_type == "expense" else "penjualan")

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

    await query.edit_message_text("\n".join(lines), reply_markup=_finance_keyboard())
    return True


def _extract_unit(name: str) -> str:
    """Extract unit dari nama item."""
    m = re.search(r'(\d+(?:\.\d+)?)\s*(ml|liter|l|kg|gram|gr|g|pcs|pack|ikat|bungkus|toros|botol)\b', name, re.IGNORECASE)
    if m:
        return m.group(2).lower()
    return ""


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
    if not _is_finance_group(update):
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
            text_summary = await finance.get_summary(period)
            await update.message.reply_text(text_summary, reply_markup=_finance_keyboard())

        elif result.action == "category_breakdown":
            breakdown = await finance.get_category_breakdown()
            await update.message.reply_text(breakdown, reply_markup=_finance_keyboard())

        elif result.action == "check_stock":
            item = result.text
            stock_text = await inventory.check_stock(item)
            await update.message.reply_text(stock_text, reply_markup=_finance_keyboard())

        elif result.action == "marketlist":
            # Generate marketlist — reuse logic dari yumi-ai-bot marketlist.py
            try:
                from marketlist import generate_marketlist

                async def fetch_fn(view, query="select=*"):
                    url = f"{SUPABASE_URL}/rest/v1/{view}?{query}"
                    async with httpx.AsyncClient(timeout=20) as client:
                        resp = await client.get(url, headers={
                            "apikey": SUPABASE_KEY,
                            "Authorization": f"Bearer {SUPABASE_KEY}",
                        })
                        resp.raise_for_status()
                        return resp.json()

                ml_text = await generate_marketlist(fetch_fn)
                await update.message.reply_text(ml_text, reply_markup=_finance_keyboard())
            except Exception as e:
                logger.warning("marketlist failed: %s", e)
                await update.message.reply_text("❌ Gagal generate marketlist.", reply_markup=_finance_keyboard())

        elif result.action == "low_stock":
            # Cari semua item dengan stok menipis
            all_items = await inventory.get_all_inventory()
            low_items = []
            for r in all_items:
                qty = float(r.get("quantity") or 0)
                thresh = float(r.get("lowStockThreshold") or 0)
                name = r.get("ingredientName", "?")
                unit = r.get("unit") or ""
                if qty <= thresh and thresh > 0:
                    unit_s = f" {unit}" if unit else ""
                    thresh_s = f" (min: {thresh:g}{unit_s})" if thresh > 0 else ""
                    low_items.append(f"• {name}: {qty:g}{unit_s}{thresh_s}")

            if low_items:
                lines = ["⚠️ Stok Menipis:", ""]
                lines.extend(low_items[:20])
                await update.message.reply_text("\n".join(lines), reply_markup=_finance_keyboard())
            else:
                await update.message.reply_text("✅ Semua stok aman.", reply_markup=_finance_keyboard())

        elif result.action == "restock":
            item_name = result.description
            qty = result.amount
            unit = result.merchant or "pcs"
            price = float(result.text or "0") if result.text else 0

            # Cari item di inventory
            matched, score = await inventory.fuzzy_match_item(item_name)
            if matched and score >= MIN_SCORE_AUTO:
                inv_id = matched["_id"]
                inv_qty = float(matched.get("quantity", 0))
                inv_name = matched["ingredientName"]
                await inventory.restock_item(inv_id, inv_qty, qty, unit)
                total_cost = price * qty
                await inventory.log_purchase(inv_name, qty, unit, total_cost)
                if total_cost > 0:
                    await finance.record_transaction("expense", total_cost, f"Restok {inv_name} {qty} {unit}", "belanja_stok")
                await update.message.reply_text(
                    f"✅ Restok Berhasil\n"
                    f"   {inv_name} +{qty:.0f} {unit}\n"
                    f"   Total biaya: {format_amount(int(total_cost))}" if total_cost > 0 else f"✅ {inv_name} +{qty:.0f} {unit}",
                    reply_markup=_finance_keyboard(),
                )
            elif matched and score >= MIN_SCORE_SUGGEST:
                cb_idx = f"restock_{len(_pending_actions)}"
                _pending_actions[cb_idx] = {"item": {"name": item_name, "qty": qty, "unit": unit, "price": price}, "matched": matched}
                keyboard = InlineKeyboardMarkup([
                    [
                        InlineKeyboardButton("✅ Ya", callback_data=f"new_ingredient_overwrite_{cb_idx}"),
                        InlineKeyboardButton("❌ Batal", callback_data=f"new_ingredient_skip_{cb_idx}"),
                    ]
                ])
                await update.message.reply_text(
                    f"🤔 Maksud {matched['ingredientName']}? ({score}% match)",
                    reply_markup=keyboard,
                )
            else:
                # Barang baru
                cb_idx = f"new_{len(_pending_actions)}"
                item_data = {"name": item_name, "qty": qty, "unit": unit, "price": price}
                _pending_actions[cb_idx] = {"item": item_data, "matched": None}
                keyboard = InlineKeyboardMarkup([
                    [
                        InlineKeyboardButton("✅ Simpan Baru", callback_data=f"new_ingredient_save_{cb_idx}"),
                        InlineKeyboardButton("❌ Batal", callback_data=f"new_ingredient_skip_{cb_idx}"),
                    ]
                ])
                await update.message.reply_text(
                    f"🆕 {item_name} belum ada di database. Simpan sebagai bahan baru?\n"
                    f"   Qty: {qty:.0f} {unit}\n"
                    f"   Harga: {format_amount(int(price * qty))}",
                    reply_markup=keyboard,
                )

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
            # Unknown atau AI chat — kirim balasan AI
            reply_text = result.text or (
                "Maaf, saya belum paham. 😅\n"
                "Coba ketik:\n"
                "• `pemasukan 50000`\n"
                "• `pengeluaran 25000 beli gula`\n"
                "• `saldo`\n"
                "• `cek stok`\n"
                "• `ringkasan bulan ini`"
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

    # Quick action buttons
    action_map = {
        "quick_income": "pemasukan ",
        "quick_expense": "pengeluaran ",
        "quick_balance": "saldo",
        "quick_summary": "ringkasan hari ini",
        "quick_category": "kategori",
        "quick_stock": "cek stok",
        "quick_marketlist": "marketlist",
        "quick_ask": (
            "Halo! Aku Yumi Finance AI Agent. 👋\n\n"
            "Aku bisa bantu:\n"
            "• Catat pemasukan & pengeluaran\n"
            "• Cek saldo & ringkasan keuangan\n"
            "• Cek stok inventory\n"
            "• Scan struk belanja (kirim foto)\n"
            "• Generate marketlist\n\n"
            "Coba ketik langsung atau pilih menu di bawah 👇"
        ),
    }

    action = action_map.get(query.data)
    if action is None:
        return

    if query.data == "quick_ask":
        await query.edit_message_text(action, reply_markup=_finance_keyboard())
        return

    # Untuk quick_income/quick_expense, kirim prompt
    if query.data in ("quick_income", "quick_expense"):
        await query.edit_message_text(
            f"Silakan ketik:\n`{action}<nominal> <deskripsi>`\n\n"
            f"Contoh:\n`{action}50000 beli gula`",
            reply_markup=_finance_keyboard(),
        )
        return

    # Untuk sisanya, trigger orchestrator
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

        elif result.action == "check_stock":
            stock_text = await inventory.check_stock()
            await query.edit_message_text(stock_text, reply_markup=_finance_keyboard())

        elif result.action == "marketlist":
            try:
                from marketlist import generate_marketlist

                async def fetch_fn(view, query="select=*"):
                    url = f"{SUPABASE_URL}/rest/v1/{view}?{query}"
                    async with httpx.AsyncClient(timeout=20) as client:
                        resp = await client.get(url, headers={
                            "apikey": SUPABASE_KEY,
                            "Authorization": f"Bearer {SUPABASE_KEY}",
                        })
                        resp.raise_for_status()
                        return resp.json()

                ml_text = await generate_marketlist(fetch_fn)
                await query.edit_message_text(ml_text, reply_markup=_finance_keyboard())
            except Exception as e:
                logger.warning("marketlist failed: %s", e)
                await query.edit_message_text("❌ Gagal generate marketlist.", reply_markup=_finance_keyboard())

    except Exception as e:
        logger.exception("Callback handler failed")
        try:
            await query.edit_message_text(f"❌ Error: {e}", reply_markup=_finance_keyboard())
        except Exception:
            pass


# ── Commands ──────────────────────────────────────────────────────

async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handler /start"""
    if not _is_finance_group(update):
        await update.message.reply_text("Bot ini hanya untuk grup keuangan khusus.")
        return

    await update.message.reply_text(
        "🤖 Yumi Finance AI Agent\n\n"
        "Asisten keuangan & inventory untuk bisnis kamu.\n\n"
        "Fitur:\n"
        "💰 Catat pemasukan & pengeluaran\n"
        "🏦 Cek saldo & ringkasan keuangan\n"
        "📦 Cek stok & restok inventory\n"
        "🛒 Marketlist otomatis\n"
        "📸 Scan struk belanja (OCR)\n\n"
        "Cara pakai:\n"
        "• `pemasukan 50000` — catat pemasukan\n"
        "• `pengeluaran 25000 beli gula` — catat pengeluaran\n"
        "• `saldo` — cek saldo\n"
        "• `cek stok` — cek inventory\n"
        "• `restok gula 2kg 30000` — restok stok\n"
        "• Kirim `foto struk` — auto catat + restok\n\n"
        "Pilih menu di bawah 👇",
        reply_markup=_finance_keyboard(),
    )


async def cmd_rekap(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handler /rekap — rekap struk OCR yang diproses."""
    if not _is_finance_group(update):
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
                },
            )

            if tx_result.get("ok"):
                saved += 1
                total_all += ri["total"]
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

def main():
    if not BOT_TOKEN:
        raise RuntimeError("TELEGRAM_BOT_TOKEN belum di-set")

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
