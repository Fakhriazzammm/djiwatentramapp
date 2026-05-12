"""orchestrator.py — AI Orchestrator Core Yumi Finance.

Decision engine yang menentukan action dari input user.
Bisa handle structured command langsung, atau fallback ke SumoPod AI.
"""

import re
import json
import logging
import httpx
from collections import Counter
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
        payment_method: str = "",
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
        self.payment_method = payment_method
        self.items = items or []
        self.confidence = confidence
        self.needs_confirmation = needs_confirmation


class FinanceOrchestrator:
    """AI Orchestrator — decision engine untuk input user.

    Menggunakan SumoPod (gpt-4o-mini / kimi-k2.6) untuk AI fallback,
    bukan Supabase Edge Function.
    """

    def __init__(self, sumopod_api_key: str, supabase_url: str = "", supabase_key: str = ""):
        self.sumopod_api_key = sumopod_api_key
        self._supabase_url = supabase_url.rstrip("/")
        self._supabase_key = supabase_key
        # Cache: refresh setiap 5 menit
        self._context_cache = {"data": None, "fetched_at": 0}

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

    # ── Extract merchant & payment method from description text ──
    # Pola: "beli gula — QRIS — Toko Sinar" or "di Yogya" or "dari Bu Dian"
    _MERCHANT_RE = re.compile(
        r'(?:di\s+|dari\s+)([A-Za-z\u00C0-\u024F .\u2019&#@()-]+?)(?:\s*\u2014|\s*$|(?=\s*(?:qris|tunai|cash|transfer|bank|kredit|cc)))',
        re.IGNORECASE,
    )
    _MERCHANT_EM_RE = re.compile(
        r'(?:\u2014\s+)(?!\s*(?:qris|tunai|cash|transfer|bank|kartu|cc|kredit))([A-Za-z\u00C0-\u024F .\u2019&#@()-]+?)(?:\s*$|(?=\s*(?:qris|tunai|cash|transfer|bank|kredit|cc|\u2014)))',
        re.IGNORECASE,
    )
    _PAYMENT_RE = re.compile(
        r'(?:pembayaran[:\s]+|metode[:\s]+|via\s+|\u2014\s*)(qris|tunai|cash|transfer|bank|kartu\s*kredit|cc|kredit)',
        re.IGNORECASE,
    )
    _PAYMENT_KEYWORD_RE = re.compile(
        r'\b(qris|tunai|cash|transfer|bank|kartu\s*kredit|cc)\b',
        re.IGNORECASE,
    )

    @staticmethod
    def _extract_merchant(text: str) -> str:
        """Extract merchant name from text: 'di Yogya', '— Toko Sinar', 'dari Bu Dian'"""
        # Try em-dash merchant first (but skip payment keywords)
        m = FinanceOrchestrator._MERCHANT_EM_RE.search(text)
        if m:
            merchant = m.group(1).strip().rstrip(".,;!")
            if len(merchant) >= 2:
                return merchant
        # Then try "di X" / "dari X"
        m = FinanceOrchestrator._MERCHANT_RE.search(text)
        if m:
            merchant = m.group(1).strip().rstrip(".,;!")
            if len(merchant) >= 2:
                return merchant
        return ""

    @staticmethod
    def _extract_payment_method(text: str) -> str:
        """Extract payment method from text: QRIS, Tunai, Transfer, etc."""
        m = FinanceOrchestrator._PAYMENT_RE.search(text)
        if m:
            raw = m.group(1).strip().lower()
        else:
            m2 = FinanceOrchestrator._PAYMENT_KEYWORD_RE.search(text)
            if m2:
                raw = m2.group(1).strip().lower()
            else:
                return "CASH"
        mapping = {
            "tunai": "CASH", "cash": "CASH",
            "qris": "QRIS",
            "transfer": "BANK_TRANSFER", "bank": "BANK_TRANSFER",
            "kartu kredit": "CREDIT_CARD", "cc": "CREDIT_CARD", "kredit": "CREDIT_CARD",
        }
        return mapping.get(raw, "CASH")

    @staticmethod
    def _clean_description(text: str) -> str:
        """Remove merchant and payment info from description.
        'beli gula — QRIS — Toko Sinar' → 'beli gula'
        """
        cleaned = re.sub(
            r'(?:\u2014\s*(?:qris|tunai|cash|transfer|bank|kartu\s*kredit|cc|kredit)\s*(?:\u2014\s*.*?)?(?:\s*$|$))',
            '', text, flags=re.IGNORECASE,
        )
        cleaned = re.sub(
            r'\s*\u2014\s*.*?(?:\s*$|$)',
            '', cleaned, flags=re.IGNORECASE,
        ).strip()
        cleaned = re.sub(
            r'\s*(?:di|dari)\s+[A-Za-z\u00C0-\u024F .\u2019&#@()-]+\s*$',
            '', cleaned, flags=re.IGNORECASE,
        ).strip()
        return cleaned

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
MERCHANT: <nama toko/supplier (jika ada)>
PAYMENT_METHOD: <metode bayar — CASH|QRIS|BANK_TRANSFER|CREDIT_CARD (isi default CASH jika tidak disebut)>
DESCRIPTION: <deskripsi>
ITEMS: <nama1>|<qty1>|<unit1>|<harga1>, <nama2>|<qty2>|<unit2>|<harga2> (jika ada item detail)
CONFIDENCE: high|medium|low
REPLY: <balasan ke user dalam Bahasa Indonesia friendly dan informatif>

