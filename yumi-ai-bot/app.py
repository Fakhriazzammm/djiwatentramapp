import os
import json
import base64
import logging
import io
from datetime import datetime, timedelta, timezone
from collections import Counter

import httpx
from dotenv import load_dotenv
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    Application, CommandHandler, MessageHandler,
    CallbackQueryHandler, ContextTypes, filters,
)
from PIL import Image

load_dotenv()

BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
ALLOWED_USERS = {
    int(x.strip())
    for x in os.getenv("ALLOWED_USERS", "").split(",")
    if x.strip().isdigit()
}
TELEGRAM_REPORT_CHAT_ID = os.getenv("TELEGRAM_REPORT_CHAT_ID", "")

logging.basicConfig(
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger("yumi-ai-bot")

WIB = timezone(timedelta(hours=7))
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

def _reply_keyboard() -> InlineKeyboardMarkup:
    """Quick action inline keyboard for /start and fallback."""
    return InlineKeyboardMarkup([
        [
            InlineKeyboardButton("📊 KPI Hari Ini", callback_data="kpi"),
            InlineKeyboardButton("🔥 Top Produk", callback_data="top"),
        ],
        [
            InlineKeyboardButton("⚠️ Stok Menipis", callback_data="stok"),
            InlineKeyboardButton("🕒 Absensi", callback_data="absen"),
        ],
        [
            InlineKeyboardButton("📅 Booking Aktif", callback_data="booking"),
            InlineKeyboardButton("📋 Briefing", callback_data="briefing"),
        ],
        [
            InlineKeyboardButton("💬 Tanya Bebas", callback_data="help"),
        ],
    ])


async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not _is_allowed(update):
        await update.message.reply_text("Maaf, Anda tidak diizinkan menggunakan bot ini.")
        return

    # Reset session on start
    user_sessions.pop(update.effective_user.id, None)

    await update.message.reply_text(
        "🤖 *Yumi AI — Asisten YumiPOS*\n\n"
        "Saya bisa bantu:\n"
        "• Cek KPI & omzet realtime\n"
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
        await update.message.reply_text("Unauthorized")
        return
    await update.message.reply_text(
        "💡 *Cara pakai Yumi AI*\n\n"
        "📋 *Commands:*\n"
        "/kpi_hari_ini — KPI & omzet hari ini\n"
        "/top_produk — Produk terlaris\n"
        "/stok_menipis — Stok yang perlu dibeli\n"
        "/absen_hari_ini — Absensi staff\n"
        "/booking_aktif — Booking aktif\n"
        "/briefing_hari_ini — Briefing bisnis\n\n"
        "💬 *Chat bebas:* ketik apa saja\n"
        "📸 *Scan struk:* kirim foto struk\n\n"
        "Contoh: _omzet hari ini_, _produk terlaris minggu ini_, _berapa stok kopi?_",
        parse_mode="Markdown",
        reply_markup=_reply_keyboard(),
    )


async def cmd_kpi_hari_ini(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not _is_allowed(update):
        await update.message.reply_text("Unauthorized")
        return
    try:
        now = _now_wib()
        start_ms = _start_of_day_ms(now)

        q_orders = f"select=totalAmount,status,paymentMethod,_creationTime&status=eq.completed&_creationTime=gte.{start_ms}"
        orders = await _fetch("pos_orders", q_orders)
        order_total = sum(float(o.get("totalAmount") or 0) for o in orders)
        order_count = len(orders)
        pm = Counter((o.get("paymentMethod") or "unknown") for o in orders)
        pm_text = "\n".join([f"  {k}: {v}" for k, v in pm.most_common(5)]) or "  belum ada"

        q_income = f"select=amount,date,description&type=eq.income&date=gte.{start_ms}"
        income_rows = await _fetch("pos_financial_transactions", q_income)
        income_total = sum(float(x.get("amount") or 0) for x in income_rows)

        active_shift_rows = await _fetch(
            "pos_shift_reports",
            "select=shift_name,status,order_count,daily_collected,shift_collected,total_revenue,start_time&status=eq.AKTIF&order=start_time.desc&limit=1",
        )
        active_shift = active_shift_rows[0] if active_shift_rows else None
        daily_collected = float((active_shift or {}).get("daily_collected") or 0)
        shift_collected = float((active_shift or {}).get("shift_collected") or 0)
        realtime_total = max(order_total, income_total, daily_collected, shift_collected)

        shift_text = "tidak ada shift aktif"
        if active_shift:
            shift_text = (
                f"{active_shift.get('shift_name','Shift')} ({active_shift.get('status','-')}) — "
                f"{int(active_shift.get('order_count') or 0)} order, Rp {daily_collected:,.0f}"
            )

        await update.message.reply_text(
            f"📊 *KPI Hari Ini*\n\n"
            f"Order selesai: *{order_count}*\n"
            f"Omzet order: *Rp {order_total:,.0f}*\n"
            f"Omzet realtime: *Rp {realtime_total:,.0f}*\n\n"
            f"Shift: {shift_text}\n\n"
            f"Pembayaran:\n{pm_text}",
            parse_mode="Markdown",
            reply_markup=_reply_keyboard(),
        )
    except Exception as e:
        logger.exception("kpi_hari_ini failed")
        await update.message.reply_text(f"Gagal ambil KPI: {e}")


async def cmd_top_produk(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not _is_allowed(update):
        await update.message.reply_text("Unauthorized")
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
            await update.message.reply_text("Belum ada order selesai hari ini.")
            return

        lines = [f"{i}. {n} — {q:.0f} pcs (Rp {omzet[n]:,.0f})" for i, (n, q) in enumerate(top, 1)]
        await update.message.reply_text(
            "🔥 *Top Produk Hari Ini*\n" + "\n".join(lines),
            parse_mode="Markdown",
            reply_markup=_reply_keyboard(),
        )
    except Exception as e:
        logger.exception("top_produk failed")
        await update.message.reply_text(f"Gagal ambil top produk: {e}")


async def cmd_stok_menipis(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not _is_allowed(update):
        await update.message.reply_text("Unauthorized")
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
            await update.message.reply_text("✅ Tidak ada stok menipis.", reply_markup=_reply_keyboard())
            return

        alerts.sort(key=lambda x: (x[1] - x[2]))
        text = "\n".join([f"• {n}: {q:g}/{t:g} {u}" for n, q, t, u in alerts[:30]])
        await update.message.reply_text(
            f"⚠️ *Stok Menipis ({len(alerts)} item)*\n{text}",
            parse_mode="Markdown",
            reply_markup=_reply_keyboard(),
        )
    except Exception as e:
        logger.exception("stok_menipis failed")
        await update.message.reply_text(f"Gagal cek stok: {e}")


async def cmd_absen_hari_ini(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not _is_allowed(update):
        await update.message.reply_text("Unauthorized")
        return
    try:
        now = _now_wib()
        start_ms = _start_of_day_ms(now)
        q = f"select=userName,type,timestamp,shiftName&timestamp=gte.{start_ms}&order=timestamp.desc"
        rows = await _fetch("pos_attendance_logs", q)
        if not rows:
            await update.message.reply_text("Belum ada data absensi.", reply_markup=_reply_keyboard())
            return

        lines = []
        for r in rows[:25]:
            ts = int(r.get("timestamp") or 0)
            dt = datetime.fromtimestamp(ts / 1000, tz=WIB).strftime("%H:%M")
            icon = "✅" if r.get("type") == "check_in" else "🔴"
            lines.append(f"{icon} {dt} | {r.get('userName','?')} | {r.get('shiftName') or '-'}")

        await update.message.reply_text(
            "🕒 *Absensi Hari Ini*\n" + "\n".join(lines),
            parse_mode="Markdown",
            reply_markup=_reply_keyboard(),
        )
    except Exception as e:
        logger.exception("absen_hari_ini failed")
        await update.message.reply_text(f"Gagal ambil absensi: {e}")


async def cmd_booking_aktif(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not _is_allowed(update):
        await update.message.reply_text("Unauthorized")
        return
    try:
        q = "select=bookingCode,customerName,bookingDate,guestCount,tableCount,paymentStatus,bookingStatus,totalAmount&order=_creationTime.desc&limit=20"
        rows = await _fetch("pos_booking_orders", q)
        active = [r for r in rows if str(r.get("bookingStatus", "")).lower() in {"confirmed", "pending", "booked"}]

        if not active:
            await update.message.reply_text("Tidak ada booking aktif.", reply_markup=_reply_keyboard())
            return

        lines = []
        for r in active[:15]:
            lines.append(
                f"• {r.get('bookingCode','-')} | {r.get('customerName','-')} | "
                f"{r.get('bookingDate','-')} | {r.get('guestCount',0)} org | "
                f"{r.get('bookingStatus','-')} | Rp {float(r.get('totalAmount') or 0):,.0f}"
            )

        await update.message.reply_text(
            "📅 *Booking Aktif*\n" + "\n".join(lines),
            parse_mode="Markdown",
            reply_markup=_reply_keyboard(),
        )
    except Exception as e:
        logger.exception("booking_aktif failed")
        await update.message.reply_text(f"Gagal ambil booking: {e}")


async def cmd_briefing_hari_ini(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not _is_allowed(update):
        await update.message.reply_text("Unauthorized")
        return
    try:
        await update.message.chat.send_action("typing")
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

        await update.message.reply_text(briefing, reply_markup=_reply_keyboard())
    except Exception as e:
        logger.exception("briefing_hari_ini failed")
        await update.message.reply_text(f"Gagal generate briefing: {e}")


# ===================================================================
# Inline Keyboard Callback Handler
# ===================================================================

async def on_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    data = query.data

    # Route callback to corresponding command
    cmd_map = {
        "kpi": cmd_kpi_hari_ini,
        "top": cmd_top_produk,
        "stok": cmd_stok_menipis,
        "absen": cmd_absen_hari_ini,
        "booking": cmd_booking_aktif,
        "briefing": cmd_briefing_hari_ini,
        "help": cmd_help,
    }

    handler = cmd_map.get(data)
    if handler:
        # Build a synthetic message update
        await handler(update, context)
    else:
        await query.edit_message_text("Menu tidak dikenal.", reply_markup=_reply_keyboard())


# ===================================================================
# Photo Handler (OCR Receipt Scan)
# ===================================================================

async def on_photo(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not _is_allowed(update):
        await update.message.reply_text("Unauthorized")
        return

    try:
        await update.message.chat.send_action("typing")

        # Get the largest photo
        photo = update.message.photo[-1]
        file = await context.bot.get_file(photo.file_id)
        image_bytes = await file.download_as_bytearray()
        image_bytes = bytes(image_bytes)

        # Compress to base64
        compressed_uri = _compress_image(image_bytes)
        logger.info("Photo compressed: %d → %d bytes", len(image_bytes), len(compressed_uri))

        # Send to Yumi AI for OCR
        caption = update.message.caption or ""
        message = caption.strip() if caption.strip() else "Scan struk ini dan ekstrak detail transaksinya"

        user_id = update.effective_user.id
        context_hint = await _gather_context()
        context_hint += "\nUser mengirim gambar struk/foto. Lakukan OCR dan berikan ringkasan transaksi."

        reply = await _ask_yumi_ai(
            user_id=user_id,
            message=message,
            context_hint=context_hint,
            images=[compressed_uri],
            action="yumiChat",
        )

        await update.message.reply_text(reply, reply_markup=_reply_keyboard())

    except Exception as e:
        logger.exception("Photo handling failed")
        await update.message.reply_text(
            f"Gagal memproses gambar: {e}\n\nCoba kirim ulang atau gunakan teks.",
            reply_markup=_reply_keyboard(),
        )


# ===================================================================
# Free Text Handler (with rich context + session)
# ===================================================================

async def on_text(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not _is_allowed(update):
        await update.message.reply_text("Unauthorized")
        return

    text = (update.message.text or "").strip()
    text_lower = text.lower()

    # Keyword routing to specific commands (fast path)
    keyword_map = [
        (["omzet", "kpi", "penjualan", "revenue", "pendapatan"], cmd_kpi_hari_ini),
        (["top produk", "terlaris", "best seller", "paling laku"], cmd_top_produk),
        (["stok", "menipis", "habis", "inventory", "inventori"], cmd_stok_menipis),
        (["absen", "attendance", "clock in", "clock out", "absensi"], cmd_absen_hari_ini),
        (["booking", "reservasi"], cmd_booking_aktif),
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
        await update.message.chat.send_action("typing")
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
            await update.message.reply_text(reply, reply_markup=_reply_keyboard())
        else:
            chunks = [reply[i:i + 4000] for i in range(0, len(reply), 4000)]
            for i, chunk in enumerate(chunks):
                await update.message.reply_text(chunk, reply_markup=_reply_keyboard() if i == len(chunks) - 1 else None)

    except Exception as e:
        logger.exception("free-text yumi-ai failed")
        await update.message.reply_text(
            "Aku siap bantu! 📌\n"
            "Coba: *omzet hari ini*, *top produk*, *stok menipis*, atau kirim foto struk.\n"
            f"(error: {e})",
            parse_mode="Markdown",
            reply_markup=_reply_keyboard(),
        )


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

    app = Application.builder().token(BOT_TOKEN).post_init(_post_init).build()

    # Commands
    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(CommandHandler("help", cmd_help))
    app.add_handler(CommandHandler("kpi_hari_ini", cmd_kpi_hari_ini))
    app.add_handler(CommandHandler("top_produk", cmd_top_produk))
    app.add_handler(CommandHandler("stok_menipis", cmd_stok_menipis))
    app.add_handler(CommandHandler("absen_hari_ini", cmd_absen_hari_ini))
    app.add_handler(CommandHandler("booking_aktif", cmd_booking_aktif))
    app.add_handler(CommandHandler("briefing_hari_ini", cmd_briefing_hari_ini))

    # Alias
    app.add_handler(CommandHandler("ringkasan", cmd_kpi_hari_ini))

    # Callbacks (inline keyboard)
    app.add_handler(CallbackQueryHandler(on_callback))

    # Message handlers (order matters — photo before text)
    app.add_handler(MessageHandler(filters.PHOTO, on_photo))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, on_text))

    logger.info("Starting Yumi AI bot with full feature parity...")
    app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
