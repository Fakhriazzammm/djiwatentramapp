#!/usr/bin/env python3
"""
Yumi HR Welcome — Kirim pesan selamat datang ke channel Djiwa Tentram
otomatis ketika ada karyawan baru yang di-approve.

Cara kerja:
  1. Cek employee_onboarding_applications WHERE status='approved'
     AND raw->>'welcomeSent' IS NULL
  2. Kirim welcome message ke channel via @YummeAIbot
  3. Update raw->>welcomeSent = 'true'
  
Jadwalkan via cron tiap 15 menit.
"""

import json
import os
import sys
from urllib.request import Request, urlopen
from urllib.error import URLError
from datetime import datetime, timezone, timedelta

# ─── Config ────────────────────────────────────────────────────
ENV_PATH = "/opt/djiwatentramapp/yumi-ai-bot/.env"
SUPABASE_URL = "https://supabase.yumme.id"
WIB = timezone(timedelta(hours=7))

def load_env():
    env = {}
    with open(ENV_PATH) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k] = v
    return env

def supabase_get(table, query="", key=""):
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    if query:
        url = f"{url}?{query}"
    req = Request(url, headers={
        "apikey": key,
        "Authorization": f"Bearer {key}",
    })
    with urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode())

def supabase_patch(table, query, payload, key):
    url = f"{SUPABASE_URL}/rest/v1/{table}?{query}"
    body = json.dumps(payload).encode()
    req = Request(url, data=body, method="PATCH", headers={
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    })
    with urlopen(req, timeout=15) as resp:
        return resp.read()

def send_telegram(bot_token, chat_id, text):
    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    payload = json.dumps({"chat_id": int(chat_id), "text": text}).encode()
    req = Request(url, data=payload, headers={"Content-Type": "application/json"})
    with urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode())

def build_welcome(app):
    """Build welcome message from application data."""
    name = app.get("full_name", "")
    nip = app.get("employee_nip", "-")
    phone = app.get("phone", "-")
    employment = app.get("employment", {}) or {}
    role_name = employment.get("roleName", "-")
    telegram_code = ""
    start_date = "-"
    status = "-"

    if employment.get("startDate"):
        start_date = employment["startDate"]
    if employment.get("employmentType"):
        emp_type = employment["employmentType"]
        labels = {"probation": "Probation", "full_time": "Full Time", "contract": "Kontrak", "intern": "Magang"}
        status = labels.get(emp_type, emp_type)

    # Emoji based on role
    role_upper = role_name.upper().strip()
    if role_upper in ("CHEF", "KITCHEN"):
        role_emoji = "\U0001f373"  # 🍳
    elif role_upper in ("BARISTA",):
        role_emoji = "\u2615"  # ☕
    elif role_upper in ("KASIR",):
        role_emoji = "\U0001f4b3"  # 💳
    elif role_upper in ("WAITERS", "WAITRESS"):
        role_emoji = "\U0001f481"  # 💁
    elif role_upper in ("MANAGER",):
        role_emoji = "\U0001f4bc"  # 💼
    elif role_upper in ("OWNER",):
        role_emoji = "\U0001f451"  # 👑
    elif role_upper in ("ADMIN",):
        role_emoji = "\U0001f4c1"  # 📁
    else:
        role_emoji = "\U0001f464"  # 👤

    # Fetch telegram_code from yumi_users
    # We need the approved_user_source_id to look up
    source_id = app.get("approved_user_source_id")
    if source_id:
        try:
            env = load_env()
            users = supabase_get("yumi_users",
                f"select=telegram_code&source_id=eq.{source_id}&limit=1",
                key=env.get("SUPABASE_KEY", ""))
            if users and users[0].get("telegram_code"):
                telegram_code = users[0]["telegram_code"]
        except Exception as e:
            print(f"  Warning: could not fetch telegram_code: {e}")

    # ── Build message ─────────────────────────────────────────
    header = f"\U0001f389 Selamat Datang {role_emoji} — {name}"
    greeting = (
        "Halo! Dengan senang hati kami mengumumkan bahwa kamu telah resmi bergabung\n"
        "sebagai bagian dari keluarga besar Djiwa Tentram Cafe & Resto,\n"
        "bagian dari Yumme Group! \U0001f31f\n"
        "\n"
        "Kami percaya kehadiranmu akan membawa semangat baru dan energi positif\n"
        "untuk tim kami. Selamat bergabung, ya!"
    )

    data_karyawan = (
        "\U0001f4cb Data Karyawan\n"
        f"  \u2022 Nama Lengkap  : {name}\n"
        f"  \u2022 NIP           : {nip}\n"
        f"  \u2022 Role          : {role_name} {role_emoji}\n"
        f"  \u2022 No. HP        : {phone}\n"
        f"  \u2022 Tgl Mulai     : {start_date}\n"
        f"  \u2022 Status        : {status}"
    )

    langkah = ""
    if telegram_code:
        langkah = (
            "\U0001f4cc Yang Perlu Kamu Lakukan:\n"
            "  1. Buka Telegram, cari @yumihrdbot\n"
            f"  2. Ketik perintah: /daftar {telegram_code}\n"
            "  3. Kalau berhasil, bot akan membalas dengan data kamu\n"
            "  4. Selesai! Kamu sudah bisa:\n"
            "     \u2022 Absen masuk / keluar lewat Telegram\n"
            "     \u2022 Menerima notifikasi order di grup yang sesuai\n"
            "     \u2022 Melihat jadwal shift kamu\n"
            "\n"
            "\U0001f4a1 Tips:\n"
            "  \u2022 Jangan lupa login ke aplikasi POS di https://pos.yumme.id\n"
            "  \u2022 Username dan password sudah diberikan oleh admin\n"
            "  \u2022 Kalau ada kendala, tanyakan ke tim manajemen ya"
        )

    closing = (
        "\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\n"
        "Sekali lagi, selamat bergabung! \U0001f389\n"
        "Mari kita berkarya dan tumbuh bersama \u2014\n"
        "Djiwa Tentram, Yumme Group.\n"
        "\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\n"
        "\u2014 Manajemen Djiwa Tentram"
    )

    parts = [header, "", greeting, "", data_karyawan]
    if langkah:
        parts += ["", langkah]
    parts += ["", closing]
    return "\n".join(parts)

