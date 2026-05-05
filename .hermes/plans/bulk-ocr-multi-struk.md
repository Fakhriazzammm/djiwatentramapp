# Bulk OCR — Multi-Struk Implementation Plan

> **Untuk Hermes:** Gunakan `subagent-driven-development` skill untuk implementasi task-by-task.
> **Skill terkait:** `yumi-finance-ocr`, `subagent-driven-development`

**Goal:** User bisa kirim banyak foto struk sekaligus (album Telegram, max 10 foto) → semua diproses OCR secara concurrent → tampilkan ringkasan gabungan → user konfirmasi simpan semua atau pilih per struk.

**Architecture:** Tambah handler `on_album()` yang membaca `media_group_id` Telegram. Foto dikumpulkan dalam buffer per media_group_id, setelah 1.5 detik tidak ada update → trigger OCR concurrent untuk semua foto. Hasil digabung dalam satu summary message + inline keyboard: "💾 Simpan Semua", "📋 Pilih per Struk", "❌ Batal".

**Tech Stack:** python-telegram-bot `media_group_id`, `asyncio.gather()` untuk concurrent OCR, `_receipt_pending` dict yang sudah ada (extended untuk multi-receipt), inline keyboard baru.

**Batasan:**
- Maksimal 10 foto per album (Telegram limit)
- OCR concurrent tidak boleh lebih dari 3-4 panggilan sekaligus (SumoPod rate limit)
- Processing message harus ada progress bar (2/5 diproses...)
- Tidak ada perubahan pada flow single-struk (`on_photo`) — backward compatible

---

## Task 1: Tambah handler `on_album` dengan media_group_id buffer

**Objective:** Deteksi album multi-foto Telegram, kumpulkan foto sampai album komplit, lalu proses.

**Files:**
- Modify: `/opt/djiwatentramapp/yumi-finance-agent/app.py` — tambah handler baru
- Modify: `/opt/djiwatentramapp/yumi-finance-agent/app.py` — daftarkan handler di `main()`

**Step 1: Tambah buffer dan timer di top-level app.py**

```python
# Di dekat _receipt_pending, tambahkan:
import asyncio

# Buffer untuk album multi-foto
_album_buffer: dict[str, dict] = {}       # {media_group_id: {"photos": [file_ids], "timer": asyncio.Task, "chat_id": int}}
_album_lock = asyncio.Lock()
ALBUM_TIMEOUT = 1.5  # detik — tunggu sebelum proses (Telegram kirim foto berurutan)
```

**Step 2: Tambah fungsi `on_album()`**

```python
async def on_album(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle album multi-foto — buffer sampai lengkap, lalu OCR semua."""
    if not _is_finance_group(update):
        return

    media_group_id = update.message.media_group_id
    if not media_group_id:
        # Fallback ke single photo handler
        return await on_photo(update, context)

    photo = update.message.photo[-1]  # resolusi tertinggi
    chat_id = update.effective_chat.id

    async with _album_lock:
        if media_group_id not in _album_buffer:
            # Kirim pesan "mengumpulkan..."
            status_msg = await update.message.reply_text("📸 Mengumpulkan foto...")
            _album_buffer[media_group_id] = {
                "photos": [],
                "status_msg_id": status_msg.message_id,
                "chat_id": chat_id,
                "timer": None,
            }

        buf = _album_buffer[media_group_id]
        buf["photos"].append(photo)

        # Reset timer — tunggu 1.5 detik setelah foto terakhir
        if buf["timer"]:
            buf["timer"].cancel()
        buf["timer"] = asyncio.create_task(_process_album_after_delay(
            media_group_id, chat_id, context, buf["status_msg_id"]
        ))
```

**Step 3: Tambah fungsi delay processor**

```python
async def _process_album_after_delay(media_group_id: str, chat_id: int, context, status_msg_id: int):
    """Tunggu ALBUM_TIMEOUT detik, lalu proses semua foto di buffer."""
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

    # Lanjut ke Task 2 — OCR concurrent
    results = await _ocr_bulk(context, photos, chat_id, status_msg_id)
    await _display_bulk_summary(context, results, chat_id, status_msg_id)
```

**Step 4: Daftarkan handler di `main()`**

