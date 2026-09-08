-- 500 Kopi Tasik: bid increments are always Rp1.000.
-- Additive and idempotent; preserves existing bid history.

UPDATE pos.coffee_passport_bid_config
SET minimum_top_increment = 1000,
    minimum_existing_increment = 1000
WHERE config_id = 'default';

ALTER TABLE pos.coffee_passport_bid_config
  ALTER COLUMN minimum_top_increment SET DEFAULT 1000,
  ALTER COLUMN minimum_existing_increment SET DEFAULT 1000;
