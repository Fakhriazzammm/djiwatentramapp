"""
local_ocr.py — Local OCR fallback using EasyOCR + DeepSeek (text model) parsing.

Flow:
1. EasyOCR extracts raw text from receipt image (CPU, ~3-5s)
2. Raw text sent to DeepSeek via 9router (text model, already working)
3. DeepSeek parses into structured JSON matching vision_json() output format

This allows OCR to work even when SumoPod vision API is down.
"""

import os
import io
import json
import re
import logging
import time
from typing import Optional

logger = logging.getLogger("yumi-finance.local_ocr")

# Lazy singleton — EasyOCR reader initialized once
_reader = None


def _get_reader():
    global _reader
    if _reader is None:
        import easyocr
        logger.info("Initializing EasyOCR reader (lang=id, CPU)...")
        t0 = time.time()
        _reader = easyocr.Reader(["id"], gpu=False)
        logger.info("EasyOCR initialized in %.1fs", time.time() - t0)
    return _reader


def extract_text(image_bytes: bytes) -> str:
    """Run EasyOCR on image bytes, return raw text (one line per detected block)."""
    reader = _get_reader()
    t0 = time.time()

    # Run OCR without paragraph to get individual text segments with confidence
    result = reader.readtext(image_bytes)

    lines = []
    for item in result:
        # Format: ([bbox_coords], text, confidence)
        text = str(item[1]).strip()
        conf = float(item[2])
        if text and conf >= 0.2:  # filter low-confidence noise
            lines.append(text)

    raw = "\n".join(lines)
    logger.info("EasyOCR: %d lines in %.1fs (conf>=0.2)", len(lines), time.time() - t0)
    return raw


def _parse_amount_text(text: str) -> float:
    """Parse Indonesian amount: Rp180.500 → 180500, Rp1.234 → 1234"""
    if not text:
        return 0.0
    # Remove 'Rp' prefix and spaces
    clean = re.sub(r"[RpRp\s]", "", text)
    # Replace comma decimal with dot
    clean = clean.replace(",", ".")
    # Remove thousand separators (dots)
    if clean.count(".") > 1:
        clean = clean.replace(".", "")
    elif clean.count(".") == 1:
        # Could be decimal or thousand separator
        # If after dot there are exactly 3 digits, it's thousand separator
        parts = clean.split(".")
        if len(parts) == 2 and len(parts[1]) == 3:
            clean = parts[0] + parts[1]
        # Otherwise keep as decimal
    try:
        return float(clean)
    except ValueError:
        return 0.0


def _parse_merchant(raw_text: str) -> str:
    """Extract likely merchant name from first meaningful line."""
    lines = [l.strip() for l in raw_text.split("\n") if l.strip()]
    skip_keywords = [
        "total", "subtotal", "cash", "change", "kembali", "tunai",
        "debit", "credit", "qris", "transfer", "pembayaran",
        "item", "qty", "harga", "discount", "ppn", "tax", "pajak",
        "terima kasih", "thank you", "selamat", "no.", "nota",
        "struk", "receipt", "order", "meja", "table",
        "jl.", "jalan", "telp", "phone", "hp.",
    ]
    for line in lines[:10]:
        line_lower = line.lower()
        if len(line) >= 5 and not any(
            line_lower.startswith(sk) for sk in skip_keywords
        ):
            # Skip lines that look like addresses (contain numbers at start)
            if re.match(r"^\d", line):
                continue
            # Skip date/time lines
            if re.match(r"\d{1,2}[/-]\d{1,2}[/-]\d{2,4}", line):
                continue
            return line[:80]
    return ""


def _parse_receipt_number(raw_text: str) -> str:
    """Extract receipt number if present."""
    m = re.search(
        r"(?:no\.?|nota|receipt|struk|order)\s*[#:]?\s*([A-Z0-9][-A-Z0-9]{2,20})",
        raw_text,
        re.IGNORECASE,
    )
    return m.group(1) if m else ""


