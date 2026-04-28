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
        ],
        [
            InlineKeyboardButton("💬 Tanya Bebas", callback_data="help"),
        ],
    ])


async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not _is_allowed(update):
        await _reply_msg(update, context, "Maaf, Anda tidak diizinkan menggunakan bot ini.")
        return

    # Reset session on start
    user_sessions.pop(update.effective_user.id, None)

    await _reply_msg(update, context, 
        "🤖 *Yumi AI — Asisten YumiPOS*\n\n"
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
        "💡 *Cara pakai Yumi AI*\n\n"
        "📋 *Commands:*\n"
        "/ringkasan — Ringkasan harian lengkap\n"
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


async def cmd_ringkasan_hari_ini(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not _is_allowed(update):
        await _reply_msg(update, context, "Unauthorized")
        return
    await context.bot.send_chat_action(chat_id=update.effective_chat.id, action="typing")
    try:
        now = _now_wib()
        start_ms = _start_of_day_ms(now)
        date_str = now.strftime("%d/%m/%Y")

        # ── 1) Completed orders today ──
        q_orders = (
            "select=orderNumber,totalAmount,status,paymentMethod,discountAmount,"
            "items,customerName,createdAt,_creationTime"
            f"&status=eq.completed&_creationTime=gte.{start_ms}&order=_creationTime.desc"
        )
        orders = await _fetch("pos_orders", q_orders)

        # Aggregate total
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
        q_fin = f"select=amount,type,category,description,date&date=gte.{start_ms}"
        fin_rows = await _fetch("pos_financial_transactions", q_fin)
        expense_by_cat = Counter()
        total_expense = 0.0
        for x in fin_rows:
            if x.get("type") == "expense":
                amt = float(x.get("amount") or 0)
                expense_by_cat[x.get("category") or "Lainnya"] += amt
                total_expense += amt
        net_balance = total_revenue - total_expense

        # ── 3) Shift reports ──
        shift_rows = await _fetch(
            "pos_shift_reports",
            "select=shift_name,status,order_count,daily_collected,shift_collected,"
            "start_time,end_time,cashier_name,team_members,starting_cash,"
            "cash_revenue,qris_revenue,other_revenue,total_revenue,total_gross_sales,"
            "total_discount,total_items_sold,total_expenses"
            "&order=start_time.desc&limit=10",
        )

        # ── 4) Build report ──
        lines = [
            "📊 Daily Revenue Report",
            f"Djiwa Tentram Cafe & Resto",
            f"📅 Tanggal: {date_str}",
            f"---",
        ]

        # Per-shift breakdown (like dashboard)
        if shift_rows:
            for idx, s in enumerate(shift_rows):
                s_start = s.get("start_time")
                s_end = s.get("end_time")
                if not s_start:
                    continue

                s_start_ms = int(s_start)
                s_end_ms = int(s_end) if s_end else int(now.timestamp() * 1000)

                # Filter orders by shift time window
                s_orders = [o for o in orders if o.get("createdAt") and s_start_ms <= o["createdAt"] <= s_end_ms]
                s_cash = 0.0; s_qris = 0.0; s_other = 0.0; s_discount = 0.0; s_items = 0
                s_items_by_name = Counter()

                for o in s_orders:
                    amt = float(o.get("totalAmount") or 0)
                    pm = (o.get("paymentMethod") or "").lower()
                    if pm in ("cash", "tunai"): s_cash += amt
                    elif pm in ("qris", "transfer"): s_qris += amt
                    else: s_other += amt
                    s_discount += float(o.get("discountAmount") or 0)
                    for item in (o.get("items") or []):
                        name = (item.get("productName") or "Unknown").strip()
                        qty = int(float(item.get("quantity") or 0))
                        s_items_by_name[name] += qty
                        s_items += qty

                s_revenue = s_cash + s_qris + s_other
                s_gross = s_revenue + s_discount

                # Filter expenses by shift time window
                s_expenses = 0.0
                for x in fin_rows:
                    if x.get("type") != "expense":
                        continue
                    d = x.get("date")
                    if d and s_start_ms <= d <= s_end_ms:
                        s_expenses += float(x.get("amount") or 0)

                # Shift modal/starting_cash
                starting_cash = float(s.get("starting_cash") or 0)
                team = s.get("team_members") or "-"
                cashier = s.get("cashier_name") or "Kasir"
                shift_name = s.get("shift_name") or f"Shift {idx+1}"
                status = s.get("status") or "?"
                is_active = status == "AKTIF"
                status_label = " (AKTIF)" if is_active else (" (SELESAI)" if s_end else "")

                # Top 3 per shift
                s_top3 = s_items_by_name.most_common(3)

                lines.append(
                    f"👥 {shift_name.upper()}{status_label}"
                )
                if is_active:
                    lines.append(f"   🟢 SHIFT SEDANG BERJALAN")
                lines.append(f"   Modal Kasir: Rp {starting_cash:,.0f}")
                lines.append(f"   Tunai: Rp {s_cash:,.0f}")
                lines.append(f"   Debit/QRIS: Rp {s_qris:,.0f}")
                if s_other > 0:
                    lines.append(f"   Lainnya: Rp {s_other:,.0f}")
                lines.append(f"")
                lines.append(f"   Total Penjualan Bruto: Rp {s_gross:,.0f}")
                lines.append(f"   Total Potongan (Diskon): Rp {s_discount:,.0f}")
                lines.append(f"   Total Revenue Bersih: Rp {s_revenue:,.0f}")
                lines.append(f"")
                lines.append(f"   Produk Terjual: {s_items}")
                if s_top3:
                    lines.append(f"   ⭐ TOP 3:")
                    for i, (pn, pq) in enumerate(s_top3, 1):
                        lines.append(f"     {i}. {pn}: {pq}")
                lines.append(f"")
                lines.append(f"   Pengeluaran Shift: Rp {s_expenses:,.0f}")
                lines.append(f"")
                lines.append(f"   Kasir: {cashier}")
                if team and team != "-":
                    lines.append(f"   Tim: {team}")
                lines.append(f"---")
        else:
            lines.append("👥 BELUM ADA SHIFT HARI INI")
            lines.append(f"---")

        # ── 5) Daily totals ──
        lines.append(f"💰 TOTAL REVENUE HARIAN (NET):")
        lines.append(f"Rp {total_revenue:,.0f}")
        lines.append(f"📦 TOTAL PRODUK TERJUAL: {total_items_sold}")
        lines.append(f"Total Penjualan Bruto (Gross): Rp {total_gross:,.0f}")
        lines.append(f"Total Potongan (Diskon/Voucher): Rp {total_discount:,.0f}")
        lines.append(f"Net Revenue Harian: Rp {total_revenue:,.0f}")
        lines.append(f"")

        # Top 3 harian
        top3 = items_by_name.most_common(3)
        if top3:
            lines.append(f"⭐ TOP 3 PRODUK TERLARIS (HARIAN):")
            for i, (pn, pq) in enumerate(top3, 1):
                lines.append(f"  {i}. {pn}: {pq}")
            lines.append(f"")

        # Expenses harian
        lines.append(f"---")
        if total_expense > 0:
            lines.append(f"📝 RINGKASAN PENGELUARAN HARIAN")
            for cat, amt in expense_by_cat.most_common(10):
                lines.append(f"  {cat}: Rp {amt:,.0f}")
            lines.append(f"Total Pengeluaran: Rp {total_expense:,.0f}")
        else:
            lines.append(f"📝 Belum ada pengeluaran hari ini")
        lines.append(f"---")

        # Final ringkasan
        lines.append(f"📝 RINGKASAN HARIAN")
        lines.append(f"{date_str} :")
        lines.append(f"Grand Total Revenue (Net): Rp {total_revenue:,.0f}")
        lines.append(f"Total Penjualan Bruto: Rp {total_gross:,.0f}")
        lines.append(f"Total Potongan: Rp {total_discount:,.0f}")
        lines.append(f"Total Pengeluaran: Rp {total_expense:,.0f}")
        lines.append(f"Kas Bersih (Net): Rp {net_balance:,.0f}")
        lines.append(f"Total Produk Terjual: {total_items_sold}")

        # Active shift realtime KPI
        active_shifts = [s for s in shift_rows if s.get("status") == "AKTIF"]
        if active_shifts:
            lines.append(f"")
            lines.append(f"📡 REALTIME KPI (Shift Aktif):")
            for s in active_shifts[:2]:
                lines.append(
                    f"  {s.get('shift_name','?')}: "
                    f"{int(s.get('order_count') or 0)} order, "
                    f"Rp {float(s.get('daily_collected') or float(s.get('shift_collected') or 0)):,.0f}"
                )

        text = "\n".join(lines)

        # Split if too long
        if len(text) <= 4000:
            await _reply_msg(update, context, text, reply_markup=_reply_keyboard())
        else:
            chunks = [text[i:i+4000] for i in range(0, len(text), 4000)]
            for i, chunk in enumerate(chunks):
                await _reply_msg(update, context, chunk,
                                 reply_markup=_reply_keyboard() if i == len(chunks)-1 else None)

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
            "🔥 *Top Produk Hari Ini*\n" + "\n".join(lines),
            parse_mode="Markdown",
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
            f"⚠️ *Stok Menipis ({len(alerts)} item)*\n{text}",
            parse_mode="Markdown",
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
            "🕒 *Absensi Hari Ini*\n" + "\n".join(lines),
            parse_mode="Markdown",
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
            "📅 *Booking Aktif*\n" + "\n".join(lines),
            parse_mode="Markdown",
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

        await _reply_msg(update, context, briefing, reply_markup=_reply_keyboard())
    except Exception as e:
        logger.exception("briefing_hari_ini failed")
        await _reply_msg(update, context, f"Gagal generate briefing: {e}")


# ===================================================================
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
        "help": cmd_help,
    }

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

        await _reply_msg(update, context, reply, reply_markup=_reply_keyboard())

    except Exception as e:
        logger.exception("Photo handling failed")
        await _reply_msg(update, context, 
            f"Gagal memproses gambar: {e}\n\nCoba kirim ulang atau gunakan teks.",
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
            await _reply_msg(update, context, reply, reply_markup=_reply_keyboard())
        else:
            chunks = [reply[i:i + 4000] for i in range(0, len(reply), 4000)]
            for i, chunk in enumerate(chunks):
                await _reply_msg(update, context, chunk, reply_markup=_reply_keyboard() if i == len(chunks) - 1 else None)

    except Exception as e:
        logger.exception("free-text yumi-ai failed")
        await _reply_msg(update, context, 
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
    app.add_handler(CommandHandler("kpi_hari_ini", cmd_ringkasan_hari_ini))
    app.add_handler(CommandHandler("top_produk", cmd_top_produk))
    app.add_handler(CommandHandler("stok_menipis", cmd_stok_menipis))
    app.add_handler(CommandHandler("absen_hari_ini", cmd_absen_hari_ini))
    app.add_handler(CommandHandler("booking_aktif", cmd_booking_aktif))
    app.add_handler(CommandHandler("briefing_hari_ini", cmd_briefing_hari_ini))

    # Alias
    app.add_handler(CommandHandler("kpi_hari_ini", cmd_ringkasan_hari_ini))  # backward compat

    # Callbacks (inline keyboard)
    app.add_handler(CallbackQueryHandler(on_callback))

    # Message handlers (order matters — photo before text)
    app.add_handler(MessageHandler(filters.PHOTO, on_photo))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, on_text))

    logger.info("Starting Yumi AI bot with full feature parity...")
    app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
