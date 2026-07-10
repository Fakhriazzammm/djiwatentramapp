#!/usr/bin/env python3
"""Recover photos — background with file-based code entry."""
import asyncio, json, os, io, sys, time
from pathlib import Path

CODE_FILE = Path(__file__).parent / ".recovery_code.txt"
HASH_FILE = Path(__file__).parent / ".recovery_hash.txt"

async def main():
    from telethon import TelegramClient
    from datetime import datetime, timezone, timedelta
    from PIL import Image
    import httpx
    from dotenv import load_dotenv
    load_dotenv()

    API_ID = 1462022
    API_HASH = "ff6c225d8bda02b3ade819474043fd27"
    PHONE = "+6285156399831"
    FINANCE_GROUP_ID = int(os.getenv("FINANCE_GROUP_ID", "-4995568785"))
    SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
    SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")
    SERVICE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    WIB = timezone(timedelta(hours=7))

    # ── Step 1: send code, wait for user to write file ──
    client = TelegramClient('rec.session', API_ID, API_HASH)
    await client.connect()
    
    sent = await client.send_code_request(PHONE)
    HASH_FILE.write_text(sent.phone_code_hash)
    print(f"📱 Kode dikirim. Tulis kode ke {CODE_FILE}, lalu enter...")
    
    # Wait for code file
    while True:
        if CODE_FILE.exists():
            code = CODE_FILE.read_text().strip()
            if code and len(code) >= 5:
                break
        await asyncio.sleep(1)
    
    # ── Step 2: sign in ──
    try:
        await client.sign_in(PHONE, code, phone_code_hash=HASH_FILE.read_text().strip())
    except Exception as e:
        # Clean up code file
        CODE_FILE.unlink(missing_ok=True)
        HASH_FILE.unlink(missing_ok=True)
        print(f"❌ Login gagal: {e}")
        await client.disconnect()
        return
    
    me = await client.get_me()
    print(f"✅ Login: {me.first_name}")
    CODE_FILE.unlink(missing_ok=True)
    HASH_FILE.unlink(missing_ok=True)

    # ── Step 3: get group ──
    try:
        group = await client.get_entity(int(FINANCE_GROUP_ID))
        print(f"📂 Grup: {group.title}")
    except:
        print("❌ Grup gak ketemu, coba FINANCE_GROUP_ID di .env")
        await client.disconnect()
        return

    # ── Step 4: get DB transactions without photos ──
    H = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SERVICE_KEY}"}
    r = httpx.get(f"{SUPABASE_URL}/rest/v1/pos_financial_transactions?select=_id,date,description,metadata&type=eq.expense&order=date.desc&limit=500", headers=H, timeout=30)
    all_tx = r.json()
    
    no_img = []
    for tx in all_tx:
        m = tx.get("metadata")
        if isinstance(m, str):
            try: m = json.loads(m)
            except: m = {}
        if not isinstance(m, dict): m = {}
        if "yumi_finance_agent" in m.get("source","") and not m.get("receipt_image_url"):
            no_img.append({"_id": tx["_id"], "date_ms": tx.get("date",0), "desc": (tx.get("description","") or "")[:60]})
    
    print(f"\n📊 Agent tx tanpa foto: {len(no_img)}")
    if not no_img:
        print("✅ Semua sudah punya foto!")
        await client.disconnect()
        return

    # ── Step 5: scrape photos ──
    try:
        max_dt = datetime.fromtimestamp(max(t["date_ms"] for t in no_img)/1000, tz=WIB)
    except:
        max_dt = datetime.now(WIB)
    
    print(f"📥 Scraping dari {max_dt.strftime('%d %b %Y')} ke bawah...")
    photo_count = 0
    recovered = 0
    
    def compress(raw): 
        img = Image.open(io.BytesIO(raw))
        if img.mode in ("RGBA","P"): img = img.convert("RGB")
        w,h=img.size
        if max(w,h)>2400:
            r=2400/max(w,h); img=img.resize((int(w*r),int(h*r)),Image.LANCZOS)
        b=io.BytesIO();img.save(b,"JPEG",quality=95,optimize=True,subsampling=0)
        return b.getvalue()
    
    async def upload(jpg,fn):
        url=f"{SUPABASE_URL}/storage/v1/object/receipt-images/{fn}"
        async with httpx.AsyncClient(timeout=30) as c:
            r=await c.post(url,headers={"Authorization":f"Bearer {SERVICE_KEY}","Content-Type":"image/jpeg"},content=jpg)
            r.raise_for_status()
        return f"{SUPABASE_URL}/storage/v1/object/public/receipt-images/{fn}"
    
    def patch_db(tid,url):
        H2={"apikey":SUPABASE_KEY,"Authorization":f"Bearer {SERVICE_KEY}","Content-Type":"application/json","Prefer":"return=minimal"}
        r=httpx.get(f"{SUPABASE_URL}/rest/v1/pos_financial_transactions?_id=eq.{tid}&select=metadata",headers=H2,timeout=15)
        r.raise_for_status()
        m=r.json()[0].get("metadata",{})
        if isinstance(m,str): m=json.loads(m)
        m["receipt_image_url"]=url
        m["receipt_recovered"]=True
        httpx.patch(f"{SUPABASE_URL}/rest/v1/pos_financial_transactions?_id=eq.{tid}",headers=H2,json={"metadata":m},timeout=15).raise_for_status()
    
    async for msg in client.iter_messages(group, limit=5000, offset_date=max_dt, reverse=False):
        if not msg.photo: continue
        msg_dt = msg.date.replace(tzinfo=timezone.utc).astimezone(WIB)
        msg_ts = int(msg_dt.timestamp()*1000)
        
        try:
            raw = await msg.download_media(bytes)
            if not raw: continue
        except: continue
        
        photo_count += 1
        
        # Match closest transaction within 30 min
        best,bd = None,float('inf')
        for t in no_img:
            d=abs(t["date_ms"]-msg_ts)
            if d<bd and d<30*60*1000:
                bd=d;best=t
        if not best: continue
        
        jpg=compress(raw)
        fn=f"recovered_{best['_id'][:12]}_{msg.id}.jpg"
        try:
            url=await upload(jpg,fn)
        except Exception as e:
            print(f"  ⚠️ upload fail: {e}")
            continue
        
        patch_db(best["_id"],url)
        recovered+=1
        no_img.remove(best)
        print(f"  ✅ #{photo_count} {msg_dt.strftime('%d/%m %H:%M')} → {best['desc'][:40]} → {url[:60]}")
        
        if not no_img:
            print("  🎉 Done!")
            break
    
    print(f"\n🏁 Selesai. Recovered: {recovered}/{len(no_img)+recovered}")
    await client.disconnect()

asyncio.run(main())