Contoh ITEMS dengan unit:
User: Tanggal: 7-5-2026
 1. Timun / 1 kg / 8.000
 2. Selada / 1 kg / 40.000
Total: 204.000
OUTPUT:
ACTION: record_expense
AMOUNT: 204000
CATEGORY: bahan_makanan
DESCRIPTION: Pembelian bahan: Timun, Selada, Bawang daun, Kemangi, Bawang putih, Jeruk Limau, Muncang, Bawang merah, Ebi, Cabe merah besar, Cabe Rawit
ITEMS: Timun|1|kg|8000, Selada|1|kg|40000, Bawang daun|1|ikat|13000, Kemangi|5|ikat|10000, Bawang putih|1|kg|84000, Jeruk Limau|0.25|kg|7000, Muncang|0.25|kg|12000, Bawang merah|0.5|kg|18000, Ebi|0.25|kg|27000, Cabe merah besar|0.25|kg|18000, Cabe Rawit|0.25|kg|17000
CONFIDENCE: high
REPLY: 💸 Pengeluaran tercatat! Rp204.000 untuk belanja bahan.

Contoh ITEMS tanpa unit:
User: pengeluaran 204000 beli: 1. Timun / 8000, 2. Selada / 40000
OUTPUT:
ACTION: record_expense
AMOUNT: 204000
CATEGORY: bahan_makanan
MERCHANT:
PAYMENT_METHOD: CASH
DESCRIPTION: Belanja bahan: Timun, Selada
ITEMS: Timun|1||8000, Selada|1||40000
CONFIDENCE: high
REPLY: 💸 Pengeluaran tercatat! Rp204.000 untuk belanja bahan.

Contoh dengan MERCHANT dan PAYMENT_METHOD:
User: pengeluaran 25000 bayar es — QRIS — Toko Es Mambo
OUTPUT:
ACTION: record_expense
AMOUNT: 25000
CATEGORY: bahan_minuman
MERCHANT: Toko Es Mambo
PAYMENT_METHOD: QRIS
DESCRIPTION: Beli es
CONFIDENCE: high
REPLY: 💸 Pengeluaran Rp25.000 via QRIS di Toko Es Mambo tercatat!

User: pengeluaran 350000 belanja bulanan — Transfer — Yogya
  1. Minyak goreng / 2 L / 35.000
  2. Gula pasir / 5 kg / 75.000
OUTPUT:
ACTION: record_expense
AMOUNT: 350000
CATEGORY: bahan_makanan
MERCHANT: Yogya
PAYMENT_METHOD: BANK_TRANSFER
DESCRIPTION: Belanja bulanan: Minyak goreng, Gula pasir
ITEMS: Minyak goreng|2|L|35000, Gula pasir|5|kg|75000
CONFIDENCE: high
REPLY: 💸 Pengeluaran Rp350.000 via Transfer di Yogya tercatat! 2 item.

User: pemasukan 150000 penjualan kopi — QRIS
OUTPUT:
ACTION: record_income
AMOUNT: 150000
CATEGORY: penjualan
MERCHANT:
PAYMENT_METHOD: QRIS
DESCRIPTION: Penjualan kopi
CONFIDENCE: high
REPLY: 💰 Pemasukan Rp150.000 via QRIS tercatat!

