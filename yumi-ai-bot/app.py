import os
import json
import logging
from datetime import datetime, timedelta, timezone
from collections import Counter

import httpx
from dotenv import load_dotenv
from telegram import Update
from telegram.ext import Application, CommandHandler, MessageHandler, ContextTypes, filters

load_dotenv()

BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")
ALLOWED_USERS = {
    int(x.strip())
    for x in os.getenv("ALLOWED_USERS", "").split(",")
    if x.strip().isdigit()
}
# Default chat_id for /send-report (group or user). Set to group ID (negative number for groups).
TELEGRAM_REPORT_CHAT_ID = os.getenv("TELEGRAM_REPORT_CHAT_ID", "")

logging.basicConfig(
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger("yumi-ai-bot")

WIB = timezone(timedelta(hours=7))


def _headers():
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
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


async def _ask_yumi_ai(message: str, context_hint: str = "") -> str:
    """Forward free-text chat to Supabase Edge Function yumi-ai."""
    url = f"{SUPABASE_URL}/functions/v1/yumi-ai"
    payload = {
        "action": "yumiChat",
        "message": message,
        "history": [],
        "contextHint": context_hint,
        "images": [],
    }
    async with httpx.AsyncClient(timeout=45) as client:
        resp = await client.post(
            url,
            headers={**_headers(), "Content-Type": "application/json"},
            json=payload,
        )
        resp.raise_for_status()
        data = resp.json()
        return str(data.get("content") or "Maaf, Yumi belum bisa menjawab sekarang.")


def _now_wib() -> datetime:
    return datetime.now(WIB)


def _start_of_day_ms(dt: datetime) -> int:
    sod = dt.replace(hour=0, minute=0, second=0, microsecond=0)
    return int(sod.timestamp() * 1000)


def _today_wib_str() -> str:
    return _now_wib().strftime("%Y-%m-%d")


async def _generate_business_briefing(date_str: str) -> str:
    url = f"{SUPABASE_URL}/functions/v1/yumi-ai"
    payload = {
        "action": "generateBusinessBriefing",
        "localHour": _now_wib().hour,
        "context": f"Tanggal briefing: {date_str}",
    }
    async with httpx.AsyncClient(timeout=45) as client:
        resp = await client.post(
            url,
            headers={**_headers(), "Content-Type": "application/json"},
            json=payload,
        )
        resp.raise_for_status()
        data = resp.json()
        return str(data.get("content") or "Briefing belum tersedia.")


async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not _is_allowed(update):
        await update.message.reply_text("Maaf, Anda tidak diizinkan menggunakan bot ini.")
        return
    await update.message.reply_text(
        "Halo! Saya *Yumi AI* 🤖\n"
        "Saya bisa bantu baca data YumiPOS (penjualan, stok, absensi, booking).\n\n"
        "Perintah:\n"
        "- /kpi_hari_ini\n"
        "- /top_produk\n"
        "- /stok_menipis\n"
        "- /absen_hari_ini\n"
        "- /booking_aktif\n"
        "- /briefing_hari_ini\n"
        "- /help",
        parse_mode="Markdown",
    )


async def cmd_help(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not _is_allowed(update):
        await update.message.reply_text("Unauthorized")
        return
    await update.message.reply_text(
        "Contoh pertanyaan bebas juga bisa: \n"
        "- omzet hari ini\n"
        "- produk terlaris\n"
        "- stok kritis\n"
        "- absensi hari ini\n"
        "- booking aktif\n"
        "- briefing bisnis hari ini"
    )


async def cmd_kpi_hari_ini(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not _is_allowed(update):
        await update.message.reply_text("Unauthorized")
        return
    try:
        now = _now_wib()
        start_ms = _start_of_day_ms(now)

        # 1) KPI berbasis order selesai hari ini
        q_orders = (
            "select=totalAmount,status,paymentMethod,_creationTime"
            f"&status=eq.completed&_creationTime=gte.{start_ms}"
        )
        orders = await _fetch("pos_orders", q_orders)
        order_total = sum(float(o.get("totalAmount") or 0) for o in orders)
        order_count = len(orders)
        pm = Counter((o.get("paymentMethod") or "unknown") for o in orders)
        pm_text = "\n".join([f"- {k}: {v}" for k, v in pm.most_common(5)]) or "- belum ada"

        # 2) KPI berbasis transaksi keuangan income (lebih realtime)
        q_income = (
            "select=amount,date,description"
            f"&type=eq.income&date=gte.{start_ms}"
        )
        income_rows = await _fetch("pos_financial_transactions", q_income)
        income_total = sum(float(x.get("amount") or 0) for x in income_rows)

        # 3) Ambil shift aktif dari report (sumber yang dipakai dashboard)
        active_shift_rows = await _fetch(
            "pos_shift_reports",
            "select=shift_name,status,order_count,daily_collected,shift_collected,total_revenue,start_time&status=eq.AKTIF&order=start_time.desc&limit=1",
        )
        active_shift = active_shift_rows[0] if active_shift_rows else None
        daily_collected = float((active_shift or {}).get("daily_collected") or 0)
        shift_collected = float((active_shift or {}).get("shift_collected") or 0)

        # Pilih angka omzet paling realtime
        realtime_total = max(order_total, income_total, daily_collected, shift_collected)

        shift_text = "- tidak ada shift aktif"
        if active_shift:
            shift_text = (
                f"- {active_shift.get('shift_name','Shift')} ({active_shift.get('status','-')})"
                f" | order: {int(active_shift.get('order_count') or 0)}"
                f" | daily_collected: Rp {daily_collected:,.0f}"
            )

        await update.message.reply_text(
            f"📊 *KPI Hari Ini (WIB)*\n"
            f"- Order selesai hari ini: *{order_count}*\n"
            f"- Omzet dari order selesai: *Rp {order_total:,.0f}*\n"
            f"- Income transaksi (realtime): *Rp {income_total:,.0f}*\n"
            f"- Omzet realtime (dipakai): *Rp {realtime_total:,.0f}*\n\n"
            f"Shift aktif:\n{shift_text}\n\n"
            f"Pembayaran teratas (order selesai):\n{pm_text}",
            parse_mode="Markdown",
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

        lines = []
        for i, (name, qty) in enumerate(top, start=1):
            lines.append(f"{i}. {name} — {qty:.0f} pcs (Rp {omzet[name]:,.0f})")

        await update.message.reply_text(
            "🔥 *Top Produk Hari Ini*\n" + "\n".join(lines),
            parse_mode="Markdown",
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
            await update.message.reply_text("✅ Tidak ada stok menipis saat ini.")
            return

        alerts.sort(key=lambda x: (x[1] - x[2]))
        text = "\n".join([f"- {n}: {q:g}/{t:g} {u}" for n, q, t, u in alerts[:30]])
        await update.message.reply_text(f"⚠️ *Stok Menipis*\n{text}", parse_mode="Markdown")
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
            await update.message.reply_text("Belum ada data absensi hari ini.")
            return

        lines = []
        for r in rows[:25]:
            ts = int(r.get("timestamp") or 0)
            dt = datetime.fromtimestamp(ts / 1000, tz=WIB).strftime("%H:%M")
            lines.append(f"- {dt} | {r.get('userName','Unknown')} | {r.get('type','-')} | {r.get('shiftName') or '-'}")

        await update.message.reply_text("🕒 *Absensi Hari Ini*\n" + "\n".join(lines), parse_mode="Markdown")
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
            await update.message.reply_text("Tidak ada booking aktif saat ini.")
            return

        lines = []
        for r in active[:15]:
            lines.append(
                f"- {r.get('bookingCode','-')} | {r.get('customerName','-')} | {r.get('bookingDate','-')} | "
                f"{r.get('guestCount',0)} org | {r.get('bookingStatus','-')} | Rp {float(r.get('totalAmount') or 0):,.0f}"
            )

        await update.message.reply_text("📅 *Booking Aktif*\n" + "\n".join(lines), parse_mode="Markdown")
    except Exception as e:
        logger.exception("booking_aktif failed")
        await update.message.reply_text(f"Gagal ambil booking: {e}")


async def cmd_briefing_hari_ini(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not _is_allowed(update):
        await update.message.reply_text("Unauthorized")
        return
    try:
        date_str = _today_wib_str()
        briefing = await _generate_business_briefing(date_str)
        await update.message.reply_text(briefing)
    except Exception as e:
        logger.exception("briefing_hari_ini failed")
        await update.message.reply_text(f"Gagal generate briefing: {e}")


async def on_text(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not _is_allowed(update):
        await update.message.reply_text("Unauthorized")
        return

    text = (update.message.text or "").lower().strip()

    if any(k in text for k in ["omzet", "kpi", "penjualan", "revenue"]):
        await cmd_kpi_hari_ini(update, context)
        return
    if any(k in text for k in ["top produk", "terlaris", "best seller"]):
        await cmd_top_produk(update, context)
        return
    if any(k in text for k in ["stok", "menipis", "habis", "inventory"]):
        await cmd_stok_menipis(update, context)
        return
    if any(k in text for k in ["absen", "attendance", "clock in", "clock out"]):
        await cmd_absen_hari_ini(update, context)
        return
    if any(k in text for k in ["booking", "reservasi"]):
        await cmd_booking_aktif(update, context)
        return
    if any(k in text for k in ["briefing", "ringkasan bisnis", "insight hari ini"]):
        await cmd_briefing_hari_ini(update, context)
        return

    try:
        context_hint = (
            "Konteks: kamu adalah Yumi AI untuk YumiPOS (djiwatentramapp/pos.yumme.id). "
            "Jika user tanya data operasional, berikan jawaban ringkas, actionable, dan bahasa Indonesia."
        )
        ai_reply = await _ask_yumi_ai(text, context_hint=context_hint)
        await update.message.reply_text(ai_reply)
    except Exception as e:
        logger.exception("free-text yumi-ai failed")
        await update.message.reply_text(
            "Aku siap bantu 📌\n"
            "Coba: *omzet hari ini*, *top produk*, *stok menipis*, *absensi hari ini*, atau *booking aktif*.\n"
            f"(fallback error: {e})",
            parse_mode="Markdown"
        )


async def _handle_send_report(request):
    """POST /send-report  { "text": "...", "chat_id"?: 12345 }"""
    import json as _json
    from aiohttp import web

    cors_headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
    }

    if request.method == "OPTIONS":
        return web.Response(status=204, headers=cors_headers)

    try:
        body = _json.loads(await request.read())
    except Exception:
        return web.json_response({"ok": False, "error": "invalid json"}, status=400, headers=cors_headers)

    text = str(body.get("text", "")).strip()
    if not text:
        return web.json_response({"ok": False, "error": "text is required"}, status=400, headers=cors_headers)

    chat_id = body.get("chat_id")
    if not chat_id:
        # Prefer TELEGRAM_REPORT_CHAT_ID (group), fall back to first ALLOWED_USER
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


def main():
    if not BOT_TOKEN:
        raise RuntimeError("TELEGRAM_BOT_TOKEN belum di-set")
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise RuntimeError("SUPABASE_URL / SUPABASE_KEY belum di-set")

    async def _post_init(application: Application):
        await _start_http_server(application, port=8001)

    app = Application.builder().token(BOT_TOKEN).post_init(_post_init).build()

    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(CommandHandler("help", cmd_help))
    app.add_handler(CommandHandler("kpi_hari_ini", cmd_kpi_hari_ini))
    app.add_handler(CommandHandler("top_produk", cmd_top_produk))
    app.add_handler(CommandHandler("stok_menipis", cmd_stok_menipis))
    app.add_handler(CommandHandler("absen_hari_ini", cmd_absen_hari_ini))
    app.add_handler(CommandHandler("booking_aktif", cmd_booking_aktif))
    app.add_handler(CommandHandler("briefing_hari_ini", cmd_briefing_hari_ini))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, on_text))

    logger.info("Starting Yumi AI bot...")
    app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
