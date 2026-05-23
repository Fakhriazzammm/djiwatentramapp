"""
receipt_restock.py — OCR receipt → parse items → fuzzy match inventory → auto restock

Flow:
  1. parse_items_from_ocr(ai_reply) → list of {name, qty, unit_price, total}
  2. build_inventory_lookup(inventory_list) → {clean_name: item} dict
  3. match_receipt_to_inventory(parsed, lookup) → list of MatchedItem
  4. format_review_message(matched) → Telegram plain-text review
  5. execute_restock(matched, supabase_fetch, supabase_patch) → bool

Dependencies: rapidfuzz (pip install rapidfuzz)
"""

import re
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone, timedelta

from rapidfuzz import fuzz, process

logger = logging.getLogger(__name__)

WIB = timezone(timedelta(hours=7))

# ── fuzzy match threshold ──────────────────────────────────────────
MIN_SCORE_AUTO = 60          # auto-match if score >= 60
MIN_SCORE_SUGGEST = 50       # show suggestion if >= 50, otherwise "tidak ditemukan"


# ── Regex: detect quantity suffix in receipt item names ─────────────
# e.g. "Saus Tiram 700ml" → factor=700, "Minyak 1L" → factor=1000, "Gula 1kg" → factor=1000
_QTY_SUFFIX_RE = re.compile(
    r'(\d+(?:\.\d+)?)\s*(ml|liter|lt|l|kg|gram|gr|g|pcs|pack|sachet|renceng)\b',
    re.IGNORECASE,
)

# Unit to base unit multipliers
_UNIT_TO_BASE: dict[str, float] = {
    "ml": 1, "liter": 1000, "lt": 1000, "l": 1000,
    "kg": 1000, "gram": 1, "gr": 1, "g": 1,
    "pcs": 1, "pack": 1, "sachet": 1, "renceng": 1,
}

def _extract_qty_suffix(name: str) -> tuple[float, str]:
    """Extract volume/weight suffix from receipt item name.
    Returns (conversion_factor, base_unit) or (0, '') if not found.
    """
    m = _QTY_SUFFIX_RE.search(name)
    if m:
        qty = float(m.group(1))
        unit = m.group(2).lower()
        multiplier = _UNIT_TO_BASE.get(unit, 1)
        # Map to standard unit
        if unit in ("liter", "lt", "l"):
            std_unit = "ml"
        elif unit in ("kg", "gram", "gr", "g"):
            std_unit = "gram"
        elif unit == "ml":
            std_unit = "ml"
        else:
            std_unit = unit
        return qty * multiplier, std_unit
    return 0, ""


@dataclass
class ParsedItem:
    """Raw item extracted from OCR/AI reply text."""
    name: str
    qty: float = 1
    unit_price: float = 0
    total: float = 0
    line: str = ""            # original line for debugging


@dataclass
class MatchedItem:
    """Receipt item matched (or unmatched) to an inventory item."""
    receipt_name: str
    receipt_qty: float
    receipt_unit_price: float
    receipt_total: float

    # inventory match
    inventory_id: str | None = None
    inventory_name: str | None = None
    inventory_unit: str | None = None
    score: int = 0
    is_matched: bool = False

    # restock calc
    add_base_qty: float = 0       # qty to add in base unit (ml/g/pcs)
    conversion_factor: float = 1.0
    purchase_unit: str = ""       # e.g. "botol 700ml"
    current_stock: float = 0
    new_stock: float = 0

    @property
    def status_emoji(self) -> str:
        if not self.is_matched:
            return "❓"
        if self.score >= MIN_SCORE_AUTO:
            return "✅"
        return "⚠️"


# ── Step 1: Parse items from AI OCR reply ──────────────────────────

