-- Backend-only approval workflow for receipt/inventory candidates.
-- Approval is explicit and never auto-promotes REVIEW/EXACT_MATCH/ALIAS_MATCH.

CREATE OR REPLACE FUNCTION pos.review_inventory_item_candidate(
  p_candidate_source_id text,
  p_match_status text,
  p_reviewer text,
  p_inventory_source_id text DEFAULT NULL,
  p_review_reason text DEFAULT NULL,
  p_evidence jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE (
  candidate_source_id text,
  normalized_name text,
  match_status text,
  proposed_inventory_source_id text,
  confidence text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pos, public
AS $$
DECLARE
  v_name text;
  v_inventory_name text;
BEGIN
  IF p_candidate_source_id IS NULL OR btrim(p_candidate_source_id) = '' THEN
    RAISE EXCEPTION 'candidate_source_id wajib diisi';
  END IF;
  IF p_reviewer IS NULL OR btrim(p_reviewer) = '' THEN
    RAISE EXCEPTION 'reviewer wajib diisi';
  END IF;
  IF p_match_status NOT IN ('REVIEW','EXACT_MATCH','ALIAS_MATCH','NEW_CANDIDATE','IGNORE','APPROVED') THEN
    RAISE EXCEPTION 'match_status tidak valid: %', p_match_status;
  END IF;

  IF p_match_status = 'APPROVED' AND p_inventory_source_id IS NULL THEN
    RAISE EXCEPTION 'APPROVED wajib memiliki inventory_source_id';
  END IF;
  IF p_match_status IN ('EXACT_MATCH','ALIAS_MATCH') AND p_inventory_source_id IS NULL THEN
    RAISE EXCEPTION '% wajib memiliki inventory_source_id', p_match_status;
  END IF;

  SELECT c.normalized_name INTO v_name
  FROM pos.inventory_item_candidates c
  WHERE c.source_id = p_candidate_source_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'candidate tidak ditemukan: %', p_candidate_source_id;
  END IF;

  IF p_inventory_source_id IS NOT NULL THEN
    SELECT i.ingredient_name INTO v_inventory_name
    FROM pos.inventory i
    WHERE i.source_id = p_inventory_source_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'inventory tidak ditemukan: %', p_inventory_source_id;
    END IF;
  END IF;

  RETURN QUERY
  UPDATE pos.inventory_item_candidates c
  SET match_status = p_match_status,
      proposed_inventory_source_id = p_inventory_source_id,
      proposed_canonical_name = v_inventory_name,
      confidence = CASE
        WHEN p_match_status = 'APPROVED' THEN 'HIGH'
        WHEN p_match_status = 'EXACT_MATCH' THEN 'HIGH'
        WHEN p_match_status = 'ALIAS_MATCH' THEN 'MEDIUM'
        ELSE c.confidence
      END,
      review_reason = COALESCE(NULLIF(btrim(p_review_reason), ''), c.review_reason),
      evidence = COALESCE(c.evidence, '{}'::jsonb) || COALESCE(p_evidence, '{}'::jsonb),
      reviewed_by = p_reviewer,
      reviewed_at = extract(epoch FROM now()) * 1000,
      approved_at = CASE WHEN p_match_status = 'APPROVED' THEN extract(epoch FROM now()) * 1000 ELSE c.approved_at END,
      updated_at = now()
  WHERE c.source_id = p_candidate_source_id
  RETURNING c.source_id, c.normalized_name, c.match_status,
            c.proposed_inventory_source_id, c.confidence;
END;
$$;

REVOKE ALL ON FUNCTION pos.review_inventory_item_candidate(text,text,text,text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pos.review_inventory_item_candidate(text,text,text,text,text,jsonb) TO service_role;
