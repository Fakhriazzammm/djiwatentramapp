#!/usr/bin/env python3
"""Send today's recap of Dibuat/Selesai to barista & kitchen groups."""
import os, sys, httpx
from dotenv import load_dotenv; load_dotenv()
from datetime import datetime, timezone, timedelta

TOKEN = os.environ["TELEGRAM_BOT_TOKEN"]
SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
BARISTA_GROUP_ID = int(os.getenv("BARISTA_GROUP_ID", "-5182004468"))
KITCHEN_GROUP_ID = int(os.getenv("KITCHEN_GROUP_ID", "-5199093599"))

# WIB = UTC+7
WIB = timezone(timedelta(hours=7))
now = datetime.now(WIB)
today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
today_end = today_start + timedelta(days=1)

def iso(ts):
    """Convert datetime to ISO format Supabase expects (UTC with Z suffix)."""
    return ts.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")

def fmt_time(iso_str):
    """Format ISO time to HH:MM WIB."""
    if not iso_str:
        return "—"
    try:
        dt = datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
        return dt.astimezone(WIB).strftime("%H:%M")
    except:
        return iso_str[:16]

# Fetch all orders today
h = {"apikey": KEY, "Authorization": f"Bearer {KEY}"}
url = (f"{SUPABASE_URL}/rest/v1/pos_order_status"
       f"?select=order_no,group_type,status,dibuat_by,selesai_by,dibuat_at,selesai_at,created_at"
       f"&created_at=gte.{iso(today_start)}"
       f"&created_at=lt.{iso(today_end)}"
       f"&order=created_at.asc")
r = httpx.get(url, headers=h, timeout=15)
orders = r.json()
print(f"Total today: {len(orders)} orders")

# Separate by group
barista_orders = [o for o in orders if o.get("group_type") == "barista"]
kitchen_orders = [o for o in orders if o.get("group_type") == "kitchen"]

def build_recap(group_name, items):
    if not items:
        return f"📊 *Rekap {group_name} — Hari Ini*\n\nBelum ada order hari ini. 📭"
    
    total = len(items)
    dibuat_count = sum(1 for o in items if o.get("status") == "dibuat" or o.get("dibuat_by"))
    selesai_count = sum(1 for o in items if o.get("status") == "selesai" or o.get("selesai_by"))
    
    # Who made how many
    dibuat_by = {}
    selesai_by = {}
    for o in items:
        b = o.get("dibuat_by")
        s = o.get("selesai_by")
        if b:
            dibuat_by[b] = dibuat_by.get(b, 0) + 1
        if s:
            selesai_by[s] = selesai_by.get(s, 0) + 1
    
    lines = [
        f"📊 *Rekap {group_name} — Hari Ini*\n",
        f"📋 Total order: {total}"
    ]
    
    if dibuat_count > 0:
        # Sort by count descending for the ranking
        dibuat_rank = sorted(dibuat_by.items(), key=lambda x: -x[1])
        dibuat_line = []
        for i, (name, cnt) in enumerate(dibuat_rank, 1):
            dibuat_line.append(f"   {'🥇' if i==1 else '🥈' if i==2 else '🥉' if i==3 else f'{i}. '} {name}: {cnt}x")
        lines.append(f"\n✅ *Dibuat:* {dibuat_count}")
        lines.extend(dibuat_line)
    
    if selesai_count > 0:
        selesai_rank = sorted(selesai_by.items(), key=lambda x: -x[1])
        selesai_line = []
        for i, (name, cnt) in enumerate(selesai_rank, 1):
            selesai_line.append(f"   {'🥇' if i==1 else '🥈' if i==2 else '🥉' if i==3 else f'{i}. '} {name}: {cnt}x")
        lines.append(f"\n🏁 *Selesai:* {selesai_count}")
        lines.extend(selesai_line)
    
    # Recent activity
    # Take last 10
    recent = items[-10:] if len(items) > 10 else items
    lines.append(f"\n📝 *Aktivitas Terbaru:*")
    for o in reversed(recent):
        no = o.get("order_no", "?")
        st = o.get("status", "?")
        emoji = "✅" if st == "dibuat" else "🏁" if st == "selesai" else "📋"
        by = o.get("dibuat_by") or o.get("selesai_by") or ""
        tm = fmt_time(o.get("selesai_at") or o.get("dibuat_at") or o.get("created_at"))
        lines.append(f"   {emoji} {no} — {by} {tm}")
    
    return "\n".join(lines)

# Build messages
barista_msg = build_recap("Barista ☕", barista_orders)
kitchen_msg = build_recap("Kitchen 🍳", kitchen_orders)

print("\n" + "="*50)
print("BARISTA RECAP:")
print(barista_msg)
print("\n" + "="*50)
print("KITCHEN RECAP:")
print(kitchen_msg)

# Send to groups
def send(chat_id, text):
    r = httpx.post(
        f"https://api.telegram.org/bot{TOKEN}/sendMessage",
        json={"chat_id": chat_id, "text": text, "parse_mode": "Markdown"},
        timeout=15,
    )
    return r.status_code == 200, r.json().get("description", "")

print("\n" + "="*50)
print("SENDING...")

ok_b, err_b = send(BARISTA_GROUP_ID, barista_msg)
print(f"{'✅' if ok_b else '❌'} Barista group: {'sent' if ok_b else err_b}")

ok_k, err_k = send(KITCHEN_GROUP_ID, kitchen_msg)
print(f"{'✅' if ok_k else '❌'} Kitchen group: {'sent' if ok_k else err_k}")

print("\nDone.")
