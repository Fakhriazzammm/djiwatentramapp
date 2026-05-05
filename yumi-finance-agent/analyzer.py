"""
analyzer.py — Yumi Finance Transaction Analyzer

Menganalisis transaksi secara AI (via SumoPod):
- Auto-kategorisasi
- Deteksi anomali (amount di luar normal)
- Learning harga normal per item/kategori
- Simpan insight ke pos.transaction_analytics
"""

import json
import logging
import re
from datetime import datetime, timezone, timedelta
from typing import Optional

import httpx

logger = logging.getLogger("yumi-finance.analyzer")

WIB = timezone(timedelta(hours=7))

SYSTEM_PROMPT = """Kamu adalah Yumi Finance AI Analyzer.
Tugasmu: analisis transaksi keuangan dan berikan insight.

Format output HARUS JSON MURNI (tanpa markdown, tanpa ```):
{
  "confidence": 0.0-1.0,
  "suggested_category": "string | null",
  "suggested_category_confidence": 0.0-1.0,
  "anomalies": [
    {"type": "amount_spike|unusual_category|duplicate_likely|merchant_mismatch|seasonal_abnormal", 
     "severity": "low|medium|high",
     "description": "penjelasan"}
  ],
  "normal_price_range": {"min": null, "max": null},
  "insight_summary": "1-2 kalimat insight"
}

Kategori yang valid: penjualan, belanja_stok, makanan_minuman, peralatan_kantor, transportasi, utilitas_listrik_air, gaji_karyawan, sewa_tempat, pemasaran, pajak, hiburan, kesehatan, pembangunan_renovasi, lainnya.
"""


