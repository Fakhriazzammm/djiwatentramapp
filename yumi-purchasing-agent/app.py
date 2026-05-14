"""
Yumi Purchasing Agent — AI-Powered Inventory & Marketlist Telegram Bot.

Handle: marketlist, stock check, restock, supplier lookup, AI chat.
Terintegrasi dengan Yumi Finance Agent via shared Supabase DB.
"""
import asyncio
import logging
import os
import sys
from datetime import datetime, timezone, timedelta
import math
import re

import httpx
from dotenv import load_dotenv
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    Application, ApplicationBuilder, CommandHandler,
    MessageHandler, CallbackQueryHandler, ContextTypes, filters,
)

from hermes_adapter import (
    TelegramContext,
    audit_event,
    build_request,
    project_scope_summary,
    validate_response,
)

sys.path.insert(0, os.path.dirname(__file__))

from sumopod_client import SumoPodClient
from purchasing_orchestrator import PurchasingOrchestrator, PurchasingResult
from marketlist import (
    generate_marketlist,
    ai_categorize_suppliers,
    process_input_marketlist,
    format_merchant_marketlist,
    recalculate_with_qty,
    remove_item_and_reformat,
)
from inventory import InventoryManager
from callback_manager import (
    build_marketlist_keyboard,
    handle_marketlist_callback,
    handle_marketlist_text_input,
)
from rapidfuzz import fuzz, process as fuzz_process
from learning_memory import update_learning_entry

load_dotenv()

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
STOCK_GROUP_ID = int(os.getenv("STOCK_GROUP_ID", "-5070733215"))
SUMOPOD_API_KEY = os.getenv("SUMOPOD_API_KEY", "")

if not all([TELEGRAM_BOT_TOKEN, SUPABASE_URL, SUPABASE_KEY]):
    raise ValueError("TELEGRAM_BOT_TOKEN, SUPABASE_URL, dan SUPABASE_KEY wajib diisi di .env")