Ubah handler PHOTO yang ada:
```python
# Sebelumnya:
# app.add_handler(MessageHandler(filters.PHOTO, on_photo))

# Menjadi:
app.add_handler(MessageHandler(filters.PHOTO, on_album), group=1)
```

Atau tambahkan dengan group priority lebih tinggi:
```python
app.add_handler(MessageHandler(filters.PHOTO, on_album), group=0)
```

**Verifikasi:**
- Kirim 3 foto sekaligus dari Telegram → bot reply "📸 Mengumpulkan foto..." → "🔍 Memproses 3 struk sekaligus..."
- Kirim 1 foto → tetap jalan sebagai single-struk biasa (fallback ke `on_photo`)

---

## Task 2: OCR concurrent — `_ocr_bulk()` dengan progress update

**Objective:** Panggil `vision_json()` concurrent dengan `asyncio.gather()`, batasi max 3-4 concurrent, update progress.

**Files:**
- Modify: `/opt/djiwatentramapp/yumi-finance-agent/app.py` — tambah fungsi `_ocr_bulk()`

**Step 1: Concurrent OCR dengan semaphore**

```python
import asyncio

_MAX_CONCURRENT_OCR = 3  # batasi supaya tidak overload SumoPod

_ocr_semaphore = asyncio.Semaphore(_MAX_CONCURRENT_OCR)

async def _ocr_one(sp_client, photo, context, idx: int, total: int, chat_id: int, status_msg_id: int):
    """OCR satu foto, update progress."""
    try:
        file = await context.bot.get_file(photo.file_id)
        image_bytes = bytes(await file.download_as_bytearray())
        compressed_uri = _compress_image(image_bytes)

        async with _ocr_semaphore:
            vision_result = await sp_client.vision_json(image_base64_uri=compressed_uri, timeout=90)

        # Update progress
        done = idx + 1
        await context.bot.edit_message_text(
            chat_id=chat_id, message_id=status_msg_id,
            text=f"🔍 Memproses {total} struk... ({done}/{total})"
        )
        return vision_result
    except Exception as e:
        logger.error(f"OCR bulk error [{idx}/{total}]: {e}")
        return {"success": False, "error": str(e)}
```

**Step 2: Fungsi utama `_ocr_bulk()`**

```python
async def _ocr_bulk(context, photos: list, chat_id: int, status_msg_id: int) -> list[dict]:
    """Proses semua foto dalam album — return list of OCR results."""
    total = len(photos)
    sp_client = SumoPodClient(SUMOPOD_API_KEY)

    tasks = [
        _ocr_one(sp_client, photo, context, i, total, chat_id, status_msg_id)
        for i, photo in enumerate(photos)
    ]
    results = await asyncio.gather(*tasks)
    return list(results)
```

**Verifikasi:**
- Log: 3 foto diproses, progress message update `(1/3)`, `(2/3)`, `(3/3)`
- Semaphore: tidak lebih dari 3 concurrent call ke SumoPod

---

## Task 3: Format ringkasan gabungan + keyboard konfirmasi

**Objective:** Tampilkan semua hasil OCR dalam satu summary + inline keyboard bulk action.

**Files:**
- Modify: `/opt/djiwatentramapp/yumi-finance-agent/app.py` — tambah `_display_bulk_summary()`

**Step 1: Tampilan ringkasan**

```python
async def _display_bulk_summary(context, results: list[dict], chat_id: int, status_msg_id: int):
    """Tampilkan ringkasan semua struk + keyboard konfirmasi."""
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
    all_items = []
    receipt_list = []

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
            "payment_method": data.get("paymentMethod") or "",
            "receipt_number": data.get("receiptNumber") or "",
            "raw": data,
        })

        icon = "✅" if r.get("success") else "⚠️"
        lines.append(f"{i+1}. {icon} {merchant}")
        lines.append(f"   📅 {date_str}  |  💰 {format_amount(int(total_val))}")
        lines.append(f"   📦 {len(items)} item")
        lines.append("")

    if failures:
        lines.append(f"⚠️ {len(failures)} struk gagal dibaca")

    lines.append("─" * 20)
    lines.append(f"💸 TOTAL: {format_amount(int(grand_total))}")
    lines.append(f"📦 Total Item: {sum(len(ri['items']) for ri in receipt_list)}")
    lines.append("")

    # Simpan receipt list untuk callback
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
```

