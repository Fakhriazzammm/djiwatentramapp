-- Inventory item candidate mapping / receipt research staging.
-- Additive only: never overwrites receipt history or pos.inventory rows.
-- Candidates must be reviewed before canonical inventory metadata is changed.

CREATE TABLE IF NOT EXISTS pos.inventory_item_candidates (
  source_id text PRIMARY KEY,
  normalized_name text NOT NULL,
  normalized_name_key text GENERATED ALWAYS AS (lower(btrim(normalized_name))) STORED,
  raw_variants jsonb NOT NULL DEFAULT '[]'::jsonb,
  mention_count integer NOT NULL DEFAULT 0 CHECK (mention_count >= 0),
  source_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  proposed_canonical_name text,
  proposed_inventory_source_id text REFERENCES pos.inventory(source_id) ON DELETE SET NULL,
  proposed_base_unit text,
  proposed_purchase_unit text,
  proposed_pack_content numeric(18,6),
  proposed_pack_unit text,
  match_status text NOT NULL DEFAULT 'REVIEW'
    CHECK (match_status IN ('REVIEW', 'EXACT_MATCH', 'ALIAS_MATCH', 'NEW_CANDIDATE', 'IGNORE', 'APPROVED')),
  confidence text NOT NULL DEFAULT 'LOW'
    CHECK (confidence IN ('LOW', 'MEDIUM', 'HIGH')),
  review_reason text,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  reviewed_by text,
  reviewed_at double precision,
  approved_at double precision,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  creation_time double precision NOT NULL DEFAULT (extract(epoch FROM now()) * 1000),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_item_candidates_name_unique UNIQUE (normalized_name_key)
);

CREATE INDEX IF NOT EXISTS inventory_item_candidates_status_idx
  ON pos.inventory_item_candidates (match_status, confidence);

CREATE INDEX IF NOT EXISTS inventory_item_candidates_inventory_idx
  ON pos.inventory_item_candidates (proposed_inventory_source_id)
  WHERE proposed_inventory_source_id IS NOT NULL;

CREATE OR REPLACE FUNCTION pos.resolve_inventory_item_candidate(p_normalized_name text)
RETURNS TABLE (
  inventory_source_id text,
  ingredient_name text,
  match_type text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT i.source_id, i.ingredient_name, 'EXACT_MATCH'
  FROM pos.inventory i
  WHERE lower(btrim(i.ingredient_name)) = lower(btrim(p_normalized_name))
  LIMIT 1;
$$;

ALTER TABLE pos.inventory_item_candidates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inventory_item_candidates_service_role_all
  ON pos.inventory_item_candidates;
CREATE POLICY inventory_item_candidates_service_role_all
  ON pos.inventory_item_candidates FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT ALL ON pos.inventory_item_candidates TO service_role;
GRANT EXECUTE ON FUNCTION pos.resolve_inventory_item_candidate(text) TO service_role;

COMMENT ON TABLE pos.inventory_item_candidates IS
  'Receipt/web research staging table. One row per normalized name; approval is required before inventory updates.';
COMMENT ON COLUMN pos.inventory_item_candidates.normalized_name_key IS
  'Case-insensitive dedupe key. Never use a new row for a spelling-only variant.';
COMMENT ON COLUMN pos.inventory_item_candidates.proposed_inventory_source_id IS
  'Optional mapping to existing pos.inventory row; populated only after evidence review.';
