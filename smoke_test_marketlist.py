import os, httpx, asyncio

with open('/opt/djiwatentramapp/yumi-purchasing-agent/.env') as f:
    for line in f:
        line = line.strip()
        if '=' in line and not line.startswith('#'):
            k, v = line.split('=', 1)
            os.environ[k.strip()] = v.strip()

TOKEN = os.environ.get('TELEGRAM_BOT_TOKEN', '')
CHAT_ID = '-5288006237'

async def test():
    async with httpx.AsyncClient() as c:
        msg = "MARKET LIST KITCHEN\n\U0001f534 Kentang\n\U0001f7e1 Garam\n\U0001f7e1 Merica"
        
        r = await c.post(
            f'https://api.telegram.org/bot{TOKEN}/sendMessage',
            json={'chat_id': CHAT_ID, 'text': msg, 'parse_mode': 'Markdown'}
        )
        data = r.json()
        if data.get('ok'):
            print(f'\u2705 Sent! MID: {data["result"]["message_id"]}')
        else:
            print(f'\u274c Failed: {data.get("description","")}')

asyncio.run(test())
