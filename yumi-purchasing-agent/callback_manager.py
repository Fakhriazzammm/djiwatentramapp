"""callback_manager.py — Telegram inline keyboards and callback handlers
for Yumi Purchasing Agent marketlist confirmation/editing.

Implements: confirm, edit qty/supplier, add/remove item, regenerate.
"""

import logging
import re
from datetime import datetime, timezone, timedelta
from typing import Callable

from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import ContextTypes

from learning_memory import update_learning_entry, get_learning_entry

logger = logging.getLogger(__name__)

WIB = timezone(timedelta(hours=7))

# ── Callback data prefixes (max 64 bytes total) ────────────────
# Format: ml_{action}_{entry_id}_{item_idx}
# Actions: confirm, eqty (edit qty), esup (edit supplier),
#          rm (remove), add, regen (regenerate), done

CALLBACK_RE = re.compile(r"^ml_(confirm|eqty|esup|rm|add|regen|done|showall|back|assignsup)_(.+?)(?:_(\d+))?$")


def _parse_callback(data: str) -> tuple[str, str, int | None]:
    """Parse callback_data. Returns (action, entry_id, item_idx_or_None)."""
    m = CALLBACK_RE.match(data)
    if not m:
        return "unknown", "", None
    action = m.group(1)
    entry_id = m.group(2)
    item_idx = int(m.group(3)) if m.group(3) else None
    return action, entry_id, item_idx


# ── Keyboard builders ──────────────────────────────────────────


def build_marketlist_keyboard(entry_id: str, items_count: int, message_id: str = "") -> InlineKeyboardMarkup:
    """Build the main marketlist action keyboard."""
    keyboard = [
        [InlineKeyboardButton("✅ Konfirmasi Semua", callback_data=f"ml_confirm_{entry_id}")],
    ]
    # Per-item edit buttons (max 5 items before "more" indicator)
    for i in range(min(items_count, 5)):
        keyboard.append([
            InlineKeyboardButton(f"✏️ Item {i+1}", callback_data=f"ml_eqty_{entry_id}_{i}"),
            InlineKeyboardButton(f"🗑 Hapus", callback_data=f"ml_rm_{entry_id}_{i}"),
        ])
    # More items indicator
    if items_count > 5:
        keyboard.append([InlineKeyboardButton(
            f"... +{items_count - 5} item lainnya",
            callback_data=f"ml_showall_{entry_id}",
        )])
    # Bottom row
    keyboard.append([
        InlineKeyboardButton("➕ Tambah Item", callback_data=f"ml_add_{entry_id}"),
        InlineKeyboardButton("🔄 Generate Ulang", callback_data=f"ml_regen_{entry_id}"),
    ])
    return InlineKeyboardMarkup(keyboard)


def build_item_edit_keyboard(entry_id: str, item_idx: int, item_name: str) -> InlineKeyboardMarkup:
    """Build keyboard for editing a single item."""
    keyboard = [
        [InlineKeyboardButton(f"📦 Ubah Qty", callback_data=f"ml_eqty_{entry_id}_{item_idx}")],
        [InlineKeyboardButton(f"🏪 Ganti Supplier", callback_data=f"ml_esup_{entry_id}_{item_idx}")],
        [InlineKeyboardButton(f"🗑 Hapus Item Ini", callback_data=f"ml_rm_{entry_id}_{item_idx}")],
        [InlineKeyboardButton("🔙 Kembali", callback_data=f"ml_back_{entry_id}")],
    ]
    return InlineKeyboardMarkup(keyboard)


def build_supplier_picker(entry_id: str, item_idx: int, suppliers: list[dict]) -> InlineKeyboardMarkup:
    """Build keyboard for choosing a supplier for an item."""
    keyboard = [
        [InlineKeyboardButton(
            f"{s.get('name', '?')} {('📞' + s.get('phone', '')) if s.get('phone') else ''}",
            callback_data=f"ml_assignsup_{entry_id}_{item_idx}_{s.get('_id', '')}",
        )]
        for s in suppliers[:8]
    ]
    keyboard.append([InlineKeyboardButton("🔙 Kembali", callback_data=f"ml_back_{entry_id}")])
    return InlineKeyboardMarkup(keyboard)