# ─── Main ───────────────────────────────────────────────────────
def main():
    env = load_env()
    bot_token = env.get("TELEGRAM_BOT_TOKEN", "")
    supabase_key = env.get("SUPABASE_KEY", "")
    service_key = env.get("SUPABASE_SERVICE_ROLE_KEY", "")
    channel_id = "-1003534335147"

    if not bot_token or not supabase_key:
        print("ERROR: Missing TELEGRAM_BOT_TOKEN or SUPABASE_KEY in .env")
        sys.exit(1)

    # Find approved applications where welcome not yet sent
    query = (
        "select=id,full_name,employee_nip,phone,employment,approved_user_source_id,raw"
        "&status=eq.approved"
        "&approved_user_source_id=not.is.null"
        "&order=updated_at.desc"
        "&limit=5"
    )
    try:
        apps = supabase_get("employee_onboarding_applications", query, key=supabase_key)
    except Exception as e:
        print(f"ERROR: Query failed: {e}")
        sys.exit(1)

    sent_count = 0
    for app in apps:
        raw = app.get("raw", {}) or {}
        if raw.get("welcomeSent"):
            continue  # sudah dikirim

        name = app.get("full_name", "?")
        print(f"\nProcessing: {name}")

        # Build & send message
        try:
            msg = build_welcome(app)
            result = send_telegram(bot_token, channel_id, msg)
            if result.get("ok"):
                print(f"  ✅ Welcome sent! message_id: {result['result']['message_id']}")
            else:
                print(f"  ❌ Telegram error: {result}")
                continue
        except Exception as e:
            print(f"  ❌ Send failed: {e}")
            continue

        # Mark as sent
        app_id = app["id"]
        try:
            supabase_patch(
                "employee_onboarding_applications",
                f"id=eq.{app_id}",
                {"raw": {**raw, "welcomeSent": True}},
                key=service_key or supabase_key,
            )
            print(f"  ✅ Marked welcomeSent for {app_id}")
            sent_count += 1
        except Exception as e:
            print(f"  ❌ Failed to mark sent: {e}")

    print(f"\nDone. Sent {sent_count} welcome message(s).")

if __name__ == "__main__":
    main()
