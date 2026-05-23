"""sumopod_client.py — HTTP client untuk SumoPod API (OpenAI-compatible).

Gunakan untuk AI chat & vision/OCR langsung dari SumoPod,
tanpa melalui Supabase Edge Function.
"""

import os
import httpx
import logging
import re
from typing import Optional
from datetime import datetime, timezone, timedelta

logger = logging.getLogger("yumi-finance.sumopod")

SUMODOP_BASE = os.getenv("NINEROUTER_BASE_URL", "http://127.0.0.1:20128/v1")
VISION_MODEL = os.getenv("NINEROUTER_VISION_MODEL") or os.getenv("SUMOPOD_VISION_MODEL", "ag/gemini-3-flash")
TEXT_MODEL = os.getenv("NINEROUTER_TEXT_MODEL") or os.getenv("SUMOPOD_TEXT_MODEL", "ag/gemini-3-flash")
WIB = timezone(timedelta(hours=7))

SYSTEM_PROMPT = """Kamu adalah Yumi Finance AI Agent — asisten keuangan & inventory untuk YumiPOS.
Tugasmu: memahami intent user dan menentukan action.

Action yang tersedia:
1. record_income — catat pemasukan (amount, description)
2. record_expense — catat pengeluaran (amount, description, category)
3. balance — cek saldo
4. summary — ringkasan periode
5. check_stock — cek stok inventory
6. marketlist — daftar belanja
7. restock — tambah stok barang
8. search — cari transaksi

            Balas dengan format:
ACTION: <action_name>
AMOUNT: <angka>
CATEGORY: <category>
MERCHANT: <nama toko/supplier>
PAYMENT_METHOD: <metode bayar — CASH|QRIS|BANK_TRANSFER|CREDIT_CARD>
DESCRIPTION: <deskripsi>
CONFIDENCE: high|medium|low
REPLY: <balasan ke user>

Jika tidak yakin, balas dengan ACTION: unknown dan tanya user untuk klarifikasi."""


