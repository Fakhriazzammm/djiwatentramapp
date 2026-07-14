#!/usr/bin/env python3
"""
Auto-detect newly closed shifts and send Dibuat/Selesai recap to barista & kitchen groups.
Tracks last processed shift end_time via cursor file.
"""
import os, sys, json, httpx
from dotenv import load_dotenv; load_dotenv()
from datetime import datetime, timezone, timedelta

TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
BARISTA_GROUP_ID = int(os.getenv("BARISTA_GROUP_ID", "-5182004468"))
KITCHEN_GROUP_ID = int(os.getenv("KITCHEN_GROUP_ID", "-5199093599"))
CURSOR_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".shift_recap_cursor.txt")

G = {
    "barista": {"chat_id": BARISTA_GROUP_ID, "icon": "☕", "label": "Barista"},
    "kitchen": {"chat_id": KITCHEN_GROUP_ID, "icon": "🍳", "label": "Kitchen"},
}

def _load_cursor() -> int:
    """Load last processed end_time (epoch ms). Returns 0 if no cursor."""
    try:
        with open(CURSOR_FILE) as f:
            return int(f.read().strip())
    except:
        return 0

def _save_cursor(ts: int):
    with open(CURSOR_FILE, "w") as f:
        f.write(str(ts))

def _ms_to_iso(ms: int) -> str:
    """Convert epoch ms to ISO string with Z suffix."""
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).isoformat().replace("+00:00", "Z")

def _fmt_iso_wib(iso_str: str) -> str:
    """Format ISO time to HH:MM WIB."""
    if not iso_str:
        return "—"
    try:
        dt = datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
        return dt.astimezone(timezone(timedelta(hours=7))).strftime("%H:%M")
    except:
        return iso_str[:16]

def _fmt_epoch_wib(ms: int) -> str:
    """Format epoch ms to HH:MM WIB."""
    dt = datetime.fromtimestamp(ms / 1000, tz=timezone(timedelta(hours=7)))
    return dt.strftime("%d/%m %H:%M")

def _build_recap(shift: dict, orders: list[dict], group_type: str) -> str | None:
    """Build recap text for one group_type. Returns None if no orders."""
    group_orders = [o for o in orders if o.get("group_type") == group_type]
    if not group_orders:
        return None
    
    g = G[group_type]
    total = len(group_orders)
    
    # Count by status
    dibuat_by = {}
    selesai_by = {}
    for o in group_orders:
        b = o.get("dibuat_by")
        s = o.get("selesai_by")
        if b: dibuat_by[b] = dibuat_by.get(b, 0) + 1
        if s: selesai_by[s] = selesai_by.get(s, 0) + 1
    
    shift_name = shift.get("shift_name", "Shift")
    cashier = shift.get("cashier_name", "")
    start_t = _fmt_epoch_wib(shift["start_time"])
    end_t = _fmt_epoch_wib(shift["end_time"])
    
    lines = [
        f"📊 *Rekap {g['label']} {g['icon']}*\n",
        f"🕐 Shift: *{shift_name}*\n",
        f"👤 Kasir: {cashier}",
        f"📅 {start_t} — {end_t}\n",
        f"📋 Total order: {total}",
    ]
    
    if dibuat_by:
        rank = sorted(dibuat_by.items(), key=lambda x: -x[1])
        medals = ["🥇", "🥈", "🥉"]
        bk = [f"   {medals[i] if i < 3 else f'{i+1}. '} {n}: {c}x" for i, (n, c) in enumerate(rank)]
        lines.append(f"\n✅ *Dibuat:* {sum(dibuat_by.values())}")
        lines.extend(bk)
    
    if selesai_by:
        rank = sorted(selesai_by.items(), key=lambda x: -x[1])
        medals = ["🥇", "🥈", "🥉"]
        sk = [f"   {medals[i] if i < 3 else f'{i+1}. '} {n}: {c}x" for i, (n, c) in enumerate(rank)]
        lines.append(f"\n🏁 *Selesai:* {sum(selesai_by.values())}")
        lines.extend(sk)
    
    # Recent activity (last 5)
    recent = group_orders[-5:] if len(group_orders) > 5 else group_orders
    lines.append(f"\n📝 *Aktivitas Terbaru:*")
    for o in reversed(recent):
        no = o.get("order_no", "?")
        st = o.get("status", "?")
        emoji = "✅" if st == "dibuat" else "🏁" if st == "selesai" else "📋"
        by = o.get("dibuat_by") or o.get("selesai_by") or "—"
        tm = _fmt_iso_wib(o.get("selesai_at") or o.get("dibuat_at") or o.get("created_at"))
        lines.append(f"   {emoji} {no} — {by} {tm}")
    
    return "\n".join(lines)