PENTING — Cara parse input user:
1. Format item: "Nama / qty unit / harga" atau "Nama / harga" atau "Nama | Qty | Harga"
2. ANGKA: titik (.) di Indonesia adalah pemisah ribuan, bukan desimal. 8.000 = 8000, 204.000 = 204000.
   Untuk jumlah (qty): "1/4 kg" = 0.25 kg, "1/2" = 0.5
3. TANGGAL: jika user menulis "Tanggal: 7-5-2026", parse tanggal tsb dan masukkan di DESCRIPTION.
   Jangan simpan tanggal di ITEMS.
4. SELALU output ITEMS jika user menyebutkan nama-nama item. Jika tanpa qty/harga, gunakan qty=1, unit="", harga=0.
   Contoh: ITEMS: Timun|1||0, Selada|1||0
5. DESCRIPTION: buat dari gabungan nama item. Prefix "Pembelian bahan: " untuk expense bahan makanan.
6. AMOUNT: total dari angka di "Total:" atau jumlahkan semua harga item.
   Hapus semua titik dari angka: 204.000 → AMOUNT: 204000
7. MERCHANT: cari kata setelah "di ", "dari ", "— " yang menandakan nama toko/supplier.
   Jika tidak disebut, biarkan kosong.
8. PAYMENT_METHOD: cari kata kunci pembayaran:
   - "tunai", "cash" → CASH
   - "qris" → QRIS
   - "transfer", "bank" → BANK_TRANSFER
   - "kartu kredit", "cc", "kredit" → CREDIT_CARD
   Jika tidak disebut, default CASH.
   Simpan PAYMENT_METHOD juga di DESCRIPTION agar user tahu metode bayar yang digunakan.

KATEGORI untuk belanja bahan makanan: bahan_makanan (bukan lainnya).
Untuk item seperti Timun, Selada, Daun, Kemangi, Bawang, Jeruk, Cabai, Ebi → kategori bahan_makanan.

