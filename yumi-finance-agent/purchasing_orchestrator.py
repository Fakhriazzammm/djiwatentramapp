"""
purchasing_orchestrator.py — AI Orchestrator untuk Yumi Purchasing Agent.

Decision engine: structured commands dulu, fallback ke SumoPod AI.
"""
import re
import logging
from sumopod_client import SumoPodClient, TEXT_MODEL

logger = logging.getLogger(__name__)


class PurchasingResult:
    def __init__(
        self,
        action: str,
        text: str | None = None,
        item: str = "",
        qty: float = 0,
        unit: str = "pcs",
        price: float = 0,
        supplier_query: str = "",
        confidence: str = "high",
    ):
        self.action = action
        self.text = text        # general text / AI reply
        self.item = item        # item name for stock/restock
        self.qty = qty
        self.unit = unit
        self.price = price
        self.supplier_query = supplier_query
        self.confidence = confidence


class PurchasingOrchestrator:
    """AI Orchestrator untuk inventory & marketlist."""

    # ── AI System Prompt ─────────────────────────────────────
    SYSTEM_PROMPT = """Kamu adalah Yumi Purchasing — AI Inventory & Purchasing Agent untuk YumiPOS.
Tugasmu: membantu user mengelola inventory, marketlist, dan supplier.

Action yang tersedia:
1. marketlist — generate daftar belanja
2. marketlist_input — proses teks marketlist dari user (list item yang ingin dibeli)
3. check_stock — cek stok (semua atau spesifik)
4. low_stock — cek stok menipis
5. restock — tambah stok barang
6. supplier_search — cari supplier
7. analyze — analisis inventory (tren, saran, efisiensi)
8. chat — tanya jawab umum (FAQ, tips, rekomendasi)
9. unknown — jika tidak yakin

Balas dengan format:
ACTION: <action_name>
ITEM: <nama barang (jika ada)>
QUANTITY: <jumlah>
UNIT: <unit>
PRICE: <harga>
SUPPLIER_QUERY: <keyword supplier>
CONFIDENCE: high|medium|low
REPLY: <balasan ke user dalam Bahasa Indonesia — friendly, helpful, kadang pakai emoji>

Contoh:
User: marketlist
ACTION: marketlist
REPLY: 🛒 Sebentar ya, aku siapin daftar belanjanya...

User: apakah kopi robusta lebih murah dari arabica?
ACTION: analyze
CONFIDENCE: medium
REPLY: 🤔 Hmm, tergantung supplier dan grade sih. Coba cek supplier roastery kamu dulu dengan /supplier roastery. Biasanya robusta grade B lebih murah 30-40% dari arabica grade A.

User: ada saran supplier daging murah?
ACTION: supplier_search
SUPPLIER_QUERY: daging
REPLY: 🔍 Aku cariin supplier daging ya...

Untuk input yang tidak jelas, tanya balik dengan ramah."""

    def __init__(self, sumopod_api_key: str):
        self.sumopod_api_key = sumopod_api_key

    # ── Regex patterns ───────────────────────────────────────
    _MARKETLIST_RE = re.compile(
        r'^(?:marketlist|market\s+list|daftar\s+belanja|shopping\s+list|belanja|list\s+belanja)\s*$',
        re.IGNORECASE,
    )
    _MARKETLIST_INPUT_RE = re.compile(
        r'^(?:marketlist|market\s+list|belanja\s+list|market)\s+.+',
        re.IGNORECASE,
    )
    _LOW_STOCK_RE = re.compile(
        r'^(stok\s+menipis|low\s+stock)$',
        re.IGNORECASE,
    )
    _STOCK_RE = re.compile(
        r'^(?:cek\s+)?stok\s+(.+)$',
        re.IGNORECASE,
    )
    _ALL_STOCK_RE = re.compile(
        r'^(?:semua\s+)?(?:stok|inventory|inventori|bahan)\s*$',
        re.IGNORECASE,
    )
    _RESTOK_RE = re.compile(
        r'^(?:restok|tambah\s+stok|add\s+stock)\s+'
        r'(.+?)\s+'
        r'(\d+(?:\.\d+)?)\s*(ml|liter|lt|l|kg|gram|gr|g|pcs|pack|ikat|bungkus|toros|botol)?\s*'
        r'(\d+(?:\.\d+)?)?\s*(?:rb|k|ribu)?\s*$',
        re.IGNORECASE,
    )
    _SUPPLIER_RE = re.compile(
        r'^(?:supplier|cari\s+supplier|supplier\s+search)\s*(.*)$',
        re.IGNORECASE,
    )
    _HELP_RE = re.compile(
        r'^(help|bantuan|menu|start|mulai|/start|/help|apa\s+saja)$',
        re.IGNORECASE,
    )

    async def orchestrate(self, text: str) -> PurchasingResult:
        """Parse user input dan tentukan action."""
        if not text or not text.strip():
            return PurchasingResult("chat", text="Halo! Aku Yumi Purchasing. Ketik 'help' untuk lihat menu 😊", confidence="high")

        text_stripped = text.strip()

        # 1. Help
        if self._HELP_RE.match(text_stripped):
            return PurchasingResult("chat", text=self._help_text(), confidence="high")

        # 2. Marketlist (auto-generated)
        if self._MARKETLIST_RE.match(text_stripped):
            return PurchasingResult("marketlist", confidence="high")

        # 2b. Marketlist input (user posts a list — starts with "market list" or "belanja list")
        if self._MARKETLIST_INPUT_RE.match(text_stripped):
            return PurchasingResult("marketlist_input", text=text_stripped, confidence="high")

        # 3. Low stock
        if self._LOW_STOCK_RE.match(text_stripped):
            return PurchasingResult("low_stock", confidence="high")

        # 4. All stock
        if self._ALL_STOCK_RE.match(text_stripped):
            return PurchasingResult("check_stock", confidence="high")

        # 5. Specific stock
        m = self._STOCK_RE.match(text_stripped)
        if m:
            return PurchasingResult("check_stock", item=m.group(1).strip(), confidence="high")

        # 6. Restock
        m = self._RESTOK_RE.match(text_stripped)
        if m:
            item_name = m.group(1).strip()
            qty = float(m.group(2))
            unit = (m.group(3) or "pcs").strip()
            price_text = (m.group(4) or "0").strip()
            try:
                price = float(price_text)
            except ValueError:
                price = 0
            return PurchasingResult(
                "restock", item=item_name, qty=qty, unit=unit, price=price,
                confidence="high",
            )

        # 7. Supplier search
        m = self._SUPPLIER_RE.match(text_stripped)
        if m:
            q = m.group(1).strip()
            return PurchasingResult("supplier_search", supplier_query=q, confidence="high")

        # 8. Fallback to AI
        return await self._call_ai(text_stripped)

    async def _call_ai(self, text: str) -> PurchasingResult:
        """Fallback ke SumoPod AI untuk pemahaman NL."""
        try:
            client = SumoPodClient(self.sumopod_api_key)
            result = await client.chat(
                message=text,
                system_prompt=self.SYSTEM_PROMPT,
                model=TEXT_MODEL,
                timeout=30,
            )
            return PurchasingResult(
                action=result.get("action", "chat"),
                text=result.get("reply", ""),
                item=result.get("item", ""),
                supplier_query=result.get("supplier_query", ""),
                confidence=result.get("confidence", "medium"),
            )
        except Exception as e:
            logger.warning("Purchasing AI fallback failed: %s", e)
            return PurchasingResult(
                "chat",
                text="Maaf, AI-ku lagi sibuk nih 😅 Coba lagi nanti ya. Sementara bisa pakai command langsung: marketlist, stok menipis, stok <nama>, restok <nama> <qty> <unit> <harga>.",
                confidence="low",
            )

    def _help_text(self) -> str:
        return (
            "🛒 *Yumi Purchasing* — Inventory & Marketlist Assistant\n\n"
            "*Perintah:*\n"
            "• `marketlist` — Daftar belanja + AI tag supplier\n"
            "• `market list ...` — Proses daftar belanja manual + grouping merchant\n"
            "• `stok menipis` — Cek stok menipis\n"
            "• `stok <nama>` — Cek stok spesifik\n"
            "• `restok <nama> <qty> <unit> <harga>` — Tambah stok\n"
            "• `/supplier <kategori>` — Cari supplier\n"
            "• Tanya bebas — Aku bisa bantu analisis 😊\n\n"
            "*Contoh market list manual:*\n"
            "```\n"
            "market list kitchen\n"
            "-kentang (abis)\n"
            "-paha fillet\n"
            "-timun\n"
            "```\n"
            "Nanti otomatis ke-group per merchant dengan nomor WhatsApp! 🎯\n\n"
            "*Contoh tanya bebas:*\n"
            "• \"Supplier daging termurah siapa?\"\n"
            "• \"Kenapa marketlist kopi banyak banget?\"\n"
            "• \"Saran restok buat minggu ini?\"\n\n"
            "Atau klik tombol di bawah 👇"
        )
