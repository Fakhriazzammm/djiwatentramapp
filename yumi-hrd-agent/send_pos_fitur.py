#!/usr/bin/env python3
"""Send POS feature announcement — image + separate long text."""
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
print(f"\n👥 Found {len(employees)} employees")

photo_path = "/opt/djiwatentramapp/yumi-hrd-agent/pos_fitur_baru.jpg"
if not os.path.exists(photo_path):
    print(f"ERROR: Photo not found")
    sys.exit(1)

# Short caption for the photo
short_cap = "🚀 Fitur Baru POS — Antrian, Produksi Staff, & Assign Item! Klik gambar untuk perbesar."

# Full text as separate message
full_text = """🚀 *FITUR BARU POS — ANTRIAN, PRODUKSI STAFF, & ASSIGN ITEM!*

Halo Tim! Hari ini ada beberapa pembaruan besar di sistem POS. Berikut fitur dan manfaatnya:

━━━━━━━━━━━━━━━━━━━━━━━━━

*1️⃣ PANEL ANTRIAN REAL-TIME*
Order masuk langsung terlihat di panel antrian — terpisah antara *"Sedang Dibuat"* dan *"Selesai"*.

✅ *Manfaat:* Tidak perlu tanya "order mana yang sudah selesai?" — semua terpantau langsung, antrean lebih teratur, tidak ada order yang terlewat.

🔗 *Korelasi Telegram:* Selama ini notifikasi "Dibuat" dan "Selesai" sudah dikirim otomatis oleh Yumi Supervisor Agent ke grup Telegram. Sekarang informasinya bisa langsung dilihat *real-time* di layar POS — tanpa perlu buka HP. Telegram untuk notifikasi jarak jauh, POS untuk pantauan langsung di kasir.

━━━━━━━━━━━━━━━━━━━━━━━━━

*2️⃣ PRODUKSI STAFF*
Panel *Produksi Staff* muncul otomatis di atas antrian. Setiap staff yang shift terlihat dengan jumlah item, progress bar, dan ikon tugas (barista/koki).

✅ *Manfaat:* Beban kerja terlihat transparan — semua orang tahu siapa mengerjakan apa, memotivasi tim, dan memudahkan lead untuk bagi tugas.

🔗 *Korelasi Telegram:* Yumi Supervisor Agent sudah mencatat performa staff di shift recap harian. Panel ini melengkapi data tersebut secara *live* — staff bisa lihat progress langsung, bukan cuma di akhir shift.

━━━━━━━━━━━━━━━━━━━━━━━━━

*3️⃣ ASSIGN STAFF DI CHECKOUT*
Saat buat order, ada *Step 4* untuk assign staff ke setiap item pesanan.

✅ *Manfaat:* Tidak ada kebingungan "siapa yang buat ini?" — setiap item jelas penanggung jawabnya, akuntabilitas meningkat.

🔗 *Korelasi Telegram:* Data assign terhubung ke Yumi Supervisor Agent — laporan shift recap di Telegram jadi lebih akurat dengan breakdown per staff.

━━━━━━━━━━━━━━━━━━━━━━━━━

*4️⃣ DETAIL ORDER — KLIK UNTUK LIHAT LENGKAP*
Klik card order selesai untuk lihat detail item, siapa yang mengerjakan, waktu dibuat & selesai.

✅ *Manfaat:* Evaluasi lebih mudah — tahu siapa yang cepat, siapa yang butuh bantuan, riwayat production lebih jelas.

━━━━━━━━━━━━━━━━━━━━━━━━━

*📈 KE DEPAN: BONUS BERBASIS PRODUKSI INDIVIDUAL*

Semua data ini tercatat *real-time*. Ke depannya, sistem akan menghitung *bonus tambahan* untuk setiap staff berdasarkan item yang berhasil diproduksi per shift, *di luar* target revenue yang sudah ada.

Jadi bukan cuma target omset shift yang nentuin bonus, tapi juga kontribusi produksi tiap individu. Semakin cepat dan banyak kamu produksi, semakin bertambah bonusmu! ✨

━━━━━━━━━━━━━━━━━━━━━━━━━

Semua fitur sudah aktif. Coba langsung dan laporkan kalau ada kendala! 🎉

— *Management Djiwa Tentram* ☕🕊️"""

# Targeted chat IDs (only those the bot can reach)
targets = []
for emp in employees:
    targets.append({"id": emp["telegram_user_id"], "name": f"DM {emp['employee_name']}"})

# Groups the HRD bot can access
targets.append({"id": -1003991897388, "name": "GROUP HRD/Report"})

success = 0
failed = 0
errors = []

print(f"\n{'='*60}")
print(f"📨 SENDING TO {len(targets)} TARGETS...")
print(f"{'='*60}")

bot_url = f"https://api.telegram.org/bot{BOT_TOKEN}"

for t in targets:
    chat_id = t["id"]
    name = t["name"]
    try:
        # Step A: Send photo with short caption
        with open(photo_path, "rb") as f:
            files = {"photo": f}
            data = {"chat_id": chat_id, "caption": short_cap}
            resp = httpx.post(f"{bot_url}/sendPhoto", files=files, data=data, timeout=60)

        if resp.status_code != 200:
            err = resp.json().get("description", resp.text)
            print(f"❌ {name} — photo: {err}")
            failed += 1
            errors.append(f"{name}: {err}")
            continue

        # Step B: Send full text as separate message
        data2 = {"chat_id": chat_id, "text": full_text, "parse_mode": "Markdown"}
        resp2 = httpx.post(f"{bot_url}/sendMessage", data=data2, timeout=30)

        if resp2.status_code == 200:
            print(f"✅ {name} — sent")
            success += 1
        else:
            err = resp2.json().get("description", resp2.text)
            print(f"⚠️ {name} — photo ok, text: {err}")
            # Still count as success since photo was sent
            success += 1
            errors.append(f"{name}: text error - {err}")

    except Exception as e:
        print(f"❌ {name} — {e}")
        failed += 1
        errors.append(f"{name}: {e}")

print(f"\n{'='*60}")
print(f"✅ Success: {success}")
print(f"❌ Failed: {failed}")
for err in errors:
    print(f"   - {err}")
print(f"{'='*60}")