**Step 2: Tambah `_bulk_pending` dict**

```python
# Di dekat _receipt_pending
_bulk_pending: dict[str, list[dict]] = {}
```

**Verifikasi:**
- 3 struk OCR sukses → tampil: "📸 3 Struk Berhasil Dibaca!" → daftar merchant + total per struk → TOTAL gabungan
- Keyboard: 💰 Semua Pemasukan | 💸 Semua Pengeluaran | 📋 Pilih per Struk | ❌ Batal

---

## Task 4: Callback handler bulk action (simpan semua / pilih per struk / batal)

**Objective:** Tambah handler di `on_callback()` untuk callback `bulk_*`.

**Files:**
- Modify: `/opt/djiwatentramapp/yumi-finance-agent/app.py` — tambah di `on_callback()`

**Step 1: Tambah routing di awal `on_callback()`**

```python
async def on_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    data = query.data

    # ... existing receipt_* handlers ...

    # === BULK HANDLERS ===
    if data.startswith("bulk_"):
        return await _handle_bulk_callback(query, data)
    
    # ... rest of existing handlers ...
```

**Step 2: Fungsi `_handle_bulk_callback()`**

```python
async def _handle_bulk_callback(query, data: str):
    """Handle semua bulk action callback."""
    # Parse: bulk_{action}_{bulk_id}
    parts = data.split("_", 2)
    if len(parts) < 3:
        return True
    action = parts[1]  # income | expense | select | cancel
    bulk_id = parts[2]

    receipts = _bulk_pending.pop(bulk_id, None)
    if not receipts:
        try:
            await query.edit_message_text("❌ Sesi kadaluarsa.", reply_markup=_finance_keyboard())
        except Exception:
            pass
        return True

    if action == "cancel":
        await query.edit_message_text("❌ Dibatalkan.", reply_markup=_finance_keyboard())
        return True

    if action in ("income", "expense"):
        # Simpan semua
        tx_type = action
        saved = 0
        failed = 0
        total_all = 0

        for ri in receipts:
            raw = ri["raw"]
            # Bangun data receipt untuk record_transaction
            receipt_data = {
                "merchant": ri["merchant"],
                "date": ri["date"],
                "total": ri["total"],
                "items": ri["items"],
                "payment_method": ri["payment_method"],
                "receipt_number": ri["receipt_number"],
            }
            # Kategorisasi
            category_text = ri["merchant"] + " " + " ".join(it.get("name", "") for it in ri["items"])
            category, _ = auto_categorize(category_text)

            # Build description
            item_names = ", ".join(f"{it.get('name', '?')} ×{it.get('qty', 1)}" for it in ri["items"][:5])
            desc = f"Bulk {'Pemasukan' if tx_type == 'income' else 'Belanja'} - {ri['merchant']}: {item_names}"

            tx_result = await finance.record_transaction(
                tx_type=tx_type,
                amount=ri["total"] or 1,
                description=desc[:500],
                category=category,
                merchant=ri["merchant"],
                payment_method=ri["payment_method"],
                receipt_date_str=ri["date"],
                metadata={
                    "source": "yumi_finance_agent",
                    "ocr": True,
                    "bulk": True,
                    "bulk_id": bulk_id,
                    "receipt_number": ri["receipt_number"],
                    "receipt_date": ri["date"],
                    "item_count": len(ri["items"]),
                },
            )

            if tx_result.get("ok"):
                saved += 1
                total_all += ri["total"]
            else:
                failed += 1

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

        await query.edit_message_text("\n".join(lines), reply_markup=_finance_keyboard())

        # Restok inventory untuk setiap struk
        if tx_type == "expense":
            for ri in receipts:
                await _restok_bulk_items(query, ri)
        return True

    if action == "select":
        # Tampilkan pilihan per struk
        await _display_bulk_select(query, bulk_id, receipts)
        return True

    return False
```

**Step 3: Fungsi pilih per struk `_display_bulk_select()`**

