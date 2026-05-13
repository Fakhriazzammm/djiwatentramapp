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
    """Kirim update stok bahan baku + menu ke grup stock."""
    async with STOCK_NOTIFY_LOCK:
        try:
            all_inv = await inventory.get_all_inventory()
            low_items = []
            for item in all_inv:
                name = item.get("ingredientName", "")
                qty = float(item.get("quantity") or 0)
                th = float(item.get("lowStockThreshold") or 0)
                unit = (item.get("unit") or "").strip()
                unit_s = f" {unit}" if unit else ""
                if qty <= 0:
                    low_items.append(f"  ❌ {name} — HABIS")
                elif th > 0 and qty <= th:
                    low_items.append(f"  ⚠️ {name} — sisa {qty:g}{unit_s}")

            prod_url = f"{SUPABASE_URL}/rest/v1/pos_products?select=name,categoryId,quantity&order=name"
            cat_url = f"{SUPABASE_URL}/rest/v1/pos_categories?select=_id,name&order=displayOrder"
            async with httpx.AsyncClient(timeout=20) as client:
                prod_resp = await client.get(prod_url, headers={
                    "apikey": SUPABASE_KEY,
                    "Authorization": f"Bearer {SUPABASE_KEY}",
                })
                products = prod_resp.json() if prod_resp.status_code < 400 else []
                cat_resp = await client.get(cat_url, headers={
                    "apikey": SUPABASE_KEY,
                    "Authorization": f"Bearer {SUPABASE_KEY}",
                })
                categories = cat_resp.json() if cat_resp.status_code < 400 else []
            cat_map = {c.get("_id"): c.get("name", "?") for c in categories}
            EXCLUDED_CATS = {"Event", "Promo", "Paket Ramadhan"}

            habis_menu = [p for p in products if float(p.get("quantity") or 0) <= 0
                          and cat_map.get(p.get("categoryId", ""), "").strip() not in EXCLUDED_CATS]
            hampir_habis = [p for p in products if 0 < float(p.get("quantity") or 0) < 5
                            and cat_map.get(p.get("categoryId", ""), "").strip() not in EXCLUDED_CATS]
            total_menu = sum(1 for p in products if cat_map.get(p.get("categoryId", ""), "").strip() not in EXCLUDED_CATS)
            habis_bahan = sum(1 for i in all_inv if float(i.get("quantity") or 0) <= 0)

            lines = ["📋 *UPDATE STOK TERBARU*\n"]
            lines.append(f"📦 *Bahan Baku:* {len(all_inv) - habis_bahan} tersedia / {habis_bahan} habis")
            if low_items:
                lines.extend(low_items[:8])
                if len(low_items) > 8:
                    lines.append(f"  ... +{len(low_items) - 8} lainnya")
            lines.append("")
            lines.append(f"🍽️ *Menu:* {total_menu - len(habis_menu)} tersedia / {len(habis_menu)} habis")
            if habis_menu:
                for p in habis_menu[:5]:
                    ct = cat_map.get(p.get("categoryId", ""), "")
                    lines.append(f"  ❌ [{ct}] {p.get('name', '?')}" if ct else f"  ❌ {p.get('name', '?')}")
                if len(habis_menu) > 5:
                    lines.append(f"  ... +{len(habis_menu) - 5} lainnya")
            if hampir_habis:
                lines.append("⚠️ *Menipis:*")
                for p in hampir_habis[:5]:
                    ct = cat_map.get(p.get("categoryId", ""), "")
                    tag = f"[{ct}] " if ct else ""
                    lines.append(f"  ⚠️ {tag}{p.get('name', '?')} — sisa {float(p.get('quantity') or 0):g}")

            async with httpx.AsyncClient(timeout=10) as client:
                await client.post(
                    f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
                    json={"chat_id": STOCK_GROUP_ID, "text": "\n".join(lines), "parse_mode": "Markdown"},
                )
        except Exception as e:
            logger.warning("Stock auto-notify failed: %s", e)


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
                                    logger.info("New completed order #%s, check low stock", order_num)
                                    await _notify_stock_update()
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
