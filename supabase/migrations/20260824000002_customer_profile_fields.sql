-- Customer profile expansion — additive and privacy-minimal.
-- Required for QRIS remains email + phone; all new fields are optional.

ALTER TABLE pos.customers
  ADD COLUMN IF NOT EXISTS nickname text,
  ADD COLUMN IF NOT EXISTS birth_date date,
  ADD COLUMN IF NOT EXISTS gender text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS province text,
  ADD COLUMN IF NOT EXISTS postal_code text,
  ADD COLUMN IF NOT EXISTS marketing_consent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS profile_completed_at timestamptz;

CREATE INDEX IF NOT EXISTS customers_profile_completed_idx
  ON pos.customers (profile_completed_at);

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
  c.profile_completed_at
FROM pos.customers c
LEFT JOIN pos.customer_wallets w ON w.customer_id = c.source_id
WHERE c.is_active = true;

GRANT SELECT ON public.pos_customers_view TO anon, authenticated;

-- ROLLBACK (manual, only with explicit approval):
-- ALTER TABLE pos.customers DROP COLUMN nickname, DROP COLUMN birth_date,
--   DROP COLUMN gender, DROP COLUMN address, DROP COLUMN city,
--   DROP COLUMN province, DROP COLUMN postal_code,
--   DROP COLUMN marketing_consent, DROP COLUMN profile_completed_at;
