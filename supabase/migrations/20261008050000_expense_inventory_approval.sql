-- Approval boundary for expense-to-inventory matching.
-- Approval only changes link state; stock mutation remains a separate RPC.

CREATE OR REPLACE FUNCTION pos.approve_expense_inventory_link(
  p_link_id text,
  p_inventory_source_id text DEFAULT NULL,
  p_base_quantity numeric DEFAULT NULL,
  p_base_unit text DEFAULT NULL,
  p_match_method text DEFAULT 'manual',
  p_confidence numeric DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pos, public
AS $$
DECLARE
  link_row pos.expense_inventory_links%ROWTYPE;
  resolved_inventory_id text;
  reviewer text;
BEGIN
  SELECT * INTO link_row
  FROM pos.expense_inventory_links
  WHERE source_id = p_link_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'expense inventory link not found: %', p_link_id;
  END IF;

  IF link_row.status = 'applied' THEN
    RETURN jsonb_build_object('success', true, 'status', 'already_applied', 'link_id', p_link_id);
  END IF;

  IF link_row.status NOT IN ('pending', 'needs_review', 'corrected') THEN
    RAISE EXCEPTION 'link cannot be approved from status: %', link_row.status;
  END IF;

  resolved_inventory_id := COALESCE(NULLIF(p_inventory_source_id, ''), link_row.inventory_source_id);
  IF resolved_inventory_id IS NULL THEN
    RAISE EXCEPTION 'inventory source is required before approval';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pos.inventory WHERE source_id = resolved_inventory_id) THEN
    RAISE EXCEPTION 'inventory item not found: %', resolved_inventory_id;
  END IF;

  reviewer := NULLIF(current_setting('request.jwt.claim.sub', true), '');

  UPDATE pos.expense_inventory_links
  SET inventory_source_id = resolved_inventory_id,
      base_quantity = COALESCE(p_base_quantity, base_quantity, quantity),
      base_unit = COALESCE(NULLIF(p_base_unit, ''), base_unit, unit),
      match_method = COALESCE(NULLIF(p_match_method, ''), 'manual'),
      confidence = COALESCE(p_confidence, confidence),
      status = 'approved',
      reviewed_by = reviewer,
      reviewed_at = extract(epoch from now()) * 1000,
      updated_at = now()
  WHERE source_id = p_link_id;

  RETURN jsonb_build_object(
    'success', true,
    'status', 'approved',
    'link_id', p_link_id,
    'inventory_id', resolved_inventory_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION pos.approve_expense_inventory_link(text, text, numeric, text, text, numeric)
  TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
