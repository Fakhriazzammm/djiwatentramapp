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

    # Low stock: "stok menipis", "low stock"
    _LOW_STOCK_RE = re.compile(
        r'^(?:stok\s+menipis|low\s+stock)$',
        re.IGNORECASE,
    )

    # Query total pengeluaran/pemasukan/transaksi per periode
    # Cocok: "total pengeluaran hari ini", "total pemasukan minggu ini",
    #        "total pengeluaran", "total pemasukan kemarin",
    #        "pengeluaran hari ini", "pemasukan bulan ini"
    _TOTAL_RE = re.compile(
        r'^(?:total\s+)?'
        r'(pengeluaran|pemasukan|pendapatan|income|expense|transaksi|belanja|keluar|masuk)'
        r'\s*(.*?)$',
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

    # ── AI System Prompt (finance-only, post-split) ─────
    FINANCE_SYSTEM_PROMPT = """Kamu adalah Yumi Finance — AI Keuangan untuk YumiPOS.
Tugasmu: membantu user mengelola keuangan, memahami input, dan menjawab pertanyaan.

Action yang tersedia:
1. record_income — catat pemasukan (amount, description)
2. record_expense — catat pengeluaran (amount, description, category)
3. balance — cek saldo/neraca
4. summary — ringkasan periode (total pemasukan, pengeluaran, saldo)
5. category_breakdown — lihat breakdown per kategori
6. search — cari transaksi
7. chat — tanya jawab, analisis, saran keuangan

PENTING — Mapping input ke action:
- "total pengeluaran [hari ini/kemarin/minggu ini/bulan ini]" → ACTION: summary
- "total pemasukan [period]" → ACTION: summary
- "total transaksi [period]" → ACTION: summary
- "pengeluaran hari ini", "pengeluaran kemarin" → ACTION: summary
- "berapa pengeluaran hari ini?" → ACTION: summary
- "berapa pemasukan kemarin?" → ACTION: summary
- "ringkasan [period]" → ACTION: summary
- "saldo [period]" → ACTION: balance
- Cari nominal Rp → record_income / record_expense
- Pertanyaan umum/analisis → ACTION: chat (dengan jawaban langsung)

Contoh:
User: total pengeluaran hari ini
ACTION: summary
...
REPLY: aku cek dulu datanya...

User: berapa pemasukan kemarin?
ACTION: summary
...
REPLY: aku cek dulu...

User: bagaimana cara menghemat pengeluaran?
ACTION: chat
CONFIDENCE: medium
REPLY: 💡 Tips hemat: 1) Bandingkan harga supplier sebelum beli, 2) Beli grosir untuk barang fast-moving, 3) Cek laporan kategori — lihat mana yg boros.

User: total pengeluaran bulan ini untuk bahan minuman?
ACTION: chat
CONFIDENCE: medium
REPLY: Untuk detail per kategori, coba ketik "kategori" atau "breakdown bulan ini". Mau aku tampilkan?

    Balas dengan format:
ACTION: <action_name>
AMOUNT: <angka (jika ada)>
CATEGORY: <category (jika ada)>
DESCRIPTION: <deskripsi>
ITEMS: <nama1>|<qty1>|<harga1>, <nama2>|<qty2>|<harga2> (jika ada item detail)
CONFIDENCE: high|medium|low
REPLY: <balasan ke user dalam Bahasa Indonesia friendly dan informatif>

Contoh ITEMS:
User: pengeluaran 204000 beli: 1. Timun / 8000, 2. Selada / 40000
OUTPUT:
ACTION: record_expense
AMOUNT: 204000
CATEGORY: bahan_makanan
DESCRIPTION: Belanja bahan: Timun, Selada
ITEMS: Timun|1|8000, Selada|1|40000
CONFIDENCE: high
REPLY: 💸 Pengeluaran tercatat! Rp204.000 untuk belanja bahan.

Jika user kirim daftar item dengan format "1. Nama / Harga" atau "Nama | Qty | Harga", parse item2 tsb dan masukkan ke ITEMS:.
KATEGORI untuk belanja bahan makanan: bahan_makanan (bukan lainnya).
Untuk item seperti Timun, Selada, Daun, Kemangi, Bawang, Jeruk, Cabai, Ebi → kategori bahan_makanan.

Jangan tanya balik untuk klarifikasi jika maksudnya sudah jelas — langsung pilih action yang paling sesuai."""

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

        # Marketlist: "marketlist", "belanja", "daftar belanja"
        if self._MARKETLIST_RE.match(text_stripped):
            return OrchestratorResult("marketlist")

        # Low stock / inventory check
        if self._LOW_STOCK_RE.match(text_stripped):
            return OrchestratorResult("low_stock")

        # Query total pengeluaran/pemasukan — "total pengeluaran hari ini"
        m = self._TOTAL_RE.match(text_stripped)
        if m:
            keyword = m.group(1).lower()
            period_text = m.group(2).strip()
            period = self._parse_period(period_text) if period_text else "hari_ini"
            income_words = {"pemasukan", "pendapatan", "income", "masuk"}
            expense_words = {"pengeluaran", "expense", "belanja", "keluar"}
            if keyword in income_words:
                return OrchestratorResult("summary", text=period, description="income", confidence="high")
            elif keyword in expense_words:
                return OrchestratorResult("summary", text=period, description="expense", confidence="high")
            else:
                return OrchestratorResult("summary", text=period, confidence="high")

        # Restok: "restok gula 2kg 30rb", "tambah stok"
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
        result = await client.chat(
            message=text,
            system_prompt=self.FINANCE_SYSTEM_PROMPT,
            model=TEXT_MODEL,
        )

        return OrchestratorResult(
            action=result["action"],
            amount=result["amount"],
            category=result["category"],
            description=result["description"],
            items=result.get("items", []),
            confidence=result["confidence"],
            text=result["reply"],
        )
