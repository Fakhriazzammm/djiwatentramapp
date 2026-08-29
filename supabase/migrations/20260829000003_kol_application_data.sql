-- Store the complete public KOL application payload without changing existing columns.
-- Additive and idempotent: existing KOL records remain intact.
ALTER TABLE pos.kol_creators
  ADD COLUMN IF NOT EXISTS application_data jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN pos.kol_creators.application_data IS
  'Validated non-secret application fields from the public KOL form, including audience, content, collaboration, and visit preference.';

-- ROLLBACK (manual and destructive; only with explicit approval):
-- ALTER TABLE pos.kol_creators DROP COLUMN application_data;
