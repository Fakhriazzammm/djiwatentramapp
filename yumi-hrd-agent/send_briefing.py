#!/usr/bin/env python3
"""Send briefing image + text to all employees via Telegram bot."""
import os, sys, asyncio
from dotenv import load_dotenv

load_dotenv()
BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not BOT_TOKEN or len(BOT_TOKEN) < 40:
    print(f"ERROR: Invalid BOT_TOKEN (len={len(BOT_TOKEN) if BOT_TOKEN else 0})")
    sys.exit(1)

print(f"BOT_TOKEN ok (len={len(BOT_TOKEN)})")

import httpx

# 1. Fetch all active employees
headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
}
url = f"{SUPABASE_URL}/rest/v1/employee_telegram_links?select=telegram_user_id,employee_name,employee_user_id&is_active=eq.true"
r = httpx.get(url, headers=headers, timeout=15)
r.raise_for_status()
employees = r.json()
print(f"Found {len(employees)} employees: {[e['employee_name'] for e in employees]}")

# 2. Message content
caption = (
    "📢 *BRIEFING TIM: PENTINGNYA MUSIK DI DJIWA TENTRAM*\n\n"
    "Halo Tim! 👋\n\n"
    "Musik adalah bagian dari pengalaman customer dan identitas Djiwa Tentram, "
    "bukan sekadar hiburan.\n\n"
    "🎵 *Mengapa Musik Penting?*\n"
    "Musik memengaruhi mood customer, lama mereka di cafe, repeat order, "
    "dan keinginan untuk membuat konten.\n"
    "Customer mungkin lupa rasa kopi, tapi akan mengingat *suasana* "
    "yang mereka rasakan.\n\n"
    "☕ *Benchmark: Kopi ARA*\n"
    "Kopi ARA dikenal konsisten dengan playlist-nya sehingga "
    "membangun identitas kuat.\n\n"
    "🎯 *Standar Musik Djiwa Tentram:*\n"
    "✅ Gunakan playlist yang telah ditentukan\n"
    "✅ Jaga volume tetap nyaman untuk ngobrol\n"
    "✅ Hindari musik keras / remix berlebihan\n"
    "✅ Jangan ganti playlist tanpa izin Manajer\n\n"
    "Musik harus menciptakan suasana *hangat, tenang, dan nyaman* "
    "agar customer betah dan kembali lagi.\n\n"
    "Mari bersama menjaga identitas Djiwa Tentram melalui "
    "pelayanan, rasa, kebersihan, dan musik yang konsisten.\n\n"
    "Terima kasih! 🙏\n"
    "— *Management Djiwa Tentram* ☕🕊️"
)

# 3. Send to each employee
photo_path = "/opt/djiwatentramapp/yumi-hrd-agent/briefing_musik.jpg"
if not os.path.exists(photo_path):
    print(f"ERROR: Photo not found at {photo_path}")
    sys.exit(1)

success = 0
failed = 0
errors = []

for emp in employees:
    tg_id = emp["telegram_user_id"]
    name = emp["employee_name"]
    try:
        # Send photo with caption
        url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendPhoto"
        with open(photo_path, "rb") as f:
            files = {"photo": f}
            data = {"chat_id": tg_id, "caption": caption, "parse_mode": "Markdown"}
            resp = httpx.post(url, files=files, data=data, timeout=60)
        
        if resp.status_code == 200:
            print(f"✅ {name} (ID {tg_id}) — sent")
            success += 1
        else:
            err = resp.json().get("description", resp.text)
            print(f"❌ {name} (ID {tg_id}) — {err}")
            failed += 1
            errors.append(f"{name}: {err}")
    except Exception as e:
        print(f"❌ {name} (ID {tg_id}) — {e}")
        failed += 1
        errors.append(f"{name}: {e}")

print(f"\n{'='*50}")
print(f"✅ Success: {success}")
print(f"❌ Failed: {failed}")
for err in errors:
    print(f"   - {err}")
print(f"{'='*50}")
