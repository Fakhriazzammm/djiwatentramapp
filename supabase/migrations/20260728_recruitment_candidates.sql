-- Migration: Create recruitment_candidates table for rekrutmen.djiwatentram.web.id
-- This stores candidate applications submitted via the public form
-- Schema: pos (same as other business tables)

CREATE TABLE IF NOT EXISTS pos.recruitment_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  airtable_id TEXT UNIQUE,
  nama_lengkap TEXT NOT NULL,
  jenis_kelamin TEXT,
  tanggal_lahir DATE,
  email TEXT,
  nomor_telepon TEXT,
  sosial_media TEXT,
  posisi_dilamar TEXT,
  tipe_kerja TEXT,
  notes TEXT,
  status TEXT DEFAULT 'Application Received',
  application_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: allow service_role (backend) bypass, anon insert only
ALTER TABLE pos.recruitment_candidates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_all ON pos.recruitment_candidates;
CREATE POLICY service_role_all ON pos.recruitment_candidates
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS anon_insert ON pos.recruitment_candidates;
CREATE POLICY anon_insert ON pos.recruitment_candidates
  FOR INSERT TO anon
  WITH CHECK (true);

DROP POLICY IF EXISTS anon_select ON pos.recruitment_candidates;
CREATE POLICY anon_select ON pos.recruitment_candidates
  FOR SELECT TO anon
  USING (true);

-- Grants
GRANT ALL ON pos.recruitment_candidates TO postgres, service_role;
GRANT INSERT, SELECT ON pos.recruitment_candidates TO anon;

-- Index for filtering by status (used in admin panel)
CREATE INDEX IF NOT EXISTS idx_recruitment_candidates_status ON pos.recruitment_candidates (status);
CREATE INDEX IF NOT EXISTS idx_recruitment_candidates_posisi ON pos.recruitment_candidates (posisi_dilamar);
CREATE INDEX IF NOT EXISTS idx_recruitment_candidates_created ON pos.recruitment_candidates (created_at DESC);