-- Add the Beans choice group to the two requested drink products.
-- Idempotent: exact existing Beans groups are kept; conflicting groups abort.
DO $migration$
DECLARE
  americano_count integer;
  latte_count integer;
  product_row record;
  current_variations jsonb;
  beans_group jsonb := jsonb_build_object(
    'name', 'Beans',
    'options', jsonb_build_array(
      jsonb_build_object('name', 'Regular Beans', 'price', 0),
      jsonb_build_object('name', 'Seasonal Beans', 'price', 5000)
    )
  );
  existing_count integer;
  existing_group jsonb;
BEGIN
  SELECT count(*) INTO americano_count
  FROM pos.products WHERE name = 'Americano Long Black';
  SELECT count(*) INTO latte_count
  FROM pos.products WHERE name = 'White / Latte / Magic';

  IF americano_count <> 1 OR latte_count <> 1 THEN
    RAISE NOTICE 'Skipping Beans variation migration: target product names are not unique in this catalog.';
    RETURN;
  END IF;

  FOR product_row IN
    SELECT source_id, name, variations
    FROM pos.products
    WHERE name IN ('Americano Long Black', 'White / Latte / Magic')
    ORDER BY name
    FOR UPDATE
  LOOP
    IF product_row.variations IS NOT NULL
       AND jsonb_typeof(product_row.variations) IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Product % has a non-array variations value', product_row.name;
    END IF;

    current_variations := COALESCE(product_row.variations, '[]'::jsonb);
    SELECT count(*) INTO existing_count
    FROM jsonb_array_elements(current_variations) AS item
    WHERE lower(btrim(item->>'name')) = 'beans';

    IF existing_count = 0 THEN
      UPDATE pos.products
      SET variations = current_variations || jsonb_build_array(beans_group)
      WHERE source_id = product_row.source_id;
    ELSIF existing_count = 1 THEN
      SELECT item INTO existing_group
      FROM jsonb_array_elements(current_variations) AS item
      WHERE lower(btrim(item->>'name')) = 'beans';
      IF existing_group IS DISTINCT FROM beans_group THEN
        RAISE EXCEPTION 'Product % already has a different Beans variation', product_row.name;
      END IF;
    ELSE
      RAISE EXCEPTION 'Product % has duplicate Beans variation groups', product_row.name;
    END IF;
  END LOOP;
END
$migration$;