# ── Callback handler ───────────────────────────────────────────


async def handle_marketlist_callback(
    update: Update,
    context: ContextTypes.DEFAULT_TYPE,
    group_items: dict,  # {entry_id: {"groups": [...], "grand_total": float, ...}}
    format_fn: Callable,  # format_merchant_marketlist
    recalc_fn: Callable,  # recalculate_with_qty
    remove_fn: Callable,  # remove_item_and_reformat
    process_fn: Callable,  # process_input_marketlist
    sp_client,
    inventory_manager,
    supplier_manager,
):
    """Handle marketlist callback queries (ml_* prefix)."""
    query = update.callback_query
    await query.answer()
    user = update.effective_user
    chat = update.effective_chat

    action, entry_id, item_idx = _parse_callback(query.data)
    if action == "unknown":
        await query.edit_message_text("❌ Aksi tidak dikenal.")
        return

    # Retrieve session data
    session_key = f"marketlist_{entry_id}"
    session = group_items.get(session_key)
    if not session:
        await query.edit_message_text(
            "⏰ Sesi marketlist sudah kedaluwarsa. Kirim ulang daftar belanja kamu.",
        )
        return

    # Security: only the original sender can interact with callbacks
    callback_user = update.effective_user
    session_owner = session.get("user_id")
    if session_owner and callback_user and str(callback_user.id) != str(session_owner):
        await query.answer("❌ Hanya pengirim marketlist yang bisa mengkonfirmasi ini.", show_alert=True)
        return

    # Check 5-minute timeout
    from datetime import datetime, timezone, timedelta
    session_ts = session.get("timestamp")
    if session_ts:
        try:
            elapsed = (datetime.now(timezone.utc) - datetime.fromisoformat(session_ts)).total_seconds()
            if elapsed > 300:
                group_items.pop(session_key, None)
                await query.edit_message_text(
                    "⏰ Sesi marketlist sudah kedaluwarsa (>5 menit). Kirim ulang daftar belanja kamu.",
                )
                return
        except (ValueError, TypeError):
            pass

    groups = session.get("groups", [])
    grand_total = session.get("grand_total", 0)
    items_count = session.get("items_count", 0)
    entry_id = session.get("entry_id", entry_id)

    if action == "confirm":
        # Mark as confirmed in learning memory
        if entry_id:
            update_learning_entry(entry_id, {"confirmedByUser": True, "isCorrected": False})
        await query.edit_message_text(
            f"{query.message.text}\n\n✅ **Marketlist dikonfirmasi!** Data disimpan untuk pembelajaran AI.",
            parse_mode="Markdown",
        )
        # Remove session
        group_items.pop(session_key, None)

    elif action == "eqty":
        # Ask user to input new qty
        # Find item name from groups
        flat = []
        for g in groups:
            for item in g.get("items", []):
                flat.append(item)
        item_name = flat[item_idx]["name"] if item_idx is not None and item_idx < len(flat) else "item"
        await query.edit_message_reply_markup(
            reply_markup=build_item_edit_keyboard(entry_id, item_idx, item_name),
        )
        # Store context to capture next text message
        context.user_data["awaiting_marketlist_qty"] = {
            "entry_id": entry_id,
            "session_key": session_key,
            "item_idx": item_idx,
            "chat_id": chat.id if chat else None,
        }
        sent = await query.message.reply_text(
            f"📦 Masukkan qty baru untuk **{item_name}**:\n"
            f"(contoh: `5` atau `2.5 kg`)",
            parse_mode="Markdown",
        )
        # Mark the message we're waiting for
        context.user_data["awaiting_marketlist_qty"]["prompt_msg_id"] = sent.message_id

    elif action == "esup":
        # Show supplier picker
        supplier_list = []
        if hasattr(supplier_manager, '_cache') and supplier_manager._cache:
            supplier_list = list(supplier_manager._cache.values())[:8]
        await query.edit_message_reply_markup(
            reply_markup=build_supplier_picker(entry_id, item_idx or 0, supplier_list),
        )

    elif action == "assignsup":
        # Parse supplier_id from callback data
        parts = query.data.split("_")
        supplier_id = parts[-1] if len(parts) >= 4 else ""
        logger.info("Supplier reassign: entry=%s item_idx=%s supplier=%s", entry_id, item_idx, supplier_id)
        # For now, just confirm the change
        await query.edit_message_text(
            f"✅ Supplier berhasil diubah! Lakukan 'Generate Ulang' untuk melihat hasil baru.",
            reply_markup=None,
        )

    elif action == "rm":
        if item_idx is not None:
            groups, new_count = remove_fn(groups, item_idx)
            new_total = sum(
                float(i.get("subtotal", 0))
                for g in groups
                for i in g.get("items", [])
            )
            # Update session
            session["groups"] = groups
            session["grand_total"] = new_total
            session["items_count"] = new_count
            # Re-format
            new_text = format_fn(groups, new_total, items_count=new_count, unmatched_items=session.get("unmatched_names"))
            await query.edit_message_text(
                new_text,
                reply_markup=build_marketlist_keyboard(entry_id, new_count),
                parse_mode="Markdown",
            )

    elif action == "add":
        context.user_data["awaiting_marketlist_add"] = {
            "entry_id": entry_id,
            "session_key": session_key,
            "chat_id": chat.id if chat else None,
        }
        sent = await query.message.reply_text(
            "✏️ Ketik item yang ingin ditambahkan:\n"
            "(contoh: `kentang 2kg` atau `telur 1 papan`)",
            parse_mode="Markdown",
        )
        context.user_data["awaiting_marketlist_add"]["prompt_msg_id"] = sent.message_id

    elif action == "regen":
        await query.edit_message_text("🔄 Meregenerasi marketlist dengan AI...")
        try:
            result = await process_fn(
                session.get("original_text", ""),
                sp_client,
                inventory_manager,
                supplier_manager,
            )
            if result.get("success"):
                new_groups = result["groups"]
                new_total = result["grand_total"]
                new_count = result["items_count"]
                new_text = result["formatted_text"]
                new_entry_id = result.get("entry_id", entry_id)

                # Update session
                session["groups"] = new_groups
                session["grand_total"] = new_total
                session["items_count"] = new_count
                session["entry_id"] = new_entry_id

                await query.edit_message_text(
                    new_text,
                    reply_markup=build_marketlist_keyboard(new_entry_id, new_count),
                    parse_mode="Markdown",
                )
            else:
                await query.edit_message_text(result.get("formatted_text", "❌ Gagal memproses ulang."))
        except Exception as e:
            logger.exception("Regenerate failed")
            await query.edit_message_text(f"❌ Gagal generate ulang: {e}")

    elif action == "showall":
        # Show all items as a plain list
        flat = []
        for g in groups:
            for item in g.get("items", []):
                flat.append(f"  • {item.get('name', '?')} — {item.get('qty', 0):g} {item.get('unit', '')}")
        if flat:
            text = "📋 *Semua Item:*\n" + "\n".join(flat)
        else:
            text = "📋 (tidak ada item)"
        await query.answer(text[:200], show_alert=True)

    elif action == "back":
        # Return to main marketlist keyboard
        await query.edit_message_reply_markup(
            reply_markup=build_marketlist_keyboard(entry_id, items_count),
        )
    else:
        await query.edit_message_text("❌ Aksi tidak dikenal.")


