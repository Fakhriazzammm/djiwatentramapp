"""orchestrator.py — AI Orchestrator Core Yumi Finance.

Decision engine yang menentukan action dari input user.
Bisa handle structured command langsung, atau fallback ke SumoPod AI.
"""

import re
import logging
from datetime import datetime, timezone, timedelta

from sumopod_client import SumoPodClient, TEXT_MODEL

logger = logging.getLogger(__name__)
WIB = timezone(timedelta(hours=7))


class OrchestratorResult:
    """Hasil parsing orchestrator."""

    def __init__(
        self,
        action: str,
        text: str | None = None,
        amount: float = 0,
        category: str | None = None,
        description: str = "",
        merchant: str = "",
        items: list[dict] | None = None,
        confidence: str = "high",
        needs_confirmation: bool = False,
    ):
        self.action = action
        self.text = text
        self.amount = amount
        self.category = category
        self.description = description
        self.merchant = merchant
        self.items = items or []
        self.confidence = confidence
        self.needs_confirmation = needs_confirmation


class FinanceOrchestrator:
    """AI Orchestrator — decision engine untuk input user.

    Menggunakan SumoPod (gpt-4o-mini / kimi-k2.6) untuk AI fallback,
    bukan Supabase Edge Function.
    """

    def __init__(self, sumopod_api_key: str):
        self.sumopod_api_key = sumopod_api_key

    # ── Regex patterns ──────────────────────────────────────────────

    # Pemasukan: "pemasukan 50000", "pemasukan 50rb", "income 100000 penjualan kopi"
    _INCOME_RE = re.compile(
        r'^(?:pemasukan|income|pendapatan|masuk)\s+'
        r'(\d+(?:\.\d+)?)\s*(?:rb|k|ribu)?\s*'
        r'(.*?)$',
        re.IGNORECASE,
    )

    # Pengeluaran: "pengeluaran 25000 beli gula", "expense 50rb"
    _EXPENSE_RE = re.compile(
        r'^(?:pengeluaran|expense|keluar|belanja|bayar|biaya)\s+'
        r'(\d+(?:\.\d+)?)\s*(?:rb|k|ribu)?\s*'
        r'(.*?)$',
        re.IGNORECASE,
    )

    # Angka dengan rb/k suffix: 50rb → 50000
    _NUM_RB_RE = re.compile(r'(\d+(?:\.\d+)?)\s*(rb|k|ribu)', re.IGNORECASE)

    # Query: "saldo", "balance", "ringkasan", "summary"
    _BALANCE_RE = re.compile(r'^(?:saldo|balance|neraca)\s*(.*?)$', re.IGNORECASE)
    _SUMMARY_RE = re.compile(r'^(?:ringkasan|summary|rekap|laporan)\s*(.*?)$', re.IGNORECASE)
    _KATEGORI_RE = re.compile(r'^(?:kategori|kategory|category|breakdown|grafik|diagram)\s*(.*?)$', re.IGNORECASE)
    _CARI_RE = re.compile(r'^(?:cari|search|find)\s+(.+)$', re.IGNORECASE)

    # Cek stok: "cek stok", "stok kopi", "inventory"
    _STOK_RE = re.compile(r'^(?:cek\s+)?stok\s*(.*?)$', re.IGNORECASE)
    _INVENTORY_RE = re.compile(r'^inventory|inventori|bahan\s*(.*?)$', re.IGNORECASE)

    # Restok: "restok gula 2kg 30rb", "tambah stok"
    _RESTOK_RE = re.compile(
        r'^(?:restok|tambah\s+stok|add\s+stock)\s+'
        r'(.+?)\s+'
        r'(\d+(?:\.\d+)?)\s*(ml|liter|lt|l|kg|gram|gr|g|pcs|pack|ikat|bungkus|toros|botol)?\s*'
        r'(\d+(?:\.\d+)?)?\s*(?:rb|k|ribu)?\s*$',
        re.IGNORECASE,
    )

    # Marketlist: "marketlist", "belanja", "daftar belanja"
    _MARKETLIST_RE = re.compile(
        r'^(?:marketlist|daftar\s+belanja|shopping\s+list|belanja|list\s+belanja)\s*$',
        re.IGNORECASE,
    )

    # ── Parse nominal ──────────────────────────────────────────────

    def _parse_nominal(self, text: str) -> float:
        """Parse nominal dari text. Support rb/k suffix."""
        m = self._NUM_RB_RE.search(text)
        if m:
            val = float(m.group(1))
            suffix = m.group(2).lower()
            if suffix in ("rb", "k", "ribu"):
                return val * 1000
            return val
        cleaned = re.sub(r'\.', '', text)
        try:
            return float(cleaned)
        except ValueError:
            return 0

    def _parse_period(self, text: str) -> str:
        """Parse periode dari text."""
        text = text.lower().strip()
        if any(k in text for k in ["hari ini", "hari_ini"]):
            return "hari_ini"
        if any(k in text for k in ["kemarin", "yesterday"]):
            return "kemarin"
        if any(k in text for k in ["minggu", "week", "pekan"]):
            return "minggu_ini"
        if any(k in text for k in ["bulan", "month"]):
            return "bulan_ini"
        return "hari_ini"

    # ── Orchestrate ────────────────────────────────────────────────

    async def orchestrate(self, text: str) -> OrchestratorResult:
        """Parse user input dan tentukan action.

        Returns OrchestratorResult dengan action yang sesuai.
        """
        if not text or not text.strip():
            return OrchestratorResult("unknown", text="Silakan ketik pesan. Contoh: 'pemasukan 50000', 'pengeluaran 25000 beli gula', 'cek stok', 'saldo'")

        text_stripped = text.strip()

        # ── 1. Structured commands ────────────────────────────────

        # Pemasukan
        m = self._INCOME_RE.match(text_stripped)
        if m:
            amount = self._parse_nominal(m.group(1))
            desc = m.group(2).strip()
            if amount <= 0:
                return OrchestratorResult("unknown", text="Nominal tidak valid. Contoh: 'pemasukan 50000 penjualan kopi'")
            return OrchestratorResult(
                "record_income",
                amount=amount,
                description=desc or "Pemasukan",
                confidence="high",
            )

        # Pengeluaran
        m = self._EXPENSE_RE.match(text_stripped)
        if m:
            amount = self._parse_nominal(m.group(1))
            desc = m.group(2).strip()
            if amount <= 0:
                return OrchestratorResult("unknown", text="Nominal tidak valid. Contoh: 'pengeluaran 25000 beli gula'")
            return OrchestratorResult(
                "record_expense",
                amount=amount,
                description=desc or "Pengeluaran",
                confidence="high" if desc else "medium",
            )

        # Saldo
        m = self._BALANCE_RE.match(text_stripped)
        if m:
            period = self._parse_period(m.group(1))
            return OrchestratorResult("balance", text=period)

        # Ringkasan
        m = self._SUMMARY_RE.match(text_stripped)
        if m:
            period = self._parse_period(m.group(1))
            return OrchestratorResult("summary", text=period)

        # Kategori breakdown
        m = self._KATEGORI_RE.match(text_stripped)
        if m:
            return OrchestratorResult("category_breakdown")

        # Cari transaksi
        m = self._CARI_RE.match(text_stripped)
        if m:
            return OrchestratorResult("search", text=m.group(1).strip())

        # Cek stok
        m = self._STOK_RE.match(text_stripped)
        if m:
            item = m.group(1).strip()
            return OrchestratorResult("check_stock", text=item or None)

        m = self._INVENTORY_RE.match(text_stripped)
        if m:
            item = m.group(1).strip()
            return OrchestratorResult("check_stock", text=item or None)

        # Marketlist
        if self._MARKETLIST_RE.match(text_stripped):
            return OrchestratorResult("marketlist")

        # Restok
        m = self._RESTOK_RE.match(text_stripped)
        if m:
            item_name = m.group(1).strip()
            qty = float(m.group(2))
            unit = (m.group(3) or "pcs").strip()
            price_text = (m.group(4) or "0").strip()
            price = self._parse_nominal(f"{price_text}{'000' if price_text else ''}")
            if price_text and not price_text.endswith("rb") and not price_text.endswith("k"):
                price = float(price_text) if price_text else 0
            return OrchestratorResult(
                "restock",
                description=item_name,
                amount=qty,
                merchant=unit,
                text=str(price),
                confidence="high",
            )

        # ── 2. Fallback ke SumoPod AI ─────────────────────────────
        return await self._call_sumopod(text_stripped)

    async def _call_sumopod(self, text: str) -> OrchestratorResult:
        """Panggil SumoPod API untuk memahami input kompleks."""
        client = SumoPodClient(self.sumopod_api_key)
        result = await client.chat(message=text, model=TEXT_MODEL)

        return OrchestratorResult(
            action=result["action"],
            amount=result["amount"],
            category=result["category"],
            description=result["description"],
            confidence=result["confidence"],
            text=result["reply"],
        )