def parse_items_from_ocr(text: str) -> list[ParsedItem]:
    """
    Extract line-item entries from Yumi AI OCR response.

    Handles formats like:
      • 1× Nama Item — Rp 25.800
      • Nama Item 2 pcs × Rp 15.000 = Rp 30.000
      1. Saus Tiram Lee Kum Kee - 2 x Rp 25.800 = Rp 51.600
      Saus Tiram   2   25,800   51,600   (table format)
    """
    items: list[ParsedItem] = []

    # Pattern 1: bullet/numbered with × or x
    # "1. Nama Item - 2 x Rp 25.800 = Rp 51.600"
    # "• 1× Nama Item — Rp 25.800"
    pat1 = re.compile(
        r'(?:^|\n)\s*(?:[\d]+[.)]\s*|[-•]\s*)?'
        r'(?:(\d+)\s*[×x]\s*)?'                # optional qty prefix
        r'(.+?)'                                 # item name (greedy-lazy)
        r'\s*[-–—]+\s*'                          # dash separator
        r'(?:(\d+)\s*[×x]\s*)?'                 # optional qty mid
        r'Rp\s*([\d.,]+)'                        # unit price
        r'(?:\s*=\s*Rp\s*([\d.,]+))?'           # optional total
        ,
        re.MULTILINE,
    )

    # Pattern 2: table-like (qty price total at end)
    pat2 = re.compile(
        r'(?:^|\n)\s*'
        r'([A-Za-z][A-Za-z0-9\s&.,()\-%/]+?)'   # item name
        r'\s{2,}'                                 # column gap
        r'(\d+(?:\.\d+)?)\s+'                     # qty
        r'([\d.,]+)'                              # price
        r'(?:\s+([\d.,]+))?'                      # optional total
        ,
        re.MULTILINE,
    )

    # Pattern 3: simple "Nama Item — Rp 25.800" (single item, qty=1)
    pat3 = re.compile(
        r'(?:^|\n)\s*(?:[\d]+[.)]\s*|[-•]\s*)?'
        r'(.+?)'
        r'\s*[-–—]+\s*'
        r'Rp\s*([\d.,]+)'
        ,
        re.MULTILINE,
    )

    # Try pattern 1 first (most specific)
    for m in pat1.finditer(text):
        qty_str = m.group(1) or m.group(3) or "1"
        name = (m.group(2) or "").strip()
        price_str = m.group(4)
        total_str = m.group(5)

        # Skip header lines / non-item lines
        if not name or len(name) < 2:
            continue
        if any(kw in name.lower() for kw in ["total", "subtotal", "diskon", "tunai", "kembali", "merchant"]):
            continue

        qty = _parse_num(qty_str)
        unit_price = _parse_num(price_str)
        total = _parse_num(total_str) if total_str else unit_price * qty

        items.append(ParsedItem(name=name, qty=qty, unit_price=unit_price, total=total, line=m.group(0)))

    # If pat1 found items, skip pat2/pat3
    if items:
        return items

    # Try pattern 2 (table format)
    for m in pat2.finditer(text):
        name = (m.group(1) or "").strip()
        qty_str = m.group(2)
        price_str = m.group(3)
        total_str = m.group(4)

        if not name or len(name) < 2:
            continue
        if any(kw in name.lower() for kw in ["total", "subtotal", "diskon", "tunai", "kembali"]):
            continue

        qty = _parse_num(qty_str)
        unit_price = _parse_num(price_str)
        total = _parse_num(total_str) if total_str else unit_price * qty

        items.append(ParsedItem(name=name, qty=qty, unit_price=unit_price, total=total, line=m.group(0)))

    if items:
        return items

    # Pattern 3: simple fallback (single items with price)
    for m in pat3.finditer(text):
        name = (m.group(1) or "").strip()
        price_str = m.group(2)

        if not name or len(name) < 2:
            continue
        if any(kw in name.lower() for kw in ["total", "subtotal", "diskon", "tunai", "kembali", "merchant"]):
            continue

        unit_price = _parse_num(price_str)
        items.append(ParsedItem(name=name, qty=1, unit_price=unit_price, total=unit_price, line=m.group(0)))

    return items


def _parse_num(s: str | None) -> float:
    """Parse Indonesian-formatted number: '25.800' or '25,800' → 25800.0"""
    if not s:
        return 0.0
    s = s.strip().replace(" ", "")
    # If has both . and , the last separator is decimal
    if "." in s and "," in s:
        if s.rfind(".") > s.rfind(","):
            # 25.800,50 → dot is thousands, comma is decimal
            s = s.replace(".", "").replace(",", ".")
        else:
            # 25,800.50 → comma is thousands, dot is decimal
            s = s.replace(",", "")
    elif "," in s and "." not in s:
        # Could be 25,800 (thousands) or 25,80 (decimal) — guess by position
        if len(s.split(",")[-1]) <= 2 and len(s) > 6:
            s = s.replace(",", ".")
        else:
            s = s.replace(",", "")
    elif "." in s and "," not in s:
        # Indonesian thousands format: "25.800" → 25800
        # Check if dots are thousands separators (3-digit groups)
        parts = s.split(".")
        if all(len(p) == 3 for p in parts[1:]):
            s = s.replace(".", "")
        # Otherwise, single dot could be decimal: "25.80" → 25.80
        # But price contexts usually have 3-digit groups
        elif len(parts) == 2 and len(parts[1]) <= 2 and len(parts[0]) <= 4:
            # Likely decimal: "25.80" → 25.80
            pass
        else:
            # Default: treat as thousands
            s = s.replace(".", "")
    try:
        return float(s)
    except ValueError:
        return 0.0


