-- Deterministic, idempotent experiment assignment without exposing config tables.
CREATE OR REPLACE FUNCTION pos.assign_product_recommendation_experiment(
  p_experiment_key text,
  p_subject_key text
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pos, public
AS $$
DECLARE
  experiment_row pos.product_recommendation_experiments%ROWTYPE;
  variant jsonb;
  variant_key text;
  total_weight numeric := 0;
  cursor_weight numeric := 0;
  bucket numeric;
  selected_key text;
  variants jsonb;
BEGIN
  IF p_experiment_key IS NULL OR length(trim(p_experiment_key)) NOT BETWEEN 1 AND 128 THEN RETURN NULL; END IF;
  IF p_subject_key IS NULL OR length(trim(p_subject_key)) NOT BETWEEN 1 AND 160 THEN RETURN NULL; END IF;

  SELECT * INTO experiment_row
  FROM pos.product_recommendation_experiments
  WHERE experiment_key = trim(p_experiment_key)
    AND status = 'active'
    AND (starts_at IS NULL OR starts_at <= now())
    AND (ends_at IS NULL OR ends_at > now());
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT variant_key INTO selected_key
  FROM pos.product_recommendation_experiment_assignments
  WHERE experiment_key = experiment_row.experiment_key AND subject_key = trim(p_subject_key);
  IF FOUND THEN RETURN selected_key; END IF;

  variants := experiment_row.variants;
  FOR variant IN SELECT value FROM jsonb_array_elements(variants)
  LOOP
    IF jsonb_typeof(variant) <> 'object' OR jsonb_typeof(variant->'key') <> 'string' OR jsonb_typeof(variant->'allocation') <> 'number' THEN CONTINUE; END IF;
    total_weight := total_weight + GREATEST(0, (variant->>'allocation')::numeric);
  END LOOP;
  IF total_weight <= 0 THEN RETURN NULL; END IF;

  bucket := (('x' || substr(md5(experiment_row.experiment_key || ':' || trim(p_subject_key)), 1, 12))::bit(48)::bigint)::numeric / 281474976710656 * total_weight;
  FOR variant IN SELECT value FROM jsonb_array_elements(variants)
  LOOP
    IF jsonb_typeof(variant) <> 'object' OR jsonb_typeof(variant->'key') <> 'string' OR jsonb_typeof(variant->'allocation') <> 'number' THEN CONTINUE; END IF;
    variant_key := variant->>'key';
    cursor_weight := cursor_weight + GREATEST(0, (variant->>'allocation')::numeric);
    IF bucket < cursor_weight THEN selected_key := variant_key; EXIT; END IF;
  END LOOP;
  IF selected_key IS NULL THEN RETURN NULL; END IF;

  INSERT INTO pos.product_recommendation_experiment_assignments(experiment_key, subject_key, variant_key)
  VALUES (experiment_row.experiment_key, trim(p_subject_key), selected_key)
  ON CONFLICT (experiment_key, subject_key) DO UPDATE SET variant_key = pos.product_recommendation_experiment_assignments.variant_key;
  RETURN selected_key;
END;
$$;
REVOKE ALL ON FUNCTION pos.assign_product_recommendation_experiment(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pos.assign_product_recommendation_experiment(text,text) TO anon, authenticated;