async def handle_marketlist_text_input(
    update: Update,
    context: ContextTypes.DEFAULT_TYPE,
    group_items: dict,
    format_fn: Callable,
    recalc_fn: Callable,
    sp_client,
    inventory_manager,
):
    """Handle text input after callback (qty edit or add item)."""
    # Check if we're waiting for qty input
    qty_data = context.user_data.pop("awaiting_marketlist_qty", None)
    add_data = context.user_data.pop("awaiting_marketlist_add", None)

    if qty_data:
        # Parse qty from user text
        text = (update.message.text or "").strip()
        qty_match = re.search(r"(\d+(?:\.\d+)?)", text)
        if not qty_match:
            await update.message.reply_text("❌ Format tidak valid. Gunakan angka (contoh: `5`).")
            return

        new_qty = float(qty_match.group(1))
        entry_id = qty_data["entry_id"]
        session_key = qty_data["session_key"]
        item_idx = qty_data["item_idx"]

        session = group_items.get(session_key)
        if not session:
            await update.message.reply_text("⏰ Sesi marketlist sudah kedaluwarsa.")
            return

        groups = session.get("groups", [])
        groups = recalc_fn(groups, item_idx, new_qty)

        # Recalculate grand total
        new_total = sum(
            float(g.get("subtotal", 0)) for g in groups
        )
        new_count = sum(len(g.get("items", [])) for g in groups)

        session["groups"] = groups
        session["grand_total"] = new_total
        session["items_count"] = new_count

        # Update learning memory if entry exists
        if entry_id:
            update_learning_entry(entry_id, {
                "correctionType": "edit",
                "correctionPayload": {"item_idx": item_idx, "new_qty": new_qty},
            })

        # Re-format
        new_text = format_fn(groups, new_total, items_count=new_count, unmatched_items=session.get("unmatched_names"))
        await update.message.reply_text(
            f"✅ Qty diubah!\n\n{new_text}",
            reply_markup=build_marketlist_keyboard(entry_id, new_count),
            parse_mode="Markdown",
        )
        return

    if add_data:
        text = (update.message.text or "").strip()
        if not text:
            await update.message.reply_text("❌ Tidak ada item yang ditambahkan.")
            return

        entry_id = add_data["entry_id"]
        session_key = add_data["session_key"]
        session = group_items.get(session_key)

        if not session:
            await update.message.reply_text("⏰ Sesi marketlist sudah kedaluwarsa.")
            return

        # Parse the new item: "kentang 2kg" or "telur 1 papan"
        from learning_memory import save_learning_entry
        parsed = await _add_single_item(text, sp_client)

        if not parsed:
            await update.message.reply_text(
                "❌ Gagal parse item. Coba format: `nama qty unit` (contoh: `kentang 2 kg`)"
            )
            return

        # Re-process marketlist with new item appended
        original_text = session.get("original_text", "")
        new_text_input = original_text + "\n" + text

        from marketlist import process_input_marketlist
        result = await process_input_marketlist(
            new_text_input, sp_client, inventory_manager, supplier_manager=None,
        )

        if result.get("success"):
            session["groups"] = result["groups"]
            session["grand_total"] = result["grand_total"]
            session["items_count"] = result["items_count"]
            session["entry_id"] = result.get("entry_id", entry_id)

            await update.message.reply_text(
                f"✅ Item ditambahkan!\n\n{result['formatted_text']}",
                reply_markup=build_marketlist_keyboard(result.get("entry_id", entry_id), result["items_count"]),
                parse_mode="Markdown",
            )
        else:
            await update.message.reply_text("❌ Gagal memproses ulang marketlist.")


async def _add_single_item(text: str, sp_client) -> dict | None:
    """Parse a single item addition text. Returns {"name": str, "note": str|None} or None."""
    import re
    from marketlist import parse_marketlist_text

    # Try AI parse first
    items = await parse_marketlist_text(text, sp_client)
    if items:
        return items[0]

    # Simple regex fallback
    m = re.match(r"(.+?)\s+(\d+(?:\.\d+)?)\s*(\w+)?", text.strip())
    if m:
        return {"name": m.group(1).strip(), "note": f"{m.group(2)} {m.group(3) or ''}".strip()}

    return {"name": text.strip(), "note": None}
