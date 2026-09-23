-- Link legacy KOL intake records to the verified Better Auth identity.
-- Existing records remain unchanged until a matching Google email is claimed.
ALTER TABLE pos.kol_creators
  ADD COLUMN IF NOT EXISTS auth_user_id text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_kol_creators_auth_user_id
  ON pos.kol_creators (auth_user_id)
  WHERE auth_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_kol_private_contacts_email_normalized
  ON pos.kol_private_contacts (lower(btrim(email)))
  WHERE email IS NOT NULL AND length(btrim(email)) > 0;
