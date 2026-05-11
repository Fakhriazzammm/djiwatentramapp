import os
import logging
import asyncio
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
BARISTA_GROUP_ID = int(os.getenv("BARISTA_GROUP_ID", "-5182004468"))
KITCHEN_GROUP_ID = int(os.getenv("KITCHEN_GROUP_ID", "-5199093599"))

WIB = timezone(timedelta(hours=7))
logger = logging.getLogger(__name__)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)

# ── Global application reference ──────────────────────────────────────────

_app: Application | None = None

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

# ── Time helpers ─────────────────────────────────────────────────

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

async def _lazy_fetch_product_category(pid: str) -> str:
    try:
        rows = await _fetch("pos_products", f"select=categoryId&_id=eq.{pid}&limit=1")
        if not rows:
            return "other"
        cat_id = rows[0].get("categoryId", "")
        if cat_id in _BEVERAGE_CATEGORY_IDS:
            _BEVERAGE_PRODUCT_IDS.add(pid)
            return "beverage"
        elif cat_id in _FOOD_CATEGORY_IDS:
            _FOOD_PRODUCT_IDS.add(pid)
            return "food"
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

async def _update_order_status(key: str, status: str, by: str | None = None):
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
        await _patch("pos_order_status", f"order_no=eq.{order_no}&group_type=eq.{group_type}", payload)
        logger.info("[%s] Updated order_status to %s by %s", key, status, by)
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

async def _do_dibuat(key: str, by: str = "auto"):
    order = _active_orders.get(key)
    if not order or order["status"] != "new":
        return
    await _cancel_task(order, "auto_dibuat_task")

    order["status"] = "dibuat"
    order["dibuat_by"] = by
    order["dibuat_at"] = _now_wib()

    kb = InlineKeyboardMarkup([
        [InlineKeyboardButton("🏁 Selesai", callback_data=f"selesai|{key}")]
    ])
    text = _build_status_text(order)
    await _update_message(order, text, kb)
    await _update_order_status(key, "dibuat", by)
    logger.info("[%s] Status: DIBUAT oleh %s", key, by)

    # Auto selesai setelah 10 menit (600 detik)
    order["auto_selesai_task"] = asyncio.create_task(_auto_selesai(key, 600))

async def _do_selesai(key: str, by: str = "auto"):
    order = _active_orders.get(key)
    if not order or order["status"] == "selesai":
        return
    await _cancel_task(order, "auto_dibuat_task")
    await _cancel_task(order, "auto_selesai_task")

    order["status"] = "selesai"
    order["selesai_by"] = by
    order["selesai_at"] = _now_wib()

    text = _build_status_text(order)
    await _update_message(order, text, None)
    await _update_order_status(key, "selesai", by)
    logger.info("[%s] Status: SELESAI oleh %s", key, by)

    # Bersihkan setelah 30 menit agar dict tidak membesar
    asyncio.create_task(_cleanup_order(key, 1800))

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

# ── Notifications with inline keyboard ───────────────────────────

async def _send_barista_notification(app, order_no: str, customer: str, order_type: str, bev_items: list[dict], ts_ms: int, struk_line=None):
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

    base_text = "\n".join([
        f"☕ PESANAN BARU — 🕐 {_format_time_hm(ts_ms)}",
        "────────────",
        f"🆔 {order_no}",
    ])
    if struk_line:
        base_text += f"\n📍 {struk_line}"
    base_text += "\n".join([
        "",
        f"{type_label}",
        f"👤 {customer}",
        "",
        "Minuman:",
        *item_lines,
        "────────────",
        "⏳ Mohon segera dibuat!",
        "",
        "Tekan tombol untuk memproses pesanan",
    ])

    kb = InlineKeyboardMarkup([
        [
            InlineKeyboardButton("✅ Dibuat", callback_data=f"dibuat|{order_no}|barista"),
            InlineKeyboardButton("🏁 Selesai", callback_data=f"selesai|{order_no}|barista"),
        ]
    ])

    try:
        msg = await app.bot.send_message(chat_id=BARISTA_GROUP_ID, text=base_text, reply_markup=kb)
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
        _active_orders[key]["auto_dibuat_task"] = asyncio.create_task(_auto_dibuat(key, 20))
        await _insert_order_status(key, _active_orders[key])
        logger.info("Barista notification sent for %s (%d beverages)", order_no, len(bev_items))
    except Exception as e:
        logger.error("send_barista_notification failed for %s: %s", order_no, e)

