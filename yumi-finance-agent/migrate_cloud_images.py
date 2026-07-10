#!/usr/bin/env python3
"""ponytail: download cloud receipt images → upload to VPS → update DB."""
import json, httpx, os, sys, io
from pathlib import Path
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
from dotenv import load_dotenv
load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")
SERVICE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
CLOUD_BASE = "https://xaemykhjpkgypqqpfdcb.supabase.co"
VPS_STORAGE = "https://supabase.yumme.id"  # works for upload
STORAGE_JPG_QUALITY = 95
MAX_SIZE = 2400

def headers():
    return {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SERVICE_KEY}"}

def fetch_all():
    r = httpx.get(
        f"{SUPABASE_URL}/rest/v1/pos_financial_transactions"
        "?select=_id,date,metadata&type=eq.expense&order=date.desc&limit=200",
        headers=headers(), timeout=30
    )
    r.raise_for_status()
    return r.json()

def download(url: str) -> bytes | None:
    try:
        r = httpx.get(url, timeout=30, follow_redirects=True)
        r.raise_for_status()
        return r.content
    except Exception as e:
        print(f"  ⚠️ Download failed: {e}")
        return None

def compress_for_storage(raw: bytes) -> bytes:
    img = Image.open(io.BytesIO(raw))
    if img.mode in ("RGBA", "P"):
        img = img.convert("RGB")
    w, h = img.size
    if max(w, h) > MAX_SIZE:
        ratio = MAX_SIZE / max(w, h)
        img = img.resize((int(w * ratio), int(h * ratio)), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=STORAGE_JPG_QUALITY, optimize=True, subsampling=0)
    return buf.getvalue()

def upload(filename: str, jpeg_bytes: bytes) -> str | None:
    try:
        url = f"{VPS_STORAGE}/storage/v1/object/receipt-images/{filename}"
        r = httpx.post(
            url,
            headers={**headers(), "Content-Type": "image/jpeg"},
            content=jpeg_bytes,
            timeout=30
        )
        r.raise_for_status()
        return f"{VPS_STORAGE}/storage/v1/object/public/receipt-images/{filename}"
    except Exception as e:
        print(f"  ⚠️ Upload failed: {e}")
        return None

def update_metadata(tx_id: str, new_url: str):
    # Get current metadata
    r = httpx.get(
        f"{SUPABASE_URL}/rest/v1/pos_financial_transactions?_id=eq.{tx_id}&select=metadata",
        headers=headers(), timeout=15
    )
    r.raise_for_status()
    rows = r.json()
    if not rows:
        return
    meta = rows[0].get("metadata", {})
    if isinstance(meta, str):
        meta = json.loads(meta)
    meta["receipt_image_url"] = new_url
    # PATCH
    r2 = httpx.patch(
        f"{SUPABASE_URL}/rest/v1/pos_financial_transactions?_id=eq.{tx_id}",
        headers={**headers(), "Content-Type": "application/json", "Prefer": "return=minimal"},
        json={"metadata": meta},
        timeout=15
    )
    r2.raise_for_status()

def main():
    print("🔍 Fetching transactions...")
    all_tx = fetch_all()
    
    cloud_entries = []
    for tx in all_tx:
        meta = tx.get("metadata")
        if isinstance(meta, str):
            try: meta = json.loads(meta)
            except: meta = {}
        if not isinstance(meta, dict):
            continue
        img = meta.get("receipt_image_url", "")
        if not img or CLOUD_BASE not in img:
            continue
        cloud_entries.append((tx["_id"], img))
    
    print(f"☁️  Cloud images to migrate: {len(cloud_entries)}")
    
    success = 0
    for i, (tx_id, cloud_url) in enumerate(cloud_entries, 1):
        print(f"\n📥 [{i}/{len(cloud_entries)}] {tx_id[:12]}...")
        print(f"   URL: {cloud_url[:90]}...")
        
        raw = download(cloud_url)
        if not raw:
            continue
        
        print(f"   Size: {len(raw):,} bytes")
        
        jpeg = compress_for_storage(raw)
        filename = f"receipt_migrated_{tx_id[:12]}.jpg"
        new_url = upload(filename, jpeg)
        
        if new_url:
            update_metadata(tx_id, new_url)
            print(f"   ✅ Migrated → {new_url[:80]}...")
            success += 1
    
    print(f"\n🏁 Done. {success}/{len(cloud_entries)} migrated.")

if __name__ == "__main__":
    main()
