#!/usr/bin/env python3
"""Recover receipt photos from Telegram finance group chat history via Telethon."""
import asyncio, json, os, io, sys
from datetime import datetime, timezone, timedelta
from pathlib import Path
from PIL import Image
import httpx
from dotenv import load_dotenv

# ── Config ─────────────────────────────────────────────────────
load_dotenv()
API_ID = int(os.getenv("TELEGRAM_API_ID", "0"))
API_HASH = os.getenv("TELEGRAM_API_HASH", "")
PHONE = os.getenv("TELEGRAM_PHONE", "")
FINANCE_GROUP_ID = int(os.getenv("FINANCE_GROUP_ID", "-1003916990045"))

# Fallback: baca dari env finance agent
if not API_ID:
    # Coba baca dari env system
    API_ID = int(os.getenv("TG_API_ID", "0"))

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")
SERVICE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

STORAGE_JPEG_QUALITY = 95
MAX_SIZE = 2400
WIB = timezone(timedelta(hours=7))

SESSION_FILE = Path(__file__).parent / "recovery.session"

print("=" * 60)
print("RECOVERY: Scrape foto struk dari Finance Group")
print("=" * 60)

if not API_ID or not API_HASH:
    print("\n❌ API_ID/API_HASH tidak ditemukan di environment.")
    print("   Set env: TELEGRAM_API_ID, TELEGRAM_API_HASH, TELEGRAM_PHONE")
    print("   Atau edit file ini langsung.")
    sys.exit(1)

# ── Helpers ───────────────────────────────────────────────────
def compress(raw: bytes) -> bytes:
    img = Image.open(io.BytesIO(raw))
    if img.mode in ("RGBA", "P"):
        img = img.convert("RGB")
    w, h = img.size
    if max(w, h) > MAX_SIZE:
        ratio = MAX_SIZE / max(w, h)
        img = img.resize((int(w * ratio), int(h * ratio)), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=STORAGE_JPEG_QUALITY, optimize=True, subsampling=0)
    return buf.getvalue()

async def upload(jpeg_bytes: bytes, filename: str) -> str | None:
    url = f"{SUPABASE_URL}/storage/v1/object/receipt-images/{filename}"
    H = {"Authorization": f"Bearer {SERVICE_KEY}", "Content-Type": "image/jpeg"}
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.post(url, headers=H, content=jpeg_bytes)
        r.raise_for_status()
    return f"{SUPABASE_URL}/storage/v1/object/public/receipt-images/{filename}"

def update_metadata(tx_id: str, img_url: str):
    H = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }
    # Get current metadata
    r = httpx.get(
        f"{SUPABASE_URL}/rest/v1/pos_financial_transactions?_id=eq.{tx_id}&select=metadata",
        headers=H, timeout=15
    )
    r.raise_for_status()
    rows = r.json()
    if not rows:
        return False
    meta = rows[0].get("metadata", {})
    if isinstance(meta, str):
        meta = json.loads(meta)
    meta["receipt_image_url"] = img_url
    meta["receipt_recovered"] = True
    r2 = httpx.patch(
        f"{SUPABASE_URL}/rest/v1/pos_financial_transactions?_id=eq.{tx_id}",
        headers=H, json={"metadata": meta}, timeout=15
    )
    r2.raise_for_status()
    return True