async def _send_kitchen_notification(app, order_no: str, customer: str, order_type: str, food_items: list[dict], ts_ms: int, struk_line=None):
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

    base_text = "\n".join([
        f"🍳 PESANAN BARU — 🕐 {_format_time_hm(ts_ms)}",
        "────────────",
        f"🆔 {order_no}",
    ])
    if struk_line:
        base_text += f"\n📍 {struk_line}"
    base_text += "\n".join([
        "",
        f"{type_label}",
        f"👤 {customer}",
        "",
        "Makanan:",
        *item_lines,
        "────────────",
        "⏳ Mohon segera dibuat!",
        "",
        "Tekan tombol untuk memproses pesanan",
    ])

    kb = InlineKeyboardMarkup([
        [
            InlineKeyboardButton("✅ Dibuat", callback_data=f"dibuat|{order_no}|kitchen"),
            InlineKeyboardButton("🏁 Selesai", callback_data=f"selesai|{order_no}|kitchen"),
        ]
    ])

    try:
        msg = await app.bot.send_message(chat_id=KITCHEN_GROUP_ID, text=base_text, reply_markup=kb)
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
        _active_orders[key]["auto_dibuat_task"] = asyncio.create_task(_auto_dibuat(key, 20))
        await _insert_order_status(key, _active_orders[key])
        logger.info("Kitchen notification sent for %s (%d food items)", order_no, len(food_items))
    except Exception as e:
        logger.error("send_kitchen_notification failed for %s: %s", order_no, e)

# ── Callback handler ─────────────────────────────────────────────

async def _handle_callback(update: Update, context):
    query = update.callback_query
    await query.answer()

    data = query.data  # "dibuat|ORD-123|barista" or "selesai|ORD-123|kitchen"
    try:
        action, order_no, group_type = data.split("|")
        key = f"{order_no}|{group_type}"
        user = query.from_user.username or query.from_user.first_name or "Staff"

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
            await _do_dibuat(key, by=user)
        elif action == "selesai":
            await _do_selesai(key, by=user)
    except Exception as e:
        logger.error("Callback error for data=%s: %s", data, e)

# ── Order polling ────────────────────────────────────────────────

_last_order_check_ms = int(_now_wib().timestamp() * 1000)
_reported_order_nos: set[str] = set()

async def _check_new_orders(app):
    global _last_order_check_ms, _reported_order_nos
    now_ms = int(_now_wib().timestamp() * 1000)

    try:
        rows = await _fetch(
            "pos_orders",
            "select=orderNumber,totalAmount,paymentMethod,createdAt,items,customerName,orderType,_creationTime,daily_receipt_no,receipt_kind"
            "&status=in.(completed,paid)"
            f"&_creationTime=gt.{_last_order_check_ms}"
            f"&_creationTime=lte.{now_ms}"
            "&order=_creationTime.asc&limit=20",
        )
    except Exception as e:
        logger.error("check_new_orders fetch failed: %s", e)
        return

    for row in rows:
        order_no = row.get("orderNumber", "???")
        ts = int(float(row.get("_creationTime") or 0))
        customer = row.get("customerName") or "Pelanggan"
        order_type = row.get("orderType") or "dine_in"
        items = row.get("items") or []
        total = row.get("totalAmount") or 0

        daily_no = row.get("daily_receipt_no")
        receipt_kind = row.get("receipt_kind")
        receipt_labels = {"dine_in": "Dine In", "takeaway": "Takeaway", "online": "Online"}
        receipt_label = receipt_labels.get(receipt_kind) if receipt_kind else None
        struk_line = f"STRUK {receipt_label} No.{daily_no}" if (daily_no and receipt_label) else None

        # Cek ulang nama customer dari items jika kosong
        if customer in ("", "Pelanggan") and items:
            for i in items:
                if i.get("customerName"):
                    customer = i["customerName"]
                    break

        # ── Barista notification ──
        bev_items = await _get_beverage_items(items)
        if bev_items:
            await _send_barista_notification(app, order_no, customer, order_type, bev_items, ts, struk_line)
            await asyncio.sleep(0.3)

        # ── Kitchen notification ──
        food_items = await _get_food_items(items)
        if food_items:
            await _send_kitchen_notification(app, order_no, customer, order_type, food_items, ts, struk_line)
            await asyncio.sleep(0.3)

        _reported_order_nos.add(order_no)

    _last_order_check_ms = now_ms

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

    await _build_beverage_lookup()
    await _build_food_lookup()

    # Restore active orders from Supabase (persistent across restarts)
    await _load_active_orders(app.bot)

    # First poll check (catch up with any orders since start)
    await _check_new_orders(app)

    # Background polling every 30s
    async def _poll_loop():
        while True:
            await asyncio.sleep(30)
            await _check_new_orders(app)

    app.create_task(_poll_loop())
    logger.info("Polling loop started (30s interval)")


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
    app.add_handler(CallbackQueryHandler(_handle_callback, pattern=r"^(dibuat|selesai)\|"))
    app.run_polling(timeout=1, drop_pending_updates=True)


if __name__ == "__main__":
    main()
