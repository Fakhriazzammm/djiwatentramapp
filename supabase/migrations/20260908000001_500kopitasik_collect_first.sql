-- Collect-first flow for 500 Kopi Tasik.
-- Additive and idempotent: existing visit history is preserved.

ALTER TABLE pos.coffee_passport_visits
  ALTER COLUMN photo_path DROP NOT NULL;

DO $$
BEGIN
  ALTER TABLE pos.coffee_passport_visits DROP CONSTRAINT IF EXISTS coffee_passport_visits_status_check;
  ALTER TABLE pos.coffee_passport_visits
    ADD CONSTRAINT coffee_passport_visits_status_check
    CHECK (status IN ('draft', 'recorded', 'sticker_pending', 'completed', 'failed'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE pos.coffee_passport_visits
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_coffee_passport_visits_idempotency
  ON pos.coffee_passport_visits (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_coffee_passport_one_stamp_per_shop
  ON pos.coffee_passport_visits (customer_id, shop_id)
  WHERE status IN ('draft', 'recorded', 'sticker_pending', 'completed');

CREATE TABLE IF NOT EXISTS pos.coffee_passport_shop_submissions (
  submission_id text PRIMARY KEY,
  customer_id text NOT NULL REFERENCES pos.customers(source_id),
  submitted_name text NOT NULL CHECK (length(trim(submitted_name)) BETWEEN 2 AND 160),
  normalized_name text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'duplicate')),
  matched_shop_id text REFERENCES pos.coffee_passport_shops(shop_id),
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_coffee_passport_submission_name
  ON pos.coffee_passport_shop_submissions (customer_id, normalized_name)
  WHERE status IN ('pending', 'accepted');

CREATE OR REPLACE VIEW public.pos_coffee_passport_collection_view AS
SELECT
  v.customer_id,
  v.shop_id,
  s.name AS shop_name,
  s.slug AS shop_slug,
  min(v.created_at) AS first_visit_at,
  count(*)::integer AS visit_count,
  bool_or(st.status = 'completed') AS sticker_completed
FROM pos.coffee_passport_visits v
JOIN pos.coffee_passport_shops s ON s.shop_id = v.shop_id
LEFT JOIN pos.coffee_passport_stickers st ON st.visit_id = v.visit_id
WHERE v.status IN ('draft', 'recorded', 'sticker_pending', 'completed')
GROUP BY v.customer_id, v.shop_id, s.name, s.slug;

REVOKE ALL ON TABLE pos.coffee_passport_shop_submissions FROM PUBLIC, anon, authenticated;
