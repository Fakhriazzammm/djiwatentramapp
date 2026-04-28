#!/usr/bin/env python3
"""
Low Stock Alert — queries Supabase for items below threshold and sends Telegram alert.
Run via systemd timer every hour.
"""
import os
import sys
import json
import urllib.request
from datetime import datetime, timezone, timedelta

WIB = timezone(timedelta(hours=7))

# Config
SUPABASE_URL = "https://xaemykhjpkgypqqpfdcb.supabase.co"
SUPABASE_KEY = "sb_publishable_LGFL7r4JQVqG1fvwNniJ7A_ub29yf_3"

# Telegram config — read from yumi-ai-bot .env
ENV_FILE = "/opt/djiwatentramapp/yumi-ai-bot/.env"
TELEGRAM_TOKEN = None
TELEGRAM_CHAT_ID = None

def load_env():
    global TELEGRAM_TOKEN, TELEGRAM_CHAT_ID
    with open(ENV_FILE) as f:
        for line in f:
            line = line.strip()
            if line.startswith("TELEGRAM_BOT_TOKEN="):
                TELEGRAM_TOKEN = line.split("=", 1)[1]
            elif line.startswith("TELEGRAM_REPORT_CHAT_ID="):
                TELEGRAM_CHAT_ID = line.split("=", 1)[1]

def supabase_query(view, select="*", params=None):
    url = f"{SUPABASE_URL}/rest/v1/{view}?select={select}"
    if params:
        for k, v in params.items():
            url += f"&{k}={v}"
    req = urllib.request.Request(url)
    req.add_header("apikey", SUPABASE_KEY)
    req.add_header("Authorization", f"Bearer {SUPABASE_KEY}")
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())

def send_telegram(text):
    if not TELEGRAM_TOKEN or not TELEGRAM_CHAT_ID:
        print("ERROR: Telegram config not found", file=sys.stderr)
        return False
    url = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage"
    data = json.dumps({"chat_id": int(TELEGRAM_CHAT_ID), "text": text, "parse_mode": "HTML"}).encode()
    req = urllib.request.Request(url, data=data)
    req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req) as resp:
        result = json.loads(resp.read())
        return result.get("ok", False)

def main():
    load_env()
    now = datetime.now(WIB)

    # Query all inventory items (Supabase REST doesn't support column-to-column comparison)
    try:
        items = supabase_query("pos_inventory", 
            select="ingredientName,quantity,unit,lowStockThreshold",
            params={"order": "quantity.asc", "limit": "50"})
    except Exception as e:
        print(f"ERROR querying Supabase: {e}", file=sys.stderr)
        sys.exit(1)

    # Filter: quantity <= lowStockThreshold
    low_stock = [i for i in items if i["quantity"] <= (i.get("lowStockThreshold") or 0)]

    if not low_stock:
        print(f"[{now.strftime('%H:%M')}] No low stock items")
        return

    # Build message
    critical = [i for i in low_stock if i["quantity"] <= 0]
    warning = [i for i in low_stock if i["quantity"] > 0]

    lines = [f"<b>⚠ STOK MENIPIS</b> — {now.strftime('%d %b %H:%M WIB')}\n"]

    if critical:
        lines.append("<b>🔴 KRITIS (stok habis/negatif):</b>")
        for item in critical:
            lines.append(f"  • {item['ingredientName']}: <b>{item['quantity']}</b> {item['unit']} (threshold: {item['lowStockThreshold']})")
        lines.append("")

    if warning:
        lines.append("<b>🟡 WARNING:</b>")
        for item in warning[:10]:
            lines.append(f"  • {item['ingredientName']}: {item['quantity']} {item['unit']} (threshold: {item['lowStockThreshold']})")

    if len(low_stock) > len(critical) + 10:
        lines.append(f"  ... dan {len(low_stock) - len(critical) - 10} item lainnya")

    lines.append(f"\n<i>Total: {len(low_stock)} item perlu restock</i>")
    lines.append("<i>Cek: /admin/inventory</i>")

    message = "\n".join(lines)

    try:
        ok = send_telegram(message)
        status = "SENT" if ok else "FAILED"
        print(f"[{now.strftime('%H:%M')}] {status}: {len(low_stock)} low stock items ({len(critical)} critical)")
    except Exception as e:
        print(f"[{now.strftime('%H:%M')}] ERROR sending: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
