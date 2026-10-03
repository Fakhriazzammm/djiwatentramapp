-- Recommendation engine expansion: purchase attribution, fatigue feedback, and cached scores.
DO $$ BEGIN
  ALTER TABLE pos.product_recommendation_events DROP CONSTRAINT IF EXISTS product_recommendation_events_event_type_check;
  ALTER TABLE pos.product_recommendation_events ADD CONSTRAINT product_recommendation_events_event_type_check CHECK (event_type IN ('impression','click','add_to_cart','purchase','dismiss','not_interested'));
EXCEPTION WHEN undefined_table THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS pos.product_recommendation_scores (
  product_source_id text NOT NULL,
  strategy text NOT NULL,
  period_key text NOT NULL DEFAULT 'all',
  score numeric(12,6) NOT NULL,
  reason_code text NOT NULL,
  source_product_id text,
  catalog_scope text NOT NULL DEFAULT 'customer',
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz,
  generated_by text NOT NULL DEFAULT 'deterministic' CHECK (generated_by IN ('deterministic','ai_reranker')),
  model_version text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_source_id, strategy, period_key, catalog_scope)
);
CREATE INDEX IF NOT EXISTS product_recommendation_scores_valid_idx ON pos.product_recommendation_scores (catalog_scope, valid_until, score DESC);
REVOKE ALL ON pos.product_recommendation_scores FROM anon, authenticated;

CREATE OR REPLACE FUNCTION pos.record_product_recommendation_event(
  p_event_key text,
  p_event_type text,
  p_product_source_id text DEFAULT NULL,
  p_recommended_product_source_id text DEFAULT NULL,
  p_strategy text DEFAULT 'mixed',
  p_placement text DEFAULT 'inline_menu',
  p_customer_source_id text DEFAULT NULL,
  p_session_id text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pos, public AS $$
BEGIN
  IF p_event_key IS NULL OR p_event_type NOT IN ('impression','click','add_to_cart','purchase','dismiss','not_interested') THEN RETURN; END IF;
  INSERT INTO pos.product_recommendation_events(event_key,event_type,product_source_id,recommended_product_source_id,strategy,placement,customer_source_id,session_id,metadata)
  VALUES (left(p_event_key,128),p_event_type,left(p_product_source_id,160),left(p_recommended_product_source_id,160),left(coalesce(p_strategy,'mixed'),64),left(coalesce(p_placement,'inline_menu'),64),left(p_customer_source_id,160),left(p_session_id,160),CASE WHEN jsonb_typeof(coalesce(p_metadata,'{}'::jsonb))='object' THEN p_metadata ELSE '{}'::jsonb END)
  ON CONFLICT (event_key) DO NOTHING;
END; $$;
REVOKE ALL ON FUNCTION pos.record_product_recommendation_event(text,text,text,text,text,text,text,text,jsonb) FROM public;
GRANT EXECUTE ON FUNCTION pos.record_product_recommendation_event(text,text,text,text,text,text,text,text,jsonb) TO anon, authenticated;