```python
async def _display_bulk_select(query, bulk_id: str, receipts: list[dict]):
    """Tampilkan daftar struk untuk dipilih satu per satu."""
    # Taruh kembali ke pending untuk diproses satu per satu
    for ri in receipts:
        ref_id = f"rcpt_{len(_receipt_pending)}"
        _receipt_pending[ref_id] = {
            "merchant": ri["merchant"],
            "date": ri["date"],
            "items": ri["items"],
            "total": ri["total"],
            "payment_method": ri["payment_method"],
            "receipt_number": ri["receipt_number"],
            "category": "belanja_stok",
            "raw_text": "",
            "confidence": 0.9,
        }

    lines = [f"📋 {len(receipts)} struk siap diproses satu per satu:", ""]
    for i, ri in enumerate(receipts):
        lines.append(f"{i+1}. {ri['merchant']} — {format_amount(int(ri['total']))}")

    # Kirim sebagai pesan baru dengan keyboard finance
    await query.edit_message_text(
        "\n".join(lines),
        reply_markup=_finance_keyboard(),
    )

    # Mulai tampilkan struk pertama
    if _receipt_pending:
        first_id = list(_receipt_pending.keys())[0]
        # Kirim ulang tampilan struk pertama sebagai pesan baru
        # (akan muncul di chat yang sama)
```

**Verifikasi:**
- Klik 💰 Semua Pemasukan → semua struk disimpan sebagai income → tampil "Bulk Pemasukan Tercatat! ✅ 3/3"
- Klik 💸 Semua Pengeluaran → semua struk disimpan sebagai expense → inventory restok triggered
- Klik 📋 Pilih per Struk → tampil daftar → user bisa proses satu per satu seperti biasa
- Klik ❌ Batal → pesan dihapus, tidak ada yang disimpan

---

## Task 5: Restok inventory untuk bulk expense

**Objective:** Setelah bulk expense disimpan, auto-restok inventory untuk setiap item di semua struk.

**Files:**
- Modify: `/opt/djiwatentramapp/yumi-finance-agent/app.py` — tambah `_restok_bulk_items()`

**Step 1: Fungsi `_restok_bulk_items()`**

```python
async def _restok_bulk_items(query, receipt: dict):
    """Restok inventory dari satu struk dalam bulk."""
    items = receipt.get("items", [])
    if not items:
        return

    inventory_list = await inventory.get_all_inventory()
    for item in items:
        item_name = item.get("name", "").strip()
        if not item_name:
            continue

        # Cari match di inventory (pakai fuzzy matching yang sudah ada)
        matched = _find_inventory_match(item_name, inventory_list)
        if matched and matched.get("score", 0) >= 60:
            # Auto restok
            inv_id = matched.get("_id")
            await inventory.restock_item(inv_id, float(matched.get("quantity", 0)), item.get("qty", 0), item.get("unit", "pcs"))
        # Untuk score <60, skip dulu di bulk mode (terlalu banyak interaksi)
        # User bisa manual restok nanti
```

**Verifikasi:**
- Bulk expense 3 struk dengan total 10 item → inventory ter-update untuk item yang match score ≥60

---

## Task 6: Pilih per struk — next/prev navigation

**Objective:** Saat user klik "📋 Pilih per Struk", tampilkan struk pertama dengan keyboard next/prev untuk navigasi antar struk.

**Files:**
- Modify: `/opt/djiwatentramapp/yumi-finance-agent/app.py` — extend `_display_bulk_select()`

**Step 1: Tambah keyboard next/prev**

```python
async def _display_bulk_select(query, bulk_id: str, receipts: list[dict]):
    """Tampilkan daftar struk — user pilih satu per satu dengan navigasi."""
    
    # Simpan state ke _bulk_select_state
    _bulk_select_state[bulk_id] = {
        "receipts": receipts,
        "current_idx": 0,
        "processed": {},  # ref_id -> "income" | "expense" | "skip"
    }

    # Tampilkan struk pertama
    await _show_bulk_receipt(query, bulk_id, 0)
```

**Step 2: Fungsi `_show_bulk_receipt()`**

