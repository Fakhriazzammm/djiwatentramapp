-- Add the Djiwa App-only breakfast Happy Hour.
-- The channel boundary follows the existing Happy Hour flow: customer app reads
-- is_happy_hour promotions; regular cashier/POS pricing must not apply them.
-- Idempotent by source_id and reuses the canonical target products/prices from
-- HAPPY HOUR MAKAN SIANG.
INSERT INTO pos.discounts (
  source_id, name, discount_type, value, target_type, target_id, target_ids,
  formatted_id, is_active, min_order_value, start_date, end_date, start_time,
  end_time, days, is_happy_hour, product_prices, is_free_refill,
  refill_price, refill_availability, creation_time, raw
)
SELECT
  'happy-hour-sarapan-pagi',
  'HAPPY HOUR SARAPAN PAGI',
  d.discount_type,
  15000,
  d.target_type,
  d.target_id,
  d.target_ids,
  'happy-hour-sarapan-pagi',
  true,
  d.min_order_value,
  d.start_date,
  d.end_date,
  '08:00',
  '09:00',
  '[0,1,2,3,4,5,6]'::jsonb,
  true,
  d.product_prices,
  false,
  d.refill_price,
  d.refill_availability,
  extract(epoch from now()) * 1000,
  jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          d.raw,
          '{_id}',
          to_jsonb('happy-hour-sarapan-pagi'::text),
          true
        ),
        '{name}',
        to_jsonb('HAPPY HOUR SARAPAN PAGI'::text),
        true
      ),
      '{startTime}',
      to_jsonb('08:00'::text),
      true
    ),
    '{endTime}',
    to_jsonb('09:00'::text),
    true
  )
FROM pos.discounts d
WHERE d.source_id = 'k97fg4fqg64xmtyw66wh6wrtgs82z8jn'
ON CONFLICT (source_id) DO UPDATE SET
  name = EXCLUDED.name,
  discount_type = EXCLUDED.discount_type,
  value = EXCLUDED.value,
  target_type = EXCLUDED.target_type,
  target_id = EXCLUDED.target_id,
  target_ids = EXCLUDED.target_ids,
  is_active = EXCLUDED.is_active,
  start_time = EXCLUDED.start_time,
  end_time = EXCLUDED.end_time,
  days = EXCLUDED.days,
  is_happy_hour = EXCLUDED.is_happy_hour,
  product_prices = EXCLUDED.product_prices,
  raw = EXCLUDED.raw;
