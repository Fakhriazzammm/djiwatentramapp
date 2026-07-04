"""fix_env.py — Extract env vars from running yumi-finance-agent process and fix .env"""
import os
import subprocess

PID = int(subprocess.check_output(['pgrep', '-f', 'yumi-finance-agent/app.py']).decode().strip().split('\n')[0])

# Extract env from running process
environ_bytes = open(f'/proc/{PID}/environ', 'rb').read()
environ = {}
for part in environ_bytes.split(b'\x00'):
    if b'=' in part:
        k, v = part.split(b'=', 1)
        environ[k.decode()] = v.decode()

TOKEN = environ.get('TELEGRAM_BOT_TOKEN', '')
GROUP = environ.get('FINANCE_GROUP_ID', '-4995568785')
SURL = environ.get('SUPABASE_URL', '')
SKEY = environ.get('SUPABASE_KEY', '')
SROLE = environ.get('SUPABASE_SERVICE_ROLE_KEY', '')

# Ambil key dari runtime env, bukan hardcode palsu
SUMOPOD_KEY = environ.get('SUMOPOD_API_KEY', '')
SUMOPOD_URL = environ.get('SUMOPOD_BASE_URL', 'http://127.0.0.1:20128/v1')
SUMOPOD_VISION = environ.get('SUMOPOD_VISION_MODEL', 'ag/gemini-3-flash')
SUMOPOD_TEXT = environ.get('SUMOPOD_TEXT_MODEL', 'ag/gemini-3-flash')
NINEROUTER_URL = environ.get('NINEROUTER_BASE_URL', 'http://127.0.0.1:20128/v1')
NINEROUTER_VISION = environ.get('NINEROUTER_VISION_MODEL', 'ag/gemini-3-flash')
NINEROUTER_TEXT = environ.get('NINEROUTER_TEXT_MODEL', 'ds/deepseek-v4-flash')

env_content = f"""TELEGRAM_BOT_TOKEN={TOKEN}
FINANCE_GROUP_ID={GROUP}

SUPABASE_URL={SURL}
SUPABASE_KEY={SKEY}
SUPABASE_SERVICE_ROLE_KEY={SROLE}

# SumoPod API — AI chat & vision/OCR
SUMOPOD_API_KEY={SUMOPOD_KEY}
SUMOPOD_BASE_URL={SUMOPOD_URL}
SUMOPOD_VISION_MODEL={SUMOPOD_VISION}
SUMOPOD_TEXT_MODEL={SUMOPOD_TEXT}

# Local 9Router
NINEROUTER_BASE_URL={NINEROUTER_URL}
NINEROUTER_VISION_MODEL={NINEROUTER_VISION}
NINEROUTER_TEXT_MODEL={NINEROUTER_TEXT}
"""

with open('/opt/djiwatentramapp/yumi-finance-agent/.env', 'w') as f:
    f.write(env_content)

print("✅ .env written successfully (all keys from runtime)")
print(f"  TOKEN len: {len(TOKEN)}")
print(f"  SROLE len: {len(SROLE)}")
print(f"  SUMOPOD_API_KEY len: {len(SUMOPOD_KEY)}")
