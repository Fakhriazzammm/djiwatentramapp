#!/usr/bin/env python3
"""
Kirim notifikasi lamaran baru ke grup [Report] Djiwa Tentram.
Dipanggil dari server.js (apps/rekrutmen) setelah INSERT sukses.

Usage:
  python3 notify_new_applicant.py '<json-string>'

JSON fields:
  nama_lengkap, jenis_kelamin, tanggal_lahir, email,
  nomor_telepon, sosial_media, posisi_dilamar, tipe_kerja,
  cv_url, created_at
"""
import os
import sys
import json
import httpx
from html import escape
from dotenv import load_dotenv

load_dotenv()

BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN")
REPORT_CHAT_ID = os.environ.get("TELEGRAM_REPORT_CHAT_ID", "-1003991897388")

if not BOT_TOKEN:
    print("ERROR: TELEGRAM_BOT_TOKEN tidak ditemukan")
    sys.exit(1)


def fmt(v, default="-"):
    value = str(v).strip() if v else default
    return escape(value, quote=True)


def build_message(d):
    nama = fmt(d.get("nama_lengkap"))
    posisi = fmt(d.get("posisi_dilamar"))
    jk = fmt(d.get("jenis_kelamin"))
    lahir = fmt(d.get("tanggal_lahir"))
    email = fmt(d.get("email"))
    wa = fmt(d.get("nomor_telepon"))
    ig = fmt(d.get("sosial_media"))
    tipe = fmt(d.get("tipe_kerja"))
    cv = fmt(d.get("cv_url"))
    waktu = fmt(d.get("created_at"))

    lines = [
        "📋 <b>LAMARAN BARU MASUK</b>",
        "",
        f"👤 <b>{nama}</b>",
        f"💼 Posisi: {posisi}",
        f"⚧ Gender: {jk}",
        f"🎂 Lahir: {lahir}",
        f"📧 Email: {email}",
        f"📱 WA: {wa}",
    ]
    if ig and ig != "-":
        lines.append(f"📸 IG/TikTok: {ig}")
    lines.append(f"🕐 Tipe: {tipe}")
    if cv and cv != "-":
        lines.append(f"📄 CV: {cv}")
    lines.append(f"🕒 Masuk: {waktu}")
    lines.append("")
    lines.append("— via rekrutmen.yumme.id")
    return "\n".join(lines)


def send(chat_id, text):
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
    r = httpx.post(
        url,
        json={"chat_id": chat_id, "text": text, "parse_mode": "HTML"},
        timeout=15,
    )
    return r


def main():
    if len(sys.argv) < 2:
        print("ERROR: butuh argumen JSON")
        sys.exit(1)
    try:
        data = json.loads(sys.argv[1])
    except Exception as e:
        print(f"ERROR: JSON invalid: {e}")
        sys.exit(1)

    msg = build_message(data)
    try:
        r = send(REPORT_CHAT_ID, msg)
        if r.status_code == 200 and r.json().get("ok"):
            print("OK: notif terkirim ke grup Report (via yumi-hrd-agent)")
        else:
            print(f"ERROR: telegram {r.status_code} {r.text[:200]}")
            sys.exit(1)
    except Exception as e:
        print(f"ERROR: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
