#!/usr/bin/env python3
"""Cron: cek keseimbangan akuntansi harian (debit vs kredit).

Ambil financial_transactions hari ini (start_of_day WIB - sekarang),
lalu jumlahkan accounting_entries by source_id. Jika selisih > Rp1000,
kirim alert ke grup Finance via Telegram Bot API.
"""
import os
from datetime import datetime, timedelta, timezone

# ponytail: baca .env manual, hindari dependency
ENV = "/opt/djiwatentramapp/yumi-finance-agent/.env"
cfg = {}
for line in open(ENV):
    line = line.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    k, v = line.split("=", 1)
    cfg[k.strip()] = v.strip()

WIB = timezone(timedelta(hours=7))
now = datetime.now(WIB)
start = now.replace(hour=0, minute=0, second=0, microsecond=0)
start_ms = int(start.timestamp() * 1000)
now_ms = int(now.timestamp() * 1000)

SUPABASE_URL = cfg["SUPABASE_URL"].rstrip("/")
KEY = cfg["SUPABASE_KEY"]
SVC = cfg["SUPABASE_SERVICE_ROLE_KEY"]
BOT = cfg["TELEGRAM_BOT_TOKEN"]
CHAT = "-1003916990045"  # grup Finance (supergroup; old -4995568785 migrated)

import httpx

H_POS = {"apikey": KEY, "Authorization": f"Bearer {KEY}", "Accept-Profile": "pos"}
H_PUB = {"apikey": KEY, "Authorization": f"Bearer {KEY}", "Accept-Profile": "public"}

# 1) source_id hari ini
r = httpx.get(
    f"{SUPABASE_URL}/rest/v1/financial_transactions"
    f"?select=source_id&tx_date=gte.{start_ms}&tx_date=lte.{now_ms}"
    f"&limit=2000",
    headers=H_POS, timeout=30,
)
r.raise_for_status()
source_ids = list({row["source_id"] for row in r.json() if row.get("source_id")})

if not source_ids:
    print("[SILENT]")  # tidak ada transaksi hari ini
    raise SystemExit(0)

# 2) accounting_entries by source_id (public schema)
ids = ",".join(source_ids)
r = httpx.get(
    f"{SUPABASE_URL}/rest/v1/accounting_entries"
    f"?select=entry_type,amount,transaction_source_id"
    f"&transaction_source_id=in.({ids})&limit=5000",
    headers=H_PUB, timeout=30,
)
r.raise_for_status()
entries = r.json()

total_debit = sum(float(e["amount"]) for e in entries if e.get("entry_type") == "debit" and e.get("amount") is not None)
total_kredit = sum(float(e["amount"]) for e in entries if e.get("entry_type") == "kredit" and e.get("amount") is not None)
selisih = abs(total_debit - total_kredit)

def rp(a):  # Rupiah, pemisah ribuan pakai titik (ID)
    return f"{a:,.0f}".replace(",", ".")

print(f"tx_hari_ini={len(source_ids)} entries={len(entries)} debit={rp(total_debit)} kredit={rp(total_kredit)} selisih={rp(selisih)}")

if selisih <= 1000:
    print("[SILENT]")  # seimbang
    raise SystemExit(0)

# 3) tidak seimbang -> alert
tanggal = start.strftime("%d %B %Y")  # 15 July 2026
bulan_id = {"January":"Januari","February":"Februari","March":"Maret","April":"April",
            "May":"Mei","June":"Juni","July":"Juli","August":"Agustus","September":"September",
            "October":"Oktober","November":"November","December":"Desember"}
tanggal = " ".join(bulan_id.get(w, w) for w in tanggal.split())

text = (
    "⚠️ *Akuntansi Tidak Seimbang!*\n"
    f"📅 {tanggal}\n"
    f"💳 Debit: Rp{rp(total_debit)}\n"
    f"💳 Kredit: Rp{rp(total_kredit)}\n"
    f"❌ Selisih: Rp{rp(selisih)}\n"
    f"🆔 Transaksi terkait: {len(source_ids)} tx\n"
    "Mohon cek manual di web admin."
)

r = httpx.get(
    f"https://api.telegram.org/bot{BOT}/sendMessage",
    params={"chat_id": CHAT, "text": text, "parse_mode": "Markdown"},
    timeout=30,
)
ok = r.status_code == 200
print(f"telegram_sent={ok} status={r.status_code} detail={r.text[:200]}")
raise SystemExit(0)
