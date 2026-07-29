#!/usr/bin/env python3
"""Send announcement to all employees via Telegram bot."""
import os, sys
from dotenv import load_dotenv
load_dotenv()

BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not BOT_TOKEN or len(BOT_TOKEN) < 40:
    print(f"ERROR: Invalid BOT_TOKEN")
    sys.exit(1)

import httpx

headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
}
url = f"{SUPABASE_URL}/rest/v1/employee_telegram_links?select=telegram_user_id,employee_name,employee_user_id&is_active=eq.true"
r = httpx.get(url, headers=headers, timeout=15)
r.raise_for_status()
employees = r.json()
print(f"Found {len(employees)} employees: {[e['employee_name'] for e in employees]}")

msg = (
    "Assalamualaikum warahmatullahi wabarakatuh,\n\n"
    "Mohon maaf atas gangguan sistemnya, sekarang sudah diperbaiki.\n\n"
    "Mulai sekarang, absensi dan akses karyawan sudah bisa melalui "
    "karyawan.yumme.id menggunakan HP masing-masing.\n\n"
    "\U0001f511 Cara Login:\n"
    "1. Buka karyawan.yumme.id di HP\n"
    "2. Masukkan Nama Lengkap / Username masing-masing\n"
    "3. PIN default: 696969\n"
    "4. Setelah login, langsung ganti PIN di menu Profil > Ganti PIN\n\n"
    "Silakan dicoba dan laporkan jika ada kendala.\n\n"
    "Terima kasih."
)

success = 0
failed = 0
errors = []

for emp in employees:
    tg_id = emp["telegram_user_id"]
    name = emp["employee_name"]
    try:
        url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
        data = {"chat_id": tg_id, "text": msg, "parse_mode": "Markdown"}
        resp = httpx.post(url, json=data, timeout=30)
        if resp.status_code == 200:
            print(f"  ✅ {name}")
            success += 1
        else:
            err = resp.json().get("description", resp.text)
            print(f"  ❌ {name} — {err}")
            failed += 1
            errors.append(f"{name}: {err}")
    except Exception as e:
        print(f"  ❌ {name} — {e}")
        failed += 1
        errors.append(f"{name}: {e}")

print(f"\n{'='*40}")
print(f"✅ Success: {success}")
print(f"❌ Failed: {failed}")
for err in errors:
    print(f"   - {err}")
print(f"{'='*40}")