logging.basicConfig(
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger("yumi-purchasing")

inventory = InventoryManager(SUPABASE_URL, SUPABASE_KEY, SUPABASE_SERVICE_ROLE_KEY)
orchestrator = PurchasingOrchestrator(SUMOPOD_API_KEY)

# ── Supplier Manager ────────────────────────────────────────────
class SupplierManager:
    def __init__(self):
        self._cache = None
        self._categories = set()

    async def _load(self):
        if self._cache is not None:
            return
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.get(
                    f"{SUPABASE_URL}/rest/v1/pos_inventory_stores?select=*&isActive=eq.true&order=name",
                    headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"},
                )
                resp.raise_for_status()
                data = resp.json()
            self._cache = {}
            for s in data:
                store_id = s.get("_id", "").strip()
                name = s.get("name", "").strip()
                if name:
                    self._cache[name.lower()] = s
                    # Also index by ID for preferredStoreId lookups
                    if store_id:
                        self._cache[store_id] = s
                    cat = (s.get("type") or "").strip()
                    if cat:
                        self._categories.add(cat.lower())
            logger.info("Supplier DB loaded: %d suppliers from pos_inventory_stores, %d categories",
                        len(self._cache), len(self._categories))
        except Exception as e:
            logger.warning("Supplier load from pos_inventory_stores failed: %s", e)
            self._cache = {}

    async def search(self, query: str) -> list[dict]:
        await self._load()
        if not self._cache:
            return []
        q = query.lower().strip()
        results = []
        seen = set()
        for key, s in self._cache.items():
            name = s.get("name", "").lower()
            cat = (s.get("type") or "").lower()
            if q in name or q in cat:
                sid = s.get("_id", "")
                if sid not in seen:
                    seen.add(sid)
                    results.append({
                        "_id": s.get("_id", ""),
                        "name": s.get("name", ""),
                        "category": s.get("type", ""),
                        "grade": s.get("grade", ""),
                        "phone": s.get("phone", ""),
                        "address": s.get("address", ""),
                        "notes": s.get("notes", ""),
                    })
        return results

    async def get_all_suppliers(self) -> list[dict]:
        """Return all suppliers with _id, name, type, phone for merchant grouping."""
        await self._load()
        if not self._cache:
            return []
        seen = set()
        results = []
        for s in self._cache.values():
            sid = s.get("_id", "")
            if sid and sid not in seen:
                seen.add(sid)
                results.append({
                    "_id": sid,
                    "name": s.get("name", ""),
                    "category": s.get("type", ""),
                    "phone": s.get("phone", ""),
                })
        return results

    async def get_categories(self) -> list[str]:
        await self._load()
        return sorted(self._categories)

    async def get_supplier_by_id(self, store_id: str) -> dict | None:
        """Lookup supplier by _id."""
        await self._load()
        if not self._cache:
            return None
        # Direct lookup by ID from cache
        s = self._cache.get(store_id) or self._cache.get(store_id.lower())
        if s:
            return {
                "_id": s.get("_id", ""),
                "name": s.get("name", ""),
                "phone": s.get("phone", ""),
                "category": s.get("type", ""),
            }
        # Fallback: search all
        for key, s in self._cache.items():
            if s.get("_id", "") == store_id:
                return {
                    "_id": s.get("_id", ""),
                    "name": s.get("name", ""),
                    "phone": s.get("phone", ""),
                    "category": s.get("type", ""),
                }
        return None

supplier = SupplierManager()

# ── Session storage for marketlist callbacks ────────────────────
marketlist_sessions: dict[str, dict] = {}

# ── Stock Reaction State ─────────────────────────────────────────
_stock_reaction_history: dict = {}
_stock_reaction_lock = asyncio.Lock()
STOCK_REACTION_EXPIRY = 300  # 5 menit

def _is_kitchen(name: str) -> bool:
    _NON_KITCHEN_KW = ["gas", "baterai", "kresek", "sedotan", "sendok garpu",
                       "botol 1", "ekonomi", "soklin", "lifebuoy", "cling", "bento tupai",
                       "paperbowl", "cup 12", "multi tisu", "tutup cup"]
    return not any(kw in name.lower() for kw in _NON_KITCHEN_KW)

# ── Keyboard ────────────────────────────────────────────────────
def _keyboard():
    return InlineKeyboardMarkup([
        [
            InlineKeyboardButton("🛒 Marketlist", callback_data="marketlist"),
            InlineKeyboardButton("⚠️ Stok Menipis", callback_data="low_stock"),
        ],
        [
            InlineKeyboardButton("📞 Supplier", callback_data="supplier"),
            InlineKeyboardButton("📦 Semua Stok", callback_data="all_stock"),
        ],
        [
            InlineKeyboardButton("💬 AI Chat", callback_data="ai_chat"),
            InlineKeyboardButton("ℹ️ Bantuan", callback_data="help"),
        ],
    ])

# ── Supabase fetch helper ───────────────────────────────────────
async def _fetch_fn(view: str, query: str = "select=*"):
    url = f"{SUPABASE_URL}/rest/v1/{view}?{query}"
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.get(url, headers={
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
        })
        resp.raise_for_status()
        return resp.json()

# ── Finance Integration ─────────────────────────────────────────
async def _get_finance_summary() -> dict | None:
    """Get finance summary for cross-referencing with inventory suggestions."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{SUPABASE_URL}/rest/v1/financial_transactions?select=amount,tx_type&order=tx_date.desc&limit=200",
                headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"},
            )
            resp.raise_for_status()
            rows = resp.json()
        income = sum(float(r["amount"]) for r in rows if r.get("tx_type") == "income")
        expense = sum(float(r["amount"]) for r in rows if r.get("tx_type") == "expense")
        return {"income": income, "expense": expense, "balance": income - expense}
    except Exception:
        return None

# ── Commands ────────────────────────────────────────────────────

async def cmd_start(update: Update, _context):
    await update.message.reply_text(
        "🛒 *Yumi Purchasing* — AI Inventory Assistant\n\n"
        "Aku bantu urusan inventory & belanja:\n"
        "• 🛒 Marketlist otomatis + AI tag supplier\n"
        "• 📦 Cek stok & restok\n"
        "• 📞 Cari supplier\n"
        "• 💬 Tanya bebas (aku bisa reasoning!)\n\n"
        "Coba ketik bebas atau klik tombol 👇",
        reply_markup=_keyboard(),
        parse_mode="Markdown",
    )

async def cmd_supplier(update: Update, context):
    """Handle /supplier command."""
    args = context.args
    query = " ".join(args) if args else ""

    if not query:
        cats = await supplier.get_categories()
        cats_text = ", ".join(cats) if cats else "(belum ada)"
        await update.message.reply_text(
            f"📞 *Supplier Directory*\n\n"
            f"Kategori: {cats_text}\n\n"
            f"Pakai: `/supplier <nama/kategori>`\n"
            f"Contoh: `/supplier kopi`",
            parse_mode="Markdown",
        )
        return

    results = await supplier.search(query)
    if not results:
        await update.message.reply_text(
            f"🔍 Ga ada supplier \"{query}\".", reply_markup=_keyboard())
        return

    lines = [f"📋 *Supplier: {query}* ({len(results)}):\n"]
    for s in results[:10]:
        grade = s.get("grade", "")
        grade_str = f" ⭐{grade}" if grade else ""
        lines.append(f"*{s['name']}*{grade_str}")
        if s.get("category"):
            lines.append(f"  🏷️ {s['category']}")
        if s.get("phone"):
            lines.append(f"  📞 {s['phone']}")
        if s.get("address"):
            lines.append(f"  📍 {s['address']}")
        if s.get("notes"):
            lines.append(f"  📦 {s['notes']}")
        lines.append("")

    await update.message.reply_text(
        "\n".join(lines), parse_mode="Markdown", reply_markup=_keyboard())


# ── Hermes diagnostic commands ──────────────────────────────────


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
        "Hermes Purchasing scope\n"
        f"Profile: purchasing\n"
        f"Project: {scope['project_root']}\n"
        f"Mode: {scope['mode']}\n"
        "Batas: read-only diagnostic; tidak execute purchase/order/write action.",
        reply_markup=_keyboard(),
    )


async def cmd_hermes_test(update: Update, context: ContextTypes.DEFAULT_TYPE):
    request = build_request(
        profile_id="purchasing",
        message="purchasing adapter diagnostic",
        telegram=_telegram_context_from_update(update),
        can_write=False,
    )
    response = {"reply_text": "Hermes purchasing adapter OK", "actions": [], "metadata": {"profile_id": "purchasing"}}
    validate_response(response)
    audit_event({
        "event": "telegram_command",
        "profile_id": "purchasing",
        "mode": "read_only",
        "telegram": request["telegram"],
        "message": "telegram command /hermes_test",
        "actions": [],
    })
    await update.message.reply_text(response["reply_text"], reply_markup=_keyboard())


async def cmd_yumi(update: Update, context: ContextTypes.DEFAULT_TYPE):
    text = " ".join(context.args).strip()
    if not text:
        await update.message.reply_text("Pakai format: /yumi pertanyaan purchasing kamu", reply_markup=_keyboard())
        return
    request = build_request(
        profile_id="purchasing",
        message=text,
        telegram=_telegram_context_from_update(update),
        can_write=False,
    )
    response = {
        "reply_text": "Hermes purchasing read-only menerima request. Draft/action belanja belum dieksekusi; gunakan flow purchasing existing untuk action.",
        "actions": [],
        "metadata": {"profile_id": "purchasing"},
    }
    validate_response(response)
    audit_event({
        "event": "telegram_command",
        "profile_id": "purchasing",
        "mode": "read_only",
        "telegram": request["telegram"],
        "message": "telegram command /yumi",
        "input_preview": text[:160],
        "actions": [],
    })
    await update.message.reply_text(response["reply_text"], reply_markup=_keyboard())


# ── Message Handler ─────────────────────────────────────────────

def _can_respond(update: Update) -> bool:
    """Cek apakah bot boleh merespon — DM owner, grup marketlist, atau grup dengan @mention."""
    user = update.effective_user
    chat = update.effective_chat
    if not user or not chat:
        return False
    # DM owner
    if chat.type == "private":
        return user.id == 323151437
    # Marketlist group — auto-respond to all messages
    MARKETLIST_GROUP_ID = int(os.getenv("MARKETLIST_GROUP_ID", "0"))
    if MARKETLIST_GROUP_ID and chat.id == MARKETLIST_GROUP_ID:
        return True
    # Reply to bot or @mention
    msg = update.effective_message
    if not msg:
        return False
    if msg.reply_to_message and msg.reply_to_message.from_user and msg.reply_to_message.from_user.is_bot:
        return True
    message_text = msg.text or msg.caption or ""
    if "@YumiPurchasingBot".lower() in message_text.lower():
        return True
    return False


async def _parse_stock_reaction(text: str) -> dict | None:
    """Parse 🔴 or 🟡 reaction from user message.
    Returns {"type": "🔴"|"🟡", "items": [str, ...]} or None if no reaction."""
    text = text.strip()
    symbol = None
    if "🔴" in text:
        symbol = "🔴"
    elif "🟡" in text:
        symbol = "🟡"
    else:
        return None
    
    # Remove the symbol and clean
    rest = text.replace("🔴", "").replace("🟡", "").strip()
    if not rest:
        return None
    
    # Split by comma, newline, or bullet
    items = re.split(r'[,\n\r•\-\*]+', rest)
    items = [i.strip() for i in items if i.strip()]
    
    if not items:
        return None
    
    return {"type": symbol, "items": items}

async def handle_message(update: Update, context):
    if not _can_respond(update):
        return
    msg = update.effective_message
    if not msg or not msg.text:
        return
    text = msg.text.strip()
    if not text:
        await msg.reply_text("Ketik perintah atau tanya bebas.", reply_markup=_keyboard())
        return

    # ── Check for 🔴/🟡 stock reaction ──
    reaction = await _parse_stock_reaction(text)
    if reaction:
        await context.bot.send_chat_action(chat_id=update.effective_chat.id, action="typing")
        await _handle_stock_reaction(update, context, reaction)
        return

    await context.bot.send_chat_action(chat_id=update.effective_chat.id, action="typing")
    result = await orchestrator.orchestrate(text)

    # Check if it's a marketlist input (user posted a list starting with "market list" or "belanja list")
    if result.action == "marketlist_input":
        await _handle_marketlist_input(update, context, result.text or text)
        return

    await _execute_action(msg, result, is_callback=False)

async def _handle_marketlist_input(update: Update, context, text: str):
    """Handle user posting a marketlist text — parse, match, group, format, send with keyboard."""
    import uuid
    from datetime import datetime, timezone, timedelta

    try:
        sp_client = SumoPodClient(SUMOPOD_API_KEY)
        result = await process_input_marketlist(text, sp_client, inventory, supplier)

        if not result.get("success"):
            await update.message.reply_text(result.get("formatted_text", "❌ Gagal memproses marketlist."))
            return

        # Generate a unique entry_id for this session
        entry_id = result.get("entry_id") or str(uuid.uuid4())
        session_key = f"marketlist_{entry_id}"

        # Store session data
        unmatched_names = [
            e.get("input_name", e.get("name", "?"))
            for e in result.get("enriched", []) if not e.get("matched")
        ]
        user_id = str(update.effective_user.id) if update.effective_user else ""
        marketlist_sessions[session_key] = {
            "groups": result.get("groups", []),
            "grand_total": result.get("grand_total", 0),
            "items_count": result.get("items_count", 0),
            "entry_id": entry_id,
            "original_text": text,
            "unmatched_names": unmatched_names,
            "user_id": user_id,
            "timestamp": datetime.now(timezone(timedelta(hours=7))).isoformat(),
        }

        formatted = result.get("formatted_text", "")
        items_count = result.get("items_count", 0)
        keyboard = build_marketlist_keyboard(entry_id, items_count)

        await update.message.reply_text(
            formatted,
            reply_markup=keyboard,
            parse_mode="Markdown",
        )

        logger.info(
            "Marketlist processed: %d items, entry=%s",
            items_count, entry_id,
        )
    except Exception as e:
        logger.exception("Marketlist input processing failed")
        await update.message.reply_text(f"❌ Gagal memproses marketlist: {e}")

# ── Callback Handler ────────────────────────────────────────────

async def handle_callback(update: Update, context):
    query = update.callback_query
    await query.answer()
    data = query.data

    # Route marketlist callbacks (ml_ prefix) to callback_manager
    if data.startswith("ml_"):
        sp_client = SumoPodClient(SUMOPOD_API_KEY)
        await handle_marketlist_callback(
            update, context, marketlist_sessions,
            format_merchant_marketlist,
            recalculate_with_qty,
            remove_item_and_reformat,
            process_input_marketlist,
            sp_client, inventory, supplier,
        )
        return

    # Route undo callbacks
    if data.startswith("undo_"):
        ts_str = data.replace("undo_", "")
        await _handle_undo_callback(update, context, ts_str)
        return

    if data == "ai_chat":
        await query.edit_message_text(
            "💬 *AI Chat Mode*\n\n"
            "Tanya apa aja soal inventory! Contoh:\n"
            "• \"Supplier daging paling murah?\"\n"
            "• \"Apa yang harus direstok?\"\n"
            "• \"Kenapa kopi belanja terus?\"\n"
            "• \"Analisis marketlist minggu ini\"\n\n"
            "Ketik bebas aja, aku ngerti kok 😊",
            parse_mode="Markdown",
            reply_markup=_keyboard(),
        )
        return

    if data == "help":
        await query.edit_message_text(
            orchestrator._help_text(),
            parse_mode="Markdown",
            reply_markup=_keyboard(),
        )
        return

    # Map callback to text
    action_map = {
        "marketlist": "marketlist",
        "low_stock": "stok menipis",
        "supplier": "supplier",
        "all_stock": "semua stok",
    }
    text = action_map.get(data)
    if text:
        result = await orchestrator.orchestrate(text)
        await _execute_action(query, result, is_callback=True)
    else:
        await query.edit_message_text("❌ Aksi tidak dikenal.", reply_markup=_keyboard())

# ── Action Executor ─────────────────────────────────────────────

async def _execute_action(target, result: PurchasingResult, is_callback: bool = False):
    """Execute action dari orchestrator result."""
    send = target.edit_message_text if is_callback else target.reply_text
    reply = lambda msg, **kw: send(msg, reply_markup=_keyboard(), **kw)

    try:
        if result.action == "marketlist":
            sp_client = SumoPodClient(SUMOPOD_API_KEY)
            ml_text = await generate_marketlist(_fetch_fn, supplier, sp_client)
            await reply(ml_text)

        elif result.action == "low_stock":
            all_items = await inventory.get_all_inventory()
            low_items = []
            for r in all_items:
                qty = float(r.get("quantity") or 0)
                thresh = float(r.get("lowStockThreshold") or 0)
                name = r.get("ingredientName", "?")
                unit = (r.get("unit") or "").strip()
                if qty <= thresh and thresh > 0:
                    unit_s = f" {unit}" if unit else ""
                    low_items.append(f"• {name}: {qty:g}{unit_s} (min: {thresh:g}{unit_s})")

            if low_items:
                msg = "⚠️ *Stok Menipis:*\n\n" + "\n".join(low_items[:20])
            else:
                msg = "✅ Semua stok aman!"
            await reply(msg)

        elif result.action == "check_stock":
            if result.item:
                stock_text = await inventory.check_stock(result.item)
            else:
                all_items = await inventory.get_all_inventory()
                if not all_items:
                    stock_text = "📦 Inventory kosong."
                else:
                    lines = ["📦 *Semua Stok:*\n"]
                    for r in all_items[:30]:
                        name = r.get("ingredientName", "?")
                        qty = float(r.get("quantity") or 0)
                        thresh = float(r.get("lowStockThreshold") or 0)
                        unit = (r.get("unit") or "").strip()
                        unit_s = f" {unit}" if unit else ""
                        thresh_s = f" (min: {thresh:g}{unit_s})" if thresh > 0 else ""
                        lines.append(f"• {name}: {qty:g}{unit_s}{thresh_s}")
                    stock_text = "\n".join(lines)
            await reply(stock_text)

        elif result.action == "restock":
            await _handle_restock(target, result, is_callback)

        elif result.action == "supplier_search":
            if result.supplier_query:
                results = await supplier.search(result.supplier_query)
            elif result.item:
                results = await supplier.search(result.item)
            else:
                cats = await supplier.get_categories()
                cats_text = ", ".join(cats) if cats else "(belum ada)"
                await reply(f"📞 Kategori: {cats_text}\n\nPakai `/supplier <nama>`.")
                return

            if not results:
                await reply(f"🔍 Ga ada supplier \"{result.supplier_query or result.item}\".")
            else:
                lines = [f"📋 *Supplier* ({len(results)}):\n"]
                for s in results[:8]:
                    grade_str = f" ⭐{s['grade']}" if s.get("grade") else ""
                    phone_str = f" 📞{s['phone']}" if s.get("phone") else ""
                    lines.append(f"*{s['name']}*{grade_str} | {s['category']}{phone_str}")
                await reply("\n".join(lines))

        elif result.action == "chat" or result.action == "analyze":
            # AI response — enrich with finance context if relevant
            reply_text = result.text or "Maaf, aku lagi mikir nih 😅 Coba lagi ya."
            # Add budget context for analyze
            if result.action == "analyze":
                fin = await _get_finance_summary()
                if fin:
                    ctx = (f"\n\n💡 *Info Keuangan:*\n"
                           f"💰 Pemasukan: Rp{fin['income']:,.0f}\n"
                           f"💸 Pengeluaran: Rp{fin['expense']:,.0f}\n"
                           f"📊 Saldo: Rp{fin['balance']:,.0f}")
                    reply_text += ctx
            await reply(reply_text)

        elif result.action == "unknown":
            await reply(
                "🤔 Aku belum yakin maksudnya. Coba:\n"
                "• `marketlist` — daftar belanja\n"
                "• `stok menipis` — cek stok\n"
                "• `restok <nama> <qty> <unit> <harga>`\n"
                "• `/supplier <kategori>`\n"
                "• Atau tanya bebas!"
            )
        else:
            await reply(result.text or "✅ Siap!")

    except Exception as e:
        logger.exception("Action execution failed")
        err_msg = f"❌ Error: {e}"
        try:
            await reply(err_msg)
        except Exception:
            pass

async def _handle_restock(target, result: PurchasingResult, is_callback: bool):
    """Handle restock action."""
    send = target.edit_message_text if is_callback else target.reply_text
    reply = lambda msg, **kw: send(msg, reply_markup=_keyboard(), **kw)

    if not result.item or result.qty <= 0:
        await reply("Format: `restok <nama> <qty> <unit> <harga>`\nContoh: `restok gula 2 kg 25000`")
        return

    # Cari item di inventory
    matched, score = await inventory.fuzzy_match_item(result.item)
    if matched and score >= 60:
        inv_id = matched["_id"]
        inv_qty = float(matched.get("quantity", 0))
        inv_name = matched["ingredientName"]
        await inventory.restock_item(inv_id, inv_qty, result.qty, result.unit, price=result.price)
        total_cost = result.price * result.qty
        if total_cost > 0:
            await inventory.log_purchase(inv_name, result.qty, result.unit, total_cost)
        await reply(
            f"✅ *Restok Berhasil*\n"
            f"   {inv_name} +{result.qty:.0f} {result.unit}\n"
            + (f"   Biaya: Rp{int(total_cost):,}" if total_cost > 0 else ""))

        # ── Auto-notify stock group ─────────────────────
        asyncio.ensure_future(_notify_stock_update())
    elif matched and score >= 45:
        await reply(f"🤔 Maksudnya *{matched['ingredientName']}*? ({score}% match)\n"
                    f"Kalau iya, ketik: `restok {matched['ingredientName']} {result.qty} {result.unit} {result.price}`")
    else:
        await reply(f"🆕 *{result.item}* belum ada di database. Tambah dulu via POS atau ketik lebih spesifik.")


# ── Auto-notify stock group ──────────────────────────────────────

STOCK_NOTIFY_LOCK = asyncio.Lock()

async def _notify_stock_update():
    """Kirim Stock Opname bahan baku per merchant ke grup stock."""
    async with STOCK_NOTIFY_LOCK:
        try:
            all_inv = await inventory.get_all_inventory()

            # Ambil data merchant
            store_url = f"{SUPABASE_URL}/rest/v1/pos_inventory_stores?select=_id,name,phone&isActive=eq.true"
            async with httpx.AsyncClient(timeout=20) as client:
                store_resp = await client.get(store_url, headers={
                    "apikey": SUPABASE_KEY,
                    "Authorization": f"Bearer {SUPABASE_KEY}",
                })
                stores_raw = store_resp.json() if store_resp.status_code < 400 else []
            store_map = {s["_id"]: s for s in stores_raw}
            UNKNOWN = {"name": "Lainnya", "phone": ""}

            def fmt_sisa(qty, unit):
                u = unit.lower().strip()
                if qty <= 0:
                    return "HABIS"
                if u in ("gram", "g"):
                    return f"sisa {qty:.0f} gram" if qty < 1000 else f"sisa {qty/1000:.1f} kg"
                elif u in ("ml", "milliliter"):
                    return f"sisa {qty:.0f} ml" if qty < 1000 else f"sisa {qty/1000:.1f} L"
                elif u in ("liter", "l"):
                    return f"sisa {qty:.1f} L"
                elif u in ("kg",):
                    return f"sisa {qty:.1f} kg"
                else:
                    return f"sisa {qty:.0f} {unit}"

            urgent_by_store = {}
            menipis_by_store = {}

            for item in all_inv:
                name = item.get("ingredientName", "")
                
                # Skip non-kitchen items
                name_lower = name.lower()
                skip_kw = ["gas", "baterai", "kresek", "sedotan", "sendok garpu",
                           "botol 1", "ekonomi", "soklin", "lifebuoy", "cling", "bento tupai",
                           "paperbowl", "cup 12", "multi tisu", "tutup cup"]
                if any(kw in name_lower for kw in skip_kw):
                    continue
                
                qty = float(item.get("quantity") or 0)
                th = float(item.get("lowStockThreshold") or 0)
                unit = (item.get("unit") or "").strip()
                store_id = (item.get("preferredStoreId") or "") or ""

                if th <= 0 or qty > th:
                    continue

                sisa = fmt_sisa(qty, unit)
                st = store_map.get(store_id, UNKNOWN)
                sname = st["name"]
                phone = st.get("phone", "") or ""
                entry = {"name": name, "sisa": sisa}

                if qty <= 0 or qty <= th * 0.3:
                    if sname not in urgent_by_store:
                        urgent_by_store[sname] = {"phone": phone, "items": []}
                    urgent_by_store[sname]["items"].append(entry)
                    if phone:
                        urgent_by_store[sname]["phone"] = phone
                else:
                    if sname not in menipis_by_store:
                        menipis_by_store[sname] = {"phone": phone, "items": []}
                    menipis_by_store[sname]["items"].append(entry)
                    if phone:
                        menipis_by_store[sname]["phone"] = phone

            for grp in (urgent_by_store, menipis_by_store):
                for sn in grp:
                    grp[sn]["items"].sort(key=lambda x: x["name"].lower())

            urgent_order = sorted(urgent_by_store, key=lambda sn: (-len(urgent_by_store[sn]["items"]), sn))
            menipis_order = sorted(menipis_by_store, key=lambda sn: (-len(menipis_by_store[sn]["items"]), sn))

            total_urgent = sum(len(urgent_by_store[s]["items"]) for s in urgent_by_store)
            total_menipis = sum(len(menipis_by_store[s]["items"]) for s in menipis_by_store)

            lines = ["📋 STOCK OPNAME"]
            lines.append(f"🔴 Urgent: {total_urgent} item  |  🟡 Menipis: {total_menipis} item")
            lines.append("")

            if urgent_by_store:
                lines.append("━━━ 🔴 URGENT ━━━")
                lines.append("")
                for idx, sname in enumerate(urgent_order, 1):
                    grp = urgent_by_store[sname]
                    phone = grp["phone"]
                    h = f"{idx}. {sname}"
                    if phone:
                        h += f"  ☎️ {phone}"
                    lines.append(h)
                    for item in grp["items"]:
                        lines.append(f"🔴 {item['name']} — {item['sisa']}")
                    lines.append("")
                lines.append("")

            if menipis_by_store:
                lines.append("━━━ 🟡 MENIPIS ━━━")
                lines.append("")
                for idx, sname in enumerate(menipis_order, 1):
                    grp = menipis_by_store[sname]
                    phone = grp["phone"]
                    h = f"{idx}. {sname}"
                    if phone:
                        h += f"  ☎️ {phone}"
                    lines.append(h)
                    for item in grp["items"]:
                        lines.append(f"🟡 {item['name']} — {item['sisa']}")
                    lines.append("")

            async with httpx.AsyncClient(timeout=10) as client:
                await client.post(
                    f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
                    json={"chat_id": STOCK_GROUP_ID, "text": "\n".join(lines)},
                )
        except Exception as e:
            logger.warning("Stock auto-notify failed: %s", e)






# ── Stock Reaction: AI Match ─────────────────────────────────────

_MATCH_SYSTEM_PROMPT = """Kamu adalah asisten inventory yang mencocokkan nama bahan dari user ke database inventory.

ATURAN:
- Handle typo, singkatan, nama tidak lengkap, case, spasi berlebih
- "minyak" bisa berarti Minyak Goreng, Minyak Sunco, Minyak Rizki, dll
- Jika ada MULTIPLE match, pilih yang PALING UMUM
- Jika ragu, pilih yang quantity-nya lebih kecil (lebih urgent)
- JANGAN beri lebih dari 1 jawaban per input
- Jika TIDAK ADA yang cocok, jawab: TIDAK_COCOK
- Jawab persis sesuai format, 1 baris per item user

Format jawaban untuk SETIAP item user (1 baris):
TULISAN_USER -> NAMA_INVENTORY|_ID|CONFIDENCE(0-100)

Contoh:
User: minyak goreng
Inventory: Minyak Goreng|id1|600ml, Minyak Sunco|id2|600ml
Jawab: minyak goreng -> Minyak Goreng|id1|95"""

async def _ai_match_inventory(sp_client: SumoPodClient, items: list[str], all_inv: list[dict]) -> list[dict]:
    """AI-match setiap item user ke inventory. Returns [{input, matched: bool, inv_name, _id, score}]."""
    # Build inventory list for prompt (limit to prevent token overflow)
    inv_lines = [f"{i.get('ingredientName','?')}|{i.get('_id','?')}|{i.get('quantity',0):g} {i.get('unit','')}"
                 for i in all_inv if _is_kitchen(i.get('ingredientName', ''))]
    inv_text = "\n".join(inv_lines)
    
    if len(inv_text) > 8000:
        inv_text = "\n".join(inv_lines[:200])
    
    user_items = "\n".join(items)
    prompt = f"""Cocokkan SETIAP nama bahan berikut ke database inventory.

Item dari user (satu baris per item):
{user_items}

Daftar inventory (nama|id|qty):
{inv_text}

Format jawaban (1 baris per item, urutan sesuai input):
TULISAN_USER -> NAMA_INVENTORY|_ID|CONFIDENCE
Atau: TULISAN_USER -> TIDAK_COCOK"""

    try:
        result = await sp_client.chat(prompt, system_prompt=_MATCH_SYSTEM_PROMPT, timeout=30)
        reply = result.get("reply", "") or result.get("text", "") or result.get("raw", "") or ""
        
        matched = []
        for line in reply.strip().split("\n"):
            line = line.strip()
            if not line or "->" not in line:
                continue
            parts = line.split("->", 1)
            input_name = parts[0].strip()
            response_part = parts[1].strip()
            
            if response_part == "TIDAK_COCOK" or "TIDAK_COCOK" in response_part:
                matched.append({"input": input_name, "matched": False, "inv_name": None, "_id": None, "score": 0})
                continue
            
            resp_parts = response_part.split("|")
            if len(resp_parts) >= 2:
                inv_name = resp_parts[0].strip()
                inv_id = resp_parts[1].strip()
                score = int(resp_parts[2].strip()) if len(resp_parts) >= 3 and resp_parts[2].strip().isdigit() else 0
                matched.append({"input": input_name, "matched": True, "inv_name": inv_name, "_id": inv_id, "score": score})
            else:
                matched.append({"input": input_name, "matched": False, "inv_name": None, "_id": None, "score": 0})
        
        return matched
    except Exception as e:
        logger.warning("AI match failed: %s, falling back to rapidfuzz", e)
        return _fuzzy_match_fallback(items, all_inv)


def _fuzzy_match_fallback(items: list[str], all_inv: list[dict]) -> list[dict]:
    """Fallback fuzzy matching using rapidfuzz."""
    inv_names = {i.get("ingredientName", ""): i for i in all_inv if i.get("ingredientName")}
    results = []
    for item in items:
        best = fuzz_process.extractOne(item, list(inv_names.keys()), scorer=fuzz.WRatio, score_cutoff=70)
        if best:
            match_name, score = best[0], best[1]
            inv_item = inv_names[match_name]
            results.append({"input": item, "matched": True, "inv_name": match_name,
                           "_id": inv_item.get("_id", ""), "score": score})
        else:
            results.append({"input": item, "matched": False, "inv_name": None, "_id": None, "score": 0})
    return results


# ── Stock Reaction: Apply Deductions ──────────────────────────────

async def _apply_stock_deductions(matches: list[dict], action_type: str, all_inv: list[dict]) -> dict:
    """Apply 🔴 (set to 0) or 🟡 (half) to matched inventory items.
    Returns {success: [{name, old_qty, new_qty, unit}], failed: [{input, reason}], history_entry}."""
    success = []
    failed = []
    history_items = []
    
    # Build quick lookup
    inv_map = {i.get("_id", ""): i for i in all_inv}
    
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }
    
    async with httpx.AsyncClient(timeout=30) as client:
        for match in matches:
            if not match["matched"] or not match["_id"]:
                failed.append({"input": match["input"], "reason": "Tidak ditemukan di database"})
                continue
            
            inv_item = inv_map.get(match["_id"])
            if not inv_item:
                failed.append({"input": match["input"], "reason": "Item tidak ditemukan di lookup"})
                continue
            
            name = inv_item.get("ingredientName", match["input"])
            old_qty = float(inv_item.get("quantity") or 0)
            unit = inv_item.get("unit", "") or ""
            
            if action_type == "🔴":
                if old_qty <= 0:
                    failed.append({"input": match["input"], "reason": f'"{name}" sudah 0 (HABIS)'})
                    continue
                new_qty = 0.0
            elif action_type == "🟡":
                if old_qty <= 0:
                    failed.append({"input": match["input"], "reason": f'"{name}" sudah 0, tidak bisa dipotong'})
                    continue
                # Floor for discrete units, float for continuous
                if unit.lower() in ("pcs", "pack", "botol", "pouch", "toros"):
                    new_qty = math.floor(old_qty / 2)
                else:
                    new_qty = old_qty / 2
            else:
                continue
            
            # PATCH database
            try:
                resp = await client.patch(
                    f"{SUPABASE_URL}/rest/v1/pos_inventory?_id=eq.{match['_id']}",
                    json={"quantity": new_qty},
                    headers=headers,
                )
                if resp.status_code == 204:
                    success.append({"name": name, "old_qty": old_qty, "new_qty": new_qty, "unit": unit})
                    history_items.append({
                        "_id": match["_id"], "name": name,
                        "old_qty": old_qty, "new_qty": new_qty, "unit": unit
                    })
                else:
                    failed.append({"input": match["input"], "reason": f"DB error: {resp.status_code}"})
            except Exception as e:
                failed.append({"input": match["input"], "reason": f"Network error: {e}"})
    
    history_entry = None
    if history_items:
        ts = datetime.now().timestamp()
        history_entry = {
            "ts": ts,
            "items": history_items,
            "timestamp": datetime.now(timezone(timedelta(hours=7))).strftime("%H:%M"),
        }
        _stock_reaction_history[ts] = history_entry
    
    return {"success": success, "failed": failed, "history_entry": history_entry}


async def _get_stores() -> dict:
    """Fetch all active stores. Returns {store_id: {name, phone, type}}."""
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"{SUPABASE_URL}/rest/v1/pos_inventory_stores?select=_id,name,phone,type,notes&isActive=eq.true",
                headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"},
            )
            if resp.status_code < 400:
                stores = resp.json()
                return {s["_id"]: s for s in stores}
    except Exception as e:
        logger.warning("Failed to fetch stores: %s", e)
    return {}


# ── Generate Marketlist Detail ────────────────────────────────────

async def _generate_marketlist_detail() -> str:
    """Generate marketlist detail (what to buy) based on current inventory."""
    try:
        all_inv = await inventory.get_all_inventory()
        stores = await _get_stores()
    except Exception as e:
        logger.warning("Marketlist detail generation failed: %s", e)
        return "❌ Gagal generate marketlist."
    
    items_to_buy = []
    for item in all_inv:
        name = item.get("ingredientName", "")
        if not _is_kitchen(name):
            continue
        
        qty = float(item.get("quantity") or 0)
        th = float(item.get("lowStockThreshold") or 0)
        price = float(item.get("lastPurchasePrice") or 0)
        unit = (item.get("unit") or "").strip()
        store_id = (item.get("preferredStoreId") or "") or ""
        
        if th <= 0 or qty > th:
            continue
        
        buy_qty = max(0.01, th - qty)  # minimum 0.01 to avoid zero
        total_cost = buy_qty * price
        
        items_to_buy.append({
            "name": name, "buy_qty": buy_qty, "unit": unit,
            "price": price, "total": total_cost, "store_id": store_id
        })
    
    if not items_to_buy:
        return "✅ Semua stok aman. Tidak ada yang perlu dibeli."
    
    # Group per merchant
    groups = {}
    for item in items_to_buy:
        sid = item["store_id"]
        store = stores.get(sid, {"name": "Lainnya", "phone": "", "type": "", "notes": ""})
        if sid not in groups:
            groups[sid] = {"store": store, "items": [], "subtotal": 0}
        groups[sid]["items"].append(item)
        groups[sid]["subtotal"] += item["total"]
    
    _WIB = timezone(timedelta(hours=7))
    now = datetime.now(_WIB)
    
    lines = [f"\U0001f6d2 Marketlist Detail \u2014 {now:%d/%m %H:%M}", ""]
    total_items = 0
    grand_total = 0
    
    for sid, grp in sorted(groups.items(), key=lambda x: -x[1]["subtotal"]):
        store = grp["store"]
        sname = store.get("name", "Lainnya")
        phone = store.get("phone", "") or ""
        notes = store.get("notes", "") or ""
        stype = store.get("type", "") or ""
        
        # Category emoji based on notes/type
        cat_emoji = "\U0001f3ea"  # default: store
        notes_lower = notes.lower()
        if any(kw in notes_lower for kw in ["sayur", "bumbu"]):
            cat_emoji = "\U0001f96c"  # leafy green
        elif any(kw in notes_lower for kw in ["daging", "ayam"]):
            cat_emoji = "\U0001f969"  # meat
        elif any(kw in notes_lower for kw in ["kopi", "beans"]):
            cat_emoji = "\u2615"  # coffee
        elif any(kw in notes_lower for kw in ["plastik", "cup", "botol"]):
            cat_emoji = "\U0001f9f0"  # packaging
        elif any(kw in notes_lower for kw in ["susu", "pastry"]):
            cat_emoji = "\U0001f95e"  # pastry
        
        cat_tag = f" {cat_emoji} {stype}" if stype else f" {cat_emoji}"
        
        lines.append(f"\U0001f3ea {sname}{cat_tag}")
        if phone:
            lines.append(f"\U0001f4ce {phone}")
        for item in grp["items"]:
            bq = item["buy_qty"]
            # Format buy_qty nicely
            un = item["unit"]
            if un.lower() in ("gram", "g") and bq >= 1000:
                bq_str = f"{bq/1000:.2f}".rstrip("0").rstrip(".")
                un = "kg"
            elif un.lower() in ("ml",) and bq >= 1000:
                bq_str = f"{bq/1000:.2f}".rstrip("0").rstrip(".")
                un = "L"
            else:
                bq_str = f"{bq:.2f}".rstrip("0").rstrip(".")
            
            price_fmt = f"Rp{item['price']:,.0f}"
            total_fmt = f"Rp{item['total']:,.0f}"
            lines.append(f"  \u2022 {item['name']} \u2014 {bq_str} {un} @ {price_fmt} = {total_fmt}")
        
        sub_fmt = f"Rp{grp['subtotal']:,.0f}"
        lines.append(f"  \U0001f4b0 Subtotal: {sub_fmt}")
        lines.append("")
        total_items += len(grp["items"])
        grand_total += grp["subtotal"]
    
    # Footer
    lines.append("\u2500" * 28)
    gt_fmt = f"Rp{grand_total:,.0f}"
    lines.append(f"\U0001f6cd Total: {total_items} item \u2022 {gt_fmt}")
    
    return "\n".join(lines)


# ── Handle Stock Reaction (main entry point) ──────────────────────

async def _handle_stock_reaction(update: Update, context, reaction: dict):
    """Handle 🔴/🟡 reaction from user."""
    msg = update.effective_message
    if not msg:
        return
    
    action_type = reaction["type"]
    items = reaction["items"]
    
    if len(items) > 10:
        await msg.reply_text(f"\u26a0\ufe0f Maksimal 10 item per pesan. Kirim lagi untuk sisanya.")
        return
    
    # Fetch current inventory
    try:
        all_inv = await inventory.get_all_inventory()
    except Exception as e:
        await msg.reply_text(f"\u274c Gagal ambil data inventory: {e}")
        return
    
    # AI match items to inventory
    sp_client = SumoPodClient(SUMOPOD_API_KEY)
    matches = await _ai_match_inventory(sp_client, items, all_inv)
    
    # Apply deductions
    result = await _apply_stock_deductions(matches, action_type, all_inv)
    
    # Build reply
    reply_lines = []
    for s in result["success"]:
        action_label = "HABIS" if action_type == "🔴" else "50%"
        reply_lines.append(f"\u2705 {s['name']} \u2192 {s['new_qty']:g} {s['unit']} ({action_label})")
    
    for f in result["failed"]:
        reason = f["reason"]
        if "tidak ditemukan" in reason.lower():
            # Suggest using fuzzy fallback
            all_names = [i.get("ingredientName", "") for i in all_inv if _is_kitchen(i.get("ingredientName", ""))]
            best = fuzz_process.extractOne(f["input"], all_names, scorer=fuzz.WRatio, score_cutoff=50)
            if best:
                reply_lines.append(f'\u274c "' + str(f['input']) + '" tidak ditemukan. Mungkin \u2192 "' + str(best[0]) + '"?')
            else:
                reply_lines.append(f'\u274c "' + str(f['input']) + '" tidak ditemukan di inventory.')
        else:
            reply_lines.append(f"\u274c {f['input']}: {reason}")
    
    if not reply_lines:
        await msg.reply_text("\u274c Tidak ada item yang diproses. Cek format: \ud83d\udd34 Minyak Goreng")
        return
    
    reply_text = "\n".join(reply_lines)
    
    # Add undo button if there's a history entry
    reply_markup = None
    if result["history_entry"]:
        ts = result["history_entry"]["ts"]
        keyboard = [[InlineKeyboardButton("\u21a9\ufe0f Undo", callback_data=f"undo_{ts}")]]
        reply_markup = InlineKeyboardMarkup(keyboard)
    
    await msg.reply_text(reply_text, reply_markup=reply_markup)
    
    # Generate and send marketlist detail
    try:
        marketlist_text = await _generate_marketlist_detail()
        await msg.reply_text(marketlist_text)
    except Exception as e:
        logger.warning("Marketlist detail send failed: %s", e)


# ── Undo Callback Handler ─────────────────────────────────────────

async def _handle_undo_callback(update: Update, context, ts_str: str):
    """Handle undo button click - restore previous quantities."""
    query = update.callback_query
    try:
        ts = float(ts_str)
    except ValueError:
        await query.answer("\u274c Invalid undo data", show_alert=True)
        return
    
    history = _stock_reaction_history.get(ts)
    if not history:
        await query.answer("\u274c Undo tidak tersedia atau sudah expired (max 5 menit)", show_alert=True)
        return
    
    # Check expiry
    now = datetime.now().timestamp()
    if now - ts > STOCK_REACTION_EXPIRY:
        del _stock_reaction_history[ts]
        await query.answer("\u23f0 Undo expired (maks 5 menit)", show_alert=True)
        # Edit message to remove keyboard
        try:
            await query.edit_message_reply_markup(reply_markup=None)
        except Exception:
            pass
        return
    
    # Restore quantities
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }
    
    restored = []
    failed = []
    async with httpx.AsyncClient(timeout=30) as client:
        for item in history["items"]:
            try:
                resp = await client.patch(
                    f"{SUPABASE_URL}/rest/v1/pos_inventory?_id=eq.{item['_id']}",
                    json={"quantity": item["old_qty"]},
                    headers=headers,
                )
                if resp.status_code == 204:
                    restored.append(item["name"])
                else:
                    failed.append(item["name"])
            except Exception as e:
                failed.append(item["name"])
    
    # Clean up history
    del _stock_reaction_history[ts]
    
    # Reply
    lines = ["\u21a9\ufe0f **Undone!** Qty dikembalikan ke sebelum:", ""]
    for name in restored:
        lines.append(f"  \u2705 {name}")
    for name in failed:
        lines.append(f"  \u274c {name} (gagal restore)")
    
    await query.answer()
    try:
        await query.edit_message_text("\n".join(lines))
    except Exception:
        await query.message.reply_text("\n".join(lines))
    
    # Also send updated marketlist after undo
    try:
        marketlist_text = await _generate_marketlist_detail()
        await query.message.reply_text(marketlist_text)
    except Exception as e:
        logger.warning("Marketlist after undo failed: %s", e)


# ── Stock Reaction History Cleanup ─────────────────────────────

async def _cleanup_stock_reaction_history():
    """Periodic cleanup of expired undo entries (runs every 5 minutes)."""
    while True:
        await asyncio.sleep(300)  # 5 minutes
        now = datetime.now().timestamp()
        expired = [ts for ts, entry in list(_stock_reaction_history.items())
                   if now - float(ts) > STOCK_REACTION_EXPIRY]
        for ts in expired:
            del _stock_reaction_history[ts]
        if expired:
            logger.info("Cleaned %d expired stock reaction history entries", len(expired))


# ── Main ────────────────────────────────────────────────────────

async def main():
    app = (
        ApplicationBuilder()
        .token(TELEGRAM_BOT_TOKEN)
        .build()
    )

    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(CommandHandler("supplier", cmd_supplier))
    app.add_handler(CommandHandler("yumi", cmd_yumi))
    app.add_handler(CommandHandler("hermes_scope", cmd_hermes_scope))
    app.add_handler(CommandHandler("hermes_test", cmd_hermes_test))
    # Message handlers — ordered by priority
    # Marketlist text input (after callback prompt) goes before general text
    app.add_handler(MessageHandler(
        filters.TEXT & ~filters.COMMAND,
        lambda u, c: handle_marketlist_text_input(
            u, c, marketlist_sessions,
            format_merchant_marketlist,
            recalculate_with_qty,
            SumoPodClient(SUMOPOD_API_KEY), inventory,
        ),
    ), group=1)  # Higher priority group
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))
    app.add_handler(CallbackQueryHandler(handle_callback))

    logger.info("Starting Yumi Purchasing Agent (AI-powered)...")
    await app.initialize()
    await app.start()
    await app.updater.start_polling()
    logger.info("Yumi Purchasing Agent siap — Inventory, Marketlist, AI Chat")

    # ── Background: stock update monitor ───────────────────
    last_purchase_id = 0
    last_completed_order_id = ""

    async def _monitor_stock_changes():
        nonlocal last_purchase_id
        await asyncio.sleep(5)
        while True:
            try:
                async with httpx.AsyncClient(timeout=10) as client:
                    resp = await client.get(
                        f"{SUPABASE_URL}/rest/v1/pos_purchase_logs?select=id&order=id.desc&limit=1",
                        headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"},
                    )
                    if resp.status_code < 400:
                        rows = resp.json()
                        if rows:
                            latest_id = rows[0]["id"]
                            if last_purchase_id > 0 and latest_id > last_purchase_id:
                                logger.info("New purchase detected (id:%d→%d), sending stock update", last_purchase_id, latest_id)
                                await _notify_stock_update()
                            last_purchase_id = latest_id
                        elif last_purchase_id == 0:
                            last_purchase_id = 0
            except Exception as e:
                logger.debug("Stock monitor check: %s", e)
            await asyncio.sleep(60)

    async def _monitor_completed_orders():
        nonlocal last_completed_order_id
        await asyncio.sleep(10)
        while True:
            try:
                async with httpx.AsyncClient(timeout=10) as client:
                    # Cek order terbaru dengan status "completed" via public view
                    resp = await client.get(
                        f"{SUPABASE_URL}/rest/v1/pos_orders?select=_id,orderNumber,status&status=eq.completed&order=_creationTime.desc&limit=1",
                        headers={
                            "apikey": SUPABASE_KEY,
                            "Authorization": f"Bearer {SUPABASE_KEY}",
                        },
                    )
                    if resp.status_code < 400:
                        rows = resp.json()
                        if rows:
                            latest_id = rows[0].get("_id", "")
                            if latest_id and latest_id != last_completed_order_id:
                                if last_completed_order_id:
                                    order_num = rows[0].get("orderNumber", latest_id[-6:])
                                    logger.info("New completed order #%s (skip notification)", order_num)
                                last_completed_order_id = latest_id
            except Exception as e:
                logger.debug("Completed order monitor check: %s", e)
            await asyncio.sleep(120)  # Cek tiap 2 menit

    async def _scheduled_stock_report():
        """Kirim laporan stok terjadwal tiap pagi 08:00 & sore 17:00 WIB."""
        _WIB = timezone(timedelta(hours=7))
        while True:
            now = datetime.now(_WIB)
            today = now.date()
            pagi = datetime(today.year, today.month, today.day, 8, 0, tzinfo=_WIB)
            sore = datetime(today.year, today.month, today.day, 17, 0, tzinfo=_WIB)
            jadwal = [pagi, sore]
            # Skip jadwal yang sudah lewat hari ini
            next_run = min((s for s in jadwal if s > now), default=pagi + timedelta(days=1))
            delay = (next_run - now).total_seconds()
            logger.info("Stock report scheduler: next run at %s WIB (%d detik)", next_run.strftime("%H:%M"), delay)
            await asyncio.sleep(delay)
            await _notify_stock_update()

    asyncio.ensure_future(_scheduled_stock_report())
    asyncio.ensure_future(_monitor_stock_changes())
    asyncio.ensure_future(_monitor_completed_orders())
    asyncio.ensure_future(_cleanup_stock_reaction_history())

    stop = asyncio.get_event_loop().create_future()
    try:
        await stop
    except asyncio.CancelledError:
        pass
    finally:
        await app.stop()
        await app.shutdown()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Shutting down...")