class TransactionAnalyzer:
    def __init__(self, api_key: str, base_url: str, supabase_url: str, access_token: str):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.supabase_url = supabase_url.rstrip("/")
        self.access_token = access_token
        self._price_memory: dict[str, list[float]] = {}  # category -> [amounts]
        self._item_price_memory: dict[str, list[float]] = {}  # item_name -> [prices]

    def _mgmt_sql(self, query: str) -> list:
        """Execute SQL via Supabase Management API."""
        resp = httpx.post(
            f"https://api.supabase.com/v1/projects/xaemykhjpkgypqqpfdcb/database/query",
            json={"query": query},
            headers={
                "Authorization": f"Bearer {self.access_token}",
                "Content-Type": "application/json",
            },
            timeout=15,
        )
        resp.raise_for_status()
        return resp.json()

    def _get_historical_amounts(self, category: str, days: int = 90) -> list[float]:
        """Get historical amounts for a category for price range estimation."""
        cutoff = (datetime.now(WIB).timestamp() - days * 86400) * 1000
        rows = self._mgmt_sql(f"""
            SELECT amount FROM pos.financial_transactions
            WHERE category = '{category.replace("'", "''")}'
              AND tx_date >= {cutoff}
              AND amount > 0
            ORDER BY tx_date DESC
            LIMIT 50
        """)
        return [float(r["amount"]) for r in rows if r.get("amount")]

    async def _ai_analyze(self, tx: dict) -> dict:
        """Call SumoPod AI to analyze a transaction."""
        prompt = f"""Analisis transaksi ini:
- Tipe: {tx.get('tx_type', '?')}
- Kategori saat ini: {tx.get('category', '?')}
- Jumlah: Rp{float(tx.get('amount', 0) or 0):,.0f}
- Deskripsi: {tx.get('description', '?')}
- Merchant: {(str(tx.get('merchant', '')) or str(tx.get('description', '?')).split('-')[-1].strip()[:50])}
- Metode bayar: {tx.get('payment_method', '?')}

Berikan analisis JSON sesuai format yang ditentukan."""

        payload = {
            "model": "gpt-4o",
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.1,
            "max_tokens": 1024,
        }

        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(
                    f"{self.base_url}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                    json=payload,
                )
                resp.raise_for_status()
                content = resp.json()["choices"][0]["message"]["content"]

                # Extract JSON from response
                json_match = re.search(r'\{[\s\S]*\}', content)
                if json_match:
                    return json.loads(json_match.group(0))
                return {"confidence": 0, "anomalies": [], "insight_summary": "Gagal parse AI response"}
        except Exception as e:
            logger.error(f"AI analysis failed: {e}")
            return {"confidence": 0, "anomalies": [{"type": "ai_error", "severity": "low", "description": str(e)}], "insight_summary": "Gagal menganalisis"}

    def _detect_anomalies_rule_based(self, tx: dict, historical: list[float]) -> list[dict]:
        """Rule-based anomaly detection (no AI call needed for basic checks)."""
        anomalies = []
        amount = float(tx.get("amount", 0))

        if historical:
            mean = sum(historical) / len(historical)
            if mean > 0:
                ratio = amount / mean
                if ratio > 3:
                    anomalies.append({
                        "type": "amount_spike",
                        "severity": "high",
                        "description": f"Amount Rp{amount:,.0f} is {ratio:.1f}x the average Rp{mean:,.0f} in this category"
                    })
                elif ratio > 2:
                    anomalies.append({
                        "type": "amount_spike",
                        "severity": "medium",
                        "description": f"Amount Rp{amount:,.0f} is {ratio:.1f}x the average Rp{mean:,.0f}"
                    })

        # Check for very large amounts
        if amount > 10_000_000 and tx.get("tx_type") == "expense":
            anomalies.append({
                "type": "large_expense",
                "severity": "medium",
                "description": f"Large expense: Rp{amount:,.0f}"
            })

        return anomalies

    def _get_normal_price_range(self, category: str, amount: float) -> dict:
        """Estimate normal price range based on category history."""
        historical = self._get_historical_amounts(category)
        if not historical:
            return {"min": None, "max": None}

        sorted_prices = sorted(historical)
        n = len(sorted_prices)
        return {
            "min": sorted_prices[int(n * 0.1)],  # 10th percentile
            "max": sorted_prices[int(n * 0.9)],  # 90th percentile
        }

    async def analyze_transaction(self, tx: dict) -> dict:
        """Full analysis of a transaction."""
        source_id = tx.get("source_id") or tx.get("_id")
        category = tx.get("category", "lainnya")
        amount = float(tx.get("amount", 0))
        tx_type = tx.get("tx_type", "expense")

        # 1. Rule-based anomaly detection
        historical = self._get_historical_amounts(category)
        rule_anomalies = self._detect_anomalies_rule_based(tx, historical)

        # 2. AI analysis
        ai_result = await self._ai_analyze(tx)

        # 3. Normal price range
        price_range = self._get_normal_price_range(category, amount)

        # 4. Merge results
        all_anomalies = rule_anomalies + ai_result.get("anomalies", [])
        confidence = ai_result.get("confidence", 0.5)
        suggested_category = ai_result.get("suggested_category")
        suggested_conf = ai_result.get("suggested_category_confidence", 0)
        insight = ai_result.get("insight_summary", "Transaction analyzed")

        # 5. Save to database — use dollar-quoting for safe JSONB embedding
        anomaly_str = json.dumps(all_anomalies)
        learning_str = json.dumps({
            "last_analyzed": datetime.now(WIB).isoformat(),
            "historical_count": len(historical),
            "historical_mean": sum(historical) / len(historical) if historical else None,
            "model": "gpt-4o",
        })
        merchant_str = (str(tx.get("merchant", "")) or str(tx.get("description", ""))[:50]).replace("'", "''")
        cat_str = category.replace("'", "''")
        sug_cat_str = f"'{suggested_category.replace(chr(39), chr(39)*2)}'" if suggested_category else "NULL"
        now_ms = int(datetime.now(WIB).timestamp() * 1000)
        tx_date_val = tx.get("tx_date", now_ms)
        price_min = price_range.get('min')
        price_max = price_range.get('max')

        if source_id:
            try:
                self._mgmt_sql(f"""
                    INSERT INTO pos.transaction_analytics (
                        source_id, tx_source_id, tx_type, tx_amount, tx_category,
                        tx_merchant, tx_date, insight_confidence,
                        anomaly_flags, suggested_category, suggested_category_confidence,
                        normal_price_min, normal_price_max, learning_data
                    ) VALUES (
                        '{source_id}', '{source_id}', '{tx_type}', {amount},
                        '{cat_str}',
                        '{merchant_str}',
                        {tx_date_val},
                        {confidence},
                        $json${anomaly_str}$json$::jsonb,
                        {sug_cat_str},
                        {suggested_conf if suggested_conf > 0 else 'NULL'},
                        {price_min if price_min is not None else 'NULL'},
                        {price_max if price_max is not None else 'NULL'},
                        $json${learning_str}$json$::jsonb
                    ) ON CONFLICT (source_id) DO UPDATE SET
                        anomaly_flags = EXCLUDED.anomaly_flags,
                        insight_confidence = EXCLUDED.insight_confidence,
                        suggested_category = EXCLUDED.suggested_category,
                        suggested_category_confidence = EXCLUDED.suggested_category_confidence,
                        normal_price_min = EXCLUDED.normal_price_min,
                        normal_price_max = EXCLUDED.normal_price_max,
                        learning_data = EXCLUDED.learning_data,
                        updated_at = {now_ms}
                """)
                logger.info(f"Saved analytics for {source_id}")
            except Exception as e:
                logger.error(f"Failed to save analytics for {source_id}: {e}")

        return {
            "source_id": source_id,
            "insight_confidence": confidence,
            "anomaly_count": len(all_anomalies),
            "anomalies": all_anomalies,
            "suggested_category": suggested_category,
            "suggested_category_confidence": suggested_conf,
            "normal_price_range": price_range,
            "insight_summary": insight,
        }
