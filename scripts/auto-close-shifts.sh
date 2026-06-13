#!/bin/bash
# Auto-close shifts - triggered every 10 min
curl -s -X POST "https://xaemykhjpkgypqqpfdcb.supabase.co/functions/v1/auto-close-shifts" \
  -H "apikey: sb_publishable_LGFL7r4JQVqG1fvwNniJ7A_ub29yf_3" \
  -H "Authorization: Bearer sb_publishable_LGFL7r4JQVqG1fvwNniJ7A_ub29yf_3" \
  -H "Content-Type: application/json" \
  -d '{}'
