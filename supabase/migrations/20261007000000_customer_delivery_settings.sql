-- Additive customer delivery settings and audit support.
CREATE TABLE IF NOT EXISTS pos.customer_delivery_settings (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  is_enabled boolean NOT NULL DEFAULT true,
  allowed_couriers text[] NOT NULL DEFAULT ARRAY['gojek','grab']::text[]
    CHECK (array_ndims(allowed_couriers) = 1 AND array_lower(allowed_couriers, 1) = 1 AND cardinality(allowed_couriers) BETWEEN 1 AND 2 AND allowed_couriers <@ ARRAY['gojek','grab']::text[] AND array_position(allowed_couriers, NULL) IS NULL AND (cardinality(allowed_couriers) = 1 OR allowed_couriers[1] <> allowed_couriers[2])),
  default_courier text NOT NULL DEFAULT 'grab' CHECK (default_courier = ANY(allowed_couriers)),
  fallback_fee integer NOT NULL DEFAULT 12000 CHECK (fallback_fee BETWEEN 0 AND 1000000),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);
INSERT INTO pos.customer_delivery_settings(singleton) VALUES (true) ON CONFLICT DO NOTHING;
ALTER TABLE pos.customer_delivery_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON pos.customer_delivery_settings FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, UPDATE ON pos.customer_delivery_settings TO service_role;
-- Audit is transactional with the settings update, including previous values.
CREATE TABLE IF NOT EXISTS pos.customer_delivery_settings_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by text NOT NULL,
  old_values jsonb NOT NULL,
  new_values jsonb NOT NULL
);
ALTER TABLE pos.customer_delivery_settings_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON pos.customer_delivery_settings_audit FROM PUBLIC, anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION pos.audit_customer_delivery_settings() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pos AS $$
BEGIN
  IF NEW.updated_by IS NULL OR NEW.updated_by = '' THEN RAISE EXCEPTION 'Staff identity required'; END IF;
  NEW.updated_at := now();
  INSERT INTO pos.customer_delivery_settings_audit(changed_by,old_values,new_values)
  VALUES (NEW.updated_by,to_jsonb(OLD),to_jsonb(NEW));
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION pos.audit_customer_delivery_settings() FROM PUBLIC, anon, authenticated, service_role;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger
    WHERE tgrelid = 'pos.customer_delivery_settings'::regclass
      AND tgname = 'customer_delivery_settings_audit'
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER customer_delivery_settings_audit
      BEFORE UPDATE ON pos.customer_delivery_settings
      FOR EACH ROW EXECUTE FUNCTION pos.audit_customer_delivery_settings();
  END IF;
END;
$$;
NOTIFY pgrst, 'reload schema';
