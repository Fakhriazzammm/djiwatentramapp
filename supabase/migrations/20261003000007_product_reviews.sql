-- Product reviews foundation.
-- Additive and idempotent. Review writes are intentionally reserved for a trusted
-- backend; public clients read only the sanitized views below.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS pos;

CREATE TABLE IF NOT EXISTS pos.product_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id text NOT NULL DEFAULT gen_random_uuid()::text,
  product_source_id text NOT NULL,
  order_source_id text NOT NULL,
  customer_user_id text,
  customer_display_name text,
  rating smallint NOT NULL,
  comment text,
  status text NOT NULL DEFAULT 'pending',
  verified_purchase boolean NOT NULL DEFAULT true,
  moderation_note text,
  moderated_by text,
  moderated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_reviews_source_id_key UNIQUE (source_id),
  CONSTRAINT product_reviews_rating_check CHECK (rating BETWEEN 1 AND 5),
  CONSTRAINT product_reviews_comment_length_check CHECK (comment IS NULL OR char_length(comment) <= 500),
  CONSTRAINT product_reviews_status_check CHECK (status IN ('pending', 'published', 'hidden', 'reported')),
  CONSTRAINT product_reviews_verified_purchase_check CHECK (verified_purchase IS TRUE)
);

CREATE UNIQUE INDEX IF NOT EXISTS product_reviews_order_product_customer_uidx
  ON pos.product_reviews (order_source_id, product_source_id, customer_user_id)
  WHERE customer_user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS product_reviews_order_product_guest_uidx
  ON pos.product_reviews (order_source_id, product_source_id)
  WHERE customer_user_id IS NULL;

CREATE INDEX IF NOT EXISTS product_reviews_product_status_created_idx
  ON pos.product_reviews (product_source_id, status, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS product_reviews_status_created_idx
  ON pos.product_reviews (status, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS product_reviews_customer_created_idx
  ON pos.product_reviews (customer_user_id, created_at DESC, id DESC)
  WHERE customer_user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION pos.set_product_reviews_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pos, pg_catalog
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS product_reviews_set_updated_at ON pos.product_reviews;
CREATE TRIGGER product_reviews_set_updated_at
  BEFORE UPDATE ON pos.product_reviews
  FOR EACH ROW EXECUTE FUNCTION pos.set_product_reviews_updated_at();

ALTER TABLE pos.product_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos.product_reviews FORCE ROW LEVEL SECURITY;
REVOKE ALL ON pos.product_reviews FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON pos.product_reviews TO service_role;

DROP POLICY IF EXISTS product_reviews_service_role_all ON pos.product_reviews;
CREATE POLICY product_reviews_service_role_all
  ON pos.product_reviews FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Public views deliberately omit customer_user_id, order_source_id, and all
-- moderation fields. The views are the only public read surface.
CREATE OR REPLACE VIEW public.pos_product_review_summary AS
SELECT
  product_source_id,
  count(*)::bigint AS published_count,
  round(avg(rating)::numeric, 2)::numeric(3,2) AS rating_average,
  count(*) FILTER (WHERE rating = 1)::bigint AS rating_1_count,
  count(*) FILTER (WHERE rating = 2)::bigint AS rating_2_count,
  count(*) FILTER (WHERE rating = 3)::bigint AS rating_3_count,
  count(*) FILTER (WHERE rating = 4)::bigint AS rating_4_count,
  count(*) FILTER (WHERE rating = 5)::bigint AS rating_5_count,
  max(created_at) AS last_reviewed_at
FROM pos.product_reviews
WHERE status = 'published' AND verified_purchase = true
GROUP BY product_source_id;

CREATE OR REPLACE VIEW public.pos_product_reviews AS
SELECT
  id,
  product_source_id,
  rating,
  comment,
  customer_display_name,
  created_at
FROM pos.product_reviews
WHERE status = 'published' AND verified_purchase = true;

REVOKE ALL ON public.pos_product_review_summary, public.pos_product_reviews FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.pos_product_review_summary, public.pos_product_reviews TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