# ── Step 2: Build inventory lookup ─────────────────────────────────

def build_inventory_lookup(inventory: list[dict]) -> dict[str, dict]:
    """
    Build a lookup dict for fuzzy matching.
    Keys: multiple cleaned forms of each ingredient name.
    """
    lookup: dict[str, dict] = {}

    for item in inventory:
        name = item.get("ingredientName", "")
        if not name:
            continue

        # Multiple keys for the same item
        keys = {_clean(name)}

        # Add aliases from raw metadata
        raw = item.get("raw", {}) or {}
        aliases = raw.get("aliases", []) or []
        for alias in aliases:
            keys.add(_clean(alias))

        # Add brand-less variant: "Saus Tiram Lee Kum Kee" → "Saus Tiram"
        words = name.split()
        if len(words) >= 3:
            # Try removing last word (often brand)
            keys.add(_clean(" ".join(words[:-1])))
        if len(words) >= 4:
            # Try removing last 2 words (often brand + size)
            keys.add(_clean(" ".join(words[:-2])))

        for key in keys:
            if key and key not in lookup:
                lookup[key] = item

    return lookup


def _clean(s: str) -> str:
    """Normalize string for comparison: lowercase, remove punctuation, collapse spaces."""
    s = s.lower().strip()
    s = re.sub(r'[^\w\s]', ' ', s)
    s = re.sub(r'\s+', ' ', s)
    return s.strip()


# ── Step 3: Match receipt items to inventory ───────────────────────

def match_receipt_to_inventory(
    parsed: list[ParsedItem],
    lookup: dict[str, dict],
) -> list[MatchedItem]:
    """Fuzzy-match each parsed receipt item to inventory."""
    results: list[MatchedItem] = []

    for item in parsed:
        clean_name = _clean(item.name)

        # Strip volume/weight suffix for cleaner matching
        suffix_factor, _ = _extract_qty_suffix(item.name)
        if suffix_factor > 0:
            clean_name_no_suffix = _clean(_QTY_SUFFIX_RE.sub('', item.name))
        else:
            clean_name_no_suffix = clean_name

        # Try exact match first (both with and without suffix)
        for cn in (clean_name, clean_name_no_suffix):
            if cn in lookup:
                inv = lookup[cn]
                results.append(_build_matched(item, inv, 100))
                break
        else:
            # Try substring match (receipt name contains inventory key)
            best_score = 0
            best_key = ""
            for key in lookup:
                if key in clean_name or clean_name in key:
                    score = fuzz.ratio(clean_name, key)
                    if score > best_score:
                        best_score = score
                        best_key = key

            # Fuzzy match against all keys
            if best_score < MIN_SCORE_AUTO:
                scores = process.extract(clean_name, list(lookup.keys()), scorer=fuzz.token_sort_ratio, limit=3)
                if scores:
                    top_key, top_score, _ = scores[0]
                    if top_score > best_score:
                        best_score = top_score
                        best_key = top_key

            if best_score >= MIN_SCORE_SUGGEST and best_key in lookup:
                results.append(_build_matched(item, lookup[best_key], best_score))
            else:
                # Unmatched
                results.append(MatchedItem(
                    receipt_name=item.name,
                    receipt_qty=item.qty,
                    receipt_unit_price=item.unit_price,
                    receipt_total=item.total,
                    is_matched=False,
                    score=best_score,
                ))

    return results


