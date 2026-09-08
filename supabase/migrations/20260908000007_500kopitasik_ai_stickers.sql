-- Coffee Passport AI sticker generation metadata.
-- Additive and idempotent. Completed visits and stickers are preserved.

ALTER TABLE pos.coffee_passport_stickers
  ADD COLUMN IF NOT EXISTS prompt_version text,
  ADD COLUMN IF NOT EXISTS model text,
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS file_size_bytes integer,
  ADD COLUMN IF NOT EXISTS mime_type text,
  ADD COLUMN IF NOT EXISTS failed_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS idx_coffee_passport_stickers_idempotency
  ON pos.coffee_passport_stickers (customer_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_coffee_passport_stickers_visit_status
  ON pos.coffee_passport_stickers (visit_id, status);

-- Keep the collect-first flow compatible with visits created without a photo.
ALTER TABLE pos.coffee_passport_visits
  ALTER COLUMN photo_path DROP NOT NULL;