def _parse_total(raw_text: str) -> float:
    """Extract total amount from receipt text."""
    # Look for TOTAL: / TOTAL RP / etc
    patterns = [
        r"(?:total|jumlah|grand\s*total)\s*[:\s]*[Rr]p?\s*([\d.]+(?:[.,]\d+)?)",
        r"(?:total|jumlah|grand\s*total)\s*[:\s]*([\d.]+(?:[.,]\d+)?)",
        r"(?:bayar|tunai)\s*[:\s]*[Rr]p?\s*([\d.]+(?:[.,]\d+)?)",
    ]
    for pat in patterns:
        m = re.search(pat, raw_text, re.IGNORECASE)
        if m:
            val = _parse_amount_text(m.group(1))
            if val > 0:
                return val
    # Fallback: find the largest number in the text
    numbers = []
    for m in re.finditer(r"[Rr]p?\s*([\d.]+(?:[.,]\d+)?)", raw_text):
        val = _parse_amount_text(m.group(1))
        if val > 0:
            numbers.append(val)
    return max(numbers) if numbers else 0.0


def _parse_text_items(raw_text: str) -> list[dict]:
    """Parse line items from raw OCR text using regex patterns.

    Returns same format as vision_json() items: [{name, qty, price, subtotal}]
    """
    items = []
    lines = [l.strip() for l in raw_text.split("\n") if l.strip()]
    skip_names = {
        "total", "subtotal", "cash", "change", "kembali", "tunai",
        "debit", "credit", "qris", "transfer", "pembayaran",
        "discount", "ppn", "tax", "pajak", "terima kasih",
        "thank you", "no.", "nota", "struk", "receipt", "order",
    }

    def _is_price_line(t: str) -> bool:
        return bool(re.match(r"^[Rr]p\s*[\d.]+(?:[.,]\d+)?", t))

    def _is_qty_line(t: str) -> bool:
        return bool(re.match(r"^x\s*\d+(?:[.,]\d+)?", t.lower()))

    def _parse_price(t: str) -> float:
        m = re.search(r"[\d.]+(?:[.,]\d+)?", t.replace("Rp", "").replace("rp", "").strip())
        return _parse_amount_text(m.group(0)) if m else 0.0

    i = 0
    while i < len(lines):
        line = lines[i]

        # Skip separator lines
        if re.match(r"^[=\-]{3,}$", line):
            i += 1
            continue

        # Skip total/cash/change lines
        line_lower = line.lower()
        if any(line_lower.startswith(sk) for sk in skip_names):
            i += 1
            continue

        # Pattern: ItemName x Qty @ Price (single line)
        m = re.match(
            r"^([A-Za-z0-9][A-Za-z0-9\s.&/+-]{2,}?)\s+(?:x\s*)?(\d+(?:[.,]\d+)?)\s*[xX@]\s*[Rr]p\s*([\d.]+)",
            line,
        )
        if m:
            name = m.group(1).strip()
            qty = float(m.group(2).replace(",", "."))
            price = _parse_amount_text(m.group(3))
            if name.lower() not in skip_names:
                items.append({"name": name[:80], "qty": qty, "price": price, "subtotal": price * qty})
            i += 1
            continue

        # Pattern: Qty x ItemName @ Price
        m = re.match(
            r"^(\d+(?:[.,]\d+)?)\s*[xX]\s*([A-Za-z0-9][A-Za-z0-9\s.&/+-]{2,}?)\s*(?:@\s*)?[Rr]p?\s*([\d.]+)",
            line,
        )
        if m:
            qty = float(m.group(1).replace(",", "."))
            name = m.group(2).strip()
            price = _parse_amount_text(m.group(3))
            if name.lower() not in skip_names:
                items.append({"name": name[:80], "qty": qty, "price": price, "subtotal": price * qty})
            i += 1
            continue

        # Multi-line item: try to group (name) + (qty/x N) + (RpPrice)
        # Check if next lines contain qty and price
        if i + 2 < len(lines):
            name = line
            qty_line = lines[i + 1]
            price_line = lines[i + 2]

            if _is_qty_line(qty_line) and _is_price_line(price_line):
                qty = float(qty_line.lower().replace("x", "").strip())
                price = _parse_price(price_line)
                if name.lower() not in skip_names and price > 0:
                    items.append({"name": name[:80], "qty": qty, "price": price, "subtotal": price * qty})
                i += 3
                continue

        # Multi-line: (name + qty) + (price)
        if i + 1 < len(lines):
            name = line
            price_line = lines[i + 1]
            if _is_price_line(price_line):
                price = _parse_price(price_line)
                # Check if name ends with qty like "Beras 5kg"
                qty = 1.0
                qty_m = re.search(r"\b(\d+(?:[.,]\d+)?)\s*(kg|gr|gram|g|l|liter|ml|pcs|pack|ikat|bungkus)?\s*$", name, re.IGNORECASE)
                if qty_m:
                    qty = float(qty_m.group(1).replace(",", "."))
                if name.lower() not in skip_names and price > 0:
                    items.append({"name": name[:80], "qty": qty, "price": price / qty if qty > 0 else price, "subtotal": price})
                i += 2
                continue

        # Single price-only line: ItemName RpPrice
        m = re.match(r"^([A-Za-z0-9][A-Za-z0-9\s.&/+-]{2,}?)\s+[Rr]p\s*([\d.]+(?:[.,]\d+)?)", line)
        if m:
            name = m.group(1).strip()
            price = _parse_amount_text(m.group(2))
            if name.lower() not in skip_names and price > 0:
                items.append({"name": name[:80], "qty": 1, "price": price, "subtotal": price})
            i += 1
            continue

        i += 1

    return items[:50]


