#!/usr/bin/env python3
"""Laporan Akuntansi Harian - kirim ringkasan ke grup Finance Telegram.

Query financial_transactions hari ini (pos) + accounting_entries (public),
hitung debit/kredit, income/expense, dan kirim laporan ke grup -4995568785.
Run: .venv/bin/python daily_accounting_report.py
"""
import httpx
from datetime import datetime, timedelta, timezone

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
BOT = cfg["TELEGRAM_BOT_TOKEN"]
CHAT = "-1003916990045"  # grup Finance (migrated supergroup; old -4995568785 no longer accepts msgs)

H_POS = {"apikey": KEY, "Authorization": f"Bearer {KEY}", "Accept-Profile": "pos"}
H_PUB = {"apikey": KEY, "Authorization": f"Bearer {KEY}", "Accept-Profile": "public"}

SKIP_CATEGORIES = {"HPP", "Modal Awal", "Setoran Akhir"}


def rp(a):
    return f"{a:,.0f}".replace(",", ".")


# 1) financial_transactions hari ini
r = httpx.get(
    f"{SUPABASE_URL}/rest/v1/financial_transactions"
    f"?select=source_id,tx_type,amount,category"
    f"&tx_date=gte.{start_ms}&tx_date=lte.{now_ms}&limit=5000",
    headers=H_POS, timeout=30,
)
r.raise_for_status()
txs = r.json()
print(f"[diag] financial_transactions count={len(txs)}")

source_ids = list({row["source_id"] for row in txs if row.get("source_id")})

# 2) accounting_entries by source_id
total_debit = 0.0
total_kredit = 0.0
if source_ids:
    ids = ",".join(source_ids)
    r = httpx.get(
        f"{SUPABASE_URL}/rest/v1/accounting_entries"
        f"?select=entry_type,amount"
        f"&transaction_source_id=in.({ids})&limit=5000",
        headers=H_PUB, timeout=30,
    )
    r.raise_for_status()
    entries = r.json()
    print(f"[diag] accounting_entries count={len(entries)}")
    total_debit = sum(float(e["amount"]) for e in entries
                      if e.get("entry_type") == "debit" and e.get("amount") is not None)
    total_kredit = sum(float(e["amount"]) for e in entries
                       if e.get("entry_type") == "kredit" and e.get("amount") is not None)

selisih = abs(total_debit - total_kredit)
balanced = selisih <= 1000

# 3) income / expense (skip HPP, Modal Awal, Setoran Akhir)
total_income = 0.0
total_expense = 0.0
for row in txs:
    cat = row.get("category")
    if cat in SKIP_CATEGORIES:
        continue
    amt = float(row["amount"]) if row.get("amount") is not None else 0.0
    if row.get("tx_type") == "income":
        total_income += amt
    elif row.get("tx_type") == "expense":
        total_expense += amt
saldo = total_income - total_expense

# 4) tanggal Indonesia
bulan_id = {"January": "Januari", "February": "Februari", "March": "Maret",
            "April": "April", "May": "Mei", "June": "Juni", "July": "Juli",
            "August": "Agustus", "September": "September", "October": "Oktober",
            "November": "November", "December": "Desember"}
tanggal = " ".join(bulan_id.get(w, w) for w in start.strftime("%d %B %Y").split())

# 5) format pesan (Markdown: *bold* bukan **)
bal_line = (f"  ✅ SEIMBANG (selisih Rp{rp(selisih)})" if balanced
            else f"  ⚠️ TIDAK SEIMBANG — selisih Rp{rp(selisih)}")

text = (
    "*📊 Laporan Akuntansi Harian*\n"
    f"📅 {tanggal}\n"
    "\n"
    "*💰 Keuangan:*\n"
    f"  Pemasukan: Rp{rp(total_income)}\n"
    f"  Pengeluaran: Rp{rp(total_expense)}\n"
    f"  Saldo: Rp{rp(saldo)}\n"
    "\n"
    "*📒 Akuntansi:*\n"
    f"  Total Debit: Rp{rp(total_debit)}\n"
    f"  Total Kredit: Rp{rp(total_kredit)}\n"
    f"{bal_line}\n"
    "\n"
    f"📦 {len(txs)} transaksi hari ini"
)

print(f"[diag] debit={rp(total_debit)} kredit={rp(total_kredit)} selisih={rp(selisih)} "
      f"income={rp(total_income)} expense={rp(total_expense)} balanced={balanced}")

r = httpx.get(
    f"https://api.telegram.org/bot{BOT}/sendMessage",
    params={"chat_id": CHAT, "text": text, "parse_mode": "Markdown"},
    timeout=30,
)
print(f"[diag] telegram status={r.status_code} ok={r.status_code == 200}")
if r.status_code != 200:
    print("[diag] telegram error:", r.text[:300])
raise SystemExit(0)