def _build_matched(parsed: ParsedItem, inv: dict, score: int) -> MatchedItem:
    """Build a MatchedItem from a parsed receipt item + inventory item."""
    inv_unit = inv.get("unit", "") or ""
    conv_factor = float(inv.get("conversionFactor") or 1)
    purchase_unit_raw = inv.get("preferredPurchaseUnit", "") or ""
    purchase_qty = float(inv.get("preferredPurchaseQuantity") or 0)

    # Build human-readable purchase unit
    if purchase_unit_raw and purchase_qty:
        purchase_unit_str = f"{purchase_unit_raw} {purchase_qty:g}{inv_unit}"
    else:
        purchase_unit_str = inv_unit

    # Qty to add in base unit: receipt qty × conversion factor
    add_base_qty = parsed.qty

    # Strategy 1: Detect volume/weight suffix in receipt name (e.g. "700ml", "1L", "1kg")
    suffix_factor, suffix_unit = _extract_qty_suffix(parsed.name)
    if suffix_factor > 0:
        # If the suffix unit matches the inventory base unit, use the suffix factor
        if suffix_unit == inv_unit:
            add_base_qty = parsed.qty * suffix_factor
        elif inv_unit in ("ml", "gram") and suffix_unit in ("ml", "gram"):
            # Cross-unit match: both are volume/weight types
            add_base_qty = parsed.qty * suffix_factor

    # Strategy 2 (fallback): Check if purchase unit name is in receipt name
    elif purchase_unit_raw and purchase_qty and purchase_unit_raw.lower() in _clean(parsed.name):
        add_base_qty = parsed.qty * conv_factor

    current = float(inv.get("quantity") or 0)
    return MatchedItem(
        receipt_name=parsed.name,
        receipt_qty=parsed.qty,
        receipt_unit_price=parsed.unit_price,
        receipt_total=parsed.total,
        inventory_id=inv.get("_id", ""),
        inventory_name=inv.get("ingredientName", ""),
        inventory_unit=inv_unit,
        score=score,
        is_matched=True,
        add_base_qty=add_base_qty,
        conversion_factor=conv_factor,
        purchase_unit=purchase_unit_str,
        current_stock=current,
        new_stock=current + add_base_qty,
    )


# ── Step 4: Format review message ──────────────────────────────────

def format_review_message(matched: list[MatchedItem], merchant: str = "") -> str:
    """Format matched items for Telegram review (plain text)."""
    now = datetime.now(WIB)
    lines = [
        f"📦 RESTOCK — {now.strftime('%d/%m %H:%M')}",
    ]
    if merchant:
        lines.append(f"🏪 {merchant}")

    matched_count = sum(1 for m in matched if m.is_matched)
    unmatched_count = len(matched) - matched_count
    lines.append(f"")
    lines.append(f"Ditemukan {len(matched)} item — {matched_count} cocok, {unmatched_count} tidak dikenal")
    lines.append("")

    total_cost = 0.0
    for m in matched:
        emoji = m.status_emoji
        if m.is_matched:
            # ✅ Saus Tiram → Saus Tiram (+2100 ml) [score: 88]
            score_str = f" (cocok {m.score}%)" if m.score < 85 else ""
            lines.append(
                f"{emoji} {m.receipt_name} → {m.inventory_name}{score_str}"
            )
            lines.append(
                f"   +{m.add_base_qty:g} {m.inventory_unit}  "
                f"({m.current_stock:g} → {m.new_stock:g} {m.inventory_unit})"
            )
            if m.receipt_total > 0:
                lines.append(f"   Rp {m.receipt_total:,.0f}")
                total_cost += m.receipt_total
        else:
            lines.append(f"{emoji} {m.receipt_name} — tidak ditemukan di inventaris")

        lines.append("")

    lines.append("─" * 40)
    lines.append(f"🛍 {matched_count} item  •  Total Rp {total_cost:,.0f}")

    return "\n".join(lines)


# ── Step 5: Execute restock ────────────────────────────────────────