async def local_vision_json(
    image_bytes: bytes,
    sumopod_client=None,
) -> dict:
    """Drop-in replacement for SumoPodClient.vision_json().

    Uses EasyOCR + regex parsing to extract receipt data locally.
    Returns same dict format: {success, data: {name, items, total, date, ...}}

    If sumopod_client is provided and available, uses it for AI parsing
    of the OCR text (better structured output). Otherwise uses regex parsing.
    """
    t0 = time.time()

    try:
        raw_text = extract_text(image_bytes)
    except Exception as e:
        logger.error("EasyOCR extraction failed: %s", e)
        return {"success": False, "error": f"Gagal OCR lokal: {e}"}

    if not raw_text.strip():
        return {
            "success": False,
            "error": "Tidak ada teks terbaca dari gambar. Coba foto dengan pencahayaan lebih baik.",
        }

    ocr_time = time.time() - t0
    logger.info("Local OCR extracted %d chars in %.1fs", len(raw_text), ocr_time)

    # Try AI parsing if sumopod_client is available (DeepSeek text model works)
    ai_parsed = False
    if sumopod_client:
        try:
            ai_result = await _ai_parse_receipt(sumopod_client, raw_text)
            if ai_result:
                ai_parsed = True
                data = ai_result
                data["rawText"] = raw_text
                data["_ocr_local"] = True
                total_time = time.time() - t0
                logger.info(
                    "Local OCR + AI parse: %d items in %.1fs (OCR %.1fs + AI %.1fs)",
                    len(data.get("items", [])),
                    total_time,
                    ocr_time,
                    total_time - ocr_time,
                )
                return {"success": True, "data": data, "model": "local_ocr+ai"}
        except Exception as e:
            logger.warning("AI parsing of local OCR text failed: %s", e)

    # Fallback to regex-only parsing
    items = _parse_text_items(raw_text)
    merchant = _parse_merchant(raw_text)
    total = _parse_total(raw_text)
    receipt_number = _parse_receipt_number(raw_text)

    data = {
        "type": "expense",
        "name": merchant,
        "category": "",
        "transactionType": "expense",
        "total": total,
        "subtotal": total,
        "tax": 0,
        "serviceCharge": 0,
        "discount": 0,
        "items": items,
        "date": "",
        "time": "",
        "receiptNumber": receipt_number,
        "paymentMethod": "",
        "notes": "Local OCR (regex parsing)",
        "confidence": 0.7 if items else 0.3,
        "rawText": raw_text,
        "_ocr_local": True,
    }

    total_time = time.time() - t0
    logger.info(
        "Local OCR (regex): %d items in %.1fs",
        len(items),
        total_time,
    )
    return {"success": True, "data": data, "model": "local_ocr"}


