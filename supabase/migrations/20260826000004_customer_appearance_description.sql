-- Persist the customer appearance clue used by cashier/Mayar order handoff.
ALTER TABLE pos.customers
  ADD COLUMN IF NOT EXISTS customer_description text;

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
  COALESCE(w.available_balance, 0)::bigint AS wallet_balance,
  COALESCE(w.held_balance, 0)::bigint AS wallet_held_balance,
  COALESCE(w.total_credited, 0)::bigint AS wallet_total_credited,
  COALESCE(w.total_debited, 0)::bigint AS wallet_total_debited,
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
  c.customer_description
FROM pos.customers c
LEFT JOIN pos.customer_wallets w ON w.customer_id = c.source_id
WHERE c.is_active = true;

GRANT SELECT ON public.pos_customers_view TO anon, authenticated;
