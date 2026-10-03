-- Recommendation analytics aggregates and experiment configuration foundation.
-- Service-role-only by design: raw events and aggregate views must not be directly
-- readable by anon/authenticated clients.

CREATE OR REPLACE VIEW pos.product_recommendation_event_metrics AS
SELECT
  (e.occurred_at AT TIME ZONE 'UTC')::date AS metric_date,
  e.event_type,
  e.strategy,
  e.placement,
  e.product_source_id,
  e.recommended_product_source_id,
  count(*)::bigint AS event_count,
  count(DISTINCT e.session_id)::bigint AS unique_sessions,
  count(DISTINCT e.customer_source_id)::bigint AS unique_customers
FROM pos.product_recommendation_events AS e
GROUP BY
  (e.occurred_at AT TIME ZONE 'UTC')::date,
  e.event_type,
  e.strategy,
  e.placement,
  e.product_source_id,
  e.recommended_product_source_id;

CREATE OR REPLACE VIEW pos.product_recommendation_daily_metrics AS
SELECT
  (e.occurred_at AT TIME ZONE 'UTC')::date AS metric_date,
  e.strategy,
  e.placement,
  e.product_source_id,
  e.recommended_product_source_id,
  count(*) FILTER (WHERE e.event_type = 'impression')::bigint AS impression_count,
  count(*) FILTER (WHERE e.event_type = 'click')::bigint AS click_count,
  count(*) FILTER (WHERE e.event_type = 'add_to_cart')::bigint AS add_to_cart_count,
  count(*) FILTER (WHERE e.event_type = 'purchase')::bigint AS purchase_count,
  count(*) FILTER (WHERE e.event_type = 'dismiss')::bigint AS dismiss_count,
  count(*) FILTER (WHERE e.event_type = 'not_interested')::bigint AS not_interested_count,
  count(*)::bigint AS total_event_count,
  count(DISTINCT e.session_id)::bigint AS unique_sessions,
  count(DISTINCT e.customer_source_id)::bigint AS unique_customers
FROM pos.product_recommendation_events AS e
GROUP BY
  (e.occurred_at AT TIME ZONE 'UTC')::date,
  e.strategy,
  e.placement,
  e.product_source_id,
  e.recommended_product_source_id;

REVOKE ALL ON pos.product_recommendation_event_metrics,
  pos.product_recommendation_daily_metrics FROM PUBLIC, anon, authenticated;
GRANT SELECT ON pos.product_recommendation_event_metrics,
  pos.product_recommendation_daily_metrics TO service_role;

CREATE TABLE IF NOT EXISTS pos.product_recommendation_experiments (
  experiment_key text PRIMARY KEY,
  description text,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'paused', 'archived')),
  variants jsonb NOT NULL DEFAULT '[{"key":"control","allocation":1}]'::jsonb
    CHECK (jsonb_typeof(variants) = 'array' AND jsonb_array_length(variants) > 0),
  targeting jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(targeting) = 'object'),
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(trim(experiment_key)) BETWEEN 1 AND 128),
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);

CREATE TABLE IF NOT EXISTS pos.product_recommendation_experiment_assignments (
  experiment_key text NOT NULL
    REFERENCES pos.product_recommendation_experiments(experiment_key) ON DELETE CASCADE,
  subject_key text NOT NULL,
  variant_key text NOT NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(metadata) = 'object'),
  PRIMARY KEY (experiment_key, subject_key),
  CHECK (length(trim(subject_key)) BETWEEN 1 AND 160),
  CHECK (length(trim(variant_key)) BETWEEN 1 AND 128)
);

CREATE INDEX IF NOT EXISTS product_recommendation_experiments_status_idx
  ON pos.product_recommendation_experiments (status, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS product_recommendation_experiment_assignments_variant_idx
  ON pos.product_recommendation_experiment_assignments (experiment_key, variant_key, assigned_at DESC);

ALTER TABLE pos.product_recommendation_experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos.product_recommendation_experiment_assignments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON pos.product_recommendation_experiments,
  pos.product_recommendation_experiment_assignments FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON pos.product_recommendation_experiments,
  pos.product_recommendation_experiment_assignments TO service_role;