async def _ai_parse_receipt(sumopod_client, raw_text: str) -> Optional[dict]:
    """Send OCR raw text to DeepSeek text model for structured parsing.

    This uses the text model (ds/deepseek-v4-flash) which is working,
    unlike vision models.
    """
    prompt = f"""Analisis teks struk belanja berikut dan ekstrak data dalam format JSON.

TEKS STRUK:
```
{raw_text[:4000]}
```

Balas ONLY JSON (no markdown, no explanation):
{{
  "merchant": "Nama toko",
  "date": "YYYY-MM-DD" atau "",
  "time": "HH:MM" atau "",
  "total": jumlah angka,
  "items": [
    {{"name": "Nama item", "qty": jumlah, "price": harga_satuan, "subtotal": jumlah_x_harga}}
  ],
  "receiptNumber": "",
  "paymentMethod": ""
}}

PENTING:
- Ekstrak SEMUA item yang terbaca
- Jika tidak yakin, isi dengan ""
- Harga pakai angka (180500 bukan Rp180.500)
- Jumlah qty pakai angka (2.5 untuk 2,5)
"""

    try:
        payload = {
            "model": "",  # Will use TEXT_MODEL from sumopod_client
            "messages": [
                {
                    "role": "system",
                    "content": "Kamu adalah asisten OCR struk. Ekstrak data dari teks OCR ke JSON.",
                },
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.1,
            "max_tokens": 4096,
            "stream": False,
        }

        import httpx

        headers = sumopod_client._headers() if sumopod_client else {"Authorization": "", "Content-Type": "application/json"}
        base_url = sumopod_client.base_url if sumopod_client else (os.getenv("NINEROUTER_BASE_URL") or "http://127.0.0.1:20128/v1")

        # Use the text model (not vision model)
        model = os.getenv("NINEROUTER_TEXT_MODEL") or "ds/deepseek-v4-flash"
        payload["model"] = model

        # Fix empty auth header — 9router doesn't need auth
        if not headers.get("Authorization") or headers["Authorization"] in ("Bearer ", "Bearer"):
            headers["Authorization"] = "Bearer skip"  # 9router ignores auth

        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                f"{base_url}/chat/completions",
                headers=headers,
                json=payload,
            )
            resp.raise_for_status()
            data = resp.json()
            content = data["choices"][0]["message"]["content"]

        # Extract JSON
        json_match = re.search(r"\{[\s\S]*\}", content)
        if not json_match:
            logger.warning("AI parse: no JSON found in response")
            return None

        parsed = json.loads(json_match[0])

        result = {
            "type": "expense",
            "name": parsed.get("merchant", ""),
            "category": "",
            "transactionType": "expense",
            "total": float(parsed.get("total", 0)),
            "subtotal": float(parsed.get("total", 0)),
            "tax": 0,
            "serviceCharge": 0,
            "discount": 0,
            "items": [],
            "date": parsed.get("date", ""),
            "time": parsed.get("time", ""),
            "receiptNumber": parsed.get("receiptNumber", ""),
            "paymentMethod": parsed.get("paymentMethod", ""),
            "notes": "Local OCR + AI parsing",
            "confidence": 0.85,
        }

        items_raw = parsed.get("items", [])
        for it in items_raw:
            name = (it.get("name") or "").strip()
            if not name:
                continue
            qty = float(it.get("qty", 1))
            price = float(it.get("price", 0))
            subtotal = float(it.get("subtotal", 0)) or (price * qty)
            result["items"].append({
                "name": name[:80],
                "qty": qty,
                "price": price,
                "subtotal": subtotal,
            })

        return result

    except Exception as e:
        logger.warning("AI receipt parsing failed: %s", e)
        return None