```python
async def _show_bulk_receipt(query, bulk_id: str, idx: int):
    """Tampilkan satu struk dari bulk dengan keyboard navigasi."""
    state = _bulk_select_state.get(bulk_id)
    if not state:
        return

    receipts = state["receipts"]
    n = len(receipts)
    ri = receipts[idx]

    # Format tampilan (mirip on_photo display)
    lines = [f"📸 Struk {idx+1}/{n}", ""]
    lines.append(f"🏪 {ri['merchant']}")
    if ri.get("date"):
        lines.append(f"📅 {ri['date']}")
    lines.append("")
    lines.append("Daftar Item:")
    for j, item in enumerate(ri.get("items", [])):
        name = item.get("name", "?")
        qty = item.get("qty", 1)
        price = item.get("price", 0)
        subtotal = item.get("subtotal", price * qty)
        lines.append(f"  {j+1}. {name} — {qty} × {format_amount(int(price))} = {format_amount(int(subtotal))}")
    lines.append("")
    lines.append(f"💸 TOTAL: {format_amount(int(ri['total']))}")

    # Keyboard
    buttons = [
        [
            InlineKeyboardButton("💰 Pemasukan", callback_data=f"bulkitem_income_{bulk_id}_{idx}"),
            InlineKeyboardButton("💸 Pengeluaran", callback_data=f"bulkitem_expense_{bulk_id}_{idx}"),
        ],
        [
            InlineKeyboardButton("⏭️ Lewati", callback_data=f"bulkitem_skip_{bulk_id}_{idx}"),
        ],
    ]

    # Nav buttons
    nav = []
    if idx > 0:
        nav.append(InlineKeyboardButton("◀️ Sebelumnya", callback_data=f"bulkitem_prev_{bulk_id}_{idx}"))
    if idx < n - 1:
        nav.append(InlineKeyboardButton("Selanjutnya ▶️", callback_data=f"bulkitem_next_{bulk_id}_{idx}"))
    if nav:
        buttons.append(nav)

    buttons.append([InlineKeyboardButton("💾 Selesai & Simpan Semua", callback_data=f"bulkitem_done_{bulk_id}")])

    await query.edit_message_text(
        "\n".join(lines),
        reply_markup=InlineKeyboardMarkup(buttons),
    )
```

**Step 3: Handler untuk `bulkitem_*` callbacks**

```python
async def _handle_bulkitem_callback(query, data: str):
    """Handle callback bulkitem_income_/expense_/skip_/prev_/next_/done_"""
    parts = data.split("_")
    action = parts[1]  # income | expense | skip | prev | next | done
    bulk_id = parts[2]

    state = _bulk_select_state.get(bulk_id)
    if not state:
        await query.edit_message_text("❌ Sesi kadaluarsa.", reply_markup=_finance_keyboard())
        return True

    if action == "done":
        # Simpan semua yang sudah di-process
        return await _finalize_bulk_items(query, bulk_id)

    idx = int(parts[3])
    receipts = state["receipts"]

    if action in ("income", "expense"):
        # Tandai struk ini
        ri = receipts[idx]
        ref_id = f"rcpt_{len(_receipt_pending)}"
        _receipt_pending[ref_id] = {
            "merchant": ri["merchant"],
            "date": ri["date"],
            "items": ri["items"],
            "total": ri["total"],
            "payment_method": ri["payment_method"],
            "receipt_number": ri["receipt_number"],
            "category": "belanja_stok" if action == "expense" else "penjualan",
            "raw_text": "",
            "confidence": 0.9,
        }

        # Langsung record
        await _record_single_receipt(ref_id, action)
        state["processed"][idx] = action

        # Auto-advance ke next
        next_idx = idx + 1
        if next_idx < len(receipts):
            return await _show_bulk_receipt(query, bulk_id, next_idx)
        else:
            return await _finalize_bulk_items(query, bulk_id)

    elif action == "skip":
        state["processed"][idx] = "skip"
        next_idx = idx + 1
        if next_idx < len(receipts):
            return await _show_bulk_receipt(query, bulk_id, next_idx)
        else:
            return await _finalize_bulk_items(query, bulk_id)

    elif action in ("prev", "next"):
        target_idx = idx - 1 if action == "prev" else idx + 1
        if 0 <= target_idx < len(receipts):
            return await _show_bulk_receipt(query, bulk_id, target_idx)

    return True
```

**Verifikasi:**
- "📋 Pilih per Struk" → tampil Struk 1/3 dengan keyboard lengkap
- Klik 💸 → record expense, auto-advance ke struk 2/3
- Klik ⏭️ Lewati → skip, auto-advance
- Klik ◀️ Sebelumnya / Selanjutnya ▶️ → navigasi
- Klik 💾 Selesai → finalisasi, tampilkan summary

