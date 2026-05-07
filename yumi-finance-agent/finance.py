"""finance.py — Module keuangan Yumi Finance AI Agent.

Catat pemasukan/pengeluaran, ringkasan, saldo, query transaksi.
Semua data via Supabase REST API & Edge Function yumi-ai.
"""

import logging
import httpx
from datetime import datetime, timezone, timedelta
from collections import Counter
from categories import FINANCE_CATEGORIES, auto_categorize, get_category_label, format_amount

logger = logging.getLogger(__name__)
WIB = timezone(timedelta(hours=7))


class FinanceManager:
    """Manager untuk seluruh operasi keuangan."""

    def __init__(self, supabase_url: str, supabase_key: str, service_role_key: str, edge_func_url: str):
        self.supabase_url = supabase_url.rstrip("/")
        self.supabase_key = supabase_key
        self.service_role_key = service_role_key
        self.edge_func_url = edge_func_url.rstrip("/")

    def _headers(self):
        return {
            "apikey": self.supabase_key,
            "Authorization": f"Bearer {self.supabase_key}",
            "Accept-Profile": "pos",
        }

    def _service_headers(self):
        return {
            "apikey": self.supabase_key,
            "Authorization": f"Bearer {self.service_role_key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
            "Accept-Profile": "pos",
        }

    async def _fetch(self, view: str, query: str = "select=*") -> list:
        # View adalah nama tabel di schema pos (tanpa prefix pos.)
        url = f"{self.supabase_url}/rest/v1/{view}?{query}"
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(url, headers=self._headers())
            resp.raise_for_status()
            return resp.json()

    async def _record_via_edge(self, payload: dict) -> dict:
        """Catat transaksi lewat Edge Function yumi-ai."""
        url = f"{self.edge_func_url}"
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                url,
                headers={**self._headers(), "Content-Type": "application/json"},
                json=payload,
            )
            if resp.status_code >= 400:
                logger.warning("Edge function error: %s %s", resp.status_code, resp.text)
                return {"ok": False, "error": resp.text}
            return resp.json()

    async def record_transaction(
        self,
        tx_type: str,
        amount: float,
        description: str,
        category: str | None = None,
        merchant: str = "",
        payment_method: str = "cash",
        metadata: dict | None = None,
        receipt_date_str: str | None = None,
    ) -> dict:
        """Catat pemasukan atau pengeluaran.

        Args:
            tx_type: 'income' atau 'expense'
            amount: nominal
            description: deskripsi transaksi
            category: kategori (auto jika None)
            merchant: nama merchant/toko
            payment_method: metode bayar
            metadata: data tambahan
            receipt_date_str: tanggal struk dari OCR (format "YYYY-MM-DD" atau "YYYY-MM-DD HH:MM").
                              Jika valid, dipakai sebagai tx_date. Fallback ke datetime.now(WIB).

        Returns:
            {"ok": True, "sourceId": "..."} atau {"ok": False, "error": "..."}
        """
        # Auto-kategorisasi jika tidak ditentukan
        if not category:
            category, confidence = auto_categorize(description, amount)
            if confidence == "low" and amount < 100000:
                category = "operasional" if tx_type == "expense" else "penjualan"

        # Tentukan tx_date: pakai receipt_date dari OCR jika valid, fallback ke NOW
        tx_date_ms = int(datetime.now(WIB).timestamp() * 1000)
        if receipt_date_str:
            try:
                # Coba parse "YYYY-MM-DD" atau "YYYY-MM-DD HH:MM"
                dt_str = receipt_date_str.strip()
                if " " in dt_str:
                    parsed = datetime.strptime(dt_str, "%Y-%m-%d %H:%M")
                    # Asumsikan input dalam WIB
                    tx_date_ms = int(parsed.replace(tzinfo=WIB).timestamp() * 1000)
                else:
                    # Hanya tanggal tanpa jam → pakai jam sekarang biar tidak 00:00
                    parsed_date = datetime.strptime(dt_str, "%Y-%m-%d")
                    now = datetime.now(WIB)
                    combined = parsed_date.replace(
                        hour=now.hour, minute=now.minute, second=now.second,
                        tzinfo=WIB,
                    )
                    tx_date_ms = int(combined.timestamp() * 1000)
            except ValueError:
                pass  # fallback ke NOW

        payload = {
            "action": "recordTransaction",
            "tx_type": tx_type,
            "amount": amount,
            "category": category,
            "description": description,
            "merchant": merchant,
            "tx_date": tx_date_ms,
            "payment_method": payment_method,
            "status": "completed",
            "metadata": metadata or {"source": "yumi_finance_agent", "group_id": -4995568785},
        }

        result = await self._record_via_edge(payload)
        logger.info("Transaction recorded: %s Rp%.0f (%s) — ok=%s", tx_type, amount, category, result.get("ok"))
        return result

    def _now_wib(self) -> datetime:
        return datetime.now(WIB)

    def _period_range(self, period: str, now: datetime = None) -> tuple[int, int]:
        """Hitung start_ms dan end_ms untuk periode tertentu.
        Returns (start_ms, end_ms) — timestamp dalam milidetik.
        """
        if now is None:
            now = self._now_wib()
        end_ms = int(now.timestamp() * 1000)

        if period == "hari_ini":
            start_ms = self._start_of_day_ms(now)
        elif period == "kemarin":
            yesterday = now - timedelta(days=1)
            start_ms = self._start_of_day_ms(yesterday)
            end_ms = int(yesterday.replace(hour=23, minute=59, second=59, microsecond=999000).timestamp() * 1000)
        elif period == "minggu_ini":
            start_ms = int((now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0).timestamp() * 1000)
        elif period == "minggu_lalu":
            last_monday = now - timedelta(days=now.weekday() + 7)
            start_ms = int(last_monday.replace(hour=0, minute=0, second=0, microsecond=0).timestamp() * 1000)
            end_ms = int((last_monday + timedelta(days=6)).replace(hour=23, minute=59, second=59, microsecond=999000).timestamp() * 1000)
        elif period == "bulan_ini":
            start_ms = int(now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).timestamp() * 1000)
        elif period == "bulan_lalu":
            first_of_this = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            last_month_end = first_of_this - timedelta(days=1)
            last_month_start = last_month_end.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            start_ms = int(last_month_start.timestamp() * 1000)
            end_ms = int(last_month_end.replace(hour=23, minute=59, second=59, microsecond=999000).timestamp() * 1000)
        else:
            start_ms = self._start_of_day_ms(now)
        return start_ms, end_ms

    async def get_transactions(self, tx_type: str = None, period: str = "hari_ini", limit: int = 50) -> list:
        """Ambil daftar transaksi filter by type dan periode."""
        now = self._now_wib()
        start_ms, end_ms = self._period_range(period, now)
        q = f"select=source_id,tx_type,amount,category,description,merchant,tx_date,payment_method"
        q += f"&tx_date=gte.{start_ms}&tx_date=lte.{end_ms}"
        q += f"&order=tx_date.desc&limit={limit}"
        if tx_type:
            q += f"&tx_type=eq.{tx_type}"
        # HPP (cost of goods sold) bukan pengeluaran riil — filter dari tampilan
        q += "&category=neq.HPP"
        return await self._fetch("financial_transactions", q)

    def _start_of_day_ms(self, dt: datetime = None) -> int:
        if dt is None:
            dt = self._now_wib()
        sod = dt.replace(hour=0, minute=0, second=0, microsecond=0)
        return int(sod.timestamp() * 1000)

    # ── Query ──────────────────────────────────────────────────────

    async def get_balance(self, period: str = "hari_ini", tx_type: str = None) -> dict:
        """Hitung saldo (income - expense) untuk periode tertentu.

        Returns:
            {"income": float, "expense": float, "balance": float, "count_income": int, "count_expense": int}
        """
        now = self._now_wib()
        start_ms, end_ms = self._period_range(period, now)
        q = f"select=tx_type,amount,category&tx_date=gte.{start_ms}&tx_date=lte.{end_ms}&limit=1000&category=neq.HPP"
        rows = await self._fetch("financial_transactions", q)

        income = 0.0
        expense = 0.0
        count_income = 0
        count_expense = 0
        for r in rows:
            amt = float(r.get("amount") or 0)
            tx_t = r.get("tx_type", "")
            category = r.get("category", "")
            # HPP (cost of goods sold) bukan pengeluaran riil — skip
            if category == "HPP":
                continue
            # Filter by requested tx_type if specified
            if tx_type and tx_t != tx_type:
                if tx_type == "income" and tx_t == "expense":
                    continue
                if tx_type == "expense" and tx_t == "income":
                    continue
            if tx_t == "income":
                income += amt
                count_income += 1
            else:
                expense += amt
                count_expense += 1

        return {
            "income": income,
            "expense": expense,
            "balance": income - expense,
            "count_income": count_income,
            "count_expense": count_expense,
        }

    async def get_summary(self, period: str = "hari_ini", tx_type: str = None) -> str:
        """Dapatkan ringkasan keuangan dalam format teks untuk Telegram.

        Args:
            period: periode (hari_ini, kemarin, minggu_ini, bulan_ini)
            tx_type: opsional filter — "income" atau "expense" untuk lihat spesifik
        """
        now = self._now_wib()
        balance = await self.get_balance(period, tx_type=tx_type)

        period_labels = {
            "hari_ini": "Hari Ini",
            "kemarin": "Kemarin",
            "minggu_ini": "Minggu Ini",
            "minggu_lalu": "Minggu Lalu",
            "bulan_ini": "Bulan Ini",
            "bulan_lalu": "Bulan Lalu",
        }
        label = period_labels.get(period, period)

        lines = [
            f"📊 Ringkasan Keuangan — {label}",
            f"📅 {now.strftime('%d/%m/%Y %H:%M')} WIB",
            "",
        ]

        if tx_type == "income":
            # Hanya pemasukan
            title_icon = "💰"
            title_text = "Pemasukan"
            if balance["count_income"] > 0:
                lines.append(f"{title_icon} Total {title_text}:  {format_amount(balance['income'])} ({balance['count_income']} transaksi)")
            else:
                lines.append(f"{title_icon} Belum ada {title_text.lower()} untuk {label}.")
            lines.append("")
            lines.append(f"🏦 Saldo Akhir: {format_amount(balance['balance'])}")
        elif tx_type == "expense":
            # Hanya pengeluaran
            title_icon = "💸"
            title_text = "Pengeluaran"
            if balance["count_expense"] > 0:
                lines.append(f"{title_icon} Total {title_text}:  {format_amount(balance['expense'])} ({balance['count_expense']} transaksi)")
            else:
                lines.append(f"{title_icon} Belum ada {title_text.lower()} untuk {label}.")
        else:
            # Keduanya
            if balance["count_income"] > 0:
                lines.append(f"💰 Pemasukan:    {format_amount(balance['income'])} ({balance['count_income']} transaksi)")
            if balance["count_expense"] > 0:
                lines.append(f"💸 Pengeluaran:  {format_amount(balance['expense'])} ({balance['count_expense']} transaksi)")
            lines.append("")
            lines.append(f"🏦 Saldo Bersih: {format_amount(balance['balance'])}")

        return "\n".join(lines)

    async def get_category_breakdown(self, period: str = "bulan_ini") -> str:
        """Dapatkan breakdown pengeluaran per kategori."""
        now = self._now_wib()
        start_ms = int(now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).timestamp() * 1000)
        end_ms = int(now.timestamp() * 1000)

        q = f"select=category,amount&tx_date=gte.{start_ms}&tx_date=lte.{end_ms}&tx_type=eq.expense&category=neq.HPP&limit=1000"
        rows = await self._fetch("financial_transactions", q)

        if not rows:
            return "📁 Belum ada pengeluaran bulan ini."

        by_cat = Counter()
        total = 0.0
        for r in rows:
            cat = r.get("category", "lainnya") or "lainnya"
            amt = float(r.get("amount") or 0)
            by_cat[cat] += amt
            total += amt

        lines = [f"📁 Kategori Pengeluaran — {now.strftime('%B %Y')}", ""]
        for cat, amt in by_cat.most_common():
            label = get_category_label(cat)
            pct = (amt / total * 100) if total > 0 else 0
            bar = "█" * int(pct / 5) + "░" * (20 - int(pct / 5))
            lines.append(f"{label} {bar} {format_amount(amt)} ({pct:.0f}%)")

        lines.append("")
        lines.append(f"📊 Total: {format_amount(total)}")
        return "\n".join(lines)

    async def search_transactions(self, keyword: str, limit: int = 10) -> list:
        """Cari transaksi berdasarkan keyword di description."""
        now = self._now_wib()
        start_ms = int((now - timedelta(days=90)).timestamp() * 1000)  # 3 bulan ke belakang
        q = f"select=source_id,tx_type,amount,category,description,merchant,tx_date&tx_date=gte.{start_ms}&order=tx_date.desc&limit=100"
        rows = await self._fetch("financial_transactions", q)

        kw = keyword.lower()
        matches = []
        for r in rows:
            desc = (r.get("description") or "").lower()
            merchant = (r.get("merchant") or "").lower()
            cat = (r.get("category") or "").lower()
            if kw in desc or kw in merchant or kw in cat:
                matches.append(r)
                if len(matches) >= limit:
                    break

        return matches