# ── Main ──────────────────────────────────────────────────────
async def main():
    from telethon import TelegramClient
    from telethon.tl.types import MessageMediaPhoto
    from telethon.errors import SessionPasswordNeededError
    
    print(f"\n📱 Login ke Telegram...")
    client = TelegramClient(str(SESSION_FILE), API_ID, API_HASH)
    await client.connect()
    
    if not await client.is_user_authorized():
        print(f"   Mengirim kode ke {PHONE}...")
        sent = await client.send_code_request(PHONE)
        phone_code_hash = sent.phone_code_hash
        print(f"   ✅ Kode terkirim! phone_code_hash={phone_code_hash[:10]}...")
        
        verify_code = os.getenv("TG_VERIFY_CODE", "")
        if not verify_code:
            verify_code = input("Masukkan kode verifikasi: ")
        
        try:
            await client.sign_in(PHONE, verify_code, phone_code_hash=phone_code_hash)
        except SessionPasswordNeededError:
            password = os.getenv("TG_2FA_PASSWORD", "")
            if not password:
                password = input("Akun punya 2FA. Masukkan password: ")
            await client.sign_in(password=password)
    me = await client.get_me()
    print(f"✅ Login sebagai: {me.first_name} (@{me.username or 'no username'})")
    
    # Find finance group
    print(f"\n🔍 Cari grup finance (ID: {FINANCE_GROUP_ID})...")
    try:
        group = await client.get_entity(int(FINANCE_GROUP_ID))
        print(f"✅ Grup: {group.title}")
    except Exception as e:
        print(f"❌ Grup tidak ditemukan: {e}")
        await client.disconnect()
        return
    
    # Get existing transactions from DB (agent source, no image)
    H = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SERVICE_KEY}"}
    r = httpx.get(
        f"{SUPABASE_URL}/rest/v1/pos_financial_transactions"
        "?select=_id,date,description,metadata"
        "&type=eq.expense"
        "&order=date.desc"
        "&limit=500",
        headers=H, timeout=30
    )
    all_tx = r.json()
    
    # Filter: from agent, no image
    no_img_tx = []
    for tx in all_tx:
        m = tx.get("metadata")
        if isinstance(m, str):
            try: m = json.loads(m)
            except: m = {}
        if not isinstance(m, dict):
            m = {}
        src = m.get("source", "")
        has_img = bool(m.get("receipt_image_url", ""))
        if "yumi_finance_agent" in src and not has_img:
            no_img_tx.append({
                "_id": tx["_id"],
                "date_ms": tx.get("date", 0),
                "description": tx.get("description", "")[:60],
            })
    
    print(f"\n📊 Transaksi agent tanpa foto: {len(no_img_tx)}")
    
    if not no_img_tx:
        print("✅ Semua sudah punya foto!")
        await client.disconnect()
        return
    
    # Date range
    dates = [tx["date_ms"] for tx in no_img_tx]
    min_date = min(dates) / 1000 if dates else 0
    max_date = max(dates) / 1000 if dates else 0
    
    from_dt = datetime.fromtimestamp(min_date, tz=WIB)
    to_dt = datetime.fromtimestamp(max_date, tz=WIB)
    print(f"   Range: {from_dt.strftime('%d %b %Y')} → {to_dt.strftime('%d %b %Y')}")
    
    # Scrape photos from chat
    print(f"\n📥 Scraping foto dari chat...")
    photo_count = 0
    recovered = 0
    
    async for msg in client.iter_messages(group, limit=5000, offset_date=to_dt, reverse=False):
        if not msg.photo:
            continue
        
        msg_date = msg.date.replace(tzinfo=timezone.utc).astimezone(WIB)
        msg_ts = int(msg_date.timestamp() * 1000)
        
        # Download photo
        try:
            photo_bytes = await msg.download_media(bytes)
            if not photo_bytes:
                continue
        except Exception as e:
            print(f"  ⚠️ Gagal download: {e}")
            continue
        
        photo_count += 1
        
        # Find best matching transaction (closest in time, within 30 min)
        best_match = None
        best_diff = float('inf')
        for tx in no_img_tx:
            diff = abs(tx["date_ms"] - msg_ts)
            if diff < best_diff and diff < 30 * 60 * 1000:  # 30 menit
                best_diff = diff
                best_match = tx
        
        if not best_match:
            if photo_count <= 5:
                print(f"  ⏭️ #{photo_count}: {msg_date.strftime('%H:%M')} — tidak ada transaksi cocok")
            continue
        
        # Upload to storage
        jpeg = compress(photo_bytes)
        filename = f"receipt_recovered_{best_match['_id'][:12]}_{msg.id}.jpg"
        try:
            img_url = await upload(jpeg, filename)
        except Exception as e:
            print(f"  ⚠️ #{photo_count}: upload gagal: {e}")
            continue
        
        # Update DB
        try:
            update_metadata(best_match["_id"], img_url)
            recovered += 1
            no_img_tx.remove(best_match)
            desc = best_match["description"][:45]
            print(f"  ✅ #{photo_count}: {msg_date.strftime('%d/%m %H:%M')} → {desc} → {img_url[:60]}...")
        except Exception as e:
            print(f"  ⚠️ #{photo_count}: update DB gagal: {e}")
        
        if not no_img_tx:
            print("  🎉 Semua transaksi sudah punya foto!")
            break
    
    print(f"\n🏁 Selesai.")
    print(f"   Foto di-scrape: {photo_count}")
    print(f"   Berhasil recover: {recovered}")
    print(f"   Sisa tanpa foto: {len(no_img_tx)}")
    
    await client.disconnect()

if __name__ == "__main__":
    asyncio.run(main())
