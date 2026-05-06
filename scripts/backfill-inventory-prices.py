import httpx
from datetime import datetime, timedelta
import asyncio

SUPABASE_URL = 'https://xaemykhjpkgypqqpfdcb.supabase.co'
SUPABASE_KEY = 'sb_publishable_LGFL7r4JQVqG1fvwNniJ7A_ub29yf_3'

headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': f'Bearer {SUPABASE_KEY}',
    'Accept-Profile': 'pos'
}

def fetch_supabase_data(query):
    response = httpx.get(f'{SUPABASE_URL}/rest/v1/{query}', headers=headers)
    response.raise_for_status()
    return response.json()

def backfill_prices():
    # Get receipts with missing prices
    receipts = fetch_supabase_data('financial_transactions?metadata->>ocr=eq.true&scanItems=is.null')

    for receipt in receipts:
        # For each item in receipt, fetch average price over the last 90 days
        items = receipt['description'].split(', ')
        for item in items:
            price_data = fetch_supabase_data('price_history?item_name=eq.' + item + '&created_at=gte.' + (datetime.now() - timedelta(days=90)).strftime('%Y-%m-%d'))
            # Process price data to backfill price in receipt
            # Skipped logic as it's placeholding
    
    return True

if __name__ == '__main__':
    asyncio.run(backfill_prices())