def main():
    h = {"apikey": KEY, "Authorization": f"Bearer {KEY}"}
    cursor = _load_cursor()
    now_ms = int(datetime.now().timestamp() * 1000)
    
    # Find shifts closed since last cursor
    url = (f"{SUPABASE_URL}/rest/v1/shifts"
           f"?select=source_id,shift_name,cashier_name,team_members,start_time,end_time"
           f"&end_time=gt.{cursor}"
           f"&end_time=lte.{now_ms}"
           f"&order=end_time.asc")
    r = httpx.get(url, headers={**h, "Accept-Profile": "pos"}, timeout=15)
    shifts = r.json() if isinstance(r.json(), list) else []
    
    if not shifts:
        print(f"No new closed shifts. Cursor: {cursor}")
        return
    
    print(f"Found {len(shifts)} newly closed shift(s)")
    
    last_end_time = cursor
    for shift in shifts:
        s_id = shift.get("source_id", "?")
        s_name = shift.get("shift_name", "Shift")
        s_start = shift.get("start_time", 0)
        s_end = shift.get("end_time", 0)
        
        print(f"\n--- Shift: {s_name} ({s_id}) ---")
        print(f"    {_fmt_epoch_wib(s_start)} → {_fmt_epoch_wib(s_end)}")
        
        # Get orders in this shift's time range
        start_iso = _ms_to_iso(s_start)
        end_iso = _ms_to_iso(s_end)
        
        orders_url = (f"{SUPABASE_URL}/rest/v1/pos_order_status"
                      f"?select=order_no,group_type,status,dibuat_by,selesai_by,dibuat_at,selesai_at,created_at"
                      f"&created_at=gte.{start_iso}"
                      f"&created_at=lt.{end_iso}"
                      f"&order=created_at.asc")
        or_ = httpx.get(orders_url, headers=h, timeout=15)
        orders = or_.json() if isinstance(or_.json(), list) else []
        
        barista_total = len([o for o in orders if o.get("group_type") == "barista"])
        kitchen_total = len([o for o in orders if o.get("group_type") == "kitchen"])
        print(f"    Orders: {len(orders)} total ({barista_total} barista, {kitchen_total} kitchen)")
        
        # Build and send recaps
        for gt in ["barista", "kitchen"]:
            msg = _build_recap(shift, orders, gt)
            if msg:
                g = G[gt]
                chat_id = g["chat_id"]
                r2 = httpx.post(
                    f"https://api.telegram.org/bot{TOKEN}/sendMessage",
                    json={"chat_id": chat_id, "text": msg, "parse_mode": "Markdown"},
                    timeout=15,
                )
                if r2.status_code == 200:
                    print(f"    ✅ Sent to {gt} group")
                else:
                    print(f"    ❌ {gt} group: {r2.json().get('description', '')}")
            else:
                print(f"    — No orders for {gt}, skip")
        
        # Update cursor
        if s_end > last_end_time:
            last_end_time = s_end
    
    _save_cursor(last_end_time)
    print(f"\n✅ Cursor updated to: {last_end_time}")

if __name__ == "__main__":
    main()