---

## Task 7: Finalisasi bulk items + summary

**Objective:** Setelah semua struk diproses (satu per satu), tampilkan summary akhir.

**Files:**
- Modify: `/opt/djiwatentramapp/yumi-finance-agent/app.py` — tambah `_finalize_bulk_items()`

**Step 1: Fungsi finalisasi**

```python
async def _finalize_bulk_items(query, bulk_id: str):
    """Finalisasi bulk selection — tampilkan summary akhir."""
    state = _bulk_select_state.pop(bulk_id, None)
    if not state:
        return

    receipts = state["receipts"]
    processed = state["processed"]

    income_count = sum(1 for v in processed.values() if v == "income")
    expense_count = sum(1 for v in processed.values() if v == "expense")
    skip_count = sum(1 for v in processed.values() if v == "skip")

    income_total = sum(ri["total"] for i, ri in enumerate(receipts) if processed.get(i) == "income")
    expense_total = sum(ri["total"] for i, ri in enumerate(receipts) if processed.get(i) == "expense")

    lines = ["📊 Bulk Processing Selesai!", ""]
    lines.append(f"💰 Pemasukan: {income_count} struk — {format_amount(int(income_total))}")
    lines.append(f"💸 Pengeluaran: {expense_count} struk — {format_amount(int(expense_total))}")
    if skip_count:
        lines.append(f"⏭️ Dilewati: {skip_count} struk")
    lines.append("")
    lines.append("✅ Semua transaksi tersimpan!")

    await query.edit_message_text(
        "\n".join(lines),
        reply_markup=_finance_keyboard(),
    )
```

**Step 2: Daftarkan handler `bulkitem_*` di `on_callback()`**

```python
if data.startswith("bulkitem_"):
    return await _handle_bulkitem_callback(query, data)
```

---

## Task 8: Integration test & edge cases

**Objective:** Test seluruh flow bulk OCR, tangani edge cases.

**Files:**
- Tidak ada perubahan kode baru

**Edge cases yang harus di-test:**

| Edge Case | Expected Behavior |
|-----------|-------------------|
| Kirim 1 foto (bukan album) | Fallback ke `on_photo` normal |
| Kirim 10 foto sekaligus | Semua diproses, progress 1/10...10/10 |
| SumoPod rate limit / timeout | Foto yang gagal ditampilkan dengan ⚠️, sisanya tetap diproses |
| User kirim album kedua sebelum album pertama selesai | Album kedua masuk buffer terpisah (beda `media_group_id`) |
| 2-3 foto gagal OCR | Summary: "2/3 berhasil, 1 gagal", button "Simpan yang berhasil" |
| Semua foto gagal OCR | "❌ Semua struk gagal dibaca" |
| User klik Batal di tengah bulk select | State dibersihkan, tidak ada transaksi tersimpan |
| Struk tanpa tanggal (OCR gagal extract date) | `receipt_date_str=None` → fallback ke `datetime.now(WIB)` |
| `tx_date` bulk = tanggal struk masing-masing | Setiap struk pakai tanggal sendiri dari OCR |

**Verification commands:**
```bash
# Cek service
sudo systemctl status yumi-finance-agent

# Cek log bulk OCR
journalctl -u yumi-finance-agent --since '1 min ago' | grep -i 'bulk\|album\|media_group'

# Cek transaksi bulk di DB
curl -s 'SUPABASE_URL/rest/v1/pos_financial_transactions?select=metadata&metadata->>bulk=eq.true' \
  -H "apikey: KEY" -H "Authorization: Bearer KEY"
```

---

## Summary — Semua File yang Diubah

| File | Tasks |
|------|-------|
| `/opt/djiwatentramapp/yumi-finance-agent/app.py` | Task 1-7 (semua) |

**Tidak ada file baru** — semua perubahan di `app.py` karena fitur ini adalah ekstensi dari flow OCR yang sudah ada.

---

## Urutan Implementasi

```
Task 1 → Task 2 → Task 3 → Task 4 → Task 5 → Task 6 → Task 7 → Task 8
 (buffer)  (OCR)   (display) (save)   (restok) (select) (finalize) (test)
```

Setiap task bisa di-test secara terpisah dengan dummy data sebelum lanjut ke task berikutnya.
