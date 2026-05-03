"""sumopod_client.py — HTTP client untuk SumoPod API (OpenAI-compatible).

Gunakan untuk AI chat & vision/OCR langsung dari SumoPod,
tanpa melalui Supabase Edge Function.
"""

import httpx
import logging
import re
from typing import Optional
from datetime import datetime, timezone, timedelta

logger = logging.getLogger("yumi-finance.sumopod")

SUMODOP_BASE = "https://ai.sumopod.com/v1"
VISION_MODEL = "seed-2-0-mini"
TEXT_MODEL = "gpt-4o-mini"
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

            # Parse structured response
            action_match = re.search(r"ACTION:\s*(\w+)", reply)
            amount_match = re.search(r"AMOUNT:\s*([\d.,]+)", reply)
            cat_match = re.search(r"CATEGORY:\s*(\w+)", reply)
            desc_match = re.search(r"DESCRIPTION:\s*(.+?)(?:\n|$)", reply)
            conf_match = re.search(r"CONFIDENCE:\s*(\w+)", reply)
            reply_match = re.search(r"REPLY:\s*(.+?)$", reply, re.DOTALL)

            action = action_match.group(1) if action_match else "unknown"

            # Parse amount dengan support rb/k
            amount = 0
            if amount_match:
                raw = amount_match.group(1).replace(",", "")
                try:
                    amount = float(raw)
                except ValueError:
                    amount = 0

            return {
                "action": action,
                "amount": amount,
                "category": cat_match.group(1) if cat_match else None,
                "description": desc_match.group(1).strip() if desc_match else message,
                "confidence": conf_match.group(1) if conf_match else "medium",
                "reply": reply_match.group(1).strip() if reply_match else "",
                "raw": reply,
            }
        except Exception as e:
            logger.warning("SumoPod chat failed: %s", e)
            return {
                "action": "unknown",
                "amount": 0,
                "category": None,
                "description": message,
                "confidence": "low",
                "reply": f"Maaf, AI sedang sibuk. Coba lagi nanti. ({e})",
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
Jika ada informasi yang tidak bisa dibaca, gunakan null atau 0. confidence antara 0-1."""

        if not image_base64_uri.startswith("data:image"):
            return {"success": False, "error": "Format URI gambar tidak valid."}

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

                # Extract JSON from response
                json_match = re.search(r'\{[\s\S]*\}', content)
                if not json_match:
                    return {"success": False, "error": "Tidak bisa parse JSON dari respons AI", "raw": content}

                import json
                parsed = json.loads(json_match[0])
                return {"success": True, "data": parsed, "raw": content}
        except Exception as e:
            logger.warning("SumoPod vision_json failed: %s", e)
            return {"success": False, "error": str(e)}
