-- KOL Better Auth discriminator.
-- Additive and idempotent: existing Better Auth users remain customers.
ALTER TABLE "user"
  ADD COLUMN IF NOT EXISTS user_type text NOT NULL DEFAULT 'customer';

ALTER TABLE "user"
  DROP CONSTRAINT IF EXISTS user_user_type_check;

ALTER TABLE "user"
  ADD CONSTRAINT user_user_type_check
  CHECK (user_type IN ('customer', 'kol', 'admin'));

CREATE INDEX IF NOT EXISTS idx_better_auth_user_type
  ON "user" (user_type);
