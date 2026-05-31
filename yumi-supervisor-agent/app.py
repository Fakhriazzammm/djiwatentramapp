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
TRANSACTION_GROUP_ID = int(os.getenv("TRANSACTION_GROUP_ID", "-5044633519"))

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

    # Auto selesai setelah 30 menit (1800 detik)
    order["auto_selesai_task"] = asyncio.create_task(_auto_selesai(key, 1800))

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
                                      guest_count=None, notes="", discount_amount=0.0, voucher_id=None, free_refill=None):
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
        _active_orders[key]["auto_dibuat_task"] = asyncio.create_task(_auto_dibuat(key, 30))
        await _insert_order_status(key, _active_orders[key])
        logger.info("Barista notification sent for %s (%d beverages)", order_no, len(bev_items))
    except Exception as e:
        logger.error("send_barista_notification failed for %s: %s", order_no, e)

async def _send_kitchen_notification(app, order_no: str, customer: str, order_type: str, food_items: list[dict], ts_ms: int, struk_line=None,
                                      guest_count=None, notes="", discount_amount=0.0, voucher_id=None, free_refill=None):
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
        _active_orders[key]["auto_dibuat_task"] = asyncio.create_task(_auto_dibuat(key, 30))
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

_CURSOR_FILE = "/tmp/yumi_supervisor_cursor.txt"

def _load_supervisor_cursor() -> tuple[int, set[str]]:
    """Load last check timestamp and reported order numbers from file."""
    try:
        with open(_CURSOR_FILE) as f:
            lines = [l.strip() for l in f if l.strip()]
        if lines:
            ts = int(lines[0])
            nos = set(lines[1:])
            return ts, nos
    except (FileNotFoundError, ValueError, IndexError):
        pass
    # Default: look back 24 hours on first run
    ts = int((_now_wib() - timedelta(hours=24)).timestamp() * 1000)
    return ts, set()

def _save_supervisor_cursor(ts: int, nos: set[str]):
    """Persist cursor and reported order numbers."""
    with open(_CURSOR_FILE, "w") as f:
        f.write(f"{ts}\n")
        for no in sorted(nos):
            f.write(f"{no}\n")

_last_order_check_ms, _reported_order_nos = _load_supervisor_cursor()

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

# ── Transaction notification to group ──

async def _send_transaction_notification(app, order_no: str, customer: str, totalAmount: float,
                                          payment_method: str, ts_ms: int, struk_line: str | None,
                                          items: list[dict], guest_count=None, notes="",
                                          discount_amount=0.0, voucher_id=None, free_refill=None):
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
        "────────────",
        f"🆔 {order_no}",
        f"💰 Rp{totalAmount:,.0f} — {payment_method.upper() if payment_method else '-'}",
    ])
    for p in promo_parts:
        lines.append(f"🏷️ {p}")

    customer_line = f"👤 {customer}"
    if guest_count and guest_count > 0:
        customer_line += f" — {int(guest_count)} orang"
    lines.append(customer_line)
    lines.append(f"👥 Kasir: {cashier}")
    lines.extend(team_lines)

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

async def _check_new_orders(app):
    global _last_order_check_ms, _reported_order_nos
    now_ms = int(_now_wib().timestamp() * 1000)
    # min(cursor, now-10min) → backfill: pakai cursor (24h), normal: lookback 10m dari now
    scan_from = min(_last_order_check_ms, max(0, now_ms - _LOOKBACK_MS))

    try:
        rows = await _fetch(
            "pos_orders",
            "select=orderNumber,totalAmount,paymentMethod,createdAt,items,customerName,orderType,_creationTime,daily_receipt_no,receipt_kind,guestCount,notes,voucherId,discountAmount,freeRefillSelected"
            "&status=in.(completed,paid)"
            f"&_creationTime=gt.{scan_from}"
            f"&_creationTime=lte.{now_ms}"
            "&order=_creationTime.asc&limit=50",
        )
    except Exception as e:
        logger.error("check_new_orders fetch failed: %s", e)
        return

    if not rows:
        # Advance cursor to now so we don't re-scan stale window
        _last_order_check_ms = now_ms
        _save_supervisor_cursor(_last_order_check_ms, _reported_order_nos)
        return

    max_creation_time = _last_order_check_ms

    for row in rows:
        order_no = row.get("orderNumber", "???")
        ts = int(float(row.get("_creationTime") or 0))
        if ts > max_creation_time:
            max_creation_time = ts
        # ⛔ Skip order yang sudah pernah dikirim (dedup by order number)
        if order_no in _reported_order_nos:
            continue
        customer = row.get("customerName") or "Pelanggan"
        order_type = row.get("orderType") or "dine_in"
        items = row.get("items") or []
        total = row.get("totalAmount") or 0

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

        # 🛡 Skip order with empty/incomplete items (JSONB race condition)
        # Order akan di-retry di poll berikutnya (10 menit lookback window)
        if not items or not any(i.get("productId") for i in items):
            logger.warning("Order %s skipped — items empty/incomplete (will retry in next poll)", order_no)
            continue

        daily_no = row.get("daily_receipt_no")
        receipt_kind = row.get("receipt_kind")
        receipt_kind_labels = {"dine_in": "DINE IN", "takeaway": "TAKEAWAY", "online": "ONLINE"}
        kind_label = receipt_kind_labels.get(receipt_kind) if receipt_kind else None
        if daily_no and kind_label:
            if receipt_kind == "online" and order_type not in ("online", "dine_in", "takeaway"):
                sub = order_type.replace("_", " ").title()
                struk_line = f"STRUK NO. {daily_no} - {kind_label} ({sub})"
            else:
                struk_line = f"STRUK NO. {daily_no} - {kind_label}"
        else:
            struk_line = None

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

        # ── Kitchen notification (priority) ──
        food_items = await _get_food_items(items)
        bev_items = await _get_beverage_items(items)
        logger.info("DEBUG classification for %s: food=%d bev=%d (of %d total items)",
                     order_no, len(food_items), len(bev_items), len(items) if items else 0)

        # Kirim kitchen + barista paralel per order
        tasks = []
        if food_items:
            tasks.append(_send_kitchen_notification(app, order_no, customer, order_type, food_items, ts, struk_line, guest_count, notes, discount_amount, voucher_id, free_refill))
        if bev_items:
            tasks.append(_send_barista_notification(app, order_no, customer, order_type, bev_items, ts, struk_line, guest_count, notes, discount_amount, voucher_id, free_refill))

        if tasks:
            await asyncio.gather(*tasks)
            await asyncio.sleep(0.3)  # small gap between orders

        # ── Transaction notification ──
        payment = row.get("paymentMethod") or "-"
        await _send_transaction_notification(app, order_no, customer, total, payment, ts, struk_line, items, guest_count, notes, discount_amount, voucher_id, free_refill)

        _reported_order_nos.add(order_no)

    _last_order_check_ms = max_creation_time
    _save_supervisor_cursor(_last_order_check_ms, _reported_order_nos)

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

    # Restore active orders from Supabase (persistent across restarts)
    await _load_active_orders(app.bot)

    # First poll check (catch up with any orders since start)
    await _check_new_orders(app)

    # Background polling every 5s
    async def _poll_loop():
        while True:
            await asyncio.sleep(5)
            await _check_new_orders(app)

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
    app.add_handler(CallbackQueryHandler(_handle_callback, pattern=r"^(dibuat|selesai)\|"))
    app.run_polling(timeout=1, drop_pending_updates=True)


if __name__ == "__main__":
    main()
