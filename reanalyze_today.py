#!/usr/bin/env python3
"""Re-analyze hari ini: download 3 struk + AI vision → bandingkan."""
import asyncio, json, sys, os, re, io, base64
from datetime import datetime, timezone, timedelta
from PIL import Image
import httpx

sys.path.insert(0, '/opt/djiwatentramapp/yumi-finance-agent')
from sumopod_client import SumoPodClient

WIB = timezone(timedelta(hours=7))
SUPABASE_URL = "https://supabase.djiwatentram.web.id"
SERVICE_KEY = None  # will load below
MAX_IMAGE_SIZE = 2400
JPEG_QUALITY = 88

def compress(img_bytes):
    img = Image.open(io.BytesIO(img_bytes))
    if img.mode in ("RGBA", "P"): img = img.convert("RGB")
    w, h = img.size
    if max(w, h) > MAX_IMAGE_SIZE:
        r = MAX_IMAGE_SIZE / max(w, h)
        img = img.resize((int(w * r), int(h * r)), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=JPEG_QUALITY, optimize=True)
    b64 = base64.b64encode(buf.getvalue()).decode()
    return f"data:image/jpeg;base64,{b64}"

async def download(url):
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.get(url)
        r.raise_for_status()
        return r.content

def fmt(n):
    if n >= 1_000_000: return f"Rp{n:,.0f}"
    return f"Rp{int(n):,}"

async def main():
    # Load service key from running process
    import subprocess
    r = subprocess.run(
        "sudo cat /proc/$(pgrep -f 'yumi-finance-agent' | head -1)/environ 2>/dev/null | tr '\\0' '\\n' | grep SUPABASE_SERVICE_ROLE_KEY | cut -d= -f2-",
        shell=True, capture_output=True, text=True, timeout=10
    )
    global SERVICE_KEY
    SERVICE_KEY = r.stdout.strip()

    # Load sumopod key from .env
    with open('/opt/djiwatentramapp/yumi-finance-agent/.env') as f:
        for line in f:
            if line.startswith('SUMOPOD_API_KEY='):
                os.environ['SUMOPOD_API_KEY'] = line.split('=', 1)[1].strip()
                break

    sp = SumoPodClient(os.environ.get('SUMOPOD_API_KEY', ''))

    # Fetch 3 expense today that have images
    today_start = int(datetime(2026, 7, 12, 0, 0, 0, tzinfo=WIB).timestamp() * 1000)
    today_end = int(datetime(2026, 7, 13, 0, 0, 0, tzinfo=WIB).timestamp() * 1000)

    headers = {
        "apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}",
        "Accept": "application/json", "Accept-Profile": "pos",
    }

    # Use urllib for Supabase REST
    import urllib.request, ssl
    ctx = ssl._create_unverified_context()

    url = f"{SUPABASE_URL}/rest/v1/financial_transactions?tx_type=eq.expense&tx_date=gte.{today_start}&tx_date=lt.{today_end}&order=tx_date.desc&limit=20"
    req = urllib.request.Request(url, headers=headers)
    resp = urllib.request.urlopen(req, context=ctx, timeout=30)
    rows = json.loads(resp.read().decode())

    receipts = []
    for r in rows:
        meta = r.get("metadata") or {}
        img_url = meta.get("receipt_image_url", "") or ""
        if not img_url: continue
        receipts.append({
            "source_id": r.get("source_id", ""),
            "amount": r.get("amount", 0),
            "description": r.get("description", ""),
            "merchant": meta.get("merchant", ""),
            "old_items": meta.get("scanItems", []),
            "img_url": img_url,
            "dt": datetime.fromtimestamp(r.get("tx_date", 0)/1000, tz=WIB),
        })

    print(f"═" * 70)
    print(f"  RE-ANALISIS STRUK — 12 JULI 2026 — {len(receipts)} struk dengan foto")
    print(f"═" * 70)

    for i, rx in enumerate(receipts, 1):
        print(f"\n{'─'*60}")
        print(f"  [{i}/{len(receipts)}] {rx['dt'].strftime('%H:%M')} | {rx['description']}")
        print(f"  source_id: {rx['source_id']}")
        print(f"  DB nominal: {fmt(rx['amount'])}")
        print(f"{'─'*60}")

        # Download + compress
        img_bytes = await download(rx['img_url'])
        uri = compress(img_bytes)
        print(f"  🖼️ Gambar: {len(img_bytes) // 1024}KB → {len(uri) // 1024}KB base64")
        print(f"  🔍 Menganalisis ulang...", end=" ", flush=True)

        try:
            result = await sp.vision_json(image_base64_uri=uri, timeout=120)
            if not result.get("success"):
                print(f"❌ GAGAL: {result.get('error', 'unknown')}")
                continue

            data = result.get("data", {})
            new_merchant = (data.get("name") or "").strip()
            new_total = float(data.get("total") or 0)
            new_items = data.get("items") or []
            raw_text = data.get("rawText", "")[:200]

            print(f"✅ OK")
            print(f"  {'─'*30}")
            print(f"  🏪 Merchant: {new_merchant or '(tidak terbaca)'}")
            print(f"  💰 Nominal:  {fmt(new_total)}  (DB: {fmt(rx['amount'])})")

            old_total = float(rx['amount'])
            if old_total > 0 and new_total > 0 and abs(new_total - old_total) > 1000:
                diff = new_total - old_total
                print(f"  ⚠️ PERUBAHAN: {fmt(old_total)} → {fmt(new_total)} ({'+' if diff>0 else ''}{fmt(diff)})")
            elif old_total > 0 and new_total > 0:
                print(f"  ✅ OK (selisih < Rp1.000)")

            if new_items:
                print(f"  📋 Items ({len(new_items)}):")
                for j, it in enumerate(new_items[:8], 1):
                    n = it.get("name", f"Item{j}")
                    q = float(it.get("qty", 1))
                    p = float(it.get("price", 0))
                    s = float(it.get("subtotal", 0)) or p * q
                    print(f"    {j}. {n[:30]:30s} x{q:4.0f} @{fmt(p):>10s} = {fmt(s):>10s}")
                if len(new_items) > 8:
                    print(f"    ... +{len(new_items)-8} item lagi")
            else:
                print(f"  📋 Items: (tidak ada)")

            # Comparison with old scanItems
            if rx['old_items']:
                new_item_names = {it.get("name","").strip().lower() for it in new_items if it.get("name")}
                old_item_names = {it.get("name","").strip().lower() for it in rx['old_items'] if it.get("name")}
                added = new_item_names - old_item_names
                removed = old_item_names - new_item_names
                if added:
                    print(f"  ➕ Item baru: {', '.join(list(added)[:5])}")
                if removed:
                    print(f"  ➖ Item hilang: {', '.join(list(removed)[:5])}")

            if raw_text:
                print(f"  📄 Raw OCR: {raw_text[:120]}...")

        except Exception as e:
            print(f"❌ ERROR: {e}")

    print(f"\n{'═'*70}")
    print(f"  SELESAI — {len(receipts)} struk dianalisis")
    print(f"{'═'*70}")

if __name__ == "__main__":
    asyncio.run(main())