async def execute_restock(
    matched: list[MatchedItem],
    merchant: str,
    ocr_text: str,
    supabase_url: str,
    supabase_key: str,
    service_role_key: str,
) -> dict:
    """
    Update inventory quantities for all matched items.
    Uses PATCH requests to pos_inventory via Supabase REST API.

    Returns {"ok": bool, "updated": int, "errors": list}
    """
    import httpx

    matched_only = [m for m in matched if m.is_matched and m.add_base_qty > 0 and not m.inventory_id.startswith("inv_")]
    if not matched_only:
        return {"ok": False, "updated": 0, "errors": ["Tidak ada item yang cocok untuk di-update"]}

    headers = {
        "apikey": supabase_key,
        "Authorization": f"Bearer {service_role_key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }

    updated = 0
    errors: list[str] = []

    async with httpx.AsyncClient(timeout=30) as client:
        for m in matched_only:
            try:
                # PATCH inventory quantity
                patch_url = f"{supabase_url}/rest/v1/pos_inventory?_id=eq.{m.inventory_id}"
                new_qty = m.current_stock + m.add_base_qty

                resp = await client.patch(
                    patch_url,
                    headers=headers,
                    json={
                        "quantity": new_qty,
                        "lastPurchasePrice": m.receipt_unit_price,
                        "lastPurchaseAt": int(datetime.now(WIB).timestamp() * 1000),
                    },
                )
                if resp.status_code >= 400:
                    errors.append(f"{m.inventory_name}: HTTP {resp.status_code} {resp.text[:100]}")
                    continue

                # Insert purchase log (via RPC or direct insert into pos schema)
                # Try inserting into pos_purchase_logs if table exists
                log_payload = {
                    "inventory_id": m.inventory_id,
                    "ingredient_name": m.inventory_name,
                    "quantity_added": m.add_base_qty,
                    "unit": m.inventory_unit,
                    "unit_price": m.receipt_unit_price,
                    "total_cost": m.receipt_total,
                    "merchant": merchant[:200] if merchant else None,
                    "ocr_raw_text": ocr_text[:2000] if ocr_text else None,
                }

                log_resp = await client.post(
                    f"{supabase_url}/rest/v1/pos_purchase_logs",
                    headers=headers,
                    json=log_payload,
                )
                if log_resp.status_code >= 400:
                    # Table might not exist yet — non-fatal
                    logger.warning("Purchase log insert failed (non-fatal): %s", log_resp.status_code)

                updated += 1
                logger.info("Restocked %s: +%g %s (→ %g)", m.inventory_name, m.add_base_qty, m.inventory_unit, new_qty)

            except Exception as e:
                errors.append(f"{m.inventory_name}: {e}")

    return {"ok": len(errors) == 0, "updated": updated, "errors": errors}


# ── Auto-create new inventory items ─────────────────────────────────

async def auto_create_items(
    unmatched: list[MatchedItem],
    inventory_lookup: dict[str, dict],
    supabase_url: str,
    supabase_key: str,
    service_role_key: str,
) -> list[MatchedItem]:
    """
    Create new inventory entries for unmatched receipt items via Edge Function.
    Returns updated MatchedItem list with inventory IDs populated.
    """
    import httpx

    edge_url = f"{supabase_url}/functions/v1/yumi-ai"
    edge_headers = {
        "apikey": supabase_key,
        "Authorization": f"Bearer {supabase_key}",
        "Content-Type": "application/json",
    }

    created: list[MatchedItem] = []

    async with httpx.AsyncClient(timeout=30) as client:
        for m in unmatched:
            try:
                suffix_factor, suffix_unit = _extract_qty_suffix(m.receipt_name)
                unit = suffix_unit if suffix_unit else "pcs"
                conv_factor = suffix_factor if suffix_factor > 0 else 1.0

                purchase_unit = ""
                purchase_qty = 0.0
                if suffix_factor > 0:
                    purchase_qty = suffix_factor
                    m2 = _QTY_SUFFIX_RE.search(m.receipt_name)
                    if m2:
                        purchase_unit = m2.group(0).strip()

                payload = {
                    "action": "insertInventory",
                    "ingredientName": m.receipt_name,
                    "unit": unit,
                    "quantity": m.receipt_qty * (suffix_factor if suffix_factor > 0 else 1),
                    "lowStockThreshold": 0,
                    "lastPurchasePrice": m.receipt_unit_price,
                    "lastPurchaseAt": int(datetime.now(WIB).timestamp() * 1000),
                    "conversionFactor": conv_factor if conv_factor > 1 else None,
                    "preferredPurchaseUnit": purchase_unit or None,
                    "preferredPurchaseQuantity": purchase_qty if purchase_qty > 0 else None,
                    "raw": {"aliases": [m.receipt_name], "auto_created": True},
                }

                resp = await client.post(edge_url, headers=edge_headers, json=payload)

                if resp.status_code >= 400:
                    logger.warning("create item failed %s: %s %s",
                                   m.receipt_name, resp.status_code, resp.text[:200])
                    continue

                data = resp.json()
                if not data.get("success"):
                    err = data.get("error", "unknown")
                    if isinstance(err, dict):
                        err = err.get("message", "unknown")
                    logger.warning("insertInventory failed %s: %s",
                                   m.receipt_name, err)
                    continue

                # Edge function returns {success, sourceId} — use sourceId as inventory_id
                source_id = data.get("sourceId", "")
                if not source_id:
                    logger.warning("insertInventory: no sourceId for %s", m.receipt_name)
                    continue

                # Update matched item — mark as auto-created (score=100, qty already set in DB)
                m.inventory_id = source_id
                m.inventory_name = m.receipt_name
                m.inventory_unit = unit
                m.is_matched = True
                m.score = 100
                m.add_base_qty = m.receipt_qty * (suffix_factor if suffix_factor > 0 else 1)
                m.current_stock = 0
                m.new_stock = m.add_base_qty
                m.conversion_factor = conv_factor if conv_factor > 0 else 1.0
                m.purchase_unit = purchase_unit if purchase_unit else unit

                created.append(m)
                logger.info("Created new inventory item: %s (%s, +%g %s)",
                            m.receipt_name, source_id, m.add_base_qty, unit)

            except Exception as e:
                logger.warning("auto_create_items failed for %s: %s", m.receipt_name, e)

    return created


# ── Orchestrator: full restock flow (called from Telegram bot handler) ──

async def handle_restock_from_ocr(
    ocr_text: str,
    merchant: str,
    supabase_url: str,
    supabase_key: str,
    service_role_key: str,
) -> tuple[str, bool]:
    """
    Full restock pipeline: parse → match → review → execute.
    Returns (message, was_executed).

    If all items match with high confidence (>= MIN_SCORE_AUTO):
        auto-execute and return success message.
    Otherwise:
        return review message for user confirmation.
    """
    # Step 1: Parse
    parsed = parse_items_from_ocr(ocr_text)
    if not parsed:
        return (
            "📦 Tidak dapat menemukan item dalam struk.\n"
            "Pastikan foto struk jelas dan coba lagi.",
            False,
        )

    # Step 2: Fetch inventory
    import httpx
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.get(
            f"{supabase_url}/rest/v1/pos_inventory?select=*&limit=500",
            headers={"apikey": supabase_key, "Authorization": f"Bearer {supabase_key}"},
        )
        resp.raise_for_status()
        inventory = resp.json()

    if not inventory:
        return ("📦 Inventaris kosong — tidak ada yang bisa di-update.", False)

    # Step 3: Build lookup + match
    lookup = build_inventory_lookup(inventory)
    matched = match_receipt_to_inventory(parsed, lookup)

    # Step 4: Auto-create unmatched items
    # Treat as unmatched: not matched at all, OR score below auto threshold
    unmatched = [m for m in matched if not m.is_matched or m.score < MIN_SCORE_AUTO]
    created_count = 0
    if unmatched:
        created = await auto_create_items(
            unmatched, lookup,
            supabase_url, supabase_key, service_role_key,
        )
        created_count = len(created)
        # Update matched list: replace unmatched entries with newly created ones
        for i, m in enumerate(matched):
            if not m.is_matched or m.score < MIN_SCORE_AUTO:
                for c in created:
                    if c.receipt_name == m.receipt_name:
                        matched[i] = c
                        break

    # Step 5: Execute restock for existing items (skip auto-created, they already have stock)
    existing = [m for m in matched if m.is_matched and m.add_base_qty > 0 and not m.inventory_id.startswith("inv_")]
    
    errors = []
    existing_updated = 0
    if existing:
        result = await execute_restock(
            existing, merchant, ocr_text,
            supabase_url, supabase_key, service_role_key,
        )
        existing_updated = result["updated"]
        errors = result.get("errors", [])
    
    total_updated = existing_updated + created_count

    # Build result message
    msg_lines = []
    if errors:
        msg_lines.append("SEBAGIAN GAGAL DIUPDATE")
    elif total_updated > 0:
        msg_lines.append("STOK BERHASIL DIUPDATE")
    else:
        msg_lines.append("Tidak ada perubahan stok")

    msg_lines.append("")
    msg_lines.append(format_review_message(matched, merchant))
    msg_lines.append("")

    if created_count > 0:
        msg_lines.append(f"{created_count} item baru otomatis dibuat")
    if existing_updated > 0:
        msg_lines.append(f"{existing_updated} item existing diupdate")
    if errors:
        msg_lines.append(f"{len(errors)} error:")
        for err in errors[:5]:
            msg_lines.append(f"  {err}")

    return ("\n".join(msg_lines), True)