class SumoPodClient:
    """Client untuk SumoPod API."""

    def __init__(self, api_key: str, base_url: str = SUMODOP_BASE):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")

    def _headers(self):
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    async def chat(
        self,
        message: str,
        system_prompt: str = SYSTEM_PROMPT,
        model: str = TEXT_MODEL,
        timeout: int = 60,
    ) -> dict:
        """Text chat completion via SumoPod.

        Returns dict with keys: action, amount, category, description,
        confidence, reply, raw (full response).
        """
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": message},
            ],
            "temperature": 0.1,
            "max_tokens": 512,
            "stream": False,
        }

        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                resp = await client.post(
                    f"{self.base_url}/chat/completions",
                    headers=self._headers(),
                    json=payload,
                )
                resp.raise_for_status()
                data = resp.json()
                reply = data["choices"][0]["message"]["content"]

            # Bersihkan code block markdown (\`\`\`) dari raw reply
            clean_reply = reply.strip()
            if clean_reply.startswith("```"):
                clean_reply = re.sub(r"^```\w*\n?", "", clean_reply)
                clean_reply = re.sub(r"\n?```\s*$", "", clean_reply)

            # Parse structured response
            action_match = re.search(r"ACTION:\s*(\w+)", clean_reply)
            amount_match = re.search(r"AMOUNT:\s*([\d.,]+)", clean_reply)
            cat_match = re.search(r"CATEGORY:\s*(\w+)", clean_reply)
            desc_match = re.search(r"DESCRIPTION:\s*(.+?)(?:\n|$)", clean_reply)
            conf_match = re.search(r"CONFIDENCE:\s*(\w+)", clean_reply)
            # REPLY: berhenti sebelum field berikutnya (word+colon) atau akhir string
            reply_match = re.search(r"REPLY:\s*(.+?)(?=\n\w+\s*:|\Z)", clean_reply, re.DOTALL)
            merchant_match = re.search(r"MERCHANT:\s*(.*?)(?:\n|$)", clean_reply)
            pm_match = re.search(r"PAYMENT_METHOD:\s*(.*?)(?:\n|$)", clean_reply)

            action = action_match.group(1) if action_match else "unknown"

            # Parse amount dengan support rb/k
            amount = 0
            if amount_match:
                raw = amount_match.group(1).replace(",", "")
                try:
                    amount = float(raw)
                except ValueError:
                    amount = 0

            # Parse items: "ITEMS: Timun|1|kg|8000, Selada|1|kg|40000" atau "ITEMS: Timun|1||8000, Selada|1||40000"
            items = []
            items_match = re.search(r"ITEMS:\s*(.+)", clean_reply)
            if items_match:
                raw_items = items_match.group(1).strip()
                for part in re.split(r'[,;]\s*', raw_items):
                    item_parts = part.split("|")
                    if len(item_parts) >= 4:
                        # name|qty|unit|price
                        try:
                            qty_raw = item_parts[1].strip()
                            # Handle fractions: "1/4" → 0.25
                            if "/" in qty_raw:
                                num, den = qty_raw.split("/", 1)
                                qty = float(num.strip()) / float(den.strip())
                            else:
                                qty = float(qty_raw)
                            # Strip dots from Indonesian thousands separator in price
                            price_raw = item_parts[3].strip().replace(",", "").replace(".", "")
                            items.append({
                                "name": item_parts[0].strip(),
                                "qty": qty,
                                "unit": item_parts[2].strip(),
                                "price": float(price_raw),
                            })
                        except (ValueError, ZeroDivisionError):
                            pass
                    elif len(item_parts) >= 3:
                        # name|qty|price
                        try:
                            qty_raw = item_parts[1].strip()
                            if "/" in qty_raw:
                                num, den = qty_raw.split("/", 1)
                                qty = float(num.strip()) / float(den.strip())
                            else:
                                qty = float(qty_raw)
                            price_raw = item_parts[2].strip().replace(",", "").replace(".", "")
                            items.append({
                                "name": item_parts[0].strip(),
                                "qty": qty,
                                "unit": "",
                                "price": float(price_raw),
                            })
                        except (ValueError, ZeroDivisionError):
                            pass
                    elif len(item_parts) >= 1:
                        items.append({
                            "name": item_parts[0].strip(),
                            "qty": 1,
                            "unit": "",
                            "price": 0,
                        })

            return {
                "action": action,
                "amount": amount,
                "category": cat_match.group(1) if cat_match else None,
                "description": desc_match.group(1).strip() if desc_match else message,
                "merchant": merchant_match.group(1).strip() if merchant_match else "",
                "payment_method": pm_match.group(1).strip().upper() if pm_match else "CASH",
                "confidence": conf_match.group(1) if conf_match else "medium",
                "reply": reply_match.group(1).strip() if reply_match else "",
                "items": items,
                "raw": reply,
            }
        except Exception as e:
            logger.warning("9router chat failed: %s", e)
            return {
                "action": "unknown",
                "amount": 0,
                "category": None,
                "description": message,
                "confidence": "low",
                "reply": "Maaf, AI finance sedang sibuk. Coba lagi sebentar lagi.",
                "raw": "",
            }

    async def vision(
        self,
        prompt: str,
        image_base64_uri: str,
        model: str = VISION_MODEL,
        timeout: int = 90,
    ) -> str:
        """Vision/OCR via SumoPod — kirim gambar + prompt, dapatkan text.

        image_base64_uri: data:image/jpeg;base64,<data>
        """
        # Validate format
        if not image_base64_uri.startswith("data:image"):
            raise ValueError("Format URI gambar tidak valid.")

        payload = {
            "model": model,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {
                            "type": "image_url",
                            "image_url": {"url": image_base64_uri},
                        },
                    ],
                }
            ],
            "temperature": 0.1,
            "max_tokens": 2048,
            "stream": False,
        }

        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                resp = await client.post(
                    f"{self.base_url}/chat/completions",
                    headers=self._headers(),
                    json=payload,
                )
                resp.raise_for_status()
                data = resp.json()
                return data["choices"][0]["message"]["content"]
        except Exception as e:
            logger.warning("SumoPod vision failed: %s", e)
            return f"Gagal OCR: {e}"

    async def vision_json(
        self,
        image_base64_uri: str,
        model: str = VISION_MODEL,
        timeout: int = 90,
    ) -> dict:
        """Vision/OCR via SumoPod — return structured JSON data from receipt.

        Returns dict with: type, name, category, items, total, date, time, merchant, receiptNumber, paymentMethod, confidence, rawText
        """
        prompt = """Analisis gambar struk/nota belanja ini dan ekstrak data dalam format JSON berikut (tanpa markdown, hanya JSON murni):
{
  "type": "expense",
  "name": "Nama Merchant/Toko",
  "category": "Kategori pengeluaran (misal: Makanan, Belanja, dll)",
  "transactionType": "expense",
  "total": 0,
  "subtotal": 0,
  "tax": 0,
  "serviceCharge": 0,
  "discount": 0,
  "items": [{"name": "Nama item", "qty": 1, "price": 0, "subtotal": 0, "unit": "pcs"}],
  "date": "YYYY-MM-DD",
  "time": "HH:MM",
  "receiptNumber": "Nomor struk",
  "paymentMethod": "Cash/Debit/Credit/QRIS",
  "notes": "",
  "confidence": 0.9,
  "rawText": "Teks dari struk"
}
Jika ada informasi yang tidak bisa dibaca, gunakan null atau 0. confidence antara 0-1.
WAJIB balas JSON valid saja. Jangan gunakan markdown, jangan penjelasan, jangan teks di luar JSON."""

        if not image_base64_uri.startswith("data:image"):
            return {"success": False, "error": "Format URI gambar tidak valid."}

        model_candidates = []
        for candidate in [model, TEXT_MODEL, VISION_MODEL]:
            if candidate and candidate not in model_candidates:
                model_candidates.append(candidate)

        last_error: Exception | None = None
        import json

        for idx, candidate in enumerate(model_candidates):
            payload = {
                "model": candidate,
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt},
                            {
                                "type": "image_url",
                                "image_url": {"url": image_base64_uri},
                            },
                        ],
                    }
                ],
                "temperature": 0.1,
                "max_tokens": 4096,
                "stream": False,
            }

            try:
                async with httpx.AsyncClient(timeout=timeout) as client:
                    resp = await client.post(
                        f"{self.base_url}/chat/completions",
                        headers=self._headers(),
                        json=payload,
                    )
                    resp.raise_for_status()
                    data = resp.json()
                    content = data["choices"][0]["message"]["content"]

                    # Extract JSON from response. If the vision model returns plain OCR text,
                    # keep the flow alive so app.py can parse rawText with its fallback parser.
                    json_match = re.search(r'\{[\s\S]*\}', content)
                    if not json_match:
                        logger.warning("9router vision_json returned non-JSON content from model=%s: %s", candidate, content[:500])
                        def _field_text(key: str):
                            m = re.search(rf'"{key}"\s*:\s*"([^"]*)"', content)
                            return m.group(1) if m else None

                        def _field_num(key: str):
                            m = re.search(rf'"{key}"\s*:\s*([0-9]+(?:\.[0-9]+)?)', content)
                            return float(m.group(1)) if m else 0

                        parsed = {
                            "type": _field_text("type") or "expense",
                            "name": _field_text("name"),
                            "category": _field_text("category"),
                            "transactionType": _field_text("transactionType") or "expense",
                            "total": _field_num("total"),
                            "subtotal": _field_num("subtotal"),
                            "tax": _field_num("tax"),
                            "serviceCharge": _field_num("serviceCharge"),
                            "discount": _field_num("discount"),
                            "items": [],
                            "date": _field_text("date"),
                            "time": _field_text("time"),
                            "receiptNumber": _field_text("receiptNumber"),
                            "paymentMethod": _field_text("paymentMethod"),
                            "notes": "AI mengembalikan JSON terpotong; field utama diekstrak otomatis.",
                            "confidence": _field_num("confidence") or 0.5,
                            "rawText": content,
                        }
                        return {"success": True, "data": parsed, "raw": content, "model": candidate}

                    try:
                        parsed = json.loads(json_match[0])
                    except json.JSONDecodeError as e:
                        logger.warning("9router vision_json returned invalid JSON from model=%s: %s", candidate, e)

                        def _field_text(key: str):
                            m = re.search(rf'"{key}"\s*:\s*"([^"]*)"', content)
                            return m.group(1) if m else None

                        def _field_num(key: str):
                            m = re.search(rf'"{key}"\s*:\s*([0-9]+(?:\.[0-9]+)?)', content)
                            return float(m.group(1)) if m else 0

                        parsed = {
                            "type": _field_text("type") or "expense",
                            "name": _field_text("name"),
                            "category": _field_text("category"),
                            "transactionType": _field_text("transactionType") or "expense",
                            "total": _field_num("total"),
                            "subtotal": _field_num("subtotal"),
                            "tax": _field_num("tax"),
                            "serviceCharge": _field_num("serviceCharge"),
                            "discount": _field_num("discount"),
                            "items": [],
                            "date": _field_text("date"),
                            "time": _field_text("time"),
                            "receiptNumber": _field_text("receiptNumber"),
                            "paymentMethod": _field_text("paymentMethod"),
                            "notes": "AI mengembalikan JSON tidak valid; field utama diekstrak otomatis.",
                            "confidence": _field_num("confidence") or 0.5,
                            "rawText": content,
                        }
                    if idx > 0:
                        logger.info("SumoPod vision_json fallback succeeded with model=%s", candidate)
                    return {"success": True, "data": parsed, "raw": content, "model": candidate}
            except httpx.HTTPStatusError as e:
                last_error = e
                code = getattr(e.response, "status_code", None)
                body = getattr(e.response, "text", "")[:500]
                logger.warning("9router vision_json model=%s failed with HTTP %s: %s body=%s", candidate, code, e, body)
                if code in (400, 401, 403, 429, 500, 502, 503, 504) and idx < len(model_candidates) - 1:
                    continue
                return {
                    "success": False,
                    "error": "AI vision sedang tidak menerima gambar ini. Coba ulangi atau input manual nominal, kategori, dan catatan.",
                    "model": candidate,
                }
            except Exception as e:
                last_error = e
                logger.warning("SumoPod vision_json model=%s failed: %s", candidate, e)
                if idx < len(model_candidates) - 1:
                    continue
                return {"success": False, "error": str(e), "model": candidate}

        return {"success": False, "error": str(last_error) if last_error else "Unknown OCR error", "model": model_candidates[-1] if model_candidates else model}
    async def vision_items(
        self,
        image_base64_uri: str,
        model: str = VISION_MODEL,
        timeout: int = 90,
    ) -> list[dict]:
        """Extract only receipt line items, separate from receipt summary JSON."""
        prompt = """Baca semua item barang pada struk ini. Balas format baris saja, tanpa markdown dan tanpa JSON:
NAMA_ITEM|QTY|HARGA_SATUAN|SUBTOTAL
Abaikan SUBTOTAL, TOTAL, CASH, CHANGE, DISCOUNT, MEMBER, PPN, dan pesan promosi.
Contoh: ROSE BRAND POUCH 2L|2|43950|87900
Harga rupiah tulis angka saja tanpa titik/koma."""
        payload = {
            "model": model,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {"type": "image_url", "image_url": {"url": image_base64_uri}},
                    ],
                }
            ],
            "temperature": 0.0,
            "max_tokens": 4096,
            "stream": False,
        }
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                resp = await client.post(
                    f"{self.base_url}/chat/completions",
                    headers=self._headers(),
                    json=payload,
                )
                resp.raise_for_status()
                data = resp.json()
                content = data["choices"][0]["message"]["content"]
        except Exception as e:
            logger.warning("9router vision_items failed: %s", e)
            return []

        import json
        items: list[dict] = []
        for line in content.splitlines():
            parts = [part.strip() for part in line.strip().strip('-').split('|')]
            if len(parts) >= 4 and parts[0]:
                try:
                    items.append({
                        "name": parts[0],
                        "qty": float(parts[1].replace(',', '.')),
                        "price": parts[2],
                        "subtotal": parts[3],
                        "unit": "",
                    })
                except Exception:
                    continue
        array_match = re.search(r"\[[\s\S]*\]", content)
        if array_match:
            try:
                parsed = json.loads(array_match[0])
                if isinstance(parsed, list):
                    items = parsed
            except Exception:
                items = []

        if not items:
            for obj in re.finditer(r"\{[^{}]*\}", content):
                block = obj.group(0)
                try:
                    item = json.loads(block)
                except Exception:
                    continue
                if isinstance(item, dict):
                    items.append(item)

        clean_items: list[dict] = []
        for item in items:
            name = str(item.get("name") or "").strip()
            if not name:
                continue
            upper = name.upper()
            if any(skip in upper for skip in ("TOTAL", "SUBTOTAL", "CASH", "CHANGE", "DISCOUNT", "MEMBER", "PPN")):
                continue
            try:
                qty = float(item.get("qty") or 1)
            except Exception:
                qty = 1.0
            try:
                price = float(str(item.get("price") or 0).replace(".", "").replace(",", ""))
            except Exception:
                price = 0.0
            try:
                subtotal = float(str(item.get("subtotal") or 0).replace(".", "").replace(",", ""))
            except Exception:
                subtotal = 0.0
            if subtotal <= 0 and price > 0:
                subtotal = qty * price
            clean_items.append({
                "name": name[:80],
                "qty": qty,
                "price": price,
                "subtotal": subtotal,
                "unit": str(item.get("unit") or "pcs"),
            })
        return clean_items[:80]

