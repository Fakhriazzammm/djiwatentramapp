-- Additive customer community discovery and engagement primitives.
-- Does not modify historical orders, payments, finance, or inventory records.

CREATE TABLE IF NOT EXISTS public.customer_community_post_saves (
  post_id uuid NOT NULL REFERENCES public.customer_community_posts(id) ON DELETE CASCADE,
  customer_source_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, customer_source_id)
);

CREATE INDEX IF NOT EXISTS customer_community_post_saves_customer_idx
  ON public.customer_community_post_saves (customer_source_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.customer_community_follows (
  follower_source_id text NOT NULL,
  followed_source_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  PRIMARY KEY (follower_source_id, followed_source_id),
  CONSTRAINT customer_community_follows_not_self CHECK (follower_source_id <> followed_source_id)
);

CREATE INDEX IF NOT EXISTS customer_community_follows_followed_idx
  ON public.customer_community_follows (followed_source_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS customer_community_follows_follower_idx
  ON public.customer_community_follows (follower_source_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.customer_community_post_products (
  post_id uuid NOT NULL REFERENCES public.customer_community_posts(id) ON DELETE CASCADE,
  product_source_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, product_source_id)
);

CREATE INDEX IF NOT EXISTS customer_community_post_products_product_idx
  ON public.customer_community_post_products (product_source_id, created_at DESC);

ALTER TABLE public.customer_community_post_saves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_community_follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_community_post_products ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.customer_community_post_saves FROM anon, authenticated;
REVOKE ALL ON public.customer_community_follows FROM anon, authenticated;
REVOKE ALL ON public.customer_community_post_products FROM anon, authenticated;

GRANT ALL ON public.customer_community_post_saves TO service_role;
GRANT ALL ON public.customer_community_follows TO service_role;
GRANT ALL ON public.customer_community_post_products TO service_role;

COMMENT ON TABLE public.customer_community_post_saves IS 'Durable customer bookmarks for Community posts.';
COMMENT ON TABLE public.customer_community_follows IS 'Customer follow relationships for Community feed filtering.';
COMMENT ON TABLE public.customer_community_post_products IS 'Optional links between Community posts and canonical catalog products.';
