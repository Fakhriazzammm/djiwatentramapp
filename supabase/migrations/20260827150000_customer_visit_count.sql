-- DjiwaApp engagement metrics: additive and safe for existing customers.
ALTER TABLE pos.customers
  ADD COLUMN IF NOT EXISTS djiwaapp_visit_count integer NOT NULL DEFAULT 0;

CREATE OR REPLACE VIEW public.pos_customers_view AS
SELECT
  c.source_id,
  c.email,
  c.name,
  c.phone,
  c.photo_url,
  c.total_points,
  c.lifetime_points,
  c.total_orders,
  c.total_spent,
  c.last_order_at,
  c.created_at,
  COALESCE(w.available_balance, 0) AS wallet_balance,
  COALESCE(w.held_balance, 0) AS wallet_held_balance,
  COALESCE(w.total_credited, 0) AS wallet_total_credited,
  COALESCE(w.total_debited, 0) AS wallet_total_debited,
  COALESCE(w.status, 'active') AS wallet_status,
  c.nickname,
  c.birth_date,
  c.gender,
  c.address,
  c.city,
  c.province,
  c.postal_code,
  c.marketing_consent,
  c.profile_completed_at,
  c.customer_description,
  c.last_active_at,
  c.djiwaapp_visit_count
FROM pos.customers c
LEFT JOIN pos.customer_wallets w ON w.customer_id = c.source_id
WHERE c.is_active = true;

GRANT SELECT ON public.pos_customers_view TO anon, authenticated;

CREATE OR REPLACE FUNCTION pos.record_customer_visit(p_source_id text)
RETURNS TABLE (djiwaapp_visit_count integer, last_active_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pos, public
AS $$
BEGIN
  RETURN QUERY
  UPDATE pos.customers
  SET djiwaapp_visit_count = COALESCE(pos.customers.djiwaapp_visit_count, 0) + 1,
      last_active_at = now(),
      updated_at = now()
  WHERE source_id = p_source_id
  RETURNING pos.customers.djiwaapp_visit_count, pos.customers.last_active_at;
END;
$$;

REVOKE ALL ON FUNCTION pos.record_customer_visit(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pos.record_customer_visit(text) TO service_role;