ATAURAN ISI KOSONG:
- Jika user tidak sebut MERCHANT: lihat DATA KONTEKS BISNIS di atas. Cari merchant langganan yang cocok dengan item yang dibeli. Contoh: user beli telor, biasanya beli di Yogya MB → MERCHANT: Yogya MB. Jika tidak ada kecocokan, biarkan kosong.
- Jika user tidak sebut PAYMENT_METHOD: default CASH.
- Jika user tidak sebut brand di ITEMS: lihat "Brand default per item" di konteks. Jika ada, gunakan brand tersebut. Contoh: "Minyak Goreng" → "Minyak Goreng - Tropical".
- Jika user tidak sebut kategori: lihat "Kategori sering dipakai" dan sesuaikan dengan jenis barang.

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
            merchant = self._extract_merchant(desc)
            payment_method = self._extract_payment_method(desc)
            clean_desc = self._clean_description(desc)
            if amount <= 0:
                return OrchestratorResult("unknown", text="Nominal tidak valid. Contoh: 'pemasukan 50000 penjualan kopi'")
            return OrchestratorResult(
                "record_income",
                amount=amount,
                description=clean_desc or "Pemasukan",
                merchant=merchant,
                payment_method=payment_method,
                confidence="high",
            )

        # Pengeluaran
        m = self._EXPENSE_RE.match(text_stripped)
        if m:
            amount = self._parse_nominal(m.group(1))
            desc = m.group(2).strip()
            merchant = self._extract_merchant(desc)
            payment_method = self._extract_payment_method(desc)
            clean_desc = self._clean_description(desc)
            if amount <= 0:
                return OrchestratorResult("unknown", text="Nominal tidak valid. Contoh: 'pengeluaran 25000 beli gula'")
            return OrchestratorResult(
                "record_expense",
                amount=amount,
                description=clean_desc or "Pengeluaran",
                merchant=merchant,
                payment_method=payment_method,
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

    async def _fetch_context_data(self) -> str:
        """Fetch existing data dari Supabase untuk bantu AI."""
        import time
        now = time.time()
        if self._context_cache["data"] and (now - self._context_cache["fetched_at"]) < 300:
            return self._context_cache["data"]

        context_parts = ["DATA KONTEKS BISNIS — gunakan info ini untuk akurasi lebih tinggi:"]

        if self._supabase_url and self._supabase_key:
            headers = {
                "apikey": self._supabase_key,
                "Authorization": f"Bearer {self._supabase_key}",
            }
            try:
                async with httpx.AsyncClient(timeout=10) as client:
                    # 1. Merchant langganan (top 20 paling sering)
                    resp = await client.get(
                        f"{self._supabase_url}/rest/v1/pos_financial_transactions"
                        f"?select=merchant&merchant=not.is.null&merchant=neq."
                        f"&order=date.desc&limit=50",
                        headers=headers,
                    )
                    if resp.status_code == 200:
                        merchants = list(dict.fromkeys(
                            m.get("merchant", "") for m in resp.json() if m.get("merchant")
                        ))[:20]
                        if merchants:
                            context_parts.append(f"📍 Merchant langganan: {', '.join(merchants[:10])}")
                            if len(merchants) > 10:
                                context_parts.append(f"   Lainnya: {', '.join(merchants[10:])}")
                            context_parts.append("   ⚠️ Jika user tidak sebut merchant, isi dari daftar ini berdasarkan item/barang yang biasa dibeli dari merchant tersebut.")

                    # 2. Inventory items dengan brand + store preference (top 50)
                    resp2 = await client.get(
                        f"{self._supabase_url}/rest/v1/pos_inventory"
                        f"?select=ingredientName,defaultBrandName,unit,netWeight,preferredStoreId"
                        f"&order=ingredientName.asc&limit=50",
                        headers=headers,
                    )
                    if resp2.status_code == 200:
                        items = resp2.json()
                        inventory_lines = []
                        brand_patterns = []
                        for i in items:
                            name = i.get("ingredientName", "")
                            brand = i.get("defaultBrandName") or ""
                            unit = i.get("unit", "")
                            store_id = i.get("preferredStoreId") or ""
                            display = f"{name} ({unit})" if not brand else f"{name} - {brand} ({unit})"
                            inventory_lines.append(display)
                            if brand:
                                brand_patterns.append(f"{name} biasa pakai {brand}")
                        if inventory_lines:
                            context_parts.append(f"📦 Inventory tersedia: {'; '.join(inventory_lines[:30])}")
                        if brand_patterns:
                            context_parts.append(f"🏷 Brand default per item: {'; '.join(brand_patterns[:15])}")
                            context_parts.append("   ⚠️ Jika user beli item tanpa sebut brand, isi brand default-nya.")

                    # 3. Pola kategori dari transaksi terakhir
                    resp3 = await client.get(
                        f"{self._supabase_url}/rest/v1/pos_financial_transactions"
                        f"?select=category,description,merchant,amount"
                        f"&type=eq.expense&order=date.desc&limit=20",
                        headers=headers,
                    )
                    if resp3.status_code == 200:
                        txs = resp3.json()
                        if txs:
                            cat_counter = Counter()
                            for t in txs:
                                cat_counter[t.get("category", "lainnya")] += 1
                            top_cats = cat_counter.most_common(5)
                            if top_cats:
                                cats_str = ", ".join(f"{c} ({n}x)" for c, n in top_cats)
                                context_parts.append(f"📊 Kategori sering dipakai: {cats_str}")
                                context_parts.append("   ⚠️ Jika user tidak sebut kategori, gunakan yang paling sering untuk jenis item serupa.")
            except Exception as e:
                logger.warning("fetch_context_data failed: %s", e)

        result = "\n".join(context_parts)
        self._context_cache["data"] = result
        self._context_cache["fetched_at"] = now
        return result

    async def _call_sumopod(self, text: str) -> OrchestratorResult:
        """Panggil SumoPod API untuk memahami input kompleks."""
        client = SumoPodClient(self.sumopod_api_key)
        # Inject context data ke system prompt
        context = await self._fetch_context_data()
        enhanced_prompt = f"{self.FINANCE_SYSTEM_PROMPT}\n\n{context}"
        result = await client.chat(
            message=text,
            system_prompt=enhanced_prompt,
            model=TEXT_MODEL,
        )

        return OrchestratorResult(
            action=result["action"],
            amount=result["amount"],
            category=result["category"],
            description=result["description"],
            items=result.get("items", []),
            merchant=result.get("merchant", ""),
            payment_method=result.get("payment_method", ""),
            confidence=result["confidence"],
            text=result["reply"],
        )
