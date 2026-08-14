-- Recruitment hardening: keep candidate PII behind the authenticated backend.
-- Additive and safe for existing production rows.

ALTER TABLE pos.recruitment_candidates
  ADD COLUMN IF NOT EXISTS cv_url TEXT;

-- The Node backend is the only public write/read boundary. Direct anon access
-- would bypass its validation, dedupe, and authorization checks.
DROP POLICY IF EXISTS anon_insert ON pos.recruitment_candidates;
DROP POLICY IF EXISTS anon_select ON pos.recruitment_candidates;
REVOKE ALL ON pos.recruitment_candidates FROM anon, authenticated;
GRANT ALL ON pos.recruitment_candidates TO postgres, service_role;

CREATE INDEX IF NOT EXISTS idx_recruitment_candidates_email_position_created
  ON pos.recruitment_candidates (lower(email), lower(posisi_dilamar), created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recruitment_candidates_cv_url
  ON pos.recruitment_candidates (cv_url)
  WHERE cv_url IS NOT NULL AND cv_url <> '';
